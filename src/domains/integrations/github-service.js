/**
 * @fileoverview GitHub Integration Service
 * @module domains/integrations/github-service
 * 
 * Comprehensive GitHub API integration providing:
 * - Repository operations (list, create, fork)
 * - Two-way issue synchronization
 * - Pull request tracking
 * - Release management
 * - Webhook handling for GitHub events
 * - Bidirectional comment sync with label mapping
 * 
 * Built on top of the existing GitHubClient from bios/github-client.js
 * with extended functionality for Ckamal integration.
 */

import { Octokit } from '@octokit/rest';
import { config } from '../../config.js';

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

const GITHUB_API_BASE = 'https://api.github.com';
const DEFAULT_PER_PAGE = 100;

/**
 * Default label mappings between Ckamal and GitHub
 * Maps Ckamal issue priorities/status to GitHub labels
 */
const DEFAULT_LABEL_MAPPINGS = {
  // Priority mappings
  priority: {
    critical: { name: 'priority:critical', color: 'DC2626', description: 'Critical priority' },
    high: { name: 'priority:high', color: 'EA580C', description: 'High priority' },
    medium: { name: 'priority:medium', color: 'D97706', description: 'Medium priority' },
    low: { name: 'priority:low', color: '65A30D', description: 'Low priority' }
  },
  // Status mappings
  status: {
    backlog: { name: 'status:backlog', color: '6B7280', description: 'In backlog' },
    todo: { name: 'status:todo', color: '3B82F6', description: 'Ready to work' },
    in_progress: { name: 'status:in-progress', color: '8B5CF6', description: 'In progress' },
    in_review: { name: 'status:in-review', color: 'F59E0B', description: 'In review' },
    blocked: { name: 'status:blocked', color: 'EF4444', description: 'Blocked' },
    completed: { name: 'status:completed', color: '10B981', description: 'Completed' },
    cancelled: { name: 'status:cancelled', color: '6B7280', description: 'Cancelled' }
  }
};

/**
 * Valid webhook event types
 */
const VALID_WEBHOOK_EVENTS = [
  'issues',
  'issue_comment',
  'pull_request',
  'pull_request_review',
  'push',
  'release',
  'create',
  'delete',
  'fork',
  'star',
  'watch',
  'repository',
  'workflow_run',
  'workflow_job'
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate UUID for sync records
 * @returns {string}
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `gh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current ISO timestamp
 * @returns {string}
 */
function now() {
  return new Date().toISOString();
}

/**
 * Parse GitHub repository string (owner/repo)
 * @param {string} repoString - Repository identifier
 * @returns {{owner: string, repo: string}}
 */
function parseRepoString(repoString) {
  const parts = repoString.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid repository format. Expected 'owner/repo', got: ${repoString}`);
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Convert GitHub issue to Ckamal issue format
 * @param {Object} ghIssue - GitHub issue object
 * @param {string} companyId - Company ID
 * @returns {Object} Ckamal issue format
 */
function convertGitHubIssueToCkamal(ghIssue, companyId) {
  // Map GitHub labels to Ckamal format
  const labels = ghIssue.labels.map(l => l.name);
  
  // Extract priority from labels
  let priority = 'medium';
  if (labels.some(l => l.includes('critical'))) priority = 'critical';
  else if (labels.some(l => l.includes('high'))) priority = 'high';
  else if (labels.some(l => l.includes('low'))) priority = 'low';

  // Extract status from labels or state
  let status = 'backlog';
  if (ghIssue.state === 'closed') {
    status = 'completed';
  } else {
    if (labels.some(l => l.includes('in-progress'))) status = 'in_progress';
    else if (labels.some(l => l.includes('in-review'))) status = 'in_review';
    else if (labels.some(l => l.includes('blocked'))) status = 'blocked';
    else if (labels.some(l => l.includes('todo'))) status = 'todo';
  }

  return {
    title: ghIssue.title,
    description: ghIssue.body || '',
    status,
    priority,
    companyId,
    originKind: 'integration',
    originId: `github:${ghIssue.number}`,
    assigneeType: ghIssue.assignee ? 'user' : null,
    assigneeId: ghIssue.assignee?.login || null,
    labels: labels.filter(l => !l.startsWith('priority:') && !l.startsWith('status:')),
    metadata: {
      githubIssueNumber: ghIssue.number,
      githubUrl: ghIssue.html_url,
      githubState: ghIssue.state,
      githubLabels: labels,
      githubCreatedAt: ghIssue.created_at,
      githubUpdatedAt: ghIssue.updated_at,
      githubClosedAt: ghIssue.closed_at
    }
  };
}

/**
 * Convert Ckamal issue to GitHub issue format
 * @param {Object} ckamalIssue - Ckamal issue object
 * @returns {Object} GitHub issue format
 */
