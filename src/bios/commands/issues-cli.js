/**
 * Issues Commands
 * Create, manage, and track issues/tickets
 */

import * as f from './utils/formatters.js';

// In-memory storage (replace with actual DB in production)
const issuesStore = new Map();
let issueIdCounter = 1;

// Sample issues for demo
const sampleIssues = [
  {
    id: 'ISS-001',
    title: 'API timeout on large dataset queries',
    description: 'When querying datasets over 100k records, the API times out after 30s.',
    status: 'open',
    priority: 'high',
    type: 'bug',
    assignee: 'USER-002',
    reporter: 'USER-001',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    comments: [
      { id: 'CMT-001', author: 'USER-002', text: 'Looking into this, might be a connection pool issue.', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() }
    ]
  },
  {
    id: 'ISS-002',
    title: 'Add dark mode support to dashboard',
    description: 'Users have requested a dark mode theme for the main dashboard.',
    status: 'in-progress',
    priority: 'medium',
    type: 'feature',
    assignee: 'USER-003',
    reporter: 'USER-001',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    comments: []
  },
  {
    id: 'ISS-003',
    title: 'Update documentation for v2 API',
    description: 'The API documentation needs to be updated with new endpoints.',
    status: 'open',
    priority: 'low',
    type: 'task',
    assignee: null,
    reporter: 'USER-002',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    comments: []
  }
];

sampleIssues.forEach(issue => issuesStore.set(issue.id, issue));

/**
 * List all issues with optional filtering
 */
export async function listIssues(options = {}) {
  const spinner = f.createSpinner('Fetching issues');
  spinner.start();

  await delay(200);

  let issues = Array.from(issuesStore.values());

  // Apply filters
  if (options.status) {
    issues = issues.filter(i => i.status === options.status);
  }
  if (options.priority) {
    issues = issues.filter(i => i.priority === options.priority);
  }
  if (options.assignee) {
    issues = issues.filter(i => i.assignee === options.assignee);
  }
  if (options.type) {
    issues = issues.filter(i => i.type === options.type);
  }

  spinner.succeed(`Found ${issues.length} issues`);

  let output = '\n';
  output += f.header('ISSUES', 'line');
  output += '\n\n';

  if (issues.length === 0) {
    output += f.info('No issues found matching the criteria');
    return { success: true, output, data: [] };
  }

  const issueData = issues.map(issue => ({
    ID: issue.id,
    Title: issue.title.length > 35 ? issue.title.substring(0, 32) + '...' : issue.title,
    Type: formatType(issue.type),
    Priority: formatPriority(issue.priority),
    Status: formatStatus(issue.status),
    Assignee: issue.assignee ? issue.assignee.split('-')[1] : 'Unassigned'
  }));

  output += f.table(issueData, {
    columns: ['ID', 'Title', 'Type', 'Priority', 'Status', 'Assignee']
  });

  // Summary
  const byStatus = {};
  issues.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1; });

  output += '\n\n';
  output += f.colorize('Summary:', 'bright') + ' ';
  output += Object.entries(byStatus).map(([status, count]) =>
    `${formatStatus(status)}: ${count}`
  ).join(' | ');

  return { success: true, output, data: issues };
}

/**
 * Create a new issue
 */
export async function createIssue(title, options = {}) {
  if (!title) {
    return {
      success: false,
      error: 'Issue title is required',
      output: f.error('Issue title is required. Usage: cognimesh issue create "<title>"')
    };
  }

  const spinner = f.createSpinner('Creating issue');
  spinner.start();

  await delay(300);

  const issue = {
    id: `ISS-${String(issueIdCounter++).padStart(3, '0')}`,
    title,
    description: options.description || '',
    status: 'open',
    priority: options.priority || 'medium',
    type: options.type || 'task',
    assignee: options.assignee || null,
    reporter: 'USER-001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: []
  };

  issuesStore.set(issue.id, issue);

  spinner.succeed(`Issue created: ${issue.id}`);

  let output = '\n';
  output += f.success(`Issue created successfully`) + '\n\n';
  output += f.box(
    f.keyValue({
      'ID': issue.id,
      'Title': issue.title,
      'Type': formatType(issue.type),
      'Priority': formatPriority(issue.priority),
      'Status': formatStatus(issue.status),
      'Created': new Date(issue.createdAt).toLocaleString()
    }), { title: 'Issue Details', width: 60 }
  );

  if (issue.description) {
    output += '\n\n';
    output += f.colorize('Description:', 'bright') + '\n';
    output += issue.description;
  }

  return { success: true, output, data: issue };
}

/**
 * Show issue details
 */
export async function showIssue(issueId, _options = {}) {
  if (!issueId) {
    return {
      success: false,
      error: 'Issue ID is required',
      output: f.error('Issue ID is required. Usage: cognimesh issue show <id>')
    };
  }

  const issue = issuesStore.get(issueId);

  if (!issue) {
    return {
      success: false,
      error: `Issue not found: ${issueId}`,
      output: f.error(`Issue not found: ${issueId}`)
    };
  }

  let output = '\n';
  output += f.header(issue.id, 'box');
  output += '\n\n';

  output += f.keyValue({
    'Title': issue.title,
    'Status': formatStatus(issue.status),
    'Priority': formatPriority(issue.priority),
    'Type': formatType(issue.type),
    'Assignee': issue.assignee || 'Unassigned',
    'Reporter': issue.reporter,
    'Created': new Date(issue.createdAt).toLocaleString(),
    'Updated': new Date(issue.updatedAt).toLocaleString()
  }, { indent: 2 });

  if (issue.description) {
    output += '\n\n';
    output += f.colorize('Description:', 'bright') + '\n';
    output += f.box(issue.description, { width: 60 });
  }

  if (issue.comments && issue.comments.length > 0) {
    output += '\n\n';
    output += f.colorize(`Comments (${issue.comments.length}):`, 'bright') + '\n\n';

    issue.comments.forEach(comment => {
      output += f.colorize(`${comment.author} • ${new Date(comment.createdAt).toLocaleString()}`, 'dim') + '\n';
      output += comment.text + '\n\n';
    });
  }

  return { success: true, output, data: issue };
}

