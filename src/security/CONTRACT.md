# Security Module Contract

## Overview

The Security Module provides comprehensive security features for CogniMesh v5.0. It includes encryption/decryption, password hashing, CSRF protection, rate limiting, input sanitization, validation, and comprehensive audit logging.

## Public Interfaces

### SecurityManager

Main security manager class.

```javascript
import { SecurityManager } from './security/index.js';

const security = new SecurityManager({
  algorithm: 'aes-256-gcm',
  keyDir: './keys'
});
```

**Methods:**

- `constructor(options)` - Creates security manager
  - `options.algorithm` - Encryption algorithm
  - `options.keyLength` - Key length in bytes
  - `options.ivLength` - IV length
  - `options.tagLength` - Auth tag length
  - `options.saltLength` - Salt length
  - `options.pepper` - Secret pepper
  - `options.keyDir` - Key storage directory

- `generateKey(length)` - Generates random key
  - `length` (number) - Key length
  - Returns: Buffer

- `deriveKey(password, salt)` - Derives key from password
  - Returns: Promise<Buffer>

- `encrypt(data, key)` - Encrypts data
  - `data` (string|Buffer) - Data to encrypt
  - `key` (Buffer|string) - Encryption key
  - Returns: EncryptedData

- `decrypt(encryptedData, key)` - Decrypts data
  - Returns: string

- `hashPassword(password, options)` - Hashes password
  - `options.iterations` - scrypt iterations
  - `options.memoryCost` - Memory cost
  - Returns: Promise<string>

- `verifyPassword(password, hash)` - Verifies password
  - Returns: Promise<boolean>

- `initKeyStorage()` - Initializes key directory
  - Returns: Promise<void>

- `generateMasterKey(keyName)` - Generates and stores master key
  - Returns: Promise<Buffer>

- `loadMasterKey(keyName)` - Loads master key
  - Returns: Promise<Buffer>

- `rotateKey(oldKey, keyName)` - Rotates encryption key
  - Returns: Promise<Buffer>

- `generateCsrfToken(sessionId)` - Generates CSRF token
  - Returns: { token, expires }

- `verifyCsrfToken(token, sessionId)` - Verifies CSRF token
  - Returns: boolean

- `revokeCsrfToken(token)` - Revokes CSRF token
  - Returns: boolean

- `csrfMiddleware(options)` - Creates CSRF middleware
  - Returns: Function

- `sign(data, key)` - Generates HMAC signature
  - Returns: string

- `verify(data, signature, key)` - Verifies HMAC signature
  - Returns: boolean

- `generateSecureToken(length)` - Generates secure random token
  - Returns: string

- `timingSafeEqual(a, b)` - Constant-time comparison
  - Returns: boolean

### RateLimiter

Rate limiting implementation.

- `constructor(options)` - Creates rate limiter
  - `options.windowMs` - Time window
  - `options.maxRequests` - Max requests per window

- `check(key)` - Checks if request allowed
  - Returns: RateLimitResult

- `reset(key)` - Resets limit for key
  - Returns: void

### Sanitizer

Input sanitization.

- `sanitizeString(str, options)` - Sanitizes string
  - Returns: string

- `sanitizeObject(obj, options)` - Sanitizes object
  - Returns: object

- `escapeHtml(str)` - Escapes HTML
  - Returns: string

- `stripHtml(str)` - Removes HTML
  - Returns: string

### Validator

Input validation.

- `validate(data, schema)` - Validates against schema
  - Returns: ValidationResult

- `isEmail(str)` - Checks if valid email
  - Returns: boolean

- `isUrl(str)` - Checks if valid URL
  - Returns: boolean

- `isStrongPassword(str)` - Checks password strength
  - Returns: PasswordStrength

### AuditLogger

Comprehensive audit logging.

- `log(event, data)` - Logs audit event
  - Returns: void

- `query(filters)` - Queries audit logs
  - Returns: AuditEntry[]

- `export(options)` - Exports audit logs
  - Returns: string

## Data Structures

### EncryptedData

```typescript
interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
  algorithm: string;
}
```

### RateLimitResult

```typescript
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
```

### AuditEntry

```typescript
interface AuditEntry {
  id: string;
  timestamp: string;
  event: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  data: Record<string, any>;
  severity: 'info' | 'warning' | 'critical';
}
```

### PasswordStrength

```typescript
interface PasswordStrength {
  score: number;  // 0-4
  feedback: string[];
  crackTime: string;
}
```

## Events

The Security module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `encrypted` | `{ algorithm }` | Data encrypted |
| `decrypted` | `{ algorithm }` | Data decrypted |
| `password:hashed` | `{}` | Password hashed |
| `password:verified` | `{ success }` | Password verified |
| `csrf:generated` | `{ sessionId }` | CSRF token generated |
| `csrf:verified` | `{ valid }` | CSRF token verified |
| `rateLimit:exceeded` | `{ key }` | Rate limit exceeded |
| `audit:logged` | `{ entry }` | Audit event logged |

## Error Handling

### SecurityError

Base error for security operations.

### EncryptionError

Thrown when encryption/decryption fails.

### PasswordError

Thrown when password operations fail.

### CsrfError

Thrown when CSRF validation fails.

### RateLimitError

Thrown when rate limit is exceeded.

### ValidationError

Thrown when validation fails.

## Usage Example

```javascript
import { SecurityManager } from './security/index.js';

const security = new SecurityManager({
  algorithm: 'aes-256-gcm',
  keyDir: './keys',
  pepper: process.env.SECURITY_PEPPER
});

// Encrypt data
const encrypted = security.encrypt('sensitive data', masterKey);

// Decrypt data
const decrypted = security.decrypt(encrypted, masterKey);

// Hash password
const hash = await security.hashPassword('userPassword');

// Verify password
const valid = await security.verifyPassword('userPassword', hash);

// CSRF protection
const { token } = security.generateCsrfToken(sessionId);
const valid = security.verifyCsrfToken(token, sessionId);
```
