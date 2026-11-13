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
import toast from 'react-hot-toast';
import { printSalarySlipViaRawBT } from '../utils/rawbtPrinter';

const CURRENCY = 'SAR';

const formatBranchShort = (b) => {
  if (!b) return '-';
  const str = String(b).trim();
  const m = str.match(/(?:Restaurant|Branch)\s*(\d+)/i);
  if (m) return `B${m[1]}`;
  if (/^B\d+$/i.test(str)) return str.toUpperCase();
  if (/^\d+$/.test(str)) return `B${str}`;
  return str;
};

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

  // Print Salary Slip handler - triggers the exact same official slip format as Payroll
  const generateSlipHtml = (rawSlip) => {
    let slip = rawSlip;
    // Guard: if slip is undefined, null, or a synthetic event, use selectedSlip
    if (!slip || typeof slip !== 'object' || slip.nativeEvent || slip._reactName || slip.target) {
      slip = selectedSlip || {};
    }

    const baseSal = parseFloat(slip.base_salary || slip.salary || 0);
    const payableSal = (slip.payable_salary !== undefined && slip.payable_salary !== null && slip.payable_salary !== '')
      ? parseFloat(slip.payable_salary)
      : Math.max(0, baseSal - parseFloat(slip.deduction_amount !== undefined ? slip.deduction_amount : (slip.deductions || 0)));
    const totalPaid = parseFloat(slip.salary_amount || slip.paid_amount || 0);
    const netSalary = (slip.net_salary !== undefined && slip.net_salary !== null && slip.net_salary !== '')
      ? parseFloat(slip.net_salary)
      : (totalPaid || payableSal || baseSal);
    const remaining = Math.round((netSalary - totalPaid) * 100) / 100;
    const lastMonthBal = parseFloat(slip.last_month_balance || 0);
    const bonus = parseFloat(slip.bonus || 0);
    const advDeduct = parseFloat(slip.advance_deduction || 0);
    const advBalance = parseFloat(slip.advance_balance || 0);
    const internet = parseFloat(slip.internet || 0);
    const kafalat = parseFloat(slip.kafalat || 0);
    const otherAdj = parseFloat(slip.other_adjustments || 0);
    const deductions = parseFloat(slip.deduction_amount !== undefined ? slip.deduction_amount : (slip.deductions || 0));

    const presents = parseInt(slip.presents || 0);
    const absents = parseInt(slip.absents || 0);
    const leaves = parseInt(slip.leaves || 0);
    const holidays = parseInt(slip.holidays || 0);
    const lateDays = parseInt(slip.late_days || 0);
    const onlyOtDays = parseInt(slip.only_overtime_days || 0);
    const onlyOtHours = parseFloat(slip.only_overtime_hours || 0);
    const simpleOtHours = parseFloat(slip.other_overtime_hours || 0);
    const rawTotalOtHours = Math.round((onlyOtHours + simpleOtHours) * 100) / 100;
    const netOtHours = parseFloat(slip.overtime_hours || rawTotalOtHours);
    const displayTotalOtHours = rawTotalOtHours > 0 ? rawTotalOtHours : Math.max(0, netOtHours);
    const totalOtPay = parseFloat(slip.overtime_amount || slip.overtime_pay || 0);

    const targetMonth = slip.month || slip.pay_period || selectedMonth || '';
    const monthFormatted = formatMonthDisplay(targetMonth);

    const printDate = new Date().toLocaleString('en-US', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const formatDuration = (totalMinutes) => {
      const mins = Math.max(0, Math.round(parseFloat(totalMinutes) || 0));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h > 0 && m > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
      if (h > 0) return `${h}h 00m`;
      return `${m}m`;
    };

    const reqMins = slip.expected_minutes !== undefined && slip.expected_minutes !== null && slip.expected_minutes !== 0 
      ? slip.expected_minutes 
      : (parseFloat(slip.expected_hours || 0) * 60);
    const reqDutyStr = reqMins > 0 ? formatDuration(reqMins) : '360h 00m';
    const actualMins = slip.actual_minutes !== undefined && slip.actual_minutes !== null && slip.actual_minutes !== 0 
      ? slip.actual_minutes 
      : (parseFloat(slip.actual_hours || 0) * 60);
    const workedDutyStr = actualMins > 0 ? formatDuration(actualMins) : (presents > 0 ? formatDuration(presents * 12 * 60) : reqDutyStr);

    const dynamicAdditions = [];
    const dynamicDeductions = [];
    if (slip.dynamic_adjustments && typeof slip.dynamic_adjustments === 'object') {
      Object.entries(slip.dynamic_adjustments).forEach(([k, val]) => {
        const v = parseFloat(val || 0);
        if (v > 0) dynamicAdditions.push({ label: k, amount: v });
        else if (v < 0) dynamicDeductions.push({ label: k, amount: Math.abs(v) });
      });
    }

    const empName = slip.employee_name || slip.name || 'Staff';
    const empCode = slip.employee_code || slip.employee_id || '-';
    const rawBranch = slip.branch || slip.employee_branch || '';
    const branchName = rawBranch ? formatBranchShort(rawBranch) : '-';
    const payStatus = slip.payment_status || (totalPaid > 0 ? (remaining <= 0 ? 'PAID' : 'PARTIAL') : 'PENDING');
    const payDate = slip.payment_date || slip.paid_date || (slip.created_at ? new Date(slip.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const payTime = slip.payment_time || (slip.created_at ? new Date(slip.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '');
    const paidBy = slip.paid_by || 'Salary Pay Operator';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Salary Slip - ${empName} (${monthFormatted})</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0 !important;
          }
          @media print {
            html, body {
              width: 100% !important;
              max-width: 68mm !important;
              margin: 0 !important;
              padding: 0 1mm !important;
              background: #fff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            * {
              page-break-inside: avoid;
              break-inside: avoid;
              box-sizing: border-box !important;
            }
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            color: #000000 !important;
          }
          body {
            width: 100%;
            max-width: 68mm;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 11px;
            font-weight: 500;
            line-height: 1.35;
            padding: 0 1mm;
            margin: 0 !important;
            background: #fff;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
          }
          .center { text-align: center; }
          .bold { font-weight: 700; }
          .divider-solid {
            border-top: 1.5px solid #000;
            margin: 4px 0;
          }
          .divider-double {
            border-top: 2.5px solid #000;
            margin: 5px 0;
          }
          .divider-dashed {
            border-top: 1px dashed #000;
            margin: 4px 0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            width: 100%;
            padding: 1.5px 0;
            font-size: 11px;
            font-weight: 500;
            box-sizing: border-box;
          }
          .row-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            margin-top: 3px;
          }
          .right { 
            text-align: right; 
            white-space: nowrap;
            margin-left: auto;
            padding-left: 4px;
            padding-right: 1mm;
            box-sizing: border-box;
          }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="bold" style="font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.5px;">EMPLOYEE SALARY SLIP</div>
          <div style="font-size: 10px; font-weight: 500; margin-top: 2px;">Printed: ${printDate}</div>
        </div>

        <div class="divider-double"></div>

        <div class="row">
          <span class="bold">Employee:</span>
          <span class="bold right">${empName}</span>
        </div>
        <div class="row">
          <span>Employee ID:</span>
          <span class="right">${empCode}</span>
        </div>
        <div class="row">
          <span>Branch:</span>
          <span class="right">${branchName}</span>
        </div>
        <div class="row">
          <span>Pay Period:</span>
          <span class="bold right">${monthFormatted}</span>
        </div>

        <div class="divider-dashed"></div>

        <div class="bold" style="font-size: 10.5px; text-transform: uppercase;">ATTENDANCE SUMMARY</div>
        <div class="row" style="font-size: 10.5px;">
          <span>P:${presents}  A:${absents}  L:${leaves}</span>
          <span class="right">H:${holidays}  OOT:${onlyOtDays}  Late:${lateDays}</span>
        </div>
        <div class="row" style="font-size: 10.5px;">
          <span>Required Duty:</span>
          <span class="right">${reqDutyStr}</span>
        </div>
        <div class="row" style="font-size: 10.5px;">
          <span>Worked Duty:</span>
          <span class="right">${workedDutyStr}</span>
        </div>
        ${(displayTotalOtHours > 0 || onlyOtDays > 0 || totalOtPay > 0) ? `
          <div class="row bold" style="font-size: 10.5px;">
            <span>Total Overtime:</span>
            <span class="right">+${displayTotalOtHours.toFixed(1)} hrs</span>
          </div>
          ${totalOtPay > 0 ? `
            <div class="row bold" style="font-size: 10.5px;">
              <span>Total Overtime Pay:</span>
              <span class="right">+${CURRENCY} ${totalOtPay.toFixed(2)}</span>
            </div>
          ` : ''}
        ` : ''}

        <div class="divider-dashed"></div>

        <div class="row-title">EARNINGS / ADDITIONS (+)</div>
        <div class="row">
          <span>Basic Base Salary</span>
          <span class="right">${CURRENCY} ${baseSal.toFixed(2)}</span>
        </div>
        ${lastMonthBal > 0 ? `
          <div class="row">
            <span>Prev M. Remaining</span>
            <span class="right">+${CURRENCY} ${lastMonthBal.toFixed(2)}</span>
          </div>
        ` : ''}
        ${bonus > 0 ? `
          <div class="row">
            <span>Bonus</span>
            <span class="right">+${CURRENCY} ${bonus.toFixed(2)}</span>
          </div>
        ` : ''}
        ${dynamicAdditions.map(a => `
          <div class="row">
            <span>${a.label}</span>
            <span class="right">+${CURRENCY} ${a.amount.toFixed(2)}</span>
          </div>
        `).join('')}
        ${otherAdj > 0 ? `
          <div class="row">
            <span>Other Additions</span>
            <span class="right">+${CURRENCY} ${otherAdj.toFixed(2)}</span>
          </div>
        ` : ''}

        <div class="divider-dashed"></div>

        <div class="row-title">DEDUCTIONS / CUTS (-)</div>
        ${deductions > 0 ? `
          <div class="row">
            <span>Short / Absence Cuts</span>
            <span class="right">-${CURRENCY} ${deductions.toFixed(2)}</span>
          </div>
        ` : ''}
        ${advDeduct > 0 ? `
          <div class="row">
            <span>Advance / Loan Cut</span>
            <span class="right">-${CURRENCY} ${advDeduct.toFixed(2)}</span>
          </div>
        ` : ''}
        ${lastMonthBal < 0 ? `
          <div class="row">
            <span>Past Balance Cut</span>
            <span class="right">-${CURRENCY} ${Math.abs(lastMonthBal).toFixed(2)}</span>
          </div>
        ` : ''}
        ${internet > 0 ? `
          <div class="row">
            <span>Internet</span>
            <span class="right">-${CURRENCY} ${internet.toFixed(2)}</span>
          </div>
        ` : ''}
        ${kafalat > 0 ? `
          <div class="row">
            <span>Kafalat</span>
            <span class="right">-${CURRENCY} ${kafalat.toFixed(2)}</span>
          </div>
        ` : ''}
        ${dynamicDeductions.map(d => `
          <div class="row">
            <span>${d.label}</span>
            <span class="right">-${CURRENCY} ${d.amount.toFixed(2)}</span>
          </div>
        `).join('')}

        <div class="divider-solid"></div>

        <div class="row bold">
          <span>Payable (Worked Duty):</span>
          <span class="right">${CURRENCY} ${payableSal.toFixed(2)}</span>
        </div>
        <div class="row bold" style="font-size: 12.5px; margin: 3px 0;">
          <span>NET PAYABLE SALARY:</span>
          <span class="right">${CURRENCY} ${netSalary.toFixed(2)}</span>
        </div>

        <div class="divider-double"></div>

        <div class="row-title">PAYMENT DISTRIBUTION</div>
        <div class="row">
          <span>Total Disbursed:</span>
          <span class="right bold">${CURRENCY} ${totalPaid.toFixed(2)}</span>
        </div>
        ${remaining !== 0 ? `
          <div class="row bold" style="font-size: 11.5px; margin-top: 2px;">
            <span>REMAINING SALARY:</span>
            <span class="right">${CURRENCY} ${remaining.toFixed(2)}</span>
          </div>
        ` : ''}
        <div class="row" style="font-size: 10px; margin-top: 1px;">
          <span>Payment Status:</span>
          <span class="right bold">${payStatus}</span>
        </div>
        <div class="row" style="font-size: 10px; margin-top: 1px;">
          <span>Payment Date:</span>
          <span class="right">${payDate}${payTime ? ' ' + payTime : ''}</span>
        </div>
        <div class="row" style="font-size: 10px; margin-top: 1px;">
          <span>Disbursed By:</span>
          <span class="right">${paidBy}</span>
        </div>

        ${advBalance > 0 ? `
          <div class="divider-dashed"></div>
          <div class="row" style="font-size: 10px;">
            <span>Remaining Loan Balance:</span>
            <span class="right">${CURRENCY} ${advBalance.toFixed(2)}</span>
          </div>
        ` : ''}

        <div class="divider-solid"></div>

        <div style="margin-top: 20px; display: flex; justify-content: space-between; font-size: 10px; width: 100%;">
          <div style="width: 46%; text-align: center;">
            <div style="border-top: 1px solid #000; padding-top: 2px;">Employee Signature</div>
          </div>
          <div style="width: 46%; text-align: center;">
            <div style="border-top: 1px solid #000; padding-top: 2px;">Manager Signature</div>
          </div>
        </div>

        <div class="center bold" style="margin-top: 12px; font-size: 10.5px; letter-spacing: 0.5px;">
          Thank You
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintSlip = (item) => {
    setSelectedSlip(item);
  };

  const triggerBrowserPrint = async (slipToPrint) => {
    const slip = (slipToPrint && typeof slipToPrint === 'object' && !slipToPrint.nativeEvent && !slipToPrint._reactName && !slipToPrint.target) 
      ? slipToPrint 
      : selectedSlip;
    if (!slip) return;

    const slipMode = localStorage.getItem('salarySlipPrintMode') || 'global';
    const effectivePrintMode = slipMode === 'global' ? (localStorage.getItem('printMode') || 'standard') : slipMode;

    if (effectivePrintMode === 'cloud') {
      const toastId = toast.loading('Sending salary slip to cloud printer...');
      try {
        const printerIp = localStorage.getItem('printerIp') || '127.0.0.1';
        const printerPort = localStorage.getItem('printerPort') || '9100';
        await axios.post('/api/payroll/cloud-print-slip', {
          emp: slip,
          printerIp,
          printerPort
        });
        toast.success('Salary slip sent to cloud printer!', { id: toastId });
        return;
      } catch (printErr) {
        console.error('Cloud print failed:', printErr);
        toast.error(printErr?.response?.data?.error || 'Failed to print via Cloud. Falling back to browser print...', { id: toastId });
      }
    } else if (effectivePrintMode === 'rawbt') {
      printSalarySlipViaRawBT(slip);
      toast.success('Sent to RawBT mobile printer');
      return;
    }

    const htmlContent = generateSlipHtml(slip);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    iframe.contentDocument.write(htmlContent);
    iframe.contentDocument.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        if (iframe && iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1000);
    }, 400);
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

                    {/* 3. Branch (Formatted as B1, B2, B3) */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{
                        background: '#f1f5f9',
                        color: '#1e293b',
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 11.5,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        display: 'inline-block'
                      }}>
                        {formatBranchShort(item.branch)}
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

            {/* Modal Body: Printable Slip Content (100% same as Payroll) */}
            <div style={{ padding: '16px 20px', background: '#f8fafc', display: 'flex', justifyContent: 'center', maxHeight: '72vh', overflowY: 'auto' }}>
              <div style={{
                width: '360px',
                background: '#ffffff',
                boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
                borderRadius: 8,
                padding: '12px 14px',
                border: '1px solid #e2e8f0'
              }}>
                <iframe
                  title="Salary Slip Preview"
                  srcDoc={generateSlipHtml(selectedSlip)}
                  style={{
                    width: '100%',
                    height: '520px',
                    border: 'none',
                    background: '#fff',
                    display: 'block'
                  }}
                />
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
                onClick={() => triggerBrowserPrint(selectedSlip)}
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
