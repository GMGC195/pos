#!/usr/bin/env node

/**
 * ==============================================================================
 * SINGLE RUN HOSTINGER DATABASE MIGRATION SCRIPT
 * Usage on Hostinger SSH/Terminal:
 *   cd server && node run_hostinger_migration.js
 * Or from project root:
 *   node server/run_hostinger_migration.js
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

// 1. Locate .env file
const envPath = fs.existsSync(path.join(__dirname, '.env')) 
  ? path.join(__dirname, '.env')
  : path.join(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('\x1b[31m%s\x1b[0m', '❌ ERROR: DATABASE_URL is not set in .env file!');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('neon.tech') || databaseUrl.includes('sslmode=require') 
    ? { rejectUnauthorized: false } 
    : undefined
});

async function runMigration() {
  console.log('\x1b[36m%s\x1b[0m', '==================================================');
  console.log('\x1b[36m%s\x1b[0m', '🚀 STARTING HOSTINGER DATABASE MIGRATION...');
  console.log('\x1b[36m%s\x1b[0m', '==================================================');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create salary_audit_logs table
    console.log('📌 1/5 Creating salary_audit_logs table and indexes...');
    await client.query(`
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
    `);

    // 2. Create employee_payroll_payments table
    console.log('📌 2/5 Creating employee_payroll_payments table and indexes...');
    await client.query(`
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
    `);

    // 3. Add columns to employee_payroll_records
    console.log('📌 3/5 Adding new columns to employee_payroll_records...');
    await client.query(`
      ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS dynamic_adjustments JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS cash_paid NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS bank_paid NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS last_month_balance NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS payable_salary NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS carried_forward_to_next NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS total_adjustments NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE employee_payroll_records ADD COLUMN IF NOT EXISTS recurring_adjustments NUMERIC(10, 2) DEFAULT 0;
    `);

    // 4. Create and update financial & recurring adjustments tables
    console.log('📌 4/5 Creating adjustment tables and columns...');
    await client.query(`
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
    `);

    // 5. Historical payments & audit logs sync
    console.log('📌 5/5 Synchronizing historical payments into employee_payroll_payments...');
    const syncCashRes = await client.query(`
      INSERT INTO employee_payroll_payments (employee_id, month, payment_method, amount, paid_by, notes, created_at)
      SELECT r.employee_id, r.month, 'Cash', r.cash_paid, 'Admin', 'Salary settlement', COALESCE(r.paid_date, NOW())
      FROM employee_payroll_records r
      WHERE r.cash_paid > 0
        AND NOT EXISTS (
          SELECT 1 FROM employee_payroll_payments p 
          WHERE p.employee_id = r.employee_id AND p.month = r.month AND LOWER(p.payment_method) = 'cash'
        )
      RETURNING id;
    `);

    const syncBankRes = await client.query(`
      INSERT INTO employee_payroll_payments (employee_id, month, payment_method, amount, paid_by, notes, created_at)
      SELECT r.employee_id, r.month, 'Bank', r.bank_paid, 'Admin', 'Bank transfer', COALESCE(r.paid_date, NOW())
      FROM employee_payroll_records r
      WHERE r.bank_paid > 0
        AND NOT EXISTS (
          SELECT 1 FROM employee_payroll_payments p 
          WHERE p.employee_id = r.employee_id AND p.month = r.month AND LOWER(p.payment_method) = 'bank'
        )
      RETURNING id;
    `);

    console.log(`   ✓ Synced ${syncCashRes.rowCount} cash payments & ${syncBankRes.rowCount} bank payments.`);

    // 6. Khata (Credit Module), Discount Packages, and Shift Closings updates
    console.log('📌 6/6 Migrating Khata (Credit module), Discount Packages & Shift Closing columns...');
    await client.query(`
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

      -- B. Update credit_customers table
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

      -- C. Update credit_transactions table
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS billing_month VARCHAR(7);
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS comments TEXT;
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS classification VARCHAR(50) DEFAULT 'Regular';

      CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer_id ON credit_transactions(credit_customer_id);
      CREATE INDEX IF NOT EXISTS idx_credit_transactions_billing_month ON credit_transactions(billing_month);
      CREATE INDEX IF NOT EXISTS idx_credit_transactions_classification ON credit_transactions(classification);

      -- D. Update orders table credit customer link
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_orders_credit_customer_id ON orders(credit_customer_id);

      -- E. Update shift_closings columns
      ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS closing_card NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS card_difference NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(10, 2) DEFAULT 0;

      -- F. Employee Documents table
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
    `);
    console.log('   ✓ Khata & system schema migration verified and applied successfully.');

    await client.query('COMMIT');
    console.log('\x1b[32m%s\x1b[0m', '==================================================');
    console.log('\x1b[32m%s\x1b[0m', '✅ SUCCESS: ALL DATABASE MIGRATIONS COMPLETED!');
    console.log('\x1b[32m%s\x1b[0m', '==================================================');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\x1b[31m%s\x1b[0m', '❌ MIGRATION FAILED:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

