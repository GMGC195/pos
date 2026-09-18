import React, { useState, useEffect } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, FileText, X } from 'lucide-react';
import { CURRENCY } from '../config';
import { useAuth } from '../contexts/AuthContext';
import OrderDetailModal from '../components/OrderDetailModal';

const AVAILABLE_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3'];

export default function Credit() {
  const { user } = useAuth();
  const isAdmin = user?.role?.trim().toLowerCase() === 'admin' || user?.role?.trim().toLowerCase() === 'developer';
  
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState(0);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedBranches, setSelectedBranches] = useState([]);

  // Filter state
  const [branchFilter, setBranchFilter] = useState('All');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentAction, setPaymentAction] = useState('PAYMENT');

  useEffect(() => {
    fetchCustomers();
  }, [branchFilter]); // refetch when filter changes

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const url = isAdmin && branchFilter !== 'All' 
        ? `/api/credit?branch=${encodeURIComponent(branchFilter)}` 
        : '/api/credit';
      const res = await axios.get(url);
      setCustomers(res.data);
    } catch (err) {
      toast.error('Failed to fetch credit customers');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!name) return toast.error('Name is required');
    if (saving) return;

    const payload = {
      name,
      phone,
      credit_limit: creditLimit,
      reference,
      notes,
      available_branches: isAdmin ? selectedBranches : [user?.branch?.split(',')[0]?.trim() || '']
    };

    setSaving(true);
    try {
      if (editingCustomer) {
        await axios.put(`/api/credit/${editingCustomer.id}`, payload);
        toast.success('Customer updated');
      } else {
        await axios.post('/api/credit', payload);
        toast.success('Customer added');
      }
      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error saving customer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Are you sure you want to delete this customer?</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button 
            onClick={() => toast.dismiss(t.id)} 
            style={{ padding: '6px 12px', border: '1px solid var(--border)', background: 'transparent', borderRadius: 6, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await axios.delete(`/api/credit/${id}`);
                toast.success('Customer deleted');
                fetchCustomers();
              } catch (err) {
                toast.error('Failed to delete customer');
              }
            }} 
            style={{ padding: '6px 12px', border: 'none', background: 'var(--red)', color: '#fff', borderRadius: 6, cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setReference('');
    setNotes('');
    setCreditLimit(0);
    setSelectedBranches(AVAILABLE_BRANCHES); // Default select all
    setShowModal(true);
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone || '');
    setReference(customer.reference || '');
    setNotes(customer.notes || '');
    setCreditLimit(customer.credit_limit || 0);
    setSelectedBranches(customer.available_branches || []);
    setShowModal(true);
  };

  const openLedger = async (customer) => {
    setActiveCustomer(customer);
    setPaymentAmount('');
    setPaymentAction('PAYMENT');
    try {
      const res = await axios.get(`/api/credit/${customer.id}/ledger`);
      setLedger(res.data);
      setShowLedger(true);
    } catch (err) {
      toast.error('Failed to load ledger');
    }
  };

  const handleViewOrder = async (orderId) => {
    try {
      const res = await axios.get(`/api/orders/${orderId}`);
      setSelectedOrder(res.data);
    } catch (err) {
      toast.error('Failed to load order details');
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    let amountStr = paymentAmount;
    const finalAmount = Math.abs(Number(amountStr));
    
    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      return toast.error('Enter a valid positive amount');
    }
    
    try {
      await axios.post(`/api/credit/${activeCustomer.id}/payment`, { 
        amount: finalAmount,
        action: paymentAction,
        cashier_name: user?.username || 'Unknown'
      });
      toast.success(paymentAction === 'PAYMENT' ? 'Major Payment added' : 'Credit added');
      setPaymentAmount('');
      
      const ledgerRes = await axios.get(`/api/credit/${activeCustomer.id}/ledger`);
      setLedger(ledgerRes.data);
      
      const balanceChange = paymentAction === 'CHARGE' ? finalAmount : -finalAmount;
      setActiveCustomer(prev => ({ ...prev, balance: Number(prev.balance) + balanceChange }));
      fetchCustomers(); 
    } catch (err) {
      toast.error('Failed to add payment');
    }
  };

  const toggleBranch = (br) => {
    if (selectedBranches.includes(br)) {
      setSelectedBranches(selectedBranches.filter(b => b !== br));
    } else {
      setSelectedBranches([...selectedBranches, br]);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Credit Customers</h2>
        
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isAdmin && (
            <select 
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--surface-2)', outline: 'none' }}
            >
              <option value="All">All Branches</option>
              {AVAILABLE_BRANCHES.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}

          <button
            onClick={openAddModal}
            style={{
              background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 16px',
              borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600
            }}
          >
            <Plus size={18} /> Add Customer
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1.5px solid var(--surface-2)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--surface-2)', background: 'var(--surface-50)' }}>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</th>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Reference</th>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Balance</th>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Limit</th>
              {isAdmin && <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Branches</th>}
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdmin ? 7 : 6} style={{ padding: 32, textAlign: 'center' }}>Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No credit customers found.</td></tr>
            ) : (
              customers.map((c) => {
                const effLim = Number(c.credit_limit) > 0 ? Number(c.credit_limit) : 100;
                const limitExceeded = Number(c.balance) > effLim;
                
                return (
                  <tr key={c.id} onClick={() => openLedger(c)} style={{ borderBottom: '1px solid var(--surface-2)', background: limitExceeded ? 'rgba(255, 0, 0, 0.05)' : 'transparent', cursor: 'pointer' }}>
                    <td style={{ padding: '16px', fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{c.phone || '-'}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.reference || ''}>{c.reference || '-'}</td>
                    <td style={{ padding: '16px', fontWeight: 600, color: limitExceeded ? 'var(--red)' : (c.balance > 0 ? 'var(--red)' : (c.balance < 0 ? 'var(--green)' : 'var(--text)')) }}>
                      {CURRENCY} {Math.abs(c.balance).toFixed(2)} {c.balance > 0 ? '(Due)' : (c.balance < 0 ? '(Adv)' : '')}
                    </td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                      {Number(c.credit_limit) > 0 ? `${CURRENCY} ${Number(c.credit_limit).toFixed(2)}` : 'No Limit'}
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {c.available_branches ? c.available_branches.join(', ') : '-'}
                      </td>
                    )}
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <button onClick={(e) => { e.stopPropagation(); openLedger(c); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 6 }} title="Ledger">
                          <FileText size={18} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openEditModal(c); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }} title="Edit">
                          <Edit size={18} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 6 }} title="Delete">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 400, borderRadius: 16, padding: 24, position: 'relative' }}>
            <button onClick={() => setShowModal(false)} style={{ position: 'absolute', right: 16, top: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20}/></button>
            <h3 style={{ margin: '0 0 20px', fontSize: 20 }}>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
            <form onSubmit={handleSaveCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Phone (Optional)</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Reference (Optional)</label>
                <input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. Employee ID, Company Name" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Note / Comment (Optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Credit Limit (Optional, 0 = No Limit)</label>
                <input type="number" step="0.01" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box' }} />
              </div>
              
              {isAdmin && (
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Assign Branches</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {AVAILABLE_BRANCHES.map(br => (
                      <label key={br} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 14 }}>
                        <input 
                          type="checkbox" 
                          checked={selectedBranches.includes(br)}
                          onChange={() => toggleBranch(br)}
                        />
                        {br}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" disabled={saving} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', marginTop: 8, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {showLedger && activeCustomer && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 600, height: '80vh', borderRadius: 16, padding: 24, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setShowLedger(false)} style={{ position: 'absolute', right: 16, top: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20}/></button>
            <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>{activeCustomer.name}'s Ledger</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
              Current Balance: <span style={{ fontWeight: 700, color: activeCustomer.balance > 0 ? 'var(--red)' : (activeCustomer.balance < 0 ? 'var(--green)' : 'var(--text)') }}>{CURRENCY} {Math.abs(activeCustomer.balance).toFixed(2)} {activeCustomer.balance > 0 ? '(Due)' : (activeCustomer.balance < 0 ? '(Adv)' : '')}</span>
            </p>

            <form onSubmit={handleAddPayment} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, padding: 16, background: 'var(--surface-2)', borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
                  <input type="radio" name="actionType" value="PAYMENT" checked={paymentAction === 'PAYMENT'} onChange={() => setPaymentAction('PAYMENT')} />
                  Receive Major Payment
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
                  <input type="radio" name="actionType" value="CHARGE" checked={paymentAction === 'CHARGE'} onChange={() => setPaymentAction('CHARGE')} />
                  Add Credit
                </label>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: paymentAction === 'PAYMENT' ? 'var(--green)' : 'var(--red)' }}>
                    {paymentAction === 'PAYMENT' ? '-' : '+'}
                  </span>
                  <input 
                    type="number" step="0.01" required placeholder="Enter Amount"
                    value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} 
                    style={{ width: '100%', padding: '10px 12px 10px 28px', borderRadius: 8, border: '1.5px solid var(--surface-3)', background: 'var(--bg)', outline: 'none', boxSizing: 'border-box' }} 
                  />
                </div>
                <button type="submit" style={{ background: paymentAction === 'PAYMENT' ? 'var(--green)' : 'var(--red)', color: '#fff', border: 'none', padding: '0 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                  {paymentAction === 'PAYMENT' ? 'Receive Payment' : 'Add Credit'}
                </button>
              </div>
            </form>

            <div style={{ flex: 1, overflowY: 'auto', border: '1.5px solid var(--surface-2)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '2px solid var(--surface-2)' }}>
                    <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>Description</th>
                    <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>{new Date(t.created_at).toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        {t.type === 'CREDIT_ORDER' ? (
                          <span onClick={() => handleViewOrder(t.order_id)} style={{ color: 'var(--red)', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}>Bill # {t.order_id}</span>
                        ) : t.type === 'CHARGE' ? (
                          <span style={{ color: 'var(--red)', fontWeight: 500 }}>Credit Added {t.cashier_name ? `(by ${t.cashier_name})` : ''}</span>
                        ) : (
                          <span style={{ color: 'var(--green)', fontWeight: 500 }}>Major Payment {t.cashier_name ? `(to ${t.cashier_name})` : ''}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: (t.type === 'CREDIT_ORDER') ? 'var(--red)' : 'var(--green)' }}>
                        {(t.type === 'CREDIT_ORDER') ? '+' : '-'} {CURRENCY} {Number(t.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No transactions yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div style={{ zIndex: 1100, position: 'relative' }}>
          <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
        </div>
      )}
    </div>
  );
}
