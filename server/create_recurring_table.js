require('dotenv').config({ override: true });
const pool = require('./db');

async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_recurring_adjustments (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        type VARCHAR(255) NOT NULL,
        label VARCHAR(255),
        action_type VARCHAR(50) NOT NULL,
        amount_type VARCHAR(50) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Table employee_recurring_adjustments created successfully.");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    process.exit();
  }
}

createTable();
