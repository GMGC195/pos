const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_BGC3YanWT4xb@ep-royal-unit-ahawopo5-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require' });

async function check() {
  try {
    const res = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'shift_closings' AND column_name = 'items_summary'");
    console.log("Column Type: ", res.rows[0]);

    const res2 = await pool.query('SELECT id, items_summary FROM shift_closings ORDER BY id DESC LIMIT 2');
    console.log("Latest items_summary strings:");
    res2.rows.forEach(r => console.log(r.id, typeof r.items_summary, r.items_summary));
  } finally {
    pool.end();
  }
}
check();
