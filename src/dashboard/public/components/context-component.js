/**
 * CogniMesh v5.0 - Context Snapshots Component
 * Manages project context snapshots with Merkle-tree verification
 */

const contextWindow = typeof window !== 'undefined' ? window : globalThis;

class ContextComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.snapshots = [];
    this.filteredSnapshots = [];
    this.loading = false;
    this.searchQuery = '';
    this.selectedSnapshots = [];
    this.currentSnapshot = null;
    
    // DOM element cache
    this.elements = {};
  }

  // Initialize component
  initialize() {
    this.cacheElements();
    this.setupEventListeners();
    this.loadSnapshots();
  }

  // Cache DOM elements
  cacheElements() {
    this.elements = {
      snapshotsGrid: document.getElementById('snapshotsGrid'),
      snapshotSearch: document.getElementById('snapshotSearch'),
      createSnapshotBtn: document.getElementById('createSnapshotBtn'),
      createSnapshotModal: document.getElementById('createSnapshotModal'),
      snapshotDetailModal: document.getElementById('snapshotDetailModal'),
      compareModal: document.getElementById('compareModal'),
      createSnapshotForm: document.getElementById('createSnapshotForm'),
      saveSnapshotBtn: document.getElementById('saveSnapshotBtn'),
      cancelSnapshotBtn: document.getElementById('cancelSnapshotBtn'),
      closeSnapshotModalBtn: document.getElementById('closeSnapshotModalBtn'),
      closeDetailModal: document.getElementById('closeDetailModal'),
      snapshotFileTree: document.getElementById('snapshotFileTree'),
      compareSnapshot1: document.getElementById('compareSnapshot1'),
      compareSnapshot2: document.getElementById('compareSnapshot2'),
      runCompareBtn: document.getElementById('runCompareBtn'),
      closeCompareModal: document.getElementById('closeCompareModal'),
      compareResults: document.getElementById('compareResults'),
    };
  }

  // Setup event listeners
  setupEventListeners() {
    // Search
    this.elements.snapshotSearch?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.applyFilters();
    });

    // Create snapshot button
    this.elements.createSnapshotBtn?.addEventListener('click', () => {
      this.showCreateModal();
    });

    // Save snapshot
    this.elements.saveSnapshotBtn?.addEventListener('click', () => this.handleCreateSnapshot());

    // Cancel / close create-snapshot modal
    this.elements.cancelSnapshotBtn?.addEventListener('click', () => {
      this.closeModals();
    });
    this.elements.closeSnapshotModalBtn?.addEventListener('click', () => {
      this.closeModals();
    });

    // Close detail modal
    this.elements.closeDetailModal?.addEventListener('click', () => {
      this.closeModals();
    });

    // Close compare modal
    this.elements.closeCompareModal?.addEventListener('click', () => {
      this.closeModals();
    });

    // Run comparison
    this.elements.runCompareBtn?.addEventListener('click', () => this.handleCompare());
  }

  // Load snapshots from API
  async loadSnapshots() {
    if (this.loading) return;
    this.loading = true;

    // Show loading state
    this.renderLoading();

    try {
      if (!this.api?.getSnapshots) {
        this.renderError('Context API is unavailable', () => this.loadSnapshots());
        return;
      }

      const data = await this.api.getSnapshots();
      this.snapshots = data.snapshots || [];
      this.applyFilters();
    } catch (error) {
      console.error('Failed to load snapshots:', error);
      this.renderError(
        'Failed to load snapshots. Please try again.',
        () => this.loadSnapshots()
      );
    } finally {
      this.loading = false;
    }
  }

  // Apply search filter
  applyFilters() {
    const query = this.searchQuery.toLowerCase();
    
    this.filteredSnapshots = this.snapshots.filter(snapshot => {
      if (!query) return true;
      return (
        snapshot.id?.toLowerCase().includes(query) ||
        snapshot.projectPath?.toLowerCase().includes(query)
      );
    });

    this.renderSnapshots();
  }

  // Render loading state
  renderLoading() {
    if (this.elements.snapshotsGrid) {
      this.elements.snapshotsGrid.innerHTML = `
        <div class="loading-state">
          <i data-lucide="loader-2" class="spin"></i>
          <p>Loading snapshots...</p>
        </div>
      `;
      if (typeof contextWindow.lucide?.createIcons === 'function') {
        contextWindow.lucide.createIcons();
      }
    }
  }

  // Render error state with retry button
  renderError(message, retryCallback) {
    if (!this.elements.snapshotsGrid) return;

    this.elements.snapshotsGrid.innerHTML = `
      <div class="error-state">
        <i data-lucide="alert-circle"></i>
        <p>${this.escapeHtml(message)}</p>
        <button class="btn btn-primary retry-btn">
          <i data-lucide="refresh-cw"></i>
          Retry
        </button>
      </div>
    `;

    if (typeof contextWindow.lucide?.createIcons === 'function') {
      contextWindow.lucide.createIcons();
    }

    this.elements.snapshotsGrid.querySelector('.retry-btn')?.addEventListener('click', () => {
      if (retryCallback) retryCallback();
    });
  }

  // Render snapshots grid
  renderSnapshots() {
    if (!this.elements.snapshotsGrid) return;

    if (this.filteredSnapshots.length === 0) {
      this.elements.snapshotsGrid.innerHTML = `
        <div class="empty-state">
          <i data-lucide="database"></i>
          <p>No snapshots found</p>
          <span class="empty-hint">Create a snapshot to capture project state</span>
        </div>
      `;
    } else {
      this.elements.snapshotsGrid.innerHTML = this.filteredSnapshots
        .map(snapshot => this.renderSnapshotCard(snapshot))
        .join('');

      // Attach event listeners to cards
      this.attachCardEventListeners();
    }

    // Re-initialize icons
    if (typeof contextWindow.lucide?.createIcons === 'function') {
      contextWindow.lucide.createIcons();
    }
  }

  // Render single snapshot card HTML
  renderSnapshotCard(snapshot) {
    const date = new Date(snapshot.timestamp);
    const formattedDate = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const fileCount = snapshot.metadata?.fileCount || snapshot.fileCount || 0;
    const totalSize = snapshot.metadata?.totalSize || 0;
    const merkleRoot = this.computeMerkleRoot(snapshot);

    return `
      <div class="snapshot-card" data-snapshot-id="${snapshot.id}">
        <div class="snapshot-card-header">
          <div class="snapshot-icon">
            <i data-lucide="camera"></i>
          </div>
          <div class="snapshot-info">
            <span class="snapshot-id" title="${snapshot.id}">${this.truncateId(snapshot.id)}</span>
            <span class="snapshot-date">${formattedDate}</span>
          </div>
        </div>
        <div class="snapshot-card-body">
          <div class="snapshot-path" title="${this.escapeHtml(snapshot.projectPath || '')}">
            <i data-lucide="folder"></i>
            <span>${this.escapeHtml(this.truncatePath(snapshot.projectPath || '', 30))}</span>
          </div>
          <div class="snapshot-stats">
            <div class="snapshot-stat">
              <i data-lucide="files"></i>
              <span>${fileCount} files</span>
            </div>
            <div class="snapshot-stat">
              <i data-lucide="hard-drive"></i>
              <span>${this.formatBytes(totalSize)}</span>
            </div>
          </div>
          <div class="snapshot-merkle" title="Merkle Root: ${merkleRoot}">
            <i data-lucide="git-commit"></i>
            <span class="merkle-hash">${this.truncateHash(merkleRoot)}</span>
          </div>
        </div>
        <div class="snapshot-card-actions">
          <button class="btn btn-icon btn-sm view-btn" title="View Details" data-action="view">
            <i data-lucide="eye"></i>
          </button>
          <button class="btn btn-icon btn-sm compare-btn" title="Compare" data-action="compare">
            <i data-lucide="git-compare"></i>
          </button>
          <button class="btn btn-icon btn-sm restore-btn" title="Restore" data-action="restore">
            <i data-lucide="rotate-ccw"></i>
          </button>
          <button class="btn btn-icon btn-sm delete-btn" title="Delete" data-action="delete">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  }

  // Attach event listeners to snapshot cards
  attachCardEventListeners() {
    document.querySelectorAll('.snapshot-card').forEach(card => {
      const id = card.dataset.snapshotId;
      
      card.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          
          switch (action) {
            case 'view':
              this.viewSnapshotDetails(id);
              break;
            case 'compare':
              this.showCompareModal(id);
              break;
            case 'restore':
              this.restoreSnapshot(id);
              break;
            case 'delete':
              this.deleteSnapshot(id);
              break;
          }
        });
      });

      // Click on card opens details
      card.addEventListener('click', (e) => {
        if (!e.target.closest('[data-action]')) {
          this.viewSnapshotDetails(id);
        }
      });
    });
  }

  // View snapshot details
  async viewSnapshotDetails(id) {
    try {
      if (!this.api?.getSnapshot) {
        this.showError('Context API is unavailable');
        return;
      }

      const snapshot = await this.api.getSnapshot(id);
      if (!snapshot) {
        this.showError('Snapshot not found');
        return;
      }

      this.currentSnapshot = snapshot;
      this.showDetailModal(snapshot);
    } catch (error) {
      console.error('Failed to load snapshot details:', error);
      this.showError('Failed to load snapshot details: ' + error.message);
    }
  }

  // Show detail modal
  showDetailModal(snapshot) {
    const modal = this.elements.snapshotDetailModal;
    if (!modal) return;

    const date = new Date(snapshot.timestamp);
    const formattedDate = date.toLocaleString('en-US');
    const fileCount = snapshot.metadata?.fileCount || snapshot.files?.length || 0;
    const totalSize = snapshot.metadata?.totalSize || 0;
    const merkleRoot = this.computeMerkleRoot(snapshot);

    // Update modal content
    document.getElementById('detailSnapshotId').textContent = snapshot.id;
    document.getElementById('detailTimestamp').textContent = formattedDate;
    document.getElementById('detailProjectPath').textContent = snapshot.projectPath || 'N/A';
    document.getElementById('detailFileCount').textContent = fileCount;
    document.getElementById('detailTotalSize').textContent = this.formatBytes(totalSize);
    document.getElementById('detailMerkleRoot').textContent = merkleRoot;

    // Render file tree
    this.renderFileTree(snapshot.files || []);

    // Show modal
    modal.classList.add('active');
    document.getElementById('modalOverlay')?.classList.add('active');

    // Re-initialize icons
    if (typeof contextWindow.lucide?.createIcons === 'function') {
      contextWindow.lucide.createIcons();
    }
  }

  // Render file tree
  renderFileTree(files) {
    const container = this.elements.snapshotFileTree;
    if (!container) return;

    if (!files || files.length === 0) {
      container.innerHTML = '<p class="empty-text">No files in snapshot</p>';
      return;
    }

    // Group files by directory
    const tree = this.buildFileTree(files);
    container.innerHTML = this.renderTreeNode(tree, '');
  }

  // Build file tree structure
  buildFileTree(files) {
    const root = { name: '', children: {}, files: [] };

    files.forEach(file => {
      const parts = file.path.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          current.files.push(file);
        } else {
          if (!current.children[part]) {
            current.children[part] = { name: part, children: {}, files: [] };
          }
          current = current.children[part];
        }
      }
    });

    return root;
  }

  // Render tree node recursively
  renderTreeNode(node, path) {
    let html = '<ul class="file-tree">';

    // Render subdirectories
    Object.values(node.children).forEach(child => {
      const childPath = path ? `${path}/${child.name}` : child.name;
      html += `
        <li class="tree-folder">
          <span class="tree-toggle">
            <i data-lucide="chevron-right"></i>
            <i data-lucide="folder"></i>
            <span>${this.escapeHtml(child.name)}</span>
          </span>
          ${this.renderTreeNode(child, childPath)}
        </li>
      `;
    });

    // Render files
    node.files.forEach(file => {
      const ext = file.path.split('.').pop();
      html += `
        <li class="tree-file">
          <span class="tree-item">
            <i data-lucide="file"></i>
            <span class="file-name">${this.escapeHtml(file.path.split('/').pop())}</span>
            <span class="file-size">${this.formatBytes(file.size)}</span>
            <span class="file-hash" title="SHA-256: ${file.hash}">${this.truncateHash(file.hash)}</span>
          </span>
        </li>
      `;
    });

    html += '</ul>';
    return html;
  }

  // Show create modal
  showCreateModal() {
    const modal = this.elements.createSnapshotModal;
    if (!modal) {
      // Fallback if modal not in HTML yet
      const path = prompt('Enter project path to snapshot:');
      if (path) {
        this.createSnapshot(path);
      }
      return;
    }

    modal.classList.add('active');
    document.getElementById('modalOverlay')?.classList.add('active');
  }

  // Handle create snapshot form submission
  async handleCreateSnapshot() {
    const pathInput = document.getElementById('snapshotProjectPath');
    const includeContent = document.getElementById('snapshotIncludeContent')?.checked || false;
    
    const projectPath = pathInput?.value.trim();
    if (!projectPath) {
      this.showError('Project path is required');
      return;
    }

    await this.createSnapshot(projectPath, { includeContent });
    this.closeModals();
  }

  // Create snapshot
  async createSnapshot(projectPath, options = {}) {
    try {
      if (!this.api?.createSnapshot) {
        this.showError('Context API is unavailable');
        return;
      }

      Toast.info('Creating snapshot...');
      const snapshot = await this.api.createSnapshot({ 
        projectPath, 
        options 
      });
      
      Toast.success('Snapshot created successfully');
      this.loadSnapshots();
      return snapshot;
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      this.showError('Failed to create snapshot: ' + error.message);
      throw error;
    }
  }

  // Show compare modal
  showCompareModal(preselectedId = null) {
    const modal = this.elements.compareModal;
    if (!modal) {
      // Fallback
      const id2 = prompt('Enter snapshot ID to compare with:');
      if (id2 && preselectedId) {
        this.compareSnapshots(preselectedId, id2);
      }
      return;
    }

    // Populate select options
    const select1 = this.elements.compareSnapshot1;
    const select2 = this.elements.compareSnapshot2;

    const options = this.snapshots.map(s => 
      `<option value="${s.id}">${this.truncateId(s.id)} - ${new Date(s.timestamp).toLocaleDateString()}</option>`
    ).join('');

    if (select1) select1.innerHTML = '<option value="">Select snapshot...</option>' + options;
    if (select2) select2.innerHTML = '<option value="">Select snapshot...</option>' + options;

    // Pre-select if provided
    if (preselectedId && select1) {
      select1.value = preselectedId;
    }

    // Clear results
    if (this.elements.compareResults) {
      this.elements.compareResults.innerHTML = '';
    }

    modal.classList.add('active');
    document.getElementById('modalOverlay')?.classList.add('active');
  }

  // Handle compare
  async handleCompare() {
    const id1 = this.elements.compareSnapshot1?.value;
    const id2 = this.elements.compareSnapshot2?.value;

    if (!id1 || !id2) {
      this.showError('Please select two snapshots to compare');
      return;
    }

    if (id1 === id2) {
      this.showError('Cannot compare a snapshot with itself');
      return;
    }

    await this.compareSnapshots(id1, id2);
  }

  // Compare snapshots
  async compareSnapshots(id1, id2) {
    try {
      if (!this.api?.compareSnapshots) {
        this.showError('Context API is unavailable');
        return;
      }

      Toast.info('Comparing snapshots...');
      const comparison = await this.api.compareSnapshots(id1, id2);
      this.renderComparisonResults(comparison);
      Toast.success('Comparison complete');
    } catch (error) {
      console.error('Failed to compare snapshots:', error);
      this.showError('Failed to compare snapshots: ' + error.message);
    }
  }

  // Render comparison results
  renderComparisonResults(comparison) {
    const container = this.elements.compareResults;
    if (!container) return;

    const { summary, added, removed, modified } = comparison;

    container.innerHTML = `
      <div class="comparison-summary">
        <div class="comparison-stat added">
          <span class="stat-number">${summary.addedCount}</span>
          <span class="stat-label">Added</span>
        </div>
        <div class="comparison-stat removed">
          <span class="stat-number">${summary.removedCount}</span>
          <span class="stat-label">Removed</span>
        </div>
        <div class="comparison-stat modified">
          <span class="stat-number">${summary.modifiedCount}</span>
          <span class="stat-label">Modified</span>
        </div>
      </div>
      
      ${added.length > 0 ? `
        <div class="comparison-section">
          <h4><i data-lucide="plus-circle"></i> Added Files (${added.length})</h4>
          <ul class="comparison-list">
            ${added.map(f => `
              <li class="added-file">
                <i data-lucide="file-plus"></i>
                <span>${this.escapeHtml(f.path)}</span>
                <span class="size">+${this.formatBytes(f.sizeAfter)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${removed.length > 0 ? `
        <div class="comparison-section">
          <h4><i data-lucide="minus-circle"></i> Removed Files (${removed.length})</h4>
          <ul class="comparison-list">
            ${removed.map(f => `
              <li class="removed-file">
                <i data-lucide="file-minus"></i>
                <span>${this.escapeHtml(f.path)}</span>
                <span class="size">-${this.formatBytes(f.sizeBefore)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${modified.length > 0 ? `
        <div class="comparison-section">
          <h4><i data-lucide="edit"></i> Modified Files (${modified.length})</h4>
          <ul class="comparison-list">
            ${modified.map(f => `
              <li class="modified-file">
                <i data-lucide="file-edit"></i>
                <span>${this.escapeHtml(f.path)}</span>
                <span class="size">${this.formatBytes(f.sizeBefore)} → ${this.formatBytes(f.sizeAfter)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    `;

    if (typeof contextWindow.lucide?.createIcons === 'function') {
      contextWindow.lucide.createIcons();
    }
  }

  // Restore snapshot
  async restoreSnapshot(id) {
    try {
      if (!confirm('Are you sure you want to restore this snapshot? This will overwrite current files.')) {
        return;
      }

      if (!this.api?.restoreSnapshot) {
        this.showError('Context API is unavailable');
        return;
      }

      Toast.info('Restoring snapshot...');
      const result = await this.api.restoreSnapshot(id);
      
      Toast.success(`Restored ${result.operations?.length || 0} files`);
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
      this.showError('Failed to restore snapshot: ' + error.message);
    }
  }

  // Delete snapshot
  async deleteSnapshot(id) {
    try {
      if (!confirm('Are you sure you want to delete this snapshot? This cannot be undone.')) {
        return;
      }

      if (!this.api?.deleteSnapshot) {
        this.showError('Context API is unavailable');
        return;
      }

      await this.api.deleteSnapshot(id);
      Toast.success('Snapshot deleted');
      this.loadSnapshots();
    } catch (error) {
      console.error('Failed to delete snapshot:', error);
      this.showError('Failed to delete snapshot: ' + error.message);
    }
  }

  // Close all modals
  closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    document.getElementById('modalOverlay')?.classList.remove('active');
  }

  // Compute Merkle root hash from snapshot
  computeMerkleRoot(snapshot) {
    if (!snapshot.files || snapshot.files.length === 0) {
      return '0'.repeat(64);
    }

    // Sort files by path for consistent hashing
    const sortedFiles = [...snapshot.files].sort((a, b) => a.path.localeCompare(b.path));
    
    // Combine all file hashes
    const combinedHash = sortedFiles
      .map(f => f.hash)
      .join('');
    
    // Return truncated hash for display
    return combinedHash.slice(0, 64);
  }

  // Utility: Format bytes to human readable
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Utility: Escape HTML
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Utility: Truncate ID for display
  truncateId(id) {
    if (!id || id.length <= 16) return id;
    return id.slice(0, 8) + '...' + id.slice(-6);
  }

  // Utility: Truncate hash
  truncateHash(hash) {
    if (!hash || hash.length <= 16) return hash;
    return hash.slice(0, 8) + '...' + hash.slice(-8);
  }

  // Utility: Truncate path
  truncatePath(path, maxLength) {
    if (!path || path.length <= maxLength) return path;
    return '...' + path.slice(-maxLength + 3);
  }

  // Utility: Show error
  showError(message) {
    if (typeof window.Toast?.error === 'function') {
      window.Toast.error(message);
    } else {
      console.error(message);
    }
  }
}

if (typeof window !== 'undefined') {
  window.ContextComponent = ContextComponent;
}

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContextComponent };
}
