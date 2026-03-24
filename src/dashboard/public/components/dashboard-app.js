/**
 * CogniMesh v5.0 - Dashboard Application
 * Main application component that coordinates all other components
 */

const dashboardWindow = typeof window !== 'undefined' ? window : globalThis;
const ApiClientCtor = typeof dashboardWindow.ApiClient === 'function' ? dashboardWindow.ApiClient : null;
const WebSocketClientCtor = typeof dashboardWindow.WebSocketClient === 'function' ? dashboardWindow.WebSocketClient : null;
const TasksComponentCtor = typeof dashboardWindow.TasksComponent === 'function' ? dashboardWindow.TasksComponent : null;
const RoadmapsComponentCtor = typeof dashboardWindow.RoadmapsComponent === 'function' ? dashboardWindow.RoadmapsComponent : null;
const AnalyticsComponentCtor = typeof dashboardWindow.AnalyticsComponent === 'function' ? dashboardWindow.AnalyticsComponent : null;
const AlertsComponentCtor = typeof dashboardWindow.AlertsComponent === 'function' ? dashboardWindow.AlertsComponent : null;

class DashboardApp {
  constructor(options = {}) {
    this.options = options;
    this.api = ApiClientCtor ? new ApiClientCtor({ baseUrl: options.apiBaseUrl }) : null;
    this.ws = WebSocketClientCtor ? new WebSocketClientCtor({ url: options.wsUrl }) : null;
    
    // Component instances
    this.tasksComponent = null;
    this.roadmapsComponent = null;
    this.analyticsComponent = null;
    this.alertsComponent = null;
    
    // State
    this.currentView = 'dashboard';
    this.sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    this.darkMode = localStorage.getItem('darkMode') !== 'false';
    this.refreshInterval = null;
    this.notifications = [];
    
    // DOM Elements
    this.elements = {};
    
    // Bind methods
    this.handleNavigation = this.handleNavigation.bind(this);
    this.handleThemeToggle = this.handleThemeToggle.bind(this);
    this.handleSidebarToggle = this.handleSidebarToggle.bind(this);
    this.handleWsConnected = this.handleWsConnected.bind(this);
    this.handleWsDisconnected = this.handleWsDisconnected.bind(this);
    this.handleTaskUpdate = this.handleTaskUpdate.bind(this);
    this.handleAlert = this.handleAlert.bind(this);
  }

  hasApi() {
    return !!this.api && typeof this.api.getDashboardAnalytics === 'function';
  }

  hasWebSocket() {
    return !!this.ws && typeof this.ws.addEventListener === 'function';
  }

  // Initialize the application
  async initialize() {
    this.cacheElements();
    this.setupEventListeners();
    this.setupWebSocketListeners();
    
    // Initialize theme
    this.applyTheme();
    
    // Initialize sidebar state
    if (this.sidebarCollapsed && this.elements.sidebar) {
      this.elements.sidebar.classList.add('collapsed');
    }
    
    // Check authentication
    if (this.api?.isAuthenticated?.()) {
      try {
        await this.api.verifyToken();
      } catch {
        this.api?.setToken?.(null);
        // Optionally redirect to login
      }
    }
    
    // Initialize components
    this.initializeComponents();
    
    // Connect WebSocket
    this.connectWebSocket();
    
    // Load initial data
    await this.loadDashboardData();
    
    // Setup auto-refresh
    this.setupAutoRefresh();
    
    // Update UI
    this.updateConnectionStatus('connecting');
  }

