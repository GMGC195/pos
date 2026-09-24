import { useState, useEffect } from 'react'
import { Plus, Trash2, Search, ChefHat, ArrowLeft, Tag, LayoutList, Pencil, Database, MinusCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from '../api'

export default function ProductCostManagement() {
  const [items, setItems] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Recipe Detail State
  const [selectedItem, setSelectedItem] = useState(null)
  const [recipeData, setRecipeData] = useState({ ingredients: [], totalCost: 0, sizeCosts: {}, sizeOptions: [] })
  const [recipeLoading, setRecipeLoading] = useState(false)

  // Add Ingredient Form
  const [ingredientForm, setIngredientForm] = useState({ stock_id: '', quantity_input: '', size_label: '' })

  // Edit Ingredient State
  const [editingIngredient, setEditingIngredient] = useState(null)
  const [editForm, setEditForm] = useState({ quantity_input: '', size_label: '' })

  // Bulk Add Ingredients State
  const [selectedStocks, setSelectedStocks] = useState([]) // Array of stock objects with quantity_input


  useEffect(() => {
    fetchItems()
    fetchStockItems()
  }, [])

  const fetchItems = async () => {
    try {
      const res = await axios.get('/api/items')
      setItems(res.data)
    } catch {
      toast.error('Could not load menu items.')
    } finally {
      setLoading(false)
    }
  }

  const fetchStockItems = async () => {
    try {
      const res = await axios.get('/api/stock?_t=' + Date.now())
      setStockItems(res.data)
    } catch {
      console.error('Failed to load stock')
    }
  }

  const handleOpenRecipe = async (item) => {
    setSelectedItem(item)
    setIngredientForm({ stock_id: '', quantity_input: '', size_label: '' })
    await fetchRecipe(item.id)
  }

  const handleCloseRecipe = () => {
    setSelectedItem(null)
    setRecipeData({ ingredients: [], totalCost: 0, sizeCosts: {}, sizeOptions: [] })
    setSearch('')
  }

  const fetchRecipe = async (itemId) => {
    setRecipeLoading(true)
    try {
      const res = await axios.get(`/api/recipes/${itemId}?_t=${Date.now()}`)
      setRecipeData({
        ingredients: res.data.ingredients,
        totalCost: res.data.totalCost,
        sizeCosts: res.data.sizeCosts || {},
        sizeOptions: res.data.sizeOptions || []
      })
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message)
    } finally {
      setRecipeLoading(false)
    }
  }

  // Helper to parse "Name:Price"
  const parseSizeOpt = (str) => {
    if (typeof str !== 'string') return { name: '', price: parseFloat(selectedItem?.price) || 0 };
    if (str.includes(':')) {
      const [name, p] = str.split(':');
      return { name, price: parseFloat(p) || parseFloat(selectedItem?.price) || 0 };
    }
    return { name: str, price: parseFloat(selectedItem?.price) || 0 };
  };

  const rawSizes = selectedItem?.size_options || []
  const sizes = rawSizes.map(s => parseSizeOpt(s).name)
  const hasSizes = sizes.length > 0

  const toggleStockSelection = (stock) => {
    const isSelected = selectedStocks.some(s => s.stock_id === stock.id)
    if (isSelected) {
      setSelectedStocks(prev => prev.filter(s => s.stock_id !== stock.id))
    } else {
      if (hasSizes) {
        const newEntries = sizes.map(size => ({
          unique_id: `${stock.id}-${size}`,
          stock_id: stock.id,
          name: stock.name,
          unit: stock.unit,
          price_per_unit: stock.price_per_unit,
          size_label: size,
          quantity_input: ''
        }))
        setSelectedStocks(prev => [...prev, ...newEntries])
      } else {
        setSelectedStocks(prev => [...prev, {
          unique_id: `${stock.id}-nosize`,
          stock_id: stock.id,
          name: stock.name,
          unit: stock.unit,
          price_per_unit: stock.price_per_unit,
          size_label: null,
          quantity_input: ''
        }])
      }
    }
  }

  const updateSelectedStockQuantity = (unique_id, val) => {
    setSelectedStocks(prev => prev.map(s => s.unique_id === unique_id ? { ...s, quantity_input: val } : s))
  }

  const removeSelectedRow = (unique_id) => {
    setSelectedStocks(prev => prev.filter(s => s.unique_id !== unique_id))
  }

  const handleBulkAddIngredients = async (e) => {
    e.preventDefault()
    if (selectedStocks.length === 0) return toast.error('Please select at least one ingredient')

    const validRows = selectedStocks.filter(s => {
      const q = parseFloat(s.quantity_input)
      return !isNaN(q) && q > 0
    })
    const emptyCount = selectedStocks.length - validRows.length

    if (validRows.length === 0) {
      return toast.error('All selected fields are empty!')
    }

    const saveValid = async (tid) => {
      if (tid) toast.dismiss(tid)
      try {
        const items = validRows.map(s => {
          let qty = parseFloat(s.quantity_input)
          if (s.unit === 'kg') qty = qty / 1000
          return {
            item_id: selectedItem.id,
            stock_id: s.stock_id,
            quantity_used: qty,
            size_label: s.size_label
          }
        })
        await axios.post('/api/recipes/bulk', { items })
        toast.success(`${items.length} ingredient(s) added!`)
        setSelectedStocks([])
        fetchRecipe(selectedItem.id)
      } catch (err) {
        toast.error(err?.response?.data?.error || err.message)
      }
    }

    if (emptyCount > 0) {
      toast((t) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{emptyCount} field(s) empty!</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Do you want to save the filled items without them?</span>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 5 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => toast.dismiss(t.id)}>Cancel</button>
            <button className="btn btn-sm btn-primary" style={{ background: 'var(--red)', border: 'none' }} onClick={() => saveValid(t.id)}>Save Filled Only</button>
          </div>
        </div>
      ), { duration: Infinity, id: 'bulk-recipe-empty-confirm' })
    } else {
      saveValid()
    }
  }

  const handleRemoveIngredient = async (recipeId) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 200 }}>
        <span style={{ fontWeight: 500 }}>Remove ingredient from recipe?</span>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 5 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => toast.dismiss(t.id)} style={{ padding: '4px 10px', fontSize: 13 }}>Cancel</button>
          <button className="btn btn-sm btn-danger" onClick={async () => {
            toast.dismiss(t.id)
            try {
              await axios.delete(`/api/recipes/${recipeId}`)
              toast.success('Ingredient removed')
              fetchRecipe(selectedItem.id)
            } catch (err) {
              toast.error(err?.response?.data?.error || err.message)
            }
          }} style={{ padding: '4px 10px', fontSize: 13 }}>Remove</button>
        </div>
      </div>
    ), { duration: Infinity, id: 'remove-ingredient' })
  }

  const handleOpenEdit = (ing) => {
    setEditingIngredient(ing)
    setEditForm({
      quantity_input: ing.unit === 'kg'
        ? String(Math.round(Number(ing.quantity_used) * 1000))
        : String(Number(ing.quantity_used)),
      size_label: ing.size_label || ''
    })
  }

  const handleUpdateIngredient = async (e) => {
    e.preventDefault()
    const raw = parseFloat(editForm.quantity_input)
    if (isNaN(raw) || raw <= 0) return toast.error('Enter a valid quantity')
    const qty = editingIngredient.unit === 'kg' ? raw / 1000 : raw
    try {
      await axios.put(`/api/recipes/${editingIngredient.id}`, {
        quantity_used: qty,
        size_label: editForm.size_label || null
      })
      toast.success('Ingredient updated!')
      setEditingIngredient(null)
      fetchRecipe(selectedItem.id)
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message)
    }
  }

  // Group ingredients by size_label
  const groupedIngredients = () => {
    const groups = {}
    recipeData.ingredients.forEach(ing => {
      const key = ing.size_label || '__all__'
      if (!groups[key]) groups[key] = []
      groups[key].push(ing)
    })
    const ordered = {}
    if (groups['__all__']) ordered['__all__'] = groups['__all__']
    ;(recipeData.sizeOptions || []).forEach(size => {
      if (groups[size]) ordered[size] = groups[size]
    })
    Object.keys(groups).forEach(k => { if (!ordered[k]) ordered[k] = groups[k] })
    return ordered
  }

  // ─── DETAIL VIEW ─────────────────────────────────────────────────────

  if (selectedItem) {
    const grouped = groupedIngredients()

    return (
      <div className="product-cost-detail">
        {/* Header */}
        <div className="inventory-toolbar" style={{ marginBottom: 20 }}>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleCloseRecipe}>
            <ArrowLeft size={18} /> Back to Menu Items
          </button>
          <h2 style={{ margin: '0 auto', color: 'var(--text-primary)', fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ChefHat color="var(--red)" /> Recipe Builder: {selectedItem.name}
          </h2>
          {hasSizes && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {sizes.map(s => (
                <span key={s} style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: 'rgba(227,24,55,0.1)', color: 'var(--red)', border: '1px solid rgba(227,24,55,0.25)'
                }}>{s}</span>
              ))}
            </div>
          )}
        </div>

        {/* Add Ingredient Card */}
        <div className="card">
          <h3 style={{ marginBottom: 20, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={18} color="var(--red)" /> Add Components
          </h3>
          
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {/* Checkbox List */}
            <div style={{ flex: '1 1 300px', maxWidth: 400 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Select Stock Ingredients</label>
              <div style={{ 
                maxHeight: 250, overflowY: 'auto', border: '1px solid var(--surface-2)', 
                borderRadius: 8, padding: 10, background: 'var(--surface)' 
              }}>
                {stockItems.map(stock => (
                  <label key={stock.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', cursor: 'pointer', borderRadius: 4, transition: 'background 0.2s', ':hover': { background: 'white' } }}>
                    <input 
                      type="checkbox" 
                      style={{ width: 16, height: 16, accentColor: 'var(--red)', cursor: 'pointer' }}
                      checked={selectedStocks.some(s => s.stock_id === stock.id)}
                      onChange={() => toggleStockSelection(stock)}
                    />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{stock.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>SAR {Number(stock.price_per_unit).toFixed(2)} / {stock.unit}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Selected Inputs Form */}
            <div style={{ flex: '2 1 400px' }}>
              {selectedStocks.length > 0 ? (
                <form onSubmit={handleBulkAddIngredients}>
                  <div style={{ marginBottom: 15 }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Enter Quantities</label>
                    {selectedStocks.map(stock => (
                      <div key={stock.unique_id} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, background: 'var(--surface)', padding: '8px 12px', borderRadius: 8 }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{stock.name}</span>
                          {stock.size_label && (
                            <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700, textTransform: 'uppercase' }}>
                              Size: {stock.size_label}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input 
                            className="form-control"
                            type="number"
                            step={stock.unit === 'kg' ? '1' : '0.01'}
                            min="0"
                            placeholder={stock.unit === 'kg' ? 'grams' : 'pieces'}
                            style={{ width: 120, fontSize: 13 }}
                            value={stock.quantity_input}
                            onChange={e => updateSelectedStockQuantity(stock.unique_id, e.target.value)}
                          />
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 30, fontWeight: 500 }}>{stock.unit === 'kg' ? 'g' : 'pcs'}</span>
                          <button 
                            type="button" 
                            className="btn btn-sm" 
                            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', padding: '6px' }}
                            onClick={() => removeSelectedRow(stock.unique_id)}
                            title="Remove"
                          >
                            <MinusCircle size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--red)', border: 'none', color: 'white' }}>
                    <Plus size={18} /> Save {selectedStocks.filter(s => s.quantity_input > 0).length || selectedStocks.length} Item(s)
                  </button>
                </form>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '2px dashed var(--surface-2)', borderRadius: 12, minHeight: 200 }}>
                  <Database size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
                  <span>Check ingredients from the list</span>
                  <span style={{ fontSize: 12 }}>to enter quantities</span>
                </div>
              )}
            </div>
          </div>

          {hasSizes && (
            <p style={{ marginTop: 20, marginBottom: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              💡 <strong>All Sizes</strong> = ingredients shared across all sizes. Select a specific size to set different quantities per size variant.
            </p>
          )}
        </div>

        {/* Ingredients Table */}
        <div className="card" style={{ marginTop: 20, padding: 0 }}>
          <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <LayoutList size={18} color="var(--red)" />
            <h3 style={{ fontSize: 16, margin: 0 }}>Recipe Ingredients</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {hasSizes && <th style={{ width: 110 }}>Size</th>}
                  <th>Ingredient</th>
                  <th>Quantity Used</th>
                  <th>Cost / Unit</th>
                  <th>Ingredient Cost</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipeLoading ? (
                  <tr><td colSpan={hasSizes ? 6 : 5} style={{ textAlign: 'center', padding: 20 }}>Loading recipe...</td></tr>
                ) : recipeData.ingredients.length === 0 ? (
                  <tr><td colSpan={hasSizes ? 6 : 5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>
                    No ingredients added yet. Use the form above to build this recipe.
                  </td></tr>
                ) : hasSizes
                  // Grouped by size
                  ? Object.entries(grouped).map(([sizeKey, ings]) => (
                      [
                        <tr key={`header-${sizeKey}`} style={{ background: 'var(--surface)' }}>
                          <td colSpan={6} style={{ padding: '8px 16px' }}>
                            <span style={{
                              fontWeight: 700, fontSize: 11, letterSpacing: 0.8,
                              color: sizeKey === '__all__' ? 'var(--text-secondary)' : 'var(--red)',
                              textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5
                            }}>
                              <Tag size={11} />
                              {sizeKey === '__all__' ? 'All Sizes — shared ingredient' : sizeKey}
                            </span>
                          </td>
                        </tr>,
                        ...ings.map(ing => {
                          const displayQty = ing.unit === 'kg'
                            ? `${Number(ing.quantity_used) * 1000} g`
                            : `${Number(ing.quantity_used)} pcs`
                          return (
                            <tr key={ing.id}>
                              <td>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                                  background: ing.size_label ? 'rgba(227,24,55,0.08)' : 'rgba(156,163,175,0.12)',
                                  color: ing.size_label ? 'var(--red)' : 'var(--text-secondary)'
                                }}>
                                  {ing.size_label || 'All Sizes'}
                                </span>
                              </td>
                              <td style={{ fontWeight: 500 }}>{ing.stock_name}</td>
                              <td><span className="badge badge-info">{displayQty}</span></td>
                              <td style={{ color: 'var(--text-secondary)' }}>SAR {Number(ing.price_per_unit).toFixed(2)} / {ing.unit}</td>
                              <td style={{ color: 'var(--red)', fontWeight: 'bold' }}>SAR {Number(ing.ingredient_cost).toFixed(2)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button className="btn btn-sm btn-secondary" title="Edit" onClick={() => handleOpenEdit(ing)} style={{ padding: '5px 8px' }}><Pencil size={14} /></button>
                                  <button className="btn btn-sm btn-danger" title="Remove" onClick={() => handleRemoveIngredient(ing.id)} style={{ padding: '5px 8px' }}><Trash2 size={14} /></button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      ]
                    ))
                  // Flat list (no sizes)
                  : recipeData.ingredients.map(ing => {
                      const displayQty = ing.unit === 'kg'
                        ? `${Number(ing.quantity_used) * 1000} g`
                        : `${Number(ing.quantity_used)} pcs`
                      return (
                        <tr key={ing.id}>
                          <td style={{ fontWeight: 500 }}>{ing.stock_name}</td>
                          <td><span className="badge badge-info">{displayQty}</span></td>
                          <td style={{ color: 'var(--text-secondary)' }}>SAR {Number(ing.price_per_unit).toFixed(2)} / {ing.unit}</td>
                          <td style={{ color: 'var(--red)', fontWeight: 'bold' }}>SAR {Number(ing.ingredient_cost).toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-sm btn-secondary" title="Edit" onClick={() => handleOpenEdit(ing)} style={{ padding: '5px 8px' }}><Pencil size={14} /></button>
                              <button className="btn btn-sm btn-danger" title="Remove" onClick={() => handleRemoveIngredient(ing.id)} style={{ padding: '5px 8px' }}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>

          {/* Cost Summary */}
          {!recipeLoading && (
            <div style={{ padding: '20px 25px', borderTop: '1px solid var(--surface-2)', background: 'var(--surface)' }}>

              {/* Per-size cost cards */}
              {hasSizes && Object.keys(recipeData.sizeCosts).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                    Production Cost & Profit Per Size
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {rawSizes.map(rawSizeStr => {
                      const { name, price: sellingPrice } = parseSizeOpt(rawSizeStr)
                      const productionCost = Number(recipeData.sizeCosts[name] || recipeData.sizeCosts['__all__'] || 0)
                      const profit = sellingPrice - productionCost
                      return (
                        <div key={name} style={{
                          flex: 1, minWidth: 150, background: 'white',
                          border: '1px solid var(--surface-2)', borderRadius: 12,
                          padding: '14px 18px', textAlign: 'center',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{name}</div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Price: SAR {sellingPrice.toFixed(2)}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#ff6b6b' }}>Cost: SAR {productionCost.toFixed(2)}</div>
                          <div style={{ fontSize: 12, color: profit >= 0 ? '#10b981' : '#ef4444', marginTop: 8, fontWeight: 700, background: profit >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', padding: '4px', borderRadius: '6px' }}>
                            {profit >= 0 ? 'Profit' : 'Loss'}: SAR {profit.toFixed(2)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Single total for no-size items */}
              {!hasSizes && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)' }}>Total Cost to Produce</span>
                    <span style={{ fontSize: 18, fontWeight: 'bold', color: '#ff6b6b' }}>SAR {Number(recipeData.totalCost).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)' }}>Sale Price</span>
                    <span style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--text-primary)' }}>SAR {Number(selectedItem.price).toFixed(2)}</span>
                  </div>
                  <div style={{ paddingTop: 15, borderTop: '1px dashed var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Revenue / Profit</span>
                    <span style={{ fontSize: 26, fontWeight: 'bold', color: '#10b981' }}>
                      SAR {(Number(selectedItem.price) - Number(recipeData.totalCost)).toFixed(2)}
                    </span>
                  </div>
                </>
              )}

              {/* Base price note for sized items */}
              {hasSizes && (
                <div style={{ paddingTop: 14, borderTop: '1px dashed var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Base Sale Price (default from menu)</span>
                  <span style={{ fontSize: 17, fontWeight: 'bold', color: 'var(--text-primary)' }}>SAR {Number(selectedItem.price).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <EditModal />
      </div>
    )
  }

  // ─── MAIN LIST VIEW ──────────────────────────────────────────────────
  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="inventory-toolbar">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search menu items to view recipes..."
            style={{ paddingLeft: 34 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Menu Item</th>
                <th>Selling Price</th>
                <th>Sizes</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Recipe Management</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j}>
                        <div className="skeleton" style={{ height: 18, width: j === 4 ? '40%' : '80%', borderRadius: 4, marginLeft: j === 4 ? 'auto' : 0 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No menu items found.</td></tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td style={{ color: '#10b981', fontWeight: 500 }}>SAR {item.price}</td>
                    <td>
                      {item.size_options?.length > 0
                        ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {item.size_options.map(s => (
                              <span key={s} style={{
                                padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                                background: 'rgba(227,24,55,0.08)', color: 'var(--red)'
                              }}>{s}</span>
                            ))}
                          </div>
                        : <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
                      }
                    </td>
                    <td>
                      <span style={{
                        background: item.status === 'Active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        color: item.status === 'Active' ? '#10b981' : '#ef4444',
                        padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600
                      }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => handleOpenRecipe(item)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ChefHat size={14} /> View ingredients
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )

  function EditModal() {
    if (!editingIngredient) return null

    // Live calculation for the modal preview
    const qtyRaw = parseFloat(editForm.quantity_input) || 0
    const qtyFactor = editingIngredient.unit === 'kg' ? qtyRaw / 1000 : qtyRaw
    const estCost = qtyFactor * Number(editingIngredient.price_per_unit || 0)

    return (
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={e => { if (e.currentTarget === e.target) setEditingIngredient(null) }}
      >
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 460,
          boxShadow: '0 25px 70px rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.4)',
          position: 'relative', overflow: 'hidden'
        }}>
          {/* Decorative highlight */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, var(--red), var(--orange))' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)' }}>
              <div style={{ padding: 8, background: 'rgba(227,24,55,0.1)', borderRadius: 10, display: 'flex' }}>
                <Pencil size={18} color="var(--red)" />
              </div>
              Edit Ingredient
            </h3>
            <button
              className="modal-close"
              onClick={() => setEditingIngredient(null)}
              style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'var(--surface)', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: '12px 16px', background: 'var(--surface)', borderRadius: 12, marginBottom: 20, fontSize: 13, border: '1px solid var(--surface-2)' }}>
            <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>Ingredient Name</div>
            <strong style={{ color: 'var(--text-primary)', fontSize: 15 }}>{editingIngredient.stock_name}</strong>
            <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>
              Rate: SAR {Number(editingIngredient.price_per_unit).toFixed(2)} / {editingIngredient.unit}
            </div>
          </div>

          <form onSubmit={handleUpdateIngredient}>
            {hasSizes && (
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  <Tag size={14} color="var(--text-secondary)" /> Size Slot
                </label>
                <select
                  className="form-control"
                  style={{ height: 45, borderRadius: 10, border: '1.5px solid var(--surface-2)' }}
                  value={editForm.size_label}
                  onChange={e => setEditForm(f => ({ ...f, size_label: e.target.value }))}
                >
                  <option value="">All Sizes</option>
                  {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 28 }}>
              <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'block' }}>
                Quantity ({editingIngredient.unit === 'kg' ? 'grams' : 'pieces'}) *
              </label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input
                  className="form-control"
                  type="number"
                  step="any"
                  min="0"
                  required
                  autoFocus
                  style={{ height: 48, fontSize: 16, fontWeight: 600, borderRadius: 10, border: '1.5px solid var(--surface-2)', padding: '0 15px' }}
                  placeholder="0"
                  value={editForm.quantity_input}
                  onChange={e => setEditForm(f => ({ ...f, quantity_input: e.target.value }))}
                />
                <div style={{
                  padding: '12px 18px', background: 'var(--surface)', borderRadius: 10,
                  fontWeight: 700, color: 'var(--red)', border: '1.5px solid var(--surface-2)', minWidth: 70, textAlign: 'center'
                }}>
                  {editingIngredient.unit === 'kg' ? 'g' : 'pcs'}
                </div>
              </div>
            </div>

            {/* Premium Cost Preview Card */}
            <div style={{
              background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 14, padding: '16px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, color: 'white',
              boxShadow: '0 10px 20px rgba(16,185,129,0.2)'
            }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Estimated Cost</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>SAR {estCost.toFixed(2)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700 }}>VERIFIED</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingIngredient(null)}
                style={{ height: 45, padding: '0 20px', borderRadius: 10, fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  background: 'var(--red)', border: 'none', color: '#fff',
                  height: 45, padding: '0 24px', borderRadius: 10, fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(227, 24, 55, 0.2)'
                }}
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }
}
