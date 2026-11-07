const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Default standard branches including Central Kitchen and Other
const STANDARD_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3', 'Central Kitchen', 'Other'];

// Helper to determine if user has full administrative visibility
function isSuperUser(user) {
  const role = user?.role?.trim().toLowerCase();
  return role === 'admin' || role === 'developer' || role === 'management' || role === 'general manager';
}

// GET /api/internal-branch/branches - List all available branches
router.get('/branches', authenticateToken, async (req, res) => {
  try {
    const dbBranchesRes = await pool.query(`
      SELECT DISTINCT branch FROM users 
      WHERE branch IS NOT NULL AND branch != '' AND branch != 'All'
    `).catch(() => ({ rows: [] }));

    const dbBranches = dbBranchesRes.rows.map(r => r.branch);
    const combined = Array.from(new Set([...STANDARD_BRANCHES, ...dbBranches])).filter(Boolean);
    
    // Remove 'Restaurant 1', 'Restaurant 2', 'Restaurant 3' as requested by user
    const filtered = combined.filter(b => {
      const lower = b.trim().toLowerCase();
      return !lower.startsWith('restaurant');
    });

    // Ensure 'Other' is at the end
    const withoutOther = filtered.filter(b => b.toLowerCase() !== 'other');
    res.json([...withoutOther, 'Other']);
  } catch (err) {
    console.error('Error fetching branches:', err);
    res.json(STANDARD_BRANCHES);
  }
});

