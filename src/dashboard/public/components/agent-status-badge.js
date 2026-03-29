/**
 * CogniMesh v5.0 - Agent Status Badge Component
 * Status badges with animated pulse, color coding, and tooltips
 */

const statusBadgeWindow = typeof window !== 'undefined' ? window : globalThis;

/**
 * Status badge configuration with colors, icons, and animations
 */
const STATUS_CONFIG = {
  online: {
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    icon: 'check-circle',
    label: 'Online',
    description: 'Agent is active and ready',
    pulse: true,
  },
  offline: {
    color: '#64748b',
    bgColor: 'rgba(100, 116, 139, 0.15)',
    borderColor: 'rgba(100, 116, 139, 0.3)',
    icon: 'power',
    label: 'Offline',
    description: 'Agent is not running',
    pulse: false,
  },
  busy: {
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    icon: 'loader',
    label: 'Busy',
    description: 'Agent is processing a task',
    pulse: true,
  },
  error: {
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    icon: 'alert-circle',
    label: 'Error',
    description: 'Agent encountered an error',
    pulse: false,
  },
  paused: {
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: 'rgba(139, 92, 246, 0.3)',
    icon: 'pause-circle',
    label: 'Paused',
    description: 'Agent is temporarily paused',
    pulse: false,
  },
  unknown: {
    color: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.15)',
    borderColor: 'rgba(148, 163, 184, 0.3)',
    icon: 'help-circle',
    label: 'Unknown',
    description: 'Agent status is unknown',
    pulse: false,
  },
};

/**
 * Agent Status Badge Component
 * Renders a status badge with optional pulse animation and tooltip
 */
class AgentStatusBadge {
  /**
   * @param {Object} options
   * @param {string} options.status - Agent status (online, offline, busy, error, paused)
   * @param {string} [options.size='md'] - Badge size (sm, md, lg)
   * @param {boolean} [options.showLabel=true] - Show status label
   * @param {boolean} [options.showIcon=true] - Show status icon
   * @param {boolean} [options.pulse=true] - Enable pulse animation for active states
   * @param {boolean} [options.tooltip=true] - Enable tooltip on hover
   * @param {string} [options.customText] - Override status label text
   * @param {string} [options.customDescription] - Override tooltip description
   */
  constructor(options = {}) {
    this.status = options.status || 'unknown';
    this.size = options.size || 'md';
    this.showLabel = options.showLabel !== false;
    this.showIcon = options.showIcon !== false;
    this.pulse = options.pulse !== false;
    this.tooltip = options.tooltip !== false;
    this.customText = options.customText || null;
    this.customDescription = options.customDescription || null;

    this.config = STATUS_CONFIG[this.status] || STATUS_CONFIG.unknown;
  }

  /**
   * Get size-based styles
   */
  getSizeStyles() {
    const sizes = {
      sm: { fontSize: '0.75rem', padding: '0.125rem 0.5rem', iconSize: 12, dotSize: 6 },
      md: { fontSize: '0.875rem', padding: '0.25rem 0.75rem', iconSize: 14, dotSize: 8 },
      lg: { fontSize: '1rem', padding: '0.375rem 1rem', iconSize: 16, dotSize: 10 },
    };
    return sizes[this.size] || sizes.md;
  }

  /**
   * Render the status badge as HTML string
   */
  render() {
    const styles = this.getSizeStyles();
    const config = this.config;
    const label = this.customText || config.label;
    const description = this.customDescription || config.description;

    const pulseHtml = this.pulse && config.pulse
      ? `<span class="status-pulse-ring" style="
          position: absolute;
          width: ${styles.dotSize}px;
          height: ${styles.dotSize}px;
          border-radius: 50%;
          background-color: ${config.color};
          animation: statusPulse 2s ease-out infinite;
        "></span>`
      : '';

    const iconHtml = this.showIcon
      ? `<i data-lucide="${config.icon}" style="
          width: ${styles.iconSize}px;
          height: ${styles.iconSize}px;
          flex-shrink: 0;
        "></i>`
      : '';

    const labelHtml = this.showLabel
      ? `<span class="status-label">${label}</span>`
      : '';

    const tooltipAttrs = this.tooltip
      ? `data-tooltip="${description}" data-tooltip-position="top"`
      : '';

    return `
      <div class="agent-status-badge ${this.status}" 
           ${tooltipAttrs}
           style="
             display: inline-flex;
             align-items: center;
             gap: 0.375rem;
             padding: ${styles.padding};
             font-size: ${styles.fontSize};
             font-weight: 500;
             color: ${config.color};
             background-color: ${config.bgColor};
             border: 1px solid ${config.borderColor};
             border-radius: 9999px;
             position: relative;
             cursor: ${this.tooltip ? 'help' : 'default'};
             user-select: none;
           ">
        <span class="status-dot-wrapper" style="
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${styles.dotSize}px;
          height: ${styles.dotSize}px;
        ">
          ${pulseHtml}
          <span class="status-dot" style="
            width: ${styles.dotSize}px;
            height: ${styles.dotSize}px;
            border-radius: 50%;
            background-color: ${config.color};
            position: relative;
            z-index: 1;
          "></span>
        </span>
        ${iconHtml}
        ${labelHtml}
      </div>
    `;
  }

