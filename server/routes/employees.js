const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const bcrypt = require('bcrypt');

const autoCreateUserForEmployee = async (employee) => {
  try {
    const name = employee.name;
    const empId = employee.id;
    const employeeCode = employee.employee_id || `EMP-${String(empId).padStart(4, '0')}`;
    
    // Check if a user for this employee already exists
    const userCheck = await pool.query(
      'SELECT * FROM users WHERE employee_id = $1 OR email = $2 OR username = $3',
      [empId, `${employeeCode.toLowerCase()}@alrawaq.com`, employeeCode.toLowerCase()]
    );
    if (userCheck.rows.length > 0) {
      return; // Already exists
    }

    // Generate unique username from name
    let baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!baseUsername) {
      baseUsername = `emp${empId}`;
    }
    
    let username = baseUsername;
    let counter = 1;
    while (true) {
      const checkU = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if (checkU.rows.length === 0) {
        break;
      }
      username = `${baseUsername}${counter}`;
      counter++;
    }

    const email = `${username}@alrawaq.com`;
    const passwordHash = await bcrypt.hash('user123', 10);
    
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role, employee_id, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [username, email, passwordHash, 'Employee', empId, true]
    );
    console.log(`Auto-created login user account for employee: ${name} (Username: ${username}, Email: ${email})`);
  } catch (err) {
    console.error('Error auto-creating user for employee:', err.message);
  }
};

// GET all employees
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    let query = 'SELECT * FROM employees';
    const params = [];
    
    if (userRole === 'operator') {
      if (req.user.shift) {
        query += ` WHERE COALESCE(shift, 'Day') = ANY($1)`;
        params.push(req.user.shift.split(',').map(s => s.trim()));
      }
      if (req.user.branch) {
        if (params.length === 1) {
          query += ` AND COALESCE(branch, '') = ANY($2)`;
        } else {
          query += ` WHERE COALESCE(branch, '') = ANY($1)`;
        }
        params.push(req.user.branch.split(',').map(s => s.trim()));
      }
    }
    
    query += ' ORDER BY id DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new employee
