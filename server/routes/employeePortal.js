const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.use(express.json());
router.use(authenticateToken);

// KSA Current Month Helper (UTC+3)
const getKsaCurrentMonthStr = () => {
  const now = new Date();
  const ksaDate = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
  const year = ksaDate.getFullYear();
  const month = String(ksaDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Helper: strictly resolve logged-in employee record
async function getAuthEmployee(user) {
  let empId = user?.employee_id;
  if (!empId) {
    const uRes = await pool.query('SELECT employee_id FROM users WHERE id = $1', [user.id]);
    empId = uRes.rows[0]?.employee_id;
  }
  if (!empId) return null;
  const empRes = await pool.query('SELECT * FROM employees WHERE id = $1', [empId]);
  return empRes.rows[0] || null;
}

// --------------------------------------------------------------------------
// 1. GET /api/employee-portal/me - Profile
// --------------------------------------------------------------------------
router.get('/me', async (req, res) => {
  try {
    const emp = await getAuthEmployee(req.user);
    if (!emp) {
      return res.status(404).json({ error: 'No employee record linked to this user account.' });
    }

    // Check if employee is registered in Khata
    const khataRes = await pool.query('SELECT id, balance, status FROM credit_customers WHERE employee_id = $1', [emp.id]);
    const khataCust = khataRes.rows[0] || null;

    res.json({
      id: emp.id,
      employee_id: emp.employee_id || `EMP-${String(emp.id).padStart(4, '0')}`,
      name: emp.name,
      role: emp.role,
      department: emp.department,
      branch: emp.branch,
      salary: parseFloat(emp.salary || 0),
      shift: emp.shift || emp.working_hours || 'R1',
      shift_hours: parseFloat(emp.shift_hours || 12.0),
      phone: emp.phone,
      email: emp.email,
      created_at: emp.created_at,
      is_khata_registered: !!khataCust,
      khata_balance: khataCust ? parseFloat(khataCust.balance || 0) : 0,
      user: {
        username: req.user.username,
        role: req.user.role
      }
    });
  } catch (err) {
    console.error('Error in employee-portal/me:', err);
    res.status(500).json({ error: 'Failed to load employee profile' });
  }
});

// --------------------------------------------------------------------------
// 2. GET /api/employee-portal/attendance - My Attendance
// --------------------------------------------------------------------------
router.get('/attendance', async (req, res) => {
  try {
    const emp = await getAuthEmployee(req.user);
    if (!emp) {
      return res.status(404).json({ error: 'No employee record linked to this user account.' });
    }

    const month = (req.query.month && req.query.month.trim()) ? req.query.month.trim() : getKsaCurrentMonthStr();

    // Query employee attendance sessions for this month
    const sessionsRes = await pool.query(
      `SELECT ea.id, ea.employee_id, ea.check_in, ea.check_out, ea.status, ea.on_break, ea.break_start, 
              ea.total_break_duration_seconds, ea.break_logs, ea.remarks, TO_CHAR(ea.date, 'YYYY-MM-DD') as date, 
              ea.shift_name, ea.shift_hours, ea.created_by, ea.checked_out_by, COALESCE(ea.branch, e.branch, 'Branch 1') as branch
       FROM employee_attendance ea
       JOIN employees e ON ea.employee_id = e.id
       WHERE ea.employee_id = $1 AND TO_CHAR(ea.date, 'YYYY-MM') = $2
       ORDER BY ea.date ASC, ea.check_in ASC`,
      [emp.id, month]
    );

    // Compute session details and daily summaries
    const daysMap = {};
    let presents = 0;
    let absents = 0;
    let leaves = 0;
    let holidays = 0;
    let lateCount = 0;
    let totalDutyWorkedHours = 0;
    let onlyOtHours = 0;
    let otherOtHours = 0;
    const standardShift = parseFloat(emp.shift_hours || 12.0);

    sessionsRes.rows.forEach(s => {
      const dKey = s.date;
      if (!daysMap[dKey]) daysMap[dKey] = [];

      let hoursWorked = 0;
      if (s.status !== 'Holiday' && s.status !== 'Leave') {
        const inMs = s.check_in ? new Date(s.check_in).getTime() : 0;
        const outMs = s.check_out ? new Date(s.check_out).getTime() : (s.check_in ? Date.now() : 0);
        const breakSecs = parseInt(s.total_break_duration_seconds) || 0;
        const netMs = outMs - inMs - (breakSecs * 1000);
        hoursWorked = Math.max(0, netMs / (1000 * 60 * 60));
      }

      daysMap[dKey].push({
        ...s,
        hours_worked: parseFloat(hoursWorked.toFixed(2))
      });
    });

    // Calculate monthly totals across dates
    Object.keys(daysMap).forEach(dKey => {
      const daySessions = daysMap[dKey];
      const dayHours = Math.min(24, daySessions.reduce((sum, s) => sum + (s.hours_worked || 0), 0));
      const firstStatus = daySessions[0]?.status;

      if (firstStatus === 'Holiday') {
        holidays++;
      } else if (firstStatus === 'Leave') {
        leaves++;
      } else if (dayHours > 0 && dayHours < 6.0) {
        onlyOtHours += dayHours;
      } else if (dayHours >= 6.0) {
        presents++;
        totalDutyWorkedHours += Math.min(standardShift, dayHours);
        if (dayHours > standardShift) {
          otherOtHours += (dayHours - standardShift);
        }
      }

      if (daySessions.some(s => s.status === 'Late')) {
        lateCount++;
      }
    });

    // Calculate days in month to determine absents up to current date
    const [yS, mS] = month.split('-');
    const totalDaysInMonth = new Date(parseInt(yS, 10), parseInt(mS, 10), 0).getDate();
    const currentKsaDay = new Date().getDate();
    const isCurrentMonth = month === getKsaCurrentMonthStr();
    const elapsedDays = isCurrentMonth ? currentKsaDay : totalDaysInMonth;

    const markedDaysCount = Object.keys(daysMap).length;
    absents = Math.max(0, elapsedDays - presents - leaves - holidays);

    const totalHoursWorked = Math.round((totalDutyWorkedHours + onlyOtHours + otherOtHours) * 100) / 100;
    const expectedMonthlyHours = Math.round((totalDaysInMonth * standardShift) * 100) / 100;
    const attendancePercentage = elapsedDays > 0 ? Math.round((presents / elapsedDays) * 100) : 0;

    res.json({
      month,
      employee_id: emp.id,
      employee_name: emp.name,
      metrics: {
        presents,
        absents,
        leaves,
        holidays,
        late_arrivals: lateCount,
        overtime_hours: parseFloat((onlyOtHours + otherOtHours).toFixed(2)),
        total_hours: totalHoursWorked,
        expected_hours: expectedMonthlyHours,
        attendance_percentage: attendancePercentage
      },
      daily_records: daysMap
    });
  } catch (err) {
    console.error('Error in employee-portal/attendance:', err);
    res.status(500).json({ error: 'Failed to load attendance records' });
  }
});

// --------------------------------------------------------------------------
// 3. GET /api/employee-portal/payroll - My Salary & Calculation Breakdown
// --------------------------------------------------------------------------
router.get('/payroll', async (req, res) => {
  try {
    const emp = await getAuthEmployee(req.user);
    if (!emp) {
      return res.status(404).json({ error: 'No employee record linked to this user account.' });
    }

    const month = (req.query.month && req.query.month.trim()) ? req.query.month.trim() : getKsaCurrentMonthStr();

    // 1. Fetch saved payroll record if exists
    const recordRes = await pool.query(
      'SELECT * FROM employee_payroll_records WHERE employee_id = $1 AND month = $2',
      [emp.id, month]
    );
    const savedRec = recordRes.rows[0] || null;

    // 2. Fetch installment payment logs
    const payRes = await pool.query(
      'SELECT id, payment_method, amount, paid_by, notes, created_at FROM employee_payroll_payments WHERE employee_id = $1 AND month = $2 ORDER BY created_at ASC',
      [emp.id, month]
    );
    const paymentLogs = payRes.rows.map(p => ({
      ...p,
      amount: parseFloat(p.amount || 0)
    }));

    // 3. Fetch Khata breakdown for this employee
    let thisMonthKhata = 0;
    let prevMonthKhata = 0;
    let totalKhata = 0;
    let isKhataReg = false;

    const custRes = await pool.query('SELECT id, balance FROM credit_customers WHERE employee_id = $1', [emp.id]);
    if (custRes.rows.length > 0) {
      isKhataReg = true;
      const custId = custRes.rows[0].id;
      totalKhata = parseFloat(custRes.rows[0].balance || 0);

      const kBreakdown = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE 
             WHEN COALESCE(billing_month, TO_CHAR(created_at, 'YYYY-MM')) = $1 THEN
               CASE 
                 WHEN type IN ('CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED') THEN amount
                 WHEN type IN ('PAYMENT', 'ORDER_CANCELLED') AND classification != 'Salary Deduction' THEN -amount
                 ELSE 0
               END
             ELSE 0
           END), 0) AS this_month_khata,
           COALESCE(SUM(CASE 
             WHEN COALESCE(billing_month, TO_CHAR(created_at, 'YYYY-MM')) < $1 THEN
               CASE 
                 WHEN type IN ('CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED') THEN amount
                 WHEN type IN ('PAYMENT', 'ORDER_CANCELLED') THEN -amount
                 ELSE 0
               END
             ELSE 0
           END), 0) AS prev_month_remaining_khata
         FROM credit_transactions
         WHERE credit_customer_id = $2`,
        [month, custId]
      );

      thisMonthKhata = parseFloat(kBreakdown.rows[0]?.this_month_khata || 0);
      prevMonthKhata = parseFloat(kBreakdown.rows[0]?.prev_month_remaining_khata || 0);
    }

    const baseSalary = parseFloat(savedRec?.base_salary || emp.salary || 0);
    const payableSalary = parseFloat(savedRec?.payable_salary || baseSalary);
    const bonus = parseFloat(savedRec?.bonus || 0);
    const advanceDeduction = parseFloat(savedRec?.advance_deduction || 0);
    const otherAdjustments = parseFloat(savedRec?.other_adjustments || 0);
    const recurringAdjustments = parseFloat(savedRec?.recurring_adjustments || 0);
    const kafalat = parseFloat(savedRec?.kafalat || 0);
    const internet = parseFloat(savedRec?.internet || 0);
    const lastMonthAdj = parseFloat(savedRec?.last_month_adjustment || 0);
    const lastMonthBal = parseFloat(savedRec?.last_month_balance || 0);

    const totalAdjustments = Math.round((lastMonthBal + bonus + lastMonthAdj - advanceDeduction - kafalat - internet + otherAdjustments + recurringAdjustments) * 100) / 100;
    
    const khataDeduction = savedRec?.khata_deduction !== undefined && savedRec?.khata_deduction !== null
      ? parseFloat(savedRec.khata_deduction)
      : Math.round(totalKhata * 100) / 100;

    const netSalary = savedRec?.net_salary !== undefined && savedRec?.net_salary !== null
      ? parseFloat(savedRec.net_salary)
      : Math.round((payableSalary + totalAdjustments - khataDeduction) * 100) / 100;

    const cashPaid = parseFloat(savedRec?.cash_paid || 0);
    const bankPaid = parseFloat(savedRec?.bank_paid || 0);
    const totalPaid = parseFloat(savedRec?.paid_amount || (cashPaid + bankPaid));
    const remainingSalary = Math.round((netSalary - totalPaid) * 100) / 100;
    const status = savedRec?.status || (totalPaid >= netSalary && netSalary > 0 ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Pending'));

    res.json({
      month,
      employee_id: emp.id,
      employee_name: emp.name,
      base_salary: baseSalary,
      payable_salary: payableSalary,
      expected_hours: parseFloat(savedRec?.expected_hours || (parseFloat(emp.shift_hours || 12) * 30).toFixed(2)),
      actual_hours: parseFloat(savedRec?.actual_hours || 0),
      overtime_hours: parseFloat(savedRec?.overtime_hours || 0),
      overtime_amount: parseFloat(savedRec?.overtime_pay || 0),
      deductions: parseFloat(savedRec?.deductions || 0),
      adjustments: {
        last_month_balance: lastMonthBal,
        bonus,
        last_month_adjustment: lastMonthAdj,
        advance_deduction: advanceDeduction,
        kafalat,
        internet,
        other_adjustments: otherAdjustments,
        recurring_adjustments: recurringAdjustments,
        total_adjustments: totalAdjustments
      },
      khata: {
        is_registered: isKhataReg,
        this_month_khata: thisMonthKhata,
        prev_month_remaining_khata: prevMonthKhata,
        total_khata_balance: totalKhata,
        deduction_amount: khataDeduction
      },
      net_salary: netSalary,
      paid_amount: totalPaid,
      cash_paid: cashPaid,
      bank_paid: bankPaid,
      remaining_salary: remainingSalary,
      status,
      payment_history: paymentLogs
    });
  } catch (err) {
    console.error('Error in employee-portal/payroll:', err);
    res.status(500).json({ error: 'Failed to load payroll details' });
  }
});

// --------------------------------------------------------------------------
// 4. GET /api/employee-portal/khata - My Live Khata Ledger
// --------------------------------------------------------------------------
router.get('/khata', async (req, res) => {
  try {
    const emp = await getAuthEmployee(req.user);
    if (!emp) {
      return res.status(404).json({ error: 'No employee record linked to this user account.' });
    }

    const month = (req.query.month && req.query.month.trim()) ? req.query.month.trim() : 'All';

    const custRes = await pool.query('SELECT * FROM credit_customers WHERE employee_id = $1', [emp.id]);
    if (custRes.rows.length === 0) {
      return res.json({
        is_registered: false,
        message: 'You are not currently registered as a Khata credit customer.',
        balance: 0,
        transactions: []
      });
    }

    const customer = custRes.rows[0];

    // Compute monthly breakdown
    const curMonthKey = getKsaCurrentMonthStr();
    const breakdownRes = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE 
           WHEN COALESCE(billing_month, TO_CHAR(created_at, 'YYYY-MM')) = $1 THEN
             CASE 
               WHEN type IN ('CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED') THEN amount
               WHEN type IN ('PAYMENT', 'ORDER_CANCELLED') AND classification != 'Salary Deduction' THEN -amount
               ELSE 0
             END
           ELSE 0
         END), 0) AS this_month_khata,
         COALESCE(SUM(CASE 
           WHEN COALESCE(billing_month, TO_CHAR(created_at, 'YYYY-MM')) < $1 THEN
             CASE 
               WHEN type IN ('CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED') THEN amount
               WHEN type IN ('PAYMENT', 'ORDER_CANCELLED') THEN -amount
               ELSE 0
             END
           ELSE 0
         END), 0) AS prev_month_remaining_khata
       FROM credit_transactions
       WHERE credit_customer_id = $2`,
      [curMonthKey, customer.id]
    );

    const thisMonthKhata = parseFloat(breakdownRes.rows[0]?.this_month_khata || 0);
    const prevMonthKhata = parseFloat(breakdownRes.rows[0]?.prev_month_remaining_khata || 0);

    // Fetch transactions with order details and running balance
    let txQuery = `
      SELECT ct.*, o.slip_number, o.order_type,
             (
               SELECT jsonb_agg(
                 jsonb_build_object('item_name', oi.item_name, 'qty', oi.qty, 'unit_price', oi.unit_price)
               )
               FROM order_items oi
               WHERE oi.order_id = ct.order_id
             ) AS order_items
      FROM credit_transactions ct
      LEFT JOIN orders o ON ct.order_id = o.id
      WHERE ct.credit_customer_id = $1
    `;
    const params = [customer.id];

    if (month && month !== 'All') {
      params.push(month);
      txQuery += ` AND COALESCE(ct.billing_month, TO_CHAR(ct.created_at, 'YYYY-MM')) = $${params.length}`;
    }

    txQuery += ' ORDER BY ct.created_at ASC, ct.id ASC';

    const txRes = await pool.query(txQuery, params);

    // Calculate running balance and totals
    let runningBalance = 0;
    let totalPurchases = 0;
    let totalPayments = 0;

    const formattedTxs = txRes.rows.map(t => {
      const amt = parseFloat(t.amount || 0);
      const isCharge = ['CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED'].includes(t.type);
      if (isCharge) {
        runningBalance += amt;
        totalPurchases += amt;
      } else {
        runningBalance -= amt;
        totalPayments += amt;
      }
      return {
        id: t.id,
        order_id: t.order_id,
        slip_number: t.slip_number,
        type: t.type,
        amount: amt,
        running_balance: Math.round(runningBalance * 100) / 100,
        billing_month: t.billing_month,
        classification: t.classification,
        payment_method: t.payment_method,
        comments: t.comments,
        branch: t.branch,
        created_at: t.created_at,
        order_items: t.order_items || []
      };
    });

    res.json({
      is_registered: true,
      customer_id: customer.id,
      name: customer.name,
      current_outstanding_balance: parseFloat(customer.balance || 0),
      this_month_khata: thisMonthKhata,
      prev_month_remaining_khata: prevMonthKhata,
      total_purchases: Math.round(totalPurchases * 100) / 100,
      total_payments: Math.round(totalPayments * 100) / 100,
      transactions: formattedTxs.reverse() // Return newest first for customer readability
    });
  } catch (err) {
    console.error('Error in employee-portal/khata:', err);
    res.status(500).json({ error: 'Failed to load employee Khata records' });
  }
});

module.exports = router;
