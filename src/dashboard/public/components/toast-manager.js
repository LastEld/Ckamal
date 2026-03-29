/**
 * CogniMesh v5.0 - Toast Manager
 * Global singleton for managing toast notifications across the dashboard
 */

/* global Toast */

class ToastManager {
  constructor() {
    // Container elements for different positions
    this.containers = new Map();
    
    // Track active toasts
    this.toasts = new Map();
    
    // Default configuration
    this.config = {
      maxToasts: 5,
      defaultDuration: 4000,
      defaultPosition: 'top-right',
      showProgress: true,
      pauseOnHover: true,
      dismissible: true,
      newestOnTop: false,
    };

    // Valid positions
    this.validPositions = [
      'top-left',
      'top-right',
      'top-center',
      'bottom-left',
      'bottom-right',
      'bottom-center'
    ];

    // Initialize containers
    this.init();
  }

  /**
   * Initialize ToastManager - create container elements
   */
  init() {
    // Create containers for each position if they don't exist
    this.validPositions.forEach(position => {
      this.createContainer(position);
    });
  }

  /**
   * Create a container for a specific position
   */
  createContainer(position) {
    let container = document.getElementById(`toast-container-${position}`);
    
    if (!container) {
      container = document.createElement('div');
      container.id = `toast-container-${position}`;
      container.className = `toast-container toast-container-${position}`;
      container.setAttribute('role', 'region');
      container.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(container);
    }
    
    this.containers.set(position, container);
    return container;
  }

  /**
   * Get or create container for a position
   */
  getContainer(position = this.config.defaultPosition) {
    // Validate position
    if (!this.validPositions.includes(position)) {
      console.warn(`Invalid toast position: ${position}. Using default.`);
      position = this.config.defaultPosition;
    }

    let container = this.containers.get(position);
    if (!container || !document.body.contains(container)) {
      container = this.createContainer(position);
    }
    return container;
  }

  /**
   * Register a toast with the manager
   */
  registerToast(toast) {
    this.toasts.set(toast.id, toast);
    
    // Enforce max toasts limit per position
    this.enforceMaxToasts(toast.position);
  }

  /**
   * Remove a toast from tracking
   */
  removeToast(toast) {
    this.toasts.delete(toast.id);
  }

  /**
   * Enforce maximum number of toasts per position
   */
  enforceMaxToasts(position) {
    const positionToasts = Array.from(this.toasts.values())
      .filter(t => t.position === position);
    
    if (positionToasts.length > this.config.maxToasts) {
      // Remove oldest toasts (FIFO unless newestOnTop)
      const toastsToRemove = positionToasts
        .slice(0, positionToasts.length - this.config.maxToasts);
      
      toastsToRemove.forEach(toast => {
        toast.dismiss();
      });
    }
  }

  /**
   * Clear all toasts
   */
  clearAll() {
    this.toasts.forEach(toast => {
      toast.dismiss();
    });
    this.toasts.clear();
  }

  /**
   * Clear toasts by position
   */
  clearByPosition(position) {
    this.toasts.forEach(toast => {
      if (toast.position === position) {
        toast.dismiss();
      }
    });
  }

  /**
   * Clear toasts by type
   */
  clearByType(type) {
    this.toasts.forEach(toast => {
      if (toast.type === type) {
        toast.dismiss();
      }
    });
  }

  /**
   * Update global configuration
   */
  configure(options = {}) {
    Object.assign(this.config, options);
    return this;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get count of active toasts
   */
  getCount() {
    return this.toasts.size;
  }

  /**
   * Get count by position
   */
  getCountByPosition(position) {
    return Array.from(this.toasts.values()).filter(t => t.position === position).length;
  }

  // ==========================================
  // Convenience methods for showing toasts
  // ==========================================

  /**
   * Show a toast with full options
   */
  show(options = {}) {
    const mergedOptions = {
      duration: this.config.defaultDuration,
      showProgress: this.config.showProgress,
      pauseOnHover: this.config.pauseOnHover,
      dismissible: this.config.dismissible,
      position: this.config.defaultPosition,
      ...options,
    };

    const toast = new Toast(mergedOptions);
    this.registerToast(toast);
    toast.show();
    return toast;
  }

  /**
   * Show an info toast
   */
  info(message, options = {}) {
    return this.show({ ...options, message, type: 'info' });
  }

  /**
   * Show a success toast
   */
  success(message, options = {}) {
    return this.show({ ...options, message, type: 'success' });
  }

  /**
   * Show a warning toast
   */
  warning(message, options = {}) {
    return this.show({ ...options, message, type: 'warning' });
  }

  /**
   * Show an error toast
   */
  error(message, options = {}) {
    return this.show({ 
      ...options, 
      message, 
      type: 'error',
      duration: options.duration ?? 6000
    });
  }

  /**
   * Show a toast with promise (loading -> success/error)
   */
  promise(promise, options = {}) {
    const toast = Toast.promise(promise, options);
    this.registerToast(toast);
    return toast;
  }

  /**
   * Show a confirmation toast with action buttons
   */
  confirm(message, options = {}) {
    const { onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel', title = 'Confirm' } = options;
    
    const toast = this.show({
      title,
      message,
      type: 'warning',
      duration: 0, // No auto-dismiss
      dismissible: false,
      showProgress: false,
      action: {
        label: confirmLabel,
        onClick: () => {
          toast.dismiss();
          if (onConfirm) onConfirm();
        }
      },
    });

    // Add cancel button
    const content = toast.element?.querySelector('.toast-content');
    if (content) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'toast-action toast-action-secondary';
      cancelBtn.textContent = cancelLabel;
      cancelBtn.addEventListener('click', () => {
        toast.dismiss();
        if (onCancel) onCancel();
      });
      content.appendChild(cancelBtn);
    }

    return toast;
  }

  /**
   * Batch show multiple toasts
   */
  batch(toasts, options = {}) {
    const { stagger = 100 } = options;
    
    toasts.forEach((toastConfig, index) => {
      setTimeout(() => {
        this.show(typeof toastConfig === 'string' 
          ? { message: toastConfig } 
          : toastConfig
        );
      }, index * stagger);
    });
  }
}

// Create singleton instance
const toastManager = new ToastManager();

// Static accessors for default position and config
ToastManager.defaultPosition = 'top-right';
ToastManager.maxToasts = 5;

// Export
if (typeof window !== 'undefined') {
  window.ToastManager = ToastManager;
  window.toastManager = toastManager;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ToastManager, toastManager };
}
