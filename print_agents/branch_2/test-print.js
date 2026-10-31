const { dispatchPrint } = require('./agent.js');

const sampleData = {
  orderId: 101,
  orderNumber: "25",
  branchId: 1,
  orderType: "Takeaway",
  tableName: "Table 4",
  waiterName: "Ali Raza",
  customerName: "Ahmed Khan",
  customerPhone: "0501234567",
  paymentStatus: "Paid",
  createdAt: new Date().toISOString(),
  items: [
    { name: "Chicken Biryani - مرغ بریانی", qty: 2, amount: 30.00 },
    { name: "Garlic Bread", qty: 1, amount: 15.00 }
  ],
  totalItems: 3,
  subtotal: 75.00,
  discount: 0.00,
  total: 75.00,
  currency: "SAR"
};

console.log('Sending sample test slip to printer...');
dispatchPrint(sampleData);
