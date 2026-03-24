/**
 * Access Control List (ACL)
 * Role-based access control with resource-level permissions for CogniMesh
 * Role hierarchy: admin > manager > user > guest
 *
 * @module src/middleware/acl
 */

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} ACLRule
 * @property {string} role - Role name
 * @property {string} resource - Resource type or pattern
 * @property {string} action - Action name or pattern
 * @property {string} [scope] - Optional scope
 * @property {string} effect - 'allow' or 'deny'
 * @property {number} priority - Rule priority (higher = more specific)
 * @property {Function} [condition] - Optional condition function
 */

/**
 * @typedef {Object} ACLContext
 * @property {string} userId - User ID
 * @property {string} role - User's primary role
 * @property {string[]} [roles] - All user roles (for multiple roles)
 * @property {Object} [attributes] - User attributes
 */

/**
 * @typedef {Object} Resource
 * @property {string} type - Resource type
 * @property {string} id - Resource ID
 * @property {string} [owner] - Resource owner
 * @property {Object} [attributes] - Resource attributes
 */

/**
 * @typedef {Object} ResourcePermission
 * @property {string} userId - User ID
 * @property {string} resourceType - Resource type
 * @property {string} resourceId - Resource ID
 * @property {string} action - Action name
 * @property {number} grantedAt - Grant timestamp
 * @property {number} [expiresAt] - Expiration timestamp
 * @property {Object} [metadata] - Additional metadata
 */

// ============================================================================
// Errors
// ============================================================================

/**
 * ACL error
 */
export class ACLError extends Error {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'ACLError';
    this.code = code;
    this.metadata = metadata;
    this.statusCode = 403;
  }
}

// ============================================================================
// Role Hierarchy
// ============================================================================

/**
 * Default role hierarchy: admin > manager > user > guest
 * Higher level = more permissions
 */
export const ROLE_HIERARCHY = {
  admin: 100,
  manager: 75,
  user: 50,
  guest: 25
};

/**
 * Role inheritance mapping
 */
export const ROLE_INHERITANCE = {
  admin: ['manager', 'user', 'guest'],
  manager: ['user', 'guest'],
  user: ['guest'],
  guest: []
};

// ============================================================================
// ACLMiddleware Class
// ============================================================================

/**
 * Access Control List middleware class
 * Manages role-based permissions with support for resource-level access control
 * Role hierarchy: admin > manager > user > guest
 */
export class ACLMiddleware {
  #rules;
  #roleHierarchy;
  #roleInheritance;
  #resourcePermissions;
  #defaultPolicy;

  /**
   * @param {Object} [options] - ACL options
   * @param {Object} [options.roleHierarchy] - Custom role hierarchy
   * @param {Object} [options.roleInheritance] - Custom role inheritance
   * @param {string} [options.defaultPolicy='deny'] - Default policy ('allow' or 'deny')
   */
  constructor(options = {}) {
    this.#rules = new Map();
    this.#roleHierarchy = options.roleHierarchy || { ...ROLE_HIERARCHY };
    this.#roleInheritance = options.roleInheritance || { ...ROLE_INHERITANCE };
    this.#resourcePermissions = new Map();
    this.#defaultPolicy = options.defaultPolicy || 'deny';
  }

  // ========================================================================
  // Permission Granting/Revoking
  // ========================================================================

  /**
   * Grant permission to a role for a resource action
   * @param {string} role - Role name
   * @param {string} resource - Resource type or pattern
   * @param {string} action - Action name or pattern (e.g., 'read', 'write', '*')
   * @param {Object} [options] - Additional options
   * @param {string} [options.scope] - Resource scope
   * @param {Function} [options.condition] - Condition function
   * @param {number} [options.priority] - Rule priority
   * @returns {ACLMiddleware} This ACL instance for chaining
   */
  grant(role, resource, action, options = {}) {
    return this.#addRule(role, resource, action, 'allow', options);
  }

