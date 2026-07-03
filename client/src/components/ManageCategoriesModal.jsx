import { useState } from 'react';
import { Folder, Pencil, Trash2 } from 'lucide-react';
import axios from '../api';
import toast from 'react-hot-toast';
import { usePOS } from '../contexts/POSContext';

export default function ManageCategoriesModal({ categories, setCategories, onClose, onCategoryChange }) {
  const { loadData } = usePOS()
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const handleDelete = (id, name) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Delete category <b>"{name}"</b>? Items in it will lose their category.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => toast.dismiss(t.id)}>Cancel</button>
          <button 
            className="btn btn-primary" 
            style={{ padding: '6px 12px', fontSize: 13, background: 'var(--red)', color: 'white' }} 
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await axios.delete(`/api/categories/${id}`);
                setCategories(prev => prev.filter(c => c.id !== id));
                toast.success('Category deleted');
                loadData(true);
                if (onCategoryChange) onCategoryChange();
              } catch (err) {
                toast.error('Failed to delete: ' + (err?.response?.data?.error || err.message));
              }
            }}
          >
            Yes, Delete
          </button>
        </div>
      </div>
    ), { duration: Infinity, id: 'delete-cat' });
  }

  const handleSave = async (id) => {
    if (!editName.trim()) return;
    try {
      const res = await axios.put(`/api/categories/${id}`, { name: editName.trim() });
      setCategories(prev => prev.map(c => c.id === id ? res.data : c));
      setEditingId(null);
      toast.success('Category updated');
      loadData(true);
      if (onCategoryChange) onCategoryChange();
    } catch (err) {
      toast.error('Failed to update: ' + (err?.response?.data?.error || err.message));
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={e => { if(e.target.classList.contains('modal-overlay')) onClose() }}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Folder size={20} /> Manage Categories</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {categories.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No categories found.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {categories.map(c => (
                <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--surface-2)' }}>
                  {editingId === c.id ? (
                    <div style={{ display: 'flex', gap: 8, flex: 1, marginRight: 12 }}>
                      <input 
                        type="text" 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)} 
                        className="form-control" 
                        style={{ padding: '4px 8px', fontSize: 13 }} 
                        autoFocus 
                        onKeyDown={e => e.key === 'Enter' && handleSave(c.id)}
                      />
                      <button className="btn btn-sm btn-primary" onClick={() => handleSave(c.id)}>✓</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm btn-secondary" style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }} onClick={() => { setEditingId(c.id); setEditName(c.name); }}><Pencil size={14} /></button>
                        <button className="btn btn-sm btn-danger" style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }} onClick={() => handleDelete(c.id, c.name)}><Trash2 size={14} /></button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
