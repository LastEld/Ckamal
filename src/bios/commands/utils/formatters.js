/**
 * Output Formatters for CLI
 * Provides colors, tables, progress bars, and spinners
 */

// ANSI Color Codes
const COLORS = {
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
};

// Check if colors are supported
const supportsColor = () => {
  return process.env.FORCE_COLOR !== '0' && 
         process.stdout.isTTY && 
         !process.env.NO_COLOR;
};

/**
 * Colorize text
 */
export function colorize(text, color) {
  if (!supportsColor()) return text;
  const colorCode = COLORS[color] || COLORS.reset;
  return `${colorCode}${text}${COLORS.reset}`;
}

/**
 * Create a styled header
 */
export function header(text, style = 'default') {
  const width = 60;
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
      return `\n${colorize('─'.repeat(width), 'dim')}\n${colorize(text, 'bright')}\n${colorize('─'.repeat(width), 'dim')}`;
    case 'double':
      return `\n${colorize('═'.repeat(width), 'cyan')}\n${colorize(text, 'bright')}\n${colorize('═'.repeat(width), 'cyan')}`;
    default:
      return `\n${colorize(text, 'bright')}\n${colorize('─'.repeat(text.length), 'dim')}`;
  }
}

/**
 * Create a table from data
 */
export function table(data, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    return colorize('No data available', 'dim');
  }

  const {
    columns = Object.keys(data[0]),
    columnWidths = {},
    showHeader = true,
    border = true
  } = options;

  // Calculate column widths
  const widths = {};
  columns.forEach(col => {
    const headerLen = col.length;
    const maxDataLen = Math.max(...data.map(row => String(row[col] ?? '').length));
    widths[col] = Math.max(headerLen, maxDataLen, columnWidths[col] || 0) + 2;
  });

  // Build table
  let output = '';
  
  // Top border
  if (border) {
    output += '┌' + columns.map(col => '─'.repeat(widths[col])).join('┬') + '┐\n';
  }

  // Header
  if (showHeader) {
    output += '│' + columns.map(col => {
      const text = String(col).padEnd(widths[col] - 1);
      return colorize(' ' + text, 'bright');
    }).join('│') + '│\n';
    
    if (border) {
      output += '├' + columns.map(col => '─'.repeat(widths[col])).join('┼') + '┤\n';
    }
  }

  // Data rows
  data.forEach((row, idx) => {
    output += '│' + columns.map(col => {
      const value = String(row[col] ?? '');
      const padded = ' ' + value.padEnd(widths[col] - 1);
      return padded;
    }).join('│') + '│\n';
  });

  // Bottom border
  if (border) {
    output += '└' + columns.map(col => '─'.repeat(widths[col])).join('┴') + '┘';
  }

  return output;
}

/**
 * Create a list
 */
export function list(items, options = {}) {
  const { indent = 0, bullet = '•', numbered = false } = options;
  const indentStr = ' '.repeat(indent);
  
  return items.map((item, idx) => {
    const prefix = numbered ? `${idx + 1}.` : bullet;
    const text = typeof item === 'object' ? JSON.stringify(item) : String(item);
    return `${indentStr}${colorize(prefix, 'cyan')} ${text}`;
  }).join('\n');
}

/**
 * Progress bar
 */
export function progressBar(current, total, options = {}) {
  const {
    width = 30,
    filled = '█',
    empty = '░',
    showPercent = true,
    showCount = true
  } = options;

  const percent = Math.min(100, Math.round((current / total) * 100));
  const filledLen = Math.round((width * percent) / 100);
  const emptyLen = width - filledLen;

  let bar = colorize(filled.repeat(filledLen), 'green') + colorize(empty.repeat(emptyLen), 'dim');
  
  let result = `[${bar}]`;
  if (showPercent) result += ` ${percent}%`;
  if (showCount) result += ` (${current}/${total})`;

  return result;
}

