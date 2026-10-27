const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { clampBreakLogsToDutyWindow } = require('../utils/attendanceHelper');

let lastIo = null;

// Function to auto checkout old sessions (> 23 hours) and notify Admin, Developer, and Branch Operator
async function performAutoCheckout(io) {
  try {
    // Ensure notifications table has branch column
    await pool.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS branch VARCHAR(100)").catch(() => {});

    // Atomically check out sessions open for > 23 hours
    const result = await pool.query(`
      WITH updated AS (
        UPDATE employee_attendance 
        SET check_out = NOW(),
            on_break = false,
            break_start = null,
            remarks = 'automatically system check out'
        WHERE check_out IS NULL 
          AND check_in < NOW() - INTERVAL '23 hours'
        RETURNING id, employee_id, check_in, check_out, branch
      )
      SELECT u.id, u.employee_id, u.check_in, u.check_out,
             COALESCE(u.branch, e.branch, 'Branch 1') AS branch,
             e.name AS employee_name, e.employee_id AS employee_code
      FROM updated u
      JOIN employees e ON u.employee_id = e.id
    `);

    if (result.rows && result.rows.length > 0) {
      for (const row of result.rows) {
        const empCode = row.employee_code || ('EMP-' + row.employee_id);
        const msg = `System automatically checked out ${row.employee_name} (${empCode}) after 23+ hours of open session. [${row.branch}]`;
        
        await pool.query(
          `INSERT INTO notifications (message, type, branch, target_roles, target_users)
           VALUES ($1, 'auto_checkout_alert', $2, $3::jsonb, '[]'::jsonb)`,
          [msg, row.branch, JSON.stringify(['admin', 'developer', 'operator'])]
        ).catch(err => console.error('Error inserting auto checkout notif:', err.message));

        const emitIo = io || lastIo;
        if (emitIo) {
          emitIo.emit('attendance_alert', {
            id: `auto-checkout-${row.id}`,
            type: 'auto_checkout_alert',
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            branch: row.branch,
            message: msg,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  } catch (err) {
    console.error('Error auto checking out old sessions:', err.message);
  }
}

// Middleware to auto checkout old sessions (> 23 hours)
const autoCheckoutOldSessions = async (req, res, next) => {
  if (req.io) lastIo = req.io;
  await performAutoCheckout(req.io);
  next();
};

// Check every 5 minutes in background
setInterval(() => {
  performAutoCheckout(lastIo);
}, 5 * 60 * 1000);

router.use(autoCheckoutOldSessions);

// GET notifications for attendance (> 15 hours checked in)
// Helper: extract Saudi Arabia time & date components (Asia/Riyadh, UTC+3)
function getSaudiComponents(dateObj = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(dateObj);
  const p = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hours: parseInt(p.hour, 10),
    minutes: parseInt(p.minute, 10),
    seconds: parseInt(p.second, 10),
    dateStr: `${p.year}-${p.month}-${p.day}`,
    timeStr: `${p.hour}:${p.minute}`
  };
}

function formatSaudiTimeDisplay(dateObj = new Date(), hour12 = true) {
  return dateObj.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hour12
  });
}

// Helper to verify Operator 24-hour edit limit based on shift start time (Saudi Time)
async function verifyOperator24HourLimit(employee_id, recordDate, pool) {
  const empRes = await pool.query('SELECT working_hours FROM employees WHERE id = $1', [employee_id]);
  if (empRes.rows.length === 0) return { allowed: false, error: 'Employee not found.' };
  
  const shift = empRes.rows[0].working_hours || 'R1';
  
  let startHour = 9, startMin = 0;
  const shiftDetails = await pool.query('SELECT start_time FROM employee_working_hours WHERE UPPER(name) = UPPER($1)', [shift]);
  
  if (shiftDetails.rows.length > 0 && shiftDetails.rows[0].start_time) {
    const timeMatch = shiftDetails.rows[0].start_time.match(/^(\d+):(\d+)/);
    if (timeMatch) {
      startHour = parseInt(timeMatch[1], 10);
      startMin = parseInt(timeMatch[2], 10);
    }
  } else if (shift === 'R2') { startHour = 9; }
  else if (shift === 'R3') { startHour = 15; }

  const saudiDateForRecord = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(recordDate));
  const startHourStr = String(startHour).padStart(2, '0');
  const startMinStr = String(startMin).padStart(2, '0');
  const shiftStartDateTime = new Date(`${saudiDateForRecord}T${startHourStr}:${startMinStr}:00+03:00`);

  const diffHours = (Date.now() - shiftStartDateTime.getTime()) / (1000 * 60 * 60);
  if (diffHours > 24) {
    return { allowed: false, error: 'Operators can only modify attendance within 24 hours of the employee\'s shift start time.' };
  }
  return { allowed: true };
}

// Helper to extract branch matching variations (e.g., 'Restaurant 1' -> ['restaurant 1', 'branch 1', 'r1', '1'])
function getBranchMatchPatterns(branchStr) {
  if (!branchStr) return [];
  const branches = branchStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const patterns = new Set();
  for (const b of branches) {
    patterns.add(b);
    const numMatch = b.match(/\d+/);
    if (numMatch) {
      const num = numMatch[0];
      patterns.add(`branch ${num}`);
      patterns.add(`restaurant ${num}`);
      patterns.add(`r${num}`);
      patterns.add(num);
    }
  }
  return Array.from(patterns);
}

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
      SELECT ea.id, ea.employee_id, e.name AS employee_name, ea.check_in, e.employee_id AS employee_code,
             COALESCE(ea.branch, e.branch, 'Branch 1') AS branch
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
    } else if (userRole === 'operator') {
      // Operator should only see 15h warnings for employees in their branch
      let userBranchStr = req.user.branch;
      if (!userBranchStr) {
        const uRes = await pool.query('SELECT branch FROM users WHERE id = $1', [req.user.id]);
        if (uRes.rows.length > 0) userBranchStr = uRes.rows[0].branch;
      }
      const opPatterns = getBranchMatchPatterns(userBranchStr);
      if (opPatterns.length > 0) {
        query += ` AND LOWER(COALESCE(ea.branch, e.branch, 'Branch 1')) = ANY($${params.length + 1})`;
        params.push(opPatterns);
      } else {
        query += ` AND 1=0`;
      }
    }
    // Admin and Developer receive 15h alerts for ALL branches

    const result = await pool.query(query, params);

    const notifications = result.rows.map(row => ({
      id: `attendance-warning-${row.id}`,
      type: 'attendance_warning',
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      employee_code: row.employee_code,
      branch: row.branch,
      check_in: row.check_in,
      message: `${row.employee_name} (${row.employee_code || 'EMP-' + row.employee_id}) has been checked in for more than 15 hours. [${row.branch}]`
    }));

    let requestNotifs = [];
    if (userRole === 'admin' || userRole === 'developer') {
      const requestsRes = await pool.query(
        `SELECT r.id, e.name AS employee_name, r.created_at, r.request_type, r.reason
         FROM attendance_edit_requests r
         JOIN employees e ON r.employee_id = e.id
         WHERE r.status = 'Pending' AND r.target_role IN ('Admin', 'Both')
         ORDER BY r.created_at DESC`
      );
      requestNotifs = requestsRes.rows.map(row => {
        let msg = '';
        if (row.request_type === 'Early Check-In') {
          const cleanReason = (row.reason || '').replace(/^Early Check-In\s*/i, '').trim();
          msg = `${row.employee_name} checked in early ${cleanReason}`;
        } else if (row.request_type === 'Overtime') {
          msg = `Overtime request pending approval for ${row.employee_name}: ${row.reason}`;
        } else {
          msg = `Attendance correction request from ${row.employee_name} pending Admin approval.`;
        }
        return {
          id: `attendance-request-${row.id}`,
          type: 'attendance_request',
          request_type: row.request_type,
          created_at: row.created_at,
          employee_name: row.employee_name,
          reason: row.reason,
          message: msg
        };
      });
    } else if (userRole === 'operator') {
      let userBranchStr = req.user.branch;
      if (!userBranchStr) {
        const uRes = await pool.query('SELECT branch FROM users WHERE id = $1', [req.user.id]);
        if (uRes.rows.length > 0) userBranchStr = uRes.rows[0].branch;
      }
      
      let opQuery = `SELECT r.id, e.name AS employee_name, r.created_at, r.request_type, r.reason,
                            COALESCE(e.branch, 'Branch 1') AS branch
         FROM attendance_edit_requests r
         JOIN employees e ON r.employee_id = e.id
         WHERE r.status = 'Pending' AND (r.target_role IN ('Operator', 'Both') OR r.request_type = 'Early Check-In')`;
      let opParams = [];
      const opPatterns = getBranchMatchPatterns(userBranchStr);
      if (opPatterns.length > 0) {
        opQuery += ` AND LOWER(COALESCE(e.branch, 'Branch 1')) = ANY($1)`;
        opParams.push(opPatterns);
      } else if (userBranchStr) {
        opQuery += ` AND COALESCE(e.branch, '') = ANY($1)`;
        opParams.push(userBranchStr.split(',').map(s => s.trim()));
      }
      opQuery += ` ORDER BY r.created_at DESC`;
      const requestsRes = await pool.query(opQuery, opParams);
      requestNotifs = requestsRes.rows.map(row => {
        let msg = '';
        if (row.request_type === 'Early Check-In') {
          const cleanReason = (row.reason || '').replace(/^Early Check-In\s*/i, '').trim();
          msg = `${row.employee_name} checked in early ${cleanReason}`;
        } else if (row.request_type === 'Overtime') {
          msg = `Overtime request pending approval for ${row.employee_name}: ${row.reason}`;
        } else {
          msg = `Attendance correction request from ${row.employee_name} pending Operator approval.`;
        }
        return {
          id: `attendance-request-${row.id}`,
          type: 'attendance_request',
          request_type: row.request_type,
          created_at: row.created_at,
          employee_name: row.employee_name,
          reason: row.reason,
          message: msg
        };
      });
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

    let systemNotifs = [];
    try {
      let sysQuery = `SELECT * FROM notifications WHERE (target_roles @> $1::jsonb OR target_users @> $2::jsonb)`;
      const sysParams = [JSON.stringify([userRole]), JSON.stringify([req.user.id])];

      if (userRole === 'operator') {
        let userBranchStr = req.user.branch;
        if (!userBranchStr) {
          const uRes = await pool.query('SELECT branch FROM users WHERE id = $1', [req.user.id]);
          if (uRes.rows.length > 0) userBranchStr = uRes.rows[0].branch;
        }
        const opPatterns = getBranchMatchPatterns(userBranchStr);
        if (opPatterns.length > 0) {
          sysQuery += ` AND (branch IS NULL OR branch = '' OR LOWER(branch) = ANY($3))`;
          sysParams.push(opPatterns);
        } else {
          sysQuery += ` AND (branch IS NULL OR branch = '')`;
        }
      }

      sysQuery += ` ORDER BY created_at DESC LIMIT 30`;
      const sysNotifRes = await pool.query(sysQuery, sysParams);
      systemNotifs = sysNotifRes.rows.map(n => ({
        id: `sys-${n.id}`,
        type: n.type,
        created_at: n.created_at,
        branch: n.branch,
        message: n.message
      }));
    } catch(e) {
      console.error('Error fetching systemNotifs:', e.message);
    }

    res.json([...notifications, ...requestNotifs, ...systemNotifs]);
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
  
  const saudi = getSaudiComponents();
  const currentHours = saudi.hours;
  const currentMins = saudi.minutes;
  
  return (currentHours > startHour) || (currentHours === startHour && currentMins >= startMin);
};

