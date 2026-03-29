/**
 * CogniMesh v5.0 - Agent Card Component
 * Enhanced agent profile card with avatar, status, quick actions, and stats
 */

const agentCardWindow = typeof window !== 'undefined' ? window : globalThis;
const AgentStatusBadgeCtor = typeof agentCardWindow.AgentStatusBadge === 'function' 
  ? agentCardWindow.AgentStatusBadge 
  : null;

/**
 * Agent Card Component
 * Renders a comprehensive agent profile card
 */
class AgentCard {
  /**
   * @param {Object} options
   * @param {Object} options.agent - Agent data object
   * @param {Function} [options.onWake] - Callback when wake action is triggered
   * @param {Function} [options.onPause] - Callback when pause action is triggered
   * @param {Function} [options.onStop] - Callback when stop action is triggered
   * @param {Function} [options.onClick] - Callback when card is clicked
   * @param {boolean} [options.showQuickActions=true] - Show quick action buttons
   * @param {boolean} [options.showCost=true] - Show cost summary
   * @param {boolean} [options.compact=false] - Compact mode (smaller card)
   */
  constructor(options = {}) {
    this.agent = options.agent || {};
    this.onWake = options.onWake || null;
    this.onPause = options.onPause || null;
    this.onStop = options.onStop || null;
    this.onClick = options.onClick || null;
    this.showQuickActions = options.showQuickActions !== false;
    this.showCost = options.showCost !== false;
    this.compact = options.compact || false;

    this.id = this.agent.id || this.agent.agentId || `agent-${Date.now()}`;
  }

  /**
   * Format currency value
   */
  formatCurrency(value) {
    const num = Number(value) || 0;
    if (num < 0.01) return '$0.00';
    return `$${num.toFixed(2)}`;
  }

