import express from "express";
import {
  renderDriverDashboard,
  acceptDelivery,
  updateDeliveryStage
} from "../controllers/driver.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(requireAuth, requireRole("driver"));

router.get("/", renderDriverDashboard);
router.post("/deliveries/:deliveryId/accept", acceptDelivery);
router.post("/deliveries/:deliveryId/stage", updateDeliveryStage);

export default router;
