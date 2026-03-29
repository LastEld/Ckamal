/**
 * CogniMesh Dashboard - Service Worker
 * Provides offline caching, background sync, and push notifications
 * 
 * @version 1.0.0
 */

'use strict';

// Cache configuration
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `cognimesh-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `cognimesh-dynamic-${CACHE_VERSION}`;
const API_CACHE = `cognimesh-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `cognimesh-images-${CACHE_VERSION}`;

// Cache durations (in milliseconds)
const CACHE_MAX_AGE = {
  static: 30 * 24 * 60 * 60 * 1000,    // 30 days
  dynamic: 7 * 24 * 60 * 60 * 1000,    // 7 days
  api: 5 * 60 * 1000,                  // 5 minutes
  images: 30 * 24 * 60 * 60 * 1000     // 30 days
};

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/styles.css',
  '/styles/mobile-pwa.css',
  '/app.js',
  '/mobile-optimizations.js',
  '/components/toast.js',
  '/components/toast-manager.js',
  '/components/api-client.js',
  '/components/websocket-client.js',
  '/components/presence-component.js',
  '/components/alerts-component.js',
  '/components/tasks-component.js',
  '/components/roadmaps-component.js',
  '/components/analytics-component.js',
  '/components/agents.js',
  '/components/tools-component.js',
  '/components/providers-component.js',
  '/components/context-component.js',
  '/components/cv-component.js',
  '/components/workflows-component.js',
  '/components/cost-widget.js',
  '/components/mobile-nav.js',
  '/components/dashboard-app.js',
  '/styles/components/mobile-nav.css',
  '/styles/components/cost-widget.css',
  '/styles/components/command-palette.css'
];

// External CDN resources to cache
const EXTERNAL_RESOURCES = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  'https://unpkg.com/lucide@latest'
];

// API routes to cache with network-first strategy
const API_ROUTES = [
  '/api/tasks',
  '/api/agents',
  '/api/alerts',
  '/api/stats',
  '/api/roadmaps'
];

// Background sync queue
let syncQueue = [];

// ============================================
// Installation & Activation
// ============================================

/**
 * Service Worker Install Event
 * Pre-caches static assets for offline use
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE)
        .then(cache => {
          console.log('[SW] Caching static assets');
          return cache.addAll(STATIC_ASSETS);
        })
        .catch(err => console.warn('[SW] Failed to cache some static assets:', err)),
      
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

/**
 * Service Worker Activate Event
 * Cleans up old caches and takes control
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('cognimesh-') && !name.includes(CACHE_VERSION))
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
      
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// ============================================
// Fetch Handling
// ============================================

/**
 * Fetch Event Handler
 * Implements various caching strategies based on request type
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests (handle via background sync)
  if (request.method !== 'GET') {
    event.respondWith(handleNonGetRequest(request));
    return;
  }
  
  // Handle different request types with appropriate strategies
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isAPIRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
  } else if (isImageRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
  } else if (isExternalResource(url)) {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
  } else {
    event.respondWith(networkWithCacheFallback(request));
  }
});

// ============================================
// Caching Strategies
// ============================================

/**
 * Cache First Strategy
 * Returns cached response if available, otherwise fetches and caches
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.warn('[SW] Cache first failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network First Strategy
 * Tries network first, falls back to cache
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] Serving cached API response');
      return cached;
    }
    throw error;
  }
}

/**
 * Stale While Revalidate Strategy
 * Returns cached response immediately, updates cache in background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  
  return cached || fetchPromise;
}

/**
 * Network with Cache Fallback
 * Tries network, falls back to any matching cache
 */
async function networkWithCacheFallback(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    
    if (cached) {
      return cached;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return cache.match('/index.html');
    }
    
    throw error;
  }
}

/**
 * Handle non-GET requests (POST, PUT, DELETE)
 * Queue for background sync if offline
 */
async function handleNonGetRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    // Queue for background sync
    await queueForSync(request);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Request queued for background sync',
        queued: true 
      }),
      { 
        status: 202, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

// ============================================
// Request Type Checkers
// ============================================

function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.html', '.json', '.woff2', '.woff'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) && 
         url.origin === self.location.origin;
}

function isAPIRequest(url) {
  return API_ROUTES.some(route => url.pathname.startsWith(route));
}

function isImageRequest(url) {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
  return imageExtensions.some(ext => url.pathname.endsWith(ext));
}

function isExternalResource(url) {
  return EXTERNAL_RESOURCES.some(resource => resource.includes(url.hostname));
}

// ============================================
// Background Sync
// ============================================

/**
 * Queue request for background sync
 */
async function queueForSync(request) {
  const queueData = {
    url: request.url,
    method: request.method,
    headers: Array.from(request.headers.entries()),
    body: await request.text(),
    timestamp: Date.now(),
    id: generateId()
  };
  
  syncQueue.push(queueData);
  
  // Store in IndexedDB for persistence
  await storeSyncItem(queueData);
  
  // Register for background sync
  if ('sync' in self.registration) {
    await self.registration.sync.register('sync-queue');
  }
}

