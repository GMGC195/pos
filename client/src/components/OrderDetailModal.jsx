import { Printer, X, Edit } from 'lucide-react'
import { CURRENCY } from '../config'
import {
  BRAND_SLIP_LOGO as logo,
  BRAND_NAME,
  BRAND_RECEIPT_FOOTER,
  BRAND_PHONE_DISPLAY,
  BRAND_EMAIL,
  BRAND_ADDRESS
} from '../branding'

export default function OrderDetailModal({ order, onClose, onEdit }) {
  if (!order) return null

  const now = new Date(order.created_at)
  const orderType = order.order_type || (order.customer_address?.startsWith('Table ') ? 'Dine-In' : order.customer_address === 'Takeaway' ? 'Takeaway' : order.customer_address === 'Dine-In' ? 'Dine-In' : 'Delivery');
  const tableNum = order.table_number || (order.customer_address?.startsWith('Table ') ? order.customer_address.replace('Table ', '') : '');

  const taker = order.order_taker || 'Guest';
  const comment = order.comments || '';
  const metaRowParts = [];
  if (orderType === 'Dine-In' && tableNum) metaRowParts.push(`Table ${String(tableNum).replace(/^Table\s*/i, '')}`);
  if (taker) metaRowParts.push(`By: ${taker}`);
  if (comment) metaRowParts.push(`Note: ${comment}`);
  const metaRow = metaRowParts.length > 0 ? `<div style="font-size: 12px; font-weight: bold; margin: 2px 0; text-align: center;">${metaRowParts.join(' | ')}</div>` : '';

  let itemRows = '';
  let isDiffPrint = false;

  if (order.edit_count > 0 && order.edit_history && order.edit_history.length > 0) {
    const lastEdit = order.edit_history[order.edit_history.length - 1];
    isDiffPrint = true;
    let diffIdx = 1;

    lastEdit.changes.forEach(change => {
        let printQty = change.qty || change.diffQty || 0;
        let printName = change.name;
        let itemPrice = 0;
        const foundItem = order.items.find(i => (i.item_name || i.name) === printName);
        if (foundItem) itemPrice = parseFloat(foundItem.unit_price || foundItem.price) || 0;

        if (change.type === 'added' || change.type === 'increased') {
          itemRows += `
            <div class="row">
              <span class="item-name">${diffIdx++}. ${printName}</span>
              <span class="item-qty">${printQty}</span>
              <span class="item-price">${CURRENCY}${(itemPrice * printQty).toFixed(2)}</span>
            </div>
          `;
        } else if (change.type === 'removed' || change.type === 'decreased') {
          itemRows += `
            <div class="row" style="text-decoration: line-through; color: #555;">
              <span class="item-name">${diffIdx++}. ${printName}</span>
              <span class="item-qty">${printQty}</span>
              <span class="item-price">${CURRENCY}${(itemPrice * printQty).toFixed(2)}</span>
            </div>
          `;
        }
    });
  }

  if (!isDiffPrint) {
    itemRows = order.items.map((item, index) => `
      <div class="row">
        <span class="item-name">${index + 1}. ${item.item_name || item.name}</span>
        <span class="item-qty">${item.qty}</span>
        <span class="item-price">${CURRENCY}${parseFloat((item.unit_price || item.price) * item.qty).toFixed(2)}</span>
      </div>`).join('');
  }

  // Define the raw HTML body (without HTML wrapper for inline rendering)
  const slipBody = `
<div class="center">
  <div style="font-size: 14px; font-weight: 900; margin: 2px 0;">
    ${orderType}
  </div>
  <div style="font-size: 12px; font-weight: bold; margin: 2px 0; text-align: center;">
    ${order.branch || 'Branch 1'}
  </div>
  <div style="font-size: 10px; text-align: center; margin: 4px 0; font-weight: normal;">
    Kitchen slip. Please get original slip from counter.<br/>
    إيصال المطبخ. يرجى الحصول على الإيصال الأصلي من الكاونتر.
  </div>
  ${metaRow}
  <div style="margin: 2px 0; font-size: 14px; font-weight: 900;">
    Order #${order.id} - ${order.edit_count > 0 ? `Edit ${(order.slip_number || '-')}${String.fromCharCode(64 + order.edit_count)}` : (order.slip_number || '-')}
  </div>
  <p class="sub" style="margin-bottom: 2px; font-size: 10px;">${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
</div>
<div class="divider"></div>
<div class="row" style="font-weight:bold;">
  <span class="item-name">Item</span>
  <span class="item-qty">QTY</span>
  <span class="item-price">Amount</span>
</div>
<div class="divider"></div>
${itemRows}
<div class="divider"></div>
<div class="total-row"><span>Total Items</span><span>${order.items.reduce((s, c) => s + c.qty, 0)}</span></div>
<div class="total-row"><span>Subtotal</span><span>${CURRENCY}${parseFloat(order.subtotal).toFixed(2)}</span></div>
${parseFloat(order.discount || 0) > 0 ? `<div class="total-row"><span>Discount</span><span>-${CURRENCY}${parseFloat(order.discount).toFixed(2)}</span></div>` : ''}
<div class="total-row grand"><span>TOTAL</span><span>${CURRENCY}${parseFloat(order.grand_total).toFixed(2)}</span></div>
<div class="total-row"><span>Payment</span><span>${order.status === 'Hold' ? 'Hold (Pending)' : order.payment_method || order.status}</span></div>
  `;

  const htmlWrapper = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Kitchen Slip</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-weight: bold; }
    body {
      width: 100%;
      font-family: Tahoma, Geneva, sans-serif;
      font-size: 12px;
      color: #000;
      background: #fff;
      padding: 0 15mm 4px 15px;
      margin-right: 10mm;
    }
    .center { text-align: center; }
    .divider { border-top: 1px dashed #000; margin: 4px 0; } /* Reduced margin */
    .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 12px; }
    .item-name { flex: 2; margin-right: 2px; word-break: break-word; }
    .item-qty { width: 30px; text-align: center; margin-right: 2px; }
    .item-price { flex: 1.2; text-align: right; white-space: nowrap; overflow: hidden; }
    .total-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0; margin: 4px 0; }
  </style>
