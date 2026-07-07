import { useState } from 'react'
import axios from '../api'
import toast from 'react-hot-toast'
import { CURRENCY } from '../config'
import ManageCategoriesModal from '../components/ManageCategoriesModal'
import AddCategoryModal from '../components/AddCategoryModal'
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  MoreVertical 
} from 'lucide-react'

import { usePOS } from '../contexts/POSContext'

const SIZES = ['S', 'M', 'L' , 'XL', 'XXL', 'REGULAR']

const emptyForm = {
  name: '', category_id: '', price: '', image_url: '',
  size_options: [], status: 'Active',
}

const parseSizeOpt = (str, defaultPrice) => {
  const numDefault = parseFloat(defaultPrice) || 0;
  if (typeof str !== 'string') return { name: '', price: numDefault };
  if (str.includes(':')) {
    const [name, p] = str.split(':');
    return { name, price: parseFloat(p) || 0 };
  }
  return { name: str, price: numDefault };
};

export default function Inventory() {
  const {
    categories,
    setCategories,
    items,
    setItems,
    loading,
    inventoryCategory,
    setInventoryCategory,
    search,
    setSearch,
    loadData
  } = usePOS()

  // const [catFilter, setCatFilter] = useState('All') // Removed for persistence
  const [modal, setModal] = useState(null) // null | 'add' | 'edit'
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showManageCategories, setShowManageCategories] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [imgPreview, setImgPreview] = useState('')

  // Filter items locally for the table
  const filteredItems = items.filter(item => {
    const matchesCategory = inventoryCategory === 'All' || item.category_name === inventoryCategory || item.category === inventoryCategory;
    const matchesSearch = !search || 
      item.name.toLowerCase().includes(search.toLowerCase()) || 
      (item.category_name && item.category_name.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const openAdd = () => {
    setForm(emptyForm)
    setImgPreview('')
    setModal('add')
  }

  const openEdit = item => {
    setForm({
      name: item.name,
      category_id: item.category_id,
      price: item.price,
      image_url: item.image_url,
      size_options: item.size_options || [],
      status: item.status,
      _id: item.id,
    })
    setImgPreview(item.image_url || '')
    setModal('edit')
  }

  const closeModal = () => { setModal(null); setForm(emptyForm); setImgPreview('') }

  const toggleSize = s => {
    setForm(f => {
      const existing = f.size_options.find(x => parseSizeOpt(x, 0).name === s);
      if (existing) {
        return { ...f, size_options: f.size_options.filter(x => x !== existing) };
      } else {
        return { ...f, size_options: [...f.size_options, `${s}:${f.price || 0}`] };
      }
    });
  }

  const updateSizePrice = (s, price) => {
    setForm(f => ({
      ...f,
      size_options: f.size_options.map(x => {
        if (parseSizeOpt(x, 0).name === s) return `${s}:${price}`;
        return x;
      })
    }));
  }

  const handleSave = async () => {
    if (!form.name) return toast.error('Item name is required')
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        category_id: form.category_id || null,
        price: parseFloat(form.price) || 0,
        image_url: form.image_url || '',
        size_options: form.size_options,
        status: form.status,
      }
      if (modal === 'add') {
        const addRes = await axios.post('/api/items', payload)
        // Optimistic append to items list quickly to prevent flashing empty
        setItems(prev => [...prev, addRes.data])
      } else {
        const putRes = await axios.put(`/api/items/${form._id}`, payload)
        setItems(prev => prev.map(i => i.id === form._id ? putRes.data : i))
      }
      closeModal()
      await loadData(true)
      toast.success(modal === 'add' ? 'Item Added' : 'Item Updated')
    } catch (err) {
      toast.error('Save failed: ' + (err?.response?.data?.error || err.message))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = id => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
          Are you sure you want to delete this item?
        </span>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-sm btn-secondary"
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => toast.dismiss(t.id)}
          >
            Cancel
          </button>
          <button
            className="btn btn-sm btn-danger"
            style={{ padding: '4px 10px', fontSize: '12px', background: 'var(--red)', color: 'white', border: 'none' }}
            onClick={async () => {
              toast.dismiss(t.id);
              const loadingToast = toast.loading('Deleting...');
              try {
                await axios.delete(`/api/items/${id}`);
                setItems(prev => prev.filter(i => i.id !== id));
                toast.success('Item deleted', { id: loadingToast });
                await loadData(true);
              } catch (err) {
                toast.error('Delete failed: ' + (err?.response?.data?.error || err.message), { id: loadingToast });
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
    ), {
      duration: 6000,
      position: 'top-center',
    });
  }

  return (
    <>
      {/* Toolbar */}
      <div className="inventory-toolbar">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search items..."
            style={{ paddingLeft: 34 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={inventoryCategory} onChange={e => setInventoryCategory(e.target.value)}>
          <option value="All">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <button className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #ff9800, #ff4b4b)', color: 'white', border: 'none' }} onClick={openAdd}>
          <Plus size={18} /> Add New Item
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Image</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Sizes & Prices</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 18, width: '80%', borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                : filteredItems.map(item => (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{item.id}</td>
                      <td>
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="item-img"
                            onError={e => { e.target.style.display = 'none' }}
                          />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                            No Img
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td>
                        <span className="badge badge-info">{item.category_name || '—'}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(item.size_options && item.size_options.length > 0) ? (
                            item.size_options.map(s => {
                               const { name, price } = parseSizeOpt(s, item.price);
                               return (
                                 <span key={name} className="badge badge-warning" style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                   {name}: {price.toFixed(2)}
                                 </span>
                               )
                            })
                          ) : (
                               <span className="badge badge-warning" style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                 {CURRENCY}{parseFloat(item.price).toFixed(2)}
                               </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${item.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-sm btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => openEdit(item)}><Edit size={14} /> Edit</button>
                          <button className="btn btn-sm btn-danger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => handleDelete(item.id)}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))
              }
              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    No items found. Click "Add New Item" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) closeModal() }}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {modal === 'add' ? <><Plus size={20} /> Add New Item</> : <><Edit size={20} /> Edit Item</>}
              </h3>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Item Name *</label>
                <input className="form-control" placeholder="e.g. Margherita Classic" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Regular Price ({CURRENCY})</label>
                <input className="form-control" type="number" step="0.01" placeholder="0.00 (optional)" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Category
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button 
                      type="button" 
                      className="btn btn-sm" 
                      style={{ padding: '0 4px', fontSize: 11, color: 'var(--red)', background: 'transparent' }}
                      onClick={() => setShowAddCategory(true)}
                    >
                      + New
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-sm" 
                      style={{ padding: '0 4px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', display: 'flex', alignItems: 'center' }}
                      title="Manage Categories"
                      onClick={() => setShowManageCategories(true)}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </label>
                <select className="form-control" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Image URL</label>
              <input
                className="form-control"
                placeholder="https://..."
                value={form.image_url}
                onChange={e => { setForm(f => ({ ...f, image_url: e.target.value })); setImgPreview(e.target.value) }}
              />
              {imgPreview && (
                <img
                  src={imgPreview}
                  alt="Preview"
                  style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginTop: 8 }}
                  onError={e => { e.target.style.display = 'none' }}
                />
              )}
            </div>

            <div className="form-group">
              <label>Size Options & Specific Prices</label>
              <div className="size-checkboxes" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {SIZES.map(s => {
                  const optStr = form.size_options.find(x => parseSizeOpt(x, 0).name === s);
                  const isChecked = !!optStr;
                  const optPrice = isChecked ? parseSizeOpt(optStr, form.price).price : parseFloat(form.price) || 0;
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        className={`size-check ${isChecked ? 'checked' : ''}`}
                        onClick={() => toggleSize(s)}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minWidth: 60 }}
                      >
                        <input type="checkbox" checked={isChecked} readOnly />
                        <span style={{ fontWeight: 600 }}>{s}</span>
                      </div>
                      {isChecked && (
                        <input 
                          type="number" 
                          step="0.01"
                          className="form-control" 
                          style={{ width: 120, padding: '4px 8px' }}
                          value={optPrice} 
                          onChange={e => updateSizePrice(s, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          placeholder="Price"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : modal === 'add' ? <><Plus size={18} /> Add Item</> : <><CheckCircle2 size={18} /> Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {showManageCategories && (
        <ManageCategoriesModal 
          categories={categories} 
          setCategories={setCategories} 
          onClose={() => setShowManageCategories(false)} 
          onCategoryChange={() => loadData()}
        />
      )}
      {showAddCategory && (
        <AddCategoryModal 
          categories={categories}
          setCategories={setCategories}
          onClose={() => setShowAddCategory(false)}
          onCategoryAdded={(cat) => setForm(f => ({ ...f, category_id: cat.id }))}
        />
      )}
    </>
  )
}
