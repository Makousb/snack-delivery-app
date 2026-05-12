import { pool } from "../db/index.js";
import { initiateSTKPush } from "../services/mpesa.js";

// 🧾 CREATE ORDER
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
  const total = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const parsedTipAmount = Math.max(0, Number(tipAmount || 0));

  let initialStatus = "Pending";

  if (paymentMethod === "mpesa") {
    initialStatus = "Pending Payment";
  } else if (paymentMethod === "cash") {
    initialStatus = "Cash Pending";
  }

  try {
    await pool.query("BEGIN");

    const orderResult = await pool.query(
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
      await pool.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.id, item.qty, item.price]
      );
    }

    const restaurantInfo = await pool.query(
      "SELECT name FROM restaurants WHERE id = $1",
      [restaurantId]
    );

    await pool.query(
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

    await pool.query("COMMIT");

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

    // 💳 Trigger M-Pesa if selected
    if (paymentMethod === "mpesa" && phone) {
      try {
        await initiateSTKPush(phone, total);
      } catch (err) {
        console.error("M-Pesa error:", err.message);
      }
    }

    // 🧹 Clear cart
    req.session.cart[restaurantId] = [];

    res.redirect(`/orders/${orderId}/success`);

  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).render("500", { title: "Server Error" });
  }
};

// 🎉 ORDER SUCCESS PAGE
export const orderSuccess = async (req, res) => {
  const { orderId } = req.params;

  try {
    const orderResult = await pool.query(
      `
        SELECT o.*, r.name AS restaurant_name
        FROM orders o
        JOIN restaurants r ON r.id = o.restaurant_id
        WHERE o.id = $1
      `,
      [orderId]
    );

    const order = orderResult.rows[0];

    if (!order) {
      return res.status(404).render("404", { title: "Order Not Found" });
    }

    const itemsResult = await pool.query(
      `
        SELECT
          oi.quantity,
          oi.price,
          mi.name
        FROM order_items oi
        JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = $1
        ORDER BY oi.id ASC
      `,
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

// 📦 CUSTOMER ORDERS
export const customerOrders = async (req, res) => {
  try {
    const userId = req.session.user?.id;

    if (!userId) return res.redirect("/auth/login");

    const result = await pool.query(
      `
        SELECT o.*, r.name AS restaurant_name
        FROM orders o
        JOIN restaurants r ON r.id = o.restaurant_id
        WHERE o.user_id = $1
        ORDER BY o.created_at DESC
      `,
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

// 🏪 RESTAURANT (ADMIN) ORDERS
export const restaurantOrders = async (req, res) => {
  const { restaurantId } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM orders
       WHERE restaurant_id = $1
       ORDER BY created_at DESC`,
      [restaurantId]
    );

    res.render("admin/orders", {
      title: "Restaurant Orders",
      orders: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).render("500", { title: "Server Error" });
  }
};

// 🔄 UPDATE ORDER STATUS
export const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  try {
    await pool.query(
      `UPDATE orders SET status = $1 WHERE id = $2`,
      [status, orderId]
    );

    const io = req.app.get("io");

    if (io) {
      io.emit("orderUpdated", {
        orderId,
        status
      });
    }

    res.redirect("back");

  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating order");
  }
};
