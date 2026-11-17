import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  Filter, 
  Layers, 
  Building2, 
  RefreshCw, 
  TrendingDown, 
  DollarSign, 
  Package, 
  PieChart, 
  CheckCircle2,
  Table,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { BRAND_CURRENCY } from '../../branding';
import { getSaudiTodayDate } from '../../utils/timezone';
import { useStore } from '../../contexts/StoreContext';
import { formatBranchLabel, SHIFT_OPTIONS } from './storeUtils';

export default function ConsumptionReports({ 
  selectedBranch: propBranch, 
  selectedStoreId: propStoreId, 
  locations: propLocations = [] 
}) {
  const storeContext = useStore();
  const selectedBranch = propBranch || storeContext?.selectedBranch || 'All';
  const selectedStoreId = propStoreId || storeContext?.selectedStoreId || 'All';
  const locations = (propLocations && propLocations.length > 0) ? propLocations : (storeContext?.locations || []);
  const branches = storeContext?.branches || [];
  const setSelectedBranch = storeContext?.setSelectedBranch || (() => {});
  const setSelectedStoreId = storeContext?.setSelectedStoreId || (() => {});
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    total_records: 0,
    total_consumption_quantity: 0,
    total_consumption_value: 0
  });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [viewMode, setViewMode] = useState('detailed'); // 'detailed' | 'grouped'
  const [branchFilter, setBranchFilter] = useState(selectedBranch || 'All');
  const [storeFilter, setStoreFilter] = useState(selectedStoreId || 'All');
  const [shiftFilter, setShiftFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => getSaudiTodayDate());

  // Load Categories
  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/store/locations/categories');
      setCategories(res.data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  // Fetch Report Data
  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = {};
      if (branchFilter !== 'All') params.branch = branchFilter;
      if (storeFilter !== 'All') params.store_id = storeFilter;
      if (shiftFilter !== 'All') params.shift = shiftFilter;
      if (categoryFilter !== 'All') params.category_id = categoryFilter;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const res = await axios.get('/api/store/reports/consumption', { params });
      setRecords(res.data.records || []);
      setSummary(res.data.summary || {
        total_records: 0,
        total_consumption_quantity: 0,
        total_consumption_value: 0
      });
    } catch (err) {
      console.error('Error fetching consumption report:', err);
      toast.error('Failed to load consumption report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [branchFilter, storeFilter, shiftFilter, categoryFilter, fromDate, toDate]);

  // Sync with parent props
  useEffect(() => {
    if (selectedBranch && selectedBranch !== 'All') setBranchFilter(selectedBranch);
  }, [selectedBranch]);

  useEffect(() => {
    if (selectedStoreId && selectedStoreId !== 'All') setStoreFilter(selectedStoreId);
  }, [selectedStoreId]);

  // Quick Date Range Helpers
  const setPresetRange = (preset) => {
    const today = getSaudiTodayDate();
    const d = new Date();
    if (preset === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (preset === 'yesterday') {
      d.setDate(d.getDate() - 1);
      const yStr = d.toISOString().slice(0, 10);
      setFromDate(yStr);
      setToDate(yStr);
    } else if (preset === 'week') {
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    } else if (preset === 'month') {
      d.setDate(d.getDate() - 30);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    }
  };

  // Grouped by Item calculations
  const groupedByItem = useMemo(() => {
    const map = {};
    records.forEach(r => {
      const key = r.item_code || r.item_name;
      if (!map[key]) {
        map[key] = {
          item_code: r.item_code,
          item_name: r.item_name,
          arabic_name: r.arabic_name,
          category_name: r.category_name,
          unit: r.unit,
          total_consumption_quantity: 0,
          total_cost: 0,
          entries_count: 0
        };
      }
      map[key].total_consumption_quantity += parseFloat(r.calculated_consumption) || 0;
      map[key].total_cost += parseFloat(r.total_cost) || 0;
      map[key].entries_count += 1;
    });

    return Object.values(map).sort((a, b) => b.total_cost - a.total_cost);
  }, [records]);

  // Excel Export
  const handleExportExcel = () => {
    if (records.length === 0) {
      toast.error('No consumption data to export');
      return;
    }

    let exportRows = [];
    if (viewMode === 'detailed') {
      exportRows = records.map((r, idx) => ({
        'S.No': idx + 1,
        'Date': r.entry_date,
        'Shift': r.shift,
        'Branch': r.branch,
        'Store Location': r.store_name,
        'Item Code': r.item_code,
        'Item Name': r.item_name,
        'Arabic Name': r.arabic_name || '',
        'Category': r.category_name || '',
        'Unit': r.unit,
        'Prev Stock': Number(r.previous_stock || 0),
        'Received': Number(r.received_stock || 0),
        'In Hand': Number(r.in_hand_stock || 0),
        'Consumed': Number(r.calculated_consumption || 0),
        [`Unit Cost (${BRAND_CURRENCY})`]: Number(r.unit_cost || 0),
        [`Total Cost (${BRAND_CURRENCY})`]: Number(r.total_cost || 0)
      }));
    } else {
      exportRows = groupedByItem.map((g, idx) => ({
        'S.No': idx + 1,
        'Item Code': g.item_code,
        'Item Name': g.item_name,
        'Arabic Name': g.arabic_name || '',
        'Category': g.category_name || '',
        'Unit': g.unit,
        'Total Consumed Qty': Math.round(g.total_consumption_quantity * 1000) / 1000,
        [`Total Consumption Cost (${BRAND_CURRENCY})`]: Math.round(g.total_cost * 100) / 100,
        'Shifts Count': g.entries_count
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Consumption_Report');
    XLSX.writeFile(workbook, `Consumption_${viewMode}_${fromDate}_to_${toDate}.xlsx`);
    toast.success('Excel report downloaded');
  };

  return (
    <div className="store-module-wrap">
      {/* Header & Controls */}
      <div className="store-card">
        <div className="store-header-row">
          <div className="store-header-left">
            <div className="store-header-icon">
              <BarChart3 size={20} />
            </div>
            <div className="store-header-info">
              <h2 className="store-header-title">
                Store Consumption Analytics
                <span className="store-badge-count">
                  Formula: Prev + Rec - InHand
                </span>
              </h2>
              <p className="store-header-desc">
                Audited consumption reports aggregated across shifts and store locations.
              </p>
            </div>
          </div>

          <div className="store-header-actions">
            {/* View Mode Toggle */}
            <div className="store-tabs">
              <button
                type="button"
                onClick={() => setViewMode('detailed')}
                className={`store-tab-btn ${viewMode === 'detailed' ? 'active' : ''}`}
              >
                <Table size={13} />
                <span>Detailed Log</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grouped')}
                className={`store-tab-btn ${viewMode === 'grouped' ? 'active' : ''}`}
              >
                <PieChart size={13} />
                <span>Grouped by Item</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`store-tab-btn ${viewMode === 'cards' ? 'active' : ''}`}
              >
                <BarChart3 size={13} />
                <span>Cards View</span>
              </button>
            </div>

            <button
              onClick={handleExportExcel}
              className="store-btn store-btn-outline"
              title="Export Report to Excel"
            >
              <Download size={15} />
              <span>Export Excel</span>
            </button>

            <button
              onClick={fetchReport}
              disabled={loading}
              className="store-btn-icon"
              title="Refresh Report"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Mobile Branch & Store Location Bar (only on screens <= 768px) */}
        <div className="store-mobile-location-bar">
          <div className="store-filter-col">
            <label className="store-filter-label">Branch</label>
            <select
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value);
                setSelectedBranch(e.target.value);
              }}
              className="store-filter-select"
            >
              <option value="All">All Branches</option>
              {branches.map(b => (
                <option key={b} value={b}>{formatBranchLabel(b)}</option>
              ))}
            </select>
          </div>

          <div className="store-filter-col">
            <label className="store-filter-label">Store Location</label>
            <select
              value={storeFilter}
              onChange={(e) => {
                setStoreFilter(e.target.value);
                setSelectedStoreId(e.target.value);
              }}
              className="store-filter-select"
            >
              <option value="All">All Store Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({formatBranchLabel(loc.branch)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Rows (Max 1-2 Rows on Desktop) */}
        <div className="store-filters-wrap" style={{ marginTop: 10 }}>
          {/* Row 1: Shift Switch, Date Range, Presets */}
          <div className="store-filters-row">
            {/* Switchable Segmented Shift Buttons: All / Day / Night */}
            <div className="store-filter-col-fixed">
              <label className="store-filter-label">Shift</label>
              <div className="store-shift-switch">
                {SHIFT_OPTIONS.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setShiftFilter(s.id)}
                    className={`store-shift-btn ${shiftFilter === s.id ? 'active' : ''}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="store-filter-col" style={{ flex: '1 1 120px' }}>
              <label className="store-filter-label">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="store-filter-input"
              />
            </div>

            <div className="store-filter-col" style={{ flex: '1 1 120px' }}>
              <label className="store-filter-label">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="store-filter-input"
              />
            </div>

            <div className="store-filter-col-fixed" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="store-filter-label">Quick Presets</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'week', label: 'Last 7D' },
                  { id: 'month', label: 'Last 30D' }
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPresetRange(p.id)}
                    className="store-btn store-btn-outline"
                    style={{ height: 36, padding: '0 10px', fontSize: 12 }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Horizontally Scrollable Category Pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <label className="store-filter-label">Filter by Category</label>
            <div className="store-category-bar">
              <button
                type="button"
                onClick={() => setCategoryFilter('All')}
                className={`store-category-pill ${categoryFilter === 'All' ? 'active' : ''}`}
              >
                All Categories ({summary.total_records})
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id.toString())}
                  className={`store-category-pill ${categoryFilter === cat.id.toString() ? 'active' : ''}`}
                >
                  {cat.icon && <span style={{ marginRight: 4 }}>{cat.icon}</span>}
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards: 1 Horizontal Row with 2 Cards on Desktop */}
      <div className="store-kpi-grid-2">
        <div className="store-kpi-card">
          <div className="store-kpi-card-info">
            <div className="store-kpi-title">Total Consumption Value</div>
            <div className="store-kpi-value" style={{ color: 'var(--primary-dark, #d97706)' }}>
              {Number(summary.total_consumption_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {BRAND_CURRENCY}
            </div>
          </div>
          <div className="store-kpi-icon-box" style={{ background: 'rgba(244, 180, 0, 0.12)', color: 'var(--primary-dark, #d97706)' }}>
            <DollarSign size={22} />
          </div>
        </div>

        <div className="store-kpi-card">
          <div className="store-kpi-card-info">
            <div className="store-kpi-title">Total Consumed Quantity</div>
            <div className="store-kpi-value">
              {Number(summary.total_consumption_quantity || 0).toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary, #6b7280)' }}>Units ({summary.total_records} Records)</span>
            </div>
          </div>
          <div className="store-kpi-icon-box" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#2563eb' }}>
            <TrendingDown size={22} />
          </div>
        </div>
      </div>

      {/* Main Content (Cards, Detailed Table, or Grouped Table) */}
      {viewMode === 'cards' ? (
        /* CARDS VIEW */
        <div className="store-card-grid">
          {groupedByItem.length === 0 ? (
            <div className="store-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary, #6b7280)' }}>
              <BarChart3 size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <div>No consumption records found for this period.</div>
            </div>
          ) : (
            groupedByItem.map((item, idx) => (
              <div key={idx} className="store-item-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--primary-dark, #d97706)' }}>
                      {item.item_code}
                    </span>
                    <h4 style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                      {item.item_name}
                    </h4>
                    {item.arabic_name && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)', direction: 'rtl' }}>
                        {item.arabic_name}
                      </div>
                    )}
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'var(--surface-2, #f3f4f6)',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--secondary, #103C43)',
                    border: '1px solid #e5e7eb'
                  }}>
                    {item.category_name || 'Item'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 0', borderTop: '1px solid var(--surface-2, #f1f5f9)', borderBottom: '1px solid var(--surface-2, #f1f5f9)' }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 700 }}>Consumed Qty</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #111827)' }}>
                      {Number(item.total_consumption_quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span style={{ fontSize: 11, fontWeight: 500 }}>{item.unit}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 700 }}>Total Cost</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary-dark, #d97706)' }}>
                      {Number(item.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: 10 }}>{BRAND_CURRENCY}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--text-secondary, #6b7280)' }}>
                  <span>Audited Shifts: <strong>{item.entries_count}</strong></span>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                    Prev + Rec - InHand
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* TABLE VIEWS (Detailed or Grouped) */
        <div className="store-table-card">
          <div style={{ overflowX: 'auto' }}>
            {viewMode === 'detailed' ? (
              /* DETAILED SHIFT-BY-SHIFT LOG */
              <table className="store-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>Store Location</th>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th style={{ textAlign: 'center' }}>Unit</th>
                    <th style={{ textAlign: 'right' }}>Prev</th>
                    <th style={{ textAlign: 'right' }}>Recv</th>
                    <th style={{ textAlign: 'right' }}>In Hand</th>
                    <th style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary-dark, #d97706)' }}>Consumed</th>
                    <th style={{ textAlign: 'right' }}>Cost Value</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="11" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--primary, #F4B400)' }} />
                        <div>Compiling consumption records...</div>
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan="11" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                        <BarChart3 size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                        <div>No submitted shift consumption records found for this period.</div>
                      </td>
                    </tr>
                  ) : (
                    records.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {r.entry_date}
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            background: r.shift === 'Day' ? 'rgba(244, 180, 0, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                            color: r.shift === 'Day' ? 'var(--primary-dark, #d97706)' : '#4f46e5'
                          }}>
                            {r.shift}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {r.store_name}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-dark, #d97706)' }}>
                          {r.item_code}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{r.item_name}</div>
                          {r.arabic_name && <div style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)', direction: 'rtl' }}>{r.arabic_name}</div>}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary, #6b7280)' }}>
                          {r.unit}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary, #6b7280)' }}>
                          {Number(r.previous_stock || 0).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#16a34a', fontWeight: 600 }}>
                          +{Number(r.received_stock || 0).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-primary, #111827)' }}>
                          {Number(r.in_hand_stock || 0).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary-dark, #d97706)' }}>
                          {Number(r.calculated_consumption || 0).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                          {Number(r.total_cost || 0).toFixed(2)} <span style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)' }}>{BRAND_CURRENCY}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              /* GROUPED BY ITEM SUMMARY */
              <table className="store-table">
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'center' }}>Unit</th>
                    <th style={{ textAlign: 'right' }}>Total Quantity Consumed</th>
                    <th style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary-dark, #d97706)' }}>Total Consumption Cost</th>
                    <th style={{ textAlign: 'center' }}>Audited Shifts</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="7" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--primary, #F4B400)' }} />
                        <div>Aggregating items consumption...</div>
                      </td>
                    </tr>
                  ) : groupedByItem.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                        <BarChart3 size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                        <div>No consumption recorded for this period.</div>
                      </td>
                    </tr>
                  ) : (
                    groupedByItem.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-dark, #d97706)' }}>
                          {item.item_code}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{item.item_name}</div>
                          {item.arabic_name && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)', direction: 'rtl' }}>{item.arabic_name}</div>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-secondary, #6b7280)' }}>
                          {item.category_name || 'Unassigned'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-2, #f3f4f6)', border: '1px solid #e5e7eb', fontSize: 11, fontWeight: 600 }}>
                            {item.unit}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                          {Number(item.total_consumption_quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary-dark, #d97706)', fontSize: 14 }}>
                          {Number(item.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)', fontWeight: 400 }}>{BRAND_CURRENCY}</span>
                        </td>
                        <td style={{ textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-secondary, #6b7280)' }}>
                          {item.entries_count}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
