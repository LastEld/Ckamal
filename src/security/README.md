# Security Module

## Overview

The Security Module provides comprehensive security features for CogniMesh v5.0. It handles encryption, password management, CSRF protection, rate limiting, input sanitization, validation, and audit logging to ensure the application meets security best practices.

## Architecture

### Security Stack

```
┌─────────────────────────────────────────────────────────┐
│                    Security Module                       │
├──────────────┬──────────────┬──────────────┬────────────┤
│  Encryption  │  Password    │ Rate Limit   │   Audit    │
│  - AES-GCM   │  - scrypt    │ - Window     │  - Events  │
│  - Key mgmt  │  - Verify    │ - Token      │  - Export  │
├──────────────┼──────────────┼──────────────┼────────────┤
│   CSRF       │  Sanitizer   │  Validator   │            │
│  - Tokens    │  - HTML      │  - Schema    │            │
│  - Validate  │  - XSS       │  - Types     │            │
└──────────────┴──────────────┴──────────────┴────────────┘
```

### Security Flow

```
Input → Sanitizer → Validator → Rate Limit → Auth → Handler
                                          ↓
                                    Audit Log
```

## Components

### SecurityManager

Central security coordinator:

- **Encryption**: AES-256-GCM encryption/decryption
- **Key Management**: Master key generation and rotation
- **Password Hashing**: scrypt-based password hashing
- **CSRF Protection**: Token generation and validation
- **HMAC**: Message signing and verification

### RateLimiter

Request rate limiting:

- **Window-based**: Sliding or fixed windows
- **Multiple Keys**: Per-IP, per-user, per-endpoint
- **Configurable**: Custom limits and windows
- **Headers**: Rate limit headers

### Sanitizer

Input sanitization:

- **HTML Escaping**: Prevent XSS
- **HTML Stripping**: Remove all HTML
- **Object Sanitization**: Deep object cleaning
- **Custom Rules**: Configurable sanitization

### Validator

Input validation:

- **Schema Validation**: JSON Schema support
- **Type Checking**: Built-in type validators
- **Custom Validators**: User-defined validation
- **Password Strength**: Strength estimation

### AuditLogger

Security audit logging:

- **Event Logging**: Log security events
- **Query Interface**: Search audit logs
- **Export**: Export to various formats
- **Retention**: Configurable retention

## Usage

### Encryption

```javascript
import { SecurityManager } from './security/index.js';

const security = new SecurityManager({
  algorithm: 'aes-256-gcm',
  keyDir: './keys'
});

// Initialize key storage
await security.initKeyStorage();

// Generate master key
const masterKey = await security.generateMasterKey('primary');

// Encrypt sensitive data
const encrypted = security.encrypt('API_KEY=secret123', masterKey);
console.log('Encrypted:', encrypted.encrypted);
console.log('IV:', encrypted.iv);
console.log('Tag:', encrypted.tag);

// Decrypt
const decrypted = security.decrypt(encrypted, masterKey);
console.log('Decrypted:', decrypted);

// Key rotation
const newKey = await security.rotateKey(masterKey, 'primary');
```

### Password Management

```javascript
// Hash password
const hash = await security.hashPassword('userPassword123', {
  iterations: 65536,
  memoryCost: 65536,
  parallelism: 4
});

// Store hash in database
await db.storePassword(userId, hash);

// Verify password
const isValid = await security.verifyPassword(
  'userPassword123',
  storedHash
);

if (!isValid) {
  throw new Error('Invalid credentials');
}
```

### CSRF Protection

```javascript
import express from 'express';

const app = express();

// Generate CSRF token
app.get('/csrf-token', (req, res) => {
  const { token, expires } = security.generateCsrfToken(req.session.id);
  res.json({ token, expires });
});

// CSRF middleware
app.use(security.csrfMiddleware({
  headerName: 'X-CSRF-Token'
}));

// Protected route
app.post('/api/action', (req, res) => {
  // CSRF already validated by middleware
  res.json({ success: true });
});

// Manual validation
app.post('/api/special', (req, res) => {
  const token = req.headers['x-csrf-token'];
  if (!security.verifyCsrfToken(token, req.session.id)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  // ... handle request
});
```

