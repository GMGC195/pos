require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  const query = `
    SELECT id, closing_type, login_time, logout_time, created_at 
    FROM shift_closings 
    WHERE created_at >= '2026-09-12'::date AND created_at < '2026-09-13'::date
    ORDER BY created_at DESC;
  `;
  try {
    const res = await pool.query(query);
    console.table(res.rows);
  } catch (err) {
    console.error("Error:", err);
  }
  pool.end();
}
test();
