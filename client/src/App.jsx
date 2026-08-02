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
import TodayAttendance from './pages/TodayAttendance'
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
            <Route path="/pos" element={<ProtectedRoute allowedRoles={['Developer']}><POS /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute allowedRoles={['Developer']}><Inventory /></ProtectedRoute>} />
            
            {/* Routes allowed for Developer only */}
            <Route path="/hold-payments" element={<ProtectedRoute allowedRoles={['Developer']}><HoldPayments /></ProtectedRoute>} />
            <Route path="/today-sales" element={<ProtectedRoute allowedRoles={['Developer']}><Reports isTodaySales={true} /></ProtectedRoute>} />
            <Route path="/sales-item" element={<ProtectedRoute allowedRoles={['Developer']}><SalesItem /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allowedRoles={['Developer']}><Reports isTodaySales={false} /></ProtectedRoute>} />
            <Route path="/cancel-requests" element={<ProtectedRoute allowedRoles={['Developer']}><CancelRequests /></ProtectedRoute>} />
            <Route path="/stock-management" element={<ProtectedRoute allowedRoles={['Developer']}><StockManagement /></ProtectedRoute>} />
            <Route path="/product-cost" element={<ProtectedRoute allowedRoles={['Developer']}><ProductCostManagement /></ProtectedRoute>} />
            
            {/* Employee & Attendance Routes */}
            <Route path="/employees" element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><Employees /></ProtectedRoute>} />
            <Route path="/attendance" element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><AttendanceTracker /></ProtectedRoute>} />
            <Route path="/today-attendance" element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><TodayAttendance /></ProtectedRoute>} />
            <Route path="/attendance-reports" element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><AttendanceReports /></ProtectedRoute>} />
            
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
