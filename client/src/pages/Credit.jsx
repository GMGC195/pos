import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import { 
  Plus, Edit, Trash2, FileText, X, Percent, Tag, Calendar, 
  MessageSquare, Check, AlertTriangle, Filter, ArrowDownRight, 
  ArrowUpRight, UserCheck, UserX, ChevronDown, Layers, ShieldCheck,
  Users, Search
} from 'lucide-react';
import { CURRENCY } from '../config';
import { useAuth } from '../contexts/AuthContext';
import OrderDetailModal from '../components/OrderDetailModal';

const AVAILABLE_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3'];

const getCurrentMonthStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
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
    fetchCustomers();
  }, [branchFilter]);

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
      const curMonth = getCurrentMonthStr();
      const url = (isAdmin || isManagement) && branchFilter !== 'All' 
        ? `/api/credit?branch=${encodeURIComponent(branchFilter)}&month=${curMonth}` 
        : `/api/credit?month=${curMonth}`;
      const res = await axios.get(url);
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

    const payload = {
      name,
      phone,
      credit_limit: creditLimit,
      reference,
      notes,
      available_branches: isAdmin ? selectedBranches : [user?.branch?.split(',')[0]?.trim() || ''],
      category,
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
      const refParts = [];
      if (emp.employee_id) refParts.push(`Emp #${emp.employee_id}`);
      if (emp.role) refParts.push(emp.role);
      if (emp.branch) refParts.push(emp.branch);
      setReference(refParts.join(' • '));
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
    
    // Default to current month automatically
    const currentMonth = getCurrentMonthStr();
    setSelectedLedgerMonth(currentMonth);
    setBillingMonth(currentMonth);
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

    try {
      const [ledgerRes, summaryRes] = await Promise.all([
        axios.get(`/api/credit/${customer.id}/ledger`, { params: { month: currentMonth } }),
        axios.get(`/api/credit/${customer.id}/monthly-summary`)
      ]);
      setLedger(ledgerRes.data || []);
      setMonthlySummary(summaryRes.data || []);
      setShowLedger(true);
    } catch (err) {
      toast.error('Failed to load ledger and monthly breakdown');
    }
  };

  const reloadLedger = async (month = selectedLedgerMonth, classification = ledgerClassificationFilter) => {
    if (!activeCustomer) return;
    try {
      const params = {};
      if (month && month !== 'All') params.month = month;
      if (classification && classification !== 'All') params.classification = classification;

      const [ledgerRes, summaryRes] = await Promise.all([
        axios.get(`/api/credit/${activeCustomer.id}/ledger`, { params }),
        axios.get(`/api/credit/${activeCustomer.id}/monthly-summary`)
      ]);
      setLedger(ledgerRes.data || []);
      setMonthlySummary(summaryRes.data || []);
    } catch (err) {
      console.error('Error reloading ledger:', err);
    }
  };

  const handleSelectLedgerMonth = (m) => {
    setSelectedLedgerMonth(m);
    setBillingMonth(m !== 'All' ? m : getCurrentMonthStr());
    reloadLedger(m, ledgerClassificationFilter);
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
    const now = new Date();
    
    // Always include current month and past 12 months
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      monthMap.set(key, label);
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

  // Filtered customer listing based on category tab
  const filteredCustomers = customers.filter(c => {
    if (categoryFilter === 'All') return true;
    if (categoryFilter === 'Employee') return c.category === 'Employee';
    if (categoryFilter === 'Regular Customer') return c.category !== 'Employee';
    return true;
  });

  const employeeCount = customers.filter(c => c.category === 'Employee').length;
  const regularCount = customers.filter(c => c.category !== 'Employee').length;

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
          {(isAdmin || isManagement) && (
            <select 
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--surface-2)', outline: 'none', fontSize: 13 }}
            >
              <option value="All">All Branches</option>
              {AVAILABLE_BRANCHES.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}

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
      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1.5px solid var(--surface-2)', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--surface-2)', background: 'var(--surface-50)' }}>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 200 }}>Customer / Category</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 120 }}>Status</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 150 }}>Phone / Ref</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 240, whiteSpace: 'nowrap' }}>Discount Package</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 175, whiteSpace: 'nowrap' }}>Balance (All & Current)</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 120 }}>Limit</th>
              {isAdmin && <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 160 }}>Branches</th>}
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', minWidth: 110 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdmin ? 8 : 7} style={{ padding: 32, textAlign: 'center' }}>Loading...</td></tr>
            ) : filteredCustomers.length === 0 ? (
              <tr><td colSpan={isAdmin ? 8 : 7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No credit customers found.</td></tr>
            ) : (
              filteredCustomers.map((c) => {
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
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{c.name}</span>
                        {c.category === 'Employee' ? (
                          <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                            Employee {c.is_extra_pay ? '• Extra Pay' : ''} {c.employee_id ? '🔗' : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                            Regular
                          </span>
                        )}
                      </div>
                    </td>

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

                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                      <div>{c.phone || '-'}</div>
                      {c.reference && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.reference}</div>}
                    </td>

                    <td style={{ padding: '14px 16px', minWidth: 240 }}>
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

                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', minWidth: 175 }}>
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

                      {/* Current Month Balance */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)' }}>Current Mo:</span>
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

                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                      {Number(c.credit_limit) > 0 ? `${CURRENCY} ${Number(c.credit_limit).toFixed(2)}` : 'No Limit'}
                    </td>

                    {isAdmin && (
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {c.available_branches ? c.available_branches.join(', ') : '-'}
                      </td>
                    )}

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <button onClick={(e) => { e.stopPropagation(); openLedger(c); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 6 }} title="Ledger & Monthly Breakdown">
                          <FileText size={18} />
                        </button>
                        {isManagement ? (
                          <>
                            <button disabled style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'not-allowed', opacity: 0.4, padding: 6 }}>
                              <Edit size={18} />
                            </button>
                            <button disabled style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'not-allowed', opacity: 0.4, padding: 6 }}>
                              <Trash2 size={18} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); openEditModal(c); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }} title="Edit Customer">
                              <Edit size={18} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDelete(c); }} 
                              style={{ 
                                background: 'none', 
                                border: 'none', 
                                color: Math.abs(Number(c.balance)) > 0.001 ? '#9ca3af' : 'var(--red)', 
                                cursor: 'pointer', 
                                padding: 6 
                              }} 
                              title={Math.abs(Number(c.balance)) > 0.001 ? "Balance must be 0 to delete" : "Delete Customer"}
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
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
                <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>
                  Total ({filteredCustomers.length} Accounts)
                </td>
                <td style={{ padding: '14px 16px' }}></td>
                <td style={{ padding: '14px 16px' }}></td>
                <td style={{ padding: '14px 16px', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>
                  Overall Balance:
                </td>
                <td style={{ 
                  padding: '14px 16px', 
                  fontSize: 14.5, 
                  fontWeight: 800, 
                  whiteSpace: 'nowrap',
                  color: totalCustomerBalance > 0 ? 'var(--red)' : (totalCustomerBalance < 0 ? 'var(--green)' : 'var(--text)') 
                }}>
                  {CURRENCY} {Math.abs(totalCustomerBalance).toFixed(2)} {totalCustomerBalance > 0 ? '(DR / Dues)' : (totalCustomerBalance < 0 ? '(CR / Advance)' : '(Settled)')}
                </td>
                <td colSpan={isAdmin ? 3 : 2} style={{ padding: '14px 16px' }}></td>
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
                  <div style={{ display: 'flex', gap: 16 }}>
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
                  </div>

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
                            placeholder="Type to filter employees by name, role or code..."
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
                                  (emp.role || '').toLowerCase().includes(s) ||
                                  (emp.employee_id || '').toLowerCase().includes(s) ||
                                  (emp.branch || '').toLowerCase().includes(s)
                                );
                              })
                              .map(emp => (
                                <option key={emp.id} value={emp.id}>
                                  {emp.name} {emp.role ? `(${emp.role})` : ''} {emp.employee_id ? `• Code: ${emp.employee_id}` : ''} {emp.branch ? `• ${emp.branch}` : ''}
                                </option>
                              ))}
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
                  {availableMonths.map(m => (
                    <option key={m.key} value={m.key}>
                      {m.label} {m.key === getCurrentMonthStr() ? '• Current Month' : ''}
                    </option>
                  ))}
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
                <div style={{ display: 'grid', gridTemplateColumns: '120px 145px 1fr auto', gap: 8, alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: entryType === 'PAYMENT' ? 'var(--green)' : (entryType === 'EXTRA_PAY' ? '#16a34a' : 'var(--red)'), fontSize: 13 }}>
                      {entryType === 'PAYMENT' ? '-' : '+'}
                    </span>
                    <input 
                      type="number" step="0.01" required placeholder="Amount"
                      value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} 
                      style={{ width: '100%', padding: '5px 6px 5px 20px', borderRadius: 6, border: '1.5px solid var(--surface-3)', background: 'var(--bg)', outline: 'none', fontSize: 12.5, boxSizing: 'border-box' }} 
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
                    style={{ 
                      background: entryType === 'PAYMENT' ? 'var(--green)' : (entryType === 'EXTRA_PAY' ? '#16a34a' : 'var(--red)'), 
                      color: '#fff', 
                      border: 'none', 
                      padding: '6px 14px', 
                      borderRadius: 6, 
                      fontWeight: 700, 
                      cursor: 'pointer', 
                      fontSize: 12, 
                      whiteSpace: 'nowrap' 
                    }}
                  >
                    {entryType === 'PAYMENT' ? 'Receive Payment' : (entryType === 'EXTRA_PAY' ? '+ Add Extra Pay' : '+ Add Debit')}
                  </button>
                </div>
              </form>
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
                  </tr>
                </thead>
                <tbody>
                  {processedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
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
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {processedTransactions.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--surface-50)', borderTop: '2px solid var(--surface-2)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {selectedLedgerMonth !== 'All' ? `${formatMonthDisplay(selectedLedgerMonth)} Net Balance:` : 'All Balance (Account Net Total):'}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', color: visibleSubtotal > 0 ? 'var(--red)' : (visibleSubtotal < 0 ? 'var(--green)' : 'var(--text)') }}>
                        {visibleSubtotal > 0 ? '+' : (visibleSubtotal < 0 ? '-' : '')} {CURRENCY} {Math.abs(visibleSubtotal).toFixed(2)}
                      </td>
                    </tr>
                    {selectedLedgerMonth !== 'All' && (
                      <tr style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--surface-3)', fontWeight: 800 }}>
                        <td colSpan={4} style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', color: 'var(--text)' }}>
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
    </div>
  );
}
