import axios from '../api';
// XLSX is loaded on-demand via dynamic import() — not in the initial bundle

/**
 * Sends a bulk import request to the server.
 * @param {Array} employees 
 * @param {string} duplicateResolution - 'skip' or 'update'
 * @returns {Promise<Object>} import summary response.
 */
export const bulkImportEmployees = async (employees, duplicateResolution) => {
  const res = await axios.post('/api/employees/import', {
    employees,
    duplicateResolution
  });
  return res.data;
};

/**
 * Creates and downloads an Excel file listing the failed/skipped import rows.
 * @param {Array} failedRows - Array of objects with name, department, position, shift, reason.
 */
export const downloadErrorReport = async (failedRows) => {
  if (!failedRows || failedRows.length === 0) return;

  const XLSX = await import('xlsx');

  const data = failedRows.map(row => ({
    'Employee Name': row.name || 'N/A',
    'Department': row.department || '',
    'Position': row.position || '',
    'Shift': row.shift || '',
    'Reason for Failure': row.reason || 'Unknown Error'
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Errors');

  // Auto-fit column widths
  const maxW = data.reduce((acc, row) => {
    Object.keys(row).forEach((key, colIndex) => {
      const valLen = String(row[key] || '').length;
      acc[colIndex] = Math.max(acc[colIndex] || 10, valLen + 2);
    });
    return acc;
  }, []);
  worksheet['!cols'] = maxW.map(w => ({ wch: w }));

  XLSX.writeFile(workbook, 'Employee_Import_Error_Report.xlsx');
};
