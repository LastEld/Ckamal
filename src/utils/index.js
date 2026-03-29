/**
 * @fileoverview Utility Functions Index
 * @module utils
 */

export { logger, createLogger } from './logger.js';
export { 
  PerformanceMonitor as LegacyPerformanceMonitor, 
  globalMonitor,
  memoize, 
  debounce, 
  throttle, 
  batchRequests,
  rateLimit,
  profile
} from './performance.js';
export { Cache, createCache, LRUCache, MultiTierCache, CacheWarmer, cached, globalCache } from './cache.js';
export { FileLock } from './file-lock.js';

// Performance Monitoring
export {
  PerformanceMonitor,
  getPerformanceMonitor,
  setPerformanceMonitor
} from './performance-monitor.js';

// Lazy Loading
export {
  lazyLoad,
  lazyComponent,
  lazyData,
  ViewportLazyLoader,
  lazyLoadImage,
  BatchLoader,
  prefetch,
  preload,
  viewportLazyLoader
} from './lazy-loader.js';

// Default exports
export { PerformanceMonitor as default } from './performance-monitor.js';
