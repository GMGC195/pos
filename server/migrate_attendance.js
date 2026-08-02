require('dotenv').config();
const pool = require('./db');

async function migrate() {
  try {
    console.log('Starting migration for employees and attendance tables...');
    
    // Create employees table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(150) UNIQUE,
        phone VARCHAR(50),
        role VARCHAR(50),
        salary NUMERIC(10, 2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Created employees table (if not existed)');

    // Create employee_attendance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_attendance (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        check_in TIMESTAMPTZ NOT NULL,
        check_out TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'Present',
        on_break BOOLEAN DEFAULT FALSE,
        break_start TIMESTAMPTZ,
        total_break_duration_seconds INTEGER DEFAULT 0,
        date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Created employee_attendance table (if not existed)');

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_employee ON employee_attendance(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON employee_attendance(date)`);
    console.log('✅ Created indexes');

    console.log('🚀 Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
