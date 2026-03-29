/**
 * CogniMesh v5.0 - Roadmaps Component
 * Roadmaps view with progress tracking
 */

/* global Toast */

const roadmapsWindow = typeof window !== 'undefined' ? window : globalThis;

class RoadmapsComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    
    this.roadmaps = [];
    this.filteredRoadmaps = [];
    this.currentFilter = '';
  }

  // Load roadmaps from API
  async loadRoadmaps() {
    try {
      if (!this.api?.getRoadmaps) {
        console.warn('Roadmaps API is unavailable');
        this.roadmaps = [];
        this.applyFilter();
        return;
      }

      const data = await this.api.getRoadmaps();
      this.roadmaps = data.roadmaps || [];
      this.applyFilter();
    } catch (error) {
      Toast.error('Failed to load roadmaps');
    }
  }

  // Apply filter and render
  applyFilter() {
    const search = this.currentFilter.toLowerCase();
    
    this.filteredRoadmaps = this.roadmaps.filter(roadmap => {
      if (!search) return true;
      return (
        roadmap.name?.toLowerCase().includes(search) ||
        roadmap.description?.toLowerCase().includes(search)
      );
    });
    
    this.renderRoadmaps();
  }

  // Filter roadmaps by search query
  filterRoadmaps(query) {
    this.currentFilter = query;
    this.applyFilter();
  }

  // Render roadmaps grid
  renderRoadmaps() {
    const container = document.getElementById('roadmapsGrid');
    if (!container) return;
    
    if (this.filteredRoadmaps.length === 0) {
      container.innerHTML = `
        <div class="empty-state wide">
          <i data-lucide="map"></i>
          <p>No roadmaps found</p>
          <button class="btn btn-primary" id="createFirstRoadmap">
            <i data-lucide="plus"></i>
            Create your first roadmap
          </button>
        </div>
      `;
      
      document.getElementById('createFirstRoadmap')?.addEventListener('click', () => {
        this.showCreateRoadmapModal();
      });
    } else {
      container.innerHTML = this.filteredRoadmaps.map(roadmap => this.renderRoadmapCard(roadmap)).join('');
    }
    
    // Re-initialize icons
    if (typeof roadmapsWindow.lucide?.createIcons === 'function') {
      roadmapsWindow.lucide.createIcons();
    }
    
    // Attach event listeners
    this.attachEventListeners();
  }

  // Render single roadmap card
  renderRoadmapCard(roadmap) {
    const progress = roadmap.progress || 0;
    const phases = roadmap.phases || [];
    const completedPhases = phases.filter(p => p.status === 'completed').length;
    const milestones = roadmap.milestones || [];
    const completedMilestones = milestones.filter(m => m.completed).length;
    
    return `
      <div class="roadmap-card" data-roadmap-id="${roadmap.id}">
        <div class="roadmap-header">
          <h4 class="roadmap-title">${this.escapeHtml(roadmap.name)}</h4>
          ${roadmap.description ? `<p class="roadmap-description">${this.escapeHtml(roadmap.description)}</p>` : ''}
        </div>
        <div class="roadmap-body">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="progress-text">
            <span>${Math.round(progress)}% complete</span>
            <span>${phases.length} phases</span>
          </div>
        </div>
        <div class="roadmap-footer">
          <div class="roadmap-stats">
            <span><i data-lucide="layers"></i> ${completedPhases}/${phases.length} phases</span>
            <span><i data-lucide="flag"></i> ${completedMilestones}/${milestones.length} milestones</span>
          </div>
          <button class="btn btn-sm btn-secondary view-roadmap" data-id="${roadmap.id}">
            View
          </button>
        </div>
      </div>
    `;
  }

  // Attach event listeners
  attachEventListeners() {
    // View roadmap buttons (on rendered cards — destroyed by innerHTML each render)
    document.querySelectorAll('.view-roadmap').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const roadmapId = e.currentTarget.dataset.id;
        this.viewRoadmap(roadmapId);
      });
    });

    // Persistent controls — bind once only
    if (!this._persistentListenersBound) {
      this._persistentListenersBound = true;

      document.getElementById('createRoadmapBtn')?.addEventListener('click', () => {
        this.showCreateRoadmapModal();
      });

      document.getElementById('roadmapSearch')?.addEventListener('input', (e) => {
        this.filterRoadmaps(e.target.value);
      });
    }
  }

  // View roadmap details
  async viewRoadmap(roadmapId) {
    try {
      if (!this.api?.getRoadmap) {
        console.warn('Roadmap details API is unavailable');
        return;
      }

      const roadmap = await this.api.getRoadmap(roadmapId);
      this.showRoadmapDetails(roadmap);
      
      // Subscribe to real-time updates
      this.ws?.subscribeRoadmap(roadmapId);
    } catch (error) {
      Toast.error('Failed to load roadmap details');
    }
  }

  // Show roadmap details modal
  showRoadmapDetails(roadmap) {
    // Remove any existing detail modal
    document.querySelector('.roadmap-detail-modal')?.remove();

    const phases = roadmap.phases || [];
    const milestones = roadmap.milestones || [];
    const progress = roadmap.progress || 0;

    const phasesHtml = phases.length > 0
      ? phases.map(phase => {
          const taskCount = (phase.tasks || []).length;
          const statusClass = phase.status === 'completed' ? 'phase-completed'
            : phase.status === 'in-progress' ? 'phase-in-progress'
            : 'phase-pending';
          const statusLabel = phase.status === 'completed' ? 'Completed'
            : phase.status === 'in-progress' ? 'In Progress'
            : 'Pending';
          const iconName = phase.status === 'completed' ? 'check-circle'
            : phase.status === 'in-progress' ? 'loader'
            : 'circle';
          return `
            <li class="phase-item ${statusClass}">
              <div class="phase-icon"><i data-lucide="${iconName}"></i></div>
              <div class="phase-info">
                <span class="phase-name">${this.escapeHtml(phase.name)}</span>
                <span class="phase-meta">${statusLabel} &middot; ${taskCount} task${taskCount !== 1 ? 's' : ''}</span>
              </div>
            </li>`;
        }).join('')
      : '<li class="phase-item phase-pending"><span class="phase-meta">No phases defined</span></li>';

    const milestonesHtml = milestones.length > 0
      ? milestones.map(ms => {
          const completed = ms.completed;
          const dueDate = ms.dueDate ? new Date(ms.dueDate).toLocaleDateString() : '';
          const iconName = completed ? 'check-square' : 'square';
          return `
            <li class="milestone-item ${completed ? 'milestone-completed' : 'milestone-pending'}">
              <div class="milestone-icon"><i data-lucide="${iconName}"></i></div>
              <div class="milestone-info">
                <span class="milestone-title">${this.escapeHtml(ms.title)}</span>
                ${dueDate ? `<span class="milestone-due">Due: ${this.escapeHtml(dueDate)}</span>` : ''}
              </div>
            </li>`;
        }).join('')
      : '<li class="milestone-item milestone-pending"><span class="milestone-due">No milestones defined</span></li>';

    const modal = document.createElement('div');
    modal.className = 'modal roadmap-detail-modal active';
    modal.innerHTML = `
      <div class="modal-header">
        <h3>${this.escapeHtml(roadmap.name)}</h3>
        <button class="btn btn-icon modal-close roadmap-detail-close" title="Close">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        ${roadmap.description ? `<p class="roadmap-detail-description">${this.escapeHtml(roadmap.description)}</p>` : ''}
        <div class="roadmap-detail-progress">
          <div class="progress-label">Overall Progress</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="progress-text">
            <span>${Math.round(progress)}% complete</span>
          </div>
        </div>
        <div class="roadmap-detail-section">
          <h4><i data-lucide="layers"></i> Phases</h4>
          <ul class="phase-list">${phasesHtml}</ul>
        </div>
        <div class="roadmap-detail-section">
          <h4><i data-lucide="flag"></i> Milestones</h4>
          <ul class="milestone-list">${milestonesHtml}</ul>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Show overlay
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('active');

    // Bind close button
    modal.querySelector('.roadmap-detail-close')?.addEventListener('click', () => {
      roadmapsWindow.dashboardApp?.closeAllModals();
      modal.remove();
    });

    // Re-initialize lucide icons
    if (typeof roadmapsWindow.lucide?.createIcons === 'function') {
      roadmapsWindow.lucide.createIcons();
    }
  }

  // Show create roadmap modal
  showCreateRoadmapModal() {
    // Remove any existing create modal
    document.querySelector('.roadmap-create-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal roadmap-create-modal active';
    modal.innerHTML = `
      <div class="modal-header">
        <h3>Create Roadmap</h3>
        <button class="btn btn-icon modal-close roadmap-create-close" title="Close">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        <form id="createRoadmapForm">
          <div class="form-group">
            <label for="roadmapName">Name <span class="required">*</span></label>
            <input type="text" id="roadmapName" name="name" required placeholder="Roadmap name" />
          </div>
          <div class="form-group">
            <label for="roadmapDescription">Description</label>
            <textarea id="roadmapDescription" name="description" rows="3" placeholder="Optional description"></textarea>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary roadmap-create-cancel">Cancel</button>
        <button class="btn btn-primary roadmap-create-save">
          <i data-lucide="plus"></i> Create
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    // Show overlay
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('active');

    // Re-initialize lucide icons
    if (typeof roadmapsWindow.lucide?.createIcons === 'function') {
      roadmapsWindow.lucide.createIcons();
    }

    const closeModal = () => {
      roadmapsWindow.dashboardApp?.closeAllModals();
      modal.remove();
    };

    // Cancel button
    modal.querySelector('.roadmap-create-cancel')?.addEventListener('click', closeModal);

    // Close button
    modal.querySelector('.roadmap-create-close')?.addEventListener('click', closeModal);

    // Save button
    modal.querySelector('.roadmap-create-save')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('roadmapName');
      const descInput = document.getElementById('roadmapDescription');
      const name = nameInput?.value?.trim();
      const description = descInput?.value?.trim();

      if (!name) {
        nameInput?.focus();
        Toast.warning('Roadmap name is required');
        return;
      }

      const saveBtn = modal.querySelector('.roadmap-create-save');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Creating...';
      }

      try {
        await this.api.createRoadmap({ name, description });
        Toast.success('Roadmap created successfully');
        closeModal();
        await this.loadRoadmaps();
      } catch (error) {
        Toast.error(error.message || 'Failed to create roadmap');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i data-lucide="plus"></i> Create';
          if (typeof roadmapsWindow.lucide?.createIcons === 'function') {
            roadmapsWindow.lucide.createIcons();
          }
        }
      }
    });

    // Focus the name input
    setTimeout(() => document.getElementById('roadmapName')?.focus(), 100);
  }

  // Update roadmap progress (called from WebSocket)
  updateProgress(roadmapId, progress) {
    const roadmap = this.roadmaps.find(r => r.id === roadmapId);
    if (roadmap) {
      roadmap.progress = progress.overallProgress || progress;
      this.renderRoadmaps();
    }
  }

  // Update roadmap (called from WebSocket)
  updateRoadmap(updatedRoadmap) {
    const index = this.roadmaps.findIndex(r => r.id === updatedRoadmap.id);
    if (index !== -1) {
      this.roadmaps[index] = { ...this.roadmaps[index], ...updatedRoadmap };
      this.applyFilter();
    }
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
  window.RoadmapsComponent = RoadmapsComponent;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RoadmapsComponent };
}
