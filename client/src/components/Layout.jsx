import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import axios from '../api'
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
      { to: '/employees', icon: <Users size={18} strokeWidth={2.2} />, label: 'Manage Employees', roles: ['Admin', 'Operator'] },
      { to: '/attendance', icon: <Fingerprint size={18} strokeWidth={2.2} />, label: 'Mark Attendance', roles: ['Admin', 'Operator'] },
      { to: '/today-attendance', icon: <Clock size={18} strokeWidth={2.2} />, label: 'Today Attendance', roles: ['Admin', 'Operator'] },
      { to: '/attendance-reports', icon: <CalendarRange size={18} strokeWidth={2.2} />, label: 'Attendance Sheet', roles: ['Admin', 'Operator'] },
    ]
  }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState([])
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [hasNewAlerts, setHasNewAlerts] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const location = useLocation()

  const fetchAlerts = async () => {
    try {
      const res = await axios.get('/api/stock/alerts')
      setAlerts(res.data)
      if (res.data.length > 0 && !isNotifOpen) {
        setHasNewAlerts(true)
      }
    } catch (err) {
      console.error('Error fetching alerts:', err)
    }
  }

  const handleClearAll = async (e) => {
    e.stopPropagation();
    try {
      await axios.post('/api/stock/alerts/clear');
      setAlerts([]);
      setHasNewAlerts(false);
    } catch (err) {
      console.error('Error clearing alerts:', err);
    }
  };

  const handleClearItem = async (e, id) => {
    e.stopPropagation();
    try {
      await axios.post(`/api/stock/alerts/${id}/clear`);
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
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000) // Refresh every 5 mins
    return () => clearInterval(interval)
  }, [])

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
    '/settings': 'System Settings',
    '/help-support': 'Help & Support Center'
  }[location.pathname] || `${BRAND_NAME} Pro`

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const filteredNavGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (user?.role?.toLowerCase() === 'developer') return true
      if (!item.roles) return true
      const userRole = user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1).toLowerCase()
      return item.roles.includes(userRole)
    })
  })).filter(group => group.items.length > 0)

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
            <span>{BRAND_TAGLINE}</span>
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
          <div className="nav-link" style={{ cursor: 'default', color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 8 }}>
            <span>{BRAND_VERSION} · {BRAND_NAME} Pro</span>
          </div>
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
                    {alerts.length > 0 && (
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
                            navigate('/stock-management');
                            setIsNotifOpen(false);
                          }}
                        >
                          <button 
                            className="notif-item-clear"
                            onClick={(e) => handleClearItem(e, item.id)}
                            title="Clear this notification"
                          >
                            <X size={14} />
                          </button>
                          <div className="notif-item-icon">
                            <AlertTriangle size={18} />
                          </div>
                          <div className="notif-item-content">
                            <span className="notif-item-title">Low Stock: {item.name}</span>
                            <span className="notif-item-desc">
                              Currently {Number(item.quantity).toFixed(2)} {item.unit}
                            </span>
                            <span className="notif-item-time">
                              {formatNotifTime(item.low_stock_at)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            
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
