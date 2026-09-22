const pool = require('../db');

async function migrate() {
  try {
    console.log('Starting migration to add Excel payroll columns...');

    const columnsToAdd = [
      { name: 'bonus', type: 'NUMERIC(10, 2) DEFAULT 0' },
      { name: 'last_month_adjustment', type: 'NUMERIC(10, 2) DEFAULT 0' },
      { name: 'internet', type: 'NUMERIC(10, 2) DEFAULT 0' },
      { name: 'kafalat', type: 'NUMERIC(10, 2) DEFAULT 0' },
      { name: 'expected_hours', type: 'NUMERIC(10, 2) DEFAULT 0' },
      { name: 'actual_hours', type: 'NUMERIC(10, 2) DEFAULT 0' }
    ];

    for (const col of columnsToAdd) {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_payroll_records' AND column_name='${col.name}') THEN
            ALTER TABLE employee_payroll_records ADD COLUMN ${col.name} ${col.type};
          END IF;
        END $$;
      `);
      console.log(`Column ${col.name} checked/added successfully.`);
    }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

migrate();
