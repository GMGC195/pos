/**
 * Standalone Database Schema Migration Script for Internal Branch & Transfer Requests
 * Run this on Hostinger VPS / Local Server:
 *   node server/migrate_internal_branch_schema.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const pool = require('./db');

async function runMigration() {
  console.log('====================================================');
  console.log('🚀 STARTING INTERNAL BRANCH DATABASE SCHEMA MIGRATION');
  console.log('====================================================\n');

  try {
    // 1. Table: internal_branch_transfers
    console.log('📦 Step 1: Checking/Creating "internal_branch_transfers" table...');
    await pool.query(`
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
    `);
    console.log('  ✅ Table "internal_branch_transfers" is ready.');

    // 2. Indexes for internal_branch_transfers
    console.log('📦 Step 2: Creating indexes for internal_branch_transfers...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ibt_from_branch ON internal_branch_transfers(from_branch);
      CREATE INDEX IF NOT EXISTS idx_ibt_to_branch ON internal_branch_transfers(to_branch);
      CREATE INDEX IF NOT EXISTS idx_ibt_status ON internal_branch_transfers(status);
      CREATE INDEX IF NOT EXISTS idx_ibt_request_date ON internal_branch_transfers(request_date);
    `);
    console.log('  ✅ Indexes created successfully.');

    // 3. Table: internal_branch_transfer_items
    console.log('📦 Step 3: Checking/Creating "internal_branch_transfer_items" table...');
    await pool.query(`
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
    `);
    console.log('  ✅ Table "internal_branch_transfer_items" is ready.');

    // 4. Columns for internal_branch_transfers
    console.log('📦 Step 4: Adding transfer workflow & extension columns to "internal_branch_transfers"...');
    const transferColumns = [
      "is_external BOOLEAN DEFAULT FALSE",
      "expected_delivery_at TIMESTAMPTZ",
      "delivery_minutes INTEGER DEFAULT 30",
      "processing_started_at TIMESTAMPTZ",
      "processing_started_by_user_id INTEGER",
      "processing_started_by_name VARCHAR(150)",
      "ready_for_dispatch_at TIMESTAMPTZ",
      "ready_by_name VARCHAR(150)",
      "handover_by_name VARCHAR(150)",
      "handover_to_name VARCHAR(150)",
      "original_delivery_at TIMESTAMPTZ",
      "time_extended_at TIMESTAMPTZ",
      "time_extended_by_name VARCHAR(150)",
      "time_extend_reason TEXT",
      "discrepancy_reason TEXT",
      "extension_status VARCHAR(30) DEFAULT 'None'",
      "pending_extension_minutes INTEGER",
      "pending_extension_reason TEXT",
      "pending_extension_requested_by INTEGER",
      "pending_extension_requested_by_name VARCHAR(150)",
      "pending_extension_requested_at TIMESTAMPTZ",
      "total_extended_minutes INTEGER DEFAULT 0",
      "original_delivery_minutes INTEGER DEFAULT 30",
      "original_needed_by_time VARCHAR(50)",
      "extension_reviewed_by_name VARCHAR(150)",
      "extension_reviewed_at TIMESTAMPTZ",
      "extension_rejection_reason TEXT",
      "request_type VARCHAR(50) DEFAULT 'Transfer Request'",
      "priority VARCHAR(20) DEFAULT 'Normal'"
    ];

    for (const col of transferColumns) {
      await pool.query(`ALTER TABLE internal_branch_transfers ADD COLUMN IF NOT EXISTS ${col};`);
    }
    console.log(`  ✅ Added/verified ${transferColumns.length} columns in "internal_branch_transfers".`);

    // 5. Columns for internal_branch_transfer_items
    console.log('📦 Step 5: Adding SKU, Barcode & tracking columns to "internal_branch_transfer_items"...');
    const itemColumns = [
      "confirmed_qty NUMERIC(12,3)",
      "quantity_change_reason TEXT",
      "image_url TEXT",
      "price NUMERIC(10,2)",
      "sku VARCHAR(100)",
      "barcode VARCHAR(100)"
    ];

    for (const col of itemColumns) {
      await pool.query(`ALTER TABLE internal_branch_transfer_items ADD COLUMN IF NOT EXISTS ${col};`);
    }
    console.log(`  ✅ Added/verified ${itemColumns.length} columns in "internal_branch_transfer_items".`);

    // 6. Table: internal_branch_activity_logs
    console.log('📦 Step 6: Checking/Creating "internal_branch_activity_logs" table...');
    await pool.query(`
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
    `);
    console.log('  ✅ Table "internal_branch_activity_logs" is ready.');

    // 7. Columns for internal_branch_activity_logs
    console.log('📦 Step 7: Adding audit tracking columns to "internal_branch_activity_logs"...');
    const logColumns = [
      "user_role VARCHAR(50)",
      "previous_value TEXT",
      "new_value TEXT",
      "reason TEXT"
    ];

    for (const col of logColumns) {
      await pool.query(`ALTER TABLE internal_branch_activity_logs ADD COLUMN IF NOT EXISTS ${col};`);
    }
    console.log(`  ✅ Added/verified ${logColumns.length} columns in "internal_branch_activity_logs".`);

    console.log('\n====================================================');
    console.log('🎉 SCHEMA MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('All tables, columns, constraints and indexes are up to date.');
    console.log('====================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    process.exit(1);
  }
}

runMigration();
