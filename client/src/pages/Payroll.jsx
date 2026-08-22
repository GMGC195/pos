import React, { useEffect, useState } from 'react'
import axios from '../api'
import { 
  Calculator, 
  Settings, 
  User, 
  Clock, 
  CalendarDays, 
  Plus, 
  DollarSign, 
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

  // Salary Breakdown Modal State
  const [selectedBreakdown, setSelectedBreakdown] = useState(null)
  const [breakdownOthers, setBreakdownOthers] = useState(0)
  const [breakdownPaidAmount, setBreakdownPaidAmount] = useState(0)
  const [breakdownStatus, setBreakdownStatus] = useState('Pending')
  const [savingRecord, setSavingRecord] = useState(false)

  const openBreakdownModal = (item) => {
    setSelectedBreakdown(item)
    setBreakdownOthers(item.other_adjustments || 0)
    setBreakdownPaidAmount(item.paid_amount || item.net_salary)
    setBreakdownStatus(item.status || 'Pending')
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
      const calculatedNet = selectedBreakdown.base_salary - selectedBreakdown.deductions + selectedBreakdown.overtime_pay + parseFloat(breakdownOthers || 0)
      
      await axios.post('/api/payroll/record', {
        employee_id: selectedBreakdown.id,
        month: selectedMonth,
        base_salary: selectedBreakdown.base_salary,
        presents: selectedBreakdown.presents,
        absents: selectedBreakdown.absents,
        leaves: selectedBreakdown.leaves,
        holidays: selectedBreakdown.holidays,
        overtime_hours: selectedBreakdown.overtime_hours,
        overtime_pay: selectedBreakdown.overtime_pay,
        deductions: selectedBreakdown.deductions,
        other_adjustments: parseFloat(breakdownOthers || 0),
        net_salary: calculatedNet,
        paid_amount: parseFloat(breakdownPaidAmount || 0),
        status: breakdownStatus,
        notes: ''
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
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Header section */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
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
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ background: 'var(--white)', padding: '20px', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>Total Net Payroll</span>
            <div style={{ background: 'rgba(244, 180, 0, 0.1)', color: 'var(--primary)', padding: '8px', borderRadius: '8px' }}>
              <DollarSign size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '24px', fontWeight: 800 }}>{CURRENCY} {totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>For the month of {selectedMonth}</p>
        </div>

        <div style={{ background: 'var(--white)', padding: '20px', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>Total Overtime Paid</span>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--green)', padding: '8px', borderRadius: '8px' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '24px', fontWeight: 800 }}>{CURRENCY} {totalOvertimePay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>Total earned extra hours by staff</p>
        </div>

        <div style={{ background: 'var(--white)', padding: '20px', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>Total Deductions</span>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '8px', borderRadius: '8px' }}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '24px', fontWeight: 800 }}>{CURRENCY} {totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>From unpaid leaves & absents</p>
        </div>

        <div style={{ background: 'var(--white)', padding: '20px', borderRadius: '12px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>Avg Overtime / Employee</span>
            <div style={{ background: 'rgba(16, 60, 67, 0.1)', color: 'var(--secondary)', padding: '8px', borderRadius: '8px' }}>
              <Clock size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '24px', fontWeight: 800 }}>{avgOvertimeHours.toFixed(1)} Hrs</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>Average extra hours worked</p>
        </div>
      </section>

      {/* Filters and Controls */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px', background: 'var(--white)', padding: '16px', borderRadius: '12px', border: '1px solid var(--surface-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Payroll Month</label>
              <input 
                type="month" 
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid var(--surface-2)', borderRadius: '6px', fontSize: '14px', background: 'var(--surface)', fontWeight: 600, color: 'var(--text-primary)' }}
              />
            </div>

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
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
            {isAdmin && (
              <>
                <button 
                  onClick={() => setShowLeaveModal(true)}
                  className="btn btn-secondary payroll-header-btn-inline" 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'var(--secondary)', color: 'white', border: 'none', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', height: '40px', flex: 1 }}
                >
                  <CalendarDays size={15} /> <span className="btn-text">Special Leave</span>
                </button>
                
                <button 
                  onClick={() => setShowOverridesModal(true)}
                  className="btn btn-secondary payroll-header-btn-inline"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--surface-2)', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', height: '40px', flex: 1 }}
                >
                  <DollarSign size={15} /> <span className="btn-text">Manage Salary</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Divider line between month/buttons and search input */}
        <div style={{ height: '1.5px', background: 'var(--surface-2)', width: '100%' }} />

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
            <input 
              type="text"
              placeholder="Search active staff..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid var(--surface-2)', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
            />
          </div>

          <select 
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{
              padding: '10px 12px',
              background: 'var(--white)',
              border: '1px solid var(--surface-2)',
              borderRadius: '8px',
              outline: 'none',
              fontSize: '13px',
              minWidth: '150px',
              cursor: 'pointer',
              height: '40px'
            }}
          >
            {['All', ...new Set(payrollData.map(record => record.branch).filter(Boolean))].map(br => (
              <option key={br} value={br}>{br === 'All' ? 'All Restaurants' : br}</option>
            ))}
          </select>

          <select 
            value={selectedDayNight}
            onChange={e => setSelectedDayNight(e.target.value)}
            style={{
              padding: '10px 12px',
              background: 'var(--white)',
              border: '1px solid var(--surface-2)',
              borderRadius: '8px',
              outline: 'none',
              fontSize: '13px',
              minWidth: '150px',
              cursor: 'pointer',
              height: '40px'
            }}
          >
            <option value="All">All Shifts (Day/Night)</option>
            <option value="Day">Day Shift</option>
            <option value="Night">Night Shift</option>
          </select>

          {(searchQuery !== '' || selectedBranch !== 'All' || selectedDayNight !== 'All') && (
            <button 
              className="btn btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setSelectedBranch('All');
                setSelectedDayNight('All');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 14px',
                borderRadius: '8px',
                height: '40px',
                fontSize: '13px',
                borderColor: 'var(--surface-2)',
                background: 'var(--white)',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </section>

      {/* Main Payroll Table */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--surface-2)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
            <thead>
              <tr style={{ background: 'var(--secondary)', color: 'white', borderBottom: '2px solid var(--surface-2)' }}>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700 }}>Code</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700 }}>Employee Name</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700 }}>Position</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>Base Salary</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>P</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>A</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>L (Paid/Unpaid)</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>H</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>OT Hours</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>OT Pay</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: '#F87171' }}>Deductions</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: 'var(--primary)' }}>Net Salary</th>
                {showActions && <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={showActions ? 13 : 12} style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw className="spin" style={{ margin: '0 auto 10px' }} size={24} />
                    Calculating payroll summaries...
                  </td>
                </tr>
              ) : filteredPayroll.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 13 : 12} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No payroll calculations found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredPayroll.map((item, idx) => {
                  const rowBg = item.status === 'Paid' ? 'rgba(16, 185, 129, 0.08)' : (idx % 2 === 0 ? 'var(--white)' : 'var(--surface)')
                  return (
                    <React.Fragment key={item.id}>
                      <tr 
                        style={{ 
                          background: rowBg, 
                          borderBottom: '1px solid var(--surface-2)',
                          transition: 'background 0.2s' 
                        }}
                        onMouseOver={e => e.currentTarget.style.background = item.status === 'Paid' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 180, 0, 0.08)'}
                        onMouseOut={e => e.currentTarget.style.background = rowBg}
                      >
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>{item.employee_id}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600 }}>{item.name}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>{item.position || 'Staff'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, textAlign: 'right' }}>
                          <button 
                            onClick={() => openBreakdownModal(item)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 'inherit', color: 'inherit', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dashed', outline: 'none' }}
                            title="Click to view breakdown"
                          >
                            {CURRENCY} {item.base_salary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--green)', textAlign: 'center' }}>{item.presents}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#EF4444', textAlign: 'center' }}>{item.absents}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#F97316' }}>{item.leaves}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                            ({item.paid_leaves}P / {item.unpaid_leaves}U)
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 750, color: 'var(--primary)', textAlign: 'center' }}>{item.holidays}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}>{item.overtime_hours}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--green)', textAlign: 'right' }}>
                          +{item.overtime_pay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#EF4444', textAlign: 'right' }}>
                          -{item.deductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 800, color: 'var(--secondary)', textAlign: 'right' }}>
                          <button 
                            onClick={() => openBreakdownModal(item)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 'inherit', color: 'inherit', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dashed', outline: 'none' }}
                            title="Click to view breakdown"
                          >
                            {CURRENCY} {item.net_salary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </button>
                        </td>
                        {showActions && (
                          <td style={{ padding: '12px 16px', textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                            <button 
                              onClick={() => openBreakdownModal(item)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '4px', color: 'var(--secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                              onMouseOver={e => e.currentTarget.style.background = 'var(--surface-2)'}
                              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                              title="View Salary Breakdown"
                            >
                              <Settings size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                      {item.status === 'Paid' && (
                        <tr style={{ background: 'rgba(16, 185, 129, 0.04)', borderBottom: '1px solid var(--surface-2)' }}>
                          <td colSpan={showActions ? 13 : 12} style={{ padding: '8px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--secondary)' }}>
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
        const calculatedNet = Math.max(0, selectedBreakdown.base_salary - selectedBreakdown.deductions + selectedBreakdown.overtime_pay + parseFloat(breakdownOthers || 0))
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--white)', borderRadius: '16px', width: '100%', maxWidth: '460px', margin: '0 16px', padding: '24px', border: '1px solid var(--surface-2)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1.5px solid var(--surface-2)', paddingBottom: '12px', flexShrink: 0 }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--secondary)' }}>Salary Breakdown</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{selectedBreakdown.name} ({selectedBreakdown.employee_id})</span>
                </div>
                <button onClick={() => setSelectedBreakdown(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
                {/* Step 1: Base Salary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-2)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>1. Base Monthly Salary</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Configured default base salary</div>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 750, color: 'var(--text-primary)' }}>
                    {CURRENCY} {selectedBreakdown.base_salary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
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

                {/* Step 4: Other Adjustments (Manual Add/Deduct) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-2)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>4. Others (Add/Deduct)</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Manual additions (+) or deductions (-)</div>
                  </div>
                  <input 
                    type="number"
                    placeholder="e.g. -500 or 1000"
                    value={breakdownOthers}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0
                      setBreakdownOthers(e.target.value)
                      const newNet = Math.max(0, selectedBreakdown.base_salary - selectedBreakdown.deductions + selectedBreakdown.overtime_pay + val)
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

              </div>

              <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
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

    </div>
  )
}
