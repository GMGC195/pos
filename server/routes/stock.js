const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Apply admin-only auth to all stock routes
router.use(authenticateToken);
router.use(isAdmin);

// GET stock alerts (low stock)
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, quantity, unit, low_stock_threshold, low_stock_at 
       FROM stock 
       WHERE quantity <= low_stock_threshold 
       AND low_stock_threshold > 0 
       AND is_dismissed = false 
       ORDER BY low_stock_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching stock alerts:', error);
    res.status(500).json({ error: 'Failed to fetch stock alerts' });
  }
});

// POST clear all stock alerts
router.post('/alerts/clear', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE stock SET is_dismissed = true WHERE quantity <= low_stock_threshold AND low_stock_threshold > 0'
    );
    res.json({ success: true, message: 'All alerts cleared' });
  } catch (error) {
    console.error('Error clearing all alerts:', error);
    res.status(500).json({ error: 'Failed to clear alerts' });
  }
});

// POST clear individual stock alert
router.post('/alerts/:id/clear', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE stock SET is_dismissed = true WHERE id = $1', [id]);
    res.json({ success: true, message: 'Alert cleared' });
  } catch (error) {
    console.error('Error clearing alert:', error);
    res.status(500).json({ error: 'Failed to clear alert' });
  }
});

// GET all stock items
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stock ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching stock:', error);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

// CREATE stock item
router.post('/', async (req, res) => {
  const { name, quantity, unit, price_per_unit } = req.body;
  if (!name || quantity === undefined || !unit || price_per_unit === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO stock (name, quantity, unit, price_per_unit) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, quantity, unit, price_per_unit]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating stock item:', error);
    if (error.code === '23505') { // unique violation
      return res.status(409).json({ error: 'Stock item with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create stock item' });
  }
});

