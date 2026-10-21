const pool = require('./db');

async function migrate() {
  try {
    console.log('Migrating credit_transactions for shift and daily closing tracking...');
    await pool.query(`
      ALTER TABLE credit_transactions 
      ADD COLUMN IF NOT EXISTS is_shift_closed BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_daily_closed BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
    `);
    
    // Set existing records as closed so we start fresh from active shift
    await pool.query(`
      UPDATE credit_transactions 
      SET is_shift_closed = TRUE, is_daily_closed = TRUE 
      WHERE is_shift_closed IS NULL OR is_daily_closed IS NULL;
    `);

    // Create indices
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_credit_tx_shift ON credit_transactions(cashier_name, is_shift_closed, type);
      CREATE INDEX IF NOT EXISTS idx_credit_tx_daily ON credit_transactions(branch, is_daily_closed, type);
    `);

    console.log('✅ credit_transactions migrated successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
