import React, { useEffect, useState } from 'react'
import axios from '../api'
import { 
  Calculator, Settings, User, Clock, CalendarDays, Plus, Banknote, Users, 
  TrendingUp, Search, RefreshCw, X, AlertTriangle, FileText, Percent, 
  CheckCircle, HelpCircle, Edit2, Printer, Save, Trash2, MoreVertical, Lock,
  Table, Unlock, RotateCcw, ArrowRightCircle
} from 'lucide-react'
import { CURRENCY } from '../config'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import ManageSalaryModal from '../components/ManageSalaryModal'

const confirmAction = (message, onConfirm, confirmText = 'Confirm') => {
  toast((t) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px', minWidth: 260 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ 
          color: 'var(--primary)', 
          background: 'rgba(var(--primary-rgb, 227, 24, 55), 0.12)', 
          padding: 6, 
          borderRadius: 8, 
          display: 'flex',
          flexShrink: 0 
        }}>
          <AlertTriangle size={18} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.4 }}>
          {message}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button 
          onClick={() => toast.dismiss(t.id)}
          style={{
            padding: '6px 14px',
            background: 'var(--surface-2)',
            border: '1px solid var(--surface-3)',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            color: 'var(--text-muted)'
          }}
        >
          Cancel
        </button>
        <button 
          onClick={() => {
            toast.dismiss(t.id);
            onConfirm();
          }}
          style={{
            padding: '6px 14px',
            background: 'var(--primary)',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            color: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          {confirmText}
        </button>
      </div>
    </div>
  ), {
    duration: 15000,
    position: 'top-center',
    style: {
      background: 'var(--surface)',
      border: '1.5px solid var(--surface-2)',
      borderRadius: 12,
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
      padding: '14px 18px',
      maxWidth: 440
    }
  });
};

