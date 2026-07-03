import axios from 'axios'
import { STORAGE_TOKEN_KEY } from './branding'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})

// Add request interceptor
api.interceptors.request.use(config => {
  const token = localStorage.getItem(STORAGE_TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, error => {
  return Promise.reject(error)
})

export default api
