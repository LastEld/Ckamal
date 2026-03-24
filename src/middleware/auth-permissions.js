/**
 * Auth Permissions
 * Permission checking and scope validation for CogniMesh with condition evaluation
 *
 * @module src/middleware/auth-permissions
 */

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} Permission
 * @property {string} resource - Resource name
 * @property {string} action - Action name
 * @property {string} [scope] - Optional scope
 */

/**
 * @typedef {Object} PermissionCondition
 * @property {Function} check - Condition check function
 * @property {string} [description] - Condition description
 */

/**
 * @typedef {Object} User
 * @property {string} id - User ID
 * @property {string} [role] - User role
 * @property {string[]} [permissions] - User permissions
 * @property {Object} [attributes] - Additional user attributes
 * @property {string} [ip] - User IP address
 * @property {string} [timezone] - User timezone
 */

/**
 * @typedef {Object} Resource
 * @property {string} type - Resource type
 * @property {string} id - Resource ID
 * @property {string} [owner] - Resource owner
 * @property {Object} [attributes] - Additional resource attributes
 */

/**
 * @typedef {Object} PermissionCheckResult
 * @property {boolean} allowed - Whether permission is granted
 * @property {string} [reason] - Reason for denial
 * @property {string} [inheritedFrom] - Role permission was inherited from
 */

// ============================================================================
// Errors
// ============================================================================

/**
 * Permission error
 */
export class PermissionError extends Error {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'PermissionError';
    this.code = code;
    this.metadata = metadata;
    this.statusCode = 403;
  }
}

// ============================================================================
// PermissionChecker Class
// ============================================================================

/**
 * Permission checker class
 * Handles permission checking with support for conditions, scope validation,
 * and permission inheritance
 */
export class PermissionChecker {
  #permissionDefinitions;
  #conditions;
  #scopes;
  #inheritance;
  #defaultPermissions;

  /**
   * Create a permission checker
   * @param {Object} [options] - Options
   * @param {Object} [options.inheritance] - Permission inheritance mapping
   * @param {Object} [options.defaultPermissions] - Default permissions by role
   */
  constructor(options = {}) {
    this.#permissionDefinitions = new Map();
    this.#conditions = new Map();
    this.#scopes = new Map();
    this.#inheritance = options.inheritance || {};
    this.#defaultPermissions = options.defaultPermissions || {};

    this.#registerBuiltInConditions();
  }

  // ========================================================================
  // Permission Checking
  // ========================================================================

