const pool = require('./db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Identify the 116 newly added items (they have short_code != '')
    // Set them to be available in Branch 1, Branch 2, Branch 3
    const newItemsRes = await client.query(
      `UPDATE items 
       SET available_branches = '["Branch 1", "Branch 2", "Branch 3"]'::jsonb 
       WHERE short_code IS NOT NULL AND short_code != '' 
       RETURNING id`
    );
    console.log(`Updated ${newItemsRes.rowCount} new items to be available in all branches.`);

    // 2. Hide all the old items (where short_code is empty or null)
    const oldItemsRes = await client.query(
      `UPDATE items 
       SET available_branches = '[]'::jsonb 
       WHERE short_code IS NULL OR short_code = '' 
       RETURNING id`
    );
    console.log(`Hid ${oldItemsRes.rowCount} old items from all menus.`);

    await client.query('COMMIT');
    console.log('Menu successfully reset to the 116 new items.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error:', e);
  } finally {
    client.release();
    pool.end();
  }
}
run();
