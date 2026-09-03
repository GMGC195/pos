const pool = require('./db');

async function migrate() {
  console.log('Starting shift closings migration...');
  try {
    // 1. Add columns to orders
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_shift_closed BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_daily_closed BOOLEAN DEFAULT FALSE;');
    console.log('Added is_shift_closed and is_daily_closed to orders.');

    // 2. Add last_login to users
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;');
    console.log('Added last_login to users.');

    // 3. Create shift_closings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shift_closings (
        id SERIAL PRIMARY KEY,
        cashier_id INTEGER REFERENCES users(id),
        cashier_name VARCHAR(100),
        branch VARCHAR(100),
        login_time TIMESTAMPTZ,
        logout_time TIMESTAMPTZ,
        total_active_time VARCHAR(50),
        total_sales NUMERIC(10,2),
        total_orders INTEGER,
        items_summary JSONB,
        closing_type VARCHAR(20) DEFAULT 'Shift',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Created shift_closings table.');

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
