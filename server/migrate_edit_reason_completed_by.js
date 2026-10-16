const pool = require('./db');

async function migrate() {
  try {
    console.log('--- Backfilling completed_by and completed_at on completed orders ---');
    
    // Add edit_reason column if not exists
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS edit_reason TEXT;');

    // Backfill completed_by from edit_history (last editor) or order_taker
    const updateRes = await pool.query(`
      UPDATE orders 
      SET 
        completed_by = COALESCE(
          NULLIF(TRIM(edit_history->-1->>'edited_by'), ''),
          NULLIF(TRIM(order_taker), ''),
          'Admin'
        ),
        completed_at = COALESCE(completed_at, created_at)
      WHERE status = 'Completed' AND (completed_by IS NULL OR TRIM(completed_by) = '');
    `);
    
    console.log(`Updated ${updateRes.rowCount} completed orders with missing completed_by.`);

    // Verify remaining nulls
    const verifyRes = await pool.query("SELECT count(id) FROM orders WHERE status = 'Completed' AND (completed_by IS NULL OR TRIM(completed_by) = '')");
    console.log('Remaining completed orders with null completed_by:', verifyRes.rows[0].count);

  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    pool.end();
  }
}

migrate();
