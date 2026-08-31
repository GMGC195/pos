const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Neon managed SSL
  },
  max: 30,                     // Increased from 5 to handle concurrent socket.io fetches
  min: 2,                      // Keep a couple of connections warm
  idleTimeoutMillis: 30000,    // Release idle connections after 30s
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
});

// Retry wrapper for transient Neon connection issues
pool.queryWithRetry = async function(text, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await this.query(text, params);
    } catch (err) {
      const isTransient = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || 
                          err.message?.includes('Connection terminated') ||
                          err.message?.includes('connection timeout');
      if (isTransient && i < retries - 1) {
        console.warn(`⚠️ DB transient error (attempt ${i + 1}/${retries}): ${err.message}`);
        await new Promise(r => setTimeout(r, 300 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
};

pool.on('connect', (client) => {
  client.query("SET timezone = 'Asia/Riyadh'");
  console.log(`✅ Connected to database: ${client.database} on host: ${client.host}`);
});

pool.on('error', (err) => {
  console.error('❌ DB pool error:', err.message);
});

module.exports = pool;
