/**
 * Rights Engine
 * Runtime rights validation, permission checking, and access control enforcement
 */

import { EventEmitter } from 'events';
import { validateRights } from './schema.js';

/**
 * Rights Engine for permission evaluation and enforcement
 */
export class RightsEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableCache: true,
      cacheTTL: 60000, // 1 minute
      auditEnabled: true,
      defaultDeny: true,
      ...options
    };
    
    // Permission cache
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    
    // Audit log
    this.auditLog = [];
    this.maxAuditEntries = 10000;
    
    // Policy rules
    this.policies = [];
    
    // Stats
    this.stats = {
      totalChecks: 0,
      allowed: 0,
      denied: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CORE PERMISSION CHECKING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Check if a CV has permission for an action
   * @param {Object} params - Check parameters
   * @param {Object} params.cv - CV to check
   * @param {string} params.action - Action to check (e.g., 'read', 'write', 'execute')
   * @param {string} params.resource - Resource to access
   * @param {Object} params.context - Additional context
   * @returns {Object} - Permission result
   */
  async check(params) {
    const { cv, action, resource, context = {} } = params;
    
    this.stats.totalChecks++;
    
    // Validate inputs
    if (!cv) {
      return this._deny('No CV provided', { action, resource });
    }
    
    if (!action) {
      return this._deny('No action specified', { cv: cv.identity?.id, resource });
    }
    
    const cvId = cv.identity?.id || 'unknown';
    const rights = cv.rights || {};
    
    // Check cache
    const cacheKey = this._getCacheKey(cvId, action, resource, context);
    if (this.options.enableCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        this._audit('check', cvId, action, resource, cached.allowed, cached.reason, context);
        return cached;
      }
      this.stats.cacheMisses++;
    }
    
    // Check if CV is active
    if (cv.lifecycle?.status !== 'active') {
      const result = this._deny(`CV is not active (status: ${cv.lifecycle?.status})`, 
        { cv: cvId, action, resource });
      this._cacheResult(cacheKey, result);
      this._audit('check', cvId, action, resource, false, result.reason, context);
      return result;
    }
    
    // Evaluate rights
    let result;
    
    try {
      // 1. Check explicit denies first (deny overrides allow)
      const denied = this._checkDenyRules(rights, action, resource, context);
      if (denied) {
        result = this._deny(denied, { cv: cvId, action, resource });
      } else {
        // 2. Check allow rules
        const allowed = this._checkAllowRules(rights, action, resource, context);
        if (allowed) {
          result = this._allow({ cv: cvId, action, resource, details: allowed });
        } else {
          // 3. Default deny if configured
          result = this.options.defaultDeny
            ? this._deny('No matching permission', { cv: cvId, action, resource })
            : this._allow({ cv: cvId, action, resource, details: { default: true } });
        }
      }
      
      // 4. Check custom policies
      const policyResult = await this._evaluatePolicies(cv, action, resource, context);
      if (!policyResult.allowed) {
        result = policyResult;
      }
      
    } catch (error) {
      result = this._deny(`Error checking rights: ${error.message}`, 
        { cv: cvId, action, resource });
    }
    
    // Cache result
    this._cacheResult(cacheKey, result);
    
    // Audit
    this._audit('check', cvId, action, resource, result.allowed, result.reason, context);
    
    // Update stats
    if (result.allowed) {
      this.stats.allowed++;
    } else {
      this.stats.denied++;
    }
    
    // Emit event
    this.emit(result.allowed ? 'rights:allowed' : 'rights:denied', {
      cv: cvId,
      action,
      resource,
      context,
      result
    });
    
    return result;
  }

  /**
   * Check and require permission (throws if denied)
   * @param {Object} params - Check parameters
   * @throws {Error} - If permission denied
   */
  async require(params) {
    const result = await this.check(params);
    
    if (!result.allowed) {
      const error = new Error(`Permission denied: ${result.reason}`);
      error.code = 'PERMISSION_DENIED';
      error.permissionCheck = result;
      throw error;
    }
    
    return result;
  }

  /**
   * Batch check multiple permissions
   * @param {Object} cv - CV to check
   * @param {Array} permissions - Array of { action, resource, context }
   * @returns {Array} - Results for each permission
   */
  async checkBatch(cv, permissions) {
    const results = [];
    
    for (const perm of permissions) {
      const result = await this.check({
        cv,
        action: perm.action,
        resource: perm.resource,
        context: perm.context
      });
      
      results.push({
        action: perm.action,
        resource: perm.resource,
        ...result
      });
    }
    
    return results;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RIGHTS VALIDATION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Validate rights configuration
   * @param {Object} rights - Rights to validate
   * @returns {Object} - Validation result
   */
  validate(rights) {
    const result = validateRights(rights);
    
    if (!result.valid) {
      return {
        valid: false,
        errors: result.errors
      };
    }
    
    // Additional validation
    const errors = [];
    
    // Check for conflicting rules
    const exec = rights.execution || {};
    const ops = exec.operations || [];
    const deniedOps = exec.denied_operations || [];
    
    const conflicts = ops.filter(op => deniedOps.includes(op));
    if (conflicts.length > 0) {
      errors.push(`Conflicting operations: ${conflicts.join(', ')}`);
    }
    
    // Check resource patterns
    const fsRights = rights.resources?.filesystem || [];
    for (const fs of fsRights) {
      if (fs.path) {
        try {
          this._globToRegex(fs.path);
        } catch (e) {
          errors.push(`Invalid path pattern: ${fs.path}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if rights are enforceable
   * @param {Object} rights - Rights to check
   * @returns {Object} - Check result
   */
  isEnforceable(rights) {
    const issues = [];
    
    // Check execution rights
    if (!rights.execution?.operations?.length && !rights.execution?.denied_operations?.length) {
      issues.push('No execution rights defined');
    }
    
    // Check resource rights
    if (!rights.resources) {
      issues.push('No resource rights defined');
    }
    
    // Check model rights
    if (!rights.models?.allowed?.length && !rights.models?.denied?.length) {
      issues.push('No model rights defined');
    }
    
    return {
      enforceable: issues.length === 0,
      issues
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POLICY MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Add a custom policy
   * @param {Object} policy - Policy definition
   */
  addPolicy(policy) {
    if (!policy.name || typeof policy.evaluate !== 'function') {
      throw new Error('Policy must have name and evaluate function');
    }
    
    this.policies.push(policy);
    this.emit('policy:added', { name: policy.name });
  }

  /**
   * Remove a policy
   * @param {string} name - Policy name
   */
  removePolicy(name) {
    const idx = this.policies.findIndex(p => p.name === name);
    if (idx >= 0) {
      this.policies.splice(idx, 1);
      this.emit('policy:removed', { name });
    }
  }

  /**
   * List all policies
   * @returns {Array}
   */
  listPolicies() {
    return this.policies.map(p => ({
      name: p.name,
      description: p.description || ''
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AUDIT LOGGING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get audit log
   * @param {Object} filters - Filter options
   * @returns {Array} - Audit entries
   */
  getAuditLog(filters = {}) {
    let entries = [...this.auditLog];
    
    if (filters.cvId) {
      entries = entries.filter(e => e.cvId === filters.cvId);
    }
    
    if (filters.action) {
      entries = entries.filter(e => e.action === filters.action);
    }
    
    if (filters.allowed !== undefined) {
      entries = entries.filter(e => e.allowed === filters.allowed);
    }
    
    if (filters.since) {
      entries = entries.filter(e => e.timestamp >= filters.since);
    }
    
    if (filters.limit) {
      entries = entries.slice(0, filters.limit);
    }
    
    return entries;
  }

  /**
   * Clear audit log
   */
  clearAuditLog() {
    this.auditLog = [];
    this.emit('audit:cleared');
  }

  /**
   * Export audit log
   * @returns {Object}
   */
  exportAudit() {
    return {
      generatedAt: Date.now(),
      totalEntries: this.auditLog.length,
      entries: this.auditLog
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STATS AND INFO
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get engine statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      auditEntries: this.auditLog.length,
      policies: this.policies.length
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
    this.emit('cache:cleared');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  _checkDenyRules(rights, action, resource, context) {
    const exec = rights.execution || {};
    
    // Check denied operations
    if (exec.denied_operations?.includes(action)) {
      return `Operation '${action}' is explicitly denied`;
    }
    
    // Check denied operation patterns
    for (const denied of (exec.denied_operations || [])) {
      if (denied.includes('*') || denied.includes('?')) {
        if (this._matchPattern(action, denied)) {
          return `Operation '${action}' matches denied pattern '${denied}'`;
        }
      }
    }
    
    // Check resource denies
    const fsRights = rights.resources?.filesystem || [];
    for (const fs of fsRights) {
      if (fs.access?.length === 0 || fs.access === null) {
        if (this._matchPattern(resource, fs.path)) {
          return `Resource '${resource}' access is explicitly denied`;
        }
      }
    }
    
    // Check model denies
    if (rights.models?.denied?.includes(context.model)) {
      return `Model '${context.model}' is explicitly denied`;
    }
    
    // Check network denies
    if (context.network) {
      const egress = rights.resources?.network?.egress || [];
      for (const rule of egress) {
        if (!rule.allowed && this._matchPattern(context.network.host, rule.host)) {
          return `Network access to '${context.network.host}' is denied`;
        }
      }
    }
    
    return null;
  }

  _checkAllowRules(rights, action, resource, context) {
    const exec = rights.execution || {};
    const allowedOps = exec.operations || [];
    
    // Check allowed operations
    if (allowedOps.includes(action) || allowedOps.includes('*')) {
      // Check resource access
      const fsRights = rights.resources?.filesystem || [];
      for (const fs of fsRights) {
        if (this._matchPattern(resource, fs.path)) {
          if (fs.access?.includes(action) || fs.access?.includes('write')) {
            return { operation: action, resource, via: 'filesystem' };
          }
        }
      }
      
      return { operation: action, via: 'execution' };
    }
    
    // Check model access
    if (context.model && rights.models?.allowed?.includes(context.model)) {
      // Check token limits
      if (rights.models.max_tokens_per_request) {
        if (context.tokens > rights.models.max_tokens_per_request) {
          return null; // Would exceed limit
        }
      }
      return { model: context.model, via: 'models' };
    }
    
    // Check API access
    if (context.api) {
      const apis = rights.resources?.apis || [];
      for (const api of apis) {
        if (api.name === context.api.name) {
          for (const endpoint of (api.endpoints || [])) {
            if (this._matchPattern(context.api.endpoint, endpoint)) {
              return { api: api.name, endpoint, via: 'api' };
            }
          }
        }
      }
    }
    
    // Check communication rights
    if (action === 'communicate' && context.target) {
      const comm = rights.communication || {};
      for (const pattern of (comm.can_talk_to || [])) {
        if (this._matchPattern(context.target, pattern)) {
          return { target: context.target, via: 'communication' };
        }
      }
    }
    
    // Check admin rights
    if (action.startsWith('admin:')) {
      const adminRight = action.replace('admin:', '');
      if (rights.admin?.[adminRight]) {
        return { adminRight, via: 'admin' };
      }
    }
    
    return null;
  }

  async _evaluatePolicies(cv, action, resource, context) {
    for (const policy of this.policies) {
      try {
        const result = await policy.evaluate(cv, action, resource, context);
        if (!result.allowed) {
          return this._deny(result.reason || `Policy '${policy.name}' denied`, {
            policy: policy.name
          });
        }
      } catch (error) {
        return this._deny(`Policy '${policy.name}' error: ${error.message}`, {
          policy: policy.name
        });
      }
    }
    
    return this._allow({});
  }

  _allow(details = {}) {
    return {
      allowed: true,
      timestamp: Date.now(),
      ...details
    };
  }

  _deny(reason, details = {}) {
    return {
      allowed: false,
      reason,
      timestamp: Date.now(),
      ...details
    };
  }

  _getCacheKey(cvId, action, resource, context) {
    const ctxHash = this._hashContext(context);
    return `${cvId}:${action}:${resource}:${ctxHash}`;
  }

  _hashContext(context) {
    if (!context || Object.keys(context).length === 0) {
      return '*';
    }
    // Simple hash for context
    const str = JSON.stringify(context);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  _getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const timestamp = this.cacheTimestamps.get(key);
    if (Date.now() - timestamp > this.options.cacheTTL) {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
      return null;
    }
    
    return entry;
  }

  _cacheResult(key, result) {
    if (!this.options.enableCache) return;
    
    this.cache.set(key, { ...result });
    this.cacheTimestamps.set(key, Date.now());
    
    // Trim cache if too large
    if (this.cache.size > 10000) {
      const oldestKey = this.cacheTimestamps.entries().next().value?.[0];
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.cacheTimestamps.delete(oldestKey);
      }
    }
  }

  _audit(type, cvId, action, resource, allowed, reason, context) {
    if (!this.options.auditEnabled) return;
    
    const entry = {
      id: this._generateId(),
      timestamp: Date.now(),
      type,
      cvId,
      action,
      resource,
      allowed,
      reason,
      context: this._sanitizeContext(context)
    };
    
    this.auditLog.unshift(entry);
    
    // Trim audit log
    while (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog.pop();
    }
  }

  _sanitizeContext(context) {
    if (!context) return {};
    
    // Remove sensitive data
    const sanitized = {};
    for (const [key, value] of Object.entries(context)) {
      if (key.includes('password') || key.includes('secret') || key.includes('token')) {
        sanitized[key] = '***';
      } else if (typeof value === 'object') {
        sanitized[key] = this._sanitizeContext(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  _matchPattern(str, pattern) {
    if (!str || !pattern) return false;
    if (pattern === '*') return true;
    if (pattern === str) return true;
    
    const regex = this._globToRegex(pattern);
    return regex.test(str);
  }

  _globToRegex(pattern) {
    let regex = '^';
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '*') {
        if (pattern[i + 1] === '*') {
          regex += '.*';
          i++; // Skip next *
        } else {
          regex += '[^/]*';
        }
      } else if (c === '?') {
        regex += '.';
      } else if (c === '{') {
        const end = pattern.indexOf('}', i);
        if (end > i) {
          const options = pattern.slice(i + 1, end).split(',');
          regex += '(' + options.map(o => o.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
          i = end;
        } else {
          regex += '\\{';
        }
      } else {
        regex += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
    }
    regex += '$';
    return new RegExp(regex, 'i');
  }

  _generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Predefined policies
export const TimeBasedPolicy = {
  name: 'time-based',
  description: 'Restrict access based on time of day',
  evaluate(cv, action, resource, context) {
    const allowedHours = cv.rights?.timeBased;
    if (!allowedHours) return { allowed: true };
    
    const hour = new Date().getHours();
    if (hour < allowedHours.start || hour >= allowedHours.end) {
      return {
        allowed: false,
        reason: `Access not allowed outside hours ${allowedHours.start}:00-${allowedHours.end}:00`
      };
    }
    
    return { allowed: true };
  }
};

export const RateLimitPolicy = {
  name: 'rate-limit',
  description: 'Enforce rate limits per CV',
  evaluate(cv, action, resource, context) {
    // This would integrate with a rate limiter
    // For now, just pass through
    return { allowed: true };
  }
};

export default RightsEngine;
