const pool = require('../db');

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_financial_adjustments (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        custom_label VARCHAR(100),
        amount DECIMAL(10, 2) NOT NULL,
        action_type VARCHAR(20) NOT NULL, -- 'Give' or 'Deduct'
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Successfully created employee_financial_adjustments table.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
