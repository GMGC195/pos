import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { POSProvider } from './contexts/POSContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import './index.css'

// ── Page chunks — each lazy import becomes its own JS bundle ──────────────────
const Login                = lazy(() => import('./pages/Login'))
const Dashboard            = lazy(() => import('./pages/Dashboard'))
const POS                  = lazy(() => import('./pages/POS'))
const Inventory            = lazy(() => import('./pages/Inventory'))
const Reports              = lazy(() => import('./pages/Reports'))
const HoldPayments         = lazy(() => import('./pages/HoldPayments'))
const Settings             = lazy(() => import('./pages/Settings'))
const SalesItem            = lazy(() => import('./pages/SalesItem'))
const CancelRequests       = lazy(() => import('./pages/CancelRequests'))
const StockManagement      = lazy(() => import('./pages/StockManagement'))
const ProductCostManagement = lazy(() => import('./pages/ProductCostManagement'))
const HelpSupport          = lazy(() => import('./pages/HelpSupport'))
const Employees            = lazy(() => import('./pages/Employees'))
const AttendanceTracker    = lazy(() => import('./pages/AttendanceTracker'))
const AttendanceReports    = lazy(() => import('./pages/AttendanceReports'))
const TodayAttendance      = lazy(() => import('./pages/TodayAttendance'))

// Minimal full-screen spinner shown while a page chunk is loading
function PageLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--surface)',
      zIndex: 9999
    }}>
      <div style={{
        width: 36, height: 36,
        border: '3px solid var(--surface-2)',
        borderTopColor: 'var(--primary)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <POSProvider>
        <Toaster
          position="top-right"
          toastOptions={{ style: { fontSize: '14px', borderRadius: '8px' } }}
          containerStyle={{ zIndex: 999999 }}
        />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
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

                {/* Developer-only routes */}
                <Route path="/pos"             element={<ProtectedRoute allowedRoles={['Developer']}><POS /></ProtectedRoute>} />
                <Route path="/inventory"       element={<ProtectedRoute allowedRoles={['Developer']}><Inventory /></ProtectedRoute>} />
                <Route path="/hold-payments"   element={<ProtectedRoute allowedRoles={['Developer']}><HoldPayments /></ProtectedRoute>} />
                <Route path="/today-sales"     element={<ProtectedRoute allowedRoles={['Developer']}><Reports isTodaySales={true} /></ProtectedRoute>} />
                <Route path="/sales-item"      element={<ProtectedRoute allowedRoles={['Developer']}><SalesItem /></ProtectedRoute>} />
                <Route path="/reports"         element={<ProtectedRoute allowedRoles={['Developer']}><Reports isTodaySales={false} /></ProtectedRoute>} />
                <Route path="/cancel-requests" element={<ProtectedRoute allowedRoles={['Developer']}><CancelRequests /></ProtectedRoute>} />
                <Route path="/stock-management" element={<ProtectedRoute allowedRoles={['Developer']}><StockManagement /></ProtectedRoute>} />
                <Route path="/product-cost"    element={<ProtectedRoute allowedRoles={['Developer']}><ProductCostManagement /></ProtectedRoute>} />

                {/* Employee & Attendance routes */}
                <Route path="/employees"          element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><Employees /></ProtectedRoute>} />
                <Route path="/attendance"         element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><AttendanceTracker /></ProtectedRoute>} />
                <Route path="/today-attendance"   element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><TodayAttendance /></ProtectedRoute>} />
                <Route path="/attendance-reports" element={<ProtectedRoute allowedRoles={['Admin', 'Operator']}><AttendanceReports /></ProtectedRoute>} />

                {/* Universal */}
                <Route path="/settings"     element={<Settings />} />
                <Route path="/help-support" element={<HelpSupport />} />
                <Route path="*"             element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </POSProvider>
    </AuthProvider>
  )
}
