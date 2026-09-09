const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin, isAdminOrCashier } = require('../middleware/auth');
const { Resend } = require('resend');
const Pusher = require('pusher');

let pusher = null;
try {
  if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER) {
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER,
      useTLS: true
    });
  } else {
    console.warn('⚠️ Pusher credentials missing or incomplete. Auto-printing will be disabled.');
  }
} catch (err) {
  console.error('❌ Failed to initialize Pusher:', err);
}
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
  console.log(`[ORDER DEBUG] Order request received:`, { order_type, table_number, order_taker, itemCount: items?.length });
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

    const isCompleted = (status === 'Completed' || status === 'Cash' || status === 'Card' || status === 'Online');
    const completedBy = isCompleted ? (req.user.username || order_taker || null) : null;
    const completedAt = isCompleted ? new Date() : null;

    // Insert order
    const orderResult = await client.query(
      `INSERT INTO orders (id, subtotal, tax, grand_total, status, customer_name, customer_phone, customer_address, discount, client_order_id, cancel_requested, cancel_reason, slip_number, is_edited, order_type, table_number, order_taker, comments, branch, completed_by, completed_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, NULL, $11, FALSE, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
      [newOrderId, subtotal, tax, grand_total, status, customer_name || null, customer_phone || null, customer_address || null, discount || 0, client_order_id || null, slipNumber, order_type || null, table_number || null, order_taker || null, comments || null, finalBranch, completedBy, completedAt]
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

    // Auto-print integration via Pusher
    try {
      console.log('[PUSHER DEBUG] Env presence:', {
        hasAppId: !!process.env.PUSHER_APP_ID,
        hasKey: !!process.env.PUSHER_KEY,
        hasSecret: !!process.env.PUSHER_SECRET,
        hasCluster: !!process.env.PUSHER_CLUSTER,
      });

      const settingsRes = await pool.query('SELECT auto_print_enabled, printer_ip FROM settings ORDER BY id ASC LIMIT 1');
      console.log('[ORDER DEBUG] Fetched settings:', settingsRes.rows[0]);
      
      const autoPrintEnabled = settingsRes.rows.length > 0 && settingsRes.rows[0].auto_print_enabled === true;
      console.log('[ORDER DEBUG] auto_print_enabled value:', autoPrintEnabled);

      if (autoPrintEnabled) {
        const printerIp = settingsRes.rows[0].printer_ip || '127.0.0.1';
        const effectiveBranch = finalBranch || 'Branch 1';
        let shortBranch = effectiveBranch;
        if (effectiveBranch === 'Branch 1') shortBranch = 'B1';
        else if (effectiveBranch === 'Branch 2') shortBranch = 'B2';
        else if (effectiveBranch === 'Branch 3') shortBranch = 'B3';

        const payload = {
          orderId: order.id,
          slipNumber: slipNumber,
          editCount: 0,
          orderType: `${shortBranch} - ${order.order_type || "Takeaway"}`,
          tableNo: order.table_number || "",
          waiterName: order.order_taker || "Staff",
          branch: finalBranch,
          printerIp: printerIp,
          subtotal: subtotal,
          tax: tax,
          grandTotal: grand_total,
          discount: discount || 0,
          paymentMethod: payment_method || status,
          date: new Date().toISOString(),
          items: items.map(item => ({
            name: item.name,
            qty: item.qty || 1,
            price: item.price
          }))
        };
        
        if (pusher) {
          try {
            console.log('[PUSHER DEBUG] Attempting trigger on channel: restaurant-orders, event: new-order');
            const response = await pusher.trigger('restaurant-orders', 'new-order', payload);
            console.log('[PUSHER DEBUG] Trigger succeeded! Response:', response.status);
          } catch (pusherErr) {
            console.error('[PUSHER ERROR] Failed to dispatch event to Pusher:', pusherErr);
          }
        } else {
          console.error('[PUSHER ERROR] Pusher is not initialized, cannot dispatch auto-print event.');
        }
      }
    } catch (printErr) {
      console.error('[ORDER ERROR] Auto print logic error:', printErr);
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

// GET past closings
router.get('/closings', authenticateToken, async (req, res) => {
  try {
    let { date, cashier_id, branch: queryBranch } = req.query;
    
    // Determine the branch to filter by
    const role = req.user?.role?.trim().toLowerCase();
    const isAdminRole = role === 'admin' || role === 'developer';
    
    let branchFilter = null;
    if (isAdminRole) {
      if (queryBranch && queryBranch !== 'All') {
        branchFilter = queryBranch;
      }
    } else {
      branchFilter = req.user.branch && req.user.branch !== 'All' ? req.user.branch : 'Branch 1';
    }
    
    let query = 'SELECT * FROM shift_closings';
    const params = [];
    let conditions = [];
    
    if (branchFilter) {
      params.push(branchFilter);
      conditions.push(`branch = $${params.length}`);
    }
    
    if (date) {
      params.push(date);
      conditions.push(`created_at::date = $${params.length}::date`);
    }
    
    if (cashier_id) {
      params.push(cashier_id);
      conditions.push(`cashier_id = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY created_at DESC';
    
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
      `UPDATE orders SET status = 'Completed', completed_by = $2, completed_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, req.user.username]
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
  const { type, reason } = req.body;
  const updateTo = ['Cancelled', 'Returned'].includes(type) ? type : 'Cancelled';
  const finalReason = reason || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update order status and clear cancellation request if any
    const orderResult = await client.query(
      `UPDATE orders SET status = $1, cancel_requested = FALSE, cancel_reason = $3 WHERE id = $2 RETURNING *`,
      [updateTo, req.params.id, finalReason]
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

async function sendClosingEmail(report, closingType) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const toEmailsStr = process.env.REPORT_TO_EMAILS;
    
    if (!apiKey || !fromEmail || !toEmailsStr) {
      console.log(`[Email System] Skipping: Missing Resend configuration in .env`);
      return;
    }
    
    console.log(`[Email System] Preparing to send ${closingType} report from ${fromEmail} to ${toEmailsStr}`);
    const resend = new Resend(apiKey);
    const toEmails = toEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
    
    let itemsHtml = '';
    let topSellingHtml = '';
    
    try {
      let items = [];
      if (typeof report.items_summary === 'string') {
        if (report.items_summary === '[object Object]') {
          console.warn('[Email System] items_summary is "[object Object]", defaulting to empty array.');
        } else {
          try {
            items = JSON.parse(report.items_summary);
          } catch(parseErr) {
            console.error('[Email System] Failed to parse items_summary string:', parseErr.message);
          }
        }
      } else if (Array.isArray(report.items_summary)) {
        items = report.items_summary;
      } else if (report.items_summary) {
        items = [report.items_summary];
      }

      // Collect all flat items to calculate top selling
      let allFlatItems = [];

      itemsHtml = items.map(cat => {
        let catHtml = `<div style="margin-bottom: 20px; background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
          <div style="background: #f8f9fa; font-weight: bold; font-size: 16px; color: #111; padding: 10px 15px; border-bottom: 1px solid #eee;">
            ${cat.category} <span style="float: right; color: #E31837; font-size: 14px;">SAR ${parseFloat(cat.amount).toFixed(2)} (${cat.qty} items)</span>
          </div>
          <div style="padding: 0 15px;">
            <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 14px; color: #555;">
              <thead>
                <tr style="border-bottom: 1px solid #eee; text-align: left;">
                  <th style="padding: 8px 4px;">Item Name</th>
                  <th style="padding: 8px 4px; text-align: center;">Qty</th>
                  <th style="padding: 8px 4px; text-align: right;">Price</th>
                  <th style="padding: 8px 4px; text-align: right;">Total Price</th>
                </tr>
              </thead>
              <tbody>`;
        
        if (cat.items && Array.isArray(cat.items)) {
          cat.items.forEach(item => {
            const unitPrice = parseFloat(item.amount / item.qty).toFixed(2);
            const totalPrice = parseFloat(item.amount).toFixed(2);
            
            allFlatItems.push({
              name: item.name,
              qty: parseInt(item.qty, 10) || 0,
              totalPrice: parseFloat(item.amount) || 0
            });

            catHtml += `<tr style="border-bottom: 1px dashed #f0f0f0;">
              <td style="padding: 6px 4px;">${item.name}</td>
              <td style="padding: 6px 4px; text-align: center;"><strong>${item.qty}</strong></td>
              <td style="padding: 6px 4px; text-align: right;">SAR ${unitPrice}</td>
              <td style="padding: 6px 4px; text-align: right;">SAR ${totalPrice}</td>
            </tr>`;
          });
        }
        
        catHtml += `</tbody></table></div></div>`;
        return catHtml;
      }).join('');
      
      // Calculate top 5 selling items
      if (allFlatItems.length > 0) {
        const groupedItems = {};
        allFlatItems.forEach(i => {
          if (!groupedItems[i.name]) groupedItems[i.name] = { name: i.name, qty: 0, totalPrice: 0 };
          groupedItems[i.name].qty += i.qty;
          groupedItems[i.name].totalPrice += i.totalPrice;
        });
        
        const sortedTopItems = Object.values(groupedItems).sort((a, b) => b.qty - a.qty).slice(0, 5);
        
        if (sortedTopItems.length > 0) {
          topSellingHtml = `
            <h3 style="margin-top: 30px; border-bottom: 2px solid #eaeaea; padding-bottom: 8px; color: #333;">Top 5 Selling Items</h3>
            <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #555;">
                <thead>
                  <tr style="background: #fff3f4; border-bottom: 1px solid #ffccd0; text-align: left; color: #E31837;">
                    <th style="padding: 10px 15px;">Rank</th>
                    <th style="padding: 10px 15px;">Item Name</th>
                    <th style="padding: 10px 15px; text-align: center;">Qty Sold</th>
                    <th style="padding: 10px 15px; text-align: right;">Revenue</th>
                  </tr>
                </thead>
                <tbody>
          `;
          
          sortedTopItems.forEach((item, index) => {
            topSellingHtml += `
                  <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px 15px; font-weight: bold;">#${index + 1}</td>
                    <td style="padding: 8px 15px;">${item.name}</td>
                    <td style="padding: 8px 15px; text-align: center;"><strong>${item.qty}</strong></td>
                    <td style="padding: 8px 15px; text-align: right;">SAR ${item.totalPrice.toFixed(2)}</td>
                  </tr>
            `;
          });
          
          topSellingHtml += `</tbody></table></div>`;
        }
      }
      
    } catch(e) {
      console.error('Error parsing items summary for email:', e);
    }

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden; background: #fafafa;">
        <div style="background-color: #E31837; padding: 20px; border-bottom: 1px solid #eaeaea; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 22px;">${closingType} Closing Report</h2>
          <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">${report.branch}</p>
        </div>
        <div style="padding: 24px;">
          <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #eaeaea; margin-bottom: 20px;">
            <p style="margin: 4px 0;"><strong>Cashier:</strong> ${report.cashier_name}</p>
            <p style="margin: 4px 0;"><strong>Total Orders:</strong> ${report.total_orders}</p>
            <p style="margin: 4px 0;"><strong>Total Sales:</strong> SAR ${parseFloat(report.total_sales).toFixed(2)}</p>
            <p style="margin: 4px 0;"><strong>Active Time:</strong> ${report.total_active_time}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #777;">${new Date(report.login_time).toLocaleString()} - ${new Date(report.logout_time).toLocaleString()}</p>
          </div>
          
          <h3 style="margin-top: 24px; border-bottom: 2px solid #eaeaea; padding-bottom: 8px; color: #333;">Items Sold by Category</h3>
          <div>${itemsHtml || '<p style="text-align:center; color:#999; padding: 20px;">No items sold</p>'}</div>
          
          ${topSellingHtml}
        </div>
      </div>
    `;

    await resend.emails.send({
      from: `Reports <${fromEmail}>`,
      to: toEmails,
      subject: `${closingType} Closing Report - ${report.branch}`,
      html: htmlContent
    });
    console.log('Closing email sent successfully.');
  } catch(err) {
    console.error('Error sending closing email:', err);
  }
}

