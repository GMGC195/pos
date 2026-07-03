const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');

router.use(authenticateToken);
router.use(isAdmin);

// GET recipes/ingredients for a specific menu item
router.get('/:itemId', async (req, res) => {
  const { itemId } = req.params;
  try {
    const itemCheck = await pool.query('SELECT * FROM items WHERE id = $1', [itemId]);
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    const result = await pool.query(`
      SELECT r.id, r.item_id, r.stock_id, r.quantity_used, r.size_label,
             s.name as stock_name, s.unit, s.price_per_unit,
             (r.quantity_used * s.price_per_unit) as ingredient_cost
      FROM recipes r
      JOIN stock s ON r.stock_id = s.id
      WHERE r.item_id = $1
      ORDER BY COALESCE(r.size_label, '') ASC, s.name ASC
    `, [itemId]);

    const item = itemCheck.rows[0];
    const sizeOptions = item.size_options || [];

    // Build per-size cost map
    const perSizeCost = {};
    let globalCost = 0; // ingredients with no size (All Sizes)

    const ingredients = result.rows.map(row => {
      const cost = parseFloat(row.ingredient_cost) || 0;
      if (!row.size_label) {
        globalCost += cost;
      } else {
        perSizeCost[row.size_label] = (perSizeCost[row.size_label] || 0) + cost;
      }
      return { ...row, ingredient_cost: cost };
    });

    // Total cost per size = size-specific + global (all-sizes ingredients)
    let totalCost = 0;
    const sizeCosts = {};
    const sizeNames = sizeOptions.map(opt => opt.includes(':') ? opt.split(':')[0] : opt);

    if (sizeNames.length > 0) {
      sizeNames.forEach(name => {
        sizeCosts[name] = (perSizeCost[name] || 0) + globalCost;
      });
      // Use max cost as the single totalCost fallback
      const vals = Object.values(sizeCosts);
      totalCost = vals.length > 0 ? Math.max(...vals) : globalCost;
    } else {
      totalCost = globalCost;
    }

    res.json({ item, ingredients, totalCost, sizeCosts, sizeOptions: sizeNames });

  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).json({ error: 'Failed to fetch recipe' });
  }
});

// POST add ingredient to recipe
router.post('/', async (req, res) => {
  const { item_id, stock_id, quantity_used, size_label } = req.body;
  if (!item_id || !stock_id || quantity_used === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const itemCheck = await pool.query('SELECT id FROM items WHERE id = $1', [item_id]);
    if (itemCheck.rows.length === 0) return res.status(404).json({ error: 'Menu item not found' });

    const stockCheck = await pool.query('SELECT id FROM stock WHERE id = $1', [stock_id]);
    if (stockCheck.rows.length === 0) return res.status(404).json({ error: 'Stock item not found' });

    // Normalize: empty string → null (All Sizes slot)
    const normalizedSize = size_label && size_label.trim() !== '' ? size_label.trim() : null;

    const result = await pool.query(
      'INSERT INTO recipes (item_id, stock_id, quantity_used, size_label) VALUES ($1, $2, $3, $4) RETURNING *',
      [item_id, stock_id, quantity_used, normalizedSize]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding to recipe:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This ingredient is already in the recipe for this size. Remove it first to update.' });
    }
    res.status(500).json({ error: 'Failed to add ingredient to recipe' });
  }
});

// PUT update ingredient quantity/size in recipe
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { quantity_used, size_label } = req.body;
  if (quantity_used === undefined) return res.status(400).json({ error: 'Missing quantity_used' });
  try {
    const normalizedSize = size_label && size_label.trim() !== '' ? size_label.trim() : null;
    const result = await pool.query(
      'UPDATE recipes SET quantity_used = $1, size_label = $2 WHERE id = $3 RETURNING *',
      [quantity_used, normalizedSize, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recipe ingredient not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating recipe ingredient:', error);
    if (error.code === '23505') return res.status(409).json({ error: 'This ingredient already exists for this size.' });
    res.status(500).json({ error: 'Failed to update recipe ingredient' });
  }
});

// DELETE remove ingredient from recipe
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM recipes WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recipe ingredient not found' });
    }
    res.json({ message: 'Recipe ingredient removed successfully', deleted: result.rows[0] });
  } catch (error) {
    console.error('Error removing from recipe:', error);
    res.status(500).json({ error: 'Failed to remove ingredient from recipe' });
  }
});

module.exports = router;
