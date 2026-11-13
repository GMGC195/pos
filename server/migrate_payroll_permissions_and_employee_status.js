/**
 * ==============================================================================
 * DATABASE SCHEMA MIGRATION:
 * 1. Employee Independent Active/Inactive Controls (Attendance & Payroll)
 * 2. Salary Payable User Permissions & Month-Wise Access Control
 * ==============================================================================
 * Usage on Hostinger SSH/Terminal:
 *   node server/migrate_payroll_permissions_and_employee_status.js
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
  console.log('\x1b[36m%s\x1b[0m', '🚀 STARTING MIGRATION: EMPLOYEE CONTROLS & SALARY PERMISSIONS');
  console.log('\x1b[36m%s\x1b[0m', '====================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Employee Independent Status Columns (Attendance & Payroll)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [1/3] Adding independent status columns to "employees" table...');
    await client.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active_attendance BOOLEAN DEFAULT TRUE;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active_payroll BOOLEAN DEFAULT TRUE;

      -- Backfill existing employees based on current status
      UPDATE employees 
      SET 
        is_active_attendance = (status = 'Active'),
        is_active_payroll = (status = 'Active')
      WHERE is_active_attendance IS NULL OR is_active_payroll IS NULL;

      CREATE INDEX IF NOT EXISTS idx_employees_active_attendance ON employees(is_active_attendance);
      CREATE INDEX IF NOT EXISTS idx_employees_active_payroll ON employees(is_active_payroll);
    `);
    console.log('   ✓ Columns "is_active_attendance" and "is_active_payroll" ready and backfilled.');

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Salary Payable Permissions Table
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [2/3] Creating "salary_payable_permissions" table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_payable_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        permission_type VARCHAR(20) DEFAULT 'pay_now', -- 'view_only' | 'pay_now'
        allowed_months JSONB DEFAULT '[]'::jsonb,      -- array of 'YYYY-MM' strings; empty means all permitted
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(100)
      );

      CREATE INDEX IF NOT EXISTS idx_spp_user_id ON salary_payable_permissions(user_id);
    `);
    console.log('   ✓ Table "salary_payable_permissions" ready.');

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Initialize default permissions for existing Salary Pay Operators
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📦 [3/3] Initializing default permissions for Salary Pay Operator users...');
    const usersRes = await client.query("SELECT id, username FROM users WHERE LOWER(role) = 'salary pay operator'");
    for (const u of usersRes.rows) {
      await client.query(`
        INSERT INTO salary_payable_permissions (user_id, permission_type, allowed_months, updated_by)
        VALUES ($1, 'pay_now', '[]'::jsonb, 'migration_default')
        ON CONFLICT (user_id) DO NOTHING;
      `, [u.id]);
    }
    console.log(`   ✓ Initialized default permissions for ${usersRes.rows.length} Salary Pay Operator user(s).`);

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

