-- Optional demo data so a fresh clone has something to browse.
-- Safe to skip, and safe to re-run: psql -d business_data -f sql/seed.sql

INSERT INTO restaurants (name, description, slug)
SELECT
  'Sunrise Diner',
  'A friendly neighborhood spot serving breakfast, lunch, and dinner staples.',
  'sunrise-diner'
WHERE NOT EXISTS (
  SELECT 1 FROM restaurants WHERE slug = 'sunrise-diner'
);

INSERT INTO menu_items (restaurant_id, name, description, price, image_url, category, status, display_order)
SELECT
  r.id,
  item.name,
  item.description,
  item.price,
  '/images/placeholder.png',
  item.category,
  'Available',
  item.display_order
FROM restaurants r
CROSS JOIN (
  VALUES
    ('Garden Salad', 'Mixed greens, cherry tomatoes, cucumber, house vinaigrette.', 350.00, 'Starter', 0),
    ('Loaded Fries', 'Crispy fries topped with cheese and spring onion.', 300.00, 'Starter', 1),
    ('Classic Cheeseburger', 'Beef patty, cheddar, lettuce, tomato, brioche bun.', 550.00, 'Main', 2),
    ('Margherita Pizza', 'Tomato, mozzarella, fresh basil.', 950.00, 'Main', 3),
    ('Chocolate Brownie', 'Warm brownie with a scoop of vanilla ice cream.', 250.00, 'Dessert', 4),
    ('Fresh Lemonade', 'Hand-squeezed lemonade over ice.', 150.00, 'Drinks', 5)
) AS item(name, description, price, category, display_order)
WHERE r.slug = 'sunrise-diner'
  AND NOT EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.restaurant_id = r.id AND mi.name = item.name
  );
