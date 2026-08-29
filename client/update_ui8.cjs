const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// 1. Add tableConflictData state
if (!posContent.includes('tableConflictData')) {
  posContent = posContent.replace(
    `const [activeOrders, setActiveOrders] = useState([])`,
    `const [activeOrders, setActiveOrders] = useState([])\n  const [tableConflictData, setTableConflictData] = useState(null)`
  );
}

// 2. Rename submitOrder to executeOrder and handle shouldPrint
if (posContent.includes('const submitOrder = async (method = paymentMethod) => {') && !posContent.includes('const executeOrder = async')) {
  posContent = posContent.replace(
    `const submitOrder = async (method = paymentMethod) => {`,
    `const executeOrder = async (method = paymentMethod, shouldPrint = true) => {`
  );
  
  // Update the print Thermal slip calls
  posContent = posContent.replace(
    `printThermalSlip(method, 'OFFLINE-' + orderData.client_order_id.slice(0, 8), '-')`,
    `if (shouldPrint) printThermalSlip(method, 'OFFLINE-' + orderData.client_order_id.slice(0, 8), '-')`
  );
  posContent = posContent.replace(
    `printThermalSlip(method, 'OFFLINE-' + orderData.client_order_id.slice(0, 8), '-')`,
    `if (shouldPrint) printThermalSlip(method, 'OFFLINE-' + orderData.client_order_id.slice(0, 8), '-')`
  );
  posContent = posContent.replace(
    `printThermalSlip(method, orderId, slipNumber)`,
    `if (shouldPrint) printThermalSlip(method, orderId, slipNumber)`
  );
  
  // Remove the old window.confirm logic from executeOrder
  const oldConfirmLogic = `    if (customerInfo.orderType === 'Dine-In' && customerInfo.tableNumber && method !== 'Hold') {
      const isTableBooked = activeOrders.some(o => o.order_type === 'Dine-In' && o.table_number === customerInfo.tableNumber && o.status === 'Hold' && o.id !== parseInt(editingOrderId));
      if (isTableBooked) {
        if (!window.confirm(\`Table \${customerInfo.tableNumber} is already booked. Do you want to place another order on it?\`)) {
          return;
        }
      }
    }`;
  posContent = posContent.replace(oldConfirmLogic, '');
}

// 3. Add handlePlaceOrder wrapper
if (!posContent.includes('const handlePlaceOrder =')) {
  const wrapper = `
  const handlePlaceOrder = (method = paymentMethod, shouldPrint = true) => {
    if (cart.length === 0) return
    if (customerInfo.orderType === 'Dine-In' && customerInfo.tableNumber && method !== 'Hold') {
      const isTableBooked = activeOrders.some(o => o.order_type === 'Dine-In' && o.table_number === customerInfo.tableNumber && o.status === 'Hold' && o.id !== parseInt(editingOrderId));
      if (isTableBooked) {
        setTableConflictData({ method, shouldPrint })
        return
      }
    }
    executeOrder(method, shouldPrint)
  }
`;
  posContent = posContent.replace('const executeOrder = async (method = paymentMethod, shouldPrint = true) => {', wrapper + '\n  const executeOrder = async (method = paymentMethod, shouldPrint = true) => {');
}

// 4. Update the Table Number label to show availability
const tableLabelOld = `<label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Table Number *</label>`;
const tableLabelNew = `<label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Table Number *</span>
                            {customerInfo.tableNumber && (
                              <span style={{ color: activeOrders.some(o => o.order_type === 'Dine-In' && o.table_number === customerInfo.tableNumber && o.status === 'Hold' && o.id !== parseInt(editingOrderId)) ? 'var(--red)' : 'var(--green)', fontWeight: 'bold' }}>
                                {activeOrders.some(o => o.order_type === 'Dine-In' && o.table_number === customerInfo.tableNumber && o.status === 'Hold' && o.id !== parseInt(editingOrderId)) ? 'Already Booked' : 'Available'}
                              </span>
                            )}
                          </label>`;
posContent = posContent.replace(tableLabelOld, tableLabelNew);

// 5. Update the Place Order buttons
const btnOld = `<div style={{ marginTop: 'auto', paddingTop: 8 }}>
                    <button className="btn btn-primary" style={{ width: '100%', fontSize: 16, padding: '10px 16px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => submitOrder(paymentMethod)} disabled={processing}>
                      {processing ? 'Processing...' : <><CheckCircle2 size={18} /> Place & Print (Enter)</>}
                    </button>
                  </div>`;
const btnNew = `<div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, padding: '12px 16px', fontSize: 15 }} onClick={() => handlePlaceOrder(paymentMethod, false)} disabled={processing}>
                      Punch Only
                    </button>
                    <button className="btn btn-primary" style={{ flex: 2, padding: '12px 16px', fontSize: 15 }} onClick={() => handlePlaceOrder(paymentMethod, true)} disabled={processing}>
                      {processing ? 'Processing...' : 'Print & Place Order'}
                    </button>
                  </div>`;
posContent = posContent.replace(btnOld, btnNew);

// 6. Append the TableConflictModal
const modalAppend = `{/* Table Conflict Modal */}
      {tableConflictData && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 400, padding: 24, textAlign: 'center' }}>
            <h3 style={{ color: 'var(--red)', marginBottom: 12 }}>Table Already Booked</h3>
            <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
              Table {customerInfo.tableNumber} already has an active order. Do you want to proceed and add another order to this table?
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setTableConflictData(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                executeOrder(tableConflictData.method, tableConflictData.shouldPrint)
                setTableConflictData(null)
              }}>Proceed</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Manage Categories Modal */}`;
posContent = posContent.replace(`{/* Manage Categories Modal */}`, modalAppend);

fs.writeFileSync(posPath, posContent, 'utf8');
console.log("Successfully added table validation and print toggles!");