  /**
   * Check if user has permission for action on resource
   * @param {string} permission - Permission string (e.g., "read", "write")
   * @param {Resource|string} resource - Resource or resource type
   * @param {User} [user] - User object
   * @param {Object} [context] - Additional context
   * @returns {Promise<PermissionCheckResult>} Check result
   */
  async check(permission, resource, user = null, context = {}) {
    if (!user) {
      return { allowed: false, reason: 'No user provided' };
    }

    const resourceType = typeof resource === 'string' ? resource : resource.type;
    const action = permission;
    const permissionKey = `${resourceType}:${action}`;

    // Check for wildcard permissions
    if (this.#hasWildcardPermission(user, resourceType, action)) {
      return { allowed: true, reason: 'Wildcard permission granted' };
    }

    // Check permission inheritance
    const inheritedCheck = await this.#checkInheritance(user, resourceType, action, resource, context);
    if (inheritedCheck.allowed) {
      return inheritedCheck;
    }

    // Check direct permissions
    const userPermissions = user.permissions || this.#getDefaultPermissions(user.role);
    const hasDirectPermission = userPermissions.some(p => 
      this.#matchesPermission(p, resourceType, action)
    );

    if (!hasDirectPermission) {
      return { 
        allowed: false, 
        reason: `User lacks permission for ${resourceType}:${action}` 
      };
    }

    // Check defined permission conditions
    const definition = this.#permissionDefinitions.get(permissionKey);
    if (definition?.condition) {
      const conditionResult = await this.#evaluateCondition(
        definition.condition, 
        user, 
        resource, 
        context
      );
      
      if (!conditionResult.allowed) {
        return {
          allowed: false,
          reason: conditionResult.reason || 'Permission condition not met'
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check multiple permissions (all must pass)
   * @param {Array<{permission: string, resource: Resource|string}>} checks - Permission checks
   * @param {User} [user] - User object
   * @param {Object} [context] - Additional context
   * @returns {Promise<PermissionCheckResult>}
   */
  async checkAll(checks, user = null, context = {}) {
    for (const { permission, resource } of checks) {
      const result = await this.check(permission, resource, user, context);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true };
  }

  /**
   * Check multiple permissions (any can pass)
   * @param {Array<{permission: string, resource: Resource|string}>} checks - Permission checks
   * @param {User} [user] - User object
   * @param {Object} [context] - Additional context
   * @returns {Promise<PermissionCheckResult>}
   */
  async checkAny(checks, user = null, context = {}) {
    const failures = [];
    
    for (const { permission, resource } of checks) {
      const result = await this.check(permission, resource, user, context);
      if (result.allowed) {
        return result;
      }
      failures.push(result.reason);
    }
    
    return { 
      allowed: false, 
      reason: `No permissions granted. Failures: ${failures.join(', ')}` 
    };
  }

  /**
   * Require permission (throws if not allowed)
   * @param {string} permission - Permission string
   * @param {Resource|string} resource - Resource or resource type
   * @param {User} [user] - User object
   * @param {Object} [context] - Additional context
   * @throws {PermissionError} If permission denied
   */
  async require(permission, resource, user = null, context = {}) {
    const result = await this.check(permission, resource, user, context);
    if (!result.allowed) {
      const resourceType = typeof resource === 'string' ? resource : resource.type;
      throw new PermissionError(
        'PERMISSION_DENIED',
        result.reason || 'Permission denied',
        { resource: resourceType, action: permission }
      );
    }
  }

  // ========================================================================
  // Permission Definitions
  // ========================================================================

  /**
   * Define a permission with optional condition
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @param {Object} [options] - Permission options
   * @param {string|Function} [options.condition] - Condition name or function
   * @param {string} [options.description] - Permission description
   * @param {string[]} [options.inherits] - Permissions this inherits from
   */
  definePermission(resource, action, options = {}) {
    const key = `${resource}:${action}`;
    this.#permissionDefinitions.set(key, {
      resource,
      action,
      condition: options.condition,
      description: options.description,
      inherits: options.inherits || []
    });
  }

  /**
   * Remove a permission definition
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @returns {boolean} True if removed
   */
  removePermission(resource, action) {
    const key = `${resource}:${action}`;
    return this.#permissionDefinitions.delete(key);
  }

  /**
   * Get permission definition
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @returns {Object|undefined} Permission definition
   */
  getPermission(resource, action) {
    const key = `${resource}:${action}`;
    return this.#permissionDefinitions.get(key);
  }

  /**
   * List all defined permissions
   * @returns {Array<Object>} Permission definitions
   */
  listPermissions() {
    return Array.from(this.#permissionDefinitions.values());
  }

  // ========================================================================
  // Permission Inheritance
  // ========================================================================

  /**
   * Set permission inheritance
   * @param {string} permission - Permission that inherits
   * @param {string[]} parentPermissions - Parent permissions
   */
  setInheritance(permission, parentPermissions) {
    this.#inheritance[permission] = parentPermissions;
  }

  /**
   * Get inherited permissions
   * @param {string} permission - Permission to check
   * @returns {string[]} Array of parent permissions
   */
  getInheritance(permission) {
    return this.#inheritance[permission] || [];
  }

  /**
   * Check if permission is inherited
   * @param {string} permission - Permission to check
   * @param {string} parentPermission - Potential parent permission
   * @returns {boolean}
   */
  isInherited(permission, parentPermission) {
    const parents = this.#inheritance[permission] || [];
    return parents.includes(parentPermission);
  }

  // ========================================================================
  // Condition Management
  // ========================================================================

  /**
   * Register a condition
   * @param {string} name - Condition name
   * @param {Function} checkFn - Check function (user, resource, context) => boolean|{allowed, reason}
   * @param {Object} [options] - Condition options
   * @param {string} [options.description] - Condition description
   */
  registerCondition(name, checkFn, options = {}) {
    this.#conditions.set(name, {
      check: checkFn,
      description: options.description
    });
  }

  /**
   * Remove a condition
   * @param {string} name - Condition name
   * @returns {boolean} True if removed
   */
  removeCondition(name) {
    return this.#conditions.delete(name);
  }

  /**
   * Get registered condition
   * @param {string} name - Condition name
   * @returns {Object|undefined} Condition definition
   */
  getCondition(name) {
    return this.#conditions.get(name);
  }

  // ========================================================================
  // Scope Validation
  // ========================================================================

