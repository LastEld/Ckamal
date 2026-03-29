/**
 * CogniMesh v5.0 - Tools Component
 * Tool catalog grid with search, detail modals, and execution
 */

const toolsWindow = typeof window !== 'undefined' ? window : globalThis;

class ToolsComponent {
  constructor(options = {}) {
    this.api = options.api;

    this.tools = [];
    this.filteredTools = [];
    this.loading = false;
    this.searchQuery = '';
    this.categoryFilter = '';

    // Bind search/filter controls
    document.getElementById('toolSearch')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.applyFilters();
    });

    document.getElementById('toolCategoryFilter')?.addEventListener('change', (e) => {
      this.categoryFilter = e.target.value;
      this.applyFilters();
    });
  }

  // Load tools from API
  async loadTools() {
    if (this.loading) return;
    this.loading = true;

    // Show loading state
    this.renderLoading();

    try {
      if (!this.api?.getTools) {
        console.warn('Tools API is unavailable');
        this.tools = [];
        this.filteredTools = [];
        this.renderTools();
        return;
      }

      const data = await this.api.getTools();
      this.tools = data.tools || [];
      this.filteredTools = [...this.tools];
      this.populateCategoryFilter();
      this.applyFilters();

      // Update badge
      const badge = document.getElementById('toolsBadge');
      if (badge) {
        badge.textContent = this.tools.length;
      }
    } catch (error) {
      console.error('Failed to load tools:', error);
      this.renderError(
        'Failed to load tools. Please try again.',
        () => this.loadTools()
      );
      if (typeof toolsWindow.Toast?.error === 'function') {
        toolsWindow.Toast.error('Failed to load tools');
      }
    } finally {
      this.loading = false;
    }
  }

  // Render loading state
  renderLoading() {
    const container = document.getElementById('toolsGrid');
    if (!container) return;

    container.innerHTML = `
      <div class="loading-state">
        <i data-lucide="loader-2" class="spin"></i>
        <p>Loading tools...</p>
      </div>
    `;

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  // Render error state with retry button
  renderError(message, retryCallback) {
    const container = document.getElementById('toolsGrid');
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

  // Populate the category filter dropdown from tool tags
  populateCategoryFilter() {
    const select = document.getElementById('toolCategoryFilter');
    if (!select) return;

    const categories = new Set();
    for (const tool of this.tools) {
      if (tool.category) categories.add(tool.category);
      if (Array.isArray(tool.tags)) {
        for (const tag of tool.tags) {
          categories.add(tag);
        }
      }
    }

    // Keep the first "All Categories" option, rebuild the rest
    select.innerHTML = '<option value="">All Categories</option>';
    const sorted = [...categories].sort();
    for (const cat of sorted) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    }
  }

  // Apply search and category filters
  applyFilters() {
    this.filteredTools = this.tools.filter(tool => {
      // Search filter
      if (this.searchQuery) {
        const name = (tool.name || '').toLowerCase();
        const desc = (tool.description || '').toLowerCase();
        const tags = Array.isArray(tool.tags) ? tool.tags.join(' ').toLowerCase() : '';
        if (!name.includes(this.searchQuery) &&
            !desc.includes(this.searchQuery) &&
            !tags.includes(this.searchQuery)) {
          return false;
        }
      }

      // Category filter
      if (this.categoryFilter) {
        const matchesCategory = tool.category === this.categoryFilter;
        const matchesTag = Array.isArray(tool.tags) && tool.tags.includes(this.categoryFilter);
        if (!matchesCategory && !matchesTag) return false;
      }

      return true;
    });

    this.renderTools();
  }

  // Render tool cards into #toolsGrid
  renderTools() {
    const container = document.getElementById('toolsGrid');
    if (!container) return;

    if (this.filteredTools.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="wrench"></i>
          <p>${this.tools.length === 0 ? 'No tools available' : 'No tools match your search'}</p>
        </div>
      `;
    } else {
      container.innerHTML = this.filteredTools.map(tool => this.renderToolCard(tool)).join('');

      // Attach click handlers for detail view
      container.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('click', () => {
          const toolName = card.dataset.toolName;
          if (toolName) this.viewToolDetails(toolName);
        });
      });
    }

    // Re-initialize Lucide icons
    if (typeof toolsWindow.lucide?.createIcons === 'function') {
      toolsWindow.lucide.createIcons();
    }
  }

  // Render a single tool card
  renderToolCard(tool) {
    const name = this.escapeHtml(tool.name || 'Unnamed');
    const description = this.escapeHtml(tool.description || 'No description');
    const category = this.escapeHtml(tool.category || '');
    const source = this.escapeHtml(tool.source || 'registry');
    const tags = Array.isArray(tool.tags) ? tool.tags : [];

    const tagChips = tags.slice(0, 5).map(tag =>
      `<span class="tool-tag">${this.escapeHtml(tag)}</span>`
    ).join('');

    return `
      <div class="tool-card" data-tool-name="${this.escapeHtml(tool.name || '')}">
        <div class="tool-card-header">
          <div class="tool-card-icon">
            <i data-lucide="wrench"></i>
          </div>
          <h4 class="tool-card-name">${name}</h4>
        </div>
        <p class="tool-card-description">${description}</p>
        ${category ? `<div class="tool-card-category">${category}</div>` : ''}
        <div class="tool-card-category">Source: ${source}</div>
        ${tags.length > 0 ? `<div class="tool-tags">${tagChips}</div>` : ''}
      </div>
    `;
  }

  // View tool details in a modal
  async viewToolDetails(toolName) {
    try {
      let tool;
      if (this.api?.getTool) {
        tool = await this.api.getTool(toolName);
      } else {
        tool = this.tools.find(t => t.name === toolName);
      }

      if (!tool) {
        if (typeof toolsWindow.Toast?.error === 'function') {
          toolsWindow.Toast.error('Tool not found');
        }
        return;
      }

      this.showDetailModal(tool);
    } catch (error) {
      console.error('Failed to load tool details:', error);
      if (typeof toolsWindow.Toast?.error === 'function') {
        toolsWindow.Toast.error('Failed to load tool details');
      }
    }
  }

  // Show the detail modal for a tool
  showDetailModal(tool) {
    // Remove any existing tool modals
    this.closeToolModals();

    const name = this.escapeHtml(tool.name || 'Unnamed');
    const description = this.escapeHtml(tool.description || 'No description');
    const tags = Array.isArray(tool.tags) ? tool.tags : [];

    // Build input schema visualization
    let schemaHtml = '';
    const inputSchema = this.normalizeSchema(tool.inputSchema);
    if (inputSchema?.properties) {
      const props = inputSchema.properties;
      const required = Array.isArray(inputSchema.required) ? inputSchema.required : [];
      const rows = Object.entries(props).map(([key, val]) => {
        const fieldName = this.escapeHtml(key);
        const fieldType = this.escapeHtml(val.type || 'any');
        const fieldDesc = this.escapeHtml(val.description || '');
        const isRequired = required.includes(key);
        return `
          <div class="schema-field">
            <span class="schema-field-name">${fieldName}${isRequired ? ' <span class="schema-required">*</span>' : ''}</span>
            <span class="schema-field-type">${fieldType}</span>
            ${fieldDesc ? `<span class="schema-field-desc">${fieldDesc}</span>` : ''}
          </div>
        `;
      }).join('');
      schemaHtml = `
        <div class="tool-detail-section">
          <h4>Input Schema</h4>
          <div class="schema-fields">${rows}</div>
        </div>
      `;
    } else if (inputSchema) {
      schemaHtml = `
        <div class="tool-detail-section">
          <h4>Input Schema</h4>
          <pre class="tool-schema-raw">${this.escapeHtml(JSON.stringify(inputSchema, null, 2))}</pre>
        </div>
      `;
    }

    const tagChips = tags.map(tag =>
      `<span class="tool-tag">${this.escapeHtml(tag)}</span>`
    ).join('');

    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('active');

    const modal = document.createElement('div');
    modal.className = 'modal tool-detail-modal active';
    modal.id = 'toolDetailModal';
    modal.innerHTML = `
      <div class="modal-header">
        <h3>${name}</h3>
        <button class="btn-icon modal-close" id="closeToolDetailModal">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        <p class="tool-detail-description">${description}</p>
        ${tags.length > 0 ? `<div class="tool-tags">${tagChips}</div>` : ''}
        <div class="tool-detail-section">
          <h4>Metadata</h4>
          <div class="schema-fields">
            <div class="schema-field">
              <span class="schema-field-name">Category</span>
              <span class="schema-field-type">${this.escapeHtml(tool.category || this.inferCategory(tool.name))}</span>
            </div>
            <div class="schema-field">
              <span class="schema-field-name">Source</span>
              <span class="schema-field-type">${this.escapeHtml(tool.source || 'registry')}</span>
            </div>
            <div class="schema-field">
              <span class="schema-field-name">Requires Auth</span>
              <span class="schema-field-type">${tool.requiresAuth ? 'yes' : 'no'}</span>
            </div>
          </div>
        </div>
        ${schemaHtml}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="closeToolDetailBtn">Close</button>
        <button class="btn btn-primary" id="executeToolBtn">
          <i data-lucide="play"></i>
          <span>Execute</span>
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    // Re-initialize Lucide icons
    if (typeof toolsWindow.lucide?.createIcons === 'function') {
      toolsWindow.lucide.createIcons();
    }

    // Event listeners
    const closeDetail = () => this.closeToolModals();
    document.getElementById('closeToolDetailModal')?.addEventListener('click', closeDetail);
    document.getElementById('closeToolDetailBtn')?.addEventListener('click', closeDetail);
    overlay?.addEventListener('click', closeDetail, { once: true });

    document.getElementById('executeToolBtn')?.addEventListener('click', () => {
      this.closeToolModals();
      this.executeToolModal(tool.name);
    });
  }

  // Show execution modal with JSON input
  executeToolModal(toolName) {
    this.closeToolModals();

    const name = this.escapeHtml(toolName);

    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('active');

    const modal = document.createElement('div');
    modal.className = 'modal tool-execute-modal active';
    modal.id = 'toolExecuteModal';
    modal.innerHTML = `
      <div class="modal-header">
        <h3>Execute: ${name}</h3>
        <button class="btn-icon modal-close" id="closeToolExecuteModal">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="toolParamsInput">Parameters (JSON)</label>
          <textarea id="toolParamsInput" class="tool-params-textarea" rows="8" placeholder='{ "key": "value" }'>{}</textarea>
        </div>
        <div class="tool-result" id="toolResult" style="display: none;">
          <div class="tool-result-header">
            <h4>Result</h4>
          </div>
          <pre class="tool-result-body" id="toolResultBody"></pre>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="closeToolExecuteBtn">Close</button>
        <button class="btn btn-primary" id="runToolBtn">
          <i data-lucide="play"></i>
          <span>Run</span>
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    // Re-initialize Lucide icons
    if (typeof toolsWindow.lucide?.createIcons === 'function') {
      toolsWindow.lucide.createIcons();
    }

    // Event listeners
    const closeExec = () => this.closeToolModals();
    document.getElementById('closeToolExecuteModal')?.addEventListener('click', closeExec);
    document.getElementById('closeToolExecuteBtn')?.addEventListener('click', closeExec);

    document.getElementById('runToolBtn')?.addEventListener('click', async () => {
      await this.runTool(toolName);
    });
  }

  // Execute a tool and display the result
  async runTool(toolName) {
    const paramsInput = document.getElementById('toolParamsInput');
    const resultContainer = document.getElementById('toolResult');
    const resultBody = document.getElementById('toolResultBody');
    const runBtn = document.getElementById('runToolBtn');

    if (!paramsInput || !resultContainer || !resultBody || !runBtn) return;

    let params;
    try {
      params = JSON.parse(paramsInput.value || '{}');
    } catch {
      resultContainer.style.display = 'block';
      resultContainer.className = 'tool-result error';
      resultBody.textContent = 'Invalid JSON in parameters input.';
      return;
    }

    runBtn.disabled = true;
    const origText = runBtn.querySelector('span');
    if (origText) origText.textContent = 'Running...';

    try {
      if (!this.api?.executeTool) {
        throw new Error('Tools API is unavailable');
      }

      const result = await this.api.executeTool(toolName, params);
      resultContainer.style.display = 'block';
      resultContainer.className = 'tool-result success';
      resultBody.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      resultContainer.style.display = 'block';
      resultContainer.className = 'tool-result error';
      resultBody.textContent = error.message || 'Execution failed';
    } finally {
      runBtn.disabled = false;
      if (origText) origText.textContent = 'Run';
    }
  }

  // Close all tool modals
  closeToolModals() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('active');

    const detailModal = document.getElementById('toolDetailModal');
    if (detailModal) detailModal.remove();

    const executeModal = document.getElementById('toolExecuteModal');
    if (executeModal) executeModal.remove();
  }

  // Utility: Escape HTML for XSS safety
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  normalizeSchema(schema) {
    if (!schema || typeof schema !== 'object') return null;
    if (schema.type || schema.properties || schema.anyOf || schema.oneOf) {
      return schema;
    }
    if (schema.schema && typeof schema.schema === 'object') {
      return this.normalizeSchema(schema.schema);
    }
    return schema;
  }

  inferCategory(toolName = '') {
    const name = String(toolName || '');
    const separatorIndex = name.search(/[_.-]/);
    if (separatorIndex > 0) {
      return name.slice(0, separatorIndex);
    }
    return name || 'general';
  }
}

if (typeof window !== 'undefined') {
  window.ToolsComponent = ToolsComponent;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ToolsComponent };
}
