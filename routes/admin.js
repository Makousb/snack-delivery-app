import express from "express";
import {
  addMenuItem,
  adminDashboard,
  businessProfileForm,
  deleteMenu,
  createPromoHandler,
  deletePromoHandler,
  editMenuForm,
  listMessages,
  listPromos,
  listReviews,
  markMessageReadHandler,
  newMenuForm,
  replyToReview,
  togglePromoHandler,
  toggleMenuStatus,
  updateBusinessProfile,
  updateMenu,
  updateMenuOrder
} from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { optimizeImage, optimizeProfileImages } from "../middlewares/optimizeImage.middleware.js";
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
  optimizeProfileImages,
  updateBusinessProfile
);

router.get("/menu/new", newMenuForm);
router.post("/menu", upload.single("image"), optimizeImage, addMenuItem);

router.get("/edit/:id", editMenuForm);
router.post("/edit/:id", upload.single("image"), optimizeImage, updateMenu);

router.post("/delete/:id", deleteMenu);
router.post("/menu/reorder", updateMenuOrder);
router.post("/menu/:id/toggle-status", toggleMenuStatus);

router.get("/promos", listPromos);
router.post("/promos", createPromoHandler);
router.post("/promos/:id/toggle", togglePromoHandler);
router.post("/promos/:id/delete", deletePromoHandler);

router.get("/reviews", listReviews);
router.post("/reviews/:reviewId/reply", replyToReview);

router.get("/messages", listMessages);
router.post("/messages/:id/read", markMessageReadHandler);

export default router;
