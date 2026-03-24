/**
 * CogniMesh v5.0 - Tasks Component
 * Eisenhower matrix with drag-and-drop functionality
 */

const tasksWindow = typeof window !== 'undefined' ? window : globalThis;

class TasksComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    this.onTaskChange = options.onTaskChange || (() => {});
    
    this.tasks = [];
    this.filteredTasks = [];
    this.sortableInstances = [];
    this.currentFilter = '';
    
    // Quadrant configuration
    this.quadrants = {
      'do-first': { urgent: true, important: true, name: 'Do First' },
      'schedule': { urgent: false, important: true, name: 'Schedule' },
      'delegate': { urgent: true, important: false, name: 'Delegate' },
      'eliminate': { urgent: false, important: false, name: 'Eliminate' },
    };
  }

  // Initialize component
  initialize() {
    this.cacheElements();
    this.setupEventListeners();
    this.setupDragAndDrop();
    this.loadTasks();
  }

  // Cache DOM elements
  cacheElements() {
    this.elements = {
      // Filter controls
      statusFilter: document.getElementById('taskFilterStatus'),
      priorityFilter: document.getElementById('taskFilterPriority'),
      addTaskBtn: document.getElementById('addTaskBtn'),
      
      // Quadrant containers
      doFirstTasks: document.getElementById('doFirstTasks'),
      scheduleTasks: document.getElementById('scheduleTasks'),
      delegateTasks: document.getElementById('delegateTasks'),
      eliminateTasks: document.getElementById('eliminateTasks'),
      
      // Quadrant counts
      doFirstCount: document.getElementById('doFirstCount'),
      scheduleCount: document.getElementById('scheduleCount'),
      delegateCount: document.getElementById('delegateCount'),
      eliminateCount: document.getElementById('eliminateCount'),
      
      // Modal
      taskModal: document.getElementById('taskModal'),
      taskForm: document.getElementById('taskForm'),
      saveTaskBtn: document.getElementById('saveTaskBtn'),
    };
  }

  // Setup event listeners
  setupEventListeners() {
    // Filter changes
    this.elements.statusFilter?.addEventListener('change', () => this.applyFilters());
    this.elements.priorityFilter?.addEventListener('change', () => this.applyFilters());
    
    // Add task button
    this.elements.addTaskBtn?.addEventListener('click', () => {
      window.dashboardApp?.showTaskModal();
    });
    
    // Save task
    this.elements.saveTaskBtn?.addEventListener('click', () => this.saveTask());
  }

  // Setup drag-and-drop using SortableJS
  setupDragAndDrop() {
    const SortableCtor = tasksWindow.Sortable || null;
    if (typeof SortableCtor !== 'function') {
      console.warn('SortableJS is not available; task drag-and-drop is disabled.');
      return;
    }

    const quadrantIds = ['doFirstTasks', 'scheduleTasks', 'delegateTasks', 'eliminateTasks'];
    
    quadrantIds.forEach(id => {
      const element = document.getElementById(id);
      if (!element) return;
      
      const sortable = new SortableCtor(element, {
        group: 'tasks', // Allow dragging between quadrants
        animation: 150,
        ghostClass: 'dragging',
        dragClass: 'dragging',
        delay: 0,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        
        onStart: (evt) => {
          evt.item.classList.add('dragging');
          document.body.style.cursor = 'grabbing';
        },
        
        onEnd: (evt) => {
          evt.item.classList.remove('dragging');
          document.body.style.cursor = '';
          
          if (evt.to !== evt.from) {
            // Task moved to different quadrant
            this.handleTaskMove(evt.item.dataset.taskId, evt.from.id, evt.to.id);
          }
        },
      });
      
      this.sortableInstances.push(sortable);
    });
    
    // Add drag-over effects to quadrants
    document.querySelectorAll('.quadrant').forEach(quadrant => {
      quadrant.addEventListener('dragenter', () => {
        quadrant.classList.add('drag-over');
      });
      
      quadrant.addEventListener('dragleave', (e) => {
        if (!quadrant.contains(e.relatedTarget)) {
          quadrant.classList.remove('drag-over');
        }
      });
      
      quadrant.addEventListener('drop', () => {
        quadrant.classList.remove('drag-over');
      });
    });
  }

  // Load tasks from API
  async loadTasks() {
    try {
      if (!this.api?.getTasks) {
        this.showError('Task API is unavailable');
        return;
      }

      const filters = this.buildFilters();
      const data = await this.api.getTasks(filters);
      this.tasks = data.tasks || [];
      this.applyFilters();
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.showError('Failed to load tasks');
    }
  }

  // Build API filters from UI state
  buildFilters() {
    const filters = {};
    
    if (this.elements.statusFilter?.value) {
      filters.status = this.elements.statusFilter.value;
    }
    
    if (this.elements.priorityFilter?.value) {
      filters.priority = this.elements.priorityFilter.value;
    }
    
    if (this.currentFilter) {
      filters.search = this.currentFilter;
    }
    
    return filters;
  }

  // Apply filters and render
  applyFilters() {
    const status = this.elements.statusFilter?.value || '';
    const priority = this.elements.priorityFilter?.value || '';
    const search = this.currentFilter.toLowerCase();
    
    this.filteredTasks = this.tasks.filter(task => {
      if (status && task.status !== status) return false;
      if (priority && task.priority !== priority) return false;
      if (search && !task.title?.toLowerCase().includes(search)) return false;
      return true;
    });
    
    this.renderTasks();
  }

  // Filter tasks by search query
  filterTasks(query) {
    this.currentFilter = query;
    this.applyFilters();
  }

  // Render tasks to quadrants
  renderTasks() {
    // Clear all quadrants
    Object.keys(this.quadrants).forEach(key => {
      const container = this.getQuadrantContainer(key);
      if (container) container.innerHTML = '';
    });
    
    // Group tasks by quadrant
    const grouped = this.groupTasksByQuadrant(this.filteredTasks);
    
    // Render each quadrant
    Object.keys(this.quadrants).forEach(quadrantKey => {
      const tasks = grouped[quadrantKey] || [];
      const container = this.getQuadrantContainer(quadrantKey);
      const countElement = this.getQuadrantCount(quadrantKey);
      
      if (countElement) {
        countElement.textContent = tasks.length;
      }
      
      if (container) {
        container.innerHTML = tasks.map(task => this.renderTaskCard(task)).join('');
      }
    });
    
    // Re-initialize icons and event listeners
    if (typeof tasksWindow.lucide?.createIcons === 'function') {
      tasksWindow.lucide.createIcons();
    }
    
    this.attachTaskEventListeners();
  }

  // Get quadrant container element
  getQuadrantContainer(quadrantKey) {
    const map = {
      'do-first': this.elements.doFirstTasks,
      'schedule': this.elements.scheduleTasks,
      'delegate': this.elements.delegateTasks,
      'eliminate': this.elements.eliminateTasks,
    };
    return map[quadrantKey];
  }

  // Get quadrant count element
  getQuadrantCount(quadrantKey) {
    const map = {
      'do-first': this.elements.doFirstCount,
      'schedule': this.elements.scheduleCount,
      'delegate': this.elements.delegateCount,
      'eliminate': this.elements.eliminateCount,
    };
    return map[quadrantKey];
  }

  // Group tasks by quadrant
  groupTasksByQuadrant(tasks) {
    const grouped = {
      'do-first': [],
      'schedule': [],
      'delegate': [],
      'eliminate': [],
    };
    
    tasks.forEach(task => {
      const quadrant = this.determineQuadrant(task);
      grouped[quadrant].push(task);
    });
    
    // Sort each quadrant by priority and due date
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => {
        // High priority first
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (b.priority === 'high' && a.priority !== 'high') return 1;
        
        // Then by due date
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate) - new Date(b.dueDate);
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        
        return 0;
      });
    });
    
    return grouped;
  }

  // Determine quadrant based on task properties
  determineQuadrant(task) {
    const urgent = task.urgent || task.priority === 'high';
    const important = task.important !== false;
    
    if (urgent && important) return 'do-first';
    if (!urgent && important) return 'schedule';
    if (urgent && !important) return 'delegate';
    return 'eliminate';
  }

  // Render single task card HTML
  renderTaskCard(task) {
    const dueDate = task.dueDate ? this.formatDate(task.dueDate) : '';
    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';
    const priorityClass = task.priority || 'medium';
    
    return `
      <div class="task-card" data-task-id="${task.id}" draggable="true">
        <div class="task-card-header">
          <span class="task-title">${this.escapeHtml(task.title)}</span>
          <span class="task-priority ${priorityClass}"></span>
        </div>
        ${task.description ? `<p class="task-description">${this.escapeHtml(task.description)}</p>` : ''}
        <div class="task-meta">
          ${dueDate ? `
            <span class="task-due ${isOverdue ? 'overdue' : ''}">
              <i data-lucide="calendar"></i>
              ${dueDate}
            </span>
          ` : ''}
          ${task.assignee ? `
            <span class="task-assignee">
              <i data-lucide="user"></i>
              ${this.escapeHtml(task.assignee)}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Attach event listeners to task cards
  attachTaskEventListeners() {
    document.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.task-actions')) {
          const taskId = card.dataset.taskId;
          const task = this.tasks.find(t => t.id === taskId);
          if (task) {
            window.dashboardApp?.showTaskModal(task);
          }
        }
      });
    });
  }

  // Handle task moved between quadrants
  async handleTaskMove(taskId, fromId, toId) {
    if (!this.api?.patchTask) {
      this.showError('Task update API is unavailable');
      return;
    }

    const quadrantMap = {
      'doFirstTasks': 'do-first',
      'scheduleTasks': 'schedule',
      'delegateTasks': 'delegate',
      'eliminateTasks': 'eliminate',
    };
    
    const fromQuadrant = quadrantMap[fromId];
    const toQuadrant = quadrantMap[toId];
    
    if (!fromQuadrant || !toQuadrant || fromQuadrant === toQuadrant) return;
    
    // Determine new urgent/important values
    const quadrantConfig = this.quadrants[toQuadrant];
    
    try {
      // Update task via API
      await this.api.patchTask(taskId, {
        urgent: quadrantConfig.urgent,
        important: quadrantConfig.important,
        quadrant: toQuadrant,
      });
      
      // Notify via WebSocket
      this.ws?.updateTask({
        id: taskId,
        urgent: quadrantConfig.urgent,
        important: quadrantConfig.important,
        quadrant: toQuadrant,
      });
      
      // Update local state
      const task = this.tasks.find(t => t.id === taskId);
      if (task) {
        task.urgent = quadrantConfig.urgent;
        task.important = quadrantConfig.important;
        task.quadrant = toQuadrant;
      }
      
      // Update counts
      this.updateQuadrantCounts();
      
      // Trigger callback
      this.onTaskChange();
      
    } catch (error) {
      console.error('Failed to move task:', error);
      this.showError('Failed to move task');
      // Revert the drag by re-rendering
      this.renderTasks();
    }
  }

  // Update quadrant counts
  updateQuadrantCounts() {
    const grouped = this.groupTasksByQuadrant(this.filteredTasks);
    Object.keys(this.quadrants).forEach(key => {
      const countElement = this.getQuadrantCount(key);
      if (countElement) {
        countElement.textContent = (grouped[key] || []).length;
      }
    });
  }

  // Save new or updated task
  async saveTask() {
    const title = document.getElementById('taskTitle')?.value.trim();
    if (!title) {
      this.showError('Task title is required');
      return;
    }

    if (!this.api?.createTask) {
      this.showError('Task create API is unavailable');
      return;
    }
    
    const task = {
      title,
      description: document.getElementById('taskDescription')?.value || '',
      priority: document.getElementById('taskPriority')?.value || 'medium',
      dueDate: document.getElementById('taskDueDate')?.value || null,
      urgent: document.getElementById('taskUrgent')?.checked || false,
      important: document.getElementById('taskImportant')?.checked !== false,
    };
    
    // Determine quadrant
    task.quadrant = this.determineQuadrant(task);
    
    try {
      await this.api.createTask(task);
      window.dashboardApp?.closeAllModals();
      this.loadTasks();
      this.onTaskChange();
    } catch (error) {
      console.error('Failed to save task:', error);
      this.showError('Failed to save task');
    }
  }

  // Update a single task (from WebSocket)
  updateTask(updatedTask) {
    if (!updatedTask?.id) {
      return;
    }

    const index = this.tasks.findIndex(t => t.id === updatedTask.id);
    if (index !== -1) {
      this.tasks[index] = { ...this.tasks[index], ...updatedTask };
      this.applyFilters();
    }
  }

  // Utility: Format date
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Utility: Escape HTML
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Utility: Show error
  showError(message) {
    // Simple alert for now, could be a toast notification
    console.error(message);
  }
}

if (typeof window !== 'undefined') {
  window.TasksComponent = TasksComponent;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TasksComponent };
}
