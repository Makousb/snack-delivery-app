import { pool } from "../db/index.js";

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
           o.customer_phone,
           r.name AS restaurant_name
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         JOIN restaurants r ON r.id = o.restaurant_id
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
           o.customer_phone,
           r.name AS restaurant_name
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         JOIN restaurants r ON r.id = o.restaurant_id
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
           r.name AS restaurant_name
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         JOIN restaurants r ON r.id = o.restaurant_id
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
           current_stage = 'Heading to restaurant',
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

    await Promise.all([
      pool.query(
        "UPDATE drivers SET status = 'On delivery', current_location = 'Heading to restaurant' WHERE id = $1",
        [driver.id]
      ),
      pool.query(
        "UPDATE orders SET status = 'Driver Assigned' WHERE id = $1",
        [result.rows[0].order_id]
      )
    ]);

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
        currentStage: "Picked up from restaurant",
        orderStatus: "Out for Delivery",
        driverStatus: "On delivery",
        driverLocation: "Leaving restaurant"
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

    await Promise.all([
      pool.query(
        "UPDATE orders SET status = $1 WHERE id = $2",
        [selectedStage.orderStatus, result.rows[0].order_id]
      ),
      pool.query(
        "UPDATE drivers SET status = $1, current_location = $2 WHERE id = $3",
        [selectedStage.driverStatus, selectedStage.driverLocation, driver.id]
      )
    ]);

    req.flash("success", "Delivery status updated.");
    return res.redirect("/driver");
  } catch (error) {
    console.error(error);
    next(error);
  }
}
