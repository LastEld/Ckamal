/**
 * Enhanced Output Formatters for Ckamal CLI
 * Provides comprehensive formatting options: table, JSON, YAML, CSV, tree, progress bars, spinners
 */

import { EOL } from 'os';

// ============================================================================
// COLOR THEMES
// ============================================================================

const THEMES = {
  default: {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m'
  },
  minimal: {
    reset: '',
    bright: '',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '',
    reverse: '',
    hidden: '',
    black: '',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '',
    cyan: '\x1b[36m',
    white: '',
    bgBlack: '',
    bgRed: '',
    bgGreen: '',
    bgYellow: '',
    bgBlue: '',
    bgMagenta: '',
    bgCyan: '',
    bgWhite: ''
  },
  nocolor: {
    reset: '',
    bright: '',
    dim: '',
    underscore: '',
    blink: '',
    reverse: '',
    hidden: '',
    black: '',
    red: '',
    green: '',
    yellow: '',
    blue: '',
    magenta: '',
    cyan: '',
    white: '',
    bgBlack: '',
    bgRed: '',
    bgGreen: '',
    bgYellow: '',
    bgBlue: '',
    bgMagenta: '',
    bgCyan: '',
    bgWhite: ''
  }
};

// ============================================================================
// TERMINAL CAPABILITY DETECTION
// ============================================================================

let currentTheme = 'default';
let forceColor = null;

/**
 * Detect if terminal supports colors
 */
