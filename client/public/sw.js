const CACHE_NAME = 'pizza-shop-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/pizza-placeholder.png',
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

// Helper: only cache GET responses
function safeCachePut(request, response) {
  if (request.method !== 'GET') return;
  if (!response || response.status !== 200) return;
  caches.open(CACHE_NAME).then((cache) => {
    cache.put(request, response);
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isGET = event.request.method === 'GET';

  // ── Never intercept non-GET API mutations (POST/PUT/PATCH/DELETE) ─────────
  // The Cache API cannot store non-GET requests.
  // Let POST/PUT/PATCH/DELETE go straight to the network with no SW interference.
  if (event.request.method !== 'GET' && url.pathname.startsWith('/api/')) {
    return; // fall through to browser default network handling
  }

  // ── Cache-first for Categories and Items (read-only rate lists) ───────────
  if (url.pathname.includes('/api/categories') || url.pathname.includes('/api/items')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (isGET) safeCachePut(event.request, response.clone());
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ── Network-first for Orders, Transactions, Stats, Employees, Attendance ──
  if (
    url.pathname.includes('/api/orders') ||
    url.pathname.includes('/api/transactions') ||
    url.pathname.includes('/api/employees') ||
    url.pathname.includes('/api/attendance') ||
    url.pathname.includes('/api/stats')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (isGET) safeCachePut(event.request, networkResponse.clone());
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ── SPA Navigation: always serve index.html ───────────────────────────────
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            safeCachePut(event.request, networkResponse.clone());
            return networkResponse;
          }
          if (networkResponse.status === 404) {
            return caches.match('/index.html') || caches.match('/') || networkResponse;
          }
          return networkResponse;
        })
        .catch(() => 
          caches.match('/index.html')
            .then(cached => cached || caches.match('/'))
            .then(cached => cached || new Response('Network error. Please reload the page.', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
        )
    );
    return;
  }

  // ── Stale-while-revalidate for static assets ──────────────────────────────
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached immediately, refresh in background
        fetch(event.request).then((networkResponse) => {
          safeCachePut(event.request, networkResponse.clone());
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        safeCachePut(event.request, networkResponse.clone());
        return networkResponse;
      });
    })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  console.log('[SW] Background sync triggered');
}
