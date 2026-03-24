/**
 * CV Factory
 * Factory for creating agents from CVs with template support and inheritance
 */

import { CVRegistry } from './registry.js';
import { validateCV, createDefaultCV, mergeCVs, diffCVs } from './schema.js';
import { EventEmitter } from 'events';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CV Factory for creating and managing agent CVs
 */
export class CVFactory extends EventEmitter {
  constructor(registry = null, options = {}) {
    super();
    
    this.registry = registry || new CVRegistry();
    this.options = {
      autoRegister: true,
      validateOnCreate: true,
      templatePath: join(__dirname, 'templates'),
      ...options
    };
    
    this.templateCache = new Map();
    this.inheritanceCache = new Map();
    
    // Stats
    this.stats = {
      totalCreated: 0,
      fromTemplate: 0,
      fromInheritance: 0,
      customCreated: 0,
      cloned: 0,
      specialized: 0
    };
    
    // Load built-in templates
    this._loadBuiltInTemplates();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEMPLATE-BASED CREATION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a CV from a template
   * @param {string} templateName - Name of the template
   * @param {Object} overrides - Properties to override
   * @param {Object} options - Creation options
   * @returns {Object} - Created CV
   */
  createFromTemplate(templateName, overrides = {}, options = {}) {
    const opts = { ...this.options, ...options };
    
    // Get template
    let template = this.registry.getTemplate(templateName);
    
    if (!template) {
      // Try to load from file
      template = this._loadTemplateFromFile(templateName);
    }
    
    if (!template) {
      throw new Error(
        `Template '${templateName}' not found. ` +
        `Available: ${this.registry.listTemplates().map(t => t.name).join(', ')}`
      );
    }
    
    // Deep clone template
    let cv = this._deepClone(template);
    
    // Apply overrides
    cv = mergeCVs(cv, overrides);
    
    // Ensure identity fields
    if (!cv.identity) {
      cv.identity = {};
    }
    
    if (!cv.identity.id) {
      cv.identity.id = this._generateId(templateName);
    }
    
    if (!cv.identity.name) {
      cv.identity.name = `${this._capitalize(templateName)} Agent`;
    }
    
    if (!cv.identity.version) {
      cv.identity.version = '1.0.0';
    }
    
    // Set lineage
    if (!cv.identity.lineage) {
      cv.identity.lineage = {};
    }
    cv.identity.lineage.template_origin = templateName;
    
    // Set timestamps
    const now = Date.now();
    if (!cv.lifecycle) {
      cv.lifecycle = {};
    }
    cv.lifecycle.created_at = now;
    cv.lifecycle.updated_at = now;
    cv.lifecycle.status = cv.lifecycle.status || 'draft';
    
    // Validate
    if (opts.validateOnCreate) {
      const validation = validateCV(cv);
      if (!validation.valid) {
        throw new Error(`Created CV validation failed: ${validation.errors.join(', ')}`);
      }
      cv = validation.data;
    }
    
    // Register
    if (opts.autoRegister) {
      this.registry.create(cv, { skipValidation: true });
    }
    
    // Update stats
    this.stats.totalCreated++;
    this.stats.fromTemplate++;
    
    this.emit('cv:created', {
      source: 'template',
      template: templateName,
      cv
    });
    
    return cv;
  }

  /**
   * Create multiple CVs from templates
   * @param {Array} configs - Array of { template, overrides, options }
   * @returns {Object} - Created CVs and any errors
   */
  createBatch(configs) {
    const results = [];
    const errors = [];
    
    for (const config of configs) {
      try {
        const cv = this.createFromTemplate(
          config.template,
          config.overrides || {},
          config.options || {}
        );
        results.push({ success: true, cv });
      } catch (error) {
        errors.push({
          success: false,
          template: config.template,
          error: error.message
        });
        
        if (!config.continueOnError) {
          break;
        }
      }
    }
    
    return { results, errors };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INHERITANCE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a CV that inherits from a parent CV
   * @param {string} parentId - Parent CV ID
   * @param {Object} overrides - Properties to override
   * @param {Object} options - Creation options
   * @returns {Object} - Created CV
   */
  createFromParent(parentId, overrides = {}, options = {}) {
    const opts = { ...this.options, ...options };
    
    // Get parent CV
    const parent = this.registry.get(parentId);
    if (!parent) {
      throw new Error(`Parent CV '${parentId}' not found`);
    }
    
    // Inherit from parent
    let cv = this._inherit(parent, overrides);
    
    // Set identity
    if (!cv.identity) {
      cv.identity = {};
    }
    
    cv.identity.id = overrides.identity?.id || this._generateId(`${parentId}-child`);
    cv.identity.name = overrides.identity?.name || `${parent.identity.name} (Child)`;
    cv.identity.version = '1.0.0';
    
    // Set lineage
    if (!cv.identity.lineage) {
      cv.identity.lineage = {};
    }
    cv.identity.lineage.parent_id = parentId;
    
    // Set timestamps
    const now = Date.now();
    if (!cv.lifecycle) {
      cv.lifecycle = {};
    }
    cv.lifecycle.created_at = now;
    cv.lifecycle.updated_at = now;
    cv.lifecycle.status = 'draft';
    
    // Clear performance stats
    cv.performance = {
      success_rate: 0.9,
      avg_latency: 2000,
      quality_score: 80,
      tasks_completed: 0
    };
    
    // Validate
    if (opts.validateOnCreate) {
      const validation = validateCV(cv);
      if (!validation.valid) {
        throw new Error(`Inherited CV validation failed: ${validation.errors.join(', ')}`);
      }
      cv = validation.data;
    }
    
    // Register
    if (opts.autoRegister) {
      this.registry.create(cv, { skipValidation: true });
    }
    
    // Update stats
    this.stats.totalCreated++;
    this.stats.fromInheritance++;
    
    this.emit('cv:created', {
      source: 'inheritance',
      parent: parentId,
      cv
    });
    
    return cv;
  }

  /**
   * Create a CV with multiple inheritance (merge multiple parents)
   * @param {Array} parentIds - Array of parent CV IDs
   * @param {Object} overrides - Properties to override
   * @param {Object} options - Creation options
   * @returns {Object} - Created CV
   */
  createFromMultipleParents(parentIds, overrides = {}, options = {}) {
    if (parentIds.length === 0) {
      throw new Error('At least one parent required');
    }
    
    if (parentIds.length === 1) {
      return this.createFromParent(parentIds[0], overrides, options);
    }
    
    // Get all parents
    const parents = parentIds.map(id => {
      const parent = this.registry.get(id);
      if (!parent) {
        throw new Error(`Parent CV '${id}' not found`);
      }
      return parent;
    });
    
    // Merge parents (later parents override earlier ones)
    let merged = this._deepClone(parents[0]);
    for (let i = 1; i < parents.length; i++) {
      merged = mergeCVs(merged, parents[i]);
    }
    
    // Apply overrides
    let cv = mergeCVs(merged, overrides);
    
    // Set identity
    cv.identity.id = overrides.identity?.id || this._generateId('multi-child');
    cv.identity.name = overrides.identity?.name || `Multi-Inherited Agent`;
    cv.identity.version = '1.0.0';
    cv.identity.lineage = {
      parent_ids: parentIds,
      inheritance_type: 'multiple'
    };
    
    // Set timestamps
    const now = Date.now();
    cv.lifecycle.created_at = now;
    cv.lifecycle.updated_at = now;
    cv.lifecycle.status = 'draft';
    
    // Clear performance
    cv.performance = {
      success_rate: 0.9,
      avg_latency: 2000,
      quality_score: 80,
      tasks_completed: 0
    };
    
    // Validate
    if (options.validateOnCreate !== false) {
      const validation = validateCV(cv);
      if (!validation.valid) {
        throw new Error(`Multi-inheritance CV validation failed: ${validation.errors.join(', ')}`);
      }
      cv = validation.data;
    }
    
    // Register
    if (options.autoRegister !== false) {
      this.registry.create(cv, { skipValidation: true });
    }
    
    this.stats.totalCreated++;
    this.stats.fromInheritance++;
    
    this.emit('cv:created', {
      source: 'multiple_inheritance',
      parents: parentIds,
      cv
    });
    
    return cv;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CUSTOM CREATION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a custom CV from a specification
   * @param {Object} spec - CV specification
   * @param {Object} options - Creation options
   * @returns {Object} - Created CV
   */
  createCustom(spec, options = {}) {
    const opts = { ...this.options, ...options };
    
    let cv;
    
    // If template specified, start from template
    if (spec.template) {
      cv = this.createFromTemplate(spec.template, {}, { autoRegister: false });
      delete spec.template;
      cv = mergeCVs(cv, spec);
    } else {
      // Start from defaults
      cv = createDefaultCV(
        spec.identity?.id || this._generateId('custom'),
        spec.identity?.name || 'Custom Agent'
      );
      cv = mergeCVs(cv, spec);
    }
    
    // Ensure timestamps
    const now = Date.now();
    cv.lifecycle.created_at = now;
    cv.lifecycle.updated_at = now;
    
    // Validate
    if (opts.validateOnCreate) {
      const validation = validateCV(cv);
      if (!validation.valid) {
        throw new Error(`Custom CV validation failed: ${validation.errors.join(', ')}`);
      }
      cv = validation.data;
    }
    
    // Register
    if (opts.autoRegister) {
      this.registry.create(cv, { skipValidation: true });
    }
    
    // Update stats
    this.stats.totalCreated++;
    this.stats.customCreated++;
    
    this.emit('cv:created', {
      source: 'custom',
      cv
    });
    
    return cv;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CLONING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Clone an existing CV
   * @param {string} sourceId - Source CV ID
   * @param {Object} modifications - Modifications to apply
   * @param {Object} options - Clone options
   * @returns {Object} - Cloned CV
   */
  clone(sourceId, modifications = {}, options = {}) {
    const opts = { ...this.options, ...options };
    
    // Get source CV
    const source = this.registry.get(sourceId);
    if (!source) {
      throw new Error(`Source CV '${sourceId}' not found`);
    }
    
    // Deep clone
    let cv = this._deepClone(source);
    
    // Apply modifications
    cv = mergeCVs(cv, modifications);
    
    // Update identity
    cv.identity.id = modifications.identity?.id || this._generateId(`${sourceId}-clone`);
    cv.identity.name = modifications.identity?.name || `${source.identity.name} (Clone)`;
    cv.identity.version = '1.0.0';
    
    // Set lineage
    cv.identity.lineage = {
      cloned_from: sourceId,
      original_version: source.identity.version
    };
    
    // Update timestamps
    const now = Date.now();
    cv.lifecycle.created_at = now;
    cv.lifecycle.updated_at = now;
    cv.lifecycle.status = 'draft';
    
    // Clear or preserve performance
    if (!modifications.preservePerformance) {
      cv.performance = {
        success_rate: 0.9,
        avg_latency: 2000,
        quality_score: 80,
        tasks_completed: 0
      };
    }
    
    // Validate
    if (opts.validateOnCreate) {
      const validation = validateCV(cv);
      if (!validation.valid) {
        throw new Error(`Cloned CV validation failed: ${validation.errors.join(', ')}`);
      }
      cv = validation.data;
    }
    
    // Register
    if (opts.autoRegister) {
      this.registry.create(cv, { skipValidation: true });
    }
    
    // Update stats
    this.stats.totalCreated++;
    this.stats.cloned++;
    
    this.emit('cv:created', {
      source: 'clone',
      original: sourceId,
      cv
    });
    
    return cv;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SPECIALIZATION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a specialized variant of a CV
   * @param {string} baseId - Base CV ID
   * @param {string} specialization - Specialization name
   * @param {Object} specializationConfig - Specialization configuration
   * @param {Object} options - Creation options
   * @returns {Object} - Specialized CV
   */
  specialize(baseId, specialization, specializationConfig = {}, options = {}) {
    const opts = { ...this.options, ...options };
    
    // Get base CV
    const base = this.registry.get(baseId);
    if (!base) {
      throw new Error(`Base CV '${baseId}' not found`);
    }
    
    // Create modifications
    const modifications = {
      identity: {
        id: specializationConfig.identity?.id || `${baseId}-${specialization}`,
        name: specializationConfig.identity?.name || 
          `${base.identity.name} - ${this._capitalize(specialization)}`,
        lineage: {
          parent_id: baseId,
          specialization
        }
      },
      specialization: {
        primary: specialization,
        secondary: [
          base.specialization?.primary,
          ...(base.specialization?.secondary || [])
        ].filter(Boolean),
        certifications: [
          ...(base.specialization?.certifications || []),
          ...(specializationConfig.addCertifications || [])
        ]
      },
      capabilities: specializationConfig.capabilities || {},
      rights: specializationConfig.rights || {},
      obligations: specializationConfig.obligations || {}
    };
    
    // Create specialized CV via inheritance
    let cv = this._inherit(base, modifications);
    
    // Apply any additional config
    cv = mergeCVs(cv, specializationConfig);
    
    // Set version and timestamps
    cv.identity.version = '1.0.0';
    const now = Date.now();
    cv.lifecycle.created_at = now;
    cv.lifecycle.updated_at = now;
    cv.lifecycle.status = 'draft';
    
    // Clear performance
    cv.performance = {
      success_rate: 0.9,
      avg_latency: 2000,
      quality_score: 80,
      tasks_completed: 0
    };
    
    // Validate
    if (opts.validateOnCreate) {
      const validation = validateCV(cv);
      if (!validation.valid) {
        throw new Error(`Specialized CV validation failed: ${validation.errors.join(', ')}`);
      }
      cv = validation.data;
    }
    
    // Register
    if (opts.autoRegister) {
      this.registry.create(cv, { skipValidation: true });
    }
    
    // Update stats
    this.stats.totalCreated++;
    this.stats.specialized++;
    
    this.emit('cv:created', {
      source: 'specialization',
      base: baseId,
      specialization,
      cv
    });
    
    return cv;
  }

  /**
   * Create a specialized version from a template
   * @param {string} templateName - Template name
   * @param {string} specialization - Specialization
   * @param {Object} config - Additional configuration
   * @returns {Object} - Specialized CV
   */
  specializeFromTemplate(templateName, specialization, config = {}) {
    // First create from template
    const base = this.createFromTemplate(templateName, {}, { autoRegister: false });
    
    // Then apply specialization
    const modifications = {
      identity: {
        id: config.identity?.id || `${templateName}-${specialization}`,
        name: config.identity?.name || 
          `${base.identity.name} - ${this._capitalize(specialization)}`,
        lineage: {
          template_origin: templateName,
          specialization
        }
      },
      specialization: {
        primary: specialization,
        secondary: [base.specialization?.primary].filter(Boolean),
        certifications: [
          ...(base.specialization?.certifications || []),
          ...(config.addCertifications || [])
        ]
      }
    };
    
    let cv = mergeCVs(base, modifications);
    cv = mergeCVs(cv, config);
    
    // Validate and register
    const validation = validateCV(cv);
    if (!validation.valid) {
      throw new Error(`Specialized CV validation failed: ${validation.errors.join(', ')}`);
    }
    
    if (this.options.autoRegister) {
      this.registry.create(validation.data, { skipValidation: true });
    }
    
    this.stats.specialized++;
    
    return validation.data;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEMPLATE MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Load a template from file
   * @param {string} name - Template name
   * @param {string} format - File format ('yaml', 'json')
   * @returns {Object} - Template
   */
  loadTemplate(name, format = 'yaml') {
    const template = this._loadTemplateFromFile(name, format);
    if (template) {
      this.registry.registerTemplate(name, template);
      this.emit('template:loaded', { name, format });
    }
    return template;
  }

  /**
   * Register a custom template
   * @param {string} name - Template name
   * @param {Object} definition - Template definition
   */
  registerTemplate(name, definition) {
    this.registry.registerTemplate(name, definition);
    this.emit('template:registered', { name });
  }

  /**
   * Get available templates
   * @returns {Array}
   */
  getAvailableTemplates() {
    return this.registry.listTemplates();
  }

  /**
   * Get a template
   * @param {string} name - Template name
   * @returns {Object|null}
   */
  getTemplate(name) {
    return this.registry.getTemplate(name);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // COMPARISON
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Compare two CVs
   * @param {string} id1 - First CV ID
   * @param {string} id2 - Second CV ID
   * @returns {Object} - Differences
   */
  compare(id1, id2) {
    const cv1 = this.registry.get(id1);
    const cv2 = this.registry.get(id2);
    
    if (!cv1) throw new Error(`CV '${id1}' not found`);
    if (!cv2) throw new Error(`CV '${id2}' not found`);
    
    return diffCVs(cv1, cv2);
  }

  /**
   * Get effective rights (inherited + own)
   * @param {string} cvId - CV ID
   * @returns {Object}
   */
  getEffectiveRights(cvId) {
    const cv = this.registry.get(cvId);
    if (!cv) throw new Error(`CV '${cvId}' not found`);
    
    // If has parent, merge with parent rights
    if (cv.identity?.lineage?.parent_id) {
      const parent = this.registry.get(cv.identity.lineage.parent_id);
      if (parent && parent.rights) {
        return mergeCVs(parent.rights, cv.rights || {});
      }
    }
    
    return cv.rights || {};
  }

  /**
   * Get effective obligations (inherited + own)
   * @param {string} cvId - CV ID
   * @returns {Object}
   */
  getEffectiveObligations(cvId) {
    const cv = this.registry.get(cvId);
    if (!cv) throw new Error(`CV '${cvId}' not found`);
    
    // If has parent, merge with parent obligations (most restrictive wins)
    if (cv.identity?.lineage?.parent_id) {
      const parent = this.registry.get(cv.identity.lineage.parent_id);
      if (parent && parent.obligations) {
        // For obligations, parent's restrictions take precedence
        return this._mergeObligations(parent.obligations, cv.obligations || {});
      }
    }
    
    return cv.obligations || {};
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STATS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get factory statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      templatesAvailable: this.registry.listTemplates().length
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  _loadBuiltInTemplates() {
    const templates = [
      'architect', 'developer', 'analyst', 'tester', 'devops',
      'system-admin', 'code-reviewer', 'test-agent'
    ];
    
    for (const name of templates) {
      try {
        const template = this._loadTemplateFromFile(name);
        if (template) {
          this.registry.registerTemplate(name, template);
        }
      } catch (error) {
        // Template file might not exist yet
      }
    }
  }

  _loadTemplateFromFile(name, format = 'yaml') {
    const extensions = format === 'yaml' ? ['.yaml', '.yml', '.json'] : ['.json'];
    
    for (const ext of extensions) {
      const path = join(this.options.templatePath, `${name}${ext}`);
      
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf-8');
        
        if (ext === '.json') {
          return JSON.parse(content);
        } else {
          // Simple YAML parsing for basic structures
          return this._parseYAML(content);
        }
      }
    }
    
    return null;
  }

  _parseYAML(content) {
    // Simple YAML parser for CV templates
    const lines = content.split('\n');
    const result = {};
    const stack = [result];
    let currentIndent = 0;
    
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      
      const indent = line.search(/\S/);
      const trimmed = line.trim();
      
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        
        if (value) {
          // Inline value
          const parsed = this._parseYAMLValue(value);
          stack[0][key] = parsed;
        } else {
          // New object
          stack[0][key] = {};
          stack.unshift(stack[0][key]);
          currentIndent = indent;
        }
      } else if (trimmed.startsWith('- ')) {
        // Array item
        const value = trimmed.slice(2);
        const parent = stack[0];
        
        // Find the last array in parent
        const lastKey = Object.keys(parent).pop();
        if (!Array.isArray(parent[lastKey])) {
          parent[lastKey] = [];
        }
        
        const parsed = this._parseYAMLValue(value);
        parent[lastKey].push(parsed);
      }
      
      // Pop stack if indent decreased
      while (stack.length > 1 && indent <= currentIndent) {
        stack.shift();
        currentIndent -= 2;
      }
    }
    
    return result;
  }

  _parseYAMLValue(value) {
    value = value.trim();
    
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === '~') return null;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    if (value.startsWith('[') && value.endsWith(']')) {
      return value.slice(1, -1).split(',').map(v => this._parseYAMLValue(v.trim()));
    }
    
    return value;
  }

  _inherit(parent, overrides) {
    // Clone parent
    const inherited = this._deepClone(parent);
    
    // Merge overrides
    return mergeCVs(inherited, overrides);
  }

  _mergeObligations(parent, child) {
    // For obligations, take the most restrictive (minimum for limits, maximum for requirements)
    const merged = this._deepClone(parent);
    
    // Merge resource limits - take minimums
    if (child.resource_limits?.tokens?.per_task && 
        merged.resource_limits?.tokens?.per_task) {
      merged.resource_limits.tokens.per_task = Math.min(
        merged.resource_limits.tokens.per_task,
        child.resource_limits.tokens.per_task
      );
    }
    
    if (child.resource_limits?.cost?.budget_usd_per_task &&
        merged.resource_limits?.cost?.budget_usd_per_task) {
      merged.resource_limits.cost.budget_usd_per_task = Math.min(
        merged.resource_limits.cost.budget_usd_per_task,
        child.resource_limits.cost.budget_usd_per_task
      );
    }
    
    // Merge performance requirements - take minimums
    if (child.performance?.response_time?.p95_max_ms &&
        merged.performance?.response_time?.p95_max_ms) {
      merged.performance.response_time.p95_max_ms = Math.min(
        merged.performance.response_time.p95_max_ms,
        child.performance.response_time.p95_max_ms
      );
    }
    
    // Merge security - take strictest
    if (child.security?.audit_logging?.level) {
      const levels = ['minimal', 'standard', 'comprehensive'];
      const parentLevel = levels.indexOf(merged.security?.audit_logging?.level || 'minimal');
      const childLevel = levels.indexOf(child.security.audit_logging.level);
      merged.security = merged.security || {};
      merged.security.audit_logging = merged.security.audit_logging || {};
      merged.security.audit_logging.level = levels[Math.max(parentLevel, childLevel)];
    }
    
    return merged;
  }

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _generateId(prefix = 'cv') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${prefix}-${timestamp}-${random}`;
  }

  _capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Convenience function
export function createAgentCV(templateName, overrides = {}, options = {}) {
  const factory = new CVFactory();
  return factory.createFromTemplate(templateName, overrides, options);
}

export default CVFactory;
