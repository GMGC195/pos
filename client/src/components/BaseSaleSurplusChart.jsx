import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import EditShiftClosingModal from './EditShiftClosingModal';
import { Edit3 } from 'lucide-react';

/**
 * BaseSaleSurplusChart
 * Replicates the "Base sale and surplus per shift" stacked bar visualization
 * with dynamic badge threshold indicators (under 25%, 25–50%, over 50%).
 * Features an enriched hover tooltip displaying:
 * - Shift Name / Shift Number
 * - Cashier Name
 * - Shift Start Time & Closing Time
 * - System Sale (ERP transaction calculated)
 * - Actual Sale (Cashier closing entered)
 * - Difference Amount & Difference Percentage
 * Plus controlled Edit capability for Admin & Developer roles.
 */
export default function BaseSaleSurplusChart({ 
  restaurants = [], 
  currency = 'SAR', 
  loading = false,
  onShiftUpdated
}) {
  const { user } = useAuth();
  const userRole = user?.role?.trim().toLowerCase();
  const isAdminOrDev = userRole === 'admin' || userRole === 'developer';

  const [hoveredShift, setHoveredShift] = useState(null);
  const [editingClosing, setEditingClosing] = useState(null);

  // Normalize restaurants list (ensuring R1, R2, R3 exist)
  const defaultRestaurants = [
    {
      restaurant_id: 'R1',
      restaurant_name: 'Branch 1',
      night_shift: { shift_name: 'Night Shift', system_sales: 0, actual_sales: 0, cashier_name: 'Unassigned' },
      day_shift: { shift_name: 'Day Shift', system_sales: 0, actual_sales: 0, cashier_name: 'Unassigned' }
    },
    {
      restaurant_id: 'R2',
      restaurant_name: 'Branch 2',
      night_shift: { shift_name: 'Night Shift', system_sales: 0, actual_sales: 0, cashier_name: 'Unassigned' },
      day_shift: { shift_name: 'Day Shift', system_sales: 0, actual_sales: 0, cashier_name: 'Unassigned' }
    },
    {
      restaurant_id: 'R3',
      restaurant_name: 'Branch 3',
      night_shift: { shift_name: 'Night Shift', system_sales: 0, actual_sales: 0, cashier_name: 'Unassigned' },
      day_shift: { shift_name: 'Day Shift', system_sales: 0, actual_sales: 0, cashier_name: 'Unassigned' }
    }
  ];

  const branchList = (restaurants && restaurants.length > 0) ? restaurants : defaultRestaurants;

  // Format date/time helper
  const formatTime = (timeVal) => {
    if (!timeVal) return 'N/A';
    if (typeof timeVal === 'string' && (timeVal.toLowerCase().includes('active') || timeVal.toLowerCase().includes('progress'))) {
      return timeVal;
    }
    try {
      const d = new Date(timeVal);
      if (isNaN(d.getTime())) return String(timeVal);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return String(timeVal);
    }
  };

  // Process metrics for a shift
  const computeShiftMetrics = (shift, fallbackCashier = 'Unassigned') => {
    const sys = Math.max(0, parseFloat(shift?.system_sales || 0));
    const act = Math.max(0, parseFloat(shift?.actual_sales || 0));

    let base = 0;
    let surplus = 0;

    if (sys > 0) {
      base = sys;
      surplus = Math.max(0, act - sys);
    } else if (act > 0) {
      base = act;
      surplus = 0;
    }

    const total = base + surplus;
    const rate = base > 0 ? (surplus / base) * 100 : 0;
    const rateStr = `${rate.toFixed(1)}%`;

    let badgeColor = '#16a34a'; // under 25% (green)
    let badgeCategory = 'under 25%';
    if (rate >= 25 && rate <= 50) {
      badgeColor = '#b45309'; // 25–50% (brown/ochre)
      badgeCategory = '25–50%';
    } else if (rate > 50) {
      badgeColor = '#dc2626'; // over 50% (red)
      badgeCategory = 'over 50%';
    }

    // Difference calculations
    const diffAmount = act - sys;
    const diffPct = sys > 0 ? ((act - sys) / sys) * 100 : 0;

    return {
      sys,
      act,
      base,
      surplus,
      total,
      rate,
      rateStr,
      badgeColor,
      badgeCategory,
      diffAmount,
      diffPct,
      cashier: shift?.cashier_name || fallbackCashier,
      shiftId: shift?.id || shift?.shift_id || null,
      shiftNumber: shift?.shift_number || (shift?.id ? `Shift #${shift.id}` : null),
      startTime: formatTime(shift?.start_time),
      closingTime: formatTime(shift?.closing_time),
      rawShift: shift
    };
  };

  // Dimensions & Coordinates
  const width = 860;
  const height = 370;
  const paddingLeft = 58;
  const paddingRight = 30;
  const paddingTop = 44;
  const yBase = 270;
  const plotHeight = yBase - paddingTop; // 226

  // Collect all shift totals to determine max scale
  const allTotals = [];
  branchList.forEach(b => {
    const nightM = computeShiftMetrics(b.night_shift, 'Night Cashier');
    const dayM = computeShiftMetrics(b.day_shift, 'Day Cashier');
    allTotals.push(nightM.total, dayM.total);
  });

  const maxVal = Math.max(100, ...allTotals);

  // Compute nice Y-axis max ceiling and tick values
  let yMax = 8000;
  if (maxVal <= 500) yMax = 500;
  else if (maxVal <= 1000) yMax = 1000;
  else if (maxVal <= 2000) yMax = 2000;
  else if (maxVal <= 4000) yMax = 4000;
  else if (maxVal <= 6000) yMax = 6000;
  else if (maxVal <= 8000) yMax = 8000;
  else if (maxVal <= 10000) yMax = 10000;
  else yMax = Math.ceil(maxVal / 2000) * 2000;

  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  // Width calculations for the 3 branches and 6 bars
  const availablePlotWidth = width - paddingLeft - paddingRight; // ~772
  const branchWidth = availablePlotWidth / 3; // ~257.3
  const barWidth = 46;
  const barGap = 22;

  const handleEditClick = (shiftInfo) => {
    if (!isAdminOrDev || !shiftInfo?.shiftId) return;
    setEditingClosing({
      id: shiftInfo.shiftId,
      branch: shiftInfo.branch,
      cashier_name: shiftInfo.cashier,
      closing_type: shiftInfo.shift,
      total_sales: shiftInfo.sys,
      closing_cash: shiftInfo.rawShift?.closing_cash,
      closing_card: shiftInfo.rawShift?.closing_card,
      difference: shiftInfo.diffAmount
    });
  };

  return (
    <div className="base-sale-surplus-card" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', position: 'relative' }}>
      
      {/* Header */}
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.01em' }}>
            Base sale and surplus per shift
          </h3>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            Bar = system base (blue) + exceeded surplus (orange). Badge = surplus ÷ base.
          </p>
        </div>
        {isAdminOrDev && (
          <span style={{ fontSize: 11, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '3px 8px', borderRadius: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Edit3 size={12} /> Admin Edit Enabled
          </span>
        )}
      </div>

      {/* SVG Chart with horizontal scrolling wrapper for mobile safety */}
      <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: 640 }}>
          <svg 
            viewBox={`0 0 ${width} ${height}`} 
            style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }}
          >
            {/* Horizontal Gridlines & Y-Axis Labels */}
            {yTicks.map((tickVal, i) => {
              const y = yBase - (tickVal / yMax) * plotHeight;
              const label = tickVal >= 1000 
                ? (tickVal % 1000 === 0 ? `${(tickVal / 1000).toFixed(0)}k` : `${(tickVal / 1000).toFixed(1)}k`) 
                : `${tickVal}`;
              return (
                <g key={`ytick-${i}`}>
                  <line 
                    x1={paddingLeft} 
                    y1={y} 
                    x2={width - paddingRight} 
                    y2={y} 
                    stroke="#f1f5f9" 
                    strokeWidth="1.2" 
                  />
                  <text 
                    x={paddingLeft - 12} 
                    y={y + 4} 
                    textAnchor="end" 
                    fontSize="12" 
                    fontWeight="500" 
                    fill="#94a3b8" 
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Render 3 Branch Groups */}
            {branchList.map((branch, bIdx) => {
              const branchCenterX = paddingLeft + (bIdx * branchWidth) + (branchWidth / 2);
              const nightX = branchCenterX - (barWidth + barGap / 2);
              const dayX = branchCenterX + (barGap / 2);

              const branchLabel = branch.restaurant_name 
                ? (branch.restaurant_name.toLowerCase().includes('branch') 
                    ? branch.restaurant_name 
                    : branch.restaurant_name.replace('Restaurant', 'Branch'))
                : `Branch ${bIdx + 1}`;

              const shifts = [
                { 
                  id: `${branch.restaurant_id || bIdx}-night`, 
                  type: 'Night', 
                  data: branch.night_shift, 
                  x: nightX, 
                  fallbackCashier: 'Night Cashier' 
                },
                { 
                  id: `${branch.restaurant_id || bIdx}-day`, 
                  type: 'Day', 
                  data: branch.day_shift, 
                  x: dayX, 
                  fallbackCashier: 'Day Cashier' 
                }
              ];

              return (
                <g key={`branch-group-${bIdx}`}>
                  {/* Bars for this branch */}
                  {shifts.map(s => {
                    const m = computeShiftMetrics(s.data, s.fallbackCashier);
                    const isHovered = hoveredShift?.id === s.id;

                    const baseH = Math.max(0, (m.base / yMax) * plotHeight);
                    const surplusH = Math.max(0, (m.surplus / yMax) * plotHeight);

                    const baseY = yBase - baseH;
                    const surplusY = baseY - surplusH;

                    const badgeW = m.rateStr.length > 5 ? 56 : 48;
                    const badgeH = 19;
                    const badgeX = s.x + (barWidth / 2) - (badgeW / 2);
                    const badgeY = (surplusH > 0 ? surplusY : baseY) - 17;

                    const shiftPayload = {
                      id: s.id,
                      branch: branchLabel,
                      shift: s.type,
                      shiftNumber: m.shiftNumber || `${s.type} Shift`,
                      cashier: m.cashier,
                      startTime: m.startTime,
                      closingTime: m.closingTime,
                      sys: m.sys,
                      act: m.act,
                      base: m.base,
                      surplus: m.surplus,
                      diffAmount: m.diffAmount,
                      diffPct: m.diffPct,
                      rateStr: m.rateStr,
                      badgeCategory: m.badgeCategory,
                      badgeColor: m.badgeColor,
                      shiftId: m.shiftId,
                      rawShift: m.rawShift
                    };

                    return (
                      <g 
                        key={s.id} 
                        style={{ cursor: isAdminOrDev && m.shiftId ? 'pointer' : 'default' }}
                        onMouseEnter={() => setHoveredShift(shiftPayload)}
                        onMouseLeave={() => setHoveredShift(null)}
                        onClick={() => {
                          if (isAdminOrDev && m.shiftId) {
                            handleEditClick(shiftPayload);
                          }
                        }}
                      >
                        {/* Hover Column Background Glow */}
                        {isHovered && (
                          <rect
                            x={s.x - 6}
                            y={paddingTop - 12}
                            width={barWidth + 12}
                            height={yBase - paddingTop + 20}
                            fill="#f8fafc"
                            rx="8"
                          />
                        )}

                        {/* Blue Base Bar */}
                        <rect
                          x={s.x}
                          y={baseY}
                          width={barWidth}
                          height={Math.max(baseH, (m.total === 0 ? 3 : 0))}
                          fill={m.total === 0 ? '#cbd5e1' : '#1877f2'}
                          rx={surplusH > 0 ? 0 : 4}
                          opacity={isHovered ? 0.9 : 1}
                        />

                        {/* Orange Surplus Bar Stacked on Top */}
                        {surplusH > 0 && (
                          <rect
                            x={s.x}
                            y={surplusY}
                            width={barWidth}
                            height={surplusH}
                            fill="#f58220"
                            rx="4"
                            opacity={isHovered ? 0.9 : 1}
                          />
                        )}

                        {/* Floating Percentage Badge Pill */}
                        <g>
                          <rect
                            x={badgeX}
                            y={badgeY}
                            width={badgeW}
                            height={badgeH}
                            rx={badgeH / 2}
                            fill={m.badgeColor}
                          />
                          <text
                            x={badgeX + badgeW / 2}
                            y={badgeY + 13.5}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="800"
                            fill="#ffffff"
                            fontFamily="system-ui, -apple-system, sans-serif"
                          >
                            {m.rateStr}
                          </text>
                        </g>

                        {/* Shift Label Under Axis */}
                        <text
                          x={s.x + barWidth / 2}
                          y={yBase + 18}
                          textAnchor="middle"
                          fontSize="13"
                          fontWeight="700"
                          fill="#1e293b"
                          fontFamily="system-ui, -apple-system, sans-serif"
                        >
                          {s.type}
                        </text>

                        {/* Cashier Name Under Shift Label */}
                        <text
                          x={s.x + barWidth / 2}
                          y={yBase + 34}
                          textAnchor="middle"
                          fontSize="11.5"
                          fontWeight="500"
                          fill="#64748b"
                          fontFamily="system-ui, -apple-system, sans-serif"
                        >
                          {m.cashier}
                        </text>
                      </g>
                    );
                  })}

                  {/* Branch Horizontal Divider Line & Label */}
                  <line
                    x1={nightX - 12}
                    y1={yBase + 48}
                    x2={dayX + barWidth + 12}
                    y2={yBase + 48}
                    stroke="#e2e8f0"
                    strokeWidth="1.5"
                  />
                  <text
                    x={branchCenterX}
                    y={yBase + 66}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="600"
                    fill="#475569"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {branchLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Floating Interactive Tooltip when hovering over a shift bar */}
      {hoveredShift && (
        <div style={{
          position: 'absolute',
          top: 14,
          right: 20,
          background: '#0f172a',
          color: '#ffffff',
          borderRadius: 10,
          padding: '12px 16px',
          fontSize: 12,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)',
          pointerEvents: isAdminOrDev && hoveredShift.shiftId ? 'auto' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 20,
          minWidth: 260
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 13.5, color: '#ffffff' }}>
              {hoveredShift.branch} — {hoveredShift.shift} Shift
            </span>
            {hoveredShift.shiftNumber && (
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: 4, color: '#e2e8f0' }}>
                {hoveredShift.shiftNumber}
              </span>
            )}
          </div>

          {/* Cashier Name */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 2 }}>
            <span style={{ color: '#94a3b8' }}>Cashier:</span>
            <strong style={{ color: '#f8fafc' }}>{hoveredShift.cashier}</strong>
          </div>

          {/* Times */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: '#94a3b8' }}>Shift Start:</span>
            <span style={{ color: '#e2e8f0' }}>{hoveredShift.startTime}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: '#94a3b8' }}>Shift Closing:</span>
            <span style={{ color: '#e2e8f0' }}>{hoveredShift.closingTime}</span>
          </div>

          {/* System Sale & Actual Sale */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4, paddingTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: '#93c5fd' }}>System Sale:</span>
              <strong style={{ color: '#bfdbfe' }}>{currency} {hoveredShift.sys.toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 2 }}>
              <span style={{ color: '#fdba74' }}>Actual Sale:</span>
              <strong style={{ color: '#fed7aa' }}>{currency} {hoveredShift.act.toFixed(2)}</strong>
            </div>
          </div>

          {/* Difference Amount & Difference Percentage */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 2 }}>
            <span style={{ color: '#cbd5e1' }}>Difference:</span>
            <strong style={{ color: hoveredShift.diffAmount >= 0 ? '#4ade80' : '#f87171' }}>
              {hoveredShift.diffAmount >= 0 ? '+' : ''}{currency} {hoveredShift.diffAmount.toFixed(2)}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: '#cbd5e1' }}>Difference %:</span>
            <strong style={{ color: hoveredShift.diffPct >= 0 ? '#4ade80' : '#f87171' }}>
              {hoveredShift.diffPct >= 0 ? '+' : ''}{hoveredShift.diffPct.toFixed(1)}%
            </strong>
          </div>

          {/* Surplus Rate Badge info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 4, marginTop: 2 }}>
            <span style={{ color: '#94a3b8' }}>Surplus Rate:</span>
            <span style={{ color: hoveredShift.badgeColor, fontWeight: 800 }}>
              {hoveredShift.rateStr} ({hoveredShift.badgeCategory})
            </span>
          </div>

          {/* Admin Edit Action Button */}
          {isAdminOrDev && hoveredShift.shiftId && (
            <button
              type="button"
              onClick={() => handleEditClick(hoveredShift)}
              style={{
                marginTop: 6,
                padding: '6px 10px',
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#b91c1c'}
              onMouseLeave={e => e.currentTarget.style.background = '#dc2626'}
            >
              <Edit3 size={12} /> Edit Shift Closing (Admin)
            </button>
          )}

        </div>
      )}

      {/* Legend at Bottom matching exact reference image */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'flex-start', 
        gap: 20, 
        flexWrap: 'wrap', 
        marginTop: 14, 
        fontSize: 12, 
        fontWeight: 500, 
        color: '#334155' 
      }}>
        {/* System base sale (blue dot) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#1877f2', display: 'inline-block' }} />
          <span>System base sale</span>
        </div>

        {/* Exceeded surplus (orange dot) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f58220', display: 'inline-block' }} />
          <span>Exceeded surplus</span>
        </div>

        {/* under 25% (green pill) */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ background: '#16a34a', color: '#ffffff', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
            under 25%
          </span>
        </div>

        {/* 25–50% (brown pill) */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ background: '#b45309', color: '#ffffff', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
            25–50%
          </span>
        </div>

        {/* over 50% (red pill) */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ background: '#dc2626', color: '#ffffff', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
            over 50%
          </span>
        </div>
      </div>

      {/* Controlled Edit Modal for Admin & Developer */}
      {editingClosing && (
        <EditShiftClosingModal
          closing={editingClosing}
          currency={currency}
          onClose={() => setEditingClosing(null)}
          onSuccess={() => {
            if (onShiftUpdated) onShiftUpdated();
          }}
        />
      )}

    </div>
  );
}
