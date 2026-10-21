const pool = require('./db');

async function runLatestMigrations() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting Database Migration for Latest Changes (Oct 18 - Oct 21)...');
    await client.query('BEGIN');

    // 1. Employee Documents Table & Columns
    console.log('📄 [1/3] Checking employee_documents table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_documents (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        document_name VARCHAR(255) NOT NULL,
        document_type VARCHAR(50),
        document_number VARCHAR(100),
        note TEXT,
        file_url TEXT,
        file_path TEXT,
        expiry_date DATE,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query('ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(50);');
    await client.query('ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS document_number VARCHAR(100);');
    await client.query('ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS note TEXT;');
    await client.query('ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS file_path TEXT;');
    await client.query('ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS expiry_date DATE;');
    console.log('✅ employee_documents table and expiry_date verified.');

    // 2. Notifications Table & Columns (used by document expiry cron & alerts)
    console.log('🔔 [2/3] Checking notifications table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        message TEXT,
        type VARCHAR(50),
        target_roles JSONB DEFAULT '[]'::jsonb,
        target_users JSONB DEFAULT '[]'::jsonb,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_roles JSONB DEFAULT '[]'::jsonb;");
    await client.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_users JSONB DEFAULT '[]'::jsonb;");
    console.log('✅ notifications table and role/user targeting verified.');

    // 3. Orders & Settings Verification (Edit reasons, audit history, reports)
    console.log('🧾 [3/3] Checking orders & settings tables...');
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0;');
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS edit_reason TEXT;');
    await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb;");
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_by VARCHAR(150);');
    await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;');
    await client.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS report_emails JSONB DEFAULT '[\"mr.caffee25@gmail.com\"]'::jsonb;");
    console.log('✅ orders and settings columns verified.');

    await client.query('COMMIT');
    console.log('\n🎉 ALL LATEST DATABASE MIGRATIONS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runLatestMigrations();
