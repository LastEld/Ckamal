/**
 * @fileoverview Authentication REST API Controller
 * Handles user registration, login, logout, token refresh, password reset,
 * profile management, and API key operations.
 * @module src/controllers/auth-controller
 * @version 5.0.0
 */

import { z } from 'zod';
import { AuthError } from '../auth/auth-service.js';
import {
  formatListResponse,
  parsePagination
} from './helpers.js';

// ============================================================================
// Validation Schemas
// ============================================================================

const registerSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  name: z.string().min(1, 'Name is required').max(100),
  companyId: z.string().uuid().optional()
});

const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required')
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email required')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(12, 'Password must be at least 12 characters')
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  permissions: z.array(z.string()).optional(),
  expiresIn: z.number().int().min(60).optional(), // seconds
  rateLimit: z.number().int().min(1).optional()
});

const revokeApiKeySchema = z.object({
  id: z.string().min(1, 'API key ID is required')
});

// ============================================================================
// Auth Controller
// ============================================================================

/**
 * Authentication REST API Controller
 * Handles all authentication-related HTTP endpoints
 */
export class AuthController {
  /**
   * @param {Object} options - Controller options
   * @param {AuthService} options.authService - AuthService instance
   * @param {Object} options.db - Database instance
   */
  constructor(options = {}) {
    this.authService = options.authService;
    this.db = options.db;
    this.basePath = '/api/auth';
  }

  /**
   * Get route handlers for registration with the server
   * @returns {Array<{method: string, path: string, handler: Function, auth: boolean}>}
   */
  getRoutes() {
    return [
      { method: 'POST', path: '/api/auth/register', handler: this.register.bind(this), auth: false },
      { method: 'POST', path: '/api/auth/login', handler: this.login.bind(this), auth: false },
      { method: 'POST', path: '/api/auth/logout', handler: this.logout.bind(this), auth: true },
      { method: 'POST', path: '/api/auth/refresh', handler: this.refresh.bind(this), auth: false },
      { method: 'POST', path: '/api/auth/forgot-password', handler: this.forgotPassword.bind(this), auth: false },
      { method: 'POST', path: '/api/auth/reset-password', handler: this.resetPassword.bind(this), auth: false },
      { method: 'GET', path: '/api/auth/me', handler: this.getMe.bind(this), auth: true },
      { method: 'PUT', path: '/api/auth/me', handler: this.updateMe.bind(this), auth: true },
      { method: 'POST', path: '/api/auth/api-keys', handler: this.createApiKey.bind(this), auth: true },
      { method: 'GET', path: '/api/auth/api-keys', handler: this.listApiKeys.bind(this), auth: true },
      { method: 'DELETE', path: '/api/auth/api-keys/:id', handler: this.revokeApiKey.bind(this), auth: true }
    ];
  }

  // ========================================================================
  // Authentication Endpoints
  // ========================================================================

