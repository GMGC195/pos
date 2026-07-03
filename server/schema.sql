-- Pizza Shop Database Schema
-- Run: psql -U postgres -d pizza_shop -f schema.sql

-- Drop tables if they exist (for clean re-run)
DROP TABLE IF EXISTS order_item_usage CASCADE;
DROP TABLE IF EXISTS waste_stock CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS stock_history CASCADE;
DROP TABLE IF EXISTS stock CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) DEFAULT 'Admin',
  otp VARCHAR(10),
  otp_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

-- Items / Menu
CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT '',
  size_options TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(10, 2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) DEFAULT 'Completed',
  client_order_id UUID UNIQUE,
  customer_name VARCHAR(150),
  customer_phone VARCHAR(50),
  customer_address TEXT,
  discount NUMERIC(10, 2) DEFAULT 0,
  cancel_requested BOOLEAN DEFAULT FALSE,
  cancel_reason TEXT,
  slip_number INTEGER,
  is_edited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order Items
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name VARCHAR(200),
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0
);

-- Transactions (payment records)
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  payment_method VARCHAR(30) DEFAULT 'Cash',
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_items_category ON items(category_id);
