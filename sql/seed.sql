-- Optional demo data so a fresh clone has something to browse.
-- Safe to skip, and safe to re-run: psql -d business_data -f sql/seed.sql

INSERT INTO vendors (name, vendor_type, description, slug)
SELECT
  'Sunrise Diner',
  'restaurant',
  'A friendly neighborhood spot serving breakfast, lunch, and dinner staples.',
  'sunrise-diner'
WHERE NOT EXISTS (
  SELECT 1 FROM vendors WHERE slug = 'sunrise-diner'
);

INSERT INTO vendors (name, vendor_type, description, slug)
SELECT
  'Corner Mart',
  'store',
  'A neighborhood convenience store for everyday groceries and household basics.',
  'corner-mart'
WHERE NOT EXISTS (
  SELECT 1 FROM vendors WHERE slug = 'corner-mart'
);

INSERT INTO vendors (name, vendor_type, description, slug, latitude, longitude)
SELECT
  'Mama''s Grill Cart',
  'street_vendor',
  'A local street cart grilling up Kenyan favorites all day long.',
  'mamas-grill-cart',
  -1.292100,
  36.821900
WHERE NOT EXISTS (
  SELECT 1 FROM vendors WHERE slug = 'mamas-grill-cart'
);

-- Backfill coordinates if this vendor was seeded before latitude/longitude existed.
UPDATE vendors
SET latitude = -1.292100, longitude = 36.821900
WHERE slug = 'mamas-grill-cart' AND latitude IS NULL;

INSERT INTO vendors (name, vendor_type, description, slug, latitude, longitude)
SELECT
  'Jiko Street Eats',
  'street_vendor',
  'A street-side jiko serving grilled snacks and quick breakfast bites.',
  'jiko-street-eats',
  -1.283300,
  36.816700
WHERE NOT EXISTS (
  SELECT 1 FROM vendors WHERE slug = 'jiko-street-eats'
);

INSERT INTO menu_items (vendor_id, name, description, price, image_url, category, status, display_order)
SELECT
  v.id,
  item.name,
  item.description,
  item.price,
  '/images/placeholder.png',
  item.category,
  'Available',
  item.display_order
FROM vendors v
CROSS JOIN (
  VALUES
    ('Garden Salad', 'Mixed greens, cherry tomatoes, cucumber, house vinaigrette.', 350.00, 'Starter', 0),
    ('Loaded Fries', 'Crispy fries topped with cheese and spring onion.', 300.00, 'Starter', 1),
    ('Classic Cheeseburger', 'Beef patty, cheddar, lettuce, tomato, brioche bun.', 550.00, 'Main', 2),
    ('Margherita Pizza', 'Tomato, mozzarella, fresh basil.', 950.00, 'Main', 3),
    ('Chocolate Brownie', 'Warm brownie with a scoop of vanilla ice cream.', 250.00, 'Dessert', 4),
    ('Fresh Lemonade', 'Hand-squeezed lemonade over ice.', 150.00, 'Drinks', 5)
) AS item(name, description, price, category, display_order)
WHERE v.slug = 'sunrise-diner'
  AND NOT EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.vendor_id = v.id AND mi.name = item.name
  );

INSERT INTO menu_items (vendor_id, name, description, price, image_url, category, status, display_order)
SELECT
  v.id,
  item.name,
  item.description,
  item.price,
  '/images/placeholder.png',
  item.category,
  'Available',
  item.display_order
FROM vendors v
CROSS JOIN (
  VALUES
    ('Bottled Water (1L)', 'Still water, single bottle.', 80.00, 'Drinks', 0),
    ('White Bread Loaf', 'Fresh sliced loaf, baked daily.', 120.00, 'Groceries', 1),
    ('Eggs (Tray of 30)', 'Farm-fresh whole eggs.', 480.00, 'Groceries', 2),
    ('Cooking Oil (1L)', 'Vegetable cooking oil.', 320.00, 'Groceries', 3),
    ('Maize Flour (2kg)', 'Sifted maize flour for ugali.', 220.00, 'Groceries', 4),
    ('Washing Powder (500g)', 'Laundry detergent powder.', 180.00, 'Household', 5)
) AS item(name, description, price, category, display_order)
WHERE v.slug = 'corner-mart'
  AND NOT EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.vendor_id = v.id AND mi.name = item.name
  );

INSERT INTO menu_items (vendor_id, name, description, price, image_url, category, status, display_order)
SELECT
  v.id,
  item.name,
  item.description,
  item.price,
  '/images/placeholder.png',
  item.category,
  'Available',
  item.display_order
FROM vendors v
CROSS JOIN (
  VALUES
    ('Grilled Maize', 'Charcoal-roasted maize on the cob with chili-lime rub.', 80.00, 'Grilled', 0),
    ('Smokies (2 pcs)', 'Grilled smokies served with kachumbari.', 150.00, 'Grilled', 1),
    ('Mutura (Half)', 'Traditional grilled African sausage.', 200.00, 'Grilled', 2),
    ('Roasted Peanuts (Cup)', 'Freshly roasted peanuts, salted.', 100.00, 'Snacks', 3),
    ('Mishkaki Skewers (3 pcs)', 'Marinated grilled meat skewers.', 250.00, 'Grilled', 4),
    ('Sugarcane Juice', 'Freshly pressed sugarcane juice over ice.', 100.00, 'Drinks', 5)
) AS item(name, description, price, category, display_order)
WHERE v.slug = 'mamas-grill-cart'
  AND NOT EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.vendor_id = v.id AND mi.name = item.name
  );

INSERT INTO menu_items (vendor_id, name, description, price, image_url, category, status, display_order)
SELECT
  v.id,
  item.name,
  item.description,
  item.price,
  '/images/placeholder.png',
  item.category,
  'Available',
  item.display_order
FROM vendors v
CROSS JOIN (
  VALUES
    ('Grilled Maize', 'Charcoal-roasted maize on the cob.', 70.00, 'Grilled', 0),
    ('Smokies (2 pcs)', 'Grilled smokies with a side of kachumbari.', 160.00, 'Grilled', 1),
    ('Mutura (Half)', 'Traditional grilled African sausage.', 180.00, 'Grilled', 2),
    ('Boiled Eggs (2 pcs)', 'Boiled eggs with a pinch of chili salt.', 100.00, 'Snacks', 3),
    ('Chapati (2 pcs)', 'Soft, pan-fried flatbread.', 60.00, 'Snacks', 4),
    ('Tea (Cup)', 'Hot spiced Kenyan tea.', 50.00, 'Drinks', 5)
) AS item(name, description, price, category, display_order)
WHERE v.slug = 'jiko-street-eats'
  AND NOT EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.vendor_id = v.id AND mi.name = item.name
  );
