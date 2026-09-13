require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  const from = '2026-09-12';
  const to = '2026-09-12';
  let query = 'SELECT * FROM shift_closings';
  const params = [];
  let conditions = [];
  
  if (from) {
    params.push(from);
    conditions.push(`created_at >= $${params.length}::date`);
  }

  if (to) {
    params.push(to);
    conditions.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY created_at DESC';
  
  console.log("Query:", query);
  
  try {
    const res = await pool.query(query, params);
    console.log("Result length:", res.rows.length);
    if(res.rows.length > 0) {
       console.table(res.rows.map(r => ({ id: r.id, created_at: r.created_at })));
    }
  } catch (err) {
    console.error("Error:", err);
  }
  pool.end();
}
test();
