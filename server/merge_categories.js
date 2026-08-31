const pool = require('./db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Mapping: { 'Source Category Name': 'Target Category Name' }
    const merges = [
      { from: 'MUTTON', to: 'Meats & Chicken' },
      { from: 'CHICKEN', to: 'Meats & Chicken' },
      { from: 'RICE', to: 'Rice' },
      { from: 'BBQs', to: 'Bar BQ' },
      { from: 'VEGETABLE', to: 'Veggie' },
      { from: 'Sweets and Salty Special Al Rawaq', to: 'Sweet' },
      { from: 'BEVERAGES', to: 'Beverages' }
    ];

    for (const merge of merges) {
      // Find source ID
      const srcRes = await client.query('SELECT id FROM categories WHERE name = $1', [merge.from]);
      // Find target ID
      const tgtRes = await client.query('SELECT id FROM categories WHERE name = $1', [merge.to]);

      if (srcRes.rows.length > 0 && tgtRes.rows.length > 0) {
        const srcId = srcRes.rows[0].id;
        const tgtId = tgtRes.rows[0].id;
        
        console.log(`Merging items from '${merge.from}' (ID: ${srcId}) to '${merge.to}' (ID: ${tgtId})...`);

        // Move items
        const updateRes = await client.query('UPDATE items SET category_id = $1 WHERE category_id = $2', [tgtId, srcId]);
        console.log(`Moved ${updateRes.rowCount} items.`);

        // Delete source category
        await client.query('DELETE FROM categories WHERE id = $1', [srcId]);
        console.log(`Deleted category '${merge.from}'.`);
      } else {
        console.log(`Skipping merge for '${merge.from}' -> '${merge.to}' (one or both not found)`);
      }
    }

    await client.query('COMMIT');
    console.log('Category merge successful.');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error during merge:', e);
  } finally {
    client.release();
    pool.end();
  }
}

run();
