import fs from "fs";
import path from "path";
import { pool } from "../db/index.js";

import {
  getAllMenuItems,
  getMenuItemById,
  updateMenuItem,
  deleteMenuItem,
  createMenuItem
} from "../db/queries/menu.js";
import { getAllMessages, markMessageRead } from "../db/queries/messages.js";
import { buildUniqueRestaurantSlug } from "../utils/slugify.js";

function getFilePath(file) {
  return file ? `/images/${file.filename}` : null;
}

// Fallback for sessions without a restaurant_id (e.g. the loosely-defined
// "admin" role, which isn't tied to a specific restaurant at signup).
async function ensureRestaurant() {
  const result = await pool.query(
    "SELECT id FROM restaurants WHERE id = 1"
  );

  if (result.rows.length === 0) {
    const insert = await pool.query(
      "INSERT INTO restaurants (name) VALUES ($1) RETURNING id",
      ["Default Restaurant"]
    );

    return insert.rows[0].id;
  }

  return 1;
}

export async function adminDashboard(req, res) {
  try {
    const currentUser = req.user || req.session?.user;
    const restaurantId =
      currentUser?.restaurant_id || await ensureRestaurant();

    const menuItems = await getAllMenuItems(restaurantId);
    const restaurantResult = await pool.query(
      "SELECT * FROM restaurants WHERE id = $1",
      [restaurantId]
    );
    const ordersResult = await pool.query(
      `SELECT id, total, status, created_at
       FROM orders
       WHERE restaurant_id = $1
       ORDER BY created_at DESC`,
      [restaurantId]
    );
    const orders = ordersResult.rows;

    const totalItems = menuItems.length;
    const availableItems = menuItems.filter((item) => item.status === "Available").length;
    const soldOutItems = menuItems.filter((item) => item.status === "Sold Out").length;
    const seasonalItems = menuItems.filter((item) => item.status === "Seasonal").length;
    const lowStockItems = menuItems.filter((item) => item.status !== "Available").length;
    const averagePrice = totalItems
      ? menuItems.reduce((sum, item) => sum + Number(item.price || 0), 0) / totalItems
      : 0;
    const activeOrders = orders.filter((order) =>
      ["Pending", "Pending Payment", "Cash Pending", "Paid", "Preparing"].includes(order.status)
    );
    const completedOrders = orders.filter((order) => order.status === "Completed");
    const revenueToday = orders
      .filter((order) => {
        const created = new Date(order.created_at);
        const now = new Date();
        return created.toDateString() === now.toDateString();
      })
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const revenueWeek = orders
      .filter((order) => {
        const created = new Date(order.created_at);
        const now = new Date();
        const diffDays = (now - created) / (1000 * 60 * 60 * 24);
        return diffDays <= 7;
      })
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const averageOrderValue = orders.length
      ? orders.reduce((sum, order) => sum + Number(order.total || 0), 0) / orders.length
      : 0;
    const completionRate = orders.length
      ? (completedOrders.length / orders.length) * 100
      : 0;

    const driverStatusesResult = await pool.query(
      `SELECT
         u.full_name,
         u.email,
         d.status,
         d.current_location,
         COUNT(del.id) AS active_jobs
       FROM deliveries del
       JOIN orders o ON o.id = del.order_id
       JOIN drivers d ON d.id = del.driver_id
       JOIN users u ON u.id = d.user_id
       WHERE o.restaurant_id = $1
         AND del.status <> 'Delivered'
       GROUP BY u.full_name, u.email, d.status, d.current_location
       ORDER BY active_jobs DESC
       LIMIT 5`,
      [restaurantId]
    );

    const serviceTimeResult = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (d.completed_at - d.accepted_at)) / 60) AS avg_minutes
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE o.restaurant_id = $1
         AND d.completed_at IS NOT NULL
         AND d.accepted_at IS NOT NULL`,
      [restaurantId]
    );

    const averageServiceMinutes = serviceTimeResult.rows[0]?.avg_minutes;

    const dashboard = {
      inventoryHealth: totalItems ? Math.round((availableItems / totalItems) * 100) : 0,
      orderStatusBreakdown: {
        pendingPayment: orders.filter((order) => order.status === "Pending Payment").length,
        cashPending: orders.filter((order) => order.status === "Cash Pending").length,
        paid: orders.filter((order) => order.status === "Paid").length,
        preparing: orders.filter((order) => order.status === "Preparing").length,
        completed: completedOrders.length
      },
      driverStatuses: driverStatusesResult.rows.map((driver) => ({
        name: driver.full_name || driver.email,
        status: driver.status,
        location: driver.current_location || "Unknown",
        activeJobs: Number(driver.active_jobs)
      })),
      deliveryRate: Math.round(completionRate || 0),
      revenueToday,
      revenueWeek,
      averageServiceTime: averageServiceMinutes
        ? `${Math.round(averageServiceMinutes)} min`
        : null,
      averageOrderValue,
      activeOrdersCount: activeOrders.length,
      totalOrders: orders.length,
      lowStockItems,
      averagePrice,
      totalItems,
      availableItems,
      soldOutItems,
      seasonalItems
    };

    res.render("admin/dashboard", {
      title: "Admin Dashboard",
      menuItems,
      orders,
      dashboard,
      restaurant: restaurantResult.rows[0] || null,
      restaurantId
    });

  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
  }
}

export async function businessProfileForm(req, res) {
  try {
    const restaurantId =
      req.user?.restaurant_id || await ensureRestaurant();

    const restaurantResult = await pool.query(
      "SELECT * FROM restaurants WHERE id = $1",
      [restaurantId]
    );

    const restaurant = restaurantResult.rows[0];

    if (!restaurant) {
      req.flash("error", "Business profile not found");
      return res.redirect("/admin");
    }

    res.render("admin/profile", {
      title: "Edit Business Profile",
      restaurant,
      accountEmail: req.user?.email || ""
    });

  } catch (error) {
    console.error(error);
    res.status(500).render("500", {
      title: "Server Error"
    });
  }
}

export async function updateBusinessProfile(req, res) {
  const client = await pool.connect();

  try {
    const restaurantId =
      req.user?.restaurant_id || await ensureRestaurant();
    const userId = req.user?.id;
    const {
      businessName,
      businessDescription,
      email
    } = req.body;

    const safeName = (businessName || "").trim();
    const safeDescription = (businessDescription || "").trim();
    const safeEmail = (email || "").trim().toLowerCase();

    if (!userId) {
      req.flash("error", "Please log in first");
      return res.redirect("/auth/login");
    }

    if (!safeName || !safeEmail) {
      req.flash("error", "Business name and email are required.");
      return res.redirect("/admin/profile");
    }

    await client.query("BEGIN");

    const restaurantResult = await client.query(
      "SELECT * FROM restaurants WHERE id = $1 FOR UPDATE",
      [restaurantId]
    );

    const restaurant = restaurantResult.rows[0];

    if (!restaurant) {
      await client.query("ROLLBACK");
      req.flash("error", "Business profile not found");
      return res.redirect("/admin");
    }

    const duplicateEmail = await client.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1",
      [safeEmail, userId]
    );

    if (duplicateEmail.rows.length) {
      await client.query("ROLLBACK");
      req.flash("error", "That email is already registered.");
      return res.redirect("/admin/profile");
    }

    const logoUrl =
      getFilePath(req.files?.businessLogo?.[0]) || restaurant.logo_url;
    const bannerUrl =
      getFilePath(req.files?.businessBanner?.[0]) || restaurant.banner_url;
    const slug = await buildUniqueRestaurantSlug(client, safeName, restaurantId);

    await client.query(
      `UPDATE restaurants
       SET name = $1,
           description = $2,
           logo_url = $3,
           banner_url = $4,
           slug = $5
       WHERE id = $6`,
      [
        safeName,
        safeDescription || null,
        logoUrl,
        bannerUrl,
        slug,
        restaurantId
      ]
    );

    const userResult = await client.query(
      `UPDATE users
       SET email = $1
       WHERE id = $2
       RETURNING id, email, role, restaurant_id, full_name`,
      [safeEmail, userId]
    );

    await client.query("COMMIT");

    req.session.user = {
      ...req.session.user,
      ...userResult.rows[0]
    };

    req.flash("success", "Business profile updated.");
    res.redirect("/admin/profile");

  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    req.flash("error", "We could not update that business profile right now.");
    res.redirect("/admin/profile");
  } finally {
    client.release();
  }
}

export function newMenuForm(req, res) {
  res.render("admin/menu", {
    title: "Add Menu Item"
  });
}

export async function editMenuForm(req, res) {
  try {
    const { id } = req.params;
    const restaurantId =
      req.user?.restaurant_id || await ensureRestaurant();

    const menuItem = await getMenuItemById(id, restaurantId);

    if (!menuItem) {
      req.flash("error", "Menu item not found");
      return res.redirect("/admin");
    }

    res.render("admin/edit", {
      title: "Edit Menu Item",
      menuItem
    });

  } catch (error) {
    console.error(error);
    res.status(500).render("500", {
      title: "Server Error"
    });
  }
}

export async function addMenuItem(req, res) {
  try {
    const { name, description, price, category, status } = req.body;

    const restaurantId =
      req.user?.restaurant_id || await ensureRestaurant();

    const image_url = req.file
      ? `/images/${req.file.filename}`
      : null;

    await createMenuItem({
      name,
      description,
      price,
      category,
      image_url,
      status: status || "Available",
      restaurant_id: restaurantId
    });

    req.flash("success", "Menu item added successfully");
    res.redirect("/admin");

  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
  }
}

export async function updateMenu(req, res) {
  try {
    const { name, description, price, category, status } = req.body;

    const restaurantId =
      req.user?.restaurant_id || await ensureRestaurant();

    const existingItem = await getMenuItemById(
      req.params.id,
      restaurantId
    );

    if (!existingItem) {
      req.flash("error", "Menu item not found");
      return res.redirect("/admin");
    }

    let image_url = existingItem.image_url;

    if (req.file) {
      image_url = `/images/${req.file.filename}`;

      if (existingItem.image_url) {
        const oldImagePath = path.join(
          process.cwd(),
          "public",
          existingItem.image_url
        );

        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }

    await updateMenuItem(req.params.id, {
      name,
      description,
      price,
      category,
      status,
      image_url,
      restaurant_id: restaurantId
    });

    req.flash("success", "Menu item updated");
    res.redirect("/admin");

  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
  }
}

export async function deleteMenu(req, res) {
  try {
    const restaurantId =
      req.user?.restaurant_id || await ensureRestaurant();

    const item = await getMenuItemById(
      req.params.id,
      restaurantId
    );

    if (!item) {
      req.flash("error", "Menu item not found");
      return res.redirect("/admin");
    }

    if (item.image_url) {
      const imagePath = path.join(
        process.cwd(),
        "public",
        item.image_url
      );

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await deleteMenuItem(req.params.id, restaurantId);

    req.flash("success", "Menu item deleted");
    res.redirect("/admin");

  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
  }
}

export async function updateMenuOrder(req, res) {
  try {
    const { order } = req.body;

    const restaurantId =
      req.user?.restaurant_id || await ensureRestaurant();

    for (let i = 0; i < order.length; i++) {
      await pool.query(
        `UPDATE menu_items
         SET display_order = $1
         WHERE id = $2 AND restaurant_id = $3`,
        [i, order[i], restaurantId]
      );
    }

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
}

export async function toggleMenuStatus(req, res) {
  try {
    const { id } = req.params;

    const restaurantId =
      req.user?.restaurant_id || await ensureRestaurant();

    const item = await getMenuItemById(id, restaurantId);

    if (!item) {
      return res.status(404).json({ success: false });
    }

    let newStatus;

    if (item.status === "Available") {
      newStatus = "Sold Out";
    } else if (item.status === "Sold Out") {
      newStatus = "Seasonal";
    } else {
      newStatus = "Available";
    }

    await updateMenuItem(id, {
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      image_url: item.image_url,
      status: newStatus,
      restaurant_id: restaurantId
    });

    res.json({
      success: true,
      status: newStatus
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
}

export async function listMessages(req, res) {
  try {
    const messages = await getAllMessages();

    res.render("admin/messages", {
      title: "Contact Messages",
      messages
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
  }
}

export async function markMessageReadHandler(req, res) {
  try {
    await markMessageRead(req.params.id);
    res.redirect("/admin/messages");
  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
  }
}
