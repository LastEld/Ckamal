/**
 * @fileoverview Session Manager - Manages agent session persistence and rotation
 * Inspired by Paperclip's session management in heartbeat system.
 * @module runtime/session-manager
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Default session compaction configuration
 * @type {Object}
 */
const DEFAULT_COMPACTION_CONFIG = {
  enabled: true,
  maxSessionRuns: 10,
  maxRawInputTokens: 100000,
  maxSessionAgeHours: 24
};

/**
 * SessionManager - Manages agent session persistence
 * @extends EventEmitter
 */
export class SessionManager extends EventEmitter {
  /**
   * Create a new SessionManager
   * @param {Object} options - Configuration options
   * @param {import('../db/connection/index.js').ConnectionPool} options.db - Database connection pool
   * @param {Object} options.config - Session configuration
   */
  constructor(options = {}) {
    super();
    
    this.db = options.db;
    this.config = {
      compaction: { ...DEFAULT_COMPACTION_CONFIG, ...options.config?.compaction }
    };
    
    // In-memory session cache
    this.sessionCache = new Map();
    this.cacheTtlMs = options.cacheTtlMs || 60000;
  }

  /**
   * Initialize the session manager
   * @returns {Promise<SessionManager>}
   */
  async initialize() {
    this.emit('initialized');
    return this;
  }

  /**
   * Dispose the session manager
   * @returns {Promise<void>}
   */
  async dispose() {
    this.sessionCache.clear();
    this.removeAllListeners();
  }

  // ============================================
  // Session CRUD
  // ============================================

  /**
   * Get a session for an agent/task combination
   * @param {string} agentId - Agent ID
   * @param {string} taskKey - Task/issue identifier
   * @param {string} [provider] - Provider name (claude, kimi, codex)
   * @returns {Promise<Object|null>} Session or null
   */
  async getSession(agentId, taskKey, provider) {
    const cacheKey = this._getCacheKey(agentId, taskKey, provider);
    
    // Check cache first
    const cached = this.sessionCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs) {
      return cached.session;
    }
    
    // Query database
    const conditions = ['agent_id = ?', 'task_key = ?'];
    const values = [agentId, taskKey];
    
    if (provider) {
      conditions.push('provider = ?');
      values.push(provider);
    }
    
    const sql = `
      SELECT * FROM agent_sessions
      WHERE ${conditions.join(' AND ')}
      LIMIT 1
    `;
    
    const session = await this.db.get(sql, values);
    
    if (session) {
      const formatted = this._formatSession(session);
      this.sessionCache.set(cacheKey, { session: formatted, cachedAt: Date.now() });
      return formatted;
    }
    
