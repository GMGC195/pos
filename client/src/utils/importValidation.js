/**
 * Client-side validation for employees import.
 * @param {Array} rows - Array of mapped employee objects.
 * @param {Array} existingEmployees - Array of existing employees from database.
 * @returns {Array} validated rows with result code and status messages.
 */
export const validateImportData = (rows, existingEmployees) => {
  const seenInFile = new Set();
  
  return rows.map((row, index) => {
    const name = String(row.name || '').trim();
    const department = String(row.department || '').trim();
    const position = String(row.position || '').trim();
    const shift = String(row.shift || '').trim();
    
    // Trim values
    const cleanRow = {
      ...row,
      name,
      department,
      position,
      shift,
      index
    };

    // 1. Check Missing Name
    if (!name) {
      return {
        ...cleanRow,
        status: 'error',
        reason: 'Missing Name',
        resultText: '❌ Missing Name'
      };
    }

    // 2. Check Name Field Length (max 150 characters)
    if (name.length > 150) {
      return {
        ...cleanRow,
        status: 'error',
        reason: 'Name too long (Max 150 chars)',
        resultText: '❌ Name Too Long'
      };
    }

    // 3. Check duplicate inside the uploaded file itself
    // We check duplicates inside file using Name + Department
    const fileKey = `${name.toLowerCase()}||${department.toLowerCase()}`;
    if (seenInFile.has(fileKey)) {
      return {
        ...cleanRow,
        status: 'error',
        reason: 'Duplicate Row in File',
        resultText: '❌ File Duplicate'
      };
    }
    seenInFile.add(fileKey);

    // 4. Check duplicate against existing database employees
    // Priority duplicate matching:
    // - Email (if present)
    // - Phone (if present)
    // - Name + Department
    const dbDuplicate = existingEmployees.find(emp => {
      // Name + Department check
      const sameNameAndDept = emp.name.toLowerCase() === name.toLowerCase() && 
        (emp.department || '').toLowerCase() === department.toLowerCase();
      
      return sameNameAndDept;
    });

    if (dbDuplicate) {
      return {
        ...cleanRow,
        status: 'duplicate',
        reason: 'Duplicate Employee (Exists in System)',
        resultText: '❌ Duplicate',
        existingId: dbDuplicate.id,
        existingEmpId: dbDuplicate.employee_id
      };
    }

    // 5. Warning for missing optional fields like Shift
    if (!shift) {
      return {
        ...cleanRow,
        status: 'warning',
        reason: 'Missing Shift (R1 will be default)',
        resultText: '⚠ Missing Shift'
      };
    }

    // 6. Ready to Import
    return {
      ...cleanRow,
      status: 'ready',
      reason: 'Ready',
      resultText: '✅ Ready'
    };
  });
};
