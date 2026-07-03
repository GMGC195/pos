-- Pizza Shop Database Migration: Stock and Product Recipes
-- Run: psql -U postgres -d pizza_shop -f server/migrations/20260326_create_stock_and_recipes.sql

CREATE TABLE IF NOT EXISTS stock (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL UNIQUE,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 0,
  unit VARCHAR(50) NOT NULL, -- e.g., 'g', 'kg', 'pcs', 'liter'
  price_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(10,3) DEFAULT 0,
  low_stock_at TIMESTAMP,
  is_dismissed BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  stock_id INTEGER REFERENCES stock(id) ON DELETE CASCADE,
  quantity_used NUMERIC(10, 2) NOT NULL DEFAULT 0, -- amount of stock used for this recipe
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, stock_id) -- Ensure the same ingredient isn't added multiple times to the same recipe
);

-- Indexes
CREATE INDEX idx_stock_name ON stock(name);
CREATE INDEX idx_recipes_item_id ON recipes(item_id);
