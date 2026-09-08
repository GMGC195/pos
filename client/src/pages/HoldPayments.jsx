import { useEffect, useState, useRef } from 'react'
import axios from '../api'
import { Clock, RefreshCw, Banknote, CreditCard, Sparkles, MoreVertical, Pencil, Trash2, Ban } from 'lucide-react'
import { CURRENCY } from '../config'
import OrderDetailModal from '../components/OrderDetailModal'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { socket } from '../socket'

export default function HoldPayments() {
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [branch, setBranch] = useState('All')
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelOrderTarget, setCancelOrderTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [processingCancel, setProcessingCancel] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()
  const { user } = useAuth()
  const role = user?.role?.trim().toLowerCase()
  const isAdmin = role === 'admin' || role === 'developer'

  const loadHeldOrders = () => {
    setLoading(true)
    // Fetch with a high limit to ensure summary accuracy
    axios.get('/api/orders', { params: { status: 'Hold,Payment Pending,Payment Requested', limit: 500, branch } })
      .then(res => setOrders(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadHeldOrders()
    const interval = setInterval(loadHeldOrders, 300000) // Auto-refresh every 5 mins

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    
    // Real-time socket events
    const handleOrderEvent = () => loadHeldOrders();
    socket.on('newOrder', handleOrderEvent);
    socket.on('orderUpdated', handleOrderEvent);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      clearInterval(interval)
      socket.off('newOrder', handleOrderEvent);
      socket.off('orderUpdated', handleOrderEvent);
    }
  }, [branch])

  const handlePay = (orderId, method) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Mark Order #{orderId} as paid via <b>{method}</b>?</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => toast.dismiss(t.id)}>No</button>
          <button 
            className="btn btn-success" 
            style={{ padding: '6px 12px', fontSize: 13, color: 'white' }} 
            onClick={async () => {
              toast.dismiss(t.id)
              try {
                await axios.patch(`/api/orders/${orderId}/pay`, { payment_method: method })
                toast.success('Payment successful!')
                loadHeldOrders() // Refresh the list
              } catch (err) {
                console.error(err)
                toast.error('Error updating payment: ' + (err?.response?.data?.error || err.message))
              }
            }}
          >
            Yes, Pay
          </button>
        </div>
      </div>
    ), { duration: Infinity, id: `confirm-pay-${orderId}`, position: 'top-center', style: { minWidth: 320 } })
  }

  const handleCancel = (orderId) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Mark Order #{orderId} as <b>CANCELLED</b>?</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => toast.dismiss(t.id)}>No</button>
          <button 
            className="btn btn-primary" 
            style={{ padding: '6px 12px', fontSize: 13, background: 'var(--red)', color: 'white' }} 
            onClick={async () => {
              toast.dismiss(t.id)
              try {
                await axios.patch(`/api/orders/${orderId}/void`, { type: 'Cancelled' })
                toast.success('Order cancelled successfully')
                loadHeldOrders()
              } catch (err) {
                console.error(err)
                toast.error('Error cancelling order: ' + (err?.response?.data?.error || err.message))
              }
            }}
          >
            Yes, Cancel
          </button>
        </div>
      </div>
    ), { duration: Infinity, id: 'confirm-cancel', position: 'top-center', style: { minWidth: 320 } })
  }

  const handleRequestCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Please provide a reason')
    setProcessingCancel(true)
    try {
      await axios.patch(`/api/orders/${cancelOrderTarget}/request-cancel`, { reason: cancelReason })
      toast.success('Cancellation request sent to Admin')
      setShowCancelModal(false)
      setCancelReason('')
      setCancelOrderTarget(null)
      loadHeldOrders()
    } catch (err) {
      toast.error('Failed to send request: ' + (err?.response?.data?.error || err.message))
    } finally {
      setProcessingCancel(false)
    }
  }

  const handleEdit = (orderId) => {
    navigate(`/pos?edit=${orderId}`)
  }

  const viewOrderDetail = async (orderId) => {
    try {
      const res = await axios.get(`/api/orders/${orderId}`)
      setSelectedOrder(res.data)
      setShowOrderDetails(true)
    } catch (err) {
      toast.error('Error fetching order details')
      console.error(err)
    }
  }

  const filteredOrders = orders.filter(o => 
    search ? o.id.toString().includes(search.trim()) : true
  )

  const totalHeldAmount = orders.reduce((sum, o) => sum + parseFloat(o.grand_total), 0)
  const todayHeldAmount = orders.filter(o => {
    const today = new Date().toLocaleDateString()
    const orderDate = new Date(o.created_at).toLocaleDateString()
    return today === orderDate
  }).reduce((sum, o) => sum + parseFloat(o.grand_total), 0)

  return (
    <>
      <div className="page-content" style={{ paddingTop: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 24,marginTop:-60 }}>
          <div className="stat-card" style={{ '--card-color': 'var(--orange)' }}>
            <div className="stat-icon" style={{ background: 'rgba(255, 107, 53, 0.1)', color: 'var(--orange)' }}>
              <Clock size={24} />
            </div>
            <div className="stat-info">
              <p>Total Held Amount</p>
              <h3>{CURRENCY}{totalHeldAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
          </div>
          <div className="stat-card" style={{ '--card-color': 'var(--yellow)' }}>
            <div className="stat-icon" style={{ background: 'rgba(255, 184, 0, 0.1)', color: 'var(--yellow)' }}>
              <Sparkles size={24} />
            </div>
            <div className="stat-info">
              <p>Today's Held Amount</p>
              <h3>{CURRENCY}{todayHeldAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} /> Held Orders List
              </h3>
              <input 
                type="text" 
                placeholder="Search Order ID..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                className="pos-search-input"
                style={{ padding: '6px 12px', border: '1px solid var(--surface-2)', borderRadius: 6, fontSize: 14 }}
              />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadHeldOrders} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={14} /> Refresh</button>

            {isAdmin && (
              <div style={{ width: '100%', display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 4, alignItems: 'center', gap: 4, overflowX: 'auto', marginTop: 8 }}>
                {['All', 'Branch 1', 'Branch 2', 'Branch 3'].map(b => (
                  <button
                    key={b}
                    onClick={() => setBranch(b)}
                    style={{
                      flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6,
                      background: branch === b ? 'var(--surface)' : 'transparent',
                      color: branch === b ? 'var(--primary)' : 'var(--text-muted)',
                      boxShadow: branch === b ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', textAlign: 'center'
                    }}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="table-wrap" style={{ minHeight: '300px' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Order ID</th>
                  <th>Placed By</th>
                  <th>Completed By</th>
                  <th>Branch</th>
                  <th>Type</th>
                  <th>Subtotal</th>
                  <th>Grand Total</th>
                  <th>Date & Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
            <tbody>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 18, width: '80%', borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                : filteredOrders.map(o => (
                    <tr key={o.id} onClick={() => viewOrderDetail(o.id)} style={{ cursor: 'pointer' }} className="hover-row">
                      <td style={{ fontWeight: 800, color: 'var(--red)', width: '60px' }}>{o.slip_number}</td>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="badge badge-warning">Order #{o.id} / {o.slip_number}</span>
                          {o.is_edited && <span className="badge badge-secondary" style={{ fontSize: 10, padding: '2px 6px', background: '#e5e7eb', color: '#4b5563' }}>Edited</span>}
                          {o.cancel_requested && <span className="badge badge-error" style={{ fontSize: 10, padding: '2px 6px' }}>Req. Pending</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.order_taker || '-'}</div>
                        {o.created_at && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.completed_by || '-'}</div>
                        {o.completed_at && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(o.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</div>}
                      </td>
                      <td>{o.branch || '-'}</td>
                      <td>{o.order_type || '-'}</td>
                      <td>{CURRENCY}{parseFloat(o.subtotal).toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--red)' }}>{CURRENCY}{parseFloat(o.grand_total).toFixed(2)}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          {role !== 'order taker' && (
                            <button 
                              className="btn btn-success btn-sm" 
                              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                              onClick={() => handlePay(o.id, 'Cash')}
                            >
                              <Banknote size={16} /> Pay Cash
                            </button>
                          )}
                          
                          <div style={{ position: 'relative' }}>
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '6px 8px' }}
                              onClick={() => setActiveMenu(activeMenu === o.id ? null : o.id)}
                            >
                              <MoreVertical size={16} />
                            </button>
                            
                            {activeMenu === o.id && (
                              <div 
                                ref={menuRef}
                                style={{ 
                                  position: 'absolute', 
                                  right: 0, 
                                  top: '100%', 
                                  marginTop: 8, 
                                  background: 'white', 
                                  boxShadow: '0 10px 25px rgba(0,0,0,0.15)', 
                                  borderRadius: 12, 
                                  zIndex: 1000, 
                                  width: 160,
                                  border: '1px solid var(--surface-2)',
                                  padding: '6px'
                                }}
                              >
                                {role !== 'order taker' && (
                                  <button onClick={() => handlePay(o.id, 'Card')} className="dropdown-item">
                                    <CreditCard size={16} color="#3b82f6" /> 
                                    <span>Pay Card</span>
                                  </button>
                                )}
                                <button onClick={() => handleEdit(o.id)} className="dropdown-item">
                                  <Pencil size={16} color="var(--text-secondary)" /> 
                                  <span>Edit Order</span>
                                </button>
                                {isAdmin || role === 'cashier' ? (
                                  <>
                                    <div style={{ height: 1, background: 'var(--surface-2)', margin: '4px' }} />
                                    <button onClick={() => handleCancel(o.id)} className="dropdown-item danger" style={{ color: 'var(--red)' }}>
                                      <Ban size={16} /> 
                                      <span>Cancel Order</span>
                                    </button>
                                  </>
                                ) : !o.cancel_requested && (
                                  <>
                                    <div style={{ height: 1, background: 'var(--surface-2)', margin: '4px' }} />
                                    <button 
                                      onClick={() => { setCancelOrderTarget(o.id); setShowCancelModal(true); setActiveMenu(null); }} 
                                      className="dropdown-item danger" 
                                      style={{ color: 'var(--orange)' }}
                                    >
                                      <Ban size={16} /> 
                                      <span>Request Cancel</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
              }
              {!loading && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    {orders.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <Sparkles size={48} color="var(--surface-2)" />
                        <p>No held payments found. All clear!</p>
                      </div>
                    ) : 'No order ID matches your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>

      {showOrderDetails && (
        <OrderDetailModal 
          order={selectedOrder} 
          onClose={() => { setShowOrderDetails(false); setSelectedOrder(null); }}
          onEdit={(id) => { setShowOrderDetails(false); setSelectedOrder(null); handleEdit(id); }}
        />
      )}

      {showCancelModal && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setShowCancelModal(false) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Request Cancellation</h3>
              <button className="modal-close" onClick={() => setShowCancelModal(false)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ marginBottom: 16, fontSize: 14 }}>Please provide a reason for cancelling <b>Order #{cancelOrderTarget}</b>:</p>
              <textarea 
                className="pos-search-input"
                style={{ width: '100%', height: 100, padding: 12, borderRadius: 8, border: '1px solid var(--surface-2)', marginBottom: 20, resize: 'none' }}
                placeholder="Manager needs to approve this request..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCancelModal(false)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 2, background: 'var(--orange)' }} 
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
    </>
  )
}
