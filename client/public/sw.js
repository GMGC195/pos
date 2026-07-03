const CACHE_NAME = 'pizza-shop-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/pizza-placeholder.png',
  // Vite assets will be added here if we use a build tool or precache list
  // For now, we rely on runtime caching
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API Caching: Categories and Items (Rate Lists)
  if (url.pathname.includes('/api/categories') || url.pathname.includes('/api/items')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Handle Order Posting Offline
  if (url.pathname.startsWith('/api/orders') && event.request.method === 'POST') {
    // We don't intercept POST directly in sw.js because we want POS.jsx to handle the UX
    // But we could use Background Sync here if we wanted.
    // For now, let's keep it simple: runtime navigation caching
  }

  // Network-First for Orders, Transactions, and Stats (Auto-Reload logic)
  if (url.pathname.includes('/api/orders') || 
      url.pathname.includes('/api/transactions') || 
      url.pathname.includes('/api/stats')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clonedResponse = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clonedResponse);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Improved Navigation Handling for SPA: Always serve index.html for navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // If we got a valid response, cache it and return it
          if (networkResponse && networkResponse.ok) {
            const clonedResponse = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clonedResponse);
            });
            return networkResponse;
          }
          // If it's a 404 (common on refresh in non-configured servers), fallback to main shell
          if (networkResponse.status === 404) {
            return caches.match('/index.html') || caches.match('/') || networkResponse;
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails completely (offline), fallback to main shell
          return caches.match('/index.html') || caches.match('/');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached, but refresh in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clonedResponse = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clonedResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache new assets on the fly
        if (event.request.method === 'GET' && networkResponse.status === 200) {
          const clonedResponse = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonedResponse);
          });
        }
        return networkResponse;
      });
    })
  );
});

// Background Sync (Optional, requires registration in main.jsx)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  // This would ideally call the sync logic, but we'll implement it in the UI/App level 
  // for better control over toasts and state.
  console.log('[SW] Background sync triggered');
}
