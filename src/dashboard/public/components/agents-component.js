/**
 * CogniMesh v5.0 - Agents Component
 * Agent cards grid with status, capabilities, and stats
 */

const agentsWindow = typeof window !== 'undefined' ? window : globalThis;

class AgentsComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;

    this.agents = [];
    this.loading = false;

    // Provider color map
    this.providerColors = {
      claude: '#d97706',
      codex: '#10b981',
      kimi: '#8b5cf6',
    };

    // Bind refresh button
    document.getElementById('refreshAgentsBtn')?.addEventListener('click', () => {
      this.loadAgents();
    });
  }

  // Load agents from API
  async loadAgents() {
    if (this.loading) return;
    this.loading = true;

    try {
      if (!this.api?.getAgents) {
        console.warn('Agents API is unavailable');
        this.agents = [];
        this.renderAgents();
        return;
      }

      const data = await this.api.getAgents();
      this.agents = data.agents || [];
      this.renderAgents();
    } catch (error) {
      console.error('Failed to load agents:', error);
      Toast.error('Failed to load agents');
      this.agents = [];
      this.renderAgents();
    } finally {
      this.loading = false;
    }
  }

  // Render agent cards into #agentsGrid
  renderAgents() {
    const container = document.getElementById('agentsGrid');
    if (!container) return;

    if (this.agents.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="bot"></i>
          <p>No agents available</p>
        </div>
      `;
    } else {
      container.innerHTML = this.agents.map(agent => this.renderAgentCard(agent)).join('');
    }

    // Re-initialize Lucide icons
    if (typeof agentsWindow.lucide?.createIcons === 'function') {
      agentsWindow.lucide.createIcons();
    }
  }

  // Render a single agent card
  renderAgentCard(agent) {
    const name = this.escapeHtml(agent.name);
    const provider = this.escapeHtml(agent.provider || 'unknown');
    const providerLower = (agent.provider || 'unknown').toLowerCase();
    const model = this.escapeHtml(agent.model || '');
    const status = (agent.status || 'offline').toLowerCase();
    const statusLabel = this.escapeHtml(status.charAt(0).toUpperCase() + status.slice(1));
    const tasksCompleted = Number(agent.tasksCompleted) || 0;
    const successRate = Number(agent.successRate) || 0;
    const lastActive = agent.lastActive ? this.formatTimeAgo(agent.lastActive) : 'Never';
    const providerColor = this.providerColors[providerLower] || '#6b7280';
    const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];

    const capabilityTags = capabilities.map(cap =>
      `<span class="capability-tag">${this.escapeHtml(cap)}</span>`
    ).join('');

    return `
      <div class="agent-card">
        <div class="agent-card-header">
          <div class="agent-card-title">
            <i data-lucide="bot"></i>
            <h4>${name}</h4>
          </div>
          <span class="provider-badge" style="background-color: ${providerColor}">
            ${this.escapeHtml(provider)}
          </span>
        </div>
        <div class="agent-card-model">${model}</div>
        <div class="agent-card-status">
          <span class="agent-status-dot ${this.escapeHtml(status)}"></span>
          <span>${statusLabel}</span>
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
          <span>Last active: ${this.escapeHtml(lastActive)}</span>
        </div>
      </div>
    `;
  }

  // Format timestamp to relative time
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

  // Utility: Escape HTML for XSS safety
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  window.AgentsComponent = AgentsComponent;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AgentsComponent };
}
