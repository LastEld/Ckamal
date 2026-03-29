/**
 * @fileoverview Company REST API Controller
 * Handles company CRUD operations and membership management
 * @module src/controllers/company-controller
 * @version 5.0.0
 */

import { z } from 'zod';

import {
  formatResponse,
  formatListResponse,
  handleError,
  parsePagination
} from './helpers.js';

// ============================================================================
// Validation Schemas
// ============================================================================

const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  description: z.string().max(500).optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Brand color must be a valid hex color').optional(),
  logoUrl: z.string().url().optional(),
  settings: z.record(z.any()).optional()
});

const updateCompanySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  logoUrl: z.string().url().optional(),
  settings: z.record(z.any()).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

const addMemberSchema = z.object({
  userId: z.string().uuid('Valid user ID is required'),
  role: z.enum(['owner', 'admin', 'member', 'viewer'], {
    errorMap: () => ({ message: 'Role must be one of: owner, admin, member, viewer' })
  }).default('member'),
  permissions: z.array(z.string()).optional()
});

const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
  permissions: z.array(z.string()).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

// ============================================================================
// Company Controller
// ============================================================================

/**
 * Company REST API Controller
 * Handles all company-related HTTP endpoints
 */
export class CompanyController {
  /**
   * @param {Object} options - Controller options
   * @param {Object} options.repositories - Repository factory with companies and companyMemberships
   * @param {Object} options.db - Database instance for raw queries
   */
  constructor(options = {}) {
    this.repositories = options.repositories;
    this.db = options.db;
    this.basePath = '/api/companies';
  }

  /**
   * Get route handlers for registration with the server
   * @returns {Array<{method: string, path: string, handler: Function, auth: boolean}>}
   */
  getRoutes() {
    return [
      // Company CRUD
      { method: 'POST', path: '/api/companies', handler: this.createCompany.bind(this), auth: true },
      { method: 'GET', path: '/api/companies', handler: this.listCompanies.bind(this), auth: true },
      { method: 'GET', path: '/api/companies/:id', handler: this.getCompany.bind(this), auth: true },
      { method: 'PUT', path: '/api/companies/:id', handler: this.updateCompany.bind(this), auth: true },
      { method: 'DELETE', path: '/api/companies/:id', handler: this.deleteCompany.bind(this), auth: true },
      // Company Members
      { method: 'GET', path: '/api/companies/:id/members', handler: this.listMembers.bind(this), auth: true },
      { method: 'POST', path: '/api/companies/:id/members', handler: this.addMember.bind(this), auth: true },
      { method: 'DELETE', path: '/api/companies/:id/members/:userId', handler: this.removeMember.bind(this), auth: true },
      { method: 'PUT', path: '/api/companies/:id/members/:userId', handler: this.updateMember.bind(this), auth: true }
    ];
  }

  // ========================================================================
  // Company CRUD Endpoints
  // ========================================================================

