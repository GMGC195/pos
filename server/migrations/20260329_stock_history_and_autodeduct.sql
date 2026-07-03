-- Pizza Shop Database Migration: Stock History and Deduction Support
-- Run: psql -U postgres -d pizza_shop -f server/migrations/20260329_stock_history_and_autodeduct.sql

-- Track daily additions
CREATE TABLE IF NOT EXISTS stock_history (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER REFERENCES stock(id) ON DELETE CASCADE,
  quantity NUMERIC(10, 3) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  price_per_unit NUMERIC(10, 2) NOT NULL,
  total_price NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure stock table supports decimal quantities (e.g., grams in kg)
-- Already NUMERIC(10,2), updating to (10,3) for extra precision if needed
ALTER TABLE stock ALTER COLUMN quantity TYPE NUMERIC(10, 3);

-- Add index for history lookups
CREATE INDEX IF NOT EXISTS idx_stock_history_created ON stock_history(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_history_stock_id ON stock_history(stock_id);
