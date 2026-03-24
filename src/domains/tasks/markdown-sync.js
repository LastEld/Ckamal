/**
 * @fileoverview Markdown Import/Export for Tasks
 * @module domains/tasks/markdown-sync
 */

/**
 * Markdown task block
 * @typedef {Object} MarkdownTaskBlock
 * @property {string} title - Task title
 * @property {string} [description] - Task description
 * @property {string} [status] - Task status
 * @property {string} [priority] - Task priority
 * @property {string} [dueDate] - Due date
 * @property {number} [estimatedMinutes] - Time estimate
 * @property {string[]} [tags] - Tags
 * @property {boolean} [urgent] - Urgent flag
 * @property {boolean} [important] - Important flag
 * @property {string} [body] - Additional markdown body
 */

/**
 * Export options
 * @typedef {Object} ExportOptions
 * @property {boolean} [includeMetadata=true] - Include YAML frontmatter
 * @property {boolean} [groupByQuadrant=false] - Group by Eisenhower quadrant
 * @property {boolean} [groupByStatus=false] - Group by status
 * @property {string} [title] - Document title
 * @property {string} [dateFormat='YYYY-MM-DD'] - Date format
 */

/**
 * Import options
 * @typedef {Object} ImportOptions
 * @property {boolean} [preserveIds=false] - Preserve original IDs
 * @property {string} [defaultStatus='backlog'] - Default status for new tasks
 * @property {string} [defaultPriority='medium'] - Default priority
 * @property {boolean} [skipInvalid=false] - Skip invalid tasks
 */

/**
 * Parse result
 * @typedef {Object} ParseResult
 * @property {MarkdownTaskBlock[]} tasks - Parsed tasks
 * @property {string[]} errors - Parse errors
 * @property {number} lineCount - Total lines processed
 */

/**
 * Markdown synchronization for tasks
 */
export class MarkdownSync {
  /**
   * @private
   * @type {RegExp}
   */
  #taskPattern = /^- \[([ x-])\] (.+)$/;

  /**
   * @private
   * @type {RegExp}
   */
  #metadataPattern = /^<!--\s*(\w+):\s*(.+?)\s*-->$/;

  /**
   * @private
   * @type {RegExp}
   */
  #frontmatterPattern = /^---\s*$/;

  /**
   * Create a new MarkdownSync instance
   */
  constructor() {
    // Empty constructor for future extensibility
  }