export function supportsColor() {
  if (forceColor !== null) return forceColor;
  if (process.env.FORCE_COLOR === '0' || process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (!process.stdout.isTTY) return false;
  if (process.env.TERM === 'dumb') return false;
  if (process.platform === 'win32') {
    return process.env.TERM_PROGRAM === 'vscode' || 
           process.env.WT_SESSION || 
           process.env.TERM === 'xterm-256color';
  }
  return true;
}

/**
 * Check if output is being piped
 */
export function isPiped() {
  return !process.stdout.isTTY;
}

/**
 * Get terminal width
 */
export function getTerminalWidth() {
  return process.stdout.columns || 80;
}

/**
 * Get terminal height
 */
export function getTerminalHeight() {
  return process.stdout.rows || 24;
}

/**
 * Set color theme
 */
export function setTheme(theme) {
  if (THEMES[theme]) {
    currentTheme = theme;
    if (theme === 'nocolor') {
      forceColor = false;
    }
  }
}

/**
 * Force color output on/off
 */
export function setForceColor(enabled) {
  forceColor = enabled;
}

/**
 * Get current color
 */
function _color(colorName) {
  if (!supportsColor()) return '';
  return THEMES[currentTheme][colorName] || '';
}

/**
 * Colorize text
 */
export function colorize(text, colorName) {
  if (!supportsColor() || currentTheme === 'nocolor') return text;
  const colorCode = THEMES[currentTheme][colorName] || '';
  const resetCode = THEMES[currentTheme].reset;
  return `${colorCode}${text}${resetCode}`;
}

// ============================================================================
// TABLE FORMATTER
// ============================================================================

/**
 * Format data as a table
 * @param {Array} data - Array of objects to display
 * @param {Object} options - Formatting options
 * @returns {string} Formatted table
 */
export function table(data, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    return colorize('No data available', 'dim');
  }

  const {
    columns = Object.keys(data[0]),
    columnWidths = {},
    showHeader = true,
    border = true,
    align = {}, // 'left', 'right', 'center' per column
    maxWidth = getTerminalWidth() - 4,
    truncate = true,
    wordWrap = false,
    style = 'unicode' // 'unicode', 'ascii', 'compact'
  } = options;

  const chars = {
    unicode: {
      topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
      horizontal: '─', vertical: '│',
      topJoin: '┬', bottomJoin: '┴', leftJoin: '├', rightJoin: '┤', cross: '┼'
    },
    ascii: {
      topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+',
      horizontal: '-', vertical: '|',
      topJoin: '+', bottomJoin: '+', leftJoin: '+', rightJoin: '+', cross: '+'
    },
    compact: {
      topLeft: '', topRight: '', bottomLeft: '', bottomRight: '',
      horizontal: '', vertical: ' ',
      topJoin: '', bottomJoin: '', leftJoin: '', rightJoin: '', cross: ''
    }
  }[style];

  // Calculate column widths
  const widths = {};
  let totalWidth = 0;
  
  columns.forEach(col => {
    const headerLen = String(col).length;
    const maxDataLen = Math.max(...data.map(row => String(row[col] ?? '').length));
    const minWidth = Math.max(headerLen, maxDataLen, columnWidths[col] || 0);
    widths[col] = minWidth + 2; // padding
    totalWidth += widths[col];
  });

  // Adjust widths if total exceeds maxWidth
  if (truncate && totalWidth > maxWidth && columns.length > 1) {
    const excess = totalWidth - maxWidth;
    const avgReduction = Math.floor(excess / columns.length);
    columns.forEach(col => {
      widths[col] = Math.max(3, widths[col] - avgReduction);
    });
  }

  // Helper to truncate/pad text
  const formatCell = (text, width, alignment = 'left') => {
    const str = String(text ?? '');
    if (str.length > width - 2) {
      return ' ' + str.substring(0, width - 5) + '...';
    }
    const padding = width - 2 - str.length;
    if (alignment === 'right') {
      return ' '.repeat(padding + 1) + str + ' ';
    } else if (alignment === 'center') {
      const left = Math.floor(padding / 2);
      const right = padding - left;
      return ' '.repeat(left + 1) + str + ' '.repeat(right + 1);
    }
    return ' ' + str.padEnd(width - 2) + ' ';
  };

  // Build table
  let output = '';
  
  // Top border
  if (border && style !== 'compact') {
    output += chars.topLeft + columns.map(col => chars.horizontal.repeat(widths[col])).join(chars.topJoin) + chars.topRight + '\n';
  }

  // Header
  if (showHeader) {
    output += chars.vertical + columns.map(col => {
      const text = formatCell(col, widths[col], align[col] || 'left');
      return text.replace(String(col).padEnd(widths[col] - 2), colorize(String(col).padEnd(widths[col] - 2), 'bright'));
    }).join(chars.vertical) + chars.vertical + '\n';
    
    if (border && style !== 'compact') {
      output += chars.leftJoin + columns.map(col => chars.horizontal.repeat(widths[col])).join(chars.cross) + chars.rightJoin + '\n';
    }
  }

  // Data rows
  data.forEach((row) => {
    output += chars.vertical + columns.map(col => {
      const value = row[col] ?? '';
      return formatCell(value, widths[col], align[col] || 'left');
    }).join(chars.vertical) + chars.vertical + '\n';
  });

  // Bottom border
  if (border && style !== 'compact') {
    output += chars.bottomLeft + columns.map(col => chars.horizontal.repeat(widths[col])).join(chars.bottomJoin) + chars.bottomRight;
  }

  return output.trimEnd();
}

// ============================================================================
// JSON FORMATTER
// ============================================================================

/**
 * Format data as JSON
 * @param {*} data - Data to format
 * @param {Object} options - Formatting options
 * @returns {string} JSON string
 */
export function json(data, options = {}) {
  const {
    pretty = true,
    indent = 2,
    sortKeys = false,
    includeColor = supportsColor()
  } = options;

  let output;
  if (pretty) {
    const replacer = sortKeys ? (key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((sorted, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
      }
      return value;
    } : null;
    output = JSON.stringify(data, replacer, indent);
  } else {
    output = JSON.stringify(data);
  }

  if (includeColor && pretty && supportsColor()) {
    output = output
      .replace(/"(\w+)":/g, (match, p1) => colorize('"' + p1 + '"', 'yellow') + ':')
      .replace(/: "([^"]*)"/g, (match, p1) => ': ' + colorize('"' + p1 + '"', 'green'))
      .replace(/: (true|false|null)/g, (match, p1) => ': ' + colorize(p1, 'cyan'))
      .replace(/: (\d+\.?\d*)/g, (match, p1) => ': ' + colorize(p1, 'magenta'));
  }

  return output;
}

