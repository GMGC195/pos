const pool = require('./db');

async function runMigration() {
  let client;
  try {
    client = await pool.connect();
    console.log('--- Database Migration Start ---');
    
    // Check if column exists first
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'orders' AND column_name = 'client_order_id'
    `);

    if (checkRes.rows.length === 0) {
      console.log('Column "client_order_id" missing. Adding it...');
      await client.query('ALTER TABLE orders ADD COLUMN client_order_id UUID UNIQUE');
      console.log('Column added successfully.');
    } else {
      console.log('Column "client_order_id" already exists.');
    }
    
    console.log('--- Database Migration End ---');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    if (client) client.release();
    process.exit(0);
  }
}

runMigration();
