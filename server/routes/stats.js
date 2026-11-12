const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, blockSalaryPayOperator } = require('../middleware/auth');

router.use(blockSalaryPayOperator);

// KSA Current Month Helper (Asia/Riyadh - UTC+3)
const getKsaCurrentMonthStr = () => {
  const now = new Date();
  const ksaDate = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
  const year = ksaDate.getFullYear();
  const month = String(ksaDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// GET comprehensive stats for Dashboard
router.get('/', authenticateToken, async (req, res) => {
  try {
    let { branch, closing_id, date } = req.query;
    const role = req.user.role?.trim().toLowerCase();
    const isPrivileged = role === 'admin' || role === 'developer' || role === 'management';
    const isAdmin = role === 'admin' || role === 'developer';

    if (!isPrivileged) {
      if (!req.user?.branch || req.user.branch === 'All') {
        return res.json({
          totalSale: 0,
          dailyRevenue: 0,
          totalProductCost: 0,
          totalOrders: 0,
          guestsToday: 0,
          last7Days: [],
          topItems: []
        });
      }
      branch = req.user.branch;
    }
    let branchCond = '';
    let branchCondO = '';
    let params = [];
    
    if (branch && branch !== 'All') {
      branchCond = 'AND branch = $1';
      branchCondO = 'AND o.branch = $1';
      params.push(branch);
    }

    const targetDateExpr = (date && /^\d{4}-\d{2}-\d{2}$/.test(date))
      ? `'${date}'::date`
      : `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date`;

    // Cashier should only see the current unclosed shift
    const isCashier = role === 'cashier';
    let shiftCond = isCashier ? `AND is_shift_closed = FALSE AND completed_by = '${req.user.username}'` : '';
    let shiftCondO = isCashier ? `AND o.is_shift_closed = FALSE AND o.completed_by = '${req.user.username}'` : '';
    let targetCashierForMP = isCashier ? req.user.username : null;

    if (closing_id && typeof closing_id === 'string' && closing_id.startsWith('live_')) {
      const liveUser = closing_id.replace('live_', '');
      shiftCond = `AND is_shift_closed = FALSE AND completed_by = '${liveUser}'`;
      shiftCondO = `AND o.is_shift_closed = FALSE AND o.completed_by = '${liveUser}'`;
      targetCashierForMP = liveUser;
      closing_id = null; // Skip shift_closings block
    }

    // If closing_id is provided (usually by admin), fetch from shift_closings
    if (closing_id) {
      const closingRes = await pool.query(`SELECT * FROM shift_closings WHERE id = $1`, [closing_id]);
      if (closingRes.rows.length > 0) {
        const closing = closingRes.rows[0];
        
        let items = [];
        try { 
          const parsed = typeof closing.items_summary === 'string' ? JSON.parse(closing.items_summary) : closing.items_summary;
          if (Array.isArray(parsed)) items = parsed;
        } catch (e) {}
        
        return res.json({
          totalSale: parseFloat(closing.total_sales || 0),
          cashSale: parseFloat(closing.cash_sales || 0),
          cardSale: parseFloat(closing.card_sales || 0),
          creditSale: parseFloat(closing.credit_sales || 0),
          majorPayment: parseFloat(closing.major_payments || 0),
          dailyRevenue: parseFloat(closing.total_sales || 0),
          totalProductCost: 0,
          totalOrders: parseInt(closing.total_orders || 0),
          guestsToday: parseInt(closing.total_orders || 0),
          last7Days: [],
          topItems: items.map(i => ({ 
            name: i.item_name || i.name || i.category || 'Item', 
            value: parseInt(i.qty || i.quantity || 0) 
          })).slice(0, 6)
        });
      }
    }

    const totalSaleResult = await pool.query(`
      SELECT 
        COALESCE(SUM(o.grand_total), 0) as total_sale,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Cash' THEN t.amount ELSE (CASE WHEN t.id IS NULL AND o.grand_total > 0 THEN o.grand_total ELSE 0 END) END), 0) as cash_sale,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Card' OR t.payment_method = 'Online' THEN t.amount ELSE 0 END), 0) as card_sale,
        COALESCE(SUM(CASE WHEN t.payment_method = 'Credit' THEN t.amount ELSE 0 END), 0) as credit_sale
      FROM "orders" o
      LEFT JOIN transactions t ON o.id = t.order_id
      WHERE (o.created_at AT TIME ZONE 'Asia/Riyadh')::date = ${targetDateExpr} AND o.status = 'Completed' ${branchCondO} ${shiftCondO}
    `, params);

    let mpQuery = `
      SELECT COALESCE(SUM(ct.amount), 0) as major_payment
      FROM credit_transactions ct
      JOIN credit_customers cc ON ct.credit_customer_id = cc.id
      WHERE ct.type = 'PAYMENT' AND (ct.created_at AT TIME ZONE 'Asia/Riyadh')::date = ${targetDateExpr}
    `;
    let mpParams = [];
    if (branch && branch !== 'All') {
      mpParams.push(JSON.stringify([branch]));
      mpQuery += ` AND cc.available_branches @> $${mpParams.length}::jsonb`;
    }
    if (targetCashierForMP) {
      mpParams.push(targetCashierForMP);
      mpQuery += ` AND ct.cashier_name = $${mpParams.length}`;
    }
    const majorPaymentResult = await pool.query(mpQuery, mpParams);

    // Daily Revenue (Today's Sales - Produce Cost)
    const dailyRevenueResult = await pool.query(`
      WITH recipe_costs AS (
        SELECT 
          r.item_id,
          SUM(r.quantity_used * s.price_per_unit) as produce_cost_per_unit
        FROM recipes r
        JOIN stock s ON r.stock_id = s.id
        GROUP BY r.item_id
      ),
      day_items AS (
        SELECT 
          oi.item_id,
          SUM(oi.qty) as total_qty,
          SUM(oi.qty * oi.unit_price) as total_price,
          SUM(CASE 
            WHEN o.subtotal > 0 THEN (oi.qty * oi.unit_price / o.subtotal) * o.discount 
            ELSE 0 
          END) as total_discount
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'Completed'
          AND (o.created_at AT TIME ZONE 'Asia/Riyadh')::date = ${targetDateExpr} ${branchCondO} ${shiftCondO}
        GROUP BY oi.item_id
      )
      SELECT 
        COALESCE(SUM((s.total_price - s.total_discount) - (COALESCE(rc.produce_cost_per_unit, 0) * s.total_qty)), 0) as revenue,
        COALESCE(SUM(COALESCE(rc.produce_cost_per_unit, 0) * s.total_qty), 0) as product_cost
      FROM day_items s
      LEFT JOIN recipe_costs rc ON s.item_id = rc.item_id
    `, params);

    // Total fulfilled orders today
    const totalOrdersResult = await pool.query(`
      SELECT COUNT(*) as count FROM "orders"
      WHERE (created_at AT TIME ZONE 'Asia/Riyadh')::date = ${targetDateExpr} AND status = 'Completed' ${branchCond} ${shiftCond}
    `, params);

    // Guest Today (Today's total orders excluding cancelled)
    const guestsTodayResult = await pool.query(`
      SELECT COUNT(*) as count FROM "orders"
      WHERE (created_at AT TIME ZONE 'Asia/Riyadh')::date = ${targetDateExpr} AND status != 'Cancelled' ${branchCond} ${shiftCond}
    `, params);

    // Last 7 days sales data guaranteed using Postgres generate_series (Saudi Arabia Asia/Riyadh)
    const last7DaysQuery = await pool.query(`
      SELECT 
        TO_CHAR(d.date, 'Mon DD') as label,
        COALESCE(SUM(o.grand_total), 0) as total
      FROM (
        SELECT (${targetDateExpr}) - i as date
        FROM generate_series(6, 0, -1) i
      ) d
      LEFT JOIN orders o 
        ON (o.created_at AT TIME ZONE 'Asia/Riyadh')::date = d.date AND o.status = 'Completed' ${branchCondO} ${shiftCondO}
      GROUP BY d.date
      ORDER BY d.date ASC
    `, params);

    const days = last7DaysQuery.rows.map(r => ({
      label: r.label,
      total: parseFloat(r.total)
    }));

    // Top selling items overall
    const topItems = await pool.query(`
      SELECT oi.item_name, SUM(oi.qty) as total_qty
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE 1=1 ${branchCondO} ${shiftCondO}
      GROUP BY oi.item_name
      ORDER BY total_qty DESC
      LIMIT 6
    `, params);

    // Payroll Stats
    const currentMonth = getKsaCurrentMonthStr(); // YYYY-MM
    let payrollStats = { total_salary_paid: 0, total_advance_given: 0 };
    
    if (isAdmin) {
      const payrollRes = await pool.query(`
        SELECT SUM(paid_amount) as total_salary_paid 
        FROM employee_payroll_records 
        WHERE month = $1 AND status = 'Paid'
      `, [currentMonth]);
      
      const advanceRes = await pool.query(`
        SELECT SUM(advance_balance) as total_advance_given 
        FROM employees
      `);
      
      payrollStats.total_salary_paid = parseFloat(payrollRes.rows[0]?.total_salary_paid || 0);
      payrollStats.total_advance_given = parseFloat(advanceRes.rows[0]?.total_advance_given || 0);
    }

    res.json({
      totalSale: parseFloat(totalSaleResult.rows[0].total_sale),
      cashSale: parseFloat(totalSaleResult.rows[0].cash_sale),
      cardSale: parseFloat(totalSaleResult.rows[0].card_sale),
      creditSale: parseFloat(totalSaleResult.rows[0].credit_sale),
      majorPayment: parseFloat(majorPaymentResult.rows[0].major_payment),
      dailyRevenue: parseFloat(dailyRevenueResult.rows[0].revenue),
      totalProductCost: parseFloat(dailyRevenueResult.rows[0].product_cost),
      totalOrders: parseInt(totalOrdersResult.rows[0].count),
      guestsToday: parseInt(guestsTodayResult.rows[0].count),
      last7Days: days,
      topItems: topItems.rows.map(r => ({
        name: r.item_name,
        value: parseInt(r.total_qty),
      })),
      payrollStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET top items by date range
router.get('/top-items', authenticateToken, async (req, res) => {
  try {
    let { branch, from_date, to_date } = req.query;
    let params = [];
    let branchCond = '';
    
    if (branch && branch !== 'All') {
      branchCond = 'AND o.branch = $1';
      params.push(branch);
    }
    
    let dateCond = '';
    if (from_date && to_date) {
      dateCond = `AND (o.created_at AT TIME ZONE 'Asia/Riyadh')::date >= $${params.length + 1}::date AND (o.created_at AT TIME ZONE 'Asia/Riyadh')::date <= $${params.length + 2}::date`;
      params.push(from_date, to_date);
    } else if (from_date) {
      dateCond = `AND (o.created_at AT TIME ZONE 'Asia/Riyadh')::date >= $${params.length + 1}::date`;
      params.push(from_date);
    } else if (to_date) {
      dateCond = `AND (o.created_at AT TIME ZONE 'Asia/Riyadh')::date <= $${params.length + 1}::date`;
      params.push(to_date);
    }

    const topItems = await pool.query(`
      SELECT oi.item_name, SUM(oi.qty) as total_qty
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE 1=1 ${branchCond} ${dateCond}
      GROUP BY oi.item_name
      ORDER BY total_qty DESC
      LIMIT 6
    `, params);

    res.json(topItems.rows.map(r => ({
      name: r.item_name,
      value: parseInt(r.total_qty),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/shift-closing-analytics
router.get('/shift-closing-analytics', authenticateToken, async (req, res) => {
  try {
    const { period, date, start_date, end_date, branch } = req.query;

    // 1. Resolve date range expressions in Asia/Riyadh timezone
    let startDateExpr = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date";
    let endDateExpr = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date";
    const selectedPeriod = (period || (date ? 'single' : 'today')).toLowerCase();

    if (selectedPeriod === 'yesterday') {
      startDateExpr = "((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh') - INTERVAL '1 day')::date";
      endDateExpr = "((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh') - INTERVAL '1 day')::date";
    } else if (selectedPeriod === '7days') {
      startDateExpr = "((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh') - INTERVAL '6 days')::date";
      endDateExpr = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date";
    } else if (selectedPeriod === 'last_month') {
      // Previous complete calendar month
      startDateExpr = "date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh') - INTERVAL '1 month')::date";
      endDateExpr = "(date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh') - INTERVAL '1 day')::date";
    } else if (selectedPeriod === 'custom' && start_date && end_date) {
      const validS = /^\d{4}-\d{2}-\d{2}$/.test(start_date) ? start_date : null;
      const validE = /^\d{4}-\d{2}-\d{2}$/.test(end_date) ? end_date : null;
      if (validS && validE && validS <= validE) {
        startDateExpr = `'${validS}'::date`;
        endDateExpr = `'${validE}'::date`;
      }
    } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      startDateExpr = `'${date}'::date`;
      endDateExpr = `'${date}'::date`;
    }

    // Branch filter if provided
    let branchCondition = '';
    const queryParams = [];
    if (branch && branch !== 'All') {
      queryParams.push(branch);
      branchCondition = ` AND branch = ${queryParams.length}`;
    }

    // 2. Query shift closings across the selected date range
    const rangeQuery = `
      SELECT 
        id, branch, cashier_name, total_sales, cash_sales, card_sales, closing_cash, closing_card,
        difference, difference_reason, closing_type, login_time, logout_time, created_at,
        TO_CHAR((COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')::date, 'YYYY-MM-DD') as date_str,
        TO_CHAR((COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')::date, 'DD Mon') as display_date,
        EXTRACT(HOUR FROM (COALESCE(login_time, created_at) AT TIME ZONE 'Asia/Riyadh')) as login_hour,
        EXTRACT(HOUR FROM (COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')) as logout_hour
      FROM shift_closings
      WHERE (COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')::date >= ${startDateExpr}
        AND (COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')::date <= ${endDateExpr}
        ${branchCondition}
      ORDER BY (COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')::date ASC, id ASC
    `;

    const rangeRes = await pool.query(rangeQuery, queryParams);

    // 3. Aggregate daily timeline without double-counting (prioritize Daily record, else sum Shift records)
    const dateMap = new Map();

    for (const row of rangeRes.rows) {
      const d = row.date_str;
      if (!dateMap.has(d)) {
        dateMap.set(d, {
          date: d,
          display_date: row.display_date,
          shifts: [],
          daily_record: null
        });
      }
      const entry = dateMap.get(d);
      if (row.closing_type === 'Daily') {
        entry.daily_record = row;
      } else {
        entry.shifts.push(row);
      }
    }

    const timeline = [];
    let totalActual = 0;
    let totalSystem = 0;
    const allCashiersSet = new Set();

    dateMap.forEach((entry, dStr) => {
      let actual = 0;
      let system = 0;
      const cashiersOnDate = new Set();

      if (entry.daily_record) {
        // Use Daily record values
        const dRec = entry.daily_record;
        const cCash = parseFloat(dRec.closing_cash || 0);
        const cCard = parseFloat(dRec.closing_card || 0);
        actual = (cCash > 0 || cCard > 0) ? (cCash + cCard) : parseFloat(dRec.total_sales || 0);
        system = parseFloat(dRec.total_sales || (parseFloat(dRec.cash_sales || 0) + parseFloat(dRec.card_sales || 0)));
        if (dRec.cashier_name) {
          cashiersOnDate.add(dRec.cashier_name);
          allCashiersSet.add(dRec.cashier_name);
        }
      } else if (entry.shifts.length > 0) {
        // Sum individual Shift records
        for (const s of entry.shifts) {
          const cCash = parseFloat(s.closing_cash || 0);
          const cCard = parseFloat(s.closing_card || 0);
          const sSys = parseFloat(s.total_sales || (parseFloat(s.cash_sales || 0) + parseFloat(s.card_sales || 0)));
          const sAct = (s.closing_cash !== null && s.closing_cash !== undefined) ? (cCash + cCard) : sSys;
          actual += sAct;
          system += sSys;
          if (s.cashier_name) {
            cashiersOnDate.add(s.cashier_name);
            allCashiersSet.add(s.cashier_name);
          }
        }
      }

      actual = Math.round(actual * 100) / 100;
      system = Math.round(system * 100) / 100;
      const diff = Math.round((actual - system) * 100) / 100;

      totalActual += actual;
      totalSystem += system;

      timeline.push({
        date: dStr,
        display_date: entry.display_date,
        actual_closing: actual,
        system_closing: system,
        difference: diff,
        cashier_names: Array.from(cashiersOnDate).join(', ') || 'Staff',
        shift_count: entry.shifts.length + (entry.daily_record ? 1 : 0),
        daily_closing_id: entry.daily_record?.id || null,
        daily_difference_reason: entry.daily_record?.difference_reason || null,
        is_daily_edited: Boolean(entry.daily_record?.difference_reason && entry.daily_record.difference_reason.includes('[Edited')),
        shifts: entry.shifts.map(s => ({
          id: s.id,
          shift_id: s.id,
          branch: s.branch,
          cashier_name: s.cashier_name,
          actual: (s.closing_cash !== null && s.closing_cash !== undefined) ? (parseFloat(s.closing_cash || 0) + parseFloat(s.closing_card || 0)) : parseFloat(s.total_sales || 0),
          closing_cash: s.closing_cash !== null && s.closing_cash !== undefined ? parseFloat(s.closing_cash) : null,
          closing_card: s.closing_card !== null && s.closing_card !== undefined ? parseFloat(s.closing_card) : null,
          system: parseFloat(s.total_sales || 0),
          difference: parseFloat(s.difference || 0),
          difference_reason: s.difference_reason || null,
          is_edited: Boolean(s.difference_reason && s.difference_reason.includes('[Edited')),
          closing_type: s.closing_type,
          created_at: s.created_at
        }))
      });
    });

    totalActual = Math.round(totalActual * 100) / 100;
    totalSystem = Math.round(totalSystem * 100) / 100;
    const totalDifference = Math.round((totalActual - totalSystem) * 100) / 100;

    // 4. Restaurant shift comparison for selected period
    const closingsRes = await pool.query(`
      SELECT 
        id, branch, cashier_name, total_sales, cash_sales, card_sales, closing_cash, closing_card,
        difference, difference_reason, login_time, logout_time, closing_type, shifts_summary, created_at,
        EXTRACT(HOUR FROM (COALESCE(login_time, created_at) AT TIME ZONE 'Asia/Riyadh')) as login_hour,
        EXTRACT(HOUR FROM (COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')) as logout_hour
      FROM shift_closings
      WHERE (COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')::date >= ${startDateExpr}
        AND (COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')::date <= ${endDateExpr}
      ORDER BY id ASC
    `);

    const liveShiftsRes = await pool.query(`
      SELECT cs.id, cs.cashier_name, cs.branch, cs.start_time, cs.status,
        EXTRACT(HOUR FROM (cs.start_time AT TIME ZONE 'Asia/Riyadh')) as start_hour
      FROM cashier_shifts cs
      WHERE (cs.start_time AT TIME ZONE 'Asia/Riyadh')::date >= ${startDateExpr}
        AND (cs.start_time AT TIME ZONE 'Asia/Riyadh')::date <= ${endDateExpr}
      ORDER BY cs.id ASC
    `).catch(() => ({ rows: [] }));

    const liveOrdersRes = await pool.query(`
      SELECT branch, completed_by, SUM(grand_total) as live_sales, COUNT(*) as live_orders
      FROM orders
      WHERE (created_at AT TIME ZONE 'Asia/Riyadh')::date >= ${startDateExpr}
        AND (created_at AT TIME ZONE 'Asia/Riyadh')::date <= ${endDateExpr}
        AND status = 'Completed'
        AND is_shift_closed = FALSE
      GROUP BY branch, completed_by
    `).catch(() => ({ rows: [] }));

    let fallbackClosings = [];
    if (closingsRes.rows.length === 0) {
      const fbRes = await pool.query(`
        SELECT 
          id, branch, cashier_name, total_sales, cash_sales, card_sales, closing_cash, closing_card,
          difference, difference_reason, login_time, logout_time, closing_type, shifts_summary, created_at,
          EXTRACT(HOUR FROM (COALESCE(login_time, created_at) AT TIME ZONE 'Asia/Riyadh')) as login_hour,
          EXTRACT(HOUR FROM (COALESCE(logout_time, created_at) AT TIME ZONE 'Asia/Riyadh')) as logout_hour
        FROM shift_closings
        ORDER BY id DESC
        LIMIT 30
      `).catch(() => ({ rows: [] }));
      fallbackClosings = fbRes.rows;
    }

    const allRows = closingsRes.rows.length > 0 ? closingsRes.rows : fallbackClosings;

    const branchConfigs = [
      { id: 'R1', name: 'Restaurant 1', aliases: ['restaurant 1', 'branch 1', 'r1', 'b1'] },
      { id: 'R2', name: 'Restaurant 2', aliases: ['restaurant 2', 'branch 2', 'r2', 'b2'] },
      { id: 'R3', name: 'Restaurant 3', aliases: ['restaurant 3', 'branch 3', 'r3', 'b3'] }
    ];

    const matchBranch = (branchStr, config) => {
      if (!branchStr) return false;
      const bNorm = branchStr.trim().toLowerCase();
      return config.aliases.some(a => bNorm.includes(a));
    };

    const restaurantData = branchConfigs.map(bConfig => {
      const branchClosings = allRows.filter(r => matchBranch(r.branch, bConfig));
      const branchLiveOrders = liveOrdersRes.rows.filter(r => matchBranch(r.branch, bConfig));
      const branchLiveShifts = liveShiftsRes.rows.filter(r => matchBranch(r.branch, bConfig));

      let dayShiftRecord = branchClosings.find(r => {
        const h = r.login_hour !== null ? r.login_hour : (r.logout_hour !== null ? r.logout_hour : 12);
        return h >= 6 && h < 18;
      });

      let nightShiftRecord = branchClosings.find(r => {
        const h = r.login_hour !== null ? r.login_hour : (r.logout_hour !== null ? r.logout_hour : 0);
        return (h >= 18 || h < 6);
      });

      if (!dayShiftRecord && !nightShiftRecord && branchClosings.length > 0) {
        dayShiftRecord = branchClosings[0];
        if (branchClosings.length > 1) nightShiftRecord = branchClosings[1];
      }

      const liveDay = branchLiveShifts.find(s => s.start_hour >= 6 && s.start_hour < 18);
      const liveNight = branchLiveShifts.find(s => s.start_hour >= 18 || s.start_hour < 6);

      const dayLiveSales = (liveDay ? branchLiveOrders.filter(o => o.completed_by === liveDay.cashier_name) : branchLiveOrders)
        .reduce((sum, o) => sum + parseFloat(o.live_sales || 0), 0);
      const nightLiveSales = (liveNight ? branchLiveOrders.filter(o => o.completed_by === liveNight.cashier_name) : [])
        .reduce((sum, o) => sum + parseFloat(o.live_sales || 0), 0);

      const daySys = dayShiftRecord ? parseFloat(dayShiftRecord.total_sales || 0) : dayLiveSales;
      const dayAct = dayShiftRecord 
        ? ((dayShiftRecord.closing_cash !== null && dayShiftRecord.closing_cash !== undefined)
            ? (parseFloat(dayShiftRecord.closing_cash || 0) + parseFloat(dayShiftRecord.closing_card || 0))
            : daySys)
        : dayLiveSales;
      const dayCashier = dayShiftRecord?.cashier_name || liveDay?.cashier_name || 'Day Cashier';

      const nightSys = nightShiftRecord ? parseFloat(nightShiftRecord.total_sales || 0) : nightLiveSales;
      const nightAct = nightShiftRecord
        ? ((nightShiftRecord.closing_cash !== null && nightShiftRecord.closing_cash !== undefined)
            ? (parseFloat(nightShiftRecord.closing_cash || 0) + parseFloat(nightShiftRecord.closing_card || 0))
            : nightSys)
        : nightLiveSales;
      const nightCashier = nightShiftRecord?.cashier_name || liveNight?.cashier_name || 'Night Cashier';

      const totalBranchSys = Math.round((daySys + nightSys) * 100) / 100;
      const totalBranchAct = Math.round((dayAct + nightAct) * 100) / 100;

      const dayDiff = Math.round((dayAct - daySys) * 100) / 100;
      const dayDiffPct = daySys > 0 ? Math.round(((dayAct - daySys) / daySys) * 1000) / 10 : 0;

      const nightDiff = Math.round((nightAct - nightSys) * 100) / 100;
      const nightDiffPct = nightSys > 0 ? Math.round(((nightAct - nightSys) / nightSys) * 1000) / 10 : 0;

      return {
        restaurant_id: bConfig.id,
        restaurant_name: bConfig.name,
        day_shift: {
          id: dayShiftRecord?.id || null,
          shift_id: dayShiftRecord?.id || liveDay?.id || null,
          shift_number: dayShiftRecord?.id ? `Shift #${dayShiftRecord.id}` : (liveDay ? `Shift #${liveDay.id}` : 'Shift 1'),
          shift_name: 'Day Shift',
          system_sales: Math.round(daySys * 100) / 100,
          actual_sales: Math.round(dayAct * 100) / 100,
          closing_cash: dayShiftRecord?.closing_cash !== null && dayShiftRecord?.closing_cash !== undefined ? parseFloat(dayShiftRecord.closing_cash) : null,
          closing_card: dayShiftRecord?.closing_card !== null && dayShiftRecord?.closing_card !== undefined ? parseFloat(dayShiftRecord.closing_card) : null,
          start_time: dayShiftRecord?.login_time || liveDay?.start_time || null,
          closing_time: dayShiftRecord?.logout_time || dayShiftRecord?.created_at || (liveDay ? 'Active (In-Progress)' : null),
          difference_amount: dayDiff,
          difference_percentage: dayDiffPct,
          difference_reason: dayShiftRecord?.difference_reason || null,
          is_edited: Boolean(dayShiftRecord?.difference_reason && dayShiftRecord.difference_reason.includes('[Edited')),
          cashier_name: dayCashier,
          is_closed: !!dayShiftRecord,
          branch: bConfig.name
        },
        night_shift: {
          id: nightShiftRecord?.id || null,
          shift_id: nightShiftRecord?.id || liveNight?.id || null,
          shift_number: nightShiftRecord?.id ? `Shift #${nightShiftRecord.id}` : (liveNight ? `Shift #${liveNight.id}` : 'Shift 2'),
          shift_name: 'Night Shift',
          system_sales: Math.round(nightSys * 100) / 100,
          actual_sales: Math.round(nightAct * 100) / 100,
          closing_cash: nightShiftRecord?.closing_cash !== null && nightShiftRecord?.closing_card !== undefined ? parseFloat(nightShiftRecord.closing_cash) : null,
          closing_card: nightShiftRecord?.closing_card !== null && nightShiftRecord?.closing_card !== undefined ? parseFloat(nightShiftRecord.closing_card) : null,
          start_time: nightShiftRecord?.login_time || liveNight?.start_time || null,
          closing_time: nightShiftRecord?.logout_time || nightShiftRecord?.created_at || (liveNight ? 'Active (In-Progress)' : null),
          difference_amount: nightDiff,
          difference_percentage: nightDiffPct,
          difference_reason: nightShiftRecord?.difference_reason || null,
          is_edited: Boolean(nightShiftRecord?.difference_reason && nightShiftRecord.difference_reason.includes('[Edited')),
          cashier_name: nightCashier,
          is_closed: !!nightShiftRecord,
          branch: bConfig.name
        },
        total_system_sales: totalBranchSys,
        total_actual_sales: totalBranchAct
      };
    });

    res.json({
      period: selectedPeriod,
      summary: {
        total_actual: totalActual,
        total_system: totalSystem,
        total_difference: totalDifference,
        cashiers: Array.from(allCashiersSet)
      },
      timeline: timeline,
      date: date || new Date().toISOString().slice(0, 10),
      restaurants: restaurantData
    });
  } catch (err) {
    console.error('Error in shift-closing-analytics:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