router.post('/', authenticateToken, async (req, res) => {
  const { name, role, salary, status, shift_hours, shift_start_time, shift_end_time, department, position, employee_id, branch, shift, is_split_shift, start_time_2, end_time_2, strict_attendance, custom_deduction_active, custom_deduction_rules } = req.body;
  try {
    // Upsert employee working hours config
    if (shift_start_time && shift_end_time) {
      await pool.query(
        'INSERT INTO employee_working_hours (name, start_time, end_time, hours, is_split_shift, start_time_2, end_time_2) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (name) DO UPDATE SET start_time = $2, end_time = $3, hours = $4, is_split_shift = $5, start_time_2 = $6, end_time_2 = $7',
        [name, shift_start_time, shift_end_time, shift_hours || 12.0, is_split_shift || false, start_time_2 || null, end_time_2 || null]
      );
    }

    const result = await pool.query(
      'INSERT INTO employees (name, role, salary, status, working_hours, shift_hours, department, position, employee_id, branch, shift, strict_attendance, custom_deduction_active, custom_deduction_rules) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
      [
        name, 
        role || 'Operator', 
        salary || 0, 
        status || 'Active', 
        name, 
        shift_hours || 12.0,
        department || null,
        position || null,
        employee_id || null,
        branch || null,
        shift || 'Day',
        strict_attendance || false,
        custom_deduction_active || false,
        custom_deduction_rules ? JSON.stringify(custom_deduction_rules) : '[]'
      ]
    );
    const newEmp = result.rows[0];
    
    // Auto-generate employee_id if not explicitly provided
    if (!newEmp.employee_id) {
      const generatedId = `EMP-${String(newEmp.id).padStart(4, '0')}`;
      await pool.query('UPDATE employees SET employee_id = $1 WHERE id = $2', [generatedId, newEmp.id]);
      newEmp.employee_id = generatedId;
    }

    // Auto-create login user account
    await autoCreateUserForEmployee(newEmp);
    
    res.status(201).json(newEmp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update employee
router.put('/:id', authenticateToken, async (req, res) => {
  const { name, role, salary, status, shift_hours, shift_start_time, shift_end_time, department, position, employee_id, branch, shift, is_split_shift, start_time_2, end_time_2, strict_attendance, custom_deduction_active, custom_deduction_rules } = req.body;
  try {
    // Upsert employee working hours config
    if (shift_start_time && shift_end_time) {
      await pool.query(
        'INSERT INTO employee_working_hours (name, start_time, end_time, hours, is_split_shift, start_time_2, end_time_2) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (name) DO UPDATE SET start_time = $2, end_time = $3, hours = $4, is_split_shift = $5, start_time_2 = $6, end_time_2 = $7',
        [name, shift_start_time, shift_end_time, shift_hours || 12.0, is_split_shift || false, start_time_2 || null, end_time_2 || null]
      );
    }

    const result = await pool.query(
      'UPDATE employees SET name=$1, role=$2, salary=$3, status=$4, working_hours=$5, shift_hours=$6, department=$7, position=$8, employee_id=$9, branch=$10, shift=$11, strict_attendance=$12, custom_deduction_active=$13, custom_deduction_rules=$14 WHERE id=$15 RETURNING *',
      [
        name, 
        role || 'Operator', 
        salary || 0, 
        status || 'Active', 
        name, 
        shift_hours || 12.0, 
        department || null,
        position || null,
        employee_id || null,
        branch || null,
        shift || 'Day',
        strict_attendance || false,
        custom_deduction_active || false,
        custom_deduction_rules ? JSON.stringify(custom_deduction_rules) : '[]',
        req.params.id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    
    // Auto-create user account if not exists
    await autoCreateUserForEmployee(result.rows[0]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update employee working_hours only
router.patch('/:id/working-hours', authenticateToken, async (req, res) => {
  const { working_hours, shift_hours } = req.body;
  if (!working_hours) {
    return res.status(400).json({ error: 'Working Hours are required' });
  }
  try {
    const result = await pool.query(
      'UPDATE employees SET working_hours=$1, shift_hours=$2 WHERE id=$3 RETURNING *',
      [working_hours, shift_hours || (working_hours === 'R2' ? 12.0 : 13.0), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE employee
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk import employees inside a database transaction
router.post('/import', authenticateToken, async (req, res) => {
  const { employees, duplicateResolution } = req.body;
  if (!Array.isArray(employees)) {
    return res.status(400).json({ error: 'Employees data must be an array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    let successCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errorsList = [];

    for (const emp of employees) {
      // Basic validation
      const name = emp.name ? String(emp.name).trim() : '';
      if (!name) {
        skippedCount++;
        errorsList.push({
          name: emp.name || 'N/A',
          department: emp.department || '',
          position: emp.position || '',
          shift: emp.shift || '',
          reason: 'Missing Name'
        });
        continue;
      }

      const role = emp.role ? String(emp.role).trim() : 'Operator';
      const salary = parseFloat(emp.salary) || 0;
      const status = 'Active';
      const working_hours = emp.working_hours ? String(emp.working_hours).trim() : 'R1';
      const shift = emp.shift ? String(emp.shift).trim() : 'Day';
      const branch = emp.branch ? String(emp.branch).trim() : null;
      
      let shift_hours = parseFloat(emp.shift_hours);
      if (isNaN(shift_hours)) {
        shift_hours = 12.0;
        if (working_hours === 'R1') shift_hours = 13.0;
        if (working_hours === 'R3') shift_hours = 13.0;
      }
      const department = emp.department ? String(emp.department).trim() : null;
      const position = emp.position ? String(emp.position).trim() : null;
      const employee_id = emp.employee_id ? String(emp.employee_id).trim() : null;

      // Duplicate Check priority (Employee ID -> Name + Department)
      let existing = null;
      if (employee_id) {
        const check = await client.query('SELECT * FROM employees WHERE employee_id = $1', [employee_id]);
        if (check.rows.length > 0) existing = check.rows[0];
      }
      if (!existing) {
        const deptVal = department ? department : null;
        let check;
        if (deptVal) {
          check = await client.query('SELECT * FROM employees WHERE LOWER(name) = LOWER($1) AND LOWER(department) = LOWER($2)', [name, deptVal]);
        } else {
          check = await client.query('SELECT * FROM employees WHERE LOWER(name) = LOWER($1) AND department IS NULL', [name]);
        }
        if (check.rows.length > 0) existing = check.rows[0];
      }

      if (existing) {
        if (duplicateResolution === 'skip') {
          skippedCount++;
          errorsList.push({
            name,
            department: department || '',
            position: position || '',
            shift,
            reason: 'Duplicate Employee (Skipped)'
          });
          continue;
        } else if (duplicateResolution === 'update') {
          // Update existing employee
          await client.query(
            `UPDATE employees 
             SET name=$1, role=$2, salary=$3, status=$4, working_hours=$5, shift_hours=$6, department=$7, position=$8, branch=$9, shift=$10
             WHERE id=$11`,
            [name, role, salary, status, working_hours, shift_hours, department, position, branch, shift, existing.id]
          );
          updatedCount++;
        } else {
          skippedCount++;
          errorsList.push({
            name,
            department: department || '',
            position: position || '',
            shift,
            reason: 'Duplicate Employee'
          });
        }
      } else {
        // Insert new employee
        const insertRes = await client.query(
          `INSERT INTO employees (name, role, salary, status, working_hours, shift_hours, department, position, branch, shift)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [name, role, salary, status, working_hours, shift_hours, department, position, branch, shift]
        );
        const newId = insertRes.rows[0].id;
        const generatedId = `EMP-${String(newId).padStart(4, '0')}`;
        await pool.query('UPDATE employees SET employee_id = $1 WHERE id = $2', [generatedId, newId]);
        successCount++;
      }
    }

    await client.query('COMMIT');
    res.json({
      total: employees.length,
      success: successCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
      errors: errorsList
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Bulk import failed: ' + err.message });
  } finally {
    client.release();
  }
});

// GET all configured working hours (only for actual employees)
router.get('/working-hours/list', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT wh.* 
      FROM employee_working_hours wh
      WHERE EXISTS (
        SELECT 1 FROM employees e WHERE LOWER(e.name) = LOWER(wh.name)
      )
      ORDER BY wh.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new custom working hours
router.post('/working-hours/list', authenticateToken, async (req, res) => {
  const { name, start_time, end_time, hours, is_split_shift, start_time_2, end_time_2 } = req.body;
  if (!name || !start_time || !end_time) {
    return res.status(400).json({ error: 'Name, Start Time, and End Time are required' });
  }
  if (is_split_shift && (!start_time_2 || !end_time_2)) {
    return res.status(400).json({ error: 'Second Start Time and End Time are required for split shifts' });
  }
  try {
    const hoursNum = parseFloat(hours) || 12.0;
    // Case-insensitive upsert: if a config already exists for this name (any case), update it instead of inserting
    const existing = await pool.query('SELECT id FROM employee_working_hours WHERE LOWER(name) = LOWER($1)', [name]);
    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        'UPDATE employee_working_hours SET start_time=$1, end_time=$2, hours=$3, is_split_shift=$4, start_time_2=$5, end_time_2=$6 WHERE id=$7 RETURNING *',
        [start_time, end_time, hoursNum, is_split_shift || false, start_time_2 || null, end_time_2 || null, existing.rows[0].id]
      );
    } else {
      result = await pool.query(
        'INSERT INTO employee_working_hours (name, start_time, end_time, hours, is_split_shift, start_time_2, end_time_2) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [name, start_time, end_time, hoursNum, is_split_shift || false, start_time_2 || null, end_time_2 || null]
      );
    }
    // Sync to employees table
    await pool.query('UPDATE employees SET shift_hours = $1 WHERE LOWER(name) = LOWER($2)', [hoursNum, name]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update configured working hours
router.put('/working-hours/list/:id', authenticateToken, async (req, res) => {
  const { start_time, end_time, hours, is_split_shift, start_time_2, end_time_2 } = req.body;
  try {
    const hoursNum = parseFloat(hours) || 12.0;
    const existing = await pool.query('SELECT name FROM employee_working_hours WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Working hours config not found' });
    const name = existing.rows[0].name;

    const result = await pool.query(
      'UPDATE employee_working_hours SET start_time=$1, end_time=$2, hours=$3, is_split_shift=$4, start_time_2=$5, end_time_2=$6 WHERE id=$7 RETURNING *',
      [start_time, end_time, hoursNum, is_split_shift || false, start_time_2 || null, end_time_2 || null, req.params.id]
    );

    // Sync to employees table
    await pool.query('UPDATE employees SET shift_hours = $1 WHERE LOWER(name) = LOWER($2)', [hoursNum, name]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE working hours config
router.delete('/working-hours/list/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM employee_working_hours WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Working hours config not found' });
    res.json({ message: 'Working hours configuration deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