  // Cache DOM elements
  cacheElements() {
    this.elements = {
      // Layout
      sidebar: document.getElementById('sidebar'),
      viewContainer: document.getElementById('viewContainer'),
      pageTitle: document.getElementById('pageTitle'),
      
      // Navigation
      navLinks: document.querySelectorAll('.nav-link'),
      sidebarToggle: document.getElementById('sidebarToggle'),
      mobileMenuToggle: document.getElementById('mobileMenuToggle'),
      
      // Header
      themeToggle: document.getElementById('themeToggle'),
      globalSearch: document.getElementById('globalSearch'),
      connectionStatus: document.getElementById('connectionStatus'),
      notificationBtn: document.getElementById('notificationBtn'),
      notificationPanel: document.getElementById('notificationPanel'),
      
      // Dashboard stats
      completedTasks: document.getElementById('completedTasks'),
      pendingTasks: document.getElementById('pendingTasks'),
      completionRate: document.getElementById('completionRate'),
      activeAgents: document.getElementById('activeAgents'),
      
      // Badges
      taskBadge: document.getElementById('taskBadge'),
      alertBadge: document.getElementById('alertBadge'),
      
      // Modals
      modalOverlay: document.getElementById('modalOverlay'),
      taskModal: document.getElementById('taskModal'),
      
      // User
      userName: document.getElementById('userName'),
      logoutBtn: document.getElementById('logoutBtn'),
    };
  }

