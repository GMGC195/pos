const DB_NAME = 'PizzaShopOfflineDB';
const DB_VERSION = 2;

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

export const savePendingOrder = async (order) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_orders'], 'readwrite');
    const store = transaction.objectStore('pending_orders');
    const request = store.put({ ...order, timestamp: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllPendingOrders = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_orders'], 'readonly');
    const store = transaction.objectStore('pending_orders');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

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
