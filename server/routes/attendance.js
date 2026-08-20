const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Middleware to auto checkout old sessions (> 23 hours)
const autoCheckoutOldSessions = async (req, res, next) => {
  try {
    // Auto checkout: set check_out to NOW() (the actual checkout time)
    // Runs for sessions that have been open for more than 23 hours
    await pool.query(`
      UPDATE employee_attendance 
      SET check_out = NOW(),
          on_break = false,
          break_start = null,
          remarks = 'automatically system check out'
      WHERE check_out IS NULL 
        AND check_in < NOW() - INTERVAL '23 hours'
    `);
  } catch (err) {
    console.error('Error auto checking out old sessions:', err.message);
  }
  next();
};

router.use(autoCheckoutOldSessions);

// GET notifications for attendance (> 15 hours checked in)
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    const username = req.user.username;

    // Find if the logged-in user is an employee
    let employeeId = null;
    if (userRole === 'employee') {
      const empRes = await pool.query(
        `SELECT id FROM employees WHERE LOWER(name) = LOWER($1) OR LOWER(employee_id) = LOWER($1)`,
        [username]
      );
      if (empRes.rows.length > 0) {
        employeeId = empRes.rows[0].id;
      }
    }

    // Query active sessions running for more than 15 hours
    let query = `
      SELECT ea.id, ea.employee_id, e.name AS employee_name, ea.check_in, e.employee_id AS employee_code
      FROM employee_attendance ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE ea.check_out IS NULL
        AND ea.check_in < NOW() - INTERVAL '15 hours'
    `;
    
    const params = [];
    if (userRole === 'employee') {
      if (employeeId) {
        query += ` AND ea.employee_id = $1`;
        params.push(employeeId);
      } else {
        return res.json([]);
      }
    }

    const result = await pool.query(query, params);

    const notifications = result.rows.map(row => ({
      id: `attendance-warning-${row.id}`,
      type: 'attendance_warning',
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      employee_code: row.employee_code,
      check_in: row.check_in,
      message: `${row.employee_name} (${row.employee_code || 'EMP-' + row.employee_id}) has been checked in for more than 15 hours.`
    }));

    let requestNotifs = [];
    if (userRole === 'admin' || userRole === 'developer') {
      const requestsRes = await pool.query(
        `SELECT r.id, e.name AS employee_name, r.created_at
         FROM attendance_edit_requests r
         JOIN employees e ON r.employee_id = e.id
         WHERE r.status = 'Pending' AND r.target_role IN ('Admin', 'Both')`
      );
      requestNotifs = requestsRes.rows.map(row => ({
        id: `attendance-request-${row.id}`,
        type: 'attendance_request',
        created_at: row.created_at,
        message: `Attendance request from ${row.employee_name} pending Admin approval.`
      }));
    } else if (userRole === 'operator') {
      const requestsRes = await pool.query(
        `SELECT r.id, e.name AS employee_name, r.created_at
         FROM attendance_edit_requests r
         JOIN employees e ON r.employee_id = e.id
         WHERE r.status = 'Pending' AND r.target_role IN ('Operator', 'Both')`
      );
      requestNotifs = requestsRes.rows.map(row => ({
        id: `attendance-request-${row.id}`,
        type: 'attendance_request',
        created_at: row.created_at,
        message: `Attendance request from ${row.employee_name} pending Operator approval.`
      }));
    } else if (userRole === 'employee' && employeeId) {
      // 1. Approved requests
      const approvedRes = await pool.query(
        `SELECT r.id, r.created_at, r.request_type 
         FROM attendance_edit_requests r 
         WHERE r.status = 'Approved' AND r.employee_id = $1 AND r.created_at > NOW() - INTERVAL '7 days'`,
        [employeeId]
      );
      requestNotifs = approvedRes.rows.map(row => ({
        id: `attendance-approved-${row.id}`,
        type: 'attendance_approved',
        created_at: row.created_at,
        message: `Your ${row.request_type} request has been approved.`
      }));

      // 2. Late or Absent status for today
      const todayRes = await pool.query(
        `SELECT attendance_status FROM employee_attendance 
         WHERE employee_id = $1 AND DATE(check_in) = CURRENT_DATE`,
        [employeeId]
      );

      if (todayRes.rows.length > 0) {
        // Checked in today, check if late
        const todayStatus = todayRes.rows[0].attendance_status;
        if (todayStatus === 'Late') {
          requestNotifs.push({
            id: `attendance-late-${employeeId}-${new Date().toDateString()}`,
            type: 'attendance_warning',
            created_at: new Date().toISOString(),
            message: `You have been marked as Late for today.`
          });
        }
      } else {
        // Not checked in today, check if absent
        const empDataRes = await pool.query(`SELECT shift FROM employees WHERE id = $1`, [employeeId]);
        const shiftsRes = await pool.query(`SELECT name, start_time, end_time FROM shifts`);
        
        if (empDataRes.rows.length > 0) {
          const empShift = empDataRes.rows[0].shift;
          if (evaluateShiftStart(empShift, shiftsRes.rows)) {
            requestNotifs.push({
              id: `attendance-absent-${employeeId}-${new Date().toDateString()}`,
              type: 'attendance_warning',
              created_at: new Date().toISOString(),
              message: `You have been marked as Absent for today.`
            });
          }
        }
      }
    }

    res.json([...notifications, ...requestNotifs]);
  } catch (err) {
    console.error('Error fetching attendance warnings:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// Helper to evaluate if a shift has started based on current time
const evaluateShiftStart = (shiftName, shiftsList) => {
  const shift = shiftsList.find(s => s.name.toUpperCase() === (shiftName || 'R1').toUpperCase());
  let startHour = 10, startMin = 0;
  if (shift && shift.start_time) {
    const timeMatch = shift.start_time.match(/^(\d+):(\d+)/);
    if (timeMatch) {
      startHour = parseInt(timeMatch[1], 10);
      startMin = parseInt(timeMatch[2], 10);
    }
  } else {
    if (shiftName === 'R2') startHour = 9;
    else if (shiftName === 'R3') startHour = 15;
  }
  
  const now = new Date();
  const currentHours = now.getHours();
  const currentMins = now.getMinutes();
  
  return (currentHours > startHour) || (currentHours === startHour && currentMins >= startMin);
};

// Get today's attendance status for all active employees
router.get('/today', authenticateToken, async (req, res) => {
  try {
    // Fetch all active employees
    let queryStr = `
      SELECT id as employee_id, name, role, working_hours as shift, shift_hours, status as employee_status, employee_id as employee_code, department, branch, shift as new_shift
      FROM employees
      WHERE status = 'Active'
    `;
    const queryParams = [];
    const userRole = req.user.role?.toLowerCase();
    if (userRole === 'operator') {
      if (req.user.shift) {
        queryStr += ` AND COALESCE(shift, 'Day') = ANY($1)`;
        queryParams.push(req.user.shift.split(',').map(s => s.trim()));
      }
      if (req.user.branch) {
        if (queryParams.length === 1) {
          queryStr += ` AND COALESCE(branch, '') = ANY($2)`;
        } else {
          queryStr += ` AND COALESCE(branch, '') = ANY($1)`;
        }
        queryParams.push(req.user.branch.split(',').map(s => s.trim()));
      }
    }
    queryStr += ` ORDER BY id ASC`;
    const activeEmps = await pool.query(queryStr, queryParams);

    // Fetch all today's attendance sessions
    const sessions = await pool.query(`
      SELECT id as attendance_id, employee_id, check_in, check_out, status as attendance_status, on_break, break_start, total_break_duration_seconds, remarks, shift_start_time, shift_end_time
      FROM employee_attendance
      WHERE date = CURRENT_DATE OR check_out IS NULL
      ORDER BY check_in ASC
    `);

    // Fetch all shifts for shift timing checks
    const shiftsData = await pool.query(`SELECT name, start_time FROM employee_working_hours`);
    const shiftsList = shiftsData.rows;

    // Group sessions by employee ID
    const sessionsMap = {};
    sessions.rows.forEach(row => {
      if (!sessionsMap[row.employee_id]) {
        sessionsMap[row.employee_id] = [];
      }
      sessionsMap[row.employee_id].push(row);
    });

    // Fetch pending requests
    const pendingRequests = await pool.query(`
      SELECT id as request_id, employee_id, attendance_id, request_type, requested_check_in, requested_check_out, reason, created_at
      FROM attendance_edit_requests
      WHERE status = 'Pending'
    `);

    // Group requests by employee ID
    const requestsMap = {};
    pendingRequests.rows.forEach(row => {
      if (!requestsMap[row.employee_id]) {
        requestsMap[row.employee_id] = [];
      }
      requestsMap[row.employee_id].push(row);
    });

    const employeesWithAttendance = activeEmps.rows.map(emp => {
      const empSessions = sessionsMap[emp.employee_id] || [];
      const empRequests = requestsMap[emp.employee_id] || [];
      
      // Calculate today's total hours worked so far across all sessions
      let totalHoursToday = 0;
      let totalBreakSecondsToday = 0;
      empSessions.forEach(row => {
        const checkInTime = new Date(row.check_in).getTime();
        const checkOutTime = row.check_out ? new Date(row.check_out).getTime() : Date.now();
        let breakSecs = row.total_break_duration_seconds || 0;
        if (row.on_break && row.break_start) {
          breakSecs += Math.floor((Date.now() - new Date(row.break_start).getTime()) / 1000);
        }
        totalBreakSecondsToday += breakSecs;
        const sessionMs = checkOutTime - checkInTime - (breakSecs * 1000);
        totalHoursToday += Math.max(0, sessionMs / (1000 * 60 * 60));
      });

      // Get current active state: last session status
      const lastSession = empSessions[empSessions.length - 1] || null;
      
      let calculatedStatus = 'Absent';
      if (empSessions.length > 0) {
        const st = lastSession.attendance_status;
        if (st === 'Holiday') calculatedStatus = 'Holiday';
        else if (st === 'Leave') calculatedStatus = 'Leave';
        else if (lastSession.check_out) calculatedStatus = 'Checked Out';
        else if (lastSession.on_break) calculatedStatus = 'On Break';
        else if (st === 'Late') calculatedStatus = 'Late';
        else calculatedStatus = 'Present';
      } else if (!evaluateShiftStart(emp.shift, shiftsList)) {
        calculatedStatus = 'Pending';
      }

      return {
        ...emp,
        sessions: empSessions, // Return all sessions to show stacked inside one row
        pending_requests: empRequests, // Include pending requests
        attendance_id: lastSession ? lastSession.attendance_id : null,
        check_in: lastSession ? lastSession.check_in : null,
        check_out: lastSession ? lastSession.check_out : null,
        attendance_status: lastSession ? lastSession.attendance_status : null,
        on_break: lastSession ? lastSession.on_break : false,
        break_start: lastSession ? lastSession.break_start : null,
        total_hours_today: totalHoursToday,
        total_break_seconds_today: totalBreakSecondsToday,
        calculated_status: calculatedStatus
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
  const userRole = req.user?.role?.toLowerCase();
  
  try {
    // Check if there is an active session (check_out is NULL)
    const activeSession = await pool.query(
      'SELECT id FROM employee_attendance WHERE employee_id = $1 AND check_out IS NULL',
      [employee_id]
    );

    if (activeSession.rows.length > 0) {
      return res.status(400).json({ error: 'Employee is already checked in.' });
    }

    // Fetch employee shift details
    const empRes = await pool.query('SELECT working_hours, shift_hours, shift FROM employees WHERE id = $1', [employee_id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    const shift = empRes.rows[0].working_hours || 'R1';
    let shiftHours = parseFloat(empRes.rows[0].shift_hours || 12.0);
    const empShift = empRes.rows[0].shift || 'Day';

    // Determine status (Present or Late)
    // Check if it's the first check-in of the day
    const priorChecks = await pool.query(
      'SELECT id, status FROM employee_attendance WHERE employee_id = $1 AND date = CURRENT_DATE',
      [employee_id]
    );

    let status = 'Present';
    let shiftStartTime = '10:00';
    let shiftEndTime = '23:00';
    let isSplitShift = false;
    let shiftStartTime2 = null;
    let shiftEndTime2 = null;
    let startHour = 10;
    let startMin = 0;

    const shiftDetails = await pool.query('SELECT * FROM employee_working_hours WHERE name = $1', [shift]);
    if (shiftDetails.rows.length > 0) {
      const sd = shiftDetails.rows[0];
      shiftStartTime = sd.start_time;
      shiftEndTime = sd.end_time;
      isSplitShift = sd.is_split_shift || false;
      shiftStartTime2 = sd.start_time_2 || null;
      shiftEndTime2 = sd.end_time_2 || null;
      if (sd.hours) {
        shiftHours = parseFloat(sd.hours);
      }

      // For split shift: determine which segment the current time belongs to
      const now = new Date();
      const currentTotalMins = now.getHours() * 60 + now.getMinutes();

      if (isSplitShift && shiftStartTime2) {
        const parseTime = (t) => {
          const m = t.match(/^(\d+):(\d+)/);
          return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
        };
        const shift1StartMins = parseTime(shiftStartTime);
        const shift2StartMins = parseTime(shiftStartTime2);
        // Midpoint between end of shift1 and start of shift2
        const shift1EndMins = parseTime(shiftEndTime);
        const midpoint = Math.floor((shift1EndMins + shift2StartMins) / 2);

        // Pick closer shift
        if (currentTotalMins >= midpoint) {
          // Current time is in shift 2 range → use shift 2 start for lateness
          startHour = Math.floor(shift2StartMins / 60);
          startMin = shift2StartMins % 60;
        } else {
          startHour = Math.floor(shift1StartMins / 60);
          startMin = shift1StartMins % 60;
        }
      } else {
        const timeMatch = shiftStartTime.match(/^(\d+):(\d+)/);
        if (timeMatch) {
          startHour = parseInt(timeMatch[1], 10);
          startMin = parseInt(timeMatch[2], 10);
        }
      }
    } else {
      if (shift === 'R2') {
        startHour = 9;
        shiftStartTime = '09:00';
        shiftEndTime = '21:00';
      } else if (shift === 'R3') {
        startHour = 15;
        shiftStartTime = '15:00';
        shiftEndTime = '04:00';
      }
    }

    if (priorChecks.rows.length > 0) {
      // If they already checked in today, keep the status of the first session of the day
      status = priorChecks.rows[0].status;
    } else {
      // First check-in: Compare current time with shift threshold (15 mins grace period)
      const now = new Date();
      const currentHours = now.getHours();
      const currentMins = now.getMinutes();

      let thresholdMins = startMin + 15;
      let thresholdHour = startHour;
      if (thresholdMins >= 60) {
        thresholdHour += 1;
        thresholdMins -= 60;
      }
      
      if (currentHours > thresholdHour || (currentHours === thresholdHour && currentMins > thresholdMins)) {
        status = 'Late';
      }
    }

    // Verify operator shift matches employee shift
    const userShifts = req.user.shift ? req.user.shift.split(',').map(s => s.trim()) : [];
    if (userRole === 'operator' && userShifts.length > 0 && !userShifts.includes(empShift)) {
      return res.status(403).json({ error: `You are only allowed to mark attendance for employees in Shift(s): ${req.user.shift}` });
    }

    const result = await pool.query(
      'INSERT INTO employee_attendance (employee_id, check_in, status, date, created_by, shift_name, shift_hours, shift_start_time, shift_end_time, is_split_shift, shift_start_time_2, shift_end_time_2) VALUES ($1, NOW(), $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [employee_id, status, req.user.username, shift, shiftHours, shiftStartTime, shiftEndTime, isSplitShift, shiftStartTime2, shiftEndTime2]
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
      SELECT ea.id, ea.employee_id, ea.check_in, ea.check_out, ea.status, ea.on_break, ea.break_start, ea.total_break_duration_seconds, ea.remarks, TO_CHAR(ea.date, 'YYYY-MM-DD') as date, ea.created_at, ea.shift_name, ea.shift_hours, ea.shift_start_time, ea.shift_end_time, e.name, e.role, e.shift as current_shift, e.shift_hours as current_shift_hours, e.employee_id as employee_code, e.department, e.branch
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
      const shiftHours = parseFloat(row.shift_hours || row.current_shift_hours || 12.0);
      
      // row.date from PostgreSQL is a JS Date object (not a string).
      // We must convert it to a local date string (YYYY-MM-DD) before comparing.
      const rowDateStr = row.date instanceof Date
        ? row.date.toLocaleDateString('en-CA')
        : String(row.date).split('T')[0];
      
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
        check_out: row.check_out,
        forgot_checkout: false
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
    const userRole = req.user.role?.toLowerCase();
    
    let weeklyQueryStr = `
      SELECT ea.date, COUNT(DISTINCT ea.employee_id) as present_count 
      FROM employee_attendance ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE ea.date >= CURRENT_DATE - INTERVAL '6 days' AND ea.status != 'Holiday'
    `;
    const weeklyParams = [];
    if (userRole === 'operator' && req.user.shift) {
      weeklyQueryStr += " AND COALESCE(e.shift, 'R1') = ANY($1)";
      weeklyParams.push(req.user.shift.split(',').map(s => s.trim()));
    }
    weeklyQueryStr += " GROUP BY ea.date ORDER BY ea.date ASC";
    const weeklyQuery = await pool.query(weeklyQueryStr, weeklyParams);
    
    let empsQueryStr = "SELECT COUNT(*) FROM employees WHERE status = 'Active'";
    const empsParams = [];
    if (userRole === 'operator' && req.user.shift) {
      empsQueryStr += " AND COALESCE(shift, 'R1') = ANY($1)";
      empsParams.push(req.user.shift.split(',').map(s => s.trim()));
    }
    const totalEmployeesRes = await pool.query(empsQueryStr, empsParams);
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
    const userRole = req.user.role?.toLowerCase();
    
    // Total employees count
    let empsQueryStr = "SELECT id, shift FROM employees WHERE status = 'Active'";
    const empsParams = [];
    if (userRole === 'operator' && req.user.shift) {
      empsQueryStr += " AND COALESCE(shift, 'R1') = ANY($1)";
      empsParams.push(req.user.shift.split(',').map(s => s.trim()));
    }
    const activeEmpsRes = await pool.query(empsQueryStr, empsParams);
    const activeEmps = activeEmpsRes.rows;
    const totalEmployees = activeEmps.length;

    // Fetch all shifts
    const shiftsData = await pool.query(`SELECT name, start_time FROM employee_working_hours`);
    const shiftsList = shiftsData.rows;

    // Get today's attendance logs
    let logsQueryStr = `
      SELECT DISTINCT ON (ea.employee_id) 
             ea.employee_id, ea.check_out, ea.on_break, ea.status
      FROM employee_attendance ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE ea.date = CURRENT_DATE
    `;
    const logsParams = [];
    if (userRole === 'operator' && req.user.shift) {
      logsQueryStr += " AND COALESCE(e.shift, 'R1') = ANY($1)";
      logsParams.push(req.user.shift.split(',').map(s => s.trim()));
    }
    logsQueryStr += " ORDER BY ea.employee_id, ea.check_in DESC";
    
    const todayLogs = await pool.query(logsQueryStr, logsParams);

    let present = 0;
    let late = 0;
    let onBreak = 0;
    let checkedOut = 0;
    let holidays = 0;
    let leaves = 0;

    const activeEmployeeIdsWithActivity = new Set();

    todayLogs.rows.forEach(log => {
      activeEmployeeIdsWithActivity.add(log.employee_id);
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

    let absent = 0;
    let pending = 0;

    activeEmps.forEach(emp => {
      if (!activeEmployeeIdsWithActivity.has(emp.id)) {
        if (evaluateShiftStart(emp.shift, shiftsList)) {
          absent++;
        } else {
          pending++;
        }
      }
    });

    res.json({
      total_employees: totalEmployees,
      present_now: present,
      late_today: late,
      on_break: onBreak,
      checked_out: checkedOut,
      absent: absent,
      pending: pending,
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

  const userRole = req.user.role?.toLowerCase();
  if (userRole === 'operator') {
    // We allow operators to view today's attendance only
    const clientDateStr = String(date);
    const serverTodayStr = new Date().toLocaleDateString('en-CA');
    // If you want to strictly enforce it, we can check. However, sometimes client and server tz differ slightly.
    // Let's just trust the date if they are editing from TodayAttendance.
  }

  try {
    const result = await pool.query(
      "SELECT id, check_in, check_out, status, total_break_duration_seconds FROM employee_attendance WHERE employee_id = $1 AND TO_CHAR(date, 'YYYY-MM-DD') = $2 ORDER BY check_in ASC",
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
    const sessionRes = await pool.query('SELECT date FROM employee_attendance WHERE id = $1', [id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Attendance log not found.' });
    
    const recordDate = sessionRes.rows[0].date;
    const userRole = req.user.role?.toLowerCase();
    
    if (userRole === 'operator') {
      // Allow if record date is within the last 48 hours to account for night shifts and timezones
      const recordTime = recordDate instanceof Date ? recordDate.getTime() : new Date(recordDate).getTime();
      const nowTime = Date.now();
      const diffHours = Math.abs(nowTime - recordTime) / (1000 * 60 * 60);
      
      if (diffHours > 48) {
        return res.status(403).json({ error: "Access denied: Operators can only modify recent attendance." });
      }
    } else if (userRole !== 'admin' && userRole !== 'developer') {
      return res.status(403).json({ error: 'Access denied: Only Admins can modify attendance.' });
    }

    const result = await pool.query(
      'UPDATE employee_attendance SET check_in = $1, check_out = $2 WHERE id = $3 RETURNING *',
      [check_in, check_out || null, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new manual attendance session
router.post('/session', authenticateToken, async (req, res) => {
  const { employee_id, date, check_in, check_out, status } = req.body;
  if (!employee_id || !date || !check_in) {
    return res.status(400).json({ error: 'Employee ID, date, and check-in time are required' });
  }
  
  if (check_in && new Date(check_in).getTime() > Date.now()) {
    return res.status(400).json({ error: 'Check-in time cannot be in the future.' });
  }
  if (check_out && new Date(check_out).getTime() > Date.now()) {
    return res.status(400).json({ error: 'Check-out time cannot be in the future.' });
  }
  
  if (!check_out) {
    const activeSession = await pool.query(
      `SELECT id FROM employee_attendance WHERE employee_id = $1 AND check_out IS NULL`,
      [employee_id]
    );
    if (activeSession.rows.length > 0) {
      return res.status(400).json({ error: 'This employee is already checked in and has not checked out.' });
    }
  }

  const userRole = req.user.role?.toLowerCase();
  if (userRole === 'operator') {
    const recordTime = new Date(date).getTime();
    const nowTime = Date.now();
    const diffHours = Math.abs(nowTime - recordTime) / (1000 * 60 * 60);
    if (diffHours > 48) {
      return res.status(403).json({ error: "Access denied: Operators can only add recent attendance." });
    }
  } else if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Access denied: Only Admins can modify attendance.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO employee_attendance (employee_id, date, check_in, check_out, status, created_by, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [employee_id, date, check_in, check_out || null, status || 'Present', req.user.username, 'Manual']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a specific attendance session
router.delete('/session/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const sessionRes = await pool.query('SELECT date FROM employee_attendance WHERE id = $1', [id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Attendance log not found.' });
    
    const recordDate = sessionRes.rows[0].date;
    const userRole = req.user.role?.toLowerCase();
    
    if (userRole === 'operator') {
      const recordTime = recordDate instanceof Date ? recordDate.getTime() : new Date(recordDate).getTime();
      const nowTime = Date.now();
      const diffHours = Math.abs(nowTime - recordTime) / (1000 * 60 * 60);
      if (diffHours > 48) {
        return res.status(403).json({ error: "Access denied: Operators can only delete recent attendance." });
      }
    } else if (userRole !== 'admin' && userRole !== 'developer') {
      return res.status(403).json({ error: 'Access denied: Only Admins can modify attendance.' });
    }

    const result = await pool.query(
      'DELETE FROM employee_attendance WHERE id = $1 RETURNING *',
      [id]
    );

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

  if (new_check_in && new Date(new_check_in).getTime() > Date.now()) {
    return res.status(400).json({ error: 'Check-in time cannot be in the future.' });
  }
  if (new_check_out && new Date(new_check_out).getTime() > Date.now()) {
    return res.status(400).json({ error: 'Check-out time cannot be in the future.' });
  }

  try {
    // Fetch original check_in and check_out
    const originalRes = await pool.query(
      'SELECT employee_id, check_in, check_out, created_by, date FROM employee_attendance WHERE id = $1',
      [attendance_id]
    );

    if (originalRes.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    const { employee_id, check_in: original_check_in, check_out: original_check_out, created_by, date: recordDate } = originalRes.rows[0];

    // Restrictions for Operator role
    const userRole = req.user.role?.toLowerCase();
    if (userRole === 'operator') {
      const recordTime = recordDate instanceof Date ? recordDate.getTime() : new Date(recordDate).getTime();
      const nowTime = Date.now();
      const diffHours = Math.abs(nowTime - recordTime) / (1000 * 60 * 60);
      if (diffHours > 48) {
        return res.status(403).json({ error: "Access denied: Operators can only modify recent attendance." });
      }
    } else if (userRole !== 'admin' && userRole !== 'developer') {
      return res.status(403).json({ error: 'Access denied: Only Admins can modify attendance.' });
    }

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
    if (userRole !== 'admin' && userRole !== 'developer' && userRole !== 'operator') {
      return res.status(403).json({ error: 'Access denied' });
    }

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    let offset = (page - 1) * limit;
    let month = req.query.month; // format 'YYYY-MM'

    let queryStr = `
      SELECT ea.*, emp.name as employee_name, emp.employee_id as employee_code
      FROM edited_attendance ea
      JOIN employees emp ON ea.employee_id = emp.id
    `;
    const params = [];
    let paramCount = 1;

    // Filters
    const conditions = [];
    if (userRole === 'operator') {
      conditions.push(`ea.edited_by = $${paramCount++}`);
      params.push(req.user.username);
    }
    if (month) {
      conditions.push(`TO_CHAR(ea.edited_at, 'YYYY-MM') = $${paramCount++}`);
      params.push(month);
    }

    if (conditions.length > 0) {
      queryStr += ` WHERE ` + conditions.join(' AND ');
    }

    // Sort order: Today's logs first, then remaining sorted descending
    queryStr += ` ORDER BY CASE WHEN ea.edited_at::date = CURRENT_DATE THEN 0 ELSE 1 END ASC, ea.edited_at DESC`;

    // Fetch total count for pagination
    let countQuery = `
      SELECT COUNT(*) 
      FROM edited_attendance ea
      JOIN employees emp ON ea.employee_id = emp.id
    `;
    if (conditions.length > 0) {
      countQuery += ` WHERE ` + conditions.join(' AND ');
    }
    const countRes = await pool.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count);

    // Apply pagination
    queryStr += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(limit, offset);

    const result = await pool.query(queryStr, params);
    
    res.json({
      logs: result.rows,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get personal attendance stats for currently logged in employee
router.get('/personal-stats', authenticateToken, async (req, res) => {
  const usernameLower = req.user.username.toLowerCase();
  
  try {
    // Find employee by employee_id linkage or employee_code or by name
    const empRes = await pool.query(
      `SELECT * FROM employees 
       WHERE id = (SELECT employee_id FROM users WHERE id = $1)
          OR LOWER(employee_id) = $2 
          OR LOWER(name) = $2`,
      [req.user.id, usernameLower]
    );
    
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee profile not found' });
    }
    
    const employee = empRes.rows[0];
    const employeeId = employee.id;
    
    // Fetch all logs of this employee for the filtered month or current month
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth() + 1; // 1-indexed
    
    if (req.query.month) {
      const parts = req.query.month.split('-');
      currentYear = parseInt(parts[0], 10);
      currentMonth = parseInt(parts[1], 10);
    }
    
    const logsRes = await pool.query(
      `SELECT * FROM employee_attendance 
       WHERE employee_id = $1 
         AND EXTRACT(YEAR FROM date) = $2 
         AND EXTRACT(MONTH FROM date) = $3
       ORDER BY date DESC, check_in DESC`,
      [employeeId, currentYear, currentMonth]
    );
    
    // Calculate stats
    const totalDays = logsRes.rows.length;
    const daysPresent = new Set(logsRes.rows.filter(log => log.status === 'Present' || log.status === 'Late').map(log => log.date.toISOString().split('T')[0])).size;
    const daysLate = new Set(logsRes.rows.filter(log => log.status === 'Late').map(log => log.date.toISOString().split('T')[0])).size;
    
    let totalHours = 0;
    let expectedHours = 0;
    let processedDates = new Set();
    
    logsRes.rows.forEach(log => {
      const dateStr = log.date.toISOString().split('T')[0];
      if ((log.status === 'Present' || log.status === 'Late') && !processedDates.has(dateStr)) {
        processedDates.add(dateStr);
        expectedHours += parseFloat(log.shift_hours || employee.shift_hours || 12.0);
      }

      const checkInTime = new Date(log.check_in).getTime();
      const checkOutTime = log.check_out ? new Date(log.check_out).getTime() : new Date().getTime();
      const breakSecs = log.total_break_duration_seconds || 0;
      const sessionMs = checkOutTime - checkInTime - (breakSecs * 1000);
      totalHours += Math.max(0, sessionMs / (1000 * 60 * 60));
    });
    
    const overtime = Math.max(0, totalHours - expectedHours);
    
    // Fetch pending requests for this employee
    const reqsRes = await pool.query(
      `SELECT * FROM attendance_edit_requests 
       WHERE employee_id = $1 AND status = 'Pending'`,
      [employeeId]
    );

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
      monthly_logs: logsRes.rows,
      pending_requests: reqsRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create edit request (Employee only or general)
router.post('/edit-requests', authenticateToken, async (req, res) => {
  const { attendance_id, requested_check_in, requested_check_out, reason, target_role, request_type } = req.body;
  const type = request_type || 'Edit';
  
  if (!reason) {
    return res.status(400).json({ error: 'Reason is required' });
  }
  
  if (requested_check_in && new Date(requested_check_in).getTime() > Date.now()) {
    return res.status(400).json({ error: 'Requested check-in time cannot be in the future.' });
  }
  if (requested_check_out && new Date(requested_check_out).getTime() > Date.now()) {
    return res.status(400).json({ error: 'Requested check-out time cannot be in the future.' });
  }

  if (!reason || !target_role) {
    return res.status(400).json({ error: 'Missing required fields: reason, target_role' });
  }
  if (type === 'Edit' && !attendance_id) {
    return res.status(400).json({ error: 'Missing required field: attendance_id for Edit request' });
  }

  try {
    // Find employee_id from current user
    const username = req.user.username;
    const empRes = await pool.query(
      `SELECT id FROM employees WHERE LOWER(name) = LOWER($1) OR LOWER(employee_id) = LOWER($1) OR id = (SELECT employee_id FROM users WHERE id = $2)`,
      [username, req.user.id]
    );

    if (empRes.rows.length === 0) {
      return res.status(403).json({ error: 'You are not linked to an employee account to make requests.' });
    }
    const employee_id = empRes.rows[0].id;
    
    if (type === 'Check-In') {
      const activeSession = await pool.query(
        `SELECT id FROM employee_attendance WHERE employee_id = $1 AND check_out IS NULL`,
        [employee_id]
      );
      if (activeSession.rows.length > 0) {
        return res.status(400).json({ error: 'You are already checked in. Please check out first.' });
      }
    }

    const result = await pool.query(
      `INSERT INTO attendance_edit_requests (attendance_id, employee_id, requested_by_user_id, target_role, requested_check_in, requested_check_out, reason, status, request_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8) RETURNING *`,
      [attendance_id || null, employee_id, req.user.id, target_role, requested_check_in || null, requested_check_out || null, reason, type]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating edit request:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET all edit requests (filtered by user role)
router.get('/edit-requests', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    const username = req.user.username;

    let query = `
      SELECT r.*, e.name AS employee_name, e.employee_id AS employee_code, 
             ea.check_in AS original_check_in, ea.check_out AS original_check_out, ea.date AS attendance_date
      FROM attendance_edit_requests r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN employee_attendance ea ON r.attendance_id = ea.id
    `;
    const params = [];

    if (userRole === 'admin' || userRole === 'developer') {
      query += ` WHERE r.target_role IN ('Admin', 'Both')`;
    } else if (userRole === 'operator') {
      query += ` WHERE r.target_role IN ('Operator', 'Both')`;
    } else {
      // Employee role: show their own requests
      // Find employee ID
      const empRes = await pool.query(
        `SELECT id FROM employees WHERE LOWER(name) = LOWER($1) OR LOWER(employee_id) = LOWER($1) OR id = (SELECT employee_id FROM users WHERE id = $2)`,
        [username, req.user.id]
      );
      if (empRes.rows.length === 0) {
        return res.json([]);
      }
      query += ` WHERE r.employee_id = $1`;
      params.push(empRes.rows[0].id);
    }

    query += ` ORDER BY r.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching edit requests:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST action (Approve/Reject) on edit request
router.post('/edit-requests/:id/action', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { action, edited_check_in, edited_check_out } = req.body; // Allow passing edited time during approval
  
  if (!['Approve', 'Reject'].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Must be 'Approve' or 'Reject'" });
  }

  try {
    const requestRes = await pool.query(
      `SELECT r.*, ea.check_in AS original_check_in, ea.check_out AS original_check_out
       FROM attendance_edit_requests r
       LEFT JOIN employee_attendance ea ON r.attendance_id = ea.id
       WHERE r.id = $1`,
      [id]
    );

    if (requestRes.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestRes.rows[0];
    if (request.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been processed.' });
    }

    const editorName = req.user.username;

    if (action === 'Approve') {
      // Determine effective times (use edited time from operator if provided, otherwise the requested time)
      const effectiveCheckIn = edited_check_in || request.requested_check_in;
      const effectiveCheckOut = edited_check_out || request.requested_check_out;

      if (effectiveCheckIn && new Date(effectiveCheckIn).getTime() > Date.now()) {
        return res.status(400).json({ error: 'Approved check-in time cannot be in the future.' });
      }
      if (effectiveCheckOut && new Date(effectiveCheckOut).getTime() > Date.now()) {
        return res.status(400).json({ error: 'Approved check-out time cannot be in the future.' });
      }

      // Operator date constraint: only today and yesterday
      const attendanceDate = new Date(request.attendance_date || effectiveCheckIn || Date.now());
      const today = new Date();
      today.setHours(0,0,0,0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (req.user.role?.toLowerCase() === 'operator' && attendanceDate < yesterday) {
        return res.status(403).json({ error: 'Operators can only approve requests for today and yesterday. Please reject this request or forward it to the Admin.' });
      }

      // 1. Update status to Approved
      await pool.query(
        `UPDATE attendance_edit_requests SET status = 'Approved' WHERE id = $1`,
        [id]
      );

      let finalAttendanceId = request.attendance_id;

      if (request.request_type === 'Check-In' && !request.attendance_id) {
        const activeSession = await pool.query(
          `SELECT id FROM employee_attendance WHERE employee_id = $1 AND check_out IS NULL`,
          [request.employee_id]
        );
        if (activeSession.rows.length > 0) {
          return res.status(400).json({ error: 'Cannot approve check-in: employee is already checked in.' });
        }
        
        // Determine status (Late/Present)
        const activeEmp = await pool.query('SELECT shift, working_hours FROM employees WHERE id = $1', [request.employee_id]);
        const shiftName = activeEmp.rows[0]?.working_hours || activeEmp.rows[0]?.shift;
        const shiftsData = await pool.query('SELECT name, start_time FROM employee_working_hours');
        const shiftsList = shiftsData.rows;
        const shift = shiftsList.find(s => s.name.toUpperCase() === (shiftName || 'R1').toUpperCase());
        
        let startHour = 10, startMin = 0;
        if (shift && shift.start_time) {
          const timeMatch = shift.start_time.match(/^(\d+):(\d+)/);
          if (timeMatch) { startHour = parseInt(timeMatch[1], 10); startMin = parseInt(timeMatch[2], 10); }
        }
        const checkInDate = new Date(effectiveCheckIn);
        const lateThreshold = new Date(checkInDate);
        lateThreshold.setHours(startHour, startMin, 0, 0);
        const isLate = checkInDate > lateThreshold;

        const attendanceDateStr = checkInDate.toLocaleDateString('en-CA'); // 'YYYY-MM-DD'

        // Insert new check-in
        const newAtt = await pool.query(
          `INSERT INTO employee_attendance (employee_id, check_in, status, created_by, date, remarks)
           VALUES ($1, $2, $3, $4, $5, 'Checked in via request approval') RETURNING id`,
          [request.employee_id, effectiveCheckIn, isLate ? 'Late' : 'Present', editorName, attendanceDateStr]
        );
        finalAttendanceId = newAtt.rows[0].id;
      } else {
        // Update existing attendance
        await pool.query(
          `UPDATE employee_attendance 
           SET check_in = COALESCE($1, check_in),
               check_out = COALESCE($2, check_out),
               remarks = 'Updated via request approval'
           WHERE id = $3`,
          [effectiveCheckIn, effectiveCheckOut, finalAttendanceId]
        );
      }

      // 3. Insert audit log in edited_attendance
      if (finalAttendanceId) {
        await pool.query(
          `INSERT INTO edited_attendance (attendance_id, employee_id, original_check_in, original_check_out, new_check_in, new_check_out, edited_by, reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            finalAttendanceId,
            request.employee_id,
            request.original_check_in,
            request.original_check_out,
            effectiveCheckIn || request.original_check_in,
            effectiveCheckOut || request.original_check_out,
            editorName,
            request.reason
          ]
        );
      }
      
      res.json({ success: true, message: 'Request approved and attendance updated successfully.' });
    } else {
      // Reject
      await pool.query(
        `UPDATE attendance_edit_requests SET status = 'Rejected' WHERE id = $1`,
        [id]
      );
      res.json({ success: true, message: 'Request rejected successfully.' });
    }
  } catch (err) {
    console.error('Error handling edit request action:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST forward request to admin (Operator only)
router.post('/edit-requests/:id/forward', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const requestRes = await pool.query(
      `SELECT * FROM attendance_edit_requests WHERE id = $1`,
      [id]
    );

    if (requestRes.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestRes.rows[0];
    if (request.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been processed.' });
    }

    const updatedReason = `${request.reason || ''} [Forwarded by Operator. Reason: ${reason || 'N/A'}]`;

    await pool.query(
      `UPDATE attendance_edit_requests 
       SET target_role = 'Admin', 
           reason = $1 
       WHERE id = $2`,
      [updatedReason, id]
    );

    res.json({ success: true, message: 'Request forwarded to Admin successfully.' });
  } catch (err) {
    console.error('Error forwarding request:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

