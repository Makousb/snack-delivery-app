import express from "express";
import {
  renderFavorites,
  toggleFavoriteHandler
} from "../controllers/favorites.controller.js";
import { blockRoles } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Favourites are a shopper feature; keep vendor/driver hubs out.
router.use(blockRoles(["owner", "admin", "driver"]));

router.get("/", renderFavorites);
router.post("/:vendorId/toggle", toggleFavoriteHandler);

export default router;
