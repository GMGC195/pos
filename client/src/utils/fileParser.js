import * as XLSX from 'xlsx';

// Dictionaries for auto-mapping headers
const HEADER_MAPPINGS = {
  name: [/^(employee\s*)?name$/i, /^full\s*name$/i, /^emp\s*name$/i, /^employee$/i],
  department: [/^department$/i, /^dept$/i],
  position: [/^position$/i, /^designation$/i, /^role$/i, /^title$/i],
  shift: [/^shift$/i]
};

/**
 * Parses CSV/Excel file and automatically maps columns.
 * @param {File} file 
 * @returns {Promise<{data: Array, headers: Array, mappedHeaders: Object, needsManualMapping: boolean}>}
 */
export const parseFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Read raw json with header array
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rawRows.length === 0) {
          throw new Error('The file is empty');
        }

        const headers = rawRows[0].map(h => String(h || '').trim());
        const dataRows = rawRows.slice(1);

        // Attempt automatic mapping
        const mappedHeaders = {
          name: '',
          department: '',
          position: '',
          shift: ''
        };

        headers.forEach((header) => {
          Object.keys(HEADER_MAPPINGS).forEach((field) => {
            const regexes = HEADER_MAPPINGS[field];
            if (regexes.some(r => r.test(header)) && !mappedHeaders[field]) {
              mappedHeaders[field] = header;
            }
          });
        });

        // Determine if manual mapping is required
        // 'name' is the only absolutely required field.
        const needsManualMapping = !mappedHeaders.name;

        // Construct rows as objects
        const parsedRows = dataRows.map((row) => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] !== undefined ? String(row[index]).trim() : '';
          });
          return obj;
        }).filter(row => Object.values(row).some(v => v !== '')); // Filter completely empty rows

        resolve({
          rawRows: parsedRows,
          headers,
          mappedHeaders,
          needsManualMapping
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File reading failed'));
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Maps raw rows into employee schema based on header configuration
 * @param {Array} rawRows 
 * @param {Object} mapping 
 * @returns {Array}
 */
export const applyMapping = (rawRows, mapping) => {
  return rawRows.map((row) => {
    return {
      name: mapping.name ? row[mapping.name] || '' : '',
      department: mapping.department ? row[mapping.department] || '' : '',
      position: mapping.position ? row[mapping.position] || '' : '',
      shift: mapping.shift ? row[mapping.shift] || '' : ''
    };
  });
};
