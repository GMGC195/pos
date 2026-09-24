require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting migration for low stock behavior...');
    
    // Add low_stock_behavior column to settings table
    console.log('Adding low_stock_behavior to settings table...');
    await client.query(`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS low_stock_behavior VARCHAR(50) DEFAULT 'block';
    `);

    // Drop the stock_quantity_non_negative constraint from stock table
    console.log('Dropping stock_quantity_non_negative constraint...');
    await client.query(`
      ALTER TABLE stock 
      DROP CONSTRAINT IF EXISTS stock_quantity_non_negative;
    `);

    // Drop the stock_history_remaining_non_negative constraint from stock_history table
    console.log('Dropping stock_history_remaining_non_negative constraint...');
    await client.query(`
      ALTER TABLE stock_history 
      DROP CONSTRAINT IF EXISTS stock_history_remaining_non_negative;
    `);

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
