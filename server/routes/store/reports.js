const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { requireStoreRoles, enforceBranchAccess } = require('../../middleware/storeAuth');

// -------------------------------------------------------------
// GET /api/store/reports/consumption (Shift & Date-wise Consumption)
// -------------------------------------------------------------
router.get('/consumption', authenticateToken, requireStoreRoles(['admin', 'developer', 'management', 'management store']), async (req, res) => {
  try {
    const { store_id, branch, from_date, to_date, shift, category_id } = req.query;
    const access = await enforceBranchAccess(req, res, { branch, store_id });
    if (!access.ok) return;

    let query = `
      SELECT 
        se.entry_date,
        se.shift,
        se.branch,
        sl.name as store_name,
        si.name as item_name,
        si.arabic_name,
        si.item_code,
        sc.name as category_name,
        sei.unit,
        sei.previous_stock,
        sei.received_stock,
        sei.in_hand_stock,
        sei.calculated_consumption,
        sei.unit_cost,
        sei.total_cost
      FROM store_stock_entry_items sei
      JOIN store_stock_entries se ON sei.entry_id = se.id
      JOIN store_items si ON sei.item_id = si.id
      JOIN store_locations sl ON se.store_id = sl.id
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      WHERE se.status = 'Submitted'
    `;
    const params = [];

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

    if (category_id && category_id !== 'All') {
      params.push(parseInt(category_id, 10));
      query += ` AND si.category_id = $${params.length}`;
    }

    if (from_date) {
      params.push(from_date);
      query += ` AND se.entry_date >= $${params.length}`;
    }

    if (to_date) {
      params.push(to_date);
      query += ` AND se.entry_date <= $${params.length}`;
    }

    query += ' ORDER BY se.entry_date DESC, (CASE WHEN se.shift = \'Night\' THEN 2 ELSE 1 END) DESC, si.name ASC';
    const result = await pool.query(query, params);

    // Summary calculations
    let totalQtyConsumed = 0;
    let totalValConsumed = 0;
    result.rows.forEach(r => {
      totalQtyConsumed += parseFloat(r.calculated_consumption) || 0;
      totalValConsumed += parseFloat(r.total_cost) || 0;
    });

    res.json({
      summary: {
        total_records: result.rows.length,
        total_consumption_quantity: Math.round(totalQtyConsumed * 1000) / 1000,
        total_consumption_value: Math.round(totalValConsumed * 100) / 100
      },
      records: result.rows
    });
  } catch (err) {
    console.error('Error fetching consumption report:', err);
    res.status(500).json({ error: 'Failed to fetch consumption report' });
  }
});

// -------------------------------------------------------------
// GET /api/store/reports/purchases (Vendor-wise purchase breakdown)
// -------------------------------------------------------------
router.get('/purchases', authenticateToken, requireStoreRoles(['admin', 'developer', 'management']), async (req, res) => {
  try {
    const { branch, store_id, vendor_id, from_date, to_date } = req.query;

    let query = `
      SELECT 
        v.id as vendor_id,
        v.name as vendor_name,
        COUNT(DISTINCT p.id) as total_invoices,
        SUM(p.subtotal) as subtotal_amount,
        SUM(p.tax_amount) as total_tax,
        SUM(p.total_amount) as total_amount,
        SUM(CASE WHEN p.payment_status = 'Paid' THEN p.total_amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN p.payment_status != 'Paid' THEN p.total_amount ELSE 0 END) as total_pending
      FROM store_purchases p
      JOIN store_vendors v ON p.vendor_id = v.id
      WHERE p.status = 'Received'
    `;
    const params = [];

    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND p.branch = $${params.length}`;
    }

    if (store_id && store_id !== 'All') {
      params.push(parseInt(store_id, 10));
      query += ` AND p.store_id = $${params.length}`;
    }

    if (vendor_id && vendor_id !== 'All') {
      params.push(parseInt(vendor_id, 10));
      query += ` AND p.vendor_id = $${params.length}`;
    }

    if (from_date) {
      params.push(from_date);
      query += ` AND p.invoice_date >= $${params.length}`;
    }

    if (to_date) {
      params.push(to_date);
      query += ` AND p.invoice_date <= $${params.length}`;
    }

    query += ' GROUP BY v.id, v.name ORDER BY total_amount DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching purchase report:', err);
    res.status(500).json({ error: 'Failed to fetch purchase report' });
  }
});

// -------------------------------------------------------------
// GET /api/store/reports/price-comparison (3-month historical price comparison)
// -------------------------------------------------------------
router.get('/price-comparison', authenticateToken, requireStoreRoles(['admin', 'developer', 'management', 'management store']), async (req, res) => {
  try {
    const { item_id } = req.query;

    // Fetch top 10 items or specific item
    let itemFilterClause = '';
    const params = [];
    if (item_id && item_id !== 'All') {
      params.push(parseInt(item_id, 10));
      itemFilterClause = ` AND pi.item_id = $${params.length}`;
    }

    // Historical purchase price trends in the last 90 days
    const priceRes = await pool.query(`
      SELECT 
        pi.item_id,
        si.name as item_name,
        si.item_code,
        pi.unit,
        v.id as vendor_id,
        v.name as vendor_name,
        p.invoice_date,
        pi.unit_price,
        p.purchase_number
      FROM store_purchase_items pi
      JOIN store_purchases p ON pi.purchase_id = p.id
      JOIN store_items si ON pi.item_id = si.id
      JOIN store_vendors v ON p.vendor_id = v.id
      WHERE p.status = 'Received'
        AND p.invoice_date >= CURRENT_DATE - INTERVAL '90 days'
        ${itemFilterClause}
      ORDER BY p.invoice_date ASC, pi.item_id ASC
    `, params);

    // Group price analysis per item
    const itemsMap = {};
    priceRes.rows.forEach(row => {
      if (!itemsMap[row.item_id]) {
        itemsMap[row.item_id] = {
          item_id: row.item_id,
          item_name: row.item_name,
          item_code: row.item_code,
          unit: row.unit,
          prices: [],
          min_price: Infinity,
          max_price: -Infinity,
          latest_price: row.unit_price,
          vendors_involved: new Set()
        };
      }
      const numP = parseFloat(row.unit_price);
      itemsMap[row.item_id].prices.push({
        date: row.invoice_date,
        price: numP,
        vendor: row.vendor_name,
        purchase_number: row.purchase_number
      });
      itemsMap[row.item_id].min_price = Math.min(itemsMap[row.item_id].min_price, numP);
      itemsMap[row.item_id].max_price = Math.max(itemsMap[row.item_id].max_price, numP);
      itemsMap[row.item_id].latest_price = numP;
      itemsMap[row.item_id].vendors_involved.add(row.vendor_name);
    });

    const comparisonList = Object.values(itemsMap).map(item => ({
      ...item,
      min_price: item.min_price === Infinity ? 0 : item.min_price,
      max_price: item.max_price === -Infinity ? 0 : item.max_price,
      vendors_involved: Array.from(item.vendors_involved)
    }));

    res.json({
      comparisonList,
      rawPoints: priceRes.rows
    });
  } catch (err) {
    console.error('Error fetching price comparison:', err);
    res.status(500).json({ error: 'Failed to fetch price comparison' });
  }
});

module.exports = router;
