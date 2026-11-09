-- Internal Khata Lifecycle & Shift Audit Migration
-- Hostinger PostgreSQL Database

ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT FALSE;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS expected_delivery_at TIMESTAMPTZ;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS delivery_minutes INTEGER DEFAULT 30;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS processing_started_by_user_id INTEGER;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS processing_started_by_name VARCHAR(150);
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS ready_for_dispatch_at TIMESTAMPTZ;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS ready_by_name VARCHAR(150);
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS handover_by_name VARCHAR(150);
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS handover_to_name VARCHAR(150);
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS original_delivery_at TIMESTAMPTZ;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS time_extended_at TIMESTAMPTZ;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS time_extended_by_name VARCHAR(150);
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS time_extend_reason TEXT;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS discrepancy_reason TEXT;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS extension_status VARCHAR(30) DEFAULT 'None';
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS pending_extension_minutes INTEGER;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS pending_extension_reason TEXT;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS pending_extension_requested_by INTEGER;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS pending_extension_requested_by_name VARCHAR(150);
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS pending_extension_requested_at TIMESTAMPTZ;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS total_extended_minutes INTEGER DEFAULT 0;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS original_delivery_minutes INTEGER DEFAULT 30;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS original_needed_by_time VARCHAR(50);
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS extension_reviewed_by_name VARCHAR(150);
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS extension_reviewed_at TIMESTAMPTZ;
ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS extension_rejection_reason TEXT;

ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS confirmed_qty NUMERIC(12,3);
ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS quantity_change_reason TEXT;
ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS internal_branch_activity_logs (
  id SERIAL PRIMARY KEY,
  transfer_id INTEGER REFERENCES internal_branch_transfers(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  from_branch VARCHAR(100),
  to_branch VARCHAR(100),
  performed_by_id INTEGER,
  performed_by_name VARCHAR(150),
  details TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ibal_transfer_id ON internal_branch_activity_logs(transfer_id);

ALTER TABLE internal_branch_activity_logs ADD COLUMN IF NOT EXISTS user_role VARCHAR(50);
ALTER TABLE internal_branch_activity_logs ADD COLUMN IF NOT EXISTS previous_value TEXT;
ALTER TABLE internal_branch_activity_logs ADD COLUMN IF NOT EXISTS new_value TEXT;
ALTER TABLE internal_branch_activity_logs ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE TABLE IF NOT EXISTS shift_closing_audit_logs (
  id SERIAL PRIMARY KEY,
  shift_closing_id INTEGER REFERENCES shift_closings(id) ON DELETE CASCADE,
  shift_id INTEGER,
  branch VARCHAR(100),
  edited_by_user_id INTEGER,
  edited_by_name VARCHAR(150),
  user_role VARCHAR(50),
  previous_cash NUMERIC(12,2),
  updated_cash NUMERIC(12,2),
  previous_card NUMERIC(12,2),
  updated_card NUMERIC(12,2),
  previous_difference NUMERIC(12,2),
  updated_difference NUMERIC(12,2),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scal_closing_id ON shift_closing_audit_logs(shift_closing_id);
