/**
 * ==============================================================================
 * DATABASE SCHEMA MIGRATION: LAST 5 DAYS (Nov 8 - Nov 13, 2026)
 * ==============================================================================
 * Covers only the database schema changes made in the last 5 days:
 *   1. Credit:
 *      - credit_customers.branch
 *      - credit_transactions.cashier_name
 *      - credit_transactions.payment_method
 *   2. Shift Closings:
 *      - shift_closing_audit_logs table & index
 *   3. Internal Branch Transfers & Activity Logs:
 *      - internal_branch_transfers table, columns & indexes
 *      - internal_branch_transfer_items table, columns & indexes
 *      - internal_branch_activity_logs table, columns & indexes
 *
 * NOTE FOR PAYROLL (Nov 11 - Nov 13):
 *   No database schema changes were required for the latest Payroll /
 *   Salary Pay Dashboard updates (they utilize existing tables).
 *
 * Usage on Hostinger SSH/Terminal:
 *   node server/migrate_last_5_days_schema.js
 * ==============================================================================
 */

const path = require('path');
const fs = require('fs');

// 1. Locate .env
const envPath = fs.existsSync(path.join(__dirname, '.env'))
  ? path.join(__dirname, '.env')
  : path.join(__dirname, '../.env');

require('dotenv').config({ path: envPath });

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
  console.log('\x1b[36m%s\x1b[0m', '====================================================');
  console.log('\x1b[36m%s\x1b[0m', '🚀 STARTING DATABASE MIGRATION (LAST 5 DAYS SCHEMA)');
  console.log('\x1b[36m%s\x1b[0m', '====================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Credit Schema Updates
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [1/4] Verifying Credit schema updates...');
    await client.query(`
      ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS cashier_name VARCHAR(100);
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
      CREATE INDEX IF NOT EXISTS idx_credit_customers_branch ON credit_customers(branch);
      CREATE INDEX IF NOT EXISTS idx_credit_transactions_branch ON credit_transactions(branch);
    `);
    console.log('   ✓ credit_customers & credit_transactions updated.');

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Shift Closing Audit Logs
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [2/4] Verifying "shift_closing_audit_logs" table...');
    await client.query(`
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
      CREATE INDEX IF NOT EXISTS idx_scal_branch ON shift_closing_audit_logs(branch);
    `);
    console.log('   ✓ shift_closing_audit_logs table and indexes verified.');

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Internal Branch Transfer Tables & Columns
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [3/4] Verifying "internal_branch_transfers" & items...');
    await client.query(`
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
      ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS request_type VARCHAR(50) DEFAULT 'Transfer Request';
      ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'Normal';

      CREATE INDEX IF NOT EXISTS idx_ibt_priority ON internal_branch_transfers(priority);
      CREATE INDEX IF NOT EXISTS idx_ibt_request_type ON internal_branch_transfers(request_type);
      CREATE INDEX IF NOT EXISTS idx_ibt_created_at ON internal_branch_transfers(created_at DESC);

      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS confirmed_qty NUMERIC(12,3);
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS quantity_change_reason TEXT;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
    `);
    console.log('   ✓ internal_branch_transfers & items verified.');

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Internal Branch Activity Logs
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [4/4] Verifying "internal_branch_activity_logs" table...');
    await client.query(`
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
    `);
    console.log('   ✓ internal_branch_activity_logs verified.');

    await client.query('COMMIT');

    console.log('\n\x1b[32m%s\x1b[0m', '====================================================');
    console.log('\x1b[32m%s\x1b[0m', '✅ SUCCESS: MIGRATION COMPLETED SAFELY (0 ERRORS)!');
    console.log('\x1b[32m%s\x1b[0m', '====================================================');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MIGRATION FAILED — TRANSACTION ROLLED BACK:');
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration();

