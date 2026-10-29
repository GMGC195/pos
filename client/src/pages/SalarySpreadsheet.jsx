import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import { 
  FileSpreadsheet, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  RefreshCw, 
  CalendarDays, 
  ArrowRightCircle, 
  Clock, 
  User, 
  CheckCircle, 
  AlertCircle, 
  Building2, 
  DollarSign, 
  CreditCard, 
  Banknote,
  X,
  History,
  TrendingUp,
  TrendingDown,
  Layers,
  Save,
  Trash2,
  AlertTriangle,
  RotateCcw,
  ShieldAlert
} from 'lucide-react';
import { CURRENCY } from '../config';
import { useAuth } from '../contexts/AuthContext';

export default function SalarySpreadsheet() {
  const [activeTab, setActiveTab] = useState('expenses'); // 'expenses' | 'paid' | 'audit'
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [payrollData, setPayrollData] = useState([]);
  const [paymentsData, setPaymentsData] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('All');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('All');

  // Modal for employee history & audit log
  const [selectedEmpHistory, setSelectedEmpHistory] = useState(null);
  const [empAuditLogs, setEmpAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Clear & Delete records modal state
  const { user } = useAuth();
  const isAdmin = useMemo(() => {
    const r = (user?.role || '').toLowerCase();
    return r === 'admin' || r === 'developer' || r === 'management' || r === 'hr manager';
  }, [user]);

  const [showClearModal, setShowClearModal] = useState(false);
  const [clearScope, setClearScope] = useState('current_month'); // 'current_month' | 'previous_months' | 'all'
  const [confirmStep, setConfirmStep] = useState(false);
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [clearing, setClearing] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);

  // Load payroll calculations and payment logs for current month
  const loadData = async () => {
    setLoading(true);
    try {
      const [payrollRes, paymentsRes, auditRes] = await Promise.all([
        axios.get(`/api/payroll/calculate?month=${selectedMonth}`),
        axios.get(`/api/payroll/payments-all?month=${selectedMonth}`),
        axios.get(`/api/payroll/audit-logs?month=${selectedMonth}&limit=300`)
      ]);
      setPayrollData(Array.isArray(payrollRes.data) ? payrollRes.data : []);
      setPaymentsData(Array.isArray(paymentsRes.data) ? paymentsRes.data : []);
      setAuditLogs(Array.isArray(auditRes.data) ? auditRes.data : []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load salary spreadsheet data');
    } finally {
      setLoading(false);
    }
  };

  // Delete individual payment entry from Salary Paid tab
  const handleDeletePayment = async (payment) => {
    const empName = payment.employee_name || 'Staff';
    const formattedAmt = `${CURRENCY} ${parseFloat(payment.amount || 0).toFixed(2)}`;
    if (!window.confirm(`Are you sure you want to delete this payment of ${formattedAmt} for ${empName}?`)) {
      return;
    }
    setDeletingPaymentId(payment.id);
    try {
      await axios.delete(`/api/payroll/payments/${payment.id}`);
      toast.success('Payment transaction deleted successfully');
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to delete payment');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // Clear / Delete salary records handler
  const handleExecuteClear = async () => {
    if (clearScope === 'all' && confirmKeyword.trim().toUpperCase() !== 'DELETE ALL') {
      toast.error('Please type "DELETE ALL" to confirm');
      return;
    }
    if (clearScope === 'previous_months' && confirmKeyword.trim().toUpperCase() !== 'DELETE') {
      toast.error('Please type "DELETE" to confirm');
      return;
    }

    setClearing(true);
    try {
      const res = await axios.post('/api/payroll/records/clear', {
        scope: clearScope,
        month: selectedMonth
      });
      toast.success(res.data?.message || 'Records cleared successfully');
      setShowClearModal(false);
      setConfirmStep(false);
      setConfirmKeyword('');
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to clear records');
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  // Unique branches for filtering
  const branches = useMemo(() => {
    const set = new Set();
    payrollData.forEach(p => {
      if (p.branch) set.add(p.branch);
    });
    return ['All', ...Array.from(set)];
  }, [payrollData]);

  // Filtered payroll rows for Salary Expenses tab
  const filteredExpenses = useMemo(() => {
    return payrollData.filter(item => {
      const matchSearch = !searchQuery || 
        (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.employee_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.role || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchBranch = branchFilter === 'All' || item.branch === branchFilter;
      return matchSearch && matchBranch;
    });
  }, [payrollData, searchQuery, branchFilter]);

  // Filtered payments for Salary Paid tab
  const filteredPayments = useMemo(() => {
    return paymentsData.filter(item => {
      const matchSearch = !searchQuery || 
        (item.employee_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.employee_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.paid_by || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchMethod = paymentMethodFilter === 'All' || 
        (item.payment_method || '').toLowerCase() === paymentMethodFilter.toLowerCase();
      const matchBranch = branchFilter === 'All' || item.branch === branchFilter;
      return matchSearch && matchMethod && matchBranch;
    });
  }, [paymentsData, searchQuery, paymentMethodFilter, branchFilter]);

  // Totals for Expenses tab
  const expenseTotals = useMemo(() => {
    return filteredExpenses.reduce((acc, row) => {
      const base = parseFloat(row.base_salary || 0);
      const payable = parseFloat(row.payable_salary !== undefined ? row.payable_salary : base);
      const bonus = parseFloat(row.bonus || 0);
      const lastBal = parseFloat(row.last_month_balance || 0);
      const otherAdj = parseFloat(row.other_adjustments || 0);
      const deductions = parseFloat(row.deductions || 0);
      const net = parseFloat(row.net_salary || 0);
      const paid = parseFloat(row.paid_amount || 0);
      const rem = Math.round((net - paid) * 100) / 100;
      const carried = parseFloat(row.carried_forward_to_next || 0);

      acc.baseSalary += base;
      acc.payableSalary += payable;
      acc.totalPaid += paid;
      acc.totalNet += net;
      acc.totalRemaining += rem;
      acc.totalCarried += carried;
      return acc;
    }, {
      baseSalary: 0,
      payableSalary: 0,
      totalPaid: 0,
      totalNet: 0,
      totalRemaining: 0,
      totalCarried: 0
    });
  }, [filteredExpenses]);

  // Totals for Paid tab
  const paidTotals = useMemo(() => {
    return filteredPayments.reduce((acc, p) => {
      const amt = parseFloat(p.amount || 0);
      acc.total += amt;
      if ((p.payment_method || '').toLowerCase() === 'cash') {
        acc.cash += amt;
      } else {
        acc.bank += amt;
      }
      return acc;
    }, { total: 0, cash: 0, bank: 0 });
  }, [filteredPayments]);

  // Open detailed history & audit modal
  const handleOpenEmpHistory = async (emp) => {
    setSelectedEmpHistory(emp);
    setLoadingAudit(true);
    try {
      const res = await axios.get(`/api/payroll/audit-logs?employee_id=${emp.id || emp.employee_id}&month=${selectedMonth}`);
      setEmpAuditLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load employee audit logs');
    } finally {
      setLoadingAudit(false);
    }
  };

  // CSV Export
  const exportToCSV = () => {
    if (activeTab === 'expenses') {
      const headers = ['Employee ID', 'Name', 'Branch', 'Month', 'Base Salary', 'Additions', 'Deductions', 'Net Payable', 'Total Paid', 'Remaining', 'Carried Forward', 'Status'];
      const rows = filteredExpenses.map(e => [
        e.employee_id,
        `"${e.name}"`,
        `"${e.branch || ''}"`,
        selectedMonth,
        parseFloat(e.base_salary || 0).toFixed(2),
        parseFloat(e.bonus || 0).toFixed(2),
        parseFloat(e.deductions || 0).toFixed(2),
        parseFloat(e.net_salary || 0).toFixed(2),
        parseFloat(e.paid_amount || 0).toFixed(2),
        (parseFloat(e.net_salary || 0) - parseFloat(e.paid_amount || 0)).toFixed(2),
        parseFloat(e.carried_forward_to_next || 0).toFixed(2),
        e.status || 'Pending'
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Salary_Expenses_${selectedMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Salary expenses spreadsheet exported to CSV');
    } else {
      const headers = ['#', 'Date', 'Employee Code', 'Employee Name', 'Month', 'Payment Method', 'Amount', 'Paid By', 'Notes'];
      const rows = filteredPayments.map((p, idx) => [
        idx + 1,
        `"${new Date(p.created_at).toLocaleString()}"`,
        p.employee_code || '',
        `"${p.employee_name || ''}"`,
        p.month,
        p.payment_method,
        parseFloat(p.amount || 0).toFixed(2),
        `"${p.paid_by || 'Admin'}"`,
        `"${(p.notes || '').replace(/"/g, '""')}"`
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Salary_Paid_Records_${selectedMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Salary paid records exported to CSV');
    }
  };

  // Print Spreadsheet
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px',
        background: 'var(--surface, #ffffff)',
        padding: '16px 20px',
        borderRadius: '12px',
        border: '1.5px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.3)'
          }}>
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary, #0f172a)', margin: 0 }}>
              Salary Spreadsheet
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)', margin: '2px 0 0 0' }}>
              Consolidated financial spreadsheet for salaries, expenses, payments & audit logs
            </p>
          </div>
        </div>

        {/* Controls: Month Picker, Refresh, Export, Print */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#f8fafc',
            border: '1.5px solid #cbd5e1',
            padding: '6px 12px',
            borderRadius: '8px'
          }}>
            <CalendarDays size={16} color="#0284c7" />
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Month:</span>
            <input 
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '13px',
                fontWeight: 800,
                color: '#0f172a',
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Refresh latest data"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Sync</span>
          </button>

          <button
            onClick={exportToCSV}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1.5px solid #059669',
              background: '#ecfdf5',
              color: '#047857',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Export spreadsheet to CSV file"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Print spreadsheet view"
          >
            <Printer size={14} />
            <span>Print</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setShowClearModal(true);
                setConfirmStep(false);
                setConfirmKeyword('');
                setClearScope('current_month');
              }}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1.5px solid #fecdd3',
                background: '#fff1f2',
                color: '#e11d48',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Clear current month or delete previous salary records"
            >
              <Trash2 size={14} />
              <span>Clear & Delete Records</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Tab Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
        borderBottom: '2px solid #e2e8f0',
        paddingBottom: '2px'
      }}>
        <button
          onClick={() => setActiveTab('expenses')}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 800,
            border: 'none',
            borderBottom: activeTab === 'expenses' ? '3px solid #0284c7' : '3px solid transparent',
            background: activeTab === 'expenses' ? '#f0f9ff' : 'transparent',
            color: activeTab === 'expenses' ? '#0369a1' : '#64748b',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <DollarSign size={16} />
          <span>Salary Expenses</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            background: activeTab === 'expenses' ? '#bae6fd' : '#e2e8f0',
            color: activeTab === 'expenses' ? '#0369a1' : '#475569'
          }}>
            {filteredExpenses.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('paid')}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 800,
            border: 'none',
            borderBottom: activeTab === 'paid' ? '3px solid #059669' : '3px solid transparent',
            background: activeTab === 'paid' ? '#ecfdf5' : 'transparent',
            color: activeTab === 'paid' ? '#047857' : '#64748b',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <CreditCard size={16} />
          <span>Salary Paid</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            background: activeTab === 'paid' ? '#a7f3d0' : '#e2e8f0',
            color: activeTab === 'paid' ? '#065f46' : '#475569'
          }}>
            {filteredPayments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 800,
            border: 'none',
            borderBottom: activeTab === 'audit' ? '3px solid #7c3aed' : '3px solid transparent',
            background: activeTab === 'audit' ? '#f5f3ff' : 'transparent',
            color: activeTab === 'audit' ? '#6d28d9' : '#64748b',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <History size={16} />
          <span>Salary Audit Logs</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            background: activeTab === 'audit' ? '#ddd6fe' : '#e2e8f0',
            color: activeTab === 'audit' ? '#5b21b6' : '#475569'
          }}>
            {auditLogs.length}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        marginBottom: '16px',
        background: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        border: '1px solid #e2e8f0'
      }}>
        {/* Search Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#f8fafc',
          border: '1.5px solid #cbd5e1',
          padding: '6px 12px',
          borderRadius: '8px',
          flex: 1,
          maxWidth: '360px'
        }}>
          <Search size={16} color="#64748b" />
          <input 
            type="text"
            placeholder="Search by name, ID or role..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '13px',
              outline: 'none',
              width: '100%'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Branch Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Branch:</span>
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              fontSize: '12px',
              fontWeight: 700,
              background: '#fff',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {branches.map(b => (
              <option key={b} value={b}>{b === 'All' ? 'All Branches' : b}</option>
            ))}
          </select>
        </div>

        {/* Payment Method filter (visible on Paid tab) */}
        {activeTab === 'paid' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Method:</span>
            <select
              value={paymentMethodFilter}
              onChange={e => setPaymentMethodFilter(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                background: '#fff',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="All">All Methods</option>
              <option value="Cash">Cash Only</option>
              <option value="Bank">Bank Only</option>
            </select>
          </div>
        )}
      </div>

      {/* KPI Summary Cards */}
      {activeTab === 'expenses' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Total Base Salary</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
              {CURRENCY} {expenseTotals.baseSalary.toFixed(2)}
            </div>
          </div>
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>Net Payable Total</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0284c7', marginTop: '2px' }}>
              {CURRENCY} {expenseTotals.totalNet.toFixed(2)}
            </div>
          </div>
          <div style={{ background: '#ecfdf5', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #a7f3d0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#047857' }}>Total Paid Amount</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
              {CURRENCY} {expenseTotals.totalPaid.toFixed(2)}
            </div>
          </div>
          <div style={{ 
            background: expenseTotals.totalRemaining < 0 ? '#fef2f2' : '#fff7ed', 
            padding: '12px 16px', 
            borderRadius: '10px', 
            border: '1.5px solid ' + (expenseTotals.totalRemaining < 0 ? '#fecaca' : '#fed7aa') 
          }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: expenseTotals.totalRemaining < 0 ? '#b91c1c' : '#c2410c' }}>
              {expenseTotals.totalRemaining < 0 ? 'Net Overpayment Balance' : 'Outstanding Remaining'}
            </span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: expenseTotals.totalRemaining < 0 ? '#dc2626' : '#ea580c', marginTop: '2px' }}>
              {CURRENCY} {expenseTotals.totalRemaining.toFixed(2)}
            </div>
          </div>
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #fed7aa' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#ea580c' }}>Carried to Next Month</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#c2410c', marginTop: '2px' }}>
              {CURRENCY} {expenseTotals.totalCarried.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'paid' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <div style={{ background: '#ecfdf5', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #a7f3d0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#047857' }}>Total Amount Paid ({selectedMonth})</span>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
              {CURRENCY} {paidTotals.total.toFixed(2)}
            </div>
          </div>
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #bae6fd' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>Total Cash Paid</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0284c7', marginTop: '2px' }}>
              {CURRENCY} {paidTotals.cash.toFixed(2)}
            </div>
          </div>
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #ddd6fe' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#6d28d9' }}>Total Bank / Card Paid</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#7c3aed', marginTop: '2px' }}>
              {CURRENCY} {paidTotals.bank.toFixed(2)}
            </div>
          </div>
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Total Payment Transactions</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#1e293b', marginTop: '2px' }}>
              {filteredPayments.length} records
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: SALARY EXPENSES SPREADSHEET */}
      {activeTab === 'expenses' && (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1.5px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Employee</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>ID</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Branch</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Month</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>Base Salary</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right', color: '#047857' }}>Additions (+)</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right', color: '#b91c1c' }}>Deductions (-)</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right', color: '#0369a1' }}>Net Payable</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right', color: '#059669' }}>Total Paid</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>Remaining</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right', color: '#c2410c' }}>Carry Forward</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                      No salary records found for {selectedMonth}
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((emp, idx) => {
                    const baseSal = parseFloat(emp.base_salary || 0);
                    const netSal = parseFloat(emp.net_salary || 0);
                    const paid = parseFloat(emp.paid_amount || 0);
                    const rem = Math.round((netSal - paid) * 100) / 100;
                    const carried = parseFloat(emp.carried_forward_to_next || 0);

                    // Calculations for additions and deductions
                    const bonus = parseFloat(emp.bonus || 0);
                    const deductions = parseFloat(emp.deductions || 0);
                    const otherAdj = parseFloat(emp.other_adjustments || 0);
                    const additionsTotal = bonus + (otherAdj > 0 ? otherAdj : 0);
                    const deductionsTotal = deductions + (otherAdj < 0 ? Math.abs(otherAdj) : 0);

                    // Auto-derived payment status
                    const autoStatus = (paid >= netSal && netSal > 0)
                      ? (rem < 0 ? 'Overpaid' : 'Paid')
                      : (paid > 0 ? 'Partial' : 'Pending');

                    return (
                      <tr 
                        key={emp.id || idx}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }} onClick={() => handleOpenEmpHistory(emp)}>
                          {emp.name}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600 }} onClick={() => handleOpenEmpHistory(emp)}>
                          {emp.employee_id}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }} onClick={() => handleOpenEmpHistory(emp)}>
                          {emp.branch || 'Main'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600 }} onClick={() => handleOpenEmpHistory(emp)}>
                          {selectedMonth}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }} onClick={() => handleOpenEmpHistory(emp)}>
                          {CURRENCY} {baseSal.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#047857' }} onClick={() => handleOpenEmpHistory(emp)}>
                          +{CURRENCY} {additionsTotal.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#b91c1c' }} onClick={() => handleOpenEmpHistory(emp)}>
                          -{CURRENCY} {deductionsTotal.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0369a1' }} onClick={() => handleOpenEmpHistory(emp)}>
                          {CURRENCY} {netSal.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#059669' }} onClick={() => handleOpenEmpHistory(emp)}>
                          {CURRENCY} {paid.toFixed(2)}
                        </td>
                        <td style={{ 
                          padding: '10px 12px', 
                          textAlign: 'right', 
                          fontWeight: 800, 
                          color: rem < 0 ? '#dc2626' : rem > 0 ? '#ea580c' : '#059669' 
                        }} onClick={() => handleOpenEmpHistory(emp)}>
                          {CURRENCY} {rem.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#c2410c' }} onClick={() => handleOpenEmpHistory(emp)}>
                          {carried !== 0 ? `${CURRENCY} ${carried.toFixed(2)}` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={() => handleOpenEmpHistory(emp)}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                            background: autoStatus === 'Paid' ? '#ecfdf5' : autoStatus === 'Overpaid' ? '#fef2f2' : autoStatus === 'Partial' ? '#eff6ff' : '#fffbeb',
                            color: autoStatus === 'Paid' ? '#059669' : autoStatus === 'Overpaid' ? '#dc2626' : autoStatus === 'Partial' ? '#2563eb' : '#d97706',
                            border: '1px solid ' + (autoStatus === 'Paid' ? '#a7f3d0' : autoStatus === 'Overpaid' ? '#fecaca' : autoStatus === 'Partial' ? '#bfdbfe' : '#fde68a')
                          }}>
                            {autoStatus}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleOpenEmpHistory(emp)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1.5px solid #cbd5e1',
                              background: '#fff',
                              color: '#0284c7',
                              fontWeight: 700,
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="View complete salary breakdown & audit history"
                          >
                            <History size={12} />
                            <span>Audit Log</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredExpenses.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 900 }}>
                    <td colSpan={4} style={{ padding: '10px 12px', color: '#334155' }}>Total Summary ({filteredExpenses.length} employees)</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{CURRENCY} {expenseTotals.baseSalary.toFixed(2)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#047857' }}>—</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b91c1c' }}>—</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0369a1' }}>{CURRENCY} {expenseTotals.totalNet.toFixed(2)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>{CURRENCY} {expenseTotals.totalPaid.toFixed(2)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: expenseTotals.totalRemaining < 0 ? '#dc2626' : '#ea580c' }}>
                      {CURRENCY} {expenseTotals.totalRemaining.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#c2410c' }}>{CURRENCY} {expenseTotals.totalCarried.toFixed(2)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SALARY PAID SPREADSHEET */}
      {activeTab === 'paid' && (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1.5px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 800, width: '40px' }}>#</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Date & Time</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Employee Name</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Employee ID</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Salary Month</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Payment Method</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right', color: '#059669' }}>Amount Paid</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, color: '#0369a1' }}>Paid By (User)</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Notes / Remarks</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                      No payment transactions recorded for {selectedMonth}
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p, idx) => (
                    <tr 
                      key={p.id || idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      <td style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: 600 }}>
                        {new Date(p.created_at).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                        {p.employee_name || 'Staff'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600 }}>
                        {p.employee_code || `EMP-${p.employee_id}`}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 600 }}>
                        {p.month}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '5px',
                          fontWeight: 700,
                          fontSize: '11px',
                          background: (p.payment_method || '').toLowerCase() === 'cash' ? '#ecfdf5' : '#e0e7ff',
                          color: (p.payment_method || '').toLowerCase() === 'cash' ? '#059669' : '#4338ca',
                          border: '1px solid ' + ((p.payment_method || '').toLowerCase() === 'cash' ? '#a7f3d0' : '#c7d2fe')
                        }}>
                          {p.payment_method}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                        {CURRENCY} {parseFloat(p.amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#0369a1', fontWeight: 700 }}>
                        {p.paid_by || 'Admin'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>
                        {p.notes || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button
                            onClick={() => handleOpenEmpHistory({ id: p.employee_id, name: p.employee_name, employee_id: p.employee_code })}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '5px',
                              border: '1px solid #cbd5e1',
                              background: '#fff',
                              color: '#0284c7',
                              fontWeight: 700,
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                            title="View Employee History"
                          >
                            History
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeletePayment(p)}
                              disabled={deletingPaymentId === p.id}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '5px',
                                border: '1px solid #fecdd3',
                                background: '#fff1f2',
                                color: '#e11d48',
                                fontWeight: 700,
                                fontSize: '11px',
                                cursor: deletingPaymentId === p.id ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="Delete this payment transaction"
                            >
                              <Trash2 size={11} />
                              {deletingPaymentId === p.id ? '...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredPayments.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 900 }}>
                    <td colSpan={6} style={{ padding: '10px 12px', color: '#334155' }}>Total Payments ({filteredPayments.length} transactions)</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>
                      {CURRENCY} {paidTotals.total.toFixed(2)}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SALARY AUDIT LOGS HISTORY */}
      {activeTab === 'audit' && (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1.5px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 800, width: '40px' }}>#</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Date & Time</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Employee</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Month</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Action</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800 }}>Description / Event Detail</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '10px 12px', fontWeight: 800, color: '#7c3aed' }}>Performed By</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                      No salary audit logs recorded for {selectedMonth}
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log, idx) => (
                    <tr key={log.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                        <div>{log.employee_name || 'Staff'}</div>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>{log.employee_code}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 600 }}>{log.month}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          background: log.action.includes('PAYMENT') || log.action.includes('PAID') ? '#ecfdf5' : log.action.includes('CARRY') ? '#fff7ed' : log.action.includes('DELETE') ? '#fef2f2' : '#f0f9ff',
                          color: log.action.includes('PAYMENT') || log.action.includes('PAID') ? '#059669' : log.action.includes('CARRY') ? '#c2410c' : log.action.includes('DELETE') ? '#dc2626' : '#0369a1',
                          border: '1px solid ' + (log.action.includes('PAYMENT') || log.action.includes('PAID') ? '#a7f3d0' : log.action.includes('CARRY') ? '#fdba74' : log.action.includes('DELETE') ? '#fecaca' : '#bae6fd')
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#334155', maxWidth: '380px' }}>
                        {log.description}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        {log.amount !== null && log.amount !== undefined ? `${CURRENCY} ${parseFloat(log.amount).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#7c3aed' }}>
                        {log.performed_by}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAILED SALARY AUDIT & HISTORY MODAL */}
      {selectedEmpHistory && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10005,
          padding: '16px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '720px',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1.5px solid #cbd5e1',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              padding: '16px 20px',
              borderBottom: '1.5px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#0284c7',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <History size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    Salary History & Audit Trail: {selectedEmpHistory.name}
                  </h3>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    ID: {selectedEmpHistory.employee_id} • Month: {selectedMonth}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmpHistory(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '6px',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Financial Snapshot */}
              {selectedEmpHistory.net_salary !== undefined && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  background: '#f8fafc',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Net Payable</span>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0284c7' }}>
                      {CURRENCY} {parseFloat(selectedEmpHistory.net_salary || 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Total Paid</span>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#059669' }}>
                      {CURRENCY} {parseFloat(selectedEmpHistory.paid_amount || 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Remaining Balance</span>
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: 800, 
                      color: (parseFloat(selectedEmpHistory.net_salary || 0) - parseFloat(selectedEmpHistory.paid_amount || 0)) < 0 ? '#dc2626' : '#ea580c' 
                    }}>
                      {CURRENCY} {(parseFloat(selectedEmpHistory.net_salary || 0) - parseFloat(selectedEmpHistory.paid_amount || 0)).toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* Audit Logs Timeline */}
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={15} color="#7c3aed" />
                  <span>Activity & Audit Trail ({empAuditLogs.length} events)</span>
                </h4>

                {loadingAudit ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                    <div>Loading audit history...</div>
                  </div>
                ) : empAuditLogs.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                    No specific audit trail records found for this employee in {selectedMonth}.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {empAuditLogs.map((log, idx) => (
                      <div 
                        key={log.id || idx}
                        style={{
                          background: '#fff',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 800,
                            background: log.action.includes('PAYMENT') ? '#ecfdf5' : log.action.includes('CARRY') ? '#fff7ed' : '#eff6ff',
                            color: log.action.includes('PAYMENT') ? '#059669' : log.action.includes('CARRY') ? '#c2410c' : '#2563eb'
                          }}>
                            {log.action}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {new Date(log.created_at).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                          {log.description}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          <span>Performed By: <strong style={{ color: '#0369a1' }}>{log.performed_by}</strong></span>
                          {log.amount !== null && (
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>
                              Amount: {CURRENCY} {parseFloat(log.amount).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setSelectedEmpHistory(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR / DELETE SALARY RECORDS MODAL */}
      {showClearModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            maxWidth: '620px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #fecdd3',
              background: '#fff1f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#ffe4e6',
                  color: '#e11d48',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#9f1239' }}>
                    Salary Records Management & Deletion
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#be123c' }}>
                    Select an action to clear current month records or purge previous history
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowClearModal(false);
                  setConfirmStep(false);
                  setConfirmKeyword('');
                }}
                disabled={clearing}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9f1239',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              {!confirmStep ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Option 1: Clear Current Month */}
                  <div 
                    onClick={() => {
                      setClearScope('current_month');
                      setConfirmStep(true);
                      setConfirmKeyword('');
                    }}
                    style={{
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      background: '#fff'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#0284c7';
                      e.currentTarget.style.background = '#f0f9ff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.background = '#fff';
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: '#e0f2fe',
                      color: '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <RotateCcw size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                          Clear Current Month Records ({selectedMonth})
                        </strong>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          Recalculate
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                        Deletes payment transactions and resets finalized records for <strong>{selectedMonth}</strong> back to unfinalized/pending status (0 paid). Live calculations will refresh cleanly.
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Delete All Previous Months Records */}
                  <div 
                    onClick={() => {
                      setClearScope('previous_months');
                      setConfirmStep(true);
                      setConfirmKeyword('');
                    }}
                    style={{
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      background: '#fff'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#f59e0b';
                      e.currentTarget.style.background = '#fffbeb';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.background = '#fff';
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: '#fef3c7',
                      color: '#d97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Trash2 size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                          Delete All Previous Records (Prior to {selectedMonth})
                        </strong>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          background: '#fef3c7',
                          color: '#b45309',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          History Purge
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                        Permanently deletes all historical salary records and payments for months before <strong>{selectedMonth}</strong>. Resets previous carry-over balance in {selectedMonth} to 0.
                      </p>
                    </div>
                  </div>

                  {/* Option 3: Complete Reset (All Months) */}
                  <div 
                    onClick={() => {
                      setClearScope('all');
                      setConfirmStep(true);
                      setConfirmKeyword('');
                    }}
                    style={{
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      background: '#fff'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#e11d48';
                      e.currentTarget.style.background = '#fff1f2';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.background = '#fff';
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: '#ffe4e6',
                      color: '#e11d48',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <AlertTriangle size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                          Delete All Records (All Time Reset)
                        </strong>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          background: '#ffe4e6',
                          color: '#be123c',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          Full Wipe
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                        Permanently deletes all salary records and payment transactions across <strong>all months</strong>. Useful for demo data cleanup or total reset.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Confirmation Screen (Step 2) */
                <div>
                  <div style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    background: clearScope === 'current_month' ? '#eff6ff' : clearScope === 'previous_months' ? '#fffbeb' : '#fff1f2',
                    border: '1px solid ' + (clearScope === 'current_month' ? '#bfdbfe' : clearScope === 'previous_months' ? '#fde68a' : '#fecdd3'),
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                  }}>
                    <ShieldAlert size={22} style={{
                      color: clearScope === 'current_month' ? '#2563eb' : clearScope === 'previous_months' ? '#d97706' : '#e11d48',
                      flexShrink: 0,
                      marginTop: '2px'
                    }} />
                    <div style={{ fontSize: '13px', lineHeight: 1.4 }}>
                      <strong style={{
                        display: 'block',
                        marginBottom: '4px',
                        color: clearScope === 'current_month' ? '#1e40af' : clearScope === 'previous_months' ? '#92400e' : '#9f1239'
                      }}>
                        {clearScope === 'current_month' && `Confirm Resetting ${selectedMonth} Records`}
                        {clearScope === 'previous_months' && `Confirm Permanent Deletion of Records Prior to ${selectedMonth}`}
                        {clearScope === 'all' && `CRITICAL: Complete Deletion Across All Months`}
                      </strong>
                      <p style={{ margin: 0, color: '#475569' }}>
                        {clearScope === 'current_month' && (
                          `This will delete all cash and bank payment transactions for ${selectedMonth} and reset saved records. Employees will return to unfinalized state with 0 paid.`
                        )}
                        {clearScope === 'previous_months' && (
                          `All salary payment entries and saved records for months prior to ${selectedMonth} will be permanently removed from the database. This cannot be undone.`
                        )}
                        {clearScope === 'all' && (
                          `ALL salary records, payments, and balances across every month will be wiped completely from the database. This action is irreversible.`
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Typing confirmation for dangerous operations */}
                  {clearScope !== 'current_month' && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                        {clearScope === 'previous_months' ? (
                          <>Please type <strong style={{ color: '#d97706' }}>DELETE</strong> to confirm:</>
                        ) : (
                          <>Please type <strong style={{ color: '#e11d48' }}>DELETE ALL</strong> to confirm:</>
                        )}
                      </label>
                      <input
                        type="text"
                        value={confirmKeyword}
                        onChange={e => setConfirmKeyword(e.target.value)}
                        placeholder={clearScope === 'previous_months' ? 'DELETE' : 'DELETE ALL'}
                        disabled={clearing}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  )}

                  {/* Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      onClick={() => {
                        setConfirmStep(false);
                        setConfirmKeyword('');
                      }}
                      disabled={clearing}
                      style={{
                        padding: '9px 16px',
                        borderRadius: '8px',
                        border: '1.5px solid #cbd5e1',
                        background: '#fff',
                        color: '#475569',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: clearing ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Back
                    </button>
                    <button
                      onClick={handleExecuteClear}
                      disabled={
                        clearing ||
                        (clearScope === 'previous_months' && confirmKeyword.trim().toUpperCase() !== 'DELETE') ||
                        (clearScope === 'all' && confirmKeyword.trim().toUpperCase() !== 'DELETE ALL')
                      }
                      style={{
                        padding: '9px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        background: (clearScope === 'current_month' 
                          ? '#0284c7' 
                          : clearScope === 'previous_months' 
                            ? '#d97706' 
                            : '#e11d48'),
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: (
                          clearing ||
                          (clearScope === 'previous_months' && confirmKeyword.trim().toUpperCase() !== 'DELETE') ||
                          (clearScope === 'all' && confirmKeyword.trim().toUpperCase() !== 'DELETE ALL')
                        ) ? 'not-allowed' : 'pointer',
                        opacity: (
                          (clearScope === 'previous_months' && confirmKeyword.trim().toUpperCase() !== 'DELETE') ||
                          (clearScope === 'all' && confirmKeyword.trim().toUpperCase() !== 'DELETE ALL')
                        ) ? 0.5 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {clearing ? (
                        <>
                          <RefreshCw size={14} className="spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          <span>
                            {clearScope === 'current_month' && `Clear ${selectedMonth} Records`}
                            {clearScope === 'previous_months' && 'Delete Previous Records'}
                            {clearScope === 'all' && 'Confirm Wipe All Records'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer when not on confirm step */}
            {!confirmStep && (
              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'flex-end'
              }}>
                <button
                  onClick={() => setShowClearModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

 