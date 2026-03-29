/**
 * CogniMesh Dashboard - PWA Manager
 * Handles PWA installation, updates, and offline functionality
 * 
 * @version 1.0.0
 */

(function() {
  'use strict';

  // ============================================
  // State
  // ============================================
  
  let deferredPrompt = null;
  let isInstalled = false;
  let isOffline = false;

  // ============================================
  // Initialization
  // ============================================
  
  function init() {
    // Check if already installed
    isInstalled = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone === true;
    
    // Listen for beforeinstallprompt
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Listen for appinstalled
    window.addEventListener('appinstalled', handleAppInstalled);
    
    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Initial offline check
    isOffline = !navigator.onLine;
    updateOfflineUI();
    
    // Create offline indicator
    createOfflineIndicator();
    
    // Create install prompt
    if (!isInstalled) {
      createInstallPrompt();
    }
    
    // Expose API
    window.PWAManager = {
      install: promptInstall,
      isInstalled: () => isInstalled,
      isOffline: () => isOffline,
      update: checkForUpdate,
      subscribeToPush: subscribeToPushNotifications,
      unsubscribeFromPush: unsubscribeFromPushNotifications
    };
    
    console.log('[PWA] Manager initialized');
  }

  // ============================================
  // Install Prompt
  // ============================================
  
  function handleBeforeInstallPrompt(e) {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    
    // Store the event for later use
    deferredPrompt = e;
    
    console.log('[PWA] Install prompt available');
    
    // Show custom install prompt after a delay
    setTimeout(() => {
      showInstallPrompt();
    }, 5000);
  }

  function handleAppInstalled() {
    console.log('[PWA] App was installed');
    isInstalled = true;
    deferredPrompt = null;
    hideInstallPrompt();
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('pwa:installed'));
  }

  function createInstallPrompt() {
    // Don't create if already exists
    if (document.getElementById('pwaInstallPrompt')) return;
    
    const prompt = document.createElement('div');
    prompt.id = 'pwaInstallPrompt';
    prompt.className = 'pwa-install-prompt';
    prompt.innerHTML = `
      <div class="pwa-install-content">
        <div class="pwa-install-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="pwa-install-text">
          <h3>Install CogniMesh</h3>
          <p>Add to your home screen for the best experience</p>
        </div>
      </div>
      <div class="pwa-install-actions">
        <button class="pwa-install-btn primary" id="pwaInstallBtn">Install</button>
        <button class="pwa-install-btn secondary" id="pwaDismissBtn">Not Now</button>
      </div>
    `;
    
    document.body.appendChild(prompt);
    
    // Event listeners
    document.getElementById('pwaInstallBtn').addEventListener('click', promptInstall);
    document.getElementById('pwaDismissBtn').addEventListener('click', dismissInstallPrompt);
  }

  function showInstallPrompt() {
    const prompt = document.getElementById('pwaInstallPrompt');
    if (prompt && deferredPrompt && !isInstalled) {
      prompt.classList.add('visible');
    }
  }

  function hideInstallPrompt() {
    const prompt = document.getElementById('pwaInstallPrompt');
    if (prompt) {
      prompt.classList.remove('visible');
    }
  }

  function dismissInstallPrompt() {
    hideInstallPrompt();
    // Remember dismissal
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }

  async function promptInstall() {
    if (!deferredPrompt) {
      console.log('[PWA] No install prompt available');
      return false;
    }
    
    // Show the browser install prompt
    deferredPrompt.prompt();
    
    // Wait for user response
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Install prompt result:', outcome);
    
    // Clear the saved prompt
    deferredPrompt = null;
    
    if (outcome === 'accepted') {
      isInstalled = true;
      hideInstallPrompt();
    }
    
    return outcome === 'accepted';
  }

  // ============================================
  // Offline Handling
  // ============================================
  
  function handleOnline() {
    console.log('[PWA] Connection restored');
    isOffline = false;
    updateOfflineUI();
    
    // Show toast notification
    if (window.ToastManager) {
      window.ToastManager.success('Connection restored', {
        icon: 'wifi',
        duration: 3000
      });
    }
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('pwa:online'));
  }

  function handleOffline() {
    console.log('[PWA] Connection lost');
    isOffline = true;
    updateOfflineUI();
    
    // Show toast notification
    if (window.ToastManager) {
      window.ToastManager.warning('You are offline. Some features may be unavailable.', {
        icon: 'wifi-off',
        duration: 5000
      });
    }
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('pwa:offline'));
  }

  function createOfflineIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'offlineIndicator';
    indicator.className = 'offline-indicator';
    indicator.textContent = '⚠️ You are offline';
    document.body.appendChild(indicator);
  }

  function updateOfflineUI() {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
      indicator.classList.toggle('visible', isOffline);
    }
    
    // Update body class
    document.body.classList.toggle('is-offline', isOffline);
  }

  // ============================================
  // Updates
  // ============================================
  
  async function checkForUpdate() {
    if (!navigator.serviceWorker) return false;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check for updates
      await registration.update();
      
      console.log('[PWA] Update check completed');
      return true;
    } catch (error) {
      console.error('[PWA] Update check failed:', error);
      return false;
    }
  }

  // ============================================
  // Push Notifications
  // ============================================
  
  async function subscribeToPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.error('[PWA] Push notifications not supported');
      return null;
    }
    
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        // Subscribe
        const vapidPublicKey = await getVapidPublicKey();
        
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
        
        // Send subscription to server
        await sendSubscriptionToServer(subscription);
      }
      
      console.log('[PWA] Push subscription:', subscription);
      return subscription;
    } catch (error) {
      console.error('[PWA] Push subscription failed:', error);
      return null;
    }
  }

  async function unsubscribeFromPushNotifications() {
    if (!('serviceWorker' in navigator)) return false;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        await removeSubscriptionFromServer(subscription);
      }
      
      console.log('[PWA] Push unsubscribed');
      return true;
    } catch (error) {
      console.error('[PWA] Push unsubscription failed:', error);
      return false;
    }
  }

  async function getVapidPublicKey() {
    // In production, fetch this from your server
    // For now, return a placeholder
    return 'BEl62iSMf-VvB39p5jHW4jytKFwq-_yqA-2o6P4BFcJc_bJ7t0d6KxT0z8_8z4j4';
  }

  async function sendSubscriptionToServer(subscription) {
    // Send subscription to your backend
    try {
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON())
      });
      
      return response.ok;
    } catch (error) {
      console.error('[PWA] Failed to send subscription:', error);
      return false;
    }
  }

  async function removeSubscriptionFromServer(subscription) {
    try {
      const response = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
      
      return response.ok;
    } catch (error) {
      console.error('[PWA] Failed to remove subscription:', error);
      return false;
    }
  }

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

  // ============================================
  // Background Sync
  // ============================================
  
  async function registerBackgroundSync(tag) {
    if (!('serviceWorker' in navigator)) {
      return false;
    }
    
    try {
      const registration = await navigator.serviceWorker.ready;
      if (!('sync' in registration)) {
        return false;
      }
      await registration.sync.register(tag);
      return true;
    } catch (error) {
      console.error('[PWA] Background sync registration failed:', error);
      return false;
    }
  }

  // ============================================
  // Initialize on DOM Ready
  // ============================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
