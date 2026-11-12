import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from '../api';
import { useNavigate } from 'react-router-dom';
import { 
  Banknote, 
  Clock, 
  RefreshCw, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  CheckCircle2, 
  ArrowRight,
  ShieldAlert,
  Receipt,
  Printer,
  Search,
  Building2,
  X,
  CreditCard
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSaudiPreviousMonthStr, formatMonthDisplay } from '../utils/timezone';

const CURRENCY = 'SAR';

export default function SalaryPayDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(() => getSaudiPreviousMonthStr());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({
    total_employees: 0,
    salary_paid_employees_count: 0,
    total_salary_paid: 0,
    total_overtime_paid: 0,
    total_deductions: 0,
    carry_forward_to_next: 0,
    previous_month_carry_forward: 0,
    paid_employees_count: 0,
    partial_employees_count: 0,
    unpaid_employees_count: 0
  });
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [error, setError] = useState(null);
  const printSlipRef = useRef(null);

  const assignedBranch = user?.branch || 'All Branches';

  // Fetch 5 Core KPI Metrics
  const fetchSummary = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await axios.get('/api/payroll/salary-pay-summary', {
        params: { 
          month: selectedMonth,
          branch: user?.branch || undefined
        }
      });
      setSummary(res.data);
    } catch (err) {
      console.error('Failed to load salary pay summary:', err);
      setError(err.response?.data?.error || 'Failed to load salary payment summary from database.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth, user?.branch]);

  // Fetch 12-Column Payment History
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get('/api/payroll/payment-history', {
        params: { 
          month: selectedMonth,
          branch: user?.branch || undefined
        }
      });
      setHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load payment history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedMonth, user?.branch]);

  useEffect(() => {
    fetchSummary();
    fetchHistory();
  }, [fetchSummary, fetchHistory]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    let prevYear = y;
    let prevMonth = m - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = y - 1;
    }
    setSelectedMonth(`${prevYear}-${String(prevMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    let nextYear = y;
    let nextMonth = m + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear = y + 1;
    }
    setSelectedMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
  };

  const formatMonthTitle = (monthStr) => {
    return formatMonthDisplay(monthStr);
  };

  // Filtered payment history based on search query
  const filteredHistory = history.filter(row => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (row.employee_name || '').toLowerCase().includes(q) ||
      (row.employee_code || '').toLowerCase().includes(q) ||
      (row.branch || '').toLowerCase().includes(q) ||
      (row.paid_by || '').toLowerCase().includes(q)
    );
  });

  // Print Salary Slip handler
  const handlePrintSlip = (item) => {
    setSelectedSlip(item);
  };

  const triggerBrowserPrint = () => {
    if (!selectedSlip) return;
    const printContent = document.getElementById('salary-slip-print-content');
    if (!printContent) return;

    const printWin = window.open('', '_blank', 'width=800,height=900');
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Salary Slip - ${selectedSlip.employee_name} (${selectedSlip.month})</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              padding: 24px;
              color: #0f172a;
              background: #fff;
              line-height: 1.4;
            }
            .slip-box {
              max-width: 650px;
              margin: 0 auto;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 24px;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 16px;
            }
            .header h2 { margin: 0; font-size: 20px; font-weight: 800; text-transform: uppercase; }
            .header p { margin: 4px 0 0; font-size: 13px; color: #475569; }
            .meta-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 8px 16px;
              margin-bottom: 16px;
              font-size: 13px;
            }
            .meta-item { display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px; }
            .meta-label { color: #64748b; font-weight: 600; }
            .meta-val { font-weight: 700; color: #0f172a; }
            .finance-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
              font-size: 13px;
            }
            .finance-table th, .finance-table td {
              padding: 8px 12px;
              border: 1px solid #cbd5e1;
            }
            .finance-table th {
              background: #f8fafc;
              font-weight: 800;
              text-transform: uppercase;
              font-size: 11px;
            }
            .total-row {
              background: #f1f5f9;
              font-weight: 900;
              font-size: 14px;
            }
            .signatures {
              margin-top: 40px;
              display: flex;
              justify-content: space-between;
              padding-top: 16px;
            }
            .sig-box {
              text-align: center;
              width: 180px;
              border-top: 1px solid #475569;
              padding-top: 6px;
              font-size: 12px;
              color: #475569;
              font-weight: 600;
            }
            @media print {
              body { padding: 0; }
              .slip-box { border: none; padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="slip-box">
            <div class="header">
              <h2>Pizza Shop — Official Salary Slip</h2>
              <p>Branch: ${selectedSlip.branch} • Period: ${selectedSlip.month}</p>
            </div>
            <div class="meta-grid">
              <div class="meta-item"><span class="meta-label">Employee Name:</span><span class="meta-val">${selectedSlip.employee_name}</span></div>
              <div class="meta-item"><span class="meta-label">Employee Code:</span><span class="meta-val">${selectedSlip.employee_code}</span></div>
              <div class="meta-item"><span class="meta-label">Payment Date:</span><span class="meta-val">${selectedSlip.payment_date} ${selectedSlip.payment_time}</span></div>
              <div class="meta-item"><span class="meta-label">Disbursed By:</span><span class="meta-val">${selectedSlip.paid_by}</span></div>
              <div class="meta-item"><span class="meta-label">Payment Status:</span><span class="meta-val">${selectedSlip.payment_status}</span></div>
              <div class="meta-item"><span class="meta-label">Branch:</span><span class="meta-val">${selectedSlip.branch}</span></div>
            </div>
            <table class="finance-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style="text-align: right;">Amount (SAR)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Disbursed Salary Amount</td>
                  <td style="text-align: right; font-weight: 700;">${selectedSlip.salary_amount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Overtime Amount Paid</td>
                  <td style="text-align: right; color: #2563eb; font-weight: 700;">+ ${selectedSlip.overtime_amount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Deductions (Advances / Absents / Khata)</td>
                  <td style="text-align: right; color: #dc2626; font-weight: 700;">- ${selectedSlip.deduction_amount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Carry Forward Amount</td>
                  <td style="text-align: right; color: #ea580c; font-weight: 700;">${selectedSlip.carry_forward_amount.toFixed(2)}</td>
                </tr>
                <tr class="total-row">
                  <td>Total Net Disbursed</td>
                  <td style="text-align: right; color: #16a34a;">SAR ${selectedSlip.salary_amount.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <div class="signatures">
              <div class="sig-box">Employee Signature</div>
              <div class="sig-box">Operator / Cashier Signature</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1400, margin: '0 auto' }}>
      
      {/* ══════════════════════════════════════════════════════════════════
          TOP HEADER: Assigned Branch & Operational Info
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: '#ecfdf5',
              color: '#059669',
              padding: '6px 10px',
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center'
            }}>
              <Banknote size={20} />
            </span>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Salary Pay Operator Dashboard
            </h1>
            <span style={{
              fontSize: 11.5,
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: 12,
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}>
              <Building2 size={13} />
              Assigned: {assignedBranch}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Exclusive branch salary disbursement and payment history for <strong>{formatMonthTitle(selectedMonth)}</strong>
          </p>
        </div>

        {/* Month Selector + Refresh + Primary Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Month Switcher */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '2px 4px'
          }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              title="Previous Month"
              style={{
                background: 'none',
                border: 'none',
                padding: '6px',
                cursor: 'pointer',
                color: '#475569',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px' }}>
              <Calendar size={14} style={{ color: '#0284c7' }} />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              title="Next Month"
              style={{
                background: 'none',
                border: 'none',
                padding: '6px',
                cursor: 'pointer',
                color: '#475569',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => { fetchSummary(true); fetchHistory(); }}
            disabled={refreshing || loading}
            title="Refresh Live Data"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: (refreshing || loading) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          {/* Go to Salary Pay Screen */}
          <button
            type="button"
            onClick={() => navigate('/payroll')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#16a34a',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
              transition: 'all 0.15s ease'
            }}
          >
            <span>Process Salary Payments</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      

      {/* ══════════════════════════════════════════════════════════════════
          EXACT 5 CORE STATISTIC CARDS (BRANCH-RESTRICTED)
          1. Total Employees (assigned branch)
          2. Salary Paid Employees (assigned branch, selected month)
          3. Total Salary Paid (assigned branch, selected month)
          4. Overtime Total Paid (assigned branch, selected month)
          5. Total Deductions (assigned branch, selected month)
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>

        {/* Card 1: Total Employees */}
        <div style={{
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #bfdbfe',
          padding: '16px 18px',
          boxShadow: '0 2px 6px rgba(37, 99, 235, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#2563eb' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Total Employees
              </span>
              <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '5px', borderRadius: 6, display: 'inline-flex' }}>
                <Users size={16} />
              </span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, marginBottom: 6 }}>
              {loading ? '...' : summary.total_employees}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
            Assigned branch active staff
          </div>
        </div>

        {/* Card 2: Salary Paid Employees */}
        <div style={{
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #bbf7d0',
          padding: '16px 18px',
          boxShadow: '0 2px 6px rgba(22, 163, 74, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#16a34a' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Salary Paid Employees
              </span>
              <span style={{ background: '#dcfce7', color: '#15803d', padding: '5px', borderRadius: 6, display: 'inline-flex' }}>
                <CheckCircle2 size={16} />
              </span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, marginBottom: 6 }}>
              {loading ? '...' : summary.salary_paid_employees_count}
              <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginLeft: 6 }}>
                / {summary.total_employees}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 700 }}>
            {summary.total_employees > 0 ? Math.round((summary.salary_paid_employees_count / summary.total_employees) * 100) : 0}% paid this month
          </div>
        </div>

        {/* Card 3: Total Salary Paid */}
        <div style={{
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #a7f3d0',
          padding: '16px 18px',
          boxShadow: '0 2px 6px rgba(5, 150, 105, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#059669' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Total Salary Paid
              </span>
              <span style={{ background: '#ecfdf5', color: '#059669', padding: '5px', borderRadius: 6, display: 'inline-flex' }}>
                <Banknote size={16} />
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, marginBottom: 6 }}>
              {loading ? '...' : (
                <>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#059669', marginRight: 4 }}>{CURRENCY}</span>
                  {summary.total_salary_paid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
            Disbursed in {formatMonthTitle(selectedMonth)}
          </div>
        </div>

        {/* Card 4: Overtime Total Paid */}
        <div style={{
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #c7d2fe',
          padding: '16px 18px',
          boxShadow: '0 2px 6px rgba(79, 70, 229, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#4f46e5' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#3730a3', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Overtime Total Paid
              </span>
              <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '5px', borderRadius: 6, display: 'inline-flex' }}>
                <Clock size={16} />
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, marginBottom: 6 }}>
              {loading ? '...' : (
                <>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#4f46e5', marginRight: 4 }}>{CURRENCY}</span>
                  {summary.total_overtime_paid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
            Overtime settlements
          </div>
        </div>

        {/* Card 5: Total Deductions */}
        <div style={{
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #fde68a',
          padding: '16px 18px',
          boxShadow: '0 2px 6px rgba(217, 119, 6, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#d97706' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Total Deductions
              </span>
              <span style={{ background: '#fef3c7', color: '#b45309', padding: '5px', borderRadius: 6, display: 'inline-flex' }}>
                <Receipt size={16} />
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, marginBottom: 6 }}>
              {loading ? '...' : (
                <>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#d97706', marginRight: 4 }}>{CURRENCY}</span>
                  {summary.total_deductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
            Advances, khata & absences
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SALARY PAYMENT HISTORY TABLE (12 REQUIRED COLUMNS)
          Columns:
          1. Employee Name
          2. Employee ID
          3. Branch
          4. Payment Date
          5. Payment Time
          6. Salary Amount
          7. Overtime Amount
          8. Deduction Amount
          9. Carry Forward Amount
          10. Paid By
          11. Payment Status
          12. Action [Print Slip]
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        {/* Table Toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={18} color="#2563eb" />
              Salary Payment History
            </h2>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Showing verified salary disbursements for {formatMonthTitle(selectedMonth)} ({filteredHistory.length} records)
            </span>
          </div>

          {/* Search Box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '6px 12px',
            width: 260
          }}>
            <Search size={14} color="#64748b" />
            <input
              type="text"
              placeholder="Search employee or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 12.5,
                width: '100%',
                color: '#0f172a'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 12-Column Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>#</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Employee Name</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Employee ID</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Branch</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Payment Date</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Payment Time</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Salary Amount</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Overtime Amount</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Deduction Amount</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Carry Forward Amount</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Paid By</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>Payment Status</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr>
                  <td colSpan={13} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px', color: '#2563eb' }} />
                    <div>Loading payment history records...</div>
                  </td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <Receipt size={32} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#334155' }}>No salary payment records found</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      Payments processed for {formatMonthTitle(selectedMonth)} will appear here automatically.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item, index) => (
                  <tr 
                    key={item.id || index}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: index % 2 === 0 ? '#ffffff' : '#fafafa',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <td style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 600 }}>{index + 1}</td>
                    
                    {/* 1. Employee Name */}
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                      {item.employee_name}
                    </td>

                    {/* 2. Employee ID */}
                    <td style={{ padding: '10px 12px', color: '#64748b', fontFamily: 'monospace', fontWeight: 600 }}>
                      {item.employee_code}
                    </td>

                    {/* 3. Branch */}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        background: '#f1f5f9',
                        color: '#334155',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700
                      }}>
                        {item.branch}
                      </span>
                    </td>

                    {/* 4. Payment Date */}
                    <td style={{ padding: '10px 12px', color: '#334155', fontWeight: 600 }}>
                      {item.payment_date}
                    </td>

                    {/* 5. Payment Time */}
                    <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>
                      {item.payment_time}
                    </td>

                    {/* 6. Salary Amount */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                      {item.salary_amount.toFixed(2)}
                    </td>

                    {/* 7. Overtime Amount */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>
                      {item.overtime_amount > 0 ? `+${item.overtime_amount.toFixed(2)}` : '0.00'}
                    </td>

                    {/* 8. Deduction Amount */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                      {item.deduction_amount > 0 ? `-${item.deduction_amount.toFixed(2)}` : '0.00'}
                    </td>

                    {/* 9. Carry Forward Amount */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#ea580c' }}>
                      {item.carry_forward_amount.toFixed(2)}
                    </td>

                    {/* 10. Paid By */}
                    <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 600 }}>
                      {item.paid_by}
                    </td>

                    {/* 11. Payment Status */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 800,
                        background: (item.payment_status || '').toLowerCase() === 'paid' ? '#dcfce7' : '#fef3c7',
                        color: (item.payment_status || '').toLowerCase() === 'paid' ? '#15803d' : '#b45309'
                      }}>
                        {item.payment_status || 'Paid'}
                      </span>
                    </td>

                    {/* 12. Action [Print Slip] */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handlePrintSlip(item)}
                        style={{
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          color: '#1d4ed8',
                          padding: '5px 10px',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          transition: 'all 0.15s ease'
                        }}
                        title="Print Formatted Salary Slip"
                      >
                        <Printer size={13} />
                        <span>Print Slip</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PRINT SALARY SLIP MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {selectedSlip && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 14,
            maxWidth: 600,
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Printer size={18} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  Print Salary Slip Preview
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlip(null)}
                style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Printable Slip Content */}
            <div id="salary-slip-print-content" style={{ padding: 24, fontSize: 13, color: '#0f172a' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: 12, marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, textTransform: 'uppercase' }}>
                  PIZZA SHOP — SALARY PAYMENT SLIP
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Branch: {selectedSlip.branch} • Month: {selectedSlip.month}
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px 16px',
                marginBottom: 16,
                fontSize: 12.5
              }}>
                <div><strong>Employee:</strong> {selectedSlip.employee_name}</div>
                <div><strong>Employee ID:</strong> {selectedSlip.employee_code}</div>
                <div><strong>Date:</strong> {selectedSlip.payment_date}</div>
                <div><strong>Time:</strong> {selectedSlip.payment_time}</div>
                <div><strong>Paid By:</strong> {selectedSlip.paid_by}</div>
                <div><strong>Status:</strong> <span style={{ color: '#16a34a', fontWeight: 800 }}>{selectedSlip.payment_status}</span></div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', fontWeight: 800 }}>Component</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800 }}>Amount (SAR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px' }}>Disbursed Salary Amount</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{selectedSlip.salary_amount.toFixed(2)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px' }}>Overtime Amount Paid</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>+ {selectedSlip.overtime_amount.toFixed(2)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px' }}>Deductions Applied</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>- {selectedSlip.deduction_amount.toFixed(2)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px' }}>Carry Forward Amount</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ea580c', fontWeight: 700 }}>{selectedSlip.carry_forward_amount.toFixed(2)}</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: 900, fontSize: 13.5 }}>
                    <td style={{ padding: '10px' }}>Total Amount Paid</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#16a34a' }}>SAR {selectedSlip.salary_amount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, paddingTop: 10 }}>
                <div style={{ textAlign: 'center', width: 160, borderTop: '1px solid #94a3b8', paddingTop: 4, fontSize: 11, color: '#64748b' }}>
                  Employee Signature
                </div>
                <div style={{ textAlign: 'center', width: 160, borderTop: '1px solid #94a3b8', paddingTop: 4, fontSize: 11, color: '#64748b' }}>
                  Authorized Signatory
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              background: '#f8fafc'
            }}>
              <button
                type="button"
                onClick={() => setSelectedSlip(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={triggerBrowserPrint}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
                }}
              >
                <Printer size={15} />
                <span>Print Salary Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
