import { useEffect, useState, useCallback, useRef } from 'react'
import axios from '../api'
import toast from 'react-hot-toast'
import { CURRENCY } from '../config'
import ManageCategoriesModal from '../components/ManageCategoriesModal'
import AddCategoryModal from '../components/AddCategoryModal'
import {
  Search,
  ShoppingCart,
  Trash2,
  ClipboardList,
  CheckCircle2,
  Banknote,
  CreditCard,
  MoreVertical,
  Wifi,
  WifiOff,
  RefreshCw
} from 'lucide-react'
import {
  savePendingOrder,
  getAllPendingOrders,
  removePendingOrder
} from '../utils/db'

import {
  BRAND_NAME,
  BRAND_LOGO as logo,
  BRAND_PHONE_DISPLAY,
  BRAND_RECEIPT_FOOTER
} from '../branding'

import { usePOS } from '../contexts/POSContext'

const TAX_RATE = 0

const parseSizeOpt = (str, defaultPrice) => {
  const numDefault = parseFloat(defaultPrice) || 0;
  if (typeof str !== 'string') return { name: '', price: numDefault };
  if (str.includes(':')) {
    const [name, p] = str.split(':');
    return { name, price: parseFloat(p) || 0 };
  }
  return { name: str, price: numDefault };
};

