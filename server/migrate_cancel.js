require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  try {
    console.log('--- Migrating Orders Table ---');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;');
    console.log('✅ Migration successful!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
