/**
 * Mobile Bottom Navigation Component
 * Provides iOS-style bottom navigation with hide-on-scroll behavior
 */

/* global lucide */

(function() {
  'use strict';

  // Navigation configuration
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Home', icon: 'layout-dashboard', view: 'dashboard', badge: null },
    { id: 'tasks', label: 'Tasks', icon: 'check-square', view: 'tasks', badge: 'taskBadge' },
    { id: 'agents', label: 'Agents', icon: 'bot', view: 'agents', badge: null },
    { id: 'alerts', label: 'Issues', icon: 'bell', view: 'alerts', badge: 'alertBadge' },
    { id: 'menu', label: 'Menu', icon: 'menu', view: null, badge: null }
  ];

  // Scroll handling state
  let lastScrollY = 0;
  let ticking = false;
  let hideThreshold = 50;
  let showThreshold = 10;
  let isVisible = true;

  /**
   * Initialize the mobile navigation
   */
  function init() {
    const container = document.getElementById('mobileNav');
    if (!container) {
      console.warn('[MobileNav] Container not found');
      return;
    }

    render(container);
    setupEventListeners();
    updateBadges();
    
    // Expose API
    window.MobileNav = {
      setActive,
      updateBadge,
      show,
      hide,
      isVisible: () => isVisible
    };

    console.log('[MobileNav] Initialized');
  }

  /**
   * Render the navigation HTML
   */
  function render(container) {
    container.innerHTML = `
      <nav class="mobile-bottom-nav" id="mobileBottomNav" aria-label="Mobile navigation">
        <div class="mobile-nav-items">
          ${NAV_ITEMS.map(item => `
            <button 
              type="button"
              class="mobile-nav-item" 
              data-view="${item.view || ''}"
              data-id="${item.id}"
              aria-label="${item.label}"
            >
              <span class="mobile-nav-icon-wrapper">
                <i data-lucide="${item.icon}" class="mobile-nav-icon"></i>
                ${item.badge ? `<span class="mobile-nav-badge" id="mobileBadge-${item.id}"></span>` : ''}
              </span>
              <span class="mobile-nav-label">${item.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="mobile-nav-safe-area"></div>
      </nav>
    `;

    // Initialize Lucide icons
    if (window.lucide) {
      lucide.createIcons({ container });
    }

    // Set initial active state from current sidebar/nav selection
    const activeSidebar = document.querySelector('.nav-item.active .nav-link')?.dataset?.view || 'dashboard';
    const activeItem = NAV_ITEMS.find((item) => item.view === activeSidebar)?.id || 'dashboard';
    setActive(activeItem);
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    const nav = document.getElementById('mobileBottomNav');
    if (!nav) return;

    // Handle navigation item clicks
    nav.addEventListener('click', (e) => {
      const item = e.target.closest('.mobile-nav-item');
      if (!item) return;

      const view = item.dataset.view;
      const id = item.dataset.id;

      if (id === 'menu') {
        toggleMobileSidebar();
        return;
      }

      if (view) {
        navigateToView(view);
        setActive(id);
      }
    });

    // Handle scroll for hide/show behavior
    const viewContainer = document.getElementById('viewContainer');
    if (viewContainer) {
      viewContainer.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Also listen on window for document scroll
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Handle visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        show();
      }
    });

    // Listen for badge updates from the app
    document.addEventListener('badge:updated', (e) => {
      const { type, count } = e.detail || {};
      if (type && count !== undefined) {
        updateBadge(type, count);
      }
    });
  }

  /**
   * Handle scroll events for hide/show behavior
   */
  function handleScroll() {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateVisibility();
        ticking = false;
      });
      ticking = true;
    }
  }

  /**
   * Update navigation visibility based on scroll direction
   */
  function updateVisibility() {
    const viewContainer = document.getElementById('viewContainer');
    const currentScrollY = viewContainer ? viewContainer.scrollTop : window.scrollY;
    
    // Determine scroll direction and delta
    const scrollDelta = currentScrollY - lastScrollY;
    const isScrollingDown = scrollDelta > 0;
    const isScrollingUp = scrollDelta < 0;
    const isNearTop = currentScrollY < hideThreshold;

    // Show when near top
    if (isNearTop && !isVisible) {
      show();
    }
    // Hide when scrolling down past threshold
    else if (isScrollingDown && scrollDelta > hideThreshold && isVisible && !isNearTop) {
      hide();
    }
    // Show when scrolling up past threshold
    else if (isScrollingUp && Math.abs(scrollDelta) > showThreshold && !isVisible) {
      show();
    }

    lastScrollY = currentScrollY;
  }

  /**
   * Show the navigation
   */
  function show() {
    const nav = document.getElementById('mobileBottomNav');
    if (nav) {
      nav.classList.remove('hidden');
      isVisible = true;
    }
  }

  /**
   * Hide the navigation
   */
  function hide() {
    const nav = document.getElementById('mobileBottomNav');
    if (nav) {
      nav.classList.add('hidden');
      isVisible = false;
    }
  }

  /**
   * Set the active navigation item
   */
  function setActive(itemId) {
    const nav = document.getElementById('mobileBottomNav');
    if (!nav) return;

    // Remove active from all items
    nav.querySelectorAll('.mobile-nav-item').forEach(item => {
      item.classList.remove('active');
    });

    // Add active to current item
    const activeItem = nav.querySelector(`[data-id="${itemId}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }
  }

  /**
   * Navigate to a view
   */
  function navigateToView(viewName) {
    // Close mobile sidebar if open
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.remove('mobile-open');
    }

    // Use the active dashboard app instance when available
    if (window.dashboardApp && typeof window.dashboardApp.navigateTo === 'function') {
      window.dashboardApp.navigateTo(viewName);
      const activeId = NAV_ITEMS.find((item) => item.view === viewName)?.id;
      if (activeId) setActive(activeId);
    } else {
      // Fallback: manual view switching
      switchViewFallback(viewName);
    }
  }

  /**
   * Fallback view switching
   */
  function switchViewFallback(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });

    // Show target view
    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) {
      targetView.classList.add('active');
    }

    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
      pageTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    }

    // Update sidebar nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      const link = item.querySelector('.nav-link');
      if (link && link.dataset.view === viewName) {
        item.classList.add('active');
      }
    });
  }

  /**
   * Toggle mobile sidebar
   */
  function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('mobile-open');
    }
  }

  /**
   * Update badge count for a navigation item
   */
  function updateBadge(itemId, count) {
    const badge = document.getElementById(`mobileBadge-${itemId}`);
    if (!badge) return;

    if (count && count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.add('visible');
    } else {
      badge.textContent = '';
      badge.classList.remove('visible');
    }
  }

  /**
   * Update all badges from DOM elements
   */
  function updateBadges() {
    // Map badge element IDs to nav item IDs
    const badgeMap = {
      'taskBadge': 'tasks',
      'alertBadge': 'alerts'
    };

    Object.entries(badgeMap).forEach(([elementId, navId]) => {
      const element = document.getElementById(elementId);
      if (element) {
        const count = parseInt(element.textContent, 10) || 0;
        updateBadge(navId, count);
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
