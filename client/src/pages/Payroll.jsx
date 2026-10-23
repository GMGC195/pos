import React, { useEffect, useState } from 'react'
import axios from '../api'
import { 
  Calculator, Settings, User, Clock, CalendarDays, Plus, Banknote, Users, 
  TrendingUp, Search, RefreshCw, X, AlertTriangle, FileText, Percent, 
  CheckCircle, HelpCircle, Edit2, Printer, Save, Trash2, MoreVertical, Lock
} from 'lucide-react'
import { CURRENCY } from '../config'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import ManageSalaryModal from '../components/ManageSalaryModal'

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
  const [selectedMonth, setSelectedMonth] = useState(getLastMonth())

  // Manage Salary Modal State
  const [showSalaryModal, setShowSalaryModal] = useState(false)
  const [modalBaseSalary, setModalBaseSalary] = useState('')
  const [savingModalSalary, setSavingModalSalary] = useState(false)

  // Editable Payroll Data State
  const [editableData, setEditableData] = useState({})
  const [savingAll, setSavingAll] = useState(false)
  const [savingRowId, setSavingRowId] = useState(null)

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

  // Employee Detail Modal State
  const [selectedEmployeeForModal, setSelectedEmployeeForModal] = useState(null)
  const [empRecurringAdjs, setEmpRecurringAdjs] = useState([])
  const [empOneTimeAdjs, setEmpOneTimeAdjs] = useState([])
  const [loadingAdjs, setLoadingAdjs] = useState(false)

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
    if (!window.confirm('Are you sure you want to rename this column?')) return;
    try {
      await axios.put(`/api/payroll/adjustment-types/${id}`, { label: editAdjValue.trim() });
      toast.success('Updated successfully');
      setEditingDynamicAdjId(null);
      await loadAdjustmentTypes();
      await loadPayroll(true);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update');
    }
  }

  // Load calculations
  const loadPayroll = async (silent = false) => {
    if (!selectedMonth) return
    if (!silent) setLoading(true)
    try {
      const res = await axios.get('/api/payroll/calculate', {
        params: { month: selectedMonth }
      })
      
      const newEditableData = {}
      res.data.forEach(item => {
        const cashVal = item.cash_paid !== undefined && item.cash_paid !== null ? item.cash_paid : (item.paid_amount !== null ? item.paid_amount : item.net_salary);
        const bankVal = item.bank_paid !== undefined && item.bank_paid !== null ? item.bank_paid : 0;

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
          paid_amount: item.paid_amount !== null ? item.paid_amount : (cashVal + bankVal),
          overtime_pay: item.overtime_pay || 0,
          status: item.status || 'Pending',
          dynamic_adjustments: item.dynamic_adjustments || {}
        }
      })
      setEditableData(newEditableData)
    } catch (err) {
      toast.error('Error loading payroll calculations')
      console.error(err)
    } finally {
      if (!silent) setLoading(false)
    }
  }

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
  }, [selectedMonth])

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
    const thisMonthAdv = parseFloat(row.this_month_adv || 0);
    const internet = parseFloat(row.internet || 0);
    const kafalat = parseFloat(row.kafalat || 0);
    const otherAdj = parseFloat(row.other_adjustments || 0);

    const total = lastMonthBal + bonus - thisMonthAdv - internet - kafalat + otherAdj + dynamicTotal;
    return Math.round(total * 100) / 100;
  }

  // Helper to recalculate net salary
  const recalculateNetSalary = (row) => {
    const baseSal = parseFloat(row.base_salary || 0);
    const payable = parseFloat(row.payable_salary !== undefined ? row.payable_salary : (baseSal - parseFloat(row.deductions || 0)));
    const totalAdj = calculateTotalAdjustments(row);
    const dynamicNet = Math.max(0, Math.round((payable + totalAdj) * 100) / 100);
    return dynamicNet;
  }

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

      return { ...prev, [empId]: row }
    })
  }

  const handlePaidChange = (empId, field, value) => {
    setEditableData(prev => {
      const row = { ...prev[empId] }
      row[field] = value;
      const cash = parseFloat(field === 'cash_paid' ? value : row.cash_paid) || 0;
      const bank = parseFloat(field === 'bank_paid' ? value : row.bank_paid) || 0;
      row.paid_amount = Math.round((cash + bank) * 100) / 100;
      return { ...prev, [empId]: row }
    })
  }

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
      const expectedMinutes = expectedHours * 60;
      const perMinRate = expectedMinutes > 0 ? (newBaseSalary / expectedMinutes) : 0;
      const perHourRate = expectedHours > 0 ? (newBaseSalary / expectedHours) : 0;

      const actualMinutes = row.actual_minutes !== undefined ? row.actual_minutes : (parseFloat(row.actual_hours || 0) * 60);

      // Payable salary: per-minute rate multiplied by actual minutes
      let payableSalary = Math.round(actualMinutes * perMinRate * 100) / 100;
      let deductions = Math.max(0, Math.round((newBaseSalary - payableSalary) * 100) / 100);
      let otPay = 0;
      let otHours = 0;

      if (parseFloat(row.actual_hours || 0) > expectedHours) {
        otHours = Math.round((parseFloat(row.actual_hours || 0) - expectedHours) * 100) / 100;
        const rate = parseFloat(row.overtime_rate) || perHourRate;
        otPay = Math.round(otHours * rate * 100) / 100;
      }

      row.deductions = deductions;
      row.payable_salary = payableSalary;
      row.overtime_hours = otHours;
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

  const handleSaveAll = async () => {
    if (!window.confirm('Are you sure you want to save all payroll records for ' + selectedMonth + '?')) return;
    setSavingAll(true);
    try {
      const rowsToSave = Object.values(editableData).filter(row => {
        // If row is Paid and user is not developer, skip it
        if (row.status === 'Paid' && !isDeveloper) return false;
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
  }
  
  const handleSaveRow = async (empId) => {
    setSavingRowId(empId);
    try {
      const row = editableData[empId];
      await saveRowRecord(row);
      toast.success(`Record for ${row.name} saved!`);
      await loadPayroll(true);
    } catch (error) {
       console.error(error);
       const errMsg = error?.response?.data?.error || error.message || 'Failed to save record.';
       toast.error(errMsg);
    } finally {
      setSavingRowId(null);
    }
  }

  // ================= Employee Detail Modal Functions =================

  const loadEmpAdjs = async (empId) => {
    setLoadingAdjs(true)
    try {
      const [recRes, oneRes] = await Promise.all([
        axios.get(`/api/payroll/recurring-adjustments/${empId}`),
        axios.get(`/api/payroll/adjustments/${empId}`)
      ])
      setEmpRecurringAdjs(recRes.data)
      setEmpOneTimeAdjs(oneRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingAdjs(false)
    }
  }

  const openEmployeeModal = (empRow) => {
    setSelectedEmployeeForModal(empRow)
    setModalBaseSalary(empRow.base_salary !== undefined ? String(empRow.base_salary) : '')
    resetAdjForm()
    loadEmpAdjs(empRow.id)
  }

  const resetAdjForm = () => {
    setEditingAdjId(null)
    setEditingAdjType(null)
    setCustomAdjAction('Deduct')
    setCustomAdjLabel('Advance Salary / Loan')
    setCustomAdjOtherLabel('')
    setCustomAdjType('Repeated Monthly')
    setCustomAdjAmount('')
    setCustomAdjTotalLimit('')
    setCustomAdjNotes('')
  }

  const handleEditAdj = (adj, type) => {
    setEditingAdjId(adj.id)
    setEditingAdjType(type)
    setCustomAdjAction(adj.action_type === 'Add' ? 'Give' : adj.action_type)
    
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

  const handleAddCustomAdj = async (e) => {
    e.preventDefault()
    const actualLabel = customAdjLabel === 'Other Custom' ? customAdjOtherLabel : customAdjLabel;
    if (!actualLabel) return;
    setSavingCustomAdj(true)
    try {
      const payload = {
        employee_id: currentEmpData.id,
        type: actualLabel === 'Advance Salary / Loan' ? 'Advance Salary / Loan' : 'Custom Adjustment',
        custom_label: actualLabel,
        amount: parseFloat(customAdjAmount),
        action_type: customAdjAction,
        date: `${selectedMonth}-15`,
        start_date: `${selectedMonth}-01`,
        remaining_amount: customAdjTotalLimit ? parseFloat(customAdjTotalLimit) : null,
        notes: customAdjNotes
      }

      if (editingAdjId) {
        // Edit mode
        if (editingAdjType === 'Repeated Monthly') {
          await axios.put(`/api/payroll/recurring-adjustments/${editingAdjId}`, payload)
        } else {
          await axios.put(`/api/payroll/financial-adjustments/${editingAdjId}`, payload)
        }
        toast.success('Adjustment updated successfully!')
      } else {
        // Create mode
        if (customAdjType === 'Repeated Monthly') {
          await axios.post('/api/payroll/recurring-adjustments', payload)
        } else {
          await axios.post('/api/payroll/financial-adjustments', payload)
        }
        toast.success('Adjustment added successfully!')
      }

      resetAdjForm()
      loadEmpAdjs(currentEmpData.id)
      loadPayroll(true)
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to save adjustment';
      toast.error(errorMsg);
    } finally {
      setSavingCustomAdj(false)
    }
  }

  const executeDelete = async () => {
    const { id, type } = confirmDelete
    try {
      if (type === 'Repeated Monthly') {
        await axios.delete(`/api/payroll/recurring-adjustments/${id}`)
      } else if (type === 'Adjustment Column') {
        await axios.delete(`/api/payroll/adjustment-types/${id}`)
      } else {
        await axios.delete(`/api/payroll/adjustments/${id}`)
      }
      toast.success('Deleted successfully')
      
      if (type === 'Adjustment Column') {
        await loadAdjustmentTypes()
        await loadPayroll(true)
      } else {
        await loadEmpAdjs(currentEmpData?.id)
        await loadPayroll(true)
      }
    } catch (err) {
      toast.error('Failed to delete')
    } finally {
      setConfirmDelete({ isOpen: false, id: null, type: null })
    }
  }

  // ===================================================================

  const filteredEmployees = Object.values(editableData).filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.employee_id && item.employee_id.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  // Calculate Summary Totals
  const totalBaseSalary = filteredEmployees.reduce((sum, item) => sum + (parseFloat(item.base_salary) || 0), 0)
  const totalNetSalary = filteredEmployees.reduce((sum, item) => sum + (parseFloat(item.net_salary) || 0), 0)
  const totalDeductions = filteredEmployees.reduce((sum, item) => sum + (parseFloat(item.deductions) || 0), 0)

  const currentEmpData = selectedEmployeeForModal ? (editableData[selectedEmployeeForModal.id] || selectedEmployeeForModal) : null;

  return (
    <div style={{ padding: '16px', maxWidth: '100%', margin: '0 auto', fontFamily: 'var(--font-family)', background: 'var(--background)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calculator size={28} style={{ color: 'var(--primary)' }} />
            Payroll Management
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '13px' }}>
            Manage monthly salaries, attendance, and Excel-like editable payroll records.
          </p>
        </div>

        {showActions && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              onClick={() => setShowSalaryModal(true)}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}
            >
              <Banknote size={16} style={{ color: 'var(--primary)' }} />
              Manage Salary
            </button>
            <button 
              onClick={() => setShowAdjustmentsModal(true)}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}
            >
              <Settings size={16} />
              Manage Columns
            </button>
            <button 
              onClick={handleSaveAll}
              disabled={savingAll}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(244, 180, 0, 0.2)' }}
            >
              <Save size={16} />
              {savingAll ? 'Saving...' : 'Save All'}
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--surface)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--surface-2)', marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: '200px', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search by name or ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', border: '1px solid var(--surface-2)', background: 'var(--background)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Month:</label>
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--surface-2)', background: 'var(--background)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', fontWeight: 600, cursor: 'pointer' }}
            />
          </div>
        </div>

        <button 
          onClick={loadPayroll}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', transition: 'all 0.2s', ...(loading ? {opacity: 0.7, cursor: 'not-allowed'} : {}) }}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Spreadsheet View */}
      <div style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        
        {/* Table Container with Horizontal Scroll */}
        <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
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
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: '#6d28d9', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#ede9fe' }}>Last M. Balance</th>
                
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
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                {showActions && <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={19 + adjustmentTypes.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', border: '3px solid var(--surface-2)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '28px', height: '28px' }} />
                    Calculating Payroll...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={19 + adjustmentTypes.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No payroll records found for this month.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((item, index) => {
                  const baseSal = parseFloat(item.base_salary || 0);
                  const payable = parseFloat(item.payable_salary !== undefined ? item.payable_salary : (baseSal - parseFloat(item.deductions || 0)));
                  const payableDiff = Math.round((payable - baseSal) * 100) / 100;
                  const isRowLocked = item.status === 'Paid' && !isDeveloper;
                  const totalAdj = calculateTotalAdjustments(item);

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--surface-2)', background: index % 2 === 0 ? 'var(--white)' : 'var(--surface)', transition: 'background 0.2s', ...(isRowLocked ? { opacity: 0.88 } : {}) }}>
                      <td 
                        onClick={() => openEmployeeModal(item)}
                        style={{ ...stickyStyle, left: 0, zIndex: 10, background: index % 2 === 0 ? 'var(--white)' : 'var(--surface)', padding: '8px', borderRight: '1px solid var(--surface-2)', cursor: 'pointer' }}
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
                        {(() => {
                          const bal = parseFloat(item.last_month_balance || 0);
                          if (bal > 0) return <span style={{ color: 'var(--green)' }}>+{bal.toFixed(2)}</span>;
                          if (bal < 0) return <span style={{ color: '#ef4444' }}>{bal.toFixed(2)}</span>;
                          return <span style={{ color: 'var(--text-muted)' }}>0.00</span>;
                        })()}
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
                      <td style={{ padding: '8px', fontSize: '13px', fontWeight: 800, color: 'var(--primary)', background: '#f0fdf4', whiteSpace: 'nowrap' }}>
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
                      
                      {/* Status */}
                      <td style={{ padding: '4px' }}>
                        <select 
                          className="cell-input" 
                          disabled={isRowLocked}
                          value={item.status} 
                          onChange={e => handleTextChange(item.id, 'status', e.target.value)} 
                          style={{ width: '85px', fontWeight: 700, color: item.status === 'Paid' ? 'var(--green)' : '#d97706', opacity: isRowLocked ? 0.7 : 1, cursor: isRowLocked ? 'not-allowed' : 'pointer' }}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Paid">Paid</option>
                        </select>
                      </td>

                      {showActions && (
                        <td style={{ padding: '4px', textAlign: 'center' }}>
                          {isRowLocked ? (
                            <div 
                              title="Payroll Locked for Paid records. Only Developer role can unlock/edit." 
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                            >
                              <Lock size={12} />
                              Locked
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleSaveRow(item.id)}
                              disabled={savingRowId === item.id}
                              className="btn btn-primary"
                              style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              {savingRowId === item.id ? <RefreshCw size={12} className="spin" /> : <Save size={12} />}
                              Save {isDeveloper && item.status === 'Paid' ? '(Dev)' : ''}
                            </button>
                          )}
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

      {/* Employee Details & Adjustments Modal */}
      {currentEmpData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <div style={{ background: 'var(--white)', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-lg)' }}>
            
            {/* Header */}
            <div style={{ position: 'sticky', top: 0, background: 'var(--white)', zIndex: 10, padding: '20px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>{currentEmpData.name}</h2>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>ID: {currentEmpData.employee_id} • Role: {currentEmpData.role}</div>
              </div>
              <button onClick={() => setSelectedEmployeeForModal(null)} style={{ background: 'var(--surface-2)', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '6px', borderRadius: '50%' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '24px' }}>
              
              {/* 3-Column Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--surface-2)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Attendance Summary</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>Presents:</span><span style={{ fontWeight: 700, color: 'var(--green)' }}>{currentEmpData.presents}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>Absents:</span><span style={{ fontWeight: 700, color: '#ef4444' }}>{currentEmpData.absents}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>Leaves:</span><span style={{ fontWeight: 700, color: '#f59e0b' }}>{currentEmpData.leaves}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px' }}>Holidays:</span><span style={{ fontWeight: 700, color: 'var(--primary)' }}>{currentEmpData.holidays}</span>
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--surface-2)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Hours & Overtime</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>Expected Hours:</span>
                    <span style={{ fontWeight: 700 }}>
                      {formatDuration(currentEmpData.expected_minutes !== undefined ? currentEmpData.expected_minutes : (currentEmpData.expected_hours * 60))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>Actual Hours:</span>
                    <span style={{ fontWeight: 700, color: currentEmpData.actual_hours < currentEmpData.expected_hours ? '#ef4444' : 'var(--green)' }}>
                      {currentEmpData.actual_hours >= currentEmpData.expected_hours ? '+' : '-'}
                      {formatDuration(currentEmpData.actual_minutes !== undefined ? currentEmpData.actual_minutes : (currentEmpData.actual_hours * 60))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>Overtime Hours:</span>
                    <span style={{ fontWeight: 700 }}>
                      {formatDuration((currentEmpData.overtime_hours || 0) * 60)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px' }}>Overtime Pay:</span><span style={{ fontWeight: 700, color: 'var(--green)' }}>{CURRENCY} {Number(currentEmpData.overtime_pay || 0).toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--surface-2)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Financials</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Base Salary:</span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input 
                        type="number" 
                        value={modalBaseSalary}
                        onChange={e => setModalBaseSalary(e.target.value)}
                        style={{ width: '90px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--surface-2)', fontSize: '13px', fontWeight: 700, color: '#7c3aed', outline: 'none' }}
                      />
                      <button 
                        onClick={handleSaveModalSalary}
                        disabled={savingModalSalary}
                        className="btn btn-primary"
                        style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 700, borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        {savingModalSalary ? <RefreshCw size={11} className="spin" /> : <Save size={11} />}
                        Save
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>Deductions:</span><span style={{ fontWeight: 700, color: '#ef4444' }}>{CURRENCY} {Number(currentEmpData.deductions || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px' }}>Net to Pay:</span><span style={{ fontWeight: 800, color: 'var(--primary)' }}>{CURRENCY} {Number(currentEmpData.net_salary || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px' }}>Advance Balance:</span><span style={{ fontWeight: 700, color: '#f59e0b' }}>{CURRENCY} {Number(currentEmpData.advance_balance || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Adjustments and Recurring Section */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(400px, 1.5fr)', gap: '24px' }}>
                                 {/* Unified Custom Adjustment Form */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', height: 'fit-content' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '12px', color: '#1e293b' }}>
                      {editingAdjId ? 'Edit Adjustment' : 'Add Adjustment / Loan'}
                    </h3>
                    <form onSubmit={handleAddCustomAdj} autoComplete="off">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                        
                        {/* Radio Buttons for Action */}
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input type="radio" name="adjAction" value="Give" checked={customAdjAction === 'Give'} onChange={() => setCustomAdjAction('Give')} />
                            Give (+)
                          </label>
                          <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input type="radio" name="adjAction" value="Deduct" checked={customAdjAction === 'Deduct'} onChange={() => setCustomAdjAction('Deduct')} />
                            Deduct (-)
                          </label>
                        </div>

                        {/* Name Dropdown */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Adjustment Name</label>
                          <select 
                            value={customAdjLabel} 
                            onChange={e => {
                              const val = e.target.value;
                              setCustomAdjLabel(val);
                              // Set logical defaults based on selection
                              if (val === 'Advance Salary / Loan') {
                                setCustomAdjAction('Deduct')
                                setCustomAdjType('Repeated Monthly')
                              } else if (val === 'Bonus') {
                                setCustomAdjAction('Give')
                                setCustomAdjType('One-Time')
                              } else if (val === 'Internet' || val === 'Kafalat') {
                                setCustomAdjAction('Deduct')
                                setCustomAdjType('Repeated Monthly')
                              } else if (val === 'Last Month Adjustment') {
                                setCustomAdjType('One-Time')
                              } else {
                                const dynamicAdj = adjustmentTypes.find(a => a.label === val);
                                if (dynamicAdj) {
                                  setCustomAdjAction(dynamicAdj.action === 'Add' ? 'Give' : 'Deduct');
                                  setCustomAdjType('Repeated Monthly');
                                }
                              }
                            }} 
                            required 
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                          >
                            <option value="">Select Adjustment Type</option>
                            <optgroup label="Standard Adjustments">
                              {(baseColumns.this_month_adv?.action === customAdjAction || baseColumns.this_month_adv?.action === 'Both' || (customAdjAction === 'Deduct')) && <option value="Advance Salary / Loan">{baseColumns.this_month_adv?.label || 'This M. Adv'}</option>}
                              {(baseColumns.bonus?.action === customAdjAction || baseColumns.bonus?.action === 'Both' || (customAdjAction === 'Give')) && <option value="Bonus">{baseColumns.bonus?.label || 'Bonus'}</option>}
                              {(baseColumns.internet?.action === customAdjAction || baseColumns.internet?.action === 'Both' || (customAdjAction === 'Deduct')) && <option value="Internet">{baseColumns.internet?.label || 'Internet'}</option>}
                              {(baseColumns.kafalat?.action === customAdjAction || baseColumns.kafalat?.action === 'Both' || (customAdjAction === 'Deduct')) && <option value="Kafalat">{baseColumns.kafalat?.label || 'Kafalat'}</option>}
                            </optgroup>
                            {adjustmentTypes.length > 0 && (
                              <optgroup label="Custom Columns">
                                {adjustmentTypes
                                  .filter(adj => adj.action === customAdjAction || adj.action === 'Both' || (adj.action === 'Add' && customAdjAction === 'Give'))
                                  .map(adj => (
                                  <option key={adj.id} value={adj.label}>{adj.label}</option>
                                ))}
                              </optgroup>
                            )}
                            <option value="Other Custom">Other Custom...</option>
                          </select>
                        </div>
                        
                        {/* Custom Name Input if 'Other' selected */}
                        {customAdjLabel === 'Other Custom' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Custom Name</label>
                            <input type="text" value={customAdjOtherLabel} onChange={e => setCustomAdjOtherLabel(e.target.value)} placeholder="e.g. Traffic Fine" required style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                          </div>
                        )}

                        {/* Type Dropdown */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Repetition</label>
                          <select value={customAdjType} onChange={e => setCustomAdjType(e.target.value)} disabled={editingAdjId !== null} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: editingAdjId ? '#f1f5f9' : '#fff' }}>
                            <option value="One-Time">One-Time</option>
                            <option value="Repeated Monthly">Repeated Monthly</option>
                          </select>
                        </div>

                        {/* Amount Fields based on Type */}
                        {customAdjType === 'One-Time' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Amount</label>
                            <input type="number" value={customAdjAmount} onChange={e => setCustomAdjAmount(e.target.value)} placeholder="e.g. 500" required style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{customAdjAction === 'Give' ? 'Every Month Pay Amount' : 'Monthly Cut Amount'}</label>
                              <input type="number" value={customAdjAmount} onChange={e => setCustomAdjAmount(e.target.value)} placeholder="e.g. 500" required style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Total Limit Amount (Optional)</label>
                              <input type="number" value={customAdjTotalLimit} onChange={e => setCustomAdjTotalLimit(e.target.value)} placeholder="e.g. 10000" style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                              <span style={{ fontSize: '9px', color: '#64748b', lineHeight: 1 }}>Stop {customAdjAction === 'Give' ? 'paying' : 'cutting'} after limit (e.g. Loans).</span>
                            </div>
                          </>
                        )}
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Note (Optional)</label>
                          <input type="text" value={customAdjNotes} onChange={e => setCustomAdjNotes(e.target.value)} placeholder="Reason for adjustment" style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                        </div>
                        
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="submit" disabled={savingCustomAdj} className="btn" style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--text-primary)', color: 'var(--white)', fontWeight: 700, fontSize: '12px', border: 'none', cursor: 'pointer' }}>
                          {savingCustomAdj ? 'Saving...' : editingAdjId ? 'Update' : 'Add'}
                        </button>
                        {editingAdjId && (
                          <button type="button" onClick={resetAdjForm} style={{ padding: '10px 16px', borderRadius: '8px', background: '#cbd5e1', color: '#334155', fontWeight: 700, fontSize: '12px', border: 'none', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </form>
                  </div>

                {/* Active Adjustments Lists */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Active Monthly (Recurring) */}
                  <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid var(--surface-2)' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '12px', color: 'var(--text-primary)' }}>Repeated / Monthly</h3>
                    
                    {loadingAdjs ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading...</div>
                    ) : empRecurringAdjs.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No active monthly adjustments for this employee.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto' }}>
                        {empRecurringAdjs.map(adj => (
                          <div key={adj.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: '8px' }}>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: adj.action_type === 'Give' || adj.action_type === 'Add' ? 'var(--green)' : '#ef4444' }}>
                                {adj.custom_label} ({adj.action_type})
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                Monthly: <span style={{ fontWeight: 700 }}>{CURRENCY} {adj.amount}</span>
                                {adj.remaining_amount !== null && ` | Limit: ${CURRENCY} ${adj.remaining_amount}`}
                                {adj.notes && ` | ${adj.notes}`}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleEditAdj(adj, 'Repeated Monthly')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: '4px' }} title="Edit">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => setConfirmDelete({ isOpen: true, id: adj.id, type: 'Repeated Monthly' })} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }} title="Delete">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* One-Time Adjustments */}
                  <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid var(--surface-2)' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '12px', color: 'var(--text-primary)' }}>One-Time Adjustments</h3>
                    
                    {loadingAdjs ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading...</div>
                    ) : empOneTimeAdjs.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No one-time adjustments.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto' }}>
                        {empOneTimeAdjs.map(adj => (
                          <div key={adj.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: '8px' }}>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: adj.action_type === 'Give' || adj.action_type === 'Add' ? 'var(--green)' : '#ef4444' }}>
                                {adj.custom_label} ({adj.action_type})
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                Amt: <span style={{ fontWeight: 700 }}>{CURRENCY} {adj.amount}</span> | {new Date(adj.date).toLocaleDateString()}
                                {adj.notes && ` | ${adj.notes}`}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleEditAdj(adj, 'One-Time')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: '4px' }} title="Edit">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => setConfirmDelete({ isOpen: true, id: adj.id, type: 'One-Time' })} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }} title="Delete">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

              </div>
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
                        if (!window.confirm('Are you sure you want to rename this column?')) return;
                        setBaseColumns(prev => ({ ...prev, [key]: { ...prev[key], label: editStandardValue.trim() } }));
                        setEditingStandardKey(null);
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
