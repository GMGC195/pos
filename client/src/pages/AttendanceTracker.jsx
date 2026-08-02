import { useEffect, useState } from 'react'
import axios from '../api'
import { Fingerprint, Play, Square, Coffee, Check, Clock, User, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AttendanceTracker() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [lateThreshold, setLateThreshold] = useState('09:00')

  const loadAttendance = () => {
    setLoading(true)
    axios.get('/api/attendance/today')
      .then(res => setEmployees(res.data))
      .catch(() => toast.error('Error loading attendance data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadAttendance()
    // Poll every 30 seconds to keep timers/status updated
    const interval = setInterval(loadAttendance, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleCheckIn = async (empId) => {
    try {
      await axios.post('/api/attendance/check-in', { employee_id: empId, late_threshold: lateThreshold })
      toast.success('Successfully Checked In!')
      loadAttendance()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to check in')
    }
  }

  const handleCheckOut = async (empId, name) => {
    if (!window.confirm(`Are you sure you want to Check Out "${name}"?`)) return
    try {
      await axios.post('/api/attendance/check-out', { employee_id: empId })
      toast.success('Successfully Checked Out!')
      loadAttendance()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to check out')
    }
  }

  const handleToggleBreak = async (empId) => {
    try {
      const res = await axios.post('/api/attendance/toggle-break', { employee_id: empId })
      toast.success(res.data.on_break ? 'Break Started!' : 'Break Ended!')
      loadAttendance()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to toggle break')
    }
  }

  // Get color and status text for badges
  const getStatusBadge = (emp) => {
    if (!emp.attendance_id || emp.check_out) {
      return { text: 'Checked Out', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.1)' }
    }
    if (emp.on_break) {
      return { text: 'On Break', color: 'var(--primary)', bg: 'rgba(var(--primary-rgb), 0.1)' }
    }
    if (emp.attendance_status === 'Late') {
      return { text: 'Late Arrivals', color: '#F97316', bg: 'rgba(249, 115, 22, 0.1)' }
    }
    return { text: 'Present / Active', color: 'var(--green)', bg: 'rgba(34, 197, 94, 0.1)' }
  }

  return (
    <div className="page-content" style={{ paddingTop: 0 }}>
      {/* Header with setting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: -60, flexWrap: 'wrap', gap: 16 }}>
        <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Fingerprint size={24} style={{ color: 'var(--primary)' }} /> Today's Attendance Panel
        </h3>
      </div>

      {/* Grid view of employees */}
      {loading && employees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading staff details...
        </div>
      ) : employees.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <User size={48} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3>No Employees Found</h3>
          <p style={{ color: 'var(--text-muted)' }}>Please register employees in the "Manage Employees" tab first.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {employees.map(emp => {
            const badge = getStatusBadge(emp);
            const isCheckedIn = emp.attendance_id && !emp.check_out;
            const isOnBreak = emp.on_break;

            return (
              <div key={emp.employee_id} className="card" style={{ 
                padding: 20, 
                borderLeft: `4px solid ${badge.color}`, 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between',
                transition: 'transform 0.2s',
                transform: isCheckedIn ? 'scale(1.01)' : 'scale(1)'
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{emp.name}</h4>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {emp.role || 'Staff'} • <strong>Shift {emp.shift || 'R1'}</strong>
                      </span>
                    </div>
                    <span style={{ 
                      color: badge.color, 
                      background: badge.bg, 
                      padding: '3px 8px', 
                      borderRadius: 6, 
                      fontSize: 11, 
                      fontWeight: 600 
                    }}>{badge.text}</span>
                  </div>

                  {!isCheckedIn && (
                    <div style={{ background: 'var(--surface-1)', padding: '8px 12px', border: '1px dashed var(--surface-3)', borderRadius: 8, fontSize: 12, marginBottom: 14, color: 'var(--text-secondary)' }}>
                      <strong>Shift Details:</strong> {emp.shift === 'R2' ? 'R2 (09:00 AM - 12 hrs)' : emp.shift === 'R3' ? 'R3 (03:00 PM - 13 hrs)' : 'R1 (10:00 AM - 13 hrs)'}
                    </div>
                  )}

                  {isCheckedIn && (
                    <div style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Checked In:</span>
                        <span style={{ fontWeight: 600 }}>{new Date(emp.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Hours Worked:</span>
                        <span style={{ fontWeight: 600, color: 'var(--green)' }}>{parseFloat(emp.total_hours_today || 0).toFixed(2)} hrs</span>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  {!isCheckedIn ? (
                    <button 
                      className="btn btn-primary" 
                      onClick={() => handleCheckIn(emp.employee_id)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px' }}
                    >
                      <Play size={14} /> Check In
                    </button>
                  ) : (
                    <>
                      <button 
                        className={`btn ${isOnBreak ? 'btn-primary' : 'btn-secondary'}`} 
                        onClick={() => handleToggleBreak(emp.employee_id)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px' }}
                      >
                        <Coffee size={14} /> {isOnBreak ? 'End Break' : 'Break'}
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => handleCheckOut(emp.employee_id, emp.name)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px', color: 'var(--red)', borderColor: 'var(--red)' }}
                      >
                        <Square size={14} /> Check Out
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
