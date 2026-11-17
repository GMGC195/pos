const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken, isAdmin } = require('../../middleware/auth');

// Helper to generate next item code (e.g. STR-1001, STR-1002...)
async function generateItemCode(client) {
  const queryFn = client ? client.query.bind(client) : pool.query.bind(pool);
  const res = await queryFn(`
    SELECT item_code FROM store_items 
    WHERE item_code ~ '^STR-[0-9]+$'
    ORDER BY CAST(SUBSTRING(item_code FROM 5) AS INTEGER) DESC 
    LIMIT 1
  `);
  if (res.rows.length === 0) {
    return 'STR-1001';
  }
  const lastNum = parseInt(res.rows[0].item_code.split('-')[1], 10);
  return `STR-${lastNum + 1}`;
}

// -------------------------------------------------------------
// GET /api/store/items (List with search, category & vendor info)
// -------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category_id, search, status, vendor_id } = req.query;
    let query = `
      SELECT 
        si.*,
        sc.name as category_name,
        sc.icon as category_icon,
        sv.name as default_vendor_name,
        sv.phone as default_vendor_phone
      FROM store_items si
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      LEFT JOIN store_vendors sv ON si.default_vendor_id = sv.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id && category_id !== 'All') {
      params.push(parseInt(category_id, 10));
      query += ` AND si.category_id = $${params.length}`;
    }

    if (vendor_id && vendor_id !== 'All') {
      params.push(parseInt(vendor_id, 10));
      query += ` AND si.default_vendor_id = $${params.length}`;
    }

    if (status && status !== 'All') {
      params.push(status);
      query += ` AND si.status = $${params.length}`;
    } else {
      query += ` AND si.status != 'Archived'`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(si.name) LIKE $${params.length} OR LOWER(si.item_code) LIKE $${params.length} OR LOWER(COALESCE(si.arabic_name, '')) LIKE $${params.length})`;
    }

    query += ' ORDER BY sc.sort_order ASC, si.name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching store items:', err);
    res.status(500).json({ error: 'Failed to fetch store items' });
  }
});

