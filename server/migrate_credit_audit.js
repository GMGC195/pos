const pool = require('./db');

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration for credit_audit_logs and Khata enhancements...');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_audit_logs (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER REFERENCES credit_transactions(id) ON DELETE SET NULL,
        credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        performed_by VARCHAR(100) NOT NULL,
        performed_by_role VARCHAR(50),
        previous_values JSONB,
        new_values JSONB,
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Created credit_audit_logs table');

    await client.query('CREATE INDEX IF NOT EXISTS idx_credit_audit_customer ON credit_audit_logs(credit_customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_credit_audit_created ON credit_audit_logs(created_at DESC)');
    console.log('✅ Created indexes on credit_audit_logs');

    // Ensure credit_transactions columns exist
    await client.query(`
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS billing_month VARCHAR(7);
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS comments TEXT;
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS classification VARCHAR(50) DEFAULT 'Regular';
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS is_shift_closed BOOLEAN DEFAULT FALSE;
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS is_daily_closed BOOLEAN DEFAULT FALSE;
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
      ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);
    `);
    console.log('✅ Verified and added updated_at/updated_by to credit_transactions');

    await client.query('COMMIT');
    console.log('🎉 Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

