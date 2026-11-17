import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  AlertTriangle, 
  CheckCircle2, 
  Eye, 
  RefreshCw, 
  Layers,
  ArrowUpDown,
  X,
  ExternalLink,
  ShieldCheck,
  Building2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { BRAND_CURRENCY } from '../../branding';

export default function InventoryItems({ user }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedVendor, setSelectedVendor] = useState('All');
  const [statusFilter, setStatusFilter] = useState('Active');

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    item_code: '',
    name: '',
    arabic_name: '',
    category_id: '',
    primary_unit: 'kg',
    secondary_unit: '',
    unit_conversion_ratio: 1,
    default_vendor_id: '',
    min_stock_level: 5,
    reorder_quantity: 10,
    last_purchase_price: 0,
    notes: '',
    status: 'Active'
  });
  const [submitting, setSubmitting] = useState(false);

  // Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Delete modal state
  const [deletingItem, setDeletingItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdminOrDev = useMemo(() => {
    const role = (user?.role || '').toLowerCase();
    return ['admin', 'developer', 'management'].includes(role);
  }, [user]);

  // Load auxiliary data (categories, units, vendors)
  const fetchAuxData = async () => {
    try {
      const [catsRes, unitsRes, vensRes] = await Promise.all([
        axios.get('/api/store/locations/categories'),
        axios.get('/api/store/locations/units'),
        axios.get('/api/store/vendors')
      ]);
      setCategories(catsRes.data || []);
      setUnits(unitsRes.data || []);
      setVendors(vensRes.data || []);
    } catch (err) {
      console.error('Error fetching categories or units:', err);
    }
  };

  // Load store items catalog
  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCategory !== 'All') params.category_id = selectedCategory;
      if (selectedVendor !== 'All') params.vendor_id = selectedVendor;
      if (statusFilter !== 'All') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await axios.get('/api/store/items', { params });
      setItems(res.data || []);
    } catch (err) {
      console.error('Error fetching store items:', err);
      toast.error('Failed to load store items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuxData();
  }, []);

  useEffect(() => {
    fetchItems();
  }, [selectedCategory, selectedVendor, statusFilter]);

  // Open modal for new item
  const handleAddNew = async () => {
    setEditingItem(null);
    try {
      const res = await axios.get('/api/store/items/next-code');
      setFormData({
        item_code: res.data.nextCode || 'STR-1001',
        name: '',
        arabic_name: '',
        category_id: categories.length > 0 ? categories[0].id : '',
        primary_unit: units.length > 0 ? units[0].short_code : 'kg',
        secondary_unit: '',
        unit_conversion_ratio: 1,
        default_vendor_id: '',
        min_stock_level: 5,
        reorder_quantity: 10,
        last_purchase_price: 0,
        notes: '',
        status: 'Active'
      });
    } catch {
      setFormData({
        item_code: '',
        name: '',
        arabic_name: '',
        category_id: categories.length > 0 ? categories[0].id : '',
        primary_unit: 'kg',
        secondary_unit: '',
        unit_conversion_ratio: 1,
        default_vendor_id: '',
        min_stock_level: 5,
        reorder_quantity: 10,
        last_purchase_price: 0,
        notes: '',
        status: 'Active'
      });
    }
    setShowModal(true);
  };

  // Open modal for editing item
  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      item_code: item.item_code || '',
      name: item.name || '',
      arabic_name: item.arabic_name || '',
      category_id: item.category_id || '',
      primary_unit: item.primary_unit || 'kg',
      secondary_unit: item.secondary_unit || '',
      unit_conversion_ratio: item.unit_conversion_ratio || 1,
      default_vendor_id: item.default_vendor_id || '',
      min_stock_level: item.min_stock_level || 0,
      reorder_quantity: item.reorder_quantity || 0,
      last_purchase_price: item.last_purchase_price || 0,
      notes: item.notes || '',
      status: item.status || 'Active'
    });
    setShowModal(true);
  };

  // Form submit (Add or Edit)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Item name is required');
      return;
    }
    if (!formData.primary_unit) {
      toast.error('Primary unit is required');
      return;
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        await axios.put(`/api/store/items/${editingItem.id}`, formData);
        toast.success('Store item updated successfully');
      } else {
        await axios.post('/api/store/items', formData);
        toast.success('Store item created successfully');
      }
      setShowModal(false);
      fetchItems();
    } catch (err) {
      console.error('Error saving item:', err);
      toast.error(err.response?.data?.error || 'Failed to save store item');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete / Archive item
  const confirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const res = await axios.delete(`/api/store/items/${deletingItem.id}`);
      toast.success(res.data.message || 'Item removed');
      setDeletingItem(null);
      fetchItems();
    } catch (err) {
      console.error('Error deleting item:', err);
      toast.error(err.response?.data?.error || 'Failed to delete item');
    } finally {
      setIsDeleting(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (items.length === 0) {
      toast.error('No items to export');
      return;
    }

    const exportData = items.map((it, idx) => ({
      'S.No': idx + 1,
      'Item Code': it.item_code,
      'Item Name': it.name,
      'Arabic Name': it.arabic_name || '',
      'Category': it.category_name || 'Unassigned',
      'Primary Unit': it.primary_unit,
      'Secondary Unit': it.secondary_unit || '',
      'Conversion Ratio': it.unit_conversion_ratio || 1,
      'Default Vendor': it.default_vendor_name || '',
      'Min Stock': Number(it.min_stock_level || 0),
      'Reorder Qty': Number(it.reorder_quantity || 0),
      [`Cost Price (${BRAND_CURRENCY})`]: Number(it.last_purchase_price || 0),
      'Status': it.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Store_Items');
    XLSX.writeFile(workbook, `AlRawaq_Store_Items_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Excel file exported successfully');
  };

  // Handle Excel / File Upload for Bulk Import
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setImporting(true);
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(sheet);

        if (rawJson.length === 0) {
          toast.error('The uploaded sheet is empty.');
          setImporting(false);
          return;
        }

        // Map column headers
        const parsedItems = rawJson.map(row => ({
          item_code: row['Item Code'] || row['item_code'] || '',
          name: row['Item Name'] || row['name'] || row['Name'],
          arabic_name: row['Arabic Name'] || row['arabic_name'] || null,
          category_name: row['Category'] || row['category_name'] || 'General',
          primary_unit: row['Primary Unit'] || row['primary_unit'] || 'kg',
          secondary_unit: row['Secondary Unit'] || row['secondary_unit'] || null,
          unit_conversion_ratio: parseFloat(row['Conversion Ratio'] || row['unit_conversion_ratio']) || 1,
          min_stock_level: parseFloat(row['Min Stock'] || row['min_stock_level']) || 5,
          reorder_quantity: parseFloat(row['Reorder Qty'] || row['reorder_quantity']) || 10,
          last_purchase_price: parseFloat(row[`Cost Price (${BRAND_CURRENCY})`] || row['last_purchase_price']) || 0
        })).filter(it => it.name && it.name.trim());

        if (parsedItems.length === 0) {
          toast.error('No valid rows found with Item Name.');
          setImporting(false);
          return;
        }

        const res = await axios.post('/api/store/items/bulk', { items: parsedItems });
        toast.success(`Import finished: ${res.data.created} created, ${res.data.updated} updated.`);
        setShowImportModal(false);
        fetchItems();
      } catch (err) {
        console.error('Error importing Excel:', err);
        toast.error('Failed to parse file: ' + err.message);
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Filter items in memory by quick search
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        it.name?.toLowerCase().includes(q) ||
        it.item_code?.toLowerCase().includes(q) ||
        it.arabic_name?.toLowerCase().includes(q) ||
        it.category_name?.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  return (
    <div className="store-module-wrap">
      {/* Top Action & Filter Header */}
      <div className="store-card">
        <div className="store-header-row">
          <div className="store-header-left">
            <div className="store-header-icon">
              <Package size={20} />
            </div>
            <div className="store-header-info">
              <h2 className="store-header-title">
                Store Items Catalog
                <span className="store-badge-count">
                  {filteredItems.length} Products
                </span>
              </h2>
              <p className="store-header-desc">
                Catalog for restaurant stores, ingredients, and consumables.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="store-header-actions">
            <button
              onClick={fetchItems}
              disabled={loading}
              className="store-btn-icon"
              title="Refresh Catalog"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>

            <button
              onClick={handleExportExcel}
              className="store-btn store-btn-outline"
              title="Export to Excel"
            >
              <Download size={15} />
              <span>Export</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="store-btn store-btn-outline"
              title="Import from Excel"
            >
              <Upload size={15} />
              <span>Import</span>
            </button>

            <button
              onClick={handleAddNew}
              className="store-btn store-btn-primary"
            >
              <Plus size={16} />
              <span>New Store Item</span>
            </button>
          </div>
        </div>

        {/* Filter Controls: Compact Layout */}
        <div className="store-filters-wrap" style={{ marginTop: 12 }}>
          {/* Row 1: Search, Supplier, Status Switchable */}
          <div className="store-filters-row">
            {/* Quick Search */}
            <div className="store-filter-col" style={{ flex: '2 1 220px' }}>
              <label className="store-filter-label">Search Item</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, color: '#9ca3af' }} />
                <input
                  type="text"
                  placeholder="Search code, item name, or Arabic..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="store-filter-input"
                  style={{ paddingLeft: 30, height: 34 }}
                />
              </div>
            </div>

            {/* Vendor Filter */}
            <div className="store-filter-col" style={{ flex: '1.2 1 160px' }}>
              <label className="store-filter-label">Supplier</label>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                className="store-filter-select"
                style={{ height: 34 }}
              >
                <option value="All">All Suppliers ({vendors.length})</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {/* Status Switchable Segmented Buttons */}
            <div className="store-filter-col-fixed">
              <label className="store-filter-label">Status</label>
              <div className="store-branch-segmented" style={{ height: 34 }}>
                {['All', 'Active', 'Inactive'].map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`store-branch-segmented-btn ${statusFilter === st ? 'active' : ''}`}
                    style={{ height: 26, padding: '0 12px' }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Horizontally Scrollable Category Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            <label className="store-filter-label">Category</label>
            <div className="store-category-bar">
              <button
                type="button"
                onClick={() => setSelectedCategory('All')}
                className={`store-category-pill ${selectedCategory === 'All' ? 'active' : ''}`}
              >
                All Categories ({items.length})
              </button>
              {categories.map(cat => {
                const count = items.filter(it => it.category_id === cat.id || it.category_name === cat.name).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`store-category-pill ${String(selectedCategory) === String(cat.id) ? 'active' : ''}`}
                  >
                    <span>{cat.icon || '📦'}</span>
                    <span>{cat.name}</span>
                    <span style={{ opacity: 0.7, fontSize: 10 }}>({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="store-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="store-table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Code</th>
                <th>Item Name</th>
                <th>Category</th>
                <th style={{ textAlign: 'center' }}>Primary Unit</th>
                <th style={{ textAlign: 'center' }}>Secondary Unit</th>
                <th>Default Supplier</th>
                <th style={{ textAlign: 'right' }}>Min Stock</th>
                <th style={{ textAlign: 'right' }}>Cost Price</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--primary, #F4B400)' }} />
                    <div>Loading store items catalog...</div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                    <Package size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div>No items found matching the current search & filters.</div>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id}>
                    {/* Item Code */}
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-dark, #d97706)' }}>
                      {item.item_code}
                    </td>

                    {/* Name & Arabic */}
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{item.name}</div>
                      {item.arabic_name && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)', direction: 'rtl' }}>
                          {item.arabic_name}
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'var(--surface-2, #f3f4f6)',
                        border: '1px solid #e5e7eb',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--secondary, #103C43)'
                      }}>
                        {item.category_icon && <span>{item.category_icon}</span>}
                        <span>{item.category_name || 'Unassigned'}</span>
                      </span>
                    </td>

                    {/* Primary Unit */}
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(244, 180, 0, 0.12)',
                        color: 'var(--primary-dark, #D4A000)',
                        border: '1px solid rgba(244, 180, 0, 0.3)',
                        fontSize: 11,
                        fontWeight: 700
                      }}>
                        {item.primary_unit}
                      </span>
                    </td>

                    {/* Secondary Unit */}
                    <td style={{ textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                      {item.secondary_unit ? (
                        <span style={{ fontSize: 12 }}>
                          {item.secondary_unit} <span style={{ opacity: 0.6 }}>({item.unit_conversion_ratio || 1}x)</span>
                        </span>
                      ) : (
                        <span style={{ opacity: 0.4 }}>-</span>
                      )}
                    </td>

                    {/* Default Vendor */}
                    <td>
                      {item.default_vendor_name ? (
                        <span style={{ fontSize: 12, fontWeight: 500 }} title={item.default_vendor_name}>
                          {item.default_vendor_name}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary, #9ca3af)', fontStyle: 'italic' }}>None</span>
                      )}
                    </td>

                    {/* Min Stock */}
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 12 }}>
                      {Number(item.min_stock_level || 0).toLocaleString()} <span style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)' }}>{item.primary_unit}</span>
                    </td>

                    {/* Cost Price */}
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, color: 'var(--text-primary, #111827)' }}>
                      {Number(item.last_purchase_price || 0).toFixed(2)} <span style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)' }}>{BRAND_CURRENCY}</span>
                    </td>

                    {/* Status */}
                    <td style={{ textAlign: 'center' }}>
                      <span className={`store-status-badge ${item.status === 'Active' ? 'active' : 'inactive'}`}>
                        {item.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="store-action-btn"
                          title="Edit Item"
                        >
                          <Edit3 size={14} />
                        </button>
                        {isAdminOrDev && (
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            className="store-action-btn delete"
                            title="Delete or Archive Item"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {showModal && (
        <div className="store-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="store-modal-dialog store-modal-dialog-lg" onClick={e => e.stopPropagation()}>
            <div className="store-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="store-header-icon">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="store-modal-title">
                    {editingItem ? 'Edit Store Item' : 'Create New Store Item'}
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
                    Configure stock tracking, units, and vendor reorder levels.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="store-modal-close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="store-modal-body">
                <div className="store-form-grid-3">
                  {/* ROW 1: Item Code, Name (English), Name (Arabic) */}
                  <div className="store-form-group">
                    <label className="store-form-label">
                      Item Code <span style={{ color: 'var(--primary-dark, #d97706)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.item_code}
                      onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                      required
                      placeholder="e.g. STR-1001"
                      className="store-form-input"
                      style={{ fontFamily: 'monospace', fontWeight: 700 }}
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">
                      Item Name (English) <span style={{ color: 'var(--red, #ef4444)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="e.g. Mozzarella Cheese Block"
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Item Name (Arabic)</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={formData.arabic_name}
                      onChange={(e) => setFormData({ ...formData, arabic_name: e.target.value })}
                      placeholder="مثال: جبنة موزاريلا قالب"
                      className="store-form-input"
                    />
                  </div>

                  {/* ROW 2: Category, Primary Unit, Status */}
                  <div className="store-form-group">
                    <label className="store-form-label">Category</label>
                    <select
                      value={formData.category_id}
                      onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                      className="store-form-select"
                    >
                      <option value="">Unassigned</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">
                      Primary Unit <span style={{ color: 'var(--red, #ef4444)' }}>*</span>
                    </label>
                    <select
                      value={formData.primary_unit}
                      onChange={(e) => setFormData({ ...formData, primary_unit: e.target.value })}
                      className="store-form-select"
                    >
                      {units.map(u => (
                        <option key={u.id} value={u.short_code}>{u.name} ({u.short_code})</option>
                      ))}
                      {!units.some(u => u.short_code === formData.primary_unit) && (
                        <option value={formData.primary_unit}>{formData.primary_unit}</option>
                      )}
                    </select>
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="store-form-select"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  {/* ROW 3: Default Supplier, Secondary Unit, Conversion Ratio */}
                  <div className="store-form-group">
                    <label className="store-form-label">Default Supplier</label>
                    <select
                      value={formData.default_vendor_id}
                      onChange={(e) => setFormData({ ...formData, default_vendor_id: e.target.value })}
                      className="store-form-select"
                    >
                      <option value="">None / Multiple</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Secondary Unit (Optional)</label>
                    <input
                      type="text"
                      value={formData.secondary_unit}
                      onChange={(e) => setFormData({ ...formData, secondary_unit: e.target.value })}
                      placeholder="e.g. Box, Carton, Pack"
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Conversion Ratio (1 Sec = X Pri)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={formData.unit_conversion_ratio}
                      onChange={(e) => setFormData({ ...formData, unit_conversion_ratio: parseFloat(e.target.value) || 1 })}
                      className="store-form-input"
                    />
                  </div>

                  {/* ROW 4: Cost Price, Min Stock, Suggested Reorder */}
                  <div className="store-form-group">
                    <label className="store-form-label">Cost Price ({BRAND_CURRENCY})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.last_purchase_price}
                      onChange={(e) => setFormData({ ...formData, last_purchase_price: parseFloat(e.target.value) || 0 })}
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Min Stock Reorder Level</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={formData.min_stock_level}
                      onChange={(e) => setFormData({ ...formData, min_stock_level: parseFloat(e.target.value) || 0 })}
                      className="store-form-input"
                    />
                  </div>

                  <div className="store-form-group">
                    <label className="store-form-label">Suggested Reorder Qty</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={formData.reorder_quantity}
                      onChange={(e) => setFormData({ ...formData, reorder_quantity: parseFloat(e.target.value) || 0 })}
                      className="store-form-input"
                    />
                  </div>

                  {/* ROW 5: Notes / Description (Span 3 columns) */}
                  <div className="store-form-group col-span-3">
                    <label className="store-form-label">Notes / Description</label>
                    <textarea
                      rows="2"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Optional storage notes, temperature requirements, shelf location, etc."
                      className="store-form-textarea"
                    ></textarea>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="store-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                  <span>{editingItem ? 'Save Changes' : 'Create Item'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMPORT EXCEL MODAL */}
      {showImportModal && (
        <div className="store-modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="store-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="store-modal-header">
              <h3 className="store-modal-title">
                <FileSpreadsheet style={{ color: 'var(--primary-dark, #d97706)' }} size={20} />
                Bulk Import Store Items
              </h3>
              <button onClick={() => setShowImportModal(false)} className="store-modal-close">
                <X size={18} />
              </button>
            </div>

            <div className="store-modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary, #4b5563)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                Upload an Excel spreadsheet (<span style={{ fontFamily: 'monospace', fontWeight: 600 }}>.xlsx</span> or <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>.csv</span>) with the following headers:
              </p>
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--surface-2, #f3f4f6)', border: '1px solid #d1d5db', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-primary, #111827)', lineHeight: 1.6 }}>
                <div>Item Code, Item Name, Arabic Name, Category,</div>
                <div>Primary Unit, Secondary Unit, Conversion Ratio,</div>
                <div>Min Stock, Reorder Qty, Cost Price ({BRAND_CURRENCY})</div>
              </div>

              <div style={{ marginTop: 16 }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="store-form-input"
                />
              </div>

              {importing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: 'var(--primary-dark, #d97706)', fontWeight: 600 }}>
                  <RefreshCw size={16} className="spin" />
                  Reading spreadsheet and processing catalog import...
                </div>
              )}
            </div>

            <div className="store-modal-footer">
              <button
                onClick={() => setShowImportModal(false)}
                className="store-btn store-btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deletingItem && (
        <div className="store-modal-overlay" onClick={() => setDeletingItem(null)}>
          <div className="store-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="store-modal-header">
              <h3 className="store-modal-title" style={{ color: 'var(--red, #ef4444)' }}>
                <AlertTriangle size={20} />
                Delete / Archive Item
              </h3>
              <button onClick={() => setDeletingItem(null)} className="store-modal-close">
                <X size={18} />
              </button>
            </div>
            <div className="store-modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-primary, #111827)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                Are you sure you want to remove <strong>{deletingItem.name}</strong> ({deletingItem.item_code})?
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', background: 'var(--surface-2, #f3f4f6)', padding: 12, borderRadius: 8, border: '1px solid #d1d5db', margin: 0 }}>
                <ShieldCheck size={14} style={{ display: 'inline', marginRight: 4, color: '#059669' }} />
                If this item has existing shift count or purchase records, it will be automatically <strong>Archived</strong> instead of deleted to protect historical accounting audit logs.
              </p>
            </div>
            <div className="store-modal-footer">
              <button
                onClick={() => setDeletingItem(null)}
                className="store-btn store-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="store-btn"
                style={{ background: 'var(--red, #ef4444)', color: '#ffffff', fontWeight: 700 }}
              >
                {isDeleting && <RefreshCw size={14} className="spin" />}
                Confirm Removal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
