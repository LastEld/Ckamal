/**
 * CogniMesh v5.0 - Enhanced Agents Component
 * Agent management with status badges, cards, detail panel, and real-time updates
 */

/* global Toast */

const agentsWindow = typeof window !== 'undefined' ? window : globalThis;

// Component constructors (may be loaded from separate files)
const AgentStatusBadgeCtor3 = agentsWindow.AgentStatusBadge;
const AgentCardCtor3 = agentsWindow.AgentCard;
const AgentDetailPanelCtor3 = agentsWindow.AgentDetailPanel;
const ActiveAgentsPanelCtor3 = agentsWindow.ActiveAgentsPanel;

/**
 * Enhanced Agents Component
 * Provides agent visualization and controls with real-time updates
 */
class AgentsComponent {
  constructor(options = {}) {
    this.api = options.api || null;
    this.ws = options.ws || null;

    this.agents = [];
    this.loading = false;
    this.selectedAgent = null;
    this.detailPanel = null;
    this.activeAgentsPanel = null;
    this.pollingInterval = null;
    this.providerCatalog = null;

    // Provider color map
    this.providerColors = {
      claude: '#d97706',
      codex: '#10b981',
      kimi: '#8b5cf6',
      cursor: '#3b82f6',
      gemini: '#06b6d4',
      opencode: '#f59e0b',
      hermes: '#ec4899',
      pi: '#8b5cf6',
    };

    // Bind methods
    this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
    this.handleAgentClick = this.handleAgentClick.bind(this);
    this.handleAgentAction = this.handleAgentAction.bind(this);
    this.handleAgentsGridClick = this.handleAgentsGridClick.bind(this);
    this.refreshAgents = this.refreshAgents.bind(this);
    this.showCreateAgentModal = this.showCreateAgentModal.bind(this);
    this.closeCreateAgentModal = this.closeCreateAgentModal.bind(this);
    this.createAgentFromModal = this.createAgentFromModal.bind(this);

    // Initialize
    this.initialize();
  }

  /**
   * Initialize component
   */
  initialize() {
    // Setup refresh button
    const refreshBtn = document.getElementById('refreshAgentsBtn');
    refreshBtn?.addEventListener('click', () => this.refreshAgents());
    document.getElementById('createAgentToolbarBtn')?.addEventListener('click', () => this.showCreateAgentModal());
    document.getElementById('agentsGrid')?.addEventListener('click', this.handleAgentsGridClick);

    // Setup WebSocket listeners
    this.setupWebSocketListeners();

    // Start polling
    this.startPolling();
  }

  /**
   * Load agents from API
   */
  async loadAgents() {
    if (this.loading) return;
    this.loading = true;

    const grid = document.getElementById('agentsGrid');
    if (grid) {
      grid.innerHTML = this.renderLoadingState();
    }

    try {
      if (!this.api?.getAgents) {
        console.warn('Agents API is unavailable');
        this.agents = [];
      } else {
        const data = await this.api.getAgents();
        this.agents = data.agents || [];
      }
      this.renderAgents();
    } catch (error) {
      console.error('Failed to load agents:', error);
      Toast?.error?.('Failed to load agents');
      this.renderError();
    } finally {
      this.loading = false;
    }
  }

  /**
   * Render loading state
   */
  renderLoadingState() {
    return `
      <div class="agents-loading-state">
        <div class="loading-spinner"></div>
        <span>Loading agents...</span>
      </div>
    `;
  }