// UPDATE stock item
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, quantity, unit, price_per_unit } = req.body;

  try {
    const checkItem = await pool.query('SELECT * FROM stock WHERE id = $1', [id]);
    if (checkItem.rows.length === 0) {
      return res.status(404).json({ error: 'Stock item not found' });
    }

    const result = await pool.query(
      `UPDATE stock 
       SET name = COALESCE($1, name), 
           quantity = COALESCE($2, quantity), 
           unit = COALESCE($3, unit), 
           price_per_unit = COALESCE($4, price_per_unit),
           low_stock_threshold = COALESCE($5, low_stock_threshold),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, quantity, unit, price_per_unit, req.body.low_stock_threshold, id]
    );

    if (result.rows.length > 0) {
      const currentQty = parseFloat(result.rows[0].quantity) || 0;
      const threshold = parseFloat(result.rows[0].low_stock_threshold) || 0;
      
      // Reset alert state if quantity is now above threshold
      if (currentQty > threshold) {
        await pool.query(
          'UPDATE stock SET low_stock_at = NULL, is_dismissed = false WHERE id = $1',
          [id]
        );
      }
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating stock item:', error);
    if (error.code === '23505') {
       return res.status(409).json({ error: 'Stock item with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to update stock item' });
  }
});

// DELETE stock item
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Note: Due to ON DELETE RESTRICT in recipes, it will fail if attached to recipes
    const result = await pool.query('DELETE FROM stock WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stock item not found' });
    }
    res.json({ message: 'Stock item deleted successfully', deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting stock item:', error);
    if (error.code === '23503') { // foreign key violation
      return res.status(409).json({ error: 'Cannot delete stock item because it is referenced in a recipe.' });
    }
    res.status(500).json({ error: 'Failed to delete stock item' });
  }
});

// GET today's stock history
router.get('/history', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sh.*, s.name as stock_name 
      FROM stock_history sh
      JOIN stock s ON sh.stock_id = s.id
      WHERE sh.created_at >= CURRENT_DATE
      ORDER BY sh.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching stock history:', error);
    res.status(500).json({ error: 'Failed to fetch stock history' });
  }
});

// ADD daily stock (increment quantity and record history)
router.post('/add-daily', async (req, res) => {
  const { stock_id, quantity, price_per_unit, total_price } = req.body;
  if (!stock_id || !quantity || !price_per_unit || !total_price) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get current unit from stock
    const stockCheck = await client.query('SELECT unit FROM stock WHERE id = $1', [stock_id]);
    if (stockCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Stock item not found' });
    }
    const unit = stockCheck.rows[0].unit;

    // 2. Update stock quantity
    const updateResult = await client.query(
      'UPDATE stock SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [quantity, stock_id]
    );

    // Reset alert state if quantity is now above threshold
    if (updateResult.rows.length > 0) {
      const currentQty = parseFloat(updateResult.rows[0].quantity) || 0;
      const threshold = parseFloat(updateResult.rows[0].low_stock_threshold) || 0;
      
      if (currentQty > threshold) {
        await client.query(
          'UPDATE stock SET low_stock_at = NULL, is_dismissed = false WHERE id = $1',
          [stock_id]
        );
      }
    }

    // 3. Record in history
    const historyResult = await client.query(
      `INSERT INTO stock_history (stock_id, quantity, remaining_quantity, unit, price_per_unit, total_price) 
       VALUES ($1, $2, $2, $3, $4, $5) RETURNING *`,
      [stock_id, quantity, unit, price_per_unit, total_price]
    );

    await client.query('COMMIT');
    res.status(201).json({ 
      success: true, 
      stock: updateResult.rows[0], 
      history: historyResult.rows[0] 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding daily stock:', error);
    res.status(500).json({ error: 'Failed to add daily stock' });
  } finally {
    client.release();
  }
});

// PATCH update threshold
router.patch('/:id/threshold', async (req, res) => {
  const { id } = req.params;
  const { threshold } = req.body;
  try {
    const result = await pool.query(
      'UPDATE stock SET low_stock_threshold = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [threshold, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Stock item not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating threshold:', error);
    res.status(500).json({ error: 'Failed to update threshold' });
  }
});

// GET waste history (last 30 days)
router.get('/waste', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.*, s.name as stock_name, s.unit
      FROM stock_waste_history w
      JOIN stock s ON w.stock_id = s.id
      WHERE w.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY w.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching waste history:', error);
    res.status(500).json({ error: 'Failed to fetch waste history' });
  }
});

// GET batches for a specific stock item
router.get('/:id/batches', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT * FROM stock_history
      WHERE stock_id = $1 AND remaining_quantity > 0
      ORDER BY created_at ASC
    `, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// POST minus stock
router.post('/minus', async (req, res) => {
  const { stock_id, stock_history_id, quantity, reason } = req.body;
  if (!stock_id || !quantity || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const deductQty = parseFloat(quantity);
  if (deductQty <= 0) {
    return res.status(400).json({ error: 'Quantity to deduct must be greater than 0' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. Pre-check: read current global stock quantity to prevent going negative
    const stockCheck = await client.query('SELECT quantity, name FROM stock WHERE id = $1', [stock_id]);
    if (stockCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Stock item not found' });
    }
    const currentQty = parseFloat(stockCheck.rows[0].quantity);
    const itemName = stockCheck.rows[0].name;

    if (deductQty > currentQty) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot deduct ${deductQty}. Only ${currentQty.toFixed(3)} of ${itemName} remaining in stock.`
      });
    }

    // 1. Check selected batch quantity if provided
    if (stock_history_id) {
      const batchCheck = await client.query('SELECT remaining_quantity FROM stock_history WHERE id = $1', [stock_history_id]);
      if (batchCheck.rows.length > 0) {
        const batchRemaining = parseFloat(batchCheck.rows[0].remaining_quantity);
        if (deductQty > batchRemaining) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Cannot deduct ${deductQty} from this batch. Only ${batchRemaining.toFixed(3)} remaining in that batch.`
          });
        }
        await client.query(
          'UPDATE stock_history SET remaining_quantity = remaining_quantity - $1 WHERE id = $2',
          [deductQty, stock_history_id]
        );
      }
    }

    // 2. Deduct from global stock
    const stockUpdate = await client.query(
      'UPDATE stock SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [deductQty, stock_id]
    );

    // 3. Record in waste history
    const wasteResult = await client.query(
      `INSERT INTO stock_waste_history (stock_id, stock_history_id, quantity, reason) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [stock_id, stock_history_id || null, deductQty, reason]
    );

    await client.query('COMMIT');
    res.json({ success: true, stock: stockUpdate.rows[0], waste: wasteResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in minus stock:', error);
    res.status(500).json({ error: 'Failed to minus stock' });
  } finally {
    client.release();
  }
});

// PUT update stock history (added stock)
router.put('/history/:id', async (req, res) => {
  const { id } = req.params;
  const { quantity, price_per_unit, total_price } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get existing history
    const historyCheck = await client.query('SELECT * FROM stock_history WHERE id = $1', [id]);
    if (historyCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'History record not found' });
    }
    
    const oldRecord = historyCheck.rows[0];
    const oldQuantity = parseFloat(oldRecord.quantity);
    const oldRemaining = parseFloat(oldRecord.remaining_quantity);
    const consumed = oldQuantity - oldRemaining;
    const newQuantity = parseFloat(quantity);
    
    if (newQuantity < consumed) {
       await client.query('ROLLBACK');
       return res.status(400).json({ error: 'Cannot update quantity below what has already been consumed by orders.' });
    }
    
    const diff = newQuantity - oldQuantity;
    const newRemaining = oldRemaining + diff;
    
    // Update history
    const updateHistory = await client.query(
      'UPDATE stock_history SET quantity = $1, remaining_quantity = $2, price_per_unit = $3, total_price = $4 WHERE id = $5 RETURNING *',
      [newQuantity, newRemaining, price_per_unit, total_price, id]
    );
    
    // Update global stock
    await client.query(
      'UPDATE stock SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
      [diff, oldRecord.stock_id]
    );

    await client.query('COMMIT');
    res.json({ success: true, history: updateHistory.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating stock history:', error);
    res.status(500).json({ error: 'Failed to update stock history' });
  } finally {
    client.release();
  }
});

// DELETE stock history
router.delete('/history/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const historyCheck = await client.query('SELECT * FROM stock_history WHERE id = $1', [id]);
    if (historyCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'History record not found' });
    }
    const record = historyCheck.rows[0];
    
    // Deduct remaining quantity from global stock
    await client.query(
      'UPDATE stock SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
      [record.remaining_quantity, record.stock_id]
    );
    
    // Delete history
    await client.query('DELETE FROM stock_history WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Stock history deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting stock history:', error);
    res.status(500).json({ error: 'Failed to delete stock history' });
  } finally {
    client.release();
  }
});

module.exports = router;
