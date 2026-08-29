const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// Find the start and end of the Right Column
const startStr = `{/* Right Column: Optional Info & Actions */}`;
const endStr = `                </div>
              </div>
            </div>
          </div>
        )
      }`;

const startIndex = posContent.indexOf(startStr);
const endIndex = posContent.indexOf(endStr, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find block in POS.jsx");
  process.exit(1);
}

const oldBlock = posContent.substring(startIndex, endIndex);

const newBlock = `{/* Right Column: Optional Info & Actions */}
                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="form-group" style={{ marginBottom: 4 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Order Type</label>
                    <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" name="orderType" value="Dine-In" checked={customerInfo.orderType === 'Dine-In'} onChange={() => setCustomerInfo(p => ({ ...p, orderType: 'Dine-In' }))} />
                        <span style={{ fontSize: 13 }}>Dine-In</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" name="orderType" value="Takeaway" checked={customerInfo.orderType === 'Takeaway'} onChange={() => setCustomerInfo(p => ({ ...p, orderType: 'Takeaway' }))} />
                        <span style={{ fontSize: 13 }}>Takeaway</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" name="orderType" value="Delivery" checked={customerInfo.orderType === 'Delivery'} onChange={() => setCustomerInfo(p => ({ ...p, orderType: 'Delivery' }))} />
                        <span style={{ fontSize: 13 }}>Delivery</span>
                      </label>
                    </div>
                  </div>

                  {/* DINE-IN FORM */}
                  {customerInfo.orderType === 'Dine-In' && (
                    <>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Table Number *</span>
                            {customerInfo.tableNumber && (
                              <span style={{ color: activeOrders.some(o => o.order_type === 'Dine-In' && o.table_number === customerInfo.tableNumber && o.status === 'Hold' && o.id !== parseInt(editingOrderId)) ? 'var(--red)' : 'var(--green)', fontWeight: 'bold' }}>
                                {activeOrders.some(o => o.order_type === 'Dine-In' && o.table_number === customerInfo.tableNumber && o.status === 'Hold' && o.id !== parseInt(editingOrderId)) ? 'Already Booked' : 'Available'}
                              </span>
                            )}
                          </label>
                          <input type="text" className="form-control" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="e.g. 5" value={customerInfo.tableNumber || ''} onChange={e => setCustomerInfo(p => ({ ...p, tableNumber: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Customer Name *</label>
                          <input type="text" className="form-control" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="Enter Name" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Discount Amount</label>
                          <input className="form-control" type="number" step="0.01" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Comments</label>
                          <input type="text" className="form-control" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="Notes..." value={customerInfo.comments || ''} onChange={e => setCustomerInfo(p => ({ ...p, comments: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* DELIVERY FORM */}
                  {customerInfo.orderType === 'Delivery' && (
                    <>
                      <div className="form-group" style={{ marginBottom: 4 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Customer Name</label>
                        <input type="text" className="form-control" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="Enter Name" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Phone Number *</label>
                          <input type="text" className="form-control" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="0300-0000000" value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Discount Amount</label>
                          <input className="form-control" type="number" step="0.01" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 4 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Address *</label>
                        <textarea className="form-control" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="123 Main St" rows={1} value={customerInfo.address} onChange={e => setCustomerInfo(p => ({ ...p, address: e.target.value }))} />
                      </div>
                    </>
                  )}

                  {/* TAKEAWAY FORM */}
                  {customerInfo.orderType === 'Takeaway' && (
                    <>
                      <div className="form-group" style={{ marginBottom: 4 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Customer Name *</label>
                        <input type="text" className="form-control" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="Enter Name" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 4 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Phone Number *</label>
                        <input type="text" className="form-control" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="0300-0000000" value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 4 }}>
                        <label style={{ display: 'block', fontSize: 12, marginBottom: 2, color: 'var(--text-secondary)' }}>Discount Amount</label>
                        <input className="form-control" type="number" step="0.01" style={{ padding: '6px 8px', fontSize: 13 }} placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                      </div>
                    </>
                  )}

                  <div className="form-group" style={{ marginBottom: 4 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>
                      {customerInfo.orderType === 'Delivery' ? 'Delivery Boy Name' : 'Order Taker Name'}
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      style={{ padding: '6px 8px', fontSize: 13 }}
                      placeholder={customerInfo.orderType === 'Delivery' ? 'Delivery Boy Name' : 'Order Taker Name'}
                      value={customerInfo.orderTaker || ''}
                      onChange={e => setCustomerInfo(p => ({ ...p, orderTaker: e.target.value }))}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 4, marginTop: 'auto' }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Payment Method</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['Cash', 'Online', 'Payment Pending'].map(pm => (
                        <button 
                          key={pm}
                          type="button"
                          onClick={() => setPaymentMethod(pm)}
                          style={{
                            flex: 1, 
                            padding: '8px 4px', 
                            fontSize: 13,
                            fontWeight: 600,
                            borderRadius: 6,
                            border: paymentMethod === pm || (pm==='Payment Pending' && paymentMethod==='Hold') ? '2px solid var(--primary)' : '1px solid var(--surface-2)',
                            background: paymentMethod === pm || (pm==='Payment Pending' && paymentMethod==='Hold') ? 'rgba(255,184,0,0.1)' : 'white',
                            color: paymentMethod === pm || (pm==='Payment Pending' && paymentMethod==='Hold') ? 'var(--primary)' : 'var(--text-secondary)',
                            cursor: 'pointer'
                          }}
                        >
                          {pm === 'Payment Pending' ? 'Pending' : pm}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ paddingTop: 4, display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, padding: '10px 16px', fontSize: 14 }} onClick={() => handlePlaceOrder(paymentMethod, false)} disabled={processing}>
                      Punch Only
                    </button>
                    <button className="btn btn-primary" style={{ flex: 2, padding: '10px 16px', fontSize: 14 }} onClick={() => handlePlaceOrder(paymentMethod, true)} disabled={processing}>
                      {processing ? 'Processing...' : 'Print & Place Order'}
                    </button>
                  </div>
`;

posContent = posContent.replace(oldBlock, newBlock);

fs.writeFileSync(posPath, posContent, 'utf8');
console.log("Successfully rebuilt ConfirmModal UI with compacted fields and button selector!");
