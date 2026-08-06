import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { STORAGE_TOKEN_KEY, STORAGE_USER_KEY } from '../branding'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN_KEY)
    localStorage.removeItem(STORAGE_USER_KEY)
    localStorage.removeItem('login_timestamp')
    setUser(null)
  }, [])

  const [user, setUser] = useState(() => {
    try {
      const loginTime = localStorage.getItem('login_timestamp')
      if (loginTime) {
        const hoursPassed = (Date.now() - parseInt(loginTime, 10)) / (1000 * 60 * 60)
        if (hoursPassed >= 23) {
          localStorage.removeItem(STORAGE_TOKEN_KEY)
          localStorage.removeItem(STORAGE_USER_KEY)
          localStorage.removeItem('login_timestamp')
          return null
        }
      }
      const stored = localStorage.getItem(STORAGE_USER_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const login = useCallback((userData, token) => {
    localStorage.setItem(STORAGE_TOKEN_KEY, token)
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userData))
    localStorage.setItem('login_timestamp', Date.now().toString())
    setUser(userData)
  }, [])

  const updateUser = useCallback((userData) => {
    const newUser = { ...user, ...userData }
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser))
    setUser(newUser)
  }, [user])

  const getToken = useCallback(() => localStorage.getItem(STORAGE_TOKEN_KEY), [])

  // Auto-logout after 23 hours check
  useEffect(() => {
    const checkExpiry = () => {
      const loginTime = localStorage.getItem('login_timestamp')
      if (loginTime) {
        const hoursPassed = (Date.now() - parseInt(loginTime, 10)) / (1000 * 60 * 60)
        if (hoursPassed >= 23) {
          logout()
        }
      }
    }
    checkExpiry()
    const interval = setInterval(checkExpiry, 60000) // check every minute
    return () => clearInterval(interval)
  }, [logout])

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, getToken, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