  /**
   * Revoke permission from a role for a resource action
   * @param {string} role - Role name
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @returns {boolean} True if permission was revoked
   */
  revoke(role, resource, action) {
    const key = this.#makeRuleKey(role, resource, action);
    const rule = this.#rules.get(key);
    
    if (rule && rule.effect === 'allow') {
      this.#rules.delete(key);
      return true;
    }
    
    return false;
  }

  /**
   * Deny permission to a role for a resource action (explicit deny)
   * @param {string} role - Role name
   * @param {string} resource - Resource type or pattern
   * @param {string} action - Action name or pattern
   * @param {Object} [options] - Additional options
   * @param {string} [options.scope] - Resource scope
   * @param {Function} [options.condition] - Condition function
   * @param {number} [options.priority] - Rule priority (denies have higher default priority)
   * @returns {ACLMiddleware} This ACL instance for chaining
   */
  deny(role, resource, action, options = {}) {
    const denyOptions = {
      ...options,
      priority: options.priority || 100 // Denies have higher default priority
    };
    return this.#addRule(role, resource, action, 'deny', denyOptions);
  }

  /**
   * Remove a rule (both allow and deny)
   * @param {string} role - Role name
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @returns {boolean} True if rule was removed
   */
  remove(role, resource, action) {
    const key = this.#makeRuleKey(role, resource, action);
    return this.#rules.delete(key);
  }

