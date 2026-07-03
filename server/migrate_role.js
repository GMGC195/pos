require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  try {
    // Add role column if it doesn't exist
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'Admin'
    `);
    
    // Ensure existing users are Admin if not set
    await pool.query(`
      UPDATE users SET role = 'Admin' WHERE role IS NULL
    `);
    
    console.log('Migration successful: role column added to users table.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
