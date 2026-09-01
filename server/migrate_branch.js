const pool = require('./db');

async function migrate() {
  try {
    console.log('Adding branch column to orders table...');
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch VARCHAR(100) DEFAULT 'Main Branch';`);
    console.log('Migration successful!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