  /**
   * POST /api/companies
   * Create a new company
   */
  async createCompany(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const body = await this.#readJsonBody(req);
      
      // Validate input
      const validation = createCompanySchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      const { name, slug, description, brandColor, logoUrl, settings } = validation.data;

      // Generate slug if not provided
      const companySlug = slug || this.#generateSlug(name);

      // Check if slug is available
      const existing = await this.repositories.companies.findBySlug(companySlug);
      if (existing) {
        return this.#sendJson(res, 409, {
          success: false,
          error: 'Company slug already exists',
          code: 'SLUG_EXISTS'
        });
      }

      // Verify user exists before creating company
      const userExists = this.db.prepare('SELECT id FROM auth_users WHERE id = ?').get(authContext.actorId);
      if (!userExists) {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Create company
      const company = await this.repositories.companies.create({
        name,
        slug: companySlug,
        description: description || null,
        brand_color: brandColor || null,
        logo_url: logoUrl || null,
        settings: JSON.stringify(settings || {}),
        status: 'active',
        created_by: authContext.actorId
      });

      // Add creator as owner
      await this.repositories.companyMemberships.create({
        company_id: company.id,
        user_id: authContext.actorId,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString()
      });

      return this.#sendJson(res, 201, formatResponse(company));
    } catch (error) {
      console.error('Create company error:', error);
      if (error.message?.includes('FOREIGN KEY')) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Invalid reference - ensure all related data exists',
          code: 'INVALID_REFERENCE'
        });
      }
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to create company',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * GET /api/companies
   * List companies (filtered by user membership)
   */
  async listCompanies(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pagination = parsePagination({
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset')
      });

      // Get companies where user is a member
      const memberships = await this.repositories.companyMemberships.findByUser(
        authContext.actorId,
        { status: 'active', limit: pagination.limit, offset: pagination.offset }
      );

      // Get full company details for each membership
      const companies = [];
      for (const membership of memberships) {
        const company = await this.repositories.companies.findById(membership.company_id);
        if (company && company.status !== 'deleted') {
          companies.push({
            ...company,
            membership: {
              role: membership.role,
              status: membership.status,
              joinedAt: membership.joined_at
            }
          });
        }
      }

      // Get total count
      const allMemberships = await this.repositories.companyMemberships.findByUser(
        authContext.actorId,
        { status: 'active', limit: 10000, offset: 0 }
      );
      const total = allMemberships.length;

      return this.#sendJson(res, 200, formatListResponse(companies, {
        total,
        limit: pagination.limit,
        offset: pagination.offset
      }));
    } catch (error) {
      console.error('List companies error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to list companies',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * GET /api/companies/:id
   * Get a specific company by ID
   */
  async getCompany(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const companyId = this.#extractIdFromPath(req.url, '/api/companies/');
      
      if (!companyId) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Company ID is required',
          code: 'VALIDATION_ERROR'
        });
      }

      // First check if company exists (to return 404 before 403)
      const company = await this.repositories.companies.findById(companyId);
      
      if (!company || company.status === 'deleted') {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'Company not found',
          code: 'NOT_FOUND'
        });
      }

      // Check if user is a member of this company
      const isMember = await this.repositories.companyMemberships.isMember(
        companyId,
        authContext.actorId
      );

      if (!isMember) {
        return this.#sendJson(res, 403, {
          success: false,
          error: 'Access denied to this company',
          code: 'ACCESS_DENIED'
        });
      }

      // Get user's role in this company
      const membership = await this.repositories.companyMemberships.findByCompanyAndUser(
        companyId,
        authContext.actorId
      );

      return this.#sendJson(res, 200, formatResponse({
        ...company,
        membership: membership ? {
          role: membership.role,
          status: membership.status,
          joinedAt: membership.joined_at
        } : null
      }));
    } catch (error) {
      console.error('Get company error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to get company',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * PUT /api/companies/:id
   * Update a company
   */
  async updateCompany(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const companyId = this.#extractIdFromPath(req.url, '/api/companies/');
      
      if (!companyId) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Company ID is required',
          code: 'VALIDATION_ERROR'
        });
      }

      // First check if company exists (to return 404 before 403)
      const existing = await this.repositories.companies.findById(companyId);
      if (!existing || existing.status === 'deleted') {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'Company not found',
          code: 'NOT_FOUND'
        });
      }

      // Check if user has admin or owner role
      const hasPermission = await this.repositories.companyMemberships.isMember(
        companyId,
        authContext.actorId,
        'admin'
      );

      if (!hasPermission) {
        return this.#sendJson(res, 403, {
          success: false,
          error: 'Admin or owner permission required',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      const body = await this.#readJsonBody(req);
      
      // Validate input
      const validation = updateCompanySchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      // Check slug uniqueness if changing
      if (validation.data.slug && validation.data.slug !== existing.slug) {
        const slugExists = await this.repositories.companies.findBySlug(validation.data.slug);
        if (slugExists) {
          return this.#sendJson(res, 409, {
            success: false,
            error: 'Company slug already exists',
            code: 'SLUG_EXISTS'
          });
        }
      }

      // Build update data (map camelCase to snake_case)
      const updates = {};
      if (validation.data.name) updates.name = validation.data.name;
      if (validation.data.slug) updates.slug = validation.data.slug;
      if (validation.data.description !== undefined) updates.description = validation.data.description;
      if (validation.data.brandColor) updates.brand_color = validation.data.brandColor;
      if (validation.data.logoUrl) updates.logo_url = validation.data.logoUrl;
      if (validation.data.settings) updates.settings = JSON.stringify(validation.data.settings);

      const company = await this.repositories.companies.update(companyId, updates);

      return this.#sendJson(res, 200, formatResponse(company));
    } catch (error) {
      console.error('Update company error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to update company',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * DELETE /api/companies/:id
   * Soft delete a company
   */
  async deleteCompany(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const companyId = this.#extractIdFromPath(req.url, '/api/companies/');
      
      if (!companyId) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Company ID is required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Check if user is owner
      const membership = await this.repositories.companyMemberships.findByCompanyAndUser(
        companyId,
        authContext.actorId
      );

      if (!membership || membership.role !== 'owner') {
        return this.#sendJson(res, 403, {
          success: false,
          error: 'Only company owner can delete the company',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      // Check if company exists
      const existing = await this.repositories.companies.findById(companyId);
      if (!existing || existing.status === 'deleted') {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'Company not found',
          code: 'NOT_FOUND'
        });
      }

      await this.repositories.companies.softDelete(companyId, authContext.actorId);

      return this.#sendJson(res, 200, formatResponse({ 
        message: 'Company deleted successfully',
        companyId 
      }));
    } catch (error) {
      console.error('Delete company error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to delete company',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // ========================================================================
  // Membership Endpoints
  // ========================================================================

  /**
   * GET /api/companies/:id/members
   * List company members
   */
  async listMembers(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const companyId = this.#extractIdFromPath(req.url, '/api/companies/');
      
      if (!companyId) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Company ID is required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Check if user is a member
      const isMember = await this.repositories.companyMemberships.isMember(
        companyId,
        authContext.actorId
      );

      if (!isMember) {
        return this.#sendJson(res, 403, {
          success: false,
          error: 'Access denied to this company',
          code: 'ACCESS_DENIED'
        });
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pagination = parsePagination({
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset')
      });

      // Get memberships
      const memberships = await this.repositories.companyMemberships.findByCompany(
        companyId,
        { limit: pagination.limit, offset: pagination.offset }
      );

      // Get user details for each membership
      const members = [];
      for (const membership of memberships) {
        const user = this.db.prepare('SELECT id, email, name, created_at FROM auth_users WHERE id = ?').get(membership.user_id);
        if (user) {
          members.push({
            user,
            membership: {
              id: membership.id,
              role: membership.role,
              status: membership.status,
              joinedAt: membership.joined_at,
              invitedBy: membership.invited_by
            }
          });
        }
      }

      // Get total count
      const countResult = await this.repositories.companyMemberships.countByRole(companyId);

      return this.#sendJson(res, 200, formatListResponse(members, {
        total: countResult.total,
        limit: pagination.limit,
        offset: pagination.offset
      }));
    } catch (error) {
      console.error('List members error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to list members',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * POST /api/companies/:id/members
   * Add a member to company
   */
  async addMember(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const companyId = this.#extractIdFromPath(req.url, '/api/companies/');
      
      if (!companyId) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Company ID is required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Check if user has admin or owner role
      const hasPermission = await this.repositories.companyMemberships.isMember(
        companyId,
        authContext.actorId,
        'admin'
      );

      if (!hasPermission) {
        return this.#sendJson(res, 403, {
          success: false,
          error: 'Admin or owner permission required',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      const body = await this.#readJsonBody(req);
      
      // Validate input
      const validation = addMemberSchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      const { userId, role, permissions } = validation.data;

      // Check if company exists
      const company = await this.repositories.companies.findById(companyId);
      if (!company || company.status === 'deleted') {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'Company not found',
          code: 'NOT_FOUND'
        });
      }

      // Check if user exists
      const user = this.db.prepare('SELECT id FROM auth_users WHERE id = ?').get(userId);
      if (!user) {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Check if already a member
      const existingMembership = await this.repositories.companyMemberships.findByCompanyAndUser(
        companyId,
        userId
      );

      if (existingMembership && !existingMembership.deleted_at) {
        return this.#sendJson(res, 409, {
          success: false,
          error: 'User is already a member of this company',
          code: 'ALREADY_MEMBER'
        });
      }

      // Cannot add owner if one already exists (unless you're the owner)
      if (role === 'owner') {
        const counts = await this.repositories.companyMemberships.countByRole(companyId);
        if (counts.owner > 0) {
          const requesterMembership = await this.repositories.companyMemberships.findByCompanyAndUser(
            companyId,
            authContext.actorId
          );
          if (requesterMembership?.role !== 'owner') {
            return this.#sendJson(res, 403, {
              success: false,
              error: 'Only existing owner can add another owner',
              code: 'INSUFFICIENT_PERMISSIONS'
            });
          }
        }
      }

      // Create membership
      const membership = await this.repositories.companyMemberships.create({
        company_id: companyId,
        user_id: userId,
        role,
        status: 'active',
        permissions: JSON.stringify(permissions || []),
        invited_by: authContext.actorId,
        invited_at: new Date().toISOString(),
        joined_at: new Date().toISOString()
      });

      return this.#sendJson(res, 201, formatResponse({
        membership,
        user: this.db.prepare('SELECT id, email, name FROM auth_users WHERE id = ?').get(userId)
      }));
    } catch (error) {
      console.error('Add member error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to add member',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * DELETE /api/companies/:id/members/:userId
   * Remove a member from company
   */
  async removeMember(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathParts = url.pathname.split('/');
      const companyId = pathParts[3];
      const userId = pathParts[5];

      if (!companyId || !userId) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Company ID and User ID are required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Users can remove themselves, or admins can remove others
      const isSelfRemoval = userId === authContext.actorId;
      
      if (!isSelfRemoval) {
        const hasPermission = await this.repositories.companyMemberships.isMember(
          companyId,
          authContext.actorId,
          'admin'
        );

        if (!hasPermission) {
          return this.#sendJson(res, 403, {
            success: false,
            error: 'Admin permission required to remove other members',
            code: 'INSUFFICIENT_PERMISSIONS'
          });
        }
      }

      // Check if target user is the owner
      const targetMembership = await this.repositories.companyMemberships.findByCompanyAndUser(
        companyId,
        userId
      );

      if (!targetMembership) {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'Member not found',
          code: 'NOT_FOUND'
        });
      }

      if (targetMembership.role === 'owner') {
        return this.#sendJson(res, 403, {
          success: false,
          error: 'Cannot remove company owner',
          code: 'CANNOT_REMOVE_OWNER'
        });
      }

      await this.repositories.companyMemberships.removeMember(companyId, userId);

      return this.#sendJson(res, 200, formatResponse({ 
        message: 'Member removed successfully',
        companyId,
        userId
      }));
    } catch (error) {
      console.error('Remove member error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to remove member',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * PUT /api/companies/:id/members/:userId
   * Update member role
   */
  async updateMember(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathParts = url.pathname.split('/');
      const companyId = pathParts[3];
      const userId = pathParts[5];

      if (!companyId || !userId) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Company ID and User ID are required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Check if user has admin or owner role
      const hasPermission = await this.repositories.companyMemberships.isMember(
        companyId,
        authContext.actorId,
        'admin'
      );

      if (!hasPermission) {
        return this.#sendJson(res, 403, {
          success: false,
          error: 'Admin or owner permission required',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      const body = await this.#readJsonBody(req);
      
      // Validate input
      const validation = updateMemberSchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      // Get target membership
      const membership = await this.repositories.companyMemberships.findByCompanyAndUser(
        companyId,
        userId
      );

      if (!membership) {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'Member not found',
          code: 'NOT_FOUND'
        });
      }

      // Only owner can change to/from owner role
      if (validation.data.role === 'owner' || membership.role === 'owner') {
        const requesterMembership = await this.repositories.companyMemberships.findByCompanyAndUser(
          companyId,
          authContext.actorId
        );
        if (requesterMembership?.role !== 'owner') {
          return this.#sendJson(res, 403, {
            success: false,
            error: 'Only owner can change owner role',
            code: 'INSUFFICIENT_PERMISSIONS'
          });
        }
      }

      // Update membership
      const updates = {};
      if (validation.data.role) {
        updates.role = validation.data.role;
      }
      if (validation.data.permissions) {
        updates.permissions = JSON.stringify(validation.data.permissions);
      }

      const updatedMembership = await this.repositories.companyMemberships.update(membership.id, updates);

      return this.#sendJson(res, 200, formatResponse({
        membership: updatedMembership,
        user: this.db.prepare('SELECT id, email, name FROM auth_users WHERE id = ?').get(userId)
      }));
    } catch (error) {
      console.error('Update member error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to update member',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  /**
   * Read and parse JSON body from request
   * @private
   */
  async #readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) return {};
    
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  /**
   * Send JSON response
   * @private
   */
  #sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  /**
   * Generate URL-friendly slug from name
   * @private
   */
  #generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Extract ID from URL path
   * @private
   */
  #extractIdFromPath(url, basePath) {
    const fullUrl = new URL(url, 'http://localhost');
    const path = fullUrl.pathname;
    
    if (!path.startsWith(basePath)) return null;
    
    const rest = path.slice(basePath.length);
    const idMatch = rest.match(/^([a-zA-Z0-9-]+)/);
    
    return idMatch ? idMatch[1] : null;
  }
}

export default CompanyController;