  /**
   * Remove all rules for a role
   * @param {string} role - Role name
   * @returns {number} Number of rules removed
   */
  removeRole(role) {
    let count = 0;
    for (const [key, rule] of this.#rules) {
      if (rule.role === role) {
        this.#rules.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all rules
   */
  clear() {
    this.#rules.clear();
    this.#resourcePermissions.clear();
  }

  // ========================================================================
  // Permission Checking
  // ========================================================================

  /**
   * Check if user has access to perform action on resource
   * @param {ACLContext} user - User context
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @param {Object} [context] - Additional context
   * @returns {Promise<{allowed: boolean, reason?: string, inheritedFrom?: string}>} Check result
   */
  async check(user, resource, action, context = {}) {
    if (!user) {
      return { allowed: false, reason: 'No user context' };
    }

    const roles = user.roles || [user.role];
    
    // Check each role (including inherited)
    for (const role of roles) {
      const result = await this.checkRole(role, resource, action, {
        ...context,
        user
      });
      
      if (result.allowed) {
        // Check for resource-specific permission override
        if (context.resourceId) {
          const hasResourcePerm = this.checkResourcePermission(
            user.userId, 
            resource, 
            context.resourceId, 
            action
          );
          if (hasResourcePerm) {
            return { allowed: true, inheritedFrom: result.inheritedFrom };
          }
        }
        return result;
      }
      
      // Explicit deny takes precedence
      if (result.reason?.includes('denied')) {
        return result;
      }
    }

    return { allowed: false, reason: 'No role grants this permission' };
  }

  /**
   * Check permission with role only (simpler interface)
   * @param {string} role - Role name
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @param {Object} [context] - Additional context
   * @returns {Promise<{allowed: boolean, reason?: string}>} Check result
   */
  async checkRole(role, resource, action, context = {}) {
    // Get rules for this role and inherited roles
    const rules = this.#getApplicableRules(role, resource, action);
    
    // Sort by priority (descending)
    rules.sort((a, b) => b.priority - a.priority);

    // Check deny rules first (deny overrides allow)
    for (const rule of rules) {
      if (rule.effect === 'deny') {
        const matches = await this.#ruleMatches(rule, context);
        if (matches) {
          return { allowed: false, reason: 'Explicitly denied' };
        }
      }
    }

    // Check allow rules
    for (const rule of rules) {
      if (rule.effect === 'allow') {
        const matches = await this.#ruleMatches(rule, context);
        if (matches) {
          return { allowed: true, inheritedFrom: rule.inheritedFrom };
        }
      }
    }

    // No matching rule - apply default policy
    const allowed = this.#defaultPolicy === 'allow';
    return {
      allowed,
      reason: allowed ? undefined : 'No matching permission rule'
    };
  }

  /**
   * Require permission (throws if denied)
   * @param {ACLContext} user - User context
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @param {Object} [context] - Additional context
   * @throws {ACLError} If permission denied
   */
  async require(user, resource, action, context = {}) {
    const result = await this.check(user, resource, action, context);
    if (!result.allowed) {
      throw new ACLError(
        'ACCESS_DENIED',
        result.reason || 'Access denied',
        { userId: user.userId, role: user.role, resource, action }
      );
    }
  }

  // ========================================================================
  // Express Middleware
  // ========================================================================

  /**
   * Express middleware for checking permissions
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware
   */
  middleware(resource, action, options = {}) {
    return async (req, res, next) => {
      try {
        const user = req.auth || req.user;
        
        if (!user) {
          return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          });
        }

        const context = {
          ...options,
          req,
          resourceId: req.params?.id || req.body?.id
        };

        await this.require(user, resource, action, context);
        next();
      } catch (error) {
        if (error instanceof ACLError) {
          return res.status(403).json({
            error: error.message,
            code: error.code
          });
        }
        next(error);
      }
    };
  }

  // ========================================================================
  // Role Hierarchy
  // ========================================================================

  /**
   * Get role level in hierarchy
   * @param {string} role - Role name
   * @returns {number} Role level (0 if not in hierarchy)
   */
  getRoleLevel(role) {
    return this.#roleHierarchy[role] || 0;
  }

  /**
   * Check if role1 outranks role2
   * @param {string} role1 - First role
   * @param {string} role2 - Second role
   * @returns {boolean} True if role1 outranks role2
   */
  outranks(role1, role2) {
    return this.getRoleLevel(role1) > this.getRoleLevel(role2);
  }

  /**
   * Get inherited roles
   * @param {string} role - Role name
   * @returns {string[]} Array of inherited role names
   */
  getInheritedRoles(role) {
    return this.#roleInheritance[role] || [];
  }

  /**
   * Check if role inherits from another
   * @param {string} role - Role to check
   * @param {string} parentRole - Potential parent role
   * @returns {boolean}
   */
  inherits(role, parentRole) {
    const inherited = this.getInheritedRoles(role);
    return inherited.includes(parentRole);
  }

  /**
   * Add custom role to hierarchy
   * @param {string} role - Role name
   * @param {number} level - Role level
   * @param {Object} [options] - Role options
   * @param {string} [options.inherits] - Parent role to inherit from
   */
  addRole(role, level, options = {}) {
    this.#roleHierarchy[role] = level;
    
    if (options.inherits) {
      const parentInherited = this.#roleInheritance[options.inherits] || [];
      this.#roleInheritance[role] = [options.inherits, ...parentInherited];
      
      // Inherit rules from parent role
      const parentRules = this.#getRulesForRole(options.inherits);
      for (const rule of parentRules) {
        if (rule.effect === 'allow') {
          this.grant(role, rule.resource, rule.action, {
            scope: rule.scope,
            condition: rule.condition
          });
        }
      }
    } else {
      this.#roleInheritance[role] = [];
    }
  }

  /**
   * Remove role from hierarchy
   * @param {string} role - Role name
   * @returns {boolean} True if removed
   */
  removeRoleFromHierarchy(role) {
    if (this.#roleHierarchy[role]) {
      delete this.#roleHierarchy[role];
      delete this.#roleInheritance[role];
      this.removeRole(role);
      return true;
    }
    return false;
  }

  // ========================================================================
  // Resource-Level Permissions
  // ========================================================================

  /**
   * Grant permission on specific resource instance
   * @param {string} userId - User ID
   * @param {string} resourceType - Resource type
   * @param {string} resourceId - Resource ID
   * @param {string} action - Action name
   * @param {Object} [options] - Grant options
   * @param {number} [options.expiresAt] - Expiration timestamp
   * @param {Object} [options.metadata] - Additional metadata
   * @returns {ResourcePermission}
   */
  grantResourcePermission(userId, resourceType, resourceId, action, options = {}) {
    const key = this.#makeResourceKey(userId, resourceType, resourceId);
    
    if (!this.#resourcePermissions.has(key)) {
      this.#resourcePermissions.set(key, new Map());
    }

    const permissions = this.#resourcePermissions.get(key);
    const permission = {
      userId,
      resourceType,
      resourceId,
      action,
      grantedAt: Date.now(),
      expiresAt: options.expiresAt,
      metadata: options.metadata
    };
    
    permissions.set(action, permission);
    return permission;
  }

  /**
   * Revoke permission on specific resource instance
   * @param {string} userId - User ID
   * @param {string} resourceType - Resource type
   * @param {string} resourceId - Resource ID
   * @param {string} [action] - Action name (if not provided, revokes all)
   * @returns {boolean} True if permission was revoked
   */
  revokeResourcePermission(userId, resourceType, resourceId, action) {
    const key = this.#makeResourceKey(userId, resourceType, resourceId);
    
    if (!this.#resourcePermissions.has(key)) {
      return false;
    }

    const permissions = this.#resourcePermissions.get(key);

    if (action) {
      const result = permissions.delete(action);
      if (permissions.size === 0) {
        this.#resourcePermissions.delete(key);
      }
      return result;
    }

    // Revoke all permissions
    this.#resourcePermissions.delete(key);
    return true;
  }

  /**
   * Check resource-level permission
   * @param {string} userId - User ID
   * @param {string} resourceType - Resource type
   * @param {string} resourceId - Resource ID
   * @param {string} action - Action name
   * @returns {boolean} True if permission granted
   */
  checkResourcePermission(userId, resourceType, resourceId, action) {
    const key = this.#makeResourceKey(userId, resourceType, resourceId);
    
    if (!this.#resourcePermissions.has(key)) {
      return false;
    }

    const permissions = this.#resourcePermissions.get(key);
    const permission = permissions.get(action);

    if (!permission) {
      return false;
    }

    // Check expiration
    if (permission.expiresAt && permission.expiresAt < Date.now()) {
      permissions.delete(action);
      return false;
    }

    return true;
  }

  /**
   * List resource permissions for a user
   * @param {string} userId - User ID
   * @returns {Array<ResourcePermission>} Resource permissions
   */
  listResourcePermissions(userId) {
    const result = [];
    const prefix = `${userId}:`;

    for (const [key, permissions] of this.#resourcePermissions) {
      if (key.startsWith(prefix)) {
        for (const [, permission] of permissions) {
          if (!permission.expiresAt || permission.expiresAt > Date.now()) {
            result.push(permission);
          }
        }
      }
    }

    return result;
  }

  // ========================================================================
  // Bulk Operations
  // ========================================================================

  /**
   * Define multiple rules at once
   * @param {Array<Object>} rules - Array of rule definitions
   */
  defineRules(rules) {
    for (const rule of rules) {
      if (rule.effect === 'deny') {
        this.deny(rule.role, rule.resource, rule.action, rule);
      } else {
        this.grant(rule.role, rule.resource, rule.action, rule);
      }
    }
  }

  /**
   * Export rules to serializable format
   * @returns {Array<Object>} Rules array
   */
  exportRules() {
    return Array.from(this.#rules.values()).map(rule => ({
      role: rule.role,
      resource: rule.resource,
      action: rule.action,
      effect: rule.effect,
      scope: rule.scope,
      priority: rule.priority
    }));
  }

  /**
   * Import rules from serialized format
   * @param {Array<Object>} rules - Rules array
   */
  importRules(rules) {
    this.clear();
    this.defineRules(rules);
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Get all rules for a role
   * @param {string} role - Role name
   * @returns {Array<ACLRule>} Rules for the role
   */
  getRoleRules(role) {
    return this.#getRulesForRole(role);
  }

  /**
   * List all defined roles
   * @returns {Array<string>} Role names
   */
  listRoles() {
    return Object.keys(this.#roleHierarchy);
  }

  /**
   * Get ACL statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      rules: this.#rules.size,
      roles: Object.keys(this.#roleHierarchy).length,
      resourcePermissions: this.#resourcePermissions.size,
      defaultPolicy: this.#defaultPolicy
    };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Add a rule to the ACL
   * @param {string} role - Role name
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @param {string} effect - 'allow' or 'deny'
   * @param {Object} options - Rule options
   * @returns {ACLMiddleware} This instance
   */
  #addRule(role, resource, action, effect, options = {}) {
    const key = this.#makeRuleKey(role, resource, action);
    
    // Calculate priority based on specificity
    let priority = options.priority || 0;
    if (resource !== '*') priority += 10;
    if (action !== '*') priority += 5;
    if (options.scope) priority += 15;
    if (options.condition) priority += 20;

    this.#rules.set(key, {
      role,
      resource,
      action,
      effect,
      scope: options.scope,
      priority,
      condition: options.condition,
      inheritedFrom: options.inheritedFrom
    });

    return this;
  }

  /**
   * Make rule key
   * @param {string} role - Role name
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @returns {string}
   */
  #makeRuleKey(role, resource, action) {
    return `${role}:${resource}:${action}`;
  }

  /**
   * Make resource permission key
   * @param {string} userId - User ID
   * @param {string} resourceType - Resource type
   * @param {string} resourceId - Resource ID
   * @returns {string}
   */
  #makeResourceKey(userId, resourceType, resourceId) {
    return `${userId}:${resourceType}:${resourceId}`;
  }

  /**
   * Get rules applicable to a role (including inherited)
   * @param {string} role - Role name
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @returns {Array<ACLRule>} Applicable rules
   */
  #getApplicableRules(role, resource, action) {
    const roles = [role, ...this.getInheritedRoles(role)];
    const rules = [];

    for (const r of roles) {
      // Mark inherited rules
      const inheritedFrom = r !== role ? r : undefined;

      // Direct match
      const directKey = this.#makeRuleKey(r, resource, action);
      if (this.#rules.has(directKey)) {
        const rule = this.#rules.get(directKey);
        rules.push({ ...rule, inheritedFrom });
      }

      // Wildcard resource
      const wildcardResourceKey = this.#makeRuleKey(r, '*', action);
      if (this.#rules.has(wildcardResourceKey)) {
        const rule = this.#rules.get(wildcardResourceKey);
        rules.push({ ...rule, inheritedFrom });
      }

      // Wildcard action
      const wildcardActionKey = this.#makeRuleKey(r, resource, '*');
      if (this.#rules.has(wildcardActionKey)) {
        const rule = this.#rules.get(wildcardActionKey);
        rules.push({ ...rule, inheritedFrom });
      }

      // Both wildcards
      const bothWildcardsKey = this.#makeRuleKey(r, '*', '*');
      if (this.#rules.has(bothWildcardsKey)) {
        const rule = this.#rules.get(bothWildcardsKey);
        rules.push({ ...rule, inheritedFrom });
      }
    }

    return rules;
  }

  /**
   * Get all rules for a specific role
   * @param {string} role - Role name
   * @returns {Array<ACLRule>}
   */
  #getRulesForRole(role) {
    const rules = [];
    for (const [, rule] of this.#rules) {
      if (rule.role === role) {
        rules.push(rule);
      }
    }
    return rules;
  }

  /**
   * Check if rule matches context
   * @param {ACLRule} rule - ACL rule
   * @param {Object} context - Context object
   * @returns {Promise<boolean>}
   */
  async #ruleMatches(rule, context) {
    // Check scope
    if (rule.scope && context.scope) {
      if (rule.scope !== context.scope) {
        return false;
      }
    }

    // Check condition
    if (rule.condition) {
      try {
        const result = await rule.condition(context);
        if (!result) {
          return false;
        }
      } catch (error) {
        return false;
      }
    }

    return true;
  }
}

