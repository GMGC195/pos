import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import axios from '../api'
import { STORAGE_TOKEN_KEY } from '../branding'
import { 
  getCategories as getCachedCategories, 
  saveCategories as saveCachedCategories,
  getMenuItems as getCachedMenuItems,
  saveMenuItems as saveCachedMenuItems
} from '../utils/db'

import { useAuth } from './AuthContext'

const POSContext = createContext()

export function POSProvider({ children }) {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [cart, setCart] = useState([])
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', address: '', discount: '', orderType: 'Dine-In', tableNumber: '' })
  const [loading, setLoading] = useState(false)
  const [isDataLoaded, setIsDataLoaded] = useState(false)
  const [activeCategory, setActiveCategory] = useState('All')
  const [inventoryCategory, setInventoryCategory] = useState('All')
  const [search, setSearch] = useState('')
  const retryTimerRef = useRef(null)

  const loadData = useCallback(async (force = false) => {
    if (isDataLoaded && !force) return

    // Don't attempt API calls without an auth token — avoids 403 on login page
    const token = localStorage.getItem(STORAGE_TOKEN_KEY)
    if (!token) return
    
    // Clear any existing retry timer to prevent overlaps
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }

    setLoading(true)
    try {
      // Load categories
      const catRes = await axios.get('/api/categories')
      setCategories(catRes.data)
      saveCachedCategories(catRes.data).catch(console.error)

      // Load all items (for general search/caching)
      const itemsRes = await axios.get('/api/items')
      
      // Some times network returns empty array due to transient issues, if so we might retry, but let's stick to true network failure for now.
      setItems(itemsRes.data)
      saveCachedMenuItems(itemsRes.data).catch(console.error)

      setIsDataLoaded(true)
    } catch (err) {
      console.warn('Network failed in POSContext, loading from fallback', err)
      const cachedCats = await getCachedCategories()
      if (cachedCats?.length) setCategories(cachedCats)
      
      const cachedItems = await getCachedMenuItems()
      if (cachedItems?.length) setItems(cachedItems)
      
      // Automatically retry after 30 seconds on failure
      retryTimerRef.current = setTimeout(() => {
        console.log('Retrying fetching POS data...')
        loadData(true)
      }, 30000)
    } finally {
      setLoading(false)
    }
  }, [isDataLoaded])

  // Load data when user logs in or app initializes with a user
  useEffect(() => {
    if (user) {
      loadData()
    }
    
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
      }
    }
  }, [user, loadData])

  const updateCart = (newCart) => setCart(newCart)
  const clearCart = () => {
    setCart([])
    setCustomerInfo({ name: '', phone: '', address: '', discount: '', orderType: 'Dine-In', tableNumber: '' })
  }

  const value = {
    categories,
    setCategories,
    items,
    setItems,
    cart,
    setCart,
    customerInfo,
    setCustomerInfo,
    loading,
    loadData,
    isDataLoaded,
    activeCategory,
    setActiveCategory,
    inventoryCategory,
    setInventoryCategory,
    search,
    setSearch,
    clearCart,
    updateCart
  }

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>
}

export function usePOS() {
  const context = useContext(POSContext)
  if (!context) throw new Error('usePOS must be used within a POSProvider')
  return context
}
