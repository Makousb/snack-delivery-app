import { pool } from "../db/index.js";
import { createMessage } from "../db/queries/messages.js";
import { getUsualOrder } from "../db/queries/usualOrder.js";
import {
  getVendorRating,
  getVendorReviews,
  withVendorRatings
} from "../db/queries/reviews.js";
import { VENDOR_TYPES, VENDOR_TYPE_VALUES } from "../utils/vendorTypes.js";

function vendorTypeLabel(vendorType) {
  return VENDOR_TYPES.find((type) => type.value === vendorType)?.label || vendorType;
}

function withVendorTypeLabel(vendor) {
  // Service providers show their specific trade (e.g. "Plumbing") instead
  // of the generic "Service Provider" type label, when they've set one.
  const label =
    vendor.vendor_type === "service_provider" && vendor.service_category
      ? vendor.service_category
      : vendorTypeLabel(vendor.vendor_type);

  return { ...vendor, vendor_type_label: label };
}

export const renderLanding = (req, res) => {
  // Signed-in users skip the marketing page and land in the marketplace —
  // this also makes the installed PWA (start_url "/") open straight into
  // the app for returning users.
  if (req.session.user) {
    return res.redirect("/home");
  }

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

// Orders the customer is still waiting on, shown as a tracking card on the
// home page. Signed-in users get their recent in-progress orders; guests get
// the ones remembered in their session (stored at checkout).
async function getActiveOrders(req) {
  const sessionOrderIds = req.session.activeOrders || [];
  const userId = req.session.user?.id || null;

  if (!userId && sessionOrderIds.length === 0) return [];

  try {
    const condition = userId ? "o.user_id = $1" : "o.id = ANY($1)";
    const params = [userId || sessionOrderIds];

    const result = await pool.query(
      `SELECT o.id, o.status, o.total, o.fulfillment_type, o.scheduled_for,
              v.name AS vendor_name
       FROM orders o
       JOIN vendors v ON v.id = o.vendor_id
       WHERE ${condition}
         AND o.status NOT IN ('Completed', 'Payment Failed')
         AND o.created_at > NOW() - INTERVAL '1 day'
       ORDER BY o.created_at DESC
       LIMIT 2`,
      params
    );

    return result.rows;
  } catch (error) {
    console.error("Failed to load active orders:", error.message);
    return [];
  }
}

export const renderHome = async (req, res, next) => {
  try {
    const searchQuery = (req.query.search || "").trim();
    // Street vendors and service providers get their own dedicated sections
    // (/street-vendors, /services) rather than mixing into the main food
    // and grocery home page.
    const homeExcludedTypes = "('street_vendor', 'service_provider')";
    const [vendorsResult, popularItemsResult] = await Promise.all([
      pool.query(`SELECT * FROM vendors WHERE vendor_type NOT IN ${homeExcludedTypes} ORDER BY name ASC`),
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
        WHERE v.vendor_type NOT IN ${homeExcludedTypes}
        ORDER BY v.name ASC, mi.display_order ASC, mi.id ASC
      `)
    ]);

    const vendors = await withVendorRatings(vendorsResult.rows.map(withVendorTypeLabel));
    const popularItems = popularItemsResult.rows;

    const vendorSections = VENDOR_TYPES
      .filter((type) => !["street_vendor", "service_provider"].includes(type.value))
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
      activeOrders: await getActiveOrders(req)
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

// Dedicated home-services section: plumbers, cleaners, caterers, and other
// bookable providers, kept separate from the food/grocery marketplace.
export const renderServices = async (req, res, next) => {
  try {
    const [vendorsResult, itemsResult] = await Promise.all([
      pool.query("SELECT * FROM vendors WHERE vendor_type = 'service_provider' ORDER BY name ASC"),
      pool.query(`
        SELECT mi.id, mi.name, mi.description, mi.price, mi.category, mi.image_url, mi.vendor_id, v.name AS vendor_name
        FROM menu_items mi
        JOIN vendors v ON v.id = mi.vendor_id
        WHERE v.vendor_type = 'service_provider'
        ORDER BY v.name ASC, mi.display_order ASC, mi.id ASC
      `)
    ]);

    const vendors = await withVendorRatings(vendorsResult.rows.map(withVendorTypeLabel));
    const items = itemsResult.rows.map((item) => ({ ...item, price: Number(item.price) }));

    const itemsByVendor = items.reduce((groups, item) => {
      const key = String(item.vendor_id);
      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    }, {});

    // Category chips are built from whatever providers have actually set —
    // an open-ended list, not a fixed enum.
    const categories = [...new Set(vendors.map((vendor) => vendor.service_category).filter(Boolean))].sort();

    res.render("services", {
      title: "Home Services",
      vendors,
      itemsByVendor,
      categories
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

// Global search across menu items (name/description/category) AND vendor names,
// so a customer can search for a dish ("pizza") and see matching items from
// every vendor, not just vendors whose name matches. Best (exact, then
// prefix, then contains) matches are ordered first.
export const searchResults = async (req, res, next) => {
  try {
    const query = (req.query.search || req.query.q || "").trim();

    if (!query) {
      return res.redirect("/home");
    }

    // Optional filters/sort. Whitelisted so they can be dropped straight into
    // the SQL without injection risk.
    const type = VENDOR_TYPE_VALUES.includes(req.query.type) ? req.query.type : "";
    const category = (req.query.category || "").trim();
    const sort = ["price_asc", "price_desc", "rating"].includes(req.query.sort)
      ? req.query.sort
      : "relevance";

    const contains = `%${query}%`;
    const prefix = `${query}%`;

    // --- Items query (name/description/category match, plus optional filters) ---
    // $2/$3 (exact/prefix ranking) are only referenced by the relevance sort,
    // so bind them only then — pg rejects extra, unused parameters.
    const itemParams = [contains];
    let itemWhere =
      `mi.status = 'Available'
       AND (LOWER(mi.name) LIKE LOWER($1)
            OR LOWER(mi.description) LIKE LOWER($1)
            OR LOWER(mi.category) LIKE LOWER($1))`;

    let itemOrder;
    if (sort === "price_asc") {
      itemOrder = "mi.price ASC, mi.name ASC";
    } else if (sort === "price_desc") {
      itemOrder = "mi.price DESC, mi.name ASC";
    } else {
      itemParams.push(query, prefix); // $2, $3
      itemOrder =
        `CASE
           WHEN LOWER(mi.name) = LOWER($2) THEN 0
           WHEN LOWER(mi.name) LIKE LOWER($3) THEN 1
           ELSE 2
         END, mi.name ASC`;
    }

    if (type) {
      itemParams.push(type);
      itemWhere += ` AND v.vendor_type = $${itemParams.length}`;
    }
    if (category) {
      itemParams.push(category);
      itemWhere += ` AND mi.category = $${itemParams.length}`;
    }

    // --- Vendors query (name match, optional type filter) ---
    const vendorParams = [contains, query, prefix];
    let vendorWhere = "LOWER(name) LIKE LOWER($1)";
    if (type) {
      vendorParams.push(type);
      vendorWhere += ` AND vendor_type = $${vendorParams.length}`;
    }

    const [itemsResult, vendorsResult] = await Promise.all([
      pool.query(
        `SELECT mi.id, mi.name, mi.description, mi.price, mi.image_url, mi.category,
                v.id AS vendor_id, v.name AS vendor_name, v.vendor_type
         FROM menu_items mi
         JOIN vendors v ON v.id = mi.vendor_id
         WHERE ${itemWhere}
         ORDER BY ${itemOrder}
         LIMIT 60`,
        itemParams
      ),
      pool.query(
        `SELECT *
         FROM vendors
         WHERE ${vendorWhere}
         ORDER BY
           CASE
             WHEN LOWER(name) = LOWER($2) THEN 0
             WHEN LOWER(name) LIKE LOWER($3) THEN 1
             ELSE 2
           END,
           name ASC
         LIMIT 12`,
        vendorParams
      )
    ]);

    const items = itemsResult.rows.map((item) => ({
      ...item,
      price: Number(item.price),
      vendor_type_label: vendorTypeLabel(item.vendor_type)
    }));

    let vendors = await withVendorRatings(vendorsResult.rows.map(withVendorTypeLabel));
    if (sort === "rating") {
      vendors = vendors
        .slice()
        .sort((a, b) => (b.rating_average || 0) - (a.rating_average || 0));
    }

    res.render("search", {
      title: `Search: ${query}`,
      query,
      items,
      vendors,
      filters: { type, category, sort }
    });
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
