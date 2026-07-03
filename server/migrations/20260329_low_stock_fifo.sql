-- Pizza Shop Database Migration: Low Stock Alerts and FIFO Tracking
-- Run: psql -U postgres -d pizza_shop -f server/migrations/20260329_low_stock_fifo.sql

-- 1. Add threshold and remaining quantity tracking
ALTER TABLE stock ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(10, 3) DEFAULT 0;
ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS remaining_quantity NUMERIC(10, 3);

-- Initialize remaining_quantity for existing history records
UPDATE stock_history SET remaining_quantity = quantity WHERE remaining_quantity IS NULL;

-- 2. Table to track specific batch usage for FIFO and reversals
CREATE TABLE IF NOT EXISTS order_item_usage (
  id SERIAL PRIMARY KEY,
  order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
  stock_history_id INTEGER REFERENCES stock_history(id) ON DELETE CASCADE,
  quantity_used NUMERIC(10, 3) NOT NULL,
  cost_at_time NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_history_remaining ON stock_history(stock_id, remaining_quantity) WHERE remaining_quantity > 0;
CREATE INDEX IF NOT EXISTS idx_order_item_usage_item ON order_item_usage(order_item_id);
