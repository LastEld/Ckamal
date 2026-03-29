/**
 * CogniMesh v5.0 - Command Palette
 * Keyboard-driven command palette with fuzzy search and categorized commands
 */

/* global Toast */

const commandPaletteWindow = typeof window !== 'undefined' ? window : globalThis;

/**
 * Command Registry - Manages all available commands
 */
class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.categories = new Map();
    this.recentCommands = [];
    this.maxRecentCommands = 5;
    
    // Define default categories
    this.registerCategory('navigation', 'Navigation', 'layout-dashboard', 1);
    this.registerCategory('actions', 'Actions', 'zap', 2);
    this.registerCategory('settings', 'Settings', 'settings', 3);
    this.registerCategory('help', 'Help', 'help-circle', 4);
    this.registerCategory('views', 'Views', 'eye', 5);
    this.registerCategory('create', 'Create', 'plus-circle', 6);
  }

  /**
   * Register a command category
   * @param {string} id - Category ID
   * @param {string} label - Display label
   * @param {string} icon - Lucide icon name
   * @param {number} priority - Sort priority (lower = higher)
   */
  registerCategory(id, label, icon, priority = 10) {
    this.categories.set(id, { id, label, icon, priority });
  }

  /**
   * Register a new command
   * @param {Object} command - Command definition
   * @param {string} command.id - Unique command ID
   * @param {string} command.title - Display title
   * @param {string} command.category - Category ID
   * @param {string} command.icon - Lucide icon name
   * @param {Function} command.execute - Command execution function
   * @param {string} [command.shortcut] - Keyboard shortcut display (e.g., "⌘K")
   * @param {Function} [command.visible] - Function returning visibility state
   * @param {string[]} [command.keywords] - Additional search keywords
   * @param {string} [command.description] - Command description
   */
  register(command) {
    if (!command.id || !command.title || !command.category) {
      console.error('Command must have id, title, and category');
      return;
    }

    if (!this.categories.has(command.category)) {
      console.warn(`Category "${command.category}" not registered for command "${command.id}"`);
      this.registerCategory(command.category, command.category, 'command', 99);
    }

    this.commands.set(command.id, {
      ...command,
      keywords: command.keywords || [],
      visible: command.visible || (() => true),
    });
  }

  /**
   * Unregister a command
   * @param {string} id - Command ID
   */
  unregister(id) {
    this.commands.delete(id);
    this.recentCommands = this.recentCommands.filter(cmd => cmd !== id);
  }

  /**
   * Get all visible commands
   * @returns {Array} Visible commands
   */
  getVisibleCommands() {
    return Array.from(this.commands.values()).filter(cmd => cmd.visible());
  }

  /**
   * Get command by ID
   * @param {string} id - Command ID
   * @returns {Object|null}
   */
  getCommand(id) {
    return this.commands.get(id) || null;
  }

  /**
   * Add command to recent list
   * @param {string} id - Command ID
   */
  addToRecent(id) {
    // Remove if already exists
    this.recentCommands = this.recentCommands.filter(cmd => cmd !== id);
    // Add to front
    this.recentCommands.unshift(id);
    // Trim to max
    if (this.recentCommands.length > this.maxRecentCommands) {
      this.recentCommands = this.recentCommands.slice(0, this.maxRecentCommands);
    }
    // Persist to localStorage
    try {
      localStorage.setItem('commandPaletteRecent', JSON.stringify(this.recentCommands));
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Load recent commands from localStorage
   */
  loadRecent() {
    try {
      const stored = localStorage.getItem('commandPaletteRecent');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter to only valid commands
        this.recentCommands = parsed.filter(id => this.commands.has(id));
      }
    } catch (e) {
      this.recentCommands = [];
    }
  }

  /**
   * Get recent commands
   * @returns {Array} Recent command objects
   */
  getRecentCommands() {
    return this.recentCommands
      .map(id => this.commands.get(id))
      .filter(cmd => cmd && cmd.visible());
  }

  /**
   * Clear recent commands
   */
  clearRecent() {
    this.recentCommands = [];
    try {
      localStorage.removeItem('commandPaletteRecent');
    } catch (e) {
      // Ignore storage errors
    }
  }
}

/**
 * Fuzzy Search Utility
 */
