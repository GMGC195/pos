import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { 
  Settings, 
  Building2, 
  Layers, 
  Scale, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  X, 
  RefreshCw, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { formatBranchLabel } from './storeUtils';
import './storeManagement.css';

export default function StoreSettings({ user, onLocationsChanged }) {
  const [activeTab, setActiveTab] = useState('locations'); // 'locations' | 'categories' | 'units'

  // Data states
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);

  // Location Modal
  const [showLocModal, setShowLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  const [locForm, setLocForm] = useState({
    name: '',
    branch: '',
    code: '',
    store_type: 'Branch Store',
    description: '',
    is_active: true
  });

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
  const [unitForm, setUnitForm] = useState({
    name: '',
    short_code: '',
    conversion_factor: 1.0
  });

  const [saving, setSaving] = useState(false);

  const isManagerOrAdmin = useMemo(() => {
    const role = (user?.role || '').toLowerCase();
    return ['admin', 'developer', 'management', 'store manager'].includes(role);
  }, [user]);

  // Load all settings data
  const fetchAllSettings = async () => {
    setLoading(true);
    try {
      const [locsRes, catsRes, unitsRes, branchesRes] = await Promise.all([
        axios.get('/api/store/locations/locations'),
        axios.get('/api/store/locations/categories'),
        axios.get('/api/store/locations/units'),
        axios.get('/api/store/locations/branches')
      ]);
      setLocations(locsRes.data || []);
      setCategories(catsRes.data || []);
      setUnits(unitsRes.data || []);
      setBranches(branchesRes.data || []);
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
  // LOCATION HANDLERS
  // -------------------------------------------------------------
  const handleOpenNewLoc = () => {
    setEditingLoc(null);
    setLocForm({
      name: '',
      branch: branches[0] || 'Branch 1',
      code: '',
      store_type: 'Branch Store',
      description: '',
      is_active: true
    });
    setShowLocModal(true);
  };

  const handleEditLoc = (loc) => {
    setEditingLoc(loc);
    setLocForm({
      name: loc.name,
      branch: loc.branch,
      code: loc.code || '',
      store_type: loc.store_type || 'Branch Store',
      description: loc.description || '',
      is_active: loc.is_active !== false
    });
    setShowLocModal(true);
  };

  const handleSaveLoc = async (e) => {
    e.preventDefault();
    if (!locForm.name.trim() || !locForm.branch) {
      toast.error('Location name and branch are required');
      return;
    }

    setSaving(true);
    try {
      if (editingLoc) {
        await axios.put(`/api/store/locations/locations/${editingLoc.id}`, locForm);
        toast.success('Store location updated');
      } else {
        await axios.post('/api/store/locations/locations', locForm);
        toast.success('Store location created');
      }
      setShowLocModal(false);
      fetchAllSettings();
      if (onLocationsChanged) onLocationsChanged();
    } catch (err) {
      console.error('Error saving location:', err);
      toast.error(err.response?.data?.error || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------
  // CATEGORY HANDLERS
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
      console.error('Error saving category:', err);
      toast.error(err.response?.data?.error || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------
  // UNIT HANDLERS
  // -------------------------------------------------------------
  const handleOpenNewUnit = () => {
    setUnitForm({
      name: '',
      short_code: '',
      conversion_factor: 1.0
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
      await axios.post('/api/store/locations/units', unitForm);
      toast.success('Measurement unit created');
      setShowUnitModal(false);
      fetchAllSettings();
    } catch (err) {
      console.error('Error saving unit:', err);
      toast.error(err.response?.data?.error || 'Failed to save unit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="store-module-wrap">
      {/* Header and Sub-Tabs Card */}
      <div className="store-card">
        <div className="store-header-row">
          <div className="store-header-left">
            <div className="store-header-icon">
              <Settings size={20} />
            </div>
            <div className="store-header-info">
              <h2 className="store-header-title">Store Master Configuration</h2>
              <p className="store-header-desc">
                Manage branch physical stores, dynamic product categories, and measurement units.
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

        {/* Tab Switcher */}
        <div className="store-tabs">
          <button
            onClick={() => setActiveTab('locations')}
            className={`store-tab-btn ${activeTab === 'locations' ? 'active' : ''}`}
          >
            <Building2 size={14} />
            <span>Store Locations ({locations.length})</span>
          </button>

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

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: STORE LOCATIONS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'locations' && (
        <div className="store-card">
          <div className="store-header-row" style={{ borderBottom: 'none', marginBottom: 12 }}>
            <div className="store-header-info">
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Branch Store Locations</h3>
              <p className="store-header-desc">Stores holding physical inventory per restaurant branch.</p>
            </div>
            {isManagerOrAdmin && (
              <button
                onClick={handleOpenNewLoc}
                className="store-btn store-btn-primary"
              >
                <Plus size={15} />
                <span>Add Store Location</span>
              </button>
            )}
          </div>

          <div className="store-table-card">
            <table className="store-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Store Name</th>
                  <th>Branch</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-dark, #d97706)' }}>{loc.code}</td>
                    <td style={{ fontWeight: 600 }}>{loc.name}</td>
                    <td>
                      <span className="store-badge-count">{formatBranchLabel(loc.branch)}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{loc.store_type}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{loc.description || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="store-badge-count" style={{
                        background: loc.is_active !== false ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: loc.is_active !== false ? '#059669' : '#dc2626',
                        borderColor: loc.is_active !== false ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                      }}>
                        {loc.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {isManagerOrAdmin && (
                        <button
                          onClick={() => handleEditLoc(loc)}
                          className="store-btn-icon"
                          style={{ width: 30, height: 30 }}
                          title="Edit Location"
                        >
                          <Edit3 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: STORE CATEGORIES */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'categories' && (
        <div className="store-card">
          <div className="store-header-row" style={{ borderBottom: 'none', marginBottom: 12 }}>
            <div className="store-header-info">
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Dynamic Item Categories</h3>
              <p className="store-header-desc">Classify store items into organized groups.</p>
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
                  <th style={{ textAlign: 'center' }}>Icon</th>
                  <th>Category Name</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'center' }}>Sort Order</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id}>
                    <td style={{ textAlign: 'center', fontSize: 16 }}>{cat.icon || '📦'}</td>
                    <td style={{ fontWeight: 600 }}>{cat.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{cat.description || '-'}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{cat.sort_order}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="store-badge-count" style={{
                        background: cat.is_active !== false ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: cat.is_active !== false ? '#059669' : '#dc2626',
                        borderColor: cat.is_active !== false ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                      }}>
                        {cat.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {isManagerOrAdmin && (
                        <button
                          onClick={() => handleEditCat(cat)}
                          className="store-btn-icon"
                          style={{ width: 30, height: 30 }}
                          title="Edit Category"
                        >
                          <Edit3 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: UNITS OF MEASUREMENT */}
      {/* ------------------------------------------------------------- */}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LOCATION MODAL */}
      {showLocModal && (
        <div className="store-modal-overlay" onClick={() => setShowLocModal(false)}>
          <div className="store-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="store-modal-header">
              <h3 className="store-modal-title">
                <Building2 size={18} style={{ color: 'var(--primary-dark, #d97706)' }} />
                <span>{editingLoc ? 'Edit Store Location' : 'New Store Location'}</span>
              </h3>
              <button type="button" onClick={() => setShowLocModal(false)} className="store-modal-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveLoc}>
              <div className="store-modal-body">
                <div className="store-form-grid-2">
                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">Store Name *</label>
                    <input
                      type="text"
                      value={locForm.name}
                      onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                      required
                      placeholder="e.g. Main Dry Store"
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Branch *</label>
                    <select
                      value={locForm.branch}
                      onChange={(e) => setLocForm({ ...locForm, branch: e.target.value })}
                      className="store-form-select"
                    >
                      {branches.map(b => (
                        <option key={b} value={b}>{formatBranchLabel(b)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Store Code (Optional)</label>
                    <input
                      type="text"
                      value={locForm.code}
                      onChange={(e) => setLocForm({ ...locForm, code: e.target.value })}
                      placeholder="Auto-generated if empty"
                      className="store-form-input"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>

                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">Store Type</label>
                    <select
                      value={locForm.store_type}
                      onChange={(e) => setLocForm({ ...locForm, store_type: e.target.value })}
                      className="store-form-select"
                    >
                      <option value="Branch Store">Branch Store</option>
                      <option value="Central Warehouse">Central Warehouse</option>
                      <option value="Freezer Store">Freezer Store</option>
                      <option value="Chilled Room">Chilled Room</option>
                    </select>
                  </div>

                  <div className="store-form-group col-span-2">
                    <label className="store-form-label">Description / Notes</label>
                    <textarea
                      rows="2"
                      value={locForm.description}
                      onChange={(e) => setLocForm({ ...locForm, description: e.target.value })}
                      className="store-form-textarea"
                    ></textarea>
                  </div>
                </div>
              </div>

              <div className="store-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowLocModal(false)}
                  className="store-btn store-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="store-btn store-btn-primary"
                >
                  {saving && <RefreshCw size={14} className="spin" />}
                  <span>Save Location</span>
                </button>
              </div>
            </form>
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
                <span>{editingCat ? 'Edit Category' : 'New Category'}</span>
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
                      placeholder="e.g. Dairy & Cheeses"
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Icon / Emoji</label>
                    <input
                      type="text"
                      value={catForm.icon}
                      onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })}
                      placeholder="e.g. 🧀 or 🥫"
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group">
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
                <button
                  type="button"
                  onClick={() => setShowCatModal(false)}
                  className="store-btn store-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="store-btn store-btn-primary"
                >
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
                <span>Add Unit of Measurement</span>
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
                <button
                  type="button"
                  onClick={() => setShowUnitModal(false)}
                  className="store-btn store-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="store-btn store-btn-primary"
                >
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
