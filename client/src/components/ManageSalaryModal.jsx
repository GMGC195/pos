import React, { useState, useEffect } from 'react'
import { Banknote, Search, Save, RefreshCw, X, AlertCircle, CheckCircle, Calculator } from 'lucide-react'
import axios from '../api'
import toast from 'react-hot-toast'
import { CURRENCY } from '../config'

export default function ManageSalaryModal({ isOpen, onClose, onUpdated, month }) {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('All')
  const [salaryMap, setSalaryMap] = useState({})
  const [originalSalaryMap, setOriginalSalaryMap] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [savingAll, setSavingAll] = useState(false)

  // Determine days in month
  const currentMonthStr = month || new Date().toISOString().substring(0, 7)
  const [yearStr, monthStr] = currentMonthStr.split('-')
  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate()

  useEffect(() => {
    if (isOpen) {
      loadEmployeeSalaries()
    }
  }, [isOpen, currentMonthStr])

  const loadEmployeeSalaries = async () => {
    setLoading(true)
    try {
      // Fetch both active employees and any current overrides
      const [empRes, overridesRes] = await Promise.all([
        axios.get('/api/employees'),
        axios.get('/api/payroll/overrides')
      ])

      const overridesMap = {}
      if (Array.isArray(overridesRes.data)) {
        overridesRes.data.forEach(o => {
          overridesMap[o.employee_id] = o
        })
      }

      const activeList = (empRes.data || []).filter(e => e.status === 'Active')
      setEmployees(activeList)

      const initialSalaries = {}
      activeList.forEach(emp => {
        const override = overridesMap[emp.id]
        const val = override?.base_salary !== undefined && override?.base_salary !== null 
          ? parseFloat(override.base_salary) 
          : parseFloat(emp.salary || 0)
        initialSalaries[emp.id] = val
      })

      setSalaryMap(initialSalaries)
      setOriginalSalaryMap(initialSalaries)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load employee salaries')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const handleSalaryChange = (empId, value) => {
    const numeric = value === '' ? '' : parseFloat(value)
    setSalaryMap(prev => ({
      ...prev,
      [empId]: numeric
    }))
  }

  const handleSaveSingle = async (empId) => {
    const salaryVal = salaryMap[empId]
    if (salaryVal === '' || isNaN(salaryVal) || salaryVal < 0) {
      toast.error('Please enter a valid salary amount')
      return
    }

    setSavingId(empId)
    try {
      await axios.post(`/api/payroll/overrides/${empId}`, {
        base_salary: salaryVal
      })
      toast.success('Salary updated successfully')
      setOriginalSalaryMap(prev => ({ ...prev, [empId]: salaryVal }))
      if (onUpdated) onUpdated()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update salary')
    } finally {
      setSavingId(null)
    }
  }

  const handleSaveAll = async () => {
    // Collect all changed salaries
    const changedSalaries = []
    Object.keys(salaryMap).forEach(empId => {
      if (salaryMap[empId] !== originalSalaryMap[empId] && salaryMap[empId] !== '') {
        changedSalaries.push({
          employee_id: parseInt(empId),
          base_salary: parseFloat(salaryMap[empId])
        })
      }
    })

    if (changedSalaries.length === 0) {
      toast('No changes detected to save', { icon: 'ℹ️' })
      return
    }

    setSavingAll(true)
    try {
      await axios.post('/api/payroll/salaries/batch', {
        salaries: changedSalaries
      })
      toast.success(`Successfully updated ${changedSalaries.length} employee salary records!`)
      setOriginalSalaryMap({ ...salaryMap })
      if (onUpdated) onUpdated()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to batch update salaries')
    } finally {
      setSavingAll(false)
    }
  }

  const formatBranchName = (val) => {
    if (!val) return 'R1'
    const s = String(val).trim()
    if (/3|restaurant\s*3|branch\s*3|r3/i.test(s)) return 'R3'
    if (/2|restaurant\s*2|branch\s*2|r2/i.test(s)) return 'R2'
    if (/1|restaurant\s*1|branch\s*1|r1/i.test(s)) return 'R1'
    return s.length <= 4 ? s.toUpperCase() : s
  }

  const branches = ['All', 'R1', 'R2', 'R3']

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          String(emp.employee_code || emp.id).toLowerCase().includes(searchQuery.toLowerCase())
    const empBranchCode = formatBranchName(emp.branch)
    const matchesBranch = selectedBranch === 'All' || empBranchCode === selectedBranch
    return matchesSearch && matchesBranch
  })

  const hasUnsavedChanges = Object.keys(salaryMap).some(id => salaryMap[id] !== originalSalaryMap[id])
  const totalBaseSalary = Object.values(salaryMap).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)

  return (
    <div 
      className="modal-overlay" 
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div 
        style={{ 
          background: 'var(--white, #fff)', 
          borderRadius: 16, 
          width: '100%', 
          maxWidth: 950, 
          maxHeight: '92vh', 
          display: 'flex', 
          flexDirection: 'column', 
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          border: '1px solid var(--surface-2, #e2e8f0)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--surface-2, #e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface, #f8fafc)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(244, 180, 0, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Banknote size={20} style={{ color: 'var(--primary, #d97706)' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}>
                Manage Employee Base Salaries
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>
                Set monthly basic salaries. Hourly & per-minute rates calculate automatically based on {daysInMonth} days in {currentMonthStr}.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #94a3b8)', padding: 6, borderRadius: '50%' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters & Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--surface-2, #e2e8f0)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'var(--white, #fff)' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)' }} />
            <input 
              type="text" 
              placeholder="Search employee by name or code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid var(--surface-2, #cbd5e1)', fontSize: 13, outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>Branch:</span>
            <select 
              value={selectedBranch} 
              onChange={e => setSelectedBranch(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--surface-2, #cbd5e1)', fontSize: 13, outline: 'none', background: 'var(--white, #fff)' }}
            >
              {branches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>Total Active: <b>{filteredEmployees.length}</b></span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>•</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>Total Base: <b>{CURRENCY} {totalBaseSalary.toLocaleString()}</b></span>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ overflowY: 'auto', flex: 1, maxHeight: '60vh' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
              <div style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', border: '3px solid #e2e8f0', borderTopColor: 'var(--primary, #d97706)', borderRadius: '50%', width: 26, height: 26 }} />
              Loading employees and salaries...
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
              No employees found matching filter.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface, #f8fafc)', borderBottom: '2px solid var(--surface-2, #e2e8f0)', zIndex: 5 }}>
                <tr>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-secondary, #475569)' }}>Employee</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-secondary, #475569)' }}>Branch & Shift</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-secondary, #475569)' }}>Scheduled Hours ({daysInMonth}d)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-secondary, #475569)' }}>Base Salary ({CURRENCY})</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-secondary, #475569)' }}>Per-Hour Rate</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-secondary, #475569)' }}>Per-Min Rate</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-secondary, #475569)', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp, idx) => {
                  const shiftHours = parseFloat(emp.shift_hours || 12.0)
                  const scheduledMonthHours = Math.round(daysInMonth * shiftHours * 100) / 100
                  const currentSalary = salaryMap[emp.id] !== undefined ? salaryMap[emp.id] : ''
                  const isChanged = currentSalary !== originalSalaryMap[emp.id]
                  
                  const numSalary = parseFloat(currentSalary) || 0
                  const hourlyRate = scheduledMonthHours > 0 ? (numSalary / scheduledMonthHours) : 0
                  const minuteRate = scheduledMonthHours > 0 ? (numSalary / (scheduledMonthHours * 60)) : 0

                  return (
                    <tr 
                      key={emp.id} 
                      style={{ 
                        borderBottom: '1px solid var(--surface-2, #e2e8f0)',
                        background: isChanged ? 'rgba(254, 243, 199, 0.3)' : idx % 2 === 0 ? 'var(--white, #fff)' : 'var(--surface, #fafbfd)',
                        transition: 'background 0.2s'
                      }}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>{emp.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>Code: {emp.employee_code || emp.id} • {emp.role || emp.position || 'Staff'}</div>
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ background: '#e2e8f0', color: '#1e293b', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
                          {formatBranchName(emp.branch)}
                        </span>
                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>
                          {shiftHours}h/day
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>
                        {scheduledMonthHours}h
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted, #94a3b8)' }}>{CURRENCY}</span>
                          <input 
                            type="number"
                            min="0"
                            step="50"
                            value={currentSalary}
                            onChange={e => handleSalaryChange(emp.id, e.target.value)}
                            style={{ 
                              width: 105, 
                              padding: '6px 10px', 
                              borderRadius: 6, 
                              border: isChanged ? '1.5px solid var(--primary, #d97706)' : '1px solid var(--surface-2, #cbd5e1)', 
                              fontSize: 13, 
                              fontWeight: 700, 
                              color: '#7c3aed',
                              background: isChanged ? '#fffbeb' : '#fff',
                              outline: 'none'
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#059669' }}>
                        {CURRENCY} {hourlyRate.toFixed(2)}/h
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>
                        {CURRENCY} {minuteRate.toFixed(4)}/m
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button 
                          onClick={() => handleSaveSingle(emp.id)}
                          disabled={savingId === emp.id || !isChanged}
                          className="btn btn-secondary"
                          style={{ 
                            padding: '4px 10px', 
                            fontSize: 12, 
                            fontWeight: 700, 
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            cursor: isChanged ? 'pointer' : 'default',
                            opacity: isChanged ? 1 : 0.45,
                            background: isChanged ? 'var(--primary, #f59e0b)' : 'var(--surface-2, #e2e8f0)',
                            color: isChanged ? '#111' : '#64748b',
                            border: 'none'
                          }}
                        >
                          {savingId === emp.id ? <RefreshCw size={12} className="spin" /> : <Save size={12} />}
                          Save
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--surface-2, #e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface, #f8fafc)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasUnsavedChanges ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={14} /> Unsaved salary changes pending
              </span>
            ) : (
              <span style={{ fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={14} /> All salaries in sync with payroll
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              onClick={onClose}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, background: '#e2e8f0', border: 'none', cursor: 'pointer' }}
            >
              Close
            </button>
            <button 
              onClick={handleSaveAll}
              disabled={savingAll || !hasUnsavedChanges}
              className="btn btn-primary"
              style={{ 
                padding: '8px 18px', 
                fontSize: 13, 
                fontWeight: 700, 
                borderRadius: 8, 
                background: hasUnsavedChanges ? 'var(--primary, #d97706)' : '#cbd5e1', 
                color: '#fff', 
                border: 'none', 
                cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed',
                display: 'flex', 
                alignItems: 'center', 
                gap: 6,
                boxShadow: hasUnsavedChanges ? '0 4px 12px rgba(217, 119, 6, 0.25)' : 'none'
              }}
            >
              {savingAll ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
              {savingAll ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
