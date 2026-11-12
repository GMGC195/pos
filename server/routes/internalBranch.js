const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, blockSalaryPayOperator } = require('../middleware/auth');

// Security Guard: Salary Pay Operator is strictly blocked from Internal Branch
router.use(blockSalaryPayOperator);

// Default standard branches including Central Kitchen and Other
const STANDARD_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3', 'Central Kitchen', 'Other'];

// Helper to determine if user has full administrative visibility
function isSuperUser(user) {
  const role = user?.role?.trim().toLowerCase();
  return role === 'admin' || role === 'developer' || role === 'management' || role === 'general manager';
}

// Activity logging helper
async function logTransferActivity(client, { transferId, action, fromBranch, toBranch, user, details, userRole, previousValue, newValue, reason, metadata = {} }) {
  try {
    const performedById = user?.id || null;
    const performedByName = user?.name || user?.username || 'System';
    const role = userRole || user?.role || 'Staff';
    await client.query(`
      INSERT INTO internal_branch_activity_logs (
        transfer_id, action, from_branch, to_branch, performed_by_id, performed_by_name, user_role, previous_value, new_value, reason, details, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    `, [
      transferId,
      action,
      fromBranch,
      toBranch,
      performedById,
      performedByName,
      role,
      previousValue !== undefined && previousValue !== null ? String(previousValue) : null,
      newValue !== undefined && newValue !== null ? String(newValue) : null,
      reason ? String(reason) : null,
      details,
      JSON.stringify(metadata)
    ]);
  } catch (err) {
    console.warn('Failed to log transfer activity:', err.message);
  }
}

// System notification helper
async function createBranchNotification(client, { targetBranch, message, type = 'INTERNAL_TRANSFER' }) {
  try {
    await client.query(`
      INSERT INTO notifications (message, type, target_roles, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `, [message, type, JSON.stringify(['admin', 'developer', targetBranch])]);
  } catch (err) {
    console.warn('Failed to insert notification:', err.message);
  }
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
      const lower = String(b).trim().toLowerCase();
      return !lower.includes('restaurant');
    });

    // Ensure 'Other' is at the end
    const withoutOther = filtered.filter(b => b.toLowerCase() !== 'other');
    res.json([...withoutOther, 'Other']);
  } catch (err) {
    console.error('Error fetching branches:', err);
    res.json(STANDARD_BRANCHES);
  }
});

// GET /api/internal-branch/dishes - Centralized menu dishes with smart popularity ranking (fail-safe)
router.get('/dishes', authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;

    // 1. Try popularity-enriched query
    try {
      let query = `
        SELECT 
          i.id, 
          i.name, 
          i.price, 
          i.image_url, 
          i.available_branches, 
          i.size_options,
          COALESCE(
            (SELECT json_agg(c.name) FROM categories c JOIN item_categories ic ON c.id = ic.category_id WHERE ic.item_id = i.id),
            (SELECT json_agg(c.name) FROM categories c WHERE c.id = i.category_id),
            '[]'::json
          ) as category_names,
          COALESCE(pop.request_count, 0) as request_count,
          COALESCE(pop.total_requested_qty, 0) as total_requested_qty
        FROM items i 
        LEFT JOIN (
          SELECT 
            COALESCE(ti.item_id, 0) as item_id,
            LOWER(TRIM(ti.dish_name)) as dish_name_clean,
            COUNT(*)::int as request_count,
            SUM(COALESCE(ti.requested_qty, 1))::float as total_requested_qty
          FROM internal_branch_transfer_items ti
          WHERE ti.dish_name IS NOT NULL AND TRIM(ti.dish_name) != ''
          GROUP BY ti.item_id, LOWER(TRIM(ti.dish_name))
        ) pop ON (i.id = pop.item_id OR LOWER(TRIM(i.name)) = pop.dish_name_clean)
        WHERE i.name IS NOT NULL AND TRIM(i.name) != ''
      `;
      const params = [];
      if (search && search.trim()) {
        params.push(`%${search.trim()}%`);
        query += ` AND i.name ILIKE $${params.length}`;
      }
      query += ` ORDER BY COALESCE(pop.request_count, 0) DESC, COALESCE(pop.total_requested_qty, 0) DESC, i.name ASC LIMIT 500`;

      const result = await pool.query(query, params);
      return res.json(result.rows);
    } catch (innerErr) {
      console.warn('Popularity query fallback for dishes:', innerErr.message);
      // 2. Safe fallback query without transfer items table or item_categories
      let fallbackQuery = `
        SELECT 
          i.id, 
          i.name, 
          i.price, 
          i.image_url, 
          i.available_branches, 
          i.size_options,
          COALESCE(
            (SELECT json_agg(c.name) FROM categories c WHERE c.id = i.category_id),
            '[]'::json
          ) as category_names,
          0 as request_count,
          0 as total_requested_qty
        FROM items i
        WHERE i.name IS NOT NULL AND TRIM(i.name) != ''
      `;
      const fallbackParams = [];
      if (search && search.trim()) {
        fallbackParams.push(`%${search.trim()}%`);
        fallbackQuery += ` AND i.name ILIKE $${fallbackParams.length}`;
      }
      fallbackQuery += ` ORDER BY i.name ASC LIMIT 500`;

      const fallbackResult = await pool.query(fallbackQuery, fallbackParams);
      return res.json(fallbackResult.rows);
    }
  } catch (err) {
    console.error('Error fetching dishes:', err);
    res.status(500).json({ error: 'Failed to fetch dishes' });
  }
});

