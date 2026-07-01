import { pool } from "../db/index.js";
import { config } from "../config/env.js";
import { initiateSTKPush } from "../services/mpesa.js";
import { createReview, getReviewByOrderId } from "../db/queries/reviews.js";
import { distanceKm } from "../utils/geo.js";
import { computeDeliveryFee } from "../utils/pricing.js";
import { isVendorOpen } from "../utils/hours.js";

function parseCoordinate(value, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= max ? parsed : null;
}

// The only statuses a vendor is allowed to set from the orders dashboard.
// Anything else (e.g. a hand-crafted POST) is rejected so the status column
// can't be filled with arbitrary text.
const VENDOR_SETTABLE_STATUSES = new Set([
  "Pending Payment",
  "Payment Pending Verification",
  "Paid",
  "Cash Pending",
  "Preparing",
  "Driver Assigned",
  "Out for Delivery",
  "Completed"
]);

export const createOrder = async (req, res) => {
  const { vendorId } = req.params;
  const userId = req.session.user?.id || null;
  const { phone, paymentMethod, deliveryAddress, tipAmount, deliveryLat, deliveryLng } = req.body;
  const parsedLat = parseCoordinate(deliveryLat, 90);
  const parsedLng = parseCoordinate(deliveryLng, 180);

  if (
    !req.session.cart ||
    !req.session.cart[vendorId] ||
    req.session.cart[vendorId].length === 0
  ) {
    return res.redirect(`/vendor/${vendorId}/cart`);
  }

  // Cash-only beta guard: never accept an online payment when M-Pesa is off.
  if (paymentMethod === "mpesa" && !config.payments.mpesaEnabled) {
    req.flash("error", "Online payment is unavailable right now — please choose cash on delivery.");
    return res.redirect(`/vendor/${vendorId}/cart`);
  }

  const cartItems = req.session.cart[vendorId];
  const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const parsedTipAmount = Math.max(0, Number(tipAmount || 0));

  let initialStatus = "Pending";

  if (paymentMethod === "mpesa") {
    initialStatus = "Pending Payment";
  } else if (paymentMethod === "cash") {
    initialStatus = "Cash Pending";
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Fetch the vendor up front so we can price delivery by distance before the
    // order row is written. Fee is authoritative here (never trusted from the
    // client); the cart page only shows an estimate.
    const vendorInfo = await client.query(
      "SELECT name, latitude, longitude, opening_time, closing_time FROM vendors WHERE id = $1",
      [vendorId]
    );
    const vendor = vendorInfo.rows[0];

    // Don't accept orders while the vendor is closed.
    if (vendor && !isVendorOpen(vendor)) {
      await client.query("ROLLBACK");
      req.flash("error", `${vendor.name} is closed right now — please order during their opening hours.`);
      return res.redirect(`/vendor/${vendorId}/cart`);
    }

    const hasBothCoords =
      vendor?.latitude != null &&
      vendor?.longitude != null &&
      parsedLat != null &&
      parsedLng != null;

    const distance = hasBothCoords
      ? distanceKm(Number(vendor.latitude), Number(vendor.longitude), parsedLat, parsedLng)
      : null;

    const deliveryFee = computeDeliveryFee(distance);
    const grandTotal = total + deliveryFee;

    const orderResult = await client.query(
      `INSERT INTO orders (vendor_id, user_id, total, delivery_fee, status, delivery_address, customer_phone, payment_method, delivery_lat, delivery_lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        vendorId,
        userId,
        total,
        deliveryFee,
        initialStatus,
        deliveryAddress || null,
        phone || null,
        paymentMethod || null,
        parsedLat,
        parsedLng
      ]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of cartItems) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.id, item.qty, item.price]
      );
    }

    await client.query(
      `INSERT INTO deliveries (
         order_id,
         status,
         current_stage,
         pickup_location,
         dropoff_location,
         tips
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orderId,
        "Available",
        "Awaiting driver",
        vendor?.name || "Pickup point",
        deliveryAddress || null,
        parsedTipAmount
      ]
    );

    await client.query("COMMIT");

    const io = req.app.get("io");

    if (io) {
      io.to(`vendor_${vendorId}`).emit("newOrder", {
        orderId,
        total,
        status: initialStatus,
        deliveryAddress: deliveryAddress || null,
        deliveryLat: parsedLat,
        deliveryLng: parsedLng
      });

      io.emit("orderUpdated", {
        orderId,
        status: initialStatus
      });
    }

    if (paymentMethod === "mpesa" && phone) {
      try {
        const stkResponse = await initiateSTKPush(phone, grandTotal);

        if (stkResponse?.CheckoutRequestID) {
          await pool.query(
            "UPDATE orders SET mpesa_checkout_request_id = $1 WHERE id = $2",
            [stkResponse.CheckoutRequestID, orderId]
          );
        }
      } catch (err) {
        console.error("M-Pesa error:", err.message);
      }
    }

    req.session.cart[vendorId] = [];

    res.redirect(`/orders/${orderId}/success`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).render("500", { title: "Server Error" });
  } finally {
    client.release();
  }
};

