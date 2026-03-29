/**
 * Company Commands
 * Manage company/organization workspace
 */

import * as f from './utils/formatters.js';

// In-memory storage (replace with actual DB/API in production)
const companyStore = new Map();
let companyIdCounter = 1;

// Current active company
let activeCompanyId = null;

/**
 * List all companies
 */
export async function listCompanies(_options = {}) {
  const spinner = f.createSpinner('Fetching companies');
  spinner.start();

  await delay(200);

  const companies = Array.from(companyStore.values());

  // Add sample companies if empty
  if (companies.length === 0) {
    companies.push(
      {
        id: 'COMP-001',
        name: 'Acme Corporation',
        slug: 'acme-corp',
        role: 'owner',
        status: 'active',
        memberCount: 5,
        createdAt: new Date().toISOString()
      },
      {
        id: 'COMP-002',
        name: 'TechStart Inc',
        slug: 'techstart',
        role: 'member',
        status: 'active',
        memberCount: 12,
        createdAt: new Date().toISOString()
      }
    );
  }

  spinner.succeed(`Found ${companies.length} companies`);

  let output = '\n';
  output += f.header('COMPANIES', 'line');
  output += '\n\n';

  const companyData = companies.map(company => ({
    ID: company.id,
    Name: company.name.length > 25 ? company.name.substring(0, 22) + '...' : company.name,
    Slug: company.slug,
    Role: formatRole(company.role),
    Status: formatStatus(company.status),
    Members: company.memberCount,
    Current: company.id === activeCompanyId ? f.colorize('●', 'green') : ''
  }));

  output += f.table(companyData, {
    columns: ['ID', 'Name', 'Slug', 'Role', 'Status', 'Members', 'Current']
  });

  if (activeCompanyId) {
    const active = companies.find(c => c.id === activeCompanyId);
    if (active) {
      output += '\n';
      output += f.info(`Active company: ${f.colorize(active.name, 'cyan')}`);
    }
  }

  return { success: true, output, data: companies };
}

/**
 * Create a new company
 */
