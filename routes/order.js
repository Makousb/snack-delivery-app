import express from "express";
import {
  createOrder,
  orderSuccess,
  customerOrders,
  restaurantOrders,
  updateOrderStatus
} from "../controllers/order.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Customer
router.post("/restaurant/:restaurantId/order", createOrder);
router.get("/orders/:orderId/success", orderSuccess);
router.get("/orders", customerOrders);

// Admin / Restaurant
router.get(
  "/admin/restaurant/:restaurantId/orders",
  requireAuth,
  requireRole(["owner", "admin"]),
  restaurantOrders
);
router.post(
  "/admin/order/:orderId/status",
  requireAuth,
  requireRole(["owner", "admin"]),
  updateOrderStatus
);

export default router;