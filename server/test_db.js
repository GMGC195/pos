const pool = require('./db');
async function test() {
  const { rows } = await pool.query("SELECT id, username, role, branch FROM users");
  console.log(rows);
  const items = await pool.query("SELECT id, name, available_branches FROM items LIMIT 5");
  console.log(items.rows);
  process.exit(0);
}
test();
