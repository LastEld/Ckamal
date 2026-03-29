/**
 * @fileoverview Lazy Loading Component for Dashboard
 * @module dashboard/components/lazy-component
 * @description Lazy loading wrapper for dashboard components
 * @version 5.0.0
 */

/**
 * Lazy Component Loader
 * Delays loading of heavy components until they're needed
 */
export class LazyComponentLoader {
  /**
   * Create a new LazyComponentLoader
   * @param {Object} options - Loader options
   */
  constructor(options = {}) {
    this.options = {
      rootMargin: '100px',
      threshold: 0.01,
      loadingDelay: 100,
      preloadDistance: 200,
      ...options
    };

    this.observer = null;
    this.componentRegistry = new Map();
    this.loadedComponents = new Set();
    this.loadingQueue = new Map();
  }

  /**
   * Initialize the lazy loader
   */
  init() {
    if (!('IntersectionObserver' in window)) {
      // Fallback: load all components immediately
      this.loadAll();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      {
        rootMargin: this.options.rootMargin,
        threshold: this.options.threshold
      }
    );

    // Register all lazy components
    this.registerComponents();
  }

  /**
   * Register components for lazy loading
   */
  registerComponents() {
    const lazyElements = document.querySelectorAll('[data-lazy-component]');
    
    lazyElements.forEach(element => {
      const componentName = element.dataset.lazyComponent;
      const priority = element.dataset.priority || 'normal';
      
      this.componentRegistry.set(element, {
        name: componentName,
        priority,
        loaded: false
      });

      this.observer.observe(element);
    });
  }

  /**
   * Handle intersection changes
   * @param {IntersectionObserverEntry[]} entries
   */
  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const config = this.componentRegistry.get(element);

        if (config && !config.loaded && !this.loadingQueue.has(element)) {
          this.queueComponentLoad(element, config);
        }
      }
    });
  }

  /**
   * Queue component for loading
   * @param {Element} element - DOM element
   * @param {Object} config - Component configuration
   */
  queueComponentLoad(element, config) {
    // Delay loading for smoother UX
    const delay = config.priority === 'high' ? 0 : this.options.loadingDelay;

    const timeoutId = setTimeout(() => {
      this.loadComponent(element, config);
      this.loadingQueue.delete(element);
    }, delay);

    this.loadingQueue.set(element, timeoutId);
  }

  /**
   * Load a component
   * @param {Element} element - DOM element
   * @param {Object} config - Component configuration
   */
  async loadComponent(element, config) {
    if (config.loaded) return;

    try {
      // Show loading state
      this.showLoadingState(element);

      // Load component module
      const component = await this.importComponent(config.name);

      // Render component
      await this.renderComponent(element, component);

      // Mark as loaded
      config.loaded = true;
      this.loadedComponents.add(config.name);

      // Stop observing
      this.observer.unobserve(element);

      // Dispatch event
      element.dispatchEvent(new CustomEvent('componentLoaded', {
        detail: { name: config.name }
      }));

    } catch (error) {
      console.error(`[LazyComponent] Failed to load ${config.name}:`, error);
      this.showErrorState(element, error);
    }
  }

  /**
   * Import component module
   * @param {string} name - Component name
   * @returns {Promise<Object>}
   */
  async importComponent(name) {
    const componentMap = {
      'analytics': () => import('./analytics-component.js'),
      'agents': () => import('./agents-component.js'),
      'tasks': () => import('./tasks-component.js'),
      'roadmaps': () => import('./roadmaps-component.js'),
      'workflows': () => import('./workflows-component.js'),
      'alerts': () => import('./alerts-component.js'),
      'cost-widget': () => import('./cost-widget.js'),
      'performance-chart': () => import('./performance-chart.js'),
      'org-chart': () => import('./org-chart.js'),
      'system-health': () => import('./system-health.js'),
      'providers': () => import('./providers-component.js'),
      'presence': () => import('./presence-component.js'),
      'context': () => import('./context-component.js'),
      'cv': () => import('./cv-component.js'),
      'skills': () => import('./skills-component.js')
    };

    const loader = componentMap[name];
    if (!loader) {
      throw new Error(`Unknown component: ${name}`);
    }

    const module = await loader();
    return module.default || module;
  }

  /**
   * Render component into element
   * @param {Element} element - DOM element
   * @param {Object} component - Component module
   */
  async renderComponent(element, component) {
    // Clear loading state
    element.innerHTML = '';

    // Check if component has a mount method
    if (typeof component.mount === 'function') {
      await component.mount(element);
    } else if (typeof component === 'function') {
      // Component is a constructor/function
      const instance = new component(element);
      if (instance.init) await instance.init();
    } else {
      // Component is HTML content
      element.innerHTML = component;
    }

    // Add loaded class for animations
    element.classList.add('lazy-loaded');
  }

  /**
   * Show loading state
   * @param {Element} element - DOM element
   */
  showLoadingState(element) {
    element.classList.add('lazy-loading');
    
    // Add skeleton loader if not present
    if (!element.querySelector('.skeleton-loader')) {
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton-loader';
      skeleton.innerHTML = `
        <div class="skeleton-header"></div>
        <div class="skeleton-content">
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      `;
      element.appendChild(skeleton);
    }
  }

  /**
   * Show error state
   * @param {Element} element - DOM element
   * @param {Error} error - Error object
   */
  showErrorState(element, error) {
    element.classList.remove('lazy-loading');
    element.classList.add('lazy-error');
    element.innerHTML = `
      <div class="lazy-error-message">
        <span class="error-icon">⚠️</span>
        <p>Failed to load component</p>
        <button onclick="this.closest('[data-lazy-component]').lazyRetry()">
          Retry
        </button>
      </div>
    `;

    // Add retry method
    element.lazyRetry = () => {
      element.classList.remove('lazy-error');
      const config = this.componentRegistry.get(element);
      if (config) {
        config.loaded = false;
        this.loadComponent(element, config);
      }
    };
  }

  /**
   * Preload components that are close to viewport
   */
  preloadNearViewport() {
    const scrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    const preloadZone = viewportHeight + this.options.preloadDistance;

    this.componentRegistry.forEach((config, element) => {
      if (config.loaded) return;

      const rect = element.getBoundingClientRect();
      const elementTop = rect.top + scrollY;

      // Element is close to viewport
      if (elementTop < preloadZone) {
        this.queueComponentLoad(element, config);
      }
    });
  }

  /**
   * Load all components immediately
   */
  async loadAll() {
    const promises = [];
    
    this.componentRegistry.forEach((config, element) => {
      if (!config.loaded) {
        promises.push(this.loadComponent(element, config));
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get loading statistics
   * @returns {Object}
   */
  getStats() {
    const total = this.componentRegistry.size;
    const loaded = this.loadedComponents.size;
    
    return {
      total,
      loaded,
      pending: total - loaded,
      loading: this.loadingQueue.size,
      progress: total > 0 ? (loaded / total * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * Destroy the loader
   */
  destroy() {
    // Cancel pending loads
    this.loadingQueue.forEach(timeoutId => clearTimeout(timeoutId));
    this.loadingQueue.clear();

    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
    }

    // Clear registry
    this.componentRegistry.clear();
    this.loadedComponents.clear();
  }
}

// Create global instance
export const lazyLoader = new LazyComponentLoader();

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => lazyLoader.init());
  } else {
    lazyLoader.init();
  }

  // Preload on scroll (throttled)
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      lazyLoader.preloadNearViewport();
    }, 100);
  }, { passive: true });
}

// Export for manual initialization
export default LazyComponentLoader;
