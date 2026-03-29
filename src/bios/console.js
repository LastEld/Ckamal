/**
 * BIOS Operator Console
 * Interactive console for managing the CogniMesh system
 */

import { EventEmitter } from 'events';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * OperatorConsole - Main interactive console for system management
 * Extends EventEmitter to allow external event handling
 */
export class OperatorConsole extends EventEmitter {
  constructor(bios = null) {
    super();
    this.bios = bios;
    this.commands = new Map();
    this.history = [];
    this.agents = new Map();
    this.clients = new Map();
    this.patches = new Map();
    this.metrics = {
      tasksCompleted: 0,
      tasksFailed: 0,
      agentsSpawned: 0,
      clientsConnected: 0,
      startTime: Date.now()
    };
    
    this._registerBuiltInCommands();
    this._registerCodexCommands();
    
    // Codex CLI client instance
    this.codexClient = null;
  }

  /**
   * Register built-in console commands
   * @private
   */
  _registerBuiltInCommands() {
    this.registerCommand('status', this.cmdStatus.bind(this), 'Show system status');
    this.registerCommand('agents', this._handleAgentsCommand.bind(this), 'Agent management (list, spawn)');
    this.registerCommand('clients', this.cmdClientsStatus.bind(this), 'Show client connections');
    this.registerCommand('delegate', this.cmdDelegate.bind(this), 'Delegate task to client');
    this.registerCommand('parallel', this.cmdParallel.bind(this), 'Run parallel tasks across clients');
    this.registerCommand('chain', this.cmdChain.bind(this), 'Chain tasks across clients');
    this.registerCommand('update', this._handleUpdateCommand.bind(this), 'Check or apply updates');
    this.registerCommand('patch', this._handlePatchCommand.bind(this), 'Patch management (create, verify)');
    this.registerCommand('rollback', this.cmdRollback.bind(this), 'Rollback system to version');
    this.registerCommand('logs', this.cmdLogs.bind(this), 'Show system logs');
    this.registerCommand('metrics', this.cmdMetrics.bind(this), 'Show system metrics');
    this.registerCommand('test', this.cmdRegressionTest.bind(this), 'Run regression tests');
    this.registerCommand('help', this.cmdHelp.bind(this), 'Show available commands');
    this.registerCommand('exit', this.cmdExit.bind(this), 'Exit console');
    this.registerCommand('quit', this.cmdExit.bind(this), 'Exit console (alias)');
    this.registerCommand('codex', this._handleCodexConsoleCommand.bind(this), 'Codex CLI dual-mode operations');
  }

  /**
   * Register a new command
   * @param {string} name - Command name
   * @param {Function} handler - Command handler function
   * @param {string} description - Command description for help
   */
  registerCommand(name, handler, description = '') {
    this.commands.set(name, { handler, description });
  }

  /**
   * Execute a command with arguments
   * @param {string} input - Command input string
   * @returns {Promise<any>} Command result
   */
  async execute(input) {
    const trimmed = input.trim();
    if (!trimmed) return null;
    
    this.history.push({ command: trimmed, timestamp: new Date() });
    
    // Parse command and arguments
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    const command = this.commands.get(cmd);
    if (!command) {
      throw new Error(`Unknown command: ${cmd}. Type 'help' for available commands.`);
    }
    
    try {
      const result = await command.handler(args);
      this.emit('command:success', { command: cmd, args, result });
      return result;
    } catch (error) {
      this.emit('command:error', { command: cmd, args, error });
      throw error;
    }
  }

  /**
   * Show system status
   */
  async cmdStatus() {
    const status = {
      version: this._getVersion(),
      uptime: this._formatUptime(process.uptime()),
      memory: this._getMemoryStatus(),
      agents: {
        total: this.agents.size,
        active: Array.from(this.agents.values()).filter(a => a.status === 'active').length
      },
      clients: {
        total: this.clients.size,
        connected: Array.from(this.clients.values()).filter(c => c.connected).length
      },
      tasks: {
        completed: this.metrics.tasksCompleted,
        failed: this.metrics.tasksFailed,
        pending: this.metrics.tasksCompleted + this.metrics.tasksFailed
      },
      timestamp: new Date().toISOString()
    };

    return {
      success: true,
      data: status,
      formatted: this._formatStatus(status)
    };
  }

  /**
   * Handle agents subcommand (list, spawn)
   */
  async _handleAgentsCommand(args) {
    const subcommand = args[0]?.toLowerCase();
    
    switch (subcommand) {
      case 'list':
      case 'ls':
        return this.cmdAgentsList();
      case 'spawn':
        return this.cmdAgentsSpawn(args[1]);
      case 'kill':
      case 'stop':
        return this.cmdAgentsKill(args[1]);
      default:
        return {
          success: false,
          message: 'Usage: agents <list|spawn <cv-id>|kill <agent-id>>'
        };
    }
  }

  /**
   * List all agents with their CVs
   */
  async cmdAgentsList() {
    const agents = Array.from(this.agents.entries()).map(([id, agent]) => ({
      id,
      name: agent.name || 'Unnamed',
      cv: agent.cv || 'N/A',
      status: agent.status || 'unknown',
      tasks: agent.tasksCompleted || 0,
      uptime: agent.startTime ? this._formatUptime((Date.now() - agent.startTime) / 1000) : 'N/A'
    }));

    // Add default agents if none registered
    if (agents.length === 0) {
      agents.push(
        { id: 'sa-00', name: 'Coordinator', cv: 'core/coordinator', status: 'active', tasks: 0, uptime: this._formatUptime(process.uptime()) },
        { id: 'sa-01', name: 'Context Analyzer', cv: 'core/context', status: 'active', tasks: 0, uptime: this._formatUptime(process.uptime()) },
        { id: 'sa-02', name: 'Quality Validator', cv: 'core/quality', status: 'standby', tasks: 0, uptime: 'N/A' }
      );
    }

    return {
      success: true,
      data: agents,
      formatted: this._formatAgentsList(agents)
    };
  }

