/**
 * CogniMesh v5.0 - Budget Incidents Banner Component
 * Displays critical budget-related incidents and alerts
 */

const budgetIncidentsWindow = typeof window !== 'undefined' ? window : globalThis;

class BudgetIncidentsBanner {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    
    // State
    this.incidents = [];
    this.dismissedIncidents = new Set();
    this.maxIncidents = 3;
    
    // Load dismissed incidents from localStorage
    this.loadDismissedIncidents();
    
    // Bind methods
    this.handleDismiss = this.handleDismiss.bind(this);
    this.handleAcknowledge = this.handleAcknowledge.bind(this);
  }

  // Load dismissed incident IDs from localStorage
  loadDismissedIncidents() {
    try {
      const stored = localStorage.getItem('dismissedBudgetIncidents');
      if (stored) {
        const ids = JSON.parse(stored);
        ids.forEach(id => this.dismissedIncidents.add(id));
      }
    } catch (e) {
      console.warn('Failed to load dismissed incidents:', e);
    }
  }

  // Save dismissed incident IDs to localStorage
  saveDismissedIncidents() {
    try {
      localStorage.setItem(
        'dismissedBudgetIncidents',
        JSON.stringify([...this.dismissedIncidents])
      );
    } catch (e) {
      console.warn('Failed to save dismissed incidents:', e);
    }
  }

  // Fetch budget incidents from API
  async fetchIncidents() {
    try {
      if (!this.api?.getBillingAlerts) {
        return [];
      }
      
      const data = await this.api.getBillingAlerts();
      const rawItems = data?.data || data?.alerts || [];
      return rawItems.map((item) => this.normalizeIncident(item));
    } catch (error) {
      console.error('Failed to fetch budget incidents:', error);
      return [];
    }
  }

  normalizeIncident(item = {}) {
    const level = String(item.level || item.severity || 'warning').toLowerCase();
    const currentSpendCents = Number(item.current_spend_cents || 0);
    const limitCents = Number(item.limit_cents || 0);
    const percentage = limitCents > 0 ? Math.round((currentSpendCents / limitCents) * 100) : null;

    return {
      id: item.uuid || item.id,
      level,
      title: item.title || `Budget ${level}`,
      message: item.message || item.description || 'Budget policy incident detected.',
      timestamp: this.parseTimestamp(item.timestamp || item.created_at),
      type: item.type || item.event_type || 'budget_incident',
      details: {
        percentage,
        currentSpendCents,
        limitCents,
        ...((item.metadata && typeof item.metadata === 'object') ? item.metadata : {})
      }
    };
  }

  parseTimestamp(value) {
    if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
    if (typeof value === 'string') {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && String(value).trim() !== '') {
        return numeric > 1e12 ? numeric : numeric * 1000;
      }
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return Date.now();
  }

  // Get severity class for styling
  getSeverityClass(level) {
    const classes = {
      critical: 'incident-critical',
      error: 'incident-error',
      warning: 'incident-warning',
      info: 'incident-info'
    };
    return classes[level] || 'incident-info';
  }

  // Get icon for incident type
  getIncidentIcon(level) {
    const icons = {
      critical: 'alert-octagon',
      error: 'x-circle',
      warning: 'alert-triangle',
      info: 'info'
    };
    return icons[level] || 'bell';
  }

  // Format timestamp to relative time
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    
    return date.toLocaleDateString();
  }

  // Escape HTML to prevent XSS
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Render the incidents banner
  async render(containerId) {
    const container = typeof containerId === 'string' 
      ? document.getElementById(containerId) 
      : containerId;
      
    if (!container) return;

    // Fetch incidents
    this.incidents = await this.fetchIncidents();
    
    // Filter out dismissed incidents
    const visibleIncidents = this.incidents
      .filter(i => !this.dismissedIncidents.has(i.id))
      .slice(0, this.maxIncidents);

    if (visibleIncidents.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `
      <div class="budget-incidents-banner">
        <div class="incidents-header">
          <div class="incidents-title">
            <i data-lucide="alert-triangle"></i>
            <span>Budget Incidents (${visibleIncidents.length})</span>
          </div>
          <button class="incidents-dismiss-all" data-action="dismiss-all">
            <i data-lucide="x"></i>
            <span>Dismiss All</span>
          </button>
        </div>
        <div class="incidents-list">
          ${visibleIncidents.map(incident => this.renderIncident(incident)).join('')}
        </div>
      </div>
    `;

    // Re-initialize icons
    if (budgetIncidentsWindow.lucide?.createIcons) {
      budgetIncidentsWindow.lucide.createIcons();
    }

    // Attach event listeners
    this.attachEventListeners(container);
  }

  // Render a single incident
  renderIncident(incident) {
    const severityClass = this.getSeverityClass(incident.level);
    const icon = this.getIncidentIcon(incident.level);
    const timeAgo = this.formatTime(incident.timestamp);

    return `
      <div class="incident-item ${severityClass}" data-incident-id="${incident.id}">
        <div class="incident-icon">
          <i data-lucide="${icon}"></i>
        </div>
        <div class="incident-content">
          <div class="incident-title">${this.escapeHtml(incident.title)}</div>
          <div class="incident-message">${this.escapeHtml(incident.message)}</div>
          <div class="incident-meta">
            <span class="incident-time">${timeAgo}</span>
            ${incident.details?.percentage ? `
              <span class="incident-badge">${incident.details.percentage}%</span>
            ` : ''}
          </div>
        </div>
        <div class="incident-actions">
          <button class="incident-btn acknowledge" data-id="${incident.id}" title="Acknowledge">
            <i data-lucide="check"></i>
          </button>
          <button class="incident-btn dismiss" data-id="${incident.id}" title="Dismiss">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `;
  }

  // Attach event listeners
  attachEventListeners(container) {
    // Dismiss individual incident
    container.querySelectorAll('.incident-btn.dismiss').forEach(btn => {
      btn.addEventListener('click', this.handleDismiss);
    });

    // Acknowledge incident
    container.querySelectorAll('.incident-btn.acknowledge').forEach(btn => {
      btn.addEventListener('click', this.handleAcknowledge);
    });

    // Dismiss all
    const dismissAllBtn = container.querySelector('[data-action="dismiss-all"]');
    if (dismissAllBtn) {
      dismissAllBtn.addEventListener('click', () => {
        this.incidents.forEach(i => this.dismissedIncidents.add(i.id));
        this.saveDismissedIncidents();
        this.render(container);
        
        if (budgetIncidentsWindow.toastManager) {
          budgetIncidentsWindow.toastManager.info('All incidents dismissed');
        }
      });
    }
  }

  // Handle dismiss action
  handleDismiss(e) {
    const id = e.currentTarget.dataset.id;
    this.dismissedIncidents.add(id);
    this.saveDismissedIncidents();
    
    // Remove from UI with animation
    const item = document.querySelector(`[data-incident-id="${id}"]`);
    if (item) {
      item.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => {
        this.render(item.closest('.budget-incidents-banner').parentElement);
      }, 300);
    }
  }

  // Handle acknowledge action
  async handleAcknowledge(e) {
    const id = e.currentTarget.dataset.id;
    
    try {
      if (this.api?.acknowledgeBillingAlert || this.api?.acknowledgeAlert) {
        if (this.api?.acknowledgeBillingAlert) {
          await this.api.acknowledgeBillingAlert(id, {});
        } else if (this.api?.acknowledgeAlert) {
          await this.api.acknowledgeAlert(id);
        }
      }
      
      if (budgetIncidentsWindow.toastManager) {
        budgetIncidentsWindow.toastManager.success('Incident acknowledged');
      }
      
      this.handleDismiss(e);
    } catch (error) {
      if (budgetIncidentsWindow.toastManager) {
        budgetIncidentsWindow.toastManager.error('Failed to acknowledge incident');
      }
    }
  }

  // Refresh incidents
  async refresh() {
    const container = document.querySelector('.budget-incidents-banner')?.parentElement;
    if (container) {
      await this.render(container);
    }
  }

  // Subscribe to WebSocket updates
  subscribeToUpdates() {
    if (!this.ws?.addEventListener) return;

    this.ws.addEventListener('message:billing.alert', (event) => {
      const alert = event?.detail;
      if (alert) {
        this.incidents.unshift(alert);
        this.refresh();
        
        // Show toast notification
        if (budgetIncidentsWindow.toastManager) {
          budgetIncidentsWindow.toastManager.warning(alert.title, {
            duration: 6000,
            action: {
              label: 'View',
              onClick: () => {
                budgetIncidentsWindow.dashboardApp?.navigateTo?.('billing');
              }
            }
          });
        }
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.BudgetIncidentsBanner = BudgetIncidentsBanner;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BudgetIncidentsBanner };
}
