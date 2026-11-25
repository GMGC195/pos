import React, { useState, useEffect, useCallback } from 'react';
import axios from '../../api';
import { 
  Package, 
  DollarSign, 
  AlertTriangle, 
  TrendingDown, 
  ShoppingCart, 
  Clock, 
  ClipboardList, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldCheck,
  Building2,
  RefreshCw,
  PlusCircle,
  Truck
} from 'lucide-react';
import { BRAND_CURRENCY } from '../../branding';
import { formatBranchLabel } from './storeUtils';

export default function StoreDashboard({ 
  metrics: propMetrics, 
  recentMovements: propRecentMovements, 
  recentPurchases: propRecentPurchases, 
  onNavigateTab, 
  loading: propLoading, 
  onRefresh,
  selectedBranch,
  selectedStore,
  selectedStoreId,
  user
}) {
  const userRole = (user?.role || '').trim().toLowerCase();
  const canOperateShiftOrPurchase = userRole === 'admin' || userRole === 'developer';
  const [internalMetrics, setInternalMetrics] = useState(propMetrics || null);
  const [internalMovements, setInternalMovements] = useState(propRecentMovements || []);
  const [internalPurchases, setInternalPurchases] = useState(propRecentPurchases || []);
  const [internalLoading, setInternalLoading] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setInternalLoading(true);
    try {
      const params = {};
      if (selectedBranch && selectedBranch !== 'All') params.branch = selectedBranch;
      const res = await axios.get('/api/store/dashboard/metrics', { params });
      if (res.data) {
        setInternalMetrics(res.data.metrics);
        setInternalMovements(res.data.recent_movements || []);
        setInternalPurchases(res.data.recent_purchases || []);
      }
    } catch (err) {
      console.error('Failed to load store dashboard data:', err);
    } finally {
      setInternalLoading(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefreshClick = () => {
    fetchDashboardData();
    if (typeof onRefresh === 'function') onRefresh();
  };

  const m = internalMetrics || propMetrics || {
    total_items: 0,
    total_stock_value: 0,
    low_stock_count: 0,
    today_purchases_count: 0,
    today_purchases_value: 0,
    today_shifts_submitted: 0,
    today_consumption_value: 0,
    pending_requests_count: 0
  };

  const recentMovements = internalMovements.length > 0 ? internalMovements : (propRecentMovements || []);
  const recentPurchases = internalPurchases.length > 0 ? internalPurchases : (propRecentPurchases || []);
  const loading = internalLoading || propLoading;

  return (
    <div className="store-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Welcome & Quick Actions Banner - Clean Single Row */}
      <div className="card" style={{ 
        background: 'linear-gradient(135deg, var(--secondary) 0%, var(--secondary-light) 100%)', 
        color: '#ffffff', 
        padding: '12px 20px',
        borderRadius: 12,
        boxShadow: '0 4px 16px rgba(16, 60, 67, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ 
            background: 'rgba(255,255,255,0.18)', 
            padding: '4px 10px', 
            borderRadius: 6, 
            fontSize: 12, 
            fontWeight: 700,
            letterSpacing: '0.03em'
          }}>
            {selectedBranch === 'All' ? 'All Branches' : formatBranchLabel(selectedBranch)}
          </span>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
            Store Management Overview
          </h2>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canOperateShiftOrPurchase && (
            <>
              <button 
                className="btn" 
                onClick={() => onNavigateTab('entry')}
                style={{ 
                  background: 'var(--primary)', 
                  color: '#000000', 
                  fontWeight: 700, 
                  padding: '8px 14px', 
                  borderRadius: 8,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                <Clock size={15} /> Count Shift Stock
              </button>
              <button 
                className="btn" 
                onClick={() => onNavigateTab('purchases')}
                style={{ 
                  background: '#ffffff', 
                  color: 'var(--secondary)', 
                  fontWeight: 700, 
                  padding: '8px 14px', 
                  borderRadius: 8,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                <ShoppingCart size={15} /> Add Purchase
              </button>
            </>
          )}
          <button 
            className="btn" 
            onClick={handleRefreshClick}
            title="Refresh Metrics"
            style={{ 
              background: 'rgba(255,255,255,0.15)', 
              color: '#ffffff', 
              padding: '8px', 
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid - All 6 Cards in 1 Row on Desktop, Clean Icons Without Background Boxes */}
      <div className="store-kpi-grid">
        {/* Card 1: Active Store Items */}
        <div className="card" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-2)', background: 'var(--white)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Store Items</span>
            <Package size={18} color="var(--primary-dark)" />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
            {m.total_items}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            In store catalog
          </div>
        </div>

        {/* Card 2: Inventory Valuation */}
        <div className="card" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-2)', background: 'var(--white)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Total Stock Value</span>
            <DollarSign size={18} color="var(--secondary)" />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
            {BRAND_CURRENCY}{m.total_stock_value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Valued at last cost
          </div>
        </div>

        {/* Card 3: Low Stock Warnings */}
        <div className="card" 
          onClick={() => onNavigateTab('inventory', { low_stock_only: true })}
          style={{ 
            padding: '12px 14px', 
            borderRadius: 10, 
            border: m.low_stock_count > 0 ? '1.5px solid #ef4444' : '1px solid var(--surface-2)', 
            background: m.low_stock_count > 0 ? '#fff8f8' : 'var(--white)',
            cursor: 'pointer'
          }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: m.low_stock_count > 0 ? '#b91c1c' : 'var(--text-secondary)' }}>
              Low Stock Alerts
            </span>
            <AlertTriangle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: m.low_stock_count > 0 ? '#dc2626' : 'var(--text-primary)' }}>
            {m.low_stock_count}
          </div>
          <div style={{ fontSize: 11, color: m.low_stock_count > 0 ? '#dc2626' : 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.low_stock_count > 0 ? '⚠️ Reorder required' : 'All items optimal'}
          </div>
        </div>

        {/* Card 4: Today Purchases */}
        <div className="card" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-2)', background: 'var(--white)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Today's Purchases</span>
            <Truck size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
            {BRAND_CURRENCY}{m.today_purchases_value?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.today_purchases_count} vendor invoices
          </div>
        </div>

        {/* Card 5: Today's Shift Consumption */}
        <div className="card" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-2)', background: 'var(--white)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Today's Consumption</span>
            <TrendingDown size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
            {BRAND_CURRENCY}{m.today_consumption_value?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.today_shifts_submitted} shift submissions
          </div>
        </div>

        {/* Card 6: Pending Requisitions */}
        <div className="card" 
          onClick={() => onNavigateTab('requests')}
          style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--surface-2)', background: 'var(--white)', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Pending Requests</span>
            <ClipboardList size={18} color="var(--secondary)" />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
            {m.pending_requests_count}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Awaiting review
          </div>
        </div>
      </div>

      {/* Two-Column Activity & Low Stock Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
        {/* Recent Stock Movements */}
        <div className="card" style={{ padding: 20, borderRadius: 12, border: '1px solid var(--surface-2)', background: 'var(--white)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Recent Stock Movements
            </h3>
            <button 
              className="btn btn-outline" 
              onClick={() => onNavigateTab('items')}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              View Inventory
            </button>
          </div>

          {recentMovements && recentMovements.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentMovements.map(item => {
                const isPositive = parseFloat(item.quantity_change) > 0;
                return (
                  <div key={item.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--surface)',
                    border: '1px solid var(--surface-2)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: isPositive ? '#ecfdf5' : '#fef2f2',
                        color: isPositive ? '#10b981' : '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {isPositive ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {item.item_name} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({item.item_code})</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {item.movement_type.replace(/_/g, ' ')} • {formatBranchLabel(item.branch)}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: 13, 
                        fontWeight: 800, 
                        color: isPositive ? '#10b981' : '#ef4444' 
                      }}>
                        {isPositive ? '+' : ''}{item.quantity_change}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Bal: {item.stock_after}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: 13 }}>
              No recent stock movements recorded yet.
            </div>
          )}
        </div>

        {/* Recent Vendor Purchases */}
        <div className="card" style={{ padding: 20, borderRadius: 12, border: '1px solid var(--surface-2)', background: 'var(--white)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Recent Purchase Invoices
            </h3>
            <button 
              className="btn btn-outline" 
              onClick={() => onNavigateTab('purchases')}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              All Purchases
            </button>
          </div>

          {recentPurchases && recentPurchases.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentPurchases.map(p => (
                <div key={p.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  border: '1px solid var(--surface-2)'
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {p.vendor_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Inv: {p.invoice_number || p.purchase_number} • {new Date(p.invoice_date).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--secondary)' }}>
                      {BRAND_CURRENCY}{parseFloat(p.total_amount).toFixed(2)}
                    </div>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: p.payment_status === 'Paid' ? '#dcfce7' : '#fee2e2',
                      color: p.payment_status === 'Paid' ? '#166534' : '#991b1b'
                    }}>
                      {p.payment_status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: 13 }}>
              No purchase orders recorded yet. Click 'Add Purchase' to receive goods.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
