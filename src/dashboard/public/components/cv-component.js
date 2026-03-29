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
    this.providerCatalog = { providers: [], models: [] };

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
    const tags = Array.isArray(cv.metadata?.tags) ? cv.metadata.tags : [];
    const provider = (
      cv.runtime?.provider
      || cv.adapterConfig?.provider
      || this.extractTaggedValue(tags, 'provider')
      || 'unknown'
    );
    const model = (
      cv.runtime?.model
      || cv.adapterConfig?.model
      || this.extractTaggedValue(tags, 'model')
      || ''
    );
    const surface = (
      cv.runtime?.surface
      || cv.adapterConfig?.surface
      || this.extractTaggedValue(tags, 'surface')
      || 'cli'
    );
    const runtimeSummary = [provider, model, surface].filter(Boolean).join(' | ');

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
        <div class="cv-role">${this.escapeHtml(runtimeSummary)}</div>
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
      void this.showCreateModal();
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
   * Load provider catalog for CV creation
   */
  async loadProviderCatalog() {
    if (!this.api?.getProviders) {
      this.providerCatalog = { providers: [], models: [] };
      return this.providerCatalog;
    }

    const data = await this.api.getProviders();
    this.providerCatalog = {
      providers: Array.isArray(data?.providers) ? data.providers : [],
      models: Array.isArray(data?.models) ? data.models : []
    };
    return this.providerCatalog;
  }

  getModelsForProvider(providerId) {
    return (this.providerCatalog?.models || []).filter((model) => model.provider === providerId);
  }

  getSurfacesForProvider(providerId) {
    const provider = (this.providerCatalog?.providers || []).find((entry) => entry.id === providerId);
    const supportedModes = Array.isArray(provider?.supportedModes) ? provider.supportedModes : [];
    const connectedModes = Array.isArray(provider?.connectedModes) ? provider.connectedModes : [];
    if (supportedModes.length > 0) return supportedModes;
    if (connectedModes.length > 0) return connectedModes;
    return ['cli'];
  }

  getSurfaceStatusMap(providerId) {
    const provider = (this.providerCatalog?.providers || []).find((entry) => entry.id === providerId);
    return provider?.surfaceStatus && typeof provider.surfaceStatus === 'object'
      ? provider.surfaceStatus
      : {};
  }

  populateCVModelOptions(providerId) {
    const modelSelect = document.getElementById('cvModelSelect');
    if (!modelSelect) return;

    const models = this.getModelsForProvider(providerId);
    if (models.length === 0) {
      modelSelect.innerHTML = '<option value="">Provider default</option>';
      return;
    }

    modelSelect.innerHTML = models.map((model) => (
      `<option value="${this.escapeHtml(model.id)}">${this.escapeHtml(model.name || model.id)}</option>`
    )).join('');
  }

  populateCVSurfaceOptions(providerId, modelId = '') {
    const surfaceSelect = document.getElementById('cvSurfaceSelect');
    if (!surfaceSelect) return;

    const providerSurfaces = this.getSurfacesForProvider(providerId).map((surface) => this.normalizeSurfaceId(surface));
    const surfaceStatus = this.getSurfaceStatusMap(providerId);
    const model = (this.providerCatalog?.models || []).find((entry) => entry.id === modelId);
    const modelSurfaces = Array.isArray(model?.surfaces)
      ? model.surfaces.map((surface) => this.normalizeSurfaceId(surface)).filter(Boolean)
      : [];
    const surfaces = modelSurfaces.length > 0
      ? providerSurfaces.filter((surface) => modelSurfaces.includes(surface))
      : providerSurfaces;

    const labels = {
      cli: 'CLI',
      vscode: 'VS Code',
      app: 'App',
      desktop: 'Desktop'
    };
    surfaceSelect.innerHTML = surfaces.map((surface) => {
      const online = Boolean(surfaceStatus[surface]);
      const statusLabel = online ? 'online' : 'offline';
      return `<option value="${surface}">${labels[surface] || surface} (${statusLabel})</option>`;
    }).join('');
    const preferredOnline = surfaces.find((surface) => Boolean(surfaceStatus[surface]));
    if (preferredOnline) {
      surfaceSelect.value = preferredOnline;
    }
  }

  normalizeSurfaceId(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['vscode', 'vs code', 'vs-code'].includes(normalized)) return 'vscode';
    if (['cli', 'terminal', 'shell'].includes(normalized)) return 'cli';
    if (['app', 'desktop'].includes(normalized)) return normalized;
    return '';
  }

  extractTaggedValue(tags, prefix) {
    const entry = (tags || []).find((tag) => typeof tag === 'string' && tag.startsWith(`${prefix}:`));
    if (!entry) return '';
    return entry.slice(prefix.length + 1).trim();
  }

  /**
   * Show modal for creating new CV
   */
  async showCreateModal() {
    // Remove any existing CV modals
    this.closeCVModals();
    try {
      await this.loadProviderCatalog();
    } catch (error) {
      console.error('Failed to load provider catalog for CV creation:', error);
      if (typeof cvWindow.Toast?.warning === 'function') {
        cvWindow.Toast.warning('Provider catalog unavailable, using defaults');
      }
      this.providerCatalog = { providers: [], models: [] };
    }

    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('active');

    const fallbackProviders = [
      { id: 'codex', name: 'Codex' },
      { id: 'claude', name: 'Claude' },
      { id: 'kimi', name: 'Kimi' }
    ];
    const providers = this.providerCatalog.providers.length > 0
      ? this.providerCatalog.providers
      : fallbackProviders;
    const defaultProvider = providers[0]?.id || 'codex';

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
        <div class="form-group">
          <label for="cvProviderSelect">Provider</label>
          <select id="cvProviderSelect" class="form-control">
            ${providers.map((provider) => (
              (() => {
                const connectedModes = Array.isArray(provider.connectedModes) ? provider.connectedModes : [];
                const suffix = connectedModes.length > 0
                  ? ` (online: ${connectedModes.join(', ')})`
                  : ' (offline)';
                return `<option value="${this.escapeHtml(provider.id)}">${this.escapeHtml(provider.name || provider.id)}${this.escapeHtml(suffix)}</option>`;
              })()
            )).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="cvModelSelect">Model</label>
          <select id="cvModelSelect" class="form-control"></select>
        </div>
        <div class="form-group">
          <label for="cvSurfaceSelect">Surface</label>
          <select id="cvSurfaceSelect" class="form-control"></select>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="cvAutoActivate" checked>
            <span>Activate immediately</span>
          </label>
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

    const providerSelect = document.getElementById('cvProviderSelect');
    providerSelect.value = defaultProvider;
    this.populateCVModelOptions(defaultProvider);
    const initialModel = document.getElementById('cvModelSelect')?.value || '';
    this.populateCVSurfaceOptions(defaultProvider, initialModel);

    providerSelect?.addEventListener('change', (event) => {
      const providerId = event.target.value;
      this.populateCVModelOptions(providerId);
      const selectedModel = document.getElementById('cvModelSelect')?.value || '';
      this.populateCVSurfaceOptions(providerId, selectedModel);
    });

    document.getElementById('cvModelSelect')?.addEventListener('change', (event) => {
      const providerId = document.getElementById('cvProviderSelect')?.value || defaultProvider;
      this.populateCVSurfaceOptions(providerId, event.target.value);
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
    const provider = document.getElementById('cvProviderSelect')?.value || 'codex';
    const model = document.getElementById('cvModelSelect')?.value || '';
    const surface = this.normalizeSurfaceId(document.getElementById('cvSurfaceSelect')?.value || 'cli') || 'cli';
    const autoActivate = Boolean(document.getElementById('cvAutoActivate')?.checked);

    if (!name) {
      if (typeof cvWindow.Toast?.error === 'function') {
        cvWindow.Toast.error('Name is required');
      }
      return;
    }

    try {
      const fallbackClients = ['claude', 'codex', 'kimi'].filter((entry) => entry !== provider);
      const runtimeTags = [
        `provider:${provider}`,
        surface ? `surface:${surface}` : null,
        model ? `model:${model}` : null
      ].filter(Boolean);

      const overrides = {
        identity: { name },
        execution: {
          preferred_client: provider,
          fallback_clients: fallbackClients
        },
        runtime: {
          provider,
          model: model || null,
          surface,
          mode: surface
        },
        adapterConfig: {
          provider,
          model: model || null,
          surface,
          mode: surface
        },
        metadata: {
          tags: runtimeTags,
          category: 'worker',
          domain: 'engineering'
        }
      };
      if (role) {
        overrides.identity.role = role;
        overrides.specialization = {
          primary: role.toLowerCase().replace(/\s+/g, '-')
        };
      }

      await this.api.createCV({ templateName: template, overrides, autoActivate });
      this.closeCVModals();
      await this.loadCVs();

      if (typeof cvWindow.Toast?.success === 'function') {
        cvWindow.Toast.success(autoActivate ? 'CV created and activated' : 'CV created successfully');
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
