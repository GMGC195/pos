const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken, isAdmin, isAdminOrManagement } = require('../../middleware/auth');

// Helper to check store manager or admin
const isStoreAdminOrManager = (req, res, next) => {
  const role = req.user?.role?.trim().toLowerCase();
  if (['admin', 'developer', 'management', 'store manager'].includes(role)) {
    next();
  } else {
    res.status(403).json({ error: 'Store management authorization required' });
  }
};

// -------------------------------------------------------------
// BRANCHES (Dynamic Discovery)
// -------------------------------------------------------------
router.get('/branches', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT b FROM (
        SELECT branch AS b FROM store_locations WHERE branch IS NOT NULL AND branch != ''
        UNION
        SELECT branch AS b FROM users WHERE branch IS NOT NULL AND branch != '' AND branch != 'All'
        UNION
        SELECT 'Branch 1' AS b
        UNION
        SELECT 'Branch 2' AS b
        UNION
        SELECT 'Branch 3' AS b
        UNION
        SELECT 'Central Kitchen' AS b
      ) sub
      WHERE b IS NOT NULL AND b != ''
      ORDER BY b ASC
    `);
    const branches = result.rows.map(r => r.b);
    res.json(branches);
  } catch (err) {
    console.error('Error fetching store branches:', err);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// -------------------------------------------------------------
// STORE LOCATIONS
// -------------------------------------------------------------
router.get('/locations', authenticateToken, async (req, res) => {
  try {
    const { branch } = req.query;
    let query = 'SELECT * FROM store_locations WHERE 1=1';
    const params = [];

    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND branch = $${params.length}`;
    }

    query += ' ORDER BY branch ASC, name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching store locations:', err);
    res.status(500).json({ error: 'Failed to fetch store locations' });
  }
});

router.post('/locations', authenticateToken, isStoreAdminOrManager, async (req, res) => {
  const { name, branch, code, store_type, description } = req.body;
  if (!name || !branch) {
    return res.status(400).json({ error: 'Location name and branch are required' });
  }

  try {
    let finalCode = code?.trim();
    if (!finalCode) {
      const branchSlug = branch.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      finalCode = `STR-${branchSlug}-${randomSuffix}`;
    }

    const result = await pool.query(
      `INSERT INTO store_locations (name, branch, code, store_type, description, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [name.trim(), branch.trim(), finalCode, store_type || 'Branch Store', description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating store location:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A store location with this code already exists' });
    }
    res.status(500).json({ error: 'Failed to create store location' });
  }
});

router.put('/locations/:id', authenticateToken, isStoreAdminOrManager, async (req, res) => {
  const { id } = req.params;
  const { name, branch, code, store_type, description, is_active } = req.body;

  try {
    const result = await pool.query(
      `UPDATE store_locations
       SET name = COALESCE($1, name),
           branch = COALESCE($2, branch),
           code = COALESCE($3, code),
           store_type = COALESCE($4, store_type),
           description = COALESCE($5, description),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, branch, code, store_type, description, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store location not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating store location:', err);
    res.status(500).json({ error: 'Failed to update store location' });
  }
});

router.delete('/locations/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Check if location has stock
    const invCheck = await pool.query('SELECT COUNT(*) FROM store_inventory WHERE store_id = $1 AND current_stock > 0', [id]);
    if (parseInt(invCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete location that still has active stock. Please transfer or adjust stock first.' });
    }

    const result = await pool.query('DELETE FROM store_locations WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store location not found' });
    }
    res.json({ message: 'Store location deleted successfully' });
  } catch (err) {
    console.error('Error deleting store location:', err);
    res.status(500).json({ error: 'Failed to delete store location' });
  }
});

// -------------------------------------------------------------
// DYNAMIC STORE CATEGORIES
// -------------------------------------------------------------
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM store_categories ORDER BY sort_order ASC, name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching store categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/categories', authenticateToken, isStoreAdminOrManager, async (req, res) => {
  const { name, description, icon, sort_order } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO store_categories (name, description, icon, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), description || null, icon || 'Package', parseInt(sort_order, 10) || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating store category:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A category with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/categories/:id', authenticateToken, isStoreAdminOrManager, async (req, res) => {
  const { id } = req.params;
  const { name, description, icon, sort_order, is_active } = req.body;

  try {
    const result = await pool.query(
      `UPDATE store_categories
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           icon = COALESCE($3, icon),
           sort_order = COALESCE($4, sort_order),
           is_active = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [name, description, icon, sort_order, is_active, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const itemsCheck = await pool.query('SELECT COUNT(*) FROM store_items WHERE category_id = $1', [id]);
    if (parseInt(itemsCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete category that is assigned to existing store items.' });
    }

    const result = await pool.query('DELETE FROM store_categories WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// -------------------------------------------------------------
// STORE MEASUREMENT UNITS
// -------------------------------------------------------------
router.get('/units', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM store_units ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching units:', err);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

router.post('/units', authenticateToken, isStoreAdminOrManager, async (req, res) => {
  const { name, short_code, conversion_factor } = req.body;
  if (!name || !short_code) {
    return res.status(400).json({ error: 'Unit name and short code are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO store_units (name, short_code, conversion_factor)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), short_code.trim().toUpperCase(), parseFloat(conversion_factor) || 1.0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating unit:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A unit with this short code already exists' });
    }
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

module.exports = router;
