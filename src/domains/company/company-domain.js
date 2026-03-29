/**
 * @fileoverview Company Domain - Multi-tenant organization management
 * @module domains/company
 *
 * Manages companies/organizations, memberships, and data isolation
 * for the CogniMesh multi-tenant architecture.
 */

/**
 * @typedef {Object} Company
 * @property {string} id - Company UUID
 * @property {number} _id - Internal database ID
 * @property {string} name - Company name
 * @property {string} slug - URL-friendly identifier
 * @property {string} description - Company description
 * @property {string} status - Company status (active, inactive, suspended, deleted)
 * @property {string} [pauseReason] - Reason for suspension
 * @property {string} [pausedAt] - ISO timestamp of suspension
 * @property {string} [brandColor] - Primary brand color (hex)
 * @property {string} [logoUrl] - Company logo URL
 * @property {Object} settings - Company-specific settings
 * @property {boolean} requireApprovalForAgents - Require approval for new agents
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * @typedef {Object} CompanyMembership
 * @property {string} id - Membership UUID
 * @property {number} _id - Internal database ID
 * @property {string} companyId - Company UUID
 * @property {string} userId - User UUID
 * @property {string} role - Member role (owner, admin, member, viewer)
 * @property {string} status - Membership status (active, inactive, pending, suspended)
 * @property {string} [invitedBy] - UUID of inviter
 * @property {string} [invitedAt] - ISO timestamp of invitation
 * @property {string} [joinedAt] - ISO timestamp of acceptance
 * @property {Object} permissions - Specific permission overrides
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * @typedef {Object} CompanyCreateData
 * @property {string} name - Company name
 * @property {string} [slug] - URL-friendly identifier (auto-generated if not provided)
 * @property {string} [description] - Company description
 * @property {string} [brandColor] - Primary brand color
 * @property {string} [logoUrl] - Company logo URL
 * @property {Object} [settings] - Initial settings
 */

/**
 * @typedef {Object} RolePermissions
 * @property {boolean} canCreateTasks - Create new tasks
 * @property {boolean} canDeleteTasks - Delete tasks
 * @property {boolean} canManageRoadmaps - Manage roadmaps
 * @property {boolean} canManageContexts - Manage contexts
 * @property {boolean} canInviteMembers - Invite new members
 * @property {boolean} canManageMembers - Manage existing members
 * @property {boolean} canManageBilling - Manage billing settings
 * @property {boolean} canDeleteCompany - Delete the company
 * @property {boolean} canManageSettings - Manage company settings
 */

// Role permission templates
const ROLE_PERMISSIONS = {
  owner: {
    canCreateTasks: true,
    canDeleteTasks: true,
    canManageRoadmaps: true,
    canManageContexts: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageBilling: true,
    canDeleteCompany: true,
    canManageSettings: true
  },
  admin: {
    canCreateTasks: true,
    canDeleteTasks: true,
    canManageRoadmaps: true,
    canManageContexts: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageBilling: true,
    canDeleteCompany: false,
    canManageSettings: true
  },
  member: {
    canCreateTasks: true,
    canDeleteTasks: false,
    canManageRoadmaps: true,
    canManageContexts: true,
    canInviteMembers: false,
    canManageMembers: false,
    canManageBilling: false,
    canDeleteCompany: false,
    canManageSettings: false
  },
  viewer: {
    canCreateTasks: false,
    canDeleteTasks: false,
    canManageRoadmaps: false,
    canManageContexts: false,
    canInviteMembers: false,
    canManageMembers: false,
    canManageBilling: false,
    canDeleteCompany: false,
    canManageSettings: false
  }
};

const VALID_ROLES = Object.keys(ROLE_PERMISSIONS);
const VALID_COMPANY_STATUSES = ['active', 'inactive', 'suspended', 'deleted'];
const VALID_MEMBERSHIP_STATUSES = ['active', 'inactive', 'pending', 'suspended'];

/**
 * Generates a URL-friendly slug from a name
 * @param {string} name - Company name
 * @returns {string} URL-friendly slug
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

/**
 * Generates a UUID for company/membership IDs
 * @returns {string} UUID string
 */
