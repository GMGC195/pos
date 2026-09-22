const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query('SELECT * FROM orders LIMIT 1');
    console.log("Success! Orders count:", res.rows.length);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    pool.end();
  }
}
run();
