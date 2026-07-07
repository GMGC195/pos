import { useEffect, useState } from 'react'
import axios from '../api'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { 
  CircleDollarSign, 
  Banknote, 
  CreditCard, 
  Clock, 
  Ban, 
  Undo2, 
  Search, 
  Printer, 
  BarChart3, 
  ClipboardList, 
  Lock,
  Eye,
  RefreshCw
} from 'lucide-react'
import { CURRENCY } from '../config'
import OrderDetailModal from '../components/OrderDetailModal'

const today = () => new Date().toISOString().split('T')[0]
const weekAgo = () => {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

export default function Reports({ isTodaySales = false }) {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [showTodaySummary, setShowTodaySummary] = useState(false)
  const [showDetailsInModal, setShowDetailsInModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [modalPage, setModalPage] = useState(1)
  const pageSize = 10

  const load = () => {
    setLoading(true)
    Promise.all([
      axios.get('/api/transactions', { params: { from, to } }),
      axios.get('/api/transactions/summary', { params: { from, to } }),
    ])
      .then(([txRes, sumRes]) => {
        setTransactions(txRes.data)
        setSummary(sumRes.data)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { 
    load()
    const interval = setInterval(load, 180000) // Auto-refresh every 3 mins
    return () => clearInterval(interval)
  }, [from, to])

  useEffect(() => {
    setFrom(isTodaySales ? today() : weekAgo())
    setTo(today())
    setShowDetailsInModal(false)
    setShowTodaySummary(false)
    setCurrentPage(1)
    setModalPage(1)
    setStatusFilter('All')
  }, [isTodaySales])

  useEffect(() => {
    setCurrentPage(1)
  }, [from, to, search, statusFilter])

  const cashRow = summary.find(r => r.payment_method === 'Cash')
  const cardRow = summary.find(r => r.payment_method === 'Card')
  const holdRow = summary.find(r => r.payment_method === 'Hold')
  const cancelledRow = summary.find(r => r.payment_method === 'Cancelled')
  const returnedRow = summary.find(r => r.payment_method === 'Returned')
  
  const totalSales = summary
    .filter(r => r.payment_method !== 'Hold' && r.payment_method !== 'Cancelled' && r.payment_method !== 'Returned')
    .reduce((s, r) => s + parseFloat(r.total || 0), 0)
    
  const totalCount = summary.reduce((s, r) => s + parseInt(r.count || 0), 0)

  const tiles = [
    { label: 'Total Revenue', val: `${CURRENCY}${totalSales.toFixed(2)}`, icon: <CircleDollarSign size={20} />, color: '#E31837', bg: '#fff1f2' },
    { label: 'Cash Sales', val: `${CURRENCY}${parseFloat(cashRow?.total || 0).toFixed(2)}`, icon: <Banknote size={20} />, color: '#10b981', bg: '#ecfdf5', sub: `${cashRow?.count || 0} orders` },
    { label: 'Card Sales', val: `${CURRENCY}${parseFloat(cardRow?.total || 0).toFixed(2)}`, icon: <CreditCard size={20} />, color: '#3b82f6', bg: '#eff6ff', sub: `${cardRow?.count || 0} orders` },
  ]
  
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

  const exportExcel = () => {
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

  const handleVoid = (orderId, type) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Mark Order #{orderId} as <b>{type.toUpperCase()}</b>?</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => toast.dismiss(t.id)}>No</button>
          <button 
            className="btn btn-primary" 
            style={{ padding: '6px 12px', fontSize: 13, background: 'var(--red)', color: 'white' }} 
            onClick={async () => {
              toast.dismiss(t.id)
              try {
                await axios.patch(`/api/orders/${orderId}/void`, { type })
                toast.success(`Order marked as ${type}.`)
                load() // Refresh table and stats
              } catch (err) {
                console.error(err)
                toast.error('Error updating order: ' + (err?.response?.data?.error || err.message))
              }
            }}
          >
            Yes, {type}
          </button>
        </div>
      </div>
    ), { duration: Infinity, id: 'confirm-void', position: 'top-center', style: { minWidth: 320 } })
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

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = search ? t.order_id.toString().includes(search.trim()) : true;
    const matchesStatus = statusFilter === 'All' ? true : t.order_status === statusFilter;
    return matchesSearch && matchesStatus;
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
      {/* Date Filter Bar -- only show if not forced to Today */}
      {!isTodaySales && (
        <div className="date-filter-bar">
          <div className="filter-group">
            <div className="filter-item">
              <label>From:</label>
              <input type="date" className="date-input" value={from} max={to} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="filter-item">
              <label>To:</label>
              <input type="date" className="date-input" value={to} min={from} onChange={e => setTo(e.target.value)} />
            </div>
            <button 
              className="btn btn-secondary" 
              onClick={() => { setFrom(today()); setTo(today()); }}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6,
                background: (from === today() && to === today()) ? 'linear-gradient(135deg, #E31837, #FF6B35)' : '',
                color: (from === today() && to === today()) ? 'white' : '',
                borderColor: (from === today() && to === today()) ? '#b0112a' : '',
                fontWeight: (from === today() && to === today()) ? 'bold' : ''
              }}
            >
              Today
            </button>
          </div>

          <div className="filter-group">
            <button 
              className="btn btn-secondary" 
              onClick={load}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Manual Refresh"
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn-primary" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Search size={16} /> Filter</button>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={16} /> Export PDF</button>
            <button className="btn btn-secondary" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={16} /> Export Excel</button>
          </div>
        </div>
      )}

      {isTodaySales && (
        <div className="date-filter-bar" style={{ justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button 
              className="btn btn-secondary" 
              onClick={load}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Manual Refresh"
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn-secondary" onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={16} /> Export PDF</button>
            <button className="btn btn-secondary" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={16} /> Export Excel</button>
          </div>
        </div>
      )}

      
      <div className="summary-tiles">
        {tiles.map(t => (
          <div key={t.label} className="summary-tile">
            <div className="tile-icon" style={{ background: t.bg }}>
              {t.icon}
            </div>
            <div className="tile-info">
              <h4 style={{ color: t.color }}>{loading ? '...' : t.val}</h4>
              <p>{t.label}</p>
              {t.sub && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Transactions Table */}
      <div className="card" style={{ padding: 0, marginBottom: 80, background: '#f8fafc' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardList size={20} /> Transactions ({filteredTransactions.length})
            </h3>
            <input 
              type="text" 
              placeholder="Search Order ID..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="pos-search-input"
              style={{ padding: '6px 12px', border: '1px solid var(--surface-2)', borderRadius: 6, fontSize: 14 }}
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid var(--surface-2)', borderRadius: 6, fontSize: 14, background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              <option value="All">All Statuses</option>
              <option value="Completed">Completed (Delivered)</option>
              <option value="Hold">Hold / Pending</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Returned">Returned</option>
            </select>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{from} → {to}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Order ID</th>
                <th>Txn ID</th>
                <th>Items</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date & Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 18, width: '80%', borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                : paginatedTransactions.map(t => (
                    <tr key={t.id} onClick={() => viewOrderDetail(t.order_id)} style={{ cursor: 'pointer' }} className="hover-row">
                      <td style={{ fontWeight: 800, color: 'var(--red)' }}>{t.slip_number || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="badge badge-info" style={{ fontWeight: 800 }}>Order #{t.order_id}</span>
                          {t.is_edited && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>Edited</span>}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>#{t.id}</td>
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
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                      <td>
                        {(!['Cancelled', 'Returned'].includes(t.order_status)) && (
                          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                            <button 
                              className="btn btn-sm" 
                              style={{ padding: '4px 8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={() => handleVoid(t.order_id, 'Cancelled')}
                              title="Cancel Order"
                            >
                              <Ban size={14} /> Cancel
                            </button>
                            <button 
                              className="btn btn-sm" 
                              style={{ padding: '4px 8px', background: 'rgba(217, 119, 6, 0.1)', color: '#d97706', border: '1px solid rgba(217, 119, 6, 0.2)', display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={() => handleVoid(t.order_id, 'Returned')}
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

      {/* Daily Closing Button */}
      <div style={{
        position: 'fixed', bottom: 32, right: 32, zIndex: 50
      }}>
        <button
          className="btn btn-danger btn-lg"
          onClick={handleDailyClosing}
          style={{ boxShadow: '0 8px 24px rgba(239,68,68,0.4)', gap: 10, display: 'flex', alignItems: 'center' }}
        >
          <Lock size={18} /> Daily Closing
        </button>
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
                      <th style={{ padding: '10px 12px' }}>Items</th>
                      <th style={{ padding: '10px 12px' }}>Amount</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedModalTransactions.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--red)' }}>{t.slip_number}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                          Order #{t.order_id}
                          {t.is_edited && <span style={{ fontSize: 10, color: '#999', marginLeft: 6 }}>(Edit)</span>}
                        </td>
                        <td style={{ padding: '10px 12px', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.items}>
                          {t.items || '-'}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{CURRENCY}{parseFloat(t.amount).toFixed(2)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className={`badge ${t.order_status === 'Hold' ? 'badge-warning' : (['Cancelled', 'Returned'].includes(t.order_status) ? 'badge-danger' : 'badge-success')}`}>
                            {t.payment_method === t.order_status ? t.order_status : `${t.payment_method} - ${t.order_status}`}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#666' }}>{new Date(t.created_at).toLocaleTimeString()}</td>
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
    </>
  )
}
