const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin, isAdminOrCashier } = require('../middleware/auth');

async function checkBranchAccess(req, orderId) {
  const role = req.user.role?.trim().toLowerCase();
  const isAdmin = role === 'admin' || role === 'developer';
  if (!isAdmin && req.user.branch) {
    const check = await pool.query('SELECT branch FROM orders WHERE id = $1', [orderId]);
    if (check.rows.length > 0 && check.rows[0].branch !== req.user.branch) {
      return false;
    }
  }
  return true;
}

// Helper to deduct stock based on recipe (FIFO)
async function deductStock(orderId, client) {
  const orderItems = await client.query('SELECT id, item_id, qty FROM order_items WHERE order_id = $1', [orderId]);
  for (const item of orderItems.rows) {
    if (!item.item_id) continue;
    
    const recipe = await client.query('SELECT stock_id, quantity_used FROM recipes WHERE item_id = $1', [item.item_id]);
    for (const ingredient of recipe.rows) {
      let requiredQty = ingredient.quantity_used * item.qty;
      
      // FIFO: find oldest batches with remaining stock
      const batches = await client.query(
        'SELECT id, remaining_quantity, price_per_unit FROM stock_history WHERE stock_id = $1 AND remaining_quantity > 0 ORDER BY created_at ASC',
        [ingredient.stock_id]
      );

      for (const batch of batches.rows) {
        if (requiredQty <= 0) break;

        const take = Math.min(requiredQty, batch.remaining_quantity);
        
        // Update batch
        await client.query(
          'UPDATE stock_history SET remaining_quantity = remaining_quantity - $1 WHERE id = $2',
          [take, batch.id]
        );

        // Record usage
        await client.query(
          'INSERT INTO order_item_usage (order_item_id, stock_history_id, quantity_used, cost_at_time) VALUES ($1, $2, $3, $4)',
          [item.id, batch.id, take, batch.price_per_unit]
        );

        requiredQty -= take;
      }

      // Update aggregate stock quantity
      const stockUpdate = await client.query(
        'UPDATE stock SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2 RETURNING quantity, low_stock_threshold',
        [ingredient.quantity_used * item.qty, ingredient.stock_id]
      );

      if (stockUpdate.rows.length > 0) {
        const { quantity, low_stock_threshold } = stockUpdate.rows[0];
        const currentQty = parseFloat(quantity) || 0;
        const threshold = parseFloat(low_stock_threshold) || 0;

        if (currentQty <= threshold && threshold > 0) {
          await client.query(
            'UPDATE stock SET low_stock_at = COALESCE(low_stock_at, NOW()), is_dismissed = false WHERE id = $1',
            [ingredient.stock_id]
          );
        }
      }
    }
  }
}

// Helper to return stock based on usage records (for reversals)
async function returnStock(orderId, client) {
  // Find all usage records for this order
  const usages = await client.query(`
    SELECT ou.*, oi.order_id 
    FROM order_item_usage ou
    JOIN order_items oi ON ou.order_item_id = oi.id
    WHERE oi.order_id = $1
  `, [orderId]);

  for (const usage of usages.rows) {
    // Restore batch
    await client.query(
      'UPDATE stock_history SET remaining_quantity = remaining_quantity + $1 WHERE id = $2',
      [usage.quantity_used, usage.stock_history_id]
    );

    // Get stock_id for aggregate update
    const batch = await client.query('SELECT stock_id FROM stock_history WHERE id = $1', [usage.stock_history_id]);
    const stockId = batch.rows[0].stock_id;

    // Restore aggregate
    await client.query(
      'UPDATE stock SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
      [usage.quantity_used, stockId]
    );
  }

  // Delete usage records
  await client.query('DELETE FROM order_item_usage WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = $1)', [orderId]);
}