/**
 * Status indicator
 */
export function status(state, text) {
  const icons = {
    success: colorize('✓', 'green'),
    error: colorize('✗', 'red'),
    warning: colorize('⚠', 'yellow'),
    info: colorize('ℹ', 'blue'),
    pending: colorize('⏳', 'cyan'),
    running: colorize('▶', 'cyan'),
    waiting: colorize('○', 'dim'),
    skipped: colorize('⊘', 'dim')
  };

  const icon = icons[state] || icons.info;
  return `${icon} ${text}`;
}

/**
 * Spinner animation frames
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Create a spinner
 */
export function createSpinner(text) {
  let frameIndex = 0;
  let interval = null;

  const spinner = {
    start() {
      if (!supportsColor()) {
        console.log(`${text}...`);
        return this;
      }
      
      process.stdout.write('\n');
      interval = setInterval(() => {
        const frame = SPINNER_FRAMES[frameIndex];
        process.stdout.write(`\r${colorize(frame, 'cyan')} ${text}`);
        frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
      }, 80);
      return this;
    },

    stop(finalText, statusType = 'success') {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      process.stdout.write('\r' + ' '.repeat(text.length + 5) + '\r');
      console.log(status(statusType, finalText || text));
      return this;
    },

    succeed(text) {
      return this.stop(text, 'success');
    },

    fail(text) {
      return this.stop(text, 'error');
    },

    warn(text) {
      return this.stop(text, 'warning');
    }
  };

  return spinner;
}

/**
 * Tree view
 */
export function tree(items, options = {}) {
  const { indent = 0, prefix = '' } = options;
  let output = '';

  items.forEach((item, idx) => {
    const isLast = idx === items.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (typeof item === 'object' && item.children) {
      output += ' '.repeat(indent) + colorize(connector, 'dim') + item.label + '\n';
      output += tree(item.children, { indent: indent + 4, prefix: childPrefix });
    } else {
      const label = typeof item === 'object' ? item.label : item;
      output += ' '.repeat(indent) + colorize(connector, 'dim') + label + '\n';
    }
  });

  return output;
}

/**
 * Section divider
 */
export function divider(char = '─', width = 60) {
  return colorize(char.repeat(width), 'dim');
}

/**
 * JSON formatter
 */
export function json(data, pretty = true) {
  if (pretty) {
    return JSON.stringify(data, null, 2)
      .replace(/"(\w+)":/g, `${colorize('"$1"', 'yellow')}:`)
      .replace(/: "([^"]*)"/g, `: ${colorize('"$1"', 'green')}`)
      .replace(/: (true|false|null|\d+)/g, `: ${colorize('$1', 'cyan')}`);
  }
  return JSON.stringify(data);
}

/**
 * Key-value pairs
 */
export function keyValue(pairs, options = {}) {
  const { indent = 0, separator = ':', align = true } = options;
  const indentStr = ' '.repeat(indent);
  
  const maxKeyLen = Math.max(...Object.keys(pairs).map(k => k.length));
  
  return Object.entries(pairs).map(([key, value]) => {
    const paddedKey = align ? key.padEnd(maxKeyLen) : key;
    const formattedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `${indentStr}${colorize(paddedKey, 'cyan')} ${separator} ${formattedValue}`;
  }).join('\n');
}

/**
 * Box with content
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
 * Format duration
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Format bytes
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Success message
 */
export function success(text) {
  return status('success', text);
}

/**
 * Error message
 */
export function error(text) {
  return status('error', text);
}

/**
 * Warning message
 */
export function warning(text) {
  return status('warning', text);
}

/**
 * Info message
 */
export function info(text) {
  return status('info', text);
}

export default {
  colorize,
  header,
  table,
  list,
  progressBar,
  status,
  createSpinner,
  tree,
  divider,
  json,
  keyValue,
  box,
  formatDuration,
  formatBytes,
  success,
  error,
  warning,
  info
};
