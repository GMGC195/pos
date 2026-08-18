import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import axios from '../api'
import toast from 'react-hot-toast'
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_VERSION,
  BRAND_LOGO,
  BRAND_EMAIL,
  BRAND_PRIMARY
} from '../branding'
import { 
  LayoutDashboard, 
  Receipt, 
  Package, 
  Clock, 
  CalendarDays, 
  ClipboardList, 
  TrendingUp, 
  Settings, 
  HelpCircle, 
  LogOut, 
  Menu, 
  Search, 
  Bell, 
  Maximize, 
  Ban,
  Database,
  Calculator,
  AlertTriangle,
  X,
  PlusCircle,
  Users,
  Fingerprint,
  CalendarRange
} from 'lucide-react'

const navGroups = [
  {
    title: 'Main Menu',
    items: [
      { to: '/', icon: <LayoutDashboard size={18} strokeWidth={2.2} />, label: 'Dashboard' },
      { to: '/pos', icon: <Receipt size={18} strokeWidth={2.2} />, label: 'Point of Sale & Billing', roles: ['Developer'] },
      { to: '/hold-payments', icon: <Clock size={18} strokeWidth={2.2} />, label: 'Hold Payment', roles: ['Developer'] },
      { to: '/today-sales', icon: <CalendarDays size={18} strokeWidth={2.2} />, label: "Today Sale", roles: ['Developer'] },
      { to: '/cancel-requests', icon: <Ban size={18} strokeWidth={2.2} />, label: 'Cancel Request', roles: ['Developer'] },
    ]
  },
  {
    title: 'Reports',
    items: [
      { to: '/sales-item', icon: <ClipboardList size={18} strokeWidth={2.2} />, label: 'Sales Item & Revenue', roles: ['Developer'] },
      { to: '/reports', icon: <TrendingUp size={18} strokeWidth={2.2} />, label: 'Reports', roles: ['Developer'] },
    ]
  },
  {
    title: 'Item Management',
    items: [
      { to: '/inventory', icon: <PlusCircle size={18} strokeWidth={2.2} />, label: 'Add Item', roles: ['Developer'] },
      { to: '/stock-management', icon: <Database size={18} strokeWidth={2.2} />, label: 'Stock Mangement', roles: ['Developer'] },
      { to: '/product-cost', icon: <Package size={18} strokeWidth={2.2} />, label: 'Inventory Management', roles: ['Developer'] },
    ]
  },
  {
    title: 'Employees & Attendance',
    items: [
      { to: '/employees', icon: <Users size={18} strokeWidth={2.2} />, label: 'Manage Employees', roles: ['Admin', 'Management'] },
      { to: '/attendance', icon: <Fingerprint size={18} strokeWidth={2.2} />, label: 'Mark Attendance', roles: ['Admin', 'Operator', 'Management', 'Employee'] },
      { to: '/today-attendance', icon: <Clock size={18} strokeWidth={2.2} />, label: 'Today Attendance', roles: ['Admin', 'Operator', 'Management'] },
      { to: '/attendance-reports', icon: <CalendarRange size={18} strokeWidth={2.2} />, label: 'Attendance Sheet', roles: ['Admin', 'Management'] },
      { to: '/payroll', icon: <Calculator size={18} strokeWidth={2.2} />, label: 'Payroll & Salary', roles: ['Admin', 'Management'] },
      { to: '/edited-logs', icon: <AlertTriangle size={18} strokeWidth={2.2} />, label: 'Edit Attendance Logs', roles: ['Admin', 'Operator'] },
    ]
  }
]

