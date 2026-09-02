const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/pizza_shop' });

pool.query("SELECT id, username, role, branch FROM users WHERE username LIKE '%Umer%' OR username LIKE '%01A%' ORDER BY id DESC")
  .then(res => {
    console.log("DB RESULT:");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
