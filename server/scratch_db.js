const pool = require('./db');

(async () => {
  try {
    const result = await pool.query(
      `SELECT id, name, quantity, unit, low_stock_threshold, low_stock_at 
       FROM stock 
       WHERE quantity <= low_stock_threshold 
       AND low_stock_threshold > 0 
       AND is_dismissed = false 
       ORDER BY low_stock_at DESC`
    );
    console.log('Query succeeded! Row count:', result.rows.length);
  } catch (error) {
    console.error('Query failed with error:', error);
  } finally {
    await pool.end();
  }
})();
