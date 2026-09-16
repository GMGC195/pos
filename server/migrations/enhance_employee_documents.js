const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_documents' AND column_name='document_type') THEN
          ALTER TABLE employee_documents ADD COLUMN document_type VARCHAR(50);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_documents' AND column_name='document_number') THEN
          ALTER TABLE employee_documents ADD COLUMN document_number VARCHAR(100);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_documents' AND column_name='note') THEN
          ALTER TABLE employee_documents ADD COLUMN note TEXT;
        END IF;
      END
      $$;
    `);

    await client.query('COMMIT');
    console.log('Migration successful: Added extra fields to employee_documents.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigration();
