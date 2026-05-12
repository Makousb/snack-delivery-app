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


// -----------------------------------
// 🔒 ENSURE RESTAURANT EXISTS
// -----------------------------------
async function ensureRestaurant() {
  // Check if restaurant with ID 1 exists
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


// ---------------------
// Admin Dashboard
// ---------------------
export async function adminDashboard(req, res) {
  try {
    const restaurantId =
      req.user?.restaurant_id || await ensureRestaurant();

    const menuItems = await getAllMenuItems(restaurantId);
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

    const dashboard = {
      inventoryHealth: totalItems ? Math.round((availableItems / totalItems) * 100) : 0,
      orderStatusBreakdown: {
        pendingPayment: orders.filter((order) => order.status === "Pending Payment").length,
        cashPending: orders.filter((order) => order.status === "Cash Pending").length,
        paid: orders.filter((order) => order.status === "Paid").length,
        preparing: orders.filter((order) => order.status === "Preparing").length,
        completed: completedOrders.length
      },
      driverStatuses: [
        { name: "Rider 01", status: "On delivery", zone: "Central", orders: 2 },
        { name: "Rider 07", status: "Ready", zone: "Westside", orders: 0 },
        { name: "Rider 12", status: "Returning", zone: "North Hub", orders: 1 }
      ],
      deliveryRate: Math.max(82, Math.round(completionRate || 0)),
      accuracyRate: totalItems ? Math.min(99, 92 + availableItems) : 93,
      csat: orders.length ? (4.4 + Math.min(0.5, orders.length * 0.03)).toFixed(1) : "4.6",
      complaintRate: orders.length ? Math.max(1.2, 6 - completedOrders.length * 0.25).toFixed(1) : "2.4",
      revenueToday,
      revenueWeek,
      averageServiceTime: `${18 + Math.min(12, activeOrders.length * 2)} min`,
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
      restaurantId
    });

  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
  }
}


// ---------------------
// Show Create Menu Form
// ---------------------
export function newMenuForm(req, res) {
  res.render("admin/menu", {
    title: "Add Menu Item"
  });
}


// ---------------------
// Edit Menu Form
// ---------------------
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


// ---------------------
// Create Menu Item
// ---------------------
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


// ---------------------
// Update Menu Item
// ---------------------
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

      // Delete old image
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


// ---------------------
// Delete Menu Item
// ---------------------
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


// ---------------------
// Update Menu Order
// ---------------------
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


// ---------------------
// Toggle Menu Status
// ---------------------
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
