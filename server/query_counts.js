const pool = require('./db');
async function run() {
  const itemsRes = await pool.query("SELECT COUNT(*) FROM items WHERE available_branches::jsonb @> '[\"Branch 2\"]'");
  const catsRes = await pool.query("SELECT COUNT(DISTINCT category_id) FROM items WHERE available_branches::jsonb @> '[\"Branch 2\"]'");
  console.log('Items Count:', itemsRes.rows[0].count);
  console.log('Categories Count:', catsRes.rows[0].count);
  process.exit(0);
}
run();
