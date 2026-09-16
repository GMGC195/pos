import React, { useEffect, useState } from 'react'
import axios from '../api'
import { 
  Calculator, 
  Settings, 
  User, 
  Clock, 
  CalendarDays, 
  Plus, 
  Banknote, 
  Users, 
  TrendingUp, 
  Search, 
  RefreshCw, 
  X, 
  AlertTriangle,
  FileText,
  Percent,
  CheckCircle,
  HelpCircle
} from 'lucide-react'
import { CURRENCY } from '../config'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import EmployeeAdjustmentsModal from '../components/EmployeeAdjustmentsModal'

export default function Payroll() {
  const { user } = useAuth()
  const isAdmin = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'developer'
  const showActions = isAdmin

  // State Variables
  const [payrollData, setPayrollData] = useState([])
  const [employeesList, setEmployeesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedBranch, setSelectedBranch] = useState('All')
  const [selectedDayNight, setSelectedDayNight] = useState('All')

  // Global Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [globalOtRate, setGlobalOtRate] = useState('150')
  const [globalAllowedLeaves, setGlobalAllowedLeaves] = useState('2')
  const [savingSettings, setSavingSettings] = useState(false)

  // Employee Overrides Modal State
  const [showOverridesModal, setShowOverridesModal] = useState(false)
  const [overrideEmployeeId, setOverrideEmployeeId] = useState('')
  const [overrideSalary, setOverrideSalary] = useState('')
  const [overrideOtRate, setOverrideOtRate] = useState('')
  const [overrideAllowedLeaves, setOverrideAllowedLeaves] = useState('')
  const [savingOverrides, setSavingOverrides] = useState(false)

  // Leave Modal State
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leaveEmployeeId, setLeaveEmployeeId] = useState('')
  const [leaveDate, setLeaveDate] = useState(() => new Date().toISOString().split('T')[0])
  const [leaveIsPaid, setLeaveIsPaid] = useState(true)
  const [savingLeave, setSavingLeave] = useState(false)

  // Adjustments Modal State
  const [showAdjustmentsModal, setShowAdjustmentsModal] = useState(false)
  const [adjustmentsEmployee, setAdjustmentsEmployee] = useState(null)

  // Salary Breakdown Modal State
  const [selectedBreakdown, setSelectedBreakdown] = useState(null)
  const [breakdownBaseSalary, setBreakdownBaseSalary] = useState(0)
  const [breakdownScheduled, setBreakdownScheduled] = useState(0)
  const [isEditingScheduled, setIsEditingScheduled] = useState(false)
  const [breakdownOthers, setBreakdownOthers] = useState(0)
  const [breakdownPaidAmount, setBreakdownPaidAmount] = useState(0)
  const [breakdownStatus, setBreakdownStatus] = useState('Pending')
  const [breakdownNotes, setBreakdownNotes] = useState('')
  const [savingRecord, setSavingRecord] = useState(false)
  const [breakdownRecurringDetails, setBreakdownRecurringDetails] = useState([])
  const [fetchingRecurringDetails, setFetchingRecurringDetails] = useState(false)
  const [editingAdjustmentId, setEditingAdjustmentId] = useState(null)
  const [editingAdjustmentAmount, setEditingAdjustmentAmount] = useState('')

  const openBreakdownModal = async (item) => {
    setSelectedBreakdown(item)
    setBreakdownBaseSalary(item.base_salary || 0)
    
    // Calculate the original scheduled amount (might have been split if it was negative previously)
    const recAdj = parseFloat(item.recurring_adjustments || 0)
    const advDed = parseFloat(item.advance_deduction || 0)
    setBreakdownScheduled(recAdj - advDed) // Negative value means deduction
    setIsEditingScheduled(false)

    setBreakdownOthers(item.other_adjustments || 0)
    setBreakdownPaidAmount(item.paid_amount || item.net_salary)
    setBreakdownStatus(item.status || 'Pending')
    setBreakdownNotes(item.notes || '')

    setFetchingRecurringDetails(true)
    try {
      const [recRes, adjRes] = await Promise.all([
        axios.get(`/api/payroll/recurring/${item.id}`),
        axios.get(`/api/payroll/adjustments/${item.id}`)
      ]);
      
      const recurring = recRes.data;
      const onetime = adjRes.data.filter(a => a.date && a.date.startsWith(selectedMonth));
      
      const combined = [
        ...recurring.map(r => ({ ...r, uid: `rec_${r.id}`, is_recurring: true, original_amount: r.amount })),
        ...onetime.map(o => ({ ...o, uid: `one_${o.id}`, is_recurring: false, original_amount: o.amount }))
      ];
      
      setBreakdownRecurringDetails(combined);

      let totalFetched = 0;
      combined.forEach(adj => {
        let val = 0;
        if (adj.amount_type === 'Percentage') {
          val = parseFloat(item.base_salary || 0) * (parseFloat(adj.amount) / 100);
        } else {
          val = parseFloat(adj.amount);
        }
        if (adj.action_type === 'Give') totalFetched += val;
        if (adj.action_type === 'Deduct') totalFetched -= val;
      });

      setBreakdownScheduled(totalFetched);
      
      const newNet = Math.max(0, parseFloat(item.base_salary || 0) - item.deductions + item.overtime_pay + totalFetched + parseFloat(item.other_adjustments || 0));
      setBreakdownPaidAmount(newNet.toFixed(2));

    } catch (err) {
      console.error('Failed to fetch details', err)
    } finally {
      setFetchingRecurringDetails(false)
    }
  }
  const handleUpdateAdjustmentAmount = (uid, newAmount) => {
    const amountVal = parseFloat(newAmount) || 0;
    const updated = breakdownRecurringDetails.map(adj => 
      adj.uid === uid ? { ...adj, amount: amountVal } : adj
    );
    setBreakdownRecurringDetails(updated);

    let totalFetched = 0;
    updated.forEach(adj => {
      let val = 0;
      if (adj.amount_type === 'Percentage') {
        val = parseFloat(breakdownBaseSalary || 0) * (parseFloat(adj.amount) / 100);
      } else {
        val = parseFloat(adj.amount);
      }
      if (adj.action_type === 'Give') totalFetched += val;
      if (adj.action_type === 'Deduct') totalFetched -= val;
    });

    setBreakdownScheduled(totalFetched);
    
    const newNet = Math.max(0, parseFloat(breakdownBaseSalary || 0) - selectedBreakdown.deductions + selectedBreakdown.overtime_pay + totalFetched + parseFloat(breakdownOthers || 0));
    setBreakdownPaidAmount(newNet.toFixed(2));
    setEditingAdjustmentId(null);
  }

  // Load calculations
  const loadPayroll = async () => {
    if (!selectedMonth) return
    setLoading(true)
    try {
      const res = await axios.get('/api/payroll/calculate', {
        params: { month: selectedMonth }
      })
      setPayrollData(res.data)
    } catch (err) {
      toast.error('Error loading payroll calculations')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Load employees and settings
  const loadInitialData = async () => {
    try {
      const [empRes, setRes] = await Promise.all([
        axios.get('/api/employees'),
        axios.get('/api/payroll/settings')
      ])
      setEmployeesList(empRes.data.filter(e => e.status === 'Active'))
      
      if (setRes.data) {
        setGlobalOtRate(setRes.data.global_overtime_rate || '150')
        setGlobalAllowedLeaves(setRes.data.allowed_leaves || '2')
      }
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

  // Save Global Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSavingSettings(true)
    try {
      await axios.post('/api/payroll/settings', {
        global_overtime_rate: globalOtRate,
        allowed_leaves: globalAllowedLeaves
      })
      toast.success('Global settings updated successfully!')
      setShowSettingsModal(false)
      loadPayroll()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update global settings')
    } finally {
      setSavingSettings(false)
    }
  }

  // Save Employee Settings Overrides
  const handleSaveOverrides = async (e) => {
    e.preventDefault()
    if (!overrideEmployeeId) {
      toast.error('Please select an employee')
      return
    }
    setSavingOverrides(true)
    try {
      await axios.post(`/api/payroll/overrides/${overrideEmployeeId}`, {
        base_salary: overrideSalary,
        overtime_rate: overrideOtRate,
        allowed_leaves: overrideAllowedLeaves
      })
      toast.success('Employee override settings updated!')
      setShowOverridesModal(false)
      loadPayroll()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update overrides')
    } finally {
      setSavingOverrides(false)
    }
  }

  // Save Leave Log
  const handleSaveLeave = async (e) => {
    e.preventDefault()
    if (!leaveEmployeeId) {
      toast.error('Please select an employee')
      return
    }
    setSavingLeave(true)
    try {
      await axios.post('/api/payroll/leave', {
        employee_id: leaveEmployeeId,
        date: leaveDate,
        is_paid: leaveIsPaid
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

  // Save/Update payroll record database entry
  const handleSavePayrollRecord = async () => {
    if (!selectedBreakdown) return
    setSavingRecord(true)
    try {
      const scheduledVal = parseFloat(breakdownScheduled || 0)
      const manualOthers = parseFloat(breakdownOthers || 0)
      
      const isDeduction = scheduledVal < 0
      const advanceDeduction = isDeduction ? Math.abs(scheduledVal) : 0
      const recurringAdjToSave = isDeduction ? 0 : scheduledVal

      const calculatedNet = parseFloat(breakdownBaseSalary) - selectedBreakdown.deductions + selectedBreakdown.overtime_pay + scheduledVal + manualOthers
      
      await axios.post('/api/payroll/record', {
        employee_id: selectedBreakdown.id,
        month: selectedMonth,
        base_salary: parseFloat(breakdownBaseSalary),
        presents: selectedBreakdown.presents,
        absents: selectedBreakdown.absents,
        leaves: selectedBreakdown.leaves,
        holidays: selectedBreakdown.holidays,
        overtime_hours: selectedBreakdown.overtime_hours,
        overtime_pay: selectedBreakdown.overtime_pay,
        deductions: selectedBreakdown.deductions,
        other_adjustments: manualOthers,
        advance_deduction: advanceDeduction,
        recurring_adjustments: recurringAdjToSave,
        net_salary: calculatedNet,
        paid_amount: parseFloat(breakdownPaidAmount || 0),
        status: breakdownStatus,
        notes: breakdownNotes
      })
      toast.success('Payroll record updated successfully!')
      setSelectedBreakdown(null)
      loadPayroll()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save payroll record')
      console.error(err)
    } finally {
      setSavingRecord(false)
    }
  }

  // Open modal with pre-populated values for override
  const openOverrideModal = (empId) => {
    const record = payrollData.find(p => p.id === empId)
    const emp = employeesList.find(e => e.id === empId)
    if (record) {
      setOverrideEmployeeId(empId)
      setOverrideSalary(record.base_salary || '')
      setOverrideOtRate(record.overtime_rate || '')
      setOverrideAllowedLeaves(record.allowed_leaves || '')
    } else if (emp) {
      setOverrideEmployeeId(empId)
      setOverrideSalary(emp.salary || '')
      setOverrideOtRate(globalOtRate)
      setOverrideAllowedLeaves(globalAllowedLeaves)
    } else {
      setOverrideEmployeeId(empId)
      setOverrideSalary('')
      setOverrideOtRate('')
      setOverrideAllowedLeaves('')
    }
    setShowOverridesModal(true)
  }

  // Filter payroll records based on search query and selected branch
  const filteredPayroll = payrollData.filter(record => {
    const matchesSearch = record.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          record.employee_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBranch = selectedBranch === 'All' || record.branch === selectedBranch;
    
    const emp = employeesList.find(e => e.id === record.id) || record;
    const empShiftVal = String(emp.new_shift || emp.shift || '').toLowerCase();
    let isDay = empShiftVal.includes('day') || empShiftVal === 'd';
    let isNight = empShiftVal.includes('night') || empShiftVal === 'n';
    
    const matchesDayNight = selectedDayNight === 'All' || 
                           (selectedDayNight === 'Day' && isDay) || 
                           (selectedDayNight === 'Night' && isNight);

    return matchesSearch && matchesBranch && matchesDayNight;
  })

  // Calculations for KPI Cards
  const totalPayroll = filteredPayroll.reduce((sum, item) => sum + item.net_salary, 0)
  const totalDeductions = filteredPayroll.reduce((sum, item) => sum + item.deductions, 0)
  const totalOvertimePay = filteredPayroll.reduce((sum, item) => sum + item.overtime_pay, 0)
  const avgOvertimeHours = filteredPayroll.length > 0 
    ? filteredPayroll.reduce((sum, item) => sum + item.overtime_hours, 0) / filteredPayroll.length 
    : 0

  return (
    <div className="page-container" style={{ padding: '12px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Header section */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Calculator style={{ color: 'var(--primary)', marginTop: '2px', flexShrink: 0 }} size={26} /> <span>Employee Payroll & Slips</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', maxWidth: '600px' }}>
            Calculate monthly salary, overtime rate, allowed paid leaves, and log employee leaves manually.
          </p>
        </div>
      </header>

      <style>{`
        @media (max-width: 768px) {
          .payroll-header-btn-inline {
            padding: 6px 8px !important;
            font-size: 11px !important;
          }
          .payroll-header-btn-inline svg {
            width: 13px !important;
            height: 13px !important;
          }
        }
      `}</style>

      {/* KPI Cards Grid */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'var(--white)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Total Net Payroll</span>
            <div style={{ background: 'rgba(244, 180, 0, 0.1)', color: 'var(--primary)', padding: '6px', borderRadius: '6px' }}>
              <Banknote size={16} />
            </div>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{CURRENCY} {totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>For the month of {selectedMonth}</p>
        </div>

        <div style={{ background: 'var(--white)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Total Overtime Paid</span>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--green)', padding: '6px', borderRadius: '6px' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{CURRENCY} {totalOvertimePay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>Total earned extra hours by staff</p>
        </div>

        <div style={{ background: 'var(--white)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Total Deductions</span>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '6px', borderRadius: '6px' }}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{CURRENCY} {totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>From unpaid leaves & absents</p>
        </div>

        <div style={{ background: 'var(--white)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Avg Overtime / Employee</span>
            <div style={{ background: 'rgba(16, 60, 67, 0.1)', color: 'var(--secondary)', padding: '6px', borderRadius: '6px' }}>
              <Clock size={16} />
            </div>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{avgOvertimeHours.toFixed(1)} Hrs</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>Average extra hours worked</p>
        </div>
      </section>

      {/* Filters and Controls */}
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px', background: 'var(--white)', padding: '12px', borderRadius: '12px', border: '1px solid var(--surface-2)' }}>
        
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '150px' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
          <input 
            type="text"
            placeholder="Search active staff..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '13px', outline: 'none', height: '40px' }}
          />
        </div>

        {/* Restaurant Filter */}
        <select 
          value={selectedBranch}
          onChange={e => setSelectedBranch(e.target.value)}
          style={{ padding: '0 12px', background: 'var(--white)', border: '1px solid var(--surface-2)', borderRadius: '8px', outline: 'none', fontSize: '13px', cursor: 'pointer', height: '40px' }}
        >
          {['All', ...new Set(payrollData.map(record => record.branch).filter(Boolean))].map(br => (
            <option key={br} value={br}>{br === 'All' ? 'All Restaurants' : br}</option>
          ))}
        </select>

        {/* Shift Filter */}
        <select 
          value={selectedDayNight}
          onChange={e => setSelectedDayNight(e.target.value)}
          style={{ padding: '0 12px', background: 'var(--white)', border: '1px solid var(--surface-2)', borderRadius: '8px', outline: 'none', fontSize: '13px', cursor: 'pointer', height: '40px' }}
        >
          <option value="All">All Shifts</option>
          <option value="Day">Day Shift</option>
          <option value="Night">Night Shift</option>
        </select>

        {/* Month Filter */}
        <input 
          type="month" 
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          style={{ padding: '0 12px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', fontWeight: 600, color: 'var(--text-primary)', height: '40px' }}
        />

        {/* Setting Button */}
        {isAdmin && (
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40px', width: '40px', padding: '0', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
            title="Global Settings"
          >
            <Settings size={15} />
          </button>
        )}

        {/* Special Leave */}
        {isAdmin && (
          <button 
            onClick={() => setShowLeaveModal(true)}
            className="btn btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--secondary)', color: 'white', border: 'none', padding: '0 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', height: '40px' }}
          >
            <CalendarDays size={15} /> <span className="btn-text">Special Leave</span>
          </button>
        )}

        {/* Manage Salary */}
        {isAdmin && (
          <button 
            onClick={() => setShowOverridesModal(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--surface-2)', padding: '0 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', height: '40px' }}
          >
            <Banknote size={15} /> <span className="btn-text">Manage Salary</span>
          </button>
        )}

        {/* Clear Filters (if active) */}
        {(searchQuery !== '' || selectedBranch !== 'All' || selectedDayNight !== 'All') && (
          <button 
            className="btn btn-secondary"
            onClick={() => {
              setSearchQuery('');
              setSelectedBranch('All');
              setSelectedDayNight('All');
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', borderRadius: '8px', height: '40px', fontSize: '13px', borderColor: 'var(--surface-2)', background: 'var(--white)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </section>

      {/* Main Payroll Table */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--surface-2)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
            <thead>
              <tr style={{ background: 'var(--secondary)', color: 'white', borderBottom: '2px solid var(--surface-2)' }}>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700 }}>Code</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700 }}>Employee Details</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>Status</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>Net Salary</th>
                {showActions && <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={showActions ? 5 : 4} style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw className="spin" style={{ margin: '0 auto 10px' }} size={24} />
                    Calculating payroll summaries...
                  </td>
                </tr>
              ) : filteredPayroll.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 5 : 4} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No payroll calculations found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredPayroll.map((item, idx) => {
                  const isPaid = item.status === 'Paid'
                  const rowBg = isPaid ? 'rgba(16, 185, 129, 0.08)' : (idx % 2 === 0 ? 'var(--white)' : 'var(--surface)')
                  return (
                    <React.Fragment key={item.id}>
                      <tr 
                        style={{ 
                          background: rowBg, 
                          borderBottom: 'none',
                          transition: 'background 0.2s' 
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>{item.employee_id}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.position || 'Staff'}</div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ 
                            padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                            background: isPaid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 180, 0, 0.15)',
                            color: isPaid ? 'var(--green)' : '#d97706'
                          }}>
                            {item.status || 'Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '15px', fontWeight: 800, color: 'var(--primary)', textAlign: 'right' }}>
                          {CURRENCY} {item.net_salary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        {showActions && (
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button 
                                onClick={() => openBreakdownModal(item)}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <Settings size={14} /> Manage
                              </button>
                              <button 
                                onClick={() => {
                                  setAdjustmentsEmployee(item);
                                  setShowAdjustmentsModal(true);
                                }}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-2)' }}
                              >
                                <Banknote size={14} /> Adjustments
                              </button>
                              <button 
                                onClick={() => {
                                  // Simple Print action
                                  const printWindow = window.open('', '_blank');
                                  printWindow.document.write(`
                                    <html>
                                      <head>
                                        <title>Salary Slip - ${item.name}</title>
                                        <style>
                                          body { font-family: sans-serif; padding: 40px; color: #333; }
                                          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #ddd; padding-bottom: 20px; }
                                          .title { font-size: 24px; font-weight: bold; margin: 0 0 10px 0; }
                                          .subtitle { font-size: 16px; color: #666; margin: 0; }
                                          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                                          .box { border: 1px solid #eee; padding: 15px; border-radius: 8px; }
                                          .label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
                                          .value { font-size: 16px; font-weight: bold; }
                                          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                                          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
                                          th { background: #f9f9f9; color: #666; font-size: 13px; }
                                          .right { text-align: right; }
                                          .total-row { font-weight: bold; background: #f0fdf4; }
                                        </style>
                                      </head>
                                      <body>
                                        <div class="header">
                                          <h1 class="title">Salary Slip</h1>
                                          <p class="subtitle">For the month of ${selectedMonth}</p>
                                        </div>
                                        
                                        <div class="grid">
                                          <div class="box">
                                            <div class="label">Employee Details</div>
                                            <div class="value">${item.name} (${item.employee_id})</div>
                                            <div style="margin-top: 5px; font-size: 14px;">${item.position || 'Staff'} - ${item.branch}</div>
                                          </div>
                                          <div class="box">
                                            <div class="label">Attendance Summary</div>
                                            <div style="font-size: 14px; margin-top: 5px;">
                                              Present: ${item.presents} | Absent: ${item.absents} <br/>
                                              Leaves: ${item.leaves} | Holidays: ${item.holidays}
                                            </div>
                                          </div>
                                        </div>

                                        <table>
                                          <thead>
                                            <tr>
                                              <th>Earnings / Deductions</th>
                                              <th class="right">Amount</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            <tr>
                                              <td>Base Salary</td>
                                              <td class="right">${CURRENCY} ${item.base_salary.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                            <tr>
                                              <td>Overtime Pay (${item.overtime_hours} hrs)</td>
                                              <td class="right" style="color: green;">+ ${CURRENCY} ${item.overtime_pay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                            <tr>
                                              <td>Deductions (Absents/Unpaid Leaves)</td>
                                              <td class="right" style="color: red;">- ${CURRENCY} ${item.deductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                            <tr>
                                              <td>Other Adjustments</td>
                                              <td class="right">${item.other_adjustments >= 0 ? '+' : ''} ${CURRENCY} ${(item.other_adjustments || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                            <tr class="total-row">
                                              <td>Net Salary</td>
                                              <td class="right" style="font-size: 18px;">${CURRENCY} ${item.net_salary.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                          </tbody>
                                        </table>
                                        
                                        <div style="margin-top: 50px; font-size: 12px; color: #999; text-align: center;">
                                          ${item.notes ? 'Remarks: ' + item.notes + '<br/><br/>' : ''}
                                          This is a computer generated document.
                                        </div>
                                      </body>
                                    </html>
                                  `);
                                  printWindow.document.close();
                                  setTimeout(() => {
                                    printWindow.print();
                                  }, 500);
                                }}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <FileText size={14} /> Print Slip
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {/* Details Row */}
                      <tr style={{ background: rowBg, borderBottom: '1px solid var(--surface-2)' }}>
                        <td colSpan={showActions ? 5 : 4} style={{ padding: '0 16px 16px 16px' }}>
                          <div style={{ 
                            display: 'flex', flexWrap: 'wrap', gap: '16px', background: 'rgba(0,0,0,0.02)', 
                            padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--surface-2)',
                            fontSize: '12px'
                          }}>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                              <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Base Salary</div>
                              <div style={{ fontWeight: 600 }}>{CURRENCY} {item.base_salary.toLocaleString()}</div>
                            </div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                              <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Attendance</div>
                              <div style={{ fontWeight: 600, display: 'flex', gap: '8px' }}>
                                <span style={{ color: 'var(--green)' }}>P: {item.presents}</span>
                                <span style={{ color: '#EF4444' }}>A: {item.absents}</span>
                                <span style={{ color: '#F97316' }}>L: {item.leaves}</span>
                                <span style={{ color: 'var(--primary)' }}>H: {item.holidays}</span>
                              </div>
                            </div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                              <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Overtime</div>
                              <div style={{ fontWeight: 600, color: 'var(--green)' }}>
                                {item.overtime_hours}h (+{CURRENCY} {item.overtime_pay.toLocaleString()})
                              </div>
                            </div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                              <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Deductions</div>
                              <div style={{ fontWeight: 600, color: '#EF4444' }}>
                                -{CURRENCY} {item.deductions.toLocaleString()}
                              </div>
                            </div>
                            {item.notes && (
                              <div style={{ flex: '1 1 100%', minWidth: '200px', borderTop: '1px solid var(--surface-2)', paddingTop: '8px', marginTop: '4px' }}>
                                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Remarks:</span> <span style={{ fontStyle: 'italic', color: 'var(--text-primary)' }}>{item.notes}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isPaid && (
                        <tr style={{ background: 'rgba(16, 185, 129, 0.04)', borderBottom: '1px solid var(--surface-2)' }}>
                          <td colSpan={showActions ? 5 : 4} style={{ padding: '8px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--secondary)' }}>
                            🎉 <strong style={{ color: 'var(--text-primary)' }}>{item.name}</strong> • Salary Paid: <strong style={{ color: 'var(--green)' }}>{CURRENCY} {item.paid_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSS Spin style */}
      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Global Settings Modal */}
      {showSettingsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--white)', borderRadius: '12px', width: '100%', maxWidth: '380px', margin: '0 16px', padding: '24px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Global Payroll Settings</h3>
              <button onClick={() => setShowSettingsModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveSettings}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Standard Overtime Rate (per hour)</label>
                  <input 
                    type="number" 
                    value={globalOtRate}
                    onChange={e => setGlobalOtRate(e.target.value)}
                    required
                    style={{ padding: '10px 12px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Allowed Paid Leaves (per month)</label>
                  <input 
                    type="number" 
                    value={globalAllowedLeaves}
                    onChange={e => setGlobalAllowedLeaves(e.target.value)}
                    required
                    style={{ padding: '10px 12px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowSettingsModal(false)} className="btn btn-secondary" style={{ padding: '10px 16px', borderRadius: '8px', border: '1.5px solid var(--surface-2)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={savingSettings} className="btn" style={{ padding: '10px 16px', borderRadius: '8px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee Overrides Modal */}
      {showOverridesModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--white)', borderRadius: '12px', width: '100%', maxWidth: '420px', margin: '0 16px', padding: '24px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Employee Salary Configuration</h3>
              <button onClick={() => setShowOverridesModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveOverrides}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Select Employee</label>
                  <select 
                    value={overrideEmployeeId}
                    onChange={e => {
                      const empId = parseInt(e.target.value)
                      openOverrideModal(empId)
                    }}
                    required
                    style={{ padding: '10px 12px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '14px', background: 'var(--surface)' }}
                  >
                    <option value="">-- Choose Employee --</option>
                    {employeesList.map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.employee_id || `EMP-${e.id}`})</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Base Monthly Salary ({CURRENCY})</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 35000"
                    value={overrideSalary}
                    onChange={e => setOverrideSalary(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Custom Overtime Rate (per hour)</label>
                  <input 
                    type="number" 
                    placeholder="Leave empty to use global rate"
                    value={overrideOtRate}
                    onChange={e => setOverrideOtRate(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Custom Allowed Paid Leaves</label>
                  <input 
                    type="number" 
                    placeholder="Leave empty to use global allowance"
                    value={overrideAllowedLeaves}
                    onChange={e => setOverrideAllowedLeaves(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowOverridesModal(false)} className="btn btn-secondary" style={{ padding: '10px 16px', borderRadius: '8px', border: '1.5px solid var(--surface-2)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={savingOverrides} className="btn" style={{ padding: '10px 16px', borderRadius: '8px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  {savingOverrides ? 'Saving...' : 'Apply Overrides'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                      <option key={e.id} value={e.id}>{e.name} ({e.employee_id || `EMP-${e.id}`})</option>
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
                <button type="submit" disabled={savingLeave} className="btn animate-pulse" style={{ padding: '10px 16px', borderRadius: '8px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  {savingLeave ? 'Saving...' : 'Mark Special Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Breakdown Modal */}
      {selectedBreakdown && (() => {
        const calculatedNet = Math.max(0, parseFloat(breakdownBaseSalary) - selectedBreakdown.deductions + selectedBreakdown.overtime_pay + parseFloat(breakdownScheduled || 0) + parseFloat(breakdownOthers || 0))
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--white)', borderRadius: '16px', width: '100%', maxWidth: '850px', margin: '0 16px', padding: '24px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1.5px solid var(--surface-2)', paddingBottom: '12px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--secondary)', margin: 0 }}>Salary Breakdown</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '2px solid var(--surface-2)', paddingLeft: '16px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>{selectedBreakdown.name} ({selectedBreakdown.employee_id})</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', background: 'rgba(244,180,0,0.1)', padding: '4px 10px', borderRadius: '6px' }}>
                      Advance Balance: {CURRENCY} {parseFloat(selectedBreakdown.advance_balance || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedBreakdown(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
              </div>

              <div style={{ display: 'flex', gap: '24px', overflowY: 'hidden', flex: 1 }}>
                {/* Left Column (Formerly Right): Adjustments Breakdown */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: '24px', borderRight: '1px solid var(--surface-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Adjustments Breakdown</h4>
                    <button 
                      onClick={() => {
                        setAdjustmentsEmployee(selectedBreakdown)
                        setShowAdjustmentsModal(true)
                      }}
                      style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', background: 'rgba(59, 130, 246, 0.1)', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Manage
                    </button>
                  </div>
                  
                  {fetchingRecurringDetails ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                      <div style={{ animation: 'spin 1s linear infinite', border: '3px solid var(--surface-2)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '24px', height: '24px' }} />
                    </div>
                  ) : breakdownRecurringDetails.length === 0 ? (
                    <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--surface-2)', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                      No active adjustments or advances for this employee this month.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(() => {
                        const onetimes = breakdownRecurringDetails.filter(a => !a.is_recurring);
                        const repeated = breakdownRecurringDetails.filter(a => a.is_recurring);
                        
                        const renderItem = (adj) => {
                          const isGive = adj.action_type === 'Give';
                          return (
                            <div key={adj.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '8px', border: `1px solid ${isGive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, background: isGive ? 'rgba(16, 185, 129, 0.02)' : 'rgba(239, 68, 68, 0.02)' }}>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 750, color: 'var(--text-primary)' }}>
                                  {adj.type === 'Other' ? adj.label || adj.custom_label : adj.type}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  {adj.amount_type === 'Percentage' ? `${adj.amount}% of Base Salary` : 'Fixed Amount'}
                                </div>
                                {parseFloat(adj.amount) !== parseFloat(adj.original_amount) && (
                                  <div style={{ marginTop: '6px' }}>
                                    <span style={{ background: 'var(--primary)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.3px', display: 'inline-block' }}>
                                      EDITED FOR THIS MONTH
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {editingAdjustmentId === adj.uid ? (
                                  <input 
                                    type="number"
                                    value={editingAdjustmentAmount}
                                    onChange={e => setEditingAdjustmentAmount(e.target.value)}
                                    onBlur={() => handleUpdateAdjustmentAmount(adj.uid, editingAdjustmentAmount)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleUpdateAdjustmentAmount(adj.uid, editingAdjustmentAmount)
                                      if (e.key === 'Escape') setEditingAdjustmentId(null)
                                    }}
                                    autoFocus
                                    style={{ width: '80px', padding: '4px 8px', border: `1px solid ${isGive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`, borderRadius: '4px', fontSize: '13px', textAlign: 'right', fontWeight: 700, color: isGive ? 'var(--green)' : '#EF4444', outline: 'none' }}
                                  />
                                ) : (
                                  <>
                                    <span style={{ fontSize: '14px', fontWeight: 800, color: isGive ? 'var(--green)' : '#EF4444' }}>
                                      {isGive ? '+' : '-'}{CURRENCY} {parseFloat(adj.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    <button type="button" onClick={() => {
                                      setEditingAdjustmentId(adj.uid);
                                      setEditingAdjustmentAmount(adj.amount);
                                    }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }} title="Edit amount for this month">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        };

                        return (
                          <>
                            {repeated.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>For Every Month</div>
                                {repeated.map(renderItem)}
                              </div>
                            )}
                            {onetimes.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: repeated.length > 0 ? '8px' : '0' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>One-time</div>
                                {onetimes.map(renderItem)}
                              </div>
                            )}
                          </>
                        )
                      })()}
                      
                      {/* Total Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--surface-2)', marginTop: '4px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>Total Adjustments</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: breakdownScheduled < 0 ? '#EF4444' : (breakdownScheduled > 0 ? 'var(--green)' : 'var(--text-primary)') }}>
                          {breakdownScheduled < 0 ? '-' : (breakdownScheduled > 0 ? '+' : '')}{CURRENCY} {Math.abs(breakdownScheduled).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                    <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                        These active adjustments are automatically calculated into the total. Use <b>Manage</b> to add or edit them.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column (Formerly Left): Calculation Breakdown */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingLeft: '4px' }}>
                  {/* Step 1: Base Salary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-2)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>1. Base Monthly Salary</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Edit base salary for this record</div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700 }}>{CURRENCY}</span>
                    <input 
                      type="number"
                      value={breakdownBaseSalary}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0
                        setBreakdownBaseSalary(e.target.value)
                        const newNet = Math.max(0, val - selectedBreakdown.deductions + selectedBreakdown.overtime_pay + parseFloat(breakdownScheduled || 0) + parseFloat(breakdownOthers || 0))
                        setBreakdownPaidAmount(newNet.toFixed(2))
                      }}
                      style={{ width: '120px', padding: '6px 10px 6px 40px', border: '1px solid var(--surface-2)', borderRadius: '6px', fontSize: '14px', textAlign: 'right', fontWeight: 750, color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Step 2: Deductions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239, 68, 68, 0.04)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#EF4444' }}>2. Deductions (Minus)</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      Absents: {selectedBreakdown.absents}d • Unpaid Leaves: {selectedBreakdown.unpaid_leaves}d
                    </div>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 750, color: '#EF4444' }}>
                    - {CURRENCY} {selectedBreakdown.deductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Step 3: Overtime Pay */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.04)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)' }}>3. Overtime Pay (Plus)</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      {selectedBreakdown.overtime_hours} hrs @ {selectedBreakdown.overtime_rate}/hr
                    </div>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 750, color: 'var(--green)' }}>
                    + {CURRENCY} {selectedBreakdown.overtime_pay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Step 4: Scheduled Adjustments */}
                  {/* Step 4: Auto Additions & Deductions */}
                  {(() => {
                    let adds = 0;
                    let deds = 0;
                    breakdownRecurringDetails.forEach(adj => {
                      let val = adj.amount_type === 'Percentage' ? parseFloat(breakdownBaseSalary || 0) * (parseFloat(adj.amount) / 100) : parseFloat(adj.amount);
                      if (adj.action_type === 'Give') adds += val;
                      if (adj.action_type === 'Deduct') deds += val;
                    });
                    
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.04)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)' }}>4a. Auto-Additions (Plus)</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Calculated from adjustments</div>
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: 750, color: 'var(--green)' }}>
                            + {CURRENCY} {adds.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239, 68, 68, 0.04)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#EF4444' }}>4b. Auto-Deductions (Minus)</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Calculated from adjustments</div>
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: 750, color: '#EF4444' }}>
                            - {CURRENCY} {deds.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </>
                    )
                  })()}

                {/* Step 5: Other Adjustments (Manual Add/Deduct) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-2)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>5. Others (Manual Add/Deduct)</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Manual additions (+) or deductions (-)</div>
                  </div>
                  <input 
                    type="number"
                    placeholder="e.g. -500 or 1000"
                    value={breakdownOthers}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0
                      setBreakdownOthers(e.target.value)
                      const newNet = Math.max(0, parseFloat(breakdownBaseSalary) - selectedBreakdown.deductions + selectedBreakdown.overtime_pay + parseFloat(breakdownScheduled || 0) + val)
                      setBreakdownPaidAmount(newNet.toFixed(2))
                    }}
                    style={{ width: '120px', padding: '6px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}
                  />
                </div>

                {/* Divider */}
                <div style={{ borderTop: '1.5px dashed var(--surface-2)', margin: '4px 0' }} />

                {/* Net Calculated Output */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 60, 67, 0.03)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--surface-2)' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--secondary)' }}>Net Calculated Salary</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Calculated final balance</div>
                  </div>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--secondary)' }}>
                    {CURRENCY} {calculatedNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Manual Paid Amount Input */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(244, 180, 0, 0.05)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--primary)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Actual Paid Salary</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Manually paid/disbursed amount</div>
                  </div>
                  <input 
                    type="number"
                    value={breakdownPaidAmount}
                    onChange={e => setBreakdownPaidAmount(e.target.value)}
                    style={{ width: '120px', padding: '6px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', fontSize: '13px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}
                  />
                </div>

                {/* Status Selector */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-2)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Payment Status</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Set status of this transaction</div>
                  </div>
                  <select
                    value={breakdownStatus}
                    onChange={e => setBreakdownStatus(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: 'white' }}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Paid">Paid</option>
                  </select>
                </div>

                {/* Remarks Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-2)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Remarks / Notes</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Optional notes for this payroll record</div>
                  </div>
                  <textarea 
                    value={breakdownNotes}
                    onChange={e => setBreakdownNotes(e.target.value)}
                    placeholder="Enter remarks here..."
                    rows={2}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--surface-2)', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }}
                  />
                </div>

              </div>

            </div>

            <div style={{ display: 'flex', gap: '10px', flexShrink: 0, marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--surface-2)' }}>
              <button 
                  type="button" 
                  onClick={() => setSelectedBreakdown(null)}
                  style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', border: '1.5px solid var(--surface-2)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  disabled={savingRecord}
                  onClick={handleSavePayrollRecord}
                  style={{ flex: 2, padding: '10px 16px', borderRadius: '8px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                >
                  {savingRecord ? 'Saving...' : 'Save & Mark Done'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Financial Adjustments Modal */}
      {showAdjustmentsModal && adjustmentsEmployee && (
        <EmployeeAdjustmentsModal
          isOpen={showAdjustmentsModal}
          employee={adjustmentsEmployee}
          onClose={() => setShowAdjustmentsModal(false)}
          onUpdate={(updatedEmp) => {
            // Update the payroll data in state with the new advance balance
            setPayrollData(prev => prev.map(p => {
              if (p.employee_id === updatedEmp.employee_id || p.id === updatedEmp.id) {
                return { ...p, advance_balance: updatedEmp.advance_balance };
              }
              return p;
            }));
            loadPayroll(); // Refresh payroll fully to get recalculated values if they impact salary
          }}
        />
      )}

    </div>
  )
}
