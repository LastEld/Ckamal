# CogniMesh Authentication Architecture

## Overview

CogniMesh implements a production-grade, multi-actor authentication system inspired by Paperclip's better-auth architecture. It supports multiple authentication methods and actor types with comprehensive security controls.

## Architecture Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION LAYER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Multi-Actor Auth System                          │   │
│  │                                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   JWT Auth   │  │   API Keys   │  │   Sessions   │              │   │
│  │  │   (Users)    │  │  (Agents)    │  │   (Web UI)   │              │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │   │
│  │         │                 │                 │                       │   │
│  │         └─────────────────┴─────────────────┘                       │   │
│  │                           │                                         │   │
│  │                    ┌──────┴──────┐                                  │   │
│  │                    │ AuthService │                                  │   │
│  │                    └──────┬──────┘                                  │   │
│  │                           │                                         │   │
│  │         ┌─────────────────┼─────────────────┐                      │   │
│  │         ▼                 ▼                 ▼                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │   │
│  │  │    Users     │  │   Agents     │  │   API Keys   │             │   │
│  │  │  (auth_users)│  │  (Provider   │  │ (agent_api_  │             │   │
│  │  │              │  │   Sessions)  │  │    keys)     │             │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              MultiActorAuthMiddleware (Express)                     │   │
│  │                                                                     │   │
│  │  • Token extraction & validation                                   │   │
│  │  • Rate limiting per actor type                                    │   │
│  │  • CSRF protection for sessions                                    │   │
│  │  • Permission-based access control                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Actor Types

| Actor Type | Description | Authentication Method | Rate Limit |
|------------|-------------|----------------------|------------|
| `user` | Human users via web/dashboard | JWT Bearer Token | 100 req/min |
| `agent` | AI agents and CV instances | JWT or API Key | 500 req/min |
| `api_key` | Machine-to-machine services | API Key (X-API-Key) | 1000 req/min |

## Authentication Methods

### 1. JWT Authentication (Users)

**Token Lifecycle:**
```
┌──────────┐    Login    ┌──────────────┐   Token Refresh   ┌──────────────┐
│  Client  │ ──────────▶ │ Access Token │ ◀──────────────── │ Refresh Token│
└──────────┘             │  (1 hour)    │                   │  (7 days)    │
                         └──────────────┘                   └──────────────┘
```

**Features:**
- Access tokens: 1 hour expiration
- Refresh tokens: 7 days expiration with rotation
- HS256 (symmetric) or RS256 (asymmetric) signing
- Automatic token refresh

**Usage:**
```http
Authorization: Bearer <access_token>
```

### 2. API Key Authentication (Agents/Services)

**Key Format:**
```
cm_<key_id>_<secret>
```

**Features:**
- HMAC-SHA256 hashed storage
- Configurable expiration
- Per-key rate limits
- Usage tracking and audit
- Revocation support

**Usage:**
```http
X-API-Key: cm_abc123_def456...
```

### 3. Session Authentication (Web Dashboard)

**Features:**
- Cookie-based sessions
- CSRF token protection
- 24-hour session lifetime
- Session invalidation support

## AuthService API

### User Authentication

```javascript
// Register new user
const { user, tokens } = await authService.register({
  email: 'user@example.com',
  password: 'secure-password-123',
  name: 'John Doe',
  companyId: 'optional-company-id'
});

// Login
const { user, tokens } = await authService.login(
  'user@example.com',
  'secure-password-123'
);

// Logout
await authService.logout(refreshToken);
```

### Token Management

```javascript
// Verify access token
const context = await authService.verifyAccessToken(token);
// Returns: { authenticated: true, actorId, actorType, companyId, role, permissions }

// Refresh tokens
const newTokens = await authService.refreshTokens(refreshToken);
```

### API Key Management

```javascript
// Create API key
const { key, apiKey } = await authService.createApiKey({
  actorId: 'agent-123',
  actorType: 'agent',
  name: 'Production API Key',
  permissions: ['tasks.read', 'tasks.write'],
  expiresIn: 2592000, // 30 days
  rateLimit: 1000
});

// Validate API key
const context = await authService.validateApiKey(apiKey);

// Revoke API key
await authService.revokeApiKey(keyId, revokedByUserId);
```

## Multi-Actor Middleware

### Configuration

```javascript
import { createMultiActorMiddleware, AUTH_MODES } from './auth/index.js';

const authMiddleware = createMultiActorMiddleware({
  authService,
  mode: AUTH_MODES.HYBRID,  // trust | token | hybrid | required
  csrfProtection: true,
  publicPaths: ['/health', '/api/v1/auth/login'],
  rateLimits: {
    user: { window: 60000, max: 100 },
    agent: { window: 60000, max: 500 },
    api_key: { window: 60000, max: 1000 }
  }
});
```

### Auth Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `trust` | No authentication required | Development, trusted networks |
| `token` | Token-based auth only | API-only deployments |
| `hybrid` | Supports all auth methods | Mixed client environments |
| `required` | Authentication mandatory | Production deployments |

