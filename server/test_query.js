const pool = require('./db');

async function test() {
  try {
    const res = await pool.query('SELECT id, employee_id, date, check_in, check_out FROM employee_attendance ORDER BY id DESC LIMIT 5');
    console.log("LAST 5 RECORDS:");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

test();
