const pool = require('./db');

async function fixSequence() {
  try {
    const res = await pool.query("ALTER SEQUENCE order_id_branch_1 RESTART WITH 11000;");
    console.log("Sequence order_id_branch_1 restarted at 11000");
  } catch (err) {
    console.error("Error setting sequence:", err);
  } finally {
    pool.end();
  }
}

fixSequence();
