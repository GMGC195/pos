const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// 1. Add OrderDetailModal import
if (!posContent.includes('import OrderDetailModal')) {
  posContent = posContent.replace(
    `import ManageCategoriesModal from '../components/ManageCategoriesModal'`,
    `import ManageCategoriesModal from '../components/ManageCategoriesModal'
import OrderDetailModal from '../components/OrderDetailModal'`
  );
}

// 2. Add detailOrder state
if (!posContent.includes('detailOrder, setDetailOrder')) {
  posContent = posContent.replace(
    `const [activeOrders, setActiveOrders] = useState([])`,
    `const [activeOrders, setActiveOrders] = useState([])
  const [detailOrder, setDetailOrder] = useState(null)`
  );
}

// 3. Add loadOrderForEdit function
if (!posContent.includes('const loadOrderForEdit =')) {
  const loadOrderFn = `  const loadOrderForEdit = async (editId) => {
    try {
      const res = await axios.get(\`/api/orders/\${editId}\`)
      const order = res.data
      const loadedCart = order.items.map(item => ({
        id: item.item_id,
        cartId: item.cartId || item.item_id.toString(),
        name: item.item_name,
        price: parseFloat(item.unit_price),
        qty: item.qty
      }))
      setCart(loadedCart)
      setCustomerInfo({
        name: order.customer_name || '',
        phone: order.customer_phone || '',
        address: order.customer_address?.startsWith('Table ') ? '' : (order.customer_address || ''),
        discount: order.discount || '',
        orderType: order.order_type || (order.customer_address?.startsWith('Table ') ? 'Dine-In' : 'Delivery'),
        tableNumber: order.table_number || (order.customer_address?.startsWith('Table ') ? order.customer_address.replace('Table ', '') : ''),
        orderTaker: order.order_taker || '',
        comments: order.comments || ''
      })
      setEditingOrderId(editId)
      setShowCart(true)
      setPaymentMethod(order.status === 'Hold' ? 'Hold' : 'Cash')
    } catch (err) {
      console.error('Error loading order for edit:', err)
      toast.error('Failed to load order details')
    }
  }

  // Check for edit parameter in URL`;
  posContent = posContent.replace('  // Check for edit parameter in URL', loadOrderFn);
}

// 4. Update the Active Order Card layout
const oldCardBlock = `<div key={o.id} className="active-order-card">
                            <div className="order-head">
                              <span style={{ fontWeight: 800, color: 'var(--red)' }}>Order #{o.id} | {o.slip_number}</span>
                              <span style={{ fontWeight: 800, color: 'var(--red)' }}>{CURRENCY}{parseFloat(o.grand_total).toFixed(2)}</span>
                            </div>
                            <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                              {o.items ? o.items.map(i => \`\${i.name} x\${i.qty}\`).join(', ') : 'No items listed'}
                            </div>
                            <div className="order-actions" style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}><Edit size={14} style={{ marginRight: 4 }}/> Edit</button>
                              <button className="btn btn-sm btn-secondary" style={{ flex: 1, padding: '4px 8px', fontSize: 12 }} onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}>View Detail</button>
                              <button className="btn btn-sm btn-success" style={{ padding: '4px 12px', fontSize: 12, fontWeight: 'bold' }} onClick={() => window.location.href=\`/pos?edit=\${o.id}\`}>Complete</button>
                            </div>
                          </div>`;

const newCardBlock = `<div key={o.id} className="active-order-card">
                            <div className="order-head" style={{ marginBottom: 8 }}>
                              <span style={{ fontWeight: 800, color: '#a22020', fontSize: 15 }}>Order #{o.id} | {o.slip_number}</span>
                              <span style={{ fontWeight: 800, color: '#a22020', fontSize: 15 }}>{CURRENCY}{parseFloat(o.grand_total).toFixed(2)}</span>
                            </div>
                            <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                              {o.items ? o.items.map((i, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{i.qty}x {i.name}</span>
                                  <span>Rs.{(i.price ? parseFloat(i.price) * i.qty : 0).toFixed(2)}</span>
                                </div>
                              )) : 'No items'}
                            </div>
                            <div style={{ borderTop: '1px dashed var(--surface-2)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {type === 'Delivery' ? (
                                  <>{o.customer_name || 'Guest'} {o.customer_phone ? \` - \${o.customer_phone}\` : ''}</>
                                ) : type === 'Takeaway' ? (
                                  <>{o.customer_name || 'Guest'}</>
                                ) : (
                                  <>Table: {o.table_number || (o.customer_address ? o.customer_address.replace('Table ', '') : '-')} {o.customer_name && \` | \${o.customer_name}\`}</>
                                )}
                              </div>
                              <div className="order-actions" style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-sm btn-secondary" style={{ padding: '4px 6px', background: 'transparent', border: '1px solid #ddd' }} onClick={() => loadOrderForEdit(o.id)} title="Edit"><Edit size={16} color="var(--text-muted)"/></button>
                                <button className="btn btn-sm btn-secondary" style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#f5f5f5', color: '#333' }} onClick={() => setDetailOrder(o)}>Detail View</button>
                                <button className="btn btn-sm btn-success" style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700 }} onClick={() => loadOrderForEdit(o.id)}>Complete</button>
                              </div>
                            </div>
                          </div>`;
posContent = posContent.replace(oldCardBlock, newCardBlock);


// 5. Render OrderDetailModal at the end of the file
const modalPlaceholder = `{/* Manage Categories Modal */}`;
const modalRender = `{/* Order Detail Modal */}
      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
      
      {/* Manage Categories Modal */}`;
if (!posContent.includes('<OrderDetailModal')) {
  posContent = posContent.replace(modalPlaceholder, modalRender);
}

fs.writeFileSync(posPath, posContent, 'utf8');
console.log('Successfully updated Active Order cards and modals');
