const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/pos' });
pool.query('SELECT cash_sales, card_sales FROM shift_closings LIMIT 1')
  .then(res => { console.log("Columns exist:", res.rows); process.exit(0); })
  .catch(e => { console.error("Error:", e.message); process.exit(1); });