  /**
   * Validate OAuth scope against required scope
   * @param {string|string[]} tokenScope - Token scope(s)
   * @param {string} requiredScope - Required scope
   * @returns {boolean} True if scope is valid
   */
  validateScope(tokenScope, requiredScope) {
    if (!requiredScope) {
      return true;
    }

    if (!tokenScope) {
      return false;
    }

    const scopes = Array.isArray(tokenScope) ? tokenScope : tokenScope.split(' ');
    const required = requiredScope.split(' ');
    
    return required.every(r => scopes.some(scope => this.#scopeMatches(scope, r)));
  }

  /**
   * Validate OAuth scope (any match)
   * @param {string|string[]} tokenScope - Token scope(s)
   * @param {string[]} requiredScopes - Required scopes (any match)
   * @returns {boolean} True if any scope matches
   */
  validateScopeAny(tokenScope, requiredScopes) {
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    return requiredScopes.some(required => this.validateScope(tokenScope, required));
  }

  /**
   * Validate token scopes against required scopes (all must match)
   * @param {string|string[]} tokenScope - Token scope(s)
   * @param {string[]} requiredScopes - Required scopes
   * @returns {boolean} True if all scopes are valid
   */
  validateScopesAll(tokenScope, requiredScopes) {
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    return requiredScopes.every(required => 
      this.validateScope(tokenScope, required)
    );
  }

  /**
   * Register a scope definition
   * @param {string} name - Scope name
   * @param {Object} definition - Scope definition
   * @param {string} [description] - Scope description
   */
  registerScope(name, definition, description) {
    this.#scopes.set(name, {
      definition,
      description
    });
  }

  /**
   * Check if scope has permission
   * @param {string} scope - Scope to check
   * @param {string} permission - Required permission
   * @returns {boolean}
   */
  scopeHasPermission(scope, permission) {
    const scopeDef = this.#scopes.get(scope);
    if (!scopeDef) return false;
    
    return scopeDef.definition.permissions?.includes(permission) || false;
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Check if user has any of the specified permissions
   * @param {User} user - User object
   * @param {Array<{resource: string, action: string}>} permissions - Permissions to check
   * @param {Object} [context] - Additional context
   * @returns {Promise<boolean>} True if any permission is granted
   */
  async hasAnyPermission(user, permissions, context = {}) {
    for (const { resource, action } of permissions) {
      const result = await this.check(action, resource, user, context);
      if (result.allowed) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if user has all of the specified permissions
   * @param {User} user - User object
   * @param {Array<{resource: string, action: string}>} permissions - Permissions to check
   * @param {Object} [context] - Additional context
   * @returns {Promise<boolean>} True if all permissions are granted
   */
  async hasAllPermissions(user, permissions, context = {}) {
    for (const { resource, action } of permissions) {
      const result = await this.check(action, resource, user, context);
      if (!result.allowed) {
        return false;
      }
    }
    return true;
  }

  /**
   * Parse permission string
   * @param {string} permission - Permission string (format: resource:action[:scope])
   * @returns {Permission} Parsed permission
   */
  parsePermission(permission) {
    const parts = permission.split(':');
    return {
      resource: parts[0] || '*',
      action: parts[1] || '*',
      scope: parts[2]
    };
  }

  /**
   * Build permission string
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @param {string} [scope] - Optional scope
   * @returns {string} Permission string
   */
  buildPermission(resource, action, scope) {
    return scope ? `${resource}:${action}:${scope}` : `${resource}:${action}`;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Check permission inheritance
   * @param {User} user - User object
   * @param {string} resourceType - Resource type
   * @param {string} action - Action name
   * @param {Resource} resource - Resource object
   * @param {Object} context - Additional context
   * @returns {Promise<PermissionCheckResult>}
   */
  async #checkInheritance(user, resourceType, action, resource, context) {
    const permissionKey = `${resourceType}:${action}`;
    const definition = this.#permissionDefinitions.get(permissionKey);
    
    if (!definition?.inherits || definition.inherits.length === 0) {
      return { allowed: false };
    }

    const userPermissions = user.permissions || this.#getDefaultPermissions(user.role);

    for (const inheritedPermission of definition.inherits) {
      const hasInherited = userPermissions.some(p => {
        const parsed = this.parsePermission(p);
        return parsed.resource === resourceType && parsed.action === inheritedPermission;
      });

      if (hasInherited) {
        return { allowed: true, inheritedFrom: inheritedPermission };
      }
    }

    return { allowed: false };
  }

  /**
   * Get default permissions for role
   * @param {string} role - Role name
   * @returns {string[]} Default permissions
   */
  #getDefaultPermissions(role) {
    return this.#defaultPermissions[role] || [];
  }

  /**
   * Check if user has wildcard permission
   * @param {User} user - User object
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @returns {boolean}
   */
  #hasWildcardPermission(user, resource, action) {
    const permissions = user.permissions || this.#getDefaultPermissions(user.role);
    
    return permissions.some(p => {
      const parsed = this.parsePermission(p);
      
      // Admin wildcard
      if (parsed.resource === '*' && parsed.action === '*') {
        return true;
      }
      
      // Resource wildcard
      if (parsed.resource === resource && parsed.action === '*') {
        return true;
      }
      
      return false;
    });
  }

  /**
   * Check if permission matches resource and action
   * @param {string} granted - Granted permission
   * @param {string} resource - Resource type
   * @param {string} action - Action name
   * @returns {boolean}
   */
  #matchesPermission(granted, resource, action) {
    const parsed = this.parsePermission(granted);
    
    // Resource match
    if (parsed.resource !== '*' && parsed.resource !== resource) {
      return false;
    }
    
    // Action match
    if (parsed.action !== '*' && parsed.action !== action) {
      return false;
    }
    
    return true;
  }

