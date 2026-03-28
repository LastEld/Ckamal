/**
 * CogniMesh v5.0 - CV Component
 * Agent CV management grid with status, capabilities, and lifecycle actions
 */

const cvWindow = typeof window !== 'undefined' ? window : globalThis;

class CVComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.cvs = [];
    this.templates = ['system-admin', 'developer', 'analyst', 'code-reviewer', 'test-agent'];
    this.loading = false;

    // Bind refresh button
    document.getElementById('refreshCVsBtn')?.addEventListener('click', () => {
      this.loadCVs();
    });
  }

  /**
   * Load CVs from API
   */
  async loadCVs() {
    if (this.loading) return;
    this.loading = true;

    // Show loading state
    this.renderLoading();

    try {
      if (!this.api?.getCVs) {
        console.warn('CV API is unavailable');
        this.cvs = [];
        this.renderCVs();
        return;
      }

      const data = await this.api.getCVs();
      this.cvs = data.cvs || [];
      this.renderCVs();

      // Update badge
      const badge = document.getElementById('cvBadge');
      if (badge) {
        badge.textContent = this.cvs.length;
      }
    } catch (error) {
      console.error('Failed to load CVs:', error);
      this.renderError(
        'Failed to load CVs. Please try again.',
        () => this.loadCVs()
      );
      if (typeof cvWindow.Toast?.error === 'function') {
        cvWindow.Toast.error('Failed to load CVs');
      }
    } finally {
      this.loading = false;
    }
  }

  /**
   * Render loading state
   */
  renderLoading() {
    const container = document.getElementById('cvGrid');
    if (!container) return;

    container.innerHTML = `
      <div class="loading-state">
        <i data-lucide="loader-2" class="spin"></i>
        <p>Loading CVs...</p>
      </div>
    `;

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  /**
   * Render error state with retry button
   */
  renderError(message, retryCallback) {
    const container = document.getElementById('cvGrid');
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

  /**
   * Render CV cards into #cvGrid
   */
  renderCVs() {
    const container = document.getElementById('cvGrid');
    if (!container) return;

    if (this.cvs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="file-badge"></i>
          <p>No CVs found</p>
          <button class="btn btn-primary" id="createCVBtn">
            <i data-lucide="plus"></i>
            <span>Create First CV</span>
          </button>
        </div>
      `;
    } else {
      container.innerHTML = this.cvs.map(cv => this.renderCVCard(cv)).join('');
    }

    // Re-initialize Lucide icons
    if (typeof cvWindow.lucide?.createIcons === 'function') {
      cvWindow.lucide.createIcons();
    }

    this.attachEventListeners();
  }

  /**
   * Render a single CV card
   */
  renderCVCard(cv) {
    const statusColors = {
      active: 'var(--success)',
      suspended: 'var(--warning)',
      retired: 'var(--secondary)'
    };

    const name = this.escapeHtml(cv.identity?.name || cv.id);
    const role = this.escapeHtml(cv.identity?.role || 'Unknown');
    const status = this.escapeHtml(cv.lifecycle?.status || 'unknown');
    const capabilities = Array.isArray(cv.capabilities) ? cv.capabilities : [];

    const capabilityTags = capabilities.slice(0, 3).map(c =>
      `<span class="capability-tag">${this.escapeHtml(c.name || c)}</span>`
    ).join('');

    const moreCount = capabilities.length > 3 ? capabilities.length - 3 : 0;
    const moreTag = moreCount > 0 ? `<span class="capability-tag more">+${moreCount}</span>` : '';

    return `
      <div class="cv-card" data-cv-id="${this.escapeHtml(cv.id)}">
        <div class="cv-header">
          <div class="cv-title">
            <i data-lucide="file-badge"></i>
            <h4>${name}</h4>
          </div>
          <span class="cv-status" style="background: ${statusColors[status] || 'var(--secondary)'}">
            ${status}
          </span>
        </div>
        <div class="cv-role">${role}</div>
        ${capabilities.length > 0 ? `
          <div class="cv-capabilities">
            ${capabilityTags}${moreTag}
          </div>
        ` : ''}
        <div class="cv-actions">
          ${status !== 'active' ? `<button class="btn btn-sm btn-success" data-action="activate">Activate</button>` : ''}
          ${status !== 'suspended' ? `<button class="btn btn-sm btn-warning" data-action="suspend">Suspend</button>` : ''}
          <button class="btn btn-sm btn-danger" data-action="delete">Delete</button>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to CV cards
   */
  attachEventListeners() {
    // Card action buttons
    document.querySelectorAll('.cv-card').forEach(card => {
      const id = card.dataset.cvId;
      card.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          this.handleAction(id, action);
        });
      });
    });

    // Create CV button
    document.getElementById('createCVBtn')?.addEventListener('click', () => {
      this.showCreateModal();
    });
  }

  /**
   * Handle CV actions (activate, suspend, delete)
   */
  async handleAction(id, action) {
    try {
      switch (action) {
        case 'activate':
          await this.api.activateCV(id);
          break;
        case 'suspend':
          await this.api.suspendCV(id);
          break;
        case 'delete':
          if (!confirm('Are you sure you want to delete this CV?')) return;
          await this.api.deleteCV(id);
          break;
      }

      await this.loadCVs();

      if (typeof cvWindow.Toast?.success === 'function') {
        cvWindow.Toast.success(`CV ${action}d successfully`);
      }
    } catch (error) {
      console.error(`Failed to ${action} CV:`, error);
      if (typeof cvWindow.Toast?.error === 'function') {
        cvWindow.Toast.error(`Failed to ${action} CV`);
      }
    }
  }

  /**
   * Show modal for creating new CV
   */
  showCreateModal() {
    // Remove any existing CV modals
    this.closeCVModals();

    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('active');

    const modal = document.createElement('div');
    modal.className = 'modal cv-create-modal active';
    modal.id = 'createCVModal';
    modal.innerHTML = `
      <div class="modal-header">
        <h3>Create New CV</h3>
        <button class="btn-icon modal-close" id="closeCVCreateModal">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="cvTemplateSelect">Template</label>
          <select id="cvTemplateSelect" class="form-control">
            ${this.templates.map(t => `<option value="${t}">${this.escapeHtml(t)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="cvNameInput">Name</label>
          <input type="text" id="cvNameInput" class="form-control" placeholder="Enter agent name">
        </div>
        <div class="form-group">
          <label for="cvRoleInput">Role</label>
          <input type="text" id="cvRoleInput" class="form-control" placeholder="Enter agent role">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelCreateCV">Cancel</button>
        <button class="btn btn-primary" id="confirmCreateCV">
          <i data-lucide="plus"></i>
          <span>Create</span>
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    // Re-initialize Lucide icons
    if (typeof cvWindow.lucide?.createIcons === 'function') {
      cvWindow.lucide.createIcons();
    }

    // Event listeners
    const closeModal = () => this.closeCVModals();
    document.getElementById('closeCVCreateModal')?.addEventListener('click', closeModal);
    document.getElementById('cancelCreateCV')?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal, { once: true });

    document.getElementById('confirmCreateCV')?.addEventListener('click', async () => {
      await this.createCV();
    });

    // Enter key to submit
    modal.querySelectorAll('input').forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.createCV();
        }
      });
    });
  }

  /**
   * Create a new CV
   */
  async createCV() {
    const template = document.getElementById('cvTemplateSelect')?.value;
    const name = document.getElementById('cvNameInput')?.value?.trim();
    const role = document.getElementById('cvRoleInput')?.value?.trim();

    if (!name) {
      if (typeof cvWindow.Toast?.error === 'function') {
        cvWindow.Toast.error('Name is required');
      }
      return;
    }

    try {
      const overrides = {
        identity: { name }
      };
      if (role) {
        overrides.identity.role = role;
      }

      await this.api.createCV({ templateName: template, overrides });
      this.closeCVModals();
      await this.loadCVs();

      if (typeof cvWindow.Toast?.success === 'function') {
        cvWindow.Toast.success('CV created successfully');
      }
    } catch (error) {
      console.error('Failed to create CV:', error);
      if (typeof cvWindow.Toast?.error === 'function') {
        cvWindow.Toast.error('Failed to create CV');
      }
    }
  }

  /**
   * Close all CV modals
   */
  closeCVModals() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('active');

    const modal = document.getElementById('createCVModal');
    if (modal) modal.remove();
  }

  /**
   * Utility: Escape HTML for XSS safety
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  window.CVComponent = CVComponent;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CVComponent };
}
