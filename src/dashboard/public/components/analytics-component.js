/**
 * CogniMesh v5.0 - Analytics Component
 * Charts and visualizations using Chart.js
 */

const analyticsWindow = typeof window !== 'undefined' ? window : globalThis;

class AnalyticsComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.charts = {};
    this.data = {};
  }

  isChartAvailable() {
    return typeof this.getChartCtor() === 'function';
  }

  getChartCtor() {
    return analyticsWindow.Chart || null;
  }

  destroyChart(name) {
    if (this.charts[name]) {
      this.charts[name].destroy();
      delete this.charts[name];
    }
  }

  normalizeSeries(values, length) {
    const series = Array.isArray(values) ? values : [];
    return Array.from({ length }, (_, index) => Number(series[index]) || 0);
  }

  getSettledValue(result) {
    return result.status === 'fulfilled' ? result.value ?? null : null;
  }

  // Initialize component
  initialize() {
    this.loadAnalyticsData();
  }

  // Load all analytics data
  async loadAnalyticsData() {
    try {
      const [dashboard, trends, performance, agents] = await Promise.allSettled([
        this.api?.getDashboardAnalytics?.(),
        this.api?.getTrends?.('30d'),
        this.api?.getPerformanceMetrics?.(),
        this.api?.getAgentActivity?.(),
      ]);
      
      this.data = {
        dashboard: this.getSettledValue(dashboard),
        trends: this.getSettledValue(trends),
        performance: this.getSettledValue(performance),
        agents: this.getSettledValue(agents),
      };
      this.renderCharts();
    } catch (error) {
      Toast.error('Failed to load analytics data');
    }
  }

  // Render all charts
  renderCharts() {
    if (!this.isChartAvailable()) {
      this.destroy();
      console.warn('Chart.js is not available; analytics charts were not rendered.');
      return;
    }

    this.renderAnalyticsSummary();
    this.renderTrendChart();
    this.renderQuadrantChart();
    this.renderCompletionChart();
    this.renderPriorityChart();
    this.renderVelocityChart();
    this.renderAgentChart();
  }

  // Render trend chart (mini on dashboard)
  renderTrendChart() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const ChartCtor = this.getChartCtor();
    if (!ctx || !ChartCtor) return;
    
    // Destroy existing chart
    this.destroyChart('trend');

    const labels = Array.isArray(this.data.trends?.labels) && this.data.trends.labels.length
      ? this.data.trends.labels
      : this.generateDateLabels(7);
    const created = this.normalizeSeries(this.data.trends?.created, labels.length);
    const completed = this.normalizeSeries(this.data.trends?.completed, labels.length);
    
    this.charts.trend = new ChartCtor(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Created',
            data: created,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
          },
          {
            label: 'Completed',
            data: completed,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
            },
          },
        },
      },
    });
  }

  // Render quadrant distribution chart
  renderQuadrantChart() {
    const canvas = document.getElementById('quadrantChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const ChartCtor = this.getChartCtor();
    if (!ctx || !ChartCtor) return;
    
    this.destroyChart('quadrant');

    const quadrantData = this.data.dashboard?.tasksByQuadrant || {};
    
    this.charts.quadrant = new ChartCtor(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Do First', 'Schedule', 'Delegate', 'Eliminate'],
        datasets: [{
          data: ['doFirst', 'schedule', 'delegate', 'eliminate'].map(key => Number(quadrantData[key]) || 0),
          backgroundColor: [
            '#ef4444', // Red for Do First
            '#3b82f6', // Blue for Schedule
            '#f59e0b', // Yellow for Delegate
            '#6b7280', // Gray for Eliminate
          ],
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
        },
        cutout: '60%',
      },
    });
  }

  // Render completion chart (detailed)
  renderCompletionChart() {
    const canvas = document.getElementById('completionChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const ChartCtor = this.getChartCtor();
    if (!ctx || !ChartCtor) return;
    
    this.destroyChart('completion');

    const labels = Array.isArray(this.data.trends?.labels) && this.data.trends.labels.length
      ? this.data.trends.labels
      : this.generateDateLabels(30);
    const completed = this.normalizeSeries(this.data.trends?.completed, labels.length);
    
    this.charts.completion = new ChartCtor(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Tasks Completed',
          data: completed,
          backgroundColor: '#3b82f6',
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
        },
        scales: {
          y: {
            beginAtZero: true,
          },
          x: {
            grid: {
              display: false,
            },
          },
        },
      },
    });
  }

  // Render priority distribution chart
  renderPriorityChart() {
    const canvas = document.getElementById('priorityChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const ChartCtor = this.getChartCtor();
    if (!ctx || !ChartCtor) return;
    
    this.destroyChart('priority');

    const priorityData = this.data.dashboard?.tasksByPriority || {};
    
    this.charts.priority = new ChartCtor(ctx, {
      type: 'pie',
      data: {
        labels: ['High', 'Medium', 'Low'],
        datasets: [{
          data: ['high', 'medium', 'low'].map(key => Number(priorityData[key]) || 0),
          backgroundColor: [
            '#ef4444',
            '#f59e0b',
            '#22c55e',
          ],
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
          },
        },
      },
    });
  }

  // Render team velocity chart
  renderVelocityChart() {
    const canvas = document.getElementById('velocityChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const ChartCtor = this.getChartCtor();
    if (!ctx || !ChartCtor) return;
    
    this.destroyChart('velocity');

    const velocity = Number(this.data.performance?.teamVelocity || 0);
    
    this.charts.velocity = new ChartCtor(ctx, {
      type: 'bar',
      data: {
        labels: ['7-day average'],
        datasets: [{
          label: 'Completed tasks per day',
          data: [velocity],
          backgroundColor: '#8b5cf6',
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
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }

  // Render summary metric cards above charts
  renderAnalyticsSummary() {
    const container = document.getElementById('analyticsSummary');
    if (!container) return;

    const trends = this.data.trends || {};
    const agents = this.data.agents || {};

    const createdArr = Array.isArray(trends.created) ? trends.created : [];
    const completedArr = Array.isArray(trends.completed) ? trends.completed : [];
    const totalCreated = createdArr.reduce((sum, v) => sum + (Number(v) || 0), 0);
    const totalCompleted = completedArr.reduce((sum, v) => sum + (Number(v) || 0), 0);
    const activeAgents = Number(agents.activeAgents) || 0;
    const avgSuccess = Number(agents.successRate) || 0;

    const metrics = [
      {
        icon: 'file-plus',
        color: 'blue',
        value: totalCreated,
        label: 'Total Tasks Created',
      },
      {
        icon: 'check-circle',
        color: 'green',
        value: totalCompleted,
        label: 'Tasks Completed',
      },
      {
        icon: 'bot',
        color: 'purple',
        value: activeAgents,
        label: 'Active Agents',
      },
      {
        icon: 'percent',
        color: 'amber',
        value: `${avgSuccess}%`,
        label: 'Avg Success Rate',
      },
    ];

    container.innerHTML = metrics
      .map(
        m => `<div class="analytics-metric-card">
          <div class="metric-icon ${m.color}">
            <i data-lucide="${m.icon}"></i>
          </div>
          <div class="metric-info">
            <span class="metric-value">${m.value}</span>
            <span class="metric-label">${m.label}</span>
          </div>
        </div>`
      )
      .join('');

    // Re-render Lucide icons for the newly injected markup
    if (typeof window !== 'undefined' && window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  // Render agent performance chart — per-provider breakdown
  renderAgentChart() {
    const canvas = document.getElementById('agentChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const ChartCtor = this.getChartCtor();
    if (!ctx || !ChartCtor) return;

    this.destroyChart('agent');

    const agentMetrics = this.data.agents || {};
    const byProvider = agentMetrics.byProvider || null;

    // If per-provider data is available, render grouped bar chart with dual Y axes
    if (byProvider && typeof byProvider === 'object') {
      const providerKeys = ['claude', 'codex', 'kimi'];
      const providerLabels = ['Claude', 'Codex', 'Kimi'];
      const providerColors = {
        claude: '#d97706',
        codex: '#10b981',
        kimi: '#8b5cf6',
      };

      const tasksData = providerKeys.map(
        key => Number(byProvider[key]?.tasksExecuted) || 0
      );
      const successData = providerKeys.map(
        key => Number(byProvider[key]?.successRate) || 0
      );

      this.charts.agent = new ChartCtor(ctx, {
        type: 'bar',
        data: {
          labels: providerLabels,
          datasets: [
            {
              label: 'Tasks Executed',
              data: tasksData,
              backgroundColor: providerKeys.map(k => providerColors[k]),
              borderRadius: 4,
              yAxisID: 'yTasks',
              order: 2,
            },
            {
              label: 'Success Rate (%)',
              data: successData,
              type: 'line',
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              pointBackgroundColor: '#22c55e',
              pointRadius: 5,
              pointHoverRadius: 7,
              fill: true,
              tension: 0.3,
              yAxisID: 'yRate',
              order: 1,
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
                label(context) {
                  const label = context.dataset.label || '';
                  const value = context.parsed.y;
                  if (label.includes('Rate')) return `${label}: ${value}%`;
                  return `${label}: ${value}`;
                },
              },
            },
          },
          scales: {
            yTasks: {
              type: 'linear',
              position: 'left',
              beginAtZero: true,
              title: {
                display: true,
                text: 'Tasks Executed',
              },
              grid: {
                drawOnChartArea: true,
              },
            },
            yRate: {
              type: 'linear',
              position: 'right',
              beginAtZero: true,
              max: 100,
              title: {
                display: true,
                text: 'Success Rate (%)',
              },
              grid: {
                drawOnChartArea: false,
              },
            },
            x: {
              grid: {
                display: false,
              },
            },
          },
        },
      });
      return;
    }

    // Fallback: aggregate-only data (no byProvider breakdown)
    const labels = ['Active Agents', 'Tasks Executed', 'Success Rate'];
    const values = [
      Number(agentMetrics.activeAgents) || 0,
      Number(agentMetrics.tasksExecuted) || 0,
      Number(agentMetrics.successRate) || 0,
    ];

    this.charts.agent = new ChartCtor(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Metrics',
            data: values,
            backgroundColor: '#3b82f6',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }

  // Generate date labels
  generateDateLabels(days) {
    const labels = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    
    return labels;
  }

  // Update chart data
  updateChartData(chartName, newData) {
    if (this.charts[chartName]) {
      this.charts[chartName].data = newData;
      this.charts[chartName].update();
    }
  }

  // Refresh all charts
  refresh() {
    this.loadAnalyticsData();
  }

  // Destroy all charts (cleanup)
  destroy() {
    Object.values(this.charts).forEach(chart => {
      if (chart) chart.destroy();
    });
    this.charts = {};
  }
}

if (typeof window !== 'undefined') {
  window.AnalyticsComponent = AnalyticsComponent;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnalyticsComponent };
}