  /**
   * Evaluate a condition
   * @param {string|Function} condition - Condition name or function
   * @param {User} user - User object
   * @param {Resource} resource - Resource object
   * @param {Object} context - Additional context
   * @returns {Promise<{allowed: boolean, reason?: string}>}
   */
  async #evaluateCondition(condition, user, resource, context) {
    let checkFn;
    
    if (typeof condition === 'string') {
      const registered = this.#conditions.get(condition);
      if (!registered) {
        return { allowed: false, reason: `Unknown condition: ${condition}` };
      }
      checkFn = registered.check;
    } else if (typeof condition === 'function') {
      checkFn = condition;
    } else {
      return { allowed: false, reason: 'Invalid condition type' };
    }

    try {
      const result = await checkFn(user, resource, context);
      
      if (typeof result === 'boolean') {
        return { allowed: result };
      }
      
      return result;
    } catch (error) {
      return { allowed: false, reason: error.message };
    }
  }

  /**
   * Check if scope matches required pattern
   * @param {string} scope - Token scope
   * @param {string} required - Required scope pattern
   * @returns {boolean}
   */
  #scopeMatches(scope, required) {
    // Exact match
    if (scope === required) {
      return true;
    }

    // Wildcard match (e.g., "read:*" matches "read:users")
    if (required.endsWith(':*')) {
      const prefix = required.slice(0, -2);
      return scope.startsWith(prefix + ':');
    }

    // Scope hierarchy (e.g., "admin" includes "write", "read")
    const hierarchy = {
      'admin': ['write', 'read'],
      'write': ['read']
    };

    if (hierarchy[scope]?.includes(required)) {
      return true;
    }

    return false;
  }

  /**
   * Register built-in conditions
   */
  #registerBuiltInConditions() {
    // Owner condition
    this.registerCondition('owner', (user, resource) => {
      if (!resource || typeof resource !== 'object') {
        return { allowed: false, reason: 'Invalid resource' };
      }
      
      const isOwner = resource.owner === user.id;
      return {
        allowed: isOwner,
        reason: isOwner ? undefined : 'User is not the resource owner'
      };
    }, { description: 'Resource owner check' });

    // Time-based condition
    this.registerCondition('business-hours', () => {
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay();
      
      // Business hours: 9 AM - 6 PM, Monday-Friday
      const isBusinessHours = day >= 1 && day <= 5 && hour >= 9 && hour < 18;
      
      return {
        allowed: isBusinessHours,
        reason: isBusinessHours ? undefined : 'Outside business hours'
      };
    }, { description: 'Business hours (9-18, Mon-Fri)' });

    // IP whitelist condition
    this.registerCondition('internal-ip', (user, resource, context) => {
      const allowedRanges = context.allowedIpRanges || ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.1'];
      const userIp = user.ip || context.ip;
      
      if (!userIp) {
        return { allowed: false, reason: 'No IP address available' };
      }

      const isAllowed = allowedRanges.some(range => this.#ipInRange(userIp, range));
      return {
        allowed: isAllowed,
        reason: isAllowed ? undefined : 'IP not in allowed range'
      };
    }, { description: 'Internal IP range check' });
  }

  /**
   * Check if IP is in CIDR range
   * @param {string} ip - IP address
   * @param {string} range - CIDR range
   * @returns {boolean}
   */
  #ipInRange(ip, range) {
    // Simple implementation for common cases
    if (range === '127.0.0.1') {
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
    
    const [rangeIp, bits] = range.split('/');
    if (!bits) return ip === rangeIp;
    
    // Basic CIDR check for IPv4
    const ipParts = ip.split('.').map(Number);
    const rangeParts = rangeIp.split('.').map(Number);
    const maskBits = parseInt(bits, 10);
    
    if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
    
    const mask = 0xFFFFFFFF << (32 - maskBits);
    const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const rangeInt = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
    
    return (ipInt & mask) === (rangeInt & mask);
  }
}

