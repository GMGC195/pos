const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Middleware to auto checkout old sessions (> 24 hours)
const autoCheckoutOldSessions = async (req, res, next) => {
  try {
    await pool.query(`
      UPDATE employee_attendance 
      SET check_out = check_in + (COALESCE(e.shift_hours, 12.0) * INTERVAL '1 hour'),
          on_break = false,
          break_start = null,
          remarks = 'System Checkout'
      FROM employees e
      WHERE employee_attendance.employee_id = e.id
        AND employee_attendance.check_out IS NULL 
        AND employee_attendance.check_in < NOW() - INTERVAL '24 hours'
    `);
  } catch (err) {
    console.error('Error auto checking out old sessions:', err.message);
  }
  next();
};

router.use(autoCheckoutOldSessions);

// Get today's attendance status for all active employees
router.get('/today', authenticateToken, async (req, res) => {
  try {
    // Fetch all active employees
    const activeEmps = await pool.query(`
      SELECT id as employee_id, name, role, shift, shift_hours, status as employee_status, employee_id as employee_code, department
      FROM employees
      WHERE status = 'Active'
      ORDER BY id ASC
    `);

    // Fetch all today's attendance sessions
    const sessions = await pool.query(`
      SELECT id as attendance_id, employee_id, check_in, check_out, status as attendance_status, on_break, break_start, total_break_duration_seconds, remarks
      FROM employee_attendance
      WHERE date = CURRENT_DATE
      ORDER BY check_in ASC
    `);

    // Group sessions by employee ID
    const sessionsMap = {};
    sessions.rows.forEach(row => {
      if (!sessionsMap[row.employee_id]) {
        sessionsMap[row.employee_id] = [];
      }
      sessionsMap[row.employee_id].push(row);
    });

    const employeesWithAttendance = activeEmps.rows.map(emp => {
      const empSessions = sessionsMap[emp.employee_id] || [];
      
      // Calculate today's total hours worked so far across all sessions
      let totalHoursToday = 0;
      empSessions.forEach(row => {
        const checkInTime = new Date(row.check_in).getTime();
        const checkOutTime = row.check_out ? new Date(row.check_out).getTime() : Date.now();
        let breakSecs = row.total_break_duration_seconds || 0;
        if (row.on_break && row.break_start) {
          breakSecs += Math.floor((Date.now() - new Date(row.break_start).getTime()) / 1000);
        }
        const sessionMs = checkOutTime - checkInTime - (breakSecs * 1000);
        totalHoursToday += Math.max(0, sessionMs / (1000 * 60 * 60));
      });

      // Get current active state: last session status
      const lastSession = empSessions[empSessions.length - 1] || null;

      return {
        ...emp,
        sessions: empSessions, // Return all sessions to show stacked inside one row
        attendance_id: lastSession ? lastSession.attendance_id : null,
        check_in: lastSession ? lastSession.check_in : null,
        check_out: lastSession ? lastSession.check_out : null,
        attendance_status: lastSession ? lastSession.attendance_status : null,
        on_break: lastSession ? lastSession.on_break : false,
        break_start: lastSession ? lastSession.break_start : null,
        total_hours_today: totalHoursToday
      };
    });

    res.json(employeesWithAttendance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check-in endpoint
router.post('/check-in', authenticateToken, async (req, res) => {
  const { employee_id, late_threshold } = req.body;
  const threshold = late_threshold || '09:00'; // Default is 9:00 AM
  
  try {
    // Check if there is an active session (check_out is NULL)
    const activeSession = await pool.query(
      'SELECT id FROM employee_attendance WHERE employee_id = $1 AND check_out IS NULL AND date = CURRENT_DATE',
      [employee_id]
    );

    if (activeSession.rows.length > 0) {
      return res.status(400).json({ error: 'Employee is already checked in.' });
    }

    // Fetch employee shift details
    const empRes = await pool.query('SELECT shift FROM employees WHERE id = $1', [employee_id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    const shift = empRes.rows[0].shift || 'R1';

    // Determine status (Present or Late)
    // Check if it's the first check-in of the day
    const priorChecks = await pool.query(
      'SELECT id, status FROM employee_attendance WHERE employee_id = $1 AND date = CURRENT_DATE',
      [employee_id]
    );

    let status = 'Present';
    if (priorChecks.rows.length > 0) {
      // If they already checked in today, keep the status of the first session of the day
      status = priorChecks.rows[0].status;
    } else {
      // First check-in: Compare current time with shift threshold (15 mins grace period)
      const now = new Date();
      const currentHours = now.getHours();
      const currentMins = now.getMinutes();

      let isLate = false;
      let startHour = 10;
      let startMin = 0;
      
      const shiftDetails = await pool.query('SELECT * FROM employee_shifts WHERE name = $1', [shift]);
      if (shiftDetails.rows.length > 0) {
        const startTimeStr = shiftDetails.rows[0].start_time;
        const timeMatch = startTimeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
        if (timeMatch) {
          let hrs = parseInt(timeMatch[1]);
          const mins = parseInt(timeMatch[2]);
          const ampm = timeMatch[3].toUpperCase();
          if (ampm === 'PM' && hrs < 12) hrs += 12;
          if (ampm === 'AM' && hrs === 12) hrs = 0;
          startHour = hrs;
          startMin = mins;
        }
      } else {
        if (shift === 'R2') {
          startHour = 9;
        } else if (shift === 'R3') {
          startHour = 15;
        }
      }
      
      let thresholdMins = startMin + 15;
      let thresholdHour = startHour;
      if (thresholdMins >= 60) {
        thresholdHour += 1;
        thresholdMins -= 60;
      }
      
      if (currentHours > thresholdHour || (currentHours === thresholdHour && currentMins > thresholdMins)) {
        isLate = true;
      }

      if (isLate) {
        status = 'Late';
      }
    }

    const result = await pool.query(
      'INSERT INTO employee_attendance (employee_id, check_in, status, date) VALUES ($1, NOW(), $2, CURRENT_DATE) RETURNING *',
      [employee_id, status]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check-out endpoint
router.post('/check-out', authenticateToken, async (req, res) => {
  const { employee_id } = req.body;
  try {
    // Find active session
    const activeSession = await pool.query(
      'SELECT * FROM employee_attendance WHERE employee_id = $1 AND check_out IS NULL ORDER BY check_in DESC LIMIT 1',
      [employee_id]
    );

    if (activeSession.rows.length === 0) {
      return res.status(400).json({ error: 'No active check-in found for this employee.' });
    }

    const session = activeSession.rows[0];
    let totalBreakSecs = session.total_break_duration_seconds || 0;
    
    // If currently on break, end the break now
    if (session.on_break && session.break_start) {
      const breakDuration = Math.floor((Date.now() - new Date(session.break_start).getTime()) / 1000);
      totalBreakSecs += breakDuration;
    }

    const result = await pool.query(
      'UPDATE employee_attendance SET check_out = NOW(), on_break = false, break_start = null, total_break_duration_seconds = $1 WHERE id = $2 RETURNING *',
      [totalBreakSecs, session.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk break endpoint for all active checked-in staff
router.post('/bulk-break', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE employee_attendance SET on_break = true, break_start = NOW() WHERE check_out IS NULL AND (on_break = false OR on_break IS NULL) RETURNING *'
    );
    res.json({ message: `Successfully put ${result.rowCount} employees on break.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk end break endpoint for all checked-in staff currently on break
router.post('/bulk-end-break', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE employee_attendance 
       SET on_break = false, 
           total_break_duration_seconds = COALESCE(total_break_duration_seconds, 0) + EXTRACT(EPOCH FROM (NOW() - break_start))::integer,
           break_start = null 
       WHERE check_out IS NULL AND on_break = true 
       RETURNING *`
    );
    res.json({ message: `Successfully ended break for ${result.rowCount} employees.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Break toggle endpoint
router.post('/toggle-break', authenticateToken, async (req, res) => {
  const { employee_id } = req.body;
  try {
    const activeSession = await pool.query(
      'SELECT * FROM employee_attendance WHERE employee_id = $1 AND check_out IS NULL ORDER BY check_in DESC LIMIT 1',
      [employee_id]
    );

    if (activeSession.rows.length === 0) {
      return res.status(400).json({ error: 'Employee is not checked in.' });
    }

    const session = activeSession.rows[0];
    let result;

    if (session.on_break) {
      // End break
      const breakDuration = Math.floor((Date.now() - new Date(session.break_start).getTime()) / 1000);
      const newTotalBreak = (session.total_break_duration_seconds || 0) + breakDuration;

      result = await pool.query(
        'UPDATE employee_attendance SET on_break = false, break_start = null, total_break_duration_seconds = $1 WHERE id = $2 RETURNING *',
        [newTotalBreak, session.id]
      );
    } else {
      // Start break
      result = await pool.query(
        'UPDATE employee_attendance SET on_break = true, break_start = NOW() WHERE id = $1 RETURNING *',
        [session.id]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create or Update holiday endpoint
router.post('/holiday', authenticateToken, async (req, res) => {
  const { date, employee_id, is_global, shift } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  try {
    if (is_global) {
      // Get all active employees
      const activeEmps = await pool.query("SELECT id FROM employees WHERE status = 'Active'");
      for (const emp of activeEmps.rows) {
        // Delete existing check-ins on this date
        await pool.query('DELETE FROM employee_attendance WHERE employee_id = $1 AND date = $2', [emp.id, date]);
        // Insert holiday log using local midnight string to prevent timezone shifts
        await pool.query(
          "INSERT INTO employee_attendance (employee_id, check_in, status, date) VALUES ($1, $2, 'Holiday', $3)",
          [emp.id, `${date} 00:00:00`, date]
        );
      }
      res.json({ message: 'Global holiday set successfully' });
    } else if (shift && (!employee_id || employee_id === 'ShiftGlobal')) {
      // Get all active employees of that shift
      const activeEmps = await pool.query("SELECT id FROM employees WHERE status = 'Active' AND COALESCE(shift, 'R1') = $1", [shift]);
      for (const emp of activeEmps.rows) {
        await pool.query('DELETE FROM employee_attendance WHERE employee_id = $1 AND date = $2', [emp.id, date]);
        await pool.query(
          "INSERT INTO employee_attendance (employee_id, check_in, status, date) VALUES ($1, $2, 'Holiday', $3)",
          [emp.id, `${date} 00:00:00`, date]
        );
      }
      res.json({ message: `Holiday set successfully for all employees on Shift ${shift}` });
    } else {
      if (!employee_id) {
        return res.status(400).json({ error: 'Employee ID is required for individual holiday' });
      }
      await pool.query('DELETE FROM employee_attendance WHERE employee_id = $1 AND date = $2', [employee_id, date]);
      await pool.query(
        "INSERT INTO employee_attendance (employee_id, check_in, status, date) VALUES ($1, $2, 'Holiday', $3)",
        [employee_id, `${date} 00:00:00`, date]
      );
      res.json({ message: 'Holiday set successfully for employee' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete/Remove holiday endpoint
router.delete('/holiday', authenticateToken, async (req, res) => {
  const { date, employee_id, is_global, shift } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  try {
    if (is_global) {
      const result = await pool.query(
        "DELETE FROM employee_attendance WHERE date = $1 AND status = 'Holiday'",
        [date]
      );
      res.json({ message: `Global holiday removed successfully (${result.rowCount} logs deleted)` });
    } else if (shift && (!employee_id || employee_id === 'ShiftGlobal')) {
      const result = await pool.query(
        `DELETE FROM employee_attendance ea
         USING employees e
         WHERE ea.employee_id = e.id
           AND ea.date = $1
           AND ea.status = 'Holiday'
           AND COALESCE(e.shift, 'R1') = $2`,
        [date, shift]
      );
      res.json({ message: `Shift holiday removed successfully (${result.rowCount} logs deleted)` });
    } else {
      if (!employee_id) {
        return res.status(400).json({ error: 'Employee ID is required' });
      }
      const result = await pool.query(
        "DELETE FROM employee_attendance WHERE employee_id = $1 AND date = $2 AND status = 'Holiday'",
        [employee_id, date]
      );
      res.json({ message: 'Holiday removed successfully for employee' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get attendance reports
router.get('/reports', authenticateToken, async (req, res) => {
  const { month, employee_id } = req.query; // month format: 'YYYY-MM'
  try {
    let query = `
      SELECT ea.id, ea.employee_id, ea.check_in, ea.check_out, ea.status, ea.on_break, ea.break_start, ea.total_break_duration_seconds, ea.remarks, TO_CHAR(ea.date, 'YYYY-MM-DD') as date, ea.created_at, e.name, e.role, e.shift, e.shift_hours, e.employee_id as employee_code
      FROM employee_attendance ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (month) {
      params.push(`${month}%`);
      query += ` AND ea.date::text LIKE $${params.length}`;
    }

    if (employee_id && employee_id !== 'All') {
      params.push(employee_id);
      query += ` AND ea.employee_id = $${params.length}`;
    }

    query += ' ORDER BY ea.date ASC, ea.check_in ASC';

    const result = await pool.query(query, params);
    
    // Format response to include session hours calculated
    const todayStr = new Date().toLocaleDateString('en-CA');
    const reports = result.rows.map(row => {
      const checkInTime = new Date(row.check_in).getTime();
      let checkOutTime = row.check_out ? new Date(row.check_out).getTime() : null;
      let durationHours = 0;
      let otHours = 0;
      const shiftHours = parseFloat(row.shift_hours || 12.0);
      
      let forgotCheckout = false;
      if (!checkOutTime && row.date < todayStr) {
        checkOutTime = checkInTime; // Treat as checked out at check-in time (0 hours)
        forgotCheckout = true;
      }
      
      if (row.status === 'Holiday') {
        return {
          ...row,
          hours_worked: 0,
          shift_hours: shiftHours,
          ot_hours: 0
        };
      }
      
      if (checkOutTime) {
        const breakSecs = row.total_break_duration_seconds || 0;
        const netMs = checkOutTime - checkInTime - (breakSecs * 1000);
        durationHours = Math.max(0, netMs / (1000 * 60 * 60));
        otHours = Math.max(0, durationHours - shiftHours);
      } else {
        // Active session for today
        const breakSecs = row.total_break_duration_seconds || 0;
        const netMs = Date.now() - checkInTime - (breakSecs * 1000);
        durationHours = Math.max(0, netMs / (1000 * 60 * 60));
        otHours = Math.max(0, durationHours - shiftHours);
      }
      
      return {
        ...row,
        hours_worked: durationHours,
        shift_hours: shiftHours,
        ot_hours: otHours,
        check_out: forgotCheckout ? row.check_in : row.check_out,
        forgot_checkout: forgotCheckout
      };
    });

    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get attendance analytics (weekly rates)
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const weeklyQuery = await pool.query(`
      SELECT date, COUNT(DISTINCT employee_id) as present_count 
      FROM employee_attendance 
      WHERE date >= CURRENT_DATE - INTERVAL '6 days' AND status != 'Holiday'
      GROUP BY date 
      ORDER BY date ASC
    `);
    
    const totalEmployeesRes = await pool.query("SELECT COUNT(*) FROM employees WHERE status = 'Active'");
    const totalEmployees = parseInt(totalEmployeesRes.rows[0].count) || 1;

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const last7Days = [];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = daysOfWeek[d.getDay()];
      
      const dayData = weeklyQuery.rows.find(row => {
        const rowDate = new Date(row.date).toISOString().split('T')[0];
        return rowDate === dateStr;
      });
      
      const present = dayData ? parseInt(dayData.present_count) : 0;
      const rate = Math.min(100, Math.round((present / totalEmployees) * 100));
      
      last7Days.push({
        label: dayName,
        rate: rate
      });
    }

    res.json({
      weekly: last7Days,
      monthly: last7Days
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get dashboard statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Total employees count
    const totalEmployeesRes = await pool.query("SELECT COUNT(*) FROM employees WHERE status = 'Active'");
    const totalEmployees = parseInt(totalEmployeesRes.rows[0].count);

    // Get today's attendance logs
    const todayLogs = await pool.query(`
      SELECT DISTINCT ON (employee_id) 
             employee_id, check_out, on_break, status
      FROM employee_attendance
      WHERE date = CURRENT_DATE
      ORDER BY employee_id, check_in DESC
    `);

    let present = 0;
    let late = 0;
    let onBreak = 0;
    let checkedOut = 0;
    let holidays = 0;
    let leaves = 0;

    todayLogs.rows.forEach(log => {
      if (log.status === 'Holiday') {
        holidays++;
      } else if (log.status === 'Leave') {
        leaves++;
      } else if (log.check_out) {
        checkedOut++;
      } else if (log.on_break) {
        onBreak++;
      } else {
        present++;
      }

      if (log.status === 'Late') {
        late++;
      }
    });

    const absent = Math.max(0, totalEmployees - present - onBreak - checkedOut);

    res.json({
      total_employees: totalEmployees,
      present_now: present,
      late_today: late,
      on_break: onBreak,
      checked_out: checkedOut,
      absent: absent,
      holidays: holidays,
      leaves: leaves
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all sessions for a specific employee on a specific date
router.get('/employee-date', authenticateToken, async (req, res) => {
  const { employee_id, date } = req.query;
  if (!employee_id || !date) {
    return res.status(400).json({ error: 'Employee ID and date are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, check_in, check_out, status, total_break_duration_seconds FROM employee_attendance WHERE employee_id = $1 AND date = $2 ORDER BY check_in ASC',
      [employee_id, date]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a specific attendance session
router.put('/session/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { check_in, check_out } = req.body;
  if (!check_in) {
    return res.status(400).json({ error: 'Check-in time is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE employee_attendance SET check_in = $1, check_out = $2 WHERE id = $3 RETURNING *',
      [check_in, check_out || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance log not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a specific attendance session
router.delete('/session/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM employee_attendance WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance log not found.' });
    }

    res.json({ message: 'Attendance log deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit attendance record and log it in audit history
router.post('/edit', authenticateToken, async (req, res) => {
  const { attendance_id, new_check_in, new_check_out, reason } = req.body;
  const edited_by = req.user.username;

  if (!attendance_id || !reason) {
    return res.status(400).json({ error: 'Attendance ID and reason are required' });
  }

  try {
    // Fetch original check_in and check_out
    const originalRes = await pool.query(
      'SELECT employee_id, check_in, check_out FROM employee_attendance WHERE id = $1',
      [attendance_id]
    );

    if (originalRes.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    const { employee_id, check_in: original_check_in, check_out: original_check_out } = originalRes.rows[0];

    // Log the edit
    await pool.query(
      `INSERT INTO edited_attendance 
       (attendance_id, employee_id, original_check_in, original_check_out, new_check_in, new_check_out, edited_by, reason) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [attendance_id, employee_id, original_check_in, original_check_out, new_check_in || null, new_check_out || null, edited_by, reason]
    );

    // Update employee_attendance
    await pool.query(
      `UPDATE employee_attendance 
       SET check_in = $1, check_out = $2, remarks = 'Edited' 
       WHERE id = $3`,
      [new_check_in || null, new_check_out || null, attendance_id]
    );

    res.json({ message: 'Attendance record updated and logged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all edited attendance audit logs (Admin/Developer only)
router.get('/edited-logs', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    if (userRole !== 'admin' && userRole !== 'developer') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(`
      SELECT ea.*, emp.name as employee_name, emp.employee_id as employee_code
      FROM edited_attendance ea
      JOIN employees emp ON ea.employee_id = emp.id
      ORDER BY ea.edited_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get personal attendance stats for currently logged in employee
router.get('/personal-stats', authenticateToken, async (req, res) => {
  const usernameLower = req.user.username.toLowerCase();
  
  try {
    // Find employee by employee_code (employee_id) or by name
    const empRes = await pool.query(
      `SELECT * FROM employees WHERE LOWER(employee_id) = $1 OR LOWER(name) = $1`,
      [usernameLower]
    );
    
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee profile not found' });
    }
    
    const employee = empRes.rows[0];
    const employeeId = employee.id;
    
    // Fetch all logs of this employee for the current month
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-indexed
    
    const logsRes = await pool.query(
      `SELECT * FROM employee_attendance 
       WHERE employee_id = $1 
         AND EXTRACT(YEAR FROM date) = $2 
         AND EXTRACT(MONTH FROM date) = $3
       ORDER BY date ASC`,
      [employeeId, currentYear, currentMonth]
    );
    
    // Calculate stats
    const totalDays = logsRes.rows.length;
    const daysPresent = new Set(logsRes.rows.filter(log => log.status === 'Present' || log.status === 'Late').map(log => log.date.toISOString().split('T')[0])).size;
    const daysLate = new Set(logsRes.rows.filter(log => log.status === 'Late').map(log => log.date.toISOString().split('T')[0])).size;
    
    let totalHours = 0;
    logsRes.rows.forEach(log => {
      const checkInTime = new Date(log.check_in).getTime();
      const checkOutTime = log.check_out ? new Date(log.check_out).getTime() : new Date().getTime();
      const breakSecs = log.total_break_duration_seconds || 0;
      const sessionMs = checkOutTime - checkInTime - (breakSecs * 1000);
      totalHours += Math.max(0, sessionMs / (1000 * 60 * 60));
    });
    
    // Standard shifts hours
    const standardHoursPerShift = parseFloat(employee.shift_hours) || 12.0;
    const expectedHours = daysPresent * standardHoursPerShift;
    const overtime = Math.max(0, totalHours - expectedHours);
    
    res.json({
      employee_id: employee.employee_id,
      name: employee.name,
      shift: employee.shift,
      department: employee.department,
      position: employee.position,
      days_present: daysPresent,
      days_late: daysLate,
      total_hours: parseFloat(totalHours.toFixed(2)),
      overtime: parseFloat(overtime.toFixed(2)),
      monthly_logs: logsRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

