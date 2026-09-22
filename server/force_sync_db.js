require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    await pool.query(`
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
      )
    `);
    console.log("recurring table created");
    
    await pool.query(`
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
      )
    `);
    console.log("financial table created");
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