// POST shift closing
router.post('/shift-close', authenticateToken, isAdminOrCashier, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let branch = req.body?.branch || req.user?.branch || 'Branch 1';
    const role = req.user?.role?.trim().toLowerCase();
    const isAdminRole = role === 'admin' || role === 'developer';
    if (!isAdminRole && req.user?.branch && req.user.branch !== 'All') {
      branch = req.user.branch;
    }
    if (branch === 'All') branch = 'Branch 1';
    
    const totals = await client.query(`
      SELECT 
        COUNT(id) as total_orders, 
        COALESCE(SUM(grand_total), 0) as total_sales 
      FROM orders 
      WHERE is_shift_closed = FALSE 
        AND status IN ('Completed', 'Returned') 
        AND branch = $1
    `, [branch]);

    const itemsResult = await client.query(`
      SELECT 
        c.name as category, 
        SUM(grouped_items.item_qty) as qty, 
        SUM(grouped_items.item_amount) as amount,
        json_agg(
          json_build_object(
            'name', grouped_items.name,
            'qty', grouped_items.item_qty,
            'amount', grouped_items.item_amount
          )
        ) as items
      FROM (
        SELECT i.category_id, i.name, SUM(oi.qty) as item_qty, SUM(oi.qty * oi.unit_price) as item_amount
        FROM order_items oi
        JOIN items i ON oi.item_id = i.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.is_shift_closed = FALSE AND o.status IN ('Completed', 'Returned') AND o.branch = $1
        GROUP BY i.category_id, i.name
      ) grouped_items
      JOIN categories c ON grouped_items.category_id = c.id
      GROUP BY c.name
      ORDER BY amount DESC
    `, [branch]);

    const loginTimeRes = await client.query('SELECT last_login FROM users WHERE id = $1', [req.user.id]);
    const loginTime = loginTimeRes.rows[0]?.last_login || new Date();
    const logoutTime = new Date();
    const diffMs = logoutTime - new Date(loginTime);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    const totalActiveTime = `${diffHrs}h ${diffMins}m`;

    const insertRes = await client.query(`
      INSERT INTO shift_closings (cashier_id, cashier_name, branch, login_time, logout_time, total_active_time, total_sales, total_orders, items_summary, closing_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Shift')
      RETURNING *
    `, [
      req.user.id,
      req.user.username,
      branch,
      loginTime,
      logoutTime,
      totalActiveTime,
      totals.rows[0].total_sales,
      totals.rows[0].total_orders,
      JSON.stringify(itemsResult.rows)
    ]);

    await client.query(`
      UPDATE orders 
      SET is_shift_closed = TRUE 
      WHERE is_shift_closed = FALSE AND status != 'Hold' AND branch = $1
    `, [branch]);
    
    // Send email report asynchronously
    sendClosingEmail(insertRes.rows[0], 'Shift');
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Shift closing complete.', report: insertRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST daily closing
router.post('/daily-closing', authenticateToken, isAdminOrCashier, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let branch = req.body?.branch || req.user?.branch || 'Branch 1';
    const role = req.user?.role?.trim().toLowerCase();
    const isAdminRole = role === 'admin' || role === 'developer';
    if (!isAdminRole && req.user?.branch && req.user.branch !== 'All') {
      branch = req.user.branch;
    }
    if (branch === 'All') branch = 'Branch 1';
    
    const totals = await client.query(`
      SELECT 
        COUNT(id) as total_orders, 
        COALESCE(SUM(grand_total), 0) as total_sales 
      FROM orders 
      WHERE is_daily_closed = FALSE 
        AND status IN ('Completed', 'Returned') 
        AND branch = $1
    `, [branch]);

    const itemsResult = await client.query(`
      SELECT 
        c.name as category, 
        SUM(grouped_items.item_qty) as qty, 
        SUM(grouped_items.item_amount) as amount,
        json_agg(
          json_build_object(
            'name', grouped_items.name,
            'qty', grouped_items.item_qty,
            'amount', grouped_items.item_amount
          )
        ) as items
      FROM (
        SELECT i.category_id, i.name, SUM(oi.qty) as item_qty, SUM(oi.qty * oi.unit_price) as item_amount
        FROM order_items oi
        JOIN items i ON oi.item_id = i.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.is_daily_closed = FALSE AND o.status IN ('Completed', 'Returned') AND o.branch = $1
        GROUP BY i.category_id, i.name
      ) grouped_items
      JOIN categories c ON grouped_items.category_id = c.id
      GROUP BY c.name
      ORDER BY amount DESC
    `, [branch]);

    const loginTimeRes = await client.query('SELECT last_login FROM users WHERE id = $1', [req.user.id]);
    const loginTime = loginTimeRes.rows[0]?.last_login || new Date();
    const logoutTime = new Date();
    const diffMs = logoutTime - new Date(loginTime);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    const totalActiveTime = `${diffHrs}h ${diffMins}m`;

    const insertRes = await client.query(`
      INSERT INTO shift_closings (cashier_id, cashier_name, branch, login_time, logout_time, total_active_time, total_sales, total_orders, items_summary, closing_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Daily')
      RETURNING *
    `, [
      req.user.id,
      req.user.username,
      branch,
      loginTime,
      logoutTime,
      totalActiveTime,
      totals.rows[0].total_sales,
      totals.rows[0].total_orders,
      JSON.stringify(itemsResult.rows)
    ]);

    await client.query(`
      UPDATE orders 
      SET is_daily_closed = TRUE, is_shift_closed = TRUE
      WHERE is_daily_closed = FALSE AND status != 'Hold' AND branch = $1
    `, [branch]);
    
    // Send email report asynchronously
    sendClosingEmail(insertRes.rows[0], 'Daily');
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Daily closing complete.', report: insertRes.rows[0] });
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

// POST /api/orders/:id/reprint - Trigger a reprint to the cloud printer via Pusher
router.post('/:id/reprint', authenticateToken, async (req, res) => {
  try {
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderRes.rows[0];

    const itemsRes = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    const items = itemsRes.rows;

    const settingsRes = await pool.query('SELECT auto_print_enabled, printer_ip FROM settings ORDER BY id ASC LIMIT 1');
    const autoPrintEnabled = settingsRes.rows.length > 0 && settingsRes.rows[0].auto_print_enabled === true;
    const printerIp = (settingsRes.rows.length > 0 && settingsRes.rows[0].printer_ip) ? settingsRes.rows[0].printer_ip : '127.0.0.1';

    const effectiveBranch = order.branch || 'Branch 1';
    let shortBranch = effectiveBranch;
    if (effectiveBranch === 'Branch 1') shortBranch = 'B1';
    else if (effectiveBranch === 'Branch 2') shortBranch = 'B2';
    else if (effectiveBranch === 'Branch 3') shortBranch = 'B3';

    if (pusher) {
      const payload = {
        orderId: order.id,
        slipNumber: order.slip_number,
        editCount: order.edit_count || 0,
        orderType: `${shortBranch} - ${order.order_type || "Takeaway"}`,
        tableNo: order.table_number || "",
        waiterName: order.order_taker || "Staff",
        branch: effectiveBranch,
        printerIp: printerIp,
        subtotal: order.subtotal,
        tax: order.tax,
        grandTotal: order.grand_total,
        discount: order.discount || 0,
        paymentMethod: order.payment_method || order.status,
        date: new Date().toISOString(),
        items: items.map(item => ({
          name: item.item_name || item.name,
          qty: item.qty || 1,
          price: item.unit_price || item.price
        }))
      };
      await pusher.trigger('restaurant-orders', 'new-order', payload);
      return res.json({ success: true, message: 'Reprint sent to cloud printer' });
    } else {
      return res.status(500).json({ error: 'Cloud printing is not configured on the server.' });
    }
  } catch (err) {
    console.error('Reprint error:', err);
    res.status(500).json({ error: 'Failed to reprint' });
  }
});

module.exports = router;
