import express from "express";
import {
  createOrder,
  orderSuccess,
  customerOrders,
  restaurantOrders,
  updateOrderStatus
} from "../controllers/order.controller.js";

const router = express.Router();

// Customer
router.post("/restaurant/:restaurantId/order", createOrder);
router.get("/orders/:orderId/success", orderSuccess);
router.get("/orders", customerOrders);

// Admin / Restaurant
router.get("/admin/restaurant/:restaurantId/orders", restaurantOrders);
router.post("/admin/order/:orderId/status", updateOrderStatus);

export default router;