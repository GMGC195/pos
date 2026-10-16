require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Running migration: add report_emails to settings...');
    
    // 1. Add report_emails column if not exists
    await client.query(`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS report_emails JSONB DEFAULT '["mr.caffee25@gmail.com"]'::jsonb;
    `);
    console.log('Column report_emails added or already exists.');

    // 2. Check if a settings row exists, insert if not
    const res = await client.query('SELECT COUNT(*) FROM settings');
    if (parseInt(res.rows[0].count) === 0) {
      console.log('Inserting default settings row...');
      await client.query(`
        INSERT INTO settings (auto_print_enabled, printer_ip, low_stock_behavior, report_emails) 
        VALUES (FALSE, '127.0.0.1', 'block', '["mr.caffee25@gmail.com"]'::jsonb)
      `);
    } else {
      // 3. Update existing row(s) if report_emails is null or empty
      await client.query(`
        UPDATE settings 
        SET report_emails = '["mr.caffee25@gmail.com"]'::jsonb 
        WHERE report_emails IS NULL OR report_emails = '[]'::jsonb;
      `);
      console.log('Updated existing settings rows with default email.');
    }

    const check = await client.query('SELECT id, report_emails FROM settings');
    console.log('Current settings:', check.rows);

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