export default function Layout() {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState([])
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [hasNewAlerts, setHasNewAlerts] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const location = useLocation()

  // Password change states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [passSubmitting, setPassSubmitting] = useState(false);

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setPassError('');
    if (newPassword.length < 6) {
      setPassError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Passwords do not match.');
      return;
    }

    setPassSubmitting(true);
    try {
      await axios.post('/api/auth/change-password', { newPassword });
      toast.success('Password updated successfully!');
      updateUser({ must_change_password: false });
    } catch (err) {
      setPassError(err.response?.data?.error || 'Failed to update password.');
    } finally {
      setPassSubmitting(false);
    }
  };

  useEffect(() => {
    if (user?.role?.toLowerCase() === 'employee' && location.pathname === '/') {
      navigate('/attendance', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  const fetchAlerts = async () => {
    try {
      let combinedAlerts = [];
      const role = user?.role?.toLowerCase();

      // 1. Fetch stock alerts only for admin or developer
      if (role === 'admin' || role === 'developer') {
        try {
          const stockRes = await axios.get('/api/stock/alerts');
          const stockAlerts = stockRes.data.map(item => ({
            id: `stock-${item.id}`,
            type: 'stock',
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            low_stock_at: item.low_stock_at
          }));
          combinedAlerts = [...combinedAlerts, ...stockAlerts];
        } catch (err) {
          console.error('Error fetching stock alerts:', err);
        }
      }

      // 2. Fetch attendance warnings/requests for everyone
      try {
        const attRes = await axios.get('/api/attendance/notifications');
        const attAlerts = attRes.data.map(item => ({
          id: item.id,
          type: item.type, // 'attendance_warning' or 'attendance_request'
          message: item.message,
          check_in: item.check_in,
          created_at: item.created_at,
          employee_name: item.employee_name
        }));
        combinedAlerts = [...combinedAlerts, ...attAlerts];
      } catch (err) {
        console.error('Error fetching attendance warnings:', err);
      }

      setAlerts(combinedAlerts);
      if (combinedAlerts.length > 0 && !isNotifOpen) {
        setHasNewAlerts(true);
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  };

  const handleClearAll = async (e) => {
    e.stopPropagation();
    try {
      await axios.post('/api/stock/alerts/clear');
      setAlerts(prev => prev.filter(item => item.type === 'attendance_warning' || item.type === 'attendance_request'));
      setHasNewAlerts(false);
    } catch (err) {
      console.error('Error clearing alerts:', err);
    }
  };

  const handleClearItem = async (e, id) => {
    e.stopPropagation();
    try {
      if (typeof id === 'string' && id.startsWith('stock-')) {
        const stockId = id.replace('stock-', '');
        await axios.post(`/api/stock/alerts/${stockId}/clear`);
      }
      setAlerts(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Error clearing alert:', err);
    }
  };

  const formatNotifTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  useEffect(() => {
    if (user) {
      fetchAlerts();
      const interval = setInterval(fetchAlerts, 5 * 60 * 1000); // Refresh every 5 mins
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    if (isNotifOpen) {
      setHasNewAlerts(false)
    }
  }, [isNotifOpen])

  const pageTitle = {
    '/': 'Dashboard Overview',
    '/pos': 'Point of Sale & Billing',
    '/inventory': 'Add Item',
    '/hold-payments': 'Hold Payment Queue',
    '/today-sales': "Today Sale Analysis",
    '/sales-item': 'Sales Item & Revenue Report',
    '/reports': 'Reports & Analytics',
    '/cancel-requests': 'Cancellation Request Management',
    '/stock-management': 'Add New Stock & Pricing Management',
    '/product-cost': 'Inventory Management and Production Cost Calculation',
    '/employees': 'Manage Employees',
    '/attendance': 'Mark Attendance Panel',
    '/today-attendance': "Today's Attendance Panel",
    '/attendance-reports': 'Attendance Sheet',
    '/payroll': 'Employee Payroll & Slips',
    '/settings': 'System Settings',
    '/help-support': 'Help & Support Center',
    '/edited-logs': 'Edit Attendance Audit Logs'
  }[location.pathname] || `${BRAND_NAME} Pro`

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const filteredNavGroups = navGroups.map(group => {
    let items = group.items.filter(item => {
      if (user?.role?.toLowerCase() === 'developer') return true
      if (!item.roles) return true
      const userRole = user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1).toLowerCase()
      return item.roles.includes(userRole)
    });

    if (user?.role?.toLowerCase() === 'employee') {
      items = items.map(item => {
        if (item.to === '/attendance') {
          return { ...item, label: 'My Attendance' };
        }
        return item;
      });
      if (['Main Menu', 'Reports', 'Item Management'].includes(group.title)) {
        items = [];
      }
    }

    return { ...group, items };
  }).filter(group => group.items.length > 0)

  if (user?.must_change_password) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(18, 18, 18, 0.96)',
        backdropFilter: 'blur(10px)',
        zIndex: 999999,
        padding: 20
      }}>
        <div className="card" style={{ width: '100%', maxWidth: 400, padding: 30, borderRadius: 12, border: '1px solid var(--surface-2)', background: 'var(--surface)' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)', marginBottom: 10, textAlign: 'center' }}>
            Change Password Required
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20, textAlign: 'center' }}>
            This is your first login. For security reasons, you must update your password to continue.
          </p>
          <form onSubmit={handlePasswordChangeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'block', color: 'var(--text-muted)' }}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1.5px solid var(--surface-2)',
                  background: 'var(--surface-1)',
                  color: 'var(--text)',
                  outline: 'none',
                  fontSize: 14
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'block', color: 'var(--text-muted)' }}>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1.5px solid var(--surface-2)',
                  background: 'var(--surface-1)',
                  color: 'var(--text)',
                  outline: 'none',
                  fontSize: 14
                }}
              />
            </div>
            {passError && (
              <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
                {passError}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={passSubmitting}
              style={{ padding: '12px', fontSize: 14, fontWeight: 700, marginTop: 8 }}
            >
              {passSubmitting ? 'Updating...' : 'Update Password'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleLogout}
              style={{ padding: '10px', fontSize: 13, marginTop: 4 }}
            >
              Logout
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-icon" style={{ padding: 0, overflow: 'hidden', background: 'transparent', boxShadow: 'none' }}>
            <img src={BRAND_LOGO} alt={BRAND_NAME} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 10 }} />
          </div>
          <div className="logo-text">
            <h2>{BRAND_NAME}</h2>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.5px' }}>{BRAND_TAGLINE}</span>
          </div>
          <button 
            className={`sidebar-close-btn ${isSidebarOpen ? 'active' : ''}`}
            onClick={() => setIsSidebarOpen(false)}
            title="Close Sidebar"
          >
            <span className="close-line line-1"></span>
            <span className="close-line line-2"></span>
          </button>
        </div>
        <nav className="sidebar-nav">
          {filteredNavGroups.map(group => (
            <div key={group.title} style={{ marginBottom: 16 }}>
              <div className="sidebar-label">{group.title}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="sidebar-label" style={{ marginTop: 16 }}>System</div>
          <NavLink 
            to="/settings" 
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            onClick={() => setIsSidebarOpen(false)}
          >
            <span className="nav-icon"><Settings size={18} strokeWidth={2.2} /></span>Settings
          </NavLink>
          <NavLink 
            to="/help-support" 
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            onClick={() => setIsSidebarOpen(false)}
          >
            <span className="nav-icon"><HelpCircle size={18} strokeWidth={2.2} /></span>Help & Support
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          {/* User info block */}
          <div style={{ padding: '12px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #F4B400, #D4A000)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#000', fontWeight: 700, fontSize: 15, flexShrink: 0
              }}>
                {user?.username?.[0]?.toUpperCase() || 'A'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
                  {user?.username || 'Admin'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email || ''}
                </div>
              </div>
            </div>
          </div>
          {/* Logout button */}
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'rgba(255,69,58,0.1)',
              border: '1px solid rgba(255,69,58,0.25)',
              borderRadius: 8,
              color: '#ff6b6b',
              fontSize: 14, fontWeight: 600,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.2s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,69,58,0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,69,58,0.1)'}
          >
            <LogOut size={16} strokeWidth={2.5} /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content" onClick={() => {
        isProfileOpen && setIsProfileOpen(false)
        isNotifOpen && setIsNotifOpen(false)
      }}>
        {/* Topbar */}
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button 
              className="hamburger-btn"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <div className="page-title">{pageTitle}</div>
              <div className="page-subtitle">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>
          {/* <div className="topbar-search">
            <Search className="search-icon" size={16} strokeWidth={2.5} />
            <input type="text" placeholder="Search anything..." />
          </div> */}
          <div className="topbar-right">
            {user && (
              <div className="notif-wrapper" style={{ position: 'relative' }}>
                <button
                  className={`icon-btn ${isNotifOpen ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsProfileOpen(false);
                    setIsNotifOpen(!isNotifOpen);
                  }}
                  title="Notifications"
                >
                  <Bell size={20} strokeWidth={2} />
                  {hasNewAlerts && alerts.length > 0 && <span className="notif-badge">{alerts.length}</span>}
                </button>
 
                {isNotifOpen && (
                  <div className="notif-dropdown" onClick={(e) => e.stopPropagation()}>
                    <div className="notif-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3>Notifications</h3>
                        <span className="badge" style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(227, 24, 55, 0.1)', color: 'var(--red)' }}>
                          {alerts.length}
                        </span>
                      </div>
                      {alerts.some(item => item.type !== 'attendance_warning') && (
                        <button className="notif-clear-all" onClick={handleClearAll}>
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="notif-list">
                      {alerts.length === 0 ? (
                        <div className="notif-empty">
                          <Package size={32} style={{ opacity: 0.2, marginBottom: 8 }} />
                          <p>No new notifications</p>
                        </div>
                      ) : (
                        alerts.map(item => (
                          <div 
                            key={item.id} 
                            className="notif-item"
                            onClick={() => {
                              if (item.type === 'attendance_warning') {
                                navigate('/today-attendance');
                              } else if (item.type === 'attendance_request') {
                                navigate('/edited-logs');
                              } else {
                                navigate('/stock-management');
                              }
                              setIsNotifOpen(false);
                            }}
                          >
                            {item.type !== 'attendance_warning' && item.type !== 'attendance_request' && (
                              <button 
                                className="notif-item-clear"
                                onClick={(e) => handleClearItem(e, item.id)}
                                title="Clear this notification"
                              >
                                <X size={14} />
                              </button>
                            )}
                            <div 
                              className="notif-item-icon" 
                              style={{ 
                                backgroundColor: item.type === 'attendance_warning' ? 'rgba(255, 152, 0, 0.1)' : item.type === 'attendance_request' ? 'rgba(255, 193, 7, 0.1)' : undefined, 
                                color: item.type === 'attendance_warning' ? '#ff9800' : item.type === 'attendance_request' ? '#ffc107' : undefined 
                              }}
                            >
                              {item.type === 'attendance_warning' ? <Clock size={18} /> : <AlertTriangle size={18} />}
                            </div>
                            <div className="notif-item-content">
                              <span 
                                className="notif-item-title" 
                                style={{ 
                                  color: item.type === 'attendance_warning' ? '#ff9800' : item.type === 'attendance_request' ? '#ffc107' : undefined 
                                }}
                              >
                                {item.type === 'attendance_warning' ? 'Long Session Warning' : item.type === 'attendance_request' ? 'Correction Request' : `Low Stock: ${item.name}`}
                              </span>
                              <span className="notif-item-desc">
                                {item.type === 'attendance_warning' || item.type === 'attendance_request' ? item.message : `Currently ${Number(item.quantity).toFixed(2)} ${item.unit}`}
                              </span>
                              <span className="notif-item-time">
                                {formatNotifTime(item.type === 'attendance_warning' ? item.check_in : item.type === 'attendance_request' ? item.created_at : item.low_stock_at)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* <button className="icon-btn" title="Full screen"><Maximize size={20} strokeWidth={2} /></button> */}
            <div className="profile-wrapper" style={{ position: 'relative' }}>
              <button
                className={`user-avatar-btn ${isProfileOpen ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsNotifOpen(false);
                  setIsProfileOpen(!isProfileOpen);
                }}
                title={user?.username || 'Admin'}
              >
                {user?.username?.[0]?.toUpperCase() || 'A'}
              </button>

              {isProfileOpen && (
                <div className="profile-dropdown" onClick={(e) => e.stopPropagation()}>
                  <div className="dropdown-header">
                    <div className="dropdown-avatar">
                      {user?.username?.[0]?.toUpperCase() || 'A'}
                    </div>
                    <div className="dropdown-user-info">
                      <span className="dropdown-username">{user?.username || 'Admin'}</span>
                      <span className="dropdown-email">{user?.email || BRAND_EMAIL}</span>
                    </div>
                  </div>
                  <div className="dropdown-divider"></div>
                  <div className="dropdown-menu">
                    <button className="dropdown-item" onClick={() => { navigate('/settings'); setIsProfileOpen(false); }}>
                      <Settings size={16} />
                      <span>My Account</span>
                    </button>
                    <button className="dropdown-item" onClick={() => { navigate('/help-support'); setIsProfileOpen(false); }}>
                      <HelpCircle size={16} />
                      <span>Help & Support</span>
                    </button>
                  </div>
                  <div className="dropdown-divider"></div>
                  <div className="dropdown-footer">
                    <button className="dropdown-logout-btn" onClick={handleLogout}>
                      <LogOut size={16} />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page */}
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
