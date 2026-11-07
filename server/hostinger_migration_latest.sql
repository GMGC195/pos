-- ==============================================================================
-- HOSTINGER DATABASE SCHEMA MIGRATION (LATEST UPDATES - ALL MODULES)
-- Use this file in phpPgAdmin, DBeaver, pgAdmin or psql to update database
-- ==============================================================================

BEGIN;

-- 1. SALARY AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS salary_audit_logs (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  employee_name VARCHAR(150),
  employee_code VARCHAR(50),
  month VARCHAR(7),
  action VARCHAR(100) NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  amount NUMERIC(10, 2),
  description TEXT,
  performed_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_salary_audit_logs_emp ON salary_audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_audit_logs_month ON salary_audit_logs(month);
CREATE INDEX IF NOT EXISTS idx_salary_audit_logs_created ON salary_audit_logs(created_at DESC);

-- 2. EMPLOYEE PAYROLL PAYMENTS TABLE (MULTIPLE INSTALLMENTS)
CREATE TABLE IF NOT EXISTS employee_payroll_payments (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  paid_by VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_payroll_payments_emp_month ON employee_payroll_payments(employee_id, month);

-- 3. EMPLOYEE PAYROLL RECORDS COLUMNS
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS dynamic_adjustments JSONB DEFAULT '{}'::jsonb;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS cash_paid NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS bank_paid NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS last_month_balance NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS payable_salary NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS carried_forward_to_next NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS total_adjustments NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS recurring_adjustments NUMERIC(10, 2) DEFAULT 0;

-- 4. FINANCIAL & RECURRING ADJUSTMENTS TABLES
CREATE TABLE IF NOT EXISTS payroll_adjustment_types (
  id SERIAL PRIMARY KEY,
  label VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(20) DEFAULT 'One-Time',
  action VARCHAR(20) DEFAULT 'Add',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_financial_adjustments (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  custom_label VARCHAR(150),
  amount NUMERIC(10, 2) NOT NULL,
  action_type VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE employee_financial_adjustments ADD COLUMN IF NOT EXISTS custom_label VARCHAR(150);
ALTER TABLE employee_financial_adjustments ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS employee_recurring_adjustments (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  custom_label VARCHAR(150),
  amount NUMERIC(10, 2) NOT NULL,
  amount_type VARCHAR(20) DEFAULT 'Fixed',
  action_type VARCHAR(20) NOT NULL,
  remaining_amount NUMERIC(10, 2),
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE employee_recurring_adjustments ADD COLUMN IF NOT EXISTS custom_label VARCHAR(150);
ALTER TABLE employee_recurring_adjustments ADD COLUMN IF NOT EXISTS amount_type VARCHAR(20) DEFAULT 'Fixed';
ALTER TABLE employee_recurring_adjustments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE employee_recurring_adjustments ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE employee_recurring_adjustments ADD COLUMN IF NOT EXISTS end_date DATE;

-- 5. DISCOUNT PACKAGES TABLE (KHATA / POS)
CREATE TABLE IF NOT EXISTS discount_packages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_rules JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE discount_packages ADD COLUMN IF NOT EXISTS discount_rules JSONB DEFAULT '[]'::jsonb;

-- 6. KHATA / CREDIT CUSTOMERS & TRANSACTIONS
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'Regular Customer';
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS company_name VARCHAR(150);
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS is_extra_pay BOOLEAN DEFAULT FALSE;
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS discount_package_id INTEGER REFERENCES discount_packages(id) ON DELETE SET NULL;
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS branch VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_credit_customers_employee_id ON credit_customers(employee_id);
CREATE INDEX IF NOT EXISTS idx_credit_customers_discount_package_id ON credit_customers(discount_package_id);
CREATE INDEX IF NOT EXISTS idx_credit_customers_category ON credit_customers(category);
CREATE INDEX IF NOT EXISTS idx_credit_customers_status ON credit_customers(status);

ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS billing_month VARCHAR(7);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS comments TEXT;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS classification VARCHAR(50) DEFAULT 'Regular';
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS is_shift_closed BOOLEAN DEFAULT FALSE;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS is_daily_closed BOOLEAN DEFAULT FALSE;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS cashier_name VARCHAR(100);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer_id ON credit_transactions(credit_customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_billing_month ON credit_transactions(billing_month);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_classification ON credit_transactions(classification);

-- 7. KHATA AUDIT LOGS (EDITS, DELETIONS & BALANCE RESETS)
CREATE TABLE IF NOT EXISTS credit_audit_logs (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER REFERENCES credit_transactions(id) ON DELETE SET NULL,
  credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  performed_by VARCHAR(100) NOT NULL,
  performed_by_role VARCHAR(50),
  previous_values JSONB,
  new_values JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_audit_customer ON credit_audit_logs(credit_customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_audit_created ON credit_audit_logs(created_at DESC);

-- 8. ATTENDANCE EDIT REQUESTS (EMPLOYEE PORTAL MARK ATTENDANCE WORKFLOW)
CREATE TABLE IF NOT EXISTS attendance_edit_requests (
  id SERIAL PRIMARY KEY,
  attendance_id INTEGER REFERENCES employee_attendance(id) ON DELETE CASCADE,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  requested_by_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  target_role VARCHAR(20) NOT NULL,
  requested_check_in TIMESTAMPTZ,
  requested_check_out TIMESTAMPTZ,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'Pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  request_type VARCHAR(20) DEFAULT 'Edit'
);
ALTER TABLE attendance_edit_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) DEFAULT 'Edit';
CREATE INDEX IF NOT EXISTS idx_attendance_edit_requests_emp ON attendance_edit_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_edit_requests_status ON attendance_edit_requests(status);

-- 9. EDITED ATTENDANCE AUDIT LOGS
CREATE TABLE IF NOT EXISTS edited_attendance (
  id SERIAL PRIMARY KEY,
  attendance_id INTEGER REFERENCES employee_attendance(id) ON DELETE CASCADE,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  original_check_in TIMESTAMPTZ,
  original_check_out TIMESTAMPTZ,
  new_check_in TIMESTAMPTZ,
  new_check_out TIMESTAMPTZ,
  edited_by VARCHAR(150),
  reason TEXT,
  edited_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_edited_attendance_emp ON edited_attendance(employee_id);

-- 10. EMPLOYEE ATTENDANCE SHIFT TRACKING & REMARKS
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_name VARCHAR(50);
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_hours NUMERIC(4, 2);
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_start_time VARCHAR(20);
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_end_time VARCHAR(20);
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS created_by VARCHAR(150);
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS branch VARCHAR(100);

-- 11. USERS TABLE STAFF LINKAGE & CREDENTIALS
ALTER TABLE users ADD COLUMN IF NOT EXISTS shift VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

-- 12. CENTRAL ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  entity_name VARCHAR(255),
  description TEXT,
  reason TEXT,
  old_data JSONB,
  new_data JSONB,
  performed_by VARCHAR(100),
  branch VARCHAR(100),
  month VARCHAR(7),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON activity_logs(module);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- 13. ORDERS & SHIFT CLOSINGS ENHANCEMENTS
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_credit_customer_id ON orders(credit_customer_id);

ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS closing_card NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS card_difference NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS credit_sales DECIMAL(10,2) DEFAULT 0;

-- 14. EMPLOYEE DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS employee_documents (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  document_name VARCHAR(255) NOT NULL,
  document_type VARCHAR(50),
  document_number VARCHAR(100),
  note TEXT,
  file_url TEXT,
  file_path TEXT,
  expiry_date DATE,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(50);
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS document_number VARCHAR(100);
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS expiry_date DATE;
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON employee_documents(employee_id);

-- 15. INTERNAL BRANCH TRANSFERS
CREATE TABLE IF NOT EXISTS internal_branch_transfers (
  id SERIAL PRIMARY KEY,
  transfer_id VARCHAR(50) UNIQUE NOT NULL,
  from_branch VARCHAR(100) NOT NULL,
  to_branch VARCHAR(100) NOT NULL,
  requested_by_user_id INTEGER,
  requested_by_name VARCHAR(150),
  request_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  needed_by_time VARCHAR(50),
  status VARCHAR(30) DEFAULT 'Pending',
  dispatched_at TIMESTAMPTZ,
  dispatched_by_user_id INTEGER,
  dispatched_by_name VARCHAR(150),
  received_at TIMESTAMPTZ,
  received_by_user_id INTEGER,
  received_by_name VARCHAR(150),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ibt_from_branch ON internal_branch_transfers(from_branch);
CREATE INDEX IF NOT EXISTS idx_ibt_to_branch ON internal_branch_transfers(to_branch);
CREATE INDEX IF NOT EXISTS idx_ibt_status ON internal_branch_transfers(status);
CREATE INDEX IF NOT EXISTS idx_ibt_request_date ON internal_branch_transfers(request_date);

-- 16. INTERNAL BRANCH TRANSFER ITEMS
CREATE TABLE IF NOT EXISTS internal_branch_transfer_items (
  id SERIAL PRIMARY KEY,
  transfer_id INTEGER REFERENCES internal_branch_transfers(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  dish_name VARCHAR(255) NOT NULL,
  uom VARCHAR(50) NOT NULL,
  requested_qty NUMERIC(12,3) NOT NULL,
  sent_qty NUMERIC(12,3),
  received_qty NUMERIC(12,3),
  variance_qty NUMERIC(12,3),
  remarks TEXT,
  image_url TEXT,
  price NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ibti_transfer_id ON internal_branch_transfer_items(transfer_id);

ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT FALSE;
ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

-- 17. SHIFT CLOSING AUDIT LOGS
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
CREATE INDEX IF NOT EXISTS idx_scal_shift_closing_id ON shift_closing_audit_logs(shift_closing_id);

COMMIT;