  /**
   * Format duration in seconds to human readable string
   */
  formatDuration(seconds) {
    if (!seconds || seconds < 60) return '< 1m';
    const mins = Math.floor(seconds / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    return `${mins}m`;
  }

  /**
   * Format timestamp to relative time
   */
  formatTimeAgo(timestamp) {
    if (!timestamp) return 'Never';
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
   * Get avatar URL or generate initials-based avatar
   */
  getAvatarHtml() {
    const name = this.agent.name || 'Unknown';
    const avatar = this.agent.avatar || null;

    if (avatar) {
      return `<img src="${this.escapeHtml(avatar)}" alt="${this.escapeHtml(name)}" class="agent-avatar-img">`;
    }

    const initials = name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    const bgColor = colors[colorIndex];

    return `<div class="agent-avatar-initials" style="background-color: ${bgColor};">${initials}</div>`;
  }

  /**
   * Get provider icon
   */
  getProviderIcon() {
    const provider = (this.agent.provider || this.agent.adapterType || 'unknown').toLowerCase();
    const icons = {
      claude: 'claude',
      codex: 'code',
      kimi: 'sparkles',
      cursor: 'mouse-pointer-2',
      gemini: 'gem',
      opencode: 'terminal',
      hermes: 'message-square',
      pi: 'brain',
    };
    return icons[provider] || 'bot';
  }

  /**
   * Get current task display
   */
  getCurrentTaskHtml() {
    const currentTask = this.agent.currentTask || this.agent.activeRun;
    if (!currentTask) {
      return `<div class="agent-task idle">
        <i data-lucide="coffee" style="width: 14px; height: 14px;"></i>
        <span>Idle</span>
      </div>`;
    }

    const taskName = typeof currentTask === 'string' 
      ? currentTask 
      : (currentTask.name || currentTask.title || 'Unknown task');

    return `<div class="agent-task active">
      <i data-lucide="loader-2" class="spin-icon" style="width: 14px; height: 14px;"></i>
      <span class="task-name" title="${this.escapeHtml(taskName)}">${this.escapeHtml(taskName)}</span>
    </div>`;
  }

  /**
   * Escape HTML for XSS safety
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Render quick action buttons
   */
  renderQuickActions() {
    if (!this.showQuickActions) return '';

    const status = (this.agent.status || 'offline').toLowerCase();
    const canWake = status === 'offline' || status === 'paused';
    const canPause = status === 'online' || status === 'busy';
    const canStop = status === 'online' || status === 'busy' || status === 'paused';

    return `
      <div class="agent-card-actions">
        <button class="action-btn wake" 
                data-action="wake" 
                data-agent-id="${this.id}"
                ${!canWake ? 'disabled' : ''}
                title="Wake agent">
          <i data-lucide="play" style="width: 14px; height: 14px;"></i>
        </button>
        <button class="action-btn pause" 
                data-action="pause" 
                data-agent-id="${this.id}"
                ${!canPause ? 'disabled' : ''}
                title="Pause agent">
          <i data-lucide="pause" style="width: 14px; height: 14px;"></i>
        </button>
        <button class="action-btn stop" 
                data-action="stop" 
                data-agent-id="${this.id}"
                ${!canStop ? 'disabled' : ''}
                title="Stop agent">
          <i data-lucide="square" style="width: 14px; height: 14px;"></i>
        </button>
      </div>
    `;
  }

  /**
   * Render cost summary
   */
  renderCostSummary() {
    if (!this.showCost) return '';

    const cost = this.agent.totalCost || this.agent.cost || 0;
    const sessions = this.agent.sessionCount || this.agent.sessions || 0;

    return `
      <div class="agent-card-cost">
        <div class="cost-item">
          <i data-lucide="dollar-sign" style="width: 12px; height: 12px;"></i>
          <span>${this.formatCurrency(cost)}</span>
        </div>
        <div class="cost-item">
          <i data-lucide="layers" style="width: 12px; height: 12px;"></i>
          <span>${sessions} session${sessions !== 1 ? 's' : ''}</span>
        </div>
      </div>
    `;
  }

  /**
   * Render uptime display
   */
  renderUptime() {
    const uptime = this.agent.uptime || this.agent.uptimeSeconds;
    if (!uptime) {
      const lastActive = this.agent.lastActive;
      return `<div class="agent-uptime">
        <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
        <span>Last active: ${this.formatTimeAgo(lastActive)}</span>
      </div>`;
    }

    return `<div class="agent-uptime">
      <i data-lucide="activity" style="width: 12px; height: 12px;"></i>
      <span>Uptime: ${this.formatDuration(uptime)}</span>
    </div>`;
  }

  /**
   * Render the agent card as HTML string
   */
  render() {
    const status = (this.agent.status || 'offline').toLowerCase();
    const name = this.agent.name || 'Unknown Agent';
    const provider = this.agent.provider || this.agent.adapterType || 'Unknown';
    const model = this.agent.model || '';

    // Use AgentStatusBadge if available
    const statusBadgeHtml = AgentStatusBadgeCtor
      ? AgentStatusBadgeCtor.render(status, { size: this.compact ? 'sm' : 'md' })
      : `<span class="agent-status-text ${status}">${status}</span>`;

    const cardClass = this.compact ? 'agent-card compact' : 'agent-card';

    return `
      <div class="${cardClass}" data-agent-id="${this.id}" data-status="${status}">
        <div class="agent-card-header">
          <div class="agent-avatar">
            ${this.getAvatarHtml()}
            <div class="agent-avatar-status ${status}"></div>
          </div>
          <div class="agent-card-info">
            <h4 class="agent-name" title="${this.escapeHtml(name)}">${this.escapeHtml(name)}</h4>
            <div class="agent-provider">
              <i data-lucide="${this.getProviderIcon()}" style="width: 12px; height: 12px;"></i>
              <span>${this.escapeHtml(provider)}${model ? ` • ${this.escapeHtml(model)}` : ''}</span>
            </div>
          </div>
          <div class="agent-card-status">
            ${statusBadgeHtml}
          </div>
        </div>

        <div class="agent-card-body">
          ${this.getCurrentTaskHtml()}
        </div>

        <div class="agent-card-stats">
          <div class="stat-item">
            <span class="stat-value">${this.agent.tasksCompleted || 0}</span>
            <span class="stat-label">Completed</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${this.agent.successRate || 0}%</span>
            <span class="stat-label">Success</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${this.agent.runsCompleted || this.agent.runs || 0}</span>
            <span class="stat-label">Runs</span>
          </div>
        </div>

        ${this.renderCostSummary()}

        <div class="agent-card-footer">
          ${this.renderUptime()}
          ${this.renderQuickActions()}
        </div>
      </div>
    `;
  }

  /**
   * Render as DOM element with event handlers attached
   */
  renderElement() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = this.render();
    const element = wrapper.firstElementChild;

    // Attach click handler
    if (this.onClick) {
      element.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn')) {
          this.onClick(this.agent, this);
        }
      });
      element.style.cursor = 'pointer';
    }

    // Attach action handlers
    const actions = element.querySelectorAll('.action-btn');
    actions.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const agentId = btn.dataset.agentId;

        switch (action) {
          case 'wake':
            this.onWake?.(agentId, this.agent, this);
            break;
          case 'pause':
            this.onPause?.(agentId, this.agent, this);
            break;
          case 'stop':
            this.onStop?.(agentId, this.agent, this);
            break;
        }
      });
    });

    return element;
  }

  /**
   * Static method to render agent card quickly
   */
  static render(agent, options = {}) {
    const card = new AgentCard({ agent, ...options });
    return card.render();
  }

  /**
   * Static method to create element with handlers
   */
  static create(agent, options = {}) {
    const card = new AgentCard({ agent, ...options });
    return card.renderElement();
  }

  /**
   * Get CSS styles for agent cards
   */
  static getStyles() {
    return `
      .agent-card {
        background-color: var(--color-bg-secondary, #1e293b);
        border: 1px solid var(--color-border, #334155);
        border-radius: var(--radius-lg, 0.75rem);
        padding: var(--spacing-lg, 1.5rem);
        transition: all 0.2s ease;
        position: relative;
      }

      .agent-card:hover {
        border-color: var(--color-border-hover, #475569);
        box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        transform: translateY(-2px);
      }

      .agent-card.compact {
        padding: var(--spacing-md, 1rem);
      }

      .agent-card-header {
        display: flex;
        align-items: center;
        gap: var(--spacing-md, 1rem);
        margin-bottom: var(--spacing-md, 1rem);
      }

      .agent-avatar {
        position: relative;
        flex-shrink: 0;
      }

      .agent-avatar-img,
      .agent-avatar-initials {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-lg, 0.75rem);
        object-fit: cover;
      }

      .agent-avatar-initials {
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 1rem;
        font-weight: 600;
      }

      .compact .agent-avatar-img,
      .compact .agent-avatar-initials {
        width: 36px;
        height: 36px;
        font-size: 0.875rem;
      }

      .agent-avatar-status {
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid var(--color-bg-secondary, #1e293b);
      }

      .agent-avatar-status.online { background-color: var(--color-success, #22c55e); }
      .agent-avatar-status.offline { background-color: var(--color-text-tertiary, #64748b); }
      .agent-avatar-status.busy { background-color: var(--color-warning, #f59e0b); }
      .agent-avatar-status.error { background-color: var(--color-error, #ef4444); }
      .agent-avatar-status.paused { background-color: var(--color-brand-secondary, #8b5cf6); }

      .agent-card-info {
        flex: 1;
        min-width: 0;
      }

      .agent-name {
        font-size: var(--font-size-md, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #f8fafc);
        margin: 0 0 0.25rem 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .agent-provider {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: var(--font-size-sm, 0.875rem);
        color: var(--color-text-secondary, #cbd5e1);
      }

      .agent-card-body {
        margin-bottom: var(--spacing-md, 1rem);
      }

      .agent-task {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-md, 0.5rem);
        font-size: var(--font-size-sm, 0.875rem);
      }

      .agent-task.idle {
        background-color: var(--color-bg-tertiary, #334155);
        color: var(--color-text-secondary, #cbd5e1);
      }

      .agent-task.active {
        background-color: rgba(245, 158, 11, 0.15);
        color: var(--color-warning, #f59e0b);
      }

      .task-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
      }

      .spin-icon {
        animation: spin 2s linear infinite;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .agent-card-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--spacing-sm, 0.5rem);
        margin-bottom: var(--spacing-md, 1rem);
      }

      .stat-item {
        text-align: center;
        padding: 0.5rem;
        background-color: var(--color-bg-primary, #0f172a);
        border-radius: var(--radius-md, 0.5rem);
      }

      .stat-value {
        display: block;
        font-size: var(--font-size-lg, 1.125rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #f8fafc);
      }

      .stat-label {
        display: block;
        font-size: var(--font-size-xs, 0.75rem);
        color: var(--color-text-secondary, #cbd5e1);
        margin-top: 0.125rem;
      }

      .agent-card-cost {
        display: flex;
        align-items: center;
        gap: var(--spacing-md, 1rem);
        padding: 0.5rem 0.75rem;
        background-color: var(--color-bg-tertiary, #334155);
        border-radius: var(--radius-md, 0.5rem);
        margin-bottom: var(--spacing-md, 1rem);
      }

      .cost-item {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: var(--font-size-sm, 0.875rem);
        color: var(--color-text-secondary, #cbd5e1);
      }

      .agent-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: var(--spacing-md, 1rem);
        border-top: 1px solid var(--color-border, #334155);
      }

      .agent-uptime {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: var(--font-size-xs, 0.75rem);
        color: var(--color-text-tertiary, #94a3b8);
      }

      .agent-card-actions {
        display: flex;
        gap: 0.375rem;
      }

      .action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--radius-md, 0.5rem);
        border: none;
        background-color: var(--color-bg-tertiary, #334155);
        color: var(--color-text-secondary, #cbd5e1);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .action-btn:hover:not(:disabled) {
        background-color: var(--color-bg-hover, #475569);
        color: var(--color-text-primary, #f8fafc);
      }

      .action-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .action-btn.wake:hover:not(:disabled) {
        background-color: var(--color-success, #22c55e);
        color: white;
      }

      .action-btn.pause:hover:not(:disabled) {
        background-color: var(--color-warning, #f59e0b);
        color: white;
      }

      .action-btn.stop:hover:not(:disabled) {
        background-color: var(--color-error, #ef4444);
        color: white;
      }

      .agent-status-text {
        font-size: var(--font-size-xs, 0.75rem);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .agent-status-text.online { color: var(--color-success, #22c55e); }
      .agent-status-text.offline { color: var(--color-text-tertiary, #64748b); }
      .agent-status-text.busy { color: var(--color-warning, #f59e0b); }
      .agent-status-text.error { color: var(--color-error, #ef4444); }
      .agent-status-text.paused { color: var(--color-brand-secondary, #8b5cf6); }
    `;
  }

  /**
   * Inject required styles into document
   */
  static injectStyles() {
    if (document.getElementById('agent-card-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'agent-card-styles';
    styleEl.textContent = AgentCard.getStyles();
    document.head.appendChild(styleEl);
  }
}

// Inject styles on load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AgentCard.injectStyles());
  } else {
    AgentCard.injectStyles();
  }
}

if (typeof window !== 'undefined') {
  window.AgentCard = AgentCard;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AgentCard };
}
