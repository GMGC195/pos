const fs = require('fs');

['routes/stats.js', 'routes/credit.js'].forEach(file => {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/FROM orders/g, 'FROM "orders"');
  code = code.replace(/INTO orders/g, 'INTO "orders"');
  code = code.replace(/UPDATE orders/g, 'UPDATE "orders"');
  fs.writeFileSync(file, code);
});
