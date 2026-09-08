const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/attendance/edited-logs',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' // We don't have a valid token! Wait! 
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    require('fs').writeFileSync('d:\\pizza-shop-employe-mangement\\server\\error_log.txt', data);
  });
});

req.on('error', e => {
  require('fs').writeFileSync('d:\\pizza-shop-employe-mangement\\server\\error_log.txt', e.message);
});
req.end();
