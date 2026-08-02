import { useEffect, useState } from 'react'
import axios from '../api'
import { Fingerprint, Play, Square, Coffee, Check, Clock, User, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const confirmAction = (message, onConfirm) => {
  toast((t) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px' }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
        {message}
      </span>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button 
          onClick={() => toast.dismiss(t.id)}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1.5px solid var(--surface-3)',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            color: 'var(--text-muted)'
          }}
        >
          Cancel
        </button>
        <button 
          onClick={() => {
            toast.dismiss(t.id);
            onConfirm();
          }}
          style={{
            padding: '6px 12px',
            background: 'var(--primary)',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            color: 'white'
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  ), {
    duration: 10000,
    position: 'top-center',
    style: {
      background: 'var(--surface)',
      border: '1.5px solid var(--surface-2)',
      borderRadius: 12,
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      padding: '12px 16px',
      minWidth: 280
    }
  });
};

export default function AttendanceTracker() {
  const [employees, setEmployees] = useState(() => {
    const cached = localStorage.getItem('pizza_shop_attendance_today')
    return cached ? JSON.parse(cached) : []
  })
  const [loading, setLoading] = useState(() => {
    const cached = localStorage.getItem('pizza_shop_attendance_today')
    return !cached // Only show spinner if no cache exists at all
  })
  const [lateThreshold, setLateThreshold] = useState('09:00')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState('All')
  const [pendingActions, setPendingActions] = useState({})
  const [restaurantOnBreak, setRestaurantOnBreak] = useState(() => localStorage.getItem('pizza_shop_restaurant_on_break') === 'true')

  const loadAttendance = (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    axios.get('/api/attendance/today')
      .then(res => {
        setEmployees(res.data)
        localStorage.setItem('pizza_shop_attendance_today', JSON.stringify(res.data))
      })
      .catch(() => {
        const cached = localStorage.getItem('pizza_shop_attendance_today')
        if (cached && employees.length === 0) {
          setEmployees(JSON.parse(cached))
        }
      })
      .finally(() => {
        if (showSpinner) setLoading(false)
      })
  }

  const queueAttendanceAction = (action) => {
    const queue = JSON.parse(localStorage.getItem('pizza_shop_pending_attendance') || '[]')
    queue.push({ ...action, timestamp: Date.now() })
    localStorage.setItem('pizza_shop_pending_attendance', JSON.stringify(queue))
  }

  const optimisticUpdate = (empId, fields) => {
    const cached = localStorage.getItem('pizza_shop_attendance_today')
    const currentList = cached ? JSON.parse(cached) : employees
    const updated = currentList.map(emp => {
      if (emp.employee_id === empId) {
        return { ...emp, ...fields }
      }
      return emp
    })
    setEmployees(updated)
    localStorage.setItem('pizza_shop_attendance_today', JSON.stringify(updated))
  }

  const syncPendingAttendance = async () => {
    const queue = JSON.parse(localStorage.getItem('pizza_shop_pending_attendance') || '[]')
    if (queue.length === 0) return

    toast.loading('Syncing offline attendance logs...', { id: 'attendance-sync' })
    let successCount = 0
    const remainingQueue = []

    for (const action of queue) {
      try {
        if (action.type === 'check-in') {
          await axios.post('/api/attendance/check-in', { employee_id: action.employee_id, late_threshold: action.late_threshold })
        } else if (action.type === 'check-out') {
          await axios.post('/api/attendance/check-out', { employee_id: action.employee_id })
        } else if (action.type === 'toggle-break') {
          await axios.post('/api/attendance/toggle-break', { employee_id: action.employee_id })
        }
        successCount++
      } catch (err) {
        if (err.response) {
          console.warn('Sync rejected by server:', action, err.response.data)
        } else {
          remainingQueue.push(action)
        }
      }
    }

    localStorage.setItem('pizza_shop_pending_attendance', JSON.stringify(remainingQueue))
    toast.dismiss('attendance-sync')
    
    if (successCount > 0) {
      toast.success(`Synced ${successCount} attendance records online!`)
      loadAttendance(false)
    }
  }

  useEffect(() => {
    const hasCache = !!localStorage.getItem('pizza_shop_attendance_today')
    loadAttendance(!hasCache)
    
    window.addEventListener('online', syncPendingAttendance)
    
    // Poll every 30 seconds if online
    const interval = setInterval(() => {
      if (navigator.onLine) {
        loadAttendance(false)
        syncPendingAttendance()
      }
    }, 30000)

    if (navigator.onLine) {
      syncPendingAttendance()
    }

    return () => {
      window.removeEventListener('online', syncPendingAttendance)
      clearInterval(interval)
    }
  }, [])

  const handleCheckIn = async (empId) => {
    const actionKey = `check-in-${empId}`;
    if (pendingActions[actionKey]) return;
    setPendingActions(prev => ({ ...prev, [actionKey]: true }));
    try {
      await axios.post('/api/attendance/check-in', { employee_id: empId, late_threshold: lateThreshold })
      toast.success('Successfully Checked In!')
      loadAttendance()
    } catch (err) {
      if (!navigator.onLine || err.message === 'Network Error') {
        queueAttendanceAction({ type: 'check-in', employee_id: empId, late_threshold: lateThreshold })
        optimisticUpdate(empId, { 
          attendance_id: 'temp-' + Date.now(), 
          check_in: new Date().toISOString(),
          attendance_status: 'Present', 
          check_out: null 
        })
        toast.success('Offline Check-In saved locally!')
      } else {
        toast.error(err?.response?.data?.error || 'Failed to check in')
      }
    } finally {
      setPendingActions(prev => ({ ...prev, [actionKey]: false }));
    }
  }

  const handleCheckOut = (empId, name) => {
    const actionKey = `check-out-${empId}`;
    if (pendingActions[actionKey]) return;
    
    confirmAction(`Are you sure you want to Check Out "${name}"?`, async () => {
      setPendingActions(prev => ({ ...prev, [actionKey]: true }));
      try {
        await axios.post('/api/attendance/check-out', { employee_id: empId })
        toast.success('Successfully Checked Out!')
        loadAttendance()
      } catch (err) {
        if (!navigator.onLine || err.message === 'Network Error') {
          queueAttendanceAction({ type: 'check-out', employee_id: empId })
          optimisticUpdate(empId, { 
            check_out: new Date().toISOString()
          })
          toast.success('Offline Check-Out saved locally!')
        } else {
          toast.error(err?.response?.data?.error || 'Failed to check out')
        }
      } finally {
        setPendingActions(prev => ({ ...prev, [actionKey]: false }));
      }
    });
  }

  const handleToggleBreak = async (empId) => {
    const actionKey = `toggle-break-${empId}`;
    if (pendingActions[actionKey]) return;
    setPendingActions(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await axios.post('/api/attendance/toggle-break', { employee_id: empId })
      toast.success(res.data.on_break ? 'Break Started!' : 'Break Ended!')
      loadAttendance()
    } catch (err) {
      if (!navigator.onLine || err.message === 'Network Error') {
        queueAttendanceAction({ type: 'toggle-break', employee_id: empId })
        
        const emp = employees.find(e => e.employee_id === empId)
        const isOnBreakNow = emp ? !emp.on_break : true
        
        optimisticUpdate(empId, { 
          on_break: isOnBreakNow,
          break_start: isOnBreakNow ? new Date().toISOString() : null
        })
        toast.success(isOnBreakNow ? 'Offline Break Started!' : 'Offline Break Ended!')
      } else {
        toast.error(err?.response?.data?.error || 'Failed to toggle break')
      }
    } finally {
      setPendingActions(prev => ({ ...prev, [actionKey]: false }));
    }
  }

  const handleToggleRestaurantBreak = () => {
    const nextState = !restaurantOnBreak;
    confirmAction(
      `Are you sure you want to ${nextState ? 'start' : 'end'} the Restaurant Break?`,
      () => {
        setRestaurantOnBreak(nextState);
        localStorage.setItem('pizza_shop_restaurant_on_break', String(nextState));
        toast.success(nextState ? 'Restaurant is now on Break!' : 'Restaurant Break Ended!');
      }
    );
  };

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

  // Calculate unique departments from all employees
  const departments = ['All', ...new Set(employees.map(emp => emp.department).filter(Boolean))]

  // Filter employees by search query and selected department
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = (emp.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(emp.employee_id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDepartment === 'All' || emp.department === selectedDepartment;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="page-content" style={{ paddingTop: 0 }}>
      {/* Header with setting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: -60, flexWrap: 'wrap', gap: 16 }}>
        <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Fingerprint size={24} style={{ color: 'var(--primary)' }} /> Today's Attendance Panel
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {restaurantOnBreak && (
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 6, 
              padding: '6px 12px', 
              borderRadius: 8, 
              background: 'rgba(249, 115, 22, 0.1)', 
              color: '#F97316', 
              fontSize: 13, 
              fontWeight: 600
            }}>
              <Coffee size={14} /> Restaurant in Break
            </span>
          )}
          <button 
            className="btn btn-secondary"
            onClick={handleToggleRestaurantBreak}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6, 
              fontSize: 13, 
              borderColor: restaurantOnBreak ? 'var(--green)' : 'var(--primary)', 
              color: restaurantOnBreak ? 'var(--green)' : 'var(--primary)' 
            }}
          >
            {restaurantOnBreak ? (
              <>
                <Play size={14} /> End Restaurant Break
              </>
            ) : (
              <>
                <Coffee size={14} /> Restaurant Break
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="Search by name or ID..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1.5px solid var(--surface-2)',
            borderRadius: 10,
            outline: 'none',
            fontSize: 13
          }}
        />
        <select 
          value={selectedDepartment}
          onChange={e => setSelectedDepartment(e.target.value)}
          style={{
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1.5px solid var(--surface-2)',
            borderRadius: 10,
            outline: 'none',
            fontSize: 13,
            minWidth: 160
          }}
        >
          {departments.map(dept => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
      </div>

      {/* Grid view of employees */}
      {loading && employees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading staff details...
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <User size={48} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3>No Employees Found</h3>
          <p style={{ color: 'var(--text-muted)' }}>No employees match the search filter or department.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {filteredEmployees.map(emp => {
            const badge = getStatusBadge(emp);
            const isCheckedIn = emp.attendance_id && !emp.check_out;
            const isOnBreak = emp.on_break;
 
            const staffRole = emp.role && emp.role.toLowerCase() !== 'operator' ? emp.role : 'Staff';
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
                        {staffRole} • <strong>Shift {emp.shift || 'R1'}</strong>
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
                      disabled={pendingActions[`check-in-${emp.employee_id}`]}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px', opacity: pendingActions[`check-in-${emp.employee_id}`] ? 0.6 : 1 }}
                    >
                      {pendingActions[`check-in-${emp.employee_id}`] ? 'Checking In...' : <><Play size={14} /> Check In</>}
                    </button>
                  ) : (
                    <>
                      <button 
                        className={`btn ${isOnBreak ? 'btn-primary' : 'btn-secondary'}`} 
                        onClick={() => handleToggleBreak(emp.employee_id)}
                        disabled={pendingActions[`toggle-break-${emp.employee_id}`]}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px', opacity: pendingActions[`toggle-break-${emp.employee_id}`] ? 0.6 : 1 }}
                      >
                        {pendingActions[`toggle-break-${emp.employee_id}`] ? 'Loading...' : <><Coffee size={14} /> {isOnBreak ? 'End Break' : 'Break'}</>}
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => handleCheckOut(emp.employee_id, emp.name)}
                        disabled={pendingActions[`check-out-${emp.employee_id}`]}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px', color: 'var(--red)', borderColor: 'var(--red)', opacity: pendingActions[`check-out-${emp.employee_id}`] ? 0.6 : 1 }}
                      >
                        {pendingActions[`check-out-${emp.employee_id}`] ? 'Checking Out...' : <><Square size={14} /> Check Out</>}
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
