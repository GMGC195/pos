import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import POS from './pages/POS'
import Inventory from './pages/Inventory'
import Reports from './pages/Reports'
import HoldPayments from './pages/HoldPayments'
import Settings from './pages/Settings'
import SalesItem from './pages/SalesItem'
import CancelRequests from './pages/CancelRequests'
import StockManagement from './pages/StockManagement'
import ProductCostManagement from './pages/ProductCostManagement'
import HelpSupport from './pages/HelpSupport'
import Employees from './pages/Employees'
import AttendanceTracker from './pages/AttendanceTracker'
import AttendanceReports from './pages/AttendanceReports'
import { POSProvider } from './contexts/POSContext'
import './index.css'

export default function App() {
  return (
    <AuthProvider>
      <POSProvider>
        <Toaster position="top-right" toastOptions={{ style: { fontSize: '14px', borderRadius: '8px' } }} containerStyle={{ zIndex: 999999 }} />
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/inventory" element={<Inventory />} />
            
            {/* Routes allowed for both Admin and Operator */}
            <Route path="/hold-payments" element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><HoldPayments /></ProtectedRoute>} />
            <Route path="/today-sales" element={<ProtectedRoute allowedRoles={['Admin']}><Reports isTodaySales={true} /></ProtectedRoute>} />
            <Route path="/sales-item" element={<ProtectedRoute allowedRoles={['Admin']}><SalesItem /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allowedRoles={['Admin']}><Reports isTodaySales={false} /></ProtectedRoute>} />
            <Route path="/cancel-requests" element={<ProtectedRoute allowedRoles={['Admin']}><CancelRequests /></ProtectedRoute>} />
            <Route path="/stock-management" element={<ProtectedRoute allowedRoles={['Admin']}><StockManagement /></ProtectedRoute>} />
            <Route path="/product-cost" element={<ProtectedRoute allowedRoles={['Admin']}><ProductCostManagement /></ProtectedRoute>} />
            
            {/* Employee & Attendance Routes */}
            <Route path="/employees" element={<ProtectedRoute allowedRoles={['Admin']}><Employees /></ProtectedRoute>} />
            <Route path="/attendance" element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><AttendanceTracker /></ProtectedRoute>} />
            <Route path="/attendance-reports" element={<ProtectedRoute allowedRoles={['Admin']}><AttendanceReports /></ProtectedRoute>} />
            
            {/* Everyone with a role can access settings and help */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/help-support" element={<HelpSupport />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </POSProvider>
    </AuthProvider>
  )
}
