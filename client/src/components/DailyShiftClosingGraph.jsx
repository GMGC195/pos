import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import { Calendar, TrendingUp, User, RefreshCw, X, Edit3 } from 'lucide-react';
import EditShiftClosingModal from './EditShiftClosingModal';
import BaseSaleSurplusChart from './BaseSaleSurplusChart';
import { useAuth } from '../contexts/AuthContext';

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

  // Click card to open edit modal
  const handleCardClick = (rest, shift) => {
    if (!isAuthorized) {
      return toast.error('Developer or Admin authorization required to edit closing records.');
    }
    if (!shift || !shift.id) {
      return toast.info(`${shift?.shift_name || 'Shift'} is currently active and not closed yet. Actual entry can only be edited once closed.`);
    }
    setSelectedClosing({
      id: shift.id,
      branch: rest.restaurant_name,
      closing_type: shift.shift_name,
      cashier_name: shift.cashier_name,
      total_sales: parseFloat(shift.system_sales || 0),
      closing_cash: shift.closing_cash,
      closing_card: shift.closing_card,
      difference: parseFloat(shift.actual_sales || 0) - parseFloat(shift.system_sales || 0),
      difference_reason: shift.difference_reason
    });
    setShowEditModal(true);
  };

  // Restaurants for Restaurant Comparison section and graph points
  const restaurants = useMemo(() => {
    if (shiftData.restaurants && shiftData.restaurants.length > 0) {
      return shiftData.restaurants;
    }
    return [
      {
        restaurant_id: 'R1',
        restaurant_name: 'Branch 1',
        day_shift: { shift_name: 'Day Shift', cashier_name: 'Day Cashier', system_sales: 0, actual_sales: 0 },
        night_shift: { shift_name: 'Night Shift', cashier_name: 'Night Cashier', system_sales: 0, actual_sales: 0 },
        total_actual_sales: 0,
        total_system_sales: 0
      },
      {
        restaurant_id: 'R2',
        restaurant_name: 'Branch 2',
        day_shift: { shift_name: 'Day Shift', cashier_name: 'Day Cashier', system_sales: 0, actual_sales: 0 },
        night_shift: { shift_name: 'Night Shift', cashier_name: 'Night Cashier', system_sales: 0, actual_sales: 0 },
        total_actual_sales: 0,
        total_system_sales: 0
      },
      {
        restaurant_id: 'R3',
        restaurant_name: 'Branch 3',
        day_shift: { shift_name: 'Day Shift', cashier_name: 'Day Cashier', system_sales: 0, actual_sales: 0 },
        night_shift: { shift_name: 'Night Shift', cashier_name: 'Night Cashier', system_sales: 0, actual_sales: 0 },
        total_actual_sales: 0,
        total_system_sales: 0
      }
    ];
  }, [shiftData.restaurants]);

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
          grid-template-columns: minmax(0, 1.45fr) minmax(360px, 1fr);
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
            LEFT PANEL: Base Sale and Surplus Per Shift Bar Graph (With Act & Sys amounts, NO SAR)
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
            justifyContent: 'space-between',
            height: '100%'
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
              marginBottom: 10
            }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                  <Calendar size={18} color="#2563eb" />
                  Base sale and surplus per shift
                </h3>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>
                  Bar = system base (blue) + exceeded surplus (orange). Badge = Actual (Act) &amp; System (Sys) amounts.
                </span>
              </div>

              {/* Filter buttons in 1-5 order */}
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
          </div>

          {/* Embedded Stacked Bar Graph (BaseSaleSurplusChart with Act & Sys amounts, no SAR) */}
          <BaseSaleSurplusChart
            restaurants={restaurants}
            currency={currency}
            loading={loading}
            embedded={true}
            hideHeader={true}
            onShiftUpdated={() => {
              fetchAnalytics();
              if (onShiftUpdated) onShiftUpdated();
            }}
          />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT PANEL: Shift Data Cards & Restaurant Comparison (As user requested: "garph left pa ho or dosra right ps")
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
            justifyContent: 'space-between',
            height: '100%'
          }}
        >
          <div>
            {/* Header */}
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                  <TrendingUp size={18} color="var(--primary, #E31837)" />
                  Restaurant Comparison &amp; Shifts
                </h3>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>
                  R1 vs R2 vs R3 total revenue &amp; shift closing data
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
