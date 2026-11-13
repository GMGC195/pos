import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { 
  Banknote,
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
  Info,
  Save,
  Check,
  Printer,
  FileText,
  Smartphone,
  Wifi
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api'

export default function Settings() {
  const { user, updateUser } = useAuth()
  const [activeTab, setActiveTab] = useState('account') // 'account' | 'users' | 'hardware'
  const [loading, setLoading] = useState(false)
  const [printMode, setPrintMode] = useState(localStorage.getItem('printMode') || 'standard')
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false)
  const [printerIp, setPrinterIp] = useState(() => localStorage.getItem('printerIp') || '127.0.0.1')
  const [printerPort, setPrinterPort] = useState(() => localStorage.getItem('printerPort') || '9100')
  const [paperWidth, setPaperWidth] = useState(() => localStorage.getItem('paperWidth') || '80mm')
  const [salarySlipPrintMode, setSalarySlipPrintMode] = useState(() => localStorage.getItem('salarySlipPrintMode') || 'global')
  const [salarySlipPaperFormat, setSalarySlipPaperFormat] = useState(() => localStorage.getItem('salarySlipPaperFormat') || '80mm')
  const [autoPrintSalaryPayment, setAutoPrintSalaryPayment] = useState(() => localStorage.getItem('autoPrintSalaryPayment') === 'true')
  const [testingKitchenPrint, setTestingKitchenPrint] = useState(false)
  const [testingSalaryPrint, setTestingSalaryPrint] = useState(false)
  const [savingPrinterIp, setSavingPrinterIp] = useState(false)
  const [printerIpSaved, setPrinterIpSaved] = useState(false)
  const [lowStockBehavior, setLowStockBehavior] = useState('block')
  const [stockViewMode, setStockViewMode] = useState(() => localStorage.getItem('pos_stock_view_mode') || 'cards')
  const [reportEmails, setReportEmails] = useState(['mr.caffee25@gmail.com'])
  // Salary Payable User Permissions State
  const [salaryUsers, setSalaryUsers] = useState([])
  const [availableSalaryMonths, setAvailableSalaryMonths] = useState([])
  const [selectedSalaryUserId, setSelectedSalaryUserId] = useState(null)
  const [editingSalaryPerm, setEditingSalaryPerm] = useState({ permission_type: 'pay_now', allowed_months: [] })
  const [loadingSalaryPerms, setLoadingSalaryPerms] = useState(false)
  const [savingSalaryPerms, setSavingSalaryPerms] = useState(false)
  const [customMonthInput, setCustomMonthInput] = useState('')

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
  const [employeeOptions, setEmployeeOptions] = useState([])
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
    branch: '',
    employee_id: ''
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
      fetchEmployeeOptions()
    }
    if (activeTab === 'hardware' || ((activeTab === 'pos_settings' || activeTab === 'report_emails') && isAdminRole)) {
      fetchSettings()
    }
    if (activeTab === 'salary_permissions' && isAdminRole) {
      fetchSalaryPermissions()
    }
  }, [activeTab, user?.role])


  const fetchSalaryPermissions = async () => {
    setLoadingSalaryPerms(true)
    try {
      const res = await api.get('/api/settings/salary-permissions')
      if (res.data) {
        const users = res.data.users || []
        setSalaryUsers(users)
        setAvailableSalaryMonths(res.data.available_months || [])
        if (users.length > 0) {
          const target = selectedSalaryUserId ? (users.find(u => u.id === selectedSalaryUserId) || users[0]) : users[0]
          setSelectedSalaryUserId(target.id)
          let months = target.allowed_months || []
          if (typeof months === 'string') {
            try { months = JSON.parse(months) } catch(e) { months = [] }
          }
          setEditingSalaryPerm({
            permission_type: target.permission_type || 'pay_now',
            allowed_months: Array.isArray(months) ? months : []
          })
        }
      }
    } catch (err) {
      console.error('Failed to load salary permissions:', err)
      toast.error('Failed to load salary permissions')
    } finally {
      setLoadingSalaryPerms(false)
    }
  }

  const handleSelectSalaryUser = (u) => {
    setSelectedSalaryUserId(u.id)
    let months = u.allowed_months || []
    if (typeof months === 'string') {
      try { months = JSON.parse(months) } catch(e) { months = [] }
    }
    setEditingSalaryPerm({
      permission_type: u.permission_type || 'pay_now',
      allowed_months: Array.isArray(months) ? months : []
    })
  }

  const handleSaveSalaryPermissions = async () => {
    if (!selectedSalaryUserId) return
    setSavingSalaryPerms(true)
    try {
      await api.put(`/api/settings/salary-permissions/${selectedSalaryUserId}`, editingSalaryPerm)
      toast.success('Salary payable user permissions saved successfully')
      fetchSalaryPermissions()
    } catch (err) {
      console.error('Failed to save salary permissions:', err)
      toast.error(err.response?.data?.error || 'Failed to save salary permissions')
    } finally {
      setSavingSalaryPerms(false)
    }
  }

  const fetchSettings = async () => {
    try {
      const res = await api.get('/api/settings')
      if (res.data) {
        setAutoPrintEnabled(res.data.auto_print_enabled)
        
        // Retain custom IP if server still has default 127.0.0.1 but client has an IP saved
        const localIp = localStorage.getItem('printerIp')
        const serverIp = res.data.printer_ip
        const effectiveIp = (serverIp && serverIp.trim() && serverIp !== '127.0.0.1')
          ? serverIp.trim()
          : (localIp && localIp.trim() ? localIp.trim() : (serverIp || '127.0.0.1'))

        setPrinterIp(effectiveIp)
        localStorage.setItem('printerIp', effectiveIp)

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

  const handleSavePrinterIp = async (e) => {
    if (e) e.preventDefault()
    const trimmedIp = (printerIp || '').trim()
    const trimmedPort = (printerPort || '').trim() || '9100'
    if (!trimmedIp) {
      toast.error('Please enter a printer IP address')
      return
    }

    setSavingPrinterIp(true)
    try {
      // 1. Immediately store to local device storage
      localStorage.setItem('printerIp', trimmedIp)
      localStorage.setItem('printerPort', trimmedPort)
      localStorage.setItem('paperWidth', paperWidth)
      setPrinterIp(trimmedIp)
      setPrinterPort(trimmedPort)

      // 2. Persist to server backend database
      await api.put('/api/settings', { printer_ip: trimmedIp })

      setPrinterIpSaved(true)
      setTimeout(() => setPrinterIpSaved(false), 2500)
      toast.success('Thermal Printer Settings saved successfully!')
    } catch (err) {
      console.error('Failed to save printer IP to server:', err)
      setPrinterIpSaved(true)
      setTimeout(() => setPrinterIpSaved(false), 2500)
      toast.success('Printer IP saved for this device')
    } finally {
      setSavingPrinterIp(false)
    }
  }

  const handleTestKitchenPrint = async () => {
    setTestingKitchenPrint(true)
    const toastId = toast.loading('Sending test kitchen ticket to printer...')
    try {
      const res = await api.post('/api/settings/test-print', {
        printerIp: (printerIp || '').trim() || '127.0.0.1',
        printerPort: (printerPort || '').trim() || '9100',
        branchId: user?.branch || '1'
      })
      toast.success(res.data?.message || 'Test kitchen ticket printed successfully!', { id: toastId })
    } catch (err) {
      console.error('Kitchen test print error:', err)
      toast.error(err?.response?.data?.error || 'Failed to print test ticket. Ensure printer/agent is running.', { id: toastId })
    } finally {
      setTestingKitchenPrint(false)
    }
  }

  const handleTestSalaryPrint = async () => {
    setTestingSalaryPrint(true)
    const toastId = toast.loading('Sending test salary slip to printer...')
    try {
      const res = await api.post('/api/payroll/test-cloud-slip', {
        printerIp: (printerIp || '').trim() || '127.0.0.1',
        printerPort: (printerPort || '').trim() || '9100',
        branchId: user?.branch || '1'
      })
      toast.success(res.data?.message || 'Test salary slip sent to thermal printer!', { id: toastId })
    } catch (err) {
      console.error('Salary test print error:', err)
      toast.error(err?.response?.data?.error || 'Failed to print test salary slip. Ensure printer/agent is running.', { id: toastId })
    } finally {
      setTestingSalaryPrint(false)
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
      if (printerIp) {
        localStorage.setItem('printerIp', printerIp.trim())
      }
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

    const fetchEmployeeOptions = async () => {
    try {
      const res = await api.get('/api/auth/employee-options')
      setEmployeeOptions(res.data || [])
    } catch (err) {
      console.error('Failed to load employee options:', err)
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
      setUserForm({ username: '', email: '', password: '', role: 'Operator', shift: '', branch: '', employee_id: '' })
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
      setUserForm({ username: '', email: '', password: '', role: 'Operator', shift: '', branch: '', employee_id: '' })
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
      branch: u.branch || '',
      employee_id: u.employee_id || ''
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
          {isAdmin && (
            <button 
              className={`settings-nav-item ${activeTab === 'salary_permissions' ? 'active' : ''}`}
              onClick={() => setActiveTab('salary_permissions')}
            >
              <Banknote size={18} /> Salary Permissions
            </button>
          )}
        </aside>

        {/* Content Area */}
        <main className="settings-content">
          {activeTab === 'hardware' && (
            <div className="settings-card fade-in" style={{ maxWidth: 840 }}>
              <div className="card-header" style={{ borderBottom: '1px solid var(--surface-2)', paddingBottom: '16px', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Printer size={22} style={{ color: 'var(--primary)' }} />
                    Hardware & Printers Configuration
                  </h2>
                  <p>Configure device print modes, thermal network printers, employee salary slips, and hardware testing</p>
                </div>
              </div>

              <div className="settings-form" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                
                {/* 1. Global POS / Kitchen Print Mode */}
                <div style={{ background: 'var(--surface-1, #f8fafc)', border: '1px solid var(--surface-2, #e2e8f0)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <label style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Wifi size={17} style={{ color: '#0284c7' }} />
                      Default Print Mode (POS & Kitchen)
                    </label>
                    <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '6px', background: printMode === 'cloud' ? '#ecfdf5' : '#f1f5f9', color: printMode === 'cloud' ? '#059669' : '#64748b', fontWeight: 700, border: '1px solid #cbd5e1' }}>
                      {printMode === 'cloud' ? '⚡ Cloud Active' : printMode === 'rawbt' ? '📱 Mobile RawBT' : '💻 Standard USB'}
                    </span>
                  </div>

                  <select 
                    value={printMode} 
                    onChange={e => {
                      setPrintMode(e.target.value)
                      localStorage.setItem('printMode', e.target.value)
                      toast.success('Print mode saved for this device')
                    }}
                    style={{ padding: '11px 14px', borderRadius: '8px', border: '1.5px solid var(--surface-2, #cbd5e1)', width: '100%', fontSize: '14px', fontWeight: 600, background: 'var(--surface, #ffffff)', color: 'var(--text-primary)' }}
                  >
                    <option value="standard">Standard Print (Browser Dialog / Laptop USB Printer)</option>
                    <option value="cloud">Cloud Auto-Printing (Direct ESC/POS 80mm via Local Agent / LAN)</option>
                    <option value="rawbt">RawBT App (Android Mobile Direct Print via App Intent)</option>
                  </select>

                  <p style={{ fontSize: 12.5, color: 'var(--text-muted, #64748b)', marginTop: 10, lineHeight: 1.5, marginBottom: 0 }}>
                    {printMode === 'standard' 
                      ? 'Opens the standard browser print dialog. Best for laptops or desktop computers connected to a USB receipt printer.' 
                      : printMode === 'cloud'
                      ? 'Instantly pushes orders and slips to network thermal receipt printers via Pusher and local print agents on Port 9100.'
                      : 'Uses the RawBT Android app to print directly from mobile phones/tablets over LAN or Bluetooth. Ideal for mobile order-takers.'}
                  </p>
                </div>

                {/* 2. Network Thermal Printer Settings (IP, Port, Test Print) */}
                <div style={{ background: 'var(--surface-1, #f8fafc)', border: '1px solid var(--surface-2, #e2e8f0)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <label style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Printer size={17} style={{ color: '#d97706' }} />
                      Network Thermal Receipt Printer
                    </label>
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', fontWeight: 700 }}>
                      TCP RAW ESC/POS
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(110px, 1fr) auto', gap: '12px', alignItems: 'end' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #475569)', display: 'block', marginBottom: '6px' }}>
                        Printer IP Address
                      </label>
                      <input 
                        type="text" 
                        value={printerIp}
                        onChange={e => {
                          setPrinterIp(e.target.value)
                          setPrinterIpSaved(false)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSavePrinterIp()
                          }
                        }}
                        placeholder="e.g. 192.168.1.100 or 127.0.0.1"
                        style={{ 
                          padding: '10px 12px', 
                          borderRadius: '8px', 
                          border: printerIpSaved ? '1.5px solid #10b981' : '1px solid var(--surface-2, #cbd5e1)', 
                          width: '100%', 
                          background: 'var(--surface, #ffffff)',
                          fontSize: '13.5px',
                          fontFamily: 'monospace',
                          color: 'var(--text-primary)',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #475569)', display: 'block', marginBottom: '6px' }}>
                        Printer Port
                      </label>
                      <input 
                        type="text" 
                        value={printerPort}
                        onChange={e => {
                          setPrinterPort(e.target.value)
                          setPrinterIpSaved(false)
                        }}
                        placeholder="9100"
                        style={{ 
                          padding: '10px 12px', 
                          borderRadius: '8px', 
                          border: '1px solid var(--surface-2, #cbd5e1)', 
                          width: '100%', 
                          background: 'var(--surface, #ffffff)',
                          fontSize: '13.5px',
                          fontFamily: 'monospace',
                          color: 'var(--text-primary)',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      id="btn-save-printer-ip"
                      onClick={handleSavePrinterIp}
                      disabled={savingPrinterIp}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '10px 18px',
                        background: printerIpSaved ? '#10b981' : 'var(--primary, #e11d48)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: savingPrinterIp ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                        height: '40px'
                      }}
                    >
                      {savingPrinterIp ? <RefreshCw size={14} className="spin" /> : printerIpSaved ? <Check size={15} /> : <Save size={15} />}
                      <span>{printerIpSaved ? 'Saved' : 'Save Printer'}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px dashed #cbd5e1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Info size={13} color="var(--text-muted)" />
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Default thermal receipt port is <strong>9100</strong>. Enter printer's static LAN IP address.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestKitchenPrint}
                      disabled={testingKitchenPrint}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 14px',
                        borderRadius: '6px',
                        background: '#eff6ff',
                        color: '#0284c7',
                        border: '1px solid #bfdbfe',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: testingKitchenPrint ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {testingKitchenPrint ? <RefreshCw size={13} className="spin" /> : <Printer size={13} />}
                      Test Kitchen Slip Print
                    </button>
                  </div>
                </div>

                {/* 3. Dedicated Salary Slip Printing Options */}
                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <Banknote size={18} style={{ color: '#059669' }} />
                        Salary Slip Printing Preferences
                      </h3>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0 0' }}>
                        Configure format, routing, and automation for official employee salary payment receipts
                      </p>
                    </div>

                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#ecfdf5', color: '#059669', fontWeight: 700, border: '1px solid #a7f3d0' }}>
                      Salary Module
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                    {/* Salary Slip Print Routing */}
                    <div>
                      <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                        Salary Slip Print Destination
                      </label>
                      <select 
                        value={salarySlipPrintMode}
                        onChange={e => {
                          setSalarySlipPrintMode(e.target.value)
                          localStorage.setItem('salarySlipPrintMode', e.target.value)
                          toast.success('Salary slip print destination updated')
                        }}
                        style={{ padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', width: '100%', fontSize: '13px', fontWeight: 600, background: '#fff', color: '#1e293b' }}
                      >
                        <option value="global">Follow Device Default ({printMode === 'cloud' ? 'Cloud Printer' : printMode === 'rawbt' ? 'RawBT' : 'Standard Browser'})</option>
                        <option value="cloud">Always Cloud Auto-Print (Direct 80mm ESC/POS Thermal)</option>
                        <option value="standard">Always Browser Print Dialog (Window Preview / PDF)</option>
                        <option value="rawbt">Always RawBT App (Android Mobile)</option>
                      </select>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                        {salarySlipPrintMode === 'cloud' ? 'Outputs directly to Port 9100 thermal printer without dialog.' : 'Can open print preview or send to mobile app.'}
                      </span>
                    </div>

                    {/* Salary Slip Paper Layout */}
                    <div>
                      <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                        Paper & Slip Format
                      </label>
                      <select 
                        value={salarySlipPaperFormat}
                        onChange={e => {
                          setSalarySlipPaperFormat(e.target.value)
                          localStorage.setItem('salarySlipPaperFormat', e.target.value)
                          toast.success('Salary slip paper format saved')
                        }}
                        style={{ padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', width: '100%', fontSize: '13px', fontWeight: 600, background: '#fff', color: '#1e293b' }}
                      >
                        <option value="80mm">80mm Thermal Receipt (Standard POS Roll)</option>
                        <option value="a4">A4 Full Page Voucher Statement</option>
                      </select>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                        Optimized with clear borders, duty hours breakdown, and signature boxes.
                      </span>
                    </div>
                  </div>

                  {/* Auto-Print on Salary Payment Toggle */}
                  <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                      <input 
                        type="checkbox"
                        checked={autoPrintSalaryPayment}
                        onChange={e => {
                          setAutoPrintSalaryPayment(e.target.checked)
                          localStorage.setItem('autoPrintSalaryPayment', e.target.checked ? 'true' : 'false')
                          toast.success(e.target.checked ? 'Auto-print on salary payment enabled' : 'Auto-print on salary payment disabled')
                        }}
                        style={{ width: '17px', height: '17px', accentColor: '#059669', cursor: 'pointer' }}
                      />
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', display: 'block' }}>
                          Auto-Print on Salary Payment
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          Automatically print or dispatch the salary receipt whenever a payment is confirmed in the Pay Now popup
                        </span>
                      </div>
                    </label>

                    <button
                      type="button"
                      onClick={handleTestSalaryPrint}
                      disabled={testingSalaryPrint}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 14px',
                        borderRadius: '6px',
                        background: '#ecfdf5',
                        color: '#059669',
                        border: '1px solid #a7f3d0',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: testingSalaryPrint ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {testingSalaryPrint ? <RefreshCw size={13} className="spin" /> : <Printer size={13} />}
                      Test Salary Slip Print
                    </button>
                  </div>
                </div>

                {/* 4. Cloud Printing Infrastructure & Diagnostics */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Wifi size={14} style={{ color: '#10b981' }} />
                      Cloud Print Agent Infrastructure
                    </span>
                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>
                      Cluster: ap2 | Active
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                    When using Cloud Printing, orders and salary slips are sent across the Pusher event channels (<code>branch-1-orders</code>, <code>branch-2-orders</code>, <code>branch-3-orders</code>). The local Windows print agent running in <code>print_agents/</code> receives these events and immediately prints them to the receipt printer at port 9100.
                  </p>
                </div>

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
                          <option value="Salary Pay Operator">Salary Pay Operator</option>
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
                                            {userForm.role === 'Employee' && (
                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                            <span>Linked Employee Record *</span>
                            {userForm.employee_id && (
                              <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
                                #{userForm.employee_id} Selected
                              </span>
                            )}
                          </label>
                          <select 
                            value={userForm.employee_id || ''}
                            onChange={e => {
                              const selectedId = e.target.value;
                              const matched = employeeOptions.find(opt => String(opt.id) === String(selectedId));
                              const updates = { ...userForm, employee_id: selectedId };
                              if (matched) {
                                if (!editingUser) {
                                  if (!userForm.username) updates.username = (matched.name || '').toLowerCase().replace(/\s+/g, '_');
                                  if (!userForm.email && matched.email) updates.email = matched.email;
                                }
                                if (matched.branch) updates.branch = matched.branch;
                              }
                              setUserForm(updates);
                            }}
                            required
                            style={{
                              padding: '12px 14px',
                              borderRadius: '12px',
                              border: '1.5px solid var(--surface-2)',
                              background: 'var(--surface)',
                              fontSize: '14px',
                              width: '100%',
                              color: 'var(--text-primary)'
                            }}
                          >
                            <option value="">-- Select an Employee from Database --</option>
                            {employeeOptions.map(emp => {
                              const isLinkedToOther = emp.linked_user_id && (!editingUser || emp.linked_user_id !== editingUser.id);
                              return (
                                <option 
                                  key={emp.id} 
                                  value={emp.id}
                                  disabled={isLinkedToOther}
                                >
                                  {emp.name} ({emp.employee_code || `EMP-${emp.id}`}) — {emp.role || 'Staff'} {emp.branch ? `[${emp.branch}]` : ''} {isLinkedToOther ? `⚠️ (Already linked to @${emp.linked_username})` : ''}
                                </option>
                              );
                            })}
                          </select>
                          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                            Linking an employee connects this login account to their Employee Portal, attendance, and Khata.
                          </p>
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
                          setUserForm({ username: '', email: '', password: '', role: 'Operator', shift: '', branch: '', employee_id: '' })
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
                      {['Admin', 'Management', 'Operator', 'Salary Pay Operator', 'Cashier', 'Order Taker'].map(r => (
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
                              <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {u.role === 'Employee' ? (
                                  u.employee_name ? (
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      👤 {u.employee_name} ({u.employee_code || `EMP-${u.employee_id}`})
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                                      ⚠️ Not Linked
                                    </span>
                                  )
                                ) : (u.role === 'Operator' ? (u.shift || 'None') : '--')}
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

          {activeTab === 'salary_permissions' && isAdmin && (
            <div className="fade-in">
              <div className="settings-card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 4px 0' }}>
                      <Banknote size={22} style={{ color: 'var(--primary, #d97706)' }} />
                      Salary Payable User Permissions
                    </h2>
                    <p style={{ margin: 0 }}>Configure access levels (Only View vs Pay Now) and authorized salary months for Salary Pay Operator users.</p>
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm"
                    onClick={fetchSalaryPermissions}
                    disabled={loadingSalaryPerms}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <RefreshCw size={14} className={loadingSalaryPerms ? 'spin' : ''} />
                    Refresh
                  </button>
                </div>

                {loadingSalaryPerms ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px auto' }} />
                    <p>Loading salary payable users & permissions...</p>
                  </div>
                ) : salaryUsers.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', margin: '16px 0' }}>
                    <ShieldAlert size={32} style={{ color: '#d97706', marginBottom: '8px' }} />
                    <h4 style={{ margin: '0 0 6px 0', color: '#1e293b' }}>No Salary Pay Operator Users Found</h4>
                    <p style={{ margin: 0, fontSize: '13px' }}>Create a user with the role "Salary Pay Operator" in User Management to configure permissions.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '24px', marginTop: '16px' }}>
                    {/* User Selection Sidebar */}
                    <div style={{ borderRight: '1px solid var(--border, #e2e8f0)', paddingRight: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Salary Payable Users ({salaryUsers.length})
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {salaryUsers.map(u => {
                          const isSelected = selectedSalaryUserId === u.id;
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => handleSelectSalaryUser(u)}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: isSelected ? '2px solid var(--primary, #d97706)' : '1px solid var(--border, #cbd5e1)',
                                background: isSelected ? '#fffbeb' : '#fff',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                                  {u.username}
                                </span>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: (u.permission_type === 'pay_now' ? '#dcfce7' : '#e0f2fe'),
                                  color: (u.permission_type === 'pay_now' ? '#15803d' : '#0369a1')
                                }}>
                                  {u.permission_type === 'pay_now' ? 'Pay Now' : 'Only View'}
                                </span>
                              </div>
                              <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                {u.name ? `${u.name} • ` : ''}Branch: {u.branch || 'All'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Permissions Configuration Form */}
                    <div>
                      {(() => {
                        const curUser = salaryUsers.find(u => u.id === selectedSalaryUserId);
                        if (!curUser) return null;

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Selected User Header */}
                            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Configuring Permissions For:</span>
                                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                                  {curUser.username} {curUser.name ? `(${curUser.name})` : ''}
                                </div>
                                <div style={{ fontSize: '12px', color: '#475569' }}>
                                  Email: {curUser.email || 'None'} • Branch: {curUser.branch || 'All Branches'}
                                </div>
                              </div>
                              {curUser.updated_at && (
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                  Last updated by {curUser.updated_by || 'Admin'}
                                </span>
                              )}
                            </div>

                            {/* Section B: Access Permission */}
                            <div>
                              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                                1. Access Permission
                              </label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {/* Only View Card */}
                                <div 
                                  onClick={() => setEditingSalaryPerm(prev => ({ ...prev, permission_type: 'view_only' }))}
                                  style={{
                                    padding: '14px',
                                    borderRadius: '10px',
                                    border: editingSalaryPerm.permission_type === 'view_only' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                    background: editingSalaryPerm.permission_type === 'view_only' ? '#f0f9ff' : '#fff',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <input 
                                      type="radio" 
                                      name="salary_permission_type" 
                                      checked={editingSalaryPerm.permission_type === 'view_only'}
                                      onChange={() => {}} 
                                      style={{ accentColor: '#0284c7' }}
                                    />
                                    <strong style={{ fontSize: '14px', color: '#0369a1' }}>Only View</strong>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                                    The user can view permitted employees' salary records, paid amounts, and remaining balances. All <strong>Pay Now</strong> buttons are hidden, and payment submissions are strictly blocked.
                                  </p>
                                </div>

                                {/* Pay Now Card */}
                                <div 
                                  onClick={() => setEditingSalaryPerm(prev => ({ ...prev, permission_type: 'pay_now' }))}
                                  style={{
                                    padding: '14px',
                                    borderRadius: '10px',
                                    border: editingSalaryPerm.permission_type === 'pay_now' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                                    background: editingSalaryPerm.permission_type === 'pay_now' ? '#f0fdf4' : '#fff',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <input 
                                      type="radio" 
                                      name="salary_permission_type" 
                                      checked={editingSalaryPerm.permission_type === 'pay_now'}
                                      onChange={() => {}} 
                                      style={{ accentColor: '#16a34a' }}
                                    />
                                    <strong style={{ fontSize: '14px', color: '#15803d' }}>Pay Now</strong>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                                    The user can view permitted salary records and process salary payments using the <strong>Pay Now Popup Modal</strong>. Both <strong>Pay Now</strong> and <strong>Pay and Print</strong> actions are enabled.
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Section C: Month-Wise Salary Access */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div>
                                  <label style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                                    2. Month-Wise Salary Access
                                  </label>
                                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                                    Select which salary months {curUser.username} is allowed to access. Unauthorized months will be completely hidden and blocked.
                                  </p>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                      setEditingSalaryPerm(prev => ({ ...prev, allowed_months: [...availableSalaryMonths] }));
                                    }}
                                    style={{ fontSize: '11px', padding: '3px 8px' }}
                                  >
                                    Select All
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                      setEditingSalaryPerm(prev => ({ ...prev, allowed_months: [] }));
                                    }}
                                    style={{ fontSize: '11px', padding: '3px 8px' }}
                                  >
                                    Clear All
                                  </button>
                                </div>
                              </div>

                              {/* Month Selection Chips */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                {availableSalaryMonths.map(m => {
                                  const isAllowed = editingSalaryPerm.allowed_months.includes(m);
                                  const [yr, mn] = m.split('-').map(Number);
                                  const monthLabel = new Date(yr, mn - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                                  return (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => {
                                        setEditingSalaryPerm(prev => {
                                          const next = isAllowed 
                                            ? prev.allowed_months.filter(x => x !== m)
                                            : [...prev.allowed_months, m];
                                          return { ...prev, allowed_months: next };
                                        });
                                      }}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 12px',
                                        borderRadius: '20px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        border: isAllowed ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                                        background: isAllowed ? '#dcfce7' : '#fff',
                                        color: isAllowed ? '#15803d' : '#475569',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      {isAllowed ? <Check size={14} style={{ color: '#16a34a' }} /> : <span style={{ width: 14 }} />}
                                      <span>{monthLabel} ({m})</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Custom Month Addition */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Add specific month:</label>
                                <input
                                  type="month"
                                  value={customMonthInput}
                                  onChange={e => setCustomMonthInput(e.target.value)}
                                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    if (customMonthInput && /^\d{4}-\d{2}$/.test(customMonthInput)) {
                                      if (!availableSalaryMonths.includes(customMonthInput)) {
                                        setAvailableSalaryMonths(prev => [...prev, customMonthInput]);
                                      }
                                      if (!editingSalaryPerm.allowed_months.includes(customMonthInput)) {
                                        setEditingSalaryPerm(prev => ({
                                          ...prev,
                                          allowed_months: [...prev.allowed_months, customMonthInput]
                                        }));
                                      }
                                      setCustomMonthInput('');
                                    }
                                  }}
                                  style={{ fontSize: '11px', padding: '4px 10px' }}
                                >
                                  Add Month
                                </button>
                              </div>
                            </div>

                            {/* Save Button */}
                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleSaveSalaryPermissions}
                                disabled={savingSalaryPerms}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 24px', fontWeight: 800, fontSize: '13px' }}
                              >
                                {savingSalaryPerms ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                                Save Permissions for {curUser.username}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
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
            {u.role === 'Employee' && (
              <span style={{ fontSize: '10.5px', color: u.employee_name ? 'var(--primary)' : '#f59e0b', fontWeight: 600 }}>
                • {u.employee_name ? `👤 ${u.employee_name}` : '⚠️ Not linked'}
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
