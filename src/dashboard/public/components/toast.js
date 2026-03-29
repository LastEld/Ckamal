/**
 * CogniMesh v5.0 - Comprehensive Toast Notification System
 * Enhanced Toast class with progress bar, pause on hover, positioning, and animations
 */

/* global ToastManager */

class Toast {
  /**
   * Create a new Toast instance
   * @param {Object} options - Toast configuration options
   * @param {string} options.message - The message to display
   * @param {string} options.title - Optional title for the toast
   * @param {string} options.type - Toast type: 'info', 'success', 'warning', 'error'
   * @param {number} options.duration - Duration in milliseconds (0 for no auto-dismiss)
   * @param {boolean} options.showProgress - Whether to show progress bar
   * @param {boolean} options.pauseOnHover - Whether to pause timer on hover
   * @param {boolean} options.dismissible - Whether toast can be manually dismissed
   * @param {Function} options.onDismiss - Callback when toast is dismissed
   * @param {Function} options.onClick - Callback when toast is clicked
   * @param {string} options.position - Position override for this toast
   * @param {string} options.icon - Custom icon name (lucide icon)
   * @param {Object} options.action - Action button { label, onClick, href }
   */
  constructor(options = {}) {
    this.id = Toast.generateId();
    this.message = options.message || '';
    this.title = options.title || '';
    this.type = options.type || 'info';
    this.duration = options.duration ?? 4000;
    this.showProgress = options.showProgress ?? true;
    this.pauseOnHover = options.pauseOnHover ?? true;
    this.dismissible = options.dismissible ?? true;
    this.onDismiss = options.onDismiss || null;
    this.onClick = options.onClick || null;
    this.position = options.position || ToastManager.defaultPosition;
    this.customIcon = options.icon || null;
    this.action = options.action || null;

    // Timer state
    this.remainingTime = this.duration;
    this.startTime = null;
    this.timerId = null;
    this.isPaused = false;
    this.isDismissed = false;

    // DOM elements
    this.element = null;
    this.progressBar = null;

    // Bind methods
    this.handleMouseEnter = this.handleMouseEnter.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleDismissClick = this.handleDismissClick.bind(this);
  }

