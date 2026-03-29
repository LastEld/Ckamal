/**
 * CogniMesh v5.0 - Cost Widget Component
 * Cost tracking and budget management widgets
 */

/* global Toast */

const costWidgetWindow = typeof window !== 'undefined' ? window : globalThis;

/**
 * CostWidget - Main component for cost tracking and budget management
 * Includes: CostSummaryCard, CostTrendChart, ModelBreakdown, BudgetProgressBar, AlertBanner
 */
class CostWidget {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    
    // State
    this.data = {
      summary: null,
      costs: null,
      alerts: null,
    };
    this.cache = new Map();
    this.cacheExpiry = 30000; // 30 seconds
    this.refreshInterval = null;
    this.charts = {};
    
    // DOM element references
    this.elements = {};
    
    // Bind methods
    this.handleRefresh = this.handleRefresh.bind(this);
    this.handlePeriodChange = this.handlePeriodChange.bind(this);
  }

  // ==================== API Integration ====================

  /**
   * Fetch billing summary from API
   */
  async fetchBillingSummary() {
    const cacheKey = 'billing-summary';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      if (!this.api?.getBillingSummary) {
        return this.getEmptySummary();
      }
      const payload = await this.api.getBillingSummary();
      const data = this.normalizeBillingSummary(payload);
      this.setCached(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Failed to fetch billing summary:', error);
      Toast.error('Failed to load billing summary');
      return this.getEmptySummary();
    }
  }

  /**
   * Fetch cost data from API
   */
  async fetchCosts(period = '30d') {
    const cacheKey = `costs-${period}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      if (!this.api?.getCosts || !this.api?.getCostsByModel || !this.api?.getCostsByProvider) {
        return this.getEmptyCosts(period);
      }
      const days = this.getPeriodDays(period);
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - (days - 1));

      const [eventsPayload, byModelPayload, byProviderPayload] = await Promise.all([
        this.api.getCosts({ start_date: startDate.toISOString(), end_date: endDate.toISOString(), per_page: 1000 }),
        this.api.getCostsByModel({ start_date: startDate.toISOString(), end_date: endDate.toISOString() }),
        this.api.getCostsByProvider({ start_date: startDate.toISOString(), end_date: endDate.toISOString() })
      ]);

      const data = this.normalizeCosts(period, eventsPayload, byModelPayload, byProviderPayload);
      this.setCached(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Failed to fetch costs:', error);
      return this.getEmptyCosts(period);
    }
  }

  /**
   * Fetch billing alerts from API
   */
  async fetchBillingAlerts() {
    const cacheKey = 'billing-alerts';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      if (!this.api?.getBillingAlerts) {
        return { alerts: [], total: 0 };
      }
      const payload = await this.api.getBillingAlerts();
      const rawAlerts = payload?.data || payload?.alerts || [];
      const alerts = rawAlerts.map((alert) => this.normalizeAlert(alert));
      const data = { alerts, total: alerts.length };
      this.setCached(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Failed to fetch billing alerts:', error);
      return { alerts: [], total: 0 };
    }
  }

  // ==================== Cache Management ====================

  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  setCached(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache() {
    this.cache.clear();
  }

  // ==================== Normalization ====================

  getPeriodDays(period) {
    if (period === '7d') return 7;
    if (period === '90d') return 90;
    return 30;
  }

  getEmptySummary() {
    return {
      totalSpend: 0,
      budgetLimit: 0,
      budgetRemaining: 0,
      percentageUsed: 0,
      period: 'current_month',
      projectedSpend: 0,
      currency: 'USD',
    };
  }

  getEmptyCosts(period) {
    const days = this.getPeriodDays(period);
    const dailyCosts = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      dailyCosts.push({
        date: date.toISOString().slice(0, 10),
        amount: 0,
        requests: 0
      });
    }

    return {
      period,
      dailyCosts,
      byModel: {},
      byProvider: {}
    };
  }

  normalizeBillingSummary(payload = {}) {
    const data = payload?.data || payload || {};
    const summary = data.summary || data;
    const forecast = data.forecast || {};

    const totalSpend = Number(summary.totalSpend || summary.total_spend || 0);
    const budgetLimit = Number(data.budgetLimit || summary.budgetLimit || summary.budget_limit || 0);
    const budgetRemaining = budgetLimit > 0 ? Math.max(0, budgetLimit - totalSpend) : 0;
    const percentageUsed = budgetLimit > 0 ? (totalSpend / budgetLimit) * 100 : 0;
    const projectedSpend = Number(forecast.next30Days || data.projectedSpend || totalSpend || 0);

    return {
      totalSpend,
      budgetLimit,
      budgetRemaining,
      percentageUsed,
      period: data.period?.start || 'current_month',
      projectedSpend,
      currency: data.currency || summary.currency || 'USD'
    };
  }

  normalizeCosts(period, eventsPayload = {}, byModelPayload = {}, byProviderPayload = {}) {
    const events = eventsPayload?.data || eventsPayload?.events || [];
    const byModelRows = byModelPayload?.data || [];
    const byProviderRows = byProviderPayload?.data || [];
    const days = this.getPeriodDays(period);

    const dailyMap = new Map();
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, amount: 0, requests: 0 });
    }

    events.forEach((event) => {
      const timestamp = this.parseTimestamp(event.created_at || event.recorded_at || event.timestamp);
      const key = new Date(timestamp).toISOString().slice(0, 10);
      if (!dailyMap.has(key)) return;
      const entry = dailyMap.get(key);
      entry.amount += Number(event.total_cost || event.amount || 0);
      entry.requests += 1;
      dailyMap.set(key, entry);
    });

    const byModel = {};
    byModelRows.forEach((row) => {
      if (row?.model) byModel[row.model] = Number(row.cost || 0);
    });

    const byProvider = {};
    byProviderRows.forEach((row) => {
      if (row?.provider) byProvider[row.provider] = Number(row.cost || 0);
    });

    return {
      period,
      dailyCosts: [...dailyMap.values()],
      byModel,
      byProvider
    };
  }

  normalizeAlert(alert = {}) {
    const level = String(alert.level || alert.severity || 'info').toLowerCase();
    return {
      id: alert.uuid || alert.id,
      level,
      title: alert.title || `Budget ${level}`,
      message: alert.message || alert.description || 'Budget alert',
      timestamp: this.parseTimestamp(alert.timestamp || alert.created_at)
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

  // ==================== Widget Components ====================

  /**
   * CostSummaryCard - Displays total spend, budget remaining, and percentage used
   */
  renderCostSummaryCard(container, data) {
    if (!container) return;

    const { totalSpend, budgetLimit, budgetRemaining, percentageUsed, projectedSpend } = data || {};
    const percentage = Math.min(100, Math.max(0, percentageUsed || 0));
    
    // Determine status color
    let statusClass = 'good';
    if (percentage >= 90) statusClass = 'critical';
    else if (percentage >= 80) statusClass = 'warning';
    else if (percentage >= 50) statusClass = 'caution';

    container.innerHTML = `
      <div class="cost-summary-card">
        <div class="cost-summary-header">
          <h3 class="cost-card-title">
            <i data-lucide="wallet"></i>
            Cost Summary
          </h3>
          <span class="cost-badge ${statusClass}">${percentage.toFixed(1)}% Used</span>
        </div>
        <div class="cost-summary-grid">
          <div class="cost-metric">
            <span class="cost-metric-value">$${(totalSpend || 0).toFixed(2)}</span>
            <span class="cost-metric-label">Total Spend</span>
          </div>
          <div class="cost-metric">
            <span class="cost-metric-value">$${(budgetRemaining || 0).toFixed(2)}</span>
            <span class="cost-metric-label">Budget Remaining</span>
          </div>
          <div class="cost-metric">
            <span class="cost-metric-value">$${(budgetLimit || 0).toFixed(2)}</span>
            <span class="cost-metric-label">Budget Limit</span>
          </div>
          <div class="cost-metric projected">
            <span class="cost-metric-value">$${(projectedSpend || 0).toFixed(2)}</span>
            <span class="cost-metric-label">Projected (EOM)</span>
          </div>
        </div>
      </div>
    `;

    // Re-initialize icons
    if (costWidgetWindow.lucide?.createIcons) {
      costWidgetWindow.lucide.createIcons({ icons: { wallet: costWidgetWindow.lucide.icons.wallet }, attrs: { class: ['foo', 'bar'] } });
      costWidgetWindow.lucide.createIcons();
    }
  }

  /**
   * CostTrendChart - Line chart showing spend over time
   */
  renderCostTrendChart(container, data, period = '30d') {
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'costTrendChart';
    container.innerHTML = '';
    container.appendChild(canvas);

    const ChartCtor = costWidgetWindow.Chart;
    if (!ChartCtor) {
      container.innerHTML = '<div class="empty-state"><p>Chart.js not available</p></div>';
      return;
    }

    // Destroy existing chart
    if (this.charts.trend) {
      this.charts.trend.destroy();
      delete this.charts.trend;
    }

    const dailyCosts = data?.dailyCosts || [];
    const labels = dailyCosts.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const amounts = dailyCosts.map(d => d.amount || 0);
    const requests = dailyCosts.map(d => d.requests || 0);

    this.charts.trend = new ChartCtor(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Cost ($)',
            data: amounts,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
            yAxisID: 'y',
          },
          {
            label: 'Requests',
            data: requests,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            fill: false,
            tension: 0.4,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                if (label.includes('Cost')) return `${label}: $${value.toFixed(2)}`;
                return `${label}: ${value}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Cost ($)',
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
            },
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Requests',
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    });
  }

  /**
   * ModelBreakdown - Pie/bar chart of costs by model/provider
   */
  renderModelBreakdown(container, data) {
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'modelBreakdownChart';
    container.innerHTML = '';
    container.appendChild(canvas);

    const ChartCtor = costWidgetWindow.Chart;
    if (!ChartCtor) {
      container.innerHTML = '<div class="empty-state"><p>Chart.js not available</p></div>';
      return;
    }

    // Destroy existing chart
    if (this.charts.model) {
      this.charts.model.destroy();
      delete this.charts.model;
    }

    const byModel = data?.byModel || {};
    const labels = Object.keys(byModel);
    const values = Object.values(byModel);

    // Model colors
    const modelColors = {
      'claude-sonnet-4': '#d97706',
      'claude': '#d97706',
      'codex': '#10b981',
      'kimi-k2': '#8b5cf6',
      'kimi': '#8b5cf6',
      'gpt-4': '#3b82f6',
      'gpt-4o': '#06b6d4',
    };

    const backgroundColors = labels.map(label => {
      for (const [key, color] of Object.entries(modelColors)) {
        if (label.toLowerCase().includes(key)) return color;
      }
      return '#6b7280';
    });

    this.charts.model = new ChartCtor(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: backgroundColors,
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'right',
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return `${label}: $${value.toFixed(2)} (${percentage}%)`;
              },
            },
          },
        },
        cutout: '60%',
      },
    });
  }

  /**
   * BudgetProgressBar - Visual budget usage indicator
   */
  renderBudgetProgressBar(container, data) {
    if (!container) return;

    const { totalSpend, budgetLimit, percentageUsed } = data || {};
    const percentage = Math.min(100, Math.max(0, percentageUsed || 0));
    
    let statusClass = 'good';
    let statusText = 'On Track';
    if (percentage >= 90) {
      statusClass = 'critical';
      statusText = 'Critical';
    } else if (percentage >= 80) {
      statusClass = 'warning';
      statusText = 'Warning';
    } else if (percentage >= 50) {
      statusClass = 'caution';
      statusText = 'Caution';
    }

    container.innerHTML = `
      <div class="budget-progress-card">
        <div class="budget-progress-header">
          <h3 class="cost-card-title">
            <i data-lucide="pie-chart"></i>
            Budget Usage
          </h3>
          <span class="budget-status ${statusClass}">${statusText}</span>
        </div>
        <div class="budget-progress-container">
          <div class="budget-progress-bar">
            <div class="budget-progress-fill ${statusClass}" style="width: ${percentage}%"></div>
            <div class="budget-progress-marker" style="left: 80%"></div>
            <div class="budget-progress-marker critical" style="left: 90%"></div>
          </div>
          <div class="budget-progress-labels">
            <span>$0</span>
            <span>$${(budgetLimit * 0.5).toFixed(0)}</span>
            <span>$${(budgetLimit * 0.8).toFixed(0)}</span>
            <span>$${(budgetLimit || 0).toFixed(0)}</span>
          </div>
        </div>
        <div class="budget-progress-info">
          <div class="budget-progress-stat">
            <span class="budget-progress-dot ${statusClass}"></span>
            <span>Used: $${(totalSpend || 0).toFixed(2)} (${percentage.toFixed(1)}%)</span>
          </div>
          <div class="budget-progress-thresholds">
            <span class="threshold warning">80%</span>
            <span class="threshold critical">90%</span>
          </div>
        </div>
      </div>
    `;

    if (costWidgetWindow.lucide?.createIcons) {
      costWidgetWindow.lucide.createIcons();
    }
  }

  /**
   * AlertBanner - Shows budget warnings/alerts
   */
  renderAlertBanner(container, data) {
    if (!container) return;

    const alerts = data?.alerts || [];
    const activeAlerts = alerts.filter(a => a.level === 'critical' || a.level === 'warning');

    if (activeAlerts.length === 0) {
      container.innerHTML = `
        <div class="cost-alert-banner success">
          <i data-lucide="check-circle"></i>
          <span>No budget alerts. You're within your spending limits.</span>
        </div>
      `;
    } else {
      const alertHtml = activeAlerts.map(alert => `
        <div class="cost-alert-banner ${alert.level}">
          <i data-lucide="${alert.level === 'critical' ? 'alert-octagon' : 'alert-triangle'}"></i>
          <div class="cost-alert-content">
            <strong>${alert.title}</strong>
            <span>${alert.message}</span>
          </div>
          <span class="cost-alert-time">${this.formatTime(alert.timestamp)}</span>
        </div>
      `).join('');
      
      container.innerHTML = alertHtml;
    }

    if (costWidgetWindow.lucide?.createIcons) {
      costWidgetWindow.lucide.createIcons();
    }
  }

  // ==================== Main Render Methods ====================

  /**
   * Render compact cost widget for dashboard
   */
  async renderCompactWidget(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Create widget structure
    container.innerHTML = `
      <div class="cost-widget-compact">
        <div class="cost-widget-header">
          <h3>
            <i data-lucide="credit-card"></i>
            Billing Overview
          </h3>
          <a href="#billing" class="link-sm" id="viewBillingLink">View Details</a>
        </div>
        <div id="compactSummary"></div>
        <div id="compactProgress"></div>
        <div id="compactAlerts"></div>
      </div>
    `;

    // Add click handler for billing link
    const billingLink = container.querySelector('#viewBillingLink');
    if (billingLink && costWidgetWindow.dashboardApp) {
      billingLink.addEventListener('click', (e) => {
        e.preventDefault();
        costWidgetWindow.dashboardApp.navigateTo('billing');
      });
    }

    // Load and render data
    await this.loadCompactData();

    if (costWidgetWindow.lucide?.createIcons) {
      costWidgetWindow.lucide.createIcons();
    }
  }

  /**
   * Load data for compact widget
   */
  async loadCompactData() {
    const [summary, alerts] = await Promise.all([
      this.fetchBillingSummary(),
      this.fetchBillingAlerts(),
    ]);

    this.data.summary = summary;
    this.data.alerts = alerts;

    this.renderCostSummaryCard(document.getElementById('compactSummary'), summary);
    this.renderBudgetProgressBar(document.getElementById('compactProgress'), summary);
    this.renderAlertBanner(document.getElementById('compactAlerts'), alerts);
  }

  /**
   * Render full billing view
   */
  async renderBillingView(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Create billing view structure
    container.innerHTML = `
      <div class="billing-container">
        <div class="view-toolbar">
          <div class="billing-period-selector">
            <select class="select" id="billingPeriod">
              <option value="7d">Last 7 Days</option>
              <option value="30d" selected>Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
          <button class="btn btn-secondary" id="refreshBillingBtn">
            <i data-lucide="refresh-cw"></i>
            <span>Refresh</span>
          </button>
        </div>

        <div id="billingAlerts"></div>

        <div class="billing-grid">
          <div class="billing-card wide">
            <div id="billingSummary"></div>
          </div>
          
          <div class="billing-card">
            <div id="billingProgress"></div>
          </div>
          
          <div class="billing-card wide">
            <div class="billing-chart-header">
              <h3>Cost Trends</h3>
              <div class="chart-legend">
                <span class="legend-item">
                  <span class="legend-color" style="background: #3b82f6"></span>
                  Cost
                </span>
                <span class="legend-item">
                  <span class="legend-color" style="background: #8b5cf6"></span>
                  Requests
                </span>
              </div>
            </div>
            <div class="billing-chart-container">
              <canvas id="billingTrendChart"></canvas>
            </div>
          </div>
          
          <div class="billing-card">
            <div class="billing-chart-header">
              <h3>Cost by Model</h3>
            </div>
            <div class="billing-chart-container doughnut">
              <canvas id="billingModelChart"></canvas>
            </div>
          </div>
          
          <div class="billing-card">
            <div class="billing-chart-header">
              <h3>Cost by Provider</h3>
            </div>
            <div class="billing-chart-container">
              <canvas id="billingProviderChart"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup event listeners
    const periodSelect = document.getElementById('billingPeriod');
    if (periodSelect) {
      periodSelect.addEventListener('change', this.handlePeriodChange);
    }

    const refreshBtn = document.getElementById('refreshBillingBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', this.handleRefresh);
    }

    // Load initial data
    await this.loadBillingData('30d');

    if (costWidgetWindow.lucide?.createIcons) {
      costWidgetWindow.lucide.createIcons();
    }
  }

  /**
   * Load data for billing view
   */
  async loadBillingData(period) {
    const [summary, costs, alerts] = await Promise.all([
      this.fetchBillingSummary(),
      this.fetchCosts(period),
      this.fetchBillingAlerts(),
    ]);

    this.data.summary = summary;
    this.data.costs = costs;
    this.data.alerts = alerts;

    // Render components
    this.renderCostSummaryCard(document.getElementById('billingSummary'), summary);
    this.renderBudgetProgressBar(document.getElementById('billingProgress'), summary);
    this.renderAlertBanner(document.getElementById('billingAlerts'), alerts);

    // Render charts
    this.renderBillingTrendChart(costs);
    this.renderBillingModelChart(costs);
    this.renderBillingProviderChart(costs);
  }

  /**
   * Render trend chart for billing view
   */
  renderBillingTrendChart(data) {
    const canvas = document.getElementById('billingTrendChart');
    if (!canvas) return;

    const ChartCtor = costWidgetWindow.Chart;
    if (!ChartCtor) return;

    if (this.charts.billingTrend) {
      this.charts.billingTrend.destroy();
      delete this.charts.billingTrend;
    }

    const dailyCosts = data?.dailyCosts || [];
    const labels = dailyCosts.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const amounts = dailyCosts.map(d => d.amount || 0);
    const requests = dailyCosts.map(d => d.requests || 0);

    this.charts.billingTrend = new ChartCtor(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Cost ($)',
            data: amounts,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
            yAxisID: 'y',
          },
          {
            label: 'Requests',
            data: requests,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.05)',
            borderDash: [5, 5],
            fill: false,
            tension: 0.4,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                if (label.includes('Cost')) return `${label}: $${value.toFixed(2)}`;
                return `${label}: ${value}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Cost ($)',
            },
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Requests',
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    });
  }

  /**
   * Render model breakdown chart for billing view
   */
  renderBillingModelChart(data) {
    const canvas = document.getElementById('billingModelChart');
    if (!canvas) return;

    const ChartCtor = costWidgetWindow.Chart;
    if (!ChartCtor) return;

    if (this.charts.billingModel) {
      this.charts.billingModel.destroy();
      delete this.charts.billingModel;
    }

    const byModel = data?.byModel || {};
    const labels = Object.keys(byModel);
    const values = Object.values(byModel);

    const modelColors = {
      'claude-sonnet-4': '#d97706',
      'claude': '#d97706',
      'codex': '#10b981',
      'kimi-k2': '#8b5cf6',
      'kimi': '#8b5cf6',
      'gpt-4': '#3b82f6',
      'gpt-4o': '#06b6d4',
    };

    const backgroundColors = labels.map(label => {
      for (const [key, color] of Object.entries(modelColors)) {
        if (label.toLowerCase().includes(key)) return color;
      }
      return '#6b7280';
    });

    this.charts.billingModel = new ChartCtor(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: backgroundColors,
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return `${label}: $${value.toFixed(2)} (${percentage}%)`;
              },
            },
          },
        },
        cutout: '65%',
      },
    });
  }

  /**
   * Render provider bar chart for billing view
   */
  renderBillingProviderChart(data) {
    const canvas = document.getElementById('billingProviderChart');
    if (!canvas) return;

    const ChartCtor = costWidgetWindow.Chart;
    if (!ChartCtor) return;

    if (this.charts.billingProvider) {
      this.charts.billingProvider.destroy();
      delete this.charts.billingProvider;
    }

    const byProvider = data?.byProvider || {};
    const labels = Object.keys(byProvider).map(k => k.charAt(0).toUpperCase() + k.slice(1));
    const values = Object.values(byProvider);

    const providerColors = {
      'Claude': '#d97706',
      'Codex': '#10b981',
      'Kimi': '#8b5cf6',
    };

    const backgroundColors = labels.map(label => providerColors[label] || '#6b7280');

    this.charts.billingProvider = new ChartCtor(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Cost',
          data: values,
          backgroundColor: backgroundColors,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.parsed.y || 0;
                return `Cost: $${value.toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Cost ($)',
            },
          },
        },
      },
    });
  }

  // ==================== Event Handlers ====================

  async handleRefresh() {
    this.clearCache();
    const period = document.getElementById('billingPeriod')?.value || '30d';
    await this.loadBillingData(period);
    Toast.success('Billing data refreshed');
  }

  async handlePeriodChange(e) {
    const period = e.target.value;
    await this.loadBillingData(period);
  }

  // ==================== Auto-refresh ====================

  startAutoRefresh() {
    if (this.refreshInterval) return;
    this.refreshInterval = setInterval(() => {
      this.handleRefresh();
    }, 30000); // 30 seconds
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // ==================== Utility Methods ====================

  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(this.parseTimestamp(timestamp));
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  // ==================== Cleanup ====================

  destroy() {
    this.stopAutoRefresh();
    this.clearCache();
    
    Object.values(this.charts).forEach(chart => {
      if (chart) chart.destroy();
    });
    this.charts = {};
  }
}

// Export for use in dashboard
if (typeof window !== 'undefined') {
  window.CostWidget = CostWidget;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CostWidget };
}
