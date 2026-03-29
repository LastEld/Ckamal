# Authentication Flow Documentation

## Overview

CogniMesh v5.0 implements a multi-actor authentication system supporting users, agents, and API keys. The system is inspired by Paperclip's better-auth integration and provides production-grade security with JWT tokens, API key validation, and session management.

---

## Authentication Methods

### 1. JWT Authentication (User Sessions)

Used for human users accessing the web dashboard or API.

**Token Lifetimes**:
- Access Token: 1 hour
- Refresh Token: 7 days

**Token Structure**:
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT",
    "kid": "cm-1"
  },
  "payload": {
    "sub": "user-uuid",
    "type": "access",
    "actor_type": "user",
    "company_id": "company-uuid",
    "role": "admin",
    "permissions": ["tasks:write", "roadmaps:read"],
    "sid": "session-uuid",
    "iat": 1711641600,
    "exp": 1711645200,
    "iss": "cognimesh",
    "aud": "cognimesh-api",
    "jti": "token-uuid"
  }
}
```

---

### 2. API Key Authentication (Agents/M2M)

Used for agent-to-agent communication and machine-to-machine authentication.

**Key Format**:
```
cm_<key-id>_<secret>
```

**Example**:
```
cm_a1b2c3d4_xk9mNpQrStUvWxYz1234567890abcdef
```

**Rate Limits**:
| Actor Type | Rate Limit |
|------------|------------|
| User | 100 req/min |
| Agent | 500 req/min |
| API Key | 1000 req/min |

---

### 3. Session-Based Authentication

Used for web dashboard sessions with cookie-based storage.

---

## Authentication Flows

### User Login Flow

```
┌─────────┐          ┌──────────┐          ┌──────────┐          ┌──────────┐
│  Client │──────────▶│  Server  │──────────▶│  Auth    │──────────▶│   DB     │
│         │  POST     │          │ Validate  │ Service  │  Lookup   │          │
│         │ /login    │          │──────────▶│          │──────────▶│          │
│         │ {email,   │          │          │          │          │          │
│         │ password} │          │          │          │          │          │
└─────────┘          └──────────┘          └──────────┘          └──────────┘
     │                    │                    │                    │
     │                    │                    │◀───────────────────│
     │                    │                    │   User record      │
     │                    │                    │   (with hash)      │
     │                    │                    │                    │
     │                    │                    │──┐                 │
     │                    │                    │  │ scrypt verify   │
     │                    │                    │◀─┘                 │
     │                    │                    │                    │
     │                    │                    │──┐                 │
     │                    │                    │  │ Create session  │
     │                    │                    │◀─┘                 │
     │                    │                    │                    │
     │                    │◀───────────────────│                    │
     │                    │  {accessToken,      │                    │
     │                    │   refreshToken,     │                    │
     │                    │   user}             │                    │
     │◀───────────────────│                    │                    │
     │  HTTP 200 + JSON   │                    │                    │
     │  Set-Cookie header │                    │                    │
     │                    │                    │                    │
```

### API Key Validation Flow

```
┌─────────┐          ┌──────────┐          ┌──────────┐          ┌──────────┐
│  Agent  │──────────▶│  Server  │──────────▶│  Auth    │──────────▶│   DB     │
│         │  Request  │          │ Extract   │ Service  │  Lookup   │          │
│         │  X-API-Key│──────────▶│  Key ID   │──────────▶│  by ID    │          │
│         │  Header   │          │  & Secret │          │          │          │
└─────────┘          └──────────┘          └──────────┘          └──────────┘
     │                    │                    │                    │
     │                    │                    │◀───────────────────│
     │                    │                    │   Key record       │
     │                    │                    │   (with hash)      │
     │                    │                    │                    │
     │                    │                    │──┐                 │
     │                    │                    │  │ HMAC-SHA256     │
     │                    │                    │  │ verify          │
     │                    │                    │◀─┘                 │
     │                    │                    │                    │
     │                    │                    │──┐                 │
     │                    │                    │  │ Check expiry    │
     │                    │                    │  │ Check revoked   │
     │                    │                    │◀─┘                 │
     │                    │                    │                    │
     │                    │                    │──┐                 │
     │                    │                    │  │ Update last_used│
     │                    │                    │  │ Increment count │
     │                    │                    │◀─┘                 │
     │                    │                    │                    │
     │                    │◀───────────────────│                    │
     │                    │  AuthContext       │                    │
     │◀───────────────────│  {actorId, type,   │                    │
     │  Proceed to        │   permissions,     │                    │
     │  handler           │   companyId}       │                    │
     │                    │                    │                    │
