const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const migrationPath = path.join(__dirname, 'migrations', '20260329_low_stock_fifo.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    console.log('--- Starting Migration ---');
    await pool.query(sql);
    console.log('✅ Migration successful!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

runMigration();