/**
 * Update an issue
 */
export async function updateIssue(issueId, options = {}) {
  if (!issueId) {
    return {
      success: false,
      error: 'Issue ID is required',
      output: f.error('Issue ID is required. Usage: cognimesh issue update <id> [options]')
    };
  }

  const issue = issuesStore.get(issueId);

  if (!issue) {
    return {
      success: false,
      error: `Issue not found: ${issueId}`,
      output: f.error(`Issue not found: ${issueId}`)
    };
  }

  const updates = [];

  if (options.status) {
    const validStatuses = ['open', 'in-progress', 'resolved', 'closed'];
    if (!validStatuses.includes(options.status)) {
      return {
        success: false,
        error: `Invalid status: ${options.status}`,
        output: f.error(`Invalid status. Valid: ${validStatuses.join(', ')}`)
      };
    }
    issue.status = options.status;
    updates.push(`status → ${options.status}`);
  }

  if (options.assignee) {
    issue.assignee = options.assignee;
    updates.push(`assignee → ${options.assignee}`);
  }

  if (options.priority) {
    issue.priority = options.priority;
    updates.push(`priority → ${options.priority}`);
  }

  if (updates.length === 0) {
    return {
      success: false,
      error: 'No updates specified',
      output: f.error('No updates specified. Use --status, --assignee, or --priority')
    };
  }

  issue.updatedAt = new Date().toISOString();

  return {
    success: true,
    output: f.success(`Issue ${issueId} updated: ${updates.join(', ')}`),
    data: issue
  };
}

/**
 * Add a comment to an issue
 */
export async function commentOnIssue(issueId, message, _options = {}) {
  if (!issueId) {
    return {
      success: false,
      error: 'Issue ID is required',
      output: f.error('Issue ID is required. Usage: cognimesh issue comment <id> <message>')
    };
  }

  if (!message) {
    return {
      success: false,
      error: 'Comment message is required',
      output: f.error('Comment message is required')
    };
  }

  const issue = issuesStore.get(issueId);

  if (!issue) {
    return {
      success: false,
      error: `Issue not found: ${issueId}`,
      output: f.error(`Issue not found: ${issueId}`)
    };
  }

  const comment = {
    id: `CMT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    author: 'USER-001',
    text: message,
    createdAt: new Date().toISOString()
  };

  issue.comments = issue.comments || [];
  issue.comments.push(comment);
  issue.updatedAt = new Date().toISOString();

  return {
    success: true,
    output: f.success(`Comment added to ${issueId}`),
    data: { issue, comment }
  };
}

/**
 * Close an issue
 */
export async function closeIssue(issueId, options = {}) {
  if (!issueId) {
    return {
      success: false,
      error: 'Issue ID is required',
      output: f.error('Issue ID is required. Usage: cognimesh issue close <id>')
    };
  }

  const issue = issuesStore.get(issueId);

  if (!issue) {
    return {
      success: false,
      error: `Issue not found: ${issueId}`,
      output: f.error(`Issue not found: ${issueId}`)
    };
  }

  if (issue.status === 'closed') {
    return {
      success: false,
      error: `Issue ${issueId} is already closed`,
      output: f.warning(`Issue ${issueId} is already closed`)
    };
  }

  issue.status = 'closed';
  issue.updatedAt = new Date().toISOString();

  if (options.resolution) {
    issue.resolution = options.resolution;
  }

  let output = f.success(`Issue ${issueId} closed`);
  if (options.resolution) {
    output += '\n' + f.info(`Resolution: ${options.resolution}`);
  }

  return {
    success: true,
    output,
    data: issue
  };
}

// Helper functions
function formatStatus(status) {
  const colors = {
    open: f.colorize('● open', 'green'),
    'in-progress': f.colorize('▶ in-progress', 'blue'),
    resolved: f.colorize('✓ resolved', 'cyan'),
    closed: f.colorize('■ closed', 'dim')
  };
  return colors[status] || status;
}

function formatPriority(priority) {
  const colors = {
    low: f.colorize('low', 'dim'),
    medium: f.colorize('medium', 'cyan'),
    high: f.colorize('high', 'yellow'),
    urgent: f.colorize('urgent', 'red')
  };
  return colors[priority] || priority;
}

function formatType(type) {
  const colors = {
    bug: f.colorize('bug', 'red'),
    feature: f.colorize('feature', 'green'),
    task: f.colorize('task', 'blue'),
    enhancement: f.colorize('enhance', 'magenta')
  };
  return colors[type] || type;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  list: listIssues,
  create: createIssue,
  show: showIssue,
  update: updateIssue,
  comment: commentOnIssue,
  close: closeIssue
};
