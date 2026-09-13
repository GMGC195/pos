require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  const query = `
    SELECT t.order_id, t.created_at as t_created, o.created_at as o_created
    FROM transactions t
    JOIN orders o ON t.order_id = o.id
    LIMIT 10
  `;
  try {
    const res = await pool.query(query);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  }
  pool.end();
}
test();
