const pool = require('./db');

async function test() {
  try {
    const res = await pool.query(
      `INSERT INTO employee_recurring_adjustments 
       (employee_id, type, custom_label, amount, amount_type, action_type, remaining_amount, start_date, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [2, 'Advance Salary / Loan', 'Loan', 100, 'Fixed', 'Deduct', 1000, new Date(), 'Reason for adjustment']
    );
    console.log('Success:', res.rows[0]);
  } catch(e) {
    console.error('SQL Error:', e);
  } finally {
    pool.end();
  }
}
test();
