const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='employee_documents' AND column_name='expiry_date'
        ) THEN
          ALTER TABLE employee_documents ADD COLUMN expiry_date DATE;
        END IF;
      END
      $$;
    `);

    await client.query('COMMIT');
    console.log('Migration successful: Added expiry_date to employee_documents.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigration();
