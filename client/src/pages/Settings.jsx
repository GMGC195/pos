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
  MoreVertical,
  X,
  Store,
  Plus,
  ShieldAlert,
  Layers,
  LayoutGrid,
  ListFilter,
  Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api'

export default function Settings() {
  const { user, updateUser } = useAuth()
  const [activeTab, setActiveTab] = useState('account') // 'account' | 'users' | 'hardware'
  const [loading, setLoading] = useState(false)
  const [printMode, setPrintMode] = useState(localStorage.getItem('printMode') || 'standard')
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false)
  const [printerIp, setPrinterIp] = useState(localStorage.getItem('printerIp') || '127.0.0.1')
  const [lowStockBehavior, setLowStockBehavior] = useState('block')
  const [stockViewMode, setStockViewMode] = useState(() => localStorage.getItem('pos_stock_view_mode') || 'cards')
  const [reportEmails, setReportEmails] = useState(['mr.caffee25@gmail.com'])

  const stockOptions = [
    {
      value: 'block',
      title: 'Block Order',
      badge: 'Default',
      badgeColor: '#dc2626',
      badgeBg: 'rgba(239, 68, 68, 0.12)',
      icon: ShieldAlert,
      iconColor: '#dc2626',
      iconBg: 'rgba(239, 68, 68, 0.12)',
      desc: 'Stop order if ingredients are out of stock.',
      detail: 'Strict inventory protection: orders cannot be placed if recipe ingredients are out of stock.'
    },
    {
      value: 'allow_negative',
      title: 'Allow Negative',
      badge: 'Deficit',
      badgeColor: '#d97706',
      badgeBg: 'rgba(217, 119, 6, 0.12)',
      icon: Layers,
      iconColor: '#d97706',
      iconBg: 'rgba(217, 119, 6, 0.12)',
      desc: 'Allow order & deduct stock below zero.',
      detail: 'Flexible tracking: orders proceed smoothly while stock counts track deficit below zero.'
    },
    {
      value: 'ignore',
      title: 'Ignore Stock',
      badge: 'Bypass',
      badgeColor: '#4f46e5',
      badgeBg: 'rgba(79, 70, 229, 0.12)',
      icon: EyeOff,
      iconColor: '#4f46e5',
      iconBg: 'rgba(79, 70, 229, 0.12)',
      desc: 'Allow order without stock check or deduction.',
      detail: 'Unrestricted checkout: stock verification and recipe ingredient deductions are completely bypassed.'
    }
  ]
  const [newEmailInput, setNewEmailInput] = useState('')
  const [emailInputError, setEmailInputError] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
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
  const [userRoleFilter, setUserRoleFilter] = useState('Admin')
  const [userTypeTab, setUserTypeTab] = useState('system') // 'system' | 'employee'
  const [userBranchFilter, setUserBranchFilter] = useState('All') // 'All' | '1' | '2' | '3'
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null)

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
    if ((activeTab === 'hardware' || activeTab === 'pos_settings' || activeTab === 'report_emails') && isAdminRole) {
      fetchSettings()
    }
  }, [activeTab, user?.role])

  const fetchSettings = async () => {
    try {
      const res = await api.get('/api/settings')
      if (res.data) {
        setAutoPrintEnabled(res.data.auto_print_enabled)
        setPrinterIp(res.data.printer_ip)
        setLowStockBehavior(res.data.low_stock_behavior || 'block')
        if (Array.isArray(res.data.report_emails) && res.data.report_emails.length > 0) {
          setReportEmails(res.data.report_emails)
        } else if (typeof res.data.report_emails === 'string') {
          try {
            const parsed = JSON.parse(res.data.report_emails)
            if (Array.isArray(parsed) && parsed.length > 0) {
              setReportEmails(parsed)
            }
          } catch(e) {
            if (res.data.report_emails) setReportEmails([res.data.report_emails])
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings', err)
    }
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      await api.put('/api/settings', { 
        auto_print_enabled: autoPrintEnabled, 
        printer_ip: printerIp, 
        low_stock_behavior: lowStockBehavior,
        report_emails: reportEmails
      })
      toast.success('Settings saved globally')
    } catch (err) {
      toast.error('Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleAddEmail = (e) => {
    if (e) e.preventDefault()
    const email = newEmailInput.trim().toLowerCase()
    setEmailInputError('')

    if (!email) {
      setEmailInputError('Please enter an email address')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setEmailInputError('Please enter a valid email address (e.g. name@domain.com)')
      return
    }

    if (reportEmails.some(e => e.toLowerCase() === email)) {
      setEmailInputError('This email is already in the recipient list')
      return
    }

    const updated = [...reportEmails, email]
    setReportEmails(updated)
    setNewEmailInput('')
    saveReportEmails(updated)
  }

  const handleRemoveEmail = (indexToRemove) => {
    if (reportEmails.length <= 1) {
      toast.error('At least one recipient email is required')
      return
    }
    const updated = reportEmails.filter((_, idx) => idx !== indexToRemove)
    setReportEmails(updated)
    saveReportEmails(updated)
  }

  const saveReportEmails = async (emailsList) => {
    setSavingSettings(true)
    try {
      await api.put('/api/settings', { 
        auto_print_enabled: autoPrintEnabled, 
        printer_ip: printerIp, 
        low_stock_behavior: lowStockBehavior,
        report_emails: emailsList 
      })
      toast.success('Recipient emails updated successfully')
    } catch (err) {
      toast.error('Failed to update recipient emails')
    } finally {
      setSavingSettings(false)
    }
  }

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
      
    const isEmployeeRole = u.role === 'Employee';
    const matchesTypeTab = userTypeTab === 'system' ? !isEmployeeRole : isEmployeeRole;
    
    let matchesRole = false;
    if (userRoleFilter === 'All') {
      matchesRole = true;
    } else {
      matchesRole = u.role === userRoleFilter;
    }

    let matchesBranch = true;
    if (userBranchFilter !== 'All') {
      // Admins and Developers bypass branch filters because they have global access
      if (u.role === 'Admin' || u.role === 'Developer' || u.role === 'Management') {
        matchesBranch = true;
      } else {
        const bStr = u.branch || '';
        matchesBranch = bStr.includes(`Branch ${userBranchFilter}`) || bStr.includes(`Restaurant ${userBranchFilter}`);
      }
    }

    return matchesSearch && matchesTypeTab && matchesRole && matchesBranch;
  }).sort((a, b) => {
    // Sort Admins (and Developers) to the very top
    const getRoleWeight = (role) => {
      if (role === 'Developer') return 3;
      if (role === 'Admin') return 2;
      if (role === 'Management') return 1;
      return 0;
    };
    return getRoleWeight(b.role) - getRoleWeight(a.role);
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
    const payload = { ...userForm };
    if (['Order Taker', 'Cashier'].includes(payload.role) && !payload.branch) payload.branch = 'Branch 1';
    if (payload.role === 'Operator' && !payload.branch) payload.branch = 'Restaurant 1';
    
    try {
      await api.post('/api/auth/users', payload)
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
    const payload = { ...userForm };
    if (['Order Taker', 'Cashier'].includes(payload.role) && !payload.branch) payload.branch = 'Branch 1';
    if (payload.role === 'Operator' && !payload.branch) payload.branch = 'Restaurant 1';
    
    try {
      await api.put(`/api/auth/users/${editingUser.id}`, payload)
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

  const handleDeleteUser = (userId) => {
    setConfirmDeleteUser(userId)
  }

  const executeDeleteUser = async () => {
    if (!confirmDeleteUser) return
    try {
      await api.delete(`/api/auth/users/${confirmDeleteUser}`)
      toast.success('User deleted')
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Deletion failed')
    } finally {
      setConfirmDeleteUser(null)
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
          {isAdmin && (
            <button 
              className={`settings-nav-item ${activeTab === 'pos_settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('pos_settings')}
            >
              <Store size={18} /> POS Options
            </button>
          )}
          {isAdmin && (
            <button 
              className={`settings-nav-item ${activeTab === 'report_emails' ? 'active' : ''}`}
              onClick={() => setActiveTab('report_emails')}
            >
              <Mail size={18} /> Report Emails
            </button>
          )}
        </aside>

        {/* Content Area */}
        <main className="settings-content">
          {activeTab === 'hardware' && (
            <div className="settings-card fade-in">
              <div className="card-header">
                <div>
                  <h2>Hardware & Printers</h2>
                  <p>Configure device-specific hardware settings (These settings apply only to this device)</p>
                </div>
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
                    <option value="cloud">Cloud Auto-Printing (Thermal Printer)</option>
                    <option value="rawbt">RawBT App (Android Mobile Direct Print)</option>
                  </select>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                    {printMode === 'standard' 
                      ? 'Uses the standard browser print dialog. Best for laptops or desktop computers connected to a USB printer.' 
                      : printMode === 'cloud'
                      ? 'Automatically pushes new orders directly to the kitchen thermal printer over the local network via Pusher.'
                      : 'Uses the RawBT Android app to print directly to a network/LAN printer. Best for waiters punching orders from mobile phones.'}
                  </p>
                </div>
                
                {printMode === 'cloud' && (
                  <div className="form-group" style={{ maxWidth: 400, marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--surface-2)' }}>
                    <label>Cloud Printer Configuration</label>
                    <div style={{ marginTop: '16px' }}>
                      <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Printer IP Address</label>
                      <input 
                        type="text" 
                        value={printerIp}
                        onChange={e => setPrinterIp(e.target.value)}
                        onBlur={e => {
                          localStorage.setItem('printerIp', e.target.value)
                          toast.success('Printer IP saved for this device')
                        }}
                        placeholder="192.168.1.100"
                        style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--surface-2)', width: '100%', marginTop: '6px', background: 'var(--surface)' }}
                      />
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Port is fixed to 9100</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'pos_settings' && isAdmin && (
            <div className="settings-card fade-in">
              <div className="card-header">
                <div>
                  <h2>POS Options</h2>
                  <p>Global settings for Point of Sale functionality</p>
                </div>
              </div>

              {/* Informative Rule Context Banner */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px 16px',
                background: 'rgba(244, 180, 0, 0.08)',
                border: '1px solid rgba(244, 180, 0, 0.25)',
                borderRadius: '12px',
                marginBottom: '20px'
              }}>
                <Info size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                    Insufficient Inventory Rule
                  </strong>
                  Controls checkout behavior when an item or its recipe ingredients are depleted.
                </div>
              </div>

              <div className="settings-form">
                <div>
                  {/* Option Heading with View Mode Pill Switcher */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div>
                      <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', margin: 0 }}>
                        Insufficient Stock Behavior
                      </label>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Select how orders are handled when stock is depleted
                      </span>
                    </div>

                    {/* View Switcher: Compact Cards Grid vs Dropdown */}
                    <div style={{
                      display: 'inline-flex',
                      padding: '3px',
                      background: 'var(--surface-2)',
                      borderRadius: '8px',
                      gap: '2px'
                    }}>
                      <button
                        type="button"
                        className={`pos-view-pill-btn ${stockViewMode === 'cards' ? 'active' : ''}`}
                        onClick={() => {
                          setStockViewMode('cards')
                          localStorage.setItem('pos_stock_view_mode', 'cards')
                        }}
                      >
                        <LayoutGrid size={13} /> Cards Grid
                      </button>
                      <button
                        type="button"
                        className={`pos-view-pill-btn ${stockViewMode === 'dropdown' ? 'active' : ''}`}
                        onClick={() => {
                          setStockViewMode('dropdown')
                          localStorage.setItem('pos_stock_view_mode', 'dropdown')
                        }}
                      >
                        <ListFilter size={13} /> Dropdown
                      </button>
                    </div>
                  </div>

                  {/* Multi-Column Compact Cards View */}
                  {stockViewMode === 'cards' && (
                    <div className="pos-stock-grid">
                      {stockOptions.map(opt => {
                        const isSelected = lowStockBehavior === opt.value
                        return (
                          <div
                            key={opt.value}
                            onClick={() => setLowStockBehavior(opt.value)}
                            className={`pos-stock-card ${isSelected ? 'selected' : ''}`}
                          >
                            {/* Radio Dot on the side */}
                            <div style={{
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              border: isSelected ? '5px solid var(--primary)' : '2px solid #cbd5e1',
                              background: '#fff',
                              flexShrink: 0,
                              marginTop: '2px',
                              transition: 'all 0.15s ease'
                            }} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                  {opt.title}
                                </span>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: opt.badgeBg,
                                  color: opt.badgeColor,
                                  flexShrink: 0
                                }}>
                                  {opt.badge}
                                </span>
                              </div>
                              <p style={{
                                fontSize: '11px',
                                color: 'var(--text-secondary)',
                                lineHeight: '1.35',
                                margin: '3px 0 0 0'
                              }}>
                                {opt.desc}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Dropdown Menu View */}
                  {stockViewMode === 'dropdown' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '520px' }}>
                      <select
                        value={lowStockBehavior}
                        onChange={(e) => setLowStockBehavior(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '11px 14px',
                          borderRadius: '10px',
                          border: '1.5px solid var(--surface-2)',
                          background: 'var(--surface)',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="block">Block Order (Default) — Stop checkout if out of stock</option>
                        <option value="allow_negative">Allow Negative Stock — Allow checkout & deduct below zero</option>
                        <option value="ignore">Ignore Stock Check — Allow checkout without stock checks</option>
                      </select>

                      {/* Active Preview Box */}
                      {(() => {
                        const activeOpt = stockOptions.find(o => o.value === lowStockBehavior) || stockOptions[0]
                        const ActiveIcon = activeOpt.icon
                        return (
                          <div style={{
                            padding: '12px 14px',
                            borderRadius: '10px',
                            background: 'rgba(244, 180, 0, 0.06)',
                            border: '1.5px solid var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                          }}>
                            <div style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: activeOpt.iconBg,
                              color: activeOpt.iconColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <ActiveIcon size={17} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{activeOpt.title}</strong>
                                <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: activeOpt.badgeBg, color: activeOpt.badgeColor }}>
                                  {activeOpt.badge}
                                </span>
                              </div>
                              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                                {activeOpt.detail}
                              </p>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn-save" onClick={saveSettings} disabled={savingSettings}>
                    {savingSettings ? 'Saving...' : <><CheckCircle2 size={18} /> Save Global Settings</>}
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Applies globally to all active POS registers and terminals.
                  </span>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'report_emails' && isAdmin && (
            <div className="settings-card fade-in">
              <div className="card-header">
                <div>
                  <h2>Report Recipient Emails</h2>
                  <p>Configure which email addresses automatically receive Shift Closing and Daily Closing sales reports</p>
                </div>
              </div>

              {/* Information banner */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '16px 18px',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px',
                marginBottom: '24px'
              }}>
                <Mail size={22} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                    Automated Email Dispatch
                  </strong>
                  Whenever a cashier completes a Shift Closing or an Admin submits the Daily Closing report, the full financial summary (Sales, Cash, Card, Category breakdown, Interval items) is instantly dispatched via email to all active addresses listed below.
                </div>
              </div>

              {/* Add Email Form */}
              <div style={{ marginBottom: '28px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                  Add New Recipient Email
                </label>
                <form onSubmit={handleAddEmail} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1', minWidth: '260px', position: 'relative' }}>
                    <div className="input-with-icon">
                      <Mail size={16} />
                      <input 
                        type="email" 
                        placeholder="e.g. manager@restaurant.com"
                        value={newEmailInput}
                        onChange={(e) => {
                          setNewEmailInput(e.target.value)
                          if (emailInputError) setEmailInputError('')
                        }}
                        style={{ paddingLeft: '40px' }}
                      />
                    </div>
                    {emailInputError && (
                      <p style={{ color: 'var(--red, #e31837)', fontSize: '12px', marginTop: '6px', fontWeight: 500 }}>
                        {emailInputError}
                      </p>
                    )}
                  </div>
                  <button 
                    type="submit" 
                    disabled={savingSettings}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 20px',
                      background: 'var(--primary, #e31837)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Plus size={16} /> Add Email
                  </button>
                </form>
              </div>

              <div className="divider" style={{ margin: '20px 0' }} />

              {/* Email List */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Configured Recipients ({reportEmails.length})
                  </label>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    At least one email is required
                  </span>
                </div>

                {reportEmails.length === 0 ? (
                  <div style={{ 
                    padding: '30px', 
                    textAlign: 'center', 
                    background: 'var(--surface)', 
                    borderRadius: '12px',
                    border: '1.5px dashed var(--surface-2)',
                    color: 'var(--text-muted)'
                  }}>
                    No recipient emails configured. Please add at least one email.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {reportEmails.map((email, idx) => (
                      <div 
                        key={email + idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          background: 'var(--surface)',
                          border: '1px solid var(--surface-2)',
                          borderRadius: '10px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: 'rgba(227, 24, 55, 0.08)',
                            color: 'var(--primary, #e31837)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Mail size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                              {email}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Receives Shift & Daily Reports
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '20px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981'
                          }}>
                            Active
                          </span>
                          <button
                            type="button"
                            title="Remove recipient"
                            onClick={() => handleRemoveEmail(idx)}
                            disabled={reportEmails.length <= 1 || savingSettings}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: 'transparent',
                              border: '1px solid var(--surface-2)',
                              color: reportEmails.length <= 1 ? 'var(--text-muted)' : 'var(--red, #e31837)',
                              cursor: reportEmails.length <= 1 ? 'not-allowed' : 'pointer',
                              opacity: reportEmails.length <= 1 ? 0.4 : 1,
                              transition: 'all 0.2s'
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Manual Save Confirmation Button */}
                <div style={{ marginTop: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    className="btn-save" 
                    onClick={() => saveReportEmails(reportEmails)} 
                    disabled={savingSettings}
                  >
                    {savingSettings ? 'Saving...' : <><CheckCircle2 size={18} /> Save Recipient Emails</>}
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Changes are also automatically saved when adding or removing emails.
                  </span>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'account' && (
            <div className="settings-card fade-in">
              <div className="card-header">
                <div>
                  <h2>Account Information</h2>
                  <p>Update your profile details and password</p>
                </div>
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
                  <div>
                    <h2>Change Password</h2>
                    <p>Leave blank to keep current password</p>
                  </div>
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
                    <div>
                      <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
                      <p>{editingUser ? `Updating details for ${editingUser.username}` : 'Create a new account for your team'}</p>
                    </div>
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
                          onChange={e => {
                            const newRole = e.target.value;
                            let newBranch = userForm.branch;
                            if (['Order Taker', 'Cashier'].includes(newRole) && (!newBranch || newBranch.startsWith('Restaurant'))) newBranch = 'Branch 1';
                            else if (newRole === 'Operator' && (!newBranch || newBranch.startsWith('Branch'))) newBranch = 'Restaurant 1';
                            else if (!['Order Taker', 'Cashier', 'Operator', 'Employee'].includes(newRole)) newBranch = '';
                            
                            setUserForm({
                              ...userForm, 
                              role: newRole, 
                              shift: newRole === 'Operator' ? (userForm.shift || 'Morning') : '',
                              branch: newBranch
                            });
                          }}
                        >
                          <option value="Admin">Admin</option>
                          <option value="Order Taker">Order Taker</option>
                          <option value="Cashier">Cashier</option>
                          <option value="Operator">Operator</option>
                          <option value="HR Manager">HR Manager</option>
                          <option value="Management">Management</option>
                          <option value="Employee">Employee</option>
                          {user?.role?.toLowerCase() === 'developer' && <option value="Developer">Developer</option>}
                        </select>
                      </div>
                      {(userForm.role === 'Order Taker' || userForm.role === 'Cashier' || userForm.role === 'Operator') && (
                        <div className="form-group">
                          <label>Assigned Restaurant</label>
                          <select 
                            value={userForm.branch || (userForm.role === 'Operator' ? 'Restaurant 1' : 'Branch 1')}
                            onChange={e => setUserForm({...userForm, branch: e.target.value})}
                          >
                            {userForm.role === 'Operator' ? (
                              <>
                                <option value="Restaurant 1">Restaurant 1</option>
                                <option value="Restaurant 2">Restaurant 2</option>
                                <option value="Restaurant 3">Restaurant 3</option>
                              </>
                            ) : (
                              <>
                                <option value="Branch 1">Branch 1</option>
                                <option value="Branch 2">Branch 2</option>
                                <option value="Branch 3">Branch 3</option>
                              </>
                            )}
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
                  
                  {/* System vs Employee Tabs */}
                  <div style={{ display: 'flex', gap: '8px', padding: '16px 24px 0 24px', background: 'var(--surface-1)', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                    <button 
                      onClick={() => { setUserTypeTab('system'); setUserRoleFilter('Admin'); setUserBranchFilter('All'); }}
                      style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: userTypeTab === 'system' ? 'var(--primary)' : 'var(--surface-2)',
                        color: userTypeTab === 'system' ? 'white' : 'var(--text-muted)',
                        borderRadius: '8px 8px 0 0',
                        fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      System Users
                    </button>
                    <button 
                      onClick={() => { setUserTypeTab('employee'); setUserRoleFilter('Employee'); setUserBranchFilter('All'); }}
                      style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: userTypeTab === 'employee' ? 'var(--primary)' : 'var(--surface-2)',
                        color: userTypeTab === 'employee' ? 'white' : 'var(--text-muted)',
                        borderRadius: '8px 8px 0 0',
                        fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      Employees
                    </button>
                  </div>
                  
                  {/* Filters Bar */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--surface-2)',
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
                  </div>

                  {/* Role Filters Row for System Users */}
                  {userTypeTab === 'system' && (
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      padding: '12px 24px 0',
                      background: 'var(--surface-1)',
                      overflowX: 'auto'
                    }}>
                      {['Admin', 'Management', 'Operator', 'Cashier', 'Order Taker'].map(r => (
                        <button
                          key={r}
                          onClick={() => setUserRoleFilter(r)}
                          style={{
                            padding: '6px 16px',
                            border: '1px solid var(--surface-2)',
                            background: userRoleFilter === r ? 'var(--primary)' : 'white',
                            color: userRoleFilter === r ? 'white' : 'var(--text)',
                            borderRadius: '20px',
                            fontSize: '13px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Branch Filters Row */}
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '12px 24px',
                    background: 'var(--surface-1)',
                    borderBottom: '1.5px solid var(--surface-2)',
                    overflowX: 'auto'
                  }}>
                    {['All', '1', '2', '3'].map(b => (
                      <button
                        key={b}
                        onClick={() => setUserBranchFilter(b)}
                        style={{
                          padding: '6px 16px',
                          border: '1px solid var(--surface-2)',
                          background: userBranchFilter === b ? 'var(--primary)' : 'white',
                          color: userBranchFilter === b ? 'white' : 'var(--text)',
                          borderRadius: '20px',
                          fontSize: '13px',
                          cursor: 'pointer',
                          fontWeight: 500,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {b === 'All' ? 'All Branches' : `Branch ${b} (R${b})`}
                      </button>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="users-table-wrap desktop-table-view" style={{ overflowX: 'auto', width: '100%' }}>
                    <div style={{ minWidth: '800px' }}>
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
        .form-group input:not([type="radio"]):not([type="checkbox"]), 
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

        .form-group input:not([readonly]):not([type="radio"]):not([type="checkbox"]):focus,
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
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 8px;
            width: 100%;
            -webkit-overflow-scrolling: touch;
          }
          
          .settings-nav-item {
            flex-shrink: 0;
            white-space: nowrap;
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
          .settings-content, .settings-card, .settings-form {
            max-width: 100%;
            overflow-x: hidden;
            box-sizing: border-box;
          }
          .settings-container {
            overflow-x: hidden;
            width: 100%;
          }
        }

        /* POS Options Custom Styles */
        .pos-stock-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        @media (max-width: 900px) {
          .pos-stock-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 580px) {
          .pos-stock-grid {
            grid-template-columns: 1fr;
          }
        }

        .pos-stock-card {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          background: var(--surface);
          border: 1.5px solid var(--surface-2);
          transition: all 0.15s ease;
          user-select: none;
          position: relative;
          box-sizing: border-box;
        }

        .pos-stock-card:hover {
          border-color: #cbd5e1;
          background: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
        }

        .pos-stock-card.selected {
          border-color: var(--primary) !important;
          background: rgba(244, 180, 0, 0.06) !important;
          box-shadow: 0 3px 12px rgba(244, 180, 0, 0.18) !important;
        }

        .pos-stock-card.selected:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(244, 180, 0, 0.22) !important;
        }

        .pos-view-pill-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 11px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          background: transparent;
          color: var(--text-muted);
          transition: all 0.15s ease;
        }

        .pos-view-pill-btn:hover {
          color: var(--text-primary);
        }

        .pos-view-pill-btn.active {
          background: #ffffff;
          color: var(--text-primary);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
        }
      `}</style>

      {/* Confirm Delete User Modal */}
      {confirmDeleteUser && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Confirm Deletion</h2>
              <button className="btn-close" onClick={() => setConfirmDeleteUser(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 16, marginBottom: 20 }}>
                Are you sure you want to delete this user?
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-secondary" style={{ padding: '10px 24px' }} onClick={() => setConfirmDeleteUser(null)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '10px 24px', background: 'var(--red)' }} 
                  onClick={executeDeleteUser}
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