export default function POS() {
  const {
    categories,
    setCategories,
    items,
    setItems,
    cart,
    setCart,
    customerInfo,
    setCustomerInfo,
    loading,
    activeCategory,
    setActiveCategory,
    search,
    setSearch,
    clearCart
  } = usePOS()

  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [sizeModalItem, setSizeModalItem] = useState(null)
  const [sizeModalSelected, setSizeModalSelected] = useState(null)
  const [confirmModal, setConfirmModal] = useState(false)
  const [showManageCategories, setShowManageCategories] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const receiptRef = useRef(null)

  // Check for edit parameter in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const editId = params.get('edit')
    if (editId) {
      setEditingOrderId(editId)
      // Fetch order details to populate cart
      axios.get(`/api/orders/${editId}`)
        .then(res => {
          const order = res.data
          // Map order items to cart format
          const loadedCart = order.items.map(item => ({
            id: item.item_id,
            cartId: item.cartId || item.item_id.toString(), // We might need to handle size-based cartIds
            name: item.item_name,
            price: parseFloat(item.unit_price),
            qty: item.qty
          }))
          setCart(loadedCart)
          setCustomerInfo({
            name: order.customer_name || '',
            phone: order.customer_phone || '',
            address: order.customer_address || '',
            discount: order.discount || ''
          })
          setPaymentMethod(order.status === 'Hold' ? 'Hold' : 'Cash')
        })
        .catch(err => {
          console.error('Error loading order for edit:', err)
          toast.error('Failed to load order for editing')
        })
    }
  }, [])

  // Network status monitoring
  useEffect(() => {
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  // Sync pending orders when coming online
  useEffect(() => {
    if (isOnline) {
      syncPendingOrders()
    }
    // Update pending count
    getAllPendingOrders().then(orders => setPendingCount(orders.length))
  }, [isOnline])

  const syncPendingOrders = async () => {
    const orders = await getAllPendingOrders()
    if (orders.length === 0) return

    setSyncing(true)
    let successCount = 0
    for (const order of orders) {
      try {
        await axios.post('/api/orders', order)
        await removePendingOrder(order.client_order_id)
        successCount++
      } catch (err) {
        console.error('Failed to sync order:', order.client_order_id, err)
      }
    }
    if (successCount > 0) {
      toast.success(`Synced ${successCount} offline orders!`)
    }
    setSyncing(false)
    const remaining = await getAllPendingOrders()
    setPendingCount(remaining.length)
  }

  // Filter items locally based on activeCategory and search
  const filteredItems = items.filter(item => {
    const matchesCategory = activeCategory === 'All' || item.category_name === activeCategory || item.category === activeCategory;
    const matchesSearch = !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.category_name && item.category_name.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Cart computations
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0)
  const tax = subtotal * TAX_RATE
  const total = subtotal + tax

  const addToCart = useCallback((item, sizeOpt = null) => {
    setCart(prev => {
      let cartId = item.id.toString()
      let finalName = item.name
      let finalPrice = parseFloat(item.price)

      if (sizeOpt) {
        cartId = sizeOpt.name === 'Regular' ? item.id.toString() : `${item.id}-${sizeOpt.name}`
        finalName = sizeOpt.name === 'Regular' ? item.name : `${item.name} (${sizeOpt.name})`
        finalPrice = sizeOpt.price
      }

      const ex = prev.find(c => c.cartId === cartId)
      if (ex) return prev.map(c => c.cartId === cartId ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...item, cartId, name: finalName, price: finalPrice, qty: 1 }]
    })
  }, [])

  const updateQty = (cartId, delta) => {
    setCart(prev => prev
      .map(c => c.cartId === cartId ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0)
    )
  }

  // clearCart is now handled by POSContext

  const handlePayClick = (method = paymentMethod) => {
    if (cart.length === 0) return toast.error('Cart is empty!')
    setPaymentMethod(method)
    setConfirmModal(true)
  }

  const submitOrder = async (method = paymentMethod) => {
    if (cart.length === 0) return
    setProcessing(true)
    const finalDiscount = parseFloat(customerInfo.discount) || 0;
    const finalTotal = total - finalDiscount;

    try {
      const orderData = {
        items: cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price })),
        subtotal: parseFloat(subtotal.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        grand_total: parseFloat(finalTotal.toFixed(2)),
        payment_method: method,
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        customer_address: customerInfo.address,
        discount: finalDiscount,
        client_order_id: crypto.randomUUID()
      }

      let res;
      if (editingOrderId) {
        res = await axios.put(`/api/orders/${editingOrderId}`, orderData)
      } else {
        if (!isOnline) {
          // Offline mode
          await savePendingOrder(orderData)
          setPendingCount(prev => prev + 1)
          toast.success('Offline! Order saved locally and will sync when online.', { duration: 5000 })
          // We still "print" but it's offline
          printThermalSlip(method, 'OFFLINE-' + orderData.client_order_id.slice(0, 8), '-')
        } else {
          try {
            res = await axios.post('/api/orders', orderData)
          } catch (netErr) {
            // ONLY Save offline if it's a REAL network error (no response)
            // If the server responded with 500, it's a BUG, not an offline issue.
            if (!netErr.response) {
              console.error('Network error during order submission, saving offline:', netErr)
              await savePendingOrder(orderData)
              setPendingCount(prev => prev + 1)
              toast.error('Network Error! Order saved locally for later sync.')
              printThermalSlip(method, 'OFFLINE-' + orderData.client_order_id.slice(0, 8), '-')
              throw netErr
            } else {
              // Server error (500 etc) - do not save offline, just show error
              throw netErr
            }
          }
        }
      }

      const orderId = res?.data?.order?.id || editingOrderId || 'N/A'
      const slipNumber = res?.data?.order?.slip_number || '-'
      if (isOnline) {
        toast.success(method === 'Hold' ? 'Order updated to Hold status!' : 'Order Placed!', { duration: 3000 })
        printThermalSlip(method, orderId, slipNumber)
      }

      // Cleanup
      setCart([])
      setEditingOrderId(null)
      window.history.replaceState({}, '', '/pos')
      setPaymentMethod('Cash')
      setConfirmModal(false)
      setCustomerInfo({ name: '', phone: '', address: '', discount: '' })
    } catch (err) {
      if (isOnline) {
        console.error('Order failed:', err)
        toast.error('Order error: ' + (err?.response?.data?.error || err.message || 'Please try again'))
      } else {
        // Silently handle if we already saved offline
      }
    } finally {
      setProcessing(false)
    }
  }

  const printThermalSlip = (method, orderId, slipNumber) => {
    const now2 = new Date()
    const paymentLabel = method === 'Hold' ? 'Hold (Pending)' : method;
    const itemRows = cart.map((item, index) => `
      <div class="row">
        <span class="item-name">${index + 1}. ${item.name}</span>
        <span class="item-qty">${item.qty}</span>
        <span class="item-price">${CURRENCY}${parseFloat(item.price * item.qty).toFixed(2)}</span>
      </div>`).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${BRAND_NAME} Receipt</title>
  <style>
    /* 72mm thermal roll = ~272px printable area */
    @page {
      size: 80mm auto;
      margin: 0;
    }
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
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
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
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 4px 0;
      margin: 4px 0;
    }
    .footer { margin-top: 8px; font-size: 11px; color: #000; }
    .dotted { border-top: 1px dotted #000; margin: 6px 0; }
  </style>
</head>
<body>
  <div class="center">
    <img src="${logo}" style="width: 50%; max-height: 100px; object-fit: contain; margin-top: 1px; margin-bottom: 2px;" />
    <div style="font-size: 14px; font-weight: 700; margin-bottom: 2px;">Opening Time</div>
    <div style="font-size: 14px; font-weight: 700; margin-bottom: 2px;">11 AM to 1 AM</div>
    <div style="margin: 10px 0; font-size: 18px; font-weight: 900;">
      Order #${orderId} | ${slipNumber || '-'}
    </div>
    <p class="sub">${now2.toLocaleDateString()} ${now2.toLocaleTimeString()}</p>
  </div>
  ${customerInfo.name || customerInfo.phone || customerInfo.address ? `
  <div class="divider"></div>
  <div style="text-align: left; font-size: 11px;">
    ${customerInfo.name ? `<p style="margin: 2px 0;"><strong>Customer:</strong> ${customerInfo.name}</p>` : ''}
    ${customerInfo.phone ? `<p style="margin: 2px 0;"><strong>Phone:</strong> ${customerInfo.phone}</p>` : ''}
    ${customerInfo.address ? `<p style="margin: 2px 0;"><strong>Address:</strong> ${customerInfo.address}</p>` : ''}
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
  <div class="total-row"><span>Total Items</span><span>${cart.reduce((s, c) => s + c.qty, 0)}</span></div>
  <div class="total-row"><span>Subtotal</span><span>${CURRENCY}${parseFloat(subtotal).toFixed(2)}</span></div>
  ${parseFloat(customerInfo.discount || 0) > 0 ? `<div class="total-row"><span>Discount</span><span>-${CURRENCY}${parseFloat(customerInfo.discount).toFixed(2)}</span></div>` : ''}
  <div class="total-row grand"><span>TOTAL</span><span>${CURRENCY}${parseFloat(total - (parseFloat(customerInfo.discount) || 0)).toFixed(2)}</span></div>
  <div class="total-row"><span>Payment</span><span>${paymentLabel}</span></div>
  <div class="dotted"></div>
  <div class="center footer">
    <p>Thank you for your order!</p>
    <p>Come back soon 🍕</p>
    <p>${BRAND_RECEIPT_FOOTER}</p>
    <p style="margin-top:6px;">📞 ${BRAND_PHONE_DISPLAY}</p>
  </div>
  <div class="dotted"></div>
  <div class="center footer" style="margin-top:4px;font-size:11px;font-weight:bold;color:#000000;">
    <p>Software developed by Uzair</p>
    <p>03062951312</p>
  </div>
</body>
</html>`

    const w = 400, h = 600
    const left = Math.round((window.screen.width - w) / 2)
    const top = Math.round((window.screen.height - h) / 2)
    const win = window.open('', '_blank',
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`)
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Enter') {
        if (confirmModal && !e.target.matches('textarea')) {
          e.preventDefault()
          submitOrder()
        } else if (!confirmModal && !e.target.matches('input,textarea,select')) {
          e.preventDefault()
          handlePayClick()
        }
      }
      if (e.key === 'Escape') {
        if (confirmModal) setConfirmModal(false)
        else clearCart()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }) // Runs after every render to ensure closures (submitOrder/state) are always perfectly fresh

  const now = new Date()

  return (
    <>
      <div className="pos-layout">
        {/* Left: Products */}
        <div className="pos-left">
          {/* Category Tabs */}
          <div className="category-tabs">
            <button
              className={`cat-tab${activeCategory === 'All' ? ' active' : ''}`}
              onClick={() => setActiveCategory('All')}
            >All</button>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`cat-tab${activeCategory === cat.name ? ' active' : ''}`}
                onClick={() => setActiveCategory(cat.name)}
              >{cat.name}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex' }}>
              <button
                className="cat-tab"
                onClick={() => setShowAddCategory(true)}
                style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.05)', fontWeight: 'bold' }}
              >+ New Type</button>
              <button
                className="cat-tab"
                onClick={() => setShowManageCategories(true)}
                style={{ color: 'var(--text-primary)', padding: '10px 12px', display: 'flex', alignItems: 'center' }}
                title="Manage Categories"
              ><MoreVertical size={16} /></button>
            </div>
          </div>

          {/* Search */}
          <div className="pos-search">
            <Search className="si" size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search menu items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Product grid */}
          <div className="product-grid">
            {!loading && filteredItems.filter(i => i.status === 'Active').length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Search size={48} style={{ marginBottom: 16, opacity: 0.2 }} />
                <p style={{ fontSize: 16, fontWeight: 600 }}>No products found</p>
                <p style={{ fontSize: 13 }}>Try a different category or search term</p>
              </div>
            )}
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 260, borderRadius: 12 }} />
              ))
              : filteredItems.filter(i => i.status === 'Active').map(item => {
                let sizeOptionsParsed = (item.size_options || []).map(s => parseSizeOpt(s, item.price));
                if (sizeOptionsParsed.length === 0) {
                  sizeOptionsParsed = [{ name: 'Regular', price: parseFloat(item.price) || 0 }];
                }

                const smallOpt = sizeOptionsParsed.find(x => x.name.toUpperCase() === 'S');
                const displayPrice = smallOpt 
                  ? smallOpt.price 
                  : Math.min(...sizeOptionsParsed.map(x => x.price));

                return (
                  <div key={item.id} className="product-card" title={item.name} onClick={() => {
                    setSizeModalItem({ ...item, sizeOptionsParsed });
                    setSizeModalSelected(sizeOptionsParsed[0].name);
                  }}>
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '150px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, borderBottom: '1px solid var(--surface-2)', fontWeight: 600 }}>
                        No Image
                      </div>
                    )}
                    <div className="product-card-info">
                      <h4>{item.name}</h4>
                      {sizeOptionsParsed.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                          {sizeOptionsParsed.map(sz => (
                            <span
                              key={sz.name}
                              style={{
                                fontSize: 10,
                                background: 'var(--surface-2)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                color: 'var(--text-secondary)',
                                fontWeight: 600,
                              }}
                            >
                              {sz.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="product-card-bottom">
                        <span className="product-price">
                          {item.size_options && item.size_options.length > 0 && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>From </span>
                          )}
                          {CURRENCY}{displayPrice.toFixed(2)}
                        </span>
                        <button className="add-btn">+</button>
                      </div>
                    </div>
                  </div>
                )
              })
            }
          </div>
        </div>

        {/* Right: Cart */}
        <div className="pos-right">
          <div className="cart-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={20} />
              {editingOrderId ? <span style={{ color: 'var(--red)' }}>Editing Order #{editingOrderId}</span> : 'Cart'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {editingOrderId && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={clearCart}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                >
                  Cancel Edit
                </button>
              )}
              <span className="cart-count">{cart.reduce((s, c) => s + c.qty, 0)} items</span>
            </div>
          </div>

          {/* Offline/Sync indicators */}
          <div style={{ padding: '0 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: isOnline ? 'var(--green)' : 'var(--red)' }}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            {pendingCount > 0 && (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--orange)', cursor: 'pointer' }}
                onClick={() => isOnline && syncPendingOrders()}
              >
                {syncing ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
                <span>{pendingCount} Pending Sync</span>
              </div>
            )}
          </div>

          <div className="cart-items">
            {cart.length === 0
              ? (
                <div className="cart-empty">
                  <ShoppingCart size={48} className="empty-icon" color="var(--surface-2)" />
                  <p>No items yet</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click a product to add</p>
                </div>
              )
              : cart.map(item => (
                <div key={item.cartId} className="cart-item">
                  <div className="cart-item-info">
                    <h4>{item.name}</h4>
                    <p>{CURRENCY}{parseFloat(item.price).toFixed(2)} each</p>
                  </div>
                  <div className="qty-controls">
                    <button className="qty-btn" onClick={() => updateQty(item.cartId, -1)}>−</button>
                    <span className="qty-num">{item.qty}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.cartId, +1)}>+</button>
                  </div>
                  <span className="item-total">{CURRENCY}{(item.price * item.qty).toFixed(2)}</span>
                  <button className="remove-btn" onClick={() => updateQty(item.cartId, -item.qty)}>✕</button>
                </div>
              ))
            }
          </div>

          {/* Totals */}
          <div className="cart-totals">
            <div className="total-row">
              <span>Subtotal</span>
              <span>{CURRENCY}{subtotal.toFixed(2)}</span>
            </div>

            <div className="grand-total-row">
              <span>TOTAL</span>
              <span style={{ color: 'var(--red)' }}>{CURRENCY}{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8 }}>
            {['Cash', 'Card'].map(m => (
              <button
                key={m}
                className={`btn btn-sm ${paymentMethod === m ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, justifyContent: 'center', gap: 6 }}
                onClick={() => setPaymentMethod(m)}
              >
                {m === 'Cash' ? <Banknote size={16} /> : <CreditCard size={16} />} {m}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="cart-actions">
            <div className="cart-actions-row">
              <button className="btn btn-secondary" onClick={clearCart} style={{ gap: 6 }}><Trash2 size={16} /> Clear (Esc)</button>
              <button
                className={`btn ${paymentMethod === 'Hold' ? 'btn-primary' : 'btn-warning'}`}
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
          </div>
        </div>
      </div>

      {/* Thermal Receipt - hidden, printing is done via printThermalSlip() popup */}
      <div className="receipt-section" ref={receiptRef} style={{ width: '80mm', padding: '2px 10px 6px 15px' }}>
        <div className="receipt-header" style={{ textAlign: 'center' }}>
          <img src={logo} alt="Logo" style={{ width: '50%', maxHeight: 80, objectFit: 'contain', marginTop: 0, marginBottom: 2 }} />
          <p>Free Home Delivery</p>
          <p>Ahmad Town,Jarawala Road <br />Khurrianwala</p>
          <p>Opening Time </p>
          <p>11 AM to 1 AM</p>
          <div style={{ margin: '10px 0', fontSize: 18, fontWeight: 900 }}>
            Order #... | ...
          </div>
          <p>{now.toLocaleDateString()} {now.toLocaleTimeString()}</p>
        </div>
        <div className="receipt-items">
          {cart.map((item, idx) => (
            <div key={item.cartId} className="receipt-item">
              <span>{idx + 1}. {item.name} x{item.qty}</span>
              <span>{CURRENCY}{parseFloat(item.price * item.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="receipt-totals">
          <div className="receipt-item"><span>Subtotal</span><span>{CURRENCY}{parseFloat(subtotal).toFixed(2)}</span></div>
          <div className="receipt-item receipt-grand"><span>TOTAL</span><span>{CURRENCY}{parseFloat(total).toFixed(2)}</span></div>
          <div className="receipt-item"><span>Payment</span><span>{paymentMethod}</span></div>
        </div>
        <div className="receipt-footer">
          <p>Thank you for your order!</p>
          <p>Come back soon 🍕</p>
          <p>{BRAND_RECEIPT_FOOTER}</p>
          <p style={{ marginTop: 6, fontSize: 11 }}>📞 {BRAND_PHONE_DISPLAY}</p>
          <p style={{ marginTop: 6, fontWeight: 'bold', fontSize: 11, color: '#000000' }}>Software developed by Uzair</p>
          <p style={{ fontSize: 11, fontWeight: 'bold', color: '#000000' }}>03062951312</p>
        </div>
      </div >

      {/* Size Selection Modal */}
      {
        sizeModalItem && (
          <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setSizeModalItem(null) }}>
            <div className="modal" style={{ maxWidth: 440, padding: 24 }}>
              <div className="modal-header" style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 18 }}>Select Size</h3>
                <button className="modal-close" onClick={() => setSizeModalItem(null)}>✕</button>
              </div>

              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 24 }}>
                {sizeModalItem.image_url ? (
                  <img src={sizeModalItem.image_url} alt={sizeModalItem.name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600 }}>
                    No Img
                  </div>
                )}
                <div>
                  <h4 style={{ fontSize: 16, margin: 0, color: 'var(--text-primary)' }}>{sizeModalItem.name}</h4>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>Choose your preferred option</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 28 }}>
                {sizeModalItem.sizeOptionsParsed.map(sz => {
                  const isSelected = sizeModalSelected === sz.name;
                  return (
                    <div
                      key={sz.name}
                      onClick={() => setSizeModalSelected(sz.name)}
                      style={{
                        border: isSelected ? '2px solid var(--red)' : '2px solid var(--surface-2)',
                        background: isSelected ? 'rgba(227,24,55,0.04)' : 'white',
                        borderRadius: 10,
                        padding: '14px 16px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: isSelected ? '0 4px 12px rgba(227,24,55,0.1)' : 'none'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: isSelected ? 'var(--red)' : 'var(--text-primary)' }}>{sz.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{CURRENCY}{parseFloat(sz.price).toFixed(2)}</div>
                    </div>
                  )
                })}
              </div>

              {(() => {
                const activeSize = sizeModalItem.sizeOptionsParsed.find(s => s.name === sizeModalSelected);
                if (!activeSize) return null;

                return (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '16px', fontSize: 16, justifyContent: 'center', borderRadius: 10 }}
                    onClick={() => {
                      addToCart(sizeModalItem, { name: activeSize.name, price: activeSize.price });
                      setSizeModalItem(null);
                    }}
                  >
                    <span>Add <span style={{ fontWeight: 800 }}>{activeSize.name}</span> to Cart</span>
                    <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
                    <span>{CURRENCY}{parseFloat(activeSize.price).toFixed(2)}</span>
                  </button>
                )
              })()}
            </div>
          </div>
        )
      }
      {/* Confirm Order Modal */}
      {
        confirmModal && (
          <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setConfirmModal(false) }}>
            <div className="modal" style={{ maxWidth: 750, width: '90%' }}>
              <div className="modal-header">
                <h3>Confirm Order</h3>
                <button className="modal-close" onClick={() => setConfirmModal(false)}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 24, padding: 20, flexWrap: 'wrap' }}>
                {/* Left Column: Order Summary */}
                <div style={{ flex: '1 1 300px', borderRight: '1px solid var(--surface-2)', paddingRight: 24 }}>
                  <h4 style={{ marginBottom: 16 }}>Receipt Preview</h4>
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
                    ))}
                    <div style={{ borderTop: '1px dashed #ccc', margin: '12px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total Items</span>
                      <span>{cart.reduce((s, c) => s + c.qty, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Subtotal</span>
                      <span>{subtotal.toFixed(2)}</span>
                    </div>
                    {parseFloat(customerInfo.discount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--red)' }}>
                        <span>Discount</span>
                        <span>-{parseFloat(customerInfo.discount).toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px dashed #ccc', margin: '12px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 16 }}>
                      <span>Total</span>
                      <span>{(total - (parseFloat(customerInfo.discount || 0))).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Optional Info & Actions */}
                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)' }}>Customer Name (Optional)</label>
                    <input autoFocus className="form-control" placeholder="Enter Customer Name" value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)' }}>Phone Number (Optional)</label>
                    <input className="form-control" placeholder="0300-0000000" value={customerInfo.phone} onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)' }}>Address (Optional)</label>
                    <textarea className="form-control" placeholder="123 Main St" rows={2} value={customerInfo.address} onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)' }}>Discount Amount ({CURRENCY})</label>
                    <input className="form-control" type="number" step="0.01" placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo({ ...customerInfo, discount: e.target.value })} />
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                    <button className="btn btn-primary" style={{ width: '100%', fontSize: 16, padding: '12px 16px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => submitOrder(paymentMethod)} disabled={processing}>
                      {processing ? 'Processing...' : <><CheckCircle2 size={18} /> Place & Print (Enter)</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }
      {
        showManageCategories && (
          <ManageCategoriesModal
            categories={categories}
            setCategories={setCategories}
            onClose={() => setShowManageCategories(false)}
            onCategoryChange={() => {
              // Re-fetch items if categories were deleted/edited (as category names might have changed on items)
              const params = {}
              if (activeCategory !== 'All') params.category = activeCategory
              if (search) params.search = search
              axios.get('/api/items', { params }).then(r => setItems(r.data))
            }}
          />
        )
      }
      {
        showAddCategory && (
          <AddCategoryModal
            categories={categories}
            setCategories={setCategories}
            onClose={() => setShowAddCategory(false)}
            onCategoryAdded={(cat) => setActiveCategory(cat.name)}
          />
        )
      }
    </>
  )
}