class FuzzySearch {
  /**
   * Calculate fuzzy match score
   * @param {string} query - Search query
   * @param {string} text - Text to match against
   * @returns {number} Score (0 = no match, higher = better)
   */
  static match(query, text) {
    if (!query) return 1;
    if (!text) return 0;

    const normalizedQuery = query.toLowerCase().trim();
    const normalizedText = text.toLowerCase();

    // Exact match gets highest score
    if (normalizedText === normalizedQuery) return 1000;

    // Starts with query gets high score
    if (normalizedText.startsWith(normalizedQuery)) return 500;

    // Contains query gets medium score
    if (normalizedText.includes(normalizedQuery)) return 100;

    // Fuzzy match
    let queryIndex = 0;
    let textIndex = 0;
    let score = 0;
    let consecutiveBonus = 0;

    while (queryIndex < normalizedQuery.length && textIndex < normalizedText.length) {
      if (normalizedQuery[queryIndex] === normalizedText[textIndex]) {
        score += 10 + consecutiveBonus;
        consecutiveBonus = Math.min(consecutiveBonus + 5, 15);
        queryIndex++;
      } else {
        consecutiveBonus = 0;
      }
      textIndex++;
    }

    // If all characters matched
    if (queryIndex === normalizedQuery.length) {
      // Penalize longer strings
      score -= (text.length - query.length) * 2;
      return Math.max(1, score);
    }

    return 0;
  }

  /**
   * Filter and sort commands by query
   * @param {Array} commands - Commands to filter
   * @param {string} query - Search query
   * @returns {Array} Filtered and scored commands
   */
  static filterCommands(commands, query) {
    if (!query.trim()) {
      return commands.map(cmd => ({ ...cmd, score: 1 }));
    }

    return commands
      .map(cmd => {
        // Score against title, keywords, and description
        let score = this.match(query, cmd.title);
        
        if (cmd.keywords) {
          for (const keyword of cmd.keywords) {
            const keywordScore = this.match(query, keyword);
            score = Math.max(score, keywordScore * 0.8);
          }
        }
        
        if (cmd.description) {
          const descScore = this.match(query, cmd.description);
          score = Math.max(score, descScore * 0.5);
        }

        return { ...cmd, score };
      })
      .filter(cmd => cmd.score > 0)
      .sort((a, b) => b.score - a.score);
  }
}

/**
 * Command Palette Component
 */
class CommandPalette {
  constructor(options = {}) {
    this.registry = new CommandRegistry();
    this.isOpen = false;
    this.selectedIndex = 0;
    this.filteredCommands = [];
    this.query = '';
    this.debounceTimer = null;
    this.debounceDelay = options.debounceDelay || 50;
    this.onCloseCallback = options.onClose || null;
    this.onExecuteCallback = options.onExecute || null;

    // Bind methods
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleClickOutside = this.handleClickOutside.bind(this);
    this.navigateUp = this.navigateUp.bind(this);
    this.navigateDown = this.navigateDown.bind(this);
    this.selectCurrent = this.selectCurrent.bind(this);
    this.close = this.close.bind(this);

    // Initialize
    this.createElements();
    this.setupEventListeners();
    this.registerDefaultCommands();
    this.registry.loadRecent();
  }

