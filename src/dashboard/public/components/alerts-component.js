/**
 * CogniMesh v5.0 - Alerts Component
 * Alerts panel with real-time notifications
 */

/* global Toast */

const alertsWindow = typeof window !== 'undefined' ? window : globalThis;

class AlertsComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    this.onAlertCountChange = options.onAlertCountChange || (() => {});
    
    this.alerts = [];
    this.filteredAlerts = [];
    this.currentFilters = {
      level: '',
      status: '',
    };
  }

  // Load alerts from API
  async loadAlerts() {
    try {
      if (!this.api?.getAlerts) {
        console.warn('Alerts API is unavailable');
        this.alerts = [];
        this.applyFilters();
        this.onAlertCountChange(0);
        return;
      }

      const data = await this.api.getAlerts({
        level: this.currentFilters.level || undefined,
        acknowledged: this.currentFilters.status === 'acknowledged' ? true : 
                      this.currentFilters.status === 'active' ? false : undefined,
      });
      
      this.alerts = data.alerts || [];
      this.applyFilters();
      this.onAlertCountChange(this.getActiveCount());
    } catch (error) {
      Toast.error('Failed to load alerts');
    }
  }

  // Apply filters
  applyFilters() {
    this.filteredAlerts = this.alerts.filter(alert => {
      if (this.currentFilters.level && alert.level !== this.currentFilters.level) {
        return false;
      }
      if (this.currentFilters.status === 'acknowledged' && !alert.acknowledged) {
        return false;
      }
      if (this.currentFilters.status === 'active' && alert.acknowledged) {
        return false;
      }
      return true;
    });
    
    this.renderAlerts();
  }

  // Get count of active (unacknowledged) alerts
  getActiveCount() {
    return this.alerts.filter(a => !a.acknowledged).length;
  }

  // Render alerts list
  renderAlerts() {
    const container = document.getElementById('alertsList');
    if (!container) return;
    
    if (this.filteredAlerts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="check-circle"></i>
          <p>No alerts found</p>
        </div>
      `;
    } else {
      container.innerHTML = this.filteredAlerts.map(alert => this.renderAlertItem(alert)).join('');
    }
    
    // Re-initialize icons
    if (typeof alertsWindow.lucide?.createIcons === 'function') {
      alertsWindow.lucide.createIcons();
    }
    
    // Attach event listeners
    this.attachEventListeners();
  }

  // Render single alert item
  renderAlertItem(alert) {
    const timeAgo = this.formatTimeAgo(alert.timestamp);
    const isAcknowledged = alert.acknowledged;
    
    return `
      <div class="alert-item ${alert.level} ${isAcknowledged ? 'acknowledged' : ''}" data-alert-id="${alert.id}">
        <div class="alert-icon">
          <i data-lucide="${this.getAlertIcon(alert.level)}"></i>
        </div>
        <div class="alert-content">
          <div class="alert-title">${this.escapeHtml(alert.title)}</div>
          <div class="alert-message">${this.escapeHtml(alert.message)}</div>
          <div class="alert-time">${timeAgo}</div>
        </div>
        <div class="alert-actions">
          ${!isAcknowledged ? `
            <button class="btn-icon acknowledge-alert" data-id="${alert.id}" title="Acknowledge">
              <i data-lucide="check"></i>
            </button>
          ` : ''}
          <button class="btn-icon dismiss-alert" data-id="${alert.id}" title="Dismiss">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `;
  }

  // Attach event listeners to rendered alert cards (safe to call on each render)
  attachEventListeners() {
    // Acknowledge buttons (on rendered cards — destroyed by innerHTML each render)
    document.querySelectorAll('.acknowledge-alert').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const alertId = e.currentTarget.dataset.id;
        this.acknowledgeAlert(alertId);
      });
    });

    // Dismiss buttons (on rendered cards — destroyed by innerHTML each render)
    document.querySelectorAll('.dismiss-alert').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const alertId = e.currentTarget.dataset.id;
        this.dismissAlert(alertId);
      });
    });

    // Persistent controls — bind once only
    if (!this._persistentListenersBound) {
      this._persistentListenersBound = true;

      document.getElementById('alertFilterLevel')?.addEventListener('change', (e) => {
        this.currentFilters.level = e.target.value;
        this.loadAlerts();
      });

      document.getElementById('alertFilterStatus')?.addEventListener('change', (e) => {
        this.currentFilters.status = e.target.value;
        this.applyFilters();
      });

      document.getElementById('acknowledgeAllBtn')?.addEventListener('click', () => {
        this.acknowledgeAll();
      });
    }
  }

  // Add new alert (from WebSocket)
  addAlert(alert) {
    // Check if alert already exists
    const existingIndex = this.alerts.findIndex(a => a.id === alert.id);
    if (existingIndex !== -1) {
      this.alerts[existingIndex] = alert;
    } else {
      this.alerts.unshift(alert);
    }
    
    this.applyFilters();
    this.onAlertCountChange(this.getActiveCount());
  }

  // Acknowledge single alert
  async acknowledgeAlert(alertId) {
    try {
      if (!this.api?.acknowledgeAlert) {
        console.warn('Alert acknowledge API is unavailable');
        return;
      }

      await this.api.acknowledgeAlert(alertId);
      
      // Update local state
      const alert = this.alerts.find(a => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
        alert.acknowledgedAt = new Date().toISOString();
        alert.acknowledgedBy = 'current-user'; // Should come from auth
      }
      
      this.applyFilters();
      this.onAlertCountChange(this.getActiveCount());
    } catch (error) {
      Toast.error('Failed to acknowledge alert');
    }
  }

  // Acknowledge all alerts
  async acknowledgeAll() {
    const activeAlerts = this.alerts.filter(a => !a.acknowledged);
    
    try {
      if (!this.api?.acknowledgeAlert) {
        console.warn('Alert acknowledge API is unavailable');
        return;
      }

      await Promise.all(activeAlerts.map(alert => this.api.acknowledgeAlert(alert.id)));
      
      // Update local state
      activeAlerts.forEach(alert => {
        alert.acknowledged = true;
        alert.acknowledgedAt = new Date().toISOString();
      });
      
      this.applyFilters();
      this.onAlertCountChange(0);
    } catch (error) {
      Toast.error('Failed to acknowledge alerts');
    }
  }

  // Dismiss alert
  async dismissAlert(alertId) {
    try {
      if (!this.api?.dismissAlert) {
        console.warn('Alert dismiss API is unavailable');
        return;
      }

      await this.api.dismissAlert(alertId);
      
      // Remove from local state
      this.alerts = this.alerts.filter(a => a.id !== alertId);
      
      this.applyFilters();
      this.onAlertCountChange(this.getActiveCount());
    } catch (error) {
      Toast.error('Failed to dismiss alert');
    }
  }

  // Get alert icon based on level
  getAlertIcon(level) {
    const icons = {
      critical: 'alert-octagon',
      error: 'x-circle',
      warning: 'alert-triangle',
      info: 'info',
    };
    return icons[level] || 'bell';
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

  // Utility: Escape HTML
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  window.AlertsComponent = AlertsComponent;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AlertsComponent };
}
