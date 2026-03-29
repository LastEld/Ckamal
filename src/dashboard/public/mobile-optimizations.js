/**
 * CogniMesh Dashboard - Mobile Optimizations
 * Touch gestures, pull-to-refresh, native-like transitions
 * 
 * @version 1.0.0
 */

(function() {
  'use strict';

  // ============================================
  // Configuration
  // ============================================
  
  const CONFIG = {
    touch: {
      tapThreshold: 10,
      swipeThreshold: 50,
      longPressDelay: 500,
      doubleTapDelay: 300
    },
    pullToRefresh: {
      threshold: 80,
      maxPull: 120,
      resistance: 0.7
    },
    transitions: {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    },
    haptics: {
      enabled: true,
      light: 10,
      medium: 20,
      heavy: 30
    }
  };

  // ============================================
  // State Management
  // ============================================
  
  const state = {
    touchStart: null,
    touchCurrent: null,
    isPulling: false,
    isSwiping: false,
    pullDistance: 0,
    longPressTimer: null,
    lastTapTime: 0,
    activeGestures: new Set(),
    scrollY: 0
  };

  // ============================================
  // Initialization
  // ============================================
  
  function init() {
    if (!isTouchDevice()) {
      console.log('[MobileOpt] Touch device not detected, skipping mobile optimizations');
      return;
    }

    console.log('[MobileOpt] Initializing mobile optimizations');
    
    // Add mobile class to body
    document.body.classList.add('mobile-optimized');
    
    // Initialize all features
    initTouchGestures();
    initPullToRefresh();
    initNativeTransitions();
    initHapticFeedback();
    initViewportFixes();
    initFastClick();
    initSwipeNavigation();
    initGestureHints();
    
    // Expose API
    window.MobileOptimizations = {
      config: CONFIG,
      vibrate,
      animateTransition,
      disablePullToRefresh,
      enablePullToRefresh,
      isActive: () => document.body.classList.contains('mobile-optimized')
    };
  }

  // ============================================
  // Touch Gestures
  // ============================================
  
  function initTouchGestures() {
    const app = document.getElementById('app');
    if (!app) return;

    // Touch start
    app.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // Touch move
    app.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    // Touch end
    app.addEventListener('touchend', handleTouchEnd, { passive: true });
    app.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    // Prevent default touch behaviors that interfere
    document.addEventListener('touchmove', preventOverscroll, { passive: false });
  }

  function handleTouchStart(e) {
    const touch = e.touches[0];
    state.touchStart = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      target: e.target
    };
    state.touchCurrent = { ...state.touchStart };
    
    // Reset pull state
    state.isPulling = false;
    state.pullDistance = 0;
    
    // Start long press timer
    state.longPressTimer = setTimeout(() => {
      triggerGesture('longpress', {
        x: touch.clientX,
        y: touch.clientY,
        target: state.touchStart.target
      });
    }, CONFIG.touch.longPressDelay);

    // Check for double tap
    const timeSinceLastTap = Date.now() - state.lastTapTime;
    if (timeSinceLastTap < CONFIG.touch.doubleTapDelay) {
      triggerGesture('doubletap', {
        x: touch.clientX,
        y: touch.clientY,
        target: state.touchStart.target
      });
      state.lastTapTime = 0;
    }
  }

  function handleTouchMove(e) {
    if (!state.touchStart) return;
    
    const touch = e.touches[0];
    state.touchCurrent = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };

    // Calculate deltas
    const deltaX = state.touchCurrent.x - state.touchStart.x;
    const deltaY = state.touchCurrent.y - state.touchStart.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Cancel long press if moving
    if (absX > CONFIG.touch.tapThreshold || absY > CONFIG.touch.tapThreshold) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }

    // Determine gesture type
    if (!state.isSwiping && !state.isPulling) {
      if (absX > absY && absX > CONFIG.touch.swipeThreshold) {
        state.isSwiping = true;
        state.activeGestures.add('swipe');
      } else if (absY > absX && deltaY > 0 && isAtTop()) {
        state.isPulling = true;
        state.activeGestures.add('pull');
      }
    }

    // Handle swipe
    if (state.isSwiping) {
      handleSwipeMove(deltaX, deltaY, e);
    }

    // Handle pull-to-refresh
    if (state.isPulling) {
      handlePullMove(deltaY, e);
    }
  }

  function handleTouchEnd(e) {
    if (!state.touchStart) return;

    const duration = Date.now() - state.touchStart.time;
    const deltaX = (state.touchCurrent?.x || state.touchStart.x) - state.touchStart.x;
    const deltaY = (state.touchCurrent?.y || state.touchStart.y) - state.touchStart.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Clear long press timer
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;

    // Handle tap
    if (absX < CONFIG.touch.tapThreshold && absY < CONFIG.touch.tapThreshold) {
      if (duration < CONFIG.touch.longPressDelay) {
        state.lastTapTime = Date.now();
        triggerGesture('tap', {
          x: state.touchStart.x,
          y: state.touchStart.y,
          target: state.touchStart.target
        });
      }
    }

    // Handle swipe end
    if (state.isSwiping) {
      handleSwipeEnd(deltaX, deltaY, duration);
    }

    // Handle pull end
    if (state.isPulling) {
      handlePullEnd(deltaY);
    }

    // Reset state
    state.touchStart = null;
    state.touchCurrent = null;
    state.isSwiping = false;
    state.isPulling = false;
    state.activeGestures.clear();
  }

  // ============================================
  // Swipe Gestures
  // ============================================
  
  function handleSwipeMove(deltaX, deltaY, e) {
    const direction = deltaX > 0 ? 'right' : 'left';
    
    // Prevent default for horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      e.preventDefault();
    }

    // Emit swipe move event
    dispatchCustomEvent('swipemove', {
      direction,
      deltaX,
      deltaY,
      progress: Math.min(Math.abs(deltaX) / CONFIG.touch.swipeThreshold, 1)
    });
  }

  function handleSwipeEnd(deltaX, deltaY, duration) {
    const absX = Math.abs(deltaX);
    const velocity = absX / duration;
    const direction = deltaX > 0 ? 'right' : 'left';

    // Check if swipe is significant
    if (absX > CONFIG.touch.swipeThreshold || velocity > 0.5) {
      triggerGesture('swipe', {
        direction,
        deltaX,
        deltaY,
        velocity,
        duration
      });
    }
  }

  function initSwipeNavigation() {
    // Swipe from left edge to open sidebar
    document.addEventListener('swipe', (e) => {
      const { direction, deltaX } = e.detail;
      
      if (direction === 'right' && state.touchStart?.x < 50) {
        openSidebar();
      } else if (direction === 'left' && deltaX < -100) {
        closeSidebar();
      }
    });

    // Add edge swipe indicator
    addEdgeSwipeIndicator();
  }

  function addEdgeSwipeIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'edge-swipe-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    document.body.appendChild(indicator);
  }

  // ============================================
  // Pull-to-Refresh
  // ============================================
  
  function initPullToRefresh() {
    // Create pull-to-refresh element
    const ptr = document.createElement('div');
    ptr.className = 'pull-to-refresh';
    ptr.id = 'pullToRefresh';
    ptr.innerHTML = `
      <div class="ptr-spinner">
        <svg viewBox="0 0 24 24" class="ptr-icon">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
      </div>
      <span class="ptr-text">Pull to refresh</span>
    `;
    document.body.insertBefore(ptr, document.body.firstChild);
  }

  function handlePullMove(deltaY, e) {
    if (!state.isPulling) return;

    // Apply resistance
    const pullDistance = Math.min(
      deltaY * CONFIG.pullToRefresh.resistance,
      CONFIG.pullToRefresh.maxPull
    );
    
    state.pullDistance = pullDistance;

    // Update UI
    const ptr = document.getElementById('pullToRefresh');
    if (ptr) {
      const progress = Math.min(pullDistance / CONFIG.pullToRefresh.threshold, 1);
      ptr.style.transform = `translateY(${pullDistance}px)`;
      ptr.style.opacity = progress;
      ptr.classList.toggle('ptr-ready', pullDistance >= CONFIG.pullToRefresh.threshold);
      
      // Rotate icon based on progress
      const icon = ptr.querySelector('.ptr-icon');
      if (icon) {
        icon.style.transform = `rotate(${progress * 360}deg)`;
      }
    }

    // Add pulling class to content
    document.body.classList.add('is-pulling');

    e.preventDefault();
  }

  function handlePullEnd(deltaY) {
    const ptr = document.getElementById('pullToRefresh');
    
    if (state.pullDistance >= CONFIG.pullToRefresh.threshold) {
      // Trigger refresh
      triggerRefresh();
    } else {
      // Reset
      resetPullToRefresh();
    }

    document.body.classList.remove('is-pulling');
  }

  function triggerRefresh() {
    const ptr = document.getElementById('pullToRefresh');
    if (!ptr) return;

    ptr.classList.add('ptr-refreshing');
    ptr.querySelector('.ptr-text').textContent = 'Refreshing...';
    
    vibrate('light');

    // Dispatch refresh event
    const event = new CustomEvent('pulltorefresh', {
      detail: {
        complete: () => {
          resetPullToRefresh();
        }
      }
    });
    document.dispatchEvent(event);

    // Auto-complete after timeout if not handled
    setTimeout(() => {
      if (ptr.classList.contains('ptr-refreshing')) {
        resetPullToRefresh();
      }
    }, 5000);
  }

  function resetPullToRefresh() {
    const ptr = document.getElementById('pullToRefresh');
    if (!ptr) return;

    ptr.style.transition = `transform ${CONFIG.transitions.duration}ms ${CONFIG.transitions.easing}`;
    ptr.style.transform = 'translateY(0)';
    ptr.style.opacity = '0';
    ptr.classList.remove('ptr-refreshing', 'ptr-ready');
    ptr.querySelector('.ptr-text').textContent = 'Pull to refresh';

    setTimeout(() => {
      ptr.style.transition = '';
    }, CONFIG.transitions.duration);
  }

  function disablePullToRefresh() {
    state.isPulling = false;
    document.body.classList.add('ptr-disabled');
  }

  function enablePullToRefresh() {
    document.body.classList.remove('ptr-disabled');
  }

  // ============================================
  // Native-like Transitions
  // ============================================
  
  function initNativeTransitions() {
    // Add transition styles
    addTransitionStyles();

    // Intercept view changes
    interceptViewChanges();

    // Add page transition handling
    handlePageTransitions();
  }

  function addTransitionStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .view {
        transition: opacity ${CONFIG.transitions.duration}ms ${CONFIG.transitions.easing},
                    transform ${CONFIG.transitions.duration}ms ${CONFIG.transitions.easing};
      }
      
      .view.entering {
        opacity: 0;
        transform: translateX(20px);
      }
      
      .view.leaving {
        opacity: 0;
        transform: translateX(-20px);
      }
      
      .modal {
        transition: opacity ${CONFIG.transitions.duration}ms ${CONFIG.transitions.easing},
                    transform ${CONFIG.transitions.duration}ms ${CONFIG.transitions.easing};
      }
      
      .sidebar {
        transition: transform ${CONFIG.transitions.duration}ms ${CONFIG.transitions.easing};
      }
      
      .mobile-bottom-nav {
        transition: transform ${CONFIG.transitions.duration}ms ${CONFIG.transitions.easing};
      }
      
      .mobile-bottom-nav.hidden {
        transform: translateY(100%);
      }
      
      /* Pull to refresh styles */
      .pull-to-refresh {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--color-text-secondary);
        transform: translateY(-100%);
        z-index: 99;
        pointer-events: none;
      }
      
      .ptr-spinner {
        width: 24px;
        height: 24px;
      }
      
      .ptr-icon {
        width: 100%;
        height: 100%;
        transition: transform 0.2s ease;
      }
      
      .ptr-refreshing .ptr-icon {
        animation: ptr-spin 1s linear infinite;
      }
      
      @keyframes ptr-spin {
        to { transform: rotate(360deg); }
      }
      
      .ptr-text {
        font-size: 14px;
        font-weight: 500;
      }
      
      /* Edge swipe indicator */
      .edge-swipe-indicator {
        position: fixed;
        left: 0;
        top: 50%;
        width: 4px;
        height: 40px;
        background: var(--color-brand-primary);
        border-radius: 0 4px 4px 0;
        transform: translateY(-50%) scaleY(0);
        transition: transform 0.2s ease;
        z-index: 98;
      }
      
      body:hover .edge-swipe-indicator,
      .mobile-optimized .edge-swipe-indicator {
        transform: translateY(-50%) scaleY(1);
      }
      
      /* Touch feedback */
      .touch-feedback {
        position: relative;
        overflow: hidden;
      }
      
      .touch-feedback::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 100%;
        height: 100%;
        background: radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%);
        transform: translate(-50%, -50%) scale(0);
        transition: transform 0.3s ease;
        pointer-events: none;
      }
      
      .touch-feedback:active::after {
        transform: translate(-50%, -50%) scale(2);
      }
      
      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .view, .modal, .sidebar, .mobile-bottom-nav {
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function interceptViewChanges() {
    // Listen for view changes and add transitions
    document.addEventListener('viewchange', (e) => {
      const { from, to } = e.detail || {};
      if (from && to) {
        animateViewTransition(from, to);
      }
    });
  }

  function handlePageTransitions() {
    // Handle popstate for back/forward navigation
    window.addEventListener('popstate', () => {
      animateTransition('slide-right');
    });
  }

  function animateViewTransition(fromView, toView) {
    const fromEl = document.getElementById(`${fromView}View`);
    const toEl = document.getElementById(`${toView}View`);
    
    if (!fromEl || !toEl) return;

    // Add leaving class to current view
    fromEl.classList.add('leaving');
    
    // Add entering class to new view
    toEl.classList.add('entering');
    
    // Force reflow
    void toEl.offsetHeight;
    
    // Remove classes after transition
    setTimeout(() => {
      fromEl.classList.remove('leaving');
      toEl.classList.remove('entering');
    }, CONFIG.transitions.duration);
  }

  function animateTransition(type, element) {
    const transitions = {
      'slide-left': { transform: ['translateX(0)', 'translateX(-100%)'] },
      'slide-right': { transform: ['translateX(0)', 'translateX(100%)'] },
      'fade': { opacity: [1, 0] },
      'scale': { transform: ['scale(1)', 'scale(0.95)'], opacity: [1, 0] }
    };

    const target = element || document.querySelector('.view.active');
    if (!target) return;

    const transition = transitions[type] || transitions.fade;
    
    const animation = target.animate(transition, {
      duration: CONFIG.transitions.duration,
      easing: CONFIG.transitions.easing,
      fill: 'forwards'
    });

    return animation.finished;
  }

  // ============================================
  // Haptic Feedback
  // ============================================
  
  function initHapticFeedback() {
    // Check if vibration API is supported
    if (!('vibrate' in navigator)) {
      CONFIG.haptics.enabled = false;
      return;
    }

    // Add haptic feedback to interactive elements
    document.addEventListener('click', (e) => {
      if (e.target.matches('button, .btn, [role="button"], a')) {
        vibrate('light');
      }
    });

    // Haptic on swipe
    document.addEventListener('swipe', () => {
      vibrate('light');
    });

    // Haptic on long press
    document.addEventListener('longpress', () => {
      vibrate('medium');
    });
  }

  function vibrate(intensity = 'light') {
    if (!CONFIG.haptics.enabled || !('vibrate' in navigator)) return;

    const patterns = {
      light: CONFIG.haptics.light,
      medium: CONFIG.haptics.medium,
      heavy: CONFIG.haptics.heavy,
      success: [10, 50, 10],
      error: [20, 30, 20, 30, 20]
    };

    const pattern = patterns[intensity] || patterns.light;
    navigator.vibrate(pattern);
  }

  // ============================================
  // Viewport Fixes
  // ============================================
  
  function initViewportFixes() {
    // Fix for iOS viewport height issues
    setViewportHeight();
    window.addEventListener('resize', debounce(setViewportHeight, 100));

    // Handle keyboard showing/hiding
    handleKeyboardResize();

    // Prevent zoom on input focus (iOS)
    preventInputZoom();
  }

  function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  function handleKeyboardResize() {
    const originalHeight = window.innerHeight;
    
    window.visualViewport?.addEventListener('resize', () => {
      const currentHeight = window.visualViewport.height;
      const isKeyboardOpen = currentHeight < originalHeight * 0.8;
      
      document.body.classList.toggle('keyboard-open', isKeyboardOpen);
      
      if (isKeyboardOpen) {
        // Hide bottom nav when keyboard is open
        const bottomNav = document.getElementById('mobileBottomNav');
        if (bottomNav) {
          bottomNav.style.transform = 'translateY(100%)';
        }
      } else {
        const bottomNav = document.getElementById('mobileBottomNav');
        if (bottomNav) {
          bottomNav.style.transform = '';
        }
      }
    });
  }

  function preventInputZoom() {
    // Add maximum-scale to viewport meta
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      let content = viewport.getAttribute('content') || '';
      if (!content.includes('maximum-scale')) {
        content += ', maximum-scale=1';
        viewport.setAttribute('content', content);
      }
    }
  }

  function preventOverscroll(e) {
    // Prevent overscroll bounce on iOS
    const target = e.target;
    const scrollable = target.closest('.scrollable, .view-container, .panel-body');
    
    if (!scrollable) {
      e.preventDefault();
      return;
    }

    const atTop = scrollable.scrollTop <= 0;
    const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight;
    
    if ((atTop && e.touches[0].clientY > state.touchStart?.y) ||
        (atBottom && e.touches[0].clientY < state.touchStart?.y)) {
      e.preventDefault();
    }
  }

  // ============================================
  // Fast Click
  // ============================================
  
  function initFastClick() {
    // Eliminate 300ms delay on touch devices
    let touchStartTime;
    
    document.addEventListener('touchstart', () => {
      touchStartTime = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const touchDuration = Date.now() - touchStartTime;
      
      if (touchDuration < 200) {
        const target = e.target;
        
        // Handle click immediately for certain elements
        if (target.matches('button, .btn, [role="button"], a, input[type="checkbox"], input[type="radio"]')) {
          // Element will receive normal click, no action needed
        }
      }
    }, { passive: true });

    // Add touch-action CSS for better scrolling
    document.querySelectorAll('.scrollable, .view-container, .panel-body').forEach(el => {
      el.style.touchAction = 'pan-y';
    });
  }

  // ============================================
  // Gesture Hints
  // ============================================
  
  function initGestureHints() {
    // Show hints on first use
    if (!localStorage.getItem('gesture-hints-shown')) {
      showGestureHints();
      localStorage.setItem('gesture-hints-shown', 'true');
    }
  }

  function showGestureHints() {
    const hints = [
      { text: 'Swipe from left edge to open menu', gesture: 'swipe-right' },
      { text: 'Pull down to refresh', gesture: 'pull-down' },
      { text: 'Long press for options', gesture: 'long-press' }
    ];

    // Show first hint
    showHint(hints[0]);
  }

  function showHint(hint) {
    const el = document.createElement('div');
    el.className = 'gesture-hint';
    el.innerHTML = `
      <div class="gesture-hint-content">
        <span class="gesture-icon">${getGestureIcon(hint.gesture)}</span>
        <span class="gesture-text">${hint.text}</span>
      </div>
    `;
    
    document.body.appendChild(el);
    
    setTimeout(() => {
      el.classList.add('visible');
    }, 100);

    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  function getGestureIcon(gesture) {
    const icons = {
      'swipe-right': '←',
      'pull-down': '↓',
      'long-press': '●'
    };
    return icons[gesture] || '👆';
  }

  // ============================================
  // Utility Functions
  // ============================================
  
  function isTouchDevice() {
    return (('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (navigator.msMaxTouchPoints > 0));
  }

  function isAtTop() {
    const viewContainer = document.getElementById('viewContainer');
    if (viewContainer) {
      return viewContainer.scrollTop <= 0;
    }
    return window.scrollY <= 0;
  }

  function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.add('mobile-open');
      vibrate('light');
    }
  }

  function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.remove('mobile-open');
    }
  }

  function triggerGesture(type, data) {
    dispatchCustomEvent(type, data);
    
    // Also emit as generic gesture event
    dispatchCustomEvent('gesture', { type, ...data });
  }

  function dispatchCustomEvent(type, detail) {
    const event = new CustomEvent(type, { detail, bubbles: true });
    document.dispatchEvent(event);
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
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
