import { useState, useEffect } from 'react';
import { Grid, Pencil, Trash2, Plus, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
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

  // Drag and drop states
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

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
  };

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
  };

  const handleAdd = async () => {
    if (!newName.trim()) return toast.error('Table number/name required');
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
  };

  const toggleBranch = (branch, isEdit = false) => {
    if (isEdit) {
      setEditBranches(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]);
    } else {
      setNewBranches(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]);
    }
  };

  // Save new order to backend
  const saveReorderedTables = async (newOrderedList) => {
    try {
      setIsSavingOrder(true);
      const tableIds = newOrderedList.map(t => t.id);
      await axios.put('/api/tables/reorder', { tableIds });
      if (onTableChange) onTableChange();
    } catch (err) {
      console.error('Failed to save table order:', err);
      toast.error('Failed to save order');
      fetchTables();
    } finally {
      setIsSavingOrder(false);
    }
  };

  // Move table up or down by 1 step
  const handleMove = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= tables.length) return;

    const updated = [...tables];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);

    setTables(updated);
    saveReorderedTables(updated);
  };

  // Drag and Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...tables];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, draggedItem);

    setTables(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
    saveReorderedTables(updated);
    toast.success('Table layout updated', { duration: 1500 });
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const visibleTables = tables.filter(t => !isAdmin || selectedBranch === 'All' || (t.available_branches || []).includes(selectedBranch));

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={e => { if(e.target.classList.contains('modal-overlay')) onClose() }}>
      <div className="modal" style={{ maxWidth: 540, width: '92%', borderRadius: 16 }}>
        <div className="modal-header" style={{ paddingBottom: 12 }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Grid size={20} color="var(--primary)" /> Manage & Reorder Tables
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Drag & drop rows or use arrows to set table numbers & order on POS screen
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--surface-2)' }}>
          {!isAdding ? (
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, fontWeight: 600 }} 
              onClick={() => setIsAdding(true)}
            >
              <Plus size={18} /> Add New Table
            </button>
          ) : (
            <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 10 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 700 }}>Add New Table</h4>
              <input 
                type="text" 
                placeholder="Table Name/Number (e.g. 1, 21, VIP, Outdoor 1)" 
                className="form-control" 
                value={newName} 
                onChange={e => setNewName(e.target.value)} 
                style={{ marginBottom: 12 }} 
                autoFocus
              />
              
              {isAdmin && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 600 }}>Available In Branches:</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {ALL_BRANCHES.map(b => (
                      <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', background: 'white', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--surface-2)' }}>
                        <input type="checkbox" checked={newBranches.includes(b)} onChange={() => toggleBranch(b)} /> {b}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAdd}>Save Table</button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsAdding(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '14px 16px' }}>
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Filter by Branch:</label>
              <select 
                value={selectedBranch} 
                onChange={e => setSelectedBranch(e.target.value)}
                className="form-control"
                style={{ maxWidth: 200, padding: '6px 12px', fontSize: 13 }}
              >
                <option value="All">All Branches</option>
                {ALL_BRANCHES.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Loading tables...</p>
          ) : visibleTables.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>No tables found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleTables.map((t, idx) => {
                const isDragging = draggedIndex === idx;
                const isOver = dragOverIndex === idx && draggedIndex !== idx;

                return (
                  <div 
                    key={t.id} 
                    draggable={editingId !== t.id}
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDrop={e => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      padding: '10px 12px', 
                      background: isDragging ? 'rgba(var(--primary-rgb), 0.08)' : 'var(--surface-1, #fff)',
                      border: isOver ? '2px dashed var(--primary)' : '1px solid var(--surface-2)', 
                      borderRadius: 10,
                      opacity: isDragging ? 0.5 : 1,
                      transform: isOver ? 'scale(1.01)' : 'none',
                      transition: 'transform 0.15s ease, border-color 0.15s ease, background 0.15s ease',
                      boxShadow: isDragging ? '0 8px 16px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    {editingId === t.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 26 }}>#{idx + 1}</span>
                          <input 
                            type="text" 
                            value={editName} 
                            onChange={e => setEditName(e.target.value)} 
                            placeholder="Table Name/Number"
                            className="form-control" 
                            style={{ padding: '6px 10px', fontSize: 14, flex: 1 }} 
                            autoFocus 
                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit(t.id)}
                          />
                        </div>
                        
                        {isAdmin && (
                          <div style={{ background: 'var(--surface-2)', padding: 8, borderRadius: 6 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, fontWeight: 600 }}>Branches:</label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {ALL_BRANCHES.map(b => (
                                <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                                  <input type="checkbox" checked={editBranches.includes(b)} onChange={() => toggleBranch(b, true)} /> {b}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="btn btn-sm btn-primary" style={{ padding: '6px 16px' }} onClick={() => handleSaveEdit(t.id)}>Save</button>
                          <button className="btn btn-sm btn-secondary" style={{ padding: '6px 14px' }} onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        {/* Drag handle & Order Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <div 
                            title="Drag to rearrange" 
                            style={{ 
                              cursor: 'grab', 
                              color: 'var(--text-muted)', 
                              display: 'flex', 
                              alignItems: 'center', 
                              padding: '4px 2px',
                              userSelect: 'none'
                            }}
                          >
                            <GripVertical size={18} />
                          </div>

                          <span 
                            style={{ 
                              fontSize: 11, 
                              fontWeight: 700, 
                              background: 'var(--surface-2)', 
                              color: 'var(--text-secondary)', 
                              padding: '2px 6px', 
                              borderRadius: 4, 
                              minWidth: 26, 
                              textAlign: 'center' 
                            }}
                          >
                            #{idx + 1}
                          </span>

                          <span 
                            style={{ 
                              fontWeight: 700, 
                              fontSize: 15, 
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {t.table_number}
                          </span>

                          {isAdmin && (
                            <span 
                              style={{ 
                                fontSize: 11, 
                                color: 'var(--text-muted)', 
                                marginLeft: 4,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              ({(t.available_branches || []).join(', ')})
                            </span>
                          )}
                        </div>

                        {/* Action buttons: Move Up, Move Down, Edit, Delete */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <button 
                            className="btn btn-sm btn-secondary" 
                            style={{ padding: '4px 6px', borderRadius: 6 }} 
                            disabled={idx === 0 || isSavingOrder} 
                            onClick={() => handleMove(idx, -1)} 
                            title="Move Up"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button 
                            className="btn btn-sm btn-secondary" 
                            style={{ padding: '4px 6px', borderRadius: 6 }} 
                            disabled={idx === visibleTables.length - 1 || isSavingOrder} 
                            onClick={() => handleMove(idx, 1)} 
                            title="Move Down"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button 
                            className="btn btn-sm btn-secondary" 
                            style={{ padding: '4px 8px', borderRadius: 6 }} 
                            onClick={() => { 
                              setEditingId(t.id); 
                              setEditName(t.table_number); 
                              setEditBranches(t.available_branches || []);
                            }}
                            title="Edit Table"
                          >
                            <Pencil size={14} />
                          </button>
                          <button 
                            className="btn btn-sm btn-danger" 
                            style={{ padding: '4px 8px', borderRadius: 6 }} 
                            onClick={() => handleDelete(t.id, t.table_number)}
                            title="Delete Table"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px', background: 'var(--surface-2)', borderTop: '1px solid var(--surface-2)', borderRadius: '0 0 16px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {visibleTables.length} {visibleTables.length === 1 ? 'table' : 'tables'} total
          </span>
          <button className="btn btn-primary" style={{ padding: '6px 18px', fontSize: 13 }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