export async function createCompany(name, _options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Company name is required',
      output: f.error('Company name is required. Usage: cognimesh company create "<name>"')
    };
  }

  const spinner = f.createSpinner('Creating company');
  spinner.start();

  await delay(400);

  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const company = {
    id: `COMP-${String(companyIdCounter++).padStart(3, '0')}`,
    name,
    slug,
    status: 'active',
    role: 'owner',
    memberCount: 1,
    settings: {
      allowPublicIssues: false,
      requireApprovalFor: ['deployment', 'billing'],
      defaultIssueVisibility: 'private'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  companyStore.set(company.id, company);
  activeCompanyId = company.id;

  spinner.succeed(`Company created: ${company.id}`);

  let output = '\n';
  output += f.success(`Company created successfully`) + '\n\n';
  output += f.box(
    f.keyValue({
      'ID': company.id,
      'Name': company.name,
      'Slug': company.slug,
      'Status': formatStatus(company.status),
      'Your Role': formatRole('owner'),
      'Created': new Date(company.createdAt).toLocaleString()
    }), { title: 'Company Details', width: 60 }
  );

  output += '\n\n';
  output += f.info(`Switched to ${f.colorize(company.name, 'cyan')} as active company`);

  return { success: true, output, data: company };
}

/**
 * Switch to a different company
 */
export async function switchCompany(companyId, _options = {}) {
  if (!companyId) {
    // Show current company
    if (activeCompanyId) {
      const current = companyStore.get(activeCompanyId) || {
        id: activeCompanyId,
        name: 'Unknown Company'
      };
      return {
        success: true,
        output: f.info(`Current company: ${f.colorize(current.name, 'cyan')} (${current.id})`),
        data: current
      };
    }
    return {
      success: false,
      error: 'No active company',
      output: f.error('No company is currently active. Usage: cognimesh company switch <id>')
    };
  }

  const spinner = f.createSpinner('Switching company');
  spinner.start();

  await delay(200);

  // Check in store first
  let company = companyStore.get(companyId);

  // Check sample companies
  if (!company) {
    const samples = {
      'COMP-001': {
        id: 'COMP-001',
        name: 'Acme Corporation',
        slug: 'acme-corp',
        role: 'owner',
        status: 'active',
        memberCount: 5
      },
      'COMP-002': {
        id: 'COMP-002',
        name: 'TechStart Inc',
        slug: 'techstart',
        role: 'member',
        status: 'active',
        memberCount: 12
      }
    };
    company = samples[companyId];
  }

  if (!company) {
    spinner.fail(`Company not found: ${companyId}`);
    return {
      success: false,
      error: `Company not found: ${companyId}`,
      output: f.error(`Company not found: ${companyId}`)
    };
  }

  activeCompanyId = companyId;

  spinner.succeed(`Switched to ${company.name}`);

  let output = '\n';
  output += f.success(`Now working with: ${f.colorize(company.name, 'cyan')}`) + '\n\n';
  output += f.keyValue({
    'Company ID': company.id,
    'Slug': company.slug,
    'Your Role': formatRole(company.role),
    'Members': company.memberCount
  }, { indent: 2 });

  return { success: true, output, data: company };
}

/**
 * List company members
 */
export async function listMembers(_options = {}) {
  const spinner = f.createSpinner('Fetching members');
  spinner.start();

  await delay(300);

  // Sample members data
  const members = [
    {
      id: 'USER-001',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'owner',
      status: 'active',
      joinedAt: new Date().toISOString()
    },
    {
      id: 'USER-002',
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'admin',
      status: 'active',
      joinedAt: new Date().toISOString()
    },
    {
      id: 'USER-003',
      name: 'Bob Wilson',
      email: 'bob@example.com',
      role: 'member',
      status: 'active',
      joinedAt: new Date().toISOString()
    },
    {
      id: 'USER-004',
      name: 'Alice Brown',
      email: 'alice@example.com',
      role: 'member',
      status: 'pending',
      joinedAt: new Date().toISOString()
    }
  ];

  spinner.succeed(`Found ${members.length} members`);

  let output = '\n';
  output += f.header('COMPANY MEMBERS', 'line');
  output += '\n\n';

  const memberData = members.map(member => ({
    ID: member.id,
    Name: member.name,
    Email: member.email,
    Role: formatRole(member.role),
    Status: formatMemberStatus(member.status),
    Joined: new Date(member.joinedAt).toLocaleDateString()
  }));

  output += f.table(memberData, {
    columns: ['ID', 'Name', 'Email', 'Role', 'Status', 'Joined']
  });

  // Summary
  const byRole = {};
  members.forEach(m => { byRole[m.role] = (byRole[m.role] || 0) + 1; });

  output += '\n\n';
  output += f.colorize('Summary:', 'bright') + ' ';
  output += Object.entries(byRole).map(([role, count]) =>
    `${formatRole(role)}: ${count}`
  ).join(' | ');

  return { success: true, output, data: members };
}

/**
 * Invite a member to the company
 */
export async function inviteMember(email, options = {}) {
  if (!email || !email.includes('@')) {
    return {
      success: false,
      error: 'Valid email is required',
      output: f.error('Valid email is required. Usage: cognimesh company invite <email>')
    };
  }

  const spinner = f.createSpinner('Sending invitation');
  spinner.start();

  await delay(500);

  const role = options.role || 'member';
  const invitation = {
    id: `INV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    email,
    role,
    status: 'pending',
    invitedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };

  spinner.succeed(`Invitation sent to ${email}`);

  let output = '\n';
  output += f.success(`Invitation sent successfully`) + '\n\n';
  output += f.box(
    f.keyValue({
      'Invitation ID': invitation.id,
      'Email': invitation.email,
      'Role': formatRole(invitation.role),
      'Status': formatStatus(invitation.status),
      'Expires': new Date(invitation.expiresAt).toLocaleString()
    }), { title: 'Invitation Details', width: 60 }
  );

  return { success: true, output, data: invitation };
}

// Helper functions
function formatStatus(status) {
  const colors = {
    active: f.colorize('active', 'green'),
    inactive: f.colorize('inactive', 'dim'),
    pending: f.colorize('pending', 'yellow'),
    suspended: f.colorize('suspended', 'red')
  };
  return colors[status] || status;
}

function formatRole(role) {
  const colors = {
    owner: f.colorize('owner', 'magenta'),
    admin: f.colorize('admin', 'cyan'),
    member: f.colorize('member', 'blue'),
    guest: f.colorize('guest', 'dim')
  };
  return colors[role] || role;
}

function formatMemberStatus(status) {
  const colors = {
    active: f.colorize('● active', 'green'),
    pending: f.colorize('○ pending', 'yellow'),
    inactive: f.colorize('○ inactive', 'dim')
  };
  return colors[status] || status;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  list: listCompanies,
  create: createCompany,
  switch: switchCompany,
  members: listMembers,
  invite: inviteMember
};
