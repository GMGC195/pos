import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Filter, 
  RefreshCw, 
  AlertTriangle, 
  Building2, 
  DollarSign, 
  Package, 
  ArrowRight, 
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { BRAND_CURRENCY } from '../../branding';

export default function PriceComparison() {
  const [comparisonList, setComparisonList] = useState([]);
  const [itemsCatalog, setItemsCatalog] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

  // Load items catalog for filter
  const fetchItemsCatalog = async () => {
    try {
      const res = await axios.get('/api/store/items');
      setItemsCatalog(res.data || []);
    } catch (err) {
      console.error('Error fetching items for filter:', err);
    }
  };

  // Fetch price comparison data
  const fetchPriceComparison = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedItemId !== 'All') params.item_id = selectedItemId;

      const res = await axios.get('/api/store/reports/price-comparison', { params });
      setComparisonList(res.data.comparisonList || []);
    } catch (err) {
      console.error('Error fetching price comparison:', err);
      toast.error('Failed to load 3-month price comparison analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItemsCatalog();
  }, []);

  useEffect(() => {
    fetchPriceComparison();
  }, [selectedItemId]);

  // Quick search in-memory
  const filteredList = useMemo(() => {
    return comparisonList.filter(it => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        it.item_name?.toLowerCase().includes(q) ||
        it.item_code?.toLowerCase().includes(q) ||
        it.vendors_involved?.some(v => v?.toLowerCase().includes(q))
      );
    });
  }, [comparisonList, search]);

  // Calculate high-variance items count
  const stats = useMemo(() => {
    let highVarianceCount = 0;
    let maxVariance = 0;
    let mostVolatileItem = null;

    comparisonList.forEach(it => {
      if (it.min_price > 0 && it.max_price > it.min_price) {
        const pct = ((it.max_price - it.min_price) / it.min_price) * 100;
        if (pct > 15) highVarianceCount++;
        if (pct > maxVariance) {
          maxVariance = pct;
          mostVolatileItem = it.item_name;
        }
      }
    });

    return {
      total: comparisonList.length,
      highVarianceCount,
      maxVariance: Math.round(maxVariance),
      mostVolatileItem
    };
  }, [comparisonList]);

  return (
    <div className="store-module-wrap">
      {/* Header and Filter Card */}
      <div className="store-card">
        <div className="store-header-row">
          <div className="store-header-left">
            <div className="store-header-icon">
              <TrendingUp size={20} />
            </div>
            <div className="store-header-info">
              <h2 className="store-header-title">
                3-Month Historical Price Trends
                <span className="store-badge-count">
                  Last 90 Days
                </span>
              </h2>
              <p className="store-header-desc">
                Track supplier pricing fluctuations, detect price spikes, and discover best purchase rates across suppliers.
              </p>
            </div>
          </div>

          <div className="store-header-actions">
            {/* View Mode Toggle */}
            <div className="store-tabs">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`store-tab-btn ${viewMode === 'cards' ? 'active' : ''}`}
              >
                <Package size={13} />
                <span>Product Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`store-tab-btn ${viewMode === 'table' ? 'active' : ''}`}
              >
                <TrendingUp size={13} />
                <span>Comparison Table</span>
              </button>
            </div>

            <button
              onClick={fetchPriceComparison}
              disabled={loading}
              className="store-btn-icon"
              title="Refresh Price Analysis"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Filter Bar: Max 1 Row on Desktop */}
        <div className="store-filters-wrap" style={{ marginTop: 10 }}>
          <div className="store-filters-row">
            <div className="store-filter-col" style={{ flex: '2 1 240px' }}>
              <label className="store-filter-label">Search Product / Supplier</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={15} style={{ position: 'absolute', left: 10, color: '#9ca3af' }} />
                <input
                  type="text"
                  placeholder="Search product code, name, or supplier..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="store-filter-input"
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>

            <div className="store-filter-col" style={{ flex: '1.5 1 200px' }}>
              <label className="store-filter-label">Filter Specific Item</label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="store-filter-select"
              >
                <option value="All">All Tracked Purchased Items</option>
                {itemsCatalog.map(it => (
                  <option key={it.id} value={it.id}>{it.name} ({it.item_code})</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Insight Cards: 1 Horizontal Row with 3 Cards on Desktop */}
      <div className="store-kpi-grid-3">
        <div className="store-kpi-card">
          <div className="store-kpi-card-info">
            <div className="store-kpi-title">Tracked Products</div>
            <div className="store-kpi-value">
              {stats.total} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary, #6b7280)' }}>Items</span>
            </div>
          </div>
          <div className="store-kpi-icon-box" style={{ background: 'rgba(244, 180, 0, 0.12)', color: 'var(--primary-dark, #d97706)' }}>
            <Package size={22} />
          </div>
        </div>

        <div className="store-kpi-card">
          <div className="store-kpi-card-info">
            <div className="store-kpi-title">Price Volatility Alerts (&gt;15%)</div>
            <div className="store-kpi-value" style={{ color: stats.highVarianceCount > 0 ? '#ef4444' : 'var(--text-primary, #111827)' }}>
              {stats.highVarianceCount} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary, #6b7280)' }}>Items</span>
            </div>
          </div>
          <div className="store-kpi-icon-box" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}>
            <AlertTriangle size={22} />
          </div>
        </div>

        <div className="store-kpi-card">
          <div className="store-kpi-card-info">
            <div className="store-kpi-title">Highest 90-Day Variance</div>
            <div className="store-kpi-value" style={{ color: 'var(--primary-dark, #d97706)' }}>
              +{stats.maxVariance}%
            </div>
            {stats.mostVolatileItem && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }} title={stats.mostVolatileItem}>
                {stats.mostVolatileItem}
              </div>
            )}
          </div>
          <div className="store-kpi-icon-box" style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#9333ea' }}>
            <Sparkles size={22} />
          </div>
        </div>
      </div>

      {/* Main Content: Cards View or Table View */}
      {viewMode === 'cards' ? (
        /* CARDS VIEW */
        <div className="store-card-grid">
          {loading ? (
            <div className="store-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary, #6b7280)' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--primary, #F4B400)' }} />
              <div>Analyzing purchase price variance...</div>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="store-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary, #6b7280)' }}>
              <TrendingUp size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <div>No purchase history found in the past 90 days. Register purchase invoices to activate live comparison trends.</div>
            </div>
          ) : (
            filteredList.map(item => {
              const variancePct = item.min_price > 0 && item.max_price > item.min_price
                ? Math.round(((item.max_price - item.min_price) / item.min_price) * 100)
                : 0;

              return (
                <div key={item.item_id} className="store-item-card">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--primary-dark, #d97706)' }}>
                        {item.item_code}
                      </span>
                      <h4 style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                        {item.item_name}
                      </h4>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)' }}>
                        {item.prices?.length || 0} purchase orders logged
                      </span>
                    </div>

                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 9999,
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: variancePct > 15 ? 'rgba(239, 68, 68, 0.12)' : variancePct > 5 ? 'rgba(244, 180, 0, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                      color: variancePct > 15 ? '#dc2626' : variancePct > 5 ? 'var(--primary-dark, #d97706)' : '#059669',
                      border: `1px solid ${variancePct > 15 ? 'rgba(239, 68, 68, 0.3)' : variancePct > 5 ? 'rgba(244, 180, 0, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                    }}>
                      <TrendingUp size={11} />
                      {variancePct > 0 ? `+${variancePct}%` : 'Stable (0%)'}
                    </span>
                  </div>

                  {/* Price Metrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '10px 0', borderTop: '1px solid var(--surface-2, #f1f5f9)', borderBottom: '1px solid var(--surface-2, #f1f5f9)' }}>
                    <div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 700 }}>Lowest</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                        {Number(item.min_price || 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 700 }}>Highest</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
                        {Number(item.max_price || 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 700 }}>Latest</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary-dark, #d97706)' }}>
                        {Number(item.latest_price || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Suppliers involved */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary, #6b7280)', marginBottom: 4 }}>SUPPLIERS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {item.vendors_involved && item.vendors_involved.length > 0 ? (
                        item.vendors_involved.map((v, vi) => (
                          <span key={vi} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface-2, #f3f4f6)', border: '1px solid #e5e7eb', color: 'var(--secondary, #103C43)' }}>
                            {v}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text-secondary, #9ca3af)', fontStyle: 'italic' }}>None</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="store-table-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="store-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Product Name</th>
                  <th style={{ textAlign: 'center' }}>Unit</th>
                  <th style={{ textAlign: 'right' }}>Lowest Rate</th>
                  <th style={{ textAlign: 'right' }}>Highest Rate</th>
                  <th style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary-dark, #d97706)' }}>Latest Purchase</th>
                  <th style={{ textAlign: 'center' }}>90-Day Spread</th>
                  <th>Suppliers Involved</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                      <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--primary, #F4B400)' }} />
                      <div>Analyzing 90-day purchase price variance...</div>
                    </td>
                  </tr>
                ) : filteredList.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                      <TrendingUp size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                      <div>No purchase history found in the past 90 days. Register purchase invoices to activate live comparison trends.</div>
                    </td>
                  </tr>
                ) : (
                  filteredList.map(item => {
                    const variancePct = item.min_price > 0 && item.max_price > item.min_price
                      ? Math.round(((item.max_price - item.min_price) / item.min_price) * 100)
                      : 0;

                    return (
                      <tr key={item.item_id}>
                        {/* Code */}
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-dark, #d97706)' }}>
                          {item.item_code}
                        </td>

                        {/* Name */}
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{item.item_name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)' }}>
                            {item.prices?.length || 0} purchase orders logged
                          </div>
                        </td>

                        {/* Unit */}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-2, #f3f4f6)', border: '1px solid #e5e7eb', fontSize: 11, fontWeight: 600 }}>
                            {item.unit}
                          </span>
                        </td>

                        {/* Lowest Price */}
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>
                          {Number(item.min_price || 0).toFixed(2)} <span style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)' }}>{BRAND_CURRENCY}</span>
                        </td>

                        {/* Highest Price */}
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>
                          {Number(item.max_price || 0).toFixed(2)} <span style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)' }}>{BRAND_CURRENCY}</span>
                        </td>

                        {/* Latest Price */}
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary-dark, #d97706)' }}>
                          {Number(item.latest_price || 0).toFixed(2)} <span style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)' }}>{BRAND_CURRENCY}</span>
                        </td>

                        {/* Variance Spread */}
                        <td style={{ textAlign: 'center' }}>
                          {variancePct > 0 ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 9999,
                              fontSize: 10,
                              fontWeight: 700,
                              background: variancePct > 15 ? 'rgba(239, 68, 68, 0.12)' : variancePct > 5 ? 'rgba(244, 180, 0, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                              color: variancePct > 15 ? '#dc2626' : variancePct > 5 ? 'var(--primary-dark, #d97706)' : '#059669',
                              border: `1px solid ${variancePct > 15 ? 'rgba(239, 68, 68, 0.3)' : variancePct > 5 ? 'rgba(244, 180, 0, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                            }}>
                              <TrendingUp size={11} />
                              +{variancePct}%
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)', fontFamily: 'monospace' }}>Stable (0%)</span>
                          )}
                        </td>

                        {/* Vendors Involved */}
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {item.vendors_involved && item.vendors_involved.map((v, vi) => (
                              <span key={vi} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface-2, #f3f4f6)', border: '1px solid #e5e7eb', color: 'var(--secondary, #103C43)' }}>
                                {v}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
