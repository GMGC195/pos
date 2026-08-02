const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get today's attendance status for all active employees
router.get('/today', authenticateToken, async (req, res) => {
  try {
    // Get latest attendance session of today for each employee
    const result = await pool.query(`
      SELECT DISTINCT ON (e.id)
             e.id as employee_id,
             e.name,
             e.email,
             e.phone,
             e.role,
             e.shift,
             e.shift_hours,
             e.status as employee_status,
             ea.id as attendance_id,
             ea.check_in,
             ea.check_out,
             ea.status as attendance_status,
             ea.on_break,
             ea.break_start,
             ea.total_break_duration_seconds
      FROM employees e
      LEFT JOIN employee_attendance ea ON e.id = ea.employee_id AND ea.date = CURRENT_DATE
      WHERE e.status = 'Active'
      ORDER BY e.id, ea.check_in DESC NULLS LAST
    `);
    
    // Also calculate today's total hours worked so far for each employee
    const hoursResult = await pool.query(`
      SELECT employee_id, 
             check_in, 
             check_out, 
             total_break_duration_seconds,
             on_break,
             break_start
      FROM employee_attendance
      WHERE date = CURRENT_DATE
    `);

    // Group work hours by employee
    const hoursMap = {};
    hoursResult.rows.forEach(row => {
      if (!hoursMap[row.employee_id]) {
        hoursMap[row.employee_id] = 0;
      }
      const checkInTime = new Date(row.check_in).getTime();
      const checkOutTime = row.check_out ? new Date(row.check_out).getTime() : Date.now();
      
      let breakSecs = row.total_break_duration_seconds || 0;
      if (row.on_break && row.break_start) {
        breakSecs += Math.floor((Date.now() - new Date(row.break_start).getTime()) / 1000);
      }
      
      const sessionMs = checkOutTime - checkInTime - (breakSecs * 1000);
      hoursMap[row.employee_id] += Math.max(0, sessionMs / (1000 * 60 * 60)); // convert to hours
    });

    const employeesWithAttendance = result.rows.map(emp => {
      emp.total_hours_today = hoursMap[emp.employee_id] || 0;
      return emp;
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
      if (shift === 'R1') {
        // R1: 10:00 AM start. Late threshold: 10:15 AM
        if (currentHours > 10 || (currentHours === 10 && currentMins > 15)) {
          isLate = true;
        }
      } else if (shift === 'R2') {
        // R2: 09:00 AM start. Late threshold: 09:15 AM
        if (currentHours > 9 || (currentHours === 9 && currentMins > 15)) {
          isLate = true;
        }
      } else if (shift === 'R3') {
        // R3: 03:00 PM start. Late threshold: 03:15 PM (15:15)
        if (currentHours > 15 || (currentHours === 15 && currentMins > 15)) {
          isLate = true;
        }
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
        'UPDATE employee_attendance SET on_break = true, break_start = NOW() WHERE id = $2 RETURNING *',
        [session.id]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get attendance reports
router.get('/reports', authenticateToken, async (req, res) => {
  const { month, employee_id } = req.query; // month format: 'YYYY-MM'
  try {
    let query = `
      SELECT ea.*, e.name, e.role, e.email, e.shift, e.shift_hours
      FROM employee_attendance ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (month) {
      params.push(`${month}%`);
      query += ` AND ea.date::text LIKE $${params.length}`;
    }

    if (employee_id) {
      params.push(employee_id);
      query += ` AND ea.employee_id = $${params.length}`;
    }

    query += ' ORDER BY ea.date DESC, ea.check_in DESC';

    const result = await pool.query(query, params);
    
    // Format response to include session hours calculated
    const reports = result.rows.map(row => {
      const checkInTime = new Date(row.check_in).getTime();
      const checkOutTime = row.check_out ? new Date(row.check_out).getTime() : null;
      let durationHours = 0;
      
      let otHours = 0;
      const shiftHours = parseFloat(row.shift_hours || 12.0);
      
      if (checkOutTime) {
        const breakSecs = row.total_break_duration_seconds || 0;
        const netMs = checkOutTime - checkInTime - (breakSecs * 1000);
        durationHours = Math.max(0, netMs / (1000 * 60 * 60));
        otHours = durationHours - shiftHours;
      }
      
      return {
        ...row,
        hours_worked: durationHours,
        shift_hours: shiftHours,
        ot_hours: otHours
      };
    });

    res.json(reports);
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

    todayLogs.rows.forEach(log => {
      if (!log.check_out) {
        if (log.on_break) {
          onBreak++;
        } else {
          present++;
        }
      }
      if (log.status === 'Late') {
        late++;
      }
    });

    const checkedOut = todayLogs.rows.filter(log => log.check_out).length;
    const absent = Math.max(0, totalEmployees - todayLogs.rows.length);

    res.json({
      total_employees: totalEmployees,
      present_now: present,
      late_today: late,
      on_break: onBreak,
      checked_out: checkedOut,
      absent: absent
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
