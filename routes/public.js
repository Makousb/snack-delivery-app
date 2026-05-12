import express from "express";
import {
  renderLanding,
  renderMenu,
  showRestaurant,
  renderHome,
  searchRestaurant
} from "../controllers/public.controller.js";

const router = express.Router();

// 🏠 Home page (MUST be first)
router.get("/", renderLanding);
router.get("/home", renderHome);

// 🔍 Homepage restaurant search
router.get("/restaurants/search", searchRestaurant);

// ✅ NEW (restaurant-specific menu)
router.get("/restaurant/:id/menu", renderMenu);

// 🏪 Restaurant page
router.get("/restaurant/:id", showRestaurant);

export default router;

