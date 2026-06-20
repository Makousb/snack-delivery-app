import express from "express";
import { getMenuAPI } from "../controllers/api.controller.js";
import { handleMpesaCallback } from "../controllers/order.controller.js";

const router = express.Router();

router.get("/menu", getMenuAPI);
router.post("/mpesa/callback", handleMpesaCallback);

export default router;