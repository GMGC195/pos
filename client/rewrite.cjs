const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'src/pages/Payroll.jsx');

const code = `import React, { useEffect, useState } from 'react'
import axios from '../api'
import { 
  Calculator, Settings, User, Clock, CalendarDays, Plus, Banknote, Users, 
  TrendingUp, Search, RefreshCw, X, AlertTriangle, FileText, Percent, 
  CheckCircle, HelpCircle, Edit2, Printer, Save, Trash2
} from 'lucide-react'
import { CURRENCY } from '../config'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

export default function Payroll() {
  const { user } = useAuth()
  const isAdmin = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'developer'
  const showActions = isAdmin

  const formatMonth = (date) => {
    const d = new Date(date)
    return \\\`\\\${d.getFullYear()}-\\\${String(d.getMonth() + 1).padStart(2, '0')}\\\`
  }

  // State Variables
  const [employeesList, setEmployeesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(formatMonth(new Date()))

  // Editable Payroll Data State
  const [editableData, setEditableData] = useState({})
  const [savingAll, setSavingAll] = useState(false)
  const [savingRowId, setSavingRowId] = useState(null)

  // Leave Modal State
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leaveEmployeeId, setLeaveEmployeeId] = useState('')
  const [leaveDate, setLeaveDate] = useState(() => new Date().toISOString().split('T')[0])
  const [leaveIsPaid, setLeaveIsPaid] = useState(true)
  const [savingLeave, setSavingLeave] = useState(false)

  // Dynamic Adjustments State
  const [adjustmentTypes, setAdjustmentTypes] = useState([])
  const [showAdjustmentsModal, setShowAdjustmentsModal] = useState(false)
  
  // New Adjustment Form State
  const [newAdjLabel, setNewAdjLabel] = useState('')
  const [newAdjType, setNewAdjType] = useState('One-Time')
  const [newAdjAction, setNewAdjAction] = useState('Add')
  const [savingAdjType, setSavingAdjType] = useState(false)

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
      loadAdjustmentTypes()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add type')
    } finally {
      setSavingAdjType(false)
    }
  }

  const handleDeleteAdjustmentType = async (id) => {
    if (!window.confirm('Are you sure you want to delete this adjustment type? It will remove the column from the view.')) return;
    try {
      await axios.delete(\\\`/api/payroll/adjustment-types/\\\${id}\\\`)
      toast.success('Deleted successfully')
      loadAdjustmentTypes()
    } catch (err) {
      toast.error('Failed to delete')
    }
  }

  // Load calculations
  const loadPayroll = async () => {
    if (!selectedMonth) return
    setLoading(true)
    try {
      const res = await axios.get('/api/payroll/calculate', {
        params: { month: selectedMonth }
      })
      
      const newEditableData = {}
      res.data.forEach(item => {
        newEditableData[item.id] = {
          ...item,
          this_month_adv: item.advance_deduction || 0,
          paid_in_account: item.paid_amount !== null ? item.paid_amount : item.net_salary,
          overtime_pay: item.overtime_pay || 0,
          bonus: item.bonus || 0,
          last_month_adjustment: item.last_month_adjustment || 0,
          internet: item.internet || 0,
          kafalat: item.kafalat || 0,
          status: item.status || 'Pending',
          dynamic_adjustments: item.dynamic_adjustments || {}
        }
      })
      setEditableData(newEditableData)
    } catch (err) {
      toast.error('Error loading payroll calculations')
      console.error(err)
    } finally {
      setLoading(false)
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
  }, [])

  useEffect(() => {
    loadPayroll()
  }, [selectedMonth])

  // Helper to recalculate net salary
  const recalculateNetSalary = (row) => {
    const earned = Math.max(0, parseFloat(row.base_salary) - parseFloat(row.deductions));
    let dynamicTotal = 0;
    
    // Calculate dynamic adjustments total
    adjustmentTypes.forEach(adj => {
      const val = parseFloat(row.dynamic_adjustments[adj.label] || 0);
      if (adj.action === 'Add') {
        dynamicTotal += val;
      } else if (adj.action === 'Deduct') {
        dynamicTotal -= val;
      }
    });

    const dynamicNet = Math.max(0, 
      earned + 
      parseFloat(row.overtime_pay) + 
      parseFloat(row.bonus) + 
      parseFloat(row.last_month_adjustment) - 
      parseFloat(row.internet) - 
      parseFloat(row.kafalat) - 
      parseFloat(row.this_month_adv) +
      dynamicTotal
    );
    return dynamicNet;
  }

  // Recalculate Net Salary dynamically when standard fields change
  const handleFieldChange = (empId, field, value) => {
    setEditableData(prev => {
      const row = { ...prev[empId] }
      row[field] = parseFloat(value) || 0;
      
      const dynamicNet = recalculateNetSalary(row);
      row.net_salary = dynamicNet;
      
      if (parseFloat(prev[empId].paid_in_account) === parseFloat(prev[empId].net_salary)) {
        row.paid_in_account = dynamicNet;
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
        [label]: parseFloat(value) || 0
      }
      
      const dynamicNet = recalculateNetSalary(row);
      row.net_salary = dynamicNet;
      
      if (parseFloat(prev[empId].paid_in_account) === parseFloat(prev[empId].net_salary)) {
        row.paid_in_account = dynamicNet;
      }

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
    return axios.post('/api/payroll/record', {
      employee_id: row.id,
      month: selectedMonth,
      base_salary: row.base_salary,
      presents: row.presents,
      absents: row.absents,
      leaves: row.leaves,
      holidays: row.holidays,
      overtime_hours: row.overtime_hours,
      overtime_pay: row.overtime_pay,
      deductions: row.deductions,
      other_adjustments: 0,
      advance_deduction: row.this_month_adv,
      recurring_adjustments: 0,
      bonus: row.bonus,
      last_month_adjustment: row.last_month_adjustment,
      internet: row.internet,
      kafalat: row.kafalat,
      expected_hours: row.expected_hours,
      actual_hours: row.actual_hours,
      dynamic_adjustments: row.dynamic_adjustments,
      net_salary: row.net_salary,
      paid_amount: row.paid_in_account,
      status: row.status,
      notes: row.notes || ''
    });
  }

  const handleSaveAll = async () => {
    if (!window.confirm('Are you sure you want to save all payroll records for ' + selectedMonth + '?')) return;
    setSavingAll(true);
    try {
      const promises = Object.values(editableData).map(row => saveRowRecord(row));
      await Promise.all(promises);
      toast.success('All payroll records saved successfully!');
      loadPayroll();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save some payroll records.');
    } finally {
      setSavingAll(false);
    }
  }
  
  const handleSaveRow = async (empId) => {
    setSavingRowId(empId);
    try {
      const row = editableData[empId];
      await saveRowRecord(row);
      toast.success(\\\`Record for \\\${row.name} saved!\\\`);
    } catch (error) {
       console.error(error);
       toast.error('Failed to save record.');
    } finally {
      setSavingRowId(null);
    }
  }

  const filteredEmployees = Object.values(editableData).filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.employee_id && item.employee_id.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  // Calculate Summary Totals
  const totalBaseSalary = filteredEmployees.reduce((sum, item) => sum + (parseFloat(item.base_salary) || 0), 0)
  const totalNetSalary = filteredEmployees.reduce((sum, item) => sum + (parseFloat(item.net_salary) || 0), 0)
  const totalDeductions = filteredEmployees.reduce((sum, item) => sum + (parseFloat(item.deductions) || 0), 0)

  return (
    <div style={{ padding: '24px', maxWidth: '100%', margin: '0 auto', fontFamily: 'var(--font-family)', background: 'var(--background)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calculator size={32} style={{ color: 'var(--primary)' }} />
            Payroll Management
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '15px' }}>
            Manage monthly salaries, attendance, and Excel-like editable payroll records.
          </p>
        </div>

        {showActions && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button 
              onClick={() => setShowAdjustmentsModal(true)}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '14px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}
            >
              <Settings size={18} />
              Manage Columns
            </button>
            <button 
              onClick={handleSaveAll}
              disabled={savingAll}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '14px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(244, 180, 0, 0.2)' }}
            >
              <Save size={18} />
              {savingAll ? 'Saving...' : 'Save All Records'}
            </button>
            <button 
              onClick={() => setShowLeaveModal(true)}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '14px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}
            >
              <CalendarDays size={18} />
              Log Leave
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '10px', borderRadius: '10px', color: '#3b82f6' }}>
              <Users size={24} />
            </div>
            <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>Total Employees</h3>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>{filteredEmployees.length}</div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '10px', color: 'var(--green)' }}>
              <TrendingUp size={24} />
            </div>
            <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>Total Base Salary</h3>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {CURRENCY} {totalBaseSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '10px', color: '#ef4444' }}>
              <AlertTriangle size={24} />
            </div>
            <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>Total Deductions</h3>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444' }}>
            {CURRENCY} {totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(244, 180, 0, 0.1)', padding: '10px', borderRadius: '10px', color: 'var(--primary)' }}>
              <Banknote size={24} />
            </div>
            <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>Total Net Salary</h3>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary)' }}>
            {CURRENCY} {totalNetSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-2)', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: '250px', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search by name or ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: '10px', border: '1.5px solid var(--surface-2)', background: 'var(--background)', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.2s' }}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Month:</label>
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: '12px 16px', borderRadius: '10px', border: '1.5px solid var(--surface-2)', background: 'var(--background)', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', fontWeight: 600, cursor: 'pointer' }}
            />
          </div>
        </div>

        <button 
          onClick={loadPayroll}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '10px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', ...(loading ? {opacity: 0.7, cursor: 'not-allowed'} : {}) }}
        >
          <RefreshCw size={18} className={loading ? "spin" : ""} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Spreadsheet View */}
      <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        
        {/* Table Container with Horizontal Scroll */}
        <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--surface)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <tr>
                <th style={{ ...stickyStyle, left: 0, zIndex: 30, padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employee</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expected Hrs</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actual Hrs</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly Salary</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payable (After Ded.)</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details (P/A/L/H)</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prev Adv. Bal.</th>
                
                {/* Default Editable Columns */}
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#e0f2fe' }}>This Month Adv</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#fef3c7' }}>Overtime Payment</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#dcfce7' }}>Bonus</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f3e8ff' }}>Last Month Adj</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#ffedd5' }}>InterNet</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#fee2e2' }}>Kafalat P/M</th>

                {/* Dynamic Editable Columns */}
                {adjustmentTypes.map(adj => (
                  <th key={adj.id} style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: adj.action === 'Add' ? 'var(--green)' : '#ef4444', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', background: adj.action === 'Add' ? '#dcfce7' : '#fee2e2' }}>
                    {adj.label} ({adj.action === 'Add' ? '+' : '-'})
                  </th>
                ))}
                
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--primary)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f0fdf4' }}>Net to Pay</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#e0f2fe' }}>Paid in account</th>
                <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                {showActions && <th style={{ padding: '14px 16px', borderBottom: '2px solid var(--surface-2)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={16 + adjustmentTypes.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', border: '3px solid var(--surface-2)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '32px', height: '32px' }} />
                    Calculating Payroll...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={16 + adjustmentTypes.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No payroll records found for this month.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((item, index) => {
                  const earned = Math.max(0, parseFloat(item.base_salary) - parseFloat(item.deductions));
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--surface-2)', background: index % 2 === 0 ? 'var(--white)' : 'var(--surface)', transition: 'background 0.2s' }}>
                      <td style={{ ...stickyStyle, left: 0, zIndex: 10, background: index % 2 === 0 ? 'var(--white)' : 'var(--surface)', padding: '10px 16px', borderRight: '1px solid var(--surface-2)' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{item.employee_id}</div>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600 }}>{item.expected_hours}h</td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: item.actual_hours < item.expected_hours ? '#ef4444' : 'var(--green)' }}>{item.actual_hours}h</td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 700 }}>{item.base_salary}</td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 700, color: item.deductions > 0 ? '#ef4444' : 'inherit' }}>
                        {earned.toFixed(2)}
                        {item.deductions > 0 && <span style={{ fontSize: '10px', display: 'block' }}>(-{item.deductions.toFixed(2)})</span>}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--green)' }}>P:{item.presents} </span>
                        <span style={{ color: '#EF4444' }}>A:{item.absents} </span>
                        <span style={{ color: '#F97316' }}>L:{item.leaves} </span>
                        <span style={{ color: 'var(--primary)' }}>H:{item.holidays}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>{item.advance_balance}</td>
                      
                      {/* Default Editables */}
                      <td style={{ padding: '8px', background: '#f0f9ff' }}>
                        <input type="number" className="cell-input" value={item.this_month_adv} onChange={e => handleFieldChange(item.id, 'this_month_adv', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px', background: '#fffbeb' }}>
                        <input type="number" className="cell-input" value={item.overtime_pay} onChange={e => handleFieldChange(item.id, 'overtime_pay', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px', background: '#f0fdf4' }}>
                        <input type="number" className="cell-input" value={item.bonus} onChange={e => handleFieldChange(item.id, 'bonus', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px', background: '#faf5ff' }}>
                        <input type="number" className="cell-input" value={item.last_month_adjustment} onChange={e => handleFieldChange(item.id, 'last_month_adjustment', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px', background: '#fff7ed' }}>
                        <input type="number" className="cell-input" value={item.internet} onChange={e => handleFieldChange(item.id, 'internet', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px', background: '#fef2f2' }}>
                        <input type="number" className="cell-input" value={item.kafalat} onChange={e => handleFieldChange(item.id, 'kafalat', e.target.value)} />
                      </td>

                      {/* Dynamic Editables */}
                      {adjustmentTypes.map(adj => (
                        <td key={adj.id} style={{ padding: '8px', background: adj.action === 'Add' ? '#f0fdf4' : '#fef2f2' }}>
                          <input 
                            type="number" 
                            className="cell-input" 
                            value={item.dynamic_adjustments?.[adj.label] || 0} 
                            onChange={e => handleDynamicFieldChange(item.id, adj.label, e.target.value)} 
                          />
                        </td>
                      ))}
                      
                      <td style={{ padding: '10px 16px', fontSize: '14px', fontWeight: 800, color: 'var(--primary)', background: '#f0fdf4' }}>
                        {item.net_salary.toFixed(2)}
                      </td>
                      
                      <td style={{ padding: '8px', background: '#f0f9ff' }}>
                        <input type="number" className="cell-input" style={{ fontWeight: 700 }} value={item.paid_in_account} onChange={e => handleFieldChange(item.id, 'paid_in_account', e.target.value)} />
                      </td>
                      
                      <td style={{ padding: '8px' }}>
                        <select className="cell-input" value={item.status} onChange={e => handleTextChange(item.id, 'status', e.target.value)} style={{ width: '100px', fontWeight: 700, color: item.status === 'Paid' ? 'var(--green)' : '#d97706' }}>
                          <option value="Pending">Pending</option>
                          <option value="Paid">Paid</option>
                        </select>
                      </td>

                      {showActions && (
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <button 
                            onClick={() => handleSaveRow(item.id)}
                            disabled={savingRowId === item.id}
                            className="btn btn-primary"
                            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            {savingRowId === item.id ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                            Save
                          </button>
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

      {/* Manual Leave Logging Modal */}
      {showLeaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--white)', borderRadius: '12px', width: '100%', maxWidth: '380px', margin: '0 16px', padding: '24px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Log Special Leave</h3>
              <button onClick={() => setShowLeaveModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveLeave}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Select Employee</label>
                  <select 
                    value={leaveEmployeeId}
                    onChange={e => setLeaveEmployeeId(e.target.value)}
                    required
                    style={{ padding: '10px 12px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '14px', background: 'var(--surface)' }}
                  >
                    <option value="">-- Choose Employee --</option>
                    {employeesList.map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.employee_id || \\\`EMP-\\\${e.id}\\\`})</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Date of Leave</label>
                  <input 
                    type="date" 
                    value={leaveDate}
                    onChange={e => setLeaveDate(e.target.value)}
                    required
                    style={{ padding: '10px 12px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '14px' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                  <input 
                    type="checkbox" 
                    id="isPaidCheckbox"
                    checked={leaveIsPaid}
                    onChange={e => setLeaveIsPaid(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="isPaidCheckbox" style={{ fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                    Mark as Paid Leave
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowLeaveModal(false)} className="btn btn-secondary" style={{ padding: '10px 16px', borderRadius: '8px', border: '1.5px solid var(--surface-2)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={savingLeave} className="btn" style={{ padding: '10px 16px', borderRadius: '8px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  {savingLeave ? 'Saving...' : 'Mark Special Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Adjustments Modal */}
      {showAdjustmentsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--white)', borderRadius: '12px', width: '100%', maxWidth: '500px', margin: '0 16px', padding: '24px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Manage Adjustment Columns</h3>
              <button onClick={() => setShowAdjustmentsModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Current Custom Columns</h4>
              {adjustmentTypes.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No custom columns added yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {adjustmentTypes.map(adj => (
                    <div key={adj.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>{adj.label}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{adj.type} • {adj.action}</span>
                      </div>
                      <button onClick={() => handleDeleteAdjustmentType(adj.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }} title="Delete Column">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ borderTop: '2px dashed var(--surface-2)', paddingTop: '20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Add New Column</h4>
              <form onSubmit={handleSaveAdjustmentType}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Column Name (e.g. Fuel Allowance)</label>
                    <input 
                      type="text" 
                      value={newAdjLabel}
                      onChange={e => setNewAdjLabel(e.target.value)}
                      required
                      placeholder="Column Name"
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--surface-2)', fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>Type</label>
                      <select 
                        value={newAdjType}
                        onChange={e => setNewAdjType(e.target.value)}
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--surface-2)', fontSize: '14px' }}
                      >
                        <option value="One-Time">One-Time (Monthly)</option>
                        <option value="Recurring">Recurring</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>Action</label>
                      <select 
                        value={newAdjAction}
                        onChange={e => setNewAdjAction(e.target.value)}
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--surface-2)', fontSize: '14px' }}
                      >
                        <option value="Add">Add to Salary (+)</option>
                        <option value="Deduct">Deduct from Salary (-)</option>
                      </select>
                    </div>
                  </div>
                </div>
                <button type="submit" disabled={savingAdjType} className="btn btn-primary" style={{ width: '100%', padding: '10px', borderRadius: '6px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                  <Plus size={16} />
                  {savingAdjType ? 'Adding...' : 'Create Column'}
                </button>
              </form>
            </div>

          </div>
        </div>
      )}

      <style>{\`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .cell-input {
          width: 80px;
          padding: 6px 8px;
          border: 1px solid var(--surface-2);
          border-radius: 6px;
          font-size: 13px;
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
      \`}</style>
    </div>
  )
}

const stickyStyle = {
  position: 'sticky',
  boxShadow: '2px 0 5px rgba(0,0,0,0.05)',
}
`

fs.writeFileSync(targetPath, code);
console.log('Payroll.jsx rewritten successfully.');
