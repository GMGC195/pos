const CACHE_NAME = 'pizza-shop-v11';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/pizza-placeholder.png',
];

// Maximum dynamic API items allowed in cache to prevent storage quota exhaustion
const MAX_API_CACHE_ENTRIES = 50;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(err => {
      console.warn('[SW] Pre-caching assets warning:', err);
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
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Helper: safe cache put with size-limiting and quota error handling
function safeCachePut(request, response) {
  if (request.method !== 'GET') return;
  if (!response || response.status !== 200) return;

  try {
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.put(request, response);

        // Periodically limit cache size for API requests to avoid filling browser quota
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/')) {
          const keys = await cache.keys();
          const apiKeys = keys.filter(k => new URL(k.url).pathname.startsWith('/api/'));
          if (apiKeys.length > MAX_API_CACHE_ENTRIES) {
            // Prune oldest API cache entries
            const toDelete = apiKeys.slice(0, apiKeys.length - MAX_API_CACHE_ENTRIES);
            for (const oldKey of toDelete) {
              await cache.delete(oldKey);
            }
          }
        }
      } catch (putErr) {
        // QuotaExceededError or transient storage error - gracefully ignore so page never crashes
        console.warn('[SW] safeCachePut failed safely:', putErr.name || putErr.message);
      }
    }).catch((err) => {
      console.warn('[SW] caches.open failed safely:', err);
    });
  } catch (outerErr) {
    console.warn('[SW] Outer cache error ignored safely:', outerErr);
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isGET = event.request.method === 'GET';

  // ── Never intercept Vite dev server modules or hot updates ──────────────────
  if (url.pathname.includes('/@vite') || url.pathname.includes('/@id/') || url.pathname.includes('/node_modules/') || url.search.includes('v=')) {
    return;
  }

  // ── Never intercept non-GET API mutations (POST/PUT/PATCH/DELETE) ─────────
  if (event.request.method !== 'GET' && url.pathname.startsWith('/api/')) {
    return;
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

  // ── SPA Navigation: always serve index.html to guarantee no blank screen ──
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            safeCachePut(event.request, networkResponse.clone());
            return networkResponse;
          }
          if (networkResponse && networkResponse.status === 404) {
            return caches.match('/index.html') || caches.match('/') || networkResponse;
          }
          return networkResponse;
        })
        .catch(() => 
          caches.match('/index.html')
            .then(cached => cached || caches.match('/'))
            .then(cached => cached || new Response('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pizza Shop</title></head><body><div id="root"></div><script>location.reload()</script></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))
        )
    );
    return;
  }

  // ── Stale-while-revalidate for static assets ──────────────────────────────
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          safeCachePut(event.request, networkResponse.clone());
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        safeCachePut(event.request, networkResponse.clone());
        return networkResponse;
      });
    }).catch(() => fetch(event.request))
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
