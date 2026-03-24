/**
 * CV Registry
 * Central storage and management for Agent CVs with indexing and versioning
 */

import { validateCV, validatePartialCV, mergeCVs } from './schema.js';
import { EventEmitter } from 'events';

/**
 * CV Registry for managing agent CVs
 */
export class CVRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableVersioning: true,
      maxVersions: 10,
      enableCache: true,
      cacheTTL: 300000, // 5 minutes
      storagePath: './data/cv_registry.db',
      ...options
    };
    
    // Primary storage
    this.cvs = new Map(); // id -> CV
    this.versions = new Map(); // id -> Array of versioned CVs
    this.templates = new Map(); // name -> template
    
    // Indexes
    this.indexes = {
      capability: new Map(), // capability -> Set of CV IDs
      domain: new Map(), // domain -> Set of CV IDs
      tool: new Map(), // tool -> Set of CV IDs
      language: new Map(), // language -> Set of CV IDs
      status: new Map(), // status -> Set of CV IDs
      rights: new Map(), // right -> Set of CV IDs
      tag: new Map(), // tag -> Set of CV IDs
      category: new Map() // category -> Set of CV IDs
    };
    
    // Cache for hot data
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    
    // Stats
    this.stats = {
      totalCreated: 0,
      totalUpdated: 0,
      totalDeleted: 0,
      totalSearches: 0
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a new CV
   * @param {Object} cv - CV data
   * @param {Object} options - Creation options
   * @returns {Object} - Created CV
   */
  create(cv, options = {}) {
    const { skipValidation = false, autoActivate = false } = options;
    
    // Validate
    if (!skipValidation) {
      const validation = validateCV(cv);
      if (!validation.valid) {
        const error = new Error(`CV validation failed: ${validation.errors.join(', ')}`);
        error.code = 'VALIDATION_ERROR';
        error.errors = validation.errors;
        throw error;
      }
      cv = validation.data;
    }
    
    const id = cv.identity.id;
    
    // Check for duplicate
    if (this.cvs.has(id)) {
      const error = new Error(`CV with ID '${id}' already exists`);
      error.code = 'DUPLICATE_ID';
      throw error;
    }
    
    // Set timestamps
    const now = Date.now();
    cv.lifecycle = {
      ...cv.lifecycle,
      created_at: now,
      updated_at: now
    };
    
    if (autoActivate) {
      cv.lifecycle.status = 'active';
    }
    
    // Store
    this.cvs.set(id, cv);
    
    // Initialize version history
    if (this.options.enableVersioning) {
      this.versions.set(id, [{
        version: cv.identity.version,
        timestamp: now,
        cv: JSON.parse(JSON.stringify(cv)),
        changeType: 'create'
      }]);
    }
    
    // Index
    this._indexCV(id, cv);
    
    // Update stats
    this.stats.totalCreated++;
    
    // Emit event
    this.emit('cv:created', { id, cv });
    
    return cv;
  }

  /**
   * Retrieve a CV by ID
   * @param {string} id - CV ID
   * @param {Object} options - Retrieval options
   * @returns {Object|null} - CV or null
   */
  get(id, options = {}) {
    const { fromCache = true, version = null } = options;
    
    // Check cache
    if (fromCache && this.options.enableCache && !version) {
      const cached = this._getFromCache(id);
      if (cached) return cached;
    }
    
    // Get specific version
    if (version) {
      const versions = this.versions.get(id);
      if (versions) {
        const versioned = versions.find(v => v.version === version);
        return versioned ? versioned.cv : null;
      }
      return null;
    }
    
    // Get current
    const cv = this.cvs.get(id) || null;
    
    // Cache
    if (cv && this.options.enableCache) {
      this._setCache(id, cv);
    }
    
    return cv;
  }

  /**
   * Update an existing CV
   * @param {string} id - CV ID
   * @param {Object} updates - Updates to apply
   * @param {Object} options - Update options
   * @returns {Object} - Updated CV
   */
  update(id, updates, options = {}) {
    const { skipValidation = false, createVersion = true, changeType = 'update' } = options;
    
    const existing = this.cvs.get(id);
    if (!existing) {
      const error = new Error(`CV with ID '${id}' not found`);
      error.code = 'NOT_FOUND';
      throw error;
    }
    
    // Remove old indexes
    this._unindexCV(id, existing);
    
    // Merge updates
    const merged = mergeCVs(existing, updates);
    
    // Update timestamp
    merged.lifecycle = {
      ...merged.lifecycle,
      updated_at: Date.now()
    };
    
    // Validate
    if (!skipValidation) {
      const validation = validateCV(merged);
      if (!validation.valid) {
        // Restore indexes
        this._indexCV(id, existing);
        const error = new Error(`CV update validation failed: ${validation.errors.join(', ')}`);
        error.code = 'VALIDATION_ERROR';
        error.errors = validation.errors;
        throw error;
      }
      merged.identity = validation.data.identity;
      merged.capabilities = validation.data.capabilities;
    }
    
    // Version history
    if (createVersion && this.options.enableVersioning) {
      this._addVersion(id, merged, changeType);
    }
    
    // Store
    this.cvs.set(id, merged);
    
    // Re-index
    this._indexCV(id, merged);
    
    // Clear cache
    this._clearCache(id);
    
    // Update stats
    this.stats.totalUpdated++;
    
    // Emit event
    this.emit('cv:updated', { id, cv: merged, previous: existing });
    
    return merged;
  }

  /**
   * Delete a CV
   * @param {string} id - CV ID
   * @param {Object} options - Delete options
   * @returns {boolean} - True if deleted
   */
  delete(id, options = {}) {
    const { permanent = false } = options;
    
    const cv = this.cvs.get(id);
    if (!cv) {
      return false;
    }
    
    // Unindex
    this._unindexCV(id, cv);
    
    // Remove from storage
    this.cvs.delete(id);
    
    // Handle version history
    if (permanent) {
      this.versions.delete(id);
    } else {
      // Soft delete - mark as deprecated
      cv.lifecycle.status = 'deprecated';
      if (this.options.enableVersioning) {
        this._addVersion(id, cv, 'delete');
      }
    }
    
    // Clear cache
    this._clearCache(id);
    
    // Update stats
    this.stats.totalDeleted++;
    
    // Emit event
    this.emit('cv:deleted', { id, cv, permanent });
    
    return true;
  }

  /**
   * Check if a CV exists
   * @param {string} id - CV ID
   * @returns {boolean}
   */
  has(id) {
    return this.cvs.has(id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LISTING AND SEARCH
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * List all CVs with filtering
   * @param {Object} filters - Filter options
   * @returns {Object} - CVs and pagination info
   */
  list(filters = {}) {
    const {
      status,
      category,
      domain,
      tags = [],
      search,
      sortBy = 'name',
      sortOrder = 'asc',
      offset = 0,
      limit = 50
    } = filters;
    
    let results = Array.from(this.cvs.values());
    
    // Apply filters
    if (status) {
      results = results.filter(cv => cv.lifecycle?.status === status);
    }
    
    if (category) {
      results = results.filter(cv => cv.metadata?.category === category);
    }
    
    if (domain) {
      results = results.filter(cv => 
        cv.capabilities?.domains?.includes(domain) ||
        cv.metadata?.domain === domain
      );
    }
    
    if (tags.length > 0) {
      results = results.filter(cv =>
        tags.some(tag => cv.metadata?.tags?.includes(tag))
      );
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      results = results.filter(cv =>
        cv.identity?.name?.toLowerCase().includes(searchLower) ||
        cv.identity?.description?.toLowerCase().includes(searchLower) ||
        cv.identity?.id?.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort
    results.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'name':
          aVal = a.identity?.name || '';
          bVal = b.identity?.name || '';
          break;
        case 'created':
          aVal = a.lifecycle?.created_at || 0;
          bVal = b.lifecycle?.created_at || 0;
          break;
        case 'updated':
          aVal = a.lifecycle?.updated_at || 0;
          bVal = b.lifecycle?.updated_at || 0;
          break;
        case 'status':
          aVal = a.lifecycle?.status || '';
          bVal = b.lifecycle?.status || '';
          break;
        default:
          aVal = a.identity?.id || '';
          bVal = b.identity?.id || '';
      }
      
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'desc' ? -comparison : comparison;
    });
    
    const total = results.length;
    const paginated = results.slice(offset, offset + limit);
    
    return {
      cvs: paginated,
      pagination: {
        total,
        offset,
        limit,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * Search CVs by capabilities
   * @param {Object} criteria - Search criteria
   * @returns {Array} - Matching CVs
   */
  search(criteria = {}) {
    this.stats.totalSearches++;
    
    const {
      capabilities = [],
      domains = [],
      tools = [],
      languages = [],
      rights = [],
      status,
      minQualityScore,
      matchMode = 'any' // 'any', 'all', 'exact'
    } = criteria;
    
    let candidates = new Set();
    let isFirst = true;
    
    // Search by capabilities
    if (capabilities.length > 0) {
      const matches = this._searchByCapabilities(capabilities, matchMode);
      candidates = this._applyFilter(candidates, matches, isFirst, matchMode);
      isFirst = false;
    }
    
    // Search by domains
    if (domains.length > 0) {
      const matches = this._searchByDomains(domains, matchMode);
      candidates = this._applyFilter(candidates, matches, isFirst, matchMode);
      isFirst = false;
    }
    
    // Search by tools
    if (tools.length > 0) {
      const matches = this._searchByTools(tools, matchMode);
      candidates = this._applyFilter(candidates, matches, isFirst, matchMode);
      isFirst = false;
    }
    
    // Search by languages
    if (languages.length > 0) {
      const matches = this._searchByLanguages(languages, matchMode);
      candidates = this._applyFilter(candidates, matches, isFirst, matchMode);
      isFirst = false;
    }
    
    // If no filters, start with all
    if (isFirst) {
      candidates = new Set(this.cvs.keys());
    }
    
    // Get full objects
    let results = Array.from(candidates)
      .map(id => this.cvs.get(id))
      .filter(Boolean);
    
    // Filter by status
    if (status) {
      results = results.filter(cv => cv.lifecycle?.status === status);
    }
    
    // Filter by quality score
    if (minQualityScore !== undefined) {
      results = results.filter(cv =>
        (cv.performance?.quality_score || 0) >= minQualityScore
      );
    }
    
    // Sort by relevance
    results = this._sortByRelevance(results, criteria);
    
    return results;
  }

  /**
   * Find CVs matching task requirements
   * @param {Object} requirements - Task requirements
   * @returns {Array} - Matching CVs with scores
   */
  match(requirements) {
    const {
      requiredCapabilities = [],
      requiredDomains = [],
      requiredTools = [],
      preferredLanguages = [],
      minSuccessRate = 0,
      maxLatency = Infinity,
      resources = {}
    } = requirements;
    
    let matches = this.search({
      capabilities: requiredCapabilities,
      domains: requiredDomains,
      tools: requiredTools,
      languages: preferredLanguages,
      status: 'active'
    });
    
    // Calculate match scores
    matches = matches.map(cv => {
      let score = 0;
      const reasons = [];
      
      // Capability match (0-40 points)
      const caps = cv.capabilities || {};
      const allCaps = [
        ...(caps.languages || []),
        ...(caps.domains || []),
        ...(caps.tools || [])
      ];
      const requiredItems = [...requiredCapabilities, ...requiredDomains, ...requiredTools];
      if (requiredItems.length > 0) {
        const matched = requiredItems.filter(c => allCaps.includes(c)).length;
        score += (matched / requiredItems.length) * 40;
        reasons.push(`${matched}/${requiredItems.length} capabilities matched`);
      } else {
        score += 20; // No specific requirements
      }
      
      // Performance score (0-30 points)
      const perf = cv.performance || {};
      if (minSuccessRate > 0) {
        if ((perf.success_rate || 0) >= minSuccessRate) {
          score += 15;
          reasons.push('Meets success rate requirement');
        }
      }
      if (maxLatency < Infinity) {
        if ((perf.avg_latency || Infinity) <= maxLatency) {
          score += 15;
          reasons.push('Meets latency requirement');
        }
      }
      score += (perf.success_rate || 0.5) * 15;
      
      // Resource compatibility (0-20 points)
      const res = cv.resources || {};
      if (resources.minMemory && (res.max_memory || 0) >= resources.minMemory) {
        score += 10;
        reasons.push('Meets memory requirements');
      }
      if (resources.priority && res.priority === resources.priority) {
        score += 10;
        reasons.push('Priority match');
      }
      
      // Experience bonus (0-10 points)
      const tasks = perf.tasks_completed || 0;
      score += Math.min(tasks / 100, 1) * 10;
      
      return {
        cv,
        score: Math.round(score * 100) / 100,
        reasons
      };
    });
    
    // Sort by score
    matches.sort((a, b) => b.score - a.score);
    
    return matches;
  }

  /**
   * Find CVs by rights
   * @param {string} right - Right to check for
   * @returns {Array} - CVs with the right
   */
  findByRight(right) {
    const ids = this.indexes.rights.get(right);
    if (!ids) return [];
    
    return Array.from(ids)
      .map(id => this.cvs.get(id))
      .filter(Boolean);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VERSIONING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get version history for a CV
   * @param {string} id - CV ID
   * @returns {Array} - Version history
   */
  getVersions(id) {
    return this.versions.get(id) || [];
  }

  /**
   * Rollback to a specific version
   * @param {string} id - CV ID
   * @param {string} version - Version to rollback to
   * @returns {Object} - Rolled back CV
   */
  rollback(id, version) {
    const versions = this.versions.get(id);
    if (!versions) {
      throw new Error(`No version history for CV '${id}'`);
    }
    
    const target = versions.find(v => v.version === version);
    if (!target) {
      throw new Error(`Version '${version}' not found for CV '${id}'`);
    }
    
    // Create new version based on rollback target
    const current = this.cvs.get(id);
    const rolledBack = {
      ...JSON.parse(JSON.stringify(target.cv)),
      lifecycle: {
        ...target.cv.lifecycle,
        updated_at: Date.now()
      }
    };
    
    // Increment version
    const [major, minor, patch] = current.identity.version.split('.').map(Number);
    rolledBack.identity.version = `${major}.${minor}.${patch + 1}`;
    
    // Update
    return this.update(id, rolledBack, { changeType: 'rollback' });
  }

  /**
   * Diff two versions
   * @param {string} id - CV ID
   * @param {string} v1 - First version
   * @param {string} v2 - Second version
   * @returns {Object} - Differences
   */
  diffVersions(id, v1, v2) {
    const cv1 = this.get(id, { version: v1 });
    const cv2 = this.get(id, { version: v2 });
    
    if (!cv1) throw new Error(`Version '${v1}' not found`);
    if (!cv2) throw new Error(`Version '${v2}' not found`);
    
    return this._diff(cv1, cv2);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEMPLATES
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Register a template
   * @param {string} name - Template name
   * @param {Object} template - Template definition
   */
  registerTemplate(name, template) {
    this.templates.set(name, template);
    this.emit('template:registered', { name, template });
  }

  /**
   * Get a template
   * @param {string} name - Template name
   * @returns {Object|null}
   */
  getTemplate(name) {
    return this.templates.get(name) || null;
  }

  /**
   * List all templates
   * @returns {Array}
   */
  listTemplates() {
    return Array.from(this.templates.entries()).map(([name, template]) => ({
      name,
      description: template.identity?.description || '',
      category: template.metadata?.category || 'general'
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STATS AND INFO
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get registry statistics
   * @returns {Object}
   */
  getStats() {
    const cvs = Array.from(this.cvs.values());
    
    return {
      total: cvs.length,
      byStatus: this._countByIndex(this.indexes.status),
      byCategory: this._countByIndex(this.indexes.category),
      byDomain: this._countByIndex(this.indexes.domain),
      totalTemplates: this.templates.size,
      totalVersions: Array.from(this.versions.values())
        .reduce((sum, v) => sum + v.length, 0),
      operations: { ...this.stats }
    };
  }

  /**
   * Get index information
   * @returns {Object}
   */
  getIndexInfo() {
    const info = {};
    for (const [name, index] of Object.entries(this.indexes)) {
      info[name] = {
        entries: index.size,
        keys: Array.from(index.keys())
      };
    }
    return info;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  _indexCV(id, cv) {
    // Index capabilities
    cv.capabilities?.languages?.forEach(lang => {
      this._addToIndex('language', lang, id);
    });
    
    cv.capabilities?.domains?.forEach(domain => {
      this._addToIndex('domain', domain, id);
    });
    
    cv.capabilities?.tools?.forEach(tool => {
      this._addToIndex('tool', tool, id);
    });
    
    // Index status
    if (cv.lifecycle?.status) {
      this._addToIndex('status', cv.lifecycle.status, id);
    }
    
    // Index category
    if (cv.metadata?.category) {
      this._addToIndex('category', cv.metadata.category, id);
    }
    
    // Index tags
    cv.metadata?.tags?.forEach(tag => {
      this._addToIndex('tag', tag, id);
    });
    
    // Index rights
    if (cv.rights?.admin) {
      Object.entries(cv.rights.admin).forEach(([right, allowed]) => {
        if (allowed) {
          this._addToIndex('rights', right, id);
        }
      });
    }
  }

  _unindexCV(id, cv) {
    // Remove from all indexes
    Object.values(this.indexes).forEach(index => {
      index.forEach((ids, key) => {
        ids.delete(id);
        if (ids.size === 0) {
          index.delete(key);
        }
      });
    });
  }

  _addToIndex(indexName, key, id) {
    const index = this.indexes[indexName];
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    index.get(key).add(id);
  }

  _addVersion(id, cv, changeType) {
    if (!this.versions.has(id)) {
      this.versions.set(id, []);
    }
    
    const history = this.versions.get(id);
    history.unshift({
      version: cv.identity.version,
      timestamp: Date.now(),
      cv: JSON.parse(JSON.stringify(cv)),
      changeType
    });
    
    // Trim history
    while (history.length > this.options.maxVersions) {
      history.pop();
    }
  }

  _getFromCache(id) {
    const cached = this.cache.get(id);
    if (!cached) return null;
    
    const timestamp = this.cacheTimestamps.get(id);
    if (Date.now() - timestamp > this.options.cacheTTL) {
      this._clearCache(id);
      return null;
    }
    
    return cached;
  }

  _setCache(id, cv) {
    this.cache.set(id, JSON.parse(JSON.stringify(cv)));
    this.cacheTimestamps.set(id, Date.now());
  }

  _clearCache(id) {
    this.cache.delete(id);
    this.cacheTimestamps.delete(id);
  }

  _searchByCapabilities(caps, matchMode) {
    return this._searchIndex('capability', caps, matchMode);
  }

  _searchByDomains(domains, matchMode) {
    return this._searchIndex('domain', domains, matchMode);
  }

  _searchByTools(tools, matchMode) {
    return this._searchIndex('tool', tools, matchMode);
  }

  _searchByLanguages(langs, matchMode) {
    return this._searchIndex('language', langs, matchMode);
  }

  _searchIndex(indexName, keys, matchMode) {
    const index = this.indexes[indexName];
    const results = new Set();
    
    if (matchMode === 'any') {
      keys.forEach(key => {
        const ids = index.get(key);
        if (ids) {
          ids.forEach(id => results.add(id));
        }
      });
    } else if (matchMode === 'all') {
      let first = true;
      keys.forEach(key => {
        const ids = index.get(key);
        if (ids) {
          if (first) {
            ids.forEach(id => results.add(id));
            first = false;
          } else {
            for (const id of results) {
              if (!ids.has(id)) {
                results.delete(id);
              }
            }
          }
        }
      });
    }
    
    return results;
  }

  _applyFilter(current, newSet, isFirst, matchMode) {
    if (isFirst) return newSet;
    
    const result = new Set();
    
    if (matchMode === 'any') {
      // Union
      current.forEach(id => result.add(id));
      newSet.forEach(id => result.add(id));
    } else {
      // Intersection
      current.forEach(id => {
        if (newSet.has(id)) result.add(id);
      });
    }
    
    return result;
  }

  _sortByRelevance(cvs, criteria) {
    return cvs.sort((a, b) => {
      const scoreA = this._calculateRelevance(a, criteria);
      const scoreB = this._calculateRelevance(b, criteria);
      return scoreB - scoreA;
    });
  }

  _calculateRelevance(cv, criteria) {
    let score = 0;
    const perf = cv.performance || {};
    
    // Base performance score
    score += (perf.success_rate || 0.5) * 20;
    score += ((perf.quality_score || 50) / 100) * 20;
    
    // Capability matches
    if (criteria.capabilities) {
      const caps = cv.capabilities || {};
      const matches = criteria.capabilities.filter(c =>
        caps.languages?.includes(c) ||
        caps.domains?.includes(c) ||
        caps.tools?.includes(c)
      ).length;
      score += (matches / criteria.capabilities.length) * 30;
    }
    
    // Experience
    const tasks = perf.tasks_completed || 0;
    score += Math.min(tasks / 100, 1) * 20;
    
    // Status bonus
    if (cv.lifecycle?.status === 'active') score += 10;
    
    return score;
  }

  _diff(obj1, obj2) {
    const added = {};
    const removed = {};
    const changed = {};
    
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
    
    for (const key of allKeys) {
      if (!(key in obj1)) {
        added[key] = obj2[key];
      } else if (!(key in obj2)) {
        removed[key] = obj1[key];
      } else if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
        if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object' &&
            !Array.isArray(obj1[key]) && !Array.isArray(obj2[key])) {
          const nested = this._diff(obj1[key], obj2[key]);
          if (Object.keys(nested.added).length || 
              Object.keys(nested.removed).length || 
              Object.keys(nested.changed).length) {
            changed[key] = nested;
          }
        } else {
          changed[key] = { from: obj1[key], to: obj2[key] };
        }
      }
    }
    
    return { added, removed, changed };
  }

  _countByIndex(index) {
    const counts = {};
    index.forEach((ids, key) => {
      counts[key] = ids.size;
    });
    return counts;
  }
}

export default CVRegistry;