function convertCkamalIssueToGitHub(ckamalIssue) {
  const labels = [...(ckamalIssue.labels || [])];
  
  // Add priority label
  if (ckamalIssue.priority) {
    const priorityLabel = DEFAULT_LABEL_MAPPINGS.priority[ckamalIssue.priority];
    if (priorityLabel && !labels.includes(priorityLabel.name)) {
      labels.push(priorityLabel.name);
    }
  }
  
  // Add status label
  if (ckamalIssue.status) {
    const statusLabel = DEFAULT_LABEL_MAPPINGS.status[ckamalIssue.status];
    if (statusLabel && !labels.includes(statusLabel.name)) {
      labels.push(statusLabel.name);
    }
  }

  const body = ckamalIssue.description || '';
  
  // Add Ckamal metadata footer
  const metadataFooter = `

---
*Synced from Ckamal Issue #${ckamalIssue.issueNumber}*
*Ckamal ID: ${ckamalIssue.id}*`;

  return {
    title: ckamalIssue.title,
    body: body + metadataFooter,
    labels,
    state: ckamalIssue.status === 'completed' || ckamalIssue.status === 'cancelled' ? 'closed' : 'open'
  };
}

// ============================================================================
// GITHUB SERVICE
// ============================================================================

/**
 * GitHub Integration Service
 * Provides comprehensive GitHub API operations and two-way sync
 */
export class GitHubService {
  #octokit = null;
  #token = null;
  #syncRepo = null;
  #issueService = null;
  #webhookSecret = null;

