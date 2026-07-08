import { pool } from "./index.js";
import { slugify } from "../utils/slugify.js";

async function renameColumnIfNeeded(table, oldColumn, newColumn) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2`,
    [table, oldColumn]
  );

  if (result.rows.length > 0) {
    await pool.query(
      `ALTER TABLE ${table} RENAME COLUMN ${oldColumn} TO ${newColumn}`
    );
  }
}

async function ensureVendorSlugs() {
  const result = await pool.query(
    `SELECT id, name, slug
     FROM vendors
     ORDER BY id ASC`
  );

  const usedSlugs = new Set(
    result.rows
      .map((vendor) => vendor.slug)
      .filter(Boolean)
  );

  for (const vendor of result.rows) {
    if (vendor.slug) continue;

    const baseSlug = slugify(vendor.name || `vendor-${vendor.id}`);
    let slug = baseSlug;
    let suffix = 2;

    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    await pool.query(
      "UPDATE vendors SET slug = $1 WHERE id = $2",
      [slug, vendor.id]
    );

    usedSlugs.add(slug);
  }
}

export async function ensureSchema() {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS full_name TEXT
  `);

  await pool.query(`ALTER TABLE IF EXISTS restaurants RENAME TO vendors`);
  await pool.query(`ALTER INDEX IF EXISTS restaurants_slug_key RENAME TO vendors_slug_key`);

  await renameColumnIfNeeded("menu_items", "restaurant_id", "vendor_id");
  await renameColumnIfNeeded("orders", "restaurant_id", "vendor_id");
  await renameColumnIfNeeded("users", "restaurant_id", "vendor_id");

  await pool.query(`
    ALTER TABLE vendors
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS logo_url TEXT,
      ADD COLUMN IF NOT EXISTS banner_url TEXT,
      ADD COLUMN IF NOT EXISTS slug TEXT,
      ADD COLUMN IF NOT EXISTS vendor_type TEXT NOT NULL DEFAULT 'restaurant',
      ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 6),
      ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 6),
      ADD COLUMN IF NOT EXISTS opening_time TIME,
      ADD COLUMN IF NOT EXISTS closing_time TIME,
      ADD COLUMN IF NOT EXISTS pickup_instructions TEXT
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendors_vendor_type_check'
      ) THEN
        ALTER TABLE vendors
          ADD CONSTRAINT vendors_vendor_type_check
          CHECK (vendor_type IN ('restaurant', 'store', 'street_vendor'));
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS delivery_address TEXT,
      ADD COLUMN IF NOT EXISTS customer_phone TEXT,
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
      ADD COLUMN IF NOT EXISTS mpesa_checkout_request_id TEXT,
      ADD COLUMN IF NOT EXISTS mpesa_manual_code TEXT,
      ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(10, 6),
      ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(10, 6),
      ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(20) NOT NULL DEFAULT 'delivery',
      ADD COLUMN IF NOT EXISTS promo_code TEXT,
      ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone VARCHAR(50),
      vehicle_type VARCHAR(80),
      license_number VARCHAR(120),
      status VARCHAR(50) NOT NULL DEFAULT 'Available',
      current_location TEXT,
      rating NUMERIC(3, 2) NOT NULL DEFAULT 4.80,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id SERIAL PRIMARY KEY,
      order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Available',
      current_stage VARCHAR(80) NOT NULL DEFAULT 'Awaiting driver',
      pickup_location TEXT,
      dropoff_location TEXT,
      tips NUMERIC(10, 2) NOT NULL DEFAULT 0,
      accepted_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS vendors_slug_key
      ON vendors(slug)
      WHERE slug IS NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS deliveries_status_idx
      ON deliveries(status)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Customer reviews. One per order (the UNIQUE order_id), so a rating is
  // always backed by a real completed order rather than free-floating spam.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      owner_reply TEXT,
      owner_reply_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS owner_reply TEXT,
      ADD COLUMN IF NOT EXISTS owner_reply_at TIMESTAMP
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS reviews_vendor_id_idx
      ON reviews(vendor_id)
  `);

  // Saved/favourite vendors. One row per (customer, vendor).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, vendor_id)
    )
  `);

  // Vendor-scoped promo codes.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
      discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
      min_order NUMERIC(10, 2) NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (vendor_id, code)
    )
  `);

  // Saved delivery addresses (address book) per customer.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS addresses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT,
      address TEXT NOT NULL,
      latitude NUMERIC(10, 6),
      longitude NUMERIC(10, 6),
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await ensureVendorSlugs();
}