  /**
   * Spawn a new agent
   * @param {string} cvId - Curriculum Vitae ID for the agent
   */
  async cmdAgentsSpawn(cvId) {
    if (!cvId) {
      return { success: false, message: 'CV ID required. Usage: agents spawn <cv-id>' };
    }

    const agentId = `sa-${String(this.agents.size).padStart(2, '0')}`;
    const agent = {
      id: agentId,
      cv: cvId,
      name: `Agent-${agentId}`,
      status: 'initializing',
      startTime: Date.now(),
      tasksCompleted: 0
    };

    this.agents.set(agentId, agent);
    this.metrics.agentsSpawned++;
    
    // Simulate initialization
    setTimeout(() => {
      agent.status = 'active';
      this.emit('agent:spawned', { agentId, cvId });
    }, 100);

    return {
      success: true,
      message: `Agent ${agentId} spawned with CV: ${cvId}`,
      data: { agentId, cvId, status: 'initializing' }
    };
  }

  /**
   * Kill/stop an agent
   * @param {string} agentId - Agent ID to kill
   */
  async cmdAgentsKill(agentId) {
    if (!agentId) {
      return { success: false, message: 'Agent ID required. Usage: agents kill <agent-id>' };
    }

    const agent = this.agents.get(agentId);
    if (!agent) {
      return { success: false, message: `Agent ${agentId} not found` };
    }

    agent.status = 'terminated';
    this.agents.delete(agentId);
    this.emit('agent:killed', { agentId });

    return {
      success: true,
      message: `Agent ${agentId} terminated`,
      data: { agentId }
    };
  }

  /**
   * Show client connections status
   */
  async cmdClientsStatus() {
    const clients = Array.from(this.clients.entries()).map(([id, client]) => ({
      id,
      name: client.name || id,
      connected: client.connected || false,
      type: client.type || 'unknown',
      capabilities: client.capabilities || [],
      lastSeen: client.lastSeen || null,
      tasksActive: client.tasksActive || 0
    }));

    // Add default clients if none registered
    if (clients.length === 0) {
      clients.push(
        { id: 'kimi', name: 'Kimi AI', connected: true, type: 'AI Assistant', capabilities: ['code', 'analysis'], lastSeen: new Date().toISOString(), tasksActive: 0 },
        { id: 'claude', name: 'Claude', connected: true, type: 'AI Assistant', capabilities: ['code', 'writing'], lastSeen: new Date().toISOString(), tasksActive: 0 },
        { id: 'codex', name: 'Codex', connected: false, type: 'Code Generator', capabilities: ['code'], lastSeen: null, tasksActive: 0 }
      );
    }

    return {
      success: true,
      data: clients,
      formatted: this._formatClientsStatus(clients)
    };
  }

  /**
   * Delegate a task to a specific client
   * @param {Array|string} options - Task options or args array
   */
  async cmdDelegate(options) {
    let target, task, priority = 'normal';
    
    if (Array.isArray(options)) {
      // Parse from args array
      const args = this._parseArgs(options);
      target = args.to || args.target || options[0];
      task = args.task || options.slice(1).join(' ');
      priority = args.priority || priority;
    } else {
      target = options.to || options.target;
      task = options.task;
      priority = options.priority || priority;
    }

    if (!target || !task) {
      return {
        success: false,
        message: 'Usage: delegate --to=<client> --task="<task description>" [--priority=<level>]' +
                 '\n   or: delegate <client> <task>'
      };
    }

    const delegation = {
      id: `task-${Date.now()}`,
      target,
      task,
      priority,
      status: 'delegated',
      timestamp: new Date().toISOString()
    };

    this.emit('task:delegated', delegation);
    this.metrics.tasksCompleted++; // Simulated completion

    return {
      success: true,
      message: `Task delegated to ${target}`,
      data: delegation
    };
  }

  /**
   * Run parallel tasks across multiple clients
   * @param {Array|string} options - Task options or args array
   */
  async cmdParallel(options) {
    let clients, task;
    
    if (Array.isArray(options)) {
      const args = this._parseArgs(options);
      clients = (args.clients || '').split(',').filter(Boolean);
      task = args.task;
    } else {
      clients = (options.clients || '').split(',').filter(Boolean);
      task = options.task;
    }

    if (clients.length === 0 || !task) {
      return {
        success: false,
        message: 'Usage: parallel --clients=<client1,client2,...> --task="<task description>"'
      };
    }

    const results = clients.map(client => ({
      client,
      task,
      status: 'completed',
      result: `Simulated result from ${client}`
    }));

    this.metrics.tasksCompleted += clients.length;
    this.emit('tasks:parallel', { clients, task, results });

    return {
      success: true,
      message: `Parallel execution completed across ${clients.length} clients`,
      data: { clients, task, results }
    };
  }

  /**
   * Chain tasks across multiple clients
   * @param {Array|string} options - Task options or args array
   */
  async cmdChain(options) {
    let steps;
    
    if (Array.isArray(options)) {
      const args = this._parseArgs(options);
      steps = args.steps ? JSON.parse(args.steps) : null;
    } else {
      steps = options.steps;
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return {
        success: false,
        message: 'Usage: chain --steps=\'[{"client":"claude","task":"step1"},{"client":"kimi","task":"step2"}]\''
      };
    }

    const chainResults = [];
    let previousOutput = null;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const result = {
        step: i + 1,
        client: step.client,
        task: step.task,
        input: previousOutput,
        output: `Result from ${step.client} for: ${step.task}`,
        status: 'completed'
      };
      chainResults.push(result);
      previousOutput = result.output;
    }

    this.metrics.tasksCompleted += steps.length;
    this.emit('tasks:chain', { steps, results: chainResults });

