import { useEffect, useState, useCallback, useRef } from 'react'
import axios from '../api'
import toast from 'react-hot-toast'
import { CURRENCY } from '../config'
import ManageCategoriesModal from '../components/ManageCategoriesModal'
import ManageTablesModal from '../components/ManageTablesModal'
import OrderDetailModal from '../components/OrderDetailModal'
import AddCategoryModal from '../components/AddCategoryModal'
import { socket } from '../socket'
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
  RefreshCw,
  ChevronRight,
  X,
  Edit,
  Eye,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Ban
} from 'lucide-react'
import {
  savePendingOrder,
  getAllPendingOrders,
  removePendingOrder
} from '../utils/db'
import { printViaRawBT } from '../utils/rawbtPrinter'

import {
  BRAND_NAME,
  BRAND_LOGO as logo,
  BRAND_SLIP_LOGO as slipLogo,
  BRAND_PHONE_DISPLAY,
  BRAND_EMAIL,
  BRAND_ADDRESS,
  BRAND_RECEIPT_FOOTER
} from '../branding'

import { usePOS } from '../contexts/POSContext'
import { useAuth } from '../contexts/AuthContext'

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

const getTimeElapsed = (dateString) => {
  if (!dateString) return '';
  const diffMinutes = Math.floor((new Date() - new Date(dateString)) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const h = Math.floor(diffMinutes / 60);
  const m = diffMinutes % 60;
  return `${h}h ${m}m ago`;
};

export default function POS() {
  const { user } = useAuth();
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
  const [editingOrderSlip, setEditingOrderSlip] = useState(null)
  const [originalCart, setOriginalCart] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const receiptRef = useRef(null)
  const [showCart, setShowCart] = useState(false)
  const [activeOrders, setActiveOrders] = useState([])
  const [tableConflictData, setTableConflictData] = useState(null)
  const [quickCompleteModal, setQuickCompleteModal] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)
  const [expandedSections, setExpandedSections] = useState({ 
    'Dine-In': false, 
    'Takeaway': false, 
    'Delivery': false 
  })
  const [mobilePane, setMobilePane] = useState('none')
  const [showMobileDotsMenu, setShowMobileDotsMenu] = useState(false)
  const [showTableDotsMenu, setShowTableDotsMenu] = useState(false)
  const [tablesList, setTablesList] = useState([])
  const [showManageTables, setShowManageTables] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [selectedBranch, setSelectedBranch] = useState('Branch 1')
  
  // Cancel Request States
  const [cancelRequestModal, setCancelRequestModal] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [processingCancel, setProcessingCancel] = useState(false)
  const [confirmCancelAction, setConfirmCancelAction] = useState(null)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchTablesList = useCallback(async () => {
    try {
      const isAdminOrDev = ['admin', 'developer'].includes(user?.role?.trim().toLowerCase());
      const branchQuery = isAdminOrDev ? `?branch=${encodeURIComponent(selectedBranch)}` : '';
      const res = await axios.get(`/api/tables${branchQuery}`);
      setTablesList(res.data);
    } catch (err) {
      console.error('Failed to fetch tables:', err);
    }
  }, [user, selectedBranch]);

  useEffect(() => {
    fetchTablesList();
    
    socket.on('tables-updated', fetchTablesList);
    return () => {
      socket.off('tables-updated', fetchTablesList);
    }
  }, [fetchTablesList]);

  const fetchActiveOrders = useCallback(async () => {
    try {
      const isAdminOrDev = ['admin', 'developer'].includes(user?.role?.trim().toLowerCase());
      const branchQuery = isAdminOrDev ? `&branch=${encodeURIComponent(selectedBranch)}` : '';
      const res = await axios.get(`/api/orders?status=Hold,Payment Requested&limit=100${branchQuery}`)
      setActiveOrders(res.data)
    } catch (err) {
      console.error(err)
    }
  }, [user, selectedBranch])

  // Listen to real-time order events so booked table status updates INSTANTLY
  useEffect(() => {
    const handleOrderChange = () => {
      fetchActiveOrders();
    };
    socket.on('newOrder', handleOrderChange);
    socket.on('orderUpdated', handleOrderChange);
    return () => {
      socket.off('newOrder', handleOrderChange);
      socket.off('orderUpdated', handleOrderChange);
    };
  }, [fetchActiveOrders]);

  const handleRequestCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Please provide a reason')
    setProcessingCancel(true)
    try {
      const formattedReason = `[CANCELLED] ${cancelReason}`
      await axios.patch(`/api/orders/${cancelRequestModal.id}/request-cancel`, { reason: formattedReason })
      toast.success('Cancel request sent to Cashier/Admin')
      setCancelRequestModal(null)
      setCancelReason('')
      fetchActiveOrders()
    } catch (err) {
      toast.error('Failed to send request: ' + (err?.response?.data?.error || err.message))
    } finally {
      setProcessingCancel(false)
    }
  }

  const handleActionCancel = (orderId, action) => {
    setConfirmCancelAction({ orderId, action })
  }

  const executeActionCancel = async () => {
    if (!confirmCancelAction) return
    const { orderId, action } = confirmCancelAction
    
    setProcessingCancel(true)
    try {
      await axios.patch(`/api/orders/${orderId}/handle-cancel-request`, { action })
      toast.success(action === 'approve' ? 'Order Cancelled!' : 'Request Rejected!')
      fetchActiveOrders()
    } catch (err) {
      toast.error('Failed to process request: ' + (err?.response?.data?.error || err.message))
    } finally {
      setProcessingCancel(false)
      setConfirmCancelAction(null)
    }
  }
  
  const toggleSection = (type) => {
    setExpandedSections(prev => ({ ...prev, [type]: !prev[type] }));
  };

  useEffect(() => {
    setExpandedSections(prev => {
      let changed = false;
      const next = { ...prev };
      // Only auto-expand Dine-In if there are orders, as requested
      const hasDineInOrders = activeOrders.some(o => (o.order_type === 'Dine-In') || (!o.order_type && o.customer_address?.startsWith('Table ')));
      if (hasDineInOrders && !prev['Dine-In']) {
        next['Dine-In'] = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeOrders]);

  const loadOrderForEdit = async (editId) => {
    try {
      setShowCart(true)
      
      let order = activeOrders.find(o => o.id === parseInt(editId));
      
      // If we have the order in memory AND it has items with IDs (from our updated query), load instantly!
      if (!order || !order.items || order.items.length === 0 || !order.items[0].id) {
        // Fallback to API if not in memory or missing IDs
        const res = await axios.get(`/api/orders/${editId}`)
        order = res.data
      }

      const loadedCart = order.items.map(item => ({
        id: item.item_id || item.id,
        cartId: item.cartId || (item.item_id || item.id).toString(),
        name: item.item_name || item.name,
        price: parseFloat(item.unit_price || item.price),
        qty: item.qty
      }))
      
      setCart(loadedCart)
      setOriginalCart(loadedCart)
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
      setEditingOrderSlip(order.slip_number)
      setPaymentMethod(order.status === 'Hold' ? 'Hold' : 'Cash')
    } catch (err) {
      console.error('Error loading order for edit:', err)
      toast.error('Failed to load order details')
    }
  }

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
          setOriginalCart(loadedCart)
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
          setShowCart(true)
          setEditingOrderSlip(order.slip_number)
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



  useEffect(() => {
    if (!showCart) fetchActiveOrders()
  }, [showCart, fetchActiveOrders])

  // Re-fetch INSTANTLY when table selection view opens so booked status is always fresh
  useEffect(() => {
    const isTableView = customerInfo.orderType === 'Dine-In' && !customerInfo.tableNumber;
    if (isTableView) {
      fetchActiveOrders();
    }
  }, [customerInfo.orderType, customerInfo.tableNumber, fetchActiveOrders])


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

  // Filter items locally based on activeCategory, search, and branch
  const filteredItems = items.filter(item => {
    const matchesCategory = activeCategory === 'All' || item.category_name === activeCategory || item.category === activeCategory;
    const matchesSearch = !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.category_name && item.category_name.toLowerCase().includes(search.toLowerCase()));
    const isAdminOrDev = ['admin', 'developer'].includes(user?.role?.trim().toLowerCase());
    const matchesBranch = !isAdminOrDev || (item.available_branches || []).includes(selectedBranch);
    return matchesCategory && matchesSearch && matchesBranch;
  });

  // Cart computations
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0)
  const tax = subtotal * TAX_RATE
  const total = subtotal + tax

  const addToCart = useCallback((item, sizeOpt = null) => {
    setShowCart(true)
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
    // Auto-open cart when item is added
    if (window.innerWidth <= 900) {
      setMobilePane('cart');
    } else {
      setShowCart(true);
    }
  }, [])

  const updateQty = (cartId, delta) => {
    setCart(prev => prev
      .map(c => c.cartId === cartId ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0)
    )
  }

  // clearCart is now handled by POSContext

  const handlePayClick = (method = paymentMethod) => {
    if (cart.length === 0) return toast.error('Please Your cart is empty please select item')
    setPaymentMethod(method)
    setConfirmModal(true)
  }

  
  const handlePlaceOrder = (method = paymentMethod, shouldPrint = true) => {
    if (cart.length === 0) return
    if (customerInfo.orderType === 'Dine-In' && customerInfo.tableNumber && method !== 'Hold') {
      const isTableBooked = activeOrders.some(o => o.order_type === 'Dine-In' && o.table_number === customerInfo.tableNumber && o.status === 'Hold' && o.id !== parseInt(editingOrderId));
      if (isTableBooked) {
        setTableConflictData({ method, shouldPrint })
        return
      }
    }
    executeOrder(method, shouldPrint)
  }

  const executeOrder = async (method = paymentMethod, shouldPrint = true) => {
    if (cart.length === 0) return
    

    
    setProcessing(shouldPrint ? 'print' : 'punch')
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
        customer_address: customerInfo.orderType === 'Dine-In' ? (customerInfo.tableNumber ? `Table ${String(customerInfo.tableNumber).replace(/^Table\s*/i, '')}` : 'Dine-In') : customerInfo.address,
        discount: finalDiscount,
        client_order_id: crypto.randomUUID(),
        order_type: customerInfo.orderType,
        table_number: customerInfo.tableNumber,
        order_taker: user?.username || 'Guest',
        comments: customerInfo.comments,
        branch: ['admin', 'developer'].includes(user?.role?.trim().toLowerCase()) ? selectedBranch : undefined
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
          const isFullReceiptOffline = method !== 'Hold'
          if (shouldPrint) printThermalSlip(method, 'OFFLINE-' + orderData.client_order_id.slice(0, 8), '-', 0, isFullReceiptOffline, null)
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
              const isFullReceiptOffline = method !== 'Hold'
              if (shouldPrint) printThermalSlip(method, 'OFFLINE-' + orderData.client_order_id.slice(0, 8), '-', 0, isFullReceiptOffline, null)
              throw netErr
            } else {
              // Server error (500 etc) - do not save offline, just show error
              throw netErr
            }
          }
        }
      }

      let diffData = null;
      if (editingOrderId && method === 'Hold' && originalCart) {
        const added = [];
        const cancelled = [];
        
        cart.forEach(c => {
          const orig = originalCart.find(o => o.cartId === c.cartId);
          if (!orig) added.push({ ...c });
          else if (c.qty > orig.qty) added.push({ ...c, qty: c.qty - orig.qty });
        });

        originalCart.forEach(o => {
          const curr = cart.find(c => c.cartId === o.cartId);
          if (!curr) cancelled.push({ ...o });
          else if (o.qty > curr.qty) cancelled.push({ ...o, qty: o.qty - curr.qty });
        });
        
        if (added.length > 0 || cancelled.length > 0) {
          diffData = { added, cancelled };
        }
      }

      const orderId = res?.data?.order?.id || editingOrderId || 'N/A'
      const slipNumber = res?.data?.order?.slip_number || '-'
      const editCount = res?.data?.order?.edit_count || 0
      const isFullReceipt = method !== 'Hold'
      if (isOnline) {
        toast.success(method === 'Hold' ? 'Order updated to Hold status!' : 'Order Placed!', { duration: 3000 })
        if (shouldPrint) printThermalSlip(method, orderId, slipNumber, editCount, isFullReceipt, diffData)
      }

      // Cleanup
      clearCart()
      setOriginalCart(null)
      setEditingOrderId(null)
      window.history.replaceState({}, '', '/pos')
      setPaymentMethod('Cash')
      setConfirmModal(false)
      setShowCart(false)
      fetchActiveOrders()
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

  const printThermalSlip = (method, orderId, slipNumber, editCount = 0, isFullReceipt = true, diffData = null, customCart = null, customCustomerInfo = null) => {
    const now2 = new Date()
    const paymentLabel = method === 'Hold' ? 'Hold (Pending)' : method;
    
    const currentCart = customCart || cart;
    const currentInfo = customCustomerInfo || customerInfo;

    const currentSubtotal = currentCart.reduce((sum, i) => sum + (parseFloat(i.price || i.unit_price) * i.qty), 0);
    const currentTax = currentSubtotal * TAX_RATE;
    const currentTotal = currentSubtotal + currentTax;

    let itemRows = '';
    if (!isFullReceipt && diffData) {
      itemRows = diffData.added.map((item, index) => `
      <div class="row">
        <span class="item-name">${index + 1}. ${item.name}</span>
        <span class="item-qty">${item.qty}</span>
        <span class="item-price">${CURRENCY}${parseFloat(item.price * item.qty).toFixed(2)}</span>
      </div>`).join('');
      
      itemRows += diffData.cancelled.map((item, index) => `
      <div class="row" style="text-decoration: line-through; color: #555;">
        <span class="item-name">${diffData.added.length + index + 1}. ${item.name}</span>
        <span class="item-qty">${item.qty}</span>
        <span class="item-price">${CURRENCY}${parseFloat(item.price * item.qty).toFixed(2)}</span>
      </div>`).join('');
    } else {
      itemRows = currentCart.map((item, index) => `
      <div class="row">
        <span class="item-name">${index + 1}. ${item.name || item.item_name}</span>
        <span class="item-qty">${item.qty}</span>
        <span class="item-price">${CURRENCY}${parseFloat((item.price || item.unit_price) * item.qty).toFixed(2)}</span>
      </div>`).join('');
    }

    const taker = currentInfo.order_taker || currentInfo.orderTaker || user?.username || 'Guest';
    const comment = currentInfo.comments || '';
    const customerName = currentInfo.name || '';
    const metaRowParts = [];
    if (currentInfo.orderType === 'Dine-In' && currentInfo.tableNumber) metaRowParts.push(`Table ${String(currentInfo.tableNumber).replace(/^Table\s*/i, '')}`);
    if (taker) metaRowParts.push(`By: ${taker}`);
    const metaRow = metaRowParts.length > 0 ? `<div style="font-size: 12px; font-weight: bold; margin: 2px 0; text-align: center;">${metaRowParts.join(' | ')}</div>` : '';

    const effectiveBranch = currentInfo.branch || (user?.role?.trim().toLowerCase() !== 'admin' && user?.role?.trim().toLowerCase() !== 'developer' && user?.branch ? user.branch : selectedBranch) || 'Branch 1';

    const headerHtml = isFullReceipt ? `
    <div style="font-size: 16px; font-weight: 900; margin: 6px 0;">
      ${currentInfo.orderType}
    </div>
    <div style="font-size: 14px; font-weight: bold; margin: 2px 0; text-align: center;">
      ${effectiveBranch}
    </div>
    <div style="font-size: 10px; text-align: center; margin: 4px 0;">
      Kitchen slip. Please get original slip from counter.<br/>
      إيصال المطبخ. يرجى الحصول على الإيصال الأصلي من الكاونتر.
    </div>
    ${metaRow}
    <div style="margin: 10px 0; font-size: 18px; font-weight: 900;">
      Order #${orderId} - ${editCount > 0 ? `Edit ${slipNumber}${String.fromCharCode(64 + editCount)}` : slipNumber}
    </div>
    <p class="sub">${now2.toLocaleDateString()} ${now2.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
    ` : `
    <div style="font-size: 14px; font-weight: 900; margin: 2px 0;">
      ${currentInfo.orderType}
    </div>
    <div style="font-size: 12px; font-weight: bold; margin: 2px 0; text-align: center;">
      ${effectiveBranch}
    </div>
    <div style="font-size: 10px; text-align: center; margin: 4px 0;">
      Kitchen slip. Please get original slip from counter.<br/>
      إيصال المطبخ. يرجى الحصول على الإيصال الأصلي من الكاونتر.
    </div>
    ${metaRow}
    <div style="margin: 2px 0; font-size: 14px; font-weight: 900;">
      Order #${orderId} - ${editCount > 0 ? `Edit ${slipNumber}${String.fromCharCode(64 + editCount)}` : slipNumber}
    </div>
    <p class="sub" style="margin-bottom: 2px; font-size: 10px;">${now2.toLocaleDateString()} ${now2.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
    `;

    const footerHtml = isFullReceipt ? `
    <div class="dotted"></div>
    <div class="center footer">
      <p>Thank you for your order!</p>
      <p>Come back soon 🍕</p>
    </div>
    ` : '';

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
    html { margin: 0; padding: 0; background: #fff; }
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
    h2 { font-size: 14px; font-weight: bold; margin-bottom: 4px; }
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
    ${headerHtml}
  </div>
  ${isFullReceipt && (currentInfo.name || currentInfo.phone || currentInfo.comments || (currentInfo.address && currentInfo.orderType !== 'Dine-In' && currentInfo.orderType !== 'Takeaway')) ? `
  <div class="divider"></div>
  <div style="text-align: left; font-size: 11px; display: flex; flex-wrap: wrap; justify-content: space-between;">
    ${currentInfo.name ? `<div style="width: 48%; margin: 2px 0;"><strong>Cust:</strong> ${currentInfo.name}</div>` : ''}
    ${currentInfo.phone ? `<div style="width: 48%; margin: 2px 0;"><strong>Phone:</strong> ${currentInfo.phone}</div>` : ''}
    ${currentInfo.address && currentInfo.orderType !== 'Dine-In' && currentInfo.orderType !== 'Takeaway' ? `<div style="width: 100%; margin: 2px 0;"><strong>Address:</strong> ${currentInfo.address}</div>` : ''}
    ${currentInfo.comments ? `<div style="width: 100%; margin: 2px 0;"><strong>Note:</strong> ${currentInfo.comments}</div>` : ''}
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
  <div class="total-row"><span>Total Items</span><span>${currentCart.reduce((s, c) => s + c.qty, 0)}</span></div>
  <div class="total-row"><span>Subtotal</span><span>${CURRENCY}${parseFloat(currentSubtotal).toFixed(2)}</span></div>
  ${parseFloat(currentInfo.discount || 0) > 0 ? `<div class="total-row"><span>Discount</span><span>-${CURRENCY}${parseFloat(currentInfo.discount).toFixed(2)}</span></div>` : ''}
  <div class="total-row grand"><span>TOTAL</span><span>${CURRENCY}${parseFloat(currentTotal - (parseFloat(currentInfo.discount) || 0)).toFixed(2)}</span></div>
  <div class="total-row"><span>Payment</span><span>${paymentLabel}</span></div>
  ${footerHtml}
</body>
</html>`

    const printMode = localStorage.getItem('printMode') || 'standard';

    if (printMode === 'rawbt') {
      const orderData = {
        order_id: `${orderId} - ${editCount > 0 ? `Edit ${slipNumber}${String.fromCharCode(64 + editCount)}` : slipNumber}`,
        order_type: currentInfo.orderType,
        customer_name: currentInfo.name,
        table_no: currentInfo.tableNumber,
        items: currentCart.map(c => ({
          name: c.name || c.item_name,
          qty: c.qty,
          price: parseFloat(c.price || c.unit_price)
        })),
        subtotal: parseFloat(currentSubtotal).toFixed(2),
        tax_amount: parseFloat(currentTax).toFixed(2),
        discount: parseFloat(currentInfo.discount || 0).toFixed(2),
        total_amount: parseFloat(currentTotal - (parseFloat(currentInfo.discount) || 0)).toFixed(2)
      };
      
      if (!isFullReceipt && diffData) {
        // If it's just a difference (Void/Add), prefix items with their action
        orderData.items = [
          ...diffData.added.map(c => ({ name: `[ADDED] ${c.name || c.item_name}`, qty: c.qty, price: parseFloat(c.price || c.unit_price) })),
          ...diffData.cancelled.map(c => ({ name: `[VOID] ${c.name || c.item_name}`, qty: c.qty, price: parseFloat(c.price || c.unit_price) }))
        ];
      }

      printViaRawBT(orderData);
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { document.body.removeChild(iframe); }, 1000);
    }, 500);
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

  if (['cashier', 'order taker'].includes(user?.role?.trim().toLowerCase()) && !user?.branch) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 80px)', gap: 16 }}>
        <h2 style={{ fontSize: 24, color: 'var(--text-primary)', fontWeight: 800 }}>0 Menu Items</h2>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)' }}>You have not been assigned any branch.</p>
      </div>
    )
  }

  return (
    <>
      <div className="pos-layout">
        {/* Left: Products */}
        <div className="pos-left">
          {['admin', 'developer'].includes(user?.role?.trim().toLowerCase()) && (
            <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--surface-2)', background: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: 14 }}>Select Branch:</label>
              <select 
                value={selectedBranch} 
                onChange={e => setSelectedBranch(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14, flex: 1, maxWidth: 200, cursor: 'pointer' }}
              >
                <option value="Branch 1">Branch 1</option>
                <option value="Branch 2">Branch 2</option>
                <option value="Branch 3">Branch 3</option>
              </select>
            </div>
          )}
          {customerInfo.orderType === 'Dine-In' && !customerInfo.tableNumber ? (
            <div className="table-selection-view" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                {['Dine-In', 'Takeaway', 'Delivery'].map(type => (
                  <button 
                    key={type}
                    onClick={() => setCustomerInfo(prev => ({ ...prev, orderType: type }))}
                    style={{
                      padding: '8px 12px',
                      fontSize: '14px',
                      whiteSpace: 'nowrap',
                      borderRadius: 8,
                      border: customerInfo.orderType === type ? '2px solid var(--primary)' : '1px solid var(--surface-2)',
                      background: customerInfo.orderType === type ? 'rgba(255,184,0,0.1)' : 'white',
                      color: customerInfo.orderType === type ? 'var(--primary)' : 'var(--text-secondary)',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {type}
                  </button>
                ))}
                
                {['admin', 'developer', 'order taker'].includes(user?.role?.trim().toLowerCase()) && (
                  <div style={{ position: 'relative' }}>
                    <button 
                      onClick={() => setShowTableDotsMenu(!showTableDotsMenu)}
                      style={{ padding: '8px', borderRadius: 8, border: '1px solid var(--surface-2)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <MoreVertical size={20} color="var(--text-secondary)" />
                    </button>
                    {showTableDotsMenu && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowTableDotsMenu(false)} />
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid var(--surface-2)', borderRadius: 8, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 999, minWidth: 150, overflow: 'hidden' }}>
                          <button 
                            style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 14 }}
                            onClick={() => { setShowManageTables(true); setShowTableDotsMenu(false); }}
                          >
                            Manage Tables
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <h3 style={{ marginBottom: 16, textAlign: 'center' }}>Select a Table</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12, overflowY: 'auto', maxHeight: 'calc(100vh - 200px)', paddingRight: 4, paddingBottom: 60 }}>
                {tablesList.map(t => {
                  const tableStr = String(t.table_number);
                  const activeOrder = activeOrders.find(o => (o.order_type === 'Dine-In' || (!o.order_type && o.customer_address?.startsWith('Table '))) && String(o.table_number || o.customer_address?.replace('Table ', '')) === tableStr && o.status === 'Hold');
                  const isBooked = !!activeOrder;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        if (isBooked) {
                          loadOrderForEdit(activeOrder.id);
                        } else {
                          setCustomerInfo(prev => ({ ...prev, tableNumber: tableStr }));
                        }
                      }}
                      style={{
                        padding: '20px 10px',
                        borderRadius: 12,
                        border: 'none',
                        background: isBooked ? '#3b82f6' : '#10b981',
                        color: 'white',
                        fontWeight: 800,
                        fontSize: 16,
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'transform 0.1s'
                      }}
                      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <span>Table {String(t.table_number).replace(/^Table\s*/i, '')}</span>
                      {isBooked && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: 4 }}>Booked</span>
                          <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.9 }}>{getTimeElapsed(activeOrder.created_at)}</span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <>
              {/* POS Category Chips (Mobile & Desktop) */}
              <div className="category-tabs pos-cat-tabs" style={{ marginTop: 4, marginBottom: 0 }}>
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
          </div>

          {/* POS Compact Header (Search + Dots + Order Types) */}
          <div className="pos-mobile-header" style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, marginTop: 0, marginBottom: 4, alignItems: 'center' }}>
            
            {/* Back button (Desktop only) */}
            {window.innerWidth > 900 && customerInfo.orderType === 'Dine-In' && customerInfo.tableNumber && (
              <button 
                onClick={() => setCustomerInfo(prev => ({ ...prev, tableNumber: '' }))}
                title="Back to Tables"
                style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  padding: '5px', borderRadius: 8, border: '1px solid var(--surface-2)',
                  background: 'white', cursor: 'pointer', flexShrink: 0,
                  color: 'var(--text-primary)'
                }}
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
            )}

            <div className="pos-mobile-search" style={{ flex: '1 1 auto', minWidth: '60px', position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search className="si" size={12} style={{ position: 'absolute', left: 4, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search..."
                style={{ width: '100%', padding: '4px 4px 4px 18px', borderRadius: 8, border: '1px solid var(--surface-2)', fontSize: '12px' }}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
              {['Dine-In', 'Takeaway', 'Delivery'].map(type => (
                <button 
                  key={type}
                  onClick={() => setCustomerInfo(prev => ({ ...prev, orderType: type, tableNumber: type === 'Dine-In' ? '' : prev.tableNumber }))}
                  style={{
                    padding: window.innerWidth > 900 ? '6px 12px' : '4px 6px',
                    fontSize: window.innerWidth > 900 ? '13px' : '9px',
                    whiteSpace: 'nowrap',
                    borderRadius: 6,
                    border: customerInfo.orderType === type ? '1.5px solid var(--primary)' : '1px solid var(--surface-2)',
                    background: customerInfo.orderType === type ? 'rgba(255,184,0,0.1)' : 'white',
                    color: customerInfo.orderType === type ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            <div 
              className="pos-mobile-dots" 
              onClick={(e) => {
                e.stopPropagation();
                setShowMobileDotsMenu(prev => !prev);
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', position: 'relative' }}
            >
              <MoreVertical size={18} />
              {showMobileDotsMenu && (
                <>
                  <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 998 }} 
                    onClick={(e) => { e.stopPropagation(); setShowMobileDotsMenu(false); }} 
                  />
                  <div className="pos-mobile-dots-menu" style={{ display: 'block', zIndex: 999 }}>
                    <button onClick={(e) => { e.stopPropagation(); setShowAddCategory(true); setShowMobileDotsMenu(false); }}>+ New Type</button>
                    <button onClick={(e) => { e.stopPropagation(); setShowManageCategories(true); setShowMobileDotsMenu(false); }}>Manage Categories</button>
                    {['admin', 'developer', 'order taker'].includes(user?.role?.trim().toLowerCase()) && (
                      <button onClick={(e) => { e.stopPropagation(); setShowManageTables(true); setShowMobileDotsMenu(false); }}>Manage Tables</button>
                    )}
                    <div style={{ borderTop: '1px solid #eee', margin: '4px 0' }} />
                    <button onClick={(e) => { e.stopPropagation(); setCustomerInfo(p => ({ ...p, orderType: 'Dine-In' })); setShowMobileDotsMenu(false); }}>Switch to Dine-In</button>
                    <button onClick={(e) => { e.stopPropagation(); setCustomerInfo(p => ({ ...p, orderType: 'Takeaway' })); setShowMobileDotsMenu(false); }}>Switch to Takeaway</button>
                    <button onClick={(e) => { e.stopPropagation(); setCustomerInfo(p => ({ ...p, orderType: 'Delivery' })); setShowMobileDotsMenu(false); }}>Switch to Delivery</button>
                  </div>
                </>
              )}
            </div>
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
                    if (sizeOptionsParsed.length === 1) {
                      addToCart(item, sizeOptionsParsed[0]);
                    } else {
                      setSizeModalItem({ ...item, sizeOptionsParsed });
                      setSizeModalSelected(sizeOptionsParsed[0].name);
                    }
                  }}>
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        onError={e => { e.target.style.display = 'none' }}
                      />
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
            </>
          )}
        </div>

        {/* Right: Cart */}
        
        {/* Mobile FAB Container */}
        <div className="mobile-fab-container">
          <button className="mobile-fab orders" onClick={() => setMobilePane(mobilePane === 'orders' ? 'none' : 'orders')}>
            <ClipboardList size={24} />
            {activeOrders.length > 0 && <span className="cart-badge-dot">{activeOrders.length}</span>}
          </button>
          <button className="mobile-fab cart" onClick={() => setMobilePane(mobilePane === 'cart' ? 'none' : 'cart')}>
            <ShoppingCart size={24} />
            {cart.reduce((s, c) => s + c.qty, 0) > 0 && <span className="cart-badge-dot">{cart.reduce((s, c) => s + c.qty, 0)}</span>}
          </button>
        </div>

        {/* Right Panel: Cart OR Active Orders */}
        <div className={`pos-right ${mobilePane !== 'none' ? 'mobile-open' : ''}`}>
          
          
          <button 
            className="btn btn-primary" 
            style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, borderRadius: '50%', width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
            onClick={() => {
              if (window.innerWidth <= 900) {
                setMobilePane(mobilePane === 'cart' ? 'none' : 'cart');
              } else {
                setShowCart(!showCart);
              }
            }}
          >
            <ShoppingCart size={20} />
            {cart.reduce((s, c) => s + c.qty, 0) > 0 && <span className="cart-badge-dot" style={{ top: -4, right: -4 }}>{cart.reduce((s, c) => s + c.qty, 0)}</span>}
          </button>
          <div className="active-orders-panel">
              <div className="active-orders-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflow: 'hidden', padding: '8px 12px 12px' }}>
                {['Dine-In', 'Takeaway', 'Delivery'].map(type => {
                  const orders = activeOrders
                    .filter(o => (o.order_type === type) || (!o.order_type && type === 'Delivery' && o.customer_address && !o.customer_address.startsWith('Table ')) || (!o.order_type && type === 'Dine-In' && o.customer_address?.startsWith('Table ')))
                    .sort((a, b) => (a.status === 'Payment Requested' ? -1 : (b.status === 'Payment Requested' ? 1 : 0)));
                  const isExpanded = expandedSections[type];
                  
                  return (
                    <div key={type} className="order-group" style={{ display: 'flex', flexDirection: 'column', flex: isExpanded ? (type === 'Dine-In' ? '2 0 0' : '1 0 0') : '0 0 auto', transition: 'all 0.2s ease-in-out', borderTop: type !== 'Dine-In' ? '1px dashed #ccc' : 'none', marginTop: type !== 'Dine-In' ? 4 : 0, paddingTop: type !== 'Dine-In' ? 4 : 0 }}>
                      <div className="order-group-header" onClick={() => toggleSection(type)} style={{ cursor: 'pointer' }}>
                        <h5 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          {type === 'Dine-In' ? <CheckCircle2 size={14} /> : type === 'Takeaway' ? <ClipboardList size={14} /> : <ShoppingCart size={14}/>}
                          {type} Orders
                        </h5>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="order-badge">{orders.length} {orders.length === 1 ? 'Order' : 'Orders'}</span>
                          <button className="btn btn-sm" style={{ background: 'transparent', padding: 4, color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); toggleSection(type); }}>
                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </button>
                        </div>
                      </div>
                      
                      {isExpanded && (
                      <div className="order-cards" style={{ overflowY: 'auto', flex: 1 }}>
                        {orders.map(o => (
                          <div key={o.id} className="active-order-card">
                            <div className="order-head" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              <span style={{ fontWeight: 800, color: '#a22020', fontSize: 13 }}>Order #{o.id} | {o.slip_number}</span>
                              {o.cancel_requested && (
                                <span style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>Cancel Request</span>
                              )}
                              {o.status === 'Payment Requested' && (
                                <span className="badge" style={{ background: 'var(--orange)', color: 'white', fontSize: 10, padding: '2px 6px' }}>Payment Pending</span>
                              )}
                              <span style={{ fontWeight: 800, color: '#a22020', fontSize: 13, marginLeft: 'auto' }}>{CURRENCY}{parseFloat(o.grand_total).toFixed(2)}</span>
                            </div>
                            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                              {o.items ? o.items.map((i, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{i.qty}x {i.name}</span>
                                  <span>SAR {(i.price ? parseFloat(i.price) * i.qty : 0).toFixed(2)}</span>
                                </div>
                              )) : 'No items'}
                            </div>
                            <div style={{ borderTop: '1px dashed #ccc', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                                {type === 'Delivery' ? (
                                  <>{o.customer_name || 'Guest'} {o.customer_phone ? ` - ${o.customer_phone}` : ''}</>
                                ) : type === 'Takeaway' ? (
                                  <>{o.customer_name || 'Guest'}</>
                                ) : (
                                  <>Table {String(o.table_number || (o.customer_address ? o.customer_address.replace('Table ', '') : '-')).replace(/^Table\s*/i, '')} {o.customer_name && ` | ${o.customer_name}`}</>
                                )}
                              </div>
                              <div className="order-actions" style={{ display: 'flex', gap: 4 }}>
                                {o.cancel_requested ? (
                                  ['admin', 'developer', 'cashier'].includes(user?.role?.trim().toLowerCase()) ? (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button className="btn btn-sm btn-success" style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700 }} onClick={() => handleActionCancel(o.id, 'approve')} disabled={processingCancel}>Approve</button>
                                      <button className="btn btn-sm btn-secondary" style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700, color: 'var(--red)' }} onClick={() => handleActionCancel(o.id, 'reject')} disabled={processingCancel}>Reject</button>
                                    </div>
                                  ) : (
                                    <span className="badge" style={{ background: 'var(--orange)', color: 'white', fontSize: 10, padding: '2px 6px' }}>Cancel Pending</span>
                                  )
                                ) : (
                                  <>
                                    <button className="btn btn-sm btn-secondary" style={{ padding: '2px 4px', background: 'transparent', border: '1px solid #ddd' }} onClick={() => setCancelRequestModal({ id: o.id })} title="Request Cancel"><Ban size={14} color="var(--red)"/></button>
                                    {!(o.status === 'Payment Requested' && user?.role?.trim().toLowerCase() === 'order taker') && (
                                      <button className="btn btn-sm btn-secondary" style={{ padding: '2px 4px', background: 'transparent', border: '1px solid #ddd' }} onClick={() => loadOrderForEdit(o.id)} title="Edit"><Edit size={14} color="var(--text-muted)"/></button>
                                    )}
                                    <button className="btn btn-sm btn-secondary" style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: '#f5f5f5', color: '#333' }} onClick={() => setDetailOrder(o)}>Detail View</button>
                                    {!(o.status === 'Payment Requested' && user?.role?.trim().toLowerCase() === 'order taker') && (
                                      <button className="btn btn-sm btn-success" style={{ padding: '2px 10px', fontSize: 11, fontWeight: 700 }} onClick={() => setQuickCompleteModal(o)}>Complete</button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {orders.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>No active {type} orders.</div>}
                      </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          
          <div className={`pos-right-inner ${(window.innerWidth > 900 ? showCart : mobilePane === 'cart') ? 'cart-open' : 'cart-closed'}`}>
          <div className="cart-header" style={{ paddingRight: 55, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 16 }}>
                {window.innerWidth <= 900 && <button className="btn btn-secondary btn-sm" onClick={() => setMobilePane('none')} style={{ padding: '4px 8px', marginRight: 4 }}>✕</button>}
                <ShoppingCart size={18} />
                {editingOrderId ? (
                  <span style={{ color: 'var(--orange)', display: 'flex', flexDirection: 'column' }}>
                    <span>Edit #{editingOrderId}</span>
                    {editingOrderSlip && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Slip: {editingOrderSlip}</span>}
                  </span>
                ) : 'Cart'}
              </h3>
              <span className="cart-count" style={{ fontSize: 12, padding: '4px 8px' }}>{cart.reduce((s, c) => s + c.qty, 0)} items</span>
            </div>
            {editingOrderId && (
              <div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { clearCart(); setEditingOrderId(null); setEditingOrderSlip(null); setShowCart(false); window.history.replaceState({}, '', '/pos'); }}
                  style={{ fontSize: 12, padding: '6px 12px', width: '100%', display: 'flex', justifyContent: 'center' }}
                >
                  Cancel Edit
                </button>
              </div>
            )}
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

          <div className="cart-items" style={{ flex: 1, overflowY: 'auto' }}>
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
            {cart.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => { clearCart(); setEditingOrderId(null); window.history.replaceState({}, '', '/pos'); }} style={{ gap: 4, padding: '4px 8px', fontSize: 12 }}>
                  <Trash2 size={14} /> Clear Cart
                </button>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="cart-totals" style={{ padding: "16px 24px" }}>
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
          

          {/* Actions */}
          <div className="cart-actions">
            <div className="cart-actions-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%' }}>
              <button
                className={`btn ${paymentMethod === 'Hold' ? 'btn-primary' : 'btn-warning'} btn-lg`}
                onClick={() => handlePayClick('Hold')}
                style={{ gap: 6, justifyContent: 'center', padding: '12px 8px', gridColumn: user?.role?.trim().toLowerCase() === 'order taker' ? '1 / -1' : undefined }}
                disabled={processing}
              >
                <ClipboardList size={18} /> Place Order
              </button>
              {user?.role?.trim().toLowerCase() !== 'order taker' && (
                <button
                  className="btn btn-success btn-lg"
                  onClick={() => handlePayClick('Cash')}
                  style={{ gap: 6, justifyContent: 'center', padding: '12px 8px' }}
                  disabled={processing}
                >
                  <ClipboardList size={18} /> Pay & Settled
                </button>
              )}
            </div>
          </div>
          </div>        </div>
      </div>

      {/* Thermal Receipt - hidden, printing is done via printThermalSlip() popup */}
      <div className="receipt-section" ref={receiptRef} style={{ width: '80mm', padding: '2px 10px 6px 15px' }}>
        <div className="receipt-header" style={{ textAlign: 'center' }}>
          <img src={slipLogo} alt="Logo" style={{ width: '50%', maxHeight: 80, objectFit: 'contain', margin: '0 auto 2px auto', display: 'block' }} />
          <p>Free Home Delivery</p>
          <p>{BRAND_ADDRESS}</p>
          <h2>Open 24/7</h2>
          <div style={{ fontSize: 16, fontWeight: 900, margin: '6px auto' }}>
            {customerInfo.orderType}
          </div>
          <div style={{ margin: '10px 0', fontSize: 18, fontWeight: 900 }}>
            Order #--
          </div>
          <p>{now.toLocaleDateString()} {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
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
                {sizeModalItem.image_url && (
                  <img src={sizeModalItem.image_url} alt={sizeModalItem.name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
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
                    style={{ width: '100%', padding: '12px 16px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10 }}
                    onClick={() => {
                      addToCart(sizeModalItem, { name: activeSize.name, price: activeSize.price });
                      setSizeModalItem(null);
                    }}
                  >
                    <span>Add <span style={{ fontWeight: 800 }}>{activeSize.name}</span> to Cart</span>
                    <span style={{ margin: '0 12px', opacity: 0.5 }}>|</span>
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
            <div className="modal" style={{ maxWidth: 700, width: "90%", padding: window.innerWidth <= 900 ? 12 : 20, maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="modal-header" style={{ paddingBottom: window.innerWidth <= 900 ? 0 : 16, marginBottom: window.innerWidth <= 900 ? 4 : 16, borderBottom: window.innerWidth <= 900 ? 'none' : '1px solid var(--surface-2)' }}>
                <h3 style={{ fontSize: window.innerWidth <= 900 ? 13 : 24, margin: 0 }}>Confirm Order</h3>
                <button className="modal-close" onClick={() => setConfirmModal(false)}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: window.innerWidth <= 900 ? 8 : 12, padding: window.innerWidth <= 900 ? 0 : 12, flexWrap: 'wrap' }}>
                {/* Left Column: Order Summary */}
                <div style={{ flex: '1 1 300px', borderRight: window.innerWidth > 900 ? '1px solid var(--surface-2)' : 'none', paddingRight: window.innerWidth > 900 ? 16 : 0, paddingBottom: window.innerWidth <= 900 ? 12 : 0, borderBottom: window.innerWidth <= 900 ? '1px solid var(--surface-2)' : 'none' }}>
                  <h4 style={{ marginTop: window.innerWidth <= 900 ? 0 : 0, marginBottom: window.innerWidth <= 900 ? 4 : 16, fontSize: window.innerWidth <= 900 ? 14 : 16 }}>Receipt Preview</h4>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <span style={{ background: 'rgba(227,24,55,0.1)', color: 'var(--primary)', padding: '4px 10px', borderRadius: 6, fontSize: 13, border: '1px solid var(--primary)', fontWeight: 'bold' }}>
                      {customerInfo.orderType}
                    </span>
                    {customerInfo.orderType === 'Dine-In' && customerInfo.tableNumber && (
                      <span style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '4px 10px', borderRadius: 6, fontSize: 13, border: '1px solid #3b82f6', fontWeight: 'bold' }}>
                        Table {String(customerInfo.tableNumber).replace(/^Table\s*/i, '')}
                      </span>
                    )}
                  </div>
                  <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, fontFamily: 'Tahoma, Geneva, sans-serif', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: 6, borderBottom: '1px solid #ddd', paddingBottom: 4 }}>
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
                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 4 }}>


                  {/* DINE-IN FORM */}
                  {customerInfo.orderType === 'Dine-In' && (
                    <>
                      <div className="form-group" style={{ marginBottom: 1 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 0, display: 'block' }}>Customer Name *</label>
                        <input type="text" className="form-control" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="Enter Name" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 1 }}>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 0, display: 'block' }}>Discount Amount</label>
                          <input className="form-control" type="number" step="0.01" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 0, display: 'block' }}>Comments</label>
                          <input type="text" className="form-control" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="Notes..." value={customerInfo.comments || ''} onChange={e => setCustomerInfo(p => ({ ...p, comments: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* DELIVERY FORM */}
                  {customerInfo.orderType === 'Delivery' && (
                    <>
                      <div className="form-group" style={{ marginBottom: 1 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 0, display: 'block' }}>Customer Name</label>
                        <input type="text" className="form-control" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="Enter Name" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 1 }}>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 0, display: 'block' }}>Phone Number *</label>
                          <input type="text" className="form-control" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="0300-0000000" value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 0, display: 'block' }}>Discount Amount</label>
                          <input className="form-control" type="number" step="0.01" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 1 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 0, display: 'block' }}>Address *</label>
                        <textarea className="form-control" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="123 Main St" rows={1} value={customerInfo.address} onChange={e => setCustomerInfo(p => ({ ...p, address: e.target.value }))} />
                      </div>
                    </>
                  )}

                  {/* TAKEAWAY FORM */}
                  {customerInfo.orderType === 'Takeaway' && (
                    <>
                      <div className="form-group" style={{ marginBottom: 1 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 0, display: 'block' }}>Customer Name *</label>
                        <input type="text" className="form-control" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="Enter Name" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 1 }}>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 0, display: 'block' }}>Phone Number *</label>
                          <input type="text" className="form-control" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="0300-0000000" value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                          <label style={{ display: 'block', fontSize: 11, marginBottom: 0, color: 'var(--text-secondary)' }}>Discount Amount</label>
                          <input className="form-control" type="number" step="0.01" style={{ padding: '4px 6px', fontSize: 13 }} placeholder="0.00" value={customerInfo.discount} onChange={e => setCustomerInfo(p => ({ ...p, discount: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  )}



                  {paymentMethod !== 'Hold' && (
                    <div className="form-group" style={{ marginBottom: 1, marginTop: 'auto' }}>
                      <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Payment Method</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {['Cash', 'Online', 'Payment Pending'].map(pm => (
                          <button 
                            key={pm}
                            type="button"
                            onClick={() => setPaymentMethod(pm)}
                            style={{
                              flex: 1, 
                              padding: '8px 4px', 
                              fontSize: 13,
                              fontWeight: 600,
                              borderRadius: 6,
                              border: paymentMethod === pm || (pm==='Payment Pending' && paymentMethod==='Hold') ? '2px solid var(--primary)' : '1px solid var(--surface-2)',
                              background: paymentMethod === pm || (pm==='Payment Pending' && paymentMethod==='Hold') ? 'rgba(255,184,0,0.1)' : 'white',
                              color: paymentMethod === pm || (pm==='Payment Pending' && paymentMethod==='Hold') ? 'var(--primary)' : 'var(--text-secondary)',
                              cursor: 'pointer'
                            }}
                          >
                            {pm === 'Payment Pending' ? 'Pending' : pm}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ paddingTop: window.innerWidth <= 900 ? 12 : 4, paddingBottom: window.innerWidth <= 900 ? 12 : 0, display: 'flex', gap: window.innerWidth <= 900 ? 6 : 10, position: window.innerWidth <= 900 ? 'sticky' : 'static', bottom: window.innerWidth <= 900 ? -12 : 'auto', background: 'white', zIndex: 10, borderTop: window.innerWidth <= 900 ? '1px solid #eee' : 'none', marginTop: window.innerWidth <= 900 ? 12 : 0 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: window.innerWidth <= 900 ? '10px 4px' : '10px 16px', fontSize: window.innerWidth <= 900 ? 11 : 14 }} onClick={() => handlePlaceOrder(paymentMethod, false)} disabled={processing !== false}>
                      {processing === 'punch' ? 'Punching...' : 'Punch Only'}
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: window.innerWidth <= 900 ? '10px 4px' : '10px 16px', fontSize: window.innerWidth <= 900 ? 11 : 14 }} onClick={() => handlePlaceOrder(paymentMethod, true)} disabled={processing !== false}>
                      {processing === 'print' ? 'Processing...' : 'Print & Punch'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }
      {/* Quick Complete Modal */}
      {quickCompleteModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 360, padding: 24, textAlign: 'center' }}>
            <h3 style={{ marginBottom: 16 }}>Complete Order #{quickCompleteModal.id} (Slip #{quickCompleteModal.slip_number})</h3>
            
            {user?.role?.trim().toLowerCase() === 'order taker' ? (
              <>
                <div style={{ padding: '20px 0', fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Customer sent to counter for payment. Table is free.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" style={{ flex: '0 0 44px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setQuickCompleteModal(null)} title="Cancel">
                    <X size={20} />
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1, background: 'var(--primary)', color: '#fff' }} disabled={processing === 'quick-complete'} onClick={async () => {
                    if (processing) return;
                    setProcessing('quick-complete');
                    try {
                      await axios.patch(`/api/orders/${quickCompleteModal.id}/status`, { status: 'Payment Requested' });
                      toast.success('Sent to counter for payment');
                      setQuickCompleteModal(null);
                      fetchActiveOrders();
                    } catch(err) {
                      toast.error('Failed to update order');
                    } finally {
                      setProcessing(false);
                    }
                  }}>
                    {processing === 'quick-complete' ? 'Processing...' : 'Send to Counter'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', marginBottom: 24 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                    <input type="radio" name="quickPayment" value="Cash" checked={paymentMethod === 'Cash'} onChange={() => setPaymentMethod('Cash')} />
                    <span style={{ fontSize: 15, fontWeight: 500 }}>Cash</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                    <input type="radio" name="quickPayment" value="Online" checked={paymentMethod === 'Online'} onChange={() => setPaymentMethod('Online')} />
                    <span style={{ fontSize: 15, fontWeight: 500 }}>Online</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                    <input type="radio" name="quickPayment" value="Payment Pending" checked={paymentMethod === 'Payment Pending' || paymentMethod === 'Hold'} onChange={() => setPaymentMethod('Payment Pending')} />
                    <span style={{ fontSize: 15, fontWeight: 500 }}>Pending</span>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" style={{ flex: '0 0 44px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setQuickCompleteModal(null)} title="Cancel">
                    <X size={20} />
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: 13, padding: '8px 4px', display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }} disabled={processing === 'quick-complete' || processing === 'quick-complete-print'} onClick={async () => {
                    if (processing) return;
                    setProcessing('quick-complete');
                    const method = paymentMethod === 'Hold' ? 'Payment Pending' : paymentMethod;
                    try {
                      if (method === 'Payment Pending') {
                        await axios.patch(`/api/orders/${quickCompleteModal.id}/status`, { status: method })
                      } else {
                        await axios.patch(`/api/orders/${quickCompleteModal.id}/pay`, { payment_method: method })
                      }
                      toast.success('Order completed!')
                      setQuickCompleteModal(null)
                      fetchActiveOrders()
                    } catch(err) {
                      toast.error('Failed to complete order')
                    } finally {
                      setProcessing(false);
                    }
                  }}>{processing === 'quick-complete' ? 'Completing...' : 'Complete'}</button>
                  <button className="btn btn-success" style={{ flex: 1.2, fontSize: 13, padding: '8px 4px', display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }} disabled={processing === 'quick-complete' || processing === 'quick-complete-print'} onClick={async () => {
                    if (processing) return;
                    setProcessing('quick-complete-print');
                    const method = paymentMethod === 'Hold' ? 'Payment Pending' : paymentMethod;
                    try {
                      if (method === 'Payment Pending') {
                        await axios.patch(`/api/orders/${quickCompleteModal.id}/status`, { status: method })
                      } else {
                        await axios.patch(`/api/orders/${quickCompleteModal.id}/pay`, { payment_method: method })
                      }
                      toast.success('Order completed & printing!')
                      
                      const customInfo = {
                        name: quickCompleteModal.customer_name || '',
                        phone: quickCompleteModal.customer_phone || '',
                        address: quickCompleteModal.customer_address || '',
                        discount: quickCompleteModal.discount || 0,
                        orderType: quickCompleteModal.order_type || (quickCompleteModal.customer_address?.startsWith('Table ') ? 'Dine-In' : 'Delivery'),
                        tableNumber: quickCompleteModal.table_number || (quickCompleteModal.customer_address?.startsWith('Table ') ? quickCompleteModal.customer_address.replace('Table ', '') : ''),
                      }
                      
                      printThermalSlip(method, quickCompleteModal.id, quickCompleteModal.slip_number, quickCompleteModal.edit_count, true, null, quickCompleteModal.items, customInfo)
                      
                      setQuickCompleteModal(null)
                      fetchActiveOrders()
                    } catch(err) {
                      toast.error('Failed to complete & print order')
                    } finally {
                      setProcessing(false);
                    }
                  }}>{processing === 'quick-complete-print' ? 'Printing...' : 'Complete & Print'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Detail View Modal */}
      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} onEdit={(id) => { setDetailOrder(null); loadOrderForEdit(id); }} />}
      
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
      {showAddCategory && (
        <AddCategoryModal
          onClose={() => setShowAddCategory(false)}
          onCategoryAdded={(newCat) => {
            setCategories([...categories, newCat])
            setShowAddCategory(false)
          }}
        />
      )}
      
      {showManageTables && (
        <ManageTablesModal 
          onClose={() => setShowManageTables(false)} 
          onTableChange={() => fetchTablesList()} 
        />
      )}

      {/* Cancel Request Modal */}
      {cancelRequestModal && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setCancelRequestModal(null) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Request Cancel</h3>
              <button className="modal-close" onClick={() => setCancelRequestModal(null)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ marginBottom: 16, fontSize: 14 }}>Please provide a reason for cancelling <b>Order #{cancelRequestModal.id}</b>:</p>
              <textarea 
                className="form-control"
                style={{ width: '100%', height: 100, padding: 12, borderRadius: 8, border: '1px solid var(--surface-2)', marginBottom: 20, resize: 'none' }}
                placeholder="Type your reason here..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCancelRequestModal(null)}>Back</button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 2, background: 'var(--red)' }} 
                  onClick={handleRequestCancel}
                  disabled={processingCancel}
                >
                  {processingCancel ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Cancel Action Modal */}
      {confirmCancelAction && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Confirm Action</h2>
              <button className="btn-close" onClick={() => setConfirmCancelAction(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 16, marginBottom: 20 }}>
                Are you sure you want to <strong>{confirmCancelAction.action}</strong> this cancellation request?
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-secondary" style={{ padding: '10px 24px' }} onClick={() => setConfirmCancelAction(null)}>Close</button>
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '10px 24px', background: confirmCancelAction.action === 'approve' ? 'var(--green)' : 'var(--red)' }} 
                  onClick={executeActionCancel}
                  disabled={processingCancel}
                >
                  {processingCancel ? 'Processing...' : 'Yes, Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
