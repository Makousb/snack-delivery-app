import { pool } from "../db/index.js";
import { createMessage } from "../db/queries/messages.js";

export const renderLanding = (req, res) => {
  res.render("landing", {
    title: "Snack Delivery"
  });
};

export const renderHome = async (req, res, next) => {
  try {
    const searchQuery = (req.query.search || "").trim();
    const restaurantNotFound = req.query.notFound === "1";
    const [restaurantsResult, popularItemsResult] = await Promise.all([
      pool.query("SELECT * FROM restaurants ORDER BY name ASC"),
      pool.query(`
        SELECT
          mi.id,
          mi.name,
          mi.description,
          mi.price,
          mi.category,
          mi.image_url,
          mi.restaurant_id,
          r.name AS restaurant_name
        FROM menu_items mi
        JOIN restaurants r ON r.id = mi.restaurant_id
        ORDER BY r.name ASC, mi.display_order ASC, mi.id ASC
        LIMIT 10
      `)
    ]);

    res.render("home", {
      title: "Browse Restaurants",
      restaurants: restaurantsResult.rows,
      popularItems: popularItemsResult.rows,
      searchQuery,
      restaurantNotFound
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const searchRestaurant = async (req, res, next) => {
  try {
    const query = (req.query.search || "").trim();

    if (!query) {
      return res.redirect("/home");
    }

    const result = await pool.query(
      `
        SELECT id, name
        FROM restaurants
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

    return res.redirect(`/restaurant/${match.id}/menu`);
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const renderMenu = async (req, res, next) => {
  try {
    const { id } = req.params; // restaurant ID

    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const offset = (page - 1) * limit;

    const searchQuery = req.query.search || "";
    const selectedCategory = req.query.category || "";

    let baseQuery = "FROM menu_items WHERE restaurant_id = $1";
    let values = [id];

    if (searchQuery) {
      values.push(`%${searchQuery}%`);
      baseQuery += ` AND LOWER(name) LIKE LOWER($${values.length})`;
    }

    if (selectedCategory) {
      values.push(selectedCategory);
      baseQuery += ` AND category = $${values.length}`;
    }

    // Fetch menu items for this restaurant
    const itemsResult = await pool.query(
      `SELECT * ${baseQuery} ORDER BY display_order ASC LIMIT ${limit} OFFSET ${offset}`,
      values
    );

    // Count total items for pagination
    const countResult = await pool.query(`SELECT COUNT(*) ${baseQuery}`, values);
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    // Fetch restaurant info
    const restaurantResult = await pool.query("SELECT * FROM restaurants WHERE id = $1", [id]);
    const restaurant = restaurantResult.rows[0];

    if (!restaurant) {
      return res.status(404).render("404", { title: "Restaurant Not Found" });
    }

    res.render("menu", {
      title: restaurant.name,
      items: itemsResult.rows,
      currentPage: page,
      totalPages,
      searchQuery,
      selectedCategory,
      restaurant
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const showRestaurant = async (req, res, next) => {
  try {
    const { id } = req.params;

    const restaurantResult = await pool.query("SELECT * FROM restaurants WHERE id = $1", [id]);
    const restaurant = restaurantResult.rows[0];

    if (!restaurant) {
      return res.status(404).render("404", { title: "Restaurant Not Found" });
    }

    const menuResult = await pool.query(
      `SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY display_order ASC LIMIT 3`,
      [id]
    );

    const featuredItems = menuResult.rows;

    res.render("restaurant", {
      title: restaurant.name,
      restaurant,
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