  /**
   * Parse task status from checkbox
   * @private
   * @param {string} checkbox - Checkbox content
   * @returns {string} Status
   */
  #parseStatus(checkbox) {
    switch (checkbox.trim()) {
      case 'x': return 'done';
      case '-': return 'in_progress';
      default: return 'backlog';
    }
  }

  /**
   * Format status as checkbox
   * @private
   * @param {string} status - Task status
   * @returns {string} Checkbox character
   */
  #formatStatus(status) {
    switch (status) {
      case 'done':
      case 'archived':
        return 'x';
      case 'in_progress':
      case 'review':
        return '-';
      default:
        return ' ';
    }
  }

  /**
   * Parse priority marker
   * @private
   * @param {string} text - Task text
   * @returns {{priority: string, text: string}}
   */
  #parsePriority(text) {
    const priorityMatch = text.match(/^(\[(?:!{1,3}|#(?:critical|high|medium|low))\])\s*/);
    if (!priorityMatch) {
      return { priority: undefined, text };
    }

    const marker = priorityMatch[1];
    const cleanText = text.substring(priorityMatch[0].length);

    let priority;
    if (marker.includes('critical') || marker === '[!!!]') priority = 'critical';
    else if (marker.includes('high') || marker === '[!!]') priority = 'high';
    else if (marker.includes('medium') || marker === '[!]') priority = 'medium';
    else if (marker.includes('low')) priority = 'low';

    return { priority, text: cleanText };
  }

  /**
   * Format priority marker
   * @private
   * @param {string} priority - Priority level
   * @returns {string} Priority marker
   */
  #formatPriority(priority) {
    const markers = {
      'critical': '[!!!]',
      'high': '[!!]',
      'medium': '[!]',
      'low': ''
    };
    return markers[priority] ?? '';
  }

  /**
   * Parse tags from text
   * @private
   * @param {string} text - Task text
   * @returns {{tags: string[], text: string}}
   */
  #parseTags(text) {
    const tagPattern = /#(\w+[-\w]*)/g;
    const tags = [];
    let match;

    while ((match = tagPattern.exec(text)) !== null) {
      tags.push(match[1]);
    }

    const cleanText = text.replace(tagPattern, '').trim().replace(/\s+/g, ' ');
    return { tags, text: cleanText };
  }

  /**
   * Format tags
   * @private
   * @param {string[]} tags - Tags array
   * @returns {string} Formatted tags
   */
  #formatTags(tags) {
    return tags.map(t => `#${t}`).join(' ');
  }

  /**
   * Parse due date
   * @private
   * @param {string} text - Task text
   * @returns {{dueDate: string|null, text: string}}
   */
  #parseDueDate(text) {
    const datePattern = /@due\((\d{4}-\d{2}-\d{2})\)/;
    const match = text.match(datePattern);
    
    if (!match) {
      return { dueDate: null, text };
    }

    return {
      dueDate: match[1],
      text: text.replace(datePattern, '').trim().replace(/\s+/g, ' ')
    };
  }

  /**
   * Format due date
   * @private
   * @param {string} dueDate - Due date
   * @returns {string} Formatted due date
   */
  #formatDueDate(dueDate) {
    return dueDate ? `@due(${dueDate})` : '';
  }

  /**
   * Parse time estimate
   * @private
   * @param {string} text - Task text
   * @returns {{estimatedMinutes: number|null, text: string}}
   */
  #parseTimeEstimate(text) {
    const timePattern = /@est\((\d+)m?\)/;
    const match = text.match(timePattern);
    
    if (!match) {
      return { estimatedMinutes: null, text };
    }

    return {
      estimatedMinutes: parseInt(match[1], 10),
      text: text.replace(timePattern, '').trim().replace(/\s+/g, ' ')
    };
  }

  /**
   * Format time estimate
   * @private
   * @param {number} minutes - Minutes
   * @returns {string} Formatted time
   */
  #formatTimeEstimate(minutes) {
    return minutes > 0 ? `@est(${minutes}m)` : '';
  }

  /**
   * Parse Eisenhower markers
   * @private
   * @param {string} text - Task text
   * @returns {{urgent: boolean, important: boolean, text: string}}
   */
  #parseEisenhower(text) {
    const urgent = text.includes('@urgent');
    const important = text.includes('@important');
    
    let cleanText = text
      .replace(/@urgent/g, '')
      .replace(/@important/g, '')
      .trim()
      .replace(/\s+/g, ' ');

    return { urgent, important, text: cleanText };
  }

  /**
   * Format Eisenhower markers
   * @private
   * @param {boolean} urgent - Urgent flag
   * @param {boolean} important - Important flag
   * @returns {string} Formatted markers
   */
  #formatEisenhower(urgent, important) {
    const markers = [];
    if (urgent) markers.push('@urgent');
    if (important) markers.push('@important');
    return markers.join(' ');
  }

  /**
   * Import tasks from markdown text
   * @param {string} markdown - Markdown content
   * @param {ImportOptions} [options] - Import options
   * @returns {ParseResult} Parse result
   */
  importFromMarkdown(markdown, options = {}) {
    const tasks = [];
    const errors = [];
    const lines = markdown.split('\n');
    
    let currentTask = null;
    let inFrontmatter = false;
    let frontmatterContent = '';
    let bodyLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Handle frontmatter
      if (this.#frontmatterPattern.test(trimmed)) {
        if (!inFrontmatter) {
          inFrontmatter = true;
          continue;
        } else {
          inFrontmatter = false;
          continue;
        }
      }

      if (inFrontmatter) {
        continue;
      }

      // Parse task line
      const taskMatch = trimmed.match(this.#taskPattern);
      if (taskMatch) {
        // Save previous task if exists
        if (currentTask) {
          currentTask.body = bodyLines.join('\n').trim();
          tasks.push(currentTask);
          bodyLines = [];
        }

        const checkbox = taskMatch[1];
        let taskText = taskMatch[2];

        // Parse all components
        const priority = this.#parsePriority(taskText);
        taskText = priority.text;

        const tags = this.#parseTags(taskText);
        taskText = tags.text;

        const dueDate = this.#parseDueDate(taskText);
        taskText = dueDate.text;

        const time = this.#parseTimeEstimate(taskText);
        taskText = time.text;

        const eisenhower = this.#parseEisenhower(taskText);
        taskText = eisenhower.text;

        currentTask = {
          title: taskText,
          status: this.#parseStatus(checkbox),
          priority: priority.priority ?? options.defaultPriority ?? 'medium',
          tags: tags.tags,
          dueDate: dueDate.dueDate,
          estimatedMinutes: time.estimatedMinutes ?? 0,
          urgent: eisenhower.urgent,
          important: eisenhower.important
        };
      } else if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
        // Parse metadata comment
        const metaMatch = trimmed.match(this.#metadataPattern);
        if (metaMatch && currentTask) {
          const [, key, value] = metaMatch;
          currentTask[key] = value;
        }
      } else if (currentTask && trimmed) {
        // Body content for current task
        bodyLines.push(line);
      } else if (trimmed === '' && bodyLines.length > 0) {
        bodyLines.push(line);
      }
    }

    // Don't forget the last task
    if (currentTask) {
      currentTask.body = bodyLines.join('\n').trim();
      tasks.push(currentTask);
    }

    return {
      tasks,
      errors,
      lineCount: lines.length
    };
  }

  /**
   * Export tasks to markdown
   * @param {Object[]} tasks - Tasks to export
   * @param {ExportOptions} [options] - Export options
   * @returns {string} Markdown content
   */
  exportToMarkdown(tasks, options = {}) {
    const opts = {
      includeMetadata: true,
      groupByQuadrant: false,
      groupByStatus: false,
      title: 'Tasks',
      ...options
    };

    const lines = [];

    // YAML frontmatter
    if (opts.includeMetadata) {
      lines.push('---');
      lines.push(`title: ${opts.title}`);
      lines.push(`generated: ${new Date().toISOString()}`);
      lines.push(`count: ${tasks.length}`);
      lines.push('---');
      lines.push('');
    }

    // Title
    lines.push(`# ${opts.title}`);
    lines.push('');

    // Group tasks if requested
    let groupedTasks = tasks;
    
    if (opts.groupByQuadrant) {
      const groups = this.#groupByQuadrant(tasks);
      for (const [quadrant, groupTasks] of Object.entries(groups)) {
        if (groupTasks.length > 0) {
          lines.push(`## ${this.#formatQuadrantName(quadrant)}`);
          lines.push('');
          lines.push(...this.#renderTaskList(groupTasks));
          lines.push('');
        }
      }
    } else if (opts.groupByStatus) {
      const groups = this.#groupByStatus(tasks);
      for (const [status, groupTasks] of Object.entries(groups)) {
        if (groupTasks.length > 0) {
          lines.push(`## ${status.replace('_', ' ').toUpperCase()}`);
          lines.push('');
          lines.push(...this.#renderTaskList(groupTasks));
          lines.push('');
        }
      }
    } else {
      lines.push(...this.#renderTaskList(tasks));
    }

    return lines.join('\n');
  }

  /**
   * Group tasks by Eisenhower quadrant
   * @private
   * @param {Object[]} tasks - Tasks
   * @returns {Object.<string, Object[]>}
   */
  #groupByQuadrant(tasks) {
    const groups = {
      'urgent-important': [],
      'not-urgent-important': [],
      'urgent-not-important': [],
      'not-urgent-not-important': []
    };

    for (const task of tasks) {
      let quadrant = 'not-urgent-not-important';
      if (task.urgent && task.important) quadrant = 'urgent-important';
      else if (!task.urgent && task.important) quadrant = 'not-urgent-important';
      else if (task.urgent && !task.important) quadrant = 'urgent-not-important';
      
      groups[quadrant].push(task);
    }

    return groups;
  }

  /**
   * Group tasks by status
   * @private
   * @param {Object[]} tasks - Tasks
   * @returns {Object.<string, Object[]>}
   */
  #groupByStatus(tasks) {
    const groups = {
      'backlog': [],
      'todo': [],
      'in_progress': [],
      'review': [],
      'done': [],
      'archived': []
    };

    for (const task of tasks) {
      const status = task.status ?? 'backlog';
      if (!groups[status]) groups[status] = [];
      groups[status].push(task);
    }

    return groups;
  }

  /**
   * Format quadrant name
   * @private
   * @param {string} quadrant - Quadrant key
   * @returns {string} Display name
   */
  #formatQuadrantName(quadrant) {
    const names = {
      'urgent-important': '🔥 Do First (Urgent + Important)',
      'not-urgent-important': '📅 Schedule (Not Urgent + Important)',
      'urgent-not-important': '↗️ Delegate (Urgent + Not Important)',
      'not-urgent-not-important': '🗑️ Eliminate (Not Urgent + Not Important)'
    };
    return names[quadrant] ?? quadrant;
  }

  /**
   * Render task list
   * @private
   * @param {Object[]} tasks - Tasks
   * @returns {string[]} Markdown lines
   */
  #renderTaskList(tasks) {
    const lines = [];

    for (const task of tasks) {
      const checkbox = this.#formatStatus(task.status);
      const priority = this.#formatPriority(task.priority);
      const dueDate = this.#formatDueDate(task.dueDate);
      const time = this.#formatTimeEstimate(task.estimatedMinutes);
      const eisenhower = this.#formatEisenhower(task.urgent, task.important);
      const tags = this.#formatTags(task.tags ?? []);

      const parts = [
        priority,
        task.title,
        tags,
        dueDate,
        time,
        eisenhower
      ].filter(Boolean);

      lines.push(`- [${checkbox}] ${parts.join(' ')}`);

      // Add description if present
      if (task.description) {
        const descLines = task.description.split('\n').map(l => `  ${l}`);
        lines.push(...descLines);
      }
    }

    return lines;
  }

  /**
   * Read tasks from markdown file
   * @param {string} filepath - File path
   * @param {ImportOptions} [options] - Import options
   * @returns {Promise<ParseResult>} Parse result
   */
  async importFromFile(filepath, options = {}) {
    // In Node.js environment, fs would be used
    // For browser compatibility, this is a placeholder
    throw new Error('importFromFile requires file system access. Use importFromMarkdown with file content.');
  }

  /**
   * Write tasks to markdown file
   * @param {string} filepath - File path
   * @param {Object[]} tasks - Tasks to export
   * @param {ExportOptions} [options] - Export options
   * @returns {Promise<void>}
   */
  async exportToFile(filepath, tasks, options = {}) {
    // In Node.js environment, fs would be used
    throw new Error('exportToFile requires file system access. Use exportToMarkdown and write manually.');
  }
}

export default MarkdownSync;
