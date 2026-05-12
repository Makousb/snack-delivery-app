import express from "express";

import {
  showSignup,
  signup,
  showLogin,
  login,
  logout
} from "../controllers/auth.controller.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = express.Router();

// Signup
router.get("/signup", showSignup);
router.post(
  "/signup",
  upload.fields([
    { name: "businessLogo", maxCount: 1 },
    { name: "businessBanner", maxCount: 1 }
  ]),
  signup
);

// Login
router.get("/login", showLogin);   // ✅ FIXED
router.post("/login", login);

// Logout
router.get("/logout", logout);     // (GET is easier for now)

export default router;
