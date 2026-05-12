console.log("🔥 THIS IS APP.JS RUNNING");

import "dotenv/config";

import express from "express";
import path from "path";
import session from "express-session";
import pgSession from "connect-pg-simple";
import flash from "connect-flash";
import http from "http";
import { Server } from "socket.io";

import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import apiRoutes from "./routes/api.js";
import orderRoutes from "./routes/order.js";
import cartRoutes from "./routes/cart.js"; // 🧺 NEW: cart routes module
import driverRoutes from "./routes/driver.js";

console.log("✅ cartRoutes import:", cartRoutes);

import { pool } from "./db/index.js";
import { ensureSchema } from "./db/ensureSchema.js";

// Controllers (ONLY needed if used elsewhere, not for routes anymore)
import {
  addToCart,
  viewCart,
  removeFromCart
} from "./controllers/cart.controller.js";

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------
// Create HTTP Server + Socket.IO
// --------------------
const server = http.createServer(app);
const io = new Server(server);

app.set("io", io);

io.on("connection", (socket) => {
  console.log("🔌 Client connected");

  socket.on("joinRestaurant", (restaurantId) => {
    socket.join(`restaurant_${restaurantId}`);
    console.log(`📡 Joined room restaurant_${restaurantId}`);
  });
});

// --------------------
// View Engine Setup
// --------------------
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

// --------------------
// Middleware
// --------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// --------------------
// Session Setup
// --------------------
const PgSession = pgSession(session);

app.use(
  session({
    store: new PgSession({
      pool: pool,
      tableName: "session"
    }),
    secret: process.env.SESSION_SECRET || "keyboard_cat",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

// --------------------
// Flash Messages
// --------------------
app.use(flash());

// --------------------
// 🌍 Global Variables (EJS)
// --------------------
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");

  // 🧺 Per-restaurant cart counts
  res.locals.cartCounts = {};

  let totalCount = 0;

  if (req.session.cart) {
    for (const restaurantId in req.session.cart) {
      const items = req.session.cart[restaurantId];

      const restaurantCount = items.reduce(
        (sum, item) => sum + item.qty,
        0
      );

      res.locals.cartCounts[restaurantId] = restaurantCount;
      totalCount += restaurantCount;
    }
  }

  res.locals.cartCount = totalCount;

  next();
});

// --------------------
// Routes
// --------------------
app.use("/", publicRoutes);
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/driver", driverRoutes);
app.use("/api", apiRoutes);
app.use("/", orderRoutes);

// 🧺 NEW CLEAN CART ROUTES (single source of truth)
app.use("/", cartRoutes);

// --------------------
// 💳 M-Pesa Callback
// --------------------
app.post("/api/mpesa/callback", (req, res) => {
  console.log("📲 M-Pesa Callback:", JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

// --------------------
// 404 Handler
// --------------------
app.use((req, res) => {
  res.status(404).render("404", {
    title: "Page Not Found"
  });
});

// --------------------
// Global Error Handler
// --------------------
app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err.stack);
  res.status(500).render("500", {
    title: "Server Error"
  });
});

// --------------------
// Server Start
// --------------------
await ensureSchema();

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
