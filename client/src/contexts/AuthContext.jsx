import { createContext, useContext, useState, useCallback } from 'react'
import { STORAGE_TOKEN_KEY, STORAGE_USER_KEY } from '../branding'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_USER_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const login = useCallback((userData, token) => {
    localStorage.setItem(STORAGE_TOKEN_KEY, token)
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userData))
    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN_KEY)
    localStorage.removeItem(STORAGE_USER_KEY)
    setUser(null)
  }, [])

  const updateUser = useCallback((userData) => {
    const newUser = { ...user, ...userData }
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser))
    setUser(newUser)
  }, [user])

  const getToken = useCallback(() => localStorage.getItem(STORAGE_TOKEN_KEY), [])

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
