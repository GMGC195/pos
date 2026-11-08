const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function runMigration() {
  console.log('--- Starting Internal Khata & Shift Audit Migration ---');
  const sqlFile = path.join(__dirname, 'hostinger_internal_khata_migration.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  try {
    await pool.query(sql);
    console.log('✅ Migration executed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
