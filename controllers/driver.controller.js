import { pool } from "../db/index.js";
import { sendOrderSms, statusSmsMessage } from "../services/sms.js";

// Push a status change to any open tracking pages and text the customer.
// Only fires when the status genuinely changed (callers guard with
// `status <> $1` in their UPDATE).
function notifyOrderStatus(req, order, status) {
  const io = req.app.get("io");

  if (io) {
    io.emit("orderUpdated", { orderId: order.id, status });
  }

  if (order.customer_phone) {
    sendOrderSms(
      order.customer_phone,
      statusSmsMessage(order.id, status, {
        isPickup: order.fulfillment_type === "pickup"
      })
    );
  }
}

async function getDriverProfile(userId) {
  const result = await pool.query(
    `SELECT d.*, u.full_name, u.email
     FROM drivers d
     JOIN users u ON u.id = d.user_id
     WHERE d.user_id = $1`,
    [userId]
  );

  return result.rows[0];
}

export async function renderDriverDashboard(req, res, next) {
  try {
    const driver = await getDriverProfile(req.user.id);

    if (!driver) {
      req.flash("error", "Driver profile not found.");
      return res.redirect("/auth/login");
    }

    const [availableResult, activeResult, completedResult] = await Promise.all([
      pool.query(
        `SELECT
           d.id,
           d.status,
           d.current_stage,
           d.pickup_location,
           d.dropoff_location,
           d.tips,
           d.created_at,
           o.id AS order_id,
           o.total,
           o.delivery_address,
           o.delivery_lat,
           o.delivery_lng,
           o.customer_phone,
           v.name AS vendor_name
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         JOIN vendors v ON v.id = o.vendor_id
         WHERE d.status = 'Available'
         ORDER BY d.created_at DESC`
      ),
      pool.query(
        `SELECT
           d.id,
           d.status,
           d.current_stage,
           d.pickup_location,
           d.dropoff_location,
           d.tips,
           d.accepted_at,
           o.id AS order_id,
           o.total,
           o.delivery_address,
           o.delivery_lat,
           o.delivery_lng,
           o.customer_phone,
           v.name AS vendor_name
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         JOIN vendors v ON v.id = o.vendor_id
         WHERE d.driver_id = $1
           AND d.status <> 'Delivered'
         ORDER BY d.accepted_at DESC NULLS LAST, d.created_at DESC`,
        [driver.id]
      ),
      pool.query(
        `SELECT
           d.id,
           d.status,
           d.current_stage,
           d.tips,
           d.completed_at,
           o.id AS order_id,
           o.total,
           v.name AS vendor_name
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         JOIN vendors v ON v.id = o.vendor_id
         WHERE d.driver_id = $1
           AND d.status = 'Delivered'
         ORDER BY d.completed_at DESC NULLS LAST
         LIMIT 10`,
        [driver.id]
      )
    ]);

    const completedDeliveries = completedResult.rows;
    const driverStats = {
      activeJobs: activeResult.rows.length,
      availableJobs: availableResult.rows.length,
      completedJobs: completedDeliveries.length,
      totalTips: completedDeliveries.reduce((sum, delivery) => sum + Number(delivery.tips || 0), 0),
      weeklyTips: completedDeliveries
        .filter((delivery) => {
          if (!delivery.completed_at) return false;
          const diffDays = (Date.now() - new Date(delivery.completed_at).getTime()) / (1000 * 60 * 60 * 24);
          return diffDays <= 7;
        })
        .reduce((sum, delivery) => sum + Number(delivery.tips || 0), 0)
    };

    res.render("driver/dashboard", {
      title: "Driver Dashboard",
      driver,
      availableDeliveries: availableResult.rows,
      activeDeliveries: activeResult.rows,
      completedDeliveries,
      driverStats
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function acceptDelivery(req, res, next) {
  try {
    const driver = await getDriverProfile(req.user.id);

    if (!driver) {
      req.flash("error", "Driver profile not found.");
      return res.redirect("/driver");
    }

    const { deliveryId } = req.params;
    const result = await pool.query(
      `UPDATE deliveries
       SET driver_id = $1,
           status = 'Accepted',
           current_stage = 'Heading to pickup',
           accepted_at = NOW()
       WHERE id = $2
         AND status = 'Available'
       RETURNING order_id`,
      [driver.id, deliveryId]
    );

    if (!result.rows.length) {
      req.flash("error", "That order is no longer available.");
      return res.redirect("/driver");
    }

    const [, orderResult] = await Promise.all([
      pool.query(
        "UPDATE drivers SET status = 'On delivery', current_location = 'Heading to pickup' WHERE id = $1",
        [driver.id]
      ),
      pool.query(
        `UPDATE orders SET status = 'Driver Assigned'
         WHERE id = $1 AND status <> 'Driver Assigned'
         RETURNING id, customer_phone, fulfillment_type`,
        [result.rows[0].order_id]
      )
    ]);

    if (orderResult.rows.length) {
      notifyOrderStatus(req, orderResult.rows[0], "Driver Assigned");
    }

    req.flash("success", "Delivery accepted.");
    return res.redirect("/driver");
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function updateDeliveryStage(req, res, next) {
  try {
    const driver = await getDriverProfile(req.user.id);

    if (!driver) {
      req.flash("error", "Driver profile not found.");
      return res.redirect("/driver");
    }

    const { deliveryId } = req.params;
    const { stage } = req.body;

    const stageMap = {
      picked_up: {
        deliveryStatus: "Picked Up",
        currentStage: "Picked up from vendor",
        orderStatus: "Out for Delivery",
        driverStatus: "On delivery",
        driverLocation: "Leaving pickup point"
      },
      out_for_delivery: {
        deliveryStatus: "Out for Delivery",
        currentStage: "En route to customer",
        orderStatus: "Out for Delivery",
        driverStatus: "On delivery",
        driverLocation: "On the road"
      },
      delivered: {
        deliveryStatus: "Delivered",
        currentStage: "Delivered to customer",
        orderStatus: "Completed",
        driverStatus: "Available",
        driverLocation: "Available for next order"
      }
    };

    const selectedStage = stageMap[stage];

    if (!selectedStage) {
      req.flash("error", "Unknown delivery stage.");
      return res.redirect("/driver");
    }

    const result = await pool.query(
      `UPDATE deliveries
       SET status = $1,
           current_stage = $2,
           completed_at = CASE
             WHEN $1 = 'Delivered' THEN NOW()
             ELSE completed_at
           END
       WHERE id = $3
         AND driver_id = $4
       RETURNING order_id`,
      [
        selectedStage.deliveryStatus,
        selectedStage.currentStage,
        deliveryId,
        driver.id
      ]
    );

    if (!result.rows.length) {
      req.flash("error", "Delivery not found.");
      return res.redirect("/driver");
    }

    const [orderResult] = await Promise.all([
      pool.query(
        `UPDATE orders SET status = $1
         WHERE id = $2 AND status <> $1
         RETURNING id, customer_phone, fulfillment_type`,
        [selectedStage.orderStatus, result.rows[0].order_id]
      ),
      pool.query(
        "UPDATE drivers SET status = $1, current_location = $2 WHERE id = $3",
        [selectedStage.driverStatus, selectedStage.driverLocation, driver.id]
      )
    ]);

    if (orderResult.rows.length) {
      notifyOrderStatus(req, orderResult.rows[0], selectedStage.orderStatus);
    }

    req.flash("success", "Delivery status updated.");
    return res.redirect("/driver");
  } catch (error) {
    console.error(error);
    next(error);
  }
}
