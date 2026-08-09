import { useEffect, useState } from 'react'
import axios from '../api'
import { Fingerprint, Coffee, Clock, User, LogIn, Search, RefreshCw, FileText, MoreVertical, X, Download, Filter, Edit } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

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

const formatLocalDate = (date) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function TodayAttendance() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [employeesList, setEmployeesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedShift, setSelectedShift] = useState('All')
  const [selectedDepartment, setSelectedDepartment] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [shiftsList, setShiftsList] = useState([])
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

  const loadShifts = () => {
    axios.get('/api/employees/shifts/list')
      .then(res => setShiftsList(res.data))
      .catch(() => {})
  }

  const loadEmployeesList = () => {
    axios.get('/api/employees')
      .then(res => setEmployeesList(res.data || []))
      .catch(() => {})
  }

  useEffect(() => {
    loadTodayAttendance()
    loadShifts()
    loadEmployeesList()
    const interval = setInterval(loadTodayAttendance, 30000)
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
    if (new Date(newCheckOut) <= new Date(newCheckIn)) { toast.error('Check-Out must be after Check-In'); return }
    const toISO = (v) => v ? new Date(v).toISOString() : null
    try {
      await axios.post('/api/attendance/session', {
        employee_id: editEmpId,
        date: editDate,
        check_in: toISO(newCheckIn),
        check_out: toISO(newCheckOut),
        status: newStatus
      })
      toast.success('Session added!')
      setNewCheckIn('')
      setNewCheckOut('')
      setNewStatus('Present')
      loadEditSessions(editEmpId, editDate)
      loadTodayAttendance()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add session')
    }
  }

  const handleUpdateExistingSession = async (sessionId, inVal, outVal, reason) => {
    if (!reason || !reason.trim()) { toast.error('Reason is required'); return }
    setSavingSessionId(sessionId)
    try {
      const toISO = (v) => v ? new Date(v).toISOString() : null
      await axios.post('/api/attendance/edit', {
        attendance_id: sessionId,
        new_check_in: toISO(inVal),
        new_check_out: toISO(outVal),
        reason
      })
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
        const checkInTimes = sessions.map(s => `In: ${new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).join('\n')
        const checkOutTimes = sessions.map(s => s.check_out ? `Out: ${new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Active').join('\n')
        
        let statusText = 'Absent'
        if (sessions.length > 0) {
          statusText = emp.on_break ? 'On Break' : emp.attendance_status === 'Late' ? 'Late' : 'Present'
        }

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
    const matchesShift = selectedShift === 'All' || emp.shift === selectedShift;
    const matchesDept = selectedDepartment === 'All' || emp.department === selectedDepartment;
    
    // Status Filter
    let matchesStatus = true;
    const hasSessions = emp.sessions && emp.sessions.length > 0;
    const isCurrentlyCheckedIn = emp.attendance_id && !emp.check_out;

    if (selectedStatus === 'Present') {
      matchesStatus = isCurrentlyCheckedIn;
    } else if (selectedStatus === 'CheckedOut') {
      matchesStatus = hasSessions && !isCurrentlyCheckedIn;
    } else if (selectedStatus === 'Late') {
      matchesStatus = hasSessions && emp.attendance_status === 'Late';
    } else if (selectedStatus === 'Absent') {
      matchesStatus = !hasSessions;
    }

    return matchesSearch && matchesShift && matchesDept && matchesStatus;
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
            <option value="CheckedOut">Checked Out</option>
            <option value="Late">Late Arrivals</option>
            <option value="Absent">Absent Today</option>
          </select>
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
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', width: '100px' }}>Code</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left', minWidth: '220px' }}>Employee Name</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', width: '100px' }}>Shift</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Check-In Time</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Check-Out Time</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Status</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Hours Worked</th>
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
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{emp.employee_code || emp.employee_id}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '220px' }}>{emp.name}</td>
                      <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600 }}>{emp.shift || 'R1'}</td>
                      
                      {/* Check-In Column (Stacked list of all check-in sessions) */}
                      <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, textAlign: 'center', color: 'var(--green)' }}>
                        {sessions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {sessions.map((s, idx) => (
                              <div key={idx}>In: {new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            ))}
                          </div>
                        ) : (
                          '--'
                        )}
                      </td>

                      {/* Check-Out Column (Stacked list of all check-out sessions) */}
                      <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, textAlign: 'center', color: 'var(--text-muted)' }}>
                        {sessions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {sessions.map((s, idx) => (
                              <div key={idx}>
                                {s.check_out ? `Out: ${new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Active'}
                              </div>
                            ))}
                          </div>
                        ) : (
                          '--'
                        )}
                      </td>

                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {sessions.length === 0 ? (
                          <span style={{ color: 'var(--red)', background: 'rgba(255, 69, 58, 0.1)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                            Absent
                          </span>
                        ) : !emp.attendance_id || emp.check_out ? (
                          <span style={{ color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                            Checked Out
                          </span>
                        ) : (
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
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--green)', textAlign: 'center' }}>
                        {decimalHoursToText(Math.min(parseFloat(emp.shift_hours) || 12.0, parseFloat(emp.total_hours_today || 0)))}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--primary)', textAlign: 'center' }}>
                        {decimalHoursToText(Math.max(0, parseFloat(emp.total_hours_today || 0) - (parseFloat(emp.shift_hours) || 12.0)))}
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
                          onClick={() => { setEditDateMode(mode); if (mode === 'today') setEditDate(formatLocalDate(new Date())) }}
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

                  {editDateMode === 'previous' && (
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>➕ Add New Session</span>
                        <button onClick={() => setEditMode('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>← Back</button>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Date: <strong>{editDate}</strong></p>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Check-In Time *</label>
                        <input type="datetime-local" value={newCheckIn} onChange={e => setNewCheckIn(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid var(--surface-2)', borderRadius: 8, outline: 'none', fontSize: 13, boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Check-Out Time *</label>
                        <input type="datetime-local" value={newCheckOut} onChange={e => setNewCheckOut(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid var(--surface-2)', borderRadius: 8, outline: 'none', fontSize: 13, boxSizing: 'border-box' }}
                        />
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>✏️ Edit Sessions</span>
                        <button onClick={() => setEditMode('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>← Back</button>
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
function EditSessionRow({ session, index, saving, onSave, onDelete }) {
  const toLocal = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,'0'), dy = String(d.getDate()).padStart(2,'0')
    const h = String(d.getHours()).padStart(2,'0'), mi = String(d.getMinutes()).padStart(2,'0')
    return `${y}-${mo}-${dy}T${h}:${mi}`
  }
  const [inVal, setInVal] = useState(() => toLocal(session.check_in))
  const [outVal, setOutVal] = useState(() => toLocal(session.check_out))
  const [reason, setReason] = useState('')

  return (
    <div style={{ background: 'var(--surface-1)', padding: 14, borderRadius: 10, border: '1px solid var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Session #{index + 1} — {session.status}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Check-In</span>
          <input type="datetime-local" value={inVal} onChange={e => setInVal(e.target.value)}
            style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '6px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Check-Out</span>
          <input type="datetime-local" value={outVal} onChange={e => setOutVal(e.target.value)}
            style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '6px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>
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
        <button className="btn btn-primary" disabled={saving || !inVal} onClick={() => onSave(session.id, inVal, outVal, reason)}
          style={{ height: 30, fontSize: 11, padding: '0 12px' }}
        >{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  )
}
