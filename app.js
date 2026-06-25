import express from "express";
import flash from "connect-flash";
import helmet from "helmet";
import http from "http";
import path from "path";
import pgSession from "connect-pg-simple";
import session from "express-session";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

import { config } from "./config/env.js";
import { pool } from "./db/index.js";
import { ensureSchema } from "./db/ensureSchema.js";
import { handleError, notFound } from "./middlewares/error.middleware.js";
import adminRoutes from "./routes/admin.js";
import apiRoutes from "./routes/api.js";
import authRoutes from "./routes/auth.js";
import cartRoutes from "./routes/cart.js";
import driverRoutes from "./routes/driver.js";
import orderRoutes from "./routes/order.js";
import publicRoutes from "./routes/public.js";
import { getCartSummary } from "./utils/cart.js";
import { formatCurrency } from "./utils/currency.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PgSession = pgSession(session);
const __filename = fileURLToPath(import.meta.url);
const appRoot = path.dirname(__filename);

app.set("io", io);
app.set("view engine", "ejs");
app.set("views", path.join(appRoot, "views"));

// Behind a single reverse proxy in production (Render/Heroku/nginx) so secure
// cookies and client IPs (for rate limiting) are detected correctly.
app.set("trust proxy", config.isProduction ? 1 : false);

// Security headers. CSP is intentionally left off for now: the app relies on
// inline <script> blocks throughout the EJS views, so a default policy would
// break them. Re-enable CSP once those are externalized.
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

io.on("connection", (socket) => {
  socket.on("joinVendor", (vendorId) => {
    if (vendorId) {
      socket.join(`vendor_${vendorId}`);
    }
  });

  socket.on("joinOrderTracking", (orderId) => {
    if (orderId) {
      socket.join(`order_${orderId}`);
    }
  });

  socket.on("driverLocationPing", ({ orderId, lat, lng } = {}) => {
    if (!orderId || typeof lat !== "number" || typeof lng !== "number") {
      return;
    }

    socket.to(`order_${orderId}`).emit("driverLocationUpdate", { lat, lng });
  });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(appRoot, "public")));

app.use(
  session({
    name: "snack.sid",
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
      sameSite: "lax",
      secure: config.isProduction
    }
  })
);

app.use(flash());

app.use((req, res, next) => {
  const { countsByVendor, totalCount } = getCartSummary(req.session.cart || {});

  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.cartCounts = countsByVendor;
  res.locals.cartCount = totalCount;
  res.locals.googleMapsApiKey = config.googleMapsApiKey;
  res.locals.formatCurrency = formatCurrency;
  res.locals.mpesaEnabled = config.payments.mpesaEnabled;

  next();
});

app.use("/", publicRoutes);
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/driver", driverRoutes);
app.use("/api", apiRoutes);
app.use("/", orderRoutes);
app.use("/", cartRoutes);

app.use(notFound);
app.use(handleError);

await ensureSchema();

server.listen(config.port, () => {
  console.info(`Server running on http://localhost:${config.port}`);
});
