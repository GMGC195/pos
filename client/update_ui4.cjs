const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// 1. Active Orders Header tweaks
const activeHeaderOld = `<div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px 8px', alignItems: 'center' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  <ClipboardList size={20} /> Active Orders
                </h3>
                <button className="btn btn-primary" style={{ position: 'relative', borderRadius: '50%', width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCart(true)}>
                  <ShoppingCart size={20} />`;
const activeHeaderNew = `<div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px 4px', alignItems: 'center' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 15 }}>
                  <ClipboardList size={18} /> Active Orders
                </h4>
                <button className="btn btn-primary" style={{ position: 'relative', borderRadius: '50%', width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCart(true)}>
                  <ShoppingCart size={18} />`;
posContent = posContent.replace(activeHeaderOld, activeHeaderNew);

// 2. Order group header text size
const groupHeaderOld = `<h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {type === 'Dine-In' ? <CheckCircle2 size={16} /> : type === 'Takeaway' ? <ClipboardList size={16} /> : <ShoppingCart size={16}/>}
                          {type} Orders
                        </h4>`;
const groupHeaderNew = `<h5 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          {type === 'Dine-In' ? <CheckCircle2 size={14} /> : type === 'Takeaway' ? <ClipboardList size={14} /> : <ShoppingCart size={14}/>}
                          {type} Orders
                        </h5>`;
posContent = posContent.replace(groupHeaderOld, groupHeaderNew);


// Also remove the inline style gap/padding if we have it on .active-orders-list in POS.jsx
// It was: <div className="active-orders-list" style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'hidden' }}>
const listStyleOld = `<div className="active-orders-list" style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'hidden' }}>`;
const listStyleNew = `<div className="active-orders-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden', padding: '4px 12px 12px' }}>`;
posContent = posContent.replace(listStyleOld, listStyleNew);

fs.writeFileSync(posPath, posContent, 'utf8');
console.log('Successfully applied sizing tweaks');
