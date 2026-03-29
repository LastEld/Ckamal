# Authentication System

CogniMesh v5.0 implements a production-grade, multi-actor authentication system supporting users, agents, and API keys with company-scoped access control.

## Overview

The authentication system provides:
- **Multi-actor support**: Users, agents, and API keys as first-class authentication actors
- **JWT-based sessions**: Secure access and refresh tokens with configurable lifetimes
- **API key authentication**: Service-to-service authentication for agents and integrations
- **Company scoping**: Organization-level resource isolation
- **Flexible modes**: Trust, token, hybrid, and required authentication modes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION LAYER                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   JWT Auth   │  │   API Keys   │  │   Sessions   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│         └─────────────────┴─────────────────┘              │
│                           │                                │
│              ┌────────────┴────────────┐                  │
│              │   Multi-Actor Engine    │                  │
│              │  (User/Agent/API Key)   │                  │
│              └────────────┬────────────┘                  │
└───────────────────────────┼─────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │ Company Scope  │
                    │   Isolation    │
                    └────────────────┘
```

## Authentication Modes

Configure the authentication mode via environment variable `COGNIMESH_AUTH_MODE`:

| Mode | Description | Use Case |
|------|-------------|----------|
| `trust` | No authentication required | Development, trusted environments |
| `token` | JWT tokens required for mutations | Standard production |
| `hybrid` | Tokens for mutations, read-only without | Mixed environments |
| `required` | Authentication required for all operations | High-security production |

## Actor Types

### Users

Human users authenticated via email/password or OAuth.

```javascript
// User registration
const { user, tokens } = await authService.register({
  email: 'user@example.com',
  password: 'secure-password-12-chars',
  name: 'John Doe',
  companyId: 'optional-existing-company'
});

// User login
const { user, tokens } = await authService.login(
  'user@example.com',
  'secure-password-12-chars'
);
```

### Agents

AI agents authenticated via API keys, typically with elevated permissions.

```javascript
// Create API key for agent
const { key, apiKey } = await authService.createApiKey({
  actorId: 'agent-123',
  actorType: 'agent',
  name: 'Production Agent Key',
  companyId: 'comp-456',
  permissions: ['tasks:read', 'tasks:write', 'agents:execute'],
  rateLimit: 500, // requests per minute
  expiresIn: 2592000 // 30 days
});

// Key format: cm_xxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
console.log(key); // cm_a1b2c3d4_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### API Keys

Service-to-service authentication keys with scoped permissions.

```javascript
// Validate API key
const authContext = await authService.validateApiKey('cm_xxx_xxx');

// Result:
{
  authenticated: true,
  actorId: 'user-123',
  actorType: 'user',
  companyId: 'comp-456',
  role: 'api',
  permissions: ['tasks:read'],
  tokenType: 'api_key',
  metadata: { keyId: 'cm_xxx', rateLimit: 1000 }
}
```

## JWT Token System

### Token Structure

**Access Token** (default: 1 hour lifetime):
```json
{
  "type": "access",
  "actor_type": "user",
  "company_id": "comp-123",
  "role": "admin",
  "permissions": ["*"],
  "sid": "session-uuid",
  "sub": "user-uuid",
  "iat": 1700000000,
  "exp": 1700003600,
  "iss": "cognimesh",
  "aud": "cognimesh-api",
  "jti": "token-uuid"
}
```

**Refresh Token** (default: 7 days lifetime):
```json
{
  "type": "refresh",
  "actor_type": "user",
  "company_id": "comp-123",
  "sid": "session-uuid",
  "sub": "user-uuid",
  "iat": 1700000000,
  "exp": 1700604800
}
```

### Token Operations

```javascript
// Verify access token
const authContext = await authService.verifyAccessToken(accessToken);

// Refresh tokens (token rotation)
const newTokens = await authService.refreshTokens(refreshToken);

// Logout (invalidate session)
await authService.logout(refreshToken);
```

### Algorithm Support

| Algorithm | Description | Configuration |
|-----------|-------------|---------------|
| `HS256` | HMAC with SHA-256 | Single secret |
| `RS256` | RSA with SHA-256 | Public/private key pair |
| `ES256` | ECDSA with SHA-256 | Elliptic curve keys |

## API Key Management

### Key Format

```
cm_<8-char-id>_<32-char-secret>
```

Example: `cm_a1b2c3d4_e3b0c44298fc1c149afbf4c8996fb924`

### Key Operations

```javascript
// List API keys for an actor
const keys = await authService.listApiKeys('user-123');

// Revoke API key
await authService.revokeApiKey('cm_a1b2c3d4', 'revoker-user-id');
```

