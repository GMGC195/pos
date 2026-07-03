-- Pizza Shop Database Migration: Waste Stock History
-- Run: psql -U postgres -d pizza_shop -f server/migrations/20260404_waste_stock.sql

CREATE TABLE IF NOT EXISTS stock_waste_history (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER REFERENCES stock(id) ON DELETE CASCADE,
  stock_history_id INTEGER REFERENCES stock_history(id) ON DELETE SET NULL,
  quantity NUMERIC(10, 3) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_waste_history_created ON stock_waste_history(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_waste_history_stock_id ON stock_waste_history(stock_id);