  /**
   * Create GitHub service
   * @param {Object} options
   * @param {string} [options.token] - GitHub personal access token
   * @param {Object} [options.repositories] - Repository factory
   * @param {Object} [options.issueService] - Issue service for sync operations
   * @param {string} [options.webhookSecret] - Secret for webhook verification
   */
  constructor(options = {}) {
    this.#token = options.token || config.github?.token || process.env.GITHUB_TOKEN;
    this.#webhookSecret = options.webhookSecret || process.env.GITHUB_WEBHOOK_SECRET;
    
    if (this.#token) {
      this.#octokit = new Octokit({ 
      auth: this.#token,
      baseUrl: GITHUB_API_BASE,
      request: {
        fetch: globalThis.fetch
      }
    });
    }
    
    if (options.repositories) {
      this.#syncRepo = options.repositories.githubSync || null;
    }
    
    this.#issueService = options.issueService || null;
  }

  /**
   * Check if service is properly configured
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.#token && this.#octokit);
  }

  /**
   * Initialize service with dependencies
   * @param {Object} deps - Dependencies
   * @param {Object} deps.repositories - Repository factory
   * @param {Object} deps.issueService - Issue service
   */
  initialize(deps = {}) {
    if (deps.repositories) {
      this.#syncRepo = deps.repositories.githubSync || this.#syncRepo;
    }
    if (deps.issueService) {
      this.#issueService = deps.issueService;
    }
  }

  // ============================================================================
  // REPOSITORY OPERATIONS
  // ============================================================================

  /**
   * List repositories accessible to the authenticated user
   * @param {Object} [options]
   * @param {string} [options.type='all'] - Filter by type: all, owner, member
   * @param {string} [options.sort='updated'] - Sort field: created, updated, pushed, full_name
   * @param {string} [options.direction='desc'] - Sort direction: asc, desc
   * @param {number} [options.perPage=30] - Results per page
   * @param {number} [options.page=1] - Page number
   * @returns {Promise<Array>} List of repositories
   */
  async listRepositories(options = {}) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.repos.listForAuthenticatedUser({
      type: options.type || 'all',
      sort: options.sort || 'updated',
      direction: options.direction || 'desc',
      per_page: options.perPage || DEFAULT_PER_PAGE,
      page: options.page || 1
    });

    return data.map(repo => this.#formatRepository(repo));
  }

  /**
   * Get a specific repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<Object>} Repository details
   */
  async getRepository(owner, repo) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.repos.get({ owner, repo });
    return this.#formatRepository(data);
  }

  /**
   * Create a new repository
   * @param {string} name - Repository name
   * @param {Object} [options]
   * @param {string} [options.description] - Repository description
   * @param {boolean} [options.private=false] - Whether the repo is private
   * @param {boolean} [options.autoInit=true] - Initialize with README
   * @param {string} [options.org] - Organization name (if creating in org)
   * @returns {Promise<Object>} Created repository
   */
  async createRepository(name, options = {}) {
    this.#ensureConfigured();

    const params = {
      name,
      description: options.description,
      private: options.private !== false,
      auto_init: options.autoInit !== false,
      has_issues: true,
      has_projects: true,
      has_wiki: false
    };

    let data;
    if (options.org) {
      ({ data } = await this.#octokit.rest.repos.createInOrg({
        org: options.org,
        ...params
      }));
    } else {
      ({ data } = await this.#octokit.rest.repos.createForAuthenticatedUser(params));
    }

    return this.#formatRepository(data);
  }

  /**
   * Fork a repository
   * @param {string} owner - Source repository owner
   * @param {string} repo - Source repository name
   * @param {Object} [options]
   * @param {string} [options.org] - Organization to fork to
   * @param {string} [options.name] - New name for the fork
   * @param {boolean} [options.defaultBranchOnly=false] - Fork only default branch
   * @returns {Promise<Object>} Forked repository
   */
  async forkRepository(owner, repo, options = {}) {
    this.#ensureConfigured();

    const params = { owner, repo };
    if (options.org) params.organization = options.org;
    if (options.name) params.name = options.name;
    if (options.defaultBranchOnly) params.default_branch_only = true;

    const { data } = await this.#octokit.rest.repos.createFork(params);
    return this.#formatRepository(data);
  }

  /**
   * List organization repositories
   * @param {string} org - Organization name
   * @param {Object} [options]
   * @returns {Promise<Array>} List of repositories
   */
  async listOrgRepositories(org, options = {}) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.repos.listForOrg({
      org,
      type: options.type || 'all',
      sort: options.sort || 'updated',
      direction: options.direction || 'desc',
      per_page: options.perPage || DEFAULT_PER_PAGE,
      page: options.page || 1
    });

    return data.map(repo => this.#formatRepository(repo));
  }

  /**
   * Search repositories
   * @param {string} query - Search query
   * @param {Object} [options]
   * @returns {Promise<Object>} Search results with pagination
   */
  async searchRepositories(query, options = {}) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.search.repos({
      q: query,
      sort: options.sort,
      order: options.order || 'desc',
      per_page: options.perPage || DEFAULT_PER_PAGE,
      page: options.page || 1
    });

    return {
      total: data.total_count,
      incomplete: data.incomplete_results,
      repositories: data.items.map(repo => this.#formatRepository(repo))
    };
  }

  // ============================================================================
  // ISSUE OPERATIONS
  // ============================================================================

  /**
   * List issues in a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} [options]
   * @param {string} [options.state='open'] - Issue state: open, closed, all
   * @param {string} [options.sort='created'] - Sort field
   * @param {string} [options.direction='desc'] - Sort direction
   * @param {string[]} [options.labels] - Filter by labels
   * @param {string} [options.assignee] - Filter by assignee
   * @param {string} [options.creator] - Filter by creator
   * @returns {Promise<Array>} List of issues
   */
  async listIssues(owner, repo, options = {}) {
    this.#ensureConfigured();

    const params = {
      owner,
      repo,
      state: options.state || 'open',
      sort: options.sort || 'created',
      direction: options.direction || 'desc',
      per_page: options.perPage || DEFAULT_PER_PAGE,
      page: options.page || 1
    };

    if (options.labels?.length) {
      params.labels = options.labels.join(',');
    }
    if (options.assignee) {
      params.assignee = options.assignee;
    }
    if (options.creator) {
      params.creator = options.creator;
    }

    const { data } = await this.#octokit.rest.issues.listForRepo(params);
    
    // Filter out pull requests (GitHub API returns PRs as issues)
    const issuesOnly = data.filter(item => !item.pull_request);
    
    return issuesOnly.map(issue => this.#formatIssue(issue));
  }

  /**
   * Get a specific issue
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @returns {Promise<Object>} Issue details
   */
  async getIssue(owner, repo, issueNumber) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    });

    return this.#formatIssue(data);
  }

  /**
   * Create a GitHub issue
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} issueData - Issue data
   * @returns {Promise<Object>} Created issue
   */
  async createIssue(owner, repo, issueData) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.issues.create({
      owner,
      repo,
      title: issueData.title,
      body: issueData.body,
      labels: issueData.labels,
      assignees: issueData.assignees,
      milestone: issueData.milestone
    });

    return this.#formatIssue(data);
  }

  /**
   * Update a GitHub issue
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated issue
   */
  async updateIssue(owner, repo, issueNumber, updates) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      title: updates.title,
      body: updates.body,
      labels: updates.labels,
      assignees: updates.assignees,
      state: updates.state,
      milestone: updates.milestone
    });

    return this.#formatIssue(data);
  }

  /**
   * Get issue comments
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @param {Object} [options]
   * @returns {Promise<Array>} List of comments
   */
  async getIssueComments(owner, repo, issueNumber, options = {}) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: options.perPage || DEFAULT_PER_PAGE,
      page: options.page || 1,
      since: options.since
    });

    return data.map(comment => this.#formatComment(comment));
  }

  /**
   * Create a comment on an issue
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @param {string} body - Comment body
   * @returns {Promise<Object>} Created comment
   */
  async createIssueComment(owner, repo, issueNumber, body) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body
    });

    return this.#formatComment(data);
  }

  // ============================================================================
  // ISSUE SYNC OPERATIONS
  // ============================================================================

  /**
   * Sync Ckamal issues to GitHub
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} [options]
   * @param {string[]} [options.issueIds] - Specific issue IDs to sync (default: all)
   * @param {boolean} [options.syncComments=true] - Whether to sync comments
   * @param {string} [options.companyId] - Company ID for filtering issues
   * @returns {Promise<Object>} Sync results
   */
  async syncIssuesToGitHub(owner, repo, options = {}) {
    this.#ensureConfigured();
    if (!this.#issueService) {
      throw new Error('Issue service not configured');
    }

    const results = {
      created: [],
      updated: [],
      failed: [],
      commentsSynced: 0
    };

    // Get Ckamal issues to sync
    let issues;
    if (options.issueIds?.length) {
      issues = await Promise.all(
        options.issueIds.map(id => this.#issueService.getIssue(id))
      );
      issues = issues.filter(Boolean);
    } else {
      issues = await this.#issueService.listIssues({
        companyId: options.companyId,
        limit: 1000
      });
    }

    // Ensure labels exist on GitHub
    await this.#ensureLabelsExist(owner, repo);

    for (const issue of issues) {
      try {
        // Check if already synced
        const syncRecord = await this.#getSyncRecord(issue.id, owner, repo);
        
        const ghIssueData = convertCkamalIssueToGitHub(issue);

        if (syncRecord?.githubIssueNumber) {
          // Update existing issue
          const updated = await this.updateIssue(
            owner, 
            repo, 
            syncRecord.githubIssueNumber, 
            ghIssueData
          );
          results.updated.push({
            ckamalId: issue.id,
            githubNumber: updated.number,
            githubUrl: updated.url
          });
        } else {
          // Create new issue
          const created = await this.createIssue(owner, repo, ghIssueData);
          results.created.push({
            ckamalId: issue.id,
            githubNumber: created.number,
            githubUrl: created.url
          });

          // Create sync record
          await this.#createSyncRecord({
            ckamalIssueId: issue.id,
            githubIssueNumber: created.number,
            owner,
            repo,
            companyId: issue.companyId,
            direction: 'ckamal_to_github'
          });
        }

        // Sync comments if enabled
        if (options.syncComments !== false) {
          const commentCount = await this.#syncIssueCommentsToGitHub(
            issue, 
            owner, 
            repo, 
            syncRecord?.githubIssueNumber || results.created[results.created.length - 1]?.githubNumber
          );
          results.commentsSynced += commentCount;
        }
      } catch (error) {
        results.failed.push({
          ckamalId: issue.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Sync GitHub issues to Ckamal
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} [options]
   * @param {string} [options.state='open'] - Filter by state
   * @param {string[]} [options.labels] - Filter by labels
   * @param {boolean} [options.syncComments=true] - Whether to sync comments
   * @param {string} [options.companyId] - Company ID for created issues
   * @returns {Promise<Object>} Sync results
   */
  async syncIssuesFromGitHub(owner, repo, options = {}) {
    this.#ensureConfigured();
    if (!this.#issueService) {
      throw new Error('Issue service not configured');
    }
    if (!options.companyId) {
      throw new Error('Company ID is required for creating Ckamal issues');
    }

    const results = {
      created: [],
      updated: [],
      skipped: [],
      failed: [],
      commentsSynced: 0
    };

    // Get GitHub issues
    const ghIssues = await this.listIssues(owner, repo, {
      state: options.state || 'open',
      labels: options.labels
    });

    for (const ghIssue of ghIssues) {
      try {
        // Check if already synced
        const syncRecord = await this.#getSyncRecordByGitHubNumber(
          owner, 
          repo, 
          ghIssue.number
        );

        if (syncRecord?.ckamalIssueId) {
          // Update existing Ckamal issue if needed
          const existing = await this.#issueService.getIssue(syncRecord.ckamalIssueId);
          if (existing && this.#needsUpdate(existing, ghIssue)) {
            const updates = convertGitHubIssueToCkamal(ghIssue, options.companyId);
            await this.#issueService.updateIssue(syncRecord.ckamalIssueId, {
              title: updates.title,
              description: updates.description,
              status: updates.status,
              priority: updates.priority
            });
            results.updated.push({
              githubNumber: ghIssue.number,
              ckamalId: syncRecord.ckamalIssueId
            });
          } else {
            results.skipped.push({
              githubNumber: ghIssue.number,
              ckamalId: syncRecord.ckamalIssueId,
              reason: 'no_changes'
            });
          }
        } else {
          // Create new Ckamal issue
          const issueData = convertGitHubIssueToCkamal(ghIssue, options.companyId);
          const created = await this.#issueService.createIssue(issueData);
          results.created.push({
            githubNumber: ghIssue.number,
            ckamalId: created.id,
            ckamalNumber: created.issueNumber
          });

          // Create sync record
          await this.#createSyncRecord({
            ckamalIssueId: created.id,
            githubIssueNumber: ghIssue.number,
            owner,
            repo,
            companyId: options.companyId,
            direction: 'github_to_ckamal'
          });
        }

        // Sync comments if enabled
        if (options.syncComments !== false) {
          const ckamalId = syncRecord?.ckamalIssueId || results.created[results.created.length - 1]?.ckamalId;
          if (ckamalId) {
            const commentCount = await this.#syncIssueCommentsFromGitHub(
              ghIssue.number,
              owner,
              repo,
              ckamalId
            );
            results.commentsSynced += commentCount;
          }
        }
      } catch (error) {
        results.failed.push({
          githubNumber: ghIssue.number,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Bidirectional sync - sync both ways
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} [options]
   * @param {string} [options.companyId] - Company ID
   * @param {string} [options.conflictResolution='github_wins'] - How to resolve conflicts
   * @returns {Promise<Object>} Sync results
   */
  async syncIssuesBidirectional(owner, repo, options = {}) {
    this.#ensureConfigured();

    // First sync from GitHub to Ckamal
    const fromResults = await this.syncIssuesFromGitHub(owner, repo, {
      ...options,
      state: 'all'
    });

    // Then sync from Ckamal to GitHub (for new issues and updates)
    const toResults = await this.syncIssuesToGitHub(owner, repo, options);

    return {
      fromGitHub: fromResults,
      toGitHub: toResults,
      summary: {
        totalCreated: fromResults.created.length + toResults.created.length,
        totalUpdated: fromResults.updated.length + toResults.updated.length,
        totalFailed: fromResults.failed.length + toResults.failed.length,
        totalCommentsSynced: fromResults.commentsSynced + toResults.commentsSynced
      }
    };
  }

  // ============================================================================
  // PULL REQUEST OPERATIONS
  // ============================================================================

  /**
   * List pull requests
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} [options]
   * @param {string} [options.state='open'] - PR state: open, closed, all
   * @param {string} [options.sort='created'] - Sort field
   * @param {string} [options.direction='desc'] - Sort direction
   * @param {string} [options.head] - Filter by head branch
   * @param {string} [options.base] - Filter by base branch
   * @returns {Promise<Array>} List of pull requests
   */
  async listPullRequests(owner, repo, options = {}) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.pulls.list({
      owner,
      repo,
      state: options.state || 'open',
      sort: options.sort || 'created',
      direction: options.direction || 'desc',
      head: options.head,
      base: options.base,
      per_page: options.perPage || DEFAULT_PER_PAGE,
      page: options.page || 1
    });

    return data.map(pr => this.#formatPullRequest(pr));
  }

  /**
   * Get a specific pull request
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} pullNumber - Pull request number
   * @returns {Promise<Object>} Pull request details
   */
  async getPullRequest(owner, repo, pullNumber) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber
    });

    return this.#formatPullRequest(data);
  }

  /**
   * Get pull request files
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} pullNumber - Pull request number
   * @returns {Promise<Array>} Changed files
   */
  async getPullRequestFiles(owner, repo, pullNumber) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100
    });

    return data.map(file => ({
      filename: file.filename,
      status: file.status, // added, removed, modified, renamed
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
      previousFilename: file.previous_filename
    }));
  }

  /**
   * Get pull request reviews
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} pullNumber - Pull request number
   * @returns {Promise<Array>} Reviews
   */
  async getPullRequestReviews(owner, repo, pullNumber) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber
    });

    return data.map(review => ({
      id: review.id,
      user: review.user?.login,
      body: review.body,
      state: review.state, // APPROVED, CHANGES_REQUESTED, COMMENTED
      submittedAt: review.submitted_at,
      commitId: review.commit_id
    }));
  }

  /**
   * Create a pull request
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} prData - Pull request data
   * @returns {Promise<Object>} Created pull request
   */
  async createPullRequest(owner, repo, prData) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.pulls.create({
      owner,
      repo,
      title: prData.title,
      body: prData.body,
      head: prData.head,
      base: prData.base,
      draft: prData.draft || false,
      maintainer_can_modify: prData.maintainerCanModify !== false
    });

    return this.#formatPullRequest(data);
  }

  /**
   * Merge a pull request
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} pullNumber - Pull request number
   * @param {Object} [options]
   * @returns {Promise<Object>} Merge result
   */
  async mergePullRequest(owner, repo, pullNumber, options = {}) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      commit_title: options.commitTitle,
      commit_message: options.commitMessage,
      sha: options.sha,
      merge_method: options.mergeMethod || 'merge' // merge, squash, rebase
    });

    return {
      sha: data.sha,
      merged: data.merged,
      message: data.message
    };
  }

  /**
   * Update a pull request
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} pullNumber - Pull request number
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated pull request
   */
  async updatePullRequest(owner, repo, pullNumber, updates) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      title: updates.title,
      body: updates.body,
      state: updates.state,
      base: updates.base
    });

    return this.#formatPullRequest(data);
  }

  // ============================================================================
  // RELEASE OPERATIONS
  // ============================================================================

  /**
   * List releases
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} [options]
   * @returns {Promise<Array>} List of releases
   */
  async listReleases(owner, repo, options = {}) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.repos.listReleases({
      owner,
      repo,
      per_page: options.perPage || DEFAULT_PER_PAGE,
      page: options.page || 1
    });

    return data.map(release => this.#formatRelease(release));
  }

  /**
   * Get a specific release
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} releaseId - Release ID
   * @returns {Promise<Object>} Release details
   */
  async getRelease(owner, repo, releaseId) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.repos.getRelease({
      owner,
      repo,
      release_id: releaseId
    });

    return this.#formatRelease(data);
  }

  /**
   * Get latest release
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<Object|null>} Latest release or null
   */
  async getLatestRelease(owner, repo) {
    this.#ensureConfigured();

    try {
      const { data } = await this.#octokit.rest.repos.getLatestRelease({
        owner,
        repo
      });
      return this.#formatRelease(data);
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a release
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} releaseData - Release data
   * @returns {Promise<Object>} Created release
   */
  async createRelease(owner, repo, releaseData) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: releaseData.tagName,
      name: releaseData.name,
      body: releaseData.body,
      draft: releaseData.draft || false,
      prerelease: releaseData.prerelease || false,
      target_commitish: releaseData.targetCommitish
    });

    return this.#formatRelease(data);
  }

  /**
   * Update a release
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} releaseId - Release ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated release
   */
  async updateRelease(owner, repo, releaseId, updates) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.repos.updateRelease({
      owner,
      repo,
      release_id: releaseId,
      name: updates.name,
      body: updates.body,
      draft: updates.draft,
      prerelease: updates.prerelease
    });

    return this.#formatRelease(data);
  }

  /**
   * Delete a release
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} releaseId - Release ID
   * @returns {Promise<boolean>}
   */
  async deleteRelease(owner, repo, releaseId) {
    this.#ensureConfigured();

    await this.#octokit.rest.repos.deleteRelease({
      owner,
      repo,
      release_id: releaseId
    });

    return true;
  }

  // ============================================================================
  // WEBHOOK OPERATIONS
  // ============================================================================

  /**
   * Create a webhook on a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} config - Webhook configuration
   * @returns {Promise<Object>} Created webhook
   */
  async createWebhook(owner, repo, config) {
    this.#ensureConfigured();

    const events = config.events?.filter(e => VALID_WEBHOOK_EVENTS.includes(e)) || ['push'];
    
    const { data } = await this.#octokit.rest.repos.createWebhook({
      owner,
      repo,
      config: {
        url: config.url,
        content_type: config.contentType || 'json',
        secret: config.secret || this.#webhookSecret,
        insecure_ssl: config.insecureSsl ? '1' : '0'
      },
      events,
      active: config.active !== false
    });

    return {
      id: data.id,
      url: data.config.url,
      events: data.events,
      active: data.active,
      createdAt: data.created_at
    };
  }

  /**
   * List webhooks on a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<Array>} List of webhooks
   */
  async listWebhooks(owner, repo) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.repos.listWebhooks({
      owner,
      repo
    });

    return data.map(hook => ({
      id: hook.id,
      url: hook.config.url,
      events: hook.events,
      active: hook.active,
      createdAt: hook.created_at,
      updatedAt: hook.updated_at
    }));
  }

  /**
   * Delete a webhook
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} hookId - Webhook ID
   * @returns {Promise<boolean>}
   */
  async deleteWebhook(owner, repo, hookId) {
    this.#ensureConfigured();

    await this.#octokit.rest.repos.deleteWebhook({
      owner,
      repo,
      hook_id: hookId
    });

    return true;
  }

  /**
   * Handle incoming GitHub webhook
   * @param {string} eventType - X-GitHub-Event header value
   * @param {Object} payload - Webhook payload
   * @param {string} signature - X-Hub-Signature-256 header value
   * @returns {Promise<Object>} Processing result
   */
  async handleWebhook(eventType, payload, signature) {
    // Verify signature if secret is configured
    if (this.#webhookSecret && signature) {
      const isValid = await this.#verifyWebhookSignature(payload, signature);
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }
    }

    const result = {
      event: eventType,
      processed: false,
      actions: []
    };

    switch (eventType) {
      case 'issues':
        result.actions.push(await this.#handleIssueWebhook(payload));
        result.processed = true;
        break;
      case 'issue_comment':
        result.actions.push(await this.#handleIssueCommentWebhook(payload));
        result.processed = true;
        break;
      case 'pull_request':
        result.actions.push(await this.#handlePullRequestWebhook(payload));
        result.processed = true;
        break;
      case 'release':
        result.actions.push(await this.#handleReleaseWebhook(payload));
        result.processed = true;
        break;
      case 'push':
        result.actions.push(await this.#handlePushWebhook(payload));
        result.processed = true;
        break;
      default:
        result.actions.push({ type: 'ignored', reason: 'unhandled_event_type' });
    }

    return result;
  }

  // ============================================================================
  // LABEL OPERATIONS
  // ============================================================================

  /**
   * List labels in a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<Array>} List of labels
   */
  async listLabels(owner, repo) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.issues.listLabelsForRepo({
      owner,
      repo,
      per_page: 100
    });

    return data.map(label => ({
      name: label.name,
      color: label.color,
      description: label.description,
      default: label.default
    }));
  }

  /**
   * Create a label
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} labelData - Label data
   * @returns {Promise<Object>} Created label
   */
  async createLabel(owner, repo, labelData) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.issues.createLabel({
      owner,
      repo,
      name: labelData.name,
      color: labelData.color.replace('#', ''),
      description: labelData.description
    });

    return {
      name: data.name,
      color: data.color,
      description: data.description
    };
  }

  /**
   * Update a label
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} name - Current label name
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated label
   */
  async updateLabel(owner, repo, name, updates) {
    this.#ensureConfigured();

    const { data } = await this.#octokit.rest.issues.updateLabel({
      owner,
      repo,
      name,
      new_name: updates.newName,
      color: updates.color?.replace('#', ''),
      description: updates.description
    });

    return {
      name: data.name,
      color: data.color,
      description: data.description
    };
  }

  /**
   * Delete a label
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} name - Label name
   * @returns {Promise<boolean>}
   */
  async deleteLabel(owner, repo, name) {
    this.#ensureConfigured();

    await this.#octokit.rest.issues.deleteLabel({
      owner,
      repo,
      name
    });

    return true;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Ensure service is configured
   * @private
   */
  #ensureConfigured() {
    if (!this.isConfigured()) {
      throw new Error('GitHub service not configured. Set GITHUB_TOKEN environment variable.');
    }
  }

  /**
   * Format repository object
   * @private
   */
  #formatRepository(repo) {
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      fork: repo.fork,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      defaultBranch: repo.default_branch,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      owner: {
        login: repo.owner.login,
        type: repo.owner.type,
        avatarUrl: repo.owner.avatar_url
      }
    };
  }

  /**
   * Format issue object
   * @private
   */
  #formatIssue(issue) {
    return {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      url: issue.html_url,
      labels: issue.labels.map(l => ({
        name: l.name,
        color: l.color,
        description: l.description
      })),
      assignees: issue.assignees.map(a => a.login),
      milestone: issue.milestone?.title,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at,
      author: issue.user?.login,
      comments: issue.comments
    };
  }

  /**
   * Format comment object
   * @private
   */
  #formatComment(comment) {
    return {
      id: comment.id,
      body: comment.body,
      author: comment.user?.login,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      url: comment.html_url
    };
  }

  /**
   * Format pull request object
   * @private
   */
  #formatPullRequest(pr) {
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      url: pr.html_url,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
        repo: pr.head.repo?.full_name
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
        repo: pr.base.repo?.full_name
      },
      author: pr.user?.login,
      assignees: pr.assignees.map(a => a.login),
      reviewers: pr.requested_reviewers?.map(r => r.login) || [],
      draft: pr.draft,
      mergeable: pr.mergeable,
      mergeableState: pr.mergeable_state,
      merged: pr.merged,
      mergedAt: pr.merged_at,
      mergedBy: pr.merged_by?.login,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      closedAt: pr.closed_at,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      comments: pr.comments,
      reviewComments: pr.review_comments
    };
  }

  /**
   * Format release object
   * @private
   */
  #formatRelease(release) {
    return {
      id: release.id,
      tagName: release.tag_name,
      name: release.name,
      body: release.body,
      draft: release.draft,
      prerelease: release.prerelease,
      author: release.author?.login,
      url: release.html_url,
      tarballUrl: release.tarball_url,
      zipballUrl: release.zipball_url,
      assets: release.assets.map(asset => ({
        id: asset.id,
        name: asset.name,
        size: asset.size,
        downloadUrl: asset.browser_download_url,
        contentType: asset.content_type
      })),
      createdAt: release.created_at,
      publishedAt: release.published_at
    };
  }

  /**
   * Ensure standard labels exist on repository
   * @private
   */
  async #ensureLabelsExist(owner, repo) {
    const existingLabels = await this.listLabels(owner, repo);
    const existingNames = new Set(existingLabels.map(l => l.name));

    const labelsToCreate = [];
    
    // Check priority labels
    for (const [key, label] of Object.entries(DEFAULT_LABEL_MAPPINGS.priority)) {
      if (!existingNames.has(label.name)) {
        labelsToCreate.push(label);
      }
    }
    
    // Check status labels
    for (const [key, label] of Object.entries(DEFAULT_LABEL_MAPPINGS.status)) {
      if (!existingNames.has(label.name)) {
        labelsToCreate.push(label);
      }
    }

    // Create missing labels
    for (const label of labelsToCreate) {
      try {
        await this.createLabel(owner, repo, label);
      } catch (error) {
        // Label might already exist or be a reserved name
        console.warn(`[GitHubService] Failed to create label ${label.name}: ${error.message}`);
      }
    }
  }

  /**
   * Get sync record by Ckamal issue ID
   * @private
   */
  async #getSyncRecord(ckamalIssueId, owner, repo) {
    if (!this.#syncRepo) return null;
    return this.#syncRepo.findByCkamalIssue(ckamalIssueId, owner, repo);
  }

  /**
   * Get sync record by GitHub issue number
   * @private
   */
  async #getSyncRecordByGitHubNumber(owner, repo, githubIssueNumber) {
    if (!this.#syncRepo) return null;
    return this.#syncRepo.findByGitHubIssue(owner, repo, githubIssueNumber);
  }

  /**
   * Create sync record
   * @private
   */
  async #createSyncRecord(data) {
    if (!this.#syncRepo) return null;
    
    return this.#syncRepo.create({
      id: generateUUID(),
      ckamal_issue_id: data.ckamalIssueId,
      github_issue_number: data.githubIssueNumber,
      github_owner: data.owner,
      github_repo: data.repo,
      company_id: data.companyId,
      sync_direction: data.direction,
      last_sync_at: now(),
      created_at: now()
    });
  }

  /**
   * Sync issue comments to GitHub
   * @private
   */
  async #syncIssueCommentsToGitHub(ckamalIssue, owner, repo, githubIssueNumber) {
    if (!githubIssueNumber) return 0;
    
    const comments = await this.#issueService.getComments(ckamalIssue.id);
    let synced = 0;

    for (const comment of comments) {
      // Check if already synced (skip system comments)
      if (comment.commentType === 'system') continue;
      
      const body = `[${comment.authorType === 'agent' ? '🤖 Agent' : '👤 User'} ${comment.authorId}]:\n\n${comment.content}`;
      
      try {
        await this.createIssueComment(owner, repo, githubIssueNumber, body);
        synced++;
      } catch (error) {
        console.warn(`[GitHubService] Failed to sync comment: ${error.message}`);
      }
    }

    return synced;
  }

  /**
   * Sync issue comments from GitHub
   * @private
   */
  async #syncIssueCommentsFromGitHub(githubIssueNumber, owner, repo, ckamalIssueId) {
    const comments = await this.getIssueComments(owner, repo, githubIssueNumber);
    let synced = 0;

    for (const comment of comments) {
      // Skip comments already synced (those with Ckamal markers)
      if (comment.body.includes('*Synced from Ckamal')) continue;
      
      try {
        await this.#issueService.addComment(ckamalIssueId, {
          content: `[GitHub @${comment.author}]:\n\n${comment.body}`,
          authorType: 'system',
          commentType: 'comment'
        });
        synced++;
      } catch (error) {
        console.warn(`[GitHubService] Failed to sync comment from GitHub: ${error.message}`);
      }
    }

    return synced;
  }

  /**
   * Check if Ckamal issue needs update from GitHub
   * @private
   */
  #needsUpdate(ckamalIssue, ghIssue) {
    // Compare timestamps or content
    const ghUpdated = new Date(ghIssue.updatedAt);
    const localUpdated = new Date(ckamalIssue.updatedAt);
    return ghUpdated > localUpdated;
  }

  /**
   * Verify webhook signature
   * @private
   */
  async #verifyWebhookSignature(payload, signature) {
    if (!this.#webhookSecret) return true;
    
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', this.#webhookSecret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  /**
   * Handle issues webhook
   * @private
   */
  async #handleIssueWebhook(payload) {
    const { action, issue, repository } = payload;
    
    return {
      type: 'issue',
      action,
      issueNumber: issue?.number,
      repo: repository?.full_name,
      timestamp: now()
    };
  }

  /**
   * Handle issue_comment webhook
   * @private
   */
  async #handleIssueCommentWebhook(payload) {
    const { action, comment, issue, repository } = payload;
    
    return {
      type: 'issue_comment',
      action,
      issueNumber: issue?.number,
      commentId: comment?.id,
      repo: repository?.full_name,
      timestamp: now()
    };
  }

  /**
   * Handle pull_request webhook
   * @private
   */
  async #handlePullRequestWebhook(payload) {
    const { action, pull_request, repository } = payload;
    
    return {
      type: 'pull_request',
      action,
      prNumber: pull_request?.number,
      repo: repository?.full_name,
      timestamp: now()
    };
  }

  /**
   * Handle release webhook
   * @private
   */
  async #handleReleaseWebhook(payload) {
    const { action, release, repository } = payload;
    
    return {
      type: 'release',
      action,
      tagName: release?.tag_name,
      repo: repository?.full_name,
      timestamp: now()
    };
  }

  /**
   * Handle push webhook
   * @private
   */
  async #handlePushWebhook(payload) {
    const { ref, commits, repository, pusher } = payload;
    
    return {
      type: 'push',
      ref,
      commitCount: commits?.length || 0,
      repo: repository?.full_name,
      pusher: pusher?.name,
      timestamp: now()
    };
  }
}

