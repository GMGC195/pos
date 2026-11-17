-- ==============================================================================
-- AL RAWAQ RESTAURANT ERP — INDEPENDENT STORE MANAGEMENT MODULE SCHEMA
-- Namespace: store_* (100% Isolated from legacy stock, recipes, and POS tables)
-- Timezone: Asia/Riyadh | Currency: SAR
-- ==============================================================================

-- 1. STORE LOCATIONS (Branch-Aware Storage Rooms & Central Stores)
CREATE TABLE IF NOT EXISTS store_locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  branch VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE,
  store_type VARCHAR(50) DEFAULT 'Branch Store', -- 'Central Store', 'Kitchen Store', 'Branch Store', 'Cold Store'
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_loc_branch ON store_locations(branch);
CREATE INDEX IF NOT EXISTS idx_store_loc_active ON store_locations(is_active);

-- 2. DYNAMIC STORE CATEGORIES
CREATE TABLE IF NOT EXISTS store_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'Package',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. MEASUREMENT UNITS & CONVERSIONS
CREATE TABLE IF NOT EXISTS store_units (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  short_code VARCHAR(20) UNIQUE NOT NULL,
  base_unit VARCHAR(20),
  conversion_factor NUMERIC(12,4) DEFAULT 1.0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INDEPENDENT VENDOR DIRECTORY
CREATE TABLE IF NOT EXISTS store_vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(150),
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  email VARCHAR(150),
  address TEXT,
  tax_number VARCHAR(50),
  payment_terms VARCHAR(50) DEFAULT 'Cash', -- 'Cash', 'Credit 15 Days', 'Credit 30 Days', 'Bank Transfer'
  current_balance NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'Active', -- 'Active', 'Inactive'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_vendors_name ON store_vendors(name);
CREATE INDEX IF NOT EXISTS idx_store_vendors_status ON store_vendors(status);

-- 5. INDEPENDENT STORE ITEMS (Item Master for Raw Materials, Groceries, Packaging)
CREATE TABLE IF NOT EXISTS store_items (
  id SERIAL PRIMARY KEY,
  item_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  arabic_name VARCHAR(200),
  category_id INTEGER REFERENCES store_categories(id) ON DELETE SET NULL,
  primary_unit VARCHAR(50) NOT NULL DEFAULT 'KG',
  secondary_unit VARCHAR(50),
  unit_conversion_ratio NUMERIC(12,4) DEFAULT 1.0, -- e.g. 1 Bag = 25 KG
  default_vendor_id INTEGER REFERENCES store_vendors(id) ON DELETE SET NULL,
  min_stock_level NUMERIC(12,3) DEFAULT 5.0,
  reorder_quantity NUMERIC(12,3) DEFAULT 10.0,
  last_purchase_price NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'Active', -- 'Active', 'Inactive', 'Archived'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_items_code ON store_items(item_code);
CREATE INDEX IF NOT EXISTS idx_store_items_cat ON store_items(category_id);
CREATE INDEX IF NOT EXISTS idx_store_items_status ON store_items(status);

-- 6. VENDOR TO ITEM MAPPING (Multiple vendors per item with last prices)
CREATE TABLE IF NOT EXISTS store_vendor_items (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER REFERENCES store_vendors(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES store_items(id) ON DELETE CASCADE,
  vendor_item_code VARCHAR(100),
  last_quoted_price NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_store_vi_vendor ON store_vendor_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_store_vi_item ON store_vendor_items(item_id);

-- 7. STORE INVENTORY (Current Stock per Store Location & Item)
CREATE TABLE IF NOT EXISTS store_inventory (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES store_locations(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES store_items(id) ON DELETE CASCADE,
  current_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_stock_level NUMERIC(12,3) DEFAULT 5.0,
  last_closing_stock NUMERIC(12,3) DEFAULT 0,
  last_received_stock NUMERIC(12,3) DEFAULT 0,
  last_consumption NUMERIC(12,3) DEFAULT 0,
  last_entry_date DATE,
  last_entry_shift VARCHAR(20),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_store_inv_store ON store_inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_store_inv_item ON store_inventory(item_id);

-- 8. STORE STOCK ENTRIES (Day & Night Shift Submissions)
CREATE TABLE IF NOT EXISTS store_stock_entries (
  id SERIAL PRIMARY KEY,
  entry_number VARCHAR(50) UNIQUE NOT NULL,
  store_id INTEGER REFERENCES store_locations(id) ON DELETE CASCADE,
  branch VARCHAR(100) NOT NULL,
  entry_date DATE NOT NULL,
  shift VARCHAR(20) NOT NULL, -- 'Day' or 'Night'
  status VARCHAR(20) DEFAULT 'Draft', -- 'Draft', 'Submitted', 'Reopened'
  total_items INTEGER DEFAULT 0,
  total_consumption_value NUMERIC(12,2) DEFAULT 0,
  submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_name VARCHAR(150),
  submitted_at TIMESTAMPTZ,
  reopened_by_name VARCHAR(150),
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, entry_date, shift)
);
CREATE INDEX IF NOT EXISTS idx_store_se_store_date ON store_stock_entries(store_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_store_se_status ON store_stock_entries(status);

-- 9. STORE STOCK ENTRY ITEMS (Item Lines with Calculation: Consumption = Prev + Recv - InHand)
CREATE TABLE IF NOT EXISTS store_stock_entry_items (
  id SERIAL PRIMARY KEY,
  entry_id INTEGER REFERENCES store_stock_entries(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES store_items(id) ON DELETE CASCADE,
  unit VARCHAR(50) NOT NULL,
  previous_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  received_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  in_hand_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  calculated_consumption NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  total_cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  UNIQUE(entry_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_store_sei_entry ON store_stock_entry_items(entry_id);
CREATE INDEX IF NOT EXISTS idx_store_sei_item ON store_stock_entry_items(item_id);

-- 10. STORE STOCK HISTORY (Granular Movement & Audit Log)
CREATE TABLE IF NOT EXISTS store_stock_history (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES store_locations(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES store_items(id) ON DELETE CASCADE,
  movement_type VARCHAR(50) NOT NULL, -- 'PURCHASE_RECEIPT', 'SHIFT_CONSUMPTION', 'MANUAL_ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT'
  reference_id VARCHAR(100),
  quantity_change NUMERIC(12,3) NOT NULL,
  stock_before NUMERIC(12,3) NOT NULL,
  stock_after NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,2) DEFAULT 0,
  total_value NUMERIC(12,2) DEFAULT 0,
  performed_by_name VARCHAR(150),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_sh_item ON store_stock_history(item_id);
CREATE INDEX IF NOT EXISTS idx_store_sh_store ON store_stock_history(store_id);
CREATE INDEX IF NOT EXISTS idx_store_sh_created ON store_stock_history(created_at DESC);

-- 11. INDEPENDENT STORE PURCHASES
CREATE TABLE IF NOT EXISTS store_purchases (
  id SERIAL PRIMARY KEY,
  purchase_number VARCHAR(50) UNIQUE NOT NULL,
  vendor_id INTEGER REFERENCES store_vendors(id) ON DELETE RESTRICT,
  store_id INTEGER REFERENCES store_locations(id) ON DELETE CASCADE,
  branch VARCHAR(100) NOT NULL,
  invoice_number VARCHAR(100),
  invoice_date DATE NOT NULL,
  delivery_date DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT 'Cash', -- 'Cash', 'Credit', 'Bank Transfer'
  payment_status VARCHAR(30) DEFAULT 'Unpaid', -- 'Paid', 'Unpaid', 'Partial'
  status VARCHAR(30) DEFAULT 'Received', -- 'Draft', 'Received', 'Cancelled'
  received_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  received_by_name VARCHAR(150),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_pur_vendor ON store_purchases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_store_pur_store ON store_purchases(store_id);
CREATE INDEX IF NOT EXISTS idx_store_pur_date ON store_purchases(invoice_date);

-- 12. STORE PURCHASE ITEMS
CREATE TABLE IF NOT EXISTS store_purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER REFERENCES store_purchases(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES store_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL,
  expiry_date DATE,
  batch_number VARCHAR(100),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_store_pi_purchase ON store_purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_store_pi_item ON store_purchase_items(item_id);

-- 13. INDEPENDENT VENDOR TRANSACTIONS LEDGER
CREATE TABLE IF NOT EXISTS store_vendor_transactions (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER REFERENCES store_vendors(id) ON DELETE CASCADE,
  purchase_id INTEGER REFERENCES store_purchases(id) ON DELETE SET NULL,
  transaction_type VARCHAR(30) NOT NULL, -- 'PURCHASE_BILL', 'PAYMENT', 'RETURN', 'ADJUSTMENT'
  amount NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'Cash',
  reference_number VARCHAR(100),
  performed_by_name VARCHAR(150),
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_vt_vendor ON store_vendor_transactions(vendor_id);

-- 14. NEW ITEM REQUISITION & APPROVAL WORKFLOW
CREATE TABLE IF NOT EXISTS store_item_requests (
  id SERIAL PRIMARY KEY,
  request_number VARCHAR(50) UNIQUE NOT NULL,
  store_id INTEGER REFERENCES store_locations(id) ON DELETE CASCADE,
  branch VARCHAR(100) NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  category_id INTEGER REFERENCES store_categories(id) ON DELETE SET NULL,
  unit VARCHAR(50) NOT NULL,
  required_quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  min_stock NUMERIC(12,3) DEFAULT 5,
  suggested_vendor VARCHAR(200),
  estimated_price NUMERIC(12,2),
  requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_by_name VARCHAR(150),
  reason TEXT,
  status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
  reviewed_by_name VARCHAR(150),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  approved_item_id INTEGER REFERENCES store_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_ir_status ON store_item_requests(status);

-- 15. FUTURE INTEGRATION READINESS LAYER (Inactive & isolated)
CREATE TABLE IF NOT EXISTS store_external_item_mappings (
  id SERIAL PRIMARY KEY,
  store_item_id INTEGER REFERENCES store_items(id) ON DELETE CASCADE,
  external_stock_id INTEGER, -- Reserved for future link to stock.id
  external_item_id INTEGER,  -- Reserved for future link to items.id
  mapping_type VARCHAR(50) DEFAULT 'MANUAL',
  conversion_multiplier NUMERIC(12,4) DEFAULT 1.0,
  is_sync_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_item_id)
);

-- 16. STORE SETTINGS
CREATE TABLE IF NOT EXISTS store_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEED ESSENTIAL DEFAULT DATA (Idempotent)
INSERT INTO store_categories (name, description, icon, sort_order) VALUES
  ('Dairy', 'Milk, butter, cheeses, yogurts', 'Milk', 1),
  ('Dry Goods', 'Flour, rice, sugar, pulses, grains', 'Boxes', 2),
  ('Meat & Poultry', 'Mutton, beef, fresh chicken, mince', 'Beef', 3),
  ('Beverages', 'Soft drinks, juices, syrups, tea, coffee', 'Coffee', 4),
  ('Water', 'Bottled drinking water, mineral jugs', 'Droplet', 5),
  ('Packaging', 'Pizza boxes, takeout containers, bags, foil', 'Package', 6),
  ('Spices & Sauces', 'Masalas, cooking oil, sauces, pastes', 'Flame', 7),
  ('Vegetables & Fresh', 'Onions, tomatoes, greens, herbs', 'Carrot', 8),
  ('Cleaning & Chemical', 'Dishwash, sanitizers, floor cleaner', 'Sparkles', 9),
  ('Other', 'Miscellaneous store supplies', 'MoreHorizontal', 10)
ON CONFLICT (name) DO NOTHING;

INSERT INTO store_units (name, short_code, conversion_factor) VALUES
  ('Kilogram', 'KG', 1.0),
  ('Gram', 'G', 0.001),
  ('Liter', 'L', 1.0),
  ('Milliliter', 'ML', 0.001),
  ('Piece', 'PCS', 1.0),
  ('Box', 'BOX', 1.0),
  ('Carton', 'CTN', 1.0),
  ('Tin', 'TIN', 1.0),
  ('Bag', 'BAG', 1.0),
  ('Packet', 'PKT', 1.0)
ON CONFLICT (short_code) DO NOTHING;
