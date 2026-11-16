/**
 * ==============================================================================
 * DATABASE SCHEMA MIGRATION: LAST 5 DAYS (Nov 12 - Nov 17, 2026)
 * ==============================================================================
 * Covers all database schema changes made in the last 5 days:
 *   1. Credit:
 *      - credit_customers.branch
 *      - credit_transactions.cashier_name
 *      - credit_transactions.payment_method
 *   2. Shift Closings:
 *      - shift_closings columns: closing_card, card_difference, cash_difference, credit_sales
 *      - shift_closing_audit_logs table & indexes
 *   3. Settings:
 *      - settings.report_emails (JSONB)
 *   4. Internal Branch Transfers & Activity Logs:
 *      - internal_branch_transfers table & all workflow columns (including accepted_by_name, accepted_at, delivery_day, etc.)
 *      - internal_branch_transfer_items table & all item-level partial dispatch/receive columns
 *      - internal_branch_activity_logs table & columns
 *   5. Salary Payable Permissions:
 *      - salary_payable_permissions table, allowed_view_months & allowed_pay_months columns
 *
 * Usage on Hostinger SSH/Terminal:
 *   node server/migrate_last_5_days_schema.js
 * Or from server directory:
 *   node migrate_last_5_days_schema.js
 * ==============================================================================
 */

const path = require('path');
const fs = require('fs');

// 1. Locate .env
const envPath = fs.existsSync(path.join(__dirname, '.env'))
  ? path.join(__dirname, '.env')
  : path.join(__dirname, '../.env');

require('dotenv').config({ path: envPath });
require('dotenv').config();

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
  console.log('\x1b[36m%s\x1b[0m', '🚀 STARTING COMPLETE DATABASE MIGRATION (LAST 5 DAYS)');
  console.log('\x1b[36m%s\x1b[0m', '====================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Credit Schema Updates
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [1/6] Verifying Credit schema updates...');
    await client.query(`
      ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS cashier_name VARCHAR(100);
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
      CREATE INDEX IF NOT EXISTS idx_credit_customers_branch ON credit_customers(branch);
      CREATE INDEX IF NOT EXISTS idx_credit_transactions_branch ON credit_transactions(branch);
    `);
    console.log('   ✓ credit_customers & credit_transactions updated.');

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Shift Closings & Audit Logs
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [2/6] Verifying Shift Closings & Audit Logs...');
    await client.query(`
      ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS closing_card NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS card_difference NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE shift_closings ADD COLUMN IF NOT EXISTS credit_sales DECIMAL(10,2) DEFAULT 0;

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
    console.log('   ✓ shift_closing_audit_logs and shift_closings columns verified.');

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Settings Table Updates
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [3/6] Verifying Settings schema updates...');
    await client.query(`
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS report_emails JSONB DEFAULT '[]'::jsonb;
    `);
    console.log('   ✓ settings.report_emails verified.');

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Internal Branch Transfers & Transfer Items
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [4/6] Verifying Internal Branch Transfers & Transfer Items...');
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
      ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS delivery_day VARCHAR(50) DEFAULT 'Today';
      ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
      ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(150);
      ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS accepted_by_name VARCHAR(150);
      ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_ibt_priority ON internal_branch_transfers(priority);
      CREATE INDEX IF NOT EXISTS idx_ibt_request_type ON internal_branch_transfers(request_type);
      CREATE INDEX IF NOT EXISTS idx_ibt_created_at ON internal_branch_transfers(created_at DESC);

      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS confirmed_qty NUMERIC(12,3);
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS quantity_change_reason TEXT;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS quantity_history JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS item_status VARCHAR(50) DEFAULT 'Pending';
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS accepted_qty NUMERIC(12,2) DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS rejected_qty NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS modification_reason TEXT DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS accepted_by_name VARCHAR(150) DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS needed_by_time VARCHAR(50) DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS needed_by_date VARCHAR(50) DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'Normal';
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS dispatched_qty NUMERIC(12,2) DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS sent_qty NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC(12,2) DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS rejected_by_name VARCHAR(150) DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS pending_receive_qty NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS pending_dispatch_qty NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS rejected_receive_qty NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS receive_rejection_reason TEXT DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS receive_rejected_by_name VARCHAR(150) DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS receive_rejected_at TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS is_additional BOOLEAN DEFAULT FALSE;
      ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS remarks TEXT;
    `);
    console.log('   ✓ internal_branch_transfers & items verified.');

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Internal Branch Activity Logs
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [5/6] Verifying "internal_branch_activity_logs" table...');
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

    // ──────────────────────────────────────────────────────────────────────────
    // 6. Salary Payable Permissions
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [6/6] Verifying "salary_payable_permissions" table & columns...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_payable_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        permission_type VARCHAR(20) DEFAULT 'pay_now',
        allowed_months JSONB DEFAULT '[]'::jsonb,
        allowed_view_months JSONB DEFAULT '[]'::jsonb,
        allowed_pay_months JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(100)
      );
      CREATE INDEX IF NOT EXISTS idx_spp_user_id ON salary_payable_permissions(user_id);

      ALTER TABLE salary_payable_permissions ADD COLUMN IF NOT EXISTS allowed_view_months JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE salary_payable_permissions ADD COLUMN IF NOT EXISTS allowed_pay_months JSONB DEFAULT '[]'::jsonb;

      UPDATE salary_payable_permissions 
      SET allowed_view_months = allowed_months 
      WHERE (allowed_view_months IS NULL OR allowed_view_months = '[]'::jsonb) 
        AND allowed_months IS NOT NULL AND allowed_months != '[]'::jsonb;

      UPDATE salary_payable_permissions 
      SET allowed_pay_months = allowed_months 
      WHERE (allowed_pay_months IS NULL OR allowed_pay_months = '[]'::jsonb) 
        AND permission_type = 'pay_now' 
        AND allowed_months IS NOT NULL AND allowed_months != '[]'::jsonb;
    `);

    // Ensure default rows for salary pay operators
    const usersRes = await client.query("SELECT id, username FROM users WHERE LOWER(role) = 'salary pay operator'");
    for (const u of usersRes.rows) {
      await client.query(`
        INSERT INTO salary_payable_permissions (user_id, permission_type, allowed_months, allowed_view_months, allowed_pay_months, updated_by)
        VALUES ($1, 'pay_now', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'migration_default')
        ON CONFLICT (user_id) DO NOTHING;
      `, [u.id]);
    }
    console.log('   ✓ salary_payable_permissions verified.');

    await client.query('COMMIT');

    console.log('\n\x1b[32m%s\x1b[0m', '====================================================');
    console.log('\x1b[32m%s\x1b[0m', '✅ SUCCESS: LAST 5 DAYS MIGRATION COMPLETED SAFELY!');
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
