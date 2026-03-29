/**
 * @fileoverview Skill Service - Skill management and CRUD operations
 * @module domains/skills/skill-service
 *
 * Manages skills including CRUD operations, validation, versioning,
 * and assignment to agents/companies.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, basename, dirname } from 'path';
import { homedir } from 'os';

/**
 * @typedef {Object} Skill
 * @property {string} id - Skill UUID
 * @property {string} name - Unique skill name (kebab-case)
 * @property {string} displayName - Human-readable name
 * @property {string} description - Skill description
 * @property {string} content - Full SKILL.md content
 * @property {string} version - Semantic version
 * @property {string} status - Skill status (active, deprecated, draft, archived)
 * @property {string} [companyId] - Company UUID (null for global skills)
 * @property {string[]} [tags] - Skill tags
 * @property {string[]} [categories] - Skill categories
 * @property {Object} [metadata] - Additional metadata
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string} [createdBy] - Creator user/agent ID
 */

/**
 * @typedef {Object} SkillVersion
 * @property {string} id - Version UUID
 * @property {string} skillId - Parent skill ID
 * @property {string} version - Semantic version
 * @property {string} content - Skill content at this version
 * @property {string} changeNotes - What changed in this version
 * @property {string} createdAt - ISO timestamp
 * @property {string} createdBy - Who created this version
 */

/**
 * @typedef {Object} SkillAssignment
 * @property {string} id - Assignment UUID
 * @property {string} skillId - Skill ID
 * @property {string} assigneeType - 'agent' | 'company'
 * @property {string} assigneeId - Agent ID or Company ID
 * @property {string} [scope] - Assignment scope (global, project, task)
 * @property {Object} [config] - Skill configuration overrides
 * @property {string} assignedAt - ISO timestamp
 * @property {string} [assignedBy] - Who assigned the skill
 * @property {string} [expiresAt] - Optional expiration
 */

// Validation constants
const VALID_SKILL_STATUSES = ['active', 'deprecated', 'draft', 'archived'];
const VALID_ASSIGNEE_TYPES = ['agent', 'company'];
const SKILL_NAME_REGEX = /^[a-z][a-z0-9-]*[a-z0-9]$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

/**
 * Generates a UUID
 * @returns {string} UUID string
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `cm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets current ISO timestamp
 * @returns {string} ISO timestamp
 */
function now() {
  return new Date().toISOString();
}

/**
 * Validates skill name format
 * @param {string} name - Skill name to validate
 * @returns {boolean} True if valid
 */
function isValidSkillName(name) {
  return SKILL_NAME_REGEX.test(name);
}

/**
 * Validates semantic version format
 * @param {string} version - Version to validate
 * @returns {boolean} True if valid
 */
function isValidVersion(version) {
  return VERSION_REGEX.test(version);
}

/**
 * Parses SKILL.md frontmatter and content
 * @param {string} content - Raw SKILL.md content
 * @returns {Object} Parsed { frontmatter, body }
 */
