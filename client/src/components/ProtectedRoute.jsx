import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Developer role has absolute access
  if (user?.role?.toLowerCase() === 'developer') {
    return children
  }

  // If allowedRoles is provided, check if user's role is in the list
  const userRole = user?.role?.trim().toLowerCase() || ''
  
  if (allowedRoles && !allowedRoles.some(r => r.toLowerCase() === userRole)) {
    // If not allowed, redirect to a safe page depending on role
    if (userRole === 'order taker') return <Navigate to="/pos" replace />
    if (userRole === 'operator') return <Navigate to="/pos" replace />
    if (userRole === 'employee') return <Navigate to="/attendance" replace />
    if (userRole === 'hr manager') return <Navigate to="/employees" replace />
    if (userRole === 'cashier') return <Navigate to="/pos" replace />
    
    // To prevent infinite loops if the user is already on '/', just show Access Denied
    if (window.location.pathname === '/') {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p>You do not have permission to view this page.</p>
        </div>
      )
    }
    return <Navigate to="/" replace />
  }

  return children
}
