import { useEffect, useState } from 'react'
import axios from '../api'
import { CalendarRange, Search, RefreshCw, FileText, User } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AttendanceReports() {
  const [reports, setReports] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedEmployee, setSelectedEmployee] = useState('All')

  // Load employees for filter dropdown
  useEffect(() => {
    axios.get('/api/employees')
      .then(res => setEmployees(res.data))
      .catch(() => toast.error('Error loading employees'))
  }, [])

  const loadReports = () => {
    setLoading(true)
    const params = {}
    if (selectedMonth) params.month = selectedMonth
    if (selectedEmployee !== 'All') params.employee_id = selectedEmployee

    axios.get('/api/attendance/reports', { params })
      .then(res => setReports(res.data))
      .catch(() => toast.error('Error loading reports'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadReports()
  }, [selectedMonth, selectedEmployee])

  // Aggregate metrics
  const totalHours = reports.reduce((sum, r) => sum + (r.hours_worked || 0), 0)
  const totalPresent = reports.filter(r => r.status === 'Present').length
  const totalLate = reports.filter(r => r.status === 'Late').length
  
  const formatBreakDuration = (seconds) => {
    if (!seconds) return '0 min'
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins} mins`
    const hrs = (mins / 60).toFixed(1)
    return `${hrs} hrs`
  }

  return (
    <div className="page-content" style={{ paddingTop: 0 }}>
      {/* Header and Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, marginTop: -60, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ '--card-color': 'var(--primary)', minWidth: 200, padding: '16px 20px' }}>
          <div className="stat-icon" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>
            <CalendarRange size={22} />
          </div>
          <div className="stat-info">
            <p>Total Working Hours</p>
            <h3>{totalHours.toFixed(1)} hrs</h3>
          </div>
        </div>
        <div className="stat-card" style={{ '--card-color': 'var(--green)', minWidth: 200, padding: '16px 20px' }}>
          <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)' }}>
            <CheckCircleIcon size={22} />
          </div>
          <div className="stat-info">
            <p>On-Time Presences</p>
            <h3>{totalPresent} days</h3>
          </div>
        </div>
        <div className="stat-card" style={{ '--card-color': '#F97316', minWidth: 200, padding: '16px 20px' }}>
          <div className="stat-icon" style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#F97316' }}>
            <AlertTriangleIcon size={22} />
          </div>
          <div className="stat-info">
            <p>Late Presences</p>
            <h3>{totalLate} days</h3>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8, marginRight: 'auto' }}>
            <FileText size={18} style={{ color: 'var(--primary)' }} /> Monthly Attendance Log
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Month:</span>
            <input 
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '8px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Employee:</span>
            <select 
              value={selectedEmployee} 
              onChange={e => setSelectedEmployee(e.target.value)}
              style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '8px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
            >
              <option value="All">All Staff</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <button className="btn btn-secondary" onClick={loadReports} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Reports Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee Name</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Breaks</th>
                <th>Net Hours</th>
                <th>Standard</th>
                <th>Overtime (OT)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    Generating reports...
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    No attendance logs found for this filter criteria.
                  </td>
                </tr>
              ) : (
                reports.map(rep => (
                  <tr key={rep.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{new Date(rep.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 650 }}>{rep.name}</div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rep.role} • <strong>Shift {rep.shift || 'R1'}</strong></span>
                    </td>
                    <td>
                      {new Date(rep.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      {rep.check_out ? (
                        new Date(rep.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Checked In / Active</span>
                      )}
                    </td>
                    <td>{formatBreakDuration(rep.total_break_duration_seconds)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>
                      {rep.check_out ? `${parseFloat(rep.hours_worked || 0).toFixed(2)} hrs` : '--'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {parseFloat(rep.shift_hours || 12.0).toFixed(1)} hrs
                    </td>
                    <td style={{ 
                      fontWeight: 700, 
                      color: rep.ot_hours > 0 ? 'var(--green)' : rep.ot_hours < 0 ? 'var(--red)' : 'var(--text)'
                    }}>
                      {rep.check_out ? `${rep.ot_hours > 0 ? '+' : ''}${parseFloat(rep.ot_hours || 0).toFixed(2)} hrs` : '--'}
                    </td>
                    <td>
                      <span style={{ 
                        background: rep.status === 'Late' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                        color: rep.status === 'Late' ? '#F97316' : 'var(--green)',
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600
                      }}>
                        {rep.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Inline fallback icons for consistency and simplicity
function CheckCircleIcon({ size }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function AlertTriangleIcon({ size }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
