import express from "express";
import {
  createOrder,
  orderSuccess,
  customerOrders,
  submitReview,
  vendorOrders,
  submitMpesaCode,
  updateOrderStatus
} from "../controllers/order.controller.js";
import { blockRoles, requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Customer
router.post("/vendor/:vendorId/order", blockRoles(["owner", "admin", "driver"]), createOrder);
router.get("/orders/:orderId/success", orderSuccess);
router.post("/orders/:orderId/confirm-payment", submitMpesaCode);
router.get("/orders", blockRoles(["owner", "admin", "driver"]), customerOrders);
router.post("/orders/:orderId/review", blockRoles(["owner", "admin", "driver"]), submitReview);

// Admin / Vendor
router.get(
  "/admin/vendor/:vendorId/orders",
  requireAuth,
  requireRole(["owner", "admin"]),
  vendorOrders
);
router.post(
  "/admin/order/:orderId/status",
  requireAuth,
  requireRole(["owner", "admin"]),
  updateOrderStatus
);

export default router;
