/**
 * CogniMesh v5.0 - Dashboard Application
 * Main application component that coordinates all other components
 */

/* global Toast */

const dashboardWindow = typeof window !== 'undefined' ? window : globalThis;
const ApiClientCtor = typeof dashboardWindow.ApiClient === 'function' ? dashboardWindow.ApiClient : null;
const WebSocketClientCtor = typeof dashboardWindow.WebSocketClient === 'function' ? dashboardWindow.WebSocketClient : null;
const ToastManagerCtor = typeof dashboardWindow.ToastManager === 'function' ? dashboardWindow.ToastManager : null;
const TasksComponentCtor = typeof dashboardWindow.TasksComponent === 'function' ? dashboardWindow.TasksComponent : null;
const RoadmapsComponentCtor = typeof dashboardWindow.RoadmapsComponent === 'function' ? dashboardWindow.RoadmapsComponent : null;
const AnalyticsComponentCtor = typeof dashboardWindow.AnalyticsComponent === 'function' ? dashboardWindow.AnalyticsComponent : null;
const AlertsComponentCtor = typeof dashboardWindow.AlertsComponent === 'function' ? dashboardWindow.AlertsComponent : null;
const AgentsComponentCtor = typeof dashboardWindow.AgentsComponent === 'function' ? dashboardWindow.AgentsComponent : null;
const ActiveAgentsPanelCtor = typeof dashboardWindow.ActiveAgentsPanel === 'function' ? dashboardWindow.ActiveAgentsPanel : null;
const ToolsComponentCtor = typeof dashboardWindow.ToolsComponent === 'function' ? dashboardWindow.ToolsComponent : null;
const ProvidersComponentCtor = typeof dashboardWindow.ProvidersComponent === 'function' ? dashboardWindow.ProvidersComponent : null;
const WorkflowsComponentCtor = typeof dashboardWindow.WorkflowsComponent === 'function' ? dashboardWindow.WorkflowsComponent : null;
const CVComponentCtor = typeof dashboardWindow.CVComponent === 'function' ? dashboardWindow.CVComponent : null;
const ContextComponentCtor = typeof dashboardWindow.ContextComponent === 'function' ? dashboardWindow.ContextComponent : null;
const OrgChartComponentCtor = typeof dashboardWindow.OrgChartComponent === 'function' ? dashboardWindow.OrgChartComponent : null;
const PresenceComponentCtor = typeof dashboardWindow.PresenceComponent === 'function' ? dashboardWindow.PresenceComponent : null;
const CommandPaletteCtor = typeof dashboardWindow.CommandPalette === 'function' ? dashboardWindow.CommandPalette : null;
const CostWidgetCtor = typeof dashboardWindow.CostWidget === 'function' ? dashboardWindow.CostWidget : null;
const BudgetIncidentsBannerCtor = typeof dashboardWindow.BudgetIncidentsBanner === 'function' ? dashboardWindow.BudgetIncidentsBanner : null;
const ActivityFeedCtor = typeof dashboardWindow.ActivityFeed === 'function' ? dashboardWindow.ActivityFeed : null;
const PerformanceChartCtor = typeof dashboardWindow.PerformanceChart === 'function' ? dashboardWindow.PerformanceChart : null;
const SystemHealthCtor = typeof dashboardWindow.SystemHealth === 'function' ? dashboardWindow.SystemHealth : null;

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
    this.agentsComponent = null;
    this.toolsComponent = null;
    this.providersComponent = null;
    this.workflowsComponent = null;
    this.cvComponent = null;
    this.contextComponent = null;
    this.orgChartComponent = null;
    this.presenceComponent = null;
    this.costWidget = null;
    this.commandPalette = null;
    
    // Dashboard widgets
    this.budgetIncidentsBanner = null;
    this.activityFeed = null;
    this.performanceChart = null;
    this.systemHealth = null;

    // State
    this.currentView = 'dashboard';
    this.sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    this.darkMode = localStorage.getItem('darkMode') !== 'false';
    this.refreshInterval = null;
    this.notifications = [];
    this.integrationSettingsLoaded = false;
    
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
    this.loadIntegrationSettings = this.loadIntegrationSettings.bind(this);
    this.saveIntegrationSettings = this.saveIntegrationSettings.bind(this);
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

    // Initialize ToastManager
    this.initializeToastManager();

    // Initialize sidebar state
    if (this.sidebarCollapsed && this.elements.sidebar) {
      this.elements.sidebar.classList.add('collapsed');
    }

    // Restore UI controls from persisted preferences
    this.hydrateSettingsControls();

    // Check authentication — show login if needed
    const authed = await this.checkAuth();
    if (!authed) return; // Login screen is shown; initialization continues after login

    this.startApp();
  }

  // Check if user is authenticated; returns true if ready to proceed
  async checkAuth() {
    if (this.api?.isAuthenticated?.()) {
      try {
        await this.api.verifyToken();
        this.hideLogin();
        return true;
      } catch {
        this.api?.setToken?.(null);
      }
    }
    this.showLogin();
    return false;
  }

  // Show login screen, hide dashboard chrome
  showLogin() {
    const loginScreen = document.getElementById('loginScreen');
    const sidebar = this.elements.sidebar;
    const mainContent = document.querySelector('.main-content');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';
  }

  // Hide login screen, show dashboard chrome
  hideLogin() {
    const loginScreen = document.getElementById('loginScreen');
    const sidebar = this.elements.sidebar;
    const mainContent = document.querySelector('.main-content');
    if (loginScreen) loginScreen.style.display = 'none';
    if (sidebar) sidebar.style.display = '';
    if (mainContent) mainContent.style.display = '';
  }

  // Handle login form submission
  async handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    if (!username || !password) {
      if (errorEl) { errorEl.textContent = 'Username and password are required'; errorEl.style.display = 'block'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
    if (errorEl) errorEl.style.display = 'none';

    try {
      await this.api.login(username, password);
      this.hideLogin();
      this.startApp();
    } catch (err) {
      if (errorEl) { errorEl.textContent = err.message || 'Login failed'; errorEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    }
  }

  // Start dashboard after successful auth
  startApp() {
    // Initialize components
    this.initializeComponents();

    // Connect WebSocket
    this.connectWebSocket();

    // Load initial data
    this.loadDashboardData();

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

      // Settings
      themeSelect: document.getElementById('themeSelect'),
      compactMode: document.getElementById('compactMode'),
      enableNotifications: document.getElementById('enableNotifications'),
      soundAlerts: document.getElementById('soundAlerts'),
      refreshIntervalSelect: document.getElementById('refreshInterval'),
      githubTokenInput: document.getElementById('githubTokenInput'),
      jwtSecretInput: document.getElementById('jwtSecretInput'),
      githubTokenStatus: document.getElementById('githubTokenStatus'),
      jwtSecretStatus: document.getElementById('jwtSecretStatus'),
      toggleGithubTokenBtn: document.getElementById('toggleGithubTokenBtn'),
      toggleJwtSecretBtn: document.getElementById('toggleJwtSecretBtn'),
      reloadIntegrationSettingsBtn: document.getElementById('reloadIntegrationSettingsBtn'),
      saveIntegrationSettingsBtn: document.getElementById('saveIntegrationSettingsBtn'),
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

    // Command Palette trigger
    document.getElementById('commandPaletteTrigger')?.addEventListener('click', () => {
      this.commandPalette?.open();
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
    
    // Login form
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
      this.handleLoginSubmit(e);
    });

    // Listen for 401 unauthorized events from API client
    window.addEventListener('api:unauthorized', () => {
      this.showLogin();
      if (dashboardWindow.toastManager) {
        dashboardWindow.toastManager.warning('Session expired. Please sign in again.', { duration: 6000 });
      } else if (typeof Toast !== 'undefined') {
        Toast.warning('Session expired. Please sign in again.');
      }
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

    // Settings: Theme select
    document.getElementById('themeSelect')?.addEventListener('change', (e) => {
      const value = e.target.value;
      if (value === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.darkMode = prefersDark;
      } else {
        this.darkMode = value === 'dark';
      }
      localStorage.setItem('darkMode', this.darkMode);
      localStorage.setItem('themePreference', value);
      this.applyTheme();
    });

    // Settings: Compact mode
    document.getElementById('compactMode')?.addEventListener('change', (e) => {
      const compact = e.target.checked;
      localStorage.setItem('compactMode', compact);
      document.body.classList.toggle('compact-mode', compact);
    });

    // Settings: Notifications permission
    document.getElementById('enableNotifications')?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('notificationsEnabled', enabled);
      if (enabled && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });

    // Settings: Sound alerts
    document.getElementById('soundAlerts')?.addEventListener('change', (e) => {
      localStorage.setItem('soundAlerts', e.target.checked);
    });

    // Settings: Auto-refresh interval
    document.getElementById('refreshInterval')?.addEventListener('change', (e) => {
      const interval = parseInt(e.target.value, 10) || 0;
      localStorage.setItem('refreshInterval', interval);
      // Restart the refresh timer immediately
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
      this.setupAutoRefresh();
    });

    this.elements.toggleGithubTokenBtn?.addEventListener('click', () => {
      this.toggleSecretFieldVisibility(this.elements.githubTokenInput, this.elements.toggleGithubTokenBtn);
    });

    this.elements.toggleJwtSecretBtn?.addEventListener('click', () => {
      this.toggleSecretFieldVisibility(this.elements.jwtSecretInput, this.elements.toggleJwtSecretBtn);
    });

    this.elements.reloadIntegrationSettingsBtn?.addEventListener('click', () => {
      this.loadIntegrationSettings(true);
    });

    this.elements.saveIntegrationSettingsBtn?.addEventListener('click', () => {
      this.saveIntegrationSettings();
    });
  }

  hydrateSettingsControls() {
    const themePreference = localStorage.getItem('themePreference');
    const compactMode = localStorage.getItem('compactMode') === 'true';
    const notificationsEnabled = localStorage.getItem('notificationsEnabled');
    const soundAlerts = localStorage.getItem('soundAlerts');
    const refreshInterval = parseInt(localStorage.getItem('refreshInterval'), 10);

    if (this.elements.themeSelect) {
      this.elements.themeSelect.value = themePreference || (this.darkMode ? 'dark' : 'light');
    }

    if (this.elements.compactMode) {
      this.elements.compactMode.checked = compactMode;
    }
    document.body.classList.toggle('compact-mode', compactMode);

    if (this.elements.enableNotifications) {
      this.elements.enableNotifications.checked = notificationsEnabled === null
        ? true
        : notificationsEnabled === 'true';
    }

    if (this.elements.soundAlerts) {
      this.elements.soundAlerts.checked = soundAlerts === 'true';
    }

    if (this.elements.refreshIntervalSelect && Number.isFinite(refreshInterval) && refreshInterval >= 0) {
      this.elements.refreshIntervalSelect.value = String(refreshInterval);
    }
  }

  toggleSecretFieldVisibility(inputElement, buttonElement) {
    if (!inputElement || !buttonElement) return;
    const reveal = inputElement.type === 'password';
    inputElement.type = reveal ? 'text' : 'password';
    buttonElement.textContent = reveal ? 'Hide' : 'Show';
  }

  setIntegrationSettingsBusy(isBusy) {
    if (this.elements.saveIntegrationSettingsBtn) {
      this.elements.saveIntegrationSettingsBtn.disabled = isBusy;
      this.elements.saveIntegrationSettingsBtn.classList.toggle('loading', isBusy);
    }
    if (this.elements.reloadIntegrationSettingsBtn) {
      this.elements.reloadIntegrationSettingsBtn.disabled = isBusy;
    }
  }

  applyIntegrationSettings(settings = {}) {
    const githubConfigured = Boolean(settings?.github?.configured);
    const jwtConfigured = Boolean(settings?.jwt?.configured);
    const githubMasked = settings?.github?.masked || '';
    const jwtMasked = settings?.jwt?.masked || '';

    if (this.elements.githubTokenStatus) {
      this.elements.githubTokenStatus.textContent = githubConfigured
        ? `Configured (${githubMasked})`
        : 'Not configured';
    }

    if (this.elements.jwtSecretStatus) {
      this.elements.jwtSecretStatus.textContent = jwtConfigured
        ? `Configured (${jwtMasked})`
        : 'Not configured';
    }

    if (this.elements.githubTokenInput) {
      this.elements.githubTokenInput.value = '';
      this.elements.githubTokenInput.placeholder = githubConfigured
        ? `Current: ${githubMasked}`
        : 'ghp_...';
      this.elements.githubTokenInput.type = 'password';
    }

    if (this.elements.jwtSecretInput) {
      this.elements.jwtSecretInput.value = '';
      this.elements.jwtSecretInput.placeholder = jwtConfigured
        ? `Current: ${jwtMasked}`
        : 'Enter new JWT secret (min 16 chars)';
      this.elements.jwtSecretInput.type = 'password';
    }

    if (this.elements.toggleGithubTokenBtn) {
      this.elements.toggleGithubTokenBtn.textContent = 'Show';
    }
    if (this.elements.toggleJwtSecretBtn) {
      this.elements.toggleJwtSecretBtn.textContent = 'Show';
    }
  }

  async loadIntegrationSettings(showToast = false) {
    if (!this.api?.getIntegrationSettings) {
      if (this.elements.githubTokenStatus) {
        this.elements.githubTokenStatus.textContent = 'Settings API unavailable';
      }
      if (this.elements.jwtSecretStatus) {
        this.elements.jwtSecretStatus.textContent = 'Settings API unavailable';
      }
      return;
    }

    this.setIntegrationSettingsBusy(true);
    try {
      const settings = await this.api.getIntegrationSettings();
      this.applyIntegrationSettings(settings);
      this.integrationSettingsLoaded = true;
      if (showToast) {
        this.showToast('Integration settings loaded', 'success', 2500);
      }
    } catch (error) {
      const message = error?.message || 'Failed to load integration settings';
      if (this.elements.githubTokenStatus) this.elements.githubTokenStatus.textContent = message;
      if (this.elements.jwtSecretStatus) this.elements.jwtSecretStatus.textContent = message;
      this.showToast(message, 'error', 5000);
    } finally {
      this.setIntegrationSettingsBusy(false);
    }
  }

  async saveIntegrationSettings() {
    if (!this.api?.updateIntegrationSettings) {
      this.showToast('Settings API unavailable', 'error', 4000);
      return;
    }

    const githubToken = this.elements.githubTokenInput?.value?.trim() || '';
    const jwtSecret = this.elements.jwtSecretInput?.value?.trim() || '';
    const payload = {};

    if (githubToken.length > 0) {
      payload.githubToken = githubToken;
    }

    if (jwtSecret.length > 0) {
      payload.jwtSecret = jwtSecret;
    }

    if (Object.keys(payload).length === 0) {
      this.showToast('Enter a GitHub token or JWT secret before saving', 'warning', 4000);
      return;
    }

    this.setIntegrationSettingsBusy(true);
    try {
      const result = await this.api.updateIntegrationSettings(payload);
      this.applyIntegrationSettings(result);
      this.integrationSettingsLoaded = true;
      this.showToast(result?.message || 'Integration settings saved', 'success', 5000);
    } catch (error) {
      const message = error?.message || 'Failed to save integration settings';
      this.showToast(message, 'error', 6000);
    } finally {
      this.setIntegrationSettingsBusy(false);
    }
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

    // Agent updates - real-time agent status changes
    this.ws.addEventListener('message:agent.status', (e) => {
      this.handleAgentUpdate(e?.detail);
    });
    this.ws.addEventListener('message:agent.updated', (e) => {
      this.handleAgentUpdate(e?.detail);
    });
    this.ws.addEventListener('message:agent.created', () => {
      this.refreshDashboardStats();
      if (this.currentView === 'agents') {
        this.agentsComponent?.refreshAgents?.();
      }
    });
    this.ws.addEventListener('message:agent.deleted', () => {
      this.refreshDashboardStats();
    });
    
    // Presence updates - real-time online user count
    this.ws.addEventListener('message:presence.update', (e) => {
      this.updatePresenceIndicator(e?.detail);
    });

    // Also fetch initial presence on WebSocket connect
    this.ws.addEventListener('connected', () => {
      this.loadPresence();
    });
  }

  /**
   * Handle agent update from WebSocket
   */
  handleAgentUpdate(data) {
    if (!data) return;
    
    // Update agents component if on agents view
    if (this.currentView === 'agents') {
      this.agentsComponent?.updateAgentStatus?.(data.id || data.agentId, data);
    }
    
    // Update dashboard stats
    this.refreshDashboardStats();
    
    // Show notification for status changes
    if (data.status) {
      const agentName = data.name || 'An agent';
      const statusMessages = {
        online: `${agentName} is now online`,
        offline: `${agentName} went offline`,
        busy: `${agentName} is now busy`,
        error: `${agentName} encountered an error`,
        paused: `${agentName} has been paused`,
      };
      
      const message = statusMessages[data.status];
      if (message && data.previousStatus !== data.status) {
        this.showNotification('Agent Update', message, 'info');
      }
    }
  }

  /**
   * Loads initial presence data from API
   */
  async loadPresence() {
    try {
      if (!this.hasApi()) {
        return;
      }
      const presence = await this.api.getPresence();
      this.updatePresenceIndicator(presence);
    } catch (error) {
      console.error('Failed to load presence:', error);
    }
  }

  /**
   * Updates the presence indicator in the UI
   * @param {Object} presence - Presence data
   */
  updatePresenceIndicator(presence) {
    if (!presence) return;
    
    const indicator = document.getElementById('presenceIndicator');
    if (indicator) {
      const countSpan = indicator.querySelector('.presence-count');
      const uniqueUsers = presence.uniqueUsers ?? 0;
      const totalConnections = presence.totalConnections ?? 0;
      
      if (countSpan) {
        const userText = uniqueUsers === 1 ? '1 user online' : `${uniqueUsers} users online`;
        countSpan.textContent = userText;
      }
      indicator.title = `${totalConnections} total connection${totalConnections !== 1 ? 's' : ''}`;
    }
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

    this.agentsComponent = AgentsComponentCtor ? new AgentsComponentCtor({
      api: this.api,
      ws: this.ws,
    }) : null;

    this.toolsComponent = ToolsComponentCtor ? new ToolsComponentCtor({
      api: this.api,
    }) : null;

    this.providersComponent = ProvidersComponentCtor ? new ProvidersComponentCtor({
      api: this.api,
    }) : null;

    this.workflowsComponent = WorkflowsComponentCtor ? new WorkflowsComponentCtor({ api: this.api, ws: this.ws }) : null;
    this.cvComponent = CVComponentCtor ? new CVComponentCtor({ api: this.api }) : null;
    this.contextComponent = ContextComponentCtor ? new ContextComponentCtor({
      api: this.api,
    }) : null;

    this.orgChartComponent = OrgChartComponentCtor ? new OrgChartComponentCtor({
      api: this.api,
      ws: this.ws,
    }) : null;

    this.presenceComponent = PresenceComponentCtor ? new PresenceComponentCtor({
      api: this.api,
      ws: this.ws,
    }) : null;

    this.costWidget = CostWidgetCtor ? new CostWidgetCtor({
      api: this.api,
      ws: this.ws,
    }) : null;

    // Initialize dashboard widgets
    this.budgetIncidentsBanner = BudgetIncidentsBannerCtor ? new BudgetIncidentsBannerCtor({
      api: this.api,
      ws: this.ws,
    }) : null;

    this.activityFeed = ActivityFeedCtor ? new ActivityFeedCtor({
      api: this.api,
      ws: this.ws,
    }) : null;

    this.performanceChart = PerformanceChartCtor ? new PerformanceChartCtor({
      api: this.api,
      ws: this.ws,
      period: '7d',
      showTrend: true,
      showGoals: true,
    }) : null;

    this.systemHealth = SystemHealthCtor ? new SystemHealthCtor({
      api: this.api,
      ws: this.ws,
    }) : null;

    // Initialize Command Palette
    this.commandPalette = CommandPaletteCtor ? new CommandPaletteCtor({
      onExecute: (command) => {
        console.log('Command executed:', command.title);
      },
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
      tools: 'Tools',
      gsd: 'GSD Workflows',
      cv: 'Agent CVs',
      providers: 'Providers',
      alerts: 'Alerts',
      context: 'Context Snapshots',
      orgchart: 'Org Chart',
      settings: 'Settings',
      billing: 'Billing',
    };
    if (this.elements.pageTitle) {
      this.elements.pageTitle.textContent = titles[view] || 'Dashboard';
    }
    
    this.currentView = view;

    // Sync mobile nav active state
    const mobileMap = {
      dashboard: 'dashboard',
      tasks: 'tasks',
      agents: 'agents',
      alerts: 'alerts'
    };
    const mobileId = mobileMap[view];
    if (mobileId && dashboardWindow.MobileNav?.setActive) {
      dashboardWindow.MobileNav.setActive(mobileId);
    }
    
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
      case 'agents':
        this.agentsComponent?.loadAgents?.();
        break;
      case 'tools':
        this.toolsComponent?.loadTools();
        break;
      case 'providers':
        this.providersComponent?.loadProviders();
        break;
      case 'alerts':
        this.alertsComponent?.loadAlerts();
        break;
      case 'gsd':
        this.workflowsComponent?.loadWorkflows();
        break;
      case 'cv':
        this.cvComponent?.loadCVs();
        break;
      case 'context':
        this.contextComponent?.initialize();
        break;
      case 'orgchart':
        this.orgChartComponent?.initialize();
        break;
      case 'settings':
        this.loadIntegrationSettings();
        break;
      case 'billing':
        this.costWidget?.renderBillingView('billingContainer');
        this.costWidget?.startAutoRefresh();
        break;
    }
    
    // Handle dashboard widgets visibility
    if (view === 'dashboard') {
      this.costWidget?.renderCompactWidget('costWidgetContainer');
      this.budgetIncidentsBanner?.render('budgetIncidentsContainer');
      this.activityFeed?.render('activityFeedContainer', { maxItems: 10 });
      this.performanceChart?.render('performanceChartContainer');
      this.systemHealth?.render('systemHealthContainer');
      this.activityFeed?.startAutoRefresh();
      this.systemHealth?.startAutoRefresh();
    } else {
      this.costWidget?.stopAutoRefresh();
      this.activityFeed?.stopAutoRefresh();
      this.systemHealth?.stopAutoRefresh();
      
      // Cleanup charts when leaving dashboard
      if (view !== 'analytics') {
        this.performanceChart?.destroy();
      }
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

  // Initialize ToastManager with global access
  initializeToastManager() {
    if (ToastManagerCtor) {
      // Make toastManager globally accessible
      dashboardWindow.toastManager = dashboardWindow.toastManager || new ToastManagerCtor();
      
      // Configure default settings
      dashboardWindow.toastManager.configure({
        maxToasts: 5,
        defaultDuration: 4000,
        defaultPosition: 'top-right',
        showProgress: true,
        pauseOnHover: true,
        dismissible: true,
      });

      console.log('[Dashboard] ToastManager initialized');
    }
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

      // Load dashboard widgets
      if (this.currentView === 'dashboard') {
        this.costWidget?.renderCompactWidget('costWidgetContainer');
        this.budgetIncidentsBanner?.render('budgetIncidentsContainer');
        this.activityFeed?.render('activityFeedContainer', { maxItems: 10 });
        this.performanceChart?.render('performanceChartContainer');
        this.systemHealth?.render('systemHealthContainer');
        
        // Start auto-refresh for widgets
        this.activityFeed?.startAutoRefresh();
        this.systemHealth?.startAutoRefresh();
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

    document.dispatchEvent(new CustomEvent('badge:updated', {
      detail: { type: 'tasks', count: totalTasks }
    }));
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

    document.dispatchEvent(new CustomEvent('badge:updated', {
      detail: { type: 'alerts', count }
    }));
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
            <div class="alert-title">${this.escapeHtml(alert.title)}</div>
            <div class="alert-message">${this.escapeHtml(alert.message)}</div>
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
        <div class="notification-title">${this.escapeHtml(n.title)}</div>
        <div class="notification-message">${this.escapeHtml(n.message)}</div>
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
    const interval = parseInt(localStorage.getItem('refreshInterval'), 10) || 30;
    if (interval > 0) {
      this.refreshInterval = setInterval(() => {
        this.loadDashboardData();
      }, interval * 1000);
    }
  }

  // Handle logout
  async handleLogout() {
    try {
      if (dashboardWindow.toastManager) {
        dashboardWindow.toastManager.info('Logging out...', { duration: 2000 });
      }
      await this.api?.logout?.();
    } finally {
      window.location.reload();
    }
  }

  // ==========================================
  // Toast Examples & Utilities
  // ==========================================

  /**
   * Show a toast notification (wrapper for backward compatibility)
   * @param {string} message - Toast message
   * @param {string} type - Toast type: info, success, warning, error
   * @param {number} duration - Duration in milliseconds
   */
  showToast(message, type = 'info', duration = 4000) {
    if (dashboardWindow.toastManager) {
      return dashboardWindow.toastManager.show({ message, type, duration });
    } else if (typeof Toast !== 'undefined') {
      return Toast.show(message, type, duration);
    }
  }

  /**
   * Show connection status toast
   */
  showConnectionToast(status) {
    const messages = {
      connected: { message: 'Connected to server', type: 'success' },
      disconnected: { message: 'Disconnected from server', type: 'error' },
      connecting: { message: 'Connecting...', type: 'info' },
    };
    
    const config = messages[status];
    if (config && dashboardWindow.toastManager) {
      dashboardWindow.toastManager.show({
        ...config,
        duration: status === 'connected' ? 3000 : 5000,
        showProgress: true,
      });
    }
  }

  /**
   * Show task completion toast with action
   */
  showTaskCompletedToast(task) {
    if (!dashboardWindow.toastManager) return;
    
    dashboardWindow.toastManager.success(`Task "${task.title}" completed!`, {
      duration: 5000,
      action: {
        label: 'View',
        onClick: () => {
          this.navigateTo('tasks');
        }
      }
    });
  }

  /**
   * Show bulk operation result toast
   */
  showBulkOperationToast(success, failed, operation) {
    if (!dashboardWindow.toastManager) return;
    
    if (failed === 0) {
      dashboardWindow.toastManager.success(`${operation} completed: ${success} items`, {
        duration: 3000,
      });
    } else if (success === 0) {
      dashboardWindow.toastManager.error(`${operation} failed: ${failed} items`, {
        duration: 6000,
      });
    } else {
      dashboardWindow.toastManager.warning(
        `${operation}: ${success} succeeded, ${failed} failed`,
        { duration: 5000 }
      );
    }
  }

  /**
   * Show confirmation toast with actions
   */
  showConfirmationToast(message, onConfirm, onCancel) {
    if (!dashboardWindow.toastManager) {
      // Fallback to native confirm
      if (confirm(message)) {
        onConfirm?.();
      } else {
        onCancel?.();
      }
      return;
    }
    
    return dashboardWindow.toastManager.confirm(message, {
      title: 'Confirm Action',
      onConfirm,
      onCancel,
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
    });
  }

  /**
   * Example: Show toast at different positions
   */
  showPositionedToast(message, position) {
    if (!dashboardWindow.toastManager) return;
    
    const positions = [
      'top-left', 'top-right', 'top-center',
      'bottom-left', 'bottom-right', 'bottom-center'
    ];
    
    const selectedPosition = positions.includes(position) ? position : 'top-right';
    
    dashboardWindow.toastManager.info(message, {
      position: selectedPosition,
      duration: 3000,
    });
  }

  /**
   * Example: Promise-based toast
   */
  async showAsyncToast(promise, messages) {
    if (!dashboardWindow.toastManager) {
      return promise;
    }
    
    return dashboardWindow.toastManager.promise(promise, {
      loading: messages.loading || 'Loading...',
      success: messages.success || 'Success!',
      error: messages.error || 'Error occurred',
      duration: 3000,
    });
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

  // Utility: Escape HTML to prevent XSS
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    this.costWidget?.destroy();
    this.commandPalette?.dispose();
    this.performanceChart?.destroy();
    this.activityFeed?.stopAutoRefresh();
    this.systemHealth?.stopAutoRefresh();
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