// POST create order atomically
router.post('/', authenticateToken, async (req, res) => {
  const { items, subtotal, tax, grand_total, payment_method, customer_name, customer_phone, customer_address, discount, client_order_id, order_type, table_number, order_taker, comments } = req.body;
  const client = await pool.connect();
  try {
    // Idempotency check: If client_order_id exists, return existing order
    if (client_order_id) {
       const existing = await client.query('SELECT * FROM orders WHERE client_order_id = $1', [client_order_id]);
       if (existing.rows.length > 0) {
         console.log('--- Duplicate Order Detected ---', client_order_id);
         return res.status(200).json({ success: true, order: existing.rows[0], duplicated: true });
       }
    }

    await client.query('BEGIN');

    const status = (payment_method === 'Hold' || payment_method === 'Payment Pending') ? payment_method : 'Completed';

    const role = req.user.role?.trim().toLowerCase();
    const isAdmin = role === 'admin' || role === 'developer';
    const finalBranch = (!isAdmin && req.user.branch) ? req.user.branch : (req.body.branch || 'Branch 1');

    // Calculate daily resetting slip number per branch
    const slipResult = await client.query(
      `SELECT COALESCE(MAX(slip_number), 0) + 1 as next_slip 
       FROM orders 
       WHERE created_at >= CURRENT_DATE AND branch = $1`,
      [finalBranch]
    );
    const slipNumber = slipResult.rows[0].next_slip;
    let seqName = 'order_id_branch_1';
    if (finalBranch === 'Branch 2') seqName = 'order_id_branch_2';
    else if (finalBranch === 'Branch 3') seqName = 'order_id_branch_3';

    const seqResult = await client.query(`SELECT nextval('${seqName}') as next_id`);
    const newOrderId = seqResult.rows[0].next_id;

    // Insert order
    const orderResult = await client.query(
      `INSERT INTO orders (id, subtotal, tax, grand_total, status, customer_name, customer_phone, customer_address, discount, client_order_id, cancel_requested, cancel_reason, slip_number, is_edited, order_type, table_number, order_taker, comments, branch) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, NULL, $11, FALSE, $12, $13, $14, $15, $16) RETURNING *`,
      [newOrderId, subtotal, tax, grand_total, status, customer_name || null, customer_phone || null, customer_address || null, discount || 0, client_order_id || null, slipNumber, order_type || null, table_number || null, order_taker || null, comments || null, finalBranch]
    );
    const order = orderResult.rows[0];

    // Insert order items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, item_id, item_name, qty, unit_price) 
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.id, item.name, item.qty, item.price]
      );
    }

    // Insert transaction
    await client.query(
      `INSERT INTO transactions (order_id, payment_method, amount) 
       VALUES ($1, $2, $3)`,
      [order.id, payment_method || 'Cash', grand_total]
    );

    // Deduct stock if order is Completed
    if (status === 'Completed') {
      await deductStock(order.id, client);
    }

    await client.query('COMMIT');
    
    // Emit real-time event for new order
    if (req.io) {
      req.io.emit('newOrder', order);
    }
    
    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('❌ Order insertion failed:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET all orders with pagination
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50, cancel_requested } = req.query;
    let query = `
      SELECT o.*, 
        (SELECT json_agg(json_build_object('id', oi.item_id, 'cartId', oi.item_id, 'name', oi.item_name, 'qty', oi.qty, 'price', oi.unit_price)) 
         FROM order_items oi WHERE oi.order_id = o.id) as items 
      FROM orders o WHERE 1=1
    `;
    const params = [];

    if (status) {
      if (status.includes(',')) {
        params.push(status.split(','));
        query += ` AND o.status = ANY($${params.length})`;
      } else {
        params.push(status);
        query += ` AND o.status = $${params.length}`;
      }
    }

    if (cancel_requested === 'true') {
      query += ` AND o.cancel_requested = TRUE`;
    }

    // Branch isolation
    const role = req.user.role?.trim().toLowerCase();
    const isAdmin = role === 'admin' || role === 'developer';
    if (!isAdmin) {
      if (!req.user?.branch || req.user.branch === 'All') {
        return res.json([]);
      }
      params.push(req.user.branch);
      query += ` AND o.branch = $${params.length}`;
    } else if (req.query.branch && req.query.branch !== 'All') {
      params.push(req.query.branch);
      query += ` AND o.branch = $${params.length}`;
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET order by ID with items
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    if (!(await checkBranchAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Access denied: Order belongs to another branch' });
    }
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    
    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  try {
    if (!(await checkBranchAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Access denied: Order belongs to another branch' });
    }
    const result = await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    const updatedOrder = result.rows[0];
    if (req.io) req.io.emit('orderUpdated', updatedOrder);
    res.json(updatedOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH pay held order
router.patch('/:id/pay', authenticateToken, async (req, res) => {
  const { payment_method } = req.body;
  if (!['Cash', 'Card', 'Online'].includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }
  const client = await pool.connect();
  try {
    if (!(await checkBranchAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Access denied: Order belongs to another branch' });
    }
    await client.query('BEGIN');
    
    // Update order status to Completed
    const orderResult = await client.query(
      `UPDATE orders SET status = 'Completed' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Update transaction to Cash/Card
    await client.query(
      `UPDATE transactions SET payment_method = $1 WHERE order_id = $2`,
      [payment_method, req.params.id]
    );
    
    // Deduct stock now that it's paid/completed
    await deductStock(req.params.id, client);

    await client.query('COMMIT');
    const updatedOrder = orderResult.rows[0];
    if (req.io) req.io.emit('orderUpdated', updatedOrder);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH cancel or return order
router.patch('/:id/void', authenticateToken, isAdminOrCashier, async (req, res) => {
  const { type } = req.body;
  const updateTo = ['Cancelled', 'Returned'].includes(type) ? type : 'Cancelled';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update order status and clear cancellation request if any
    const orderResult = await client.query(
      `UPDATE orders SET status = $1, cancel_requested = FALSE, cancel_reason = NULL WHERE id = $2 RETURNING *`,
      [updateTo, req.params.id]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Update transaction
    await client.query(
      `UPDATE transactions SET payment_method = $1 WHERE order_id = $2`,
      [updateTo, req.params.id]
    );
    
    // Return stock if it was previously deducted (i.e. if order was Completed)
    // Actually, safest is to check previous status or just return if it's currently Completed
    // But since this route is for voiding, we can assume it was completed.
    await returnStock(req.params.id, client);

    await client.query('COMMIT');
    const updatedOrder = orderResult.rows[0];
    if (req.io) req.io.emit('orderUpdated', updatedOrder);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH request cancellation
router.patch('/:id/request-cancel', authenticateToken, async (req, res) => {
  const { reason } = req.body;
  try {
    const orderCheck = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const result = await pool.query(
      'UPDATE orders SET cancel_requested = TRUE, cancel_reason = $1 WHERE id = $2 RETURNING *',
      [reason || 'No reason provided', req.params.id]
    );
    const updatedOrder = result.rows[0];
    if (req.io) req.io.emit('orderUpdated', updatedOrder);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH handle cancellation request (Admin or Cashier)
router.patch('/:id/handle-cancel-request', authenticateToken, isAdminOrCashier, async (req, res) => {
  const { action } = req.body; // 'approve' or 'reject'
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    if (action === 'approve') {
       // Similar to void but specifically for requests
       const orderResult = await client.query(
         `UPDATE orders SET status = 'Cancelled', cancel_requested = FALSE, cancel_reason = NULL WHERE id = $1 RETURNING *`,
         [req.params.id]
       );
       if (orderResult.rows.length === 0) {
         await client.query('ROLLBACK');
         return res.status(404).json({ error: 'Order not found' });
       }
       await client.query(
         `UPDATE transactions SET payment_method = 'Cancelled' WHERE order_id = $1`,
         [req.params.id]
       );
       await client.query('COMMIT');
       const updatedOrder = orderResult.rows[0];
       if (req.io) req.io.emit('orderUpdated', updatedOrder);
       return res.json({ success: true, message: 'Cancellation request approved', order: updatedOrder });
    } else {
       // Reject: Just clear the request
       const result = await pool.query(
         'UPDATE orders SET cancel_requested = FALSE, cancel_reason = NULL WHERE id = $1 RETURNING *',
         [req.params.id]
       );
       await client.query('COMMIT');
       const updatedOrder = result.rows[0];
       if (req.io) req.io.emit('orderUpdated', updatedOrder);
       return res.json({ success: true, message: 'Cancellation request rejected', order: updatedOrder });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST daily closing
router.post('/daily-closing', authenticateToken, isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // We retain Hold orders in Hold status (they are not cancelled during daily closing)
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Daily closing complete.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE order
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check if order exists
    const orderCheck = await client.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    // Delete order items first (foreign key constraint)
    await client.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    
    // Delete transactions
    await client.query('DELETE FROM transactions WHERE order_id = $1', [req.params.id]);
    
    // Delete order
    await client.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    
    await client.query('COMMIT');
    if (req.io) req.io.emit('orderUpdated', { id: req.params.id, deleted: true });
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update order
router.put('/:id', authenticateToken, async (req, res) => {
  const { items, subtotal, tax, grand_total, payment_method, customer_name, customer_phone, customer_address, discount, client_order_id, order_type, table_number, order_taker, comments } = req.body;
  const client = await pool.connect();
  try {
    if (!(await checkBranchAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Access denied: Order belongs to another branch' });
    }
    await client.query('BEGIN');

    // Check if order exists and get existing items
    const orderCheck = await client.query('SELECT status, edit_history FROM orders WHERE id = $1', [req.params.id]);
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const existingOrder = orderCheck.rows[0];
    const oldItemsRes = await client.query('SELECT item_name, qty FROM order_items WHERE order_id = $1', [req.params.id]);
    const oldItems = oldItemsRes.rows;

    // Compute Diff
    const diff = [];
    const newItemsMap = {};
    items.forEach(i => newItemsMap[i.name] = i.qty);
    
    const oldItemsMap = {};
    oldItems.forEach(i => oldItemsMap[i.item_name] = i.qty);

    // Check for removed or decreased qty
    for (const oldName in oldItemsMap) {
      const oldQty = oldItemsMap[oldName];
      const newQty = newItemsMap[oldName] || 0;
      if (newQty === 0) {
        diff.push({ type: 'removed', name: oldName, qty: oldQty });
      } else if (newQty < oldQty) {
        diff.push({ type: 'decreased', name: oldName, diffQty: oldQty - newQty, oldQty, newQty });
      } else if (newQty > oldQty) {
        diff.push({ type: 'increased', name: oldName, diffQty: newQty - oldQty, oldQty, newQty });
      }
    }
    // Check for newly added items
    for (const newName in newItemsMap) {
      if (!oldItemsMap[newName]) {
        diff.push({ type: 'added', name: newName, qty: newItemsMap[newName] });
      }
    }

    // Prepare edit history
    let editHistory = existingOrder.edit_history || [];
    if (diff.length > 0) {
      editHistory.push({
        timestamp: new Date().toISOString(),
        edited_by: req.user?.username || req.user?.role || 'Unknown User',
        changes: diff
      });
    }

    const status = payment_method === 'Hold' ? 'Hold' : 'Completed';

    // Update order details
    const orderResult = await client.query(
      `UPDATE orders 
       SET subtotal = $1, tax = $2, grand_total = $3, status = $4, 
           customer_name = $5, customer_phone = $6, customer_address = $7, discount = $8,
           client_order_id = COALESCE($9, client_order_id),
           order_type = $10, table_number = $11, order_taker = $12, comments = $13,
           is_edited = TRUE,
           edit_count = COALESCE(edit_count, 0) + 1,
           edit_history = $14
       WHERE id = $15 RETURNING *`,
      [subtotal, tax, grand_total, status, customer_name || null, customer_phone || null, customer_address || null, discount || 0, client_order_id || null, order_type || null, table_number || null, order_taker || null, comments || null, JSON.stringify(editHistory), req.params.id]
    );

    // Replace order items: Delete existing and insert new
    await client.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, item_id, item_name, qty, unit_price) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, item.id, item.name, item.qty, item.price]
      );
    }

    // Update transaction
    await client.query(
      `UPDATE transactions 
       SET payment_method = $1, amount = $2 
       WHERE order_id = $3`,
      [payment_method || 'Cash', grand_total, req.params.id]
    );

    await client.query('COMMIT');
    const updatedOrder = orderResult.rows[0];
    if (req.io) req.io.emit('orderUpdated', updatedOrder);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
