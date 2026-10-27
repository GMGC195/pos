import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from '../api'
import { useAuth } from '../contexts/AuthContext'
import { socket } from '../socket'
import { toast } from 'react-hot-toast'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import {
  CircleDollarSign,
  Receipt,
  Clock,
  Users,
  TrendingUp,
  Flame,
  Printer,
  Download,
  RefreshCw,
  Fingerprint,
  Coffee,
  UserX,
  Check,
  UserCheck,
  Search,
  Filter,
  CreditCard,
  Banknote,
  ClipboardList,
  Coins,
  MoreVertical,
  Calendar,
  ChevronRight,
  Eye,
  ArrowLeft,
  FileText,
  X
} from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler)

import { CURRENCY } from '../config'
import { BRAND_NAME, BRAND_PRIMARY, BRAND_SECONDARY, BRAND_LOGO } from '../branding'
import { 
  getSaudiTodayDate, 
  getSaudiYesterdayDate, 
  getSaudiWeekAgoDate,
  formatSaudiDate,
  formatSaudiTime,
  formatSaudiDateTime
} from '../utils/timezone'


const PALETTE = [BRAND_PRIMARY, BRAND_SECONDARY, '#10b981', '#3b82f6', '#8b5cf6', '#f97316']

const decimalHoursToText = (hoursDec) => {
  if (isNaN(hoursDec) || hoursDec === null || hoursDec === undefined || hoursDec <= 0) return '0 min';
  const totalMins = Math.round(hoursDec * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
  if (hrs > 0) return `${hrs} hr`;
  return `${mins} min`;
};

const statCards = [
  { key: 'totalSale', label: 'Total Sale', icon: <Coins size={20} strokeWidth={2.5} />, color: BRAND_SECONDARY, prefix: CURRENCY, format: v => Math.round(v).toLocaleString() },
  { key: 'cashSale', label: 'Cash Sales', icon: <Banknote size={20} strokeWidth={2.5} />, color: '#10b981', prefix: CURRENCY, format: v => Math.round(v).toLocaleString() },
  { key: 'cardSale', label: 'Card Sales', icon: <CreditCard size={20} strokeWidth={2.5} />, color: '#3b82f6', prefix: CURRENCY, format: v => Math.round(v).toLocaleString() },
  { key: 'creditSale', label: "Today's Credit", icon: <ClipboardList size={20} strokeWidth={2.5} />, color: '#8b5cf6', prefix: CURRENCY, format: v => Math.round(v).toLocaleString() },
  { key: 'majorPayment', label: 'Major Payment', icon: <Banknote size={20} strokeWidth={2.5} />, color: '#14b8a6', prefix: CURRENCY, format: v => Math.round(v).toLocaleString() },
  { key: 'totalOrders', label: 'Total Orders', icon: <Receipt size={20} strokeWidth={2.5} />, color: BRAND_PRIMARY, prefix: '', format: v => v },
  { key: 'guestsToday', label: 'Guest Today', icon: <Users size={20} strokeWidth={2.5} />, color: '#f59e0b', prefix: '', format: v => v },
]

const payrollStatCards = [
  { key: 'total_salary_paid', label: 'Salary Paid (This Month)', icon: <Coins size={24} strokeWidth={2.5} />, color: '#ef4444', prefix: CURRENCY, format: v => Math.round(v).toLocaleString() },
  { key: 'total_advance_given', label: 'Advances Given', icon: <Coins size={24} strokeWidth={2.5} />, color: '#f59e0b', prefix: CURRENCY, format: v => Math.round(v).toLocaleString() },
]

function StatCard({ stat, value, loading }) {
  const isSAR = stat.prefix === CURRENCY;
  const valString = stat.format(value ?? 0);

  return (
    <div className="stat-card" style={{ '--card-color': stat.color }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start', gap: 4 }}>
        <p style={{ fontSize: 11, margin: 0, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.2 }}>{stat.label}</p>
        <div className="stat-icon" style={{ '--card-color': stat.color, color: '#000' }}>
          {stat.icon}
        </div>
      </div>
      <div className="stat-info" style={{ marginTop: 2 }}>
        {loading
          ? <div className="skeleton" style={{ height: 20, width: 60 }} />
          : <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              {isSAR && <span style={{ fontSize: 10, marginRight: 2, fontWeight: 600 }}>{CURRENCY}</span>}
              {valString}
            </h3>
        }
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isDeveloper = user?.role?.toLowerCase() === 'developer'
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const isManagement = user?.role?.toLowerCase() === 'management'
  const isAdminOrDev = isDeveloper || isAdmin
  const canViewPosAndReports = isAdminOrDev || isManagement
  
  const [dashboardView, setDashboardView] = useState(isDeveloper ? 'pos' : 'attendance')

  useEffect(() => {
    // Operator is now allowed to view dashboard
  }, [user, navigate])

  // Developer sales states
  const [stats, setStats] = useState(null)
  const [targetRevenue, setTargetRevenue] = useState(() => {
    const saved = localStorage.getItem('pos_target_revenue')
    return saved && !isNaN(Number(saved)) && Number(saved) > 0 ? Number(saved) : 15000
  })
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [tempTarget, setTempTarget] = useState('')

  const openTargetModal = () => {
    setTempTarget(targetRevenue.toString())
    setShowTargetModal(true)
  }

  const saveTargetRevenue = () => {
    const val = parseFloat(tempTarget)
    if (isNaN(val) || val <= 0) {
      toast.error('Please enter a valid target amount')
      return
    }
    setTargetRevenue(val)
    localStorage.setItem('pos_target_revenue', val.toString())
    setShowTargetModal(false)
    toast.success(`Target revenue updated to ${CURRENCY}${val.toLocaleString()}`)
  }

  // Closing Reports state
  const [closingHistory, setClosingHistory] = useState([])
  const [closingHistoryLoading, setClosingHistoryLoading] = useState(false)
  const [historyFrom, setHistoryFrom] = useState(() => getSaudiTodayDate())
  const [historyTo, setHistoryTo] = useState(() => getSaudiTodayDate())
  const [historyFilterBranch, setHistoryFilterBranch] = useState('All')
  const [historyFilterType, setHistoryFilterType] = useState('All')
  const [historyFilterUser, setHistoryFilterUser] = useState('All')
  const [selectedHistoryReport, setSelectedHistoryReport] = useState(null)

  const loadClosingHistory = async (fDate, tDate, b, t, u) => {
    setClosingHistoryLoading(true)
    try {
      const res = await axios.get('/api/orders/closings', {
        params: {
          from: fDate !== undefined ? fDate : historyFrom,
          to: tDate !== undefined ? tDate : historyTo,
          branch: b !== undefined ? b : historyFilterBranch,
          type: t !== undefined ? t : historyFilterType,
          user: u !== undefined ? u : historyFilterUser
        }
      })
      setClosingHistory(res.data)
    } catch (err) {
      toast.error('Failed to load closing reports')
    } finally {
      setClosingHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (canViewPosAndReports && dashboardView === 'reports') {
      loadClosingHistory(historyFrom, historyTo, historyFilterBranch, historyFilterType, historyFilterUser)
    }
  }, [dashboardView, historyFrom, historyTo, historyFilterBranch, historyFilterType, historyFilterUser, canViewPosAndReports])

  const computeDailyComparativeData = (shiftsArr, activeCashInput, activeCardInput, closingPreviewOrReport, fallbackCashier) => {
    const night = shiftsArr && shiftsArr.length > 0 ? shiftsArr[0] : null;
    const dayFromShifts = shiftsArr && shiftsArr.length > 1 ? shiftsArr[1] : null;

    const nightCashier = night?.cashier_name || '';
    let dayCashier = dayFromShifts?.cashier_name || '';
    if (!dayCashier && fallbackCashier) {
      dayCashier = fallbackCashier;
    }

    // Night values
    const nightSysCash = parseFloat(night?.cash_sales || 0);
    const nightActCash = night?.closing_cash !== null && night?.closing_cash !== undefined 
      ? parseFloat(night.closing_cash) 
      : (night ? nightSysCash : 0);

    const nightSysCard = parseFloat(night?.card_sales || 0);
    const nightActCard = night?.closing_card !== null && night?.closing_card !== undefined 
      ? parseFloat(night.closing_card) 
      : (night ? nightSysCard : 0);

    const nightSysCredit = parseFloat(night?.credit_sales || 0);
    const nightActCredit = nightSysCredit;

    const nightSysMajor = parseFloat(night?.major_payments || 0);
    const nightActMajor = nightSysMajor;

    const nightCashDiff = nightActCash - nightSysCash;
    const nightCardDiff = nightActCard - nightSysCard;
    const nightDiff = night ? (night.difference !== null && night.difference !== undefined ? parseFloat(night.difference) : (nightCashDiff + nightCardDiff)) : null;

    // Day values
    const totalDailySysCash = parseFloat(closingPreviewOrReport?.cash_sales || 0);
    const totalDailySysCard = parseFloat(closingPreviewOrReport?.card_sales || 0);
    const totalDailySysCredit = parseFloat(closingPreviewOrReport?.credit_sales || 0);
    const totalDailySysMajor = parseFloat(closingPreviewOrReport?.major_payments || 0);

    const daySysCash = dayFromShifts 
      ? parseFloat(dayFromShifts.cash_sales || 0) 
      : Math.max(0, totalDailySysCash - nightSysCash);

    const daySysCard = dayFromShifts 
      ? parseFloat(dayFromShifts.card_sales || 0) 
      : Math.max(0, totalDailySysCard - nightSysCard);

    const daySysCredit = dayFromShifts 
      ? parseFloat(dayFromShifts.credit_sales || 0) 
      : Math.max(0, totalDailySysCredit - nightSysCredit);

    const daySysMajor = dayFromShifts 
      ? parseFloat(dayFromShifts.major_payments || 0) 
      : Math.max(0, totalDailySysMajor - nightSysMajor);

    // Day Actual
    let dayActCash = 0;
    let dayActCard = 0;
    if (dayFromShifts && dayFromShifts.closing_cash !== null && dayFromShifts.closing_cash !== undefined) {
      dayActCash = parseFloat(dayFromShifts.closing_cash);
      dayActCard = parseFloat(dayFromShifts.closing_card !== null && dayFromShifts.closing_card !== undefined ? dayFromShifts.closing_card : (dayFromShifts.card_sales || 0));
    } else if (activeCashInput !== undefined && activeCashInput !== null && activeCashInput !== '') {
      dayActCash = parseFloat(activeCashInput || 0);
      dayActCard = parseFloat(activeCardInput || 0);
    } else if (closingPreviewOrReport?.closing_cash !== null && closingPreviewOrReport?.closing_cash !== undefined) {
      const repClosingCash = parseFloat(closingPreviewOrReport.closing_cash || 0);
      dayActCash = Math.abs(repClosingCash - (nightActCash + daySysCash)) < Math.abs(repClosingCash - daySysCash) 
        ? Math.max(0, repClosingCash - nightActCash) 
        : repClosingCash;
      const repClosingCard = parseFloat(closingPreviewOrReport.closing_card !== null && closingPreviewOrReport.closing_card !== undefined ? closingPreviewOrReport.closing_card : (closingPreviewOrReport.card_sales || 0));
      dayActCard = Math.abs(repClosingCard - (nightActCard + daySysCard)) < Math.abs(repClosingCard - daySysCard) 
        ? Math.max(0, repClosingCard - nightActCard) 
        : repClosingCard;
    } else {
      dayActCash = daySysCash;
      dayActCard = daySysCard;
    }

    const dayActCredit = daySysCredit;
    const dayActMajor = daySysMajor;

    const dayCashDiff = dayActCash - daySysCash;
    const dayCardDiff = dayActCard - daySysCard;
    const dayDiff = (dayFromShifts && dayFromShifts.difference !== null && dayFromShifts.difference !== undefined)
      ? parseFloat(dayFromShifts.difference)
      : (dayCashDiff + dayCardDiff);

    // Totals
    const totalSysCash = nightSysCash + daySysCash;
    const totalActCash = nightActCash + dayActCash;

    const totalSysCard = nightSysCard + daySysCard;
    const totalActCard = nightActCard + dayActCard;

    const totalSysCredit = nightSysCredit + daySysCredit;
    const totalActCredit = nightActCredit + dayActCredit;

    const totalSysMajor = nightSysMajor + daySysMajor;
    const totalActMajor = nightActMajor + dayActMajor;

    const totalCashDiff = totalActCash - totalSysCash;
    const totalCardDiff = totalActCard - totalSysCard;
    const totalDiff = (nightDiff !== null ? nightDiff : 0) + dayDiff;

    return {
      nightCashier,
      dayCashier,
      nightSysCash, nightActCash, daySysCash, dayActCash, totalSysCash, totalActCash,
      nightSysCard, nightActCard, daySysCard, dayActCard, totalSysCard, totalActCard,
      nightSysCredit, nightActCredit, daySysCredit, dayActCredit, totalSysCredit, totalActCredit,
      nightSysMajor, nightActMajor, daySysMajor, dayActMajor, totalSysMajor, totalActMajor,
      nightDiff, dayDiff, totalDiff,
      totalCashDiff, totalCardDiff
    };
  };

  const renderComparativeDailyTable = (compData) => {
    const fmt = (v) => (v !== null && v !== undefined && !isNaN(v) ? parseFloat(v).toFixed(2) : '0.00');
    const fmtDiff = (d) => {
      if (d === null || d === undefined || isNaN(d)) return '-';
      if (Math.abs(d) < 0.005) return '0.00';
      return d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2);
    };
    const diffColor = (d) => {
      if (d === null || d === undefined || isNaN(d) || Math.abs(d) < 0.005) return '#0f172a';
      return d < 0 ? '#b91c1c' : '#15803d';
    };

    return (
      <div style={{
        background: '#ffffff',
        border: '1.5px solid #cbd5e1',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        <div style={{
          background: '#f8fafc',
          padding: '8px 12px',
          borderBottom: '1.5px solid #cbd5e1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <strong style={{ fontSize: 13, color: '#0f172a' }}>
            Daily summary: day + night
          </strong>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #cbd5e1' }}>
                <th style={{ padding: '8px 8px', textAlign: 'left', fontWeight: 700, background: '#f8fafc' }}></th>
                
                {/* Night Columns Header (Cool Indigo / Night Theme) */}
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, background: '#e0e7ff', color: '#312e81', borderLeft: '2px solid #cbd5e1', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, whiteSpace: 'nowrap' }}>
                    <span>🌙</span> <span>Night</span>
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#4338ca', whiteSpace: 'nowrap' }}>System</div>
                  {compData.nightCashier && <div style={{ fontSize: 9.5, fontWeight: 600, color: '#6366f1', whiteSpace: 'nowrap' }}>{compData.nightCashier}</div>}
                </th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, background: '#e0e7ff', color: '#1e1b4b', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, whiteSpace: 'nowrap' }}>
                    <span>🌙</span> <span>Night</span>
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#312e81', whiteSpace: 'nowrap' }}>Actual</div>
                  {compData.nightCashier && <div style={{ fontSize: 9.5, fontWeight: 600, color: '#6366f1', whiteSpace: 'nowrap' }}>{compData.nightCashier}</div>}
                </th>

                {/* Day Columns Header (Warm Amber / Daylight Theme) */}
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, background: '#fef3c7', color: '#92400e', borderLeft: '2px solid #fed7aa', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, whiteSpace: 'nowrap' }}>
                    <span>☀️</span> <span>Day</span>
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>System</div>
                  {compData.dayCashier && <div style={{ fontSize: 9.5, fontWeight: 600, color: '#d97706', whiteSpace: 'nowrap' }}>{compData.dayCashier}</div>}
                </th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, background: '#fef3c7', color: '#78350f', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, whiteSpace: 'nowrap' }}>
                    <span>☀️</span> <span>Day</span>
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e', whiteSpace: 'nowrap' }}>Actual</div>
                  {compData.dayCashier && <div style={{ fontSize: 9.5, fontWeight: 600, color: '#d97706', whiteSpace: 'nowrap' }}>{compData.dayCashier}</div>}
                </th>

                {/* Total Columns Header (Slate Summary Theme) */}
                <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 900, background: '#f1f5f9', color: '#0f172a', borderLeft: '2px solid #cbd5e1', whiteSpace: 'nowrap' }}>
                  <div style={{ whiteSpace: 'nowrap' }}>Total</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>System</div>
                </th>
                <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 900, background: '#f1f5f9', color: '#0f172a', whiteSpace: 'nowrap' }}>
                  <div style={{ whiteSpace: 'nowrap' }}>Total</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Actual</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Cash sale */}
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '7px 10px', color: '#1e293b', fontWeight: 700, background: '#ffffff' }}>Cash sale</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#334155', background: '#f5f7ff', borderLeft: '2px solid #e0e7ff' }}>{fmt(compData.nightSysCash)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#1e293b', fontWeight: 600, background: '#f5f7ff' }}>{fmt(compData.nightActCash)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#334155', background: '#fffdf5', borderLeft: '2px solid #fed7aa' }}>{fmt(compData.daySysCash)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#1e293b', fontWeight: 600, background: '#fffdf5' }}>{fmt(compData.dayActCash)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a', background: '#f8fafc', borderLeft: '2px solid #cbd5e1' }}>{fmt(compData.totalSysCash)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, color: '#0f172a', background: '#f8fafc' }}>{fmt(compData.totalActCash)}</td>
              </tr>

              {/* Card / Bank sale */}
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '7px 10px', color: '#1e293b', fontWeight: 700, background: '#ffffff' }}>Card / Bank sale</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#334155', background: '#f5f7ff', borderLeft: '2px solid #e0e7ff' }}>{fmt(compData.nightSysCard)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#1e293b', fontWeight: 600, background: '#f5f7ff' }}>{fmt(compData.nightActCard)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#334155', background: '#fffdf5', borderLeft: '2px solid #fed7aa' }}>{fmt(compData.daySysCard)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#1e293b', fontWeight: 600, background: '#fffdf5' }}>{fmt(compData.dayActCard)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a', background: '#f8fafc', borderLeft: '2px solid #cbd5e1' }}>{fmt(compData.totalSysCard)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, color: '#0f172a', background: '#f8fafc' }}>{fmt(compData.totalActCard)}</td>
              </tr>

              {/* Credit sale */}
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '7px 10px', color: '#1e293b', fontWeight: 700, background: '#ffffff' }}>Credit sale</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#334155', background: '#f5f7ff', borderLeft: '2px solid #e0e7ff' }}>{fmt(compData.nightSysCredit)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#1e293b', background: '#f5f7ff' }}>{fmt(compData.nightActCredit)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#334155', background: '#fffdf5', borderLeft: '2px solid #fed7aa' }}>{fmt(compData.daySysCredit)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#1e293b', background: '#fffdf5' }}>{fmt(compData.dayActCredit)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a', background: '#f8fafc', borderLeft: '2px solid #cbd5e1' }}>{fmt(compData.totalSysCredit)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, color: '#0f172a', background: '#f8fafc' }}>{fmt(compData.totalActCredit)}</td>
              </tr>

              {/* Major Payments */}
              <tr style={{ borderBottom: '1.5px solid #cbd5e1' }}>
                <td style={{ padding: '7px 10px', color: '#1e293b', fontWeight: 700, background: '#ffffff' }}>Major Payments</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#334155', background: '#f5f7ff', borderLeft: '2px solid #e0e7ff' }}>{fmt(compData.nightSysMajor)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#1e293b', fontWeight: 600, background: '#f5f7ff' }}>{fmt(compData.nightActMajor)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#334155', background: '#fffdf5', borderLeft: '2px solid #fed7aa' }}>{fmt(compData.daySysMajor)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#1e293b', fontWeight: 600, background: '#fffdf5' }}>{fmt(compData.dayActMajor)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a', background: '#f8fafc', borderLeft: '2px solid #cbd5e1' }}>{fmt(compData.totalSysMajor)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, color: '#0f172a', background: '#f8fafc' }}>{fmt(compData.totalActMajor)}</td>
              </tr>

              {/* Difference Row: System columns empty, Actual columns have diff */}
              <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                <td style={{ padding: '8px 10px', color: '#0f172a', background: '#ffffff' }}>Difference</td>
                <td style={{ padding: '8px 8px', textAlign: 'right', background: '#f5f7ff', borderLeft: '2px solid #e0e7ff' }}></td>
                <td style={{ padding: '8px 8px', textAlign: 'right', color: diffColor(compData.nightDiff), background: '#f5f7ff' }}>
                  {fmtDiff(compData.nightDiff)}
                </td>
                <td style={{ padding: '8px 8px', textAlign: 'right', background: '#fffdf5', borderLeft: '2px solid #fed7aa' }}></td>
                <td style={{ padding: '8px 8px', textAlign: 'right', color: diffColor(compData.dayDiff), background: '#fffdf5' }}>
                  {fmtDiff(compData.dayDiff)}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', background: '#f8fafc', borderLeft: '2px solid #cbd5e1' }}></td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, color: diffColor(compData.totalDiff), background: '#f8fafc' }}>
                  {fmtDiff(compData.totalDiff)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Difference Breakdown Footer */}
        <div style={{
          background: '#f8fafc',
          padding: '6px 12px',
          borderTop: '1px solid #e2e8f0',
          fontSize: 11,
          color: '#64748b',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8
        }}>
          <span>Cash Diff: <strong style={{ color: diffColor(compData.totalCashDiff) }}>{fmtDiff(compData.totalCashDiff)}</strong></span>
          <span>•</span>
          <span>Card Diff: <strong style={{ color: diffColor(compData.totalCardDiff) }}>{fmtDiff(compData.totalCardDiff)}</strong></span>
          <span>•</span>
          <span>Total Diff: <strong style={{ color: diffColor(compData.totalDiff) }}>{fmtDiff(compData.totalDiff)}</strong></span>
        </div>
      </div>
    );
  };

  const printClosingReport = (report) => {
    const fmtTime = (ts) => ts ? formatSaudiTime(ts) : '-'
    const fmtDate = (ts) => ts ? formatSaudiDate(ts) : '-'
    let items = []
    try {
      items = Array.isArray(report.items_summary) ? report.items_summary : JSON.parse(report.items_summary || '[]')
    } catch (e) { items = [] }

    // Top 5 selling items
    let allFlat = []
    items.forEach(cat => {
      if (cat.items && Array.isArray(cat.items)) {
        cat.items.forEach(it => {
          allFlat.push({
            name: it.name,
            qty: parseInt(it.qty, 10) || 0,
            totalPrice: parseFloat(it.amount !== undefined ? it.amount : (it.price * it.qty) || 0)
          })
        })
      }
    })
    let sortedTop5 = []
    if (allFlat.length > 0) {
      const grouped = {}
      allFlat.forEach(it => {
        if (!grouped[it.name]) grouped[it.name] = { name: it.name, qty: 0, totalPrice: 0 }
        grouped[it.name].qty += it.qty
        grouped[it.name].totalPrice += it.totalPrice
      })
      sortedTop5 = Object.values(grouped).sort((a, b) => b.qty - a.qty).slice(0, 5)
    }

    // Top items by 2-hour intervals
    let intervalsObj = {}
    try {
      intervalsObj = typeof report.interval_items === 'string'
        ? JSON.parse(report.interval_items || '{}')
        : (report.interval_items || {})
    } catch(e) { intervalsObj = {} }

    let intervalRows = []
    if (intervalsObj && Object.keys(intervalsObj).length > 0 && report.login_time) {
      const loginDate = new Date(report.login_time)
      let maxIndex = 0
      for (const key of Object.keys(intervalsObj)) {
        if (parseInt(key) > maxIndex) maxIndex = parseInt(key)
      }
      for (let i = 0; i <= maxIndex; i++) {
        const blockStartTime = new Date(loginDate.getTime() + i * 2 * 3600000)
        const blockEndTime = new Date(loginDate.getTime() + (i + 1) * 2 * 3600000)
        const startTimeStr = blockStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const endTimeStr = blockEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const itemsInBlock = intervalsObj[i] || []
        intervalRows.push({
          timeWindow: `${startTimeStr} - ${endTimeStr}`,
          items: itemsInBlock
        })
      }
    }

    const diffVal = parseFloat(report.difference || 0)
    const hasDiff = !isNaN(diffVal) && Math.abs(diffVal) >= 0.01
    const diffSign = diffVal < 0 ? '-' : '+'
    const diffLabel = diffVal < 0 ? 'SHORTAGE / کم' : 'EXCESS / زیادہ'

    let shiftsArr = []
    if (report.closing_type === 'Daily') {
      if (typeof report.shifts_summary === 'string') {
        try { shiftsArr = JSON.parse(report.shifts_summary) } catch(e) { shiftsArr = [] }
      } else if (Array.isArray(report.shifts_summary)) {
        shiftsArr = report.shifts_summary
      }
    }

    const printWindow = window.open('', '', 'width=500,height=700')
    const html = `
      <html><head><title>${report.closing_type} Closing Report</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        @media print {
          html, body {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 2mm 3mm !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
          }
          * {
            page-break-inside: avoid;
            break-inside: avoid;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        * {
          box-sizing: border-box;
          color: #000 !important;
        }
        body {
          font-family: 'Courier New', Courier, monospace;
          padding: 4px 6px;
          max-width: 300px;
          margin: 0 auto;
          font-size: 11.5px;
          line-height: 1.3;
          color: #000 !important;
          font-weight: 600;
          -webkit-font-smoothing: antialiased;
        }
        h2 {
          text-align: center;
          font-size: 14.5px;
          font-weight: 900;
          margin: 0 0 3px;
          color: #000 !important;
          letter-spacing: 0.5px;
        }
        .center { text-align: center; }
        .divider { border-top: 1.5px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11.5px; font-weight: 600; color: #000 !important; }
        .label { color: #000 !important; font-weight: 600; }
        .bold { font-weight: bold; color: #000 !important; }
        .highlight { color: #000 !important; font-weight: 900; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 2px; color: #000 !important; }
        th { text-align: left; border-bottom: 1.5px solid #000; padding: 2px 0; font-size: 10.5px; color: #000 !important; font-weight: bold; }
        td { padding: 2px 0; font-size: 11px; color: #000 !important; font-weight: 600; }
        td:last-child { text-align: right; }
      </style></head><body>
      <h2>${report.closing_type === 'Daily' ? '⚡ DAILY CLOSING REPORT' : '🔄 SHIFT CLOSING REPORT'}</h2>
      <p class="center" style="font-weight:bold;font-size:11px;margin:0 0 4px">${fmtDate(report.login_time)}</p>

      ${hasDiff ? `
        <div style="border: 2px solid #000; padding: 4px 6px; border-radius: 4px; text-align: center; margin: 3px 0 5px; font-weight: bold;">
          <div style="font-size: 11.5px; letter-spacing: 0.5px;">DIFFERENCE: ${diffSign}${CURRENCY}${Math.abs(diffVal).toFixed(2)} (${diffLabel})</div>
          ${report.difference_reason ? `<div style="font-size: 10.5px; margin-top: 2px; border-top: 1.5px dashed #000; padding-top: 2px; text-align: left; font-weight: 600;">Reason: ${report.difference_reason}</div>` : ''}
        </div>
      ` : ''}

      ${report.closing_type === 'Daily' ? (() => {
        const compData = computeDailyComparativeData(shiftsArr, null, null, report, report.cashier_name || 'Cashier');
        const fmt = (v) => (v !== null && v !== undefined && !isNaN(v) ? parseFloat(v).toFixed(2) : '0.00');
        const fmtDiff = (d) => {
          if (d === null || d === undefined || isNaN(d)) return '-';
          if (Math.abs(d) < 0.005) return '0.00';
          return d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2);
        };

        return `
          <div style="border: 2px solid #000; border-radius: 4px; padding: 4px 5px; margin: 4px 0;">
            <div style="font-weight: 900; text-align: center; font-size: 11.5px; border-bottom: 1.5px solid #000; padding-bottom: 3px; margin-bottom: 4px; text-transform: uppercase;">
              DAILY SUMMARY: DAY + NIGHT
            </div>

            <!-- 1. NIGHT SHIFT -->
            <div style="border: 1.5px solid #000; border-radius: 3px; padding: 3px 4px; margin-bottom: 4px;">
              <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 11px; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 2px;">
                <span>🌙 NIGHT SHIFT</span>
                <span>${compData.nightCashier ? compData.nightCashier : ''}</span>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; margin: 0;">
                <thead>
                  <tr style="border-bottom: 1.5px dashed #000; font-size: 10px; font-weight: bold;">
                    <th style="text-align: left; padding: 1px 0;">Item</th>
                    <th style="text-align: right; padding: 1px 0; width: 30%;">Sys</th>
                    <th style="text-align: right; padding: 1px 0; width: 30%;">Act</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 600;">Cash sale</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.nightSysCash)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.nightActCash)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 600;">Card sale</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.nightSysCard)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.nightActCard)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 600;">Credit sale</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.nightSysCredit)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.nightActCredit)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 600;">Major Payments</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.nightSysMajor)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.nightActMajor)}</td>
                  </tr>
                  <tr style="border-top: 1.5px dashed #000; font-weight: 900;">
                    <td style="padding: 2px 0;">Night Diff</td>
                    <td colspan="2" style="text-align: right; padding: 2px 0; font-size: 11px;">
                      ${fmtDiff(compData.nightDiff)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 2. DAY SHIFT -->
            <div style="border: 1.5px solid #000; border-radius: 3px; padding: 3px 4px; margin-bottom: 4px;">
              <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 11px; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 2px;">
                <span>☀️ DAY SHIFT</span>
                <span>${compData.dayCashier ? compData.dayCashier : ''}</span>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; margin: 0;">
                <thead>
                  <tr style="border-bottom: 1.5px dashed #000; font-size: 10px; font-weight: bold;">
                    <th style="text-align: left; padding: 1px 0;">Item</th>
                    <th style="text-align: right; padding: 1px 0; width: 30%;">Sys</th>
                    <th style="text-align: right; padding: 1px 0; width: 30%;">Act</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 600;">Cash sale</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.daySysCash)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.dayActCash)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 600;">Card sale</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.daySysCard)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.dayActCard)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 600;">Credit sale</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.daySysCredit)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.dayActCredit)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 600;">Major Payments</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.daySysMajor)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 600;">${fmt(compData.dayActMajor)}</td>
                  </tr>
                  <tr style="border-top: 1.5px dashed #000; font-weight: 900;">
                    <td style="padding: 2px 0;">Day Diff</td>
                    <td colspan="2" style="text-align: right; padding: 2px 0; font-size: 11px;">
                      ${fmtDiff(compData.dayDiff)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 3. TOTAL COMBINED -->
            <div style="border: 2px solid #000; border-radius: 3px; padding: 3px 4px;">
              <div style="font-weight: 900; font-size: 11px; text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 2px; text-transform: uppercase;">
                ⚡ TOTAL COMBINED (DAY + NIGHT)
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; margin: 0;">
                <thead>
                  <tr style="border-bottom: 1.5px dashed #000; font-size: 10px; font-weight: 900;">
                    <th style="text-align: left; padding: 1px 0;">Item</th>
                    <th style="text-align: right; padding: 1px 0; width: 30%; font-weight: 900;">Tot Sys</th>
                    <th style="text-align: right; padding: 1px 0; width: 30%; font-weight: 900;">Tot Act</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 900;">Cash sale</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 900;">${fmt(compData.totalSysCash)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 900;">${fmt(compData.totalActCash)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 900;">Card sale</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 900;">${fmt(compData.totalSysCard)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 900;">${fmt(compData.totalActCard)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 1.5px 0; font-weight: 900;">Credit sale</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 900;">${fmt(compData.totalSysCredit)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 900;">${fmt(compData.totalActCredit)}</td>
                  </tr>
                  <tr style="border-bottom: 1.5px solid #000;">
                    <td style="padding: 1.5px 0; font-weight: 900;">Major Payments</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 900;">${fmt(compData.totalSysMajor)}</td>
                    <td style="text-align: right; padding: 1.5px 0; font-weight: 900;">${fmt(compData.totalActMajor)}</td>
                  </tr>
                  <tr style="font-weight: 900;">
                    <td style="padding: 2px 0;">Total Diff</td>
                    <td colspan="2" style="text-align: right; padding: 2px 0; font-size: 11.5px;">
                      ${fmtDiff(compData.totalDiff)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style="margin-top: 2px; border-top: 1.5px dashed #000; padding-top: 2px; font-size: 9.5px; text-align: right; font-weight: 900;">
                Cash Diff: ${fmtDiff(compData.totalCashDiff)} | Card Diff: ${fmtDiff(compData.totalCardDiff)}
              </div>
            </div>
          </div>
        `;
      })() : ''}

      <div class="divider"></div>
      <div class="row"><span class="label">Cashier:</span><span class="bold">${report.cashier_name}</span></div>
      <div class="row"><span class="label">Branch:</span><span class="bold">${report.branch}</span></div>
      <div class="row"><span class="label">Active Time:</span><span class="bold">${fmtTime(report.login_time)} - ${fmtTime(report.logout_time)} (${report.total_active_time})</span></div>
      <div class="row"><span class="label">Total Orders:</span><span class="bold">${report.total_orders}</span></div>

      ${report.closing_type !== 'Daily' ? `
        <div class="divider"></div>
        <div class="row"><span class="label">Total Sales:</span><span class="highlight">${CURRENCY}${parseFloat(report.total_sales || 0).toFixed(2)}</span></div>
        <div class="row"><span class="label" style="font-size: 10.5px; padding-left: 8px;">↳ Cash:</span><span class="bold">${CURRENCY}${parseFloat(report.cash_sales || 0).toFixed(2)}</span></div>
        <div class="row"><span class="label" style="font-size: 10.5px; padding-left: 8px;">↳ Card:</span><span class="bold">${CURRENCY}${parseFloat(report.card_sales || 0).toFixed(2)}</span></div>
        <div class="row"><span class="label" style="font-size: 10.5px; padding-left: 8px;">↳ Credit:</span><span class="bold">${CURRENCY}${parseFloat(report.credit_sales || 0).toFixed(2)}</span></div>
        <div class="row"><span class="label">Major Payments:</span><span class="bold">${CURRENCY}${parseFloat(report.major_payments || 0).toFixed(2)}</span></div>
        <div class="row" style="font-weight: 900;"><span class="label bold">Total Received:</span><span>${CURRENCY}${(parseFloat(report.cash_sales || 0) + parseFloat(report.card_sales || 0) + parseFloat(report.major_payments || 0)).toFixed(2)}</span></div>
      ` : ''}

      <div class="divider"></div>
      ${parseFloat(report.opening_cash || 0) > 0 ? `<div class="row"><span class="label">Opening Drawer:</span><span class="bold">${CURRENCY}${parseFloat(report.opening_cash).toFixed(2)}</span></div>` : ''}
      <div class="row"><span class="label">Cash Counted:</span><span class="bold">${CURRENCY}${parseFloat(report.closing_cash || 0).toFixed(2)}</span></div>
      <div class="row"><span class="label">Card Counted:</span><span class="bold">+ ${CURRENCY}${parseFloat(report.closing_card !== null && report.closing_card !== undefined ? report.closing_card : (report.card_sales || 0)).toFixed(2)}</span></div>
      <div class="row" style="font-weight: 900;"><span class="label bold">Total Counted:</span><span>= ${CURRENCY}${(parseFloat(report.closing_cash || 0) + parseFloat(report.closing_card !== null && report.closing_card !== undefined ? report.closing_card : (report.card_sales || 0))).toFixed(2)}</span></div>

      ${report.closing_type !== 'Daily' && hasDiff ? `
        <div class="row" style="font-weight: 900;"><span class="label bold">Difference:</span><span>${diffSign}${CURRENCY}${Math.abs(diffVal).toFixed(2)}</span></div>
        ${report.cash_difference !== null && report.cash_difference !== undefined ? `<div class="row" style="font-size: 10.5px; font-weight: 600;"><span class="label">↳ Cash Diff:</span><span>${parseFloat(report.cash_difference) < 0 ? '-' : '+'}${CURRENCY}${Math.abs(parseFloat(report.cash_difference)).toFixed(2)}</span></div>` : ''}
        ${report.card_difference !== null && report.card_difference !== undefined ? `<div class="row" style="font-size: 10.5px; font-weight: 600;"><span class="label">↳ Card Diff:</span><span>${parseFloat(report.card_difference) < 0 ? '-' : '+'}${CURRENCY}${Math.abs(parseFloat(report.card_difference)).toFixed(2)}</span></div>` : ''}
        ${report.difference_reason ? `<div class="row" style="font-size: 10.5px; font-weight: 600;"><span class="label">Diff Reason:</span><span>${report.difference_reason}</span></div>` : ''}
      ` : ''}

      ${items && items.length > 0 ? `
        <div class="divider"></div>
        <p style="font-weight:900;margin:3px 0 2px;font-size:11.5px;">Sales by Category:</p>
        <table>
          <thead><tr><th style="border-bottom:1.5px solid #000;font-weight:bold;">Category</th><th style="text-align:center;border-bottom:1.5px solid #000;font-weight:bold;">Qty</th><th style="border-bottom:1.5px solid #000;font-weight:bold;">Amount</th></tr></thead>
          <tbody>
            ${items.map(i => `
              <tr style="border-bottom: 1.5px dashed #000; font-weight: 600;">
                <td style="padding: 2px 0;">${i.category}</td>
                <td style="text-align:center; padding: 2px 0;">${i.qty}</td>
                <td style="padding: 2px 0;">${CURRENCY}${parseFloat(i.amount || 0).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

      <div class="divider"></div>
      <p class="center" style="font-size:10.5px;font-weight:bold;margin:4px 0 0">Generated: ${formatSaudiDateTime(new Date())}</p>
    </body></html>`
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300)
  }

  // Attendance states (all users see these stats)
  const [attendanceStats, setAttendanceStats] = useState(null)
  const [todayActivity, setTodayActivity] = useState([])
  const [allEmployees, setAllEmployees] = useState([])
  const [analyticsData, setAnalyticsData] = useState(null)
  const [timeRange, setTimeRange] = useState('weekly')
  const [loading, setLoading] = useState(true)
  const [personalStats, setPersonalStats] = useState(null)
  const [salesSelectedBranch, setSalesSelectedBranch] = useState('All')
  const [salesSelectedClosing, setSalesSelectedClosing] = useState('current')
  const [pastClosings, setPastClosings] = useState([])
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState('')
  const [attendanceSelectedDayNight, setAttendanceSelectedDayNight] = useState('All')
  const [attendanceSelectedStatus, setAttendanceSelectedStatus] = useState('All')
  const [attendanceSelectedBranch, setAttendanceSelectedBranch] = useState('All')
  const [showAttendanceTable, setShowAttendanceTable] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [showTopItemsFilter, setShowTopItemsFilter] = useState(false)
  const [topItemsFromDate, setTopItemsFromDate] = useState('')
  const [topItemsToDate, setTopItemsToDate] = useState('')
  const [topItemsData, setTopItemsData] = useState([])
  const topItemsFilterRef = useRef(null)

  const loadStats = () => {
    setLoading(true)

    if (user?.role?.toLowerCase() === 'employee') {
      axios.get('/api/attendance/personal-stats')
        .then(r => setPersonalStats(r.data))
        .catch(() => setPersonalStats(null))
        .finally(() => setLoading(false))
      return;
    }

    // Fetch sales stats if user is developer, admin, or management
    if (canViewPosAndReports) {
      const statsParams = { branch: salesSelectedBranch }
      if (salesSelectedClosing !== 'current') {
        statsParams.closing_id = salesSelectedClosing
      }
      
      axios.get('/api/stats', { params: statsParams })
        .then(r => setStats(r.data))
        .catch(() => setStats({
          totalSale: 0, cashSale: 0, cardSale: 0, creditSale: 0, majorPayment: 0, dailyRevenue: 0, totalProductCost: 0, totalOrders: 0, guestsToday: 0,
          last7Days: Array.from({ length: 7 }, (_, i) => ({ label: `Day ${i + 1}`, total: 0 })),
          topItems: [],
        }))
        
      // Fetch today's closings for filter dropdown
      axios.get('/api/orders/closings', { params: { date: getSaudiTodayDate(), branch: salesSelectedBranch } })
        .then(r => setPastClosings(r.data))
        .catch(() => setPastClosings([]))
    }

    // Fetch attendance statistics
    axios.get('/api/attendance/stats')
      .then(r => setAttendanceStats(r.data))
      .catch(() => setAttendanceStats(null))

    // Fetch today's live check-ins activity
    axios.get('/api/attendance/today')
      .then(r => setTodayActivity(r.data))
      .catch(() => setTodayActivity([]))

    // Fetch analytics rates
    axios.get('/api/attendance/analytics')
      .then(r => setAnalyticsData(r.data))
      .catch(() => setAnalyticsData(null))

    // Fetch all employees to match absents list
    axios.get('/api/employees')
      .then(r => setAllEmployees(r.data))
      .catch(() => {
        const cached = localStorage.getItem('pizza_shop_employees')
        if (cached) setAllEmployees(JSON.parse(cached))
      })
      .finally(() => setLoading(false))
  }

  const loadTopItems = () => {
    if (!canViewPosAndReports) return;
    axios.get('/api/stats/top-items', { params: { branch: salesSelectedBranch, from_date: topItemsFromDate, to_date: topItemsToDate } })
      .then(r => setTopItemsData(r.data))
      .catch(() => setTopItemsData([]))
  }

  useEffect(() => {
    loadTopItems()
  }, [salesSelectedBranch, topItemsFromDate, topItemsToDate, canViewPosAndReports])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (topItemsFilterRef.current && !topItemsFilterRef.current.contains(event.target)) {
        setShowTopItemsFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 300000) // Auto-refresh every 5 mins
    
    // Real-time socket events
    const handleOrderEvent = () => loadStats();
    socket.on('newOrder', handleOrderEvent);
    socket.on('orderUpdated', handleOrderEvent);

    return () => {
      clearInterval(interval)
      if (socket) {
        socket.off('newOrder', handleOrderEvent)
        socket.off('orderUpdated', handleOrderEvent)
      }
    }
  }, [user, navigate, isAdminOrDev, canViewPosAndReports, salesSelectedBranch, salesSelectedClosing])

  const exportExcel = async () => {
    if (!canViewPosAndReports) return
    const XLSX = await import('xlsx')
    const data = [
      { Metric: "Today Total Sale", Value: stats?.totalSale || 0 },
      { Metric: "Cash Sale", Value: stats?.cashSale || 0 },
      { Metric: "Card Sale", Value: stats?.cardSale || 0 },
      { Metric: "Total Orders Complete", Value: stats?.totalOrders || 0 },
      { Metric: "Total Production Cost", Value: stats?.totalProductCost || 0 },
      { Metric: "Total Revenue Earned", Value: stats?.dailyRevenue || 0 },
      { Metric: "Targeted Revenue", Value: targetRevenue },
      { Metric: "Completion Revenue %", Value: stats ? `${((stats.dailyRevenue / targetRevenue) * 100).toFixed(1)}%` : "0%" },
    ]
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard Stats")
    XLSX.writeFile(wb, `Dashboard-Summary-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const exportPDF = () => {
    if (!canViewPosAndReports) return
    const printWindow = window.open('', '', 'width=800,height=600');
    const html = `
      <html>
        <head>
          <title>Dashboard Summary Report</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            h1 { color: ${BRAND_PRIMARY}; border-bottom: 3px solid ${BRAND_SECONDARY}; padding-bottom: 12px; margin-bottom: 4px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; }
            .card { border: 1px solid #eee; padding: 20px; border-radius: 8px; background: #fdfdfd; }
            .label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
            .value { font-size: 24px; font-weight: bold; }
            .footer { margin-top: 50px; font-size: 12px; color: #999; text-align: center; }
          </style>
        </head>
        <body>
          <h1>${BRAND_NAME} — Dashboard Summary</h1>
          <p>Generated on ${new Date().toLocaleString()}</p>
          <div class="grid">
            <div class="card"><div class="label">Today Total Sale</div><div class="value">${CURRENCY}${stats?.totalSale?.toLocaleString()}</div>
              <div style="font-size: 11px; margin-top: 6px; color: #555;">Cash: ${CURRENCY}${stats?.cashSale?.toLocaleString()} | Card: ${CURRENCY}${stats?.cardSale?.toLocaleString()}</div>
            </div>
            <div class="card"><div class="label">Total Orders Complete</div><div class="value">${stats?.totalOrders}</div></div>
            <div class="card"><div class="label">Total Production Cost</div><div class="value">${CURRENCY}${stats?.totalProductCost?.toLocaleString()}</div></div>
            <div class="card"><div class="label">Total Revenue Earned</div><div class="value">${CURRENCY}${stats?.dailyRevenue?.toLocaleString()}</div></div>
            <div class="card"><div class="label">Targeted Revenue</div><div class="value">${CURRENCY}${targetRevenue.toLocaleString()}</div></div>
            <div class="card"><div class="label">Completion Revenue %</div><div class="value">${stats ? ((stats.dailyRevenue / targetRevenue) * 100).toFixed(1) : 0}%</div></div>
          </div>
          <div class="footer">Confidential Financial Report</div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  }

  const lineData = {
    labels: stats?.last7Days?.map(d => d.label) ?? [],
    datasets: [{
      label: `Sales (${CURRENCY})`,
      data: stats?.last7Days?.map(d => d.total) ?? [],
      borderColor: BRAND_PRIMARY,
      backgroundColor: `${BRAND_PRIMARY}15`,
      borderWidth: 2.5,
      pointBackgroundColor: BRAND_PRIMARY,
      pointRadius: 5,
      pointHoverRadius: 7,
      fill: true,
      tension: 0.4,
    }],
  }

  const lineOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true,
        ticks: { callback: v => `${CURRENCY}${v}` }
      },
    },
  }

  const topItemsBarData = {
    labels: topItemsData?.map(f => f.name) ?? [],
    datasets: [{
      label: 'Quantity Sold',
      data: topItemsData?.map(f => f.value) ?? [],
      backgroundColor: PALETTE,
      borderRadius: 4,
    }],
  }

  const topItemsBarOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { padding: 12 } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 45 } },
      y: { grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true }
    }
  }

  // --- DEVELOPER & MANAGEMENT DASHBOARD VIEW ---
  if (canViewPosAndReports && dashboardView === 'pos') {
    return (
      <>
        {/* POS Header with Toggle */}
        <div style={{ marginBottom: 24, marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ paddingLeft: '8px' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Good evening, {user?.username} 👋</h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Sales & Point of Sale Dashboard</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {canViewPosAndReports && (
              <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 4 }}>
                <button 
                  onClick={() => setDashboardView('attendance')}
                  style={{
                    padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                    background: dashboardView === 'attendance' ? 'var(--surface)' : 'transparent',
                    color: dashboardView === 'attendance' ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: dashboardView === 'attendance' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}>
                  Attendance
                </button>
                <button 
                  onClick={() => setDashboardView('pos')}
                  style={{
                    padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                    background: dashboardView === 'pos' ? 'var(--surface)' : 'transparent',
                    color: dashboardView === 'pos' ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: dashboardView === 'pos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}>
                  Sales & POS
                </button>
                <button 
                  onClick={() => setDashboardView('reports')}
                  style={{
                    padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                    background: dashboardView === 'reports' ? 'var(--surface)' : 'transparent',
                    color: dashboardView === 'reports' ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: dashboardView === 'reports' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}>
                  Reports
                </button>
              </div>
            )}
            {canViewPosAndReports && dashboardView === 'pos' && (
              <>
                <select
                  value={salesSelectedBranch}
                  onChange={e => {
                    setSalesSelectedBranch(e.target.value);
                    setSalesSelectedClosing('current');
                  }}
                  style={{ padding: '6px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', height: 38 }}
                >
                  <option value="All">All Branches</option>
                  <option value="Branch 1">Branch 1</option>
                  <option value="Branch 2">Branch 2</option>
                  <option value="Branch 3">Branch 3</option>
                </select>
                <select
                  value={salesSelectedClosing}
                  onChange={e => setSalesSelectedClosing(e.target.value)}
                  style={{ padding: '6px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', height: 38, maxWidth: 200 }}
                >
                  <option value="current">All Live</option>
                  {pastClosings.map(c => (
                    <option key={c.id} value={c.id}>
                      [{c.closing_type}] {c.cashier_name} {String(c.id).startsWith('live_') ? '' : `(#${c.id})`}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button className="btn btn-secondary btn-sm" onClick={loadStats} disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, padding: 0 }} title="Refresh">
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stat-cards">
          {statCards.map(s => (
            <StatCard key={s.key} stat={s} value={stats?.[s.key]} loading={loading} />
          ))}
          {isAdminOrDev && payrollStatCards.map(s => (
            <StatCard key={s.key} stat={s} value={stats?.payrollStats?.[s.key]} loading={loading} />
          ))}
        </div>

        {/* Charts */}
        <div className="charts-grid">
          <div className="chart-card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={20} color="var(--red)" /> Sales — Last 7 Days</h3>
            <div style={{ height: 280 }}>
              {loading
                ? <div className="skeleton" style={{ height: '100%' }} />
                : <Line data={lineData} options={lineOpts} />
              }
            </div>
          </div>
          <div className="chart-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><Flame size={20} color="#FF6B35" fill="#FF6B35" /> Top Selling Items</h3>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(topItemsFromDate || topItemsToDate) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255, 107, 53, 0.1)', color: 'var(--orange)', padding: '4px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    {topItemsFromDate || '...'} to {topItemsToDate || '...'}
                    <div 
                      onClick={() => { setTopItemsFromDate(''); setTopItemsToDate(''); setShowTopItemsFilter(false); }} 
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 107, 53, 0.2)', borderRadius: '50%', width: 16, height: 16, fontSize: 10 }}
                      title="Clear Filter"
                    >
                      ✕
                    </div>
                  </div>
                )}

                <div style={{ position: 'relative' }} ref={topItemsFilterRef}>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => setShowTopItemsFilter(!showTopItemsFilter)} 
                    style={{ 
                      padding: '6px', 
                      background: (topItemsFromDate || topItemsToDate) ? 'rgba(255, 107, 53, 0.1)' : 'transparent',
                      borderColor: (topItemsFromDate || topItemsToDate) ? 'var(--orange)' : 'var(--border)',
                      color: (topItemsFromDate || topItemsToDate) ? 'var(--orange)' : 'var(--text-muted)'
                    }} 
                    title="Filter by Date"
                  >
                    <Filter size={16} />
                  </button>
                  {showTopItemsFilter && (
                    <div style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', gap: 12, flexDirection: 'column', minWidth: 160 }}>
                      
                      {/* Inner Close Icon */}
                      <div 
                        onClick={() => setShowTopItemsFilter(false)}
                        style={{ position: 'absolute', top: 6, right: 6, cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
                        title="Close"
                      >
                        ✕
                      </div>

                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => {
                        const today = getSaudiTodayDate();
                        setTopItemsFromDate(today);
                        setTopItemsToDate(today);
                        setShowTopItemsFilter(false);
                      }}>Today</button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>From</span>
                        <input type="date" value={topItemsFromDate} onChange={e => setTopItemsFromDate(e.target.value)} style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>To</span>
                        <input type="date" value={topItemsToDate} onChange={e => setTopItemsToDate(e.target.value)} style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }} />
                      </div>
                      
                      <button className="btn btn-primary btn-sm" style={{ marginTop: 4 }} onClick={() => setShowTopItemsFilter(false)}>Apply</button>

                      {(topItemsFromDate || topItemsToDate) && (
                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => {
                          setTopItemsFromDate('');
                          setTopItemsToDate('');
                          setShowTopItemsFilter(false);
                        }}>Clear Filter</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ height: 280, marginTop: 12 }}>
              {loading && topItemsData.length === 0
                ? <div className="skeleton" style={{ height: '100%' }} />
                : topItemsData?.length > 0
                  ? <Bar data={topItemsBarData} options={topItemsBarOpts} />
                  : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>No sales data yet</div>
              }
            </div>
          </div>
        </div>



        {/* Today's Summary */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><Receipt size={20} /> Today's Summary</h3>
              {salesSelectedClosing === 'current' ? (
                <span className="badge badge-success">Live</span>
              ) : (
                <span className="badge" style={{ background: '#7c3aed', color: '#fff' }}>
                  {pastClosings.find(c => String(c.id) === String(salesSelectedClosing))?.closing_type || 'Closed'} Report
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={exportPDF}>
                <Printer size={14} /> Export PDF
              </button>
              <button className="btn btn-secondary btn-sm" onClick={exportExcel}>
                <Download size={14} /> Export Excel
              </button>
            </div>
          </div>

          <div className="summary-grid" style={{ marginTop: 10 }}>
            {[
              { 
                label: 'Today Total Sale', 
                val: stats ? `${CURRENCY}${stats.totalSale.toLocaleString()}` : '0' 
              },
              { 
                label: 'Total Order Complete', 
                val: stats ? stats.totalOrders.toString() : '0' 
              },
              { 
                label: 'Total Production Cost', 
                val: stats ? `${CURRENCY}${stats.totalProductCost.toLocaleString()}` : '0' 
              },
              { 
                label: 'Total Revenue Earned', 
                val: stats ? `${CURRENCY}${stats.dailyRevenue.toLocaleString()}` : '0' 
              },
              { 
                label: 'Targeted Revenue', 
                val: `${CURRENCY}${targetRevenue.toLocaleString()}`,
                isTarget: true
              },
              { 
                label: 'Completion Revenue %', 
                val: stats && targetRevenue ? `${((stats.dailyRevenue / targetRevenue) * 100).toFixed(1)}%` : '0%' 
              },
            ].map(item => (
              <div 
                key={item.label} 
                style={{ 
                  background: 'var(--surface)', 
                  borderRadius: 10, 
                  padding: '14px 16px', 
                  border: '1px solid var(--surface-2)', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'flex-start',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, minHeight: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                    {item.label}
                  </div>
                  {item.isTarget && !isManagement && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openTargetModal(); }}
                      title="Edit Target Revenue"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px',
                        margin: '-2px -4px 0 0',
                        borderRadius: 4,
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <MoreVertical size={16} />
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8, letterSpacing: '-0.3px' }}>
                  {loading ? '...' : item.val}
                </div>
                {item.subtext}
              </div>
            ))}
          </div>
        </div>

        {/* Selected Closing Breakdown & Top Sales Section */}
        {salesSelectedClosing !== 'current' && (() => {
          const selectedClosingObj = pastClosings.find(c => String(c.id) === String(salesSelectedClosing));
          if (!selectedClosingObj) return null;

          return (
            <div className="card" style={{ marginTop: 20, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{selectedClosingObj.closing_type === 'Daily' ? '⚡' : '🔄'}</span>
                    <span>{selectedClosingObj.closing_type} Closing — {selectedClosingObj.cashier_name}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>({selectedClosingObj.branch})</span>
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatSaudiDate(selectedClosingObj.login_time)} · Active: {selectedClosingObj.total_active_time} · Orders: {selectedClosingObj.total_orders}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => printClosingReport(selectedClosingObj)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Printer size={14} /> Print Receipt
                  </button>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setSelectedHistoryReport(selectedClosingObj);
                      setDashboardView('reports');
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <FileText size={14} /> Open Full Report
                  </button>
                </div>
              </div>

              {/* Difference Banner */}
              {(() => {
                const diffVal = parseFloat(selectedClosingObj.difference || 0);
                if (isNaN(diffVal) || Math.abs(diffVal) < 0.01) return null;
                const diffSign = diffVal < 0 ? '-' : '+';
                const diffLabel = diffVal < 0 ? 'SHORTAGE / کم' : 'EXCESS / زیادہ';
                return (
                  <div style={{
                    backgroundColor: '#ffffff',
                    border: '2px solid #dc2626',
                    color: '#111827',
                    padding: '12px 16px',
                    borderRadius: 8,
                    marginBottom: 16,
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#dc2626' }}>
                      Difference: {diffSign}{CURRENCY}{Math.abs(diffVal).toFixed(2)} ({diffLabel})
                    </div>
                    {selectedClosingObj.difference_reason && (
                      <div style={{ marginTop: 6, fontSize: 13, borderTop: '1px dashed #d1d5db', paddingTop: 6, color: '#374151', textAlign: 'left' }}>
                        <strong>Reason:</strong> {selectedClosingObj.difference_reason}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Top Items by 2-Hour Intervals */}
              {(() => {
                let intervalsObj = {};
                try {
                  intervalsObj = typeof selectedClosingObj.interval_items === 'string'
                    ? JSON.parse(selectedClosingObj.interval_items || '{}')
                    : (selectedClosingObj.interval_items || {});
                } catch(e) { intervalsObj = {}; }

                if (intervalsObj && Object.keys(intervalsObj).length > 0) {
                  const loginDate = new Date(selectedClosingObj.login_time);
                  let maxIndex = 0;
                  for (const key of Object.keys(intervalsObj)) {
                    if (parseInt(key) > maxIndex) maxIndex = parseInt(key);
                  }

                  const intervalRows = [];
                  for (let i = 0; i <= maxIndex; i++) {
                    const blockStartTime = new Date(loginDate.getTime() + i * 2 * 3600000);
                    const blockEndTime = new Date(loginDate.getTime() + (i + 1) * 2 * 3600000);
                    const startTimeStr = blockStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const endTimeStr = blockEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const itemsInBlock = intervalsObj[i] || [];

                    intervalRows.push({
                      timeWindow: `${startTimeStr} - ${endTimeStr}`,
                      items: itemsInBlock
                    });
                  }

                  return (
                    <div style={{ marginBottom: 20 }}>
                      <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        🕒 Top Items by 2-Hour Intervals
                      </h4>
                      <div style={{ background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 250, borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: 'var(--surface, #ffffff)', borderBottom: '1px solid var(--border, #e2e8f0)', textAlign: 'left' }}>
                              <th style={{ padding: '10px 12px', width: '35%' }}>Time</th>
                              <th style={{ padding: '10px 12px', width: '65%' }}>Top Items (Qty)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {intervalRows.map((row, rIdx) => (
                              <tr key={rIdx} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                                <td style={{ padding: '8px 12px', fontWeight: 'bold', verticalAlign: 'top' }}>
                                  {row.timeWindow}
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  {row.items.length > 0 ? (
                                    row.items.map((it, itIdx) => (
                                      <div key={itIdx} style={{ marginBottom: 3 }}>
                                        {it.name} <strong>({it.qty})</strong>
                                      </div>
                                    ))
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Top 5 Selling Items */}
              {(() => {
                let items = [];
                try {
                  items = Array.isArray(selectedClosingObj.items_summary) 
                    ? selectedClosingObj.items_summary 
                    : JSON.parse(selectedClosingObj.items_summary || '[]');
                } catch(e) { items = []; }

                let allFlat = [];
                items.forEach(cat => {
                  if (cat.items && Array.isArray(cat.items)) {
                    cat.items.forEach(it => {
                      allFlat.push({
                        name: it.name,
                        qty: parseInt(it.qty, 10) || 0,
                        totalPrice: parseFloat(it.amount !== undefined ? it.amount : (it.price * it.qty) || 0)
                      });
                    });
                  }
                });

                if (allFlat.length > 0) {
                  const grouped = {};
                  allFlat.forEach(it => {
                    if (!grouped[it.name]) grouped[it.name] = { name: it.name, qty: 0, totalPrice: 0 };
                    grouped[it.name].qty += it.qty;
                    grouped[it.name].totalPrice += it.totalPrice;
                  });

                  const sorted = Object.values(grouped).sort((a, b) => b.qty - a.qty).slice(0, 5);

                  return (
                    <div>
                      <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        🏆 Top 5 Selling Items
                      </h4>
                      <div style={{ background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 250, borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: 'rgba(227, 24, 55, 0.08)', borderBottom: '1px solid rgba(227, 24, 55, 0.2)', textAlign: 'left', color: '#E31837' }}>
                              <th style={{ padding: '10px 12px', width: '15%' }}>#</th>
                              <th style={{ padding: '10px 12px', width: '45%' }}>Item</th>
                              <th style={{ padding: '10px 12px', textAlign: 'center', width: '15%' }}>Qty</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right', width: '25%' }}>Rev</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sorted.map((it, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                                <td style={{ padding: '8px 12px', fontWeight: 'bold' }}>#{idx + 1}</td>
                                <td style={{ padding: '8px 12px' }}>{it.name}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}><strong>{it.qty}</strong></td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{CURRENCY}{it.totalPrice.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          );
        })()}

        {/* Target Revenue Edit Modal */}
        {showTargetModal && (
          <div 
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
            }}
            onClick={() => setShowTargetModal(false)}
          >
            <div 
              style={{
                background: 'var(--surface, #ffffff)', borderRadius: 12, padding: 24,
                maxWidth: 400, width: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                border: '1px solid var(--surface-2)'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={20} color="var(--primary)" /> Set Targeted Revenue
                </h3>
                <button 
                  onClick={() => setShowTargetModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 0 }}>
                Update the daily target revenue figure. This value is used to calculate daily revenue completion percentage.
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Target Amount ({CURRENCY})
                </label>
                <input 
                  type="number"
                  min="1"
                  step="100"
                  value={tempTarget}
                  onChange={e => setTempTarget(e.target.value)}
                  placeholder="e.g. 15000"
                  autoFocus
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 16, fontWeight: 700,
                    borderRadius: 8, border: '1.5px solid var(--surface-2)', outline: 'none',
                    background: 'var(--background)'
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') saveTargetRevenue(); }}
                />
              </div>

              {/* Quick Presets */}
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  QUICK PRESETS:
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[2000, 3000, 5000, 6000, 10000, 15000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTempTarget(amt.toString())}
                      style={{
                        padding: '4px 8px', fontSize: 12, borderRadius: 6,
                        border: tempTarget === amt.toString() ? '1.5px solid var(--primary)' : '1px solid var(--surface-2)',
                        background: tempTarget === amt.toString() ? 'rgba(227,24,55,0.08)' : 'var(--surface-2)',
                        color: tempTarget === amt.toString() ? 'var(--primary)' : 'var(--text-secondary)',
                        fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      {CURRENCY}{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setShowTargetModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={saveTargetRevenue}
                >
                  Save Target
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // --- REPORTS DASHBOARD VIEW (SHIFT & DAILY CLOSINGS) ---
  if (canViewPosAndReports && dashboardView === 'reports') {
    const filteredHistory = closingHistory.filter(c => {
      if (historyFilterBranch !== 'All' && c.branch !== historyFilterBranch) return false;
      if (historyFilterType !== 'All' && c.closing_type !== historyFilterType) return false;
      if (historyFilterUser !== 'All' && c.cashier_name !== historyFilterUser) return false;
      return true;
    });

    const totalClosings = filteredHistory.length;
    const shiftClosingsCount = filteredHistory.filter(c => c.closing_type === 'Shift').length;
    const dailyClosingsCount = filteredHistory.filter(c => c.closing_type === 'Daily').length;
    const totalPeriodSales = filteredHistory.reduce((acc, c) => acc + parseFloat(c.total_sales || 0), 0);
    const totalPeriodOrders = filteredHistory.reduce((acc, c) => acc + parseInt(c.total_orders || 0, 10), 0);

    return (
      <>
        {/* Reports Header with Toggle */}
        <div style={{ marginBottom: 24, marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ paddingLeft: '8px' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Good evening, {user?.username} 👋</h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Daily & Shift Closing Reports</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 4 }}>
              <button 
                onClick={() => setDashboardView('attendance')}
                style={{
                  padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                  background: dashboardView === 'attendance' ? 'var(--surface)' : 'transparent',
                  color: dashboardView === 'attendance' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: dashboardView === 'attendance' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>
                Attendance
              </button>
              <button 
                onClick={() => setDashboardView('pos')}
                style={{
                  padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                  background: dashboardView === 'pos' ? 'var(--surface)' : 'transparent',
                  color: dashboardView === 'pos' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: dashboardView === 'pos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>
                Sales & POS
              </button>
              <button 
                onClick={() => setDashboardView('reports')}
                style={{
                  padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                  background: dashboardView === 'reports' ? 'var(--surface)' : 'transparent',
                  color: dashboardView === 'reports' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: dashboardView === 'reports' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>
                Reports
              </button>
            </div>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => loadClosingHistory()} 
              disabled={closingHistoryLoading} 
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}
            >
              <RefreshCw size={14} className={closingHistoryLoading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button 
                className={`btn btn-sm ${historyFrom === getSaudiTodayDate() && historyTo === getSaudiTodayDate() ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setHistoryFrom(getSaudiTodayDate()); setHistoryTo(getSaudiTodayDate()); }}
              >
                Today
              </button>
              <button 
                className={`btn btn-sm ${historyFrom === getSaudiYesterdayDate() && historyTo === getSaudiYesterdayDate() ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setHistoryFrom(getSaudiYesterdayDate()); setHistoryTo(getSaudiYesterdayDate()); }}
              >
                Yesterday
              </button>
              <button 
                className={`btn btn-sm ${historyFrom === getSaudiWeekAgoDate() && historyTo === getSaudiTodayDate() ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setHistoryFrom(getSaudiWeekAgoDate()); setHistoryTo(getSaudiTodayDate()); }}
              >
                Last 7 Days
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>From:</span>
              <input
                type="date"
                value={historyFrom}
                onChange={e => setHistoryFrom(e.target.value)}
                className="filter-input"
                style={{ padding: '6px 10px', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>To:</span>
              <input
                type="date"
                value={historyTo}
                onChange={e => setHistoryTo(e.target.value)}
                className="filter-input"
                style={{ padding: '6px 10px', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Branch:</span>
              <select 
                className="filter-input" 
                value={historyFilterBranch} 
                onChange={e => setHistoryFilterBranch(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 13 }}
              >
                {['All', ...new Set(closingHistory.map(c => c.branch).filter(Boolean))].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Type:</span>
              <select 
                className="filter-input" 
                value={historyFilterType} 
                onChange={e => setHistoryFilterType(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 13 }}
              >
                <option value="All">All Types</option>
                <option value="Shift">Shift Closing</option>
                <option value="Daily">Daily Closing</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Cashier:</span>
              <select 
                className="filter-input" 
                value={historyFilterUser} 
                onChange={e => setHistoryFilterUser(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 13 }}
              >
                {['All', ...new Set(closingHistory.map(c => c.cashier_name).filter(Boolean))].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="summary-grid" style={{ marginBottom: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--surface-2)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Total Closings</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{totalClosings}</div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--surface-2)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Shift Closings</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{shiftClosingsCount}</div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--surface-2)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Daily Closings</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{dailyClosingsCount}</div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--surface-2)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Total Sales in Closings</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>
              {CURRENCY}{totalPeriodSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--surface-2)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Total Orders</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{totalPeriodOrders}</div>
          </div>
        </div>

        {/* Content: List or Detail */}
        {closingHistoryLoading ? (
          <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
            Loading closing reports...
          </div>
        ) : selectedHistoryReport ? (
          /* Report Detail View */
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedHistoryReport(null)}>
                ← Back to List
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => printClosingReport(selectedHistoryReport)}
              >
                <Printer size={15} /> Reprint Report
              </button>
            </div>

            {/* Email-identical Report Card */}
            <div style={{
              fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
              width: '100%',
              maxWidth: 640,
              margin: '0 auto',
              border: '1px solid #eaeaea',
              borderRadius: 10,
              overflow: 'hidden',
              background: '#fafafa',
              boxSizing: 'border-box',
              boxShadow: '0 4px 18px rgba(0,0,0,0.06)'
            }}>
              <div style={{ backgroundColor: selectedHistoryReport.closing_type === 'Daily' ? '#7c3aed' : '#E31837', padding: 20, textAlign: 'center', color: 'white' }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                  {selectedHistoryReport.closing_type === 'Daily' ? '⚡ Daily Closing Report' : '🔄 Shift Closing Report'}
                </h2>
                <p style={{ margin: '5px 0 0 0', fontSize: 14, opacity: 0.9 }}>{selectedHistoryReport.branch}</p>
              </div>

              <div style={{ padding: 24 }}>
                {/* Difference Alert Banner */}
                {(() => {
                  const diffVal = parseFloat(selectedHistoryReport.difference || 0);
                  if (isNaN(diffVal) || Math.abs(diffVal) < 0.01) return null;
                  const diffSign = diffVal < 0 ? '-' : '+';
                  const diffLabel = diffVal < 0 ? 'SHORTAGE / کم' : 'EXCESS / زیادہ';
                  return (
                    <div style={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #dc2626',
                      color: '#111827',
                      padding: '12px 16px',
                      borderRadius: 8,
                      marginBottom: 16,
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#dc2626' }}>
                        Difference: {diffSign}{CURRENCY}{Math.abs(diffVal).toFixed(2)} ({diffLabel})
                      </div>
                      {selectedHistoryReport.difference_reason && (
                        <div style={{ marginTop: 6, fontSize: 13, borderTop: '1px dashed #d1d5db', paddingTop: 6, color: '#374151', textAlign: 'left' }}>
                          <strong>Reason:</strong> {selectedHistoryReport.difference_reason}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Daily Summary: Day + Night Table (Comparative Layout) */}
                {selectedHistoryReport.closing_type === 'Daily' && (() => {
                  let shiftsArr = [];
                  try {
                    shiftsArr = Array.isArray(selectedHistoryReport.shifts_summary)
                      ? selectedHistoryReport.shifts_summary
                      : JSON.parse(selectedHistoryReport.shifts_summary || '[]');
                  } catch(e) { shiftsArr = []; }

                  const compData = computeDailyComparativeData(
                    shiftsArr,
                    null,
                    null,
                    selectedHistoryReport,
                    selectedHistoryReport.cashier_name || 'Cashier'
                  );

                  return (
                    <div style={{ marginBottom: 20 }}>
                      {renderComparativeDailyTable(compData)}
                    </div>
                  );
                })()}

                {/* Summary Card */}
                <div style={{ background: 'white', padding: 16, borderRadius: 8, border: '1px solid #eaeaea', marginBottom: 20 }}>
                  <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Cashier:</strong> {selectedHistoryReport.cashier_name}</p>
                  <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Total Orders:</strong> {selectedHistoryReport.total_orders}</p>
                  <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Total Sales:</strong> {CURRENCY}{parseFloat(selectedHistoryReport.total_sales || 0).toFixed(2)}</p>
                  <p style={{ margin: '4px 0', paddingLeft: 12, fontSize: 13, color: '#555' }}>↳ Cash Sales: {CURRENCY}{parseFloat(selectedHistoryReport.cash_sales || 0).toFixed(2)}</p>
                  <p style={{ margin: '4px 0', paddingLeft: 12, fontSize: 13, color: '#555' }}>↳ Card Sales: {CURRENCY}{parseFloat(selectedHistoryReport.card_sales || 0).toFixed(2)}</p>
                  <p style={{ margin: '4px 0', paddingLeft: 12, fontSize: 13, color: '#555' }}>↳ Credit Sales: {CURRENCY}{parseFloat(selectedHistoryReport.credit_sales || 0).toFixed(2)}</p>
                  <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Major Payments:</strong> {CURRENCY}{parseFloat(selectedHistoryReport.major_payments || 0).toFixed(2)}</p>
                  <p style={{ margin: '4px 0', fontSize: 14, fontWeight: 700, color: '#059669' }}><strong>Total Received:</strong> {CURRENCY}{(parseFloat(selectedHistoryReport.cash_sales || 0) + parseFloat(selectedHistoryReport.card_sales || 0) + parseFloat(selectedHistoryReport.major_payments || 0)).toFixed(2)}</p>
                  {parseFloat(selectedHistoryReport.opening_cash || 0) > 0 && (
                    <p style={{ margin: '4px 0', fontSize: 14, color: '#047857' }}><strong>Opening Drawer Cash:</strong> {CURRENCY}{parseFloat(selectedHistoryReport.opening_cash).toFixed(2)}</p>
                  )}
                  <p style={{ margin: '4px 0', fontSize: 14, color: '#047857' }}><strong>Cash Counted:</strong> {CURRENCY}{parseFloat(selectedHistoryReport.closing_cash || 0).toFixed(2)}</p>
                  <p style={{ margin: '4px 0', fontSize: 14, color: '#2563eb' }}><strong>Card Counted:</strong> + {CURRENCY}{parseFloat(selectedHistoryReport.closing_card !== null && selectedHistoryReport.closing_card !== undefined ? selectedHistoryReport.closing_card : (selectedHistoryReport.card_sales || 0)).toFixed(2)}</p>
                  <p style={{ margin: '4px 0', fontSize: 14, color: '#0f172a' }}><strong>Total Accounted:</strong> = {CURRENCY}{(parseFloat(selectedHistoryReport.closing_cash || 0) + parseFloat(selectedHistoryReport.closing_card !== null && selectedHistoryReport.closing_card !== undefined ? selectedHistoryReport.closing_card : (selectedHistoryReport.card_sales || 0))).toFixed(2)}</p>
                  {selectedHistoryReport.cash_difference !== null && selectedHistoryReport.cash_difference !== undefined && (
                    <p style={{ margin: '4px 0', paddingLeft: 12, fontSize: 13, color: parseFloat(selectedHistoryReport.cash_difference) < 0 ? '#b91c1c' : '#15803d' }}>
                      ↳ Cash Diff: {parseFloat(selectedHistoryReport.cash_difference) < 0 ? '-' : '+'}{CURRENCY}{Math.abs(parseFloat(selectedHistoryReport.cash_difference)).toFixed(2)}
                    </p>
                  )}
                  {selectedHistoryReport.card_difference !== null && selectedHistoryReport.card_difference !== undefined && (
                    <p style={{ margin: '4px 0', paddingLeft: 12, fontSize: 13, color: parseFloat(selectedHistoryReport.card_difference) < 0 ? '#b91c1c' : '#15803d' }}>
                      ↳ Card Diff: {parseFloat(selectedHistoryReport.card_difference) < 0 ? '-' : '+'}{CURRENCY}{Math.abs(parseFloat(selectedHistoryReport.card_difference)).toFixed(2)}
                    </p>
                  )}
                  <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Active Time:</strong> {selectedHistoryReport.total_active_time}</p>
                  <p style={{ margin: '4px 0', fontSize: 12, color: '#777' }}>
                    {formatSaudiDateTime(selectedHistoryReport.login_time)} — {formatSaudiDateTime(selectedHistoryReport.logout_time)} (KSA)
                  </p>
                </div>

                {/* Items Sold by Category */}
                <h3 style={{ marginTop: 24, borderBottom: '2px solid #eaeaea', paddingBottom: 8, color: '#333', fontSize: 16 }}>
                  Items Sold by Category
                </h3>
                {(() => {
                  let items = [];
                  try {
                    items = Array.isArray(selectedHistoryReport.items_summary) 
                      ? selectedHistoryReport.items_summary 
                      : JSON.parse(selectedHistoryReport.items_summary || '[]');
                  } catch(e) { items = []; }

                  if (!items || items.length === 0) {
                    return <p style={{ textAlign: 'center', color: '#999', padding: 20 }}>No items recorded</p>;
                  }

                  return items.map((cat, idx) => (
                    <div key={idx} style={{ marginBottom: 20, background: '#fff', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ background: '#f8f9fa', fontWeight: 'bold', fontSize: 15, color: '#111', padding: '10px 15px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{cat.category}</span>
                        <span style={{ color: '#E31837', fontSize: 14 }}>
                          {CURRENCY}{parseFloat(cat.amount || 0).toFixed(2)} ({cat.qty} items)
                        </span>
                      </div>
                      <div style={{ padding: '0 10px', overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 250, borderCollapse: 'collapse', margin: '10px 0', fontSize: 13, color: '#555', tableLayout: 'fixed', wordWrap: 'break-word' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
                              <th style={{ padding: '8px 4px', width: '40%' }}>Item</th>
                              <th style={{ padding: '8px 4px', textAlign: 'center', width: '15%' }}>Qty</th>
                              <th style={{ padding: '8px 4px', textAlign: 'right', width: '22%' }}>Price</th>
                              <th style={{ padding: '8px 4px', textAlign: 'right', width: '23%' }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cat.items && Array.isArray(cat.items) && cat.items.map((it, itemIdx) => {
                              const unitPrice = parseFloat((it.amount !== undefined ? it.amount : (it.price * it.qty)) / (it.qty || 1)).toFixed(2);
                              const totalPrice = parseFloat(it.amount !== undefined ? it.amount : (it.price * it.qty) || 0).toFixed(2);
                              return (
                                <tr key={itemIdx} style={{ borderBottom: '1px dashed #f0f0f0' }}>
                                  <td style={{ padding: '6px 4px' }}>{it.name}</td>
                                  <td style={{ padding: '6px 4px', textAlign: 'center' }}><strong>{it.qty}</strong></td>
                                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{CURRENCY}{unitPrice}</td>
                                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{CURRENCY}{totalPrice}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ));
                })()}

                {/* Top Items by 2-Hour Intervals */}
                {(() => {
                  let intervalsObj = {};
                  try {
                    intervalsObj = typeof selectedHistoryReport.interval_items === 'string'
                      ? JSON.parse(selectedHistoryReport.interval_items || '{}')
                      : (selectedHistoryReport.interval_items || {});
                  } catch(e) { intervalsObj = {}; }

                  if (intervalsObj && Object.keys(intervalsObj).length > 0) {
                    const loginDate = new Date(selectedHistoryReport.login_time);
                    let maxIndex = 0;
                    for (const key of Object.keys(intervalsObj)) {
                      if (parseInt(key) > maxIndex) maxIndex = parseInt(key);
                    }

                    const intervalRows = [];
                    for (let i = 0; i <= maxIndex; i++) {
                      const blockStartTime = new Date(loginDate.getTime() + i * 2 * 3600000);
                      const blockEndTime = new Date(loginDate.getTime() + (i + 1) * 2 * 3600000);
                      const startTimeStr = blockStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const endTimeStr = blockEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const itemsInBlock = intervalsObj[i] || [];

                      intervalRows.push({
                        timeWindow: `${startTimeStr} - ${endTimeStr}`,
                        items: itemsInBlock
                      });
                    }

                    return (
                      <>
                        <h3 style={{ marginTop: 30, borderBottom: '2px solid #eaeaea', paddingBottom: 8, color: '#333', fontSize: 16 }}>
                          Top Items by 2-Hour Intervals
                        </h3>
                        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, overflowX: 'auto', marginBottom: 20 }}>
                          <table style={{ width: '100%', minWidth: 250, borderCollapse: 'collapse', fontSize: 13, color: '#555', tableLayout: 'fixed', wordWrap: 'break-word' }}>
                            <thead>
                              <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #eee', textAlign: 'left', color: '#111' }}>
                                <th style={{ padding: '10px 8px', width: '35%' }}>Time</th>
                                <th style={{ padding: '10px 8px', width: '65%' }}>Top Items (Qty)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {intervalRows.map((row, rIdx) => (
                                <tr key={rIdx} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '8px 15px', fontWeight: 'bold', borderRight: '1px solid #eee', verticalAlign: 'top' }}>
                                    {row.timeWindow}
                                  </td>
                                  <td style={{ padding: '8px 15px' }}>
                                    {row.items.length > 0 ? (
                                      row.items.map((it, itIdx) => (
                                        <div key={itIdx} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: itIdx === row.items.length - 1 ? 'none' : '1px dashed #f0f0f0' }}>
                                          {it.name} <strong>({it.qty})</strong>
                                        </div>
                                      ))
                                    ) : (
                                      '-'
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  }
                  return null;
                })()}

                {/* Top 5 Selling Items */}
                {(() => {
                  let items = [];
                  try {
                    items = Array.isArray(selectedHistoryReport.items_summary) 
                      ? selectedHistoryReport.items_summary 
                      : JSON.parse(selectedHistoryReport.items_summary || '[]');
                  } catch(e) { items = []; }

                  let allFlat = [];
                  items.forEach(cat => {
                    if (cat.items && Array.isArray(cat.items)) {
                      cat.items.forEach(it => {
                        allFlat.push({
                          name: it.name,
                          qty: parseInt(it.qty, 10) || 0,
                          totalPrice: parseFloat(it.amount !== undefined ? it.amount : (it.price * it.qty) || 0)
                        });
                      });
                    }
                  });

                  if (allFlat.length > 0) {
                    const grouped = {};
                    allFlat.forEach(it => {
                      if (!grouped[it.name]) grouped[it.name] = { name: it.name, qty: 0, totalPrice: 0 };
                      grouped[it.name].qty += it.qty;
                      grouped[it.name].totalPrice += it.totalPrice;
                    });

                    const sorted = Object.values(grouped).sort((a, b) => b.qty - a.qty).slice(0, 5);

                    return (
                      <>
                        <h3 style={{ marginTop: 30, borderBottom: '2px solid #eaeaea', paddingBottom: 8, color: '#333', fontSize: 16 }}>
                          Top 5 Selling Items
                        </h3>
                        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, overflowX: 'auto' }}>
                          <table style={{ width: '100%', minWidth: 250, borderCollapse: 'collapse', fontSize: 13, color: '#555', tableLayout: 'fixed', wordWrap: 'break-word' }}>
                            <thead>
                              <tr style={{ background: '#fff3f4', borderBottom: '1px solid #ffccd0', textAlign: 'left', color: '#E31837' }}>
                                <th style={{ padding: '10px 8px', width: '15%' }}>#</th>
                                <th style={{ padding: '10px 8px', width: '45%' }}>Item</th>
                                <th style={{ padding: '10px 8px', textAlign: 'center', width: '15%' }}>Qty</th>
                                <th style={{ padding: '10px 8px', textAlign: 'right', width: '25%' }}>Rev</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sorted.map((it, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '8px 15px', fontWeight: 'bold' }}>#{idx + 1}</td>
                                  <td style={{ padding: '8px 15px' }}>{it.name}</td>
                                  <td style={{ padding: '8px 15px', textAlign: 'center' }}><strong>{it.qty}</strong></td>
                                  <td style={{ padding: '8px 15px', textAlign: 'right' }}>{CURRENCY}{it.totalPrice.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        ) : (
          /* Report List View */
          <div className="card" style={{ padding: 20 }}>
            {filteredHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                No closing reports found for the selected dates and filters.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredHistory.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedHistoryReport(c)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 18px',
                      background: 'var(--surface-2, #f8f9fa)',
                      borderRadius: 10,
                      border: '1px solid var(--border, #e2e8f0)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: 24 }}>
                        {c.closing_type === 'Daily' ? '⚡' : '🔄'}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                            background: c.closing_type === 'Daily' ? 'rgba(124, 58, 237, 0.1)' : 'rgba(227, 24, 55, 0.1)',
                            color: c.closing_type === 'Daily' ? '#7c3aed' : 'var(--primary)'
                          }}>
                            {c.closing_type}
                          </span>
                          <span>{c.cashier_name}</span>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 12 }}>({c.branch})</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          {formatSaudiDate(c.login_time)} · {formatSaudiTime(c.login_time)} → {formatSaudiTime(c.logout_time)} · Active: {c.total_active_time} · {c.total_orders} orders
                          {c.closing_cash ? ` · Drawer: ${CURRENCY}${parseFloat(c.closing_cash).toFixed(2)}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 16 }}>
                          {CURRENCY}{parseFloat(c.total_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Cash: {CURRENCY}{parseFloat(c.cash_sales || 0).toFixed(0)} | Card: {CURRENCY}{parseFloat(c.card_sales || 0).toFixed(0)}
                        </div>
                      </div>
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={(e) => { e.stopPropagation(); printClosingReport(c); }}
                        title="Reprint Report"
                      >
                        <Printer size={14} />
                      </button>
                      <ChevronRight size={18} color="var(--text-muted)" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </>
    )
  }

  // --- REGULAR ATTENDANCE DASHBOARD VIEW (ADMIN, OPERATOR, ETC.) ---
  const totalEmployeesCount = todayActivity.length;
  const lateCount = todayActivity.filter(log => log.attendance_id && log.attendance_status === 'Late').length;
  const currentlyPresentCount = todayActivity.filter(log => log.attendance_id && !log.check_out).length;
  const absentCount = todayActivity.filter(log => log.calculated_status === 'Absent' || log.calculated_status === 'Leave' || log.calculated_status === 'Holiday').length;
  const onBreakCount = todayActivity.filter(log => log.attendance_id && log.on_break && !log.check_out).length;
  const checkedOutCount = todayActivity.filter(log => log.attendance_id && log.check_out).length;

  const attendanceRate = totalEmployeesCount > 0
    ? `${(((currentlyPresentCount + checkedOutCount) / totalEmployeesCount) * 100).toFixed(0)}%`
    : '0%';

  const attendanceStatCards = [
    { key: 'total_employees', label: 'TOTAL STAFF', val: totalEmployeesCount, icon: <Users size={18} />, color: '#4f46e5', subtext: 'Registered staff' },
    { key: 'currently_present', label: 'CURRENTLY PRESENT', val: currentlyPresentCount, icon: <UserCheck size={18} />, color: '#10b981', subtext: `${currentlyPresentCount} active at work` },
    { key: 'late_today', label: 'LATE ARRIVALS', val: lateCount, icon: <Clock size={18} />, color: '#f59e0b', subtext: 'Delayed starts' },
    { key: 'on_break', label: 'STAFF ON BREAK', val: onBreakCount, icon: <Coffee size={18} />, color: '#3b82f6', subtext: 'Currently on break' },
    { key: 'checked_out', label: 'CHECKED OUT', val: checkedOutCount, icon: <Check size={18} />, color: '#9CA3AF', subtext: 'Completed shift today' },
    { key: 'absent', label: 'ABSENT TODAY', val: absentCount, icon: <UserX size={18} />, color: '#ef4444', subtext: 'Excused & unexcused' }
  ];

  // Attendance Analytics rate graph data
  const attendanceLineData = {
    labels: analyticsData?.[timeRange]?.map(d => d.label) ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [{
      label: 'Attendance Rate (%)',
      data: analyticsData?.[timeRange]?.map(d => d.rate) ?? [95, 93, 96, 92, 94, 97, 95],
      borderColor: BRAND_PRIMARY,
      backgroundColor: BRAND_PRIMARY + '0c', // 5% opacity very light fill
      borderWidth: 2.5,
      pointBackgroundColor: BRAND_PRIMARY,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: true,
      tension: 0.4,
    }],
  }

  const attendanceLineOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `Rate: ${ctx.parsed.y}%`
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        beginAtZero: true,
        max: 100,
        ticks: { callback: v => `${v}%` }
      },
    },
  }

  // Shift Attendance Bar Chart data
  const uniqueShifts = ['R1 Day', 'R1 Night', 'R2 Day', 'R2 Night', 'R3 Day', 'R3 Night'];
  
  const getEmployeeBucket = (emp) => {
    let rPref = 'R1';
    const b = (emp.branch || '').toLowerCase();
    if (b.includes('1') || b.includes('r1')) rPref = 'R1';
    else if (b.includes('2') || b.includes('r2')) rPref = 'R2';
    else if (b.includes('3') || b.includes('r3')) rPref = 'R3';

    const sVal = (emp.new_shift || emp.shift || 'Day');
    let sSuff = 'Day';
    if (String(sVal).toLowerCase().includes('night') || String(sVal).toLowerCase().includes('n')) {
      sSuff = 'Night';
    }

    return `${rPref} ${sSuff}`;
  };

  const presentData = uniqueShifts.map(bucket =>
    todayActivity.filter(e => getEmployeeBucket(e) === bucket && e.attendance_id).length
  );
  const enrolledData = uniqueShifts.map(bucket =>
    (allEmployees.length > 0 ? allEmployees : todayActivity).filter(e => getEmployeeBucket(e) === bucket).length
  );
  const checkoutData = uniqueShifts.map(bucket =>
    todayActivity.filter(e => getEmployeeBucket(e) === bucket && e.attendance_id && e.check_out).length
  );

  const barChartLabelsPlugin = {
    id: 'barChartLabels',
    afterDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        if (!meta.hidden) {
          meta.data.forEach((element, index) => {
            const data = dataset.data[index];
            if (data > 0) {
              ctx.save();
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 12px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              let labelText = '';
              if (dataset.label === 'Present Today') labelText = 'P';
              else if (dataset.label === 'Checked Out') labelText = 'C';
              else if (dataset.label === 'Total Enrolled') labelText = 'T';

              // Using tooltipPosition for safe coordinates
              const pos = element.tooltipPosition();
              const x = pos.x;
              const y = pos.y + 12; // 12px below the top of the bar
              
              ctx.fillText(labelText, x, y);
              ctx.restore();
            }
          });
        }
      });
    }
  };

  const attendanceBarData = {
    labels: uniqueShifts,
    datasets: [
      {
        label: 'Present Today',
        data: presentData,
        backgroundColor: '#10b981', // green
        borderRadius: 6,
      },
      {
        label: 'Checked Out',
        data: checkoutData,
        backgroundColor: '#9ca3af', // gray
        borderRadius: 6,
      },
      {
        label: 'Total Enrolled',
        data: enrolledData,
        backgroundColor: '#4f46e5', // indigo/blue
        borderRadius: 6,
      }
    ]
  };

  const attendanceBarOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: 'var(--text-muted)',
          font: { size: 11, weight: 600 }
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        beginAtZero: true,
        ticks: { stepSize: 2 }
      }
    }
  }

  if (user?.role?.toLowerCase() === 'employee') {
    return (
      <div className="page-content" style={{ paddingTop: 0 }}>
        {/* Welcome Banner */}
        <div style={{ marginBottom: 24, marginTop: -60, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Welcome, {personalStats?.name || user?.username} 👋</h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Personal Attendance & Progress Dashboard</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadStats} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            Loading your stats...
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginBottom: 24
            }}>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
                <div style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)', padding: 12, borderRadius: 10 }}>
                  <UserCheck size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{personalStats?.days_present || 0}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Days Present</p>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: 12, borderRadius: 10 }}>
                  <Clock size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{decimalHoursToText(personalStats?.total_hours || 0)}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Hours Worked</p>
                </div>
              </div>

              <div style={{ borderLeft: '3px solid var(--primary)' }} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
                  <div style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)', padding: 12, borderRadius: 10 }}>
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{decimalHoursToText(personalStats?.overtime || 0)}</h3>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Overtime</p>
                  </div>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: 12, borderRadius: 10 }}>
                  <UserX size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{personalStats?.days_late || 0}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Days Late</p>
                </div>
              </div>
            </div>

            {/* Profile Info & Logs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
              <div className="card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800 }}>Employee Details</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--surface-2)', paddingBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Employee ID:</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{personalStats?.employee_id || '--'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--surface-2)', paddingBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Designation:</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{personalStats?.position || '--'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--surface-2)', paddingBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Department:</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{personalStats?.department || '--'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Assigned Shift:</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Shift {personalStats?.shift || '--'}</span>
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800 }}>Attendance Status Summary</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 120 }}>
                  <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: 36, fontWeight: 900, color: 'var(--green)', margin: 0 }}>
                      {personalStats?.days_present ? Math.round(((personalStats.days_present - personalStats.days_late) / personalStats.days_present) * 100) : 100}%
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Punctuality Rate This Month</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Log table */}
            <div className="card" style={{ padding: 0, marginTop: 24, overflow: 'hidden' }}>
              <div style={{ padding: 18, borderBottom: '1px solid var(--surface-2)' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>This Month's Attendance Records</h3>
              </div>
              <div className="table-wrap">
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-1)' }}>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Check-In</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Check-Out</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left' }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(personalStats?.monthly_logs || []).map((log, idx) => {
                      const rowBg = idx % 2 === 0 ? 'var(--surface)' : 'rgba(var(--primary-rgb), 0.025)'
                      return (
                        <tr key={log.id} style={{ background: rowBg, borderBottom: '1px solid var(--surface-2)' }}>
                          <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>
                            {new Date(log.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center' }}>
                            {new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center' }}>
                            {log.check_out ? new Date(log.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : 'Active'}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span style={{
                              color: log.status === 'Late' ? 'var(--primary)' : 'var(--green)',
                              background: log.status === 'Late' ? 'rgba(var(--primary-rgb), 0.1)' : 'rgba(34, 197, 94, 0.1)',
                              padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600
                            }}>{log.status}</span>
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>{log.remarks || '--'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // Filter Today activity list to present, break, late and absent lists
  const lateEmployees = todayActivity.filter(log => log.attendance_id && log.attendance_status === 'Late')
  const currentlyPresentEmployees = todayActivity.filter(log => log.attendance_id && !log.check_out)
  const onBreakEmployees = todayActivity.filter(log => log.attendance_id && log.on_break && !log.check_out)
  const checkedOutEmployees = todayActivity.filter(log => log.attendance_id && log.check_out)
  const absentEmployees = todayActivity.filter(log => log.calculated_status === 'Absent' || log.calculated_status === 'Leave' || log.calculated_status === 'Holiday')

  const rawBranches = [...new Set(todayActivity.map(emp => emp.branch).filter(Boolean))];
  const sortedBranches = rawBranches.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''));
    const numB = parseInt(b.replace(/\D/g, ''));
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });
  const branchesList = ['All', ...sortedBranches];

  const tableFilteredEmployees = todayActivity.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(attendanceSearchQuery.toLowerCase()) ||
      String(emp.employee_id).toLowerCase().includes(attendanceSearchQuery.toLowerCase());
    
    // Day/Night Shift mapping (matches the Day/Night property or defaults)
    const empShiftVal = String(emp.new_shift || emp.shift || '').toLowerCase();
    let isDay = empShiftVal.includes('day') || empShiftVal === 'd';
    let isNight = empShiftVal.includes('night') || empShiftVal === 'n';
    
    // Default matching logic if neither is strictly matched, or if exact matches are found
    const matchesDayNight = attendanceSelectedDayNight === 'All' || 
                           (attendanceSelectedDayNight === 'Day' && isDay) || 
                           (attendanceSelectedDayNight === 'Night' && isNight);

    const matchesBranch = attendanceSelectedBranch === 'All' || emp.branch === attendanceSelectedBranch;

    let matchesStatus = true;
    const hasSessions = emp.sessions && emp.sessions.length > 0;
    const isCurrentlyCheckedIn = emp.attendance_id && !emp.check_out;

    if (attendanceSelectedStatus === 'Total Present') {
      matchesStatus = hasSessions;
    } else if (attendanceSelectedStatus === 'Currently Present') {
      matchesStatus = isCurrentlyCheckedIn;
    } else if (attendanceSelectedStatus === 'Checked Out Complete') {
      matchesStatus = hasSessions && !isCurrentlyCheckedIn;
    } else if (attendanceSelectedStatus === 'Break') {
      matchesStatus = isCurrentlyCheckedIn && emp.on_break;
    } else if (attendanceSelectedStatus === 'Late') {
      matchesStatus = hasSessions && emp.attendance_status === 'Late';
    } else if (attendanceSelectedStatus === 'Absent') {
      matchesStatus = emp.calculated_status === 'Absent' || emp.calculated_status === 'Leave' || emp.calculated_status === 'Holiday';
    }

    return matchesSearch && matchesDayNight && matchesBranch && matchesStatus;
  }).sort((a, b) => {
    const aCheckedIn = a.attendance_id && !a.check_out ? 1 : 0;
    const bCheckedIn = b.attendance_id && !b.check_out ? 1 : 0;
    return bCheckedIn - aCheckedIn;
  });
  const exportAttendanceToExcel = async () => {
    try {
      const XLSX = await import('xlsx')

      const decimalHoursToText = (hoursDec) => {
        if (isNaN(hoursDec) || hoursDec === null || hoursDec === undefined || hoursDec <= 0) return '0 min';
        const totalMins = Math.round(hoursDec * 60);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
        if (hrs > 0) return `${hrs} hr`;
        return `${mins} min`;
      }

      const data = tableFilteredEmployees.map(emp => {
        const sessions = emp.sessions || []
        const checkInTimes = sessions.map(s => `In: ${new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`).join('\n')
        const checkOutTimes = sessions.map(s => s.check_out ? `Out: ${new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'Active').join('\n')

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

  return (
    <>
      <style>{`
        .attendance-cards-grid,
        .attendance-analytics-row {
          width: 100%;
        }
        .attendance-analytics-row {
          display: flex !important;
          flex-wrap: wrap;
          gap: 16px;
          justify-content: flex-start;
        }
        .attendance-bottom-cards-container > div {
          width: 100% !important;
          max-width: 280px !important;
          flex: 1 1 240px;
        }
        @media (min-width: 1024px) {
          .attendance-cards-grid {
            grid-template-columns: repeat(6, 1fr) !important;
          }
        }
        @media (max-width: 768px) {
          .attendance-analytics-row,
          .attendance-bottom-cards-container {
            justify-content: center !important;
          }
          .chart-card {
            min-width: 100% !important;
            flex: 1 1 100% !important;
          }
          .attendance-cards-grid {
            grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)) !important;
          }
          .dashboard-refresh-btn {
            display: none !important;
          }
          .mobile-only-filter-btn {
            display: flex !important;
          }
          .filters-container {
            display: none !important;
            width: 100%;
          }
          .filters-container.show {
            display: flex !important;
          }
        }
        .mobile-only-filter-btn {
          display: none;
          align-items: center;
          justify-content: center;
          height: 38px;
        }
        .custom-scrollbar {
          -webkit-overflow-scrolling: touch;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--surface-2);
          border-radius: 4px;
        }
      `}</style>

      {/* Welcome Banner */}
      <div style={{ marginBottom: 24, marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ paddingLeft: '8px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Good evening, {user?.username} 👋</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Restaurant Attendance & Operations Dashboard</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {canViewPosAndReports && (
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 4 }}>
              <button 
                onClick={() => setDashboardView('attendance')}
                style={{
                  padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                  background: dashboardView === 'attendance' ? 'var(--surface)' : 'transparent',
                  color: dashboardView === 'attendance' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: dashboardView === 'attendance' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>
                Attendance
              </button>
              <button 
                onClick={() => setDashboardView('pos')}
                style={{
                  padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                  background: dashboardView === 'pos' ? 'var(--surface)' : 'transparent',
                  color: dashboardView === 'pos' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: dashboardView === 'pos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>
                Sales & POS
              </button>
              <button 
                onClick={() => setDashboardView('reports')}
                style={{
                  padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                  background: dashboardView === 'reports' ? 'var(--surface)' : 'transparent',
                  color: dashboardView === 'reports' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: dashboardView === 'reports' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>
                Reports
              </button>
            </div>
          )}
          <button className="btn btn-secondary btn-sm dashboard-refresh-btn" onClick={loadStats} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* 6 Attendance KPI Cards */}
      <div className="attendance-cards-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        {attendanceStatCards.map((card, idx) => (
          <div key={idx} style={{
            position: 'relative',
            background: 'var(--surface)',
            border: '1px solid var(--surface-2)',
            borderRadius: 16,
            padding: '16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            minHeight: 110,
            overflow: 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)'
          }}>
            {/* Blurry colorful circular shape in the background starting from bottom-left going to middle */}
            <div style={{
              position: 'absolute',
              bottom: '-30px',
              left: '-30px',
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${card.color}25 0%, ${card.color}00 70%)`,
              filter: 'blur(16px)',
              pointerEvents: 'none'
            }} />

            {/* Icon on Left */}
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'rgba(var(--primary-rgb), 0.06)',
              color: card.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              zIndex: 1
            }}>
              {card.icon}
            </div>

            {/* Value & Labels on Right */}
            <div style={{ display: 'flex', flexDirection: 'column', zIndex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {card.label}
              </div>
              <h3 style={{ margin: '2px 0', fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {loading ? '...' : card.val ?? 0}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={card.subtext}>
                {card.subtext}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Attendance Analytics (Charts) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, width: '100%' }}>
        
        {/* Graph Card: Weekly Attendance Rate */}
        <div className="card chart-card" style={{ padding: 20, flex: '1 1 calc(50% - 16px)', minWidth: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Weekly Attendance Rate</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Avg. 93% across all staff</span>
              </div>
              <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 3 }}>
                <button
                  className="btn btn-sm"
                  onClick={() => setTimeRange('weekly')}
                  style={{ fontSize: 11, padding: '4px 10px', minWidth: 'auto', background: timeRange === 'weekly' ? 'var(--primary)' : 'transparent', color: timeRange === 'weekly' ? '#fff' : 'var(--text-secondary)', border: 'none' }}
                >
                  Weekly
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setTimeRange('monthly')}
                  style={{ fontSize: 11, padding: '4px 10px', minWidth: 'auto', background: timeRange === 'monthly' ? 'var(--primary)' : 'transparent', color: timeRange === 'monthly' ? '#fff' : 'var(--text-secondary)', border: 'none' }}
                >
                  Monthly
                </button>
              </div>
            </div>
            <div style={{ height: 240 }}>
              <Line data={attendanceLineData} options={attendanceLineOpts} />
            </div>
          </div>

        {/* Graph Card: Today's Shift Attendance */}
        <div className="card chart-card" style={{ padding: 20, flex: '1 1 calc(50% - 16px)', minWidth: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Today's Shift Attendance</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Present vs Enrolled Staff</span>
              </div>
            </div>
            <div style={{ height: 240 }}>
              <Bar data={attendanceBarData} options={attendanceBarOpts} plugins={[barChartLabelsPlugin]} />
            </div>
          </div>
      </div>

      {/* Attendance Status Cards Row */}
      {/* Attendance Status Cards Row per Restaurant */}
      {['R1', 'R2', 'R3'].map((restCode) => {
        const restName = restCode === 'R1' ? 'Restaurant 1' : restCode === 'R2' ? 'Restaurant 2' : 'Restaurant 3';
        const restEmployees = todayActivity.filter(emp => getEmployeeBucket(emp).startsWith(restCode));
        
        const rPresent = restEmployees.filter(log => log.attendance_id && !log.check_out);
        const rLate = restEmployees.filter(log => log.attendance_id && log.attendance_status === 'Late');
        const rBreak = restEmployees.filter(log => log.attendance_id && log.on_break && !log.check_out);
        const rCheckedOut = restEmployees.filter(log => log.attendance_id && log.check_out);
        const rAbsent = restEmployees.filter(log => log.calculated_status === 'Absent' || log.calculated_status === 'Leave' || log.calculated_status === 'Holiday');

        if (restEmployees.length === 0) return null;

        return (
          <div key={restCode} className="card" style={{ marginBottom: 32, width: '100%', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <span style={{ background: '#f59e0b', color: 'white', padding: '6px 16px', borderRadius: 8, fontWeight: 800, fontSize: 18 }}>
                {restName}
              </span>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'var(--surface-1)', padding: '4px 12px', borderRadius: 8, border: '1px solid var(--surface-2)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
                  Total: {restEmployees.length}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>
                  P = {rPresent.length}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--red)' }}>
                  A = {rAbsent.length}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: 24, width: '100%', paddingBottom: 8 }} className="custom-scrollbar">
              {/* Column 1: Currently Present Column */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Currently Present
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)', padding: '2px 8px', borderRadius: 10 }}>
                    {rPresent.length}
                  </span>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 250, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
                  {loading && rPresent.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
                  ) : rPresent.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No active present staff</div>
                  ) : (
                    rPresent.map((log, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-1)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Shift {log.shift || 'R1'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {log.on_break && (
                            <span style={{ fontSize: 10, color: 'var(--primary)', background: 'rgba(var(--primary-rgb), 0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>On Break</span>
                          )}
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 11, color: 'var(--green)', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, display: 'inline-block' }}>
                              In: {log.check_in ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--'}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
                              {decimalHoursToText(parseFloat(log.total_hours_today || 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'var(--surface-2)', flexShrink: 0 }}></div>

              {/* Column 2: Late Arrivals Today */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Late Arrivals
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(249, 115, 22, 0.1)', color: '#F97316', padding: '2px 8px', borderRadius: 10 }}>
                    {rLate.length}
                  </span>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 250, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
                  {loading && rLate.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
                  ) : rLate.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12, padding: '20px 0' }}>No late arrivals today</div>
                  ) : (
                    rLate.map((log, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-1)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{log.name}</span>
                        <span style={{ fontSize: 11, color: '#F97316', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                          {log.check_in ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : 'Late'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'var(--surface-2)', flexShrink: 0 }}></div>

              {/* Column 3: Staff On Break Column */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Staff On Break
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 10 }}>
                    {rBreak.length}
                  </span>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 250, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
                  {loading && rBreak.length === 0 ? (
                    <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
                  ) : rBreak.length === 0 ? (
                    <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No staff on break</div>
                  ) : (
                    rBreak.map((log, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'var(--surface-1)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{log.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--primary)', background: 'rgba(var(--primary-rgb), 0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>On Break</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'var(--surface-2)', flexShrink: 0 }}></div>

              {/* Column 4: Checked Out Today Column */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Checked Out Today
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(156, 163, 175, 0.1)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 10 }}>
                    {rCheckedOut.length}
                  </span>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 250, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
                  {loading && rCheckedOut.length === 0 ? (
                    <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
                  ) : rCheckedOut.length === 0 ? (
                    <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No checked out staff</div>
                  ) : (
                    rCheckedOut.map((log, idx) => {
                      const otHours = Math.max(0, parseFloat(log.total_hours_today || 0) - (parseFloat(log.shift_hours) || 12.0));
                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-1)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Shift {log.shift || 'R1'}</span>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: 'var(--green)', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, display: 'inline-block' }}>
                                In: {log.check_in ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--'}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, display: 'inline-block' }}>
                                Out: {log.check_out ? new Date(log.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--'}
                              </span>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
                              {decimalHoursToText(parseFloat(log.total_hours_today || 0))} {otHours > 0 && <span style={{ color: 'var(--primary)' }}>({decimalHoursToText(otHours)} OT)</span>}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'var(--surface-2)', flexShrink: 0 }}></div>

              {/* Column 5: On Leave / Absent Column */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    On Leave / Absent
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '2px 8px', borderRadius: 10 }}>
                    {rAbsent.length}
                  </span>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 250, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
                  {loading && rAbsent.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
                  ) : rAbsent.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>All staff checked in</div>
                  ) : (
                    rAbsent.map((emp, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-1)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{emp.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>Absent</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}



      {/* Collapsible Today Attendance Table Section */}
      <div className="card" style={{ width: '100%', marginTop: 24, padding: 0, overflow: 'hidden' }}>
        <div
          onClick={() => setShowAttendanceTable(!showAttendanceTable)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            cursor: 'pointer',
            background: 'var(--surface-1)',
            borderBottom: showAttendanceTable ? '1.5px solid var(--surface-2)' : 'none',
            transition: 'background 0.2s',
            flexWrap: 'wrap',
            gap: 12
          }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--surface-2)'}
          onMouseOut={e => e.currentTarget.style.background = 'var(--surface-1)'}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Users size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} /> 
            <span style={{ whiteSpace: 'nowrap' }}>Today's Attendance Table</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>Total: {tableFilteredEmployees.length}</span>
              <span style={{ fontSize: 13, background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>P: {tableFilteredEmployees.filter(log => log.attendance_id && !log.check_out).length}</span>
              <span style={{ fontSize: 13, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>A: {tableFilteredEmployees.filter(log => log.calculated_status === 'Absent' || log.calculated_status === 'Leave' || log.calculated_status === 'Holiday').length}</span>
            </div>
          </h3>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {showAttendanceTable ? 'Click to Collapse ▲' : 'Click to Expand ▼'}
          </span>
        </div>

        {showAttendanceTable && (
          <div style={{ padding: 20 }}>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
              <div style={{ display: 'flex', flex: '1 1 100%', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search active staff..."
                    value={attendanceSearchQuery}
                    onChange={e => setAttendanceSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px 8px 32px',
                      background: 'var(--surface)',
                      border: '1.5px solid var(--surface-2)',
                      borderRadius: 8,
                      outline: 'none',
                      fontSize: 13,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                {/* Mobile Filter Toggle */}
                <button 
                  className="btn btn-secondary mobile-only-filter-btn" 
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  style={{ padding: '0 12px', borderRadius: 8 }}
                >
                  <Filter size={16} style={{ color: showMobileFilters ? 'var(--primary)' : 'inherit' }} />
                </button>
              </div>

              {/* Collapsible filters on mobile */}
              <div className={`filters-container ${showMobileFilters ? 'show' : ''}`} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 auto', alignItems: 'center' }}>
                <select
                  value={attendanceSelectedBranch}
                  onChange={e => setAttendanceSelectedBranch(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--surface-2)',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 12,
                    flex: '1 1 110px',
                    minWidth: 110,
                    cursor: 'pointer'
                  }}
                >
                  {branchesList.map(br => (
                    <option key={br} value={br}>{br === 'All' ? 'All Restaurants' : br}</option>
                  ))}
                </select>

                <select
                  value={attendanceSelectedDayNight}
                  onChange={e => setAttendanceSelectedDayNight(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--surface-2)',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 12,
                    flex: '1 1 110px',
                    minWidth: 110,
                    cursor: 'pointer'
                  }}
                >
                  <option value="All">All Shifts (Day/Night)</option>
                  <option value="Day">Day Shift</option>
                  <option value="Night">Night Shift</option>
                </select>

                <select
                  value={attendanceSelectedStatus}
                  onChange={e => setAttendanceSelectedStatus(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--surface-2)',
                    borderRadius: 8,
                    outline: 'none',
                    fontSize: 12,
                    flex: '1 1 110px',
                    minWidth: 110,
                    cursor: 'pointer'
                  }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Total Present">Total Present</option>
                  <option value="Currently Present">Currently Present</option>
                  <option value="Checked Out Complete">Checked Out Complete</option>
                  <option value="Break">Break</option>
                  <option value="Late">Late</option>
                  <option value="Absent">Absent</option>
                </select>

                <button className="btn btn-secondary" onClick={exportAttendanceToExcel} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 12, borderRadius: 8, flex: '1 1 110px', justifyContent: 'center' }}>
                  <Download size={14} /> Export Logs
                </button>
              </div>
            </div>
            {/* Table */}
            <div className="table-wrap">
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '800px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-1)' }}>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', width: '50px' }}>#</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', width: '100px' }}>Code</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left', minWidth: '170px' }}>Employee Name</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', width: '140px', minWidth: '135px', whiteSpace: 'nowrap' }}>Shift Hrs</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'left', minWidth: '150px' }}>Branch</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Check-In Time</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Check-Out Time</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Status</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Hours Worked</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Break Time</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, borderBottom: '2px solid var(--surface-2)', textAlign: 'center', width: '120px' }}>Overtime</th>
                  </tr>
                </thead>
                <tbody>
                  {tableFilteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                        No employees found matching filter criteria.
                      </td>
                    </tr>
                  ) : (
                    tableFilteredEmployees.map((emp, index) => {
                      const rowBg = index % 2 === 0 ? 'var(--surface)' : 'rgba(var(--primary-rgb), 0.025)'
                      const sessions = emp.sessions || []
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
                          <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '170px' }}>{emp.name}</td>
                           <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, width: '140px', minWidth: '135px', whiteSpace: 'nowrap' }}>
                             {(() => {
                               const isSplit = Boolean((sessions.length > 0 && sessions[0].is_split_shift) || emp.is_split_shift);
                               const s1Start = ((sessions.length > 0 && sessions[0].shift_start_time) || emp.shift_start_time)?.substring(0, 5);
                               const s1End = ((sessions.length > 0 && sessions[0].shift_end_time) || emp.shift_end_time)?.substring(0, 5);
                               const s2Start = ((sessions.length > 0 && sessions[0].shift_start_time_2) || emp.shift_start_time_2 || emp.start_time_2)?.substring(0, 5);
                               const s2End = ((sessions.length > 0 && sessions[0].shift_end_time_2) || emp.shift_end_time_2 || emp.end_time_2)?.substring(0, 5);

                               if (!s1Start || !s1End) return '--';
                               if (isSplit && s2Start && s2End) {
                                 return (
                                   <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 }}>
                                     <span style={{ whiteSpace: 'nowrap' }}>{s1Start} - {s1End}</span>
                                     <span style={{ color: 'var(--primary)', fontSize: 11, whiteSpace: 'nowrap' }}>{s2Start} - {s2End}</span>
                                   </div>
                                 );
                               }
                               return <span style={{ whiteSpace: 'nowrap' }}>{s1Start} - {s1End}</span>;
                             })()}
                           </td>
                           <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600 }}>
                             {(() => {
                               const b = emp.branch || 'R1';
                               const sVal = String(emp.new_shift || emp.shift || 'Day').toLowerCase();
                               const suffix = sVal.includes('night') || sVal.includes('n') ? 'N' : 'D';
                               return `${b}-${suffix}`;
                             })()}
                           </td>

                          <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, textAlign: 'center', color: 'var(--green)' }}>
                            {sessions.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {sessions.map((s, idx) => (
                                  <div key={idx}>In: {new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                                ))}
                              </div>
                            ) : (
                              '--'
                            )}
                          </td>

                          <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, textAlign: 'center', color: 'var(--text-muted)' }}>
                            {sessions.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {sessions.map((s, idx) => (
                                  <div key={idx}>
                                    {s.check_out ? `Out: ${new Date(s.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'Active'}
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
                            {formatBreakTime(emp.total_break_seconds_today || 0)}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--primary)', textAlign: 'center' }}>
                            {decimalHoursToText(Math.max(0, parseFloat(emp.total_hours_today || 0) - (parseFloat(emp.shift_hours) || 12.0)))}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