    return null;
  }

  /**
   * Set/update a session
   * @param {Object} params - Session parameters
   * @param {string} params.agentId - Agent ID
   * @param {string} params.taskKey - Task/issue identifier
   * @param {string} params.provider - Provider name
   * @param {Object} [params.sessionParams] - Session parameters for restoration
   * @param {string} [params.sessionDisplayId] - Human-readable session ID
   * @param {string} [params.lastRunId] - Last run ID
   * @param {string} [params.lastError] - Last error message
   * @param {Object} [params.usage] - Token usage for this run
   * @returns {Promise<Object>} Updated session
   */
  async setSession(params) {
    const {
      agentId,
      taskKey,
      provider,
      sessionParams,
      sessionDisplayId,
      lastRunId,
      lastError,
      usage
    } = params;
    
    const existing = await this.getSession(agentId, taskKey, provider);
    const now = new Date().toISOString();
    
    let session;
    
    if (existing) {
      // Update existing session
      const runCount = existing.runCount + 1;
      const inputTokens = existing.totalInputTokens + (usage?.inputTokens || 0);
      const outputTokens = existing.totalOutputTokens + (usage?.outputTokens || 0);
      const cachedInputTokens = existing.totalCachedInputTokens + (usage?.cachedInputTokens || 0);
      
      await this.db.run(`
        UPDATE agent_sessions SET
          session_params_json = ?,
          session_display_id = ?,
          last_run_id = ?,
          last_error = ?,
          run_count = ?,
          total_input_tokens = ?,
          total_output_tokens = ?,
          total_cached_input_tokens = ?,
          updated_at = ?
        WHERE id = ?
      `, [
        sessionParams ? JSON.stringify(sessionParams) : existing.sessionParamsJson,
        sessionDisplayId || existing.sessionDisplayId,
        lastRunId || existing.lastRunId,
        lastError !== undefined ? lastError : existing.lastError,
        runCount,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        now,
        existing.id
      ]);
      
      session = await this.getSession(agentId, taskKey, provider);
    } else {
      // Create new session
      const id = crypto.randomUUID();
      
      await this.db.run(`
        INSERT INTO agent_sessions (
          id, agent_id, task_key, provider,
          session_params_json, session_display_id, last_run_id, last_error,
          run_count, total_input_tokens, total_output_tokens, total_cached_input_tokens,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        agentId,
        taskKey,
        provider,
        sessionParams ? JSON.stringify(sessionParams) : '{}',
        sessionDisplayId || null,
        lastRunId || null,
        lastError || null,
        1,
        usage?.inputTokens || 0,
        usage?.outputTokens || 0,
        usage?.cachedInputTokens || 0,
        now,
        now
      ]);
      
      session = await this.getSession(agentId, taskKey, provider);
    }
    
    // Update cache
    const cacheKey = this._getCacheKey(agentId, taskKey, provider);
    this.sessionCache.set(cacheKey, { session, cachedAt: Date.now() });
    
    this.emit('session:updated', { sessionId: session.id, agentId, taskKey });
    
    return session;
  }

  /**
   * Clear a specific session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if cleared
   */
  async clearSession(sessionId) {
    const session = await this.db.get(
      'SELECT * FROM agent_sessions WHERE id = ?',
      [sessionId]
    );
    
    if (!session) return false;
    
    await this.db.run('DELETE FROM agent_sessions WHERE id = ?', [sessionId]);
    
    // Clear cache
    const cacheKey = this._getCacheKey(session.agent_id, session.task_key, session.provider);
    this.sessionCache.delete(cacheKey);
    
    this.emit('session:cleared', { sessionId, agentId: session.agent_id });
    
    return true;
  }

  /**
   * Clear all sessions for an agent
   * @param {string} agentId - Agent ID
   * @param {Object} [options] - Filter options
   * @param {string} [options.taskKey] - Only clear specific task
   * @param {string} [options.provider] - Only clear specific provider
   * @returns {Promise<number>} Number of sessions cleared
   */
  async clearAgentSessions(agentId, options = {}) {
    const conditions = ['agent_id = ?'];
    const values = [agentId];
    
    if (options.taskKey) {
      conditions.push('task_key = ?');
      values.push(options.taskKey);
    }
    
    if (options.provider) {
      conditions.push('provider = ?');
      values.push(options.provider);
    }
    
    const sql = `DELETE FROM agent_sessions WHERE ${conditions.join(' AND ')}`;
    const result = await this.db.run(sql, values);
    
    // Clear cache entries
    for (const [key] of this.sessionCache) {
      if (key.startsWith(`${agentId}:`)) {
        this.sessionCache.delete(key);
      }
    }
    
    this.emit('sessions:cleared', { agentId, count: result.changes });
    
    return result.changes;
  }

  /**
   * List sessions for an agent
   * @param {string} agentId - Agent ID
   * @param {Object} [options] - Query options
   * @param {number} [options.limit] - Limit results
   * @returns {Promise<Object[]>} Sessions
   */
  async listSessions(agentId, options = {}) {
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    
    const sql = `
      SELECT * FROM agent_sessions
      WHERE agent_id = ?
      ORDER BY updated_at DESC
      ${limitClause}
    `;
    
    const sessions = await this.db.all(sql, [agentId]);
    return sessions.map(s => this._formatSession(s));
  }

  // ============================================
  // Session Compaction
  // ============================================

  /**
   * Evaluate whether session should be rotated
   * @param {string} agentId - Agent ID
   * @param {string} taskKey - Task identifier
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} Compaction decision
   */
  async evaluateCompaction(agentId, taskKey, provider) {
    const session = await this.getSession(agentId, taskKey, provider);
    
    if (!session) {
      return {
        rotate: false,
        reason: null,
        handoffMarkdown: null,
        previousRunId: null
      };
    }
    
    const config = this.config.compaction;
    
    if (!config.enabled) {
      return {
        rotate: false,
        reason: null,
        handoffMarkdown: null,
        previousRunId: session.lastRunId
      };
    }
    
    // Check run count threshold (use > for strict limit, or >= maxSessionRuns+1 for inclusive)
    if (config.maxSessionRuns > 0 && session.runCount > config.maxSessionRuns) {
      return this._buildCompactionDecision(session, 
        `session exceeded ${config.maxSessionRuns} runs`);
    }
    
    // Check token threshold
    if (config.maxRawInputTokens > 0 && session.totalInputTokens >= config.maxRawInputTokens) {
      return this._buildCompactionDecision(session,
        `session raw input reached ${session.totalInputTokens.toLocaleString()} tokens (threshold ${config.maxRawInputTokens.toLocaleString()})`);
    }
    
    // Check age threshold
    if (config.maxSessionAgeHours > 0) {
      const ageHours = (Date.now() - new Date(session.createdAt).getTime()) / (1000 * 60 * 60);
      if (ageHours >= config.maxSessionAgeHours) {
        return this._buildCompactionDecision(session,
          `session age reached ${Math.floor(ageHours)} hours`);
      }
    }
    
    return {
      rotate: false,
      reason: null,
      handoffMarkdown: null,
      previousRunId: session.lastRunId
    };
  }

  /**
   * Rotate a session (clear and return handoff context)
   * @param {string} agentId - Agent ID
   * @param {string} taskKey - Task identifier
   * @param {string} provider - Provider name
   * @param {Object} [options] - Rotation options
   * @param {string} [options.reason] - Rotation reason
   * @returns {Promise<Object>} Rotation result
   */
  async rotateSession(agentId, taskKey, provider, options = {}) {
    const session = await this.getSession(agentId, taskKey, provider);
    
    if (!session) {
      return {
        rotated: false,
        reason: 'No existing session',
        handoffMarkdown: null
      };
    }
    
    // Build handoff context
    const handoffMarkdown = options.handoffMarkdown || this._buildHandoffMarkdown(session, options.reason);
    
    // Clear the session
    await this.clearSession(session.id);
    
    this.emit('session:rotated', { 
      agentId, 
      taskKey, 
      previousSessionId: session.sessionDisplayId || session.id 
    });
    
    return {
      rotated: true,
      reason: options.reason || 'manual_rotation',
      handoffMarkdown,
      previousSessionId: session.sessionDisplayId || session.id,
      previousRunId: session.lastRunId
    };
  }

  /**
   * Force a fresh session for an agent
   * @param {string} agentId - Agent ID
   * @param {string} taskKey - Task identifier
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} New empty session state
   */
  async forceFreshSession(agentId, taskKey, provider) {
    // Clear existing session
    await this.clearAgentSessions(agentId, { taskKey, provider });
    
    this.emit('session:fresh', { agentId, taskKey, provider });
    
    return {
      sessionParams: null,
      sessionDisplayId: null,
      fresh: true
    };
  }

  // ============================================
  // Session Resolution
  // ============================================

  /**
   * Resolve session parameters for a new run
   * @param {Object} params - Resolution parameters
   * @param {string} params.agentId - Agent ID
   * @param {string} params.taskKey - Task identifier
   * @param {string} params.provider - Provider name
   * @param {Object} [params.context] - Execution context
   * @param {boolean} [params.forceFresh] - Force a fresh session
   * @returns {Promise<Object>} Resolved session state
   */
  async resolveSessionForRun(params) {
    const { agentId, taskKey, provider, context, forceFresh } = params;
    
    // Check for explicit session reset triggers
    const wakeReason = context?.wakeReason;
    const shouldReset = forceFresh || wakeReason === 'issue_assigned';
    
    if (shouldReset) {
      const resetReason = forceFresh 
        ? 'forceFreshSession was requested'
        : 'wake reason is issue_assigned';
      
      await this.clearAgentSessions(agentId, { taskKey, provider });
      
      return {
        sessionParams: null,
        sessionDisplayId: null,
        resetReason,
        fresh: true
      };
    }
    
    // Evaluate session compaction
    const compaction = await this.evaluateCompaction(agentId, taskKey, provider);
    
    if (compaction.rotate) {
      // Rotate the session
      const rotation = await this.rotateSession(agentId, taskKey, provider, {
        reason: compaction.reason,
        handoffMarkdown: compaction.handoffMarkdown
      });
      
      return {
        sessionParams: null,
        sessionDisplayId: null,
        rotationReason: rotation.reason,
        handoffMarkdown: rotation.handoffMarkdown,
        previousSessionId: rotation.previousSessionId,
        fresh: true
      };
    }
    
    // Get existing session
    const session = await this.getSession(agentId, taskKey, provider);
    
    if (session) {
      return {
        sessionParams: session.sessionParams,
        sessionDisplayId: session.sessionDisplayId,
        sessionId: session.id,
        fresh: false
      };
    }
    
    // No existing session
    return {
      sessionParams: null,
      sessionDisplayId: null,
      fresh: true
    };
  }

  // ============================================
  // Internal Helpers
  // ============================================

  _getCacheKey(agentId, taskKey, provider) {
    return `${agentId}:${taskKey}:${provider || 'any'}`;
  }

  _formatSession(session) {
    if (!session) return null;
    return {
      id: session.id,
      agentId: session.agent_id,
      taskKey: session.task_key,
      provider: session.provider,
      sessionParams: session.session_params_json ? JSON.parse(session.session_params_json) : null,
      sessionDisplayId: session.session_display_id,
      lastRunId: session.last_run_id,
      lastError: session.last_error,
      runCount: session.run_count,
      totalInputTokens: session.total_input_tokens,
      totalOutputTokens: session.total_output_tokens,
      totalCachedInputTokens: session.total_cached_input_tokens,
      createdAt: session.created_at,
      updatedAt: session.updated_at
    };
  }

  _buildCompactionDecision(session, reason) {
    const handoffMarkdown = this._buildHandoffMarkdown(session, reason);
    
    return {
      rotate: true,
      reason,
      handoffMarkdown,
      previousRunId: session.lastRunId
    };
  }

  _buildHandoffMarkdown(session, reason) {
    const lines = [
      'Session handoff:',
      `- Previous session: ${session.sessionDisplayId || session.id}`,
      `- Task: ${session.taskKey}`,
      reason ? `- Rotation reason: ${reason}` : null,
      session.lastError ? `- Last error: ${session.lastError}` : null,
      '',
      'Continue from the current task state. Rebuild only the minimum context you need.'
    ];
    
    return lines.filter(Boolean).join('\n');
  }
}

export default SessionManager;
