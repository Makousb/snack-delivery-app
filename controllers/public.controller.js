import { pool } from "../db/index.js";
import { createMessage } from "../db/queries/messages.js";
import { VENDOR_TYPES } from "../utils/vendorTypes.js";

function vendorTypeLabel(vendorType) {
  return VENDOR_TYPES.find((type) => type.value === vendorType)?.label || vendorType;
}

function withVendorTypeLabel(vendor) {
  return { ...vendor, vendor_type_label: vendorTypeLabel(vendor.vendor_type) };
}

export const renderLanding = (req, res) => {
  res.render("landing", {
    title: "Snack Delivery"
  });
};

export const renderHome = async (req, res, next) => {
  try {
    const searchQuery = (req.query.search || "").trim();
    const vendorNotFound = req.query.notFound === "1";
    const [vendorsResult, popularItemsResult] = await Promise.all([
      pool.query("SELECT * FROM vendors ORDER BY name ASC"),
      pool.query(`
        SELECT
          mi.id,
          mi.name,
          mi.description,
          mi.price,
          mi.category,
          mi.image_url,
          mi.vendor_id,
          v.name AS vendor_name
        FROM menu_items mi
        JOIN vendors v ON v.id = mi.vendor_id
        ORDER BY v.name ASC, mi.display_order ASC, mi.id ASC
        LIMIT 10
      `)
    ]);

    res.render("home", {
      title: "Browse Vendors",
      vendors: vendorsResult.rows.map(withVendorTypeLabel),
      vendorTypes: VENDOR_TYPES,
      popularItems: popularItemsResult.rows,
      searchQuery,
      vendorNotFound
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const searchVendors = async (req, res, next) => {
  try {
    const query = (req.query.search || "").trim();

    if (!query) {
      return res.redirect("/home");
    }

    const result = await pool.query(
      `
        SELECT id, name
        FROM vendors
        WHERE LOWER(name) LIKE LOWER($1)
        ORDER BY
          CASE
            WHEN LOWER(name) = LOWER($2) THEN 0
            WHEN LOWER(name) LIKE LOWER($3) THEN 1
            ELSE 2
          END,
          LENGTH(name) ASC,
          name ASC
        LIMIT 1
      `,
      [`%${query}%`, query, `${query}%`]
    );

    const match = result.rows[0];

    if (!match) {
      return res.redirect(`/home?search=${encodeURIComponent(query)}&notFound=1`);
    }

    return res.redirect(`/vendor/${match.id}/menu`);
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const renderMenu = async (req, res, next) => {
  try {
    const { id } = req.params; // vendor ID

    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const offset = (page - 1) * limit;

    const searchQuery = req.query.search || "";
    const selectedCategory = req.query.category || "";

    let baseQuery = "FROM menu_items WHERE vendor_id = $1";
    let values = [id];

    if (searchQuery) {
      values.push(`%${searchQuery}%`);
      baseQuery += ` AND LOWER(name) LIKE LOWER($${values.length})`;
    }

    if (selectedCategory) {
      values.push(selectedCategory);
      baseQuery += ` AND category = $${values.length}`;
    }

    // Fetch items for this vendor
    const itemsResult = await pool.query(
      `SELECT * ${baseQuery} ORDER BY display_order ASC LIMIT ${limit} OFFSET ${offset}`,
      values
    );

    // Count total items for pagination
    const countResult = await pool.query(`SELECT COUNT(*) ${baseQuery}`, values);
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    // Fetch vendor info
    const vendorResult = await pool.query("SELECT * FROM vendors WHERE id = $1", [id]);
    const vendor = vendorResult.rows[0];

    if (!vendor) {
      return res.status(404).render("404", { title: "Vendor Not Found" });
    }

    res.render("menu", {
      title: vendor.name,
      items: itemsResult.rows,
      currentPage: page,
      totalPages,
      searchQuery,
      selectedCategory,
      vendor
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const showVendor = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vendorResult = await pool.query("SELECT * FROM vendors WHERE id = $1", [id]);
    const vendor = vendorResult.rows[0];

    if (!vendor) {
      return res.status(404).render("404", { title: "Vendor Not Found" });
    }

    const menuResult = await pool.query(
      `SELECT * FROM menu_items WHERE vendor_id = $1 ORDER BY display_order ASC LIMIT 3`,
      [id]
    );

    const featuredItems = menuResult.rows;

    res.render("vendor", {
      title: vendor.name,
      vendor: withVendorTypeLabel(vendor),
      featuredItems
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const showContact = (req, res) => {
  res.render("contact", { title: "Contact Us" });
};

export const submitContact = async (req, res, next) => {
  try {
    const name = (req.body.name || "").trim();
    const email = (req.body.email || "").trim();
    const message = (req.body.message || "").trim();

    if (!name || !email || !message) {
      req.flash("error", "Please fill in your name, email, and message.");
      return res.redirect("/contact");
    }

    await createMessage({ name, email, message });

    req.flash("success", "Thanks for reaching out — we'll get back to you soon.");
    return res.redirect("/contact");
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const showAbout = (req, res) => {
  res.render("about", { title: "About Snack" });
};
