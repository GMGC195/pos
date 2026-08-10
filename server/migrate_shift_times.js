const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'pizza_shop',
  password: 'admin',
  port: 5432,
});

async function migrateTimes() {
  try {
    const res = await pool.query('SELECT id, start_time, end_time FROM employee_shifts');
    for (const row of res.rows) {
      let start_time = row.start_time;
      let end_time = row.end_time;

      const convertTo24 = (timeStr) => {
        if (!timeStr) return timeStr;
        const match = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
        if (match) {
          let hrs = parseInt(match[1], 10);
          const mins = parseInt(match[2], 10);
          const ampm = match[3].toUpperCase();
          if (ampm === 'PM' && hrs < 12) hrs += 12;
          if (ampm === 'AM' && hrs === 12) hrs = 0;
          return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        }
        return timeStr; // Already in correct format or unrecognized
      };

      const newStart = convertTo24(start_time);
      const newEnd = convertTo24(end_time);

      if (newStart !== start_time || newEnd !== end_time) {
        await pool.query('UPDATE employee_shifts SET start_time = $1, end_time = $2 WHERE id = $3', [newStart, newEnd, row.id]);
        console.log(`Updated shift ${row.id}: ${start_time} -> ${newStart}, ${end_time} -> ${newEnd}`);
      }
    }
    console.log('Migration complete');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

migrateTimes();
