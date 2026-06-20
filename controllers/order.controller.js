import { pool } from "../db/index.js";
import { initiateSTKPush } from "../services/mpesa.js";

export const createOrder = async (req, res) => {
  const { restaurantId } = req.params;
  const userId = req.session.user?.id || null;
  const { phone, paymentMethod, deliveryAddress, tipAmount } = req.body;

  if (
    !req.session.cart ||
    !req.session.cart[restaurantId] ||
    req.session.cart[restaurantId].length === 0
  ) {
    return res.redirect(`/restaurant/${restaurantId}/cart`);
  }

  const cartItems = req.session.cart[restaurantId];
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

    const orderResult = await client.query(
      `INSERT INTO orders (restaurant_id, user_id, total, status, delivery_address, customer_phone, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        restaurantId,
        userId,
        total,
        initialStatus,
        deliveryAddress || null,
        phone || null,
        paymentMethod || null
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

    const restaurantInfo = await client.query(
      "SELECT name FROM restaurants WHERE id = $1",
      [restaurantId]
    );

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
        restaurantInfo.rows[0]?.name || "Restaurant kitchen",
        deliveryAddress || null,
        parsedTipAmount
      ]
    );

    await client.query("COMMIT");

    const io = req.app.get("io");

    if (io) {
      io.to(`restaurant_${restaurantId}`).emit("newOrder", {
        orderId,
        total,
        status: initialStatus
      });

      io.emit("orderUpdated", {
        orderId,
        status: initialStatus
      });
    }

    if (paymentMethod === "mpesa" && phone) {
      try {
        const stkResponse = await initiateSTKPush(phone, total);

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

    req.session.cart[restaurantId] = [];

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
      `SELECT o.*, r.name AS restaurant_name
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
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
      "SELECT user_id, restaurant_id, payment_method FROM orders WHERE id = $1",
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
      io.to(`restaurant_${order.restaurant_id}`).emit("orderUpdated", {
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
      `SELECT o.*, r.name AS restaurant_name
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );

    res.render("orders", {
      title: "My Orders",
      orders: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("500", { title: "Server Error" });
  }
};

export const restaurantOrders = async (req, res) => {
  const restaurantId = req.user?.restaurant_id;

  if (!restaurantId) {
    req.flash("error", "No restaurant is linked to this account.");
    return res.redirect("/admin");
  }

  try {
    const result = await pool.query(
      `SELECT * FROM orders
       WHERE restaurant_id = $1
       ORDER BY created_at DESC`,
      [restaurantId]
    );

    res.render("admin/orders", {
      title: "Restaurant Orders",
      orders: result.rows,
      restaurantId
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("500", { title: "Server Error" });
  }
};

export const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  const restaurantId = req.user?.restaurant_id;

  if (!restaurantId) {
    req.flash("error", "No restaurant is linked to this account.");
    return res.redirect("/admin");
  }

  try {
    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2 AND restaurant_id = $3
       RETURNING id`,
      [status, orderId, restaurantId]
    );

    if (!result.rows.length) {
      req.flash("error", "Order not found.");
      return res.redirect(`/admin/restaurant/${restaurantId}/orders`);
    }

    const io = req.app.get("io");

    if (io) {
      io.emit("orderUpdated", {
        orderId,
        status
      });
    }

    res.redirect(`/admin/restaurant/${restaurantId}/orders`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating order");
  }
};

// Safaricom expects a fast 200 regardless of outcome, so we acknowledge
// first and process the result afterward.
export const handleMpesaCallback = async (req, res) => {
  res.sendStatus(200);

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
       RETURNING id, restaurant_id`,
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
      io.to(`restaurant_${order.restaurant_id}`).emit("orderUpdated", {
        orderId: order.id,
        status
      });
    }
  } catch (err) {
    console.error("Failed to process M-Pesa callback:", err);
  }
};
