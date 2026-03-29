# Authentication API Documentation

Complete guide to authentication flows, token management, and permission models in Ckamal.

**Version:** 5.0.0  
**Last Updated:** 2026-03-28

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication Methods](#authentication-methods)
3. [JWT Authentication](#jwt-authentication)
4. [API Key Authentication](#api-key-authentication)
5. [Token Refresh Flow](#token-refresh-flow)
6. [Permission Model](#permission-model)
7. [Password Management](#password-management)
8. [Security Best Practices](#security-best-practices)

---

## Overview

Ckamal supports multiple authentication methods to accommodate different use cases:

- **JWT Tokens** - For user sessions in web applications
- **API Keys** - For service-to-service authentication and automated scripts
- **WebSocket Tokens** - For real-time WebSocket connections

### Response Format

All authentication responses follow the standard API format:

```json
{
  "success": boolean,
  "data": object | null,
  "error": string | undefined,
  "code": string | undefined
}
```

---

## Authentication Methods

### Supported Authentication Headers

| Header | Description | Use Case |
|--------|-------------|----------|
| `Authorization: Bearer <token>` | JWT access token | User sessions |
| `X-API-Key: <key>` | API key for service auth | Automation, integrations |
| `Cookie: session=<token>` | Session cookie | Web applications |

### Authentication Flow Summary

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Ckamal    │────▶│   Verify    │
│             │◀────│   Server    │◀────│   Identity  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │ 1. Send creds     │ 2. Validate       │ 3. Check DB
       │                   │                   │
       │◀──────────────────│◀──────────────────│ 4. Return tokens
```

---

## JWT Authentication

### User Registration

Create a new user account.

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "companyId": "optional-company-uuid"
}
```

**Validation Rules:**
- `email`: Valid email format, unique in system
- `password`: Minimum 12 characters
- `name`: 1-100 characters
- `companyId`: Optional valid UUID

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "created_at": "2026-03-28T12:00:00Z",
      "updated_at": "2026-03-28T12:00:00Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 900,
      "tokenType": "Bearer"
    }
  }
}
```

**Error Responses:**
- `400` - Validation error (invalid email, weak password)
- `409` - Email already registered

### User Login

Authenticate and receive access tokens.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "companyId": "company-uuid"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 900,
      "tokenType": "Bearer"
    }
  }
}
```

**Error Responses:**
- `400` - Validation error
- `401` - Invalid credentials

### Logout

Invalidate the current session.

**Endpoint:** `POST /api/auth/logout` (Requires Auth)

**Request Body:**
```json
{
  "refreshToken": "optional-refresh-token-to-revoke"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

---

## API Key Authentication

API keys are used for service-to-service authentication and long-lived access scenarios.

### Create API Key

Generate a new API key with specified permissions.

**Endpoint:** `POST /api/auth/api-keys` (Requires Auth)

**Request Body:**
```json
{
  "name": "Production Integration",
  "permissions": ["read:tasks", "write:tasks", "read:roadmaps"],
  "expiresIn": 2592000,
  "rateLimit": 1000
}
```

**Parameters:**
- `name` (optional): Human-readable identifier
- `permissions` (optional): Array of permission strings
- `expiresIn` (optional): TTL in seconds (minimum 60)
- `rateLimit` (optional): Requests per minute

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "key": "ck_live_abc123xyz789",  // ⚠️ ONLY SHOWN ONCE
    "apiKey": {
      "id": "key-uuid",
      "name": "Production Integration",
      "permissions": ["read:tasks", "write:tasks", "read:roadmaps"],
      "expiresAt": "2026-04-28T12:00:00Z",
      "rateLimit": 1000,
      "createdAt": "2026-03-28T12:00:00Z"
    }
  }
}
```

**⚠️ Important:** The `key` value is only returned once. Store it securely - it cannot be retrieved later.

### List API Keys

List all API keys for the authenticated user.

**Endpoint:** `GET /api/auth/api-keys` (Requires Auth)

**Query Parameters:**
- `limit` (optional): Items per page (default: 50)
- `offset` (optional): Pagination offset

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "key-uuid",
      "name": "Production Integration",
      "permissions": ["read:tasks", "write:tasks"],
      "expiresAt": "2026-04-28T12:00:00Z",
      "rateLimit": 1000,
      "createdAt": "2026-03-28T12:00:00Z",
      "lastUsedAt": "2026-03-28T15:30:00Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

### Revoke API Key

Permanently disable an API key.

**Endpoint:** `DELETE /api/auth/api-keys/:id` (Requires Auth)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "API key revoked successfully"
  }
}
```

---

## Token Refresh Flow

### Refresh Access Token

Obtain a new access token using a refresh token.

**Endpoint:** `POST /api/auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 900,
      "tokenType": "Bearer"
    }
  }
}
```

**Error Responses:**
- `400` - Missing refresh token
- `401` - Invalid or expired refresh token

### Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                        TOKEN LIFECYCLE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    Login/Refresh    ┌──────────────────┐     │
│  │  Client  │◀────────────────────│  Access Token    │     │
│  └────┬─────┘   (15 min expiry)   │  (15 min expiry) │     │
│       │                           └──────────────────┘     │
│       │                                                     │
│       │ Make API Request                                    │
│       │──────────────────────────────────────────────▶     │
│       │                           ┌──────────────────┐     │
│       │                           │  Valid Token?    │     │
│       │◀──────────────────────────│                  │     │
│       │    Return Data            │  Yes: Continue   │     │
│       │                           │  No: 401 Error   │     │
│       │                           └──────────────────┘     │
│       │                                                     │
│       │ Token Expired (401)                                 │
│       │────────────────┐                                    │
│       │                ▼                                    │
│       │    ┌──────────────────────┐                        │
│       │    │ POST /auth/refresh   │                        │
│       │    │ + refreshToken       │                        │
│       │    └──────────────────────┘                        │
│       │                │                                    │
│       │◀───────────────┘  New tokens                        │
│       │                                                     │
└─────────────────────────────────────────────────────────────┘
```