// ============================================================================
// Predefined Policies
// ============================================================================

/**
 * Create standard RBAC policy with admin > manager > user > guest hierarchy
 * @returns {ACLMiddleware} Configured ACL instance
 */
export function createStandardACL() {
  const acl = new ACLMiddleware();

  // Admin can do everything
  acl.grant('admin', '*', '*');

  // Manager can do everything except user management and system settings
  acl.grant('manager', '*', 'read');
  acl.grant('manager', '*', 'write');
  acl.grant('manager', '*', 'create');
  acl.grant('manager', '*', 'update');
  acl.deny('manager', 'user', 'delete', { priority: 100 });
  acl.deny('manager', 'system', '*', { priority: 100 });
  acl.deny('manager', 'admin', '*', { priority: 100 });

  // User can read and write their own resources
  acl.grant('user', '*', 'read');
  acl.grant('user', '*', 'create');
  acl.grant('user', '*', 'update', { 
    condition: (ctx) => ctx.user?.id === ctx.resource?.owner 
  });
  acl.deny('user', '*', 'delete', { priority: 50 });
  acl.deny('user', 'system', '*', { priority: 50 });
  acl.deny('user', 'admin', '*', { priority: 50 });

  // Guest has read-only access
  acl.grant('guest', '*', 'read');
  acl.deny('guest', '*', 'write', { priority: 40 });
  acl.deny('guest', '*', 'create', { priority: 40 });
  acl.deny('guest', '*', 'update', { priority: 40 });
  acl.deny('guest', '*', 'delete', { priority: 40 });

  return acl;
}

