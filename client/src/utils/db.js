const DB_NAME = 'PizzaShopOfflineDB';
const DB_VERSION = 2;

export const SYNC_STATUS = {
  PENDING: 'Pending',
  SYNCING: 'Syncing',
  SYNCED: 'Synced',
  FAILED: 'Failed',
};

export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending_orders')) {
        db.createObjectStore('pending_orders', { keyPath: 'client_order_id' });
      }
      if (!db.objectStoreNames.contains('optional_cache')) {
        db.createObjectStore('optional_cache', { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('menu_items')) {
        db.createObjectStore('menu_items', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Save an offline pending order with full preservation of items, payments,
 * customer data, inventory changes, and explicit sync status.
 *
 * Statuses: 'Pending' | 'Syncing' | 'Synced' | 'Failed'
 */
export const savePendingOrder = async (order) => {
  const db = await initDB();
  const recordToSave = {
    ...order,
    sync_status: order.sync_status || SYNC_STATUS.PENDING,
    timestamp: order.timestamp || Date.now(),
    created_at: order.created_at || new Date().toISOString(),
    retry_count: order.retry_count || 0,
    last_attempt: order.last_attempt || null,
    error_message: order.error_message || null,
  };

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(['pending_orders'], 'readwrite');
      const store = transaction.objectStore('pending_orders');
      const request = store.put(recordToSave);
      request.onsuccess = () => resolve(recordToSave);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    // If browser hits quota error, attempt emergency pruning of old synced data
    if (err.name === 'QuotaExceededError' || err.message?.includes('quota')) {
      console.warn('[OfflineDB] Quota exceeded while saving pending order. Running emergency safe prune...');
      await safePruneSyncedOrders(12);
      await safePruneOptionalCache(1);
      // Retry once after pruning
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['pending_orders'], 'readwrite');
        const store = transaction.objectStore('pending_orders');
        const request = store.put(recordToSave);
        request.onsuccess = () => resolve(recordToSave);
        request.onerror = () => reject(request.error);
      });
    }
    throw err;
  }
};

/**
 * Updates the synchronization status of an offline order.
 * status: 'Pending' | 'Syncing' | 'Synced' | 'Failed'
 */
export const updatePendingOrderStatus = async (client_order_id, status, errorMessage = null) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_orders'], 'readwrite');
    const store = transaction.objectStore('pending_orders');
    const getReq = store.get(client_order_id);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        resolve(null);
        return;
      }
      const updated = {
        ...existing,
        sync_status: status,
        last_attempt: Date.now(),
        retry_count: status === 'Failed' ? (existing.retry_count || 0) + 1 : (existing.retry_count || 0),
        error_message: errorMessage || (status === 'Synced' ? null : existing.error_message),
        synced_at: status === 'Synced' ? Date.now() : existing.synced_at
      };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
};

/**
 * Returns all orders requiring synchronization ('Pending', 'Syncing', or 'Failed').
 * Synced records are excluded from pending counts.
 */
export const getAllPendingOrders = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_orders'], 'readonly');
    const store = transaction.objectStore('pending_orders');
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result || [];
      // Treat orders with no sync_status as 'Pending' for backwards compatibility
      const unsynced = all.filter(o => !o.sync_status || o.sync_status === 'Pending' || o.sync_status === 'Failed' || o.sync_status === 'Syncing');
      resolve(unsynced);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Returns all offline orders regardless of status (for diagnostic views & audit).
 */
export const getAllOfflineOrders = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_orders'], 'readonly');
    const store = transaction.objectStore('pending_orders');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Marks an order as successfully synced. Rather than immediately deleting,
 * marks it as 'Synced' with timestamp so it can be cleaned up per retention policy.
 */
export const markOrderSynced = async (client_order_id) => {
  return updatePendingOrderStatus(client_order_id, 'Synced');
};

/**
 * Remove a pending order explicitly by client_order_id.
 */
export const removePendingOrder = async (client_order_id) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_orders'], 'readwrite');
    const store = transaction.objectStore('pending_orders');
    const request = store.delete(client_order_id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Clear all pending orders (Caution: only call if explicitly requested by user).
 */
export const clearPendingOrders = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_orders'], 'readwrite');
    const store = transaction.objectStore('pending_orders');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * SAFE PRUNING: Only deletes orders with sync_status === 'Synced'
 * that are older than retentionHours (default 48h).
 * NEVER deletes pending, syncing, or failed orders!
 */
export const safePruneSyncedOrders = async (retentionHours = 48) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_orders'], 'readwrite');
    const store = transaction.objectStore('pending_orders');
    const request = store.getAll();

    request.onsuccess = () => {
      const orders = request.result || [];
      const cutoffTime = Date.now() - (retentionHours * 60 * 60 * 1000);
      let deletedCount = 0;
      let preservedCount = 0;

      for (const order of orders) {
        // STRICT SAFETY CHECK: Only delete if confirmed 'Synced' AND past retention period
        const isSynced = order.sync_status === SYNC_STATUS.SYNCED || order.sync_status === 'Synced';
        const syncTime = order.synced_at || order.timestamp || 0;

        if (isSynced && syncTime < cutoffTime) {
          store.delete(order.client_order_id);
          deletedCount++;
        } else {
          preservedCount++;
        }
      }
      resolve({ deletedCount, preservedCount });
    };

    request.onerror = () => reject(request.error);
  });
};

/**
 * SAFE PRUNING: Prune expired entries from optional_cache
 */
export const safePruneOptionalCache = async (maxAgeHours = 24) => {
  const db = await initDB();
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains('optional_cache')) {
        resolve({ deletedCount: 0 });
        return;
      }
      const tx = db.transaction(['optional_cache'], 'readwrite');
      const store = tx.objectStore('optional_cache');
      const req = store.getAll();

      req.onsuccess = () => {
        const entries = req.result || [];
        const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
        let deletedCount = 0;
        for (const entry of entries) {
          if (entry.timestamp && entry.timestamp < cutoff) {
            store.delete(entry.url);
            deletedCount++;
          }
        }
        resolve({ deletedCount });
      };
      req.onerror = () => resolve({ deletedCount: 0 });
    } catch {
      resolve({ deletedCount: 0 });
    }
  });
};

export const saveCategories = async (categories) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['categories'], 'readwrite');
    const store = tx.objectStore('categories');
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      for (const cat of categories) {
        store.put(cat);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getCategories = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['categories'], 'readonly');
    const store = tx.objectStore('categories');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const saveMenuItems = async (items) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['menu_items'], 'readwrite');
    const store = tx.objectStore('menu_items');
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      for (const item of items) {
        store.put(item);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getMenuItems = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['menu_items'], 'readonly');
    const store = tx.objectStore('menu_items');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};
