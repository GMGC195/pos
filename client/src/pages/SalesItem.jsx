import { useEffect, useState } from 'react'
import axios from '../api'
import toast from 'react-hot-toast'
import { 
  ClipboardList, 
  Search, 
  Printer, 
  BarChart3, 
  Pizza,
  ArrowRight,
  RefreshCw
} from 'lucide-react'
import { CURRENCY } from '../config'
import { usePOS } from '../contexts/POSContext'

const today = () => new Date().toISOString().split('T')[0]
const yesterday = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}


export default function SalesItem() {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [catFilter, setCatFilter] = useState('All')
  const [branch, setBranch] = useState('All')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const { categories } = usePOS()

  const load = () => {
    setLoading(true)
    axios.get('/api/reports/sales-items', { params: { from, to, branch } })
      .then(res => {
        setData(res.data)
      })
      .catch(err => {
        console.error('Error loading sales items:', err)
        toast.error('Failed to load sales item report')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000) // Auto-refresh every 30s
    return () => clearInterval(interval)
  }, [from, to, branch])

  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(filteredData.map(item => ({
      'Category': item.category_name || 'Uncategorized',
      'Item Name': item.item_name,
      'Quantity': item.total_qty,
      'Subtotal': parseFloat(item.subtotal).toFixed(2),
      'Discount': parseFloat(item.discount).toFixed(2),
      'Sale Price': parseFloat(item.sale_price).toFixed(2),
      'Produce Cost': parseFloat(item.produce_cost).toFixed(2),
      'Revenue': parseFloat(item.revenue).toFixed(2),
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Items')
    XLSX.writeFile(wb, `sales-items-and-revenue-${from}-to-${to}.xlsx`)
  }

  const exportPDF = () => {
    const printWindow = window.open('', '', 'width=1000,height=650');
    const html = `
      <html>
        <head>
          <title>Sales Items and Revenue Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
            h2 { text-align: center; color: #111; border-bottom: 2px solid #ddd; padding-bottom: 10px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f8f9fa; color: #444; }
            .totals-row { background: #f8fafc; font-weight: bold; }
            .currency { text-align: right; }
          </style>
        </head>
        <body>
          <h2>Sales Items and Revenue Report <span style="font-size:14px;color:#666;font-weight:normal;">(${from} to ${to})</span></h2>
          
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Item Name</th>
                <th>Qty</th>
                <th>Subtotal</th>
                <th>Discount</th>
                <th>Sale Price</th>
                <th>Produce Cost</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.map(item => `
                <tr>
                  <td>${item.category_name || 'Uncategorized'}</td>
                  <td>${item.item_name}</td>
                  <td>${item.total_qty}</td>
                  <td class="currency">${CURRENCY}${parseFloat(item.subtotal).toFixed(2)}</td>
                  <td class="currency">${CURRENCY}${parseFloat(item.discount).toFixed(2)}</td>
                  <td class="currency">${CURRENCY}${parseFloat(item.sale_price).toFixed(2)}</td>
                  <td class="currency">${CURRENCY}${parseFloat(item.produce_cost).toFixed(2)}</td>
                  <td class="currency"><strong>${CURRENCY}${parseFloat(item.revenue).toFixed(2)}</strong></td>
                </tr>
              `).join('')}
              <tr class="totals-row">
                <td colspan="2">GRAND TOTAL</td>
                <td>${grandTotals.qty}</td>
                <td class="currency">${CURRENCY}${grandTotals.subtotal.toFixed(2)}</td>
                <td class="currency">${CURRENCY}${grandTotals.discount.toFixed(2)}</td>
                <td class="currency">${CURRENCY}${grandTotals.salePrice.toFixed(2)}</td>
                <td class="currency">${CURRENCY}${grandTotals.produceCost.toFixed(2)}</td>
                <td class="currency">${CURRENCY}${grandTotals.revenue.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  }

  // Filter data by category
  const filteredData = data.filter(item => 
    catFilter === 'All' || item.category_name === catFilter
  );

  // Group data by category
  const groupedData = filteredData.reduce((acc, item) => {
    const cat = item.category_name || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const grandTotals = {
    itemsSold: filteredData.length,
    qty: filteredData.reduce((s, i) => s + i.total_qty, 0),
    subtotal: filteredData.reduce((s, i) => s + parseFloat(i.subtotal), 0),
    discount: filteredData.reduce((s, i) => s + parseFloat(i.discount), 0),
    salePrice: filteredData.reduce((s, i) => s + parseFloat(i.sale_price), 0),
    produceCost: filteredData.reduce((s, i) => s + parseFloat(i.produce_cost), 0),
    revenue: filteredData.reduce((s, i) => s + parseFloat(i.revenue), 0),
  }

  return (
    <>
      <div className="card" style={{ padding: 0, marginBottom: 160, background: '#f8fafc' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                <ClipboardList size={18} /> Sales Items
              </h3>
              <select 
                value={catFilter} 
                onChange={e => setCatFilter(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid var(--surface-2)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', maxWidth: '140px' }}
              >
                <option value="All">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, flex: 1, justifyContent: 'flex-end' }}>
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
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexWrap: 'wrap', background: 'var(--surface-2)', borderRadius: 8, padding: 4, alignItems: 'center', gap: 4 }}>
              {['All', 'Branch 1', 'Branch 2', 'Branch 3'].map(b => (
                <button
                  key={b}
                  onClick={() => setBranch(b)}
                  style={{
                    flex: '1 1 auto', padding: '6px 12px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 6,
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

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
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
        <div className="table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Category</th>
                <th>Item Name</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
                <th style={{ textAlign: 'right' }}>Discount</th>
                <th style={{ textAlign: 'center' }}>Sale Price</th>
                <th style={{ textAlign: 'center' }}>Produce Cost</th>
                <th style={{ textAlign: 'center' }}>Revenue Produced</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let srNo = 1;
                return loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 18, width: '80%', borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                ) : (
                  Object.entries(groupedData).map(([category, items]) => (
                    <header key={category} style={{ display: 'contents' }}>
                      <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                        <td colSpan={9} style={{ padding: '8px 24px', fontSize: 13, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {category}
                        </td>
                      </tr>
                    {items.map((item, idx) => (
                      <tr key={`${category}-${idx}`}>
                        <td style={{ fontWeight: 800, color: 'var(--text-muted)' }}>{srNo++}</td>
                        <td style={{ paddingLeft: 32, opacity: 0.5, fontSize: 12 }}>{category}</td>
                        <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-info" style={{ minWidth: 40 }}>{item.total_qty}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{CURRENCY}{parseFloat(item.subtotal).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--red)' }}>{CURRENCY}{parseFloat(item.discount).toFixed(2)}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{CURRENCY}{parseFloat(item.sale_price).toFixed(2)}</td>
                        <td style={{ textAlign: 'center', color: '#666' }}>{CURRENCY}{parseFloat(item.produce_cost).toFixed(2)}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--green)' }}>{CURRENCY}{parseFloat(item.revenue).toFixed(2)}</td>
                      </tr>
                    ))}
                    </header>
                  ))
                )
              })()}
              {!loading && data.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                    <Pizza size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                    <p>No sales data found for this period.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grand Totals Table */}
      {!loading && data.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 80, border: '2px solid var(--surface-3)' }}>
          <div style={{ padding: '14px 24px', background: 'var(--surface-2)', borderBottom: '1px solid var(--surface-3)' }}>
            <h4 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-primary)' }}>Grand Totals Summary</h4>
          </div>
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--surface-2)' }}>
                  <th style={{ padding: '12px 24px' }}>Items Total</th>
                  <th style={{ padding: '12px 24px', textAlign: 'right' }}>Total Subtotal</th>
                  <th style={{ padding: '12px 24px', textAlign: 'right' }}>Total Discount</th>
                  <th style={{ padding: '12px 24px', textAlign: 'center' }}>Total Sale Price</th>
                  <th style={{ padding: '12px 24px', textAlign: 'center' }}>Total Produce Cost</th>
                  <th style={{ padding: '12px 24px', textAlign: 'center' }}>Net Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '4px 12px', borderRadius: 20 }}>
                      {grandTotals.qty}
                    </div>
                  </td>
                  <td style={{ padding: '20px 24px', textAlign: 'right' }}>
                    {CURRENCY}{grandTotals.subtotal.toFixed(2)}
                  </td>
                  <td style={{ padding: '20px 24px', textAlign: 'right', color: 'var(--red)' }}>
                   {CURRENCY}{grandTotals.discount.toFixed(2)}
                  </td>
                   <td style={{ padding: '20px 24px', textAlign: 'center' }}>
                    {CURRENCY}{grandTotals.salePrice.toFixed(2)}
                  </td>
                  <td style={{ padding: '20px 24px', textAlign: 'center', color: '#666' }}>
                    {CURRENCY}{grandTotals.produceCost.toFixed(2)}
                  </td>
                  <td style={{ padding: '20px 24px', textAlign: 'center', color: 'var(--green)', fontSize: 24 }}>
                    {CURRENCY}{grandTotals.revenue.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

