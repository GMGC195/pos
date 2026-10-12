const pool = require('./db');

async function fixSequence() {
  try {
    await pool.query("ALTER SEQUENCE order_id_branch_1 RESTART WITH 100000;");
    await pool.query("ALTER SEQUENCE order_id_branch_2 RESTART WITH 200000;");
    await pool.query("ALTER SEQUENCE order_id_branch_3 RESTART WITH 300000;");
    console.log("Sequences updated: Branch 1 -> 100000, Branch 2 -> 200000, Branch 3 -> 300000");
  } catch (err) {
    console.error("Error setting sequence:", err);
  } finally {
    pool.end();
  }
}

fixSequence();
