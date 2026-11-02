require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');

async function migrate() {
  try {
    console.log('Adding company_name column to credit_customers...');
    await pool.query(`
      ALTER TABLE credit_customers 
      ADD COLUMN IF NOT EXISTS company_name VARCHAR(150);
    `);
    console.log('✅ Added company_name to credit_customers successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();

