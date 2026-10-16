import { useState } from 'react'
import { Printer, X, Edit } from 'lucide-react'
import axios from '../api'
import toast from 'react-hot-toast'
import { CURRENCY } from '../config'
import {
  BRAND_SLIP_LOGO as logo,
  BRAND_NAME,
  BRAND_RECEIPT_FOOTER,
  BRAND_PHONE_DISPLAY,
  BRAND_EMAIL,
  BRAND_ADDRESS
} from '../branding'
import { useAuth } from '../contexts/AuthContext'

export default function OrderDetailModal({ order, onClose, onEdit }) {
  const { user } = useAuth();
  const isManagement = user?.role?.trim().toLowerCase() === 'management';
  const [isPrinting, setIsPrinting] = useState(false);
  const [showKitchenModal, setShowKitchenModal] = useState(false);
  
  if (!order) return null

  const now = new Date(order.created_at)
  const orderType = order.order_type || (order.customer_address?.startsWith('Table ') ? 'Dine-In' : order.customer_address === 'Takeaway' ? 'Takeaway' : order.customer_address === 'Dine-In' ? 'Dine-In' : 'Delivery');
  const tableNum = order.table_number || (order.customer_address?.startsWith('Table ') ? order.customer_address.replace('Table ', '') : '');

  const taker = order.order_taker || 'Guest';
  const completedBy = order.completed_by || (order.status === 'Completed' ? taker : null);
  const comment = order.comments || '';

  const metaRowParts = [];
  if (orderType === 'Dine-In' && tableNum) metaRowParts.push(`Table ${String(tableNum).replace(/^Table\s*/i, '')}`);
  if (taker) metaRowParts.push(`Placed: ${taker}`);
  if (completedBy) metaRowParts.push(`Completed: ${completedBy}`);
  if (comment) metaRowParts.push(`Note: ${comment}`);
  const metaRow = metaRowParts.length > 0 ? `<div style="font-size: 11px; font-weight: bold; margin: 2px 0; text-align: center;">${metaRowParts.join(' | ')}</div>` : '';

  // Parse edit history safely
  let editHistory = [];
  if (Array.isArray(order.edit_history)) {
    editHistory = order.edit_history;
  } else if (typeof order.edit_history === 'string') {
    try { editHistory = JSON.parse(order.edit_history); } catch (e) { editHistory = []; }
  }
  const lastEdit = editHistory.length > 0 ? editHistory[editHistory.length - 1] : null;
  const displayEditReason = (order.edit_reason || lastEdit?.reason || '').trim();

  // Compile full items list (Active items + Cancelled items)
  const fullItemsList = [];
  const activeItems = (order.items || []).map(i => ({
    name: i.item_name || i.name,
    qty: i.qty,
    price: parseFloat(i.unit_price || i.price || 0),
    isNew: false,
    isCancelled: false
  }));

  // Track items added during edits
  const addedNames = new Set();
  const cancelledItems = [];

  editHistory.forEach(edit => {
    if (Array.isArray(edit.changes)) {
      edit.changes.forEach(change => {
        if (change.type === 'added' || change.type === 'increased') {
          addedNames.add((change.name || '').trim().toLowerCase());
        } else if (change.type === 'removed' || change.type === 'decreased') {
          const cancelQty = change.qty || change.diffQty || 0;
          if (cancelQty > 0) {
            cancelledItems.push({
              name: change.name,
              qty: cancelQty,
              price: parseFloat(change.unit_price || change.price || 0),
              isCancelled: true,
              isNew: false
            });
          }
        }
      });
    }
  });

  // Mark active items as new if added during an edit
  activeItems.forEach(item => {
    if (addedNames.has((item.name || '').trim().toLowerCase()) && (order.edit_count > 0 || editHistory.length > 0)) {
      item.isNew = true;
    }
    fullItemsList.push(item);
  });

  // Append cancelled items to the full list
  cancelledItems.forEach(item => {
    fullItemsList.push(item);
  });

  let itemRows = '';
  let idx = 1;
  fullItemsList.forEach(item => {
    if (item.isCancelled) {
      itemRows += `
        <div class="row" style="text-decoration: line-through; color: #dc2626; opacity: 0.85;">
          <span class="item-name">${idx++}. ${item.name} <span style="font-size: 9px; font-weight: bold; background: #fee2e2; color: #991b1b; padding: 1px 4px; border-radius: 3px; text-decoration: none; display: inline-block;">[CANCELLED]</span></span>
          <span class="item-qty">${item.qty}</span>
          <span class="item-price">${CURRENCY}${(item.price * item.qty).toFixed(2)}</span>
        </div>
      `;
    } else if (item.isNew) {
      itemRows += `
        <div class="row">
          <span class="item-name">${idx++}. ${item.name} <span style="font-size: 9px; font-weight: bold; color: #15803d; background: #dcfce7; padding: 1px 4px; border-radius: 3px; display: inline-block;">+NEW</span></span>
          <span class="item-qty">${item.qty}</span>
          <span class="item-price">${CURRENCY}${(item.price * item.qty).toFixed(2)}</span>
        </div>
      `;
    } else {
      itemRows += `
        <div class="row">
          <span class="item-name">${idx++}. ${item.name}</span>
          <span class="item-qty">${item.qty}</span>
          <span class="item-price">${CURRENCY}${(item.price * item.qty).toFixed(2)}</span>
        </div>
      `;
    }
  });

  const effectiveBranch = order.branch || 'Branch 1';
  let shortBranch = effectiveBranch;
  if (effectiveBranch === 'Branch 1') shortBranch = 'B1';
  else if (effectiveBranch === 'Branch 2') shortBranch = 'B2';
  else if (effectiveBranch === 'Branch 3') shortBranch = 'B3';

  // Define the raw HTML body (without HTML wrapper for inline rendering)
  const slipBody = `
<div class="center">
  <div style="font-size: 14px; font-weight: 900; margin: 2px 0;">
    ${shortBranch} - ${orderType}
  </div>
    <div style="font-size: 10px; text-align: center; margin: 4px 0;">
      Kitchen slip. Please get original slip from counter.<br/>
      إيصال المطبخ. يرجى الحصول على الإيصال الأصلي من الكاونتر.
    </div>
  ${metaRow}
  <div style="margin: 2px 0; font-size: 14px; font-weight: 900;">
    Order #${order.id} - ${order.edit_count > 0 ? `Edit ${(order.slip_number || '-')}${String.fromCharCode(64 + order.edit_count)}` : (order.slip_number || '-')}
  </div>
  ${displayEditReason ? `<div style="font-size: 11px; font-weight: bold; margin: 2px 0; color: #1e3a8a; background: #f0fdf4; padding: 2px 4px; border-radius: 3px;">Edit Reason: ${displayEditReason}</div>` : ''}
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
<div class="total-row"><span>Active Items</span><span>${(order.items || []).reduce((s, c) => s + c.qty, 0)}</span></div>
<div class="total-row"><span>Subtotal</span><span>${CURRENCY}${parseFloat(order.subtotal).toFixed(2)}</span></div>
${parseFloat(order.discount || 0) > 0 ? `<div class="total-row"><span>Discount</span><span>-${CURRENCY}${parseFloat(order.discount).toFixed(2)}</span></div>` : ''}
<div class="total-row grand"><span>TOTAL</span><span>${CURRENCY}${parseFloat(order.grand_total).toFixed(2)}</span></div>
<div class="total-row"><span>Payment</span><span>${order.status === 'Hold' ? 'Hold (Pending)' : (order.payment_method ? order.payment_method + ' - ' + order.status : order.status)}</span></div>
  `;

  const htmlWrapper = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Kitchen Slip</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-weight: normal; }
    html { margin: 0; padding: 0; background: #fff; }
    body {
      width: 100%;
      font-weight: normal;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: #000;
      background: #fff;
      padding: 0 25px 0 5px; /* Added 20px to the right as requested */
      margin: 0;
    }
    .center { text-align: center; }
    h2 { font-size: 14px; font-weight: normal; margin-bottom: 4px; }
    .sub { font-size: 11px; color: #000; margin-bottom: 2px; }
    .divider {
      border-top: 1px dashed #000;
      margin: 4px 0; /* Reduced margin */
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      font-size: 12px;
    }
    .item-name {
      flex: 2;
      margin-right: 2px;
      word-break: break-word;
    }
    .item-qty {
      width: 30px;
      text-align: center;
      margin-right: 2px;
    }
    .item-price { 
      flex: 1.2;
      text-align: right; 
      white-space: nowrap; 
      overflow: hidden;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }
    .grand {
      font-size: 16px;
      font-weight: bold;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 4px 0;
      margin: 4px 0;
    }
    .footer { margin-top: 4px; margin-bottom: 0; font-size: 11px; color: #000; }
    .dotted { border-top: 1px dotted #000; margin: 4px 0; }
  </style>
</head>
<body>
${slipBody}
</body>
</html>`;

  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);

    try {
      const printMode = localStorage.getItem('printMode') || 'standard';
      const isCloudPrint = printMode === 'cloud';
      
      if (isCloudPrint) {
        const printerIp = localStorage.getItem('printerIp') || '127.0.0.1';
        await axios.post(`/api/orders/${order.id}/reprint`, { printerIp });
        setShowKitchenModal(true);
        setTimeout(() => {
          setShowKitchenModal(false);
          setIsPrinting(false);
          onClose();
        }, 1500);
        return;
      }
    } catch (err) {
      console.error('Failed to check or trigger cloud reprint:', err);
    }

    // Fallback to traditional local printing
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(htmlWrapper);
    iframe.contentDocument.close();
    
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { 
        document.body.removeChild(iframe); 
        setIsPrinting(false);
        onClose();
      }, 1000);
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
          {order.status === 'Cancelled' && order.cancel_reason && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '8px', marginBottom: '16px', color: '#991b1b', fontSize: '14px' }}>
              <div style={{ fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px' }}>⚠️</span> Order Cancelled
              </div>
              <div><strong>Reason:</strong> {order.cancel_reason}</div>
            </div>
          )}
          {(order.is_edited || displayEditReason || editHistory.length > 0) && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', color: '#1e40af', fontSize: '13px' }}>
              <div style={{ fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>✏️</span> Order Edited {order.edit_count > 0 ? `(${order.edit_count}x)` : ''}
                </span>
                {lastEdit?.edited_by && (
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>
                    By: {lastEdit.edited_by}
                  </span>
                )}
              </div>
              <div><strong>Reason:</strong> {displayEditReason || 'Order items updated'}</div>
              {editHistory.length > 1 && (
                <details style={{ marginTop: 8, fontSize: '12px', color: '#334155', cursor: 'pointer' }}>
                  <summary style={{ fontWeight: 600, outline: 'none' }}>View full edit history ({editHistory.length} edits)</summary>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {editHistory.map((h, i) => (
                      <div key={i} style={{ background: 'white', padding: '6px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                          <span>Edit #{i + 1} by {h.edited_by || 'Staff'}</span>
                          <span style={{ color: '#64748b' }}>{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {h.reason && <div style={{ color: '#1e293b', marginTop: 2 }}>Reason: {h.reason}</div>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
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
            <button className="btn btn-secondary" disabled={isManagement} onClick={() => { if (!isManagement) onEdit(order.id) }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: isManagement ? 'not-allowed' : 'pointer', opacity: isManagement ? 0.6 : 1 }}>
              <Edit size={18} /> Edit
            </button>
          )}
          <button className="btn btn-primary" onClick={handlePrint} disabled={isPrinting} style={{ flex: onEdit ? 1 : 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Printer size={18} /> {isPrinting ? 'Printing...' : (onEdit ? 'Print' : 'Print Receipt')}
          </button>
        </div>
      </div>
      {showKitchenModal && (
        <div className="modal-overlay" style={{ zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal" style={{ maxWidth: 350, textAlign: 'center', padding: '40px 20px', borderRadius: '16px' }}>
            <div style={{ width: 80, height: 80, background: '#10b981', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, margin: '0 auto 20px auto' }}>
              ✓
            </div>
            <h2 style={{ margin: '0 0 10px 0', fontSize: 22, color: '#333' }}>Successfully sent</h2>
            <p style={{ margin: 0, fontSize: 15, color: '#666' }}>Slip sent to kitchen</p>
          </div>
        </div>
      )}
    </div >
  )
}
