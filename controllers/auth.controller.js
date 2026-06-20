import bcrypt from "bcrypt";
import { pool } from "../db/index.js";
import { getUserByEmail } from "../db/queries/users.js";
import { buildUniqueRestaurantSlug } from "../utils/slugify.js";

function getRedirectPathForRole(role) {
  if (role === "driver") return "/driver";
  if (role === "owner" || role === "admin") return "/admin";
  return "/home";
}

function getFilePath(file) {
  return file ? `/images/${file.filename}` : null;
}

export function showSignup(req, res) {
  res.render("auth/signup", { title: "Create Account" });
}

export async function signup(req, res) {
  const client = await pool.connect();

  try {
    const {
      accountType,
      fullName,
      email,
      password,
      restaurantName,
      restaurantDescription,
      phone,
      vehicleType,
      licenseNumber
    } = req.body;

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
      const safeRestaurantName = (restaurantName || "").trim();

      if (!safeRestaurantName) {
        throw new Error("Restaurant name is required for business accounts.");
      }

      const slug = await buildUniqueRestaurantSlug(client, safeRestaurantName);
      const logoUrl = getFilePath(req.files?.businessLogo?.[0]);
      const bannerUrl = getFilePath(req.files?.businessBanner?.[0]);

      const restaurantResult = await client.query(
        `INSERT INTO restaurants (name, description, logo_url, banner_url, slug)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          safeRestaurantName,
          (restaurantDescription || "").trim() || null,
          logoUrl,
          bannerUrl,
          slug
        ]
      );

      const restaurantId = restaurantResult.rows[0].id;
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, restaurant_id, full_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, role, restaurant_id, full_name`,
        [email, passwordHash, "owner", restaurantId, safeFullName || null]
      );

      const user = userResult.rows[0];

      await client.query(
        "UPDATE restaurants SET owner_id = $1 WHERE id = $2",
        [user.id, restaurantId]
      );

      await client.query("COMMIT");

      req.session.user = user;
      req.flash("success", "Business account created.");
      return res.redirect("/admin");
    }

    if (normalizedRole === "customer") {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, role, restaurant_id, full_name`,
        [email, passwordHash, "customer", safeFullName || null]
      );

      const user = userResult.rows[0];

      await client.query("COMMIT");

      req.session.user = user;
      req.flash("success", "Customer account created.");
      return res.redirect("/home");
    }

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role, full_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, role, restaurant_id, full_name`,
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
    const { email, password } = req.body;

    const user = await getUserByEmail(email);

    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/auth/login");
    }

    const match = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!match) {
      req.flash("error", "Invalid password.");
      return res.redirect("/auth/login");
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      restaurant_id: user.restaurant_id,
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
