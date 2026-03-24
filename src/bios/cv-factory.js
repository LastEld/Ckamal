/**
 * CV Factory
 * Factory for creating agents from CVs and templates
 */

import { CVRegistry } from './cv-registry.js';
import { validateCV, createDefaultCV, sanitizeCV, diffCVs } from './cv-schema.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CV Factory for creating and managing agent CVs
 */
export class CVFactory {
  constructor(registry = null) {
    this.registry = registry || new CVRegistry();
    this.templateCache = new Map();
    this.loadTemplates();
  }

  /**
   * Load built-in templates from cv-templates directory
   */
  loadTemplates() {
    const templateNames = [
      'architect',
      'developer',
      'analyst',
      'tester',
      'devops'
    ];

    for (const name of templateNames) {
      try {
        const template = this._loadTemplateFile(name);
        this.registry.registerTemplate(name, template);
        this.templateCache.set(name, template);
      } catch (error) {
        console.warn(`Failed to load template '${name}': ${error.message}`);
      }
    }
  }

  /**
   * Create a CV from a template with optional overrides
   * @param {string} templateName - Name of the template to use
   * @param {Object} overrides - Properties to override
   * @returns {Object} - Created CV
   */
  createFromTemplate(templateName, overrides = {}) {
    const template = this.registry.getTemplate(templateName);
    
    if (!template) {
      throw new Error(`Template '${templateName}' not found. Available: ${this.getAvailableTemplates().join(', ')}`);
    }

    // Deep clone template
    const cv = this._deepClone(template);
    
    // Apply overrides
    const merged = this._deepMerge(cv, overrides);
    
    // Ensure required fields
    if (!merged.id) {
      merged.id = this._generateId(templateName);
    }
    if (!merged.name) {
      merged.name = `${this._capitalize(templateName)} Agent`;
    }
    
    // Add metadata
    merged.createdAt = Date.now();
    merged.templateOrigin = templateName;
    
    // Validate
    const validation = validateCV(merged);
    if (!validation.valid) {
      throw new Error(`Created CV validation failed: ${validation.errors.join(', ')}`);
    }
    
    return merged;
  }

  /**
   * Create a custom CV from a specification
   * @param {Object} spec - CV specification
   * @param {Object} options - Creation options
   * @param {boolean} [options.autoRegister=true] - Auto-register in registry
   * @param {boolean} [options.validate=true] - Validate before creation
   * @returns {Object} - Created CV
   */
  createCustomCV(spec, options = {}) {
    const { autoRegister = true, validate = true } = options;
    
    // Start with defaults if partial spec
    let cv;
    if (spec.template) {
      cv = this.createFromTemplate(spec.template, spec);
      delete cv.template; // Remove template reference
    } else {
      cv = createDefaultCV(
        spec.id || this._generateId('custom'),
        spec.name || 'Custom Agent'
      );
      cv = this._deepMerge(cv, spec);
    }
    
    // Validate
    if (validate) {
      const validation = validateCV(cv);
      if (!validation.valid) {
        throw new Error(`Custom CV validation failed: ${validation.errors.join(', ')}`);
      }
    }
    
    // Register
    if (autoRegister) {
      this.registry.registerCV(cv);
    }
    
    return cv;
  }

