import React, {  useState, useEffect, useMemo , useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import axios from '../api';
import toast from 'react-hot-toast';
import { Calendar, TrendingUp, User, RefreshCw, X, Edit3, ShieldAlert, AlertCircle, Layers } from 'lucide-react';
import EditShiftClosingModal from './EditShiftClosingModal';
import { useAuth } from '../contexts/AuthContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function DailyShiftClosingGraph({
  currency = 'SAR',
  branch = 'All',
  onDataLoaded,
  onShiftUpdated
}) {
  const { user } = useAuth();
  const userRole = (user?.role || '').trim().toLowerCase();
  const isAuthorized = userRole === 'admin' || userRole === 'developer';

  // Date-range filter options in exact requested order:
  // 1. Today, 2. Yesterday, 3. Last 7 Days, 4. Last Month, 5. Custom Date
  const [period, setPeriod] = useState('today');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Data states
  const [loading, setLoading] = useState(false);
  const [shiftData, setShiftData] = useState({
    summary: { total_actual: 0, total_system: 0, total_difference: 0, cashiers: [] },
    timeline: [],
    restaurants: []
  });

  // Edit Modal States (Only for Developer & Admin)
  const [selectedClosing, setSelectedClosing] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [shiftPickerData, setShiftPickerData] = useState(null);

  // Fetch closing analytics based on filter
  const fetchAnalytics = async (selectedPeriod = period, sDate = customStart, eDate = customEnd) => {
    try {
      setLoading(true);
      const params = { period: selectedPeriod };
      if (branch && branch !== 'All') {
        params.branch = branch;
      }
      if (selectedPeriod === 'custom') {
        if (sDate) params.start_date = sDate;
        if (eDate) params.end_date = eDate;
      }

      const res = await axios.get('/api/stats/shift-closing-analytics', { params });
      if (res.data) {
        const payload = {
          summary: res.data.summary || { total_actual: 0, total_system: 0, total_difference: 0, cashiers: [] },
          timeline: Array.isArray(res.data.timeline) ? res.data.timeline : [],
          restaurants: Array.isArray(res.data.restaurants) ? res.data.restaurants : []
        };
        setShiftData(payload);
        if (typeof onDataLoaded === 'function') {
          onDataLoaded(res.data);
        }
      }
    } catch (err) {
      console.error('Failed to load shift closing analytics:', err);
      toast.error('Could not load daily closing data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(period);
  }, [period, branch]);

  // Handle Custom Date Apply
  const handleApplyCustom = (e) => {
    if (e) e.preventDefault();
    if (!customStart || !customEnd) {
      return toast.error('Please select both Start Date and End Date.');
    }
    if (customStart > customEnd) {
      return toast.error('Start Date cannot be later than End Date.');
    }
    setPeriod('custom');
    setShowCustomModal(false);
    fetchAnalytics('custom', customStart, customEnd);
  };

  // Handle Reset filter to Today
  const handleResetFilter = () => {
    setCustomStart('');
    setCustomEnd('');
    setShowCustomModal(false);
    setPeriod('today');
  };

  // Helper to open edit modal for a specific shift object
  const openEditModalForShift = (shift, branchName = '') => {
    if (!shift || !shift.id) {
      return toast.info('This shift record has no saved closing entry yet.');
    }
    setSelectedClosing({
      id: shift.id,
      branch: branchName || shift.branch || 'Branch',
      closing_type: shift.shift_name || shift.closing_type || 'Shift',
      cashier_name: shift.cashier_name || 'Cashier',
      total_sales: parseFloat(shift.system_sales !== undefined ? shift.system_sales : (shift.system || 0)),
      system_sales: parseFloat(shift.system_sales !== undefined ? shift.system_sales : (shift.system || 0)),
      closing_cash: shift.closing_cash !== null && shift.closing_cash !== undefined ? parseFloat(shift.closing_cash) : parseFloat(shift.actual_sales !== undefined ? shift.actual_sales : (shift.actual || 0)),
      closing_card: shift.closing_card !== null && shift.closing_card !== undefined ? parseFloat(shift.closing_card) : 0,
      difference: parseFloat(shift.difference_amount !== undefined ? shift.difference_amount : (shift.difference || 0)),
      difference_reason: shift.difference_reason || ''
    });
    setShowEditModal(true);
  };

  // Click on Shift Card
  const handleCardClick = (rest, shift) => {
    if (!isAuthorized) {
      return toast.error('Developer or Admin authorization required to edit shift closing records.');
    }
    if (!shift || !shift.is_closed || !shift.id) {
      return toast.info(`${shift?.shift_name || 'Shift'} is currently active and not closed yet. Actual entry can only be edited once closed.`);
    }
    openEditModalForShift(shift, rest.restaurant_name);
  };

  // Click on Restaurant Comparison Line / Percentage Bar
  const handleComparisonLineClick = (rest) => {
    if (!isAuthorized) {
      return toast.error('Developer or Admin authorization required to edit closing records.');
    }
    const closed = [];
    if (rest.day_shift?.is_closed && rest.day_shift?.id) {
      closed.push({ ...rest.day_shift, type: 'Day Shift' });
    }
    if (rest.night_shift?.is_closed && rest.night_shift?.id) {
      closed.push({ ...rest.night_shift, type: 'Night Shift' });
    }

    if (closed.length === 0) {
      return toast.info(`No closed shifts found for ${rest.restaurant_name} in this period.`);
    } else if (closed.length === 1) {
      openEditModalForShift(closed[0], rest.restaurant_name);
    } else {
      // Multiple closed shifts: open picker
      setShiftPickerData({
        title: `Select Shift to Edit — ${rest.restaurant_name}`,
        restName: rest.restaurant_name,
        shifts: closed
      });
    }
  };

  

    // Restaurants for Restaurant Comparison section and graph points
  const restaurants = useMemo(() => {
    if (shiftData.restaurants && shiftData.restaurants.length > 0) {
      return shiftData.restaurants;
    }
    return [
      {
        restaurant_id: 'R1',
        restaurant_name: 'Restaurant 1',
        day_shift: { shift_name: 'Day Shift', cashier_name: 'Day Cashier', system_sales: 0, actual_sales: 0 },
        night_shift: { shift_name: 'Night Shift', cashier_name: 'Night Cashier', system_sales: 0, actual_sales: 0 },
        total_actual_sales: 0,
        total_system_sales: 0
      },
      {
        restaurant_id: 'R2',
        restaurant_name: 'Restaurant 2',
        day_shift: { shift_name: 'Day Shift', cashier_name: 'Day Cashier', system_sales: 0, actual_sales: 0 },
        night_shift: { shift_name: 'Night Shift', cashier_name: 'Night Cashier', system_sales: 0, actual_sales: 0 },
        total_actual_sales: 0,
        total_system_sales: 0
      },
      {
        restaurant_id: 'R3',
        restaurant_name: 'Restaurant 3',
        day_shift: { shift_name: 'Day Shift', cashier_name: 'Day Cashier', system_sales: 0, actual_sales: 0 },
        night_shift: { shift_name: 'Night Shift', cashier_name: 'Night Cashier', system_sales: 0, actual_sales: 0 },
        total_actual_sales: 0,
        total_system_sales: 0
      }
    ];
  }, [shiftData.restaurants]);

  // Ref to hold metadata for chart points (tooltips & click handling)
  const chartPointsMeta = useRef([]);

  // Prepare chart data: Line 1 = Actual (#2563eb Blue), Line 2 = System (#f97316 Orange)
  const chartData = useMemo(() => {
    let labels = [];
    let actualPoints = [];
    let systemPoints = [];
    let meta = [];

    // If viewing Today (or timeline has <= 1 item), show shift-wise comparison points: R1 Day, R1 Night, R2 Day, etc.
    const showShiftWise = (period === 'today' || (shiftData.timeline && shiftData.timeline.length <= 1)) && restaurants.length > 0;

    if (showShiftWise) {
      restaurants.forEach(rest => {
        // Day Shift Point
        const d = rest.day_shift;
        const dSys = parseFloat(d?.system_sales || 0);
        const dAct = parseFloat(d?.actual_sales || 0);
        const dDiff = Math.round((dAct - dSys) * 100) / 100;
        labels.push(`${rest.restaurant_id} Day`);
        actualPoints.push(dAct);
        systemPoints.push(dSys);
        meta.push({
          shiftTitle: `${rest.restaurant_name} - Day Shift`,
          cashier: d?.cashier_name || 'Day Cashier',
          actual: dAct,
          system: dSys,
          difference: dDiff,
          reason: d?.difference_reason,
          is_edited: d?.is_edited,
          shiftObj: d,
          restName: rest.restaurant_name
        });

        // Night Shift Point
        const n = rest.night_shift;
        const nSys = parseFloat(n?.system_sales || 0);
        const nAct = parseFloat(n?.actual_sales || 0);
        const nDiff = Math.round((nAct - nSys) * 100) / 100;
        labels.push(`${rest.restaurant_id} Night`);
        actualPoints.push(nAct);
        systemPoints.push(nSys);
        meta.push({
          shiftTitle: `${rest.restaurant_name} - Night Shift`,
          cashier: n?.cashier_name || 'Night Cashier',
          actual: nAct,
          system: nSys,
          difference: nDiff,
          reason: n?.difference_reason,
          is_edited: n?.is_edited,
          shiftObj: n,
          restName: rest.restaurant_name
        });
      });
    } else if (shiftData.timeline && shiftData.timeline.length > 0) {
      labels = shiftData.timeline.map(t => t.display_date || t.date);
      actualPoints = shiftData.timeline.map(t => t.actual_closing);
      systemPoints = shiftData.timeline.map(t => t.system_closing);
      meta = shiftData.timeline.map(t => ({
        shiftTitle: `${t.display_date || t.date}`,
        cashier: t.cashier_names || 'Staff',
        actual: t.actual_closing,
        system: t.system_closing,
        difference: t.difference,
        reason: t.daily_difference_reason || t.shifts?.find(s => s.difference_reason)?.difference_reason,
        is_edited: t.is_daily_edited || t.shifts?.some(s => s.is_edited),
        timelineItem: t
      }));
    } else {
      labels = ['Today'];
      actualPoints = [shiftData.summary?.total_actual || 0];
      systemPoints = [shiftData.summary?.total_system || 0];
      meta = [{
        shiftTitle: 'Today',
        cashier: 'Staff',
        actual: shiftData.summary?.total_actual || 0,
        system: shiftData.summary?.total_system || 0,
        difference: (shiftData.summary?.total_actual || 0) - (shiftData.summary?.total_system || 0)
      }];
    }

    chartPointsMeta.current = meta;

    return {
      labels,
      datasets: [
        {
          label: 'Actual Closing Amount',
          data: actualPoints,
          borderColor: '#2563eb', // Line 1: Actual Amount (Blue #2563eb)
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          pointBackgroundColor: '#2563eb',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 8,
          borderWidth: 2.5,
          tension: 0.3,
          fill: false
        },
        {
          label: 'System Generated Closing Amount',
          data: systemPoints,
          borderColor: '#f97316', // Line 2: System-Generated Amount (Orange #f97316)
          backgroundColor: 'rgba(249, 115, 22, 0.08)',
          pointBackgroundColor: '#f97316',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 8,
          borderWidth: 2.5,
          tension: 0.3,
          fill: false
        }
      ]
    };
  }, [shiftData, period, restaurants]);

  // Chart options with click handler & edit note in tooltip
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    onClick: (event, elements) => {
      if (!elements || elements.length === 0) return;
      const idx = elements[0].index;
      const meta = chartPointsMeta.current[idx];
      if (!meta) return;

      if (!isAuthorized) {
        return toast.error('Developer or Admin authorization required to edit closing records.');
      }

      if (meta.shiftObj) {
        if (!meta.shiftObj.is_closed || !meta.shiftObj.id) {
          return toast.info(`${meta.shiftTitle} is currently active and not closed yet. Actual entry can only be edited once closed.`);
        }
        openEditModalForShift(meta.shiftObj, meta.restName);
        return;
      }

      if (meta.timelineItem) {
        const item = meta.timelineItem;
        if (item.shifts && item.shifts.length > 0) {
          const closed = item.shifts.filter(s => s.id);
          if (closed.length === 1) {
            openEditModalForShift(closed[0]);
          } else if (closed.length > 1) {
            setShiftPickerData({
              title: `Select Shift to Edit (${item.display_date || item.date})`,
              restName: item.display_date || item.date,
              shifts: closed.map(s => ({
                id: s.id,
                shift_name: s.closing_type || 'Shift',
                cashier_name: s.cashier_name,
                system_sales: s.system,
                actual_sales: s.actual,
                closing_cash: s.closing_cash,
                closing_card: s.closing_card,
                difference_amount: s.difference,
                difference_reason: s.difference_reason,
                is_edited: s.is_edited,
                is_closed: true,
                branch: s.branch
              }))
            });
          }
        } else if (item.daily_closing_id) {
          setSelectedClosing({
            id: item.daily_closing_id,
            branch: branch || 'All',
            closing_type: 'Daily',
            cashier_name: item.cashier_names,
            total_sales: item.system_closing,
            system_sales: item.system_closing,
            closing_cash: item.actual_closing,
            closing_card: 0,
            difference: item.difference,
            difference_reason: item.daily_difference_reason
          });
          setShowEditModal(true);
        }
      }
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          font: { size: 12, weight: '700' },
          color: 'var(--text-secondary, #475569)'
        }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          title: (context) => {
            const idx = context[0]?.dataIndex;
            const meta = chartPointsMeta.current[idx];
            if (meta) {
              return `${meta.shiftTitle} (${meta.cashier})`;
            }
            return context[0]?.label || '';
          },
          label: (context) => {
            const val = context.parsed.y !== null ? context.parsed.y : 0;
            return ` ${context.dataset.label}: ${currency} ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          },
          afterBody: (context) => {
            const idx = context[0]?.dataIndex;
            const meta = chartPointsMeta.current[idx];
            if (meta) {
              const diffSign = meta.difference >= 0 ? '+' : '';
              let txt = `\nDifference (Actual - System): ${diffSign}${currency} ${meta.difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              if (meta.is_edited && meta.reason) {
                const cleanReason = meta.reason.split('\n').pop().replace(/^\[Edited.*?\]:\s*/, '');
                txt += `\n✏️ Edited Reason: ${cleanReason}`;
              }
              if (isAuthorized) {
                txt += `\n💡 Click point to edit closing record`;
              }
              return txt;
            }
            return '';
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 11, weight: '600' },
          color: 'var(--text-muted, #64748b)'
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(226, 232, 240, 0.6)' },
        ticks: {
          font: { size: 11, weight: '600' },
          color: 'var(--text-muted, #64748b)',
          callback: (val) => `${currency} ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`
        }
      }
    }
  }), [shiftData, currency, isAuthorized, branch]);



  // Calculate totals and max for horizontal comparison lines
  const grandTotalActual = useMemo(() => {
    return restaurants.reduce((sum, r) => sum + (parseFloat(r.total_actual_sales) || 0), 0);
  }, [restaurants]);

  const maxRestaurantSales = useMemo(() => {
    const vals = restaurants.map(r => parseFloat(r.total_actual_sales) || 0);
    return Math.max(1, ...vals);
  }, [restaurants]);

  // Consistent distinct colors for Restaurant 1, 2, 3
  const restaurantColors = {
    R1: { badge: '#f59e0b', bar: '#f59e0b', light: '#fef3c7' }, // Amber / Yellow
    R2: { badge: '#3b82f6', bar: '#3b82f6', light: '#eff6ff' }, // Royal Blue
    R3: { badge: '#10b981', bar: '#10b981', light: '#ecfdf5' }  // Emerald Green
  };

  return (
    <div className="shift-dashboard-wrapper" style={{ width: '100%', marginBottom: 16 }}>
      <style>{`
        .shift-dashboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(360px, 1fr);
          gap: 16px;
          align-items: stretch;
        }
        @media (max-width: 1080px) {
          .shift-dashboard-grid {
            grid-template-columns: 1fr !important;
          }
        }
        .clickable-shift-card {
          cursor: ${isAuthorized ? 'pointer' : 'default'};
          transition: all 0.2s ease;
        }
        .clickable-shift-card:hover {
          ${isAuthorized ? 'border-color: #2563eb !important; background: #f0f7ff !important; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.12) !important;' : ''}
        }
        .clickable-comp-row {
          cursor: ${isAuthorized ? 'pointer' : 'default'};
          padding: 6px 8px;
          border-radius: 8px;
          transition: all 0.2s ease;
        }
        .clickable-comp-row:hover {
          ${isAuthorized ? 'background: #f8fafc !important; box-shadow: 0 1px 4px rgba(0,0,0,0.05);' : ''}
        }
      `}</style>

      <div className="shift-dashboard-grid">

        {/* ══════════════════════════════════════════════════════════════════
            LEFT PANEL: Daily Closing — Actual vs System Generated Graph
            (Clean layout: data below graph completely removed as requested)
        ══════════════════════════════════════════════════════════════════ */}
        <div
          className="chart-card daily-closing-graph-card"
          style={{
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 12,
            padding: '16px 20px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            {/* Top Header Bar: Title & Date Range Filters */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 14
            }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                  <Calendar size={18} color="#2563eb" />
                  Daily Closing — Actual vs System Generated
                </h3>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>
                  Comparison of cashier entered closings against system recorded sales
                  {isAuthorized && (
                    <span style={{ marginLeft: 6, color: '#2563eb', fontWeight: 600 }}>
                      • Click any point to edit
                    </span>
                  )}
                </span>
              </div>

              {/* Exact requested filter buttons in 1-5 order */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'today', label: 'Today' },
                  { key: 'yesterday', label: 'Yesterday' },
                  { key: '7days', label: 'Last 7 Days' },
                  { key: 'last_month', label: 'Last Month' },
                  { key: 'custom', label: 'Custom Date' }
                ].map((f) => {
                  const isActive = period === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        if (f.key === 'custom') {
                          setShowCustomModal(true);
                        } else {
                          setShowCustomModal(false);
                          setPeriod(f.key);
                        }
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: isActive ? 700 : 500,
                        borderRadius: 6,
                        border: '1px solid',
                        borderColor: isActive ? '#2563eb' : '#cbd5e1',
                        background: isActive ? '#2563eb' : 'var(--surface, #ffffff)',
                        color: isActive ? '#ffffff' : 'var(--text-secondary, #475569)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => fetchAnalytics(period)}
                  title="Refresh Closing Data"
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Custom Date Picker Inline Form */}
            {showCustomModal && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10
              }}>
                <form onSubmit={handleApplyCustom} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Custom Date:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>From:</span>
                    <input
                      type="date"
                      required
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>To:</span>
                    <input
                      type="date"
                      required
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700 }}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleResetFilter}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    Reset
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Line Chart Container (Clean, unobstructed graph) */}
            <div style={{ height: 320, width: '100%', position: 'relative' }}>
              {loading && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(255, 255, 255, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10
                }}>
                  <RefreshCw size={24} className="animate-spin" color="#2563eb" />
                </div>
              )}
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* Underneath graph: clean and empty as user requested ("remove this data and baki wasy hi raha ga just graph asy ho ga") */}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT PANEL: Restaurant Comparison & Restaurant-wise Shift Cards
        ══════════════════════════════════════════════════════════════════ */}
        <div
          className="chart-card restaurant-comparison-card"
          style={{
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 12,
            padding: '16px 20px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            {/* Header */}
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                  <TrendingUp size={18} color="var(--primary, #E31837)" />
                  Restaurant Comparison
                </h3>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>
                  R1 vs R2 vs R3 total revenue & branch share
                </span>
              </div>
              {isAuthorized && (
                <span style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: '#2563eb',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  padding: '2px 8px',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <Edit3 size={11} /> Admin / Dev Edit Enabled
                </span>
              )}
            </div>

            {/* Shift Cards Grouped Restaurant-wise: Restaurant 1, Restaurant 2, Restaurant 3 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {restaurants.map((rest) => {
                const colors = restaurantColors[rest.restaurant_id] || { badge: '#64748b', bar: '#64748b' };
                const dayCashier = rest.day_shift?.cashier_name || 'Day Cashier';
                const daySys = (parseFloat(rest.day_shift?.system_sales) || 0).toFixed(2);
                const dayAct = (parseFloat(rest.day_shift?.actual_sales) || 0).toFixed(2);

                const nightCashier = rest.night_shift?.cashier_name || 'Night Cashier';
                const nightSys = (parseFloat(rest.night_shift?.system_sales) || 0).toFixed(2);
                const nightAct = (parseFloat(rest.night_shift?.actual_sales) || 0).toFixed(2);

                return (
                  <div key={rest.restaurant_id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {/* Small Section Heading */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        background: colors.badge,
                        color: '#ffffff',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: 4
                      }}>
                        {rest.restaurant_id}
                      </span>
                      <strong style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                        {rest.restaurant_name}
                      </strong>
                    </div>

                    {/* Two Shift Cards Side by Side in the same row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      
                      {/* Day Shift Card (Clickable to edit if authorized) */}
                      <div
                        className="clickable-shift-card"
                        onClick={() => handleCardClick(rest, rest.day_shift)}
                        title={isAuthorized ? 'Click to edit Day Shift actual entry' : undefined}
                        style={{
                          background: '#f8fafc',
                          border: rest.day_shift?.is_edited ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                          borderRadius: 7,
                          padding: '6px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1e293b' }}>
                            Day Shift
                          </span>
                          {rest.day_shift?.is_edited ? (
                            <span style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              fontSize: 9,
                              fontWeight: 800,
                              padding: '1px 4px',
                              borderRadius: 3
                            }}>
                              ✏️ Edited
                            </span>
                          ) : (
                            isAuthorized && rest.day_shift?.is_closed && (
                              <Edit3 size={11} color="#94a3b8" />
                            )
                          )}
                        </div>

                        <div style={{ fontSize: 10.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <User size={11} />
                          <span>Cashier: {dayCashier}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 1 }}>
                          {/* Blue: System Generated Sale */}
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb' }}>
                            System: {daySys}
                          </div>
                          {/* Green: Actual Sale */}
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>
                            Actual: {dayAct}
                          </div>
                        </div>

                        {/* Edit Reason Display if Shift was Edited */}
                        {rest.day_shift?.is_edited && rest.day_shift?.difference_reason && (
                          <div style={{
                            marginTop: 3,
                            padding: '3px 5px',
                            background: '#fffbeb',
                            border: '1px dashed #fcd34d',
                            borderRadius: 4,
                            fontSize: 9.5,
                            color: '#92400e',
                            lineHeight: 1.2
                          }}>
                            <strong>Reason: </strong>
                            <span>
                              {rest.day_shift.difference_reason.split('\n').pop().replace(/^\[Edited.*?\]:\s*/, '')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Night Shift Card (Clickable to edit if authorized) */}
                      <div
                        className="clickable-shift-card"
                        onClick={() => handleCardClick(rest, rest.night_shift)}
                        title={isAuthorized ? 'Click to edit Night Shift actual entry' : undefined}
                        style={{
                          background: '#f8fafc',
                          border: rest.night_shift?.is_edited ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                          borderRadius: 7,
                          padding: '6px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1e293b' }}>
                            Night Shift
                          </span>
                          {rest.night_shift?.is_edited ? (
                            <span style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              fontSize: 9,
                              fontWeight: 800,
                              padding: '1px 4px',
                              borderRadius: 3
                            }}>
                              ✏️ Edited
                            </span>
                          ) : (
                            isAuthorized && rest.night_shift?.is_closed && (
                              <Edit3 size={11} color="#94a3b8" />
                            )
                          )}
                        </div>

                        <div style={{ fontSize: 10.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <User size={11} />
                          <span>Cashier: {nightCashier}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 1 }}>
                          {/* Blue: System Generated Sale */}
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb' }}>
                            System: {nightSys}
                          </div>
                          {/* Green: Actual Sale */}
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>
                            Actual: {nightAct}
                          </div>
                        </div>

                        {/* Edit Reason Display if Shift was Edited */}
                        {rest.night_shift?.is_edited && rest.night_shift?.difference_reason && (
                          <div style={{
                            marginTop: 3,
                            padding: '3px 5px',
                            background: '#fffbeb',
                            border: '1px dashed #fcd34d',
                            borderRadius: 4,
                            fontSize: 9.5,
                            color: '#92400e',
                            lineHeight: 1.2
                          }}>
                            <strong>Reason: </strong>
                            <span>
                              {rest.night_shift.difference_reason.split('\n').pop().replace(/^\[Edited.*?\]:\s*/, '')}
                            </span>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>

                  </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          Shift Picker Modal (When clicking a line with multiple shifts)
      ══════════════════════════════════════════════════════════════════ */}
      {shiftPickerData && (
        <div
          className="modal-overlay"
          onClick={() => setShiftPickerData(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 16
          }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '20px 24px',
              maxWidth: 460,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  {shiftPickerData.title}
                </h4>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  Select the shift record you want to edit:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShiftPickerData(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shiftPickerData.shifts.map((s, sIdx) => {
                const sAct = (parseFloat(s.actual_sales !== undefined ? s.actual_sales : (s.actual || 0))).toFixed(2);
                const sSys = (parseFloat(s.system_sales !== undefined ? s.system_sales : (s.system || 0))).toFixed(2);
                return (
                  <div
                    key={`picker-shift-${sIdx}`}
                    onClick={() => {
                      setShiftPickerData(null);
                      openEditModalForShift(s, shiftPickerData.restName);
                    }}
                    style={{
                      border: '1.5px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#f8fafc',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#2563eb';
                      e.currentTarget.style.background = '#eff6ff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{s.shift_name || s.type || 'Shift'}</span>
                        {s.is_edited && (
                          <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 9.5, fontWeight: 800, padding: '1px 5px', borderRadius: 3 }}>
                            ✏️ Edited
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                        Cashier: <strong style={{ color: '#334155' }}>{s.cashier_name || 'Staff'}</strong>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontWeight: 800, color: '#10b981' }}>{sAct}</span>
                        <span style={{ color: '#94a3b8' }}>/</span>
                        <span style={{ fontWeight: 800, color: '#2563eb' }}>{sSys}</span>
                      </div>
                      <span style={{ fontSize: 10.5, color: '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end', marginTop: 2 }}>
                        <Edit3 size={11} /> Edit Closing
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          Edit Shift / Daily Closing Modal (Admin & Developer Only)
      ══════════════════════════════════════════════════════════════════ */}
      {showEditModal && selectedClosing && (
        <EditShiftClosingModal
          closing={selectedClosing}
          currency={currency}
          onClose={() => {
            setShowEditModal(false);
            setSelectedClosing(null);
          }}
          onSuccess={() => {
            fetchAnalytics();
            if (onShiftUpdated) onShiftUpdated();
          }}
        />
      )}

    </div>
  );
}
