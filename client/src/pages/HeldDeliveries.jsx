import { useEffect, useState, useRef } from 'react'
import axios from '../api'
import { Bike, Clock, RefreshCw, Banknote, CreditCard, Search, MapPin, Phone, User, CheckCircle2, Ban, Eye, Edit3 } from 'lucide-react'
import { CURRENCY } from '../config'
import OrderDetailModal from '../components/OrderDetailModal'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { socket } from '../socket'

export default function HeldDeliveries() {
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [branch, setBranch] = useState('All')
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelOrderTarget, setCancelOrderTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [processingCancel, setProcessingCancel] = useState(false)
  
  const navigate = useNavigate()
  const { user } = useAuth()
  const role = user?.role?.trim().toLowerCase()
  const isAdmin = role === 'admin' || role === 'developer'
  const isManagement = role === 'management'

  const loadHeldDeliveries = () => {
    setLoading(true)
    axios.get('/api/orders', { 
      params: { 
        status: 'Hold,Payment Pending,Payment Requested,Pending', 
        order_type: 'Delivery',
        limit: 500, 
        branch 
      } 
    })
      .then(res => setOrders(res.data || []))
      .catch(err => {
        console.error('Error fetching held deliveries:', err)
        toast.error('Failed to load held delivery orders')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadHeldDeliveries()
    const interval = setInterval(loadHeldDeliveries, 60000) // auto-refresh every minute

    const handleOrderEvent = () => loadHeldDeliveries()
    socket.on('newOrder', handleOrderEvent)
    socket.on('orderUpdated', handleOrderEvent)

    return () => {
      clearInterval(interval)
      socket.off('newOrder', handleOrderEvent)
      socket.off('orderUpdated', handleOrderEvent)
    }
  }, [branch])

  const handlePay = (orderId, method) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>
          Settle Delivery Order #{orderId} via <b>{method}</b>?
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => toast.dismiss(t.id)}>Cancel</button>
          <button 
            className="btn btn-success" 
            style={{ padding: '6px 12px', fontSize: 13, color: 'white' }} 
            onClick={async () => {
              toast.dismiss(t.id)
              try {
                await axios.patch(`/api/orders/${orderId}/pay`, { payment_method: method })
                toast.success(`Delivery #${orderId} marked as Paid & Completed!`)
                loadHeldDeliveries()
              } catch (err) {
                console.error(err)
                toast.error('Error updating payment: ' + (err?.response?.data?.error || err.message))
              }
            }}
          >
            Confirm Payment
          </button>
        </div>
      </div>
    ), { duration: Infinity, id: `confirm-pay-del-${orderId}`, position: 'top-center', style: { minWidth: 320 } })
  }

  const handleRequestCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Please provide a reason')
    setProcessingCancel(true)
    try {
      if (role !== 'order taker') {
        const formattedReason = `[CANCELLED] ${cancelReason}`
        await axios.patch(`/api/orders/${cancelOrderTarget}/void`, { type: 'Cancelled', reason: formattedReason })
        toast.success('Order Cancelled')
      } else {
        await axios.patch(`/api/orders/${cancelOrderTarget}/request-cancel`, { reason: cancelReason })
        toast.success('Cancellation request sent to Admin')
      }
      setShowCancelModal(false)
      setCancelReason('')
      setCancelOrderTarget(null)
      loadHeldDeliveries()
    } catch (err) {
      toast.error('Failed to send cancel request: ' + (err?.response?.data?.error || err.message))
    } finally {
      setProcessingCancel(false)
    }
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

  const formatElapsed = (dateStr) => {
    if (!dateStr) return ''
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    return `${diffHours}h ${diffMins % 60}m ago`
  }

  const filteredOrders = orders.filter(o => {
    if (!search) return true
    const q = search.trim().toLowerCase()
    return (
      o.id.toString().includes(q) ||
      (o.slip_number && o.slip_number.toLowerCase().includes(q)) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
      (o.customer_phone && o.customer_phone.includes(q)) ||
      (o.customer_address && o.customer_address.toLowerCase().includes(q))
    )
  })

  const totalHeldAmount = orders.reduce((sum, o) => sum + parseFloat(o.grand_total || 0), 0)
  const todayHeldOrders = orders.filter(o => {
    const today = new Date().toLocaleDateString()
    const orderDate = new Date(o.created_at).toLocaleDateString()
    return today === orderDate
  })
  const todayHeldAmount = todayHeldOrders.reduce((sum, o) => sum + parseFloat(o.grand_total || 0), 0)

  return (
    <div style={{ padding: '0 12px 24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* Top Header Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
              <Bike size={22} style={{ color: 'var(--primary)' }} /> Held Delivery Orders & Dispatch
            </h3>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search ID, Name, Phone, Address..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '7px 12px 7px 32px', border: '1px solid var(--surface-2)', borderRadius: 8, fontSize: 13, width: 260 }}
              />
            </div>
          </div>

          {(isAdmin || isManagement) && (
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 4, alignItems: 'center', gap: 4 }}>
              {['All', 'Branch 1', 'Branch 2', 'Branch 3'].map(b => (
                <button
                  key={b}
                  onClick={() => setBranch(b)}
                  style={{
                    padding: '4px 12px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 6,
                    background: branch === b ? 'var(--surface)' : 'transparent',
                    color: branch === b ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: branch === b ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'
                  }}
                >
                  {b.replace('Branch ', 'B')}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255, 184, 0, 0.1)', padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255, 184, 0, 0.3)', fontWeight: 700, fontSize: 13, color: '#b45309' }}>
              Pending Deliveries: {orders.length}
            </div>
            <div style={{ background: 'var(--surface-2)', padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              Total Value: {CURRENCY} {totalHeldAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadHeldDeliveries} title="Refresh" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px' }}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Deliveries Grid / Table */}
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: 8 }} />
              <div>Loading held deliveries...</div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Bike size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>No active held delivery orders.</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>All deliveries are completed or no orders are on hold.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {filteredOrders.map(o => {
                const elapsed = formatElapsed(o.created_at)
                return (
                  <div 
                    key={o.id} 
                    style={{ 
                      background: 'var(--surface)', 
                      border: '1.5px solid var(--surface-2)', 
                      borderRadius: 12, 
                      padding: 16, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 12,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                      position: 'relative'
                    }}
                  >
                    {/* Card Top: Order ID, Slip, Time */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>
                            #{o.slip_number || o.id}
                          </span>
                          <span className="badge badge-warning" style={{ fontSize: 11, padding: '2px 8px' }}>
                            Order #{o.id}
                          </span>
                          {o.branch && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                              {o.branch}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          <Clock size={12} />
                          <span>{elapsed}</span>
                          <span>•</span>
                          <span>{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                          {CURRENCY} {parseFloat(o.grand_total || 0).toFixed(2)}
                        </div>
                        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', fontSize: 11, fontWeight: 600 }}>
                          {o.status || 'Hold'}
                        </span>
                      </div>
                    </div>

                    {/* Customer Info Box */}
                    <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <User size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          {o.customer_name || 'Walk-in / Unnamed Customer'}
                        </span>
                        {o.customer_phone && (
                          <a 
                            href={`tel:${o.customer_phone}`} 
                            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
                          >
                            <Phone size={12} /> {o.customer_phone}
                          </a>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 2 }}>
                        <MapPin size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'break-word', fontWeight: 500 }}>
                          {o.customer_address || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No delivery address specified</span>}
                        </span>
                      </div>
                    </div>

                    {/* Items preview */}
                    {Array.isArray(o.items) && o.items.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxHeight: 60, overflowY: 'auto' }}>
                        {o.items.map((it, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                            <span>{it.quantity || 1}x {it.name || it.item_name}</span>
                            <span>{CURRENCY} {((parseFloat(it.price || it.unit_price || 0)) * (it.quantity || 1)).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Card Actions */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--surface-2)' }}>
                      <button 
                        onClick={() => viewOrderDetail(o.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, padding: '7px' }}
                        title="View Slip / Print"
                      >
                        <Eye size={14} /> Slip
                      </button>

                      <button 
                        onClick={() => navigate(`/pos?edit=${o.id}`)}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, padding: '7px' }}
                        title="Edit Order in POS"
                      >
                        <Edit3 size={14} />
                      </button>

                      {!isManagement && (
                        <>
                          <button 
                            onClick={() => handlePay(o.id, 'Cash')}
                            className="btn btn-success btn-sm"
                            style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'white', fontWeight: 700, padding: '7px' }}
                            title="Settle with Cash & Complete Dispatch"
                          >
                            <Banknote size={14} /> Pay Cash
                          </button>

                          <button 
                            onClick={() => handlePay(o.id, 'Card')}
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'white', fontWeight: 700, padding: '7px' }}
                            title="Settle with Card & Complete Dispatch"
                          >
                            <CreditCard size={14} /> Pay Card
                          </button>
                        </>
                      )}

                      <button 
                        onClick={() => {
                          setCancelOrderTarget(o.id)
                          setShowCancelModal(true)
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '6px' }}
                        title="Cancel Order"
                      >
                        <Ban size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 400, borderRadius: 12, padding: 20 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ban size={18} /> Cancel Delivery Order #{cancelOrderTarget}
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Please provide a cancellation reason:
            </p>
            <textarea 
              rows={3} 
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="e.g. Customer cancelled, address unreachable..."
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--surface-2)', outline: 'none', fontSize: 13, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowCancelModal(false)} disabled={processingCancel}>
                Dismiss
              </button>
              <button 
                className="btn btn-primary" 
                style={{ background: 'var(--red)', color: 'white' }}
                onClick={handleRequestCancel}
                disabled={processingCancel}
              >
                {processingCancel ? 'Processing...' : (role === 'order taker' ? 'Send Cancel Request' : 'Confirm Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {showOrderDetails && selectedOrder && (
        <OrderDetailModal 
          order={selectedOrder} 
          onClose={() => {
            setShowOrderDetails(false)
            setSelectedOrder(null)
          }} 
        />
      )}
    </div>
  )
}

