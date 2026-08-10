import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Search, Database, RefreshCw, Clock, TrendingDown, Package, AlertTriangle, Settings, MinusCircle, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from '../api'

export default function StockManagement() {
  const [stockItems, setStockItems] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDailyModalOpen, setIsDailyModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Form State for New/Edit Item
  const [editId, setEditId] = useState(null)
  const [formData, setFormData] = useState({ name: '', unit: 'kg', price_per_unit: '', low_stock_threshold: '' })

  // Form State for Daily Addition
  const [dailyData, setDailyData] = useState({ stock_id: '', quantity: '', price_per_unit: '', total_price: '' })

  const [wasteHistory, setWasteHistory] = useState([])
  const [isEditHistoryModalOpen, setIsEditHistoryModalOpen] = useState(false)
  const [editHistoryData, setEditHistoryData] = useState({ id: '', quantity: '', price_per_unit: '', total_price: '' })
  
  const [isMinusModalOpen, setIsMinusModalOpen] = useState(false)
  const [minusData, setMinusData] = useState({ stock_id: '', stock_history_id: '', quantity: '', reason: '' })
  const [availableBatches, setAvailableBatches] = useState([])
  const [minusStockItem, setMinusStockItem] = useState(null)

  const fetchStock = async () => {
    try {
      const res = await axios.get(`/api/stock?_t=${Date.now()}`)
      setStockItems(res.data)
    } catch (err) {
      console.error(err)
      toast.error('Could not load stock items.')
    } 
  }

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`/api/stock/history?_t=${Date.now()}`)
      setHistory(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchWasteHistory = async () => {
    try {
      const res = await axios.get(`/api/stock/waste?_t=${Date.now()}`)
      setWasteHistory(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadData = async () => {
    setLoading(true)
    await Promise.all([fetchStock(), fetchHistory(), fetchWasteHistory()])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.price_per_unit) return toast.error('Name and price required')
    
    setSaving(true)
    try {
      const isEdit = !!editId
      const url = isEdit ? `/api/stock/${editId}` : `/api/stock`
      const method = isEdit ? 'put' : 'post'

      await axios[method](url, {
        name: formData.name,
        unit: formData.unit,
        quantity: isEdit ? undefined : 0,
        price_per_unit: parseFloat(formData.price_per_unit) || 0,
        low_stock_threshold: parseFloat(formData.low_stock_threshold) || 0
      })

      toast.success(isEdit ? 'Stock item updated' : 'New stock item created')
      handleCloseModal()
      await loadData()
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDailySubmit = async (e) => {
    e.preventDefault()
    if (!dailyData.stock_id || !dailyData.quantity || !dailyData.total_price) {
      return toast.error('Please fill all required fields')
    }

    setSaving(true)
    try {
      await axios.post('/api/stock/add-daily', {
        stock_id: parseInt(dailyData.stock_id),
        quantity: parseFloat(dailyData.quantity),
        price_per_unit: parseFloat(dailyData.price_per_unit),
        total_price: parseFloat(dailyData.total_price)
      })

      toast.success('Stock added successfully')
      setIsDailyModalOpen(false)
      setDailyData({ stock_id: '', quantity: '', price_per_unit: '', total_price: '' })
      await loadData()
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (id) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 200 }}>
        <span style={{ fontWeight: 500 }}>Delete this stock item?</span>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 5 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => toast.dismiss(t.id)}>Cancel</button>
          <button className="btn btn-sm btn-danger" onClick={async () => {
            toast.dismiss(t.id)
            try {
              await axios.delete(`/api/stock/${id}`)
              toast.success('Stock item deleted')
              await fetchStock()
            } catch (err) {
              toast.error(err?.response?.data?.error || err.message)
            }
          }}>Confirm Delete</button>
        </div>
      </div>
    ), { duration: Infinity, id: 'delete-confirm' })
  }

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditId(item.id)
      setFormData({ 
        name: item.name, 
        unit: item.unit, 
        price_per_unit: item.price_per_unit,
        low_stock_threshold: item.low_stock_threshold || ''
      })
    } else {
      setEditId(null)
      setFormData({ name: '', unit: 'kg', price_per_unit: '', low_stock_threshold: '' })
    }
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setFormData({ name: '', unit: 'kg', price_per_unit: '', low_stock_threshold: '' })
    setEditId(null)
  }

  const handleEditHistorySubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await axios.put(`/api/stock/history/${editHistoryData.id}`, {
        quantity: parseFloat(editHistoryData.quantity),
        price_per_unit: parseFloat(editHistoryData.price_per_unit),
        total_price: parseFloat(editHistoryData.total_price)
      })
      toast.success('History record updated')
      setIsEditHistoryModalOpen(false)
      await loadData()
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteHistory = (id) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 200 }}>
        <span style={{ fontWeight: 500 }}>Delete this stock history and revert stock?</span>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 5 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => toast.dismiss(t.id)}>Cancel</button>
          <button className="btn btn-sm btn-danger" onClick={async () => {
            toast.dismiss(t.id)
            try {
              await axios.delete(`/api/stock/history/${id}`)
              toast.success('History deleted')
              await loadData()
            } catch (err) {
              toast.error(err?.response?.data?.error || err.message)
            }
          }}>Confirm Delete</button>
        </div>
      </div>
    ), { duration: Infinity, id: 'delete-history-confirm' })
  }

  const openMinusModal = async (stockItem) => {
    try {
      const res = await axios.get(`/api/stock/${stockItem.id}/batches`)
      setAvailableBatches(res.data)
      setMinusStockItem(stockItem)
      setMinusData({ stock_id: stockItem.id, stock_history_id: '', quantity: '', reason: '' })
      setIsMinusModalOpen(true)
    } catch {
      toast.error('Could not fetch batches')
    }
  }

  const handleMinusSubmit = async (e) => {
    e.preventDefault()
    if (!minusData.quantity || !minusData.reason) return toast.error('Quantity and reason required')
    const deductQty = parseFloat(minusData.quantity)
    if (deductQty <= 0) return toast.error('Quantity must be greater than 0')
    
    // Client-side guard: check against current remaining stock
    const currentQty = parseFloat(minusStockItem?.quantity || 0)
    if (deductQty > currentQty) {
      return toast.error(`Cannot deduct ${deductQty}. Only ${currentQty.toFixed(3)} of ${minusStockItem?.name} remaining.`)
    }

    // If a batch is selected, also check batch remaining
    if (minusData.stock_history_id) {
      const selectedBatch = availableBatches.find(b => b.id === parseInt(minusData.stock_history_id))
      if (selectedBatch && deductQty > parseFloat(selectedBatch.remaining_quantity)) {
        return toast.error(`Cannot deduct ${deductQty} from this batch. Only ${parseFloat(selectedBatch.remaining_quantity).toFixed(3)} remaining in that batch.`)
      }
    }

    setSaving(true)
    try {
      await axios.post('/api/stock/minus', minusData)
      toast.success('Stock deducted successfully')
      setIsMinusModalOpen(false)
      await loadData()
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredItems = stockItems.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  const lowStockItems = stockItems.filter(item => 
    parseFloat(item.quantity) <= parseFloat(item.low_stock_threshold) && parseFloat(item.low_stock_threshold) > 0
  )

  const selectedStockForDaily = stockItems.find(s => s.id === parseInt(dailyData.stock_id))

  const updateDailyPricing = (field, value) => {
    const newData = { ...dailyData, [field]: value }
    if (field === 'quantity' || field === 'price_per_unit') {
      const q = parseFloat(field === 'quantity' ? value : dailyData.quantity) || 0
      const p = parseFloat(field === 'price_per_unit' ? value : dailyData.price_per_unit) || 0
      newData.total_price = (q * p).toFixed(2)
    } else if (field === 'total_price') {
      const t = parseFloat(value) || 0
      const q = parseFloat(dailyData.quantity) || 0
      if (q > 0) newData.price_per_unit = (t / q).toFixed(2)
    }
    setDailyData(newData)
  }

  return (
    <>
      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <div className="card" style={{ marginBottom: 25, border: '1px solid #ff4b4b', background: 'rgba(255, 75, 75, 0.05)' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255, 75, 75, 0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={20} color="#ff4b4b" />
            <h3 style={{ fontSize: 16, color: '#ff4b4b' }}>Low Stock Alerts</h3>
          </div>
          <div className="table-wrap">
            <table className="table-hover">
              <thead>
                <tr>
                  <th style={{ color: '#ff4b4b' }}>Item Name</th>
                  <th style={{ color: '#ff4b4b' }}>Current Stock</th>
                  <th style={{ color: '#ff4b4b' }}>Threshold</th>
                  <th style={{ color: '#ff4b4b', textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map(item => (
                  <tr key={item.id} style={{ borderLeft: '3px solid #ff4b4b' }}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td style={{ fontWeight: 'bold' }}>{Number(item.quantity).toFixed(3)} {item.unit}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{Number(item.low_stock_threshold).toFixed(3)} {item.unit}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-danger" style={{ background: '#ff4b4b', color: 'white' }}>LOW</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="inventory-toolbar">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search stock..."
            style={{ paddingLeft: 34 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="inventory-toolbar-actions" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-secondary" onClick={() => loadData()}>
            <RefreshCw size={18} /> Refresh
          </button>
          <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #11998e, #38ef7d)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(17, 153, 142, 0.2)' }} onClick={() => setIsDailyModalOpen(true)}>
            <Plus size={18} /> Add Daily Stock
          </button>
          <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #ff9800, #ff4b4b)', color: 'white', border: 'none' }} onClick={() => handleOpenModal()}>
            <Package size={18} /> New Stock Item
          </button>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="card" style={{ padding: 0, marginBottom: 30 }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Database size={18} color="var(--primary)" />
          <h3 style={{ fontSize: 16 }}>Remaining Stock Inventory</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Unit</th>
                <th>Remaining Quantity</th>
                <th>Min. Threshold</th>
                <th>Price per Unit</th>
                <th>Last Updated</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 18, width: '80%', borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                : filteredItems.map(item => {
                    const isLow = parseFloat(item.quantity) <= parseFloat(item.low_stock_threshold) && parseFloat(item.low_stock_threshold) > 0;
                    return (
                      <tr key={item.id} style={isLow ? { background: 'rgba(255, 75, 75, 0.05)' } : {}}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td><span className="badge badge-info">{item.unit}</span></td>
                        <td style={{ fontWeight: 'bold', color: isLow ? '#ff4b4b' : 'var(--text-main)' }}>
                          {Number(item.quantity).toFixed(3)} {item.unit}
                          {isLow && <AlertTriangle size={14} style={{ marginLeft: 6, display: 'inline' }} color="#ff4b4b" />}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {item.low_stock_threshold > 0 ? `${Number(item.low_stock_threshold).toFixed(3)} ${item.unit}` : 'Not set'}
                        </td>
                        <td style={{ color: 'var(--green)', fontWeight: 600 }}>Rs {Number(item.price_per_unit).toFixed(2)}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                          {new Date(item.updated_at || item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button className="btn btn-sm btn-secondary" onClick={() => handleOpenModal(item)}><Settings size={14} /></button>
                              <button className="btn btn-sm" style={{ background: '#ff9800', color: 'white', border: 'none' }} onClick={() => openMinusModal(item)}><MinusCircle size={14} /></button>
                              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></button>
                            </div>
                        </td>
                      </tr>
                    );
                  })
              }
              {!loading && filteredItems.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No stock items found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Today's Stock History */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={18} color="var(--green)" />
          <h3 style={{ fontSize: 16 }}>Today's Stock Added</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stock Item</th>
                <th>Quantity Added</th>
                <th>Price per Unit</th>
                <th>Total Cost</th>
                <th>Time Added</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>Loading history...</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No stock added today.</td></tr>
              ) : (
                history.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 500 }}>{h.stock_name}</td>
                    <td><span className="badge badge-success">+{Number(h.quantity).toFixed(3)} {h.unit}</span></td>
                    <td>Rs {Number(h.price_per_unit).toFixed(2)}</td>
                    <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>Rs {Number(h.total_price).toFixed(2)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {new Date(h.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setEditHistoryData({ id: h.id, quantity: h.quantity, price_per_unit: h.price_per_unit, total_price: h.total_price });
                          setIsEditHistoryModalOpen(true);
                        }}><Edit2 size={14} /></button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteHistory(h.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Daily Stock Modal */}
      {isDailyModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setIsDailyModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingDown size={20} /> Add Daily Stock</h3>
              <button className="modal-close" onClick={() => setIsDailyModalOpen(false)}>✕</button>
            </div>
            
            <div className="form-group" style={{ marginBottom: 15 }}>
              <label>Select Item *</label>
              <select className="form-control" value={dailyData.stock_id} onChange={e => updateDailyPricing('stock_id', e.target.value)}>
                <option value="">-- Choose Stock Item --</option>
                {stockItems.map(s => <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>)}
              </select>
            </div>

            <div className="form-row" style={{ marginBottom: 15 }}>
              <div className="form-group">
                <label>Quantity to Add ({selectedStockForDaily?.unit || '-'})</label>
                <input className="form-control" type="number" step="0.001" value={dailyData.quantity} onChange={e => updateDailyPricing('quantity', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Price per {selectedStockForDaily?.unit || 'Unit'}</label>
                <input className="form-control" type="number" step="0.01" value={dailyData.price_per_unit} onChange={e => updateDailyPricing('price_per_unit', e.target.value)} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Total Price (Rs)</label>
              <input className="form-control" type="number" step="0.01" value={dailyData.total_price} onChange={e => updateDailyPricing('total_price', e.target.value)} />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsDailyModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDailySubmit} disabled={saving}>
                {saving ? 'Recording...' : 'Update Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New/Edit Item Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) handleCloseModal() }}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={20} /> {editId ? 'Edit Stock Item' : 'Create New Stock Item'}
              </h3>
              <button className="modal-close" onClick={handleCloseModal}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: 15 }}>
              <label>Item Name *</label>
              <input className="form-control" placeholder="e.g. Chicken, Cheese" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            
            <div className="form-row" style={{ marginBottom: 15 }}>
              <div className="form-group">
                <label>Unit</label>
                <select className="form-control" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})}>
                  <option value="kg">kg</option>
                  <option value="pieces">pieces</option>
                </select>
              </div>
              <div className="form-group">
                <label>Default Price (per {formData.unit})</label>
                <input className="form-control" type="number" step="0.01" value={formData.price_per_unit} onChange={e => setFormData({...formData, price_per_unit: e.target.value})} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Low Stock Threshold ({formData.unit})</label>
              <input 
                className="form-control" 
                type="number" 
                step="0.001" 
                placeholder="0.000 (0 to disable)" 
                value={formData.low_stock_threshold} 
                onChange={e => setFormData({...formData, low_stock_threshold: e.target.value})} 
              />
              <small style={{ color: 'var(--text-muted)' }}>Notify me when remaining stock falls below this level.</small>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waste / Minus Stock History */}
      <div className="card" style={{ padding: 0, marginTop: 30 }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Info size={18} color="var(--orange)" />
          <h3 style={{ fontSize: 16 }}>Waste & Deducted Stock History (Last 30 Days)</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stock Item</th>
                <th>Quantity Minused</th>
                <th>Reason</th>
                <th>Time Deducted</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20 }}>Loading history...</td></tr>
              ) : wasteHistory.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No waste or deductions found.</td></tr>
              ) : (
                wasteHistory.map(w => (
                  <tr key={w.id}>
                    <td style={{ fontWeight: 500 }}>{w.stock_name}</td>
                    <td><span className="badge badge-danger">-{Number(w.quantity).toFixed(3)} {w.unit}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{w.reason}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {new Date(w.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit History Modal */}
      {isEditHistoryModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setIsEditHistoryModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Edit2 size={20} /> Edit Added Batch</h3>
              <button className="modal-close" onClick={() => setIsEditHistoryModalOpen(false)}>✕</button>
            </div>
            
            <div className="form-row" style={{ marginBottom: 15 }}>
              <div className="form-group">
                <label>Quantity</label>
                <input className="form-control" type="number" step="0.001" value={editHistoryData.quantity} onChange={e => {
                  const q = parseFloat(e.target.value) || 0;
                  const p = parseFloat(editHistoryData.price_per_unit) || 0;
                  setEditHistoryData({ ...editHistoryData, quantity: e.target.value, total_price: (q * p).toFixed(2) });
                }} />
              </div>
              <div className="form-group">
                <label>Price per Unit</label>
                <input className="form-control" type="number" step="0.01" value={editHistoryData.price_per_unit} onChange={e => {
                  const p = parseFloat(e.target.value) || 0;
                  const q = parseFloat(editHistoryData.quantity) || 0;
                  setEditHistoryData({ ...editHistoryData, price_per_unit: e.target.value, total_price: (q * p).toFixed(2) });
                }} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Total Price (Rs)</label>
              <input className="form-control" type="number" step="0.01" value={editHistoryData.total_price} onChange={e => {
                const t = parseFloat(e.target.value) || 0;
                const q = parseFloat(editHistoryData.quantity) || 0;
                setEditHistoryData({ 
                  ...editHistoryData, 
                  total_price: e.target.value, 
                  price_per_unit: q > 0 ? (t / q).toFixed(2) : editHistoryData.price_per_unit 
                });
              }} />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsEditHistoryModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditHistorySubmit} disabled={saving}>
                {saving ? 'Saving...' : 'Update Batch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minus Stock Modal */}
      {isMinusModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setIsMinusModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MinusCircle size={20} color="#ff9800" /> Deduct Stock (Waste/Other)</h3>
              <button className="modal-close" onClick={() => setIsMinusModalOpen(false)}>✕</button>
            </div>
            
            <div className="form-group" style={{ marginBottom: 15 }}>
              <label>Select Batch (Optional)</label>
              <select className="form-control" value={minusData.stock_history_id} onChange={e => setMinusData({...minusData, stock_history_id: e.target.value})}>
                <option value="">-- Deduct from general stock --</option>
                {availableBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    Added {new Date(b.created_at).toLocaleDateString()} - {b.remaining_quantity} remaining (Orig: {b.quantity})
                  </option>
                ))}
              </select>
              <small style={{ color: 'var(--text-muted)' }}>If a batch is selected, it will reduce that batch's remaining quantity.</small>
            </div>

            <div style={{ background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Info size={15} color="#ff9800" />
              <span style={{ fontSize: 13, color: 'var(--text-main)' }}>
                <strong>{minusStockItem?.name}</strong> — currently <strong style={{ color: parseFloat(minusStockItem?.quantity) > 0 ? 'var(--green)' : '#ff4b4b' }}>{Number(minusStockItem?.quantity || 0).toFixed(3)} {minusStockItem?.unit}</strong> available
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: 15 }}>
              <label>Quantity to Deduct *</label>
              <input
                className="form-control"
                type="number"
                step="0.001"
                min="0.001"
                max={minusStockItem?.quantity || undefined}
                placeholder={`Max: ${Number(minusStockItem?.quantity || 0).toFixed(3)}`}
                value={minusData.quantity}
                onChange={e => setMinusData({...minusData, quantity: e.target.value})}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Reason *</label>
              <input className="form-control" placeholder="e.g. Spilled, Expired..." value={minusData.reason} onChange={e => setMinusData({...minusData, reason: e.target.value})} />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsMinusModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: '#ff9800', border: 'none' }} onClick={handleMinusSubmit} disabled={saving}>
                {saving ? 'Deducting...' : 'Confirm Deduction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