### Token Specifications

| Token Type | Expiry | Usage |
|------------|--------|-------|
| Access Token | 15 minutes (900s) | API requests |
| Refresh Token | 7 days (604800s) | Obtaining new access tokens |
| API Key | Configurable (min 60s) | Service authentication |

---

## Permission Model

### Permission Structure

Permissions follow a resource:action pattern:

```
<resource>:<action>
```

**Resources:**
- `auth` - Authentication operations
- `users` - User management
- `companies` - Company/organization management
- `tasks` - Task operations
- `roadmaps` - Roadmap operations
- `projects` - Project operations
- `issues` - Issue tracking
- `documents` - Document management
- `approvals` - Approval workflows
- `routines` - Scheduled routines
- `billing` - Cost and billing
- `plugins` - Plugin management
- `admin` - Administrative functions

**Actions:**
- `read` - View/list resources
- `write` - Create/update resources
- `delete` - Remove resources
- `admin` - Full control
- `*` - All actions

### Role-Based Permissions

#### System Roles

| Role | Description | Default Permissions |
|------|-------------|---------------------|
| `super_admin` | Platform administrator | `*` (all permissions) |
| `admin` | Company administrator | `*:read`, `*:write`, `admin:read` |
| `manager` | Team manager | `tasks:*`, `roadmaps:*`, `issues:*`, `projects:*` |
| `user` | Standard user | `tasks:read`, `tasks:write`, `roadmaps:read` |
| `viewer` | Read-only access | `*:read` |

#### Company Membership Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full company control, can delete company |
| `admin` | Member management, settings modification |
| `member` | Standard operations within company |
| `viewer` | Read-only access to company resources |

### Checking Permissions

**Get Current User Profile:**

**Endpoint:** `GET /api/auth/me` (Requires Auth)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "auth": {
      "actorType": "user",
      "companyId": "company-uuid",
      "role": "admin",
      "permissions": [
        "tasks:read",
        "tasks:write",
        "roadmaps:read",
        "roadmaps:write",
        "companies:read"
      ]
    }
  }
}
```

---

## Password Management

### Forgot Password

Request a password reset link.

**Endpoint:** `POST /api/auth/forgot-password`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "If an account exists with this email, a password reset link has been sent."
  }
}
```

**Security Note:** This endpoint always returns success to prevent email enumeration attacks.

### Reset Password

Reset password using a reset token.

**Endpoint:** `POST /api/auth/reset-password`

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "password": "NewSecurePassword123!"
}
```

**Validation Rules:**
- `password`: Minimum 12 characters

### Update Profile

Update the current user's profile.

**Endpoint:** `PUT /api/auth/me` (Requires Auth)

**Request Body:**
```json
{
  "name": "Updated Name",
  "email": "newemail@example.com"
}
```

---

## Security Best Practices

### Client Implementation Guidelines

1. **Token Storage**
   - Store access tokens in memory (never localStorage for sensitive apps)
   - Store refresh tokens in httpOnly cookies or secure storage
   - Clear tokens on logout

2. **Token Refresh**
   - Refresh tokens proactively before expiry
   - Implement request queueing during refresh
   - Handle concurrent refresh attempts

3. **API Key Security**
   - Never commit API keys to version control
   - Use environment variables for key storage
   - Rotate keys regularly
   - Use minimal required permissions

4. **Error Handling**
   - Handle 401 errors by attempting token refresh
   - Redirect to login on refresh failure
   - Don't expose sensitive error details to users

### Example Token Refresh Implementation

```javascript
class AuthManager {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.refreshPromise = null;
  }

  async refreshAccessToken() {
    // Prevent concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken })
    })
    .then(response => response.json())
    .then(result => {
      if (result.success) {
        this.accessToken = result.data.tokens.accessToken;
        this.refreshToken = result.data.tokens.refreshToken;
        return this.accessToken;
      }
      throw new Error('Refresh failed');
    })
    .finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  async apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (response.status === 401) {
      // Token expired, try to refresh
      try {
        await this.refreshAccessToken();
        // Retry request with new token
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${this.accessToken}`
          }
        });
      } catch {
        // Refresh failed, redirect to login
        window.location.href = '/login';
      }
    }

    return response;
  }
}
```

---

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `AUTH_REQUIRED` | Authentication required | 401 |
| `INVALID_CREDENTIALS` | Email/password mismatch | 401 |
| `INVALID_TOKEN` | Token is invalid or expired | 401 |
| `TOKEN_EXPIRED` | Token has expired | 401 |
| `INSUFFICIENT_PERMISSIONS` | User lacks required permissions | 403 |
| `VALIDATION_ERROR` | Input validation failed | 400 |
| `EMAIL_EXISTS` | Email already registered | 409 |
| `USER_NOT_FOUND` | User does not exist | 404 |
| `RATE_LIMITED` | Too many requests | 429 |

---

## Related Documentation

- [ENDPOINTS.md](./ENDPOINTS.md) - Complete API endpoint reference
- [ERRORS.md](./ERRORS.md) - Error handling and troubleshooting
- [WEBSOCKET.md](./WEBSOCKET.md) - WebSocket authentication
