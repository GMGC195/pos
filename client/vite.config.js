import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/api': 'http://localhost:5000'
    }
  },

  build: {
    // Raise the warning threshold slightly — anything still over 600 kB is worth investigating
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // Split vendor libraries into stable, separately-cached chunks.
        // Pages are already split via React.lazy() in App.jsx.
        manualChunks(id) {
          // React core — changes almost never, cache forever
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react'
          }

          // Routing
          if (id.includes('node_modules/react-router') ||
              id.includes('node_modules/@remix-run/')) {
            return 'vendor-router'
          }

          // Charting — chart.js + react-chartjs-2 are large, isolate them
          if (id.includes('node_modules/chart.js') ||
              id.includes('node_modules/react-chartjs-2')) {
            return 'vendor-charts'
          }

          // Framer Motion — animation library, also sizeable
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion'
          }

          // Lucide icons
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons'
          }

          // XLSX — kept as its own chunk so it doesn't bloat vendor-misc.
          // It still loads lazily because every import() of xlsx in the app is dynamic.
          if (id.includes('node_modules/xlsx')) {
            return 'vendor-xlsx'
          }

          // Everything else in node_modules goes into a single vendor chunk
          if (id.includes('node_modules/')) {
            return 'vendor-misc'
          }
        }
      }
    }
  }
})
