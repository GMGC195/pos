import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import {
  Settings,
  Layers,
  Scale,
  Plus,
  Edit3,
  Trash2,
  X,
  RefreshCw
} from 'lucide-react';
import './storeManagement.css';

export default function StoreSettings({ user }) {
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'units'

  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);

  // Category Modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState({
    name: '',
    description: '',
    icon: 'Package',
    sort_order: 0,
    is_active: true
  });

  // Unit Modal
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [unitForm, setUnitForm] = useState({
    name: '',
    short_code: '',
    conversion_factor: 1.0
  });

  const [saving, setSaving] = useState(false);

  const isManagerOrAdmin = useMemo(() => {
    const role = (user?.role || '').toLowerCase();
    return ['admin', 'developer'].includes(role);
  }, [user]);

  const fetchAllSettings = async () => {
    setLoading(true);
    try {
      const [catsRes, unitsRes] = await Promise.all([
        axios.get('/api/store/locations/categories'),
        axios.get('/api/store/locations/units')
      ]);
      setCategories(catsRes.data || []);
      setUnits(unitsRes.data || []);
    } catch (err) {
      console.error('Error fetching settings:', err);
      toast.error('Failed to load store settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllSettings();
  }, []);

  // -------------------------------------------------------------
  // CATEGORY CRUD HANDLERS
  // -------------------------------------------------------------
  const handleOpenNewCat = () => {
    setEditingCat(null);
    setCatForm({
      name: '',
      description: '',
      icon: 'Package',
      sort_order: categories.length + 1,
      is_active: true
    });
    setShowCatModal(true);
  };

  const handleEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({
      name: cat.name,
      description: cat.description || '',
      icon: cat.icon || 'Package',
      sort_order: cat.sort_order || 0,
      is_active: cat.is_active !== false
    });
    setShowCatModal(true);
  };

  const handleSaveCat = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingCat) {
        await axios.put(`/api/store/locations/categories/${editingCat.id}`, catForm);
        toast.success('Category updated');
      } else {
        await axios.post('/api/store/locations/categories', catForm);
        toast.success('Category created');
      }
      setShowCatModal(false);
      fetchAllSettings();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCat = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await axios.delete(`/api/store/locations/categories/${cat.id}`);
      toast.success('Category deleted');
      fetchAllSettings();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete category');
    }
  };

  // -------------------------------------------------------------
  // UNIT CRUD HANDLERS
  // -------------------------------------------------------------
  const handleOpenNewUnit = () => {
    setEditingUnit(null);
    setUnitForm({
      name: '',
      short_code: '',
      conversion_factor: 1.0
    });
    setShowUnitModal(true);
  };

  const handleEditUnit = (unit) => {
    setEditingUnit(unit);
    setUnitForm({
      name: unit.name,
      short_code: unit.short_code,
      conversion_factor: parseFloat(unit.conversion_factor) || 1.0
    });
    setShowUnitModal(true);
  };

  const handleSaveUnit = async (e) => {
    e.preventDefault();
    if (!unitForm.name.trim() || !unitForm.short_code.trim()) {
      toast.error('Unit name and short code are required');
      return;
    }
    setSaving(true);
    try {
      if (editingUnit) {
        await axios.put(`/api/store/locations/units/${editingUnit.id}`, unitForm);
        toast.success('Measurement unit updated');
      } else {
        await axios.post('/api/store/locations/units', unitForm);
        toast.success('Measurement unit created');
      }
      setShowUnitModal(false);
      fetchAllSettings();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save unit');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUnit = async (unit) => {
    if (!window.confirm(`Delete unit "${unit.name} (${unit.short_code})"?`)) return;
    try {
      await axios.delete(`/api/store/locations/units/${unit.id}`);
      toast.success('Unit deleted');
      fetchAllSettings();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete unit');
    }
  };

  return (
    <div className="store-module-wrap">
      <div className="store-card">
        <div className="store-header-row">
          <div className="store-header-left">
            <div className="store-header-icon">
              <Settings size={20} />
            </div>
            <div className="store-header-info">
              <h2 className="store-header-title">Store Master Configuration</h2>
              <p className="store-header-desc">
                Manage product categories and measurement units across Branch 1, Branch 2, and Branch 3.
              </p>
            </div>
          </div>

          <div className="store-header-actions">
            <button
              onClick={fetchAllSettings}
              disabled={loading}
              className="store-btn-icon"
              title="Refresh Settings"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        <div className="store-tabs">
          <button
            onClick={() => setActiveTab('categories')}
            className={`store-tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
          >
            <Layers size={14} />
            <span>Categories ({categories.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('units')}
            className={`store-tab-btn ${activeTab === 'units' ? 'active' : ''}`}
          >
            <Scale size={14} />
            <span>Units ({units.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: CATEGORIES */}
      {activeTab === 'categories' && (
        <div className="store-card">
          <div className="store-header-row" style={{ borderBottom: 'none', marginBottom: 12 }}>
            <div className="store-header-info">
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Item Categories</h3>
              <p className="store-header-desc">Organize store inventory into clear groups.</p>
            </div>
            {isManagerOrAdmin && (
              <button
                onClick={handleOpenNewCat}
                className="store-btn store-btn-primary"
              >
                <Plus size={15} />
                <span>Add Category</span>
              </button>
            )}
          </div>

          <div className="store-table-card">
            <table className="store-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Order</th>
                  <th>Category Name</th>
                  <th>Description</th>
                  {isManagerOrAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{cat.sort_order}</td>
                    <td style={{ fontWeight: 600 }}>{cat.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cat.description || '—'}</td>
                    {isManagerOrAdmin && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => handleEditCat(cat)}
                            className="store-btn-icon"
                            style={{ width: 30, height: 30 }}
                            title="Edit Category"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteCat(cat)}
                            className="store-action-btn delete"
                            style={{ width: 30, height: 30 }}
                            title="Delete Category"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: UNITS OF MEASUREMENT */}
      {activeTab === 'units' && (
        <div className="store-card">
          <div className="store-header-row" style={{ borderBottom: 'none', marginBottom: 12 }}>
            <div className="store-header-info">
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Units of Measurement</h3>
              <p className="store-header-desc">Standard measurement units for inventory counting and purchasing.</p>
            </div>
            {isManagerOrAdmin && (
              <button
                onClick={handleOpenNewUnit}
                className="store-btn store-btn-primary"
              >
                <Plus size={15} />
                <span>Add Unit</span>
              </button>
            )}
          </div>

          <div className="store-table-card">
            <table className="store-table">
              <thead>
                <tr>
                  <th>Unit Name</th>
                  <th style={{ textAlign: 'center' }}>Short Code</th>
                  <th style={{ textAlign: 'right' }}>Base Conversion Factor</th>
                  {isManagerOrAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {units.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="store-badge-count" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {u.short_code}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {Number(u.conversion_factor || 1).toFixed(2)}
                    </td>
                    {isManagerOrAdmin && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => handleEditUnit(u)}
                            className="store-btn-icon"
                            style={{ width: 30, height: 30 }}
                            title="Edit Unit"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteUnit(u)}
                            className="store-action-btn delete"
                            style={{ width: 30, height: 30 }}
                            title="Delete Unit"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {showCatModal && (
        <div className="store-modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="store-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="store-modal-header">
              <h3 className="store-modal-title">
                <Layers size={18} style={{ color: 'var(--primary-dark, #d97706)' }} />
                <span>{editingCat ? 'Edit Category' : 'Add Store Category'}</span>
              </h3>
              <button type="button" onClick={() => setShowCatModal(false)} className="store-modal-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCat}>
              <div className="store-modal-body">
                <div className="store-form-grid-2">
                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">Category Name *</label>
                    <input
                      type="text"
                      value={catForm.name}
                      onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                      required
                      placeholder="e.g. Frozen Toppings"
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">Sort Order</label>
                    <input
                      type="number"
                      value={catForm.sort_order}
                      onChange={(e) => setCatForm({ ...catForm, sort_order: parseInt(e.target.value, 10) || 0 })}
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">Description</label>
                    <textarea
                      rows="2"
                      value={catForm.description}
                      onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                      className="store-form-textarea"
                    ></textarea>
                  </div>
                </div>
              </div>

              <div className="store-modal-footer">
                <button type="button" onClick={() => setShowCatModal(false)} className="store-btn store-btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="store-btn store-btn-primary">
                  {saving && <RefreshCw size={14} className="spin" />}
                  <span>Save Category</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UNIT MODAL */}
      {showUnitModal && (
        <div className="store-modal-overlay" onClick={() => setShowUnitModal(false)}>
          <div className="store-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="store-modal-header">
              <h3 className="store-modal-title">
                <Scale size={18} style={{ color: 'var(--primary-dark, #d97706)' }} />
                <span>{editingUnit ? 'Edit Unit of Measurement' : 'Add Unit of Measurement'}</span>
              </h3>
              <button type="button" onClick={() => setShowUnitModal(false)} className="store-modal-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUnit}>
              <div className="store-modal-body">
                <div className="store-form-grid-2">
                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">Unit Name *</label>
                    <input
                      type="text"
                      value={unitForm.name}
                      onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                      required
                      placeholder="e.g. Kilogram, Litre, Carton"
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Short Code *</label>
                    <input
                      type="text"
                      value={unitForm.short_code}
                      onChange={(e) => setUnitForm({ ...unitForm, short_code: e.target.value })}
                      required
                      placeholder="e.g. KG, LTR, CTN, PCS"
                      className="store-form-input"
                      style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Base Conversion Factor</label>
                    <input
                      type="number"
                      step="0.001"
                      value={unitForm.conversion_factor}
                      onChange={(e) => setUnitForm({ ...unitForm, conversion_factor: parseFloat(e.target.value) || 1 })}
                      className="store-form-input"
                    />
                  </div>
                </div>
              </div>

              <div className="store-modal-footer">
                <button type="button" onClick={() => setShowUnitModal(false)} className="store-btn store-btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="store-btn store-btn-primary">
                  {saving && <RefreshCw size={14} className="spin" />}
                  <span>Save Unit</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
