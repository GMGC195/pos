import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { 
  User, 
  Users, 
  Lock, 
  Mail, 
  UserPlus, 
  Pencil, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Shield,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  MoreVertical
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api'

export default function Settings() {
  const { user, updateUser } = useAuth()
  const [activeTab, setActiveTab] = useState('account') // 'account' | 'users' | 'hardware'
  const [loading, setLoading] = useState(false)
  const [printMode, setPrintMode] = useState(localStorage.getItem('printMode') || 'standard')
  const shiftDropdownRef = useRef(null)
  const branchDropdownRef = useRef(null)
  
  // My Account State
  const [profileForm, setProfileForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    password: '',
    confirmPassword: ''
  })
  const [showPass, setShowPass] = useState(false)

  // User Management State
  const [users, setUsers] = useState([])
  const [shifts, setShifts] = useState([])
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [showUserPass, setShowUserPass] = useState(false)
  const [showShiftDropdown, setShowShiftDropdown] = useState(false)
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'Operator',
    shift: '',
    branch: ''
  })
  
  const SHIFT_OPTIONS = ['Day', 'Night'];
  const BRANCH_OPTIONS = ['Restaurant 1', 'Restaurant 2', 'Restaurant 3'];
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('All')

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (shiftDropdownRef.current && !shiftDropdownRef.current.contains(e.target)) {
        setShowShiftDropdown(false)
      }
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target)) {
        setShowBranchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const fetchShifts = async () => {
    try {
      const res = await api.get('/api/employees/working-hours/list')
      setShifts(res.data)
    } catch {
      toast.error('Failed to fetch shifts')
    }
  }

  useEffect(() => {
    // Refresh context user data to ensure we have the role
    const refreshProfile = async () => {
      try {
        const res = await api.get('/api/auth/profile')
        if (res.data) {
          updateUser(res.data)
          setProfileForm(prev => ({
            ...prev,
            username: res.data.username,
            email: res.data.email
          }))
        }
      } catch (err) {
        console.error('Failed to refresh profile', err)
      }
    }
    refreshProfile()
  }, [])

  useEffect(() => {
    const role = user?.role?.toLowerCase()
    const isAdminRole = role === 'admin' || role === 'developer'
    if (activeTab === 'users' && isAdminRole) {
      fetchUsers()
      fetchShifts()
    }
  }, [activeTab, user?.role])

  const fetchUsers = async () => {
    try {
      const res = await api.get('/api/auth/users')
      setUsers(res.data)
    } catch {
      toast.error('Failed to fetch users')
    }
  }

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.username && u.username.toLowerCase().includes(userSearchTerm.toLowerCase())) || 
      (u.email && u.email.toLowerCase().includes(userSearchTerm.toLowerCase()));
    const matchesRole = userRoleFilter === 'All' || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  })

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    if (profileForm.password && profileForm.password !== profileForm.confirmPassword) {
      return toast.error('Passwords do not match')
    }
    
    setLoading(true)
    try {
      const res = await api.put('/api/auth/profile', profileForm)
      updateUser(res.data.user)
      toast.success('Profile updated successfully')
      setProfileForm(prev => ({ ...prev, password: '', confirmPassword: '' }))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/api/auth/users', userForm)
      toast.success('User created successfully')
      setIsAddingUser(false)
      setUserForm({ username: '', email: '', password: '', role: 'Operator', shift: '', branch: '' })
      setShowUserPass(false)
      setShowShiftDropdown(false)
      setShowBranchDropdown(false)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Creation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateUser = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.put(`/api/auth/users/${editingUser.id}`, userForm)
      toast.success('User updated successfully')
      setEditingUser(null)
      setUserForm({ username: '', email: '', password: '', role: 'Operator', shift: '', branch: '' })
      setShowUserPass(false)
      setShowShiftDropdown(false)
      setShowBranchDropdown(false)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return
    try {
      await api.delete(`/api/auth/users/${userId}`)
      toast.success('User deleted')
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Deletion failed')
    }
  }

  const openEdit = (u) => {
    setEditingUser(u)
    setUserForm({
      username: u.username,
      email: u.email,
      password: '',
      role: u.role,
      shift: u.shift || '',
      branch: u.branch || ''
    })
    setIsAddingUser(true)
    setShowShiftDropdown(false)
    setShowBranchDropdown(false)
  }

  const togglePass = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setShowPass(!showPass)
  }

  const role = user?.role?.toLowerCase()
  const isAdmin = role === 'admin' || role === 'developer'

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>System Settings</h1>
        <p>Manage your account and team</p>
      </div>

      <div className="settings-layout">
        {/* Sidebar Navigation */}
        <aside className="settings-nav">
          <button 
            className={`settings-nav-item ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            <User size={18} /> My Account
          </button>
          {isAdmin && (
            <button 
              className={`settings-nav-item ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={18} /> User Management
            </button>
          )}
          <button 
            className={`settings-nav-item ${activeTab === 'hardware' ? 'active' : ''}`}
            onClick={() => setActiveTab('hardware')}
          >
            <AlertCircle size={18} /> Hardware & Printers
          </button>
        </aside>

        {/* Content Area */}
        <main className="settings-content">
          {activeTab === 'hardware' && (
            <div className="settings-card fade-in">
              <div className="card-header">
                <h2>Hardware & Printers</h2>
                <p>Configure device-specific hardware settings (These settings apply only to this device)</p>
              </div>
              <div className="settings-form">
                <div className="form-group" style={{ maxWidth: 400 }}>
                  <label>Print Mode</label>
                  <select 
                    value={printMode} 
                    onChange={e => {
                      setPrintMode(e.target.value)
                      localStorage.setItem('printMode', e.target.value)
                      toast.success('Print mode saved for this device')
                    }}
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--surface-2)', width: '100%' }}
                  >
                    <option value="standard">Standard Print (Browser / Laptop USB)</option>
                    <option value="rawbt">RawBT App (Android Mobile Direct Print)</option>
                  </select>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                    {printMode === 'standard' 
                      ? 'Uses the standard browser print dialog. Best for laptops or desktop computers connected to a USB printer.' 
                      : 'Uses the RawBT Android app to print directly to a network/LAN printer. Best for waiters punching orders from mobile phones.'}
                  </p>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'account' && (
            <div className="settings-card fade-in">
              <div className="card-header">
                <h2>Account Information</h2>
                <p>Update your profile details and password</p>
              </div>
              <form onSubmit={handleUpdateProfile} className="settings-form">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Username / Display Name</label>
                    <div className="input-with-icon">
                      <User size={16} />
                      <input 
                        type="text" 
                        value={profileForm.username} 
                        onChange={e => setProfileForm({...profileForm, username: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <div className="input-with-icon">
                      <Mail size={16} />
                      <input 
                        type="email" 
                        value={profileForm.email} 
                        onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Account Role</label>
                    <div className="input-with-icon readonly">
                      <Shield size={16} />
                      <input type="text" value={user?.role || 'Admin'} readOnly />
                    </div>
                  </div>
                </div>

                <div className="divider" />

                <div className="card-header" style={{ padding: '0 0 16px' }}>
                  <h2>Change Password</h2>
                  <p>Leave blank to keep current password</p>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>New Password</label>
                    <div className="input-with-icon">
                      <Lock size={16} />
                      <input 
                        type={showPass ? 'text' : 'password'} 
                        value={profileForm.password} 
                        onChange={e => setProfileForm({...profileForm, password: e.target.value})}
                        placeholder="••••••••"
                      />
                      <button type="button" className="eye-toggle" onClick={togglePass}>
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Confirm Password</label>
                    <div className="input-with-icon">
                      <Lock size={16} />
                      <input 
                        type={showPass ? 'text' : 'password'} 
                        value={profileForm.confirmPassword} 
                        onChange={e => setProfileForm({...profileForm, confirmPassword: e.target.value})}
                        placeholder="••••••••"
                      />
                      <button type="button" className="eye-toggle" onClick={togglePass}>
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 32 }}>
                  <button type="submit" className="btn-save" disabled={loading}>
                    {loading ? 'Saving...' : <><CheckCircle2 size={18} /> Save Changes</>}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'users' && isAdmin && (
            <div className="fade-in">
              {isAddingUser ? (
                <div className="settings-card">
                  <div className="card-header">
                    <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
                    <p>{editingUser ? `Updating details for ${editingUser.username}` : 'Create a new account for your team'}</p>
                  </div>
                  <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="settings-form">
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Username</label>
                        <input 
                          type="text" 
                          value={userForm.username} 
                          onChange={e => setUserForm({...userForm, username: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Email Address</label>
                        <input 
                          type="email" 
                          value={userForm.email} 
                          onChange={e => setUserForm({...userForm, email: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Role</label>
                        <select 
                          value={userForm.role}
                          onChange={e => setUserForm({...userForm, role: e.target.value, shift: e.target.value === 'Operator' ? userForm.shift : ''})}
                        >
                          <option value="Admin">Admin</option>
                          <option value="Order Taker">Order Taker</option>
                          <option value="Operator">Operator</option>
                          <option value="HR Manager">HR Manager</option>
                          <option value="Management">Management</option>
                          <option value="Employee">Employee</option>
                          {user?.role?.toLowerCase() === 'developer' && <option value="Developer">Developer</option>}
                        </select>
                      </div>
                      {(userForm.role === 'Order Taker' || userForm.role === 'Operator') && (
                        <div className="form-group">
                          <label>Assigned Restaurant</label>
                          <select 
                            value={userForm.branch || 'Branch 1'}
                            onChange={e => setUserForm({...userForm, branch: e.target.value})}
                          >
                            <option value="Branch 1">Branch 1</option>
                            <option value="Branch 2">Branch 2</option>
                            <option value="Branch 3">Branch 3</option>
                          </select>
                        </div>
                      )}
                      {(userForm.role === 'Operator' || userForm.role === 'Employee') && (
                        <div className="form-group" style={{ position: 'relative' }} ref={shiftDropdownRef}>
                          <label>Assigned Shift(s)</label>
                          <div 
                            className="form-group-input" 
                            style={{ 
                              padding: '12px 14px', 
                              border: '1.5px solid var(--surface-2)', 
                              borderRadius: '12px', 
                              background: 'var(--surface)',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              minHeight: '45px'
                            }}
                            onClick={() => setShowShiftDropdown(!showShiftDropdown)}
                          >
                            <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '14px', color: userForm.shift ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {userForm.shift ? userForm.shift.split(',').join(', ') : 'Select Shifts...'}
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                              <path d="m6 9 6 6 6-6"/>
                            </svg>
                          </div>
                          
                          {showShiftDropdown && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              marginTop: '8px',
                              background: 'white',
                              border: '1px solid var(--surface-2)',
                              borderRadius: '12px',
                              boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                              zIndex: 100,
                              maxHeight: '220px',
                              overflowY: 'auto',
                              padding: '8px'
                            }}>
                              {SHIFT_OPTIONS.map(s => {
                                const selectedShifts = userForm.shift ? userForm.shift.split(',') : [];
                                const isChecked = selectedShifts.includes(s);
                                return (
                                  <label 
                                    key={s} 
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      padding: '10px 12px',
                                      gap: '12px',
                                      cursor: 'pointer',
                                      borderRadius: '8px',
                                      transition: 'background 0.2s',
                                      background: isChecked ? 'rgba(var(--primary-rgb), 0.05)' : 'transparent'
                                    }}
                                    onMouseOver={e => !isChecked && (e.currentTarget.style.background = 'var(--surface-1)')}
                                    onMouseOut={e => !isChecked && (e.currentTarget.style.background = 'transparent')}
                                  >
                                    <input 
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        let newShifts;
                                        if (e.target.checked) {
                                          newShifts = [...selectedShifts, s];
                                        } else {
                                          newShifts = selectedShifts.filter(shiftName => shiftName !== s);
                                        }
                                        setUserForm({...userForm, shift: newShifts.join(',')});
                                      }}
                                      style={{
                                        width: '18px',
                                        height: '18px',
                                        cursor: 'pointer',
                                        accentColor: 'var(--primary)',
                                        margin: 0
                                      }}
                                    />
                                    <span style={{ fontSize: '14px', fontWeight: isChecked ? 600 : 500, color: 'var(--text-primary)' }}>{s}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {(userForm.role === 'Employee') && (
                        <div className="form-group" style={{ position: 'relative' }} ref={branchDropdownRef}>
                          <label>Assigned Branch(es)</label>
                          <div 
                            className="form-group-input" 
                            style={{ 
                              padding: '12px 14px', 
                              border: '1.5px solid var(--surface-2)', 
                              borderRadius: '12px', 
                              background: 'var(--surface)',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              minHeight: '45px'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowBranchDropdown(!showBranchDropdown);
                            }}
                          >
                            <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '14px', color: userForm.branch ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {userForm.branch ? userForm.branch.split(',').join(', ') : 'Select Branches...'}
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                              <path d="m6 9 6 6 6-6"/>
                            </svg>
                          </div>
                          
                          {showBranchDropdown && (
                            <div style={{
                              position: 'absolute',
                              bottom: '100%',
                              left: 0,
                              right: 0,
                              marginBottom: '8px',
                              background: 'white',
                              border: '1px solid var(--surface-2)',
                              borderRadius: '12px',
                              boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                              zIndex: 100,
                              maxHeight: '220px',
                              overflowY: 'auto',
                              padding: '8px'
                            }}>
                              {BRANCH_OPTIONS.map(b => {
                                const selectedBranches = userForm.branch ? userForm.branch.split(',') : [];
                                const isChecked = selectedBranches.includes(b);
                                return (
                                  <label 
                                    key={b} 
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      padding: '10px 12px',
                                      gap: '12px',
                                      cursor: 'pointer',
                                      borderRadius: '8px',
                                      transition: 'background 0.2s',
                                      background: isChecked ? 'rgba(var(--primary-rgb), 0.05)' : 'transparent'
                                    }}
                                    onMouseOver={e => !isChecked && (e.currentTarget.style.background = 'var(--surface-1)')}
                                    onMouseOut={e => !isChecked && (e.currentTarget.style.background = 'transparent')}
                                  >
                                    <input 
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        let newBranches;
                                        if (e.target.checked) {
                                          newBranches = [...selectedBranches, b];
                                        } else {
                                          newBranches = selectedBranches.filter(bName => bName !== b);
                                        }
                                        setUserForm({...userForm, branch: newBranches.join(',')});
                                      }}
                                      style={{
                                        width: '18px',
                                        height: '18px',
                                        cursor: 'pointer',
                                        accentColor: 'var(--primary)',
                                        margin: 0
                                      }}
                                    />
                                    <span style={{ fontSize: '14px', fontWeight: isChecked ? 600 : 500, color: 'var(--text-primary)' }}>{b}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="form-group">
                        <label>{editingUser ? 'New Password (Optional)' : 'Password'}</label>
                        <div className="input-with-icon">
                          <Lock size={16} />
                          <input 
                            type={showUserPass ? 'text' : 'password'} 
                            value={userForm.password} 
                            onChange={e => setUserForm({...userForm, password: e.target.value})}
                            required={!editingUser}
                            placeholder={editingUser ? 'Leave blank to keep current' : ''}
                            disabled={editingUser?.role?.toLowerCase() === 'developer' && user.role?.toLowerCase() !== 'developer'}
                            style={{ paddingRight: 36 }}
                          />
                          <button type="button" className="eye-toggle" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowUserPass(!showUserPass); }}>
                            {showUserPass ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                      <button type="submit" className="btn-save" disabled={loading}>
                        {loading ? 'Processing...' : editingUser ? 'Update User' : 'Create User'}
                      </button>
                      <button 
                        type="button" 
                        className="btn-cancel" 
                        onClick={() => {
                          setIsAddingUser(false)
                          setEditingUser(null)
                          setUserForm({ username: '', email: '', password: '', role: 'Operator', shift: '' })
                          setShowUserPass(false)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="settings-card">
                  <div className="card-header settings-team-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2>Team Members</h2>
                      <p>Manage access levels and account status</p>
                    </div>
                    <div className="settings-team-actions" style={{ display: 'flex', gap: 12 }}>
                      <button 
                        className="btn-cancel" 
                        onClick={fetchUsers} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          gap: 6, 
                          height: 38, 
                          padding: '0 12px', 
                          fontSize: 13, 
                          background: 'var(--surface-1)', 
                          color: 'var(--text)', 
                          border: '1.5px solid var(--surface-2)', 
                          borderRadius: 8, 
                          cursor: 'pointer' 
                        }}
                      >
                        <RefreshCw size={14} /> Refresh
                      </button>
                      <button className="btn-add-user" onClick={() => setIsAddingUser(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <UserPlus size={18} /> Add User
                      </button>
                    </div>
                  </div>
                  
                  {/* Filters Bar */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '16px 24px',
                    borderBottom: '1.5px solid var(--surface-2)',
                    background: 'var(--surface-1)',
                    alignItems: 'center'
                  }}>
                    <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                        </svg>
                      </span>
                      <input 
                        type="text" 
                        placeholder="Search by name or email..." 
                        value={userSearchTerm}
                        onChange={e => setUserSearchTerm(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px 10px 36px',
                          border: '1.5px solid var(--surface-2)',
                          borderRadius: '8px',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          outline: 'none',
                          fontSize: '13px'
                        }}
                      />
                    </div>
                    <div style={{ minWidth: '150px' }}>
                      <select
                        value={userRoleFilter}
                        onChange={e => setUserRoleFilter(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1.5px solid var(--surface-2)',
                          borderRadius: '8px',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          outline: 'none',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="All">All Roles</option>
                        <option value="Admin">Admin</option>
                        <option value="Operator">Operator</option>
                        <option value="Management">Management</option>
                        <option value="Employee">Employee</option>
                        <option value="Developer">Developer</option>
                      </select>
                    </div>
                  </div>

                  {/* Desktop Table View */}
                  <div className="users-table-wrap desktop-table-view">
                    <div style={{ minWidth: '600px' }}>
                      <table className="users-table" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ width: '50px' }}>#</th>
                            <th>User</th>
                            <th>Role</th>
                            <th>Shift</th>
                            <th>Date Joined</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((u, index) => (
                            <tr key={u.id}>
                              <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{index + 1}</td>
                              <td>
                                <div className="user-info-cell">
                                  <div className="user-avatar-sm">
                                    {u.username[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="user-name">{u.username}</div>
                                    <div className="user-email">{u.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={`role-badge ${u.role.toLowerCase()}`}>
                                  {u.role === 'Admin' ? <ShieldCheck size={14} /> : u.role === 'Developer' ? <Shield size={14} /> : <User size={14} />}
                                  {u.role}
                                </span>
                              </td>
                              <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{u.role === 'Operator' ? (u.shift || 'None') : '--'}</td>
                              <td>{new Date(u.created_at).toLocaleDateString()}</td>
                              <td>
                                <div className="user-actions">
                                  <button 
                                    className="action-btn edit" 
                                    onClick={() => openEdit(u)} 
                                    title="Edit User"
                                    disabled={u.role?.toLowerCase() === 'developer' && user.role?.toLowerCase() !== 'developer'}
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button 
                                    className="action-btn delete" 
                                    onClick={() => handleDeleteUser(u.id)} 
                                    title="Delete User"
                                    disabled={(u.id === user.id) || (u.role?.toLowerCase() === 'developer' && user.role?.toLowerCase() !== 'developer')}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Card Grid View */}
                  <div className="users-mobile-grid" style={{ display: 'none', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                    {filteredUsers.map(u => (
                      <UserMobileCard 
                        key={u.id} 
                        u={u} 
                        currentUser={user} 
                        onEdit={openEdit} 
                        onDelete={handleDeleteUser} 
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <style>{`
        .settings-container {
          padding: 24px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .settings-header {
          margin-bottom: 32px;
        }

        .settings-header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .settings-header p {
          margin: 4px 0 0;
          color: var(--text-secondary);
          font-size: 14px;
        }

        .settings-layout {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 32px;
          align-items: start;
        }

        /* Nav Sidebar */
        .settings-nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .settings-nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }

        .settings-nav-item:hover {
          background: var(--surface-2);
          color: var(--text-primary);
        }

        .settings-nav-item.active {
          background: color-mix(in srgb, var(--red) 10%, transparent);
          color: var(--red);
          border: 1px solid color-mix(in srgb, var(--red) 20%, transparent);
        }

        /* Settings Card */
        .settings-card {
          background: white;
          border: 1px solid var(--surface-2);
          border-radius: 20px;
          padding: 24px;
          box-shadow: var(--shadow);
        }

        .card-header {
          margin-bottom: 24px;
        }

        .card-header h2 {
          margin: 0;
          font-size: 18px;
          color: var(--text-primary);
          font-weight: 700;
        }

        .card-header p {
          margin: 4px 0 0;
          color: var(--text-muted);
          font-size: 14px;
        }

        /* Form Styling */
        .settings-form {
          display: flex;
          flex-direction: column;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .input-with-icon {
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
        }

        .input-with-icon svg:first-child {
          position: absolute;
          left: 14px;
          color: var(--text-muted);
          z-index: 10;
          pointer-events: none;
        }

        .input-with-icon input, 
        .form-group input, 
        .form-group select {
          width: 100%;
          padding: 12px 42px 12px 42px;
          background: var(--surface);
          border: 1.5px solid var(--surface-2);
          border-radius: 12px;
          color: var(--text-primary);
          font-size: 14px;
          outline: none;
          transition: all 0.2s;
          display: block;
        }

        .form-group input:not([readonly]):focus,
        .form-group select:focus {
          border-color: var(--red);
          background: white;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--red) 10%, transparent);
        }

        .input-with-icon.readonly input {
          background: var(--surface-2);
          color: var(--text-muted);
          cursor: default;
        }

        .form-group select {
          padding-left: 14px;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='rgba(0,0,0,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
        }

        .input-with-icon .eye-toggle {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          z-index: 20;
          transition: all 0.2s;
        }

        .input-with-icon .eye-toggle:hover {
          background: var(--surface-2);
          color: var(--red);
        }

        .divider {
          height: 1px;
          background: var(--surface-2);
          margin: 32px 0;
        }

        /* Buttons */
        .btn-save {
          padding: 12px 24px;
          background: linear-gradient(135deg, var(--red), var(--red-dark));
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(227, 24, 55, 0.2);
        }

        .btn-save:hover { 
          opacity: 0.95;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(227, 24, 55, 0.3);
        }
        
        .btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .btn-cancel {
          padding: 12px 24px;
          background: white;
          border: 1.5px solid var(--surface-2);
          border-radius: 10px;
          color: var(--text-secondary);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-cancel:hover {
          background: var(--surface);
          color: var(--text-primary);
        }

        .btn-add-user {
          padding: 10px 16px;
          background: color-mix(in srgb, var(--red) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--red) 20%, transparent);
          border-radius: 10px;
          color: var(--red);
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-add-user:hover {
          background: var(--red);
          color: white;
        }

        /* Users Table */
        .users-table-wrap {
          margin-top: 16px;
          overflow-x: auto;
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
        }

        .users-table th {
          text-align: left;
          padding: 12px 16px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-muted);
          border-bottom: 2px solid var(--surface-2);
        }

        .users-table td {
          padding: 16px;
          border-bottom: 1px solid var(--surface-2);
          color: var(--text-primary);
        }

        .user-info-cell {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-avatar-sm {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--red), var(--orange));
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
        }

        .user-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .user-email {
          font-size: 12px;
          color: var(--text-muted);
        }

        .role-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .role-badge.admin { background: color-mix(in srgb, var(--red) 10%, transparent); color: var(--red); }
        .role-badge.developer { background: color-mix(in srgb, #6366f1 10%, transparent); color: #6366f1; }
        .role-badge.operator { background: rgba(74,144,226,0.1); color: #4A90E2; }
        .role-badge.management { background: rgba(244,180,0,0.1); color: #F4B400; }
        .role-badge.employee { background: rgba(16,185,129,0.1); color: #10B981; }

        .user-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .action-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--surface-2);
          background: white;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .action-btn:hover:not(:disabled) {
          border-color: var(--text-primary);
          color: var(--text-primary);
          background: var(--surface);
        }

        .action-btn.delete:hover:not(:disabled) {
          border-color: #ff6b6b;
          color: #ff6b6b;
          background: #fff5f5;
        }
        
        .action-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 1000px) {
          .settings-layout {
            grid-template-columns: 1fr;
          }
          
          .settings-nav {
            flex-direction: row;
            overflow-x: auto;
            padding-bottom: 8px;
          }
          
          .form-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .desktop-table-view {
            display: none !important;
          }
          .users-mobile-grid {
            display: flex !important;
          }
          .settings-team-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
          }
          .settings-team-actions {
            width: 100% !important;
            gap: 8px !important;
          }
          .settings-team-actions button {
            flex: 1 !important;
          }
        }
      `}</style>
    </div>
  )
}

function UserMobileCard({ u, currentUser, onEdit, onDelete }) {
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    const handleClose = () => setShowDropdown(false)
    window.addEventListener('click', handleClose)
    return () => window.removeEventListener('click', handleClose)
  }, [])

  const disabledEdit = u.role?.toLowerCase() === 'developer' && currentUser.role?.toLowerCase() !== 'developer'
  const disabledDelete = (u.id === currentUser.id) || (u.role?.toLowerCase() === 'developer' && currentUser.role?.toLowerCase() !== 'developer')

  return (
    <div style={{
      background: 'white',
      border: '1.5px solid var(--surface-2)',
      borderRadius: '16px',
      padding: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, var(--red), var(--orange))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '15px'
        }}>
          {u.username[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{u.username}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{u.email}</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span className={`role-badge ${u.role.toLowerCase()}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
              {u.role}
            </span>
            {u.role === 'Operator' && (
              <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                • Shift {u.shift || 'None'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowDropdown(!showDropdown)
          }}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <MoreVertical size={20} />
        </button>

        {showDropdown && (
          <div style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            background: 'white',
            border: '1.5px solid var(--surface-2)',
            borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 100,
            minWidth: '120px',
            marginTop: '4px',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => onEdit(u)}
              disabled={disabledEdit}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                cursor: disabledEdit ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                textAlign: 'left',
                color: 'var(--text-primary)',
                fontWeight: 500,
                opacity: disabledEdit ? 0.4 : 1
              }}
            >
              Edit User
            </button>
            <button
              onClick={() => onDelete(u.id)}
              disabled={disabledDelete}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                cursor: disabledDelete ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                textAlign: 'left',
                color: '#EF4444',
                fontWeight: 500,
                opacity: disabledDelete ? 0.4 : 1
              }}
            >
              Delete User
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
