const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { requireStoreRoles, enforceBranchAccess, resolveBranchStoreId, isTodayOrYesterday, isOperationalStoreRole, getRole } = require('../../middleware/storeAuth');
const { recordActivityLog } = require('../activityLogs');

// Helper to generate unique entry number (e.g. ENT-20261117-001)
async function generateEntryNumber(client) {
  const queryFn = client ? client.query.bind(client) : pool.query.bind(pool);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ENT-${dateStr}-`;

  const res = await queryFn(
    `SELECT entry_number FROM store_stock_entries 
     WHERE entry_number LIKE $1 
     ORDER BY entry_number DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let seq = 1;
  if (res.rows.length > 0) {
    const lastNum = parseInt(res.rows[0].entry_number.split('-')[2], 10);
    seq = lastNum + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// -------------------------------------------------------------
// GET /api/store/entries/sheet-data (Get counting sheet with previous stock)
// -------------------------------------------------------------
router.get('/sheet-data', authenticateToken, requireStoreRoles(['admin', 'developer', 'store man', 'data entry']), async (req, res) => {
  const { store_id, branch, entry_date, shift } = req.query;

  if ((!store_id || store_id === 'All' || store_id === 'undefined') && (!branch || branch === 'All')) {
    return res.status(400).json({ error: 'A specific branch (Branch 1, Branch 2, or Branch 3), entry date, and shift are required' });
  }
  if (!entry_date || !shift) {
    return res.status(400).json({ error: 'Entry date and shift are required' });
  }

  let parsedStoreId = store_id && store_id !== 'All' && store_id !== 'undefined' ? parseInt(store_id, 10) : null;
  if (!parsedStoreId || isNaN(parsedStoreId)) {
    parsedStoreId = await resolveBranchStoreId(pool, branch);
  }
  if (!parsedStoreId) {
    return res.status(400).json({ error: 'Invalid branch or store location ID' });
  }

  try {
    const access = await enforceBranchAccess(req, res, { branch, store_id: parsedStoreId });
    if (!access.ok) return;
    const storeLocRes = await pool.query('SELECT * FROM store_locations WHERE id = $1', [parsedStoreId]);
    if (storeLocRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store location not found' });
    }
    const store = storeLocRes.rows[0];

    // 1. Check if an existing entry already exists for this date and shift
    const existingEntryRes = await pool.query(`
      SELECT * FROM store_stock_entries 
      WHERE store_id = $1 AND entry_date = $2 AND shift = $3
    `, [parsedStoreId, entry_date, shift]);

    let existingEntry = existingEntryRes.rows[0] || null;
    let savedItemsMap = {};

    if (existingEntry) {
      const itemsRes = await pool.query(`
        SELECT sei.*, si.name as item_name, si.item_code, sc.name as category_name
        FROM store_stock_entry_items sei
        JOIN store_items si ON sei.item_id = si.id
        LEFT JOIN store_categories sc ON si.category_id = sc.id
        WHERE sei.entry_id = $1
      `, [existingEntry.id]);

      itemsRes.rows.forEach(row => {
        savedItemsMap[row.item_id] = row;
      });
    }

    // 2. Query all active store items
    const allItemsRes = await pool.query(`
      SELECT 
        si.id as item_id,
        si.name as item_name,
        si.arabic_name,
        si.item_code,
        si.primary_unit as unit,
        si.min_stock_level,
        si.last_purchase_price,
        sc.name as category_name,
        sc.icon as category_icon,
        COALESCE(inv.current_stock, 0) as current_inv_stock
      FROM store_items si
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      LEFT JOIN store_inventory inv ON (inv.item_id = si.id AND inv.store_id = $1)
      WHERE si.status = 'Active'
      ORDER BY sc.sort_order ASC, si.name ASC
    `, [parsedStoreId]);

    // 3. For each item, resolve Previous Stock from last valid closing
    // If Day shift: previous is yesterday Night shift or last submitted entry
    // If Night shift: previous is today Day shift
    const sheetItems = [];

    for (const item of allItemsRes.rows) {
      if (savedItemsMap[item.item_id]) {
        // Use saved values from draft or submitted entry
        const saved = savedItemsMap[item.item_id];
        const prev = parseFloat(saved.previous_stock) || 0;
        const recv = parseFloat(saved.received_stock) || 0;
        const handover = parseFloat(saved.handover_stock ?? saved.calculated_consumption) || 0;
        const totalAvail = prev + recv;
        const remaining = Math.max(0, totalAvail - handover);
        const excess = Math.max(0, handover - totalAvail);

        sheetItems.push({
          item_id: item.item_id,
          item_name: item.item_name,
          arabic_name: item.arabic_name,
          item_code: item.item_code,
          unit: saved.unit || item.unit,
          category_name: item.category_name,
          category_icon: item.category_icon,
          previous_stock: prev,
          received_stock: recv,
          purchased_received: recv,
          handover_stock: handover,
          in_hand_stock: remaining,
          calculated_consumption: handover,
          excess_consumption: excess,
          unit_cost: parseFloat(saved.unit_cost || item.last_purchase_price) || 0,
          notes: saved.notes || ''
        });
      } else {
        // Check if any purchase deliveries occurred on this date for this item
        const purRes = await pool.query(`
          SELECT COALESCE(SUM(pi.quantity), 0) as total_received
          FROM store_purchase_items pi
          JOIN store_purchases p ON pi.purchase_id = p.id
          WHERE p.store_id = $1 AND pi.item_id = $2 AND p.invoice_date = $3 AND p.status = 'Received'
        `, [parsedStoreId, item.item_id, entry_date]);

        const autoReceived = parseFloat(purRes.rows[0]?.total_received) || 0;

        // Resolve last closing/remaining stock
        let prevStock = 0;

        // Subquery: find remaining stock from last submitted entry for this store & item
        const lastEntryRes = await pool.query(`
          SELECT sei.in_hand_stock 
          FROM store_stock_entry_items sei
          JOIN store_stock_entries se ON sei.entry_id = se.id
          WHERE se.store_id = $1 
            AND sei.item_id = $2 
            AND se.status = 'Submitted'
            AND (se.entry_date < $3 OR (se.entry_date = $3 AND se.shift = 'Day' AND $4 = 'Night'))
          ORDER BY se.entry_date DESC, (CASE WHEN se.shift = 'Night' THEN 2 ELSE 1 END) DESC
          LIMIT 1
        `, [parsedStoreId, item.item_id, entry_date, shift]);

        if (lastEntryRes.rows.length > 0) {
          prevStock = parseFloat(lastEntryRes.rows[0].in_hand_stock) || 0;
        } else {
          // Fallback to current inventory stock MINUS today's purchase receipts so purchases are never counted twice
          prevStock = Math.max(0, (parseFloat(item.current_inv_stock) || 0) - autoReceived);
        }

        // Handover is NEVER autofilled — starts empty ('') for manual entry
        sheetItems.push({
          item_id: item.item_id,
          item_name: item.item_name,
          arabic_name: item.arabic_name,
          item_code: item.item_code,
          unit: item.unit,
          category_name: item.category_name,
          category_icon: item.category_icon,
          previous_stock: prevStock,
          received_stock: autoReceived,
          purchased_received: autoReceived,
          handover_stock: '',
          in_hand_stock: prevStock + autoReceived,
          calculated_consumption: 0,
          excess_consumption: 0,
          unit_cost: parseFloat(item.last_purchase_price) || 0,
          notes: ''
        });
      }
    }

    res.json({
      store,
      entry: existingEntry,
      is_submitted: existingEntry?.status === 'Submitted',
      items: sheetItems
    });
  } catch (err) {
    console.error('Error fetching sheet data:', err);
    res.status(500).json({ error: 'Failed to fetch sheet data: ' + err.message });
  }
});

// -------------------------------------------------------------
// POST /api/store/entries/save (Save Draft or Submit Shift)
// -------------------------------------------------------------
router.post('/save', authenticateToken, requireStoreRoles(['admin', 'developer', 'store man', 'data entry']), async (req, res) => {
  const { store_id: rawStoreId, branch, entry_date, shift, action, items, notes } = req.body;

  if ((!rawStoreId && (!branch || branch === 'All')) || !entry_date || !shift) {
    return res.status(400).json({ error: 'Branch, entry date, and shift are required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item row is required' });
  }

  const store_id = rawStoreId && rawStoreId !== 'All' ? parseInt(rawStoreId, 10) : await resolveBranchStoreId(pool, branch);
  if (!store_id) {
    return res.status(400).json({ error: 'Valid branch (Branch 1, Branch 2, or Branch 3) is required' });
  }

  const access = await enforceBranchAccess(req, res, { branch, store_id });
  if (!access.ok) return;

  const role = getRole(req);
  if (isOperationalStoreRole(role) && !isTodayOrYesterday(entry_date)) {
    return res.status(403).json({
      error: 'Entries older than yesterday are read-only for your role. You can only edit or submit today\'s and yesterday\'s entries.'
    });
  }

  const isSubmit = action?.toString().toUpperCase() === 'SUBMIT';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check existing entry
    const existingCheck = await client.query(`
      SELECT * FROM store_stock_entries 
      WHERE store_id = $1 AND entry_date = $2 AND shift = $3
      FOR UPDATE
    `, [store_id, entry_date, shift]);

    let entry = existingCheck.rows[0];

    if (entry && entry.status === 'Submitted' && isSubmit) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This shift has already been submitted and finalized.' });
    }

    const userName = req.user?.username || req.user?.name || 'Store Staff';
    const finalBranch = branch || req.user?.branch || 'Branch 1';

    let totalConsumptionVal = 0;

    if (!entry) {
      const entryNum = await generateEntryNumber(client);
      const insRes = await client.query(`
        INSERT INTO store_stock_entries (
          entry_number, store_id, branch, entry_date, shift, status,
          submitted_by_user_id, submitted_by_name, submitted_at, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        entryNum, store_id, finalBranch, entry_date, shift,
        isSubmit ? 'Submitted' : 'Draft',
        req.user?.id || null, userName,
        isSubmit ? new Date() : null,
        notes || null
      ]);
      entry = insRes.rows[0];
    } else {
      const updRes = await client.query(`
        UPDATE store_stock_entries
        SET status = $1,
            submitted_by_user_id = CASE WHEN $2 = 'Submitted' THEN $3 ELSE submitted_by_user_id END,
            submitted_by_name = CASE WHEN $2 = 'Submitted' THEN $4 ELSE submitted_by_name END,
            submitted_at = CASE WHEN $2 = 'Submitted' THEN NOW() ELSE submitted_at END,
            notes = COALESCE($5, notes),
            updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `, [
        isSubmit ? 'Submitted' : 'Draft',
        isSubmit ? 'Submitted' : 'Draft',
        req.user?.id || null, userName,
        notes || null,
        entry.id
      ]);
      entry = updRes.rows[0];
    }

    // 2. Clear old items for this entry
    await client.query('DELETE FROM store_stock_entry_items WHERE entry_id = $1', [entry.id]);

    // 3. Insert fresh items and calculate remaining / consumed stock
    for (const it of items) {
      const prev = Math.max(0, parseFloat(it.previous_stock) || 0);
      const recv = Math.max(0, parseFloat(it.received_stock) || 0);
      const totalAvailable = prev + recv;
      const handover = Math.max(0, parseFloat(it.handover_stock !== undefined && it.handover_stock !== '' ? it.handover_stock : it.calculated_consumption) || 0);

      // Remaining Stock = Total Available - Handover (never negative)
      const inHand = Math.max(0, totalAvailable - handover);
      const consumption = handover;
      const excessConsumption = Math.max(0, handover - totalAvailable);
      const unitCost = parseFloat(it.unit_cost) || 0;
      const totalCost = Math.round(consumption * unitCost * 100) / 100;
      totalConsumptionVal += totalCost;

      await client.query(`
        INSERT INTO store_stock_entry_items (
          entry_id, item_id, unit, previous_stock, received_stock,
          in_hand_stock, calculated_consumption, handover_stock, excess_consumption, unit_cost, total_cost, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        entry.id, it.item_id, it.unit || 'KG',
        prev, recv, inHand, consumption, handover, excessConsumption, unitCost, totalCost, it.notes || null
      ]);

      // If SUBMITTING, atomically update store_inventory and write audit history
      if (isSubmit) {
        // Fetch current stock before update
        const curInvRes = await client.query(`
          SELECT current_stock FROM store_inventory WHERE store_id = $1 AND item_id = $2
        `, [store_id, it.item_id]);
        const stockBefore = curInvRes.rows.length > 0 ? parseFloat(curInvRes.rows[0].current_stock) : 0;

        await client.query(`
          INSERT INTO store_inventory (
            store_id, item_id, current_stock, last_closing_stock,
            last_received_stock, last_consumption, last_entry_date, last_entry_shift, updated_at
          ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (store_id, item_id) DO UPDATE
          SET current_stock = EXCLUDED.current_stock,
              last_closing_stock = EXCLUDED.last_closing_stock,
              last_received_stock = EXCLUDED.last_received_stock,
              last_consumption = EXCLUDED.last_consumption,
              last_entry_date = EXCLUDED.last_entry_date,
              last_entry_shift = EXCLUDED.last_entry_shift,
              updated_at = NOW()
        `, [
          store_id, it.item_id, inHand, recv, consumption, entry_date, shift
        ]);

        // Write to store_stock_history
        if (consumption > 0 || Math.abs(inHand - stockBefore) > 0.0001) {
          await client.query(`
            INSERT INTO store_stock_history (
              store_id, item_id, movement_type, reference_id, quantity_change,
              stock_before, stock_after, unit_price, total_value, performed_by_name, reason
            ) VALUES ($1, $2, 'SHIFT_CONSUMPTION', $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            store_id, it.item_id, entry.entry_number,
            -consumption, stockBefore, inHand,
            unitCost, totalCost, userName,
            `Shift ${shift} consumption submission (${entry_date})`
          ]);
        }
      }
    }

    // Update totals on entry
    await client.query(`
      UPDATE store_stock_entries
      SET total_items = $1,
          total_consumption_value = $2
      WHERE id = $3
    `, [items.length, totalConsumptionVal, entry.id]);

    await recordActivityLog(client, {
      module: 'Store',
      action: isSubmit ? 'STOCK_ENTRY_SUBMITTED' : 'STOCK_ENTRY_DRAFT_SAVED',
      entity_id: entry.id,
      entity_name: entry.entry_number,
      description: `${isSubmit ? 'Submitted' : 'Saved draft'} stock entry ${entry.entry_number} (${entry_date} ${shift})`,
      new_data: { store_id, branch: finalBranch, total_items: items.length, total_consumption_value: totalConsumptionVal },
      performed_by: userName,
      branch: finalBranch
    });

    await client.query('COMMIT');
    res.json({
      success: true,
      message: isSubmit ? 'Shift entry successfully submitted and stock updated.' : 'Draft saved successfully.',
      entry_id: entry.id,
      status: isSubmit ? 'Submitted' : 'Draft'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving shift entry:', err);
    res.status(500).json({ error: 'Failed to save shift entry: ' + err.message });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// GET /api/store/entries/history (List past submissions)
// -------------------------------------------------------------
router.get('/history', authenticateToken, requireStoreRoles(['admin', 'developer', 'management', 'management store', 'store man', 'data entry']), async (req, res) => {
  try {
    const { store_id, branch, from_date, to_date, status, shift } = req.query;
    const access = await enforceBranchAccess(req, res, { branch, store_id });
    if (!access.ok) return;

    let query = `
      SELECT 
        se.*,
        sl.name as store_name,
        sl.branch as store_branch
      FROM store_stock_entries se
      JOIN store_locations sl ON se.store_id = sl.id
      WHERE 1=1
    `;
    const params = [];

    if (access.allowedBranches) {
      params.push(access.allowedBranches);
      query += ` AND sl.branch = ANY($${params.length})`;
    }

    if (store_id && store_id !== 'All') {
      params.push(parseInt(store_id, 10));
      query += ` AND se.store_id = $${params.length}`;
    }

    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND se.branch = $${params.length}`;
    }

    if (shift && shift !== 'All') {
      params.push(shift);
      query += ` AND se.shift = $${params.length}`;
    }

    if (status && status !== 'All') {
      params.push(status);
      query += ` AND se.status = $${params.length}`;
    }

    if (from_date) {
      params.push(from_date);
      query += ` AND se.entry_date >= $${params.length}`;
    }

    if (to_date) {
      params.push(to_date);
      query += ` AND se.entry_date <= $${params.length}`;
    }

    query += ' ORDER BY se.entry_date DESC, (CASE WHEN se.shift = \'Night\' THEN 2 ELSE 1 END) DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching entries history:', err);
    res.status(500).json({ error: 'Failed to fetch entries history' });
  }
});

// -------------------------------------------------------------
// GET /api/store/entries/:id (Detail view of single entry)
// -------------------------------------------------------------
router.get('/:id', authenticateToken, requireStoreRoles(['admin', 'developer', 'management', 'management store', 'store man', 'data entry']), async (req, res) => {
  const { id } = req.params;
  try {
    const entryRes = await pool.query(`
      SELECT se.*, sl.name as store_name, sl.branch as store_branch
      FROM store_stock_entries se
      JOIN store_locations sl ON se.store_id = sl.id
      WHERE se.id = $1
    `, [id]);

    if (entryRes.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const access = await enforceBranchAccess(req, res, { branch: entryRes.rows[0].store_branch, store_id: entryRes.rows[0].store_id });
    if (!access.ok) return;

    const itemsRes = await pool.query(`
      SELECT 
        sei.*,
        si.name as item_name,
        si.arabic_name,
        si.item_code,
        sc.name as category_name
      FROM store_stock_entry_items sei
      JOIN store_items si ON sei.item_id = si.id
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      WHERE sei.entry_id = $1
      ORDER BY sc.sort_order ASC, si.name ASC
    `, [id]);

    res.json({
      entry: entryRes.rows[0],
      items: itemsRes.rows
    });
  } catch (err) {
    console.error('Error fetching entry details:', err);
    res.status(500).json({ error: 'Failed to fetch entry details' });
  }
});

// -------------------------------------------------------------
// POST /api/store/entries/:id/reopen (Admin / Manager Reopen with Audit Reason)
// -------------------------------------------------------------
router.post('/:id/reopen', authenticateToken, requireStoreRoles(['admin', 'developer', 'store man', 'data entry']), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory reason is required to reopen a finalized shift' });
  }

  const userName = req.user?.username || req.user?.name || 'Staff';
  const role = getRole(req);

  try {
    const existingRes = await pool.query(
      'SELECT se.*, sl.branch as store_branch FROM store_stock_entries se JOIN store_locations sl ON se.store_id = sl.id WHERE se.id = $1',
      [id]
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    const existing = existingRes.rows[0];

    const access = await enforceBranchAccess(req, res, { branch: existing.store_branch, store_id: existing.store_id });
    if (!access.ok) return;

    if (isOperationalStoreRole(role) && !isTodayOrYesterday(existing.entry_date)) {
      return res.status(403).json({
        error: 'You can only reopen today\'s and yesterday\'s entries. Entries older than yesterday are read-only.'
      });
    }

    if (existing.status !== 'Submitted') {
      return res.status(400).json({ error: 'Entry is not in Submitted status' });
    }

    const result = await pool.query(`
      UPDATE store_stock_entries
      SET status = 'Reopened',
          reopened_by_name = $1,
          reopened_at = NOW(),
          reopen_reason = $2,
          updated_at = NOW()
      WHERE id = $3 AND status = 'Submitted'
      RETURNING *
    `, [userName, reason.trim(), id]);

    await recordActivityLog(pool, {
      module: 'Store',
      action: 'STOCK_ENTRY_REOPENED',
      entity_id: id,
      entity_name: existing.entry_number,
      description: `Reopened stock entry ${existing.entry_number} (${existing.entry_date} ${existing.shift})`,
      reason: reason.trim(),
      performed_by: userName,
      branch: existing.store_branch
    });

    res.json({
      success: true,
      message: 'Shift entry reopened for corrections.',
      entry: result.rows[0]
    });
  } catch (err) {
    console.error('Error reopening entry:', err);
    res.status(500).json({ error: 'Failed to reopen entry' });
  }
});

module.exports = router;
