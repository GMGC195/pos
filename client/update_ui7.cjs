const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// Find the section starting from Customer Name input up to the Discount input
const startIndex = posContent.indexOf('<div className="form-group" style={{ marginBottom: 6 }}>\n                    <label style={{ fontSize: 13, color: \'var(--text-secondary)\', marginBottom: 2, display: \'block\' }}>Customer Name');
const endIndex = posContent.indexOf('<div style={{ marginTop: \'auto\', paddingTop: 8 }}>', startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find the target block in POS.jsx");
  process.exit(1);
}

const oldBlock = posContent.substring(startIndex, endIndex);

const newBlock = `{/* DINE-IN FORM */}
                  {customerInfo.orderType === 'Dine-In' && (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Table Number *</label>
                          <input type="text" className="form-control" placeholder="e.g. 5" value={customerInfo.tableNumber || ''} onChange={e => setCustomerInfo(p => ({ ...p, tableNumber: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Customer Name *</label>
                          <input type="text" className="form-control" placeholder="Enter Name" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Discount Amount</label>
                          <input className="form-control" type="number" step="0.01" placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Comments (Optional)</label>
                          <input type="text" className="form-control" placeholder="Special instructions..." value={customerInfo.comments || ''} onChange={e => setCustomerInfo(p => ({ ...p, comments: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* DELIVERY FORM */}
                  {customerInfo.orderType === 'Delivery' && (
                    <>
                      <div className="form-group" style={{ marginBottom: 6 }}>
                        <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Customer Name (Optional)</label>
                        <input type="text" className="form-control" placeholder="Enter Name" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Phone Number *</label>
                          <input type="text" className="form-control" placeholder="0300-0000000" value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Discount Amount</label>
                          <input className="form-control" type="number" step="0.01" placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 6 }}>
                        <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Address *</label>
                        <textarea className="form-control" placeholder="123 Main St" rows={1} value={customerInfo.address} onChange={e => setCustomerInfo(p => ({ ...p, address: e.target.value }))} />
                      </div>
                    </>
                  )}

                  {/* TAKEAWAY FORM */}
                  {customerInfo.orderType === 'Takeaway' && (
                    <>
                      <div className="form-group" style={{ marginBottom: 6 }}>
                        <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Customer Name *</label>
                        <input type="text" className="form-control" placeholder="Enter Name" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 6 }}>
                        <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Phone Number *</label>
                        <input type="text" className="form-control" placeholder="0300-0000000" value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 6 }}>
                        <label style={{ display: 'block', fontSize: 13, marginBottom: 2, color: 'var(--text-secondary)' }}>Discount Amount</label>
                        <input className="form-control" type="number" step="0.01" placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                      </div>
                    </>
                  )}

                  <div className="form-group" style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>
                      {customerInfo.orderType === 'Delivery' ? 'Delivery Boy Name' : 'Order Taker Name'}
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={customerInfo.orderType === 'Delivery' ? 'Delivery Boy Name' : 'Order Taker Name'}
                      value={customerInfo.orderTaker || ''}
                      onChange={e => setCustomerInfo(p => ({ ...p, orderTaker: e.target.value }))}
                    />
                  </div>

                  `;

posContent = posContent.replace(oldBlock, newBlock);
fs.writeFileSync(posPath, posContent, 'utf8');
console.log("Successfully rebuilt modal forms!");
