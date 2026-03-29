/**
 * Agent CV Registry
 * Manages agent Curriculum Vitae for CogniMesh v5.0
 */

import { CVSchema, validateCV } from './cv-schema.js';

/**
 * Registry for managing agent CVs
 */
export class CVRegistry {
  constructor() {
    this.cvs = new Map(); // All registered CVs by ID
    this.templates = new Map(); // CV templates by name
    this.capabilityIndex = new Map(); // capability -> Set of CV IDs
    this.domainIndex = new Map(); // domain -> Set of CV IDs
    this.toolIndex = new Map(); // tool -> Set of CV IDs
    this.statusIndex = new Map(); // status -> Set of CV IDs
  }

  /**
   * Register a new CV in the registry
   * @param {Object} cv - The CV to register
   * @returns {Object} - The registered CV
   * @throws {Error} - If CV is invalid or duplicate ID
   */
  registerCV(cv) {
    // Validate CV structure
    const validation = validateCV(cv);
    if (!validation.valid) {
      throw new Error(`CV validation failed: ${validation.errors.join(', ')}`);
    }

    // Check for duplicate ID
    if (this.cvs.has(cv.id)) {
      throw new Error(`CV with ID '${cv.id}' already exists. Use updateCV to modify.`);
    }

    // Store CV
    this.cvs.set(cv.id, { ...cv, registeredAt: Date.now() });

    // Index by capabilities
    this._indexCV(cv);

    return cv;
  }

  /**
   * Update an existing CV
   * @param {string} id - CV ID
   * @param {Object} updates - Updates to apply
   * @returns {Object} - The updated CV
   */
  updateCV(id, updates) {
    const existing = this.cvs.get(id);
    if (!existing) {
      throw new Error(`CV with ID '${id}' not found`);
    }

    // Remove old indices
    this._unindexCV(existing);

    // Apply updates
    const updated = this._deepMerge(existing, updates);
    updated.updatedAt = Date.now();

    // Re-validate
    const validation = validateCV(updated);
    if (!validation.valid) {
      // Restore old indices on validation failure
      this._indexCV(existing);
      throw new Error(`CV update validation failed: ${validation.errors.join(', ')}`);
    }

    // Store updated CV
    this.cvs.set(id, updated);
    this._indexCV(updated);

    return updated;
  }

  /**
   * Find CVs matching given criteria
   * @param {Object} criteria - Search criteria
   * @param {string[]} [criteria.capabilities] - Required capabilities
   * @param {string[]} [criteria.domains] - Required domains
   * @param {string[]} [criteria.tools] - Required tools
   * @param {string[]} [criteria.languages] - Programming languages
   * @param {Object} [criteria.performance] - Performance requirements
   * @param {string} [criteria.status] - Lifecycle status
   * @param {Object} [criteria.resources] - Resource requirements
   * @returns {Object[]} - Matching CVs sorted by relevance
   */
  findCVs(criteria = {}) {
    let candidates = new Set();
    let isFirstFilter = true;

    // Filter by capabilities
    if (criteria.capabilities?.length > 0) {
      const capabilityMatches = this._findByCapabilities(criteria.capabilities);
      candidates = this._applyFilter(candidates, capabilityMatches, isFirstFilter);
      isFirstFilter = false;
    }

    // Filter by domains
    if (criteria.domains?.length > 0) {
      const domainMatches = this._findByDomains(criteria.domains);
      candidates = this._applyFilter(candidates, domainMatches, isFirstFilter);
      isFirstFilter = false;
    }

    // Filter by tools
    if (criteria.tools?.length > 0) {
      const toolMatches = this._findByTools(criteria.tools);
      candidates = this._applyFilter(candidates, toolMatches, isFirstFilter);
      isFirstFilter = false;
    }

    // Filter by languages
    if (criteria.languages?.length > 0) {
      const languageMatches = this._findByLanguages(criteria.languages);
      candidates = this._applyFilter(candidates, languageMatches, isFirstFilter);
      isFirstFilter = false;
    }

    // If no specific filters, start with all CVs
    if (isFirstFilter) {
      candidates = new Set(this.cvs.keys());
    }

    // Get full CV objects
    let results = Array.from(candidates).map(id => this.cvs.get(id));

    // Filter by performance metrics
    if (criteria.performance) {
      results = this._filterByPerformance(results, criteria.performance);
    }

    // Filter by status
    if (criteria.status) {
      results = results.filter(cv => cv.lifecycle?.status === criteria.status);
    }

    // Filter by resource requirements
    if (criteria.resources) {
      results = this._filterByResources(results, criteria.resources);
    }

    // Sort by relevance score
    results = this._sortByRelevance(results, criteria);

    return results;
  }

  /**
   * Retrieve a CV by ID
   * @param {string} id - CV ID
   * @returns {Object|null} - The CV or null if not found
   */
  getCV(id) {
    return this.cvs.get(id) || null;
  }