  /**
   * Render error state
   */
  renderError() {
    const grid = document.getElementById('agentsGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="agents-error-state">
          <i data-lucide="alert-circle" style="width: 48px; height: 48px;"></i>
          <h4>Failed to load agents</h4>
          <button class="btn btn-secondary" id="retryAgentsLoadBtn">
            <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
            <span>Retry</span>
          </button>
        </div>
      `;
      agentsWindow.lucide?.createIcons?.();
      document.getElementById('retryAgentsLoadBtn')?.addEventListener('click', () => this.refreshAgents());
    }
  }

  /**
   * Render agents grid
   */
  renderAgents() {
    const grid = document.getElementById('agentsGrid');
    if (!grid) return;

    if (this.agents.length === 0) {
      grid.innerHTML = this.renderEmptyState();
    } else {
      grid.innerHTML = this.agents.map(agent => this.renderAgentCard(agent)).join('');
    }

    // Re-initialize Lucide icons
    if (typeof agentsWindow.lucide?.createIcons === 'function') {
      agentsWindow.lucide.createIcons();
    }

    document.getElementById('createAgentBtn')?.addEventListener('click', () => this.showCreateAgentModal());
    document.getElementById('refreshEmptyBtn')?.addEventListener('click', () => this.refreshAgents());

    // Update dashboard active agents count
    this.updateDashboardCount();
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    return `
      <div class="agents-empty-state">
        <div class="empty-icon">
          <i data-lucide="bot" style="width: 64px; height: 64px;"></i>
        </div>
        <h3>No agents available</h3>
        <p>There are no agents configured or running.</p>
        <div class="empty-actions">
          <button class="btn btn-primary" id="createAgentBtn">
            <i data-lucide="plus" style="width: 16px; height: 16px;"></i>
            <span>Create Agent</span>
          </button>
          <button class="btn btn-secondary" id="refreshEmptyBtn">
            <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
            <span>Refresh</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render enhanced agent card using AgentCard component if available
   */
  renderAgentCard(agent) {
    if (AgentCardCtor3) {
      const card = new AgentCardCtor3({
        agent,
        onClick: this.handleAgentClick,
        onWake: (id, data) => this.handleAgentAction('wake', id, data),
        onPause: (id, data) => this.handleAgentAction('pause', id, data),
        onStop: (id, data) => this.handleAgentAction('stop', id, data),
      });
      return card.render();
    }

    // Fallback to inline HTML
    const name = this.escapeHtml(agent.name);
    const provider = this.escapeHtml(agent.provider || agent.adapterType || 'unknown');
    const providerLower = provider.toLowerCase();
    const model = this.escapeHtml(agent.model || '');
    const status = (agent.status || 'offline').toLowerCase();
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const tasksCompleted = Number(agent.tasksCompleted) || 0;
    const successRate = Number(agent.successRate) || 0;
    const lastActive = agent.lastActive ? this.formatTimeAgo(agent.lastActive) : 'Never';
    const providerColor = this.providerColors[providerLower] || '#6b7280';
    const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];

    const statusBadge = AgentStatusBadgeCtor3
      ? AgentStatusBadgeCtor3.render(status, { size: 'sm' })
      : `<span class="agent-status-text ${status}">${statusLabel}</span>`;

    const capabilityTags = capabilities.map(cap =>
      `<span class="capability-tag">${this.escapeHtml(cap)}</span>`
    ).join('');

    return `
      <div class="agent-card" data-agent-id="${agent.id || ''}" data-status="${status}">
        <div class="agent-card-header">
          <div class="agent-card-title">
            <i data-lucide="bot"></i>
            <h4>${name}</h4>
          </div>
          <span class="provider-badge" style="background-color: ${providerColor}">
            ${provider}
          </span>
        </div>
        <div class="agent-card-model">${model}</div>
        <div class="agent-card-status">
          ${statusBadge}
        </div>
        ${capabilities.length > 0 ? `
          <div class="agent-card-capabilities">
            ${capabilityTags}
          </div>
        ` : ''}
        <div class="agent-card-stats">
          <div class="agent-card-stat">
            <span class="agent-card-stat-value">${tasksCompleted}</span>
            <span class="agent-card-stat-label">Tasks Done</span>
          </div>
          <div class="agent-card-stat">
            <span class="agent-card-stat-value">${successRate}%</span>
            <span class="agent-card-stat-label">Success Rate</span>
          </div>
        </div>
        <div class="agent-card-footer">
          <i data-lucide="clock" class="agent-card-footer-icon"></i>
          <span>Last active: ${lastActive}</span>
        </div>
      </div>
    `;
  }

  /**
   * Handle agent card click
   */
  handleAgentClick(agent) {
    this.showAgentDetail(agent);
  }

  /**
   * Handle agent action (wake, pause, stop)
   */
  async handleAgentAction(action, agentId, agent) {
    console.log(`Agent action: ${action} for ${agentId}`);
    
    try {
      // Optimistic UI update
      const statusMap = {
        wake: 'online',
        pause: 'paused',
        stop: 'offline',
      };
      
      if (statusMap[action]) {
        this.updateAgentStatus(agentId, { status: statusMap[action] });
      }

      if (!this.api) {
        throw new Error('Agents API is unavailable');
      }

      let result = null;
      switch (action) {
        case 'wake':
          result = await this.api.wakeAgent(agentId);
          break;
        case 'pause':
          result = await this.api.pauseAgent(agentId, { reason: 'Paused from dashboard UI' });
          break;
        case 'stop':
          result = await this.api.stopAgent(agentId, { reason: 'Stopped from dashboard UI' });
          break;
        default:
          throw new Error(`Unsupported action '${action}'`);
      }

      if (result?.agent) {
        this.updateAgentStatus(agentId, result.agent);
      }

      Toast?.success?.(result?.message || `Agent ${action} command sent`);
    } catch (error) {
      console.error(`Failed to ${action} agent:`, error);
      Toast?.error?.(`Failed to ${action} agent: ${error.message}`);
      // Revert optimistic update
      this.loadAgents();
    }
  }

  handleAgentsGridClick(event) {
    const actionButton = event.target.closest('.action-btn');
    if (actionButton) {
      event.preventDefault();
      event.stopPropagation();
      const action = actionButton.dataset.action;
      const agentId = actionButton.dataset.agentId;
      const agent = this.agents.find((entry) => (entry.id || entry.agentId) === agentId);
      if (action && agentId && agent) {
        this.handleAgentAction(action, agentId, agent);
      }
      return;
    }

    const agentCard = event.target.closest('.agent-card');
    if (!agentCard) {
      return;
    }

    const agentId = agentCard.dataset.agentId;
    const agent = this.agents.find((entry) => (entry.id || entry.agentId) === agentId);
    if (agent) {
      this.showAgentDetail(agent);
    }
  }

  async loadProviderCatalog() {
    if (this.providerCatalog) {
      return this.providerCatalog;
    }

    if (!this.api?.getProviders) {
      this.providerCatalog = { providers: [], models: [] };
      return this.providerCatalog;
    }

    const data = await this.api.getProviders();
    this.providerCatalog = {
      providers: Array.isArray(data?.providers) ? data.providers : [],
      models: Array.isArray(data?.models) ? data.models : []
    };
    return this.providerCatalog;
  }

  getModelsForProvider(providerId) {
    if (!this.providerCatalog?.models) return [];
    return this.providerCatalog.models.filter((model) => model.provider === providerId);
  }

  getSurfacesForProvider(providerId) {
    const provider = this.providerCatalog?.providers?.find((entry) => entry.id === providerId);
    const connectedModes = Array.isArray(provider?.connectedModes)
      ? provider.connectedModes
      : [];
    const supportedModes = Array.isArray(provider?.supportedModes) ? provider.supportedModes : [];
    const modes = connectedModes.length > 0
      ? connectedModes
      : supportedModes.length > 0
      ? supportedModes
      : (Array.isArray(provider?.modes) ? provider.modes : ['CLI']);
    return modes.map((mode) => {
      const lower = String(mode).trim().toLowerCase();
      if (lower === 'vs code' || lower === 'vscode') return 'vscode';
      if (lower === 'desktop') return 'desktop';
      if (lower === 'app') return 'app';
      return 'cli';
    });
  }

  getSurfaceStatusMap(providerId) {
    const provider = this.providerCatalog?.providers?.find((entry) => entry.id === providerId);
    return provider?.surfaceStatus && typeof provider.surfaceStatus === 'object'
      ? provider.surfaceStatus
      : {};
  }

  populateCreateAgentModelOptions(providerId) {
    const modelSelect = document.getElementById('createAgentModel');
    if (!modelSelect) return;

    const models = this.getModelsForProvider(providerId);
    if (models.length === 0) {
      modelSelect.innerHTML = '<option value="">Provider default</option>';
      return;
    }

    modelSelect.innerHTML = models.map((model) => (
      `<option value="${this.escapeHtml(model.id)}">${this.escapeHtml(model.name || model.id)}</option>`
    )).join('');
  }

  populateCreateAgentSurfaceOptions(providerId, modelId = '') {
    const surfaceSelect = document.getElementById('createAgentSurface');
    if (!surfaceSelect) return;

    const providerSurfaces = this.getSurfacesForProvider(providerId);
    const surfaceStatus = this.getSurfaceStatusMap(providerId);
    const model = this.providerCatalog?.models?.find((entry) => entry.id === modelId);
    const modelSurfaces = Array.isArray(model?.surfaces)
      ? model.surfaces
        .map((surface) => this.normalizeSurfaceForUi(surface))
        .filter(Boolean)
      : [];
    const surfaces = modelSurfaces.length > 0
      ? providerSurfaces.filter((surface) => modelSurfaces.includes(surface))
      : providerSurfaces;
    const uniqueSurfaces = Array.from(new Set(surfaces.length > 0 ? surfaces : ['cli']));
    surfaceSelect.innerHTML = uniqueSurfaces.map((surface) => {
      const online = Boolean(surfaceStatus[surface]);
      const label = `${surface.toUpperCase()} ${online ? '(online)' : '(offline)'}`;
      return `<option value="${surface}">${label}</option>`;
    }).join('');
    const preferredOnline = uniqueSurfaces.find((surface) => Boolean(surfaceStatus[surface]));
    if (preferredOnline) {
      surfaceSelect.value = preferredOnline;
    }
  }

  normalizeSurfaceForUi(surface) {
    const normalized = String(surface || '').trim().toLowerCase();
    if (['vs code', 'vs-code', 'vscode'].includes(normalized)) return 'vscode';
    if (['cli', 'terminal', 'shell'].includes(normalized)) return 'cli';
    if (normalized === 'app') return 'app';
    if (normalized === 'desktop') return 'desktop';
    return '';
  }

  async showCreateAgentModal() {
    try {
      await this.loadProviderCatalog();
    } catch (error) {
      Toast?.error?.(`Failed to load provider catalog: ${error.message}`);
      return;
    }

    this.closeCreateAgentModal();

    const overlay = document.getElementById('modalOverlay');
    overlay?.classList.add('active');

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'createAgentModal';

    const defaultProvider = this.providerCatalog?.providers?.[0]?.id || 'codex';
    const providerOptions = (this.providerCatalog?.providers || []).map((provider) => (
      `<option value="${this.escapeHtml(provider.id)}">${this.escapeHtml(provider.name || provider.id)}</option>`
    )).join('');

    modal.innerHTML = `
      <div class="modal-header">
        <h3>Create Agent</h3>
        <button class="btn-icon modal-close" id="closeCreateAgentModalBtn">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="createAgentName">Name *</label>
          <input type="text" id="createAgentName" placeholder="e.g., Backend Worker">
        </div>
        <div class="form-group">
          <label for="createAgentRole">Role</label>
          <input type="text" id="createAgentRole" placeholder="e.g., backend_developer">
        </div>
        <div class="form-group">
          <label for="createAgentTemplate">Template</label>
          <input type="text" id="createAgentTemplate" value="developer" placeholder="developer">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="createAgentProvider">Provider</label>
            <select id="createAgentProvider">
              ${providerOptions || '<option value="codex">Codex</option><option value="claude">Claude</option><option value="kimi">Kimi</option>'}
            </select>
          </div>
          <div class="form-group">
            <label for="createAgentSurface">Surface</label>
            <select id="createAgentSurface"></select>
          </div>
        </div>
        <div class="form-group">
          <label for="createAgentModel">Model</label>
          <select id="createAgentModel"></select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelCreateAgentBtn">Cancel</button>
        <button class="btn btn-primary" id="confirmCreateAgentBtn">
          <i data-lucide="plus"></i>
          <span>Create Agent</span>
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const providerSelect = document.getElementById('createAgentProvider');
    if (providerSelect) {
      providerSelect.value = defaultProvider;
      this.populateCreateAgentModelOptions(defaultProvider);
      const initialModel = document.getElementById('createAgentModel')?.value || '';
      this.populateCreateAgentSurfaceOptions(defaultProvider, initialModel);
      providerSelect.addEventListener('change', (event) => {
        const providerId = event.target.value;
        this.populateCreateAgentModelOptions(providerId);
        const selectedModel = document.getElementById('createAgentModel')?.value || '';
        this.populateCreateAgentSurfaceOptions(providerId, selectedModel);
      });
    }
    document.getElementById('createAgentModel')?.addEventListener('change', (event) => {
      const providerId = document.getElementById('createAgentProvider')?.value || defaultProvider;
      this.populateCreateAgentSurfaceOptions(providerId, event.target.value);
    });

    document.getElementById('closeCreateAgentModalBtn')?.addEventListener('click', this.closeCreateAgentModal);
    document.getElementById('cancelCreateAgentBtn')?.addEventListener('click', this.closeCreateAgentModal);
    document.getElementById('confirmCreateAgentBtn')?.addEventListener('click', this.createAgentFromModal);

    overlay?.addEventListener('click', this.closeCreateAgentModal, { once: true });
    agentsWindow.lucide?.createIcons?.();
  }

  closeCreateAgentModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay?.classList.remove('active');
    document.getElementById('createAgentModal')?.remove();
  }

  async createAgentFromModal() {
    const name = document.getElementById('createAgentName')?.value?.trim();
    const role = document.getElementById('createAgentRole')?.value?.trim();
    const templateName = document.getElementById('createAgentTemplate')?.value?.trim() || 'developer';
    const provider = document.getElementById('createAgentProvider')?.value;
    const model = document.getElementById('createAgentModel')?.value;
    const surface = document.getElementById('createAgentSurface')?.value;
    const submitBtn = document.getElementById('confirmCreateAgentBtn');

    if (!name) {
      Toast?.error?.('Agent name is required');
      return;
    }

    if (!this.api?.createAgent) {
      Toast?.error?.('Agents API is unavailable');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
    }
    try {
      const payload = { name, templateName, provider, model, surface };
      if (role) payload.role = role;
      const result = await this.api.createAgent(payload);
      this.closeCreateAgentModal();
      await this.refreshAgents();
      if (result?.warning) {
        Toast?.warning?.(result.warning);
      }
      Toast?.success?.(`Agent '${name}' created`);
    } catch (error) {
      Toast?.error?.(`Failed to create agent: ${error.message}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  }

  /**
   * Show agent detail panel
   */
  showAgentDetail(agent) {
    this.selectedAgent = agent;

    // Create modal container if not exists
    let modalContainer = document.getElementById('agentDetailModal');
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'agentDetailModal';
      modalContainer.className = 'modal-overlay';
      document.body.appendChild(modalContainer);
    }

    modalContainer.innerHTML = '<div class="modal modal-lg active" id="agentDetailContent"></div>';
    modalContainer.classList.add('active');

    const contentEl = document.getElementById('agentDetailContent');

    if (AgentDetailPanelCtor3) {
      this.detailPanel = new AgentDetailPanelCtor3({
        agent,
        container: contentEl,
        onClose: () => this.hideAgentDetail(),
        onSaveConfig: (config, agentData) => this.saveAgentConfig(agentData.id, config),
        onDeleteSession: (sessionId, agentData) => this.deleteAgentSession(agentData.id, sessionId),
        onAction: (action, agentData) => this.handleAgentAction(action, agentData.id, agentData),
      });
      this.detailPanel.renderElement();
    } else {
      // Fallback detail view
      contentEl.innerHTML = this.renderFallbackDetail(agent);
      this.attachFallbackListeners(contentEl);
    }

    // Close on overlay click
    modalContainer.addEventListener('click', (e) => {
      if (e.target === modalContainer) {
        this.hideAgentDetail();
      }
    });

    // Re-initialize icons
    agentsWindow.lucide?.createIcons?.();
  }

