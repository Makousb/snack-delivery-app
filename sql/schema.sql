-- Snack Delivery App schema
-- Run against an empty database: psql -d business_data -f sql/schema.sql
--
-- vendors and users reference each other (a vendor has an owner, an owner
-- user has a vendor_id), so the owner_id foreign key on vendors is added
-- after both tables exist.

CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER,
  vendor_type TEXT NOT NULL DEFAULT 'restaurant'
    CHECK (vendor_type IN ('restaurant', 'store', 'street_vendor')),
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  slug TEXT,
  latitude NUMERIC(10, 6),
  longitude NUMERIC(10, 6),
  opening_time TIME,
  closing_time TIME,
  pickup_instructions TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  full_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_owner_id_fkey'
  ) THEN
    ALTER TABLE vendors
      ADD CONSTRAINT vendors_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS vendors_slug_key
  ON vendors(slug)
  WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  image_url TEXT,
  category TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'Available',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  total NUMERIC(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  delivery_address TEXT,
  customer_phone TEXT,
  payment_method VARCHAR(50),
  mpesa_checkout_request_id TEXT,
  mpesa_manual_code TEXT,
  delivery_lat NUMERIC(10, 6),
  delivery_lng NUMERIC(10, 6),
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  fulfillment_type VARCHAR(20) NOT NULL DEFAULT 'delivery',
  scheduled_for TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  price NUMERIC(10, 2) NOT NULL
);

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
);

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
);

CREATE INDEX IF NOT EXISTS deliveries_status_idx ON deliveries(status);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- One customer review per order (UNIQUE order_id), so every rating is backed
-- by a real completed order.
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reviews_vendor_id_idx ON reviews(vendor_id);
