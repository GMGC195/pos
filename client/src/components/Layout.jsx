import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import axios from '../api'
import toast from 'react-hot-toast'
import StartShiftModal from './StartShiftModal'
import { socket } from '../socket'
import { getSaudiLiveTimeString } from '../utils/timezone'
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
  CalendarRange,
  BookOpen
} from 'lucide-react'

const navGroups = [
  {
    title: 'Main Menu',
    items: [
      { to: '/', icon: <LayoutDashboard size={18} strokeWidth={2.2} />, label: 'Dashboard', roles: ['Developer', 'Admin', 'Management', 'Operator'] },
      { to: '/pos', icon: <Receipt size={18} strokeWidth={2.2} />, label: 'Order Taking', roles: ['Developer', 'Admin', 'Management', 'Order Taker', 'Cashier'] },
      { to: '/hold-payments', icon: <Clock size={18} strokeWidth={2.2} />, label: 'Live Orders', roles: ['Developer', 'Admin', 'Management', 'Order Taker', 'Cashier'] },
      { to: '/today-sales', icon: <CalendarDays size={18} strokeWidth={2.2} />, label: "Today Sale", roles: ['Developer', 'Admin', 'Management', 'Cashier'] },
      { to: '/credit', icon: <BookOpen size={18} strokeWidth={2.2} />, label: 'Credit (Khata)', roles: ['Developer', 'Admin', 'Management', 'Order Taker', 'Cashier'] },
      { to: '/cancel-requests', icon: <Ban size={18} strokeWidth={2.2} />, label: 'Cancel Request', roles: ['Developer', 'Admin', 'Management', 'Cashier'] },
    ]
  },
  {
    title: 'Reports',
    items: [
      { to: '/sales-item', icon: <ClipboardList size={18} strokeWidth={2.2} />, label: 'Sales Item & Revenue', roles: ['Developer', 'Admin', 'Management'] },
      { to: '/reports', icon: <TrendingUp size={18} strokeWidth={2.2} />, label: 'Reports', roles: ['Developer', 'Admin', 'Management'] },
    ]
  },
  {
    title: 'Item Management',
    items: [
      { to: '/inventory', icon: <PlusCircle size={18} strokeWidth={2.2} />, label: 'Add Item', roles: ['Developer', 'Admin', 'Order Taker', 'Cashier'] },
      { to: '/stock-management', icon: <Database size={18} strokeWidth={2.2} />, label: 'Stock Mangement', roles: ['Developer', 'Admin'] },
      { to: '/product-cost', icon: <Package size={18} strokeWidth={2.2} />, label: 'Inventory Management', roles: ['Developer', 'Admin'] },
    ]
  },
  {
    title: 'Employees & Attendance',
    items: [
      { to: '/employees', icon: <Users size={18} strokeWidth={2.2} />, label: 'Manage Employees', roles: ['Admin', 'Management', 'HR Manager'] },
      { to: '/attendance', icon: <Fingerprint size={18} strokeWidth={2.2} />, label: 'Mark Attendance', roles: ['Admin', 'Management', 'Employee', 'HR Manager', 'Operator'] },
      { to: '/today-attendance', icon: <Clock size={18} strokeWidth={2.2} />, label: 'Today Attendance', roles: ['Admin', 'Management', 'HR Manager', 'Operator'] },
      { to: '/attendance-reports', icon: <CalendarRange size={18} strokeWidth={2.2} />, label: 'Attendance Sheet', roles: ['Admin', 'Management', 'HR Manager'] },
      { to: '/payroll', icon: <Calculator size={18} strokeWidth={2.2} />, label: 'Payroll & Salary', roles: ['Admin', 'Management', 'HR Manager'] },
      { to: '/edited-logs', icon: <AlertTriangle size={18} strokeWidth={2.2} />, label: 'Edit Attendance Logs', roles: ['Admin', 'HR Manager', 'Operator'] },
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

  // Cashier Shift & Countdown States
  const [showStartShiftModal, setShowStartShiftModal] = useState(false);
  const [activeShift, setActiveShift] = useState(null);
  const [closingCountdown, setClosingCountdown] = useState(null);
  const [liveKsaTime, setLiveKsaTime] = useState(getSaudiLiveTimeString());

  // Password change states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [passSubmitting, setPassSubmitting] = useState(false);

  // Live Saudi time ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveKsaTime(getSaudiLiveTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Shift & Daily Closing countdown timer
  useEffect(() => {
    const checkDeadline = () => {
      const stored = localStorage.getItem('cashier_closing_deadline');
      if (!stored) {
        setClosingCountdown(null);
        return;
      }
      const deadline = parseInt(stored, 10);
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
      if (remaining > 0) {
        setClosingCountdown(remaining);
      } else {
        localStorage.removeItem('cashier_closing_deadline');
        setClosingCountdown(null);
        const isCashier = user?.role?.trim().toLowerCase() === 'cashier';
        if (isCashier) {
          toast('Shift closed. Automatically logged out.', { icon: '⏱️' });
          handleLogout();
        } else {
          toast.success('Closing completed.');
        }
      }
    };

    checkDeadline();
    const interval = setInterval(checkDeadline, 1000);
    const handleShiftClosed = () => checkDeadline();
    window.addEventListener('cashier_shift_closed', handleShiftClosed);

    return () => {
      clearInterval(interval);
      window.removeEventListener('cashier_shift_closed', handleShiftClosed);
    };
  }, [user]);

  // Check active cashier shift on mount / login
  const checkActiveShift = useCallback(async () => {
    const isCashier = user?.role?.trim().toLowerCase() === 'cashier';
    if (!isCashier) return;
    const deadline = localStorage.getItem('cashier_closing_deadline');
    if (deadline && parseInt(deadline, 10) > Date.now()) {
      setShowStartShiftModal(false);
      return;
    }
    // If offline and already have an active shift or checked, don't repeat
    if (typeof navigator !== 'undefined' && !navigator.onLine && activeShift) {
      return;
    }
    try {
      const res = await axios.get('/api/orders/cashier-shift/active');
      if (res.data?.hasActiveShift) {
        setActiveShift(res.data.shift);
        setShowStartShiftModal(false);
      } else {
        setActiveShift(null);
        setShowStartShiftModal(true);
      }
    } catch (err) {
      console.error('Failed to check active cashier shift:', err);
      // When offline or network error, do not overwrite existing active shift
    }
  }, [user, activeShift]);

  useEffect(() => {
    checkActiveShift();
    const handleShiftStarted = () => checkActiveShift();
    window.addEventListener('cashier_shift_started', handleShiftStarted);
    return () => {
      window.removeEventListener('cashier_shift_started', handleShiftStarted);
    };
  }, [checkActiveShift]);

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
    const role = user?.role?.trim().toLowerCase();
    if (role === 'employee' && location.pathname === '/') {
      navigate('/attendance', { replace: true });
    } else if ((role === 'order taker' || role === 'cashier') && location.pathname === '/') {
      navigate('/pos', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  const fetchAlerts = async () => {
    const role = user?.role?.toLowerCase();
    if (role === 'staff') return;
    try {
      const clearedIds = JSON.parse(localStorage.getItem('pizza_shop_cleared_alerts') || '[]');
      const readIds = JSON.parse(localStorage.getItem('pizza_shop_read_alerts') || '[]');

      let combinedAlerts = [];

      if (['admin', 'developer'].includes(role)) {
        const stockRes = await axios.get('/api/stock/alerts');
        const stockAlerts = stockRes.data.map(item => ({
          id: `stock-${item.id}`,
          type: 'stock',
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          low_stock_at: item.low_stock_at
        }));
        combinedAlerts = [...stockAlerts];
      }

      try {
        const attRes = await axios.get('/api/attendance/notifications');
        const attAlerts = attRes.data.map(item => ({
          id: item.id,
          type: item.type,
          message: item.message,
          check_in: item.check_in,
          created_at: item.created_at,
          employee_name: item.employee_name,
          request_type: item.request_type
        }));
        combinedAlerts = [...combinedAlerts, ...attAlerts];
      } catch (err) {
        console.error('Error fetching attendance warnings:', err);
      }

      // Filter out cleared alerts
      combinedAlerts = combinedAlerts.filter(item => !clearedIds.includes(item.id));
      
      // Mark read alerts
      combinedAlerts = combinedAlerts.map(item => ({
        ...item,
        read: readIds.includes(item.id)
      }));

      // Forcefully strip out any stock alerts if the user is an employee
      if (role === 'employee') {
        combinedAlerts = combinedAlerts.filter(item => item.type !== 'stock');
      }

      setAlerts(combinedAlerts);
      
      const unreadCount = combinedAlerts.filter(item => !item.read).length;
      if (unreadCount > 0 && !isNotifOpen) {
        setHasNewAlerts(true);
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  };

  const handleClearAll = async (e) => {
    e.stopPropagation();
    try {
      await axios.post('/api/stock/alerts/clear').catch(() => {});
      
      const currentIds = alerts.map(a => a.id);
      const existingCleared = JSON.parse(localStorage.getItem('pizza_shop_cleared_alerts') || '[]');
      localStorage.setItem('pizza_shop_cleared_alerts', JSON.stringify([...new Set([...existingCleared, ...currentIds])]));
      
      setAlerts([]);
      setHasNewAlerts(false);
    } catch (err) {
      console.error('Error clearing alerts:', err);
    }
  };

  const handleReadAll = (e) => {
    e.stopPropagation();
    const currentIds = alerts.map(a => a.id);
    const existingRead = JSON.parse(localStorage.getItem('pizza_shop_read_alerts') || '[]');
    localStorage.setItem('pizza_shop_read_alerts', JSON.stringify([...new Set([...existingRead, ...currentIds])]));
    
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
    setHasNewAlerts(false);
  };

  const handleClearItem = async (e, id) => {
    e.stopPropagation();
    try {
      if (typeof id === 'string' && id.startsWith('stock-')) {
        const stockId = id.replace('stock-', '');
        await axios.post(`/api/stock/alerts/${stockId}/clear`).catch(() => {});
      }
      
      const existingCleared = JSON.parse(localStorage.getItem('pizza_shop_cleared_alerts') || '[]');
      localStorage.setItem('pizza_shop_cleared_alerts', JSON.stringify([...new Set([...existingCleared, id])]));
      
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
      const interval = setInterval(fetchAlerts, 20 * 1000); // Check every 20s as fallback

      const handleRefresh = () => {
        fetchAlerts();
      };

      if (socket) {
        socket.on('attendance_alert', handleRefresh);
        socket.on('attendance_request', handleRefresh);
      }
      window.addEventListener('refresh-notifications', handleRefresh);

      return () => {
        clearInterval(interval);
        if (socket) {
          socket.off('attendance_alert', handleRefresh);
          socket.off('attendance_request', handleRefresh);
        }
        window.removeEventListener('refresh-notifications', handleRefresh);
      };
    }
  }, [user]);

  useEffect(() => {
    if (isNotifOpen) {
      setHasNewAlerts(false)
    }
  }, [isNotifOpen])

  let currentTitle = {
    '/': 'Dashboard Overview',
    '/pos': 'Order Taking',
    '/inventory': 'Add Item',
    '/hold-payments': 'Live Orders',
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

  if (location.pathname === '/pos' && ['cashier', 'order taker'].includes(user?.role?.trim().toLowerCase()) && user?.branch) {
    const shortBranch = user.branch.replace(/Branch\s*/i, 'B')
    currentTitle = (
      <span>
        Order Taking - <span className="branch-full">{user.branch}</span><span className="branch-short">{shortBranch}</span>
      </span>
    )
  } else if (location.pathname === '/today-sales' && user?.role?.trim().toLowerCase() === 'cashier') {
    currentTitle = 'Your Shift Sales'
  }

  const handleLogout = () => {
    localStorage.removeItem('cashier_closing_deadline');
    logout()
    navigate('/login', { replace: true })
  }

  const filteredNavGroups = navGroups.map(group => {
    let items = group.items.filter(item => {
      if (user?.role?.trim().toLowerCase() === 'developer') return true
      if (!item.roles) return true
      return item.roles.some(r => r.toLowerCase() === user?.role?.trim().toLowerCase())
    });

    if (user?.role?.trim().toLowerCase() === 'cashier') {
      items = items.map(item => {
        if (item.to === '/today-sales') {
          return { ...item, label: 'Your Shift Sale' };
        }
        return item;
      });
    }

    if (user?.role?.trim().toLowerCase() === 'employee') {
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
      <style>
        {`
          @media (max-width: 900px) {
            .branch-full { display: none !important; }
            .branch-short { display: inline !important; }
          }
          @media (min-width: 901px) {
            .branch-full { display: inline !important; }
            .branch-short { display: none !important; }
          }
          @media (max-width: 768px) {
            .topbar {
              padding: 0 12px !important;
              gap: 8px !important;
              height: 60px !important;
            }
            .hamburger-btn {
              width: 36px !important;
              height: 36px !important;
              flex-shrink: 0 !important;
            }
            .topbar-title-wrap {
              min-width: 0 !important;
              flex: 1 1 auto !important;
              overflow: hidden !important;
            }
            .page-title {
              font-size: 14px !important;
              font-weight: 700 !important;
              line-height: 1.2 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
            }
            .page-subtitle {
              margin-top: 1px !important;
              line-height: 1.1 !important;
            }
            .topbar-date-desktop {
              display: none !important;
            }
            .topbar-date-mobile {
              display: flex !important;
              align-items: center !important;
              gap: 4px !important;
              font-size: 10px !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              color: var(--text-muted) !important;
            }
            .topbar-right {
              gap: 6px !important;
              flex-shrink: 0 !important;
            }
            .topbar-right .icon-btn {
              width: 36px !important;
              height: 36px !important;
            }
            .user-avatar {
              width: 36px !important;
              height: 36px !important;
              font-size: 13px !important;
            }
          }
          @media (min-width: 769px) {
            .topbar-date-desktop {
              display: flex !important;
            }
            .topbar-date-mobile {
              display: none !important;
            }
          }
          @media (max-width: 380px) {
            .topbar-date-mobile {
              font-size: 9px !important;
            }
            .page-title {
              font-size: 13px !important;
            }
          }
        `}
      </style>
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
            <img src={BRAND_LOGO} alt={BRAND_NAME} style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 10 }} />
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
                  <span className="nav-label">{item.label}</span>
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
            <span className="nav-icon"><Settings size={18} strokeWidth={2.2} /></span>
            <span className="nav-label">Settings</span>
          </NavLink>
          <NavLink 
            to="/help-support" 
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            onClick={() => setIsSidebarOpen(false)}
          >
            <span className="nav-icon"><HelpCircle size={18} strokeWidth={2.2} /></span>
            <span className="nav-label">Help & Support</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          {/* User info block */}
          <div className="user-profile-block">
            <div className="user-avatar-container">
              <div className="user-avatar">
                {user?.username?.[0]?.toUpperCase() || 'A'}
              </div>
              {/* Role visible when collapsed */}
              <div className="user-role-collapsed">
                {user?.role || 'Admin'}
              </div>
            </div>
            
            <div className="user-details">
              <div className="user-name">
                {user?.username || 'Admin'}
              </div>
              <div className="user-email">
                {user?.email || ''}
              </div>
              {user?.role && (
                <div className="user-role-expanded">
                  {user.role.trim()}
                  {['cashier', 'order taker'].includes(user.role.trim().toLowerCase()) && user.branch ? ` • ${user.branch}` : ''}
                  {user.role.trim().toLowerCase() === 'operator' ? ` • ${BRAND_NAME}` : ''}
                </div>
              )}
            </div>
          </div>
          {/* Logout button */}
          <button className="logout-btn" onClick={handleLogout}>
            <div className="logout-icon-container">
              <LogOut size={16} strokeWidth={2.5} />
            </div>
            <span className="logout-text">Logout</span>
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
          <div className="topbar-title-wrap" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <button 
              className="hamburger-btn"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open Navigation"
            >
              <Menu size={20} />
            </button>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div className="page-title">{currentTitle}</div>
              <div className="page-subtitle">
                <div className="topbar-date-desktop" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <span>{new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>KSA {liveKsaTime}</span>
                </div>
                <div className="topbar-date-mobile" style={{ display: 'none', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <span>{new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh', month: 'short', day: 'numeric' })}</span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{liveKsaTime}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Topbar Middle: Auto-Logout Countdown Timer (Pill / Modal Toast style in mid of top bar) */}
          {closingCountdown !== null && closingCountdown > 0 && (
            <div style={{
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
              border: '1.5px solid #ef4444',
              borderRadius: 30,
              padding: '6px 16px',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.22)'
            }}>
              <div style={{
                background: '#dc2626',
                color: '#fff',
                width: 24,
                height: 24,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(220, 38, 38, 0.35)'
              }}>
                <Clock size={14} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', whiteSpace: 'nowrap' }}>
                  Shift Closed • Auto-Logout:
                </span>
                <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  fontSize: 15,
                  background: '#dc2626',
                  color: '#fff',
                  padding: '3px 10px',
                  borderRadius: 6,
                  letterSpacing: '0.5px',
                  animation: 'closingTimerBlink 0.9s ease-in-out infinite'
                }}>
                  00:{String(closingCountdown).padStart(2, '0')}
                </span>
              </div>
              <style>{`
                @keyframes closingTimerBlink {
                  0%, 100% {
                    opacity: 1;
                    transform: scale(1);
                    box-shadow: 0 0 0 rgba(220, 38, 38, 0);
                  }
                  50% {
                    opacity: 0.2;
                    transform: scale(1.08);
                    box-shadow: 0 0 12px 3px rgba(220, 38, 38, 0.7);
                  }
                }
              `}</style>
              <button
                onClick={handleLogout}
                style={{
                  background: '#991b1b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  whiteSpace: 'nowrap',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#7f1d1d'}
                onMouseOut={(e) => e.currentTarget.style.background = '#991b1b'}
              >
                <LogOut size={12} /> Logout Now
              </button>
            </div>
          )}

          <div className="topbar-right">
            {user && (
              <div className="notif-wrapper" style={{ position: 'relative' }}>
                <button
                  className={`icon-btn ${alerts.filter(a => !a.read).length > 0 ? 'has-alerts' : ''} ${isNotifOpen ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsProfileOpen(false);
                    setIsNotifOpen(!isNotifOpen);
                  }}
                  title="Notifications"
                >
                  <Bell size={20} strokeWidth={2} />
                  {alerts.filter(a => !a.read).length > 0 && <span className="notif-badge">{alerts.filter(a => !a.read).length}</span>}
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
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button className="notif-clear-all" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }} onClick={handleReadAll}>
                            Read All
                          </button>
                          <button className="notif-clear-all" onClick={handleClearAll}>
                            Clear All
                          </button>
                        </div>
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
                                if (item.request_type === 'Early Check-In') {
                                  navigate('/edited-logs?tab=early_checkin', { state: { tab: 'early_checkin' } });
                                } else if (item.request_type === 'Overtime') {
                                  navigate('/edited-logs?tab=overtime', { state: { tab: 'overtime' } });
                                } else {
                                  navigate('/edited-logs?tab=requests', { state: { tab: 'requests' } });
                                }
                              } else {
                                navigate('/stock-management');
                              }
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
                            <div 
                              className="notif-item-icon" 
                              style={{ 
                                backgroundColor: item.type === 'attendance_warning' 
                                  ? 'rgba(255, 152, 0, 0.1)' 
                                  : item.request_type === 'Early Check-In'
                                    ? 'rgba(59, 130, 246, 0.12)'
                                    : item.type === 'attendance_request' 
                                      ? 'rgba(255, 193, 7, 0.1)' 
                                      : item.type === 'expiry_alert' 
                                        ? 'rgba(227, 24, 55, 0.1)' 
                                        : undefined, 
                                color: item.type === 'attendance_warning' 
                                  ? '#ff9800' 
                                  : item.request_type === 'Early Check-In'
                                    ? '#2563eb'
                                    : item.type === 'attendance_request' 
                                      ? '#ffc107' 
                                      : item.type === 'expiry_alert' 
                                        ? '#e31837' 
                                        : undefined 
                              }}
                            >
                              {item.type === 'attendance_warning' || item.request_type === 'Early Check-In' ? <Clock size={18} /> : item.type === 'expiry_alert' ? <AlertTriangle size={18} /> : <AlertTriangle size={18} />}
                            </div>
                            <div className="notif-item-content">
                              <span 
                                className="notif-item-title" 
                                style={{ 
                                  color: item.type === 'attendance_warning' 
                                    ? '#ff9800' 
                                    : item.request_type === 'Early Check-In'
                                      ? '#2563eb'
                                      : item.type === 'attendance_request' 
                                        ? '#ffc107' 
                                        : item.type === 'expiry_alert' 
                                          ? '#e31837' 
                                          : undefined 
                                }}
                              >
                                {item.type === 'attendance_warning' 
                                  ? 'Long Session Warning' 
                                  : item.type === 'attendance_request' 
                                    ? (item.request_type === 'Early Check-In' ? 'Early Check-In Alert' : item.request_type === 'Overtime' ? 'Overtime Request' : 'Correction Request') 
                                    : item.type === 'expiry_alert' 
                                      ? 'Document Expiry Alert' 
                                      : `Low Stock: ${item.name}`}
                              </span>
                              <span className="notif-item-desc">
                                {item.type === 'attendance_warning' || item.type === 'attendance_request' || item.type === 'expiry_alert' ? item.message : `Currently ${Number(item.quantity).toFixed(2)} ${item.unit}`}
                              </span>
                              <span className="notif-item-time">
                                {formatNotifTime(item.type === 'attendance_warning' ? item.check_in : item.type === 'attendance_request' ? item.created_at : item.type === 'expiry_alert' ? item.created_at : item.low_stock_at)}
                              </span>
                              {!item.read && (
                                <div style={{ width: 6, height: 6, background: 'var(--primary)', borderRadius: '50%', position: 'absolute', top: 14, left: -4 }}></div>
                              )}
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
                      {user?.role && (
                        <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {user.role}
                        </span>
                      )}
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

      {/* Cashier Start Shift Modal */}
      <StartShiftModal
        isOpen={showStartShiftModal}
        user={user}
        onShiftStarted={(shift) => {
          setActiveShift(shift);
          setShowStartShiftModal(false);
          window.dispatchEvent(new CustomEvent('cashier_shift_started', { detail: shift }));
        }}
      />
    </div>
  )
}

