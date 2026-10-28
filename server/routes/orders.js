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
    const check = await pool.query('SELECT branch FROM "orders" WHERE id = $1', [orderId]);
    if (check.rows.length > 0 && check.rows[0].branch !== req.user.branch) {
      return false;
    }
  }
  return true;
}

// Helper to deduct stock based on recipe (FIFO)
async function deductStock(orderId, client, behavior = 'block') {
  if (behavior === 'ignore') return;

  const orderItems = await client.query('SELECT id, item_id, qty FROM order_items WHERE order_id = $1', [orderId]);
  for (const item of orderItems.rows) {
    if (!item.item_id) continue;
    
    const recipe = await client.query('SELECT stock_id, quantity_used FROM recipes WHERE item_id = $1', [item.item_id]);
    for (const ingredient of recipe.rows) {
      let requiredQty = ingredient.quantity_used * item.qty;
      
      if (behavior === 'block') {
        const stockCheck = await client.query('SELECT quantity, name FROM stock WHERE id = $1', [ingredient.stock_id]);
        if (stockCheck.rows.length > 0) {
          const currentQty = parseFloat(stockCheck.rows[0].quantity) || 0;
          if (currentQty < requiredQty) {
             throw new Error(`Stock not available for ${stockCheck.rows[0].name}. (Required: ${requiredQty.toFixed(3)}, Available: ${currentQty.toFixed(3)})`);
          }
        }
      }
      
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
  if (req.user?.role?.trim().toLowerCase() === 'management') {
    return res.status(403).json({ error: 'Management role is view-only. Placing orders is not allowed.' });
  }
  const { items, subtotal, tax, grand_total, payment_method, customer_name, customer_phone, customer_address, discount, client_order_id, order_type, table_number, order_taker, comments, credit_customer_id, credit_payment_amount } = req.body;
  console.log(`[ORDER DEBUG] Order request received:`, { order_type, table_number, order_taker, itemCount: items?.length });
  const client = await pool.connect();
  try {
    // Idempotency check: If client_order_id exists, return existing order
    if (client_order_id) {
       const existing = await client.query('SELECT * FROM "orders" WHERE client_order_id = $1', [client_order_id]);
       if (existing.rows.length > 0) {
         console.log('--- Duplicate Order Detected ---', client_order_id);
         return res.status(200).json({ success: true, order: existing.rows[0], duplicated: true });
       }
    }

    await client.query('BEGIN');

    const status = (payment_method === 'Hold' || payment_method === 'Payment Pending' || payment_method === 'Payment Requested') ? payment_method : 'Completed';

    const role = req.user.role?.trim().toLowerCase();
    const isAdmin = role === 'admin' || role === 'developer';
    const finalBranch = (!isAdmin && req.user.branch) ? req.user.branch : (req.body.branch || 'Branch 1');

    // Calculate daily resetting slip number per branch (Saudi Arabia Asia/Riyadh date)
    const slipResult = await client.query(
      `SELECT COALESCE(MAX(slip_number), 0) + 1 as next_slip 
       FROM "orders" 
       WHERE (created_at AT TIME ZONE 'Asia/Riyadh')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date AND branch = $1`,
      [finalBranch]
    );
    const slipNumber = slipResult.rows[0].next_slip;
    let seqName = 'order_id_branch_1';
    if (finalBranch === 'Branch 2' || /2/.test(finalBranch)) seqName = 'order_id_branch_2';
    else if (finalBranch === 'Branch 3' || /3/.test(finalBranch)) seqName = 'order_id_branch_3';

    const seqResult = await client.query(`SELECT nextval('${seqName}') as next_id`);
    const newOrderId = seqResult.rows[0].next_id;

    const isCompleted = (status === 'Completed' || status === 'Cash' || status === 'Card' || status === 'Online');
    const completedBy = isCompleted ? (req.user.username || order_taker || null) : null;
    const completedAt = isCompleted ? new Date() : null;

    // Attach active cashier shift_id if exists
    let shiftId = req.body.shift_id || null;
    if (!shiftId && (role === 'cashier' || completedBy)) {
      const activeShiftRes = await client.query(
        `SELECT id FROM cashier_shifts WHERE cashier_name = $1 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
        [completedBy || req.user.username]
      );
      if (activeShiftRes.rows.length > 0) {
        shiftId = activeShiftRes.rows[0].id;
      }
    }

    // Enforce credit customer discount rules strictly
    let finalDiscount = parseFloat(discount) || 0;
    let finalGrandTotal = parseFloat(grand_total) || 0;

    if (payment_method === 'Credit') {
      if (!credit_customer_id) {
        finalDiscount = 0;
        finalGrandTotal = Math.max(0, (parseFloat(subtotal) || 0) + (parseFloat(tax) || 0));
      } else {
        const custRes = await client.query('SELECT discount_rules FROM credit_customers WHERE id = $1', [credit_customer_id]);
        if (custRes.rows.length === 0) {
          finalDiscount = 0;
          finalGrandTotal = Math.max(0, (parseFloat(subtotal) || 0) + (parseFloat(tax) || 0));
        } else {
          let rules = custRes.rows[0].discount_rules;
          if (typeof rules === 'string') {
            try { rules = JSON.parse(rules); } catch(e) { rules = []; }
          }
          if (!Array.isArray(rules) || rules.length === 0) {
            finalDiscount = 0;
            finalGrandTotal = Math.max(0, (parseFloat(subtotal) || 0) + (parseFloat(tax) || 0));
          }
        }
      }
    }

    // Insert order
    const orderResult = await client.query(
      `INSERT INTO "orders" (id, subtotal, tax, grand_total, status, customer_name, customer_phone, customer_address, discount, client_order_id, cancel_requested, cancel_reason, slip_number, is_edited, order_type, table_number, order_taker, comments, branch, completed_by, completed_at, credit_customer_id, shift_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, NULL, $11, FALSE, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING *`,
      [newOrderId, subtotal, tax, finalGrandTotal, status, customer_name || null, customer_phone || null, customer_address || null, finalDiscount, client_order_id || null, slipNumber, order_type || null, table_number || null, order_taker || null, comments || null, finalBranch, completedBy, completedAt, credit_customer_id || null, shiftId]
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
      [order.id, payment_method || 'Cash', finalGrandTotal]
    );

    // Handle Credit order logic
    if (payment_method === 'Credit' && credit_customer_id) {
      // Add the order to their ledger (increases debt)
      await client.query(
        `INSERT INTO credit_transactions (credit_customer_id, order_id, type, amount) VALUES ($1, $2, $3, $4)`,
        [credit_customer_id, order.id, 'CREDIT_ORDER', finalGrandTotal]
      );
      
      let balanceChange = parseFloat(finalGrandTotal);
      
      // If they made an inline payment right now
      if (credit_payment_amount && parseFloat(credit_payment_amount) > 0) {
        const paymentAmt = parseFloat(credit_payment_amount);
        await client.query(
          `INSERT INTO credit_transactions (credit_customer_id, order_id, type, amount) VALUES ($1, $2, $3, $4)`,
          [credit_customer_id, order.id, 'PAYMENT', paymentAmt]
        );
        balanceChange -= paymentAmt;
      }
      
      // Update overall customer balance
      await client.query(
        `UPDATE credit_customers SET balance = balance + $1 WHERE id = $2`,
        [balanceChange, credit_customer_id]
      );
    }

    // Deduct stock if order is Completed
    if (status === 'Completed') {
      const settingsRes = await client.query('SELECT low_stock_behavior FROM settings ORDER BY id ASC LIMIT 1');
      const behavior = settingsRes.rows.length > 0 ? (settingsRes.rows[0].low_stock_behavior || 'block') : 'block';
      await deductStock(order.id, client, behavior);
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

      const effectiveBranch = finalBranch || 'Branch 1';
      const branchNumber = String(req.body.branchId || effectiveBranch).replace(/\D/g, '') || '1';
      const channelName = `branch-${branchNumber}-orders`;
      
      const printerIp = req.body.printerIp || (settingsRes.rows.length > 0 && settingsRes.rows[0].printer_ip ? settingsRes.rows[0].printer_ip : '127.0.0.1');

      if (autoPrintEnabled || req.body.printerIp) {
        let shortBranch = effectiveBranch;
        if (effectiveBranch === 'Branch 1') shortBranch = 'B1';
        else if (effectiveBranch === 'Branch 2') shortBranch = 'B2';
        else if (effectiveBranch === 'Branch 3') shortBranch = 'B3';

        const payload = {
          orderId: order.id,
          orderNumber: slipNumber,
          branchId: parseInt(branchNumber),
          waiterName: (order.order_taker || "Staff").replace(/[^\x00-\x7F]/g, "").trim(),
          tableName: (order.table_number || "").replace(/[^\x00-\x7F]/g, "").trim(),
          orderType: order.order_type || "Takeaway",
          printerIp: printerIp,
          subtotal: subtotal,
          discount: order.discount || 0,
          total: grand_total,
          currency: "SAR",
          customerName: (order.customer_name || req.body.customer_name || "").replace(/[^\x00-\x7F]/g, "").trim(),
          customerPhone: order.customer_phone || req.body.customer_phone || "",
          paymentStatus: order.status || "Completed",
          createdAt: new Date().toISOString(),
          items: items.map(item => ({
            name: (item.name || "").replace(/[^\x00-\x7F]/g, "").trim(),
            qty: item.qty || 1,
            amount: item.price
          }))
        };
        
        if (pusher) {
          try {
            console.log(`[PUSHER DEBUG] Attempting trigger on channel: ${channelName}, event: print-kitchen-ticket`);
            const response = await pusher.trigger(channelName, 'print-kitchen-ticket', payload);
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
    if (err.message && err.message.includes('Stock not available')) {
        return res.status(400).json({ error: err.message });
    }
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
      FROM "orders" o WHERE 1=1
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
    let { from, to, cashier_id, branch: queryBranch } = req.query;
    
    // Determine the branch to filter by
    const role = req.user?.role?.trim().toLowerCase();
    const isAdminRole = role === 'admin' || role === 'developer' || role === 'management';
    
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
    
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}::date`);
    }

    if (to) {
      params.push(to);
      conditions.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
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
    const pastClosings = result.rows;

    let liveQuery = `SELECT DISTINCT completed_by as cashier_name FROM "orders" WHERE is_shift_closed = FALSE AND DATE(created_at) = CURRENT_DATE AND status = 'Completed'`;
    let liveParams = [];
    if (branchFilter) {
      liveParams.push(branchFilter);
      liveQuery += ` AND branch = $1`;
    }
    const liveRes = await pool.query(liveQuery, liveParams);
    const liveClosings = liveRes.rows.filter(r => r.cashier_name).map(r => ({
      id: 'live_' + r.cashier_name,
      closing_type: 'Live',
      cashier_name: r.cashier_name,
      created_at: new Date().toISOString()
    }));

    res.json([...liveClosings, ...pastClosings]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET closing preview stats and shifts breakdown for modal
router.get('/closing-preview', authenticateToken, isAdminOrCashier, async (req, res) => {
  try {
    let branch = req.query?.branch || req.user?.branch || 'Branch 1';
    if (branch === 'All') branch = 'Branch 1';
    const closingType = req.query?.type === 'Daily' ? 'Daily' : 'Shift';

    if (closingType === 'Shift') {
      const username = req.user.username;
      const role = req.user.role?.trim().toLowerCase();
      const isAdminRole = role === 'admin' || role === 'developer';

      let userCondition = 'AND (o.completed_by = $2 OR (o.completed_by IS NULL AND o.order_taker = $2))';
      let queryParams = [branch, username];
      if (isAdminRole) {
        userCondition = '';
        queryParams = [branch];
      }

      const totals = await pool.query(`
        SELECT 
          COUNT(DISTINCT o.id) as total_orders, 
          COALESCE(SUM(t.amount), 0) as total_sales,
          COALESCE(SUM(CASE WHEN t.payment_method = 'Cash' THEN t.amount ELSE 0 END), 0) as cash_sales,
          COALESCE(SUM(CASE WHEN t.payment_method = 'Card' THEN t.amount ELSE 0 END), 0) as card_sales,
          COALESCE(SUM(CASE WHEN t.payment_method = 'Credit' THEN t.amount ELSE 0 END), 0) as credit_sales
        FROM "orders" o
        LEFT JOIN transactions t ON o.id = t.order_id
        WHERE o.is_shift_closed = FALSE 
          AND o.status IN ('Completed', 'Returned') 
          AND o.branch = $1
          ${userCondition}
      `, queryParams);

      const activeShiftRes = await pool.query(
        isAdminRole
          ? `SELECT * FROM cashier_shifts WHERE branch = $1 AND status = 'Open' ORDER BY id DESC LIMIT 1`
          : `SELECT * FROM cashier_shifts WHERE cashier_name = $1 AND branch = $2 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
        isAdminRole ? [branch] : [username, branch]
      );
      const activeShift = activeShiftRes.rows[0] || null;
      let shiftStartTime = activeShift?.start_time ? new Date(activeShift.start_time) : null;
      if (!shiftStartTime) {
        const firstOrderRes = await pool.query(
          isAdminRole
            ? `SELECT MIN(created_at) as first_time FROM "orders" WHERE is_shift_closed = FALSE AND branch = $1`
            : `SELECT MIN(created_at) as first_time FROM "orders" WHERE is_shift_closed = FALSE AND branch = $1 AND (completed_by = $2 OR (completed_by IS NULL AND order_taker = $2))`,
          isAdminRole ? [branch] : [branch, username]
        );
        if (firstOrderRes.rows.length > 0 && firstOrderRes.rows[0].first_time) {
          shiftStartTime = new Date(firstOrderRes.rows[0].first_time);
        } else {
          shiftStartTime = new Date();
          shiftStartTime.setHours(0, 0, 0, 0);
        }
      }

      const majorPaymentsRes = await pool.query(`
        SELECT 
          COALESCE(SUM(amount), 0) as total,
          COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END), 0) as cash_major,
          COALESCE(SUM(CASE WHEN payment_method = 'Card' THEN amount ELSE 0 END), 0) as card_major
        FROM credit_transactions
        WHERE type = 'PAYMENT' 
          AND is_shift_closed = FALSE 
          AND (branch = $1 OR branch IS NULL)
          AND created_at >= $2
          ${isAdminRole ? '' : 'AND (cashier_name = $3 OR cashier_name IS NULL)'}
      `, isAdminRole ? [branch, shiftStartTime] : [branch, shiftStartTime, username]);
      const majorPayments = parseFloat(majorPaymentsRes.rows[0]?.total || 0);
      const majorPaymentsCash = parseFloat(majorPaymentsRes.rows[0]?.cash_major || 0);
      const majorPaymentsCard = parseFloat(majorPaymentsRes.rows[0]?.card_major || 0);

      return res.json({
        success: true,
        closing_type: 'Shift',
        total_orders: parseInt(totals.rows[0]?.total_orders || 0, 10),
        total_sales: parseFloat(totals.rows[0]?.total_sales || 0),
        cash_sales: parseFloat(totals.rows[0]?.cash_sales || 0),
        card_sales: parseFloat(totals.rows[0]?.card_sales || 0),
        credit_sales: parseFloat(totals.rows[0]?.credit_sales || 0),
        major_payments: majorPayments,
        major_payments_cash: majorPaymentsCash,
        major_payments_card: majorPaymentsCard,
        start_time: activeShift?.start_time || null,
        opening_cash: parseFloat(activeShift?.opening_cash || 0)
      });
    } else {
      // Daily Closing preview
      const lastClosingRes = await pool.query(
        `SELECT logout_time FROM shift_closings WHERE branch = $1 AND closing_type = 'Daily' ORDER BY logout_time DESC LIMIT 1`,
        [branch]
      );
      let loginTime = new Date();
      loginTime.setHours(0, 0, 0, 0);
      if (lastClosingRes.rows.length > 0 && lastClosingRes.rows[0].logout_time) {
        loginTime = new Date(lastClosingRes.rows[0].logout_time);
      }

      const totals = await pool.query(`
        SELECT 
          COUNT(DISTINCT o.id) as total_orders, 
          COALESCE(SUM(t.amount), 0) as total_sales,
          COALESCE(SUM(CASE WHEN t.payment_method = 'Cash' THEN t.amount ELSE 0 END), 0) as cash_sales,
          COALESCE(SUM(CASE WHEN t.payment_method = 'Card' THEN t.amount ELSE 0 END), 0) as card_sales,
          COALESCE(SUM(CASE WHEN t.payment_method = 'Credit' THEN t.amount ELSE 0 END), 0) as credit_sales
        FROM "orders" o
        LEFT JOIN transactions t ON o.id = t.order_id
        WHERE o.is_daily_closed = FALSE 
          AND o.status IN ('Completed', 'Returned') 
          AND o.branch = $1
      `, [branch]);

      // Closed shifts in this daily cycle
      const shiftsRes = await pool.query(`
        SELECT cashier_name, total_sales, cash_sales, card_sales, credit_sales, major_payments, total_orders, login_time, logout_time, closing_cash, closing_card, difference, difference_reason, cash_difference, card_difference
        FROM shift_closings
        WHERE branch = $1 AND closing_type = 'Shift' AND logout_time >= $2
        ORDER BY logout_time ASC
      `, [branch, loginTime]);

      const shifts = shiftsRes.rows.map(s => ({
        cashier_name: s.cashier_name,
        total_sales: parseFloat(s.total_sales || 0),
        cash_sales: parseFloat(s.cash_sales || 0),
        card_sales: parseFloat(s.card_sales || 0),
        credit_sales: parseFloat(s.credit_sales || 0),
        major_payments: parseFloat(s.major_payments || 0),
        total_orders: parseInt(s.total_orders || 0, 10),
        login_time: s.login_time,
        logout_time: s.logout_time,
        closing_cash: s.closing_cash !== null && s.closing_cash !== undefined ? parseFloat(s.closing_cash) : null,
        closing_card: s.closing_card !== null && s.closing_card !== undefined ? parseFloat(s.closing_card) : null,
        cash_difference: s.cash_difference !== null && s.cash_difference !== undefined ? parseFloat(s.cash_difference) : null,
        card_difference: s.card_difference !== null && s.card_difference !== undefined ? parseFloat(s.card_difference) : null,
        difference: s.difference !== null && s.difference !== undefined ? parseFloat(s.difference) : null,
        difference_reason: s.difference_reason || ''
      }));

      // Active shift major payments map
      const activeMajorPaymentsRes = await pool.query(`
        SELECT 
          cashier_name,
          COALESCE(SUM(amount), 0) as total
        FROM credit_transactions
        WHERE type = 'PAYMENT' 
          AND is_shift_closed = FALSE 
          AND (branch = $1 OR branch IS NULL)
          AND created_at >= $2
        GROUP BY cashier_name
      `, [branch, loginTime]);
      const activeMajorMap = {};
      activeMajorPaymentsRes.rows.forEach(r => {
        activeMajorMap[r.cashier_name] = parseFloat(r.total || 0);
      });

      // Also check if any orders are unclosed by shift (e.g. active shift right now)
      const unclosedShiftOrdersRes = await pool.query(`
        SELECT 
          o.completed_by as cashier_name, 
          COUNT(DISTINCT o.id) as total_orders, 
          COALESCE(SUM(t.amount), 0) as total_sales,
          COALESCE(SUM(CASE WHEN t.payment_method = 'Cash' THEN t.amount ELSE 0 END), 0) as cash_sales,
          COALESCE(SUM(CASE WHEN t.payment_method = 'Card' THEN t.amount ELSE 0 END), 0) as card_sales,
          COALESCE(SUM(CASE WHEN t.payment_method = 'Credit' THEN t.amount ELSE 0 END), 0) as credit_sales
        FROM "orders" o
        LEFT JOIN transactions t ON o.id = t.order_id
        WHERE o.is_daily_closed = FALSE 
          AND o.is_shift_closed = FALSE
          AND o.status IN ('Completed', 'Returned')
          AND o.branch = $1
        GROUP BY o.completed_by
      `, [branch]);

      unclosedShiftOrdersRes.rows.forEach(u => {
        shifts.push({
          cashier_name: `${u.cashier_name} (Current)`,
          total_sales: parseFloat(u.total_sales || 0),
          cash_sales: parseFloat(u.cash_sales || 0),
          card_sales: parseFloat(u.card_sales || 0),
          credit_sales: parseFloat(u.credit_sales || 0),
          major_payments: activeMajorMap[u.cashier_name] || 0,
          total_orders: parseInt(u.total_orders || 0, 10),
          closing_cash: null,
          closing_card: null,
          cash_difference: null,
          card_difference: null,
          difference: null,
          is_active: true
        });
      });

      const dailyMajorPaymentsRes = await pool.query(`
        SELECT 
          COALESCE(SUM(amount), 0) as total,
          COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END), 0) as cash_major,
          COALESCE(SUM(CASE WHEN payment_method = 'Card' THEN amount ELSE 0 END), 0) as card_major
        FROM credit_transactions
        WHERE type = 'PAYMENT' 
          AND is_daily_closed = FALSE 
          AND (branch = $1 OR branch IS NULL)
          AND created_at >= $2
      `, [branch, loginTime]);
      const dailyMajorPayments = parseFloat(dailyMajorPaymentsRes.rows[0]?.total || 0);
      const dailyMajorPaymentsCash = parseFloat(dailyMajorPaymentsRes.rows[0]?.cash_major || 0);
      const dailyMajorPaymentsCard = parseFloat(dailyMajorPaymentsRes.rows[0]?.card_major || 0);

      return res.json({
        success: true,
        closing_type: 'Daily',
        login_time: loginTime,
        total_orders: parseInt(totals.rows[0]?.total_orders || 0, 10),
        total_sales: parseFloat(totals.rows[0]?.total_sales || 0),
        cash_sales: parseFloat(totals.rows[0]?.cash_sales || 0),
        card_sales: parseFloat(totals.rows[0]?.card_sales || 0),
        credit_sales: parseFloat(totals.rows[0]?.credit_sales || 0),
        major_payments: dailyMajorPayments,
        major_payments_cash: dailyMajorPaymentsCash,
        major_payments_card: dailyMajorPaymentsCard,
        shifts
      });
    }
  } catch (err) {
    console.error('Error in closing-preview:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET order by ID with items
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    if (!(await checkBranchAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Access denied: Order belongs to another branch' });
    }
    const orderResult = await pool.query(`
      SELECT o.*, t.payment_method 
      FROM "orders" o
      LEFT JOIN transactions t ON o.id = t.order_id
      WHERE o.id = $1
    `, [req.params.id]);
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
    const isCompleted = (status === 'Completed' || status === 'Cash' || status === 'Card' || status === 'Online' || status === 'Credit');
    let completedBy = null;
    let completedAt = null;
    let shiftId = null;

    if (isCompleted) {
      completedBy = req.user?.username || 'Cashier';
      completedAt = new Date();
      const activeShiftRes = await pool.query(
        `SELECT id FROM cashier_shifts WHERE cashier_name = $1 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
        [completedBy]
      );
      if (activeShiftRes.rows.length > 0) {
        shiftId = activeShiftRes.rows[0].id;
      }
    }

    const result = await pool.query(
      `UPDATE "orders" 
       SET status = $1,
           completed_by = CASE WHEN $3::text IS NOT NULL THEN COALESCE(completed_by, $3) ELSE completed_by END,
           completed_at = CASE WHEN $4::timestamptz IS NOT NULL THEN COALESCE(completed_at, $4) ELSE completed_at END,
           shift_id = CASE WHEN $5::int IS NOT NULL THEN COALESCE(shift_id, $5) ELSE shift_id END
       WHERE id = $2 RETURNING *`,
      [status, req.params.id, completedBy, completedAt, shiftId]
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
  if (req.user?.role?.trim().toLowerCase() === 'management') {
    return res.status(403).json({ error: 'Management role is view-only. Paying held orders is not allowed.' });
  }
  const { payment_method, credit_customer_id, credit_payment_amount, trigger_cloud_print } = req.body;
  if (!['Cash', 'Card', 'Online', 'Credit'].includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }
  const client = await pool.connect();
  try {
    if (!(await checkBranchAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Access denied: Order belongs to another branch' });
    }
    await client.query('BEGIN');
    
    // Attach active shift_id if cashier is paying
    let shiftId = null;
    const activeShiftRes = await client.query(
      `SELECT id FROM cashier_shifts WHERE cashier_name = $1 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
      [req.user.username]
    );
    if (activeShiftRes.rows.length > 0) {
      shiftId = activeShiftRes.rows[0].id;
    }

    // Update order status to Completed
    const orderResult = await client.query(
      `UPDATE "orders" SET status = 'Completed', completed_by = $2, completed_at = NOW(), shift_id = COALESCE(shift_id, $3) WHERE id = $1 RETURNING *`,
      [req.params.id, req.user.username, shiftId]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Update transaction to Cash/Card/Credit
    await client.query(
      `UPDATE transactions SET payment_method = $1 WHERE order_id = $2`,
      [payment_method, req.params.id]
    );

    // Handle Credit order logic
    if (payment_method === 'Credit' && credit_customer_id) {
      const order = orderResult.rows[0];
      
      // Enforce discount rules for credit customer
      const custRes = await client.query('SELECT discount_rules FROM credit_customers WHERE id = $1', [credit_customer_id]);
      let rules = [];
      if (custRes.rows.length > 0) {
        let r = custRes.rows[0].discount_rules;
        if (typeof r === 'string') {
          try { r = JSON.parse(r); } catch(e) { r = []; }
        }
        rules = Array.isArray(r) ? r : [];
      }
      if (rules.length === 0 && parseFloat(order.discount || 0) > 0) {
        const correctedGrandTotal = Math.max(0, (parseFloat(order.subtotal) || 0) + (parseFloat(order.tax) || 0));
        await client.query(
          'UPDATE "orders" SET discount = 0, grand_total = $1 WHERE id = $2',
          [correctedGrandTotal, req.params.id]
        );
        await client.query(
          'UPDATE transactions SET amount = $1 WHERE order_id = $2',
          [correctedGrandTotal, req.params.id]
        );
        order.discount = 0;
        order.grand_total = correctedGrandTotal;
      }
      
      // Also update the order table with the credit_customer_id
      await client.query(
        `UPDATE "orders" SET credit_customer_id = $1 WHERE id = $2`,
        [credit_customer_id, req.params.id]
      );
      
      // Add the order to their ledger (increases debt)
      await client.query(
        `INSERT INTO credit_transactions (credit_customer_id, order_id, type, amount) VALUES ($1, $2, $3, $4)`,
        [credit_customer_id, order.id, 'CREDIT_ORDER', order.grand_total]
      );
      
      let balanceChange = parseFloat(order.grand_total);
      
      // If they made an inline payment right now
      if (credit_payment_amount && parseFloat(credit_payment_amount) > 0) {
        const paymentAmt = parseFloat(credit_payment_amount);
        await client.query(
          `INSERT INTO credit_transactions (credit_customer_id, order_id, type, amount) VALUES ($1, $2, $3, $4)`,
          [credit_customer_id, order.id, 'PAYMENT', paymentAmt]
        );
        balanceChange -= paymentAmt;
      }
      
      // Update overall customer balance
      await client.query(
        `UPDATE credit_customers SET balance = balance + $1 WHERE id = $2`,
        [balanceChange, credit_customer_id]
      );
    }
    
    // Deduct stock now that it's paid/completed
    const settingsRes = await client.query('SELECT low_stock_behavior FROM settings ORDER BY id ASC LIMIT 1');
    const behavior = settingsRes.rows.length > 0 ? (settingsRes.rows[0].low_stock_behavior || 'block') : 'block';
    await deductStock(req.params.id, client, behavior);

    await client.query('COMMIT');
    const updatedOrder = orderResult.rows[0];
    if (req.io) req.io.emit('orderUpdated', updatedOrder);
    
    // Trigger Cloud Print if requested
    if (trigger_cloud_print) {
      try {
        const settingsRes = await pool.query('SELECT auto_print_enabled, printer_ip FROM settings ORDER BY id ASC LIMIT 1');
        const autoPrintEnabled = settingsRes.rows.length > 0 && settingsRes.rows[0].auto_print_enabled === true;
        const printerIp = req.body.printerIp || (settingsRes.rows.length > 0 && settingsRes.rows[0].printer_ip ? settingsRes.rows[0].printer_ip : '127.0.0.1');

        if (autoPrintEnabled || req.body.printerIp) {
          const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [updatedOrder.id]);
          const items = itemsResult.rows;
          
          const effectiveBranch = updatedOrder.branch || 'Branch 1';
          const branchNumber = String(req.body.branchId || effectiveBranch).replace(/\D/g, '') || '1';
          const channelName = `branch-${branchNumber}-orders`;

          const payload = {
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.slip_number,
            branchId: parseInt(branchNumber),
            waiterName: (updatedOrder.order_taker || "Staff").replace(/[^\x00-\x7F]/g, "").trim(),
            tableName: (updatedOrder.table_number || "").replace(/[^\x00-\x7F]/g, "").trim(),
            orderType: updatedOrder.order_type || "Takeaway",
            printerIp: printerIp,
            subtotal: updatedOrder.subtotal,
            discount: updatedOrder.discount || 0,
            total: updatedOrder.grand_total,
            currency: "SAR",
            customerName: (updatedOrder.customer_name || req.body.customer_name || "").replace(/[^\x00-\x7F]/g, "").trim(),
            customerPhone: updatedOrder.customer_phone || req.body.customer_phone || "",
            paymentStatus: updatedOrder.status || "Completed",
            createdAt: new Date().toISOString(),
            items: items.map(item => ({
              name: (item.name || item.item_name || "").replace(/[^\x00-\x7F]/g, "").trim(),
              qty: item.qty || 1,
              amount: item.price || item.unit_price
            }))
          };
          
          if (pusher) {
            await pusher.trigger(channelName, 'print-kitchen-ticket', payload);
          }
        }
      } catch (printErr) {
        console.error('[ORDER ERROR] Quick Complete Cloud Print error:', printErr);
      }
    }

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message && err.message.includes('Stock not available')) {
        return res.status(400).json({ error: err.message });
    }
    if (err.constraint && (err.constraint === 'stock_quantity_non_negative' || err.constraint === 'stock_history_remaining_non_negative')) {
        return res.status(400).json({ error: 'Stock not available / negative stock reached.' });
    }
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
      `UPDATE "orders" SET status = $1, cancel_requested = FALSE, cancel_reason = $3, completed_by = $4 WHERE id = $2 RETURNING *`,
      [updateTo, req.params.id, finalReason, req.user.username]
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
    await reverseCreditTransactions(req.params.id, client);

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
    const orderCheck = await pool.query('SELECT status FROM "orders" WHERE id = $1', [req.params.id]);
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const result = await pool.query(
      'UPDATE "orders" SET cancel_requested = TRUE, cancel_reason = $1 WHERE id = $2 RETURNING *',
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
         `UPDATE "orders" SET status = 'Cancelled', cancel_requested = FALSE, completed_by = $2 WHERE id = $1 RETURNING *`,
         [req.params.id, req.user.username]
       );
       if (orderResult.rows.length === 0) {
         await client.query('ROLLBACK');
         return res.status(404).json({ error: 'Order not found' });
       }
       await client.query(
         `UPDATE transactions SET payment_method = 'Cancelled' WHERE order_id = $1`,
         [req.params.id]
       );
       await reverseCreditTransactions(req.params.id, client);
       await client.query('COMMIT');
       const updatedOrder = orderResult.rows[0];
       if (req.io) req.io.emit('orderUpdated', updatedOrder);
       return res.json({ success: true, message: 'Cancellation request approved', order: updatedOrder });
    } else {
       // Reject: Just clear the request
       const result = await pool.query(
         'UPDATE "orders" SET cancel_requested = FALSE, cancel_reason = NULL WHERE id = $1 RETURNING *',
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
    
    if (!apiKey || !fromEmail) {
      console.log(`[Email System] Skipping: Missing Resend API key or From email in .env`);
      return;
    }

    // Load recipient emails from database settings
    let toEmails = [];
    try {
      const settingsRes = await pool.query('SELECT report_emails FROM settings ORDER BY id ASC LIMIT 1');
      if (settingsRes.rows.length > 0 && settingsRes.rows[0].report_emails) {
        const dbEmails = settingsRes.rows[0].report_emails;
        if (Array.isArray(dbEmails)) {
          toEmails = dbEmails.map(e => (typeof e === 'string' ? e.trim() : '')).filter(Boolean);
        } else if (typeof dbEmails === 'string') {
          try {
            const parsed = JSON.parse(dbEmails);
            if (Array.isArray(parsed)) {
              toEmails = parsed.map(e => (typeof e === 'string' ? e.trim() : '')).filter(Boolean);
            }
          } catch (pe) {
            toEmails = dbEmails.split(',').map(e => e.trim()).filter(Boolean);
          }
        }
      }
    } catch (dbErr) {
      console.warn('[Email System] Could not load report_emails from settings table:', dbErr.message);
    }

    // Fallback to process.env.REPORT_TO_EMAILS if DB has no emails configured
    if (!toEmails || toEmails.length === 0) {
      const toEmailsStr = process.env.REPORT_TO_EMAILS;
      if (toEmailsStr) {
        toEmails = toEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
      }
    }

    if (!toEmails || toEmails.length === 0) {
      console.log(`[Email System] Skipping: No recipient emails configured in Settings or .env`);
      return;
    }

    console.log(`[Email System] Preparing to send ${closingType} report from ${fromEmail} to:`, toEmails);
    const resend = new Resend(apiKey);
    
    let itemsHtml = '';
    let topSellingHtml = '';
    let twoHourlyHtml = '';
    
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
          <div style="padding: 0 10px; overflow-x: auto;">
            <table style="width: 100%; min-width: 250px; border-collapse: collapse; margin: 10px 0; font-size: 13px; color: #555; table-layout: fixed; word-wrap: break-word;">
              <thead>
                <tr style="border-bottom: 1px solid #eee; text-align: left;">
                  <th style="padding: 8px 4px; width: 40%;">Item</th>
                  <th style="padding: 8px 4px; text-align: center; width: 15%;">Qty</th>
                  <th style="padding: 8px 4px; text-align: right; width: 22%;">Price</th>
                  <th style="padding: 8px 4px; text-align: right; width: 23%;">Total</th>
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
            <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow-x: auto;">
              <table style="width: 100%; min-width: 250px; border-collapse: collapse; font-size: 13px; color: #555; table-layout: fixed; word-wrap: break-word;">
                <thead>
                  <tr style="background: #fff3f4; border-bottom: 1px solid #ffccd0; text-align: left; color: #E31837;">
                    <th style="padding: 10px 8px; width: 15%;">#</th>
                    <th style="padding: 10px 8px; width: 45%;">Item</th>
                    <th style="padding: 10px 8px; text-align: center; width: 15%;">Qty</th>
                    <th style="padding: 10px 8px; text-align: right; width: 25%;">Rev</th>
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
      
      let intervalItemsObj = report.interval_items || {};
      if (typeof intervalItemsObj === 'string') {
        try { intervalItemsObj = JSON.parse(intervalItemsObj); } catch(e) { intervalItemsObj = {}; }
      }

      twoHourlyHtml = '';
      if (intervalItemsObj && Object.keys(intervalItemsObj).length > 0) {
        twoHourlyHtml = `
          <h3 style="margin-top: 30px; border-bottom: 2px solid #eaeaea; padding-bottom: 8px; color: #333;">Top Items by 2-Hour Intervals</h3>
          <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow-x: auto;">
            <table style="width: 100%; min-width: 250px; border-collapse: collapse; font-size: 13px; color: #555; table-layout: fixed; word-wrap: break-word;">
              <thead>
                <tr style="background: #f8f9fa; border-bottom: 1px solid #eee; text-align: left; color: #111;">
                  <th style="padding: 10px 8px; width: 35%;">Time</th>
                  <th style="padding: 10px 8px; width: 65%;">Top Items (Qty)</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        const loginDate = new Date(report.login_time);
        let maxIndex = 0;
        for (const key of Object.keys(intervalItemsObj)) {
          if (parseInt(key) > maxIndex) maxIndex = parseInt(key);
        }
        
        for (let i = 0; i <= maxIndex; i++) {
          const blockStartTime = new Date(loginDate.getTime() + i * 2 * 3600000);
          const blockEndTime = new Date(loginDate.getTime() + (i + 1) * 2 * 3600000);
          
          const startTimeStr = blockStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const endTimeStr = blockEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const itemsInBlock = intervalItemsObj[i] || [];
          
          let itemsList = '-';
          if (itemsInBlock.length > 0) {
            itemsList = itemsInBlock.map(item => `<div style="margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px dashed #f0f0f0;">${item.name} <strong>(${item.qty})</strong></div>`).join('');
          }
          
          twoHourlyHtml += `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 15px; font-weight: bold; border-right: 1px solid #eee;">${startTimeStr} - ${endTimeStr}</td>
              <td style="padding: 8px 15px;">${itemsList}</td>
            </tr>
          `;
        }
        
        twoHourlyHtml += `</tbody></table></div>`;
      }
      
      
    } catch(e) {
      console.error('Error parsing items summary for email:', e);
    }

    const diffVal = parseFloat(report.difference || 0);
    const hasDiff = !isNaN(diffVal) && Math.abs(diffVal) >= 0.01;
    let differenceHtml = '';
    if (hasDiff) {
      const diffSign = diffVal < 0 ? '-' : '+';
      const diffLabel = diffVal < 0 ? 'SHORTAGE / کم' : 'EXCESS / زیادہ';
      differenceHtml = `
        <div style="background-color: #ffffff; border: 2px solid #dc2626; color: #111827; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px; color: #dc2626;">
            DIFFERENCE: ${diffSign}SAR ${Math.abs(diffVal).toFixed(2)} (${diffLabel})
          </div>
          ${report.difference_reason ? `
            <div style="margin-top: 10px; font-size: 14px; border-top: 1px dashed #d1d5db; padding-top: 8px; color: #374151; text-align: left; line-height: 1.4;">
              <strong style="color: #111827;">Reason:</strong> ${report.difference_reason}
            </div>
          ` : ''}
        </div>
      `;
    }

    let shiftsHtml = '';
    if (closingType === 'Daily') {
      let shiftsArr = [];
      if (typeof report.shifts_summary === 'string') {
        try { shiftsArr = JSON.parse(report.shifts_summary); } catch (e) { shiftsArr = []; }
      } else if (Array.isArray(report.shifts_summary)) {
        shiftsArr = report.shifts_summary;
      }

      const night = shiftsArr[0] || null;
      const day = shiftsArr[1] || null;

      const nightCashier = night?.cashier_name || '';
      const dayCashier = day?.cashier_name || '';

      const nightSysCash = parseFloat(night?.cash_sales || 0);
      const nightActCash = night?.closing_cash !== null && night?.closing_cash !== undefined 
        ? parseFloat(night.closing_cash) 
        : (night ? nightSysCash : 0);

      const nightSysCard = parseFloat(night?.card_sales || 0);
      const nightActCard = night?.closing_card !== null && night?.closing_card !== undefined 
        ? parseFloat(night.closing_card) 
        : (night ? nightSysCard : 0);

      const nightSysCredit = parseFloat(night?.credit_sales || 0);
      const nightActCredit = nightSysCredit;

      const nightSysMajor = parseFloat(night?.major_payments || 0);
      const nightActMajor = nightSysMajor;

      const nightCashDiff = nightActCash - nightSysCash;
      const nightCardDiff = nightActCard - nightSysCard;
      const nightDiff = night ? (night.difference !== null && night.difference !== undefined ? parseFloat(night.difference) : (nightCashDiff + nightCardDiff)) : 0;

      // Day
      const daySysCash = parseFloat(day?.cash_sales || 0);
      const dayActCash = day?.closing_cash !== null && day?.closing_cash !== undefined 
        ? parseFloat(day.closing_cash) 
        : (day ? daySysCash : 0);

      const daySysCard = parseFloat(day?.card_sales || 0);
      const dayActCard = day?.closing_card !== null && day?.closing_card !== undefined 
        ? parseFloat(day.closing_card) 
        : (day ? daySysCard : 0);

      const daySysCredit = parseFloat(day?.credit_sales || 0);
      const dayActCredit = daySysCredit;

      const daySysMajor = parseFloat(day?.major_payments || 0);
      const dayActMajor = daySysMajor;

      const dayCashDiff = dayActCash - daySysCash;
      const dayCardDiff = dayActCard - daySysCard;
      const dayDiff = day ? (day.difference !== null && day.difference !== undefined ? parseFloat(day.difference) : (dayCashDiff + dayCardDiff)) : 0;

      // Totals
      const totalSysCash = nightSysCash + daySysCash;
      const totalActCash = nightActCash + dayActCash;

      const totalSysCard = nightSysCard + daySysCard;
      const totalActCard = nightActCard + dayActCard;

      const totalSysCredit = nightSysCredit + daySysCredit;
      const totalActCredit = nightActCredit + dayActCredit;

      const totalSysMajor = nightSysMajor + daySysMajor;
      const totalActMajor = nightActMajor + dayActMajor;

      const totalCashDiff = totalActCash - totalSysCash;
      const totalCardDiff = totalActCard - totalSysCard;
      const totalDiffVal = totalCashDiff + totalCardDiff;

      const fmtDiff = (d) => {
        if (d === null || d === undefined || isNaN(d) || Math.abs(d) < 0.005) return '0.00';
        return d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2);
      };

      shiftsHtml = `
        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 10px 0; font-size: 15px; font-weight: 800; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 6px;">
            Daily summary: day + night
          </h3>
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; overflow-x: auto;">
            <table style="width: 100%; min-width: 520px; border-collapse: collapse; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1;">
                  <th style="padding: 10px 12px; text-align: left; font-weight: 700; color: #475569;"></th>
                  <th style="padding: 10px 10px; text-align: right; font-weight: 800; color: #0f172a;">
                    Night<br><span style="font-weight: 600; font-size: 11px; color: #64748b;">System</span>
                    ${nightCashier ? `<div style="font-size: 10px; font-weight: normal; color: #94a3b8;">${nightCashier}</div>` : ''}
                  </th>
                  <th style="padding: 10px 10px; text-align: right; font-weight: 800; color: #0f172a;">
                    Night<br><span style="font-weight: 600; font-size: 11px; color: #64748b;">Actual</span>
                    ${nightCashier ? `<div style="font-size: 10px; font-weight: normal; color: #94a3b8;">${nightCashier}</div>` : ''}
                  </th>
                  <th style="padding: 10px 10px; text-align: right; font-weight: 800; color: #0f172a;">
                    Day<br><span style="font-weight: 600; font-size: 11px; color: #64748b;">System</span>
                    ${dayCashier ? `<div style="font-size: 10px; font-weight: normal; color: #94a3b8;">${dayCashier}</div>` : ''}
                  </th>
                  <th style="padding: 10px 10px; text-align: right; font-weight: 800; color: #0f172a;">
                    Day<br><span style="font-weight: 600; font-size: 11px; color: #64748b;">Actual</span>
                    ${dayCashier ? `<div style="font-size: 10px; font-weight: normal; color: #94a3b8;">${dayCashier}</div>` : ''}
                  </th>
                  <th style="padding: 10px 12px; text-align: right; font-weight: 900; color: #0f172a; font-size: 13.5px;">
                    Total<br><span style="font-weight: 700; font-size: 11px; color: #64748b;">System</span>
                  </th>
                  <th style="padding: 10px 12px; text-align: right; font-weight: 900; color: #0f172a; font-size: 13.5px;">
                    Total<br><span style="font-weight: 700; font-size: 11px; color: #64748b;">Actual</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px 12px; font-weight: 600; color: #1e293b;">Cash sale</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightSysCash.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155; font-weight: 600;">${nightActCash.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${daySysCash.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155; font-weight: 600;">${dayActCash.toFixed(2)}</td>
                  <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #0f172a;">${totalSysCash.toFixed(2)}</td>
                  <td style="padding: 8px 12px; text-align: right; font-weight: 900; color: #0f172a;">${totalActCash.toFixed(2)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px 12px; font-weight: 600; color: #1e293b;">Card / Bank sale</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightSysCard.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155; font-weight: 600;">${nightActCard.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${daySysCard.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155; font-weight: 600;">${dayActCard.toFixed(2)}</td>
                  <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #0f172a;">${totalSysCard.toFixed(2)}</td>
                  <td style="padding: 8px 12px; text-align: right; font-weight: 900; color: #0f172a;">${totalActCard.toFixed(2)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px 12px; font-weight: 600; color: #1e293b;">Credit sale</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightSysCredit.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightActCredit.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${daySysCredit.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${dayActCredit.toFixed(2)}</td>
                  <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #0f172a;">${totalSysCredit.toFixed(2)}</td>
                  <td style="padding: 8px 12px; text-align: right; font-weight: 900; color: #0f172a;">${totalActCredit.toFixed(2)}</td>
                </tr>
                <tr style="border-bottom: 1.5px solid #cbd5e1;">
                  <td style="padding: 8px 12px; font-weight: 600; color: #1e293b;">Major Payments</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightSysMajor.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightActMajor.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${daySysMajor.toFixed(2)}</td>
                  <td style="padding: 8px 10px; text-align: right; color: #334155;">${dayActMajor.toFixed(2)}</td>
                  <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #0f172a;">${totalSysMajor.toFixed(2)}</td>
                  <td style="padding: 8px 12px; text-align: right; font-weight: 900; color: #0f172a;">${totalActMajor.toFixed(2)}</td>
                </tr>
                <tr style="background: #f8fafc; font-weight: 800;">
                  <td style="padding: 10px 12px; color: #0f172a;">Difference</td>
                  <td style="padding: 10px 10px; text-align: right;"></td>
                  <td style="padding: 10px 10px; text-align: right; color: ${nightDiff < 0 ? '#b91c1c' : (nightDiff > 0 ? '#15803d' : '#0f172a')};">
                    ${fmtDiff(nightDiff)}
                  </td>
                  <td style="padding: 10px 10px; text-align: right;"></td>
                  <td style="padding: 10px 10px; text-align: right; color: ${dayDiff < 0 ? '#b91c1c' : (dayDiff > 0 ? '#15803d' : '#0f172a')};">
                    ${fmtDiff(dayDiff)}
                  </td>
                  <td style="padding: 10px 12px; text-align: right;"></td>
                  <td style="padding: 10px 12px; text-align: right; font-size: 14px; color: ${totalDiffVal < 0 ? '#b91c1c' : (totalDiffVal > 0 ? '#15803d' : '#0f172a')};">
                    ${fmtDiff(totalDiffVal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="margin-top: 6px; font-size: 11.5px; color: #64748b; font-weight: 600; text-align: right;">
            Cash Diff: <strong style="color: ${totalCashDiff < 0 ? '#b91c1c' : '#047857'}">${fmtDiff(totalCashDiff)}</strong> &nbsp;|&nbsp; 
            Card Diff: <strong style="color: ${totalCardDiff < 0 ? '#b91c1c' : '#2563eb'}">${fmtDiff(totalCardDiff)}</strong> &nbsp;|&nbsp; 
            Total Diff: <strong style="color: ${totalDiffVal < 0 ? '#b91c1c' : '#0f172a'}">${fmtDiff(totalDiffVal)}</strong>
          </div>
        </div>
      `;
    }

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden; background: #fafafa; box-sizing: border-box;">
        <div style="background-color: #E31837; padding: 20px; border-bottom: 1px solid #eaeaea; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 22px;">${closingType} Closing Report</h2>
          <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">${report.branch}</p>
        </div>
        <div style="padding: 24px;">
          ${differenceHtml}
          ${shiftsHtml}
          <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #eaeaea; margin-bottom: 20px;">
            <p style="margin: 4px 0;"><strong>Cashier:</strong> ${report.cashier_name}</p>
            <p style="margin: 4px 0;"><strong>Total Orders:</strong> ${report.total_orders}</p>
            <p style="margin: 4px 0;"><strong>Total Sales:</strong> SAR ${parseFloat(report.total_sales).toFixed(2)}</p>
            <p style="margin: 4px 0; padding-left: 10px; font-size: 13px; color: #555;">↳ Cash Sales: SAR ${parseFloat(report.cash_sales || 0).toFixed(2)}</p>
            <p style="margin: 4px 0; padding-left: 10px; font-size: 13px; color: #555;">↳ Card Sales: SAR ${parseFloat(report.card_sales || 0).toFixed(2)}</p>
            <p style="margin: 4px 0; padding-left: 10px; font-size: 13px; color: #555;">↳ Credit Sales: SAR ${parseFloat(report.credit_sales || 0).toFixed(2)}</p>
            <p style="margin: 4px 0;"><strong>Major Payments Received:</strong> SAR ${parseFloat(report.major_payments || 0).toFixed(2)}</p>
            <p style="margin: 4px 0; font-weight: bold; color: #059669;"><strong>Total Amount Received:</strong> SAR ${(parseFloat(report.cash_sales || 0) + parseFloat(report.card_sales || 0) + parseFloat(report.major_payments || 0)).toFixed(2)}</p>
            ${parseFloat(report.opening_cash || 0) > 0 ? `<p style="margin: 4px 0;"><strong>Opening Drawer Cash:</strong> SAR ${parseFloat(report.opening_cash).toFixed(2)}</p>` : ''}
            <p style="margin: 4px 0; color: #047857;"><strong>Cash Counted:</strong> SAR ${parseFloat(report.closing_cash || 0).toFixed(2)}</p>
            <p style="margin: 4px 0; color: #2563eb;"><strong>Card Counted:</strong> SAR ${parseFloat(report.closing_card !== null && report.closing_card !== undefined ? report.closing_card : (report.card_sales || 0)).toFixed(2)}</p>
            <p style="margin: 4px 0; font-weight: bold;"><strong>Total Counted:</strong> SAR ${(parseFloat(report.closing_cash || 0) + parseFloat(report.closing_card !== null && report.closing_card !== undefined ? report.closing_card : (report.card_sales || 0))).toFixed(2)}</p>
            ${hasDiff ? `<p style="margin: 4px 0; color: #dc2626; font-weight: bold;"><strong>Difference:</strong> ${diffVal < 0 ? '-' : '+'}SAR ${Math.abs(diffVal).toFixed(2)}</p>` : ''}
            ${report.cash_difference !== null && report.cash_difference !== undefined ? `<p style="margin: 2px 0 2px 10px; font-size: 12px; color: ${parseFloat(report.cash_difference) < 0 ? '#dc2626' : '#047857'};">↳ Cash Diff: ${parseFloat(report.cash_difference) < 0 ? '-' : '+'}SAR ${Math.abs(parseFloat(report.cash_difference)).toFixed(2)}</p>` : ''}
            ${report.card_difference !== null && report.card_difference !== undefined ? `<p style="margin: 2px 0 2px 10px; font-size: 12px; color: ${parseFloat(report.card_difference) < 0 ? '#dc2626' : '#2563eb'};">↳ Card Diff: ${parseFloat(report.card_difference) < 0 ? '-' : '+'}SAR ${Math.abs(parseFloat(report.card_difference)).toFixed(2)}</p>` : ''}
            ${hasDiff && report.difference_reason ? `<p style="margin: 4px 0; color: #374151;"><strong>Diff Reason:</strong> ${report.difference_reason}</p>` : ''}
            <p style="margin: 4px 0;"><strong>Active Time:</strong> ${report.total_active_time}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #777;">${new Date(report.login_time).toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })} - ${new Date(report.logout_time).toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })} (KSA)</p>
          </div>
          
          <h3 style="margin-top: 24px; border-bottom: 2px solid #eaeaea; padding-bottom: 8px; color: #333;">Items Sold by Category</h3>
          <div>${itemsHtml || '<p style="text-align:center; color:#999; padding: 20px;">No items sold</p>'}</div>
          
          ${twoHourlyHtml}
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

// GET active cashier shift
router.get('/cashier-shift/active', authenticateToken, async (req, res) => {
  try {
    const cashierName = req.user.username;
    const branch = req.user.branch || 'Branch 1';
    const role = req.user.role?.trim().toLowerCase();

    let query = `SELECT * FROM cashier_shifts WHERE status = 'Open'`;
    const params = [];
    if (role === 'cashier') {
      params.push(cashierName);
      query += ` AND cashier_name = $${params.length}`;
    }
    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND branch = $${params.length}`;
    }
    query += ` ORDER BY id DESC LIMIT 1`;

    const result = await pool.query(query, params);
    if (result.rows.length > 0) {
      return res.json({ hasActiveShift: true, shift: result.rows[0] });
    }
    return res.json({ hasActiveShift: false, shift: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET previous shift info and uncompleted / pending orders for branch
router.get('/cashier-shift/previous-shift-info', authenticateToken, async (req, res) => {
  try {
    let branch = req.query?.branch || req.user?.branch || 'Branch 1';
    if (branch === 'All') branch = 'Branch 1';

    // 1. Get the last closed shift for this branch (from cashier_shifts or shift_closings)
    const lastShiftQuery = `
      SELECT cashier_name, logout_time, login_time, closing_cash
      FROM (
        SELECT cashier_name, end_time AS logout_time, start_time AS login_time, COALESCE(closing_cash, 0) AS closing_cash, id 
        FROM cashier_shifts 
        WHERE branch = $1 AND status = 'Closed'
        UNION ALL
        SELECT cashier_name, logout_time, login_time, COALESCE(closing_cash, 0) AS closing_cash, id 
        FROM shift_closings 
        WHERE branch = $1
      ) combined
      ORDER BY logout_time DESC NULLS LAST, id DESC
      LIMIT 1
    `;
    const lastShiftRes = await pool.query(lastShiftQuery, [branch]);
    const lastShift = lastShiftRes.rows[0] || null;

    // 2. Count pending / uncompleted orders for this branch
    const pendingOrdersRes = await pool.query(`
      SELECT 
        COUNT(*)::int as total_pending,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(order_type, '')) = 'takeaway' 
             OR customer_address = 'Takeaway'
        )::int as takeaway,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(order_type, '')) = 'delivery' 
             OR (customer_address IS NOT NULL AND customer_address NOT LIKE 'Table %' AND customer_address NOT IN ('Takeaway', 'Dine-In'))
        )::int as delivery,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(order_type, '')) IN ('dine-in', 'dine in', 'dining') 
             OR customer_address LIKE 'Table %' 
             OR customer_address = 'Dine-In'
        )::int as dine_in
      FROM "orders"
      WHERE branch = $1
        AND (status IN ('Hold', 'Payment Requested') OR status NOT IN ('Completed', 'Cancelled', 'Returned'))
    `, [branch]);

    const pendingStats = pendingOrdersRes.rows[0] || { total_pending: 0, takeaway: 0, delivery: 0, dine_in: 0 };

    res.json({
      success: true,
      lastCashier: lastShift?.cashier_name || null,
      lastShiftEndTime: lastShift?.logout_time || null,
      previousRemainingCash: parseFloat(lastShift?.closing_cash || 0),
      totalPending: pendingStats.total_pending || 0,
      takeaway: pendingStats.takeaway || 0,
      delivery: pendingStats.delivery || 0,
      dineIn: pendingStats.dine_in || 0
    });
  } catch (err) {
    console.error('Error fetching previous shift info:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST start cashier shift
router.post('/cashier-shift/start', authenticateToken, isAdminOrCashier, async (req, res) => {
  try {
    const cashierName = req.user.username;
    const cashierId = req.user.id;
    let branch = req.body?.branch || req.user?.branch || 'Branch 1';
    if (branch === 'All') branch = 'Branch 1';
    const openingCash = parseFloat(req.body?.opening_cash || 0) || 0;

    // Check if an open shift already exists for this cashier
    const existing = await pool.query(
      `SELECT * FROM cashier_shifts WHERE cashier_name = $1 AND branch = $2 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
      [cashierName, branch]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, message: 'Shift already open', shift: existing.rows[0] });
    }

    const insertRes = await pool.query(
      `INSERT INTO cashier_shifts (cashier_id, cashier_name, branch, start_time, opening_cash, status)
       VALUES ($1, $2, $3, NOW(), $4, 'Open')
       RETURNING *`,
      [cashierId, cashierName, branch, openingCash]
    );

    res.json({ success: true, message: 'Shift started successfully', shift: insertRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



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
    
    let userCond = 'AND (o.completed_by = $2 OR (o.completed_by IS NULL AND o.order_taker = $2))';
    let queryParams = [branch, req.user.username];
    if (isAdminRole) {
      userCond = '';
      queryParams = [branch];
    }
    
    const totals = await client.query(`
      SELECT 
        COUNT(DISTINCT o.id) as total_orders, 
        COALESCE(SUM(t.amount), 0) as total_sales,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Cash' THEN t.amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Card' THEN t.amount ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Credit' THEN t.amount ELSE 0 END), 0) as credit_sales
      FROM "orders" o
      LEFT JOIN transactions t ON o.id = t.order_id
      WHERE o.is_shift_closed = FALSE 
        AND o.status IN ('Completed', 'Returned') 
        AND o.branch = $1
        ${userCond}
    `, queryParams);

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
        WHERE o.is_shift_closed = FALSE AND o.status IN ('Completed', 'Returned') AND o.branch = $1 ${userCond}
        GROUP BY i.category_id, i.name
      ) grouped_items
      JOIN categories c ON grouped_items.category_id = c.id
      GROUP BY c.name
      ORDER BY amount DESC
    `, queryParams);

    // Fetch active shift record if exists
    const activeShiftRes = await client.query(
      isAdminRole
        ? `SELECT * FROM cashier_shifts WHERE branch = $1 AND status = 'Open' ORDER BY id DESC LIMIT 1`
        : `SELECT * FROM cashier_shifts WHERE cashier_name = $1 AND branch = $2 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
      isAdminRole ? [branch] : [req.user.username, branch]
    );
    const activeShift = activeShiftRes.rows[0] || null;
    let openingCash = parseFloat(req.body?.opening_cash || activeShift?.opening_cash || 0) || 0;
    if (!openingCash && !activeShift) {
      const lastShiftRes = await client.query(
        isAdminRole
          ? `SELECT opening_cash FROM cashier_shifts WHERE branch = $1 ORDER BY id DESC LIMIT 1`
          : `SELECT opening_cash FROM cashier_shifts WHERE cashier_name = $1 AND branch = $2 ORDER BY id DESC LIMIT 1`,
        isAdminRole ? [branch] : [req.user.username, branch]
      );
      openingCash = parseFloat(lastShiftRes.rows[0]?.opening_cash || 0) || 0;
    }

    let loginTime = activeShift ? new Date(activeShift.start_time) : new Date();
    if (!activeShift) {
      const firstOrderRes = await client.query(
        isAdminRole
          ? `SELECT MIN(created_at) as first_order_time FROM "orders" WHERE is_shift_closed = FALSE AND branch = $1`
          : `SELECT MIN(created_at) as first_order_time FROM "orders" WHERE is_shift_closed = FALSE AND branch = $1 AND (completed_by = $2 OR (completed_by IS NULL AND order_taker = $2))`,
        isAdminRole ? [branch] : [branch, req.user.username]
      );
      if (firstOrderRes.rows.length > 0 && firstOrderRes.rows[0].first_order_time) {
        loginTime = new Date(firstOrderRes.rows[0].first_order_time);
      }
    }
    const logoutTime = new Date();
    const diffMs = Math.max(0, logoutTime - loginTime);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    const totalActiveTime = `${diffHrs}h ${diffMins}m`;
    
    const majorPaymentsRes = await client.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END), 0) as cash_major,
        COALESCE(SUM(CASE WHEN payment_method = 'Card' THEN amount ELSE 0 END), 0) as card_major
      FROM credit_transactions
      WHERE type = 'PAYMENT' 
        AND is_shift_closed = FALSE 
        AND (branch = $1 OR branch IS NULL)
        AND created_at >= $2
        ${isAdminRole ? '' : 'AND (cashier_name = $3 OR cashier_name IS NULL)'}
    `, isAdminRole ? [branch, loginTime] : [branch, loginTime, req.user.username]);
    const majorPayments = parseFloat(majorPaymentsRes.rows[0]?.total || 0);

    const intervalItemsRes = await client.query(`
      SELECT 
        FLOOR(EXTRACT(EPOCH FROM (o.created_at - $2)) / 7200) AS block_idx,
        i.name,
        SUM(oi.qty) as qty
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.is_shift_closed = FALSE AND o.status IN ('Completed', 'Returned') AND o.branch = $1 ${isAdminRole ? '' : 'AND (o.completed_by = $3 OR (o.completed_by IS NULL AND o.order_taker = $3))'}
      GROUP BY block_idx, i.name
      ORDER BY block_idx, qty DESC
    `, isAdminRole ? [branch, loginTime] : [branch, loginTime, req.user.username]);
    
    const intervals = {};
    intervalItemsRes.rows.forEach(r => {
      const hb = parseInt(r.block_idx);
      if (!intervals[hb]) intervals[hb] = [];
      if (intervals[hb].length < 3) intervals[hb].push(r);
    });

    const closingCash = parseFloat(req.body?.remaining_cash ?? req.body?.closing_cash ?? 0) || 0;
    const closingCard = parseFloat(req.body?.remaining_card ?? req.body?.closing_card ?? 0) || 0;
    const totalSalesNum = parseFloat(totals.rows[0]?.total_sales || 0);
    const cashSalesNum = parseFloat(totals.rows[0]?.cash_sales || 0);
    const cardSalesNum = parseFloat(totals.rows[0]?.card_sales || 0);
    
    const cashDifference = closingCash - cashSalesNum;
    const cardDifference = closingCard - cardSalesNum;
    const difference = cashDifference + cardDifference;
    const differenceReason = (req.body?.difference_reason || '').trim();

    const insertRes = await client.query(`
      INSERT INTO shift_closings (
        cashier_id, cashier_name, branch, login_time, logout_time, total_active_time, 
        total_sales, cash_sales, card_sales, credit_sales, major_payments, total_orders, 
        items_summary, closing_type, closing_cash, closing_card, opening_cash, 
        interval_items, difference, cash_difference, card_difference, difference_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Shift', $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *
    `, [
      req.user.id,
      req.user.username,
      branch,
      loginTime,
      logoutTime,
      totalActiveTime,
      totals.rows[0].total_sales,
      totals.rows[0].cash_sales,
      totals.rows[0].card_sales,
      totals.rows[0].credit_sales,
      majorPayments,
      totals.rows[0].total_orders,
      JSON.stringify(itemsResult.rows),
      closingCash,
      closingCard,
      openingCash,
      JSON.stringify(intervals),
      difference,
      cashDifference,
      cardDifference,
      differenceReason
    ]);
    insertRes.rows[0].interval_items = intervals;

    if (isAdminRole) {
      await client.query(`
        UPDATE "orders" 
        SET is_shift_closed = TRUE 
        WHERE is_shift_closed = FALSE AND status != 'Hold' AND branch = $1
      `, [branch]);
    } else {
      await client.query(`
        UPDATE "orders" 
        SET is_shift_closed = TRUE 
        WHERE is_shift_closed = FALSE AND status != 'Hold' AND branch = $1 AND (completed_by = $2 OR (completed_by IS NULL AND order_taker = $2))
      `, [branch, req.user.username]);
    }

    await client.query(`
      UPDATE credit_transactions 
      SET is_shift_closed = TRUE 
      WHERE type = 'PAYMENT' 
        AND is_shift_closed = FALSE 
        AND (branch = $1 OR branch IS NULL)
        AND created_at >= $2
        ${isAdminRole ? '' : 'AND (cashier_name = $3 OR cashier_name IS NULL)'}
    `, isAdminRole ? [branch, loginTime] : [branch, loginTime, req.user.username]);
    
    if (activeShift) {
      await client.query(
        `UPDATE cashier_shifts SET status = 'Closed', end_time = NOW(), closing_cash = $2 WHERE id = $1`,
        [activeShift.id, closingCash]
      );
    }
    
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
        COUNT(DISTINCT o.id) as total_orders, 
        COALESCE(SUM(t.amount), 0) as total_sales,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Cash' THEN t.amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Card' THEN t.amount ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Credit' THEN t.amount ELSE 0 END), 0) as credit_sales
      FROM "orders" o
      LEFT JOIN transactions t ON o.id = t.order_id
      WHERE o.is_daily_closed = FALSE 
        AND o.status IN ('Completed', 'Returned') 
        AND o.branch = $1
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

    const lastClosingRes = await client.query(`SELECT logout_time FROM shift_closings WHERE branch = $1 AND closing_type = 'Daily' ORDER BY logout_time DESC LIMIT 1`, [branch]);
    let loginTime = new Date();
    loginTime.setHours(0,0,0,0);
    if (lastClosingRes.rows.length > 0 && lastClosingRes.rows[0].logout_time) {
      loginTime = new Date(lastClosingRes.rows[0].logout_time);
    }
    const logoutTime = new Date();
    const diffMs = Math.max(0, logoutTime - loginTime);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    const totalActiveTime = `${diffHrs}h ${diffMins}m`;

    const majorPaymentsRes = await client.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END), 0) as cash_major,
        COALESCE(SUM(CASE WHEN payment_method = 'Card' THEN amount ELSE 0 END), 0) as card_major
      FROM credit_transactions
      WHERE type = 'PAYMENT' 
        AND is_daily_closed = FALSE 
        AND (branch = $1 OR branch IS NULL)
        AND created_at >= $2
    `, [branch, loginTime]);
    const majorPayments = parseFloat(majorPaymentsRes.rows[0]?.total || 0);

    const intervalItemsRes = await client.query(`
      SELECT 
        FLOOR(EXTRACT(EPOCH FROM (o.created_at - $2)) / 7200) AS block_idx,
        i.name,
        SUM(oi.qty) as qty
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.is_daily_closed = FALSE AND o.status IN ('Completed', 'Returned') AND o.branch = $1
      GROUP BY block_idx, i.name
      ORDER BY block_idx, qty DESC
    `, [branch, loginTime]);
    
    const intervals = {};
    intervalItemsRes.rows.forEach(r => {
      const idx = parseInt(r.block_idx);
      if (!intervals[idx]) intervals[idx] = [];
      if (intervals[idx].length < 3) intervals[idx].push(r);
    });

    const closingCash = parseFloat(req.body?.remaining_cash ?? req.body?.closing_cash ?? 0) || 0;
    const closingCard = parseFloat(req.body?.remaining_card ?? req.body?.closing_card ?? 0) || 0;
    const totalSalesNum = parseFloat(totals.rows[0]?.total_sales || 0);
    const cashSalesNum = parseFloat(totals.rows[0]?.cash_sales || 0);
    const cardSalesNum = parseFloat(totals.rows[0]?.card_sales || 0);
    
    const cashDifference = closingCash - cashSalesNum;
    const cardDifference = closingCard - cardSalesNum;
    const difference = cashDifference + cardDifference;
    const differenceReason = (req.body?.difference_reason || '').trim();

    // Query all closed shifts that occurred in this daily closing window
    const shiftsRes = await client.query(`
      SELECT cashier_name, total_sales, cash_sales, card_sales, credit_sales, major_payments, total_orders, login_time, logout_time, closing_cash, closing_card, difference, difference_reason, cash_difference, card_difference
      FROM shift_closings
      WHERE branch = $1 AND closing_type = 'Shift' AND logout_time >= $2
      ORDER BY logout_time ASC
    `, [branch, loginTime]);

    const shiftsList = shiftsRes.rows.map(s => ({
      cashier_name: s.cashier_name,
      total_sales: parseFloat(s.total_sales || 0),
      cash_sales: parseFloat(s.cash_sales || 0),
      card_sales: parseFloat(s.card_sales || 0),
      credit_sales: parseFloat(s.credit_sales || 0),
      major_payments: parseFloat(s.major_payments || 0),
      total_orders: parseInt(s.total_orders || 0, 10),
      login_time: s.login_time,
      logout_time: s.logout_time,
      closing_cash: s.closing_cash !== null && s.closing_cash !== undefined ? parseFloat(s.closing_cash) : null,
      closing_card: s.closing_card !== null && s.closing_card !== undefined ? parseFloat(s.closing_card) : null,
      cash_difference: s.cash_difference !== null && s.cash_difference !== undefined ? parseFloat(s.cash_difference) : (s.closing_cash !== null ? parseFloat(s.closing_cash) - parseFloat(s.cash_sales || 0) : null),
      card_difference: s.card_difference !== null && s.card_difference !== undefined ? parseFloat(s.card_difference) : (s.closing_card !== null ? parseFloat(s.closing_card) - parseFloat(s.card_sales || 0) : null),
      difference: s.difference !== null && s.difference !== undefined ? parseFloat(s.difference) : null,
      difference_reason: s.difference_reason || ''
    }));

    // Also include any active / unclosed shift orders
    const unclosedShiftOrdersRes = await client.query(`
      SELECT 
        o.completed_by as cashier_name, 
        COUNT(DISTINCT o.id) as total_orders, 
        COALESCE(SUM(t.amount), 0) as total_sales,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Cash' THEN t.amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Card' THEN t.amount ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Credit' THEN t.amount ELSE 0 END), 0) as credit_sales
      FROM "orders" o
      LEFT JOIN transactions t ON o.id = t.order_id
      WHERE o.is_daily_closed = FALSE 
        AND o.is_shift_closed = FALSE
        AND o.status IN ('Completed', 'Returned')
        AND o.branch = $1
      GROUP BY o.completed_by
    `, [branch]);

    unclosedShiftOrdersRes.rows.forEach(u => {
      shiftsList.push({
        cashier_name: `${u.cashier_name} (Current)`,
        total_sales: parseFloat(u.total_sales || 0),
        cash_sales: parseFloat(u.cash_sales || 0),
        card_sales: parseFloat(u.card_sales || 0),
        credit_sales: parseFloat(u.credit_sales || 0),
        major_payments: 0,
        total_orders: parseInt(u.total_orders || 0, 10),
        closing_cash: null,
        closing_card: null,
        cash_difference: null,
        card_difference: null,
        difference: null,
        is_active: true
      });
    });

    // Get opening cash from active shift or latest cashier shift for this branch
    const shiftRes = await client.query(
      `SELECT opening_cash FROM cashier_shifts WHERE branch = $1 ORDER BY id DESC LIMIT 1`,
      [branch]
    );
    const openingCash = parseFloat(shiftRes.rows[0]?.opening_cash || 0) || 0;

    const insertRes = await client.query(`
      INSERT INTO shift_closings (
        cashier_id, cashier_name, branch, login_time, logout_time, total_active_time, 
        total_sales, cash_sales, card_sales, credit_sales, major_payments, total_orders, 
        items_summary, closing_type, closing_cash, closing_card, opening_cash, 
        interval_items, difference, cash_difference, card_difference, difference_reason, shifts_summary
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Daily', $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `, [
      req.user.id,
      req.user.username,
      branch,
      loginTime,
      logoutTime,
      totalActiveTime,
      totals.rows[0].total_sales,
      totals.rows[0].cash_sales,
      totals.rows[0].card_sales,
      totals.rows[0].credit_sales,
      majorPayments,
      totals.rows[0].total_orders,
      JSON.stringify(itemsResult.rows),
      closingCash,
      closingCard,
      openingCash,
      JSON.stringify(intervals),
      difference,
      cashDifference,
      cardDifference,
      differenceReason,
      JSON.stringify(shiftsList)
    ]);
    insertRes.rows[0].interval_items = intervals;
    insertRes.rows[0].shifts_summary = shiftsList;

    await client.query(`
      UPDATE "orders" 
      SET is_daily_closed = TRUE, is_shift_closed = TRUE
      WHERE is_daily_closed = FALSE AND status != 'Hold' AND branch = $1
    `, [branch]);

    await client.query(`
      UPDATE credit_transactions 
      SET is_daily_closed = TRUE, is_shift_closed = TRUE 
      WHERE type = 'PAYMENT' 
        AND is_daily_closed = FALSE 
        AND (branch = $1 OR branch IS NULL)
        AND created_at >= $2
    `, [branch, loginTime]);

    // Close any active cashier shifts for this branch
    await client.query(
      `UPDATE cashier_shifts SET status = 'Closed', end_time = NOW(), closing_cash = $2 WHERE branch = $1 AND status = 'Open'`,
      [branch, closingCash]
    );
    
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
    const orderCheck = await client.query('SELECT status FROM "orders" WHERE id = $1', [req.params.id]);
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    // Delete order items first (foreign key constraint)
    await client.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    
    // Delete transactions
    await client.query('DELETE FROM transactions WHERE order_id = $1', [req.params.id]);
    
    // Delete order
    await client.query('DELETE FROM "orders" WHERE id = $1', [req.params.id]);
    
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
  const { 
    items, subtotal, tax, grand_total, payment_method, 
    customer_name, customer_phone, customer_address, discount, 
    client_order_id, order_type, table_number, order_taker, comments,
    edit_reason, reason, credit_customer_id, credit_payment_amount 
  } = req.body;
  const client = await pool.connect();
  try {
    if (!(await checkBranchAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Access denied: Order belongs to another branch' });
    }
    await client.query('BEGIN');

    // Check if order exists and get existing items
    const orderCheck = await client.query('SELECT status, edit_history, edit_reason, completed_by, completed_at, shift_id, credit_customer_id FROM "orders" WHERE id = $1', [req.params.id]);
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const existingOrder = orderCheck.rows[0];
    const oldItemsRes = await client.query('SELECT item_name, qty, unit_price, item_id FROM order_items WHERE order_id = $1', [req.params.id]);
    const oldItems = oldItemsRes.rows;

    // Compute Diff with unit prices and IDs
    const diff = [];
    const newItemsMap = {};
    items.forEach(i => newItemsMap[i.name] = { qty: i.qty, price: parseFloat(i.price || i.unit_price) || 0, id: i.id || i.item_id });
    
    const oldItemsMap = {};
    oldItems.forEach(i => oldItemsMap[i.item_name] = { qty: i.qty, price: parseFloat(i.unit_price) || 0, id: i.item_id });

    // Check for removed or decreased qty
    for (const oldName in oldItemsMap) {
      const oldItem = oldItemsMap[oldName];
      const newItem = newItemsMap[oldName];
      const newQty = newItem ? newItem.qty : 0;
      if (newQty === 0) {
        diff.push({ type: 'removed', name: oldName, qty: oldItem.qty, unit_price: oldItem.price, item_id: oldItem.id });
      } else if (newQty < oldItem.qty) {
        diff.push({ type: 'decreased', name: oldName, diffQty: oldItem.qty - newQty, oldQty: oldItem.qty, newQty, unit_price: oldItem.price, item_id: oldItem.id });
      } else if (newQty > oldItem.qty) {
        diff.push({ type: 'increased', name: oldName, diffQty: newQty - oldItem.qty, oldQty: oldItem.qty, newQty, unit_price: newItem.price, item_id: newItem.id });
      }
    }
    // Check for newly added items
    for (const newName in newItemsMap) {
      if (!oldItemsMap[newName]) {
        const newItem = newItemsMap[newName];
        diff.push({ type: 'added', name: newName, qty: newItem.qty, unit_price: newItem.price, item_id: newItem.id });
      }
    }

    // Prepare edit history
    const finalEditReason = (edit_reason || reason || '').trim();
    let editHistory = existingOrder.edit_history || [];
    if (typeof editHistory === 'string') {
      try { editHistory = JSON.parse(editHistory); } catch (e) { editHistory = []; }
    }
    if (!Array.isArray(editHistory)) editHistory = [];

    const editorName = req.user?.username || req.user?.role || order_taker || 'Unknown User';
    if (diff.length > 0 || finalEditReason) {
      editHistory.push({
        timestamp: new Date().toISOString(),
        edited_by: editorName,
        reason: finalEditReason,
        changes: diff
      });
    }

    const status = (payment_method === 'Hold' || payment_method === 'Payment Pending' || payment_method === 'Payment Requested') ? payment_method : 'Completed';
    const isCompleted = (status === 'Completed' || status === 'Cash' || status === 'Card' || status === 'Online' || status === 'Credit');

    let completedBy = existingOrder.completed_by;
    let completedAt = existingOrder.completed_at;
    let shiftId = existingOrder.shift_id;

    if (isCompleted) {
      if (!completedBy || existingOrder.status !== 'Completed') {
        completedBy = req.user?.username || order_taker || completedBy || 'Cashier';
        completedAt = new Date();
      }
      if (!shiftId && completedBy) {
        const activeShiftRes = await client.query(
          `SELECT id FROM cashier_shifts WHERE cashier_name = $1 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
          [completedBy]
        );
        if (activeShiftRes.rows.length > 0) {
          shiftId = activeShiftRes.rows[0].id;
        }
      }
    } else if (status === 'Hold') {
      // If reverted to hold, reset completed markers
      completedBy = null;
      completedAt = null;
    }

    // Enforce credit customer discount rules strictly
    let finalDiscount = parseFloat(discount) || 0;
    let finalGrandTotal = parseFloat(grand_total) || 0;
    const targetCreditId = credit_customer_id || existingOrder.credit_customer_id;

    if (payment_method === 'Credit') {
      if (!targetCreditId) {
        finalDiscount = 0;
        finalGrandTotal = Math.max(0, (parseFloat(subtotal) || 0) + (parseFloat(tax) || 0));
      } else {
        const custRes = await client.query('SELECT discount_rules FROM credit_customers WHERE id = $1', [targetCreditId]);
        if (custRes.rows.length === 0) {
          finalDiscount = 0;
          finalGrandTotal = Math.max(0, (parseFloat(subtotal) || 0) + (parseFloat(tax) || 0));
        } else {
          let rules = custRes.rows[0].discount_rules;
          if (typeof rules === 'string') {
            try { rules = JSON.parse(rules); } catch(e) { rules = []; }
          }
          if (!Array.isArray(rules) || rules.length === 0) {
            finalDiscount = 0;
            finalGrandTotal = Math.max(0, (parseFloat(subtotal) || 0) + (parseFloat(tax) || 0));
          }
        }
      }
    }

    // Update order details
    const orderResult = await client.query(
      `UPDATE "orders" 
       SET subtotal = $1, tax = $2, grand_total = $3, status = $4, 
           customer_name = $5, customer_phone = $6, customer_address = $7, discount = $8,
           client_order_id = COALESCE($9, client_order_id),
           order_type = $10, table_number = $11, order_taker = $12, comments = $13,
           is_edited = TRUE,
           edit_count = COALESCE(edit_count, 0) + 1,
           edit_history = $14,
           edit_reason = CASE WHEN $15::text IS NOT NULL AND $15::text != '' THEN $15::text ELSE edit_reason END,
           completed_by = $16,
           completed_at = $17,
           shift_id = COALESCE($18, shift_id)
       WHERE id = $19 RETURNING *`,
      [
        subtotal, tax, finalGrandTotal, status, 
        customer_name || null, customer_phone || null, customer_address || null, finalDiscount, 
        client_order_id || null, order_type || null, table_number || null, order_taker || null, comments || null, 
        JSON.stringify(editHistory), 
        finalEditReason || null,
        completedBy,
        completedAt,
        shiftId,
        req.params.id
      ]
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
      [payment_method || 'Cash', finalGrandTotal, req.params.id]
    );

    // Handle Credit customer logic if Credit
    if (payment_method === 'Credit' && targetCreditId) {
      await client.query(
        `UPDATE "orders" SET credit_customer_id = $1 WHERE id = $2`,
        [targetCreditId, req.params.id]
      );
      if (existingOrder.status !== 'Completed') {
        await client.query(
          `INSERT INTO credit_transactions (credit_customer_id, order_id, type, amount) VALUES ($1, $2, $3, $4)`,
          [targetCreditId, req.params.id, 'CREDIT_ORDER', finalGrandTotal]
        );
        let balanceChange = parseFloat(finalGrandTotal);
        if (credit_payment_amount && parseFloat(credit_payment_amount) > 0) {
          const paymentAmt = parseFloat(credit_payment_amount);
          await client.query(
            `INSERT INTO credit_transactions (credit_customer_id, order_id, type, amount) VALUES ($1, $2, $3, $4)`,
            [targetCreditId, req.params.id, 'PAYMENT', paymentAmt]
          );
          balanceChange -= paymentAmt;
        }
        await client.query(
          `UPDATE credit_customers SET balance = balance + $1 WHERE id = $2`,
          [balanceChange, targetCreditId]
        );
      }
    }

    // Deduct stock if order has become Completed
    if (isCompleted && existingOrder.status !== 'Completed') {
      const settingsRes = await client.query('SELECT low_stock_behavior FROM settings ORDER BY id ASC LIMIT 1');
      const behavior = settingsRes.rows.length > 0 ? (settingsRes.rows[0].low_stock_behavior || 'block') : 'block';
      await deductStock(req.params.id, client, behavior);
    }

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
    const orderRes = await pool.query('SELECT * FROM "orders" WHERE id = $1', [req.params.id]);
    if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderRes.rows[0];

    const itemsRes = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    const items = itemsRes.rows;

    const settingsRes = await pool.query('SELECT auto_print_enabled, printer_ip FROM settings ORDER BY id ASC LIMIT 1');
    const effectiveBranch = order.branch || 'Branch 1';
    const branchNumber = String(req.body.branchId || effectiveBranch).replace(/\D/g, '') || '1';
    const channelName = `branch-${branchNumber}-orders`;
    const printerIp = req.body.printerIp || (settingsRes.rows.length > 0 && settingsRes.rows[0].printer_ip ? settingsRes.rows[0].printer_ip : '127.0.0.1');

    if (pusher) {
      const payload = {
        orderId: order.id,
        orderNumber: order.slip_number,
        branchId: parseInt(branchNumber),
        waiterName: (order.order_taker || "Staff").replace(/[^\x00-\x7F]/g, "").trim(),
        tableName: (order.table_number || "").replace(/[^\x00-\x7F]/g, "").trim(),
        orderType: order.order_type || "Takeaway",
        printerIp: printerIp,
        subtotal: order.subtotal,
        discount: order.discount || 0,
        total: order.grand_total,
        currency: "SAR",
        customerName: (order.customer_name || "").replace(/[^\x00-\x7F]/g, "").trim(),
        customerPhone: order.customer_phone || "",
        paymentStatus: order.status || "Completed",
        createdAt: new Date().toISOString(),
        items: items.map(item => ({
          name: (item.item_name || item.name || "").replace(/[^\x00-\x7F]/g, "").trim(),
          qty: item.qty || 1,
          amount: item.unit_price || item.price
        }))
      };
      await pusher.trigger(channelName, 'print-kitchen-ticket', payload);
      return res.json({ success: true, message: 'Reprint sent to cloud printer' });
    } else {
      return res.status(500).json({ error: 'Cloud printing is not configured on the server.' });
    }
  } catch (err) {
    console.error('Reprint error:', err);
    res.status(500).json({ error: 'Failed to reprint' });
  }
});
async function reverseCreditTransactions(orderId, client) {
  try {
    const txs = await client.query('SELECT * FROM credit_transactions WHERE order_id = $1', [orderId]);
    if (txs.rows.length === 0) return;
    
    for (let tx of txs.rows) {
      if (tx.type === 'CREDIT_ORDER') {
        // Reverse order debt
        await client.query(
          `INSERT INTO credit_transactions (credit_customer_id, order_id, type, amount) VALUES ($1, $2, $3, $4)`,
          [tx.credit_customer_id, orderId, 'ORDER_CANCELLED', tx.amount]
        );
        await client.query(
          `UPDATE credit_customers SET balance = balance - $1 WHERE id = $2`,
          [tx.amount, tx.credit_customer_id]
        );
      } else if (tx.type === 'PAYMENT') {
        // Reverse payment
        await client.query(
          `INSERT INTO credit_transactions (credit_customer_id, order_id, type, amount) VALUES ($1, $2, $3, $4)`,
          [tx.credit_customer_id, orderId, 'PAYMENT_CANCELLED', tx.amount]
        );
        await client.query(
          `UPDATE credit_customers SET balance = balance + $1 WHERE id = $2`,
          [tx.amount, tx.credit_customer_id]
        );
      }
    }
  } catch (err) {
    console.error('Error reversing credit transactions:', err);
  }
}

module.exports = router;