  /**
   * Clone an existing CV with modifications
   * @param {string} id - ID of CV to clone
   * @param {Object} modifications - Modifications to apply
   * @param {Object} options - Clone options
   * @param {boolean} [options.autoRegister=true] - Auto-register clone
   * @returns {Object} - Cloned CV
   */
  cloneCV(id, modifications = {}, options = {}) {
    const { autoRegister = true } = options;
    
    // Get original CV
    const original = this.registry.getCV(id);
    if (!original) {
      throw new Error(`CV with ID '${id}' not found`);
    }
    
    // Deep clone
    const clone = this._deepClone(original);
    
    // Apply modifications
    const modified = this._deepMerge(clone, modifications);
    
    // Update clone metadata
    modified.id = modifications.id || this._generateId(`${original.id}-clone`);
    modified.name = modifications.name || `${original.name} (Clone)`;
    modified.version = '1.0.0';
    modified.clonedFrom = original.id;
    modified.createdAt = Date.now();
    
    // Clear performance stats for new clone
    if (!modifications.preservePerformance) {
      modified.performance = {
        successRate: 0.9,
        avgLatency: 2000,
        qualityScore: 80,
        tasksCompleted: 0
      };
    }
    
    // Validate
    const validation = validateCV(modified);
    if (!validation.valid) {
      throw new Error(`Cloned CV validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Register
    if (autoRegister) {
      this.registry.registerCV(modified);
    }
    
    return modified;
  }

  /**
   * Create multiple CVs from a batch specification
   * @param {Array} specs - Array of CV specifications
   * @param {Object} options - Batch options
   * @returns {Object[]} - Created CVs
   */
  createBatch(specs, options = {}) {
    const results = [];
    const errors = [];
    
    for (const spec of specs) {
      try {
        const cv = this.createCustomCV(spec, options);
        results.push({ success: true, cv });
      } catch (error) {
        errors.push({ success: false, spec, error: error.message });
        if (!options.continueOnError) {
          break;
        }
      }
    }
    
    return { results, errors };
  }

  /**
   * Get list of available templates
   * @returns {string[]} - Template names
   */
  getAvailableTemplates() {
    return Array.from(this.registry.templates.keys());
  }

  /**
   * Get a template definition
   * @param {string} name - Template name
   * @returns {Object|null} - Template or null
   */
  getTemplate(name) {
    return this.registry.getTemplate(name);
  }

  /**
   * Register a custom template
   * @param {string} name - Template name
   * @param {Object} definition - Template definition
   */
  registerTemplate(name, definition) {
    this.registry.registerTemplate(name, definition);
    this.templateCache.set(name, definition);
  }

  /**
   * Compare two CVs and return detailed differences
   * @param {string} id1 - First CV ID
   * @param {string} id2 - Second CV ID
   * @returns {Object} - Differences
   */
  compareCVs(id1, id2) {
    const cv1 = this.registry.getCV(id1);
    const cv2 = this.registry.getCV(id2);
    
    if (!cv1) throw new Error(`CV with ID '${id1}' not found`);
    if (!cv2) throw new Error(`CV with ID '${id2}' not found`);
    
    return diffCVs(cv1, cv2);
  }

  /**
   * Upgrade a CV to a new version
   * @param {string} id - CV ID
   * @param {string} newVersion - New version string
   * @param {Object} upgrades - Additional upgrades
   * @returns {Object} - Updated CV
   */
  upgradeCV(id, newVersion, upgrades = {}) {
    const cv = this.registry.getCV(id);
    if (!cv) {
      throw new Error(`CV with ID '${id}' not found`);
    }
    
    const updates = {
      version: newVersion,
      ...upgrades,
      lifecycle: {
        ...cv.lifecycle,
        ...upgrades.lifecycle,
        upgradedAt: Date.now()
      }
    };
    
    return this.registry.updateCV(id, updates);
  }

  /**
   * Create a specialized variant of a CV
   * @param {string} baseId - Base CV ID
   * @param {string} specialization - Specialization name
   * @param {Object} specializationConfig - Specialization configuration
   * @returns {Object} - Specialized CV
   */
  specialize(baseId, specialization, specializationConfig) {
    const base = this.registry.getCV(baseId);
    if (!base) {
      throw new Error(`Base CV with ID '${baseId}' not found`);
    }
    
    const modifications = {
      id: `${baseId}-${specialization}`,
      name: `${base.name} - ${this._capitalize(specialization)}`,
      specialization: {
        ...base.specialization,
        primary: specialization,
        secondary: [
          base.specialization?.primary,
          ...(base.specialization?.secondary || [])
        ].filter(Boolean)
      },
      ...specializationConfig
    };
    
    return this.cloneCV(baseId, modifications);
  }

  // Private helper methods

  _loadTemplateFile(name) {
    try {
      // Try to load from file system
      const templatePath = join(__dirname, 'cv-templates', `${name}.json`);
      const content = readFileSync(templatePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // Fallback to embedded templates
      return this._getEmbeddedTemplate(name);
    }
  }

  _getEmbeddedTemplate(name) {
    const templates = {
      architect: {
        id: 'template-architect',
        name: 'System Architect',
        version: '1.0.0',
        description: 'Designs system architecture and defines technical standards',
        capabilities: {
          languages: ['typescript', 'javascript', 'python', 'go'],
          domains: ['architecture', 'backend', 'infrastructure', 'design'],
          tools: ['mcp', 'git', 'docker', 'k8s', 'terraform'],
          maxContextTokens: 200000,
          supportsStreaming: true,
          supportsVision: true
        },
        performance: {
          successRate: 0.92,
          avgLatency: 3000,
          qualityScore: 90,
          tasksCompleted: 0
        },
        execution: {
          preferredClient: 'claude',
          fallbackClients: ['kimi', 'codex'],
          parallelizable: false,
          retryPolicy: { maxRetries: 2, backoff: 'exponential' },
          timeout: 600000
        },
        resources: {
          minMemory: 1024,
          maxMemory: 4096,
          priority: 8
        },
        specialization: {
          primary: 'system_architect',
          secondary: ['tech_lead', 'solution_designer'],
          certifications: ['mcp_advanced', 'aws_architect']
        },
        lifecycle: {
          status: 'active',
          maxLifetime: 7200000
        }
      },
      developer: {
        id: 'template-developer',
        name: 'Full-Stack Developer',
        version: '1.0.0',
        description: 'Implements features across the full stack',
        capabilities: {
          languages: ['javascript', 'typescript', 'python', 'html', 'css'],
          domains: ['frontend', 'backend', 'database', 'api'],
          tools: ['mcp', 'git', 'docker', 'vscode'],
          maxContextTokens: 150000,
          supportsStreaming: true,
          supportsVision: false
        },
        performance: {
          successRate: 0.90,
          avgLatency: 2500,
          qualityScore: 85,
          tasksCompleted: 0
        },
        execution: {
          preferredClient: 'auto',
          fallbackClients: ['claude', 'kimi'],
          parallelizable: true,
          retryPolicy: { maxRetries: 3, backoff: 'exponential' },
          timeout: 300000
        },
        resources: {
          minMemory: 512,
          maxMemory: 2048,
          priority: 5
        },
        specialization: {
          primary: 'fullstack_developer',
          secondary: ['frontend_dev', 'backend_dev'],
          certifications: ['mcp_core']
        },
        lifecycle: {
          status: 'active',
          maxLifetime: 3600000
        }
      },
      analyst: {
        id: 'template-analyst',
        name: 'Code Analyst',
        version: '1.0.0',
        description: 'Analyzes code for quality, security, and optimization',
        capabilities: {
          languages: ['javascript', 'typescript', 'python', 'rust', 'go'],
          domains: ['analysis', 'security', 'performance', 'review'],
          tools: ['mcp', 'git', 'eslint', 'sonarqube'],
          maxContextTokens: 200000,
          supportsStreaming: true,
          supportsVision: true
        },
        performance: {
          successRate: 0.95,
          avgLatency: 2000,
          qualityScore: 92,
          tasksCompleted: 0
        },
        execution: {
          preferredClient: 'claude',
          fallbackClients: ['kimi'],
          parallelizable: true,
          retryPolicy: { maxRetries: 2, backoff: 'linear' },
          timeout: 180000
        },
        resources: {
          minMemory: 512,
          maxMemory: 2048,
          priority: 6
        },
        specialization: {
          primary: 'code_analyst',
          secondary: ['security_auditor', 'performance_expert'],
          certifications: ['security_aware', 'mcp_advanced']
        },
        lifecycle: {
          status: 'active',
          maxLifetime: 1800000
        }
      },
      tester: {
        id: 'template-tester',
        name: 'QA Tester',
        version: '1.0.0',
        description: 'Tests software for bugs and quality assurance',
        capabilities: {
          languages: ['javascript', 'typescript', 'python', 'java'],
          domains: ['testing', 'qa', 'automation', 'validation'],
          tools: ['mcp', 'git', 'jest', 'cypress', 'playwright'],
          maxContextTokens: 100000,
          supportsStreaming: true,
          supportsVision: true
        },
        performance: {
          successRate: 0.93,
          avgLatency: 1500,
          qualityScore: 88,
          tasksCompleted: 0
        },
        execution: {
          preferredClient: 'auto',
          fallbackClients: ['codex', 'kimi'],
          parallelizable: true,
          retryPolicy: { maxRetries: 3, backoff: 'exponential' },
          timeout: 300000
        },
        resources: {
          minMemory: 512,
          maxMemory: 1536,
          priority: 4
        },
        specialization: {
          primary: 'qa_tester',
          secondary: ['test_automation', 'manual_tester'],
          certifications: ['testing_foundation']
        },
        lifecycle: {
          status: 'active',
          maxLifetime: 2400000
        }
      },
      devops: {
        id: 'template-devops',
        name: 'DevOps Engineer',
        version: '1.0.0',
        description: 'Manages CI/CD, infrastructure, and deployment',
        capabilities: {
          languages: ['python', 'bash', 'yaml', 'go'],
          domains: ['devops', 'infrastructure', 'ci_cd', 'cloud'],
          tools: ['mcp', 'git', 'docker', 'k8s', 'jenkins', 'github_actions'],
          maxContextTokens: 120000,
          supportsStreaming: true,
          supportsVision: false
        },
        performance: {
          successRate: 0.91,
          avgLatency: 2500,
          qualityScore: 87,
          tasksCompleted: 0
        },
        execution: {
          preferredClient: 'kimi',
          fallbackClients: ['claude', 'codex'],
          parallelizable: true,
          retryPolicy: { maxRetries: 3, backoff: 'exponential' },
          timeout: 600000
        },
        resources: {
          minMemory: 1024,
          maxMemory: 3072,
          priority: 7
        },
        specialization: {
          primary: 'devops_engineer',
          secondary: ['sre', 'platform_engineer'],
          certifications: ['k8s_admin', 'aws_devops']
        },
        lifecycle: {
          status: 'active',
          maxLifetime: 3600000
        }
      }
    };
    
    return templates[name];
  }

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  _generateId(prefix) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${prefix}-${timestamp}-${random}`;
  }

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Convenience function for quick CV creation
export function createAgent(templateName, overrides = {}) {
  const factory = new CVFactory();
  return factory.createFromTemplate(templateName, overrides);
}

// Default export
export default CVFactory;