export default function Payroll() {
  const { user } = useAuth()
  const isDeveloper = user?.role?.trim().toLowerCase() === 'developer'
  const isAdmin = user?.role?.trim().toLowerCase() === 'admin' || isDeveloper
  const showActions = isAdmin

  const formatMonth = (date) => {
    const d = new Date(date)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const formatDuration = (totalMinutes) => {
    const mins = Math.max(0, Math.round(parseFloat(totalMinutes) || 0))
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${m}m`
  }

  const getLastMonth = () => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // State Variables
  const [employeesList, setEmployeesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    try {
      return sessionStorage.getItem('payroll_selected_month') || getLastMonth()
    } catch {
      return getLastMonth()
    }
  })
  const [viewMode, setViewMode] = useState('sheet') // 'sheet' | 'detail' (always defaults to sheet on full page reload)
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL') // 'ALL' | 'R1' | 'R2' | 'R3'
  const [selectedDetailEmpId, setSelectedDetailEmpId] = useState(() => {
    try {
      const saved = sessionStorage.getItem('payroll_selected_emp_id');
      return saved ? Number(saved) : null;
    } catch {
      return null;
    }
  })
  const [showEmpModal, setShowEmpModal] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  const [mobileSheetViewMode, setMobileSheetViewMode] = useState('cards') // 'cards' | 'table'
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (selectedMonth) {
      try {
        sessionStorage.setItem('payroll_selected_month', selectedMonth)
      } catch (e) {}
    }
  }, [selectedMonth])

  useEffect(() => {
    if (selectedDetailEmpId) {
      try {
        sessionStorage.setItem('payroll_selected_emp_id', String(selectedDetailEmpId))
      } catch (e) {}
    }
  }, [selectedDetailEmpId])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Manage Salary Modal State
  const [showSalaryModal, setShowSalaryModal] = useState(false)
  const [modalBaseSalary, setModalBaseSalary] = useState('')
  const [savingModalSalary, setSavingModalSalary] = useState(false)

  // Editable Payroll Data State
  const [editableData, setEditableData] = useState({})
  const [savingAll, setSavingAll] = useState(false)
  const [savingRowId, setSavingRowId] = useState(null)
  const [payingRowId, setPayingRowId] = useState(null)
  const [payInputs, setPayInputs] = useState({})

  // Leave Modal State
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leaveEmployeeId, setLeaveEmployeeId] = useState('')
  const [leaveDate, setLeaveDate] = useState('')
  const [leaveIsPaid, setLeaveIsPaid] = useState(false)
  const [savingLeave, setSavingLeave] = useState(false)
  
  const [baseColumns, setBaseColumns] = useState(() => {
    try {
      const stored = localStorage.getItem('payroll_base_columns');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.overtime_pay) delete parsed.overtime_pay;
        if (parsed.last_month_adjustment) delete parsed.last_month_adjustment;
        return parsed;
      }
    } catch (e) {}
    return {
      this_month_adv: { label: 'This M. Adv', hidden: false, action: 'Deduct', bg: '#e0f2fe' },
      bonus: { label: 'Bonus', hidden: false, action: 'Give', bg: '#dcfce7' },
      internet: { label: 'InterNet', hidden: false, action: 'Deduct', bg: '#ffedd5' },
      kafalat: { label: 'Kafalat', hidden: false, action: 'Deduct', bg: '#fee2e2' }
    };
  });

  useEffect(() => {
    localStorage.setItem('payroll_base_columns', JSON.stringify(baseColumns));
  }, [baseColumns]);

  const [adjustmentTypes, setAdjustmentTypes] = useState([])
  const [showAdjustmentsModal, setShowAdjustmentsModal] = useState(false)
  const [hiddenDynamicCols, setHiddenDynamicCols] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('payroll_hidden_dynamic_cols')) || {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    localStorage.setItem('payroll_hidden_dynamic_cols', JSON.stringify(hiddenDynamicCols))
  }, [hiddenDynamicCols])
  const [newAdjLabel, setNewAdjLabel] = useState('')
  const [newAdjType, setNewAdjType] = useState('One-Time')
  const [newAdjAction, setNewAdjAction] = useState('Add')
  const [savingAdjType, setSavingAdjType] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [editingDynamicAdjId, setEditingDynamicAdjId] = useState(null)
  const [editAdjValue, setEditAdjValue] = useState('')
  const [editingStandardKey, setEditingStandardKey] = useState(null)
  const [editStandardValue, setEditStandardValue] = useState('')

  // Row Unlock State for Locked / Paid records
  const [unlockedRowIds, setUnlockedRowIds] = useState(new Set())
  const [unlockPromptEmp, setUnlockPromptEmp] = useState(null)

  // Employee Detail Modal State
  const [selectedEmployeeForModal, setSelectedEmployeeForModal] = useState(null)
  const [empRecurringAdjs, setEmpRecurringAdjs] = useState([])
  const [empOneTimeAdjs, setEmpOneTimeAdjs] = useState([])
  const [loadingAdjs, setLoadingAdjs] = useState(false)
  const [loadedEmpId, setLoadedEmpId] = useState(null)

  // Confirm Delete Modal State
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, type: null })
  
  // Combined Adjustment Form State
  const [editingAdjId, setEditingAdjId] = useState(null)
  const [editingAdjType, setEditingAdjType] = useState(null) // 'One-Time' or 'Repeated Monthly'
  const [customAdjLabel, setCustomAdjLabel] = useState('Loan / Advance Deduction')
  const [customAdjOtherLabel, setCustomAdjOtherLabel] = useState('')
  const [customAdjType, setCustomAdjType] = useState('Repeated Monthly')
  const [customAdjAction, setCustomAdjAction] = useState('Deduct')
  const [customAdjAmount, setCustomAdjAmount] = useState('')
  const [customAdjTotalLimit, setCustomAdjTotalLimit] = useState('')
  const [customAdjNotes, setCustomAdjNotes] = useState('')
  const [savingCustomAdj, setSavingCustomAdj] = useState(false)
  const [activeInlineForm, setActiveInlineForm] = useState(null) // 'give' | 'deduct' | null
  const [savingCarryForwardId, setSavingCarryForwardId] = useState(null)
  const [carryForwardModal, setCarryForwardModal] = useState({ isOpen: false, emp: null, amount: null })
  const [overpaymentModal, setOverpaymentModal] = useState({
    isOpen: false,
    empId: null,
    empName: '',
    salaryAmount: 0,
    paymentAmount: 0,
    overpaymentAmount: 0,
    cashVal: 0,
    bankVal: 0
  })
  const [carryInputValues, setCarryInputValues] = useState({})
  const [activeCarryEmpId, setActiveCarryEmpId] = useState(null)

  const loadAdjustmentTypes = async () => {
    try {
      const res = await axios.get('/api/payroll/adjustment-types')
      setAdjustmentTypes(res.data)
    } catch (err) {
      console.error('Error loading adjustment types', err)
    }
  }

  const handleSaveAdjustmentType = async (e) => {
    e.preventDefault()
    if (!newAdjLabel.trim()) return;
    setSavingAdjType(true)
    try {
      await axios.post('/api/payroll/adjustment-types', {
        label: newAdjLabel.trim(),
        type: newAdjType,
        action: newAdjAction
      })
      toast.success('Adjustment Type Added!')
      setNewAdjLabel('')
      await loadAdjustmentTypes()
      await loadPayroll(true)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add type')
    } finally {
      setSavingAdjType(false)
    }
  }

  const handleDeleteAdjustmentType = async (id) => {
    setConfirmDelete({ isOpen: true, id: id, type: 'Adjustment Column' })
  }

  const handleEditAdjustmentType = async (id) => {
    if (!editAdjValue.trim()) {
      toast.error('Label cannot be empty');
      return;
    }
    confirmAction('Are you sure you want to rename this column?', async () => {
      try {
        await axios.put(`/api/payroll/adjustment-types/${id}`, { label: editAdjValue.trim() });
        toast.success('Updated successfully');
        setEditingDynamicAdjId(null);
        await loadAdjustmentTypes();
        await loadPayroll(true);
      } catch (err) {
        toast.error(err?.response?.data?.error || 'Failed to update');
      }
    }, 'Rename');
  }

  // Load calculations
  const loadPayroll = async (silent = false) => {
    if (!selectedMonth) return
    const isSilent = silent === true;
    if (!isSilent) setLoading(true)
    try {
      const res = await axios.get('/api/payroll/calculate', {
        params: { month: selectedMonth }
      })
      
      const newEditableData = {}
      res.data.forEach(item => {
        const hasSavedCash = item.cash_paid !== undefined && item.cash_paid !== null;
        const hasSavedPaid = item.paid_amount !== null && item.paid_amount !== undefined;
        const isPaid = item.status === 'Paid';

        // Do not default unpaid rows to net_salary. Only set to net_salary if record is already Paid.
        const cashVal = hasSavedCash 
          ? item.cash_paid 
          : (hasSavedPaid ? item.paid_amount : (isPaid ? item.net_salary : 0));
        const bankVal = item.bank_paid !== undefined && item.bank_paid !== null ? item.bank_paid : 0;
        const totalPaidVal = hasSavedPaid ? item.paid_amount : (hasSavedCash ? (cashVal + bankVal) : (isPaid ? item.net_salary : 0));

        newEditableData[item.id] = {
          ...item,
          payable_salary: item.payable_salary !== undefined ? item.payable_salary : (parseFloat(item.base_salary || 0) - parseFloat(item.deductions || 0)),
          last_month_balance: item.last_month_balance !== undefined ? item.last_month_balance : 0,
          this_month_adv: item.advance_deduction !== undefined ? item.advance_deduction : 0,
          calc_advance_deduction: item.calc_advance_deduction || 0,
          bonus: item.bonus !== undefined ? item.bonus : 0,
          calc_bonus: item.calc_bonus || 0,
          last_month_adjustment: item.last_month_adjustment !== undefined ? item.last_month_adjustment : 0,
          calc_last_month_adjustment: item.calc_last_month_adjustment || 0,
          internet: item.internet !== undefined ? item.internet : 0,
          calc_internet: item.calc_internet || 0,
          kafalat: item.kafalat !== undefined ? item.kafalat : 0,
          calc_kafalat: item.calc_kafalat || 0,
          cash_paid: cashVal,
          bank_paid: bankVal,
          paid_amount: totalPaidVal,
          overtime_pay: item.overtime_pay || 0,
          status: item.status || 'Pending',
          dynamic_adjustments: item.dynamic_adjustments || {}
        }
      })
      setEditableData(newEditableData)
      setSelectedEmployeeForModal(prev => prev ? (newEditableData[prev.id] || prev) : null)
    } catch (err) {
      toast.error('Error loading payroll calculations')
      console.error(err)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  const handleRefreshSheet = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadInitialData(),
        loadPayroll(false)
      ]);
      toast.success('Sheet data refreshed successfully');
    } catch (err) {
      console.error('Refresh sheet error:', err);
      toast.error('Failed to refresh sheet data');
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshDetail = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadInitialData(),
        loadPayroll(false)
      ]);
      const activeId = selectedDetailEmpId || selectedEmployeeForModal?.id;
      if (activeId) {
        await loadEmpAdjs(activeId, selectedMonth);
      }
      toast.success('Employee detail refreshed successfully');
    } catch (err) {
      console.error('Refresh detail error:', err);
      toast.error('Failed to refresh employee detail');
    } finally {
      setRefreshing(false);
    }
  };

  // Backwards-compatible alias
  const handleManualRefresh = handleRefreshSheet;

  // Load employees
  const loadInitialData = async () => {
    try {
      const empRes = await axios.get('/api/employees')
      setEmployeesList(empRes.data.filter(e => e.status === 'Active'))
      loadAdjustmentTypes()
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadInitialData()
    
    // Prevent number input scrolling
    const handleWheel = (e) => {
      if (e.target.type === 'number') {
        e.preventDefault();
        e.target.blur();
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [])

  useEffect(() => {
    loadPayroll()
    const activeEmpId = selectedDetailEmpId || selectedEmployeeForModal?.id;
    if (activeEmpId) {
      loadEmpAdjs(activeEmpId, selectedMonth);
    }
  }, [selectedMonth])

  useEffect(() => {
    if (selectedEmployeeForModal && editableData[selectedEmployeeForModal.id]) {
      setModalBaseSalary(String(editableData[selectedEmployeeForModal.id].base_salary || ''))
    }
  }, [selectedMonth, selectedEmployeeForModal?.id])

  // Calculate total additions and deductions (Total Expense / Adjustments)
  const calculateTotalAdjustments = (row) => {
    let dynamicTotal = 0;
    
    // Calculate dynamic adjustments total (supports Add, Deduct, and Both (±))
    adjustmentTypes.forEach(adj => {
      const val = parseFloat(row.dynamic_adjustments?.[adj.label] || 0);
      if (adj.action === 'Add' || adj.action === 'Both') {
        dynamicTotal += val;
      } else if (adj.action === 'Deduct') {
        dynamicTotal -= val;
      }
    });

    const lastMonthBal = parseFloat(row.last_month_balance || 0);
    const bonus = parseFloat(row.bonus || 0);
    const thisMonthAdv = parseFloat(row.this_month_adv !== undefined ? row.this_month_adv : (row.advance_deduction || 0));
    const internet = parseFloat(row.internet || 0);
    const kafalat = parseFloat(row.kafalat || 0);
    const otherAdj = parseFloat(row.other_adjustments || 0);
    const recurringAdj = parseFloat(row.recurring_adjustments || 0);
    const lastMonthAdj = parseFloat(row.last_month_adjustment || 0);

    const total = lastMonthBal + bonus + lastMonthAdj - thisMonthAdv - internet - kafalat + otherAdj + recurringAdj + dynamicTotal;
    return Math.round(total * 100) / 100;
  }

  // Helper to recalculate net salary
  const recalculateNetSalary = (row) => {
    const baseSal = parseFloat(row.base_salary || 0);
    const payable = parseFloat(row.payable_salary !== undefined ? row.payable_salary : (baseSal - parseFloat(row.deductions || 0)));
    const totalAdj = calculateTotalAdjustments(row);
    const dynamicNet = Math.round((payable + totalAdj) * 100) / 100;
    return dynamicNet;
  }

  // Clear previous month carryover balance & advance/loan balance to 0.00
  const handleClearPastBalance = (empId, empName) => {
    const isLocked = editableData[empId]?.status === 'Paid' && !unlockedRowIds.has(empId);
    if (isLocked) {
      toast.error('Record is marked as Paid and locked. Please unlock first.');
      return;
    }

    const name = empName || editableData[empId]?.name || 'this employee';
    const confirmMsg = `Clear previous carryover balance and Advance Balance (Loan) for ${name}? This will reset past balance and any outstanding loan to 0.00.`;
    
    confirmAction(confirmMsg, async () => {
      try {
        await axios.post('/api/payroll/clear-balance', {
          employee_id: empId,
          month: selectedMonth
        });

        setEditableData(prev => {
          const emp = prev[empId];
          if (!emp) return prev;
          const newEmp = {
            ...emp,
            last_month_balance: 0,
            advance_balance: 0,
            this_month_adv: 0,
            advance_deduction: 0,
            last_month_adjustment: 0
          };
          const dynamicNet = recalculateNetSalary(newEmp);
          newEmp.net_salary = dynamicNet;
          newEmp.cash_paid = dynamicNet;
          newEmp.bank_paid = 0;
          newEmp.paid_amount = dynamicNet;
          return {
            ...prev,
            [empId]: newEmp
          };
        });

        setSelectedEmployeeForModal(curr => (curr?.id === empId ? {
          ...curr,
          last_month_balance: 0,
          advance_balance: 0,
          this_month_adv: 0,
          advance_deduction: 0,
          last_month_adjustment: 0
        } : curr));

        toast.success(`Previous balance and Advance Balance (Loan) cleared to 0.00 for ${name}`);
        await loadPayroll(true);
      } catch (err) {
        console.error('Error clearing balance:', err);
        toast.error(err.response?.data?.error || 'Failed to clear past balance');
      }
    }, 'Clear Balance & Loan');
  };

  // Recalculate Net Salary dynamically when standard fields change
  const handleFieldChange = (empId, field, value) => {
    setEditableData(prev => {
      const row = { ...prev[empId] }
      row[field] = value;
      
      const dynamicNet = recalculateNetSalary(row);
      row.net_salary = dynamicNet;
      
      const prevCash = parseFloat(prev[empId].cash_paid || 0);
      const prevBank = parseFloat(prev[empId].bank_paid || 0);
      const prevNet = parseFloat(prev[empId].net_salary || 0);

      if (prevCash === prevNet && prevBank === 0) {
        row.cash_paid = dynamicNet;
        row.paid_amount = dynamicNet;
      } else {
        row.paid_amount = Math.round((parseFloat(row.cash_paid || 0) + parseFloat(row.bank_paid || 0)) * 100) / 100;
      }

      setSelectedEmployeeForModal(curr => (curr?.id === empId ? row : curr));
      return { ...prev, [empId]: row }
    })
  }
  
  // Recalculate when dynamic adjustments change
  const handleDynamicFieldChange = (empId, label, value) => {
    setEditableData(prev => {
      const row = { ...prev[empId] }
      row.dynamic_adjustments = {
        ...row.dynamic_adjustments,
        [label]: value
      }
      
      const dynamicNet = recalculateNetSalary(row);
      row.net_salary = dynamicNet;
      
      const prevCash = parseFloat(prev[empId].cash_paid || 0);
      const prevBank = parseFloat(prev[empId].bank_paid || 0);
      const prevNet = parseFloat(prev[empId].net_salary || 0);

      if (prevCash === prevNet && prevBank === 0) {
        row.cash_paid = dynamicNet;
        row.paid_amount = dynamicNet;
      } else {
        row.paid_amount = Math.round((parseFloat(row.cash_paid || 0) + parseFloat(row.bank_paid || 0)) * 100) / 100;
      }

      setSelectedEmployeeForModal(curr => (curr?.id === empId ? row : curr));
      return { ...prev, [empId]: row }
    })
  }

  const handlePaidChange = (empId, field, value) => {
    setEditableData(prev => {
      const row = { ...prev[empId] }
      row[field] = value;
      const cash = parseFloat(field === 'cash_paid' ? value : row.cash_paid) || 0;
      const bank = parseFloat(field === 'bank_paid' ? value : row.bank_paid) || 0;
      const totalPaid = Math.round((cash + bank) * 100) / 100;
      row.paid_amount = totalPaid;

      const net = parseFloat(row.net_salary || 0);
      const rem = Math.round((net - totalPaid) * 100) / 100;

      // Do NOT auto-set status = 'Paid' or auto-lock!
      // Status remains fully under user control, or is finalized via "Pay Now" button.
      if (totalPaid > 0 && rem > 0 && row.status !== 'Paid') {
        row.status = 'Partial';
      } else if (totalPaid === 0 && row.status === 'Partial') {
        row.status = 'Pending';
      }

      return { ...prev, [empId]: row }
    })
  }

  const handleQuickPayRemaining = (emp) => {
    if (!emp) return;
    const isLocked = emp.status === 'Paid' && !unlockedRowIds.has(emp.id);
    if (isLocked) {
      toast.error('Record is marked as Paid and locked. Please unlock first.');
      return;
    }

    const net = parseFloat(emp.net_salary || 0);
    const curBank = parseFloat(emp.bank_paid || 0);
    const newCash = Math.round((net - curBank) * 100) / 100;

    setEditableData(prev => ({
      ...prev,
      [emp.id]: {
        ...prev[emp.id],
        cash_paid: newCash,
        paid_amount: net
      }
    }));
    toast.success(`Remaining salary filled (${CURRENCY} ${newCash.toFixed(2)} in Cash). Click "Pay Now" to confirm payment.`);
  }

  const executePayment = async (empId, cashVal, bankVal) => {
    setPayingRowId(empId);
    try {
      const res = await axios.post('/api/payroll/payments', {
        employee_id: empId,
        month: selectedMonth,
        cash_amount: cashVal,
        bank_amount: bankVal
      });

      const { payments, cash_paid, bank_paid, paid_amount, status, message } = res.data;
      toast.success(message || 'Payment recorded successfully!');

      setPayInputs(prev => ({
        ...prev,
        [empId]: { cash: '', bank: '' }
      }));

      const row = editableData[empId];
      const updatedRow = {
        ...row,
        payments: payments || [],
        cash_paid,
        bank_paid,
        paid_amount,
        status
      };

      setEditableData(prev => ({
        ...prev,
        [empId]: updatedRow
      }));

      setSelectedEmployeeForModal(curr => (curr?.id === empId ? updatedRow : curr));

      if (status === 'Paid') {
        setUnlockedRowIds(prev => {
          const next = new Set(prev);
          next.delete(empId);
          return next;
        });
      }

      await loadPayroll(true);
    } catch (error) {
      console.error(error);
      const errMsg = error?.response?.data?.error || error.message || 'Failed to record payment.';
      toast.error(errMsg);
    } finally {
      setPayingRowId(null);
    }
  };

  const handlePayNow = async (empId) => {
    const row = editableData[empId];
    if (!row) return;

    const inputVal = payInputs[empId] || {};
    let cashVal = inputVal.cash !== undefined 
      ? parseFloat(inputVal.cash || 0) 
      : (row.payments && row.payments.length > 0 ? 0 : parseFloat(row.cash_paid || 0));
    let bankVal = inputVal.bank !== undefined 
      ? parseFloat(inputVal.bank || 0) 
      : (row.payments && row.payments.length > 0 ? 0 : parseFloat(row.bank_paid || 0));

    const net = parseFloat(row.net_salary || 0);

    // If both inputs are 0 or empty, and no payments yet, default to full remaining in cash
    if (cashVal <= 0 && bankVal <= 0) {
      const curPaid = Math.round((parseFloat(row.cash_paid || 0) + parseFloat(row.bank_paid || 0)) * 100) / 100;
      const rem = Math.round((net - curPaid) * 100) / 100;
      if (rem > 0) {
        cashVal = rem;
      } else {
        toast.info('Please enter an amount in Cash or Bank to pay.');
        return;
      }
    }

    const totalEntered = Math.round((cashVal + bankVal) * 100) / 100;
    const curPaid = Math.round((parseFloat(row.cash_paid || 0) + parseFloat(row.bank_paid || 0)) * 100) / 100;
    const currentRem = Math.round((net - curPaid) * 100) / 100;

    // Overpayment check: if total entered exceeds remaining balance (or if balance already 0 or negative)
    const threshold = currentRem > 0 ? currentRem : 0;
    if (totalEntered > threshold) {
      const overpaymentAmt = Math.round((totalEntered - threshold) * 100) / 100;
      setOverpaymentModal({
        isOpen: true,
        empId,
        empName: row.name,
        salaryAmount: currentRem > 0 ? currentRem : net,
        paymentAmount: totalEntered,
        overpaymentAmount: overpaymentAmt,
        cashVal,
        bankVal
      });
      return;
    }

    await executePayment(empId, cashVal, bankVal);
  };

  const handleDeletePayment = (paymentId, empId) => {
    confirmAction('Are you sure you want to delete this payment record?', async () => {
      setSavingRowId(empId);
      try {
        const res = await axios.delete(`/api/payroll/payments/${paymentId}`);
        const { payments, cash_paid, bank_paid, paid_amount, status, message } = res.data;
        toast.success(message || 'Payment deleted');

        setEditableData(prev => {
          const r = prev[empId];
          if (!r) return prev;
          const updatedRow = {
            ...r,
            payments: payments || [],
            cash_paid,
            bank_paid,
            paid_amount,
            status
          };
          return { ...prev, [empId]: updatedRow };
        });

        setSelectedEmployeeForModal(curr => {
          if (curr?.id === empId) {
            return {
              ...curr,
              payments: payments || [],
              cash_paid,
              bank_paid,
              paid_amount,
              status
            };
          }
          return curr;
        });

        await loadPayroll(true);
      } catch (err) {
        console.error(err);
        toast.error(err?.response?.data?.error || 'Failed to delete payment');
      } finally {
        setSavingRowId(null);
      }
    }, 'Delete Payment');
  };

  const handleTextChange = (empId, field, value) => {
    setEditableData(prev => {
      const row = { ...prev[empId] }
      row[field] = value;
      return { ...prev, [empId]: row }
    })
  }

  // Handle direct Base Salary edits in spreadsheet
  const handleSalaryChange = (empId, value) => {
    const newBaseSalary = parseFloat(value) || 0;
    setEditableData(prev => {
      const row = { ...prev[empId] };
      row.base_salary = newBaseSalary;

      const expectedHours = parseFloat(row.expected_hours) || 1;
      const expectedMinutes = row.expected_minutes !== undefined ? row.expected_minutes : (expectedHours * 60);
      const perMinRate = expectedMinutes > 0 ? (newBaseSalary / expectedMinutes) : 0;
      const perHourRate = expectedHours > 0 ? (newBaseSalary / expectedHours) : 0;

      const actualMinutes = row.actual_minutes !== undefined ? row.actual_minutes : (parseFloat(row.actual_hours || 0) * 60);

      // Payable salary: per-minute rate multiplied by actual minutes
      let payableSalary = Math.round(actualMinutes * perMinRate * 100) / 100;
      let deductions = Math.max(0, Math.round((newBaseSalary - payableSalary) * 100) / 100);
      
      const netOtHours = row.net_overtime_hours !== undefined ? parseFloat(row.net_overtime_hours || 0) : parseFloat(row.overtime_hours || 0);
      const netOtMinutes = Math.round(netOtHours * 60);
      let otPay = Math.round(netOtMinutes * perMinRate * 100) / 100;

      row.deductions = deductions;
      row.payable_salary = payableSalary;
      row.overtime_hours = netOtHours;
      row.overtime_pay = otPay;

      const dynamicNet = recalculateNetSalary(row);
      row.net_salary = dynamicNet;

      const prevCash = parseFloat(prev[empId].cash_paid || 0);
      const prevBank = parseFloat(prev[empId].bank_paid || 0);
      const prevNet = parseFloat(prev[empId].net_salary || 0);

      if (prevCash === prevNet && prevBank === 0) {
        row.cash_paid = dynamicNet;
        row.paid_amount = dynamicNet;
      } else {
        row.paid_amount = Math.round((parseFloat(row.cash_paid || 0) + parseFloat(row.bank_paid || 0)) * 100) / 100;
      }

      return { ...prev, [empId]: row };
    });
  }

  // Save salary from Employee Modal
  const handleSaveModalSalary = async () => {
    if (!currentEmpData) return;
    const val = parseFloat(modalBaseSalary);
    if (isNaN(val) || val < 0) {
      toast.error('Please enter a valid salary amount');
      return;
    }
    setSavingModalSalary(true);
    try {
      await axios.post(`/api/payroll/overrides/${currentEmpData.id}`, {
        base_salary: val
      });
      toast.success('Base salary updated successfully!');
      handleSalaryChange(currentEmpData.id, val);
      await loadPayroll(true);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update salary');
    } finally {
      setSavingModalSalary(false);
    }
  }

  const handleSaveLeave = async (e) => {
    e.preventDefault()
    if (!leaveEmployeeId) {
      toast.error('Please select an employee')
      return
    }
    setSavingLeave(true)
    try {
      await axios.post('/api/attendance/leave', {
        employee_id: leaveEmployeeId,
        date: leaveDate,
        is_paid: leaveIsPaid,
        reason: 'Special Leave marked by Admin'
      })
      toast.success('Leave marked successfully!')
      setShowLeaveModal(false)
      loadPayroll()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to mark leave')
    } finally {
      setSavingLeave(false)
    }
  }

  const saveRowRecord = async (row) => {
    const cashVal = parseFloat(row.cash_paid || 0);
    const bankVal = parseFloat(row.bank_paid || 0);
    const totalPaid = Math.round((cashVal + bankVal) * 100) / 100;

    return axios.post('/api/payroll/record', {
      employee_id: row.id,
      month: selectedMonth,
      base_salary: parseFloat(row.base_salary || 0),
      payable_salary: parseFloat(row.payable_salary !== undefined ? row.payable_salary : (parseFloat(row.base_salary || 0) - parseFloat(row.deductions || 0))),
      last_month_balance: parseFloat(row.last_month_balance || 0),
      presents: row.presents,
      absents: row.absents,
      leaves: row.leaves,
      holidays: row.holidays,
      overtime_hours: row.net_overtime_hours || 0,
      overtime_pay: 0,
      deductions: row.deductions,
      other_adjustments: row.other_adjustments || 0,
      advance_deduction: parseFloat(row.this_month_adv || 0),
      calc_advance_deduction: row.calc_advance_deduction,
      recurring_adjustments: row.recurring_adjustments || 0,
      bonus: parseFloat(row.bonus || 0),
      calc_bonus: row.calc_bonus,
      last_month_adjustment: parseFloat(row.last_month_adjustment || 0),
      calc_last_month_adjustment: row.calc_last_month_adjustment,
      internet: parseFloat(row.internet || 0),
      calc_internet: row.calc_internet,
      kafalat: parseFloat(row.kafalat || 0),
      calc_kafalat: row.calc_kafalat,
      expected_hours: row.expected_hours,
      actual_hours: row.actual_hours,
      dynamic_adjustments: row.dynamic_adjustments,
      net_salary: row.net_salary,
      cash_paid: cashVal,
      bank_paid: bankVal,
      paid_amount: totalPaid,
      status: row.status,
      notes: row.notes || ''
    });
  }

  const handleSaveAll = () => {
    confirmAction('Are you sure you want to save all payroll records for ' + selectedMonth + '?', async () => {
      setSavingAll(true);
      try {
        const rowsToSave = Object.values(editableData).filter(row => {
          // If row is Paid and not unlocked, skip it
          if (row.status === 'Paid' && !unlockedRowIds.has(row.id)) return false;
          return true;
        });

        if (rowsToSave.length === 0) {
          toast.info('No editable records to save.');
          setSavingAll(false);
          return;
        }

        const promises = rowsToSave.map(row => saveRowRecord(row));
        await Promise.all(promises);
        toast.success('All payroll records saved successfully!');
        loadPayroll();
      } catch (error) {
        console.error(error);
        const errMsg = error?.response?.data?.error || error.message || 'Failed to save some payroll records.';
        toast.error(errMsg);
      } finally {
        setSavingAll(false);
      }
    }, 'Save All');
  };
  
  const handleSaveRow = async (empId) => {
    setSavingRowId(empId);
    try {
      const row = editableData[empId];
      await saveRowRecord(row);
      toast.success(`Record for ${row.name} saved!`);
      // Re-lock after saving
      setUnlockedRowIds(prev => {
        const next = new Set(prev);
        next.delete(empId);
        return next;
      });
      await loadPayroll(true);
    } catch (error) {
       console.error(error);
       const errMsg = error?.response?.data?.error || error.message || 'Failed to save record.';
       toast.error(errMsg);
    } finally {
      setSavingRowId(null);
    }
  }

  const handleExecuteUnlock = async (emp) => {
    if (!emp) return;
    if (!isAdmin) {
      toast.error('Only Admin or Developer can unlock records');
      setUnlockPromptEmp(null);
      return;
    }

    setSavingRowId(emp.id);
    try {
      const targetId = emp.id;
      
      // 1. Mark as unlocked locally
      setUnlockedRowIds(prev => {
        const next = new Set(prev);
        next.add(targetId);
        return next;
      });

      // 2. Prepare row with status changed from Paid to Pending
      const currentRow = editableData[targetId] || emp;
      const updatedRow = {
        ...currentRow,
        status: 'Pending'
      };

      setEditableData(prev => ({
        ...prev,
        [targetId]: updatedRow
      }));

      setSelectedEmployeeForModal(prev => {
        if (prev && prev.id === targetId) {
          return { ...prev, status: 'Pending' };
        }
        return prev;
      });

      // 3. Persist status change to database via backend
      await saveRowRecord(updatedRow);

      toast.success(`Record unlocked for ${emp.name}! Status changed to Pending.`);
      setUnlockPromptEmp(null);
      await loadPayroll(true);
    } catch (err) {
      console.error('Error unlocking record:', err);
      toast.error(err?.response?.data?.error || err.message || 'Failed to unlock record');
    } finally {
      setSavingRowId(null);
    }
  }

  // ================= Employee Detail Modal Functions =================

  const loadEmpAdjs = async (empId, month = selectedMonth) => {
    if (!empId) return;
    setLoadingAdjs(true);
    try {
      const monthParam = month ? `?month=${month}` : '';
      const [recRes, oneRes] = await Promise.all([
        axios.get(`/api/payroll/recurring-adjustments/${empId}${monthParam}`),
        axios.get(`/api/payroll/adjustments/${empId}${monthParam}`)
      ]);
      setEmpRecurringAdjs(recRes.data || []);
      setEmpOneTimeAdjs(oneRes.data || []);
      setLoadedEmpId(empId);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAdjs(false);
    }
  };

  const openEmployeeModal = (empRow) => {
    setSelectedEmployeeForModal(empRow);
    setSelectedDetailEmpId(empRow.id);
    setLoadedEmpId(null);
    setModalBaseSalary(empRow.base_salary !== undefined ? String(empRow.base_salary) : '');
    resetAdjForm();
    loadEmpAdjs(empRow.id, selectedMonth);
    setShowEmpModal(true);
  };

  const handleSelectDetailEmp = (empRow) => {
    if (!empRow) {
      setSelectedEmployeeForModal(null);
      setSelectedDetailEmpId(null);
      setLoadedEmpId(null);
      return;
    }
    setSelectedEmployeeForModal(empRow);
    setSelectedDetailEmpId(empRow.id);
    setLoadedEmpId(null);
    setModalBaseSalary(empRow.base_salary !== undefined ? String(empRow.base_salary) : '');
    resetAdjForm();
    loadEmpAdjs(empRow.id, selectedMonth);
  };

  const resetAdjForm = () => {
    setEditingAdjId(null)
    setEditingAdjType(null)
    setActiveInlineForm(null)
    setCustomAdjAction('Deduct')
    setCustomAdjLabel('')
    setCustomAdjOtherLabel('')
    setCustomAdjType('Repeated Monthly')
    setCustomAdjAmount('')
    setCustomAdjTotalLimit('')
    setCustomAdjNotes('')
  }

  const openInlineAddForm = (action) => {
    setEditingAdjId(null);
    setEditingAdjType(null);
    setActiveInlineForm(action);
    setCustomAdjAction(action === 'give' ? 'Give' : 'Deduct');
    setCustomAdjType('Repeated Monthly');
    if (action === 'give') {
      setCustomAdjLabel(baseColumns.bonus?.label || 'Bonus');
    } else {
      setCustomAdjLabel('Advance Salary / Loan');
    }
    setCustomAdjOtherLabel('');
    setCustomAdjAmount('');
    setCustomAdjTotalLimit('');
    setCustomAdjNotes('');
  }

  const handleEditAdj = (adj, type) => {
    setEditingAdjId(adj.id)
    setEditingAdjType(type)
    const isGive = (adj.action_type === 'Add' || adj.action_type === 'Give');
    const act = isGive ? 'Give' : 'Deduct';
    setCustomAdjAction(act);
    setActiveInlineForm(isGive ? 'give' : 'deduct');
    
    // Check if label is one of the presets
    const presets = ['Advance Salary / Loan', 'Bonus', 'Last Month Adjustment', 'Kafalat', 'Internet']
    if (presets.includes(adj.custom_label)) {
      setCustomAdjLabel(adj.custom_label)
      setCustomAdjOtherLabel('')
    } else {
      setCustomAdjLabel('Other Custom')
      setCustomAdjOtherLabel(adj.custom_label)
    }

    setCustomAdjType(type)
    setCustomAdjAmount(adj.amount || '')
    setCustomAdjTotalLimit(adj.remaining_amount || '')
    setCustomAdjNotes(adj.notes || '')
  }

  // Carry Forward Remaining Salary to Next Month (Opens Confirmation Modal)
  const handleCarryForward = (emp) => {
    if (!emp) return;
    const cash = parseFloat(emp.cash_paid || 0);
    const bank = parseFloat(emp.bank_paid || 0);
    const totalPaid = Math.round((cash + bank) * 100) / 100;
    const netSalary = parseFloat(emp.net_salary || 0);
    const remaining = Math.round((netSalary - totalPaid) * 100) / 100;

    if (remaining === 0) {
      toast.info('No remaining balance to carry forward for this employee.');
      return;
    }

    // Modal directly uses calculated remaining amount - non editable
    setCarryForwardModal({ isOpen: true, emp, amount: remaining });
  };

  const executeCarryForwardFromModal = async () => {
    const emp = carryForwardModal.emp;
    if (!emp || savingCarryForwardId) return; // Prevent duplicate clicks
    const cash = parseFloat(emp.cash_paid || 0);
    const bank = parseFloat(emp.bank_paid || 0);
    const totalPaid = Math.round((cash + bank) * 100) / 100;
    const netSalary = parseFloat(emp.net_salary || 0);
    const remaining = Math.round((netSalary - totalPaid) * 100) / 100;

    // Strict validation: amount must be exactly remaining
    const carryAmount = remaining;

    const [year, monthNum] = selectedMonth.split('-').map(Number);
    let nextYear = year;
    let nextMonthNum = monthNum + 1;
    if (nextMonthNum > 12) {
      nextMonthNum = 1;
      nextYear = year + 1;
    }
    const nextMonthStr = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}`;

    setSavingCarryForwardId(emp.id);
    try {
      const res = await axios.post('/api/payroll/carry-forward', {
        employee_id: emp.id,
        month: selectedMonth,
        cash_paid: cash,
        bank_paid: bank,
        remaining_amount: carryAmount
      });
      toast.success(res.data?.message || `Carried forward ${CURRENCY} ${carryAmount.toFixed(2)} to ${nextMonthStr} and locked ${selectedMonth}!`);
      setCarryForwardModal({ isOpen: false, emp: null, amount: null });
      setActiveCarryEmpId(null);
      await loadPayroll(true);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to carry forward salary');
    } finally {
      setSavingCarryForwardId(null);
    }
  };

  // Print Official Employee Salary Slip (Optimized for 80mm Thermal Receipt Printers)
  const handlePrintSalarySlip = (emp) => {
    if (!emp) return;
    const baseSal = parseFloat(emp.base_salary || 0);
    const payableSal = parseFloat(emp.payable_salary !== undefined ? emp.payable_salary : (baseSal - parseFloat(emp.deductions || 0)));
    const cashPaid = parseFloat(emp.cash_paid || 0);
    const bankPaid = parseFloat(emp.bank_paid || 0);
    const totalPaid = Math.round((cashPaid + bankPaid) * 100) / 100;
    const netSalary = parseFloat(emp.net_salary || 0);
    const remaining = Math.round((netSalary - totalPaid) * 100) / 100;
    const lastMonthBal = parseFloat(emp.last_month_balance || 0);
    const bonus = parseFloat(emp.bonus || 0);
    const advDeduct = parseFloat(emp.this_month_adv || 0);
    const advBalance = parseFloat(emp.advance_balance || 0);
    const internet = parseFloat(emp.internet || 0);
    const kafalat = parseFloat(emp.kafalat || 0);
    const otherAdj = parseFloat(emp.other_adjustments || 0);
    const totalAdj = calculateTotalAdjustments(emp);
    const deductions = parseFloat(emp.deductions || 0);

    // Overtime & Only Overtime (OOT) calculations
    const onlyOtDays = parseInt(emp.only_overtime_days || 0);
    const onlyOtHours = parseFloat(emp.only_overtime_hours || 0);
    const simpleOtHours = parseFloat(emp.other_overtime_hours || 0);
    
    // Total overtime hours = simple overtime + only overtime (OOT)
    const rawTotalOtHours = Math.round((onlyOtHours + simpleOtHours) * 100) / 100;
    const netOtHours = emp.net_overtime_hours !== undefined 
      ? parseFloat(emp.net_overtime_hours || 0) 
      : parseFloat(emp.overtime_hours || rawTotalOtHours);
    const displayTotalOtHours = rawTotalOtHours > 0 ? rawTotalOtHours : Math.max(0, netOtHours);

    // Expected hours and per-minute rate
    const expHours = parseFloat(emp.expected_hours || 0);
    const expMins = emp.expected_minutes !== undefined ? emp.expected_minutes : (expHours * 60);
    const perMinRate = expMins > 0 ? (baseSal / expMins) : parseFloat(emp.per_minute_rate || 0);

    // Overtime pay calculated based on basic salary per minute / backend overtime_pay
    const calcOtPay = Math.round(Math.round(displayTotalOtHours * 60) * perMinRate * 100) / 100;
    const totalOtPay = (emp.overtime_pay !== undefined && emp.overtime_pay !== null && parseFloat(emp.overtime_pay) > 0)
      ? parseFloat(emp.overtime_pay)
      : calcOtPay;

    const dateObj = new Date(`${selectedMonth}-01T00:00:00`);
    const monthFormatted = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const printDate = new Date().toLocaleString('en-US', { 
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });

    const dynamicAdditions = [];
    const dynamicDeductions = [];
    adjustmentTypes.forEach(adj => {
      const val = parseFloat(emp.dynamic_adjustments?.[adj.label] || 0);
      if (val !== 0) {
        if (adj.action === 'Add' || (adj.action === 'Both' && val > 0)) {
          dynamicAdditions.push({ label: adj.label, amount: val });
        } else if (adj.action === 'Deduct' || (adj.action === 'Both' && val < 0)) {
          dynamicDeductions.push({ label: adj.label, amount: Math.abs(val) });
        }
      }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Salary Slip - ${emp.name} - ${monthFormatted}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          @media print {
            html, body {
              width: 80mm !important;
              max-width: 80mm !important;
              margin: 0 !important;
              padding: 2mm 3mm !important;
            }
            * {
              page-break-inside: avoid;
              break-inside: avoid;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            color: #000 !important;
          }
          body {
            width: 80mm;
            max-width: 80mm;
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: 11px;
            line-height: 1.35;
            padding: 2mm 3mm;
            margin: 0 auto;
            background: #fff;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider-solid {
            border-top: 1px solid #000;
            margin: 4px 0;
          }
          .divider-double {
            border-top: 2px solid #000;
            margin: 5px 0;
          }
          .divider-dashed {
            border-top: 1px dashed #000;
            margin: 4px 0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 1.5px 0;
            font-size: 11px;
          }
          .row-title {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 3px;
          }
          .right { text-align: right; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="bold" style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">EMPLOYEE SALARY SLIP</div>
          <div style="font-size: 10px; margin-top: 2px;">Printed: ${printDate}</div>
        </div>

        <div class="divider-double"></div>

        <div class="row">
          <span class="bold">Employee:</span>
          <span class="bold right">${emp.name}</span>
        </div>
        <div class="row">
          <span>Pay Period:</span>
          <span class="bold right">${monthFormatted}</span>
        </div>

        <div class="divider-dashed"></div>

        <div class="bold" style="font-size: 10.5px; text-transform: uppercase;">ATTENDANCE SUMMARY</div>
        <div class="row" style="font-size: 10.5px;">
          <span>P:${emp.presents || 0}  A:${emp.absents || 0}  L:${emp.leaves || 0}</span>
          <span class="right">H:${emp.holidays || 0}  OOT:${onlyOtDays}  Late:${emp.late_days || 0}</span>
        </div>
        <div class="row" style="font-size: 10.5px;">
          <span>Required Duty:</span>
          <span class="right">${(() => {
            const reqMins = emp.expected_minutes !== undefined ? emp.expected_minutes : (emp.req_duty_hours ? Math.round(parseFloat(emp.req_duty_hours) * 60) : (parseFloat(emp.expected_hours || 0) * 60));
            const h = Math.floor(reqMins / 60);
            const m = Math.round(reqMins % 60);
            return m > 0 ? `${h}h ${m}m` : `${h}h 00m`;
          })()}</span>
        </div>
        <div class="row" style="font-size: 10.5px;">
          <span>Worked Duty:</span>
          <span class="right">${formatDuration(emp.actual_minutes !== undefined ? emp.actual_minutes : (parseFloat(emp.actual_hours || 0) * 60))}</span>
        </div>
        ${(displayTotalOtHours > 0 || onlyOtDays > 0 || totalOtPay > 0) ? `
          ${(simpleOtHours > 0 && onlyOtHours > 0) ? `
            <div class="row" style="font-size: 10px;">
              <span>Simple Overtime:</span>
              <span class="right">+${formatDuration(Math.round(simpleOtHours * 60))}</span>
            </div>
            <div class="row" style="font-size: 10px;">
              <span>Only Overtime (OOT):</span>
              <span class="right">${onlyOtDays > 0 ? `${onlyOtDays}d ` : ''}(+${formatDuration(Math.round(onlyOtHours * 60))})</span>
            </div>
          ` : onlyOtHours > 0 ? `
            <div class="row" style="font-size: 10px;">
              <span>Only Overtime (OOT):</span>
              <span class="right">${onlyOtDays > 0 ? `${onlyOtDays}d ` : ''}(+${formatDuration(Math.round(onlyOtHours * 60))})</span>
            </div>
          ` : simpleOtHours > 0 ? `
            <div class="row" style="font-size: 10px;">
              <span>Simple Overtime:</span>
              <span class="right">+${formatDuration(Math.round(simpleOtHours * 60))}</span>
            </div>
          ` : ''}
          <div class="row bold" style="font-size: 10.5px;">
            <span>Total Overtime (OT + OOT):</span>
            <span class="right">+${formatDuration(Math.round(displayTotalOtHours * 60))} (${displayTotalOtHours.toFixed(1)} hrs)</span>
          </div>
          ${totalOtPay > 0 ? `
            <div class="row bold" style="font-size: 10.5px;">
              <span>Total Overtime Pay:</span>
              <span class="right">+${CURRENCY} ${totalOtPay.toFixed(2)}</span>
            </div>
          ` : ''}
        ` : ''}

        <div class="divider-dashed"></div>

        <div class="row-title">EARNINGS / ADDITIONS (+)</div>
        <div class="row">
          <span>Payable (Worked Duty)</span>
          <span class="right">${CURRENCY} ${payableSal.toFixed(2)}</span>
        </div>
        ${lastMonthBal > 0 ? `
          <div class="row">
            <span>Prev M. Remaining</span>
            <span class="right">+${CURRENCY} ${lastMonthBal.toFixed(2)}</span>
          </div>
        ` : ''}
        ${bonus > 0 ? `
          <div class="row">
            <span>Bonus</span>
            <span class="right">+${CURRENCY} ${bonus.toFixed(2)}</span>
          </div>
        ` : ''}
        ${dynamicAdditions.map(a => `
          <div class="row">
            <span>${a.label}</span>
            <span class="right">+${CURRENCY} ${a.amount.toFixed(2)}</span>
          </div>
        `).join('')}
        ${otherAdj > 0 ? `
          <div class="row">
            <span>Other Additions</span>
            <span class="right">+${CURRENCY} ${otherAdj.toFixed(2)}</span>
          </div>
        ` : ''}

        <div class="divider-dashed"></div>

        <div class="row-title">DEDUCTIONS / CUTS (-)</div>
        ${deductions > 0 ? `
          <div class="row">
            <span>Short / Absence Cuts</span>
            <span class="right">-${CURRENCY} ${deductions.toFixed(2)}</span>
          </div>
        ` : ''}
        ${advDeduct > 0 ? `
          <div class="row">
            <span>Advance / Loan Cut</span>
            <span class="right">-${CURRENCY} ${advDeduct.toFixed(2)}</span>
          </div>
        ` : ''}
        ${lastMonthBal < 0 ? `
          <div class="row">
            <span>Past Balance Cut</span>
            <span class="right">-${CURRENCY} ${Math.abs(lastMonthBal).toFixed(2)}</span>
          </div>
        ` : ''}
        ${internet > 0 ? `
          <div class="row">
            <span>Internet</span>
            <span class="right">-${CURRENCY} ${internet.toFixed(2)}</span>
          </div>
        ` : ''}
        ${kafalat > 0 ? `
          <div class="row">
            <span>Kafalat</span>
            <span class="right">-${CURRENCY} ${kafalat.toFixed(2)}</span>
          </div>
        ` : ''}
        ${dynamicDeductions.map(d => `
          <div class="row">
            <span>${d.label}</span>
            <span class="right">-${CURRENCY} ${d.amount.toFixed(2)}</span>
          </div>
        `).join('')}
        ${otherAdj < 0 ? `
          <div class="row">
            <span>Other Deductions</span>
            <span class="right">-${CURRENCY} ${Math.abs(otherAdj).toFixed(2)}</span>
          </div>
        ` : ''}

        <div class="divider-solid"></div>

        <div class="row">
          <span>Basic Base Salary:</span>
          <span class="right">${CURRENCY} ${baseSal.toFixed(2)}</span>
        </div>
        <div class="row">
          <span>Net Adjustments:</span>
          <span class="right">${totalAdj >= 0 ? `+${totalAdj.toFixed(2)}` : totalAdj.toFixed(2)}</span>
        </div>
        <div class="row bold" style="font-size: 13px; margin: 3px 0;">
          <span>NET PAYABLE SALARY:</span>
          <span class="right">${CURRENCY} ${netSalary.toFixed(2)}</span>
        </div>

        <div class="divider-double"></div>

        <div class="row-title">PAYMENT DISTRIBUTION</div>
        <div class="row">
          <span>Cash Paid:</span>
          <span class="right bold">${CURRENCY} ${cashPaid.toFixed(2)}</span>
        </div>
        <div class="row">
          <span>Bank Paid:</span>
          <span class="right bold">${CURRENCY} ${bankPaid.toFixed(2)}</span>
        </div>
        <div class="row bold" style="font-size: 12px; border-top: 1px dashed #000; padding-top: 2px; margin-top: 2px;">
          <span>TOTAL PAID:</span>
          <span class="right">${CURRENCY} ${totalPaid.toFixed(2)}</span>
        </div>
        <div class="row bold" style="font-size: 12px; margin-top: 2px;">
          <span>REMAINING SALARY:</span>
          <span class="right">${CURRENCY} ${remaining.toFixed(2)}</span>
        </div>
        <div class="row" style="font-size: 10px; margin-top: 1px;">
          <span>Payment Status:</span>
          <span class="right bold">${remaining === 0 ? 'FULLY SETTLED' : (remaining < 0 ? 'NEGATIVE BALANCE / OWED' : (totalPaid > 0 ? 'PARTIALLY PAID / CARRIED' : 'PENDING'))}</span>
        </div>

        ${emp.payments && emp.payments.length > 0 ? `
          <div class="divider-dashed"></div>
          <div class="row-title" style="font-size: 10px;">PAYMENT RECORDS (${emp.payments.length})</div>
          ${emp.payments.map((p, idx) => {
            const pDate = p.created_at ? new Date(p.created_at).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
            const pMonth = p.month || selectedMonth;
            const pUser = p.paid_by || 'Admin';
            const pAmt = parseFloat(p.amount || 0).toFixed(2);
            const pMethod = p.payment_method || 'Payment';
            return `
              <div style="font-size: 9.5px; padding: 2px 0; border-bottom: 1px dotted #888;">
                <div class="row bold">
                  <span>#${idx + 1} ${pMethod} (${pMonth})</span>
                  <span class="right">${CURRENCY} ${pAmt}</span>
                </div>
                <div class="row" style="font-size: 9px; color: #333;">
                  <span>Paid By: ${pUser}</span>
                  <span class="right">${pDate}</span>
                </div>
              </div>
            `;
          }).join('')}
        ` : ''}

        ${advBalance > 0 ? `
          <div class="divider-dashed"></div>
          <div class="row" style="font-size: 10px;">
            <span>Remaining Loan Balance:</span>
            <span class="right">${CURRENCY} ${advBalance.toFixed(2)}</span>
          </div>
        ` : ''}

        <div class="divider-solid"></div>

        <div style="margin-top: 28px; display: flex; justify-content: space-between; font-size: 10px;">
          <div style="width: 45%; text-align: center;">
            <div style="border-top: 1px solid #000; padding-top: 2px;">Employee Signature</div>
          </div>
          <div style="width: 45%; text-align: center;">
            <div style="border-top: 1px solid #000; padding-top: 2px;">Manager Signature</div>
          </div>
        </div>

        <div class="center bold" style="margin-top: 15px; font-size: 11px; letter-spacing: 0.5px;">
          Thank You
        </div>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    iframe.contentDocument.write(htmlContent);
    iframe.contentDocument.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 400);
  }

  // Synchronize employee adjustment totals and breakdown across state immediately
  const updateEmployeeAdjustmentsState = (empId, nextRecurring, nextOneTime) => {
    const numEmpId = Number(empId);
    const empRec = (nextRecurring || empRecurringAdjs).filter(a => {
      if (Number(a.employee_id) !== numEmpId) return false;
      const startM = a.start_date ? String(a.start_date).substring(0, 7) : (a.created_at ? String(a.created_at).substring(0, 7) : null);
      if (startM && startM > selectedMonth) return false;
      const endM = a.end_date ? String(a.end_date).substring(0, 7) : null;
      if (endM && endM < selectedMonth) return false;
      return true;
    });
    const empOne = (nextOneTime || empOneTimeAdjs).filter(a => {
      if (Number(a.employee_id) !== numEmpId) return false;
      const adjMonth = a.date ? String(a.date).substring(0, 7) : (a.created_at ? String(a.created_at).substring(0, 7) : null);
      return !adjMonth || adjMonth === selectedMonth;
    });

    const given = [
      ...empRec.filter(a => a.action_type === 'Give' || a.action_type === 'Add'),
      ...empOne.filter(a => a.action_type === 'Give' || a.action_type === 'Add')
    ];
    const deduct = [
      ...empRec.filter(a => a.action_type === 'Deduct'),
      ...empOne.filter(a => a.action_type === 'Deduct')
    ];

    const sumGiven = given.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    const sumDeduct = deduct.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);

    setEditableData(prev => {
      const current = prev[empId];
      if (!current) return prev;
      const baseSal = parseFloat(current.base_salary || 0);
      const payableSal = parseFloat(current.payable_salary !== undefined ? current.payable_salary : (baseSal - parseFloat(current.deductions || 0)));
      const lastMonthBal = parseFloat(current.last_month_balance || 0);

      let dynamicAdjTotal = 0;
      adjustmentTypes.forEach(adj => {
        const inGiven = given.some(a => (a.custom_label || '').toLowerCase() === adj.label.toLowerCase());
        const inDeduct = deduct.some(a => (a.custom_label || '').toLowerCase() === adj.label.toLowerCase());
        if (inGiven || inDeduct) return;

        const val = parseFloat(current.dynamic_adjustments?.[adj.label] || 0);
        if (adj.action === 'Add' || adj.action === 'Both') {
          dynamicAdjTotal += val;
        } else if (adj.action === 'Deduct') {
          dynamicAdjTotal -= val;
        }
      });

      const newTotalAdj = Math.round((lastMonthBal + sumGiven - sumDeduct + dynamicAdjTotal) * 100) / 100;
      const newNetSalary = Math.round((payableSal + newTotalAdj) * 100) / 100;

      const updatedEmp = {
        ...current,
        total_adjustments: newTotalAdj,
        net_salary: newNetSalary
      };

      setSelectedEmployeeForModal(modalPrev => {
        if (modalPrev && Number(modalPrev.id) === numEmpId) {
          return updatedEmp;
        }
        return modalPrev;
      });

      return {
        ...prev,
        [empId]: updatedEmp
      };
    });
  };

  const handleAddCustomAdj = async (e) => {
    e.preventDefault();
    if (!currentEmpData) return;
    const isLocked = currentEmpData.status === 'Paid' && !unlockedRowIds.has(currentEmpData.id);
    if (isLocked) {
      toast.error('Record is marked as Paid and locked. Please unlock the record to add or edit adjustments.');
      return;
    }

    const actualLabel = customAdjLabel === 'Other Custom' ? customAdjOtherLabel : customAdjLabel;
    if (!actualLabel) {
      toast.error('Please specify an adjustment name');
      return;
    }
    const amt = parseFloat(customAdjAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const wasEditing = !!editingAdjId;
    const editingType = editingAdjType;
    const editId = editingAdjId;
    const isRecurring = (wasEditing ? editingType : customAdjType) === 'Repeated Monthly';
    const tempId = 'temp_' + Date.now();

    const payload = {
      employee_id: currentEmpData.id,
      type: actualLabel === 'Advance Salary / Loan' ? 'Advance Salary / Loan' : 'Custom Adjustment',
      custom_label: actualLabel,
      amount: amt,
      action_type: customAdjAction,
      date: `${selectedMonth}-15`,
      start_date: `${selectedMonth}-01`,
      remaining_amount: customAdjTotalLimit ? parseFloat(customAdjTotalLimit) : null,
      notes: customAdjNotes
    };

    // Instant Optimistic Update
    let nextRecurring = empRecurringAdjs;
    let nextOneTime = empOneTimeAdjs;

    if (wasEditing) {
      if (editingType === 'Repeated Monthly') {
        nextRecurring = empRecurringAdjs.map(item => item.id === editId ? { ...item, ...payload } : item);
        setEmpRecurringAdjs(nextRecurring);
      } else {
        nextOneTime = empOneTimeAdjs.map(item => item.id === editId ? { ...item, ...payload } : item);
        setEmpOneTimeAdjs(nextOneTime);
      }
    } else {
      const newItem = {
        id: tempId,
        ...payload,
        created_at: new Date().toISOString()
      };
      if (customAdjType === 'Repeated Monthly') {
        nextRecurring = [newItem, ...empRecurringAdjs];
        setEmpRecurringAdjs(nextRecurring);
      } else {
        nextOneTime = [newItem, ...empOneTimeAdjs];
        setEmpOneTimeAdjs(nextOneTime);
      }
    }

    // Immediately synchronize employee totals and breakdown in real-time
    updateEmployeeAdjustmentsState(currentEmpData.id, nextRecurring, nextOneTime);

    resetAdjForm();
    toast.success(wasEditing ? 'Adjustment updated successfully!' : 'Adjustment added successfully!');

    setSavingCustomAdj(true);
    try {
      if (wasEditing) {
        if (isRecurring) {
          await axios.put(`/api/payroll/recurring-adjustments/${editId}`, payload);
        } else {
          await axios.put(`/api/payroll/financial-adjustments/${editId}`, payload);
        }
      } else {
        if (isRecurring) {
          await axios.post('/api/payroll/recurring-adjustments', payload);
        } else {
          await axios.post('/api/payroll/financial-adjustments', payload);
        }
      }

      // Fully await refreshing both employee adjustments and payroll calculations
      await loadEmpAdjs(currentEmpData.id, selectedMonth);
      await loadPayroll(true);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to save adjustment';
      toast.error(errorMsg);
      await loadEmpAdjs(currentEmpData.id, selectedMonth);
      await loadPayroll(true);
    } finally {
      setSavingCustomAdj(false);
    }
  }

  const executeDelete = async () => {
    const { id, type } = confirmDelete;
    const isLocked = currentEmpData?.status === 'Paid' && !unlockedRowIds.has(currentEmpData?.id);
    if (isLocked && type !== 'Adjustment Column') {
      toast.error('Record is marked as Paid and locked. Please unlock the record first.');
      setConfirmDelete({ isOpen: false, id: null, type: null });
      return;
    }

    // Close confirmation modal immediately for snappy UX
    setConfirmDelete({ isOpen: false, id: null, type: null });

    if (type !== 'Adjustment Column') {
      // Instant Optimistic Deletion
      let nextRecurring = empRecurringAdjs;
      let nextOneTime = empOneTimeAdjs;

      if (type === 'Repeated Monthly') {
        nextRecurring = empRecurringAdjs.filter(item => item.id !== id);
        setEmpRecurringAdjs(nextRecurring);
      } else {
        nextOneTime = empOneTimeAdjs.filter(item => item.id !== id);
        setEmpOneTimeAdjs(nextOneTime);
      }

      if (currentEmpData) {
        updateEmployeeAdjustmentsState(currentEmpData.id, nextRecurring, nextOneTime);
      }
      toast.success('Deleted successfully');
    }

    try {
      if (type === 'Repeated Monthly') {
        await axios.delete(`/api/payroll/recurring-adjustments/${id}`);
      } else if (type === 'Adjustment Column') {
        await axios.delete(`/api/payroll/adjustment-types/${id}`);
      } else {
        await axios.delete(`/api/payroll/adjustments/${id}`);
      }

      if (type === 'Adjustment Column') {
        toast.success('Deleted successfully');
        await loadAdjustmentTypes();
        await loadPayroll(true);
      } else {
        if (currentEmpData) {
          await loadEmpAdjs(currentEmpData.id, selectedMonth);
        }
        await loadPayroll(true);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to delete';
      toast.error(errorMsg);
      if (type !== 'Adjustment Column' && currentEmpData) {
        await loadEmpAdjs(currentEmpData.id, selectedMonth);
        await loadPayroll(true);
      }
    }
  }

  // ===================================================================

  const filteredEmployees = Object.values(editableData).filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.employee_id && item.employee_id.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;

    if (selectedBranchFilter === 'ALL') return true;

    const b = String(item.branch || '').toUpperCase().trim();
    const s = String(item.shift || item.working_hours || '').toUpperCase().trim();

    if (b) {
      if (selectedBranchFilter === 'R1' && (b.includes('1') || b === 'R1')) return true;
      if (selectedBranchFilter === 'R2' && (b.includes('2') || b === 'R2')) return true;
      if (selectedBranchFilter === 'R3' && (b.includes('3') || b === 'R3')) return true;
    }
    if (s) {
      if (selectedBranchFilter === 'R1' && (s.includes('1') || s === 'R1')) return true;
      if (selectedBranchFilter === 'R2' && (s.includes('2') || s === 'R2')) return true;
      if (selectedBranchFilter === 'R3' && (s.includes('3') || s === 'R3')) return true;
    }

    return selectedBranchFilter === 'R1';
  });

  // Calculate Summary Totals
  const totalBaseSalary = filteredEmployees.reduce((sum, item) => sum + (parseFloat(item.base_salary) || 0), 0)
  const totalNetSalary = filteredEmployees.reduce((sum, item) => sum + (parseFloat(item.net_salary) || 0), 0)
  const totalDeductions = filteredEmployees.reduce((sum, item) => sum + (parseFloat(item.deductions) || 0), 0)

  const selectedDetailEmp = (selectedDetailEmpId && filteredEmployees.some(e => e.id === selectedDetailEmpId))
    ? (editableData[selectedDetailEmpId] || filteredEmployees.find(e => e.id === selectedDetailEmpId))
    : (isMobile ? null : filteredEmployees[0]);

  const currentEmpData = selectedEmployeeForModal 
    ? (editableData[selectedEmployeeForModal.id] || selectedEmployeeForModal)
    : (viewMode === 'detail' ? selectedDetailEmp : null);

  useEffect(() => {
    if (viewMode === 'detail' && selectedDetailEmp && (!selectedEmployeeForModal || selectedEmployeeForModal.id !== selectedDetailEmp.id)) {
      setSelectedEmployeeForModal(selectedDetailEmp);
      setModalBaseSalary(selectedDetailEmp.base_salary !== undefined ? String(selectedDetailEmp.base_salary) : '');
      loadEmpAdjs(selectedDetailEmp.id);
    }
  }, [viewMode, selectedDetailEmp?.id]);

  const renderEmployeeDetailBody = (targetEmpData) => {
    if (!targetEmpData) return null;

    const isRowLocked = targetEmpData.status === 'Paid' && !unlockedRowIds.has(targetEmpData.id);
    const baseSal = parseFloat(targetEmpData.base_salary || 0);
    const expHours = parseFloat(targetEmpData.expected_hours || 0);
    const expMins = targetEmpData.expected_minutes !== undefined ? targetEmpData.expected_minutes : (expHours * 60);
    const perMinRate = expMins > 0 ? (baseSal / expMins) : 0;
    
    const netOtHours = targetEmpData.net_overtime_hours !== undefined 
      ? parseFloat(targetEmpData.net_overtime_hours || 0) 
      : parseFloat(targetEmpData.overtime_hours || 0);
    const netOtMins = Math.round(netOtHours * 60);
    
    // Overtime pay calculated based on basic salary per minute
    const calcOtPay = Math.round(netOtMins * perMinRate * 100) / 100;
    const displayOtPay = (targetEmpData.overtime_pay !== undefined && targetEmpData.overtime_pay !== null && targetEmpData.overtime_pay !== 0) 
      ? parseFloat(targetEmpData.overtime_pay) 
      : calcOtPay;

    const payableSal = parseFloat(targetEmpData.payable_salary !== undefined ? targetEmpData.payable_salary : (baseSal - parseFloat(targetEmpData.deductions || 0)));
    const advBalance = parseFloat(targetEmpData.advance_balance || 0);
    const lastMonthBal = parseFloat(targetEmpData.last_month_balance || 0);

    const targetEmpId = Number(targetEmpData.id);
    const isThisEmpLoaded = loadedEmpId === targetEmpId;
    const empRec = empRecurringAdjs.filter(a => {
      if (Number(a.employee_id) !== targetEmpId) return false;
      const startM = a.start_date ? String(a.start_date).substring(0, 7) : (a.created_at ? String(a.created_at).substring(0, 7) : null);
      if (startM && startM > selectedMonth) return false;
      const endM = a.end_date ? String(a.end_date).substring(0, 7) : null;
      if (endM && endM < selectedMonth) return false;
      return true;
    });
    const empOne = empOneTimeAdjs.filter(a => {
      if (Number(a.employee_id) !== targetEmpId) return false;
      const adjMonth = a.date ? String(a.date).substring(0, 7) : (a.created_at ? String(a.created_at).substring(0, 7) : null);
      return !adjMonth || adjMonth === selectedMonth;
    });

    const givenAdjs = [
      ...empRec.filter(a => a.action_type === 'Give' || a.action_type === 'Add').map(a => ({ ...a, repetition: 'Repeated Monthly' })),
      ...empOne.filter(a => a.action_type === 'Give' || a.action_type === 'Add').map(a => ({ ...a, repetition: 'One-Time' }))
    ];

    const deductAdjs = [
      ...empRec.filter(a => a.action_type === 'Deduct').map(a => ({ ...a, repetition: 'Repeated Monthly' })),
      ...empOne.filter(a => a.action_type === 'Deduct').map(a => ({ ...a, repetition: 'One-Time' }))
    ];

    const totalGiven = givenAdjs.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
    const totalDeduct = deductAdjs.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

    let dynamicAdjTotal = 0;
    adjustmentTypes.forEach(adj => {
      const inGiven = givenAdjs.some(a => (a.custom_label || '').toLowerCase() === adj.label.toLowerCase());
      const inDeduct = deductAdjs.some(a => (a.custom_label || '').toLowerCase() === adj.label.toLowerCase());
      if (inGiven || inDeduct) return;

      const val = parseFloat(targetEmpData.dynamic_adjustments?.[adj.label] || 0);
      if (adj.action === 'Add' || adj.action === 'Both') {
        dynamicAdjTotal += val;
      } else if (adj.action === 'Deduct') {
        dynamicAdjTotal -= val;
      }
    });

    const hasActiveAdjs = givenAdjs.length > 0 || deductAdjs.length > 0;
    const totalAdj = (hasActiveAdjs || isThisEmpLoaded)
      ? Math.round((lastMonthBal + totalGiven - totalDeduct + dynamicAdjTotal) * 100) / 100
      : calculateTotalAdjustments(targetEmpData);

    const dynamicNetSalary = Math.round((payableSal + totalAdj) * 100) / 100;
    const bonusVal = parseFloat(targetEmpData.bonus || 0);
    const advVal = parseFloat(targetEmpData.this_month_adv || 0);
    const netVal = parseFloat(targetEmpData.internet || 0);
    const kafVal = parseFloat(targetEmpData.kafalat || 0);

    return (
      <>
        {/* 1. Hours & Overtime Summary (2x2 on mobile, 4-col on desktop) */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, minmax(0, 1fr))', 
          gap: '8px', 
          marginBottom: '10px' 
        }}>
          <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Expected:</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>
              {formatDuration(targetEmpData.expected_minutes !== undefined ? targetEmpData.expected_minutes : (targetEmpData.expected_hours * 60))}
            </span>
          </div>
          <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Actual:</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>
              {formatDuration(targetEmpData.actual_minutes !== undefined ? targetEmpData.actual_minutes : (targetEmpData.actual_hours * 60))}
            </span>
          </div>
          <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Overtime:</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: netOtHours > 0 ? 'var(--green)' : netOtHours < 0 ? '#ef4444' : '#64748b' }}>
              {netOtHours > 0 ? '+' : netOtHours < 0 ? '-' : ''}
              {formatDuration(Math.abs(Math.round(netOtHours * 60)))}
            </span>
          </div>
          <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>OT Pay:</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: displayOtPay > 0 ? 'var(--green)' : displayOtPay < 0 ? '#ef4444' : '#64748b' }}>
              {displayOtPay > 0 ? `+${CURRENCY} ${displayOtPay.toFixed(2)}` : displayOtPay < 0 ? `-${CURRENCY} ${Math.abs(displayOtPay).toFixed(2)}` : `${CURRENCY} 0.00`}
            </span>
          </div>
        </div>

        {/* 3. Financials, Deductions Breakdown & Payment Box */}
        <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Financials & Salary Calculation
            </div>
            
            {/* Base Salary Editor & Clear Balance */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Base Salary:</span>
              <input 
                type="number" 
                disabled={isRowLocked}
                value={modalBaseSalary}
                onChange={e => setModalBaseSalary(e.target.value)}
                style={{ width: '80px', padding: '3px 6px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700, color: '#7c3aed', outline: 'none' }}
              />
              {!isRowLocked && (
                <button 
                  onClick={handleSaveModalSalary}
                  disabled={savingModalSalary}
                  className="btn btn-primary"
                  style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 700, borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {savingModalSalary ? <RefreshCw size={11} className="spin" /> : <Save size={11} />}
                  Update
                </button>
              )}
              {showActions && (
                <button 
                  type="button"
                  onClick={() => handleClearPastBalance(targetEmpData.id, targetEmpData.name)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '5px',
                    border: '1px solid #fed7aa',
                    background: '#fffaf0',
                    color: '#c2410c',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                  title="Clear previous month balance (Zero out carryover balance to 0.00)"
                >
                  <RotateCcw size={11} />
                  Clear Past Bal (0.00)
                </button>
              )}
            </div>
          </div>

          {/* Financial Metrics Grid - 2x2 on Mobile, 5 in row on Desktop */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, minmax(0, 1fr))', 
            gap: '8px', 
            marginBottom: '8px' 
          }}>
            <div style={{ background: '#fff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, display: 'block' }}>Payable (Worked Duty)</span>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>{CURRENCY} {payableSal.toFixed(2)}</div>
              <span style={{ fontSize: '9px', color: targetEmpData.deductions > 0 ? '#ef4444' : '#64748b', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {targetEmpData.deductions > 0 ? `(-${CURRENCY} ${targetEmpData.deductions.toFixed(2)})` : 'Full hours'}
              </span>
            </div>

            <div style={{ background: '#fff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, display: 'block' }}>Total Adjustments (±)</span>
              <div style={{ fontSize: '13px', fontWeight: 800, color: totalAdj >= 0 ? 'var(--green)' : '#ef4444', marginTop: '2px' }}>
                {totalAdj >= 0 ? `+${totalAdj.toFixed(2)}` : totalAdj.toFixed(2)}
              </div>
              <span style={{ fontSize: '9px', color: '#64748b', display: 'block' }}>
                Additions - deductions
              </span>
            </div>

            <div style={{ background: '#f5f3ff', padding: '8px 10px', borderRadius: '6px', border: '1.5px solid #ddd6fe' }}>
              <span style={{ fontSize: '10px', color: '#6b21a8', fontWeight: 700, display: 'block' }}>Prev M. Remaining</span>
              <div style={{ fontSize: '13px', fontWeight: 800, color: lastMonthBal > 0 ? 'var(--green)' : lastMonthBal < 0 ? '#ef4444' : '#64748b', marginTop: '2px' }}>
                {lastMonthBal > 0 ? `+${CURRENCY} ${lastMonthBal.toFixed(2)}` : lastMonthBal < 0 ? `-${CURRENCY} ${Math.abs(lastMonthBal).toFixed(2)}` : `${CURRENCY} 0.00`}
              </div>
              <span style={{ fontSize: '9px', color: '#7c3aed', display: 'block' }}>
                {lastMonthBal !== 0 ? 'Carried from last month' : 'No past carryover'}
              </span>
            </div>

            <div style={{ background: '#fff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, display: 'block' }}>Advance Balance (Loan)</span>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>{CURRENCY} {advBalance.toFixed(2)}</div>
              <span style={{ fontSize: '9px', color: '#64748b', display: 'block' }}>Remaining loan</span>
            </div>

            <div style={{ 
              background: dynamicNetSalary < 0 ? '#fef2f2' : '#ecfdf5', 
              padding: '8px 10px', 
              borderRadius: '6px', 
              border: '1.5px solid ' + (dynamicNetSalary < 0 ? '#fecaca' : '#a7f3d0'),
              gridColumn: isMobile ? 'span 2' : 'auto',
              display: isMobile ? 'flex' : 'block',
              justifyContent: isMobile ? 'space-between' : 'initial',
              alignItems: isMobile ? 'center' : 'initial'
            }}>
              <div>
                <span style={{ fontSize: '11px', color: dynamicNetSalary < 0 ? '#b91c1c' : '#047857', fontWeight: 800, display: 'block' }}>Net Payable Salary</span>
                <span style={{ fontSize: '9px', color: dynamicNetSalary < 0 ? '#b91c1c' : '#047857', display: 'block' }}>Payable + Adj</span>
              </div>
              <div style={{ fontSize: isMobile ? '16px' : '13px', fontWeight: 900, color: dynamicNetSalary < 0 ? '#dc2626' : '#059669', marginTop: isMobile ? 0 : '1px' }}>
                {CURRENCY} {Number(dynamicNetSalary || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Deductions & Additions Detailed Summary List */}
          <div style={{ background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Calculation Breakdown</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px' }}>
              {lastMonthBal !== 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: lastMonthBal > 0 ? '#ecfdf5' : '#fef2f2', color: lastMonthBal > 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                  Last M. Bal: {lastMonthBal > 0 ? `+${lastMonthBal}` : lastMonthBal}
                  {showActions && (
                    <button
                      type="button"
                      onClick={() => handleClearPastBalance(targetEmpData.id, targetEmpData.name)}
                      style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', padding: '0 2px', display: 'inline-flex', alignItems: 'center' }}
                      title="Clear past balance to 0.00"
                    >
                      <RotateCcw size={10} />
                    </button>
                  )}
                </span>
              )}

              {/* Grouped Given / Additions Breakdown */}
              {(() => {
                const givenGroups = {};
                givenAdjs.forEach(a => {
                  const lbl = a.custom_label || 'Bonus';
                  const amt = parseFloat(a.amount) || 0;
                  givenGroups[lbl] = (givenGroups[lbl] || 0) + amt;
                });

                return Object.entries(givenGroups).map(([lbl, amt]) => {
                  if (!amt) return null;
                  return (
                    <span key={`given-${lbl}`} style={{ padding: '2px 6px', borderRadius: '4px', background: '#ecfdf5', color: '#059669', fontWeight: 600 }}>
                      {lbl}: +{amt}
                    </span>
                  );
                });
              })()}

              {/* Grouped Deductions Breakdown */}
              {(() => {
                const deductGroups = {};
                deductAdjs.forEach(a => {
                  let lbl = a.custom_label || 'Deduction';
                  if (lbl.toLowerCase().includes('advance') || lbl.toLowerCase().includes('loan')) {
                    lbl = 'Adv';
                  }
                  const amt = parseFloat(a.amount) || 0;
                  deductGroups[lbl] = (deductGroups[lbl] || 0) + amt;
                });

                return Object.entries(deductGroups).map(([lbl, amt]) => {
                  if (!amt) return null;
                  return (
                    <span key={`deduct-${lbl}`} style={{ padding: '2px 6px', borderRadius: '4px', background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>
                      {lbl}: -{amt}
                    </span>
                  );
                });
              })()}

              {/* Fallback to cached record values only if no adjustments loaded/active */}
              {!hasActiveAdjs && !isThisEmpLoaded && (
                <>
                  {bonusVal !== 0 && (
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: bonusVal > 0 ? '#ecfdf5' : '#fef2f2', color: bonusVal > 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                      Bonus: {bonusVal > 0 ? `+${bonusVal}` : bonusVal}
                    </span>
                  )}
                  {advVal !== 0 && (
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: advVal > 0 ? '#fef2f2' : '#ecfdf5', color: advVal > 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>
                      Adv: {advVal > 0 ? `-${advVal}` : `+${Math.abs(advVal)}`}
                    </span>
                  )}
                  {netVal !== 0 && (
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: netVal > 0 ? '#fef2f2' : '#ecfdf5', color: netVal > 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>
                      Internet: {netVal > 0 ? `-${netVal}` : `+${Math.abs(netVal)}`}
                    </span>
                  )}
                  {kafVal !== 0 && (
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: kafVal > 0 ? '#fef2f2' : '#ecfdf5', color: kafVal > 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>
                      Kafalat: {kafVal > 0 ? `-${kafVal}` : `+${Math.abs(kafVal)}`}
                    </span>
                  )}
                  {parseFloat(targetEmpData.other_adjustments || 0) !== 0 && (
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: parseFloat(targetEmpData.other_adjustments) > 0 ? '#ecfdf5' : '#fef2f2', color: parseFloat(targetEmpData.other_adjustments) > 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                      Other Adj: {parseFloat(targetEmpData.other_adjustments) > 0 ? `+${parseFloat(targetEmpData.other_adjustments)}` : parseFloat(targetEmpData.other_adjustments)}
                    </span>
                  )}
                </>
              )}

              {/* Dynamic spreadsheet adjustments not already in given or deduct */}
              {Object.entries(targetEmpData.dynamic_adjustments || {}).map(([lbl, val]) => {
                const num = parseFloat(val) || 0;
                if (num === 0) return null;
                const inGiven = givenAdjs.some(a => (a.custom_label || '').toLowerCase() === lbl.toLowerCase());
                const inDeduct = deductAdjs.some(a => (a.custom_label || '').toLowerCase() === lbl.toLowerCase());
                if (inGiven || inDeduct) return null;

                const adjConfig = adjustmentTypes.find(a => a.label.toLowerCase() === lbl.toLowerCase());
                const isDeduct = adjConfig ? adjConfig.action === 'Deduct' : (num < 0);
                const isPositive = !isDeduct && num > 0;
                return (
                  <span key={`dyn-${lbl}`} style={{ padding: '2px 6px', borderRadius: '4px', background: isPositive ? '#f5f3ff' : '#fef2f2', color: isPositive ? '#7c3aed' : '#dc2626', fontWeight: 600 }}>
                    {lbl}: {isDeduct ? `-${Math.abs(num)}` : `+${num}`}
                  </span>
                );
              })}

              {lastMonthBal === 0 && givenAdjs.length === 0 && deductAdjs.length === 0 && Object.keys(targetEmpData.dynamic_adjustments || {}).length === 0 && (
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>No active adjustments applied for this month.</span>
              )}
            </div>
          </div>

          {/* Payment Execution Controls (Structured Two-Row Layout) */}
          <div style={{ 
            background: '#f8fafc', 
            padding: isMobile ? '12px' : '10px 14px', 
            borderRadius: '10px', 
            border: '1.5px solid #e2e8f0', 
            display: 'flex', 
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '10px'
          }}>
            {(() => {
              const cash = parseFloat(targetEmpData.cash_paid || 0);
              const bank = parseFloat(targetEmpData.bank_paid || 0);
              const totalPaid = Math.round((cash + bank) * 100) / 100;
              const netSal = dynamicNetSalary;
              const rem = Math.round((netSal - totalPaid) * 100) / 100;
              const carryVal = carryInputValues[targetEmpData.id] !== undefined 
                ? carryInputValues[targetEmpData.id] 
                : (rem > 0 ? rem.toFixed(2) : '');

              return (
                <>
                  {/* Payment History Log Table (Installments) */}
                  {targetEmpData.payments && targetEmpData.payments.length > 0 && (
                    <div style={{
                      background: '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      marginBottom: '4px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Clock size={13} color="#0284c7" />
                          Payment History / Installments ({targetEmpData.payments.length})
                        </span>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left', borderBottom: '1.5px solid #e2e8f0' }}>
                              <th style={{ padding: '5px 8px', fontWeight: 700, width: '25px' }}>#</th>
                              <th style={{ padding: '5px 8px', fontWeight: 700 }}>Date & Time</th>
                              <th style={{ padding: '5px 8px', fontWeight: 700 }}>Paid By</th>
                              <th style={{ padding: '5px 8px', fontWeight: 700 }}>Method</th>
                              <th style={{ padding: '5px 8px', fontWeight: 700, textAlign: 'right' }}>Amount</th>
                              {!isRowLocked && <th style={{ padding: '5px 8px', textAlign: 'center', width: '30px' }}></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {targetEmpData.payments.map((p, idx) => (
                              <tr key={p.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '5px 8px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                                <td style={{ padding: '5px 8px', color: '#1e293b', fontWeight: 600 }}>
                                  {new Date(p.created_at).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td style={{ padding: '5px 8px', color: '#0369a1', fontWeight: 700 }}>
                                  {p.paid_by || 'Admin'}
                                </td>
                                <td style={{ padding: '5px 8px' }}>
                                  <span style={{
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    fontWeight: 700,
                                    fontSize: '10px',
                                    background: (p.payment_method || '').toLowerCase() === 'cash' ? '#ecfdf5' : '#e0e7ff',
                                    color: (p.payment_method || '').toLowerCase() === 'cash' ? '#059669' : '#4338ca',
                                    border: '1px solid ' + ((p.payment_method || '').toLowerCase() === 'cash' ? '#a7f3d0' : '#c7d2fe')
                                  }}>
                                    {p.payment_method}
                                  </span>
                                </td>
                                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                                  {CURRENCY} {parseFloat(p.amount || 0).toFixed(2)}
                                </td>
                                {!isRowLocked && (
                                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePayment(p.id, targetEmpData.id)}
                                      title="Delete this payment entry"
                                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                                      onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                                      onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '1.5px solid #cbd5e1' }}>
                              <td colSpan={3} style={{ padding: '6px 8px', color: '#334155' }}>
                                Total Summary:
                              </td>
                              <td colSpan={!isRowLocked ? 3 : 2} style={{ padding: '6px 8px', textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end', fontSize: '11px' }}>
                                  <span style={{ color: '#0369a1' }}>
                                    Total Cash: <b>{CURRENCY} {targetEmpData.payments.filter(p => (p.payment_method || '').toLowerCase() === 'cash').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toFixed(2)}</b>
                                  </span>
                                  <span style={{ color: '#4338ca' }}>
                                    Total Bank: <b>{CURRENCY} {targetEmpData.payments.filter(p => (p.payment_method || '').toLowerCase() === 'bank').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toFixed(2)}</b>
                                  </span>
                                  <span style={{ color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                                    Total Paid Sum: <b>{CURRENCY} {targetEmpData.payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toFixed(2)}</b>
                                  </span>
                                </div>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ROW 1: Cash Paid, Bank Paid, Pay Now, Print Slip (80mm) ---> Paid, Remaining */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    {/* Left: Inputs & Primary Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {/* Cash Paid */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', whiteSpace: 'nowrap' }}>Cash Paid:</label>
                        <input 
                          type="text"
                          inputMode="decimal"
                          disabled={isRowLocked}
                          value={payInputs[targetEmpData.id]?.cash !== undefined 
                            ? payInputs[targetEmpData.id].cash 
                            : (targetEmpData.payments && targetEmpData.payments.length > 0 ? '' : (targetEmpData.cash_paid || ''))}
                          onChange={e => {
                            const val = e.target.value;
                            setPayInputs(prev => ({
                              ...prev,
                              [targetEmpData.id]: {
                                ...(prev[targetEmpData.id] || {}),
                                cash: val
                              }
                            }));
                          }}
                          placeholder={rem > 0 && (!targetEmpData.payments || targetEmpData.payments.length === 0) ? rem.toFixed(2) : "0.00"}
                          style={{ width: '80px', padding: '5px 8px', borderRadius: '6px', border: '1.5px solid #cbd5e1', fontSize: '12px', fontWeight: 800, color: '#0369a1', background: isRowLocked ? '#f1f5f9' : '#fff' }}
                        />
                      </div>

                      {/* Bank Paid */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#4338ca', whiteSpace: 'nowrap' }}>Bank Paid:</label>
                        <input 
                          type="text"
                          inputMode="decimal"
                          disabled={isRowLocked}
                          value={payInputs[targetEmpData.id]?.bank !== undefined 
                            ? payInputs[targetEmpData.id].bank 
                            : (targetEmpData.payments && targetEmpData.payments.length > 0 ? '' : (targetEmpData.bank_paid || ''))}
                          onChange={e => {
                            const val = e.target.value;
                            setPayInputs(prev => ({
                              ...prev,
                              [targetEmpData.id]: {
                                ...(prev[targetEmpData.id] || {}),
                                bank: val
                              }
                            }));
                          }}
                          placeholder="0.00"
                          style={{ width: '80px', padding: '5px 8px', borderRadius: '6px', border: '1.5px solid #cbd5e1', fontSize: '12px', fontWeight: 800, color: '#4338ca', background: isRowLocked ? '#f1f5f9' : '#fff' }}
                        />
                      </div>

                      {/* Pay Now Button */}
                      {!isRowLocked && showActions && (
                        <button 
                          type="button"
                          onClick={() => handlePayNow(targetEmpData.id)}
                          disabled={payingRowId === targetEmpData.id}
                          style={{ 
                            padding: '6px 14px', 
                            borderRadius: '6px', 
                            fontSize: '12px', 
                            fontWeight: 800, 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '5px', 
                            background: '#16a34a', 
                            color: '#fff', 
                            border: 'none', 
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
                            whiteSpace: 'nowrap'
                          }}
                          title="Record payment and update Paid & Remaining"
                        >
                          {payingRowId === targetEmpData.id ? <RefreshCw size={12} className="spin" /> : <CheckCircle size={13} />}
                          Pay Now
                        </button>
                      )}

                      {/* Print Salary Slip (80mm Thermal Receipt) */}
                      <button 
                        type="button" 
                        onClick={() => handlePrintSalarySlip(targetEmpData)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          background: '#fff',
                          border: '1.5px solid #cbd5e1',
                          color: '#334155',
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          whiteSpace: 'nowrap'
                        }}
                        title="Print 80mm Thermal Salary Slip"
                      >
                        <Printer size={13} style={{ color: '#0284c7' }} />
                        <span>Print</span>
                      </button>
                    </div>

                    {/* Right: Paid & Remaining Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: isMobile ? '0' : 'auto' }}>
                      {/* Salary Paid Badge */}
                      <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '6px', 
                        background: '#16a34a', 
                        color: '#fff',
                        boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
                        border: 'none',
                        whiteSpace: 'nowrap'
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#fff' }}>Salary Paid:</span>
                        <span style={{ 
                          fontSize: '12px', 
                          fontWeight: 900, 
                          color: '#fff'
                        }}>
                          {CURRENCY} {totalPaid.toFixed(2)}
                        </span>
                      </div>

                      {/* Remaining Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: rem < 0 ? '#dc2626' : '#ea580c' }}>Remaining:</label>
                        <span style={{ 
                          fontSize: '12px', 
                          fontWeight: 800, 
                          padding: '4px 10px', 
                          borderRadius: '6px', 
                          background: rem > 0 ? '#ffedd5' : rem < 0 ? '#fef2f2' : '#ecfdf5', 
                          color: rem > 0 ? '#c2410c' : rem < 0 ? '#dc2626' : '#059669',
                          border: '1.5px solid ' + (rem > 0 ? '#fdba74' : rem < 0 ? '#fecaca' : '#a7f3d0')
                        }}>
                          {CURRENCY} {rem.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ROW 2: Carry Forward (Amount Input + Button) ---> Status + Save Record / Locked */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid #e2e8f0'
                  }}>
                    {/* Left: Carry Forward Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {rem !== 0 && showActions && !isRowLocked ? (
                        <button
                          type="button"
                          disabled={savingCarryForwardId === targetEmpData.id}
                          onClick={() => handleCarryForward(targetEmpData)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#fff7ed',
                            border: '1.5px solid #fdba74',
                            color: '#c2410c',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease'
                          }}
                          title={`Carry forward remaining balance of ${CURRENCY} ${rem.toFixed(2)} to next month`}
                        >
                          {savingCarryForwardId === targetEmpData.id ? <RefreshCw size={12} className="spin" /> : <ArrowRightCircle size={13} />}
                          <span>Carry Forward</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: rem === 0 ? '#059669' : '#64748b' }}>
                          {parseFloat(targetEmpData.carried_forward_to_next || 0) !== 0 
                            ? '✓ Balance carried forward to next month' 
                            : rem === 0 
                              ? '✓ Salary fully paid / Settled' 
                              : (isRowLocked ? '🔒 Record is locked' : '')}
                        </span>
                      )}
                    </div>

                    {/* Right: Auto-calculated Status Badge + Locked Action (Save Record removed as actions auto-persist) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: isMobile ? '0' : 'auto' }}>
                      {/* Audio 2: Forward to Next Month badge shown right before Status */}
                      {parseFloat(targetEmpData.carried_forward_to_next || 0) !== 0 && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          background: '#fff7ed',
                          color: '#c2410c',
                          border: '1.5px solid #fed7aa',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                          boxShadow: '0 1px 2px rgba(234, 88, 12, 0.08)'
                        }}>
                          <ArrowRightCircle size={13} color="#ea580c" />
                          <span>Forward to Next Month: {CURRENCY} {parseFloat(targetEmpData.carried_forward_to_next).toFixed(2)}</span>
                        </div>
                      )}

                      {/* Auto-Calculated Payment Status Badge (Pending & Partial cannot be manually selected) */}
                      {(() => {
                        const autoStatus = rem <= 0 && (totalPaid > 0 || netSal === 0) 
                          ? 'Paid' 
                          : (totalPaid > 0 ? 'Partial' : 'Pending');
                        const statusColor = autoStatus === 'Paid' ? '#059669' : autoStatus === 'Partial' ? '#2563eb' : '#d97706';
                        const statusBg = autoStatus === 'Paid' ? '#ecfdf5' : autoStatus === 'Partial' ? '#eff6ff' : '#fffbeb';
                        const statusBorder = autoStatus === 'Paid' ? '#a7f3d0' : autoStatus === 'Partial' ? '#bfdbfe' : '#fde68a';
                        
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Status:</label>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 800,
                              color: statusColor,
                              background: statusBg,
                              border: `1.5px solid ${statusBorder}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              {autoStatus}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Locked Button if locked */}
                      {showActions && isRowLocked && (
                        <button 
                          type="button"
                          onClick={() => setUnlockPromptEmp(targetEmpData)}
                          className="btn"
                          style={{ 
                            width: isMobile ? '100%' : 'auto',
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '5px', 
                            padding: '6px 14px', 
                            borderRadius: '6px', 
                            fontSize: '12px', 
                            fontWeight: 800, 
                            background: '#fef3c7', 
                            color: '#b45309', 
                            border: '1.5px solid #fde68a',
                            cursor: 'pointer'
                          }}
                          title="Record is marked as Paid and locked. Click to unlock."
                        >
                          <Lock size={12} style={{ color: '#d97706' }} />
                          Locked
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Locked Warning banner */}
        {isRowLocked && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            gap: '10px', 
            background: '#fef3c7', 
            border: '1.5px solid #fde68a', 
            borderRadius: '8px', 
            padding: '10px 14px', 
            marginBottom: '12px',
            color: '#92400e'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700 }}>
              <Lock size={16} style={{ color: '#d97706', flexShrink: 0 }} />
              <span>Record is marked as Paid and locked. Please unlock the record to add or modify adjustments.</span>
            </div>
            {showActions && (
              <button 
                type="button" 
                onClick={() => setUnlockPromptEmp(targetEmpData)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: '#fff',
                  border: '1px solid #d97706',
                  color: '#b45309',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <Unlock size={12} /> Unlock to Edit
              </button>
            )}
          </div>
        )}

        {/* Two Distinct Columns: Given (+) vs Deductions (-) with inline Add Adjustment forms */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
          
          {/* Left Column: Given / Additions (+) */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #a7f3d0', overflow: 'hidden' }}>
            <div style={{ background: '#ecfdf5', padding: '10px 14px', borderBottom: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#047857' }}>Given / Additions (+)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: '#d1fae5', color: '#065f46' }}>
                  {givenAdjs.length} Active
                </span>
                {!isRowLocked && showActions && (
                  <button
                    type="button"
                    onClick={() => openInlineAddForm('give')}
                    style={{
                      background: '#059669',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '5px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Plus size={12} /> Add Adjustment
                  </button>
                )}
              </div>
            </div>

            {/* Inline Addition Form */}
            {activeInlineForm === 'give' && (
              <div style={{ background: '#f0fdf4', padding: '12px 14px', borderBottom: '1px solid #bbf7d0' }}>
                <form onSubmit={handleAddCustomAdj} autoComplete="off">
                  <fieldset disabled={isRowLocked} style={{ border: 'none', padding: 0, margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#047857' }}>
                        {editingAdjId ? 'Edit Addition' : '+ Add Addition'}
                      </span>
                      {/* Repetition Radios */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Repetition:</span>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: editingAdjId ? 'not-allowed' : 'pointer' }}>
                          <input 
                            type="radio" 
                            name="inlineGiveRepetition" 
                            value="Repeated Monthly" 
                            checked={customAdjType === 'Repeated Monthly'} 
                            onChange={() => setCustomAdjType('Repeated Monthly')} 
                            disabled={editingAdjId !== null || isRowLocked} 
                          />
                          Repeat
                        </label>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: editingAdjId ? 'not-allowed' : 'pointer' }}>
                          <input 
                            type="radio" 
                            name="inlineGiveRepetition" 
                            value="One-Time" 
                            checked={customAdjType === 'One-Time'} 
                            onChange={() => setCustomAdjType('One-Time')} 
                            disabled={editingAdjId !== null || isRowLocked} 
                          />
                          One Time
                        </label>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Adjustment Name</label>
                        {customAdjLabel === 'Other Custom' ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <input 
                              type="text" 
                              disabled={isRowLocked}
                              value={customAdjOtherLabel} 
                              onChange={e => setCustomAdjOtherLabel(e.target.value)} 
                              placeholder="Custom Name" 
                              required 
                              style={{ flex: 1, padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }} 
                            />
                            <button 
                              type="button" 
                              disabled={isRowLocked}
                              onClick={() => setCustomAdjLabel('')} 
                              style={{ padding: '0 6px', fontSize: '10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f1f5f9', cursor: 'pointer' }} 
                              title="Back to list"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <select 
                            disabled={isRowLocked}
                            value={customAdjLabel} 
                            onChange={e => {
                              const val = e.target.value;
                              setCustomAdjLabel(val);
                              setCustomAdjAction('Give');
                              if (val === 'Bonus') {
                                setCustomAdjType('One-Time');
                              } else {
                                const dynamicAdj = adjustmentTypes.find(a => a.label === val);
                                if (dynamicAdj) {
                                  setCustomAdjType('One-Time');
                                }
                              }
                            }} 
                            required 
                            style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }}
                          >
                            <option value="">Select Addition</option>
                            <option value="Bonus">{baseColumns.bonus?.label || 'Bonus'}</option>
                            {adjustmentTypes
                              .filter(adj => adj.action === 'Add' || adj.action === 'Both')
                              .map(adj => (
                              <option key={adj.id} value={adj.label}>{adj.label}</option>
                            ))}
                            <option value="Other Custom">Other Custom...</option>
                          </select>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                          {customAdjType === 'Repeated Monthly' ? 'Monthly Add Amount' : 'Current Month Amount'}
                        </label>
                        <input 
                          type="number" 
                          disabled={isRowLocked}
                          value={customAdjAmount} 
                          onChange={e => setCustomAdjAmount(e.target.value)} 
                          placeholder="e.g. 500" 
                          required 
                          style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }} 
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Total Limit Amount (Optional)</label>
                        <input 
                          type="number" 
                          value={customAdjTotalLimit} 
                          onChange={e => setCustomAdjTotalLimit(e.target.value)} 
                          placeholder={customAdjType === 'Repeated Monthly' ? 'e.g. 5000' : 'N/A for One-Time'} 
                          disabled={customAdjType !== 'Repeated Monthly' || isRowLocked}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: customAdjType !== 'Repeated Monthly' ? '#f1f5f9' : '#fff' }} 
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Note (Optional)</label>
                        <input 
                          type="text" 
                          disabled={isRowLocked}
                          value={customAdjNotes} 
                          onChange={e => setCustomAdjNotes(e.target.value)} 
                          placeholder="Reason / Note" 
                          style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }} 
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button 
                        type="button" 
                        onClick={resetAdjForm} 
                        style={{ padding: '5px 12px', fontSize: '11px', color: '#64748b', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '5px', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        disabled={savingCustomAdj || isRowLocked} 
                        style={{ padding: '5px 14px', fontSize: '11px', fontWeight: 700, background: '#059669', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                      >
                        {savingCustomAdj ? 'Saving...' : editingAdjId ? 'Update Addition' : '+ Add Addition'}
                      </button>
                    </div>
                  </fieldset>
                </form>
              </div>
            )}

            <div style={{ padding: '14px', maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingAdjs ? (
                <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '20px' }}>Loading...</div>
              ) : givenAdjs.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '24px' }}>No additions given for this employee.</div>
              ) : (
                givenAdjs.map(adj => (
                  <div key={`${adj.repetition}-${adj.id}`} style={{ padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#047857', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {adj.custom_label}
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: adj.repetition === 'Repeated Monthly' ? '#dcfce7' : '#e0f2fe', color: '#065f46', fontWeight: 600 }}>
                          {adj.repetition === 'Repeated Monthly' ? 'Monthly' : 'One-Time'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                        Amount: <span style={{ fontWeight: 800, color: '#059669' }}>+{CURRENCY} {adj.amount}</span>
                        {adj.remaining_amount !== null && adj.remaining_amount !== undefined && ` | Limit: ${CURRENCY} ${adj.remaining_amount}`}
                        {adj.notes && ` | ${adj.notes}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        disabled={isRowLocked}
                        onClick={() => !isRowLocked && handleEditAdj(adj, adj.repetition)} 
                        style={{ 
                          background: '#fff', 
                          border: '1px solid #cbd5e1', 
                          borderRadius: '4px', 
                          cursor: isRowLocked ? 'not-allowed' : 'pointer', 
                          opacity: isRowLocked ? 0.35 : 1,
                          color: isRowLocked ? '#94a3b8' : '#3b82f6', 
                          padding: '4px 6px' 
                        }} 
                        title={isRowLocked ? "Record is locked. Please unlock to edit." : "Edit"}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        disabled={isRowLocked}
                        onClick={() => !isRowLocked && setConfirmDelete({ isOpen: true, id: adj.id, type: adj.repetition })} 
                        style={{ 
                          background: '#fff', 
                          border: '1px solid #fecaca', 
                          borderRadius: '4px', 
                          cursor: isRowLocked ? 'not-allowed' : 'pointer', 
                          opacity: isRowLocked ? 0.35 : 1,
                          color: isRowLocked ? '#94a3b8' : '#ef4444', 
                          padding: '4px 6px' 
                        }} 
                        title={isRowLocked ? "Record is locked. Please unlock to delete." : "Delete"}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Deductions / Cuts (-) */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #fecaca', overflow: 'hidden' }}>
            <div style={{ background: '#fef2f2', padding: '10px 14px', borderBottom: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#b91c1c' }}>Deductions / Cuts (-)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: '#fee2e2', color: '#991b1b' }}>
                  {deductAdjs.length} Active
                </span>
                {!isRowLocked && showActions && (
                  <button
                    type="button"
                    onClick={() => openInlineAddForm('deduct')}
                    style={{
                      background: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '5px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Plus size={12} /> Add Adjustment
                  </button>
                )}
              </div>
            </div>

            {/* Inline Deduction Form */}
            {activeInlineForm === 'deduct' && (
              <div style={{ background: '#fff5f5', padding: '12px 14px', borderBottom: '1px solid #fecaca' }}>
                <form onSubmit={handleAddCustomAdj} autoComplete="off">
                  <fieldset disabled={isRowLocked} style={{ border: 'none', padding: 0, margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#b91c1c' }}>
                        {editingAdjId ? 'Edit Deduction' : '+ Add Deduction'}
                      </span>
                      {/* Repetition Radios */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Repetition:</span>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: editingAdjId ? 'not-allowed' : 'pointer' }}>
                          <input 
                            type="radio" 
                            name="inlineDeductRepetition" 
                            value="Repeated Monthly" 
                            checked={customAdjType === 'Repeated Monthly'} 
                            onChange={() => setCustomAdjType('Repeated Monthly')} 
                            disabled={editingAdjId !== null || isRowLocked} 
                          />
                          Repeat
                        </label>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: editingAdjId ? 'not-allowed' : 'pointer' }}>
                          <input 
                            type="radio" 
                            name="inlineDeductRepetition" 
                            value="One-Time" 
                            checked={customAdjType === 'One-Time'} 
                            onChange={() => setCustomAdjType('One-Time')} 
                            disabled={editingAdjId !== null || isRowLocked} 
                          />
                          One Time
                        </label>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Adjustment Name</label>
                        {customAdjLabel === 'Other Custom' ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <input 
                              type="text" 
                              disabled={isRowLocked}
                              value={customAdjOtherLabel} 
                              onChange={e => setCustomAdjOtherLabel(e.target.value)} 
                              placeholder="Custom Name" 
                              required 
                              style={{ flex: 1, padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }} 
                            />
                            <button 
                              type="button" 
                              disabled={isRowLocked}
                              onClick={() => setCustomAdjLabel('')} 
                              style={{ padding: '0 6px', fontSize: '10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f1f5f9', cursor: 'pointer' }} 
                              title="Back to list"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <select 
                            disabled={isRowLocked}
                            value={customAdjLabel} 
                            onChange={e => {
                              const val = e.target.value;
                              setCustomAdjLabel(val);
                              setCustomAdjAction('Deduct');
                              if (val === 'Advance Salary / Loan' || val === 'Internet' || val === 'Kafalat') {
                                setCustomAdjType('Repeated Monthly');
                              } else {
                                const dynamicAdj = adjustmentTypes.find(a => a.label === val);
                                if (dynamicAdj) {
                                  setCustomAdjType('One-Time');
                                }
                              }
                            }} 
                            required 
                            style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }}
                          >
                            <option value="">Select Deduction</option>
                            <option value="Advance Salary / Loan">{baseColumns.this_month_adv?.label || 'This M. Adv'}</option>
                            <option value="Internet">{baseColumns.internet?.label || 'Internet'}</option>
                            <option value="Kafalat">{baseColumns.kafalat?.label || 'Kafalat'}</option>
                            {adjustmentTypes
                              .filter(adj => adj.action === 'Deduct' || adj.action === 'Both')
                              .map(adj => (
                              <option key={adj.id} value={adj.label}>{adj.label}</option>
                            ))}
                            <option value="Other Custom">Other Custom...</option>
                          </select>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                          {customAdjType === 'Repeated Monthly' ? 'Monthly Cut Amount' : 'Current Month Amount'}
                        </label>
                        <input 
                          type="number" 
                          disabled={isRowLocked}
                          value={customAdjAmount} 
                          onChange={e => setCustomAdjAmount(e.target.value)} 
                          placeholder="e.g. 500" 
                          required 
                          style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }} 
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Total Limit Amount (Optional)</label>
                        <input 
                          type="number" 
                          value={customAdjTotalLimit} 
                          onChange={e => setCustomAdjTotalLimit(e.target.value)} 
                          placeholder={customAdjType === 'Repeated Monthly' ? 'e.g. 5000' : 'N/A for One-Time'} 
                          disabled={customAdjType !== 'Repeated Monthly' || isRowLocked}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: customAdjType !== 'Repeated Monthly' ? '#f1f5f9' : '#fff' }} 
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Note (Optional)</label>
                        <input 
                          type="text" 
                          disabled={isRowLocked}
                          value={customAdjNotes} 
                          onChange={e => setCustomAdjNotes(e.target.value)} 
                          placeholder="Reason / Note" 
                          style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }} 
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button 
                        type="button" 
                        onClick={resetAdjForm} 
                        style={{ padding: '5px 12px', fontSize: '11px', color: '#64748b', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '5px', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        disabled={savingCustomAdj || isRowLocked} 
                        style={{ padding: '5px 14px', fontSize: '11px', fontWeight: 700, background: '#dc2626', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                      >
                        {savingCustomAdj ? 'Saving...' : editingAdjId ? 'Update Deduction' : '+ Add Deduction'}
                      </button>
                    </div>
                  </fieldset>
                </form>
              </div>
            )}

            <div style={{ padding: '14px', maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingAdjs ? (
                <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '20px' }}>Loading...</div>
              ) : deductAdjs.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '24px' }}>No deductions for this employee.</div>
              ) : (
                deductAdjs.map(adj => (
                  <div key={`${adj.repetition}-${adj.id}`} style={{ padding: '10px 12px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {adj.custom_label}
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: adj.repetition === 'Repeated Monthly' ? '#fee2e2' : '#fef3c7', color: '#991b1b', fontWeight: 600 }}>
                          {adj.repetition === 'Repeated Monthly' ? 'Monthly' : 'One-Time'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                        Amount: <span style={{ fontWeight: 800, color: '#dc2626' }}>-{CURRENCY} {adj.amount}</span>
                        {adj.remaining_amount !== null && adj.remaining_amount !== undefined && ` | Limit: ${CURRENCY} ${adj.remaining_amount}`}
                        {adj.notes && ` | ${adj.notes}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        disabled={isRowLocked}
                        onClick={() => !isRowLocked && handleEditAdj(adj, adj.repetition)} 
                        style={{ 
                          background: '#fff', 
                          border: '1px solid #cbd5e1', 
                          borderRadius: '4px', 
                          cursor: isRowLocked ? 'not-allowed' : 'pointer', 
                          opacity: isRowLocked ? 0.35 : 1,
                          color: isRowLocked ? '#94a3b8' : '#3b82f6', 
                          padding: '4px 6px' 
                        }} 
                        title={isRowLocked ? "Record is locked. Please unlock to edit." : "Edit"}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        disabled={isRowLocked}
                        onClick={() => !isRowLocked && setConfirmDelete({ isOpen: true, id: adj.id, type: adj.repetition })} 
                        style={{ 
                          background: '#fff', 
                          border: '1px solid #fecaca', 
                          borderRadius: '4px', 
                          cursor: isRowLocked ? 'not-allowed' : 'pointer', 
                          opacity: isRowLocked ? 0.35 : 1,
                          color: isRowLocked ? '#94a3b8' : '#ef4444', 
                          padding: '4px 6px' 
                        }} 
                        title={isRowLocked ? "Record is locked. Please unlock to delete." : "Delete"}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* 5. Monthly Attendance Calendar Breakdown (Color-coded grid & Summary) */}
        {(() => {
          const breakdown = targetEmpData.daily_breakdown || [];
          const summary = targetEmpData.calendar_summary || {};
          const otMins = summary.total_overtime_minutes || 0;
          const shortMins = summary.total_shortage_minutes || 0;
          const netMins = summary.net_minutes !== undefined ? summary.net_minutes : (otMins - shortMins);
          const absentDays = summary.absent_days !== undefined ? summary.absent_days : (targetEmpData.absents || 0);
          const targetHours = summary.target_hours || targetEmpData.shift_hours || 12;

          return (
            <div style={{
              background: '#0b1329',
              borderRadius: '12px',
              padding: isMobile ? '12px' : '16px',
              marginTop: '14px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              {/* Header Summary */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ color: '#10b981', fontSize: isMobile ? '13px' : '14px', fontWeight: 800 }}>
                    Overtime {formatDuration(otMins)}
                  </span>
                  <span style={{ color: '#ef4444', fontSize: isMobile ? '13px' : '14px', fontWeight: 800 }}>
                    Shortage {formatDuration(shortMins)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: '#f8fafc', fontSize: isMobile ? '12px' : '13px', fontWeight: 700 }}>
                      Absent {absentDays} days
                    </span>
                    <span style={{ color: '#f8fafc', fontSize: isMobile ? '12px' : '13px', fontWeight: 800 }}>
                      Net {netMins >= 0 ? '+' : '-'}{formatDuration(Math.abs(netMins))}
                    </span>
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                    Target {targetHours}h per day
                  </span>
                </div>
              </div>

              {/* Day Cards Grid (3 columns on mobile, auto-fill on desktop) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(95px, 1fr))',
                gap: '8px',
                marginBottom: '14px'
              }}>
                {breakdown.map((dayItem) => {
                  let cardBg = '#f1f5f9';
                  let textColor = '#0f172a';
                  let subColor = '#475569';
                  let diffLabel = '';

                  if (dayItem.isFuture) {
                    cardBg = 'rgba(255, 255, 255, 0.05)';
                    textColor = '#94a3b8';
                    subColor = '#64748b';
                    diffLabel = '--';
                  } else if (dayItem.status === 'Holiday') {
                    cardBg = '#e0e7ff';
                    textColor = '#3730a3';
                    subColor = '#4338ca';
                    diffLabel = 'Holiday';
                  } else if (dayItem.status === 'Leave') {
                    cardBg = '#fef3c7';
                    textColor = '#92400e';
                    subColor = '#b45309';
                    diffLabel = 'Leave';
                  } else if (dayItem.status === 'Absent' || (dayItem.hours_worked === 0 && !dayItem.isFuture)) {
                    cardBg = '#fee2e2';
                    textColor = '#991b1b';
                    subColor = '#dc2626';
                    diffLabel = 'Absent';
                  } else {
                    const ot = dayItem.ot_minutes || 0;
                    const sh = dayItem.short_minutes || 0;

                    if (ot > 0) {
                      cardBg = ot >= 90 ? '#34d399' : '#a7f3d0';
                      textColor = '#064e3b';
                      subColor = '#065f46';
                      diffLabel = `+${formatDuration(ot)} OT`;
                    } else if (sh > 0) {
                      if (sh <= 60) {
                        cardBg = '#f8fafc';
                        textColor = '#0f172a';
                        subColor = '#475569';
                      } else if (sh <= 150) {
                        cardBg = '#fed7aa';
                        textColor = '#7c2d12';
                        subColor = '#9a3412';
                      } else {
                        cardBg = '#fecdd3';
                        textColor = '#881337';
                        subColor = '#9f1239';
                      }
                      diffLabel = `-${formatDuration(sh)} Short`;
                    } else {
                      cardBg = '#bbf7d0';
                      textColor = '#064e3b';
                      subColor = '#065f46';
                      diffLabel = '+00h 00m OT';
                    }
                  }

                  return (
                    <div
                      key={dayItem.date}
                      style={{
                        background: cardBg,
                        borderRadius: '8px',
                        padding: '8px 6px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '66px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)'
                      }}
                    >
                      <span style={{ fontSize: '10px', fontWeight: 700, color: subColor, display: 'block', lineHeight: 1 }}>
                        {dayItem.formattedDate}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 900, color: textColor, margin: '4px 0', lineHeight: 1.1 }}>
                        {dayItem.isFuture ? '--' : dayItem.hours_worked > 0 ? formatDuration(dayItem.hours_worked * 60) : '00h 00m'}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: subColor, display: 'block', lineHeight: 1, whiteSpace: 'nowrap' }}>
                        {diffLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '16px', flexWrap: 'wrap', fontSize: '11px', color: '#94a3b8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#34d399' }}></div>
                  <span>Overtime</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#f8fafc' }}></div>
                  <span>Short up to 1h</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#fed7aa' }}></div>
                  <span>Short 1h–2h30m</span>
                </div>
              </div>
            </div>
          );
        })()}
      </>
    );
  };

  return (
    <div className="payroll-page" style={{ padding: '0 4px 12px 4px', maxWidth: '100%', margin: '0 auto', fontFamily: 'var(--font-family)', background: 'var(--background)' }}>
      {/* Top Controls Bar */}
      <div style={{ 
        background: 'var(--surface)', 
        padding: '8px 12px', 
        borderRadius: '10px', 
        border: '1px solid var(--surface-2)', 
        marginBottom: '10px', 
        display: 'flex', 
        gap: '10px', 
        flexWrap: 'wrap', 
        alignItems: 'center', 
        boxShadow: 'var(--shadow-sm)' 
      }}>
        {/* 1. Search Bar */}
        <div style={{ position: 'relative', minWidth: '180px', flex: '1 1 200px', maxWidth: '340px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search by name or ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1px solid var(--surface-2)', background: 'var(--background)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none' }}
          />
        </div>

        {/* 2. Switching Button: Sheet View vs View Detail */}
        <div style={{ display: 'inline-flex', background: 'var(--surface-2)', padding: '3px', borderRadius: '8px', border: '1px solid var(--surface-2)', gap: '2px', flexShrink: 0 }}>
          <button 
            type="button"
            onClick={() => setViewMode('sheet')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: viewMode === 'sheet' ? 'var(--primary)' : 'transparent',
              color: viewMode === 'sheet' ? '#000' : 'var(--text-secondary)',
              boxShadow: viewMode === 'sheet' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Table size={14} />
            Sheet View
          </button>
          <button 
            type="button"
            onClick={() => {
              setViewMode('detail');
              if (!isMobile && !selectedDetailEmpId && filteredEmployees.length > 0) {
                handleSelectDetailEmp(filteredEmployees[0]);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: viewMode === 'detail' ? 'var(--primary)' : 'transparent',
              color: viewMode === 'detail' ? '#000' : 'var(--text-secondary)',
              boxShadow: viewMode === 'detail' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={14} />
            View Detail
          </button>
        </div>

        {/* 3. Branch / Restaurant Filter: ALL, R1, R2, R3 */}
        <div style={{ display: 'inline-flex', background: 'var(--surface-2)', padding: '3px', borderRadius: '8px', border: '1px solid var(--surface-2)', gap: '2px', flexShrink: 0 }}>
          {['ALL', 'R1', 'R2', 'R3'].map(opt => {
            const isActive = selectedBranchFilter === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSelectedBranchFilter(opt)}
                style={{
                  padding: '5px 9px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#000' : 'var(--text-secondary)',
                  boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
                  transition: 'all 0.15s ease',
                  letterSpacing: '0.3px',
                  lineHeight: 1
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {/* 4. Month Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Month:</label>
          <input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--surface-2)', background: 'var(--background)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', fontWeight: 600, cursor: 'pointer' }}
          />
        </div>

        {/* Action Buttons & Refresh Button on Right */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
          {showActions && (
            <>
              <button 
                onClick={() => setShowSalaryModal(true)}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <Banknote size={15} style={{ color: 'var(--primary)' }} />
                Manage Salary
              </button>
              <button 
                onClick={() => setShowAdjustmentsModal(true)}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <Settings size={15} />
                Manage Columns
              </button>
              {viewMode === 'sheet' && (
                <button 
                  onClick={handleSaveAll}
                  disabled={savingAll}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(244, 180, 0, 0.2)', whiteSpace: 'nowrap' }}
                >
                  <Save size={15} />
                  {savingAll ? 'Saving...' : 'Save All'}
                </button>
              )}
            </>
          )}

          {/* 5. Separate Refresh Button: Sheet View vs Detail View */}
          {viewMode === 'sheet' ? (
            <button 
              type="button"
              onClick={handleRefreshSheet}
              disabled={refreshing || loading}
              title="Refresh Sheet View"
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '36px', 
                height: '36px', 
                borderRadius: '8px', 
                background: 'var(--surface-2)', 
                color: 'var(--text-primary)', 
                border: 'none', 
                cursor: (refreshing || loading) ? 'not-allowed' : 'pointer', 
                transition: 'all 0.2s', 
                flexShrink: 0
              }}
            >
              <RefreshCw size={16} className={(refreshing || loading) ? 'spin' : ''} />
            </button>
          ) : (
            <button 
              type="button"
              onClick={handleRefreshDetail}
              disabled={refreshing || loading}
              title="Refresh Detail View"
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '36px', 
                height: '36px', 
                borderRadius: '8px', 
                background: 'var(--surface-2)', 
                color: 'var(--text-primary)', 
                border: 'none', 
                cursor: (refreshing || loading) ? 'not-allowed' : 'pointer', 
                transition: 'all 0.2s', 
                flexShrink: 0
              }}
            >
              <RefreshCw size={16} className={(refreshing || loading) ? 'spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Sheet View */}
      {viewMode === 'sheet' && (
        <>
          {/* Mobile Card / Table Toggle */}
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '2px 4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)' }}>
                {filteredEmployees.length} Employees
              </span>
              <div style={{ display: 'inline-flex', background: 'var(--surface-2)', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                <button 
                  onClick={() => setMobileSheetViewMode('cards')} 
                  style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: 'none', background: mobileSheetViewMode === 'cards' ? 'var(--primary)' : 'transparent', color: mobileSheetViewMode === 'cards' ? '#000' : 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Cards
                </button>
                <button 
                  onClick={() => setMobileSheetViewMode('table')} 
                  style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: 'none', background: mobileSheetViewMode === 'table' ? 'var(--primary)' : 'transparent', color: mobileSheetViewMode === 'table' ? '#000' : 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Table
                </button>
              </div>
            </div>
          )}

          {isMobile && mobileSheetViewMode === 'cards' ? (
            /* Mobile Card View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredEmployees.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '10px' }}>
                  No payroll records found for this month.
                </div>
              ) : (
                filteredEmployees.map(item => {
                  const cash = parseFloat(item.cash_paid || 0);
                  const bank = parseFloat(item.bank_paid || 0);
                  const totalPaid = Math.round((cash + bank) * 100) / 100;
                  const rem = Math.round((parseFloat(item.net_salary || 0) - totalPaid) * 100) / 100;
                  const isPaid = item.status === 'Paid' || (totalPaid > 0 && rem <= 0);
                  const isPartial = !isPaid && totalPaid > 0 && rem > 0;

                  return (
                  <div key={item.id} style={{ 
                    background: isPaid ? '#f0fdf4' : isPartial ? '#eff6ff' : 'var(--surface)', 
                    border: '1.5px solid ' + (isPaid ? '#bbf7d0' : isPartial ? '#bfdbfe' : 'var(--surface-2)'), 
                    borderRadius: '10px', 
                    padding: '12px', 
                    boxShadow: 'var(--shadow-sm)' 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ID: {item.employee_id} • {item.role || 'Staff'}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {parseFloat(item.carried_forward_to_next || 0) > 0 && (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#fff7ed',
                            color: '#c2410c',
                            border: '1px solid #fed7aa',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}>
                            <ArrowRightCircle size={10} color="#ea580c" />
                            <span>Fwd: {parseFloat(item.carried_forward_to_next).toFixed(2)}</span>
                          </span>
                        )}
                        <span style={{ 
                          fontSize: '10px', 
                          fontWeight: 700, 
                          padding: '2px 8px', 
                          borderRadius: '4px', 
                          background: isPaid ? '#ecfdf5' : isPartial ? '#dbeafe' : '#fffbeb',
                          color: isPaid ? '#059669' : isPartial ? '#1d4ed8' : '#d97706',
                          border: '1px solid ' + (isPaid ? '#a7f3d0' : isPartial ? '#93c5fd' : '#fde68a')
                        }}>
                          {isPaid ? 'Paid' : isPartial ? 'Partial' : 'Pending'}
                        </span>
                      </div>
                    </div>

                    {/* Attendance Badges */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 6px', borderRadius: '4px' }}>P:{item.presents || 0}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px' }}>A:{item.absents || 0}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px' }}>L:{item.leaves || 0}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '4px' }}>H:{item.holidays || 0}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '1px 6px', borderRadius: '4px' }}>OOT:{item.only_overtime_days || 0}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '1px 6px', borderRadius: '4px' }}>Late:{item.late_days || 0}</span>
                    </div>

                    {/* Financial Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Salary</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{CURRENCY} {item.base_salary || 0}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Payable</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#dc2626' }}>{CURRENCY} {Number(item.payable_salary !== undefined ? item.payable_salary : (item.base_salary - (item.deductions || 0))).toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Net Pay</div>
                        <div style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>{CURRENCY} {Number(item.net_salary || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>Remaining</div>
                        {(() => {
                          const cash = parseFloat(item.cash_paid || 0);
                          const bank = parseFloat(item.bank_paid || 0);
                          const totalPaid = Math.round((cash + bank) * 100) / 100;
                          const rem = Math.round((parseFloat(item.net_salary || 0) - totalPaid) * 100) / 100;
                          return (
                            <div style={{ fontSize: '13px', fontWeight: 900, color: rem > 0 ? '#ea580c' : rem < 0 ? '#0284c7' : '#16a34a' }}>
                              {CURRENCY} {rem.toFixed(2)}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button 
                          onClick={() => {
                            handleSelectDetailEmp(item);
                            setViewMode('detail');
                          }}
                          style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-dark, #b45309)', background: '#fef3c7', border: '1px solid #fde68a', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer' }}
                        >
                          View / Edit Adjustments →
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintSalarySlip(item)}
                          style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 700 }}
                          title="Print Salary Slip"
                        >
                          <Printer size={12} /> Slip
                        </button>
                      </div>
                      {showActions && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {(() => {
                            const cash = parseFloat(item.cash_paid || 0);
                            const bank = parseFloat(item.bank_paid || 0);
                            const totalPaid = Math.round((cash + bank) * 100) / 100;
                            const rem = Math.round((parseFloat(item.net_salary || 0) - totalPaid) * 100) / 100;
                            if (rem > 0) {
                              return (
                                <button
                                  type="button"
                                  disabled={savingCarryForwardId === item.id}
                                  onClick={() => handleCarryForward(item)}
                                  style={{
                                    background: '#fff7ed',
                                    border: '1px solid #fdba74',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    color: '#c2410c',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                  title={`Carry forward remaining ${CURRENCY} ${rem.toFixed(2)} to next month`}
                                >
                                  {savingCarryForwardId === item.id ? <RefreshCw size={11} className="spin" /> : <ArrowRightCircle size={11} />}
                                  Carry
                                </button>
                              );
                            }
                            return null;
                          })()}
                          {(item.status === 'Paid' && !unlockedRowIds.has(item.id)) ? (
                            <button 
                              type="button"
                              onClick={() => setUnlockPromptEmp(item)}
                              style={{ padding: '5px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '6px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                              title="Click to unlock this record"
                            >
                              <Lock size={11} style={{ color: '#d97706' }} />
                              Locked
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <button 
                                type="button"
                                onClick={() => handlePayNow(item.id)}
                                disabled={payingRowId === item.id || savingRowId === item.id}
                                style={{ padding: '5px 10px', fontSize: '11px', fontWeight: 800, borderRadius: '6px', background: '#16a34a', color: '#fff', border: 'none', cursor: (payingRowId === item.id || savingRowId === item.id) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                title="Pay Now and set status to Paid"
                              >
                                {payingRowId === item.id ? <RefreshCw size={11} className="spin" /> : <CheckCircle size={11} />}
                                Pay
                              </button>
                              <button 
                                onClick={() => handleSaveRow(item.id)}
                                disabled={savingRowId === item.id || payingRowId === item.id}
                                className="btn btn-primary"
                                style={{ padding: '5px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '6px', cursor: (savingRowId === item.id || payingRowId === item.id) ? 'not-allowed' : 'pointer' }}
                              >
                                {savingRowId === item.id ? '...' : 'Save'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
              )}
            </div>
          ) : (
            /* Spreadsheet View (Desktop and Table Mode) */
      <div style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        
        {/* Table Container with Horizontal Scroll - Height expanded by 1 row */}
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 175px)', overflowY: 'auto' }}>
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--surface)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <tr>
                <th style={{ ...stickyStyle, left: 0, zIndex: 30, padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employee</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Attendance</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overtime (±)</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expected</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actual</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Salary</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payable</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: '#6d28d9', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#ede9fe' }} title="Previous Month Remaining Salary / Balance">Prev M. Remaining</th>
                
                {/* Default Editable Columns */}
                {Object.entries(baseColumns).map(([key, config]) => !config.hidden && (
                  <th key={key} style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: config.bg }}>{config.label} ({config.action === 'Add' || config.action === 'Give' ? '+' : config.action === 'Deduct' ? '-' : '±'})</th>
                ))}

                {/* Dynamic Editable Columns */}
                {adjustmentTypes.map(adj => !hiddenDynamicCols[adj.id] && (
                  <th key={adj.id} style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: adj.action === 'Add' ? 'var(--green)' : adj.action === 'Deduct' ? '#ef4444' : 'var(--primary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: adj.action === 'Add' ? '#dcfce7' : adj.action === 'Deduct' ? '#fee2e2' : '#f3e8ff' }}>
                    {adj.label} ({adj.action === 'Add' ? '+' : adj.action === 'Deduct' ? '-' : '±'})
                  </th>
                ))}
                
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: '#b45309', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#fef3c7' }}>Total Adj (±)</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--primary)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f0fdf4' }}>Net Pay</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: '#0369a1', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#e0f2fe' }}>Cash Paid</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: '#4338ca', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#e0e7ff' }}>Bank Paid</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: '#c2410c', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#ffedd5' }}>Remaining</th>
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                {showActions && <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={20 + adjustmentTypes.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', border: '3px solid var(--surface-2)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '28px', height: '28px' }} />
                    Calculating Payroll...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={20 + adjustmentTypes.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No payroll records found for this month.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((item, index) => {
                  const baseSal = parseFloat(item.base_salary || 0);
                  const payable = parseFloat(item.payable_salary !== undefined ? item.payable_salary : (baseSal - parseFloat(item.deductions || 0)));
                  const payableDiff = Math.round((payable - baseSal) * 100) / 100;
                  const isRowLocked = item.status === 'Paid' && !unlockedRowIds.has(item.id);
                  const totalAdj = calculateTotalAdjustments(item);

                  const cash = parseFloat(item.cash_paid || 0);
                  const bank = parseFloat(item.bank_paid || 0);
                  const totalPaid = Math.round((cash + bank) * 100) / 100;
                  const rem = Math.round((parseFloat(item.net_salary || 0) - totalPaid) * 100) / 100;
                  const isPaid = item.status === 'Paid' || (totalPaid > 0 && rem <= 0);
                  const isPartial = !isPaid && totalPaid > 0 && rem > 0;

                  let rowBg = index % 2 === 0 ? 'var(--white)' : 'var(--surface)';
                  if (isPaid) {
                    rowBg = index % 2 === 0 ? '#f0fdf4' : '#ecfdf5';
                  } else if (isPartial) {
                    rowBg = index % 2 === 0 ? '#eff6ff' : '#e0f2fe';
                  }

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--surface-2)', background: rowBg, transition: 'background 0.2s', ...(isRowLocked ? { opacity: 0.88 } : {}) }}>
                      <td 
                        onClick={() => openEmployeeModal(item)}
                        style={{ ...stickyStyle, left: 0, zIndex: 10, background: rowBg, padding: '8px', borderRight: '1px solid var(--surface-2)', cursor: 'pointer' }}
                        className="employee-cell-hover"
                      >
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {item.name}
                          {item.status === 'Paid' && <Lock size={11} style={{ color: '#64748b' }} title="Locked (Paid)" />}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{item.employee_id}</div>
                      </td>
                      <td style={{ padding: '8px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--green)' }}>P:{item.presents} </span>
                        <span style={{ color: '#EF4444' }}>A:{item.absents} </span>
                        <span style={{ color: '#F97316' }}>L:{item.leaves} </span><br/>
                        <span style={{ color: 'var(--primary)' }}>H:{item.holidays} </span>
                        <span style={{ color: '#8b5cf6', fontWeight: 700 }}>OOT:{item.only_overtime_days || 0}</span>
                      </td>
                      <td style={{ padding: '8px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {item.net_overtime_hours > 0 ? (
                          <span style={{ color: 'var(--green)' }}>
                            +{formatDuration(Math.round(item.net_overtime_hours * 60))}
                          </span>
                        ) : item.net_overtime_hours < 0 ? (
                          <span style={{ color: '#ef4444' }}>
                            -{formatDuration(Math.round(Math.abs(item.net_overtime_hours) * 60))}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>--</span>
                        )}
                      </td>
                      <td style={{ padding: '8px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {formatDuration(item.expected_minutes !== undefined ? item.expected_minutes : item.expected_hours * 60)}
                      </td>
                      {(() => {
                        const reqMins = item.req_duty_hours !== undefined ? Math.round(item.req_duty_hours * 60) : item.expected_minutes;
                        const actMins = item.actual_minutes !== undefined ? item.actual_minutes : Math.round(item.actual_hours * 60);
                        const isShort = actMins < reqMins;
                        return (
                          <td style={{ padding: '8px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', color: isShort ? '#ef4444' : 'var(--green)' }}>
                            {isShort ? '-' : '+'}{formatDuration(actMins)}
                          </td>
                        );
                      })()}
                      <td style={{ padding: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {Number(item.base_salary || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px', fontSize: '12px', fontWeight: 700, color: payableDiff < 0 ? '#ef4444' : payableDiff > 0 ? 'var(--green)' : 'inherit', whiteSpace: 'nowrap' }}>
                        {payable.toFixed(2)}
                        {payableDiff > 0 && <span style={{ fontSize: '9px', display: 'block', color: 'var(--green)' }}>(+{payableDiff.toFixed(2)})</span>}
                        {payableDiff < 0 && <span style={{ fontSize: '9px', display: 'block', color: '#ef4444' }}>({payableDiff.toFixed(2)})</span>}
                      </td>
                      
                      {/* Last Month Balance (Auto carryover from previous month) */}
                      <td style={{ padding: '8px', fontSize: '12px', fontWeight: 700, background: '#f5f3ff', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          {(() => {
                            const bal = parseFloat(item.last_month_balance || 0);
                            if (bal > 0) return <span style={{ color: 'var(--green)' }}>+{bal.toFixed(2)}</span>;
                            if (bal < 0) return <span style={{ color: '#ef4444' }}>{bal.toFixed(2)}</span>;
                            return <span style={{ color: 'var(--text-muted)' }}>0.00</span>;
                          })()}
                          {showActions && parseFloat(item.last_month_balance || 0) !== 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClearPastBalance(item.id, item.name);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#f97316',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                              title="Clear past balance to 0.00"
                            >
                              <RotateCcw size={11} />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Default Editables / Synced from Modal */}
                      {!baseColumns.this_month_adv.hidden && <td style={{ padding: '4px', background: baseColumns.this_month_adv.bg }}>
                        <input 
                          type="text" 
                          inputMode="decimal" 
                          disabled={isRowLocked} 
                          className="cell-input" 
                          style={{ opacity: isRowLocked ? 0.7 : 1, cursor: isRowLocked ? 'not-allowed' : 'text' }} 
                          value={item.this_month_adv} 
                          onChange={e => handleFieldChange(item.id, 'this_month_adv', e.target.value)} 
                        />
                      </td>}
                      {!baseColumns.bonus.hidden && <td style={{ padding: '4px', background: baseColumns.bonus.bg }}>
                        <input 
                          type="text" 
                          inputMode="decimal" 
                          disabled={isRowLocked} 
                          className="cell-input" 
                          style={{ opacity: isRowLocked ? 0.7 : 1, cursor: isRowLocked ? 'not-allowed' : 'text' }} 
                          value={item.bonus} 
                          onChange={e => handleFieldChange(item.id, 'bonus', e.target.value)} 
                        />
                      </td>}

                      {!baseColumns.internet.hidden && <td style={{ padding: '4px', background: baseColumns.internet.bg }}>
                        <input 
                          type="text" 
                          inputMode="decimal" 
                          disabled={isRowLocked} 
                          className="cell-input" 
                          style={{ opacity: isRowLocked ? 0.7 : 1, cursor: isRowLocked ? 'not-allowed' : 'text' }} 
                          value={item.internet} 
                          onChange={e => handleFieldChange(item.id, 'internet', e.target.value)} 
                        />
                      </td>}
                      {!baseColumns.kafalat.hidden && <td style={{ padding: '4px', background: baseColumns.kafalat.bg }}>
                        <input 
                          type="text" 
                          inputMode="decimal" 
                          disabled={isRowLocked} 
                          className="cell-input" 
                          style={{ opacity: isRowLocked ? 0.7 : 1, cursor: isRowLocked ? 'not-allowed' : 'text' }} 
                          value={item.kafalat} 
                          onChange={e => handleFieldChange(item.id, 'kafalat', e.target.value)} 
                        />
                      </td>}

                      {/* Dynamic Editables */}
                      {adjustmentTypes.map(adj => !hiddenDynamicCols[adj.id] && (
                        <td key={adj.id} style={{ padding: '4px', background: adj.action === 'Add' ? '#f0fdf4' : adj.action === 'Deduct' ? '#fef2f2' : '#f3e8ff' }}>
                          <input 
                            type="text" 
                            inputMode="decimal"
                            disabled={isRowLocked}
                            placeholder={adj.action === 'Both' ? '±0' : '0'}
                            className="cell-input" 
                            style={{ opacity: isRowLocked ? 0.7 : 1, cursor: isRowLocked ? 'not-allowed' : 'text' }}
                            value={item.dynamic_adjustments?.[adj.label] ?? 0} 
                            onChange={e => handleDynamicFieldChange(item.id, adj.label, e.target.value)} 
                          />
                        </td>
                      ))}
                      
                      {/* Total Adjustments (±) (Net Deductions / Additions) */}
                      <td style={{ padding: '8px', fontSize: '12px', fontWeight: 800, background: '#fffbeb', whiteSpace: 'nowrap' }}>
                        {totalAdj > 0 ? (
                          <span style={{ color: 'var(--green)' }}>+{totalAdj.toFixed(2)}</span>
                        ) : totalAdj < 0 ? (
                          <span style={{ color: '#ef4444' }}>{totalAdj.toFixed(2)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>0.00</span>
                        )}
                      </td>

                      {/* Net Pay */}
                      <td style={{ 
                        padding: '8px', 
                        fontSize: '13px', 
                        fontWeight: 800, 
                        color: item.net_salary < 0 ? '#dc2626' : 'var(--primary)', 
                        background: item.net_salary < 0 ? '#fef2f2' : '#f0fdf4', 
                        whiteSpace: 'nowrap' 
                      }}>
                        {item.net_salary.toFixed(2)}
                      </td>
                      
                      {/* Cash Paid */}
                      <td style={{ padding: '4px', background: '#f0f9ff' }}>
                        <input 
                          type="text" 
                          inputMode="decimal"
                          disabled={isRowLocked}
                          className="cell-input" 
                          style={{ fontWeight: 700, color: '#0369a1', opacity: isRowLocked ? 0.7 : 1, cursor: isRowLocked ? 'not-allowed' : 'text' }} 
                          value={item.cash_paid} 
                          onChange={e => handlePaidChange(item.id, 'cash_paid', e.target.value)} 
                        />
                      </td>

                      {/* Bank Paid */}
                      <td style={{ padding: '4px', background: '#eef2ff' }}>
                        <input 
                          type="text" 
                          inputMode="decimal"
                          disabled={isRowLocked}
                          className="cell-input" 
                          style={{ fontWeight: 700, color: '#4338ca', opacity: isRowLocked ? 0.7 : 1, cursor: isRowLocked ? 'not-allowed' : 'text' }} 
                          value={item.bank_paid} 
                          onChange={e => handlePaidChange(item.id, 'bank_paid', e.target.value)} 
                        />
                      </td>

                      {/* Remaining Salary */}
                      <td style={{ padding: '8px', fontSize: '12px', fontWeight: 800, background: '#fff7ed', whiteSpace: 'nowrap' }}>
                        {(() => {
                          const cash = parseFloat(item.cash_paid || 0);
                          const bank = parseFloat(item.bank_paid || 0);
                          const totalPaid = Math.round((cash + bank) * 100) / 100;
                          const rem = Math.round((parseFloat(item.net_salary || 0) - totalPaid) * 100) / 100;
                          if (rem > 0) {
                            return <span style={{ color: '#ea580c' }}>{rem.toFixed(2)}</span>;
                          } else if (rem < 0) {
                            return <span style={{ color: '#dc2626', fontWeight: 800 }} title="Negative Balance / Deductions exceed salary">{rem.toFixed(2)}</span>;
                          }
                          return <span style={{ color: '#16a34a' }}>0.00</span>;
                        })()}
                      </td>
                      
                      {/* Status */}
                      <td style={{ padding: '4px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                          <select 
                            className="cell-input" 
                            disabled={isRowLocked}
                            value={item.status || 'Pending'} 
                            onChange={e => handleTextChange(item.id, 'status', e.target.value)} 
                            style={{ 
                              width: '85px', 
                              fontWeight: 700, 
                              color: item.status === 'Paid' ? 'var(--green)' : item.status === 'Partial' ? '#2563eb' : '#d97706', 
                              opacity: isRowLocked ? 0.7 : 1, 
                              cursor: isRowLocked ? 'not-allowed' : 'pointer' 
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Partial">Partial</option>
                            <option value="Paid">Paid</option>
                          </select>
                          {parseFloat(item.carried_forward_to_next || 0) > 0 && (
                            <span 
                              style={{ 
                                fontSize: '9px', 
                                fontWeight: 800, 
                                color: '#c2410c', 
                                background: '#fff7ed', 
                                border: '1px solid #fed7aa', 
                                borderRadius: '3px', 
                                padding: '1px 4px', 
                                whiteSpace: 'nowrap',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                              title={`Carried forward to next month: ${CURRENCY} ${parseFloat(item.carried_forward_to_next).toFixed(2)}`}
                            >
                              ➔ Fwd: {parseFloat(item.carried_forward_to_next).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </td>

                      {showActions && (
                        <td style={{ padding: '4px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handlePrintSalarySlip(item)}
                              style={{
                                background: '#fff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                padding: '4px 6px',
                                cursor: 'pointer',
                                color: '#0284c7',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Print Salary Slip"
                            >
                              <Printer size={12} />
                            </button>
                            {(() => {
                              const cash = parseFloat(item.cash_paid || 0);
                              const bank = parseFloat(item.bank_paid || 0);
                              const totalPaid = Math.round((cash + bank) * 100) / 100;
                              const rem = Math.round((parseFloat(item.net_salary || 0) - totalPaid) * 100) / 100;
                              if (rem > 0) {
                                return (
                                  <button
                                    type="button"
                                    disabled={savingCarryForwardId === item.id}
                                    onClick={() => handleCarryForward(item)}
                                    style={{
                                      background: '#fff7ed',
                                      border: '1px solid #fdba74',
                                      borderRadius: '4px',
                                      padding: '4px 6px',
                                      cursor: 'pointer',
                                      color: '#c2410c',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}
                                    title={`Carry forward remaining ${CURRENCY} ${rem.toFixed(2)} to next month`}
                                  >
                                    {savingCarryForwardId === item.id ? <RefreshCw size={11} className="spin" /> : <ArrowRightCircle size={11} />}
                                  </button>
                                );
                              }
                              return null;
                            })()}
                            {isRowLocked ? (
                              <button 
                                type="button"
                                onClick={() => setUnlockPromptEmp(item)}
                                style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '4px', 
                                  padding: '4px 8px', 
                                  borderRadius: '4px', 
                                  fontSize: '11px', 
                                  fontWeight: 700, 
                                  background: '#fef3c7', 
                                  color: '#b45309', 
                                  border: '1px solid #fde68a', 
                                  cursor: 'pointer' 
                                }}
                                title="Record is marked as Paid and locked. Click to unlock."
                              >
                                <Lock size={11} style={{ color: '#d97706' }} />
                                Locked
                              </button>
                            ) : (
                              <>
                                <button 
                                  type="button"
                                  onClick={() => handlePayNow(item.id)}
                                  disabled={payingRowId === item.id || savingRowId === item.id}
                                  style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800, background: '#16a34a', color: '#fff', border: 'none', cursor: (payingRowId === item.id || savingRowId === item.id) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                  title="Pay Now and set status to Paid"
                                >
                                  {payingRowId === item.id ? <RefreshCw size={11} className="spin" /> : <CheckCircle size={11} />}
                                  Pay
                                </button>
                                <button 
                                  onClick={() => handleSaveRow(item.id)}
                                  disabled={savingRowId === item.id || payingRowId === item.id}
                                  className="btn btn-primary"
                                  style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: (savingRowId === item.id || payingRowId === item.id) ? 'not-allowed' : 'pointer' }}
                                >
                                  {savingRowId === item.id ? <RefreshCw size={12} className="spin" /> : <Save size={12} />}
                                  Save
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
          )}

        </>
      )}

      {/* Detail View (Master-Detail Full Page with Mobile Accordion) */}
      {viewMode === 'detail' && (
        isMobile ? (
          /* Mobile Accordion View: Click employee to expand details directly underneath */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '24px' }}>
            {/* Filter bar on mobile */}
            <div style={{ background: 'var(--surface)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text"
                  placeholder="Filter employee..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid var(--surface-2)', fontSize: '12px', background: 'var(--background)', color: 'var(--text-primary)', outline: 'none' }}
                />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '10px', background: 'var(--surface-2)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {filteredEmployees.length} Emps
              </span>
            </div>

            {/* List of Employees with Accordion Collapse/Expand */}
            {filteredEmployees.map(emp => {
              const isSelected = (currentEmpData?.id === emp.id);
              const cash = parseFloat(emp.cash_paid || 0);
              const bank = parseFloat(emp.bank_paid || 0);
              const totalPaid = Math.round((cash + bank) * 100) / 100;
              const rem = Math.round((parseFloat(emp.net_salary || 0) - totalPaid) * 100) / 100;
              const isPaid = emp.status === 'Paid' || (totalPaid > 0 && rem <= 0);
              const isPartial = !isPaid && totalPaid > 0 && rem > 0;

              let cardBg = isSelected ? '#fffbeb' : isPaid ? '#f0fdf4' : isPartial ? '#eff6ff' : 'var(--surface)';
              let border = isSelected ? '1.5px solid var(--primary, #f59e0b)' : isPaid ? '1px solid #bbf7d0' : isPartial ? '1px solid #bfdbfe' : '1px solid var(--surface-2)';

              return (
                <div 
                  key={emp.id}
                  data-mobile-card="true"
                  style={{
                    borderRadius: '10px',
                    border: border,
                    background: cardBg,
                    overflow: 'hidden',
                    boxShadow: isSelected ? '0 2px 10px rgba(245, 158, 11, 0.15)' : 'var(--shadow-sm)',
                    scrollMarginTop: '80px'
                  }}
                >
                  {/* Card Header (clickable) */}
                  <div 
                    onClick={(e) => {
                      if (isSelected) {
                        handleSelectDetailEmp(null);
                      } else {
                        handleSelectDetailEmp(emp);
                        const card = e.currentTarget.closest('[data-mobile-card]');
                        if (card) {
                          setTimeout(() => {
                            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                          }, 50);
                        }
                      }
                    }}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: cardBg,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: isSelected ? '#92400e' : 'var(--text-primary)' }}>
                        {emp.name}
                      </span>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 700, 
                        padding: '2px 7px', 
                        borderRadius: '4px',
                        background: isPaid ? '#ecfdf5' : isPartial ? '#dbeafe' : '#fffbeb',
                        color: isPaid ? '#059669' : isPartial ? '#1d4ed8' : '#d97706',
                        border: '1px solid ' + (isPaid ? '#a7f3d0' : isPartial ? '#93c5fd' : '#fde68a')
                      }}>
                        {isPaid ? 'Paid' : isPartial ? 'Partial' : 'Pending'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <span>ID: {emp.employee_id} • {emp.role || 'Staff'}</span>
                      <span style={{ fontWeight: 800, color: '#059669', fontSize: '12px' }}>{CURRENCY} {Number(emp.net_salary || 0).toFixed(2)}</span>
                    </div>

                    {/* Attendance Mini Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 5px', borderRadius: '4px' }}>P:{emp.presents || 0}</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 5px', borderRadius: '4px' }}>A:{emp.absents || 0}</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '1px 5px', borderRadius: '4px' }}>L:{emp.leaves || 0}</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 5px', borderRadius: '4px' }}>H:{emp.holidays || 0}</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '1px 5px', borderRadius: '4px' }}>OOT:{emp.only_overtime_days || 0}</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '1px 5px', borderRadius: '4px' }}>Late:{emp.late_days || 0}</span>
                      <span style={{ fontSize: '10px', color: '#b45309', marginLeft: 'auto', fontWeight: 700 }}>
                        {isSelected ? '▲ Hide Details' : '▼ View Details'}
                      </span>
                    </div>
                  </div>

                  {/* Inline Expanded Detail Section directly underneath */}
                  {isSelected && (
                    <div style={{ padding: '12px', borderTop: '1px solid var(--surface-2)', background: 'var(--white)' }}>
                      {renderEmployeeDetailBody(emp)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop Master-Detail Side-by-Side */
        <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch', height: 'calc(100vh - 175px)', overflow: 'hidden' }}>
          {/* Left Column: Employee List Sidebar */}
          <div style={{ 
            width: '280px', 
            flexShrink: 0, 
            background: 'var(--surface)', 
            borderRadius: '12px', 
            border: '1px solid var(--surface-2)', 
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '100%'
          }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--surface-2)', background: 'var(--white)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>Employees</span>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                  {filteredEmployees.length}
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text"
                  placeholder="Filter employee..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid var(--surface-2)', fontSize: '12px', background: 'var(--background)', color: 'var(--text-primary)', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
              {filteredEmployees.map(emp => {
                const isSelected = (currentEmpData?.id === emp.id);
                const cash = parseFloat(emp.cash_paid || 0);
                const bank = parseFloat(emp.bank_paid || 0);
                const totalPaid = Math.round((cash + bank) * 100) / 100;
                const rem = Math.round((parseFloat(emp.net_salary || 0) - totalPaid) * 100) / 100;
                const isPaid = emp.status === 'Paid' || (totalPaid > 0 && rem <= 0);
                const isPartial = !isPaid && totalPaid > 0 && rem > 0;

                let bg = isSelected ? '#fef3c7' : isPaid ? '#f0fdf4' : isPartial ? '#eff6ff' : 'transparent';
                let border = isSelected ? '1.5px solid #f59e0b' : isPaid ? '1px solid #bbf7d0' : isPartial ? '1px solid #bfdbfe' : '1px solid var(--surface-2)';

                return (
                  <div 
                    key={emp.id}
                    onClick={() => handleSelectDetailEmp(emp)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      marginBottom: '5px',
                      cursor: 'pointer',
                      background: bg,
                      border: border,
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: isSelected ? 800 : 700, color: isSelected ? '#92400e' : 'var(--text-primary)' }}>
                        {emp.name}
                      </span>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 700, 
                        padding: '1px 6px', 
                        borderRadius: '4px',
                        background: isPaid ? '#ecfdf5' : isPartial ? '#dbeafe' : '#fffbeb',
                        color: isPaid ? '#059669' : isPartial ? '#1d4ed8' : '#d97706',
                        border: '1px solid ' + (isPaid ? '#a7f3d0' : isPartial ? '#93c5fd' : '#fde68a')
                      }}>
                        {isPaid ? 'Paid' : isPartial ? 'Partial' : 'Pending'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <span>ID: {emp.employee_id}</span>
                      <span style={{ fontWeight: 700, color: '#059669' }}>{CURRENCY} {Number(emp.net_salary || 0).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Detail Page View */}
          <div style={{ 
            flex: 1, 
            minWidth: 0, 
            background: 'var(--white)', 
            borderRadius: '12px', 
            border: '1px solid var(--surface-2)', 
            boxShadow: 'var(--shadow-sm)', 
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden'
          }}>
            {currentEmpData ? (
              <>
                <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', background: '#fafafa', flexShrink: 0 }}>
                  {/* Left: Employee Info */}
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 2px 0', color: 'var(--text-primary)' }}>
                      {currentEmpData.name}
                    </h2>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      ID: {currentEmpData.employee_id} • Role: {currentEmpData.role} {currentEmpData.branch ? `• Branch: ${currentEmpData.branch}` : ''}
                    </div>
                  </div>

                  {/* Center: Attendance Badges in Middle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap', flex: '1 1 auto', margin: '0 10px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 6px', borderRadius: '5px' }} title="Presents">
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#047857' }}>P:</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669' }}>{currentEmpData.presents || 0}</span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fef2f2', border: '1px solid #fecaca', padding: '2px 6px', borderRadius: '5px' }} title="Absents">
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#b91c1c' }}>A:</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#dc2626' }}>{currentEmpData.absents || 0}</span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '5px' }} title="Leaves">
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#b45309' }}>L:</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#d97706' }}>{currentEmpData.leaves || 0}</span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 6px', borderRadius: '5px' }} title="Holidays">
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#1d4ed8' }}>H:</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb' }}>{currentEmpData.holidays || 0}</span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '2px 6px', borderRadius: '5px' }} title="Only Overtime Days">
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#6d28d9' }}>OOT:</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed' }}>{currentEmpData.only_overtime_days || 0}</span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fff7ed', border: '1px solid #fed7aa', padding: '2px 6px', borderRadius: '5px' }} title="Late Days">
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#c2410c' }}>Late:</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#ea580c' }}>{currentEmpData.late_days || 0}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '6px' }}>
                      <CalendarDays size={14} style={{ color: 'var(--primary, #d97706)' }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Month:</span>
                      <input 
                        type="month"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', padding: 0 }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRefreshDetail}
                      disabled={refreshing || loading}
                      title="Refresh Employee Detail"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#f1f5f9',
                        color: '#334155',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: (refreshing || loading) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <RefreshCw size={12} className={(refreshing || loading) ? 'spin' : ''} />
                      Refresh
                    </button>
                  </div>
                </div>

                <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                  {renderEmployeeDetailBody(currentEmpData)}
                </div>
              </>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Please select an employee from the left list.
              </div>
            )}
          </div>
        </div>
        )
      )}

      {/* Popup Modal for Sheet View */}
      {showEmpModal && currentEmpData && viewMode === 'sheet' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <div style={{ background: 'var(--white)', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-lg)' }}>
            {/* Modal Header */}
            <div style={{ position: 'sticky', top: 0, background: 'var(--white)', zIndex: 10, padding: '12px 20px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 2px 0', color: 'var(--text-primary)' }}>{currentEmpData.name}</h2>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ID: {currentEmpData.employee_id} • Role: {currentEmpData.role}</div>
              </div>

              {/* Attendance Badges in Center */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap', flex: '1 1 auto', margin: '0 10px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 6px', borderRadius: '5px' }} title="Presents">
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#047857' }}>P:</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669' }}>{currentEmpData.presents || 0}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fef2f2', border: '1px solid #fecaca', padding: '2px 6px', borderRadius: '5px' }} title="Absents">
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#b91c1c' }}>A:</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#dc2626' }}>{currentEmpData.absents || 0}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '5px' }} title="Leaves">
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#b45309' }}>L:</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#d97706' }}>{currentEmpData.leaves || 0}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 6px', borderRadius: '5px' }} title="Holidays">
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#1d4ed8' }}>H:</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb' }}>{currentEmpData.holidays || 0}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '2px 6px', borderRadius: '5px' }} title="Only Overtime Days">
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#6d28d9' }}>OOT:</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed' }}>{currentEmpData.only_overtime_days || 0}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fff7ed', border: '1px solid #fed7aa', padding: '2px 6px', borderRadius: '5px' }} title="Late Days">
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#c2410c' }}>Late:</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#ea580c' }}>{currentEmpData.late_days || 0}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', padding: '6px 12px', borderRadius: '10px' }}>
                  <CalendarDays size={18} style={{ color: 'var(--primary, #d97706)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Selected Month</span>
                    <input 
                      type="month" 
                      value={selectedMonth} 
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      style={{ border: 'none', background: 'transparent', fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', padding: 0 }}
                    />
                  </div>
                </div>

                <button onClick={() => { setShowEmpModal(false); setSelectedEmployeeForModal(null); }} style={{ background: 'var(--surface-2)', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Close Modal">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {renderEmployeeDetailBody(currentEmpData)}
            </div>
          </div>
        </div>
      )}

      {/* Unlock Salary Record Confirmation Modal */}
      {unlockPromptEmp && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001, padding: '16px' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Unlock size={24} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px', color: '#1e293b' }}>
              Unlock Salary Record?
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '22px', lineHeight: 1.5 }}>
              This record for <strong style={{ color: '#0f172a' }}>{unlockPromptEmp.name}</strong> is currently marked as <strong>Paid</strong> and locked.
              <br />
              Do you want to unlock this record to make edits?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button 
                type="button" 
                onClick={() => setUnlockPromptEmp(null)} 
                className="btn-secondary" 
                style={{ flex: 1, padding: '9px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const emp = unlockPromptEmp;
                  setUnlockedRowIds(prev => new Set(prev).add(emp.id));
                  setUnlockPromptEmp(null);
                  toast.success(`Record for ${emp.name} is now unlocked!`);
                }} 
                className="btn btn-primary" 
                style={{ flex: 1, padding: '9px 16px', borderRadius: '8px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Unlock size={15} />
                Unlock Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '12px', color: '#1e293b' }}>Confirm Deletion</h2>
            <p style={{ fontSize: '14px', color: '#475569', marginBottom: '24px' }}>Are you sure you want to delete this {confirmDelete.type} adjustment? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete({ isOpen: false, id: null, type: null })} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={executeDelete} className="btn" style={{ padding: '8px 16px', borderRadius: '8px', background: '#ef4444', color: '#fff', border: 'none' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Columns Modal */}
      {showAdjustmentsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>Manage Columns</h2>
              <button onClick={() => setShowAdjustmentsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            {/* Add New Type */}
            <form onSubmit={handleSaveAdjustmentType} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input type="text" value={newAdjLabel} onChange={e => setNewAdjLabel(e.target.value)} placeholder="New Column Name..." required style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
              <select value={newAdjAction} onChange={e => setNewAdjAction(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                <option value="Add">Add (+)</option>
                <option value="Deduct">Deduct (-)</option>
                <option value="Both">Both (±)</option>
              </select>
              <button type="submit" disabled={savingAdjType} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700 }}>
                {savingAdjType ? '...' : 'Add'}
              </button>
            </form>

            {/* List Existing Types */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', marginTop: '8px' }}>Standard Columns</div>
              {Object.entries(baseColumns).map(([key, config]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: config.hidden ? 'var(--surface)' : config.bg, border: '1px solid var(--surface-2)', borderRadius: '8px', opacity: config.hidden ? 0.6 : 1, position: 'relative' }}>
                  {editingStandardKey === key ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                      <input 
                        type="text" 
                        value={editStandardValue} 
                        onChange={e => setEditStandardValue(e.target.value)} 
                        style={{ flex: 1, padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--primary)' }} 
                        autoFocus
                      />
                      <button onClick={() => {
                        if (!editStandardValue.trim()) return toast.error('Label cannot be empty');
                        confirmAction('Are you sure you want to rename this column?', () => {
                          setBaseColumns(prev => ({ ...prev, [key]: { ...prev[key], label: editStandardValue.trim() } }));
                          setEditingStandardKey(null);
                        }, 'Rename');
                      }} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingStandardKey(null)} style={{ background: '#cbd5e1', color: '#1e293b', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: config.action === 'Add' ? 'var(--green)' : '#ef4444' }}>
                        {config.label} ({config.action}) {config.hidden && <span style={{ fontSize: '10px', color: '#64748b' }}>(Hidden)</span>}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ position: 'relative', display: 'inline-block', width: '32px', height: '18px', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={!config.hidden}
                            onChange={() => {
                              setBaseColumns(prev => ({ ...prev, [key]: { ...prev[key], hidden: !prev[key].hidden } }));
                              toast.success(config.hidden ? 'Column is now visible' : 'Column hidden');
                            }}
                            style={{ opacity: 0, width: 0, height: 0 }} 
                          />
                          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: !config.hidden ? 'var(--primary)' : '#cbd5e1', transition: '.3s', borderRadius: '34px' }}>
                            <span style={{ position: 'absolute', height: '14px', width: '14px', left: '2px', bottom: '2px', backgroundColor: 'white', transition: '.3s', borderRadius: '50%', transform: !config.hidden ? 'translateX(14px)' : 'translateX(0)' }} />
                          </span>
                        </label>
                        <button 
                          onClick={() => setOpenMenuId(openMenuId === key ? null : key)} 
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>
                      
                      {openMenuId === key && (
                        <div style={{ position: 'absolute', right: '12px', top: '100%', marginTop: '4px', background: '#fff', border: '1px solid var(--surface-2)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
                          <button 
                            onClick={() => { setEditingStandardKey(key); setEditStandardValue(config.label); setOpenMenuId(null); }} 
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}
                          >
                            <Edit2 size={14} /> Edit
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', marginTop: '16px' }}>Dynamic Columns</div>
              {adjustmentTypes.map(adj => (
                <div key={adj.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: '8px', position: 'relative' }}>
                  {editingDynamicAdjId === adj.id ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                      <input 
                        type="text" 
                        value={editAdjValue} 
                        onChange={e => setEditAdjValue(e.target.value)} 
                        style={{ flex: 1, padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--primary)' }} 
                        autoFocus
                      />
                      <button onClick={() => handleEditAdjustmentType(adj.id)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingDynamicAdjId(null)} style={{ background: '#cbd5e1', color: '#1e293b', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: adj.action === 'Add' ? 'var(--green)' : '#ef4444' }}>
                        {adj.label} ({adj.action}) {hiddenDynamicCols[adj.id] && <span style={{ fontSize: '10px', color: '#64748b' }}>(Hidden)</span>}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ position: 'relative', display: 'inline-block', width: '32px', height: '18px', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={!hiddenDynamicCols[adj.id]}
                            onChange={() => {
                              setHiddenDynamicCols(prev => ({ ...prev, [adj.id]: !prev[adj.id] }));
                              toast.success(hiddenDynamicCols[adj.id] ? 'Column is now visible' : 'Column hidden');
                            }}
                            style={{ opacity: 0, width: 0, height: 0 }} 
                          />
                          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: !hiddenDynamicCols[adj.id] ? 'var(--primary)' : '#cbd5e1', transition: '.3s', borderRadius: '34px' }}>
                            <span style={{ position: 'absolute', height: '14px', width: '14px', left: '2px', bottom: '2px', backgroundColor: 'white', transition: '.3s', borderRadius: '50%', transform: !hiddenDynamicCols[adj.id] ? 'translateX(14px)' : 'translateX(0)' }} />
                          </span>
                        </label>
                        <button 
                          onClick={() => setOpenMenuId(openMenuId === adj.id ? null : adj.id)} 
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>
                      
                      {openMenuId === adj.id && (
                        <div style={{ position: 'absolute', right: '36px', bottom: 'calc(100% - 10px)', background: '#fff', border: '1px solid var(--surface-2)', borderRadius: '8px', boxShadow: '0 -4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
                          <button 
                            onClick={() => { setEditingDynamicAdjId(adj.id); setEditAdjValue(adj.label); setOpenMenuId(null); }} 
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}
                          >
                            <Edit2 size={14} /> Edit
                          </button>
                          <button 
                            onClick={() => { handleDeleteAdjustmentType(adj.id); setOpenMenuId(null); }} 
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#ef4444' }}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {adjustmentTypes.length === 0 && <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center' }}>No dynamic columns added yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Leave Modal */}
      {showLeaveModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>Mark Leave</h2>
              <button onClick={() => setShowLeaveModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveLeave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <select value={leaveEmployeeId} onChange={e => setLeaveEmployeeId(e.target.value)} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                <option value="">Select Employee</option>
                {employeesList.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                <input type="checkbox" checked={leaveIsPaid} onChange={e => setLeaveIsPaid(e.target.checked)} />
                Is Paid Leave
              </label>
              <button type="submit" disabled={savingLeave} className="btn btn-primary" style={{ padding: '10px', borderRadius: '8px', background: 'var(--primary)', color: '#111', fontWeight: 700, border: 'none', marginTop: '8px' }}>
                {savingLeave ? 'Saving...' : 'Mark Leave'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Manage Salary Modal */}
      <ManageSalaryModal 
        isOpen={showSalaryModal}
        onClose={() => setShowSalaryModal(false)}
        onUpdated={() => loadPayroll(true)}
        month={selectedMonth}
      />

      {/* Unlock Paid Record Confirmation Modal */}
      {unlockPromptEmp && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '92%', maxWidth: '440px', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', border: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '10px', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Unlock Paid Record</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>{unlockPromptEmp.name} • {selectedMonth}</p>
              </div>
            </div>
            
            <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', color: '#92400e', lineHeight: 1.5, marginBottom: '20px' }}>
              <strong>Important:</strong> Unlocking this record will change its salary status from <strong style={{ color: '#047857' }}>Paid</strong> to <strong style={{ color: '#d97706' }}>Pending</strong> so that all columns, adjustments, and details can be edited.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                onClick={() => setUnlockPromptEmp(null)} 
                style={{ padding: '8px 16px', borderRadius: '7px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                disabled={savingRowId === unlockPromptEmp.id}
                onClick={() => handleExecuteUnlock(unlockPromptEmp)} 
                style={{ padding: '8px 18px', borderRadius: '7px', background: 'var(--primary)', border: 'none', color: '#111', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {savingRowId === unlockPromptEmp.id ? (
                  <RefreshCw size={14} className="spin" />
                ) : (
                  <Unlock size={14} />
                )}
                Unlock & Set to Pending
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carry Forward Remaining Salary Confirmation Modal */}
      {/* Overpayment Confirmation Modal */}
      {overpaymentModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            border: '1.5px solid #fecaca'
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
              padding: '16px 20px',
              borderBottom: '1.5px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#ef4444',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)'
                }}>
                  <AlertCircle size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#991b1b' }}>
                    Overpayment Confirmation
                  </div>
                  <div style={{ fontSize: '11px', color: '#b91c1c' }}>
                    Payment exceeds salary or outstanding balance
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOverpaymentModal({ isOpen: false, empId: null })}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#991b1b', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, margin: 0 }}>
                The salary amount is <strong>{CURRENCY} {overpaymentModal.salaryAmount?.toFixed(2)}</strong>, but you are about to pay <strong>{CURRENCY} {overpaymentModal.paymentAmount?.toFixed(2)}</strong>. This will create an overpayment of <strong style={{ color: '#dc2626' }}>{CURRENCY} {overpaymentModal.overpaymentAmount?.toFixed(2)}</strong>.
              </p>

              <div style={{
                background: '#fef2f2',
                border: '1.5px solid #fecaca',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Original / Outstanding Salary:</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{CURRENCY} {overpaymentModal.salaryAmount?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Entered Payment:</span>
                  <span style={{ fontWeight: 700, color: '#059669' }}>{CURRENCY} {overpaymentModal.paymentAmount?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #fee2e2', paddingTop: '6px', fontWeight: 800 }}>
                  <span style={{ color: '#b91c1c' }}>Overpayment Amount:</span>
                  <span style={{ color: '#dc2626' }}>+{CURRENCY} {overpaymentModal.overpaymentAmount?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#7f1d1d' }}>
                  <span>Resulting Remaining Balance:</span>
                  <span style={{ fontWeight: 800 }}>-{CURRENCY} {overpaymentModal.overpaymentAmount?.toFixed(2)}</span>
                </div>
              </div>

              <p style={{ fontSize: '12px', color: '#64748b', margin: 0, fontStyle: 'italic' }}>
                Do you want to continue and record this overpayment?
              </p>
            </div>

            {/* Modal Footer */}
            <div style={{
              background: '#f8fafc',
              padding: '12px 20px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setOverpaymentModal({ isOpen: false, empId: null })}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={payingRowId === overpaymentModal.empId}
                onClick={async () => {
                  const { empId, cashVal, bankVal } = overpaymentModal;
                  setOverpaymentModal({ isOpen: false, empId: null });
                  await executePayment(empId, cashVal, bankVal);
                }}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: '1.5px solid #dc2626',
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: payingRowId === overpaymentModal.empId ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)'
                }}
              >
                {payingRowId === overpaymentModal.empId ? <RefreshCw size={13} className="spin" /> : <CheckCircle size={13} />}
                <span>Confirm Payment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {carryForwardModal.isOpen && carryForwardModal.emp && (() => {
        const emp = carryForwardModal.emp;
        const cash = parseFloat(emp.cash_paid || 0);
        const bank = parseFloat(emp.bank_paid || 0);
        const totalPaid = Math.round((cash + bank) * 100) / 100;
        const net = parseFloat(emp.net_salary || 0);
        const rem = Math.round((net - totalPaid) * 100) / 100;
        const finalCarryAmt = (carryForwardModal.amount !== undefined && carryForwardModal.amount !== null && !isNaN(parseFloat(carryForwardModal.amount))) 
          ? parseFloat(carryForwardModal.amount) 
          : rem;

        const [year, monthNum] = selectedMonth.split('-').map(Number);
        let nextYear = year;
        let nextMonthNum = monthNum + 1;
        if (nextMonthNum > 12) {
          nextMonthNum = 1;
          nextYear = year + 1;
        }
        const nextMonthStr = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}`;
        
        const curMonthName = new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const nextMonthName = new Date(`${nextMonthStr}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10002,
            padding: '16px'
          }}>
            <div style={{
              background: '#fff',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #fed7aa',
              overflow: 'hidden'
            }}>
              {/* Modal Header */}
              <div style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                padding: '16px 20px',
                borderBottom: '1px solid #fed7aa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: '#ea580c',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <ArrowRightCircle size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#9a3412' }}>
                      Carry Forward Remaining Salary
                    </div>
                    <div style={{ fontSize: '11px', color: '#c2410c' }}>
                      Transfer balance to next month & lock current
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCarryForwardModal({ isOpen: false, emp: null, amount: null })}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9a3412',
                    padding: '4px',
                    borderRadius: '6px'
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Employee Info */}
                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    {emp.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    ID: {emp.employee_id} • {emp.role || 'Staff'} • {emp.branch || 'Main'}
                  </div>
                </div>

                {/* Transfer Flow Pill */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#fff7ed',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px dashed #fdba74',
                  fontSize: '12px',
                  fontWeight: 700
                }}>
                  <span style={{ color: '#9a3412' }}>{curMonthName}</span>
                  <span style={{ color: '#ea580c' }}>➔</span>
                  <span style={{ color: '#047857', fontWeight: 800 }}>{nextMonthName}</span>
                </div>

                {/* Balance Breakdown */}
                <div style={{
                  background: '#fff',
                  border: '1.5px solid #fed7aa',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#64748b' }}>Total Net Payable:</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{CURRENCY} {net.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#64748b' }}>Paid This Month ({cash > 0 ? `Cash ${cash}` : ''} {bank > 0 ? `Bank ${bank}` : ''}):</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{CURRENCY} {totalPaid.toFixed(2)}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid #fde68a',
                    paddingTop: '8px',
                    marginTop: '4px'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#c2410c' }}>
                      Unpaid Remaining Balance:
                    </span>
                    <span style={{
                      fontSize: '15px',
                      fontWeight: 900,
                      color: '#ea580c',
                      background: '#ffedd5',
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}>
                      {CURRENCY} {rem.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Carry Forward Confirmation Message */}
                <div style={{
                  background: '#fff7ed',
                  border: '1.5px solid #fdba74',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '14px', color: '#7c2d12', fontWeight: 600, lineHeight: 1.5 }}>
                    Your remaining salary amount is <strong style={{ color: '#ea580c', fontSize: '16px' }}>{CURRENCY} {rem.toFixed(2)}</strong>.
                    <br />
                    Do you want to carry forward this amount to the next month (<strong style={{ color: '#047857' }}>{nextMonthName}</strong>)?
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#9a3412', fontWeight: 600 }}>
                    • Amount is automatically derived from the actual remaining balance and cannot be modified.
                  </div>
                </div>

                {/* Explanation Alert */}
                <div style={{
                  fontSize: '12px',
                  color: '#78350f',
                  background: '#fefce8',
                  border: '1px solid #fef08a',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  lineHeight: 1.45
                }}>
                  <strong>Notice:</strong> Exactly <strong>{CURRENCY} {rem.toFixed(2)}</strong> will be transferred to <strong>{nextMonthName}</strong> as <strong>Prev M. Remaining</strong>. Current month (<strong>{curMonthName}</strong>) will be saved and <strong>LOCKED</strong>.
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div style={{
                background: '#f8fafc',
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px'
              }}>
                <button
                  type="button"
                  onClick={() => setCarryForwardModal({ isOpen: false, emp: null, amount: null })}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingCarryForwardId === emp.id}
                  onClick={executeCarryForwardFromModal}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#ea580c',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)'
                  }}
                >
                  {savingCarryForwardId === emp.id ? <RefreshCw size={13} className="spin" /> : <Lock size={13} />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .cell-input {
          width: 55px;
          padding: 4px 6px;
          border: 1px solid var(--surface-2);
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.2s;
          background: rgba(255,255,255,0.7);
        }
        .cell-input:focus {
          border-color: var(--primary);
          background: #fff;
          box-shadow: 0 0 0 2px rgba(244, 180, 0, 0.2);
        }
        .employee-cell-hover:hover {
          background: var(--surface-2) !important;
        }
      `}</style>
    </div>
  )
}

const stickyStyle = {
  position: 'sticky',
  boxShadow: '2px 0 5px rgba(0,0,0,0.05)',
}
