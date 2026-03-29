/**
 * Middleware Exports
 * Authentication, ACL, and operational middleware for CogniMesh
 *
 * @module src/middleware
 */

// ============================================================================
// Authentication
// ============================================================================

export {
  AuthMiddleware,
  AuthError,
  AUTH_MODES,
  AUTH_TYPES,
  JWT_ALGORITHMS,
  getAuthMiddleware,
  resetAuthMiddleware
} from './auth.js';

// ============================================================================
// Permissions
// ============================================================================

export {
  PermissionChecker,
  PermissionError,
  ownerCondition,
  attributeCondition,
  timeCondition,
  ipCondition,
  createInheritance,
  STANDARD_INHERITANCE,
  CRUD_INHERITANCE,
  getPermissionChecker,
  resetPermissionChecker
} from './auth-permissions.js';

// ============================================================================
// ACL
// ============================================================================

export {
  ACLMiddleware,
  ACLError,
  ROLE_HIERARCHY,
  ROLE_INHERITANCE,
  createStandardACL,
  createProjectACL,
  getACL,
  resetACL
} from './acl.js';

// ============================================================================
// Audit
// ============================================================================

export {
  AuditMiddleware,
  AuditError,
  getAuditMiddleware,
  resetAuditMiddleware
} from './audit.js';

// ============================================================================
// Circuit Breaker
// ============================================================================

export {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitState,
  CIRCUIT_STATES,
  getCircuitBreaker,
  getAllCircuitBreakers,
  getAllCircuitStates,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  removeCircuitBreaker,
  clearAllCircuitBreakers,
  getCircuitBreakerRegistry
} from './circuit-breaker.js';

// ============================================================================
// Metrics
// ============================================================================

export {
  MetricsMiddleware,
  MetricsError,
  getMetricsMiddleware,
  resetMetricsMiddleware
} from './metrics.js';

// ============================================================================
// Orchestration
// ============================================================================

export {
  OrchestrationMiddleware,
  OrchestrationError,
  PipelineError,
  TransformError,
  getOrchestrationMiddleware,
  resetOrchestrationMiddleware
} from './orchestration.js';

// ============================================================================
// Rate Limiting
// ============================================================================

export {
  rateLimitMiddleware,
  rateLimitConfig,
  RateLimitError,
  defaultRateLimit,
  authRateLimit,
  claudeRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  getRateLimiterInstances,
  clearRateLimiters
} from './rate-limit.js';

// ============================================================================
// Security Headers
// ============================================================================

export {
  securityHeaders,
  apiSecurityHeaders,
  strictSecurityHeaders,
  cspReportOnly,
  cspReportHandler,
  checkSecurityHeaders,
  buildCSP,
  buildHSTS,
  generateNonce,
  SECURITY_PRESETS,
  DEFAULT_CSP_DIRECTIVES
} from './security-headers.js';

// ============================================================================
// Enhanced Authentication
// ============================================================================

export {
  EnhancedAuthMiddleware,
  EnhancedAuthError,
  getEnhancedAuth,
  resetEnhancedAuth
} from './auth-enhanced.js';

// ============================================================================
// Input Validation
// ============================================================================

export {
  sanitizeInput,
  sqlInjectionProtection,
  validateFileUpload,
  validateSchema,
  createValidationMiddleware,
  detectSQLInjection,
  detectNoSQLInjection,
  ValidationSchemas,
  FileUploadSchema
} from './input-validation.js';

// ============================================================================
// Security Audit
// ============================================================================

export {
  SecurityAuditLogger,
  AUTH_EVENTS,
  DATA_EVENTS,
  ADMIN_EVENTS,
  SECURITY_EVENTS,
  getSecurityAuditLogger,
  resetSecurityAuditLogger
} from './security-audit.js';

// ============================================================================
// Cost Tracking
// ============================================================================

export {
  createCostTracker,
  createBudgetEnforcer,
  createCostRecorder,
  createCostHeaders,
  createCostTrackingStack
} from './cost-tracker.js';

// ============================================================================
// Enhanced Rate Limiting
// ============================================================================

export {
  enhancedRateLimitMiddleware,
  EnhancedRateLimitError,
  enhancedRateLimitConfig,
  defaultRateLimit as enhancedDefaultRateLimit,
  authRateLimit as enhancedAuthRateLimit,
  apiRateLimit,
  claudeRateLimit as enhancedClaudeRateLimit,
  batchRateLimit,
  adminRateLimit,
  websocketRateLimit,
  setDistributedStorage,
  getDistributedStorage,
  getRateLimitStats,
  resetRateLimit as resetEnhancedRateLimit
} from './rate-limit-enhanced.js';

// ============================================================================
// Compression
// ============================================================================

export {
  compressionMiddleware,
  precompressedMiddleware,
  getCompressionStats,
  resetCompressionStats
} from './compression.js';

// ============================================================================
// Default Export
// ============================================================================

export { default } from './auth.js';