  /**
   * Generate unique ID for toast
   */
  static generateId() {
    return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get icon name based on toast type
   */
  getIconName() {
    if (this.customIcon) return this.customIcon;
    
    const icons = {
      success: 'check-circle',
      error: 'x-circle',
      warning: 'alert-triangle',
      info: 'info',
    };
    return icons[this.type] || 'info';
  }

  /**
   * Create toast DOM element
   */
  createElement() {
    const toast = document.createElement('div');
    toast.className = `toast toast-${this.type}`;
    toast.id = this.id;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    // Build content
    const iconHtml = `<div class="toast-icon"><i data-lucide="${this.getIconName()}"></i></div>`;
    
    let contentHtml = '<div class="toast-content">';
    if (this.title) {
      contentHtml += `<div class="toast-title">${Toast.escapeHtml(this.title)}</div>`;
    }
    contentHtml += `<div class="toast-message">${Toast.escapeHtml(this.message)}</div>`;
    
    // Add action button if provided
    if (this.action) {
      const actionTag = this.action.href ? 'a' : 'button';
      const hrefAttr = this.action.href ? `href="${this.action.href}"` : '';
      contentHtml += `
        <${actionTag} ${hrefAttr} class="toast-action">
          ${Toast.escapeHtml(this.action.label)}
        </${actionTag}>
      `;
    }
    
    contentHtml += '</div>';

    const dismissHtml = this.dismissible 
      ? `<button class="toast-close" aria-label="Dismiss notification"><i data-lucide="x"></i></button>`
      : '';

    toast.innerHTML = iconHtml + contentHtml + dismissHtml;

    // Add progress bar
    if (this.showProgress && this.duration > 0) {
      const progressContainer = document.createElement('div');
      progressContainer.className = 'toast-progress-container';
      
      this.progressBar = document.createElement('div');
      this.progressBar.className = 'toast-progress-bar';
      this.progressBar.style.width = '100%';
      
      progressContainer.appendChild(this.progressBar);
      toast.appendChild(progressContainer);
    }

    // Add event listeners
    if (this.pauseOnHover && this.duration > 0) {
      toast.addEventListener('mouseenter', this.handleMouseEnter);
      toast.addEventListener('mouseleave', this.handleMouseLeave);
    }

    if (this.onClick) {
      toast.addEventListener('click', this.handleClick);
      toast.style.cursor = 'pointer';
    }

    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', this.handleDismissClick);
    }

    // Handle action click
    const actionBtn = toast.querySelector('.toast-action');
    if (actionBtn && this.action?.onClick) {
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.action.onClick(e);
        this.dismiss();
      });
    }

    this.element = toast;
    return toast;
  }

  /**
   * Show the toast
   */
  show() {
    const container = ToastManager.getContainer(this.position);
    const element = this.createElement();
    
    container.appendChild(element);

    // Initialize lucide icons
    if (typeof window.lucide?.createIcons === 'function') {
      window.lucide.createIcons({ nodes: [element] });
    }

    // Trigger animation
    requestAnimationFrame(() => {
      element.classList.add('toast-visible');
    });

    // Start timer
    if (this.duration > 0) {
      this.startTimer();
    }

    return this;
  }

  /**
   * Start the auto-dismiss timer
   */
  startTimer() {
    this.startTime = Date.now();
    this.isPaused = false;

    this.timerId = setTimeout(() => {
      this.dismiss();
    }, this.remainingTime);

    // Animate progress bar
    if (this.progressBar) {
      this.progressBar.style.transition = `width ${this.remainingTime}ms linear`;
      requestAnimationFrame(() => {
        if (this.progressBar) {
          this.progressBar.style.width = '0%';
        }
      });
    }
  }

  /**
   * Pause the timer (on hover)
   */
  pauseTimer() {
    if (this.isPaused || this.isDismissed || !this.timerId) return;

    clearTimeout(this.timerId);
    this.timerId = null;

    // Calculate remaining time
    const elapsed = Date.now() - this.startTime;
    this.remainingTime = Math.max(0, this.remainingTime - elapsed);

    // Pause progress bar
    if (this.progressBar) {
      const computedStyle = window.getComputedStyle(this.progressBar);
      const currentWidth = computedStyle.width;
      this.progressBar.style.transition = 'none';
      this.progressBar.style.width = currentWidth;
    }

    this.isPaused = true;
  }

  /**
   * Resume the timer (after hover)
   */
  resumeTimer() {
    if (!this.isPaused || this.isDismissed || this.remainingTime <= 0) return;

    this.startTimer();
    this.isPaused = false;
  }

  /**
   * Handle mouse enter
   */
  handleMouseEnter() {
    this.pauseTimer();
    this.element?.classList.add('toast-paused');
  }

  /**
   * Handle mouse leave
   */
  handleMouseLeave() {
    this.resumeTimer();
    this.element?.classList.remove('toast-paused');
  }

  /**
   * Handle click on toast
   */
  handleClick(e) {
    // Don't trigger if clicking close button or action
    if (e.target.closest('.toast-close') || e.target.closest('.toast-action')) {
      return;
    }
    if (this.onClick) {
      this.onClick(e);
    }
  }

  /**
   * Handle dismiss button click
   */
  handleDismissClick(e) {
    e.stopPropagation();
    this.dismiss();
  }

  /**
   * Dismiss the toast
   */
  dismiss() {
    if (this.isDismissed) return;
    this.isDismissed = true;

    // Clear timer
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    // Call callback
    if (this.onDismiss) {
      this.onDismiss(this);
    }

    // Animate out
    if (this.element) {
      this.element.classList.remove('toast-visible');
      this.element.classList.add('toast-hiding');
      
      // Remove from DOM after animation
      setTimeout(() => {
        this.remove();
      }, 300);
    }

    // Remove from manager
    ToastManager.removeToast(this);
  }

  /**
   * Remove from DOM immediately
   */
  remove() {
    if (this.element && this.element.parentNode) {
      this.element.removeEventListener('mouseenter', this.handleMouseEnter);
      this.element.removeEventListener('mouseleave', this.handleMouseLeave);
      this.element.removeEventListener('click', this.handleClick);
      
      const closeBtn = this.element.querySelector('.toast-close');
      if (closeBtn) {
        closeBtn.removeEventListener('click', this.handleDismissClick);
      }

      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.progressBar = null;
  }

  /**
   * Update toast message
   */
  updateMessage(message) {
    this.message = message;
    const messageEl = this.element?.querySelector('.toast-message');
    if (messageEl) {
      messageEl.textContent = message;
    }
  }

  /**
   * Update toast title
   */
  updateTitle(title) {
    this.title = title;
    let titleEl = this.element?.querySelector('.toast-title');
    
    if (!titleEl && title) {
      // Create title element if it doesn't exist
      const contentEl = this.element?.querySelector('.toast-content');
      if (contentEl) {
        titleEl = document.createElement('div');
        titleEl.className = 'toast-title';
        contentEl.insertBefore(titleEl, contentEl.firstChild);
      }
    }
    
    if (titleEl) {
      titleEl.textContent = title;
    }
  }

  /**
   * Utility: Escape HTML to prevent XSS
   */
  static escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================
  // Static factory methods for quick creation
  // ==========================================

  /**
   * Show an info toast
   */
  static info(message, options = {}) {
    const toast = new Toast({ ...options, message, type: 'info' });
    return toast.show();
  }

  /**
   * Show a success toast
   */
  static success(message, options = {}) {
    const toast = new Toast({ ...options, message, type: 'success' });
    return toast.show();
  }

  /**
   * Show a warning toast
   */
  static warning(message, options = {}) {
    const toast = new Toast({ ...options, message, type: 'warning' });
    return toast.show();
  }

  /**
   * Show an error toast
   */
  static error(message, options = {}) {
    const toast = new Toast({ 
      ...options, 
      message, 
      type: 'error',
      duration: options.duration ?? 6000 // Longer duration for errors
    });
    return toast.show();
  }

  /**
   * Show a toast with custom configuration
   */
  static show(message, type = 'info', duration = 4000) {
    const toast = new Toast({ message, type, duration });
    return toast.show();
  }

  /**
   * Create a promise toast that shows loading state
   */
  static promise(promise, options = {}) {
    const { loading = 'Loading...', success = 'Success!', error = 'Error occurred', duration = 3000 } = options;
    
    const toast = new Toast({
      message: loading,
      type: 'info',
      duration: 0, // No auto-dismiss
      showProgress: false,
      dismissible: false,
      icon: 'loader-2',
    });
    
    toast.show();
    
    // Add spinning animation to icon
    const iconEl = toast.element?.querySelector('.toast-icon i');
    if (iconEl) {
      iconEl.classList.add('toast-spin');
    }

    promise
      .then((result) => {
        toast.updateMessage(typeof success === 'function' ? success(result) : success);
        toast.element?.classList.remove('toast-info');
        toast.element?.classList.add('toast-success');
        
        // Update icon
        if (iconEl) {
          iconEl.classList.remove('toast-spin');
          iconEl.setAttribute('data-lucide', 'check-circle');
          if (typeof window.lucide?.createIcons === 'function') {
            window.lucide.createIcons({ nodes: [toast.element] });
          }
        }
        
        toast.duration = duration;
        toast.dismissible = true;
        
        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.setAttribute('aria-label', 'Dismiss notification');
        closeBtn.innerHTML = '<i data-lucide="x"></i>';
        closeBtn.addEventListener('click', () => toast.dismiss());
        toast.element?.appendChild(closeBtn);
        
        if (typeof window.lucide?.createIcons === 'function') {
          window.lucide.createIcons({ nodes: [toast.element] });
        }
        
        toast.startTimer();
        return result;
      })
      .catch((err) => {
        toast.updateMessage(typeof error === 'function' ? error(err) : error);
        toast.element?.classList.remove('toast-info');
        toast.element?.classList.add('toast-error');
        
        // Update icon
        if (iconEl) {
          iconEl.classList.remove('toast-spin');
          iconEl.setAttribute('data-lucide', 'x-circle');
          if (typeof window.lucide?.createIcons === 'function') {
            window.lucide.createIcons({ nodes: [toast.element] });
          }
        }
        
        toast.duration = duration;
        toast.dismissible = true;
        
        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.setAttribute('aria-label', 'Dismiss notification');
        closeBtn.innerHTML = '<i data-lucide="x"></i>';
        closeBtn.addEventListener('click', () => toast.dismiss());
        toast.element?.appendChild(closeBtn);
        
        if (typeof window.lucide?.createIcons === 'function') {
          window.lucide.createIcons({ nodes: [toast.element] });
        }
        
        toast.startTimer();
        throw err;
      });

    return toast;
  }
}

// Export for module systems
if (typeof window !== 'undefined') {
  window.Toast = Toast;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Toast };
}
