import axios from 'axios'
import { STORAGE_TOKEN_KEY, STORAGE_USER_KEY } from './branding'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})

// Add request interceptor — attach token and prevent caching on hosting/proxies
api.interceptors.request.use(config => {
  const token = localStorage.getItem(STORAGE_TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Prevent Hostinger / Nginx / LiteSpeed proxy from caching GET requests
  if ((config.method || 'get').toLowerCase() === 'get') {
    config.params = {
      ...config.params,
      _t: Date.now()
    }
    config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    config.headers['Pragma'] = 'no-cache'
    config.headers['Expires'] = '0'
  }

  return config
}, error => {
  return Promise.reject(error)
})

// Add response interceptor — handle expired/invalid tokens
api.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status
    const errMsg = error?.response?.data?.error
    // 401 = no/missing token, 403 = invalid/expired token
    if (status === 401 || (status === 403 && errMsg === 'Invalid token')) {
      const hasToken = localStorage.getItem(STORAGE_TOKEN_KEY)
      // Only force logout if we actually had a token that was rejected
      if (hasToken) {
        localStorage.removeItem(STORAGE_TOKEN_KEY)
        localStorage.removeItem(STORAGE_USER_KEY)
        localStorage.removeItem('login_timestamp')
        // Redirect to login without causing a full reload loop
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
