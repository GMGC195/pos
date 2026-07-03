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
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // Inconsistent case handling: allow 'admin' or 'Admin' etc. 
    const userRole = user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1).toLowerCase();
    if (!allowedRoles.includes(userRole)) {
      return <Navigate to="/" replace />
    }
  }

  return children
}
