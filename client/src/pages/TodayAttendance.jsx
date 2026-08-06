import { useEffect, useState } from 'react'
import axios from '../api'
import { Fingerprint, Coffee, Clock, User, LogIn, Search, RefreshCw, FileText, MoreVertical, X, Download } from 'lucide-react'
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

export default function TodayAttendance() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedShift, setSelectedShift] = useState('All')
  const [selectedDepartment, setSelectedDepartment] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All') // 'All', 'Present', 'CheckedOut', 'Late', 'Absent'
  const [shiftsList, setShiftsList] = useState([])

  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [newCheckIn, setNewCheckIn] = useState('')
  const [newCheckOut, setNewCheckOut] = useState('')
  const [editReason, setEditReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  useEffect(() => {
    loadTodayAttendance()
    loadShifts()
    // Poll every 30 seconds
    const interval = setInterval(loadTodayAttendance, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedEmp && selectedEmp.sessions) {
      const activeSession = selectedEmp.sessions.find(s => String(s.attendance_id) === String(selectedSessionId)) || selectedEmp.sessions[0];
      if (activeSession) {
        setSelectedSessionId(activeSession.attendance_id);
        setNewCheckIn(toDatetimeLocal(activeSession.check_in));
        setNewCheckOut(toDatetimeLocal(activeSession.check_out));
      } else {
        setNewCheckIn('');
        setNewCheckOut('');
      }
    }
  }, [selectedSessionId, selectedEmp])

  const handleSaveEdit = async () => {
    if (!selectedSessionId) {
      toast.error('Please select a session');
      return;
    }
    if (!editReason || !editReason.trim()) {
      toast.error('Must add reason');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post('/api/attendance/edit', {
        attendance_id: selectedSessionId,
        new_check_in: newCheckIn ? new Date(newCheckIn).toISOString() : null,
        new_check_out: newCheckOut ? new Date(newCheckOut).toISOString() : null,
        reason: editReason
      });
      toast.success('Attendance updated successfully');
      setShowEditModal(false);
      setSelectedEmp(null);
      setSelectedSessionId('');
      setEditReason('');
      loadTodayAttendance();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update attendance');
    } finally {
      setSubmitting(false);
    }
  }

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

          <button className="btn btn-secondary" onClick={loadTodayAttendance} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button 
            className="btn" 
            onClick={exportToExcel}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6, 
              background: 'var(--green)', 
              color: 'white', 
              fontWeight: 650, 
              border: 'none', 
              borderRadius: 8, 
              padding: '10px 14px', 
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            <Download size={14} /> Export Excel
          </button>
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
            minWidth: 160
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
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)' }}>Shift</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Check-In Time</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Check-Out Time</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Hours Worked</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Overtime</th>
                  {['admin', 'operator', 'developer'].includes(user?.role?.toLowerCase()) && (
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Actions</th>
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
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700 }}>{emp.name}</td>
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
                            onClick={() => {
                              if (sessions.length === 0) {
                                toast.error('Employee has no attendance sessions today');
                                    return;
                              }
                              setSelectedEmp(emp);
                              setSelectedSessionId(sessions[0].attendance_id);
                              setShowEditModal(true);
                            }}
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

      {showEditModal && selectedEmp && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 450, padding: 24, position: 'relative' }}>
            <button 
              onClick={() => { setShowEditModal(false); setSelectedEmp(null); }}
              style={{ position: 'absolute', right: 16, top: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={20} />
            </button>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800 }}>Edit Attendance Times</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Editing logs for <strong>{selectedEmp.name}</strong>
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Select Session</label>
                <select 
                  value={selectedSessionId} 
                  onChange={e => setSelectedSessionId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--surface-2)',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 13
                  }}
                >
                  {(selectedEmp.sessions || []).map((s, idx) => (
                    <option key={s.attendance_id} value={s.attendance_id}>
                      Session {idx + 1}: {new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {s.check_out ? new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Check-In Time</label>
                <input 
                  type="datetime-local" 
                  value={newCheckIn} 
                  onChange={e => setNewCheckIn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--surface-2)',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Check-Out Time</label>
                <input 
                  type="datetime-local" 
                  value={newCheckOut} 
                  onChange={e => setNewCheckOut(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--surface-2)',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Reason for Edit *</label>
                <textarea 
                  placeholder="Enter reason for modifying attendance time..."
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  style={{
                    width: '100%',
                    height: 80,
                    padding: '10px 12px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--surface-2)',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 13,
                    resize: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => { setShowEditModal(false); setSelectedEmp(null); }}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveEdit}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
