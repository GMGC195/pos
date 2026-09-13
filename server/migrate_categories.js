const pool = require('./db');

async function migrate() {
  try {
    console.log('Creating item_categories table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_categories (
        item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (item_id, category_id)
      )
    `);

    console.log('Migrating existing categories...');
    const result = await pool.query(`
      INSERT INTO item_categories (item_id, category_id)
      SELECT id, category_id FROM items WHERE category_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
    console.log(`Migrated ${result.rowCount} items to item_categories.`);

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