function parseSkillMarkdown(content) {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    return {
      frontmatter: {},
      body: content
    };
  }

  const frontmatterText = frontmatterMatch[1];
  const body = frontmatterMatch[2].trim();

  // Parse YAML-like frontmatter
  const frontmatter = {};
  const lines = frontmatterText.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Handle arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      } else {
        frontmatter[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Validates SKILL.md format
 * @param {string} content - Skill content to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
function validateSkillFormat(content) {
  const errors = [];

  if (!content || typeof content !== 'string') {
    return { valid: false, errors: ['Content is required'] };
  }

  // Check for frontmatter
  if (!content.startsWith('---')) {
    errors.push('Missing YAML frontmatter (must start with ---)');
  }

  const { frontmatter, body } = parseSkillMarkdown(content);

  // Required frontmatter fields
  if (!frontmatter.name) {
    errors.push('Missing required frontmatter: name');
  } else if (!isValidSkillName(frontmatter.name)) {
    errors.push(`Invalid skill name "${frontmatter.name}": must be lowercase kebab-case starting with a letter`);
  }

  if (!frontmatter.description) {
    errors.push('Missing required frontmatter: description');
  }

  // Body content checks
  if (!body || body.length < 50) {
    errors.push('Skill body is too short (minimum 50 characters)');
  }

  // Check for common sections
  const hasHeading = body.match(/^#+\s/m);
  if (!hasHeading) {
    errors.push('Missing markdown headings (## Section)');
  }

  return {
    valid: errors.length === 0,
    errors,
    frontmatter,
    body
  };
}

/**
 * Skill Service - Manages skill lifecycle
 */
export class SkillService {
  /** @type {Map<string, Skill>} */
  #skills = new Map();
  
  /** @type {Map<string, SkillVersion[]>} */
  #versions = new Map();
  
  /** @type {Map<string, SkillAssignment[]>} */
  #assignments = new Map();
  
  /** @type {Object|null} Repository instance */
  #repo = null;

  /**
   * @param {Object} [options]
   * @param {Object} [options.repositories] - Repository factory
   */
  constructor(options = {}) {
    this.#skills = new Map();
    this.#versions = new Map();
    this.#assignments = new Map();
    this.#repo = options.repositories?.skills ?? null;
  }

  // ==================== Skill CRUD ====================

  /**
   * Create a new skill
   * @param {Object} data - Skill creation data
   * @param {string} data.name - Unique skill name
   * @param {string} data.content - SKILL.md content
   * @param {string} [data.displayName] - Human-readable name
   * @param {string} [data.companyId] - Company scope (null for global)
   * @param {string} [data.createdBy] - Creator ID
   * @returns {Skill} Created skill
   * @throws {Error} If validation fails or name exists
   */
  createSkill(data) {
    // Validate content format
    const validation = validateSkillFormat(data.content);
    if (!validation.valid) {
      throw new Error(`Invalid SKILL.md format: ${validation.errors.join(', ')}`);
    }

    // Validate name
    const name = data.name?.trim().toLowerCase();
    if (!name) {
      throw new Error('Skill name is required');
    }
    if (!isValidSkillName(name)) {
      throw new Error(`Invalid skill name "${name}": must be lowercase kebab-case starting with a letter`);
    }

    // Check for duplicates
    const existing = this.getSkillByName(name, data.companyId);
    if (existing) {
      throw new Error(`Skill "${name}" already exists${data.companyId ? ` for this company` : ''}`);
    }

    const parsed = parseSkillMarkdown(data.content);
    const skill = {
      id: generateUUID(),
      name,
      displayName: data.displayName || parsed.frontmatter.name || name,
      description: parsed.frontmatter.description || '',
      content: data.content,
      version: '1.0.0',
      status: 'active',
      companyId: data.companyId || null,
      tags: parsed.frontmatter.tags || [],
      categories: parsed.frontmatter.categories || [],
      metadata: {
        ...parsed.frontmatter,
        frontmatter: undefined
      },
      createdAt: now(),
      updatedAt: now(),
      createdBy: data.createdBy || null
    };

    this.#skills.set(skill.id, skill);
    this.#versions.set(skill.id, [{
      id: generateUUID(),
      skillId: skill.id,
      version: '1.0.0',
      content: data.content,
      changeNotes: 'Initial version',
      createdAt: skill.createdAt,
      createdBy: data.createdBy || null
    }]);

    // Persist to repository
    if (this.#repo) {
      this.#repo.create(this.#toSkillRow(skill)).catch(() => {});
    }

    return skill;
  }

  /**
   * Get skill by ID
   * @param {string} id - Skill ID
   * @returns {Skill|undefined} The skill
   */
  getSkill(id) {
    return this.#skills.get(id);
  }

  /**
   * Get skill by name
   * @param {string} name - Skill name
   * @param {string} [companyId] - Company scope
   * @returns {Skill|undefined} The skill
   */
  getSkillByName(name, companyId = null) {
    const normalizedName = name.toLowerCase().trim();
    for (const skill of this.#skills.values()) {
      if (skill.name === normalizedName && skill.companyId === companyId) {
        return skill;
      }
    }
    return undefined;
  }

  /**
   * Update an existing skill
   * @param {string} id - Skill ID
   * @param {Object} data - Update data
   * @param {boolean} [createVersion=true] - Create new version on update
   * @returns {Skill} Updated skill
   * @throws {Error} If skill not found or validation fails
   */
  updateSkill(id, data, createVersion = true) {
    const skill = this.getSkill(id);
    if (!skill) {
      throw new Error(`Skill not found: ${id}`);
    }

    const updates = { ...skill };

    // Update content (with validation)
    if (data.content !== undefined) {
      const validation = validateSkillFormat(data.content);
      if (!validation.valid) {
        throw new Error(`Invalid SKILL.md format: ${validation.errors.join(', ')}`);
      }
      updates.content = data.content;
      updates.description = validation.frontmatter.description || updates.description;
      
      // Update metadata from frontmatter
      updates.tags = validation.frontmatter.tags || updates.tags;
      updates.categories = validation.frontmatter.categories || updates.categories;
    }

    // Update display name
    if (data.displayName !== undefined) {
      updates.displayName = data.displayName;
    }

    // Update status
    if (data.status !== undefined) {
      if (!VALID_SKILL_STATUSES.includes(data.status)) {
        throw new Error(`Invalid status: ${data.status}. Valid: ${VALID_SKILL_STATUSES.join(', ')}`);
      }
      updates.status = data.status;
    }

    // Update tags/categories directly
    if (data.tags !== undefined) updates.tags = data.tags;
    if (data.categories !== undefined) updates.categories = data.categories;

    updates.updatedAt = now();

    // Create new version if content changed
    if (createVersion && data.content && data.content !== skill.content) {
      const newVersion = this.#bumpVersion(skill.version);
      updates.version = newVersion;
      
      const versions = this.#versions.get(id) || [];
      versions.push({
        id: generateUUID(),
        skillId: id,
        version: newVersion,
        content: data.content,
        changeNotes: data.changeNotes || 'Updated skill content',
        createdAt: updates.updatedAt,
        createdBy: data.updatedBy || null
      });
      this.#versions.set(id, versions);
    }

    this.#skills.set(id, updates);

    // Persist
    if (this.#repo) {
      this.#repo.update(id, this.#toSkillRow(updates)).catch(() => {});
    }

    return updates;
  }

  /**
   * Delete a skill (soft delete)
   * @param {string} id - Skill ID
   * @returns {boolean} True if deleted
   */
  deleteSkill(id) {
    const skill = this.getSkill(id);
    if (!skill) {
      return false;
    }

    skill.status = 'archived';
    skill.updatedAt = now();
    this.#skills.set(id, skill);

    // Remove all assignments
    this.#assignments.delete(id);

    if (this.#repo) {
      this.#repo.update(id, this.#toSkillRow(skill)).catch(() => {});
    }

    return true;
  }

  /**
   * Permanently remove a skill
   * @param {string} id - Skill ID
   * @returns {boolean} True if removed
   */
  removeSkill(id) {
    const existed = this.#skills.has(id);
    this.#skills.delete(id);
    this.#versions.delete(id);
    this.#assignments.delete(id);

    if (existed && this.#repo) {
      this.#repo.delete(id).catch(() => {});
    }

    return existed;
  }

  /**
   * List skills with filtering
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.companyId] - Filter by company
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.category] - Filter by category
   * @param {string} [filters.tag] - Filter by tag
   * @returns {Skill[]} Filtered skills
   */
  listSkills(filters = {}) {
    let skills = Array.from(this.#skills.values());

    if (filters.companyId !== undefined) {
      skills = skills.filter(s => s.companyId === filters.companyId);
    }
    if (filters.status) {
      skills = skills.filter(s => s.status === filters.status);
    }
    if (filters.category) {
      skills = skills.filter(s => s.categories?.includes(filters.category));
    }
    if (filters.tag) {
      skills = skills.filter(s => s.tags?.includes(filters.tag));
    }

    return skills.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  // ==================== Version Management ====================

  /**
   * Get versions of a skill
   * @param {string} skillId - Skill ID
   * @returns {SkillVersion[]} Version history
   */
  getVersions(skillId) {
    return this.#versions.get(skillId) || [];
  }

  /**
   * Get specific version
   * @param {string} skillId - Skill ID
   * @param {string} version - Version string
   * @returns {SkillVersion|undefined} The version
   */
  getVersion(skillId, version) {
    const versions = this.#versions.get(skillId) || [];
    return versions.find(v => v.version === version);
  }

  /**
   * Rollback to a specific version
   * @param {string} skillId - Skill ID
   * @param {string} version - Target version
   * @returns {Skill} Updated skill
   */
  rollbackToVersion(skillId, version) {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const targetVersion = this.getVersion(skillId, version);
    if (!targetVersion) {
      throw new Error(`Version ${version} not found for skill ${skillId}`);
    }

    skill.content = targetVersion.content;
    skill.version = version;
    skill.updatedAt = now();

    this.#skills.set(skillId, skill);

    if (this.#repo) {
      this.#repo.update(skillId, this.#toSkillRow(skill)).catch(() => {});
    }

    return skill;
  }

  /**
   * Bump version number
   * @private
   */
  #bumpVersion(currentVersion, type = 'patch') {
    const parts = currentVersion.split('.').map(Number);
    switch (type) {
      case 'major':
        return `${parts[0] + 1}.0.0`;
      case 'minor':
        return `${parts[0]}.${parts[1] + 1}.0`;
      case 'patch':
      default:
        return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }
  }

  // ==================== Assignment Management ====================

  /**
   * Assign skill to agent or company
   * @param {string} skillId - Skill ID
   * @param {Object} assignment - Assignment data
   * @param {string} assignment.assigneeType - 'agent' | 'company'
   * @param {string} assignment.assigneeId - Agent or Company ID
   * @param {string} [assignment.scope] - Assignment scope
   * @param {Object} [assignment.config] - Configuration overrides
   * @param {string} [assignment.assignedBy] - Assigner ID
   * @returns {SkillAssignment} Created assignment
   */
  assignSkill(skillId, assignment) {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    if (!VALID_ASSIGNEE_TYPES.includes(assignment.assigneeType)) {
      throw new Error(`Invalid assignee type: ${assignment.assigneeType}`);
    }

    // Check for existing assignment
    const existing = this.getAssignment(skillId, assignment.assigneeType, assignment.assigneeId);
    if (existing) {
      throw new Error(`Skill already assigned to this ${assignment.assigneeType}`);
    }

    const newAssignment = {
      id: generateUUID(),
      skillId,
      assigneeType: assignment.assigneeType,
      assigneeId: assignment.assigneeId,
      scope: assignment.scope || 'global',
      config: assignment.config || {},
      assignedAt: now(),
      assignedBy: assignment.assignedBy || null,
      expiresAt: assignment.expiresAt || null
    };

    const assignments = this.#assignments.get(skillId) || [];
    assignments.push(newAssignment);
    this.#assignments.set(skillId, assignments);

    return newAssignment;
  }

  /**
   * Remove skill assignment
   * @param {string} skillId - Skill ID
   * @param {string} assigneeType - 'agent' | 'company'
   * @param {string} assigneeId - Agent or Company ID
   * @returns {boolean} True if removed
   */
  unassignSkill(skillId, assigneeType, assigneeId) {
    const assignments = this.#assignments.get(skillId) || [];
    const index = assignments.findIndex(a => 
      a.assigneeType === assigneeType && a.assigneeId === assigneeId
    );
    
    if (index === -1) {
      return false;
    }

    assignments.splice(index, 1);
    this.#assignments.set(skillId, assignments);
    return true;
  }

  /**
   * Get specific assignment
   * @param {string} skillId - Skill ID
   * @param {string} assigneeType - 'agent' | 'company'
   * @param {string} assigneeId - Agent or Company ID
   * @returns {SkillAssignment|undefined} The assignment
   */
  getAssignment(skillId, assigneeType, assigneeId) {
    const assignments = this.#assignments.get(skillId) || [];
    return assignments.find(a => 
      a.assigneeType === assigneeType && a.assigneeId === assigneeId
    );
  }

  /**
   * Get all assignments for a skill
   * @param {string} skillId - Skill ID
   * @returns {SkillAssignment[]} Assignments
   */
  getSkillAssignments(skillId) {
    return this.#assignments.get(skillId) || [];
  }

  /**
   * Get all skills assigned to an agent or company
   * @param {string} assigneeType - 'agent' | 'company'
   * @param {string} assigneeId - Agent or Company ID
   * @returns {Array<{skill: Skill, assignment: SkillAssignment}>} Assigned skills
   */
  getAssignmentsFor(assigneeType, assigneeId) {
    const results = [];
    
    for (const [skillId, assignments] of this.#assignments) {
      const assignment = assignments.find(a => 
        a.assigneeType === assigneeType && a.assigneeId === assigneeId
      );
      if (assignment) {
        const skill = this.getSkill(skillId);
        if (skill && skill.status === 'active') {
          results.push({ skill, assignment });
        }
      }
    }

    return results;
  }

  /**
   * Check if skill is assigned to agent/company
   * @param {string} skillId - Skill ID
   * @param {string} assigneeType - 'agent' | 'company'
   * @param {string} assigneeId - Agent or Company ID
   * @returns {boolean} True if assigned
   */
  isAssigned(skillId, assigneeType, assigneeId) {
    return this.getAssignment(skillId, assigneeType, assigneeId) !== undefined;
  }

  // ==================== Import/Export ====================

  /**
   * Import skill from file
   * @param {string} filePath - Path to SKILL.md file
   * @param {Object} [options] - Import options
   * @param {string} [options.companyId] - Company scope
   * @param {string} [options.createdBy] - Creator ID
   * @returns {Skill} Imported skill
   */
  importFromFile(filePath, options = {}) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseSkillMarkdown(content);
    const name = parsed.frontmatter.name || basename(filePath, '.md');

    // Check if skill exists
    const existing = this.getSkillByName(name, options.companyId);
    if (existing) {
      // Update existing
      return this.updateSkill(existing.id, {
        content,
        changeNotes: options.changeNotes || 'Imported from file'
      });
    }

    return this.createSkill({
      name,
      content,
      displayName: parsed.frontmatter.displayName || parsed.frontmatter.name,
      companyId: options.companyId,
      createdBy: options.createdBy
    });
  }

  /**
   * Scan directory for skills and import
   * @param {string} directory - Directory to scan
   * @param {Object} [options] - Import options
   * @returns {Skill[]} Imported skills
   */
  scanDirectory(directory, options = {}) {
    const skills = [];
    
    if (!existsSync(directory)) {
      return skills;
    }

    const entries = readdirSync(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(directory, entry.name, 'SKILL.md');
        if (existsSync(skillPath)) {
          try {
            const skill = this.importFromFile(skillPath, options);
            skills.push(skill);
          } catch (err) {
            // Skip invalid skills
          }
        }
      }
    }

    return skills;
  }

  /**
   * Export skill to string
   * @param {string} skillId - Skill ID
   * @param {string} [version] - Specific version (default: current)
   * @returns {string} Skill content
   */
  exportSkill(skillId, version = null) {
    if (version) {
      const v = this.getVersion(skillId, version);
      if (!v) {
        throw new Error(`Version ${version} not found`);
      }
      return v.content;
    }

    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    return skill.content;
  }

  // ==================== Database Helpers ====================

  /**
   * Convert skill to database row
   * @private
   */
  #toSkillRow(skill) {
    return {
      id: skill.id,
      name: skill.name,
      display_name: skill.displayName,
      description: skill.description,
      content: skill.content,
      version: skill.version,
      status: skill.status,
      company_id: skill.companyId,
      tags: JSON.stringify(skill.tags),
      categories: JSON.stringify(skill.categories),
      metadata: JSON.stringify(skill.metadata),
      created_by: skill.createdBy,
      created_at: skill.createdAt,
      updated_at: skill.updatedAt
    };
  }

  /**
   * Load skills from repository
   */
  async loadFromRepository() {
    if (!this.#repo) return;

    try {
      const rows = await this.#repo.findAll({ limit: 10000 });
      for (const row of rows) {
        const skill = this.#hydrateSkillFromRow(row);
        this.#skills.set(skill.id, skill);
      }
    } catch {
      // Repository not ready
    }
  }

  /**
   * Hydrate skill from database row
   * @private
   */
  #hydrateSkillFromRow(row) {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      content: row.content,
      version: row.version,
      status: row.status,
      companyId: row.company_id,
      tags: JSON.parse(row.tags || '[]'),
      categories: JSON.parse(row.categories || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ==================== Validation ====================

  /**
   * Validate skill content
   * @param {string} content - Skill content to validate
   * @returns {Object} Validation result
   */
  static validate(content) {
    return validateSkillFormat(content);
  }

  /**
   * Check if name is valid
   * @param {string} name - Name to check
   * @returns {boolean} True if valid
   */
  static isValidName(name) {
    return isValidSkillName(name);
  }
}

export default SkillService;
