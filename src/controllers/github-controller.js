/**
 * @fileoverview GitHub Integration REST API Controller
 * @module controllers/github-controller
 * 
 * HTTP endpoints for GitHub integration:
 * - GET /api/github/repos - List repositories
 * - GET /api/github/repos/:owner/:repo - Get repository details
 * - GET /api/github/repos/:owner/:repo/issues - List issues
 * - POST /api/github/repos/:owner/:repo/issues/sync - Sync issues bidirectionally
 * - GET /api/github/repos/:owner/:repo/pulls - List pull requests
 * - GET /api/github/repos/:owner/:repo/releases - List releases
 * - POST /api/github/webhooks - Receive GitHub webhooks
 */

import { GitHubService } from '../domains/integrations/github-service.js';
import { formatResponse, formatListResponse, handleError, parsePagination } from './helpers.js';

/**
 * GitHub Controller - REST API endpoints for GitHub integration
 */
export class GitHubController {
  /**
   * @param {Object} options
   * @param {GitHubService} [options.service] - GitHub service instance
   * @param {Object} [options.repositories] - Repository factory
   */
  constructor(options = {}) {
    this.service = options.service || null;
    this.repositories = options.repositories || null;
    
    // Initialize service if not provided but we have repos
    if (!this.service) {
      this.service = new GitHubService({ 
        repositories: this.repositories 
      });
    }
  }

  /**
   * Initialize controller with dependencies
   * @param {Object} deps - Dependencies
   */
  async initialize(deps = {}) {
    if (deps.repositories) {
      this.repositories = deps.repositories;
    }
    if (deps.issueService) {
      this.issueService = deps.issueService;
    }
    
    if (!this.service) {
      this.service = new GitHubService({
        repositories: this.repositories,
        issueService: this.issueService
      });
    } else if (this.issueService) {
      this.service.initialize({
        repositories: this.repositories,
        issueService: this.issueService
      });
    }
  }

  // ============================================================================
  // REPOSITORY ENDPOINTS
  // ============================================================================