// GET /api/internal-branch/dishes - Centralized menu dishes from items
router.get('/dishes', authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT i.id, i.name, i.price, i.image_url, i.available_branches, i.size_options,
        (SELECT json_agg(c.name) FROM categories c JOIN item_categories ic ON c.id = ic.category_id WHERE ic.item_id = i.id) as category_names
      FROM items i 
      WHERE 1=1
    `;
    const params = [];
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      query += ` AND i.name ILIKE $${params.length}`;
    }
    query += ` ORDER BY i.name ASC LIMIT 500`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching dishes:', err);
    res.status(500).json({ error: 'Failed to fetch dishes' });
  }
});

// Helper to generate unique daily Transfer ID (e.g. TRF-20261107-0001)
async function generateTransferId(client) {
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `TRF-${todayStr}-`;
  
  const res = await client.query(`
    SELECT transfer_id FROM internal_branch_transfers 
    WHERE transfer_id LIKE $1 
    ORDER BY id DESC LIMIT 1
  `, [`${prefix}%`]);

  let nextSeq = 1;
  if (res.rows.length > 0) {
    const lastId = res.rows[0].transfer_id;
    const parts = lastId.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  const paddedSeq = String(nextSeq).padStart(4, '0');
  return `${prefix}${paddedSeq}`;
}

// POST /api/internal-branch/transfers - Create a new transfer request
router.post('/transfers', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { to_branch, needed_by_time, notes, items, is_external } = req.body;
    let from_branch = req.body.from_branch;

    // Detect user branch
    const userBranch = req.user.branch;
    const superUser = isSuperUser(req.user);

    if (!superUser || !from_branch) {
      from_branch = userBranch || 'Branch 1';
    }

    if (!to_branch) {
      return res.status(400).json({ error: 'Destination (Request To) branch is required.' });
    }

    if (from_branch.trim().toLowerCase() === to_branch.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Origin and Destination branch cannot be the same.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one dish row is required.' });
    }

    // Validate dish rows
    for (const [idx, item] of items.entries()) {
      if (!item.dish_name || !item.dish_name.trim()) {
        return res.status(400).json({ error: `Dish name is required for row #${idx + 1}.` });
      }
      const qty = parseFloat(item.requested_qty);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `Requested quantity for "${item.dish_name}" must be a positive number.` });
      }
      if (!item.uom) {
        return res.status(400).json({ error: `Unit of Measurement is required for "${item.dish_name}".` });
      }
    }

    const standardBranches = ['branch 1', 'branch 2', 'branch 3', 'central kitchen'];
    const isExternalBranch = Boolean(
      is_external ||
      !standardBranches.includes((to_branch || '').trim().toLowerCase()) ||
      !standardBranches.includes((from_branch || '').trim().toLowerCase())
    );

    await client.query('BEGIN');

    // Duplicate submission suppression (within 4 seconds from same origin to same destination)
    const dupCheck = await client.query(`
      SELECT id, transfer_id FROM internal_branch_transfers
      WHERE from_branch = $1 AND to_branch = $2 AND request_date >= CURRENT_TIMESTAMP - INTERVAL '4 seconds'
      LIMIT 1
    `, [from_branch, to_branch]);

    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: 'A transfer request with identical branches was just submitted. Please wait a few seconds.' 
      });
    }

    const transferId = await generateTransferId(client);
    const requestedByName = req.user.name || req.user.username || 'Staff';

    const insertTransferRes = await client.query(`
      INSERT INTO internal_branch_transfers (
        transfer_id, from_branch, to_branch, requested_by_user_id, requested_by_name,
        request_date, needed_by_time, status, notes, is_external
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, 'Pending', $7, $8)
      RETURNING *
    `, [
      transferId,
      from_branch,
      to_branch,
      req.user.id || null,
      requestedByName,
      needed_by_time || null,
      notes || null,
      isExternalBranch
    ]);

    const createdTransfer = insertTransferRes.rows[0];

    const insertedItems = [];
    for (const item of items) {
      const itemRes = await client.query(`
        INSERT INTO internal_branch_transfer_items (
          transfer_id, item_id, dish_name, uom, requested_qty, remarks, image_url, price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        createdTransfer.id,
        item.item_id || null,
        item.dish_name.trim(),
        item.uom.trim(),
        parseFloat(item.requested_qty),
        item.remarks ? item.remarks.trim() : null,
        item.image_url || null,
        item.price ? parseFloat(item.price) : null
      ]);
      insertedItems.push(itemRes.rows[0]);
    }

    await client.query('COMMIT');

    const responsePayload = {
      ...createdTransfer,
      items: insertedItems
    };

    // Emit real-time notification
    if (req.io) {
      req.io.emit('internal_transfer_created', responsePayload);
    }

    res.status(201).json(responsePayload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating transfer request:', err);
    res.status(500).json({ error: err.message || 'Failed to create transfer request' });
  } finally {
    client.release();
  }
});

// GET /api/internal-branch/transfers - Query transfers with filtering and role isolation
router.get('/transfers', authenticateToken, async (req, res) => {
  try {
    const { 
      status, from_branch, to_branch, period, 
      from_date, to_date, dish_name, search, tab 
    } = req.query;

    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    let query = `
      SELECT t.*,
        json_agg(
          json_build_object(
            'id', ti.id,
            'item_id', ti.item_id,
            'dish_name', ti.dish_name,
            'uom', ti.uom,
            'requested_qty', ti.requested_qty,
            'sent_qty', ti.sent_qty,
            'received_qty', ti.received_qty,
            'variance_qty', ti.variance_qty,
            'remarks', ti.remarks,
            'image_url', COALESCE(ti.image_url, i.image_url),
            'price', COALESCE(ti.price, i.price)
          ) ORDER BY ti.id ASC
        ) as items,
        COUNT(ti.id) as item_count
      FROM internal_branch_transfers t
      LEFT JOIN internal_branch_transfer_items ti ON t.id = ti.transfer_id
      LEFT JOIN items i ON ti.item_id = i.id
      WHERE 1=1
    `;
    const params = [];

    // Role-based branch isolation
    if (!superUser && userBranch && userBranch !== 'All') {
      if (tab === 'incoming') {
        params.push(userBranch);
        query += ` AND t.to_branch = $${params.length}`;
      } else if (tab === 'outgoing' || tab === 'pending_receivals') {
        params.push(userBranch);
        query += ` AND t.from_branch = $${params.length}`;
      } else {
        params.push(userBranch);
        params.push(userBranch);
        query += ` AND (t.from_branch = $${params.length - 1} OR t.to_branch = $${params.length})`;
      }
    } else {
      if (from_branch && from_branch !== 'All') {
        if (from_branch === 'Other') {
          if (req.query.from_branch_custom && req.query.from_branch_custom.trim()) {
            params.push(`%${req.query.from_branch_custom.trim()}%`);
            query += ` AND t.from_branch ILIKE $${params.length}`;
          } else {
            query += ` AND t.from_branch NOT IN ('Branch 1', 'Branch 2', 'Branch 3', 'Central Kitchen')`;
          }
        } else {
          params.push(from_branch);
          query += ` AND t.from_branch = $${params.length}`;
        }
      }
      if (to_branch && to_branch !== 'All') {
        if (to_branch === 'Other') {
          if (req.query.to_branch_custom && req.query.to_branch_custom.trim()) {
            params.push(`%${req.query.to_branch_custom.trim()}%`);
            query += ` AND t.to_branch ILIKE $${params.length}`;
          } else {
            query += ` AND t.to_branch NOT IN ('Branch 1', 'Branch 2', 'Branch 3', 'Central Kitchen')`;
          }
        } else {
          params.push(to_branch);
          query += ` AND t.to_branch = $${params.length}`;
        }
      }
    }

    // Status filter
    if (status && status !== 'All') {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }

    // Tab-specific status overrides
    if (tab === 'incoming' && (!status || status === 'All')) {
      query += ` AND t.status IN ('Pending', 'In-Transit')`;
    } else if (tab === 'pending_receivals' && (!status || status === 'All')) {
      query += ` AND t.status = 'In-Transit'`;
    }

    // Date / Period filters
    if (period === 'today') {
      query += ` AND (t.request_date AT TIME ZONE 'Asia/Riyadh')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date`;
    } else if (period === 'daily') {
      query += ` AND (t.request_date AT TIME ZONE 'Asia/Riyadh')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date`;
    } else if (period === 'weekly') {
      query += ` AND t.request_date >= CURRENT_TIMESTAMP - INTERVAL '7 days'`;
    } else if (period === 'monthly') {
      query += ` AND t.request_date >= CURRENT_TIMESTAMP - INTERVAL '30 days'`;
    } else {
      if (from_date) {
        params.push(from_date);
        query += ` AND (t.request_date AT TIME ZONE 'Asia/Riyadh')::date >= $${params.length}::date`;
      }
      if (to_date) {
        params.push(to_date);
        query += ` AND (t.request_date AT TIME ZONE 'Asia/Riyadh')::date <= $${params.length}::date`;
      }
    }

    // Dish search filter
    if (dish_name && dish_name.trim()) {
      params.push(`%${dish_name.trim()}%`);
      query += ` AND EXISTS (
        SELECT 1 FROM internal_branch_transfer_items sub_ti 
        WHERE sub_ti.transfer_id = t.id AND sub_ti.dish_name ILIKE $${params.length}
      )`;
    }

    // General search filter
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      query += ` AND (
        t.transfer_id ILIKE $${params.length} 
        OR t.from_branch ILIKE $${params.length}
        OR t.to_branch ILIKE $${params.length}
        OR t.requested_by_name ILIKE $${params.length}
        OR EXISTS (
          SELECT 1 FROM internal_branch_transfer_items sub_ti 
          WHERE sub_ti.transfer_id = t.id AND sub_ti.dish_name ILIKE $${params.length}
        )
      )`;
    }

    query += `
      GROUP BY t.id
      ORDER BY t.request_date DESC
      LIMIT 300
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching transfers:', err);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// GET /api/internal-branch/transfers/:id - Get single transfer details
router.get('/transfers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const tRes = await pool.query(`
      SELECT * FROM internal_branch_transfers WHERE id = $1 OR transfer_id = $1
    `, [id]);

    if (tRes.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const itemsRes = await pool.query(`
      SELECT ti.*, COALESCE(ti.image_url, i.image_url) as image_url, COALESCE(ti.price, i.price) as price
      FROM internal_branch_transfer_items ti 
      LEFT JOIN items i ON ti.item_id = i.id
      WHERE ti.transfer_id = $1 
      ORDER BY ti.id ASC
    `, [transfer.id]);

    res.json({
      ...transfer,
      items: itemsRes.rows
    });
  } catch (err) {
    console.error('Error fetching transfer:', err);
    res.status(500).json({ error: 'Failed to fetch transfer' });
  }
});

// PUT /api/internal-branch/transfers/:id/dispatch - Supplying branch marks as dispatched
router.put('/transfers/:id/dispatch', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Dispatched quantities are required.' });
    }

    await client.query('BEGIN');

    // Row-level lock to prevent concurrent double-click race conditions
    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    if (transfer.status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Cannot dispatch transfer in status "${transfer.status}". Only "Pending" transfers can be dispatched.` });
    }

    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    // Supplying branch check
    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only staff from supplying branch "${transfer.to_branch}" can dispatch this transfer.` });
    }

    for (const item of items) {
      const sentQty = parseFloat(item.sent_qty);
      if (isNaN(sentQty) || sentQty < 0) {
        throw new Error(`Sent quantity for item #${item.id} must be a non-negative number.`);
      }

      await client.query(`
        UPDATE internal_branch_transfer_items
        SET sent_qty = $1, remarks = COALESCE($2, remarks)
        WHERE id = $3 AND transfer_id = $4
      `, [sentQty, item.remarks || null, item.id, transfer.id]);
    }

    const dispatcherName = req.user.name || req.user.username || 'Kitchen Dispatcher';

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET status = 'In-Transit',
          dispatched_at = CURRENT_TIMESTAMP,
          dispatched_by_user_id = $1,
          dispatched_by_name = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [req.user.id || null, dispatcherName, transfer.id]);

    const updatedTransfer = updateRes.rows[0];

    const updatedItems = await client.query(`
      SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC
    `, [transfer.id]);

    await client.query('COMMIT');

    const payload = {
      ...updatedTransfer,
      items: updatedItems.rows
    };

    if (req.io) {
      req.io.emit('internal_transfer_dispatched', payload);
    }

    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error dispatching transfer:', err);
    res.status(500).json({ error: err.message || 'Failed to dispatch transfer' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/receive - Requesting branch confirms receiving and closes transfer
router.put('/transfers/:id/receive', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { items, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Received quantities are required.' });
    }

    await client.query('BEGIN');

    // Row-level lock to prevent concurrent double-click race conditions
    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    if (transfer.status !== 'In-Transit') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Cannot receive transfer in status "${transfer.status}". Only "In-Transit" transfers can be received.` });
    }

    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    // Receiving branch check
    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.from_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only staff from requesting branch "${transfer.from_branch}" can receive and close this transfer.` });
    }

    for (const item of items) {
      const recQty = parseFloat(item.received_qty);
      if (isNaN(recQty) || recQty < 0) {
        throw new Error(`Received quantity for item #${item.id} must be a non-negative number.`);
      }

      // Fetch sent qty to calculate exact variance
      const itemRowRes = await client.query(`SELECT sent_qty, requested_qty FROM internal_branch_transfer_items WHERE id = $1`, [item.id]);
      const currentItem = itemRowRes.rows[0] || {};
      const baseSent = currentItem.sent_qty !== null ? parseFloat(currentItem.sent_qty) : parseFloat(currentItem.requested_qty || 0);
      const variance = recQty - baseSent;

      await client.query(`
        UPDATE internal_branch_transfer_items
        SET received_qty = $1,
            variance_qty = $2,
            remarks = COALESCE($3, remarks)
        WHERE id = $4 AND transfer_id = $5
      `, [recQty, variance, item.remarks || null, item.id, transfer.id]);
    }

    const receiverName = req.user.name || req.user.username || 'Staff Receiver';
    const combinedNotes = notes 
      ? (transfer.notes ? `${transfer.notes}\n[Receiving Notes]: ${notes.trim()}` : `[Receiving Notes]: ${notes.trim()}`)
      : transfer.notes;

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET status = 'Completed',
          received_at = CURRENT_TIMESTAMP,
          received_by_user_id = $1,
          received_by_name = $2,
          notes = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [req.user.id || null, receiverName, combinedNotes, transfer.id]);

    const updatedTransfer = updateRes.rows[0];

    const updatedItems = await client.query(`
      SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC
    `, [transfer.id]);

    await client.query('COMMIT');

    const payload = {
      ...updatedTransfer,
      items: updatedItems.rows
    };

    if (req.io) {
      req.io.emit('internal_transfer_received', payload);
    }

    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error receiving transfer:', err);
    res.status(500).json({ error: err.message || 'Failed to receive transfer' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/cancel - Cancel transfer
router.put('/transfers/:id/cancel', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    if (transfer.status === 'Completed' || transfer.status === 'Cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Transfers in "${transfer.status}" status cannot be cancelled.` });
    }

    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.from_branch && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized to cancel this transfer.' });
    }

    const cancelNote = reason 
      ? (transfer.notes ? `${transfer.notes}\n[Cancelled]: ${reason.trim()}` : `[Cancelled]: ${reason.trim()}`)
      : transfer.notes;

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET status = 'Cancelled', notes = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [cancelNote, transfer.id]);

    await client.query('COMMIT');

    const payload = updateRes.rows[0];
    if (req.io) {
      req.io.emit('internal_transfer_cancelled', payload);
    }

    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error cancelling transfer:', err);
    res.status(500).json({ error: 'Failed to cancel transfer' });
  } finally {
    client.release();
  }
});

