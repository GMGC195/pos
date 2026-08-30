require('dotenv').config();
const pool = require('./db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Delete duplicated items for Branch 2 and Branch 3
    console.log('Deleting duplicate items...');
    await client.query("DELETE FROM items WHERE branch IN ('Branch 2', 'Branch 3')");

    // 2. Delete duplicated categories for Branch 2 and Branch 3
    console.log('Deleting duplicate categories...');
    await client.query("DELETE FROM categories WHERE branch IN ('Branch 2', 'Branch 3')");

    // 3. Drop unique constraint on categories if exists
    console.log('Dropping unique constraint on categories...');
    await client.query("ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_branch_key");
    await client.query("ALTER TABLE categories ADD CONSTRAINT categories_name_key UNIQUE (name)");

    // 4. Drop branch column from categories
    console.log('Dropping branch column from categories...');
    await client.query("ALTER TABLE categories DROP COLUMN IF EXISTS branch");

    // 5. Add available_branches JSONB to items
    console.log('Adding available_branches to items...');
    await client.query("ALTER TABLE items ADD COLUMN IF NOT EXISTS available_branches JSONB DEFAULT '[\"Branch 1\", \"Branch 2\", \"Branch 3\"]'::jsonb");

    // 6. Drop branch column from items
    console.log('Dropping branch column from items...');
    await client.query("ALTER TABLE items DROP COLUMN IF EXISTS branch");

    await client.query('COMMIT');
    console.log('Schema update successful!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Schema update failed:', e);
  } finally {
    client.release();
    pool.end();
  }
}

run();