// ============================================================================
// GITHUB SYNC REPOSITORY (for migration use)
// ============================================================================

/**
 * Repository for GitHub sync records
 * Manages the link between Ckamal issues and GitHub issues
 */
export class GitHubSyncRepository {
  #pool = null;

  constructor(pool) {
    this.#pool = pool;
  }

  /**
   * Find sync record by Ckamal issue ID
   */
  async findByCkamalIssue(ckamalIssueId, owner, repo) {
    const sql = `
      SELECT * FROM github_issue_sync 
      WHERE ckamal_issue_id = ? AND github_owner = ? AND github_repo = ?
      AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return this.#pool.get(sql, [ckamalIssueId, owner, repo]);
  }

  /**
   * Find sync record by GitHub issue
   */
  async findByGitHubIssue(owner, repo, githubIssueNumber) {
    const sql = `
      SELECT * FROM github_issue_sync 
      WHERE github_owner = ? AND github_repo = ? AND github_issue_number = ?
      AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return this.#pool.get(sql, [owner, repo, githubIssueNumber]);
  }

  /**
   * Create sync record
   */
  async create(data) {
    const sql = `
      INSERT INTO github_issue_sync (
        id, ckamal_issue_id, github_issue_number, github_owner, github_repo,
        company_id, sync_direction, last_sync_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return this.#pool.run(sql, [
      data.id,
      data.ckamal_issue_id,
      data.github_issue_number,
      data.github_owner,
      data.github_repo,
      data.company_id,
      data.sync_direction,
      data.last_sync_at,
      data.created_at
    ]);
  }

  /**
   * Update last sync time
   */
  async updateLastSync(id) {
    const sql = `
      UPDATE github_issue_sync 
      SET last_sync_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    return this.#pool.run(sql, [id]);
  }

  /**
   * List sync records for a company
   */
  async findByCompany(companyId, options = {}) {
    let sql = `
      SELECT * FROM github_issue_sync 
      WHERE company_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    return this.#pool.all(sql, [companyId]);
  }

  /**
   * Soft delete sync record
   */
  async softDelete(id) {
    const sql = `
      UPDATE github_issue_sync 
      SET deleted_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    return this.#pool.run(sql, [id]);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create GitHub service instance
 * @param {Object} options
 * @returns {GitHubService}
 */
export function createGitHubService(options = {}) {
  return new GitHubService(options);
}

/**
 * Create GitHub sync repository
 * @param {Object} pool - Database connection pool
 * @returns {GitHubSyncRepository}
 */
export function createGitHubSyncRepository(pool) {
  return new GitHubSyncRepository(pool);
}

export default {
  GitHubService,
  GitHubSyncRepository,
  createGitHubService,
  createGitHubSyncRepository,
  DEFAULT_LABEL_MAPPINGS,
  VALID_WEBHOOK_EVENTS
};