// GET /api/store/items/next-code (Preview auto-generated code)
router.get('/next-code', authenticateToken, async (req, res) => {
  try {
    const nextCode = await generateItemCode();
    res.json({ nextCode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate code' });
  }
});

// -------------------------------------------------------------
// POST /api/store/items (Create new Store Item)
// -------------------------------------------------------------
router.post('/', authenticateToken, async (req, res) => {
  const {
    name, arabic_name, item_code, category_id, primary_unit,
    secondary_unit, unit_conversion_ratio, default_vendor_id,
    min_stock_level, reorder_quantity, last_purchase_price, notes
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Item name is required' });
  }
  if (!primary_unit) {
    return res.status(400).json({ error: 'Primary measurement unit is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let finalCode = item_code?.trim();
    if (!finalCode) {
      finalCode = await generateItemCode(client);
    }

    // Check duplicate code
    const codeCheck = await client.query('SELECT id FROM store_items WHERE LOWER(item_code) = LOWER($1)', [finalCode]);
    if (codeCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Item code '${finalCode}' is already in use.` });
    }

    const insertRes = await client.query(`
      INSERT INTO store_items (
        item_code, name, arabic_name, category_id, primary_unit,
        secondary_unit, unit_conversion_ratio, default_vendor_id,
        min_stock_level, reorder_quantity, last_purchase_price, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Active')
      RETURNING *
    `, [
      finalCode,
      name.trim(),
      arabic_name?.trim() || null,
      category_id ? parseInt(category_id, 10) : null,
      primary_unit.trim(),
      secondary_unit?.trim() || null,
      parseFloat(unit_conversion_ratio) || 1.0,
      default_vendor_id ? parseInt(default_vendor_id, 10) : null,
      parseFloat(min_stock_level) || 5.0,
      parseFloat(reorder_quantity) || 10.0,
      parseFloat(last_purchase_price) || 0,
      notes || null
    ]);

    const newItem = insertRes.rows[0];

    // Auto-initialize inventory rows across all active store locations with 0 stock
    const storesRes = await client.query('SELECT id FROM store_locations WHERE is_active = true');
    for (const store of storesRes.rows) {
      await client.query(`
        INSERT INTO store_inventory (store_id, item_id, current_stock, min_stock_level)
        VALUES ($1, $2, 0, $3)
        ON CONFLICT (store_id, item_id) DO NOTHING
      `, [store.id, newItem.id, newItem.min_stock_level]);
    }

    await client.query('COMMIT');
    res.status(201).json(newItem);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating store item:', err);
    res.status(500).json({ error: 'Failed to create store item: ' + err.message });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// PUT /api/store/items/:id (Update Store Item)
// -------------------------------------------------------------
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    name, arabic_name, item_code, category_id, primary_unit,
    secondary_unit, unit_conversion_ratio, default_vendor_id,
    min_stock_level, reorder_quantity, last_purchase_price, notes, status
  } = req.body;

  try {
    const updateRes = await pool.query(`
      UPDATE store_items
      SET name = COALESCE($1, name),
          arabic_name = COALESCE($2, arabic_name),
          item_code = COALESCE($3, item_code),
          category_id = COALESCE($4, category_id),
          primary_unit = COALESCE($5, primary_unit),
          secondary_unit = COALESCE($6, secondary_unit),
          unit_conversion_ratio = COALESCE($7, unit_conversion_ratio),
          default_vendor_id = COALESCE($8, default_vendor_id),
          min_stock_level = COALESCE($9, min_stock_level),
          reorder_quantity = COALESCE($10, reorder_quantity),
          last_purchase_price = COALESCE($11, last_purchase_price),
          notes = COALESCE($12, notes),
          status = COALESCE($13, status),
          updated_at = NOW()
      WHERE id = $14 RETURNING *
    `, [
      name, arabic_name, item_code, category_id ? parseInt(category_id, 10) : null,
      primary_unit, secondary_unit, unit_conversion_ratio,
      default_vendor_id ? parseInt(default_vendor_id, 10) : null,
      min_stock_level, reorder_quantity, last_purchase_price, notes, status, id
    ]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store item not found' });
    }

    // Update min_stock_level on store_inventory
    if (min_stock_level !== undefined) {
      await pool.query('UPDATE store_inventory SET min_stock_level = $1 WHERE item_id = $2', [min_stock_level, id]);
    }

    res.json(updateRes.rows[0]);
  } catch (err) {
    console.error('Error updating store item:', err);
    res.status(500).json({ error: 'Failed to update store item' });
  }
});

// -------------------------------------------------------------
// DELETE /api/store/items/:id (Safe archive or delete)
// -------------------------------------------------------------
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Check if item has transactions
    const txCheck = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM store_purchase_items WHERE item_id = $1) as purchases,
        (SELECT COUNT(*) FROM store_stock_entry_items WHERE item_id = $1) as entries
    `, [id]);

    const hasPurchases = parseInt(txCheck.rows[0].purchases) > 0;
    const hasEntries = parseInt(txCheck.rows[0].entries) > 0;

    if (hasPurchases || hasEntries) {
      // Soft-archive to preserve audit trails
      await pool.query("UPDATE store_items SET status = 'Archived', updated_at = NOW() WHERE id = $1", [id]);
      return res.json({ message: 'Item has historical transactions. It has been safely archived instead of deleted.' });
    }

    await pool.query('DELETE FROM store_items WHERE id = $1', [id]);
    res.json({ message: 'Store item deleted successfully' });
  } catch (err) {
    console.error('Error deleting store item:', err);
    res.status(500).json({ error: 'Failed to delete store item' });
  }
});

// -------------------------------------------------------------
// POST /api/store/items/bulk (Excel / Batch import)
// -------------------------------------------------------------
router.post('/bulk', authenticateToken, async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Valid items array required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];

    // Pre-load categories for name lookup
    const catRes = await client.query('SELECT id, LOWER(name) as name_lower FROM store_categories');
    const catMap = {};
    catRes.rows.forEach(r => { catMap[r.name_lower] = r.id; });

    for (const raw of items) {
      if (!raw.name || !raw.name.trim()) continue;

      let code = raw.item_code?.trim();
      if (!code) {
        code = await generateItemCode(client);
      }

      let categoryId = null;
      if (raw.category_name) {
        categoryId = catMap[raw.category_name.trim().toLowerCase()] || null;
      }

      const resInsert = await client.query(`
        INSERT INTO store_items (
          item_code, name, arabic_name, category_id, primary_unit,
          secondary_unit, unit_conversion_ratio, min_stock_level, reorder_quantity,
          last_purchase_price, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Active')
        ON CONFLICT (item_code) DO UPDATE
        SET name = EXCLUDED.name,
            min_stock_level = EXCLUDED.min_stock_level,
            updated_at = NOW()
        RETURNING *
      `, [
        code,
        raw.name.trim(),
        raw.arabic_name?.trim() || null,
        categoryId,
        raw.primary_unit?.trim() || 'KG',
        raw.secondary_unit?.trim() || null,
        parseFloat(raw.unit_conversion_ratio) || 1.0,
        parseFloat(raw.min_stock_level) || 5.0,
        parseFloat(raw.reorder_quantity) || 10.0,
        parseFloat(raw.last_purchase_price) || 0,
        raw.notes || null
      ]);

      created.push(resInsert.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, count: created.length, items: created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error bulk importing store items:', err);
    res.status(500).json({ error: 'Failed to bulk import store items: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
