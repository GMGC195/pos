import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from '../api'
import { useAuth } from '../contexts/AuthContext'
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
  Filter
} from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler)

import { CURRENCY } from '../config'
import { BRAND_NAME, BRAND_PRIMARY, BRAND_SECONDARY, BRAND_LOGO } from '../branding'

const PALETTE = [BRAND_PRIMARY, BRAND_SECONDARY, '#10b981', '#3b82f6', '#8b5cf6', '#f97316']

const statCards = [
  { key: 'totalSale', label: 'Total Sale', icon: <CircleDollarSign size={24} strokeWidth={2.5} />, color: BRAND_SECONDARY, prefix: CURRENCY, format: v => Math.round(v).toLocaleString() },
  { key: 'dailyRevenue', label: 'Daily Revenue', icon: <TrendingUp size={24} strokeWidth={2.5} />, color: '#10b981', prefix: CURRENCY, format: v => Math.round(v).toLocaleString() },
  { key: 'totalOrders', label: 'Total Orders', icon: <Receipt size={24} strokeWidth={2.5} />, color: BRAND_PRIMARY, prefix: '', format: v => v },
  { key: 'guestsToday', label: 'Guest Today', icon: <Users size={24} strokeWidth={2.5} />, color: '#8b5cf6', prefix: '', format: v => v },
]

