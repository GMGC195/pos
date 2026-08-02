import { useEffect, useState } from 'react'
import axios from '../api'
import * as XLSX from 'xlsx'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { CircleDollarSign, Receipt, Clock, Users, TrendingUp, Flame, Printer, Download, RefreshCw, Fingerprint, Coffee, UserX } from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler)

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
  const [stats, setStats] = useState(null)
  const [attendanceStats, setAttendanceStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const TARGET_REVENUE = 15000

  const loadStats = () => {
    setLoading(true)
    
    // Fetch stats
    axios.get('/api/stats')
      .then(r => setStats(r.data))
      .catch(() => setStats({
        totalSale: 0, dailyRevenue: 0, totalProductCost: 0, totalOrders: 0, guestsToday: 0,
        last7Days: Array.from({ length: 7 }, (_, i) => ({ label: `Day ${i+1}`, total: 0 })),
        topItems: [],
      }))

    // Fetch attendance stats
    axios.get('/api/attendance/stats')
      .then(r => setAttendanceStats(r.data))
      .catch(() => setAttendanceStats(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 180000) // Auto-refresh every 3 mins
    return () => clearInterval(interval)
  }, [])

  const exportExcel = () => {
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
      y: { grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true,
        ticks: { callback: v => `${CURRENCY}${v}` } },
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
                : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#9ca3af' }}>No sales data yet</div>
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
          
          <div style={{ display:'flex', gap:10, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadStats} disabled={loading}>
              <RefreshCw size={14} className={loading?'spin':''} /> Refresh
            </button>
            <button className="btn btn-secondary btn-sm" onClick={exportPDF}>
              <Printer size={14} /> Export PDF
            </button>
            <button className="btn btn-secondary btn-sm" onClick={exportExcel}>
              <Download size={14} /> Export Excel
            </button>
          </div>
        </div>

        <div className="summary-grid" style={{ marginTop:10 }}>
          {[
            { label:'Today Total Sale', val: stats ? `${CURRENCY}${stats.totalSale.toLocaleString()}` : '0', color:'var(--red)' },
            { label:'Today Total Order Delivered', val: stats ? stats.totalOrders.toString() : '0', color:'#3b82f6' },
            { label:'Today Total Product Cost', val: stats ? `${CURRENCY}${stats.totalProductCost.toLocaleString()}` : '0', color:'#f59e0b' },
            { label:'Targeted Revenue', val: `${CURRENCY}${TARGET_REVENUE.toLocaleString()}`, color:'var(--text-muted)' },
            { label:'Today Earned Revenue', val: stats ? `${CURRENCY}${stats.dailyRevenue.toLocaleString()}` : '0', color:'#10b981' },
            { label:'Completion Revenue %', val: stats ? `${((stats.dailyRevenue / TARGET_REVENUE) * 100).toFixed(1)}%` : '0%', color:'#8b5cf6' },
          ].map(item => (
            <div key={item.label} style={{ background:'var(--surface)', borderRadius:12, padding:'24px', border:'1px solid var(--surface-2)' }}>
              <div style={{ fontSize:28, fontWeight:800, color: item.color }}>{loading ? '...' : item.val}</div>
              <div style={{ fontWeight:600, marginTop:6, color:'var(--text-secondary)' }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