</head>
<body>
${slipBody}
</body>
</html>`;

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(htmlWrapper);
    iframe.contentDocument.close();
    
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { document.body.removeChild(iframe); }, 1000);
    }, 500);
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose() }}>
      <div className="modal" style={{ maxWidth: 400, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh', boxSizing: 'border-box' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Order Details</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}><X size={20} /></button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', background: '#fcfcfc', flex: 1 }}>
          {/* Thermal Style Receipt Content */}
          <div 
            style={{ 
              background: 'white', 
              padding: '10px 10px 6px 15px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)', 
              fontFamily: 'Tahoma, Geneva, sans-serif', 
              color: '#000', 
              fontSize: 12, 
              width: '80mm', 
              margin: '0 auto',
              boxSizing: 'border-box'
            }}
          >
            {/* Inject the exact HTML we use for printing, plus custom CSS for the preview context */}
            <style>
              {`
                .preview-slip * { box-sizing: border-box; margin: 0; padding: 0; font-weight: bold; }
                .preview-slip .center { text-align: center; }
                .preview-slip .divider { border-top: 1px dashed #000; margin: 4px 0; }
                .preview-slip .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 12px; }
                .preview-slip .item-name { flex: 2; margin-right: 2px; word-break: break-word; }
                .preview-slip .item-qty { width: 30px; text-align: center; margin-right: 2px; }
                .preview-slip .item-price { flex: 1.2; text-align: right; white-space: nowrap; overflow: hidden; }
                .preview-slip .total-row { display: flex; justify-content: space-between; padding: 2px 0; }
                .preview-slip .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0; margin: 4px 0; }
              `}
            </style>
            <div className="preview-slip" dangerouslySetInnerHTML={{ __html: slipBody }} />
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--surface-2)', display: 'flex', gap: 10, background: 'white', flexShrink: 0, alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Close">
            <X size={20} />
          </button>
          {onEdit && (
            <button className="btn btn-secondary" onClick={() => onEdit(order.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Edit size={18} /> Edit
            </button>
          )}
          <button className="btn btn-primary" onClick={handlePrint} style={{ flex: onEdit ? 1 : 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Printer size={18} /> {onEdit ? 'Print' : 'Print Receipt'}
          </button>
        </div>
      </div>
    </div >
  )
}
