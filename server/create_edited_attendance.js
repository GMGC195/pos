const pool = require('./db');

async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS edited_attendance (
        id SERIAL PRIMARY KEY,
        attendance_id INTEGER REFERENCES employee_attendance(id) ON DELETE CASCADE,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        original_check_in TIMESTAMPTZ,
        original_check_out TIMESTAMPTZ,
        new_check_in TIMESTAMPTZ,
        new_check_out TIMESTAMPTZ,
        edited_by VARCHAR(150),
        reason TEXT,
        edited_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("Table created or exists");
  } catch(e) {
    console.log("Error:", e.message);
  } finally {
    process.exit(0);
  }
}

createTable();