```

### Token Refresh Flow

```
┌─────────┐          ┌──────────┐          ┌──────────┐          ┌──────────┐
│  Client │──────────▶│  Server  │──────────▶│  Auth    │──────────▶│  Memory  │
│         │  POST     │          │  Verify   │ Service  │  Check   │  Cache   │
│         │ /refresh  │──────────▶│  refresh │──────────▶│  session │          │
│         │ {refresh  │          │  token   │          │  & JTI   │          │
│         │  token}   │          │          │          │          │          │
└─────────┘          └──────────┘          └──────────┘          └──────────┘
     │                    │                    │                    │
     │                    │                    │──┐                 │
     │                    │                    │  │ Check revoked   │
     │                    │                    │  │ JTI list        │
     │                    │                    │◀─┘                 │
     │                    │                    │                    │
     │                    │                    │──┐                 │
     │                    │                    │  │ Validate        │
     │                    │                    │  │ session expiry  │
     │                    │                    │◀─┘                 │
     │                    │                    │                    │
     │                    │                    │──┐                 │
     │                    │                    │  │ Revoke old JTI  │
     │                    │                    │  │ Generate new    │
     │                    │                    │◀─┘                 │
     │                    │                    │                    │
     │                    │◀───────────────────│                    │
     │                    │  {accessToken,      │                    │
     │◀───────────────────│   refreshToken}     │                    │
     │  HTTP 200 + JSON   │                    │                    │
     │                    │                    │                    │
```

---

## JWT Lifecycle

### Token Generation

```javascript
// Access token generation
const accessToken = await new SignJWT({
  type: 'access',
  actor_type: 'user',
  company_id: 'company-uuid',
  role: 'admin',
  permissions: ['tasks:write'],
  sid: 'session-uuid'
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: 'cm-1' })
  .setSubject('user-uuid')
  .setIssuedAt()
  .setExpirationTime('1h')
  .setIssuer('cognimesh')
  .setAudience('cognimesh-api')
  .setJti('token-uuid')
  .sign(secret);
```

### Token Verification

```javascript
// Token verification
const { payload } = await jwtVerify(token, secret, {
  issuer: 'cognimesh',
  audience: 'cognimesh-api',
  algorithms: ['HS256']
});

// Check if token is revoked
if (isTokenRevoked(payload.jti)) {
  throw new AuthError('TOKEN_REVOKED', 'Token has been revoked');
}
```

### Token Rotation

On refresh:
1. Verify refresh token signature and expiry
2. Check refresh token is not revoked
3. Validate associated session exists and is not expired
4. Revoke old refresh token (add JTI to revoked list)
5. Generate new access token + refresh token pair
6. Update session with new refresh token JTI

---

## API Key Validation

### Key Generation

```javascript
async createApiKey(options) {
  // Generate components
  const keyId = `cm_${generateRandomString(8)}`;
  const keySecret = generateRandomString(32);
  const fullKey = `${keyId}_${keySecret}`;
  
  // Hash for storage
  const keyHash = createHmac('sha256', secret)
    .update(keySecret)
    .digest('hex');
  
  // Store in database
  await db.insert('agent_api_keys', {
    id: keyId,
    key_hash: keyHash,
    key_prefix: keyId,
    actor_id: options.actorId,
    actor_type: options.actorType,
    permissions: JSON.stringify(options.permissions),
    rate_limit: options.rateLimit || 1000
  });
  
  // Return full key (shown only once)
  return { key: fullKey, apiKey: { id: keyId } };
}
```

### Key Validation

```javascript
async validateApiKey(apiKey) {
  // Parse key
  const parts = apiKey.split('_');
  const keyId = `${parts[0]}_${parts[1]}`;
  const keySecret = parts.slice(2).join('_');
  
  // Load from cache or database
  const keyData = await getKeyData(keyId);
  
  // Check revoked
  if (keyData.revoked_at) {
    throw new AuthError('API_KEY_REVOKED');
  }
  
  // Check expiry
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    throw new AuthError('API_KEY_EXPIRED');
  }
  
  // Verify hash using timing-safe comparison
  const computedHash = createHmac('sha256', secret)
    .update(keySecret)
    .digest('hex');
    
  if (!timingSafeEqual(
    Buffer.from(keyData.key_hash),
    Buffer.from(computedHash)
  )) {
    throw new AuthError('INVALID_API_KEY');
  }
  
  // Update usage stats
  await updateKeyUsage(keyId);
  
  return {
    authenticated: true,
    actorId: keyData.actor_id,
    actorType: keyData.actor_type,
    permissions: JSON.parse(keyData.permissions),
    companyId: keyData.company_id
  };
}
```

---

## Auth Context

The authentication middleware creates an `AuthContext` that is attached to each request:

```javascript
interface AuthContext {
  authenticated: boolean;      // Always true after successful auth
  actorId: string;             // User/agent ID
  actorType: 'user' | 'agent' | 'api_key';
  companyId: string;           // Organization scope
  role: string;                // User role
  permissions: string[];       // Granted permissions
  sessionId?: string;          // Linked session
  expiresAt: number;           // Token expiration timestamp
  tokenType: string;           // 'access', 'refresh', or 'api_key'
  jti?: string;                // JWT ID
  metadata?: object;           // Additional data (rate limits, etc.)
}
```

---

## Middleware Integration

### Express Middleware

```javascript
// Authentication middleware
app.use(createMultiActorMiddleware({
  jwtSecret: process.env.JWT_SECRET,
  db: databaseInstance
}));

