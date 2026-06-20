import express from "express";
import flash from "connect-flash";
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

io.on("connection", (socket) => {
  socket.on("joinRestaurant", (restaurantId) => {
    if (restaurantId) {
      socket.join(`restaurant_${restaurantId}`);
    }
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
  const { countsByRestaurant, totalCount } = getCartSummary(req.session.cart || {});

  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.cartCounts = countsByRestaurant;
  res.locals.cartCount = totalCount;
  res.locals.googleMapsApiKey = config.googleMapsApiKey;
  res.locals.formatCurrency = formatCurrency;

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