  /**
   * Fallback detail view when AgentDetailPanel not available
   */
  renderFallbackDetail(agent) {
    return `
      <div class="modal-header">
        <h3>${this.escapeHtml(agent.name || 'Agent Details')}</h3>
        <button class="btn-icon close-detail">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="agent-detail-basic">
          <p><strong>ID:</strong> ${this.escapeHtml(agent.id)}</p>
          <p><strong>Provider:</strong> ${this.escapeHtml(agent.provider || agent.adapterType || 'Unknown')}</p>
          <p><strong>Model:</strong> ${this.escapeHtml(agent.model || 'Default')}</p>
          <p><strong>Status:</strong> ${agent.status || 'unknown'}</p>
          <p><strong>Tasks Completed:</strong> ${agent.tasksCompleted || 0}</p>
          <p><strong>Success Rate:</strong> ${agent.successRate || 0}%</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary close-detail">Close</button>
        <button class="btn btn-primary" data-action="wake" data-agent-id="${agent.id}">Wake</button>
      </div>
    `;
  }

  /**
   * Attach listeners to fallback detail
   */
  attachFallbackListeners(container) {
    container.querySelectorAll('.close-detail').forEach(btn => {
      btn.addEventListener('click', () => this.hideAgentDetail());
    });

    container.querySelector('[data-action="wake"]')?.addEventListener('click', () => {
      this.handleAgentAction('wake', this.selectedAgent.id, this.selectedAgent);
    });
  }

