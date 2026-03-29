/**
 * Output Manager for Ckamal CLI
 * Handles format selection, terminal detection, paging, and streaming output
 */

import { spawn } from 'child_process';
import { EOL } from 'os';
import * as ef from './enhanced-formatters.js';

// ============================================================================
// FORMAT REGISTRY
// ============================================================================

const FORMAT_HANDLERS = {
  table: { handler: 'table', supportsTty: true, supportsPipe: true },
  json: { handler: 'json', supportsTty: true, supportsPipe: true },
  yaml: { handler: 'yaml', supportsTty: true, supportsPipe: true },
  csv: { handler: 'csv', supportsTty: false, supportsPipe: true },
  tree: { handler: 'tree', supportsTty: true, supportsPipe: true },
  plain: { handler: 'plain', supportsTty: true, supportsPipe: true }
};

// ============================================================================
// OUTPUT MANAGER CLASS
// ============================================================================

export class OutputManager {
  constructor(options = {}) {
    this.formatType = options.format || 'auto';
    this.color = options.color !== false;
    this.pager = options.pager !== false;
    this.stream = options.stream || false;
    this.quiet = options.quiet || false;
    this.verbose = options.verbose || false;
    
    this._buffer = [];
    this._isStreaming = false;
    this._pagerProcess = null;
    this._outputStream = process.stdout;
    
    // Auto-detect capabilities
    this._detectCapabilities();
    
    // Apply color settings
    if (!this.color) {
      ef.setTheme('nocolor');
      ef.setForceColor(false);
    }
  }

  /**
   * Detect terminal capabilities
   */
  _detectCapabilities() {
    this.capabilities = {
      isTTY: process.stdout.isTTY,
      isPiped: !process.stdout.isTTY,
      supportsColor: ef.supportsColor(),
      width: ef.getTerminalWidth(),
      height: ef.getTerminalHeight(),
      hasPager: this._detectPager(),
      supportsUnicode: this._detectUnicode(),
      supportsHyperlinks: this._detectHyperlinks()
    };
  }

  /**
   * Detect available pager
   */
  _detectPager() {
    // const pagers = ['less', 'more', 'cat'];
    // Simple detection - in real implementation would check PATH
    return process.env.PAGER || 'less';
  }

  /**
   * Detect Unicode support
   */
  _detectUnicode() {
    if (process.platform === 'win32') {
      return process.env.TERM_PROGRAM === 'vscode' || 
             process.env.WT_SESSION ||
             process.env.TERM === 'xterm-256color';
    }
    return true;
  }

  /**
   * Detect hyperlink support
   */
  _detectHyperlinks() {
    return process.env.TERM_HYPERLINKS === 'true' ||
           process.env.VTE_VERSION ||
           process.env.TERM_PROGRAM === 'vscode';
  }

  /**
   * Determine the best format based on context
   */
  resolveFormat(data, explicitFormat = null) {
    const fmt = explicitFormat || this.formatType;
    
    // Explicit format takes precedence
    if (fmt && fmt !== 'auto') {
      return fmt;
    }
    
    // Check for format flags in environment
    if (process.env.CKAMAL_FORMAT) {
      return process.env.CKAMAL_FORMAT;
    }
    
    // Auto-detect based on context
    if (this.capabilities.isPiped) {
      // Default to JSON for piped output
      if (Array.isArray(data) || typeof data === 'object') {
        return 'json';
      }
      return 'plain';
    }
    
    // Interactive terminal - use table for arrays, tree for objects
    if (Array.isArray(data) && data.length > 0) {
      return 'table';
    }
    if (typeof data === 'object' && data !== null) {
      return 'tree';
    }
    
    return 'plain';
  }

  /**
   * Format data according to selected format
   */
  formatData(data, format = null, options = {}) {
    const fmt = this.resolveFormat(data, format || this.formatType);
    
    switch (fmt) {
      case 'table':
        return this._formatTable(data, options);
      case 'json':
        return ef.json(data, { pretty: !this.capabilities.isPiped, ...options });
      case 'yaml':
        return ef.yaml(data, options);
      case 'csv':
        return this._formatCsv(data, options);
      case 'tree':
        return ef.tree(data, options);
      case 'plain':
      default:
        return this._formatPlain(data, options);
    }
  }

  /**
   * Format data as table
   */
  _formatTable(data, options = {}) {
    if (!Array.isArray(data)) {
      if (typeof data === 'object' && data !== null) {
        // Convert single object to array
        return ef.table([data], options);
      }
      return String(data);
    }
    return ef.table(data, options);
  }

