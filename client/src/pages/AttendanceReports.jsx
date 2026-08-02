import { useEffect, useRef, useState } from 'react'
import axios from '../api'
import { CalendarRange, Search, RefreshCw, FileText, User, Plus, X, Settings, Download } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AttendanceReports() {
  const [reports, setReports] = useState([])
  const [employeesList, setEmployeesList] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Holiday state
  const [showHolidayModal, setShowHolidayModal] = useState(false)
  const [holidayDate, setHolidayDate] = useState(() => new Date().toISOString().split('T')[0])
  const [holidayEmployeeId, setHolidayEmployeeId] = useState('Global')

  // Detailed Modal State
  const [selectedEmployeeLogs, setSelectedEmployeeLogs] = useState(null)

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
          days: {}
        }
      }

      const logDate = new Date(log.date).toISOString().split('T')[0]
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
      let totalHours = 0
      let totalOvertime = 0

      daysInMonth.forEach(day => {
        const dateStr = day.toISOString().split('T')[0]
        const sessions = emp.days[dateStr] || []

        if (sessions.length > 0) {
          const mainSession = sessions[0]
          if (mainSession.status === 'Holiday') {
            holidays++
          } else if (mainSession.status === 'Leave') {
            leaves++
          } else {
            presents++
            // Sum all hours worked on this day and calculate daily overtime
            let dayHours = 0
            sessions.forEach(s => {
              dayHours += s.hours_worked || 0
            })
            totalHours += dayHours
            totalOvertime += Math.max(0, dayHours - emp.shift_hours)
          }
        } else {
          // If no log exists for a past date, it's considered an absent day
          const todayStr = new Date().toISOString().split('T')[0]
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
        totalHours,
        totalOvertime
      }
    })
  }

  const groupedData = getGroupedData()

  // Set Holiday API Call
  const handleSaveHoliday = async () => {
    try {
      const isGlobal = holidayEmployeeId === 'Global'
      await axios.post('/api/attendance/holiday', {
        date: holidayDate,
        employee_id: isGlobal ? null : holidayEmployeeId,
        is_global: isGlobal
      })
      toast.success('Holiday marked successfully!')
      setShowHolidayModal(false)
      loadReports()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to mark holiday')
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
      headers.push('P', 'A', 'L', 'H', 'Total Hours', 'Overtime')

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
        html += `  <col width="170" />`
      })
      html += `  <col width="50" />`
      html += `  <col width="50" />`
      html += `  <col width="50" />`
      html += `  <col width="50" />`
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
      html += `    <th colspan="${daysInMonth.length + 5}" style="background-color: #103C43; color: #FFFFFF; font-size: 10pt; text-align: right; padding: 12px; font-weight: bold; border: none;">`
      html += `      AL RAWAQ PAKISTAN RESTAURANT • Exported: ${new Date().toLocaleDateString()}`
      html += `    </th>`
      html += `  </tr>`
      
      // Empty spacer row between the info row and the column headers
      html += `  <tr style="height: 16px;">`
      html += `    <th colspan="${daysInMonth.length + 8}" style="border: none; background-color: #FFFFFF; height: 16px;"></th>`
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
      groupedData.forEach((emp, index) => {
        const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd'
        html += `<tr class="${rowClass}">`
        
        // Highlight Employee Code and Employee Name columns
        html += `<td class="highlight-col code-cell">${emp.employee_code}</td>`
        html += `<td class="highlight-col name-cell">${emp.name}</td>`

        // Day cells (Center aligned data)
        daysInMonth.forEach(day => {
          const dateStr = day.toISOString().split('T')[0]
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
              cellText = sessions.map(s => {
                const inStr = new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                const outStr = s.check_out ? new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'
                return `In: ${inStr} Out: ${outStr}`
              }).join('<br/>') // separate by breaks
              cellClass += ' present-cell'
            }
          } else {
            const todayStr = new Date().toISOString().split('T')[0]
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
        html += `<td class="center-text present-cell">${emp.presents}</td>`
        html += `<td class="center-text absent-cell">${emp.absents}</td>`
        html += `<td class="center-text leave-cell">${emp.leaves}</td>`
        html += `<td class="center-text holiday-cell">${emp.holidays}</td>`
        html += `<td class="center-text" style="font-weight: bold; color: #16A34A;">${parseFloat(emp.totalHours || 0).toFixed(2)}</td>`
        html += `<td class="center-text" style="font-weight: bold;">${parseFloat(emp.totalOvertime || 0).toFixed(2)}</td>`

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
        <div className="attendance-controls-card">
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8, marginRight: 'auto' }}>
              <FileText size={18} style={{ color: 'var(--primary)' }} /> Monthly Attendance Sheet
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Month:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '8px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', fontSize: 13 }}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={() => setShowHolidayModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, fontSize: 13 }}
            >
              <Plus size={14} /> Add Holiday
            </button>

            <button className="btn btn-secondary" onClick={loadReports} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, fontSize: 13 }}>
              <RefreshCw size={14} /> Refresh
            </button>

            <button 
              className="btn" 
              onClick={exportToExcel} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                height: 38, 
                fontSize: 13, 
                background: 'var(--green)', 
                color: 'white', 
                fontWeight: 650, 
                border: 'none', 
                borderRadius: 8, 
                padding: '0 14px', 
                cursor: 'pointer',
                transition: 'opacity 0.15s'
              }}
              onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
              onMouseOut={e => e.currentTarget.style.opacity = '1'}
            >
              <Download size={14} /> Export Excel
            </button>
          </div>
        </div>
      </div>

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
                  <th style={{ minWidth: 90, textAlign: 'center', borderBottom: '2px solid var(--surface-2)', padding: '12px 8px', fontSize: 12, fontWeight: 700, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>Total Hours</th>
                  <th style={{ minWidth: 80, textAlign: 'center', borderBottom: '2px solid var(--surface-2)', padding: '12px 8px', fontSize: 12, fontWeight: 700, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>Overtime</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={daysInMonth.length + 8} style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                      Loading monthly sheet...
                    </td>
                  </tr>
                ) : groupedData.length === 0 ? (
                  <tr>
                    <td colSpan={daysInMonth.length + 8} style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                      No employees registered.
                    </td>
                  </tr>
                ) : (
                  groupedData.map((emp, index) => {
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
                          const dateStr = day.toISOString().split('T')[0]
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
                              cellContent = (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', fontSize: 9 }}>
                                  {sessions.map((s, idx) => {
                                    const inStr = new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    const outStr = s.check_out ? new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'
                                    return (
                                      <div key={idx} style={{ whiteSpace: 'nowrap', display: 'flex', gap: 3 }}>
                                        <span style={{ color: 'var(--green)', fontWeight: 700 }}>In:</span>
                                        <span style={{ color: 'var(--text)' }}>{inStr}</span>
                                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>Out:</span>
                                        <span style={{ color: 'var(--text)' }}>{outStr}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                              cellBg = 'rgba(34, 197, 94, 0.03)'
                            }
                          } else {
                            const todayStr = new Date().toISOString().split('T')[0]
                            if (dateStr < todayStr) {
                              cellContent = <span style={{ fontWeight: 750, color: 'var(--red)' }}>A</span>
                              cellBg = 'rgba(255, 69, 58, 0.08)'
                            }
                          }

                          return (
                            <td key={dateStr} style={{
                              borderRight: '1px solid var(--surface-2)',
                              background: cellBg,
                              textAlign: 'center',
                              padding: '6px 8px',
                              fontSize: 10
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
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--green)', fontSize: 12, whiteSpace: 'nowrap' }}>{emp.totalHours.toFixed(1)}h</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: emp.totalOvertime > 0 ? 'var(--green)' : 'var(--text)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {emp.totalOvertime > 0 ? `+${emp.totalOvertime.toFixed(1)}h` : '--'}
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
          <div className="card" style={{ width: 400, padding: 24, position: 'relative' }}>
            <button onClick={() => setShowHolidayModal(false)} style={{ position: 'absolute', right: 16, top: 16, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 750 }}>Set Holiday Configuration</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select Date</span>
                <input 
                  type="date" 
                  value={holidayDate}
                  onChange={e => setHolidayDate(e.target.value)}
                  style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 10, outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select Scope / Employee</span>
                <select 
                  value={holidayEmployeeId}
                  onChange={e => setHolidayEmployeeId(e.target.value)}
                  style={{ border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', borderRadius: 8, padding: 10, outline: 'none' }}
                >
                  <option value="Global">All Staff (Global Holiday)</option>
                  {employeesList.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id})</option>
                  ))}
                </select>
              </div>

              <button className="btn btn-primary" onClick={handleSaveHoliday} style={{ marginTop: 10, height: 42, fontWeight: 650 }}>
                Set Holiday
              </button>
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
                <h4 style={{ margin: '4px 0 0 0', color: 'var(--text)', fontWeight: 800 }}>{selectedEmployeeLogs.totalHours.toFixed(1)} hrs</h4>
              </div>
              <div style={{ background: 'var(--surface-1)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Overtime</span>
                <h4 style={{ margin: '4px 0 0 0', color: 'var(--green)', fontWeight: 800 }}>{selectedEmployeeLogs.totalOvertime.toFixed(1)} hrs</h4>
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
                  </tr>
                </thead>
                <tbody>
                  {daysInMonth.map(day => {
                    const dateStr = day.toISOString().split('T')[0]
                    const sessions = selectedEmployeeLogs.days[dateStr] || []

                    if (sessions.length === 0) {
                      const todayStr = new Date().toISOString().split('T')[0]
                      const isPast = dateStr < todayStr
                      return (
                        <tr key={dateStr} style={{ borderBottom: '1px solid var(--surface-2)', opacity: isPast ? 1 : 0.45 }}>
                          <td style={{ padding: 10, fontSize: 12, fontWeight: 600 }}>{day.toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
                          <td colSpan={4} style={{ padding: 10, fontSize: 12, color: isPast ? 'var(--red)' : 'var(--text-muted)' }}>
                            {isPast ? 'Absent / Unmarked' : 'Future Day'}
                          </td>
                          <td style={{ padding: 10 }}>
                            {isPast && <span style={{ background: 'rgba(255, 69, 58, 0.1)', color: 'var(--red)', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Absent</span>}
                          </td>
                        </tr>
                      )
                    }

                    return sessions.map((session, sIdx) => {
                      const checkIn = new Date(session.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      const checkOut = session.check_out ? new Date(session.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'
                      
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
                          <td style={{ padding: 10, fontSize: 12 }}>{session.status === 'Holiday' ? '--' : checkIn}</td>
                          <td style={{ padding: 10, fontSize: 12 }}>{session.status === 'Holiday' ? '--' : checkOut}</td>
                          <td style={{ padding: 10, fontSize: 12 }}>{session.status === 'Holiday' ? '--' : `${breakMins} mins`}</td>
                          <td style={{ padding: 10, fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                            {session.status === 'Holiday' ? '0.0h' : `${parseFloat(session.hours_worked || 0).toFixed(1)}h`}
                          </td>
                          <td style={{ padding: 10 }}>
                            <span style={{ background: badgeBg, color: badgeColor, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                              {session.status}
                            </span>
                          </td>
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
    </div>
  )
}
