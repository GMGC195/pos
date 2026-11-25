import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { 
  GitPullRequest, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Building2, 
  RefreshCw, 
  Layers, 
  X,
  Package,
  ShieldCheck,
  Check,
  Calendar
} from 'lucide-react';
import { BRAND_CURRENCY } from '../../branding';
import { useStore } from '../../contexts/StoreContext';
import { formatBranchLabel } from './storeUtils';
import AddNewItemRequestModal from './AddNewItemRequestModal';

export default function ItemRequests({ 
  selectedBranch: propBranch, 
  user 
}) {
  const storeContext = useStore();
  const selectedBranch = propBranch || storeContext?.selectedBranch || 'All';
  const branches = storeContext?.branches || ['Branch 1', 'Branch 2', 'Branch 3'];
  const setSelectedBranch = storeContext?.setSelectedBranch || (() => {});
  const [requests, setRequests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [branchFilter, setBranchFilter] = useState(selectedBranch || 'All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');

  // New Request Modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [formData, setFormData] = useState({
    store_id: selectedStoreId && selectedStoreId !== 'All' ? selectedStoreId : '',
    branch: selectedBranch && selectedBranch !== 'All' ? selectedBranch : '',
    item_name: '',
    category_id: '',
    unit: 'kg',
    required_quantity: 10,
    min_stock: 5,
    suggested_vendor: '',
    estimated_price: 0,
    reason: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Approve Modal state
  const [approvingReq, setApprovingReq] = useState(null);
  const [approveForm, setApproveForm] = useState({
    item_code: '',
    edited_item_name: '',
    edited_category_id: '',
    edited_unit: '',
    min_stock: 5,
    vendor_id: ''
  });
  const [isApproving, setIsApproving] = useState(false);

  // Reject Modal state
  const [rejectingReq, setRejectingReq] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const isAdminOrDev = useMemo(() => {
    const role = (user?.role || '').toLowerCase();
    return ['admin', 'developer'].includes(role);
  }, [user]);

  // Load Categories, Units & Vendors
  const fetchAux = async () => {
    try {
      const [catRes, unitRes, venRes] = await Promise.all([
        axios.get('/api/store/locations/categories'),
        axios.get('/api/store/locations/units'),
        axios.get('/api/store/vendors?status=Active')
      ]);
      setCategories(catRes.data || []);
      setUnits(unitRes.data || []);
      setVendors(venRes.data || []);
    } catch (err) {
      console.error('Error fetching categories/units/vendors:', err);
    }
  };

  // Fetch Requests
  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = {};
      if (branchFilter !== 'All') params.branch = branchFilter;
      if (statusFilter !== 'All') params.status = statusFilter;

      const res = await axios.get('/api/store/requests', { params });
      setRequests(res.data || []);
    } catch (err) {
      console.error('Error fetching item requests:', err);
      toast.error('Failed to load item requisitions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAux();
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [branchFilter, statusFilter]);

  // Sync with parent props
  useEffect(() => {
    if (selectedBranch && selectedBranch !== 'All') setBranchFilter(selectedBranch);
  }, [selectedBranch]);

  // Open New Request
  const handleOpenNew = () => {
    setShowNewModal(true);
  };

  // Open Approve Modal
  const handleOpenApprove = (req) => {
    setApprovingReq(req);
    setApproveForm({
      item_code: '', // leave empty to auto-generate
      edited_item_name: req.item_name,
      edited_category_id: req.category_id || (categories.length > 0 ? categories[0].id : ''),
      edited_unit: req.unit,
      min_stock: req.min_stock || 5,
      vendor_id: req.vendor_id || ''
    });
  };

  // Confirm Approve
  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    setIsApproving(true);
    try {
      const res = await axios.post(`/api/store/requests/${approvingReq.id}/approve`, approveForm);
      toast.success(res.data.message || 'Item requisition approved!');
      setApprovingReq(null);
      fetchRequests();
    } catch (err) {
      console.error('Error approving request:', err);
      toast.error(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setIsApproving(false);
    }
  };

  // Confirm Reject
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      toast.error('A mandatory rejection reason is required');
      return;
    }

    setIsRejecting(true);
    try {
      await axios.post(`/api/store/requests/${rejectingReq.id}/reject`, {
        rejection_reason: rejectReason.trim()
      });
      toast.success('Requisition rejected');
      setRejectingReq(null);
      setRejectReason('');
      fetchRequests();
    } catch (err) {
      console.error('Error rejecting request:', err);
      toast.error(err.response?.data?.error || 'Failed to reject request');
    } finally {
      setIsRejecting(false);
    }
  };

  // Filter in memory
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.item_name?.toLowerCase().includes(q) ||
        r.request_number?.toLowerCase().includes(q) ||
        r.requested_by_name?.toLowerCase().includes(q)
      );
    });
  }, [requests, search]);

  return (
    <div className="store-module-wrap">
      {/* Header and Filter Card */}
      <div className="store-card">
        <div className="store-header-row">
          <div className="store-header-left">
            <div className="store-header-icon">
              <GitPullRequest size={20} />
            </div>
            <div className="store-header-info">
              <h2 className="store-header-title">
                Item Requisitions & Requests
                <span className="store-badge-count">
                  {filteredRequests.length} Requests
                </span>
              </h2>
              <p className="store-header-desc">
                Staff requisitions for new items. Once approved by management, items automatically enter the Store Items catalog.
              </p>
            </div>
          </div>

          <div className="store-header-actions">
            <button
              onClick={fetchRequests}
              disabled={loading}
              className="store-btn-icon"
              title="Refresh Requisitions"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>

            {isAdminOrDev && (
              <button
                onClick={handleOpenNew}
                className="store-btn store-btn-primary"
              >
                <Plus size={16} />
                <span>New Item Request</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Branch Bar (screens <= 768px) */}
        <div className="store-mobile-location-bar">
          <div className="store-filter-col">
            <label className="store-filter-label">Branch</label>
            <select
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value);
                setSelectedBranch(e.target.value);
              }}
              className="store-filter-select"
            >
              <option value="All">All Branches</option>
              {branches.map(b => (
                <option key={b} value={b}>{formatBranchLabel(b)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Row: Max 1 Row on Desktop */}
        <div className="store-filters-wrap" style={{ marginTop: 10 }}>
          <div className="store-filters-row">
            {/* Quick Search */}
            <div className="store-filter-col" style={{ flex: '2 1 240px' }}>
              <label className="store-filter-label">Search Request # / Item</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={15} style={{ position: 'absolute', left: 10, color: '#9ca3af' }} />
                <input
                  type="text"
                  placeholder="Search request # or item name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="store-filter-input"
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>

            {/* Status Segmented Switch: All / Pending / Approved / Rejected */}
            <div className="store-filter-col-fixed">
              <label className="store-filter-label">Filter by Status</label>
              <div className="store-shift-switch">
                {[
                  { id: 'All', label: 'All' },
                  { id: 'Pending', label: 'Pending' },
                  { id: 'Approved', label: 'Approved' },
                  { id: 'Rejected', label: 'Rejected' }
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatusFilter(st.id)}
                    className={`store-shift-btn ${statusFilter === st.id ? 'active' : ''}`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="store-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="store-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Request #</th>
                <th>Requested Item</th>
                <th>Category</th>
                <th style={{ textAlign: 'center' }}>Unit</th>
                <th style={{ textAlign: 'right' }}>Req. Qty</th>
                <th>Branch</th>
                <th>Requested By</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--primary, #F4B400)' }} />
                    <div>Loading item requisitions...</div>
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                    <GitPullRequest size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div>No requisitions found matching current filters.</div>
                  </td>
                </tr>
              ) : (
                filteredRequests.map(req => (
                  <tr key={req.id}>
                    {/* Request Number */}
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-dark, #d97706)' }}>
                      {req.request_number}
                      <div style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)', fontFamily: 'inherit', fontWeight: 400 }}>
                        {new Date(req.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Item Name & Reason */}
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{req.item_name}</div>
                      {(req.vendor_name || req.suggested_vendor) && (
                        <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 2 }}>
                          Supplier: {req.vendor_name || req.suggested_vendor}
                        </div>
                      )}
                      {req.request_source && (
                        <div style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)', marginTop: 1 }}>
                          Source: {req.request_source}
                        </div>
                      )}
                      {req.reason && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)', fontStyle: 'italic' }}>"{req.reason}"</div>
                      )}
                      {req.approved_item_code && (
                        <div style={{ fontSize: 10, color: '#16a34a', fontFamily: 'monospace', marginTop: 2 }}>
                          Catalog Code: {req.approved_item_code}
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
                        {req.category_name || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Unassigned</span>}
                      </span>
                    </td>

                    {/* Unit */}
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-2, #f3f4f6)', border: '1px solid #e5e7eb', fontSize: 11, fontWeight: 600 }}>
                        {req.unit}
                      </span>
                    </td>

                    {/* Required Qty */}
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {Number(req.required_quantity || 0).toLocaleString()}
                    </td>

                    {/* Branch */}
                    <td>
                      <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--secondary)' }}>{formatBranchLabel(req.branch)}</span>
                    </td>

                    {/* Requested By */}
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{req.requested_by_name}</div>
                      {req.reviewed_by_name && (
                        <div style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)' }}>
                          Reviewed by {req.reviewed_by_name}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ textAlign: 'center' }}>
                      <span className={`store-status-badge ${req.status === 'Approved' ? 'active' : req.status === 'Rejected' ? 'inactive' : ''}`} style={req.status === 'Pending' ? { background: 'rgba(244, 180, 0, 0.15)', color: 'var(--primary-dark, #d97706)', border: '1px solid rgba(244, 180, 0, 0.3)' } : {}}>
                        {req.status}
                      </span>
                      {req.rejection_reason && (
                        <div style={{ fontSize: 10, color: '#dc2626', fontStyle: 'italic', marginTop: 2 }} title={req.rejection_reason}>
                          Reason: {req.rejection_reason}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      {req.status === 'Pending' ? (
                        isAdminOrDev ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleOpenApprove(req)}
                              className="store-btn store-btn-primary"
                              style={{ height: 28, padding: '0 10px', fontSize: 11 }}
                              title="Approve & Create Store Item"
                            >
                              <Check size={12} />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectingReq(req)}
                              className="store-action-btn delete"
                              style={{ height: 28, width: 28 }}
                              title="Reject Request"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary, #9ca3af)', fontStyle: 'italic' }}>Under Review</span>
                        )
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary, #9ca3af)' }}>Completed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW REQUEST MODAL */}
      <AddNewItemRequestModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        categories={categories}
        units={units}
        defaultBranch={selectedBranch}
        source="Requisitions"
        onSuccess={fetchRequests}
      />

      {/* APPROVE MODAL (MANAGERS) */}
      {approvingReq && (
        <div className="store-modal-overlay" onClick={() => setApprovingReq(null)}>
          <div className="store-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="store-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={22} style={{ color: '#059669' }} />
                <div>
                  <h3 className="store-modal-title">Approve & Register Store Item</h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
                    Approving #{approvingReq.request_number} will create an active item in catalog.
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setApprovingReq(null)} className="store-modal-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApproveSubmit}>
              <div className="store-modal-body">
                <div className="store-form-grid-2">
                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">Item Code (Leave empty to auto-generate next STR-XXXX)</label>
                    <input
                      type="text"
                      placeholder="Auto-generate e.g. STR-1015"
                      value={approveForm.item_code}
                      onChange={(e) => setApproveForm({ ...approveForm, item_code: e.target.value })}
                      className="store-form-input"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>

                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">Official Item Name</label>
                    <input
                      type="text"
                      value={approveForm.edited_item_name}
                      onChange={(e) => setApproveForm({ ...approveForm, edited_item_name: e.target.value })}
                      required
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Category</label>
                    <select
                      value={approveForm.edited_category_id}
                      onChange={(e) => setApproveForm({ ...approveForm, edited_category_id: e.target.value })}
                      className="store-form-select"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Measurement Unit</label>
                    <input
                      type="text"
                      value={approveForm.edited_unit}
                      onChange={(e) => setApproveForm({ ...approveForm, edited_unit: e.target.value })}
                      required
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">
                      Assign Vendor / Supplier
                      {approvingReq.vendor_id && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#059669', fontWeight: 600 }}>
                          (Attached from {approvingReq.request_source || 'Purchases'})
                        </span>
                      )}
                    </label>
                    <select
                      value={approveForm.vendor_id}
                      onChange={(e) => setApproveForm({ ...approveForm, vendor_id: e.target.value })}
                      className="store-form-select"
                    >
                      <option value="">-- Optional / Assign Vendor Later --</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="store-modal-footer">
                <button
                  type="button"
                  onClick={() => setApprovingReq(null)}
                  className="store-btn store-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isApproving}
                  className="store-btn store-btn-primary"
                >
                  {isApproving && <RefreshCw size={14} className="spin" />}
                  <span>Confirm Approval</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT MODAL (MANAGERS) */}
      {rejectingReq && (
        <div className="store-modal-overlay" onClick={() => setRejectingReq(null)}>
          <div className="store-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="store-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <XCircle size={22} style={{ color: 'var(--red, #ef4444)' }} />
                <h3 className="store-modal-title">Reject Item Requisition</h3>
              </div>
              <button type="button" onClick={() => setRejectingReq(null)} className="store-modal-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRejectSubmit}>
              <div className="store-modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary, #4b5563)', margin: '0 0 12px 0' }}>
                  Provide a clear reason for rejecting the request for <strong>{rejectingReq.item_name}</strong>:
                </p>
                <div className="store-form-group">
                  <textarea
                    rows="3"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    required
                    placeholder="e.g. Existing product STR-1004 is an exact equivalent. Requisition denied."
                    className="store-form-textarea"
                  ></textarea>
                </div>
              </div>

              <div className="store-modal-footer">
                <button
                  type="button"
                  onClick={() => setRejectingReq(null)}
                  className="store-btn store-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRejecting}
                  className="store-btn"
                  style={{ background: 'var(--red, #ef4444)', color: '#ffffff', fontWeight: 700 }}
                >
                  {isRejecting && <RefreshCw size={14} className="spin" />}
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
