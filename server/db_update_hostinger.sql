-- ==============================================================================
-- HOSTINGER DATABASE UPDATE / MIGRATION SCRIPT
-- Safe & Idempotent (Can be executed multiple times without errors)
-- Target Database: PostgreSQL
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. KHATA (CREDIT CUSTOMERS & TRANSACTIONS) & DISCOUNT PACKAGES (RECENT UPDATES)
-- ==============================================================================

-- A. Create discount_packages table
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

-- B. Update credit_customers table with status, category, extra pay, package link, and registered employee link
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'Regular Customer';
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS company_name VARCHAR(150);
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS is_extra_pay BOOLEAN DEFAULT FALSE;
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS discount_package_id INTEGER REFERENCES discount_packages(id) ON DELETE SET NULL;
ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_credit_customers_employee_id ON credit_customers(employee_id);
CREATE INDEX IF NOT EXISTS idx_credit_customers_discount_package_id ON credit_customers(discount_package_id);
CREATE INDEX IF NOT EXISTS idx_credit_customers_category ON credit_customers(category);
CREATE INDEX IF NOT EXISTS idx_credit_customers_status ON credit_customers(status);

-- C. Update credit_transactions table with month allocation, comments, and extra pay classification
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS billing_month VARCHAR(7);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS comments TEXT;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS classification VARCHAR(50) DEFAULT 'Regular';

CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer_id ON credit_transactions(credit_customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_billing_month ON credit_transactions(billing_month);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_classification ON credit_transactions(classification);

-- D. Link orders table with credit_customers
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_credit_customer_id ON orders(credit_customer_id);

-- E. Create credit_audit_logs table for Khata transaction modifications & balance resets
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
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);


-- ==============================================================================
-- 2. SHIFT CLOSING NEW COLUMNS (CARD DIFFERENCE & CASH DIFFERENCE)
-- ==============================================================================
ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS closing_card NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS card_difference NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(10, 2) DEFAULT 0;


-- ==============================================================================
-- 3. EMPLOYEE DOCUMENTS TABLE
-- ==============================================================================
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


-- ==============================================================================
-- 4. NOTIFICATIONS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  message TEXT,
  type VARCHAR(50),
  target_roles JSONB DEFAULT '[]'::jsonb,
  target_users JSONB DEFAULT '[]'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_users JSONB DEFAULT '[]'::jsonb;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_roles JSONB DEFAULT '[]'::jsonb;


-- ==============================================================================
-- 5. PAYROLL & SALARY SPREADSHEET MODULES
-- ==============================================================================
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

ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS dynamic_adjustments JSONB DEFAULT '{}'::jsonb;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS cash_paid NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS bank_paid NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS last_month_balance NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS payable_salary NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS carried_forward_to_next NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS total_adjustments NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS recurring_adjustments NUMERIC(10, 2) DEFAULT 0;

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

COMMIT;
