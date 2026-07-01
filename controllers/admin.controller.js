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
import { getReviewsForVendor, addOwnerReply } from "../db/queries/reviews.js";
import { buildUniqueVendorSlug } from "../utils/slugify.js";
import { VENDOR_TYPES, VENDOR_TYPE_VALUES } from "../utils/vendorTypes.js";

function getFilePath(file) {
  return file ? `/images/${file.filename}` : null;
}

// Fallback for sessions without a vendor_id (e.g. the loosely-defined
// "admin" role, which isn't tied to a specific vendor at signup).
async function ensureVendor() {
  const result = await pool.query(
    "SELECT id FROM vendors WHERE id = 1"
  );

  if (result.rows.length === 0) {
    const insert = await pool.query(
      "INSERT INTO vendors (name) VALUES ($1) RETURNING id",
      ["Default Vendor"]
    );

    return insert.rows[0].id;
  }

  return 1;
}

export async function adminDashboard(req, res) {
  try {
    const currentUser = req.user || req.session?.user;
    const vendorId =
      currentUser?.vendor_id || await ensureVendor();

    const menuItems = await getAllMenuItems(vendorId);
    const vendorResult = await pool.query(
      "SELECT * FROM vendors WHERE id = $1",
      [vendorId]
    );
    const ordersResult = await pool.query(
      `SELECT id, total, status, created_at
       FROM orders
       WHERE vendor_id = $1
       ORDER BY created_at DESC`,
      [vendorId]
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
       WHERE o.vendor_id = $1
         AND del.status <> 'Delivered'
       GROUP BY u.full_name, u.email, d.status, d.current_location
       ORDER BY active_jobs DESC
       LIMIT 5`,
      [vendorId]
    );

    const serviceTimeResult = await pool.query(
      `SELECT
         AVG(EXTRACT(EPOCH FROM (d.completed_at - d.accepted_at)) / 60) AS avg_minutes,
         MIN(EXTRACT(EPOCH FROM (d.completed_at - d.accepted_at)) / 60) AS fastest_minutes,
         MAX(EXTRACT(EPOCH FROM (d.completed_at - d.accepted_at)) / 60) AS slowest_minutes,
         COUNT(*)::int AS fulfilled_count
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE o.vendor_id = $1
         AND d.completed_at IS NOT NULL
         AND d.accepted_at IS NOT NULL`,
      [vendorId]
    );

    const serviceTimeRow = serviceTimeResult.rows[0] || {};
    const averageServiceMinutes = serviceTimeRow.avg_minutes;

    // Best-selling items over the last 7 days, ranked by units sold. Joins
    // back to menu_items so only items still on the menu appear (order_items
    // keep their own price snapshot, so revenue is historically accurate).
    const topSellersResult = await pool.query(
      `SELECT
         mi.name,
         mi.category,
         SUM(oi.quantity)::int AS units,
         SUM(oi.quantity * oi.price) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.vendor_id = $1
         AND o.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY mi.id, mi.name, mi.category
       ORDER BY units DESC, revenue DESC
       LIMIT 5`,
      [vendorId]
    );

    // Revenue trend: one bucket per day for the last 7 days, plus a rolling
    // 30-day total. Computed from the already-loaded orders so it always
    // agrees with the revenue tiles above (which count every order).
    const trendNow = new Date();
    const revenueTrendDays = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(trendNow);
      day.setDate(trendNow.getDate() - i);
      revenueTrendDays.push({
        key: day.toDateString(),
        label: day.toLocaleDateString(undefined, { weekday: "short" }),
        total: 0
      });
    }
    const revenueTrendByKey = new Map(revenueTrendDays.map((day) => [day.key, day]));
    let revenueMonth = 0;
    orders.forEach((order) => {
      const created = new Date(order.created_at);
      const amount = Number(order.total || 0);
      const diffDays = (trendNow - created) / (1000 * 60 * 60 * 24);
      if (diffDays <= 30) revenueMonth += amount;
      const bucket = revenueTrendByKey.get(created.toDateString());
      if (bucket) bucket.total += amount;
    });
    const revenueTrendMax = Math.max(1, ...revenueTrendDays.map((day) => day.total));

    // Items the owner should act on: anything not currently sellable
    // (Sold Out / Seasonal), surfaced by name instead of just a count.
    const itemsNeedingAttention = menuItems
      .filter((item) => item.status && item.status !== "Available")
      .map((item) => ({
        name: item.name,
        category: item.category || "Uncategorized",
        status: item.status
      }));

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
      seasonalItems,
      topSellers: topSellersResult.rows.map((row) => ({
        name: row.name,
        category: row.category || "Uncategorized",
        units: Number(row.units),
        revenue: Number(row.revenue)
      })),
      revenueTrend: {
        days: revenueTrendDays.map((day) => ({ label: day.label, total: day.total })),
        max: revenueTrendMax,
        monthTotal: revenueMonth
      },
      fulfillment: {
        averageMinutes:
          averageServiceMinutes != null ? Math.round(averageServiceMinutes) : null,
        fastestMinutes:
          serviceTimeRow.fastest_minutes != null
            ? Math.round(serviceTimeRow.fastest_minutes)
            : null,
        slowestMinutes:
          serviceTimeRow.slowest_minutes != null
            ? Math.round(serviceTimeRow.slowest_minutes)
            : null,
        fulfilledCount: serviceTimeRow.fulfilled_count || 0
      },
      itemsNeedingAttention
    };

    res.render("admin/dashboard", {
      title: "Admin Dashboard",
      menuItems,
      orders,
      dashboard,
      vendor: vendorResult.rows[0] || null,
      vendorId
    });

  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
  }
}

export async function businessProfileForm(req, res) {
  try {
    const vendorId =
      req.user?.vendor_id || await ensureVendor();

    const vendorResult = await pool.query(
      "SELECT * FROM vendors WHERE id = $1",
      [vendorId]
    );

    const vendor = vendorResult.rows[0];

    if (!vendor) {
      req.flash("error", "Business profile not found");
      return res.redirect("/admin");
    }

    res.render("admin/profile", {
      title: "Edit Business Profile",
      vendor,
      vendorTypes: VENDOR_TYPES,
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
    const vendorId =
      req.user?.vendor_id || await ensureVendor();
    const userId = req.user?.id;
    const {
      businessName,
      businessDescription,
      vendorType,
      email,
      openingTime,
      closingTime
    } = req.body;

    const safeName = (businessName || "").trim();
    const safeDescription = (businessDescription || "").trim();
    const safeEmail = (email || "").trim().toLowerCase();

    // Accept HH:MM only; anything else (incl. blank) clears the window so the
    // vendor reads as always-open.
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const safeOpeningTime = timePattern.test((openingTime || "").trim()) ? openingTime.trim() : null;
    const safeClosingTime = timePattern.test((closingTime || "").trim()) ? closingTime.trim() : null;

    if (!userId) {
      req.flash("error", "Please log in first");
      return res.redirect("/auth/login");
    }

    if (!safeName || !safeEmail) {
      req.flash("error", "Business name and email are required.");
      return res.redirect("/admin/profile");
    }

    await client.query("BEGIN");

    const vendorResult = await client.query(
      "SELECT * FROM vendors WHERE id = $1 FOR UPDATE",
      [vendorId]
    );

    const vendor = vendorResult.rows[0];

    if (!vendor) {
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
      getFilePath(req.files?.businessLogo?.[0]) || vendor.logo_url;
    const bannerUrl =
      getFilePath(req.files?.businessBanner?.[0]) || vendor.banner_url;
    const slug = await buildUniqueVendorSlug(client, safeName, vendorId);
    const safeVendorType = VENDOR_TYPE_VALUES.includes(vendorType)
      ? vendorType
      : vendor.vendor_type;

    await client.query(
      `UPDATE vendors
       SET name = $1,
           description = $2,
           logo_url = $3,
           banner_url = $4,
           slug = $5,
           vendor_type = $6,
           opening_time = $7,
           closing_time = $8
       WHERE id = $9`,
      [
        safeName,
        safeDescription || null,
        logoUrl,
        bannerUrl,
        slug,
        safeVendorType,
        safeOpeningTime,
        safeClosingTime,
        vendorId
      ]
    );

    const userResult = await client.query(
      `UPDATE users
       SET email = $1
       WHERE id = $2
       RETURNING id, email, role, vendor_id, full_name`,
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
    const vendorId =
      req.user?.vendor_id || await ensureVendor();

    const menuItem = await getMenuItemById(id, vendorId);

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

    const vendorId =
      req.user?.vendor_id || await ensureVendor();

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
      vendor_id: vendorId
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

    const vendorId =
      req.user?.vendor_id || await ensureVendor();

    const existingItem = await getMenuItemById(
      req.params.id,
      vendorId
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
      vendor_id: vendorId
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
    const vendorId =
      req.user?.vendor_id || await ensureVendor();

    const item = await getMenuItemById(
      req.params.id,
      vendorId
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

    await deleteMenuItem(req.params.id, vendorId);

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

    const vendorId =
      req.user?.vendor_id || await ensureVendor();

    for (let i = 0; i < order.length; i++) {
      await pool.query(
        `UPDATE menu_items
         SET display_order = $1
         WHERE id = $2 AND vendor_id = $3`,
        [i, order[i], vendorId]
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

    const vendorId =
      req.user?.vendor_id || await ensureVendor();

    const item = await getMenuItemById(id, vendorId);

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
      vendor_id: vendorId
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

export async function listReviews(req, res) {
  try {
    const vendorId = req.user?.vendor_id || await ensureVendor();
    const reviews = await getReviewsForVendor(vendorId);
    const averageRating = reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null;
    const repliedCount = reviews.filter((review) => review.owner_reply).length;

    res.render("admin/reviews", {
      title: "Customer Reviews",
      reviews,
      averageRating,
      repliedCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
  }
}

export async function replyToReview(req, res) {
  try {
    const vendorId = req.user?.vendor_id || await ensureVendor();
    const reviewId = Number.parseInt(req.params.reviewId, 10);
    const reply = (req.body.reply || "").trim().slice(0, 1000);

    if (!Number.isInteger(reviewId) || !reply) {
      req.flash("error", "Your reply can't be empty.");
      return res.redirect("/admin/reviews");
    }

    const updated = await addOwnerReply(reviewId, vendorId, reply);
    req.flash(updated ? "success" : "error", updated ? "Reply posted." : "Review not found.");
    res.redirect("/admin/reviews");
  } catch (error) {
    console.error(error);
    res.status(500).render("500", { title: "Server Error" });
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
