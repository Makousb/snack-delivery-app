import express from "express";
import {
  createOrder,
  orderSuccess,
  customerOrders,
  vendorOrders,
  submitMpesaCode,
  updateOrderStatus
} from "../controllers/order.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Customer
router.post("/vendor/:vendorId/order", createOrder);
router.get("/orders/:orderId/success", orderSuccess);
router.post("/orders/:orderId/confirm-payment", submitMpesaCode);
router.get("/orders", customerOrders);

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
