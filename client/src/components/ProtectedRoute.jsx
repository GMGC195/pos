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
    // If not allowed, seamlessly redirect to appropriate role home page (no Access Denied UI)
    if (userRole === 'salary pay operator') return <Navigate to="/" replace />
    if (userRole === 'order taker' || userRole === 'operator' || userRole === 'cashier') return <Navigate to="/pos" replace />
    if (userRole === 'employee') return <Navigate to="/employee-portal" replace />
    if (userRole === 'hr manager') return <Navigate to="/employees" replace />
    
    return <Navigate to="/" replace />
  }

  return children
}
