/**
 * CogniMesh v5.0 - Active Agents Panel Component
 * Dashboard widget showing active agents with real-time updates
 */

/* global Toast */

const activeAgentsWindow = typeof window !== 'undefined' ? window : globalThis;
const AgentCardCtor = typeof activeAgentsWindow.AgentCard === 'function' 
  ? activeAgentsWindow.AgentCard 
  : null;

/**
 * Active Agents Panel Component
 * Grid of agent cards with WebSocket real-time updates
 */
class ActiveAgentsPanel {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element
   * @param {Object} [options.api] - API client for fetching agents
   * @param {Object} [options.ws] - WebSocket client for real-time updates
   * @param {Function} [options.onAgentClick] - Callback when agent card is clicked
   * @param {Function} [options.onAgentAction] - Callback for agent actions (wake, pause, stop)
   * @param {number} [options.maxAgents=8] - Maximum agents to display
   * @param {boolean} [options.compact=false] - Compact mode
   * @param {boolean} [options.showHeader=true] - Show panel header
   */
  constructor(options = {}) {
    this.container = options.container || null;
    this.api = options.api || null;
    this.ws = options.ws || null;
    this.onAgentClick = options.onAgentClick || null;
    this.onAgentAction = options.onAgentAction || null;
    this.maxAgents = options.maxAgents || 8;
    this.compact = options.compact || false;
    this.showHeader = options.showHeader !== false;

    this.agents = [];
    this.loading = false;
    this.pollingInterval = null;
    this.element = null;
    this.agentsGrid = null;

    // Bind methods
    this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
    this.refreshAgents = this.refreshAgents.bind(this);
  }

  /**
   * Initialize the panel
   */
  async initialize() {
    if (!this.container) {
      throw new Error('ActiveAgentsPanel: container is required');
    }

    this.render();
    this.setupWebSocketListeners();
    await this.loadAgents();
    this.startPolling();
  }

