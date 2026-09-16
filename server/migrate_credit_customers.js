const pool = require('./db');

async function run() {
  try {
    console.log('Migrating database to add credit features...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS credit_customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(50),
        balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
        credit_limit NUMERIC(10, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Created credit_customers table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id SERIAL PRIMARY KEY,
        credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        type VARCHAR(30) NOT NULL, -- 'CREDIT_ORDER', 'PAYMENT'
        amount NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Created credit_transactions table');

    // Add credit_customer_id to orders table if it doesn't exist
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orders' and column_name='credit_customer_id';
    `);

    if (columnCheck.rows.length === 0) {
      await pool.query(`
        ALTER TABLE orders ADD COLUMN credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE SET NULL;
      `);
      console.log('✅ Added credit_customer_id to orders table');
    } else {
      console.log('✅ credit_customer_id already exists in orders table');
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

run();
