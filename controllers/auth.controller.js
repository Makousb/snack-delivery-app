import bcrypt from "bcrypt";
import { pool } from "../db/index.js";
import { getUserByEmail } from "../db/queries/users.js";
import { buildUniqueVendorSlug } from "../utils/slugify.js";
import { VENDOR_TYPES, VENDOR_TYPE_VALUES, SERVICE_CATEGORY_SUGGESTIONS } from "../utils/vendorTypes.js";

function getRedirectPathForRole(role) {
  if (role === "driver") return "/driver";
  if (role === "owner" || role === "admin") return "/admin";
  return "/home";
}

function getFilePath(file) {
  return file ? `/images/${file.filename}` : null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// Basic shared validation for the credential endpoints. Returns an error
// string to flash, or null when the input is acceptable.
function validateCredentials(email, password) {
  if (!EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return null;
}

// Logging a user in or signing them up issues a fresh session id, which
// prevents session-fixation (an attacker can't pre-seed a victim's cookie and
// inherit the authenticated session). The flash queue and any guest cart live
// in the session, so we carry them across the regenerated session.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    const { flash, cart } = req.session;

    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      if (flash) req.session.flash = flash;
      if (cart) req.session.cart = cart;

      resolve();
    });
  });
}

export function showSignup(req, res) {
  res.render("auth/signup", {
    title: "Create Account",
    vendorTypes: VENDOR_TYPES,
    serviceCategorySuggestions: SERVICE_CATEGORY_SUGGESTIONS
  });
}

export async function signup(req, res) {
  const client = await pool.connect();

  try {
    const {
      accountType,
      fullName,
      email: rawEmail,
      password,
      businessName,
      businessDescription,
      vendorType,
      serviceCategory,
      phone,
      vehicleType,
      licenseNumber
    } = req.body;

    const email = (rawEmail || "").trim().toLowerCase();

    const validationError = validateCredentials(email, password);

    if (validationError) {
      req.flash("error", validationError);
      return res.redirect("/auth/signup");
    }

    const normalizedRole =
      accountType === "driver"
        ? "driver"
        : accountType === "owner"
          ? "owner"
          : "customer";
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      req.flash("error", "That email is already registered.");
      return res.redirect("/auth/signup");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const safeFullName = (fullName || "").trim();

    await client.query("BEGIN");

    if (normalizedRole === "owner") {
      const safeBusinessName = (businessName || "").trim();
      const safeVendorType = VENDOR_TYPE_VALUES.includes(vendorType)
        ? vendorType
        : VENDOR_TYPE_VALUES[0];

      if (!safeBusinessName) {
        throw new Error("Business name is required for business accounts.");
      }

      const slug = await buildUniqueVendorSlug(client, safeBusinessName);
      const logoUrl = getFilePath(req.files?.businessLogo?.[0]);
      const bannerUrl = getFilePath(req.files?.businessBanner?.[0]);

      const vendorResult = await client.query(
        `INSERT INTO vendors (name, vendor_type, description, logo_url, banner_url, slug, service_category)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          safeBusinessName,
          safeVendorType,
          (businessDescription || "").trim() || null,
          logoUrl,
          bannerUrl,
          slug,
          safeVendorType === "service_provider" ? (serviceCategory || "").trim() || null : null
        ]
      );

      const vendorId = vendorResult.rows[0].id;
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, vendor_id, full_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, role, vendor_id, full_name`,
        [email, passwordHash, "owner", vendorId, safeFullName || null]
      );

      const user = userResult.rows[0];

      await client.query(
        "UPDATE vendors SET owner_id = $1 WHERE id = $2",
        [user.id, vendorId]
      );

      await client.query("COMMIT");

      await regenerateSession(req);
      req.session.user = user;
      req.flash("success", "Business account created.");
      return res.redirect("/admin");
    }

    if (normalizedRole === "customer") {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, role, vendor_id, full_name`,
        [email, passwordHash, "customer", safeFullName || null]
      );

      const user = userResult.rows[0];

      await client.query("COMMIT");

      await regenerateSession(req);
      req.session.user = user;
      req.flash("success", "Customer account created.");
      return res.redirect("/home");
    }

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role, full_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, role, vendor_id, full_name`,
      [email, passwordHash, "driver", safeFullName || null]
    );

    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO drivers (user_id, phone, vehicle_type, license_number, current_location)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        (phone || "").trim() || null,
        (vehicleType || "").trim() || null,
        (licenseNumber || "").trim() || null,
        "Awaiting first delivery"
      ]
    );

    await client.query("COMMIT");

    await regenerateSession(req);
    req.session.user = user;
    req.flash("success", "Driver account created.");
    return res.redirect("/driver");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    req.flash("error", "We could not create that account right now.");
    return res.redirect("/auth/signup");
  } finally {
    client.release();
  }
}

export function showLogin(req, res) {
  res.render("auth/login", { title: "Login" });
}

export async function login(req, res) {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const { password } = req.body;

    const user = await getUserByEmail(email);

    // A single generic message for both "no such user" and "wrong password"
    // so the form can't be used to enumerate which emails have accounts.
    const invalidCredentials = () => {
      req.flash("error", "Invalid email or password.");
      return res.redirect("/auth/login");
    };

    if (!user) {
      return invalidCredentials();
    }

    const match = await bcrypt.compare(
      password || "",
      user.password_hash
    );

    if (!match) {
      return invalidCredentials();
    }

    await regenerateSession(req);

    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      vendor_id: user.vendor_id,
      full_name: user.full_name || null
    };

    return res.redirect(getRedirectPathForRole(user.role));
  } catch (error) {
    console.error(error);
    req.flash("error", "Login error.");
    return res.redirect("/auth/login");
  }
}

export function logout(req, res) {
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
}
