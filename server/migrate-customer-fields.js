const pool = require('./db');

(async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS customer_address TEXT,
      ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0
    `);
    console.log('Migration successful: Added optional customer fields to orders table.');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    if (client) client.release();
    process.exit(0);
  }
})();
