import express from "express";
import {
  adminDashboard,
  newMenuForm,
  addMenuItem,
  editMenuForm,
  updateMenu,
  deleteMenu,
  updateMenuOrder,
  toggleMenuStatus
} from "../controllers/admin.controller.js";


import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";
import { optimizeImage } from "../middlewares/optimizeImage.middleware.js"; // 👈 our new image optimizer

const router = express.Router();

// --------------------
// Dashboard
// --------------------
router.get("/", adminDashboard);

// --------------------
// Show form to add new menu item
// --------------------
router.get("/menu/new", requireAuth, requireRole(["owner", "admin"]), newMenuForm);

// --------------------
// Create menu item with image upload & optimization
// --------------------
router.post("/menu", requireAuth, requireRole(["owner", "admin"]), upload.single("image"), optimizeImage, addMenuItem);

// --------------------
// Show edit form
// --------------------
router.get("/edit/:id", requireAuth, requireRole(["owner", "admin"]), editMenuForm);

// --------------------
// Update menu item with image upload & optimization
// --------------------
router.post("/edit/:id", requireAuth, requireRole(["owner", "admin"]), upload.single("image"), optimizeImage, updateMenu);

// --------------------
// Delete menu item
// --------------------
router.post("/delete/:id", requireAuth, requireRole(["owner", "admin"]), deleteMenu);

// Update drag-and-drop order
router.post("/menu/reorder", requireAuth, requireRole(["owner", "admin"]), updateMenuOrder);

// ✅ NEW: Toggle status
router.post("/menu/:id/toggle-status", requireAuth, requireRole(["owner", "admin"]), toggleMenuStatus);


export default router;
