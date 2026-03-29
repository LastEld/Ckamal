/**
 * Approval Commands
 * Manage approval workflows and requests
 */

import * as f from './utils/formatters.js';

// In-memory storage
const approvalsStore = new Map();

// Sample approvals for demo
const sampleApprovals = [
  {
    id: 'APR-001',
    title: 'Deploy v2.3.0 to Production',
    description: 'Requesting approval to deploy version 2.3.0 to production environment.',
    type: 'deployment',
    status: 'pending',
    requester: 'USER-002',
    approvers: ['USER-001'],
    currentApprovals: [],
    currentRejections: [],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    comments: []
  },
  {
    id: 'APR-002',
    title: 'Increase AWS Budget by $500',
    description: 'Need to increase monthly AWS budget for new data processing pipeline.',
    type: 'billing',
    status: 'pending',
    requester: 'USER-003',
    approvers: ['USER-001', 'USER-002'],
    currentApprovals: [],
    currentRejections: [],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    comments: []
  },
  {
    id: 'APR-003',
    title: 'Add new team member to project',
    description: 'Approve access for Sarah to join the Alpha project team.',
    type: 'access',
    status: 'approved',
    requester: 'USER-002',
    approvers: ['USER-001'],
    currentApprovals: ['USER-001'],
    currentRejections: [],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    comments: [
      { id: 'CMT-001', author: 'USER-001', text: 'Approved, Sarah has completed onboarding.', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() }
    ]
  }
];

sampleApprovals.forEach(approval => approvalsStore.set(approval.id, approval));

/**
 * List approvals with optional filtering
 */
export async function listApprovals(options = {}) {
  const spinner = f.createSpinner('Fetching approvals');
  spinner.start();

  await delay(200);

  let approvals = Array.from(approvalsStore.values());

  // Filter by pending status
  if (options.pending) {
    approvals = approvals.filter(a => a.status === 'pending');
  }

  // Filter by type
  if (options.type) {
    approvals = approvals.filter(a => a.type === options.type);
  }

  // Filter by status
  if (options.status) {
    approvals = approvals.filter(a => a.status === options.status);
  }

  spinner.succeed(`Found ${approvals.length} approvals`);

  let output = '\n';
  output += f.header('APPROVALS', 'line');
  output += '\n\n';

  if (approvals.length === 0) {
    output += f.info('No approvals found matching the criteria');
    return { success: true, output, data: [] };
  }

  const approvalData = approvals.map(approval => {
    return {
      ID: approval.id,
      Title: approval.title.length > 30 ? approval.title.substring(0, 27) + '...' : approval.title,
      Type: formatType(approval.type),
      Status: formatStatus(approval.status),
      Progress: `${approval.currentApprovals.length}/${approval.approvers.length}`,
      Requester: approval.requester.split('-')[1]
    };
  });

  output += f.table(approvalData, {
    columns: ['ID', 'Title', 'Type', 'Status', 'Progress', 'Requester']
  });

  // Summary
  const byStatus = {};
  approvals.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });

  output += '\n\n';
  output += f.colorize('Summary:', 'bright') + ' ';
  output += Object.entries(byStatus).map(([status, count]) =>
    `${formatStatus(status)}: ${count}`
  ).join(' | ');

  return { success: true, output, data: approvals };
}

/**
 * Show approval details
 */
export async function showApproval(approvalId, _options = {}) {
  if (!approvalId) {
    return {
      success: false,
      error: 'Approval ID is required',
      output: f.error('Approval ID is required. Usage: cognimesh approval show <id>')
    };
  }

  const approval = approvalsStore.get(approvalId);

  if (!approval) {
    return {
      success: false,
      error: `Approval not found: ${approvalId}`,
      output: f.error(`Approval not found: ${approvalId}`)
    };
  }

  const progress = approval.approvers.length > 0
    ? Math.round((approval.currentApprovals.length / approval.approvers.length) * 100)
    : 0;

  let output = '\n';
  output += f.header(approval.id, 'box');
  output += '\n\n';

  output += f.keyValue({
    'Title': approval.title,
    'Type': formatType(approval.type),
    'Status': formatStatus(approval.status),
    'Requester': approval.requester,
    'Created': new Date(approval.createdAt).toLocaleString(),
    'Updated': new Date(approval.updatedAt).toLocaleString()
  }, { indent: 2 });

  output += '\n\n';
  output += f.colorize('Approval Progress:', 'bright') + '\n';
  output += '  ' + f.progressBar(progress, 100, { width: 40, showPercent: true }) + '\n';
  output += `  ${approval.currentApprovals.length} of ${approval.approvers.length} approvals received`;

  if (approval.description) {
    output += '\n\n';
    output += f.colorize('Description:', 'bright') + '\n';
    output += f.box(approval.description, { width: 60 });
  }

  // Approvers list
  output += '\n\n';
  output += f.colorize('Approvers:', 'bright') + '\n';
  approval.approvers.forEach(approver => {
    const hasApproved = approval.currentApprovals.includes(approver);
    const hasRejected = approval.currentRejections.includes(approver);
    const status = hasApproved ? f.colorize('✓ approved', 'green')
      : hasRejected ? f.colorize('✗ rejected', 'red')
      : f.colorize('○ pending', 'dim');
    output += `  ${approver}: ${status}\n`;
  });

  if (approval.comments && approval.comments.length > 0) {
    output += '\n';
    output += f.colorize(`Comments (${approval.comments.length}):`, 'bright') + '\n\n';

    approval.comments.forEach(comment => {
      output += f.colorize(`${comment.author} • ${new Date(comment.createdAt).toLocaleString()}`, 'dim') + '\n';
      output += comment.text + '\n\n';
    });
  }

  return { success: true, output, data: approval };
}

