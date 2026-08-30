const pool = require('./db');

async function migrate() {
  console.log('Starting branch migration...');
  try {
    // 1. Add branch to users if not exists
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(100)`);
    
    // 2. Add branch to categories
    await pool.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS branch VARCHAR(100) DEFAULT 'Branch 1'`);
    
    // 3. Add branch to items
    await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS branch VARCHAR(100) DEFAULT 'Branch 1'`);
    
    // 4. Add branch to orders
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch VARCHAR(100) DEFAULT 'Branch 1'`);

    console.log('Added branch column to all tables.');

    // 5. Seed duplicate items and categories for Branch 2 and Branch 3
    const catsRes = await pool.query(`SELECT * FROM categories WHERE branch = 'Branch 1'`);
    const oldCats = catsRes.rows;

    for (const b of ['Branch 2', 'Branch 3']) {
      for (const cat of oldCats) {
        await pool.query(`ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key`);
        await pool.query(`ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_branch_key`);
        await pool.query(`ALTER TABLE categories ADD CONSTRAINT categories_name_branch_key UNIQUE (name, branch)`);
        
        const insCatRes = await pool.query(
          `INSERT INTO categories (name, branch) VALUES ($1, $2) ON CONFLICT (name, branch) DO NOTHING RETURNING id`,
          [cat.name, b]
        );
        let newCatId = insCatRes.rows[0]?.id;
        if (!newCatId) {
           const exist = await pool.query(`SELECT id FROM categories WHERE name=$1 AND branch=$2`, [cat.name, b]);
           newCatId = exist.rows[0]?.id;
        }

        const itemsRes = await pool.query(`SELECT * FROM items WHERE category_id = $1 AND branch = 'Branch 1'`, [cat.id]);
        for (const item of itemsRes.rows) {
          // Check if item already seeded
          const itemExist = await pool.query(`SELECT id FROM items WHERE name=$1 AND branch=$2 AND category_id=$3`, [item.name, b, newCatId]);
          if (itemExist.rowCount === 0) {
            await pool.query(
              `INSERT INTO items (category_id, name, price, image_url, size_options, status, branch) 
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [newCatId, item.name, item.price, item.image_url, item.size_options, item.status, b]
            );
          }
        }
      }
    }
    console.log('Duplicated categories and items for Branch 2 and Branch 3.');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    pool.end();
  }
}

migrate();