  /**
   * Render as a DOM element
   */
  renderElement() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = this.render();
    return wrapper.firstElementChild;
  }

  /**
   * Static method to render a status badge quickly
   */
  static render(status, options = {}) {
    const badge = new AgentStatusBadge({ status, ...options });
    return badge.render();
  }

  /**
   * Get CSS animations for status badges
   */
  static getStyles() {
    return `
      @keyframes statusPulse {
        0% {
          transform: scale(1);
          opacity: 0.8;
        }
        50% {
          transform: scale(2.5);
          opacity: 0;
        }
        100% {
          transform: scale(1);
          opacity: 0;
        }
      }

      .agent-status-badge {
        transition: all 0.2s ease;
      }

      .agent-status-badge:hover {
        filter: brightness(1.1);
      }

      [data-tooltip] {
        position: relative;
      }

      [data-tooltip]::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%) translateY(-8px);
        padding: 0.5rem 0.75rem;
        background-color: var(--color-bg-elevated, #1e293b);
        color: var(--color-text-primary, #f8fafc);
        font-size: 0.75rem;
        font-weight: 400;
        white-space: nowrap;
        border-radius: 0.5rem;
        border: 1px solid var(--color-border, #334155);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease;
        z-index: 1000;
        pointer-events: none;
      }

      [data-tooltip]:hover::after {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) translateY(-4px);
      }

      [data-tooltip-position="bottom"]::after {
        bottom: auto;
        top: 100%;
        transform: translateX(-50%) translateY(8px);
      }

      [data-tooltip-position="bottom"]:hover::after {
        transform: translateX(-50%) translateY(4px);
      }
    `;
  }

  /**
   * Inject required styles into document
   */
  static injectStyles() {
    if (document.getElementById('agent-status-badge-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'agent-status-badge-styles';
    styleEl.textContent = AgentStatusBadge.getStyles();
    document.head.appendChild(styleEl);
  }
}

/**
 * Agent Status Dot - Minimal status indicator
 */
class AgentStatusDot {
  constructor(options = {}) {
    this.status = options.status || 'unknown';
    this.size = options.size || 8;
    this.pulse = options.pulse !== false;
    this.tooltip = options.tooltip || null;

    this.config = STATUS_CONFIG[this.status] || STATUS_CONFIG.unknown;
  }

  render() {
    const config = this.config;
    const size = this.size;

    const pulseHtml = this.pulse && config.pulse
      ? `<span class="status-pulse-ring" style="
          position: absolute;
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background-color: ${config.color};
          animation: statusPulse 2s ease-out infinite;
        "></span>`
      : '';

    const tooltipAttrs = this.tooltip
      ? `data-tooltip="${this.tooltip}" data-tooltip-position="top"`
      : '';

    return `
      <span class="agent-status-dot ${this.status}" 
            ${tooltipAttrs}
            style="
              position: relative;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: ${size}px;
              height: ${size}px;
              cursor: ${this.tooltip ? 'help' : 'default'};
            ">
        ${pulseHtml}
        <span style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background-color: ${config.color};
          position: relative;
          z-index: 1;
        "></span>
      </span>
    `;
  }

  renderElement() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = this.render();
    return wrapper.firstElementChild;
  }

  static render(status, options = {}) {
    const dot = new AgentStatusDot({ status, ...options });
    return dot.render();
  }
}

// Inject styles on load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AgentStatusBadge.injectStyles());
  } else {
    AgentStatusBadge.injectStyles();
  }
}

if (typeof window !== 'undefined') {
  window.AgentStatusBadge = AgentStatusBadge;
  window.AgentStatusDot = AgentStatusDot;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AgentStatusBadge, AgentStatusDot, STATUS_CONFIG };
}
