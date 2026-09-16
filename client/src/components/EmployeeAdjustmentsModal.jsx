import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { CURRENCY } from '../config';
import toast from 'react-hot-toast';
import axios from '../api';

const EmployeeAdjustmentsModal = ({ employee, isOpen, onClose, onUpdate }) => {
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Form states
  const [type, setType] = useState('Advance Salary / Loan');
  const [customLabel, setCustomLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [actionType, setActionType] = useState('Give');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const fetchAdjustments = async () => {
    try {
      setFetching(true);
      const res = await axios.get(`/api/payroll/adjustments/${employee.id}`);
      setAdjustments(res.data);
    } catch (err) {
      toast.error('Failed to fetch adjustments');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (isOpen && employee) {
      fetchAdjustments();
      // Reset form
      setType('Advance Salary / Loan');
      setCustomLabel('');
      setAmount('');
      setActionType('Give');
      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
    }
  }, [isOpen, employee]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return toast.error('Please enter a valid amount');
    }
    if (type === 'Other (Custom)' && !customLabel.trim()) {
      return toast.error('Please enter a custom label');
    }

    try {
      setLoading(true);
      await axios.post('/api/payroll/adjustments', {
        employee_id: employee.id,
        type,
        custom_label: type === 'Other (Custom)' ? customLabel : null,
        amount: parseFloat(amount),
        action_type: actionType,
        date,
        notes
      });
      toast.success('Adjustment saved successfully');
      fetchAdjustments();
      
      let newBalance = parseFloat(employee.advance_balance || 0);
      if (type === 'Advance Salary / Loan') {
        if (actionType === 'Give') newBalance += parseFloat(amount);
        if (actionType === 'Deduct') newBalance = Math.max(0, newBalance - parseFloat(amount));
        onUpdate({ ...employee, advance_balance: newBalance });
      } else {
        onUpdate(employee); 
      }
      
      setAmount('');
      setCustomLabel('');
      setNotes('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save adjustment');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (adj) => {
    if (!window.confirm('Are you sure you want to delete this adjustment? This will revert balances if applicable.')) return;
    try {
      setLoading(true);
      await axios.delete(`/api/payroll/adjustments/${adj.id}`);
      toast.success('Adjustment deleted');
      fetchAdjustments();
      
      let newBalance = parseFloat(employee.advance_balance || 0);
      if (adj.type === 'Advance Salary / Loan') {
        if (adj.action_type === 'Give') newBalance = Math.max(0, newBalance - parseFloat(adj.amount));
        if (adj.action_type === 'Deduct') newBalance += parseFloat(adj.amount);
        onUpdate({ ...employee, advance_balance: newBalance });
      } else {
        onUpdate(employee);
      }
    } catch (err) {
      toast.error('Failed to delete adjustment');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !employee) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'var(--white)', borderRadius: '12px', width: '100%', maxWidth: '900px',
        border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column',
        maxHeight: '90vh', overflow: 'hidden'
      }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid var(--surface-2)' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Financial Adjustments & Advances</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0 0' }}>
              {employee.name} • Current Advance Balance: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{parseFloat(employee.advance_balance || 0).toFixed(2)}</span>
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'row' }}>
          
          {/* Form Section */}
          <div style={{ width: '35%', padding: '16px', borderRight: '1px solid var(--surface-2)', overflowY: 'auto', background: 'var(--surface)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>Add New Record</h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{ padding: '8px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', color: 'var(--text-primary)' }}
                >
                  <option value="Advance Salary / Loan">Advance Salary / Loan</option>
                  <option value="Company Dues">Company Dues</option>
                  <option value="Annual Bonus">Annual Bonus</option>
                  <option value="Annual Ticket">Annual Ticket</option>
                  <option value="Other (Custom)">Other (Custom)</option>
                </select>
              </div>

              {type === 'Other (Custom)' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Custom Label</label>
                  <input
                    type="text"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="e.g. Relocation Allowance"
                    style={{ padding: '8px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Action</label>
                <div style={{ display: 'flex', gap: '16px', background: 'var(--white)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--surface-2)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>
                    <input type="radio" checked={actionType === 'Give'} onChange={() => setActionType('Give')} style={{ cursor: 'pointer' }} />
                    Give
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#ef4444' }}>
                    <input type="radio" checked={actionType === 'Deduct'} onChange={() => setActionType('Deduct')} style={{ cursor: 'pointer' }} />
                    Deduct
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700 }}>{CURRENCY}</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '8px 10px 8px 45px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', fontWeight: 600, color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{ padding: '8px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', color: 'var(--text-primary)' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details..."
                  style={{ padding: '8px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', background: 'var(--white)', fontSize: '13px', outline: 'none', resize: 'vertical', minHeight: '60px', color: 'var(--text-primary)' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '6px', fontWeight: 700, marginTop: '4px' }}
              >
                <Plus size={16} />
                Add Record
              </button>
            </form>
          </div>

          {/* History List */}
          <div style={{ width: '65%', padding: '16px', overflowY: 'auto', background: 'var(--white)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>Adjustment History</h3>
            
            {fetching ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                <div style={{ animation: 'spin 1s linear infinite', border: '3px solid var(--surface-2)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '30px', height: '30px' }} />
              </div>
            ) : adjustments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--surface)', borderRadius: '12px', border: '1px dashed var(--surface-2)' }}>
                <p style={{ color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>No financial adjustments recorded yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {adjustments.map((adj) => {
                  const isGive = adj.action_type === 'Give';
                  return (
                    <div key={adj.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px',
                      borderRadius: '10px', border: '1px solid var(--surface-2)', background: 'var(--white)',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '15px' }}>
                            {adj.type === 'Other (Custom)' ? adj.custom_label : adj.type}
                          </span>
                          <span style={{
                            fontSize: '11px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px',
                            background: isGive ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: isGive ? '#3b82f6' : '#ef4444'
                          }}>
                            {adj.action_type}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{new Date(adj.date).toLocaleDateString()}</span>
                          {adj.notes && (
                            <>
                              <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                              <span style={{ color: 'var(--text-muted)' }}>{adj.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{
                          fontWeight: 800, fontSize: '16px',
                          color: isGive ? '#3b82f6' : '#ef4444'
                        }}>
                          {isGive ? '+' : '-'} {parseFloat(adj.amount).toFixed(2)}
                        </div>
                        <button 
                          onClick={() => handleDelete(adj)}
                          disabled={loading}
                          style={{
                            background: 'var(--surface)', border: 'none', padding: '8px', borderRadius: '8px',
                            color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s',
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--surface)'; }}
                          title="Delete Record"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default EmployeeAdjustmentsModal;
