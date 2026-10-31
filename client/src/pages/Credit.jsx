import React, { useState, useEffect } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import { 
  Plus, Edit, Trash2, FileText, X, Percent, Tag, Calendar, 
  MessageSquare, Check, AlertTriangle, Filter, ArrowDownRight, 
  ArrowUpRight, UserCheck, UserX, ChevronDown, Layers, ShieldCheck 
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

const MultiSelectDropdown = ({ options, selectedIds, onChange, placeholder, style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const toggleId = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div style={{ position: 'relative', flex: 1, ...style }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: '8px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span>{selectedIds.length > 0 ? `${selectedIds.length} Selected` : placeholder}</span>
        <span>▼</span>
      </div>
      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setIsOpen(false)} />
          <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: 6, marginBottom: 4, maxHeight: 220, overflowY: 'auto', zIndex: 10, boxShadow: '0 -4px 6px rgba(0,0,0,0.1)' }}>
            {options.map(opt => (
              <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--surface-2)', position: 'relative', zIndex: 11 }}>
                <input 
                  type="checkbox" 
                  checked={selectedIds.includes(opt.id.toString())}
                  onChange={() => toggleId(opt.id.toString())}
                />
                <span style={{ fontSize: 13 }}>{opt.name}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default function Credit() {
  const { user } = useAuth();
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
  const [selectedLedgerMonth, setSelectedLedgerMonth] = useState('All');
  const [ledgerClassificationFilter, setLedgerClassificationFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Discount Packages
  const [discountPackages, setDiscountPackages] = useState([]);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [pkgName, setPkgName] = useState('');
  const [pkgDiscountPercent, setPkgDiscountPercent] = useState('');
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

  // Category Filter & Branch Filter state
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');

  // Ledger Payment / Charge states
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentAction, setPaymentAction] = useState('PAYMENT');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [billingMonth, setBillingMonth] = useState(getCurrentMonthStr());
  const [paymentComment, setPaymentComment] = useState('');
  const [paymentClassification, setPaymentClassification] = useState('Regular');

  const [discountRules, setDiscountRules] = useState([]);
  const [ruleTargetType, setRuleTargetType] = useState('all');
  const [ruleTargetIds, setRuleTargetIds] = useState([]);
  const [ruleDiscountType, setRuleDiscountType] = useState('percentage');
  const [ruleDiscountValue, setRuleDiscountValue] = useState('');
  const [showLedgerDiscounts, setShowLedgerDiscounts] = useState(false);

  // Items/Cats for dropdowns
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (isAdmin) {
      axios.get('/api/categories').then(r => setCategories(r.data)).catch(console.error);
      axios.get('/api/items').then(r => setItems(r.data)).catch(console.error);
      fetchDiscountPackages();
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchCustomers();
  }, [branchFilter]);

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
      const url = (isAdmin || isManagement) && branchFilter !== 'All' 
        ? `/api/credit?branch=${encodeURIComponent(branchFilter)}` 
        : '/api/credit';
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
    setPkgDiscountPercent('');
    setPkgIsActive(true);
    setShowPackageModal(true);
    fetchDiscountPackages();
  };

  const handleEditPackage = (pkg) => {
    setEditingPackageId(pkg.id);
    setPkgName(pkg.name);
    setPkgDiscountPercent(pkg.discount_percentage);
    setPkgIsActive(pkg.is_active);
  };

  const handleSavePackage = async (e) => {
    e.preventDefault();
    if (!pkgName.trim()) return toast.error('Package name is required');
    const pct = parseFloat(pkgDiscountPercent);
    if (isNaN(pct) || pct < 0 || pct > 100) return toast.error('Enter valid percentage between 0 and 100');

    setSavingPackage(true);
    try {
      if (editingPackageId) {
        await axios.put(`/api/credit/discount-packages/${editingPackageId}`, {
          name: pkgName.trim(),
          discount_percentage: pct,
          is_active: pkgIsActive
        });
        toast.success('Discount package updated');
      } else {
        await axios.post('/api/credit/discount-packages', {
          name: pkgName.trim(),
          discount_percentage: pct,
          is_active: pkgIsActive
        });
        toast.success('Discount package created');
      }
      setEditingPackageId(null);
      setPkgName('');
      setPkgDiscountPercent('');
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

    const payload = {
      name,
      phone,
      credit_limit: creditLimit,
      reference,
      notes,
      available_branches: isAdmin ? selectedBranches : [user?.branch?.split(',')[0]?.trim() || ''],
      discount_rules: discountRules,
      category,
      is_extra_pay: category === 'Employee' ? isExtraPay : false,
      status,
      discount_package_id: discountPackageId ? parseInt(discountPackageId) : null
    };

    setSaving(true);
    try {
      if (editingCustomer) {
        await axios.put(`/api/credit/${editingCustomer.id}`, payload);
        toast.success('Customer updated');
      } else {
        await axios.post('/api/credit', payload);
        toast.success('Customer added');
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
    // REQUIREMENT 4: Prevent deletion if balance is not 0
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

  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setReference('');
    setNotes('');
    setCreditLimit(0);
    setSelectedBranches(AVAILABLE_BRANCHES);
    setDiscountRules([]);
    setCategory('Regular Customer');
    setIsExtraPay(false);
    setStatus('Active');
    setDiscountPackageId('');
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
    setDiscountRules(customer.discount_rules || []);
    setCategory(customer.category || 'Regular Customer');
    setIsExtraPay(Boolean(customer.is_extra_pay));
    setStatus(customer.status || 'Active');
    setDiscountPackageId(customer.discount_package_id ? customer.discount_package_id.toString() : '');
    setShowModal(true);
  };

  // ── Month-Wise Balance Breakdown & Ledger ────────────────────────────
  const openLedger = async (customer) => {
    setActiveCustomer(customer);
    setPaymentAmount('');
    setPaymentAction('PAYMENT');
    setPaymentMethod('Cash');
    setBillingMonth(getCurrentMonthStr());
    setPaymentComment('');
    setPaymentClassification(customer.is_extra_pay ? 'Extra Pay' : 'Regular');
    setDiscountRules(customer.discount_rules || []);
    setShowLedgerDiscounts(false);
    setSelectedLedgerMonth('All');
    setLedgerClassificationFilter('All');

    try {
      const [ledgerRes, summaryRes] = await Promise.all([
        axios.get(`/api/credit/${customer.id}/ledger`),
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

  const handleAddPayment = async (e) => {
    e.preventDefault();
    let amountStr = paymentAmount;
    const finalAmount = Math.abs(Number(amountStr));
    
    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      return toast.error('Enter a valid positive amount');
    }

    if (!billingMonth) {
      return toast.error('Please select the Billing Month for this payment');
    }
    
    try {
      await axios.post(`/api/credit/${activeCustomer.id}/payment`, { 
        amount: finalAmount,
        action: paymentAction,
        cashier_name: user?.username || 'Unknown',
        payment_method: paymentAction === 'PAYMENT' ? paymentMethod : null,
        branch: user?.branch || (branchFilter !== 'All' ? branchFilter : 'Branch 1'),
        billing_month: billingMonth,
        comments: paymentComment.trim() || null,
        classification: activeCustomer.category === 'Employee' ? paymentClassification : 'Regular'
      });

      toast.success(paymentAction === 'PAYMENT' ? `Payment allocated to ${billingMonth}` : `Credit added to ${billingMonth}`);
      setPaymentAmount('');
      setPaymentComment('');

      const balanceChange = paymentAction === 'CHARGE' ? finalAmount : -finalAmount;
      setActiveCustomer(prev => ({ ...prev, balance: Number(prev.balance) + balanceChange }));
      
      reloadLedger(selectedLedgerMonth, ledgerClassificationFilter);
      fetchCustomers(); 
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add payment');
    }
  };

  const toggleBranch = (br) => {
    if (selectedBranches.includes(br)) {
      setSelectedBranches(selectedBranches.filter(b => b !== br));
    } else {
      setSelectedBranches([...selectedBranches, br]);
    }
  };

  const handleAddDiscountRule = () => {
    if (ruleTargetType !== 'all' && (!ruleTargetIds || ruleTargetIds.length === 0)) return toast.error('Please specify target');
    if (!ruleDiscountValue || Number(ruleDiscountValue) <= 0) return toast.error('Enter valid discount value');

    let newRules = [];
    if (ruleTargetType === 'all') {
      newRules.push({
        targetType: 'all',
        targetId: 'all',
        targetName: 'All',
        discountType: ruleDiscountType,
        discountValue: Number(ruleDiscountValue)
      });
    } else {
      ruleTargetIds.forEach(id => {
        let targetName = 'Unknown';
        if (ruleTargetType === 'category') {
          const cat = categories.find(c => c.id.toString() === id);
          if (cat) targetName = cat.name;
        } else if (ruleTargetType === 'item') {
          const it = items.find(i => i.id.toString() === id);
          if (it) targetName = it.name;
        }
        newRules.push({
          targetType: ruleTargetType,
          targetId: id,
          targetName,
          discountType: ruleDiscountType,
          discountValue: Number(ruleDiscountValue)
        });
      });
    }
    
    setDiscountRules([...discountRules, ...newRules]);
    setRuleTargetIds([]);
    setRuleDiscountValue('');
  };

  const handleSaveLedgerDiscounts = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/credit/${activeCustomer.id}`, {
        ...activeCustomer,
        discount_rules: discountRules
      });
      toast.success('Discount Rules updated');
      setActiveCustomer({ ...activeCustomer, discount_rules: discountRules });
      fetchCustomers();
    } catch (err) {
      toast.error('Failed to save discount rules');
    } finally {
      setSaving(false);
    }
  };

  // Filtered customer listing based on category tab
  const filteredCustomers = customers.filter(c => {
    if (categoryFilter === 'All') return true;
    if (categoryFilter === 'Employee') return c.category === 'Employee';
    if (categoryFilter === 'Regular Customer') return c.category !== 'Employee';
    return true;
  });

  const employeeCount = customers.filter(c => c.category === 'Employee').length;
  const regularCount = customers.filter(c => c.category !== 'Employee').length;

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      {/* Top Header & Navigation Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Credit Customers (Khata)</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Manage customer credit accounts, monthly ledgers, and discount packages
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

      {/* Category Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--surface-2)', paddingBottom: 12 }}>
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

      {/* Customer List Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1.5px solid var(--surface-2)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--surface-2)', background: 'var(--surface-50)' }}>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Customer / Category</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Phone / Ref</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Discount Package</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Balance</th>
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Limit</th>
              {isAdmin && <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Branches</th>}
              <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
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
                const pkgPercent = parseFloat(c.discount_package_percentage || c.discount_percentage || 0);

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
                            Employee {c.is_extra_pay ? '• Extra Pay' : ''}
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

                    <td style={{ padding: '14px 16px' }}>
                      {pkgPercent > 0 ? (
                        <span style={{ fontSize: 12, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                          {pkgPercent}% ({c.discount_package_name || 'Assigned'})
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None</span>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px', fontWeight: 700, fontSize: 14, color: limitExceeded ? 'var(--red)' : (c.balance > 0 ? 'var(--red)' : (c.balance < 0 ? 'var(--green)' : 'var(--text)')) }}>
                      {CURRENCY} {Math.abs(c.balance).toFixed(2)} {c.balance > 0 ? '(Due)' : (c.balance < 0 ? '(Adv)' : '')}
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
        </table>
      </div>

      {/* Customer Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 16, position: 'relative', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
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
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--surface-3)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
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

                {/* Assigned Discount Package */}
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 700 }}>
                    Assigned Discount Package (Auto-applied in POS)
                  </label>
                  <select 
                    value={discountPackageId} 
                    onChange={e => setDiscountPackageId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                  >
                    <option value="">-- No Discount Package --</option>
                    {discountPackages.map(pkg => (
                      <option key={pkg.id} value={pkg.id} disabled={!pkg.is_active}>
                        {pkg.name} ({pkg.discount_percentage}%) {!pkg.is_active ? '[Deactivated]' : ''}
                      </option>
                    ))}
                  </select>
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

      {/* Admin Discount Package Management Modal */}
      {showPackageModal && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 650, maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 16, position: 'relative', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-2)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag size={20} /> Manage Reusable Discount Packages
              </h3>
              <button type="button" onClick={() => setShowPackageModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={20}/></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Form to create/edit package */}
              <form onSubmit={handleSavePackage} style={{ background: 'var(--surface-2)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                  {editingPackageId ? 'Edit Discount Package' : 'Create New Discount Package'}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Package Name *</label>
                    <input 
                      required 
                      value={pkgName} 
                      onChange={e => setPkgName(e.target.value)} 
                      placeholder="e.g. Employee Discount, VIP" 
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--surface-3)', fontSize: 13, boxSizing: 'border-box' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Discount % *</label>
                    <input 
                      required 
                      type="number" 
                      step="0.5" 
                      min="0" 
                      max="100" 
                      value={pkgDiscountPercent} 
                      onChange={e => setPkgDiscountPercent(e.target.value)} 
                      placeholder="e.g. 20" 
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--surface-3)', fontSize: 13, boxSizing: 'border-box' }} 
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={pkgIsActive} 
                        onChange={e => setPkgIsActive(e.target.checked)} 
                      />
                      Active
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  {editingPackageId && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setEditingPackageId(null);
                        setPkgName('');
                        setPkgDiscountPercent('');
                        setPkgIsActive(true);
                      }}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button 
                    type="submit" 
                    disabled={savingPackage}
                    style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                  >
                    {savingPackage ? 'Saving...' : (editingPackageId ? 'Update Package' : 'Add Package')}
                  </button>
                </div>
              </form>

              {/* Existing packages table */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Existing Packages</h4>
                <div style={{ border: '1px solid var(--surface-2)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--surface-3)' }}>
                        <th style={{ padding: '8px 12px' }}>Name</th>
                        <th style={{ padding: '8px 12px' }}>Discount</th>
                        <th style={{ padding: '8px 12px' }}>Status</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discountPackages.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No packages defined.</td></tr>
                      ) : (
                        discountPackages.map(pkg => (
                          <tr key={pkg.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{pkg.name}</td>
                            <td style={{ padding: '8px 12px', color: '#059669', fontWeight: 700 }}>{pkg.discount_percentage}%</td>
                            <td style={{ padding: '8px 12px' }}>
                              {pkg.is_active ? (
                                <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>Active</span>
                              ) : (
                                <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>Deactivated</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <button onClick={() => handleEditPackage(pkg)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Edit">
                                <Edit size={15} />
                              </button>
                              <button onClick={() => handleDeletePackage(pkg.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4, marginLeft: 4 }} title="Delete">
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Breakdown & Detailed Ledger Modal */}
      {showLedger && activeCustomer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 880, height: '90vh', borderRadius: 16, padding: 24, position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
            
            {/* Modal Header */}
            <button onClick={() => setShowLedger(false)} style={{ position: 'absolute', right: 16, top: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20}/></button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingRight: 32 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{activeCustomer.name}'s Khata Ledger</span>
                  {activeCustomer.category === 'Employee' && (
                    <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                      Employee {activeCustomer.is_extra_pay ? '(Extra Pay)' : ''}
                    </span>
                  )}
                  {(activeCustomer.status === 'Deactivated' || activeCustomer.is_active === false) && (
                    <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                      Deactivated
                    </span>
                  )}
                </h3>
              </div>

              {isAdmin && (
                <button 
                  onClick={() => setShowLedgerDiscounts(!showLedgerDiscounts)} 
                  style={{ background: showLedgerDiscounts ? 'var(--primary)' : 'var(--surface-2)', color: showLedgerDiscounts ? '#fff' : 'var(--text)', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  Manage Custom Discounts
                </button>
              )}
            </div>

            {/* Total Outstanding Balance Highlight */}
            <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Overall Current Balance: </span>
                <span style={{ fontSize: 17, fontWeight: 800, color: activeCustomer.balance > 0 ? 'var(--red)' : (activeCustomer.balance < 0 ? 'var(--green)' : 'var(--text)') }}>
                  {CURRENCY} {Math.abs(activeCustomer.balance).toFixed(2)} {activeCustomer.balance > 0 ? '(Due / Debit)' : (activeCustomer.balance < 0 ? '(Advance / Credit)' : '(Settled)')}
                </span>
              </div>
              {activeCustomer.discount_package_percentage > 0 && (
                <div style={{ fontSize: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#059669', padding: '4px 8px', borderRadius: 6, fontWeight: 700 }}>
                  Assigned Package: {activeCustomer.discount_package_name} ({activeCustomer.discount_package_percentage}%)
                </div>
              )}
            </div>

            {/* REQUIREMENT 1: Month-Wise Balance Breakdown Card */}
            <div style={{ marginBottom: 16, background: 'var(--surface-50)', border: '1px solid var(--surface-2)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                  <Calendar size={15} /> Month-Wise Balance Breakdown
                </span>
                <button 
                  onClick={() => handleSelectLedgerMonth('All')}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    border: 'none',
                    background: selectedLedgerMonth === 'All' ? 'var(--primary)' : 'transparent',
                    color: selectedLedgerMonth === 'All' ? '#fff' : 'var(--primary)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  Show All Months
                </button>
              </div>

              {monthlySummary.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No monthly transactions recorded yet.</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {monthlySummary.map((ms) => {
                    const isSelected = selectedLedgerMonth === ms.billing_month;
                    const net = parseFloat(ms.net_balance || 0);
                    return (
                      <div 
                        key={ms.billing_month}
                        onClick={() => handleSelectLedgerMonth(ms.billing_month)}
                        style={{
                          flex: '0 0 auto',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--surface-3)',
                          background: isSelected ? 'rgba(255,184,0,0.1)' : 'var(--surface)',
                          cursor: 'pointer',
                          minWidth: 125,
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: isSelected ? 'var(--primary)' : 'var(--text)' }}>
                          {ms.billing_month}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                          Debits: <span style={{ color: 'var(--red)' }}>+{CURRENCY}{parseFloat(ms.debit).toFixed(0)}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
                          Credits: <span style={{ color: 'var(--green)' }}>-{CURRENCY}{parseFloat(ms.credit).toFixed(0)}</span>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: net > 0 ? 'var(--red)' : (net < 0 ? 'var(--green)' : 'var(--text-muted)') }}>
                          Net: {CURRENCY} {Math.abs(net).toFixed(2)} {net > 0 ? 'DR' : (net < 0 ? 'CR' : '0')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* REQUIREMENT 8: Employee Extra Pay Filter */}
            {activeCustomer.category === 'Employee' && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Employee Filter:</span>
                {['All', 'Extra Pay', 'Regular'].map(f => (
                  <button
                    key={f}
                    onClick={() => handleSelectClassificationFilter(f)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      border: 'none',
                      background: ledgerClassificationFilter === f ? '#1d4ed8' : 'var(--surface-2)',
                      color: ledgerClassificationFilter === f ? '#fff' : 'var(--text)',
                      cursor: 'pointer'
                    }}
                  >
                    {f === 'All' ? 'All Employee Credits' : (f === 'Extra Pay' ? 'Extra Pay Only' : 'Regular Credits')}
                  </button>
                ))}
              </div>
            )}

            {/* Add Payment / Charge Form (REQUIREMENTS 2 & 6: Billing Month + Comments) */}
            {!isManagement && (
              <form onSubmit={handleAddPayment} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, padding: 14, background: 'var(--surface-2)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                      <input type="radio" name="actionType" value="PAYMENT" checked={paymentAction === 'PAYMENT'} onChange={() => setPaymentAction('PAYMENT')} />
                      Receive Major Payment
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                      <input type="radio" name="actionType" value="CHARGE" checked={paymentAction === 'CHARGE'} onChange={() => setPaymentAction('CHARGE')} />
                      Add Manual Dues / Charge
                    </label>
                  </div>

                  {paymentAction === 'PAYMENT' && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--bg)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--surface-3)' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Method:</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" name="paymentMethod" value="Cash" checked={paymentMethod === 'Cash'} onChange={() => setPaymentMethod('Cash')} />
                        Cash
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" name="paymentMethod" value="Card" checked={paymentMethod === 'Card'} onChange={() => setPaymentMethod('Card')} />
                        Card
                      </label>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 2fr auto', gap: 8, alignItems: 'center' }}>
                  {/* Amount */}
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: paymentAction === 'PAYMENT' ? 'var(--green)' : 'var(--red)' }}>
                      {paymentAction === 'PAYMENT' ? '-' : '+'}
                    </span>
                    <input 
                      type="number" step="0.01" required placeholder="Amount"
                      value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} 
                      style={{ width: '100%', padding: '8px 10px 8px 24px', borderRadius: 6, border: '1.5px solid var(--surface-3)', background: 'var(--bg)', outline: 'none', fontSize: 13, boxSizing: 'border-box' }} 
                    />
                  </div>

                  {/* Billing Month (Required) */}
                  <div>
                    <input 
                      type="month" 
                      required 
                      value={billingMonth} 
                      onChange={e => setBillingMonth(e.target.value)} 
                      title="Billing Month to allocate payment against"
                      style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1.5px solid var(--surface-3)', background: 'var(--bg)', outline: 'none', fontSize: 13, boxSizing: 'border-box' }} 
                    />
                  </div>

                  {/* Optional Comment / Remarks */}
                  <div>
                    <input 
                      type="text" 
                      placeholder="Comment / Remarks (Optional)..." 
                      value={paymentComment} 
                      onChange={e => setPaymentComment(e.target.value)} 
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--surface-3)', background: 'var(--bg)', outline: 'none', fontSize: 13, boxSizing: 'border-box' }} 
                    />
                  </div>

                  {/* Submit button */}
                  <button type="submit" style={{ background: paymentAction === 'PAYMENT' ? 'var(--green)' : 'var(--red)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {paymentAction === 'PAYMENT' ? 'Receive Payment' : 'Post Charge'}
                  </button>
                </div>
              </form>
            )}

            {/* Transactions List */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1.5px solid var(--surface-2)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '2px solid var(--surface-2)' }}>
                    <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>Date & Month</th>
                    <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>Description & Remarks</th>
                    <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>Classification</th>
                    <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const processedLedger = [];
                    const cancelledOrderIds = new Set();
                    
                    ledger.forEach(t => {
                      if (t.type === 'ORDER_CANCELLED') cancelledOrderIds.add(t.order_id);
                    });

                    ledger.forEach(t => {
                      if (t.type === 'ORDER_CANCELLED' || t.type === 'PAYMENT_CANCELLED') {
                        return;
                      }
                      
                      let isCancelled = false;
                      if (t.type === 'CREDIT_ORDER' && cancelledOrderIds.has(t.order_id)) {
                        isCancelled = true;
                      }
                      processedLedger.push({ ...t, isCancelled });
                    });

                    if (processedLedger.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                            No transactions found for this period.
                          </td>
                        </tr>
                      );
                    }

                    return processedLedger.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--surface-2)', opacity: t.isCancelled ? 0.6 : 1 }}>
                        <td style={{ padding: '10px 14px', fontSize: 12, textDecoration: t.isCancelled ? 'line-through' : 'none' }}>
                          <div style={{ fontWeight: 600 }}>{new Date(t.created_at).toLocaleDateString()}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          {t.billing_month && (
                            <span style={{ fontSize: 10, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4, fontWeight: 700, color: 'var(--primary)' }}>
                              {t.billing_month}
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '10px 14px', fontSize: 12.5 }}>
                          {t.type === 'CREDIT_ORDER' ? (
                            <div>
                              <span onClick={() => handleViewOrder(t.order_id)} style={{ color: 'var(--red)', fontWeight: 600, cursor: 'pointer', textDecoration: t.isCancelled ? 'line-through' : 'underline' }}>
                                Order #{t.order_id}
                              </span>
                              {t.isCancelled && <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 11, fontWeight: 'bold' }}>(Cancelled)</span>}
                            </div>
                          ) : t.type === 'CHARGE' ? (
                            <span style={{ color: 'var(--red)', fontWeight: 600 }}>Manual Charge {t.cashier_name ? `(by ${t.cashier_name})` : ''}</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ color: 'var(--green)', fontWeight: 600 }}>Payment Received {t.cashier_name ? `(by ${t.cashier_name})` : ''}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>via {t.payment_method || 'Cash'}</span>
                            </div>
                          )}

                          {t.comments && (
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <MessageSquare size={11} /> {t.comments}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '10px 14px', fontSize: 12 }}>
                          {t.classification === 'Extra Pay' ? (
                            <span style={{ fontSize: 10.5, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                              Extra Pay
                            </span>
                          ) : (
                            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                              Regular
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: (t.type === 'CREDIT_ORDER' || t.type === 'CHARGE') ? 'var(--red)' : 'var(--green)', textDecoration: t.isCancelled ? 'line-through' : 'none' }}>
                          {(t.type === 'CREDIT_ORDER' || t.type === 'CHARGE') ? '+' : '-'} {CURRENCY} {Number(t.amount).toFixed(2)}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {selectedOrder && (
        <div style={{ zIndex: 1200, position: 'relative' }}>
          <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
        </div>
      )}
    </div>
  );
}