// ============================================================================
// YAML FORMATTER
// ============================================================================

/**
 * Format data as YAML
 * @param {*} data - Data to format
 * @param {Object} options - Formatting options
 * @returns {string} YAML string
 */
export function yaml(data, options = {}) {
  const { indent = 2, maxDepth = 10 } = options;
  
  function convert(obj, level = 0) {
    if (level > maxDepth) return '...';
    
    const spaces = ' '.repeat(level * indent);
    
    if (obj === null) return 'null';
    if (obj === undefined) return '';
    if (typeof obj === 'boolean') return obj ? 'true' : 'false';
    if (typeof obj === 'number') return String(obj);
    if (typeof obj === 'string') {
      if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
        return `|${EOL}${obj.split('\n').map(l => spaces + '  ' + l).join(EOL)}`;
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return obj.map(item => {
        if (typeof item === 'object' && item !== null) {
          return `${spaces}- ${convert(item, level + 1).trimStart()}`;
        }
        return `${spaces}- ${convert(item, 0)}`;
      }).join(EOL);
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      return keys.map(key => {
        const value = obj[key];
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `${spaces}${key}:${EOL}${convert(value, level + 1)}`;
        }
        if (Array.isArray(value)) {
          return `${spaces}${key}:${EOL}${convert(value, level + 1)}`;
        }
        return `${spaces}${key}: ${convert(value, 0)}`;
      }).join(EOL);
    }
    return String(obj);
  }

  return convert(data);
}

// ============================================================================
// CSV FORMATTER
// ============================================================================

/**
 * Format data as CSV
 * @param {Array} data - Array of objects to format
 * @param {Object} options - Formatting options
 * @returns {string} CSV string
 */
export function csv(data, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const {
    columns = Object.keys(data[0]),
    delimiter = ',',
    header = true,
    quote = '"',
    lineEnding = EOL
  } = options;

  function escapeField(field) {
    const str = String(field ?? '');
    if (str.includes(delimiter) || str.includes(quote) || str.includes('\n') || str.includes('\r')) {
      return quote + str.replace(new RegExp(quote, 'g'), quote + quote) + quote;
    }
    return str;
  }

  let output = '';
  
  if (header) {
    output += columns.map(escapeField).join(delimiter) + lineEnding;
  }
  
  data.forEach(row => {
    output += columns.map(col => escapeField(row[col])).join(delimiter) + lineEnding;
  });

  return output.trimEnd();
}

// ============================================================================
// TREE FORMATTER
// ============================================================================

/**
 * Format hierarchical data as a tree
 * @param {*} data - Data to format (object or array)
 * @param {Object} options - Formatting options
 * @returns {string} Tree string
 */
