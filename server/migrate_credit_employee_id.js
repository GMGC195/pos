require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');

async function migrate() {
  try {
    console.log('Checking employee_id column in credit_customers table...');
    const check = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'credit_customers' AND column_name = 'employee_id'
    `);

    if (check.rows.length === 0) {
      console.log('Adding employee_id column to credit_customers...');
      await pool.query(`
        ALTER TABLE credit_customers 
        ADD COLUMN employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_credit_customers_employee_id 
        ON credit_customers(employee_id);
      `);
      console.log('✅ Added employee_id column and index to credit_customers successfully!');
    } else {
      console.log('✅ employee_id column already exists in credit_customers.');
    }
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
