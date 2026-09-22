const fs = require('fs');
let code = fs.readFileSync('routes/orders.js', 'utf8');
code = code.replace(/FROM orders/g, 'FROM "orders"');
code = code.replace(/INTO orders/g, 'INTO "orders"');
code = code.replace(/UPDATE orders/g, 'UPDATE "orders"');
fs.writeFileSync('routes/orders.js', code);
