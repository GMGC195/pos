import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import { 
  Plus, Edit, Trash2, FileText, X, Percent, Tag, Calendar, 
  MessageSquare, Check, AlertTriangle, Filter, ArrowDownRight, 
  ArrowUpRight, UserCheck, UserX, ChevronDown, Layers, ShieldCheck,
  Users, Search, Printer, Download, MoreVertical, RotateCcw, Edit2
} from 'lucide-react';
import { CURRENCY } from '../config';
import { useAuth } from '../contexts/AuthContext';
import OrderDetailModal from '../components/OrderDetailModal';
import { getSaudiCurrentMonthStr, getSaudiPreviousMonthStr } from '../utils/timezone';

const AVAILABLE_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3'];

const getCurrentMonthStr = () => {
  return getSaudiCurrentMonthStr();
};

const getShortMonthDisplay = (monthStr) => {
  if (!monthStr || monthStr === 'All') return 'Mo Bal:';
  const parts = monthStr.split('-');
  if (parts.length < 2) return `${monthStr}:`;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = new Date(y, m - 1, 1);
  return !isNaN(d.getTime()) ? `${d.toLocaleString('en-US', { month: 'short' })} Bal:` : `${monthStr}:`;
};

const getBranchShortName = (b) => {
  if (!b || b === 'All') return 'All';
  const match = b.match(/\d+/);
  if (match) return `B${match[0]}`;
  return b.length > 5 ? b.substring(0, 4) : b;
};

const formatMonthDisplay = (monthStr) => {
  if (!monthStr || monthStr === 'All') return 'All Months';
  const parts = monthStr.split('-');
  if (parts.length < 2) return monthStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = new Date(y, m - 1, 1);
  return !isNaN(d.getTime()) ? d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) : monthStr;
};

