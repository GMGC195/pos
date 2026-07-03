require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('✅ Connected to Neon PostgreSQL');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('📋 Running schema...');
    await client.query(schema);
    console.log('✅ Schema applied!');

    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    console.log('🌱 Running seed data...');
    await client.query(seed);
    console.log('✅ Seed data inserted!');

    // ⚙️ Run Migrations
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort((a, b) => {
          if (a.includes('stock_history_and_autodeduct') && b.includes('low_stock_fifo')) return -1;
          if (a.includes('low_stock_fifo') && b.includes('stock_history_and_autodeduct')) return 1;
          return a.localeCompare(b);
        });
      
      console.log(`⚙️ Running ${files.length} migrations...`);
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const migrationSql = fs.readFileSync(filePath, 'utf8');
        console.log(`   Running migration: ${file}`);
        await client.query(migrationSql);
      }
      console.log('✅ Migrations applied successfully!');
    }

    console.log('👤 Seeding default admin user...');
    const hashedPassword = await bcrypt.hash('dpnjj@130', 10);
    await client.query(
      `INSERT INTO users (username, email, password_hash) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (email) DO NOTHING`,
      ['SaucyBite', 'admin@saucybite.com', hashedPassword]
    );
    console.log('✅ Admin user created! (Username: SaucyBite / Email: admin@saucybite.com / Password: dpnjj@130)');

    console.log('👤 Seeding developer user...');
    const devHashedPassword = await bcrypt.hash('uzair@106', 10);
    await client.query(
      `INSERT INTO users (username, email, password_hash) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (email) DO NOTHING`,
      ['uzair', 'uzairshafqat106@gmail.com', devHashedPassword]
    );
    console.log('✅ Developer user created! (Username: uzair / Email: uzairshafqat106@gmail.com / Password: uzair@106)');

    // Verify
    const res = await client.query('SELECT COUNT(*) FROM items');
    console.log(`🍕 Items in DB: ${res.rows[0].count}`);

    const orders = await client.query('SELECT COUNT(*) FROM orders');
    console.log(`🧾 Orders in DB: ${orders.rows[0].count}`);

    const txns = await client.query('SELECT COUNT(*) FROM transactions');
    console.log(`💰 Transactions in DB: ${txns.rows[0].count}`);

    console.log('\n🎉 Database setup complete! You can now restart the server.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
