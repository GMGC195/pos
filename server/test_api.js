const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const crypto = require('crypto');

async function test() {
  const token = jwt.sign({ id: 1, email: 'admin@saucybite.com', role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret');
  
  const orderData = JSON.stringify({
    items: [{ id: 1, quantity: 1, price: 10, total_price: 10, name: "Pizza" }],
    subtotal: 10,
    tax: 0,
    grand_total: 10,
    payment_method: 'Cash',
    order_type: 'Dine-In',
    client_order_id: crypto.randomUUID()
  });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/orders',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(orderData)
    }
  };

  const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      console.log("Status:", res.statusCode);
      console.log("Data:", data.substring(0, 200));
    });
  });
  req.on('error', e => console.error(e));
  req.write(orderData);
  req.end();
}

test();
