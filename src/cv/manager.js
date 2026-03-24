/**
 * CV Manager
 * Management API for CVs with REST endpoints, bulk operations, and lifecycle management
 */

import { CVRegistry } from './registry.js';
import { CVFactory } from './factory.js';
import { RightsEngine } from './engine.js';
import { ObligationsMonitor } from './obligations.js';
import { validateCV, validatePartialCV } from './schema.js';
import { EventEmitter } from 'events';

/**
 * CV Manager - Central management API for the CV system
 */
export class CVManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableAudit: true,
      enableMetrics: true,
      maxBulkOperationSize: 100,
      ...options
    };
    
    // Core components
    this.registry = options.registry || new CVRegistry();
    this.factory = options.factory || new CVFactory(this.registry);
    this.rightsEngine = options.rightsEngine || new RightsEngine();
    this.obligationsMonitor = options.obligationsMonitor || new ObligationsMonitor();
    
    // Audit log
    this.auditLog = [];
    this.maxAuditEntries = 10000;
    
    // Metrics
    this.metrics = {
      requests: 0,
      operations: {
        create: 0,
        read: 0,
        update: 0,
        delete: 0,
        search: 0,
        check: 0
      }
    };
    
    // Event forwarding
    this._setupEventForwarding();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a new CV
   * @param {Object} data - CV data
   * @param {Object} options - Creation options
   * @returns {Object} - Created CV
   */
  async create(data, options = {}) {
    this._trackOperation('create');
    
    try {
      // Validate
      const validation = validateCV(data);
      if (!validation.valid) {
        throw this._createError('VALIDATION_ERROR', 'CV validation failed', validation.errors);
      }
      
      // Create
      const cv = this.registry.create(validation.data, options);
      
      // Audit
      this._audit('create', cv.identity.id, { success: true });
      
      this.emit('cv:created', cv);
      
      return {
        success: true,
        cv,
        links: this._generateLinks(cv.identity.id)
      };
    } catch (error) {
      this._audit('create', data.identity?.id || 'unknown', { success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Get a CV by ID
   * @param {string} id - CV ID
   * @param {Object} options - Retrieval options
   * @returns {Object}
   */
  async get(id, options = {}) {
    this._trackOperation('read');
    
    const cv = this.registry.get(id, options);
    
    if (!cv) {
      throw this._createError('NOT_FOUND', `CV '${id}' not found`);
    }
    
    // Get effective rights and obligations if requested
    const result = { cv };
    
    if (options.includeEffectiveRights) {
      result.effectiveRights = this.factory.getEffectiveRights(id);
    }
    
    if (options.includeEffectiveObligations) {
      result.effectiveObligations = this.factory.getEffectiveObligations(id);
    }
    
    if (options.includeCompliance) {
      result.compliance = this.obligationsMonitor.checkCompliance(id);
    }
    
    if (options.includeVersions) {
      result.versions = this.registry.getVersions(id);
    }
    
    return {
      success: true,
      ...result,
      links: this._generateLinks(id)
    };
  }

  /**
   * Update a CV
   * @param {string} id - CV ID
   * @param {Object} updates - Updates to apply
   * @param {Object} options - Update options
   * @returns {Object}
   */
  async update(id, updates, options = {}) {
    this._trackOperation('update');
    
    try {
      // Validate partial update (skip for now, registry will validate merged result)
      // Note: Full validation happens on the merged CV in registry.update
      
      // Update
      const cv = this.registry.update(id, updates, options);
      
      // Audit
      this._audit('update', id, { success: true });
      
      this.emit('cv:updated', { id, cv });
      
      return {
        success: true,
        cv,
        links: this._generateLinks(id)
      };
    } catch (error) {
      this._audit('update', id, { success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Delete a CV
   * @param {string} id - CV ID
   * @param {Object} options - Delete options
   * @returns {Object}
   */
  async delete(id, options = {}) {
    this._trackOperation('delete');
    
    const deleted = this.registry.delete(id, options);
    
    if (!deleted) {
      throw this._createError('NOT_FOUND', `CV '${id}' not found`);
    }
    
    // Unregister from obligations monitor if present
    this.obligationsMonitor.unregister(id);
    
    // Audit
    this._audit('delete', id, { success: true, permanent: options.permanent });
    
    this.emit('cv:deleted', { id, permanent: options.permanent });
    
    return {
      success: true,
      id,
      deleted: true
    };
  }

  /**
   * List CVs with filtering
   * @param {Object} filters - Filter options
   * @returns {Object}
   */
  async list(filters = {}) {
    this._trackOperation('read');
    
    const result = this.registry.list(filters);
    
    return {
      success: true,
      ...result
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SEARCH AND MATCHING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Search CVs by capabilities
   * @param {Object} criteria - Search criteria
   * @returns {Object}
   */
  async search(criteria = {}) {
    this._trackOperation('search');
    
    const results = this.registry.search(criteria);
    
    return {
      success: true,
      count: results.length,
      results
    };
  }

  /**
   * Match CVs to task requirements
   * @param {Object} requirements - Task requirements
   * @returns {Object}
   */
  async match(requirements) {
    this._trackOperation('search');
    
    const matches = this.registry.match(requirements);
    
    return {
      success: true,
      count: matches.length,
      matches
    };
  }

  /**
   * Find CVs by rights
   * @param {string} right - Right to search for
   * @returns {Object}
   */
  async findByRight(right) {
    this._trackOperation('search');
    
    const results = this.registry.findByRight(right);
    
    return {
      success: true,
      count: results.length,
      results
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEMPLATE OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a CV from a template
   * @param {string} templateName - Template name
   * @param {Object} overrides - Properties to override
   * @param {Object} options - Creation options
   * @returns {Object}
   */
  async createFromTemplate(templateName, overrides = {}, options = {}) {
    this._trackOperation('create');
    
    try {
      const cv = this.factory.createFromTemplate(templateName, overrides, options);
      
      this._audit('create_from_template', cv.identity.id, { template: templateName });
      
      return {
        success: true,
        cv,
        template: templateName,
        links: this._generateLinks(cv.identity.id)
      };
    } catch (error) {
      this._audit('create_from_template', 'unknown', { 
        template: templateName, 
        success: false, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * List available templates
   * @returns {Object}
   */
  async listTemplates() {
    const templates = this.registry.listTemplates();
    
    return {
      success: true,
      count: templates.length,
      templates
    };
  }

  /**
   * Get a template
   * @param {string} name - Template name
   * @returns {Object}
   */
  async getTemplate(name) {
    const template = this.registry.getTemplate(name);
    
    if (!template) {
      throw this._createError('NOT_FOUND', `Template '${name}' not found`);
    }
    
    return {
      success: true,
      template
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RIGHTS AND PERMISSIONS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Check permissions for a CV
   * @param {string} cvId - CV ID
   * @param {Object} check - Permission check
   * @returns {Object}
   */
  async checkPermission(cvId, check) {
    this._trackOperation('check');
    
    const cv = this.registry.get(cvId);
    if (!cv) {
      throw this._createError('NOT_FOUND', `CV '${cvId}' not found`);
    }
    
    const result = await this.rightsEngine.check({
      cv,
      action: check.action,
      resource: check.resource,
      context: check.context || {}
    });
    
    return {
      success: true,
      allowed: result.allowed,
      reason: result.reason,
      cvId
    };
  }

  /**
   * Get effective rights for a CV
   * @param {string} cvId - CV ID
   * @returns {Object}
   */
  async getEffectiveRights(cvId) {
    const cv = this.registry.get(cvId);
    if (!cv) {
      throw this._createError('NOT_FOUND', `CV '${cvId}' not found`);
    }
    
    const rights = this.factory.getEffectiveRights(cvId);
    
    return {
      success: true,
      cvId,
      rights
    };
  }

  /**
   * Validate rights configuration
   * @param {string} cvId - CV ID
   * @returns {Object}
   */
  async validateRights(cvId) {
    const cv = this.registry.get(cvId);
    if (!cv) {
      throw this._createError('NOT_FOUND', `CV '${cvId}' not found`);
    }
    
    const validation = this.rightsEngine.validate(cv.rights || {});
    const enforceable = this.rightsEngine.isEnforceable(cv.rights || {});
    
    return {
      success: true,
      cvId,
      valid: validation.valid && enforceable.enforceable,
      validation,
      enforceable
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // OBLIGATIONS AND COMPLIANCE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get compliance status for a CV
   * @param {string} cvId - CV ID
   * @returns {Object}
   */
  async getCompliance(cvId) {
    const compliance = this.obligationsMonitor.checkCompliance(cvId);
    
    return {
      success: true,
      ...compliance
    };
  }

  /**
   * Get effective obligations for a CV
   * @param {string} cvId - CV ID
   * @returns {Object}
   */
  async getEffectiveObligations(cvId) {
    const cv = this.registry.get(cvId);
    if (!cv) {
      throw this._createError('NOT_FOUND', `CV '${cvId}' not found`);
    }
    
    const obligations = this.factory.getEffectiveObligations(cvId);
    
    return {
      success: true,
      cvId,
      obligations
    };
  }

  /**
   * Get performance metrics for a CV
   * @param {string} cvId - CV ID
   * @returns {Object}
   */
  async getPerformanceMetrics(cvId) {
    const metrics = this.obligationsMonitor.getPerformanceMetrics(cvId);
    
    if (!metrics) {
      throw this._createError('NOT_FOUND', `No metrics for CV '${cvId}'`);
    }
    
    return {
      success: true,
      ...metrics
    };
  }

  /**
   * Get resource usage for a CV
   * @param {string} cvId - CV ID
   * @returns {Object}
   */
  async getResourceUsage(cvId) {
    const usage = this.obligationsMonitor.getResourceUsage(cvId);
    
    if (!usage) {
      throw this._createError('NOT_FOUND', `No resource usage for CV '${cvId}'`);
    }
    
    return {
      success: true,
      ...usage
    };
  }

  /**
   * Get violations for a CV
   * @param {string} cvId - CV ID
   * @param {Object} filters - Filter options
   * @returns {Object}
   */
  async getViolations(cvId, filters = {}) {
    const violations = this.obligationsMonitor.getAgentViolations(cvId);
    
    return {
      success: true,
      count: violations.length,
      violations
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LIFECYCLE MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Activate a CV
   * @param {string} id - CV ID
   * @returns {Object}
   */
  async activate(id) {
    const cv = this.registry.update(id, {
      lifecycle: { status: 'active' }
    });
    
    // Register with obligations monitor
    this.obligationsMonitor.register(id, cv);
    
    this._audit('activate', id, { success: true });
    this.emit('cv:activated', { id, cv });
    
    return {
      success: true,
      cv,
      message: `CV '${id}' activated`
    };
  }

  /**
   * Suspend a CV
   * @param {string} id - CV ID
   * @param {string} reason - Suspension reason
   * @returns {Object}
   */
  async suspend(id, reason = '') {
    const cv = this.registry.update(id, {
      lifecycle: { 
        status: 'suspended',
        suspensionReason: reason,
        suspendedAt: Date.now()
      }
    });
    
    this._audit('suspend', id, { success: true, reason });
    this.emit('cv:suspended', { id, cv, reason });
    
    return {
      success: true,
      cv,
      message: `CV '${id}' suspended${reason ? `: ${reason}` : ''}`
    };
  }

  /**
   * Deprecate a CV
   * @param {string} id - CV ID
   * @param {string} reason - Deprecation reason
   * @returns {Object}
   */
  async deprecate(id, reason = '') {
    const cv = this.registry.update(id, {
      lifecycle: { 
        status: 'deprecated',
        deprecationReason: reason,
        deprecatedAt: Date.now()
      }
    });
    
    this._audit('deprecate', id, { success: true, reason });
    this.emit('cv:deprecated', { id, cv, reason });
    
    return {
      success: true,
      cv,
      message: `CV '${id}' deprecated${reason ? `: ${reason}` : ''}`
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VERSIONING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get version history for a CV
   * @param {string} id - CV ID
   * @returns {Object}
   */
  async getVersions(id) {
    const versions = this.registry.getVersions(id);
    
    return {
      success: true,
      count: versions.length,
      versions
    };
  }

  /**
   * Rollback to a specific version
   * @param {string} id - CV ID
   * @param {string} version - Version to rollback to
   * @returns {Object}
   */
  async rollback(id, version) {
    const cv = this.registry.rollback(id, version);
    
    this._audit('rollback', id, { version });
    this.emit('cv:rollback', { id, version, cv });
    
    return {
      success: true,
      cv,
      message: `CV '${id}' rolled back to version '${version}'`
    };
  }

  /**
   * Diff two versions
   * @param {string} id - CV ID
   * @param {string} v1 - First version
   * @param {string} v2 - Second version
   * @returns {Object}
   */
  async diffVersions(id, v1, v2) {
    const diff = this.registry.diffVersions(id, v1, v2);
    
    return {
      success: true,
      diff
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CLONING AND SPECIALIZATION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Clone a CV
   * @param {string} id - Source CV ID
   * @param {Object} modifications - Modifications to apply
   * @returns {Object}
   */
  async clone(id, modifications = {}) {
    const cv = this.factory.clone(id, modifications);
    
    this._audit('clone', cv.identity.id, { source: id });
    this.emit('cv:cloned', { id: cv.identity.id, source: id, cv });
    
    return {
      success: true,
      cv,
      source: id,
      links: this._generateLinks(cv.identity.id)
    };
  }

  /**
   * Create a specialized CV
   * @param {string} baseId - Base CV ID
   * @param {string} specialization - Specialization name
   * @param {Object} config - Specialization config
   * @returns {Object}
   */
  async specialize(baseId, specialization, config = {}) {
    const cv = this.factory.specialize(baseId, specialization, config);
    
    this._audit('specialize', cv.identity.id, { base: baseId, specialization });
    this.emit('cv:specialized', { 
      id: cv.identity.id, 
      base: baseId, 
      specialization, 
      cv 
    });
    
    return {
      success: true,
      cv,
      base: baseId,
      specialization,
      links: this._generateLinks(cv.identity.id)
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BULK OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Bulk create CVs
   * @param {Array} items - Array of CV data
   * @returns {Object}
   */
  async bulkCreate(items) {
    if (items.length > this.options.maxBulkOperationSize) {
      throw this._createError(
        'TOO_MANY_ITEMS',
        `Maximum ${this.options.maxBulkOperationSize} items allowed`
      );
    }
    
    const results = [];
    const errors = [];
    
    for (const item of items) {
      try {
        const result = await this.create(item, { autoRegister: false });
        results.push(result);
      } catch (error) {
        errors.push({
          item,
          error: error.message,
          code: error.code
        });
      }
    }
    
    return {
      success: errors.length === 0,
      created: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Bulk update CVs
   * @param {Array} items - Array of { id, updates }
   * @returns {Object}
   */
  async bulkUpdate(items) {
    if (items.length > this.options.maxBulkOperationSize) {
      throw this._createError(
        'TOO_MANY_ITEMS',
        `Maximum ${this.options.maxBulkOperationSize} items allowed`
      );
    }
    
    const results = [];
    const errors = [];
    
    for (const item of items) {
      try {
        const result = await this.update(item.id, item.updates);
        results.push(result);
      } catch (error) {
        errors.push({
          id: item.id,
          error: error.message,
          code: error.code
        });
      }
    }
    
    return {
      success: errors.length === 0,
      updated: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Bulk delete CVs
   * @param {Array} ids - Array of CV IDs
   * @returns {Object}
   */
  async bulkDelete(ids) {
    if (ids.length > this.options.maxBulkOperationSize) {
      throw this._createError(
        'TOO_MANY_ITEMS',
        `Maximum ${this.options.maxBulkOperationSize} items allowed`
      );
    }
    
    const results = [];
    const errors = [];
    
    for (const id of ids) {
      try {
        const result = await this.delete(id);
        results.push(result);
      } catch (error) {
        errors.push({
          id,
          error: error.message,
          code: error.code
        });
      }
    }
    
    return {
      success: errors.length === 0,
      deleted: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Bulk activate CVs
   * @param {Array} ids - Array of CV IDs
   * @returns {Object}
   */
  async bulkActivate(ids) {
    const results = [];
    const errors = [];
    
    for (const id of ids) {
      try {
        const result = await this.activate(id);
        results.push(result);
      } catch (error) {
        errors.push({ id, error: error.message });
      }
    }
    
    return {
      success: errors.length === 0,
      activated: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STATS AND INFO
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get system statistics
   * @returns {Object}
   */
  async getStats() {
    return {
      success: true,
      registry: this.registry.getStats(),
      factory: this.factory.getStats(),
      rightsEngine: this.rightsEngine.getStats(),
      obligationsMonitor: this.obligationsMonitor.getStats(),
      manager: {
        requests: this.metrics.requests,
        operations: this.metrics.operations,
        auditEntries: this.auditLog.length
      }
    };
  }

  /**
   * Get audit log
   * @param {Object} filters - Filter options
   * @returns {Object}
   */
  async getAuditLog(filters = {}) {
    let entries = [...this.auditLog];
    
    if (filters.action) {
      entries = entries.filter(e => e.action === filters.action);
    }
    
    if (filters.cvId) {
      entries = entries.filter(e => e.cvId === filters.cvId);
    }
    
    if (filters.since) {
      entries = entries.filter(e => e.timestamp >= filters.since);
    }
    
    if (filters.limit) {
      entries = entries.slice(0, filters.limit);
    }
    
    return {
      success: true,
      count: entries.length,
      entries
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // REST ROUTES (Express-style)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get Express router for CV API
   * @returns {Function} - Express router setup function
   */
  getRouter() {
    return (router) => {
      // CRUD
      router.post('/', async (req, res) => {
        try {
          const result = await this.create(req.body);
          res.status(201).json(result);
        } catch (error) {
          res.status(error.code === 'VALIDATION_ERROR' ? 400 : 500).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      router.get('/', async (req, res) => {
        try {
          const result = await this.list(req.query);
          res.json(result);
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      
      router.get('/:id', async (req, res) => {
        try {
          const result = await this.get(req.params.id, req.query);
          res.json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 500).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      router.put('/:id', async (req, res) => {
        try {
          const result = await this.update(req.params.id, req.body);
          res.json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      router.delete('/:id', async (req, res) => {
        try {
          const result = await this.delete(req.params.id, req.query);
          res.json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 500).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      // Search
      router.post('/search', async (req, res) => {
        try {
          const result = await this.search(req.body);
          res.json(result);
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      
      router.post('/match', async (req, res) => {
        try {
          const result = await this.match(req.body);
          res.json(result);
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      
      // Templates
      router.get('/templates', async (req, res) => {
        try {
          const result = await this.listTemplates();
          res.json(result);
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      
      router.post('/templates/:name/instantiate', async (req, res) => {
        try {
          const result = await this.createFromTemplate(req.params.name, req.body);
          res.status(201).json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      // Rights
      router.get('/:id/rights', async (req, res) => {
        try {
          const result = await this.getEffectiveRights(req.params.id);
          res.json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 500).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      router.post('/:id/check', async (req, res) => {
        try {
          const result = await this.checkPermission(req.params.id, req.body);
          res.json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 500).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      // Compliance
      router.get('/:id/compliance', async (req, res) => {
        try {
          const result = await this.getCompliance(req.params.id);
          res.json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 500).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      // Lifecycle
      router.post('/:id/activate', async (req, res) => {
        try {
          const result = await this.activate(req.params.id);
          res.json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 500).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      router.post('/:id/suspend', async (req, res) => {
        try {
          const result = await this.suspend(req.params.id, req.body.reason);
          res.json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 500).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      router.post('/:id/clone', async (req, res) => {
        try {
          const result = await this.clone(req.params.id, req.body);
          res.status(201).json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      // Versions
      router.get('/:id/versions', async (req, res) => {
        try {
          const result = await this.getVersions(req.params.id);
          res.json(result);
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      
      router.post('/:id/rollback', async (req, res) => {
        try {
          const result = await this.rollback(req.params.id, req.body.version);
          res.json(result);
        } catch (error) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
      });
      
      return router;
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  _trackOperation(operation) {
    this.metrics.requests++;
    this.metrics.operations[operation] = (this.metrics.operations[operation] || 0) + 1;
  }

  _createError(code, message, details = null) {
    const error = new Error(message);
    error.code = code;
    if (details) error.details = details;
    return error;
  }

  _audit(action, cvId, data) {
    if (!this.options.enableAudit) return;
    
    const entry = {
      id: this._generateId(),
      timestamp: Date.now(),
      action,
      cvId,
      ...data
    };
    
    this.auditLog.unshift(entry);
    
    while (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog.pop();
    }
  }

  _generateLinks(id) {
    const base = `/api/v1/cv`;
    return {
      self: `${base}/${id}`,
      rights: `${base}/${id}/rights`,
      compliance: `${base}/${id}/compliance`,
      versions: `${base}/${id}/versions`,
      activate: `${base}/${id}/activate`,
      suspend: `${base}/${id}/suspend`,
      clone: `${base}/${id}/clone`
    };
  }

  _generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  }

  _setupEventForwarding() {
    // Forward registry events
    this.registry.on('cv:created', (data) => this.emit('registry:cv:created', data));
    this.registry.on('cv:updated', (data) => this.emit('registry:cv:updated', data));
    
    // Forward factory events
    this.factory.on('cv:created', (data) => this.emit('factory:cv:created', data));
    
    // Forward rights engine events
    this.rightsEngine.on('rights:denied', (data) => this.emit('rights:denied', data));
    
    // Forward obligations monitor events
    this.obligationsMonitor.on('violation', (data) => this.emit('obligations:violation', data));
    this.obligationsMonitor.on('alert', (data) => this.emit('obligations:alert', data));
  }
}

export default CVManager;