// GET /api/internal-branch/product-popularity - Fast lookup map of frequently requested dishes
router.get('/product-popularity', authenticateToken, async (req, res) => {
  try {
    let popRes = { rows: [] };
    try {
      popRes = await pool.query(`
        SELECT 
          COALESCE(ti.item_id, 0) as item_id,
          LOWER(TRIM(ti.dish_name)) as dish_name_clean,
          COUNT(*)::int as request_count,
          COALESCE(SUM(ti.requested_qty), 0)::float as total_requested_qty
        FROM internal_branch_transfer_items ti
        WHERE ti.dish_name IS NOT NULL AND TRIM(ti.dish_name) != ''
        GROUP BY ti.item_id, LOWER(TRIM(ti.dish_name))
        ORDER BY request_count DESC, total_requested_qty DESC
      `);
    } catch (tblErr) {
      console.warn('internal_branch_transfer_items not ready for popularity, returning empty map:', tblErr.message);
    }

    const byId = {};
    const byName = {};
    for (const r of popRes.rows) {
      const data = {
        request_count: r.request_count,
        total_requested_qty: r.total_requested_qty
      };
      if (r.item_id) byId[r.item_id] = data;
      if (r.dish_name_clean) byName[r.dish_name_clean] = data;
    }

    res.json({ by_id: byId, by_name: byName });
  } catch (err) {
    console.error('Error fetching product popularity:', err);
    res.json({ by_id: {}, by_name: {} });
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
    const { 
      to_branch, needed_by_time, delivery_minutes, notes, items, is_external,
      request_type, priority 
    } = req.body;
    let from_branch = req.body.from_branch;

    const finalRequestType = (request_type && request_type.trim()) ? request_type.trim() : 'Transfer Request';
    const finalPriority = (priority && priority.trim()) ? priority.trim() : 'Normal';

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

    // Calculate expected delivery timestamp
    const mins = parseInt(delivery_minutes, 10) || 30;
    const expectedDeliveryAt = new Date(Date.now() + mins * 60 * 1000);

    const insertTransferRes = await client.query(`
      INSERT INTO internal_branch_transfers (
        transfer_id, from_branch, to_branch, requested_by_user_id, requested_by_name,
        request_date, needed_by_time, delivery_minutes, expected_delivery_at, status, notes, is_external,
        original_delivery_minutes, original_needed_by_time, total_extended_minutes, extension_status,
        request_type, priority
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, $8, 'Pending', $9, $10, $7, $6, 0, 'None', $11, $12)
      RETURNING *
    `, [
      transferId,
      from_branch,
      to_branch,
      req.user.id || null,
      requestedByName,
      needed_by_time || `${mins} mins`,
      mins,
      expectedDeliveryAt,
      notes || null,
      isExternalBranch,
      finalRequestType,
      finalPriority
    ]);

    const createdTransfer = insertTransferRes.rows[0];

    const insertedItems = [];
    for (const item of items) {
      const itemSku = (item.sku && String(item.sku).trim()) || (item.short_code && String(item.short_code).trim()) || (item.item_id ? `SKU-${item.item_id}` : null);
      const itemBarcode = (item.barcode && String(item.barcode).trim()) || null;

      const itemRes = await client.query(`
        INSERT INTO internal_branch_transfer_items (
          transfer_id, item_id, dish_name, uom, requested_qty, confirmed_qty, remarks, image_url, price, sku, barcode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        createdTransfer.id,
        item.item_id || null,
        item.dish_name.trim(),
        item.uom.trim(),
        parseFloat(item.requested_qty),
        parseFloat(item.requested_qty), // Default confirmed_qty equals requested_qty
        item.remarks ? item.remarks.trim() : null,
        item.image_url || null,
        item.price ? parseFloat(item.price) : null,
        itemSku,
        itemBarcode
      ]);
      insertedItems.push(itemRes.rows[0]);
    }

    // Record activity log
    await logTransferActivity(client, {
      transferId: createdTransfer.id,
      action: 'REQUEST_CREATED',
      fromBranch: from_branch,
      toBranch: to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: null,
      newValue: `${mins} mins`,
      reason: notes || null,
      details: `Request created with ${items.length} item(s). Expected delivery in ${mins} minutes.`,
      metadata: { itemsCount: items.length, deliveryMinutes: mins, neededBy: needed_by_time }
    });

    // Notify receiving branch
    await createBranchNotification(client, {
      targetBranch: to_branch,
      message: `🔔 New Internal Khata Request #${transferId} from ${from_branch} (${items.length} items, needed in ${mins}m).`,
      type: 'INTERNAL_TRANSFER_NEW'
    });

    await client.query('COMMIT');

    const responsePayload = {
      ...createdTransfer,
      items: insertedItems
    };

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

// GET /api/internal-branch/transfers - Query transfers with filtering, branch direction & role isolation
router.get('/transfers', authenticateToken, async (req, res) => {
  try {
    const { 
      status, from_branch, to_branch, branch, branch_direction,
      sent_by, received_by, sent_by_user, received_by_user, request_type, priority,
      period, from_date, to_date, dish_name, search, tab 
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
            'confirmed_qty', ti.confirmed_qty,
            'sent_qty', ti.sent_qty,
            'received_qty', ti.received_qty,
            'variance_qty', ti.variance_qty,
            'remarks', ti.remarks,
            'quantity_change_reason', ti.quantity_change_reason,
            'sku', COALESCE(ti.sku, i.short_code, CONCAT('SKU-', ti.item_id)),
            'barcode', COALESCE(ti.barcode, ''),
            'short_code', COALESCE(i.short_code, ''),
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

    // Active target branch for tab routing
    const targetBranch = (branch && branch !== 'All') 
      ? branch 
      : (!superUser && userBranch && userBranch !== 'All' ? userBranch : null);

    // Tab-specific branch & status routing
    if (tab === 'incoming') {
      // Incoming Requests: Only requests destined for the active branch and NOT sent by the active branch itself
      if (targetBranch) {
        params.push(targetBranch);
        query += ` AND t.to_branch = $${params.length}`;
        params.push(targetBranch);
        query += ` AND t.from_branch != $${params.length}`;
      } else if (!superUser && userBranch && userBranch !== 'All') {
        params.push(userBranch);
        query += ` AND t.to_branch = $${params.length}`;
        params.push(userBranch);
        query += ` AND t.from_branch != $${params.length}`;
      }

      // Origin filter (Sent By)
      const originBranch = sent_by || from_branch;
      if (originBranch && originBranch !== 'All') {
        if (originBranch === 'Other') {
          if (req.query.sent_by_custom && req.query.sent_by_custom.trim()) {
            params.push(`%${req.query.sent_by_custom.trim()}%`);
            query += ` AND t.from_branch ILIKE $${params.length}`;
          } else {
            query += ` AND t.from_branch NOT IN ('Branch 1', 'Branch 2', 'Branch 3', 'Central Kitchen')`;
          }
        } else {
          params.push(originBranch);
          query += ` AND t.from_branch = $${params.length}`;
        }
      }

      // Destination branch processes active requests only
      if (!status || status === 'All') {
        query += ` AND t.status IN ('Pending', 'In Progress', 'Ready for Dispatch')`;
      }
    } else if (tab === 'pending_receivals' || tab === 'receivals') {
      // Pending Receivals: Dedicated section for the requesting branch awaiting dispatched goods
      if (targetBranch) {
        params.push(targetBranch);
        query += ` AND t.from_branch = $${params.length}`;
      } else if (!superUser && userBranch && userBranch !== 'All') {
        params.push(userBranch);
        query += ` AND t.from_branch = $${params.length}`;
      }

      // Supplying branch filter
      const supplyingBranch = received_by || to_branch;
      if (supplyingBranch && supplyingBranch !== 'All') {
        params.push(supplyingBranch);
        query += ` AND t.to_branch = $${params.length}`;
      }

      // Only in-transit / dispatched awaiting receival confirmation
      if (!status || status === 'All') {
        query += ` AND t.status IN ('Dispatched', 'In-Transit', 'Ready for Dispatch')`;
      }
    } else if (tab === 'sent_requests' || tab === 'sent') {
      // Sent Requests: Dedicated section for the requesting branch tracking its sent requests until completed
      if (targetBranch) {
        params.push(targetBranch);
        query += ` AND t.from_branch = $${params.length}`;
      } else if (!superUser && userBranch && userBranch !== 'All') {
        params.push(userBranch);
        query += ` AND t.from_branch = $${params.length}`;
      }

      // Supplying branch filter (To Branch)
      const supplyingBranch = received_by || to_branch;
      if (supplyingBranch && supplyingBranch !== 'All') {
        params.push(supplyingBranch);
        query += ` AND t.to_branch = $${params.length}`;
      }

      // Active / in-progress until receiving completed:
      if (!status || status === 'All') {
        query += ` AND t.status NOT IN ('Completed', 'Complete', 'Cancelled')`;
      }
    } else {
      // Master Logs & General Tab: Role isolation
      if (!superUser && userBranch && userBranch !== 'All') {
        params.push(userBranch);
        params.push(userBranch);
        query += ` AND (t.from_branch = $${params.length - 1} OR t.to_branch = $${params.length})`;
      }

      // Branch Switcher + Direction filter
      const selectedBranch = branch || null;
      if (selectedBranch && selectedBranch !== 'All') {
        const direction = (branch_direction || 'all').toLowerCase();
        if (direction === 'sent') {
          params.push(selectedBranch);
          query += ` AND t.from_branch = $${params.length}`;
        } else if (direction === 'received') {
          params.push(selectedBranch);
          query += ` AND t.to_branch = $${params.length}`;
        } else {
          params.push(selectedBranch);
          params.push(selectedBranch);
          query += ` AND (t.from_branch = $${params.length - 1} OR t.to_branch = $${params.length})`;
        }
      }

      // Sent By (Origin Branch) filter
      const effSentBy = sent_by || from_branch;
      if (effSentBy && effSentBy !== 'All') {
        if (effSentBy === 'Other') {
          if (req.query.sent_by_custom && req.query.sent_by_custom.trim()) {
            params.push(`%${req.query.sent_by_custom.trim()}%`);
            query += ` AND t.from_branch ILIKE $${params.length}`;
          } else {
            query += ` AND t.from_branch NOT IN ('Branch 1', 'Branch 2', 'Branch 3', 'Central Kitchen')`;
          }
        } else {
          params.push(effSentBy);
          query += ` AND t.from_branch = $${params.length}`;
        }
      }

      // Received By (Destination Branch) filter
      const effRecBy = received_by || to_branch;
      if (effRecBy && effRecBy !== 'All') {
        if (effRecBy === 'Other') {
          if (req.query.received_by_custom && req.query.received_by_custom.trim()) {
            params.push(`%${req.query.received_by_custom.trim()}%`);
            query += ` AND t.to_branch ILIKE $${params.length}`;
          } else {
            query += ` AND t.to_branch NOT IN ('Branch 1', 'Branch 2', 'Branch 3', 'Central Kitchen')`;
          }
        } else {
          params.push(effRecBy);
          query += ` AND t.to_branch = $${params.length}`;
        }
      }
    }

    // Status filter
    if (status && status !== 'All') {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }

    // Request Type filter (All Types, Kitchen Request, Other Request, Branch Transfer)
    if (request_type && request_type !== 'All') {
      if (request_type === 'Branch Transfer' || request_type === 'Transfer Request') {
        query += ` AND (t.request_type = 'Branch Transfer' OR t.request_type = 'Transfer Request')`;
      } else if (request_type === 'Kitchen Request') {
        query += ` AND (t.request_type = 'Kitchen Request' OR t.to_branch ILIKE '%Kitchen%' OR t.from_branch ILIKE '%Kitchen%')`;
      } else if (request_type === 'Other Request') {
        query += ` AND (t.request_type = 'Other Request' OR t.to_branch = 'Other' OR t.from_branch = 'Other' OR t.is_external = TRUE)`;
      } else {
        params.push(request_type);
        query += ` AND t.request_type = $${params.length}`;
      }
    }

    // Priority filter (All, Normal, High, Urgent)
    if (priority && priority !== 'All') {
      params.push(priority);
      query += ` AND t.priority = $${params.length}`;
    }

    // Sent By User (Requester name or user ID)
    if (sent_by_user && sent_by_user.trim()) {
      params.push(`%${sent_by_user.trim()}%`);
      query += ` AND (t.requested_by_name ILIKE $${params.length} OR CAST(t.requested_by_user_id AS TEXT) = $${params.length})`;
    }

    // Received By User (Receiver name or user ID)
    if (received_by_user && received_by_user.trim()) {
      params.push(`%${received_by_user.trim()}%`);
      query += ` AND (t.received_by_name ILIKE $${params.length} OR CAST(t.received_by_user_id AS TEXT) = $${params.length})`;
    }

    // Date / Period filters
    if (period === 'today' || period === 'daily') {
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
      ORDER BY COALESCE(t.created_at, t.request_date) DESC, t.id DESC
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
      SELECT ti.*, 
        COALESCE(ti.image_url, i.image_url) as image_url, 
        COALESCE(ti.price, i.price) as price,
        COALESCE(ti.sku, i.short_code, CONCAT('SKU-', ti.item_id)) as sku,
        COALESCE(ti.barcode, '') as barcode,
        COALESCE(i.short_code, '') as short_code
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

// GET /api/internal-branch/transfers/:id/activity-logs - Get activity logs for a transfer
router.get('/transfers/:id/activity-logs', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const logsRes = await pool.query(`
      SELECT 
        id,
        transfer_id,
        action,
        action AS action_type,
        details,
        details AS description,
        from_branch,
        to_branch,
        performed_by_id,
        performed_by_name,
        performed_by_name AS user_name,
        COALESCE(user_role, 'Staff') AS user_role,
        previous_value,
        new_value,
        reason,
        metadata,
        created_at
      FROM internal_branch_activity_logs 
      WHERE transfer_id = $1 
      ORDER BY created_at DESC
    `, [id]);
    res.json(logsRes.rows);
  } catch (err) {
    console.error('Error fetching transfer activity logs:', err);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Helper to recalculate overall transfer status based on item statuses
async function recalculateTransferStatus(client, transferId) {
  const itemsRes = await client.query(`
    SELECT id, dish_name, item_status, requested_qty, accepted_qty, rejected_qty, sent_qty, dispatched_qty, received_qty, pending_receive_qty, rejected_receive_qty
    FROM internal_branch_transfer_items
    WHERE transfer_id = $1
  `, [transferId]);

  const items = itemsRes.rows;
  if (items.length === 0) return 'Pending';

  const transferRes = await client.query(`SELECT status FROM internal_branch_transfers WHERE id = $1`, [transferId]);
  const currentStatus = transferRes.rows[0]?.status || 'Pending';

  // Check receiving status first if items were dispatched
  const dispatchedItems = items.filter(it => (parseFloat(it.dispatched_qty || it.sent_qty || 0) > 0));
  if (dispatchedItems.length > 0) {
    const allDispatchedReceived = dispatchedItems.every(it => it.item_status === 'Fully Received' || it.item_status === 'Received');
    const anyDispatchedReceived = dispatchedItems.some(it => parseFloat(it.received_qty || 0) > 0);
    const anyPendingReceive = dispatchedItems.some(it => it.item_status === 'Pending Receive' || parseFloat(it.pending_receive_qty || 0) > 0);
    const allDispatchedRejected = dispatchedItems.every(it => it.item_status === 'Rejected');

    if (allDispatchedReceived && !anyPendingReceive) {
      await client.query(`UPDATE internal_branch_transfers SET status = 'Received', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [transferId]);
      return 'Received';
    }
    if (anyDispatchedReceived || anyPendingReceive) {
      await client.query(`UPDATE internal_branch_transfers SET status = 'Partially Received', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [transferId]);
      return 'Partially Received';
    }
    if (allDispatchedRejected) {
      await client.query(`UPDATE internal_branch_transfers SET status = 'Rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [transferId]);
      return 'Rejected';
    }
    const allAcceptedDispatched = items.filter(it => it.item_status === 'Accepted').length === 0;
    const finalDispStatus = allAcceptedDispatched ? 'Dispatched' : 'Partially Dispatched';
    await client.query(`UPDATE internal_branch_transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [finalDispStatus, transferId]);
    return finalDispStatus;
  }

  // Pre-dispatch stage: Acceptance / Rejection
  const acceptedItems = items.filter(it => it.item_status === 'Accepted' || it.item_status === 'Preparing');
  const rejectedItems = items.filter(it => it.item_status === 'Rejected');
  const pendingItems = items.filter(it => !it.item_status || it.item_status === 'Pending');

  let newStatus = 'Pending';
  if (rejectedItems.length === items.length) {
    newStatus = 'Rejected';
  } else if (acceptedItems.length === items.length) {
    newStatus = (currentStatus === 'In Progress' || currentStatus === 'Preparing') ? currentStatus : 'Accepted';
  } else if (acceptedItems.length > 0) {
    newStatus = 'Partially Accepted';
  } else {
    newStatus = 'Pending';
  }

  await client.query(`UPDATE internal_branch_transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newStatus, transferId]);
  return newStatus;
}

// PUT /api/internal-branch/transfers/:id/items/:itemId/accept - Accept single item
router.put('/transfers/:id/items/:itemId/accept', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, itemId } = req.params;
    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }
    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only supplying branch "${transfer.to_branch}" can accept items.` });
    }

    const userName = req.user.name || req.user.username || 'Kitchen Staff';

    const itemRes = await client.query(`
      SELECT * FROM internal_branch_transfer_items WHERE id = $1 AND transfer_id = $2 FOR UPDATE
    `, [itemId, id]);

    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer item not found' });
    }

    const item = itemRes.rows[0];
    const reqQty = parseFloat(item.requested_qty || 0);

    const updateItemRes = await client.query(`
      UPDATE internal_branch_transfer_items
      SET item_status = 'Accepted',
          accepted_qty = $1,
          rejected_qty = 0,
          rejection_reason = NULL,
          accepted_by_name = $2,
          accepted_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND transfer_id = $4
      RETURNING *
    `, [reqQty, userName, itemId, id]);

    const updatedItem = updateItemRes.rows[0];
    const overallStatus = await recalculateTransferStatus(client, id);

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'ITEM_ACCEPTED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: item.item_status || 'Pending',
      newValue: 'Accepted',
      details: `Item "${item.dish_name}" accepted (${reqQty} ${item.uom}) by ${userName}. Request status is now "${overallStatus}".`
    });

    await client.query('COMMIT');

    const fullItems = await pool.query(`SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC`, [id]);
    const fullTransfer = await pool.query(`SELECT * FROM internal_branch_transfers WHERE id = $1`, [id]);

    const payload = { ...fullTransfer.rows[0], items: fullItems.rows };
    if (req.io) {
      req.io.emit('internal_transfer_item_accepted', { transferId: id, itemId, updatedItem, overallStatus, payload });
      req.io.emit('internal_transfer_updated', payload);
    }
    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error accepting item:', err);
    res.status(500).json({ error: err.message || 'Failed to accept item' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/items/:itemId/reject - Reject single item
router.put('/transfers/:id/items/:itemId/reject', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, itemId } = req.params;
    const { rejection_reason } = req.body;

    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }
    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only supplying branch "${transfer.to_branch}" can reject items.` });
    }

    const userName = req.user.name || req.user.username || 'Kitchen Staff';

    const itemRes = await client.query(`
      SELECT * FROM internal_branch_transfer_items WHERE id = $1 AND transfer_id = $2 FOR UPDATE
    `, [itemId, id]);

    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer item not found' });
    }

    const item = itemRes.rows[0];
    const reqQty = parseFloat(item.requested_qty || 0);
    const reasonText = rejection_reason?.trim() || 'Item unavailable at supplying branch';

    const updateItemRes = await client.query(`
      UPDATE internal_branch_transfer_items
      SET item_status = 'Rejected',
          rejected_qty = $1,
          accepted_qty = 0,
          rejection_reason = $2,
          rejected_by_name = $3,
          rejected_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND transfer_id = $5
      RETURNING *
    `, [reqQty, reasonText, userName, itemId, id]);

    const updatedItem = updateItemRes.rows[0];
    const overallStatus = await recalculateTransferStatus(client, id);

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'ITEM_REJECTED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: item.item_status || 'Pending',
      newValue: 'Rejected',
      reason: reasonText,
      details: `Item "${item.dish_name}" rejected by ${userName}. Reason: "${reasonText}". Request status is now "${overallStatus}".`
    });

    await client.query('COMMIT');

    const fullItems = await pool.query(`SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC`, [id]);
    const fullTransfer = await pool.query(`SELECT * FROM internal_branch_transfers WHERE id = $1`, [id]);

    const payload = { ...fullTransfer.rows[0], items: fullItems.rows };
    if (req.io) {
      req.io.emit('internal_transfer_item_rejected', { transferId: id, itemId, updatedItem, overallStatus, payload });
      req.io.emit('internal_transfer_updated', payload);
    }
    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error rejecting item:', err);
    res.status(500).json({ error: err.message || 'Failed to reject item' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/accept-all - Accept all pending items
router.put('/transfers/:id/accept-all', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }
    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only supplying branch "${transfer.to_branch}" can accept items.` });
    }

    const userName = req.user.name || req.user.username || 'Kitchen Staff';

    await client.query(`
      UPDATE internal_branch_transfer_items
      SET item_status = 'Accepted',
          accepted_qty = requested_qty,
          rejected_qty = 0,
          rejection_reason = NULL,
          accepted_by_name = $1,
          accepted_at = CURRENT_TIMESTAMP
      WHERE transfer_id = $2 AND (item_status = 'Pending' OR item_status IS NULL)
    `, [userName, id]);

    const overallStatus = await recalculateTransferStatus(client, id);

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'ALL_ITEMS_ACCEPTED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: transfer.status,
      newValue: overallStatus,
      details: `All pending items accepted by ${userName}.`
    });

    await client.query('COMMIT');

    const fullItems = await pool.query(`SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC`, [id]);
    const fullTransfer = await pool.query(`SELECT * FROM internal_branch_transfers WHERE id = $1`, [id]);

    const payload = { ...fullTransfer.rows[0], items: fullItems.rows };
    if (req.io) req.io.emit('internal_transfer_updated', payload);
    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error accepting all items:', err);
    res.status(500).json({ error: err.message || 'Failed to accept all items' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/reject-all - Reject all pending items
router.put('/transfers/:id/reject-all', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }
    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only supplying branch "${transfer.to_branch}" can reject items.` });
    }

    const userName = req.user.name || req.user.username || 'Kitchen Staff';
    const reasonText = rejection_reason?.trim() || 'Items unavailable at supplying branch';

    await client.query(`
      UPDATE internal_branch_transfer_items
      SET item_status = 'Rejected',
          rejected_qty = requested_qty,
          accepted_qty = 0,
          rejection_reason = $1,
          rejected_by_name = $2,
          rejected_at = CURRENT_TIMESTAMP
      WHERE transfer_id = $3 AND (item_status = 'Pending' OR item_status IS NULL)
    `, [reasonText, userName, id]);

    const overallStatus = await recalculateTransferStatus(client, id);

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'ALL_ITEMS_REJECTED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: transfer.status,
      newValue: overallStatus,
      reason: reasonText,
      details: `All pending items rejected by ${userName}. Reason: "${reasonText}".`
    });

    await client.query('COMMIT');

    const fullItems = await pool.query(`SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC`, [id]);
    const fullTransfer = await pool.query(`SELECT * FROM internal_branch_transfers WHERE id = $1`, [id]);

    const payload = { ...fullTransfer.rows[0], items: fullItems.rows };
    if (req.io) req.io.emit('internal_transfer_updated', payload);
    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error rejecting all items:', err);
    res.status(500).json({ error: err.message || 'Failed to reject all items' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/start-processing - Receiving branch starts preparing
router.put('/transfers/:id/start-processing', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only supplying branch "${transfer.to_branch}" can start processing.` });
    }

    const userName = req.user.name || req.user.username || 'Kitchen Staff';

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET status = 'In Progress',
          processing_started_at = CURRENT_TIMESTAMP,
          processing_started_by_user_id = $1,
          processing_started_by_name = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [req.user.id || null, userName, transfer.id]);

    const updated = updateRes.rows[0];

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'PROCESSING_STARTED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: 'Pending',
      newValue: 'In Progress',
      details: `Kitchen started preparing dishes for request #${transfer.transfer_id}.`
    });

    await createBranchNotification(client, {
      targetBranch: transfer.from_branch,
      message: `🍳 ${transfer.to_branch} has started preparing your request #${transfer.transfer_id}.`,
      type: 'INTERNAL_TRANSFER_IN_PROGRESS'
    });

    await client.query('COMMIT');

    if (req.io) {
      req.io.emit('internal_transfer_processing_started', updated);
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error starting transfer processing:', err);
    res.status(500).json({ error: err.message || 'Failed to start processing' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/extend-delivery-time - Request extension of delivery time (sent for approval)
router.put('/transfers/:id/extend-delivery-time', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { additional_minutes, reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason for requesting delivery time extension is mandatory.' });
    }

    const addMins = parseInt(additional_minutes, 10);
    if (isNaN(addMins) || addMins <= 0) {
      return res.status(400).json({ error: 'Valid extension minutes (greater than 0) are required.' });
    }

    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized. Only supplying branch can request delivery time extension.' });
    }

    if (transfer.extension_status === 'Pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'An extension request is already pending review for this transfer.' });
    }

    const userName = req.user.name || req.user.username || 'Kitchen Staff';

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET extension_status = 'Pending',
          pending_extension_minutes = $1,
          pending_extension_reason = $2,
          pending_extension_requested_by = $3,
          pending_extension_requested_by_name = $4,
          pending_extension_requested_at = CURRENT_TIMESTAMP,
          time_extended_at = CURRENT_TIMESTAMP,
          time_extended_by_name = $4,
          time_extend_reason = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [
      addMins,
      reason.trim(),
      req.user.id || null,
      userName,
      transfer.id
    ]);

    const updated = updateRes.rows[0];

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'EXTENSION_REQUESTED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: `${transfer.delivery_minutes || 30} mins`,
      newValue: `+${addMins} mins (Pending Approval)`,
      reason: reason.trim(),
      details: `Extension of +${addMins}m requested by ${userName} (${transfer.to_branch}). Reason: ${reason.trim()}`,
      metadata: { requestedMinutes: addMins, reason: reason.trim() }
    });

    await createBranchNotification(client, {
      targetBranch: transfer.from_branch,
      message: `⏳ Extension Requested for Transfer #${transfer.transfer_id} by ${transfer.to_branch}: +${addMins}m. Reason: ${reason.trim()}`,
      type: 'INTERNAL_TRANSFER_EXTENSION_REQUESTED'
    });

    await client.query('COMMIT');

    if (req.io) {
      req.io.emit('internal_transfer_extension_requested', updated);
      req.io.emit('internal_transfer_updated', updated);
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error requesting delivery time extension:', err);
    res.status(500).json({ error: err.message || 'Failed to request delivery time extension' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/extension-accept - Requester accepts the pending extension
router.put('/transfers/:id/extension-accept', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;
    const isRequester = req.user.id && transfer.requested_by_user_id && Number(req.user.id) === Number(transfer.requested_by_user_id);
    const isFromBranch = userBranch && userBranch.toLowerCase() === (transfer.from_branch || '').toLowerCase();

    if (!superUser && !isRequester && !isFromBranch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized. Only requesting branch or original requester can accept time extensions.' });
    }

    if (transfer.extension_status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No pending extension request found to accept.' });
    }

    const addMins = parseInt(transfer.pending_extension_minutes, 10) || 15;
    const currentMins = parseInt(transfer.delivery_minutes, 10) || 30;
    const newMins = currentMins + addMins;

    const baseMs = transfer.expected_delivery_at ? new Date(transfer.expected_delivery_at).getTime() : Date.now();
    const newExpected = new Date(Math.max(Date.now(), baseMs) + addMins * 60 * 1000);
    const userName = req.user.name || req.user.username || 'Requester Staff';
    const newNeededBy = newExpected.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET delivery_minutes = $1,
          expected_delivery_at = $2,
          needed_by_time = $3,
          extension_status = 'Accepted',
          total_extended_minutes = COALESCE(total_extended_minutes, 0) + $4,
          extension_reviewed_by_name = $5,
          extension_reviewed_at = CURRENT_TIMESTAMP,
          pending_extension_minutes = NULL,
          pending_extension_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [newMins, newExpected, newNeededBy, addMins, userName, transfer.id]);

    const updated = updateRes.rows[0];

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'EXTENSION_ACCEPTED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: `${currentMins} mins`,
      newValue: `${newMins} mins`,
      reason: transfer.pending_extension_reason || 'Extension accepted by requesting branch',
      details: `Extension of +${addMins}m accepted by ${userName}. Total delivery time: ${newMins}m. New expected delivery: ${newNeededBy}.`,
      metadata: { addedMinutes: addMins, totalMinutes: newMins, expectedDeliveryAt: newExpected }
    });

    await createBranchNotification(client, {
      targetBranch: transfer.to_branch,
      message: `✅ Extension Approved for Transfer #${transfer.transfer_id}: +${addMins}m accepted by ${transfer.from_branch}.`,
      type: 'INTERNAL_TRANSFER_EXTENSION_ACCEPTED'
    });

    await client.query('COMMIT');

    if (req.io) {
      req.io.emit('internal_transfer_extension_accepted', updated);
      req.io.emit('internal_transfer_updated', updated);
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error accepting extension:', err);
    res.status(500).json({ error: err.message || 'Failed to accept extension' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/extension-reject - Requester rejects the pending extension
router.put('/transfers/:id/extension-reject', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is mandatory.' });
    }

    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;
    const isRequester = req.user.id && transfer.requested_by_user_id && Number(req.user.id) === Number(transfer.requested_by_user_id);
    const isFromBranch = userBranch && userBranch.toLowerCase() === (transfer.from_branch || '').toLowerCase();

    if (!superUser && !isRequester && !isFromBranch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized. Only requesting branch or original requester can reject time extensions.' });
    }

    if (transfer.extension_status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No pending extension request found to reject.' });
    }

    const pendingMins = transfer.pending_extension_minutes || 0;
    const userName = req.user.name || req.user.username || 'Requester Staff';

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET extension_status = 'Rejected',
          extension_rejection_reason = $1,
          extension_reviewed_by_name = $2,
          extension_reviewed_at = CURRENT_TIMESTAMP,
          pending_extension_minutes = NULL,
          pending_extension_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [rejection_reason.trim(), userName, transfer.id]);

    const updated = updateRes.rows[0];

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'EXTENSION_REJECTED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: `Requested +${pendingMins} mins`,
      newValue: `Rejected (${transfer.delivery_minutes || 30} mins kept)`,
      reason: rejection_reason.trim(),
      details: `Extension of +${pendingMins}m rejected by ${userName}. Reason: ${rejection_reason.trim()}`,
      metadata: { requestedMinutes: pendingMins, rejectionReason: rejection_reason.trim() }
    });

    await createBranchNotification(client, {
      targetBranch: transfer.to_branch,
      message: `❌ Extension Rejected for Transfer #${transfer.transfer_id} by ${transfer.from_branch}. Reason: ${rejection_reason.trim()}`,
      type: 'INTERNAL_TRANSFER_EXTENSION_REJECTED'
    });

    await client.query('COMMIT');

    if (req.io) {
      req.io.emit('internal_transfer_extension_rejected', updated);
      req.io.emit('internal_transfer_updated', updated);
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error rejecting extension:', err);
    res.status(500).json({ error: err.message || 'Failed to reject extension' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/extension-modify - Requester modifies and approves the extension
router.put('/transfers/:id/extension-modify', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { modified_minutes, reason } = req.body;
    const modMins = parseInt(modified_minutes, 10);

    if (isNaN(modMins) || modMins <= 0) {
      return res.status(400).json({ error: 'Modified extension minutes must be greater than 0.' });
    }

    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;
    const isRequester = req.user.id && transfer.requested_by_user_id && Number(req.user.id) === Number(transfer.requested_by_user_id);
    const isFromBranch = userBranch && userBranch.toLowerCase() === (transfer.from_branch || '').toLowerCase();

    if (!superUser && !isRequester && !isFromBranch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized. Only requesting branch or original requester can modify time extensions.' });
    }

    if (transfer.extension_status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No pending extension request found to modify.' });
    }

    const currentMins = parseInt(transfer.delivery_minutes, 10) || 30;
    const newMins = currentMins + modMins;
    const baseMs = transfer.expected_delivery_at ? new Date(transfer.expected_delivery_at).getTime() : Date.now();
    const newExpected = new Date(Math.max(Date.now(), baseMs) + modMins * 60 * 1000);
    const userName = req.user.name || req.user.username || 'Requester Staff';
    const newNeededBy = newExpected.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const originalRequested = transfer.pending_extension_minutes || 0;

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET delivery_minutes = $1,
          expected_delivery_at = $2,
          needed_by_time = $3,
          extension_status = 'Modified & Approved',
          total_extended_minutes = COALESCE(total_extended_minutes, 0) + $4,
          extension_reviewed_by_name = $5,
          extension_reviewed_at = CURRENT_TIMESTAMP,
          pending_extension_minutes = NULL,
          pending_extension_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [newMins, newExpected, newNeededBy, modMins, userName, transfer.id]);

    const updated = updateRes.rows[0];

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'EXTENSION_MODIFIED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: `Requested +${originalRequested} mins`,
      newValue: `Approved +${modMins} mins (Total: ${newMins}m)`,
      reason: reason?.trim() || transfer.pending_extension_reason || 'Extension duration adjusted',
      details: `Extension modified from requested +${originalRequested}m to +${modMins}m and approved by ${userName}. Reason: ${reason?.trim() || 'N/A'}`,
      metadata: { originalRequested, approvedMinutes: modMins, totalMinutes: newMins }
    });

    await createBranchNotification(client, {
      targetBranch: transfer.to_branch,
      message: `✏️ Extension Modified & Approved for Transfer #${transfer.transfer_id}: +${modMins}m granted (requested +${originalRequested}m).`,
      type: 'INTERNAL_TRANSFER_EXTENSION_MODIFIED'
    });

    await client.query('COMMIT');

    if (req.io) {
      req.io.emit('internal_transfer_extension_modified', updated);
      req.io.emit('internal_transfer_updated', updated);
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error modifying extension:', err);
    res.status(500).json({ error: err.message || 'Failed to modify extension' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/modify-quantities - Supplying branch modifies item quantities
router.put('/transfers/:id/modify-quantities', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { items, general_reason } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Item quantities are required.' });
    }

    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized. Only supplying branch can modify quantities.' });
    }

    const changes = [];
    for (const item of items) {
      const confQty = parseFloat(item.confirmed_qty !== undefined ? item.confirmed_qty : item.sent_qty);
      if (isNaN(confQty) || confQty < 0) {
        throw new Error(`Confirmed quantity for item #${item.id} must be a valid non-negative number.`);
      }

      const itemRes = await client.query(`
        UPDATE internal_branch_transfer_items
        SET confirmed_qty = $1,
            sent_qty = $1,
            quantity_change_reason = COALESCE($2, quantity_change_reason)
        WHERE id = $3 AND transfer_id = $4
        RETURNING *
      `, [confQty, item.reason || general_reason || null, item.id, transfer.id]);

      if (itemRes.rows[0]) {
        changes.push(itemRes.rows[0]);
      }
    }

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'QUANTITY_MODIFIED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      reason: general_reason || 'Kitchen availability adjustments',
      details: `Item quantities modified by supplying branch. Reason: ${general_reason || 'Kitchen availability adjustments'}.`,
      metadata: { modifiedItems: changes }
    });

    await createBranchNotification(client, {
      targetBranch: transfer.from_branch,
      message: `📝 ${transfer.to_branch} updated item quantities for Request #${transfer.transfer_id}. Reason: ${general_reason || 'Stock availability adjustment'}.`,
      type: 'INTERNAL_TRANSFER_QTY_CHANGED'
    });

    await client.query('COMMIT');

    const updatedItems = await pool.query(`
      SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC
    `, [transfer.id]);

    const payload = {
      ...transfer,
      items: updatedItems.rows
    };

    if (req.io) {
      req.io.emit('internal_transfer_quantity_modified', payload);
    }

    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error modifying quantities:', err);
    res.status(500).json({ error: err.message || 'Failed to modify quantities' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/mark-ready - Supplying branch marks as Ready for Dispatch
router.put('/transfers/:id/mark-ready', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only staff from supplying branch "${transfer.to_branch}" can mark as ready.` });
    }

    const userName = req.user.name || req.user.username || 'Kitchen Staff';

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET status = 'Ready for Dispatch',
          ready_for_dispatch_at = CURRENT_TIMESTAMP,
          ready_by_name = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [userName, transfer.id]);

    const updated = updateRes.rows[0];

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'READY_FOR_DISPATCH',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: transfer.status,
      newValue: 'Ready for Dispatch',
      details: `Items prepared and marked Ready for Dispatch by ${userName}.`
    });

    await createBranchNotification(client, {
      targetBranch: transfer.from_branch,
      message: `📦 Request #${transfer.transfer_id} is packed & Ready for Dispatch at ${transfer.to_branch}!`,
      type: 'INTERNAL_TRANSFER_READY'
    });

    await client.query('COMMIT');

    const itemsRes = await pool.query(`SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC`, [transfer.id]);
    const payload = { ...updated, items: itemsRes.rows };

    if (req.io) {
      req.io.emit('internal_transfer_ready', payload);
    }

    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error marking ready for dispatch:', err);
    res.status(500).json({ error: err.message || 'Failed to mark ready for dispatch' });
  } finally {
    client.release();
  }
});