  /**
   * GET /api/github/repos - List repositories
   * Query params:
   * - type: all, owner, member (default: all)
   * - sort: created, updated, pushed, full_name (default: updated)
   * - direction: asc, desc (default: desc)
   * - limit: number (default: 30)
   * - page: number (default: 1)
   */
  async listRepositories(req, res) {
    try {
      this.#ensureConfigured();

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const options = {
        type: url.searchParams.get('type') || 'all',
        sort: url.searchParams.get('sort') || 'updated',
        direction: url.searchParams.get('direction') || 'desc',
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      // Support org-specific listing
      const org = url.searchParams.get('org');
      let repos;
      if (org) {
        repos = await this.service.listOrgRepositories(org, options);
      } else {
        repos = await this.service.listRepositories(options);
      }

      this._sendJson(res, 200, formatListResponse(repos, {
        total: repos.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo - Get repository details
   */
  async getRepository(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const repository = await this.service.getRepository(owner, repo);

      this._sendJson(res, 200, formatResponse(repository));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * POST /api/github/repos - Create a new repository
   */
  async createRepository(req, res) {
    try {
      this.#ensureConfigured();

      const body = await this._parseBody(req);
      
      if (!body.name) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Repository name is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const repository = await this.service.createRepository(body.name, {
        description: body.description,
        private: body.private,
        autoInit: body.autoInit,
        org: body.org
      });

      this._sendJson(res, 201, formatResponse(repository));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * POST /api/github/repos/:owner/:repo/fork - Fork a repository
   */
  async forkRepository(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const body = await this._parseBody(req).catch(() => ({}));

      const forked = await this.service.forkRepository(owner, repo, {
        org: body.org,
        name: body.name,
        defaultBranchOnly: body.defaultBranchOnly
      });

      this._sendJson(res, 201, formatResponse(forked));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/search/repos - Search repositories
   */
  async searchRepositories(req, res) {
    try {
      this.#ensureConfigured();

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = url.searchParams.get('q');
      
      if (!query) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Search query is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const options = {
        sort: url.searchParams.get('sort'),
        order: url.searchParams.get('order') || 'desc',
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      const result = await this.service.searchRepositories(query, options);

      this._sendJson(res, 200, formatResponse(result.repositories, {
        total: result.total,
        incomplete: result.incomplete
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  // ============================================================================
  // ISSUE ENDPOINTS
  // ============================================================================

  /**
   * GET /api/github/repos/:owner/:repo/issues - List issues
   * Query params:
   * - state: open, closed, all (default: open)
   * - labels: comma-separated list
   * - assignee: username
   * - sort: created, updated, comments (default: created)
   * - direction: asc, desc (default: desc)
   */
  async listIssues(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      const options = {
        state: url.searchParams.get('state') || 'open',
        sort: url.searchParams.get('sort') || 'created',
        direction: url.searchParams.get('direction') || 'desc',
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      // Parse labels
      const labelsParam = url.searchParams.get('labels');
      if (labelsParam) {
        options.labels = labelsParam.split(',').map(l => l.trim());
      }

      const assignee = url.searchParams.get('assignee');
      if (assignee) options.assignee = assignee;

      const issues = await this.service.listIssues(owner, repo, options);

      this._sendJson(res, 200, formatListResponse(issues, {
        total: issues.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo/issues/:number - Get issue
   */
  async getIssue(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, number } = params;
      const issue = await this.service.getIssue(owner, repo, parseInt(number));

      this._sendJson(res, 200, formatResponse(issue));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * POST /api/github/repos/:owner/:repo/issues - Create issue
   */
  async createIssue(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const body = await this._parseBody(req);

      if (!body.title) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Issue title is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const issue = await this.service.createIssue(owner, repo, {
        title: body.title,
        body: body.body,
        labels: body.labels,
        assignees: body.assignees,
        milestone: body.milestone
      });

      this._sendJson(res, 201, formatResponse(issue));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * PATCH /api/github/repos/:owner/:repo/issues/:number - Update issue
   */
  async updateIssue(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, number } = params;
      const body = await this._parseBody(req);

      const issue = await this.service.updateIssue(owner, repo, parseInt(number), body);

      this._sendJson(res, 200, formatResponse(issue));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo/issues/:number/comments - Get issue comments
   */
  async getIssueComments(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, number } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      const options = {
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      const since = url.searchParams.get('since');
      if (since) options.since = since;

      const comments = await this.service.getIssueComments(owner, repo, parseInt(number), options);

      this._sendJson(res, 200, formatListResponse(comments, {
        total: comments.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * POST /api/github/repos/:owner/:repo/issues/:number/comments - Create comment
   */
  async createIssueComment(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, number } = params;
      const body = await this._parseBody(req);

      if (!body.body) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Comment body is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const comment = await this.service.createIssueComment(
        owner, 
        repo, 
        parseInt(number), 
        body.body
      );

      this._sendJson(res, 201, formatResponse(comment));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  // ============================================================================
  // ISSUE SYNC ENDPOINTS
  // ============================================================================

  /**
   * POST /api/github/repos/:owner/:repo/issues/sync - Sync issues
   * Body:
   * - direction: 'to_github', 'from_github', 'bidirectional' (default: bidirectional)
   * - issueIds: string[] - Specific issue IDs to sync
   * - syncComments: boolean (default: true)
   * - companyId: string - Required for from_github direction
   */
  async syncIssues(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const body = await this._parseBody(req);
      const companyId = body.companyId || this._getCompanyId(req);

      const direction = body.direction || 'bidirectional';
      const options = {
        issueIds: body.issueIds,
        syncComments: body.syncComments !== false,
        companyId
      };

      let result;
      switch (direction) {
        case 'to_github':
          result = await this.service.syncIssuesToGitHub(owner, repo, options);
          break;
        case 'from_github':
          if (!companyId) {
            return this._sendJson(res, 400, {
              success: false,
              error: 'Company ID is required for syncing from GitHub',
              code: 'VALIDATION_ERROR'
            });
          }
          result = await this.service.syncIssuesFromGitHub(owner, repo, options);
          break;
        case 'bidirectional':
          if (!companyId) {
            return this._sendJson(res, 400, {
              success: false,
              error: 'Company ID is required for bidirectional sync',
              code: 'VALIDATION_ERROR'
            });
          }
          result = await this.service.syncIssuesBidirectional(owner, repo, options);
          break;
        default:
          return this._sendJson(res, 400, {
            success: false,
            error: `Invalid direction: ${direction}. Use 'to_github', 'from_github', or 'bidirectional'`,
            code: 'VALIDATION_ERROR'
          });
      }

      this._sendJson(res, 200, formatResponse({
        direction,
        owner,
        repo,
        ...result
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo/sync-status - Get sync status
   */
  async getSyncStatus(req, res, params) {
    try {
      const { owner, repo } = params;
      const companyId = this._getCompanyId(req);

      // This would query the sync repository for status
      // For now, return a placeholder
      this._sendJson(res, 200, formatResponse({
        owner,
        repo,
        companyId,
        status: 'active',
        lastSync: null,
        message: 'Sync status tracking not yet implemented'
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // PULL REQUEST ENDPOINTS
  // ============================================================================

  /**
   * GET /api/github/repos/:owner/:repo/pulls - List pull requests
   * Query params:
   * - state: open, closed, all (default: open)
   * - head: Filter by head branch (format: user:branch)
   * - base: Filter by base branch
   * - sort: created, updated, popularity, long-running (default: created)
   * - direction: asc, desc (default: desc)
   */
  async listPullRequests(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      const options = {
        state: url.searchParams.get('state') || 'open',
        sort: url.searchParams.get('sort') || 'created',
        direction: url.searchParams.get('direction') || 'desc',
        head: url.searchParams.get('head'),
        base: url.searchParams.get('base'),
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      const pulls = await this.service.listPullRequests(owner, repo, options);

      this._sendJson(res, 200, formatListResponse(pulls, {
        total: pulls.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo/pulls/:number - Get pull request
   */
  async getPullRequest(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, number } = params;
      const pr = await this.service.getPullRequest(owner, repo, parseInt(number));

      this._sendJson(res, 200, formatResponse(pr));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo/pulls/:number/files - Get PR files
   */
  async getPullRequestFiles(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, number } = params;
      const files = await this.service.getPullRequestFiles(owner, repo, parseInt(number));

      this._sendJson(res, 200, formatListResponse(files, {
        total: files.length,
        limit: files.length,
        offset: 0
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo/pulls/:number/reviews - Get PR reviews
   */
  async getPullRequestReviews(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, number } = params;
      const reviews = await this.service.getPullRequestReviews(owner, repo, parseInt(number));

      this._sendJson(res, 200, formatListResponse(reviews, {
        total: reviews.length,
        limit: reviews.length,
        offset: 0
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * POST /api/github/repos/:owner/:repo/pulls - Create pull request
   */
  async createPullRequest(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const body = await this._parseBody(req);

      if (!body.title || !body.head || !body.base) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Title, head, and base are required',
          code: 'VALIDATION_ERROR'
        });
      }

      const pr = await this.service.createPullRequest(owner, repo, {
        title: body.title,
        body: body.body,
        head: body.head,
        base: body.base,
        draft: body.draft,
        maintainerCanModify: body.maintainerCanModify
      });

      this._sendJson(res, 201, formatResponse(pr));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * PUT /api/github/repos/:owner/:repo/pulls/:number/merge - Merge pull request
   */
  async mergePullRequest(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, number } = params;
      const body = await this._parseBody(req).catch(() => ({}));

      const result = await this.service.mergePullRequest(owner, repo, parseInt(number), {
        commitTitle: body.commitTitle,
        commitMessage: body.commitMessage,
        sha: body.sha,
        mergeMethod: body.mergeMethod
      });

      this._sendJson(res, 200, formatResponse(result));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  // ============================================================================
  // RELEASE ENDPOINTS
  // ============================================================================

  /**
   * GET /api/github/repos/:owner/:repo/releases - List releases
   */
  async listReleases(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      const options = parsePagination(Object.fromEntries(url.searchParams));
      const releases = await this.service.listReleases(owner, repo, options);

      this._sendJson(res, 200, formatListResponse(releases, {
        total: releases.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo/releases/latest - Get latest release
   */
  async getLatestRelease(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const release = await this.service.getLatestRelease(owner, repo);

      if (!release) {
        return this._sendJson(res, 404, {
          success: false,
          error: 'No releases found',
          code: 'NOT_FOUND'
        });
      }

      this._sendJson(res, 200, formatResponse(release));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo/releases/:id - Get release
   */
  async getRelease(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, id } = params;
      const release = await this.service.getRelease(owner, repo, parseInt(id));

      this._sendJson(res, 200, formatResponse(release));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * POST /api/github/repos/:owner/:repo/releases - Create release
   */
  async createRelease(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const body = await this._parseBody(req);

      if (!body.tagName) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Tag name is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const release = await this.service.createRelease(owner, repo, {
        tagName: body.tagName,
        name: body.name,
        body: body.body,
        draft: body.draft,
        prerelease: body.prerelease,
        targetCommitish: body.targetCommitish
      });

      this._sendJson(res, 201, formatResponse(release));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * PATCH /api/github/repos/:owner/:repo/releases/:id - Update release
   */
  async updateRelease(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, id } = params;
      const body = await this._parseBody(req);

      const release = await this.service.updateRelease(owner, repo, parseInt(id), body);

      this._sendJson(res, 200, formatResponse(release));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * DELETE /api/github/repos/:owner/:repo/releases/:id - Delete release
   */
  async deleteRelease(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, id } = params;
      await this.service.deleteRelease(owner, repo, parseInt(id));

      this._sendJson(res, 200, formatResponse({ deleted: true, id }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  // ============================================================================
  // WEBHOOK ENDPOINTS
  // ============================================================================

  /**
   * POST /api/github/webhooks - Receive GitHub webhooks
   * Headers:
   * - X-GitHub-Event: Event type
   * - X-GitHub-Delivery: Delivery ID
   * - X-Hub-Signature-256: Signature for verification
   */
  async handleWebhook(req, res) {
    try {
      const eventType = req.headers['x-github-event'];
      const signature = req.headers['x-hub-signature-256'];
      const deliveryId = req.headers['x-github-delivery'];

      if (!eventType) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'X-GitHub-Event header is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const body = await this._parseBody(req);
      
      const result = await this.service.handleWebhook(eventType, body, signature);

      this._sendJson(res, 200, formatResponse({
        deliveryId,
        event: eventType,
        ...result
      }));
    } catch (error) {
      // Log webhook errors but return 200 to prevent GitHub from retrying
      // if it's a processing error (not a server error)
      console.error('[GitHub Webhook Error]', error);
      
      const isConfigError = error.message?.includes('not configured');
      const statusCode = isConfigError ? 503 : 200;
      
      this._sendJson(res, statusCode, formatResponse({
        processed: false,
        error: error.message,
        warning: 'Webhook received but processing failed'
      }));
    }
  }

  /**
   * GET /api/github/repos/:owner/:repo/webhooks - List webhooks
   */
  async listWebhooks(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const webhooks = await this.service.listWebhooks(owner, repo);

      this._sendJson(res, 200, formatListResponse(webhooks, {
        total: webhooks.length,
        limit: webhooks.length,
        offset: 0
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * POST /api/github/repos/:owner/:repo/webhooks - Create webhook
   */
  async createWebhook(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const body = await this._parseBody(req);

      if (!body.url) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Webhook URL is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const webhook = await this.service.createWebhook(owner, repo, {
        url: body.url,
        events: body.events,
        contentType: body.contentType,
        secret: body.secret,
        insecureSsl: body.insecureSsl,
        active: body.active
      });

      this._sendJson(res, 201, formatResponse(webhook));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * DELETE /api/github/repos/:owner/:repo/webhooks/:id - Delete webhook
   */
  async deleteWebhook(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo, id } = params;
      await this.service.deleteWebhook(owner, repo, parseInt(id));

      this._sendJson(res, 200, formatResponse({ deleted: true, id }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  // ============================================================================
  // LABEL ENDPOINTS
  // ============================================================================

  /**
   * GET /api/github/repos/:owner/:repo/labels - List labels
   */
  async listLabels(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const labels = await this.service.listLabels(owner, repo);

      this._sendJson(res, 200, formatListResponse(labels, {
        total: labels.length,
        limit: labels.length,
        offset: 0
      }));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  /**
   * POST /api/github/repos/:owner/:repo/labels - Create label
   */
  async createLabel(req, res, params) {
    try {
      this.#ensureConfigured();

      const { owner, repo } = params;
      const body = await this._parseBody(req);

      if (!body.name) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Label name is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const label = await this.service.createLabel(owner, repo, {
        name: body.name,
        color: body.color,
        description: body.description
      });

      this._sendJson(res, 201, formatResponse(label));
    } catch (error) {
      this._sendJson(res, this.#getStatusCode(error), handleError(error));
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Ensure service is configured
   * @private
   */
  #ensureConfigured() {
    if (!this.service?.isConfigured()) {
      const error = new Error('GitHub integration not configured. Set GITHUB_TOKEN environment variable.');
      error.code = 'NOT_CONFIGURED';
      throw error;
    }
  }

  /**
   * Get appropriate HTTP status code for error
   * @private
   */
  #getStatusCode(error) {
    if (error.code === 'NOT_CONFIGURED') return 503;
    if (error.code === 'VALIDATION_ERROR') return 400;
    if (error.code === 'NOT_FOUND') return 404;
    if (error.status === 404) return 404;
    if (error.status === 403) return 403;
    if (error.status === 401) return 401;
    if (error.status === 422) return 422;
    return 500;
  }

  /**
   * Parse request body
   * @private
   */
  async _parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   * @private
   */
  _sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  /**
   * Get company ID from request
   * @private
   */
  _getCompanyId(req) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return req.headers['x-company-id'] || 
           url.searchParams.get('companyId') || 
           req.companyId || 
           null;
  }
}

/**
 * Create GitHub controller instance
 * @param {Object} options
 * @returns {GitHubController}
 */
export function createGitHubController(options = {}) {
  return new GitHubController(options);
}

export default GitHubController;
