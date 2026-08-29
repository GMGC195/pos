const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let content = fs.readFileSync(posPath, 'utf8');

// Replace the right column form of confirm modal
const formStartStr = `<div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 8 }}>`;
const formEndStr = `                  <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                    <button className="btn btn-primary" style={{ width: '100%', fontSize: 16, padding: '10px 16px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => submitOrder(paymentMethod)} disabled={processing}>
                      {processing ? 'Processing...' : <><CheckCircle2 size={18} /> Place & Print (Enter)</>}
                    </button>
                  </div>
                </div>`;

const formStart = content.indexOf(formStartStr);
const formEnd = content.indexOf(formEndStr);

if (formStart !== -1 && formEnd !== -1) {
  const originalForm = content.substring(formStart, formEnd + formEndStr.length);
  
  const newForm = `<div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Order Type</label>
                    <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="orderType" 
                          value="Dine-In" 
                          checked={customerInfo.orderType === 'Dine-In'} 
                          onChange={() => setCustomerInfo(p => ({ ...p, orderType: 'Dine-In' }))} 
                        />
                        <span style={{ fontSize: 14 }}>Dine-In</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="orderType" 
                          value="Takeaway" 
                          checked={customerInfo.orderType === 'Takeaway'} 
                          onChange={() => setCustomerInfo(p => ({ ...p, orderType: 'Takeaway' }))} 
                        />
                        <span style={{ fontSize: 14 }}>Takeaway</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="orderType" 
                          value="Delivery" 
                          checked={customerInfo.orderType === 'Delivery'} 
                          onChange={() => setCustomerInfo(p => ({ ...p, orderType: 'Delivery' }))} 
                        />
                        <span style={{ fontSize: 14 }}>Delivery</span>
                      </label>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Customer Name {customerInfo.orderType === 'Dine-In' || customerInfo.orderType === 'Takeaway' ? '*' : '(Optional)'}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Enter Customer Name"
                      value={customerInfo.name}
                      onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))}
                    />
                  </div>

                  {(customerInfo.orderType === 'Takeaway' || customerInfo.orderType === 'Delivery') && (
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Phone Number *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="0300-0000000"
                        value={customerInfo.phone}
                        onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                  )}

                  {customerInfo.orderType === 'Dine-In' && (
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Table Number *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. 5"
                        value={customerInfo.tableNumber || ''}
                        onChange={e => setCustomerInfo(p => ({ ...p, tableNumber: e.target.value }))}
                      />
                    </div>
                  )}

                  {customerInfo.orderType === 'Dine-In' && (
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Comments (Optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Any special instructions..."
                        value={customerInfo.comments || ''}
                        onChange={e => setCustomerInfo(p => ({ ...p, comments: e.target.value }))}
                      />
                    </div>
                  )}

                  {customerInfo.orderType === 'Delivery' && (
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Address *</label>
                      <textarea
                        className="form-control"
                        placeholder="123 Main St"
                        rows={1}
                        value={customerInfo.address}
                        onChange={e => setCustomerInfo(p => ({ ...p, address: e.target.value }))}
                      />
                    </div>
                  )}

                  <div className="form-group" style={{ marginBottom: 8 }}>
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

                  {(customerInfo.orderType === 'Takeaway' || customerInfo.orderType === 'Delivery') && (
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label style={{ display: 'block', fontSize: 13, marginBottom: 2, color: 'var(--text-secondary)' }}>Discount Amount</label>
                      <input className="form-control" type="number" step="0.01" placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                    </div>
                  )}

                  <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                    <button className="btn btn-primary" style={{ width: '100%', fontSize: 16, padding: '10px 16px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => submitOrder(paymentMethod)} disabled={processing}>
                      {processing ? 'Processing...' : <><CheckCircle2 size={18} /> Place & Print (Enter)</>}
                    </button>
                  </div>
                </div>`;
                
  content = content.replace(originalForm, newForm);
  fs.writeFileSync(posPath, content, 'utf8');
  console.log('Successfully updated modal form');
} else {
  console.error("Could not find form block");
}
