require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Creating settings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        auto_print_enabled BOOLEAN DEFAULT FALSE,
        printer_ip VARCHAR(50) DEFAULT '127.0.0.1'
      );
    `);
    
    // Insert a default row if it doesn't exist
    const res = await client.query('SELECT COUNT(*) FROM settings');
    if (parseInt(res.rows[0].count) === 0) {
      console.log('Inserting default settings row...');
      await client.query("INSERT INTO settings (auto_print_enabled, printer_ip) VALUES (FALSE, '127.0.0.1')");
    }
    
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