/**
 * Approve a request
 */
export async function approveRequest(approvalId, options = {}) {
  if (!approvalId) {
    return {
      success: false,
      error: 'Approval ID is required',
      output: f.error('Approval ID is required. Usage: cognimesh approval approve <id>')
    };
  }

  const approval = approvalsStore.get(approvalId);

  if (!approval) {
    return {
      success: false,
      error: `Approval not found: ${approvalId}`,
      output: f.error(`Approval not found: ${approvalId}`)
    };
  }

  if (approval.status === 'approved') {
    return {
      success: false,
      error: `Approval ${approvalId} is already approved`,
      output: f.warning(`Approval ${approvalId} is already approved`)
    };
  }

  if (approval.status === 'rejected') {
    return {
      success: false,
      error: `Cannot approve a rejected request`,
      output: f.error(`Cannot approve a rejected request`)
    };
  }

  const approverId = 'USER-001'; // Current user

  if (!approval.currentApprovals.includes(approverId)) {
    approval.currentApprovals.push(approverId);
  }

  // Check if fully approved
  if (approval.currentApprovals.length >= approval.approvers.length) {
    approval.status = 'approved';
  }

  approval.updatedAt = new Date().toISOString();

  // Add comment if provided
  if (options.comment) {
    approval.comments = approval.comments || [];
    approval.comments.push({
      id: `CMT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      author: approverId,
      text: `[APPROVED] ${options.comment}`,
      createdAt: new Date().toISOString()
    });
  }

  const progress = approval.approvers.length > 0
    ? Math.round((approval.currentApprovals.length / approval.approvers.length) * 100)
    : 0;

  let output = '\n';
  output += f.success(`Approval recorded for ${approvalId}`) + '\n\n';
  output += f.colorize('Progress:', 'bright') + '\n';
  output += '  ' + f.progressBar(progress, 100, { width: 40, showPercent: true });

  if (approval.status === 'approved') {
    output += '\n\n' + f.success('🎉 Request fully approved!');
  }

  return { success: true, output, data: approval };
}

/**
 * Reject a request
 */
export async function rejectRequest(approvalId, options = {}) {
  if (!approvalId) {
    return {
      success: false,
      error: 'Approval ID is required',
      output: f.error('Approval ID is required. Usage: cognimesh approval reject <id>')
    };
  }

  const approval = approvalsStore.get(approvalId);

  if (!approval) {
    return {
      success: false,
      error: `Approval not found: ${approvalId}`,
      output: f.error(`Approval not found: ${approvalId}`)
    };
  }

  if (approval.status === 'approved') {
    return {
      success: false,
      error: `Cannot reject an approved request`,
      output: f.error(`Cannot reject an approved request`)
    };
  }

  if (approval.status === 'rejected') {
    return {
      success: false,
      error: `Approval ${approvalId} is already rejected`,
      output: f.warning(`Approval ${approvalId} is already rejected`)
    };
  }

  const rejectorId = 'USER-001'; // Current user

  if (!approval.currentRejections.includes(rejectorId)) {
    approval.currentRejections.push(rejectorId);
  }

  approval.status = 'rejected';
  approval.updatedAt = new Date().toISOString();

  // Add comment if provided
  if (options.comment) {
    approval.comments = approval.comments || [];
    approval.comments.push({
      id: `CMT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      author: rejectorId,
      text: `[REJECTED] ${options.comment}`,
      createdAt: new Date().toISOString()
    });
  }

  let output = '\n';
  output += f.success(`Request ${approvalId} has been rejected`) + '\n\n';

  if (options.comment) {
    output += f.colorize('Reason:', 'bright') + '\n';
    output += f.box(options.comment, { width: 60 });
  }

  return { success: true, output, data: approval };
}

// Helper functions
function formatStatus(status) {
  const colors = {
    pending: f.colorize('⏳ pending', 'yellow'),
    approved: f.colorize('✓ approved', 'green'),
    rejected: f.colorize('✗ rejected', 'red'),
    cancelled: f.colorize('⊘ cancelled', 'dim')
  };
  return colors[status] || status;
}

function formatType(type) {
  const labels = {
    deployment: f.colorize('deploy', 'magenta'),
    billing: f.colorize('billing', 'yellow'),
    access: f.colorize('access', 'blue'),
    policy: f.colorize('policy', 'cyan')
  };
  return labels[type] || type;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  list: listApprovals,
  show: showApproval,
  approve: approveRequest,
  reject: rejectRequest
};
