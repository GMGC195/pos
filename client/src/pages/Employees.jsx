import { useEffect, useState } from 'react'
import axios from '../api'
import { Users, UserPlus, Search, Edit2, Trash2, X, ShieldAlert, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import ImportEmployeesModal from '../components/ImportEmployeesModal'

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Operator',
    salary: 0,
    status: 'Active',
    department: '',
    position: '',
    employee_id: ''
  })

  const loadEmployees = () => {
    setLoading(true)
    axios.get('/api/employees')
      .then(res => setEmployees(res.data))
      .catch(() => toast.error('Error loading employees'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  const handleOpenAdd = () => {
    setEditingEmployee(null)
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'Operator',
      salary: 0,
      status: 'Active',
      shift: 'R1',
      shift_hours: 13.0,
      department: '',
      position: '',
      employee_id: ''
    })
    setShowModal(true)
  }

  const handleOpenEdit = (emp) => {
    setEditingEmployee(emp)
    setFormData({
      name: emp.name,
      email: emp.email || '',
      phone: emp.phone || '',
      role: emp.role || 'Operator',
      salary: emp.salary || 0,
      status: emp.status || 'Active',
      shift: emp.shift || 'R1',
      shift_hours: parseFloat(emp.shift_hours || 12.0),
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

  const handleShiftChange = (e) => {
    const val = e.target.value
    let hours = 12.0
    if (val === 'R1') hours = 13.0
    if (val === 'R3') hours = 13.0
    setFormData(prev => ({ ...prev, shift: val, shift_hours: hours }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name) return toast.error('Name is required')

    try {
      if (editingEmployee) {
        // Update
        await axios.put(`/api/employees/${editingEmployee.id}`, formData)
        toast.success('Employee updated successfully!')
      } else {
        // Create
        await axios.post('/api/employees', formData)
        toast.success('Employee added successfully!')
      }
      handleCloseModal()
      loadEmployees()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save employee')
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove employee "${name}"?`)) return
    try {
      await axios.delete(`/api/employees/${id}`)
      toast.success('Employee deleted')
      loadEmployees()
    } catch (err) {
      toast.error('Failed to delete employee')
    }
  }

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (emp.phone && emp.phone.includes(searchTerm))
    const matchesRole = roleFilter === 'All' || emp.role === roleFilter
    return matchesSearch && matchesRole
  })

  return (
    <div className="page-content" style={{ paddingTop: 0 }}>
      {/* Header and Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: -60, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="stat-card" style={{ '--card-color': 'var(--primary)', minWidth: 200, padding: '16px 20px' }}>
            <div className="stat-icon" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>
              <Users size={22} />
            </div>
            <div className="stat-info">
              <p>Total Employees</p>
              <h3>{employees.length}</h3>
            </div>
          </div>
          <div className="stat-card" style={{ '--card-color': 'var(--green)', minWidth: 200, padding: '16px 20px' }}>
            <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)' }}>
              <Users size={22} />
            </div>
            <div className="stat-info">
              <p>Active Employees</p>
              <h3>{employees.filter(e => e.status === 'Active').length}</h3>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => setShowImportModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42 }}>
            <FileSpreadsheet size={18} /> Import Employees
          </button>
          <button className="btn btn-primary" onClick={handleOpenAdd} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42 }}>
            <UserPlus size={18} /> Add Employee
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 250, border: '1px solid var(--surface-2)', borderRadius: 8, padding: '0 12px', background: 'var(--surface-1)' }}>
            <Search size={18} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search by name, email, or phone..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', border: 'none', outline: 'none', padding: '10px 8px', background: 'transparent', color: 'var(--text)' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Role Filter:</span>
            <select 
              value={roleFilter} 
              onChange={e => setRoleFilter(e.target.value)}
              style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '8px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
            >
              <option value="All">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Operator">Operator</option>
              <option value="Delivery">Delivery Rider</option>
              <option value="Chef">Chef / Kitchen Staff</option>
              <option value="Cashier">Cashier</option>
            </select>
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
                <th>Name</th>
                <th>Department</th>
                <th>Role / Position</th>
                <th>Shift</th>
                <th>Contact</th>
                <th>Salary (Monthly)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    Loading employees...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    No employees found matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                      {emp.employee_id || `EMP-${String(emp.id).padStart(4, '0')}`}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{emp.name}</div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Joined {new Date(emp.created_at).toLocaleDateString()}</span>
                    </td>
                    <td>
                      {emp.department || <span style={{ color: 'var(--text-muted)' }}>--</span>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 550 }}>{emp.position || emp.role}</div>
                      {emp.position && emp.position !== emp.role && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(156, 163, 175, 0.1)', padding: '2px 6px', borderRadius: 4 }}>
                          {emp.role}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: 13 }}>
                        {emp.shift || 'R1'}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {parseFloat(emp.shift_hours || 12.0).toFixed(1)} Hrs
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{emp.email || 'N/A'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emp.phone || 'N/A'}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>Rs. {parseFloat(emp.salary || 0).toLocaleString()}</span>
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
                        <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(emp)} style={{ padding: '6px 8px' }}>
                          <Edit2 size={14} />
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(emp.id, emp.name)} style={{ padding: '6px 8px', color: 'var(--red)' }}>
                          <Trash2 size={14} />
                        </button>
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
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Email</label>
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Phone Number</label>
                    <input 
                      type="text" 
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Role</label>
                    <select 
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    >
                      <option value="Operator">Operator</option>
                      <option value="Admin">Admin</option>
                      <option value="Delivery">Delivery Rider</option>
                      <option value="Chef">Chef / Kitchen Staff</option>
                      <option value="Cashier">Cashier</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Salary (Monthly)</label>
                    <input 
                      type="number" 
                      value={formData.salary}
                      onChange={e => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
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
                    <select 
                      value={formData.shift}
                      onChange={handleShiftChange}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    >
                      <option value="R1">R1 (10:00 AM)</option>
                      <option value="R2">R2 (09:00 AM)</option>
                      <option value="R3">R3 (03:00 PM)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Shift Standard Hours</label>
                    <input 
                      type="number" 
                      step="0.5"
                      value={formData.shift_hours}
                      onChange={e => setFormData({ ...formData, shift_hours: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, borderTop: '1px solid var(--surface-2)', paddingTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Details</button>
              </div>
            </form>
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
