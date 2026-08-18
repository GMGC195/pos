import { useEffect, useState } from 'react'
import axios from '../api'
import { Fingerprint, Play, Square, Coffee, Check, Clock, User, AlertCircle, MoreVertical, X, Filter, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'





const calculateHoursDiff = (startTime24, endTime24) => {
  if (!startTime24 || !endTime24) return 12.0;
  const [startH, startM] = startTime24.split(':').map(Number);
  const [endH, endM] = endTime24.split(':').map(Number);
  
  let diffMins = (endH * 60 + endM) - (startH * 60 + startM);
  if (diffMins < 0) {
    diffMins += 1440;
  }
  return parseFloat((diffMins / 60).toFixed(2));
};

const decimalHoursToText = (hoursDec) => {
  if (isNaN(hoursDec) || hoursDec === null || hoursDec === undefined) return '';
  const totalMins = Math.round(hoursDec * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
  if (hrs > 0) return `${hrs} hr`;
  return `${mins} min`;
};

const formatTime = (t) => {
  if (!t) return '';
  if (t === '00:00' || t === '0:00') return '24:00';
  return t;
};

export default function AttendanceTracker() {
  const { user } = useAuth()

  // ── Employee View states ──
  const [personalStats, setPersonalStats] = useState(null)
  const [personalLoading, setPersonalLoading] = useState(false)
  const [personalMonth, setPersonalMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestTargetLog, setRequestTargetLog] = useState(null)
  const [requestedCheckIn, setRequestedCheckIn] = useState('')
  const [requestedCheckOut, setRequestedCheckOut] = useState('')
  const [requestReason, setRequestReason] = useState('')
  const [requestTargetRole, setRequestTargetRole] = useState('Admin')
  const [requestSubmitting, setRequestSubmitting] = useState(false)

  const loadPersonalStats = () => {
    if (user?.role?.toLowerCase() !== 'employee') return;
    setPersonalLoading(true);
    axios.get(`/api/attendance/personal-stats`, { params: { month: personalMonth } })
      .then(res => setPersonalStats(res.data))
      .catch(() => toast.error('Error loading your attendance report'))
      .finally(() => setPersonalLoading(false));
  };

  useEffect(() => {
    loadPersonalStats();
  }, [user, personalMonth]);

  const handleCreateRequestSubmit = async (e) => {
    e.preventDefault();
    if (!requestTargetLog || !requestReason) {
      toast.error('Reason is required');
      return;
    }
    
    const logDateStr = new Date(requestTargetLog.date).toISOString().split('T')[0];
    const fullIn = requestedCheckIn ? `${logDateStr}T${requestedCheckIn}:00` : null;
    const fullOut = requestedCheckOut ? `${logDateStr}T${requestedCheckOut}:00` : null;

    setRequestSubmitting(true);
    try {
      await axios.post('/api/attendance/edit-requests', {
        attendance_id: requestTargetLog.id,
        requested_check_in: fullIn,
        requested_check_out: fullOut,
        reason: requestReason,
        target_role: requestTargetRole
      });
      toast.success('Edit request submitted successfully!');
      setShowRequestModal(false);
      setRequestReason('');
      setRequestedCheckIn('');
      setRequestedCheckOut('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit edit request');
    } finally {
      setRequestSubmitting(false);
    }
  };

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
  const [selectedShift, setSelectedShift] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [selectedBranch, setSelectedBranch] = useState('All')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [pendingActions, setPendingActions] = useState({})
  const [restaurantOnBreak, setRestaurantOnBreak] = useState(() => localStorage.getItem('pizza_shop_restaurant_on_break') === 'true')
  const [confirmModal, setConfirmModal] = useState(null)
  
  // Shift Edit State
  const [activeDropdownId, setActiveDropdownId] = useState(null)
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [selectedEmpForShiftEdit, setSelectedEmpForShiftEdit] = useState(null)
  const [editShiftVal, setEditShiftVal] = useState('R1')
  const [editShiftHoursVal, setEditShiftHoursVal] = useState(13.0)
  const [editStartTimeVal, setEditStartTimeVal] = useState('10:00')
  const [editEndTimeVal, setEditEndTimeVal] = useState('23:00')
  const [isCustomShiftEdit, setIsCustomShiftEdit] = useState(false)
  const [shiftsList, setShiftsList] = useState([])

  const loadAttendance = (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    return axios.get(`/api/attendance/today?_t=${Date.now()}`)
      .then(res => {
        setEmployees(res.data)
        localStorage.setItem('pizza_shop_attendance_today', JSON.stringify(res.data))
      })
      .catch((err) => {
        const cached = localStorage.getItem('pizza_shop_attendance_today')
        if (cached && employees.length === 0) {
          setEmployees(JSON.parse(cached))
        }
        throw err
      })
      .finally(() => {
        if (showSpinner) setLoading(false)
      })
  }

  const loadShifts = () => {
    axios.get('/api/employees/working-hours/list')
      .then(res => setShiftsList(res.data))
      .catch(() => toast.error('Error loading shifts'))
  }

  // Close dropdown on click outside and load shifts
  useEffect(() => {
    loadShifts()
    const handleOutsideClick = () => {
      setActiveDropdownId(null)
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const handleTimeChange = (field, val24h) => {
    if (field === 'start') {
      setEditStartTimeVal(val24h)
      setEditShiftHoursVal(calculateHoursDiff(val24h, editEndTimeVal))
    } else {
      setEditEndTimeVal(val24h)
      setEditShiftHoursVal(calculateHoursDiff(editStartTimeVal, val24h))
    }
  }

  const handleUpdateShift = async () => {
    if (!selectedEmpForShiftEdit) return
    try {
      const targetName = editShiftVal.trim().toUpperCase()
      const exists = shiftsList.some(s => s.name.toUpperCase() === targetName)

      if (isCustomShiftEdit && !exists) {
        await axios.post('/api/employees/working-hours/list', {
          name: targetName,
          start_time: editStartTimeVal,
          end_time: editEndTimeVal,
          hours: editShiftHoursVal
        })
      }

      await axios.patch(`/api/employees/${selectedEmpForShiftEdit.employee_id}/working-hours`, {
        working_hours: targetName,
        shift_hours: editShiftHoursVal
      })
      toast.success(`Shift updated to ${targetName} for ${selectedEmpForShiftEdit.name}!`)
      setShowShiftModal(false)
      loadAttendance()
      loadShifts()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update shift')
    }
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

  const handleCheckIn = async (empId, name) => {
    const actionKey = `check-in-${empId}`;
    if (pendingActions[actionKey]) return;
    setPendingActions(prev => ({ ...prev, [actionKey]: true }));
    
    try {
      await axios.post('/api/attendance/check-in', { employee_id: empId, late_threshold: lateThreshold })
      await loadAttendance()
      toast.dismiss()
      toast.success(`${name} Successfully Checked In!`, { duration: 2000 })
    } catch (err) {
      toast.dismiss()
      if (!navigator.onLine || err.message === 'Network Error') {
        queueAttendanceAction({ type: 'check-in', employee_id: empId, late_threshold: lateThreshold })
        optimisticUpdate(empId, { 
          attendance_id: 'temp-' + Date.now(), 
          check_in: new Date().toISOString(),
          attendance_status: 'Present', 
          check_out: null 
        })
        toast.error('Offline Mode: Check-In saved locally (pending sync)', { duration: 2500 })
      } else {
        toast.error(err?.response?.data?.error || 'Failed to check in', { duration: 2500 })
      }
    } finally {
      setPendingActions(prev => ({ ...prev, [actionKey]: false }));
    }
  }

  const handleCheckOut = (empId, name) => {
    const actionKey = `check-out-${empId}`;
    if (pendingActions[actionKey]) return;
    
    setConfirmModal({
      message: `Are you sure you want to Check Out "${name}"?`,
      onConfirm: async () => {
        setPendingActions(prev => ({ ...prev, [actionKey]: true }));
        try {
          await axios.post('/api/attendance/check-out', { employee_id: empId })
          await loadAttendance()
          toast.dismiss()
          toast.success(`${name} Successfully Checked Out!`, { duration: 2000 })
        } catch (err) {
          toast.dismiss()
          if (!navigator.onLine || err.message === 'Network Error') {
            queueAttendanceAction({ type: 'check-out', employee_id: empId })
            optimisticUpdate(empId, { 
              check_out: new Date().toISOString()
            })
            toast.error('Offline Mode: Check-Out saved locally (pending sync)', { duration: 2500 })
          } else {
            toast.error(err?.response?.data?.error || 'Failed to check out', { duration: 2500 })
          }
        } finally {
          setPendingActions(prev => ({ ...prev, [actionKey]: false }));
        }
      }
    });
  }

  const handleToggleBreak = async (empId, name) => {
    const actionKey = `toggle-break-${empId}`;
    if (pendingActions[actionKey]) return;
    setPendingActions(prev => ({ ...prev, [actionKey]: true }));
    
    try {
      const res = await axios.post('/api/attendance/toggle-break', { employee_id: empId })
      await loadAttendance()
      toast.dismiss()
      toast.success(res.data.on_break ? `${name} Break Started!` : `${name} Break Ended!`, { duration: 2000 })
    } catch (err) {
      toast.dismiss()
      if (!navigator.onLine || err.message === 'Network Error') {
        queueAttendanceAction({ type: 'toggle-break', employee_id: empId })
        const emp = employees.find(e => e.employee_id === empId)
        const isOnBreakNow = emp ? !emp.on_break : true
        optimisticUpdate(empId, { 
          on_break: isOnBreakNow,
          break_start: isOnBreakNow ? new Date().toISOString() : null
        })
        toast.error(isOnBreakNow ? 'Offline Mode: Break started locally (pending sync)' : 'Offline Mode: Break ended locally (pending sync)', { duration: 2500 })
      } else {
        toast.error(err?.response?.data?.error || 'Failed to toggle break', { duration: 2500 })
      }
    } finally {
      setPendingActions(prev => ({ ...prev, [actionKey]: false }));
    }
  }

  const handleToggleRestaurantBreak = () => {
    const nextState = !restaurantOnBreak;
    setConfirmModal({
      message: `Are you sure you want to ${nextState ? 'start' : 'end'} the Restaurant Break?`,
      onConfirm: () => {
        setRestaurantOnBreak(nextState);
        localStorage.setItem('pizza_shop_restaurant_on_break', String(nextState));
        toast.dismiss()
        toast.success(nextState ? 'Restaurant is now on Break!' : 'Restaurant Break Ended!', { duration: 2000 });
      }
    });
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

  // Filter employees by search query, department, shift, and status
  const filteredEmployees = employees.filter(emp => {
    if (user?.role?.toLowerCase() === 'employee') {
      const usernameLower = (user?.username || '').toLowerCase();
      const codeLower = (emp.employee_code || emp.employee_id || '').toLowerCase();
      const nameLower = (emp.name || '').toLowerCase();
      if (usernameLower !== codeLower && usernameLower !== nameLower) {
        return false;
      }
    }

    const matchesSearch = (emp.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(emp.employee_id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDepartment === 'All' || emp.department === selectedDepartment;
    const matchesShift = selectedShift === 'All' || (emp.shift || 'R1') === selectedShift;
    const matchesBranch = selectedBranch === 'All' || emp.branch === selectedBranch;

    // Status Filter
    let matchesStatus = true;
    const isCheckedIn = emp.attendance_id && !emp.check_out;
    const isAbsent = !emp.attendance_id;
    const isLate = emp.attendance_status === 'Late';
    const isCheckedOut = emp.attendance_id && emp.check_out;

    if (selectedStatus === 'Present') {
      matchesStatus = isCheckedIn;
    } else if (selectedStatus === 'Absent') {
      matchesStatus = isAbsent;
    } else if (selectedStatus === 'Late') {
      matchesStatus = isLate;
    } else if (selectedStatus === 'CheckedOut') {
      matchesStatus = isCheckedOut;
    }

    return matchesSearch && matchesDept && matchesShift && matchesStatus && matchesBranch;
  });

  return (
    <div className="page-content" style={{ paddingTop: 0 }}>
      {user?.role?.toLowerCase() === 'employee' ? (
        <>
          {/* Header with Month Selector */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: -60, flexWrap: 'wrap', gap: 16 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Fingerprint size={24} style={{ color: 'var(--primary)' }} /> My Attendance History
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Month Filter:</label>
              <input 
                type="month" 
                value={personalMonth} 
                onChange={e => setPersonalMonth(e.target.value)} 
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1.5px solid var(--surface-2)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>

          {/* Loading Indicator */}
          {personalLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              Loading your attendance records...
            </div>
          ) : (
            <>
              {/* Stats Dashboard */}
              {personalStats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                  <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Days Present</span>
                    <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--green)' }}>{personalStats.days_present}</span>
                  </div>
                  <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Days Late</span>
                    <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--red)' }}>{personalStats.days_late}</span>
                  </div>
                  <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Total Hours Worked</span>
                    <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--primary)' }}>{personalStats.total_hours} hrs</span>
                  </div>
                  <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Overtime Hours</span>
                    <span style={{ fontSize: 28, fontWeight: 900, color: '#ff9800' }}>{personalStats.overtime} hrs</span>
                  </div>
                </div>
              )}

              {/* Attendance Logs Table */}
              {(personalStats?.monthly_logs || []).length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                  <Clock size={48} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                  <h3>No Attendance Records</h3>
                  <p style={{ color: 'var(--text-muted)' }}>No logs found for the selected month.</p>
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="table-wrap">
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-1)' }}>
                          <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Check-In</th>
                          <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Check-Out</th>
                          <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Break Duration</th>
                          <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Hours Worked</th>
                          <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Status</th>
                          <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Remarks</th>
                          <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(personalStats?.monthly_logs || []).map((log, index) => {
                          const rowBg = index % 2 === 0 ? 'var(--surface)' : 'rgba(var(--primary-rgb), 0.025)';
                          const formattedDate = new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                          const checkInTime = log.check_in ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
                          const checkOutTime = log.check_out ? new Date(log.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Still Working';
                          const breakText = log.total_break_duration_seconds ? `${Math.round(log.total_break_duration_seconds / 60)} min` : '--';
                          
                          let durationHours = '--';
                          if (log.check_in && log.check_out) {
                            const ms = new Date(log.check_out).getTime() - new Date(log.check_in).getTime();
                            const breaks = (log.total_break_duration_seconds || 0) * 1000;
                            durationHours = `${Math.max(0, (ms - breaks) / (1000 * 60 * 60)).toFixed(2)} hrs`;
                          }

                          let statusColor = 'var(--text)';
                          let statusBg = 'var(--surface-2)';
                          if (log.status === 'Present') {
                            statusColor = 'var(--green)';
                            statusBg = 'rgba(16, 185, 129, 0.1)';
                          } else if (log.status === 'Late') {
                            statusColor = 'var(--red)';
                            statusBg = 'rgba(239, 68, 68, 0.1)';
                          } else if (log.status === 'Leave' || log.status === 'Holiday') {
                            statusColor = 'var(--primary)';
                            statusBg = 'rgba(227, 24, 55, 0.1)';
                          }

                          return (
                            <tr key={log.id} style={{ background: rowBg, borderBottom: '1px solid var(--surface-2)' }}>
                              <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{formattedDate}</td>
                              <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center' }}>{checkInTime}</td>
                              <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center' }}>{checkOutTime}</td>
                              <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center' }}>{breakText}</td>
                              <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>{durationHours}</td>
                              <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                <span style={{ color: statusColor, background: statusBg, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{log.status}</span>
                              </td>
                              <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>{log.remarks || '--'}</td>
                              <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                <button 
                                  className="btn btn-secondary" 
                                  onClick={() => {
                                    setRequestTargetLog(log);
                                    if (log.check_in) setRequestedCheckIn(new Date(log.check_in).toTimeString().slice(0, 5));
                                    if (log.check_out) setRequestedCheckOut(new Date(log.check_out).toTimeString().slice(0, 5));
                                    setShowRequestModal(true);
                                  }}
                                  style={{ padding: '6px 12px', fontSize: 12 }}
                                >
                                  Request Edit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Request Edit Modal */}
          {showRequestModal && requestTargetLog && (
            <div style={{
              position: 'fixed', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              padding: 20
            }}>
              <div className="card" style={{ width: '100%', maxWidth: 450, padding: 25, borderRadius: 12, background: 'var(--surface)', animation: 'scaleUp 0.2s ease-out' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h4 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Request Attendance Correction</h4>
                  <button onClick={() => setShowRequestModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                </div>
                <form onSubmit={handleCreateRequestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Date</span>
                    <input type="text" readOnly value={new Date(requestTargetLog.date).toLocaleDateString()} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--surface-2)', color: 'var(--text-muted)' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Requested Check-In</label>
                      <input type="time" value={requestedCheckIn} onChange={e => setRequestedCheckIn(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Requested Check-Out</label>
                      <input type="time" value={requestedCheckOut} onChange={e => setRequestedCheckOut(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Send Request To</label>
                    <select value={requestTargetRole} onChange={e => setRequestTargetRole(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
                      <option value="Admin">Admin</option>
                      <option value="Operator">Operator</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Reason for Correction</label>
                    <textarea required placeholder="Explain why you need this correction (e.g. forgot to check out)..." value={requestReason} onChange={e => setRequestReason(e.target.value)} rows={3} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowRequestModal(false)} style={{ flex: 1 }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={requestSubmitting} style={{ flex: 1 }}>{requestSubmitting ? 'Sending...' : 'Submit Request'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
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
          {['admin', 'operator', 'developer'].includes(user?.role?.toLowerCase()) && (
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
          )}
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 250, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, border: '1.5px solid var(--surface-2)', borderRadius: 10, padding: '0 12px', background: 'var(--surface)' }}>
            <Search size={18} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search by name or ID..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', border: 'none', outline: 'none', padding: '10px 8px', background: 'transparent', color: 'var(--text)', fontSize: 13 }}
            />
          </div>
          
          <button 
            className="btn btn-secondary filter-mobile-toggle-btn"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, padding: 0, borderRadius: 10, borderColor: showMobileFilters ? 'var(--primary)' : 'var(--surface-2)' }}
          >
            <Filter size={18} style={{ color: showMobileFilters ? 'var(--primary)' : 'var(--text)' }} />
          </button>
        </div>

        <div className={`attendance-filters-row ${showMobileFilters ? 'show-mobile' : ''}`} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select 
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{
              padding: '10px 14px',
              background: 'var(--surface)',
              border: '1.5px solid var(--surface-2)',
              borderRadius: 10,
              outline: 'none',
              fontSize: 13,
              minWidth: 140,
              cursor: 'pointer'
            }}
          >
            {['All', ...new Set(employees.map(emp => emp.branch).filter(Boolean))].map(br => (
              <option key={br} value={br}>{br === 'All' ? 'All Restaurants' : br}</option>
            ))}
          </select>

          <select 
            value={selectedShift}
            onChange={e => setSelectedShift(e.target.value)}
            style={{
              padding: '10px 14px',
              background: 'var(--surface)',
              border: '1.5px solid var(--surface-2)',
              borderRadius: 10,
              outline: 'none',
              fontSize: 13,
              minWidth: 140,
              cursor: 'pointer'
            }}
          >
            {['All', ...new Set([...shiftsList.map(s => s.name), ...employees.map(emp => emp.shift).filter(Boolean)])].map(sh => (
              <option key={sh} value={sh}>{sh === 'All' ? 'All Shifts' : `Shift ${sh}`}</option>
            ))}
          </select>

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
              minWidth: 140,
              cursor: 'pointer'
            }}
          >
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept === 'All' ? 'All Departments' : dept}</option>
            ))}
          </select>

          <select 
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            style={{
              padding: '10px 14px',
              background: 'var(--surface)',
              border: '1.5px solid var(--surface-2)',
              borderRadius: 10,
              outline: 'none',
              fontSize: 13,
              minWidth: 140,
              cursor: 'pointer'
            }}
          >
            <option value="All">All Statuses</option>
            <option value="Present">Present (Active)</option>
            <option value="Absent">Absent Today</option>
            <option value="Late">Late Arrivals</option>
            <option value="CheckedOut">Checked Out</option>
          </select>

          {(searchQuery !== '' || selectedShift !== 'All' || selectedDepartment !== 'All' || selectedStatus !== 'All' || selectedBranch !== 'All') && (
            <button 
              className="btn btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setSelectedShift('All');
                setSelectedDepartment('All');
                setSelectedStatus('All');
                setSelectedBranch('All');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 14px',
                borderRadius: 10,
                height: 40,
                fontSize: 13,
                borderColor: 'var(--surface-2)',
                background: 'var(--surface)',
                color: 'var(--text)'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <style>{`
        .attendance-filters-row {
          display: flex;
        }
        @media (max-width: 768px) {
          .attendance-filters-row {
            display: none !important;
            flex-direction: column;
            gap: 12px !important;
            width: 100%;
            margin-bottom: 20px !important;
          }
          .attendance-filters-row.show-mobile {
            display: flex !important;
          }
          .attendance-filters-row select {
            width: 100%;
            min-width: 0 !important;
          }
          .filter-mobile-toggle-btn {
            display: flex !important;
          }
        }
      `}</style>

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
            
            const shiftName = emp.shift || 'R1';
            const matchedShift = shiftsList.find(s => s.name.toUpperCase() === shiftName.toUpperCase());

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
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: '1.4' }}>
                        <div><strong style={{ color: 'var(--primary)' }}>{emp.employee_code}</strong> • {staffRole}</div>
                        <div>
                          <strong>
                            {matchedShift ? (
                              <>
                                Shift {matchedShift.name} ({formatTime(matchedShift.start_time)} - {formatTime(matchedShift.end_time)}
                                {matchedShift.is_split_shift && matchedShift.start_time_2 && (
                                  <> &amp; {formatTime(matchedShift.start_time_2)} - {formatTime(matchedShift.end_time_2)}</>
                                )})
                              </>
                            ) : (
                              `Shift ${shiftName}`
                            )}
                          </strong>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ 
                        color: badge.color, 
                        background: badge.bg, 
                        padding: '3px 8px', 
                        borderRadius: 6, 
                        fontSize: 11, 
                        fontWeight: 600 
                      }}>{badge.text}</span>
                      
                      {/* Three dots dropdown menu - only show if NOT checked in */}
                      {!isCheckedIn && (
                        <div style={{ position: 'relative' }}>
                          {['admin', 'operator', 'developer'].includes(user?.role?.toLowerCase()) && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveDropdownId(activeDropdownId === emp.employee_id ? null : emp.employee_id)
                              }}
                              style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                cursor: 'pointer', 
                                padding: 4, 
                                display: 'inline-flex', 
                                alignItems: 'center',
                                color: 'var(--text-muted)' 
                              }}
                            >
                              <MoreVertical size={16} />
                            </button>
                          )}
                          
                          {activeDropdownId === emp.employee_id && (
                            <div style={{ 
                              position: 'absolute', 
                              right: 0, 
                              top: '100%', 
                              background: 'var(--surface)', 
                              border: '1.5px solid var(--surface-2)', 
                              borderRadius: 8, 
                              boxShadow: '0 4px 16px rgba(0,0,0,0.12)', 
                              zIndex: 100, 
                              minWidth: 120,
                              marginTop: 4,
                              overflow: 'hidden'
                            }}>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setActiveDropdownId(null)
                                  setSelectedEmpForShiftEdit(emp)
                                  const currentShift = emp.shift || 'R1'
                                  const matchedShift = shiftsList.find(s => s.name === currentShift)
                                  const isPredefined = !!matchedShift
                                  setEditShiftVal(currentShift)
                                  setEditShiftHoursVal(parseFloat(emp.shift_hours || 12.0))
                                  setEditStartTimeVal(matchedShift ? matchedShift.start_time : '10:00')
                                  setEditEndTimeVal(matchedShift ? matchedShift.end_time : '23:00')
                                  setIsCustomShiftEdit(!isPredefined)
                                  setShowShiftModal(true)
                                }}
                                style={{ 
                                  display: 'block', 
                                  width: '100%', 
                                  padding: '10px 14px', 
                                  background: 'transparent', 
                                  border: 'none', 
                                  cursor: 'pointer', 
                                  fontSize: 13, 
                                  textAlign: 'left', 
                                  color: 'var(--text)',
                                  fontWeight: 500
                                }}
                                onMouseOver={e => e.currentTarget.style.background = 'var(--surface-1)'}
                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                              >
                                Edit Shift
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
 
                  {!isCheckedIn && (
                    <div style={{ background: 'var(--surface-1)', padding: '8px 12px', border: '1px dashed var(--surface-3)', borderRadius: 8, fontSize: 12, marginBottom: 14, color: 'var(--text-secondary)' }}>
                      <strong>Shift Details:</strong> {
                        matchedShift 
                          ? `${matchedShift.name} (${formatTime(matchedShift.start_time)} - ${formatTime(matchedShift.end_time)}${matchedShift.is_split_shift && matchedShift.start_time_2 ? ` & ${formatTime(matchedShift.start_time_2)} - ${formatTime(matchedShift.end_time_2)}` : ''} | ${matchedShift.hours} hrs)` 
                          : `${shiftName} (Time not set - ${emp.shift_hours || 12} hrs)`
                      }
                    </div>
                  )}
 
                  {isCheckedIn && (
                    <div style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Checked In:</span>
                        <span style={{ fontWeight: 600 }}>{new Date(emp.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Duty Hours:</span>
                        <span style={{ fontWeight: 600, color: 'var(--green)' }}>{Math.min(parseFloat(emp.shift_hours) || 12.0, parseFloat(emp.total_hours_today || 0)).toFixed(2)} hrs</span>
                      </div>
                      {parseFloat(emp.total_hours_today || 0) > (parseFloat(emp.shift_hours) || 12.0) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <span style={{ color: 'var(--text-muted)' }}>Overtime:</span>
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{(parseFloat(emp.total_hours_today || 0) - (parseFloat(emp.shift_hours) || 12.0)).toFixed(2)} hrs</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
 
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  {!isCheckedIn ? (
                    <button 
                      className="btn btn-primary" 
                      onClick={() => handleCheckIn(emp.employee_id, emp.name)}
                      disabled={pendingActions[`check-in-${emp.employee_id}`] || user?.role?.toLowerCase() === 'management'}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px', opacity: (pendingActions[`check-in-${emp.employee_id}`] || user?.role?.toLowerCase() === 'management') ? 0.6 : 1, cursor: (pendingActions[`check-in-${emp.employee_id}`] || user?.role?.toLowerCase() === 'management') ? 'not-allowed' : 'pointer' }}
                    >
                      {pendingActions[`check-in-${emp.employee_id}`] ? 'Checking In...' : <><Play size={14} /> Check In</>}
                    </button>
                  ) : (
                    <>
                      <button 
                        className={`btn ${isOnBreak ? 'btn-primary' : 'btn-secondary'}`} 
                        onClick={() => handleToggleBreak(emp.employee_id, emp.name)}
                        disabled={pendingActions[`toggle-break-${emp.employee_id}`] || user?.role?.toLowerCase() === 'management'}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px', opacity: (pendingActions[`toggle-break-${emp.employee_id}`] || user?.role?.toLowerCase() === 'management') ? 0.6 : 1, cursor: (pendingActions[`toggle-break-${emp.employee_id}`] || user?.role?.toLowerCase() === 'management') ? 'not-allowed' : 'pointer' }}
                      >
                        {pendingActions[`toggle-break-${emp.employee_id}`] ? 'Loading...' : <><Coffee size={14} /> {isOnBreak ? 'End Break' : 'Break'}</>}
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => handleCheckOut(emp.employee_id, emp.name)}
                        disabled={pendingActions[`check-out-${emp.employee_id}`] || user?.role?.toLowerCase() === 'management'}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px', color: 'var(--red)', borderColor: 'var(--red)', opacity: (pendingActions[`check-out-${emp.employee_id}`] || user?.role?.toLowerCase() === 'management') ? 0.6 : 1, cursor: (pendingActions[`check-out-${emp.employee_id}`] || user?.role?.toLowerCase() === 'management') ? 'not-allowed' : 'pointer' }}
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
      {confirmModal && (
        <div 
          onClick={() => setConfirmModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--white)',
              border: '1.5px solid var(--surface-2)',
              borderRadius: 16,
              padding: '24px',
              width: '90%',
              maxWidth: 360,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              animation: 'scaleUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                background: 'rgba(244, 180, 0, 0.1)',
                color: 'var(--primary)',
                width: 40,
                height: 40,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertCircle size={20} />
              </div>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Confirm Action</h4>
            </div>
            
            <p style={{ margin: '0 0 20px 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {confirmModal.message}
            </p>
            
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setConfirmModal(null)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--surface-2)',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  transition: 'background 0.2s'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const cb = confirmModal.onConfirm;
                  setConfirmModal(null);
                  cb();
                }}
                style={{
                  padding: '8px 16px',
                  background: 'var(--primary)',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'white',
                  transition: 'opacity 0.2s'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Shift Modal */}
      {showShiftModal && selectedEmpForShiftEdit && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, animation: 'fadeIn 0.2s ease-out' }}>
          <div className="card" style={{ width: 350, padding: 24, position: 'relative', animation: 'scaleUp 0.2s ease-out' }}>
            <button onClick={() => setShowShiftModal(false)} style={{ position: 'absolute', right: 16, top: 16, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 750 }}>Edit Shift details</h4>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Set shift details for <strong>{selectedEmpForShiftEdit.name}</strong> ({selectedEmpForShiftEdit.employee_code})
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select Shift</span>
                <select 
                  value={isCustomShiftEdit ? 'Custom' : editShiftVal}
                  onChange={e => {
                    const val = e.target.value
                    if (val === 'Custom') {
                      setIsCustomShiftEdit(true)
                      setEditShiftVal('CUSTOM_R1')
                      setEditShiftHoursVal(12.0)
                      setEditStartTimeVal('10:00')
                      setEditEndTimeVal('23:00')
                    } else {
                      setIsCustomShiftEdit(false)
                      setEditShiftVal(val)
                      const matched = shiftsList.find(s => s.name === val)
                      setEditShiftHoursVal(matched ? parseFloat(matched.hours) : 12.0)
                      setEditStartTimeVal(matched ? matched.start_time : '10:00')
                      setEditEndTimeVal(matched ? matched.end_time : '23:00')
                    }
                  }}
                  style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 10, outline: 'none' }}
                >
                  {shiftsList.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.start_time} - {s.end_time})</option>
                  ))}
                  <option value="Custom">Custom Shift...</option>
                </select>
              </div>

              {isCustomShiftEdit ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Custom Shift Name</span>
                    <input 
                      type="text" 
                      placeholder="e.g. R4"
                      value={editShiftVal}
                      onChange={e => setEditShiftVal(e.target.value)}
                      style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 10, outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Start Time</span>
                    <input 
                      type="time" 
                      lang="en-GB"
                      value={editStartTimeVal}
                      onChange={e => handleTimeChange('start', e.target.value)}
                      style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 10, outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>End Time</span>
                    <input 
                      type="time" 
                      lang="en-GB"
                      value={editEndTimeVal}
                      onChange={e => handleTimeChange('end', e.target.value)}
                      style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 10, outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Custom Shift Hours {editShiftHoursVal ? `(${decimalHoursToText(editShiftHoursVal)})` : ''}
                    </span>
                    <input 
                      type="text" 
                      readOnly
                      value={decimalHoursToText(editShiftHoursVal)}
                      style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-2)', color: 'var(--text-muted)', borderRadius: 8, padding: 10, outline: 'none' }}
                    />
                  </div>
                </>
              ) : (
                <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>Start Time:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{editStartTimeVal}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>End Time:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{editEndTimeVal}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Standard Hours:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{editShiftHoursVal} hrs</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowShiftModal(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleUpdateShift} 
                  style={{ flex: 1 }}
                >
                  Save Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