// ── MultiSelect Dropdown with Search ──────────────────────────────────────────
const MultiSelectDropdown = ({ options = [], selectedIds = [], onChange, placeholder = 'Select...', style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');

  const toggleId = (id) => {
    const idStr = id.toString();
    if (selectedIds.includes(idStr)) {
      onChange(selectedIds.filter(i => i !== idStr));
    } else {
      onChange([...selectedIds, idStr]);
    }
  };

  const filtered = options.filter(opt => 
    (opt.name || '').toLowerCase().includes(filterText.toLowerCase())
  );

  return (

    <div style={{ position: 'relative', flex: 1, minWidth: 180, ...style }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          padding: '8px 12px', 
          borderRadius: 6, 
          border: '1px solid var(--surface-3)', 
          background: 'var(--bg)', 
          color: 'var(--text)', 
          cursor: 'pointer', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          fontSize: 13,
          userSelect: 'none'
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85%' }}>
          {selectedIds.length > 0 ? `${selectedIds.length} Selected` : placeholder}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▼</span>
      </div>

      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100 }} onClick={() => setIsOpen(false)} />
          <div style={{ 
            position: 'absolute', 
            top: '100%', 
            left: 0, 
            right: 0, 
            background: 'var(--surface)', 
            border: '1px solid var(--surface-3)', 
            borderRadius: 8, 
            marginTop: 4, 
            maxHeight: 250, 
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1200, 
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)' 
          }}>
            <div style={{ padding: 6, borderBottom: '1px solid var(--surface-2)' }}>
              <input 
                autoFocus
                type="text" 
                placeholder="Search..." 
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--surface-2)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: 180 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No options found</div>
              ) : (
                filtered.map(opt => (
                  <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid var(--surface-2)', fontSize: 12.5 }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(opt.id.toString())}
                      onChange={() => toggleId(opt.id.toString())}
                    />
                    <span>{opt.name}</span>
                  </label>
                ))
              )}
            </div>
            {selectedIds.length > 0 && (
              <div style={{ padding: '4px 8px', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                <span>{selectedIds.length} selected</span>
                <button type="button" onClick={() => onChange([])} style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: 600 }}>Clear</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Reusable Custom Discount Rule Builder ─────────────────────────────────────
const DiscountRuleBuilder = ({ rules = [], setRules, categories = [], items = [] }) => {
  const [ruleTargetType, setRuleTargetType] = useState('all');
  const [ruleTargetIds, setRuleTargetIds] = useState([]);
  const [ruleDiscountType, setRuleDiscountType] = useState('percentage');
  const [ruleDiscountValue, setRuleDiscountValue] = useState('');

  const handleAddRule = () => {
    if (ruleTargetType !== 'all' && (!ruleTargetIds || ruleTargetIds.length === 0)) {
      return toast.error('Please select at least one category or item.');
    }
    const val = parseFloat(ruleDiscountValue);
    if (isNaN(val) || val <= 0) {
      return toast.error('Please enter a valid positive discount value.');
    }
    if (ruleDiscountType === 'percentage' && val > 100) {
      return toast.error('Percentage discount cannot exceed 100%.');
    }

    let newRules = [];
    if (ruleTargetType === 'all') {
      newRules.push({
        targetType: 'all',
        targetId: 'all',
        targetName: 'All Items',
        discountType: ruleDiscountType,
        discountValue: val
      });
    } else {
      ruleTargetIds.forEach(id => {
        let targetName = 'Unknown';
        if (ruleTargetType === 'category') {
          const cat = categories.find(c => c.id.toString() === id.toString());
          if (cat) targetName = cat.name;
        } else if (ruleTargetType === 'item') {
          const it = items.find(i => i.id.toString() === id.toString());
          if (it) targetName = it.name;
        }
        newRules.push({
          targetType: ruleTargetType,
          targetId: id.toString(),
          targetName,
          discountType: ruleDiscountType,
          discountValue: val
        });
      });
    }

    // Replace any existing rule for the exact same target
    const filteredOld = rules.filter(oldR => {
      return !newRules.some(nR => nR.targetType === oldR.targetType && nR.targetId === oldR.targetId);
    });

    setRules([...filteredOld, ...newRules]);
    setRuleTargetIds([]);
    setRuleDiscountValue('');
    toast.success(`Added ${newRules.length} discount rule(s)`);
  };

  const handleRemoveRule = (index) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  return (
    <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Existing Rules List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Configured Discount Rules ({rules.length})
          </span>
          {rules.length > 0 && (
            <button 
              type="button" 
              onClick={() => setRules([])}
              style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Clear All Rules
            </button>
          )}
        </div>

        {rules.length === 0 ? (
          <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', border: '1px dashed var(--surface-3)' }}>
            No rules added yet. Select categories or items below to configure custom discounts.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
            {rules.map((rule, idx) => (
              <div 
                key={idx} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  fontSize: 13, 
                  background: 'var(--bg)', 
                  padding: '7px 12px', 
                  borderRadius: 6, 
                  border: '1px solid var(--surface-3)' 
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ 
                    fontSize: 10, 
                    fontWeight: 700, 
                    padding: '2px 6px', 
                    borderRadius: 4, 
                    background: rule.targetType === 'category' ? '#eff6ff' : (rule.targetType === 'item' ? '#fef3c7' : '#f3e8ff'),
                    color: rule.targetType === 'category' ? '#1d4ed8' : (rule.targetType === 'item' ? '#b45309' : '#7e22ce')
                  }}>
                    {rule.targetType === 'category' ? 'Category' : (rule.targetType === 'item' ? 'Item' : 'All Items')}
                  </span>
                  <span style={{ fontWeight: 600 }}>{rule.targetName}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, color: '#059669', fontSize: 13 }}>
                    {rule.discountValue}{rule.discountType === 'percentage' ? '%' : ` ${CURRENCY}`} OFF
                  </span>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveRule(idx)} 
                    style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}
                    title="Remove Rule"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rule Creator Controls */}
      <div style={{ borderTop: '1px solid var(--surface-3)', paddingTop: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
          Add New Category / Item Rule:
        </span>
        
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select 
            value={ruleTargetType} 
            onChange={e => { setRuleTargetType(e.target.value); setRuleTargetIds([]); }} 
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
          >
            <option value="all">Apply For All Items</option>
            <option value="category">Specific Category</option>
            <option value="item">Specific Item</option>
          </select>
          
          {ruleTargetType === 'category' && (
            <MultiSelectDropdown 
              options={categories} 
              selectedIds={ruleTargetIds} 
              onChange={setRuleTargetIds} 
              placeholder="Select Categories..." 
            />
          )}

          {ruleTargetType === 'item' && (
            <MultiSelectDropdown 
              options={items} 
              selectedIds={ruleTargetIds} 
              onChange={setRuleTargetIds} 
              placeholder="Select Items..." 
            />
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select 
              value={ruleDiscountType} 
              onChange={e => setRuleDiscountType(e.target.value)} 
              style={{ padding: '8px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
            >
              <option value="percentage">%</option>
              <option value="fixed">{CURRENCY}</option>
            </select>

            <input 
              type="number" 
              step="0.5" 
              min="0"
              max={ruleDiscountType === 'percentage' ? 100 : undefined}
              value={ruleDiscountValue} 
              onChange={e => setRuleDiscountValue(e.target.value)} 
              placeholder="Discount" 
              style={{ width: 85, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} 
            />

            <button 
              type="button" 
              onClick={handleAddRule} 
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}
            >
              Add Rule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Credit() {
  const { user } = useAuth();
  // Ensure Developer role has full permissions identical to Admin
  const isAdmin = user?.role?.trim().toLowerCase() === 'admin' || user?.role?.trim().toLowerCase() === 'developer';
  const isManagement = user?.role?.trim().toLowerCase() === 'management';
  
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [selectedLedgerMonth, setSelectedLedgerMonth] = useState(getCurrentMonthStr());
  const [ledgerClassificationFilter, setLedgerClassificationFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Discount Packages
  const [discountPackages, setDiscountPackages] = useState([]);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [pkgName, setPkgName] = useState('');
  const [pkgRules, setPkgRules] = useState([]);
  const [pkgIsActive, setPkgIsActive] = useState(true);
  const [editingPackageId, setEditingPackageId] = useState(null);
  const [savingPackage, setSavingPackage] = useState(false);

  // Customer Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState(0);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [category, setCategory] = useState('Regular Customer');
  const [companyName, setCompanyName] = useState('');
  const [selectedMainMonth, setSelectedMainMonth] = useState(getCurrentMonthStr());
  const [balanceSort, setBalanceSort] = useState('default'); // 'default' | 'highest_balance' | 'lowest_balance'
  const [dbBranches, setDbBranches] = useState(['Branch 1', 'Branch 2', 'Branch 3']);
  const [actionMenuOpenId, setActionMenuOpenId] = useState(null);

  // Date Range Filter & Running Balance State inside Ledger
  const [showDateRangeFilter, setShowDateRangeFilter] = useState(false);
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [isDateRangeActive, setIsDateRangeActive] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [isExtraPay, setIsExtraPay] = useState(false);
  const [status, setStatus] = useState('Active');
  const [discountPackageId, setDiscountPackageId] = useState('');
  const [discountMode, setDiscountMode] = useState('none'); // 'none' | 'package' | 'custom'
  const [customerModalRules, setCustomerModalRules] = useState([]);

  // Registered Employees for Option A (Select Registered) vs Option B (Manual Entry)
  const [registeredEmployees, setRegisteredEmployees] = useState([]);
  const [employeeSelectMode, setEmployeeSelectMode] = useState('registered'); // 'registered' | 'manual'
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');

  // Category Filter & Branch Filter state
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');

  // Ledger Transaction Entry states: Exactly 3 options (Receive Major Payment, Add Debit, Extra Pay)
  const [paymentAmount, setPaymentAmount] = useState('');
  const [entryType, setEntryType] = useState('PAYMENT'); // 'PAYMENT' | 'CHARGE' | 'EXTRA_PAY'
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [billingMonth, setBillingMonth] = useState(getCurrentMonthStr());
  const [paymentComment, setPaymentComment] = useState('');

  // Custom Discounts State inside Ledger (Priority 1)
  const [customerCustomRules, setCustomerCustomRules] = useState([]);
  const [showLedgerDiscounts, setShowLedgerDiscounts] = useState(false);
  const [savingDiscounts, setSavingDiscounts] = useState(false);
  const [ledgerDiscountMode, setLedgerDiscountMode] = useState('none'); // 'package' | 'custom' | 'none'
  const [ledgerSelectedPackageId, setLedgerSelectedPackageId] = useState('');

  // Apply On Package Modal State
  const [applyOnPackage, setApplyOnPackage] = useState(null);
  const [applyOnFilter, setApplyOnFilter] = useState('All'); // 'All' | 'Employees' | 'Customers'
  const [applyOnSearch, setApplyOnSearch] = useState('');
  const [applyOnSelectedIds, setApplyOnSelectedIds] = useState(new Set());

  // Reset Balance Modal State (Admin & Developer Only - Single Customer)
  const [resetCustomerTarget, setResetCustomerTarget] = useState(null);
  const [singleResetConfirmInput, setSingleResetConfirmInput] = useState('');
  const [singleResetReason, setSingleResetReason] = useState('');
  const [resettingSingleBalance, setResettingSingleBalance] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Edit/Delete Transaction Modal State (Admin & Developer Only)
  const [editingTxModal, setEditingTxModal] = useState(null); // { isOpen: true, tx, amount, type, classification, comments, billing_month, reason }
  const [savingTxEdit, setSavingTxEdit] = useState(false);
  const [deletingTxModal, setDeletingTxModal] = useState(null); // { isOpen: true, tx, reason }
  const [deletingTx, setDeletingTx] = useState(false);
  const [savingApplyOn, setSavingApplyOn] = useState(false);

  // Items/Cats for dropdowns
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (isAdmin) {
      axios.get('/api/categories').then(r => setCategories(r.data || [])).catch(console.error);
      axios.get('/api/items').then(r => setItems(r.data || [])).catch(console.error);
      fetchDiscountPackages();
    }
  }, [isAdmin]);

  useEffect(() => {
    axios.get('/api/credit/branches').then(r => {
      if (Array.isArray(r.data) && r.data.length > 0) setDbBranches(r.data);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [branchFilter, selectedMainMonth, balanceSort]);

  const fetchEmployeesList = async () => {
    try {
      const res = await axios.get('/api/employees');
      setRegisteredEmployees(res.data || []);
    } catch (err) {
      console.error('Failed to load registered employees for Khata selection:', err);
    }
  };

  useEffect(() => {
    fetchEmployeesList();
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (actionMenuOpenId && !e.target.closest('.khata-action-menu-container')) {
        setActionMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [actionMenuOpenId]);

  const fetchDiscountPackages = async () => {
    try {
      const res = await axios.get('/api/credit/discount-packages');
      setDiscountPackages(res.data || []);
    } catch (err) {
      console.error('Failed to fetch discount packages:', err);
    }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = {
        month: selectedMainMonth,
        sortBy: balanceSort
      };
      if ((isAdmin || isManagement) && branchFilter !== 'All') {
        params.branch = branchFilter;
      }
      const res = await axios.get('/api/credit', { params });
      setCustomers(res.data || []);
    } catch (err) {
      toast.error('Failed to fetch credit customers');
    } finally {
      setLoading(false);
    }
  };

  // ── Discount Package Management ──────────────────────────────────────
  const handleOpenPackageModal = () => {
    setEditingPackageId(null);
    setPkgName('');
    setPkgRules([]);
    setPkgIsActive(true);
    setShowPackageModal(true);
    fetchDiscountPackages();
  };

  const handleEditPackage = (pkg) => {
    setEditingPackageId(pkg.id);
    setPkgName(pkg.name);
    let rules = pkg.discount_rules;
    if (typeof rules === 'string') {
      try { rules = JSON.parse(rules); } catch(e) { rules = []; }
    }
    setPkgRules(Array.isArray(rules) ? rules : []);
    setPkgIsActive(pkg.is_active);
  };

  const handleSavePackage = async (e) => {
    e.preventDefault();
    if (!pkgName.trim()) return toast.error('Package name is required');
    if (!pkgRules || pkgRules.length === 0) {
      return toast.error('Please configure at least one category or item discount rule for this package.');
    }

    // Enforce Unique Package Name
    const nameLower = pkgName.trim().toLowerCase();
    const isDuplicate = discountPackages.some(p => 
      p.name.trim().toLowerCase() === nameLower && p.id !== editingPackageId
    );
    if (isDuplicate) {
      return toast.error('A discount package with this name already exists. Please choose a unique name.');
    }

    setSavingPackage(true);
    try {
      const payload = {
        name: pkgName.trim(),
        discount_rules: pkgRules,
        discount_percentage: 0,
        is_active: pkgIsActive
      };

      if (editingPackageId) {
        await axios.put(`/api/credit/discount-packages/${editingPackageId}`, payload);
        toast.success('Discount package updated successfully');
      } else {
        await axios.post('/api/credit/discount-packages', payload);
        toast.success('Discount package created successfully');
      }

      setEditingPackageId(null);
      setPkgName('');
      setPkgRules([]);
      setPkgIsActive(true);
      fetchDiscountPackages();
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save discount package');
    } finally {
      setSavingPackage(false);
    }
  };

  const handleDeletePackage = async (id) => {
    if (!window.confirm('Are you sure you want to delete this discount package?')) return;
    try {
      await axios.delete(`/api/credit/discount-packages/${id}`);
      toast.success('Discount package deleted');
      fetchDiscountPackages();
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete package');
    }
  };

  // ── Customer Save / Edit / Delete ────────────────────────────────────
  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!name) return toast.error('Name is required');
    if (saving) return;

    if (discountMode === 'package' && !discountPackageId) {
      return toast.error('Please select an existing discount package or choose "No Discount".');
    }

    let finalPkgId = null;
    let finalRules = [];

    if (discountMode === 'package') {
      finalPkgId = discountPackageId ? parseInt(discountPackageId, 10) : null;
      finalRules = [];
    } else if (discountMode === 'custom') {
      finalPkgId = null;
      finalRules = customerModalRules;
    } else {
      finalPkgId = null;
      finalRules = [];
    }

    if (category === 'Company' && (!companyName || !companyName.trim())) {
      toast.error('Company Name is required for Company customers');
      return;
    }

    const payload = {
      name,
      phone,
      credit_limit: creditLimit,
      reference,
      notes,
      available_branches: isAdmin ? selectedBranches : [user?.branch?.split(',')[0]?.trim() || ''],
      category,
      company_name: category === 'Company' ? companyName.trim() : null,
      is_extra_pay: category === 'Employee' ? isExtraPay : false,
      employee_id: category === 'Employee' && employeeSelectMode === 'registered' && selectedEmployeeId ? parseInt(selectedEmployeeId, 10) : null,
      status,
      discount_package_id: finalPkgId,
      discount_rules: finalRules
    };

    setSaving(true);
    try {
      if (editingCustomer) {
        await axios.put(`/api/credit/${editingCustomer.id}`, payload);
        toast.success('Customer updated successfully');
      } else {
        await axios.post('/api/credit', payload);
        toast.success('Customer added successfully');
      }
      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error saving customer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (c) => {
    // Prevent deletion if balance is not 0
    if (Math.abs(Number(c.balance)) > 0.001) {
      return toast.error(
        `Cannot delete account with an outstanding balance of ${CURRENCY} ${Math.abs(c.balance).toFixed(2)}. Balance must be 0.00 before deletion.`,
        { duration: 5000 }
      );
    }

    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Are you sure you want to delete <b>{c.name}</b>'s Khata account?</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button 
            onClick={() => toast.dismiss(t.id)} 
            style={{ padding: '6px 12px', border: '1px solid var(--surface-3)', background: 'transparent', borderRadius: 6, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await axios.delete(`/api/credit/${c.id}`);
                toast.success('Customer deleted');
                fetchCustomers();
              } catch (err) {
                toast.error(err.response?.data?.error || 'Failed to delete customer');
              }
            }} 
            style={{ padding: '6px 12px', border: 'none', background: 'var(--red)', color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            Confirm Delete
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const handleSelectRegisteredEmployee = (empId) => {
    setSelectedEmployeeId(empId);
    if (!empId) return;
    const emp = registeredEmployees.find(e => e.id.toString() === empId.toString());
    if (emp) {
      setName(emp.name || '');
      if (emp.phones || emp.phone) {
        setPhone(emp.phones || emp.phone || '');
      }
      const empCode = emp.employee_id ? (String(emp.employee_id).startsWith('EMP') ? emp.employee_id : `EMP-${emp.employee_id}`) : '';
      setReference(empCode || '');
    }
  };

  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setReference('');
    setNotes('');
    setCreditLimit(0);
    setSelectedBranches(AVAILABLE_BRANCHES);
    setCategory('Regular Customer');
    setCompanyName('');
    setIsExtraPay(false);
    setStatus('Active');
    setDiscountMode('none');
    setDiscountPackageId('');
    setCustomerModalRules([]);
    setEmployeeSelectMode('registered');
    setSelectedEmployeeId('');
    setEmployeeSearchTerm('');
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
    setCategory(customer.category || 'Regular Customer');
    setCompanyName(customer.company_name || '');
    setIsExtraPay(Boolean(customer.is_extra_pay));
    setStatus(customer.status || 'Active');
    setEmployeeSearchTerm('');

    if (customer.category === 'Employee') {
      if (customer.employee_id) {
        setEmployeeSelectMode('registered');
        setSelectedEmployeeId(customer.employee_id.toString());
      } else {
        setEmployeeSelectMode('manual');
        setSelectedEmployeeId('');
      }
    } else {
      setEmployeeSelectMode('registered');
      setSelectedEmployeeId('');
    }

    let custRules = customer.discount_rules;
    if (typeof custRules === 'string') {
      try { custRules = JSON.parse(custRules); } catch(e) { custRules = []; }
    }
    const parsedRules = Array.isArray(custRules) ? custRules : [];

    if (customer.discount_package_id) {
      setDiscountMode('package');
      setDiscountPackageId(customer.discount_package_id.toString());
      setCustomerModalRules([]);
    } else if (parsedRules.length > 0) {
      setDiscountMode('custom');
      setDiscountPackageId('');
      setCustomerModalRules(parsedRules);
    } else {
      setDiscountMode('none');
      setDiscountPackageId('');
      setCustomerModalRules([]);
    }

    setShowModal(true);
  };

  // ── Month-Wise Balance Breakdown & Ledger ────────────────────────────
  const openLedger = async (customer) => {
    setActiveCustomer(customer);
    setLedger([]);
    setMonthlySummary([]);
    setPaymentAmount('');
    setEntryType('PAYMENT');
    setPaymentMethod('Cash');
    setPaymentComment('');
    
    // Respect selectedMainMonth from main page (if set and valid, otherwise current month)
    const initialMonth = (selectedMainMonth && selectedMainMonth !== '') ? selectedMainMonth : getCurrentMonthStr();
    setSelectedLedgerMonth(initialMonth);
    setBillingMonth(initialMonth !== 'All' ? initialMonth : getCurrentMonthStr());
    setLedgerClassificationFilter('All');
    setShowLedgerDiscounts(false);

    let custRules = customer.discount_rules;
    if (typeof custRules === 'string') {
      try { custRules = JSON.parse(custRules); } catch(e) { custRules = []; }
    }
    const parsedRules = Array.isArray(custRules) ? custRules : [];
    setCustomerCustomRules(parsedRules);

    if (customer.discount_package_id) {
      setLedgerDiscountMode('package');
      setLedgerSelectedPackageId(customer.discount_package_id.toString());
    } else if (parsedRules.length > 0) {
      setLedgerDiscountMode('custom');
      setLedgerSelectedPackageId('');
    } else {
      setLedgerDiscountMode('none');
      setLedgerSelectedPackageId('');
    }

    setIsDateRangeActive(false);
    setFilterFromDate('');
    setFilterToDate('');
    setShowDateRangeFilter(false);
    setOpeningBalance(0);

    try {
      const ledgerParams = { with_meta: 'true' };
      if (initialMonth !== 'All') {
        ledgerParams.month = initialMonth;
      }
      const [ledgerRes, summaryRes] = await Promise.all([
        axios.get(`/api/credit/${customer.id}/ledger`, { params: ledgerParams }),
        axios.get(`/api/credit/${customer.id}/monthly-summary`)
      ]);
      const txs = Array.isArray(ledgerRes.data) ? ledgerRes.data : (ledgerRes.data?.transactions || []);
      const openBal = Array.isArray(ledgerRes.data) ? 0 : (parseFloat(ledgerRes.data?.opening_balance) || 0);
      setLedger(txs);
      setOpeningBalance(openBal);
      setMonthlySummary(summaryRes.data || []);
      setShowLedger(true);
    } catch (err) {
      toast.error('Failed to load ledger and monthly breakdown');
    }
  };

  const reloadLedger = async (month = selectedLedgerMonth, classification = ledgerClassificationFilter, customFrom = null, customTo = null) => {
    if (!activeCustomer) return;
    try {
      const params = { with_meta: 'true' };
      if (customFrom) {
        params.from_date = customFrom;
        if (customTo) params.to_date = customTo;
      } else {
        if (month && month !== 'All') params.month = month;
      }
      if (classification && classification !== 'All') params.classification = classification;

      const [ledgerRes, summaryRes] = await Promise.all([
        axios.get(`/api/credit/${activeCustomer.id}/ledger`, { params }),
        axios.get(`/api/credit/${activeCustomer.id}/monthly-summary`)
      ]);
      const txs = Array.isArray(ledgerRes.data) ? ledgerRes.data : (ledgerRes.data?.transactions || []);
      const openBal = Array.isArray(ledgerRes.data) ? 0 : (parseFloat(ledgerRes.data?.opening_balance) || 0);
      setLedger(txs);
      setOpeningBalance(openBal);
      setMonthlySummary(summaryRes.data || []);
    } catch (err) {
      console.error('Error reloading ledger:', err);
    }
  };

  const handleSelectLedgerMonth = (m) => {
    setSelectedLedgerMonth(m);
    setIsDateRangeActive(false);
    setFilterFromDate('');
    setFilterToDate('');
    setBillingMonth(m !== 'All' ? m : getCurrentMonthStr());
    reloadLedger(m, ledgerClassificationFilter);
  };

  // Reset Single Customer Balance Handler (Admin & Developer Only)
  const handleResetSingleCustomerBalance = async () => {
    if (!resetCustomerTarget) return;
    if (singleResetConfirmInput.trim().toUpperCase() !== 'RESET') {
      toast.error('Please type RESET to confirm.');
      return;
    }
    if (!singleResetReason.trim()) {
      toast.error('Please provide a mandatory reason for resetting balance.');
      return;
    }
    setResettingSingleBalance(true);
    try {
      const res = await axios.post(`/api/credit/${resetCustomerTarget.id}/reset-balance`, {
        reason: singleResetReason.trim()
      });
      toast.success(res.data?.message || `Balance for ${resetCustomerTarget.name} reset to 0.00 successfully!`);
      
      // Update customers array in state
      setCustomers(prev => prev.map(c => c.id === resetCustomerTarget.id ? { ...c, balance: 0 } : c));
      
      // If modal is open for this customer, update activeCustomer & reload ledger
      if (activeCustomer && activeCustomer.id === resetCustomerTarget.id) {
        setActiveCustomer(prev => ({ ...prev, balance: 0 }));
        reloadLedger(selectedLedgerMonth, ledgerClassificationFilter);
      }
      
      setResetCustomerTarget(null);
      setSingleResetConfirmInput('');
      setSingleResetReason('');
      fetchCustomers();
    } catch (err) {
      console.error('Error resetting customer balance:', err);
      toast.error(err.response?.data?.error || 'Failed to reset customer balance');
    } finally {
      setResettingSingleBalance(false);
    }
  };

  // Transaction Edit / Delete Handlers (Admin & Developer Only)
  const handleOpenEditTxModal = (tx) => {
    setEditingTxModal({
      isOpen: true,
      tx,
      amount: tx.amount,
      type: tx.type,
      classification: tx.classification || (tx.type === 'CREDIT_ORDER' || tx.type === 'CHARGE' ? 'Order' : 'Payment'),
      comments: tx.comments || '',
      billing_month: tx.billing_month || '',
      reason: ''
    });
  };

  const handleSaveTxEdit = async () => {
    if (!editingTxModal) return;
    const { tx, amount, type, classification, comments, billing_month, reason } = editingTxModal;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid positive amount.');
      return;
    }
    if (!reason || !reason.trim()) {
      toast.error('Reason for modification is mandatory for the audit log.');
      return;
    }

    setSavingTxEdit(true);
    try {
      const res = await axios.put(`/api/credit/transactions/${tx.id}`, {
        amount: numAmount,
        type,
        classification,
        comments,
        billing_month: billing_month || null,
        reason: reason.trim()
      });
      toast.success(res.data?.message || 'Transaction updated successfully!');
      setEditingTxModal(null);
      if (activeCustomer) {
        reloadLedger(selectedLedgerMonth, ledgerClassificationFilter);
        const custRes = await axios.get('/api/credit');
        setCustomers(custRes.data || []);
        const updated = custRes.data.find(c => c.id === activeCustomer.id);
        if (updated) setActiveCustomer(updated);
      } else {
        fetchCustomers();
      }
    } catch (err) {
      console.error('Error editing transaction:', err);
      toast.error(err.response?.data?.error || 'Failed to update transaction');
    } finally {
      setSavingTxEdit(false);
    }
  };

  const handleOpenDeleteTxModal = (tx) => {
    setDeletingTxModal({
      isOpen: true,
      tx,
      reason: ''
    });
  };

  const handleConfirmDeleteTx = async () => {
    if (!deletingTxModal) return;
    const { tx, reason } = deletingTxModal;
    if (!reason || !reason.trim()) {
      toast.error('Please provide a reason for deleting this transaction.');
      return;
    }

    setDeletingTx(true);
    try {
      const res = await axios.delete(`/api/credit/transactions/${tx.id}`, {
        data: { reason: reason.trim() }
      });
      toast.success(res.data?.message || 'Transaction deleted and balance recalculated.');
      setDeletingTxModal(null);
      if (activeCustomer) {
        reloadLedger(selectedLedgerMonth, ledgerClassificationFilter);
        const custRes = await axios.get('/api/credit');
        setCustomers(custRes.data || []);
        const updated = custRes.data.find(c => c.id === activeCustomer.id);
        if (updated) setActiveCustomer(updated);
      } else {
        fetchCustomers();
      }
    } catch (err) {
      console.error('Error deleting transaction:', err);
      toast.error(err.response?.data?.error || 'Failed to delete transaction');
    } finally {
      setDeletingTx(false);
    }
  };

  const handleApplyDateRange = () => {
    if (!filterFromDate) {
      toast.error('Please select From Date');
      return;
    }
    setIsDateRangeActive(true);
    reloadLedger(null, ledgerClassificationFilter, filterFromDate, filterToDate || filterFromDate);
  };

  const handleClearDateRange = () => {
    setIsDateRangeActive(false);
    setFilterFromDate('');
    setFilterToDate('');
    reloadLedger(selectedLedgerMonth, ledgerClassificationFilter);
  };

  // Helper to compile statement period, balances and transaction data consistently across Print, PDF & Excel
  const getStatementData = () => {
    if (!activeCustomer) return null;

    let periodLabel = '';
    let statementMonth = '';

    if (isDateRangeActive && filterFromDate) {
      periodLabel = `From ${filterFromDate} To ${filterToDate || filterFromDate}`;
      statementMonth = 'Custom Range';
    } else if (selectedLedgerMonth !== 'All') {
      const parts = selectedLedgerMonth.split('-');
      if (parts.length === 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const lastDay = new Date(y, m, 0).getDate();
        const fromStr = `${selectedLedgerMonth}-01`;
        const toStr = `${selectedLedgerMonth}-${String(lastDay).padStart(2, '0')}`;
        periodLabel = `From ${fromStr} To ${toStr}`;
        statementMonth = formatMonthDisplay(selectedLedgerMonth);
      } else {
        periodLabel = `From ${selectedLedgerMonth} To ${selectedLedgerMonth}`;
        statementMonth = selectedLedgerMonth;
      }
    } else {
      if (processedTransactions.length > 0) {
        const dates = processedTransactions.map(t => new Date(t.created_at).getTime()).filter(t => !isNaN(t));
        if (dates.length > 0) {
          const minD = new Date(Math.min(...dates)).toISOString().slice(0, 10);
          const maxD = new Date(Math.max(...dates)).toISOString().slice(0, 10);
          periodLabel = `From ${minD} To ${maxD}`;
        } else {
          periodLabel = 'From Beginning To Present';
        }
      } else {
        periodLabel = 'From Beginning To Present';
      }
      statementMonth = 'All Months';
    }

    const totalBills = processedTransactions
      .filter(t => !t.isCancelled && (t.type === 'CHARGE' || t.type === 'CREDIT_ORDER'))
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    const totalPayments = processedTransactions
      .filter(t => !t.isCancelled && t.type === 'PAYMENT')
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    const openBal = parseFloat(openingBalance || 0);
    const closingBal = openBal + totalBills - totalPayments;
    const sortedTxs = [...processedTransactions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    return {
      periodLabel,
      statementMonth,
      totalBills,
      totalPayments,
      openBal,
      closingBal,
      sortedTxs
    };
  };

  // 1. Redesigned Thermal Printer Optimized Print Slip (Top-aligned, dynamic height, 80mm/58mm friendly)
  const handlePrintSlip = () => {
    const data = getStatementData();
    if (!data) return;
    const { periodLabel, statementMonth, totalBills, totalPayments, openBal, closingBal, sortedTxs } = data;

    const itemsHtml = sortedTxs.map((t) => {
      const isDebit = t.type === 'CHARGE' || t.type === 'CREDIT_ORDER';
      const amt = parseFloat(t.amount || 0);
      const isOrder = t.type === 'CREDIT_ORDER' || t.order_id;
      
      let descLine1 = '';
      let descLine2 = '';
      if (isOrder) {
        const orderNum = t.slip_number || t.order_id || '';
        descLine1 = orderNum ? `Order #${orderNum}` : 'Order Sale';
        let itemNames = '';
        if (Array.isArray(t.order_items) && t.order_items.length > 0) {
          itemNames = t.order_items.map(i => `${i.qty > 1 ? `${i.qty}x ` : ''}${i.item_name}`).join(', ');
        }
        descLine2 = itemNames || t.comments || '';
      } else if (t.type === 'PAYMENT') {
        descLine1 = `Payment Received${t.payment_method ? ` (${t.payment_method})` : ''}`;
        descLine2 = t.comments || '';
      } else if (t.type === 'CHARGE') {
        descLine1 = 'Manual Debit';
        descLine2 = t.comments || '';
      } else {
        descLine1 = t.type === 'DEBIT_ADJUSTMENT' ? 'Debit Adjustment' : (t.type === 'CREDIT_ADJUSTMENT' ? 'Credit Adjustment' : (t.type || 'Adjustment'));
        descLine2 = t.comments || '';
      }

      const txDateStr = new Date(t.created_at).toLocaleDateString() + ' ' + new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div style="padding: 4px 0; border-bottom: 1px dashed #cbd5e1; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 11px;">
            <span style="color: #64748b; font-size: 9.5px;">${txDateStr}</span>
            <span style="font-weight: 800; font-size: 11.5px; color: ${isDebit ? '#dc2626' : '#16a34a'};">
              ${isDebit ? '+' : '-'}SAR ${amt.toFixed(2)}
            </span>
          </div>
          <div style="font-weight: 700; color: #0f172a; font-size: 11px; margin-top: 1px;">
            ${descLine1}
          </div>
          ${descLine2 ? `<div style="font-size: 10px; color: #475569; margin-top: 1px; word-break: break-word; line-height: 1.25;">${descLine2}</div>` : ''}
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <title></title>
      <style>
        @page {
          size: 80mm auto;
          margin: 0mm;
        }
        @media print {
          html, body {
            width: 80mm !important;
            margin: 0 !important;
            padding: 2mm 3mm !important;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        * { box-sizing: border-box; }
        body {
          width: 80mm;
          max-width: 100%;
          margin: 0;
          padding: 2mm 3mm;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace, sans-serif;
          color: #0f172a;
          line-height: 1.3;
          font-size: 11px;
        }
        .header {
          text-align: center;
          border-bottom: 1.5px dashed #0f172a;
          padding-bottom: 5px;
          margin-bottom: 6px;
        }
        .cust-name {
          font-size: 14px;
          font-weight: 900;
          text-transform: uppercase;
          word-break: break-word;
          margin-bottom: 2px;
        }
        .doc-title {
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }
        .period-info {
          font-size: 9.5px;
          color: #475569;
          margin-top: 2px;
        }
        .summary-box {
          border-bottom: 1.5px dashed #0f172a;
          padding-bottom: 5px;
          margin-bottom: 6px;
          font-size: 10.5px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 1px 0;
        }
        .summary-label {
          color: #475569;
          font-weight: 600;
        }
        .summary-val {
          font-weight: 700;
          color: #0f172a;
        }
        .section-title {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #475569;
          margin-bottom: 3px;
        }
        .footer {
          text-align: center;
          border-top: 1.5px dashed #0f172a;
          margin-top: 8px;
          padding-top: 5px;
          font-size: 9.5px;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="cust-name">${activeCustomer.name}</div>
        <div class="doc-title">KHATA STATEMENT</div>
        <div class="period-info">Period: ${periodLabel}</div>
        <div class="period-info">Month: ${statementMonth}</div>
      </div>

      <div class="summary-box">
        <div class="summary-row">
          <span class="summary-label">Opening Balance:</span>
          <span class="summary-val">SAR ${openBal.toFixed(2)}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Total Bills (Charges):</span>
          <span class="summary-val" style="color: #dc2626;">SAR ${totalBills.toFixed(2)}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Total Payments Received:</span>
          <span class="summary-val" style="color: #16a34a;">SAR ${totalPayments.toFixed(2)}</span>
        </div>
        <div class="summary-row" style="border-top: 1px dotted #94a3b8; margin-top: 3px; padding-top: 3px; font-size: 12px; font-weight: 900;">
          <span class="summary-label" style="font-weight: 800; color: #0f172a;">Closing Balance:</span>
          <span class="summary-val" style="color: ${closingBal > 0 ? '#dc2626' : (closingBal < 0 ? '#16a34a' : '#0f172a')};">
            SAR ${Math.abs(closingBal).toFixed(2)} ${closingBal > 0 ? '(Due)' : (closingBal < 0 ? '(Adv)' : '(0.00)')}
          </span>
        </div>
      </div>

      <div class="section-title">Transactions (${sortedTxs.length})</div>
      <div>
        ${itemsHtml || '<div style="padding: 8px 0; text-align: center; color: #94a3b8; font-style: italic;">No transactions in this period.</div>'}
      </div>

      <div class="footer">
        <div>Printed: ${new Date().toLocaleString()}</div>
        <div style="margin-top: 2px; font-weight: 700;">*** Thank You ***</div>
      </div>
    </body>
    </html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1500);
    }, 400);
  };

  // 2. Redesigned Detailed PDF Statement Download (Multi-page, Product Breakdown, jsPDF + AutoTable + Arabic Font & Shaping)
  const handleExportPDF = async () => {
    const data = getStatementData();
    if (!data) return;
    const { periodLabel, statementMonth, totalBills, totalPayments, openBal, closingBal, sortedTxs } = data;

    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const { loadArabicPdfFonts, formatArabicForDocText, formatArabicForTable } = await import('../utils/arabicPdfHelper');

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      // Register Arabic TrueType Fonts (Amiri-Regular & Amiri-Bold)
      try {
        await loadArabicPdfFonts(doc);
        doc.setFont('Amiri', 'bold');
      } catch (fontErr) {
        console.warn('Could not load Amiri font, falling back to standard font:', fontErr);
        doc.setFont('helvetica', 'bold');
      }
      const activeFont = doc.getFontList()['Amiri'] ? 'Amiri' : 'helvetica';

      // 1. Heading
      doc.setFont(activeFont, 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42); // #0f172a
      const titleRaw = `${(activeCustomer.name || 'CUSTOMER').toUpperCase()} – KHATA STATEMENT`;
      const titleFormatted = formatArabicForDocText(titleRaw);
      const titleLines = doc.splitTextToSize(titleFormatted, pageWidth - (margin * 2));
      doc.text(titleLines, margin, 18);

      let currentY = 18 + (titleLines.length * 6);

      // 2. Statement Period
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105); // #475569
      doc.text(`Statement Period: ${periodLabel}`, margin, currentY);
      currentY += 8;

      // 3. Summary & Customer Details
      doc.setFontSize(9.5);
      doc.setFont(activeFont, 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text('Statement Month:', margin, currentY);
      doc.setFont(activeFont, 'normal');
      doc.text(formatArabicForDocText(statementMonth), margin + 40, currentY);
      currentY += 5.5;

      if (activeCustomer.category || activeCustomer.company_name) {
        doc.setFont(activeFont, 'bold');
        doc.text('Customer Info:', margin, currentY);
        doc.setFont(activeFont, 'normal');
        const custMeta = `${activeCustomer.name || 'Customer'}${activeCustomer.category ? ` (${activeCustomer.category})` : ''}${activeCustomer.company_name ? ` • ${activeCustomer.company_name}` : ''}`;
        doc.text(formatArabicForDocText(custMeta), margin + 40, currentY);
        currentY += 5.5;
      }

      doc.setFont(activeFont, 'bold');
      doc.text('Opening Balance:', margin, currentY);
      doc.setFont(activeFont, 'normal');
      doc.text(`SAR ${openBal.toFixed(2)}`, margin + 40, currentY);
      currentY += 5.5;

      doc.setFont(activeFont, 'bold');
      doc.text('Closing Balance:', margin, currentY);
      if (closingBal > 0) doc.setTextColor(220, 38, 38);
      else if (closingBal < 0) doc.setTextColor(22, 163, 74);
      else doc.setTextColor(15, 23, 42);
      doc.text(`SAR ${Math.abs(closingBal).toFixed(2)} ${closingBal > 0 ? '(Due)' : (closingBal < 0 ? '(Adv)' : '(0.00)')}`, margin + 40, currentY);
      currentY += 8;

      // 4. Detailed Table with Month Column & Shaped Arabic Text
      const tableHeaders = [['Date', 'Month', 'Bill #', 'Description / Product Details', 'Qty', 'Unit Price', 'Debit (+)', 'Credit (-)']];
      const tableBody = [];

      sortedTxs.forEach((t) => {
        const isOrder = t.type === 'CREDIT_ORDER' || t.order_id;
        const isPayment = t.type === 'PAYMENT';
        const isCharge = t.type === 'CHARGE';
        const txDate = new Date(t.created_at).toLocaleDateString();
        const txMonth = t.billing_month || (t.created_at ? t.created_at.slice(0, 7) : '');
        const monthLabel = txMonth ? formatMonthDisplay(txMonth) : '-';
        const billNum = t.slip_number ? `#${t.slip_number}` : (t.order_id ? `#${t.order_id}` : '-');
        const amt = parseFloat(t.amount || 0);

        if (isOrder && Array.isArray(t.order_items) && t.order_items.length > 0) {
          t.order_items.forEach((item, idx) => {
            const q = item.qty || 1;
            const uPrice = parseFloat(item.unit_price || 0);
            const lineTotal = q * uPrice;
            tableBody.push([
              idx === 0 ? txDate : '',
              idx === 0 ? monthLabel : '',
              idx === 0 ? billNum : '',
              formatArabicForTable(`${item.item_name || 'Item'}${item.description ? ` (${item.description})` : ''}`),
              String(q),
              `SAR ${uPrice.toFixed(2)}`,
              `SAR ${lineTotal.toFixed(2)}`,
              '-'
            ]);
          });
        } else if (isOrder) {
          tableBody.push([
            txDate,
            monthLabel,
            billNum,
            formatArabicForTable(t.comments || 'Order Charge'),
            '1',
            `SAR ${amt.toFixed(2)}`,
            `SAR ${amt.toFixed(2)}`,
            '-'
          ]);
        } else if (isPayment) {
          tableBody.push([
            txDate,
            monthLabel,
            billNum !== '-' ? billNum : '',
            formatArabicForTable(`Payment Received${t.payment_method ? ` (${t.payment_method})` : ''}${t.comments ? ` – ${t.comments}` : ''}`),
            '-',
            '-',
            '-',
            `SAR ${amt.toFixed(2)}`
          ]);
        } else {
          // Manual Charge or Adjustment
          tableBody.push([
            txDate,
            monthLabel,
            billNum,
            formatArabicForTable(isCharge ? `Manual Debit${t.comments ? ` – ${t.comments}` : ''}` : `${t.type}${t.comments ? ` – ${t.comments}` : ''}`),
            '1',
            `SAR ${amt.toFixed(2)}`,
            `SAR ${amt.toFixed(2)}`,
            '-'
          ]);
        }
      });

      if (tableBody.length === 0) {
        tableBody.push(['-', '-', '-', 'No transactions recorded in this period.', '-', '-', '-', '-']);
      }

      autoTable(doc, {
        startY: currentY,
        head: tableHeaders,
        body: tableBody,
        theme: 'striped',
        margin: { left: margin, right: margin, top: 20, bottom: 20 },
        styles: {
          font: activeFont,
          fontSize: 8.5,
          cellPadding: 2.5,
          overflow: 'linebreak',
          textColor: [30, 41, 59]
        },
        headStyles: {
          font: activeFont,
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left'
        },
        columnStyles: {
          0: { cellWidth: 20 }, // Date
          1: { cellWidth: 24 }, // Month
          2: { cellWidth: 16 }, // Bill #
          3: { cellWidth: 'auto' }, // Description
          4: { cellWidth: 12, halign: 'center' }, // Qty
          5: { cellWidth: 22, halign: 'right' }, // Unit Price
          6: { cellWidth: 22, halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' }, // Debit
          7: { cellWidth: 22, halign: 'right', textColor: [22, 163, 74], fontStyle: 'bold' } // Credit
        },
        didDrawPage: (data) => {
          // Print Date & Page Number on each page footer
          doc.setFontSize(8);
          doc.setFont(activeFont, 'normal');
          doc.setTextColor(148, 163, 184);
          doc.text(`Printed On: ${new Date().toLocaleString()}`, margin, pageHeight - 8);
          doc.text(`Page ${data.pageNumber}`, pageWidth - margin - 12, pageHeight - 8);
        }
      });

      // 5. Final Summary Block
      const finalY = doc.lastAutoTable.finalY + 8;
      const isNewPage = finalY + 30 > pageHeight - 15;
      if (isNewPage) {
        doc.addPage();
      }
      const summaryY = isNewPage ? 20 : finalY;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, summaryY, pageWidth - (margin * 2), 24, 2, 2, 'FD');

      doc.setFontSize(8.5);
      doc.setFont(activeFont, 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL BILLS (DEBIT):', margin + 6, summaryY + 8);
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(11.5);
      doc.text(`SAR ${totalBills.toFixed(2)}`, margin + 6, summaryY + 18);

      doc.setFontSize(8.5);
      doc.setFont(activeFont, 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL PAYMENTS RECEIVED (CREDIT):', margin + 65, summaryY + 8);
      doc.setTextColor(22, 163, 74);
      doc.setFontSize(11.5);
      doc.text(`SAR ${totalPayments.toFixed(2)}`, margin + 65, summaryY + 18);

      doc.setFontSize(8.5);
      doc.setFont(activeFont, 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('CLOSING BALANCE:', margin + 140, summaryY + 8);
      if (closingBal > 0) doc.setTextColor(220, 38, 38);
      else if (closingBal < 0) doc.setTextColor(22, 163, 74);
      else doc.setTextColor(15, 23, 42);
      doc.setFontSize(11.5);
      doc.text(`SAR ${Math.abs(closingBal).toFixed(2)} ${closingBal > 0 ? '(Due)' : (closingBal < 0 ? '(Adv)' : '(0.00)')}`, margin + 140, summaryY + 18);

      const safeName = (activeCustomer.name || 'Customer').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
      doc.save(`Khata_Statement_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF statement downloaded successfully!');
    } catch (err) {
      console.error('Error exporting PDF statement:', err);
      toast.error('Failed to generate PDF statement');
    }
  };

  // 3. Redesigned Detailed Excel Export (Professional Styling, Merged Headers, Colors, Borders, xlsx-js-style)
  const handleExportExcel = async () => {
    const data = getStatementData();
    if (!data) return;
    const { periodLabel, statementMonth, totalBills, totalPayments, openBal, closingBal, sortedTxs } = data;

    try {
      const xlsxModule = await import('xlsx-js-style');
      const XLSX = xlsxModule.default || xlsxModule;

      const borderThin = {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } }
      };

      const rows = [];
      const rowHeights = [];
      const merges = [];

      // Row 0: Merged Main Header Banner (A1:N1)
      const headerTitle = `${(activeCustomer.name || 'CUSTOMER').toUpperCase()} – KHATA STATEMENT`;
      const titleRow = [];
      for (let c = 0; c < 14; c++) {
        titleRow.push({
          v: c === 0 ? headerTitle : '',
          t: 's',
          s: {
            font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '1E293B' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: borderThin
          }
        });
      }
      rows.push(titleRow);
      rowHeights.push({ hpt: 32 });
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } });

      // Row 1: Merged Subtitle Banner (A2:N2)
      const subtitleText = `Statement Period: ${periodLabel}    |    Statement Month: ${statementMonth}    |    Generated: ${new Date().toLocaleString()}`;
      const subtitleRow = [];
      for (let c = 0; c < 14; c++) {
        subtitleRow.push({
          v: c === 0 ? subtitleText : '',
          t: 's',
          s: {
            font: { bold: true, sz: 9.5, color: { rgb: '334155' } },
            fill: { fgColor: { rgb: 'F1F5F9' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: borderThin
          }
        });
      }
      rows.push(subtitleRow);
      rowHeights.push({ hpt: 20 });
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 13 } });

      // Row 2: Customer Meta & Balances Info
      // A3:D3 (cols 0-3): Customer & Category
      // E3:I3 (cols 4-8): Opening Balance
      // J3:N3 (cols 9-13): Closing Balance
      const custText = `Customer: ${activeCustomer.name || 'Customer'}${activeCustomer.category ? ` (${activeCustomer.category})` : ''}${activeCustomer.company_name ? ` • ${activeCustomer.company_name}` : ''}`;
      const openBalText = `Opening Balance: SAR ${openBal.toFixed(2)}`;
      const closeBalText = `Closing Balance: SAR ${Math.abs(closingBal).toFixed(2)} ${closingBal > 0 ? '(Due)' : (closingBal < 0 ? '(Advance)' : '(0.00)')}`;

      const metaRow = [];
      for (let c = 0; c < 14; c++) {
        let v = '';
        let fontColor = '0F172A';
        let bgColor = 'F8FAFC';

        if (c === 0) {
          v = custText;
        } else if (c === 4) {
          v = openBalText;
        } else if (c === 9) {
          v = closeBalText;
          fontColor = closingBal > 0 ? 'DC2626' : (closingBal < 0 ? '16A34A' : '0F172A');
          bgColor = closingBal > 0 ? 'FEF2F2' : (closingBal < 0 ? 'F0FDF4' : 'F8FAFC');
        }

        metaRow.push({
          v,
          t: 's',
          s: {
            font: { bold: true, sz: 9.5, color: { rgb: fontColor } },
            fill: { fgColor: { rgb: bgColor } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: borderThin
          }
        });
      }
      rows.push(metaRow);
      rowHeights.push({ hpt: 22 });
      merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 3 } });
      merges.push({ s: { r: 2, c: 4 }, e: { r: 2, c: 8 } });
      merges.push({ s: { r: 2, c: 9 }, e: { r: 2, c: 13 } });

      // Row 3: Blank spacing row
      rows.push(Array(14).fill({ v: '', t: 's' }));
      rowHeights.push({ hpt: 8 });

      // Row 4: Column Headers
      const colHeaders = [
        'Transaction Date',
        'Payment Month',
        'Bill / Invoice Number',
        'Transaction Type',
        'Activity / Description',
        'Product Name',
        'Product Description',
        'Quantity',
        'Unit Price (SAR)',
        'Debit Amount (SAR)',
        'Credit / Received (SAR)',
        'Total Amount (SAR)',
        'Payment Method',
        'Related Bill Number'
      ];
      rows.push(
        colHeaders.map(h => ({
          v: h,
          t: 's',
          s: {
            font: { bold: true, sz: 9.5, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '334155' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: borderThin
          }
        }))
      );
      rowHeights.push({ hpt: 28 });

      // Data Rows
      sortedTxs.forEach((t) => {
        const isOrder = t.type === 'CREDIT_ORDER' || t.order_id;
        const isPayment = t.type === 'PAYMENT';
        const isCharge = t.type === 'CHARGE';
        const txDate = new Date(t.created_at).toLocaleString();
        const payMonth = t.billing_month ? formatMonthDisplay(t.billing_month) : (t.created_at ? formatMonthDisplay(t.created_at.slice(0, 7)) : '');
        const billNum = t.slip_number ? `Bill #${t.slip_number}` : (t.order_id ? `#${t.order_id}` : '');
        const amt = parseFloat(t.amount || 0);

        if (isOrder && Array.isArray(t.order_items) && t.order_items.length > 0) {
          t.order_items.forEach((item, idx) => {
            const q = parseFloat(item.qty || 1);
            const uPrice = parseFloat(item.unit_price || 0);
            const lineAmt = q * uPrice;
            const desc = idx === 0 ? `Order ${billNum} – Products Sale` : `Item in ${billNum}`;
            const prodName = item.item_name || '';
            const prodDesc = item.description || '';

            const textLen = Math.max(desc.length, prodName.length, prodDesc.length);
            const hpt = textLen > 50 ? 34 : (textLen > 25 ? 26 : 20);

            rows.push([
              { v: txDate, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
              { v: payMonth, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
              { v: billNum, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
              { v: 'Order / Sale', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
              { v: desc, t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
              { v: prodName, t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
              { v: prodDesc, t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
              { v: q, t: 'n', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
              { v: uPrice, t: 'n', z: '#,##0.00', s: { alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
              { v: lineAmt, t: 'n', z: '#,##0.00', s: { font: { bold: true, color: { rgb: 'DC2626' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
              { v: '', t: 's', s: { alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
              { v: lineAmt, t: 'n', z: '#,##0.00', s: { font: { bold: true }, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
              { v: t.payment_method || '', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
              { v: billNum, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } }
            ]);
            rowHeights.push({ hpt });
          });
        } else if (isOrder) {
          const desc = t.comments || `Order ${billNum}`;
          const prodDesc = t.comments || '';
          const textLen = Math.max(desc.length, prodDesc.length);
          const hpt = textLen > 50 ? 34 : (textLen > 25 ? 26 : 20);

          rows.push([
            { v: txDate, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: payMonth, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: billNum, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: 'Order / Sale', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: desc, t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
            { v: 'General Order', t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
            { v: prodDesc, t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
            { v: 1, t: 'n', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: amt, t: 'n', z: '#,##0.00', s: { alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: amt, t: 'n', z: '#,##0.00', s: { font: { bold: true, color: { rgb: 'DC2626' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: '', t: 's', s: { alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: amt, t: 'n', z: '#,##0.00', s: { font: { bold: true }, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: t.payment_method || '', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: billNum, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } }
          ]);
          rowHeights.push({ hpt });
        } else if (isPayment) {
          const desc = `Payment Received (${t.payment_method || 'Cash'})${t.comments ? ` – ${t.comments}` : ''}`;
          const prodDesc = t.comments || '';
          const textLen = Math.max(desc.length, prodDesc.length);
          const hpt = textLen > 50 ? 34 : (textLen > 25 ? 26 : 20);

          rows.push([
            { v: txDate, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: payMonth, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: '', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: 'Payment Received', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: desc, t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
            { v: '', t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
            { v: prodDesc, t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
            { v: '', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: '', t: 's', s: { alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: '', t: 's', s: { alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: amt, t: 'n', z: '#,##0.00', s: { font: { bold: true, color: { rgb: '16A34A' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: amt, t: 'n', z: '#,##0.00', s: { font: { bold: true }, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: t.payment_method || 'Cash', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: t.slip_number ? `Bill #${t.slip_number}` : '', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } }
          ]);
          rowHeights.push({ hpt });
        } else {
          // Manual charge or adjustment
          const desc = t.comments || 'Manual Charge / Adjustment';
          const typeLabel = isCharge ? 'Manual Debit' : (t.type === 'DEBIT_ADJUSTMENT' ? 'Debit Adjustment' : (t.type === 'CREDIT_ADJUSTMENT' ? 'Credit Adjustment' : (t.type || 'Adjustment')));
          const isDebitAdj = isCharge || t.type === 'DEBIT_ADJUSTMENT';

          rows.push([
            { v: txDate, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: payMonth, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: billNum || '', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: typeLabel, t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: desc, t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
            { v: '', t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
            { v: t.comments || '', t: 's', s: { alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin } },
            { v: 1, t: 'n', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: amt, t: 'n', z: '#,##0.00', s: { alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: isDebitAdj ? amt : '', t: isDebitAdj ? 'n' : 's', z: '#,##0.00', s: { font: { bold: true, color: { rgb: isDebitAdj ? 'DC2626' : '000000' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: !isDebitAdj ? amt : '', t: !isDebitAdj ? 'n' : 's', z: '#,##0.00', s: { font: { bold: true, color: { rgb: '16A34A' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: amt, t: 'n', z: '#,##0.00', s: { font: { bold: true }, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin } },
            { v: t.payment_method || '', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } },
            { v: billNum || '', t: 's', s: { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin } }
          ]);
          rowHeights.push({ hpt: 22 });
        }
      });

      // Bottom Summary Block
      rows.push(Array(14).fill({ v: '', t: 's' }));
      rowHeights.push({ hpt: 10 });

      const buildSummaryRow = (label, amtVal, colorRgb, isDebit) => {
        const sRow = [];
        for (let c = 0; c < 14; c++) {
          if (c === 0) {
            sRow.push({
              v: label,
              t: 's',
              s: {
                font: { bold: true, sz: 10, color: { rgb: '1E293B' } },
                fill: { fgColor: { rgb: 'F8FAFC' } },
                alignment: { horizontal: 'right', vertical: 'center' },
                border: borderThin
              }
            });
          } else if (c < 9) {
            sRow.push({
              v: '',
              t: 's',
              s: { fill: { fgColor: { rgb: 'F8FAFC' } }, border: borderThin }
            });
          } else if (c === 9 && isDebit) {
            sRow.push({
              v: amtVal,
              t: 'n',
              z: '#,##0.00',
              s: {
                font: { bold: true, sz: 10, color: { rgb: colorRgb } },
                fill: { fgColor: { rgb: 'F8FAFC' } },
                alignment: { horizontal: 'right', vertical: 'center' },
                border: borderThin
              }
            });
          } else if (c === 10 && !isDebit) {
            sRow.push({
              v: amtVal,
              t: 'n',
              z: '#,##0.00',
              s: {
                font: { bold: true, sz: 10, color: { rgb: colorRgb } },
                fill: { fgColor: { rgb: 'F8FAFC' } },
                alignment: { horizontal: 'right', vertical: 'center' },
                border: borderThin
              }
            });
          } else if (c === 11) {
            sRow.push({
              v: amtVal,
              t: 'n',
              z: '#,##0.00',
              s: {
                font: { bold: true, sz: 10, color: { rgb: colorRgb } },
                fill: { fgColor: { rgb: 'F8FAFC' } },
                alignment: { horizontal: 'right', vertical: 'center' },
                border: borderThin
              }
            });
          } else {
            sRow.push({
              v: '',
              t: 's',
              s: { fill: { fgColor: { rgb: 'F8FAFC' } }, border: borderThin }
            });
          }
        }
        return sRow;
      };

      // Row: Total Bills
      const rIdxBills = rows.length;
      rows.push(buildSummaryRow('Total Bills (Orders):', totalBills, 'DC2626', true));
      rowHeights.push({ hpt: 22 });
      merges.push({ s: { r: rIdxBills, c: 0 }, e: { r: rIdxBills, c: 8 } });

      // Row: Total Payments
      const rIdxPmts = rows.length;
      rows.push(buildSummaryRow('Total Payments Received:', totalPayments, '16A34A', false));
      rowHeights.push({ hpt: 22 });
      merges.push({ s: { r: rIdxPmts, c: 0 }, e: { r: rIdxPmts, c: 8 } });

      // Row: Opening Balance
      const rIdxOpen = rows.length;
      const openRow = [];
      for (let c = 0; c < 14; c++) {
        if (c === 0) {
          openRow.push({
            v: 'Opening Balance:',
            t: 's',
            s: {
              font: { bold: true, sz: 10, color: { rgb: '334155' } },
              fill: { fgColor: { rgb: 'F1F5F9' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: borderThin
            }
          });
        } else if (c < 9) {
          openRow.push({ v: '', t: 's', s: { fill: { fgColor: { rgb: 'F1F5F9' } }, border: borderThin } });
        } else if (c === 11) {
          openRow.push({
            v: openBal,
            t: 'n',
            z: '#,##0.00',
            s: {
              font: { bold: true, sz: 10, color: { rgb: '0F172A' } },
              fill: { fgColor: { rgb: 'F1F5F9' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: borderThin
            }
          });
        } else {
          openRow.push({ v: '', t: 's', s: { fill: { fgColor: { rgb: 'F1F5F9' } }, border: borderThin } });
        }
      }
      rows.push(openRow);
      rowHeights.push({ hpt: 22 });
      merges.push({ s: { r: rIdxOpen, c: 0 }, e: { r: rIdxOpen, c: 8 } });

      // Row: Closing Balance
      const rIdxClose = rows.length;
      const closeColor = closingBal > 0 ? 'DC2626' : (closingBal < 0 ? '16A34A' : '0F172A');
      const closeBg = closingBal > 0 ? 'FEF2F2' : (closingBal < 0 ? 'F0FDF4' : 'F1F5F9');
      const closeLabel = `Closing Balance ${closingBal > 0 ? '(Due / Outstanding):' : (closingBal < 0 ? '(Advance):' : ':')}`;
      const closeRow = [];
      for (let c = 0; c < 14; c++) {
        if (c === 0) {
          closeRow.push({
            v: closeLabel,
            t: 's',
            s: {
              font: { bold: true, sz: 10.5, color: { rgb: closeColor } },
              fill: { fgColor: { rgb: closeBg } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: borderThin
            }
          });
        } else if (c < 9) {
          closeRow.push({ v: '', t: 's', s: { fill: { fgColor: { rgb: closeBg } }, border: borderThin } });
        } else if (c === 11) {
          closeRow.push({
            v: closingBal,
            t: 'n',
            z: '#,##0.00',
            s: {
              font: { bold: true, sz: 10.5, color: { rgb: closeColor } },
              fill: { fgColor: { rgb: closeBg } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: borderThin
            }
          });
        } else {
          closeRow.push({ v: '', t: 's', s: { fill: { fgColor: { rgb: closeBg } }, border: borderThin } });
        }
      }
      rows.push(closeRow);
      rowHeights.push({ hpt: 24 });
      merges.push({ s: { r: rIdxClose, c: 0 }, e: { r: rIdxClose, c: 8 } });

      // Row: Generated At footer
      const rIdxGen = rows.length;
      const genRow = [];
      for (let c = 0; c < 14; c++) {
        genRow.push({
          v: c === 0 ? `Printed / Exported On: ${new Date().toLocaleString()}` : '',
          t: 's',
          s: {
            font: { italic: true, sz: 9, color: { rgb: '64748B' } },
            alignment: { horizontal: 'center', vertical: 'center' }
          }
        });
      }
      rows.push(genRow);
      rowHeights.push({ hpt: 18 });
      merges.push({ s: { r: rIdxGen, c: 0 }, e: { r: rIdxGen, c: 13 } });

      // Create sheet & attach properties
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!merges'] = merges;
      ws['!rows'] = rowHeights;
      ws['!cols'] = [
        { wch: 19 }, // Transaction Date
        { wch: 16 }, // Payment Month
        { wch: 16 }, // Bill / Invoice Number
        { wch: 16 }, // Transaction Type
        { wch: 32 }, // Activity / Description
        { wch: 22 }, // Product Name
        { wch: 22 }, // Product Description
        { wch: 9 },  // Quantity
        { wch: 14 }, // Unit Price
        { wch: 16 }, // Debit Amount
        { wch: 16 }, // Credit / Received
        { wch: 16 }, // Total Amount
        { wch: 15 }, // Payment Method
        { wch: 16 }  // Related Bill Number
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Khata Statement');
      const safeName = (activeCustomer.name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
      XLSX.writeFile(wb, `Khata_Statement_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Excel statement downloaded successfully!');
    } catch (err) {
      console.error('Error exporting Excel statement:', err);
      toast.error('Failed to export Excel statement');
    }
  };

  const handleSelectClassificationFilter = (c) => {
    setLedgerClassificationFilter(c);
    reloadLedger(selectedLedgerMonth, c);
  };

  const handleViewOrder = async (orderId) => {
    try {
      const res = await axios.get(`/api/orders/${orderId}`);
      setSelectedOrder(res.data);
    } catch (err) {
      toast.error('Failed to load order details');
    }
  };

  // Save Discount Configuration for Active Customer (Option A: Package or Option B: Custom Rules)
  const handleSaveLedgerDiscounts = async () => {
    if (!activeCustomer) return;
    setSavingDiscounts(true);

    let finalPkgId = null;
    let finalRules = [];

    if (ledgerDiscountMode === 'package') {
      if (!ledgerSelectedPackageId) {
        setSavingDiscounts(false);
        return toast.error('Please select an existing discount package.');
      }
      finalPkgId = parseInt(ledgerSelectedPackageId, 10);
      finalRules = [];
    } else if (ledgerDiscountMode === 'custom') {
      finalPkgId = null;
      finalRules = customerCustomRules;
    } else {
      finalPkgId = null;
      finalRules = [];
    }

    try {
      await axios.put(`/api/credit/${activeCustomer.id}`, {
        ...activeCustomer,
        discount_package_id: finalPkgId,
        discount_rules: finalRules
      });
      toast.success('Discount configuration updated successfully!');

      const assignedPkg = discountPackages.find(p => p.id === finalPkgId);
      setActiveCustomer({ 
        ...activeCustomer, 
        discount_package_id: finalPkgId,
        discount_package_name: assignedPkg ? assignedPkg.name : null,
        discount_rules: finalRules 
      });
      fetchCustomers();
      setShowLedgerDiscounts(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save discount configuration');
    } finally {
      setSavingDiscounts(false);
    }
  };

  // ── Apply On Handlers ────────────────────────────────────────────────
  const handleOpenApplyOn = (pkg) => {
    setApplyOnPackage(pkg);
    setApplyOnFilter('All');
    setApplyOnSearch('');
    const preSelected = new Set(
      customers
        .filter(c => c.discount_package_id === pkg.id)
        .map(c => c.id)
    );
    setApplyOnSelectedIds(preSelected);
  };

  const handleToggleApplyOnId = (id) => {
    setApplyOnSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisibleApplyOn = (visibleIds) => {
    setApplyOnSelectedIds(prev => {
      const next = new Set(prev);
      visibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const handleUnselectAllVisibleApplyOn = (visibleIds) => {
    setApplyOnSelectedIds(prev => {
      const next = new Set(prev);
      visibleIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const handleSaveApplyOn = async () => {
    if (!applyOnPackage) return;
    setSavingApplyOn(true);
    try {
      const idsArray = Array.from(applyOnSelectedIds);
      await axios.post(`/api/credit/discount-packages/${applyOnPackage.id}/apply`, {
        customer_ids: idsArray
      });
      toast.success(`Discount package "${applyOnPackage.name}" updated for ${idsArray.length} records`);
      setApplyOnPackage(null);
      fetchCustomers();
      fetchDiscountPackages();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update package assignments');
    } finally {
      setSavingApplyOn(false);
    }
  };

  const filteredApplyOnCustomers = useMemo(() => {
    if (!applyOnPackage) return [];
    return customers.filter(c => {
      if (applyOnFilter === 'Employees' && c.category !== 'Employee') return false;
      if (applyOnFilter === 'Companies' && c.category !== 'Company') return false;
      if (applyOnFilter === 'Customers' && c.category !== 'Regular Customer') return false;
      if (applyOnSearch.trim()) {
        const q = applyOnSearch.toLowerCase();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchPhone = (c.phone || '').toLowerCase().includes(q);
        const matchRef = (c.reference || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchRef) return false;
      }
      return true;
    });
  }, [customers, applyOnPackage, applyOnFilter, applyOnSearch]);

  // Process Transaction: Exactly 3 options (Receive Major Payment, Add Debit, Extra Pay)
  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (submittingPayment) return;

    let amountStr = paymentAmount;
    const finalAmount = Math.abs(Number(amountStr));
    
    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      return toast.error('Enter a valid positive amount');
    }

    if (!billingMonth) {
      return toast.error('Please select the Billing Month');
    }

    let action = 'PAYMENT';
    let classification = 'Regular';

    if (entryType === 'PAYMENT') {
      action = 'PAYMENT';
      classification = 'Regular';
    } else if (entryType === 'CHARGE') {
      action = 'CHARGE';
      classification = 'Regular';
    } else if (entryType === 'EXTRA_PAY') {
      action = 'CHARGE';
      classification = 'Extra Pay';
    }
    
    setSubmittingPayment(true);
    try {
      await axios.post(`/api/credit/${activeCustomer.id}/payment`, { 
        amount: finalAmount,
        action,
        cashier_name: user?.username || 'Unknown',
        payment_method: action === 'PAYMENT' ? (paymentMethod || 'Cash') : null,
        branch: user?.branch || (branchFilter !== 'All' ? branchFilter : 'Branch 1'),
        billing_month: billingMonth,
        comments: paymentComment.trim() || null,
        classification
      });

      const actionText = entryType === 'PAYMENT' 
        ? 'Payment received' 
        : (entryType === 'EXTRA_PAY' ? 'Extra Pay added' : 'Debit / Charge added');

      toast.success(`${actionText} of ${CURRENCY} ${finalAmount.toFixed(2)} allocated to ${billingMonth}`);
      setPaymentAmount('');
      setPaymentComment('');

      const balanceChange = action === 'CHARGE' ? finalAmount : -finalAmount;
      setActiveCustomer(prev => ({ ...prev, balance: Number(prev.balance) + balanceChange }));
      
      if (selectedLedgerMonth !== 'All' && selectedLedgerMonth !== billingMonth) {
        setSelectedLedgerMonth(billingMonth);
        reloadLedger(billingMonth, ledgerClassificationFilter);
      } else {
        reloadLedger(selectedLedgerMonth, ledgerClassificationFilter);
      }
      fetchCustomers(); 
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to process transaction');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const toggleBranch = (br) => {
    if (selectedBranches.includes(br)) {
      setSelectedBranches(selectedBranches.filter(b => b !== br));
    } else {
      setSelectedBranches([...selectedBranches, br]);
    }
  };

  // Generate Available Months List (Sorted chronologically descending)
  const availableMonths = useMemo(() => {
    const monthMap = new Map();
    const currKey = getCurrentMonthStr();
    let mKey = currKey;
    
    // Always include current month and past 12 months using Saudi timezone sequence
    for (let i = 0; i < 12; i++) {
      const parts = mKey.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
      const label = !isNaN(d.getTime()) ? d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) : mKey;
      monthMap.set(mKey, label);
      mKey = getSaudiPreviousMonthStr(mKey);
    }

    // Include any additional months from transactions
    if (Array.isArray(monthlySummary)) {
      monthlySummary.forEach(s => {
        const mKey = s.billing_month || s.month;
        if (mKey && typeof mKey === 'string' && mKey.includes('-') && !monthMap.has(mKey)) {
          const parts = mKey.split('-');
          const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
          const label = !isNaN(d.getTime()) ? d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) : mKey;
          monthMap.set(mKey, label);
        }
      });
    }

    return Array.from(monthMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, label]) => ({ key, label }));
  }, [monthlySummary]);

  // Selected Month Summary Calculation
  const selectedMonthSummaryData = useMemo(() => {
    if (selectedLedgerMonth === 'All') return null;
    return monthlySummary.find(s => (s.billing_month || s.month) === selectedLedgerMonth) || {
      debit: 0,
      total_debit: 0,
      credit: 0,
      total_credit: 0,
      net_balance: 0,
      remaining_balance: 0,
      extra_pay_debit: 0,
      extra_pay_credit: 0,
      extra_pay_balance: 0
    };
  }, [selectedLedgerMonth, monthlySummary]);

  const customerMatchesBranch = (c, bFilter) => {
    if (!bFilter || bFilter === 'All') return true;
    const branches = Array.isArray(c.available_branches) ? c.available_branches : [];
    if (branches.length === 0) return true;
    const numMatch = bFilter.match(/\d+/);
    const branchNum = numMatch ? numMatch[0] : null;
    return branches.some(b => {
      if (!b) return false;
      if (b === bFilter) return true;
      if (branchNum && b.includes(branchNum)) return true;
      return false;
    });
  };

  // Filtered customer listing based on category tab & branch overlap
  const filteredCustomers = customers.filter(c => {
    if (!customerMatchesBranch(c, branchFilter)) return false;
    if (categoryFilter === 'All') return true;
    if (categoryFilter === 'Employee') return c.category === 'Employee';
    if (categoryFilter === 'Company') return c.category === 'Company';
    if (categoryFilter === 'Regular Customer') return c.category === 'Regular Customer' || (!c.category && c.category !== 'Employee' && c.category !== 'Company');
    return true;
  });

  const branchFilteredCustomers = customers.filter(c => customerMatchesBranch(c, branchFilter));
  const employeeCount = branchFilteredCustomers.filter(c => c.category === 'Employee').length;
  const companyCount = branchFilteredCustomers.filter(c => c.category === 'Company').length;
  const regularCount = branchFilteredCustomers.filter(c => c.category === 'Regular Customer' || (!c.category && c.category !== 'Employee' && c.category !== 'Company')).length;

  const sortedAndFilteredCustomers = useMemo(() => {
    let list = [...filteredCustomers];
    if (balanceSort === 'highest_balance') {
      list.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
    } else if (balanceSort === 'lowest_balance') {
      list.sort((a, b) => Number(a.balance || 0) - Number(b.balance || 0));
    }
    return list;
  }, [filteredCustomers, balanceSort]);

  const totalCustomerBalance = useMemo(() => {
    return filteredCustomers.reduce((sum, c) => sum + (parseFloat(c.balance) || 0), 0);
  }, [filteredCustomers]);

  // Process ledger: remove cancellations, filter by extra pay if toggle selected
  const processedTransactions = useMemo(() => {
    const cancelledOrderIds = new Set();
    ledger.forEach(t => {
      if (t.type === 'ORDER_CANCELLED') cancelledOrderIds.add(t.order_id);
    });

    const activeList = [];
    ledger.forEach(t => {
      if (t.type === 'ORDER_CANCELLED' || t.type === 'PAYMENT_CANCELLED') return;
      
      let isCancelled = false;
      if (t.type === 'CREDIT_ORDER' && cancelledOrderIds.has(t.order_id)) {
        isCancelled = true;
      }
      activeList.push({ ...t, isCancelled });
    });

    return activeList;
  }, [ledger]);

  // Calculations for Extra Pay and Subtotals
  const monthExtraPayDebit = useMemo(() => {
    return processedTransactions
      .filter(t => !t.isCancelled && t.classification === 'Extra Pay' && (t.type === 'CREDIT_ORDER' || t.type === 'CHARGE'))
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  }, [processedTransactions]);

  const monthRegularDebit = useMemo(() => {
    return processedTransactions
      .filter(t => !t.isCancelled && t.classification !== 'Extra Pay' && (t.type === 'CREDIT_ORDER' || t.type === 'CHARGE'))
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  }, [processedTransactions]);

  const visibleSubtotal = useMemo(() => {
    return processedTransactions.reduce((sum, t) => {
      if (t.isCancelled) return sum;
      const amt = parseFloat(t.amount || 0);
      if (t.type === 'CREDIT_ORDER' || t.type === 'CHARGE') return sum + amt;
      if (t.type === 'PAYMENT') return sum - amt;
      return sum;
    }, 0);
  }, [processedTransactions]);

  const overallExtraPayTotal = useMemo(() => {
    return monthlySummary.reduce((sum, s) => {
      return sum + parseFloat(s.extra_pay_balance || s.extra_pay_debit || 0);
    }, 0);
  }, [monthlySummary]);

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      {/* Top Header & Navigation Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Credit Customers (Khata)</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Manage customer credit accounts, monthly ledgers, and category-wise discount packages
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 1.A Month-wise Filter at Top */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: '5px 10px' }}>
            <Calendar size={15} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Month:</span>
            <select
              value={selectedMainMonth}
              onChange={e => setSelectedMainMonth(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--surface)', fontSize: 12.5, fontWeight: 600, outline: 'none', cursor: 'pointer' }}
            >
              <option value={getCurrentMonthStr()}>{formatMonthDisplay(getCurrentMonthStr())} (Current)</option>
              <option value={getSaudiPreviousMonthStr()}>{formatMonthDisplay(getSaudiPreviousMonthStr())} (Previous)</option>
              {/* Previous 10 months beyond previous month */}
              {Array.from({ length: 10 }, (_, i) => {
                let mKey = getSaudiPreviousMonthStr();
                for (let j = 0; j <= i; j++) {
                  mKey = getSaudiPreviousMonthStr(mKey);
                }
                return <option key={mKey} value={mKey}>{formatMonthDisplay(mKey)}</option>;
              })}
              <option value="All">All Months (Full History)</option>
            </select>
          </div>

          {/* 1.B Branch Segmented Switch Control: Strictly All, B1, B2, B3 */}
          {(isAdmin || isManagement) && (
            <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: 3, gap: 3 }}>
              {['All', 'B1', 'B2', 'B3'].map((code) => {
                const isActive = (code === 'All' && (!branchFilter || branchFilter === 'All')) ||
                                 (code !== 'All' && (branchFilter === code || branchFilter === `Branch ${code.replace('B', '')}` || branchFilter.includes(code.replace('B', ''))));
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setBranchFilter(code === 'All' ? 'All' : `Branch ${code.replace('B', '')}`)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: isActive ? 'var(--primary)' : 'transparent',
                      color: isActive ? '#fff' : 'var(--text)',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          )}

          {/* 1.C Balance Sorting Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={balanceSort}
              onChange={e => setBalanceSort(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--surface-3)', background: 'var(--surface)', fontSize: 12.5, fontWeight: 600, outline: 'none', cursor: 'pointer' }}
            >
              <option value="default">Sort: Default</option>
              <option value="highest_balance">Sort: Highest Balance</option>
              <option value="lowest_balance">Sort: Lowest Balance</option>
            </select>
          </div>

          {isAdmin && (
            <button
              onClick={handleOpenPackageModal}
              style={{
                background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--surface-3)', padding: '10px 14px',
                borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13
              }}
            >
              <Tag size={16} /> Discount Packages
            </button>
          )}

          {!isManagement && (
            <button
              onClick={openAddModal}
              style={{
                background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 16px',
                borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13
              }}
            >
              <Plus size={18} /> Add Khata Customer
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Tabs & Overall Balance Indicator */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid var(--surface-2)', paddingBottom: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'All', label: 'All Customers', count: customers.length },
            { id: 'Employee', label: 'Employees', count: employeeCount },
            { id: 'Regular Customer', label: 'Regular Customers', count: regularCount },
            { id: 'Company', label: 'Companies', count: companyCount },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: categoryFilter === tab.id ? 'var(--primary)' : 'var(--surface-2)',
                color: categoryFilter === tab.id ? '#fff' : 'var(--text)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s'
              }}
            >
              <span>{tab.label}</span>
              <span style={{ 
                fontSize: 11, 
                background: categoryFilter === tab.id ? 'rgba(255,255,255,0.25)' : 'var(--surface-3)', 
                padding: '1px 6px', 
                borderRadius: 10 
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Overall Balance Summary Pill */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8, 
          background: 'var(--surface-2)', 
          padding: '6px 14px', 
          borderRadius: 8, 
          border: '1.5px solid var(--surface-3)', 
          fontSize: 13, 
          fontWeight: 600,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Overall Balance:</span>
          <span style={{ 
            fontWeight: 800, 
            fontSize: 14,
            color: totalCustomerBalance > 0 ? 'var(--red)' : (totalCustomerBalance < 0 ? 'var(--green)' : 'var(--text)') 
          }}>
            {CURRENCY} {Math.abs(totalCustomerBalance).toFixed(2)} {totalCustomerBalance > 0 ? '(DR / Dues)' : (totalCustomerBalance < 0 ? '(CR / Advance)' : '(Settled)')}
          </span>
        </div>
      </div>

      {/* Customer List Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1.5px solid var(--surface-2)', overflowX: 'auto', minHeight: 220, paddingBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--surface-2)', background: 'var(--surface-50)' }}>
              {/* 1. Customer / Category */}
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 200 }}>Customer / Category</th>
              {/* 2. Balance (All & Current) */}
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 180, whiteSpace: 'nowrap' }}>Balance (All & Current)</th>
              {/* 3. Discount Package */}
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 220, whiteSpace: 'nowrap' }}>Discount Package</th>
              {/* 4. Branches */}
              {(isAdmin || isManagement) && <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 160 }}>Branches</th>}
              {/* 5. Limit */}
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 120 }}>Limit</th>
              {/* 6. Phone / Ref */}
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 150 }}>Phone / Ref</th>
              {/* 7. Status */}
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 120 }}>Status</th>
              {/* 8. Actions */}
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', minWidth: 110 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={(isAdmin || isManagement) ? 8 : 7} style={{ padding: 32, textAlign: 'center' }}>Loading...</td></tr>
            ) : filteredCustomers.length === 0 ? (
              <tr><td colSpan={(isAdmin || isManagement) ? 8 : 7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No credit customers found.</td></tr>
            ) : (
              sortedAndFilteredCustomers.map((c, index) => {
                const effLim = Number(c.credit_limit) > 0 ? Number(c.credit_limit) : 100;
                const limitExceeded = Number(c.balance) > effLim;
                const isDeactivated = c.status === 'Deactivated' || c.is_active === false;
                const pkgRules = c.discount_package_rules || [];
                const ruleCount = Array.isArray(pkgRules) ? pkgRules.length : (typeof pkgRules === 'string' ? JSON.parse(pkgRules || '[]').length : 0);

                return (
                  <tr 
                    key={c.id} 
                    onClick={() => openLedger(c)} 
                    style={{ 
                      borderBottom: '1px solid var(--surface-2)', 
                      background: isDeactivated ? 'rgba(0,0,0,0.02)' : (limitExceeded ? 'rgba(255, 0, 0, 0.04)' : 'transparent'), 
                      cursor: 'pointer',
                      opacity: isDeactivated ? 0.75 : 1
                    }}
                  >
                    {/* 1. Customer / Category */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{c.name}</span>
                        {c.category === 'Employee' ? (
                          <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                            Employee {c.is_extra_pay ? '• Extra Pay' : ''} {c.employee_id ? '🔗' : ''}
                          </span>
                        ) : c.category === 'Company' ? (
                          <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                            Company {c.company_name ? `(${c.company_name})` : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                            Regular
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 2. Balance (All & Current) */}
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', minWidth: 180 }}>
                      {/* All Balance (Overall Account Total) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>All Bal:</span>
                        <span style={{ 
                          fontWeight: 800, 
                          fontSize: 14, 
                          color: limitExceeded ? 'var(--red)' : (c.balance > 0 ? 'var(--red)' : (c.balance < 0 ? 'var(--green)' : 'var(--text)')) 
                        }}>
                          {CURRENCY} {Math.abs(c.balance).toFixed(2)} {c.balance > 0 ? '(Due)' : (c.balance < 0 ? '(Adv)' : '(0.00)')}
                        </span>
                      </div>

                      {/* Current / Selected Month Balance */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)' }}>
                          {getShortMonthDisplay(selectedMainMonth)}
                        </span>
                        {(() => {
                          const curBal = parseFloat(c.current_month_balance || 0);
                          return (
                            <span style={{ 
                              fontSize: 12, 
                              fontWeight: 700, 
                              color: curBal > 0 ? '#dc2626' : (curBal < 0 ? '#16a34a' : 'var(--text-muted)') 
                            }}>
                              {CURRENCY} {Math.abs(curBal).toFixed(2)} {curBal > 0 ? '(Due)' : (curBal < 0 ? '(Adv)' : '(0.00)')}
                            </span>
                          );
                        })()}
                      </div>
                    </td>

                    {/* 3. Discount Package */}
                    <td style={{ padding: '14px 16px', minWidth: 220 }}>
                      {c.discount_package_name ? (
                        <span style={{ fontSize: 12, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 8px', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>
                          Pkg: {c.discount_package_name} {ruleCount > 0 ? `(${ruleCount} rules)` : ''}
                        </span>
                      ) : (() => {
                        let directRules = c.discount_rules;
                        if (typeof directRules === 'string') {
                          try { directRules = JSON.parse(directRules); } catch(e) { directRules = []; }
                        }
                        const directCount = Array.isArray(directRules) ? directRules.length : 0;
                        if (directCount > 0) {
                          return (
                            <span style={{ fontSize: 12, background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '3px 8px', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>
                              Custom ({directCount} rules)
                            </span>
                          );
                        }
                        return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None</span>;
                      })()}
                    </td>

                    {/* 4. Branches */}
                    {(isAdmin || isManagement) && (
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {Array.isArray(c.available_branches) && c.available_branches.length > 0 
                          ? c.available_branches.map(b => getBranchShortName(b)).join(', ') 
                          : (c.available_branches ? getBranchShortName(String(c.available_branches)) : '-')}
                      </td>
                    )}

                    {/* 5. Limit */}
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                      {Number(c.credit_limit) > 0 ? `${CURRENCY} ${Number(c.credit_limit).toFixed(2)}` : 'No Limit'}
                    </td>

                    {/* 6. Phone / Ref */}
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                      <div>{c.phone || '-'}</div>
                      {c.reference && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.reference}</div>}
                    </td>

                    {/* 7. Status */}
                    <td style={{ padding: '14px 16px' }}>
                      {isDeactivated ? (
                        <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <UserX size={12} /> Deactivated
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <UserCheck size={12} /> Active
                        </span>
                      )}
                    </td>

                    {/* 8. Actions */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div 
                        className="khata-action-menu-container"
                        style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', position: 'relative' }}
                      >
                        {/* Visible View Slip / Details icon */}
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openLedger(c); }} 
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: 'var(--primary)', 
                            cursor: 'pointer', 
                            padding: '6px 8px', 
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }} 
                          title="Ledger & Monthly Breakdown"
                        >
                          <FileText size={18} />
                        </button>

                        {/* Three-Dot (⋮) Menu Button */}
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button 
                            type="button"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setActionMenuOpenId(actionMenuOpenId === c.id ? null : c.id); 
                            }} 
                            style={{ 
                              background: actionMenuOpenId === c.id ? 'var(--surface-2)' : 'none', 
                              border: 'none', 
                              color: 'var(--text-secondary)', 
                              cursor: 'pointer', 
                              padding: '6px 6px', 
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }} 
                            title="Actions"
                          >
                            <MoreVertical size={18} />
                          </button>

                          {/* Three-Dot Dropdown */}
                          {actionMenuOpenId === c.id && (
                            <div 
                              onClick={(e) => e.stopPropagation()}
                              style={{ 
                                position: 'absolute', 
                                right: 0, 
                                ...(index >= Math.max(1, sortedAndFilteredCustomers.length - 2) && sortedAndFilteredCustomers.length > 2 
                                    ? { bottom: 'calc(100% + 4px)' } 
                                    : { top: 'calc(100% + 4px)' }),
                                background: 'var(--surface)', 
                                border: '1px solid var(--surface-3)', 
                                borderRadius: 8, 
                                boxShadow: '0 8px 24px rgba(0,0,0,0.18)', 
                                minWidth: 130, 
                                zIndex: 100, 
                                overflow: 'hidden',
                                padding: '4px 0',
                                textAlign: 'left'
                              }}
                            >
                              {isManagement ? (
                                <>
                                  <div 
                                    style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: 8, 
                                      padding: '8px 14px', 
                                      fontSize: 13, 
                                      color: 'var(--text-muted)', 
                                      opacity: 0.5, 
                                      cursor: 'not-allowed' 
                                    }}
                                  >
                                    <Edit size={15} /> Edit
                                  </div>
                                  <div 
                                    style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: 8, 
                                      padding: '8px 14px', 
                                      fontSize: 13, 
                                      color: 'var(--text-muted)', 
                                      opacity: 0.5, 
                                      cursor: 'not-allowed' 
                                    }}
                                  >
                                    <Trash2 size={15} /> Delete
                                  </div>
                                </>
                              ) : (
                                <>
                                  <button 
                                    type="button"
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setActionMenuOpenId(null); 
                                      openEditModal(c); 
                                    }} 
                                    style={{ 
                                      width: '100%', 
                                      background: 'transparent', 
                                      border: 'none', 
                                      padding: '8px 14px', 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: 8, 
                                      fontSize: 13, 
                                      fontWeight: 500,
                                      color: 'var(--text)', 
                                      cursor: 'pointer',
                                      textAlign: 'left'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                  >
                                    <Edit size={15} color="var(--primary)" /> Edit
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setActionMenuOpenId(null); 
                                      handleDelete(c); 
                                    }} 
                                    style={{ 
                                      width: '100%', 
                                      background: 'transparent', 
                                      border: 'none', 
                                      padding: '8px 14px', 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: 8, 
                                      fontSize: 13, 
                                      fontWeight: 500,
                                      color: Math.abs(Number(c.balance)) > 0.001 ? 'var(--text-muted)' : 'var(--red)', 
                                      cursor: 'pointer',
                                      textAlign: 'left'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    title={Math.abs(Number(c.balance)) > 0.001 ? "Balance must be 0 to delete" : "Delete Customer"}
                                  >
                                    <Trash2 size={15} /> Delete
                                  </button>
                                  {(isAdmin || isDeveloper) && (
                                    <button 
                                      type="button"
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setActionMenuOpenId(null); 
                                        setResetCustomerTarget(c);
                                        setSingleResetReason('');
                                        setSingleResetConfirmInput('');
                                      }} 
                                      style={{ 
                                        width: '100%', 
                                        background: 'transparent', 
                                        border: 'none', 
                                        borderTop: '1px solid var(--surface-2)',
                                        padding: '8px 14px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: 8, 
                                        fontSize: 13, 
                                        fontWeight: 600,
                                        color: '#dc2626', 
                                        cursor: 'pointer',
                                        textAlign: 'left'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                      title="Reset this user's Khata balance to 0.00"
                                    >
                                      <RotateCcw size={14} style={{ color: '#dc2626' }} /> Reset Balance
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filteredCustomers.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--surface-50)', borderTop: '2px solid var(--surface-3)', fontWeight: 700 }}>
                {/* 1. Customer / Category */}
                <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>
                  Total ({filteredCustomers.length} Accounts)
                </td>

                {/* 2. Balance (All & Current) */}
                <td style={{ 
                  padding: '14px 16px', 
                  fontSize: 14, 
                  fontWeight: 800, 
                  whiteSpace: 'nowrap',
                  color: totalCustomerBalance > 0 ? 'var(--red)' : (totalCustomerBalance < 0 ? 'var(--green)' : 'var(--text)') 
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Overall Balance:</div>
                  <div>
                    {CURRENCY} {Math.abs(totalCustomerBalance).toFixed(2)} {totalCustomerBalance > 0 ? '(DR / Dues)' : (totalCustomerBalance < 0 ? '(CR / Advance)' : '(Settled)')}
                  </div>
                </td>

                {/* 3 to 8 (Remaining Columns) */}
                <td colSpan={(isAdmin || isManagement) ? 6 : 5} style={{ padding: '14px 16px' }}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Customer Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 16, position: 'relative', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-2)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editingCustomer ? 'Edit Khata Customer' : 'Add New Khata Customer'}</h3>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={20}/></button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              <form onSubmit={handleSaveCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Customer Category & Extra Pay */}
                <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Customer Classification *</label>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      <input 
                        type="radio" 
                        name="custCategory" 
                        value="Regular Customer" 
                        checked={category === 'Regular Customer'} 
                        onChange={() => setCategory('Regular Customer')} 
                      />
                      Regular Customer
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      <input 
                        type="radio" 
                        name="custCategory" 
                        value="Employee" 
                        checked={category === 'Employee'} 
                        onChange={() => setCategory('Employee')} 
                      />
                      Employee
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      <input 
                        type="radio" 
                        name="custCategory" 
                        value="Company" 
                        checked={category === 'Company'} 
                        onChange={() => setCategory('Company')} 
                      />
                      Company
                    </label>
                  </div>

                  {/* Company Name field when Company category is selected */}
                  {category === 'Company' && (
                    <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--surface-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                        Company Name <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <input 
                        type="text" 
                        required 
                        placeholder="e.g. Aramco, Al-Baik, Tech Solutions Ltd" 
                        value={companyName} 
                        onChange={e => setCompanyName(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--surface-3)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 13, boxSizing: 'border-box' }}
                      />
                    </div>
                  )}

                  {category === 'Employee' && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--surface-3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {/* Option A: Select Registered Employee vs Option B: Manual Entry */}
                      <div style={{ display: 'flex', gap: 16 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: employeeSelectMode === 'registered' ? 700 : 500, color: employeeSelectMode === 'registered' ? 'var(--primary)' : 'var(--text)' }}>
                          <input 
                            type="radio" 
                            name="empSelectMode" 
                            value="registered" 
                            checked={employeeSelectMode === 'registered'} 
                            onChange={() => setEmployeeSelectMode('registered')} 
                          />
                          Select Registered Employee
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: employeeSelectMode === 'manual' ? 700 : 500, color: employeeSelectMode === 'manual' ? 'var(--primary)' : 'var(--text)' }}>
                          <input 
                            type="radio" 
                            name="empSelectMode" 
                            value="manual" 
                            checked={employeeSelectMode === 'manual'} 
                            onChange={() => {
                              setEmployeeSelectMode('manual');
                              setSelectedEmployeeId('');
                            }} 
                          />
                          Manual Entry
                        </label>
                      </div>

                      {/* Option A Dropdown: Registered Employees from Manage Employees */}
                      {employeeSelectMode === 'registered' && (
                        <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 6, border: '1px solid var(--surface-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)' }}>
                              Select Employee from Manage Employees *
                            </label>
                            {selectedEmployeeId && (
                              <span style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 700 }}>✓ Linked</span>
                            )}
                          </div>
                          
                          <input 
                            type="text" 
                            placeholder="Type to filter employees by name or code..."
                            value={employeeSearchTerm}
                            onChange={e => setEmployeeSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}
                          />

                          <select 
                            value={selectedEmployeeId} 
                            onChange={e => handleSelectRegisteredEmployee(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--primary)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}
                          >
                            <option value="">-- Choose an Employee ({registeredEmployees.length} registered) --</option>
                            {registeredEmployees
                              .filter(emp => {
                                if (!employeeSearchTerm.trim()) return true;
                                const s = employeeSearchTerm.toLowerCase();
                                return (
                                  (emp.name || '').toLowerCase().includes(s) ||
                                  (emp.employee_id || '').toLowerCase().includes(s)
                                );
                              })
                              .map(emp => {
                                const empCode = emp.employee_id ? (String(emp.employee_id).startsWith('EMP') ? emp.employee_id : `EMP-${emp.employee_id}`) : '';
                                return (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.name} {empCode ? `(${empCode})` : ''}
                                  </option>
                                );
                              })}
                          </select>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Selecting an existing employee links this Khata account to their record and auto-fills their details.
                          </div>
                        </div>
                      )}

                      <div style={{ paddingTop: 4 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#1d4ed8' }}>
                          <input 
                            type="checkbox" 
                            checked={isExtraPay} 
                            onChange={e => setIsExtraPay(e.target.checked)} 
                          />
                          Classify as "Extra Pay" Account
                        </label>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          If checked, credit transactions for this employee will be classified under Extra Pay.
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Account Status */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 700 }}>Account Status *</label>
                    <select 
                      value={status} 
                      onChange={e => setStatus(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                    >
                      <option value="Active">Active (Orders & Payments Allowed)</option>
                      <option value="Deactivated">Deactivated (Only Payments, No New Orders)</option>
                    </select>
                  </div>
                </div>

                {/* Customer Discount Configuration: Radio Buttons for None / Package / Custom */}
                <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--surface-3)' }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    Discount Configuration (Auto-applied in POS) *
                  </label>

                  {/* Radio Buttons for Discount Selection */}
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: discountMode === 'none' ? 700 : 500, color: discountMode === 'none' ? 'var(--primary)' : 'var(--text)' }}>
                      <input 
                        type="radio" 
                        name="discountMode" 
                        value="none" 
                        checked={discountMode === 'none'} 
                        onChange={() => setDiscountMode('none')} 
                      />
                      No Discount
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: discountMode === 'package' ? 700 : 500, color: discountMode === 'package' ? 'var(--primary)' : 'var(--text)' }}>
                      <input 
                        type="radio" 
                        name="discountMode" 
                        value="package" 
                        checked={discountMode === 'package'} 
                        onChange={() => setDiscountMode('package')} 
                      />
                      Assign Discount Package
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: discountMode === 'custom' ? 700 : 500, color: discountMode === 'custom' ? 'var(--primary)' : 'var(--text)' }}>
                      <input 
                        type="radio" 
                        name="discountMode" 
                        value="custom" 
                        checked={discountMode === 'custom'} 
                        onChange={() => setDiscountMode('custom')} 
                      />
                      Custom / Manual Discount
                    </label>
                  </div>

                  {/* Case 1: No Discount */}
                  {discountMode === 'none' && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      No automatic discount will be applied during order billing for this customer.
                    </div>
                  )}

                  {/* Case 2: Assign Existing Package */}
                  {discountMode === 'package' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <select 
                        value={discountPackageId} 
                        onChange={e => setDiscountPackageId(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--primary)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                      >
                        <option value="">-- Select an Existing Discount Package --</option>
                        {discountPackages.map(pkg => {
                          let rules = pkg.discount_rules;
                          if (typeof rules === 'string') {
                            try { rules = JSON.parse(rules); } catch(e) { rules = []; }
                          }
                          const rCount = Array.isArray(rules) ? rules.length : 0;
                          return (
                            <option key={pkg.id} value={pkg.id} disabled={!pkg.is_active}>
                              {pkg.name} {rCount > 0 ? `(${rCount} rules)` : ''} {!pkg.is_active ? '[Deactivated]' : ''}
                            </option>
                          );
                        })}
                      </select>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Assigned package rules will automatically apply when billing this customer in POS.
                      </div>
                    </div>
                  )}

                  {/* Case 3: Direct Custom / Manual Category & Item Discount Rules */}
                  {discountMode === 'custom' && (
                    <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8, border: '1px solid var(--surface-3)' }}>
                      <DiscountRuleBuilder 
                        rules={customerModalRules} 
                        setRules={setCustomerModalRules} 
                        categories={categories} 
                        items={items} 
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                        These custom discount rules will directly belong to this customer and apply in POS.
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 700 }}>Customer Name *</label>
                  <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ali Ahmed" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box', fontSize: 13 }} />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 700 }}>Phone (Optional)</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="050xxxxxxx" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box', fontSize: 13 }} />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 700 }}>Reference (Optional)</label>
                  <input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. Employee ID, Department, Company" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box', fontSize: 13 }} />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 700 }}>Credit Limit (Optional, 0 = No Limit)</label>
                  <input type="number" step="0.01" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box', fontSize: 13 }} />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 700 }}>Notes / Remarks (Optional)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', outline: 'none', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical', fontSize: 13 }} />
                </div>

                {isAdmin && (
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 700 }}>Assign Branches</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {AVAILABLE_BRANCHES.map(br => (
                        <label key={br} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
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

                <button type="submit" disabled={saving} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', marginTop: 8, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving...' : (editingCustomer ? 'Update Customer' : 'Create Customer')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Discount Package Modal (Create form at TOP, Saved packages at BOTTOM) */}
      {showPackageModal && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 750, maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 16, position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
            
            <div style={{ padding: '20px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-2)', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag size={20} /> Reusable Discount Packages
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Configure category-wise and item-wise custom discounts reusable across multiple Khata customers
                </p>
              </div>
              <button type="button" onClick={() => setShowPackageModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={20}/></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {/* TOP: Package Builder Form (Create New on top) */}
              <form onSubmit={handleSavePackage} style={{ border: '1.5px solid var(--surface-3)', padding: 18, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>
                    {editingPackageId ? 'Edit Discount Package Configuration' : 'Create New Discount Package'}
                  </h4>
                  {editingPackageId && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setEditingPackageId(null);
                        setPkgName('');
                        setPkgRules([]);
                        setPkgIsActive(true);
                      }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      Discount Package Name (Must be Unique) *
                    </label>
                    <input 
                      required 
                      value={pkgName} 
                      onChange={e => setPkgName(e.target.value)} 
                      placeholder="e.g. Employee Discount, VIP Customer Discount" 
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--surface-3)', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} 
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={pkgIsActive} 
                        onChange={e => setPkgIsActive(e.target.checked)} 
                      />
                      Active Package
                    </label>
                  </div>
                </div>

                {/* Reuse the custom discount rule builder */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    Category & Item Discount Rules:
                  </label>
                  <DiscountRuleBuilder 
                    rules={pkgRules} 
                    setRules={setPkgRules} 
                    categories={categories} 
                    items={items} 
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                  <button 
                    type="submit" 
                    disabled={savingPackage}
                    style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: savingPackage ? 'not-allowed' : 'pointer' }}
                  >
                    {savingPackage ? 'Saving Package...' : (editingPackageId ? 'Update Discount Package' : 'Save Discount Package')}
                  </button>
                </div>
              </form>

              {/* BOTTOM: Saved Packages List (Neeche) */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={16} /> Saved Packages ({discountPackages.length})
                </h4>

                <div style={{ border: '1px solid var(--surface-2)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--surface-3)' }}>
                        <th style={{ padding: '10px 14px' }}>Package Name</th>
                        <th style={{ padding: '10px 14px' }}>Configured Rules</th>
                        <th style={{ padding: '10px 14px' }}>Status</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discountPackages.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)' }}>No discount packages created yet. Use the builder above to create one.</td></tr>
                      ) : (
                        discountPackages.map(pkg => {
                          let rules = pkg.discount_rules;
                          if (typeof rules === 'string') {
                            try { rules = JSON.parse(rules); } catch(e) { rules = []; }
                          }
                          const ruleList = Array.isArray(rules) ? rules : [];
                          const isCurrentlyEditing = editingPackageId === pkg.id;

                          return (
                            <tr key={pkg.id} style={{ borderBottom: '1px solid var(--surface-2)', background: isCurrentlyEditing ? 'rgba(255,184,0,0.1)' : 'transparent' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                                {pkg.name} {isCurrentlyEditing && <span style={{ fontSize: 11, color: 'var(--primary)' }}>(Editing)</span>}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {ruleList.length === 0 ? (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No rules</span>
                                  ) : (
                                    ruleList.map((r, i) => (
                                      <span key={i} style={{ fontSize: 11, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>
                                        {r.targetName}: <b>{r.discountValue}{r.discountType === 'percentage' ? '%' : ` ${CURRENCY}`}</b>
                                      </span>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {pkg.is_active ? (
                                  <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>Active</span>
                                ) : (
                                  <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>Deactivated</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                                  <button 
                                    type="button"
                                    onClick={() => handleOpenApplyOn(pkg)}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      color: '#2563eb',
                                      border: '1px solid rgba(59, 130, 246, 0.3)',
                                      padding: '4px 9px',
                                      borderRadius: 6,
                                      cursor: 'pointer',
                                      fontSize: 11.5,
                                      fontWeight: 700,
                                      marginRight: 4
                                    }}
                                    title="Apply this package to employees & customers"
                                  >
                                    <Users size={14} /> Apply On
                                  </button>
                                  <button onClick={() => handleEditPackage(pkg)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Edit Package">
                                    <Edit size={16} />
                                  </button>
                                  <button onClick={() => handleDeletePackage(pkg.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }} title="Delete Package">
                                    <Trash2 size={16} />
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
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Customer Detail & Monthly Ledger Modal */}
      {showLedger && activeCustomer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 980, height: '92vh', maxHeight: '92vh', borderRadius: 16, padding: '16px 20px', position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 35px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
            
            {/* Modal Header: Title, Badges, Integrated Overall Balance, and Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingRight: 32, flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{activeCustomer.name}'s Khata</span>
                </h3>
                {activeCustomer.category === 'Employee' && (
                  <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 7px', borderRadius: 12, fontWeight: 700 }}>
                    Employee {activeCustomer.is_extra_pay ? '(Extra Pay)' : ''}
                  </span>
                )}
                {activeCustomer.category === 'Company' && (
                  <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 7px', borderRadius: 12, fontWeight: 700 }}>
                    Company {activeCustomer.company_name ? `(${activeCustomer.company_name})` : ''}
                  </span>
                )}
                {activeCustomer.discount_package_name && (
                  <span style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', color: '#059669', padding: '1px 7px', borderRadius: 6, fontWeight: 700 }}>
                    Pkg: {activeCustomer.discount_package_name}
                  </span>
                )}
                {(activeCustomer.status === 'Deactivated' || activeCustomer.is_active === false) && (
                  <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 7px', borderRadius: 12, fontWeight: 700 }}>
                    Deactivated
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Header Balances: Both Current/Selected Month Balance AND All Balance (Overall) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* Current / Selected Month Balance */}
                  {(() => {
                    const curMonthKey = getCurrentMonthStr();
                    const curMonthSummary = monthlySummary.find(s => (s.billing_month || s.month) === curMonthKey);
                    const curMonthNet = curMonthSummary ? parseFloat(curMonthSummary.net_balance || curMonthSummary.remaining_balance || 0) : 0;

                    const activeMonthNet = selectedLedgerMonth === 'All'
                      ? curMonthNet
                      : parseFloat(selectedMonthSummaryData?.net_balance || selectedMonthSummaryData?.remaining_balance || 0);

                    const badgeLabel = selectedLedgerMonth === 'All'
                      ? 'Current Month Bal:'
                      : `${formatMonthDisplay(selectedLedgerMonth)} Bal:`;

                    const isDue = activeMonthNet > 0;
                    const isAdv = activeMonthNet < 0;

                    return (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 6, 
                        background: isDue ? '#fef2f2' : (isAdv ? '#ecfdf5' : 'var(--surface-2)'), 
                        color: isDue ? '#b91c1c' : (isAdv ? '#065f46' : 'var(--text)'),
                        padding: '5px 12px', 
                        borderRadius: 8, 
                        border: `1.5px solid ${isDue ? '#fecaca' : (isAdv ? '#a7f3d0' : 'var(--surface-3)')}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                      }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.9 }}>{badgeLabel}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 900 }}>
                          {CURRENCY} {Math.abs(activeMonthNet).toFixed(2)} {isDue ? '(DR / Dues)' : (isAdv ? '(CR / Adv)' : '(Settled)')}
                        </span>
                      </div>
                    );
                  })()}

                  {/* All Balance (Overall Balance Across All Months) */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 7, 
                    background: activeCustomer.balance > 0 ? '#dc2626' : (activeCustomer.balance < 0 ? '#16a34a' : '#475569'), 
                    color: '#ffffff',
                    padding: '5px 14px', 
                    borderRadius: 8, 
                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                    border: '1px solid rgba(255,255,255,0.2)' 
                  }}>
                    <span style={{ fontSize: 11.5, color: '#ffffff', fontWeight: 700, opacity: 0.95 }}>All Balance (Overall):</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: 0.2 }}>
                      {CURRENCY} {Math.abs(activeCustomer.balance).toFixed(2)} {activeCustomer.balance > 0 ? '(DR / Dues)' : (activeCustomer.balance < 0 ? '(CR / Advance)' : '(Settled)')}
                    </span>
                  </div>

                  {(isAdmin || isDeveloper) && (
                    <button 
                      type="button"
                      onClick={() => {
                        setResetCustomerTarget(activeCustomer);
                        setSingleResetReason('');
                        setSingleResetConfirmInput('');
                      }} 
                      title={`Reset ${activeCustomer.name}'s balance to 0.00`}
                      style={{ 
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 12px',
                        borderRadius: 8,
                        border: '1.5px solid rgba(239, 68, 68, 0.35)',
                        background: 'rgba(239, 68, 68, 0.08)',
                        color: '#dc2626',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <RotateCcw size={13} />
                      <span>Reset Balance</span>
                    </button>
                  )}
                </div>

                {isAdmin && (
                  <button 
                    type="button"
                    onClick={() => setShowLedgerDiscounts(!showLedgerDiscounts)} 
                    style={{ 
                      background: showLedgerDiscounts ? 'var(--primary)' : 'var(--surface-2)', 
                      color: showLedgerDiscounts ? '#fff' : 'var(--text)', 
                      border: '1px solid var(--surface-3)', 
                      padding: '5px 10px', 
                      borderRadius: 6, 
                      cursor: 'pointer', 
                      fontSize: 12, 
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5
                    }}
                  >
                    <Percent size={13} />
                    {showLedgerDiscounts ? 'Close Discounts' : 'Custom Discounts'}
                  </button>
                )}

                <button 
                  onClick={() => setShowLedger(false)} 
                  style={{ position: 'absolute', right: 14, top: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  title="Close Modal"
                >
                  <X size={20}/>
                </button>
              </div>
            </div>

            {/* Collapsible Discount Configuration: Option A (Saved Package) vs Option B (Custom Rules) */}
            {showLedgerDiscounts && isAdmin && (
              <div style={{ marginBottom: 10, border: '2px solid var(--primary)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)', flexShrink: 0 }}>
                <div style={{ background: 'rgba(255,184,0,0.15)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-3)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    Discount Configuration for {activeCustomer.name}
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setShowLedgerDiscounts(false)} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={{ padding: 12, maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Selection Mode: Option A vs Option B vs No Discount */}
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--surface-3)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: ledgerDiscountMode === 'package' ? 700 : 500, color: ledgerDiscountMode === 'package' ? 'var(--primary)' : 'var(--text)' }}>
                      <input 
                        type="radio" 
                        name="ledgerDiscountMode" 
                        value="package" 
                        checked={ledgerDiscountMode === 'package'} 
                        onChange={() => setLedgerDiscountMode('package')} 
                      />
                      Option A: Select Saved Discount Package
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: ledgerDiscountMode === 'custom' ? 700 : 500, color: ledgerDiscountMode === 'custom' ? 'var(--primary)' : 'var(--text)' }}>
                      <input 
                        type="radio" 
                        name="ledgerDiscountMode" 
                        value="custom" 
                        checked={ledgerDiscountMode === 'custom'} 
                        onChange={() => setLedgerDiscountMode('custom')} 
                      />
                      Option B: Create Custom Discount Rules
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: ledgerDiscountMode === 'none' ? 700 : 500, color: ledgerDiscountMode === 'none' ? 'var(--primary)' : 'var(--text)' }}>
                      <input 
                        type="radio" 
                        name="ledgerDiscountMode" 
                        value="none" 
                        checked={ledgerDiscountMode === 'none'} 
                        onChange={() => setLedgerDiscountMode('none')} 
                      />
                      No Discount
                    </label>
                  </div>

                  {/* Option A: Saved Package Dropdown */}
                  {ledgerDiscountMode === 'package' && (
                    <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8, border: '1px solid var(--surface-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                        Select Reusable Discount Package:
                      </label>
                      <select 
                        value={ledgerSelectedPackageId} 
                        onChange={e => setLedgerSelectedPackageId(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--primary)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                      >
                        <option value="">-- Choose a Saved Discount Package --</option>
                        {discountPackages.map(pkg => {
                          let rules = pkg.discount_rules;
                          if (typeof rules === 'string') {
                            try { rules = JSON.parse(rules); } catch(e) { rules = []; }
                          }
                          const rCount = Array.isArray(rules) ? rules.length : 0;
                          return (
                            <option key={pkg.id} value={pkg.id} disabled={!pkg.is_active}>
                              {pkg.name} {rCount > 0 ? `(${rCount} rules)` : ''} {!pkg.is_active ? '[Deactivated]' : ''}
                            </option>
                          );
                        })}
                      </select>
                      {ledgerSelectedPackageId && (() => {
                        const sel = discountPackages.find(p => p.id === parseInt(ledgerSelectedPackageId, 10));
                        if (!sel) return null;
                        let rList = sel.discount_rules;
                        if (typeof rList === 'string') {
                          try { rList = JSON.parse(rList); } catch(e) { rList = []; }
                        }
                        return (
                          <div style={{ fontSize: 11.5, color: '#15803d', background: '#dcfce7', padding: '6px 10px', borderRadius: 6, marginTop: 4 }}>
                            <b>Package Active:</b> {sel.name} &bull; {Array.isArray(rList) && rList.length > 0 ? `Includes ${rList.length} configured rules` : 'No rules configured'} (Auto-applied in POS)
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Option B: Custom Discount Builder */}
                  {ledgerDiscountMode === 'custom' && (
                    <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8, border: '1px solid var(--surface-3)' }}>
                      <DiscountRuleBuilder 
                        rules={customerCustomRules} 
                        setRules={setCustomerCustomRules} 
                        categories={categories} 
                        items={items} 
                      />
                    </div>
                  )}

                  {/* No Discount Notice */}
                  {ledgerDiscountMode === 'none' && (
                    <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                      No automatic discount package or custom rules will apply when billing this account.
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <button 
                      type="button" 
                      onClick={() => setShowLedgerDiscounts(false)}
                      style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="button" 
                      onClick={handleSaveLedgerDiscounts} 
                      disabled={savingDiscounts}
                      style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: savingDiscounts ? 'not-allowed' : 'pointer', fontSize: 12 }}
                    >
                      {savingDiscounts ? 'Saving...' : 'Save Discount Configuration'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Compact 1-Line Month-Wise Filter & Period Breakdown Strip */}
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: '5px 10px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Month:</span>
                <select 
                  value={selectedLedgerMonth} 
                  onChange={e => handleSelectLedgerMonth(e.target.value)}
                  style={{ 
                    padding: '3px 8px', 
                    borderRadius: 6, 
                    border: '1px solid var(--surface-3)', 
                    background: 'var(--surface)', 
                    color: 'var(--text)', 
                    fontSize: 12, 
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="All">All Months (Complete History)</option>
                  {availableMonths.map(m => {
                    let tag = '';
                    if (m.key === getCurrentMonthStr()) tag = ' (Current)';
                    else if (m.key === getSaudiPreviousMonthStr()) tag = ' (Previous)';
                    return (
                      <option key={m.key} value={m.key}>
                        {m.label}{tag}
                      </option>
                    );
                  })}
                </select>
                <button 
                  type="button"
                  onClick={() => handleSelectLedgerMonth('All')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--surface-3)',
                    background: selectedLedgerMonth === 'All' ? 'var(--primary)' : 'var(--surface)',
                    color: selectedLedgerMonth === 'All' ? '#fff' : 'var(--text)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  All
                </button>
              </div>

              {selectedLedgerMonth !== 'All' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
                  {/* Debits Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fef2f2', border: '1px solid #fecaca', padding: '3px 9px', borderRadius: 6 }}>
                    <span style={{ color: '#991b1b', fontWeight: 600, fontSize: 11.5 }}>Debits:</span>
                    <span style={{ color: '#dc2626', fontWeight: 800, fontSize: 12.5 }}>+{CURRENCY} {parseFloat(selectedMonthSummaryData?.debit || selectedMonthSummaryData?.total_debit || 0).toFixed(2)}</span>
                  </div>

                  {/* Credits Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 9px', borderRadius: 6 }}>
                    <span style={{ color: '#166534', fontWeight: 600, fontSize: 11.5 }}>Credits:</span>
                    <span style={{ color: '#16a34a', fontWeight: 800, fontSize: 12.5 }}>-{CURRENCY} {parseFloat(selectedMonthSummaryData?.credit || selectedMonthSummaryData?.total_credit || 0).toFixed(2)}</span>
                  </div>

                  {/* Month Net Badge & Balance Reconciliation */}
                  {(() => {
                    const netVal = parseFloat(selectedMonthSummaryData?.net_balance || selectedMonthSummaryData?.remaining_balance || 0);
                    const isDue = netVal > 0;
                    const isAdv = netVal < 0;
                    const overallTotal = parseFloat(activeCustomer.balance || 0);
                    const otherMonthsNet = overallTotal - netVal;

                    return (
                      <>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 5, 
                          background: isDue ? '#fff1f2' : (isAdv ? '#ecfdf5' : 'var(--surface-2)'), 
                          border: `1px solid ${isDue ? '#fecdd3' : (isAdv ? '#a7f3d0' : 'var(--surface-3)')}`, 
                          padding: '3px 9px', 
                          borderRadius: 6 
                        }}>
                          <span style={{ color: isDue ? '#9f1239' : (isAdv ? '#065f46' : 'var(--text-secondary)'), fontWeight: 600, fontSize: 11.5 }}>Month Net:</span>
                          <span style={{ color: isDue ? '#e11d48' : (isAdv ? '#059669' : 'var(--text)'), fontWeight: 900, fontSize: 12.5 }}>
                            {CURRENCY} {Math.abs(netVal).toFixed(2)} {isDue ? '(DR)' : (isAdv ? '(CR)' : '(0.00)')}
                          </span>
                        </div>

                        {/* Other Months Balance Indicator */}
                        {Math.abs(otherMonthsNet) > 0.001 && (
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 5, 
                            background: otherMonthsNet > 0 ? '#fffbeb' : '#f0fdf4', 
                            border: `1px solid ${otherMonthsNet > 0 ? '#fde68a' : '#bbf7d0'}`, 
                            padding: '3px 8px', 
                            borderRadius: 6 
                          }} title="Net balance from all other months">
                            <span style={{ color: otherMonthsNet > 0 ? '#92400e' : '#166534', fontWeight: 600, fontSize: 11 }}>Other Months:</span>
                            <span style={{ color: otherMonthsNet > 0 ? '#b45309' : '#15803d', fontWeight: 800, fontSize: 11.5 }}>
                              {CURRENCY} {Math.abs(otherMonthsNet).toFixed(2)} {otherMonthsNet > 0 ? '(DR)' : '(CR)'}
                            </span>
                          </div>
                        )}

                        {/* All Balance (Overall) */}
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 5, 
                          background: '#1e293b', 
                          color: '#ffffff', 
                          padding: '3px 9px', 
                          borderRadius: 6,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)' 
                        }} title="Overall Account Balance across all months">
                          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>All Bal:</span>
                          <span style={{ fontSize: 12, fontWeight: 900 }}>
                            {CURRENCY} {Math.abs(overallTotal).toFixed(2)} {overallTotal > 0 ? '(DR)' : (overallTotal < 0 ? '(CR)' : '(0.00)')}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                /* All Months View: Show Overall Debits, Credits, and All Balance */
                (() => {
                  const allDebits = processedTransactions
                    .filter(t => !t.isCancelled && (t.type === 'CREDIT_ORDER' || t.type === 'CHARGE'))
                    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
                  const allCredits = processedTransactions
                    .filter(t => !t.isCancelled && t.type === 'PAYMENT')
                    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
                  const allNet = allDebits - allCredits;
                  const isAllDue = allNet > 0;
                  const isAllAdv = allNet < 0;

                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fef2f2', border: '1px solid #fecaca', padding: '3px 9px', borderRadius: 6 }}>
                        <span style={{ color: '#991b1b', fontWeight: 600, fontSize: 11.5 }}>All Debits:</span>
                        <span style={{ color: '#dc2626', fontWeight: 800, fontSize: 12.5 }}>+{CURRENCY} {allDebits.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 9px', borderRadius: 6 }}>
                        <span style={{ color: '#166534', fontWeight: 600, fontSize: 11.5 }}>All Credits:</span>
                        <span style={{ color: '#16a34a', fontWeight: 800, fontSize: 12.5 }}>-{CURRENCY} {allCredits.toFixed(2)}</span>
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 5, 
                        background: isAllDue ? '#fff1f2' : (isAllAdv ? '#ecfdf5' : 'var(--surface-2)'), 
                        border: `1px solid ${isAllDue ? '#fecdd3' : (isAllAdv ? '#a7f3d0' : 'var(--surface-3)')}`, 
                        padding: '3px 9px', 
                        borderRadius: 6 
                      }}>
                        <span style={{ color: isAllDue ? '#9f1239' : (isAllAdv ? '#065f46' : 'var(--text-secondary)'), fontWeight: 600, fontSize: 11.5 }}>All Balance:</span>
                        <span style={{ color: isAllDue ? '#e11d48' : (isAllAdv ? '#059669' : 'var(--text)'), fontWeight: 900, fontSize: 12.5 }}>
                          {CURRENCY} {Math.abs(allNet).toFixed(2)} {isAllDue ? '(DR)' : (isAllAdv ? '(CR)' : '(0.00)')}
                        </span>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Compact Employee Extra Pay Strip */}
            {activeCustomer.category === 'Employee' && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '4px 10px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#166534' }}>Extra Pay Filter:</span>
                  <div style={{ display: 'flex', background: 'white', borderRadius: 5, padding: 1, border: '1px solid #bbf7d0' }}>
                    {[
                      { id: 'All', label: 'All' },
                      { id: 'Extra Pay', label: 'Extra Pay Only' }
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleSelectClassificationFilter(f.id)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          border: 'none',
                          background: ledgerClassificationFilter === f.id ? '#16a34a' : 'transparent',
                          color: ledgerClassificationFilter === f.id ? '#fff' : '#166534',
                          cursor: 'pointer'
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5 }}>
                  {/* Highlighted Extra Pay Summary Badge with White Text */}
                  <div style={{ 
                    background: '#16a34a', 
                    color: '#ffffff', 
                    padding: '3px 10px', 
                    borderRadius: 6, 
                    fontSize: 12, 
                    fontWeight: 700, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6,
                    boxShadow: '0 1px 4px rgba(22, 163, 74, 0.3)'
                  }}>
                    <span>Extra Pay:</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#ffffff' }}>
                      +{CURRENCY} {monthExtraPayDebit.toFixed(2)}
                    </span>
                  </div>

                  {/* All Extra Pay: Visible ONLY when Month filter is set to "All Months" */}
                  {selectedLedgerMonth === 'All' && (
                    <div style={{ 
                      background: 'rgba(22, 163, 74, 0.12)', 
                      border: '1px solid #86efac', 
                      color: '#15803d', 
                      padding: '3px 9px', 
                      borderRadius: 6, 
                      fontSize: 12, 
                      fontWeight: 700, 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 6 
                    }}>
                      <span>All Extra Pay:</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: '#166534' }}>
                        {CURRENCY} {Math.abs(overallExtraPayTotal).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Transaction Entry Form: Exactly 3 Radio Options (Receive Major Payment, Add Debit, Extra Pay) */}
            {!isManagement && (
              <form onSubmit={handleAddPayment} style={{ background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: '7px 10px', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                {/* 3 Radio Options Row (in ma sa aik selected ho gi) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    {/* Option 1: Receive Major Payment */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: entryType === 'PAYMENT' ? 'var(--green)' : 'var(--text)' }}>
                      <input 
                        type="radio" 
                        name="ledgerEntryOption" 
                        value="PAYMENT" 
                        checked={entryType === 'PAYMENT'} 
                        onChange={() => setEntryType('PAYMENT')} 
                      />
                      Receive Major Payment
                    </label>

                    {/* Option 2: Add Debit / Manual Charge */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: entryType === 'CHARGE' ? 'var(--red)' : 'var(--text)' }}>
                      <input 
                        type="radio" 
                        name="ledgerEntryOption" 
                        value="CHARGE" 
                        checked={entryType === 'CHARGE'} 
                        onChange={() => setEntryType('CHARGE')} 
                      />
                      Add Debit / Manual Charge
                    </label>

                    {/* Option 3: Extra Pay (for Employee) */}
                    {activeCustomer.category === 'Employee' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: entryType === 'EXTRA_PAY' ? '#16a34a' : 'var(--text)' }}>
                        <input 
                          type="radio" 
                          name="ledgerEntryOption" 
                          value="EXTRA_PAY" 
                          checked={entryType === 'EXTRA_PAY'} 
                          onChange={() => setEntryType('EXTRA_PAY')} 
                        />
                        Extra Pay
                      </label>
                    )}
                  </div>

                  {/* Payment Method Radio Buttons (Only when Receive Major Payment is selected) */}
                  {entryType === 'PAYMENT' && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg)', padding: '2px 8px', borderRadius: 5, border: '1px solid var(--surface-3)', fontSize: 11.5 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Method:</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                        <input type="radio" name="paymentMethod" value="Cash" checked={paymentMethod === 'Cash'} onChange={() => setPaymentMethod('Cash')} />
                        Cash
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                        <input type="radio" name="paymentMethod" value="Card" checked={paymentMethod === 'Card'} onChange={() => setPaymentMethod('Card')} />
                        Card
                      </label>
                    </div>
                  )}
                </div>

                {/* Inputs Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '190px 145px 1fr auto', gap: 10, alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: entryType === 'PAYMENT' ? 'var(--green)' : (entryType === 'EXTRA_PAY' ? '#16a34a' : 'var(--red)'), fontSize: 16 }}>
                      {entryType === 'PAYMENT' ? '-' : '+'}
                    </span>
                    <input 
                      type="number" step="0.01" required placeholder="0.00"
                      value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} 
                      style={{ width: '100%', height: 42, minWidth: 180, padding: '6px 10px 6px 26px', borderRadius: 8, border: '2px solid var(--primary)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 16, fontWeight: 800, boxSizing: 'border-box' }} 
                    />
                  </div>

                  <div>
                    <input 
                      type="month" 
                      required 
                      value={billingMonth} 
                      onChange={e => setBillingMonth(e.target.value)} 
                      title="Billing Month to allocate against"
                      style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1.5px solid var(--surface-3)', background: 'var(--bg)', outline: 'none', fontSize: 12, boxSizing: 'border-box' }} 
                    />
                  </div>

                  <div>
                    <input 
                      type="text" 
                      placeholder={entryType === 'PAYMENT' ? "Payment Remarks / Note..." : (entryType === 'EXTRA_PAY' ? "Extra Pay Reason / Note..." : "Debit Reason / Note...")} 
                      value={paymentComment} 
                      onChange={e => setPaymentComment(e.target.value)} 
                      style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--surface-3)', background: 'var(--bg)', outline: 'none', fontSize: 12.5, boxSizing: 'border-box' }} 
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={submittingPayment}
                    style={{ 
                      background: entryType === 'PAYMENT' ? 'var(--green)' : (entryType === 'EXTRA_PAY' ? '#16a34a' : 'var(--red)'), 
                      color: '#fff', 
                      border: 'none', 
                      padding: '6px 14px', 
                      borderRadius: 6, 
                      fontWeight: 700, 
                      cursor: submittingPayment ? 'not-allowed' : 'pointer', 
                      fontSize: 12, 
                      whiteSpace: 'nowrap',
                      opacity: submittingPayment ? 0.75 : 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {submittingPayment && <RotateCcw size={12} className="spin" />}
                    <span>
                      {submittingPayment 
                        ? 'Processing...' 
                        : (entryType === 'PAYMENT' ? 'Receive Payment' : (entryType === 'EXTRA_PAY' ? '+ Add Extra Pay' : '+ Add Debit'))}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* Date Range Filter & Statement Export Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8, flexShrink: 0, background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--surface-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowDateRangeFilter(!showDateRangeFilter)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--surface-3)',
                    background: isDateRangeActive ? 'var(--primary)' : 'var(--surface)',
                    color: isDateRangeActive ? '#fff' : 'var(--text)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Filter size={13} />
                  {isDateRangeActive ? 'Date Filter Active' : 'Date Range Filter'}
                </button>

                {isDateRangeActive && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Period: <strong>{filterFromDate}</strong> to <strong>{filterToDate || filterFromDate}</strong>
                  </span>
                )}
              </div>

              {/* 3 Export Actions: Print Slip, Download Excel, Download PDF */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={handlePrintSlip}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--surface-3)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Print customer statement slip"
                >
                  <Printer size={13} /> Print Slip
                </button>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #bbf7d0',
                    background: '#f0fdf4',
                    color: '#166534',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Download structured Excel statement (.xlsx)"
                >
                  <Download size={13} /> Download Excel
                </button>

                <button
                  type="button"
                  onClick={handleExportPDF}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Download structured PDF statement (.pdf)"
                >
                  <FileText size={13} /> Download PDF
                </button>
              </div>
            </div>

            {/* Collapsible Date Range Picker Form */}
            {showDateRangeFilter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)', border: '1.5px solid var(--primary)', borderRadius: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>From Date:</label>
                  <input 
                    type="date" 
                    value={filterFromDate} 
                    onChange={e => setFilterFromDate(e.target.value)} 
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--surface-3)', fontSize: 12 }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>To Date:</label>
                  <input 
                    type="date" 
                    value={filterToDate} 
                    onChange={e => setFilterToDate(e.target.value)} 
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--surface-3)', fontSize: 12 }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyDateRange}
                  style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  Apply
                </button>
                {isDateRangeActive && (
                  <button
                    type="button"
                    onClick={handleClearDateRange}
                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            )}

            {/* Opening Balance Banner (prior to date range or month) */}
            {(isDateRangeActive || selectedLedgerMonth !== 'All') && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: '#475569', fontWeight: 700 }}>
                  {isDateRangeActive ? `Opening Balance (prior to ${filterFromDate}):` : `Opening Balance (prior to ${formatMonthDisplay(selectedLedgerMonth)}):` }
                </span>
                <span style={{ fontWeight: 800, fontSize: 13, color: openingBalance > 0 ? '#dc2626' : (openingBalance < 0 ? '#16a34a' : '#475569') }}>
                  {CURRENCY} {Math.abs(openingBalance).toFixed(2)} {openingBalance > 0 ? '(DR / Dues)' : (openingBalance < 0 ? '(CR / Advance)' : '(0.00)')}
                </span>
              </div>
            )}

            {/* Fully Scrollable Transactions List with Sticky Headers */}
            <div style={{ flex: 1, minHeight: 300, overflowY: 'auto', border: '1.5px solid var(--surface-2)', borderRadius: 8, background: 'var(--surface)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 2 }}>
                  <tr style={{ borderBottom: '2px solid var(--surface-3)' }}>
                    <th style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>Bill # & Date</th>
                    <th style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>Billing Month</th>
                    <th style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>Description & Remarks</th>
                    <th style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>Classification</th>
                    <th style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>Running Balance</th>
                    {isAdmin && <th style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {processedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No transactions found for {selectedLedgerMonth !== 'All' ? formatMonthDisplay(selectedLedgerMonth) : 'this account'}.
                      </td>
                    </tr>
                  ) : (
                    processedTransactions.map(t => {
                      const hasOrder = Boolean(t.order_id);
                      return (
                        <tr 
                          key={t.id} 
                          onClick={() => hasOrder && handleViewOrder(t.order_id)}
                          style={{ 
                            borderBottom: '1px solid var(--surface-2)', 
                            opacity: t.isCancelled ? 0.6 : 1,
                            cursor: hasOrder ? 'pointer' : 'default',
                            transition: 'background-color 0.15s'
                          }}
                          className={hasOrder ? 'clickable-ledger-row' : ''}
                          title={hasOrder ? `Click row to view full order slip for Bill #${t.slip_number || t.order_id}` : ''}
                        >
                          {/* Column 1: Bill # and underneath is the Date */}
                          <td style={{ padding: '8px 12px', fontSize: 13 }}>
                            {(t.type === 'CREDIT_ORDER' || hasOrder) ? (
                              <div>
                                <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ textDecoration: t.isCancelled ? 'line-through' : 'underline' }}>
                                    Bill #{t.slip_number || t.order_id}
                                  </span>
                                  {t.slip_number && t.order_id && (
                                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>(ID: #{t.order_id})</span>
                                  )}
                                  {t.isCancelled && (
                                    <span style={{ color: 'var(--red)', fontSize: 10.5, fontWeight: 'bold' }}>(Cancelled)</span>
                                  )}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {new Date(t.created_at).toLocaleString()}
                                </div>
                              </div>
                            ) : t.type === 'CHARGE' ? (
                              <div>
                                <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>
                                  Debit / Manual Charge
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {new Date(t.created_at).toLocaleString()}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>Major Payment</span>
                                  <span style={{ fontSize: 10.5, fontWeight: 600, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 4 }}>
                                    via {t.payment_method || 'Cash'}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {new Date(t.created_at).toLocaleString()}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Column 2: Billing Month */}
                          <td style={{ padding: '8px 12px', fontSize: 12 }}>
                            {t.billing_month ? (
                              <span style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, color: 'var(--primary)' }}>
                                {formatMonthDisplay(t.billing_month)}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>

                          {/* Column 3: Description & Remarks */}
                          <td style={{ padding: '8px 12px', fontSize: 12 }}>
                            <div>
                              {t.type === 'CREDIT_ORDER' ? (
                                <span style={{ fontWeight: 600 }}>Order Charge {hasOrder ? '🔍 (Click row to view slip)' : ''}</span>
                              ) : t.type === 'CHARGE' ? (
                                <span>Manual Charge {t.cashier_name ? `(by ${t.cashier_name})` : ''}</span>
                              ) : (
                                <span>Payment Received {t.cashier_name ? `(to ${t.cashier_name})` : ''}</span>
                              )}
                            </div>
                            {t.comments && (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <MessageSquare size={11} /> {t.comments}
                              </div>
                            )}
                          </td>

                          {/* Column 4: Classification */}
                          <td style={{ padding: '8px 12px', fontSize: 12 }}>
                            {t.classification === 'Extra Pay' ? (
                              <span style={{ fontSize: 10.5, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                Extra Pay
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                -
                              </span>
                            )}
                          </td>

                          {/* Column 5: Amount */}
                          <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: (t.type === 'CREDIT_ORDER' || t.type === 'CHARGE') ? 'var(--red)' : 'var(--green)', textDecoration: t.isCancelled ? 'line-through' : 'none' }}>
                            {(t.type === 'CREDIT_ORDER' || t.type === 'CHARGE') ? '+' : '-'} {CURRENCY} {Number(t.amount).toFixed(2)}
                          </td>

                          {/* Column 6: Running Balance */}
                          <td style={{ padding: '8px 12px', fontSize: 12.5, textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', color: (t.running_balance || 0) > 0 ? '#dc2626' : ((t.running_balance || 0) < 0 ? '#16a34a' : 'var(--text-muted)') }}>
                            {t.running_balance !== undefined ? `${CURRENCY} ${Math.abs(t.running_balance).toFixed(2)} ${t.running_balance > 0 ? '(DR)' : (t.running_balance < 0 ? '(CR)' : '(0.00)')}` : '-'}
                          </td>

                          {/* Column 7: Actions (Admin & Developer Only) */}
                          {isAdmin && (
                            <td onClick={(e) => e.stopPropagation()} style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  type="button"
                                  title="Edit Transaction (Admin / Developer)"
                                  onClick={() => handleOpenEditTxModal(t)}
                                  style={{
                                    padding: '3px 8px',
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    color: '#2563eb',
                                    border: '1px solid rgba(59, 130, 246, 0.25)',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 11,
                                    fontWeight: 700
                                  }}
                                >
                                  <Edit2 size={11} />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  title="Delete Transaction (Admin / Developer)"
                                  onClick={() => handleOpenDeleteTxModal(t)}
                                  style={{
                                    padding: '3px 8px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    color: '#dc2626',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 11,
                                    fontWeight: 700
                                  }}
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {processedTransactions.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--surface-50)', borderTop: '2px solid var(--surface-2)', fontWeight: 700 }}>
                      <td colSpan={isAdmin ? 6 : 5} style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {selectedLedgerMonth !== 'All' ? `${formatMonthDisplay(selectedLedgerMonth)} Net Balance:` : 'All Balance (Account Net Total):'}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', color: visibleSubtotal > 0 ? 'var(--red)' : (visibleSubtotal < 0 ? 'var(--green)' : 'var(--text)') }}>
                        {visibleSubtotal > 0 ? '+' : (visibleSubtotal < 0 ? '-' : '')} {CURRENCY} {Math.abs(visibleSubtotal).toFixed(2)}
                      </td>
                      {isAdmin && <td />}
                    </tr>
                    {selectedLedgerMonth !== 'All' && (
                      <tr style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--surface-3)', fontWeight: 800 }}>
                        <td colSpan={isAdmin ? 5 : 4} style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', color: 'var(--text)' }}>
                          All Balance (Overall Account Total):
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', fontWeight: 900, whiteSpace: 'nowrap', color: activeCustomer.balance > 0 ? 'var(--red)' : (activeCustomer.balance < 0 ? 'var(--green)' : 'var(--text)') }}>
                          {CURRENCY} {Math.abs(activeCustomer.balance).toFixed(2)} {activeCustomer.balance > 0 ? '(Due)' : (activeCustomer.balance < 0 ? '(Adv)' : '(0.00)')}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>

          </div>
        </div>
      )}


      {/* "Apply On" Modal for Saved Discount Package */}
      {applyOnPackage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 740, maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 16, boxShadow: '0 15px 40px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={20} style={{ color: 'var(--primary)' }} />
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Apply Package: "{applyOnPackage.name}"</h3>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Assign or remove this package across registered employees and customers ({applyOnSelectedIds.size} selected)
                </div>
              </div>
              <button 
                onClick={() => setApplyOnPackage(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                {/* Classification Filters */}
                <div style={{ display: 'flex', background: 'var(--surface-2)', padding: 3, borderRadius: 8, border: '1px solid var(--surface-3)' }}>
                  {[
                    { id: 'All', label: 'All', count: customers.length },
                    { id: 'Employees', label: 'Employees', count: customers.filter(c => c.category === 'Employee').length },
                    { id: 'Customers', label: 'Customers', count: customers.filter(c => c.category === 'Regular Customer').length },
                    { id: 'Companies', label: 'Companies', count: customers.filter(c => c.category === 'Company').length },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setApplyOnFilter(tab.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: applyOnFilter === tab.id ? 'var(--primary)' : 'transparent',
                        color: applyOnFilter === tab.id ? '#fff' : 'var(--text)',
                        transition: 'all 0.15s'
                      }}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                {/* Search Box */}
                <div style={{ position: 'relative', width: 220 }}>
                  <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Search by name, phone..." 
                    value={applyOnSearch} 
                    onChange={e => setApplyOnSearch(e.target.value)} 
                    style={{ width: '100%', padding: '6px 8px 6px 28px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--bg)', outline: 'none', fontSize: 12.5, boxSizing: 'border-box' }} 
                  />
                </div>
              </div>

              {/* Quick Selection Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleSelectAllVisibleApplyOn(filteredApplyOnCustomers.map(c => c.id))}
                    style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid var(--surface-3)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}
                  >
                    Select All Visible
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnselectAllVisibleApplyOn(filteredApplyOnCustomers.map(c => c.id))}
                    style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid var(--surface-3)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}
                  >
                    Unselect All Visible
                  </button>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>
                  Showing {filteredApplyOnCustomers.length} records &bull; <b style={{ color: 'var(--primary)' }}>{applyOnSelectedIds.size} assigned</b>
                </span>
              </div>
            </div>

            {/* Record List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px', maxHeight: '45vh' }}>
              {filteredApplyOnCustomers.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No matching records found.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredApplyOnCustomers.map(c => {
                    const isSelected = applyOnSelectedIds.has(c.id);
                    const isAssignedToThis = c.discount_package_id === applyOnPackage.id;
                    const isAssignedToOther = c.discount_package_id && c.discount_package_id !== applyOnPackage.id;

                    return (
                      <div 
                        key={c.id} 
                        onClick={() => handleToggleApplyOnId(c.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--surface-3)',
                          background: isSelected ? 'rgba(255, 184, 0, 0.08)' : 'var(--surface)',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={() => {}} // handled by row onClick
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }} 
                          />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{c.name}</span>
                              {c.category === 'Employee' ? (
                                <span style={{ fontSize: 10.5, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                  Employee
                                </span>
                              ) : c.category === 'Company' ? (
                                <span style={{ fontSize: 10.5, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                  Company
                                </span>
                              ) : (
                                <span style={{ fontSize: 10.5, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                                  Customer
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              {c.phone ? c.phone : ''} {c.reference ? `• ${c.reference}` : ''}
                            </div>
                          </div>
                        </div>

                        <div>
                          {isAssignedToThis ? (
                            <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                              Assigned to This Package
                            </span>
                          ) : isAssignedToOther ? (
                            <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                              Other: {c.discount_package_name}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No Package</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)' }}>
              <button 
                type="button" 
                onClick={() => setApplyOnPackage(null)} 
                style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleSaveApplyOn} 
                disabled={savingApplyOn}
                style={{ padding: '7px 20px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: savingApplyOn ? 'not-allowed' : 'pointer', fontSize: 13 }}
              >
                {savingApplyOn ? 'Saving...' : `Save Assignments (${applyOnSelectedIds.size})`}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Full Order Detail Modal on top of everything */}
      {selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }}>
          <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
        </div>
      )}

      {/* Per-User Reset Balance Modal (Admin & Developer Only - Targets Selected User Only) */}
      {resetCustomerTarget && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            maxWidth: 500,
            width: '100%',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.35)',
            border: '1.5px solid #fca5a5',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
              padding: '16px 20px',
              borderBottom: '1px solid #fca5a5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#dc2626', color: '#fff', borderRadius: 8, padding: 6, display: 'flex' }}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#991b1b' }}>
                    Reset Khata Balance (Single User)
                  </h3>
                  <span style={{ fontSize: 11, color: '#b91c1c' }}>
                    Target Account: <strong>{resetCustomerTarget.name}</strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetCustomerTarget(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#991b1b', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Account summary banner */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{resetCustomerTarget.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Category: {resetCustomerTarget.category || 'Customer'} • Branch: {resetCustomerTarget.branch || 'All'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Current Balance</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: resetCustomerTarget.balance > 0 ? 'var(--red)' : (resetCustomerTarget.balance < 0 ? 'var(--green)' : 'var(--text)') }}>
                    {CURRENCY} {Math.abs(Number(resetCustomerTarget.balance || 0)).toFixed(2)} {resetCustomerTarget.balance > 0 ? '(Due)' : (resetCustomerTarget.balance < 0 ? '(Advance)' : '(0.00)')}
                  </div>
                </div>
              </div>

              <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#991b1b', lineHeight: 1.5 }}>
                <strong>SAFETY CONFIRMATION:</strong>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
                  <li>This action will reset <strong>ONLY {resetCustomerTarget.name}'s</strong> balance to 0.00.</li>
                  <li>No other customer accounts or transactions will be changed.</li>
                  <li>An official balancing settlement transaction will be created.</li>
                  <li>This reset will be recorded in the audit logs with your username and reason.</li>
                </ul>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  Mandatory Reason for Balance Reset: <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={singleResetReason}
                  onChange={(e) => setSingleResetReason(e.target.value)}
                  placeholder="e.g. Full settlement in cash, Month-end reconciliation, Annual zeroing"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--surface-3)',
                    background: 'var(--surface-2)',
                    fontSize: 13,
                    color: 'var(--text)',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                  Type "RESET" to confirm: <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={singleResetConfirmInput}
                  onChange={(e) => setSingleResetConfirmInput(e.target.value)}
                  placeholder="RESET"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1.5px solid #dc2626',
                    background: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    outline: 'none',
                    letterSpacing: 1.5
                  }}
                />
              </div>
            </div>

            <div style={{
              padding: '12px 20px',
              background: 'var(--surface-2)',
              borderTop: '1px solid var(--surface-3)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10
            }}>
              <button
                type="button"
                onClick={() => setResetCustomerTarget(null)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--surface)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--surface-3)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={singleResetConfirmInput.trim().toUpperCase() !== 'RESET' || !singleResetReason.trim() || resettingSingleBalance}
                onClick={handleResetSingleCustomerBalance}
                style={{
                  padding: '8px 18px',
                  background: (singleResetConfirmInput.trim().toUpperCase() === 'RESET' && singleResetReason.trim()) ? '#dc2626' : '#9ca3af',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: (singleResetConfirmInput.trim().toUpperCase() === 'RESET' && singleResetReason.trim() && !resettingSingleBalance) ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {resettingSingleBalance ? <RotateCcw size={13} className="spin" /> : <AlertTriangle size={13} />}
                <span>{resettingSingleBalance ? 'Resetting...' : `Confirm Reset for ${resetCustomerTarget.name}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal (Admin & Developer Only) */}
      {editingTxModal && editingTxModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            maxWidth: 480,
            width: '100%',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--surface-3)',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              padding: '14px 18px',
              borderBottom: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#2563eb', color: '#fff', borderRadius: 8, padding: 6, display: 'flex' }}>
                  <Edit2 size={16} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1e40af' }}>
                    Edit Transaction #{editingTxModal.tx.id}
                  </h3>
                  <span style={{ fontSize: 11, color: '#3b82f6' }}>
                    Admin / Developer Modification with Audit Log
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTxModal(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#1e40af', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    Amount ({CURRENCY}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingTxModal.amount}
                    onChange={(e) => setEditingTxModal(prev => ({ ...prev, amount: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--surface-3)',
                      background: 'var(--surface-2)',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--text)',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    Type *
                  </label>
                  <select
                    value={editingTxModal.type}
                    onChange={(e) => setEditingTxModal(prev => ({ ...prev, type: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--surface-3)',
                      background: 'var(--surface-2)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text)',
                      outline: 'none'
                    }}
                  >
                    <option value="CREDIT_ORDER">CREDIT_ORDER (Order Debit)</option>
                    <option value="CHARGE">CHARGE (Manual Debit)</option>
                    <option value="PAYMENT">PAYMENT (Major Payment)</option>
                    <option value="EXTRA_PAY">EXTRA_PAY (Advance / Extra)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    Classification
                  </label>
                  <select
                    value={editingTxModal.classification}
                    onChange={(e) => setEditingTxModal(prev => ({ ...prev, classification: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--surface-3)',
                      background: 'var(--surface-2)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text)',
                      outline: 'none'
                    }}
                  >
                    <option value="Order">Order</option>
                    <option value="Payment">Payment</option>
                    <option value="Adjustment">Adjustment</option>
                    <option value="Correction">Correction</option>
                    <option value="Settlement">Settlement</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    Billing Month (YYYY-MM)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2026-11"
                    value={editingTxModal.billing_month || ''}
                    onChange={(e) => setEditingTxModal(prev => ({ ...prev, billing_month: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--surface-3)',
                      background: 'var(--surface-2)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text)',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  Description / Comments
                </label>
                <input
                  type="text"
                  value={editingTxModal.comments || ''}
                  onChange={(e) => setEditingTxModal(prev => ({ ...prev, comments: e.target.value }))}
                  placeholder="Comments"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--surface-3)',
                    background: 'var(--surface-2)',
                    fontSize: 13,
                    color: 'var(--text)',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                  Reason for Modification (Mandatory for Audit Trail) *
                </label>
                <textarea
                  rows={2}
                  value={editingTxModal.reason || ''}
                  onChange={(e) => setEditingTxModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Explain why this transaction was modified..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1.5px solid #f87171',
                    background: '#fff',
                    fontSize: 12.5,
                    color: 'var(--text)',
                    outline: 'none',
                    resize: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{
              padding: '12px 20px',
              background: 'var(--surface-2)',
              borderTop: '1px solid var(--surface-3)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10
            }}>
              <button
                type="button"
                onClick={() => setEditingTxModal(null)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--surface)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--surface-3)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingTxEdit}
                onClick={handleSaveTxEdit}
                style={{
                  padding: '8px 18px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: savingTxEdit ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {savingTxEdit ? <RotateCcw size={13} className="spin" /> : <Check size={13} />}
                <span>{savingTxEdit ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Transaction Confirmation Modal (Admin & Developer Only) */}
      {deletingTxModal && deletingTxModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 14,
            maxWidth: 440,
            width: '100%',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
            border: '1px solid #fed7aa',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
              padding: '14px 18px',
              borderBottom: '1px solid #fed7aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#ea580c', color: '#fff', borderRadius: 8, padding: 6, display: 'flex' }}>
                  <Trash2 size={16} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#9a3412' }}>
                    Delete Transaction #{deletingTxModal.tx.id}
                  </h3>
                  <span style={{ fontSize: 11, color: '#c2410c' }}>
                    Reverses {CURRENCY} {parseFloat(deletingTxModal.tx.amount || 0).toFixed(2)} from balance
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingTxModal(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9a3412', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                Are you sure you want to delete this transaction of <strong>{CURRENCY} {parseFloat(deletingTxModal.tx.amount || 0).toFixed(2)}</strong>?
                The customer balance will be adjusted automatically.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                  Reason for Deletion (Recorded in Audit Trail) *
                </label>
                <textarea
                  rows={2}
                  value={deletingTxModal.reason || ''}
                  onChange={(e) => setDeletingTxModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Explain why this transaction was deleted..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1.5px solid #f87171',
                    background: '#fff',
                    fontSize: 12.5,
                    color: 'var(--text)',
                    outline: 'none',
                    resize: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{
              padding: '12px 18px',
              background: 'var(--surface-2)',
              borderTop: '1px solid var(--surface-3)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10
            }}>
              <button
                type="button"
                onClick={() => setDeletingTxModal(null)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--surface)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--surface-3)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingTx}
                onClick={handleConfirmDeleteTx}
                style={{
                  padding: '8px 18px',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: deletingTx ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {deletingTx ? <RotateCcw size={13} className="spin" /> : <Trash2 size={13} />}
                <span>{deletingTx ? 'Deleting...' : 'Delete Transaction'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
