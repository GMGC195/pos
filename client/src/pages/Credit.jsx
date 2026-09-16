import React, { useState, useEffect } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, FileText, X } from 'lucide-react';
import { CURRENCY } from '../config';

export default function Credit() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [ledger, setLedger] = useState([]);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState(0);

  const [paymentAmount, setPaymentAmount] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await axios.get('/api/credit');
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

    try {
      if (editingCustomer) {
        await axios.put(`/api/credit/${editingCustomer.id}`, { name, phone, credit_limit: creditLimit });
        toast.success('Customer updated');
      } else {
        await axios.post('/api/credit', { name, phone, credit_limit: creditLimit });
        toast.success('Customer added');
      }
      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error saving customer');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    try {
      await axios.delete(`/api/credit/${id}`);
      toast.success('Customer deleted');
      fetchCustomers();
    } catch (err) {
      toast.error('Failed to delete customer');
    }
  };

  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setCreditLimit(0);
    setShowModal(true);
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone || '');
    setCreditLimit(customer.credit_limit || 0);
    setShowModal(true);
  };

  const openLedger = async (customer) => {
    setActiveCustomer(customer);
    setPaymentAmount('');
    try {
      const res = await axios.get(`/api/credit/${customer.id}/ledger`);
      setLedger(res.data);
      setShowLedger(true);
    } catch (err) {
      toast.error('Failed to load ledger');
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (!paymentAmount || isNaN(paymentAmount) || Number(paymentAmount) <= 0) {
      return toast.error('Enter a valid positive amount');
    }
    
    try {
      await axios.post(`/api/credit/${activeCustomer.id}/payment`, { amount: Number(paymentAmount) });
      toast.success('Payment added');
      setPaymentAmount('');
      
      // Refresh ledger and customer balance
      const ledgerRes = await axios.get(`/api/credit/${activeCustomer.id}/ledger`);
      setLedger(ledgerRes.data);
      
      // Update local customer balance for display
      setActiveCustomer(prev => ({ ...prev, balance: prev.balance - Number(paymentAmount) }));
      fetchCustomers(); // refresh main list
    } catch (err) {
      toast.error('Failed to add payment');
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Credit Customers</h2>
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

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1.5px solid var(--surface-2)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--surface-2)', background: 'var(--surface-50)' }}>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</th>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Balance</th>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Limit</th>
              <th style={{ padding: '16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                <td style={{ padding: '16px', fontWeight: 500 }}>{c.name}</td>
                <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{c.phone || '-'}</td>
                <td style={{ padding: '16px', fontWeight: 600, color: c.balance > 0 ? 'var(--red)' : (c.balance < 0 ? 'var(--green)' : 'var(--text)') }}>
                  {CURRENCY} {Math.abs(c.balance).toFixed(2)} {c.balance > 0 ? '(Due)' : (c.balance < 0 ? '(Adv)' : '')}
                </td>
                <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                  {Number(c.credit_limit) > 0 ? `${CURRENCY} ${Number(c.credit_limit).toFixed(2)}` : 'No Limit'}
                </td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  <button onClick={() => openLedger(c)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 6 }} title="Ledger">
                    <FileText size={18} />
                  </button>
                  <button onClick={() => openEditModal(c)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }} title="Edit">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 6 }} title="Delete">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No credit customers found.</td>
              </tr>
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
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Credit Limit (Optional)</label>
                <input type="number" step="0.01" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box' }} />
              </div>
              <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
                Save
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

            <form onSubmit={handleAddPayment} style={{ display: 'flex', gap: 12, marginBottom: 20, padding: 16, background: 'var(--surface-2)', borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <input 
                  type="number" step="0.01" required placeholder="Enter Payment Amount"
                  value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} 
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--surface-3)', background: 'var(--bg)', outline: 'none', boxSizing: 'border-box' }} 
                />
              </div>
              <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '0 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                Add Payment
              </button>
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
                          <span style={{ color: 'var(--red)', fontWeight: 500 }}>Bill # {t.order_id}</span>
                        ) : (
                          <span style={{ color: 'var(--green)', fontWeight: 500 }}>Payment Received</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: t.type === 'CREDIT_ORDER' ? 'var(--red)' : 'var(--green)' }}>
                        {t.type === 'CREDIT_ORDER' ? '+' : '-'} {CURRENCY} {Number(t.amount).toFixed(2)}
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
    </div>
  );
}