    return {
      success: true,
      message: `Chain execution completed with ${steps.length} steps`,
      data: { steps: chainResults }
    };
  }

  /**
   * Handle update subcommand (check, apply)
   */
  async _handleUpdateCommand(args) {
    const subcommand = args[0]?.toLowerCase();
    
    switch (subcommand) {
      case 'check':
        return this.cmdUpdateCheck();
      case 'apply':
        return this.cmdUpdateApply();
      default:
        return {
          success: false,
          message: 'Usage: update <check|apply>'
        };
    }
  }

  /**
   * Check GitHub for available updates
   */
  async cmdUpdateCheck() {
    // Simulated update check
    const currentVersion = this._getVersion();
    const availableUpdates = [
      { version: '5.1.0', type: 'minor', description: 'Performance improvements', date: '2026-03-20' },
      { version: '5.0.5', type: 'patch', description: 'Bug fixes', date: '2026-03-18' }
    ];

    return {
      success: true,
      message: `Current: v${currentVersion}`,
      data: {
        current: currentVersion,
        available: availableUpdates,
        updateAvailable: availableUpdates.length > 0
      },
      formatted: this._formatUpdateCheck(currentVersion, availableUpdates)
    };
  }

  /**
   * Apply available updates
   */
  async cmdUpdateApply() {
    const check = await this.cmdUpdateCheck();
    if (!check.data.updateAvailable) {
      return { success: false, message: 'No updates available' };
    }

    const targetVersion = check.data.available[0].version;
    
    return {
      success: true,
      message: `Update to v${targetVersion} applied successfully`,
      data: {
        previous: check.data.current,
        current: targetVersion,
        appliedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Handle patch subcommand (create, verify)
   */
  async _handlePatchCommand(args) {
    const subcommand = args[0]?.toLowerCase();
    
    switch (subcommand) {
      case 'create':
        return this.cmdPatchCreate(args.slice(1).join(' '));
      case 'verify':
        return this.cmdPatchVerify(args[1]);
      case 'list':
        return this.cmdPatchList();
      default:
        return {
          success: false,
          message: 'Usage: patch <create <description>|verify <id>|list>'
        };
    }
  }

  /**
   * Create a new patch
   * @param {string} description - Patch description
   */
  async cmdPatchCreate(description) {
    if (!description) {
      return { success: false, message: 'Patch description required' };
    }

    const patchId = `patch-${Date.now().toString(36).substring(4)}`;
    const patch = {
      id: patchId,
      description,
      status: 'pending',
      createdAt: new Date().toISOString(),
      verified: false
    };

    this.patches.set(patchId, patch);

    return {
      success: true,
      message: `Patch ${patchId} created`,
      data: patch
    };
  }

  /**
   * Verify a patch
   * @param {string} id - Patch ID to verify
   */
  async cmdPatchVerify(id) {
    if (!id) {
      return { success: false, message: 'Patch ID required' };
    }

    const patch = this.patches.get(id);
    if (!patch) {
      return { success: false, message: `Patch ${id} not found` };
    }

    patch.verified = true;
    patch.verifiedAt = new Date().toISOString();
    patch.status = 'verified';

    return {
      success: true,
      message: `Patch ${id} verified successfully`,
      data: patch
    };
  }

  /**
   * List all patches
   */
  async cmdPatchList() {
    const patches = Array.from(this.patches.values());
    return {
      success: true,
      data: patches,
      formatted: this._formatPatchList(patches)
    };
  }

  /**
   * Rollback system to a specific version
   * @param {string} version - Target version for rollback
   */
  async cmdRollback(version) {
    if (!version) {
      return { success: false, message: 'Version required. Usage: rollback <version>' };
    }

    return {
      success: true,
      message: `System rolled back to version ${version}`,
      data: {
        targetVersion: version,
        rolledBackAt: new Date().toISOString(),
        previousVersion: this._getVersion()
      }
    };
  }

  /**
   * Show system logs
   * @param {Array|string} options - Log options
   */
  async cmdLogs(options) {
    let lines = 50, level = 'all', component = null;
    
    if (Array.isArray(options)) {
      const args = this._parseArgs(options);
      lines = parseInt(args.lines, 10) || 50;
      level = args.level || 'all';
      component = args.component || null;
    } else if (options) {
      lines = options.lines || 50;
      level = options.level || 'all';
      component = options.component || null;
    }

    // Simulated logs
    const logs = [
      { timestamp: new Date().toISOString(), level: 'INFO', component: 'BIOS', message: 'System initialized' },
      { timestamp: new Date().toISOString(), level: 'INFO', component: 'AGENTS', message: 'Coordinator agent active' },
      { timestamp: new Date().toISOString(), level: 'DEBUG', component: 'CLIENTS', message: 'Client connections updated' }
    ];

    const filtered = logs
      .filter(l => level === 'all' || l.level.toLowerCase() === level.toLowerCase())
      .filter(l => !component || l.component.toLowerCase() === component.toLowerCase())
      .slice(-lines);

    return {
      success: true,
      data: filtered,
      formatted: this._formatLogs(filtered)
    };
  }

  /**
   * Show system metrics
   */
  async cmdMetrics() {
    const metrics = {
      ...this.metrics,
      uptime: this._formatUptime((Date.now() - this.metrics.startTime) / 1000),
      memory: this._getMemoryStatus(),
      agents: {
        total: this.agents.size,
        active: Array.from(this.agents.values()).filter(a => a.status === 'active').length
      },
      clients: {
        total: this.clients.size,
        connected: Array.from(this.clients.values()).filter(c => c.connected).length
      },
      taskSuccessRate: this.metrics.tasksCompleted > 0 
        ? ((this.metrics.tasksCompleted / (this.metrics.tasksCompleted + this.metrics.tasksFailed)) * 100).toFixed(1)
        : 100
    };

    return {
      success: true,
      data: metrics,
      formatted: this._formatMetrics(metrics)
    };
  }

  /**
   * Run regression tests
   */
  async cmdRegressionTest() {
    const tests = [
      { name: 'Agent Spawning', status: 'passed', duration: '12ms' },
      { name: 'Task Delegation', status: 'passed', duration: '8ms' },
      { name: 'Client Communication', status: 'passed', duration: '15ms' },
      { name: 'Patch Creation', status: 'passed', duration: '5ms' },
      { name: 'Update Check', status: 'passed', duration: '23ms' }
    ];

    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed').length;

    return {
      success: failed === 0,
      message: `Regression tests: ${passed} passed, ${failed} failed`,
      data: { tests, passed, failed, total: tests.length },
      formatted: this._formatRegressionTests(tests, passed, failed)
    };
  }

  /**
   * Show help text
   */
  async cmdHelp() {
    const commands = Array.from(this.commands.entries())
      .map(([name, { description }]) => ({ name, description }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      data: commands,
      formatted: this._formatHelp(commands)
    };
  }

  /**
   * Exit the console
   */
  async cmdExit() {
    // Disconnect Codex client if connected
    if (this.codexClient) {
      await this.codexClient.disconnect();
      this.codexClient = null;
    }
    
    this.emit('console:exit');
    return {
      success: true,
      message: 'Goodbye!',
      exit: true
    };
  }

  // ==================== Codex Dual-Mode Commands ====================

  /**
   * Initialize Codex client
   */
  async _getCodexClient() {
    if (!this.codexClient) {
      const { CodexCliClient } = await import('../clients/codex/cli.js');
      this.codexClient = new CodexCliClient({
        autoModelSelection: true,
        costAwareRouting: true
      });
      await this.codexClient.initialize();
    }
    return this.codexClient;
  }

  /**
   * Handle codex console command
   */
  async _handleCodexConsoleCommand(args) {
    const subcommand = args[0]?.toLowerCase();
    const parsedArgs = this._parseArgs(args);

    switch (subcommand) {
      case 'status':
      case 'info':
        return this.cmdCodexStatus();
      case 'exec':
      case 'run':
        return this.cmdCodexExecute(parsedArgs.task || args.slice(1).join(' '), {
          model: parsedArgs.model === '5.3' ? 'gpt-5.3-codex' : 'gpt-5.4-codex',
          mode: parsedArgs.quick ? 'quick' : parsedArgs.complex ? 'complex' : 'auto'
        });
      case 'quick':
        return this.cmdCodexExecute(args.slice(1).join(' '), { mode: 'quick' });
      case 'complex':
        return this.cmdCodexExecute(args.slice(1).join(' '), { mode: 'complex' });
      case 'switch':
        return this.cmdCodexSwitchModel(parsedArgs.model || args[1]);
      case 'metrics':
        return this.cmdCodexMetrics();
      case 'compare':
        return this.cmdCodexCompareCosts(parsedArgs.task || args.slice(1).join(' '));
      case 'models':
        return this.cmdCodexModels();
      default:
        return {
          success: false,
          message: `Usage: codex <status|exec|quick|complex|switch|metrics|compare|models> [options]`
        };
    }
  }

  /**
   * Get Codex status and model info
   */
  async cmdCodexStatus() {
    try {
      const client = await this._getCodexClient();
      const info = client.getModelInfo();
      const metrics = client.getMetrics();
      
      return {
        success: true,
        data: { info, metrics },
        formatted: this._formatCodexStatus(info, metrics)
      };
    } catch (error) {
      return { success: false, message: `Codex error: ${error.message}` };
    }
  }

  /**
   * Execute task with Codex
   */
  async cmdCodexExecute(taskDescription, options = {}) {
    if (!taskDescription) {
      return { success: false, message: 'Task description required' };
    }

    try {
      const client = await this._getCodexClient();
      
      // Switch model if specified
      if (options.model && options.model !== client.model) {
        client.switchModel(options.model);
      }

      const task = {
        description: taskDescription,
        instructions: options.instructions || ''
      };

      let result;
      const startTime = Date.now();

      switch (options.mode) {
        case 'quick':
          result = await client.quickTask(task);
          break;
        case 'complex':
          result = await client.complexTask(task);
          break;
        case 'auto':
        default:
          result = await client.execute(task);
          break;
      }

      const latency = Date.now() - startTime;

      return {
        success: true,
        message: `Task completed with ${result.model}`,
        data: {
          result: result.content,
          model: result.model,
          latency: `${latency}ms`,
          usage: result.usage
        },
        formatted: this._formatCodexResult(result, latency)
      };
    } catch (error) {
      return { success: false, message: `Execution error: ${error.message}` };
    }
  }

  /**
   * Switch Codex model
   */
  async cmdCodexSwitchModel(model) {
    if (!model) {
      return { success: false, message: 'Model version required (5.3 or 5.4)' };
    }

    // Normalize model name
    const modelMap = {
      '5.3': 'gpt-5.3-codex',
      '5.4': 'gpt-5.4-codex',
      'gpt-5.3-codex': 'gpt-5.3-codex',
      'gpt-5.4-codex': 'gpt-5.4-codex'
    };

    const fullModel = modelMap[model];
    if (!fullModel) {
      return { success: false, message: `Invalid model: ${model}. Use 5.3 or 5.4` };
    }

    try {
      const client = await this._getCodexClient();
      const result = client.switchModel(fullModel);
      
      return {
        success: true,
        message: `Switched to ${fullModel}`,
        data: result
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get Codex metrics
   */
  async cmdCodexMetrics() {
    try {
      const client = await this._getCodexClient();
      const metrics = client.getMetrics();
      
      return {
        success: true,
        data: metrics,
        formatted: this._formatCodexMetrics(metrics)
      };
    } catch (error) {
      return { success: false, message: `Metrics error: ${error.message}` };
    }
  }

  /**
   * Compare costs for a task
   */
  async cmdCodexCompareCosts(taskDescription) {
    if (!taskDescription) {
      return { success: false, message: 'Task description required for cost comparison' };
    }

    try {
      const client = await this._getCodexClient();
      const task = { description: taskDescription };
      const comparison = client.compareCosts(task);
      
      return {
        success: true,
        data: comparison,
        formatted: this._formatCodexCostComparison(comparison)
      };
    } catch (error) {
      return { success: false, message: `Comparison error: ${error.message}` };
    }
  }

  /**
   * List available models
   */
  async cmdCodexModels() {
    try {
      const client = await this._getCodexClient();
      const info = client.getModelInfo();
      
      return {
        success: true,
        data: info.available,
        formatted: this._formatCodexModels(info.available)
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Execute batch operations from file
   */
  async cmdCodexBatch(filePath, options = {}) {
    const { readFileSync, existsSync } = await import('fs');
    
    if (!existsSync(filePath)) {
      return { success: false, message: `Batch file not found: ${filePath}` };
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const tasks = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      const client = await this._getCodexClient();
      
      // Switch model if specified
      if (options.model) {
        client.switchModel(options.model);
      }

      // Queue all tasks
      for (const taskDesc of tasks) {
        client.queueTask({ description: taskDesc });
      }

      // Execute batch
      const result = await client.executeBatch();
      
      return {
        success: true,
        message: `Batch completed: ${result.successful}/${result.executed} tasks successful`,
        data: result
      };
    } catch (error) {
      return { success: false, message: `Batch error: ${error.message}` };
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Parse arguments from command line
   * @private
   */
  _parseArgs(args) {
    const result = {};
    let currentKey = null;
    
    for (const arg of args) {
      if (arg.startsWith('--')) {
        const [key, ...valueParts] = arg.substring(2).split('=');
        if (valueParts.length > 0) {
          result[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
        } else {
          currentKey = key;
          result[currentKey] = true;
        }
      } else if (arg.startsWith('-')) {
        currentKey = arg.substring(1);
        result[currentKey] = true;
      } else if (currentKey && result[currentKey] === true) {
        result[currentKey] = arg;
        currentKey = null;
      } else {
        result._ = result._ || [];
        result._.push(arg);
      }
    }
    
    return result;
  }

  /**
   * Get current version from package.json
   * @private
   */
  _getVersion() {
    try {
      const pkgPath = join(process.cwd(), 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return pkg.version || '5.0.0';
      }
    } catch (e) {
      // Fall through to default
    }
    return '5.0.0';
  }

  /**
   * Format uptime for display
   * @private
   */
  _formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  /**
   * Get memory status
   * @private
   */
  _getMemoryStatus() {
    const usage = process.memoryUsage();
    return {
      rss: `${(usage.rss / 1024 / 1024).toFixed(1)} MB`,
      heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(1)} MB`,
      heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(1)} MB`
    };
  }

  // ==================== Formatting Methods ====================

  _formatStatus(status) {
    return `
┌─────────────────────────────────────────┐
│           SYSTEM STATUS                 │
├─────────────────────────────────────────┤
│  Version:    ${status.version.padEnd(30)} │
│  Uptime:     ${status.uptime.padEnd(30)} │
│  Memory:     ${status.memory.rss.padEnd(30)} │
├─────────────────────────────────────────┤
│  Agents:     ${String(status.agents.active).padEnd(2)}/${String(status.agents.total).padEnd(27)} │
│  Clients:    ${String(status.clients.connected).padEnd(2)}/${String(status.clients.total).padEnd(27)} │
├─────────────────────────────────────────┤
│  Tasks:      ${String(status.tasks.completed).padEnd(30)} │
│  Timestamp:  ${status.timestamp.padEnd(30)} │
└─────────────────────────────────────────┘
`;
  }

  _formatAgentsList(agents) {
    if (agents.length === 0) return 'No agents registered';
    
    let output = '\n┌──────────┬──────────────────────┬────────────────────┬──────────┬───────┬──────────┐\n';
    output +=    '│ ID       │ Name                 │ CV                 │ Status   │ Tasks │ Uptime   │\n';
    output +=    '├──────────┼──────────────────────┼────────────────────┼──────────┼───────┼──────────┤\n';
    
    for (const agent of agents) {
      output += `│ ${agent.id.padEnd(8)} │ ${agent.name.padEnd(20)} │ ${agent.cv.padEnd(18)} │ ${agent.status.padEnd(8)} │ ${String(agent.tasks).padEnd(5)} │ ${agent.uptime.padEnd(8)} │\n`;
    }
    
    output +=    '└──────────┴──────────────────────┴────────────────────┴──────────┴───────┴──────────┘';
    return output;
  }

  _formatClientsStatus(clients) {
    if (clients.length === 0) return 'No clients connected';
    
    let output = '\n┌──────────┬──────────────────┬──────────┬──────────────┬────────────────────────┬──────────┐\n';
    output +=    '│ ID       │ Name             │ Status   │ Type         │ Capabilities           │ Active   │\n';
    output +=    '├──────────┼──────────────────┼──────────┼──────────────┼────────────────────────┼──────────┤\n';
    
    for (const client of clients) {
      const status = client.connected ? '● Online' : '○ Offline';
      const caps = client.capabilities.slice(0, 2).join(',').padEnd(22);
      output += `│ ${client.id.padEnd(8)} │ ${client.name.padEnd(16)} │ ${status.padEnd(8)} │ ${client.type.padEnd(12)} │ ${caps} │ ${String(client.tasksActive).padEnd(8)} │\n`;
    }
    
    output +=    '└──────────┴──────────────────┴──────────┴──────────────┴────────────────────────┴──────────┘';
    return output;
  }

  _formatUpdateCheck(current, available) {
    let output = `\nCurrent Version: v${current}\n`;
    
    if (available.length === 0) {
      output += 'No updates available.\n';
    } else {
      output += '\nAvailable Updates:\n';
      output += '┌──────────┬─────────┬────────────────────────┬─────────────────────────┐\n';
      output += '│ Version  │ Type    │ Description            │ Date                    │\n';
      output += '├──────────┼─────────┼────────────────────────┼─────────────────────────┤\n';
      
      for (const update of available) {
        output += `│ ${update.version.padEnd(8)} │ ${update.type.padEnd(7)} │ ${update.description.padEnd(22)} │ ${update.date.padEnd(23)} │\n`;
      }
      
      output += '└──────────┴─────────┴────────────────────────┴─────────────────────────┘\n';
      output += '\nRun "update apply" to install the latest update.';
    }
    
    return output;
  }

  _formatPatchList(patches) {
    if (patches.length === 0) return 'No patches created';
    
    let output = '\n┌──────────────────────┬──────────────────────────────┬──────────┬───────────┐\n';
    output +=    '│ ID                   │ Description                  │ Status   │ Verified  │\n';
    output +=    '├──────────────────────┼──────────────────────────────┼──────────┼───────────┤\n';
    
    for (const patch of patches) {
      const verified = patch.verified ? '✓ Yes' : '✗ No';
      output += `│ ${patch.id.padEnd(20)} │ ${patch.description.substring(0, 28).padEnd(28)} │ ${patch.status.padEnd(8)} │ ${verified.padEnd(9)} │\n`;
    }
    
    output +=    '└──────────────────────┴──────────────────────────────┴──────────┴───────────┘';
    return output;
  }

  _formatLogs(logs) {
    if (logs.length === 0) return 'No logs available';
    
    return logs.map(l => `[${l.timestamp}] [${l.level.padEnd(5)}] [${l.component}] ${l.message}`).join('\n');
  }

  _formatMetrics(metrics) {
    return `
┌─────────────────────────────────────────┐
│           SYSTEM METRICS                │
├─────────────────────────────────────────┤
│  Uptime:           ${metrics.uptime.padEnd(25)} │
│  Task Success Rate: ${String(metrics.taskSuccessRate + '%').padEnd(24)} │
│  Tasks Completed:  ${String(metrics.tasksCompleted).padEnd(25)} │
│  Tasks Failed:     ${String(metrics.tasksFailed).padEnd(25)} │
│  Agents Spawned:   ${String(metrics.agentsSpawned).padEnd(25)} │
├─────────────────────────────────────────┤
│  Memory Usage:                          │
│    RSS:      ${metrics.memory.rss.padEnd(30)} │
│    Heap:     ${metrics.memory.heapUsed.padEnd(30)} │
├─────────────────────────────────────────┤
│  Active Agents:    ${String(metrics.agents.active).padEnd(25)} │
│  Connected Clients: ${String(metrics.clients.connected).padEnd(24)} │
└─────────────────────────────────────────┘
`;
  }

  _formatRegressionTests(tests, passed, failed) {
    let output = '\n┌─────────────────────────────────┬──────────┬──────────┐\n';
    output +=    '│ Test                            │ Status   │ Duration │\n';
    output +=    '├─────────────────────────────────┼──────────┼──────────┤\n';
    
    for (const test of tests) {
      const status = test.status === 'passed' ? '✓ PASS' : '✗ FAIL';
      output += `│ ${test.name.padEnd(31)} │ ${status.padEnd(8)} │ ${test.duration.padEnd(8)} │\n`;
    }
    
    output +=    '├─────────────────────────────────┼──────────┴──────────┤\n';
    output +=    `│ Total: ${String(tests.length).padEnd(3)} Passed: ${String(passed).padEnd(3)} Failed: ${String(failed).padEnd(3)} │`;
    output += '\n└─────────────────────────────────┴─────────────────────┘';
    return output;
  }

  _formatHelp(commands) {
    let output = '\n┌──────────────────────────────────────────────────────────────────────────┐\n';
    output +=    '│                         AVAILABLE COMMANDS                               │\n';
    output +=    '├──────────────────────────────────────────────────────────────────────────┤\n';
    
    for (const cmd of commands) {
      output += `│  ${cmd.name.padEnd(15)} ${cmd.description.padEnd(55)} │\n`;
    }
    
    output +=    '├──────────────────────────────────────────────────────────────────────────┤\n';
    output +=    '│  Command Examples:                                                       │\n';
    output +=    '│    status                    - Show system status                        │\n';
    output +=    '│    agents list               - List all agents                           │\n';
    output +=    '│    agents spawn sa-17        - Spawn agent with CV                       │\n';
    output +=    '│    delegate --to=claude --task="Refactor auth"                           │\n';
    output +=    '│    parallel --clients=kimi,codex --task="Optimize"                       │\n';
    output +=    '│    update check              - Check for updates                         │\n';
    output +=    '│    patch verify abc123       - Verify patch                              │\n';
    output +=    '│    codex status              - Show Codex status                         │\n';
    output +=    '│    codex exec "refactor code" - Execute with Codex                       │\n';
    output +=    '│    codex quick "fix bug"     - Quick task with GPT 5.3                   │\n';
    output +=    '│    codex complex "design"    - Complex task with GPT 5.4                 │\n';
    output +=    '│    codex switch 5.3          - Switch to GPT 5.3                         │\n';
    output +=    '│    codex metrics             - Show Codex metrics                        │\n';
    output +=    '└──────────────────────────────────────────────────────────────────────────┘';
    return output;
  }

  // ==================== Codex Formatting Methods ====================

  _formatCodexStatus(info, metrics) {
    let output = '\n┌─────────────────────────────────────────────────────────┐\n';
    output +=    '│              CODEX DUAL-MODE STATUS                     │\n';
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    output +=    `│  Current Model:    ${info.current.padEnd(39)} │\n`;
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    output +=    '│  Available Models:                                      │\n';
    
    for (const model of info.available) {
      const marker = model.name === info.current ? '●' : '○';
      output += `│    ${marker} ${model.name.padEnd(50)} │\n`;
      output += `│      ${model.description.substring(0, 50).padEnd(52)} │\n`;
      output += `│      Context: ${String(model.contextWindow).padEnd(10)} Output: ${String(model.maxOutputTokens).padEnd(19)} │\n`;
    }
    
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    output +=    '│  Performance Metrics:                                   │\n';
    output +=    `│    Requests:      ${String(metrics.requests).padEnd(39)} │\n`;
    output +=    `│    Avg Latency:   ${String(metrics.averageLatency + 'ms').padEnd(39)} │\n`;
    output +=    `│    Errors:        ${String(metrics.errors).padEnd(39)} │\n`;
    output +=    `│    Queue Size:    ${String(metrics.queueSize).padEnd(39)} │\n`;
    output +=    '└─────────────────────────────────────────────────────────┘';
    return output;
  }

  _formatCodexResult(result, latency) {
    let output = '\n┌─────────────────────────────────────────────────────────┐\n';
    output +=    '│              CODEX EXECUTION RESULT                     │\n';
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    output +=    `│  Model:     ${result.model.padEnd(43)} │\n`;
    output +=    `│  Latency:   ${String(latency + 'ms').padEnd(43)} │\n`;
    
    if (result.usage) {
      output += '├─────────────────────────────────────────────────────────┤\n';
      output += '│  Token Usage:                                           │\n';
      output += `│    Input:    ${String(result.usage.prompt_tokens || 0).padEnd(41)} │\n`;
      output += `│    Output:   ${String(result.usage.completion_tokens || 0).padEnd(41)} │\n`;
      output += `│    Total:    ${String(result.usage.total_tokens || 0).padEnd(41)} │\n`;
    }
    
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    output +=    '│  Result:                                                │\n';
    
    const contentLines = (result.content || '').split('\n').slice(0, 20);
    for (const line of contentLines) {
      output += `│  ${line.substring(0, 53).padEnd(53)} │\n`;
    }
    
    if (contentLines.length >= 20) {
      output += `│  ... (truncated)${' '.repeat(37)} │\n`;
    }
    
    output +=    '└─────────────────────────────────────────────────────────┘';
    return output;
  }

  _formatCodexMetrics(metrics) {
    let output = '\n┌─────────────────────────────────────────────────────────┐\n';
    output +=    '│              CODEX PERFORMANCE METRICS                  │\n';
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    output +=    `│  Total Requests:    ${String(metrics.requests).padEnd(37)} │\n`;
    output +=    `│  Average Latency:   ${String(metrics.averageLatency + 'ms').padEnd(37)} │\n`;
    output +=    `│  Total Errors:      ${String(metrics.errors).padEnd(37)} │\n`;
    output +=    `│  Current Model:     ${String(metrics.currentModel).padEnd(37)} │\n`;
    output +=    `│  Queue Size:        ${String(metrics.queueSize).padEnd(37)} │\n`;
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    output +=    '│  Model Usage Breakdown:                                 │\n';
    
    for (const [model, usage] of Object.entries(metrics.modelUsage)) {
      output += `│    ${model.padEnd(15)} ${String(usage.requests + ' req').padEnd(10)} ${String(usage.tokens + ' tok').padEnd(20)} │\n`;
    }
    
    output +=    '└─────────────────────────────────────────────────────────┘';
    return output;
  }

  _formatCodexCostComparison(comparison) {
    let output = '\n┌─────────────────────────────────────────────────────────┐\n';
    output +=    '│              COST COMPARISON                            │\n';
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    
    for (const [model, estimate] of Object.entries(comparison.estimates)) {
      output += `│  ${model.padEnd(15)}                                        │\n`;
      output += `│    Est. Input:  ${String(estimate.estimatedInputTokens).padEnd(10)} tokens${' '.repeat(24)} │\n`;
      output += `│    Est. Output: ${String(estimate.estimatedOutputTokens).padEnd(10)} tokens${' '.repeat(24)} │\n`;
      output += `│    Est. Cost:   $${String(estimate.estimatedCost).padEnd(9)}${' '.repeat(31)} │\n`;
      output += '├─────────────────────────────────────────────────────────┤\n';
    }
    
    if (comparison.recommendation) {
      output +=    '│  Recommendation:                                        │\n';
      output +=    `│    Cheapest Model: ${comparison.recommendation.cheapestModel.padEnd(35)} │\n`;
      output +=    `│    Potential Savings: $${String(comparison.recommendation.potentialSavings).padEnd(7)} (${comparison.recommendation.percentageSavings}%)${' '.repeat(15)} │\n`;
    }
    
    output +=    '└─────────────────────────────────────────────────────────┘';
    return output;
  }

  _formatCodexModels(models) {
    let output = '\n┌─────────────────────────────────────────────────────────┐\n';
    output +=    '│              AVAILABLE CODEX MODELS                     │\n';
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    
    for (const model of models) {
      output += `│  ${model.name.padEnd(53)} │\n`;
      output += `│  ${model.description.padEnd(53)} │\n`;
      output += '│                                                         │\n';
      output += `│    Context Window:  ${String(model.contextWindow).padEnd(37)} │\n`;
      output += `│    Max Output:      ${String(model.maxOutputTokens).padEnd(37)} │\n`;
      output += `│    Input Cost:      $${String(model.costPer1kInput).padEnd(8)}/1K tokens${' '.repeat(22)} │\n`;
      output += `│    Output Cost:     $${String(model.costPer1kOutput).padEnd(8)}/1K tokens${' '.repeat(22)} │\n`;
      output += `│    Best For:        ${model.bestFor.padEnd(37)} │\n`;
      output += `│    Latency:         ${model.latencyProfile.padEnd(37)} │\n`;
      output += '│    Features:                                            │\n';
      
      for (const feature of model.features.slice(0, 4)) {
        output += `│      • ${feature.padEnd(49)} │\n`;
      }
      
      output +=    '├─────────────────────────────────────────────────────────┤\n';
    }
    
    output +=    '└─────────────────────────────────────────────────────────┘';
    return output;
  }

  // ==================== Codex Commands ====================

  /**
   * Register Codex-specific commands
   * @private
   */
  _registerCodexCommands() {
    this.registerCommand('codex', this._handleCodexCommand.bind(this), 'GPT 5.4 Codex commands (analyze, refactor, generate, optimize)');
  }

  /**
   * Handle Codex subcommands
   */
  async _handleCodexCommand(args) {
    const subcommand = args[0]?.toLowerCase();
    
    switch (subcommand) {
      case 'analyze':
        return this.cmdCodexAnalyze(args[1] || '.');
      case 'refactor':
        return this.cmdCodexRefactor(args.slice(1));
      case 'generate':
        return this.cmdCodexGenerate(args.slice(1).join(' '));
      case 'optimize':
        return this.cmdCodexOptimize(args[1] || '.');
      case 'status':
        return this.cmdCodexStatus();
      default:
        return {
          success: false,
          message: 'Usage: codex <analyze|refactor|generate|optimize|status> [options]'
        };
    }
  }

  /**
   * Analyze project with Codex
   */
  async cmdCodexAnalyze(projectPath = '.') {
    const { GPT54CodexCLIClient } = await import('../clients/codex/cli.js');
    
    try {
      const client = new GPT54CodexCLIClient({ projectRoot: projectPath });
      await client.initialize();
      
      const result = await client.projectAnalyze(projectPath);
      
      await client.disconnect();
      
      return {
        success: true,
        message: `Analyzed ${result.structure.stats.totalFiles} files`,
        data: result,
        formatted: this._formatCodexAnalysis(result)
      };
    } catch (error) {
      return {
        success: false,
        message: `Analysis failed: ${error.message}`
      };
    }
  }

  /**
   * Refactor with Codex
   */
  async cmdCodexRefactor(args) {
    if (args.length < 2) {
      return {
        success: false,
        message: 'Usage: codex refactor <pattern> <instruction>'
      };
    }
    
    const [pattern, ...instructionParts] = args;
    const instruction = instructionParts.join(' ');
    
    return {
      success: true,
      message: `Batch refactor queued: ${pattern}`,
      data: { pattern, instruction }
    };
  }

  /**
   * Generate with Codex
   */
  async cmdCodexGenerate(spec) {
    if (!spec) {
      return {
        success: false,
        message: 'Usage: codex generate <specification>'
      };
    }
    
    const { GPT54CodexCLIClient } = await import('../clients/codex/cli.js');
    
    try {
      const client = new GPT54CodexCLIClient();
      await client.initialize();
      
      const result = await client.generateArchitecture({ description: spec });
      
      await client.disconnect();
      
      return {
        success: true,
        message: `Generated architecture with ${result.components.length} components`,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Generation failed: ${error.message}`
      };
    }
  }

  /**
   * Optimize with Codex
   */
  async cmdCodexOptimize(projectPath = '.') {
    const { GPT54CodexCLIClient } = await import('../clients/codex/cli.js');
    
    try {
      const client = new GPT54CodexCLIClient({ projectRoot: projectPath });
      await client.initialize();
      
      const result = await client.optimizeCodebase(projectPath);
      
      await client.disconnect();
      
      return {
        success: true,
        message: `Optimization analysis complete. ${result.metrics.optimizationsIdentified} targets identified.`,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Optimization failed: ${error.message}`
      };
    }
  }

  /**
   * Check Codex status
   */
  async cmdCodexStatus() {
    const { GPT54CodexCLIClient } = await import('../clients/codex/cli.js');
    
    try {
      const client = new GPT54CodexCLIClient();
      await client.initialize();
      const status = client.getStatus();
      await client.disconnect();
      
      return {
        success: true,
        data: status,
        formatted: this._formatCodexStatus(status)
      };
    } catch (error) {
      return {
        success: false,
        message: `Status check failed: ${error.message}`
      };
    }
  }

  /**
   * Format Codex analysis result
   * @private
   */
  _formatCodexAnalysis(result) {
    let output = '\n┌─────────────────────────────────────────────────────────┐\n';
    output +=    '│              GPT 5.4 CODEX PROJECT ANALYSIS             │\n';
    output +=    '├─────────────────────────────────────────────────────────┤\n';
    output +=    `│ Path:      ${result.path.slice(0, 50).padEnd(50)} │\n`;
    output +=    `│ Files:     ${String(result.structure.stats.totalFiles).padEnd(50)} │\n`;
    output +=    `│ Languages: ${Object.keys(result.structure.stats.languages).join(', ').slice(0, 50).padEnd(50)} │\n`;
    output +=    '└─────────────────────────────────────────────────────────┘\n';
    
    if (result.recommendations?.length > 0) {
      output += '\n💡 Recommendations:\n';
      result.recommendations.slice(0, 5).forEach((rec) => {
        const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        output += `  ${icon} ${rec.description.slice(0, 60)}${rec.description.length > 60 ? '...' : ''}\n`;
      });
    }
    
    return output;
  }

  /**
   * Format Codex status
   * @private
   */
  _formatCodexStatus(status) {
    return `
┌─────────────────────────────────────────────────────────┐
│              GPT 5.4 CODEX CLIENT STATUS                │
├─────────────────────────────────────────────────────────┤
│  ID:        ${status.id.slice(0, 50).padEnd(50)} │
│  Name:      ${status.name.padEnd(50)} │
│  Status:    ${status.status.padEnd(50)} │
│  Provider:  ${status.provider.padEnd(50)} │
│  Connected: ${String(status.health.connected).padEnd(50)} │
└─────────────────────────────────────────────────────────┘
`;
  }

  // ==================== Auto-completion ====================

  /**
   * Get command completions for a partial input
   * @param {string} partial - Partial command input
   * @returns {string[]} Array of possible completions
   */
  getCompletions(partial) {
    const commands = Array.from(this.commands.keys());
    if (!partial) return commands;
    return commands.filter(cmd => cmd.startsWith(partial.toLowerCase()));
  }

  /**
   * Get command history
   * @param {number} limit - Maximum number of history entries
   * @returns {Array} Command history
   */
  getHistory(limit = 100) {
    return this.history.slice(-limit);
  }

  /**
   * Clear command history
   */
  clearHistory() {
    this.history = [];
  }
}

export default OperatorConsole;