// Get today's attendance status for all active employees
router.get('/today', authenticateToken, async (req, res) => {
  try {
    // Fetch all active employees with shift info
    let queryStr = `
      SELECT e.id as employee_id, e.name, e.role, e.working_hours as shift, e.shift_hours, e.status as employee_status, e.employee_id as employee_code, e.department, e.branch, e.shift as new_shift,
             ewh.is_split_shift, ewh.start_time as shift_start_time, ewh.end_time as shift_end_time, ewh.start_time_2, ewh.end_time_2
      FROM employees e
      LEFT JOIN employee_working_hours ewh ON UPPER(ewh.name) = UPPER(e.working_hours)
      WHERE e.status = 'Active'
    `;
    const queryParams = [];
    const userRole = req.user.role?.toLowerCase();
    if (userRole === 'operator') {
      if (req.user.shift) {
        queryStr += ` AND COALESCE(e.shift, 'Day') = ANY($1)`;
        queryParams.push(req.user.shift.split(',').map(s => s.trim()));
      }
      if (req.user.branch) {
        if (queryParams.length === 1) {
          queryStr += ` AND COALESCE(e.branch, '') = ANY($2)`;
        } else {
          queryStr += ` AND COALESCE(e.branch, '') = ANY($1)`;
        }
        queryParams.push(req.user.branch.split(',').map(s => s.trim()));
      }
    }
    queryStr += ` ORDER BY e.id ASC`;
    const activeEmps = await pool.query(queryStr, queryParams);

    // Fetch all today's attendance sessions
    const sessions = await pool.query(`
      SELECT id as attendance_id, employee_id, check_in, check_out, status as attendance_status, on_break, break_start, total_break_duration_seconds, break_logs, remarks, shift_start_time, shift_end_time, is_split_shift, shift_start_time_2, shift_end_time_2, created_by, checked_out_by, branch
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
        
        const rowBreakLogs = Array.isArray(row.break_logs) 
          ? row.break_logs 
          : (typeof row.break_logs === 'string' ? JSON.parse(row.break_logs || '[]') : []);
        
        let breakSecs = row.total_break_duration_seconds || 0;
        if (row.on_break && row.break_start && !row.check_out) {
          breakSecs += Math.floor((Date.now() - new Date(row.break_start).getTime()) / 1000);
        } else if (rowBreakLogs.length > 0 && row.check_out) {
          const clamped = clampBreakLogsToDutyWindow(rowBreakLogs, row.check_in, row.check_out);
          breakSecs = clamped.totalBreakSecs;
          row.break_logs = clamped.breakLogs;
        } else if (row.check_out) {
          const maxPossible = Math.max(0, Math.floor((checkOutTime - checkInTime) / 1000));
          breakSecs = Math.min(breakSecs, maxPossible);
        }
        row.total_break_duration_seconds = breakSecs;

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
        shift_start_time: lastSession ? lastSession.shift_start_time : emp.shift_start_time,
        shift_end_time: lastSession ? lastSession.shift_end_time : emp.shift_end_time,
        is_split_shift: lastSession ? (lastSession.is_split_shift ?? emp.is_split_shift ?? false) : (emp.is_split_shift ?? false),
        shift_start_time_2: lastSession ? (lastSession.shift_start_time_2 || emp.start_time_2) : emp.start_time_2,
        shift_end_time_2: lastSession ? (lastSession.shift_end_time_2 || emp.end_time_2) : emp.end_time_2,
        date: lastSession ? lastSession.date : null,
        attendance_status: lastSession ? lastSession.attendance_status : null,
        on_break: lastSession ? lastSession.on_break : false,
        break_start: lastSession ? lastSession.break_start : null,
        created_by: lastSession ? lastSession.created_by : null,
        checked_out_by: lastSession ? lastSession.checked_out_by : null,
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
    const empRes = await pool.query('SELECT name, working_hours, shift_hours, shift, strict_attendance, custom_deduction_active, custom_deduction_rules, branch FROM employees WHERE id = $1', [employee_id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    const empName = empRes.rows[0].name || 'Employee';
    const shift = empRes.rows[0].working_hours || 'R1';
    let shiftHours = parseFloat(empRes.rows[0].shift_hours || 12.0);
    const empShift = empRes.rows[0].shift || 'Day';
    const strictAttendance = empRes.rows[0].strict_attendance || false;
    const customDeductionActive = empRes.rows[0].custom_deduction_active || false;
    let customDeductionRules = [];
    try {
      customDeductionRules = typeof empRes.rows[0].custom_deduction_rules === 'string' 
        ? JSON.parse(empRes.rows[0].custom_deduction_rules) 
        : (empRes.rows[0].custom_deduction_rules || []);
    } catch(e) {
      customDeductionRules = [];
    }

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

    const shiftDetails = await pool.query('SELECT * FROM employee_working_hours WHERE UPPER(name) = UPPER($1)', [shift]);
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

      // For split shift: determine which segment the current time belongs to in Saudi Time
      const saudiSplit = getSaudiComponents();
      const currentTotalMins = saudiSplit.hours * 60 + saudiSplit.minutes;

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

    let checkInTime = new Date();
    let isEarlyCurrent = false;
    let earlyDiffMins = 0;

    if (priorChecks.rows.length > 0) {
      // If they already checked in today, keep the status of the first session of the day
      status = priorChecks.rows[0].status;
    } else {
      // First check-in: Compare current time with shift threshold in Saudi Arabia timezone (UTC+3)
      const now = new Date();
      const saudi = getSaudiComponents(now);
      const currentHours = saudi.hours;
      const currentMins = saudi.minutes;

      const currentTotalMins = currentHours * 60 + currentMins;
      const startTotalMins = startHour * 60 + startMin;
      let timeDiff = currentTotalMins - startTotalMins;
      if (timeDiff < -16 * 60) timeDiff += 24 * 60; // handle wrap around midnight

      // Early check-in: duty hours haven't started yet
      if (timeDiff < 0) {
        const startHourStr = String(startHour).padStart(2, '0');
        const startMinStr = String(startMin).padStart(2, '0');
        const shiftStartTimeSaudi = new Date(`${saudi.dateStr}T${startHourStr}:${startMinStr}:00+03:00`);
        const shiftStartDisplay = formatSaudiTimeDisplay(shiftStartTimeSaudi, true);
        const currentTimeDisplay = formatSaudiTimeDisplay(now, true);
        earlyDiffMins = Math.abs(timeDiff);

        if (req.body.early_checkin_decision === undefined) {
          return res.status(409).json({
            requires_early_decision: true,
            shift_start_time: shiftStartTime || `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
            shift_start_display: shiftStartDisplay,
            current_time: now.toISOString(),
            current_time_display: currentTimeDisplay,
            minutes_early: earlyDiffMins,
            message: 'Employee is checking in before their shift starts.'
          });
        }

        if (req.body.early_checkin_decision === 'current') {
          const earlyReason = (req.body.early_checkin_reason || '').trim();
          if (!earlyReason) {
            return res.status(400).json({ error: 'Reason is required when checking in at current time before shift start.' });
          }
          // The cashier selected Current Time: immediately log at the actual current check-in time
          checkInTime = now;
          status = 'Present';
          isEarlyCurrent = true;
        } else if (req.body.early_checkin_decision === 'shift') {
          // The cashier selected Scheduled Duty Time: log at shift start time
          const startHourStr = String(startHour).padStart(2, '0');
          const startMinStr = String(startMin).padStart(2, '0');
          checkInTime = new Date(`${saudi.dateStr}T${startHourStr}:${startMinStr}:00+03:00`);
          status = 'Present';
          isEarlyCurrent = false;
        } else {
          return res.status(400).json({ error: 'Invalid early check-in decision.' });
        }
      } else {
        // Checked in at or after shift start - normal check-in
        let thresholdMins = startMin + 15;
        let thresholdHour = startHour;
        if (thresholdMins >= 60) {
          thresholdHour += 1;
          thresholdMins -= 60;
        }
        
        if (currentHours > thresholdHour || (currentHours === thresholdHour && currentMins > thresholdMins)) {
          status = 'Late';
        }

        let latenessMins = timeDiff;

        // Apply penalty to checkInTime
        if (customDeductionActive && Array.isArray(customDeductionRules) && customDeductionRules.length > 0 && latenessMins > 0) {
          // Sort rules by late_minutes descending to find the highest applicable tier
          const sortedRules = [...customDeductionRules].sort((a, b) => b.late_minutes - a.late_minutes);
          const applicableRule = sortedRules.find(r => latenessMins >= r.late_minutes);
          
          if (applicableRule) {
            const penalty = parseInt(applicableRule.value) || 0;
            if (penalty > 0) {
              checkInTime = new Date(now.getTime() + (penalty * 60000));
            }
          }
        } else if (strictAttendance && latenessMins >= 30) {
          // Default strict attendance logic
          checkInTime = new Date(now.getTime() + (latenessMins * 60000));
        }
      }
    }

    // Verify operator shift matches employee shift
    const userShifts = req.user.shift ? req.user.shift.split(',').map(s => s.trim()) : [];
    if (userRole === 'operator' && userShifts.length > 0 && !userShifts.includes(empShift)) {
      return res.status(403).json({ error: `You are only allowed to mark attendance for employees in Shift(s): ${req.user.shift}` });
    }

    const sessionBranch = req.body.branch || req.user.branch || empRes.rows[0].branch || 'Branch 1';
    const remarks = isEarlyCurrent ? 'Early Check-In (Pending Admin Review)' : null;
    const result = await pool.query(
      'INSERT INTO employee_attendance (employee_id, check_in, status, date, created_by, shift_name, shift_hours, shift_start_time, shift_end_time, is_split_shift, shift_start_time_2, shift_end_time_2, remarks, branch) VALUES ($1, $11, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $12, $13) RETURNING *',
      [employee_id, status, req.user.username, shift, shiftHours, shiftStartTime, shiftEndTime, isSplitShift, shiftStartTime2, shiftEndTime2, checkInTime, remarks, sessionBranch]
    );

    if (isEarlyCurrent) {
      const earlyReason = (req.body.early_checkin_reason || '').trim();
      const reqReason = `Early Check-In (${earlyDiffMins} min early, Shift: ${shiftStartTime || `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`}): ${earlyReason}`;

      const insertedReq = await pool.query(
        `INSERT INTO attendance_edit_requests 
         (attendance_id, employee_id, requested_by_user_id, target_role, request_type, reason, status, requested_check_in) 
         VALUES ($1, $2, $3, 'Admin', 'Early Check-In', $4, 'Pending', $5) RETURNING *`,
        [result.rows[0].id, employee_id, req.user.id || null, reqReason, checkInTime]
      );

      if (req.io) {
        req.io.emit('attendance_alert', {
          id: `attendance-request-${insertedReq.rows[0].id}`,
          type: 'attendance_request',
          request_type: 'Early Check-In',
          employee_id,
          employee_name: empName,
          reason: reqReason
        });
        req.io.emit('attendance_request', {
          type: 'Early Check-In'
        });
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper to determine scheduled shift end and expected checkout time,
 * handling split shifts (double shift: Shift 1 and Shift 2) with overnight roll-over support.
 */
function calculateShiftScheduleDetails({
  cleanDate,
  checkInTime,
  actualCheckoutTime,
  shiftHoursVal,
  prevSessionsMs,
  totalBreakSecs,
  shift1Start,
  shift1End,
  isSplitShift,
  shift2Start,
  shift2End,
  hasPreviousSessionsToday
}) {
  const parseTime = (tStr) => {
    if (!tStr) return 0;
    if (tStr === '24:00') return 24 * 60;
    const m = tStr.match(/^(\d+):(\d+)/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };

  const [s1H, s1M] = (shift1Start || '00:00').split(':').map(Number);
  let [e1H, e1M] = (shift1End || '00:00').split(':').map(Number);

  // Shift 1 start
  const d1Start = new Date(`${cleanDate}T12:00:00+03:00`);
  const shift1StartMs = new Date(
    `${d1Start.getFullYear()}-${String(d1Start.getMonth() + 1).padStart(2, '0')}-${String(d1Start.getDate()).padStart(2, '0')}T${String(s1H).padStart(2, '0')}:${String(s1M || 0).padStart(2, '0')}:00+03:00`
  ).getTime();

  // Shift 1 end
  let end1DayOffset = 0;
  if (e1H === 24) {
    e1H = 0;
    end1DayOffset = 1;
  } else if (e1H < s1H || (e1H === s1H && (e1M || 0) < (s1M || 0))) {
    end1DayOffset = 1;
  }
  const d1End = new Date(`${cleanDate}T12:00:00+03:00`);
  if (end1DayOffset > 0) d1End.setDate(d1End.getDate() + end1DayOffset);
  const shift1EndMs = new Date(
    `${d1End.getFullYear()}-${String(d1End.getMonth() + 1).padStart(2, '0')}-${String(d1End.getDate()).padStart(2, '0')}T${String(e1H).padStart(2, '0')}:${String(e1M || 0).padStart(2, '0')}:00+03:00`
  ).getTime();

  let shift2StartMs = null;
  let shift2EndMs = null;

  if (isSplitShift && shift2End) {
    let [s2H, s2M] = (shift2Start || '00:00').split(':').map(Number);
    let s1TotalMins = s1H * 60 + (s1M || 0);
    let s2TotalMins = s2H * 60 + (s2M || 0);
    let start2DayOffset = 0;
    if (end1DayOffset > 0 && s2TotalMins <= parseTime(shift1End)) {
      start2DayOffset = end1DayOffset;
    } else if (s2TotalMins < s1TotalMins && end1DayOffset === 0) {
      start2DayOffset = 1;
    }

    const d2Start = new Date(`${cleanDate}T12:00:00+03:00`);
    if (start2DayOffset > 0) d2Start.setDate(d2Start.getDate() + start2DayOffset);
    shift2StartMs = new Date(
      `${d2Start.getFullYear()}-${String(d2Start.getMonth() + 1).padStart(2, '0')}-${String(d2Start.getDate()).padStart(2, '0')}T${String(s2H).padStart(2, '0')}:${String(s2M || 0).padStart(2, '0')}:00+03:00`
    ).getTime();

    let [e2H, e2M] = (shift2End || '00:00').split(':').map(Number);
    let end2DayOffset = start2DayOffset;
    if (e2H === 24) {
      e2H = 0;
      end2DayOffset += 1;
    } else if (e2H < s2H || (e2H === s2H && (e2M || 0) < (s2M || 0))) {
      end2DayOffset += 1;
    }

    const d2End = new Date(`${cleanDate}T12:00:00+03:00`);
    if (end2DayOffset > 0) d2End.setDate(d2End.getDate() + end2DayOffset);
    shift2EndMs = new Date(
      `${d2End.getFullYear()}-${String(d2End.getMonth() + 1).padStart(2, '0')}-${String(d2End.getDate()).padStart(2, '0')}T${String(e2H).padStart(2, '0')}:${String(e2M || 0).padStart(2, '0')}:00+03:00`
    ).getTime();
  }

  // Determine if this checkout corresponds to Shift 2 or Shift 1
  let isShift2 = false;
  if (isSplitShift && shift2EndMs) {
    const midpoint = shift2StartMs ? Math.floor((shift1EndMs + shift2StartMs) / 2) : shift1EndMs;
    if (hasPreviousSessionsToday) {
      isShift2 = true;
    } else if (checkInTime >= midpoint) {
      isShift2 = true;
    } else if (actualCheckoutTime >= (shift2StartMs || midpoint)) {
      isShift2 = true;
    }
  }

  const scheduledShiftEndMs = (isShift2 && shift2EndMs) ? shift2EndMs : (shift1EndMs || null);

  const shiftHours = parseFloat(shiftHoursVal || 12.0);
  const expectedMs = shiftHours * 60 * 60 * 1000;
  const remainingMs = Math.max(0, expectedMs - prevSessionsMs);

  let expectedCheckoutTime = checkInTime + remainingMs + (totalBreakSecs * 1000);
  if (scheduledShiftEndMs) {
    expectedCheckoutTime = Math.min(scheduledShiftEndMs, expectedCheckoutTime);
  }

  return {
    isShift2,
    scheduledShiftEndMs,
    expectedCheckoutTime,
    shift1StartMs,
    shift1EndMs,
    shift2StartMs,
    shift2EndMs
  };
}

// Check-out endpoint
router.post('/check-out', authenticateToken, async (req, res) => {
  const { employee_id, overtime_reason, ignore_overtime, requested_overtime_minutes } = req.body;
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
    let breakLogs = Array.isArray(session.break_logs) ? [...session.break_logs] : (typeof session.break_logs === 'string' ? JSON.parse(session.break_logs) : []);
    
    // If currently on break, end the break now
    if (session.on_break && session.break_start) {
      const breakDuration = Math.floor((Date.now() - new Date(session.break_start).getTime()) / 1000);
      totalBreakSecs += breakDuration;
      breakLogs.push({
        break_in: session.break_start,
        break_out: new Date().toISOString(),
        duration_seconds: breakDuration
      });
    }

    // Fetch previous completed sessions for today to accumulate worked hours
    const prevSessionsRes = await pool.query(
      `SELECT check_in, check_out, total_break_duration_seconds 
       FROM employee_attendance 
       WHERE employee_id = $1 AND date = $2 AND id != $3 AND check_out IS NOT NULL`,
      [employee_id, session.date, session.id]
    );

    let prevSessionsMs = 0;
    prevSessionsRes.rows.forEach(r => {
      const pIn = new Date(r.check_in).getTime();
      const pOut = new Date(r.check_out).getTime();
      const pBreak = (r.total_break_duration_seconds || 0) * 1000;
      prevSessionsMs += Math.max(0, pOut - pIn - pBreak);
    });

    let actualCheckoutTime = Date.now();
    const checkInTime = new Date(session.check_in).getTime();

    // Prevent negative duty hours if checkout happens before the clamped check-in time
    if (actualCheckoutTime < checkInTime) {
      actualCheckoutTime = checkInTime;
    }

    // Resolve split shift details (with fallback to employee_working_hours)
    let isSplitShift = session.is_split_shift;
    let sStart1 = session.shift_start_time;
    let sEnd1 = session.shift_end_time;
    let sStart2 = session.shift_start_time_2;
    let sEnd2 = session.shift_end_time_2;

    if (!isSplitShift || !sEnd2) {
      const whRes = await pool.query(
        'SELECT is_split_shift, start_time, end_time, start_time_2, end_time_2, hours FROM employee_working_hours WHERE UPPER(name) = UPPER($1)',
        [session.shift_name]
      );
      if (whRes.rows.length > 0 && whRes.rows[0].is_split_shift) {
        isSplitShift = true;
        sStart1 = sStart1 || whRes.rows[0].start_time;
        sEnd1 = sEnd1 || whRes.rows[0].end_time;
        sStart2 = whRes.rows[0].start_time_2;
        sEnd2 = whRes.rows[0].end_time_2;
      }
    }

    const cleanDate = typeof session.date === 'string'
      ? session.date.split('T')[0]
      : (session.date instanceof Date ? session.date.toLocaleDateString('en-CA') : String(session.date).split('T')[0]);

    const { isShift2, scheduledShiftEndMs, expectedCheckoutTime } = calculateShiftScheduleDetails({
      cleanDate,
      checkInTime,
      actualCheckoutTime,
      shiftHoursVal: session.shift_hours,
      prevSessionsMs,
      totalBreakSecs,
      shift1Start: sStart1,
      shift1End: sEnd1,
      isSplitShift,
      shift2Start: sStart2,
      shift2End: sEnd2,
      hasPreviousSessionsToday: prevSessionsRes.rows.length > 0
    });

    let finalCheckoutTime = new Date(actualCheckoutTime);
    const overtimeMs = actualCheckoutTime - expectedCheckoutTime;
    const overtimeMins = Math.round(overtimeMs / (1000 * 60));

    if (overtimeMins > 0) {
      // Override final checkout time so attendance sheet initially doesn't show unapproved overtime
      finalCheckoutTime = new Date(expectedCheckoutTime);
      
      if (!ignore_overtime) {
        // Overtime > 0 mins, require reason to generate a pending request
        if (!overtime_reason) {
          return res.status(400).json({ 
            error: 'Overtime requires a reason.', 
            overtime_minutes: overtimeMins 
          });
        }
      }
    }

    // Auto-clamp break logs to finalCheckoutTime:
    // Any break starting at or after finalCheckoutTime is removed.
    // Any break ending after finalCheckoutTime is trimmed/clamped to finalCheckoutTime.
    const clampedBreakData = clampBreakLogsToDutyWindow(breakLogs, session.check_in, finalCheckoutTime);
    totalBreakSecs = clampedBreakData.totalBreakSecs;
    breakLogs = clampedBreakData.breakLogs;

    const result = await pool.query(
      'UPDATE employee_attendance SET check_out = $1, on_break = false, break_start = null, total_break_duration_seconds = $2, checked_out_by = $4, break_logs = $5 WHERE id = $3 RETURNING *',
      [finalCheckoutTime, totalBreakSecs, session.id, req.user.username, JSON.stringify(breakLogs)]
    );

    // If overtime occurred (or explicit overtime was requested) and reason was provided, log it as an Overtime Request for Admin
    if ((overtimeMins > 0 || (requested_overtime_minutes !== undefined && requested_overtime_minutes !== null)) && overtime_reason && !ignore_overtime) {
      let requestedCheckoutDate;
      let finalOvertimeMins = overtimeMins;
      if (requested_overtime_minutes !== undefined && requested_overtime_minutes !== null) {
        finalOvertimeMins = parseInt(requested_overtime_minutes, 10);
        requestedCheckoutDate = new Date(expectedCheckoutTime + finalOvertimeMins * 60000);
      } else {
        requestedCheckoutDate = new Date(actualCheckoutTime);
      }

      await pool.query(
        `INSERT INTO attendance_edit_requests 
         (attendance_id, employee_id, requested_by_user_id, target_role, request_type, reason, status, requested_check_out) 
         VALUES ($1, $2, $3, 'Admin', 'Overtime', $4, 'Pending', $5)`,
        [session.id, employee_id, req.user.id || null, `Overtime (${finalOvertimeMins} min): ${overtime_reason}`, requestedCheckoutDate]
      );
    }

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
           break_logs = COALESCE(break_logs, '[]'::jsonb) || jsonb_build_array(
             jsonb_build_object(
               'break_in', break_start,
               'break_out', NOW(),
               'duration_seconds', EXTRACT(EPOCH FROM (NOW() - break_start))::integer
             )
           ),
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
      const currentLogs = Array.isArray(session.break_logs) ? [...session.break_logs] : (typeof session.break_logs === 'string' ? JSON.parse(session.break_logs) : []);
      currentLogs.push({
        break_in: session.break_start,
        break_out: new Date().toISOString(),
        duration_seconds: breakDuration
      });

      result = await pool.query(
        'UPDATE employee_attendance SET on_break = false, break_start = null, total_break_duration_seconds = $1, break_logs = $3 WHERE id = $2 RETURNING *',
        [newTotalBreak, session.id, JSON.stringify(currentLogs)]
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
      SELECT ea.id, ea.employee_id, ea.check_in, ea.check_out, ea.status, ea.on_break, ea.break_start, ea.total_break_duration_seconds, ea.break_logs, ea.remarks, TO_CHAR(ea.date, 'YYYY-MM-DD') as date, ea.created_at, ea.shift_name, ea.shift_hours, ea.shift_start_time, ea.shift_end_time, ea.is_split_shift, ea.shift_start_time_2, ea.shift_end_time_2, ea.created_by, ea.checked_out_by, COALESCE(ea.branch, e.branch, 'Branch 1') as branch, e.name, e.role, e.shift as current_shift, e.shift_hours as current_shift_hours, e.employee_id as employee_code, e.department, e.branch as emp_master_branch,
             ewh.is_split_shift as master_is_split_shift, ewh.start_time as master_start_time, ewh.end_time as master_end_time, ewh.start_time_2 as master_start_time_2, ewh.end_time_2 as master_end_time_2
      FROM employee_attendance ea
      JOIN employees e ON ea.employee_id = e.id
      LEFT JOIN employee_working_hours ewh ON UPPER(ewh.name) = UPPER(COALESCE(ea.shift_name, e.working_hours))
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
      
      const rowBreakLogs = Array.isArray(row.break_logs) 
        ? row.break_logs 
        : (typeof row.break_logs === 'string' ? JSON.parse(row.break_logs || '[]') : []);
      
      let effectiveBreakSecs = parseInt(row.total_break_duration_seconds) || 0;
      let effectiveBreakLogs = rowBreakLogs;
      if (rowBreakLogs.length > 0 && checkOutTime) {
        const clamped = clampBreakLogsToDutyWindow(rowBreakLogs, row.check_in, row.check_out);
        effectiveBreakSecs = clamped.totalBreakSecs;
        effectiveBreakLogs = clamped.breakLogs;
      } else if (checkOutTime) {
        // Legacy fallback: break cannot exceed total elapsed session time
        const maxPossibleBreak = Math.max(0, Math.floor((checkOutTime - checkInTime) / 1000));
        effectiveBreakSecs = Math.min(effectiveBreakSecs, maxPossibleBreak);
      }

      if (checkOutTime) {
        const netMs = checkOutTime - checkInTime - (effectiveBreakSecs * 1000);
        durationHours = Math.max(0, netMs / (1000 * 60 * 60));
        otHours = Math.max(0, durationHours - shiftHours);
      } else {
        // Active session for today
        const netMs = Date.now() - checkInTime - (effectiveBreakSecs * 1000);
        durationHours = Math.max(0, netMs / (1000 * 60 * 60));
        otHours = Math.max(0, durationHours - shiftHours);
      }
      
      return {
        ...row,
        total_break_duration_seconds: effectiveBreakSecs,
        break_logs: effectiveBreakLogs,
        is_split_shift: row.is_split_shift ?? row.master_is_split_shift ?? false,
        shift_start_time: row.shift_start_time || row.master_start_time,
        shift_end_time: row.shift_end_time || row.master_end_time,
        shift_start_time_2: row.shift_start_time_2 || row.master_start_time_2,
        shift_end_time_2: row.shift_end_time_2 || row.master_end_time_2,
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
      SELECT TO_CHAR(ea.date, 'YYYY-MM-DD') as date_str, COUNT(DISTINCT ea.employee_id) as present_count 
      FROM employee_attendance ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE ea.date >= CURRENT_DATE - INTERVAL '6 days' AND ea.status != 'Holiday'
    `;
    const weeklyParams = [];
    if (userRole === 'operator') {
      if (req.user.shift) {
        weeklyQueryStr += " AND COALESCE(e.shift, 'R1') = ANY($1)";
        weeklyParams.push(req.user.shift.split(',').map(s => s.trim()));
      }
      if (req.user.branch) {
        if (weeklyParams.length === 1) {
          weeklyQueryStr += " AND COALESCE(e.branch, '') = ANY($2)";
        } else {
          weeklyQueryStr += " AND COALESCE(e.branch, '') = ANY($1)";
        }
        weeklyParams.push(req.user.branch.split(',').map(s => s.trim()));
      }
    }
    weeklyQueryStr += " GROUP BY ea.date ORDER BY ea.date ASC";
    const weeklyQuery = await pool.query(weeklyQueryStr, weeklyParams);
    
    let empsQueryStr = "SELECT COUNT(*) FROM employees WHERE status = 'Active'";
    const empsParams = [];
    if (userRole === 'operator') {
      if (req.user.shift) {
        empsQueryStr += " AND COALESCE(shift, 'R1') = ANY($1)";
        empsParams.push(req.user.shift.split(',').map(s => s.trim()));
      }
      if (req.user.branch) {
        if (empsParams.length === 1) {
          empsQueryStr += " AND COALESCE(branch, '') = ANY($2)";
        } else {
          empsQueryStr += " AND COALESCE(branch, '') = ANY($1)";
        }
        empsParams.push(req.user.branch.split(',').map(s => s.trim()));
      }
    }
    const totalEmployeesRes = await pool.query(empsQueryStr, empsParams);
    const totalEmployees = parseInt(totalEmployeesRes.rows[0].count) || 1;

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const last7Days = [];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const dayName = daysOfWeek[d.getDay()];
      
      const dayData = weeklyQuery.rows.find(row => row.date_str === dateStr);
      
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
    const userRole = req.user.role?.trim().toLowerCase();
    
    // Total employees count
    let empsQueryStr = "SELECT id, shift, branch FROM employees WHERE status = 'Active'";
    const empsParams = [];
    if (userRole === 'operator') {
      if (req.user.shift) {
        empsQueryStr += " AND COALESCE(shift, 'R1') = ANY($1)";
        empsParams.push(req.user.shift.split(',').map(s => s.trim()));
      }
      if (req.user.branch) {
        if (empsParams.length === 1) {
          empsQueryStr += " AND COALESCE(branch, '') = ANY($2)";
        } else {
          empsQueryStr += " AND COALESCE(branch, '') = ANY($1)";
        }
        empsParams.push(req.user.branch.split(',').map(s => s.trim()));
      }
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
    if (userRole === 'operator') {
      if (req.user.shift) {
        logsQueryStr += " AND COALESCE(e.shift, 'R1') = ANY($1)";
        logsParams.push(req.user.shift.split(',').map(s => s.trim()));
      }
      if (req.user.branch) {
        if (logsParams.length === 1) {
          logsQueryStr += " AND COALESCE(e.branch, '') = ANY($2)";
        } else {
          logsQueryStr += " AND COALESCE(e.branch, '') = ANY($1)";
        }
        logsParams.push(req.user.branch.split(',').map(s => s.trim()));
      }
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
      `SELECT 
        ea.id, ea.employee_id, ea.check_in, ea.check_out, ea.status, ea.on_break, 
        ea.break_start, ea.total_break_duration_seconds, ea.break_logs,
        ea.created_by, ea.checked_out_by, ea.created_at, ea.remarks,
        COALESCE(ea.branch, (SELECT branch FROM employees WHERE id = ea.employee_id), 'Branch 1') as branch,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ed.id,
                'edited_by', ed.edited_by,
                'edited_at', ed.edited_at,
                'reason', ed.reason,
                'original_check_in', ed.original_check_in,
                'original_check_out', ed.original_check_out,
                'new_check_in', ed.new_check_in,
                'new_check_out', ed.new_check_out
              ) ORDER BY ed.edited_at DESC
            )
            FROM edited_attendance ed
            WHERE ed.attendance_id = ea.id
          ),
          '[]'::json
        ) AS edit_history
      FROM employee_attendance ea 
      WHERE ea.employee_id = $1 AND TO_CHAR(ea.date, 'YYYY-MM-DD') = $2 
      ORDER BY ea.check_in ASC`,
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
  const { check_in, check_out, break_logs, branch } = req.body;
  if (!check_in) {
    return res.status(400).json({ error: 'Check-in time is required' });
  }

  try {
    const sessionRes = await pool.query('SELECT employee_id, date FROM employee_attendance WHERE id = $1', [id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Attendance log not found.' });
    
    const recordDate = sessionRes.rows[0].date;
    const employee_id = sessionRes.rows[0].employee_id;
    const userRole = req.user.role?.toLowerCase();
    
    if (userRole === 'operator') {
      const limitCheck = await verifyOperator24HourLimit(employee_id, recordDate, pool);
      if (!limitCheck.allowed) {
        return res.status(403).json({ error: limitCheck.error });
      }
    } else if (userRole !== 'admin' && userRole !== 'developer') {
      return res.status(403).json({ error: 'Access denied: Only Admins can modify attendance.' });
    }

    let totalBreakSecs = null;
    let parsedBreakLogs = null;
    if (break_logs !== undefined && break_logs !== null) {
      parsedBreakLogs = Array.isArray(break_logs) ? break_logs : (typeof break_logs === 'string' ? JSON.parse(break_logs) : []);
    } else if (check_out) {
      // If caller didn't pass break_logs, load existing break_logs to clamp against new check_out
      const curr = await pool.query('SELECT break_logs, total_break_duration_seconds FROM employee_attendance WHERE id = $1', [id]);
      if (curr.rows.length > 0 && curr.rows[0].break_logs) {
        parsedBreakLogs = Array.isArray(curr.rows[0].break_logs) ? curr.rows[0].break_logs : (typeof curr.rows[0].break_logs === 'string' ? JSON.parse(curr.rows[0].break_logs) : []);
      }
    }

    if (parsedBreakLogs !== null) {
      const clamped = clampBreakLogsToDutyWindow(parsedBreakLogs, check_in, check_out || null);
      parsedBreakLogs = clamped.breakLogs;
      totalBreakSecs = clamped.totalBreakSecs;
    }

    let resDB;
    if (parsedBreakLogs !== null) {
      const hasActiveBreak = parsedBreakLogs.length > 0 && !parsedBreakLogs[parsedBreakLogs.length - 1].break_out;
      const activeBreakStart = hasActiveBreak ? parsedBreakLogs[parsedBreakLogs.length - 1].break_in : null;
      resDB = await pool.query(
        `UPDATE employee_attendance 
         SET check_in = $1, check_out = $2, checked_out_by = $4, break_logs = $5, total_break_duration_seconds = $6, on_break = $7, break_start = $8,
             branch = CASE WHEN $9::varchar IS NOT NULL THEN $9::varchar ELSE branch END
         WHERE id = $3 RETURNING *`,
        [check_in, check_out || null, id, req.user.username, JSON.stringify(parsedBreakLogs), totalBreakSecs, hasActiveBreak, activeBreakStart, branch || null]
      );
    } else {
      resDB = await pool.query(
        `UPDATE employee_attendance 
         SET check_in = $1, check_out = $2, checked_out_by = $4,
             branch = CASE WHEN $5::varchar IS NOT NULL THEN $5::varchar ELSE branch END
         WHERE id = $3 RETURNING *`,
        [check_in, check_out || null, id, req.user.username, branch || null]
      );
    }

    res.json(resDB.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new manual attendance session
router.post('/session', authenticateToken, async (req, res) => {
  const { employee_id, date, check_in, check_out, status, break_logs, branch } = req.body;
  if (!employee_id || !date || !check_in) {
    return res.status(400).json({ error: 'Employee ID, date, and check-in time are required' });
  }
  
  if (check_in && new Date(check_in).getTime() > Date.now() + 5 * 60000) {
    return res.status(400).json({ error: 'Check-in time cannot be in the future.' });
  }
  if (check_out && new Date(check_out).getTime() > Date.now() + 5 * 60000) {
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
    const limitCheck = await verifyOperator24HourLimit(employee_id, date, pool);
    if (!limitCheck.allowed) {
      return res.status(403).json({ error: "Access denied: Operators can only add attendance within 24 hours of shift start time." });
    }
  } else if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Access denied: Only Admins can modify attendance.' });
  }

  let totalBreakSecs = 0;
  let parsedBreakLogs = [];
  if (break_logs !== undefined && break_logs !== null) {
    parsedBreakLogs = Array.isArray(break_logs) ? break_logs : (typeof break_logs === 'string' ? JSON.parse(break_logs) : []);
    const sessionInMs = new Date(check_in).getTime();
    const sessionOutMs = check_out ? new Date(check_out).getTime() : null;

    for (let i = 0; i < parsedBreakLogs.length; i++) {
      const b = parsedBreakLogs[i];
      if (b.break_in) {
        const bInMs = new Date(b.break_in).getTime();
        if (bInMs < sessionInMs) {
          return res.status(400).json({ error: `Break #${i + 1} cannot start before session Check-In time.` });
        }
        if (sessionOutMs && bInMs >= sessionOutMs) {
          return res.status(400).json({ error: `Break #${i + 1} cannot start after session Check-Out time.` });
        }
        if (b.break_out) {
          const bOutMs = new Date(b.break_out).getTime();
          if (bOutMs <= bInMs) {
            return res.status(400).json({ error: `Break #${i + 1} Out time must be after In time.` });
          }
          if (sessionOutMs && bOutMs > sessionOutMs) {
            return res.status(400).json({ error: `Break #${i + 1} Out time cannot exceed session Check-Out time.` });
          }
          const dur = Math.max(0, Math.floor((bOutMs - bInMs) / 1000));
          b.duration_seconds = dur;
          totalBreakSecs += dur;
        } else if (b.duration_seconds) {
          totalBreakSecs += Number(b.duration_seconds);
        }
      }
    }
  }
  const hasActiveBreak = parsedBreakLogs.length > 0 && !parsedBreakLogs[parsedBreakLogs.length - 1].break_out;
  const activeBreakStart = hasActiveBreak ? parsedBreakLogs[parsedBreakLogs.length - 1].break_in : null;
  const checkedOutBy = check_out ? req.user.username : null;

  try {
    let sessionBranch = branch;
    if (!sessionBranch) {
      const empResB = await pool.query('SELECT branch FROM employees WHERE id = $1', [employee_id]);
      sessionBranch = empResB.rows[0]?.branch || 'Branch 1';
    }
    const result = await pool.query(
      'INSERT INTO employee_attendance (employee_id, date, check_in, check_out, status, created_by, checked_out_by, remarks, break_logs, total_break_duration_seconds, on_break, break_start, branch) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *',
      [employee_id, date, check_in, check_out || null, status || 'Present', req.user.username, checkedOutBy, 'Manual', JSON.stringify(parsedBreakLogs), totalBreakSecs, hasActiveBreak, activeBreakStart, sessionBranch]
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
    const sessionRes = await pool.query('SELECT employee_id, date FROM employee_attendance WHERE id = $1', [id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Attendance log not found.' });
    
    const recordDate = sessionRes.rows[0].date;
    const employee_id = sessionRes.rows[0].employee_id;
    const userRole = req.user.role?.toLowerCase();
    
    if (userRole === 'operator') {
      const limitCheck = await verifyOperator24HourLimit(employee_id, recordDate, pool);
      if (!limitCheck.allowed) {
        return res.status(403).json({ error: "Access denied: Operators can only delete attendance within 24 hours of shift start time." });
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
  const { attendance_id, new_check_in, new_check_out, reason, break_logs, branch } = req.body;
  const edited_by = req.user.username;

  if (!attendance_id || !reason) {
    return res.status(400).json({ error: 'Attendance ID and reason are required' });
  }

  if (new_check_in && new Date(new_check_in).getTime() > Date.now() + 5 * 60000) {
    return res.status(400).json({ error: 'Check-in time cannot be in the future.' });
  }
  if (new_check_out && new Date(new_check_out).getTime() > Date.now() + 5 * 60000) {
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
      const limitCheck = await verifyOperator24HourLimit(employee_id, recordDate, pool);
      if (!limitCheck.allowed) {
        return res.status(403).json({ error: "Access denied: Operators can only modify attendance within 24 hours of shift start time." });
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

    let totalBreakSecs = null;
    let parsedBreakLogs = null;
    if (break_logs !== undefined && break_logs !== null) {
      parsedBreakLogs = Array.isArray(break_logs) ? break_logs : (typeof break_logs === 'string' ? JSON.parse(break_logs) : []);
      const finalInMs = new Date(new_check_in || original_check_in).getTime();
      const finalOutMs = (new_check_out || original_check_out) ? new Date(new_check_out || original_check_out).getTime() : null;

      totalBreakSecs = 0;
      for (let i = 0; i < parsedBreakLogs.length; i++) {
        const b = parsedBreakLogs[i];
        if (b.break_in) {
          const bInMs = new Date(b.break_in).getTime();
          if (bInMs < finalInMs) {
            return res.status(400).json({ error: `Break #${i + 1} cannot start before session Check-In time.` });
          }
          if (finalOutMs && bInMs >= finalOutMs) {
            return res.status(400).json({ error: `Break #${i + 1} cannot start after session Check-Out time.` });
          }
          if (b.break_out) {
            const bOutMs = new Date(b.break_out).getTime();
            if (bOutMs <= bInMs) {
              return res.status(400).json({ error: `Break #${i + 1} Out time must be after In time.` });
            }
            if (finalOutMs && bOutMs > finalOutMs) {
              return res.status(400).json({ error: `Break #${i + 1} Out time cannot exceed session Check-Out time.` });
            }
            const dur = Math.max(0, Math.floor((bOutMs - bInMs) / 1000));
            b.duration_seconds = dur;
            totalBreakSecs += dur;
          } else if (b.duration_seconds) {
            totalBreakSecs += Number(b.duration_seconds);
          }
        }
      }
    }

    // Update employee_attendance
    const setCheckedOutBy = new_check_out ? (original_check_out ? null : edited_by) : null;
    if (parsedBreakLogs !== null) {
      const hasActiveBreak = parsedBreakLogs.length > 0 && !parsedBreakLogs[parsedBreakLogs.length - 1].break_out;
      const activeBreakStart = hasActiveBreak ? parsedBreakLogs[parsedBreakLogs.length - 1].break_in : null;
      await pool.query(
        `UPDATE employee_attendance 
         SET check_in = $1, check_out = $2, remarks = 'Edited',
             checked_out_by = CASE WHEN $8::varchar IS NOT NULL THEN $8::varchar ELSE checked_out_by END,
             break_logs = $4, total_break_duration_seconds = $5,
             on_break = $6, break_start = $7,
             branch = CASE WHEN $9::varchar IS NOT NULL THEN $9::varchar ELSE branch END
         WHERE id = $3`,
        [new_check_in || null, new_check_out || null, attendance_id, JSON.stringify(parsedBreakLogs), totalBreakSecs, hasActiveBreak, activeBreakStart, setCheckedOutBy, branch || null]
      );
    } else {
      await pool.query(
        `UPDATE employee_attendance 
         SET check_in = $1, check_out = $2, remarks = 'Edited',
             checked_out_by = CASE WHEN $4::varchar IS NOT NULL THEN $4::varchar ELSE checked_out_by END,
             branch = CASE WHEN $5::varchar IS NOT NULL THEN $5::varchar ELSE branch END
         WHERE id = $3`,
        [new_check_in || null, new_check_out || null, attendance_id, setCheckedOutBy, branch || null]
      );
    }

    res.json({ message: 'Attendance record updated and logged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all edited attendance audit logs (Admin/Developer only)
router.get('/edited-logs', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user.role?.trim().toLowerCase();
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
      let userBranchStr = req.user.branch;
      if (!userBranchStr) {
        const uRes = await pool.query('SELECT branch FROM users WHERE id = $1', [req.user.id]);
        if (uRes.rows.length > 0) userBranchStr = uRes.rows[0].branch;
      }
      
      if (userBranchStr) {
        conditions.push(`COALESCE(emp.branch, '') = ANY($${paramCount++})`);
        params.push(userBranchStr.split(',').map(s => s.trim()));
      } else {
        conditions.push(`1=0`);
      }
    }
    if (month) {
      conditions.push(`TO_CHAR(ea.edited_at, 'YYYY-MM') = $${paramCount++}`);
      params.push(month);
    }

    if (conditions.length > 0) {
      queryStr += ` WHERE ` + conditions.join(' AND ');
    }

    // Sort order: Newest first
    queryStr += ` ORDER BY ea.edited_at DESC`;

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
    const dayMap = {};
    logsRes.rows.forEach(log => {
      const dateStr = log.date.toISOString().split('T')[0];
      if (!dayMap[dateStr]) dayMap[dateStr] = [];
      dayMap[dateStr].push(log);
    });

    let daysPresent = 0;
    let daysLate = 0;
    let onlyOvertimeDays = 0;
    let expectedDutyHours = 0;
    let totalDutyHours = 0;
    let onlyOvertimeHours = 0;
    let otherOvertimeHours = 0;

    Object.keys(dayMap).forEach(dateStr => {
      const dayLogs = dayMap[dateStr];
      const mainLog = dayLogs[0];
      if (mainLog.status === 'Holiday' || mainLog.status === 'Leave') return;

      let dayWorkedHours = 0;
      dayLogs.forEach(log => {
        const checkInTime = new Date(log.check_in).getTime();
        const checkOutTime = log.check_out ? new Date(log.check_out).getTime() : new Date().getTime();
        const breakSecs = log.total_break_duration_seconds || 0;
        const sessionMs = checkOutTime - checkInTime - (breakSecs * 1000);
        dayWorkedHours += Math.max(0, sessionMs / (1000 * 60 * 60));
      });

      const shiftHours = parseFloat(mainLog.shift_hours || employee.shift_hours || 12.0);

      if (dayWorkedHours >= 6.0) {
        daysPresent++;
        if (dayLogs.some(l => l.status === 'Late')) daysLate++;
        expectedDutyHours += shiftHours;
        totalDutyHours += Math.min(shiftHours, dayWorkedHours);
        otherOvertimeHours += Math.max(0, dayWorkedHours - shiftHours);
      } else if (dayWorkedHours > 0) {
        onlyOvertimeDays++;
        onlyOvertimeHours += dayWorkedHours;
      }
    });

    const shortDutyHours = Math.max(0, expectedDutyHours - totalDutyHours);
    const rawOvertime = onlyOvertimeHours + otherOvertimeHours;
    const totalOvertime = rawOvertime - shortDutyHours;

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
      only_overtime_days: onlyOvertimeDays,
      expected_duty_hours: parseFloat(expectedDutyHours.toFixed(2)),
      total_hours: parseFloat(totalDutyHours.toFixed(2)),
      short_duty_hours: parseFloat(shortDutyHours.toFixed(2)),
      only_overtime_hours: parseFloat(onlyOvertimeHours.toFixed(2)),
      other_overtime_hours: parseFloat(otherOvertimeHours.toFixed(2)),
      raw_overtime: parseFloat(rawOvertime.toFixed(2)),
      overtime: parseFloat(totalOvertime.toFixed(2)),
      grand_total_hours: parseFloat((expectedDutyHours + totalOvertime).toFixed(2)),
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
  
  if (requested_check_in && new Date(requested_check_in).getTime() > Date.now() + 5 * 60000) {
    return res.status(400).json({ error: 'Requested check-in time cannot be in the future.' });
  }
  if (requested_check_out && new Date(requested_check_out).getTime() > Date.now() + 5 * 60000) {
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
    const userRole = req.user.role?.trim().toLowerCase();
    const username = req.user.username;

    let query = `
      SELECT r.*, e.name AS employee_name, e.employee_id AS employee_code, e.branch AS employee_branch,
             e.working_hours, e.shift,
             ea.check_in AS original_check_in, ea.check_out AS original_check_out, ea.date AS attendance_date,
             ea.shift_start_time, ea.shift_name AS ea_shift_name,
             u.username AS requested_by_username
      FROM attendance_edit_requests r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN employee_attendance ea ON r.attendance_id = ea.id
      LEFT JOIN users u ON r.requested_by_user_id = u.id
    `;
    const params = [];

    if (userRole === 'admin' || userRole === 'developer') {
      query += ` WHERE r.target_role IN ('Admin', 'Both')`;
    } else if (userRole === 'operator') {
      query += ` WHERE r.target_role IN ('Operator', 'Both')`;
      let userBranchStr = req.user.branch;
      if (!userBranchStr) {
        const uRes = await pool.query('SELECT branch FROM users WHERE id = $1', [req.user.id]);
        if (uRes.rows.length > 0) userBranchStr = uRes.rows[0].branch;
      }
      
      if (userBranchStr) {
        query += ` AND COALESCE(e.branch, '') = ANY($1)`;
        params.push(userBranchStr.split(',').map(s => s.trim()));
      } else {
        query += ` AND 1=0`; // Show no requests if operator has no branch
      }
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

      if (effectiveCheckIn && new Date(effectiveCheckIn).getTime() > Date.now() + 5 * 60000) {
        return res.status(400).json({ error: 'Approved check-in time cannot be in the future.' });
      }
      if (effectiveCheckOut && new Date(effectiveCheckOut).getTime() > Date.now() + 5 * 60000) {
        return res.status(400).json({ error: 'Approved check-out time cannot be in the future.' });
      }

      // Operator 24-hour constraint based on shift start
      const attendanceDate = new Date(request.attendance_date || effectiveCheckIn || Date.now());
      if (req.user.role?.trim().toLowerCase() === 'operator') {
        const limitCheck = await verifyOperator24HourLimit(request.employee_id, attendanceDate, pool);
        if (!limitCheck.allowed) {
          return res.status(403).json({ error: 'Operators can only approve requests within 24 hours of shift start. Please reject this request or forward it to the Admin.' });
        }
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
        const saudiDateForCheckIn = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Riyadh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(checkInDate);
        const startHourStr = String(startHour).padStart(2, '0');
        const startMinStr = String(startMin).padStart(2, '0');
        const lateThreshold = new Date(`${saudiDateForCheckIn}T${startHourStr}:${startMinStr}:00+03:00`);
        const isLate = checkInDate > lateThreshold;

        const attendanceDateStr = saudiDateForCheckIn;

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
      let finalReason = request.reason;
      if (request.request_type === 'Overtime' && effectiveCheckOut && request.original_check_out) {
        const approvedMins = Math.round((new Date(effectiveCheckOut).getTime() - new Date(request.original_check_out).getTime()) / 60000);
        let requestedMins = null;
        if (request.requested_check_out) {
          requestedMins = Math.round((new Date(request.requested_check_out).getTime() - new Date(request.original_check_out).getTime()) / 60000);
        }
        
        if (requestedMins !== null && approvedMins === requestedMins) {
          finalReason += ` [Approved Same: ${approvedMins} min]`;
        } else {
          finalReason += ` [Approved: ${approvedMins} min]`;
        }
      }

      // Update attendance_edit_requests to reflect the approved reason
      await pool.query(
        `UPDATE attendance_edit_requests SET reason = $2 WHERE id = $1`,
        [id, finalReason]
      );

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
            finalReason
          ]
        );
      }
      
      res.json({ success: true, message: 'Request approved and attendance updated successfully.' });
    } else {
      // Reject
      const { adjusted_check_in, admin_reason } = req.body;
      if (request.request_type === 'Early Check-In' && adjusted_check_in && request.attendance_id) {
        await pool.query(
          `UPDATE employee_attendance SET check_in = $1, remarks = 'Early Check-In adjusted by admin' WHERE id = $2`,
          [adjusted_check_in, request.attendance_id]
        );

        let finalReason = request.reason;
        const saudiTimeDisplay = new Date(adjusted_check_in).toLocaleTimeString('en-US', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });
        const rejectNote = ` [Rejected & Adjusted to ${saudiTimeDisplay}${admin_reason ? ` - ${admin_reason}` : ''}]`;
        finalReason += rejectNote;

        await pool.query(
          `UPDATE attendance_edit_requests SET status = 'Rejected', reason = $2 WHERE id = $1`,
          [id, finalReason]
        );

        const saudiOrigTime = new Date(request.requested_check_in).toLocaleTimeString('en-US', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });
        await pool.query(
          `INSERT INTO edited_attendance (attendance_id, employee_id, original_check_in, original_check_out, new_check_in, new_check_out, edited_by, reason)
           VALUES ($1, $2, $3, null, $4, null, $5, $6)`,
          [
            request.attendance_id,
            request.employee_id,
            request.requested_check_in,
            adjusted_check_in,
            editorName,
            `Early Check-In Rejected: Adjusted from ${saudiOrigTime} to ${saudiTimeDisplay}${admin_reason ? ` (${admin_reason})` : ''}`
          ]
        );
        return res.json({ success: true, message: 'Early check-in rejected and check-in time adjusted successfully.' });
      }

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

