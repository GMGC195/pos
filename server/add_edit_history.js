require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT \'[]\'::jsonb');
    console.log('Column edit_history added successfully.');
  } catch (err) {
    console.error('Error adding column:', err);
  } finally {
    pool.end();
  }
}
run();
