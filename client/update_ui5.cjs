const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// 1. Shrink Active Orders Header
const activeHeaderOld = `<div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px 4px', alignItems: 'center' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 15 }}>
                  <ClipboardList size={18} /> Active Orders
                </h4>
                <button className="btn btn-primary" style={{ position: 'relative', borderRadius: '50%', width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCart(true)}>
                  <ShoppingCart size={18} />`;
const activeHeaderNew = `<div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px 2px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 12, fontWeight: 'bold' }}>
                  <ClipboardList size={14} /> Active Orders
                </div>
                <button className="btn btn-primary" style={{ position: 'relative', borderRadius: '50%', width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCart(true)}>
                  <ShoppingCart size={16} />`;
posContent = posContent.replace(activeHeaderOld, activeHeaderNew);

// 2. Add border-top to non-Dine-In groups
const groupOld = `<div key={type} className="order-group" style={{ display: 'flex', flexDirection: 'column', flex: isExpanded ? (type === 'Dine-In' ? 2 : 1) : 0, minHeight: isExpanded ? 0 : 'auto', transition: 'all 0.2s ease-in-out', flexShrink: 0 }}>`;
const groupNew = `<div key={type} className="order-group" style={{ display: 'flex', flexDirection: 'column', flex: isExpanded ? (type === 'Dine-In' ? 2 : 1) : 0, minHeight: isExpanded ? 0 : 'auto', transition: 'all 0.2s ease-in-out', flexShrink: 0, borderTop: type !== 'Dine-In' ? '1px dashed #ccc' : 'none', marginTop: type !== 'Dine-In' ? 4 : 0, paddingTop: type !== 'Dine-In' ? 4 : 0 }}>`;
posContent = posContent.replace(groupOld, groupNew);

// 3. Remove "Close" logic for Dine-in text? Wait, no, he just wanted Takeaway/Delivery to be visible.

fs.writeFileSync(posPath, posContent, 'utf8');
console.log('Successfully applied sizing tweaks 5');
