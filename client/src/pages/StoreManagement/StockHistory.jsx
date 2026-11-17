import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { 
  History, 
  Search, 
  Filter, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  RotateCcw, 
  Eye, 
  Download, 
  Printer, 
  AlertCircle, 
  Building2, 
  RefreshCw, 
  X,
  FileSpreadsheet,
  Lock,
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { BRAND_CURRENCY } from '../../branding';
import { getSaudiTodayDate } from '../../utils/timezone';
import { useStore } from '../../contexts/StoreContext';
import { formatBranchLabel, SHIFT_OPTIONS } from './storeUtils';

export default function StockHistory({ 
  selectedBranch: propBranch, 
  selectedStoreId: propStoreId, 
  locations: propLocations = [], 
  user 
}) {
  const storeContext = useStore();
  const selectedBranch = propBranch || storeContext?.selectedBranch || 'All';
  const selectedStoreId = propStoreId || storeContext?.selectedStoreId || 'All';
  const locations = (propLocations && propLocations.length > 0) ? propLocations : (storeContext?.locations || []);
  const branches = storeContext?.branches || [];
  const setSelectedBranch = storeContext?.setSelectedBranch || (() => {});
  const setSelectedStoreId = storeContext?.setSelectedStoreId || (() => {});

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [storeFilter, setStoreFilter] = useState(selectedStoreId || 'All');
  const [branchFilter, setBranchFilter] = useState(selectedBranch || 'All');
  const [shiftFilter, setShiftFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => getSaudiTodayDate());

  // Detail Modal
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);

  // Reopen Modal
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  const isManagerOrAdmin = useMemo(() => {
    const role = (user?.role || '').toLowerCase();
    return ['admin', 'developer', 'management', 'store manager'].includes(role);
  }, [user]);

  // Keep filters synced if topbar/parent passes branch/store
  useEffect(() => {
    setBranchFilter(selectedBranch || 'All');
  }, [selectedBranch]);

  useEffect(() => {
    setStoreFilter(selectedStoreId || 'All');
  }, [selectedStoreId]);

  const handleBranchChange = (newBranch) => {
    setBranchFilter(newBranch);
    setSelectedBranch(newBranch);
  };

  const handleStoreChange = (newStoreId) => {
    setStoreFilter(newStoreId);
    setSelectedStoreId(newStoreId);
  };

  const handleResetFilters = () => {
    setShiftFilter('All');
    setStatusFilter('All');
    setSearchQuery('');
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setFromDate(d.toISOString().slice(0, 10));
    setToDate(getSaudiTodayDate());
    toast.success('Filters reset to default');
  };

  // Fetch entries list
  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = {};
      if (storeFilter !== 'All') params.store_id = storeFilter;
      if (branchFilter !== 'All') params.branch = branchFilter;
      if (shiftFilter !== 'All') params.shift = shiftFilter;
      if (statusFilter !== 'All') params.status = statusFilter;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const res = await axios.get('/api/store/entries/history', { params });
      setEntries(res.data || []);
    } catch (err) {
      console.error('Error fetching stock entries history:', err);
      toast.error('Failed to load stock entries history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [storeFilter, branchFilter, shiftFilter, statusFilter, fromDate, toDate]);

  // View Details
  const handleViewDetails = async (entry) => {
    setSelectedEntry(entry);
    setDetailLoading(true);
    try {
      const res = await axios.get(`/api/store/entries/${entry.id}`);
      setDetailData(res.data);
    } catch (err) {
      console.error('Error fetching entry details:', err);
      toast.error('Failed to load entry details');
    } finally {
      setDetailLoading(false);
    }
  };

  // Reopen Entry
  const handleReopenSubmit = async (e) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      toast.error('A mandatory audit reason is required to reopen this shift');
      return;
    }

    setReopening(true);
    try {
      await axios.post(`/api/store/entries/${selectedEntry.id}/reopen`, {
        reason: reopenReason.trim()
      });
      toast.success('Shift entry reopened for corrections');
      setShowReopenModal(false);
      setReopenReason('');
      
      // Refresh current detail & list
      handleViewDetails(selectedEntry);
      fetchEntries();
    } catch (err) {
      console.error('Error reopening entry:', err);
      toast.error(err.response?.data?.error || 'Failed to reopen shift');
    } finally {
      setReopening(false);
    }
  };

  // Export Sheet to Excel
  const handleExportSheetExcel = () => {
    if (!detailData || !detailData.items || detailData.items.length === 0) {
      toast.error('No item data to export');
      return;
    }

    const { entry, items } = detailData;
    const rows = items.map((it, idx) => ({
      'S.No': idx + 1,
      'Item Code': it.item_code,
      'Item Name': it.item_name,
      'Arabic Name': it.arabic_name || '',
      'Category': it.category_name || '',
      'Unit': it.unit,
      'Previous Stock': Number(it.previous_stock || 0),
      'Received Stock': Number(it.received_stock || 0),
      'Total Available': Number(it.total_stock || 0),
      'In Hand Count': Number(it.in_hand_stock || 0),
      'Consumption Qty': Number(it.consumption_quantity || 0),
      [`Unit Cost (${BRAND_CURRENCY})`]: Number(it.unit_cost || 0),
      [`Total Cost (${BRAND_CURRENCY})`]: Number(it.total_cost || 0)
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Shift_Count');
    XLSX.writeFile(workbook, `ShiftCount_${entry.entry_number}_${entry.shift}_${entry.entry_date}.xlsx`);
    toast.success('Exported shift sheet to Excel');
  };

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(e => 
      (e.entry_number || '').toLowerCase().includes(q) ||
      (e.submitted_by_name || '').toLowerCase().includes(q) ||
      (e.store_name || '').toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  return (
    <div className="store-module-wrap">
      {/* Top Filter Card */}
      <div className="store-card">
        {/* Header Row: Title, Records Badge, Description, and Actions Aligned */}
        <div className="store-header-row">
          <div className="store-header-left">
            <div className="store-header-icon">
              <History size={20} />
            </div>
            <div className="store-header-info">
              <h2 className="store-header-title">
                Shift Stock Entries History
                <span className="store-badge-count">
                  {filteredEntries.length} Records
                </span>
              </h2>
              <p className="store-header-desc">
                Audit trail of submitted and draft Day/Night physical inventory counts.
              </p>
            </div>
          </div>

          <div className="store-header-actions">
            <button
              onClick={fetchEntries}
              disabled={loading}
              className="store-btn-icon"
              title="Refresh Shift Entries"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
            <button
              onClick={handleResetFilters}
              className="store-btn-icon"
              title="Reset Filters"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        {/* Mobile Branch & Location Bar (shows only on screens <= 768px) */}
        <div className="store-mobile-location-bar">
          <div className="store-filter-col">
            <label className="store-filter-label">Branch</label>
            <select
              value={branchFilter}
              onChange={(e) => handleBranchChange(e.target.value)}
              className="store-filter-select"
            >
              <option value="All">All</option>
              {branches.map(b => (
                <option key={b} value={b}>{formatBranchLabel(b)}</option>
              ))}
            </select>
          </div>

          <div className="store-filter-col">
            <label className="store-filter-label">Store Location</label>
            <select
              value={storeFilter}
              onChange={(e) => handleStoreChange(e.target.value)}
              className="store-filter-select"
            >
              <option value="All">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} {branchFilter === 'All' ? `(${formatBranchLabel(loc.branch)})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Row: Exactly 1 Row on Desktop */}
        <div className="store-filters-wrap">
          <div className="store-filters-row">
            {/* 1. Search Sheet # / Submitter (FIRST, compact width) */}
            <div className="store-filter-col" style={{ flex: '1.4 1 180px' }}>
              <label className="store-filter-label">Search Sheet # / User</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, color: '#9ca3af' }} />
                <input
                  type="text"
                  placeholder="Filter by entry # or user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="store-filter-input"
                  style={{ paddingLeft: 30 }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* 2. Shift Switchable Segmented Buttons */}
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

            {/* 3. Status Filter */}
            <div className="store-filter-col" style={{ flex: '1 1 130px' }}>
              <label className="store-filter-label">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="store-filter-select"
              >
                <option value="All">All Statuses</option>
                <option value="Submitted">Submitted (Finalized)</option>
                <option value="Draft">Draft</option>
                <option value="Reopened">Reopened</option>
              </select>
            </div>

            {/* 4. From Date */}
            <div className="store-filter-col" style={{ flex: '0.9 1 115px' }}>
              <label className="store-filter-label">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="store-filter-input"
              />
            </div>

            {/* 5. To Date */}
            <div className="store-filter-col" style={{ flex: '0.9 1 115px' }}>
              <label className="store-filter-label">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="store-filter-input"
              />
            </div>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="store-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="store-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Entry #</th>
                <th>Date</th>
                <th>Shift</th>
                <th>Store Location</th>
                <th>Branch</th>
                <th style={{ textAlign: 'center' }}>Items Count</th>
                <th style={{ textAlign: 'right' }}>Consumption Value</th>
                <th>Submitted By</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--primary, #F4B400)' }} />
                    <div>Loading shift history records...</div>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                    <History size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div>No shift entry records found for the selected filters.</div>
                  </td>
                </tr>
              ) : (
                filteredEntries.map(ent => (
                  <tr key={ent.id}>
                    {/* Entry Number */}
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-dark, #d97706)' }}>
                      {ent.entry_number}
                    </td>

                    {/* Date */}
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {ent.entry_date}
                    </td>

                    {/* Shift */}
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        background: ent.shift === 'Day' ? 'rgba(244, 180, 0, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                        color: ent.shift === 'Day' ? 'var(--primary-dark, #d97706)' : '#4f46e5'
                      }}>
                        {ent.shift === 'Day' ? '☀️ Day' : '🌙 Night'}
                      </span>
                    </td>

                    {/* Store */}
                    <td style={{ fontWeight: 600, fontSize: 12 }}>
                      {ent.store_name}
                    </td>

                    {/* Branch */}
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--secondary, #103C43)' }}>
                        {formatBranchLabel(ent.store_branch)}
                      </span>
                    </td>

                    {/* Items */}
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>
                      {ent.total_items}
                    </td>

                    {/* Consumption Value */}
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                      {Number(ent.total_consumption_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)', fontWeight: 400 }}>{BRAND_CURRENCY}</span>
                    </td>

                    {/* Submitted By */}
                    <td style={{ fontSize: 12 }}>
                      {ent.submitted_by_name || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Draft</span>}
                    </td>

                    {/* Status */}
                    <td style={{ textAlign: 'center' }}>
                      <span className={`store-status-badge ${ent.status === 'Submitted' ? 'active' : ent.status === 'Reopened' ? '' : 'inactive'}`} style={ent.status === 'Reopened' ? { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' } : {}}>
                        {ent.status}
                      </span>
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleViewDetails(ent)}
                        className="store-btn store-btn-outline"
                        style={{ height: 28, padding: '0 10px', fontSize: 11 }}
                      >
                        <Eye size={12} />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL */}
      {selectedEntry && (
        <div className="store-modal-overlay" onClick={() => setSelectedEntry(null)}>
          <div className="store-modal-dialog store-modal-dialog-lg" style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="store-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="store-header-icon">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="store-modal-title">
                    Shift Sheet: <span style={{ fontFamily: 'monospace', color: 'var(--primary-dark, #d97706)' }}>{selectedEntry.entry_number}</span>
                    <span className="store-badge-count">
                      {selectedEntry.status}
                    </span>
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
                    {selectedEntry.store_name} ({selectedEntry.store_branch}) • {selectedEntry.entry_date} ({selectedEntry.shift} Shift)
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={handleExportSheetExcel}
                  className="store-btn store-btn-secondary"
                  style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                >
                  <Download size={14} />
                  <span>Excel</span>
                </button>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="store-modal-close"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Summary metadata cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/60">
                  <div className="text-[11px] text-slate-400">Date & Shift</div>
                  <div className="text-xs font-semibold text-slate-200 mt-0.5">
                    {selectedEntry.entry_date} ({selectedEntry.shift})
                  </div>
                </div>

                <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/60">
                  <div className="text-[11px] text-slate-400">Submitted By</div>
                  <div className="text-xs font-semibold text-slate-200 mt-0.5">
                    {selectedEntry.submitted_by_name || 'Draft (Pending)'}
                  </div>
                </div>

                <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/60">
                  <div className="text-[11px] text-slate-400">Total Items</div>
                  <div className="text-xs font-semibold text-slate-200 mt-0.5 font-mono">
                    {detailData?.items?.length || selectedEntry.total_items}
                  </div>
                </div>

                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <div className="text-[11px] text-amber-300">Total Consumption Value</div>
                  <div className="text-xs font-bold text-amber-400 mt-0.5 font-mono">
                    {Number(selectedEntry.total_consumption_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {BRAND_CURRENCY}
                  </div>
                </div>
              </div>

              {/* Reopen Info Banner if present */}
              {selectedEntry.status === 'Reopened' && (
                <div className="p-3.5 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-start gap-3">
                  <AlertCircle size={18} className="text-purple-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    <span className="font-semibold text-purple-300">Reopened by {selectedEntry.reopened_by_name}:</span>
                    <p className="text-purple-200 italic">"{selectedEntry.reopen_reason}"</p>
                  </div>
                </div>
              )}

              {/* Items Breakdown Table */}
              <div className="border border-slate-700/60 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 text-[10px] font-semibold text-slate-400 tracking-wider uppercase border-b border-slate-700">
                      <th className="py-2.5 px-3">Code</th>
                      <th className="py-2.5 px-3">Item Name</th>
                      <th className="py-2.5 px-2 text-center">Unit</th>
                      <th className="py-2.5 px-3 text-right">Prev Stock</th>
                      <th className="py-2.5 px-3 text-right">Received</th>
                      <th className="py-2.5 px-3 text-right">Total Avail</th>
                      <th className="py-2.5 px-3 text-right font-bold text-amber-300">In Hand</th>
                      <th className="py-2.5 px-3 text-right font-bold text-rose-300">Consumed</th>
                      <th className="py-2.5 px-3 text-right">Cost Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs">
                    {detailLoading ? (
                      <tr>
                        <td colSpan="9" className="py-8 text-center text-slate-400">
                          <RefreshCw size={20} className="animate-spin text-amber-400 mx-auto mb-2" />
                          Loading sheet details...
                        </td>
                      </tr>
                    ) : (!detailData || !detailData.items || detailData.items.length === 0) ? (
                      <tr>
                        <td colSpan="9" className="py-8 text-center text-slate-400">
                          No items recorded on this sheet.
                        </td>
                      </tr>
                    ) : (
                      detailData.items.map(it => (
                        <tr key={it.id} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-mono text-amber-400 text-[11px]">
                            {it.item_code}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-200">{it.item_name}</div>
                            {it.arabic_name && (
                              <div className="text-[10px] text-slate-400 font-arabic">{it.arabic_name}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center text-slate-400 text-[11px]">
                            {it.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {Number(it.previous_stock || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                            +{Number(it.received_stock || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {Number(it.total_stock || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300">
                            {Number(it.in_hand_stock || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-300">
                            {Number(it.consumption_quantity || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-200">
                            {Number(it.total_cost || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer with Reopen action */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <div>
                {isManagerOrAdmin && selectedEntry.status === 'Submitted' && (
                  <button
                    onClick={() => setShowReopenModal(true)}
                    className="px-3.5 py-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw size={14} />
                    Reopen Shift for Corrections
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedEntry(null)}
                className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REOPEN CONFIRMATION MODAL */}
      {showReopenModal && (
        <div className="store-modal-overlay" onClick={() => setShowReopenModal(false)}>
          <div className="store-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="store-modal-header">
              <h3 className="store-modal-title">
                <RotateCcw size={18} style={{ color: 'var(--primary-dark, #d97706)' }} />
                Reopen Finalized Shift
              </h3>
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                className="store-modal-close"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleReopenSubmit}>
              <div className="store-modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary, #4b5563)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                  Reopening allows storekeepers to edit physical counts and resubmit this shift. A mandatory audit log reason is required:
                </p>
                <div className="store-form-group">
                  <label className="store-form-label">
                    Reopen Reason <span style={{ color: 'var(--red, #ef4444)' }}>*</span>
                  </label>
                  <textarea
                    rows="3"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    required
                    placeholder="e.g. Physical recount required due to box counting discrepancy on cheese items."
                    className="store-form-textarea"
                  ></textarea>
                </div>
              </div>

              <div className="store-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="store-btn store-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reopening}
                  className="store-btn store-btn-primary"
                >
                  {reopening && <RefreshCw size={14} className="spin" />}
                  <span>Confirm Reopen</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
