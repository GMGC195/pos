import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api';
import { 
  User, Calendar, Clock, CheckCircle2, XCircle, AlertCircle, AlertTriangle, 
  Coffee, TrendingUp, Banknote, CreditCard, RefreshCw, FileText, 
  ArrowUpRight, ArrowDownRight, ShieldCheck, ChevronRight, Check, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CURRENCY } from '../config';
import { 
  getSaudiCurrentMonthStr, 
  getSaudiPreviousMonthStr, 
  formatSaudiDateTime,
  formatSaudiDate 
} from '../utils/timezone';

const formatMonthDisplay = (monthStr) => {
  if (!monthStr || monthStr === 'All') return 'All Months';
  const parts = monthStr.split('-');
  if (parts.length < 2) return monthStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = new Date(y, m - 1, 1);
  return !isNaN(d.getTime()) ? d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) : monthStr;
};

const formatHoursToText = (decimalHours) => {
  if (!decimalHours || decimalHours <= 0) return '0h';
  const totalMins = Math.round(decimalHours * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
};

export default function EmployeePortal() {
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'payroll' | 'khata'
  const [selectedMonth, setSelectedMonth] = useState(getSaudiCurrentMonthStr());
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [attendanceData, setAttendanceData] = useState(null);
  const [payrollData, setPayrollData] = useState(null);
  const [khataData, setKhataData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Month list: Current, Previous, and past 10 months
  const monthsList = useMemo(() => {
    const current = getSaudiCurrentMonthStr();
    const prev = getSaudiPreviousMonthStr(current);
    const list = [
      { id: current, label: `${formatMonthDisplay(current)} (Current)` },
      { id: prev, label: `${formatMonthDisplay(prev)} (Previous)` }
    ];
    let cursor = prev;
    for (let i = 0; i < 10; i++) {
      cursor = getSaudiPreviousMonthStr(cursor);
      list.push({ id: cursor, label: formatMonthDisplay(cursor) });
    }
    return list;
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Load profile
      const profRes = await axios.get('/api/employee-portal/me');
      setProfile(profRes.data);

      // 2. Load attendance for month
      const attRes = await axios.get('/api/employee-portal/attendance', {
        params: { month: selectedMonth }
      });
      setAttendanceData(attRes.data);

      // 3. Load payroll for month
      const payRes = await axios.get('/api/employee-portal/payroll', {
        params: { month: selectedMonth }
      });
      setPayrollData(payRes.data);

      // 4. Load khata for month
      const khataRes = await axios.get('/api/employee-portal/khata', {
        params: { month: selectedMonth }
      });
      setKhataData(khataRes.data);

    } catch (err) {
      console.error('Error loading employee portal data:', err);
      toast.error(err.response?.data?.error || 'Failed to load employee details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  if (loading && !profile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
        <RefreshCw size={32} className="spin" style={{ color: 'var(--primary)' }} />
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading Employee Portal...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Header Profile Banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
        borderRadius: 14,
        padding: '20px 24px',
        border: '1px solid var(--surface-3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: '0 4px 14px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 54,
            height: 54,
            borderRadius: 14,
            background: 'linear-gradient(135deg, var(--primary) 0%, #dc2626 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 800,
            boxShadow: '0 4px 10px rgba(227, 24, 55, 0.3)'
          }}>
            {profile?.name ? profile.name.charAt(0).toUpperCase() : 'E'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>
                {profile?.name || 'Employee'}
              </h2>
              <span style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#2563eb',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 6,
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                {profile?.employee_id}
              </span>
              <span style={{
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#059669',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 6
              }}>
                {profile?.role || 'Staff'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>Branch: <strong style={{ color: 'var(--text)' }}>{profile?.branch || 'Main'}</strong></span>
              <span>•</span>
              <span>Daily Shift: <strong style={{ color: 'var(--text)' }}>{profile?.shift_hours || 12} hrs</strong></span>
              <span>•</span>
              <span>Base Salary: <strong style={{ color: 'var(--text)' }}>{CURRENCY} {parseFloat(profile?.salary || 0).toFixed(2)}</strong></span>
            </div>
          </div>
        </div>

        {/* Month Selector & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--surface-3)' }}>
            <Calendar size={16} color="var(--primary)" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              {monthsList.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--surface-3)',
              background: 'var(--surface)',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)'
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid var(--surface-2)', paddingBottom: 6 }}>
        {[
          { id: 'attendance', label: 'My Attendance', icon: <Clock size={16} /> },
          { id: 'payroll', label: 'Salary & Payroll', icon: <Banknote size={16} /> },
          { id: 'khata', label: 'My Khata Ledger', icon: <CreditCard size={16} /> }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                background: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Tab Contents */}
      {/* -------------------- TAB 1: ATTENDANCE -------------------- */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Attendance Metrics Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10
          }}>
            <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-3)' }}>
              <span style={{ fontSize: 11, color: '#059669', fontWeight: 700, display: 'block' }}>Presents</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#059669', marginTop: 2 }}>
                {attendanceData?.metrics?.presents || 0}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Duty days marked</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-3)' }}>
              <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, display: 'block' }}>Absents</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626', marginTop: 2 }}>
                {attendanceData?.metrics?.absents || 0}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Unmarked days</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-3)' }}>
              <span style={{ fontSize: 11, color: '#d97706', fontWeight: 700, display: 'block' }}>Leaves</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706', marginTop: 2 }}>
                {attendanceData?.metrics?.leaves || 0}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Approved leaves</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-3)' }}>
              <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, display: 'block' }}>Holidays</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb', marginTop: 2 }}>
                {attendanceData?.metrics?.holidays || 0}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Official off</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-3)' }}>
              <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 700, display: 'block' }}>Late Days</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#ea580c', marginTop: 2 }}>
                {attendanceData?.metrics?.late_arrivals || 0}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Late check-ins</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-3)' }}>
              <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, display: 'block' }}>Overtime Hours</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>
                {attendanceData?.metrics?.overtime_hours || 0}h
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Extra hours</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-3)' }}>
              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 700, display: 'block' }}>Total Duty Hours</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                {attendanceData?.metrics?.total_hours || 0}h
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>of {attendanceData?.metrics?.expected_hours || 0}h expected</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-3)' }}>
              <span style={{ fontSize: 11, color: '#0d9488', fontWeight: 700, display: 'block' }}>Attendance %</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0d9488', marginTop: 2 }}>
                {attendanceData?.metrics?.attendance_percentage || 0}%
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Monthly rate</span>
            </div>
          </div>

          {/* Daily Records Table */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 12,
            border: '1px solid var(--surface-3)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--surface-3)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Daily Attendance Sessions ({formatMonthDisplay(selectedMonth)})
              </h3>
            </div>
            
            <div style={{ overflowX: 'auto', maxHeight: 460 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 2 }}>
                  <tr style={{ borderBottom: '1.5px solid var(--surface-3)' }}>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Date</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Branch / Shift</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Check In</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Check Out</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Break</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Net Hours</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {(!attendanceData?.daily_records || Object.keys(attendanceData.daily_records).length === 0) ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No attendance sessions logged for this month.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(attendanceData.daily_records).map(([dateStr, sessions]) => {
                      const dayName = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                      return sessions.map((s, idx) => (
                        <tr key={s.id || `${dateStr}-${idx}`} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{dateStr}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({dayName})</span>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                            {s.branch || profile?.branch || 'R1'} • {s.shift_name || 'Regular'}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                            {s.check_in ? formatSaudiDateTime(s.check_in).slice(11) : '-'}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                            {s.check_out ? formatSaudiDateTime(s.check_out).slice(11) : (s.check_in ? <span style={{ color: '#059669', fontSize: 11, fontWeight: 700 }}>Active</span> : '-')}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                            {s.total_break_duration_seconds ? `${Math.floor(s.total_break_duration_seconds / 60)} min` : '0 min'}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: s.hours_worked > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                            {formatHoursToText(s.hours_worked)}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background: s.status === 'Present' ? '#dcfce7' : s.status === 'Late' ? '#ffedd5' : s.status === 'Absent' ? '#fee2e2' : '#f1f5f9',
                              color: s.status === 'Present' ? '#15803d' : s.status === 'Late' ? '#c2410c' : s.status === 'Absent' ? '#b91c1c' : '#475569'
                            }}>
                              {s.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                            {s.remarks || '-'}
                          </td>
                        </tr>
                      ));
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- TAB 2: PAYROLL -------------------- */}
      {activeTab === 'payroll' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Salary Breakdown Summary Card */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--surface-3)',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-2)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                  Monthly Salary Breakdown ({formatMonthDisplay(selectedMonth)})
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Detailed calculation formula and salary components
                </span>
              </div>
              <div>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 800,
                  background: payrollData?.payroll_record?.status === 'Paid' ? '#dcfce7' : '#fef3c7',
                  color: payrollData?.payroll_record?.status === 'Paid' ? '#15803d' : '#b45309'
                }}>
                  Status: {payrollData?.payroll_record?.status || 'Pending Calculation'}
                </span>
              </div>
            </div>

            {/* Calculations Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12
            }}>
              <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Base Salary</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                  {CURRENCY} {parseFloat(payrollData?.payroll_record?.base_salary || profile?.salary || 0).toFixed(2)}
                </div>
              </div>

              <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Duty Hours</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                  {payrollData?.calculation?.actual_hours || 0}h / {payrollData?.calculation?.expected_hours || 0}h
                </div>
              </div>

              <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Payable Salary</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                  {CURRENCY} {parseFloat(payrollData?.payroll_record?.payable_salary || 0).toFixed(2)}
                </div>
              </div>

              <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Overtime Amount</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>
                  +{CURRENCY} {parseFloat(payrollData?.payroll_record?.overtime_pay || 0).toFixed(2)}
                </div>
              </div>

              <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Total Adjustments</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: (payrollData?.payroll_record?.total_adjustments || 0) >= 0 ? '#059669' : '#dc2626', marginTop: 2 }}>
                  {(payrollData?.payroll_record?.total_adjustments || 0) >= 0 ? '+' : ''}{CURRENCY} {parseFloat(payrollData?.payroll_record?.total_adjustments || 0).toFixed(2)}
                </div>
              </div>

              {payrollData?.is_khata_registered && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '12px 16px', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: '#c2410c', fontWeight: 700 }}>Khata Deduction</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#ea580c', marginTop: 2 }}>
                    -{CURRENCY} {parseFloat(payrollData?.khata_breakdown?.khata_deduction || payrollData?.payroll_record?.khata_deduction || 0).toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {/* Final Net Payable Salary Banner */}
            <div style={{
              background: (payrollData?.payroll_record?.net_salary || 0) < 0 ? '#fef2f2' : '#ecfdf5',
              border: `1.5px solid ${(payrollData?.payroll_record?.net_salary || 0) < 0 ? '#fecaca' : '#a7f3d0'}`,
              borderRadius: 10,
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 800, color: (payrollData?.payroll_record?.net_salary || 0) < 0 ? '#b91c1c' : '#047857' }}>
                  NET PAYABLE SALARY
                </span>
                <div style={{ fontSize: 11, color: (payrollData?.payroll_record?.net_salary || 0) < 0 ? '#dc2626' : '#059669' }}>
                  Base Duty + Adjustments - Khata Deduction
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: (payrollData?.payroll_record?.net_salary || 0) < 0 ? '#b91c1c' : '#047857' }}>
                {CURRENCY} {parseFloat(payrollData?.payroll_record?.net_salary || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Installment Payments History Table */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 12,
            border: '1px solid var(--surface-3)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--surface-3)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Salary Installment Receipts
              </h3>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                Paid: {CURRENCY} {parseFloat(payrollData?.payroll_record?.paid_amount || 0).toFixed(2)}
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead style={{ background: 'var(--surface-2)' }}>
                <tr style={{ borderBottom: '1px solid var(--surface-3)' }}>
                  <th style={{ padding: '10px 14px' }}>Date</th>
                  <th style={{ padding: '10px 14px' }}>Payment Method</th>
                  <th style={{ padding: '10px 14px' }}>Amount</th>
                  <th style={{ padding: '10px 14px' }}>Paid By</th>
                  <th style={{ padding: '10px 14px' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(!payrollData?.payments || payrollData.payments.length === 0) ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                      No payments recorded for this salary period yet.
                    </td>
                  </tr>
                ) : (
                  payrollData.payments.map((p, idx) => (
                    <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '10px 14px' }}>{formatSaudiDateTime(p.created_at)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: p.payment_method === 'Cash' ? '#ecfdf5' : '#eff6ff',
                          color: p.payment_method === 'Cash' ? '#047857' : '#1d4ed8'
                        }}>
                          {p.payment_method}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: '#059669' }}>
                        {CURRENCY} {parseFloat(p.amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{p.paid_by || 'Admin'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{p.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* -------------------- TAB 3: KHATA LEDGER -------------------- */}
      {activeTab === 'khata' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!khataData?.is_registered ? (
            <div style={{
              background: 'var(--surface)',
              borderRadius: 12,
              border: '1.5px dashed var(--surface-3)',
              padding: 40,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12
            }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <CreditCard size={24} />
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                No Khata Credit Account Registered
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.5 }}>
                Your employee account is not linked to a Credit Customer profile. If you need a staff credit account for canteen/orders, please contact your Store Admin or HR.
              </p>
            </div>
          ) : (
            <>
              {/* Khata Metrics Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12
              }}>
                <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', padding: '14px 18px', borderRadius: 10 }}>
                  <span style={{ fontSize: 11, color: '#9a3412', fontWeight: 700, display: 'block' }}>Total Outstanding Balance</span>
                  <div style={{ fontSize: 22, fontWeight: 900, color: (khataData?.balance || 0) > 0 ? '#ea580c' : '#059669', marginTop: 2 }}>
                    {CURRENCY} {Math.abs(parseFloat(khataData?.balance || 0)).toFixed(2)}
                  </div>
                  <span style={{ fontSize: 11, color: (khataData?.balance || 0) > 0 ? '#c2410c' : '#059669', fontWeight: 600 }}>
                    {(khataData?.balance || 0) > 0 ? 'Due to Pay' : 'Advance / Clear'}
                  </span>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-3)', padding: '14px 18px', borderRadius: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>Prev Month Remaining Khata</span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#c2410c', marginTop: 2 }}>
                    {CURRENCY} {parseFloat(khataData?.prev_month_remaining || 0).toFixed(2)}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Carryover prior to {selectedMonth}</span>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-3)', padding: '14px 18px', borderRadius: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>This Month Charges</span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#e11d48', marginTop: 2 }}>
                    {CURRENCY} {parseFloat(khataData?.this_month_khata || 0).toFixed(2)}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Orders & debits in {selectedMonth}</span>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-3)', padding: '14px 18px', borderRadius: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>Payroll Khata Deduction</span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#059669', marginTop: 2 }}>
                    -{CURRENCY} {parseFloat(khataData?.khata_deduction || 0).toFixed(2)}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Deducted in salary slip</span>
                </div>
              </div>

              {/* Transactions Ledger Table */}
              <div style={{
                background: 'var(--surface)',
                borderRadius: 12,
                border: '1px solid var(--surface-3)',
                overflow: 'hidden'
              }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--surface-3)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    Khata Statement & Transactions ({formatMonthDisplay(selectedMonth)})
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Opening Balance: <strong>{CURRENCY} {parseFloat(khataData?.opening_balance || 0).toFixed(2)}</strong>
                  </span>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: 460 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 2 }}>
                      <tr style={{ borderBottom: '1.5px solid var(--surface-3)' }}>
                        <th style={{ padding: '10px 14px' }}>Date & Time</th>
                        <th style={{ padding: '10px 14px' }}>Ref / Bill #</th>
                        <th style={{ padding: '10px 14px' }}>Type</th>
                        <th style={{ padding: '10px 14px' }}>Description</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Debit (+)</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Credit (-)</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Running Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!khataData?.transactions || khataData.transactions.length === 0) ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                            No Khata transactions found for this period.
                          </td>
                        </tr>
                      ) : (
                        khataData.transactions.map((t, idx) => {
                          const isDebit = t.type === 'CREDIT_ORDER' || t.type === 'CHARGE';
                          return (
                            <tr key={t.id || idx} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                {formatSaudiDateTime(t.created_at)}
                              </td>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--primary)' }}>
                                {t.slip_number || (t.order_id ? `#${t.order_id}` : '-')}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  background: isDebit ? '#fee2e2' : '#dcfce7',
                                  color: isDebit ? '#b91c1c' : '#15803d'
                                }}>
                                  {t.classification || (isDebit ? 'Debit' : 'Payment')}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', color: 'var(--text)' }}>
                                {t.comments || (t.type === 'CREDIT_ORDER' ? 'Order charge' : 'Khata entry')}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: isDebit ? '#dc2626' : 'var(--text-muted)' }}>
                                {isDebit ? `+${CURRENCY} ${parseFloat(t.amount || 0).toFixed(2)}` : '-'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: !isDebit ? '#16a34a' : 'var(--text-muted)' }}>
                                {!isDebit ? `-${CURRENCY} ${parseFloat(t.amount || 0).toFixed(2)}` : '-'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: (t.running_balance || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                                {CURRENCY} {parseFloat(t.running_balance || 0).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