/**
 * Sync Event Handler
 * Processes queued requests when back online
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(processSyncQueue());
  }
});

/**
 * Process the sync queue
 */
async function processSyncQueue() {
  const items = await getAllSyncItems();
  
  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: new Headers(item.headers),
        body: item.body
      });
      
      if (response.ok) {
        await deleteSyncItem(item.id);
        
        // Notify client of successful sync
        notifyClients({
          type: 'sync-complete',
          data: { url: item.url, method: item.method }
        });
      }
    } catch (error) {
      console.warn('[SW] Sync item failed, will retry:', error);
    }
  }
}

// ============================================
// Push Notifications
// ============================================

/**
 * Push Event Handler
 * Displays notification when push received
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'CogniMesh',
      body: event.data.text(),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png'
    };
  }
  
  const options = {
    body: data.body || 'New notification from CogniMesh',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-72x72.png',
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data || {},
    vibrate: data.vibrate || [200, 100, 200],
    renotify: data.renotify || false,
    timestamp: data.timestamp || Date.now()
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'CogniMesh Dashboard',
      options
    )
  );
});

/**
 * Notification Click Handler
 * Handles user interaction with notifications
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  
  event.notification.close();
  
  const notificationData = event.notification.data || {};
  const action = event.action;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Handle notification actions
        if (action === 'view') {
          return openOrFocusWindow(notificationData.url || '/');
        } else if (action === 'dismiss') {
          return;
        }
        
        // Default click behavior
        if (clientList.length > 0) {
          const client = clientList[0];
          client.focus();
          client.postMessage({
            type: 'notification-clicked',
            data: notificationData
          });
        } else {
          return self.clients.openWindow(notificationData.url || '/');
        }
      })
  );
});

/**
 * Notification Close Handler
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event);
});

// ============================================
// Message Handling (Client <-> SW Communication)
// ============================================

/**
 * Message Event Handler
 * Handles messages from the main thread
 */
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};
  
  switch (type) {
    case 'skip-waiting':
      self.skipWaiting();
      break;
      
    case 'cache-assets':
      event.waitUntil(cacheAssets(data.assets));
      break;
      
    case 'clear-cache':
      event.waitUntil(clearCache(data.cacheName));
      break;
      
    case 'get-cache-status':
      event.waitUntil(
        getCacheStatus().then(status => {
          event.ports[0]?.postMessage({ status });
        })
      );
      break;
      
    case 'subscribe-push':
      event.waitUntil(handlePushSubscription(data));
      break;
      
    case 'unsubscribe-push':
      event.waitUntil(handlePushUnsubscription());
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// ============================================
// Helper Functions
// ============================================

/**
 * Open or focus a window
 */
async function openOrFocusWindow(url) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  
  for (const client of clients) {
    if (client.url === url && 'focus' in client) {
      return client.focus();
    }
  }
  
  if (self.clients.openWindow) {
    return self.clients.openWindow(url);
  }
}

/**
 * Notify all clients
 */
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage(message);
  });
}

/**
 * Cache specific assets
 */
async function cacheAssets(assets) {
  const cache = await caches.open(DYNAMIC_CACHE);
  return cache.addAll(assets);
}

/**
 * Clear specific cache
 */
async function clearCache(cacheName) {
  return caches.delete(cacheName);
}

/**
 * Get cache status information
 */
async function getCacheStatus() {
  const cacheNames = await caches.keys();
  const status = {};
  
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    status[name] = keys.length;
  }
  
  return status;
}

/**
 * Handle push subscription
 */
async function handlePushSubscription(data) {
  try {
    const subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.vapidPublicKey)
    });
    
    notifyClients({
      type: 'push-subscribed',
      subscription: subscription.toJSON()
    });
    
    return subscription;
  } catch (error) {
    console.error('[SW] Push subscription failed:', error);
    throw error;
  }
}

/**
 * Handle push unsubscription
 */
async function handlePushUnsubscription() {
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
    
    notifyClients({
      type: 'push-unsubscribed'
    });
    
    return true;
  } catch (error) {
    console.error('[SW] Push unsubscription failed:', error);
    throw error;
  }
}

/**
 * Convert VAPID key
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

/**
 * Generate unique ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// IndexedDB Helpers (simplified)
// ============================================

const DB_NAME = 'CogniMeshSyncDB';
const DB_VERSION = 1;
const STORE_NAME = 'syncQueue';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function storeSyncItem(item) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  return store.put(item);
}

async function getAllSyncItems() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return store.getAll();
}

async function deleteSyncItem(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  return store.delete(id);
}

// ============================================
// Periodic Background Sync (if supported)
// ============================================

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-data') {
    event.waitUntil(
      fetch('/api/stats')
        .then(response => response.json())
        .then(data => {
          notifyClients({
            type: 'periodic-sync-data',
            data
          });
        })
        .catch(console.error)
    );
  }
});

console.log('[SW] Service Worker loaded');