  /**
   * POST /api/auth/register
   * Register a new user
   */
  async register(req, res) {
    try {
      const body = await this.#readJsonBody(req);
      
      // Validate input
      const validation = registerSchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      // Register user
      const result = await this.authService.register(validation.data);

      return this.#sendJson(res, 201, {
        success: true,
        data: {
          user: result.user,
          tokens: result.tokens
        }
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return this.#sendJson(res, error.statusCode, {
          success: false,
          error: error.message,
          code: error.code
        });
      }
      console.error('Registration error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Registration failed',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * POST /api/auth/login
   * Authenticate user and return tokens
   */
  async login(req, res) {
    try {
      const body = await this.#readJsonBody(req);
      
      // Validate input
      const validation = loginSchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      const { email, password } = validation.data;
      const result = await this.authService.login(email, password);

      return this.#sendJson(res, 200, {
        success: true,
        data: {
          user: result.user,
          tokens: result.tokens
        }
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return this.#sendJson(res, error.statusCode, {
          success: false,
          error: error.message,
          code: error.code
        });
      }
      console.error('Login error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Login failed',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * POST /api/auth/logout
   * Logout user and invalidate session
   */
  async logout(req, res) {
    try {
      const body = await this.#readJsonBody(req);
      const refreshToken = body?.refreshToken;

      if (refreshToken) {
        await this.authService.logout(refreshToken);
      }

      return this.#sendJson(res, 200, {
        success: true,
        data: { message: 'Logged out successfully' }
      });
    } catch (error) {
      // Even if logout fails, return success for security
      return this.#sendJson(res, 200, {
        success: true,
        data: { message: 'Logged out successfully' }
      });
    }
  }

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   */
  async refresh(req, res) {
    try {
      const body = await this.#readJsonBody(req);
      
      // Validate input
      const validation = refreshTokenSchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      const tokens = await this.authService.refreshTokens(validation.data.refreshToken);

      return this.#sendJson(res, 200, {
        success: true,
        data: { tokens }
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return this.#sendJson(res, error.statusCode, {
          success: false,
          error: error.message,
          code: error.code
        });
      }
      return this.#sendJson(res, 401, {
        success: false,
        error: 'Invalid refresh token',
        code: 'INVALID_TOKEN'
      });
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Request password reset
   */
  async forgotPassword(req, res) {
    try {
      const body = await this.#readJsonBody(req);
      
      // Validate input
      const validation = forgotPasswordSchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      // For security, always return success even if email doesn't exist
      // In a real implementation, you would send an email here
      const { email } = validation.data;
      
      // Check if user exists (for logging/audit, but don't expose to client)
      const user = this.db.prepare('SELECT id FROM auth_users WHERE email = ?').get(email);
      
      if (user) {
        // Generate reset token and store it (implementation depends on your needs)
        // For now, this is a placeholder
      }

      return this.#sendJson(res, 200, {
        success: true,
        data: { 
          message: 'If an account exists with this email, a password reset link has been sent.'
        }
      });
    } catch (error) {
      // Always return success for security
      return this.#sendJson(res, 200, {
        success: true,
        data: { 
          message: 'If an account exists with this email, a password reset link has been sent.'
        }
      });
    }
  }

  /**
   * POST /api/auth/reset-password
   * Reset password using reset token
   */
  async resetPassword(req, res) {
    try {
      const body = await this.#readJsonBody(req);
      
      // Validate input
      const validation = resetPasswordSchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      // In a real implementation, validate the reset token and update password
      // For now, this is a placeholder returning an error
      return this.#sendJson(res, 501, {
        success: false,
        error: 'Password reset not yet implemented',
        code: 'NOT_IMPLEMENTED'
      });
    } catch (error) {
      console.error('Password reset error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Password reset failed',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // ========================================================================
  // Profile Endpoints
  // ========================================================================

  /**
   * GET /api/auth/me
   * Get current user profile
   */
  async getMe(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Get full user details from database
      const user = this.db.prepare('SELECT * FROM auth_users WHERE id = ?').get(authContext.actorId);
      
      if (!user) {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Sanitize user data (remove password hash)
      const { password_hash: _unused, ...safeUser } = user;

      return this.#sendJson(res, 200, {
        success: true,
        data: {
          user: safeUser,
          auth: {
            actorType: authContext.actorType,
            companyId: authContext.companyId,
            role: authContext.role,
            permissions: authContext.permissions
          }
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to get profile',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * PUT /api/auth/me
   * Update current user profile
   */
  async updateMe(req, res) {
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
      const validation = updateProfileSchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      // Check if email is being changed and is already taken
      if (validation.data.email) {
        const existing = this.db.prepare('SELECT id FROM auth_users WHERE email = ? AND id != ?').get(
          validation.data.email,
          authContext.actorId
        );
        if (existing) {
          return this.#sendJson(res, 409, {
            success: false,
            error: 'Email already in use',
            code: 'EMAIL_EXISTS'
          });
        }
      }

      // Build update query
      const updates = [];
      const values = [];
      
      for (const [key, value] of Object.entries(validation.data)) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
      
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(authContext.actorId);

      const sql = `UPDATE auth_users SET ${updates.join(', ')} WHERE id = ?`;
      this.db.prepare(sql).run(...values);

      // Get updated user
      const user = this.db.prepare('SELECT * FROM auth_users WHERE id = ?').get(authContext.actorId);
      const { password_hash: _unused, ...safeUser } = user;

      return this.#sendJson(res, 200, {
        success: true,
        data: { user: safeUser }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to update profile',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // ========================================================================
  // API Key Endpoints
  // ========================================================================

  /**
   * POST /api/auth/api-keys
   * Create a new API key
   */
  async createApiKey(req, res) {
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
      const validation = createApiKeySchema.safeParse(body);
      if (!validation.success) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      const result = await this.authService.createApiKey({
        actorId: authContext.actorId,
        actorType: authContext.actorType === 'api_key' ? 'user' : authContext.actorType,
        companyId: authContext.companyId,
        ...validation.data
      });

      return this.#sendJson(res, 201, {
        success: true,
        data: {
          key: result.key, // Only returned once!
          apiKey: result.apiKey
        }
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return this.#sendJson(res, error.statusCode, {
          success: false,
          error: error.message,
          code: error.code
        });
      }
      console.error('Create API key error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to create API key',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * GET /api/auth/api-keys
   * List API keys for current user
   */
  async listApiKeys(req, res) {
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

      const keys = await this.authService.listApiKeys(authContext.actorId);

      // Apply pagination manually since auth service doesn't support it
      const paginatedKeys = keys.slice(pagination.offset, pagination.offset + pagination.limit);

      return this.#sendJson(res, 200, formatListResponse(paginatedKeys, {
        total: keys.length,
        limit: pagination.limit,
        offset: pagination.offset
      }));
    } catch (error) {
      console.error('List API keys error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to list API keys',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * DELETE /api/auth/api-keys/:id
   * Revoke an API key
   */
  async revokeApiKey(req, res) {
    try {
      const authContext = req.auth;
      
      if (!authContext?.authenticated) {
        return this.#sendJson(res, 401, {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Extract key ID from URL path
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathMatch = url.pathname.match(/\/api-keys\/([^/]+)$/);
      const keyId = pathMatch ? pathMatch[1] : null;

      if (!keyId) {
        return this.#sendJson(res, 400, {
          success: false,
          error: 'API key ID is required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Verify the key belongs to the current user
      const key = this.db.prepare('SELECT * FROM agent_api_keys WHERE id = ? AND actor_id = ?').get(
        keyId,
        authContext.actorId
      );

      if (!key) {
        return this.#sendJson(res, 404, {
          success: false,
          error: 'API key not found',
          code: 'NOT_FOUND'
        });
      }

      await this.authService.revokeApiKey(keyId, authContext.actorId);

      return this.#sendJson(res, 200, {
        success: true,
        data: { message: 'API key revoked successfully' }
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return this.#sendJson(res, error.statusCode, {
          success: false,
          error: error.message,
          code: error.code
        });
      }
      console.error('Revoke API key error:', error);
      return this.#sendJson(res, 500, {
        success: false,
        error: 'Failed to revoke API key',
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
}

export default AuthController;
