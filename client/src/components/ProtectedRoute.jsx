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
  if (allowedRoles && !allowedRoles.some(r => r.toLowerCase() === user?.role?.toLowerCase())) {
    // If not allowed, redirect to a safe page depending on role
    if (user?.role?.toLowerCase() === 'order taker') return <Navigate to="/pos" replace />
    if (user?.role?.toLowerCase() === 'operator') return <Navigate to="/pos" replace />
    if (user?.role?.toLowerCase() === 'employee') return <Navigate to="/attendance" replace />
    if (user?.role?.toLowerCase() === 'hr manager') return <Navigate to="/employees" replace />
    return <Navigate to="/" replace />
  }

  return children
}