// GET /api/internal-branch/stats - Summary counts for badges and overview
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    let branchClause = '';
    const params = [];

    if (!superUser && userBranch && userBranch !== 'All') {
      params.push(userBranch);
      branchClause = ` AND (from_branch = $1 OR to_branch = $1)`;
    }

    const countsRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'Pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'In-Transit') as in_transit_count,
        COUNT(*) FILTER (WHERE status = 'Completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'Cancelled') as cancelled_count
      FROM internal_branch_transfers
      WHERE 1=1 ${branchClause}
    `, params);

    // Incoming pending count for badge (pending where to_branch = userBranch)
    let incomingPendingCount = 0;
    if (userBranch && userBranch !== 'All') {
      const incRes = await pool.query(`
        SELECT COUNT(*) as count FROM internal_branch_transfers
        WHERE to_branch = $1 AND status = 'Pending'
      `, [userBranch]);
      incomingPendingCount = parseInt(incRes.rows[0]?.count || 0, 10);
    } else {
      incomingPendingCount = parseInt(countsRes.rows[0]?.pending_count || 0, 10);
    }

    // Pending receivals count for badge (in-transit where from_branch = userBranch)
    let pendingReceivalsCount = 0;
    if (userBranch && userBranch !== 'All') {
      const recRes = await pool.query(`
        SELECT COUNT(*) as count FROM internal_branch_transfers
        WHERE from_branch = $1 AND status = 'In-Transit'
      `, [userBranch]);
      pendingReceivalsCount = parseInt(recRes.rows[0]?.count || 0, 10);
    } else {
      pendingReceivalsCount = parseInt(countsRes.rows[0]?.in_transit_count || 0, 10);
    }

    res.json({
      ...countsRes.rows[0],
      incoming_pending_count: incomingPendingCount,
      pending_receivals_count: pendingReceivalsCount
    });
  } catch (err) {
    console.error('Error fetching transfer stats:', err);
    res.json({
      pending_count: 0,
      in_transit_count: 0,
      completed_count: 0,
      cancelled_count: 0,
      incoming_pending_count: 0,
      pending_receivals_count: 0
    });
  }
});

module.exports = router;

