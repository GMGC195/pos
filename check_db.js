const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_QyXo41JzOebV@ep-royal-unit-ahawopo5-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require' });

async function check() {
  try {
    const res = await pool.query('SELECT * FROM payroll_adjustment_types');
    console.log('payroll_adjustment_types:', res.rows);
  } finally {
    pool.end();
  }
}
check();
