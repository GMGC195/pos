import React, { useEffect, useState } from 'react'
import axios from '../api'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { 
  CircleDollarSign, 
  Banknote, 
  CreditCard, 
  Clock, 
  Ban, 
  Undo2, 
  Globe,
  Search, 
  Printer, 
  BarChart3, 
  ClipboardList, 
  Lock,
  Eye,
  RefreshCw,
  History,
  ChevronRight,
  X,
  Filter
} from 'lucide-react'
import { CURRENCY } from '../config'
import OrderDetailModal from '../components/OrderDetailModal'
import { 
  getSaudiTodayDate, 
  getSaudiYesterdayDate, 
  getSaudiWeekAgoDate,
  formatSaudiDate,
  formatSaudiTime,
  formatSaudiDateTime
} from '../utils/timezone'

const today = () => getSaudiTodayDate()
const yesterday = () => getSaudiYesterdayDate()
const weekAgo = () => getSaudiWeekAgoDate()

export default function Reports({ isTodaySales = false }) {
  const { user } = useAuth()
  const isAdminOrDev = ['admin', 'developer'].includes(user?.role?.toLowerCase())
  const isManagement = user?.role?.toLowerCase() === 'management'
  const isCashier = user?.role?.trim().toLowerCase() === 'cashier'
  const [activeShift, setActiveShift] = useState(null)
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState([])
  const [creditSummary, setCreditSummary] = useState({ totalCredit: 0, majorPaymentsTotal: 0, majorPayments: [] })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [branch, setBranch] = useState((isAdminOrDev || isManagement) ? 'All' : (user?.branch || 'All'))
  const [loading, setLoading] = useState(true)
  const [showTodaySummary, setShowTodaySummary] = useState(false)
  const [showDetailsInModal, setShowDetailsInModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [modalPage, setModalPage] = useState(1)
  const pageSize = 30

  // Cancel Request Modal States
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelOrderTarget, setCancelOrderTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [processingCancel, setProcessingCancel] = useState(false)

  // Closing Modal States
  const [showClosingModal, setShowClosingModal] = useState(false)
  const [closingType, setClosingType] = useState(null) // 'Shift' | 'Daily'
  const [closingProcessing, setClosingProcessing] = useState(false)
  const [closingProcessingType, setClosingProcessingType] = useState(null)
  const [closingPendingInfo, setClosingPendingInfo] = useState({
    loading: false,
    totalPending: 0,
    takeaway: 0,
    delivery: 0,
    dineIn: 0
  })
  const [closingRemainingCash, setClosingRemainingCash] = useState('')

  // History Modal States
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [closingHistory, setClosingHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFrom, setHistoryFrom] = useState(today())
  const [historyTo, setHistoryTo] = useState(today())
  const [selectedHistoryReport, setSelectedHistoryReport] = useState(null)
  
  // History Filters
  const [historyFilterBranch, setHistoryFilterBranch] = useState('All')
  const [historyFilterType, setHistoryFilterType] = useState('All')
  const [historyFilterUser, setHistoryFilterUser] = useState('All')
  const [showHistoryFilters, setShowHistoryFilters] = useState(false)
  const [tableFilters, setTableFilters] = useState({ placedBy: 'All', completedBy: 'All', branch: 'All', type: 'All' })

  const load = () => {
    setLoading(true)
    Promise.all([
      axios.get('/api/transactions', { params: { from, to, branch, unclosed_only: isTodaySales } }),
      axios.get('/api/transactions/summary', { params: { from, to, branch, unclosed_only: isTodaySales } }),
      axios.get('/api/transactions/credit-summary', { params: { from, to, branch } })
    ])
      .then(([txRes, sumRes, credRes]) => {
        setTransactions(txRes.data)
        setSummary(sumRes.data)
        setCreditSummary(credRes.data || { totalCredit: 0, majorPaymentsTotal: 0, majorPayments: [] })
      })
      .catch(err => {
        console.error("Error loading reports:", err);
        toast.error("Failed to load reports. Check console.");
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { 
    load()
    const interval = setInterval(load, 300000) // Auto-refresh every 5 mins
    return () => clearInterval(interval)
  }, [from, to, branch])

  // Fetch and sync active shift for Cashier
  useEffect(() => {
    if (isTodaySales && isCashier) {
      axios.get('/api/orders/cashier-shift/active')
        .then(res => {
          if (res.data?.hasActiveShift) {
            setActiveShift(res.data.shift)
          } else {
            setActiveShift(null)
          }
        })
        .catch(err => console.error("Failed to load active shift in reports:", err))
    }
  }, [isTodaySales, isCashier])

  useEffect(() => {
    const handleShiftStarted = (e) => {
      if (isTodaySales && isCashier) {
        if (e.detail) {
          setActiveShift(e.detail)
        } else {
          axios.get('/api/orders/cashier-shift/active')
            .then(res => {
              if (res.data?.hasActiveShift) setActiveShift(res.data.shift)
            })
            .catch(() => {})
        }
        load()
      }
    }
    window.addEventListener('cashier_shift_started', handleShiftStarted)
    return () => window.removeEventListener('cashier_shift_started', handleShiftStarted)
  }, [isTodaySales, isCashier])

  // Fetch live uncompleted/hold orders breakdown when Closing Modal is opened
  useEffect(() => {
    if (showClosingModal) {
      const targetBranch = branch === 'All' ? (user?.branch || 'Branch 1') : branch;
      setClosingPendingInfo(prev => ({ ...prev, loading: true }));
      axios.get(`/api/orders/cashier-shift/previous-shift-info?branch=${encodeURIComponent(targetBranch)}`)
        .then(res => {
          if (res.data) {
            setClosingPendingInfo({
              loading: false,
              totalPending: res.data.totalPending || 0,
              takeaway: res.data.takeaway || 0,
              delivery: res.data.delivery || 0,
              dineIn: res.data.dineIn || 0
            });
          }
        })
        .catch(err => {
          console.error("Failed to load closing pending orders:", err);
          setClosingPendingInfo(prev => ({ ...prev, loading: false }));
        });
    }
  }, [showClosingModal, branch, user?.branch])

  useEffect(() => {
    setFrom(today())
    setTo(today())
    setShowDetailsInModal(false)
    setShowTodaySummary(false)
    setCurrentPage(1)
    setModalPage(1)
    setStatusFilter('All')
  }, [isTodaySales])

  useEffect(() => {
    setCurrentPage(1)
  }, [from, to, search, statusFilter, branch])

  const cashRow = summary.find(r => r.payment_method === 'Cash')
  const cardRow = summary.find(r => r.payment_method === 'Card')
  const onlineRow = summary.find(r => r.payment_method === 'Online')
  const holdRow = summary.find(r => r.payment_method === 'Hold')
  const cancelledRow = summary.find(r => r.payment_method === 'Cancelled')
  const returnedRow = summary.find(r => r.payment_method === 'Returned')
  const creditRow = summary.find(r => r.payment_method === 'Credit')
  
  const totalSales = summary
    .filter(r => r.payment_method !== 'Hold' && r.payment_method !== 'Cancelled' && r.payment_method !== 'Returned' && r.payment_method !== 'Credit')
    .reduce((s, r) => s + parseFloat(r.total || 0), 0) + parseFloat(creditSummary?.majorPaymentsTotal || 0)
    
  const totalCount = summary.reduce((s, r) => s + parseInt(r.count || 0), 0)

  const cardTotal = parseFloat(cardRow?.total || 0) + parseFloat(onlineRow?.total || 0)
  const cardCount = parseInt(cardRow?.count || 0) + parseInt(onlineRow?.count || 0)

  const isShiftSaleView = isTodaySales && isCashier

  const tiles = [
    { 
      label: isShiftSaleView ? 'Your Shift Revenue' : 'Total Revenue', 
      val: `${CURRENCY}${totalSales.toFixed(2)}`, 
      icon: <CircleDollarSign size={20} />, 
      color: '#E31837', 
      bg: '#fff1f2', 
      sub: `${totalCount} total transactions` 
    },
    { 
      label: 'Cash Sales', 
      val: `${CURRENCY}${parseFloat(cashRow?.total || 0).toFixed(2)}`, 
      icon: <Banknote size={20} />, 
      color: '#10b981', 
      bg: '#ecfdf5', 
      sub: `${cashRow?.count || 0} orders` 
    },
    { 
      label: 'Card Sales', 
      val: `${CURRENCY}${cardTotal.toFixed(2)}`, 
      icon: <CreditCard size={20} />, 
      color: '#3b82f6', 
      bg: '#eff6ff', 
      sub: `${cardCount} orders` 
    },
    { 
      label: isShiftSaleView ? 'Shift Credit' : "Today's Credit", 
      val: `${CURRENCY}${parseFloat(creditRow?.total || 0).toFixed(2)}`, 
      icon: <ClipboardList size={20} />, 
      color: '#8b5cf6', 
      bg: '#f3e8ff', 
      sub: `${creditRow?.count || 0} orders` 
    },
    { 
      label: 'Major Payment', 
      val: `${CURRENCY}${(creditSummary.majorPaymentsTotal || 0).toFixed(2)}`, 
      icon: <Banknote size={20} />, 
      color: '#14b8a6', 
      bg: '#ccfbf1', 
      sub: `Cash: ${CURRENCY}${(creditSummary.majorPaymentsCash || 0).toFixed(2)} | Card: ${CURRENCY}${(creditSummary.majorPaymentsCard || 0).toFixed(2)}` 
    }
  ]

  if (isAdminOrDev || isManagement) {
    tiles.splice(4, 0, { label: 'Total Credit', val: `${CURRENCY}${(creditSummary.totalCredit || 0).toFixed(2)}`, icon: <Globe size={20} />, color: '#f59e0b', bg: '#fef3c7', sub: 'Total Khata Balance' })
  }
  
  if (holdRow && parseInt(holdRow.count || 0) > 0) {
    tiles.push({
      label: 'Held Payments',
      val: `${CURRENCY}${parseFloat(holdRow.total || 0).toFixed(2)}`,
      icon: <Clock size={20} />,
      color: '#f59e0b',
      bg: '#fef3c7',
      sub: `${holdRow.count} orders pending`
    })
  }

  if (cancelledRow && parseInt(cancelledRow.count || 0) > 0) {
    tiles.push({
      label: 'Cancelled',
      val: `${CURRENCY}${parseFloat(cancelledRow.total || 0).toFixed(2)}`,
      icon: <Ban size={20} />,
      color: '#ef4444',
      bg: '#fee2e2',
      sub: `${cancelledRow.count} orders cancelled`
    })
  }

  if (returnedRow && parseInt(returnedRow.count || 0) > 0) {
    tiles.push({
      label: 'Returned',
      val: `${CURRENCY}${parseFloat(returnedRow.total || 0).toFixed(2)}`,
      icon: <Undo2 size={20} />,
      color: '#d97706',
      bg: '#fcf8e3',
      sub: `${returnedRow.count} orders returned`
    })
  }

  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(filteredTransactions.map(t => ({
      'Transaction ID': t.id,
      'Order ID': t.order_id,
      'Items': t.items || '',
      'Amount': parseFloat(t.amount).toFixed(2),
      'Status': `${t.payment_method} - ${t.order_status}`,
      'Date': new Date(t.created_at).toLocaleString(),
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
    XLSX.writeFile(wb, `pizza-shop-report-${from}-to-${to}.xlsx`)
  }

  const exportPDF = () => {
    const printWindow = window.open('', '', 'width=900,height=650');
    const html = `
      <html>
        <head>
          <title>${isTodaySales ? "Today's Sales Detailed Report" : "Transactions Report"}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
            h2 { text-align: center; color: #111; border-bottom: 2px solid #ddd; padding-bottom: 10px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #f8f9fa; color: #444; }
            .badge { padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 11px; }
            .success { background: #dcfce7; color: #065f46; }
            .danger { background: #fee2e2; color: #991b1b; }
            .warning { background: #fef3c7; color: #92400e; }
            .info { background: #e0f2fe; color: #1e40af; }
          </style>
        </head>
        <body>
          <h2>${isTodaySales ? "Today's Sales" : "Sales & Transactions Report"} <span style="font-size:14px;color:#666;font-weight:normal;">(${from} to ${to})</span></h2>
          
          <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
            <div style="flex: 1; border: 1px solid #ddd; padding: 12px; border-radius: 6px; background: #f8f9fa;">
              <div style="font-size: 11px; color: #666; text-transform: uppercase;">Net Revenue</div>
              <div style="font-size: 18px; font-weight: bold; color: #E31837;">${CURRENCY}${parseFloat(totalSales || 0).toFixed(2)}</div>
            </div>
            <div style="flex: 1; border: 1px solid #ddd; padding: 12px; border-radius: 6px; background: #f8f9fa;">
              <div style="font-size: 11px; color: #666; text-transform: uppercase;">Total Orders</div>
              <div style="font-size: 18px; font-weight: bold; color: #333;">${totalCount}</div>
            </div>
            <div style="flex: 1; border: 1px solid #ddd; padding: 12px; border-radius: 6px; background: #ecfdf5;">
              <div style="font-size: 11px; color: #065f46; text-transform: uppercase;">Cash Collected</div>
              <div style="font-size: 18px; font-weight: bold; color: #047857;">${CURRENCY}${parseFloat(cashRow?.total || 0).toFixed(2)}</div>
            </div>
            <div style="flex: 1; border: 1px solid #ddd; padding: 12px; border-radius: 6px; background: #eff6ff;">
              <div style="font-size: 11px; color: #1e40af; text-transform: uppercase;">Card Collected</div>
              <div style="font-size: 18px; font-weight: bold; color: #1d4ed8;">${CURRENCY}${parseFloat(cardRow?.total || 0).toFixed(2)}</div>
            </div>
            ${(cancelledRow?.count > 0 || returnedRow?.count > 0) ? `
              <div style="flex: 1; border: 1px solid #ddd; padding: 12px; border-radius: 6px; background: #fee2e2;">
                <div style="font-size: 11px; color: #991b1b; text-transform: uppercase;">Cancelled / Returned</div>
                <div style="font-size: 18px; font-weight: bold; color: #b91c1c;">
                  ${cancelledRow?.count > 0 ? `${cancelledRow?.count} Canc (${CURRENCY}${parseFloat(cancelledRow?.total || 0).toFixed(2)}) ` : ''}
                  ${returnedRow?.count > 0 ? `| ${returnedRow?.count} Ret (${CURRENCY}${parseFloat(returnedRow?.total || 0).toFixed(2)})` : ''}
                </div>
              </div>
            ` : ''}
          </div>

            <thead>
              <tr>
                <th>#</th>
                <th>Order ID</th>
                <th>Branch</th>
                <th>Type</th>
                <th>Items</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTransactions.map(t => {
                let badgeClass = 'info';
                if (t.payment_method === 'Cash') badgeClass = 'success';
                else if (t.payment_method === 'Hold') badgeClass = 'warning';
                else if (['Cancelled', 'Returned'].includes(t.payment_method)) badgeClass = 'danger';
                return `
                <tr>
                  <td><strong style="color:#E31837">${t.slip_number || '-'}</strong></td>
                  <td><strong>#${t.order_id}</strong> ${t.is_edited ? '<span style="font-size:10px;color:#666">(Edited)</span>' : ''}</td>
                  <td>${t.branch || '-'}</td>
                  <td>${t.order_type || '-'}</td>
                  <td>${t.items || '-'}</td>
                  <td><strong>${CURRENCY}${parseFloat(t.amount).toFixed(2)}</strong></td>
                  <td><span class="badge ${badgeClass}">${t.payment_method === t.order_status ? t.order_status : `${t.payment_method} - ${t.order_status}`}</span></td>
                  <td>${new Date(t.created_at).toLocaleString()}</td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
          <p style="text-align: right; margin-top: 20px; font-size: 14px;"><strong>Total Records:</strong> ${filteredTransactions.length}</p>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  }

  const handleDailyClosing = () => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Confirm daily closing? Unpaid Hold orders will remain on Hold.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => toast.dismiss(t.id)}>Cancel</button>
          
          <button 
            className="btn btn-primary" 
            style={{ padding: '6px 12px', fontSize: 13, background: 'var(--red)', color: 'white' }} 
            onClick={async () => {
              toast.dismiss(t.id)
              try {
                await axios.post('/api/orders/daily-closing')
                toast.success('Daily closing complete.')
                load()
                if (isCashier) {
                  setActiveShift(null)
                  const deadline = Date.now() + 90 * 1000
                  localStorage.setItem('cashier_closing_deadline', deadline.toString())
                  window.dispatchEvent(new CustomEvent('cashier_shift_closed', { detail: { deadline } }))
                }
              } catch (err) {
                toast.error('Error: ' + err.message)
              }
            }}
          >
            Just Close
          </button>

          <button 
            className="btn btn-primary" 
            style={{ padding: '6px 12px', fontSize: 13 }} 
            onClick={async () => {
              toast.dismiss(t.id)
              try {
                await axios.post('/api/orders/daily-closing')
                toast.success('Daily closing complete!')
                
                if (from !== today() || to !== today()) {
                  setFrom(today())
                  setTo(today())
                } else {
                  load()
                }
                
                setShowTodaySummary(true)
                if (isCashier) {
                  setActiveShift(null)
                  const deadline = Date.now() + 90 * 1000
                  localStorage.setItem('cashier_closing_deadline', deadline.toString())
                  window.dispatchEvent(new CustomEvent('cashier_shift_closed', { detail: { deadline } }))
                }
              } catch (err) {
                toast.error('Error: ' + err.message)
              }
            }}
          >
            Close & View Sales
          </button>
        </div>
      </div>
    ), { duration: Infinity, id: 'confirm-daily', position: 'top-center', style: { minWidth: 320 } })
  }

  const printClosingReport = (report) => {
    const fmtTime = (ts) => ts ? formatSaudiTime(ts) : '-'
    const fmtDate = (ts) => ts ? formatSaudiDate(ts) : '-'
    const items = Array.isArray(report.items_summary) ? report.items_summary : JSON.parse(report.items_summary || '[]')
    const printWindow = window.open('', '', 'width=500,height=700')
    const html = `
      <html><head><title>${report.closing_type} Closing Report</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family: 'Courier New', monospace; padding: 10px 15px; max-width: 380px; margin: 0 auto; font-size: 13px; color: #111; }
        h2 { text-align: center; font-size: 16px; margin: 0 0 4px; }
        .center { text-align: center; }
        .divider { border-top: 1px dashed #999; margin: 10px 0; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .label { color: #555; }
        .bold { font-weight: bold; }
        .highlight { color: #c0392b; font-weight: bold; font-size: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { text-align: left; border-bottom: 1px solid #ddd; padding: 4px 0; font-size: 12px; color: #555; }
        td { padding: 4px 0; font-size: 13px; }
        td:last-child { text-align: right; }
      </style></head><body>
      <h2>${report.closing_type === 'Daily' ? '⚡ DAILY CLOSING REPORT' : '🔄 SHIFT CLOSING REPORT'}</h2>
      <p class="center" style="color:#666;font-size:12px;margin:0 0 10px">${fmtDate(report.login_time)}</p>
      <div class="divider"></div>
      <div class="row"><span class="label">Cashier:</span><span class="bold">${report.cashier_name}</span></div>
      <div class="row"><span class="label">Branch:</span><span>${report.branch}</span></div>
      <div class="row"><span class="label">Login Time:</span><span>${fmtTime(report.login_time)}</span></div>
      <div class="row"><span class="label">Logout Time:</span><span>${fmtTime(report.logout_time)}</span></div>
      <div class="row"><span class="label">Active Time:</span><span class="bold">${report.total_active_time}</span></div>
      <div class="divider"></div>
      <div class="divider"></div>
      <div class="row"><span class="label">Total Orders:</span><span class="bold">${report.total_orders}</span></div>
      <div class="row"><span class="label">Total Sales:</span><span class="highlight">${CURRENCY}${parseFloat(report.total_sales || 0).toFixed(2)}</span></div>
      <div class="row"><span class="label" style="font-size: 11px; padding-left: 10px;">↳ Cash Sales:</span><span style="font-size: 11px;">${CURRENCY}${parseFloat(report.cash_sales || 0).toFixed(2)}</span></div>
      <div class="row"><span class="label" style="font-size: 11px; padding-left: 10px;">↳ Card Sales:</span><span style="font-size: 11px;">${CURRENCY}${parseFloat(report.card_sales || 0).toFixed(2)}</span></div>
      <div class="row"><span class="label" style="font-size: 11px; padding-left: 10px;">↳ Credit Sales:</span><span style="font-size: 11px;">${CURRENCY}${parseFloat(report.credit_sales || 0).toFixed(2)}</span></div>
      <div class="row"><span class="label">Major Payments:</span><span>${CURRENCY}${parseFloat(report.major_payments || 0).toFixed(2)}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="label">Opening Drawer Cash:</span><span class="bold">${CURRENCY}${parseFloat(report.opening_cash || 0).toFixed(2)}</span></div>
      <div class="row"><span class="label">Remaining Drawer Cash:</span><span class="bold" style="color: #047857;">${CURRENCY}${parseFloat(report.closing_cash || 0).toFixed(2)}</span></div>
      <div class="divider"></div>
      <p style="font-weight:bold;margin:6px 0 4px;">Sales by Category:</p>
      <table>
        <thead><tr><th>Category</th><th style="text-align:center">Qty</th><th>Amount</th></tr></thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td>${i.category}</td>
              <td style="text-align:center">${i.qty}</td>
              <td>${CURRENCY}${parseFloat(i.amount || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="divider"></div>
      <p class="center" style="font-size:11px;color:#888;margin-top:12px">Generated: ${formatSaudiDateTime(new Date())}</p>
    </body></html>`
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300)
  }

  const handleClosingConfirm = async (shouldPrint = true) => {
    if (!closingType) return
    setClosingProcessing(true)
    setClosingProcessingType(shouldPrint ? 'close_print' : 'just_close')
    try {
      const endpoint = closingType === 'Shift' ? '/api/orders/shift-close' : '/api/orders/daily-closing'
      const res = await axios.post(endpoint, { 
        branch,
        remaining_cash: parseFloat(closingRemainingCash || 0)
      })
      toast.success(`${closingType} closing complete!`)
      setShowClosingModal(false)
      setClosingType(null)
      setClosingRemainingCash('')
      load()
      // Auto-print the report if requested
      if (shouldPrint && res.data?.report) {
        setTimeout(() => printClosingReport(res.data.report), 400)
      }

      // If Cashier, start 90-second countdown to auto-logout!
      if (isCashier) {
        setActiveShift(null)
        const deadline = Date.now() + 90 * 1000
        localStorage.setItem('cashier_closing_deadline', deadline.toString())
        window.dispatchEvent(new CustomEvent('cashier_shift_closed', { detail: { deadline } }))
      }
    } catch (err) {
      toast.error('Error: ' + (err?.response?.data?.error || err.message))
    } finally {
      setClosingProcessing(false)
      setClosingProcessingType(null)
    }
  }

  const loadClosingHistory = async (fDate, tDate) => {
    setHistoryLoading(true)
    try {
      const res = await axios.get('/api/orders/closings', { params: { from: fDate || historyFrom, to: tDate || historyTo, branch: historyFilterBranch, type: historyFilterType, user: historyFilterUser } })
      setClosingHistory(res.data)
    } catch (err) {
      toast.error('Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (showHistoryModal) {
      loadClosingHistory(historyFrom, historyTo);
    }
  }, [historyFrom, historyTo, historyFilterBranch, historyFilterType, historyFilterUser]);

  const handleDirectVoidWithReason = async () => {
    if (!cancelReason.trim()) return toast.error('Please provide a reason')
    setProcessingCancel(true)
    try {
      const formattedReason = `[${cancelOrderTarget.type.toUpperCase()}] ${cancelReason}`
      const isOrderTaker = user?.role?.trim().toLowerCase() === 'order taker'
      const isAdmin = user?.role?.trim().toLowerCase() === 'admin' || user?.role?.trim().toLowerCase() === 'developer'
      
      let shouldDirectVoid = false;
      if (isAdmin) {
        shouldDirectVoid = true;
      } else if (!isOrderTaker) {
        // Cashier
        if (cancelOrderTarget.orderStatus === 'Completed') {
          shouldDirectVoid = false; // Cashiers cannot directly void completed orders
        } else {
          shouldDirectVoid = true;
        }
      }

      if (shouldDirectVoid) {
        await axios.patch(`/api/orders/${cancelOrderTarget.id}/void`, { type: cancelOrderTarget.type, reason: formattedReason })
        toast.success(`Order marked as ${cancelOrderTarget.type}.`)
      } else {
        await axios.patch(`/api/orders/${cancelOrderTarget.id}/request-cancel`, { reason: formattedReason })
        toast.success('Cancel request sent to Admin')
      }
      setShowCancelModal(false)
      setCancelReason('')
      setCancelOrderTarget(null)
      load()
    } catch (err) {
      toast.error('Failed to update order: ' + (err?.response?.data?.error || err.message))
    } finally {
      setProcessingCancel(false)
    }
  }

  const onVoidButtonClick = (orderId, type, orderStatus) => {
    setCancelOrderTarget({ id: orderId, type, orderStatus })
    setShowCancelModal(true)
  }

  const viewOrderDetail = async (orderId) => {
    try {
      const res = await axios.get(`/api/orders/${orderId}`)
      setSelectedOrder(res.data)
      setShowOrderDetails(true)
    } catch (err) {
      toast.error('Error fetching order details')
      console.error(err)
    }
  }

  const uniquePlacedBy = ['All', ...new Set(transactions.map(t => t.order_taker).filter(Boolean))];
  const uniqueCompletedBy = ['All', ...new Set(transactions.map(t => t.completed_by).filter(Boolean))];
  const uniqueBranch = ['All', ...new Set(transactions.map(t => t.branch).filter(Boolean))];
  const uniqueType = ['All', ...new Set(transactions.map(t => t.order_type).filter(Boolean))];

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = search ? t.order_id.toString().includes(search.trim()) : true;
    let matchesStatus = true;
    if (statusFilter === 'Credit') {
      matchesStatus = t.payment_method === 'Credit';
    } else if (statusFilter !== 'All') {
      matchesStatus = t.order_status === statusFilter;
    }
    
    const matchesPlacedBy = tableFilters.placedBy === 'All' || t.order_taker === tableFilters.placedBy;
    const matchesCompletedBy = tableFilters.completedBy === 'All' || t.completed_by === tableFilters.completedBy;
    const matchesBranch = tableFilters.branch === 'All' || t.branch === tableFilters.branch;
    const matchesType = tableFilters.type === 'All' || t.order_type === tableFilters.type;

    return matchesSearch && matchesStatus && matchesPlacedBy && matchesCompletedBy && matchesBranch && matchesType;
  })

  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const totalPages = Math.ceil(filteredTransactions.length / pageSize)

  const paginatedModalTransactions = filteredTransactions.slice(
    (modalPage - 1) * pageSize,
    modalPage * pageSize
  )

  const totalModalPages = Math.ceil(filteredTransactions.length / pageSize)

  return (
    <>
      {isTodaySales && isCashier && activeShift && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.08) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 10,
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#10b981',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 16
            }}>
              ✓
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#065f46' }}>
                <span style={{ textTransform: 'capitalize' }}>{activeShift?.cashier_name || user?.username || 'Cashier'}</span>'s Active Shift is Open
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                Cashier: <strong style={{ textTransform: 'capitalize' }}>{activeShift?.cashier_name || user?.username}</strong> • Shift Started: <strong>{formatSaudiDateTime(activeShift.start_time)}</strong> (KSA) • Opening Cash: <strong>{CURRENCY}{parseFloat(activeShift.opening_cash || 0).toFixed(2)}</strong>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: '#fff',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              color: '#065f46',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              🟢 Live Active Shift
            </span>
          </div>
        </div>
      )}
      
      <div className="summary-tiles">
        {tiles.map(t => {
          const valString = String(t.val);
          const hasCurrency = valString.includes(CURRENCY);
          const amount = hasCurrency ? valString.replace(CURRENCY, '') : valString;

          return (
            <div key={t.label} className="summary-tile">
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start', gap: 4 }}>
                <p style={{ fontSize: 13, margin: 0, fontWeight: 700, color: 'var(--text-secondary)' }}>{t.label}</p>
                <div className="tile-icon" style={{ background: t.bg, color: t.color }}>
                  {t.icon}
                </div>
              </div>
              <div style={{ marginTop: 2 }}>
                <h4 style={{ color: t.color, fontSize: 18, margin: 0, fontWeight: 800 }}>
                  {loading ? '...' : (
                    <>
                      {hasCurrency && <span style={{ fontSize: 11, marginRight: 4, fontWeight: 600 }}>{CURRENCY}</span>}
                      {amount}
                    </>
                  )}
                </h4>
                {t.sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0 0', lineHeight: 1.2 }}>{t.sub}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {creditSummary.majorPayments && creditSummary.majorPayments.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 24, background: '#f8fafc' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--surface-2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)' }}>
              <Banknote size={20} /> Major Payments Received Today
            </h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer Name</th>
                  <th>Cashier</th>
                  <th>Payment Method</th>
                  <th>Date & Time</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {creditSummary.majorPayments.map((p, index) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 800 }}>{index + 1}</td>
                    <td style={{ fontWeight: 600 }}>{p.customer_name}</td>
                    <td>{p.cashier_name || '-'}</td>
                    <td>{p.payment_method || 'Cash'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatSaudiDateTime(p.created_at)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>{CURRENCY}{parseFloat(p.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="card" style={{ padding: 0, marginBottom: 160, background: '#f8fafc' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <ClipboardList size={18} /> Transactions ({filteredTransactions.length})
                </h3>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{ padding: '4px 8px', border: '1px solid var(--surface-2)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', maxWidth: '140px' }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="Hold">Hold / Pending</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Returned">Returned</option>
                  <option value="Credit">Credit</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, flex: 1, justifyContent: 'flex-end' }}>
                {!isTodaySales && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <label style={{ fontSize: '12px', margin: 0, fontWeight: 600 }}>From:</label>
                          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '4px 4px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--surface-2)', background: 'var(--surface)', minWidth: '95px' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <label style={{ fontSize: '12px', margin: 0, fontWeight: 600 }}>To:</label>
                          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '4px 4px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--surface-2)', background: 'var(--surface)', minWidth: '95px' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
                        <button className="btn" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: '12px', background: 'var(--surface)', border: '1px solid var(--surface-2)', color: 'var(--text-primary)', borderRadius: '6px' }}>
                          <Search size={14} /> Filter
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => { setFrom(today()); setTo(today()); }}
                          style={{ 
                            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: '12px',
                            background: (from === today() && to === today()) ? 'linear-gradient(135deg, #E31837, #FF6B35)' : '',
                            color: (from === today() && to === today()) ? 'white' : ''
                          }}
                        >
                          Today
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => { setFrom(yesterday()); setTo(yesterday()); }}
                          style={{ 
                            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: '12px',
                            background: (from === yesterday() && to === yesterday()) ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '',
                            color: (from === yesterday() && to === yesterday()) ? 'white' : ''
                          }}
                        >
                          Yesterday
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <input 
                type="text" 
                placeholder="Search Order ID..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                className="pos-search-input"
                style={{ padding: '6px 12px', border: '1px solid var(--surface-2)', borderRadius: 6, fontSize: 14, flex: 1, minWidth: '120px' }}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={load}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', fontSize: 13 }}
                  title="Refresh Data"
                >
                  <RefreshCw size={14} className={loading ? 'spin' : ''} /> <span className="hide-mobile">Refresh</span>
                </button>
                <button className="btn btn-secondary btn-sm" onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', fontSize: 13 }} title="Export PDF">
                  <Printer size={14} /> <span className="hide-mobile">PDF</span>
                </button>
                <button className="btn btn-secondary btn-sm" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', fontSize: 13 }} title="Export Excel">
                  <BarChart3 size={14} /> <span className="hide-mobile">Excel</span>
                </button>
              </div>
            </div>

          </div>
          {(isAdminOrDev || isManagement) && (
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', background: 'var(--surface-2)', borderRadius: 8, padding: 4, alignItems: 'center', gap: 4, marginTop: 8 }}>
              {['All', 'Branch 1', 'Branch 2', 'Branch 3'].map(b => (
                <button
                  key={b}
                  onClick={() => setBranch(b)}
                  style={{
                    flex: '1 1 auto', padding: '8px 12px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 6,
                    background: branch === b ? 'var(--surface)' : 'transparent',
                    color: branch === b ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: branch === b ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', textAlign: 'center',
                    minWidth: '60px'
                  }}
                >
                  <span className="hide-mobile">{b}</span>
                  <span className="show-mobile">{b.startsWith('Branch') ? `B${b.split(' ')[1]}` : b}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: (isAdminOrDev || isManagement) ? 4 : 0 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {isTodaySales && isCashier ? (activeShift ? `Shift started: ${formatSaudiTime(activeShift.start_time)} (KSA)` : 'Active Shift') : `${from} → ${to}`}
            </span>
            {(tableFilters.placedBy !== 'All' || tableFilters.completedBy !== 'All' || tableFilters.branch !== 'All' || tableFilters.type !== 'All' || statusFilter !== 'All' || search !== '') && (
              <button 
                className="btn btn-sm btn-secondary" 
                onClick={() => {
                  setTableFilters({ placedBy: 'All', completedBy: 'All', branch: 'All', type: 'All' })
                  setStatusFilter('All')
                  setSearch('')
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px' }}
              >
                <X size={14} /> Clear Filters
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ whiteSpace: 'nowrap' }}>#</th>
                <th style={{ whiteSpace: 'nowrap' }}>Order ID</th>
                <th style={{ whiteSpace: 'nowrap' }}>Txn ID</th>
                <th style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Placed By</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Filter size={14} style={{ cursor: 'pointer', color: tableFilters.placedBy !== 'All' ? 'var(--primary)' : 'inherit' }} />
                      <select 
                        value={tableFilters.placedBy} 
                        onChange={e => setTableFilters({ ...tableFilters, placedBy: e.target.value })}
                        style={{ position: 'absolute', opacity: 0, top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                      >
                        {uniquePlacedBy.map(val => <option key={val} value={val}>{val}</option>)}
                      </select>
                    </div>
                  </div>
                  {tableFilters.placedBy !== 'All' && (
                    <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '2px' }}>
                      {tableFilters.placedBy}
                    </div>
                  )}
                </th>
                <th style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Completed By</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Filter size={14} style={{ cursor: 'pointer', color: tableFilters.completedBy !== 'All' ? 'var(--primary)' : 'inherit' }} />
                      <select 
                        value={tableFilters.completedBy} 
                        onChange={e => setTableFilters({ ...tableFilters, completedBy: e.target.value })}
                        style={{ position: 'absolute', opacity: 0, top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                      >
                        {uniqueCompletedBy.map(val => <option key={val} value={val}>{val}</option>)}
                      </select>
                    </div>
                  </div>
                  {tableFilters.completedBy !== 'All' && (
                    <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '2px' }}>
                      {tableFilters.completedBy}
                    </div>
                  )}
                </th>
                <th style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Branch</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Filter size={14} style={{ cursor: 'pointer', color: tableFilters.branch !== 'All' ? 'var(--primary)' : 'inherit' }} />
                      <select 
                        value={tableFilters.branch} 
                        onChange={e => setTableFilters({ ...tableFilters, branch: e.target.value })}
                        style={{ position: 'absolute', opacity: 0, top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                      >
                        {uniqueBranch.map(val => <option key={val} value={val}>{val}</option>)}
                      </select>
                    </div>
                  </div>
                  {tableFilters.branch !== 'All' && (
                    <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '2px' }}>
                      {tableFilters.branch}
                    </div>
                  )}
                </th>
                <th style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Type</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Filter size={14} style={{ cursor: 'pointer', color: tableFilters.type !== 'All' ? 'var(--primary)' : 'inherit' }} />
                      <select 
                        value={tableFilters.type} 
                        onChange={e => setTableFilters({ ...tableFilters, type: e.target.value })}
                        style={{ position: 'absolute', opacity: 0, top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                      >
                        {uniqueType.map(val => <option key={val} value={val}>{val}</option>)}
                      </select>
                    </div>
                  </div>
                  {tableFilters.type !== 'All' && (
                    <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '2px' }}>
                      {tableFilters.type}
                    </div>
                  )}
                </th>
                <th style={{ whiteSpace: 'nowrap' }}>Items</th>
                <th style={{ whiteSpace: 'nowrap' }}>Amount</th>
                <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ whiteSpace: 'nowrap' }}>Date & Time</th>
                <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 18, width: '80%', borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                : paginatedTransactions.map((t, index) => (
                    <tr key={t.id} onClick={() => viewOrderDetail(t.order_id)} style={{ cursor: 'pointer' }} className="hover-row">
                      <td style={{ fontWeight: 800, color: 'var(--red)' }}>{(currentPage - 1) * pageSize + index + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="badge badge-info" style={{ fontWeight: 800 }}>Order #{t.order_id} / {t.slip_number}</span>
                          {t.is_edited && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>Edited</span>}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>#{t.id}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.order_taker || '-'}</div>
                        {t.order_placed_at && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatSaudiTime(t.order_placed_at)}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.completed_by || '-'}</div>
                        {t.completed_at && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatSaudiTime(t.completed_at)}</div>}
                      </td>
                      <td>{t.branch || '-'}</td>
                      <td>{t.order_type || '-'}</td>
                      <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.items}>
                        {t.items || '-'}
                      </td>
                      <td style={{ fontWeight: 700, color: ['Cancelled', 'Returned'].includes(t.order_status) ? 'var(--text-muted)' : 'var(--red)', textDecoration: ['Cancelled', 'Returned'].includes(t.order_status) ? 'line-through' : 'none' }}>{CURRENCY}{parseFloat(t.amount).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${t.order_status === 'Hold' ? 'badge-warning' : (['Cancelled', 'Returned'].includes(t.order_status) ? 'badge-danger' : 'badge-success')}`}>
                          {t.payment_method === t.order_status ? t.order_status : `${t.payment_method} - ${t.order_status}`}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {formatSaudiDateTime(t.created_at)}
                      </td>
                      <td>
                        {(!['Cancelled', 'Returned'].includes(t.order_status)) && (
                          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                            <button 
                              className="btn btn-sm" 
                              style={{ padding: '4px 8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: 4, cursor: isManagement ? 'not-allowed' : 'pointer', opacity: isManagement ? 0.6 : 1 }}
                              onClick={() => { if (!isManagement) onVoidButtonClick(t.order_id, 'Cancelled', t.order_status) }}
                              disabled={isManagement}
                              title="Cancel Order"
                            >
                              <Ban size={14} /> Cancel
                            </button>
                            <button 
                              className="btn btn-sm" 
                              style={{ padding: '4px 8px', background: 'rgba(217, 119, 6, 0.1)', color: '#d97706', border: '1px solid rgba(217, 119, 6, 0.2)', display: 'flex', alignItems: 'center', gap: 4, cursor: isManagement ? 'not-allowed' : 'pointer', opacity: isManagement ? 0.6 : 1 }}
                              onClick={() => { if (!isManagement) onVoidButtonClick(t.order_id, 'Returned', t.order_status) }}
                              disabled={isManagement}
                              title="Return Order"
                            >
                              <Undo2 size={14} /> Return
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
              }
              {!loading && filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    {transactions.length === 0 ? 'No transactions found for selected date range.' : 'No order ID matches your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 24px', borderTop: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredTransactions.length)} of {filteredTransactions.length}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                Previous
              </button>
              <span style={{ padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
                {currentPage} / {totalPages}
              </span>
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Closing FAB Buttons */}
      <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          className="btn btn-secondary btn-lg"
          onClick={() => { setShowHistoryModal(true); loadClosingHistory(historyFrom, historyTo); }}
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)', gap: 8, display: 'flex', alignItems: 'center', fontSize: 14 }}
          title="View Past Closing Reports"
        >
          <History size={18} /> Past Reports
        </button>
        {!isManagement && (
          <button
            className="btn btn-danger btn-lg"
            onClick={() => setShowClosingModal(true)}
            style={{ boxShadow: '0 8px 24px rgba(239,68,68,0.4)', gap: 10, display: 'flex', alignItems: 'center' }}
          >
            <Lock size={18} /> Closing
          </button>
        )}
      </div>

      {/* Today's Summary Modal */}
      {showTodaySummary && (
        <div className="modal-overlay" style={{ background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'none' }} onClick={(e) => { if (e.target === e.currentTarget) { setShowTodaySummary(false); setShowDetailsInModal(false); } }}>
          <div className="modal-content" style={{ 
            width: showDetailsInModal ? 800 : 600, 
            maxWidth: '95vw', 
            padding: 24, 
            transition: 'width 0.2s',
            background: 'white',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                {showDetailsInModal ? <><ClipboardList size={24} /> Today's Detailed Sales</> : <><BarChart3 size={24} /> Today's Sales Summary</>}
              </h2>
              <button 
                onClick={() => { setShowTodaySummary(false); setShowDetailsInModal(false); }}
                style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' }}
              >×</button>
            </div>
            
            {!showDetailsInModal ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>Net Revenue</p>
                  <h3 style={{ margin: '4px 0 0 0', color: 'var(--red)', fontSize: 20 }}>{CURRENCY}{totalSales.toFixed(2)}</h3>
                </div>
                <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>Total Orders</p>
                  <h3 style={{ margin: '4px 0 0 0', fontSize: 20 }}>{totalCount}</h3>
                </div>
                <div style={{ background: '#ecfdf5', padding: 16, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: '#047857' }}>Cash Collected</p>
                  <h3 style={{ margin: '4px 0 0 0', color: '#047857', fontSize: 20 }}>{CURRENCY}{(parseFloat(cashRow?.total || 0)).toFixed(2)}</h3>
                </div>
                <div style={{ background: '#eff6ff', padding: 16, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: '#1d4ed8' }}>Card Collected</p>
                  <h3 style={{ margin: '4px 0 0 0', color: '#1d4ed8', fontSize: 20 }}>{CURRENCY}{(parseFloat(cardRow?.total || 0)).toFixed(2)}</h3>
                </div>
                {holdRow && parseInt(holdRow.count || 0) > 0 && (
                  <div style={{ background: '#fef3c7', padding: 16, borderRadius: 8 }}>
                    <p style={{ margin: 0, color: '#b45309' }}>Held Payments</p>
                    <h3 style={{ margin: '4px 0 0 0', color: '#b45309', fontSize: 20 }}>{CURRENCY}{(parseFloat(holdRow?.total || 0)).toFixed(2)}</h3>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ maxHeight: '60vh', overflowY: 'auto', marginBottom: 20, border: '1px solid #ddd', borderRadius: 8, background: '#fff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f8f9fa', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                    <tr>
                      <th style={{ padding: '10px 12px' }}>#</th>
                      <th style={{ padding: '10px 12px' }}>Order ID</th>
                      <th style={{ padding: '10px 12px' }}>Type</th>
                      <th style={{ padding: '10px 12px' }}>Items</th>
                      <th style={{ padding: '10px 12px' }}>Amount</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedModalTransactions.map((t, index) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--red)' }}>{(modalPage - 1) * pageSize + index + 1}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                          Order #{t.order_id} / {t.slip_number}
                          {t.is_edited && <span style={{ fontSize: 10, color: '#999', marginLeft: 6 }}>(Edit)</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{t.order_type || '-'}</td>
                        <td style={{ padding: '10px 12px', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.items}>
                          {t.items || '-'}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{CURRENCY}{parseFloat(t.amount).toFixed(2)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className={`badge ${t.order_status === 'Hold' ? 'badge-warning' : (['Cancelled', 'Returned'].includes(t.order_status) ? 'badge-danger' : 'badge-success')}`}>
                            {t.payment_method === t.order_status ? t.order_status : `${t.payment_method} - ${t.order_status}`}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#666' }}>{formatSaudiTime(t.created_at)}</td>
                      </tr>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No sales found for today.</td></tr>
                    )}
                  </tbody>
                </table>

                {/* Modal Pagination */}
                {totalModalPages > 1 && (
                  <div style={{ padding: '12px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8f9fa' }}>
                    <span style={{ fontSize: 11, color: '#666' }}>
                      Page {modalPage} of {totalModalPages}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        disabled={modalPage === 1}
                        onClick={() => setModalPage(p => p - 1)}
                      >
                        Previous
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        disabled={modalPage === totalModalPages}
                        onClick={() => setModalPage(p => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {!showDetailsInModal ? (
                <button className="btn btn-secondary" onClick={() => setShowDetailsInModal(true)}>📋 View Detail</button>
              ) : (
                <button className="btn btn-secondary" onClick={() => setShowDetailsInModal(false)}>⬅ Back to Summary</button>
              )}
              <div style={{ flex: 1 }}></div>
              <button className="btn btn-secondary" onClick={exportPDF}>🖨️ Print Detailed PDF</button>
              <button className="btn btn-secondary" onClick={exportExcel}>📊 Download Excel</button>
              <button className="btn btn-primary" onClick={() => { setShowTodaySummary(false); setShowDetailsInModal(false); }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {showOrderDetails && (
        <OrderDetailModal 
          order={selectedOrder} 
          onClose={() => { setShowOrderDetails(false); setSelectedOrder(null); }} 
        />
      )}

      {/* ── CLOSING MODAL ── */}
      {showClosingModal && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) { setShowClosingModal(false); setClosingType(null); } }}>
          <div className="modal" style={{ maxWidth: 650, width: '95vw', padding: '20px 24px', maxHeight: '92vh', overflow: 'hidden' }}>
            <div className="modal-header" style={{ marginBottom: 14 }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 17 }}>
                  <Lock size={18} color="var(--primary)" /> Shift & Daily Closing
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Select closing type. <b>Hold orders</b> remain safe & unaffected.
                </span>
              </div>
              <button className="modal-close" onClick={() => { setShowClosingModal(false); setClosingType(null); }}>✕</button>
            </div>

            {/* 2-Column Grid Body */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 14, marginBottom: 16 }}>
              {/* Left Column: Pending Orders + Shift Stats (Start time, Current time, Total Orders, Total Sales) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 1. Pending Orders Card */}
                <div style={{
                  background: closingPendingInfo.totalPending > 0 ? '#fffbeb' : '#f8fafc',
                  border: `1.5px solid ${closingPendingInfo.totalPending > 0 ? '#fde68a' : '#e2e8f0'}`,
                  borderRadius: 10,
                  padding: '10px 12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15 }}>{closingPendingInfo.totalPending > 0 ? '⏳' : '✅'}</span>
                      <strong style={{ fontSize: 12, color: closingPendingInfo.totalPending > 0 ? '#92400e' : '#334155' }}>
                        Pending / Hold Orders
                      </strong>
                    </div>
                    <span style={{
                      background: closingPendingInfo.totalPending > 0 ? '#f59e0b' : '#10b981',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 8
                    }}>
                      {closingPendingInfo.loading ? '...' : `${closingPendingInfo.totalPending} Orders`}
                    </span>
                  </div>


                  {/* 3 Breakdown Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 6, padding: '5px 2px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>🛍️ Takeaway</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginTop: 1 }}>
                        {closingPendingInfo.loading ? '...' : closingPendingInfo.takeaway}
                      </div>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 6, padding: '5px 2px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>🛵 Delivery</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginTop: 1 }}>
                        {closingPendingInfo.loading ? '...' : closingPendingInfo.delivery}
                      </div>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 6, padding: '5px 2px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>🍽️ Dine-In</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginTop: 1 }}>
                        {closingPendingInfo.loading ? '...' : closingPendingInfo.dineIn}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Shift Stats Card (Start Time, Current Time, Total Orders, Total Sales) */}
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '10px 12px'
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={13} color="var(--primary)" /> Shift Summary (موجودہ شفٹ)
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {/* Shift Start Time */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>🕒 Start Time</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginTop: 1 }}>
                        {activeShift?.start_time ? formatSaudiTime(activeShift.start_time) : '-'} <span style={{ fontSize: 9, color: '#94a3b8' }}>KSA</span>
                      </div>
                    </div>

                    {/* Current Time */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>⏰ Current Time</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)', marginTop: 1 }}>
                        {formatSaudiTime(new Date())} <span style={{ fontSize: 9, color: '#94a3b8' }}>KSA</span>
                      </div>
                    </div>

                    {/* Total Orders Punched */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>🧾 Total Orders</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginTop: 1 }}>
                        {totalCount} <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>orders</span>
                      </div>
                    </div>

                    {/* Total Sales */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>💰 Total Sales</div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: '#047857', marginTop: 1 }}>
                        {CURRENCY}{totalSales.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Closing Type Selection & Remaining Cash */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Select Closing Type
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {/* Shift Close */}
                    <div
                      onClick={() => setClosingType('Shift')}
                      style={{
                        border: closingType === 'Shift' ? '2px solid var(--primary)' : '1.5px solid var(--surface-2)',
                        borderRadius: 10,
                        padding: '10px 8px',
                        cursor: 'pointer',
                        background: closingType === 'Shift' ? 'rgba(227,24,55,0.06)' : 'white',
                        textAlign: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 2 }}>🔄</div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: closingType === 'Shift' ? 'var(--primary)' : 'var(--text-primary)' }}>
                        Shift Close
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        (X-Report)
                      </div>
                    </div>

                    {/* Daily Close */}
                    <div
                      onClick={() => setClosingType('Daily')}
                      style={{
                        border: closingType === 'Daily' ? '2px solid #7c3aed' : '1.5px solid var(--surface-2)',
                        borderRadius: 10,
                        padding: '10px 8px',
                        cursor: 'pointer',
                        background: closingType === 'Daily' ? 'rgba(124,58,237,0.06)' : 'white',
                        textAlign: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 2 }}>⚡</div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: closingType === 'Daily' ? '#7c3aed' : 'var(--text-primary)' }}>
                        Daily Close
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        (Z-Report)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Remaining Cash in Drawer input */}
                <div style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--surface-2)',
                  borderRadius: 8,
                  padding: '9px 10px'
                }}>
                  <label style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 4
                  }}>
                    Remaining Cash in Drawer (دراز میں رقم) ({CURRENCY})
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      fontSize: 12
                    }}>
                      {CURRENCY}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={closingRemainingCash}
                      onChange={e => setClosingRemainingCash(e.target.value)}
                      placeholder="0.00 (Optional)"
                      style={{
                        width: '100%',
                        padding: '6px 8px 6px 38px',
                        borderRadius: 6,
                        border: '1.5px solid var(--surface-2)',
                        background: '#ffffff',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {closingType && (
                  <div style={{
                    background: closingType === 'Daily' ? '#faf5ff' : '#fff1f2',
                    border: `1px solid ${closingType === 'Daily' ? '#ddd6fe' : '#fca5a5'}`,
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 10,
                    color: closingType === 'Daily' ? '#6b21a8' : '#991b1b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  }}>
                    <span>⚠️</span>
                    <span>Completed orders will be cleared & archived.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Buttons Row - Compact, Centered text, Site-matched dark & brand palette */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#1e293b'; }}
                onMouseOut={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#475569'; }}
                onClick={() => { setShowClosingModal(false); setClosingType(null); }}
                disabled={closingProcessing}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: '1px solid #0f172a',
                  background: '#1e293b',
                  color: '#ffffff',
                  cursor: !closingType || closingProcessing ? 'not-allowed' : 'pointer',
                  opacity: !closingType ? 0.45 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={e => { if (closingType && !closingProcessing) e.currentTarget.style.background = '#0f172a'; }}
                onMouseOut={e => { if (closingType && !closingProcessing) e.currentTarget.style.background = '#1e293b'; }}
                onClick={() => handleClosingConfirm(false)}
                disabled={!closingType || closingProcessing}
              >
                {closingProcessing && closingProcessingType === 'just_close' ? 'Processing...' : 'Just Close'}
              </button>
              <button
                type="button"
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: '1px solid #0a2428',
                  background: '#103C43',
                  color: '#ffffff',
                  cursor: !closingType || closingProcessing ? 'not-allowed' : 'pointer',
                  opacity: !closingType ? 0.45 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  gap: 6,
                  boxShadow: closingType ? '0 2px 8px rgba(16, 60, 67, 0.25)' : 'none',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={e => { if (closingType && !closingProcessing) e.currentTarget.style.background = '#0a2428'; }}
                onMouseOut={e => { if (closingType && !closingProcessing) e.currentTarget.style.background = '#103C43'; }}
                onClick={() => handleClosingConfirm(true)}
                disabled={!closingType || closingProcessing}
              >
                <Printer size={13} color="#F4B400" />
                <span>{closingProcessing && closingProcessingType === 'close_print' ? 'Processing...' : 'Close & Print Report'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY MODAL ── */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) { setShowHistoryModal(false); setSelectedHistoryReport(null); } }}>
          <div className="modal" style={{ maxWidth: 720, width: '95vw', padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ marginBottom: 16 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><History size={20} /> Past Closing Reports</h3>
              <button className="modal-close" onClick={() => { setShowHistoryModal(false); setSelectedHistoryReport(null); }}>✕</button>
            </div>

            {/* Date filter & Toggle */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => { setHistoryFrom(today()); setHistoryTo(today()); }}
              >
                Today
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>From:</span>
                <input
                  type="date"
                  value={historyFrom}
                  onChange={e => setHistoryFrom(e.target.value)}
                  className="filter-input"
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>To:</span>
                <input
                  type="date"
                  value={historyTo}
                  onChange={e => setHistoryTo(e.target.value)}
                  className="filter-input"
                  style={{ flex: 1 }}
                />
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowHistoryFilters(!showHistoryFilters)}>
                {showHistoryFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
            </div>

            {/* Expandable Filters */}
            {showHistoryFilters && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, background: '#f8f9fa', padding: 12, borderRadius: 8, border: '1px solid var(--surface-2)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Branch</label>
                  <select className="filter-input" style={{ width: '100%' }} value={historyFilterBranch} onChange={e => setHistoryFilterBranch(e.target.value)}>
                    {['All', ...new Set(closingHistory.map(c => c.branch))].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Closing Type</label>
                  <select className="filter-input" style={{ width: '100%' }} value={historyFilterType} onChange={e => setHistoryFilterType(e.target.value)}>
                    <option value="All">All Types</option>
                    <option value="Shift">Shift</option>
                    <option value="Daily">Daily</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Cashier</label>
                  <select className="filter-input" style={{ width: '100%' }} value={historyFilterUser} onChange={e => setHistoryFilterUser(e.target.value)}>
                    {['All', ...new Set(closingHistory.map(c => c.cashier_name))].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
            ) : selectedHistoryReport ? (
              /* ── Detail View: Exact 100% Email Report Layout ── */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedHistoryReport(null)}>
                    ← Back to List
                  </button>
                  <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => printClosingReport(selectedHistoryReport)}>
                    <Printer size={15} /> Reprint Report
                  </button>
                </div>

                {/* Email-identical Report Card */}
                <div style={{
                  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                  width: '100%',
                  maxWidth: 620,
                  margin: '0 auto',
                  border: '1px solid #eaeaea',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#fafafa',
                  boxSizing: 'border-box',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.06)'
                }}>
                  {/* Red/Brand Header Banner */}
                  <div style={{ backgroundColor: '#E31837', padding: 20, borderBottom: '1px solid #eaeaea', textAlign: 'center', color: 'white' }}>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{selectedHistoryReport.closing_type} Closing Report</h2>
                    <p style={{ margin: '5px 0 0 0', fontSize: 14, opacity: 0.9 }}>{selectedHistoryReport.branch}</p>
                  </div>

                  <div style={{ padding: 24 }}>
                    {/* Summary Card */}
                    <div style={{ background: 'white', padding: 15, borderRadius: 8, border: '1px solid #eaeaea', marginBottom: 20 }}>
                      <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Cashier:</strong> {selectedHistoryReport.cashier_name}</p>
                      <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Total Orders:</strong> {selectedHistoryReport.total_orders}</p>
                      <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Total Sales:</strong> SAR {parseFloat(selectedHistoryReport.total_sales || 0).toFixed(2)}</p>
                      <p style={{ margin: '4px 0', paddingLeft: 10, fontSize: 13, color: '#555' }}>↳ Cash Sales: SAR {parseFloat(selectedHistoryReport.cash_sales || 0).toFixed(2)}</p>
                      <p style={{ margin: '4px 0', paddingLeft: 10, fontSize: 13, color: '#555' }}>↳ Card Sales: SAR {parseFloat(selectedHistoryReport.card_sales || 0).toFixed(2)}</p>
                      <p style={{ margin: '4px 0', paddingLeft: 10, fontSize: 13, color: '#555' }}>↳ Credit Sales: SAR {parseFloat(selectedHistoryReport.credit_sales || 0).toFixed(2)}</p>
                      <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Major Payments Received:</strong> SAR {parseFloat(selectedHistoryReport.major_payments || 0).toFixed(2)}</p>
                      <p style={{ margin: '4px 0', fontSize: 14, color: '#047857' }}><strong>Opening Drawer Cash:</strong> SAR {parseFloat(selectedHistoryReport.opening_cash || 0).toFixed(2)}</p>
                      <p style={{ margin: '4px 0', fontSize: 14, color: '#047857' }}><strong>Remaining Drawer Cash:</strong> SAR {parseFloat(selectedHistoryReport.closing_cash || 0).toFixed(2)}</p>
                      <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Active Time:</strong> {selectedHistoryReport.total_active_time}</p>
                      <p style={{ margin: '4px 0', fontSize: 12, color: '#777' }}>
                        {formatSaudiDateTime(selectedHistoryReport.login_time)} - {formatSaudiDateTime(selectedHistoryReport.logout_time)} (KSA)
                      </p>
                    </div>

                    {/* Items Sold by Category */}
                    <h3 style={{ marginTop: 24, borderBottom: '2px solid #eaeaea', paddingBottom: 8, color: '#333', fontSize: 16 }}>Items Sold by Category</h3>
                    {(() => {
                      let items = [];
                      try {
                        items = Array.isArray(selectedHistoryReport.items_summary) 
                          ? selectedHistoryReport.items_summary 
                          : JSON.parse(selectedHistoryReport.items_summary || '[]');
                      } catch(e) { items = []; }

                      if (!items || items.length === 0) {
                        return <p style={{ textAlign: 'center', color: '#999', padding: 20 }}>No items sold</p>;
                      }

                      return items.map((cat, idx) => (
                        <div key={idx} style={{ marginBottom: 20, background: '#fff', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{ background: '#f8f9fa', fontWeight: 'bold', fontSize: 15, color: '#111', padding: '10px 15px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{cat.category}</span>
                            <span style={{ color: '#E31837', fontSize: 14 }}>
                              SAR {parseFloat(cat.amount || 0).toFixed(2)} ({cat.qty} items)
                            </span>
                          </div>
                          <div style={{ padding: '0 10px', overflowX: 'auto' }}>
                            <table style={{ width: '100%', minWidth: 250, borderCollapse: 'collapse', margin: '10px 0', fontSize: 13, color: '#555', tableLayout: 'fixed', wordWrap: 'break-word' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
                                  <th style={{ padding: '8px 4px', width: '40%' }}>Item</th>
                                  <th style={{ padding: '8px 4px', textAlign: 'center', width: '15%' }}>Qty</th>
                                  <th style={{ padding: '8px 4px', textAlign: 'right', width: '22%' }}>Price</th>
                                  <th style={{ padding: '8px 4px', textAlign: 'right', width: '23%' }}>Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cat.items && Array.isArray(cat.items) && cat.items.map((it, itemIdx) => {
                                  const unitPrice = parseFloat(it.amount / (it.qty || 1)).toFixed(2);
                                  const totalPrice = parseFloat(it.amount || 0).toFixed(2);
                                  return (
                                    <tr key={itemIdx} style={{ borderBottom: '1px dashed #f0f0f0' }}>
                                      <td style={{ padding: '6px 4px' }}>{it.name}</td>
                                      <td style={{ padding: '6px 4px', textAlign: 'center' }}><strong>{it.qty}</strong></td>
                                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>SAR {unitPrice}</td>
                                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>SAR {totalPrice}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ));
                    })()}

                    {/* Top Items by 2-Hour Intervals */}
                    {(() => {
                      let intervalsObj = {};
                      try {
                        intervalsObj = typeof selectedHistoryReport.interval_items === 'string'
                          ? JSON.parse(selectedHistoryReport.interval_items || '{}')
                          : (selectedHistoryReport.interval_items || {});
                      } catch(e) { intervalsObj = {}; }

                      if (intervalsObj && Object.keys(intervalsObj).length > 0) {
                        const loginDate = new Date(selectedHistoryReport.login_time);
                        let maxIndex = 0;
                        for (const key of Object.keys(intervalsObj)) {
                          if (parseInt(key) > maxIndex) maxIndex = parseInt(key);
                        }

                        const intervalRows = [];
                        for (let i = 0; i <= maxIndex; i++) {
                          const blockStartTime = new Date(loginDate.getTime() + i * 2 * 3600000);
                          const blockEndTime = new Date(loginDate.getTime() + (i + 1) * 2 * 3600000);
                          const startTimeStr = blockStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const endTimeStr = blockEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const itemsInBlock = intervalsObj[i] || [];

                          intervalRows.push({
                            timeWindow: `${startTimeStr} - ${endTimeStr}`,
                            items: itemsInBlock
                          });
                        }

                        return (
                          <>
                            <h3 style={{ marginTop: 30, borderBottom: '2px solid #eaeaea', paddingBottom: 8, color: '#333', fontSize: 16 }}>
                              Top Items by 2-Hour Intervals
                            </h3>
                            <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, overflowX: 'auto', marginBottom: 20 }}>
                              <table style={{ width: '100%', minWidth: 250, borderCollapse: 'collapse', fontSize: 13, color: '#555', tableLayout: 'fixed', wordWrap: 'break-word' }}>
                                <thead>
                                  <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #eee', textAlign: 'left', color: '#111' }}>
                                    <th style={{ padding: '10px 8px', width: '35%' }}>Time</th>
                                    <th style={{ padding: '10px 8px', width: '65%' }}>Top Items (Qty)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {intervalRows.map((row, rIdx) => (
                                    <tr key={rIdx} style={{ borderBottom: '1px solid #eee' }}>
                                      <td style={{ padding: '8px 15px', fontWeight: 'bold', borderRight: '1px solid #eee', verticalAlign: 'top' }}>
                                        {row.timeWindow}
                                      </td>
                                      <td style={{ padding: '8px 15px' }}>
                                        {row.items.length > 0 ? (
                                          row.items.map((it, itIdx) => (
                                            <div key={itIdx} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: itIdx === row.items.length - 1 ? 'none' : '1px dashed #f0f0f0' }}>
                                              {it.name} <strong>({it.qty})</strong>
                                            </div>
                                          ))
                                        ) : (
                                          '-'
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        );
                      }
                      return null;
                    })()}

                    {/* Top 5 Selling Items */}
                    {(() => {
                      let items = [];
                      try {
                        items = Array.isArray(selectedHistoryReport.items_summary) 
                          ? selectedHistoryReport.items_summary 
                          : JSON.parse(selectedHistoryReport.items_summary || '[]');
                      } catch(e) { items = []; }

                      let allFlat = [];
                      items.forEach(cat => {
                        if (cat.items && Array.isArray(cat.items)) {
                          cat.items.forEach(it => {
                            allFlat.push({
                              name: it.name,
                              qty: parseInt(it.qty, 10) || 0,
                              totalPrice: parseFloat(it.amount) || 0
                            });
                          });
                        }
                      });

                      if (allFlat.length > 0) {
                        const grouped = {};
                        allFlat.forEach(it => {
                          if (!grouped[it.name]) grouped[it.name] = { name: it.name, qty: 0, totalPrice: 0 };
                          grouped[it.name].qty += it.qty;
                          grouped[it.name].totalPrice += it.totalPrice;
                        });

                        const sorted = Object.values(grouped).sort((a, b) => b.qty - a.qty).slice(0, 5);

                        return (
                          <>
                            <h3 style={{ marginTop: 30, borderBottom: '2px solid #eaeaea', paddingBottom: 8, color: '#333', fontSize: 16 }}>
                              Top 5 Selling Items
                            </h3>
                            <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, overflowX: 'auto' }}>
                              <table style={{ width: '100%', minWidth: 250, borderCollapse: 'collapse', fontSize: 13, color: '#555', tableLayout: 'fixed', wordWrap: 'break-word' }}>
                                <thead>
                                  <tr style={{ background: '#fff3f4', borderBottom: '1px solid #ffccd0', textAlign: 'left', color: '#E31837' }}>
                                    <th style={{ padding: '10px 8px', width: '15%' }}>#</th>
                                    <th style={{ padding: '10px 8px', width: '45%' }}>Item</th>
                                    <th style={{ padding: '10px 8px', textAlign: 'center', width: '15%' }}>Qty</th>
                                    <th style={{ padding: '10px 8px', textAlign: 'right', width: '25%' }}>Rev</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sorted.map((it, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                      <td style={{ padding: '8px 15px', fontWeight: 'bold' }}>#{idx + 1}</td>
                                      <td style={{ padding: '8px 15px' }}>{it.name}</td>
                                      <td style={{ padding: '8px 15px', textAlign: 'center' }}><strong>{it.qty}</strong></td>
                                      <td style={{ padding: '8px 15px', textAlign: 'right' }}>SAR {it.totalPrice.toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              /* ── List View ── */
              <div>
                {(() => {
                  const filteredHistory = closingHistory.filter(c => {
                    if (historyFilterBranch !== 'All' && c.branch !== historyFilterBranch) return false;
                    if (historyFilterType !== 'All' && c.closing_type !== historyFilterType) return false;
                    if (historyFilterUser !== 'All' && c.cashier_name !== historyFilterUser) return false;
                    return true;
                  });

                  return filteredHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No closing reports found matching filters.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {filteredHistory.map(c => (
                        <div

                        key={c.id}
                        onClick={() => setSelectedHistoryReport(c)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#f8f9fa', borderRadius: 10, border: '1px solid var(--surface-2)', cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f8f9fa'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 22 }}>{c.closing_type === 'Daily' ? '⚡' : '🔄'}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.closing_type} Closing — {c.cashier_name} ({c.branch})</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                              {formatSaudiTime(c.login_time)} → {formatSaudiTime(c.logout_time)} · Active: {c.total_active_time} · {c.total_orders} orders{c.closing_cash ? ` · Drawer: ${CURRENCY}${parseFloat(c.closing_cash).toFixed(2)}` : ''}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: 15 }}>{CURRENCY}{parseFloat(c.total_sales || 0).toFixed(2)}</span>
                          <ChevronRight size={18} color="var(--text-muted)" />
                        </div>
                      </div>
                    ))}
                  </div>
                )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setShowCancelModal(false) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Confirm {cancelOrderTarget?.type}</h3>
              <button className="modal-close" onClick={() => setShowCancelModal(false)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ marginBottom: 16, fontSize: 14 }}>Please provide a reason for marking <b>Order #{cancelOrderTarget?.id}</b> as {cancelOrderTarget?.type}:</p>
              <textarea 
                className="pos-search-input"
                style={{ width: '100%', height: 100, padding: 12, borderRadius: 8, border: '1px solid var(--surface-2)', marginBottom: 20, resize: 'none' }}
                placeholder="Reason..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCancelModal(false)}>Back</button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1, background: 'var(--red)' }} 
                  onClick={handleDirectVoidWithReason}
                  disabled={processingCancel}
                >
                  {processingCancel ? 'Processing...' : `Confirm ${cancelOrderTarget?.type}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