### Rate Limiting

```javascript
import { RateLimiter } from './security/index.js';

const limiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 100           // per window
});

// Check rate limit
app.use((req, res, next) => {
  const key = req.ip;  // or req.user.id
  const result = limiter.check(key);
  
  if (!result.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: result.retryAfter
    });
  }
  
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  next();
});
```

### Input Sanitization

```javascript
import { Sanitizer } from './security/index.js';

const sanitizer = new Sanitizer();

// Sanitize string
const clean = sanitizer.sanitizeString(userInput, {
  removeHtml: true,
  escape: true,
  maxLength: 1000
});

// Sanitize object
const cleanObj = sanitizer.sanitizeObject(userData, {
  allowedTags: [],
  stripScripts: true,
  maxDepth: 5
});

// Escape HTML
const escaped = sanitizer.escapeHtml('<script>alert("xss")</script>');
// &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;

// Strip HTML
const stripped = sanitizer.stripHtml('<p>Hello <b>world</b></p>');
// Hello world
```

### Validation

```javascript
import { Validator } from './security/index.js';

const validator = new Validator();

// Validate email
const isEmail = validator.isEmail('user@example.com');

// Validate URL
const isUrl = validator.isUrl('https://example.com');

// Schema validation
const result = validator.validate(data, {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0 }
  },
  required: ['name', 'email']
});

if (!result.valid) {
  console.log('Validation errors:', result.errors);
}

// Password strength
const strength = validator.isStrongPassword('MyP@ssw0rd!');
console.log(`Score: ${strength.score}/4`);
console.log(`Crack time: ${strength.crackTime}`);
```

### Audit Logging

```javascript
import { AuditLogger } from './security/index.js';

const audit = new AuditLogger({
  storage: 'database',
  retentionDays: 365
});

// Log security event
audit.log('user.login', {
  userId: 'user-123',
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  success: true,
  method: 'password'
});

// Log failed access attempt
audit.log('access.denied', {
  userId: 'user-123',
  resource: '/admin',
  reason: 'insufficient_permissions',
  severity: 'warning'
});

// Query audit logs
const events = audit.query({
  event: 'user.login',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  severity: 'critical'
});

// Export audit logs
const csv = audit.export({
  format: 'csv',
  startDate: '2024-01-01',
  endDate: '2024-01-31'
});
```

## Configuration

### Security Manager

```javascript
{
  // Encryption
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  tagLength: 16,
  saltLength: 32,
  
  // Key storage
  keyDir: './keys',
  keyPermissions: 0o600,
  
  // Password hashing
  pepper: process.env.SECURITY_PEPPER,
  
  // CSRF
  csrfTokenLength: 32,
  csrfTokenExpiry: 3600000  // 1 hour
}
```

### Rate Limiter

```javascript
{
  // Window settings
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 100,
  
  // Key generator
  keyGenerator: (req) => req.ip,
  
  // Skip function
  skip: (req) => req.path === '/health',
  
  // Headers
  standardHeaders: true,
  legacyHeaders: false
}
```

### Audit Logger

```javascript
{
  // Storage
  storage: 'database',  // 'database' | 'file' | 'stdout'
  connection: dbConnection,
  
  // Retention
  retentionDays: 365,
  
  // Events to log
  events: ['user.login', 'access.*', 'data.modified'],
  
  // Sensitive fields to mask
  sensitiveFields: ['password', 'token', 'secret']
}
```

## Best Practices

1. **Use Strong Encryption**: AES-256-GCM for data at rest
2. **Hash Passwords**: Always use scrypt or Argon2
3. **Add Pepper**: Use secret pepper for password hashing
4. **CSRF Tokens**: Validate on all state-changing requests
5. **Rate Limiting**: Protect all endpoints appropriately
6. **Input Sanitization**: Never trust user input
7. **Audit Everything**: Log security-relevant events
8. **Key Rotation**: Rotate encryption keys regularly
