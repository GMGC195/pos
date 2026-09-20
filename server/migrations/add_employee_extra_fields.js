require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Add columns if they do not exist
    const columns = [
      'iqama_id VARCHAR(100)',
      'iqama_expiry DATE',
      'baladiya_card_expiry DATE',
      'insurance_expiry DATE',
      'phones VARCHAR(150)',
      'address TEXT',
      'company_name VARCHAR(200)',
      'reference_info TEXT'
    ];

    for (const col of columns) {
      const colName = col.split(' ')[0];
      try {
        await client.query(`ALTER TABLE employees ADD COLUMN ${col}`);
        console.log(`Added column ${colName}`);
      } catch (err) {
        if (err.code === '42701') { // column already exists
          console.log(`Column ${colName} already exists, skipping.`);
        } else {
          throw err;
        }
      }
    }

    await client.query('COMMIT');
    console.log('Migration successful.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