  // Setup event listeners
  setupEventListeners() {
    // Navigation
    this.elements.navLinks.forEach(link => {
      link.addEventListener('click', this.handleNavigation);
    });
    
    // Sidebar toggle
    this.elements.sidebarToggle?.addEventListener('click', this.handleSidebarToggle);
    this.elements.mobileMenuToggle?.addEventListener('click', () => {
      this.elements.sidebar?.classList.toggle('mobile-open');
    });
    
    // Theme toggle
    this.elements.themeToggle?.addEventListener('click', this.handleThemeToggle);
    
    // Global search
    this.elements.globalSearch?.addEventListener('input', (e) => {
      this.handleGlobalSearch(e.target.value);
    });
    
    // Notification panel
    this.elements.notificationBtn?.addEventListener('click', () => {
      this.elements.notificationPanel?.classList.toggle('active');
    });
    
    // Modal overlay
    this.elements.modalOverlay?.addEventListener('click', () => {
      this.closeAllModals();
    });
    
    // Logout
    this.elements.logoutBtn?.addEventListener('click', () => {
      this.handleLogout();
    });
    
    // Quick actions
    document.getElementById('quickAddTask')?.addEventListener('click', () => {
      this.showTaskModal();
    });
    
    document.getElementById('quickViewMatrix')?.addEventListener('click', () => {
      this.navigateTo('tasks');
    });
    
    document.getElementById('quickViewRoadmaps')?.addEventListener('click', () => {
      this.navigateTo('roadmaps');
    });
    
    // Modal close buttons
    document.getElementById('closeTaskModal')?.addEventListener('click', () => {
      this.closeAllModals();
    });
    
    document.getElementById('cancelTaskBtn')?.addEventListener('click', () => {
      this.closeAllModals();
    });
    
    // Close sidebar on mobile when clicking outside
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        const isSidebar = this.elements.sidebar?.contains?.(e.target) || false;
        const isToggle = this.elements.mobileMenuToggle?.contains?.(e.target) || false;
        if (!isSidebar && !isToggle) {
          this.elements.sidebar?.classList.remove('mobile-open');
        }
      }
    });
  }

  // Setup WebSocket event listeners
  setupWebSocketListeners() {
    if (!this.hasWebSocket()) {
      return;
    }

    this.ws.addEventListener('connected', this.handleWsConnected);
    this.ws.addEventListener('disconnected', this.handleWsDisconnected);
    this.ws.addEventListener('reconnecting', () => {
      this.updateConnectionStatus('connecting');
    });
    
    // Subscribe to specific message types
    this.ws.addEventListener('message:task.updated', this.handleTaskUpdate);
    this.ws.addEventListener('message:task.created', (e) => {
      this.showNotification('New task created', e?.detail?.title || 'A task was created');
      this.refreshTasks();
    });
    this.ws.addEventListener('message:task.deleted', () => {
      this.refreshTasks();
    });
    this.ws.addEventListener('message:alert.new', this.handleAlert);
    this.ws.addEventListener('message:roadmap.progress', (e) => {
      this.roadmapsComponent?.updateProgress(e?.detail?.roadmapId, e?.detail?.progress);
    });
    this.ws.addEventListener('message:system.status', (e) => {
      this.updateSystemStatus(e?.detail || {});
    });
  }

  // Initialize sub-components
  initializeComponents() {
    this.tasksComponent = TasksComponentCtor ? new TasksComponentCtor({
      api: this.api,
      ws: this.ws,
      onTaskChange: () => this.refreshDashboardStats(),
    }) : null;
    
    this.roadmapsComponent = RoadmapsComponentCtor ? new RoadmapsComponentCtor({
      api: this.api,
      ws: this.ws,
    }) : null;
    
    this.analyticsComponent = AnalyticsComponentCtor ? new AnalyticsComponentCtor({
      api: this.api,
    }) : null;
    
    this.alertsComponent = AlertsComponentCtor ? new AlertsComponentCtor({
      api: this.api,
      ws: this.ws,
      onAlertCountChange: (count) => this.updateAlertBadge(count),
    }) : null;
  }

  // Connect WebSocket
  async connectWebSocket() {
    try {
      if (!this.hasWebSocket()) {
        this.updateConnectionStatus('disconnected');
        return;
      }

      this.ws.setToken(this.api?.getToken?.() || null);
      await this.ws.connect();
      
      // Subscribe to default rooms
      this.ws.subscribe('tasks');
      this.ws.subscribe('alerts');
      this.ws.subscribe('agents');
    } catch (error) {
      console.error('WebSocket connection failed:', error);
    }
  }

  // Handle navigation
  handleNavigation(e) {
    e.preventDefault();
    const view = e.currentTarget.dataset.view;
    this.navigateTo(view);
  }

  // Navigate to a view
  navigateTo(view) {
    // Update active nav item
    this.elements.navLinks.forEach(link => {
      link.parentElement.classList.toggle('active', link.dataset.view === view);
    });
    
    // Show view
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewElement = document.getElementById(`${view}View`);
    if (viewElement) {
      viewElement.classList.add('active');
    }
    
    // Update page title
    const titles = {
      dashboard: 'Dashboard',
      tasks: 'Tasks',
      roadmaps: 'Roadmaps',
      analytics: 'Analytics',
      agents: 'Agents',
      alerts: 'Alerts',
      settings: 'Settings',
    };
    if (this.elements.pageTitle) {
      this.elements.pageTitle.textContent = titles[view] || 'Dashboard';
    }
    
    this.currentView = view;
    
    // Close mobile sidebar
    this.elements.sidebar?.classList.remove('mobile-open');
    
    // Trigger view-specific initialization
    this.onViewChange(view);
  }

  // Handle view change
  onViewChange(view) {
    switch (view) {
      case 'tasks':
        this.tasksComponent?.initialize();
        break;
      case 'roadmaps':
        this.roadmapsComponent?.loadRoadmaps();
        break;
      case 'analytics':
        this.analyticsComponent?.initialize();
        break;
      case 'alerts':
        this.alertsComponent?.loadAlerts();
        break;
    }
  }

  // Handle theme toggle
  handleThemeToggle() {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', this.darkMode);
    this.applyTheme();
  }

  // Apply current theme
  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.darkMode ? 'dark' : 'light');
  }

  // Handle sidebar toggle
  handleSidebarToggle() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', this.sidebarCollapsed);
    this.elements.sidebar?.classList.toggle('collapsed', this.sidebarCollapsed);
  }

  // Handle global search
  handleGlobalSearch(query) {
    if (this.currentView === 'tasks') {
      this.tasksComponent?.filterTasks(query);
    } else if (this.currentView === 'roadmaps') {
      this.roadmapsComponent?.filterRoadmaps(query);
    }
  }

  // Load dashboard data
  async loadDashboardData() {
    try {
      if (!this.hasApi()) {
        return;
      }

      const [analytics, alerts, systemStatus] = await Promise.all([
        this.api.getDashboardAnalytics().catch(() => null),
        this.api.getAlerts({ acknowledged: false }).catch(() => null),
        this.api.getSystemStatus().catch(() => null),
      ]);
      
      if (analytics) {
        this.updateDashboardStats(analytics);
      }
      
      if (alerts) {
        this.updateAlertBadge(alerts.total || 0);
        this.updateRecentAlerts(alerts.alerts || []);
      }
      
      if (systemStatus) {
        this.updateSystemStatus(systemStatus);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }

  // Update dashboard statistics
  updateDashboardStats(data) {
    if (this.elements.completedTasks) {
      this.elements.completedTasks.textContent = data?.taskStats?.completed || 0;
    }
    if (this.elements.pendingTasks) {
      this.elements.pendingTasks.textContent = data?.taskStats?.pending || 0;
    }
    if (this.elements.completionRate) {
      this.elements.completionRate.textContent = `${Math.round(data?.completionRate || 0)}%`;
    }
    if (this.elements.activeAgents) {
      this.elements.activeAgents.textContent = data?.activeAgents || 0;
    }
    
    // Update task badge
    const totalTasks = (data?.taskStats?.pending || 0) + (data?.taskStats?.inProgress || 0);
    if (this.elements.taskBadge) {
      this.elements.taskBadge.textContent = totalTasks;
    }
  }

  // Update alert badge
  updateAlertBadge(count) {
    if (this.elements.alertBadge) {
      this.elements.alertBadge.textContent = count;
      this.elements.alertBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    
    // Update notification dot
    const dot = document.getElementById('notificationDot');
    if (dot) {
      dot.classList.toggle('active', count > 0);
    }
  }

  // Update recent alerts panel
  updateRecentAlerts(alerts) {
    const container = document.getElementById('recentAlerts');
    if (!container) return;

    const list = Array.isArray(alerts) ? alerts : [];
    
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <p>No alerts</p>
        </div>
      `;
    } else {
      container.innerHTML = list.slice(0, 5).map(alert => `
        <div class="alert-item ${alert.level}">
          <div class="alert-icon">
            <i data-lucide="${this.getAlertIcon(alert.level)}"></i>
          </div>
          <div class="alert-content">
            <div class="alert-title">${alert.title}</div>
            <div class="alert-message">${alert.message}</div>
            <div class="alert-time">${this.formatTime(alert.timestamp)}</div>
          </div>
        </div>
      `).join('');
    }
    
    // Re-initialize icons
    if (typeof dashboardWindow.lucide?.createIcons === 'function') {
      dashboardWindow.lucide.createIcons();
    }
  }

  // Update connection status indicator
  updateConnectionStatus(status) {
    const dot = this.elements.connectionStatus?.querySelector('.status-dot');
    const text = this.elements.connectionStatus?.querySelector('.status-text');
    
    if (!dot || !text) return;
    
    dot.className = 'status-dot ' + status;
    
    const statusTexts = {
      connected: 'Connected',
      connecting: 'Connecting...',
      disconnected: 'Disconnected',
    };
    text.textContent = statusTexts[status] || status;
  }

  // WebSocket event handlers
  handleWsConnected() {
    this.updateConnectionStatus('connected');
  }

  handleWsDisconnected() {
    this.updateConnectionStatus('disconnected');
  }

  handleTaskUpdate(event) {
    const detail = event?.detail || {};
    this.showNotification('Task Updated', detail.title || 'A task has been updated');
    this.refreshDashboardStats();
    
    if (this.currentView === 'tasks') {
      this.tasksComponent?.updateTask(detail);
    }
  }

  handleAlert(event) {
    const alert = event?.detail || {};
    this.showNotification(
      alert.title || 'New Alert',
      alert.message || 'Alert received',
      alert.level || 'info'
    );
    this.alertsComponent?.addAlert(alert);
    this.refreshDashboardStats();
  }

  // Show notification
  showNotification(title, message, type = 'info') {
    this.notifications.push({ title, message, type, timestamp: Date.now() });
    
    // Trim notifications
    if (this.notifications.length > 50) {
      this.notifications = this.notifications.slice(-50);
    }
    
    // Update notification panel if visible
    this.updateNotificationPanel();
    
    // Show browser notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: message });
    }
  }

  // Update notification panel
  updateNotificationPanel() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    
    list.innerHTML = this.notifications.slice().reverse().map(n => `
      <div class="notification-item ${n.type}">
        <div class="notification-title">${n.title}</div>
        <div class="notification-message">${n.message}</div>
        <div class="notification-time">${this.formatTime(n.timestamp)}</div>
      </div>
    `).join('');
  }

  // Show task modal
  showTaskModal(task = null) {
    const modal = this.elements.taskModal;
    const title = document.getElementById('taskModalTitle');
    const form = document.getElementById('taskForm');
    if (!modal || !title || !form || !this.elements.modalOverlay) {
      return;
    }
    
    title.textContent = task ? 'Edit Task' : 'New Task';
    
    if (task) {
      const taskTitle = document.getElementById('taskTitle');
      const taskDescription = document.getElementById('taskDescription');
      const taskPriority = document.getElementById('taskPriority');
      const taskDueDate = document.getElementById('taskDueDate');
      const taskUrgent = document.getElementById('taskUrgent');
      const taskImportant = document.getElementById('taskImportant');

      if (taskTitle) taskTitle.value = task.title || '';
      if (taskDescription) taskDescription.value = task.description || '';
      if (taskPriority) taskPriority.value = task.priority || 'medium';
      if (taskDueDate) taskDueDate.value = task.dueDate || '';
      if (taskUrgent) taskUrgent.checked = task.urgent || false;
      if (taskImportant) taskImportant.checked = task.important !== false;
    } else {
      form.reset();
    }
    
    this.elements.modalOverlay.classList.add('active');
    modal.classList.add('active');
  }

  // Close all modals
  closeAllModals() {
    this.elements.modalOverlay?.classList.remove('active');
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  }

  // Refresh dashboard stats
  async refreshDashboardStats() {
    try {
      if (!this.hasApi()) {
        return;
      }

      const data = await this.api.getDashboardAnalytics();
      this.updateDashboardStats(data);
    } catch (error) {
      console.error('Failed to refresh stats:', error);
    }
  }

  // Refresh tasks
  refreshTasks() {
    if (this.currentView === 'tasks') {
      this.tasksComponent?.loadTasks();
    }
    this.refreshDashboardStats();
  }

  // Update system status
  updateSystemStatus(status) {
    const indicator = document.getElementById('agentStatus');
    if (indicator) {
      const isOnline = status?.status === 'operational';
      indicator.className = 'status-indicator ' + (isOnline ? 'online' : 'offline');
    }
  }

  // Setup auto-refresh
  setupAutoRefresh() {
    const interval = parseInt(localStorage.getItem('refreshInterval')) || 30;
    if (interval > 0) {
      this.refreshInterval = setInterval(() => {
        this.loadDashboardData();
      }, interval * 1000);
    }
  }

  // Handle logout
  async handleLogout() {
    try {
      await this.api?.logout?.();
    } finally {
      window.location.reload();
    }
  }

  // Handle page visibility changes
  onPageHidden() {
    // Reduce refresh frequency when page is hidden
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = setInterval(() => {
        this.loadDashboardData();
      }, 5 * 60 * 1000); // 5 minutes
    }
  }

  onPageVisible() {
    // Restore normal refresh frequency
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.setupAutoRefresh();
    }
    // Refresh data immediately
    this.loadDashboardData();
  }

  // Utility: Format timestamp
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  // Utility: Get alert icon
  getAlertIcon(level) {
    const icons = {
      critical: 'alert-octagon',
      error: 'x-circle',
      warning: 'alert-triangle',
      info: 'info',
    };
    return icons[level] || 'bell';
  }

  // Dispose application
  dispose() {
    clearInterval(this.refreshInterval);
    this.ws?.disconnect?.();
  }
}

if (typeof window !== 'undefined') {
  window.DashboardApp = DashboardApp;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DashboardApp };
}
