import { useState } from 'react';
import { Plus } from 'lucide-react';
import axios from '../api';
import toast from 'react-hot-toast';
import { usePOS } from '../contexts/POSContext';

export default function AddCategoryModal({ setCategories, onClose, onCategoryAdded }) {
  const { loadData } = usePOS();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await axios.post('/api/categories', { name: name.trim() });
      setCategories(prev => [...prev, res.data]);
      toast.success(`Category "${res.data.name}" added!`);
      loadData(true);
      if (onCategoryAdded) onCategoryAdded(res.data);
      onClose();
    } catch (err) {
      toast.error('Failed to add category: ' + (err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose() }}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Plus size={20} /> Add New Category</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Category Name</label>
            <input 
              type="text" 
              className="form-control" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. Pasta, Burgers, etc."
              autoFocus 
            />
          </div>
          <div className="modal-footer" style={{ marginTop: 24 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
