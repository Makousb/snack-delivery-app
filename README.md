# Snack Delivery App

A multi-restaurant food delivery marketplace with separate experiences for
customers, restaurant owners, and drivers — built with Express, EJS, and
PostgreSQL.

## Features

- Browse restaurants, search, and order from per-restaurant menus
- Cart and checkout with cash-on-delivery or M-Pesa STK Push
- Live order status updates via Socket.IO
- Role-based accounts: customer, restaurant owner, driver, admin
- Owner business hub: menu management with drag-to-reorder and automatic
  image resizing, business profile editing, order management, contact inbox
- Driver dashboard for accepting deliveries and updating delivery stage
- Session-based auth with bcrypt password hashing

## Tech Stack

- Node.js + Express 5, EJS templating
- PostgreSQL via `pg`, sessions stored with `connect-pg-simple`
- Socket.IO for real-time order/delivery updates
- Multer + Sharp for image upload and optimization
- Axios for the M-Pesa Daraja API

## Project Structure

```
controllers/   Request handlers, grouped by feature
routes/        Express routers, one per feature area
middlewares/    Auth guards, file upload, image optimization, error handling
db/             Postgres connection pool, schema bootstrap, query modules
services/       Third-party integrations (M-Pesa)
utils/          Small framework-agnostic helpers (cart math, slugs)
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
production; `GOOGLE_MAPS_API_KEY` and the `MPESA_*` vars are optional —
cash checkout works without them.

### 3. Create the database

Create an empty PostgreSQL database (matching `DB_NAME` in your `.env`,
`business_data` by default), then apply the schema:

```bash
psql -d business_data -f sql/schema.sql
psql -d business_data -f sql/seed.sql   # optional demo restaurant + menu
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

## Payments

M-Pesa STK Push targets the Safaricom Daraja sandbox by default. Real
charges require a Safaricom developer account and valid `MPESA_*`
credentials in `.env`; without them, cash-on-delivery checkout still works
end to end.

## License

MIT — see [LICENSE](LICENSE).