// PUT /api/internal-branch/transfers/:id/dispatch - Handover & Item-Wise Dispatch
router.put('/transfers/:id/dispatch', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { handover_by_name, handover_to_name, notes, items, additional_items } = req.body;

    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.to_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only staff from supplying branch "${transfer.to_branch}" can dispatch this transfer.` });
    }

    const dispatcherName = req.user.name || req.user.username || 'Kitchen Dispatcher';
    const hOverBy = handover_by_name?.trim() || dispatcherName;
    const hOverTo = handover_to_name?.trim() || 'Driver / Delivery Staff';

    let totalDispatchedCount = 0;
    let totalPendingDispatchCount = 0;

    // 1. Process regular accepted items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const itemRowRes = await client.query(`
          SELECT * FROM internal_branch_transfer_items WHERE id = $1 AND transfer_id = $2 FOR UPDATE
        `, [item.id, transfer.id]);

        if (itemRowRes.rows.length === 0) continue;
        const currentItem = itemRowRes.rows[0];

        // Do not dispatch rejected items
        if (currentItem.item_status === 'Rejected') {
          continue;
        }

        const acceptedQty = parseFloat(currentItem.accepted_qty !== null && currentItem.accepted_qty !== undefined ? currentItem.accepted_qty : (currentItem.confirmed_qty ?? currentItem.requested_qty ?? 0));
        const dispatchQty = parseFloat(item.dispatch_qty !== undefined ? item.dispatch_qty : (item.sent_qty !== undefined ? item.sent_qty : acceptedQty));

        if (item.mark_pending || isNaN(dispatchQty) || dispatchQty <= 0) {
          // Item marked as Pending Dispatch / Not Available
          totalPendingDispatchCount++;
          await client.query(`
            UPDATE internal_branch_transfer_items
            SET item_status = 'Pending Dispatch',
                dispatched_qty = 0,
                sent_qty = 0,
                pending_dispatch_qty = $1,
                pending_receive_qty = 0,
                remarks = COALESCE($2, remarks)
            WHERE id = $3 AND transfer_id = $4
          `, [acceptedQty, item.remarks || null, item.id, transfer.id]);
        } else {
          // Validate dispatch quantity cannot exceed accepted quantity
          if (dispatchQty > acceptedQty && !superUser) {
            throw new Error(`Dispatch quantity (${dispatchQty}) for "${currentItem.dish_name}" cannot exceed accepted quantity (${acceptedQty}).`);
          }

          const isPartial = dispatchQty < acceptedQty;
          const status = isPartial ? 'Partially Dispatched' : 'Dispatched';
          const pendingDisp = isPartial ? (acceptedQty - dispatchQty) : 0;
          totalDispatchedCount++;
          if (isPartial) totalPendingDispatchCount++;

          await client.query(`
            UPDATE internal_branch_transfer_items
            SET item_status = $1,
                dispatched_qty = $2,
                sent_qty = $2,
                pending_dispatch_qty = $3,
                pending_receive_qty = $2,
                remarks = COALESCE($4, remarks)
            WHERE id = $5 AND transfer_id = $6
          `, [status, dispatchQty, pendingDisp, item.remarks || null, item.id, transfer.id]);
        }
      }
    }

    // 2. Process Additional Items added during dispatch
    if (additional_items && Array.isArray(additional_items)) {
      for (const extra of additional_items) {
        const extraQty = parseFloat(extra.dispatch_qty || extra.qty || 0);
        if (extraQty > 0 && extra.dish_name) {
          totalDispatchedCount++;
          await client.query(`
            INSERT INTO internal_branch_transfer_items (
              transfer_id, item_id, dish_name, uom, requested_qty, accepted_qty, dispatched_qty, sent_qty, pending_receive_qty, item_status, is_additional, price, remarks, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $5, $5, $5, $5, 'Dispatched', TRUE, $6, $7, CURRENT_TIMESTAMP
            )
          `, [
            transfer.id,
            extra.item_id || null,
            extra.dish_name.trim(),
            extra.uom || 'Piece',
            extraQty,
            extra.price ? parseFloat(extra.price) : null,
            extra.remarks || 'Additional item added during dispatch'
          ]);
        }
      }
    }

    // 3. Determine Overall Transfer Status
    let finalTransferStatus = 'Dispatched';
    if (totalDispatchedCount === 0) {
      finalTransferStatus = 'In Progress';
    } else if (totalPendingDispatchCount > 0) {
      finalTransferStatus = 'Partially Dispatched';
    } else {
      finalTransferStatus = 'Dispatched';
    }

    const combinedNotes = notes 
      ? (transfer.notes ? `${transfer.notes}\n[Dispatch Notes]: ${notes.trim()}` : `[Dispatch Notes]: ${notes.trim()}`)
      : transfer.notes;

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET status = $1,
          dispatched_at = CURRENT_TIMESTAMP,
          dispatched_by_user_id = $2,
          dispatched_by_name = $3,
          handover_by_name = $4,
          handover_to_name = $5,
          notes = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [finalTransferStatus, req.user.id || null, dispatcherName, hOverBy, hOverTo, combinedNotes, transfer.id]);

    const updatedTransfer = updateRes.rows[0];

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'PARCEL_DISPATCHED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: transfer.status,
      newValue: finalTransferStatus,
      details: `Dispatched (${finalTransferStatus}) by "${hOverBy}" to "${hOverTo}". ${totalDispatchedCount} items dispatched, ${totalPendingDispatchCount} pending dispatch.`,
      metadata: { handoverBy: hOverBy, handoverTo: hOverTo, status: finalTransferStatus }
    });

    await createBranchNotification(client, {
      targetBranch: transfer.from_branch,
      message: `🚚 Request #${transfer.transfer_id} has been ${finalTransferStatus} by ${transfer.to_branch}! Handed over to ${hOverTo}.`,
      type: 'INTERNAL_TRANSFER_DISPATCHED'
    });

    await client.query('COMMIT');

    const updatedItems = await pool.query(`
      SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC
    `, [transfer.id]);

    const payload = {
      ...updatedTransfer,
      items: updatedItems.rows
    };

    if (req.io) {
      req.io.emit('internal_transfer_dispatched', payload);
      req.io.emit('internal_transfer_updated', payload);
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

// PUT /api/internal-branch/transfers/:id/receive - Requesting branch confirms receiving & verifies quantities item-wise
router.put('/transfers/:id/receive', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { items, discrepancy_reason, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Received items data is required.' });
    }

    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;

    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.from_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Unauthorized. Only staff from requesting branch "${transfer.from_branch}" can receive and verify this transfer.` });
    }

    const receiverName = req.user.name || req.user.username || 'Staff Receiver';
    let hasDiscrepancy = false;
    let anyReceived = false;
    let anyPending = false;
    let allReceived = true;
    let allRejected = true;
    const itemDiscrepancies = [];

    for (const item of items) {
      const itemRowRes = await client.query(`
        SELECT * FROM internal_branch_transfer_items WHERE id = $1 AND transfer_id = $2 FOR UPDATE
      `, [item.id, transfer.id]);

      if (itemRowRes.rows.length === 0) continue;
      const currentItem = itemRowRes.rows[0];

      // Dispatched quantity is base benchmark
      const baseDispatched = parseFloat(currentItem.dispatched_qty !== null && currentItem.dispatched_qty !== undefined ? currentItem.dispatched_qty : (currentItem.sent_qty || 0));

      if (baseDispatched <= 0) {
        // Skip items that were never dispatched
        continue;
      }

      if (item.is_rejected) {
        // Item rejected by receiving branch
        allReceived = false;
        hasDiscrepancy = true;
        const rejQty = parseFloat(item.rejected_qty !== undefined ? item.rejected_qty : baseDispatched);
        const reasonText = item.rejection_reason?.trim() || discrepancy_reason?.trim() || 'Damaged / rejected at receiving';

        itemDiscrepancies.push({
          dish_name: currentItem.dish_name,
          uom: currentItem.uom,
          dispatched_qty: baseDispatched,
          received_qty: 0,
          rejected_qty: rejQty,
          status: 'Rejected',
          reason: reasonText
        });

        await client.query(`
          UPDATE internal_branch_transfer_items
          SET item_status = 'Rejected',
              rejected_receive_qty = $1,
              received_qty = 0,
              pending_receive_qty = 0,
              variance_qty = -$1,
              receive_rejection_reason = $2,
              receive_rejected_by_name = $3,
              receive_rejected_at = CURRENT_TIMESTAMP,
              remarks = COALESCE($4, remarks)
          WHERE id = $5 AND transfer_id = $6
        `, [rejQty, reasonText, receiverName, item.remarks || null, item.id, transfer.id]);

      } else if (item.mark_pending) {
        // Item explicitly marked as Pending Receive (not yet arrived)
        allReceived = false;
        allRejected = false;
        anyPending = true;
        const recQty = parseFloat(item.received_qty) || 0;
        const pendingQty = Math.max(0, baseDispatched - recQty);

        if (recQty > 0) anyReceived = true;

        await client.query(`
          UPDATE internal_branch_transfer_items
          SET item_status = 'Pending Receive',
              received_qty = $1,
              pending_receive_qty = $2,
              variance_qty = -$2,
              remarks = COALESCE($3, remarks)
          WHERE id = $4 AND transfer_id = $5
        `, [recQty, pendingQty, item.remarks || null, item.id, transfer.id]);

      } else {
        // Normal receiving
        const recQty = parseFloat(item.received_qty);
        if (isNaN(recQty) || recQty < 0) {
          throw new Error(`Received quantity for "${currentItem.dish_name}" must be a non-negative number.`);
        }

        allRejected = false;
        if (recQty > 0) anyReceived = true;

        const variance = recQty - baseDispatched;
        if (Math.abs(variance) > 0.0001) {
          hasDiscrepancy = true;
          itemDiscrepancies.push({
            dish_name: currentItem.dish_name,
            uom: currentItem.uom,
            dispatched_qty: baseDispatched,
            received_qty: recQty,
            variance_qty: variance
          });
        }

        const isFullyRec = recQty >= baseDispatched;
        if (!isFullyRec) {
          allReceived = false;
          anyPending = true;
        }

        const itemStatus = isFullyRec ? 'Fully Received' : (recQty > 0 ? 'Partially Received' : 'Pending Receive');
        const pendingQty = Math.max(0, baseDispatched - recQty);

        await client.query(`
          UPDATE internal_branch_transfer_items
          SET item_status = $1,
              received_qty = $2,
              variance_qty = $3,
              pending_receive_qty = $4,
              remarks = COALESCE($5, remarks)
          WHERE id = $6 AND transfer_id = $7
        `, [itemStatus, recQty, variance, pendingQty, item.remarks || null, item.id, transfer.id]);
      }
    }

    if (hasDiscrepancy && (!discrepancy_reason || !discrepancy_reason.trim())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Discrepancy or rejection detected. A clear reason for the variance is mandatory.' });
    }

    // Determine final transfer status
    let finalTransferStatus = 'Received';
    if (allRejected) {
      finalTransferStatus = 'Rejected';
    } else if (anyPending || !allReceived || hasDiscrepancy) {
      finalTransferStatus = 'Partially Received';
    } else {
      finalTransferStatus = 'Received';
    }

    const combinedNotes = notes 
      ? (transfer.notes ? `${transfer.notes}\n[Receiving Notes]: ${notes.trim()}` : `[Receiving Notes]: ${notes.trim()}`)
      : transfer.notes;

    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET status = $1,
          received_at = CURRENT_TIMESTAMP,
          received_by_user_id = $2,
          received_by_name = $3,
          discrepancy_reason = $4,
          notes = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [
      finalTransferStatus,
      req.user.id || null,
      receiverName,
      discrepancy_reason ? discrepancy_reason.trim() : null,
      combinedNotes,
      transfer.id
    ]);

    const updatedTransfer = updateRes.rows[0];

    const discrepancySummary = hasDiscrepancy
      ? itemDiscrepancies.map(d => `${d.dish_name}: sent ${d.dispatched_qty} ${d.uom}, received ${d.received_qty} ${d.uom} (${d.status || (d.variance_qty < 0 ? 'Shortage ' + d.variance_qty : 'Excess +' + d.variance_qty)})`).join('; ')
      : 'All dispatched item quantities verified matching.';

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'PARCEL_RECEIVED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: transfer.status,
      newValue: finalTransferStatus,
      reason: discrepancy_reason || null,
      details: `Received by ${receiverName}. Status: ${finalTransferStatus}. ${discrepancySummary}`,
      metadata: { status: finalTransferStatus, discrepancies: itemDiscrepancies, reason: discrepancy_reason }
    });

    await createBranchNotification(client, {
      targetBranch: transfer.to_branch,
      message: `✅ Request #${transfer.transfer_id} received by ${transfer.from_branch} (${finalTransferStatus}). ${discrepancySummary}`,
      type: 'INTERNAL_TRANSFER_RECEIVED'
    });

    await client.query('COMMIT');

    const updatedItems = await pool.query(`
      SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC
    `, [transfer.id]);

    const payload = {
      ...updatedTransfer,
      items: updatedItems.rows
    };

    if (req.io) {
      req.io.emit('internal_transfer_received', payload);
      req.io.emit('internal_transfer_updated', payload);
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

// PUT /api/internal-branch/transfers/:id/complete - Mark transfer as Completed
router.put('/transfers/:id/complete', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];
    const updateRes = await client.query(`
      UPDATE internal_branch_transfers
      SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [transfer.id]);

    const updated = updateRes.rows[0];

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'TRANSFER_COMPLETED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: transfer.status,
      newValue: 'Completed',
      details: `Transfer marked as Completed.`
    });

    await client.query('COMMIT');

    if (req.io) {
      req.io.emit('internal_transfer_completed', updated);
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error completing transfer:', err);
    res.status(500).json({ error: 'Failed to complete transfer' });
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

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'TRANSFER_CANCELLED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: transfer.status,
      newValue: 'Cancelled',
      reason: reason || 'N/A',
      details: `Transfer cancelled. Reason: ${reason || 'N/A'}`
    });

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

// PUT /api/internal-branch/transfers/:id/edit-request - Requesting branch modifies items, quantities, or details before dispatch
router.put('/transfers/:id/edit-request', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { items, priority, delivery_minutes, needed_by_time, notes, reason } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one dish or item is required.' });
    }

    // Validate items
    for (const [idx, item] of items.entries()) {
      if (!item.dish_name || !item.dish_name.trim()) {
        return res.status(400).json({ error: `Dish name is required for row #${idx + 1}.` });
      }
      const qty = parseFloat(item.requested_qty);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `Quantity for "${item.dish_name}" must be a positive number.` });
      }
      if (!item.uom) {
        return res.status(400).json({ error: `Unit of Measurement is required for "${item.dish_name}".` });
      }
    }

    await client.query('BEGIN');

    const tRes = await client.query(`SELECT * FROM internal_branch_transfers WHERE id = $1 FOR UPDATE`, [id]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = tRes.rows[0];

    // Cannot modify if already dispatched, completed, or cancelled
    if (['Dispatched', 'In-Transit', 'Partially Received', 'Fully Received', 'Completed', 'Cancelled'].includes(transfer.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot modify transfer in '${transfer.status}' status. Only Pending or In Progress requests can be modified.` });
    }

    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;
    if (!superUser && userBranch && userBranch !== 'All' && userBranch !== transfer.from_branch) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized. Only the originating requesting branch can modify this request.' });
    }

    // Retrieve previous items for audit log
    const prevItemsRes = await client.query(`SELECT * FROM internal_branch_transfer_items WHERE transfer_id = $1 ORDER BY id ASC`, [transfer.id]);
    const prevItems = prevItemsRes.rows;

    // Remove existing items and insert updated items
    await client.query(`DELETE FROM internal_branch_transfer_items WHERE transfer_id = $1`, [transfer.id]);

    const insertedItems = [];
    for (const item of items) {
      const itemSku = (item.sku && String(item.sku).trim()) || (item.short_code && String(item.short_code).trim()) || (item.item_id ? `SKU-${item.item_id}` : null);
      const itemBarcode = (item.barcode && String(item.barcode).trim()) || null;
      const reqQty = parseFloat(item.requested_qty);

      const itemRes = await client.query(`
        INSERT INTO internal_branch_transfer_items (
          transfer_id, item_id, dish_name, uom, requested_qty, confirmed_qty, remarks, image_url, price, sku, barcode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        transfer.id,
        item.item_id || null,
        item.dish_name.trim(),
        item.uom.trim(),
        reqQty,
        reqQty,
        item.remarks ? item.remarks.trim() : null,
        item.image_url || null,
        item.price ? parseFloat(item.price) : null,
        itemSku,
        itemBarcode
      ]);
      insertedItems.push(itemRes.rows[0]);
    }

    // Update transfer metadata
    const finalPriority = priority || transfer.priority || 'Normal';
    const finalDeliveryMins = delivery_minutes !== undefined ? (parseInt(delivery_minutes, 10) || 30) : transfer.delivery_minutes;
    const finalNeededBy = needed_by_time || (delivery_minutes ? `${finalDeliveryMins} mins` : transfer.needed_by_time);
    const finalNotes = notes !== undefined ? notes : transfer.notes;

    const updateTransferRes = await client.query(`
      UPDATE internal_branch_transfers
      SET priority = $1,
          delivery_minutes = $2,
          needed_by_time = $3,
          notes = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [finalPriority, finalDeliveryMins, finalNeededBy, finalNotes, transfer.id]);

    const updatedTransfer = updateTransferRes.rows[0];

    // Audit log
    const prevSummary = prevItems.map(p => `${p.dish_name} (${p.requested_qty} ${p.uom})`).join(', ');
    const newSummary = insertedItems.map(n => `${n.dish_name} (${n.requested_qty} ${n.uom})`).join(', ');

    await logTransferActivity(client, {
      transferId: transfer.id,
      action: 'REQUEST_MODIFIED',
      fromBranch: transfer.from_branch,
      toBranch: transfer.to_branch,
      user: req.user,
      userRole: req.user.role,
      previousValue: prevSummary,
      newValue: newSummary,
      reason: reason || 'Items / quantities adjusted by requesting branch',
      details: `Request items updated. Prev: [${prevSummary}] ➔ New: [${newSummary}]. Reason: ${reason || 'N/A'}`,
      metadata: { previousItems: prevItems, updatedItems: insertedItems }
    });

    // Notify supplying branch
    await createBranchNotification(client, {
      targetBranch: transfer.to_branch,
      message: `✏️ Transfer Request #${transfer.transfer_id} items were updated by ${transfer.from_branch}. Reason: ${reason || 'Quantity adjustment'}.`,
      type: 'INTERNAL_TRANSFER_REQUEST_MODIFIED'
    });

    await client.query('COMMIT');

    const responsePayload = {
      ...updatedTransfer,
      items: insertedItems
    };

    if (req.io) {
      req.io.emit('internal_transfer_updated', responsePayload);
      req.io.emit('internal_transfer_request_modified', responsePayload);
    }

    res.json(responsePayload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error modifying transfer request:', err);
    res.status(500).json({ error: err.message || 'Failed to modify transfer request' });
  } finally {
    client.release();
  }
});

