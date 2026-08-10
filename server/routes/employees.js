const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET all employees
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    let query = 'SELECT * FROM employees';
    const params = [];
    
    if (userRole === 'operator' && req.user.shift) {
      query += ` WHERE COALESCE(shift, 'R1') = $1`;
      params.push(req.user.shift);
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
  const { name, role, salary, status, shift, shift_hours, department, position, employee_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO employees (name, role, salary, status, shift, shift_hours, department, position, employee_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [
        name, 
        role || 'Operator', 
        salary || 0, 
        status || 'Active', 
        shift || 'R1', 
        shift_hours || 12.0,
        department || null,
        position || null,
        employee_id || null
      ]
    );
    const newEmp = result.rows[0];
    
    // Auto-generate employee_id if not explicitly provided
    if (!newEmp.employee_id) {
      const generatedId = `EMP-${String(newEmp.id).padStart(4, '0')}`;
      await pool.query('UPDATE employees SET employee_id = $1 WHERE id = $2', [generatedId, newEmp.id]);
      newEmp.employee_id = generatedId;
    }
    
    res.status(201).json(newEmp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update employee
router.put('/:id', authenticateToken, async (req, res) => {
  const { name, role, salary, status, shift, shift_hours, department, position, employee_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE employees SET name=$1, role=$2, salary=$3, status=$4, shift=$5, shift_hours=$6, department=$7, position=$8, employee_id=$9 WHERE id=$10 RETURNING *',
      [
        name, 
        role || 'Operator', 
        salary || 0, 
        status || 'Active', 
        shift || 'R1', 
        shift_hours || 12.0, 
        department || null,
        position || null,
        employee_id || null,
        req.params.id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update employee shift only
router.patch('/:id/shift', authenticateToken, async (req, res) => {
  const { shift, shift_hours } = req.body;
  if (!shift) {
    return res.status(400).json({ error: 'Shift is required' });
  }
  try {
    const result = await pool.query(
      'UPDATE employees SET shift=$1, shift_hours=$2 WHERE id=$3 RETURNING *',
      [shift, shift_hours || (shift === 'R2' ? 12.0 : 13.0), req.params.id]
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
      const shift = emp.shift ? String(emp.shift).trim() : 'R1';
      
      let shift_hours = parseFloat(emp.shift_hours);
      if (isNaN(shift_hours)) {
        shift_hours = 12.0;
        if (shift === 'R1') shift_hours = 13.0;
        if (shift === 'R3') shift_hours = 13.0;
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
             SET name=$1, role=$2, salary=$3, status=$4, shift=$5, shift_hours=$6, department=$7, position=$8
             WHERE id=$9`,
            [name, role, salary, status, shift, shift_hours, department, position, existing.id]
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
          `INSERT INTO employees (name, role, salary, status, shift, shift_hours, department, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [name, role, salary, status, shift, shift_hours, department, position]
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

// GET all configured shifts
router.get('/shifts/list', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employee_shifts ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new custom shift
router.post('/shifts/list', authenticateToken, async (req, res) => {
  const { name, start_time, end_time, hours } = req.body;
  if (!name || !start_time || !end_time) {
    return res.status(400).json({ error: 'Name, Start Time, and End Time are required' });
  }
  try {
    const hoursNum = parseFloat(hours) || 12.0;
    const result = await pool.query(
      'INSERT INTO employee_shifts (name, start_time, end_time, hours) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.toUpperCase(), start_time, end_time, hoursNum]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update configured shift
router.put('/shifts/list/:id', authenticateToken, async (req, res) => {
  const { name, start_time, end_time, hours } = req.body;
  try {
    const hoursNum = parseFloat(hours) || 12.0;
    const result = await pool.query(
      'UPDATE employee_shifts SET name=$1, start_time=$2, end_time=$3, hours=$4 WHERE id=$5 RETURNING *',
      [name.toUpperCase(), start_time, end_time, hoursNum, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shift config not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE shift config
router.delete('/shifts/list/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM employee_shifts WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shift config not found' });
    res.json({ message: 'Shift configuration deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
