import { useState, useEffect } from 'react'
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
  EyeOff
} from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export default function Settings() {
  const { user, updateUser, getToken } = useAuth()
  const [activeTab, setActiveTab] = useState('account')
  const [loading, setLoading] = useState(false)
  
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
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'Operator'
  })

  useEffect(() => {
    // Refresh context user data to ensure we have the role
    const refreshProfile = async () => {
      try {
        const res = await axios.get(`${API}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        })
        console.log('Profile Refreshed:', res.data);
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
    }
  }, [activeTab, user?.role])

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API}/api/auth/users`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      setUsers(res.data)
    } catch {
      toast.error('Failed to fetch users')
    }
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    if (profileForm.password && profileForm.password !== profileForm.confirmPassword) {
      return toast.error('Passwords do not match')
    }
    
    setLoading(true)
    try {
      const res = await axios.put(`${API}/api/auth/profile`, profileForm, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
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
      await axios.post(`${API}/api/auth/users`, userForm, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      toast.success('User created successfully')
      setIsAddingUser(false)
      setUserForm({ username: '', email: '', password: '', role: 'Operator' })
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
      await axios.put(`${API}/api/auth/users/${editingUser.id}`, userForm, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      toast.success('User updated successfully')
      setEditingUser(null)
      setUserForm({ username: '', email: '', password: '', role: 'Operator' })
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
      await axios.delete(`${API}/api/auth/users/${userId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
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
      role: u.role
    })
    setIsAddingUser(true)
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
        </aside>

        {/* Content Area */}
        <main className="settings-content">
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
                          onChange={e => setUserForm({...userForm, role: e.target.value})}
                        >
                          <option value="Admin">Admin</option>
                          <option value="Operator">Operator</option>
                          {user?.role?.toLowerCase() === 'developer' && <option value="Developer">Developer</option>}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{editingUser ? 'New Password (Optional)' : 'Password'}</label>
                        <input 
                          type="password" 
                          value={userForm.password} 
                          onChange={e => setUserForm({...userForm, password: e.target.value})}
                          required={!editingUser}
                          placeholder={editingUser ? 'Leave blank to keep current' : ''}
                          disabled={editingUser?.role?.toLowerCase() === 'developer' && user.role?.toLowerCase() !== 'developer'}
                        />
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
                          setUserForm({ username: '', email: '', password: '', role: 'Operator' })
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="settings-card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2>Team Members</h2>
                      <p>Manage access levels and account status</p>
                    </div>
                    <button className="btn-add-user" onClick={() => setIsAddingUser(true)}>
                      <UserPlus size={18} /> Add User
                    </button>
                  </div>
                  
                  <div className="users-table-wrap">
                    <table className="users-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Role</th>
                          <th>Date Joined</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id}>
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
      `}</style>
    </div>
  )
}