  /**
   * Load agents from API
   */
  async loadAgents() {
    if (this.loading) return;
    this.loading = true;
    this.showLoading();

    try {
      if (this.api?.getAgents) {
        const data = await this.api.getAgents();
        this.agents = this.processAgents(data.agents || []);
      } else {
        // Fallback to empty state if API unavailable
        this.agents = [];
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
      Toast?.error?.('Failed to load agents') || console.error('Failed to load agents');
    } finally {
      this.loading = false;
      this.renderAgents();
    }
  }

  /**
   * Process and filter agents
   */
  processAgents(agents) {
    // Sort by status (active first) then by name
    return agents
      .sort((a, b) => {
        const statusOrder = { online: 0, busy: 1, paused: 2, error: 3, offline: 4 };
        const statusDiff = (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4);
        if (statusDiff !== 0) return statusDiff;
        return (a.name || '').localeCompare(b.name || '');
      })
      .slice(0, this.maxAgents);
  }

  /**
   * Show loading state
   */
  showLoading() {
    if (this.agentsGrid) {
      this.agentsGrid.innerHTML = `
        <div class="agents-loading">
          <div class="loading-spinner"></div>
          <span>Loading agents...</span>
        </div>
      `;
    }
  }

  /**
   * Render the panel structure
   */
  render() {
    const headerHtml = this.showHeader ? `
      <div class="active-agents-header">
        <div class="header-title">
          <i data-lucide="bot" style="width: 20px; height: 20px;"></i>
          <h3>Active Agents</h3>
          <span class="agent-count-badge" id="agentCountBadge">0</span>
        </div>
        <div class="header-actions">
          <button class="btn-icon refresh-agents" title="Refresh">
            <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
          </button>
          <a href="#agents" class="link-view-all" data-view="agents">
            View all <i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i>
          </a>
        </div>
      </div>
    ` : '';

    this.container.innerHTML = `
      <div class="active-agents-panel ${this.compact ? 'compact' : ''}">
        ${headerHtml}
        <div class="active-agents-grid" id="activeAgentsGrid_${this.container.id || 'main'}"></div>
      </div>
    `;

    this.element = this.container.firstElementChild;
    this.agentsGrid = this.element.querySelector(`[id^="activeAgentsGrid_"]`);

    // Attach event listeners
    this.attachEventListeners();

    // Initialize Lucide icons
    if (typeof activeAgentsWindow.lucide?.createIcons === 'function') {
      activeAgentsWindow.lucide.createIcons();
    }
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Refresh button
    this.element?.querySelector('.refresh-agents')?.addEventListener('click', () => {
      this.refreshAgents();
    });

    // View all link
    this.element?.querySelector('[data-view="agents"]')?.addEventListener('click', (e) => {
      if (this.onAgentClick) {
        e.preventDefault();
        // Navigate to agents view
        document.querySelector('[data-view="agents"]')?.click();
      }
    });
  }

  /**
   * Render agents grid
   */
  renderAgents() {
    if (!this.agentsGrid) return;

    // Update badge count
    const badge = this.element?.querySelector('#agentCountBadge');
    if (badge) {
      const activeCount = this.agents.filter(a => 
        ['online', 'busy'].includes((a.status || '').toLowerCase())
      ).length;
      badge.textContent = activeCount;
      badge.title = `${this.agents.length} total agents`;
    }

    if (this.agents.length === 0) {
      this.agentsGrid.innerHTML = this.renderEmptyState();
    } else {
      this.agentsGrid.innerHTML = this.agents.map(agent => this.renderAgentCard(agent)).join('');
      this.attachCardEventListeners();
    }

    // Initialize Lucide icons
    if (typeof activeAgentsWindow.lucide?.createIcons === 'function') {
      activeAgentsWindow.lucide.createIcons();
    }
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    return `
      <div class="agents-empty-state">
        <div class="empty-icon">
          <i data-lucide="bot" style="width: 48px; height: 48px;"></i>
        </div>
        <h4>No Active Agents</h4>
        <p>No agents are currently running or available.</p>
        <button class="btn btn-secondary btn-sm refresh-empty" style="margin-top: 0.75rem;">
          <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
          <span>Refresh</span>
        </button>
      </div>
    `;
  }

  /**
   * Render a single agent card
   */
  renderAgentCard(agent) {
    if (AgentCardCtor) {
      const card = new AgentCardCtor({
        agent,
        compact: this.compact,
        showQuickActions: true,
        showCost: !this.compact,
        onClick: (agentData) => this.onAgentClick?.(agentData),
        onWake: (id, data) => this.onAgentAction?.('wake', id, data),
        onPause: (id, data) => this.onAgentAction?.('pause', id, data),
        onStop: (id, data) => this.onAgentAction?.('stop', id, data),
      });
      return card.render();
    }

    // Fallback HTML if AgentCard not available
    const status = (agent.status || 'offline').toLowerCase();
    const statusColors = {
      online: '#22c55e',
      offline: '#64748b',
      busy: '#f59e0b',
      error: '#ef4444',
      paused: '#8b5cf6',
    };

    return `
      <div class="agent-card-mini" data-agent-id="${agent.id || ''}" data-status="${status}">
        <div class="agent-mini-header">
          <div class="agent-mini-avatar">
            <i data-lucide="bot" style="width: 20px; height: 20px;"></i>
          </div>
          <div class="agent-mini-info">
            <span class="agent-mini-name">${this.escapeHtml(agent.name || 'Unknown')}</span>
            <span class="agent-mini-status" style="color: ${statusColors[status] || statusColors.offline}">
              ${status}
            </span>
          </div>
        </div>
        ${!this.compact ? `
          <div class="agent-mini-actions">
            <button class="action-btn-mini wake" data-action="wake" data-agent-id="${agent.id || ''}">
              <i data-lucide="play" style="width: 12px; height: 12px;"></i>
            </button>
            <button class="action-btn-mini pause" data-action="pause" data-agent-id="${agent.id || ''}">
              <i data-lucide="pause" style="width: 12px; height: 12px;"></i>
            </button>
            <button class="action-btn-mini stop" data-action="stop" data-agent-id="${agent.id || ''}">
              <i data-lucide="square" style="width: 12px; height: 12px;"></i>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Attach event listeners to agent cards
   */
  attachCardEventListeners() {
    // Card click
    this.agentsGrid?.querySelectorAll('.agent-card, .agent-card-mini').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn') && !e.target.closest('.action-btn-mini')) {
          const agentId = card.dataset.agentId;
          const agent = this.agents.find(a => (a.id || a.agentId) === agentId);
          if (agent) this.onAgentClick?.(agent);
        }
      });
    });

    // Action buttons
    this.agentsGrid?.querySelectorAll('.action-btn, .action-btn-mini').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const agentId = btn.dataset.agentId;
        const agent = this.agents.find(a => (a.id || a.agentId) === agentId);
        if (agent) this.onAgentAction?.(action, agentId, agent);
      });
    });

    // Empty state refresh
    this.agentsGrid?.querySelector('.refresh-empty')?.addEventListener('click', () => {
      this.refreshAgents();
    });
  }

  /**
   * Refresh agents list
   */
  async refreshAgents() {
    const refreshBtn = this.element?.querySelector('.refresh-agents');
    if (refreshBtn) {
      refreshBtn.classList.add('spinning');
    }

    await this.loadAgents();

    if (refreshBtn) {
      setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
    }
  }

  /**
   * Setup WebSocket listeners
   */
  setupWebSocketListeners() {
    if (!this.ws) return;

    // Subscribe to agent updates
    this.ws.subscribe?.('agents');

    // Listen for agent status changes
    this.ws.addEventListener?.('message:agent.status', this.handleWebSocketMessage);
    this.ws.addEventListener?.('message:agent.updated', this.handleWebSocketMessage);
    this.ws.addEventListener?.('message:agent.created', () => this.refreshAgents());
    this.ws.addEventListener?.('message:agent.deleted', () => this.refreshAgents());

    // Generic agent message handler
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
    const status = data.status;

    if (agentId && status) {
      // Update existing agent
      const agentIndex = this.agents.findIndex(a => (a.id || a.agentId) === agentId);
      if (agentIndex >= 0) {
        this.agents[agentIndex] = { ...this.agents[agentIndex], ...data };
        this.updateAgentCard(agentId);
      } else {
        // New agent, refresh full list
        this.refreshAgents();
      }
    }
  }

  /**
   * Update a single agent card
   */
  updateAgentCard(agentId) {
    const agent = this.agents.find(a => (a.id || a.agentId) === agentId);
    if (!agent || !this.agentsGrid) return;

    const existingCard = this.agentsGrid.querySelector(`[data-agent-id="${agentId}"]`);
    if (existingCard) {
      const newCardHtml = this.renderAgentCard(agent);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = newCardHtml;
      const newCard = wrapper.firstElementChild;
      
      existingCard.replaceWith(newCard);
      
      // Re-attach event listeners for this card
      newCard.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn') && !e.target.closest('.action-btn-mini')) {
          this.onAgentClick?.(agent);
        }
      });

      newCard.querySelectorAll('.action-btn, .action-btn-mini').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          this.onAgentAction?.(action, agentId, agent);
        });
      });

      // Re-initialize icons
      if (typeof activeAgentsWindow.lucide?.createIcons === 'function') {
        activeAgentsWindow.lucide.createIcons();
      }
    }
  }

  /**
   * Start polling for updates
   */
  startPolling(intervalMs = 30000) {
    this.stopPolling();
    this.pollingInterval = setInterval(() => {
      this.loadAgents();
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
   * Update a specific agent by ID
   */
  updateAgent(agentId, updates) {
    const agentIndex = this.agents.findIndex(a => (a.id || a.agentId) === agentId);
    if (agentIndex >= 0) {
      this.agents[agentIndex] = { ...this.agents[agentIndex], ...updates };
      this.updateAgentCard(agentId);
    }
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Dispose the panel
   */
  dispose() {
    this.stopPolling();
    if (this.ws) {
      this.ws.removeEventListener?.('message:agent.status', this.handleWebSocketMessage);
      this.ws.removeEventListener?.('message:agent.updated', this.handleWebSocketMessage);
    }
  }

  /**
   * Get CSS styles
   */
  static getStyles() {
    return `
      .active-agents-panel {
        background-color: var(--color-bg-secondary, #1e293b);
        border: 1px solid var(--color-border, #334155);
        border-radius: var(--radius-lg, 0.75rem);
        overflow: hidden;
      }

      .active-agents-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--spacing-md, 1rem) var(--spacing-lg, 1.5rem);
        border-bottom: 1px solid var(--color-border, #334155);
      }

      .header-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .header-title h3 {
        font-size: var(--font-size-md, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        margin: 0;
      }

      .agent-count-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 24px;
        padding: 0 0.5rem;
        background-color: var(--color-brand-primary, #3b82f6);
        color: white;
        font-size: var(--font-size-xs, 0.75rem);
        font-weight: 600;
        border-radius: var(--radius-full, 9999px);
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .link-view-all {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: var(--font-size-sm, 0.875rem);
        color: var(--color-brand-primary, #3b82f6);
        text-decoration: none;
      }

      .link-view-all:hover {
        text-decoration: underline;
      }

      .btn-icon.spinning i {
        animation: spin 1s linear infinite;
      }

      .active-agents-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--spacing-md, 1rem);
        padding: var(--spacing-md, 1rem);
        min-height: 200px;
      }

      .compact .active-agents-grid {
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      }

      .agents-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-md, 1rem);
        grid-column: 1 / -1;
        min-height: 200px;
        color: var(--color-text-secondary, #cbd5e1);
      }

      .loading-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border, #334155);
        border-top-color: var(--color-brand-primary, #3b82f6);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      .agents-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-sm, 0.5rem);
        grid-column: 1 / -1;
        min-height: 200px;
        text-align: center;
        color: var(--color-text-tertiary, #94a3b8);
      }

      .agents-empty-state .empty-icon {
        color: var(--color-text-tertiary, #94a3b8);
        opacity: 0.5;
      }

      .agents-empty-state h4 {
        font-size: var(--font-size-md, 1rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary, #cbd5e1);
        margin: 0;
      }

      .agents-empty-state p {
        font-size: var(--font-size-sm, 0.875rem);
        margin: 0;
      }

      /* Mini card styles (fallback) */
      .agent-card-mini {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--spacing-md, 1rem);
        background-color: var(--color-bg-primary, #0f172a);
        border: 1px solid var(--color-border, #334155);
        border-radius: var(--radius-md, 0.5rem);
        transition: all 0.2s ease;
        cursor: pointer;
      }

      .agent-card-mini:hover {
        border-color: var(--color-border-hover, #475569);
        transform: translateY(-2px);
      }

      .agent-mini-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .agent-mini-avatar {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--color-bg-tertiary, #334155);
        border-radius: var(--radius-md, 0.5rem);
        color: var(--color-brand-primary, #3b82f6);
      }

      .agent-mini-info {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }

      .agent-mini-name {
        font-weight: 500;
        font-size: var(--font-size-sm, 0.875rem);
        color: var(--color-text-primary, #f8fafc);
      }

      .agent-mini-status {
        font-size: var(--font-size-xs, 0.75rem);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .agent-mini-actions {
        display: flex;
        gap: 0.25rem;
      }

      .action-btn-mini {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-sm, 0.375rem);
        border: none;
        background-color: var(--color-bg-tertiary, #334155);
        color: var(--color-text-secondary, #cbd5e1);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .action-btn-mini:hover:not(:disabled) {
        background-color: var(--color-bg-hover, #475569);
        color: var(--color-text-primary, #f8fafc);
      }

      .action-btn-mini:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      @media (max-width: 768px) {
        .active-agents-grid {
          grid-template-columns: 1fr;
        }
        .compact .active-agents-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `;
  }

  /**
   * Inject styles
   */
  static injectStyles() {
    if (document.getElementById('active-agents-panel-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'active-agents-panel-styles';
    styleEl.textContent = ActiveAgentsPanel.getStyles();
    document.head.appendChild(styleEl);
  }
}

// Inject styles on load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ActiveAgentsPanel.injectStyles());
  } else {
    ActiveAgentsPanel.injectStyles();
  }
}

if (typeof window !== 'undefined') {
  window.ActiveAgentsPanel = ActiveAgentsPanel;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ActiveAgentsPanel };
}
