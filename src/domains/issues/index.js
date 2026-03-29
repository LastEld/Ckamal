/**
 * @fileoverview Issues Domain - Issue/Ticket management system
 * @module domains/issues
 * 
 * A comprehensive issue tracking system inspired by Paperclip's issues:
 * - Full CRUD for issues with company isolation
 * - Threaded comments
 * - Label management
 * - Assignment workflow with history
 * - Read state tracking
 * - Search and filtering
 * 
 * Relationship with Tasks:
 * - Tasks (src/domains/tasks): Simple todo items, Eisenhower matrix, agent execution
 * - Issues (this domain): Full ticket/project management, user collaboration
 * - Issues can optionally link to tasks via task_id
 * 
 * @example
 * ```javascript
 * import { IssueService } from './domains/issues/index.js';
 * 
 * const issueService = new IssueService({
 *   repositories: repoFactory,
 *   companyId: 'company-uuid',
 *   userId: 'user-uuid'
 * });
 * 
 * // Create an issue
 * const issue = await issueService.createIssue({
 *   title: 'Bug: Login not working',
 *   description: 'Users cannot log in with valid credentials',
 *   priority: 'high',
 *   status: 'todo'
 * });
 * 
 * // Add a comment
 * await issueService.addComment(issue.id, {
 *   content: 'Investigating the authentication service logs...'
 * });
 * 
 * // Assign to user
 * await issueService.assignIssue(issue.id, 'user', 'agent-uuid');
 * 
 * // Add labels
 * await issueService.addLabelToIssue(issue.id, 'bug-label-uuid');
 * ```
 */

export { IssueService } from './issue-service.js';
export {
  IssueRepository,
  IssueCommentRepository,
  IssueLabelRepository,
  IssueLabelLinkRepository,
  IssueReadStateRepository,
  IssueAttachmentRepository,
  IssueAssignmentHistoryRepository
} from './issue-repository.js';

// Domain factory for easy initialization
export class IssuesDomain {
  /** @type {IssueService|null} */
  #service = null;

  /**
   * Create issues domain
   * @param {Object} options
   * @param {Object} [options.repositories] - Repository factory
   * @param {string} [options.companyId] - Default company ID
   * @param {string} [options.userId] - Current user ID
   * @param {import('../../db/connection/index.js').ConnectionPool} [options.pool] - DB pool
   */
  constructor(options = {}) {
    this.#service = new IssueService(options);
    
    if (options.pool) {
      this.#service.initializeRepositories(options.pool);
    }
  }

  /**
   * Get the issue service
   * @returns {IssueService}
   */
  get service() {
    return this.#service;
  }

  /**
   * Set company context
   * @param {string} companyId
   */
  setCompany(companyId) {
    this.#service.setCompany(companyId);
  }

  /**
   * Set user context
   * @param {string} userId
   */
  setUser(userId) {
    this.#service.setUser(userId);
  }
}

export default IssuesDomain;