### Route Protection

```javascript
const router = express.Router();

// Apply auth middleware
router.use(authMiddleware.middleware());

// Require authentication
router.get('/protected', 
  authMiddleware.requireAuth(),
  (req, res) => {
    res.json({ user: req.auth.actorId });
  }
);

// Require specific permissions
router.post('/admin',
  authMiddleware.requireAuth(),
  authMiddleware.requirePermission(['admin', 'users.manage']),
  (req, res) => { /* admin action */ }
);

// Require specific actor type
router.post('/agent-action',
  authMiddleware.requireAuth(),
  authMiddleware.requireActorType(['agent', 'api_key']),
  (req, res) => { /* agent-only action */ }
);

// Require company scope
router.get('/company-data',
  authMiddleware.requireAuth(),
  authMiddleware.requireCompany(),
  (req, res) => { /* company-scoped data */ }
);
```

## Security Considerations

### Password Security

- **Algorithm**: scrypt with N=32768, r=8, p=1
- **Salt**: 32 bytes random per password
- **Hash**: 64 bytes output
- **Format**: `$scrypt$v=2$N=32768$r=8$p=1$<salt>$<hash>`

### Token Security

```javascript
// JWT Configuration
{
  algorithm: 'HS256',      // or 'RS256' for asymmetric
  tokenLifetime: 3600,     // 1 hour
  refreshLifetime: 604800, // 7 days
  issuer: 'cognimesh',
  audience: 'cognimesh-api'
}
```

### API Key Security

- Keys are hashed with HMAC-SHA256 before storage
- Only displayed once at creation time
- Prefix stored separately for identification
- Automatic rotation recommendations

### Rate Limiting

| Actor Type | Default Limit | Window |
|------------|--------------|--------|
| Unauthenticated | 20 requests | 1 minute |
| User | 100 requests | 1 minute |
| Agent | 500 requests | 1 minute |
| API Key | 1000 requests | 1 minute |

### CSRF Protection

For session-based authentication:
```javascript
// Client must include CSRF token
headers: {
  'X-CSRF-Token': csrfToken  // From cookie or meta tag
}
```

## Auth Context

The auth context is attached to all authenticated requests:

```javascript
req.auth = {
  authenticated: true,
  actorId: 'user-123',
  actorType: 'user',        // 'user' | 'agent' | 'api_key'
  companyId: 'company-456',
  role: 'admin',
  permissions: ['tasks.read', 'tasks.write', 'admin'],
  sessionId: 'sess-789',
  expiresAt: 1711234567890,
  tokenType: 'access',
  jti: 'token-id',
  clientIp: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
};
```

## Company/Organization Scoping

Multi-tenancy is implemented through company scoping:

```javascript
// All authenticated requests include company context
const companyId = req.auth.companyId;

// Database queries automatically filter by company
const tasks = await taskRepository.findByCompany(companyId);

// Costs tracked per company
const costs = await costService.getStats({ company_id: companyId });
```

## Error Handling

| Error Code | Status | Description |
|------------|--------|-------------|
| `AUTH_REQUIRED` | 401 | No valid credentials provided |
| `INVALID_CREDENTIALS` | 401 | Invalid email/password |
| `INVALID_TOKEN` | 401 | JWT token invalid |
| `TOKEN_EXPIRED` | 401 | JWT token expired |
| `TOKEN_REVOKED` | 401 | Token has been revoked |
| `INVALID_API_KEY` | 401 | API key invalid |
| `API_KEY_EXPIRED` | 401 | API key expired |
| `API_KEY_REVOKED` | 401 | API key revoked |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INSUFFICIENT_PERMISSIONS` | 403 | Missing required permission |
| `COMPANY_SUSPENDED` | 403 | Organization account suspended |

## Database Schema

### auth_users
```sql
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  company_id TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### agent_api_keys
```sql
CREATE TABLE agent_api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_type TEXT DEFAULT 'agent',
  company_id TEXT,
  permissions TEXT DEFAULT '[]',
  rate_limit INTEGER DEFAULT 500,
  expires_at DATETIME,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### auth_sessions
```sql
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Environment Configuration

```env
# Auth Mode
COGNIMESH_AUTH_MODE=hybrid

# JWT Configuration
COGNIMESH_AUTH_SECRET=your-secret-key
COGNIMESH_AUTH_ALGORITHM=HS256
COGNIMESH_TOKEN_LIFETIME=3600
COGNIMESH_REFRESH_LIFETIME=604800

# RSA Keys (for RS256)
COGNIMESH_AUTH_PRIVATE_KEY_FILE=/path/to/private.pem
COGNIMESH_AUTH_PUBLIC_KEY_FILE=/path/to/public.pem

# Auto-generate secret in development
COGNIMESH_AUTH_AUTO_GENERATE=true
```

---

*Version: 5.0.0*  
*Last Updated: 2026-03-28*
