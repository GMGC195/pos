/**
 * One-Time Payroll Reset and Schema Migration Script
 * 
 * Usage:
 * Run this script once on any environment (e.g. Hostinger, Neon, or Local)
 * to migrate the schema, configure the Other (±) column, and reset old balances/adjustments to 0.
 * 
 * Command:
 *   node reset_payroll_balances.js
 */

const pool = require('./db');

async function runPayrollReset() {
  console.log('----------------------------------------------------');
  console.log('🚀 Starting One-Time Payroll Migration & Reset...');
  console.log('----------------------------------------------------');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure required columns exist in employee_payroll_records
    console.log('1️⃣ Checking & creating payroll record columns...');
    await client.query(`
      ALTER TABLE employee_payroll_records 
      ADD COLUMN IF NOT EXISTS dynamic_adjustments JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS cash_paid NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS bank_paid NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_month_balance NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS payable_salary NUMERIC(10, 2) DEFAULT 0;
    `);

    // 2. Ensure payroll_adjustment_types table exists
    console.log('2️⃣ Checking & creating payroll_adjustment_types table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payroll_adjustment_types (
        id SERIAL PRIMARY KEY,
        label VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(20) DEFAULT 'One-Time',
        action VARCHAR(20) DEFAULT 'Add',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 3. Rename Demo to Other with action Both and ensure Other exists
    console.log('3️⃣ Configuring "Other (±)" adjustment column...');
    await client.query(`
      UPDATE payroll_adjustment_types 
      SET label = 'Other', action = 'Both' 
      WHERE LOWER(label) = 'demo';
    `);

    const checkOther = await client.query(`SELECT 1 FROM payroll_adjustment_types WHERE LOWER(label) = 'other'`);
    if (checkOther.rows.length === 0) {
      await client.query(`INSERT INTO payroll_adjustment_types (label, type, action) VALUES ('Other', 'One-Time', 'Both')`);
    } else {
      await client.query(`UPDATE payroll_adjustment_types SET action = 'Both' WHERE LOWER(label) = 'other'`);
    }

    // 4. Reset financial adjustments, recurring adjustments, and advance balances
    console.log('4️⃣ Resetting adjustments & balances to 0...');
    const delFin = await client.query('DELETE FROM employee_financial_adjustments');
    console.log(`   - Deleted ${delFin.rowCount || 0} financial adjustments.`);

    const delRec = await client.query('DELETE FROM employee_recurring_adjustments');
    console.log(`   - Deleted ${delRec.rowCount || 0} recurring adjustments.`);

    const updEmp = await client.query('UPDATE employees SET advance_balance = 0');
    console.log(`   - Reset advance balance to 0 for ${updEmp.rowCount || 0} employees.`);

    // 5. Reset past payroll records adjustment fields and balances to 0
    const updRecords = await client.query(`
      UPDATE employee_payroll_records SET 
        last_month_balance = 0,
        bonus = 0,
        last_month_adjustment = 0,
        internet = 0,
        kafalat = 0,
        advance_deduction = 0,
        other_adjustments = 0,
        recurring_adjustments = 0,
        dynamic_adjustments = '{}'::jsonb,
        cash_paid = COALESCE(net_salary, 0),
        bank_paid = 0,
        paid_amount = COALESCE(net_salary, 0)
    `);
    console.log(`   - Reset adjustments/balances for ${updRecords.rowCount || 0} payroll records.`);

    await client.query('COMMIT');

    console.log('----------------------------------------------------');
    console.log('✅ SUCCESS! One-time payroll reset completed safely.');
    console.log('----------------------------------------------------');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during payroll reset:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

runPayrollReset();
