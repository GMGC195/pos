import { useEffect, useState } from 'react'
import axios from '../api'
import { Fingerprint, Coffee, Clock, User, LogIn, Search, RefreshCw, FileText, MoreVertical, X, Download, Filter, Edit, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { getSaudiTodayDate, getSaudiDateString, toSaudiTimeInput, saudiTimeToISO } from '../utils/timezone'

const toDatetimeLocal = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  const tzoffset = date.getTimezoneOffset() * 60000;
  return (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
}

const decimalHoursToText = (hoursDec) => {
  if (isNaN(hoursDec) || hoursDec === null || hoursDec === undefined || hoursDec <= 0) return '0 min';
  const totalMins = Math.round(hoursDec * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
  if (hrs > 0) return `${hrs} hr`;
  return `${mins} min`;
}

const formatBreakTime = (seconds) => {
  if (!seconds || seconds <= 0) return '--';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${hrs} h ${m} m` : `${hrs} h`;
};

const formatLocalDate = (date) => {
  return getSaudiDateString(date);
}

const formatBranchCode = (br) => {
  if (!br) return 'R1';
  const s = String(br).toUpperCase().trim();
  if (s.includes('1') || s === 'R1') return 'R1';
  if (s.includes('2') || s === 'R2') return 'R2';
  if (s.includes('3') || s === 'R3') return 'R3';
  return s;
};

export default function TodayAttendance() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [employeesList, setEmployeesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDayNight, setSelectedDayNight] = useState('All')
  const [selectedDepartment, setSelectedDepartment] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [selectedBranch, setSelectedBranch] = useState('All')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // ── Enhanced Edit Attendance Modal State ─────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false)
  // step: 'employee' | 'date' | 'mode'
  const [editStep, setEditStep] = useState('employee')
  const [editEmpId, setEditEmpId] = useState('')
  const [editDateMode, setEditDateMode] = useState('today')   // 'today' | 'previous'
  const [editDate, setEditDate] = useState('')
  const [editMode, setEditMode] = useState('')               // 'add' | 'edit'
  const [editSessions, setEditSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [savingSessionId, setSavingSessionId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Add-new-session form
  const [newCheckIn, setNewCheckIn] = useState('')
  const [newCheckOut, setNewCheckOut] = useState('')
  const [newBranch, setNewBranch] = useState('R1')
  const [newStatus, setNewStatus] = useState('Present')

  // Quick-edit (reason) from row button
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [editReason, setEditReason] = useState('')
  // ──────────────────────────────────────────────────────────────────────────

  const loadTodayAttendance = () => {
    setLoading(true)
    axios.get(`/api/attendance/today?_t=${Date.now()}`)
      .then(res => {
        setEmployees(res.data)
      })
      .catch(() => toast.error('Error loading active staff'))
      .finally(() => setLoading(false))
  }

  const loadEmployeesList = () => {
    axios.get('/api/employees')
      .then(res => setEmployeesList(res.data || []))
      .catch(() => {})
  }

  useEffect(() => {
    loadTodayAttendance()
    loadEmployeesList()
    // Refresh at most every 5 minutes (300000 ms) instead of 30 seconds
    const interval = setInterval(loadTodayAttendance, 300000)
    return () => clearInterval(interval)
  }, [])

  // Load sessions whenever employee + date are set in edit modal
  const loadEditSessions = (empId, dateStr) => {
    if (!empId || !dateStr) return
    setLoadingSessions(true)
    axios.get('/api/attendance/employee-date', { params: { employee_id: empId, date: dateStr } })
      .then(res => setEditSessions(res.data))
      .catch(() => toast.error('Error loading sessions'))
      .finally(() => setLoadingSessions(false))
  }

  const openEditModal = (prefillEmpId = '') => {
    const todayStr = formatLocalDate(new Date())
    setEditEmpId(prefillEmpId || '')
    setEditDateMode('today')
    setEditDate(todayStr)
    setEditMode('')
    setEditSessions([])
    setNewCheckIn('')
    setNewCheckOut('')
    setNewBranch('R1')
    setNewStatus('Present')
    setEditReason('')
    setSelectedSessionId('')
    setEditStep(prefillEmpId ? 'date' : 'employee')
    setShowEditModal(true)
  }

  const closeEditModal = () => {
    setShowEditModal(false)
    setEditStep('employee')
    setEditEmpId('')
    setEditMode('')
    setEditSessions([])
  }

  const handleEditStep1Next = () => {
    if (!editEmpId) { toast.error('Please select an employee'); return }
    setEditStep('date')
  }

  const handleEditStep2Next = () => {
    const dateStr = editDateMode === 'today' ? formatLocalDate(new Date()) : editDate
    if (editDateMode === 'previous' && !editDate) { toast.error('Please select a date'); return }
    setEditDate(dateStr)
    setEditMode('')
    setEditSessions([])
    setEditStep('mode')
    loadEditSessions(editEmpId, dateStr)
  }

  const handleAddSession = async () => {
    if (!newCheckIn) { toast.error('Check-In time is required'); return }
    if (!newCheckOut) { toast.error('Check-Out time is required'); return }
    
    let outDate = editDate;
    if (newCheckOut < newCheckIn) {
      const nextDay = new Date(editDate);
      nextDay.setDate(nextDay.getDate() + 1);
      outDate = getSaudiDateString(nextDay);
    }
    
    const checkInISO = saudiTimeToISO(editDate, newCheckIn);
    const checkOutISO = saudiTimeToISO(outDate, newCheckOut);

    if (new Date(checkOutISO) <= new Date(checkInISO)) { 
      toast.error('Check-Out must be after Check-In'); 
      return; 
    }

    try {
      await axios.post('/api/attendance/session', {
        employee_id: editEmpId,
        date: editDate,
        check_in: checkInISO,
        check_out: checkOutISO,
        branch: newBranch,
        status: newStatus
      })
      toast.success('Session added!')
      closeEditModal()
      loadTodayAttendance()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add session')
    }
  }

  const handleUpdateExistingSession = async (sessionId, inValISO, outValISO, reason, breakLogs = null, branch = null) => {
    if (!reason || !reason.trim()) { toast.error('Reason is required'); return }
    setSavingSessionId(sessionId)
    try {
      const payload = {
        attendance_id: sessionId,
        new_check_in: inValISO,
        new_check_out: outValISO || null,
        reason
      }
      if (breakLogs !== null) {
        payload.break_logs = breakLogs
      }
      if (branch !== null) {
        payload.branch = branch
      }
      await axios.post('/api/attendance/edit', payload)
      toast.success('Session updated!')
      loadEditSessions(editEmpId, editDate)
      loadTodayAttendance()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update session')
    } finally {
      setSavingSessionId(null)
    }
  }

  const handleDeleteSession = async (sessionId) => {
    setSavingSessionId(sessionId)
    try {
      await axios.delete(`/api/attendance/session/${sessionId}`)
      toast.success('Session deleted!')
      loadEditSessions(editEmpId, editDate)
      loadTodayAttendance()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to delete session')
    } finally {
      setSavingSessionId(null)
    }
  }

  // Yesterday's date string for max= on Previous date picker (no future dates)
  const yesterdayStr = formatLocalDate(new Date(Date.now() - 86400000))

  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const data = filteredEmployees.map(emp => {
        const sessions = emp.sessions || []
        const checkInTimes = sessions.map(s => `In: ${new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`).join('\n')
        const checkOutTimes = sessions.map(s => s.check_out ? `Out: ${new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'Active').join('\n')
        
        let statusText = emp.calculated_status || 'Absent'

        const otHours = Math.max(0, parseFloat(emp.total_hours_today || 0) - (parseFloat(emp.shift_hours) || 12.0))

        return {
          'Code': emp.employee_code || emp.employee_id,
          'Employee Name': emp.name,
          'Shift': emp.shift || 'R1',
          'Check-In Sessions': checkInTimes || '--',
          'Check-Out Sessions': checkOutTimes || '--',
          'Status': statusText,
          'Hours Worked': decimalHoursToText(Math.min(parseFloat(emp.shift_hours) || 12.0, parseFloat(emp.total_hours_today || 0))),
          'Overtime': decimalHoursToText(otHours)
        }
      })

      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Today Attendance')
      XLSX.writeFile(wb, `Today-Attendance-${new Date().toISOString().split('T')[0]}.xlsx`)
      toast.success('Attendance logs exported successfully!')
    } catch (err) {
      toast.error('Failed to export logs')
    }
  }

  const departments = ['All', ...new Set(employees.map(emp => emp.department).filter(Boolean))]

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(emp.employee_id).toLowerCase().includes(searchQuery.toLowerCase());
                          
    // Day/Night Shift mapping
    const empShiftVal = String(emp.new_shift || emp.shift || '').toLowerCase();
    let isDay = empShiftVal.includes('day') || empShiftVal === 'd';
    let isNight = empShiftVal.includes('night') || empShiftVal === 'n';
    
    const matchesDayNight = selectedDayNight === 'All' || 
                           (selectedDayNight === 'Day' && isDay) || 
                           (selectedDayNight === 'Night' && isNight);

    const matchesDept = selectedDepartment === 'All' || emp.department === selectedDepartment;
    const matchesBranch = selectedBranch === 'All' || emp.branch === selectedBranch;
    
    // Status Filter
    let matchesStatus = true;
    const hasSessions = emp.sessions && emp.sessions.length > 0;
    const isCurrentlyCheckedIn = emp.attendance_id && !emp.check_out;

    if (selectedStatus === 'Present') {
      matchesStatus = isCurrentlyCheckedIn;
    } else if (selectedStatus === 'CheckedOut') {
      matchesStatus = hasSessions && !isCurrentlyCheckedIn;
    } else if (selectedStatus === 'Late') {
      matchesStatus = emp.calculated_status === 'Late';
    } else if (selectedStatus === 'Absent') {
      matchesStatus = emp.calculated_status === 'Absent';
    } else if (selectedStatus === 'Pending') {
      matchesStatus = emp.calculated_status === 'Pending';
    }

    return matchesSearch && matchesDayNight && matchesDept && matchesStatus && matchesBranch;
  }).sort((a, b) => {
    // Sort present (checked-in) employees to the top
    const aCheckedIn = a.attendance_id && !a.check_out ? 1 : 0;
    const bCheckedIn = b.attendance_id && !b.check_out ? 1 : 0;
    return bCheckedIn - aCheckedIn;
  })

  return (
    <div className="page-content" style={{ paddingTop: 0 }}>
      {/* Header and Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: -60, flexWrap: 'wrap', gap: 16 }}>
        <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Fingerprint size={24} style={{ color: 'var(--primary)' }} /> Present Active Staff Today
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Compact Stats */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default', pointerEvents: 'none' }}>
              <span>Total:</span>
              <span style={{ fontWeight: 700 }}>{employees.length}</span>
            </div>
            
            <div className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default', pointerEvents: 'none' }}>
              <span>Active:</span>
              <span style={{ fontWeight: 700 }}>{employees.filter(e => e.attendance_id && !e.check_out).length}</span>
            </div>

            <div className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default', pointerEvents: 'none' }}>
              <span>Break:</span>
              <span style={{ fontWeight: 700 }}>{employees.filter(e => e.on_break).length}</span>
            </div>
          </div>

          {/* Edit Attendance button */}
          {['admin', 'operator', 'developer'].includes(user?.role?.toLowerCase()) && (
            <button
              className="btn btn-secondary attendance-header-btn"
              onClick={() => openEditModal()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, fontSize: 13, borderColor: 'var(--primary)', color: 'var(--text)', padding: '0 14px' }}
            >
              <Edit size={14} style={{ color: 'var(--primary)' }} />
              <span className="btn-text">Edit Attendance</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Options */}
      {/* Filter Options */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 250, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 120, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search active staff..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 10px 10px 32px',
                background: 'var(--surface)',
                border: '1.5px solid var(--surface-2)',
                borderRadius: 10,
                outline: 'none',
                fontSize: 13,
                boxSizing: 'border-box'
              }}
            />
          </div>
          
          <button 
            className="btn btn-secondary filter-mobile-toggle-btn"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              borderRadius: 10,
              height: 40,
              width: 40,
              borderColor: showMobileFilters ? 'var(--primary)' : 'var(--surface-2)',
              color: showMobileFilters ? 'var(--primary)' : 'var(--text)',
              flexShrink: 0
            }}
          >
            <Filter size={18} />
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={loadTodayAttendance} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '10px', 
              borderRadius: 10, 
              height: 40, 
              width: 40, 
              flexShrink: 0
            }}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={exportToExcel}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '10px', 
              borderRadius: 10, 
              height: 40, 
              width: 40, 
              flexShrink: 0
            }}
            title="Export Excel"
          >
            <Download size={16} />
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
            value={selectedDayNight}
            onChange={e => setSelectedDayNight(e.target.value)}
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
            <option value="All">All Shifts (Day/Night)</option>
            <option value="Day">Day Shift</option>
            <option value="Night">Night Shift</option>
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
            <option value="CheckedOut">Checked Out</option>
            <option value="Late">Late Arrivals</option>
            <option value="Absent">Absent Today</option>
            <option value="Pending">Pending</option>
          </select>

          {(searchQuery !== '' || selectedDayNight !== 'All' || selectedDepartment !== 'All' || selectedStatus !== 'All' || selectedBranch !== 'All') && (
            <button 
              className="btn btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setSelectedDayNight('All');
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
          .attendance-header-btn .btn-text {
            display: none !important;
          }
          .attendance-header-btn {
            padding: 10px !important;
            width: 40px !important;
            height: 40px !important;
            justify-content: center !important;
          }
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

      {/* Spreadsheet / Excel-Sheet View */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading active staff logs...
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <User size={48} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3>No Active Staff Present</h3>
          <p style={{ color: 'var(--text-muted)' }}>Nobody is currently checked in matching your filter criteria.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '800px' }}>
              <thead>
                <tr style={{ background: 'var(--surface-1)' }}>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', width: '50px' }}>#</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', width: '100px' }}>Code</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left', minWidth: '220px' }}>Employee Name</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', width: '100px' }}>Shift Hrs</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left', minWidth: '150px' }}>Branch</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Check-In Time</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Check-Out Time</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Checked By</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Status</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Hours Worked</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Break Time</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Overtime</th>
                  {['admin', 'operator', 'developer'].includes(user?.role?.toLowerCase()) && (
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '80px' }}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp, index) => {
                  const staffRole = emp.role && emp.role.toLowerCase() !== 'operator' ? emp.role : 'Staff'
                  // Alternating zebra striping with very subtle color
                  const rowBg = index % 2 === 0 ? 'var(--surface)' : 'rgba(var(--primary-rgb), 0.025)'
                  const sessions = emp.sessions || []
                  
                  return (
                    <tr 
                      key={emp.employee_id} 
                      style={{ 
                        background: rowBg, 
                        borderBottom: '1px solid var(--surface-2)',
                        transition: 'background 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(var(--primary-rgb), 0.06)'}
                      onMouseOut={e => e.currentTarget.style.background = rowBg}
                    >
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{index + 1}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{emp.employee_code || emp.employee_id}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '220px' }}>{emp.name}</td>
                       <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600 }}>
                         {sessions.length > 0 && sessions[0].shift_start_time && sessions[0].shift_end_time 
                           ? `${sessions[0].shift_start_time} - ${sessions[0].shift_end_time}` 
                           : '--'}
                       </td>
                       <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600 }}>
                         {(() => {
                           const rawBranch = (sessions.length > 0 && sessions[0].branch) ? sessions[0].branch : (emp.branch || 'R1');
                           const b = formatBranchCode(rawBranch);
                           const sVal = String(emp.new_shift || emp.shift || 'Day').toLowerCase();
                           const suffix = sVal.includes('night') || sVal.includes('n') ? 'N' : 'D';
                           return (
                             <span style={{
                               display: 'inline-flex',
                               alignItems: 'center',
                               gap: 4,
                               padding: '2px 7px',
                               borderRadius: 4,
                               background: 'rgba(var(--primary-rgb), 0.1)',
                               color: 'var(--primary)',
                               fontWeight: 750,
                               fontSize: 12
                             }}>
                               {b}-{suffix}
                             </span>
                           );
                         })()}
                       </td>
                      
                      {/* Check-In Column (Stacked list of all check-in sessions) */}
                      <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, textAlign: 'center', color: 'var(--green)' }}>
                        {sessions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {sessions.map((s, idx) => {
                              const isEdited = s.remarks === 'Edited';
                              const isManual = s.remarks === 'Manual';
                              const tag = isEdited ? <span style={{color: '#3B82F6', fontSize: 10, fontWeight: 700}}>(E)</span> : isManual ? <span style={{color: '#8B5CF6', fontSize: 10, fontWeight: 700}}>(M)</span> : null;
                              const valColor = isEdited ? '#3B82F6' : isManual ? '#8B5CF6' : 'var(--green)';
                              return (
                                <div key={idx} style={{ color: valColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                  <span>In: {new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                  {tag}
                                  <span style={{
                                    fontSize: '9px',
                                    fontWeight: 800,
                                    padding: '1px 3px',
                                    borderRadius: '3px',
                                    background: 'var(--surface-2)',
                                    color: 'var(--text-muted)'
                                  }}>
                                    {formatBranchCode(s.branch || emp.branch)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          '--'
                        )}
                      </td>

                      {/* Check-Out Column (Stacked list of all check-out sessions) */}
                      <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, textAlign: 'center', color: 'var(--text-muted)' }}>
                        {sessions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {sessions.map((s, idx) => {
                              const isEdited = s.remarks === 'Edited';
                              const isManual = s.remarks === 'Manual';
                              const tag = isEdited ? <span style={{color: '#3B82F6', fontSize: 10, fontWeight: 700}}>(E)</span> : isManual ? <span style={{color: '#8B5CF6', fontSize: 10, fontWeight: 700}}>(M)</span> : null;
                              const valColor = isEdited ? '#3B82F6' : isManual ? '#8B5CF6' : 'var(--text-muted)';
                              return (
                                <div key={idx} style={{ color: valColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                                  {s.check_out ? `Out: ${new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'Active'} {s.check_out && tag}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          '--'
                        )}
                      </td>
                      
                      {/* Checked By Column */}
                      <td style={{ padding: '12px 14px', fontSize: 11, fontWeight: 600, textAlign: 'center', color: 'var(--text-muted)' }}>
                        {sessions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {sessions.map((s, idx) => (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 4 }}>
                                <span style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>In: {s.created_by || '--'}</span>
                                {s.check_out && <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Out: {s.checked_out_by || '--'}</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          '--'
                        )}
                      </td>

                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {(() => {
                          const totalHours = parseFloat(emp.total_hours_today || 0);
                          const isCheckedOut = sessions.length > 0 && (!emp.attendance_id || emp.check_out);
                          const isOnlyOT = isCheckedOut && totalHours > 0 && totalHours < 6;

                          if (sessions.length === 0) {
                            return emp.calculated_status === 'Absent' ? (
                              <span style={{ color: 'var(--red)', background: 'rgba(255, 69, 58, 0.1)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                                Absent
                              </span>
                            ) : (
                              <span style={{ color: '#F59E0B', background: 'rgba(245, 158, 11, 0.1)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                                Pending
                              </span>
                            );
                          }
                          if (isOnlyOT) {
                            return (
                              <span style={{ color: '#8B5CF6', background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                Only Overtime
                              </span>
                            );
                          }
                          if (!emp.attendance_id || emp.check_out) {
                            return (
                              <span style={{ color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                                Checked Out
                              </span>
                            );
                          }
                          return (
                            <span style={{ 
                              color: emp.on_break ? 'var(--primary)' : 'var(--green)', 
                              background: emp.on_break ? 'rgba(var(--primary-rgb), 0.1)' : 'rgba(34, 197, 94, 0.1)', 
                              padding: '3px 8px', 
                              borderRadius: 6, 
                              fontSize: 11, 
                              fontWeight: 600 
                            }}>
                              {emp.on_break ? 'On Break' : emp.attendance_status === 'Late' ? 'Late' : 'Present'}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
                        {(() => {
                          const totalHours = parseFloat(emp.total_hours_today || 0);
                          const isCheckedOut = sessions.length > 0 && (!emp.attendance_id || emp.check_out);
                          const isOnlyOT = isCheckedOut && totalHours > 0 && totalHours < 6;
                          const isAbsent = sessions.length === 0 && emp.calculated_status === 'Absent';
                          const dutyHours = isOnlyOT ? 0 : Math.min(parseFloat(emp.shift_hours) || 12.0, totalHours);
                          const dayBranch = formatBranchCode((sessions.length > 0 && sessions[0].branch) ? sessions[0].branch : emp.branch);

                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                              <span style={{ color: isOnlyOT ? '#8B5CF6' : isAbsent ? 'var(--red)' : 'var(--green)' }}>
                                {isOnlyOT ? '0 min' : decimalHoursToText(dutyHours)}
                              </span>
                              <span style={{
                                fontSize: '9px',
                                fontWeight: 800,
                                padding: isAbsent ? '0' : '1px 4px',
                                borderRadius: '3px',
                                background: isAbsent ? 'transparent' : (isOnlyOT ? 'rgba(139, 92, 246, 0.15)' : 'rgba(var(--primary-rgb), 0.12)'),
                                color: isAbsent ? 'var(--text-muted)' : (isOnlyOT ? '#8B5CF6' : 'var(--primary)'),
                                border: isAbsent ? 'none' : (isOnlyOT ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(var(--primary-rgb), 0.25)'),
                                lineHeight: 1.1
                              }}>
                                {isAbsent ? `[${dayBranch}]` : dayBranch}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--primary)', textAlign: 'center' }}>
                        {formatBreakTime(emp.total_break_seconds_today || 0)}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
                        {(() => {
                          const totalHours = parseFloat(emp.total_hours_today || 0);
                          const isCheckedOut = sessions.length > 0 && (!emp.attendance_id || emp.check_out);
                          const isOnlyOT = isCheckedOut && totalHours > 0 && totalHours < 6;
                          const otHours = isOnlyOT ? totalHours : Math.max(0, totalHours - (parseFloat(emp.shift_hours) || 12.0));

                          return (
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ color: isOnlyOT ? '#8B5CF6' : 'var(--primary)' }}>
                                {decimalHoursToText(otHours)}
                              </span>
                              {isOnlyOT && (
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#8B5CF6', background: 'rgba(139, 92, 246, 0.12)', padding: '1px 5px', borderRadius: 4 }}>
                                  Only OT (&lt;6h)
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {['admin', 'operator', 'developer'].includes(user?.role?.toLowerCase()) && (
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', width: 32, height: 32 }}
                            onClick={() => openEditModal(emp.employee_id)}
                          >
                            <MoreVertical size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Enhanced Multi-Step Edit Attendance Modal ── */}
      {showEditModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 16
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: 28, position: 'relative', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Close */}
            <button onClick={closeEditModal} style={{ position: 'absolute', right: 16, top: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>

            {/* Title */}
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit size={18} style={{ color: 'var(--primary)' }} /> Edit Attendance
              </h3>
              {/* Step indicator */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {['Employee', 'Date', 'Action'].map((label, i) => {
                  const stepKey = ['employee', 'date', 'mode'][i]
                  const steps = ['employee', 'date', 'mode']
                  const currentIdx = steps.indexOf(editStep)
                  const isActive = editStep === stepKey
                  const isDone = steps.indexOf(stepKey) < currentIdx
                  return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        background: isDone ? 'var(--primary)' : isActive ? 'var(--primary)' : 'var(--surface-2)',
                        color: (isDone || isActive) ? 'white' : 'var(--text-muted)'
                      }}>{isDone ? '✓' : i + 1}</div>
                      <span style={{ fontSize: 11, color: isActive ? 'var(--text)' : 'var(--text-muted)', fontWeight: isActive ? 600 : 400 }}>{label}</span>
                      {i < 2 && <div style={{ width: 20, height: 2, background: isDone ? 'var(--primary)' : 'var(--surface-2)', marginLeft: 2 }} />}
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>

              {/* ── STEP 1: Select Employee ── */}
              {editStep === 'employee' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Select Employee</label>
                    <select
                      value={editEmpId}
                      onChange={e => setEditEmpId(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid var(--surface-2)', borderRadius: 8, outline: 'none', fontSize: 13 }}
                    >
                      <option value="">-- Choose Employee --</option>
                      {employeesList.filter(e => e.status === 'Active' || !e.status).map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                    <button className="btn btn-secondary" onClick={closeEditModal}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleEditStep1Next}>Next →</button>
                  </div>
                </div>
              )}

              {/* ── STEP 2: Select Date ── */}
              {editStep === 'date' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>Select Date Range</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {['today', 'previous'].map(mode => (
                        <button
                          key={mode}
                          onClick={() => {
                            setEditDateMode(mode);
                            if (mode === 'today') setEditDate(formatLocalDate(new Date()));
                            if (mode === 'previous') setEditDate(yesterdayStr);
                          }}
                          style={{
                            flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: '2px solid',
                            borderColor: editDateMode === mode ? 'var(--primary)' : 'var(--surface-2)',
                            background: editDateMode === mode ? 'var(--primary)' : 'var(--surface)',
                            color: editDateMode === mode ? 'white' : 'var(--text)'
                          }}
                        >
                          {mode === 'today' ? '📅 Today' : '🗓 Previous Day'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {editDateMode === 'previous' && user?.role?.toLowerCase() !== 'operator' && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Select Date <span style={{ color: 'var(--red)' }}>(no future dates)</span></label>
                      <input
                        type="date"
                        value={editDate}
                        max={yesterdayStr}
                        onChange={e => setEditDate(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid var(--surface-2)', borderRadius: 8, outline: 'none', fontSize: 13, boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                  {editDateMode === 'previous' && user?.role?.toLowerCase() === 'operator' && (
                    <div style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                      Editing attendance for: <strong>{new Date(yesterdayStr).toLocaleDateString()}</strong> (Yesterday)
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setEditStep('employee')}>← Back</button>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="btn btn-secondary" onClick={closeEditModal}>Cancel</button>
                      <button className="btn btn-primary" onClick={handleEditStep2Next}>Next →</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Choose Mode ── */}
              {editStep === 'mode' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Mode selector */}
                  {!editMode && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>What would you like to do?</label>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => setEditMode('add')}
                          style={{ flex: 1, padding: '16px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: '2px solid var(--surface-2)', background: 'var(--surface)', color: 'var(--text)' }}
                        >➕ Add New Session</button>
                        <button
                          onClick={() => setEditMode('edit')}
                          style={{ flex: 1, padding: '16px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: '2px solid var(--surface-2)', background: 'var(--surface)', color: 'var(--text)' }}
                        >✏️ Edit Sessions</button>
                      </div>
                    </div>
                  )}

                  {/* Add new session form */}
                  {editMode === 'add' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>➕ Add New Session</span>
                        <button onClick={() => setEditMode('')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginRight: 10 }}>← Back</button>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Date: <strong>{editDate}</strong></p>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Check-In Time *</label>
                        <input type="time" lang="en-GB" value={newCheckIn} onChange={e => setNewCheckIn(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid var(--surface-2)', borderRadius: 8, outline: 'none', fontSize: 13, boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Check-Out Time *</label>
                        <input type="time" lang="en-GB" value={newCheckOut} onChange={e => setNewCheckOut(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid var(--surface-2)', borderRadius: 8, outline: 'none', fontSize: 13, boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Branch</label>
                        <select value={newBranch} onChange={e => setNewBranch(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid var(--surface-2)', borderRadius: 8, outline: 'none', fontSize: 13 }}
                        >
                          <option value="R1">R1</option>
                          <option value="R2">R2</option>
                          <option value="R3">R3</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Status</label>
                        <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid var(--surface-2)', borderRadius: 8, outline: 'none', fontSize: 13 }}
                        >
                          <option value="Present">Present</option>
                          <option value="Late">Late</option>
                        </select>
                      </div>
                      <button className="btn btn-primary" onClick={handleAddSession} style={{ marginTop: 4 }}>
                        Add Session
                      </button>
                    </div>
                  )}

                  {/* Edit existing sessions */}
                  {editMode === 'edit' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>✏️ Edit Sessions</span>
                        <button onClick={() => setEditMode('')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginRight: 10 }}>← Back</button>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Date: <strong>{editDate}</strong></p>
                      {loadingSessions ? (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading sessions...</div>
                      ) : editSessions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>No sessions found for this date.</div>
                      ) : (
                        editSessions.map((s, idx) => (
                          <EditSessionRow
                            key={s.id}
                            session={s}
                            previousSession={idx > 0 ? editSessions[idx - 1] : null}
                            nextSession={idx < editSessions.length - 1 ? editSessions[idx + 1] : null}
                            index={idx}
                            saving={savingSessionId === s.id}
                            onSave={handleUpdateExistingSession}
                            onDelete={handleDeleteSession}
                          />
                        ))
                      )}
                    </div>
                  )}

                  {/* Back button when no mode selected */}
                  {!editMode && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
                      <button className="btn btn-secondary" onClick={() => setEditStep('date')}>← Back</button>
                      <button className="btn btn-secondary" onClick={closeEditModal}>Cancel</button>
                    </div>
                  )}

                  {editMode && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      <button className="btn btn-secondary" onClick={closeEditModal}>Close</button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Inline Session Edit Row ───────────────────────────────────────────────────
function EditSessionRow({ session, previousSession, nextSession, index, saving, onSave, onDelete }) {
  const [inVal, setInVal] = useState(() => toSaudiTimeInput(session.check_in))
  const [outVal, setOutVal] = useState(() => toSaudiTimeInput(session.check_out))
  const [branchVal, setBranchVal] = useState(() => formatBranchCode(session.branch || 'R1'))
  const [reason, setReason] = useState('')
  const [showAuditLogs, setShowAuditLogs] = useState(false)

  // Parse existing break sessions from session.break_logs
  const [breaks, setBreaks] = useState(() => {
    let list = []
    if (Array.isArray(session.break_logs)) list = [...session.break_logs]
    else if (typeof session.break_logs === 'string') {
      try { list = JSON.parse(session.break_logs) } catch (e) {}
    }
    const parsed = list.map((b, i) => ({
      id: `b_${Date.now()}_${i}`,
      inVal: toSaudiTimeInput(b.break_in),
      outVal: toSaudiTimeInput(b.break_out)
    }))
    // If currently on break and not yet in break_logs
    if (session.on_break && session.break_start && !parsed.some(b => !b.outVal)) {
      parsed.push({
        id: `b_active_${Date.now()}`,
        inVal: toSaudiTimeInput(session.break_start),
        outVal: ''
      })
    }
    return parsed
  })

  const handleAddBreak = () => {
    setBreaks(prev => [...prev, { id: `b_${Date.now()}_${Math.random()}`, inVal: '', outVal: '' }])
  }

  const handleUpdateBreak = (id, field, val) => {
    setBreaks(prev => prev.map(b => b.id === id ? { ...b, [field]: val } : b))
  }

  const handleRemoveBreak = (id) => {
    setBreaks(prev => prev.filter(b => b.id !== id))
  }

  const handleSave = () => {
    if (session.check_out && !outVal) {
      toast.error('Check-out time is required because this session was already checked out.');
      return;
    }

    const baseDateIn = getSaudiDateString(session.check_in || session.date || new Date());
    const fullInISO = saudiTimeToISO(baseDateIn, inVal);

    if (previousSession && previousSession.check_out) {
      if (new Date(fullInISO) <= new Date(previousSession.check_out)) {
        toast.error('Check-in time must be after previous session\'s check-out time.');
        return;
      }
    }

    let fullOutISO = null;
    let baseDateOut = baseDateIn;
    if (outVal) {
      if (outVal < inVal) {
        const nextDay = new Date(baseDateIn);
        nextDay.setDate(nextDay.getDate() + 1);
        baseDateOut = getSaudiDateString(nextDay);
      }
      fullOutISO = saudiTimeToISO(baseDateOut, outVal);

      if (nextSession && nextSession.check_in) {
        if (new Date(fullOutISO) >= new Date(nextSession.check_in)) {
          toast.error('Check-out time must be before next session\'s check-in time.');
          return;
        }
      }
    }

    const sessionInDate = new Date(fullInISO);
    const sessionOutDate = fullOutISO ? new Date(fullOutISO) : null;

    // Process & validate break sessions
    const formattedBreaks = [];
    for (let i = 0; i < breaks.length; i++) {
      const b = breaks[i];
      if (!b.inVal && !b.outVal) continue; // skip completely empty
      if (!b.inVal) {
        toast.error(`Break #${i + 1} has Out time but is missing In time.`);
        return;
      }

      let breakDateIn = baseDateIn;
      if (sessionOutDate && baseDateOut !== baseDateIn && b.inVal < inVal) {
        breakDateIn = baseDateOut;
      }
      const bInISO = saudiTimeToISO(breakDateIn, b.inVal);
      const bInDate = new Date(bInISO);

      // Break must be within session Check-In and Check-Out
      if (bInDate < sessionInDate) {
        toast.error(`Break #${i + 1} In time (${b.inVal}) cannot be before Check-In time (${inVal}).`);
        return;
      }
      if (sessionOutDate && bInDate >= sessionOutDate) {
        toast.error(`Break #${i + 1} In time (${b.inVal}) cannot be after Check-Out time (${outVal}).`);
        return;
      }

      let bOutISO = null;
      let bOutDate = null;
      if (b.outVal) {
        let breakDateOut = breakDateIn;
        if (b.outVal < b.inVal) {
          const nextBD = new Date(breakDateIn);
          nextBD.setDate(nextBD.getDate() + 1);
          breakDateOut = getSaudiDateString(nextBD);
        }
        bOutISO = saudiTimeToISO(breakDateOut, b.outVal);
        bOutDate = new Date(bOutISO);

        if (bOutDate <= bInDate) {
          toast.error(`Break #${i + 1} Out time must be after In time.`);
          return;
        }
        if (sessionOutDate && bOutDate > sessionOutDate) {
          toast.error(`Break #${i + 1} Out time (${b.outVal}) cannot exceed session Check-Out time (${outVal}).`);
          return;
        }
      } else if (outVal) {
        toast.error(`Break #${i + 1} must have an Out time because the session is checked out.`);
        return;
      }

      const durSecs = bOutDate ? Math.max(0, Math.floor((bOutDate.getTime() - bInDate.getTime()) / 1000)) : 0;
      formattedBreaks.push({
        break_in: bInISO,
        break_out: bOutISO,
        duration_seconds: durSecs
      });
    }

    onSave(session.id, fullInISO, fullOutISO, reason, formattedBreaks, branchVal);
  }

  return (
    <div style={{ background: 'var(--surface-1)', padding: 14, borderRadius: 10, border: '1px solid var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
            Session #{index + 1} — {session.status}
          </span>
          {session.remarks && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              {session.remarks}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAuditLogs(!showAuditLogs)}
          title="Click to view session audit history and who created/edited this attendance"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: showAuditLogs ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface-2)',
            color: showAuditLogs ? '#2563eb' : 'var(--text-secondary)',
            border: '1px solid var(--surface-3)',
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <Info size={13} />
          <span>Logs & History</span>
          {session.edit_history && session.edit_history.length > 0 && (
            <span style={{ 
              background: '#ef4444', 
              color: '#fff', 
              fontSize: 9, 
              fontWeight: 800, 
              padding: '1px 5px', 
              borderRadius: 10 
            }}>
              {session.edit_history.length}
            </span>
          )}
        </button>
      </div>

      {/* Audit Logs / Session History Popdown */}
      {showAuditLogs && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--surface-3)',
          borderRadius: 8,
          padding: 10,
          fontSize: 11,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--surface-2)', paddingBottom: 4 }}>
            📋 Session Audit Trail
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--surface-1)', padding: '6px 8px', borderRadius: 6 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Checked In / Created By:</div>
              <div style={{ fontWeight: 700, color: 'var(--green)' }}>
                {session.created_by || 'System / Auto'}
              </div>
              {session.created_at && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(session.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              )}
            </div>

            <div style={{ background: 'var(--surface-1)', padding: '6px 8px', borderRadius: 6 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Checked Out By:</div>
              <div style={{ fontWeight: 700, color: session.check_out ? 'var(--text-primary)' : '#f59e0b' }}>
                {session.check_out ? (session.checked_out_by || 'Auto System Checkout') : 'Active (Not Checked Out)'}
              </div>
              {session.check_out && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(session.check_out).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              )}
            </div>
          </div>

          {/* Edit History Records */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
              Edit History ({session.edit_history?.length || 0}):
            </div>
            {(!session.edit_history || session.edit_history.length === 0) ? (
              <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: 10 }}>
                No previous edits recorded for this session.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {session.edit_history.map((h, hIdx) => (
                  <div key={hIdx} style={{ background: 'var(--surface-1)', padding: '6px 8px', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#2563eb' }}>Edited by: {h.edited_by || 'Admin'}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                        {h.edited_at ? new Date(h.edited_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ''}
                      </span>
                    </div>
                    {h.reason && (
                      <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                        <strong>Reason:</strong> {h.reason}
                      </div>
                    )}
                    {(h.original_check_in || h.new_check_in) && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        In: {h.original_check_in ? new Date(h.original_check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} → {h.new_check_in ? new Date(h.new_check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} | Out: {h.original_check_out ? new Date(h.original_check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'} → {h.new_check_out ? new Date(h.new_check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Check-In</span>
          <input type="time" lang="en-GB" value={inVal} onChange={e => setInVal(e.target.value)}
            style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '6px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Check-Out</span>
          <input type="time" lang="en-GB" value={outVal} onChange={e => setOutVal(e.target.value)}
            style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '6px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>
        <div style={{ width: 85, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Branch</span>
          <select value={branchVal} onChange={e => setBranchVal(e.target.value)}
            style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '5px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', height: 31 }}
          >
            <option value="R1">R1</option>
            <option value="R2">R2</option>
            <option value="R3">R3</option>
          </select>
        </div>
      </div>

      {/* Break Sessions Manager */}
      <div style={{ 
        background: 'var(--surface)', 
        border: '1px solid var(--surface-3)', 
        borderRadius: 8, 
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 4 }}>
            ☕ Break Sessions ({breaks.length})
          </span>
          <button
            type="button"
            onClick={handleAddBreak}
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--primary)',
              background: 'rgba(var(--primary-rgb), 0.1)',
              border: '1px solid rgba(var(--primary-rgb), 0.2)',
              borderRadius: 4,
              padding: '3px 8px',
              cursor: 'pointer'
            }}
          >
            + Add Break
          </button>
        </div>

        {breaks.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
            No breaks in this session. Click "+ Add Break" to add one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {breaks.map((b, bIdx) => (
              <div key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface-1)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--surface-2)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', minWidth: 50 }}>
                  Break #{bIdx + 1}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700 }}>In:</span>
                  <input
                    type="time"
                    lang="en-GB"
                    value={b.inVal}
                    onChange={e => handleUpdateBreak(b.id, 'inVal', e.target.value)}
                    style={{ border: '1px solid var(--surface-3)', borderRadius: 4, padding: '3px 6px', fontSize: 11, background: 'var(--surface)', color: 'var(--text)', width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>Out:</span>
                  <input
                    type="time"
                    lang="en-GB"
                    value={b.outVal}
                    onChange={e => handleUpdateBreak(b.id, 'outVal', e.target.value)}
                    style={{ border: '1px solid var(--surface-3)', borderRadius: 4, padding: '3px 6px', fontSize: 11, background: 'var(--surface)', color: 'var(--text)', width: '100%' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveBreak(b.id)}
                  title="Delete Break"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: 'none',
                    color: 'var(--red)',
                    cursor: 'pointer',
                    borderRadius: 4,
                    padding: '4px 7px',
                    fontSize: 10,
                    fontWeight: 800
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Reason for Edit <span style={{ color: 'var(--red)' }}>*</span></span>
        <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Required reason..."
          style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '6px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" disabled={saving} onClick={() => onDelete(session.id)}
          style={{ height: 30, fontSize: 11, padding: '0 12px', background: '#EF4444', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >{saving ? '...' : 'Delete'}</button>
        <button className="btn btn-primary" disabled={saving || !inVal} onClick={handleSave}
          style={{ height: 30, fontSize: 11, padding: '0 12px' }}
        >{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  )
}
