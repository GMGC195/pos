const fs = require('fs');

// 1. Update server/routes/orders.js to include items in GET /
const ordersPath = 'd:/pos/pizza-shop/server/routes/orders.js';
let ordersContent = fs.readFileSync(ordersPath, 'utf8');

const oldGetRoute = `// GET all orders with pagination
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      query += \` AND status = $\${params.length}\`;
    }

    query += \` ORDER BY created_at DESC LIMIT $\${params.length + 1}\`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`;

const newGetRoute = `// GET all orders with pagination
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let query = \`
      SELECT o.*, 
        (SELECT json_agg(json_build_object('name', oi.item_name, 'qty', oi.qty)) 
         FROM order_items oi WHERE oi.order_id = o.id) as items 
      FROM orders o WHERE 1=1
    \`;
    const params = [];

    if (status) {
      params.push(status);
      query += \` AND o.status = $\${params.length}\`;
    }

    query += \` ORDER BY o.created_at DESC LIMIT $\${params.length + 1}\`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`;

if (ordersContent.includes(oldGetRoute)) {
  ordersContent = ordersContent.replace(oldGetRoute, newGetRoute);
  fs.writeFileSync(ordersPath, ordersContent, 'utf8');
}


// 2. Update POS.jsx
const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// (a) Remove Clear from cart actions row and place it at the end of cart map.
// Remove existing Clear button:
posContent = posContent.replace(
  '<button className="btn btn-secondary" onClick={clearCart} style={{ gap: 6, justifyContent: \'center\' }}><Trash2 size={16} /> Clear (Esc)</button>',
  ''
);

// Add clear button to cart item list end:
const oldCartEnd = `                  <button className="remove-btn" onClick={() => updateQty(item.cartId, -item.qty)}>✕</button>
                </div>
              ))
            }
          </div>

          {/* Totals */}`;
const newCartEnd = `                  <button className="remove-btn" onClick={() => updateQty(item.cartId, -item.qty)}>✕</button>
                </div>
              ))
            }
            {cart.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button className="btn btn-sm btn-secondary" onClick={clearCart} style={{ gap: 4, padding: '4px 8px', fontSize: 12 }}>
                  <Trash2 size={14} /> Clear Cart
                </button>
              </div>
            )}
          </div>

          {/* Totals */}`;
posContent = posContent.replace(oldCartEnd, newCartEnd);

// (b) Make Hold and Complete in one row
const oldActions = `<div className="cart-actions-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              
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
            </button>`;

const newActions = `<div className="cart-actions-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%' }}>
              <button
                className={\`btn \${paymentMethod === 'Hold' ? 'btn-primary' : 'btn-warning'} btn-lg\`}
                onClick={() => handlePayClick('Hold')}
                style={{ gap: 6, justifyContent: 'center', padding: '12px 8px' }}
                disabled={cart.length === 0 || processing}
              >
                <ClipboardList size={18} /> Hold (Enter)
              </button>
              <button
                className="btn btn-success btn-lg"
                style={{ justifyContent: 'center', gap: 6, padding: '12px 8px' }}
                onClick={() => handlePayClick('Cash')}
                disabled={cart.length === 0 || processing}
              >
                <CheckCircle2 size={18} /> Complete Order
              </button>
            </div>`;
// The actual old action might have "Clear (Esc)" still in it if replace above failed, let's just do a regex
posContent = posContent.replace(/<div className="cart-actions-row"[\s\S]*?Complete Order[\s\S]*?<\/button>/, newActions);

// (c) Enter key triggers Hold instead of Complete Order
posContent = posContent.replace(
  /if \(e\.key === 'Enter'\) \{\s*e\.preventDefault\(\)\s*handlePayClick\(\)\s*\}/,
  `if (e.key === 'Enter') {
        e.preventDefault()
        handlePayClick('Hold')
      }`
);

// (d) Active Orders Panel changes
// Remove if (type === 'Dine-In') return;
posContent = posContent.replace(
  /if \(type === 'Dine-In'\) return;\s*/,
  ''
);

// Make Dine-In collapsible but still default to flex 2 when expanded? No, flex 2 was the request "poori space lay" (take full space).
// Just remove the block that restricted it.
posContent = posContent.replace(
  /type !== 'Dine-In' && toggleSection\(type\)/g,
  'toggleSection(type)'
);
posContent = posContent.replace(
  /cursor: type !== 'Dine-In' \? 'pointer' : 'default'/g,
  "cursor: 'pointer'"
);
// Make chevron show for Dine-In too
posContent = posContent.replace(
  /\{type !== 'Dine-In' && \(\s*<button className="btn btn-sm"[^>]+>\s*\{isExpanded \? <ChevronUp size=\{20\} \/> : <ChevronDown size=\{20\} \/>\}\s*<\/button>\s*\)\}/g,
  `<button className="btn btn-sm" style={{ background: 'transparent', padding: 4, color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); toggleSection(type); }}>
                              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </button>`
);

// Replace card details with item list and smaller buttons
const oldCardDetails = `<div style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>
                              {type === 'Dine-In' ? \`Table: \${o.table_number || (o.customer_address ? o.customer_address.replace('Table ', '') : '-')}\` : o.customer_name || 'Guest'} 
                              &nbsp;&nbsp;&nbsp;&nbsp; Taker: {o.order_taker || 'Admin'}
                            </div>
                            <div className="order-actions" style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm btn-secondary" onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}><Edit size={14}/></button>
                              <button className="btn btn-sm btn-secondary" style={{ flex: 1 }}>Detail View</button>
                              <button className="btn btn-sm btn-success" onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}>Complete</button>
                            </div>`;
                            
const newCardDetails = `<div style={{ fontSize: 13, marginBottom: 10, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                              {o.items ? o.items.map(i => \`\${i.name} x\${i.qty}\`).join(', ') : 'No items listed'}
                            </div>
                            <div className="order-actions" style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}><Edit size={14} style={{ marginRight: 4 }}/> Edit</button>
                              <button className="btn btn-sm btn-secondary" style={{ flex: 1, padding: '4px 8px', fontSize: 12 }} onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}>View Detail</button>
                              <button className="btn btn-sm btn-success" style={{ padding: '4px 12px', fontSize: 12, fontWeight: 'bold' }} onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}>Complete</button>
                            </div>`;
posContent = posContent.replace(oldCardDetails, newCardDetails);

// Reduce width of Subtotal and Total in Cart?
// In POS.jsx:
// <div className="cart-totals"> ... <div className="total-row"> ...
// Usually, we can just let it be, but they asked to reduce its width. Let's add padding to cart-totals to squeeze it.
posContent = posContent.replace(
  '<div className="cart-totals">',
  '<div className="cart-totals" style={{ padding: "16px 24px" }}>'
);


fs.writeFileSync(posPath, posContent, 'utf8');
console.log('Successfully applied POS tweaks 2');
