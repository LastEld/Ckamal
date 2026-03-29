# CogniMesh Dashboard PWA

This directory contains the Progressive Web App (PWA) implementation for the CogniMesh Dashboard.

## Features

### 1. Web App Manifest (`manifest.json`)
- App metadata (name, description, theme colors)
- Icons for all platforms (72x72 to 512x512)
- Shortcuts for quick navigation
- Screenshot previews for install prompt

### 2. Service Worker (`service-worker.js`)
- **Offline Caching**: Static assets cached for offline use
- **Background Sync**: Queue and retry failed requests when back online
- **Push Notifications**: Web push notification support
- **Cache Strategies**:
  - Cache First: Static assets (JS, CSS)
  - Network First: API requests
  - Stale While Revalidate: Images and external resources

### 3. Mobile Optimizations (`mobile-optimizations.js`)
- **Touch Gestures**: Swipe navigation, long press, double tap
- **Pull-to-Refresh**: Native-like pull-to-refresh on mobile
- **Native Transitions**: Smooth view transitions
- **Haptic Feedback**: Vibration on supported devices
- **Viewport Fixes**: iOS keyboard handling, safe area support

### 4. PWA Manager (`components/pwa-manager.js`)
- Install prompt handling
- Online/offline detection
- Push notification subscription
- Update checking

## File Structure

```
public/
├── manifest.json              # PWA manifest
├── service-worker.js          # Service worker for offline/cache
├── mobile-optimizations.js    # Mobile touch/gesture handling
├── offline.html               # Offline fallback page
├── browserconfig.xml          # Microsoft browser config
├── icons/
│   ├── icon.svg               # Main icon source
│   ├── icon-maskable.svg      # Adaptive icon
│   ├── favicon.svg            # Browser favicon
│   ├── safari-pinned-tab.svg  # Safari pinned tab
│   ├── shortcut-*.svg         # Shortcut icons
│   └── generate-icons.html    # Icon generator tool
├── styles/
│   └── mobile-pwa.css         # Mobile-specific styles
└── components/
    └── pwa-manager.js         # PWA feature manager
```

## Installation

### As a PWA (End Users)
1. Open the dashboard in a modern browser (Chrome, Edge, Safari)
2. Look for the install prompt or use browser menu → "Install"
3. The app will be added to home screen/desktop

### Icon Generation
To generate PNG icons from the SVG sources:
1. Open `/icons/generate-icons.html` in a browser
2. Click "Generate All Icons"
3. Download the generated PNG files
4. Place them in the `icons/` directory

## Browser Support

| Feature | Chrome | Edge | Safari | Firefox |
|---------|--------|------|--------|---------|
| Install Prompt | ✅ 80+ | ✅ 80+ | ✅ 16.4+ | ❌ |
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| Background Sync | ✅ | ✅ | ❌ | ❌ |
| Push Notifications | ✅ | ✅ | ✅ | ❌ |
| Web App Manifest | ✅ | ✅ | ✅ | Partial |

## Configuration

### Theme Colors
- Edit `manifest.json` → `theme_color` and `background_color`
- Edit `index.html` meta tags

### Cache Strategy
Edit `service-worker.js`:
- `STATIC_ASSETS`: Files cached on install
- `API_ROUTES`: API endpoints with network-first strategy
- `CACHE_MAX_AGE`: Cache expiration times

### Push Notifications
1. Generate VAPID keys on your server
2. Update `getVapidPublicKey()` in `pwa-manager.js`
3. Implement `/api/push/subscribe` endpoint

## Development

### Testing Offline Mode
1. Open DevTools → Application → Service Workers
2. Check "Offline"
3. Reload the page

### Debugging Service Worker
```javascript
// In DevTools console:
// Unregister service worker
navigator.serviceWorker.getRegistrations().then(r => r.forEach(r => r.unregister()))

// Check cache
caches.keys().then(names => console.log(names))
```

### Simulating Mobile
Use Chrome DevTools Device Mode:
1. Open DevTools (F12)
2. Toggle Device Toolbar (Ctrl+Shift+M)
3. Select a mobile device preset

## API Reference

### PWAManager
```javascript
// Check if running as installed app
PWAManager.isInstalled()

// Trigger install prompt
PWAManager.install()

// Check connection status
PWAManager.isOffline()

// Subscribe to push notifications
PWAManager.subscribeToPush()

// Unsubscribe from push
PWAManager.unsubscribeFromPush()
```

### MobileOptimizations
```javascript
// Trigger haptic feedback
MobileOptimizations.vibrate('light')  // 'light' | 'medium' | 'heavy'

// Animate view transition
MobileOptimizations.animateTransition('slide-left')

// Disable/enable pull-to-refresh
MobileOptimizations.disablePullToRefresh()
MobileOptimizations.enablePullToRefresh()
```

## Troubleshooting

### Icons not showing
- Ensure PNG files are generated from SVG sources
- Check icon paths in `manifest.json`
- Verify MIME types are correct on server

### Service Worker not registering
- Check HTTPS is enabled (required for PWA)
- Verify service worker path is correct
- Check DevTools → Application → Service Workers for errors

### Push notifications not working
- Ensure notification permission is granted
- Check VAPID keys are correctly configured
- Verify push service endpoint is accessible

## Security Notes

1. Service Worker only works over HTTPS (or localhost)
2. Push notifications require user permission
3. Background sync respects browser privacy settings
4. Cache storage is origin-bound and secure

## License

Part of CogniMesh v5.0 - Internal Use Only
