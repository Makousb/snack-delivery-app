import express from "express";
import {
  addMenuItem,
  adminDashboard,
  businessProfileForm,
  deleteMenu,
  editMenuForm,
  listMessages,
  markMessageReadHandler,
  newMenuForm,
  toggleMenuStatus,
  updateBusinessProfile,
  updateMenu,
  updateMenuOrder
} from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { optimizeImage } from "../middlewares/optimizeImage.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = express.Router();

router.use(requireAuth, requireRole(["owner", "admin"]));

router.get("/", adminDashboard);

router.get("/profile", businessProfileForm);
router.post(
  "/profile",
  upload.fields([
    { name: "businessLogo", maxCount: 1 },
    { name: "businessBanner", maxCount: 1 }
  ]),
  updateBusinessProfile
);

router.get("/menu/new", newMenuForm);
router.post("/menu", upload.single("image"), optimizeImage, addMenuItem);

router.get("/edit/:id", editMenuForm);
router.post("/edit/:id", upload.single("image"), optimizeImage, updateMenu);

router.post("/delete/:id", deleteMenu);
router.post("/menu/reorder", updateMenuOrder);
router.post("/menu/:id/toggle-status", toggleMenuStatus);

router.get("/messages", listMessages);
router.post("/messages/:id/read", markMessageReadHandler);

export default router;
