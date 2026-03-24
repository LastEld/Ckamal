/**
 * CogniMesh v5.0 - Dashboard Application Entry Point
 */

(function() {
  'use strict';

  const dashboardWindow = typeof window !== 'undefined' ? window : null;

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    try {
      // Initialize Lucide icons
      const iconLibrary = dashboardWindow?.lucide;
      if (typeof iconLibrary?.createIcons === 'function') {
        iconLibrary.createIcons();
      }

      const DashboardCtor = dashboardWindow?.DashboardApp || null;
      if (typeof DashboardCtor !== 'function') {
        console.error('DashboardApp is not available; dashboard cannot start.');
        return;
      }

      // Initialize Dashboard Application
      dashboardWindow.dashboardApp = new DashboardCtor({
        apiBaseUrl: '/api',
        wsUrl: `ws://${dashboardWindow.location.host}/ws`,
        refreshInterval: 30000,
      });

      if (typeof dashboardWindow.dashboardApp.initialize !== 'function') {
        throw new Error('DashboardApp.initialize() is not available.');
      }

      // Start the application
      Promise.resolve(dashboardWindow.dashboardApp.initialize()).catch((error) => {
        console.error('Dashboard initialization failed:', error);
      });

      console.log('CogniMesh Dashboard v5.0 initialized');
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
    }
  });

  // Handle page visibility changes for connection management
  document.addEventListener('visibilitychange', function() {
    if (!dashboardWindow?.dashboardApp) return;
    
    if (document.hidden) {
      // Page is hidden, can reduce refresh frequency
      dashboardWindow.dashboardApp.onPageHidden();
    } else {
      // Page is visible again, restore normal operation
      dashboardWindow.dashboardApp.onPageVisible();
    }
  });

  // Handle beforeunload to clean up connections
  dashboardWindow?.addEventListener('beforeunload', function() {
    if (dashboardWindow.dashboardApp) {
      dashboardWindow.dashboardApp.dispose();
    }
  });

})();