export function tree(data, options = {}) {
  const {
    indent = 0,
    prefix: _prefix = '',
    showValues = true,
    maxDepth = 10,
    branchChar = '├── ',
    lastBranchChar = '└── ',
    verticalChar = '│   ',
    emptyChar = '    '
  } = options;

  function renderNode(node, level = 0, isLast = true, prefix = '') {
    if (level > maxDepth) return '';
    
    // const indentStr = prefix + (isLast ? lastBranchChar : branchChar);
    const childPrefix = prefix + (isLast ? emptyChar : verticalChar);
    
    if (Array.isArray(node)) {
      if (node.length === 0) return prefix + (isLast ? lastBranchChar : branchChar) + '[]';
      return node.map((item, idx) => {
        const isLastItem = idx === node.length - 1;
        if (typeof item === 'object' && item !== null) {
          return renderNode(item, level + 1, isLastItem, childPrefix);
        }
        return childPrefix + (isLastItem ? lastBranchChar : branchChar) + String(item);
      }).join('\n');
    }
    
    if (typeof node === 'object' && node !== null) {
      const keys = Object.keys(node);
      if (keys.length === 0) return prefix + (isLast ? lastBranchChar : branchChar) + '{}';
      
      return keys.map((key, idx) => {
        const isLastKey = idx === keys.length - 1;
        const value = node[key];
        const keyStr = colorize(key, 'cyan');
        
        if (typeof value === 'object' && value !== null) {
          const header = (level === 0 ? '' : childPrefix) + (isLastKey ? lastBranchChar : branchChar) + keyStr;
          const children = renderNode(value, level + 1, isLastKey, childPrefix + (isLastKey ? emptyChar : verticalChar));
          return header + (children ? '\n' + children : '');
        }
        
        const valueStr = showValues ? ': ' + colorize(String(value), 'green') : '';
        return childPrefix + (isLastKey ? lastBranchChar : branchChar) + keyStr + valueStr;
      }).join('\n');
    }
    
    return prefix + (isLast ? lastBranchChar : branchChar) + String(node);
  }

  if (Array.isArray(data)) {
    return data.map((item, idx) => renderNode(item, 0, idx === data.length - 1, ' '.repeat(indent))).join('\n');
  }
  
  return renderNode(data, 0, true, ' '.repeat(indent));
}

// ============================================================================
// PROGRESS BAR
// ============================================================================

/**
 * Create a progress bar
 * @param {number} current - Current progress
 * @param {number} total - Total amount
 * @param {Object} options - Display options
 * @returns {string} Progress bar string
 */
export function progressBar(current, total, options = {}) {
  const {
    width = 30,
    filled = '█',
    empty = '░',
    showPercent = true,
    showCount = true,
    showEta = false,
    startTime = null,
    label = ''
  } = options;

  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const filledLen = Math.round((width * percent) / 100);
  const emptyLen = width - filledLen;

  let bar = colorize(filled.repeat(filledLen), 'green') + colorize(empty.repeat(emptyLen), 'dim');
  
  let result = label ? `${label} ` : '';
  result += `[${bar}]`;
  if (showPercent) result += ` ${percent}%`;
  if (showCount) result += ` (${current}/${total})`;
  
  if (showEta && startTime && current > 0 && current < total) {
    const elapsed = Date.now() - startTime;
    const rate = current / elapsed;
    const remaining = (total - current) / rate;
    result += ` ETA: ${formatDuration(remaining)}`;
  }

  return result;
}

/**
 * Create a multi-line progress bar for multiple tasks
 */
export function multiProgress(bars, options = {}) {
  return bars.map(bar => {
    const { current, total, label } = bar;
    return progressBar(current, total, { ...options, label });
  }).join('\n');
}

// ============================================================================
// SPINNER
// ============================================================================

const SPINNER_FRAMES = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['-', '\\', '|', '/'],
  pulse: ['◐', '◓', '◑', '◒'],
  star: ['✶', '✸', '✹', '✺', '✹', '✷'],
  arrow: ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'],
  bounce: ['( ●    )', '(  ●   )', '(   ●  )', '(    ● )', '(     ●)', '(    ● )', '(   ●  )', '(  ●   )', '( ●    )', '(●     )']
};

// const SPINNER_COLORS = ['cyan', 'blue', 'magenta', 'yellow'];

/**
 * Create a spinner for loading states
 * @param {string} text - Text to display
 * @param {Object} options - Spinner options
 * @returns {Object} Spinner control object
 */
