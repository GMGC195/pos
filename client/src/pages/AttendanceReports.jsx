import { useEffect, useRef, useState } from 'react'
import axios from '../api'
import { CalendarRange, Search, RefreshCw, FileText, User, Plus, X, Settings, Download, Edit, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

const formatLocalDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatHoursToText = (decimalHours) => {
  if (!decimalHours || decimalHours <= 0) return '0 min'
  const hrs = Math.floor(decimalHours)
  const mins = Math.round((decimalHours - hrs) * 60)
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`
  if (hrs > 0) return `${hrs} hr`
  return `${mins} min`
}

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
}

export default function AttendanceReports() {
  const { user } = useAuth()
  const isAdmin = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'developer'

  const [reports, setReports] = useState([])
  const [employeesList, setEmployeesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedShift, setSelectedShift] = useState('All')
  const [selectedDepartment, setSelectedDepartment] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  
  // Holiday state
  const [showHolidayModal, setShowHolidayModal] = useState(false)
  const [holidayDate, setHolidayDate] = useState(() => formatLocalDate(new Date()))
  const [holidayEmployeeId, setHolidayEmployeeId] = useState('Global')
  const [holidayShift, setHolidayShift] = useState('All')
  const [submittingHoliday, setSubmittingHoliday] = useState(null)

  // Edit Attendance State
  const [showEditModal, setShowEditModal] = useState(false)
  const [editEmployeeId, setEditEmployeeId] = useState('')
  const [editDate, setEditDate] = useState(() => formatLocalDate(new Date()))
  const [editSessions, setEditSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [savingSessionId, setSavingSessionId] = useState(null)

  const loadEditSessions = () => {
    if (!editEmployeeId || !editDate) return
    setLoadingSessions(true)
    axios.get('/api/attendance/employee-date', {
      params: { employee_id: editEmployeeId, date: editDate }
    })
      .then(res => setEditSessions(res.data))
      .catch(() => toast.error('Error loading employee logs'))
      .finally(() => setLoadingSessions(false))
  }

  useEffect(() => {
    if (showEditModal) {
      loadEditSessions()
    }
  }, [editEmployeeId, editDate, showEditModal])

  const handleUpdateSession = async (sessionId, checkInStr, checkOutStr) => {
    setSavingSessionId(sessionId)
    try {
      await axios.put(`/api/attendance/session/${sessionId}`, {
        check_in: checkInStr,
        check_out: checkOutStr || null
      })
      toast.success('Attendance session updated!')
      setShowEditModal(false)
      loadReports()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update session')
    } finally {
      setSavingSessionId(null)
    }
  }

  const handleDeleteSession = async (sessionId) => {
    confirmAction('Are you sure you want to delete this session?', async () => {
      setSavingSessionId(sessionId)
      try {
        await axios.delete(`/api/attendance/session/${sessionId}`)
        toast.success('Attendance session deleted!')
        loadEditSessions()
        loadReports()
      } catch (err) {
        toast.error(err?.response?.data?.error || 'Failed to delete session')
      } finally {
        setSavingSessionId(null)
      }
    })
  }

  // Detailed Modal State
  const [selectedEmployeeLogs, setSelectedEmployeeLogs] = useState(null)

  const handleEditFromPopup = (empId, dateStr) => {
    setSelectedEmployeeLogs(null)
    setEditEmployeeId(empId)
    setEditDate(dateStr)
    setShowEditModal(true)
  }

  const getHolidayDayName = () => {
    if (!holidayDate) return ''
    const [year, month, day] = holidayDate.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', { weekday: 'long' })
  }

  // Scroll ref — used to toggle active CSS classes on the grid container
  const scrollRef = useRef(null)
  const scrollStopTimer = useRef(null)

  // Toggle h-scrolled / v-scrolled classes on the grid scroll container.
  // Classes are added immediately when scroll starts, removed 250ms after
  // the last scroll event fires (debounced) so the CSS transition plays.
  const handleGridScroll = () => {
    const el = scrollRef.current
    if (!el) return

    if (el.scrollLeft > 0) {
      el.classList.add('h-scrolled')
    } else {
      el.classList.remove('h-scrolled')
    }

    if (el.scrollTop > 0) {
      el.classList.add('v-scrolled')
    } else {
      el.classList.remove('v-scrolled')
    }

    // Debounce: remove the "active" classes 250ms after scrolling stops
    clearTimeout(scrollStopTimer.current)
    scrollStopTimer.current = setTimeout(() => {
      if (!el) return
      // Only remove if scrolled back to origin
      if (el.scrollLeft <= 0) el.classList.remove('h-scrolled')
      if (el.scrollTop <= 0) el.classList.remove('v-scrolled')
    }, 250)
  }

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedEmployee, setSelectedEmployee] = useState('All')

  // Load active employees list
  useEffect(() => {
    axios.get('/api/employees')
      .then(res => setEmployeesList(res.data.filter(e => e.status === 'Active')))
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

  // Get days in the current selected month
  const getDaysInMonth = (monthStr) => {
    if (!monthStr) return []
    const [year, month] = monthStr.split('-').map(Number)
    const date = new Date(year, month - 1, 1)
    const days = []
    while (date.getMonth() === month - 1) {
      days.push(new Date(date))
      date.setDate(date.getDate() + 1)
    }
    return days
  }

  const daysInMonth = getDaysInMonth(selectedMonth)

  // Group logs by employee
  const getGroupedData = () => {
    const map = {}
    // Initialize map with all active employees to make sure they show in the sheet even with 0 attendance
    employeesList.forEach(emp => {
      map[emp.id] = {
        employee_id: emp.id,
        employee_code: emp.employee_id,
        name: emp.name,
        role: emp.role,
        shift: emp.shift || 'R1',
        shift_hours: parseFloat(emp.shift_hours || 12.0),
        department: emp.department || '',
        days: {}
      }
    })

    // Populate actual logs
    reports.forEach(log => {
      const empId = log.employee_id
      if (!map[empId]) {
        map[empId] = {
          employee_id: empId,
          employee_code: log.employee_code || `EMP-${String(empId).padStart(4, '0')}`,
          name: log.name,
          role: log.role,
          shift: log.shift || 'R1',
          shift_hours: parseFloat(log.shift_hours || 12.0),
          department: log.department || '',
          days: {}
        }
      }

      const logDate = typeof log.date === 'string' && log.date.includes('-') ? log.date.split('T')[0] : formatLocalDate(log.date)
      if (!map[empId].days[logDate]) {
        map[empId].days[logDate] = []
      }
      map[empId].days[logDate].push(log)
    })

    // Calculate aggregated metrics
    return Object.values(map).map(emp => {
      let presents = 0
      let absents = 0
      let leaves = 0
      let holidays = 0
      let lates = 0
      let totalHours = 0
      let totalOvertime = 0

      daysInMonth.forEach(day => {
        const dateStr = formatLocalDate(day)
        const sessions = emp.days[dateStr] || []

        if (sessions.length > 0) {
          const mainSession = sessions[0]
          if (mainSession.status === 'Holiday') {
            holidays++
          } else if (mainSession.status === 'Leave') {
            leaves++
          } else {
            presents++
            if (mainSession.status === 'Late') {
              lates++
            }
            // Sum all hours worked on this day and calculate daily overtime
            let dayHours = 0
            sessions.forEach(s => {
              dayHours += s.hours_worked || 0
            })
            dayHours = Math.min(24, dayHours) // Cap to 24 hours max per day
            totalHours += Math.min(emp.shift_hours || 12.0, dayHours)
            totalOvertime += Math.max(0, dayHours - (emp.shift_hours || 12.0))
          }
        } else {
          // If no log exists for a past date, it's considered an absent day
          const todayStr = formatLocalDate(new Date())
          if (dateStr < todayStr) {
            absents++
          }
        }
      })

      return {
        ...emp,
        presents,
        absents,
        leaves,
        holidays,
        lates,
        totalHours,
        totalOvertime
      }
    })
  }

  const groupedData = getGroupedData()

  const departments = ['All', ...new Set(employeesList.map(emp => emp.department).filter(Boolean))]
  const shifts = ['All', ...new Set(employeesList.map(emp => emp.shift).filter(Boolean))]

  const filteredGroupedData = groupedData.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(emp.employee_code || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDepartment === 'All' || emp.department === selectedDepartment;
    const matchesShift = selectedShift === 'All' || emp.shift === selectedShift;

    let matchesStatus = true;
    if (selectedStatus === 'Present') {
      matchesStatus = emp.presents > 0;
    } else if (selectedStatus === 'Absent') {
      matchesStatus = emp.absents > 0;
    } else if (selectedStatus === 'Late') {
      matchesStatus = emp.lates > 0;
    } else if (selectedStatus === 'Holiday') {
      matchesStatus = emp.holidays > 0;
    } else if (selectedStatus === 'Leave') {
      matchesStatus = emp.leaves > 0;
    }

    return matchesSearch && matchesDept && matchesShift && matchesStatus;
  });

  // Set Holiday API Call
  const handleSaveHoliday = async () => {
    if (submittingHoliday) return
    setSubmittingHoliday('saving')
    try {
      const isGlobal = holidayEmployeeId === 'Global'
      await axios.post('/api/attendance/holiday', {
        date: holidayDate,
        employee_id: (isGlobal || holidayEmployeeId === 'ShiftGlobal') ? null : holidayEmployeeId,
        is_global: isGlobal,
        shift: holidayShift !== 'All' ? holidayShift : null
      })
      toast.success('Holiday marked successfully!')
      setShowHolidayModal(false)
      loadReports()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to mark holiday')
    } finally {
      setSubmittingHoliday(null)
    }
  }

  // Remove Holiday API Call
  const handleRemoveHoliday = async () => {
    if (submittingHoliday) return
    setSubmittingHoliday('removing')
    try {
      const isGlobal = holidayEmployeeId === 'Global'
      await axios.delete('/api/attendance/holiday', {
        data: {
          date: holidayDate,
          employee_id: (isGlobal || holidayEmployeeId === 'ShiftGlobal') ? null : holidayEmployeeId,
          is_global: isGlobal,
          shift: holidayShift !== 'All' ? holidayShift : null
        }
      })
      toast.success('Holiday removed successfully!')
      setShowHolidayModal(false)
      loadReports()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to remove holiday')
    } finally {
      setSubmittingHoliday(null)
    }
  }

  // Export Monthly Sheet to Excel (with identical layout and check-in/out cell formats)
  // Export Monthly Sheet to Excel with full color formatting, custom alignments, and auto-adjusted widths
  const exportToExcel = () => {
    try {
      const headers = ['Code', 'Employee Name']
      daysInMonth.forEach(day => {
        headers.push(`${day.getDate()} (${day.toLocaleDateString([], { weekday: 'short' })})`)
      })
      headers.push('P', 'A', 'L', 'H', 'Late Arrival', 'Duty Hours', 'Overtime')

      // Build HTML content representing the Excel sheet with inline styles and worksheet configuration
      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">`
      html += `<head><meta charset="utf-8"/>`
      html += `<!--[if gte mso 9]>`
      html += `<xml>`
      html += `  <x:ExcelWorkbook>`
      html += `    <x:ExcelWorksheets>`
      html += `      <x:ExcelWorksheet>`
      html += `        <x:Name>Attendance ${selectedMonth}</x:Name>`
      html += `        <x:WorksheetOptions>`
      html += `          <x:DisplayGridlines/>`
      html += `        </x:WorksheetOptions>`
      html += `      </x:ExcelWorksheet>`
      html += `    </x:ExcelWorksheets>`
      html += `  </x:ExcelWorkbook>`
      html += `</xml>`
      html += `<![endif]-->`
      html += `<style>`
      html += `  table { border-collapse: collapse; }`
      html += `  th, td { border: 0.5pt solid #CBD5E1; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; padding: 8px 12px; vertical-align: middle; }`
      // Highlight top row (Day and Date) with Brand Dark Teal #103C43 and white text
      html += `  th { background-color: #103C43; color: #FFFFFF; font-weight: bold; text-align: center; }`
      html += `  th.emp-header { background-color: #F4B400; color: #000000; }` // Mustard Yellow for code/name headers
      // Highlight Employee Code and Employee Name columns with Light Yellow #FEF3C7
      html += `  .highlight-col { background-color: #FEF3C7; font-weight: bold; color: #1E293B; }`
      html += `  .code-cell { text-align: center; }`
      html += `  .name-cell { text-align: left; }`
      // Alternating rows: even rows white, odd rows very light gray/yellow tint
      html += `  .row-even { background-color: #FFFFFF; }`
      html += `  .row-odd { background-color: #FAFBFD; }`
      // Center-align all attendance data, check-in/outs, present/absents, totals
      html += `  .center-text { text-align: center; white-space: nowrap; }`
      html += `  .present-cell { color: #16A34A; font-weight: bold; }`
      html += `  .absent-cell { color: #DC2626; font-weight: bold; }`
      html += `  .leave-cell { color: #EA580C; font-weight: bold; }`
      html += `  .holiday-cell { color: #2563EB; font-weight: bold; }`
      html += `</style>`
      html += `</head>`
      html += `<body>`
      html += `<table>`

      // Column widths config: Code (100px), Name (180px), Day cells (180px for checkin/out visibility), PALH (60px), Totals (100px)
      html += `<colgroup>`
      html += `  <col width="90" />`
      html += `  <col width="180" />`
      daysInMonth.forEach(() => {
        html += `  <col width="230" />`
      })
      html += `  <col width="50" />`
      html += `  <col width="50" />`
      html += `  <col width="50" />`
      html += `  <col width="50" />`
      html += `  <col width="90" />`
      html += `  <col width="90" />`
      html += `  <col width="90" />`
      html += `</colgroup>`

      // Write table header with top info row, empty spacer row, and main column headers
      html += `<thead>`
      
      // Top info row: Month and brand details with a dark teal background
      html += `  <tr>`
      html += `    <th colspan="3" style="background-color: #103C43; color: #FFFFFF; font-weight: bold; font-size: 11pt; text-align: left; padding: 12px; border: none;">`
      html += `      MONTH: ${selectedMonth}`
      html += `    </th>`
      html += `    <th colspan="${daysInMonth.length + 6}" style="background-color: #103C43; color: #FFFFFF; font-size: 10pt; text-align: right; padding: 12px; font-weight: bold; border: none;">`
      html += `      AL RAWAQ PAKISTAN RESTAURANT • Exported: ${new Date().toLocaleDateString()}`
      html += `    </th>`
      html += `  </tr>`
      
      // Empty spacer row between the info row and the column headers
      html += `  <tr style="height: 16px;">`
      html += `    <th colspan="${daysInMonth.length + 9}" style="border: none; background-color: #FFFFFF; height: 16px;"></th>`
      html += `  </tr>`

      // Column headers row
      html += `  <tr>`
      headers.forEach((h, i) => {
        if (i < 2) {
          html += `<th class="emp-header">${h}</th>`
        } else {
          html += `<th>${h}</th>`
        }
      })
      html += `  </tr>`
      html += `</thead>`

      // Write table body
      html += `<tbody>`
      filteredGroupedData.forEach((emp, index) => {
        const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd'
        html += `<tr class="${rowClass}">`
        
        // Highlight Employee Code and Employee Name columns
        html += `<td class="highlight-col code-cell">${emp.employee_code}</td>`
        html += `<td class="highlight-col name-cell">${emp.name}</td>`

        // Day cells (Center aligned data)
        daysInMonth.forEach(day => {
          const dateStr = formatLocalDate(day)
          const sessions = emp.days[dateStr] || []
          
          let cellText = ''
          let cellClass = 'center-text'
          if (sessions.length > 0) {
            const main = sessions[0]
            if (main.status === 'Holiday') {
              cellText = 'H'
              cellClass += ' holiday-cell'
            } else if (main.status === 'Leave') {
              cellText = 'L'
              cellClass += ' leave-cell'
            } else {
              const dayHours = Math.min(24, sessions.reduce((acc, s) => acc + (s.hours_worked || 0), 0))
              const dayOvertime = Math.max(0, dayHours - emp.shift_hours)
              
              const sessionLines = sessions.map(s => {
                const inStr = new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                const isSystem = s.remarks === 'System Checkout'
                const outStr = s.forgot_checkout 
                  ? 'Forgot' 
                  : s.check_out 
                    ? `${new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${isSystem ? ' (Sys)' : ''}` 
                    : 'Active'
                return `In: ${inStr} Out: ${outStr}`
              })
              
              // Pad cells to align Total Duty text horizontally in Excel
              const maxSessionsToPad = 4 // pad up to 4 sessions to ensure uniform alignment
              const paddingLines = []
              for (let i = sessionLines.length; i < maxSessionsToPad; i++) {
                paddingLines.push('&nbsp;')
              }
              
              cellText = [...sessionLines, ...paddingLines].join('<br/>')
              cellText += `<br/><span style="font-size: 8pt; color: #475569; font-weight: bold;">Total Duty: ${formatHoursToText(Math.min(emp.shift_hours || 12.0, dayHours))}${dayOvertime > 0 ? `<br/>Overtime: +${formatHoursToText(dayOvertime)}` : ''}</span>`
              cellClass += ' present-cell'
            }
          } else {
            const todayStr = formatLocalDate(new Date())
            if (dateStr < todayStr) {
              cellText = 'A'
              cellClass += ' absent-cell'
            } else {
              cellText = '-'
            }
          }
          html += `<td class="${cellClass}">${cellText}</td>`
        })

        // Summary columns (Center aligned)
        html += `<td class="center-text">${emp.presents}</td>`
        html += `<td class="center-text">${emp.absents}</td>`
        html += `<td class="center-text">${emp.leaves}</td>`
        html += `<td class="center-text">${emp.holidays}</td>`
        html += `<td class="center-text">${emp.lates}</td>`
        html += `<td class="center-text" style="font-weight: bold; color: #16A34A;">${formatHoursToText(emp.totalHours)}</td>`
        html += `<td class="center-text" style="font-weight: bold;">${emp.totalOvertime > 0 ? `+${formatHoursToText(emp.totalOvertime)}` : '--'}</td>`

        html += `</tr>`
      })
      html += `</tbody></table></body></html>`

      // Trigger download of the spreadsheet file
      const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.setAttribute('download', `Monthly_Attendance_Sheet_${selectedMonth}.xls`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Excel exported successfully!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to export Excel report')
    }
  }

  return (
    <div className="page-content attendance-sheet-page">

      {/* ── Controls bar ─ sticky, never moves ── */}
      <div className="attendance-controls-bar">
        <div className="attendance-controls-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Top header row with Month selection */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} style={{ color: 'var(--primary)' }} /> Monthly Attendance Sheet
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Month:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '6px 10px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', fontSize: 13 }}
                />
              </div>

              {isAdmin && (
                <button
                  className="btn btn-primary attendance-header-btn"
                  onClick={() => setShowHolidayModal(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, fontSize: 13, padding: '0 12px' }}
                  title="Manage Holiday"
                >
                  <Settings size={14} /> <span className="btn-text">Manage Holiday</span>
                </button>
              )}

              {isAdmin && (
                <button
                  className="btn btn-secondary attendance-header-btn"
                  onClick={() => setShowEditModal(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, fontSize: 13, borderColor: 'var(--primary)', color: 'var(--text)', padding: '0 12px' }}
                  title="Edit Attendance"
                >
                  <Edit size={14} style={{ color: 'var(--primary)' }} /> <span className="btn-text">Edit Attendance</span>
                </button>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1.5px', background: 'var(--surface-2)', width: '100%' }} />

          {/* Main search and icon actions row */}
          <div className="attendance-search-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
              className="btn btn-secondary" 
              onClick={() => setShowFilters(!showFilters)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '10px',
                borderRadius: 10,
                height: 40,
                width: 40,
                borderColor: showFilters ? 'var(--primary)' : 'var(--surface-2)',
                color: showFilters ? 'var(--primary)' : 'var(--text)',
                flexShrink: 0
              }}
              title="Filters"
            >
              <Filter size={18} />
            </button>

            <button 
              className="btn btn-secondary" 
              onClick={loadReports} 
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
        </div>
      </div>

      {showFilters && (
        <div style={{ padding: '0 28px', marginTop: 12 }}>
          <div className="attendance-controls-card" style={{ display: 'flex', gap: 16, padding: '16px 20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select 
              value={selectedShift}
              onChange={e => setSelectedShift(e.target.value)}
              style={{
                padding: '8px 12px',
                background: 'var(--surface-1)',
                border: '1.5px solid var(--surface-2)',
                borderRadius: 8,
                outline: 'none',
                fontSize: 13,
                minWidth: 150,
                flex: 1
              }}
            >
              <option value="All">All Shifts</option>
              {shifts.map(sh => (
                <option key={sh} value={sh}>{sh === 'All' ? 'All Shifts' : `Shift ${sh}`}</option>
              ))}
            </select>

            <select 
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
              style={{
                padding: '8px 12px',
                background: 'var(--surface-1)',
                border: '1.5px solid var(--surface-2)',
                borderRadius: 8,
                outline: 'none',
                fontSize: 13,
                minWidth: 150,
                flex: 1
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
                padding: '8px 12px',
                background: 'var(--surface-1)',
                border: '1.5px solid var(--surface-2)',
                borderRadius: 8,
                outline: 'none',
                fontSize: 13,
                minWidth: 150,
                flex: 1
              }}
            >
              <option value="All">All Statuses</option>
              <option value="Present">Present (At least 1 day)</option>
              <option value="Absent">Absent (At least 1 day)</option>
              <option value="Late">Late (At least 1 day)</option>
              <option value="Holiday">Holiday (At least 1 day)</option>
              <option value="Leave">Leave (At least 1 day)</option>
            </select>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .attendance-header-btn .btn-text {
            display: none !important;
          }
          .attendance-header-btn {
            padding: 0 !important;
            width: 34px !important;
            height: 34px !important;
            justify-content: center !important;
          }
        }
      `}</style>

      {/* ── Grid area ─ fills remaining height, only this scrolls ── */}
      <div className="attendance-grid-wrapper">
        <div className="attendance-grid-card">
          {/* This div is the ONLY element allowed to scroll */}
          <div
            className="attendance-grid-scroll"
            ref={scrollRef}
            onScroll={handleGridScroll}
          >
            <table className="attendance-table">
              <thead>
                <tr>
                  {/* Employee Code — NOT sticky, scrolls with day columns */}
                  <th style={{
                    background: 'var(--surface-1)',
                    minWidth: 100,
                    borderBottom: '2px solid var(--surface-2)',
                    borderRight: '1px solid var(--surface-2)',
                    padding: '12px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: 'nowrap'
                  }}>
                    Code
                  </th>

                  {/* Employee Name — STICKY, stays fixed at left edge */}
                  <th className="attendance-th-name" style={{
                    minWidth: 160,
                    borderBottom: '2px solid var(--surface-2)',
                    borderRight: '2px solid var(--surface-2)',
                    padding: '12px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
                    whiteSpace: 'nowrap'
                  }}>
                    Employee Name
                  </th>

                  {/* Day columns — scroll with the rest */}
                  {daysInMonth.map(day => (
                    <th key={day.getDate()} style={{
                      minWidth: 85,
                      textAlign: 'center',
                      borderBottom: '2px solid var(--surface-2)',
                      borderRight: '1px solid var(--surface-2)',
                      padding: '8px',
                      fontSize: 11,
                      fontWeight: 600,
                      background: 'var(--surface-1)'
                    }}>
                      <div style={{ color: 'var(--text-muted)' }}>{day.toLocaleDateString([], { weekday: 'short' })}</div>
                      <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--text)' }}>{day.getDate()}</div>
                    </th>
                  ))}

                  {/* Summary columns */}
                  <th style={{ minWidth: 60, textAlign: 'center', borderBottom: '2px solid var(--surface-2)', padding: '12px 8px', fontSize: 12, fontWeight: 700, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>P</th>
                  <th style={{ minWidth: 60, textAlign: 'center', borderBottom: '2px solid var(--surface-2)', padding: '12px 8px', fontSize: 12, fontWeight: 700, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>A</th>
                  <th style={{ minWidth: 60, textAlign: 'center', borderBottom: '2px solid var(--surface-2)', padding: '12px 8px', fontSize: 12, fontWeight: 700, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>L</th>
                  <th style={{ minWidth: 60, textAlign: 'center', borderBottom: '2px solid var(--surface-2)', padding: '12px 8px', fontSize: 12, fontWeight: 700, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>H</th>
                  <th style={{ minWidth: 90, textAlign: 'center', borderBottom: '2px solid var(--surface-2)', padding: '12px 8px', fontSize: 12, fontWeight: 700, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>Late Arrival</th>
                  <th style={{ minWidth: 90, textAlign: 'center', borderBottom: '2px solid var(--surface-2)', padding: '12px 8px', fontSize: 12, fontWeight: 700, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>Duty Hours</th>
                  <th style={{ minWidth: 80, textAlign: 'center', borderBottom: '2px solid var(--surface-2)', padding: '12px 8px', fontSize: 12, fontWeight: 700, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>Overtime</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={daysInMonth.length + 10} style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                      Loading monthly sheet...
                    </td>
                  </tr>
                ) : filteredGroupedData.length === 0 ? (
                  <tr>
                    <td colSpan={daysInMonth.length + 9} style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                      No employees registered or matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredGroupedData.map((emp, index) => {
                    const rowBg = index % 2 === 0 ? 'var(--surface)' : 'rgba(var(--primary-rgb), 0.025)'
                    return (
                      <tr
                        key={emp.employee_id}
                        onClick={() => setSelectedEmployeeLogs(emp)}
                        style={{
                          background: rowBg,
                          borderBottom: '1px solid var(--surface-2)',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(var(--primary-rgb), 0.06)'}
                        onMouseOut={e => e.currentTarget.style.background = rowBg}
                      >
                        {/* Employee Code — NOT sticky */}
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, borderRight: '1px solid var(--surface-2)', whiteSpace: 'nowrap' }}>
                          {emp.employee_code}
                        </td>

                        {/* Employee Name — STICKY via CSS class; bg must match row */}
                        <td className="attendance-td-name" style={{
                          background: rowBg,
                          borderRight: '2px solid var(--surface-2)',
                          padding: '10px 14px',
                          boxShadow: '2px 0 8px rgba(0,0,0,0.06)'
                        }}>
                          <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{emp.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{emp.role && emp.role.toLowerCase() !== 'operator' ? emp.role : 'Staff'}</div>
                        </td>

                        {/* Day cells */}
                        {daysInMonth.map(day => {
                          const dateStr = formatLocalDate(day)
                          const sessions = emp.days[dateStr] || []

                          let cellContent = null
                          let cellBg = 'transparent'

                          if (sessions.length > 0) {
                            const main = sessions[0]
                            if (main.status === 'Holiday') {
                              cellContent = <span style={{ fontWeight: 750, color: 'var(--primary)' }}>H</span>
                              cellBg = 'rgba(var(--primary-rgb), 0.08)'
                            } else if (main.status === 'Leave') {
                              cellContent = <span style={{ fontWeight: 750, color: '#F97316' }}>L</span>
                              cellBg = 'rgba(249, 115, 22, 0.08)'
                            } else {
                              const dayHours = Math.min(24, sessions.reduce((acc, s) => acc + (s.hours_worked || 0), 0))
                              const dayOvertime = Math.max(0, dayHours - emp.shift_hours)
                              
                              cellContent = (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', fontSize: 9 }}>
                                  {sessions.map((s, idx) => {
                                    const inStr = new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    const isSystem = s.remarks === 'System Checkout'
                                    const outStr = s.forgot_checkout 
                                      ? 'Forgot' 
                                      : s.check_out 
                                        ? `${new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${isSystem ? ' (Sys)' : ''}` 
                                        : 'Active'
                                    return (
                                      <div key={idx} style={{ whiteSpace: 'nowrap', display: 'flex', gap: 3 }}>
                                        <span style={{ color: 'var(--green)', fontWeight: 700 }}>In:</span>
                                        <span style={{ color: 'var(--text)' }}>{inStr}</span>
                                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>Out:</span>
                                        <span style={{ color: 'var(--text)' }}>{outStr}</span>
                                      </div>
                                    )
                                  })}
                                  <div style={{ 
                                    position: 'absolute',
                                    bottom: 4,
                                    left: 4,
                                    right: 4,
                                    paddingTop: 3, 
                                    borderTop: '1px dashed var(--surface-3)', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    alignItems: 'center', 
                                    gap: 1,
                                    fontSize: '8.5px',
                                    color: 'var(--text-muted)'
                                  }}>
                                    <div><strong>Duty Hours:</strong> {formatHoursToText(Math.min(emp.shift_hours || 12.0, dayHours))}</div>
                                    {dayOvertime > 0 && (
                                      <div style={{ color: 'var(--green)', fontWeight: 650 }}><strong>Overtime:</strong> +{formatHoursToText(dayOvertime)}</div>
                                    )}
                                  </div>
                                </div>
                              )
                              cellBg = 'rgba(34, 197, 94, 0.03)'
                            }
                          } else {
                            const todayStr = formatLocalDate(new Date())
                            if (dateStr < todayStr) {
                              cellContent = <span style={{ fontWeight: 750, color: 'var(--red)' }}>A</span>
                              cellBg = 'rgba(255, 69, 58, 0.08)'
                            }
                          }

                          const hasDutyInfo = sessions.length > 0 && sessions[0].status !== 'Holiday' && sessions[0].status !== 'Leave'

                          return (
                            <td key={dateStr} style={{
                              borderRight: '1px solid var(--surface-2)',
                              background: cellBg,
                              textAlign: 'center',
                              padding: '6px 8px',
                              paddingBottom: hasDutyInfo ? '42px' : '6px',
                              fontSize: 10,
                              position: 'relative',
                              verticalAlign: hasDutyInfo ? 'top' : 'middle'
                            }}>
                              {cellContent}
                            </td>
                          )
                        })}

                        {/* Summary columns */}
                        <td style={{ textAlign: 'center', fontWeight: 650, color: 'var(--green)', fontSize: 12, whiteSpace: 'nowrap' }}>{emp.presents}</td>
                        <td style={{ textAlign: 'center', fontWeight: 650, color: 'var(--red)', fontSize: 12, whiteSpace: 'nowrap' }}>{emp.absents}</td>
                        <td style={{ textAlign: 'center', fontWeight: 650, color: '#F97316', fontSize: 12, whiteSpace: 'nowrap' }}>{emp.leaves}</td>
                        <td style={{ textAlign: 'center', fontWeight: 650, color: 'var(--primary)', fontSize: 12, whiteSpace: 'nowrap' }}>{emp.holidays}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--green)', fontSize: 12, whiteSpace: 'nowrap' }}>{emp.lates}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--green)', fontSize: 12, whiteSpace: 'nowrap' }}>{formatHoursToText(emp.totalHours)}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: emp.totalOvertime > 0 ? 'var(--green)' : 'var(--text)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {emp.totalOvertime > 0 ? `+${formatHoursToText(emp.totalOvertime)}` : '--'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>


      {/* Holiday Configuration Modal */}
      {showHolidayModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
          <div className="card" style={{ width: '100%', maxWidth: 380, margin: '0 16px', padding: 24, position: 'relative' }}>
            <button onClick={() => setShowHolidayModal(false)} style={{ position: 'absolute', right: 16, top: 16, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 750 }}>Manage Holiday Configuration</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Select Date {holidayDate && `(${getHolidayDayName()})`}
                </span>
                <input 
                  type="date" 
                  value={holidayDate}
                  onChange={e => setHolidayDate(e.target.value)}
                  style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 10, outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select Shift (Optional)</span>
                <select 
                  value={holidayShift}
                  onChange={e => {
                    const selected = e.target.value
                    setHolidayShift(selected)
                    if (selected !== 'All') {
                      setHolidayEmployeeId('ShiftGlobal')
                    } else {
                      setHolidayEmployeeId('Global')
                    }
                  }}
                  style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 10, outline: 'none' }}
                >
                  <option value="All">All Shifts</option>
                  <option value="R1">Shift R1</option>
                  <option value="R2">Shift R2</option>
                  <option value="R3">Shift R3</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select Scope / Employee</span>
                <select 
                  value={holidayEmployeeId}
                  onChange={e => setHolidayEmployeeId(e.target.value)}
                  style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 10, outline: 'none' }}
                >
                  {holidayShift === 'All' ? (
                    <>
                      <option value="Global">All Staff (Global Holiday)</option>
                      {employeesList.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id})</option>
                      ))}
                    </>
                  ) : (
                    <>
                      <option value="ShiftGlobal">All Staff on Shift {holidayShift}</option>
                      {employeesList.filter(emp => (emp.shift || 'R1') === holidayShift).map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id})</option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveHoliday} 
                  disabled={submittingHoliday !== null}
                  style={{ flex: 1, height: 42, fontWeight: 650, opacity: submittingHoliday !== null ? 0.6 : 1 }}
                >
                  {submittingHoliday === 'saving' ? 'Saving...' : 'Set Holiday'}
                </button>
                <button 
                  className="btn" 
                  onClick={handleRemoveHoliday} 
                  disabled={submittingHoliday !== null}
                  style={{ 
                    flex: 1, 
                    height: 42, 
                    fontWeight: 650, 
                    background: '#EF4444', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: 8, 
                    cursor: 'pointer',
                    opacity: submittingHoliday !== null ? 0.6 : 1
                  }}
                >
                  {submittingHoliday === 'removing' ? 'Removing...' : 'Remove Holiday'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Individual Employee Log Details Modal */}
      {selectedEmployeeLogs && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
          <div className="card" style={{ width: 680, maxWidth: '90%', padding: 24, position: 'relative', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setSelectedEmployeeLogs(null)} style={{ position: 'absolute', right: 16, top: 16, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            
            <div style={{ marginBottom: 18 }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 800 }}>{selectedEmployeeLogs.name}</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                ID: {selectedEmployeeLogs.employee_code} • {selectedEmployeeLogs.role} • Shift: {selectedEmployeeLogs.shift} ({selectedEmployeeLogs.shift_hours} hrs standard)
              </span>
            </div>

            {/* Metrics stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <div style={{ background: 'var(--surface-1)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Presents</span>
                <h4 style={{ margin: '4px 0 0 0', color: 'var(--green)', fontWeight: 800 }}>{selectedEmployeeLogs.presents} days</h4>
              </div>
              <div style={{ background: 'var(--surface-1)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Absents</span>
                <h4 style={{ margin: '4px 0 0 0', color: 'var(--red)', fontWeight: 800 }}>{selectedEmployeeLogs.absents} days</h4>
              </div>
              <div style={{ background: 'var(--surface-1)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Working Hours</span>
                <h4 style={{ margin: '4px 0 0 0', color: 'var(--text)', fontWeight: 800 }}>{formatHoursToText(selectedEmployeeLogs.totalHours)}</h4>
              </div>
              <div style={{ background: 'var(--surface-1)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Overtime</span>
                <h4 style={{ margin: '4px 0 0 0', color: 'var(--green)', fontWeight: 800 }}>{formatHoursToText(selectedEmployeeLogs.totalOvertime)}</h4>
              </div>
            </div>

            {/* Scrollable logs list */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--surface-2)', background: 'var(--surface-1)', textAlign: 'left' }}>
                    <th style={{ padding: 10, fontSize: 12 }}>Date</th>
                    <th style={{ padding: 10, fontSize: 12 }}>Check In</th>
                    <th style={{ padding: 10, fontSize: 12 }}>Check Out</th>
                    <th style={{ padding: 10, fontSize: 12 }}>Break Duration</th>
                    <th style={{ padding: 10, fontSize: 12 }}>Net Hours</th>
                    <th style={{ padding: 10, fontSize: 12 }}>Status</th>
                    {isAdmin && <th style={{ padding: 10, fontSize: 12, textAlign: 'center' }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {daysInMonth.map(day => {
                    const dateStr = formatLocalDate(day)
                    const sessions = selectedEmployeeLogs.days[dateStr] || []
                    const dayHours = Math.min(24, sessions.reduce((acc, s) => acc + (s.hours_worked || 0), 0))
                    const dayOvertime = Math.max(0, dayHours - selectedEmployeeLogs.shift_hours)

                    if (sessions.length === 0) {
                      const todayStr = formatLocalDate(new Date())
                      const isPast = dateStr < todayStr
                      return (
                        <tr key={dateStr} style={{ borderBottom: '1px solid var(--surface-2)', opacity: isPast ? 1 : 0.45 }}>
                          <td style={{ padding: 10, fontSize: 12, fontWeight: 600 }}>{day.toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
                          <td colSpan={isAdmin ? 5 : 4} style={{ padding: 10, fontSize: 12, color: isPast ? 'var(--red)' : 'var(--text-muted)' }}>
                            {isPast ? 'Absent / Unmarked' : 'Future Day'}
                          </td>
                          <td style={{ padding: 10 }}>
                            {isPast && <span style={{ background: 'rgba(255, 69, 58, 0.1)', color: 'var(--red)', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Absent</span>}
                          </td>
                        </tr>
                      )
                    }

                    return sessions.map((session, sIdx) => {
                      const isSystemCheckout = session.remarks === 'System Checkout'
                      const checkOut = session.forgot_checkout 
                        ? 'Forgot' 
                        : session.check_out 
                          ? `${new Date(session.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${isSystemCheckout ? ' (System)' : ''}` 
                          : 'Active'
                      
                      const breakMins = Math.floor((session.total_break_duration_seconds || 0) / 60)
                      
                      let badgeColor = 'var(--green)'
                      let badgeBg = 'rgba(34, 197, 94, 0.1)'
                      if (session.status === 'Holiday') {
                        badgeColor = 'var(--primary)'
                        badgeBg = 'rgba(var(--primary-rgb), 0.1)'
                      } else if (session.status === 'Late') {
                        badgeColor = '#F97316'
                        badgeBg = 'rgba(249, 115, 22, 0.1)'
                      }

                      return (
                        <tr key={`${dateStr}-${sIdx}`} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                          <td style={{ padding: 10, fontSize: 12, fontWeight: 600 }}>
                            {sIdx === 0 ? day.toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                          </td>
                          <td style={{ padding: 10, fontSize: 12 }}>{session.status === 'Holiday' ? '--' : new Date(session.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td style={{ padding: 10, fontSize: 12 }}>{session.status === 'Holiday' ? '--' : checkOut}</td>
                          <td style={{ padding: 10, fontSize: 12 }}>{session.status === 'Holiday' ? '--' : `${breakMins} mins`}</td>
                          <td style={{ padding: 10, fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                            {session.status === 'Holiday' ? '0 min' : formatHoursToText(Math.min(selectedEmployeeLogs.shift_hours || 12.0, session.hours_worked))}
                            {sIdx === 0 && dayOvertime > 0 && (
                              <div style={{ fontSize: 10, color: '#F97316', fontWeight: 650, marginTop: 2 }}>
                                Overtime: +{formatHoursToText(dayOvertime)}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: 10 }}>
                            <span style={{ background: badgeBg, color: badgeColor, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                              {session.status}
                            </span>
                          </td>
                          {isAdmin && (
                            <td style={{ padding: 10, textAlign: 'center' }}>
                              <button 
                                onClick={() => handleEditFromPopup(selectedEmployeeLogs.employee_id, dateStr)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--primary)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: 4,
                                  borderRadius: 4
                                }}
                                title="Edit this day's attendance"
                              >
                                <Edit size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Attendance Modal */}
      {showEditModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
          <div className="card" style={{ width: 550, maxWidth: '90%', padding: 24, position: 'relative', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setShowEditModal(false)} style={{ position: 'absolute', right: 16, top: 16, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 750 }}>Edit Employee Attendance</h4>
            
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Select Employee</span>
                <select 
                  value={editEmployeeId}
                  onChange={e => setEditEmployeeId(e.target.value)}
                  style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 8, outline: 'none', fontSize: 13 }}
                >
                  <option value="">-- Choose Employee --</option>
                  {employeesList.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id})</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Select Date</span>
                <input 
                  type="date" 
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 8, outline: 'none', fontSize: 13 }}
                />
              </div>
            </div>

            {/* Add New Session manually */}
            {editEmployeeId && (
              <div style={{ background: 'var(--surface-1)', padding: 14, borderRadius: 10, border: '1.5px dashed var(--surface-3)', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>Add Manual Session</span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Check In</span>
                    <input 
                      type="datetime-local" 
                      id="manualInTime"
                      style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '6px 8px', fontSize: 12, background: 'white', color: 'var(--text)' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Check Out</span>
                    <input 
                      type="datetime-local" 
                      id="manualOutTime"
                      style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '6px 8px', fontSize: 12, background: 'white', color: 'var(--text)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 100 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Status</span>
                    <select 
                      id="manualStatus" 
                      defaultValue="Present"
                      style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '5px 8px', fontSize: 12, background: 'white', color: 'var(--text)', height: 29 }}
                    >
                      <option value="Present">Present</option>
                      <option value="Late">Late</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button 
                    className="btn btn-primary"
                    style={{ height: 30, fontSize: 11, padding: '0 12px' }}
                    onClick={async () => {
                      const inVal = document.getElementById('manualInTime').value
                      const outVal = document.getElementById('manualOutTime').value
                      const statusVal = document.getElementById('manualStatus').value
                      if (!inVal) {
                        toast.error('Check In Time is required')
                        return
                      }
                      try {
                        await axios.post('/api/attendance/session', {
                          employee_id: editEmployeeId,
                          date: editDate,
                          check_in: inVal,
                          check_out: outVal || null,
                          status: statusVal
                        })
                        toast.success('Manual attendance session created!')
                        loadEditSessions()
                        loadReports()
                        // Reset manual inputs
                        document.getElementById('manualInTime').value = ''
                        document.getElementById('manualOutTime').value = ''
                      } catch (err) {
                        toast.error(err?.response?.data?.error || 'Failed to create manual log')
                      }
                    }}
                  >
                    Add Session
                  </button>
                </div>
              </div>
            )}

            {/* Sessions list */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, marginTop: 8 }}>
              {loadingSessions ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  Loading logs...
                </div>
              ) : !editEmployeeId ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Please select an employee to view logs.
                </div>
              ) : editSessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  No attendance logs found for this employee on the selected date.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {editSessions.map((session, index) => {
                    return (
                      <SessionRow 
                        key={session.id} 
                        session={session} 
                        index={index}
                        onSave={handleUpdateSession}
                        onDelete={handleDeleteSession}
                        saving={savingSessionId === session.id}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SessionRow({ session, index, onSave, onDelete, saving }) {
  // Convert TIMESTAMPTZ strings to local datetime-local format: YYYY-MM-DDTHH:MM
  const toLocalDatetime = (dtStr) => {
    if (!dtStr) return ''
    const d = new Date(dtStr)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  };

  const [inVal, setInVal] = useState(() => toLocalDatetime(session.check_in))
  const [outVal, setOutVal] = useState(() => toLocalDatetime(session.check_out))

  return (
    <div style={{ background: 'var(--surface-1)', padding: 14, borderRadius: 10, border: '1px solid var(--surface-2)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>
        Session #{index + 1} ({session.status})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Check In Time</span>
            <input 
              type="datetime-local" 
              value={inVal}
              onChange={e => setInVal(e.target.value)}
              style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '6px 8px', fontSize: 12, background: 'var(--surface-1)', color: 'var(--text)' }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Check Out Time</span>
            <input 
              type="datetime-local" 
              value={outVal}
              onChange={e => setOutVal(e.target.value)}
              style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '6px 8px', fontSize: 12, background: 'var(--surface-1)', color: 'var(--text)' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button 
            className="btn" 
            onClick={() => onDelete(session.id)}
            disabled={saving}
            style={{ height: 32, fontSize: 12, padding: '0 12px', background: '#EF4444', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Delete
          </button>
          <button 
            className="btn btn-primary" 
            onClick={() => onSave(session.id, inVal, outVal)}
            disabled={saving || !inVal}
            style={{ height: 32, fontSize: 12, padding: '0 12px' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
