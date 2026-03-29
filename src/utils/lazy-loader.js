/**
 * @fileoverview Lazy Loading Utilities
 * @module utils/lazy-loader
 * @description Lazy loading for heavy components, modules, and data
 * @version 5.0.0
 */

import { EventEmitter } from 'events';

/**
 * Lazy loader options
 * @typedef {Object} LazyLoaderOptions
 * @property {number} [preloadDistance=100] - Distance in pixels before viewport to preload
 * @property {string} [rootMargin='50px'] - Intersection Observer root margin
 * @property {number} [threshold=0] - Intersection threshold
 * @property {boolean} [once=true] - Only trigger once
 * @property {number} [delay=0] - Delay before loading (ms)
 */

/**
 * Lazy loaded module cache
 * @type {Map<string, Promise>}
 */
const moduleCache = new Map();

/**
 * Lazy load a module
 * @template T
 * @param {Function} importFn - Dynamic import function
 * @param {string} [cacheKey] - Cache key for module
 * @returns {Promise<T>}
 */
export function lazyLoad(importFn, cacheKey) {
  const key = cacheKey || importFn.toString();
  
  if (moduleCache.has(key)) {
    return moduleCache.get(key);
  }
  
  const promise = importFn().then(module => {
    return module.default || module;
  });
  
  moduleCache.set(key, promise);
  return promise;
}

/**
 * Create a lazy component loader
 * @param {Function} importFn - Function that imports the component
 * @param {Object} [options={}] - Loading options
 * @returns {Function} Lazy component function
 */
export function lazyComponent(importFn, options = {}) {
  const { 
    loadingComponent = null,
    errorComponent = null,
    delay = 200
  } = options;
  
  return function LazyComponent(props = {}) {
    return {
      async mount(container) {
        // Show loading state
        if (loadingComponent) {
          loadingComponent.mount(container);
        }
        
        try {
          // Add artificial delay for better UX (prevents flash)
          await new Promise(r => setTimeout(r, delay));
          
          const Component = await lazyLoad(importFn);
          
          // Clear loading state
          container.innerHTML = '';
          
          // Mount actual component
          return Component.mount?.(container, props) || Component(container, props);
        } catch (error) {
          console.error('[LazyComponent] Failed to load:', error);
          
          container.innerHTML = '';
          
          if (errorComponent) {
            return errorComponent.mount?.(container, { error }) || errorComponent(container, { error });
          }
          
          container.innerHTML = `<div class="lazy-error">Failed to load component</div>`;
        }
      },
      
      unmount() {
        // Cleanup handled by actual component
      }
    };
  };
}

/**
 * Lazy load data with caching
 * @template T
 * @param {string} key - Cache key
 * @param {Function} fetcher - Data fetcher function
 * @param {Object} [options={}] - Options
 * @returns {Promise<T>}
 */
export function lazyData(key, fetcher, options = {}) {
  const { 
    ttl = 5 * 60 * 1000, // 5 minutes
    staleWhileRevalidate = true 
  } = options;
  
  const cacheKey = `data:${key}`;
  
  // Check cache
  const cached = moduleCache.get(cacheKey);
  if (cached) {
    return cached.then(data => {
      // Check if stale
      if (data._timestamp && Date.now() - data._timestamp > ttl) {
        if (staleWhileRevalidate) {
          // Return stale data but refresh in background
          fetcher().then(fresh => {
            fresh._timestamp = Date.now();
            moduleCache.set(cacheKey, Promise.resolve(fresh));
          }).catch(() => {});
          return data;
        }
      }
      return data;
    });
  }
  
  // Fetch new data
  const promise = fetcher().then(data => {
    data._timestamp = Date.now();
    return data;
  });
  
  moduleCache.set(cacheKey, promise);
  return promise;
}

/**
 * Intersection Observer based lazy loader
 * @extends EventEmitter
 */
export class ViewportLazyLoader extends EventEmitter {
  #observer;
  #options;
  #elements;
  
  /**
   * Create a new ViewportLazyLoader
   * @param {LazyLoaderOptions} [options={}]
   */
  constructor(options = {}) {
    super();
    
    this.#options = {
      rootMargin: options.rootMargin || '50px',
      threshold: options.threshold || 0,
      once: options.once !== false,
      delay: options.delay || 0
    };
    
    this.#elements = new Map();
    
    // Create Intersection Observer
    this.#observer = new IntersectionObserver(
      (entries) => this.#handleEntries(entries),
      {
        rootMargin: this.#options.rootMargin,
        threshold: this.#options.threshold
      }
    );
  }
  
  /**
   * Handle intersection entries
   * @private
   * @param {IntersectionObserverEntry[]} entries
   */
  #handleEntries(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const { callback, loaded } = this.#elements.get(entry.target) || {};
        
        if (callback && (!loaded || !this.#options.once)) {
          setTimeout(() => {
            callback(entry.target);
            this.#elements.set(entry.target, { callback, loaded: true });
          }, this.#options.delay);
          
          if (this.#options.once) {
            this.unobserve(entry.target);
          }
          
          this.emit('loaded', entry.target);
        }
      }
    });
  }
  
  /**
   * Observe an element for lazy loading
   * @param {Element} element - DOM element
   * @param {Function} callback - Callback when element enters viewport
   */
  observe(element, callback) {
    this.#elements.set(element, { callback, loaded: false });
    this.#observer.observe(element);
  }
  
  /**
   * Stop observing an element
   * @param {Element} element - DOM element
   */
  unobserve(element) {
    this.#elements.delete(element);
    this.#observer.unobserve(element);
  }
  
  /**
   * Disconnect the observer
   */
  disconnect() {
    this.#elements.clear();
    this.#observer.disconnect();
  }
  
  /**
   * Get number of observed elements
   * @returns {number}
   */
  get observedCount() {
    return this.#elements.size;
  }
}

