/**
 * CogniMesh v5.0 - Agent Detail Panel Component
 * Full agent detail view with tabs: Overview, Config, Runs, Sessions, Cost
 */

const agentDetailWindow = typeof window !== 'undefined' ? window : globalThis;
const AgentStatusBadgeCtor2 = typeof agentDetailWindow.AgentStatusBadge === 'function' 
  ? agentDetailWindow.AgentStatusBadge 
  : null;

/**
 * Agent Detail Panel Component
 * Comprehensive agent management interface with tabbed navigation
 */
class AgentDetailPanel {
  /**
   * @param {Object} options
   * @param {Object} options.agent - Agent data
   * @param {HTMLElement} options.container - Container element to render into
   * @param {Function} [options.onClose] - Callback when panel is closed
   * @param {Function} [options.onSaveConfig] - Callback when config is saved
   * @param {Function} [options.onDeleteSession] - Callback when session is deleted
   * @param {Function} [options.onAction] - Callback for agent actions (wake, pause, stop)
   */
  constructor(options = {}) {
    this.agent = options.agent || {};
    this.container = options.container || null;
    this.onClose = options.onClose || null;
    this.onSaveConfig = options.onSaveConfig || null;
    this.onDeleteSession = options.onDeleteSession || null;
    this.onAction = options.onAction || null;

    this.currentTab = 'overview';
    this.id = this.agent.id || this.agent.agentId || `agent-detail-${Date.now()}`;
    this.element = null;
    this.persistentListenersBound = false;

    // Tab datasets resolved from current agent payload
    this.runs = this.agent.runs || [];
    this.sessions = this.agent.sessions || [];
    this.config = this.agent.config || this.agent.adapterConfig || {};
  }

  /**
   * Format currency
   */
  formatCurrency(value) {
    const num = Number(value) || 0;
    return `$${num.toFixed(4)}`;
  }

