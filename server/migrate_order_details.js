const pool = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check if columns exist
    const checkColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orders' 
        AND column_name IN ('order_type', 'table_number', 'order_taker', 'comments');
    `);
    
    const existingColumns = checkColumns.rows.map(r => r.column_name);
    
    if (!existingColumns.includes('order_type')) {
      await client.query("ALTER TABLE orders ADD COLUMN order_type VARCHAR(30)");
      console.log('Added order_type');
    }
    if (!existingColumns.includes('table_number')) {
      await client.query("ALTER TABLE orders ADD COLUMN table_number VARCHAR(20)");
      console.log('Added table_number');
    }
    if (!existingColumns.includes('order_taker')) {
      await client.query("ALTER TABLE orders ADD COLUMN order_taker VARCHAR(150)");
      console.log('Added order_taker');
    }
    if (!existingColumns.includes('comments')) {
      await client.query("ALTER TABLE orders ADD COLUMN comments TEXT");
      console.log('Added comments');
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
