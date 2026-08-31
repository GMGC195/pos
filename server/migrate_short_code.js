require('dotenv').config();
const pool = require('./db');

async function run() {
  const client = await pool.connect();
  try {
    console.log('Adding short_code column to items table...');
    await client.query("ALTER TABLE items ADD COLUMN IF NOT EXISTS short_code VARCHAR(50) DEFAULT ''");
    console.log('Successfully added short_code column.');
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    client.release();
    pool.end();
  }
}

run();
