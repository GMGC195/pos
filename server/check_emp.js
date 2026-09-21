require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const res = await pool.query("SELECT * FROM employees WHERE UPPER(name) LIKE '%YASIR%'");
    console.log(res.rows.map(r => ({ name: r.name, working_hours: r.working_hours, shift: r.shift })));
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
