const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/pos' });
pool.query("SELECT * FROM attendance_edit_requests WHERE request_type = 'Overtime' ORDER BY created_at DESC LIMIT 5").then(res => { console.log(res.rows); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
