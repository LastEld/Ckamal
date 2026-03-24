#!/usr/bin/env node
/**
 * BIOS TUI - Terminal User Interface
 * Blessed-based visual monitoring dashboard
 */

import blessed from 'blessed';
import { OperatorConsole } from './console.js';

/**
 * BIOS Terminal User Interface
 * Provides a visual monitoring dashboard using blessed
 */
export class BIOS_TUI {
  constructor(options = {}) {
    this.console = new OperatorConsole();
    this.options = {
      updateInterval: options.updateInterval || 2000,
      theme: options.theme || 'default',
      ...options
    };
    
    this.screen = null;
    this.widgets = {};
    this.timers = [];
    this.isRunning = false;
  }

  /**
   * Initialize the TUI
   */
  init() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'CogniMesh BIOS v5.0',
      cursor: {
        artificial: true,
        shape: 'line',
        blink: true,
        color: null
      }
    });

    this._setupTheme();
    this._createLayout();
    this._bindKeys();
    this._startUpdates();
    
    this.isRunning = true;
    this.screen.render();
  }

  /**
   * Setup color theme
   * @private
   */
  _setupTheme() {
    this.colors = {
      border: 'cyan',
      header: 'white',
      text: 'white',
      highlight: 'yellow',
      success: 'green',
      error: 'red',
      warning: 'yellow',
      info: 'blue',
      muted: 'gray'
    };

    if (this.options.theme === 'dark') {
      this.colors.border = 'blue';
      this.colors.highlight = 'cyan';
    }
  }

  /**
   * Create the TUI layout
   * @private
   */
  _createLayout() {
    const screen = this.screen;

    // Header
    this.widgets.header = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}CogniMesh BIOS v5.0 - Operator Dashboard{/center}',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: this.colors.header,
        border: {
          fg: this.colors.border
        }
      }
    });

    // System Status Box
    this.widgets.statusBox = blessed.box({
      top: 3,
      left: 0,
      width: '50%',
      height: '35%',
      label: ' System Status ',
      content: 'Loading...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: this.colors.text,
        border: {
          fg: this.colors.border
        }
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        inverse: true
      }
    });

    // Agents Box
    this.widgets.agentsBox = blessed.box({
      top: 3,
      right: 0,
      width: '50%',
      height: '35%',
      label: ' Active Agents ',
      content: 'Loading...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: this.colors.text,
        border: {
          fg: this.colors.border
        }
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        inverse: true
      }
    });

    // Clients Box
    this.widgets.clientsBox = blessed.box({
      top: '38%',
      left: 0,
      width: '50%',
      height: '30%',
      label: ' Client Connections ',
      content: 'Loading...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: this.colors.text,
        border: {
          fg: this.colors.border
        }
      },
      scrollable: true,
      alwaysScroll: true
    });

    // Metrics Box
    this.widgets.metricsBox = blessed.box({
      top: '38%',
      right: 0,
      width: '50%',
      height: '30%',
      label: ' System Metrics ',
      content: 'Loading...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: this.colors.text,
        border: {
          fg: this.colors.border
        }
      },
      scrollable: true,
      alwaysScroll: true
    });

    // Log Box
    this.widgets.logBox = blessed.log({
      bottom: 3,
      left: 0,
      width: '100%',
      height: '32%',
      label: ' Event Log ',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: this.colors.text,
        border: {
          fg: this.colors.border
        },
        scrollbar: {
          bg: this.colors.border
        }
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        inverse: true
      }
    });

    // Command Input
    this.widgets.input = blessed.textbox({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      label: ' Command ',
      inputOnFocus: true,
      border: {
        type: 'line'
      },
      style: {
        fg: this.colors.text,
        border: {
          fg: this.colors.border
        },
        focus: {
          border: {
            fg: this.colors.highlight
          }
        }
      }
    });

    // Help overlay (hidden by default)
    this.widgets.helpOverlay = blessed.box({
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      label: ' Keyboard Shortcuts ',
      content: this._getHelpContent(),
      tags: true,
      border: {
        type: 'double'
      },
      style: {
        fg: this.colors.text,
        bg: 'black',
        border: {
          fg: this.colors.highlight
        }
      },
      hidden: true,
      scrollable: true
    });

    // Add all widgets to screen
    Object.values(this.widgets).forEach(widget => {
      screen.append(widget);
    });

    // Focus on input
    this.widgets.input.focus();
  }

  /**
   * Bind keyboard shortcuts
   * @private
   */
  _bindKeys() {
    const screen = this.screen;
    const input = this.widgets.input;

    // Quit
    screen.key(['C-c', 'q'], () => {
      this.shutdown();
    });

    // Help toggle
    screen.key(['?'], () => {
      this.widgets.helpOverlay.toggle();
      screen.render();
    });

    // Focus input
    screen.key(['i'], () => {
      input.focus();
    });

    // Refresh
    screen.key(['r', 'f5'], () => {
      this._updateAll();
    });

    // Tab through widgets
    screen.key(['tab'], () => {
      screen.focusNext();
    });

    screen.key(['S-tab'], () => {
      screen.focusPrevious();
    });

    // Handle command input
    input.on('submit', async (value) => {
      input.clearValue();
      screen.render();
      
      if (value.trim()) {
        this.log(`> ${value}`, 'command');
        try {
          const result = await this.console.execute(value);
          if (result) {
            if (result.message) {
              this.log(result.message, result.success !== false ? 'success' : 'error');
            }
            if (result.formatted) {
              this.log(result.formatted, 'info');
            }
          }
        } catch (error) {
          this.log(error.message, 'error');
        }
      }
      
      input.focus();
    });

    // Console event handlers
    this.console.on('agent:spawned', ({ agentId, cvId }) => {
      this.log(`Agent ${agentId} spawned with CV ${cvId}`, 'success');
      this._updateAgents();
    });

    this.console.on('agent:killed', ({ agentId }) => {
      this.log(`Agent ${agentId} terminated`, 'warning');
      this._updateAgents();
    });

    this.console.on('task:delegated', ({ target }) => {
      this.log(`Task delegated to ${target}`, 'info');
    });

    this.console.on('command:error', ({ error }) => {
      this.log(`Command error: ${error.message}`, 'error');
    });
  }

  /**
   * Start automatic updates
   * @private
   */
  _startUpdates() {
    // Initial update
    this._updateAll();

    // Periodic updates
    const statusTimer = setInterval(() => this._updateStatus(), this.options.updateInterval);
    const agentsTimer = setInterval(() => this._updateAgents(), this.options.updateInterval * 2);
    const clientsTimer = setInterval(() => this._updateClients(), this.options.updateInterval * 2);
    const metricsTimer = setInterval(() => this._updateMetrics(), this.options.updateInterval);

    this.timers.push(statusTimer, agentsTimer, clientsTimer, metricsTimer);
  }

  /**
   * Update all widgets
   * @private
   */
  async _updateAll() {
    await this._updateStatus();
    await this._updateAgents();
    await this._updateClients();
    await this._updateMetrics();
    this.screen.render();
  }

  /**
   * Update status widget
   * @private
   */
  async _updateStatus() {
    try {
      const result = await this.console.cmdStatus();
      if (result && result.data) {
        const s = result.data;
        const content = [
          `{bold}Version:{/bold}    ${s.version}`,
          `{bold}Uptime:{/bold}     ${s.uptime}`,
          `{bold}Memory:{/bold}     ${s.memory.rss}`,
          '',
          `{bold}Agents:{/bold}     ${s.agents.active}/${s.agents.total} active`,
          `{bold}Clients:{/bold}    ${s.clients.connected}/${s.clients.total} connected`,
          '',
          `{bold}Tasks:{/bold}      ${s.tasks.completed} completed`
        ].join('\n');
        
        this.widgets.statusBox.setContent(content);
        this.screen.render();
      }
    } catch (e) {
      // Ignore update errors
    }
  }

  /**
   * Update agents widget
   * @private
   */
  async _updateAgents() {
    try {
      const result = await this.console.cmdAgentsList();
      if (result && result.data) {
        const agents = result.data;
        const lines = agents.map(a => {
          const statusColor = a.status === 'active' ? 'green' : 
                             a.status === 'standby' ? 'yellow' : 'red';
          return `{${statusColor}-fg}${a.id.padEnd(8)}{/${statusColor}-fg} ${a.name.substring(0, 20).padEnd(20)} ${a.status.padEnd(8)} ${a.tasks}`;
        });
        
        const header = '{underline}ID        Name                 Status   Tasks{/underline}';
        this.widgets.agentsBox.setContent([header, ...lines].join('\n'));
        this.screen.render();
      }
    } catch (e) {
      // Ignore update errors
    }
  }

  /**
   * Update clients widget
   * @private
   */
  async _updateClients() {
    try {
      const result = await this.console.cmdClientsStatus();
      if (result && result.data) {
        const clients = result.data;
        const lines = clients.map(c => {
          const status = c.connected ? '{green-fg}●{/green-fg}' : '{red-fg}○{/red-fg}';
          return `${status} ${c.id.padEnd(8)} ${c.name.substring(0, 16).padEnd(16)} ${c.type}`;
        });
        
        this.widgets.clientsBox.setContent(lines.join('\n'));
        this.screen.render();
      }
    } catch (e) {
      // Ignore update errors
    }
  }

  /**
   * Update metrics widget
   * @private
   */
  async _updateMetrics() {
    try {
      const result = await this.console.cmdMetrics();
      if (result && result.data) {
        const m = result.data;
        const content = [
          `{bold}Uptime:{/bold}           ${m.uptime}`,
          `{bold}Success Rate:{/bold}     ${m.taskSuccessRate}%`,
          `{bold}Tasks Completed:{/bold}  ${m.tasksCompleted}`,
          `{bold}Agents Spawned:{/bold}   ${m.agentsSpawned}`,
          '',
          `{bold}Memory:{/bold}`,
          `  RSS:  ${m.memory.rss}`,
          `  Heap: ${m.memory.heapUsed}`
        ].join('\n');
        
        this.widgets.metricsBox.setContent(content);
        this.screen.render();
      }
    } catch (e) {
      // Ignore update errors
    }
  }

  /**
   * Log a message to the log widget
   * @param {string} message - Message to log
   * @param {string} type - Message type (info, success, error, warning, command)
   */
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    let styledMsg;
    
    switch (type) {
      case 'success':
        styledMsg = `{green-fg}[${timestamp}] ✓ ${message}{/green-fg}`;
        break;
      case 'error':
        styledMsg = `{red-fg}[${timestamp}] ✗ ${message}{/red-fg}`;
        break;
      case 'warning':
        styledMsg = `{yellow-fg}[${timestamp}] ⚠ ${message}{/yellow-fg}`;
        break;
      case 'command':
        styledMsg = `{cyan-fg}${message}{/cyan-fg}`;
        break;
      default:
        styledMsg = `[${timestamp}] ${message}`;
    }
    
    this.widgets.logBox.log(styledMsg);
  }

  /**
   * Get help content for overlay
   * @private
   */
  _getHelpContent() {
    return `
{bold}Keyboard Shortcuts:{/bold}

  {bold}?{/bold}          - Toggle this help screen
  {bold}i{/bold}          - Focus command input
  {bold}Tab{/bold}        - Cycle through widgets
  {bold}r, F5{/bold}       - Refresh all data
  {bold}q, Ctrl+C{/bold}  - Quit TUI

{bold}Available Commands:{/bold}

  status                    - Show system status
  agents list               - List all agents
  agents spawn <cv-id>      - Spawn new agent
  clients                   - Show client connections
  delegate --to=<id> --task="<desc>"  - Delegate task
  parallel --clients=<list> --task="<desc>"  - Parallel execution
  chain --steps=<json>      - Chain tasks
  update check              - Check for updates
  update apply              - Apply updates
  patch create <desc>       - Create patch
  patch verify <id>         - Verify patch
  rollback <version>        - Rollback system
  logs                      - Show logs
  metrics                   - Show metrics
  test                      - Run regression tests
  help                      - Show command help
  exit                      - Exit console

Press {bold}?{/bold} to close this help.
`;
  }

  /**
   * Shutdown the TUI
   */
  shutdown() {
    this.isRunning = false;
    
    // Clear all timers
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
    
    // Destroy screen
    if (this.screen) {
      this.screen.destroy();
    }
    
    process.exit(0);
  }

  /**
   * Run the TUI
   */
  run() {
    this.init();
    this.log('BIOS TUI initialized', 'success');
    this.log('Press ? for help, q to quit', 'info');
  }
}

/**
 * Main entry point
 */
function main() {
  const tui = new BIOS_TUI();
  tui.run();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
export default BIOS_TUI;
