const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { clampBreakLogsToDutyWindow } = require('../utils/attendanceHelper');



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
    const settingsRes = await pool.query('SELECT * FROM "payroll_settings"');
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });
    const globalOvertimeRate = parseFloat(settings.global_overtime_rate || 150.00);
    const globalAllowedLeaves = parseInt(settings.allowed_leaves || 2);

    // Get adjustment types
    const adjTypesRes = await pool.query('SELECT * FROM "payroll_adjustment_types"');
    const adjTypes = adjTypesRes.rows;

    // Get employees
    const employeesRes = await pool.query("SELECT * FROM \"employees\" WHERE status = 'Active' ORDER BY id ASC");
    
    // Get overrides
    const overridesRes = await pool.query('SELECT * FROM "employee_payroll_settings"');
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

    // Calculate previous month string (YYYY-MM)
    let prevYear = year;
    let prevMonthNum = monthNum - 1;
    if (prevMonthNum === 0) {
      prevMonthNum = 12;
      prevYear = year - 1;
    }
    const prevMonthStr = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`;

    // Get previous month's saved records to calculate unpaid balance / overpaid adjustment
    const prevRecordsRes = await pool.query(
      'SELECT employee_id, net_salary, paid_amount, status FROM employee_payroll_records WHERE month = $1',
      [prevMonthStr]
    );
    const prevRecordsMap = {};
    prevRecordsRes.rows.forEach(r => {
      prevRecordsMap[r.employee_id] = r;
    });

    // Calculate next month string (YYYY-MM) to check if already carried forward to next month
    let nextYear = year;
    let nextMonthNum = monthNum + 1;
    if (nextMonthNum > 12) {
      nextMonthNum = 1;
      nextYear = year + 1;
    }
    const nextMonthStr = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}`;

    const nextRecordsRes = await pool.query(
      'SELECT employee_id, last_month_balance FROM employee_payroll_records WHERE month = $1',
      [nextMonthStr]
    );
    const nextRecordsMap = {};
    nextRecordsRes.rows.forEach(r => {
      nextRecordsMap[r.employee_id] = r;
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
      `SELECT ea.id, ea.employee_id, ea.check_in, ea.check_out, ea.status, ea.is_paid, ea.shift_hours, ea.total_break_duration_seconds, ea.break_logs, TO_CHAR(ea.date, 'YYYY-MM-DD') as date
       FROM employee_attendance ea
       WHERE TO_CHAR(ea.date, 'YYYY-MM') = $1
       ORDER BY ea.date ASC, ea.check_in ASC`,
      [month]
    );

    // Group logs by employee and by date, pre-computing hours_worked identically to the attendance route
    const logsMap = {};
    logsRes.rows.forEach(row => {
      if (!logsMap[row.employee_id]) logsMap[row.employee_id] = {};
      if (!logsMap[row.employee_id][row.date]) logsMap[row.employee_id][row.date] = [];
      
      // Pre-compute hours_worked exactly like the attendance /reports endpoint
      let hours_worked = 0;
      if (row.status !== 'Holiday' && row.status !== 'Leave') {
        const checkInTime = row.check_in ? new Date(row.check_in).getTime() : null;
        const checkOutTime = row.check_out ? new Date(row.check_out).getTime() : null;
        
        const rowBreakLogs = Array.isArray(row.break_logs) 
          ? row.break_logs 
          : (typeof row.break_logs === 'string' ? JSON.parse(row.break_logs || '[]') : []);
        
        let breakSecs = parseInt(row.total_break_duration_seconds) || 0;
        if (rowBreakLogs.length > 0 && checkOutTime) {
          const clamped = clampBreakLogsToDutyWindow(rowBreakLogs, row.check_in, row.check_out);
          breakSecs = clamped.totalBreakSecs;
        } else if (checkOutTime && checkInTime) {
          const maxPossibleBreak = Math.max(0, Math.floor((checkOutTime - checkInTime) / 1000));
          breakSecs = Math.min(breakSecs, maxPossibleBreak);
        }
        
        if (checkInTime && checkOutTime) {
          const netMs = checkOutTime - checkInTime - (breakSecs * 1000);
          hours_worked = Math.max(0, netMs / (1000 * 60 * 60));
        } else if (checkInTime && !checkOutTime) {
          // Active session (no checkout yet) — use current time, same as attendance route
          const netMs = Date.now() - checkInTime - (breakSecs * 1000);
          hours_worked = Math.max(0, netMs / (1000 * 60 * 60));
        }
      }
      row.hours_worked = hours_worked;
      
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

        if (label.includes('advance') || label.includes('loan') || label === 'this m. adv' || label === 'adv') {
          calcAdvanceDeduction += (adj.action_type === 'Deduct') ? adjValue : -adjValue;
        } else if (label.includes('bonus')) {
          calcBonus += signedValue;
        } else if (label.includes('last month') || label === 'last month adjustment' || label === 'last month bal') {
          calcLastMonthAdj += signedValue;
        } else if (label.includes('internet') || label === 'net' || label.includes('wifi')) {
          calcInternet += (adj.action_type === 'Deduct') ? adjValue : -adjValue;
        } else if (label.includes('kafalat')) {
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
      const isSavedPaid = savedRecord && savedRecord.status === 'Paid';
      
      let manualAdjustments = financialAdjustmentsTotal;
      let finalRecurringAdjustments = recurringAdjustmentsTotal;
      let paymentStatus = savedRecord?.status || 'Pending';
      let savedPaidAmount = null;
      let notes = savedRecord?.notes || '';

      if (isSavedPaid) {
        if (savedRecord.other_adjustments !== undefined && savedRecord.other_adjustments !== null) {
          manualAdjustments = parseFloat(savedRecord.other_adjustments);
        }
        if (savedRecord.recurring_adjustments !== undefined && savedRecord.recurring_adjustments !== null) {
          finalRecurringAdjustments = parseFloat(savedRecord.recurring_adjustments);
        }
        savedPaidAmount = savedRecord.paid_amount !== undefined && savedRecord.paid_amount !== null ? parseFloat(savedRecord.paid_amount) : null;
      }

      const otherAdjustments = manualAdjustments + finalRecurringAdjustments;

      let presents = 0;
      let absents = 0;
      let holidays = 0;
      let leavesCount = 0;
      let paidLeaves = 0;
      let unpaidLeaves = 0;
      let paidLeaveHours = 0;
      
      const standardShiftHours = parseFloat(emp.shift_hours || 12.0);
      // Scheduled hours for the full month (e.g. 31 days * 12h = 372h)
      const expectedMonthlyHours = standardShiftHours * totalDaysInMonth;
      const expectedMonthlyMinutes = expectedMonthlyHours * 60;
      const perMinuteRate = expectedMonthlyMinutes > 0 ? (baseSalary / expectedMonthlyMinutes) : 0;
      const perHourRate = expectedMonthlyHours > 0 ? (baseSalary / expectedMonthlyHours) : 0;

      const empLogs = logsMap[emp.id] || {};
      const todayStr = new Date().toISOString().split('T')[0];

      let expectedDutyHours = 0;
      let workedDutyHours = 0;
      let onlyOvertimeDays = 0;
      let onlyOvertimeHours = 0;
      let otherOvertimeHours = 0;
      let lateDays = 0;

      const dailyBreakdown = [];
      let calOvertimeMins = 0;
      let calShortageMins = 0;

      // Loop through each day of the month to run calculations identical to AttendanceReports
      for (let day = 1; day <= totalDaysInMonth; day++) {
        const dayStr = `${month}-${String(day).padStart(2, '0')}`;
        const daySessions = empLogs[dayStr] || [];
        const dateObj = new Date(`${dayStr}T12:00:00+03:00`);
        const dayFormatted = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

        // Check if date is in the future
        if (dayStr > todayStr) {
          dailyBreakdown.push({
            date: dayStr,
            formattedDate: dayFormatted,
            day,
            status: 'Future',
            hours_worked: 0,
            shift_hours: standardShiftHours,
            ot_minutes: 0,
            short_minutes: 0,
            isFuture: true
          });
          continue;
        }

        let dayStatus = 'Present';
        let dayHours = 0;
        let dayOtMinutes = 0;
        let dayShortMinutes = 0;
        let currentDayShiftHours = standardShiftHours;

        if (daySessions.length > 0) {
          if (daySessions.some(s => s.status === 'Late' || s.is_late)) {
            lateDays++;
            dayStatus = 'Late';
          }

          const mainSession = daySessions[0];
          currentDayShiftHours = parseFloat(mainSession.shift_hours || emp.shift_hours || 12.0);

          if (mainSession.status === 'Holiday') {
            holidays++;
            dayStatus = 'Holiday';
          } else if (mainSession.status === 'Leave') {
            leavesCount++;
            dayStatus = 'Leave';
            if (mainSession.is_paid) {
              paidLeaves++;
              paidLeaveHours += standardShiftHours;
            } else {
              unpaidLeaves++;
            }
          } else {
            // Sum all hours worked on this day using pre-computed hours_worked
            daySessions.forEach(s => {
              dayHours += s.hours_worked || 0;
            });
            dayHours = Math.min(24, dayHours); // Cap to 24 hours max per day

            if (dayHours >= 6.0) {
              presents++;
              expectedDutyHours += currentDayShiftHours;
              workedDutyHours += Math.min(currentDayShiftHours, dayHours);
              otherOvertimeHours += Math.max(0, dayHours - currentDayShiftHours);
            } else if (dayHours > 0) {
              onlyOvertimeDays++;
              onlyOvertimeHours += dayHours;
            }

            const diffMins = Math.round((dayHours - currentDayShiftHours) * 60);
            if (diffMins > 0) {
              dayOtMinutes = diffMins;
              calOvertimeMins += diffMins;
            } else if (diffMins < 0) {
              dayShortMinutes = Math.abs(diffMins);
              calShortageMins += Math.abs(diffMins);
            }
          }
        } else {
          // No record means absent for past days
          absents++;
          dayStatus = 'Absent';
          dayShortMinutes = Math.round(standardShiftHours * 60);
          calShortageMins += dayShortMinutes;
        }

        dailyBreakdown.push({
          date: dayStr,
          formattedDate: dayFormatted,
          day,
          status: dayStatus,
          hours_worked: parseFloat(dayHours.toFixed(2)),
          shift_hours: currentDayShiftHours,
          ot_minutes: dayOtMinutes,
          short_minutes: dayShortMinutes,
          isFuture: false
        });
      }

      // If paid leaves exceed allowed leaves, convert excess to unpaid leaves
      if (paidLeaves > allowedLeaves) {
        const excess = paidLeaves - allowedLeaves;
        paidLeaves = allowedLeaves;
        unpaidLeaves += excess;
        paidLeaveHours = paidLeaves * standardShiftHours;
      }

      // Calculate attendance sheet metrics
      expectedDutyHours = Math.round(expectedDutyHours * 100) / 100;
      workedDutyHours = Math.round(workedDutyHours * 100) / 100;
      const shortDutyHours = Math.max(0, Math.round((expectedDutyHours - workedDutyHours) * 100) / 100);
      const rawOvertimeHours = Math.round((onlyOvertimeHours + otherOvertimeHours) * 100) / 100;
      const netOvertimeHours = Math.round((rawOvertimeHours - shortDutyHours) * 100) / 100; // Total OT (±)
      
      // attendanceTotalHours is Total (Duty ± OT) from Attendance Sheet = workedDutyHours + rawOvertimeHours
      const attendanceTotalHours = Math.max(0, Math.round((workedDutyHours + rawOvertimeHours) * 100) / 100);

      // Total actual working hours credited for salary including paid leaves & holidays
      const totalActualHours = Math.max(0, Math.round((attendanceTotalHours + paidLeaveHours + (holidays * standardShiftHours)) * 100) / 100);
      const totalActualMinutes = Math.round(totalActualHours * 60);

      // Salary calculations:
      // totalActualMinutes is (workedDutyHours + rawOvertimeHours + paidLeaveHours + holidays) * 60.
      // Net Overtime is reflected in the Overtime column and earnedSalary.
      let earnedSalary = Math.round(totalActualMinutes * perMinuteRate * 100) / 100;
      let deductions = Math.max(0, Math.round((baseSalary - earnedSalary) * 100) / 100);
      const netOvertimeMinutes = Math.round(netOvertimeHours * 60);
      let overtimePay = Math.round(netOvertimeMinutes * perMinuteRate * 100) / 100;
      let overtimeHours = netOvertimeHours;
      
      const advanceBalance = emp.advance_balance ? parseFloat(emp.advance_balance) : 0;
      
      let advanceDeduction = calcAdvanceDeduction;
      let bonus = calcBonus;
      let lastMonthAdj = calcLastMonthAdj;
      let internet = calcInternet;
      let kafalat = calcKafalat;
      let dynamicAdjustmentsObj = { ...calcDynamicAdjustments };

      // Only preserve frozen adjustments if record was already Paid and locked
      if (isSavedPaid) {
        if (savedRecord.advance_deduction !== undefined) advanceDeduction = parseFloat(savedRecord.advance_deduction);
        if (savedRecord.bonus !== undefined) bonus = parseFloat(savedRecord.bonus);
        if (savedRecord.last_month_adjustment !== undefined) lastMonthAdj = parseFloat(savedRecord.last_month_adjustment);
        if (savedRecord.internet !== undefined) internet = parseFloat(savedRecord.internet);
        if (savedRecord.kafalat !== undefined) kafalat = parseFloat(savedRecord.kafalat);
        dynamicAdjustmentsObj = { ...(savedRecord.dynamic_adjustments || {}), ...calcDynamicAdjustments };
      }
      
      let dynamicAdjustmentsTotal = 0;
      adjTypes.forEach(adj => {
        const val = parseFloat(dynamicAdjustmentsObj[adj.label] || 0);
        if (adj.action === 'Add' || adj.action === 'Both') {
          dynamicAdjustmentsTotal += val;
        } else if (adj.action === 'Deduct') {
          dynamicAdjustmentsTotal -= val;
        }
      });

      // Last month balance calculation (unpaid balance or overpaid carryover)
      let lastMonthBalance = 0;
      if (savedRecord && savedRecord.last_month_balance !== undefined && savedRecord.last_month_balance !== null && parseFloat(savedRecord.last_month_balance) !== 0) {
        lastMonthBalance = parseFloat(savedRecord.last_month_balance || 0);
      } else {
        const prevRecord = prevRecordsMap[emp.id];
        if (prevRecord) {
          const prevNet = parseFloat(prevRecord.net_salary || 0);
          const prevPaid = parseFloat(prevRecord.paid_amount || 0);
          lastMonthBalance = Math.round((prevNet - prevPaid) * 100) / 100;
        } else if (savedRecord && savedRecord.last_month_balance !== undefined && savedRecord.last_month_balance !== null) {
          lastMonthBalance = parseFloat(savedRecord.last_month_balance || 0);
        }
      }

      // Total adjustments (Expenses / Deductions & Additions)
      const totalAdjustments = Math.round((lastMonthBalance + bonus + lastMonthAdj - internet - kafalat - advanceDeduction + otherAdjustments + dynamicAdjustmentsTotal) * 100) / 100;

      // Net salary = Payable salary (earnedSalary) + totalAdjustments (can be negative if deductions exceed earnings)
      const dynamicNetSalary = Math.round((earnedSalary + totalAdjustments) * 100) / 100;

      // Auto-sync database employee_payroll_records for pending records so it never holds stale data
      if (savedRecord && !isSavedPaid) {
        pool.query(
          `UPDATE employee_payroll_records SET 
            advance_deduction = $1, bonus = $2, last_month_adjustment = $3, 
            internet = $4, kafalat = $5, other_adjustments = $6, recurring_adjustments = $7,
            dynamic_adjustments = $8, total_adjustments = $9, net_salary = $10,
            payable_salary = $11, deductions = $12
           WHERE employee_id = $13 AND month = $14 AND status != 'Paid'`,
          [
            advanceDeduction, bonus, lastMonthAdj,
            internet, kafalat, manualAdjustments, finalRecurringAdjustments,
            JSON.stringify(dynamicAdjustmentsObj), totalAdjustments, dynamicNetSalary,
            parseFloat(earnedSalary.toFixed(2)), parseFloat(deductions.toFixed(2)),
            emp.id, month
          ]
        ).catch(err => console.error('Error auto-syncing pending payroll record:', err));
      }

      // Cash and Bank paid defaults
      let cashPaid = dynamicNetSalary;
      let bankPaid = 0;
      if (savedRecord) {
        if (savedRecord.cash_paid !== undefined && savedRecord.cash_paid !== null) {
          cashPaid = parseFloat(savedRecord.cash_paid);
        } else if (savedRecord.paid_amount !== undefined && savedRecord.paid_amount !== null) {
          cashPaid = parseFloat(savedRecord.paid_amount);
        }
        if (savedRecord.bank_paid !== undefined && savedRecord.bank_paid !== null) {
          bankPaid = parseFloat(savedRecord.bank_paid);
        }
      }
      const paidAmount = Math.round((cashPaid + bankPaid) * 100) / 100;

      return {
        id: emp.id,
        employee_id: emp.employee_id || `EMP-${String(emp.id).padStart(4, '0')}`,
        name: emp.name,
        role: emp.role,
        position: emp.position || '',
        shift: emp.shift || 'R1',
        shift_hours: standardShiftHours,
        expected_hours: parseFloat(expectedMonthlyHours.toFixed(2)),
        expected_minutes: Math.round(expectedMonthlyMinutes),
        actual_hours: parseFloat(attendanceTotalHours.toFixed(2)),
        actual_minutes: Math.round(attendanceTotalHours * 60),
        per_minute_rate: perMinuteRate,
        per_hour_rate: perHourRate,
        attendance_total_hours: parseFloat(attendanceTotalHours.toFixed(2)),
        req_duty_hours: parseFloat(expectedDutyHours.toFixed(2)),
        worked_duty_hours: parseFloat(workedDutyHours.toFixed(2)),
        short_duty_hours: parseFloat(shortDutyHours.toFixed(2)),
        only_overtime_hours: parseFloat(onlyOvertimeHours.toFixed(2)),
        other_overtime_hours: parseFloat(otherOvertimeHours.toFixed(2)),
        net_overtime_hours: parseFloat(netOvertimeHours.toFixed(2)),
        base_salary: baseSalary,
        payable_salary: parseFloat(earnedSalary.toFixed(2)),
        overtime_rate: overtimeRate,
        allowed_leaves: allowedLeaves,
        presents,
        absents,
        only_overtime_days: onlyOvertimeDays,
        holidays,
        leaves: leavesCount,
        late_days: lateDays,
        paid_leaves: paidLeaves,
        unpaid_leaves: unpaidLeaves,
        overtime_hours: parseFloat(overtimeHours.toFixed(2)),
        overtime_pay: parseFloat(overtimePay.toFixed(2)),
        deductions: parseFloat(deductions.toFixed(2)),
        other_adjustments: manualAdjustments,
        recurring_adjustments: finalRecurringAdjustments,
        last_month_balance: parseFloat(lastMonthBalance.toFixed(2)),
        bonus,
        last_month_adjustment: lastMonthAdj,
        internet,
        kafalat,
        total_adjustments: parseFloat(totalAdjustments.toFixed(2)),
        advance_balance: advanceBalance,
        advance_deduction: advanceDeduction,
        calc_advance_deduction: calcAdvanceDeduction,
        calc_bonus: calcBonus,
        calc_last_month_adjustment: calcLastMonthAdj,
        calc_internet: calcInternet,
        calc_kafalat: calcKafalat,
        dynamic_adjustments: dynamicAdjustmentsObj,
        net_salary: parseFloat(dynamicNetSalary.toFixed(2)),
        cash_paid: parseFloat(cashPaid.toFixed(2)),
        bank_paid: parseFloat(bankPaid.toFixed(2)),
        paid_amount: parseFloat(paidAmount.toFixed(2)),
        carried_forward_to_next: parseFloat(savedRecordsMap[emp.id]?.carried_forward_to_next || nextRecordsMap[emp.id]?.last_month_balance || 0),
        status: paymentStatus,
        notes: notes,
        branch: emp.branch || '',
        department: emp.department || '',
        daily_breakdown: dailyBreakdown,
        calendar_summary: {
          total_overtime_minutes: calOvertimeMins,
          total_shortage_minutes: calShortageMins,
          net_minutes: calOvertimeMins - calShortageMins,
          absent_days: absents,
          target_hours: standardShiftHours
        }
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
     WHERE employee_id = $1 AND custom_label ILIKE $2 AND start_date <= $3`,
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
      `INSERT INTO employee_financial_adjustments (employee_id, type, action_type, amount, date, notes, custom_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [employee_id, label, newAction, insertVal, `${month}-15`, 'Added from spreadsheet', label] // Using middle of month
    );
  }
};

router.post('/record', authenticateToken, isAdmin, async (req, res) => {
  const {
    employee_id,
    month,
    base_salary,
    payable_salary,
    last_month_balance,
    cash_paid,
    bank_paid,
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

    // Fetch old record to see if it was already Paid (lock check)
    const oldRecRes = await client.query('SELECT status FROM employee_payroll_records WHERE employee_id = $1 AND month = $2', [employee_id, month]);
    const oldStatus = oldRecRes.rows.length > 0 ? oldRecRes.rows[0].status : null;
    const userRole = req.user?.role?.trim().toLowerCase();

    // If already marked as Paid, only a user with Developer or Admin role can edit or unlock it
    if (oldStatus === 'Paid' && userRole !== 'developer' && userRole !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'This payroll record is marked as Paid and locked. Only an Admin or Developer can edit or unlock it.'
      });
    }

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

    const cashVal = parseFloat(cash_paid !== undefined ? cash_paid : (paid_amount || 0));
    const bankVal = parseFloat(bank_paid || 0);
    const totalPaidAmount = Math.round((cashVal + bankVal) * 100) / 100;

    const result = await client.query(
      `INSERT INTO employee_payroll_records (
        employee_id, month, base_salary, payable_salary, last_month_balance, presents, absents, leaves, holidays, overtime_hours, overtime_pay, deductions,
        other_adjustments, advance_deduction, recurring_adjustments, bonus, last_month_adjustment, internet, kafalat, expected_hours, actual_hours, dynamic_adjustments, net_salary, cash_paid, bank_paid, paid_amount, status, notes, paid_date
      ) VALUES (
        $1, $2::text, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22::jsonb, $23, $24, $25, $26, $27::text, $28::text, CASE WHEN $27::text = 'Paid' THEN NOW() ELSE NULL END
      ) ON CONFLICT (employee_id, month) DO UPDATE SET
        base_salary = EXCLUDED.base_salary,
        payable_salary = EXCLUDED.payable_salary,
        last_month_balance = EXCLUDED.last_month_balance,
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
        cash_paid = EXCLUDED.cash_paid,
        bank_paid = EXCLUDED.bank_paid,
        paid_amount = EXCLUDED.paid_amount,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        paid_date = CASE WHEN EXCLUDED.status = 'Paid' AND employee_payroll_records.status != 'Paid' THEN NOW() ELSE employee_payroll_records.paid_date END
      RETURNING *`,
      [
        employee_id,
        month,
        parseFloat(base_salary || 0),
        parseFloat(payable_salary !== undefined ? payable_salary : (parseFloat(base_salary || 0) - parseFloat(deductions || 0))),
        parseFloat(last_month_balance || 0),
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
        cashVal,
        bankVal,
        totalPaidAmount,
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
      // Revert advance_balance deduction if status changes back from Paid
      const prevAdvDeduct = parseFloat(advance_deduction || 0);
      if (prevAdvDeduct > 0) {
        await client.query('UPDATE employees SET advance_balance = advance_balance + $1 WHERE id = $2', [prevAdvDeduct, employee_id]);
      }
    }

    // Update employee master salary if base_salary is provided
    if (base_salary !== undefined && base_salary !== null && base_salary !== '') {
      await client.query('UPDATE employees SET salary = $1 WHERE id = $2', [parseFloat(base_salary), employee_id]);
      await client.query(
        `INSERT INTO employee_payroll_settings (employee_id, base_salary)
         VALUES ($1, $2)
         ON CONFLICT (employee_id) DO UPDATE SET base_salary = $2`,
        [employee_id, parseFloat(base_salary)]
      );
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

// POST carry forward remaining unpaid salary to next month
router.post('/carry-forward', authenticateToken, async (req, res) => {
  const { employee_id, month, cash_paid, bank_paid, remaining_amount, notes } = req.body;
  if (!employee_id || !month) {
    return res.status(400).json({ error: 'employee_id and month are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Calculate next month (YYYY-MM)
    const [year, monthNum] = month.split('-').map(Number);
    let nextYear = year;
    let nextMonthNum = monthNum + 1;
    if (nextMonthNum > 12) {
      nextMonthNum = 1;
      nextYear = year + 1;
    }
    const nextMonthStr = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}`;

    // 2. Fetch or update current month's record
    const curRecordRes = await client.query(
      'SELECT * FROM employee_payroll_records WHERE employee_id = $1 AND month = $2',
      [employee_id, month]
    );

    const cashVal = parseFloat(cash_paid || 0);
    const bankVal = parseFloat(bank_paid || 0);
    const totalPaid = Math.round((cashVal + bankVal) * 100) / 100;
    
    let curNet = 0;
    if (curRecordRes.rows.length > 0) {
      curNet = parseFloat(curRecordRes.rows[0].net_salary || 0);
    }

    const carryAmount = remaining_amount !== undefined 
      ? parseFloat(remaining_amount) 
      : Math.round((curNet - totalPaid) * 100) / 100;

    if (curRecordRes.rows.length > 0) {
      await client.query(
        `UPDATE employee_payroll_records SET
           cash_paid = $1,
           bank_paid = $2,
           paid_amount = $3,
           carried_forward_to_next = $4,
           status = 'Paid',
           paid_date = COALESCE(paid_date, NOW()),
           notes = COALESCE($5, notes)
         WHERE employee_id = $6 AND month = $7`,
        [cashVal, bankVal, totalPaid, carryAmount, notes || null, employee_id, month]
      );
    } else {
      const empRes = await client.query('SELECT salary FROM employees WHERE id = $1', [employee_id]);
      const baseSalary = parseFloat(empRes.rows[0]?.salary || 0);
      curNet = baseSalary;
      await client.query(
        `INSERT INTO employee_payroll_records (
           employee_id, month, base_salary, payable_salary, net_salary,
           cash_paid, bank_paid, paid_amount, carried_forward_to_next, status, paid_date
         ) VALUES ($1, $2, $3, $3, $3, $4, $5, $6, $7, 'Paid', NOW())
         ON CONFLICT (employee_id, month) DO UPDATE SET
           cash_paid = EXCLUDED.cash_paid,
           bank_paid = EXCLUDED.bank_paid,
           paid_amount = EXCLUDED.paid_amount,
           carried_forward_to_next = EXCLUDED.carried_forward_to_next,
           status = 'Paid'`,
        [employee_id, month, baseSalary, cashVal, bankVal, totalPaid, carryAmount]
      );
    }

    // 3. Update next month's record if it exists, or insert placeholder
    const nextRecordRes = await client.query(
      'SELECT * FROM employee_payroll_records WHERE employee_id = $1 AND month = $2',
      [employee_id, nextMonthStr]
    );

    if (nextRecordRes.rows.length > 0) {
      const nextRec = nextRecordRes.rows[0];
      const prevBal = parseFloat(nextRec.last_month_balance || 0);
      const diff = carryAmount - prevBal;
      const newTotalAdj = Math.round((parseFloat(nextRec.total_adjustments || 0) + diff) * 100) / 100;
      const newNet = Math.round((parseFloat(nextRec.payable_salary || 0) + newTotalAdj) * 100) / 100;

      await client.query(
        `UPDATE employee_payroll_records SET
           last_month_balance = $1,
           total_adjustments = $2,
           net_salary = $3
         WHERE employee_id = $4 AND month = $5`,
        [carryAmount, newTotalAdj, newNet, employee_id, nextMonthStr]
      );
    } else {
      const empRes = await client.query('SELECT salary FROM employees WHERE id = $1', [employee_id]);
      const baseSalary = parseFloat(empRes.rows[0]?.salary || 0);
      await client.query(
        `INSERT INTO employee_payroll_records (
           employee_id, month, base_salary, payable_salary, last_month_balance,
           net_salary, total_adjustments, status
         ) VALUES ($1, $2, $3, $3, $4, $5, $4, 'Pending')
         ON CONFLICT (employee_id, month) DO UPDATE SET
           last_month_balance = EXCLUDED.last_month_balance`,
        [employee_id, nextMonthStr, baseSalary, carryAmount, (baseSalary + carryAmount)]
      );
    }

    await client.query('COMMIT');
    res.json({ 
      success: true, 
      message: `Carried forward SAR ${carryAmount.toFixed(2)} to ${nextMonthStr}`,
      remaining: carryAmount,
      next_month: nextMonthStr
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST clear previous month carryover balance (Sets past balance to 0.00)
router.post('/clear-balance', authenticateToken, isAdmin, async (req, res) => {
  const { employee_id, month } = req.body;
  if (!employee_id || !month) {
    return res.status(400).json({ error: 'employee_id and month are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const [year, monthNum] = month.split('-').map(Number);
    let prevYear = year;
    let prevMonthNum = monthNum - 1;
    if (prevMonthNum === 0) {
      prevMonthNum = 12;
      prevYear = year - 1;
    }
    const prevMonthStr = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`;

    // 1. Settle previous month if record exists (so prevNet - prevPaid becomes 0)
    await client.query(`
      UPDATE employee_payroll_records 
      SET paid_amount = net_salary,
          cash_paid = net_salary,
          bank_paid = 0,
          status = 'Paid'
      WHERE employee_id = $1 AND month = $2
    `, [employee_id, prevMonthStr]);

    // 2. Set current month's last_month_balance to 0 if record exists
    await client.query(`
      UPDATE employee_payroll_records
      SET last_month_balance = 0
      WHERE employee_id = $1 AND month = $2
    `, [employee_id, month]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Past balance cleared to 0.00' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST batch update employee base salaries
router.post('/salaries/batch', authenticateToken, isAdmin, async (req, res) => {
  const { salaries } = req.body;
  if (!Array.isArray(salaries)) {
    return res.status(400).json({ error: 'Salaries array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of salaries) {
      if (item.employee_id && item.base_salary !== undefined && item.base_salary !== '') {
        const val = parseFloat(item.base_salary);
        await client.query('UPDATE employees SET salary = $1 WHERE id = $2', [val, item.employee_id]);
        await client.query(
          `INSERT INTO employee_payroll_settings (employee_id, base_salary)
           VALUES ($1, $2)
           ON CONFLICT (employee_id) DO UPDATE SET base_salary = $2`,
          [item.employee_id, val]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ message: 'Salaries updated successfully' });
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

// Shared handler for POST financial adjustments
const handlePostFinancialAdjustment = async (req, res) => {
  const { employee_id, type, custom_label, amount, action_type, date, notes } = req.body;
  if (!employee_id || !type || !amount || !action_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO employee_financial_adjustments (employee_id, type, custom_label, amount, action_type, date, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [employee_id, type, custom_label, parseFloat(amount), action_type, date || new Date().toISOString().split('T')[0], notes || '']
    );

    const isLoanOrAdv = type === 'Advance Salary / Loan' || custom_label === 'Advance Salary / Loan' || custom_label === 'This M. Adv' || custom_label === 'Advance';
    if (isLoanOrAdv) {
      if (action_type === 'Give' || action_type === 'Add') {
        await client.query(
          'UPDATE employees SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2',
          [parseFloat(amount), employee_id]
        );
      } else if (action_type === 'Deduct') {
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
};

// Shared handler for DELETE financial adjustments
const handleDeleteFinancialAdjustment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query('SELECT * FROM employee_financial_adjustments WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const adj = check.rows[0];

    const isLoanOrAdv = adj.type === 'Advance Salary / Loan' || adj.custom_label === 'Advance Salary / Loan' || adj.custom_label === 'This M. Adv' || adj.custom_label === 'Advance';
    if (isLoanOrAdv) {
      if (adj.action_type === 'Give' || adj.action_type === 'Add') {
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
};

// Shared handler for PUT financial adjustments
const handlePutFinancialAdjustment = async (req, res) => {
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

    const oldIsLoanOrAdv = oldAdj.type === 'Advance Salary / Loan' || oldAdj.custom_label === 'Advance Salary / Loan' || oldAdj.custom_label === 'This M. Adv' || oldAdj.custom_label === 'Advance';
    if (oldIsLoanOrAdv) {
      if (oldAdj.action_type === 'Give' || oldAdj.action_type === 'Add') {
        await client.query('UPDATE employees SET advance_balance = GREATEST(COALESCE(advance_balance, 0) - $1, 0) WHERE id = $2', [oldAdj.amount, employee_id]);
      } else if (oldAdj.action_type === 'Deduct') {
        await client.query('UPDATE employees SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [oldAdj.amount, employee_id]);
      }
    }

    const updatedType = type || oldAdj.type;
    const updatedCustomLabel = custom_label !== undefined ? custom_label : oldAdj.custom_label;
    const updatedActionType = action_type || oldAdj.action_type;
    const updatedAmount = amount !== undefined ? parseFloat(amount) : oldAdj.amount;
    const updatedDate = date || oldAdj.date;
    const updatedNotes = notes !== undefined ? notes : oldAdj.notes;

    const result = await client.query(
      'UPDATE employee_financial_adjustments SET type=$1, custom_label=$2, action_type=$3, amount=$4, date=$5, notes=$6 WHERE id=$7 RETURNING *',
      [updatedType, updatedCustomLabel || null, updatedActionType, updatedAmount, updatedDate, updatedNotes || null, req.params.id]
    );

    const newIsLoanOrAdv = updatedType === 'Advance Salary / Loan' || updatedCustomLabel === 'Advance Salary / Loan' || updatedCustomLabel === 'This M. Adv' || updatedCustomLabel === 'Advance';
    if (newIsLoanOrAdv) {
      if (updatedActionType === 'Give' || updatedActionType === 'Add') {
        await client.query('UPDATE employees SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [updatedAmount, employee_id]);
      } else if (updatedActionType === 'Deduct') {
        await client.query('UPDATE employees SET advance_balance = GREATEST(COALESCE(advance_balance, 0) - $1, 0) WHERE id = $2', [updatedAmount, employee_id]);
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
};

// POST financial adjustments (supports both /financial-adjustments and /adjustments)
router.post('/financial-adjustments', authenticateToken, isAdmin, handlePostFinancialAdjustment);
router.post('/adjustments', authenticateToken, isAdmin, handlePostFinancialAdjustment);

// DELETE financial adjustments
router.delete('/financial-adjustments/:id', authenticateToken, isAdmin, handleDeleteFinancialAdjustment);
router.delete('/adjustments/:id', authenticateToken, isAdmin, handleDeleteFinancialAdjustment);

// PUT financial adjustments
router.put('/financial-adjustments/:id', authenticateToken, isAdmin, handlePutFinancialAdjustment);
router.put('/adjustments/:id', authenticateToken, isAdmin, handlePutFinancialAdjustment);

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