  /**
   * Create DOM elements
   */
  createElements() {
    // Container
    this.container = document.createElement('div');
    this.container.className = 'command-palette';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-label', 'Command Palette');
    this.container.style.display = 'none';

    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'command-palette-overlay';

    // Modal
    this.modal = document.createElement('div');
    this.modal.className = 'command-palette-modal';

    // Search container
    this.searchContainer = document.createElement('div');
    this.searchContainer.className = 'command-palette-search';

    // Search icon
    this.searchIcon = document.createElement('i');
    this.searchIcon.setAttribute('data-lucide', 'search');
    this.searchIcon.className = 'command-palette-search-icon';

    // Search input
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Type a command or search...';
    this.input.className = 'command-palette-input';
    this.input.setAttribute('aria-label', 'Search commands');
    this.input.autocomplete = 'off';
    this.input.autocapitalize = 'off';
    this.input.spellcheck = false;

    // Shortcut hint
    this.shortcutHint = document.createElement('kbd');
    this.shortcutHint.className = 'command-palette-shortcut-hint';
    this.shortcutHint.textContent = 'ESC';

    // List container
    this.listContainer = document.createElement('div');
    this.listContainer.className = 'command-palette-list';
    this.listContainer.setAttribute('role', 'listbox');

    // Empty state
    this.emptyState = document.createElement('div');
    this.emptyState.className = 'command-palette-empty';
    this.emptyState.innerHTML = `
      <i data-lucide="search-x"></i>
      <p>No commands found</p>
    `;

    // Assemble structure
    this.searchContainer.appendChild(this.searchIcon);
    this.searchContainer.appendChild(this.input);
    this.searchContainer.appendChild(this.shortcutHint);
    this.modal.appendChild(this.searchContainer);
    this.modal.appendChild(this.listContainer);
    this.container.appendChild(this.overlay);
    this.container.appendChild(this.modal);

    // Add to document
    document.body.appendChild(this.container);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Global keyboard shortcut
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Input events
    this.input.addEventListener('input', this.handleInput);
    this.input.addEventListener('keydown', this.handleKeyDown);

    // Click outside to close
    this.overlay.addEventListener('click', this.handleClickOutside);

    // Prevent form submission
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
    });
  }

  /**
   * Register default commands
   */
  registerDefaultCommands() {
    // Navigation commands
    this.registry.register({
      id: 'nav-dashboard',
      title: 'Go to Dashboard',
      category: 'navigation',
      icon: 'layout-dashboard',
      shortcut: 'G D',
      keywords: ['home', 'main', 'overview'],
      execute: () => this.navigateTo('dashboard'),
    });

    this.registry.register({
      id: 'nav-tasks',
      title: 'Go to Tasks',
      category: 'navigation',
      icon: 'check-square',
      shortcut: 'G T',
      keywords: ['todo', 'matrix', 'eisenhower'],
      execute: () => this.navigateTo('tasks'),
    });

    this.registry.register({
      id: 'nav-roadmaps',
      title: 'Go to Roadmaps',
      category: 'navigation',
      icon: 'map',
      shortcut: 'G R',
      keywords: ['timeline', 'plan', 'project'],
      execute: () => this.navigateTo('roadmaps'),
    });

    this.registry.register({
      id: 'nav-analytics',
      title: 'Go to Analytics',
      category: 'navigation',
      icon: 'bar-chart-3',
      shortcut: 'G A',
      keywords: ['stats', 'metrics', 'charts', 'reports'],
      execute: () => this.navigateTo('analytics'),
    });

    this.registry.register({
      id: 'nav-agents',
      title: 'Go to Agents',
      category: 'navigation',
      icon: 'bot',
      shortcut: 'G N',
      keywords: ['bots', 'ai', 'models'],
      execute: () => this.navigateTo('agents'),
    });

    this.registry.register({
      id: 'nav-tools',
      title: 'Go to Tools',
      category: 'navigation',
      icon: 'wrench',
      shortcut: 'G O',
      keywords: ['mcp', 'functions', 'capabilities'],
      execute: () => this.navigateTo('tools'),
    });

    this.registry.register({
      id: 'nav-gsd',
      title: 'Go to GSD Workflows',
      category: 'navigation',
      icon: 'workflow',
      shortcut: 'G W',
      keywords: ['workflows', 'automation', 'pipelines'],
      execute: () => this.navigateTo('gsd'),
    });

    this.registry.register({
      id: 'nav-cv',
      title: 'Go to Agent CVs',
      category: 'navigation',
      icon: 'file-badge',
      shortcut: 'G C',
      keywords: ['resumes', 'profiles', 'skills'],
      execute: () => this.navigateTo('cv'),
    });

    this.registry.register({
      id: 'nav-alerts',
      title: 'Go to Alerts',
      category: 'navigation',
      icon: 'bell',
      shortcut: 'G L',
      keywords: ['notifications', 'warnings', 'errors'],
      execute: () => this.navigateTo('alerts'),
    });

    this.registry.register({
      id: 'nav-providers',
      title: 'Go to Providers',
      category: 'navigation',
      icon: 'cpu',
      shortcut: 'G P',
      keywords: ['models', 'ai providers', 'claude', 'codex', 'kimi'],
      execute: () => this.navigateTo('providers'),
    });

    this.registry.register({
      id: 'nav-context',
      title: 'Go to Context',
      category: 'navigation',
      icon: 'database',
      shortcut: 'G X',
      keywords: ['snapshots', 'memory', 'storage'],
      execute: () => this.navigateTo('context'),
    });

    this.registry.register({
      id: 'nav-settings',
      title: 'Go to Settings',
      category: 'navigation',
      icon: 'settings',
      shortcut: 'G S',
      keywords: ['preferences', 'configuration', 'options'],
      execute: () => this.navigateTo('settings'),
    });

    // Create actions
    this.registry.register({
      id: 'create-task',
      title: 'Create New Task',
      category: 'actions',
      icon: 'plus',
      shortcut: 'C T',
      keywords: ['add', 'new', 'todo'],
      execute: () => {
        this.close();
        setTimeout(() => {
          const event = new CustomEvent('commandpalette:create', { detail: { type: 'task' } });
          document.dispatchEvent(event);
          // Also try to show task modal directly if dashboard app is available
          if (window.dashboardApp?.showTaskModal) {
            window.dashboardApp.showTaskModal();
          }
        }, 100);
      },
    });

    this.registry.register({
      id: 'create-roadmap',
      title: 'Create New Roadmap',
      category: 'actions',
      icon: 'map-plus',
      shortcut: 'C R',
      keywords: ['add', 'new', 'timeline', 'plan'],
      execute: () => {
        this.close();
        setTimeout(() => {
          const event = new CustomEvent('commandpalette:create', { detail: { type: 'roadmap' } });
          document.dispatchEvent(event);
          const btn = document.getElementById('createRoadmapBtn');
          if (btn) btn.click();
        }, 100);
      },
    });

    this.registry.register({
      id: 'create-workflow',
      title: 'Create New Workflow',
      category: 'actions',
      icon: 'git-branch-plus',
      shortcut: 'C W',
      keywords: ['add', 'new', 'automation', 'pipeline'],
      execute: () => {
        this.close();
        setTimeout(() => {
          const event = new CustomEvent('commandpalette:create', { detail: { type: 'workflow' } });
          document.dispatchEvent(event);
          const btn = document.getElementById('createWorkflowBtn');
          if (btn) btn.click();
        }, 100);
      },
    });

    this.registry.register({
      id: 'create-cv',
      title: 'Create New Agent CV',
      category: 'actions',
      icon: 'user-plus',
      shortcut: 'C C',
      keywords: ['add', 'new', 'resume', 'profile'],
      execute: () => {
        this.close();
        setTimeout(() => {
          const event = new CustomEvent('commandpalette:create', { detail: { type: 'cv' } });
          document.dispatchEvent(event);
          const btn = document.getElementById('createCVBtn');
          if (btn) btn.click();
        }, 100);
      },
    });

    this.registry.register({
      id: 'create-snapshot',
      title: 'Create Context Snapshot',
      category: 'actions',
      icon: 'camera',
      shortcut: 'C S',
      keywords: ['save', 'backup', 'memory'],
      execute: () => {
        this.close();
        setTimeout(() => {
          const event = new CustomEvent('commandpalette:create', { detail: { type: 'snapshot' } });
          document.dispatchEvent(event);
          const btn = document.getElementById('createSnapshotBtn');
          if (btn) btn.click();
        }, 100);
      },
    });

    // Settings commands
    this.registry.register({
      id: 'toggle-theme',
      title: 'Toggle Theme',
      category: 'settings',
      icon: 'sun-moon',
      shortcut: 'T T',
      keywords: ['dark', 'light', 'mode', 'appearance'],
      execute: () => {
        this.close();
        const event = new CustomEvent('commandpalette:action', { detail: { action: 'toggleTheme' } });
        document.dispatchEvent(event);
        if (window.dashboardApp?.handleThemeToggle) {
          window.dashboardApp.handleThemeToggle();
        } else {
          // Fallback: toggle theme directly
          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
          localStorage.setItem('darkMode', !isDark);
        }
      },
    });

    this.registry.register({
      id: 'toggle-sidebar',
      title: 'Toggle Sidebar',
      category: 'settings',
      icon: 'panel-left',
      shortcut: 'T S',
      keywords: ['collapse', 'expand', 'navigation'],
      execute: () => {
        this.close();
        if (window.dashboardApp?.handleSidebarToggle) {
          window.dashboardApp.handleSidebarToggle();
        } else {
          const sidebar = document.getElementById('sidebar');
          if (sidebar) sidebar.classList.toggle('collapsed');
        }
      },
    });

    this.registry.register({
      id: 'toggle-compact',
      title: 'Toggle Compact Mode',
      category: 'settings',
      icon: 'minimize-2',
      keywords: ['dense', 'minimal', 'spacing'],
      execute: () => {
        this.close();
        document.body.classList.toggle('compact-mode');
        const isCompact = document.body.classList.contains('compact-mode');
        localStorage.setItem('compactMode', isCompact);
        const checkbox = document.getElementById('compactMode');
        if (checkbox) checkbox.checked = isCompact;
      },
    });

    this.registry.register({
      id: 'refresh-data',
      title: 'Refresh Dashboard Data',
      category: 'actions',
      icon: 'refresh-cw',
      shortcut: 'R D',
      keywords: ['reload', 'update', 'sync'],
      execute: () => {
        this.close();
        if (window.dashboardApp?.loadDashboardData) {
          window.dashboardApp.loadDashboardData();
        }
        if (typeof Toast !== 'undefined') {
          Toast.info('Dashboard data refreshed');
        }
      },
    });

    // Help commands
    this.registry.register({
      id: 'help-shortcuts',
      title: 'Keyboard Shortcuts',
      category: 'help',
      icon: 'keyboard',
      keywords: ['hotkeys', 'keybindings', 'commands'],
      execute: () => {
        this.close();
        this.showShortcutsHelp();
      },
    });

    this.registry.register({
      id: 'help-documentation',
      title: 'Open Documentation',
      category: 'help',
      icon: 'book-open',
      keywords: ['docs', 'guide', 'manual', 'readme'],
      execute: () => {
        this.close();
        window.open('https://github.com/yourusername/ckamal#readme', '_blank');
      },
    });

    this.registry.register({
      id: 'clear-recent',
      title: 'Clear Recent Commands',
      category: 'settings',
      icon: 'history',
      keywords: ['reset', 'clear history', 'remove'],
      execute: () => {
        this.registry.clearRecent();
        this.filterCommands();
        if (typeof Toast !== 'undefined') {
          Toast.info('Recent commands cleared');
        }
      },
    });

    this.registry.register({
      id: 'logout',
      title: 'Log Out',
      category: 'settings',
      icon: 'log-out',
      shortcut: 'L O',
      keywords: ['sign out', 'exit', 'quit'],
      execute: () => {
        this.close();
        if (window.dashboardApp?.handleLogout) {
          window.dashboardApp.handleLogout();
        } else {
          window.location.reload();
        }
      },
    });
  }

  /**
   * Navigate to a view
   * @param {string} view - View name
   */
  navigateTo(view) {
    this.close();
    setTimeout(() => {
      const event = new CustomEvent('commandpalette:navigate', { detail: { view } });
      document.dispatchEvent(event);
      if (window.dashboardApp?.navigateTo) {
        window.dashboardApp.navigateTo(view);
      } else {
        // Fallback: update hash
        window.location.hash = view;
        // Trigger navigation manually
        const navLink = document.querySelector(`[data-view="${view}"]`);
        if (navLink) navLink.click();
      }
    }, 100);
  }

  /**
   * Show keyboard shortcuts help modal
   */
  showShortcutsHelp() {
    const shortcuts = [
      { key: '⌘/Ctrl + K', action: 'Open Command Palette' },
      { key: '↑ / ↓', action: 'Navigate commands' },
      { key: 'Enter', action: 'Execute selected command' },
      { key: 'Esc', action: 'Close palette' },
      { key: 'G + D', action: 'Go to Dashboard' },
      { key: 'G + T', action: 'Go to Tasks' },
      { key: 'G + R', action: 'Go to Roadmaps' },
      { key: 'C + T', action: 'Create new task' },
    ];

    const modal = document.createElement('div');
    modal.className = 'command-palette-help-modal';
    modal.innerHTML = `
      <div class="command-palette-help-content">
        <div class="command-palette-help-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="command-palette-help-close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="command-palette-help-body">
          <table class="command-palette-shortcuts-table">
            ${shortcuts.map(s => `
              <tr>
                <td><kbd>${s.key}</kbd></td>
                <td>${s.action}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('.command-palette-help-close')) {
        modal.remove();
      }
    });

    document.body.appendChild(modal);
    if (typeof commandPaletteWindow.lucide?.createIcons === 'function') {
      commandPaletteWindow.lucide.createIcons();
    }
  }

  /**
   * Handle input with debounce
   */
  handleInput() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.query = this.input.value;
      this.filterCommands();
    }, this.debounceDelay);
  }

  /**
   * Filter and render commands
   */
  filterCommands() {
    const visibleCommands = this.registry.getVisibleCommands();
    
    // Get recent commands
    const recentCommands = this.registry.getRecentCommands();
    
    // Filter based on query
    let filtered = FuzzySearch.filterCommands(visibleCommands, this.query);
    
    // Remove duplicates from recent if they're in filtered results
    if (this.query.trim() === '' && recentCommands.length > 0) {
      const recentIds = new Set(recentCommands.map(c => c.id));
      filtered = filtered.filter(cmd => !recentIds.has(cmd.id));
    }

    this.filteredCommands = filtered;
    this.selectedIndex = 0;
    this.render(recentCommands);
  }

  /**
   * Render command list
   * @param {Array} recentCommands - Recent command objects
   */
  render(recentCommands = []) {
    if (this.filteredCommands.length === 0 && recentCommands.length === 0) {
      this.listContainer.innerHTML = '';
      this.listContainer.appendChild(this.emptyState);
      if (typeof commandPaletteWindow.lucide?.createIcons === 'function') {
        commandPaletteWindow.lucide.createIcons();
      }
      return;
    }

    const groups = new Map();

    // Add recent commands group if no query and we have recent
    if (this.query.trim() === '' && recentCommands.length > 0) {
      groups.set('recent', {
        category: { id: 'recent', label: 'Recent', icon: 'history', priority: 0 },
        commands: recentCommands,
      });
    }

    // Group filtered commands by category
    for (const cmd of this.filteredCommands) {
      const category = this.registry.categories.get(cmd.category);
      if (!groups.has(cmd.category)) {
        groups.set(cmd.category, { category, commands: [] });
      }
      groups.get(cmd.category).commands.push(cmd);
    }

    // Sort groups by priority
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      return (a.category?.priority || 99) - (b.category?.priority || 99);
    });

    // Render HTML
    let globalIndex = 0;
    this.listContainer.innerHTML = sortedGroups.map(group => {
      const categoryHeader = `
        <div class="command-palette-group-header">
          <i data-lucide="${group.category.icon}"></i>
          <span>${group.category.label}</span>
        </div>
      `;

      const items = group.commands.map(cmd => {
        const isSelected = globalIndex === this.selectedIndex;
        const shortcut = cmd.shortcut ? `<kbd class="command-palette-item-shortcut">${cmd.shortcut}</kbd>` : '';
        const description = cmd.description ? `<div class="command-palette-item-description">${cmd.description}</div>` : '';
        
        const html = `
          <div 
            class="command-palette-item ${isSelected ? 'selected' : ''}" 
            data-index="${globalIndex++}"
            data-command-id="${cmd.id}"
            role="option"
            aria-selected="${isSelected}"
          >
            <div class="command-palette-item-icon">
              <i data-lucide="${cmd.icon}"></i>
            </div>
            <div class="command-palette-item-content">
              <div class="command-palette-item-title">${this.highlightMatch(cmd.title)}</div>
              ${description}
            </div>
            ${shortcut}
          </div>
        `;
        return html;
      }).join('');

      return categoryHeader + items;
    }).join('');

    // Add click handlers
    this.listContainer.querySelectorAll('.command-palette-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index, 10);
        this.selectedIndex = index;
        this.selectCurrent();
      });
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = parseInt(item.dataset.index, 10);
        this.updateSelection();
      });
    });

    // Initialize icons
    if (typeof commandPaletteWindow.lucide?.createIcons === 'function') {
      commandPaletteWindow.lucide.createIcons();
    }

    // Scroll selected into view
    this.scrollSelectedIntoView();
  }

  /**
   * Highlight matching text
   * @param {string} text - Text to highlight
   * @returns {string} HTML with highlighted matches
   */
  highlightMatch(text) {
    if (!this.query.trim()) return text;

    const query = this.query.toLowerCase();
    const textLower = text.toLowerCase();
    let result = '';
    let lastIndex = 0;

    for (let i = 0; i < text.length; i++) {
      if (textLower.substring(i).startsWith(query)) {
        result += text.substring(lastIndex, i);
        result += `<mark>${text.substring(i, i + query.length)}</mark>`;
        lastIndex = i + query.length;
        break; // Only highlight first match
      }
    }
    result += text.substring(lastIndex);
    return result;
  }

  /**
   * Update selection visual state
   */
  updateSelection() {
    const items = this.listContainer.querySelectorAll('.command-palette-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
      item.setAttribute('aria-selected', index === this.selectedIndex);
    });
    this.scrollSelectedIntoView();
  }

  /**
   * Scroll selected item into view
   */
  scrollSelectedIntoView() {
    const selected = this.listContainer.querySelector('.command-palette-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Handle keyboard navigation
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.navigateDown();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.navigateUp();
        break;
      case 'Enter':
        e.preventDefault();
        this.selectCurrent();
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
      case 'Home':
        e.preventDefault();
        this.selectedIndex = 0;
        this.updateSelection();
        break;
      case 'End':
        e.preventDefault();
        this.selectedIndex = Math.max(0, this.filteredCommands.length - 1);
        this.updateSelection();
        break;
      case 'PageDown':
        e.preventDefault();
        this.selectedIndex = Math.min(
          this.filteredCommands.length - 1,
          this.selectedIndex + 5
        );
        this.updateSelection();
        break;
      case 'PageUp':
        e.preventDefault();
        this.selectedIndex = Math.max(0, this.selectedIndex - 5);
        this.updateSelection();
        break;
    }
  }

  /**
   * Navigate down in the list
   */
  navigateDown() {
    const total = this.filteredCommands.length + this.registry.getRecentCommands().length;
    if (total === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % total;
    this.updateSelection();
  }

  /**
   * Navigate up in the list
   */
  navigateUp() {
    const total = this.filteredCommands.length + this.registry.getRecentCommands().length;
    if (total === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + total) % total;
    this.updateSelection();
  }

  /**
   * Select current item
   */
  selectCurrent() {
    const totalItems = this.listContainer.querySelectorAll('.command-palette-item');
    if (totalItems.length === 0) return;

    const selectedItem = totalItems[this.selectedIndex];
    if (!selectedItem) return;

    const commandId = selectedItem.dataset.commandId;
    const command = this.registry.getCommand(commandId);

    if (command) {
      this.registry.addToRecent(commandId);
      if (this.onExecuteCallback) {
        this.onExecuteCallback(command);
      }
      command.execute();
    }
  }

  /**
   * Handle click outside
   * @param {MouseEvent} e
   */
  handleClickOutside(e) {
    if (e.target === this.overlay) {
      this.close();
    }
  }

  /**
   * Open the command palette
   */
  open() {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.container.style.display = 'block';
    
    // Trigger animation
    requestAnimationFrame(() => {
      this.container.classList.add('open');
      this.modal.classList.add('open');
    });

    // Reset state
    this.query = '';
    this.input.value = '';
    this.selectedIndex = 0;
    this.filterCommands();

    // Focus input
    setTimeout(() => this.input.focus(), 50);

    // Dispatch event
    document.dispatchEvent(new CustomEvent('commandpalette:open'));
  }

  /**
   * Close the command palette
   */
  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.container.classList.remove('open');
    this.modal.classList.remove('open');

    // Wait for animation
    setTimeout(() => {
      if (!this.isOpen) {
        this.container.style.display = 'none';
      }
    }, 200);

    // Dispatch event
    document.dispatchEvent(new CustomEvent('commandpalette:close'));

    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  /**
   * Toggle the command palette
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Register a custom command
   * @param {Object} command - Command definition
   */
  registerCommand(command) {
    this.registry.register(command);
  }

  /**
   * Unregister a command
   * @param {string} id - Command ID
   */
  unregisterCommand(id) {
    this.registry.unregister(id);
  }

  /**
   * Check if palette is open
   * @returns {boolean}
   */
  get isOpened() {
    return this.isOpen;
  }

  /**
   * Dispose the component
   */
  dispose() {
    this.close();
    clearTimeout(this.debounceTimer);
    this.container.remove();
    
    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeyDown);
  }
}

// Expose to global scope
if (typeof window !== 'undefined') {
  window.CommandPalette = CommandPalette;
  window.CommandRegistry = CommandRegistry;
  window.FuzzySearch = FuzzySearch;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CommandPalette, CommandRegistry, FuzzySearch };
}
