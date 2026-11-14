/**
 * Migration: Complete System Updates
 * 1. Independent View & Payment month permissions in salary_payable_permissions
 * 2. Item-level status, accepted quantities, reasons, need-by & priority in internal_branch_transfer_items
 *
 * Safe & Idempotent: Can be run multiple times without data loss.
 * Ready to execute on Hostinger via: node server/migrate_complete_system_updates.js
 */

const pool = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Starting Database Migration for Complete System Updates...');
    await client.query('BEGIN');

    // 1. salary_payable_permissions
    console.log('📦 Updating salary_payable_permissions schema...');
    await client.query(`
      ALTER TABLE salary_payable_permissions 
      ADD COLUMN IF NOT EXISTS allowed_view_months JSONB DEFAULT '[]'::jsonb;
    `);

    await client.query(`
      ALTER TABLE salary_payable_permissions 
      ADD COLUMN IF NOT EXISTS allowed_pay_months JSONB DEFAULT '[]'::jsonb;
    `);

    // Backfill from legacy allowed_months
    await client.query(`
      UPDATE salary_payable_permissions 
      SET allowed_view_months = allowed_months 
      WHERE (allowed_view_months IS NULL OR allowed_view_months = '[]'::jsonb) 
        AND allowed_months IS NOT NULL AND allowed_months != '[]'::jsonb;
    `);

    await client.query(`
      UPDATE salary_payable_permissions 
      SET allowed_pay_months = allowed_months 
      WHERE (allowed_pay_months IS NULL OR allowed_pay_months = '[]'::jsonb) 
        AND permission_type = 'pay_now' 
        AND allowed_months IS NOT NULL AND allowed_months != '[]'::jsonb;
    `);

    // 2. internal_branch_transfer_items
    console.log('📦 Updating internal_branch_transfer_items schema...');
    await client.query(`
      ALTER TABLE internal_branch_transfer_items 
      ADD COLUMN IF NOT EXISTS item_status VARCHAR(50) DEFAULT 'Pending',
      ADD COLUMN IF NOT EXISTS accepted_qty NUMERIC DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS rejected_qty NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS modification_reason TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS accepted_by_name VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS needed_by_time VARCHAR(100) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'Normal';
    `);

    // Backfill item_status based on transfer status if item_status is null
    await client.query(`
      UPDATE internal_branch_transfer_items i
      SET item_status = CASE 
        WHEN t.status IN ('Completed', 'Received', 'Dispatched', 'Ready for Dispatch', 'In Transit') THEN 'Accepted'
        WHEN t.status = 'Rejected' THEN 'Rejected'
        WHEN t.status = 'Cancelled' THEN 'Cancelled'
        ELSE 'Pending'
      END,
      accepted_qty = CASE 
        WHEN t.status IN ('Completed', 'Received', 'Dispatched', 'Ready for Dispatch', 'In Transit') AND i.accepted_qty IS NULL 
        THEN COALESCE(i.received_qty, i.sent_qty, i.requested_qty)
        ELSE i.accepted_qty
      END
      FROM internal_branch_transfers t
      WHERE i.transfer_id = t.id AND (i.item_status IS NULL OR i.item_status = 'Pending');
    `);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
