import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import {
  ShoppingCart,
  Plus,
  Search,
  Trash2,
  Eye,
  X,
  RefreshCw,
  ListChecks,
  CheckCircle2
} from 'lucide-react';
import { BRAND_CURRENCY } from '../../branding';
import { getSaudiTodayDate } from '../../utils/timezone';
import { useStore } from '../../contexts/StoreContext';
import { formatBranchLabel } from './storeUtils';
import AddNewItemRequestModal from './AddNewItemRequestModal';

export default function PurchaseManagement({
  selectedBranch: propBranch,
  onPurchaseCreated,
  user,
  readOnly = false
}) {
  const storeContext = useStore();
  const selectedBranch = propBranch || storeContext?.selectedBranch || 'All';
  const branches = storeContext?.branches || ['Branch 1', 'Branch 2', 'Branch 3'];
  const setSelectedBranch = storeContext?.setSelectedBranch || (() => {});

  const canCreatePurchase = useMemo(() => {
    if (readOnly) return false;
    const role = (user?.role || '').trim().toLowerCase();
    return ['admin', 'developer', 'store man', 'data entry'].includes(role);
  }, [user, readOnly]);

  // Two Tabs: 'add' (Add New Purchases - default when permitted) | 'list' (See Purchases)
  const [purchaseTab, setPurchaseTab] = useState(() => (canCreatePurchase ? 'add' : 'list'));

  const [purchases, setPurchases] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [storeItems, setStoreItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // See Purchases Filters
  const [vendorFilter, setVendorFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modals
  const [showNewItemReqModal, setShowNewItemReqModal] = useState(false);
  const [selectedPurchaseDetail, setSelectedPurchaseDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add New Purchases Form State
  const [formVendorId, setFormVendorId] = useState('');
  const [formBranch, setFormBranch] = useState(
    selectedBranch && selectedBranch !== 'All' ? selectedBranch : 'Branch 1'
  );
  const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
  const [formInvoiceDate, setFormInvoiceDate] = useState(() => getSaudiTodayDate());
  const [formPaymentMethod, setFormPaymentMethod] = useState('Cash');
  const [formPaymentStatus, setFormPaymentStatus] = useState('Paid');
  const [formNotes, setFormNotes] = useState('');

  // Line items: { item_id, item_name, item_code, unit, quantity, total_price, isFromVendor }
  const [lineItems, setLineItems] = useState([]);
  const [loadingVendorItems, setLoadingVendorItems] = useState(false);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/store/purchases', {
        params: {
          branch: selectedBranch,
          vendor_id: vendorFilter,
          payment_status: statusFilter,
          from_date: fromDate,
          to_date: toDate
        }
      });
      setPurchases(res.data || []);
    } catch (err) {
      console.error('Error fetching purchases:', err);
      toast.error('Failed to load purchases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    axios.get('/api/store/vendors?status=Active').then(r => setVendors(r.data || [])).catch(console.error);
    axios.get('/api/store/items?status=Active').then(r => setStoreItems(r.data || [])).catch(console.error);
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [selectedBranch, vendorFilter, statusFilter, fromDate, toDate]);

  useEffect(() => {
    if (selectedBranch && selectedBranch !== 'All') {
      setFormBranch(selectedBranch);
    }
  }, [selectedBranch]);

  // Automatically load all menu items registered under selected vendor
  const loadVendorItems = async (vendorId) => {
    if (!vendorId || vendorId === 'All') {
      setLineItems([]);
      return;
    }
    setLoadingVendorItems(true);
    try {
      const res = await axios.get(`/api/store/vendors/${vendorId}/items`);
      const vItems = res.data || [];
      setLineItems(
        vItems.map(it => ({
          item_id: String(it.item_id),
          item_name: it.item_name,
          item_code: it.item_code,
          unit: it.primary_unit || 'KG',
          quantity: '',
          total_price: '',
          isFromVendor: true
        }))
      );
    } catch (err) {
      console.error('Error loading vendor items:', err);
      toast.error('Failed to load vendor menu items');
    } finally {
      setLoadingVendorItems(false);
    }
  };

  useEffect(() => {
    if (formVendorId) {
      loadVendorItems(formVendorId);
    } else {
      setLineItems([]);
    }
  }, [formVendorId]);

  const handleItemSelect = (index, itemId) => {
    const sel = storeItems.find(it => it.id === parseInt(itemId, 10));
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        item_id: itemId,
        item_name: sel ? sel.name : '',
        item_code: sel ? sel.item_code : '',
        unit: sel ? sel.primary_unit : 'KG'
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
      {
        item_id: '',
        item_name: '',
        item_code: '',
        unit: 'KG',
        quantity: '',
        total_price: '',
        isFromVendor: false
      }
    ]);
  };

  // Calculations: Per Unit Price = Total Price / Quantity Received
  const formTotals = useMemo(() => {
    let grandTotal = 0;
    let activeCount = 0;
    lineItems.forEach(it => {
      const qty = parseFloat(it.quantity) || 0;
      const total = parseFloat(it.total_price) || 0;
      if (qty > 0) {
        activeCount++;
        grandTotal += total;
      }
    });
    return {
      activeCount,
      grandTotal: Math.round(grandTotal * 100) / 100
    };
  }, [lineItems]);

  const handleSubmitPurchase = async (e) => {
    e.preventDefault();
    if (!formVendorId) return toast.error('Please select a vendor');
    if (!formBranch || formBranch === 'All') return toast.error('Please select a branch');

    const activeLines = lineItems.filter(it => it.item_id && parseFloat(it.quantity) > 0);
    if (activeLines.length === 0) {
      return toast.error('Please enter Quantity Received (> 0) for at least one item');
    }

    for (const [idx, it] of activeLines.entries()) {
      const total = parseFloat(it.total_price);
      if (isNaN(total) || total < 0) {
        return toast.error(`Please enter a valid Total Price for ${it.item_name || `row #${idx + 1}`}`);
      }
    }

    setSaving(true);
    try {
      const payload = {
        vendor_id: parseInt(formVendorId, 10),
        branch: formBranch,
        invoice_number: formInvoiceNumber,
        invoice_date: formInvoiceDate,
        delivery_date: formInvoiceDate,
        payment_method: formPaymentMethod,
        payment_status: formPaymentStatus,
        notes: formNotes,
        items: activeLines.map(it => {
          const qty = parseFloat(it.quantity);
          const total = parseFloat(it.total_price) || 0;
          const unitPrice = qty > 0 ? Math.round((total / qty) * 10000) / 10000 : 0;
          return {
            item_id: parseInt(it.item_id, 10),
            quantity: qty,
            unit: it.unit,
            unit_price: unitPrice,
            tax_rate: 0
          };
        })
      };

      const res = await axios.post('/api/store/purchases', payload);
      toast.success(res.data.message || 'Purchase saved successfully');
      setFormInvoiceNumber('');
      setFormNotes('');
      setLineItems(prev => prev.map(it => ({ ...it, quantity: '', total_price: '' })));
      await fetchPurchases();
      if (onPurchaseCreated) onPurchaseCreated();
      setPurchaseTab('list');
    } catch (err) {
      console.error('Error creating purchase:', err);
      toast.error(err.response?.data?.error || 'Failed to register purchase');
    } finally {
      setSaving(false);
    }
  };

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

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      const matchSearch =
        !search ||
        p.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.invoice_number && p.invoice_number.toLowerCase().includes(search.toLowerCase())) ||
        p.purchase_number.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [purchases, search]);

  return (
    <div className="store-module-wrap">
      {/* Top Card: Header + Two Sub-Tabs */}
      <div className="store-card">
        <div className="store-header-row">
          <div className="store-header-left">
            <div className="store-header-icon">
              <ShoppingCart size={20} />
            </div>
            <div className="store-header-info">
              <h2 className="store-header-title">
                Store Purchases & Receiving
                <span className="store-badge-count">{filteredPurchases.length} Records</span>
              </h2>
              <p className="store-header-desc">
                Select a supplier to enter received quantities and total prices, or review recorded purchases.
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
          </div>
        </div>

        {/* Two Tabs: Add New Purchases | See Purchases */}
        <div className="store-tabs">
          {canCreatePurchase && (
            <button
              type="button"
              onClick={() => setPurchaseTab('add')}
              className={`store-tab-btn ${purchaseTab === 'add' ? 'active' : ''}`}
            >
              <Plus size={15} />
              <span>Add New Purchases</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setPurchaseTab('list')}
            className={`store-tab-btn ${purchaseTab === 'list' ? 'active' : ''}`}
          >
            <ListChecks size={15} />
            <span>See Purchases ({filteredPurchases.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ADD NEW PURCHASES */}
      {purchaseTab === 'add' && canCreatePurchase && (
        <form onSubmit={handleSubmitPurchase} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Supplier & Invoice Header */}
          <div className="store-card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div>
                <label className="store-form-label">
                  Supplier / Vendor <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formVendorId}
                  onChange={e => setFormVendorId(e.target.value)}
                  required
                  className="store-form-select"
                >
                  <option value="">Select Vendor...</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.phone ? `(${v.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="store-form-label">
                  Branch <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formBranch}
                  onChange={e => setFormBranch(e.target.value)}
                  required
                  className="store-form-select"
                >
                  {branches.map(b => (
                    <option key={b} value={b}>
                      {b} ({formatBranchLabel(b)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="store-form-label">Invoice Date *</label>
                <input
                  type="date"
                  value={formInvoiceDate}
                  onChange={e => setFormInvoiceDate(e.target.value)}
                  required
                  className="store-form-input"
                />
              </div>

              <div>
                <label className="store-form-label">Vendor Invoice #</label>
                <input
                  type="text"
                  placeholder="e.g. INV-90412"
                  value={formInvoiceNumber}
                  onChange={e => setFormInvoiceNumber(e.target.value)}
                  className="store-form-input"
                />
              </div>

              <div>
                <label className="store-form-label">Payment Method</label>
                <select
                  value={formPaymentMethod}
                  onChange={e => {
                    setFormPaymentMethod(e.target.value);
                    setFormPaymentStatus(e.target.value === 'Cash' ? 'Paid' : 'Unpaid');
                  }}
                  className="store-form-select"
                >
                  <option value="Cash">Cash</option>
                  <option value="Credit">Credit (On Account)</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="store-form-label">Payment Status</label>
                <select
                  value={formPaymentStatus}
                  onChange={e => setFormPaymentStatus(e.target.value)}
                  className="store-form-select"
                >
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Partial">Partial</option>
                </select>
              </div>
            </div>
          </div>

          {/* Vendor Items Entry Table (Desktop: Horizontal Row | Mobile: Stacked Vertical Fields) */}
          <div className="store-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              padding: '14px 16px',
              borderBottom: '1px solid var(--surface-2, #e5e7eb)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Menu Items Received
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Enter Quantity Received and Total Price; Per Unit Price calculates automatically.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!formVendorId) {
                      toast.error('Please select a vendor first so it can be attached to the item request.');
                      return;
                    }
                    setShowNewItemReqModal(true);
                  }}
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: '#065f46',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Plus size={14} /> Add New Item
                </button>
                <button
                  type="button"
                  onClick={addLine}
                  style={{
                    background: 'rgba(244, 180, 0, 0.15)',
                    color: '#000000',
                    border: '1px solid var(--primary)',
                    padding: '6px 12px',
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
            </div>

            {/* Desktop Column Headers */}
            <div className="purchase-entry-header">
              <div>Menu Item</div>
              <div style={{ textAlign: 'right' }}>Quantity Received</div>
              <div style={{ textAlign: 'right' }}>Total Price ({BRAND_CURRENCY})</div>
              <div style={{ textAlign: 'right' }}>Per Unit Price</div>
              <div></div>
            </div>

            {/* Body */}
            <div>
              {loadingVendorItems ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                  <div>Loading vendor menu items...</div>
                </div>
              ) : !formVendorId ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  Select a <strong>Supplier / Vendor</strong> above to automatically load all menu items supplied by that vendor.
                </div>
              ) : lineItems.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No menu items registered under this vendor yet. Use <strong>Add New Item</strong> or <strong>Add Row</strong>.
                </div>
              ) : (
                lineItems.map((line, idx) => {
                  const qty = parseFloat(line.quantity) || 0;
                  const total = parseFloat(line.total_price) || 0;
                  const perUnit = qty > 0 ? total / qty : 0;

                  return (
                    <div
                      key={`${line.item_id || 'new'}-${idx}`}
                      className="purchase-entry-row"
                      style={{ background: qty > 0 ? 'rgba(16, 185, 129, 0.04)' : 'transparent' }}
                    >
                      {/* 1. Menu Item */}
                      <div>
                        {line.isFromVendor ? (
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                              {line.item_name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {line.item_code} • Unit: <strong>{line.unit}</strong>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="purchase-mobile-label">Menu Item</label>
                            <select
                              value={line.item_id}
                              onChange={e => handleItemSelect(idx, e.target.value)}
                              className="store-form-select"
                              style={{ fontSize: 13 }}
                            >
                              <option value="">Select Menu Item...</option>
                              {storeItems.map(it => (
                                <option key={it.id} value={it.id}>
                                  {it.name} ({it.item_code}) — {it.primary_unit}
                                </option>
                              ))}
                            </select>
                            {line.unit && line.item_id && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                Unit: <strong>{line.unit}</strong>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 2. Quantity Received */}
                      <div>
                        <label className="purchase-mobile-label">1. Quantity Received ({line.unit || 'Unit'})</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0"
                          value={line.quantity}
                          onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                          className="store-form-input"
                          style={{
                            textAlign: 'right',
                            fontWeight: qty > 0 ? 700 : 400,
                            borderColor: qty > 0 ? '#10b981' : undefined
                          }}
                        />
                      </div>

                      {/* 3. Total Price */}
                      <div>
                        <label className="purchase-mobile-label">2. Total Price ({BRAND_CURRENCY})</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0.00"
                          value={line.total_price}
                          onChange={e => handleLineChange(idx, 'total_price', e.target.value)}
                          className="store-form-input"
                          style={{ textAlign: 'right', fontWeight: total > 0 ? 700 : 400 }}
                        />
                      </div>

                      {/* 4. Per Unit Price (Auto-calculated: Total Price / Quantity Received) */}
                      <div>
                        <label className="purchase-mobile-label">3. Per Unit Price (Auto)</label>
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            background: 'var(--surface, #f9fafb)',
                            border: '1px solid var(--surface-2, #e5e7eb)',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: 13,
                            color: qty > 0 ? 'var(--secondary, #103C43)' : 'var(--text-muted)'
                          }}
                        >
                          {BRAND_CURRENCY} {perUnit.toFixed(2)} / {line.unit || 'unit'}
                        </div>
                      </div>

                      {/* Remove Row */}
                      <div style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                          title="Remove row"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Totals & Save */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              padding: '14px 16px',
              background: 'var(--surface, #f9fafb)',
              borderTop: '1px solid var(--surface-2, #e5e7eb)'
            }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Items with quantity: <strong>{formTotals.activeCount}</strong> &nbsp;|&nbsp;
                Grand Total: <strong style={{ fontSize: 16, color: 'var(--secondary)' }}>{BRAND_CURRENCY} {formTotals.grandTotal.toFixed(2)}</strong>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="store-btn store-btn-primary"
                style={{ padding: '10px 22px', fontWeight: 800 }}
              >
                {saving ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={15} />}
                <span>{saving ? 'Saving...' : 'Save Purchase'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: SEE PURCHASES */}
      {purchaseTab === 'list' && (
        <>
          <div className="store-card">
            {/* Mobile Branch Bar */}
            <div className="store-mobile-location-bar">
              <div className="store-filter-col">
                <label className="store-filter-label">Branch</label>
                <select
                  value={selectedBranch}
                  onChange={e => setSelectedBranch(e.target.value)}
                  className="store-filter-select"
                >
                  <option value="All">All Branches</option>
                  {branches.map(b => (
                    <option key={b} value={b}>{formatBranchLabel(b)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filters Row */}
            <div className="store-filters-wrap">
              <div className="store-filters-row">
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

                <div className="store-filter-col" style={{ flex: '1 1 120px' }}>
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

                <div className="store-filter-col" style={{ flex: '0.9 1 115px' }}>
                  <label className="store-filter-label">From Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="store-filter-input"
                  />
                </div>

                <div className="store-filter-col" style={{ flex: '0.9 1 115px' }}>
                  <label className="store-filter-label">To Date</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className="store-filter-input"
                  />
                </div>
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
                  <th style={{ padding: '12px 12px', fontWeight: 800 }}>Branch</th>
                  <th style={{ padding: '12px 12px', fontWeight: 800 }}>Invoice Date</th>
                  <th style={{ padding: '12px 12px', fontWeight: 800, textAlign: 'right' }}>Total Amount</th>
                  <th style={{ padding: '12px 12px', fontWeight: 800, textAlign: 'center' }}>Payment</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                      <div>Loading purchase invoices...</div>
                    </td>
                  </tr>
                ) : filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      No purchase records found matching the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((p, idx) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--surface-2)', background: idx % 2 === 0 ? 'var(--white)' : 'rgba(248, 248, 246, 0.5)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 800, color: 'var(--secondary)' }}>{p.purchase_number}</div>
                        {p.invoice_number && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Inv: {p.invoice_number}</div>}
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.vendor_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.vendor_phone || ''}</div>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--secondary)' }}>{formatBranchLabel(p.branch)}</span>
                      </td>
                      <td style={{ padding: '12px 12px', color: 'var(--text-secondary)' }}>
                        {new Date(p.invoice_date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {BRAND_CURRENCY}{parseFloat(p.total_amount).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                          background: p.payment_status === 'Paid' ? '#dcfce7' : '#fee2e2',
                          color: p.payment_status === 'Paid' ? '#166534' : '#991b1b'
                        }}>
                          {p.payment_status} ({p.payment_method})
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
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
        </>
      )}

      {/* View Purchase Detail Modal */}
      {selectedPurchaseDetail && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 20
        }}>
          <div className="card" style={{ maxWidth: 680, width: '100%', padding: 24, borderRadius: 14, background: 'var(--white)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
                  Purchase Invoice: {selectedPurchaseDetail.purchase?.purchase_number}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Invoice #{selectedPurchaseDetail.purchase?.invoice_number || 'N/A'} • {new Date(selectedPurchaseDetail.purchase?.invoice_date).toLocaleDateString()}
                </span>
              </div>
              <button onClick={() => setSelectedPurchaseDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--surface)', padding: 14, borderRadius: 8, fontSize: 13, marginBottom: 18 }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Vendor:</span>
                <strong>{selectedPurchaseDetail.purchase?.vendor_name}</strong>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedPurchaseDetail.purchase?.vendor_phone}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Branch:</span>
                <strong>{formatBranchLabel(selectedPurchaseDetail.purchase?.branch)}</strong>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 18 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--surface-2)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right' }}>Per Unit Price</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Price</th>
                </tr>
              </thead>
              <tbody>
                {selectedPurchaseDetail.items?.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                      {it.item_name}
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{it.item_code}</div>
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      {it.quantity} {it.unit}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      {BRAND_CURRENCY}{parseFloat(it.unit_price).toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                      {BRAND_CURRENCY}{parseFloat(it.total_price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--secondary)' }}>
                Total: {BRAND_CURRENCY}{parseFloat(selectedPurchaseDetail.purchase?.total_amount).toFixed(2)}
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedPurchaseDetail(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Item Requisition Modal (auto-attaches selected vendor) */}
      <AddNewItemRequestModal
        isOpen={showNewItemReqModal}
        onClose={() => setShowNewItemReqModal(false)}
        defaultBranch={formBranch || selectedBranch}
        source="Purchases"
        attachedVendor={vendors.find(v => String(v.id) === String(formVendorId)) || null}
      />
    </div>
  );
}
