/**
 * Script to update admin user credentials.
 * Usage: node update-admin.js
 * 
 * Edit the NEW_USERNAME, NEW_EMAIL, NEW_PASSWORD below and run the script.
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// ✏️  Edit these values:
const NEW_USERNAME = 'SaucyBite';          // new username
const NEW_EMAIL    = 'admin@saucybite.com';// new email
const NEW_PASSWORD = 'dpnjj@130';       // new password

// ─────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function updateAdmin() {
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash(NEW_PASSWORD, 10);

    // Try to update the existing admin (id=1), 
    // or insert a new user if none exists yet.
    const result = await client.query(
      `INSERT INTO users (id, username, email, password_hash)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE
         SET username      = EXCLUDED.username,
             email         = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash
       RETURNING username, email`,
      [NEW_USERNAME, NEW_EMAIL, hash]
    );

    const row = result.rows[0];
    console.log('✅ Admin updated successfully!');
    console.log(`   Username : ${row.username}`);
    console.log(`   Email    : ${row.email}`);
    console.log(`   Password : ${NEW_PASSWORD}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

updateAdmin();
