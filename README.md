# Snack Delivery App

A Grab-style multi-vendor marketplace — restaurants, neighborhood stores,
local street vendors, and bookable home-service providers (plumbing,
cleaning, catering, and more) all in one place — with separate experiences
for customers, vendor owners, and drivers. Built with Express, EJS, and
PostgreSQL.

## Features

### Customers

- Browse restaurants, neighborhood stores, street vendors, and **home
  services** (plumbing, cleaning, catering, and more, in their own
  dedicated section); search across vendors and dishes, and filter by open
  now / top rated / new on Snack
- Street-vendor price comparison — the same snack priced across nearby carts
- **Delivery, pickup, or an on-site visit** on every order: pickup skips the
  delivery fee and shows the vendor's own pickup instructions; a home
  service is booked for your address instead, with no delivery fee
- **ASAP or scheduled orders**: pick a 30-minute slot inside the vendor's
  opening hours — including booking ahead while the vendor is closed
- Checkout with promo codes, driver tips, a saved address book (Google
  Places autocomplete), and distance-based delivery fees and ETAs
- Cash on delivery/pickup, or M-Pesa STK Push
- Live order tracking via Socket.IO, including driver location updates
- Ratings & reviews (1–5★, one per completed order) aggregated onto vendor
  cards, favourites, "order your usual", and one-click reorder
- Active orders surface as a live tracking card on the home page (works for
  guests too)
- Opt-in order confirmation emails, and opt-in SMS updates (Africa's
  Talking) — a text when the vendor receives the order and on every status
  change through delivery or pickup

### Vendor owners

- Business hub dashboard: revenue trend, top sellers, inventory health, and
  a service-time scorecard
- **Scheduled queue** with live countdowns that escalate as a slot
  approaches (amber inside an hour, red pulse when due) and update in real
  time as new orders arrive over the socket
- Live orders table with real-time inserts, color-coded status pills, and
  fulfillment-aware statuses ("Ready for Pickup" for pickup, "Confirmed" /
  "In Progress" for on-site service bookings)
- Menu management with drag-to-reorder and automatic image resizing;
  sold-out items are blocked from carts — the same tool doubles as a
  service-listing manager for home-service providers
- Business profile: vendor type (including Service Provider, with an
  open-ended service category like "Plumbing" or "Catering"), opening
  hours, pickup instructions, logo and banner
- Promo code management, review replies, and a contact inbox

### Drivers

- Driver dashboard for accepting delivery jobs, updating the delivery
  stage, and tracking tips — pickup orders never reach the driver pool

### Platform

- Role-based accounts (customer, vendor owner, driver, admin) with
  session-based auth and bcrypt password hashing
- Responsive, mobile-first UI with dark mode, toast notifications, and a
  shared SVG icon system
- **Installable PWA**: add Snack to an iPhone or Android home screen for a
  full-screen, app-like experience with a branded offline fallback page
  (requires HTTPS in production; works on `localhost` in development)

## Tech Stack

- Node.js + Express 5, EJS templating
- PostgreSQL via `pg`, sessions stored with `connect-pg-simple`
- Socket.IO for real-time order, delivery, and vendor-queue updates
- Multer + Sharp for image upload and optimization
- Axios for the M-Pesa Daraja API
- Nodemailer for opt-in transactional email

## Project Structure

```
controllers/   Request handlers, grouped by feature
routes/        Express routers, one per feature area
middlewares/    Auth guards, file upload, image optimization, error handling
db/             Postgres connection pool, schema bootstrap, query modules
services/       Third-party integrations (M-Pesa, transactional email)
utils/          Small framework-agnostic helpers (cart math, pricing, opening hours, slugs)
views/          EJS templates
public/         Static assets (CSS, client-side JS, images)
sql/            schema.sql (fresh install) and seed.sql (demo data)
scripts/        One-off CLI scripts (create-admin)
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL running locally (or reachable over the network)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in your database credentials. `SESSION_SECRET` is required in
production; `GOOGLE_MAPS_API_KEY`, the `MPESA_*` vars, and the
`EMAIL_*`/`SMTP_*` vars are all optional — cash checkout works without
any of them.

### 3. Create the database

Create an empty PostgreSQL database (matching `DB_NAME` in your `.env`,
`business_data` by default), then apply the schema:

```bash
psql -d business_data -f sql/schema.sql
psql -d business_data -f sql/seed.sql   # optional demo vendors + menus
```

### 4. Create an owner/admin account

```bash
npm run create-admin
```

Creates an account using `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars if set,
otherwise `admin@example.com` / `admin123` (change the password after first
login). You can also sign up directly through the app at `/auth/signup`
with the "owner" or "driver" account type.

### 5. Run the app

```bash
npm start
```

Visit `http://localhost:3000`.

## Deploying to Render

The repo ships a [render.yaml](render.yaml) blueprint that provisions the web
service and a free Postgres database together:

1. Push the repo to GitHub (already done if you're reading this there).
2. In the [Render dashboard](https://dashboard.render.com): **New → Blueprint**,
   pick this repository, and click **Apply**.
3. That's it — on first boot the app applies `sql/schema.sql` to the fresh
   database automatically, and because the blueprint sets
   `SEED_DEMO_DATA=true` it also loads the demo vendors and menus.

The deployed site is served over HTTPS, so the PWA works end to end: open it
in Safari on an iPhone → Share → **Add to Home Screen**.

Notes for a real deployment: remove `SEED_DEMO_DATA` from the service's
environment once you have real data, and note that images uploaded by vendors
live on the service's ephemeral disk (they reset on redeploy) — swap in an
object store (e.g. S3/Cloudinary) before onboarding real vendors.

## Payments

M-Pesa STK Push targets the Safaricom Daraja sandbox by default. Real
charges require a Safaricom developer account and valid `MPESA_*`
credentials in `.env`; without them, cash-on-delivery checkout still works
end to end.

## License

MIT — see [LICENSE](LICENSE).
