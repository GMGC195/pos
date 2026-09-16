import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2 } from 'lucide-react';
import { CURRENCY } from '../config';
import toast from 'react-hot-toast';
import axios from '../api';

const EmployeeAdjustmentsModal = ({ employee, isOpen, onClose, onUpdate }) => {
  const [adjustments, setAdjustments] = useState([]);
  const [recurringAdjustments, setRecurringAdjustments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [notification, setNotification] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const showNotification = (msg, type = 'success') => {
    setNotification({ text: msg, type });
    setTimeout(() => {
      setNotification((current) => current?.text === msg ? null : current);
    }, 3000);
  };

  // View state
  const [tab, setTab] = useState('one-time'); // 'one-time' or 'recurring'
  const [editingId, setEditingId] = useState(null);

  // Form states
  const [type, setType] = useState('Loan');
  const [customLabel, setCustomLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [actionType, setActionType] = useState('Give');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [amountType, setAmountType] = useState('Fixed'); // Fixed or Percentage (for recurring)

  const fetchData = async () => {
    try {
      setFetching(true);
      const [adjRes, recRes] = await Promise.all([
        axios.get(`/api/payroll/adjustments/${employee.id}`),
        axios.get(`/api/payroll/recurring/${employee.id}`)
      ]);
      setAdjustments(adjRes.data);
      setRecurringAdjustments(recRes.data);
    } catch (err) {
      showNotification('Failed to fetch data', 'error');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (isOpen && employee) {
      fetchData();
      resetForm();
    }
  }, [isOpen, employee]);

  const resetForm = () => {
    setEditingId(null);
    setType(tab === 'one-time' ? 'Loan' : 'Bonus');
    setCustomLabel('');
    setAmount('');
    setActionType('Give');
    setDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setAmountType('Fixed');
  };

  const handleEditInit = (item, isRecurring) => {
    setTab(isRecurring ? 'recurring' : 'one-time');
    setEditingId(item.id);
    setType(item.type === 'Other' ? 'Other' : item.type);
    setCustomLabel(item.type === 'Other' ? item.custom_label : (item.label || ''));
    setAmount(item.amount);
    setActionType(item.action_type);
    if (!isRecurring) {
      setDate(new Date(item.date).toISOString().slice(0, 10));
      setNotes(item.notes || '');
    } else {
      setAmountType(item.amount_type || 'Fixed');
    }
  };

  const handleTabSwitch = (newTab) => {
    setTab(newTab);
    setEditingId(null);
    if (newTab === 'one-time') {
      setType('Loan');
    } else {
      setType('Bonus');
    }
    setCustomLabel('');
    setAmount('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      showNotification('Please enter a valid amount', 'error');
      return;
    }
    if (type === 'Other' && !customLabel.trim()) {
      showNotification('Please enter a custom label', 'error');
      return;
    }

    try {
      setLoading(true);

      if (tab === 'one-time') {
        const payload = {
          employee_id: employee.id,
          type,
          custom_label: type === 'Other' ? customLabel : null,
          amount: parseFloat(amount),
          action_type: actionType,
          date,
          notes
        };

        if (editingId) {
          await axios.put(`/api/payroll/adjustments/${editingId}`, payload);
          showNotification('Adjustment updated successfully', 'success');
        } else {
          await axios.post('/api/payroll/adjustments', payload);
          showNotification('Adjustment saved successfully', 'success');
        }

        // We fetch again to get the updated advance_balance safely from DB instead of complex local calculation
        const empRes = await axios.get('/api/employees');
        const updatedEmp = empRes.data.find(e => e.id === employee.id);
        if (updatedEmp) {
          onUpdate(updatedEmp);
        }

      } else {
        // Recurring
        const payload = {
          employee_id: employee.id,
          type,
          label: type === 'Other' ? customLabel : null,
          action_type: actionType,
          amount_type: amountType,
          amount: parseFloat(amount)
        };

        if (editingId) {
          await axios.put(`/api/payroll/recurring/${editingId}`, payload);
          showNotification('Repeated adjustment updated', 'success');
        } else {
          await axios.post('/api/payroll/recurring', payload);
          showNotification('Repeated adjustment saved', 'success');
        }
      }

      fetchData();
      resetForm();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id, isRecurring) => {
    setConfirmDelete({ id, isRecurring });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const { id, isRecurring } = confirmDelete;
    setConfirmDelete(null);
    try {
      setLoading(true);
      if (isRecurring) {
        await axios.delete(`/api/payroll/recurring/${id}`);
        showNotification('Record deleted', 'success');
      } else {
        await axios.delete(`/api/payroll/adjustments/${id}`);
        showNotification('Record deleted', 'success');
        const empRes = await axios.get('/api/employees');
        const updatedEmp = empRes.data.find(e => e.id === employee.id);
        if (updatedEmp) onUpdate(updatedEmp);
      }
      fetchData();
    } catch (err) {
      showNotification('Failed to delete', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !employee) return null;

  return (
    <>
      <style>{`
        .adj-modal-body { display: flex; flex: 1; overflow: hidden; flex-direction: row; }
        .adj-form-section { width: 35%; padding: 16px; border-right: 1px solid var(--surface-2); overflow-y: auto; background: var(--surface); }
        .adj-history-section { width: 65%; padding: 16px; overflow-y: auto; background: var(--white); }
        .tab-btn { flex: 1; padding: 10px; text-align: center; font-weight: 700; font-size: 13px; cursor: pointer; transition: 0.2s; border-bottom: 2px solid transparent; color: var(--text-muted); }
        .tab-btn.active { border-bottom: 2px solid var(--primary); color: var(--primary); background: rgba(244,180,0,0.05); }
        @media (max-width: 768px) {
          .adj-modal-body { flex-direction: column; overflow-y: auto; display: block; }
          .adj-form-section { width: 100%; border-right: none; border-bottom: 1px solid var(--surface-2); overflow: visible; }
          .adj-history-section { width: 100%; overflow: visible; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes modalPop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 }}>
        
        {/* Delete Confirmation Modal */}
        {confirmDelete && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1010, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ background: 'var(--white)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: 'var(--shadow-lg)', animation: 'modalPop 0.2s ease-out' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Confirm Deletion</h3>
              <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Are you sure you want to delete this record? This action cannot be undone.</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmDelete(null)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--surface-2)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button onClick={executeDelete} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 700 }}>Yes, Delete</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ backgroundColor: 'var(--white)', borderRadius: '12px', width: '100%', maxWidth: '950px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid var(--surface-2)' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Financial Adjustments & Advances</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0 0' }}>
                {employee.name} • Current Advance Balance: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{parseFloat(employee.advance_balance || 0).toFixed(2)}</span>
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={24} /></button>
          </div>

          {notification && (
            <div style={{
              margin: '0 20px',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: notification.type === 'success' ? '#ecfdf5' : '#fef2f2',
              color: notification.type === 'success' ? '#065f46' : '#991b1b',
              border: `1px solid ${notification.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              animation: 'fadeIn 0.3s ease-out'
            }}>
              {notification.text}
              <button onClick={() => setNotification(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}><X size={16} /></button>
            </div>
          )}

          <div className="adj-modal-body">
            {/* Form Section */}
            <div className="adj-form-section">
              <div style={{ display: 'flex', borderBottom: '1px solid var(--surface-2)', marginBottom: '16px' }}>
                <div className={`tab-btn ${tab === 'one-time' ? 'active' : ''}`} onClick={() => handleTabSwitch('one-time')}>One-Time</div>
                <div className={`tab-btn ${tab === 'recurring' ? 'active' : ''}`} onClick={() => handleTabSwitch('recurring')}>Repeated</div>
              </div>

              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
                {editingId ? 'Edit Record' : 'Add New Record'}
              </h3>
              
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', color: 'var(--text-primary)' }}>
                    <option value="Loan">Loan</option>
                    <option value="Bonus">Bonus</option>
                    <option value="Kafala">Kafala</option>
                    <option value="Ticket / Visa">Ticket / Visa</option>
                    <option value="Advance Salary">Advance Salary</option>
                    <option value="Khata">Khata</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {type === 'Other' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Custom Label</label>
                    <input type="text" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. Relocation Allowance" style={{ padding: '8px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', color: 'var(--text-primary)' }} />
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Action</label>
                  <div style={{ display: 'flex', gap: '16px', background: 'var(--white)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--surface-2)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>
                      <input type="radio" checked={actionType === 'Give'} onChange={() => setActionType('Give')} style={{ cursor: 'pointer' }} /> Give
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#ef4444' }}>
                      <input type="radio" checked={actionType === 'Deduct'} onChange={() => setActionType('Deduct')} style={{ cursor: 'pointer' }} /> Deduct
                    </label>
                  </div>
                </div>

                {tab === 'recurring' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Amount Type</label>
                    <div style={{ display: 'flex', gap: '16px', background: 'var(--white)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--surface-2)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <input type="radio" checked={amountType === 'Fixed'} onChange={() => setAmountType('Fixed')} style={{ cursor: 'pointer' }} /> Fixed Amount
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <input type="radio" checked={amountType === 'Percentage'} onChange={() => setAmountType('Percentage')} style={{ cursor: 'pointer' }} /> Percentage (%)
                      </label>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Amount {amountType === 'Percentage' ? '(%)' : ''}</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700 }}>
                      {amountType === 'Percentage' ? '%' : CURRENCY}
                    </span>
                    <input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '8px 10px 8px 45px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', fontWeight: 600, color: 'var(--text-primary)' }} />
                  </div>
                </div>

                {tab === 'one-time' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Date</label>
                      <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', color: 'var(--text-primary)' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Notes (Optional)</label>
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional details..." style={{ padding: '8px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', resize: 'vertical', minHeight: '60px', color: 'var(--text-primary)' }} />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  {editingId && (
                    <button type="button" onClick={resetForm} className="btn btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '6px', fontWeight: 700 }}>Cancel</button>
                  )}
                  <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '6px', fontWeight: 700 }}>
                    {editingId ? 'Update Record' : <><Plus size={16} /> Add Record</>}
                  </button>
                </div>
              </form>
            </div>

            {/* History List */}
            <div className="adj-history-section">
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>History & Repeated</h3>
              
              {fetching ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                  <div style={{ animation: 'spin 1s linear infinite', border: '3px solid var(--surface-2)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '30px', height: '30px' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Recurring List */}
                  {recurringAdjustments.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Repeated Additions / Deductions</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {recurringAdjustments.map((adj) => {
                          const isGive = adj.action_type === 'Give';
                          return (
                            <div key={adj.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--primary)', background: 'rgba(244,180,0,0.02)' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                                    {adj.type === 'Other' ? adj.label : adj.type}
                                  </span>
                                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--primary)', color: 'var(--text-primary)' }}>EVERY MONTH</span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                  {isGive ? 'Adds' : 'Deducts'} {adj.amount_type === 'Percentage' ? `${adj.amount}% of base salary` : `${CURRENCY} ${parseFloat(adj.amount).toFixed(2)}`}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button onClick={() => handleEditInit(adj, true)} style={{ background: 'var(--surface-2)', border: 'none', padding: '6px', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}><Edit2 size={15} /></button>
                                <button onClick={() => handleDelete(adj.id, true)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', padding: '6px', borderRadius: '6px', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={15} /></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* One-Time List */}
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>One-Time Records</h4>
                    {adjustments.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>No records found.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {adjustments.map((adj) => {
                          const isGive = adj.action_type === 'Give';
                          return (
                            <div key={adj.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--surface-2)', background: 'var(--white)' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                                    {adj.type === 'Other' ? adj.custom_label : adj.type}
                                  </span>
                                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: isGive ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: isGive ? '#3b82f6' : '#ef4444' }}>
                                    {adj.action_type.toUpperCase()}
                                  </span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span>{new Date(adj.date).toLocaleDateString()}</span>
                                  {adj.notes && <><span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-muted)' }} /><span style={{ color: 'var(--text-muted)' }}>{adj.notes}</span></>}
                                </div>
                              </div>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ fontWeight: 800, fontSize: '15px', color: isGive ? '#3b82f6' : '#ef4444' }}>
                                  {isGive ? '+' : '-'} {parseFloat(adj.amount).toFixed(2)}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button onClick={() => handleEditInit(adj, false)} style={{ background: 'var(--surface-2)', border: 'none', padding: '6px', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}><Edit2 size={15} /></button>
                                  <button onClick={() => handleDelete(adj.id, false)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', padding: '6px', borderRadius: '6px', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={15} /></button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default EmployeeAdjustmentsModal;
