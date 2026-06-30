import { pool } from "../db/index.js";
import { createMessage } from "../db/queries/messages.js";
import { getUsualOrder } from "../db/queries/usualOrder.js";
import {
  getVendorRating,
  getVendorReviews,
  withVendorRatings
} from "../db/queries/reviews.js";
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

export const renderDriverLanding = (req, res) => {
  res.render("landing-driver", {
    title: "Drive with Snack"
  });
};

export const renderVendorLanding = (req, res) => {
  res.render("landing-vendor", {
    title: "Sell on Snack"
  });
};

export const renderHome = async (req, res, next) => {
  try {
    const searchQuery = (req.query.search || "").trim();
    const vendorNotFound = req.query.notFound === "1";
    const [vendorsResult, popularItemsResult] = await Promise.all([
      pool.query("SELECT * FROM vendors WHERE vendor_type != 'street_vendor' ORDER BY name ASC"),
      pool.query(`
        SELECT
          mi.id,
          mi.name,
          mi.description,
          mi.price,
          mi.category,
          mi.image_url,
          mi.vendor_id,
          v.name AS vendor_name,
          v.vendor_type
        FROM menu_items mi
        JOIN vendors v ON v.id = mi.vendor_id
        WHERE v.vendor_type != 'street_vendor'
        ORDER BY v.name ASC, mi.display_order ASC, mi.id ASC
      `)
    ]);

    const vendors = await withVendorRatings(vendorsResult.rows.map(withVendorTypeLabel));
    const popularItems = popularItemsResult.rows;

    const vendorSections = VENDOR_TYPES
      .filter((type) => type.value !== "street_vendor")
      .map((type) => ({
        value: type.value,
        vendors: vendors.filter((vendor) => vendor.vendor_type === type.value),
        popularItems: popularItems.filter((item) => item.vendor_type === type.value).slice(0, 8)
      }));

    const usualOrder = req.session.user
      ? await getUsualOrder(req.session.user.id)
      : null;

    res.render("home", {
      title: "Browse Vendors",
      vendors,
      popularItems,
      vendorSections,
      usualOrder,
      searchQuery,
      vendorNotFound
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const renderStreetVendors = async (req, res, next) => {
  try {
    const [vendorsResult, itemsResult] = await Promise.all([
      pool.query("SELECT * FROM vendors WHERE vendor_type = 'street_vendor' ORDER BY name ASC"),
      pool.query(`
        SELECT mi.id, mi.name, mi.description, mi.price, mi.category, mi.image_url, mi.vendor_id, v.name AS vendor_name
        FROM menu_items mi
        JOIN vendors v ON v.id = mi.vendor_id
        WHERE v.vendor_type = 'street_vendor'
        ORDER BY mi.name ASC, mi.price ASC
      `)
    ]);

    const vendors = vendorsResult.rows.map((vendor) => ({
      ...withVendorTypeLabel(vendor),
      latitude: vendor.latitude !== null ? Number(vendor.latitude) : null,
      longitude: vendor.longitude !== null ? Number(vendor.longitude) : null
    }));

    const items = itemsResult.rows.map((item) => ({ ...item, price: Number(item.price) }));

    const itemsByVendor = items.reduce((groups, item) => {
      const key = String(item.vendor_id);
      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    }, {});

    const itemsByName = items.reduce((groups, item) => {
      const key = item.name.trim().toLowerCase();
      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    }, {});

    const priceComparisons = Object.values(itemsByName)
      .filter((group) => new Set(group.map((item) => item.vendor_id)).size > 1)
      .map((group) => {
        const entries = [...group].sort((a, b) => a.price - b.price);
        return { name: entries[0].name, entries };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.render("street-vendors", {
      title: "Street Vendors",
      vendors,
      itemsByVendor,
      priceComparisons
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const renderAllVendors = async (req, res, next) => {
  try {
    const vendorsResult = await pool.query("SELECT * FROM vendors ORDER BY name ASC");
    const vendors = await withVendorRatings(vendorsResult.rows.map(withVendorTypeLabel));

    const vendorSections = VENDOR_TYPES.map((type) => ({
      value: type.value,
      vendors: vendors.filter((vendor) => vendor.vendor_type === type.value)
    }));

    res.render("vendors", {
      title: "All Vendors",
      vendorSections
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

    const rating = await getVendorRating(id);
    vendor.rating_average = rating.average;
    vendor.rating_count = rating.count;

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

    const rating = await getVendorRating(id);
    const reviews = await getVendorReviews(id, 8);

    res.render("vendor", {
      title: vendor.name,
      vendor: {
        ...withVendorTypeLabel(vendor),
        rating_average: rating.average,
        rating_count: rating.count
      },
      featuredItems,
      reviews
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
