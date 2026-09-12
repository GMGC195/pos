const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/pos' });

async function migrate() {
  try {
    await pool.query("ALTER TABLE shift_closings ADD COLUMN cash_sales NUMERIC DEFAULT 0;");
    console.log("Added cash_sales");
  } catch (e) { console.log(e.message); }
  
  try {
    await pool.query("ALTER TABLE shift_closings ADD COLUMN card_sales NUMERIC DEFAULT 0;");
    console.log("Added card_sales");
  } catch (e) { console.log(e.message); }

  process.exit(0);
}

migrate();