### Rate Limits by Actor Type

| Actor Type | Default Rate Limit |
|------------|-------------------|
| `user` | 100 req/min |
| `agent` | 500 req/min |
| `api_key` | 1000 req/min |

## Company Scoping

### Organization Isolation

All resources are scoped to a company/organization:

```javascript
// Auth context includes company scope
{
  authenticated: true,
  actorId: 'user-123',
  actorType: 'user',
  companyId: 'comp-abc',  // ← Company scope
  role: 'member',
  permissions: ['tasks:read', 'tasks:write']
}
```

### Company Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full access, billing, member management |
| `admin` | Full access, member management |
| `member` | Standard access |
| `viewer` | Read-only access |

### Creating Companies

```javascript
// Create a company
const company = await authService.createCompany({
  name: 'Acme Corp',
  slug: 'acme-corp'
}, 'creator-user-id');

// Default company created automatically for new users
```

## Configuration

### Environment Variables

```bash
# Authentication mode
cognimesh_auth_mode=required

# JWT Configuration
cognimesh_auth_secret=your-secret-key
cognimesh_auth_algorithm=HS256
cognimesh_token_lifetime=3600
cognimesh_refresh_lifetime=604800

# Auto-generate secret (development only)
cognimesh_auth_auto_generate=true
```

### Programmatic Configuration

```javascript
import { AuthService, AUTH_MODES } from './src/auth/auth-service.js';

const authService = new AuthService({
  db: databaseInstance,
  mode: AUTH_MODES.REQUIRED,
  secret: process.env.JWT_SECRET,
  algorithm: 'HS256',
  tokenLifetime: 3600,      // 1 hour
  refreshLifetime: 604800,  // 7 days
  issuer: 'cognimesh',
  audience: 'cognimesh-api'
});
```

## Session Management

### Active Sessions

```javascript
// Get active sessions for user
const sessions = authService.getSessions('user-123');

// Invalidate specific session
authService.invalidateSession('session-uuid');

// Invalidate all user sessions (logout everywhere)
authService.invalidateUserSessions('user-123');
```

### Session Data

```javascript
{
  id: 'session-uuid',
  userId: 'user-123',
  createdAt: 1700000000000,
  expiresAt: 1700604800000,
  lastActivity: 1700003600000,
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
}
```

## Security Features

### Password Security

- **Algorithm**: scrypt (N=32768, r=8, p=1)
- **Minimum length**: 12 characters
- **Hash format**: `$scrypt$v=2$N=32768$r=8$p=1$<salt>$<hash>`

### Token Security

- Token rotation on refresh
- Revocation list for invalidated tokens
- Automatic cleanup of expired tokens
- Timing-safe comparison for API keys

### Rate Limiting

Per-actor rate limiting with configurable limits:

```javascript
// Custom rate limit for specific key
const { key } = await authService.createApiKey({
  actorId: 'agent-123',
  actorType: 'agent',
  rateLimit: 2000 // 2000 req/min
});
```

## Error Handling

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication required |
| `INVALID_CREDENTIALS` | 401 | Invalid email/password |
| `INVALID_TOKEN` | 401 | Token validation failed |
| `TOKEN_EXPIRED` | 401 | Token has expired |
| `TOKEN_REVOKED` | 401 | Token has been revoked |
| `INVALID_API_KEY` | 401 | API key invalid |
| `API_KEY_EXPIRED` | 401 | API key expired |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INSUFFICIENT_PERMISSIONS` | 403 | Access denied |
| `COMPANY_SUSPENDED` | 403 | Organization suspended |

## Integration Examples

### Express Middleware

```javascript
import { createAuthMiddleware } from './src/middleware/auth.js';

const authMiddleware = createAuthMiddleware(authService);

// Protect routes
app.use('/api', authMiddleware);

// Require specific permission
app.post('/api/tasks', 
  requirePermission('tasks:write'),
  taskController.create
);
```

### MCP Tool Authentication

```javascript
// Auth context available in MCP tools
const tool = {
  name: 'task_create',
  handler: async (params, context) => {
    // context.auth contains authenticated actor info
    const { actorId, actorType, companyId } = context.auth;
    
    // Resources automatically scoped to company
    return await taskService.create({
      ...params,
      companyId
    });
  }
};
```

## Best Practices

1. **Use API keys for agents**: Never use user credentials for automated agents
2. **Set appropriate rate limits**: Match rate limits to use case
3. **Configure key expiration**: Rotate keys regularly
4. **Use HTTPS always**: Never transmit tokens over HTTP
5. **Implement logout**: Properly invalidate sessions on logout
6. **Monitor suspicious activity**: Watch for unusual authentication patterns
