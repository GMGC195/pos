const pool = require('./db');

async function run() {
  try {
    console.log('Migrating database to add branches to credit customers...');

    // Add available_branches column if it doesn't exist
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='credit_customers' and column_name='available_branches';
    `);

    if (columnCheck.rows.length === 0) {
      await pool.query(`
        ALTER TABLE credit_customers 
        ADD COLUMN available_branches JSONB DEFAULT '["Branch 1", "Branch 2", "Branch 3"]'::jsonb;
      `);
      console.log('✅ Added available_branches to credit_customers table');
    } else {
      console.log('✅ available_branches already exists in credit_customers table');
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

run();