  /**
   * Update agent performance statistics
   * @param {string} id - CV ID
   * @param {Object} metrics - Performance metrics to update
   * @param {number} [metrics.successRate] - Success rate (0-1)
   * @param {number} [metrics.avgLatency] - Average latency in ms
   * @param {number} [metrics.qualityScore] - Quality score (0-100)
   * @param {number} [metrics.tasksCompleted] - Total tasks completed
   * @param {number} [metrics.tasksSucceeded] - Successful tasks
   * @param {number} [metrics.tasksFailed] - Failed tasks
   * @returns {Object} - Updated performance metrics
   */
  updatePerformance(id, metrics) {
    const cv = this.cvs.get(id);
    if (!cv) {
      throw new Error(`CV with ID '${id}' not found`);
    }

    const current = cv.performance || {};
    
    // Update metrics
    const updated = {
      ...current,
      ...metrics,
      lastUpdated: Date.now()
    };

    // Recalculate success rate if task counts provided
    if (metrics.tasksSucceeded !== undefined || metrics.tasksFailed !== undefined) {
      const succeeded = metrics.tasksSucceeded ?? current.tasksSucceeded ?? 0;
      const failed = metrics.tasksFailed ?? current.tasksFailed ?? 0;
      const total = succeeded + failed;
      if (total > 0) {
        updated.successRate = succeeded / total;
        updated.tasksCompleted = total;
      }
    }

    cv.performance = updated;
    cv.updatedAt = Date.now();

    return updated;
  }

