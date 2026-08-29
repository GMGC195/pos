const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// 1. Add quickCompleteModal state
if (!posContent.includes('quickCompleteModal')) {
  posContent = posContent.replace(
    `const [tableConflictData, setTableConflictData] = useState(null)`,
    `const [tableConflictData, setTableConflictData] = useState(null)\n  const [quickCompleteModal, setQuickCompleteModal] = useState(null)`
  );
}

// 2. Add Radio Buttons in ConfirmModal right column
const rightColumnAnchor = `<div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 8 }}>`;
const paymentRadios = `                  <div className="form-group" style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Payment Method</label>
                    <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" name="paymentMethod" value="Cash" checked={paymentMethod === 'Cash'} onChange={() => setPaymentMethod('Cash')} />
                        <span style={{ fontSize: 14 }}>Cash</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" name="paymentMethod" value="Online" checked={paymentMethod === 'Online'} onChange={() => setPaymentMethod('Online')} />
                        <span style={{ fontSize: 14 }}>Online</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" name="paymentMethod" value="Payment Pending" checked={paymentMethod === 'Payment Pending' || paymentMethod === 'Hold'} onChange={() => setPaymentMethod('Payment Pending')} />
                        <span style={{ fontSize: 14 }}>Pending</span>
                      </label>
                    </div>
                  </div>`;
if (!posContent.includes('name="paymentMethod" value="Cash"')) {
  posContent = posContent.replace(rightColumnAnchor, rightColumnAnchor + '\n' + paymentRadios);
}

// 3. Change Complete button in Active Orders list
const activeCompleteBtn = `<button className="btn btn-sm btn-success" style={{ padding: '2px 10px', fontSize: 11, fontWeight: 700 }} onClick={() => loadOrderForEdit(o.id)}>Complete</button>`;
const newActiveCompleteBtn = `<button className="btn btn-sm btn-success" style={{ padding: '2px 10px', fontSize: 11, fontWeight: 700 }} onClick={() => setQuickCompleteModal(o)}>Complete</button>`;
posContent = posContent.replace(activeCompleteBtn, newActiveCompleteBtn);

// 4. Inject Quick Complete Modal
const modalAppend = `{/* Quick Complete Modal */}
      {quickCompleteModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 360, padding: 24, textAlign: 'center' }}>
            <h3 style={{ marginBottom: 16 }}>Complete Order #{quickCompleteModal.id}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                <input type="radio" name="quickPayment" value="Cash" checked={paymentMethod === 'Cash'} onChange={() => setPaymentMethod('Cash')} />
                <span style={{ fontSize: 15, fontWeight: 500 }}>Cash</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                <input type="radio" name="quickPayment" value="Online" checked={paymentMethod === 'Online'} onChange={() => setPaymentMethod('Online')} />
                <span style={{ fontSize: 15, fontWeight: 500 }}>Online</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                <input type="radio" name="quickPayment" value="Payment Pending" checked={paymentMethod === 'Payment Pending' || paymentMethod === 'Hold'} onChange={() => setPaymentMethod('Payment Pending')} />
                <span style={{ fontSize: 15, fontWeight: 500 }}>Pending</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setQuickCompleteModal(null)}>Cancel</button>
              <button className="btn btn-success" style={{ flex: 1 }} onClick={async () => {
                const method = paymentMethod === 'Hold' ? 'Payment Pending' : paymentMethod;
                try {
                  if (method === 'Payment Pending') {
                    await axios.patch(\`/api/orders/\${quickCompleteModal.id}/status\`, { status: method })
                  } else {
                    await axios.patch(\`/api/orders/\${quickCompleteModal.id}/pay\`, { payment_method: method })
                  }
                  toast.success('Order completed!')
                  setQuickCompleteModal(null)
                  fetchActiveOrders()
                } catch(err) {
                  toast.error('Failed to complete order')
                }
              }}>Complete</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Table Conflict Modal */}`;
posContent = posContent.replace(`{/* Table Conflict Modal */}`, modalAppend);

fs.writeFileSync(posPath, posContent, 'utf8');
console.log("Successfully added payment method flows!");
