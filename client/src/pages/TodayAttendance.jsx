import { useEffect, useState } from 'react'
import axios from '../api'
import { Fingerprint, Coffee, Clock, User, LogIn, Search, RefreshCw, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TodayAttendance() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedShift, setSelectedShift] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All') // 'All', 'Present', 'CheckedOut', 'Late', 'Absent'

  const loadTodayAttendance = () => {
    setLoading(true)
    axios.get(`/api/attendance/today?_t=${Date.now()}`)
      .then(res => {
        setEmployees(res.data)
      })
      .catch(() => toast.error('Error loading active staff'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTodayAttendance()
    // Poll every 30 seconds
    const interval = setInterval(loadTodayAttendance, 30000)
    return () => clearInterval(interval)
  }, [])

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(emp.employee_id).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesShift = selectedShift === 'All' || emp.shift === selectedShift;
    
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

    return matchesSearch && matchesShift && matchesStatus;
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
        <button className="btn btn-secondary" onClick={loadTodayAttendance} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ '--card-color': 'var(--green)', minWidth: 200, padding: '16px 20px' }}>
          <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)' }}>
            <LogIn size={22} />
          </div>
          <div className="stat-info">
            <p>Active Checked-in Staff</p>
            <h3>{employees.length} Present</h3>
          </div>
        </div>
        <div className="stat-card" style={{ '--card-color': 'var(--primary)', minWidth: 200, padding: '16px 20px' }}>
          <div className="stat-icon" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>
            <Coffee size={22} />
          </div>
          <div className="stat-info">
            <p>Currently on Break</p>
            <h3>{employees.filter(e => e.on_break).length} Staff</h3>
          </div>
        </div>
      </div>

      {/* Filter Options */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search active staff by name or ID..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 38px',
              background: 'var(--surface)',
              border: '1.5px solid var(--surface-2)',
              borderRadius: 10,
              outline: 'none',
              fontSize: 13,
              boxSizing: 'border-box'
            }}
          />
        </div>
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
            minWidth: 160
          }}
        >
          <option value="All">All Shifts</option>
          <option value="R1">Shift R1</option>
          <option value="R2">Shift R2</option>
          <option value="R3">Shift R3</option>
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
            minWidth: 160
          }}
        >
          <option value="All">All Statuses</option>
          <option value="Present">Present (Active)</option>
          <option value="CheckedOut">Checked Out</option>
          <option value="Late">Late Arrivals</option>
          <option value="Absent">Absent Today</option>
        </select>
      </div>

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
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--surface-1)' }}>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)' }}>Code</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)' }}>Employee Name</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)' }}>Staff / Position</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)' }}>Shift</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Check-In Time</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Check-Out Time</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Hours Worked</th>
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
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700 }}>{emp.name}</td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{staffRole}</td>
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
                        {parseFloat(emp.total_hours_today || 0).toFixed(2)} hrs
                      </td>
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
