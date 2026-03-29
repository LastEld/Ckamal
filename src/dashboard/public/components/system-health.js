/**
 * CogniMesh v5.0 - System Health Component
 * Displays system health status and metrics
 */

const systemHealthWindow = typeof window !== 'undefined' ? window : globalThis;

class SystemHealth {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    
    // State
    this.status = {
      overall: 'operational',
      services: {},
      metrics: {},
      lastCheck: null
    };
    
    this.expanded = false;
    this.autoRefresh = true;
    this.refreshInterval = null;
    this.refreshRate = 30000; // 30 seconds
    
    // Service definitions
    this.services = [
      { id: 'api', name: 'API Server', icon: 'server' },
      { id: 'websocket', name: 'WebSocket', icon: 'radio' },
      { id: 'database', name: 'Database', icon: 'database' },
      { id: 'agents', name: 'Agent Manager', icon: 'bot' },
      { id: 'scheduler', name: 'Task Scheduler', icon: 'calendar' },
      { id: 'billing', name: 'Billing Service', icon: 'credit-card' }
    ];
  }

  // Fetch system health from API
  async fetchHealth() {
    try {
      if (!this.api?.getSystemStatus || !this.api?.getSystemMetrics) {
        return {
          overall: 'degraded',
          services: this.getDegradedServices(),
          metrics: { cpu: 0, memory: 0, disk: 0 },
          lastCheck: Date.now()
        };
      }
      
      const [statusPayload, metricsPayload] = await Promise.all([
        this.api.getSystemStatus(),
        this.api.getSystemMetrics()
      ]);

      const statusData = statusPayload?.data || statusPayload || {};
      const checks = statusData.checks || {};
      const components = statusData.components || {};
      const metricsData = metricsPayload?.data || metricsPayload || {};
      const processInfo = metricsData.process || {};
      const memory = processInfo.memory || {};
      const cpu = processInfo.cpu || {};
      const uptimeSeconds = Number(processInfo.uptime || 0);

      const memoryPercent = memory.heapTotal > 0
        ? Math.min(100, Math.round((memory.heapUsed / memory.heapTotal) * 100))
        : 0;
      const cpuMicroseconds = Number(cpu.user || 0) + Number(cpu.system || 0);
      const cpuPercent = uptimeSeconds > 0
        ? Math.min(100, Math.round(((cpuMicroseconds / 1_000_000) / uptimeSeconds) * 100))
        : 0;

      const services = {
        api: { status: checks.http ? 'operational' : 'down' },
        websocket: {
          status: checks.websocket ? 'operational' : 'degraded',
          connections: Number(components.websocket?.clients || 0)
        },
        database: {
          status: checks.database ? 'operational' : 'down',
          pool: Number(components.database?.total || 0)
        },
        agents: {
          status: checks.bios ? 'operational' : 'degraded',
          active: Number(components.bios?.components || 0)
        },
        scheduler: {
          status: checks.tools ? 'operational' : 'degraded',
          tasks: Number(components.tools?.registered || 0)
        },
        billing: {
          status: checks.repositories ? 'operational' : 'degraded'
        }
      };

      return {
        overall: statusData?.healthy ? 'operational' : 'degraded',
        services,
        metrics: {
          cpu: cpuPercent,
          memory: memoryPercent,
          disk: 0
        },
        lastCheck: this.parseTimestamp(statusData?.timestamp || metricsData?.timestamp) || Date.now()
      };
    } catch (error) {
      console.error('Failed to fetch system health:', error);
      return {
        overall: 'degraded',
        services: this.getDegradedServices(),
        metrics: { cpu: 0, memory: 0, disk: 0 },
        lastCheck: Date.now()
      };
    }
  }

  // Get degraded services status when API fails
  getDegradedServices() {
    const degraded = {};
    this.services.forEach(s => {
      degraded[s.id] = { status: 'unknown', latency: 0 };
    });
    return degraded;
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
    return null;
  }

  // Get status color class
  getStatusClass(status) {
    const classes = {
      operational: 'status-operational',
      healthy: 'status-operational',
      degraded: 'status-degraded',
      warning: 'status-degraded',
      down: 'status-down',
      error: 'status-down',
      unknown: 'status-unknown'
    };
    return classes[status] || 'status-unknown';
  }

  // Get status icon
  getStatusIcon(status) {
    const icons = {
      operational: 'check-circle',
      healthy: 'check-circle',
      degraded: 'alert-triangle',
      warning: 'alert-triangle',
      down: 'x-circle',
      error: 'x-circle',
      unknown: 'help-circle'
    };
    return icons[status] || 'help-circle';
  }

  // Get status label
  getStatusLabel(status) {
    const labels = {
      operational: 'Operational',
      healthy: 'Healthy',
      degraded: 'Degraded',
      warning: 'Warning',
      down: 'Down',
      error: 'Error',
      unknown: 'Unknown'
    };
    return labels[status] || 'Unknown';
  }

  // Format latency
  formatLatency(ms) {
    if (!ms || ms === 0) return '-';
    if (ms < 1) return '<1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // Format relative time
  formatLastCheck(timestamp) {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }

  // Get metric status color
  getMetricColor(value, thresholds) {
    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.warning) return 'warning';
    return 'good';
  }

  // Render the system health widget
  async render(containerId, options = {}) {
    const container = typeof containerId === 'string' 
      ? document.getElementById(containerId) 
      : containerId;
      
    if (!container) return;

    if (options.expanded !== undefined) this.expanded = options.expanded;

    // Fetch health data
    this.status = await this.fetchHealth();

    container.innerHTML = `
      <div class="system-health ${this.expanded ? 'expanded' : ''}">
        <div class="health-header" data-toggle>
          <div class="health-title">
            <i data-lucide="activity"></i>
            <span>System Health</span>
          </div>
          <div class="health-summary">
            <span class="health-badge ${this.getStatusClass(this.status.overall)}">
              <i data-lucide="${this.getStatusIcon(this.status.overall)}"></i>
              <span>${this.getStatusLabel(this.status.overall)}</span>
            </span>
            <button class="health-toggle">
              <i data-lucide="${this.expanded ? 'chevron-up' : 'chevron-down'}"></i>
            </button>
          </div>
        </div>
        
        ${this.expanded ? this.renderExpandedView() : this.renderCompactView()}
        
        <div class="health-footer">
          <span class="last-check">Last check: ${this.formatLastCheck(this.status.lastCheck)}</span>
          <button class="refresh-btn" data-refresh title="Refresh">
            <i data-lucide="refresh-cw"></i>
          </button>
        </div>
      </div>
    `;

    // Re-initialize icons
    if (systemHealthWindow.lucide?.createIcons) {
      systemHealthWindow.lucide.createIcons();
    }

    // Attach event listeners
    this.attachEventListeners(container);
  }

  // Render compact view
  renderCompactView() {
    const metrics = this.status.metrics;
    const cpuColor = this.getMetricColor(metrics.cpu, { warning: 70, critical: 90 });
    const memColor = this.getMetricColor(metrics.memory, { warning: 80, critical: 95 });

    return `
      <div class="health-compact">
        <div class="health-metrics">
          <div class="metric-mini">
            <span class="metric-label">CPU</span>
            <span class="metric-value ${cpuColor}">${metrics.cpu || 0}%</span>
          </div>
          <div class="metric-mini">
            <span class="metric-label">Memory</span>
            <span class="metric-value ${memColor}">${metrics.memory || 0}%</span>
          </div>
          <div class="metric-mini">
            <span class="metric-label">Services</span>
            <span class="metric-value">
              ${this.getOperationalCount()}/${this.services.length}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // Render expanded view
  renderExpandedView() {
    return `
      <div class="health-expanded">
        ${this.renderResourceMetrics()}
        <div class="services-list">
          ${this.services.map(service => this.renderServiceItem(service)).join('')}
        </div>
      </div>
    `;
  }

  // Render resource metrics (CPU, Memory, Disk)
  renderResourceMetrics() {
    const metrics = this.status.metrics;
    
    return `
      <div class="resource-metrics">
        <div class="resource-item">
          <div class="resource-header">
            <span class="resource-name">
              <i data-lucide="cpu"></i>
              CPU
            </span>
            <span class="resource-value">${metrics.cpu || 0}%</span>
          </div>
          <div class="resource-bar">
            <div class="resource-fill ${this.getMetricColor(metrics.cpu, { warning: 70, critical: 90 })}" 
                 style="width: ${Math.min(100, metrics.cpu || 0)}%"></div>
          </div>
        </div>
        
        <div class="resource-item">
          <div class="resource-header">
            <span class="resource-name">
              <i data-lucide="hard-drive"></i>
              Memory
            </span>
            <span class="resource-value">${metrics.memory || 0}%</span>
          </div>
          <div class="resource-bar">
            <div class="resource-fill ${this.getMetricColor(metrics.memory, { warning: 80, critical: 95 })}" 
                 style="width: ${Math.min(100, metrics.memory || 0)}%"></div>
          </div>
        </div>
        
        <div class="resource-item">
          <div class="resource-header">
            <span class="resource-name">
              <i data-lucide="disc"></i>
              Disk
            </span>
            <span class="resource-value">${metrics.disk || 0}%</span>
          </div>
          <div class="resource-bar">
            <div class="resource-fill ${this.getMetricColor(metrics.disk, { warning: 80, critical: 90 })}" 
                 style="width: ${Math.min(100, metrics.disk || 0)}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  // Render a service item
  renderServiceItem(service) {
    const serviceData = this.status.services[service.id] || { status: 'unknown' };
    const statusClass = this.getStatusClass(serviceData.status);
    const statusIcon = this.getStatusIcon(serviceData.status);

    let detailText = '';
    if (serviceData.latency) {
      detailText = this.formatLatency(serviceData.latency);
    } else if (serviceData.active !== undefined) {
      detailText = `${serviceData.active} active`;
    } else if (serviceData.connections !== undefined) {
      detailText = `${serviceData.connections} conn`;
    }

    return `
      <div class="service-item ${statusClass}" data-service="${service.id}">
        <div class="service-icon">
          <i data-lucide="${service.icon}"></i>
        </div>
        <div class="service-info">
          <span class="service-name">${service.name}</span>
          ${detailText ? `<span class="service-detail">${detailText}</span>` : ''}
        </div>
        <div class="service-status">
          <i data-lucide="${statusIcon}"></i>
        </div>
      </div>
    `;
  }

  // Get count of operational services
  getOperationalCount() {
    return Object.values(this.status.services).filter(
      s => s.status === 'operational' || s.status === 'healthy'
    ).length;
  }

  // Attach event listeners
  attachEventListeners(container) {
    // Toggle expand/collapse
    const toggleHeader = container.querySelector('[data-toggle]');
    if (toggleHeader) {
      toggleHeader.addEventListener('click', (e) => {
        if (e.target.closest('[data-refresh]')) return;
        this.expanded = !this.expanded;
        this.render(container);
      });
    }

    // Refresh button
    const refreshBtn = container.querySelector('[data-refresh]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('spinning');
        this.refresh().then(() => {
          setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
        });
      });
    }

    // Service item click
    container.querySelectorAll('[data-service]').forEach(item => {
      item.addEventListener('click', () => {
        const serviceId = item.dataset.service;
        this.showServiceDetails(serviceId);
      });
    });
  }

  // Show service details
  showServiceDetails(serviceId) {
    const service = this.services.find(s => s.id === serviceId);
    const serviceData = this.status.services[serviceId];
    
    if (!service || !serviceData) return;

    const details = Object.entries(serviceData)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    if (systemHealthWindow.toastManager) {
      systemHealthWindow.toastManager.info(
        `<strong>${service.name}</strong><br><pre style="margin:0;font-size:12px">${details}</pre>`,
        { duration: 5000 }
      );
    }
  }

  // Refresh the widget
  async refresh() {
    const container = document.querySelector('.system-health')?.parentElement;
    if (container) {
      await this.render(container);
    }
  }

  // Start auto-refresh
  startAutoRefresh(rate = 30000) {
    this.stopAutoRefresh();
    this.refreshRate = rate;
    this.refreshInterval = setInterval(() => this.refresh(), rate);
  }

  // Stop auto-refresh
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // Subscribe to WebSocket updates
  subscribeToUpdates() {
    if (!this.ws?.addEventListener) return;

    this.ws.addEventListener('message:system.status', (event) => {
      const data = event?.detail;
      if (data) {
        this.status = {
          ...this.status,
          overall: data.status || this.status.overall,
          services: { ...this.status.services, ...data.services },
          metrics: { ...this.status.metrics, ...data.metrics },
          lastCheck: Date.now()
        };
        this.refresh();
      }
    });

    this.ws.addEventListener('message:service.status', (event) => {
      const data = event?.detail;
      if (data?.serviceId && data.status) {
        this.status.services[data.serviceId] = {
          ...this.status.services[data.serviceId],
          ...data.status
        };
        this.refresh();
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.SystemHealth = SystemHealth;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SystemHealth };
}
