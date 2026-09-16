const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Add advance_balance to employees if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='advance_balance') THEN
          ALTER TABLE employees ADD COLUMN advance_balance NUMERIC(10, 2) DEFAULT 0;
        END IF;
      END
      $$;
    `);

    // Add advance_deduction to employee_payroll_records if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_payroll_records' AND column_name='advance_deduction') THEN
          ALTER TABLE employee_payroll_records ADD COLUMN advance_deduction NUMERIC(10, 2) DEFAULT 0;
        END IF;
      END
      $$;
    `);

    // Create employee_documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_documents (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        document_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('Migration successful: Added advance_balance and employee_documents table.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigration();