  /**
   * Format date/time
   */
  formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  /**
   * Format duration
   */
  formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${mins % 60}m`;
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    return `${mins}m ${Math.floor(seconds % 60)}s`;
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
   * Get status badge HTML
   */
  getStatusBadge(status) {
    if (AgentStatusBadgeCtor2) {
      return AgentStatusBadgeCtor2.render(status, { size: 'sm' });
    }
    return `<span class="status-badge ${status}">${status}</span>`;
  }

  /**
   * Get provider color
   */
  getProviderColor(provider) {
    const colors = {
      claude: '#d97706',
      codex: '#10b981',
      kimi: '#8b5cf6',
      cursor: '#3b82f6',
      gemini: '#06b6d4',
      opencode: '#f59e0b',
    };
    return colors[provider?.toLowerCase()] || '#64748b';
  }

  /**
   * Render tab navigation
   */
  renderTabs() {
    const tabs = [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'config', label: 'Config', icon: 'settings' },
      { id: 'runs', label: 'Runs', icon: 'play-circle' },
      { id: 'sessions', label: 'Sessions', icon: 'layers' },
      { id: 'cost', label: 'Cost', icon: 'dollar-sign' },
    ];

    return `
      <div class="detail-tabs">
        ${tabs.map(tab => `
          <button class="detail-tab ${this.currentTab === tab.id ? 'active' : ''}" 
                  data-tab="${tab.id}">
            <i data-lucide="${tab.icon}" style="width: 16px; height: 16px;"></i>
            <span>${tab.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render Overview tab
   */
  renderOverviewTab() {
    const status = (this.agent.status || 'offline').toLowerCase();
    const name = this.agent.name || 'Unknown Agent';
    const provider = this.agent.provider || this.agent.adapterType || 'Unknown';
    const model = this.agent.model || 'Default';
    const capabilities = Array.isArray(this.agent.capabilities) ? this.agent.capabilities : [];

    return `
      <div class="tab-content overview-tab">
        <div class="overview-header">
          <div class="agent-identity">
            <div class="agent-avatar-large" style="background-color: ${this.getProviderColor(provider)}20;">
              <i data-lucide="bot" style="width: 32px; height: 32px; color: ${this.getProviderColor(provider)};"></i>
            </div>
            <div class="agent-identity-info">
              <h3>${this.escapeHtml(name)}</h3>
              <p class="agent-subtitle">${this.escapeHtml(provider)} - ${this.escapeHtml(model)}</p>
            </div>
          </div>
          <div class="agent-actions-bar">
            ${this.getStatusBadge(status)}
            <button class="btn-action wake" data-action="wake">
              <i data-lucide="play" style="width: 16px; height: 16px;"></i>
              <span>Wake</span>
            </button>
            <button class="btn-action pause" data-action="pause">
              <i data-lucide="pause" style="width: 16px; height: 16px;"></i>
              <span>Pause</span>
            </button>
            <button class="btn-action stop" data-action="stop">
              <i data-lucide="square" style="width: 16px; height: 16px;"></i>
              <span>Stop</span>
            </button>
          </div>
        </div>

        <div class="overview-stats">
          <div class="stat-card">
            <div class="stat-icon">
              <i data-lucide="check-circle" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value">${this.agent.tasksCompleted || 0}</span>
              <span class="stat-label">Tasks Completed</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">
              <i data-lucide="trending-up" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value">${this.agent.successRate || 0}%</span>
              <span class="stat-label">Success Rate</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">
              <i data-lucide="clock" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value">${this.formatDuration(this.agent.totalRuntime)}</span>
              <span class="stat-label">Total Runtime</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">
              <i data-lucide="dollar-sign" style="width: 20px; height: 20px;"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value">${this.formatCurrency(this.agent.totalCost || 0)}</span>
              <span class="stat-label">Total Cost</span>
            </div>
          </div>
        </div>

        ${capabilities.length > 0 ? `
          <div class="overview-section">
            <h4>Capabilities</h4>
            <div class="capabilities-list">
              ${capabilities.map(cap => `
                <span class="capability-tag">${this.escapeHtml(cap)}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="overview-section">
          <h4>Agent Details</h4>
          <div class="details-grid">
            <div class="detail-item">
              <span class="detail-label">ID</span>
              <span class="detail-value monospace">${this.escapeHtml(this.agent.id || 'N/A')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Created</span>
              <span class="detail-value">${this.formatDateTime(this.agent.createdAt)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Last Active</span>
              <span class="detail-value">${this.formatDateTime(this.agent.lastActive)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Version</span>
              <span class="detail-value">${this.escapeHtml(this.agent.version || 'N/A')}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Config tab
   */
  renderConfigTab() {
    const config = this.config;
    const env = config.env || {};
    const envEntries = Object.entries(env);

    return `
      <div class="tab-content config-tab">
        <div class="config-header">
          <h4>Configuration Editor</h4>
          <button class="btn btn-primary" id="saveConfigBtn">
            <i data-lucide="save" style="width: 16px; height: 16px;"></i>
            <span>Save Changes</span>
          </button>
        </div>

        <div class="config-form">
          <div class="form-section">
            <h5>Basic Settings</h5>
            <div class="form-group">
              <label>Model</label>
              <input type="text" id="configModel" value="${this.escapeHtml(config.model || '')}" placeholder="e.g., gpt-5.4-codex">
            </div>
            <div class="form-group">
              <label>Timeout (seconds)</label>
              <input type="number" id="configTimeout" value="${config.timeoutSec || 300}" min="0">
            </div>
            <div class="form-group">
              <label>Grace Period (seconds)</label>
              <input type="number" id="configGrace" value="${config.graceSec || 15}" min="0">
            </div>
          </div>

          <div class="form-section">
            <h5>Command & Arguments</h5>
            <div class="form-group">
              <label>Command</label>
              <input type="text" id="configCommand" value="${this.escapeHtml(config.command || '')}" placeholder="e.g., claude">
            </div>
            <div class="form-group">
              <label>Extra Arguments (comma-separated)</label>
              <input type="text" id="configArgs" value="${this.escapeHtml((config.extraArgs || []).join(', '))}" placeholder="e.g., --verbose, --debug">
            </div>
          </div>

          <div class="form-section">
            <h5>Environment Variables</h5>
            <div id="envVarsContainer">
              ${envEntries.length > 0 ? envEntries.map(([key, value]) => `
                <div class="env-var-row">
                  <input type="text" class="env-key" value="${this.escapeHtml(key)}" placeholder="KEY">
                  <input type="text" class="env-value" value="${this.escapeHtml(typeof value === 'object' ? value.value : value)}" placeholder="value">
                  <button class="btn-icon remove-env" title="Remove">
                    <i data-lucide="x" style="width: 16px; height: 16px;"></i>
                  </button>
                </div>
              `).join('') : '<p class="text-muted">No environment variables set</p>'}
            </div>
            <button class="btn btn-secondary" id="addEnvVar">
              <i data-lucide="plus" style="width: 16px; height: 16px;"></i>
              <span>Add Variable</span>
            </button>
          </div>

          <div class="form-section">
            <h5>Heartbeat Settings</h5>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="configHeartbeat" ${config.heartbeat?.enabled !== false ? 'checked' : ''}>
                <span>Enable heartbeat</span>
              </label>
            </div>
            <div class="form-group">
              <label>Interval (seconds)</label>
              <input type="number" id="configInterval" value="${config.heartbeat?.intervalSec || 300}" min="10">
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Runs tab
   */
  renderRunsTab() {
    const runs = this.runs.slice(0, 20); // Show last 20 runs

    if (runs.length === 0) {
      return `
        <div class="tab-content runs-tab">
          <div class="empty-state">
            <i data-lucide="play-circle" style="width: 48px; height: 48px;"></i>
            <p>No runs recorded yet</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="tab-content runs-tab">
        <div class="runs-header">
          <h4>Run History</h4>
          <span class="text-muted">${this.runs.length} total runs</span>
        </div>
        <div class="runs-list">
          ${runs.map(run => `
            <div class="run-item" data-run-id="${run.id || ''}">
              <div class="run-status">
                ${this.getStatusBadge(run.status || 'unknown')}
              </div>
              <div class="run-info">
                <span class="run-name">${this.escapeHtml(run.name || run.task || 'Unnamed run')}</span>
                <span class="run-time">${this.formatDateTime(run.startedAt || run.createdAt)}</span>
              </div>
              <div class="run-stats">
                <span class="run-duration">${this.formatDuration(run.duration)}</span>
                ${run.cost ? `<span class="run-cost">${this.formatCurrency(run.cost)}</span>` : ''}
              </div>
              <button class="btn-icon view-run" title="View details">
                <i data-lucide="external-link" style="width: 16px; height: 16px;"></i>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render Sessions tab
   */
  renderSessionsTab() {
    const sessions = this.sessions;

    if (sessions.length === 0) {
      return `
        <div class="tab-content sessions-tab">
          <div class="empty-state">
            <i data-lucide="layers" style="width: 48px; height: 48px;"></i>
            <p>No active sessions</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="tab-content sessions-tab">
        <div class="sessions-header">
          <h4>Active Sessions</h4>
          <button class="btn btn-secondary" id="cleanupSessions">
            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
            <span>Cleanup Old</span>
          </button>
        </div>
        <div class="sessions-list">
          ${sessions.map(session => `
            <div class="session-item" data-session-id="${session.id || ''}">
              <div class="session-info">
                <div class="session-id">
                  <i data-lucide="hash" style="width: 14px; height: 14px;"></i>
                  <span class="monospace">${this.escapeHtml((session.id || '').slice(0, 12))}...</span>
                </div>
                <span class="session-created">Created: ${this.formatDateTime(session.createdAt)}</span>
              </div>
              <div class="session-stats">
                <span class="session-messages">${session.messageCount || 0} messages</span>
                ${session.cost ? `<span class="session-cost">${this.formatCurrency(session.cost)}</span>` : ''}
              </div>
              <button class="btn-icon delete-session" title="Delete session" data-session-id="${session.id || ''}">
                <i data-lucide="trash" style="width: 16px; height: 16px;"></i>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render Cost tab
   */
  renderCostTab() {
    const totalCost = Number(this.agent.totalCost || 0);
    const rawBreakdown = this.agent.costBreakdown && typeof this.agent.costBreakdown === 'object'
      ? this.agent.costBreakdown
      : null;
    const breakdownEntries = rawBreakdown
      ? [
          { label: 'Input Tokens', value: Number(rawBreakdown.input || 0), cssClass: 'input' },
          { label: 'Output Tokens', value: Number(rawBreakdown.output || 0), cssClass: 'output' },
          { label: 'Other', value: Number(rawBreakdown.other || 0), cssClass: 'other' }
        ].filter((entry) => Number.isFinite(entry.value) && entry.value >= 0)
      : [];
    const breakdownTotal = breakdownEntries.reduce((sum, entry) => sum + entry.value, 0);
    const breakdownHtml = breakdownEntries.length > 0
      ? `
          <div class="cost-categories">
            ${breakdownEntries.map((entry) => {
              const percent = breakdownTotal > 0 ? (entry.value / breakdownTotal) * 100 : 0;
              return `
                <div class="cost-category">
                  <div class="category-header">
                    <span class="category-name">${entry.label}</span>
                    <span class="category-value">${this.formatCurrency(entry.value)}</span>
                  </div>
                  <div class="category-bar">
                    <div class="category-fill ${entry.cssClass}" style="width: ${percent}%"></div>
                  </div>
                  <span class="category-percent">${percent.toFixed(1)}%</span>
                </div>
              `;
            }).join('')}
          </div>
        `
      : '<p class="text-muted">No cost breakdown available yet</p>';

    return `
      <div class="tab-content cost-tab">
        <div class="cost-overview">
          <div class="cost-total-card">
            <div class="cost-total-icon">
              <i data-lucide="wallet" style="width: 32px; height: 32px;"></i>
            </div>
            <div class="cost-total-info">
              <span class="cost-total-value">${this.formatCurrency(totalCost)}</span>
              <span class="cost-total-label">Total Spent</span>
            </div>
          </div>
        </div>

        <div class="cost-breakdown">
          <h4>Cost Breakdown</h4>
          ${breakdownHtml}
        </div>

        <div class="cost-history">
          <h4>Recent Activity</h4>
          <div class="cost-history-list">
            ${(this.agent.costHistory || []).slice(0, 10).map(entry => `
              <div class="cost-history-item">
                <div class="history-info">
                  <span class="history-description">${this.escapeHtml(entry.description || 'Unknown activity')}</span>
                  <span class="history-time">${this.formatDateTime(entry.timestamp)}</span>
                </div>
                <span class="history-amount">${this.formatCurrency(entry.amount)}</span>
              </div>
            `).join('') || '<p class="text-muted">No recent cost activity</p>'}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render current tab content
   */
  renderTabContent() {
    switch (this.currentTab) {
      case 'overview': return this.renderOverviewTab();
      case 'config': return this.renderConfigTab();
      case 'runs': return this.renderRunsTab();
      case 'sessions': return this.renderSessionsTab();
      case 'cost': return this.renderCostTab();
      default: return this.renderOverviewTab();
    }
  }

  /**
   * Render the entire panel
   */
  render() {
    const name = this.agent.name || 'Agent Details';

    return `
      <div class="agent-detail-panel" id="${this.id}">
        <div class="detail-panel-header">
          <div class="detail-panel-title">
            <i data-lucide="bot" style="width: 20px; height: 20px;"></i>
            <span>${this.escapeHtml(name)}</span>
          </div>
          <button class="btn-icon close-panel" title="Close">
            <i data-lucide="x" style="width: 20px; height: 20px;"></i>
          </button>
        </div>
        ${this.renderTabs()}
        <div class="detail-panel-content">
          ${this.renderTabContent()}
        </div>
      </div>
    `;
  }

  /**
   * Render and attach to container
   */
  renderElement() {
    if (!this.container) {
      throw new Error('AgentDetailPanel: container is required');
    }

    this.container.innerHTML = this.render();
    this.element = this.container.firstElementChild;
    this.persistentListenersBound = false;
    this.attachPersistentEventListeners();
    this.attachTabEventListeners();

    // Initialize Lucide icons
    if (typeof agentDetailWindow.lucide?.createIcons === 'function') {
      agentDetailWindow.lucide.createIcons();
    }

    return this.element;
  }

  /**
   * Attach listeners that live for the entire panel lifecycle.
   */
  attachPersistentEventListeners() {
    if (!this.element || this.persistentListenersBound) return;

    // Close button
    this.element.querySelector('.close-panel')?.addEventListener('click', () => {
      this.onClose?.(this.agent, this);
    });

    // Tab switching
    this.element.querySelectorAll('.detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        this.switchTab(tabId);
      });
    });
    this.persistentListenersBound = true;
  }

  /**
   * Attach listeners for tab content that is recreated on tab switch.
   */
  attachTabEventListeners() {
    if (!this.element) return;

    // Action buttons
    this.element.querySelectorAll('.btn-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this.onAction?.(action, this.agent, this);
      });
    });

    // Config save
    this.element.querySelector('#saveConfigBtn')?.addEventListener('click', () => {
      this.saveConfig();
    });

    // Add env var
    this.element.querySelector('#addEnvVar')?.addEventListener('click', () => {
      this.addEnvVarRow();
    });

    // Remove env var
    this.element.querySelectorAll('.remove-env').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.env-var-row')?.remove();
      });
    });

    // Delete session
    this.element.querySelectorAll('.delete-session').forEach(btn => {
      btn.addEventListener('click', () => {
        const sessionId = btn.dataset.sessionId;
        this.onDeleteSession?.(sessionId, this.agent, this);
      });
    });
  }

  /**
   * Switch to a different tab
   */
  switchTab(tabId) {
    this.currentTab = tabId;

    // Update tab buttons
    this.element?.querySelectorAll('.detail-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update content
    const contentEl = this.element?.querySelector('.detail-panel-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderTabContent();
      this.attachTabEventListeners();

      // Re-initialize icons
      if (typeof agentDetailWindow.lucide?.createIcons === 'function') {
        agentDetailWindow.lucide.createIcons();
      }
    }
  }

  /**
   * Add environment variable row
   */
  addEnvVarRow() {
    const container = this.element?.querySelector('#envVarsContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'env-var-row';
    row.innerHTML = `
      <input type="text" class="env-key" placeholder="KEY">
      <input type="text" class="env-value" placeholder="value">
      <button class="btn-icon remove-env" title="Remove">
        <i data-lucide="x" style="width: 16px; height: 16px;"></i>
      </button>
    `;

    row.querySelector('.remove-env').addEventListener('click', () => row.remove());
    container.appendChild(row);

    if (typeof agentDetailWindow.lucide?.createIcons === 'function') {
      agentDetailWindow.lucide.createIcons();
    }
  }

  /**
   * Collect and save config
   */
  saveConfig() {
    const config = {
      model: this.element?.querySelector('#configModel')?.value,
      timeoutSec: parseInt(this.element?.querySelector('#configTimeout')?.value, 10),
      graceSec: parseInt(this.element?.querySelector('#configGrace')?.value, 10),
      command: this.element?.querySelector('#configCommand')?.value,
      extraArgs: this.element?.querySelector('#configArgs')?.value.split(',').map(s => s.trim()).filter(Boolean),
      env: {},
      heartbeat: {
        enabled: this.element?.querySelector('#configHeartbeat')?.checked,
        intervalSec: parseInt(this.element?.querySelector('#configInterval')?.value, 10),
      },
    };

    // Collect env vars
    this.element?.querySelectorAll('.env-var-row').forEach(row => {
      const key = row.querySelector('.env-key')?.value?.trim();
      const value = row.querySelector('.env-value')?.value;
      if (key) {
        config.env[key] = value;
      }
    });

    this.onSaveConfig?.(config, this.agent, this);
  }

  /**
   * Update agent data and refresh
   */
  updateAgent(agent) {
    this.agent = agent;
    this.runs = agent.runs || [];
    this.sessions = agent.sessions || [];
    this.config = agent.config || agent.adapterConfig || {};
    this.renderElement();
  }

  /**
   * Static method to create panel
   */
  static create(options) {
    const panel = new AgentDetailPanel(options);
    return panel.renderElement();
  }

  /**
   * Get CSS styles
   */
  static getStyles() {
    return `
      .agent-detail-panel {
        background-color: var(--color-bg-secondary, #1e293b);
        border: 1px solid var(--color-border, #334155);
        border-radius: var(--radius-lg, 0.75rem);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: 90vh;
      }

      .detail-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--spacing-md, 1rem) var(--spacing-lg, 1.5rem);
        border-bottom: 1px solid var(--color-border, #334155);
      }

      .detail-panel-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: var(--font-size-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
      }

      .detail-tabs {
        display: flex;
        gap: 0.25rem;
        padding: var(--spacing-sm, 0.5rem);
        border-bottom: 1px solid var(--color-border, #334155);
        background-color: var(--color-bg-tertiary, #334155);
      }

      .detail-tab {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: var(--radius-md, 0.5rem);
        font-size: var(--font-size-sm, 0.875rem);
        color: var(--color-text-secondary, #cbd5e1);
        background: transparent;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .detail-tab:hover {
        background-color: var(--color-bg-hover, #475569);
        color: var(--color-text-primary, #f8fafc);
      }

      .detail-tab.active {
        background-color: var(--color-bg-secondary, #1e293b);
        color: var(--color-brand-primary, #3b82f6);
        font-weight: 500;
      }

      .detail-panel-content {
        flex: 1;
        overflow-y: auto;
        padding: var(--spacing-lg, 1.5rem);
      }

      .tab-content {
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .overview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--spacing-lg, 1.5rem);
        flex-wrap: wrap;
        gap: var(--spacing-md, 1rem);
      }

      .agent-identity {
        display: flex;
        align-items: center;
        gap: var(--spacing-md, 1rem);
      }

      .agent-avatar-large {
        width: 64px;
        height: 64px;
        border-radius: var(--radius-lg, 0.75rem);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .agent-identity-info h3 {
        font-size: var(--font-size-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        margin: 0 0 0.25rem 0;
      }

      .agent-subtitle {
        font-size: var(--font-size-sm, 0.875rem);
        color: var(--color-text-secondary, #cbd5e1);
        margin: 0;
      }

      .agent-actions-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .btn-action {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: var(--radius-md, 0.5rem);
        font-size: var(--font-size-sm, 0.875rem);
        font-weight: 500;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .btn-action.wake {
        background-color: rgba(34, 197, 94, 0.15);
        color: var(--color-success, #22c55e);
      }

      .btn-action.wake:hover {
        background-color: var(--color-success, #22c55e);
        color: white;
      }

      .btn-action.pause {
        background-color: rgba(245, 158, 11, 0.15);
        color: var(--color-warning, #f59e0b);
      }

      .btn-action.pause:hover {
        background-color: var(--color-warning, #f59e0b);
        color: white;
      }

      .btn-action.stop {
        background-color: rgba(239, 68, 68, 0.15);
        color: var(--color-error, #ef4444);
      }

      .btn-action.stop:hover {
        background-color: var(--color-error, #ef4444);
        color: white;
      }

      .overview-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--spacing-md, 1rem);
        margin-bottom: var(--spacing-lg, 1.5rem);
      }

      .overview-stats .stat-card {
        background-color: var(--color-bg-primary, #0f172a);
        border-radius: var(--radius-md, 0.5rem);
        padding: var(--spacing-md, 1rem);
        display: flex;
        align-items: center;
        gap: var(--spacing-sm, 0.5rem);
      }

      .overview-stats .stat-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-md, 0.5rem);
        background-color: var(--color-bg-tertiary, #334155);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-brand-primary, #3b82f6);
      }

      .overview-stats .stat-value {
        font-size: var(--font-size-lg, 1.125rem);
        font-weight: var(--font-weight-bold, 700);
        display: block;
      }

      .overview-stats .stat-label {
        font-size: var(--font-size-xs, 0.75rem);
        color: var(--color-text-secondary, #cbd5e1);
      }

      .overview-section {
        margin-bottom: var(--spacing-lg, 1.5rem);
      }

      .overview-section h4 {
        font-size: var(--font-size-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-secondary, #cbd5e1);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: var(--spacing-sm, 0.5rem);
      }

      .capabilities-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .capabilities-list .capability-tag {
        padding: 0.25rem 0.75rem;
        background-color: var(--color-bg-tertiary, #334155);
        border-radius: var(--radius-full, 9999px);
        font-size: var(--font-size-sm, 0.875rem);
      }

      .details-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--spacing-md, 1rem);
      }

      .detail-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .detail-label {
        font-size: var(--font-size-xs, 0.75rem);
        color: var(--color-text-secondary, #cbd5e1);
      }

      .detail-value {
        font-size: var(--font-size-sm, 0.875rem);
        font-weight: 500;
      }

      .detail-value.monospace {
        font-family: var(--font-mono, monospace);
        font-size: var(--font-size-xs, 0.75rem);
      }

      .config-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--spacing-lg, 1.5rem);
      }

      .form-section {
        background-color: var(--color-bg-primary, #0f172a);
        border-radius: var(--radius-md, 0.5rem);
        padding: var(--spacing-md, 1rem);
        margin-bottom: var(--spacing-md, 1rem);
      }

      .form-section h5 {
        font-size: var(--font-size-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        margin: 0 0 var(--spacing-md, 1rem) 0;
        color: var(--color-text-secondary, #cbd5e1);
      }

      .form-group {
        margin-bottom: var(--spacing-md, 1rem);
      }

      .form-group:last-child {
        margin-bottom: 0;
      }

      .form-group label {
        display: block;
        font-size: var(--font-size-sm, 0.875rem);
        font-weight: 500;
        margin-bottom: 0.375rem;
        color: var(--color-text-secondary, #cbd5e1);
      }

      .form-group input[type="text"],
      .form-group input[type="number"] {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--color-border, #334155);
        border-radius: var(--radius-md, 0.5rem);
        background-color: var(--color-bg-secondary, #1e293b);
        color: var(--color-text-primary, #f8fafc);
        font-size: var(--font-size-sm, 0.875rem);
      }

      .form-group input:focus {
        outline: none;
        border-color: var(--color-brand-primary, #3b82f6);
      }

      .checkbox-label {
        display: flex !important;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
      }

      .env-var-row {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
      }

      .env-var-row input {
        flex: 1;
        padding: 0.375rem 0.5rem;
        border: 1px solid var(--color-border, #334155);
        border-radius: var(--radius-md, 0.5rem);
        background-color: var(--color-bg-secondary, #1e293b);
        color: var(--color-text-primary, #f8fafc);
        font-size: var(--font-size-sm, 0.875rem);
      }

      .runs-header, .sessions-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--spacing-md, 1rem);
      }

      .runs-list, .sessions-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .run-item, .session-item {
        display: flex;
        align-items: center;
        gap: var(--spacing-md, 1rem);
        padding: var(--spacing-md, 1rem);
        background-color: var(--color-bg-primary, #0f172a);
        border-radius: var(--radius-md, 0.5rem);
        transition: background-color 0.2s ease;
      }

      .run-item:hover, .session-item:hover {
        background-color: var(--color-bg-hover, #475569);
      }

      .run-info, .session-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .run-name, .session-id {
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }

      .run-time, .session-created {
        font-size: var(--font-size-xs, 0.75rem);
        color: var(--color-text-secondary, #cbd5e1);
      }

      .run-stats, .session-stats {
        display: flex;
        align-items: center;
        gap: var(--spacing-md, 1rem);
      }

      .run-duration, .run-cost, .session-messages, .session-cost {
        font-size: var(--font-size-sm, 0.875rem);
        color: var(--color-text-secondary, #cbd5e1);
      }

      .cost-overview {
        margin-bottom: var(--spacing-lg, 1.5rem);
      }

      .cost-total-card {
        display: flex;
        align-items: center;
        gap: var(--spacing-md, 1rem);
        padding: var(--spacing-lg, 1.5rem);
        background: linear-gradient(135deg, var(--color-brand-primary, #3b82f6), var(--color-brand-secondary, #8b5cf6));
        border-radius: var(--radius-lg, 0.75rem);
        color: white;
      }

      .cost-total-icon {
        width: 56px;
        height: 56px;
        border-radius: var(--radius-lg, 0.75rem);
        background-color: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .cost-total-value {
        font-size: var(--font-size-2xl, 1.5rem);
        font-weight: var(--font-weight-bold, 700);
        display: block;
      }

      .cost-total-label {
        font-size: var(--font-size-sm, 0.875rem);
        opacity: 0.9;
      }

      .cost-breakdown {
        margin-bottom: var(--spacing-lg, 1.5rem);
      }

      .cost-breakdown h4 {
        margin-bottom: var(--spacing-md, 1rem);
      }

      .cost-categories {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md, 1rem);
      }

      .cost-category {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: var(--spacing-md, 1rem);
      }

      .category-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.375rem;
      }

      .category-name {
        font-size: var(--font-size-sm, 0.875rem);
        color: var(--color-text-secondary, #cbd5e1);
      }

      .category-value {
        font-size: var(--font-size-sm, 0.875rem);
        font-weight: 500;
      }

      .category-bar {
        height: 6px;
        background-color: var(--color-bg-primary, #0f172a);
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      .category-fill {
        height: 100%;
        border-radius: var(--radius-full, 9999px);
        transition: width 0.3s ease;
      }

      .category-fill.input { background-color: var(--color-info, #3b82f6); }
      .category-fill.output { background-color: var(--color-success, #22c55e); }
      .category-fill.other { background-color: var(--color-text-tertiary, #64748b); }

      .category-percent {
        font-size: var(--font-size-xs, 0.75rem);
        color: var(--color-text-secondary, #cbd5e1);
        text-align: right;
      }

      .cost-history h4 {
        margin-bottom: var(--spacing-md, 1rem);
      }

      .cost-history-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .cost-history-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--spacing-sm, 0.5rem) var(--spacing-md, 1rem);
        background-color: var(--color-bg-primary, #0f172a);
        border-radius: var(--radius-md, 0.5rem);
      }

      .history-info {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }

      .history-description {
        font-size: var(--font-size-sm, 0.875rem);
      }

      .history-time {
        font-size: var(--font-size-xs, 0.75rem);
        color: var(--color-text-secondary, #cbd5e1);
      }

      .history-amount {
        font-weight: 500;
        color: var(--color-error, #ef4444);
      }

      .text-muted {
        color: var(--color-text-tertiary, #64748b);
        font-style: italic;
      }

      .monospace {
        font-family: var(--font-mono, monospace);
      }

      @media (max-width: 768px) {
        .overview-stats {
          grid-template-columns: repeat(2, 1fr);
        }
        .details-grid {
          grid-template-columns: 1fr;
        }
        .agent-actions-bar {
          width: 100%;
          justify-content: flex-end;
        }
      }
    `;
  }

  /**
   * Inject styles
   */
  static injectStyles() {
    if (document.getElementById('agent-detail-panel-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'agent-detail-panel-styles';
    styleEl.textContent = AgentDetailPanel.getStyles();
    document.head.appendChild(styleEl);
  }
}

// Inject styles on load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AgentDetailPanel.injectStyles());
  } else {
    AgentDetailPanel.injectStyles();
  }
}

if (typeof window !== 'undefined') {
  window.AgentDetailPanel = AgentDetailPanel;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AgentDetailPanel };
}
