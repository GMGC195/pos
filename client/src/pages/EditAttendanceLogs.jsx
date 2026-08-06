import { useEffect, useState } from 'react'
import axios from '../api'
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function EditAttendanceLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const loadLogs = () => {
    setLoading(true)
    axios.get('/api/attendance/edited-logs')
      .then(res => setLogs(res.data))
      .catch(() => toast.error('Error loading edit audit logs'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLogs()
  }, [])

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: -60 }}>
        <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={24} style={{ color: 'var(--red)' }} /> Edit Attendance Audit Logs
        </h3>
        <button className="btn btn-secondary" onClick={loadLogs} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading audit logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <Clock size={48} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3>No Edited Records</h3>
          <p style={{ color: 'var(--text-muted)' }}>No attendance check-in/check-out edits have been recorded yet.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
      )}
    </div>
  )
}
