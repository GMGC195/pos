const pool = require('./db');

(async () => {
  try {
    console.log('Attempting to connect to DB...');
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Connection successful:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed:', err);
    process.exit(1);
  }
})();
