import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Search,
  RefreshCw,
  Building2,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  History,
  AlertTriangle,
  RotateCcw,
  Printer,
  X,
  CreditCard,
  User,
  ShoppingBag,
  Layers,
  ArrowRight,
  Filter,
  Check
} from 'lucide-react';
import { CURRENCY } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { getSaudiCurrentMonthStr, getSaudiPreviousMonthStr, formatSaudiDateTime } from '../utils/timezone';

export default function Logs() {
  const { user } = useAuth();
  const isAdmin = useMemo(() => {
    const r = (user?.role || '').toLowerCase();
    return r === 'admin' || r === 'developer' || r === 'management' || r === 'hr manager';
  }, [user]);

  // Main Category Tabs: 'all' | 'salary' | 'khata' | 'orders'
  const [activeTab, setActiveTab] = useState('all');

  // Month & Date filters (Defaults strictly to current Saudi month: November 2026)
  const [selectedMonth, setSelectedMonth] = useState(() => getSaudiCurrentMonthStr());

  // Search & Branch filters
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('All');
  const [actionFilter, setActionFilter] = useState('All');

  // Data states
  const [logsData, setLogsData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Salary Sub-view state: 'unified' | 'expenses' | 'paid'
  const [salarySubView, setSalarySubView] = useState('unified');
  const [payrollExpensesData, setPayrollExpensesData] = useState([]);
  const [salaryPaymentsData, setSalaryPaymentsData] = useState([]);

  // Detail / Diff Modal
  const [selectedLogDetail, setSelectedLogDetail] = useState(null);

  // Clear / purge salary records modal
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearScope, setClearScope] = useState('current_month');
  const [confirmStep, setConfirmStep] = useState(false);
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [clearing, setClearing] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);

  // Load activity logs
  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (selectedMonth && selectedMonth !== 'All') {
        params.month = selectedMonth;
      }
      if (activeTab !== 'all') {
        // 'salary' -> 'Salary', 'khata' -> 'Khata', 'orders' -> 'Orders'
        params.category = activeTab === 'salary' ? 'Salary' : (activeTab === 'khata' ? 'Khata' : 'Orders');
      }
      if (actionFilter !== 'All') {
        params.action = actionFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await axios.get('/api/logs', { params });
      setLogsData(Array.isArray(res.data) ? res.data : []);

      // If on salary tab and needing spreadsheet views, load those as well
      if (activeTab === 'salary') {
        const [payrollRes, paymentsRes] = await Promise.all([
          axios.get(`/api/payroll/calculate?month=${selectedMonth !== 'All' ? selectedMonth : getSaudiCurrentMonthStr()}`),
          axios.get(`/api/payroll/payments-all?month=${selectedMonth !== 'All' ? selectedMonth : getSaudiCurrentMonthStr()}`)
        ]);
        setPayrollExpensesData(Array.isArray(payrollRes.data) ? payrollRes.data : []);
        setSalaryPaymentsData(Array.isArray(paymentsRes.data) ? paymentsRes.data : []);
      }
    } catch (err) {
      console.error('Error loading logs:', err);
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [activeTab, selectedMonth, actionFilter]);

  // Handle Search submit
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    loadLogs();
  };

  // Filtered logs by client-side branch & search
  const filteredLogs = useMemo(() => {
    return logsData.filter(log => {
      // Branch filter
      if (branchFilter !== 'All') {
        const b = (log.branch || '').toLowerCase();
        const target = branchFilter.toLowerCase();
        if (b !== 'all' && !b.includes(target.replace('branch ', '')) && !b.includes(target)) {
          return false;
        }
      }
      // Action filter
      if (actionFilter !== 'All' && log.action !== actionFilter) {
        return false;
      }
      // Search query (if not queried on server)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (log.entity_name || '').toLowerCase().includes(q);
        const matchDesc = (log.description || '').toLowerCase().includes(q);
        const matchReason = (log.reason || '').toLowerCase().includes(q);
        const matchUser = (log.performed_by || '').toLowerCase().includes(q);
        const matchAction = (log.action || '').toLowerCase().includes(q);
        const matchId = (log.entity_id || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchReason && !matchUser && !matchAction && !matchId) {
          return false;
        }
      }
      return true;
    });
  }, [logsData, branchFilter, actionFilter, searchQuery]);

  // Unique actions list for dropdown filter
  const availableActions = useMemo(() => {
    const set = new Set();
    logsData.forEach(l => {
      if (l.action) set.add(l.action);
    });
    return Array.from(set).sort();
  }, [logsData]);

  // Format Helpers
  const formatTimestamp = (ts) => {
    if (!ts) return '-';
    try {
      const d = new Date(ts);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return String(ts);
    }
  };

  const getModuleBadgeColor = (mod) => {
    const m = (mod || '').toLowerCase();
    if (m === 'salary') return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
    if (m === 'khata') return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    if (m === 'orders') return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
    return { bg: 'var(--surface-2)', color: 'var(--text)', border: 'var(--surface-3)' };
  };

  // Export Filtered Logs to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredLogs.length === 0) {
      toast.error('No logs available to export.');
      return;
    }

    const rows = [
      [`PIZZA SHOP - ACTIVITY AUDIT LOGS (${activeTab.toUpperCase()})`, '', '', '', '', '', '', ''],
      [`Exported On: ${new Date().toISOString().slice(0, 10)}`, '', `Period: ${selectedMonth}`, '', `Total Records: ${filteredLogs.length}`, '', '', ''],
      [],
      ['#', 'Date & Time', 'Module', 'Action', 'Entity / Name', 'Description', 'Reason / Remarks', 'Performed By', 'Branch']
    ];

    filteredLogs.forEach((log, idx) => {
      rows.push([
        idx + 1,
        formatTimestamp(log.created_at),
        log.module || '-',
        log.action || '-',
        log.entity_name || (log.entity_id ? `#${log.entity_id}` : '-'),
        log.description || '-',
        log.reason || '-',
        log.performed_by || 'System',
        log.branch || 'All'
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 12 }, { wch: 22 },
      { wch: 24 }, { wch: 40 }, { wch: 30 }, { wch: 18 }, { wch: 12 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Activity Logs');
    XLSX.writeFile(wb, `Activity_Logs_${activeTab}_${selectedMonth}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Logs exported to Excel successfully!');
  };

  // Print Logs on A4 Landscape
  const handlePrintLogs = () => {
    if (filteredLogs.length === 0) {
      toast.error('No logs available to print.');
      return;
    }

    const tableRows = filteredLogs.map((log, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${formatTimestamp(log.created_at)}</td>
        <td><b>${log.module || '-'}</b></td>
        <td><b>${log.action || '-'}</b></td>
        <td>${log.entity_name || '-'}</td>
        <td>${log.description || '-'}</td>
        <td style="color: #b91c1c;">${log.reason || '-'}</td>
        <td>${log.performed_by || 'System'}</td>
        <td>${log.branch || 'All'}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Activity Logs - ${activeTab.toUpperCase()}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm 12mm; }
          * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
          body { margin: 0; padding: 0; color: #0f172a; font-size: 11px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: 900; }
          table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
          th { background: #f1f5f9; padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; }
          td { padding: 5px 8px; border: 1px solid #e2e8f0; }
          @media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">PIZZA SHOP - SYSTEM ACTIVITY & AUDIT LOGS</div>
            <div style="font-size: 11px; color: #64748b;">Category: ${activeTab.toUpperCase()} • Records: ${filteredLogs.length}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 13px; font-weight: 800;">Month: ${selectedMonth}</div>
            <div style="font-size: 10px; color: #64748b;">Printed: ${new Date().toLocaleString()}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th>Date & Time</th>
              <th>Module</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Description</th>
              <th>Reason</th>
              <th>By</th>
              <th>Branch</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 400);
  };

  // Delete single payment entry in salary paid view
  const handleDeleteSalaryPayment = async (payment) => {
    const empName = payment.employee_name || 'Staff';
    const formattedAmt = `${CURRENCY} ${parseFloat(payment.amount || 0).toFixed(2)}`;
    if (!window.confirm(`Are you sure you want to delete this payment of ${formattedAmt} for ${empName}?`)) {
      return;
    }
    setDeletingPaymentId(payment.id);
    try {
      await axios.delete(`/api/payroll/payments/${payment.id}`);
      toast.success('Payment transaction deleted successfully');
      await loadLogs();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete payment');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // Execute Clear/Delete Records
  const handleExecuteClear = async () => {
    if (confirmKeyword !== 'CONFIRM') {
      toast.error('Please type CONFIRM to proceed');
      return;
    }
    setClearing(true);
    try {
      const res = await axios.post('/api/payroll/clear-records', {
        scope: clearScope,
        month: selectedMonth
      });
      toast.success(res.data.message || 'Records cleared successfully');
      setShowClearModal(false);
      setConfirmStep(false);
      setConfirmKeyword('');
      await loadLogs();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to clear records');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'var(--primary)', color: '#fff', padding: 8, borderRadius: 10, display: 'flex' }}>
              <History size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>System Activity & Audit Logs</h2>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                Unified activity tracking across Salary, Khata, and Order cancellations with permanent audit trails
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1.5px solid #16a34a',
              background: 'rgba(22, 163, 74, 0.08)',
              color: '#15803d',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="Download Logs as Excel (.xlsx)"
          >
            <FileSpreadsheet size={15} />
            <span>Export Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrintLogs}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--surface-3)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="Print Logs (A4 Landscape)"
          >
            <Printer size={15} style={{ color: 'var(--primary)' }} />
            <span>Print Logs</span>
          </button>

          {isAdmin && activeTab === 'salary' && (
            <button
              type="button"
              onClick={() => {
                setShowClearModal(true);
                setConfirmStep(false);
                setConfirmKeyword('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1.5px solid #ef4444',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#dc2626',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Clear or Purge Salary Records"
            >
              <Trash2 size={15} />
              <span>Clear Records</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
            title="Refresh Logs"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main 4 Category Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '2px solid var(--surface-3)', marginBottom: 18, overflowX: 'auto' }}>
        {[
          { key: 'all', label: 'All Logs', icon: <Layers size={16} /> },
          { key: 'salary', label: 'Salary Logs', icon: <CreditCard size={16} /> },
          { key: 'khata', label: 'Khata Logs', icon: <User size={16} /> },
          { key: 'orders', label: 'Order Logs', icon: <ShoppingBag size={16} /> }
        ].map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setActionFilter('All');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                border: 'none',
                background: 'transparent',
                borderBottom: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 800 : 600,
                fontSize: 13.5,
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginBottom: -2,
                whiteSpace: 'nowrap'
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Salary Tab Sub-View Switcher (When Salary Tab is Active) */}
      {activeTab === 'salary' && (
        <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: 3, gap: 4, marginBottom: 16 }}>
          {[
            { key: 'unified', label: 'Salary Activity Log' },
            { key: 'expenses', label: 'Monthly Expenses Spreadsheet' },
            { key: 'paid', label: 'Payment Records' }
          ].map(sv => (
            <button
              key={sv.key}
              type="button"
              onClick={() => setSalarySubView(sv.key)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                background: salarySubView === sv.key ? 'var(--surface)' : 'transparent',
                color: salarySubView === sv.key ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: salarySubView === sv.key ? 800 : 600,
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: salarySubView === sv.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              {sv.label}
            </button>
          ))}
        </div>
      )}

      {/* Filters Toolbar */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--surface-3)',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          {/* Month Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: '5px 10px' }}>
            <Calendar size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Month:</span>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: 'var(--text)', outline: 'none', cursor: 'pointer' }}
            >
              <option value={getSaudiCurrentMonthStr()}>{getSaudiCurrentMonthStr()} (Current)</option>
              <option value={getSaudiPreviousMonthStr()}>{getSaudiPreviousMonthStr()} (Previous)</option>
              {Array.from({ length: 10 }, (_, i) => {
                let mKey = getSaudiPreviousMonthStr();
                for (let j = 0; j <= i; j++) mKey = getSaudiPreviousMonthStr(mKey);
                return <option key={mKey} value={mKey}>{mKey}</option>;
              })}
              <option value="All">All Months (Full History)</option>
            </select>
          </div>

          {/* Action Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: '5px 10px' }}>
            <Filter size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Action:</span>
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none', cursor: 'pointer' }}
            >
              <option value="All">All Actions</option>
              {availableActions.map(act => (
                <option key={act} value={act}>{act}</option>
              ))}
            </select>
          </div>

          {/* Branch Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: '5px 10px' }}>
            <Building2 size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Branch:</span>
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none', cursor: 'pointer' }}
            >
              <option value="All">All Branches</option>
              <option value="Branch 1">Branch 1</option>
              <option value="Branch 2">Branch 2</option>
              <option value="Branch 3">Branch 3</option>
            </select>
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} style={{ position: 'relative', minWidth: 240, flex: '1 1 240px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by name, slip #, user, reason..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: 8,
                border: '1px solid var(--surface-3)',
                background: 'var(--surface-2)',
                fontSize: 12.5,
                color: 'var(--text)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </form>
        </div>

        {/* Counter */}
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
          Showing <strong>{filteredLogs.length}</strong> records
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'salary' && salarySubView === 'expenses' ? (
        /* Salary Expenses Spreadsheet */
        <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-3)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--surface-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>Monthly Salary Expenses Sheet ({selectedMonth})</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{payrollExpensesData.length} Employees</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '2px solid var(--surface-3)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px' }}>#</th>
                  <th style={{ padding: '10px 14px' }}>Employee</th>
                  <th style={{ padding: '10px 14px' }}>Branch</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Base (SAR)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Duty Hrs</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>OT Hrs</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Base Earned</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Net Payable</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Paid</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Remaining</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {payrollExpensesData.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                      No payroll calculations found for {selectedMonth}.
                    </td>
                  </tr>
                ) : (
                  payrollExpensesData.map((emp, idx) => {
                    const paid = parseFloat(emp.cash_paid || 0) + parseFloat(emp.bank_paid || 0);
                    const net = parseFloat(emp.net_salary || 0);
                    const rem = Math.round((net - paid) * 100) / 100;
                    return (
                      <tr key={emp.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                        <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text)' }}>{emp.name}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{emp.branch || 'Branch 1'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{parseFloat(emp.base_salary || 0).toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{emp.duty_hours || emp.worked_hours || 0}h</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{emp.overtime_hours || 0}h</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{parseFloat(emp.payable_salary || emp.base_salary || 0).toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#166534' }}>{net.toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0369a1' }}>{paid.toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: rem > 0 ? '#b91c1c' : '#15803d' }}>{rem.toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: rem <= 0 ? '#dcfce7' : (paid > 0 ? '#fef3c7' : '#fee2e2'),
                            color: rem <= 0 ? '#15803d' : (paid > 0 ? '#b45309' : '#b91c1c')
                          }}>
                            {rem <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Pending')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'salary' && salarySubView === 'paid' ? (
        /* Salary Paid Records */
        <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-3)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--surface-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>Salary Paid Transaction Records ({selectedMonth})</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{salaryPaymentsData.length} Payments</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '2px solid var(--surface-3)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px' }}>#</th>
                  <th style={{ padding: '10px 14px' }}>Payment Date</th>
                  <th style={{ padding: '10px 14px' }}>Employee</th>
                  <th style={{ padding: '10px 14px' }}>Method</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Amount (SAR)</th>
                  <th style={{ padding: '10px 14px' }}>Reference</th>
                  <th style={{ padding: '10px 14px' }}>Paid By</th>
                  {isAdmin && <th style={{ padding: '10px 14px', textAlign: 'center' }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {salaryPaymentsData.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                      No payment transactions found for {selectedMonth}.
                    </td>
                  </tr>
                ) : (
                  salaryPaymentsData.map((p, idx) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 14px' }}>{formatTimestamp(p.payment_date || p.created_at)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text)' }}>{p.employee_name || '-'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 700, color: (p.payment_method || '').toLowerCase() === 'bank' ? '#0284c7' : '#16a34a' }}>
                          {p.payment_method || 'Cash'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#166534' }}>
                        {CURRENCY} {parseFloat(p.amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{p.reference || '-'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{p.paid_by || 'Admin'}</td>
                      {isAdmin && (
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteSalaryPayment(p)}
                            disabled={deletingPaymentId === p.id}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: deletingPaymentId === p.id ? 'not-allowed' : 'pointer',
                              padding: 4
                            }}
                            title="Delete Payment Record"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Unified Activity Logs Table (For All Logs, Khata, Orders, and Salary Activity) */
        <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-3)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '2px solid var(--surface-3)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', width: 40, textAlign: 'center' }}>#</th>
                  <th style={{ padding: '10px 14px', minWidth: 150 }}>Timestamp</th>
                  <th style={{ padding: '10px 14px', minWidth: 90 }}>Module</th>
                  <th style={{ padding: '10px 14px', minWidth: 140 }}>Action</th>
                  <th style={{ padding: '10px 14px', minWidth: 160 }}>Entity / Target</th>
                  <th style={{ padding: '10px 14px', minWidth: 260 }}>Activity Details</th>
                  <th style={{ padding: '10px 14px', minWidth: 200 }}>Reason / Note</th>
                  <th style={{ padding: '10px 14px', minWidth: 110 }}>Performed By</th>
                  <th style={{ padding: '10px 14px', minWidth: 90 }}>Branch</th>
                  <th style={{ padding: '10px 14px', width: 60, textAlign: 'center' }}>Diff</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px', display: 'block', color: 'var(--primary)' }} />
                      Loading activity records...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                      No activity logs found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, idx) => {
                    const badge = getModuleBadgeColor(log.module);
                    const hasDiff = log.old_data || log.new_data;

                    return (
                      <tr 
                        key={log.log_id || idx} 
                        style={{ borderBottom: '1px solid var(--surface-2)', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                          {formatTimestamp(log.created_at)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`
                          }}>
                            {log.module || 'System'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text)' }}>
                          {log.action || '-'}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>
                          {log.entity_name || (log.entity_id ? `#${log.entity_id}` : '-')}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text)', lineHeight: 1.4 }}>
                          {log.description || '-'}
                        </td>
                        <td style={{ padding: '10px 14px', color: log.reason ? '#b91c1c' : 'var(--text-muted)', fontWeight: log.reason ? 600 : 400 }}>
                          {log.reason || '-'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {log.performed_by || 'System'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                          {log.branch || 'All'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {hasDiff ? (
                            <button
                              type="button"
                              onClick={() => setSelectedLogDetail(log)}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--surface-3)',
                                borderRadius: 6,
                                padding: '3px 6px',
                                color: 'var(--primary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 11,
                                fontWeight: 600
                              }}
                              title="View Changes & Audit Diff"
                            >
                              <Eye size={12} />
                              <span>Diff</span>
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>-</span>
                          )}
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

      {/* Log Detail & Diff Modal */}
      {selectedLogDetail && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            maxWidth: 620,
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
            border: '1.5px solid var(--surface-3)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--surface-3)',
              background: 'var(--surface-2)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                  Activity Audit Details
                </h3>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  {selectedLogDetail.module} • {selectedLogDetail.action}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogDetail(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'var(--surface-2)', padding: 12, borderRadius: 8, fontSize: 12.5 }}>
                <div><strong>Target:</strong> {selectedLogDetail.entity_name || `#${selectedLogDetail.entity_id}`}</div>
                <div><strong>Performed By:</strong> {selectedLogDetail.performed_by || 'System'}</div>
                <div><strong>Branch:</strong> {selectedLogDetail.branch || 'All'}</div>
                <div><strong>Date:</strong> {formatTimestamp(selectedLogDetail.created_at)}</div>
              </div>

              <div>
                <strong style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Description:</strong>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                  {selectedLogDetail.description || '-'}
                </p>
              </div>

              {selectedLogDetail.reason && (
                <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 8, padding: 10 }}>
                  <strong style={{ fontSize: 12, color: '#991b1b', textTransform: 'uppercase' }}>Mandatory Reason / Note:</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
                    {selectedLogDetail.reason}
                  </p>
                </div>
              )}

              {/* Old vs New Data Comparison */}
              {(selectedLogDetail.old_data || selectedLogDetail.new_data) && (
                <div>
                  <strong style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    State Changes / Data Diff:
                  </strong>
                  <div style={{ display: 'grid', gridTemplateColumns: selectedLogDetail.old_data ? '1fr 1fr' : '1fr', gap: 10 }}>
                    {selectedLogDetail.old_data && (
                      <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#e11d48', textTransform: 'uppercase', marginBottom: 4 }}>Previous Value</div>
                        <pre style={{ margin: 0, fontSize: 11.5, color: '#9f1239', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                          {typeof selectedLogDetail.old_data === 'object' ? JSON.stringify(selectedLogDetail.old_data, null, 2) : String(selectedLogDetail.old_data)}
                        </pre>
                      </div>
                    )}
                    {selectedLogDetail.new_data && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', marginBottom: 4 }}>New Value</div>
                        <pre style={{ margin: 0, fontSize: 11.5, color: '#14532d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                          {typeof selectedLogDetail.new_data === 'object' ? JSON.stringify(selectedLogDetail.new_data, null, 2) : String(selectedLogDetail.new_data)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--surface-3)', background: 'var(--surface-2)', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setSelectedLogDetail(null)}
                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Records Confirmation Modal */}
      {showClearModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            maxWidth: 480,
            width: '100%',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
            border: '1.5px solid #fca5a5',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
              padding: '16px 20px',
              borderBottom: '1px solid #fca5a5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#dc2626', color: '#fff', borderRadius: 8, padding: 6, display: 'flex' }}>
                  <AlertTriangle size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#991b1b' }}>
                  Clear / Delete Salary Records
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#991b1b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!confirmStep ? (
                <>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
                    Select the scope of salary records you want to delete:
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="clearScope" value="current_month" checked={clearScope === 'current_month'} onChange={() => setClearScope('current_month')} />
                    Clear records for current month ({selectedMonth})
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="clearScope" value="previous_months" checked={clearScope === 'previous_months'} onChange={() => setClearScope('previous_months')} />
                    Purge all previous months prior to {selectedMonth}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                    <input type="radio" name="clearScope" value="all" checked={clearScope === 'all'} onChange={() => setClearScope('all')} />
                    Full Reset (Purge all salary records across all months)
                  </label>
                </>
              ) : (
                <>
                  <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 8, padding: 12, color: '#991b1b', fontSize: 13 }}>
                    <strong>WARNING:</strong> This action cannot be undone. All affected payroll records, payment installments, and monthly allocations will be permanently deleted.
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                      Type "CONFIRM" to proceed:
                    </label>
                    <input
                      type="text"
                      value={confirmKeyword}
                      onChange={e => setConfirmKeyword(e.target.value)}
                      placeholder="CONFIRM"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid #dc2626', fontSize: 13, fontWeight: 700, outline: 'none' }}
                    />
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--surface-3)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--surface)', fontSize: 12.5, cursor: 'pointer' }}
              >
                Cancel
              </button>
              {!confirmStep ? (
                <button
                  type="button"
                  onClick={() => setConfirmStep(true)}
                  style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  disabled={confirmKeyword !== 'CONFIRM' || clearing}
                  onClick={handleExecuteClear}
                  style={{
                    padding: '7px 18px',
                    borderRadius: 6,
                    border: 'none',
                    background: confirmKeyword === 'CONFIRM' ? '#dc2626' : '#9ca3af',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: confirmKeyword === 'CONFIRM' && !clearing ? 'pointer' : 'not-allowed'
                  }}
                >
                  {clearing ? 'Clearing...' : 'Execute Clear'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

