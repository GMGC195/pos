import React, { useState, useEffect } from 'react';
import axios from '../api';
import { X, Edit, Plus, Info, Coffee, Trash2, ArrowLeft, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  getSaudiDateString, 
  getSaudiTodayDate, 
  toSaudiTimeInput, 
  saudiTimeToISO 
} from '../utils/timezone';

const formatLocalDate = (date) => {
  if (!date) return '';
  return getSaudiDateString(date);
};

const formatBranchName = (val) => {
  if (!val) return 'R1';
  const s = String(val).trim();
  if (/3|restaurant\s*3|branch\s*3|r3/i.test(s)) return 'R3';
  if (/2|restaurant\s*2|branch\s*2|r2/i.test(s)) return 'R2';
  if (/1|restaurant\s*1|branch\s*1|r1/i.test(s)) return 'R1';
  return s.length <= 4 ? s.toUpperCase() : s;
};

export default function EditAttendanceModal({
  isOpen,
  onClose,
  employeesList = [],
  initialEmployeeId = '',
  initialDate = '',
  initialMode = '',
  onSessionSaved
}) {
  const [editStep, setEditStep] = useState('employee'); // 'employee' | 'date' | 'mode'
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editDateMode, setEditDateMode] = useState('today');
  const [editDate, setEditDate] = useState('');
  const [editMode, setEditMode] = useState(''); // '' | 'add' | 'edit'
  const [editSessions, setEditSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [savingSessionId, setSavingSessionId] = useState(null);

  // New session form
  const [addCheckIn, setAddCheckIn] = useState('');
  const [addCheckOut, setAddCheckOut] = useState('');
  const [addStatus, setAddStatus] = useState('Present');
  const [addBranch, setAddBranch] = useState('R1');
  const [addingSession, setAddingSession] = useState(false);

  const yesterdayStr = formatLocalDate(new Date(Date.now() - 86400000));
  const todayStr = getSaudiTodayDate();

  useEffect(() => {
    if (isOpen) {
      const empId = initialEmployeeId ? String(initialEmployeeId) : '';
      setEditEmployeeId(empId);

      const targetD = initialDate || todayStr;
      setEditDate(targetD);
      setEditDateMode(targetD === todayStr ? 'today' : 'previous');
      setEditMode(initialMode || '');
      setEditSessions([]);
      setAddCheckIn('');
      setAddCheckOut('');
      setAddStatus('Present');

      const empMatch = employeesList.find(e => String(e.id) === String(empId) || String(e.employee_id) === String(empId));
      setAddBranch(formatBranchName(empMatch?.branch || 'R1'));

      if (empId && targetD) {
        setEditStep('mode');
        loadEditSessions(empId, targetD);
      } else if (empId) {
        setEditStep('date');
      } else {
        setEditStep('employee');
      }
    }
  }, [isOpen, initialEmployeeId, initialDate, initialMode]);

  const loadEditSessions = async (empId, dateStr) => {
    if (!empId || !dateStr) return;
    setLoadingSessions(true);
    try {
      const res = await axios.get('/api/attendance/employee-date', {
        params: { employee_id: empId, date: dateStr }
      });
      setEditSessions(res.data || []);
    } catch (err) {
      toast.error('Error loading employee logs');
    } finally {
      setLoadingSessions(false);
    }
  };

  if (!isOpen) return null;

  const handleEditStep1Next = () => {
    if (!editEmployeeId) { toast.error('Please select an employee'); return; }
    setEditStep('date');
  };

  const handleEditStep2Next = () => {
    const dateStr = editDateMode === 'today' ? todayStr : editDate;
    if (editDateMode === 'previous' && !editDate) { toast.error('Please select a date'); return; }
    setEditDate(dateStr);
    setEditMode('');
    setEditSessions([]);
    setEditStep('mode');
    loadEditSessions(editEmployeeId, dateStr);
  };

  const handleAddNewSession = async () => {
    if (!addCheckIn) { toast.error('Check-In time is required'); return; }
    if (!addCheckOut) { toast.error('Check-Out time is required'); return; }

    let outDate = editDate;
    if (addCheckOut < addCheckIn) {
      const nextDay = new Date(editDate);
      nextDay.setDate(nextDay.getDate() + 1);
      outDate = getSaudiDateString(nextDay);
    }

    const checkInISO = saudiTimeToISO(editDate, addCheckIn);
    const checkOutISO = saudiTimeToISO(outDate, addCheckOut);

    if (new Date(checkOutISO) <= new Date(checkInISO)) {
      toast.error('Check-Out must be after Check-In');
      return;
    }

    setAddingSession(true);
    try {
      await axios.post('/api/attendance/session', {
        employee_id: editEmployeeId,
        date: editDate,
        check_in: checkInISO,
        check_out: checkOutISO,
        status: addStatus,
        branch: addBranch
      });
      toast.success('Session added successfully!');
      if (onSessionSaved) {
        await onSessionSaved(editEmployeeId, editDate);
      }
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add session');
    } finally {
      setAddingSession(false);
    }
  };

  const handleUpdateSession = async (sessionId, checkInISO, checkOutISO, reason, breakLogs = null, branch = null) => {
    if (!reason || !reason.trim()) { toast.error('Reason is required'); return; }
    setSavingSessionId(sessionId);
    try {
      const payload = {
        attendance_id: sessionId,
        new_check_in: checkInISO,
        new_check_out: checkOutISO || null,
        reason
      };
      if (breakLogs !== null) payload.break_logs = breakLogs;
      if (branch !== null) payload.branch = branch;

      await axios.post('/api/attendance/edit', payload);
      toast.success('Attendance session updated!');
      loadEditSessions(editEmployeeId, editDate);
      if (onSessionSaved) {
        await onSessionSaved(editEmployeeId, editDate);
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update session');
    } finally {
      setSavingSessionId(null);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this session?')) return;
    setSavingSessionId(sessionId);
    try {
      await axios.delete(`/api/attendance/session/${sessionId}`);
      toast.success('Attendance session deleted!');
      loadEditSessions(editEmployeeId, editDate);
      if (onSessionSaved) {
        await onSessionSaved(editEmployeeId, editDate);
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to delete session');
    } finally {
      setSavingSessionId(null);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: 16 }}>
      <div className="card" style={{ width: 540, maxWidth: '96vw', padding: 24, position: 'relative', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 12, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: 16, top: 16, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>

        {/* Title + step indicator */}
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Edit size={16} style={{ color: 'var(--primary)' }} /> Edit Attendance / Add Session
          </h4>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {['Employee', 'Date', 'Action'].map((label, i) => {
              const stepKey = ['employee', 'date', 'mode'][i];
              const steps = ['employee', 'date', 'mode'];
              const isDone = steps.indexOf(editStep) > i;
              const isActive = editStep === stepKey;
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
              );
            })}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>

          {/* Step 1: Select Employee */}
          {editStep === 'employee' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Select Employee</label>
                <select
                  value={editEmployeeId}
                  onChange={e => setEditEmployeeId(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid var(--surface-2)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', outline: 'none', fontSize: 13 }}
                >
                  <option value="">-- Choose Employee --</option>
                  {employeesList.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id || emp.employee_code || emp.id})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={handleEditStep1Next}>Next →</button>
              </div>
            </div>
          )}

          {/* Step 2: Select Date */}
          {editStep === 'date' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>Select Date</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {['today', 'previous'].map(mode => (
                    <button key={mode}
                      onClick={() => {
                        setEditDateMode(mode);
                        if (mode === 'today') setEditDate(todayStr);
                        if (mode === 'previous') setEditDate(yesterdayStr);
                      }}
                      style={{
                        flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: '2px solid',
                        borderColor: editDateMode === mode ? 'var(--primary)' : 'var(--surface-2)',
                        background: editDateMode === mode ? 'var(--primary)' : 'var(--surface)',
                        color: editDateMode === mode ? 'white' : 'var(--text)'
                      }}
                    >{mode === 'today' ? '📅 Today' : '🗓 Previous Day'}</button>
                  ))}
                </div>
              </div>
              {editDateMode === 'previous' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Select Date</label>
                  <input type="date" value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid var(--surface-2)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', outline: 'none', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => setEditStep('employee')}>← Back</button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleEditStep2Next}>Next →</button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Action Selection & Execution */}
          {editStep === 'mode' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {!editMode && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>What would you like to do?</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setEditMode('add')}
                      style={{ flex: 1, padding: '16px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: '2px solid var(--surface-2)', background: 'var(--surface)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                    >
                      <Plus size={20} color="var(--primary)" />
                      <span>➕ Add New Session</span>
                    </button>
                    <button onClick={() => setEditMode('edit')}
                      style={{ flex: 1, padding: '16px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: '2px solid var(--surface-2)', background: 'var(--surface)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                    >
                      <Edit size={18} color="var(--primary)" />
                      <span>✏️ Edit Sessions</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Add New Session */}
              {editMode === 'add' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>➕ Add New Session</span>
                    <button onClick={() => setEditMode('')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>← Back</button>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Date: <strong>{editDate}</strong></p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Check In <span style={{ color: 'var(--red)' }}>*</span></span>
                      <input type="time" lang="en-GB" value={addCheckIn} onChange={e => setAddCheckIn(e.target.value)}
                        style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '8px 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Check Out <span style={{ color: 'var(--red)' }}>*</span></span>
                      <input type="time" lang="en-GB" value={addCheckOut} onChange={e => setAddCheckOut(e.target.value)}
                        style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '8px 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Branch</span>
                      <select value={addBranch} onChange={e => setAddBranch(e.target.value)}
                        style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '8px 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
                      >
                        <option value="R1">R1</option>
                        <option value="R2">R2</option>
                        <option value="R3">R3</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Status</span>
                      <select value={addStatus} onChange={e => setAddStatus(e.target.value)}
                        style={{ border: '1px solid var(--surface-3)', borderRadius: 6, padding: '8px 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
                      >
                        <option value="Present">Present</option>
                        <option value="Late">Late</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary" disabled={addingSession} onClick={handleAddNewSession} style={{ marginTop: 8, padding: '10px 0', fontWeight: 700 }}>
                    {addingSession ? 'Adding Session...' : 'Confirm & Add Session'}
                  </button>
                </div>
              )}

              {/* Edit Existing Sessions */}
              {editMode === 'edit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>✏️ Edit Sessions</span>
                    <button onClick={() => setEditMode('')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>← Back</button>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Date: <strong>{editDate}</strong></p>
                  {loadingSessions ? (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>Loading logs...</div>
                  ) : editSessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>No attendance logs found for this date.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {editSessions.map((session, index) => (
                        <SessionItemRow
                          key={session.id}
                          session={session}
                          previousSession={index > 0 ? editSessions[index - 1] : null}
                          nextSession={index < editSessions.length - 1 ? editSessions[index + 1] : null}
                          index={index}
                          onSave={handleUpdateSession}
                          onDelete={handleDeleteSession}
                          saving={savingSessionId === session.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!editMode && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setEditStep('date')}>← Back</button>
                  <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                </div>
              )}
              {editMode && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function SessionItemRow({ session, previousSession, nextSession, index, onSave, onDelete, saving }) {
  const [inVal, setInVal] = useState(() => toSaudiTimeInput(session.check_in));
  const [outVal, setOutVal] = useState(() => toSaudiTimeInput(session.check_out));
  const [branchVal, setBranchVal] = useState(() => formatBranchName(session.branch || 'R1'));
  const [reason, setReason] = useState('');
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  // Parse existing break sessions from session.break_logs
  const [breaks, setBreaks] = useState(() => {
    let list = [];
    if (Array.isArray(session.break_logs)) list = [...session.break_logs];
    else if (typeof session.break_logs === 'string') {
      try { list = JSON.parse(session.break_logs); } catch (e) {}
    }
    const parsed = list.map((b, i) => ({
      id: `b_${Date.now()}_${i}`,
      inVal: toSaudiTimeInput(b.break_in),
      outVal: toSaudiTimeInput(b.break_out)
    }));
    if (session.on_break && session.break_start && !parsed.some(b => !b.outVal)) {
      parsed.push({
        id: `b_active_${Date.now()}`,
        inVal: toSaudiTimeInput(session.break_start),
        outVal: ''
      });
    }
    return parsed;
  });

  const handleAddBreak = () => {
    setBreaks(prev => [...prev, { id: `b_${Date.now()}_${Math.random()}`, inVal: '', outVal: '' }]);
  };

  const handleUpdateBreak = (id, field, val) => {
    setBreaks(prev => prev.map(b => b.id === id ? { ...b, [field]: val } : b));
  };

  const handleRemoveBreak = (id) => {
    setBreaks(prev => prev.filter(b => b.id !== id));
  };

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

    const formattedBreaks = [];
    for (let i = 0; i < breaks.length; i++) {
      const b = breaks[i];
      if (!b.inVal && !b.outVal) continue;
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
  };

  return (
    <div style={{ background: 'var(--surface-1)', padding: 14, borderRadius: 10, border: '1px solid var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
            Session #{index + 1} ({session.status})
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
          <Info size={13} /> Logs & History
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Check In</label>
          <input type="time" lang="en-GB" value={inVal} onChange={e => setInVal(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--surface)', fontSize: 12 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Check Out</label>
          <input type="time" lang="en-GB" value={outVal} onChange={e => setOutVal(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--surface)', fontSize: 12 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Branch</label>
          <select value={branchVal} onChange={e => setBranchVal(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--surface)', fontSize: 12 }}
          >
            <option value="R1">R1</option>
            <option value="R2">R2</option>
            <option value="R3">R3</option>
          </select>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Reason for edit <span style={{ color: 'var(--red)' }}>*</span></label>
        <input type="text" placeholder="Explain reason for changes..." value={reason} onChange={e => setReason(e.target.value)}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--surface)', fontSize: 12, boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <button className="btn btn-secondary" style={{ color: 'var(--red)', fontSize: 12, padding: '4px 10px' }} onClick={() => onDelete(session.id)} disabled={saving}>
          <Trash2 size={13} /> Delete Session
        </button>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Session Changes'}
        </button>
      </div>
    </div>
  );
}

