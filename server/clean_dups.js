require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT UPPER(name) as uname, COUNT(*), array_agg(id) as ids
      FROM employee_working_hours
      GROUP BY UPPER(name)
      HAVING COUNT(*) > 1
    `);
    
    console.log('Duplicates:', res.rows);
    
    for (const row of res.rows) {
      const ids = row.ids;
      ids.sort((a,b) => b - a);
      const keepId = ids[0];
      const deleteIds = ids.slice(1);
      
      console.log("Keeping", keepId, "deleting", deleteIds);
      await pool.query('DELETE FROM employee_working_hours WHERE id = ANY($1)', [deleteIds]);
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
