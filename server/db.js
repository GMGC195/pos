const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Neon managed SSL
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on('connect', (client) => {
  client.query("SET timezone = 'Asia/Riyadh'");
  console.log(`✅ Connected to database: ${client.database} on host: ${client.host}`);
});

pool.on('error', (err) => {
  console.error('❌ DB pool error:', err.message);
});

module.exports = pool;
