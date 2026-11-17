import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { 
  ShoppingCart, 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Eye, 
  Calendar, 
  Truck, 
  DollarSign, 
  CheckCircle2, 
  X, 
  FileText,
  Printer,
  ChevronDown,
  RefreshCw,
  RotateCcw
} from 'lucide-react';
import { BRAND_CURRENCY, BRAND_NAME } from '../../branding';
import { getSaudiTodayDate, formatSaudiDate } from '../../utils/timezone';
import { useStore } from '../../contexts/StoreContext';
import { formatBranchLabel } from './storeUtils';

export default function PurchaseManagement({ 
  selectedBranch: propBranch, 
  selectedStoreId: propStoreId, 
  locations: propLocations = [], 
  onPurchaseCreated 
}) {
  const storeContext = useStore();
  const selectedBranch = propBranch || storeContext?.selectedBranch || 'All';
  const selectedStoreId = propStoreId || storeContext?.selectedStoreId || 'All';
  const locations = (propLocations && propLocations.length > 0) ? propLocations : (storeContext?.locations || []);
  const branches = storeContext?.branches || [];
  const setSelectedBranch = storeContext?.setSelectedBranch || (() => {});
  const setSelectedStoreId = storeContext?.setSelectedStoreId || (() => {});
  const [purchases, setPurchases] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [storeItems, setStoreItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [vendorFilter, setVendorFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPurchaseDetail, setSelectedPurchaseDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // New Purchase Form State
  const [formVendorId, setFormVendorId] = useState('');
  const [formStoreId, setFormStoreId] = useState(selectedStoreId || '');
  const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
  const [formInvoiceDate, setFormInvoiceDate] = useState(() => getSaudiTodayDate());
  const [formDeliveryDate, setFormDeliveryDate] = useState(() => getSaudiTodayDate());
  const [formPaymentMethod, setFormPaymentMethod] = useState('Cash');
  const [formPaymentStatus, setFormPaymentStatus] = useState('Paid');
  const [formNotes, setFormNotes] = useState('');
  
  // Line items state
  const [lineItems, setLineItems] = useState([
    { item_id: '', quantity: 1, unit: 'KG', unit_price: 0, tax_rate: 0, notes: '', expiry_date: '', batch_number: '' }
  ]);

  // Load purchases list
  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/store/purchases', {
        params: {
          store_id: selectedStoreId,
          branch: selectedBranch,
          vendor_id: vendorFilter,
          payment_status: statusFilter,
          from_date: fromDate,
          to_date: toDate
        }
      });
      setPurchases(res.data);
    } catch (err) {
      console.error('Error fetching purchases:', err);
      toast.error('Failed to load purchases.');
    } finally {
      setLoading(false);
    }
  };

  // Load vendors and items options
  useEffect(() => {
    axios.get('/api/store/vendors?status=Active').then(r => setVendors(r.data)).catch(console.error);
    axios.get('/api/store/items?status=Active').then(r => setStoreItems(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [selectedStoreId, selectedBranch, vendorFilter, statusFilter, fromDate, toDate]);

  useEffect(() => {
    if (selectedStoreId && !formStoreId) {
      setFormStoreId(selectedStoreId);
    }
  }, [selectedStoreId]);

  // Line item change handlers
  const handleItemSelect = (index, itemId) => {
    const sel = storeItems.find(it => it.id === parseInt(itemId, 10));
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        item_id: itemId,
        unit: sel ? sel.primary_unit : 'KG',
        unit_price: sel ? (parseFloat(sel.last_purchase_price) || 0) : 0
      };
      return updated;
    });
  };

  const handleLineChange = (index, field, val) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const addLine = () => {
    setLineItems(prev => [
      ...prev,
      { item_id: '', quantity: 1, unit: 'KG', unit_price: 0, tax_rate: 0, notes: '', expiry_date: '', batch_number: '' }
    ]);
  };

  const removeLine = (index) => {
    if (lineItems.length === 1) return;
    setLineItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Form Calculations
  const formCalculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;

    lineItems.forEach(it => {
      const qty = parseFloat(it.quantity) || 0;
      const price = parseFloat(it.unit_price) || 0;
      const taxRate = parseFloat(it.tax_rate) || 0;
      const lineSub = qty * price;
      const lineTax = (lineSub * taxRate) / 100;
      subtotal += lineSub;
      totalTax += lineTax;
    });

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalAmount: Math.round((subtotal + totalTax) * 100) / 100
    };
  }, [lineItems]);

  // Submit Purchase
  const handleSubmitPurchase = async (e) => {
    e.preventDefault();
    if (!formVendorId) return toast.error('Please select a vendor');
    if (!formStoreId) return toast.error('Please select a store location');

    for (const [idx, it] of lineItems.entries()) {
      if (!it.item_id) return toast.error(`Please select an item for row #${idx + 1}`);
      if (parseFloat(it.quantity) <= 0) return toast.error(`Quantity for row #${idx + 1} must be greater than 0`);
      if (parseFloat(it.unit_price) < 0) return toast.error(`Unit price for row #${idx + 1} cannot be negative`);
    }

    setSaving(true);
    try {
      const payload = {
        vendor_id: parseInt(formVendorId, 10),
        store_id: parseInt(formStoreId, 10),
        branch: selectedBranch,
        invoice_number: formInvoiceNumber,
        invoice_date: formInvoiceDate,
        delivery_date: formDeliveryDate,
        payment_method: formPaymentMethod,
        payment_status: formPaymentStatus,
        notes: formNotes,
        items: lineItems.map(it => ({
          item_id: parseInt(it.item_id, 10),
          quantity: parseFloat(it.quantity),
          unit: it.unit,
          unit_price: parseFloat(it.unit_price),
          tax_rate: parseFloat(it.tax_rate) || 0,
          expiry_date: it.expiry_date || null,
          batch_number: it.batch_number || null,
          notes: it.notes || null
        }))
      };

      const res = await axios.post('/api/store/purchases', payload);
      toast.success(res.data.message);
      setShowAddModal(false);
      // Reset form
      setFormInvoiceNumber('');
      setLineItems([{ item_id: '', quantity: 1, unit: 'KG', unit_price: 0, tax_rate: 0, notes: '', expiry_date: '', batch_number: '' }]);
      await fetchPurchases();
      if (onPurchaseCreated) onPurchaseCreated();
    } catch (err) {
      console.error('Error creating purchase:', err);
      toast.error(err.response?.data?.error || 'Failed to register purchase');
    } finally {
      setSaving(false);
    }
  };

  // View purchase detail
  const handleViewDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const res = await axios.get(`/api/store/purchases/${id}`);
      setSelectedPurchaseDetail(res.data);
    } catch (err) {
      toast.error('Failed to load purchase details');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Filtered purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      const matchSearch = !search ||
        p.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.invoice_number && p.invoice_number.toLowerCase().includes(search.toLowerCase())) ||
        p.purchase_number.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [purchases, search]);

  return (
    <div className="store-module-wrap">
      {/* Top Card: Header & 2-Row Filters */}
      <div className="store-card">
        <div className="store-header-row">
          <div className="store-header-left">
            <div className="store-header-icon">
              <ShoppingCart size={20} />
            </div>
            <div className="store-header-info">
              <h2 className="store-header-title">
                Store Purchases & Receiving
                <span className="store-badge-count">
                  {filteredPurchases.length} Records
                </span>
              </h2>
              <p className="store-header-desc">
                Record supplier invoices, receive ingredients into store inventory, and track payable status.
              </p>
            </div>
          </div>

          <div className="store-header-actions">
            <button
              onClick={fetchPurchases}
              disabled={loading}
              className="store-btn-icon"
              title="Refresh Purchases"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
            <button
              className="store-btn store-btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={16} />
              <span>Register Purchase</span>
            </button>
          </div>
        </div>

        {/* Mobile Branch & Location Bar */}
        <div className="store-mobile-location-bar">
          <div className="store-filter-col">
            <label className="store-filter-label">Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="store-filter-select"
            >
              <option value="All">All</option>
              {branches.map(b => (
                <option key={b} value={b}>{formatBranchLabel(b)}</option>
              ))}
            </select>
          </div>

          <div className="store-filter-col">
            <label className="store-filter-label">Store Location</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="store-filter-select"
            >
              <option value="All">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} {selectedBranch === 'All' ? `(${formatBranchLabel(loc.branch)})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filters Container: Exactly 1 clean row on desktop */}
        <div className="store-filters-wrap">
          <div className="store-filters-row">
            {/* 1. Search Invoices (FIRST, compact width) */}
            <div className="store-filter-col" style={{ flex: '1.4 1 180px' }}>
              <label className="store-filter-label">Search Invoices</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, color: '#9ca3af' }} />
                <input
                  type="text"
                  placeholder="Search vendor, invoice, PO..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="store-filter-input"
                  style={{ paddingLeft: 30 }}
                />
              </div>
            </div>

            {/* 2. Supplier */}
            <div className="store-filter-col" style={{ flex: '1.1 1 130px' }}>
              <label className="store-filter-label">Supplier</label>
              <select
                value={vendorFilter}
                onChange={e => setVendorFilter(e.target.value)}
                className="store-filter-select"
              >
                <option value="All">All Vendors</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {/* 3. Payment Status */}
            <div className="store-filter-col" style={{ flex: '0.9 1 110px' }}>
              <label className="store-filter-label">Payment Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="store-filter-select"
              >
                <option value="All">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Partial">Partial</option>
              </select>
            </div>

            {/* 4. Invoice From Date */}
            <div className="store-filter-col" style={{ flex: '0.9 1 115px' }}>
              <label className="store-filter-label">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="store-filter-input"
              />
            </div>

            {/* 5. Invoice To Date */}
            <div className="store-filter-col" style={{ flex: '0.9 1 115px' }}>
              <label className="store-filter-label">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="store-filter-input"
              />
            </div>

            {/* Reset Button if active */}
            {(fromDate || toDate || vendorFilter !== 'All' || statusFilter !== 'All' || search) && (
              <div className="store-filter-col-fixed" style={{ alignSelf: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setVendorFilter('All');
                    setStatusFilter('All');
                    setFromDate('');
                    setToDate('');
                  }}
                  className="store-btn store-btn-outline"
                  style={{ height: 36, padding: '0 10px', fontSize: 12 }}
                  title="Clear Filters"
                >
                  <X size={13} />
                  <span>Reset</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="card table-container" style={{ borderRadius: 12, border: '1px solid var(--surface-2)', background: 'var(--white)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface)', borderBottom: '1.5px solid var(--surface-2)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '12px 16px', fontWeight: 800 }}>Purchase #</th>
              <th style={{ padding: '12px 12px', fontWeight: 800 }}>Vendor</th>
              <th style={{ padding: '12px 12px', fontWeight: 800 }}>Store Location</th>
              <th style={{ padding: '12px 12px', fontWeight: 800 }}>Invoice Date</th>
              <th style={{ padding: '12px 12px', fontWeight: 800, textAlign: 'right' }}>Total Amount</th>
              <th style={{ padding: '12px 12px', fontWeight: 800, textAlign: 'center' }}>Payment</th>
              <th style={{ padding: '12px 16px', fontWeight: 800, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Loading purchases...
                </td>
              </tr>
            ) : filteredPurchases.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No purchase records found. Click 'Register Purchase' to record goods received.
                </td>
              </tr>
            ) : (
              filteredPurchases.map((p, idx) => (
                <tr key={p.id} style={{ 
                  borderBottom: '1px solid var(--surface-2)',
                  background: idx % 2 === 0 ? 'var(--white)' : 'rgba(248, 248, 246, 0.5)'
                }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 800, color: 'var(--secondary)' }}>
                      {p.purchase_number}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Inv: {p.invoice_number || 'N/A'}
                    </div>
                  </td>

                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {p.vendor_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {p.vendor_phone || ''}
                    </div>
                  </td>

                  <td style={{ padding: '12px 12px' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {p.store_name}
                    </span>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                      {p.branch}
                    </div>
                  </td>

                  <td style={{ padding: '12px 12px', color: 'var(--text-secondary)' }}>
                    {new Date(p.invoice_date).toLocaleDateString()}
                  </td>

                  <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {BRAND_CURRENCY}{parseFloat(p.total_amount).toFixed(2)}
                  </td>

                  <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 800,
                      background: p.payment_status === 'Paid' ? '#dcfce7' : '#fee2e2',
                      color: p.payment_status === 'Paid' ? '#166534' : '#991b1b'
                    }}>
                      {p.payment_status} ({p.payment_method})
                    </span>
                  </td>

                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      className="btn btn-outline"
                      onClick={() => handleViewDetail(p.id)}
                      style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Eye size={14} /> View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Register Purchase Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 20
        }}>
          <div className="card" style={{
            maxWidth: 900, width: '100%', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            padding: 24, borderRadius: 14, background: 'var(--white)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Register Store Purchase Invoice
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Record received raw materials & packaging into store inventory.
                </span>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmitPurchase} style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
              {/* Primary Invoice Header Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18, background: 'var(--surface)', padding: 16, borderRadius: 10 }}>
                {/* Vendor Picker */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Vendor <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={formVendorId}
                    onChange={e => setFormVendorId(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  >
                    <option value="">Select Vendor...</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.phone || 'No phone'})</option>
                    ))}
                  </select>
                </div>

                {/* Store Location */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Store Location <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={formStoreId}
                    onChange={e => setFormStoreId(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  >
                    <option value="">Select Store Location...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{formatBranchLabel(loc.branch)} — {loc.name}</option>
                    ))}
                  </select>
                </div>

                {/* Vendor Invoice Number */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Vendor Invoice #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-90412"
                    value={formInvoiceNumber}
                    onChange={e => setFormInvoiceNumber(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  />
                </div>

                {/* Invoice Date */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Invoice Date <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={formInvoiceDate}
                    onChange={e => setFormInvoiceDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Payment Method
                  </label>
                  <select
                    value={formPaymentMethod}
                    onChange={e => {
                      setFormPaymentMethod(e.target.value);
                      if (e.target.value === 'Cash') setFormPaymentStatus('Paid');
                      else setFormPaymentStatus('Unpaid');
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Credit">Credit (On Account)</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>

                {/* Payment Status */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Payment Status
                  </label>
                  <select
                    value={formPaymentStatus}
                    onChange={e => setFormPaymentStatus(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                  >
                    <option value="Paid">Paid</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                  </select>
                </div>
              </div>

              {/* Line Items Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                    Purchased Goods & Materials
                  </h4>
                  <button
                    type="button"
                    onClick={addLine}
                    style={{
                      background: 'rgba(244, 180, 0, 0.15)',
                      color: '#000000',
                      border: '1px solid var(--primary)',
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Plus size={14} /> Add Row
                  </button>
                </div>

                <div style={{ border: '1px solid var(--surface-2)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--surface-2)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 200 }}>Store Item *</th>
                        <th style={{ padding: '8px 8px', textAlign: 'right', width: 90 }}>Quantity *</th>
                        <th style={{ padding: '8px 8px', textAlign: 'left', width: 75 }}>Unit</th>
                        <th style={{ padding: '8px 8px', textAlign: 'right', width: 100 }}>Unit Price *</th>
                        <th style={{ padding: '8px 8px', textAlign: 'right', width: 75 }}>Tax %</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: 110 }}>Total ({BRAND_CURRENCY})</th>
                        <th style={{ padding: '8px 8px', width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((line, idx) => {
                        const lineSub = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0);
                        const lineTax = (lineSub * (parseFloat(line.tax_rate) || 0)) / 100;
                        const lineTotal = lineSub + lineTax;

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                            <td style={{ padding: '8px 10px' }}>
                              <select
                                value={line.item_id}
                                onChange={e => handleItemSelect(idx, e.target.value)}
                                required
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--surface-2)', outline: 'none', fontSize: 12 }}
                              >
                                <option value="">Select Item...</option>
                                {storeItems.map(it => (
                                  <option key={it.id} value={it.id}>
                                    {it.name} ({it.item_code}) — {it.primary_unit}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                              <input
                                type="number"
                                step="any"
                                min="0.001"
                                value={line.quantity}
                                onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                                required
                                style={{ width: '100%', padding: '6px 8px', textAlign: 'right', borderRadius: 4, border: '1px solid var(--surface-2)', outline: 'none' }}
                              />
                            </td>

                            <td style={{ padding: '8px 8px' }}>
                              <input
                                type="text"
                                value={line.unit}
                                onChange={e => handleLineChange(idx, 'unit', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--surface-2)', outline: 'none' }}
                              />
                            </td>

                            <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={line.unit_price}
                                onChange={e => handleLineChange(idx, 'unit_price', e.target.value)}
                                required
                                style={{ width: '100%', padding: '6px 8px', textAlign: 'right', borderRadius: 4, border: '1px solid var(--surface-2)', outline: 'none' }}
                              />
                            </td>

                            <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                max="100"
                                value={line.tax_rate}
                                onChange={e => handleLineChange(idx, 'tax_rate', e.target.value)}
                                placeholder="0"
                                style={{ width: '100%', padding: '6px 8px', textAlign: 'right', borderRadius: 4, border: '1px solid var(--surface-2)', outline: 'none' }}
                              />
                            </td>

                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                              {lineTotal.toFixed(2)}
                            </td>

                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <button
                                type="button"
                                disabled={lineItems.length === 1}
                                onClick={() => removeLine(idx)}
                                style={{ background: 'none', border: 'none', color: lineItems.length === 1 ? '#ccc' : '#ef4444', cursor: 'pointer' }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary Totals Box */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <div style={{ width: 260, background: 'var(--surface)', padding: 12, borderRadius: 8, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span>Subtotal:</span>
                    <strong>{BRAND_CURRENCY}{formCalculations.subtotal.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span>VAT / Tax:</span>
                    <strong>{BRAND_CURRENCY}{formCalculations.totalTax.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid var(--surface-2)', paddingTop: 6, fontSize: 15, fontWeight: 800, color: 'var(--secondary)' }}>
                    <span>Total Amount:</span>
                    <span>{BRAND_CURRENCY}{formCalculations.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Notes / Receipt Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Driver delivery, batch #9042, inspected by store keeper"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
                />
              </div>

              {/* Modal Action Buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ fontWeight: 800, padding: '10px 20px' }}
                >
                  {saving ? 'Processing...' : 'Confirm & Receive Goods'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Detail Modal */}
      {selectedPurchaseDetail && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 20
        }}>
          <div className="card" style={{ maxWidth: 700, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 24, borderRadius: 14, background: 'var(--white)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--surface-2)', paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Purchase Order #{selectedPurchaseDetail.purchase?.purchase_number}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Invoice: {selectedPurchaseDetail.purchase?.invoice_number || 'N/A'} • {new Date(selectedPurchaseDetail.purchase?.invoice_date).toLocaleDateString()}
                </span>
              </div>
              <button 
                onClick={() => setSelectedPurchaseDetail(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Vendor & Location Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--surface)', padding: 14, borderRadius: 8, fontSize: 13, marginBottom: 18 }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Vendor:</span>
                <strong>{selectedPurchaseDetail.purchase?.vendor_name}</strong>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedPurchaseDetail.purchase?.vendor_phone}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Store Destination:</span>
                <strong>{selectedPurchaseDetail.purchase?.store_name}</strong>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedPurchaseDetail.purchase?.branch}</div>
              </div>
            </div>

            {/* Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 18 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--surface-2)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right' }}>Tax</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedPurchaseDetail.items?.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <strong>{it.item_name}</strong>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{it.item_code}</div>
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      {it.quantity} {it.unit}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      {BRAND_CURRENCY}{parseFloat(it.unit_price).toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      {BRAND_CURRENCY}{parseFloat(it.tax_amount).toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                      {BRAND_CURRENCY}{parseFloat(it.total_price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Grand Total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
              <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 800, color: 'var(--secondary)' }}>
                Total Paid: {BRAND_CURRENCY}{parseFloat(selectedPurchaseDetail.purchase?.total_amount).toFixed(2)}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedPurchaseDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
