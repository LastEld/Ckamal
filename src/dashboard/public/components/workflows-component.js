/**
 * CogniMesh v5.0 - Workflows Component
 * Workflow management grid with search, status filters, and execution controls
 */

const workflowsWindow = typeof window !== 'undefined' ? window : globalThis;

class WorkflowsComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    this.workflows = [];
    this.filteredWorkflows = [];
    this.loading = false;
    this.searchQuery = '';
    this.statusFilter = '';

    // Bind search/filter controls
    document.getElementById('workflowSearch')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.applyFilters();
    });

    document.getElementById('workflowStatusFilter')?.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.applyFilters();
    });

    // Bind create workflow button
    document.getElementById('createWorkflowBtn')?.addEventListener('click', () => {
      this.showCreateWorkflowModal();
    });
  }

  // Show create workflow modal
  showCreateWorkflowModal() {
    // Close any existing modals
    this.closeWorkflowModals();

    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('active');

    const modal = document.createElement('div');
    modal.className = 'modal modal-lg active';
    modal.id = 'createWorkflowModal';
    modal.innerHTML = `
      <div class="modal-header">
        <h3>Create New Workflow</h3>
        <button class="btn-icon modal-close" id="closeCreateWorkflowModal" title="Close">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="workflowName">Workflow Name</label>
          <input type="text" id="workflowName" placeholder="Enter workflow name">
        </div>
        <div class="form-group">
          <label for="workflowType">Workflow Type</label>
          <select id="workflowType">
            <option value="single">Single</option>
            <option value="parallel">Parallel</option>
            <option value="chain">Chain</option>
            <option value="swarm">Swarm</option>
            <option value="plan">Plan</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tasks</label>
          <div id="workflowTasks">
            <div class="task-input-row">
              <input type="text" class="task-name" placeholder="Task name">
              <button class="btn btn-icon remove-task" title="Remove task">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
          <button class="btn btn-secondary" id="addTaskBtn">
            <i data-lucide="plus"></i>
            Add Task
          </button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelCreateWorkflow">Cancel</button>
        <button class="btn btn-primary" id="confirmCreateWorkflow">
          <i data-lucide="play"></i>
          Create & Start
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    // Initialize icons
    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }

    // Event listeners
    document.getElementById('closeCreateWorkflowModal')?.addEventListener('click', () => {
      this.closeWorkflowModals();
    });

    document.getElementById('cancelCreateWorkflow')?.addEventListener('click', () => {
      this.closeWorkflowModals();
    });

    document.getElementById('addTaskBtn')?.addEventListener('click', () => {
      this.addTaskInput();
    });

    document.getElementById('confirmCreateWorkflow')?.addEventListener('click', () => {
      this.createWorkflow();
    });

    // Close on overlay click
    overlay?.addEventListener('click', () => {
      this.closeWorkflowModals();
    });

    // Attach remove listeners to initial task row
    document.querySelectorAll('.remove-task').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.task-input-row')?.remove();
      });
    });

    // Focus on name input
    document.getElementById('workflowName')?.focus();
  }

  // Close workflow modals
  closeWorkflowModals() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('active');

    const modal = document.getElementById('createWorkflowModal');
    if (modal) modal.remove();
  }

  // Add task input row
  addTaskInput() {
    const container = document.getElementById('workflowTasks');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'task-input-row';
    row.innerHTML = `
      <input type="text" class="task-name" placeholder="Task name">
      <button class="btn btn-icon remove-task" title="Remove task">
        <i data-lucide="trash-2"></i>
      </button>
    `;

    row.querySelector('.remove-task')?.addEventListener('click', () => {
      row.remove();
    });

    container.appendChild(row);

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  // Create workflow from modal
  async createWorkflow() {
    const type = document.getElementById('workflowType')?.value;
    const name = document.getElementById('workflowName')?.value;

    if (!name) {
      if (window.Toast) window.Toast.error('Please enter a workflow name');
      return;
    }

    // Collect tasks
    const taskInputs = document.querySelectorAll('.task-name');
    const tasks = Array.from(taskInputs)
      .map(input => input.value.trim())
      .filter(name => name);

    if (tasks.length === 0) {
      if (window.Toast) window.Toast.error('Please add at least one task');
      return;
    }

    try {
      const workflow = await this.api.createWorkflow({
        type,
        name,
        tasks: tasks.map((name, index) => ({
          id: `task_${index}`,
          name,
          type: 'default'
        }))
      });

      this.closeWorkflowModals();

      if (window.Toast) window.Toast.success('Workflow created');

      // Optionally start immediately
      if (workflow?.id) {
        await this.api.executeWorkflow(workflow.id);
        if (window.Toast) window.Toast.success('Workflow started');
      }

      // Refresh list
      await this.loadWorkflows();

    } catch (error) {
      console.error('Failed to create workflow:', error);
      if (window.Toast) window.Toast.error('Failed to create workflow');
    }
  }

  // Load workflows from API
  async loadWorkflows() {
    if (this.loading) return;
    this.loading = true;

    // Show loading state
    this.renderLoading();

    try {
      if (!this.api?.getWorkflows) {
        console.warn('Workflows API is unavailable');
        this.workflows = [];
        this.filteredWorkflows = [];
        this.renderWorkflows([]);
        return;
      }

      const data = await this.api.getWorkflows();
      this.workflows = data.workflows || [];
      this.filteredWorkflows = [...this.workflows];
      this.applyFilters();

      // Update badge
      const badge = document.getElementById('workflowsBadge');
      if (badge) {
        badge.textContent = this.workflows.length;
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
      this.renderError(
        'Failed to load workflows. Please try again.',
        () => this.loadWorkflows()
      );
      if (typeof workflowsWindow.Toast?.error === 'function') {
        workflowsWindow.Toast.error('Failed to load workflows');
      }
    } finally {
      this.loading = false;
    }
  }

  // Render loading state
  renderLoading() {
    const container = document.getElementById('workflowsGrid');
    if (!container) return;

    container.innerHTML = `
      <div class="loading-state">
        <i data-lucide="loader-2" class="spin"></i>
        <p>Loading workflows...</p>
      </div>
    `;

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  // Render error state with retry button
  renderError(message, retryCallback) {
    const container = document.getElementById('workflowsGrid');
    if (!container) return;

    container.innerHTML = `
      <div class="error-state">
        <i data-lucide="alert-circle"></i>
        <p>${this.escapeHtml(message)}</p>
        <button class="btn btn-primary retry-btn">
          <i data-lucide="refresh-cw"></i>
          Retry
        </button>
      </div>
    `;

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }

    container.querySelector('.retry-btn')?.addEventListener('click', () => {
      if (retryCallback) retryCallback();
    });
  }

  // Apply search and status filters
  applyFilters() {
    this.filteredWorkflows = this.workflows.filter(workflow => {
      // Search filter
      if (this.searchQuery) {
        const id = (workflow.id || '').toLowerCase();
        const type = (workflow.type || '').toLowerCase();
        const name = (workflow.name || '').toLowerCase();
        if (!id.includes(this.searchQuery) &&
            !type.includes(this.searchQuery) &&
            !name.includes(this.searchQuery)) {
          return false;
        }
      }

      // Status filter
      if (this.statusFilter) {
        if (workflow.state !== this.statusFilter) return false;
      }

      return true;
    });

    this.renderWorkflows(this.filteredWorkflows);
  }

  // Render workflow cards into #workflowsGrid
  renderWorkflows(workflows) {
    const container = document.getElementById('workflowsGrid');
    if (!container) return;

    if (workflows.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="workflow"></i>
          <p>${this.workflows.length === 0 ? 'No workflows available' : 'No workflows match your search'}</p>
        </div>
      `;
    } else {
      container.innerHTML = workflows.map(workflow => this.renderWorkflowCard(workflow)).join('');
    }

    // Re-initialize Lucide icons
    if (typeof workflowsWindow.lucide?.createIcons === 'function') {
      workflowsWindow.lucide.createIcons();
    }

    this.attachEventListeners();
  }

  // Render a single workflow card
  renderWorkflowCard(workflow) {
    const statusColors = {
      pending: 'var(--warning)',
      running: 'var(--info)',
      paused: 'var(--warning)',
      completed: 'var(--success)',
      failed: 'var(--danger)',
      cancelled: 'var(--secondary)'
    };

    const id = this.escapeHtml(workflow.id);
    const type = this.escapeHtml(workflow.type || 'Unknown');
    const state = this.escapeHtml(workflow.state || 'pending');
    const progress = workflow.progress || 0;
    const statusColor = statusColors[workflow.state] || 'var(--secondary)';

    return `
      <div class="workflow-card" data-workflow-id="${id}">
        <div class="workflow-header">
          <span class="workflow-status" style="background: ${statusColor}">
            ${state}
          </span>
          <span class="workflow-type">${type}</span>
        </div>
        <h4 class="workflow-id">${id}</h4>
        <div class="workflow-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <span class="progress-text">${progress}%</span>
        </div>
        <div class="workflow-actions">
          ${workflow.state === 'pending' ? `<button class="btn btn-sm btn-primary" data-action="start">Start</button>` : ''}
          ${workflow.state === 'running' ? `<button class="btn btn-sm btn-warning" data-action="pause">Pause</button>` : ''}
          ${workflow.state === 'paused' ? `<button class="btn btn-sm btn-primary" data-action="resume">Resume</button>` : ''}
          ${['running', 'paused'].includes(workflow.state) ? `<button class="btn btn-sm btn-danger" data-action="stop">Stop</button>` : ''}
        </div>
      </div>
    `;
  }

  // Attach event listeners to workflow cards
  attachEventListeners() {
    document.querySelectorAll('.workflow-card').forEach(card => {
      const id = card.dataset.workflowId;
      card.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          this.handleAction(id, action);
        });
      });
    });
  }

  // Handle workflow actions
  async handleAction(id, action) {
    try {
      switch (action) {
        case 'start':
          if (this.api?.executeWorkflow) {
            await this.api.executeWorkflow(id);
          } else {
            throw new Error('Execute workflow API is unavailable');
          }
          break;
        case 'pause':
          if (this.api?.pauseWorkflow) {
            await this.api.pauseWorkflow(id);
          } else {
            throw new Error('Pause workflow API is unavailable');
          }
          break;
        case 'resume':
          if (this.api?.resumeWorkflow) {
            await this.api.resumeWorkflow(id);
          } else {
            throw new Error('Resume workflow API is unavailable');
          }
          break;
        case 'stop':
          if (this.api?.cancelWorkflow) {
            await this.api.cancelWorkflow(id);
          } else {
            throw new Error('Cancel workflow API is unavailable');
          }
          break;
      }

      await this.loadWorkflows();

      if (typeof workflowsWindow.Toast?.success === 'function') {
        workflowsWindow.Toast.success(`Workflow ${action}ed`);
      }
    } catch (error) {
      console.error(`Failed to ${action} workflow:`, error);
      if (typeof workflowsWindow.Toast?.error === 'function') {
        workflowsWindow.Toast.error(`Failed to ${action} workflow`);
      }
    }
  }

  // Utility: Escape HTML for XSS safety
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  window.WorkflowsComponent = WorkflowsComponent;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkflowsComponent };
}
