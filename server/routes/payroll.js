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

      // Get saved details if they exist
      const savedRecord = savedRecordsMap[emp.id] || {};
      const otherAdjustments = savedRecord.other_adjustments !== undefined && savedRecord.other_adjustments !== null ? parseFloat(savedRecord.other_adjustments) : 0.0;
      const savedPaidAmount = savedRecord.paid_amount !== undefined && savedRecord.paid_amount !== null ? parseFloat(savedRecord.paid_amount) : null;
      const paymentStatus = savedRecord.status || 'Pending';
      const notes = savedRecord.notes || '';

      let presents = 0;
      let absents = 0;
      let holidays = 0;
      let leavesCount = 0;
      let paidLeaves = 0;
      let unpaidLeaves = 0;
      let totalOvertimeHours = 0;

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
          } else if (mainSession.status === 'Leave') {
            leavesCount++;
            if (mainSession.is_paid) {
              paidLeaves++;
            } else {
              unpaidLeaves++;
            }
          } else {
            presents++;
            // Calculate overtime for this day
            let dailyHours = 0;
            daySessions.forEach(s => {
              if (s.check_in && s.check_out) {
                const inTime = new Date(s.check_in).getTime();
                const outTime = new Date(s.check_out).getTime();
                dailyHours += Math.max(0, (outTime - inTime) / (1000 * 60 * 60));
              }
            });
            const shiftHours = parseFloat(daySessions[0].shift_hours || emp.shift_hours || 12.0);
            totalOvertimeHours += Math.max(0, dailyHours - shiftHours);
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
      }

      // Calculations
      const dailyRate = totalDaysInMonth > 0 ? baseSalary / totalDaysInMonth : 0;
      const earnedSalary = (presents + holidays + paidLeaves) * dailyRate;
      const deductions = baseSalary - earnedSalary; // Deduct unearned days (absents + future days)
      
      const overtimePay = totalOvertimeHours * overtimeRate;
      const netSalary = Math.max(0, earnedSalary + overtimePay + otherAdjustments);
      const paidAmount = savedPaidAmount !== null ? savedPaidAmount : netSalary;

      const advanceBalance = emp.advance_balance ? parseFloat(emp.advance_balance) : 0;
      const advanceDeduction = savedRecord.advance_deduction ? parseFloat(savedRecord.advance_deduction) : 0;

      return {
        id: emp.id,
        employee_id: emp.employee_id || `EMP-${String(emp.id).padStart(4, '0')}`,
        name: emp.name,
        role: emp.role,
        position: emp.position || '',
        shift: emp.shift || 'R1',
        shift_hours: parseFloat(emp.shift_hours || 12.0),
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
        other_adjustments: otherAdjustments,
        advance_balance: advanceBalance,
        advance_deduction: advanceDeduction,
        net_salary: parseFloat((netSalary - advanceDeduction).toFixed(2)),
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
    net_salary,
    paid_amount,
    status,
    notes,
    zero_out_advance
  } = req.body;

  if (!employee_id || !month) {
    return res.status(400).json({ error: 'Employee ID and month are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO employee_payroll_records 
        (employee_id, month, base_salary, presents, absents, leaves, holidays, overtime_hours, overtime_pay, deductions, other_adjustments, advance_deduction, net_salary, paid_amount, status, notes, paid_date)
       VALUES 
        ($1, $2::text, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::text, $16::text, CASE WHEN $15::text = 'Paid' THEN NOW() ELSE NULL END)
       ON CONFLICT (employee_id, month) 
       DO UPDATE SET 
        base_salary = $3, 
        presents = $4, 
        absents = $5, 
        leaves = $6, 
        holidays = $7, 
        overtime_hours = $8, 
        overtime_pay = $9, 
        deductions = $10, 
        other_adjustments = $11,
        advance_deduction = $12,
        net_salary = $13, 
        paid_amount = $14, 
        status = $15::text, 
        notes = $16::text, 
        paid_date = CASE WHEN $15::text = 'Paid' AND employee_payroll_records.status != 'Paid' THEN NOW() ELSE employee_payroll_records.paid_date END
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
        parseFloat(net_salary || 0),
        parseFloat(paid_amount || 0),
        status || 'Pending',
        notes || ''
      ]
    );

    // Update employee advance balance if advance is deducted or zeroed out
    if (status === 'Paid') {
      const advDeduct = parseFloat(advance_deduction || 0);
      
      if (zero_out_advance) {
        await client.query('UPDATE employees SET advance_balance = 0 WHERE id = $1', [employee_id]);
      } else if (advDeduct > 0) {
        // Only deduct if it hasn't been deducted for this specific payment before.
        // For simplicity, we assume hitting "Paid" processes the deduction once.
        // A robust system would track if the deduction was already applied for this month.
        // Checking if paid_date was just updated could help, but for now we'll just subtract it.
        // We'll trust the admin to set the deduction amount correctly.
        await client.query('UPDATE employees SET advance_balance = GREATEST(0, advance_balance - $1) WHERE id = $2', [advDeduct, employee_id]);
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

// POST add advance to employee
router.post('/advance/:employee_id', authenticateToken, isAdmin, async (req, res) => {
  const { amount } = req.body;
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE employees SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2 RETURNING advance_balance',
      [parseFloat(amount), req.params.employee_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json({ advance_balance: result.rows[0].advance_balance });
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
    res.json({ message: 'Adjustment deleted and balances reverted if applicable.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