// Protected route
app.get('/api/tasks', 
  requireAuth(),
  requirePermission('tasks:read'),
  async (req, res) => {
    // req.auth contains AuthContext
    const tasks = await taskService.list({
      companyId: req.auth.companyId
    });
    res.json(tasks);
  }
);
```

### MCP Server Integration

```javascript
// Auth context passed to tool handlers
server.registerTool('create_task', {
  handler: async (params, context) => {
    // context.auth contains AuthContext
    if (!context.auth.hasPermission('tasks:write')) {
      throw new McpError('INSUFFICIENT_PERMISSIONS');
    }
    
    return await taskService.create({
      ...params,
      companyId: context.auth.companyId,
      createdBy: context.auth.actorId
    });
  }
});
```

---

## Security Considerations

### Password Security

- **Algorithm**: scrypt (N=32768, r=8, p=1)
- **Salt**: 32 bytes random
- **Hash**: 64 bytes output
- **Format**: `$scrypt$v=2$N=32768$r=8$p=1$<salt>$<hash>`

### Token Security

- **Signing**: HS256 (HMAC-SHA256) or RS256 (RSA-SHA256)
- **Secret Rotation**: Support for key ID (kid) header
- **Revocation**: In-memory JTI blacklist with TTL
- **Storage**: HttpOnly cookies for web, secure storage for CLI

### API Key Security

- **Prefix**: Identifiable format (`cm_`)
- **Hash**: HMAC-SHA256 with server secret
- **Storage**: Only hash stored, key shown once
- **Rate Limiting**: Per-key configurable limits

---

## Database Schema

### auth_users

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | User UUID |
| email | TEXT UNIQUE | User email |
| name | TEXT | Display name |
| password_hash | TEXT | scrypt hash |
| company_id | TEXT FK | Default company |
| role | TEXT | admin/user/guest |
| status | TEXT | active/inactive/suspended |
| last_login_at | DATETIME | Last login |
| created_at | DATETIME | Creation timestamp |

### agent_api_keys

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Key ID |
| key_hash | TEXT | HMAC hash |
| key_prefix | TEXT | Identifiable prefix |
| actor_id | TEXT | Associated actor |
| actor_type | TEXT | user/agent |
| company_id | TEXT FK | Company scope |
| permissions | TEXT JSON | Granted permissions |
| rate_limit | INTEGER | Rate limit |
| expires_at | DATETIME | Expiration |
| revoked_at | DATETIME | Revocation time |

### auth_sessions

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Session UUID |
| token | TEXT UNIQUE | Session token |
| user_id | TEXT FK | User ID |
| expires_at | DATETIME | Expiration |
| ip_address | TEXT | Client IP |
| user_agent | TEXT | Client UA |

---

*Version: 5.0.0*  
*Last Updated: 2026-03-28*
