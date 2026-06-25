import express from "express";
import rateLimit from "express-rate-limit";

import {
  showSignup,
  signup,
  showLogin,
  login,
  logout
} from "../controllers/auth.controller.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = express.Router();

// Throttle credential endpoints to blunt brute-force / signup abuse. Keyed by
// client IP (trust proxy is configured in app.js for correct IPs in prod).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many attempts. Please wait a few minutes and try again."
});

// Signup
router.get("/signup", showSignup);
router.post(
  "/signup",
  authLimiter,
  upload.fields([
    { name: "businessLogo", maxCount: 1 },
    { name: "businessBanner", maxCount: 1 }
  ]),
  signup
);

// Login
router.get("/login", showLogin);
router.post("/login", authLimiter, login);

// Logout
router.get("/logout", logout);

export default router;
