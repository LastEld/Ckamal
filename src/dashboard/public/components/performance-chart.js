/**
 * CogniMesh v5.0 - Performance Chart Component
 * Task completion rate chart with trend analysis
 */

const performanceChartWindow = typeof window !== 'undefined' ? window : globalThis;

class PerformanceChart {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    
    // Chart instance
    this.chart = null;
    this.canvas = null;
    
    // Data
    this.data = {
      labels: [],
      completed: [],
      created: [],
      rates: []
    };
    
    // Options
    this.period = options.period || '7d';
    this.chartType = options.chartType || 'line';
    this.showTrend = options.showTrend !== false;
    this.showGoals = options.showGoals !== false;
    
    // Goal settings
    this.goals = {
      daily: options.dailyGoal || 5,
      weekly: options.weeklyGoal || 25,
      completionRate: options.completionRateGoal || 80
    };
  }

  // Fetch performance data from API
  async fetchData() {
    try {
      if (!this.api?.getTrends) {
        return this.getEmptyData();
      }
      
      const data = await this.api.getTrends(this.period);
      const labels = Array.isArray(data?.labels) ? data.labels : [];
      const completed = Array.isArray(data?.completed) ? data.completed.map((v) => Number(v || 0)) : [];
      const created = Array.isArray(data?.created) ? data.created.map((v) => Number(v || 0)) : [];
      const rates = Array.isArray(data?.rates) && data.rates.length === labels.length
        ? data.rates.map((v) => Number(v || 0))
        : labels.map((_, index) => {
            const c = completed[index] || 0;
            const d = created[index] || 0;
            return d > 0 ? Math.round((c / d) * 100) : 0;
          });

      return {
        labels: labels.map((label) => {
          const parsed = Date.parse(label);
          if (Number.isFinite(parsed)) {
            return new Date(parsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }
          return String(label);
        }),
        completed,
        created,
        rates
      };
    } catch (error) {
      console.error('Failed to fetch performance data:', error);
      return this.getEmptyData();
    }
  }

  // Get empty data with deterministic labels for selected period
  getEmptyData() {
    const days = this.period === '7d' ? 7 : this.period === '30d' ? 30 : 90;
    const labels = [];
    const completed = new Array(days).fill(0);
    const created = new Array(days).fill(0);
    const rates = new Array(days).fill(0);
    
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    
    return { labels, completed, created, rates };
  }

  // Calculate trend line using simple linear regression
  calculateTrend(data) {
    const n = data.length;
    if (n < 2) return data;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return data.map((_, i) => slope * i + intercept);
  }

  // Calculate completion rate statistics
  calculateStats() {
    const rates = this.data.rates;
    const completed = this.data.completed;
    const created = this.data.created;
    
    if (!rates.length) {
      return {
        avgRate: 0,
        bestDay: '-',
        totalCompleted: 0,
        totalCreated: 0,
        trendDirection: 'neutral'
      };
    }
    
    const avgRate = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
    const maxRate = Math.max(...rates);
    const bestDayIndex = rates.indexOf(maxRate);
    const bestDay = this.data.labels[bestDayIndex] || '-';
    
    const totalCompleted = completed.reduce((a, b) => a + b, 0);
    const totalCreated = created.reduce((a, b) => a + b, 0);
    
    // Determine trend direction
    const firstHalf = rates.slice(0, Math.floor(rates.length / 2));
    const secondHalf = rates.slice(Math.floor(rates.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    let trendDirection = 'neutral';
    if (secondAvg > firstAvg * 1.1) trendDirection = 'up';
    else if (secondAvg < firstAvg * 0.9) trendDirection = 'down';
    
    return {
      avgRate,
      bestDay,
      totalCompleted,
      totalCreated,
      trendDirection
    };
  }

  // Get chart colors based on theme
  getChartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    return {
      primary: '#3b82f6',
      primaryBg: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
      success: '#22c55e',
      successBg: isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
      warning: '#f59e0b',
      danger: '#ef4444',
      trend: '#8b5cf6',
      goal: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.1)',
      text: isDark ? '#cbd5e1' : '#475569',
      grid: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
    };
  }

  // Render the performance chart
  async render(containerId, options = {}) {
    const container = typeof containerId === 'string' 
      ? document.getElementById(containerId) 
      : containerId;
      
    if (!container) return;

    // Update options
    if (options.period) this.period = options.period;
    if (options.chartType) this.chartType = options.chartType;

    // Fetch data
    this.data = await this.fetchData();
    const stats = this.calculateStats();
    const colors = this.getChartColors();

    container.innerHTML = `
      <div class="performance-chart">
        <div class="performance-header">
          <div class="performance-title">
            <i data-lucide="trending-up"></i>
            <span>Task Completion Rate</span>
          </div>
          <div class="performance-controls">
            <select class="period-select" data-period>
              <option value="7d" ${this.period === '7d' ? 'selected' : ''}>Last 7 Days</option>
              <option value="30d" ${this.period === '30d' ? 'selected' : ''}>Last 30 Days</option>
              <option value="90d" ${this.period === '90d' ? 'selected' : ''}>Last 90 Days</option>
            </select>
            <div class="chart-type-toggle">
              <button class="type-btn ${this.chartType === 'line' ? 'active' : ''}" data-type="line" title="Line Chart">
                <i data-lucide="trending-up"></i>
              </button>
              <button class="type-btn ${this.chartType === 'bar' ? 'active' : ''}" data-type="bar" title="Bar Chart">
                <i data-lucide="bar-chart-2"></i>
              </button>
            </div>
          </div>
        </div>
        
        <div class="performance-stats">
          <div class="stat-item">
            <span class="stat-value ${stats.trendDirection}">
              ${stats.avgRate}%
              ${stats.trendDirection === 'up' ? '<i data-lucide="trending-up"></i>' : 
                stats.trendDirection === 'down' ? '<i data-lucide="trending-down"></i>' : 
                '<i data-lucide="minus"></i>'}
            </span>
            <span class="stat-label">Avg Completion Rate</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${stats.totalCompleted}</span>
            <span class="stat-label">Tasks Completed</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${stats.bestDay}</span>
            <span class="stat-label">Best Day</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${stats.totalCreated}</span>
            <span class="stat-label">Tasks Created</span>
          </div>
        </div>
        
        <div class="chart-container">
          <canvas id="performanceCanvas"></canvas>
        </div>
        
        <div class="performance-legend">
          <div class="legend-item">
            <span class="legend-color" style="background: ${colors.success}"></span>
            <span>Completed</span>
          </div>
          <div class="legend-item">
            <span class="legend-color" style="background: ${colors.primary}"></span>
            <span>Created</span>
          </div>
          ${this.showTrend ? `
            <div class="legend-item">
              <span class="legend-color dashed" style="background: ${colors.trend}"></span>
              <span>Trend</span>
            </div>
          ` : ''}
          ${this.showGoals ? `
            <div class="legend-item">
              <span class="legend-color dotted" style="background: ${colors.goal}"></span>
              <span>Goal (${this.goals.completionRate}%)</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Re-initialize icons
    if (performanceChartWindow.lucide?.createIcons) {
      performanceChartWindow.lucide.createIcons();
    }

    // Create chart
    this.createChart();

    // Attach event listeners
    this.attachEventListeners(container);
  }

  // Create the chart using Chart.js
  createChart() {
    const canvas = document.getElementById('performanceCanvas');
    if (!canvas) return;

    const ChartCtor = performanceChartWindow.Chart;
    if (!ChartCtor) {
      console.warn('Chart.js not available');
      return;
    }

    this.canvas = canvas;

    // Destroy existing chart
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const colors = this.getChartColors();
    const ctx = canvas.getContext('2d');
    
    // Prepare datasets
    const datasets = [
      {
        label: 'Completed',
        data: this.data.completed,
        borderColor: colors.success,
        backgroundColor: colors.successBg,
        fill: this.chartType === 'line',
        tension: 0.4,
        borderWidth: 2,
        type: this.chartType === 'line' ? 'line' : 'bar'
      },
      {
        label: 'Created',
        data: this.data.created,
        borderColor: colors.primary,
        backgroundColor: colors.primaryBg,
        fill: this.chartType === 'line',
        tension: 0.4,
        borderWidth: 2,
        type: this.chartType === 'line' ? 'line' : 'bar'
      }
    ];

    // Add trend line if enabled
    if (this.showTrend && this.chartType === 'line') {
      const trendData = this.calculateTrend(this.data.completed);
      datasets.push({
        label: 'Trend',
        data: trendData,
        borderColor: colors.trend,
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        fill: false,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0,
        type: 'line'
      });
    }

    // Add goal line if enabled
    if (this.showGoals) {
      const goalData = new Array(this.data.labels.length).fill(this.goals.daily);
      datasets.push({
        label: 'Goal',
        data: goalData,
        borderColor: colors.goal,
        backgroundColor: 'transparent',
        borderDash: [2, 2],
        fill: false,
        tension: 0,
        borderWidth: 1,
        pointRadius: 0,
        type: 'line'
      });
    }

    this.chart = new ChartCtor(ctx, {
      type: this.chartType,
      data: {
        labels: this.data.labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                if (label === 'Trend') return `${label}: ~${Math.round(value)} tasks`;
                return `${label}: ${Math.round(value)} tasks`;
              },
              afterBody: (tooltipItems) => {
                const index = tooltipItems[0].dataIndex;
                const completed = this.data.completed[index] || 0;
                const created = this.data.created[index] || 0;
                const rate = created > 0 ? Math.round((completed / created) * 100) : 0;
                return `Completion Rate: ${rate}%`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false,
              color: colors.grid
            },
            ticks: {
              color: colors.text,
              maxRotation: 45,
              minRotation: 0
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text
            },
            title: {
              display: true,
              text: 'Tasks',
              color: colors.text
            }
          }
        }
      }
    });
  }

  // Attach event listeners
  attachEventListeners(container) {
    // Period select
    const periodSelect = container.querySelector('[data-period]');
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        this.period = e.target.value;
        this.render(container);
      });
    }

    // Chart type toggle
    container.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.chartType = btn.dataset.type;
        container.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.createChart();
      });
    });
  }

  // Update chart data
  updateData(newData) {
    this.data = { ...this.data, ...newData };
    if (this.chart) {
      this.chart.data.labels = this.data.labels;
      this.chart.data.datasets[0].data = this.data.completed;
      this.chart.data.datasets[1].data = this.data.created;
      this.chart.update('none'); // Update without animation
    }
  }

  // Refresh the chart
  async refresh() {
    const container = document.querySelector('.performance-chart')?.parentElement;
    if (container) {
      await this.render(container);
    }
  }

  // Destroy chart instance
  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  // Subscribe to WebSocket updates
  subscribeToUpdates() {
    if (!this.ws?.addEventListener) return;

    this.ws.addEventListener('message:task.completed', () => {
      this.refresh();
    });

    this.ws.addEventListener('message:task.created', () => {
      this.refresh();
    });

    // Listen for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          this.createChart();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
  }
}

if (typeof window !== 'undefined') {
  window.PerformanceChart = PerformanceChart;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PerformanceChart };
}
