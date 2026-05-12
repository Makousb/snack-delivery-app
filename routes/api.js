import express from "express";
import { getMenuAPI } from "../controllers/api.controller.js";

const router = express.Router();

router.get("/menu", getMenuAPI);

export default router;