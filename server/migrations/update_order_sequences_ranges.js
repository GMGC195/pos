require('dotenv').config();
const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('--- Starting Sequence Range Migration ---');

    // 1. Ensure sequences exist
    await client.query(`CREATE SEQUENCE IF NOT EXISTS order_id_branch_1 START 100000;`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS order_id_branch_2 START 200000;`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS order_id_branch_3 START 300000;`);

    // 2. Adjust Branch 1 sequence if below 100,000
    const s1 = await client.query("SELECT last_value FROM order_id_branch_1");
    if (s1.rows.length && Number(s1.rows[0].last_value) < 100000) {
      await client.query("ALTER SEQUENCE order_id_branch_1 RESTART WITH 100000;");
      console.log('✅ order_id_branch_1 sequence restarted at 100000');
    } else {
      console.log('ℹ️ order_id_branch_1 is already >= 100000 (current:', s1.rows[0]?.last_value, ')');
    }

    // 3. Adjust Branch 2 sequence if below 200,000
    const s2 = await client.query("SELECT last_value FROM order_id_branch_2");
    if (s2.rows.length && Number(s2.rows[0].last_value) < 200000) {
      await client.query("ALTER SEQUENCE order_id_branch_2 RESTART WITH 200000;");
      console.log('✅ order_id_branch_2 sequence restarted at 200000');
    } else {
      console.log('ℹ️ order_id_branch_2 is already >= 200000 (current:', s2.rows[0]?.last_value, ')');
    }

    // 4. Adjust Branch 3 sequence if below 300,000
    const s3 = await client.query("SELECT last_value FROM order_id_branch_3");
    if (s3.rows.length && Number(s3.rows[0].last_value) < 300000) {
      await client.query("ALTER SEQUENCE order_id_branch_3 RESTART WITH 300000;");
      console.log('✅ order_id_branch_3 sequence restarted at 300000');
    } else {
      console.log('ℹ️ order_id_branch_3 is already >= 300000 (current:', s3.rows[0]?.last_value, ')');
    }

    console.log('--- Sequence Range Migration Completed Successfully ---');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
