const pool = require('./db');

async function migrate() {
  try {
    console.log('Adding completed_by and completed_at to orders...');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_by VARCHAR(150);');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;');
    
    // For existing completed orders, backfill completed_by and completed_at
    await pool.query(`
      UPDATE orders 
      SET completed_by = order_taker, completed_at = created_at 
      WHERE status = 'Completed' AND completed_by IS NULL
    `);
    
    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
