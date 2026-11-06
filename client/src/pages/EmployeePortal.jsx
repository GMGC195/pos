import { useEffect, useState, useMemo } from 'react';
import axios from '../api';
import { useAuth } from '../contexts/AuthContext';
import {
  Clock,
  Banknote,
  CreditCard,
  Calendar,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Coffee,
  HelpCircle,
  DollarSign,
  Briefcase,
  Layers,
  ChevronDown,
  Fingerprint,
  Play,
  Square,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getSaudiCurrentMonthStr,
  getSaudiDateString,
  getSaudiLiveTimeString,
  getSaudiTodayDate
} from '../utils/timezone';

const CURRENCY = 'SAR';

const decimalHoursToText = (hoursDec) => {
  if (isNaN(hoursDec) || hoursDec === null || hoursDec === undefined) return '0 hr';
  const totalMins = Math.round(hoursDec * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
};

const calculateShiftScheduleDetailsClient = ({
  cleanDate,
  checkInTime,
  actualCheckoutTime,
  shiftHoursVal,
  prevSessionsMs,
  totalBreakSecs,
  shift1Start,
  shift1End,
  isSplitShift,
  shift2Start,
  shift2End,
  hasPreviousSessionsToday
}) => {
  const parseTime = (tStr) => {
    if (!tStr) return 0;
    if (tStr === '24:00') return 24 * 60;
    const m = tStr.match(/^(\d+):(\d+)/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };

  const [s1H, s1M] = (shift1Start || '00:00').split(':').map(Number);
  let [e1H, e1M] = (shift1End || '00:00').split(':').map(Number);

  const d1Start = new Date(`${cleanDate}T12:00:00+03:00`);
  const shift1StartMs = new Date(
    `${d1Start.getFullYear()}-${String(d1Start.getMonth() + 1).padStart(2, '0')}-${String(d1Start.getDate()).padStart(2, '0')}T${String(s1H).padStart(2, '0')}:${String(s1M || 0).padStart(2, '0')}:00+03:00`
  ).getTime();

  let end1DayOffset = 0;
  if (e1H === 24) {
    e1H = 0;
    end1DayOffset = 1;
  } else if (e1H < s1H || (e1H === s1H && (e1M || 0) < (s1M || 0))) {
    end1DayOffset = 1;
  }
  const d1End = new Date(`${cleanDate}T12:00:00+03:00`);
  if (end1DayOffset > 0) d1End.setDate(d1End.getDate() + end1DayOffset);
  const shift1EndMs = new Date(
    `${d1End.getFullYear()}-${String(d1End.getMonth() + 1).padStart(2, '0')}-${String(d1End.getDate()).padStart(2, '0')}T${String(e1H).padStart(2, '0')}:${String(e1M || 0).padStart(2, '0')}:00+03:00`
  ).getTime();

  let shift2StartMs = null;
  let shift2EndMs = null;

  if (isSplitShift && shift2End) {
    let [s2H, s2M] = (shift2Start || '00:00').split(':').map(Number);
    let s1TotalMins = s1H * 60 + (s1M || 0);
    let s2TotalMins = s2H * 60 + (s2M || 0);
    let start2DayOffset = 0;
    if (end1DayOffset > 0 && s2TotalMins <= parseTime(shift1End)) {
      start2DayOffset = end1DayOffset;
    } else if (s2TotalMins < s1TotalMins && end1DayOffset === 0) {
      start2DayOffset = 1;
    }

    const d2Start = new Date(`${cleanDate}T12:00:00+03:00`);
    if (start2DayOffset > 0) d2Start.setDate(d2Start.getDate() + start2DayOffset);
    shift2StartMs = new Date(
      `${d2Start.getFullYear()}-${String(d2Start.getMonth() + 1).padStart(2, '0')}-${String(d2Start.getDate()).padStart(2, '0')}T${String(s2H).padStart(2, '0')}:${String(s2M || 0).padStart(2, '0')}:00+03:00`
    ).getTime();

    let [e2H, e2M] = (shift2End || '00:00').split(':').map(Number);
    let end2DayOffset = start2DayOffset;
    if (e2H === 24) {
      e2H = 0;
      end2DayOffset += 1;
    } else if (e2H < s2H || (e2H === s2H && (e2M || 0) < (s2M || 0))) {
      end2DayOffset += 1;
    }

    const d2End = new Date(`${cleanDate}T12:00:00+03:00`);
    if (end2DayOffset > 0) d2End.setDate(d2End.getDate() + end2DayOffset);
    shift2EndMs = new Date(
      `${d2End.getFullYear()}-${String(d2End.getMonth() + 1).padStart(2, '0')}-${String(d2End.getDate()).padStart(2, '0')}T${String(e2H).padStart(2, '0')}:${String(e2M || 0).padStart(2, '0')}:00+03:00`
    ).getTime();
  }

  let isShift2 = false;
  if (isSplitShift && shift2EndMs) {
    const midpoint = shift2StartMs ? Math.floor((shift1EndMs + shift2StartMs) / 2) : shift1EndMs;
    if (hasPreviousSessionsToday) {
      isShift2 = true;
    } else if (checkInTime >= midpoint) {
      isShift2 = true;
    } else if (actualCheckoutTime >= (shift2StartMs || midpoint)) {
      isShift2 = true;
    }
  }

  const scheduledShiftEndMs = (isShift2 && shift2EndMs) ? shift2EndMs : (shift1EndMs || null);
  const shiftHours = parseFloat(shiftHoursVal || 12.0);
  const expectedMs = shiftHours * 60 * 60 * 1000;
  const remainingMs = Math.max(0, expectedMs - prevSessionsMs);

  let expectedCheckoutTime = checkInTime + remainingMs + (totalBreakSecs * 1000);
  if (scheduledShiftEndMs) {
    expectedCheckoutTime = Math.min(scheduledShiftEndMs, expectedCheckoutTime);
  }

  return {
    isShift2,
    scheduledShiftEndMs,
    expectedCheckoutTime,
    shift1StartMs,
    shift1EndMs,
    shift2StartMs,
    shift2EndMs
  };
};

export default function EmployeePortal() {
  const { user } = useAuth();

  // Tab State: 'attendance' | 'mark_attendance' | 'payroll' | 'khata'
  const [activeTab, setActiveTab] = useState('attendance');

  // Month selector (Default to Saudi current month)
  const [selectedMonth, setSelectedMonth] = useState(getSaudiCurrentMonthStr());

  // Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [attendanceData, setAttendanceData] = useState(null);
  const [payrollData, setPayrollData] = useState(null);
  const [khataData, setKhataData] = useState({
    is_registered: true,
    current_outstanding_balance: 0,
    this_month_khata: 0,
    prev_month_remaining_khata: 0,
    total_purchases: 0,
    total_payments: 0,
    transactions: []
  });

  // Live Clock & Active Attendance Action State
  const [liveKsaTime, setLiveKsaTime] = useState(getSaudiLiveTimeString());
  const [todaySession, setTodaySession] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Overtime & Requests state (Matching My Attendance rules)
  const [shiftsList, setShiftsList] = useState([]);
  const [myEditRequests, setMyEditRequests] = useState([]);
  const [overtimeModal, setOvertimeModal] = useState(null);
  const [overtimeReason, setOvertimeReason] = useState('');
  const [overtimeWithSameTime, setOvertimeWithSameTime] = useState(true);
  const [overtimeManualHours, setOvertimeManualHours] = useState(0);
  const [overtimeManualMins, setOvertimeManualMins] = useState(0);

  // Live timer ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveKsaTime(getSaudiLiveTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Generate Month list (Current month + last 12 months)
  const monthsList = useMemo(() => {
    const list = [];
    const currentSaudiStr = getSaudiCurrentMonthStr();
    const [cYear, cMonth] = currentSaudiStr.split('-').map(Number);

    for (let i = 0; i < 12; i++) {
      let d = new Date(cYear, cMonth - 1 - i, 15);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const val = `${y}-${m}`;
      const name = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      list.push({
        id: val,
        label: val === currentSaudiStr ? `${name} (Current)` : name
      });
    }
    return list;
  }, []);

  // Fetch all employee portal data
  const loadData = async (isManualRefresh = false) => {
    if (!profile) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Load profile
      const profRes = await axios.get('/api/employee-portal/me');
      setProfile(profRes.data);

      const empId = profRes.data?.id;

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
      try {
        const khataRes = await axios.get('/api/employee-portal/khata', {
          params: { month: selectedMonth }
        });
        if (khataRes.data) {
          setKhataData({
            is_registered: true,
            current_outstanding_balance: parseFloat(khataRes.data.current_outstanding_balance || 0),
            this_month_khata: parseFloat(khataRes.data.this_month_khata || 0),
            prev_month_remaining_khata: parseFloat(khataRes.data.prev_month_remaining_khata || 0),
            total_purchases: parseFloat(khataRes.data.total_purchases || 0),
            total_payments: parseFloat(khataRes.data.total_payments || 0),
            transactions: khataRes.data.transactions || []
          });
        }
      } catch (kErr) {
        console.warn('Khata fetch notice:', kErr);
      }

      // 5. Load today's active session for Mark Attendance
      if (empId) {
        try {
          const todayRes = await axios.get('/api/attendance/today');
          const empToday = todayRes.data?.find(
            e => e.employee_id === empId || e.id === empId
          );
          setTodaySession(empToday || null);
        } catch (tErr) {
          console.warn('Today attendance fetch notice:', tErr);
        }
      }

      // 6. Load shifts list for timing / overtime accuracy
      try {
        const shiftsRes = await axios.get('/api/employees/working-hours/list');
        setShiftsList(shiftsRes.data || []);
      } catch (sErr) {
        console.warn('Shifts list fetch notice:', sErr);
      }

      // 7. Load my attendance edit requests
      try {
        const reqsRes = await axios.get('/api/attendance/edit-requests?my_requests=true');
        setMyEditRequests(reqsRes.data || []);
      } catch (rErr) {
        console.warn('Edit requests fetch notice:', rErr);
      }

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

  // Attendance Action Handlers (Match My Attendance business logic)
  const handleCheckInRequest = async () => {
    if (!profile?.id) {
      toast.error('No employee profile loaded');
      return;
    }
    setActionLoading(true);
    try {
      const now = new Date();
      await axios.post('/api/attendance/edit-requests', {
        attendance_id: null,
        requested_check_in: now.toISOString(),
        requested_check_out: null,
        reason: 'Self Check-In',
        target_role: 'Both',
        request_type: 'Check-In'
      });
      toast.success('Check-In request submitted successfully!');
      await loadData(true);
    } catch (err) {
      console.error('Check-in request failed:', err);
      toast.error(err.response?.data?.error || 'Failed to submit Check-In request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBreak = async () => {
    if (!profile?.id) {
      toast.error('No employee profile loaded');
      return;
    }
    setActionLoading(true);
    try {
      await axios.post('/api/attendance/toggle-break', { employee_id: profile.id });
      toast.success(todaySession?.on_break ? 'Break ended. Welcome back!' : 'Break started.');
      await loadData(true);
    } catch (err) {
      console.error('Toggle break failed:', err);
      toast.error(err.response?.data?.error || 'Break action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const submitCheckOutRequest = async (attendanceId, reason, ignoreOvertime = false, requestedOtMins = null) => {
    setActionLoading(true);
    try {
      const now = new Date();
      await axios.post('/api/attendance/edit-requests', {
        attendance_id: attendanceId || null,
        requested_check_out: now.toISOString(),
        reason: reason || 'Self Check-Out',
        target_role: 'Both',
        request_type: 'Check-Out'
      });
      toast.success(ignoreOvertime ? 'Check-Out request submitted (Overtime ignored)' : 'Check-Out request submitted successfully!');
      setOvertimeModal(null);
      await loadData(true);
    } catch (err) {
      console.error('Check-out request failed:', err);
      toast.error(err.response?.data?.error || 'Failed to submit Check-Out request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOutRequestClick = () => {
    if (!profile?.id) {
      toast.error('No employee profile loaded');
      return;
    }
    const activeAttId = todaySession?.attendance_id || todaySession?.id;
    if (!activeAttId && !todaySession?.check_in) {
      toast.error('No active check-in found to check out.');
      return;
    }

    const checkInTime = new Date(todaySession?.check_in).getTime();
    const shiftHours = parseFloat(todaySession?.shift_hours || profile?.shift_hours || 12.0);
    let totalBreakSecs = todaySession?.total_break_duration_seconds || 0;
    if (todaySession?.on_break && todaySession?.break_start) {
      totalBreakSecs += Math.floor((Date.now() - new Date(todaySession.break_start).getTime()) / 1000);
    }

    let prevSessionsMs = 0;
    let completedSessionsCount = 0;
    if (todaySession?.sessions && todaySession.sessions.length > 0) {
      todaySession.sessions.forEach(s => {
        if (s.check_out && (s.attendance_id !== activeAttId && s.id !== activeAttId)) {
          completedSessionsCount += 1;
          const pIn = new Date(s.check_in).getTime();
          const pOut = new Date(s.check_out).getTime();
          const pBreak = (s.total_break_duration_seconds || 0) * 1000;
          prevSessionsMs += Math.max(0, pOut - pIn - pBreak);
        }
      });
    }

    const shiftName = todaySession?.shift_name || profile?.shift || 'R1';
    const matchedShift = shiftsList.find(s => s.name?.toUpperCase() === shiftName.toUpperCase()) || {};
    const isSplitShift = Boolean(todaySession?.is_split_shift ?? matchedShift.is_split_shift);
    const shift1Start = todaySession?.shift_start_time || matchedShift.start_time || '10:00';
    const shift1End = todaySession?.shift_end_time || matchedShift.end_time;
    const shift2Start = todaySession?.shift_start_time_2 || matchedShift.start_time_2;
    const shift2End = todaySession?.shift_end_time_2 || matchedShift.end_time_2;

    const cleanDate = getSaudiDateString(todaySession?.date || todaySession?.check_in || new Date());
    const actualCheckoutTime = Date.now();

    const { scheduledShiftEndMs, expectedCheckoutTime } = calculateShiftScheduleDetailsClient({
      cleanDate,
      checkInTime,
      actualCheckoutTime,
      shiftHoursVal: shiftHours,
      prevSessionsMs,
      totalBreakSecs,
      shift1Start,
      shift1End,
      isSplitShift,
      shift2Start,
      shift2End,
      hasPreviousSessionsToday: completedSessionsCount > 0
    });

    const overtimeMins = Math.floor((actualCheckoutTime - expectedCheckoutTime) / (1000 * 60));

    if (overtimeMins > 0) {
      setOvertimeModal({
        empId: profile.id,
        name: profile.name,
        overtimeMins,
        attendanceId: activeAttId,
        expectedCheckoutTime
      });
      setOvertimeReason('');
      setOvertimeWithSameTime(true);
      setOvertimeManualHours(Math.floor(overtimeMins / 60));
      setOvertimeManualMins(overtimeMins % 60);
      return;
    }

    submitCheckOutRequest(activeAttId, 'Self Check-Out');
  };

  const hasPendingCheckIn = useMemo(() => {
    const todaySaudiStr = getSaudiDateString();
    return (myEditRequests || []).some(r => 
      r.status === 'Pending' && 
      r.request_type === 'Check-In' &&
      getSaudiDateString(r.requested_check_in || r.created_at) === todaySaudiStr
    ) || (todaySession?.pending_requests || []).some(r => 
      r.request_type === 'Check-In'
    );
  }, [myEditRequests, todaySession]);

  const hasPendingCheckOut = useMemo(() => {
    const activeAttId = todaySession?.attendance_id || todaySession?.id;
    return (myEditRequests || []).some(r => 
      r.status === 'Pending' && 
      (r.request_type === 'Check-Out' || r.request_type === 'Overtime') &&
      (!r.attendance_id || r.attendance_id === activeAttId)
    ) || (todaySession?.pending_requests || []).some(r => 
      (r.request_type === 'Check-Out' || r.request_type === 'Overtime')
    );
  }, [myEditRequests, todaySession]);

  // Compute 1..N Day Cards for Monthly Attendance Summary (Payload Style)
  const monthlyDayCards = useMemo(() => {
    if (!selectedMonth) return [];
    const [yStr, mStr] = selectedMonth.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const totalDays = new Date(year, month, 0).getDate();
    const standardShift = parseFloat(profile?.shift_hours || 12.0);

    const currentSaudiStr = getSaudiCurrentMonthStr();
    const isCurrentMonth = selectedMonth === currentSaudiStr;
    const currentSaudiDay = parseInt(getSaudiTodayDate().split('-')[2], 10);

    const days = [];
    const dailyMap = {};

    if (attendanceData?.sessions) {
      attendanceData.sessions.forEach(sess => {
        const rawDate = sess.date ? sess.date.split('T')[0] : '';
        if (rawDate) {
          if (!dailyMap[rawDate]) dailyMap[rawDate] = [];
          dailyMap[rawDate].push(sess);
        }
      });
    }

    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const dateKey = `${selectedMonth}-${String(dayNum).padStart(2, '0')}`;
      const dObj = new Date(year, month - 1, dayNum);
      const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
      const isFuture = isCurrentMonth ? dayNum > currentSaudiDay : false;

      const daySessions = dailyMap[dateKey] || [];
      const hasSessions = daySessions.length > 0;
      const lastSession = hasSessions ? daySessions[daySessions.length - 1] : null;

      let status = 'Absent';
      let checkIn = '--:--';
      let checkOut = '--:--';
      let workingHours = 0;
      let otHours = 0;

      if (hasSessions) {
        status = lastSession.status || 'Present';
        const firstSession = daySessions[0];
        checkIn = firstSession.check_in_time_formatted || (firstSession.check_in ? firstSession.check_in.slice(11, 16) : '--:--');
        checkOut = lastSession.check_out_time_formatted || (lastSession.check_out ? lastSession.check_out.slice(11, 16) : (lastSession.check_in ? 'In Duty' : '--:--'));
        workingHours = daySessions.reduce((acc, s) => acc + (parseFloat(s.working_hours) || 0), 0);
        otHours = daySessions.reduce((acc, s) => acc + (parseFloat(s.overtime_hours) || 0), 0);
      } else if (isFuture) {
        status = 'Upcoming';
      }

      days.push({
        dayNum,
        dayName,
        dateKey,
        isFuture,
        status,
        checkIn,
        checkOut,
        workingHours,
        otHours: Math.max(0, otHours),
        sessions: daySessions
      });
    }

    return days;
  }, [selectedMonth, attendanceData, profile]);

  // Today Active Status Detection
  const isCheckedIn = Boolean(
    todaySession && (
      (todaySession.sessions && todaySession.sessions.some(s => !s.check_out)) ||
      (todaySession.attendance_id && !todaySession.check_out)
    )
  );
  const isOnBreak = Boolean(todaySession?.on_break);

  return (
    <div className="employee-portal-container" style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: '12px 14px 40px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>

      {/* 1. Header Profile & Month Selector */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--surface-3)',
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        {/* Profile Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 280px' }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #e31837, #f97316)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 800,
            boxShadow: '0 2px 6px rgba(227, 24, 55, 0.25)',
            flexShrink: 0
          }}>
            {profile?.name ? profile.name.charAt(0).toUpperCase() : 'E'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile?.name || 'Employee'}
              </h2>
              <span style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#2563eb',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 6,
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                {profile?.employee_id || 'EMP-0001'}
              </span>
              <span style={{
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#059669',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 6
              }}>
                {profile?.role || 'Staff'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11.5, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span>Branch: <strong style={{ color: 'var(--text)' }}>{profile?.branch || 'Main'}</strong></span>
              <span>•</span>
              <span>Shift: <strong style={{ color: 'var(--text)' }}>{profile?.shift_hours || 12}h</strong></span>
              <span>•</span>
              <span>Salary: <strong style={{ color: 'var(--text)' }}>{CURRENCY} {parseFloat(profile?.salary || 0).toFixed(2)}</strong></span>
            </div>
          </div>
        </div>

        {/* Month Selector & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--surface-3)' }}>
            <Calendar size={15} color="var(--primary)" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 12.5,
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
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid var(--surface-3)',
              background: 'var(--surface-2)',
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
            <span>{refreshing ? '...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs Bar (Attendance | Mark Attendance | Salary & Payroll | My Khata Ledger) */}
      <div className="emp-tabs-bar" style={{
        display: 'flex',
        gap: 8,
        borderBottom: '2px solid var(--surface-2)',
        paddingBottom: 4,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        maxWidth: '100%',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}>
        {[
          { id: 'attendance', label: 'My Attendance', icon: <Clock size={16} /> },
          { id: 'mark_attendance', label: 'Mark Attendance', icon: <Fingerprint size={16} /> },
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
                gap: 7,
                padding: '9px 14px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                background: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: isActive ? 800 : 600,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* -------------------- TAB 1: MY ATTENDANCE -------------------- */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Summary Stat Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10
          }}>
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#166534', fontWeight: 700, display: 'block' }}>Present Days</span>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#15803d', marginTop: 2 }}>
                {attendanceData?.stats?.present_days || 0}
              </div>
            </div>
            <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#991b1b', fontWeight: 700, display: 'block' }}>Absent Days</span>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#b91c1c', marginTop: 2 }}>
                {attendanceData?.stats?.absent_days || 0}
              </div>
            </div>
            <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, display: 'block' }}>Leaves</span>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#b45309', marginTop: 2 }}>
                {attendanceData?.stats?.leaves || 0}
              </div>
            </div>
            <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#1e40af', fontWeight: 700, display: 'block' }}>Total Work Hours</span>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#1d4ed8', marginTop: 2 }}>
                {decimalHoursToText(attendanceData?.stats?.total_hours || 0)}
              </div>
            </div>
            <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#9a3412', fontWeight: 700, display: 'block' }}>Overtime Hours</span>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#c2410c', marginTop: 2 }}>
                {decimalHoursToText(attendanceData?.stats?.overtime_hours || 0)}
              </div>
            </div>
          </div>

          {/* First: Monthly Attendance Summary (Day-Wise Small Cards Grid) */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--surface-3)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                  Monthly Attendance Summary
                </h3>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Day-by-day attendance status & hours for {selectedMonth}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11, fontWeight: 700 }}>
                <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: 4 }}>P: Present</span>
                <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: 4 }}>A: Absent</span>
                <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 4 }}>L: Leave</span>
                <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: 4 }}>H: Holiday</span>
              </div>
            </div>

            {/* Responsive Day Cards Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
              gap: 7
            }}>
              {monthlyDayCards.map(day => {
                let cardBg = '#f8fafc';
                let borderColor = 'var(--surface-3)';
                let statusColor = '#64748b';
                let statusBg = '#f1f5f9';

                if (day.isFuture) {
                  cardBg = 'rgba(241, 245, 249, 0.4)';
                  statusColor = '#94a3b8';
                } else if (day.status === 'Present') {
                  cardBg = '#f0fdf4';
                  borderColor = '#bbf7d0';
                  statusColor = '#15803d';
                  statusBg = '#dcfce7';
                } else if (day.status === 'Absent') {
                  cardBg = '#fef2f2';
                  borderColor = '#fecaca';
                  statusColor = '#b91c1c';
                  statusBg = '#fee2e2';
                } else if (day.status === 'Leave') {
                  cardBg = '#fffbeb';
                  borderColor = '#fde68a';
                  statusColor = '#92400e';
                  statusBg = '#fef3c7';
                } else if (day.status === 'Holiday') {
                  cardBg = '#eef2ff';
                  borderColor = '#c7d2fe';
                  statusColor = '#3730a3';
                  statusBg = '#e0e7ff';
                }

                return (
                  <div
                    key={day.dateKey}
                    style={{
                      background: cardBg,
                      border: `1.5px solid ${borderColor}`,
                      borderRadius: 8,
                      padding: '6px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: 82,
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                        {String(day.dayNum).padStart(2, '0')}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {day.dayName}
                      </span>
                    </div>

                    <div style={{ margin: '3px 0' }}>
                      <span style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: statusBg,
                        color: statusColor,
                        display: 'inline-block'
                      }}>
                        {day.status}
                      </span>
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {day.status === 'Present' ? (
                        <>
                          <span>In: {day.checkIn}</span>
                          <span>Out: {day.checkOut}</span>
                          {day.otHours > 0 && (
                            <span style={{ color: '#ea580c', fontWeight: 800 }}>+{day.otHours.toFixed(1)}h OT</span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{day.isFuture ? 'Upcoming' : 'Off'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Second: Detailed Attendance Sessions */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--surface-3)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              Detailed Attendance Sessions
            </h3>

            {(!attendanceData?.sessions || attendanceData.sessions.length === 0) ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No attendance sessions recorded for {selectedMonth}.
              </div>
            ) : (
              <>
                {/* Desktop View Table */}
                <div className="att-desktop-table" style={{ width: '100%', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--surface-3)' }}>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Date</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Status</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Check In</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Check Out</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Work Hours</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Overtime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceData.sessions.map((sess, idx) => (
                        <tr key={sess.id || idx} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                            {sess.date ? sess.date.split('T')[0] : '--'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              padding: '2px 7px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              background: sess.status === 'Present' ? '#dcfce7' : '#fee2e2',
                              color: sess.status === 'Present' ? '#15803d' : '#b91c1c'
                            }}>
                              {sess.status || 'Present'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', color: '#2563eb', fontWeight: 600 }}>
                            {sess.check_in_time_formatted || (sess.check_in ? sess.check_in.slice(11, 16) : '--:--')}
                          </td>
                          <td style={{ padding: '8px 10px', color: sess.check_out ? '#059669' : '#ea580c', fontWeight: 600 }}>
                            {sess.check_out_time_formatted || (sess.check_out ? sess.check_out.slice(11, 16) : 'In Duty')}
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                            {decimalHoursToText(sess.working_hours || 0)}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#c2410c', fontWeight: 700 }}>
                            {sess.overtime_hours > 0 ? `+${decimalHoursToText(sess.overtime_hours)}` : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Cards */}
                <div className="att-mobile-cards" style={{ display: 'none', flexDirection: 'column', gap: 8 }}>
                  {attendanceData.sessions.map((sess, idx) => (
                    <div key={sess.id || idx} style={{
                      background: 'var(--surface-2)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      border: '1px solid var(--surface-3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 13, color: 'var(--text)' }}>
                          {sess.date ? sess.date.split('T')[0] : '--'}
                        </strong>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: sess.status === 'Present' ? '#dcfce7' : '#fee2e2',
                          color: sess.status === 'Present' ? '#15803d' : '#b91c1c'
                        }}>
                          {sess.status || 'Present'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11.5 }}>
                        <div>In: <strong style={{ color: '#2563eb' }}>{sess.check_in_time_formatted || (sess.check_in ? sess.check_in.slice(11, 16) : '--:--')}</strong></div>
                        <div>Out: <strong style={{ color: sess.check_out ? '#059669' : '#ea580c' }}>{sess.check_out_time_formatted || (sess.check_out ? sess.check_out.slice(11, 16) : 'In Duty')}</strong></div>
                        <div>Hours: <strong>{decimalHoursToText(sess.working_hours || 0)}</strong></div>
                        <div>OT: <strong style={{ color: '#ea580c' }}>{sess.overtime_hours > 0 ? `+${decimalHoursToText(sess.overtime_hours)}` : '0h'}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* -------------------- TAB 2: MARK ATTENDANCE (MOBILE-FIRST) -------------------- */}
      {activeTab === 'mark_attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Live Saudi Clock Card */}
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            borderRadius: 16,
            padding: '22px 20px',
            color: '#fff',
            textAlign: 'center',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6
          }}>
            <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>
              Saudi Arabia Time (KSA)
            </span>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 2, color: '#38bdf8', fontFamily: 'monospace' }}>
              {liveKsaTime}
            </div>
            <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
              Today: {getSaudiDateString()}
            </span>
          </div>

          {/* Shift Status Banner */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--surface-3)',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Current Duty Status</span>
                <div style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: (!isCheckedIn && hasPendingCheckIn)
                    ? '#d97706'
                    : (isCheckedIn && hasPendingCheckOut)
                      ? '#d97706'
                      : isCheckedIn
                        ? (isOnBreak ? '#ea580c' : '#15803d')
                        : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 2
                }}>
                  <span style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: (!isCheckedIn && hasPendingCheckIn)
                      ? '#f59e0b'
                      : (isCheckedIn && hasPendingCheckOut)
                        ? '#f59e0b'
                        : isCheckedIn
                          ? (isOnBreak ? '#ea580c' : '#10b981')
                          : '#94a3b8',
                    display: 'inline-block'
                  }} />
                  {(!isCheckedIn && hasPendingCheckIn)
                    ? 'Check-In Request Pending'
                    : (isCheckedIn && hasPendingCheckOut)
                      ? 'Check-Out Request Pending'
                      : isCheckedIn
                        ? (isOnBreak ? 'On Break' : 'Checked In (On Duty)')
                        : 'Not Checked In'}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Assigned Shift</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {profile?.shift_hours || 12} Hours
                </div>
              </div>
            </div>

            {/* Action Buttons (Large, Touch-Friendly for Mobile) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isCheckedIn ? '1fr 1fr' : '1fr',
              gap: 10,
              marginTop: 6
            }}>
              {!isCheckedIn ? (
                hasPendingCheckIn ? (
                  <button
                    disabled
                    style={{
                      background: '#ff9800',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 12,
                      padding: '14px 20px',
                      fontSize: 16,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      cursor: 'not-allowed',
                      boxShadow: '0 4px 10px rgba(255, 152, 0, 0.3)',
                      opacity: 0.95
                    }}
                  >
                    <AlertCircle size={22} />
                    <span>Request Pending</span>
                  </button>
                ) : (
                  <button
                    onClick={handleCheckInRequest}
                    disabled={actionLoading}
                    style={{
                      background: '#15803d',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 12,
                      padding: '14px 20px',
                      fontSize: 16,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 10px rgba(21, 128, 61, 0.3)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Fingerprint size={22} />
                    <span>{actionLoading ? 'Sending Request...' : 'Check In Request'}</span>
                  </button>
                )
              ) : (
                <>
                  <button
                    onClick={handleToggleBreak}
                    disabled={actionLoading}
                    style={{
                      background: isOnBreak ? '#15803d' : '#ea580c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 12,
                      padding: '14px 16px',
                      fontSize: 15,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 10px rgba(234, 88, 12, 0.25)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Coffee size={20} />
                    <span>{isOnBreak ? 'End Break' : 'Start Break'}</span>
                  </button>

                  {hasPendingCheckOut ? (
                    <button
                      disabled
                      style={{
                        background: '#ff9800',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 12,
                        padding: '14px 16px',
                        fontSize: 15,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        cursor: 'not-allowed',
                        boxShadow: '0 4px 10px rgba(255, 152, 0, 0.3)',
                        opacity: 0.95
                      }}
                    >
                      <AlertCircle size={18} />
                      <span>Request Pending</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleCheckOutRequestClick}
                      disabled={actionLoading}
                      style={{
                        background: '#b91c1c',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 12,
                        padding: '14px 16px',
                        fontSize: 15,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 10px rgba(185, 28, 28, 0.25)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Square size={18} fill="#ffffff" />
                      <span>{actionLoading ? 'Processing...' : 'Request Check Out'}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Today's Activity Summary */}
          {todaySession && (
            <div style={{
              background: 'var(--surface)',
              borderRadius: 14,
              border: '1px solid var(--surface-3)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Today's Shift Timeline</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, fontSize: 12 }}>
                <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>First Check In:</span>
                  <div style={{ fontWeight: 800, color: '#2563eb', marginTop: 2 }}>
                    {todaySession.check_in ? todaySession.check_in.slice(11, 16) : '--:--'}
                  </div>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Break Time:</span>
                  <div style={{ fontWeight: 800, color: '#ea580c', marginTop: 2 }}>
                    {Math.round((todaySession.total_break_duration_seconds || 0) / 60)} mins
                  </div>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Work Status:</span>
                  <div style={{ fontWeight: 800, color: '#15803d', marginTop: 2 }}>
                    {todaySession.status || 'Active'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Attendance Requests & Status History */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--surface-3)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                Attendance Requests & Status
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {myEditRequests.length} Total Requests
              </span>
            </div>

            {myEditRequests.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                No attendance requests submitted yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myEditRequests.slice(0, 5).map(req => {
                  let badgeBg = '#fef3c7';
                  let badgeColor = '#b45309';
                  let badgeIcon = <AlertCircle size={13} />;
                  if (req.status === 'Approved') {
                    badgeBg = '#dcfce7';
                    badgeColor = '#15803d';
                    badgeIcon = <CheckCircle size={13} />;
                  } else if (req.status === 'Rejected') {
                    badgeBg = '#fee2e2';
                    badgeColor = '#b91c1c';
                    badgeIcon = <XCircle size={13} />;
                  }

                  const reqTimeStr = req.created_at ? new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const reqDateStr = req.created_at ? new Date(req.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

                  return (
                    <div
                      key={req.id}
                      style={{
                        background: 'var(--surface-2)',
                        padding: '10px 12px',
                        borderRadius: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <strong style={{ color: 'var(--text)' }}>
                            {req.request_type || 'Attendance Request'}
                          </strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            • {reqDateStr} {reqTimeStr}
                          </span>
                        </div>
                        {req.reason && (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {req.reason}
                          </span>
                        )}
                      </div>

                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: badgeBg,
                        color: badgeColor,
                        fontWeight: 700,
                        fontSize: 11,
                        flexShrink: 0
                      }}>
                        {badgeIcon}
                        <span>{req.status || 'Pending'}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------- TAB 3: SALARY & PAYROLL -------------------- */}
      {activeTab === 'payroll' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Payroll Metric Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10
          }}>
            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--surface-3)', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>Base Salary</span>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', marginTop: 2 }}>
                {CURRENCY} {parseFloat(payrollData?.payroll?.base_salary || profile?.salary || 0).toFixed(2)}
              </div>
            </div>
            <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#9a3412', fontWeight: 700, display: 'block' }}>Overtime Pay</span>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#c2410c', marginTop: 2 }}>
                {CURRENCY} {parseFloat(payrollData?.payroll?.overtime_pay || 0).toFixed(2)}
              </div>
            </div>
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#166534', fontWeight: 700, display: 'block' }}>Allowances</span>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#15803d', marginTop: 2 }}>
                {CURRENCY} {parseFloat(payrollData?.payroll?.total_additions || 0).toFixed(2)}
              </div>
            </div>
            <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#991b1b', fontWeight: 700, display: 'block' }}>Deductions / Khata</span>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#b91c1c', marginTop: 2 }}>
                {CURRENCY} {parseFloat(payrollData?.payroll?.total_deductions || 0).toFixed(2)}
              </div>
            </div>
            <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#1e40af', fontWeight: 700, display: 'block' }}>Net Salary</span>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8', marginTop: 2 }}>
                {CURRENCY} {parseFloat(payrollData?.payroll?.net_salary || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Overtime Details Card */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--surface-3)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              Overtime Calculation Details
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 10,
              fontSize: 12
            }}>
              <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Overtime Days:</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                  {payrollData?.overtime_breakdown?.overtime_days || 0} Days
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Overtime Hours:</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ea580c', marginTop: 2 }}>
                  {decimalHoursToText(payrollData?.overtime_breakdown?.total_overtime_hours || 0)}
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Hourly Rate:</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                  {CURRENCY} {parseFloat(payrollData?.overtime_breakdown?.hourly_rate || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Overtime Total:</span>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#15803d', marginTop: 2 }}>
                  {CURRENCY} {parseFloat(payrollData?.overtime_breakdown?.total_overtime_pay || payrollData?.payroll?.overtime_amount || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Payment History & Adjustments */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--surface-3)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              Salary Payment Status & History
            </h3>
            {(!payrollData?.payments || payrollData.payments.length === 0) ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                No salary payment disbursed yet for {selectedMonth}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {payrollData.payments.map((p, idx) => (
                  <div key={p.id || idx} style={{
                    background: 'var(--surface-2)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12.5
                  }}>
                    <div>
                      <strong style={{ color: 'var(--text)' }}>{p.date || 'Payment Date'}</strong>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                        Method: {p.payment_method || 'Cash'} {p.notes ? `• ${p.notes}` : ''}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ color: '#15803d', fontSize: 14 }}>
                        {CURRENCY} {parseFloat(p.amount || 0).toFixed(2)}
                      </strong>
                      <span style={{ display: 'block', fontSize: 10.5, color: '#059669', fontWeight: 700 }}>
                        {p.status || 'Paid'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------- TAB 4: MY KHATA LEDGER -------------------- */}
      {activeTab === 'khata' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Khata Metrics Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
            gap: 10
          }}>
            <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#9a3412', fontWeight: 700, display: 'block' }}>Total Outstanding</span>
              <div style={{ fontSize: 18, fontWeight: 900, color: (khataData?.current_outstanding_balance || 0) > 0 ? '#ea580c' : '#059669', marginTop: 2 }}>
                {CURRENCY} {Math.abs(parseFloat(khataData?.current_outstanding_balance || 0)).toFixed(2)}
              </div>
              <span style={{ fontSize: 10.5, color: (khataData?.current_outstanding_balance || 0) > 0 ? '#c2410c' : '#059669', fontWeight: 600 }}>
                {(khataData?.current_outstanding_balance || 0) > 0 ? 'Due to Pay' : 'Advance / Clear'}
              </span>
            </div>

            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--surface-3)', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>Prev Month Remaining</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                {CURRENCY} {parseFloat(khataData?.prev_month_remaining_khata || 0).toFixed(2)}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--surface-3)', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>This Month Khata</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb', marginTop: 2 }}>
                {CURRENCY} {parseFloat(khataData?.this_month_khata || 0).toFixed(2)}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--surface-3)', padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>Total Purchases</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                {CURRENCY} {parseFloat(khataData?.total_purchases || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Transactions List */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--surface-3)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
              Khata Account Activity ({selectedMonth})
            </h3>

            {(!khataData?.transactions || khataData.transactions.length === 0) ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No Khata transactions recorded for {selectedMonth}.
              </div>
            ) : (
              <>
                {/* Desktop View Table */}
                <div className="att-desktop-table" style={{ width: '100%', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--surface-3)' }}>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Date</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Description / Type</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Running Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {khataData.transactions.map((t, idx) => {
                        const isDebit = ['CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED'].includes(t.type);
                        const isSettlement = t.type === 'SETTLEMENT_NOTICE' || t.classification === 'Salary Settlement';

                        return (
                          <tr key={t.id || idx} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                              {t.created_at ? t.created_at.slice(0, 10) : '--'}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{
                                padding: '2px 7px',
                                borderRadius: 4,
                                fontSize: 10.5,
                                fontWeight: 700,
                                background: isSettlement ? '#e0e7ff' : (isDebit ? '#ffedd5' : '#dcfce7'),
                                color: isSettlement ? '#3730a3' : (isDebit ? '#c2410c' : '#15803d'),
                                marginRight: 6
                              }}>
                                {isSettlement ? 'Settlement Notice' : (isDebit ? 'Purchase' : 'Payment')}
                              </span>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {t.comments || (t.slip_number ? `Order #${t.slip_number}` : (t.type || 'Transaction'))}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: isDebit ? '#ea580c' : '#15803d' }}>
                              {isDebit ? '+' : '-'}{CURRENCY} {parseFloat(t.amount || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>
                              {CURRENCY} {parseFloat(t.running_balance || 0).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Cards */}
                <div className="att-mobile-cards" style={{ display: 'none', flexDirection: 'column', gap: 8 }}>
                  {khataData.transactions.map((t, idx) => {
                    const isDebit = ['CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED'].includes(t.type);
                    const isSettlement = t.type === 'SETTLEMENT_NOTICE' || t.classification === 'Salary Settlement';

                    return (
                      <div key={t.id || idx} style={{
                        background: 'var(--surface-2)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        border: '1px solid var(--surface-3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                            {t.created_at ? t.created_at.slice(0, 10) : '--'}
                          </span>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 10.5,
                            fontWeight: 700,
                            background: isSettlement ? '#e0e7ff' : (isDebit ? '#ffedd5' : '#dcfce7'),
                            color: isSettlement ? '#3730a3' : (isDebit ? '#c2410c' : '#15803d')
                          }}>
                            {isSettlement ? 'Settlement' : (isDebit ? 'Purchase' : 'Payment')}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {t.comments || (t.slip_number ? `Order #${t.slip_number}` : (t.type || 'Transaction'))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--surface-3)', paddingTop: 6, marginTop: 2, fontSize: 12 }}>
                          <div>Amount: <strong style={{ color: isDebit ? '#ea580c' : '#15803d' }}>{isDebit ? '+' : '-'}{CURRENCY} {parseFloat(t.amount || 0).toFixed(2)}</strong></div>
                          <div>Balance: <strong style={{ color: 'var(--text)' }}>{CURRENCY} {parseFloat(t.running_balance || 0).toFixed(2)}</strong></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Overtime Reason & Details Modal */}
      {overtimeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: 16,
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            padding: 22,
            borderRadius: 16,
            background: 'var(--surface)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={19} color="#ea580c" />
                Overtime Details & Reason
              </h3>
              <button
                onClick={() => setOvertimeModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              <strong style={{ color: 'var(--text)' }}>{overtimeModal.name}</strong> has worked <strong style={{ color: '#ea580c' }}>
                {(() => {
                  const m = overtimeModal.overtimeMins;
                  const h = Math.floor(m / 60);
                  const rm = m % 60;
                  if (h > 0 && rm > 0) return `${h} hr ${rm} min`;
                  if (h > 0) return `${h} hr`;
                  return `${m} minutes`;
                })()}
              </strong> of overtime. Please provide a reason to submit your check-out request to Admin/Operator for approval.
            </p>

            {/* Overtime History Context */}
            <div style={{
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              color: '#9a3412',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>This Month's Overtime So Far:</span>
              <strong>{decimalHoursToText(attendanceData?.stats?.overtime_hours || attendanceData?.metrics?.overtime_hours || 0)}</strong>
            </div>

            <textarea
              value={overtimeReason}
              onChange={(e) => setOvertimeReason(e.target.value)}
              placeholder="Enter overtime reason here (e.g., Extended shift due to peak customer rush)..."
              style={{
                width: '100%',
                height: 90,
                padding: 12,
                borderRadius: 8,
                border: '1.5px solid var(--surface-3)',
                background: 'var(--surface-1)',
                color: 'var(--text)',
                fontSize: 13.5,
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="portalOtSameTime"
                checked={overtimeWithSameTime}
                onChange={(e) => setOvertimeWithSameTime(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="portalOtSameTime" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
                With same overtime ({(() => {
                  const m = overtimeModal.overtimeMins;
                  const h = Math.floor(m / 60);
                  const rm = m % 60;
                  if (h > 0 && rm > 0) return `${h} hr ${rm} min`;
                  if (h > 0) return `${h} hr`;
                  return `${m} minutes`;
                })()})
              </label>
            </div>

            {!overtimeWithSameTime && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>Hours</label>
                  <input
                    type="number"
                    min="0"
                    value={overtimeManualHours}
                    onChange={(e) => setOvertimeManualHours(parseInt(e.target.value, 10) || 0)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--surface-3)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>Minutes</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={overtimeManualMins}
                    onChange={(e) => setOvertimeManualMins(parseInt(e.target.value, 10) || 0)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--surface-3)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setOvertimeModal(null)}
                style={{
                  flex: '1 1 80px',
                  padding: '10px 14px',
                  fontWeight: 600,
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid var(--surface-3)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  submitCheckOutRequest(overtimeModal.attendanceId, 'Self Check-Out (Overtime Ignored)', true, null);
                }}
                disabled={actionLoading}
                style={{
                  flex: '1 1 120px',
                  padding: '10px 14px',
                  fontWeight: 700,
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid #fed7aa',
                  background: '#fff7ed',
                  color: '#9a3412',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Ignore Overtime
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!overtimeReason.trim()) {
                    toast.error('Overtime reason is required.');
                    return;
                  }
                  const reqMins = overtimeWithSameTime
                    ? overtimeModal.overtimeMins
                    : (overtimeManualHours * 60) + overtimeManualMins;
                  submitCheckOutRequest(
                    overtimeModal.attendanceId,
                    `Overtime (${reqMins} min): ${overtimeReason.trim()}`,
                    false,
                    reqMins
                  );
                }}
                disabled={actionLoading || !overtimeReason.trim()}
                style={{
                  flex: '1 1 140px',
                  padding: '10px 16px',
                  fontWeight: 700,
                  fontSize: 13,
                  borderRadius: 8,
                  border: 'none',
                  background: '#ea580c',
                  color: '#ffffff',
                  cursor: (actionLoading || !overtimeReason.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (actionLoading || !overtimeReason.trim()) ? 0.6 : 1,
                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
                  whiteSpace: 'nowrap'
                }}
              >
                {actionLoading ? 'Submitting...' : 'Submit with Overtime'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for Mobile Responsive Breakpoints */}
      <style>{`
        @media (max-width: 640px) {
          .att-desktop-table {
            display: none !important;
          }
          .att-mobile-cards {
            display: flex !important;
          }
          .employee-portal-container {
            padding: 8px 10px 30px 10px !important;
            gap: 10px !important;
          }
          .emp-tabs-bar button {
            padding: 8px 11px !important;
            font-size: 12px !important;
          }
        }
      `}</style>

    </div>
  );
}
