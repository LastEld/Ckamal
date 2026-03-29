/**
 * @fileoverview CogniMesh Authentication Module
 * Production-grade authentication system with multi-actor support
 * @module src/auth
 * @version 5.0.0
 */

// Core Auth Service
export {
  AuthService,
  AuthError,
  getAuthService,
  resetAuthService,
  AUTH_MODES,
  ACTOR_TYPES,
  TOKEN_TYPES,
  JWT_ALGORITHMS
} from './auth-service.js';

// Middleware
export {
  MultiActorAuthMiddleware,
  createMultiActorMiddleware,
  createAuthMiddleware,
  jwtAuth,
  apiKeyAuth,
  multiAuth,
  requireAuth,
  requirePermission,
  requireActorType,
  requireCompany
} from './multi-actor-middleware.js';

// Default exports
export { AuthService as default } from './auth-service.js';
