const http = require('http');
http.get('http://localhost:5000/api/attendance/edited-logs', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
}).on('error', err => console.log(err.message));