function generateUUID() {
  // Use crypto.randomUUID if available, otherwise fallback
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
 * Validates and normalizes role
 * @param {string} role - Role to validate
 * @returns {string} Normalized role
 * @throws {Error} If role is invalid
 */
function validateRole(role) {
  const normalized = role?.toLowerCase();
  if (!VALID_ROLES.includes(normalized)) {
    throw new Error(`Invalid role: ${role}. Valid roles: ${VALID_ROLES.join(', ')}`);
  }
  return normalized;
}

/**
 * Validates company status
 * @param {string} status - Status to validate
 * @returns {string} Normalized status
 * @throws {Error} If status is invalid
 */
function validateCompanyStatus(status) {
  const normalized = status?.toLowerCase();
  if (!VALID_COMPANY_STATUSES.includes(normalized)) {
    throw new Error(`Invalid status: ${status}. Valid statuses: ${VALID_COMPANY_STATUSES.join(', ')}`);
  }
  return normalized;
}

/**
 * Company Domain - Multi-tenant organization management
 */
export class CompanyDomain {
  /** @type {Map<string, Object>} In-memory company cache */
  #companies = new Map();
  
  /** @type {Map<string, Object>} In-memory membership cache */
  #memberships = new Map();
  
  /** @type {Object|null} CompanyRepository instance */
  #repo = null;
  
  /** @type {Object|null} CompanyMembershipRepository instance */
  #membershipRepo = null;
  
  /** @type {string|null} Current active company ID for this context */
  #currentCompanyId = null;

  /**
   * @param {Object} [options]
   * @param {Object} [options.repositories] - RepositoryFactory instance
   */
  constructor(options = {}) {
    this.#companies = new Map();
    this.#memberships = new Map();
    this.#repo = options.repositories?.companies ?? null;
    this.#membershipRepo = options.repositories?.companyMemberships ?? null;
  }

  /**
   * Load all companies and memberships from repository
   */
  async loadFromRepository() {
    if (!this.#repo) return;
    
    try {
      // Load companies
      const companies = await this.#repo.findAll({ limit: 10000 });
      for (const row of companies) {
        const company = this.#hydrateCompanyFromRow(row);
        this.#companies.set(company.id, company);
      }

      // Load memberships if repository available
      if (this.#membershipRepo) {
        const memberships = await this.#membershipRepo.findAll({ limit: 10000 });
        for (const row of memberships) {
          const membership = this.#hydrateMembershipFromRow(row);
          this.#memberships.set(membership.id, membership);
        }
      }
    } catch {
      // Repository not ready or tables don't exist — continue in-memory
    }
  }

  /**
   * Hydrate company from database row
   * @private
   */
  #hydrateCompanyFromRow(row) {
    // Companies table uses TEXT id (UUID) from migration 006
    const id = row.id || row.uuid || generateUUID();
    return {
      id: id,
      _id: id, // Same as id for TEXT primary key
      name: row.name,
      slug: row.slug,
      description: row.description || '',
      status: row.status || 'active',
      pauseReason: row.pause_reason || null,
      pausedAt: row.paused_at || null,
      brandColor: row.brand_color || null,
      logoUrl: row.logo_url || null,
      budgetMonthlyCents: row.budget_monthly_cents || 0,
      spentMonthlyCents: row.spent_monthly_cents || 0,
      settings: row.settings ? JSON.parse(row.settings) : {},
      requireApprovalForAgents: Boolean(row.require_approval_for_agents),
      createdBy: row.created_by,
      createdAt: row.created_at || now(),
      updatedAt: row.updated_at || now(),
      deletedAt: row.deleted_at || null
    };
  }

  /**
   * Hydrate membership from database row
   * @private
   */
  #hydrateMembershipFromRow(row) {
    return {
      id: row.uuid || generateUUID(),
      _id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      role: row.role || 'member',
      status: row.status || 'active',
      invitedBy: row.invited_by || null,
      invitedAt: row.invited_at || null,
      joinedAt: row.joined_at || null,
      permissions: row.permissions ? JSON.parse(row.permissions) : {},
      createdAt: row.created_at || now(),
      updatedAt: row.updated_at || now(),
      deletedAt: row.deleted_at || null
    };
  }

  /**
   * Convert company to database row
   * @private
   */
  #toCompanyRow(company) {
    return {
      id: company.id,
      uuid: company.id,
      name: company.name,
      slug: company.slug,
      description: company.description,
      status: company.status,
      pause_reason: company.pauseReason,
      paused_at: company.pausedAt,
      brand_color: company.brandColor,
      logo_url: company.logoUrl,
      budget_monthly_cents: company.budgetMonthlyCents,
      spent_monthly_cents: company.spentMonthlyCents,
      settings: JSON.stringify(company.settings),
      require_approval_for_agents: company.requireApprovalForAgents ? 1 : 0,
      created_by: company.createdBy
    };
  }

  /**
   * Convert membership to database row
   * @private
   */
  #toMembershipRow(membership) {
    return {
      uuid: membership.id,
      company_id: membership.companyId,
      user_id: membership.userId,
      role: membership.role,
      status: membership.status,
      invited_by: membership.invitedBy,
      invited_at: membership.invitedAt,
      joined_at: membership.joinedAt,
      permissions: JSON.stringify(membership.permissions)
    };
  }

  // ==================== Company Management ====================

  /**
   * Create a new company
   * @param {CompanyCreateData} data - Company creation data
   * @param {string} creatorId - ID of user creating the company
   * @returns {Company} Created company
   * @throws {Error} If validation fails
   */
  createCompany(data, creatorId) {
    if (!data.name || typeof data.name !== 'string') {
      throw new Error('Company name is required');
    }

    const name = data.name.trim();
    if (name.length < 2 || name.length > 100) {
      throw new Error('Company name must be between 2 and 100 characters');
    }

    const slug = data.slug?.trim() || generateSlug(name);
    if (!slug || slug.length < 2) {
      throw new Error('Company slug must be at least 2 characters');
    }

    // Check for duplicate slug in memory
    for (const existing of this.#companies.values()) {
      if (existing.slug === slug && !existing.deletedAt) {
        throw new Error(`Company with slug '${slug}' already exists`);
      }
    }

    const company = {
      id: generateUUID(),
      _id: null,
      name,
      slug,
      description: data.description?.trim() || '',
      status: 'active',
      pauseReason: null,
      pausedAt: null,
      brandColor: data.brandColor || null,
      logoUrl: data.logoUrl || null,
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      settings: data.settings || {},
      requireApprovalForAgents: true,
      createdBy: creatorId,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    };

    this.#companies.set(company.id, company);

    // Create owner membership for creator (skip if already member)
    if (creatorId && !this.isMember(creatorId, company.id)) {
      this.addMember({
        companyId: company.id,
        userId: creatorId,
        role: 'owner',
        status: 'active',
        joinedAt: now()
      });
    }

    // Persist to repository
    if (this.#repo) {
      this.#repo.create(this.#toCompanyRow(company)).catch(() => {});
    }

    return company;
  }

  /**
   * Get a company by ID
   * @param {string} id - Company ID (UUID)
   * @returns {Company|undefined} The company or undefined
   */
  getCompany(id) {
    if (!id || typeof id !== 'string') return undefined;
    const company = this.#companies.get(id);
    if (company?.deletedAt) return undefined;
    return company;
  }

  /**
   * Get a company by slug
   * @param {string} slug - Company slug
   * @returns {Company|undefined} The company or undefined
   */
  getCompanyBySlug(slug) {
    if (!slug || typeof slug !== 'string') return undefined;
    for (const company of this.#companies.values()) {
      if (company.slug === slug && !company.deletedAt) {
        return company;
      }
    }
    return undefined;
  }

  /**
   * Update an existing company
   * @param {string} id - Company ID
   * @param {Partial<Company>} data - Update data
   * @param {string} updaterId - ID of user making the update
   * @returns {Company} Updated company
   * @throws {Error} If company not found or validation fails
   */
  updateCompany(id, data, updaterId) {
    const company = this.getCompany(id);
    if (!company) {
      throw new Error(`Company not found: ${id}`);
    }

    // Check updater has permission
    if (!this.hasPermission(updaterId, id, 'canManageSettings')) {
      throw new Error('Insufficient permissions to update company');
    }

    const allowedUpdates = [
      'name', 'description', 'brandColor', 'logoUrl', 
      'settings', 'requireApprovalForAgents'
    ];

    for (const key of allowedUpdates) {
      if (key in data) {
        company[key] = data[key];
      }
    }

    // Handle slug update separately (must be unique)
    if (data.slug && data.slug !== company.slug) {
      const newSlug = data.slug.trim();
      for (const existing of this.#companies.values()) {
        if (existing.slug === newSlug && existing.id !== id && !existing.deletedAt) {
          throw new Error(`Company with slug '${newSlug}' already exists`);
        }
      }
      company.slug = newSlug;
    }

    company.updatedAt = now();
    this.#companies.set(id, company);

    // Persist update
    if (this.#repo) {
      this.#repo.update(company._id, this.#toCompanyRow(company)).catch(() => {});
    }

    return company;
  }

  /**
   * Suspend a company
   * @param {string} id - Company ID
   * @param {string} reason - Suspension reason
   * @param {string} adminId - ID of admin suspending
   * @returns {Company} Updated company
   * @throws {Error} If company not found or insufficient permissions
   */
  suspendCompany(id, reason, adminId) {
    const company = this.getCompany(id);
    if (!company) {
      throw new Error(`Company not found: ${id}`);
    }

    // Only owners can suspend
    const membership = this.getMembership(adminId, id);
    if (!membership || membership.role !== 'owner') {
      throw new Error('Only company owners can suspend a company');
    }

    company.status = 'suspended';
    company.pauseReason = reason || 'Suspended by administrator';
    company.pausedAt = now();
    company.updatedAt = now();

    this.#companies.set(id, company);

    if (this.#repo) {
      this.#repo.update(company._id, this.#toCompanyRow(company)).catch(() => {});
    }

    return company;
  }

  /**
   * Reactivate a suspended company
   * @param {string} id - Company ID
   * @param {string} adminId - ID of admin reactivating
   * @returns {Company} Updated company
   * @throws {Error} If company not found or insufficient permissions
   */
  reactivateCompany(id, adminId) {
    const company = this.getCompany(id);
    if (!company) {
      throw new Error(`Company not found: ${id}`);
    }

    const membership = this.getMembership(adminId, id);
    if (!membership || membership.role !== 'owner') {
      throw new Error('Only company owners can reactivate a company');
    }

    company.status = 'active';
    company.pauseReason = null;
    company.pausedAt = null;
    company.updatedAt = now();

    this.#companies.set(id, company);

    if (this.#repo) {
      this.#repo.update(company._id, this.#toCompanyRow(company)).catch(() => {});
    }

    return company;
  }

  /**
   * Soft delete a company
   * @param {string} id - Company ID
   * @param {string} deleterId - ID of user deleting
   * @returns {boolean} True if deleted
   * @throws {Error} If company not found or insufficient permissions
   */
  deleteCompany(id, deleterId) {
    const company = this.getCompany(id);
    if (!company) {
      throw new Error(`Company not found: ${id}`);
    }

    // Only owners can delete
    const membership = this.getMembership(deleterId, id);
    if (!membership || membership.role !== 'owner') {
      throw new Error('Only company owners can delete a company');
    }

    company.status = 'deleted';
    company.deletedAt = now();
    company.updatedAt = now();

    this.#companies.set(id, company);

    if (this.#repo) {
      this.#repo.update(company._id, this.#toCompanyRow(company)).catch(() => {});
    }

    return true;
  }

  /**
   * List all active companies
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.status] - Filter by status
   * @returns {Company[]} Active companies
   */
  listCompanies(filters = {}) {
    let companies = Array.from(this.#companies.values())
      .filter(c => !c.deletedAt);

    if (filters.status) {
      companies = companies.filter(c => c.status === filters.status);
    }

    return companies.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  // ==================== Membership Management ====================

  /**
   * Add a member to a company
   * @param {Object} data - Membership data
   * @param {string} data.companyId - Company ID
   * @param {string} data.userId - User ID
   * @param {string} [data.role='member'] - Member role
   * @param {string} [data.status='active'] - Membership status
   * @param {string} [data.invitedBy] - Inviter ID
   * @param {string} [data.invitedAt] - Invitation timestamp
   * @param {string} [data.joinedAt] - Join timestamp
   * @returns {CompanyMembership} Created membership
   * @throws {Error} If validation fails or member already exists
   */
  addMember(data) {
    const company = this.getCompany(data.companyId);
    if (!company) {
      throw new Error(`Company not found: ${data.companyId}`);
    }

    // Check if membership already exists - return existing if found
    for (const membership of this.#memberships.values()) {
      if (membership.companyId === data.companyId && 
          membership.userId === data.userId &&
          !membership.deletedAt) {
        return membership;
      }
    }

    const role = validateRole(data.role || 'member');
    const status = data.status || 'active';

    const membership = {
      id: generateUUID(),
      _id: null,
      companyId: data.companyId,
      userId: data.userId,
      role,
      status,
      invitedBy: data.invitedBy || null,
      invitedAt: data.invitedAt || null,
      joinedAt: data.joinedAt || (status === 'active' ? now() : null),
      permissions: ROLE_PERMISSIONS[role],
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    };

    this.#memberships.set(membership.id, membership);

    // Persist to repository
    if (this.#membershipRepo) {
      this.#membershipRepo.create(this.#toMembershipRow(membership)).catch(() => {});
    }

    return membership;
  }

  /**
   * Invite a user to a company
   * @param {string} companyId - Company ID
   * @param {string} userId - User ID to invite
   * @param {string} [role='member'] - Role for invited user
   * @param {string} inviterId - ID of user sending invitation
   * @returns {CompanyMembership} Pending membership
   * @throws {Error} If inviter lacks permission
   */
  inviteMember(companyId, userId, role = 'member', inviterId) {
    // Check inviter has permission
    if (!this.hasPermission(inviterId, companyId, 'canInviteMembers')) {
      throw new Error('Insufficient permissions to invite members');
    }

    // Validate role (cannot invite as owner)
    const normalizedRole = validateRole(role);
    if (normalizedRole === 'owner') {
      throw new Error('Cannot invite users as owner');
    }

    return this.addMember({
      companyId,
      userId,
      role: normalizedRole,
      status: 'pending',
      invitedBy: inviterId,
      invitedAt: now()
    });
  }

  /**
   * Accept a pending invitation
   * @param {string} membershipId - Membership ID
   * @param {string} userId - User accepting (must match membership)
   * @returns {CompanyMembership} Updated membership
   * @throws {Error} If membership not found or already active
   */
  acceptInvitation(membershipId, userId) {
    const membership = this.#memberships.get(membershipId);
    if (!membership || membership.deletedAt) {
      throw new Error('Invitation not found');
    }

    if (membership.userId !== userId) {
      throw new Error('Invitation does not belong to this user');
    }

    if (membership.status !== 'pending') {
      throw new Error(`Invitation is ${membership.status}, not pending`);
    }

    membership.status = 'active';
    membership.joinedAt = now();
    membership.updatedAt = now();

    this.#memberships.set(membershipId, membership);

    if (this.#membershipRepo) {
      this.#membershipRepo.update(membership._id, this.#toMembershipRow(membership)).catch(() => {});
    }

    return membership;
  }

  /**
   * Remove a member from a company
   * @param {string} companyId - Company ID
   * @param {string} userId - User ID to remove
   * @param {string} removerId - ID of user removing
   * @returns {boolean} True if removed
   * @throws {Error} If remover lacks permission
   */
  removeMember(companyId, userId, removerId) {
    // Cannot remove yourself this way
    if (userId === removerId) {
      throw new Error('Use leaveCompany to remove yourself');
    }

    // Check remover has permission
    const removerMembership = this.getMembership(removerId, companyId);
    if (!removerMembership) {
      throw new Error('Remover is not a member of this company');
    }

    const targetMembership = this.getMembership(userId, companyId);
    if (!targetMembership) {
      throw new Error('User is not a member of this company');
    }

    // Cannot remove owners (except yourself via leaveCompany)
    if (targetMembership.role === 'owner') {
      throw new Error('Cannot remove company owner');
    }

    // Admins can remove members/viewers, only owners can remove admins
    if (targetMembership.role === 'admin' && removerMembership.role !== 'owner') {
      throw new Error('Only owners can remove admins');
    }

    if (!this.hasPermission(removerId, companyId, 'canManageMembers')) {
      throw new Error('Insufficient permissions to remove members');
    }

    targetMembership.deletedAt = now();
    targetMembership.status = 'inactive';
    targetMembership.updatedAt = now();

    this.#memberships.set(targetMembership.id, targetMembership);

    if (this.#membershipRepo) {
      this.#membershipRepo.update(targetMembership._id, this.#toMembershipRow(targetMembership)).catch(() => {});
    }

    return true;
  }

  /**
   * Leave a company (remove yourself)
   * @param {string} companyId - Company ID
   * @param {string} userId - User leaving
   * @returns {boolean} True if left
   * @throws {Error} If sole owner trying to leave
   */
  leaveCompany(companyId, userId) {
    const membership = this.getMembership(userId, companyId);
    if (!membership) {
      throw new Error('User is not a member of this company');
    }

    // Check if sole owner
    if (membership.role === 'owner') {
      const owners = this.getCompanyMembers(companyId)
        .filter(m => m.role === 'owner' && m.status === 'active');
      if (owners.length <= 1) {
        throw new Error('Cannot leave: you are the sole owner. Transfer ownership or delete the company.');
      }
    }

    membership.deletedAt = now();
    membership.status = 'inactive';
    membership.updatedAt = now();

    this.#memberships.set(membership.id, membership);

    if (this.#membershipRepo) {
      this.#membershipRepo.update(membership._id, this.#toMembershipRow(membership)).catch(() => {});
    }

    return true;
  }

  /**
   * Update a member's role
   * @param {string} companyId - Company ID
   * @param {string} userId - User ID
   * @param {string} newRole - New role
   * @param {string} updaterId - ID of user updating
   * @returns {CompanyMembership} Updated membership
   * @throws {Error} If updater lacks permission
   */
  updateMemberRole(companyId, userId, newRole, updaterId) {
    const updaterMembership = this.getMembership(updaterId, companyId);
    if (!updaterMembership) {
      throw new Error('Updater is not a member of this company');
    }

    const targetMembership = this.getMembership(userId, companyId);
    if (!targetMembership) {
      throw new Error('User is not a member of this company');
    }

    const role = validateRole(newRole);

    // Only owners can change to/from owner
    if (role === 'owner' || targetMembership.role === 'owner') {
      if (updaterMembership.role !== 'owner') {
        throw new Error('Only owners can transfer ownership');
      }
    }

    // Only owners and admins can change roles
    if (!['owner', 'admin'].includes(updaterMembership.role)) {
      throw new Error('Insufficient permissions to change member roles');
    }

    targetMembership.role = role;
    targetMembership.permissions = ROLE_PERMISSIONS[role];
    targetMembership.updatedAt = now();

    this.#memberships.set(targetMembership.id, targetMembership);

    if (this.#membershipRepo) {
      this.#membershipRepo.update(targetMembership._id, this.#toMembershipRow(targetMembership)).catch(() => {});
    }

    return targetMembership;
  }

  /**
   * Get a specific membership
   * @param {string} userId - User ID
   * @param {string} companyId - Company ID
   * @returns {CompanyMembership|undefined} Membership or undefined
   */
  getMembership(userId, companyId) {
    if (!userId || !companyId) return undefined;
    
    for (const membership of this.#memberships.values()) {
      if (membership.userId === userId && 
          membership.companyId === companyId && 
          !membership.deletedAt) {
        return membership;
      }
    }
    return undefined;
  }

  /**
   * Check if user is a member of a company
   * @param {string} userId - User ID
   * @param {string} companyId - Company ID
   * @returns {boolean} True if member
   */
  isMember(userId, companyId) {
    const membership = this.getMembership(userId, companyId);
    return membership !== undefined && membership.status === 'active';
  }

  /**
   * Get all members of a company
   * @param {string} companyId - Company ID
   * @returns {CompanyMembership[]} Company members
   */
  getCompanyMembers(companyId) {
    return Array.from(this.#memberships.values())
      .filter(m => m.companyId === companyId && !m.deletedAt);
  }

  /**
   * Get all companies for a user
   * @param {string} userId - User ID
   * @returns {Array<{company: Company, membership: CompanyMembership}>} User's companies
   */
  getUserCompanies(userId) {
    const result = [];
    
    for (const membership of this.#memberships.values()) {
      if (membership.userId === userId && 
          !membership.deletedAt && 
          membership.status === 'active') {
        const company = this.getCompany(membership.companyId);
        if (company && company.status === 'active') {
          result.push({ company, membership });
        }
      }
    }

    return result.sort((a, b) => 
      new Date(b.company.createdAt) - new Date(a.company.createdAt)
    );
  }

  // ==================== Permission Management ====================

  /**
   * Check if user has a specific permission in a company
   * @param {string} userId - User ID
   * @param {string} companyId - Company ID
   * @param {keyof RolePermissions} permission - Permission to check
   * @returns {boolean} True if has permission
   */
  hasPermission(userId, companyId, permission) {
    const membership = this.getMembership(userId, companyId);
    if (!membership || membership.status !== 'active') {
      return false;
    }

    // Get role permissions
    const rolePerms = ROLE_PERMISSIONS[membership.role] || ROLE_PERMISSIONS.viewer;
    
    // Check role permission first, then override with membership-specific permissions
    const hasRolePermission = rolePerms[permission] || false;
    const memberOverride = membership.permissions?.[permission];
    
    return memberOverride !== undefined ? memberOverride : hasRolePermission;
  }

  /**
   * Get all permissions for a user in a company
   * @param {string} userId - User ID
   * @param {string} companyId - Company ID
   * @returns {RolePermissions} Permission map
   */
  getPermissions(userId, companyId) {
    const membership = this.getMembership(userId, companyId);
    if (!membership || membership.status !== 'active') {
      return { ...ROLE_PERMISSIONS.viewer };
    }

    const rolePerms = ROLE_PERMISSIONS[membership.role] || ROLE_PERMISSIONS.viewer;
    
    // Merge with member-specific overrides
    return {
      ...rolePerms,
      ...membership.permissions
    };
  }

  // ==================== Context Management ====================

  /**
   * Set the current company context
   * @param {string} companyId - Company ID to set as current
   */
  setCurrentCompany(companyId) {
    this.#currentCompanyId = companyId;
  }

  /**
   * Get the current company context
   * @returns {string|null} Current company ID
   */
  getCurrentCompany() {
    return this.#currentCompanyId;
  }

  /**
   * Clear the current company context
   */
  clearCurrentCompany() {
    this.#currentCompanyId = null;
  }

  // ==================== Statistics ====================

  /**
   * Get company statistics
   * @param {string} companyId - Company ID
   * @returns {Object} Company statistics
   */
  getCompanyStats(companyId) {
    const company = this.getCompany(companyId);
    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    const members = this.getCompanyMembers(companyId);
    
    return {
      companyId,
      totalMembers: members.length,
      activeMembers: members.filter(m => m.status === 'active').length,
      pendingInvitations: members.filter(m => m.status === 'pending').length,
      byRole: {
        owner: members.filter(m => m.role === 'owner').length,
        admin: members.filter(m => m.role === 'admin').length,
        member: members.filter(m => m.role === 'member').length,
        viewer: members.filter(m => m.role === 'viewer').length
      },
      createdAt: company.createdAt,
      status: company.status
    };
  }

  /**
   * Get global statistics
   * @returns {Object} Global company statistics
   */
  getGlobalStats() {
    const companies = this.listCompanies();
    const memberships = Array.from(this.#memberships.values()).filter(m => !m.deletedAt);

    return {
      totalCompanies: companies.length,
      activeCompanies: companies.filter(c => c.status === 'active').length,
      suspendedCompanies: companies.filter(c => c.status === 'suspended').length,
      totalMemberships: memberships.length,
      activeMemberships: memberships.filter(m => m.status === 'active').length,
      pendingInvitations: memberships.filter(m => m.status === 'pending').length
    };
  }
}

export default CompanyDomain;