  /**
   * List all CVs with optional filtering
   * @param {Object} filters - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.specialization] - Filter by specialization
   * @param {string[]} [filters.capabilities] - Filter by capabilities
   * @param {Object} [filters.pagination] - Pagination options
   * @param {number} [filters.pagination.offset=0] - Offset
   * @param {number} [filters.pagination.limit=50] - Limit
   * @returns {Object} - CVs and pagination info
   */
  listCVs(filters = {}) {
    let results = Array.from(this.cvs.values());

    // Apply filters
    if (filters.status) {
      results = results.filter(cv => cv.lifecycle?.status === filters.status);
    }

    if (filters.specialization) {
      results = results.filter(cv => 
        cv.specialization?.primary === filters.specialization ||
        cv.specialization?.secondary?.includes(filters.specialization)
      );
    }

    if (filters.capabilities?.length > 0) {
      results = results.filter(cv =>
        filters.capabilities.every(cap => 
          cv.capabilities?.tools?.includes(cap) ||
          cv.capabilities?.languages?.includes(cap) ||
          cv.capabilities?.domains?.includes(cap)
        )
      );
    }

    // Sort by name
    results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Pagination
    const offset = filters.pagination?.offset ?? 0;
    const limit = filters.pagination?.limit ?? 50;
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      cvs: paginatedResults,
      total: results.length,
      offset,
      limit,
      hasMore: offset + limit < results.length
    };
  }

  /**
   * Register a CV template
   * @param {string} name - Template name
   * @param {Object} template - Template definition
   */
  registerTemplate(name, template) {
    this.templates.set(name, template);
  }

  /**
   * Get a CV template
   * @param {string} name - Template name
   * @returns {Object|null} - Template or null
   */
  getTemplate(name) {
    return this.templates.get(name) || null;
  }

  /**
   * Remove a CV from the registry
   * @param {string} id - CV ID
   * @returns {boolean} - True if removed
   */
  unregisterCV(id) {
    const cv = this.cvs.get(id);
    if (!cv) return false;

    this._unindexCV(cv);
    this.cvs.delete(id);
    return true;
  }

  /**
   * Get registry statistics
   * @returns {Object} - Statistics
   */
  getStats() {
    const cvs = Array.from(this.cvs.values());
    return {
      totalCVs: cvs.length,
      byStatus: this._countByStatus(cvs),
      byDomain: this._countByIndex(this.domainIndex),
      byTool: this._countByIndex(this.toolIndex),
      byLanguage: this._countByIndex(this.capabilityIndex),
      templates: Array.from(this.templates.keys())
    };
  }

  // Private helper methods

  _indexCV(cv) {
    // Index capabilities
    cv.capabilities?.languages?.forEach(lang => {
      if (!this.capabilityIndex.has(lang)) {
        this.capabilityIndex.set(lang, new Set());
      }
      this.capabilityIndex.get(lang).add(cv.id);
    });

    // Index domains
    cv.capabilities?.domains?.forEach(domain => {
      if (!this.domainIndex.has(domain)) {
        this.domainIndex.set(domain, new Set());
      }
      this.domainIndex.get(domain).add(cv.id);
    });

    // Index tools
    cv.capabilities?.tools?.forEach(tool => {
      if (!this.toolIndex.has(tool)) {
        this.toolIndex.set(tool, new Set());
      }
      this.toolIndex.get(tool).add(cv.id);
    });

    // Index status
    const status = cv.lifecycle?.status || 'unknown';
    if (!this.statusIndex.has(status)) {
      this.statusIndex.set(status, new Set());
    }
    this.statusIndex.get(status).add(cv.id);
  }

  _unindexCV(cv) {
    // Remove from all indices
    this.capabilityIndex.forEach(set => set.delete(cv.id));
    this.domainIndex.forEach(set => set.delete(cv.id));
    this.toolIndex.forEach(set => set.delete(cv.id));
    this.statusIndex.forEach(set => set.delete(cv.id));
  }

  _findByCapabilities(capabilities) {
    const results = new Set();
    capabilities.forEach(cap => {
      const matches = this.capabilityIndex.get(cap);
      if (matches) {
        matches.forEach(id => results.add(id));
      }
    });
    return results;
  }

  _findByDomains(domains) {
    const results = new Set();
    domains.forEach(domain => {
      const matches = this.domainIndex.get(domain);
      if (matches) {
        matches.forEach(id => results.add(id));
      }
    });
    return results;
  }

  _findByTools(tools) {
    const results = new Set();
    tools.forEach(tool => {
      const matches = this.toolIndex.get(tool);
      if (matches) {
        matches.forEach(id => results.add(id));
      }
    });
    return results;
  }

  _findByLanguages(languages) {
    return this._findByCapabilities(languages);
  }

  _applyFilter(current, newSet, isFirst) {
    if (isFirst) return newSet;
    
    // Intersection
    const intersection = new Set();
    current.forEach(id => {
      if (newSet.has(id)) intersection.add(id);
    });
    return intersection;
  }

  _filterByPerformance(cvs, requirements) {
    return cvs.filter(cv => {
      const perf = cv.performance || {};
      
      if (requirements.minSuccessRate !== undefined) {
        if ((perf.successRate ?? 0) < requirements.minSuccessRate) return false;
      }
      
      if (requirements.maxLatency !== undefined) {
        if ((perf.avgLatency ?? Infinity) > requirements.maxLatency) return false;
      }
      
      if (requirements.minQualityScore !== undefined) {
        if ((perf.qualityScore ?? 0) < requirements.minQualityScore) return false;
      }
      
      if (requirements.minTasksCompleted !== undefined) {
        if ((perf.tasksCompleted ?? 0) < requirements.minTasksCompleted) return false;
      }
      
      return true;
    });
  }

  _filterByResources(cvs, requirements) {
    return cvs.filter(cv => {
      const resources = cv.resources || {};
      
      if (requirements.minMemory !== undefined) {
        if ((resources.maxMemory ?? 0) < requirements.minMemory) return false;
      }
      
      if (requirements.maxMemory !== undefined) {
        if ((resources.minMemory ?? Infinity) > requirements.maxMemory) return false;
      }
      
      if (requirements.priority !== undefined) {
        if (resources.priority !== requirements.priority) return false;
      }
      
      return true;
    });
  }

  _sortByRelevance(cvs, criteria) {
    return cvs.sort((a, b) => {
      const scoreA = this._calculateRelevance(a, criteria);
      const scoreB = this._calculateRelevance(b, criteria);
      return scoreB - scoreA; // Higher score first
    });
  }

  _calculateRelevance(cv, criteria) {
    let score = 0;
    
    // Performance score (0-40 points)
    const perf = cv.performance || {};
    score += (perf.successRate ?? 0.5) * 20;
    score += ((perf.qualityScore ?? 50) / 100) * 20;
    
    // Capability match score (0-30 points)
    if (criteria.capabilities) {
      const caps = cv.capabilities || {};
      const allCaps = [
        ...(caps.languages || []),
        ...(caps.domains || []),
        ...(caps.tools || [])
      ];
      const matches = criteria.capabilities.filter(c => allCaps.includes(c)).length;
      score += (matches / criteria.capabilities.length) * 30;
    }
    
    // Experience score (0-20 points)
    const tasks = perf.tasksCompleted ?? 0;
    score += Math.min(tasks / 100, 1) * 20;
    
    // Availability bonus (0-10 points)
    if (cv.lifecycle?.status === 'active') score += 10;
    else if (cv.lifecycle?.status === 'idle') score += 5;
    
    return score;
  }

  _countByStatus(cvs) {
    const counts = {};
    cvs.forEach(cv => {
      const status = cv.lifecycle?.status || 'unknown';
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }

  _countByIndex(index) {
    const counts = {};
    index.forEach((set, key) => {
      counts[key] = set.size;
    });
    return counts;
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
}

// Export CV Schema for external use
export { CVSchema };

// Default export
export default CVRegistry;