  /**
   * Format data as CSV
   */
  _formatCsv(data, options = {}) {
    if (!Array.isArray(data)) {
      if (typeof data === 'object' && data !== null) {
        data = [data];
      } else {
        return String(data);
      }
    }
    return ef.csv(data, options);
  }

  /**
   * Format data as plain text
   */
  _formatPlain(data, options = {}) {
    if (data === null || data === undefined) {
      return '';
    }
    if (typeof data === 'string') {
      return data;
    }
    if (typeof data === 'object') {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  }

  /**
   * Write output (with optional paging)
   */
  write(content, options = {}) {
    if (this.quiet && !options.force) return;
    
    const usePager = options.pager !== false && 
                     this.pager && 
                     this.capabilities.isTTY &&
                     this._shouldUsePager(content);
    
    if (usePager && !this._pagerProcess) {
      this._startPager();
    }
    
    const stream = this._pagerProcess || this._outputStream;
    
    if (this._isStreaming || this.stream) {
      stream.write(content + EOL);
    } else {
      this._buffer.push(content);
    }
  }

  /**
   * Determine if content is long enough to warrant paging
   */
  _shouldUsePager(content) {
    const lines = content.split(EOL).length;
    return lines > this.capabilities.height - 2;
  }

  /**
   * Start pager process
   */
  _startPager() {
    if (this._pagerProcess) return;
    
    const pagerCmd = this.capabilities.hasPager;
    try {
      this._pagerProcess = spawn(pagerCmd, ['-R'], {
        stdio: ['pipe', process.stdout, process.stderr]
      });
      
      this._pagerProcess.on('exit', () => {
        this._pagerProcess = null;
      });
    } catch (error) {
      // Fall back to stdout if pager fails
      this._pagerProcess = null;
    }
  }

  /**
   * Stop pager process
   */
  _stopPager() {
    if (this._pagerProcess) {
      this._pagerProcess.stdin.end();
      this._pagerProcess = null;
    }
  }

  /**
   * Render formatted output
   */
  render(data, format = null, options = {}) {
    if (this.quiet) return;
    
    const formatted = this.formatData(data, format, options);
    this.write(formatted, options);
    this.flush();
  }

  /**
   * Flush buffered output
   */
  flush() {
    if (this._buffer.length === 0) return;
    
    const content = this._buffer.join(EOL);
    this._buffer = [];
    
    const stream = this._pagerProcess || this._outputStream;
    stream.write(content + EOL);
    
    if (this._pagerProcess) {
      this._stopPager();
    }
  }

  /**
   * Start streaming mode
   */
  startStream() {
    this._isStreaming = true;
    this._buffer = [];
  }

  /**
   * End streaming mode
   */
  endStream() {
    this._isStreaming = false;
    this.flush();
  }

  /**
   * Write a line in streaming mode
   */
  streamLine(line) {
    if (!this._isStreaming) {
      this.startStream();
    }
    this.write(line, { force: true });
  }

  /**
   * Get capabilities info
   */
  getCapabilities() {
    return { ...this.capabilities };
  }

  /**
   * Print capabilities info
   */
  printCapabilities() {
    this.render({
      format: 'table',
      columns: ['Capability', 'Value'],
      data: Object.entries(this.capabilities).map(([key, value]) => ({
        Capability: key,
        Value: String(value)
      }))
    });
  }
}

// ============================================================================
// FORMAT-SPECIFIC HANDLERS FOR DOMAIN OBJECTS
// ============================================================================

/**
 * Format agent status output
 */
export function formatAgentStatus(agent, options = {}) {
  const { format = 'table', detailed = false } = options;
  
  if (format === 'json') {
    return ef.json(agent, options);
  }
  
  if (format === 'yaml') {
    return ef.yaml(agent, options);
  }
  
  if (format === 'csv') {
    const flat = {
      ID: agent.id,
      Name: agent.name,
      Role: agent.role,
      Client: agent.client,
      Runtime: agent.runtime,
      Status: agent.status,
      TasksCompleted: agent.metrics?.tasksCompleted ?? 0,
      TasksFailed: agent.metrics?.tasksFailed ?? 0,
      TasksInFlight: agent.metrics?.tasksInFlight ?? 0
    };
    return ef.csv([flat], options);
  }
  
  // Table/tree format
  let output = '';
  output += ef.header(agent.name?.toUpperCase() || 'AGENT', detailed ? 'box' : 'line');
  output += '\n\n';
  
  const basicInfo = {
    ID: agent.id,
    Name: agent.name,
    Role: agent.role,
    Status: agent.status,
    Client: agent.client,
    Runtime: agent.runtime
  };
  
  if (detailed) {
    basicInfo.Purpose = agent.purpose;
    basicInfo['Tasks Completed'] = String(agent.metrics?.tasksCompleted ?? 0);
    basicInfo['Tasks Failed'] = String(agent.metrics?.tasksFailed ?? 0);
    basicInfo['Tasks In Flight'] = String(agent.metrics?.tasksInFlight ?? 0);
  }
  
  output += ef.keyValue(basicInfo, { indent: 2 });
  
  if (detailed && agent.responsibilities?.length) {
    output += '\n\n' + ef.colorize('Responsibilities:', 'bright') + '\n';
    output += ef.list(agent.responsibilities, { indent: 2 });
  }
  
  if (detailed && agent.capabilities?.length) {
    output += '\n\n' + ef.colorize('Capabilities:', 'bright') + '\n';
    output += ef.list(agent.capabilities, { indent: 2 });
  }
  
  return output;
}

/**
 * Format agent list output
 */
export function formatAgentList(agents, options = {}) {
  const { format = 'table' } = options;
  
  if (format === 'json') {
    return ef.json(agents, options);
  }
  
  if (format === 'yaml') {
    return ef.yaml(agents, options);
  }
  
  if (format === 'csv') {
    const rows = agents.map(agent => ({
      ID: agent.id,
      Name: agent.name,
      Role: agent.role,
      Client: agent.client,
      Runtime: agent.runtime,
      Status: agent.status,
      TaskLoad: agent.metrics?.tasksInFlight ?? 0
    }));
    return ef.csv(rows, options);
  }
  
  if (format === 'tree') {
    const treeData = agents.map(agent => ({
      label: `${agent.name} (${agent.id})`,
      children: [
        { label: `Role: ${agent.role}` },
        { label: `Status: ${agent.status}` },
        { label: `Client: ${agent.client}` },
        { label: `Runtime: ${agent.runtime}` }
      ]
    }));
    return ef.tree(treeData, options);
  }
  
  // Table format (default)
  const rows = agents.map(agent => ({
    ID: agent.id,
    Name: agent.name,
    Role: agent.role,
    Client: agent.client,
    Runtime: agent.runtime,
    Status: agent.status,
    'Task Load': String(agent.metrics?.tasksInFlight ?? 0)
  }));
  
  return ef.table(rows, {
    columns: ['ID', 'Name', 'Role', 'Client', 'Runtime', 'Status', 'Task Load'],
    ...options
  });
}

/**
 * Format issue list output
 */
export function formatIssueList(issues, options = {}) {
  const { format = 'table' } = options;
  
  if (format === 'json') {
    return ef.json(issues, options);
  }
  
  if (format === 'yaml') {
    return ef.yaml(issues, options);
  }
  
  if (format === 'csv') {
    const rows = issues.map(issue => ({
      Number: issue.number,
      Title: issue.title,
      State: issue.state,
      Author: issue.user?.login || issue.author,
      Created: issue.created_at || issue.createdAt,
      Updated: issue.updated_at || issue.updatedAt,
      Labels: Array.isArray(issue.labels) 
        ? issue.labels.map(l => typeof l === 'string' ? l : l.name).join(';')
        : issue.labels
    }));
    return ef.csv(rows, options);
  }
  
  // Table format with status colors
  const rows = issues.map(issue => ({
    '#': issue.number,
    Title: issue.title?.length > 40 ? issue.title.substring(0, 37) + '...' : issue.title,
    State: issue.state,
    Author: issue.user?.login || issue.author || '',
    Created: issue.created_at ? ef.formatDate(issue.created_at, 'relative') : ''
  }));
  
  return ef.table(rows, {
    columns: ['#', 'Title', 'State', 'Author', 'Created'],
    ...options
  });
}

/**
 * Format cost summary output
 */
export function formatCostSummary(summary, options = {}) {
  const { format = 'table' } = options;
  
  if (format === 'json') {
    return ef.json(summary, options);
  }
  
  if (format === 'yaml') {
    return ef.yaml(summary, options);
  }
  
  if (format === 'csv') {
    const rows = summary.breakdown?.map(item => ({
      Category: item.category,
      Amount: item.amount,
      Currency: item.currency || 'USD',
      Percentage: item.percentage || ((item.amount / summary.total) * 100).toFixed(2) + '%'
    })) || [];
    return ef.csv(rows, options);
  }
  
  // Visual format with progress bars
  let output = '';
  output += ef.header('COST SUMMARY', 'line');
  output += '\n\n';
  output += ef.keyValue({
    'Total Cost': `${summary.total?.toFixed(2) || 0} ${summary.currency || 'USD'}`,
    'Period': summary.period || 'N/A',
    'Projected': `${summary.projected?.toFixed(2) || 0} ${summary.currency || 'USD'}`
  }, { indent: 2 });
  
  if (summary.breakdown?.length) {
    output += '\n\n' + ef.colorize('Breakdown:', 'bright') + '\n';
    const maxAmount = Math.max(...summary.breakdown.map(i => i.amount));
    summary.breakdown.forEach(item => {
      const bar = ef.progressBar(item.amount, maxAmount, {
        width: 20,
        showPercent: false,
        showCount: false,
        label: item.category
      });
      output += bar + ` ${item.amount.toFixed(2)}\n`;
    });
  }
  
  return output;
}

/**
 * Format approval list output
 */
export function formatApprovalList(approvals, options = {}) {
  const { format = 'table' } = options;
  
  if (format === 'json') {
    return ef.json(approvals, options);
  }
  
  if (format === 'yaml') {
    return ef.yaml(approvals, options);
  }
  
  if (format === 'csv') {
    const rows = approvals.map(a => ({
      ID: a.id,
      Type: a.type,
      Status: a.status,
      Requester: a.requester,
      Requested: a.requestedAt,
      Expires: a.expiresAt
    }));
    return ef.csv(rows, options);
  }
  
  // Table format
  const rows = approvals.map(a => ({
    ID: a.id?.substring(0, 8) || '',
    Type: a.type,
    Status: a.status,
    Requester: a.requester,
    Requested: a.requestedAt ? ef.formatDate(a.requestedAt, 'relative') : ''
  }));
  
  return ef.table(rows, {
    columns: ['ID', 'Type', 'Status', 'Requester', 'Requested'],
    ...options
  });
}

/**
 * Format task output
 */
export function formatTaskOutput(task, options = {}) {
  const { format = 'table', list = false } = options;
  
  if (Array.isArray(task) || list) {
    const tasks = Array.isArray(task) ? task : [task];
    
    if (format === 'json') {
      return ef.json(tasks, options);
    }
    
    if (format === 'yaml') {
      return ef.yaml(tasks, options);
    }
    
    if (format === 'csv') {
      const rows = tasks.map(t => ({
        ID: t.id,
        Description: t.description,
        Status: t.status,
        Priority: t.priority,
        AssignedTo: t.assignedTo || '',
        Created: t.createdAt,
        Tags: Array.isArray(t.tags) ? t.tags.join(';') : ''
      }));
      return ef.csv(rows, options);
    }
    
    // Table format
    const rows = tasks.map(t => ({
      ID: t.id,
      Description: t.description?.length > 35 
        ? t.description.substring(0, 32) + '...' 
        : t.description,
      Status: t.status,
      Priority: t.priority,
      Created: t.createdAt ? ef.formatDate(t.createdAt, 'short') : ''
    }));
    
    return ef.table(rows, {
      columns: ['ID', 'Description', 'Status', 'Priority', 'Created'],
      ...options
    });
  }
  
  // Single task detail view
  if (format === 'json') {
    return ef.json(task, options);
  }
  
  if (format === 'yaml') {
    return ef.yaml(task, options);
  }
  
  // Box format for single task
  return ef.box(
    ef.keyValue({
      'ID': task.id,
      'Description': task.description,
      'Status': task.status,
      'Priority': task.priority,
      'Assigned To': task.assignedTo || 'Unassigned',
      'Tags': Array.isArray(task.tags) ? task.tags.join(', ') : 'None',
      'Created': task.createdAt ? ef.formatDate(task.createdAt, 'long') : '',
      'Updated': task.updatedAt ? ef.formatDate(task.updatedAt, 'long') : ''
    }),
    { title: 'Task Details', width: 65 }
  );
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

let globalManager = null;

/**
 * Get or create global output manager
 */
export function getOutputManager(options = {}) {
  if (!globalManager || Object.keys(options).length > 0) {
    globalManager = new OutputManager(options);
  }
  return globalManager;
}

/**
 * Configure global output manager
 */
export function configureOutput(options = {}) {
  globalManager = new OutputManager(options);
  return globalManager;
}

/**
 * Quick format function
 */
export function format(data, formatType, options = {}) {
  const manager = getOutputManager();
  return manager.formatData(data, formatType, options);
}

/**
 * Quick render function
 */
export function render(data, formatType, options = {}) {
  const manager = getOutputManager();
  return manager.render(data, formatType, options);
}

// Default export
export default {
  OutputManager,
  getOutputManager,
  configureOutput,
  format,
  render,
  formatAgentStatus,
  formatAgentList,
  formatIssueList,
  formatCostSummary,
  formatApprovalList,
  formatTaskOutput
};
