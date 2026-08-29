const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let content = fs.readFileSync(posPath, 'utf8');

// 1. Replace pos-right div content
const cartStart = content.indexOf('<div className="pos-right">');
const cartEndStr = `          </div>
        </div>
      </div>

      {/* Thermal Receipt - hidden, printing is done via printThermalSlip() popup */}`;
const cartEnd = content.indexOf(cartEndStr);

if (cartStart !== -1 && cartEnd !== -1) {
  const originalCart = content.substring(cartStart, cartEnd + 10);
  
  // We need to modify the cart to include the "Close Cart" button and remove Cash/Card buttons.
  // Also bring Hold and Complete Order into one row.
  let newCartInner = originalCart.replace('<div className="pos-right">', '<div className={`pos-right-inner ${showCart ? "cart-open" : "cart-closed"}`}>');
  
  // Add Close Cart button in cart-header
  newCartInner = newCartInner.replace(
    '<h3 style={{ display: \'flex\', alignItems: \'center\', gap: 8 }}>',
    '<h3 style={{ display: \'flex\', alignItems: \'center\', gap: 8 }}>\n              <button className="btn btn-sm btn-secondary" onClick={() => setShowCart(false)} style={{ padding: "4px 8px" }}><X size={16} /></button>'
  );

  // Remove Cash/Card buttons
  newCartInner = newCartInner.replace(
    /{?\['Cash', 'Card'\].map\(m => \(.*?\)\)}?/gs,
    ''
  );
  // Remove the div wrapper around payment method if it's empty
  newCartInner = newCartInner.replace(/<div style={{ padding: '0 20px 12px', display: 'flex', gap: 8 }}>\s*<\/div>/g, '');

  // Modify Actions block
  const oldActions = `<div className="cart-actions">
            <div className="cart-actions-row">
              <button className="btn btn-secondary" onClick={clearCart} style={{ gap: 6 }}><Trash2 size={16} /> Clear (Esc)</button>
              <button
                className={\`btn \${paymentMethod === 'Hold' ? 'btn-primary' : 'btn-warning'}\`}
                onClick={() => handlePayClick('Hold')}
                style={{ gap: 6 }}
              >
                <ClipboardList size={16} /> {paymentMethod === 'Hold' ? 'Hold Selected' : 'Hold'}
              </button>
            </div>
            <button
              className="btn btn-success btn-lg"
              style={{ justifyContent: 'center', gap: 6, marginBottom: '3px' }}
              onClick={() => handlePayClick()}
              disabled={cart.length === 0 || processing}
            >
              <CheckCircle2 size={20} /> Confirm Order (Enter)
            </button>
          </div>`;

  const newActions = `<div className="cart-actions">
            <div className="cart-actions-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <button className="btn btn-secondary" onClick={clearCart} style={{ gap: 6, justifyContent: 'center' }}><Trash2 size={16} /> Clear (Esc)</button>
              <button
                className={\`btn \${paymentMethod === 'Hold' ? 'btn-primary' : 'btn-warning'}\`}
                onClick={() => handlePayClick('Hold')}
                style={{ gap: 6, justifyContent: 'center' }}
              >
                <ClipboardList size={16} /> Hold
              </button>
            </div>
            <button
              className="btn btn-success btn-lg"
              style={{ justifyContent: 'center', gap: 6, width: '100%' }}
              onClick={() => handlePayClick('Cash')}
              disabled={cart.length === 0 || processing}
            >
              <CheckCircle2 size={20} /> Complete Order
            </button>
          </div>`;
          
  newCartInner = newCartInner.replace(oldActions, newActions);

  const activeOrdersPanel = `
        {/* Right Panel: Cart OR Active Orders */}
        <div className={\`pos-right \${showCart ? 'has-cart-open' : ''}\`}>
          {!showCart && (
            <div className="active-orders-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px 8px', alignItems: 'center' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  <ClipboardList size={20} /> Active Orders
                </h3>
                <button className="btn btn-primary" style={{ position: 'relative', borderRadius: '50%', width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCart(true)}>
                  <ShoppingCart size={20} />
                  {cart.reduce((s, c) => s + c.qty, 0) > 0 && <span className="cart-badge-dot">{cart.reduce((s, c) => s + c.qty, 0)}</span>}
                </button>
              </div>
              
              <div className="active-orders-list">
                {['Dine-In', 'Takeaway', 'Delivery'].map(type => {
                  const orders = activeOrders.filter(o => (o.order_type === type) || (!o.order_type && type === 'Delivery' && o.customer_address && !o.customer_address.startsWith('Table ')) || (!o.order_type && type === 'Dine-In' && o.customer_address?.startsWith('Table ')));
                  
                  return (
                    <div key={type} className="order-group">
                      <div className="order-group-header">
                        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {type === 'Dine-In' ? <CheckCircle2 size={16} /> : type === 'Takeaway' ? <ClipboardList size={16} /> : <ShoppingCart size={16}/>}
                          {type} Orders
                        </h4>
                        <span className="order-badge">{orders.length} {orders.length === 1 ? 'Order' : 'Orders'}</span>
                      </div>
                      
                      <div className="order-cards">
                        {orders.map(o => (
                          <div key={o.id} className="active-order-card">
                            <div className="order-head">
                              <span style={{ fontWeight: 800, color: 'var(--red)' }}>Order #{o.id} | {o.slip_number}</span>
                              <span style={{ fontWeight: 800, color: 'var(--red)' }}>{CURRENCY}{parseFloat(o.grand_total).toFixed(2)}</span>
                            </div>
                            <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>
                              {type === 'Dine-In' ? \`Table: \${o.table_number || (o.customer_address ? o.customer_address.replace('Table ', '') : '-')}\` : o.customer_name || 'Guest'} 
                              &nbsp;&nbsp;&nbsp;&nbsp; Taker: {o.order_taker || 'Admin'}
                            </div>
                            <div className="order-actions" style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm btn-secondary" onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}><Edit size={14}/></button>
                              <button className="btn btn-sm btn-secondary" style={{ flex: 1 }}>Detail View</button>
                              <button className="btn btn-sm btn-success" onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}>Complete</button>
                            </div>
                          </div>
                        ))}
                        {orders.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>No active {type} orders.</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          {showCart && (
            ${newCartInner.replace('<div className={`pos-right-inner ${showCart ? "cart-open" : "cart-closed"}`}>', '<div className="pos-right-inner cart-open">')}
          )}
`;

  content = content.replace(originalCart, activeOrdersPanel + '\n        </div>\n      </div>');
} else {
  console.error("Could not find cart div");
}

fs.writeFileSync(posPath, content, 'utf8');
console.log('Successfully updated pos-right');
