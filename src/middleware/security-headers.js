/**
 * @fileoverview Security Headers Middleware
 * Implements comprehensive security headers for OWASP compliance
 * @module src/middleware/security-headers
 * @version 5.0.0
 */

// ============================================================================
// Default Security Headers Configuration
// ============================================================================

/**
 * Default Content Security Policy directives
 * @const {Object}
 */
export const DEFAULT_CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'upgrade-insecure-requests': []
};

/**
 * Security header presets for different environments
 * @const {Object}
 */
export const SECURITY_PRESETS = {
  strict: {
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    csp: DEFAULT_CSP_DIRECTIVES,
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
  },
  standard: {
    hsts: { maxAge: 31536000, includeSubDomains: true },
    csp: {
      ...DEFAULT_CSP_DIRECTIVES,
      'script-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https:']
    },
    xFrameOptions: 'SAMEORIGIN',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: 'camera=(), microphone=(), geolocation=()'
  },
  api: {
    hsts: { maxAge: 31536000, includeSubDomains: true },
    csp: null, // CSP not needed for API
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: 'camera=(), microphone=(), geolocation=()'
  }
};

// ============================================================================
// Security Headers Builder
// ============================================================================

/**
 * Build Content-Security-Policy header value from directives
 * @param {Object} directives - CSP directives
 * @returns {string} CSP header value
 */
export function buildCSP(directives) {
  if (!directives) return '';
  
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key;
      return `${key} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Build Strict-Transport-Security header value
 * @param {Object} config - HSTS configuration
 * @returns {string} HSTS header value
 */
export function buildHSTS(config) {
  let value = `max-age=${config.maxAge}`;
  if (config.includeSubDomains) value += '; includeSubDomains';
  if (config.preload) value += '; preload';
  return value;
}

/**
 * Generate nonce for CSP script/style tags
 * @returns {string} Base64 nonce
 */
export function generateNonce() {
  return Buffer.from(crypto.randomBytes(16)).toString('base64');
}

// ============================================================================
// Main Security Headers Middleware
// ============================================================================

/**
 * Security headers middleware factory
 * @param {Object} [options={}] - Middleware options
 * @param {string} [options.preset='standard'] - Preset configuration
 * @param {Object} [options.customHeaders={}] - Custom headers to add/override
 * @param {boolean} [options.removePoweredBy=true] - Remove X-Powered-By header
 * @param {Function} [options.nonceGenerator] - Custom nonce generator
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Using preset
 * app.use(securityHeaders({ preset: 'strict' }));
 * 
 * @example
 * // With custom headers
 * app.use(securityHeaders({
 *   preset: 'standard',
 *   customHeaders: {
 *     'X-Custom-Header': 'value'
 *   }
 * }));
 */
export function securityHeaders(options = {}) {
  const {
    preset = 'standard',
    customHeaders = {},
    removePoweredBy = true,
    nonceGenerator = generateNonce
  } = options;

  const config = SECURITY_PRESETS[preset] || SECURITY_PRESETS.standard;

  return (req, res, next) => {
    // Generate nonce for this request
    const nonce = nonceGenerator();
    res.locals.cspNonce = nonce;

    // Strict-Transport-Security (HSTS)
    if (config.hsts) {
      res.setHeader('Strict-Transport-Security', buildHSTS(config.hsts));
    }

    // Content-Security-Policy
    if (config.csp) {
      // Add nonce to script-src and style-src if they exist
      const cspDirectives = { ...config.csp };
      if (cspDirectives['script-src']) {
        cspDirectives['script-src'] = [...cspDirectives['script-src'], `'nonce-${nonce}'`];
      }
      
      res.setHeader('Content-Security-Policy', buildCSP(cspDirectives));
    }

    // X-Frame-Options
    if (config.xFrameOptions) {
      res.setHeader('X-Frame-Options', config.xFrameOptions);
    }

    // X-Content-Type-Options
    if (config.xContentTypeOptions) {
      res.setHeader('X-Content-Type-Options', config.xContentTypeOptions);
    }

    // Referrer-Policy
    if (config.referrerPolicy) {
      res.setHeader('Referrer-Policy', config.referrerPolicy);
    }

    // Permissions-Policy
    if (config.permissionsPolicy) {
      res.setHeader('Permissions-Policy', config.permissionsPolicy);
    }

    // X-XSS-Protection (legacy, but still useful for older browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Cross-Origin policies
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    // Remove powered-by header for security
    if (removePoweredBy) {
      res.removeHeader('X-Powered-By');
    }

    // Apply custom headers
    for (const [name, value] of Object.entries(customHeaders)) {
      res.setHeader(name, value);
    }

    next();
  };
}

// ============================================================================
// Specialized Middleware
// ============================================================================

/**
 * API-specific security headers (lighter CSP)
 * @param {Object} [options={}] - Options
 * @returns {Function} Express middleware
 */
export function apiSecurityHeaders(options = {}) {
  return securityHeaders({
    preset: 'api',
    ...options
  });
}

/**
 * Strict security headers for high-security areas
 * @param {Object} [options={}] - Options
 * @returns {Function} Express middleware
 */
export function strictSecurityHeaders(options = {}) {
  return securityHeaders({
    preset: 'strict',
    ...options
  });
}

/**
 * Report-only CSP middleware for testing
 * @param {Object} [options={}] - Options
 * @returns {Function} Express middleware
 */
export function cspReportOnly(options = {}) {
  const {
    reportUri = '/csp-report',
    directives = DEFAULT_CSP_DIRECTIVES
  } = options;

  return (req, res, next) => {
    const cspValue = buildCSP({
      ...directives,
      'report-uri': [reportUri]
    });
    
    res.setHeader('Content-Security-Policy-Report-Only', cspValue);
    next();
  };
}

// ============================================================================
// CSP Report Handler
// ============================================================================

/**
 * CSP violation report handler
 * @param {Object} [options={}] - Handler options
 * @param {Function} [options.onViolation] - Custom violation handler
 * @returns {Function} Express handler
 */
export function cspReportHandler(options = {}) {
  const { onViolation } = options;

  return (req, res) => {
    const report = req.body;
    
    // Log the violation
    console.warn('[CSP Violation]', {
      timestamp: new Date().toISOString(),
      documentUri: report['document-uri'],
      referrer: report.referrer,
      blockedUri: report['blocked-uri'],
      violatedDirective: report['violated-directive'],
      originalPolicy: report['original-policy'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      columnNumber: report['column-number']
    });

    // Call custom handler if provided
    if (onViolation) {
      onViolation(report);
    }

    res.status(204).end();
  };
}

// ============================================================================
// Security Header Checker
// ============================================================================

/**
 * Check security headers configuration
 * @param {Object} [headers] - Headers object to check (uses preset if not provided)
 * @returns {Object} Check results
 */
export function checkSecurityHeaders(headers) {
  const requiredHeaders = [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Content-Security-Policy',
    'Referrer-Policy',
    'Permissions-Policy'
  ];

  const results = {
    present: [],
    missing: [],
    score: 0
  };

  const headerNames = headers ? Object.keys(headers) : requiredHeaders;

  for (const header of requiredHeaders) {
    if (headerNames.includes(header)) {
      results.present.push(header);
    } else {
      results.missing.push(header);
    }
  }

  results.score = Math.round((results.present.length / requiredHeaders.length) * 100);
  
  return results;
}

// ============================================================================
// Default Export
// ============================================================================

export default securityHeaders;

// Import crypto for nonce generation
import crypto from 'crypto';
