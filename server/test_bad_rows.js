const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_BGC3YanWT4xb@ep-royal-unit-ahawopo5-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require' });

async function check() {
  try {
    const res = await pool.query("SELECT id, items_summary, pg_typeof(items_summary) as type FROM shift_closings WHERE items_summary::text = '\"[object Object]\"' OR items_summary::text = '[object Object]'");
    console.log("Bad rows:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
