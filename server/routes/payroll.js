const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');



// GET all payroll settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payroll_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST update payroll settings
router.post('/settings', authenticateToken, isAdmin, async (req, res) => {
  const { global_overtime_rate, allowed_leaves } = req.body;
  try {
    if (global_overtime_rate !== undefined) {
      await pool.query(
        'INSERT INTO payroll_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        ['global_overtime_rate', String(global_overtime_rate)]
      );
    }
    if (allowed_leaves !== undefined) {
      await pool.query(
        'INSERT INTO payroll_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        ['allowed_leaves', String(allowed_leaves)]
      );
    }
    res.json({ message: 'Global settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all employee payroll settings overrides
router.get('/overrides', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employee_payroll_settings');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST save/update employee payroll overrides
router.post('/overrides/:employee_id', authenticateToken, isAdmin, async (req, res) => {
  const employee_id = req.params.employee_id;
  const { overtime_rate, base_salary, allowed_leaves } = req.body;
  try {
    if (base_salary !== undefined && base_salary !== '') {
      await pool.query('UPDATE employees SET salary = $1 WHERE id = $2', [parseFloat(base_salary), employee_id]);
    }
    const result = await pool.query(
      `INSERT INTO employee_payroll_settings (employee_id, overtime_rate, base_salary, allowed_leaves)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id) 
       DO UPDATE SET overtime_rate = $2, base_salary = $3, allowed_leaves = $4
       RETURNING *`,
      [
        employee_id,
        overtime_rate === undefined || overtime_rate === '' ? null : parseFloat(overtime_rate),
        base_salary === undefined || base_salary === '' ? null : parseFloat(base_salary),
        allowed_leaves === undefined || allowed_leaves === '' ? null : parseInt(allowed_leaves)
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST log manual leave in employee_attendance table
router.post('/leave', authenticateToken, async (req, res) => {
  const { employee_id, date, is_paid } = req.body;
  if (!employee_id || !date) {
    return res.status(400).json({ error: 'Employee ID and date are required' });
  }

  try {
    // Delete existing records for that employee on that date to prevent duplicates
    await pool.query(
      'DELETE FROM employee_attendance WHERE employee_id = $1 AND date = $2',
      [employee_id, date]
    );

    // Insert new leave record using local midnight string to prevent timezone shifts
    const result = await pool.query(
      "INSERT INTO employee_attendance (employee_id, check_in, status, date, is_paid) VALUES ($1, $2, 'Leave', $3, $4) RETURNING *",
      [employee_id, `${date} 00:00:00`, date, is_paid !== false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE remove manual leave from employee_attendance table
router.delete('/leave', authenticateToken, async (req, res) => {
  const { employee_id, date } = req.body;
  if (!employee_id || !date) {
    return res.status(400).json({ error: 'Employee ID and date are required' });
  }

  try {
    const result = await pool.query(
      "DELETE FROM employee_attendance WHERE employee_id = $1 AND date = $2 AND status = 'Leave' RETURNING *",
      [employee_id, date]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave log not found.' });
    }

    res.json({ message: 'Leave removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Calculate Monthly Payroll
router.get('/calculate', authenticateToken, async (req, res) => {
  const { month } = req.query; // format 'YYYY-MM'
  if (!month) {
    return res.status(400).json({ error: 'Month (YYYY-MM) is required' });
  }

  try {
    const [year, monthNum] = month.split('-').map(Number);
    const totalDaysInMonth = new Date(year, monthNum, 0).getDate();
    
    // Get global settings
    const settingsRes = await pool.query('SELECT * FROM payroll_settings');
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });
    const globalOvertimeRate = parseFloat(settings.global_overtime_rate || 150.00);
    const globalAllowedLeaves = parseInt(settings.allowed_leaves || 2);

    // Get adjustment types
    const adjTypesRes = await pool.query('SELECT * FROM payroll_adjustment_types');
    const adjTypes = adjTypesRes.rows;

    // Get employees
    const employeesRes = await pool.query("SELECT * FROM employees WHERE status = 'Active' ORDER BY id ASC");

    
    // Get overrides
    const overridesRes = await pool.query('SELECT * FROM employee_payroll_settings');
    const overridesMap = {};
    overridesRes.rows.forEach(r => { overridesMap[r.employee_id] = r; });

    // Get saved payroll records for the month
    const savedRecordsRes = await pool.query(
      'SELECT * FROM employee_payroll_records WHERE month = $1',
      [month]
    );
    const savedRecordsMap = {};
    savedRecordsRes.rows.forEach(r => {
      savedRecordsMap[r.employee_id] = r;
    });

    // Get recurring adjustments
    const recurringRes = await pool.query('SELECT * FROM employee_recurring_adjustments');
    const recurringMap = {};
    recurringRes.rows.forEach(r => {
      if (!recurringMap[r.employee_id]) recurringMap[r.employee_id] = [];
      recurringMap[r.employee_id].push(r);
    });

    // Get financial adjustments (one-time) for the month
    const financialRes = await pool.query(
      "SELECT * FROM employee_financial_adjustments WHERE TO_CHAR(date, 'YYYY-MM') = $1",
      [month]
    );
    const financialMap = {};
    financialRes.rows.forEach(r => {
      if (!financialMap[r.employee_id]) financialMap[r.employee_id] = [];
      financialMap[r.employee_id].push(r);
    });

    // Get attendance/leave logs for the selected month
    const logsRes = await pool.query(
      `SELECT ea.id, ea.employee_id, ea.check_in, ea.check_out, ea.status, ea.is_paid, ea.shift_hours, TO_CHAR(ea.date, 'YYYY-MM-DD') as date
       FROM employee_attendance ea
       WHERE TO_CHAR(ea.date, 'YYYY-MM') = $1
       ORDER BY ea.date ASC, ea.check_in ASC`,
      [month]
    );

    // Group logs by employee and by date
    const logsMap = {};
    logsRes.rows.forEach(row => {
      if (!logsMap[row.employee_id]) logsMap[row.employee_id] = {};
      if (!logsMap[row.employee_id][row.date]) logsMap[row.employee_id][row.date] = [];
      logsMap[row.employee_id][row.date].push(row);
    });

    const payrollReport = employeesRes.rows.map(emp => {
      const override = overridesMap[emp.id] || {};
      const baseSalary = override.base_salary !== undefined && override.base_salary !== null ? parseFloat(override.base_salary) : parseFloat(emp.salary || 0.0);
      const overtimeRate = override.overtime_rate !== undefined && override.overtime_rate !== null ? parseFloat(override.overtime_rate) : globalOvertimeRate;
      const allowedLeaves = override.allowed_leaves !== undefined && override.allowed_leaves !== null ? parseInt(override.allowed_leaves) : globalAllowedLeaves;

      // Calculate recurring and one-time adjustments dynamically
      let recurringAdjustmentsTotal = 0;
      let financialAdjustmentsTotal = 0;
      let calcAdvanceDeduction = 0;
      let calcBonus = 0;
      let calcLastMonthAdj = 0;
      let calcInternet = 0;
      let calcKafalat = 0;

      const calcDynamicAdjustments = {};

      const processAdjustment = (adj, isRecurring) => {
        let adjValue = 0;
        if (adj.amount_type === 'Percentage') {
          adjValue = baseSalary * (parseFloat(adj.amount) / 100);
        } else {
          adjValue = parseFloat(adj.amount);
        }

        if (isRecurring && adj.remaining_amount !== null && adj.remaining_amount !== undefined) {
           const remaining = parseFloat(adj.remaining_amount);
           if (adj.action_type === 'Deduct' && adjValue > remaining) {
             adjValue = remaining;
           }
        }

        const signedValue = (adj.action_type === 'Give' || adj.action_type === 'Add') ? adjValue : -adjValue;
        const label = (adj.custom_label || adj.type || '').toLowerCase();
        const originalLabel = adj.custom_label || adj.type || '';

        if (label === 'loan / advance deduction' || label === 'loan' || label === 'advance salary / loan') {
          calcAdvanceDeduction += (adj.action_type === 'Deduct') ? adjValue : -adjValue;
        } else if (label === 'bonus') {
          calcBonus += signedValue;
        } else if (label === 'last month adjustment') {
          calcLastMonthAdj += signedValue;
        } else if (label === 'internet') {
          calcInternet += (adj.action_type === 'Deduct') ? adjValue : -adjValue;
        } else if (label === 'kafalat') {
          calcKafalat += (adj.action_type === 'Deduct') ? adjValue : -adjValue;
        } else {
          // Check if it matches a dynamic column type
          const isDynamic = adjTypes.find(a => a.label.toLowerCase() === label);
          if (isDynamic) {
             if (!calcDynamicAdjustments[isDynamic.label]) calcDynamicAdjustments[isDynamic.label] = 0;
             // The dynamic column values in the UI are absolute. Let's make it so if it's 'Deduct' column, Deduct adds to the absolute value.
             const isDeductColumn = isDynamic.action === 'Deduct';
             if (isDeductColumn) {
                calcDynamicAdjustments[isDynamic.label] += (adj.action_type === 'Deduct') ? adjValue : -adjValue;
             } else {
                calcDynamicAdjustments[isDynamic.label] += ((adj.action_type === 'Give' || adj.action_type === 'Add') ? adjValue : -adjValue);
             }
          } else {
            if (isRecurring) recurringAdjustmentsTotal += signedValue;
            else financialAdjustmentsTotal += signedValue;
          }
        }
      };

      const recurringList = recurringMap[emp.id] || [];
      recurringList.forEach(adj => processAdjustment(adj, true));

      const financialList = financialMap[emp.id] || [];
      financialList.forEach(adj => processAdjustment(adj, false));

      // Get saved details if they exist
      const savedRecord = savedRecordsMap[emp.id];
      
      let manualAdjustments = financialAdjustmentsTotal;
      let finalRecurringAdjustments = recurringAdjustmentsTotal;
      let paymentStatus = 'Pending';
      let savedPaidAmount = null;
      let notes = '';

      if (savedRecord) {
        manualAdjustments = savedRecord.other_adjustments !== undefined && savedRecord.other_adjustments !== null ? parseFloat(savedRecord.other_adjustments) : 0.0;
        finalRecurringAdjustments = savedRecord.recurring_adjustments !== undefined && savedRecord.recurring_adjustments !== null ? parseFloat(savedRecord.recurring_adjustments) : 0.0;
        savedPaidAmount = savedRecord.paid_amount !== undefined && savedRecord.paid_amount !== null ? parseFloat(savedRecord.paid_amount) : null;
        paymentStatus = savedRecord.status || 'Pending';
        notes = savedRecord.notes || '';
      }

      const otherAdjustments = manualAdjustments + finalRecurringAdjustments;

      let presents = 0;
      let absents = 0;
      let holidays = 0;
      let leavesCount = 0;
      let paidLeaves = 0;
      let unpaidLeaves = 0;
      
      const standardShiftHours = parseFloat(emp.shift_hours || 12.0);
      const expectedMonthlyMinutes = standardShiftHours * totalDaysInMonth * 60;
      const perMinuteRate = expectedMonthlyMinutes > 0 ? baseSalary / expectedMonthlyMinutes : 0;

      let totalActualMinutes = 0;

      const empLogs = logsMap[emp.id] || {};
      const todayStr = new Date().toISOString().split('T')[0];

      // Loop through each day of the month to run calculations
      for (let day = 1; day <= totalDaysInMonth; day++) {
        const dayStr = `${month}-${String(day).padStart(2, '0')}`;
        const daySessions = empLogs[dayStr] || [];

        // Check if date is in the future
        if (dayStr > todayStr) {
          continue;
        }

        if (daySessions.length > 0) {
          const mainSession = daySessions[0];
          if (mainSession.status === 'Holiday') {
            holidays++;
            totalActualMinutes += (standardShiftHours * 60);
          } else if (mainSession.status === 'Leave') {
            leavesCount++;
            if (mainSession.is_paid) {
              paidLeaves++;
              totalActualMinutes += (standardShiftHours * 60);
            } else {
              unpaidLeaves++;
            }
          } else {
            presents++;
            daySessions.forEach(s => {
              if (s.check_in && s.check_out) {
                const inTime = new Date(s.check_in).getTime();
                const outTime = new Date(s.check_out).getTime();
                const breakTime = (s.total_break_duration_seconds || 0) * 1000;
                const workedMinutes = Math.max(0, (outTime - inTime - breakTime)) / (1000 * 60);
                totalActualMinutes += workedMinutes;
              }
            });
          }
        } else {
          // No record means absent for past days
          absents++;
        }
      }

      // If paid leaves exceed allowed leaves, convert excess to unpaid leaves
      if (paidLeaves > allowedLeaves) {
        const excess = paidLeaves - allowedLeaves;
        paidLeaves = allowedLeaves;
        unpaidLeaves += excess;
        // Also deduct the minutes we previously added
        totalActualMinutes -= (excess * standardShiftHours * 60);
      }

      // Calculations based on minutes
      let earnedSalary = totalActualMinutes * perMinuteRate;
      let deductions = 0;
      let overtimePay = 0;
      let totalOvertimeHours = 0;

      if (totalActualMinutes > expectedMonthlyMinutes) {
        const overtimeMinutes = totalActualMinutes - expectedMonthlyMinutes;
        totalOvertimeHours = overtimeMinutes / 60;
        overtimePay = overtimeMinutes * perMinuteRate;
        earnedSalary = baseSalary; // Max out regular earned salary
        deductions = 0;
      } else {
        deductions = baseSalary - earnedSalary;
      }
      
      const advanceBalance = emp.advance_balance ? parseFloat(emp.advance_balance) : 0;
      
      const isPaid = paymentStatus === 'Paid';

      const advanceDeduction = isPaid && savedRecord && savedRecord.advance_deduction !== undefined ? parseFloat(savedRecord.advance_deduction) : calcAdvanceDeduction;
      const bonus = isPaid && savedRecord && savedRecord.bonus !== undefined ? parseFloat(savedRecord.bonus) : calcBonus;
      const lastMonthAdj = isPaid && savedRecord && savedRecord.last_month_adjustment !== undefined ? parseFloat(savedRecord.last_month_adjustment) : calcLastMonthAdj;
      const internet = isPaid && savedRecord && savedRecord.internet !== undefined ? parseFloat(savedRecord.internet) : calcInternet;
      const kafalat = isPaid && savedRecord && savedRecord.kafalat !== undefined ? parseFloat(savedRecord.kafalat) : calcKafalat;

      const dynamicAdjustmentsObj = isPaid && savedRecord && savedRecord.dynamic_adjustments ? savedRecord.dynamic_adjustments : calcDynamicAdjustments;
      
      let dynamicAdjustmentsTotal = 0;
      adjTypes.forEach(adj => {
        const val = parseFloat(dynamicAdjustmentsObj[adj.label] || 0);
        if (adj.action === 'Add') {
          dynamicAdjustmentsTotal += val;
        } else if (adj.action === 'Deduct') {
          dynamicAdjustmentsTotal -= val;
        }
      });

      const dynamicNetSalary = Math.max(0, earnedSalary + overtimePay + otherAdjustments + bonus + lastMonthAdj - internet - kafalat - advanceDeduction + dynamicAdjustmentsTotal);
      const paidAmount = savedPaidAmount !== null ? savedPaidAmount : dynamicNetSalary;

      return {
        id: emp.id,
        employee_id: emp.employee_id || `EMP-${String(emp.id).padStart(4, '0')}`,
        name: emp.name,
        role: emp.role,
        position: emp.position || '',
        shift: emp.shift || 'R1',
        shift_hours: standardShiftHours,
        expected_hours: expectedMonthlyMinutes / 60,
        actual_hours: parseFloat((totalActualMinutes / 60).toFixed(2)),
        base_salary: baseSalary,
        overtime_rate: overtimeRate,
        allowed_leaves: allowedLeaves,
        presents,
        absents,
        holidays,
        leaves: leavesCount,
        paid_leaves: paidLeaves,
        unpaid_leaves: unpaidLeaves,
        overtime_hours: parseFloat(totalOvertimeHours.toFixed(2)),
        overtime_pay: parseFloat(overtimePay.toFixed(2)),
        deductions: parseFloat(deductions.toFixed(2)),
        other_adjustments: manualAdjustments,
        recurring_adjustments: finalRecurringAdjustments,
        bonus,
        last_month_adjustment: lastMonthAdj,
        internet,
        kafalat,
        advance_balance: advanceBalance,
        advance_deduction: advanceDeduction,
        calc_advance_deduction: calcAdvanceDeduction,
        calc_bonus: calcBonus,
        calc_last_month_adjustment: calcLastMonthAdj,
        calc_internet: calcInternet,
        calc_kafalat: calcKafalat,
        dynamic_adjustments: dynamicAdjustmentsObj,
        net_salary: parseFloat(dynamicNetSalary.toFixed(2)),
        paid_amount: parseFloat(paidAmount.toFixed(2)),
        status: paymentStatus,
        notes: notes,
        branch: emp.branch || '',
        department: emp.department || ''
      };
    });

    res.json(payrollReport);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const syncSpreadsheetAdjustment = async (client, employee_id, month, label, expectedTotal, isDeductionLabel) => {
  const [yyyy, mm] = month.split('-');
  const lastDay = new Date(yyyy, mm, 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  // Fetch One-Time
  const oneTimeRes = await client.query(
    `SELECT id, amount, action_type FROM employee_financial_adjustments
     WHERE employee_id = $1 AND custom_label ILIKE $2 AND date >= $3 AND date <= $4`,
    [employee_id, label, monthStart, monthEnd]
  );
  
  // Fetch Recurring
  const recurringRes = await client.query(
    `SELECT id, amount, action_type FROM employee_recurring_adjustments
     WHERE employee_id = $1 AND custom_label ILIKE $2 AND start_date <= $4`,
    [employee_id, label, monthEnd]
  );
  
  const allAdjs = [
    ...oneTimeRes.rows.map(r => ({...r, type: 'One-Time'})),
    ...recurringRes.rows.map(r => ({...r, type: 'Repeated'}))
  ];
  
  let currentSum = 0;
  allAdjs.forEach(adj => {
    const val = parseFloat(adj.amount);
    if (isDeductionLabel) {
      currentSum += (adj.action_type === 'Deduct' ? val : -val);
    } else {
      currentSum += ((adj.action_type === 'Give' || adj.action_type === 'Add') ? val : -val);
    }
  });

  const diff = expectedTotal - currentSum;
  if (Math.abs(diff) < 0.01) return; // No change needed

  if (allAdjs.length === 1) {
    const adj = allAdjs[0];
    let currentVal = parseFloat(adj.amount);
    let newVal;
    if (isDeductionLabel) {
       newVal = (adj.action_type === 'Deduct' ? currentVal : -currentVal) + diff;
    } else {
       newVal = ((adj.action_type === 'Give' || adj.action_type === 'Add') ? currentVal : -currentVal) + diff;
    }
    
    let newAction = adj.action_type;
    if (newVal < 0) {
      newVal = Math.abs(newVal);
      if (isDeductionLabel) {
        newAction = (adj.action_type === 'Deduct') ? 'Give' : 'Deduct';
      } else {
        newAction = ((adj.action_type === 'Give' || adj.action_type === 'Add')) ? 'Deduct' : 'Give';
      }
    }
    
    if (adj.type === 'One-Time') {
      await client.query(`UPDATE employee_financial_adjustments SET amount = $1, action_type = $2 WHERE id = $3`, [newVal, newAction, adj.id]);
    } else {
      await client.query(`UPDATE employee_recurring_adjustments SET amount = $1, action_type = $2 WHERE id = $3`, [newVal, newAction, adj.id]);
    }
  } else {
    // If 0 or >1, just create a new one-time adjustment for the diff
    let newAction;
    let insertVal = diff;
    if (isDeductionLabel) {
       newAction = diff > 0 ? 'Deduct' : 'Give';
       insertVal = Math.abs(diff);
    } else {
       newAction = diff > 0 ? 'Give' : 'Deduct';
       insertVal = Math.abs(diff);
    }
    
    await client.query(
      `INSERT INTO employee_financial_adjustments (employee_id, action_type, amount, date, notes, custom_label)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [employee_id, newAction, insertVal, `${month}-15`, 'Added from spreadsheet', label] // Using middle of month
    );
  }
};

router.post('/record', authenticateToken, isAdmin, async (req, res) => {
  const {
    employee_id,
    month,
    base_salary,
    presents,
    absents,
    leaves,
    holidays,
    overtime_hours,
    overtime_pay,
    deductions,
    other_adjustments,
    advance_deduction,
    bonus,
    last_month_adjustment,
    internet,
    kafalat,
    calc_advance_deduction,
    calc_bonus,
    calc_last_month_adjustment,
    calc_internet,
    calc_kafalat,
    expected_hours,
    actual_hours,
    net_salary,
    paid_amount,
    status,
    notes,
    zero_out_advance,
    recurring_adjustments,
    dynamic_adjustments
  } = req.body;

  if (!employee_id || !month) {
    return res.status(400).json({ error: 'Employee ID and month are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch old record to see if we are transitioning to Paid
    const oldRecRes = await client.query('SELECT status FROM employee_payroll_records WHERE employee_id = $1 AND month = $2', [employee_id, month]);
    const oldStatus = oldRecRes.rows.length > 0 ? oldRecRes.rows[0].status : null;

    await syncSpreadsheetAdjustment(client, employee_id, month, 'Advance Salary / Loan', parseFloat(advance_deduction || 0), true);
    await syncSpreadsheetAdjustment(client, employee_id, month, 'Bonus', parseFloat(bonus || 0), false);
    await syncSpreadsheetAdjustment(client, employee_id, month, 'Last Month Adjustment', parseFloat(last_month_adjustment || 0), false);
    await syncSpreadsheetAdjustment(client, employee_id, month, 'Internet', parseFloat(internet || 0), true);
    await syncSpreadsheetAdjustment(client, employee_id, month, 'Kafalat', parseFloat(kafalat || 0), true);

    const adjTypesRes = await client.query(`SELECT label, action FROM payroll_adjustment_types`);
    const dynamicAdjustmentsObj = dynamic_adjustments || {};
    
    for (const adjType of adjTypesRes.rows) {
      if (dynamicAdjustmentsObj[adjType.label] !== undefined) {
        const expectedTotal = parseFloat(dynamicAdjustmentsObj[adjType.label] || 0);
        const isDeduct = adjType.action === 'Deduct';
        await syncSpreadsheetAdjustment(client, employee_id, month, adjType.label, expectedTotal, isDeduct);
      }
    }

    const result = await client.query(
      `INSERT INTO employee_payroll_records (
        employee_id, month, base_salary, presents, absents, leaves, holidays, overtime_hours, overtime_pay, deductions,
        other_adjustments, advance_deduction, recurring_adjustments, bonus, last_month_adjustment, internet, kafalat, expected_hours, actual_hours, dynamic_adjustments, net_salary, paid_amount, status, notes, paid_date
      ) VALUES (
        $1, $2::text, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $22, $23::text, $24::text, CASE WHEN $23::text = 'Paid' THEN NOW() ELSE NULL END
      ) ON CONFLICT (employee_id, month) DO UPDATE SET
        base_salary = EXCLUDED.base_salary,
        presents = EXCLUDED.presents,
        absents = EXCLUDED.absents,
        leaves = EXCLUDED.leaves,
        holidays = EXCLUDED.holidays,
        overtime_hours = EXCLUDED.overtime_hours,
        overtime_pay = EXCLUDED.overtime_pay,
        deductions = EXCLUDED.deductions,
        other_adjustments = EXCLUDED.other_adjustments,
        advance_deduction = EXCLUDED.advance_deduction,
        recurring_adjustments = EXCLUDED.recurring_adjustments,
        bonus = EXCLUDED.bonus,
        last_month_adjustment = EXCLUDED.last_month_adjustment,
        internet = EXCLUDED.internet,
        kafalat = EXCLUDED.kafalat,
        expected_hours = EXCLUDED.expected_hours,
        actual_hours = EXCLUDED.actual_hours,
        dynamic_adjustments = EXCLUDED.dynamic_adjustments,
        net_salary = EXCLUDED.net_salary,
        paid_amount = EXCLUDED.paid_amount,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        paid_date = CASE WHEN EXCLUDED.status = 'Paid' AND employee_payroll_records.status != 'Paid' THEN NOW() ELSE employee_payroll_records.paid_date END
      RETURNING *`,
      [
        employee_id,
        month,
        parseFloat(base_salary || 0),
        parseInt(presents || 0),
        parseInt(absents || 0),
        parseInt(leaves || 0),
        parseInt(holidays || 0),
        parseFloat(overtime_hours || 0),
        parseFloat(overtime_pay || 0),
        parseFloat(deductions || 0),
        parseFloat(other_adjustments || 0),
        parseFloat(advance_deduction || 0),
        parseFloat(recurring_adjustments || 0),
        parseFloat(bonus || 0),
        parseFloat(last_month_adjustment || 0),
        parseFloat(internet || 0),
        parseFloat(kafalat || 0),
        parseFloat(expected_hours || 0),
        parseFloat(actual_hours || 0),
        JSON.stringify(dynamic_adjustments || {}),
        parseFloat(net_salary || 0),
        parseFloat(paid_amount || 0),
        status,
        notes
      ]
    );

    // Update employee advance balance if advance is deducted or zeroed out
    if (status === 'Paid' && oldStatus !== 'Paid') {
      const advDeduct = parseFloat(advance_deduction || 0);
      
      if (zero_out_advance) {
        await client.query('UPDATE employees SET advance_balance = 0 WHERE id = $1', [employee_id]);
      } else if (advDeduct > 0) {
        await client.query('UPDATE employees SET advance_balance = GREATEST(0, advance_balance - $1) WHERE id = $2', [advDeduct, employee_id]);
      }
      
      // Also update remaining_amount in employee_recurring_adjustments
      // We will deduct the monthly amount for any active deductions
      const recurringRes = await client.query('SELECT * FROM employee_recurring_adjustments WHERE employee_id = $1 AND remaining_amount IS NOT NULL AND remaining_amount > 0 AND action_type = $2', [employee_id, 'Deduct']);
      for (const adj of recurringRes.rows) {
        let adjValue = 0;
        if (adj.amount_type === 'Percentage') {
           adjValue = parseFloat(base_salary || 0) * (parseFloat(adj.amount) / 100);
        } else {
           adjValue = parseFloat(adj.amount);
        }
        const remaining = parseFloat(adj.remaining_amount);
        const toDeduct = Math.min(adjValue, remaining);
        if (toDeduct > 0) {
          await client.query('UPDATE employee_recurring_adjustments SET remaining_amount = GREATEST(0, remaining_amount - $1) WHERE id = $2', [toDeduct, adj.id]);
        }
      }
    } else if (status !== 'Paid' && oldStatus === 'Paid') {
      // Revert if status changes back from Paid
      // For now, we only revert recurring adjustments if needed, but since we didn't store exactly what was deducted per adjustment, it's tricky.
      // A robust implementation would store the exact deduction breakdown in another table.
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET all payroll adjustment types
router.get('/adjustment-types', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payroll_adjustment_types ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new payroll adjustment type
router.post('/adjustment-types', authenticateToken, isAdmin, async (req, res) => {
  const { label, type, action } = req.body;
  if (!label || !type || !action) {
    return res.status(400).json({ error: 'Label, type, and action are required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO payroll_adjustment_types (label, type, action) VALUES ($1, $2, $3) RETURNING *',
      [label, type, action]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'An adjustment type with this label already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT edit payroll adjustment type
router.put('/adjustment-types/:id', authenticateToken, isAdmin, async (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'Label is required' });
  try {
    const result = await pool.query(
      'UPDATE payroll_adjustment_types SET label = $1 WHERE id = $2 RETURNING *',
      [label, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Adjustment type not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'An adjustment type with this label already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE payroll adjustment type
router.delete('/adjustment-types/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM payroll_adjustment_types WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Adjustment type not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add advance to employee
router.post('/advance/:employee_id', authenticateToken, isAdmin, async (req, res) => {
  const { amount, monthly_deduction } = req.body;
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE employees SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2 RETURNING advance_balance',
      [parseFloat(amount), req.params.employee_id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (monthly_deduction && parseFloat(monthly_deduction) > 0) {
      const today = new Date().toISOString().split('T')[0];
      await client.query(
        `INSERT INTO employee_recurring_adjustments 
         (employee_id, type, custom_label, amount, action_type, remaining_amount, start_date) 
         VALUES ($1, 'Advance Recovery', 'Monthly Cut', $2, 'Deduct', $3, $4)`,
        [req.params.employee_id, parseFloat(monthly_deduction), parseFloat(amount), today]
      );
    }

    await client.query('COMMIT');
    res.json({ advance_balance: result.rows[0].advance_balance });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET recurring adjustments for an employee
router.get('/recurring-adjustments/:employee_id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM employee_recurring_adjustments WHERE employee_id = $1 ORDER BY created_at DESC',
      [req.params.employee_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new recurring adjustment
router.post('/recurring-adjustments', authenticateToken, isAdmin, async (req, res) => {
  const { employee_id, type, custom_label, amount, amount_type, action_type, remaining_amount, start_date } = req.body;
  if (!employee_id || !type || !amount || !action_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO employee_recurring_adjustments 
       (employee_id, type, custom_label, amount, amount_type, action_type, remaining_amount, start_date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [employee_id, type, custom_label, parseFloat(amount), amount_type || 'Fixed', action_type, remaining_amount ? parseFloat(remaining_amount) : null, start_date || new Date()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE recurring adjustment
router.delete('/recurring-adjustments/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM employee_recurring_adjustments WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT (Edit) recurring adjustment
router.put('/recurring-adjustments/:id', authenticateToken, isAdmin, async (req, res) => {
  const { custom_label, amount, action_type, remaining_amount, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE employee_recurring_adjustments 
       SET custom_label = $1, amount = $2, action_type = $3, remaining_amount = $4, notes = $5
       WHERE id = $6 RETURNING *`,
      [custom_label, parseFloat(amount), action_type, remaining_amount ? parseFloat(remaining_amount) : null, notes || '', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new financial adjustment (One-Time)
router.post('/financial-adjustments', authenticateToken, isAdmin, async (req, res) => {
  const { employee_id, type, custom_label, amount, action_type, date, notes } = req.body;
  if (!employee_id || !type || !amount || !action_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO employee_financial_adjustments 
       (employee_id, type, custom_label, amount, action_type, date, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [employee_id, type, custom_label, parseFloat(amount), action_type, date || new Date().toISOString().split('T')[0], notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET financial adjustments for an employee
router.get('/adjustments/:employee_id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM employee_financial_adjustments WHERE employee_id = $1 ORDER BY date DESC, created_at DESC',
      [req.params.employee_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new financial adjustment
router.post('/adjustments', authenticateToken, isAdmin, async (req, res) => {
  const { employee_id, type, custom_label, amount, action_type, date, notes } = req.body;
  if (!employee_id || !type || !amount || !action_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert the adjustment
    const result = await client.query(
      `INSERT INTO employee_financial_adjustments (employee_id, type, custom_label, amount, action_type, date, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [employee_id, type, custom_label, parseFloat(amount), action_type, date || new Date(), notes]
    );

    // If it's a Loan/Advance Salary, update the advance_balance in employees table
    if (type === 'Advance Salary / Loan') {
      if (action_type === 'Give') {
        // Giving a loan increases the advance balance
        await client.query(
          'UPDATE employees SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2',
          [parseFloat(amount), employee_id]
        );
      } else if (action_type === 'Deduct') {
        // Deducting (recovering) a loan decreases the advance balance
        await client.query(
          'UPDATE employees SET advance_balance = GREATEST(COALESCE(advance_balance, 0) - $1, 0) WHERE id = $2',
          [parseFloat(amount), employee_id]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE financial adjustment
router.delete('/adjustments/:id', authenticateToken, isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query('SELECT * FROM employee_financial_adjustments WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const adj = check.rows[0];

    // Revert the advance balance if applicable
    if (adj.type === 'Advance Salary / Loan') {
      if (adj.action_type === 'Give') {
        await client.query(
          'UPDATE employees SET advance_balance = GREATEST(COALESCE(advance_balance, 0) - $1, 0) WHERE id = $2',
          [adj.amount, adj.employee_id]
        );
      } else if (adj.action_type === 'Deduct') {
        await client.query(
          'UPDATE employees SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2',
          [adj.amount, adj.employee_id]
        );
      }
    }

    await client.query('DELETE FROM employee_financial_adjustments WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT (Edit) financial adjustment
router.put('/financial-adjustments/:id', authenticateToken, isAdmin, async (req, res) => {
  const { custom_label, amount, action_type, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE employee_financial_adjustments 
       SET custom_label = $1, amount = $2, action_type = $3, notes = $4
       WHERE id = $5 RETURNING *`,
      [custom_label, parseFloat(amount), action_type, notes || '', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT financial adjustment (Edit)
router.put('/adjustments/:id', authenticateToken, isAdmin, async (req, res) => {
  const { type, custom_label, action_type, amount, date, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query('SELECT * FROM employee_financial_adjustments WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Adjustment not found' });
    }
    const oldAdj = check.rows[0];
    const employee_id = oldAdj.employee_id;

    // 1. Revert old impact
    if (oldAdj.type === 'Advance Salary / Loan') {
      if (oldAdj.action_type === 'Give') {
        await client.query('UPDATE employees SET advance_balance = GREATEST(COALESCE(advance_balance, 0) - $1, 0) WHERE id = $2', [oldAdj.amount, employee_id]);
      } else if (oldAdj.action_type === 'Deduct') {
        await client.query('UPDATE employees SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [oldAdj.amount, employee_id]);
      }
    }

    // 2. Update record
    const result = await client.query(
      'UPDATE employee_financial_adjustments SET type=$1, custom_label=$2, action_type=$3, amount=$4, date=$5, notes=$6 WHERE id=$7 RETURNING *',
      [type, custom_label || null, action_type, parseFloat(amount), date, notes || null, req.params.id]
    );

    // 3. Apply new impact
    if (type === 'Advance Salary / Loan') {
      if (action_type === 'Give') {
        await client.query('UPDATE employees SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [parseFloat(amount), employee_id]);
      } else if (action_type === 'Deduct') {
        await client.query('UPDATE employees SET advance_balance = GREATEST(COALESCE(advance_balance, 0) - $1, 0) WHERE id = $2', [parseFloat(amount), employee_id]);
      }
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET recurring adjustments for an employee
router.get('/recurring/:employee_id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employee_recurring_adjustments WHERE employee_id = $1 ORDER BY created_at DESC', [req.params.employee_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST recurring adjustment
router.post('/recurring', authenticateToken, isAdmin, async (req, res) => {
  const { employee_id, type, label, action_type, amount_type, amount, total_amount } = req.body;
  try {
    const tAmount = total_amount ? parseFloat(total_amount) : null;
    const result = await pool.query(
      'INSERT INTO employee_recurring_adjustments (employee_id, type, label, action_type, amount_type, amount, total_amount, remaining_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [employee_id, type, label || null, action_type, amount_type, parseFloat(amount), tAmount, tAmount]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT recurring adjustment
router.put('/recurring/:id', authenticateToken, isAdmin, async (req, res) => {
  const { type, label, action_type, amount_type, amount, total_amount, remaining_amount } = req.body;
  try {
    const tAmount = total_amount !== undefined ? (total_amount ? parseFloat(total_amount) : null) : undefined;
    const rAmount = remaining_amount !== undefined ? (remaining_amount ? parseFloat(remaining_amount) : null) : undefined;
    
    let query = 'UPDATE employee_recurring_adjustments SET type=$1, label=$2, action_type=$3, amount_type=$4, amount=$5';
    let params = [type, label || null, action_type, amount_type, parseFloat(amount)];
    
    if (tAmount !== undefined) {
      params.push(tAmount);
      query += `, total_amount=$${params.length}`;
    }
    if (rAmount !== undefined) {
      params.push(rAmount);
      query += `, remaining_amount=$${params.length}`;
    }
    
    params.push(req.params.id);
    query += ` WHERE id=$${params.length} RETURNING *`;
    
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE recurring adjustment
router.delete('/recurring/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM employee_recurring_adjustments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
