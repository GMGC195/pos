import { useEffect, useState } from 'react'
import axios from '../api'
import { Users, UserPlus, Search, Edit2, Trash2, X, ShieldAlert, FileSpreadsheet, Settings, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import ImportEmployeesModal from '../components/ImportEmployeesModal'
import { useAuth } from '../contexts/AuthContext'



const calculateHoursDiff = (startTime24, endTime24) => {
  if (!startTime24 || !endTime24) return 12.0;
  const [startH, startM] = startTime24.split(':').map(Number);
  const [endH, endM] = endTime24.split(':').map(Number);
  
  let diffMins = (endH * 60 + endM) - (startH * 60 + startM);
  if (diffMins < 0) {
    diffMins += 1440;
  }
  return parseFloat((diffMins / 60).toFixed(2));
};

const decimalHoursToText = (hoursDec) => {
  if (isNaN(hoursDec) || hoursDec === null || hoursDec === undefined) return '';
  const totalMins = Math.round(hoursDec * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
  if (hrs > 0) return `${hrs} hr`;
  return `${mins} min`;
};

const confirmAction = (message, onConfirm) => {
  toast((t) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px' }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
        {message}
      </span>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button 
          onClick={() => toast.dismiss(t.id)}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1.5px solid var(--surface-3)',
            borderRadius: 6,
            fontSize: 12,
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
            padding: '6px 12px',
            background: 'var(--primary)',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            color: 'white'
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  ), {
    duration: 10000,
    position: 'top-center',
    style: {
      background: 'var(--surface)',
      border: '1.5px solid var(--surface-2)',
      borderRadius: 12,
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      padding: '12px 16px',
      minWidth: 280
    }
  });
};

export default function Employees() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState(() => {
    const cached = localStorage.getItem('pizza_shop_employees')
    return cached ? JSON.parse(cached) : []
  })
  const [loading, setLoading] = useState(() => {
    const cached = localStorage.getItem('pizza_shop_employees')
    return !cached
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [selectedDept, setSelectedDept] = useState('All')
  const [selectedShift, setSelectedShift] = useState('All')
  const [selectedPosition, setSelectedPosition] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    role: 'Operator',
    salary: 0,
    status: 'Active',
    shift: 'R1',
    shift_hours: 13.0,
    shift_start_time: '10:00',
    shift_end_time: '23:00',
    department: '',
    position: '',
    employee_id: ''
  })
  const [isCustomShift, setIsCustomShift] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Shifts configuration state
  const [shifts, setShifts] = useState([])
  const [showShiftConfig, setShowShiftConfig] = useState(false)
  const [newShiftForm, setNewShiftForm] = useState({ name: '', start_time: '10:00', end_time: '23:00', hours: 13.0 })
  const [editingShiftId, setEditingShiftId] = useState(null)

  const loadShifts = () => {
    axios.get('/api/employees/shifts/list')
      .then(res => setShifts(res.data))
      .catch(() => toast.error('Error loading shifts'))
  }

  const loadEmployees = (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    axios.get('/api/employees')
      .then(res => {
        setEmployees(res.data)
        localStorage.setItem('pizza_shop_employees', JSON.stringify(res.data))
      })
      .catch(() => {
        const cached = localStorage.getItem('pizza_shop_employees')
        if (cached && employees.length === 0) {
          setEmployees(JSON.parse(cached))
        }
      })
      .finally(() => {
        if (showSpinner) setLoading(false)
      })
  }

  useEffect(() => {
    const hasCache = !!localStorage.getItem('pizza_shop_employees')
    loadEmployees(!hasCache)
    loadShifts()
  }, [])

  const handleOpenAdd = () => {
    setEditingEmployee(null)
    setIsCustomShift(false)
    setFormData({
      name: '',
      role: 'Operator',
      salary: 0,
      status: 'Active',
      shift: shifts[0]?.name || 'R1',
      shift_hours: parseFloat(shifts[0]?.hours || 13.0),
      shift_start_time: shifts[0]?.start_time || '10:00',
      shift_end_time: shifts[0]?.end_time || '23:00',
      department: '',
      position: '',
      employee_id: ''
    })
    setShowModal(true)
  }

  const handleOpenEdit = (emp) => {
    setEditingEmployee(emp)
    const currentShift = emp.shift || 'R1'
    const matchedShift = shifts.find(s => s.name === currentShift)
    const isPredefined = !!matchedShift
    
    setIsCustomShift(!isPredefined)
    setFormData({
      name: emp.name,
      role: emp.role || 'Operator',
      salary: emp.salary || 0,
      status: emp.status || 'Active',
      shift: currentShift,
      shift_hours: parseFloat(emp.shift_hours || 12.0),
      shift_start_time: matchedShift ? matchedShift.start_time : '10:00',
      shift_end_time: matchedShift ? matchedShift.end_time : '23:00',
      department: emp.department || '',
      position: emp.position || '',
      employee_id: emp.employee_id || ''
    })
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingEmployee(null)
  }

  const handleTimeChange = (field, val24h) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: val24h }
      const start24 = field === 'shift_start_time' ? val24h : prev.shift_start_time
      const end24 = field === 'shift_end_time' ? val24h : prev.shift_end_time
      updated.shift_hours = calculateHoursDiff(start24, end24)
      return updated
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name) return toast.error('Name is required')
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      const targetShiftName = formData.shift.trim().toUpperCase()
      const exists = shifts.some(s => s.name.toUpperCase() === targetShiftName)
      
      if (isCustomShift && !exists) {
        await axios.post('/api/employees/shifts/list', {
          name: targetShiftName,
          start_time: formData.shift_start_time,
          end_time: formData.shift_end_time,
          hours: formData.shift_hours
        })
      }

      const payload = {
        ...formData,
        shift: targetShiftName
      }

      if (editingEmployee) {
        // Update
        await axios.put(`/api/employees/${editingEmployee.id}`, payload)
        toast.success('Employee updated successfully!')
      } else {
        // Create
        await axios.post('/api/employees', payload)
        toast.success('Employee added successfully!')
      }
      handleCloseModal()
      loadEmployees()
      loadShifts()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save employee')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id, name) => {
    confirmAction(`Are you sure you want to remove employee "${name}"?`, async () => {
      try {
        await axios.delete(`/api/employees/${id}`)
        toast.success('Employee deleted')
        loadEmployees()
      } catch (err) {
        toast.error('Failed to delete employee')
      }
    });
  }

  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))].sort()
  const positions = [...new Set(employees.map(e => e.position).filter(Boolean))].sort()
  const shiftsList = [...new Set(employees.map(e => e.shift).filter(Boolean))].sort()

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (emp.department && emp.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (emp.position && emp.position.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesDept = selectedDept === 'All' || emp.department === selectedDept
    const matchesPosition = selectedPosition === 'All' || emp.position === selectedPosition
    const matchesShift = selectedShift === 'All' || emp.shift === selectedShift
    const matchesStatus = selectedStatus === 'All' || emp.status === selectedStatus
    return matchesSearch && matchesDept && matchesPosition && matchesShift && matchesStatus
  })

  return (
    <div className="page-content" style={{ paddingTop: 0 }}>
      {/* Header and Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: -60, flexWrap: 'wrap', gap: 16 }}>
        <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={24} style={{ color: 'var(--primary)' }} /> Employee Management
        </h3>

        <div className="employees-action-group" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Stats group */}
          <div className="emp-stats-row" style={{ display: 'flex', gap: 8 }}>
            <div className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, cursor: 'default', pointerEvents: 'none', justifyContent: 'center' }}>
              <Users size={18} /> Total: {employees.length}
            </div>
            <div className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, cursor: 'default', pointerEvents: 'none', justifyContent: 'center' }}>
              <Users size={18} /> Active: {employees.filter(e => e.status === 'Active').length}
            </div>
          </div>

          {/* Buttons group */}
          <div className="emp-buttons-row" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowShiftConfig(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, justifyContent: 'center' }}>
              <Settings size={18} /> Manage Shifts
            </button>
            <button className="btn btn-secondary" onClick={() => setShowImportModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, justifyContent: 'center' }}>
              <FileSpreadsheet size={18} /> Import Employees
            </button>
          </div>

          <button className="btn btn-primary emp-add-btn" onClick={handleOpenAdd} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, justifyContent: 'center' }}>
            <UserPlus size={18} /> Add Employee
          </button>
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .employees-action-group {
            width: 100%;
            flex-direction: column;
            align-items: stretch !important;
            gap: 8px !important;
          }
          .emp-stats-row, .emp-buttons-row {
            width: 100%;
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 8px !important;
            flex: none !important;
          }
          .emp-stats-row > div, .emp-buttons-row > button {
            height: 38px !important;
            font-size: 12px !important;
            padding: 0 8px !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .emp-add-btn {
            width: 100%;
            height: 38px !important;
            font-size: 12px !important;
          }
          .employee-filters {
            width: 100%;
            display: none !important;
            grid-template-columns: 1fr 1fr;
            gap: 8px !important;
          }
          .employee-filters.show-mobile {
            display: grid !important;
          }
          .employee-filters > select {
            width: 100% !important;
            min-width: 0 !important;
          }
          .filter-mobile-toggle-btn {
            display: flex !important;
          }
        }
      `}</style>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
          <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 250, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, border: '1px solid var(--surface-2)', borderRadius: 8, padding: '0 12px', background: 'var(--surface-1)' }}>
              <Search size={18} style={{ color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search by name, department, or position..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', border: 'none', outline: 'none', padding: '10px 8px', background: 'transparent', color: 'var(--text)' }}
              />
            </div>
            
            <button 
              className="btn btn-secondary filter-mobile-toggle-btn"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, padding: 0, borderRadius: 8 }}
            >
              <Filter size={18} style={{ color: showMobileFilters ? 'var(--primary)' : 'var(--text)' }} />
            </button>
          </div>
          
          <div className={`employee-filters ${showMobileFilters ? 'show-mobile' : ''}`} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', cursor: 'pointer', minWidth: 140 }}
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={selectedPosition}
              onChange={e => setSelectedPosition(e.target.value)}
              style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', cursor: 'pointer', minWidth: 140 }}
            >
              <option value="All">All Positions</option>
              {positions.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={selectedShift}
              onChange={e => setSelectedShift(e.target.value)}
              style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', cursor: 'pointer', minWidth: 120 }}
            >
              <option value="All">All Shifts</option>
              {shiftsList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', cursor: 'pointer', minWidth: 120 }}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            {(searchTerm !== '' || selectedDept !== 'All' || selectedPosition !== 'All' || selectedShift !== 'All' || selectedStatus !== 'All') && (
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedDept('All');
                  setSelectedPosition('All');
                  setSelectedShift('All');
                  setSelectedStatus('All');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 14px',
                  borderRadius: 8,
                  height: 40,
                  fontSize: 13,
                  borderColor: 'var(--surface-2)',
                  background: 'var(--surface)',
                  color: 'var(--text)'
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Emp ID</th>
                <th style={{ width: '150px' }}>Name</th>
                <th>Department</th>
                <th>Position</th>
                <th>Shift</th>
                <th>Duty Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    Loading employees...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    No employees found matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                      {emp.employee_id || `EMP-${String(emp.id).padStart(4, '0')}`}
                    </td>
                    <td style={{ maxWidth: '150px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      <div style={{ fontWeight: 600 }}>{emp.name}</div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Joined {new Date(emp.created_at).toLocaleDateString()}</span>
                    </td>
                    <td>
                      {emp.department || <span style={{ color: 'var(--text-muted)' }}>--</span>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 550 }}>{emp.position || 'Staff'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: 13 }}>
                        {emp.shift || 'R1'}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {parseFloat(emp.shift_hours || 12.0).toFixed(1)} Hrs
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${emp.status === 'Active' ? 'badge-success' : 'badge-danger'}`} style={{
                        background: emp.status === 'Active' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: emp.status === 'Active' ? 'var(--green)' : 'var(--red)',
                        padding: '4px 10px', borderRadius: 6, fontSize: 12
                      }}>
                        {emp.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {user?.role?.toLowerCase() !== 'management' ? (
                          <>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(emp)} style={{ padding: '6px 8px' }}>
                              <Edit2 size={14} />
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(emp.id, emp.name)} style={{ padding: '6px 8px', color: 'var(--red)' }}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Read Only</span>
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 500, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--surface-2)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {editingEmployee ? 'Edit Employee Info' : 'Register New Employee'}
              </h3>
              <button onClick={handleCloseModal} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Full Name *</label>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                  />
                </div>





                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Department</label>
                    <input 
                      type="text" 
                      value={formData.department}
                      onChange={e => setFormData({ ...formData, department: e.target.value })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Position / Title</label>
                    <input 
                      type="text" 
                      value={formData.position}
                      onChange={e => setFormData({ ...formData, position: e.target.value })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Employee ID</label>
                    <input 
                      type="text" 
                      readOnly
                      placeholder="Auto Generated"
                      value={formData.employee_id}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--text-muted)', outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Employment Status</label>
                    <select 
                      value={formData.status}
                      onChange={e => setFormData({ ...formData, status: e.target.value })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Assigned Shift</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select 
                        disabled={user?.role?.toLowerCase() === 'management'}
                        value={isCustomShift ? 'Custom' : formData.shift}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === 'Custom') {
                            setIsCustomShift(true)
                            setFormData(prev => ({ 
                              ...prev, 
                              shift: 'CUSTOM_R1', 
                              shift_hours: 12.0,
                              shift_start_time: '10:00',
                              shift_end_time: '22:00'
                            }))
                          } else {
                            setIsCustomShift(false)
                            const matchedShift = shifts.find(s => s.name === val)
                            setFormData(prev => ({ 
                              ...prev, 
                              shift: val, 
                              shift_hours: matchedShift ? parseFloat(matchedShift.hours) : 12.0,
                              shift_start_time: matchedShift ? matchedShift.start_time : '10:00',
                              shift_end_time: matchedShift ? matchedShift.end_time : '23:00'
                            }))
                          }
                        }}
                        style={{ flex: 1, border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                      >
                        {shifts.map(s => (
                          <option key={s.id} value={s.name}>{s.name} ({s.start_time} - {s.end_time})</option>
                        ))}
                        <option value="Custom">Custom Shift...</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Shift Standard Hours {formData.shift_hours ? `(${decimalHoursToText(formData.shift_hours)})` : ''}
                    </label>
                    <input 
                      type="text" 
                      readOnly
                      value={decimalHoursToText(formData.shift_hours)}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--text-muted)', outline: 'none' }}
                    />
                  </div>
                </div>

                {isCustomShift && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Custom Shift Name</label>
                        <input 
                          type="text"
                          placeholder="e.g. R4"
                          value={formData.shift}
                          onChange={e => setFormData(prev => ({ ...prev, shift: e.target.value }))}
                          style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Start Time</label>
                        <input 
                          type="time"
                          lang="en-GB"
                          value={formData.shift_start_time}
                          onChange={e => handleTimeChange('shift_start_time', e.target.value)}
                          style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>End Time</label>
                        <input 
                          type="time"
                          lang="en-GB"
                          value={formData.shift_end_time}
                          onChange={e => handleTimeChange('shift_end_time', e.target.value)}
                          style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, borderTop: '1px solid var(--surface-2)', paddingTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal} disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Configuration Management Modal */}
      {showShiftConfig && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--surface-2)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Manage Shift Timings</h3>
              <button onClick={() => { setShowShiftConfig(false); setEditingShiftId(null); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: 24 }}>
              {/* Shift Form */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (editingShiftId) {
                    await axios.put(`/api/employees/shifts/list/${editingShiftId}`, newShiftForm)
                    toast.success('Shift config updated!')
                  } else {
                    await axios.post('/api/employees/shifts/list', newShiftForm)
                    toast.success('New shift configured!')
                  }
                  setNewShiftForm({ name: '', start_time: '10:00', end_time: '23:00', hours: 13.0 })
                  setEditingShiftId(null)
                  loadShifts()
                } catch (err) {
                  toast.error(err?.response?.data?.error || 'Failed to save shift')
                }
              }} style={{ marginBottom: 20, background: 'var(--surface-1)', padding: 16, borderRadius: 10, border: '1px solid var(--surface-2)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700 }}>{editingShiftId ? 'Edit Shift Config' : 'Configure New Shift'}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Shift Name (e.g. R4)</label>
                    <input 
                      type="text" 
                      required
                      placeholder="R4"
                      value={newShiftForm.name}
                      onChange={e => setNewShiftForm({ ...newShiftForm, name: e.target.value })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 6, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Standard Hours</label>
                    <input 
                      type="number" 
                      step="0.5"
                      required
                      value={newShiftForm.hours}
                      onChange={e => setNewShiftForm({ ...newShiftForm, hours: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 6, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Start Time</label>
                    <input 
                      type="time" 
                      lang="en-GB"
                      required
                      value={newShiftForm.start_time}
                      onChange={e => setNewShiftForm({ ...newShiftForm, start_time: e.target.value })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 6, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>End Time</label>
                    <input 
                      type="time" 
                      lang="en-GB"
                      required
                      value={newShiftForm.end_time}
                      onChange={e => setNewShiftForm({ ...newShiftForm, end_time: e.target.value })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 6, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  {editingShiftId && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                      setNewShiftForm({ name: '', start_time: '10:00', end_time: '23:00', hours: 13.0 });
                      setEditingShiftId(null);
                    }}>Cancel Edit</button>
                  )}
                  <button type="submit" className="btn btn-primary btn-sm">{editingShiftId ? 'Save Changes' : 'Add Shift'}</button>
                </div>
              </form>

              {/* Configured Shifts List */}
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--surface-2)', textAlign: 'left', background: 'var(--surface-2)' }}>
                      <th style={{ padding: 8, fontSize: 12 }}>Name</th>
                      <th style={{ padding: 8, fontSize: 12 }}>Timing</th>
                      <th style={{ padding: 8, fontSize: 12 }}>Duty Hrs</th>
                      <th style={{ padding: 8, fontSize: 12, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                        <td style={{ padding: 8, fontSize: 12, fontWeight: 700 }}>{s.name}</td>
                        <td style={{ padding: 8, fontSize: 12 }}>{s.start_time} - {s.end_time}</td>
                        <td style={{ padding: 8, fontSize: 12 }}>{s.hours} hrs</td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button className="btn btn-secondary btn-sm" style={{ padding: '4px 6px' }} onClick={() => {
                              setEditingShiftId(s.id);
                              setNewShiftForm({ name: s.name, start_time: s.start_time, end_time: s.end_time, hours: parseFloat(s.hours) });
                            }}><Edit2 size={12} /></button>
                            <button className="btn btn-secondary btn-sm" style={{ padding: '4px 6px', color: 'var(--red)' }} onClick={() => {
                              confirmAction('Are you sure you want to delete this shift configuration?', async () => {
                                try {
                                  await axios.delete(`/api/employees/shifts/list/${s.id}`)
                                  toast.success('Shift config deleted!')
                                  loadShifts()
                                } catch {
                                  toast.error('Failed to delete shift')
                                }
                              });
                            }}><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Employees Modal */}
      <ImportEmployeesModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)} 
        onImportSuccess={loadEmployees} 
      />
    </div>
  )
}