/**
 * Create project-based ACL policy
 * @returns {ACLMiddleware} Configured ACL instance
 */
export function createProjectACL() {
  const acl = new ACLMiddleware();

  // Project admin (owner)
  acl.grant('admin', 'project', '*');
  acl.grant('admin', 'task', '*');
  acl.grant('admin', 'document', '*');
  acl.grant('admin', 'member', '*');

  // Project manager
  acl.grant('manager', 'project', 'read');
  acl.grant('manager', 'project', 'update');
  acl.grant('manager', 'task', '*');
  acl.grant('manager', 'document', '*');
  acl.grant('manager', 'member', 'read');
  acl.grant('manager', 'member', 'add');
  acl.grant('manager', 'member', 'remove');
  acl.deny('manager', 'project', 'delete');
  acl.deny('manager', 'project', 'transfer_ownership');

  // Project user (member)
  acl.grant('user', 'project', 'read');
  acl.grant('user', 'task', 'read');
  acl.grant('user', 'task', 'create');
  acl.grant('user', 'task', 'update');
  acl.grant('user', 'document', 'read');
  acl.grant('user', 'document', 'create');
  acl.deny('user', 'project', 'update');
  acl.deny('user', 'project', 'delete');
  acl.deny('user', 'member', '*');

  // Project guest (viewer)
  acl.grant('guest', 'project', 'read');
  acl.grant('guest', 'task', 'read');
  acl.grant('guest', 'document', 'read');
  acl.deny('guest', '*', 'write');
  acl.deny('guest', '*', 'create');
  acl.deny('guest', '*', 'delete');

  return acl;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

/**
 * Get default ACL instance
 * @returns {ACLMiddleware}
 */
export function getACL() {
  if (!defaultInstance) {
    defaultInstance = createStandardACL();
  }
  return defaultInstance;
}

/**
 * Reset default instance (primarily for testing)
 */
export function resetACL() {
  defaultInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export default ACLMiddleware;