// ============================================================================
// Predefined Conditions
// ============================================================================

/**
 * Create an owner condition
 * @returns {Function} Condition function
 */
export function ownerCondition() {
  return (user, resource) => {
    if (!resource || typeof resource !== 'object') {
      return { allowed: false, reason: 'Invalid resource' };
    }
    
    const isOwner = resource.owner === user.id;
    return {
      allowed: isOwner,
      reason: isOwner ? undefined : 'User is not the resource owner'
    };
  };
}

/**
 * Create an attribute condition
 * @param {string} attribute - Attribute name
 * @param {*} value - Expected value
 * @returns {Function} Condition function
 */
export function attributeCondition(attribute, value) {
  return (user, resource) => {
    if (!resource || typeof resource !== 'object') {
      return { allowed: false, reason: 'Invalid resource' };
    }
    
    const matches = resource.attributes?.[attribute] === value;
    return {
      allowed: matches,
      reason: matches ? undefined : `Attribute ${attribute} does not match`
    };
  };
}

/**
 * Create a time-based condition
 * @param {Object} options - Time options
 * @param {number} [options.startHour] - Start hour (0-23)
 * @param {number} [options.endHour] - End hour (0-23)
 * @param {number[]} [options.allowedDays] - Allowed days (0=Sunday, 6=Saturday)
 * @param {string} [options.timezone] - Timezone (default: system)
 * @returns {Function} Condition function
 */
export function timeCondition(options = {}) {
  return (user, resource, context) => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    if (options.startHour !== undefined && hour < options.startHour) {
      return { allowed: false, reason: 'Outside allowed hours' };
    }

    if (options.endHour !== undefined && hour >= options.endHour) {
      return { allowed: false, reason: 'Outside allowed hours' };
    }

    if (options.allowedDays && !options.allowedDays.includes(day)) {
      return { allowed: false, reason: 'Outside allowed days' };
    }

    return { allowed: true };
  };
}

/**
 * Create an IP-based condition
 * @param {string[]} allowedRanges - Allowed IP ranges (CIDR notation)
 * @returns {Function} Condition function
 */
export function ipCondition(allowedRanges) {
  return (user, resource, context) => {
    const userIp = user.ip || context.ip || context.req?.ip;
    
    if (!userIp) {
      return { allowed: false, reason: 'No IP address available' };
    }

    // Simple range check
    const isAllowed = allowedRanges.some(range => {
      if (range.includes('/')) {
        const [rangeIp, bits] = range.split('/');
        const maskBits = parseInt(bits, 10);
        const ipParts = userIp.split('.').map(Number);
        const rangeParts = rangeIp.split('.').map(Number);
        
        if (ipParts.length !== 4) return userIp === rangeIp;
        
        const mask = 0xFFFFFFFF << (32 - maskBits);
        const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
        const rangeInt = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
        
        return (ipInt & mask) === (rangeInt & mask);
      }
      return userIp === range;
    });

    return {
      allowed: isAllowed,
      reason: isAllowed ? undefined : 'IP not in allowed range'
    };
  };
}

// ============================================================================
// Permission Inheritance Helpers
// ============================================================================

/**
 * Create permission inheritance mapping
 * @param {Object} mappings - Inheritance mappings
 * @returns {Object} Inheritance object
 */
export function createInheritance(mappings) {
  return mappings;
}

/**
 * Standard permission inheritance
 * admin > write > read
 */
export const STANDARD_INHERITANCE = {
  'admin': ['write', 'read'],
  'write': ['read'],
  'read': []
};

/**
 * CRUD permission inheritance
 * admin > delete > update > create > read
 */
export const CRUD_INHERITANCE = {
  'admin': ['delete', 'update', 'create', 'read'],
  'delete': ['read'],
  'update': ['read'],
  'create': ['read'],
  'read': []
};

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

/**
 * Get default permission checker instance
 * @returns {PermissionChecker}
 */
export function getPermissionChecker() {
  if (!defaultInstance) {
    defaultInstance = new PermissionChecker();
  }
  return defaultInstance;
}

/**
 * Reset default instance (primarily for testing)
 */
export function resetPermissionChecker() {
  defaultInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export default PermissionChecker;
