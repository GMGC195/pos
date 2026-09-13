require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  const query = `
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'shift_closings';
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
