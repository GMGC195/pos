import { useEffect, useState } from 'react'
import axios from '../api'
import { AlertTriangle, Clock, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

export default function EditAttendanceLogs() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('overtime') // 'overtime' | 'audit' | 'requests'
  const [logs, setLogs] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [month, setMonth] = useState('') // format: YYYY-MM

  // Forwarding States
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [forwardTargetId, setForwardTargetId] = useState(null)
  const [operatorReason, setOperatorReason] = useState('')
  const [forwardSubmitting, setForwardSubmitting] = useState(false)

  const loadLogs = () => {
    setLoading(true)
    axios.get('/api/attendance/edited-logs', {
      params: {
        page,
        limit: 10,
        month: month || undefined
      }
    })
      .then(res => {
        setLogs(res.data.logs || [])
        setTotalPages(res.data.pages || 1)
      })
      .catch((err) => toast.error(err.response?.data?.error || 'Error loading edit audit logs'))
      .finally(() => setLoading(false))
  }

  const loadRequests = () => {
    setLoading(true)
    axios.get('/api/attendance/edit-requests')
      .then(res => {
        setRequests(res.data || [])
      })
      .catch(() => toast.error('Error loading pending edit requests'))
      .finally(() => setLoading(false))
  }

  const handleRequestAction = (requestId, action) => {
    axios.post(`/api/attendance/edit-requests/${requestId}/action`, { action })
      .then(res => {
        toast.success(res.data.message || `Request ${action}ed successfully`)
        loadRequests()
      })
      .catch(err => {
        toast.error(err.response?.data?.error || `Failed to ${action} request`)
      })
  }

  const handleForwardSubmit = (e) => {
    e.preventDefault();
    if (!operatorReason.trim()) {
      toast.error('Forward reason is required');
      return;
    }
    setForwardSubmitting(true);
    axios.post(`/api/attendance/edit-requests/${forwardTargetId}/forward`, { reason: operatorReason })
      .then(res => {
        toast.success(res.data.message || 'Request forwarded to Admin successfully');
        setShowForwardModal(false);
        setOperatorReason('');
        loadRequests();
      })
      .catch(err => {
        toast.error(err.response?.data?.error || 'Failed to forward request');
      })
      .finally(() => {
        setForwardSubmitting(false);
      });
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      loadLogs();
      // Background load requests to show count immediately
      axios.get('/api/attendance/edit-requests')
        .then(res => setRequests(res.data || []))
        .catch(() => {});
    } else {
      loadRequests();
    }
  }, [page, month, activeTab])

  const formatDateTime = (isoString) => {
    if (!isoString) return '--'
    return new Date(isoString).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="page-content" style={{ paddingTop: 0 }}>
      {/* Header and Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: -60, flexWrap: 'wrap', gap: 16 }}>
        <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={24} style={{ color: 'var(--red)' }} /> Attendance logs and requests
        </h3>
        
        {/* Filters & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {activeTab === 'audit' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Month Filter:</label>
              <input 
                type="month" 
                value={month} 
                onChange={e => { setMonth(e.target.value); setPage(1); }} 
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1.5px solid var(--surface-2)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontWeight: 600,
                  outline: 'none'
                }}
              />
              {month && (
                <button 
                  className="btn btn-secondary" 
                  onClick={() => { setMonth(''); setPage(1); }} 
                  style={{ padding: '6px 10px', fontSize: 12 }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
          
          <button className="btn btn-secondary" onClick={activeTab === 'audit' ? loadLogs : loadRequests} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--surface-2)', marginBottom: 20, gap: 16 }}>
        <button 
          onClick={() => { setActiveTab('overtime'); setPage(1); }}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'overtime' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'overtime' ? '3px solid var(--primary)' : '3px solid transparent',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            marginBottom: -2
          }}
        >
          Overtime ({requests.filter(r => r.request_type === 'Overtime' && r.status === 'Pending').length})
        </button>
        <button 
          onClick={() => { setActiveTab('audit'); setPage(1); }}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'audit' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'audit' ? '3px solid var(--primary)' : '3px solid transparent',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            marginBottom: -2
          }}
        >
          Audit Logs
        </button>
        <button 
          onClick={() => { setActiveTab('requests'); setPage(1); }}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'requests' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'requests' ? '3px solid var(--primary)' : '3px solid transparent',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            marginBottom: -2
          }}
        >
          Pending Correction Requests ({requests.filter(r => r.request_type !== 'Overtime' && r.status === 'Pending').length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading data...
        </div>
      ) : activeTab === 'audit' ? (
        logs.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <Clock size={48} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
            <h3>No Edited Records</h3>
            <p style={{ color: 'var(--text-muted)' }}>No attendance check-in/check-out edits have been recorded for this view.</p>
          </div>
        ) : (
          <>
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
              <div className="table-wrap">
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-1)' }}>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Code</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Employee Name</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Original In</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Original Out</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>New In</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>New Out</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Edited By</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Reason for Change</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, index) => {
                      const rowBg = index % 2 === 0 ? 'var(--surface)' : 'rgba(var(--primary-rgb), 0.025)'
                      return (
                        <tr 
                          key={log.id} 
                          style={{ 
                            background: rowBg, 
                            borderBottom: '1px solid var(--surface-2)',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(var(--primary-rgb), 0.06)'}
                          onMouseOut={e => e.currentTarget.style.background = rowBg}
                        >
                          <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{log.employee_code}</td>
                          <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700 }}>{log.employee_name}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>{formatDateTime(log.original_check_in)}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>{formatDateTime(log.original_check_out)}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>{formatDateTime(log.new_check_in)}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>{formatDateTime(log.new_check_out)}</td>
                          <td style={{ padding: '12px 14px', fontSize: 13 }}>{log.edited_by}</td>
                          <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>{log.reason}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, textAlign: 'center' }}>{formatDateTime(log.edited_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                Page {page} of {totalPages}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, height: 36, padding: '0 12px' }}
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, height: 36, padding: '0 12px' }}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )
      ) : (
        (() => {
          const filteredReqs = activeTab === 'overtime' 
            ? requests.filter(r => r.request_type === 'Overtime')
            : requests.filter(r => r.request_type !== 'Overtime');

          return filteredReqs.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <Clock size={48} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <h3>No Pending {activeTab === 'overtime' ? 'Overtime' : 'Requests'}</h3>
              <p style={{ color: 'var(--text-muted)' }}>There are no pending {activeTab === 'overtime' ? 'overtime' : 'attendance correction'} requests to review.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-1)' }}>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Code</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Employee Name</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Requested By</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Type</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Date</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Original In/Out</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Requested In/Out</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Reason</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReqs.map((req, index) => {
                    const rowBg = index % 2 === 0 ? 'var(--surface)' : 'rgba(var(--primary-rgb), 0.025)'
                    const logDate = req.attendance_date ? new Date(req.attendance_date).toLocaleDateString() : '--';
                    
                    const attendanceDate = new Date(req.attendance_date);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    const isOlderThanYesterday = attendanceDate < yesterday;

                    return (
                      <tr key={req.id} style={{ background: rowBg, borderBottom: '1px solid var(--surface-2)' }}>
                        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{req.employee_code}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700 }}>{req.employee_name}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{req.requested_by_username || '-'}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center' }}>
                          <span style={{ 
                            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                            background: req.request_type === 'Overtime' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                            color: req.request_type === 'Overtime' ? '#8b5cf6' : '#3b82f6'
                          }}>
                            {req.request_type || 'Edit'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center' }}>{logDate}</td>
                        <td style={{ padding: '12px 14px', fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>
                          <div>In: {formatDateTime(req.original_check_in)}</div>
                          <div>Out: {formatDateTime(req.original_check_out)}</div>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12, textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>
                          {req.request_type === 'Overtime' ? (
                            <>
                              <div style={{ color: 'var(--text-muted)', fontWeight: 500 }}>--</div>
                              <div>Out: {formatDateTime(req.requested_check_out)}</div>
                            </>
                          ) : (
                            <>
                              <div>In: {formatDateTime(req.requested_check_in)}</div>
                              <div>Out: {formatDateTime(req.requested_check_out)}</div>
                            </>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500 }}>{req.reason}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span style={{ 
                            padding: '3px 8px', 
                            borderRadius: 6, 
                            fontSize: 11, 
                            fontWeight: 700,
                            background: req.status === 'Pending' ? 'rgba(244, 180, 0, 0.1)' : req.status === 'Approved' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: req.status === 'Pending' ? '#F4B400' : req.status === 'Approved' ? 'var(--green)' : 'var(--red)'
                          }}>
                            {req.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {req.status === 'Pending' ? (
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                              {user?.role?.toLowerCase() === 'operator' && isOlderThanYesterday ? (
                                <button 
                                  className="btn btn-primary" 
                                  onClick={() => {
                                    setForwardTargetId(req.id);
                                    setShowForwardModal(true);
                                  }}
                                  style={{ padding: '4px 8px', fontSize: 11, background: '#ffc107', borderColor: '#ffc107', color: '#000' }}
                                >
                                  Forward
                                </button>
                              ) : (
                                <button 
                                  className="btn btn-primary" 
                                  onClick={() => handleRequestAction(req.id, 'Approve')}
                                  style={{ padding: '4px 8px', fontSize: 11, background: 'var(--green)', borderColor: 'var(--green)' }}
                                >
                                  Approve
                                </button>
                              )}
                              <button 
                                className="btn btn-secondary" 
                                onClick={() => handleRequestAction(req.id, 'Reject')}
                                style={{ padding: '4px 8px', fontSize: 11, color: 'var(--red)', borderColor: 'var(--red)' }}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Processed</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )
        })()
      )}

      {/* Forward Modal */}
      {showForwardModal && (
        <div style={{
          position: 'fixed', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          padding: 20
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 400, padding: 25, borderRadius: 12, background: 'var(--surface)', animation: 'scaleUp 0.2s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Forward Request to Admin</h4>
              <button onClick={() => setShowForwardModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleForwardSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                This attendance correction request is older than yesterday. As an Operator, you must forward it to the Admin for approval.
              </p>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Reason for Forwarding</label>
                <textarea 
                  required 
                  placeholder="E.g. Please approve this historical correction as requested..." 
                  value={operatorReason} 
                  onChange={e => setOperatorReason(e.target.value)} 
                  rows={3} 
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', resize: 'vertical' }} 
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForwardModal(false)} style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={forwardSubmitting} style={{ flex: 1, background: '#ffc107', borderColor: '#ffc107', color: '#000' }}>
                  {forwardSubmitting ? 'Forwarding...' : 'Forward to Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
