import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { 
  Users, 
  Plus, 
  Search, 
  Edit, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  DollarSign, 
  CheckCircle2, 
  X, 
  CreditCard,
  History,
  Building2
} from 'lucide-react';
import { BRAND_CURRENCY } from '../../branding';

export default function VendorManagement() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [saving, setSaving] = useState(false);

  // Ledger / Payment Modal
  const [selectedVendorLedger, setSelectedVendorLedger] = useState(null);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Cash');
  const [notes, setNotes] = useState('');

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/store/vendors', {
        params: { status: statusFilter, search }
      });
      setVendors(res.data);
    } catch (err) {
      console.error('Error fetching vendors:', err);
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [statusFilter]);

  const handleOpenModal = (vendor = null) => {
    if (vendor) {
      setEditingVendor(vendor);
      setName(vendor.name || '');
      setContactPerson(vendor.contact_person || '');
      setPhone(vendor.phone || '');
      setWhatsapp(vendor.whatsapp || '');
      setEmail(vendor.email || '');
      setAddress(vendor.address || '');
      setTaxNumber(vendor.tax_number || '');
      setPaymentTerms(vendor.payment_terms || 'Cash');
      setNotes(vendor.notes || '');
    } else {
      setEditingVendor(null);
      setName('');
      setContactPerson('');
      setPhone('');
      setWhatsapp('');
      setEmail('');
      setAddress('');
      setTaxNumber('');
      setPaymentTerms('Cash');
      setNotes('');
    }
    setShowModal(true);
  };

  const handleSaveVendor = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Vendor name is required');

    setSaving(true);
    try {
      const payload = {
        name,
        contact_person: contactPerson,
        phone,
        whatsapp,
        email,
        address,
        tax_number: taxNumber,
        payment_terms: paymentTerms,
        notes
      };

      if (editingVendor) {
        await axios.put(`/api/store/vendors/${editingVendor.id}`, payload);
        toast.success('Vendor profile updated successfully');
      } else {
        await axios.post('/api/store/vendors', payload);
        toast.success('New vendor created successfully');
      }

      setShowModal(false);
      await fetchVendors();
    } catch (err) {
      console.error('Error saving vendor:', err);
      toast.error(err.response?.data?.error || 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  // Open Vendor Ledger Statement
  const handleOpenLedger = async (vendor) => {
    setSelectedVendorLedger(vendor);
    setLoadingLedger(true);
    try {
      const res = await axios.get(`/api/store/vendors/${vendor.id}/ledger`);
      setLedgerTransactions(res.data.transactions || []);
    } catch (err) {
      toast.error('Failed to load vendor ledger');
    } finally {
      setLoadingLedger(false);
    }
  };

  // Submit Payment Voucher
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedVendorLedger) return;
    const numAmt = parseFloat(paymentAmount);
    if (isNaN(numAmt) || numAmt <= 0) return toast.error('Valid positive payment amount required');

    setSubmittingPayment(true);
    try {
      const res = await axios.post(`/api/store/vendors/${selectedVendorLedger.id}/payment`, {
        amount: numAmt,
        payment_method: paymentMethod,
        reference_number: paymentRef,
        comments: paymentNotes
      });
      toast.success(res.data.message);
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentRef('');
      setPaymentNotes('');
      // Refresh ledger & vendor list
      const updatedLedgerRes = await axios.get(`/api/store/vendors/${selectedVendorLedger.id}/ledger`);
      setLedgerTransactions(updatedLedgerRes.data.transactions || []);
      await fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const filteredVendors = useMemo(() => {
    return vendors.filter(v => {
      const matchSearch = !search ||
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        (v.contact_person && v.contact_person.toLowerCase().includes(search.toLowerCase())) ||
        (v.phone && v.phone.includes(search));
      return matchSearch;
    });
  }, [vendors, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Top Header & Search Bar */}
      <div className="card" style={{
        padding: '16px 20px',
        borderRadius: 12,
        background: 'var(--white)',
        border: '1px solid var(--surface-2)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: 240, flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search vendors by name, contact person, or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: 8,
                border: '1.5px solid var(--surface-2)',
                background: 'var(--surface)',
                outline: 'none',
                fontSize: 13
              }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              border: '1.5px solid var(--surface-2)',
              background: 'var(--surface)',
              fontWeight: 600,
              fontSize: 13,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="All">All Vendors</option>
            <option value="Active">Active Vendors</option>
            <option value="Inactive">Inactive Vendors</option>
          </select>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => handleOpenModal()}
          style={{
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 8
          }}
        >
          <Plus size={16} /> Add Vendor
        </button>
      </div>

      {/* Vendors Table */}
      <div className="card table-container" style={{ borderRadius: 12, border: '1px solid var(--surface-2)', background: 'var(--white)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface)', borderBottom: '1.5px solid var(--surface-2)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '12px 16px', fontWeight: 800 }}>Vendor Name</th>
              <th style={{ padding: '12px 12px', fontWeight: 800 }}>Contact Info</th>
              <th style={{ padding: '12px 12px', fontWeight: 800 }}>Payment Terms</th>
              <th style={{ padding: '12px 12px', fontWeight: 800, textAlign: 'right' }}>Total Invoices</th>
              <th style={{ padding: '12px 12px', fontWeight: 800, textAlign: 'right' }}>Outstanding Balance</th>
              <th style={{ padding: '12px 16px', fontWeight: 800, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Loading vendors...
                </td>
              </tr>
            ) : filteredVendors.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No vendors found. Click 'Add Vendor' to register a supplier.
                </td>
              </tr>
            ) : (
              filteredVendors.map((v, idx) => (
                <tr key={v.id} style={{ 
                  borderBottom: '1px solid var(--surface-2)',
                  background: idx % 2 === 0 ? 'var(--white)' : 'rgba(248, 248, 246, 0.5)'
                }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                      {v.name}
                    </div>
                    {v.tax_number && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Tax #: {v.tax_number}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {v.contact_person || 'N/A'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {v.phone || v.email || 'No contact details'}
                    </div>
                  </td>

                  <td style={{ padding: '12px 12px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--surface-2)' }}>
                      {v.payment_terms}
                    </span>
                  </td>

                  <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                    <strong>{v.total_purchases_count || 0}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {BRAND_CURRENCY}{parseFloat(v.total_purchases_value || 0).toFixed(2)}
                    </div>
                  </td>

                  <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                    <span style={{ 
                      fontSize: 14, 
                      fontWeight: 800, 
                      color: parseFloat(v.current_balance) > 0 ? '#dc2626' : 'var(--text-primary)' 
                    }}>
                      {BRAND_CURRENCY}{parseFloat(v.current_balance || 0).toFixed(2)}
                    </span>
                  </td>

                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        className="btn btn-outline"
                        onClick={() => handleOpenLedger(v)}
                        style={{ padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <History size={13} /> Statement
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() => handleOpenModal(v)}
                        style={{ padding: '6px 10px', fontSize: 12 }}
                      >
                        <Edit size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Vendor Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 20
        }}>
          <div className="card" style={{ maxWidth: 520, width: '100%', padding: 24, borderRadius: 14, background: 'var(--white)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {editingVendor ? 'Edit Vendor Profile' : 'Add New Vendor'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveVendor} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Company / Vendor Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Almarai Dairy Co."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Contact Person
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tariq Khan"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Phone / Mobile
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +966 50 123 4567"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +966 50 123 4567"
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. sales@vendor.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Tax / VAT Number
                  </label>
                  <input
                    type="text"
                    placeholder="15-digit Tax ID"
                    value={taxNumber}
                    onChange={e => setTaxNumber(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Payment Terms
                  </label>
                  <select
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  >
                    <option value="Cash">Cash on Delivery</option>
                    <option value="Credit 15 Days">Credit 15 Days</option>
                    <option value="Credit 30 Days">Credit 30 Days</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Address / Location Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Makkah Industrial Area, Warehouse #12"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ fontWeight: 800 }}
                >
                  {saving ? 'Saving...' : editingVendor ? 'Update Vendor' : 'Create Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vendor Ledger / Statement Modal */}
      {selectedVendorLedger && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 20
        }}>
          <div className="card" style={{ maxWidth: 780, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 24, borderRadius: 14, background: 'var(--white)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-2)', paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Vendor Statement: {selectedVendorLedger.name}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Vendor transactions ledger (separate from customer khata).
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowPaymentModal(true)}
                  style={{ padding: '6px 14px', fontSize: 12, fontWeight: 800 }}
                >
                  Record Payment
                </button>
                <button onClick={() => setSelectedVendorLedger(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Current Balance Box */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: 14, borderRadius: 8, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Payment Terms:</span>
                <strong style={{ marginLeft: 6 }}>{selectedVendorLedger.payment_terms}</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Outstanding Payable:</span>
                <span style={{ marginLeft: 8, fontSize: 18, fontWeight: 800, color: '#dc2626' }}>
                  {BRAND_CURRENCY}{parseFloat(selectedVendorLedger.current_balance || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Transactions Table */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--surface-2)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Type</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Reference</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Comments</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLedger ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                        Loading transaction history...
                      </td>
                    </tr>
                  ) : ledgerTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                        No transactions recorded in vendor ledger.
                      </td>
                    </tr>
                  ) : (
                    ledgerTransactions.map((tx, idx) => {
                      const isBill = tx.transaction_type === 'PURCHASE_BILL';
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                          <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                            {new Date(tx.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontWeight: 700,
                              fontSize: 10,
                              background: isBill ? '#fee2e2' : '#dcfce7',
                              color: isBill ? '#991b1b' : '#166534'
                            }}>
                              {tx.transaction_type.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                            {tx.reference_number || tx.purchase_number || '-'}
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                            {tx.comments || '-'}
                          </td>
                          <td style={{ 
                            padding: '8px 10px', 
                            textAlign: 'right', 
                            fontWeight: 800,
                            color: isBill ? '#dc2626' : '#16a34a'
                          }}>
                            {isBill ? '+' : '-'}{BRAND_CURRENCY}{parseFloat(tx.amount).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Voucher Modal */}
      {showPaymentModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 11000, padding: 20
        }}>
          <div className="card" style={{ maxWidth: 420, width: '100%', padding: 24, borderRadius: 14, background: 'var(--white)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
              Record Vendor Payment
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Disbursing payment to <strong>{selectedVendorLedger?.name}</strong>.
            </p>

            <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Payment Amount ({BRAND_CURRENCY}) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--primary)', outline: 'none', fontSize: 15, fontWeight: 800 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Voucher / Transfer Reference #
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bank Ref #89312 or Cash Voucher"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Payment Comments
                </label>
                <input
                  type="text"
                  placeholder="e.g. Settling outstanding bill for October flour delivery"
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={submittingPayment}
                  onClick={() => setShowPaymentModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingPayment}
                  style={{ fontWeight: 800 }}
                >
                  {submittingPayment ? 'Processing...' : 'Confirm Payment Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
