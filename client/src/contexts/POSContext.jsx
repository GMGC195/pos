import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from '../api'
import { 
  getCategories as getCachedCategories, 
  saveCategories as saveCachedCategories,
  getMenuItems as getCachedMenuItems,
  saveMenuItems as saveCachedMenuItems
} from '../utils/db'

const POSContext = createContext()

export function POSProvider({ children }) {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [cart, setCart] = useState([])
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', address: '', discount: '' })
  const [loading, setLoading] = useState(false)
  const [isDataLoaded, setIsDataLoaded] = useState(false)
  const [activeCategory, setActiveCategory] = useState('All')
  const [inventoryCategory, setInventoryCategory] = useState('All')
  const [search, setSearch] = useState('')

  const loadData = useCallback(async (force = false) => {
    if (isDataLoaded && !force) return
    
    setLoading(true)
    try {
      // Load categories
      const catRes = await axios.get('/api/categories')
      setCategories(catRes.data)
      saveCachedCategories(catRes.data).catch(console.error)

      // Load all items (for general search/caching)
      const itemsRes = await axios.get('/api/items')
      setItems(itemsRes.data)
      saveCachedMenuItems(itemsRes.data).catch(console.error)

      setIsDataLoaded(true)
    } catch (err) {
      console.warn('Network failed in POSContext, loading from fallback', err)
      const cachedCats = await getCachedCategories()
      if (cachedCats?.length) setCategories(cachedCats)
      
      const cachedItems = await getCachedMenuItems()
      if (cachedItems?.length) setItems(cachedItems)
    } finally {
      setLoading(false)
    }
  }, [isDataLoaded])

  // Initial load when context mounts (once per app session)
  useEffect(() => {
    loadData()
  }, [])

  const updateCart = (newCart) => setCart(newCart)
  const clearCart = () => {
    setCart([])
    setCustomerInfo({ name: '', phone: '', address: '', discount: '' })
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
