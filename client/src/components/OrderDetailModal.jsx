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

  const handlePrint = () => {
    const now = new Date(order.created_at)
    const itemRows = order.items.map((item, index) => `
      <div class="row">
        <span class="item-name">${index + 1}. ${item.item_name || item.name}</span>
        <span class="item-qty">${item.qty}</span>
        <span class="item-price">${CURRENCY}${parseFloat((item.unit_price || item.price) * item.qty).toFixed(2)}</span>
      </div>`).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>SAUCY BITE Receipt</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-weight: bold; }
    body {
      width: 100%;
      font-family: Tahoma, Geneva, sans-serif;
      font-size: 12px;
      color: #000;
      background: #fff;
      padding: 2px 10px 6px 15px;
    }
    .center { text-align: center; }
    h2 { font-size: 14px; font-weight: bold; margin-bottom: 4px; }
    .sub { font-size: 11px; color: #000; margin-bottom: 2px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 12px; }
    .item-name { flex: 2; margin-right: 2px; word-break: break-word; }
    .item-qty { width: 30px; text-align: center; margin-right: 2px; }
    .item-price { flex: 1.2; text-align: right; white-space: nowrap; overflow: hidden; }
    .total-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0; margin: 4px 0; }
    .footer { margin-top: 8px; font-size: 11px; color: #000; }
    .dotted { border-top: 1px dotted #000; margin: 6px 0; }
  </style>
</head>
<body>
  <div class="center">
    <img src="${logo}" style="width: 50%; max-height: 100px; object-fit: contain; margin-top: 0; margin-bottom: 2px;" />
    <p style="font-size: 11px; margin: 6px 0; padding: 4px; border: 1px dashed #000; font-weight: bold; text-align: center;">
      This slip is only for order taking.<br>Please pick up your original slip from counter.<br>
      <span style="font-size: 13px; font-weight: bold; margin-top: 4px; display: block;" dir="rtl">هذا الإيصال لأخذ الطلبات فقط. يرجى استلام الإيصال الأصلي من الكاونتر.</span>
    </p>
    <div style="font-size: 14px; font-weight: 700; margin-bottom: 2px;">Opening Time</div>
    <div style="font-size: 14px; font-weight: 700; margin-bottom: 2px;">11 AM to 1 AM</div>
    <div style="font-size: 16px; font-weight: 900; margin: 6px 0;">
      ${order.order_type || (order.customer_address?.startsWith('Table ') ? 'Dine-In' : order.customer_address === 'Takeaway' ? 'Takeaway' : order.customer_address === 'Dine-In' ? 'Dine-In' : 'Delivery')}
    </div>
    <div style="margin: 10px 0; font-size: 18px; font-weight: 900;">
      Order #${order.id} - ${order.edit_count > 0 ? `Edit ${(order.slip_number || '-')}${String.fromCharCode(64 + order.edit_count)}` : (order.slip_number || '-')}
    </div>
    <p class="sub">${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
  </div>
  ${order.customer_name || order.customer_phone || (order.customer_address && order.customer_address !== 'Dine-In' && order.customer_address !== 'Takeaway') ? `
  <div class="divider"></div>
  <div style="text-align: left; font-size: 11px;">
    ${order.customer_name ? `<p style="margin: 2px 0;"><strong>Customer:</strong> ${order.customer_name}</p>` : ''}
    ${order.customer_phone ? `<p style="margin: 2px 0;"><strong>Phone:</strong> ${order.customer_phone}</p>` : ''}
    ${order.customer_address && order.customer_address !== 'Dine-In' && order.customer_address !== 'Takeaway' ? `<p style="margin: 2px 0;"><strong>${order.customer_address.startsWith('Table ') ? 'Table Number:' : 'Address:'}</strong> ${order.customer_address.startsWith('Table ') ? order.customer_address.replace('Table ', '') : order.customer_address}</p>` : ''}
  </div>
  ` : ''}
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
  <div class="total-row"><span>Payment Status</span><span>${order.status}</span></div>
  <div class="dotted"></div>
  <div class="center footer">
    <p>Thank you for your order!</p>
    <p>Come back soon 🍕</p>
    <p>${BRAND_RECEIPT_FOOTER}</p>
    <p style="margin-top:6px;">📞 ${BRAND_PHONE_DISPLAY}</p>
    <p>📧 ${BRAND_EMAIL}</p>
    <p>📍 ${BRAND_ADDRESS}</p>
  </div>
  <div class="dotted"></div>
  <div class="center footer" style="margin-top:4px;font-size:11px;font-weight:bold;color:#000000;">
    <p>Software by Uzair</p>
    <p>03062951312</p>
  </div>
</body>
</html>`

    const w = 400, h = 600
    const left = Math.round((window.screen.width - w) / 2)
    const top = Math.round((window.screen.height - h) / 2)
    const win = window.open('', '_blank', `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`)
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
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
          <div style={{ background: 'white', padding: '2px 20px 6px 5px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontFamily: 'monospace', color: '#333', fontSize: 13, width: '70mm', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img src={logo} alt="Logo" style={{ width: '50%', maxHeight: 80, objectFit: 'contain', marginTop: 0, marginBottom: 2 }} />
              <p style={{ margin: '4px 0', fontSize: 11 }}>{BRAND_ADDRESS}</p>
              <p style={{ margin: '4px 0', fontSize: 11 }}>Free Home Delivery</p>
              <p style={{ margin: '4px 0', fontSize: 11 }}>Opening Time</p>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>11 AM to 1 AM</div>
              <div style={{ fontSize: 16, fontWeight: 900, margin: '6px auto' }}>
                {order.order_type || (order.customer_address?.startsWith('Table ') ? 'Dine-In' : order.customer_address === 'Takeaway' ? 'Takeaway' : order.customer_address === 'Dine-In' ? 'Dine-In' : 'Delivery')}
              </div>
              <div style={{ margin: '10px 0', fontSize: 18, fontWeight: 900 }}>
                Order #{order.id} - {order.edit_count > 0 ? `Edit ${(order.slip_number || '-')}${String.fromCharCode(64 + order.edit_count)}` : (order.slip_number || '-')}
              </div>
              <p style={{ margin: '4px 0', fontSize: 11, color: '#666' }}>{new Date(order.created_at).toLocaleString()}</p>
            </div>

            {/* Customer Info */}
            {(order.customer_name || order.customer_phone || (order.customer_address && order.customer_address !== 'Dine-In' && order.customer_address !== 'Takeaway')) && (
              <div style={{ marginBottom: 15, borderTop: '1px dashed #ddd', paddingTop: 12 }}>
                {order.customer_name && <p style={{ margin: '2px 0' }}><b>Customer:</b> {order.customer_name}</p>}
                {order.customer_phone && <p style={{ margin: '2px 0' }}><b>Phone:</b> {order.customer_phone}</p>}
                {order.customer_address && order.customer_address !== 'Dine-In' && order.customer_address !== 'Takeaway' && (
                  <p style={{ margin: '2px 0' }}><b>{order.customer_address.startsWith('Table ') ? 'Table Number:' : 'Address:'}</b> {order.customer_address.startsWith('Table ') ? order.customer_address.replace('Table ', '') : order.customer_address}</p>
                )}
              </div>
            )}

            <div style={{ borderTop: '1px solid #333', borderBottom: '1px solid #333', padding: '8px 0', display: 'flex', fontWeight: 'bold', marginBottom: 10 }}>
              <span style={{ flex: 2 }}>Item</span>
              <span style={{ width: 30, textAlign: 'center' }}>QTY</span>
              <span style={{ flex: 1.2, textAlign: 'right' }}>Amount</span>
            </div>

            {order.items?.map((item, i) => (
              <div key={i} style={{ display: 'flex', marginBottom: 8 }}>
                <span style={{ flex: 2, wordBreak: 'break-word' }}>${i + 1}. {item.item_name || item.name}</span>
                <span style={{ width: 30, textAlign: 'center' }}>{item.qty}</span>
                <span style={{ flex: 1.2, textAlign: 'right' }}>{CURRENCY}{parseFloat((item.unit_price || item.price) * item.qty).toFixed(2)}</span>
              </div>
            ))}

            <div style={{ borderTop: '1px dashed #ccc', margin: '15px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Subtotal</span>
              <span>{CURRENCY}{parseFloat(order.subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(order.discount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--red)', marginBottom: 4 }}>
                <span>Discount</span>
                <span>-{CURRENCY}{parseFloat(order.discount).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 16, borderTop: '2px solid #333', marginTop: 10, paddingTop: 10 }}>
              <span>TOTAL</span>
              <span>{CURRENCY}{parseFloat(order.grand_total).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#666' }}>
              <span>Payment Status</span>
              <span style={{ fontWeight: 'bold', color: order.status === 'Hold' ? 'orange' : 'green' }}>{order.status}</span>
            </div>

            {/* Edit History Section - Visible only in UI, not printed */}
            {order.edit_history && Array.isArray(order.edit_history) && order.edit_history.length > 0 && (
              <div style={{ marginTop: 20, borderTop: '2px dashed #ddd', paddingTop: 10 }}>
                <h4 style={{ fontSize: 14, marginBottom: 8, textAlign: 'center', color: '#444' }}>Edit History</h4>
                {order.edit_history.map((edit, idx) => (
                  <div key={idx} style={{ marginBottom: 12, fontSize: 11, background: '#fcfcfc', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontWeight: 'bold', borderBottom: '1px solid #ddd', paddingBottom: 4 }}>
                      <span>Edited By: {edit.edited_by || 'Unknown'}</span>
                      <span style={{ color: '#666' }}>{new Date(edit.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {edit.changes && edit.changes.map((change, cidx) => (
                      <div key={cidx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        {change.type === 'added' && (
                          <>
                            <span style={{ color: 'var(--green)' }}>{change.name}</span>
                            <span style={{ color: 'var(--green)', fontWeight: 'bold', fontSize: 10, border: '1px solid var(--green)', padding: '0 4px', borderRadius: 2 }}>+ {change.qty} New</span>
                          </>
                        )}
                        {change.type === 'removed' && (
                          <>
                            <span style={{ color: 'var(--red)', textDecoration: 'line-through' }}>{change.name}</span>
                            <span style={{ color: 'var(--red)', fontWeight: 'bold' }}>Removed (-{change.qty})</span>
                          </>
                        )}
                        {change.type === 'decreased' && (
                          <>
                            <span style={{ color: 'var(--red)' }}>{change.name}</span>
                            <span style={{ color: 'var(--red)', fontWeight: 'bold' }}>Minus (-{change.diffQty})</span>
                          </>
                        )}
                        {change.type === 'increased' && (
                          <>
                            <span style={{ color: 'var(--green)' }}>{change.name}</span>
                            <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>Added (+{change.diffQty})</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
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
