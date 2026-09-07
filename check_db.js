const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_QyXo41JzOebV@ep-royal-unit-ahawopo5-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require' });

async function check() {
  try {
    const res = await pool.query('SELECT id, items_summary, pg_typeof(items_summary) as type FROM shift_closings ORDER BY id DESC LIMIT 5');
    console.log(res.rows);
  } finally {
    pool.end();
  }
}
check();
