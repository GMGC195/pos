const pool = require('./db');

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT id, name, category_id, short_code, price, available_branches 
      FROM items 
      WHERE available_branches::jsonb @> '["Branch 2"]'
      ORDER BY name ASC
    `);
    const items = res.rows;
    console.log(`Total Items in Branch 2: ${items.length}`);
    
    // Find exact duplicate names
    const nameCounts = {};
    const exactDuplicates = [];
    
    items.forEach(item => {
      const lowerName = item.name.toLowerCase().trim();
      if (!nameCounts[lowerName]) {
        nameCounts[lowerName] = [];
      }
      nameCounts[lowerName].push(item);
    });

    for (const [name, arr] of Object.entries(nameCounts)) {
      if (arr.length > 1) {
        exactDuplicates.push({ name, count: arr.length, items: arr });
      }
    }

    if (exactDuplicates.length > 0) {
      console.log('\n--- EXACT DUPLICATES (by name) ---');
      exactDuplicates.forEach(dup => {
        console.log(`Name: "${dup.name}" appears ${dup.count} times.`);
        dup.items.forEach(i => console.log(`  - ID: ${i.id}, ShortCode: ${i.short_code}, Price: ${i.price}, Branches: ${JSON.stringify(i.available_branches)}`));
      });
    } else {
      console.log('\nNo exact duplicates found by name.');
    }

    // Also look for similar names (e.g. "Chicken Faham" vs "Chicken Faham Full")
    console.log('\n--- POTENTIALLY SIMILAR ITEMS ---');
    // Just printing out the sorted list to a JSON file so we can inspect if needed
    require('fs').writeFileSync('branch2_items.json', JSON.stringify(items, null, 2));
    console.log('Saved all Branch 2 items to branch2_items.json for manual review.');
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    client.release();
    pool.end();
  }
}
run();
