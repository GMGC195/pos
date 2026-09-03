import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service Worker handling
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('SW Registered:', reg.scope);
          reg.update();
        })
        .catch(err => console.log('SW Error:', err));
    });
  } else {
    // In dev mode, unregister any active service worker to prevent stale dev bundle caching
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let reg of registrations) {
        reg.unregister();
        console.log('Unregistered SW in DEV mode:', reg.scope);
      }
    });
  }
}