  /**
   * Hide agent detail panel
   */
  hideAgentDetail() {
    const modalContainer = document.getElementById('agentDetailModal');
    if (modalContainer) {
      modalContainer.classList.remove('active');
      setTimeout(() => modalContainer.remove(), 300);
    }
    this.selectedAgent = null;
    this.detailPanel = null;
  }

  /**
   * Save agent configuration
   */
  async saveAgentConfig(agentId, config) {
    try {
      if (this.api?.updateAgentConfig) {
        await this.api.updateAgentConfig(agentId, config);
        Toast?.success?.('Configuration saved');
        this.loadAgents();
      } else {
        console.warn('updateAgentConfig API not available');
        Toast?.warning?.('API not available for saving config');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      Toast?.error?.('Failed to save configuration');
    }
  }

  /**
   * Delete agent session
   */
  async deleteAgentSession(agentId, sessionId) {
    try {
      if (this.api?.deleteAgentSession) {
        await this.api.deleteAgentSession(agentId, sessionId);
        Toast?.success?.('Session deleted');
        // Refresh the panel
        if (this.selectedAgent?.id === agentId) {
          this.selectedAgent.sessions = (this.selectedAgent.sessions || [])
            .filter(s => s.id !== sessionId);
          this.detailPanel?.updateAgent?.(this.selectedAgent);
        }
      } else {
        Toast?.warning?.('Session deletion is not available in this build');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      Toast?.error?.('Failed to delete session');
    }
  }

  /**
   * Setup WebSocket listeners for real-time updates
   */
  setupWebSocketListeners() {
    if (!this.ws) return;

    // Subscribe to agents channel
    this.ws.subscribe?.('agents');

    // Listen for specific events
    this.ws.addEventListener?.('message:agent.status', this.handleWebSocketMessage);
    this.ws.addEventListener?.('message:agent.updated', this.handleWebSocketMessage);
    this.ws.addEventListener?.('message:agent.created', () => this.refreshAgents());
    this.ws.addEventListener?.('message:agent.deleted', () => this.refreshAgents());

    // Generic message handler
    this.ws.addEventListener?.('message', (event) => {
      const data = event?.detail || event?.data;
      if (data?.type?.startsWith('agent.')) {
        this.handleWebSocketMessage(event);
      }
    });
  }

  /**
   * Handle WebSocket messages
   */
  handleWebSocketMessage(event) {
    const data = event?.detail || event?.data;
    if (!data) return;

    const agentId = data.agentId || data.id;
    
    if (agentId) {
      // Update existing agent
      const agentIndex = this.agents.findIndex(a => (a.id || a.agentId) === agentId);
      if (agentIndex >= 0) {
        this.agents[agentIndex] = { ...this.agents[agentIndex], ...data };
        this.updateAgentCard(agentId);
        
        // Update detail panel if open
        if (this.selectedAgent?.id === agentId && this.detailPanel) {
          this.selectedAgent = { ...this.selectedAgent, ...data };
          this.detailPanel.updateAgent?.(this.selectedAgent);
        }
      } else {
        // New agent, refresh full list
        this.refreshAgents();
      }
    }
  }

  /**
   * Update a single agent card in the DOM
   */
  updateAgentCard(agentId) {
    const agent = this.agents.find(a => (a.id || a.agentId) === agentId);
    if (!agent) return;

    const existingCard = document.querySelector(`[data-agent-id="${agentId}"]`);
    if (existingCard) {
      const newCardHtml = this.renderAgentCard(agent);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = newCardHtml;
      const newCard = wrapper.firstElementChild;
      existingCard.replaceWith(newCard);

      // Re-initialize icons
      agentsWindow.lucide?.createIcons?.();
    }
  }

  /**
   * Update agent status (for optimistic updates)
   */
  updateAgentStatus(agentId, updates) {
    const agent = this.agents.find(a => (a.id || a.agentId) === agentId);
    if (agent) {
      Object.assign(agent, updates);
      this.updateAgentCard(agentId);
    }
  }

  /**
   * Refresh agents list
   */
  async refreshAgents() {
    const refreshBtn = document.getElementById('refreshAgentsBtn');
    if (refreshBtn) {
      refreshBtn.classList.add('spinning');
    }

    await this.loadAgents();

    if (refreshBtn) {
      setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
    }
  }

  /**
   * Start polling for status updates
   */
  startPolling(intervalMs = 30000) {
    this.stopPolling();
    this.pollingInterval = setInterval(() => {
      if (!this.loading) {
        this.loadAgents();
      }
    }, intervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Update dashboard active agents count
   */
  updateDashboardCount() {
    const activeCount = this.agents.filter(a => 
      ['online', 'busy'].includes((a.status || '').toLowerCase())
    ).length;

    const countEl = document.getElementById('activeAgents');
    if (countEl) {
      countEl.textContent = activeCount;
    }

    // Update sidebar indicator
    const statusIndicator = document.getElementById('agentStatus');
    if (statusIndicator) {
      statusIndicator.className = 'status-indicator ' + (activeCount > 0 ? 'online' : 'offline');
    }
  }

  /**
   * Initialize Active Agents Panel for dashboard
   */
  initializeActiveAgentsPanel(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container || !ActiveAgentsPanelCtor3) return null;

    this.activeAgentsPanel = new ActiveAgentsPanelCtor3({
      container,
      api: this.api,
      ws: this.ws,
      onAgentClick: this.handleAgentClick,
      onAgentAction: this.handleAgentAction,
      ...options,
    });

    this.activeAgentsPanel.initialize();
    return this.activeAgentsPanel;
  }

  /**
   * Format timestamp to relative time
   */
  formatTimeAgo(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

    return date.toLocaleDateString();
  }

  /**
   * Utility: Escape HTML for XSS safety
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Dispose the component
   */
  dispose() {
    this.stopPolling();
    this.activeAgentsPanel?.dispose?.();
    document.getElementById('agentsGrid')?.removeEventListener('click', this.handleAgentsGridClick);
    
    if (this.ws) {
      this.ws.removeEventListener?.('message:agent.status', this.handleWebSocketMessage);
      this.ws.removeEventListener?.('message:agent.updated', this.handleWebSocketMessage);
    }
  }
}

// Global instance for debugging
if (typeof window !== 'undefined') {
  window.AgentsComponent = AgentsComponent;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AgentsComponent };
}
