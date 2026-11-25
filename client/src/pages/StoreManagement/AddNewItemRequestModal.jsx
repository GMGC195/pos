import React, { useState, useEffect } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { GitPullRequest, X, RefreshCw, Truck } from 'lucide-react';
import { BRAND_CURRENCY } from '../../branding';
import { formatBranchLabel } from './storeUtils';

/**
 * Reusable "Add New Item" Requisition Modal.
 * Shared across Requisitions, Purchases (auto-attaches selected vendor), and Stock Entry (no vendor auto-assigned).
 */
export default function AddNewItemRequestModal({
  isOpen,
  onClose,
  categories: propCategories = [],
  units: propUnits = [],
  defaultBranch = '',
  source = 'Requisitions', // 'Requisitions' | 'Purchases' | 'Stock Entry'
  attachedVendor = null,   // { id, name } when opened from Purchases
  onSuccess
}) {
  const [categories, setCategories] = useState(propCategories);
  const [units, setUnits] = useState(propUnits);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    branch: 'Branch 1',
    item_name: '',
    category_id: '',
    unit: 'KG',
    required_quantity: 10,
    min_stock: 5,
    suggested_vendor: '',
    estimated_price: 0,
    reason: ''
  });

  useEffect(() => {
    if (propCategories.length > 0) setCategories(propCategories);
    if (propUnits.length > 0) setUnits(propUnits);
  }, [propCategories, propUnits]);

  useEffect(() => {
    if (!isOpen) return;

    const loadMissingAux = async () => {
      try {
        const reqs = [];
        if (categories.length === 0) reqs.push(axios.get('/api/store/locations/categories').then(r => setCategories(r.data || [])));
        if (units.length === 0) reqs.push(axios.get('/api/store/locations/units').then(r => setUnits(r.data || [])));
        if (reqs.length > 0) await Promise.all(reqs);
      } catch (err) {
        console.error('Error loading requisition modal options:', err);
      }
    };
    loadMissingAux();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const resolvedBranch = defaultBranch && defaultBranch !== 'All' ? defaultBranch : 'Branch 1';

    setFormData({
      branch: resolvedBranch,
      item_name: '',
      category_id: categories.length > 0 ? categories[0].id : '',
      unit: units.length > 0 ? units[0].short_code : 'KG',
      required_quantity: 10,
      min_stock: 5,
      suggested_vendor: source === 'Purchases' && attachedVendor ? attachedVendor.name : '',
      estimated_price: 0,
      reason: ''
    });
  }, [isOpen, defaultBranch, source, attachedVendor, categories.length, units.length]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.item_name.trim()) {
      toast.error('Item name is required');
      return;
    }
    if (!formData.branch || formData.branch === 'All') {
      toast.error('Branch is required');
      return;
    }
    if (!formData.unit) {
      toast.error('Unit is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        request_source: source,
        vendor_id: source === 'Purchases' && attachedVendor ? attachedVendor.id : null,
        suggested_vendor: source === 'Stock Entry'
          ? ''
          : (source === 'Purchases' && attachedVendor ? attachedVendor.name : formData.suggested_vendor)
      };

      await axios.post('/api/store/requests', payload);
      toast.success('Item request submitted for Admin approval');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error submitting request:', err);
      toast.error(err.response?.data?.error || 'Failed to submit requisition');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="store-modal-overlay" onClick={onClose} style={{ zIndex: 10500 }}>
      <div className="store-modal-dialog store-modal-dialog-lg" onClick={e => e.stopPropagation()}>
        <div className="store-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="store-header-icon">
              <GitPullRequest size={20} />
            </div>
            <div>
              <h3 className="store-modal-title">Add New Item Request</h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
                Submit a new item requisition for Admin approval ({source}).
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="store-modal-close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="store-modal-body">
            {/* Branch indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--surface-2, #f3f4f6)',
              border: '1px solid #e5e7eb',
              marginBottom: 14,
              fontSize: 12
            }}>
              <span style={{ color: 'var(--text-secondary, #6b7280)', fontWeight: 600 }}>Target Branch:</span>
              <select
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                required
                className="store-form-select"
                style={{ padding: '4px 10px', fontSize: 12, width: 'auto', minWidth: 160 }}
              >
                <option value="Branch 1">Branch 1</option>
                <option value="Branch 2">Branch 2</option>
                <option value="Branch 3">Branch 3</option>
              </select>
            </div>

            {/* Attached Vendor Banner when requested from Purchases */}
            {source === 'Purchases' && attachedVendor && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 12px',
                borderRadius: 8,
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                marginBottom: 14,
                fontSize: 12,
                color: '#065f46'
              }}>
                <Truck size={15} />
                <span>
                  <strong>Attached Supplier:</strong> {attachedVendor.name} (will be linked to this item upon Admin approval)
                </span>
              </div>
            )}

            <div className="store-form-grid-3">
              {/* ROW 1: Requested Item Name */}
              <div className="store-form-group col-span-3">
                <label className="store-form-label">
                  Item Name <span style={{ color: 'var(--red, #ef4444)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  required
                  placeholder="e.g. Organic Pizza Sauce 5kg Pouch"
                  className="store-form-input"
                  autoFocus
                />
              </div>

              {/* ROW 2: Category, Unit, Required Qty */}
              <div className="store-form-group">
                <label className="store-form-label">Category</label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="store-form-select"
                >
                  <option value="">Select Category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="store-form-group">
                <label className="store-form-label">
                  Unit <span style={{ color: 'var(--red, #ef4444)' }}>*</span>
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  required
                  className="store-form-select"
                >
                  {units.map(u => (
                    <option key={u.id} value={u.short_code}>{u.name} ({u.short_code})</option>
                  ))}
                </select>
              </div>

              <div className="store-form-group">
                <label className="store-form-label">Required Quantity</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.required_quantity}
                  onChange={(e) => setFormData({ ...formData, required_quantity: parseFloat(e.target.value) || 0 })}
                  className="store-form-input"
                />
              </div>

              {/* ROW 3: Min Stock, Est Price, Supplier */}
              <div className="store-form-group">
                <label className="store-form-label">Target Min Stock Level</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({ ...formData, min_stock: parseFloat(e.target.value) || 0 })}
                  className="store-form-input"
                />
              </div>

              <div className="store-form-group">
                <label className="store-form-label">
                  Est. Unit Price ({BRAND_CURRENCY})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.estimated_price}
                  onChange={(e) => setFormData({ ...formData, estimated_price: parseFloat(e.target.value) || 0 })}
                  className="store-form-input"
                />
              </div>

              {source !== 'Stock Entry' && (
                <div className="store-form-group">
                  <label className="store-form-label">Supplier</label>
                  <input
                    type="text"
                    value={formData.suggested_vendor}
                    onChange={(e) => setFormData({ ...formData, suggested_vendor: e.target.value })}
                    readOnly={source === 'Purchases' && !!attachedVendor}
                    placeholder="e.g. Al Safi Danone"
                    className="store-form-input"
                    style={source === 'Purchases' && attachedVendor ? { background: 'var(--surface-2, #f3f4f6)', fontWeight: 600 } : {}}
                  />
                </div>
              )}

              {/* ROW 4: Reason / Justification */}
              <div className="store-form-group col-span-3">
                <label className="store-form-label">Reason / Justification</label>
                <textarea
                  rows="2"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Explain why this item is needed in the store..."
                  className="store-form-textarea"
                ></textarea>
              </div>
            </div>
          </div>

          <div className="store-modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="store-btn store-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="store-btn store-btn-primary"
            >
              {submitting && <RefreshCw size={14} className="spin" />}
              <span>Submit Requisition</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