/**
 * Lazy load images with placeholder
 * @param {HTMLImageElement} img - Image element
 * @param {string} src - Image source URL
 * @param {Object} [options={}] - Options
 */
export function lazyLoadImage(img, src, options = {}) {
  const {
    placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    transition = 'opacity 0.3s'
  } = options;
  
  // Set placeholder
  img.src = placeholder;
  img.style.transition = transition;
  img.style.opacity = '0.5';
  
  // Load actual image
  const actualImage = new Image();
  actualImage.onload = () => {
    img.src = src;
    img.style.opacity = '1';
  };
  actualImage.onerror = () => {
    img.style.opacity = '1';
    img.dispatchEvent(new Event('lazyError'));
  };
  actualImage.src = src;
}

/**
 * Batch loader for loading multiple items efficiently
 */
export class BatchLoader extends EventEmitter {
  #queue;
  #processing;
  #batchSize;
  #flushInterval;
  #timer;
  
  /**
   * Create a new BatchLoader
   * @param {Object} [options={}]
   * @param {number} [options.batchSize=10] - Items per batch
   * @param {number} [options.flushInterval=100] - Flush interval in ms
   */
  constructor(options = {}) {
    super();
    
    this.#batchSize = options.batchSize || 10;
    this.#flushInterval = options.flushInterval || 100;
    this.#queue = [];
    this.#processing = false;
    this.#timer = null;
  }
  
  /**
   * Add item to batch
   * @param {*} item - Item to load
   * @param {Function} loader - Loader function
   * @returns {Promise}
   */
  add(item, loader) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ item, loader, resolve, reject });
      
      if (this.#queue.length >= this.#batchSize) {
        this.flush();
      } else if (!this.#timer) {
        this.#timer = setTimeout(() => this.flush(), this.#flushInterval);
      }
    });
  }
  
  /**
   * Flush the queue
   */
  async flush() {
    if (this.#processing || this.#queue.length === 0) return;
    
    this.#processing = true;
    clearTimeout(this.#timer);
    this.#timer = null;
    
    const batch = this.#queue.splice(0, this.#batchSize);
    
    this.emit('flush', batch.length);
    
    try {
      // Group by loader function
      const byLoader = new Map();
      batch.forEach(({ item, loader, resolve, reject }) => {
        if (!byLoader.has(loader)) {
          byLoader.set(loader, []);
        }
        byLoader.get(loader).push({ item, resolve, reject });
      });
      
      // Process each loader group
      await Promise.all(
        Array.from(byLoader.entries()).map(async ([loader, items]) => {
          try {
            const results = await loader(items.map(i => i.item));
            items.forEach(({ resolve }, index) => {
              resolve(results[index]);
            });
          } catch (error) {
            items.forEach(({ reject }) => reject(error));
          }
        })
      );
      
      this.emit('flushed', batch.length);
    } catch (error) {
      this.emit('error', error);
      batch.forEach(({ reject }) => reject(error));
    } finally {
      this.#processing = false;
      
      // Process remaining items
      if (this.#queue.length > 0) {
        this.flush();
      }
    }
  }
  
  /**
   * Clear the queue
   */
  clear() {
    this.#queue = [];
    clearTimeout(this.#timer);
    this.#timer = null;
  }
  
  /**
   * Get queue size
   * @returns {number}
   */
  get queueSize() {
    return this.#queue.length;
  }
}

/**
 * Prefetch resources for anticipated navigation
 * @param {string[]} urls - URLs to prefetch
 * @param {Object} [options={}] - Options
 */
export function prefetch(urls, options = {}) {
  const { 
    as = 'script',
    priority = 'low'
  } = options;
  
  const urlArray = Array.isArray(urls) ? urls : [urls];
  
  // Use requestIdleCallback if available
  const schedule = window.requestIdleCallback || 
    ((cb) => setTimeout(cb, 1));
  
  schedule(() => {
    urlArray.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      link.as = as;
      
      if (priority === 'high') {
        link.setAttribute('importance', 'high');
      }
      
      document.head.appendChild(link);
    });
  });
}

/**
 * Preload critical resources
 * @param {string[]} urls - URLs to preload
 * @param {Object} [options={}] - Options
 */
export function preload(urls, options = {}) {
  const { as = 'script' } = options;
  const urlArray = Array.isArray(urls) ? urls : [urls];
  
  urlArray.forEach(url => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = url;
    link.as = as;
    document.head.appendChild(link);
  });
}

// Global viewport lazy loader instance
export const viewportLazyLoader = typeof window !== 'undefined' 
  ? new ViewportLazyLoader() 
  : null;

export default {
  lazyLoad,
  lazyComponent,
  lazyData,
  ViewportLazyLoader,
  lazyLoadImage,
  BatchLoader,
  prefetch,
  preload,
  viewportLazyLoader
};