export function createSpinner(text, options = {}) {
  const {
    type = 'dots',
    interval = 80,
    color = 'cyan',
    clearOnDone = false
  } = options;

  let frameIndex = 0;
  let intervalId = null;
  let startTime = Date.now();
  const frames = SPINNER_FRAMES[type] || SPINNER_FRAMES.dots;

  const spinner = {
    _text: text,
    _status: 'pending',
    
    start(newText) {
      if (newText) this._text = newText;
      
      if (!supportsColor() || isPiped()) {
        console.log(`${this._text}...`);
        this._status = 'running';
        return this;
      }
      
      if (intervalId) return this;
      
      startTime = Date.now();
      this._status = 'running';
      
      // Clear line and hide cursor
      process.stdout.write('\x1b[?25l');
      
      intervalId = setInterval(() => {
        const frame = frames[frameIndex];
        const coloredFrame = colorize(frame, color);
        const elapsed = formatDuration(Date.now() - startTime);
        process.stdout.write(`\r\x1b[K${coloredFrame} ${this._text} ${colorize(elapsed, 'dim')}`);
        frameIndex = (frameIndex + 1) % frames.length;
      }, interval);
      
      return this;
    },

    stop(finalText, statusType = 'success') {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      
      if (!supportsColor() || isPiped()) {
        if (finalText) console.log(status(statusType, finalText));
        this._status = 'stopped';
        return this;
      }
      
      // Clear line and show cursor
      process.stdout.write('\r\x1b[K\x1b[?25h');
      
      if (finalText && !clearOnDone) {
        console.log(status(statusType, finalText));
      }
      
      this._status = 'stopped';
      return this;
    },

    succeed(text) {
      return this.stop(text || this._text, 'success');
    },

    fail(text) {
      return this.stop(text || this._text, 'error');
    },

    warn(text) {
      return this.stop(text || this._text, 'warning');
    },

    info(text) {
      return this.stop(text || this._text, 'info');
    },

    update(text) {
      this._text = text;
      return this;
    },

    getStatus() {
      return this._status;
    }
  };

  return spinner;
}

// ============================================================================
// STATUS INDICATORS
// ============================================================================

const STATUS_ICONS = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  pending: '⏳',
  running: '▶',
  waiting: '○',
  skipped: '⊘',
  question: '?'
};

const STATUS_COLORS = {
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue',
  pending: 'cyan',
  running: 'cyan',
  waiting: 'dim',
  skipped: 'dim',
  question: 'magenta'
};

/**
 * Create a status indicator
 * @param {string} state - Status state
 * @param {string} text - Status text
 * @returns {string} Formatted status
 */
export function status(state, text) {
  const icon = STATUS_ICONS[state] || STATUS_ICONS.info;
  const colorName = STATUS_COLORS[state] || 'white';
  return `${colorize(icon, colorName)} ${text}`;
}

