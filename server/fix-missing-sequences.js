require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS order_id_branch_1 START 100000;`);
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS order_id_branch_2 START 200000;`);
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS order_id_branch_3 START 300000;`);
    console.log("Sequences verified/created successfully.");
  } catch(e) {
    console.error("Error creating sequences:", e);
  } finally {
    pool.end();
  }
}
run();
