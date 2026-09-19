import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Force all local date/time formatting to use Saudi Arabia time (Asia/Riyadh)
const tz = 'Asia/Riyadh';

const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function (locales, options) {
  return originalToLocaleString.call(this, locales, { ...options, timeZone: tz });
};

const originalToLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (locales, options) {
  return originalToLocaleDateString.call(this, locales, { ...options, timeZone: tz });
};

const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
Date.prototype.toLocaleTimeString = function (locales, options) {
  return originalToLocaleTimeString.call(this, locales, { ...options, timeZone: tz });
};

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