function StatCard({ stat, value, loading }) {
  return (
    <div className="stat-card" style={{ '--card-color': stat.color }}>
      <div className="stat-icon" style={{ '--card-color': stat.color }}>
        {stat.icon}
      </div>
      <div className="stat-info">
        {loading
          ? <div className="skeleton" style={{ height: 32, width: 80 }} />
          : <h3>{stat.prefix}{stat.format(value ?? 0)}</h3>
        }
        <p>{stat.label}</p>
        <div className="trend" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <TrendingUp size={14} color="#10b981" /> vs yesterday
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isDeveloper = user?.role?.toLowerCase() === 'developer'

  useEffect(() => {
    if (user?.role?.toLowerCase() === 'operator') {
      navigate('/attendance', { replace: true })
    }
  }, [user, navigate])

  // Developer sales states
  const [stats, setStats] = useState(null)
  const TARGET_REVENUE = 15000

  // Attendance states (all users see these stats)
  const [attendanceStats, setAttendanceStats] = useState(null)
  const [todayActivity, setTodayActivity] = useState([])
  const [allEmployees, setAllEmployees] = useState([])
  const [analyticsData, setAnalyticsData] = useState(null)
  const [timeRange, setTimeRange] = useState('weekly')
  const [loading, setLoading] = useState(true)
  const [personalStats, setPersonalStats] = useState(null)
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState('')
  const [attendanceSelectedShift, setAttendanceSelectedShift] = useState('All')
  const [attendanceSelectedDepartment, setAttendanceSelectedDepartment] = useState('All')
  const [attendanceSelectedStatus, setAttendanceSelectedStatus] = useState('All')
  const [showAttendanceTable, setShowAttendanceTable] = useState(false)

  const loadStats = () => {
    setLoading(true)

    if (user?.role?.toLowerCase() === 'employee') {
      axios.get('/api/attendance/personal-stats')
        .then(r => setPersonalStats(r.data))
        .catch(() => setPersonalStats(null))
        .finally(() => setLoading(false))
      return;
    }

    // Only fetch sales stats if the user is a developer
    if (isDeveloper) {
      axios.get('/api/stats')
        .then(r => setStats(r.data))
        .catch(() => setStats({
          totalSale: 0, dailyRevenue: 0, totalProductCost: 0, totalOrders: 0, guestsToday: 0,
          last7Days: Array.from({ length: 7 }, (_, i) => ({ label: `Day ${i + 1}`, total: 0 })),
          topItems: [],
        }))
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

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 180000) // Auto-refresh every 3 mins
    return () => clearInterval(interval)
  }, [isDeveloper])

  const exportExcel = async () => {
    if (!isDeveloper) return
    const XLSX = await import('xlsx')
    const data = [
      { Metric: "Today Total Sale", Value: stats?.totalSale || 0 },
      { Metric: "Today Total Order Delivered", Value: stats?.totalOrders || 0 },
      { Metric: "Today Total Product Cost", Value: stats?.totalProductCost || 0 },
      { Metric: "Targeted Revenue", Value: TARGET_REVENUE },
      { Metric: "Today Earned Revenue", Value: stats?.dailyRevenue || 0 },
      { Metric: "Completion Revenue %", Value: stats ? `${((stats.dailyRevenue / TARGET_REVENUE) * 100).toFixed(1)}%` : "0%" },
    ]
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard Stats")
    XLSX.writeFile(wb, `Dashboard-Summary-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const exportPDF = () => {
    if (!isDeveloper) return
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
            <div class="card"><div class="label">Today Total Sale</div><div class="value">${CURRENCY}${stats?.totalSale?.toLocaleString()}</div></div>
            <div class="card"><div class="label">Total Orders Delivered</div><div class="value">${stats?.totalOrders}</div></div>
            <div class="card"><div class="label">Total Product Cost</div><div class="value">${CURRENCY}${stats?.totalProductCost?.toLocaleString()}</div></div>
            <div class="card"><div class="label">Targeted Revenue</div><div class="value">${CURRENCY}${TARGET_REVENUE.toLocaleString()}</div></div>
            <div class="card"><div class="label">Today Earned Revenue</div><div class="value">${CURRENCY}${stats?.dailyRevenue?.toLocaleString()}</div></div>
            <div class="card"><div class="label">Completion Revenue %</div><div class="value">${stats ? ((stats.dailyRevenue / TARGET_REVENUE) * 100).toFixed(1) : 0}%</div></div>
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

  const donutData = {
    labels: stats?.topItems?.map(f => f.name) ?? [],
    datasets: [{
      data: stats?.topItems?.map(f => f.value) ?? [],
      backgroundColor: PALETTE,
      borderWidth: 0,
      hoverOffset: 8,
    }],
  }

  const donutOpts = {
    responsive: true, maintainAspectRatio: false,
    cutout: '68%',
    plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } } },
  }

  // --- DEVELOPER DASHBOARD VIEW ---
  if (isDeveloper) {
    return (
      <>
        {/* Stat Cards */}
        <div className="stat-cards">
          {statCards.map(s => (
            <StatCard key={s.key} stat={s} value={stats?.[s.key]} loading={loading} />
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
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Flame size={20} color="#FF6B35" fill="#FF6B35" /> Top Selling Items</h3>
            <div className="donut-chart-container" style={{ height: 280, position: 'relative' }}>
              {loading
                ? <div className="skeleton" style={{ height: '100%' }} />
                : stats?.topItems?.length > 0
                  ? (
                    <>
                      <Doughnut data={donutData} options={donutOpts} />
                      <div className="donut-logo-overlay" style={{
                        position: 'absolute',
                        top: '36%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.25s ease-in-out',
                      }}>
                        <img
                          src={BRAND_LOGO}
                          alt="Logo"
                          style={{
                            width: 105,
                            height: 105,
                            objectFit: 'cover',
                            borderRadius: '50%',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            border: '3px solid white',
                            background: 'white'
                          }}
                        />
                      </div>
                    </>
                  )
                  : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>No sales data yet</div>
              }
            </div>
          </div>
        </div>

        {/* Staff Attendance Summary */}
        {attendanceStats && (
          <div className="card" style={{ marginBottom: 24, marginTop: 24 }}>
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <Fingerprint size={20} style={{ color: 'var(--primary)' }} /> Staff Presence Today
              </h3>
            </div>
            <div className="summary-grid" style={{ marginTop: 10 }}>
              {[
                { label: 'Active Staff Now', val: attendanceStats.present_now, color: 'var(--green)' },
                { label: 'On Break', val: attendanceStats.on_break, color: 'var(--primary)' },
                { label: 'Late Arrivals Today', val: attendanceStats.late_today, color: '#F97316' },
                { label: 'Checked Out', val: attendanceStats.checked_out, color: 'var(--text-muted)' },
                { label: 'Absent Staff', val: attendanceStats.absent, color: 'var(--red)' },
                { label: 'Total Registered Staff', val: attendanceStats.total_employees, color: 'var(--text-secondary)' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--surface)', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--surface-2)' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: item.color }}>{loading ? '...' : item.val}</div>
                  <div style={{ fontWeight: 600, marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's Summary */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><Receipt size={20} /> Today's Summary</h3>
              <span className="badge badge-success">Live</span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={loadStats} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
              </button>
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
              { label: 'Today Total Sale', val: stats ? `${CURRENCY}${stats.totalSale.toLocaleString()}` : '0', color: 'var(--red)' },
              { label: 'Today Total Order Delivered', val: stats ? stats.totalOrders.toString() : '0', color: '#3b82f6' },
              { label: 'Today Total Product Cost', val: stats ? `${CURRENCY}${stats.totalProductCost.toLocaleString()}` : '0', color: '#f59e0b' },
              { label: 'Targeted Revenue', val: `${CURRENCY}${TARGET_REVENUE.toLocaleString()}`, color: 'var(--text-muted)' },
              { label: 'Today Earned Revenue', val: stats ? `${CURRENCY}${stats.dailyRevenue.toLocaleString()}` : '0', color: '#10b981' },
              { label: 'Completion Revenue %', val: stats ? `${((stats.dailyRevenue / TARGET_REVENUE) * 100).toFixed(1)}%` : '0%', color: '#8b5cf6' },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--surface)', borderRadius: 12, padding: '24px', border: '1px solid var(--surface-2)' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: item.color }}>{loading ? '...' : item.val}</div>
                <div style={{ fontWeight: 600, marginTop: 6, color: 'var(--text-secondary)' }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }

  // --- REGULAR ATTENDANCE DASHBOARD VIEW (ADMIN, OPERATOR, ETC.) ---
  const totalEmployeesCount = todayActivity.length;
  const lateCount = todayActivity.filter(log => log.attendance_id && log.attendance_status === 'Late').length;
  const currentlyPresentCount = todayActivity.filter(log => log.attendance_id && !log.check_out).length;
  const absentCount = todayActivity.filter(log => !log.attendance_id || log.attendance_status === 'Leave' || log.attendance_status === 'Holiday').length;
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
  const shiftOrder = ['R1-D', 'R2-D', 'R3-D', 'R1-N', 'R2-N', 'R3-N'];
  const employeeShifts = new Set((allEmployees.length > 0 ? allEmployees : todayActivity).map(e => e.shift).filter(Boolean));
  // Always show all defined shifts; append any extra shifts found in data at the end
  const extraShifts = [...employeeShifts].filter(s => !shiftOrder.includes(s)).sort((a, b) => a.localeCompare(b));
  const uniqueShifts = [...shiftOrder, ...extraShifts];
  const presentData = uniqueShifts.map(shiftName =>
    todayActivity.filter(e => e.shift === shiftName && e.attendance_id).length
  );
  const enrolledData = uniqueShifts.map(shiftName =>
    (allEmployees.length > 0 ? allEmployees : todayActivity).filter(e => e.shift === shiftName).length
  );

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
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{personalStats?.total_hours || 0} hrs</h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Hours Worked</p>
                </div>
              </div>

              <div style={{ borderLeft: '3px solid var(--primary)' }} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
                  <div style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)', padding: 12, borderRadius: 10 }}>
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{personalStats?.overtime || 0} hrs</h3>
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
                            {new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center' }}>
                            {log.check_out ? new Date(log.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
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
  const absentEmployees = todayActivity.filter(log => !log.attendance_id || log.attendance_status === 'Leave' || log.attendance_status === 'Holiday')

  const departmentsList = ['All', ...new Set(todayActivity.map(emp => emp.department).filter(Boolean))].sort()
  const shiftsDropdownList = ['All', ...new Set(todayActivity.map(emp => emp.shift).filter(Boolean))].sort()

  const tableFilteredEmployees = todayActivity.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(attendanceSearchQuery.toLowerCase()) ||
      String(emp.employee_id).toLowerCase().includes(attendanceSearchQuery.toLowerCase());
    const matchesShift = attendanceSelectedShift === 'All' || emp.shift === attendanceSelectedShift;
    const matchesDept = attendanceSelectedDepartment === 'All' || emp.department === attendanceSelectedDepartment;

    let matchesStatus = true;
    const hasSessions = emp.sessions && emp.sessions.length > 0;
    const isCurrentlyCheckedIn = emp.attendance_id && !emp.check_out;

    if (attendanceSelectedStatus === 'Present') {
      matchesStatus = isCurrentlyCheckedIn;
    } else if (attendanceSelectedStatus === 'CheckedOut') {
      matchesStatus = hasSessions && !isCurrentlyCheckedIn;
    } else if (attendanceSelectedStatus === 'Late') {
      matchesStatus = hasSessions && emp.attendance_status === 'Late';
    } else if (attendanceSelectedStatus === 'Absent') {
      matchesStatus = !hasSessions;
    }

    return matchesSearch && matchesShift && matchesDept && matchesStatus;
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
        @media (max-width: 767px) {
          .attendance-analytics-row {
            justify-content: center !important;
          }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
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
        <button className="btn btn-secondary btn-sm dashboard-refresh-btn" onClick={loadStats} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .dashboard-refresh-btn {
            display: none !important;
          }
        }
      `}</style>

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
        <div className="card" style={{ padding: 20, flex: '1 1 calc(50% - 16px)', minWidth: 320 }}>
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
        <div className="card" style={{ padding: 20, flex: '1 1 calc(50% - 16px)', minWidth: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Today's Shift Attendance</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Present vs Enrolled Staff</span>
              </div>
            </div>
            <div style={{ height: 240 }}>
              <Bar data={attendanceBarData} options={attendanceBarOpts} />
            </div>
          </div>
      </div>

      {/* Attendance Status Cards Row */}
      <div className="attendance-bottom-cards-container" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24, width: '100%' }}>
        {/* Column 1: Currently Present Column */}
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', flex: '1 1 200px', minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Currently Present
              </h3>
              <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)', padding: '2px 8px', borderRadius: 10 }}>
                {currentlyPresentEmployees.length}
              </span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 200, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
              {loading && currentlyPresentEmployees.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Loading...
                </div>
              ) : currentlyPresentEmployees.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No active present staff
                </div>
              ) : (
                currentlyPresentEmployees.map((log, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Shift {log.shift || 'R1'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {log.on_break && (
                        <span style={{ fontSize: 10, color: 'var(--primary)', background: 'rgba(var(--primary-rgb), 0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                          On Break
                        </span>
                      )}
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 11, color: 'var(--green)', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, display: 'inline-block' }}>
                          In: {log.check_in ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {parseFloat(log.total_hours_today || 0).toFixed(1)} Hrs
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        {/* Column 2: Late Arrivals Today */}
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', flex: '1 1 200px', minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Late Arrivals
              </h3>
              <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(249, 115, 22, 0.1)', color: '#F97316', padding: '2px 8px', borderRadius: 10 }}>
                {lateEmployees.length}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 200, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
              {loading && lateEmployees.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Loading...
                </div>
              ) : lateEmployees.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12, padding: '20px 0' }}>
                  No late arrivals today
                </div>
              ) : (
                lateEmployees.map((log, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{log.name}</span>
                    <span style={{ fontSize: 11, color: '#F97316', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                      {log.check_in ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Late'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        {/* Column 3: Staff On Break Column */}
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', flex: '1 1 200px', minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Staff On Break
              </h3>
              <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 10 }}>
                {onBreakEmployees.length}
              </span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 200, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
              {loading && onBreakEmployees.length === 0 ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Loading...
                </div>
              ) : onBreakEmployees.length === 0 ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No staff on break
                </div>
              ) : (
                onBreakEmployees.map((log, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{log.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--primary)', background: 'rgba(var(--primary-rgb), 0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                      On Break
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        {/* Column 4: Checked Out Today Column */}
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', flex: '1 1 200px', minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Checked Out Today
              </h3>
              <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(156, 163, 175, 0.1)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 10 }}>
                {checkedOutEmployees.length}
              </span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 200, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
              {loading && checkedOutEmployees.length === 0 ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Loading...
                </div>
              ) : checkedOutEmployees.length === 0 ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No checked out staff
                </div>
              ) : (
                checkedOutEmployees.map((log, idx) => {
                  const otHours = Math.max(0, parseFloat(log.total_hours_today || 0) - (parseFloat(log.shift_hours) || 12.0));
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Shift {log.shift || 'R1'}</span>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 2 }}>
                          <span style={{ fontSize: 10, color: 'var(--green)', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, display: 'inline-block' }}>
                            In: {log.check_in ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, display: 'inline-block' }}>
                            Out: {log.check_out ? new Date(log.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {parseFloat(log.total_hours_today || 0).toFixed(1)} Hrs {otHours > 0 && <span style={{ color: 'var(--primary)' }}>({otHours.toFixed(1)} OT)</span>}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        {/* Column 5: On Leave / Absent Column */}
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', flex: '1 1 200px', minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                On Leave / Absent
              </h3>
              <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '2px 8px', borderRadius: 10 }}>
                {absentEmployees.length}
              </span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 200, display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
              {loading && absentEmployees.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Loading...
                </div>
              ) : absentEmployees.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  All staff checked in
                </div>
              ) : (
                absentEmployees.map((emp, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{emp.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                      Absent
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
      </div>



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
            transition: 'background 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--surface-2)'}
          onMouseOut={e => e.currentTarget.style.background = 'var(--surface-1)'}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={20} style={{ color: 'var(--primary)' }} /> Today's Attendance Table
          </h3>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
            {showAttendanceTable ? 'Click to Collapse ▲' : 'Click to Expand ▼'}
          </span>
        </div>

        {showAttendanceTable && (
          <div style={{ padding: 20 }}>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search active staff..."
                  value={attendanceSearchQuery}
                  onChange={e => setAttendanceSearchQuery(e.target.value)}
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

              <select
                value={attendanceSelectedShift}
                onChange={e => setAttendanceSelectedShift(e.target.value)}
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
                {shiftsDropdownList.map(sh => (
                  <option key={sh} value={sh}>{sh === 'All' ? 'All Shifts' : `Shift ${sh}`}</option>
                ))}
              </select>

              <select
                value={attendanceSelectedDepartment}
                onChange={e => setAttendanceSelectedDepartment(e.target.value)}
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
                {departmentsList.map(dept => (
                  <option key={dept} value={dept}>{dept === 'All' ? 'All Departments' : dept}</option>
                ))}
              </select>

              <select
                value={attendanceSelectedStatus}
                onChange={e => setAttendanceSelectedStatus(e.target.value)}
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

              <button
                className="btn btn-secondary"
                onClick={exportAttendanceToExcel}
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

            {/* Table */}
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
                          <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{emp.employee_code || emp.employee_id}</td>
                          <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '220px' }}>{emp.name}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600 }}>{emp.shift || 'R1'}</td>

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