// ============================================================================
// UTILITY FORMATTERS
// ============================================================================

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${Math.floor(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format number with thousand separators
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format percentage
 */
export function formatPercent(value, decimals = 1) {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format date
 */
export function formatDate(date, format = 'iso') {
  const d = new Date(date);
  switch (format) {
    case 'iso':
      return d.toISOString();
    case 'short':
      return d.toLocaleDateString();
    case 'long':
      return d.toLocaleString();
    case 'relative':
      const diff = Date.now() - d.getTime();
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    default:
      return d.toISOString();
  }
}

// ============================================================================
// HEADER AND SECTION FORMATTERS
// ============================================================================

/**
 * Create a styled header
 */
export function header(text, style = 'default') {
  const width = Math.min(60, getTerminalWidth() - 4);
  const padding = Math.max(0, (width - text.length) / 2);
  const leftPad = ' '.repeat(Math.floor(padding));
  const rightPad = ' '.repeat(Math.ceil(padding));
  
  switch (style) {
    case 'box':
      const line = '═'.repeat(width);
      return `
${colorize('╔' + line + '╗', 'cyan')}
${colorize('║' + leftPad + colorize(text, 'bright') + rightPad + '║', 'cyan')}
${colorize('╚' + line + '╝', 'cyan')}`;
    case 'line':
      return `
${colorize('─'.repeat(width), 'dim')}
${colorize(text, 'bright')}
${colorize('─'.repeat(width), 'dim')}`;
    case 'double':
      return `
${colorize('═'.repeat(width), 'cyan')}
${colorize(text, 'bright')}
${colorize('═'.repeat(width), 'cyan')}`;
    case 'thick':
      return `
${colorize('━'.repeat(width), 'cyan')}
${colorize(text, 'bright')}
${colorize('━'.repeat(width), 'cyan')}`;
    default:
      return `
${colorize(text, 'bright')}
${colorize('─'.repeat(text.length), 'dim')}`;
  }
}

/**
 * Create a section divider
 */
export function divider(char = '─', width = null) {
  const w = width || Math.min(60, getTerminalWidth() - 4);
  return colorize(char.repeat(w), 'dim');
}

/**
 * Create a box around content
 */
export function box(content, options = {}) {
  const { title, width = 60, padding = 1 } = options;
  const lines = content.split('\n');
  const innerWidth = width - 2 - (padding * 2);
  
  let output = colorize('┌' + '─'.repeat(width - 2) + '┐', 'cyan') + '\n';
  
  if (title) {
    const titlePadding = (innerWidth - title.length) / 2;
    output += colorize('│', 'cyan') + 
              ' '.repeat(Math.floor(titlePadding) + padding) +
              colorize(title, 'bright') +
              ' '.repeat(Math.ceil(titlePadding) + padding) +
              colorize('│', 'cyan') + '\n';
    output += colorize('├' + '─'.repeat(width - 2) + '┤', 'cyan') + '\n';
  }

  lines.forEach(line => {
    const padded = line.padEnd(innerWidth);
    output += colorize('│', 'cyan') + ' '.repeat(padding) + padded + ' '.repeat(padding) + colorize('│', 'cyan') + '\n';
  });

  output += colorize('└' + '─'.repeat(width - 2) + '┘', 'cyan');
  
  return output;
}

/**
 * Format key-value pairs
 */
export function keyValue(pairs, options = {}) {
  const { indent = 0, separator = ':', align = true, keyColor = 'cyan', valueColor = null } = options;
  const indentStr = ' '.repeat(indent);
  
  const keys = Object.keys(pairs);
  const maxKeyLen = align ? Math.max(...keys.map(k => k.length)) : 0;
  
  return keys.map(key => {
    const paddedKey = align ? key.padEnd(maxKeyLen) : key;
    const formattedKey = colorize(paddedKey, keyColor);
    let value = pairs[key];
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    }
    const formattedValue = valueColor ? colorize(String(value), valueColor) : String(value);
    return `${indentStr}${formattedKey} ${separator} ${formattedValue}`;
  }).join('\n');
}

/**
 * Create a list
 */
export function list(items, options = {}) {
  const { indent = 0, bullet = '•', numbered = false, color: bulletColor = 'cyan' } = options;
  const indentStr = ' '.repeat(indent);
  
  return items.map((item, idx) => {
    const prefix = numbered ? `${idx + 1}.` : bullet;
    const text = typeof item === 'object' ? JSON.stringify(item) : String(item);
    return `${indentStr}${colorize(prefix, bulletColor)} ${text}`;
  }).join('\n');
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export function success(text) {
  return status('success', text);
}

export function error(text) {
  return status('error', text);
}

export function warning(text) {
  return status('warning', text);
}

export function info(text) {
  return status('info', text);
}

// Default export
export default {
  // Themes
  setTheme,
  setForceColor,
  supportsColor,
  isPiped,
  getTerminalWidth,
  getTerminalHeight,
  colorize,
  
  // Formatters
  table,
  json,
  yaml,
  csv,
  tree,
  
  // Progress & Status
  progressBar,
  multiProgress,
  createSpinner,
  status,
  
  // Utilities
  formatDuration,
  formatBytes,
  formatNumber,
  formatPercent,
  formatDate,
  
  // Layout
  header,
  divider,
  box,
  keyValue,
  list,
  
  // Convenience
  success,
  error,
  warning,
  info
};
