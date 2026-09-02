import { useState, useEffect } from 'react';
import { Grid, Pencil, Trash2, Plus } from 'lucide-react';
import axios from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export default function ManageTablesModal({ onClose, onTableChange }) {
  const { user } = useAuth();
  const isAdmin = ['admin', 'developer'].includes(user?.role?.toLowerCase());
  
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editBranches, setEditBranches] = useState([]);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBranches, setNewBranches] = useState(isAdmin ? ['Branch 1', 'Branch 2', 'Branch 3'] : [user?.branch]);

  // Use fixed branches for now as in Items
  const ALL_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3'];
  const [selectedBranch, setSelectedBranch] = useState('All');

  const fetchTables = async () => {
    try {
      setLoading(true);
      const res = await axios.get(isAdmin ? '/api/tables/all' : '/api/tables');
      setTables(res.data);
    } catch (err) {
      toast.error('Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, [isAdmin]);

  const handleDelete = (id, name) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Delete table <b>"{name}"</b>?</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => toast.dismiss(t.id)}>Cancel</button>
          <button 
            className="btn btn-primary" 
            style={{ padding: '6px 12px', fontSize: 13, background: 'var(--red)', color: 'white' }} 
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await axios.delete(`/api/tables/${id}`);
                setTables(prev => prev.filter(t => t.id !== id));
                toast.success('Table deleted');
                if (onTableChange) onTableChange();
              } catch (err) {
                toast.error('Failed to delete: ' + (err?.response?.data?.error || err.message));
              }
            }}
          >
            Yes, Delete
          </button>
        </div>
      </div>
    ), { duration: Infinity, id: 'delete-table' });
  }

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    try {
      const payload = { table_number: editName.trim() };
      if (isAdmin) payload.available_branches = editBranches;

      const res = await axios.put(`/api/tables/${id}`, payload);
      setTables(prev => prev.map(t => t.id === id ? res.data : t));
      setEditingId(null);
      toast.success('Table updated');
      if (onTableChange) onTableChange();
    } catch (err) {
      toast.error('Failed to update: ' + (err?.response?.data?.error || err.message));
    }
  }

  const handleAdd = async () => {
    if (!newName.trim()) return toast.error('Table number required');
    if (isAdmin && newBranches.length === 0) return toast.error('Select at least one branch');

    try {
      const res = await axios.post('/api/tables', {
        table_number: newName.trim(),
        available_branches: isAdmin ? newBranches : undefined // backend handles operator branch default
      });
      setTables([...tables, res.data]);
      setIsAdding(false);
      setNewName('');
      toast.success('Table added successfully');
      if (onTableChange) onTableChange();
    } catch (err) {
      toast.error('Failed to add: ' + (err?.response?.data?.error || err.message));
    }
  }

  const toggleBranch = (branch, isEdit = false) => {
    if (isEdit) {
      setEditBranches(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]);
    } else {
      setNewBranches(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={e => { if(e.target.classList.contains('modal-overlay')) onClose() }}>
      <div className="modal" style={{ maxWidth: 500, width: '90%' }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Grid size={20} /> Manage Tables</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div style={{ padding: '16px', borderBottom: '1px solid var(--surface-2)' }}>
          {!isAdding ? (
            <button className="btn btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} onClick={() => setIsAdding(true)}>
              <Plus size={16} /> Add New Table
            </button>
          ) : (
            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Add Table</h4>
              <input 
                type="text" 
                placeholder="Table Number/Name (e.g. 21)" 
                className="form-control" 
                value={newName} 
                onChange={e => setNewName(e.target.value)} 
                style={{ marginBottom: 12 }} 
                autoFocus
              />
              
              {isAdmin && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Available In Branches:</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {ALL_BRANCHES.map(b => (
                      <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={newBranches.includes(b)} onChange={() => toggleBranch(b)} /> {b}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAdd}>Save</button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsAdding(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: '16px' }}>
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Filter by Branch:</label>
              <select 
                value={selectedBranch} 
                onChange={e => setSelectedBranch(e.target.value)}
                className="form-control"
                style={{ flex: 1, maxWidth: 200, padding: '6px 12px', fontSize: 13 }}
              >
                <option value="All">All Branches</option>
                {ALL_BRANCHES.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading tables...</p>
          ) : tables.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No tables found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tables.filter(t => !isAdmin || selectedBranch === 'All' || (t.available_branches || []).includes(selectedBranch)).map(t => (
                <div key={t.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px', border: '1px solid var(--surface-2)', borderRadius: 8 }}>
                  {editingId === t.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <input 
                        type="text" 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)} 
                        className="form-control" 
                        style={{ padding: '6px 8px', fontSize: 13 }} 
                        autoFocus 
                        onKeyDown={e => e.key === 'Enter' && handleSaveEdit(t.id)}
                      />
                      
                      {isAdmin && (
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Branches:</label>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {ALL_BRANCHES.map(b => (
                              <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                                <input type="checkbox" checked={editBranches.includes(b)} onChange={() => toggleBranch(b, true)} /> {b}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => handleSaveEdit(t.id)}>Save</button>
                        <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>Table {String(t.table_number).replace(/^Table\s*/i, '')}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }} onClick={() => { 
                            setEditingId(t.id); 
                            setEditName(t.table_number); 
                            setEditBranches(t.available_branches || []);
                          }}><Pencil size={14} /></button>
                          <button className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleDelete(t.id, t.table_number)}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      {isAdmin && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                          Available in: {(t.available_branches || []).join(', ')}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
