import { useEffect, useState, Fragment } from 'react'
import { useAuth } from '../contexts/AuthContext'
import axios from '../api'
import { Ban, CheckCircle2, XCircle, Clock, Trash2, RefreshCw, MessageSquare } from 'lucide-react'
import { CURRENCY } from '../config'
import toast from 'react-hot-toast'
import OrderDetailModal from '../components/OrderDetailModal'

export default function CancelRequests() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [processingId, setProcessingId] = useState(null)

  const loadRequests = () => {
    setLoading(true)
    axios.get('/api/orders', { params: { cancel_requested: true, limit: 500 } })
      .then(res => {
        setRequests(res.data)
      })
      .catch(() => toast.error('Error loading requests'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadRequests()
    const interval = setInterval(loadRequests, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleAction = async (orderId, action) => {
    if (!window.confirm(`Are you sure you want to ${action} this cancellation request?`)) return
    
    setProcessingId(orderId)
    try {
      await axios.patch(`/api/orders/${orderId}/handle-cancel-request`, { action })
      toast.success(action === 'approve' ? 'Order Cancelled!' : 'Request Rejected!')
      loadRequests()
    } catch (err) {
      toast.error('Failed to process request: ' + (err?.response?.data?.error || err.message))
    } finally {
      setProcessingId(null)
    }
  }

  const viewOrderDetail = async (orderId) => {
    try {
      const res = await axios.get(`/api/orders/${orderId}`)
      setSelectedOrder(res.data)
      setShowOrderDetails(true)
    } catch {
      toast.error('Error fetching order details')
    }
  }

  return (
    <div className="page-content" style={{ paddingTop: 0 }}>
      {/* Header Stat */}
      <div style={{ marginBottom: 24, marginTop: -60 }}>
        <div className="stat-card" style={{ '--card-color': 'var(--red)', maxWidth: 300 }}>
          <div className="stat-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)' }}>
            <Ban size={24} />
          </div>
          <div className="stat-info">
            <p>Pending Requests</p>
            <h3>{requests.length} Orders</h3>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ban size={16} /> Cancellation Requests
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={loadRequests} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="table-wrap" style={{ minHeight: '300px' }}>
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Total</th>
                <th>Requested At</th>
                <th>Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 18, width: '80%', borderRadius: 4 }} /></td>
                    ))}
                  </tr>
                ))
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <CheckCircle2 size={48} color="var(--surface-2)" />
                      <p>No pending cancellation requests.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                [...new Set(requests.map(r => r.branch || 'Unknown Branch'))].map(branch => (
                  <Fragment key={branch}>
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--surface-2)', fontWeight: 700, textAlign: 'center', padding: '12px' }}>
                        {branch}
                      </td>
                    </tr>
                    {requests.filter(r => (r.branch || 'Unknown Branch') === branch).map(order => (
                      <tr key={order.id} onClick={() => viewOrderDetail(order.id)} style={{ cursor: 'pointer' }} className="hover-row">
                        <td><span className="badge badge-warning">Order #{order.id}</span></td>
                        <td style={{ fontWeight: 700 }}>{CURRENCY}{parseFloat(order.grand_total).toFixed(2)}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(order.created_at).toLocaleString()}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontSize: 13 }}>
                            <MessageSquare size={14} className="text-muted" />
                            <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {order.cancel_reason || 'No reason provided'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                            {order.status === 'Completed' && !['admin', 'developer'].includes(user?.role?.trim().toLowerCase()) ? (
                              <span className="badge badge-warning" style={{ fontSize: 11, padding: '4px 8px' }}>Request Pending (Admin Approval Required)</span>
                            ) : (
                              <>
                                <button 
                                  className="btn btn-success btn-sm" 
                                  style={{ padding: '6px 12px' }}
                                  onClick={() => handleAction(order.id, 'approve')}
                                  disabled={processingId === order.id}
                                >
                                  Approve
                                </button>
                                <button 
                                  className="btn btn-secondary btn-sm" 
                                  style={{ padding: '6px 12px', color: 'var(--red)' }}
                                  onClick={() => handleAction(order.id, 'reject')}
                                  disabled={processingId === order.id}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showOrderDetails && (
        <OrderDetailModal 
          order={selectedOrder} 
          onClose={() => { setShowOrderDetails(false); setSelectedOrder(null); }} 
        />
      )}
    </div>
  )
}
