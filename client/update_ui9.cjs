const fs = require('fs');

// 1. Update index.css
const cssPath = 'd:/pos/pizza-shop/client/src/index.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');

cssContent = cssContent.replace(
`.order-cards {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}`,
`.order-cards {
  padding: 8px 2px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}`);

cssContent = cssContent.replace(
`.active-order-card {
  border: 1px solid var(--surface-2);
  border-radius: 8px;
  padding: 12px;
  background: white;
  transition: all 0.2s;
}`,
`.active-order-card {
  border: 1px solid var(--surface-2);
  border-radius: 6px;
  padding: 8px;
  background: white;
  transition: all 0.2s;
}`);

fs.writeFileSync(cssPath, cssContent, 'utf8');

// 2. Update POS.jsx
const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// Remove Active Orders header entirely
const headerOld = `          <div className="active-orders-panel">
              <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '12px 12px 4px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 13, fontWeight: 'bold' }}>
                  <ClipboardList size={16} /> Active Orders
                </div>
              </div>
              
              <div className="active-orders-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden', padding: '4px 12px 12px' }}>`;
const headerNew = `          <div className="active-orders-panel">
              <div className="active-orders-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflow: 'hidden', padding: '8px 12px 12px' }}>`;
posContent = posContent.replace(headerOld, headerNew);

// Shrink font sizes and margins inside the card
const cardOld = `<div className="order-head" style={{ marginBottom: 8 }}>
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
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>`;
const cardNew = `<div className="order-head" style={{ marginBottom: 4 }}>
                              <span style={{ fontWeight: 800, color: '#a22020', fontSize: 13 }}>Order #{o.id} | {o.slip_number}</span>
                              <span style={{ fontWeight: 800, color: '#a22020', fontSize: 13 }}>{CURRENCY}{parseFloat(o.grand_total).toFixed(2)}</span>
                            </div>
                            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                              {o.items ? o.items.map((i, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{i.qty}x {i.name}</span>
                                  <span>Rs.{(i.price ? parseFloat(i.price) * i.qty : 0).toFixed(2)}</span>
                                </div>
                              )) : 'No items'}
                            </div>
                            <div style={{ borderTop: '1px dashed #ccc', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.2 }}>`;
posContent = posContent.replace(cardOld, cardNew);

// Shrink buttons inside the card
const btnOld = `<div className="order-actions" style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-sm btn-secondary" style={{ padding: '4px 6px', background: 'transparent', border: '1px solid #ddd' }} onClick={() => loadOrderForEdit(o.id)} title="Edit"><Edit size={16} color="var(--text-muted)"/></button>
                                <button className="btn btn-sm btn-secondary" style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#f5f5f5', color: '#333' }} onClick={() => setDetailOrder(o)}>Detail View</button>
                                <button className="btn btn-sm btn-success" style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700 }} onClick={() => loadOrderForEdit(o.id)}>Complete</button>
                              </div>`;
const btnNew = `<div className="order-actions" style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-sm btn-secondary" style={{ padding: '2px 4px', background: 'transparent', border: '1px solid #ddd' }} onClick={() => loadOrderForEdit(o.id)} title="Edit"><Edit size={14} color="var(--text-muted)"/></button>
                                <button className="btn btn-sm btn-secondary" style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: '#f5f5f5', color: '#333' }} onClick={() => setDetailOrder(o)}>Detail View</button>
                                <button className="btn btn-sm btn-success" style={{ padding: '2px 10px', fontSize: 11, fontWeight: 700 }} onClick={() => loadOrderForEdit(o.id)}>Complete</button>
                              </div>`;
posContent = posContent.replace(btnOld, btnNew);

fs.writeFileSync(posPath, posContent, 'utf8');
console.log('Successfully applied sizing tweaks 9');
