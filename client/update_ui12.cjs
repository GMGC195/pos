const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// 1. Fix processing state to support 'punch' vs 'print'
posContent = posContent.replace(
  `setProcessing(true)`,
  `setProcessing(shouldPrint ? 'print' : 'punch')`
);

// Update confirmModal buttons to show specific processing states
const oldButtons = `<div style={{ paddingTop: 4, display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, padding: '10px 16px', fontSize: 14 }} onClick={() => handlePlaceOrder(paymentMethod, false)} disabled={processing}>
                      Punch Only
                    </button>
                    <button className="btn btn-primary" style={{ flex: 2, padding: '10px 16px', fontSize: 14 }} onClick={() => handlePlaceOrder(paymentMethod, true)} disabled={processing}>
                      {processing ? 'Processing...' : 'Print & Place Order'}
                    </button>
                  </div>`;

const newButtons = `<div style={{ paddingTop: 4, display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, padding: '10px 16px', fontSize: 14 }} onClick={() => handlePlaceOrder(paymentMethod, false)} disabled={processing !== false}>
                      {processing === 'punch' ? 'Punching...' : 'Punch Only'}
                    </button>
                    <button className="btn btn-primary" style={{ flex: 2, padding: '10px 16px', fontSize: 14 }} onClick={() => handlePlaceOrder(paymentMethod, true)} disabled={processing !== false}>
                      {processing === 'print' ? 'Processing...' : 'Print & Place Order'}
                    </button>
                  </div>`;

if (posContent.includes('disabled={processing}')) {
  posContent = posContent.replace(oldButtons, newButtons);
}


// 2. Inject Quick Complete Modal and Detail Modal before ManageCategoriesModal
const modalsAnchor = `{
        showManageCategories && (`;

const newModals = `{/* Quick Complete Modal */}
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
      
      {/* Detail View Modal */}
      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
      
      {
        showManageCategories && (`;

if (!posContent.includes('Quick Complete Modal')) {
  posContent = posContent.replace(modalsAnchor, newModals);
}


fs.writeFileSync(posPath, posContent, 'utf8');
console.log("Successfully added modal renders and fixed processing states!");
