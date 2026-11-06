import { safePruneSyncedOrders, safePruneOptionalCache } from './db';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run daily (every 24 hours)
const LAST_CLEANUP_KEY = 'pizza_shop_last_cache_cleanup_ts';
const ACTIVE_CACHE_NAME = 'pizza-shop-v11';

/**
 * Check browser storage estimate using Storage API if supported.
 * Returns { usageBytes, quotaBytes, percentUsed, availableMB }
 */
export async function checkStorageEstimate() {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;
      const availableMB = Math.max(0, (quota - usage) / (1024 * 1024));
      return {
        usage,
        quota,
        percentUsed: parseFloat(percentUsed.toFixed(2)),
        availableMB: parseFloat(availableMB.toFixed(2)),
        supported: true
      };
    } catch (err) {
      console.warn('[CacheManager] Storage estimate failed:', err);
    }
  }
  return { usage: 0, quota: 0, percentUsed: 0, availableMB: 1000, supported: false };
}

/**
 * Safely cleans Cache API storage:
 * - Deletes outdated caches from older versions
 * - In the current cache, prunes stale/accumulated API responses while strictly
 *   preserving application shell assets (index.html, JS/CSS bundles, logos, fonts)
 */
export async function cleanCacheStorage(forceEmergency = false) {
  if (typeof window === 'undefined' || !('caches' in window)) return { deletedCaches: 0, prunedApiEntries: 0 };

  let deletedCaches = 0;
  let prunedApiEntries = 0;

  try {
    const cacheKeys = await caches.keys();

    // 1. Delete outdated cache stores from previous app versions
    for (const key of cacheKeys) {
      if (key !== ACTIVE_CACHE_NAME) {
        await caches.delete(key);
        deletedCaches++;
        console.log(`[CacheManager] Removed outdated cache: ${key}`);
      }
    }

    // 2. Open active cache and prune accumulated/expired dynamic API requests
    const activeCache = await caches.open(ACTIVE_CACHE_NAME);
    const requests = await activeCache.keys();

    for (const req of requests) {
      const url = new URL(req.url);
      const isApi = url.pathname.startsWith('/api/');

      if (isApi) {
        // Essential rate lists (categories & items) are preserved for offline POS
        const isEssentialOfflineData = url.pathname.includes('/api/categories') || url.pathname.includes('/api/items');

        if (!isEssentialOfflineData || forceEmergency) {
          // Delete dynamic accumulated API cache (orders, stats, reports, logs, etc.)
          await activeCache.delete(req);
          prunedApiEntries++;
        }
      }
    }
  } catch (err) {
    console.warn('[CacheManager] Error during CacheStorage cleanup:', err);
  }

  return { deletedCaches, prunedApiEntries };
}

/**
 * Clean unnecessary temporary items from localStorage safely.
 * NEVER deletes authentication tokens, user info, or persistent configuration!
 */
export function cleanTemporaryLocalStorage() {
  if (typeof localStorage === 'undefined') return 0;
  let clearedCount = 0;
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Identify temporary debug/log/transient keys
      if (
        key.startsWith('temp_') ||
        key.startsWith('debug_') ||
        key.startsWith('transient_') ||
        key.startsWith('preview_blob_') ||
        key.startsWith('chart_cache_')
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => {
      localStorage.removeItem(k);
      clearedCount++;
    });
  } catch (err) {
    console.warn('[CacheManager] Error cleaning temporary localStorage:', err);
  }
  return clearedCount;
}

/**
 * Run safe cache cleanup with full offline transaction preservation.
 * Guarantees:
 * 1. Never deletes pending/unsynchronized offline orders.
 * 2. Only prunes synced records older than retention period (48 hours).
 * 3. Prunes expired Cache API responses and outdated application caches.
 * 4. Logs complete diagnostic information.
 */
export async function runSafeCacheCleanup(options = {}) {
  const { force = false, emergency = false } = options;

  try {
    const lastCleanupStr = localStorage.getItem(LAST_CLEANUP_KEY);
    const lastCleanup = lastCleanupStr ? parseInt(lastCleanupStr, 10) : 0;
    const now = Date.now();
    const timeSinceLast = now - lastCleanup;

    const storageStats = await checkStorageEstimate();

    // Trigger cleanup if:
    // - forced by caller
    // - emergency quota condition (usage > 75%)
    // - scheduled interval elapsed (24-48 hours)
    const isDue = force || emergency || timeSinceLast >= CLEANUP_INTERVAL_MS || storageStats.percentUsed >= 75;

    if (!isDue) {
      return { skipped: true, reason: 'Recently cleaned', storage: storageStats };
    }

    console.log(`[CacheManager] Starting safe cache cleanup (Force: ${force}, Emergency: ${emergency}, Quota Used: ${storageStats.percentUsed}%)...`);

    // 1. Clean Cache Storage (Cache API)
    const cacheResult = await cleanCacheStorage(emergency);

    // 2. Safe cleanup of IndexedDB: ONLY prune synced orders older than 48h; NEVER pending/syncing/failed!
    const idbResult = await safePruneSyncedOrders(emergency ? 24 : 48);
    const optionalCacheResult = await safePruneOptionalCache(24);

    // 3. Clean temporary localStorage keys
    const lsResult = cleanTemporaryLocalStorage();

    // Update last cleanup timestamp
    localStorage.setItem(LAST_CLEANUP_KEY, now.toString());

    const postStorageStats = await checkStorageEstimate();

    const summary = {
      timestamp: new Date().toISOString(),
      deletedOldCaches: cacheResult.deletedCaches,
      prunedApiEntries: cacheResult.prunedApiEntries,
      prunedSyncedOrders: idbResult?.deletedCount || 0,
      preservedPendingOrders: idbResult?.preservedCount || 0,
      prunedOptionalCache: optionalCacheResult?.deletedCount || 0,
      clearedLocalStorageKeys: lsResult,
      quotaBefore: storageStats,
      quotaAfter: postStorageStats
    };

    console.log('[CacheManager] Safe cleanup finished successfully:', summary);
    return summary;
  } catch (err) {
    console.error('[CacheManager] Error running safe cache cleanup:', err);
    return { error: err.message };
  }
}

/**
 * Initialize automatic cache cleanup service on application startup.
 * Runs on boot if 24h passed, checks periodically, and handles quota warnings.
 */
export function initAutomaticCacheCleanup() {
  if (typeof window === 'undefined') return;

  // Run on startup in background (non-blocking)
  setTimeout(() => {
    runSafeCacheCleanup({ force: false }).catch(err => {
      console.warn('[CacheManager] Startup cleanup check failed:', err);
    });
  }, 3000);

  // Check every 6 hours if 24 hours have elapsed
  const intervalId = setInterval(() => {
    runSafeCacheCleanup({ force: false }).catch(err => {
      console.warn('[CacheManager] Periodic cleanup check failed:', err);
    });
  }, 6 * 60 * 60 * 1000);

  // Add listener for storage pressure / quota events if supported
  if ('storage' in navigator && 'onquotarequest' in navigator.storage) {
    navigator.storage.onquotarequest = () => {
      console.warn('[CacheManager] Browser storage quota threshold reached, running emergency cleanup...');
      runSafeCacheCleanup({ emergency: true });
    };
  }

  return () => clearInterval(intervalId);
}

