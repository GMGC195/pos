require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const res = await pool.query(`
      UPDATE employee_attendance ea
      SET shift_start_time = ewh.start_time,
          shift_end_time = ewh.end_time,
          shift_hours = ewh.hours
      FROM employees e
      JOIN employee_working_hours ewh ON UPPER(e.working_hours) = UPPER(ewh.name)
      WHERE ea.employee_id = e.id
        AND ea.date >= '2024-01-01'
        AND (ea.shift_start_time != ewh.start_time OR ea.shift_end_time != ewh.end_time);
    `);
    console.log('Updated rows:', res.rowCount);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