// GET /api/internal-branch/stats - Summary counts for badges and overview
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const superUser = isSuperUser(req.user);
    const userBranch = req.user.branch;
    const filterBranch = (req.query.branch && req.query.branch !== 'All') ? req.query.branch : null;
    const targetBranch = filterBranch || (!superUser && userBranch && userBranch !== 'All' ? userBranch : null);

    let branchClause = '';
    const params = [];

    if (targetBranch) {
      params.push(targetBranch);
      params.push(targetBranch);
      branchClause = ` AND (from_branch = $1 OR to_branch = $2)`;
    }

    const countsRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'Pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'Ready for Dispatch') as ready_count,
        COUNT(*) FILTER (WHERE status IN ('Dispatched', 'In-Transit')) as dispatched_count,
        COUNT(*) FILTER (WHERE status = 'Partially Received') as partially_received_count,
        COUNT(*) FILTER (WHERE status = 'Fully Received') as fully_received_count,
        COUNT(*) FILTER (WHERE status = 'Completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'Cancelled') as cancelled_count
      FROM internal_branch_transfers
      WHERE 1=1 ${branchClause}
    `, params);

    // Incoming active count for badge (Pending + In Progress + Ready for Dispatch where to_branch = targetBranch and from_branch != targetBranch)
    let incomingPendingCount = 0;
    if (targetBranch) {
      const incRes = await pool.query(`
        SELECT COUNT(*) as count FROM internal_branch_transfers
        WHERE to_branch = $1 AND from_branch != $1 AND status IN ('Pending', 'In Progress', 'Ready for Dispatch')
      `, [targetBranch]);
      incomingPendingCount = parseInt(incRes.rows[0]?.count || 0, 10);
    } else {
      incomingPendingCount = parseInt(countsRes.rows[0]?.pending_count || 0, 10) + parseInt(countsRes.rows[0]?.in_progress_count || 0, 10);
    }

    // Pending receivals count for badge (Dispatched where from_branch = targetBranch)
    let pendingReceivalsCount = 0;
    if (targetBranch) {
      const recRes = await pool.query(`
        SELECT COUNT(*) as count FROM internal_branch_transfers
        WHERE from_branch = $1 AND status IN ('Dispatched', 'In-Transit', 'Ready for Dispatch')
      `, [targetBranch]);
      pendingReceivalsCount = parseInt(recRes.rows[0]?.count || 0, 10);
    } else {
      pendingReceivalsCount = parseInt(countsRes.rows[0]?.dispatched_count || 0, 10);
    }

    // Sent active count for badge (Orders sent by active branch that are active until completed)
    let sentActiveCount = 0;
    if (targetBranch) {
      const sentRes = await pool.query(`
        SELECT COUNT(*) as count FROM internal_branch_transfers
        WHERE from_branch = $1 AND status NOT IN ('Completed', 'Cancelled')
      `, [targetBranch]);
      sentActiveCount = parseInt(sentRes.rows[0]?.count || 0, 10);
    } else {
      const sentRes = await pool.query(`
        SELECT COUNT(*) as count FROM internal_branch_transfers
        WHERE status NOT IN ('Completed', 'Cancelled')
      `);
      sentActiveCount = parseInt(sentRes.rows[0]?.count || 0, 10);
    }

    res.json({
      ...countsRes.rows[0],
      incoming_pending_count: incomingPendingCount,
      pending_receivals_count: pendingReceivalsCount,
      sent_active_count: sentActiveCount
    });
  } catch (err) {
    console.error('Error fetching transfer stats:', err);
    res.json({
      pending_count: 0,
      in_progress_count: 0,
      ready_count: 0,
      dispatched_count: 0,
      partially_received_count: 0,
      fully_received_count: 0,
      completed_count: 0,
      cancelled_count: 0,
      incoming_pending_count: 0,
      pending_receivals_count: 0
    });
  }
});

module.exports = router;
