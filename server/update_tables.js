const pool = require('./db');

async function updateTables() {
  try {
    console.log('Clearing existing tables...');
    await pool.query('DELETE FROM tables');

    console.log('Creating new tables...');
    for (let i = 1; i <= 20; i++) {
      let branches = [];
      
      if (i <= 6) {
        // Tables 1-6 belong to Branch 1, 2, 3
        branches = ['Branch 1', 'Branch 2', 'Branch 3'];
      } else if (i <= 15) {
        // Tables 7-15 belong to Branch 1, 3
        branches = ['Branch 1', 'Branch 3'];
      } else if (i <= 20) {
        // Tables 16-20 belong to Branch 3
        branches = ['Branch 3'];
      }

      await pool.query(
        `INSERT INTO tables (table_number, available_branches, status) VALUES ($1, $2, $3)`,
        [`Table ${i}`, JSON.stringify(branches), 'Active']
      );
      console.log(`Created Table ${i} for branches:`, branches);
    }
    
    console.log('Successfully updated tables!');
  } catch (err) {
    console.error('Error updating tables:', err);
  } finally {
    process.exit(0);
  }
}

updateTables();
