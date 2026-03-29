# Error Reference & Troubleshooting

Complete guide to Ckamal API error codes, handling, and troubleshooting.

**Version:** 5.0.0  
**Last Updated:** 2026-03-28

---

## Table of Contents

1. [Error Format](#error-format)
2. [HTTP Status Codes](#http-status-codes)
3. [Error Code Reference](#error-code-reference)
4. [Authentication Errors](#authentication-errors)
5. [Validation Errors](#validation-errors)
6. [Resource Errors](#resource-errors)
7. [Permission Errors](#permission-errors)
8. [Rate Limiting](#rate-limiting)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Debugging Tips](#debugging-tips)

---

## Error Format

All API errors follow a consistent JSON structure:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {},
  "timestamp": "2026-03-28T12:00:00Z",
  "requestId": "req-uuid"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `false` for errors |
| `error` | string | Human-readable description |
| `code` | string | Machine-readable error code |
| `details` | object | Additional context (optional) |
| `timestamp` | string | ISO 8601 timestamp |
| `requestId` | string | Unique request identifier |

### Validation Error Details

Validation errors include detailed field information:

```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": ["email"],
      "message": "Invalid email format",
      "code": "invalid_string"
    },
    {
      "path": ["password"],
      "message": "Must be at least 12 characters",
      "code": "too_small"
    }
  ]
}
```

---

## HTTP Status Codes

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| `200` | OK | Request successful |
| `201` | Created | Resource created successfully |
| `400` | Bad Request | Invalid request format or parameters |
| `401` | Unauthorized | Missing or invalid authentication |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource conflict (e.g., duplicate) |
| `422` | Unprocessable Entity | Semantic validation error |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server-side error |
| `503` | Service Unavailable | Service temporarily unavailable |

---

## Error Code Reference

### Authentication Errors (4xx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | No authentication provided |
| `INVALID_CREDENTIALS` | 401 | Email/password incorrect |
| `INVALID_TOKEN` | 401 | Token is invalid or expired |
| `TOKEN_EXPIRED` | 401 | Token has expired |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions |
| `ACCESS_DENIED` | 403 | Access to resource denied |
| `USER_NOT_FOUND` | 404 | User account not found |
| `EMAIL_EXISTS` | 409 | Email already registered |

### Validation Errors (400)

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Input validation failed |
| `INVALID_JSON` | Request body is not valid JSON |
| `MISSING_REQUIRED` | Required field missing |
| `INVALID_FORMAT` | Invalid data format |
| `INVALID_UUID` | Invalid UUID format |
| `INVALID_EMAIL` | Invalid email format |
| `INVALID_DATE` | Invalid date format |
| `TOO_SHORT` | Value below minimum length |
| `TOO_LONG` | Value exceeds maximum length |
| `INVALID_ENUM` | Value not in allowed set |

### Resource Errors (404-409)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `USER_NOT_FOUND` | 404 | User not found |
| `COMPANY_NOT_FOUND` | 404 | Company not found |
| `TASK_NOT_FOUND` | 404 | Task not found |
| `ISSUE_NOT_FOUND` | 404 | Issue not found |
| `DOCUMENT_NOT_FOUND` | 404 | Document not found |
| `ROUTINE_NOT_FOUND` | 404 | Routine not found |
| `BUDGET_NOT_FOUND` | 404 | Budget not found |
| `ALERT_NOT_FOUND` | 404 | Alert not found |
| `PLUGIN_NOT_FOUND` | 404 | Plugin not found |
| `ALREADY_EXISTS` | 409 | Resource already exists |
| `ALREADY_MEMBER` | 409 | User already a member |
| `SLUG_EXISTS` | 409 | Company slug already taken |
| `PLUGIN_EXISTS` | 409 | Plugin already registered |
| `PLUGIN_NOT_ACTIVE` | 400 | Plugin is not active |

### Company/Membership Errors (403)

| Code | Description |
|------|-------------|
| `NOT_MEMBER` | User is not a company member |
| `CANNOT_REMOVE_OWNER` | Cannot remove company owner |
| `OWNER_REQUIRED` | Owner permission required |
| `ADMIN_REQUIRED` | Admin permission required |

### Server Errors (5xx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INTERNAL_ERROR` | 500 | Internal server error |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `SERVICE_UNAVAILABLE` | 503 | Required service unavailable |
| `LOADER_UNAVAILABLE` | 503 | Plugin loader not available |
| `NOT_IMPLEMENTED` | 501 | Feature not yet implemented |

---

## Authentication Errors

### Missing Authentication

**Request:**
```bash
curl /api/companies
# No Authorization header
```

**Response (401):**
```json
{
  "success": false,
  "error": "Authentication required",
  "code": "AUTH_REQUIRED"
}
```

**Solution:**
```bash
curl /api/companies \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Invalid Token

**Response (401):**
```json
{
  "success": false,
  "error": "Invalid or expired token",
  "code": "INVALID_TOKEN"
}
```

**Causes:**
- Token has expired (15 minutes for access tokens)
- Token was revoked
- Token format is invalid
- Signature verification failed

**Solution:**
1. Check if token is expired
2. Use refresh token to get new access token
3. Re-authenticate if refresh fails

```javascript
// Refresh token flow
const refreshToken = async () => {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  if (response.ok) {
    const { data } = await response.json();
    // Store new tokens
    localStorage.setItem('accessToken', data.tokens.accessToken);
    return data.tokens.accessToken;
  }
  
  // Refresh failed, redirect to login
  window.location.href = '/login';
};
```

### Insufficient Permissions

**Response (403):**
```json
{
  "success": false,
  "error": "Admin or owner permission required",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```

**Common Causes:**
- User is not a company member
- User has wrong role (viewer trying to write)
- Action requires specific permissions

**Solution:**
- Check user's role with `GET /api/auth/me`
- Request appropriate permissions from company admin
- Verify company membership status

---

## Validation Errors

### Field Validation

**Request:**
```bash
curl -X POST /api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "password": "123",
    "name": ""
  }'
```

**Response (400):**
```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": ["email"],
      "message": "Valid email required",
      "code": "invalid_string"
    },
    {
      "path": ["password"],
      "message": "Password must be at least 12 characters",
      "code": "too_small",
      "minimum": 12
    },
    {
      "path": ["name"],
      "message": "Name is required",
      "code": "too_small",
      "minimum": 1
    }
  ]
}
```

### Schema Validation

**Common Validation Rules:**

| Field | Rules |
|-------|-------|
| `email` | Valid email format, unique |
| `password` | Min 12 characters |
| `name` | 1-100 characters |
| `companyId` | Valid UUID |
| `slug` | 1-50 chars, lowercase alphanumeric with hyphens |
| `description` | Max 500 characters |

### Type Validation

**Request:**
```bash
curl -X POST /api/billing/budgets \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "not-a-number",
    "period": "invalid-period"
  }'
```

**Response (400):**
```json
{
  "success": false,
  "error": "Validation failed: amount must be a number, period must be one of: daily, weekly, monthly, yearly",
  "code": "VALIDATION_ERROR"
}
```

---

## Resource Errors

### Not Found

**Request:**
```bash
curl /api/companies/non-existent-id \
  -H "Authorization: Bearer $TOKEN"
```

**Response (404):**
```json
{
  "success": false,
  "error": "Company not found",
  "code": "NOT_FOUND"
}
```

**Causes:**
- Resource ID doesn't exist
- Resource was deleted
- Wrong resource type in URL

### Already Exists

**Request:**
```bash
curl -X POST /api/companies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme", "slug": "existing-slug"}'
```

**Response (409):**
```json
{
  "success": false,
  "error": "Company slug already exists",
  "code": "SLUG_EXISTS"
}
```

**Solution:**
- Use unique identifiers
- Check existence before creating
- Handle conflicts gracefully

---

## Permission Errors

### Company Access

**Response (403):**
```json
{
  "success": false,
  "error": "Access denied to this company",
  "code": "ACCESS_DENIED"
}
```

### Member Operations

**Response (403):**
```json
{
  "success": false,
  "error": "Cannot remove company owner",
  "code": "CANNOT_REMOVE_OWNER"
}
```

**Response (403):**
```json
{
  "success": false,
  "error": "Only company owner can delete the company",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```

### Role Hierarchy

```
owner > admin > member > viewer
```

| Action | Required Role |
|--------|---------------|
| Delete company | `owner` |
| Add/remove members | `admin` or `owner` |
| Update company | `admin` or `owner` |
| View company | Any member |

---

## Rate Limiting

### Rate Limit Headers

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1711654800
X-RateLimit-Retry-After: 60
```

### Rate Limit Exceeded

**Response (429):**
```json
{
  "success": false,
  "error": "Too many requests",
  "code": "RATE_LIMITED",
  "details": {
    "retryAfter": 60,
    "limit": 1000,
    "window": "1 minute"
  }
}
```

### Rate Limits by Endpoint

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 10 | 1 minute |
| General API | 1000 | 1 minute |
| WebSocket | 100 | 1 second |
| Cost tracking | 500 | 1 minute |
| Exports | 10 | 1 hour |

### Handling Rate Limits

```javascript
const apiRequest = async (url, options) => {
  const response = await fetch(url, options);
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('X-RateLimit-Retry-After');
    const delay = parseInt(retryAfter, 10) * 1000;
    
    console.log(`Rate limited. Retrying after ${retryAfter} seconds...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry request
    return apiRequest(url, options);
  }
  
  return response;
};
```

---

## Troubleshooting Guide

### Authentication Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| 401 on all requests | Missing token | Add `Authorization: Bearer <token>` header |
| 401 after some time | Token expired | Implement token refresh |
| 403 on specific endpoints | Wrong permissions | Check user role and permissions |
| Can't refresh token | Refresh token expired | Re-authenticate user |

### API Request Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| 400 Bad Request | Invalid JSON | Check request body format |
| 400 with validation errors | Invalid data | Check field types and constraints |
| 404 Not Found | Wrong ID | Verify resource exists |
| 409 Conflict | Duplicate data | Use unique identifiers |
| 500 Internal Error | Server issue | Retry with exponential backoff |

### WebSocket Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Connection refused | Wrong URL | Check WebSocket endpoint |
| Auth required error | Missing auth | Send auth message after connect |
| Disconnections | Network issues | Implement reconnection logic |
| Missing events | Not subscribed | Subscribe to correct rooms |

### Common Error Scenarios

#### 1. Company Operations

```javascript
// ❌ Wrong: Missing company context
fetch('/api/issues', { headers: { 'Authorization': token } });

// ✅ Correct: Include company ID
fetch('/api/issues', {
  headers: {
    'Authorization': token,
    'X-Company-Id': 'comp-uuid'
  }
});
```

#### 2. Pagination

```javascript
// ❌ Wrong: No pagination
fetch('/api/issues');

// ✅ Correct: Add pagination
fetch('/api/issues?limit=50&offset=0');
```

#### 3. JSON Content-Type

```javascript
// ❌ Wrong: Missing content type
fetch('/api/companies', {
  method: 'POST',
  body: JSON.stringify(data)
});

// ✅ Correct: Include content type
fetch('/api/companies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

---

## Debugging Tips

### Enable Debug Logging

```javascript
// Add request/response logging
const debugFetch = async (url, options) => {
  console.log('→ Request:', url, options);
  const response = await fetch(url, options);
  const cloned = response.clone();
  const body = await cloned.json();
  console.log('← Response:', response.status, body);
  return response;
};
```

### Check Request Details

```bash
# Verbose curl output
curl -v /api/endpoint \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

### Validate Tokens

```bash
# Decode JWT (without verification)
echo $TOKEN | cut -d'.' -f2 | base64 -d | jq .
```

### Check Rate Limits

```bash
# Check current rate limit status
curl -I /api/companies \
  -H "Authorization: Bearer $TOKEN"
```

### Common Header Issues

| Issue | Check |
|-------|-------|
| 401 errors | Is `Bearer` spelled correctly? |
| 400 errors | Is `Content-Type: application/json` set? |
| 403 errors | Is the user a company member? |
| 404 errors | Is the resource ID correct? |

---

## Error Handling Best Practices

### Client-Side Error Handler

```javascript
class ApiError extends Error {
  constructor(message, code, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const handleApiError = async (response) => {
  const error = await response.json();
  
  switch (error.code) {
    case 'AUTH_REQUIRED':
    case 'INVALID_TOKEN':
      // Redirect to login
      window.location.href = '/login';
      break;
      
    case 'INSUFFICIENT_PERMISSIONS':
      // Show permission denied message
      showNotification('Permission denied', 'error');
      break;
      
    case 'VALIDATION_ERROR':
      // Show field errors
      showValidationErrors(error.details);
      break;
      
    case 'RATE_LIMITED':
      // Retry after delay
      await delay(error.details.retryAfter * 1000);
      return retry();
      
    default:
      // Show generic error
      showNotification(error.error, 'error');
  }
  
  throw new ApiError(
    error.error,
    error.code,
    response.status,
    error.details
  );
};
```

### React Error Boundary

```javascript
class ApiErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorDisplay
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
```

---

## Related Documentation

- [AUTHENTICATION.md](./AUTHENTICATION.md) - Authentication flows
- [ENDPOINTS.md](./ENDPOINTS.md) - API endpoints
- [WEBSOCKET.md](./WEBSOCKET.md) - WebSocket errors
