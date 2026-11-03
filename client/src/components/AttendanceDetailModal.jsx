import React, { useRef, useEffect } from 'react';
import { X, ArrowRight, Plus, Edit } from 'lucide-react';
import { getSaudiDateString } from '../utils/timezone';

const formatLocalDate = (date) => {
  if (!date) return '';
  return getSaudiDateString(date);
};

const formatHoursToText = (decimalHours) => {
  if (!decimalHours || decimalHours <= 0) return '0 min';
  const totalMins = Math.round(decimalHours * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
  if (hrs > 0) return `${hrs} hr`;
  return `${mins} min`;
};

const formatBranchName = (val) => {
  if (!val) return 'R1';
  const s = String(val).trim();
  if (/3|restaurant\s*3|branch\s*3|r3/i.test(s)) return 'R3';
  if (/2|restaurant\s*2|branch\s*2|r2/i.test(s)) return 'R2';
  if (/1|restaurant\s*1|branch\s*1|r1/i.test(s)) return 'R1';
  return s.length <= 4 ? s.toUpperCase() : s;
};

const getClampedSessionBreaks = (sessions) => {
  const allDayBreaks = [];
  let dayBreakSecs = 0;

  if (!Array.isArray(sessions)) return { allDayBreaks, dayBreakSecs };

  sessions.forEach(s => {
    let bLogs = [];
    if (Array.isArray(s.break_logs)) bLogs = s.break_logs;
    else if (typeof s.break_logs === 'string') {
      try { bLogs = JSON.parse(s.break_logs); } catch (e) {}
    }
    if (s.on_break && s.break_start && !bLogs.some(b => !b.break_out)) {
      bLogs.push({ break_in: s.break_start, break_out: null });
    }

    const sOutMs = s.check_out ? new Date(s.check_out).getTime() : null;
    const sInMs = s.check_in ? new Date(s.check_in).getTime() : null;

    if (bLogs.length > 0 && sOutMs) {
      bLogs.forEach(b => {
        if (!b || !b.break_in) return;
        let bInMs = new Date(b.break_in).getTime();
        let bOutMs = b.break_out ? new Date(b.break_out).getTime() : sOutMs;
        if (bInMs >= sOutMs) return;
        if (bOutMs > sOutMs) bOutMs = sOutMs;
        if (sInMs) {
          if (bOutMs <= sInMs) return;
          if (bInMs < sInMs) bInMs = sInMs;
        }
        const durSecs = Math.max(0, Math.floor((bOutMs - bInMs) / 1000));
        dayBreakSecs += durSecs;
        allDayBreaks.push({
          break_in: new Date(bInMs).toISOString(),
          break_out: b.break_out ? new Date(bOutMs).toISOString() : null,
          duration_seconds: durSecs
        });
      });
    } else if (s.total_break_duration_seconds) {
      let bSecs = parseInt(s.total_break_duration_seconds) || 0;
      if (sOutMs && sInMs) {
        const maxDur = Math.max(0, Math.floor((sOutMs - sInMs) / 1000));
        bSecs = Math.min(bSecs, maxDur);
      }
      dayBreakSecs += bSecs;
    }
  });

  return { allDayBreaks, dayBreakSecs };
};

const getDaysInMonth = (monthStr) => {
  if (!monthStr) return [];
  const [year, month] = monthStr.split('-').map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const days = [];
  for (let d = 1; d <= totalDays; d++) {
    const dStr = String(d).padStart(2, '0');
    const mStr = String(month).padStart(2, '0');
    days.push(new Date(`${year}-${mStr}-${dStr}T12:00:00+03:00`));
  }
  return days;
};

export default function AttendanceDetailModal({
  selectedEmployeeLogs,
  targetScrollDate,
  onClose,
  daysInMonth: propDaysInMonth,
  month,
  isAdmin = false,
  pendingRequests = [],
  onEdit
}) {
  const modalScrollContainerRef = useRef(null);

  useEffect(() => {
    if (selectedEmployeeLogs && targetScrollDate) {
      const scrollAttempt = () => {
        const container = modalScrollContainerRef.current;
        const row = container?.querySelector(`[data-modal-date="${targetScrollDate}"]`);
        if (row && container) {
          const rowOffset = row.offsetTop;
          container.scrollTo({
            top: Math.max(0, rowOffset - 100),
            behavior: 'smooth'
          });
          try {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (e) {}
        }
      };

      const t1 = setTimeout(scrollAttempt, 60);
      const t2 = setTimeout(scrollAttempt, 250);
      const t3 = setTimeout(scrollAttempt, 500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [selectedEmployeeLogs, targetScrollDate]);

  if (!selectedEmployeeLogs) return null;

  const derivedDaysInMonth = propDaysInMonth && propDaysInMonth.length > 0
    ? propDaysInMonth
    : (month ? getDaysInMonth(month) : (targetScrollDate ? getDaysInMonth(targetScrollDate.slice(0, 7)) : []));

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
      <div className="card" style={{ width: 1120, maxWidth: '96vw', padding: 20, position: 'relative', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: 16, top: 16, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>
        
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{selectedEmployeeLogs.name}</h3>
            {pendingRequests.some(r => r.employee_id === (selectedEmployeeLogs.employee_id || selectedEmployeeLogs.id) && r.request_type === 'Overtime' && r.status === 'Pending') && (
              <button 
                onClick={() => { window.location.href = '/edited-logs?tab=overtime'; }}
                style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: 4, 
                  background: 'rgba(234, 88, 12, 0.1)', color: '#EA580C', 
                  border: '1px solid rgba(234, 88, 12, 0.3)', padding: '2px 8px', 
                  borderRadius: 12, fontSize: 11, fontWeight: 700, cursor: 'pointer' 
                }}
                title="View Overtime Request"
              >
                Overtime Request <ArrowRight size={12} />
              </button>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ID: {selectedEmployeeLogs.employee_code || selectedEmployeeLogs.employee_id} • {selectedEmployeeLogs.role} • Shift: {selectedEmployeeLogs.shift} ({selectedEmployeeLogs.shift_hours} hrs standard)
          </span>
        </div>

        {/* Metrics stats - Single row compact layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 6, marginBottom: 16 }}>
          <div style={{ background: 'var(--surface-1)', padding: '6px 4px', borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>Presents</span>
            <h4 style={{ margin: '2px 0 0 0', color: 'var(--green)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{selectedEmployeeLogs.presents} d</h4>
          </div>
          <div style={{ background: 'var(--surface-1)', padding: '6px 4px', borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>Absents</span>
            <h4 style={{ margin: '2px 0 0 0', color: 'var(--red)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{selectedEmployeeLogs.absents} d</h4>
          </div>
          <div style={{ background: 'var(--surface-1)', padding: '6px 4px', borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>OOT (&lt;6h)</span>
            <h4 style={{ margin: '2px 0 0 0', color: '#8B5CF6', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{selectedEmployeeLogs.onlyOvertimeDays || 0} d</h4>
          </div>
          <div style={{ background: 'var(--surface-1)', padding: '6px 4px', borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>Req. Duty</span>
            <h4 style={{ margin: '2px 0 0 0', color: 'var(--text)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{formatHoursToText(selectedEmployeeLogs.expectedDutyHours || 0)}</h4>
          </div>
          <div style={{ background: 'var(--surface-1)', padding: '6px 4px', borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>Worked</span>
            <h4 style={{ margin: '2px 0 0 0', color: 'var(--green)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{formatHoursToText(selectedEmployeeLogs.totalHours || 0)}</h4>
          </div>
          <div style={{ background: 'var(--surface-1)', padding: '6px 4px', borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>Short Duty</span>
            <h4 style={{ margin: '2px 0 0 0', color: (selectedEmployeeLogs.shortDutyHours || 0) > 0 ? 'var(--red)' : 'var(--text-muted)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
              {(selectedEmployeeLogs.shortDutyHours || 0) > 0 ? `-${formatHoursToText(selectedEmployeeLogs.shortDutyHours)}` : '--'}
            </h4>
          </div>
          <div style={{ background: 'var(--surface-1)', padding: '6px 4px', borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>Only OT</span>
            <h4 style={{ margin: '2px 0 0 0', color: '#8B5CF6', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{formatHoursToText(selectedEmployeeLogs.onlyOvertimeHours || 0)}</h4>
          </div>
          <div style={{ background: 'var(--surface-1)', padding: '6px 4px', borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>Other OT</span>
            <h4 style={{ margin: '2px 0 0 0', color: 'var(--green)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
              {(selectedEmployeeLogs.otherOvertimeHours || 0) > 0 ? `+${formatHoursToText(selectedEmployeeLogs.otherOvertimeHours)}` : '--'}
            </h4>
          </div>
          <div style={{ background: 'var(--surface-1)', padding: '6px 4px', borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>Total OT (±)</span>
            <h4 style={{ 
              margin: '2px 0 0 0', 
              color: (selectedEmployeeLogs.totalOvertime || 0) > 0 ? 'var(--green)' : (selectedEmployeeLogs.totalOvertime || 0) < 0 ? 'var(--red)' : 'var(--text)', 
              fontWeight: 800,
              fontSize: 12,
              whiteSpace: 'nowrap'
            }}>
              {(selectedEmployeeLogs.totalOvertime || 0) > 0 ? `+${formatHoursToText(selectedEmployeeLogs.totalOvertime)}` : (selectedEmployeeLogs.totalOvertime || 0) < 0 ? `-${formatHoursToText(Math.abs(selectedEmployeeLogs.totalOvertime))}` : '--'}
            </h4>
          </div>
          <div style={{ background: 'rgba(var(--primary-rgb), 0.08)', padding: '6px 4px', borderRadius: 6, textAlign: 'center', border: '1px solid rgba(var(--primary-rgb), 0.25)' }}>
            <span style={{ fontSize: 9.5, color: 'var(--primary)', fontWeight: 700, display: 'block', whiteSpace: 'nowrap' }}>Total Duty±OT</span>
            <h4 style={{ margin: '2px 0 0 0', color: 'var(--primary)', fontWeight: 850, fontSize: 12, whiteSpace: 'nowrap' }}>
              {formatHoursToText(((selectedEmployeeLogs.expectedDutyHours || 0) + (selectedEmployeeLogs.totalOvertime || 0)))}
            </h4>
          </div>
        </div>

        {/* Scrollable logs list */}
        <div ref={modalScrollContainerRef} style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--surface-2)', background: 'var(--surface-1)', textAlign: 'left' }}>
                <th style={{ padding: 10, fontSize: 12 }}>Date</th>
                <th style={{ padding: 10, fontSize: 12 }}>Branch</th>
                <th style={{ padding: 10, fontSize: 12 }}>Check In</th>
                <th style={{ padding: 10, fontSize: 12 }}>Check Out</th>
                <th style={{ padding: 10, fontSize: 12 }}>Checked By</th>
                <th style={{ padding: 10, fontSize: 12 }}>Break Duration</th>
                <th style={{ padding: 10, fontSize: 12 }}>Net Hours</th>
                <th style={{ padding: 10, fontSize: 12 }}>Status</th>
                {isAdmin && onEdit && <th style={{ padding: 10, fontSize: 12, textAlign: 'center' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {derivedDaysInMonth.map(day => {
                const dateStr = formatLocalDate(day);
                const sessions = (selectedEmployeeLogs.days && selectedEmployeeLogs.days[dateStr]) || [];
                const dayHours = Math.min(24, sessions.reduce((acc, s) => acc + (s.hours_worked || 0), 0));
                const isOnlyOT = dayHours > 0 && dayHours < 6.0;
                const currentDayShiftHours = sessions[0]?.shift_hours || selectedEmployeeLogs.shift_hours || 12.0;
                const dayOvertime = isOnlyOT ? 0 : Math.max(0, dayHours - currentDayShiftHours);

                if (sessions.length === 0) {
                  const todayStr = formatLocalDate(new Date());
                  const isPast = dateStr < todayStr;
                  return (
                    <tr key={dateStr} data-modal-date={dateStr} style={{ borderBottom: '1px solid var(--surface-2)', opacity: isPast ? 1 : 0.45, background: targetScrollDate === dateStr ? 'rgba(var(--primary-rgb), 0.18)' : 'transparent', outline: targetScrollDate === dateStr ? '2px solid var(--primary)' : 'none', transition: 'all 0.3s' }}>
                      <td style={{ padding: 10, fontSize: 12, fontWeight: 600 }}>{day.toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh', month: 'short', day: 'numeric' })}</td>
                      <td colSpan={6} style={{ padding: 10, fontSize: 12, color: isPast ? 'var(--red)' : 'var(--text-muted)' }}>
                        {isPast ? 'Absent / Unmarked' : 'Future Day'}
                      </td>
                      <td style={{ padding: 10 }}>
                        {isPast && <span style={{ background: 'rgba(255, 69, 58, 0.1)', color: 'var(--red)', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Absent</span>}
                      </td>
                      {isAdmin && onEdit && (
                        <td style={{ padding: 10, textAlign: 'center' }}>
                          {isPast && (
                            <button 
                              onClick={() => onEdit(selectedEmployeeLogs.employee_id || selectedEmployeeLogs.id, dateStr, 'add')}
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
                              title="Add Session"
                            >
                              <Plus size={16} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                }

                return sessions.map((session, sIdx) => {
                  const isSystemCheckout = session.remarks === 'automatically system check out' || session.remarks === 'System Checkout';
                  const checkOut = session.check_out 
                    ? `${new Date(session.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}${isSystemCheckout ? ' (automatically system check out)' : ''}` 
                    : 'Active';
                  
                  const sessionBreaks = getClampedSessionBreaks([session]);
                  const breakMins = Math.floor(sessionBreaks.dayBreakSecs / 60);
                  
                  let badgeColor = 'var(--green)';
                  let badgeBg = 'rgba(34, 197, 94, 0.1)';
                  if (session.status === 'Holiday') {
                    badgeColor = 'var(--primary)';
                    badgeBg = 'rgba(var(--primary-rgb), 0.1)';
                  } else if (session.status === 'Late') {
                    badgeColor = '#F97316';
                    badgeBg = 'rgba(249, 115, 22, 0.1)';
                  } else if (isOnlyOT) {
                    badgeColor = '#8B5CF6';
                    badgeBg = 'rgba(139, 92, 246, 0.1)';
                  }

                  return (
                    <tr key={`${dateStr}-${sIdx}`} data-modal-date={sIdx === 0 ? dateStr : undefined} style={{ borderBottom: '1px solid var(--surface-2)', background: targetScrollDate === dateStr ? 'rgba(var(--primary-rgb), 0.18)' : 'transparent', outline: targetScrollDate === dateStr ? '2px solid var(--primary)' : 'none', transition: 'all 0.3s' }}>
                      <td style={{ padding: 10, fontSize: 12, fontWeight: 600 }}>
                        {sIdx === 0 ? day.toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh', month: 'short', day: 'numeric' }) : ''}
                      </td>
                      <td style={{ padding: 10, fontSize: 12, fontWeight: 700 }}>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '2px 5px',
                          borderRadius: '4px',
                          background: isOnlyOT ? 'rgba(139, 92, 246, 0.15)' : 'rgba(var(--primary-rgb), 0.12)',
                          color: isOnlyOT ? '#8B5CF6' : 'var(--primary)',
                          border: isOnlyOT ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(var(--primary-rgb), 0.25)'
                        }}>
                          {formatBranchName(session.branch || selectedEmployeeLogs.branch || 'R1')}
                        </span>
                      </td>
                      <td style={{ padding: 10, fontSize: 12 }}>
                        {session.status === 'Holiday' ? '--' : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span>{new Date(session.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                            {session.remarks === 'Edited' && <span style={{color: '#3B82F6', fontSize: 10, fontWeight: 700}}>(Edited)</span>}
                            {session.remarks === 'Manual' && <span style={{color: '#8B5CF6', fontSize: 10, fontWeight: 700}}>(Manual)</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: 10, fontSize: 12, color: session.check_out ? 'var(--text)' : 'var(--text-muted)' }}>
                        {session.status === 'Holiday' ? '--' : checkOut}
                      </td>
                      <td style={{ padding: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                        {session.status === 'Holiday' ? '--' : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span>In: {session.created_by || '--'}</span>
                            {session.check_out && <span>Out: {session.checked_out_by || '--'}</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: 10, fontSize: 12 }}>{session.status === 'Holiday' ? '--' : `${breakMins} mins`}</td>
                      <td style={{ padding: 10, fontSize: 12, fontWeight: 700, color: isOnlyOT ? '#8B5CF6' : 'var(--green)' }}>
                        {session.status === 'Holiday' ? '0 min' : isOnlyOT ? (
                          <div style={{ color: '#8B5CF6' }}>
                            <strong>Only OT:</strong> {formatHoursToText(dayHours)}
                          </div>
                        ) : (
                          <>
                            {formatHoursToText(Math.min(selectedEmployeeLogs.shift_hours || 12.0, session.hours_worked))}
                            {sIdx === 0 && dayOvertime > 0 && (
                              <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 650, marginTop: 2 }}>
                                Overtime: +{formatHoursToText(dayOvertime)}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td style={{ padding: 10 }}>
                        <span style={{ background: badgeBg, color: badgeColor, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                          {isOnlyOT ? 'Only Overtime' : session.status}
                        </span>
                      </td>
                      {isAdmin && onEdit && (
                        <td style={{ padding: 10, textAlign: 'center' }}>
                          <button 
                            onClick={() => onEdit(selectedEmployeeLogs.employee_id || selectedEmployeeLogs.id, dateStr, '')}
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
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