export const orderSuccess = async (req, res) => {
  const { orderId } = req.params;

  try {
    const orderResult = await pool.query(
      `SELECT o.*, v.name AS vendor_name
       FROM orders o
       JOIN vendors v ON v.id = o.vendor_id
       WHERE o.id = $1`,
      [orderId]
    );

    const order = orderResult.rows[0];

    if (!order) {
      return res.status(404).render("404", { title: "Order Not Found" });
    }

    // Guest orders (user_id IS NULL) stay reachable by link; orders placed
    // while logged in are only visible to the account that placed them.
    if (order.user_id && order.user_id !== req.session.user?.id) {
      return res.status(404).render("404", { title: "Order Not Found" });
    }

    const itemsResult = await pool.query(
      `SELECT oi.quantity, oi.price, mi.name
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [orderId]
    );

    res.render("order-success", {
      title: "Order Successful",
      order,
      items: itemsResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("500", { title: "Server Error" });
  }
};

export const submitMpesaCode = async (req, res) => {
  const { orderId } = req.params;
  const code = (req.body.mpesaCode || "").trim();

  if (!code) {
    req.flash("error", "Enter the M-Pesa confirmation code from your payment SMS.");
    return res.redirect(`/orders/${orderId}/success`);
  }

  try {
    const orderResult = await pool.query(
      "SELECT user_id, vendor_id, payment_method FROM orders WHERE id = $1",
      [orderId]
    );
    const order = orderResult.rows[0];

    if (!order || order.payment_method !== "mpesa") {
      return res.status(404).render("404", { title: "Order Not Found" });
    }

    if (order.user_id && order.user_id !== req.session.user?.id) {
      return res.status(404).render("404", { title: "Order Not Found" });
    }

    await pool.query(
      `UPDATE orders
       SET mpesa_manual_code = $1, status = 'Payment Pending Verification'
       WHERE id = $2`,
      [code, orderId]
    );

    const io = req.app.get("io");

    if (io) {
      io.emit("orderUpdated", { orderId, status: "Payment Pending Verification" });
      io.to(`vendor_${order.vendor_id}`).emit("orderUpdated", {
        orderId,
        status: "Payment Pending Verification"
      });
    }

    req.flash("success", "Thanks — we'll confirm your payment shortly.");
    res.redirect(`/orders/${orderId}/success`);
  } catch (err) {
    console.error(err);
    res.status(500).render("500", { title: "Server Error" });
  }
};

export const customerOrders = async (req, res) => {
  try {
    const userId = req.session.user?.id;

    if (!userId) return res.redirect("/auth/login");

    const result = await pool.query(
      `SELECT o.*, v.name AS vendor_name
       FROM orders o
       JOIN vendors v ON v.id = o.vendor_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );

    const orders = result.rows;

    // Attach a short item summary to each order so the history shows what
    // was in it, not just a total. menu_item_id can be null for removed
    // items, so fall back to a placeholder name.
    if (orders.length) {
      const itemsResult = await pool.query(
        `SELECT oi.order_id, oi.quantity, COALESCE(mi.name, 'Removed item') AS name
         FROM order_items oi
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id = ANY($1)
         ORDER BY oi.id ASC`,
        [orders.map((order) => order.id)]
      );

      const itemsByOrder = itemsResult.rows.reduce((groups, row) => {
        (groups[row.order_id] = groups[row.order_id] || []).push(row);
        return groups;
      }, {});

      // Pull any existing reviews so completed orders show either the rating
      // the customer already left or a prompt to leave one.
      const reviewsResult = await pool.query(
        "SELECT order_id, rating, comment FROM reviews WHERE order_id = ANY($1)",
        [orders.map((order) => order.id)]
      );

      const reviewByOrder = reviewsResult.rows.reduce((map, row) => {
        map[row.order_id] = row;
        return map;
      }, {});

      orders.forEach((order) => {
        order.items = itemsByOrder[order.id] || [];
        order.review = reviewByOrder[order.id] || null;
        order.can_review = order.status === "Completed" && !order.review;
      });
    }

    res.render("orders", {
      title: "My Orders",
      orders
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("500", { title: "Server Error" });
  }
};

export const submitReview = async (req, res) => {
  const { orderId } = req.params;
  const userId = req.session.user?.id;

  if (!userId) {
    req.flash("error", "Log in to leave a review.");
    return res.redirect("/auth/login");
  }

  const rating = Number.parseInt(req.body.rating, 10);
  const comment = (req.body.comment || "").trim().slice(0, 1000) || null;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    req.flash("error", "Pick a star rating between 1 and 5.");
    return res.redirect("/orders");
  }

  try {
    const orderResult = await pool.query(
      "SELECT id, vendor_id, user_id, status FROM orders WHERE id = $1",
      [orderId]
    );
    const order = orderResult.rows[0];

    // Only the customer who placed the order, and only once it's completed,
    // can review it.
    if (!order || order.user_id !== userId) {
      req.flash("error", "Order not found.");
      return res.redirect("/orders");
    }

    if (order.status !== "Completed") {
      req.flash("error", "You can review an order once it's completed.");
      return res.redirect("/orders");
    }

    if (await getReviewByOrderId(orderId)) {
      req.flash("error", "You've already reviewed this order.");
      return res.redirect("/orders");
    }

    await createReview({
      vendorId: order.vendor_id,
      userId,
      orderId: order.id,
      rating,
      comment
    });

    req.flash("success", "Thanks for your review!");
    return res.redirect("/orders");
  } catch (err) {
    // UNIQUE(order_id) violation — a concurrent submit already reviewed it.
    if (err.code === "23505") {
      req.flash("error", "You've already reviewed this order.");
      return res.redirect("/orders");
    }

    console.error(err);
    return res.status(500).render("500", { title: "Server Error" });
  }
};

export const vendorOrders = async (req, res) => {
  const vendorId = req.user?.vendor_id;

  if (!vendorId) {
    req.flash("error", "No vendor is linked to this account.");
    return res.redirect("/admin");
  }

  try {
    const result = await pool.query(
      `SELECT * FROM orders
       WHERE vendor_id = $1
       ORDER BY created_at DESC`,
      [vendorId]
    );

    res.render("admin/orders", {
      title: "Vendor Orders",
      orders: result.rows,
      vendorId
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("500", { title: "Server Error" });
  }
};

export const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  const vendorId = req.user?.vendor_id;

  if (!vendorId) {
    req.flash("error", "No vendor is linked to this account.");
    return res.redirect("/admin");
  }

  if (!VENDOR_SETTABLE_STATUSES.has(status)) {
    req.flash("error", "That order status isn't allowed.");
    return res.redirect(`/admin/vendor/${vendorId}/orders`);
  }

  try {
    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2 AND vendor_id = $3
       RETURNING id`,
      [status, orderId, vendorId]
    );

    if (!result.rows.length) {
      req.flash("error", "Order not found.");
      return res.redirect(`/admin/vendor/${vendorId}/orders`);
    }

    const io = req.app.get("io");

    if (io) {
      io.emit("orderUpdated", {
        orderId,
        status
      });
    }

    res.redirect(`/admin/vendor/${vendorId}/orders`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating order");
  }
};

// Safaricom expects a fast 200 regardless of outcome, so we acknowledge
// first and process the result afterward.
export const handleMpesaCallback = async (req, res) => {
  res.sendStatus(200);

  // Inert while online payments are disabled — nothing should be able to flip
  // an order to Paid through this (currently unauthenticated) endpoint.
  if (!config.payments.mpesaEnabled) {
    return;
  }

  const stkCallback = req.body?.Body?.stkCallback;

  if (!stkCallback?.CheckoutRequestID) {
    console.error("M-Pesa callback missing CheckoutRequestID:", req.body);
    return;
  }

  const { CheckoutRequestID, ResultCode } = stkCallback;
  const status = ResultCode === 0 ? "Paid" : "Payment Failed";

  try {
    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE mpesa_checkout_request_id = $2
       RETURNING id, vendor_id`,
      [status, CheckoutRequestID]
    );

    const order = result.rows[0];

    if (!order) {
      console.error("M-Pesa callback for unknown order:", CheckoutRequestID);
      return;
    }

    const io = req.app.get("io");

    if (io) {
      io.emit("orderUpdated", { orderId: order.id, status });
      io.to(`vendor_${order.vendor_id}`).emit("orderUpdated", {
        orderId: order.id,
        status
      });
    }
  } catch (err) {
    console.error("Failed to process M-Pesa callback:", err);
  }
};
