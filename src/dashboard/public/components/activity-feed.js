/**
 * CogniMesh v5.0 - Activity Feed Component
 * Displays recent system activities and events
 */

const activityFeedWindow = typeof window !== 'undefined' ? window : globalThis;

class ActivityFeed {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    
    // State
    this.activities = [];
    this.filter = 'all';
    this.maxItems = 10;
    this.autoRefresh = true;
    this.refreshInterval = null;
    
    // Activity type definitions
    this.activityTypes = {
      task: { icon: 'check-square', color: 'blue' },
      agent: { icon: 'bot', color: 'purple' },
      alert: { icon: 'bell', color: 'red' },
      billing: { icon: 'credit-card', color: 'green' },
      system: { icon: 'cpu', color: 'gray' },
      workflow: { icon: 'workflow', color: 'orange' },
      roadmap: { icon: 'map', color: 'cyan' }
    };
  }

  // Fetch recent activities from API
  async fetchActivities() {
    try {
      if (!this.api?.getRecentActivity) {
        return [];
      }
      
      const data = await this.api.getRecentActivity({ limit: this.maxItems });
      const rawItems = data?.activities || data?.data || data?.items || [];
      return rawItems.map((item) => this.normalizeActivity(item));
    } catch (error) {
      console.error('Failed to fetch activities:', error);
      return [];
    }
  }

  normalizeActivity(item = {}) {
    const metadata = item.metadata || item.metadata_json || {};
    return {
      id: item.id || item.uuid || `${Date.now()}-${Math.random()}`,
      type: String(item.type || item.category || item.category_name || item.entity_type || 'system').toLowerCase(),
      action: String(item.action || item.event_type || item.severity || 'updated').toLowerCase(),
      title: item.title || item.summary || item.message || 'Activity event',
      description: item.description || metadata.detail || '',
      timestamp: this.parseTimestamp(item.timestamp || item.occurred_at || item.created_at),
      actor: item.actor || item.actor_name || item.actor_id || item.actor_type || 'system',
      metadata
    };
  }

  parseTimestamp(value) {
    if (typeof value === 'number') {
      return value > 1e12 ? value : value * 1000;
    }
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

  // Get icon for activity type
  getActivityIcon(type) {
    return this.activityTypes[type]?.icon || 'activity';
  }

  // Get color class for activity type
  getActivityColor(type) {
    return this.activityTypes[type]?.color || 'gray';
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

  // Get action label
  getActionLabel(action) {
    const labels = {
      completed: 'Completed',
      created: 'Created',
      updated: 'Updated',
      deleted: 'Deleted',
      started: 'Started',
      stopped: 'Stopped',
      status_change: 'Status Change',
      threshold: 'Threshold Alert',
      milestone: 'Milestone'
    };
    return labels[action] || action;
  }

  // Filter activities
  filterActivities() {
    if (this.filter === 'all') return this.activities;
    return this.activities.filter(a => a.type === this.filter);
  }

  // Render the activity feed
  async render(containerId, options = {}) {
    const container = typeof containerId === 'string' 
      ? document.getElementById(containerId) 
      : containerId;
      
    if (!container) return;

    // Update options
    if (options.maxItems) this.maxItems = options.maxItems;
    if (options.filter) this.filter = options.filter;

    // Fetch activities
    this.activities = await this.fetchActivities();
    const filteredActivities = this.filterActivities();

    container.innerHTML = `
      <div class="activity-feed">
        <div class="activity-feed-header">
          <div class="activity-feed-title">
            <i data-lucide="activity"></i>
            <span>Recent Activity</span>
          </div>
          <div class="activity-feed-filters">
            <select class="activity-filter" data-filter>
              <option value="all" ${this.filter === 'all' ? 'selected' : ''}>All</option>
              <option value="task" ${this.filter === 'task' ? 'selected' : ''}>Tasks</option>
              <option value="agent" ${this.filter === 'agent' ? 'selected' : ''}>Agents</option>
              <option value="workflow" ${this.filter === 'workflow' ? 'selected' : ''}>Workflows</option>
              <option value="alert" ${this.filter === 'alert' ? 'selected' : ''}>Alerts</option>
              <option value="billing" ${this.filter === 'billing' ? 'selected' : ''}>Billing</option>
            </select>
            <button class="activity-refresh" data-refresh title="Refresh">
              <i data-lucide="refresh-cw"></i>
            </button>
          </div>
        </div>
        <div class="activity-feed-list">
          ${filteredActivities.length === 0 
            ? this.renderEmptyState()
            : filteredActivities.map(activity => this.renderActivity(activity)).join('')
          }
        </div>
        ${this.activities.length > 0 ? `
          <div class="activity-feed-footer">
            <button class="activity-view-all" data-view-all>
              View All Activity
              <i data-lucide="arrow-right"></i>
            </button>
          </div>
        ` : ''}
      </div>
    `;

    // Re-initialize icons
    if (activityFeedWindow.lucide?.createIcons) {
      activityFeedWindow.lucide.createIcons();
    }

    // Attach event listeners
    this.attachEventListeners(container);
  }

  // Render empty state
  renderEmptyState() {
    return `
      <div class="activity-empty-state">
        <i data-lucide="inbox"></i>
        <p>No recent activity</p>
      </div>
    `;
  }

  // Render a single activity item
  renderActivity(activity) {
    const icon = this.getActivityIcon(activity.type);
    const color = this.getActivityColor(activity.type);
    const timeAgo = this.formatTime(activity.timestamp);
    const actionLabel = this.getActionLabel(activity.action);

    return `
      <div class="activity-item" data-activity-id="${activity.id}" data-type="${activity.type}">
        <div class="activity-icon ${color}">
          <i data-lucide="${icon}"></i>
        </div>
        <div class="activity-content">
          <div class="activity-header">
            <span class="activity-title">${this.escapeHtml(activity.title)}</span>
            <span class="activity-time">${timeAgo}</span>
          </div>
          <div class="activity-description">${this.escapeHtml(activity.description)}</div>
          <div class="activity-meta">
            <span class="activity-badge ${activity.action}">${actionLabel}</span>
            ${activity.actor ? `<span class="activity-actor">by ${this.escapeHtml(activity.actor)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // Attach event listeners
  attachEventListeners(container) {
    // Filter change
    const filterSelect = container.querySelector('[data-filter]');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        this.filter = e.target.value;
        this.render(container, { filter: this.filter });
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

    // View all button
    const viewAllBtn = container.querySelector('[data-view-all]');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        if (activityFeedWindow.dashboardApp?.navigateTo) {
          activityFeedWindow.dashboardApp.navigateTo('analytics');
        }
      });
    }

    // Click on activity item
    container.querySelectorAll('.activity-item').forEach(item => {
      item.addEventListener('click', () => {
        const activityId = item.dataset.activityId;
        const activity = this.activities.find(a => a.id === activityId);
        if (activity) {
          this.handleActivityClick(activity);
        }
      });
    });
  }

  // Handle activity click
  handleActivityClick(activity) {
    // Navigate based on activity type
    const navigators = {
      task: () => activityFeedWindow.dashboardApp?.navigateTo?.('tasks'),
      agent: () => activityFeedWindow.dashboardApp?.navigateTo?.('agents'),
      workflow: () => activityFeedWindow.dashboardApp?.navigateTo?.('gsd'),
      alert: () => activityFeedWindow.dashboardApp?.navigateTo?.('alerts'),
      billing: () => activityFeedWindow.dashboardApp?.navigateTo?.('billing'),
      roadmap: () => activityFeedWindow.dashboardApp?.navigateTo?.('roadmaps')
    };

    const navigate = navigators[activity.type];
    if (navigate) {
      navigate();
    }
  }

  // Refresh the feed
  async refresh() {
    const container = document.querySelector('.activity-feed')?.parentElement;
    if (container) {
      await this.render(container);
    }
  }

  // Start auto-refresh
  startAutoRefresh(interval = 30000) {
    this.stopAutoRefresh();
    if (this.autoRefresh) {
      this.refreshInterval = setInterval(() => this.refresh(), interval);
    }
  }

  // Stop auto-refresh
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // Add new activity to feed
  addActivity(activity) {
    this.activities.unshift(activity);
    if (this.activities.length > this.maxItems * 2) {
      this.activities = this.activities.slice(0, this.maxItems * 2);
    }
    this.refresh();
  }

  // Subscribe to WebSocket updates
  subscribeToUpdates() {
    if (!this.ws?.addEventListener) return;

    const eventTypes = [
      'message:task.updated',
      'message:task.created',
      'message:task.completed',
      'message:agent.status',
      'message:alert.new',
      'message:workflow.status',
      'message:roadmap.progress'
    ];

    eventTypes.forEach(eventType => {
      this.ws.addEventListener(eventType, (event) => {
        const data = event?.detail;
        if (data) {
          this.addActivity({
            id: `ws-${Date.now()}`,
            type: eventType.split('.')[1],
            action: eventType.split('.')[2] || 'updated',
            title: data.title || `${eventType} received`,
            description: data.message || JSON.stringify(data).slice(0, 100),
            timestamp: Date.now(),
            actor: data.actor || 'System',
            metadata: data
          });
        }
      });
    });
  }
}

if (typeof window !== 'undefined') {
  window.ActivityFeed = ActivityFeed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ActivityFeed };
}
