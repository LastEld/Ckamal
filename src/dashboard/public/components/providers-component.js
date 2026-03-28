/**
 * CogniMesh v5.0 - Providers Component
 * AI Provider cards and model matrix with capabilities, status, and subscription info
 */

const providersWindow = typeof window !== 'undefined' ? window : globalThis;

class ProvidersComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.providers = [];
    this.models = [];
    this.loading = false;

    // Provider accent colors
    this.providerColors = {
      claude: '#d97706',
      codex: '#10b981',
      kimi: '#8b5cf6',
    };

    // Feature chip color mapping
    this.featureColors = {
      code: '#3b82f6',
      reasoning: '#8b5cf6',
      vision: '#22c55e',
      extended_thinking: '#f59e0b',
      analysis: '#06b6d4',
      computer_use: '#ec4899',
      architecture: '#6366f1',
      multifile: '#14b8a6',
      edit: '#0ea5e9',
      quick_tasks: '#64748b',
      long_context: '#d946ef',
      multimodal: '#f97316',
      thinking_mode: '#a855f7',
    };
  }

  // Load providers from API
  async loadProviders() {
    if (this.loading) return;
    this.loading = true;

    // Show loading state
    this.renderLoading();

    try {
      if (!this.api?.getProviders) {
        console.warn('Providers API is unavailable');
        this.providers = [];
        this.models = [];
        this.renderProviders();
        return;
      }

      const data = await this.api.getProviders();
      this.providers = data.providers || [];
      this.models = data.models || [];
      this.renderProviders();
    } catch (error) {
      console.error('Failed to load providers:', error);
      this.renderError(
        'Failed to load providers. Please try again.',
        () => this.loadProviders()
      );
      if (typeof Toast !== 'undefined') {
        Toast.error('Failed to load provider catalog');
      }
    } finally {
      this.loading = false;
    }
  }

  // Render loading state
  renderLoading() {
    const providersGrid = document.getElementById('providersGrid');
    const modelMatrix = document.getElementById('modelMatrix');

    const loadingHtml = `
      <div class="loading-state">
        <i data-lucide="loader-2" class="spin"></i>
        <p>Loading providers...</p>
      </div>
    `;

    if (providersGrid) {
      providersGrid.innerHTML = loadingHtml;
    }
    if (modelMatrix) {
      modelMatrix.innerHTML = loadingHtml;
    }

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  // Render error state with retry button
  renderError(message, retryCallback) {
    const providersGrid = document.getElementById('providersGrid');
    const modelMatrix = document.getElementById('modelMatrix');

    const errorHtml = `
      <div class="error-state">
        <i data-lucide="alert-circle"></i>
        <p>${this.escapeHtml(message)}</p>
        <button class="btn btn-primary retry-btn">
          <i data-lucide="refresh-cw"></i>
          Retry
        </button>
      </div>
    `;

    if (providersGrid) {
      providersGrid.innerHTML = errorHtml;
    }
    if (modelMatrix) {
      modelMatrix.innerHTML = errorHtml;
    }

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }

    const retryBtn = providersGrid?.querySelector('.retry-btn') || modelMatrix?.querySelector('.retry-btn');
    retryBtn?.addEventListener('click', () => {
      if (retryCallback) retryCallback();
    });
  }

  // Render provider cards and model matrix
  renderProviders() {
    this.renderProviderCards();
    this.renderModelMatrix();

    // Re-initialize Lucide icons
    if (typeof providersWindow.lucide?.createIcons === 'function') {
      providersWindow.lucide.createIcons();
    }
  }

  // Render provider cards into #providersGrid
  renderProviderCards() {
    const container = document.getElementById('providersGrid');
    if (!container) return;

    if (this.providers.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="cpu"></i>
          <p>No providers available</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.providers.map(provider => {
      const color = this.providerColors[provider.id] || '#64748b';
      const modelCount = this.models.filter(m => m.provider === provider.id).length;
      const name = this.escapeHtml(provider.name);
      const vendor = this.escapeHtml(provider.vendor);
      const subscription = this.escapeHtml(provider.subscription);
      const modes = (provider.modes || []).map(m => this.escapeHtml(m));

      return `
        <div class="provider-card" style="--provider-accent: ${color}">
          <div class="provider-card-header">
            <div class="provider-card-title">
              <h3>${name}</h3>
              <span class="provider-vendor">${vendor}</span>
            </div>
            <div class="provider-model-count">${modelCount} model${modelCount !== 1 ? 's' : ''}</div>
          </div>
          <div class="provider-subscription">
            <i data-lucide="shield-check"></i>
            <span>${subscription}</span>
          </div>
          <div class="provider-modes">
            ${modes.map(mode => `<span class="provider-mode-badge">${mode}</span>`).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // Render model matrix table into #modelMatrix
  renderModelMatrix() {
    const container = document.getElementById('modelMatrix');
    if (!container) return;

    if (this.models.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="layers"></i>
          <p>No models available</p>
        </div>
      `;
      return;
    }

    const rows = this.models.map(model => {
      const name = this.escapeHtml(model.name);
      const providerId = model.provider;
      const provider = this.providers.find(p => p.id === providerId);
      const providerName = provider ? this.escapeHtml(provider.name) : this.escapeHtml(providerId);
      const color = this.providerColors[providerId] || '#64748b';
      const qualityPct = Math.round((model.qualityScore || 0) * 100);
      const maxTokens = this.formatTokenCount(model.maxTokens);
      const features = (model.features || []).map(f => {
        const chipColor = this.featureColors[f] || '#64748b';
        const label = this.escapeHtml(f.replace(/_/g, ' '));
        return `<span class="feature-chip" style="--chip-color: ${chipColor}">${label}</span>`;
      }).join('');

      return `
        <tr>
          <td class="model-name-cell">
            <span class="model-name">${name}</span>
          </td>
          <td>
            <span class="provider-tag" style="--provider-accent: ${color}">${providerName}</span>
          </td>
          <td>
            <div class="quality-bar-wrapper">
              <div class="quality-bar" style="width: ${qualityPct}%; background-color: ${color}"></div>
              <span class="quality-label">${qualityPct}%</span>
            </div>
          </td>
          <td>
            <span class="token-count">${maxTokens}</span>
          </td>
          <td class="features-cell">
            ${features}
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="model-matrix-header">
        <h3>Model Matrix</h3>
        <span class="model-count-label">${this.models.length} models across ${this.providers.length} providers</span>
      </div>
      <div class="model-matrix-table-wrapper">
        <table class="model-matrix-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Provider</th>
              <th>Quality</th>
              <th>Max Tokens</th>
              <th>Features</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  // Format token count (e.g., 200000 -> "200K")
  formatTokenCount(tokens) {
    if (!tokens) return '0';
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(tokens % 1000000 === 0 ? 0 : 1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(tokens % 1000 === 0 ? 0 : 1)}K`;
    }
    return String(tokens);
  }

  // XSS protection
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }
}

// Export on window
if (typeof window !== 'undefined') {
  window.ProvidersComponent = ProvidersComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProvidersComponent };
}
