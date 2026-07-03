const pool = require('./db');

(async () => {
  try {
    console.log('Migrating foreign key constraint...');
    await pool.query('ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_stock_id_fkey');
    await pool.query('ALTER TABLE recipes ADD CONSTRAINT recipes_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES stock(id) ON DELETE CASCADE');
    console.log('✅ ON DELETE CASCADE applied to recipes(stock_id)');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
})();
