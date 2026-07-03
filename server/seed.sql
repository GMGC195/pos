-- Seed Data for Pizza Shop
-- Run AFTER schema.sql

-- Categories
INSERT INTO categories (name) VALUES 
  ('Pizza'),
  ('Drinks'),
  ('Deals'),
  ('Sides');

-- Pizza Items
INSERT INTO items (category_id, name, price, image_url, size_options, status) VALUES
  (1, 'Margherita Classic', 12.99, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=300', ARRAY['S','M','L'], 'Active'),
  (1, 'Pepperoni Supreme', 15.99, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=300', ARRAY['S','M','L'], 'Active'),
  (1, 'BBQ Chicken Feast', 16.99, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=300', ARRAY['M','L'], 'Active'),
  (1, 'Veggie Garden', 13.99, 'https://images.unsplash.com/photo-1511689660979-10d2b1eccbbc?w=300', ARRAY['S','M','L'], 'Active'),
  (1, 'Meat Lovers', 17.99, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300', ARRAY['M','L'], 'Active'),
  (1, 'Four Cheese', 14.99, 'https://images.unsplash.com/photo-1601924582970-9238bcb495d9?w=300', ARRAY['S','M','L'], 'Active'),

-- Drinks
  (2, 'Coca-Cola 500ml', 2.49, 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=300', ARRAY[]::TEXT[], 'Active'),
  (2, 'Fresh Lemonade', 3.49, 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=300', ARRAY[]::TEXT[], 'Active'),
  (2, 'Mango Smoothie', 4.49, 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=300', ARRAY[]::TEXT[], 'Active'),

-- Deals
  (3, 'Family Feast Deal', 39.99, 'https://images.unsplash.com/photo-1555072956-7758afb20e8f?w=300', ARRAY[]::TEXT[], 'Active'),
  (3, 'Couple Combo', 24.99, 'https://images.unsplash.com/photo-1506354666786-959d6d497f1a?w=300', ARRAY[]::TEXT[], 'Active'),

-- Sides
  (4, 'Garlic Bread', 4.99, 'https://images.unsplash.com/photo-1598373182133-52452f7691ef?w=300', ARRAY[]::TEXT[], 'Active');

-- Demo orders (last 7 days)
INSERT INTO orders (subtotal, tax, grand_total, status, created_at) VALUES
  (45.98, 4.14, 50.12, 'Completed', NOW() - INTERVAL '6 days'),
  (32.97, 2.97, 35.94, 'Completed', NOW() - INTERVAL '6 days'),
  (65.96, 5.94, 71.90, 'Completed', NOW() - INTERVAL '5 days'),
  (28.98, 2.61, 31.59, 'Completed', NOW() - INTERVAL '4 days'),
  (89.94, 8.09, 98.03, 'Completed', NOW() - INTERVAL '3 days'),
  (52.97, 4.77, 57.74, 'Completed', NOW() - INTERVAL '2 days'),
  (120.93, 10.88, 131.81, 'Completed', NOW() - INTERVAL '1 day'),
  (75.96, 6.84, 82.80, 'Completed', NOW()),
  (45.98, 4.14, 50.12, 'Pending', NOW()),
  (29.99, 2.70, 32.69, 'Pending', NOW());

-- Demo transactions
INSERT INTO transactions (order_id, payment_method, amount, created_at) VALUES
  (1, 'Cash', 50.12, NOW() - INTERVAL '6 days'),
  (2, 'Card', 35.94, NOW() - INTERVAL '6 days'),
  (3, 'Cash', 71.90, NOW() - INTERVAL '5 days'),
  (4, 'Card', 31.59, NOW() - INTERVAL '4 days'),
  (5, 'Cash', 98.03, NOW() - INTERVAL '3 days'),
  (6, 'Card', 57.74, NOW() - INTERVAL '2 days'),
  (7, 'Cash', 131.81, NOW() - INTERVAL '1 day'),
  (8, 'Card', 82.80, NOW());

-- Demo order_items
INSERT INTO order_items (order_id, item_id, item_name, qty, unit_price) VALUES
  (1, 1, 'Margherita Classic', 2, 12.99),
  (1, 7, 'Coca-Cola 500ml', 2, 2.49),
  (2, 3, 'BBQ Chicken Feast', 1, 16.99),
  (2, 8, 'Fresh Lemonade', 3, 3.49),
  (5, 10, 'Family Feast Deal', 2, 39.99),
  (7, 5, 'Meat Lovers', 4, 17.99),
  (7, 4, 'Veggie Garden', 2, 13.99),
  (8, 2, 'Pepperoni Supreme', 3, 15.99),
  (8, 12, 'Garlic Bread', 2, 4.99);
