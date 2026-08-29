const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let content = fs.readFileSync(posPath, 'utf8');

// 1. Add state variable
if (!content.includes('const [expandedSections')) {
  content = content.replace(
    'const [activeOrders, setActiveOrders] = useState([])',
    `const [activeOrders, setActiveOrders] = useState([])
  const [expandedSections, setExpandedSections] = useState({ 'Dine-In': true, 'Takeaway': false, 'Delivery': false })
  
  const toggleSection = (type) => {
    if (type === 'Dine-In') return;
    setExpandedSections(prev => ({ ...prev, [type]: !prev[type] }));
  };

  useEffect(() => {
    setExpandedSections(prev => {
      let changed = false;
      const next = { ...prev };
      ['Takeaway', 'Delivery'].forEach(type => {
        const hasOrders = activeOrders.some(o => o.order_type === type);
        if (hasOrders && !prev[type]) {
          next[type] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [activeOrders]);`
  );
}

// 2. Modify Active Orders Panel
const activeOrdersPanelOld = `<div className="active-orders-list">
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
                      
                      <div className="order-cards">`;

const activeOrdersPanelNew = `<div className="active-orders-list" style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'hidden' }}>
                {['Dine-In', 'Takeaway', 'Delivery'].map(type => {
                  const orders = activeOrders.filter(o => (o.order_type === type) || (!o.order_type && type === 'Delivery' && o.customer_address && !o.customer_address.startsWith('Table ')) || (!o.order_type && type === 'Dine-In' && o.customer_address?.startsWith('Table ')));
                  const isExpanded = expandedSections[type];
                  
                  return (
                    <div key={type} className="order-group" style={{ display: 'flex', flexDirection: 'column', flex: type === 'Dine-In' ? 2 : (isExpanded ? 1 : 0), minHeight: isExpanded ? 0 : 'auto', transition: 'all 0.2s ease-in-out' }}>
                      <div className="order-group-header" onClick={() => type !== 'Dine-In' && toggleSection(type)} style={{ cursor: type !== 'Dine-In' ? 'pointer' : 'default' }}>
                        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {type === 'Dine-In' ? <CheckCircle2 size={16} /> : type === 'Takeaway' ? <ClipboardList size={16} /> : <ShoppingCart size={16}/>}
                          {type} Orders
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="order-badge">{orders.length} {orders.length === 1 ? 'Order' : 'Orders'}</span>
                          {type !== 'Dine-In' && (
                            <button className="btn btn-sm" style={{ background: 'transparent', padding: 4, color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); toggleSection(type); }}>
                              {isExpanded ? <X size={16} /> : <span style={{ fontSize: 11, fontWeight: 'bold', border: '1px solid var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>Open</span>}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {isExpanded && (
                      <div className="order-cards" style={{ overflowY: 'auto', flex: 1 }}>`;

content = content.replace(activeOrdersPanelOld, activeOrdersPanelNew);

// Find the end of the order group mapping to close the isExpanded conditional
const orderGroupEndOld = `                        ))}
                        {orders.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>No active {type} orders.</div>}
                      </div>
                    </div>
                  )
                })}`;
const orderGroupEndNew = `                        ))}
                        {orders.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>No active {type} orders.</div>}
                      </div>
                      )}
                    </div>
                  )
                })}`;
content = content.replace(orderGroupEndOld, orderGroupEndNew);

// 3. Confirm Modal Adjustments
// We will replace marginBottom: 8 with marginBottom: 6 globally in the modal-overlay portion
// and change the receipt preview layout.
const modalStartIdx = content.indexOf('<div className="modal-overlay"');
if (modalStartIdx !== -1) {
  let modalStr = content.substring(modalStartIdx);
  
  // Replace margins
  modalStr = modalStr.replace(/marginBottom: 8/g, 'marginBottom: 6');
  
  // Replace Receipt Preview layout
  const oldPreview = `<h4 style={{ marginBottom: 16 }}>Receipt Preview</h4>
                  <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8, fontFamily: 'Tahoma, Geneva, sans-serif', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: 8, borderBottom: '1px solid #ddd', paddingBottom: 4 }}>
                      <span style={{ flex: 2 }}>Item</span>
                      <span style={{ flex: 1, textAlign: 'center' }}>QTY</span>
                      <span style={{ flex: 1, textAlign: 'right' }}>Amount</span>
                    </div>
                    {cart.map((c, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ flex: 2, paddingRight: 4, wordBreak: 'break-word' }}>{i + 1}. {c.name}</span>
                        <span style={{ flex: 1, textAlign: 'center' }}>{c.qty}</span>
                        <span style={{ flex: 1, textAlign: 'right' }}>{(c.price * c.qty).toFixed(2)}</span>
                      </div>
                    ))}`;
                    
  const newPreview = `<h4 style={{ marginBottom: 10 }}>Receipt Preview</h4>
                  <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, fontFamily: 'Tahoma, Geneva, sans-serif', fontSize: 12, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 160px)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: 6, borderBottom: '1px solid #ddd', paddingBottom: 4, flexShrink: 0 }}>
                      <span style={{ flex: 2 }}>Item</span>
                      <span style={{ flex: 1, textAlign: 'center' }}>QTY</span>
                      <span style={{ flex: 1, textAlign: 'right' }}>Amount</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8, minHeight: 60 }}>
                      {cart.map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ flex: 2, paddingRight: 4, wordBreak: 'break-word' }}>{i + 1}. {c.name}</span>
                          <span style={{ flex: 1, textAlign: 'center' }}>{c.qty}</span>
                          <span style={{ flex: 1, textAlign: 'right' }}>{(c.price * c.qty).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>`;
  modalStr = modalStr.replace(oldPreview, newPreview);
  
  // Make the form smaller too
  modalStr = modalStr.replace(/<div className="modal" style={{ maxWidth: 750, width: '90%' }}>/, '<div className="modal" style={{ maxWidth: 700, width: "90%", padding: 20 }}>');
  modalStr = modalStr.replace(/padding: 16/g, 'padding: 12');
  modalStr = modalStr.replace(/gap: 16/g, 'gap: 12');
  modalStr = modalStr.replace(/marginBottom: 12/g, 'marginBottom: 6'); // if we have any left
  
  content = content.substring(0, modalStartIdx) + modalStr;
}

fs.writeFileSync(posPath, content, 'utf8');
console.log('Successfully updated POS layout tweaks');
