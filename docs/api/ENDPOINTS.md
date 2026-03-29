# API Endpoints Reference

Complete reference for all Ckamal REST API endpoints organized by resource.

**Version:** 5.0.0  
**Base URL:** `/api`  
**Last Updated:** 2026-03-28

---

## Table of Contents

1. [Authentication](#authentication)
2. [Companies](#companies)
3. [Billing](#billing)
4. [Issues](#issues)
5. [Documents](#documents)
6. [Approvals](#approvals)
7. [Routines](#routines)
8. [Heartbeat](#heartbeat)
9. [Activity](#activity)
10. [Plugins](#plugins)

---

## Authentication

Base path: `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | No | Register new user |
| POST | `/login` | No | Authenticate user |
| POST | `/logout` | Yes | Logout user |
| POST | `/refresh` | No | Refresh access token |
| POST | `/forgot-password` | No | Request password reset |
| POST | `/reset-password` | No | Reset password |
| GET | `/me` | Yes | Get current user |
| PUT | `/me` | Yes | Update profile |
| POST | `/api-keys` | Yes | Create API key |
| GET | `/api-keys` | Yes | List API keys |
| DELETE | `/api-keys/:id` | Yes | Revoke API key |

### Register

```bash
curl -X POST /api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "name": "John Doe"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "name": "..." },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ...",
      "expiresIn": 900
    }
  }
}
```

### Login

```bash
curl -X POST /api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

---

## Companies

Base path: `/api/companies`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Yes | Create company |
| GET | `/` | Yes | List user companies |
| GET | `/:id` | Yes | Get company details |
| PUT | `/:id` | Yes | Update company |
| DELETE | `/:id` | Yes | Delete company |
| GET | `/:id/members` | Yes | List members |
| POST | `/:id/members` | Yes | Add member |
| DELETE | `/:id/members/:userId` | Yes | Remove member |
| PUT | `/:id/members/:userId` | Yes | Update member role |

### Create Company

```bash
curl -X POST /api/companies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme-corp",
    "description": "Technology company",
    "brandColor": "#FF5733",
    "logoUrl": "https://example.com/logo.png"
  }'
```

**Request Schema:**
```json
{
  "name": "string (1-100 chars, required)",
  "slug": "string (1-50 chars, lowercase alphanumeric with hyphens, optional)",
  "description": "string (max 500 chars, optional)",
  "brandColor": "string (hex color, optional)",
  "logoUrl": "string (URL, optional)",
  "settings": "object (optional)"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "comp-uuid",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "description": "Technology company",
    "brand_color": "#FF5733",
    "logo_url": "https://example.com/logo.png",
    "settings": "{}",
    "status": "active",
    "created_by": "user-uuid",
    "created_at": "2026-03-28T12:00:00Z"
  }
}
```

### List Companies

```bash
curl /api/companies?limit=20&offset=0 \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "comp-uuid",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "membership": {
        "role": "owner",
        "status": "active",
        "joinedAt": "2026-03-28T12:00:00Z"
      }
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

### Add Member

```bash
curl -X POST /api/companies/:id/members \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid",
    "role": "admin",
    "permissions": ["tasks:write", "roadmaps:read"]
  }'
```

**Roles:** `owner`, `admin`, `member`, `viewer`

---

## Billing

Base path: `/api/billing`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/summary` | Yes | Dashboard summary |
| GET | `/costs` | Yes | List cost events |
| GET | `/costs/by-model` | Yes | Costs grouped by model |
| GET | `/costs/by-provider` | Yes | Costs grouped by provider |
| GET | `/costs/by-agent` | Yes | Costs grouped by agent |
| GET | `/budgets` | Yes | List budgets |
| POST | `/budgets` | Yes | Create budget |
| GET | `/budgets/:id` | Yes | Get budget |
| PUT | `/budgets/:id` | Yes | Update budget |
| DELETE | `/budgets/:id` | Yes | Delete budget |
| GET | `/alerts` | Yes | List budget alerts |
| PUT | `/alerts/:id/acknowledge` | Yes | Acknowledge alert |
| GET | `/forecast` | Yes | Spending forecast |

### Get Dashboard Summary

```bash
curl "/api/billing/summary?company_id=123&period_start=2026-03-01&period_end=2026-03-31" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalCost": 125.50,
    "totalTokens": {
      "input": 500000,
      "output": 150000
    },
    "runsCount": 250,
    "averageCostPerRun": 0.50,
    "topModels": [
      { "model": "claude-3-opus", "cost": 75.25 },
      { "model": "claude-3-sonnet", "cost": 50.25 }
    ],
    "dailyCosts": [
      { "date": "2026-03-28", "cost": 12.50, "runs": 25 }
    ]
  }
}
```

### List Costs

```bash
curl "/api/billing/costs?start_date=2026-03-01&end_date=2026-03-31&provider=anthropic&page=1&per_page=50" \
  -H "Authorization: Bearer $TOKEN"
```

**Query Parameters:**
- `start_date` - Filter from date (ISO 8601)
- `end_date` - Filter to date (ISO 8601)
- `company_id` - Filter by company
- `user_id` - Filter by user
- `agent_id` - Filter by agent
- `provider` - Filter by provider (anthropic, openai, etc.)
- `model` - Filter by model
- `operation_type` - Filter by operation
- `page` - Page number
- `per_page` - Items per page (max 100)

### Create Budget

```bash
curl -X POST /api/billing/budgets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monthly AI Budget",
    "scope_type": "company",
    "scope_id": "comp-uuid",
    "period": "monthly",
    "amount": 1000,
    "alert_thresholds": [50, 80, 95]
  }'
```

**Request Schema:**
```json
{
  "name": "string (required)",
  "scope_type": "string (global|company|project|agent, required)",
  "scope_id": "string (optional for global)",
  "period": "string (daily|weekly|monthly|yearly, required)",
  "amount": "number (required)",
  "alert_thresholds": "number[] (optional)",
  "created_by": "number (optional)"
}
```

### Get Forecast

```bash
curl "/api/billing/forecast?days=30&company_id=123&budget_id=budget-uuid" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Issues

Base path: `/api/issues`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Yes | Create issue |
| GET | `/` | Yes | List issues |
| GET | `/search` | Yes | Search issues |
| GET | `/statistics` | Yes | Issue statistics |
| GET | `/unread` | Yes | Get unread issues |
| GET | `/:id` | Yes | Get issue |
| PUT | `/:id` | Yes | Update issue |
| DELETE | `/:id` | Yes | Delete issue |
| POST | `/:id/comments` | Yes | Add comment |
| GET | `/:id/comments` | Yes | List comments |
| PUT | `/:id/comments/:commentId` | Yes | Update comment |
| DELETE | `/:id/comments/:commentId` | Yes | Delete comment |
| POST | `/:id/labels` | Yes | Add label |
| DELETE | `/:id/labels/:labelId` | Yes | Remove label |
| POST | `/:id/assign` | Yes | Assign/unassign |
| POST | `/:id/read` | Yes | Mark as read |

### Create Issue

```bash
curl -X POST /api/issues \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Company-Id: comp-uuid" \
  -d '{
    "title": "Bug: Login fails",
    "description": "Users cannot log in with valid credentials",
    "priority": "high",
    "status": "open",
    "labels": ["bug", "auth"]
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "issue-uuid",
    "title": "Bug: Login fails",
    "description": "Users cannot log in...",
    "priority": "high",
    "status": "open",
    "companyId": "comp-uuid",
    "createdById": "user-uuid",
    "createdAt": "2026-03-28T12:00:00Z",
    "updatedAt": "2026-03-28T12:00:00Z"
  }
}
```

### List Issues

```bash
curl "/api/issues?status=open&priority=high&assigneeId=user-uuid&limit=20&offset=0" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Company-Id: comp-uuid"
```

**Query Parameters:**
- `status` - Filter by status (open, in_progress, resolved, closed)
- `priority` - Filter by priority (low, medium, high, critical)
- `assigneeId` - Filter by assignee
- `assigneeType` - Filter by assignee type (user, agent)
- `search` - Search in title/description
- `label` - Filter by label (can be multiple)
- `orderBy` - Sort field (default: updated_at)
- `orderDirection` - Sort direction (ASC, DESC)

### Assign Issue

```bash
curl -X POST /api/issues/:id/assign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assigneeType": "user",
    "assigneeId": "user-uuid",
    "reason": "Assigned based on expertise"
  }'
```

To unassign, send `null` for `assigneeType` and `assigneeId`.

---

## Documents

Base path: `/api/documents`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Yes | Create document |
| GET | `/` | Yes | List documents |
| GET | `/search` | Yes | Search documents |
| GET | `/statistics` | Yes | Document statistics |
| GET | `/:id` | Yes | Get document |
| PUT | `/:id` | Yes | Update document |
| DELETE | `/:id` | Yes | Delete document |
| GET | `/:id/revisions` | Yes | List revisions |
| GET | `/:id/revisions/:version` | Yes | Get revision |
| POST | `/:id/restore/:version` | Yes | Restore revision |
| GET | `/:id/compare` | Yes | Compare revisions |
| POST | `/:id/share` | Yes | Share document |
| GET | `/:id/shares` | Yes | List shares |
| DELETE | `/:id/shares/:shareId` | Yes | Revoke share |
| POST | `/:id/restore` | Yes | Restore deleted document |

### Create Document

```bash
curl -X POST /api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Company-Id: comp-uuid" \
  -d '{
    "title": "API Documentation",
    "content": "# Introduction\n\nThis document...",
    "format": "markdown",
    "visibility": "company",
    "tags": ["api", "docs"]
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "doc-uuid",
    "title": "API Documentation",
    "content": "# Introduction...",
    "format": "markdown",
    "version": 1,
    "visibility": "company",
    "companyId": "comp-uuid",
    "createdById": "user-uuid",
    "createdAt": "2026-03-28T12:00:00Z"
  }
}
```

### List Revisions

```bash
curl /api/documents/:id/revisions?limit=50&offset=0 \
  -H "Authorization: Bearer $TOKEN"
```

### Compare Revisions

```bash
curl "/api/documents/:id/compare?v1=rev-uuid-1&v2=rev-uuid-2" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "revision1": { "id": "...", "versionNumber": 1, "title": "..." },
    "revision2": { "id": "...", "versionNumber": 2, "title": "..." },
    "diff": {
      "added": ["new line 1", "new line 2"],
      "removed": ["old line 1"],
      "charDiff": 50
    },
    "titleChanged": false
  }
}
```

### Share Document

```bash
curl -X POST /api/documents/:id/share \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetCompanyId": "target-comp-uuid",
    "permission": "read",
    "expiresAt": "2026-12-31T23:59:59Z"
  }'
```

**Permissions:** `read`, `write`

---

## Approvals

Base path: `/api/approvals`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Yes | Create approval |
| GET | `/` | Yes | List approvals |
| GET | `/pending` | Yes | Get pending for user |
| GET | `/:id` | Yes | Get approval |
| POST | `/:id/approve` | Yes | Approve request |
| POST | `/:id/reject` | Yes | Reject request |
| POST | `/:id/request-changes` | Yes | Request changes |
| POST | `/:id/delegate` | Yes | Delegate approval |
| POST | `/:id/comments` | Yes | Add comment |

### Create Approval

```bash
curl -X POST /api/approvals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "comp-uuid",
    "type": "code_change",
    "payload": {
      "file": "src/app.js",
      "changes": "diff content..."
    },
    "requestedByAgentId": "agent-uuid",
    "priority": "high",
    "timeout": 3600,
    "stakeholders": ["user-uuid-1", "user-uuid-2"]
  }'
```

**Approval Types:** `code_change`, `deployment`, `data_access`, `config_change`, `budget_change`

**Priorities:** `low`, `normal`, `high`, `critical`

### List Approvals

```bash
curl "/api/approvals?companyId=comp-uuid&status=pending&type=code_change&limit=50&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

**Query Parameters:**
- `companyId` - Filter by company
- `status` - Filter by status (pending, approved, rejected, changes_requested)
- `type` - Filter by type
- `riskLevel` - Filter by risk (low, medium, high, critical)
- `requestedBy` - Filter by requester

### Approve Request

```bash
curl -X POST /api/approvals/:id/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decidedByUserId": "user-uuid",
    "note": "LGTM, approved for deployment"
  }'
```

### Reject Request

```bash
curl -X POST /api/approvals/:id/reject \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "decidedByUserId": "user-uuid",
    "reason": "Security concerns with the implementation"
  }'
```

---

## Routines

Base path: `/api/routines`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Yes | Create routine |
| GET | `/` | Yes | List routines |
| GET | `/:id` | Yes | Get routine |
| PUT | `/:id` | Yes | Update routine |
| DELETE | `/:id` | Yes | Delete routine |
| POST | `/:id/run` | Yes | Run immediately |
| POST | `/:id/pause` | Yes | Pause routine |
| POST | `/:id/resume` | Yes | Resume routine |
| GET | `/:id/runs` | Yes | List run history |
| GET | `/:id/runs/:runId` | Yes | Get run details |
| POST | `/:id/runs/:runId/retry` | Yes | Retry failed run |
| POST | `/:id/triggers` | Yes | Add trigger |
| GET | `/:id/triggers` | Yes | List triggers |
| DELETE | `/:id/triggers/:triggerId` | Yes | Remove trigger |
| POST | `/:id/agents` | Yes | Assign agent |
| DELETE | `/:id/agents/:agentId` | Yes | Unassign agent |

### Create Routine

```bash
curl -X POST /api/routines \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "comp-uuid",
    "name": "Daily Report Generation",
    "description": "Generate daily analytics reports",
    "priority": "high",
    "concurrencyPolicy": "coalesce_if_active",
    "catchUpPolicy": "skip_missed",
    "maxRetries": 3,
    "timeoutSeconds": 3600,
    "createdByUserId": "user-uuid"
  }'
```

**Concurrency Policies:**
- `allow_multiple` - Allow concurrent runs
- `skip_if_active` - Skip if already running
- `coalesce_if_active` - Queue and run once after current

**Catch-up Policies:**
- `skip_missed` - Skip missed schedules
- `run_once` - Run once for all missed
- `run_all_missed` - Run all missed schedules

**Priorities:** `low`, `medium`, `high`, `critical`

### Add Trigger

```bash
curl -X POST /api/routines/:id/triggers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "cron",
    "cronExpression": "0 9 * * *",
    "timezone": "America/New_York",
    "label": "Daily at 9 AM"
  }'
```

**Trigger Types:**
- `cron` - Schedule-based (requires `cronExpression`)
- `webhook` - HTTP endpoint trigger
- `event` - Event-based (requires `eventType`)
- `manual` - Manual trigger only

---

## Heartbeat

Base path: `/api/heartbeat`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/runs` | Yes | List runs |
| POST | `/runs` | Yes | Create run |
| GET | `/runs/:id` | Yes | Get run |
| POST | `/runs/:id/cancel` | Yes | Cancel run |
| POST | `/runs/:id/retry` | Yes | Retry run |
| GET | `/runs/:id/events` | Yes | Get run events |
| GET | `/runs/:id/log` | Yes | Stream run log (SSE) |
| GET | `/runs/:id/cost` | Yes | Get run cost |
| POST | `/agents/:id/wakeup` | Yes | Wake up agent |
| GET | `/agents/:id/sessions` | Yes | List sessions |
| DELETE | `/agents/:id/sessions/:sessionId` | Yes | Delete session |
| GET | `/costs` | Yes | Cost summary |
| GET | `/health` | Yes | Health check |

### List Runs

```bash
curl "/api/heartbeat/runs?agentId=agent-uuid&status=running&limit=20&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

**Query Parameters:**
- `agentId` - Filter by agent
- `status` - Filter by status (queued, running, succeeded, failed, cancelled, timed_out)
- `invocationSource` - Filter by source (timer, assignment, on_demand, automation)
- `limit` - Max items (1-100)
- `offset` - Pagination offset

### Create Run

```bash
curl -X POST /api/heartbeat/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "invocationSource": "on_demand",
    "triggerDetail": "manual",
    "contextSnapshot": { "task": "analyze-data" }
  }'
```

### Stream Run Log (SSE)

```bash
curl "/api/heartbeat/runs/:id/log?sse=true&follow=true" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream"
```

**SSE Events:**
- `connected` - Connection established
- `log` - Log entry
- `status` - Status update
- `heartbeat` - Keep-alive
- `complete` - Stream complete

### Wake Up Agent

```bash
curl -X POST /api/heartbeat/agents/:id/wakeup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "on_demand",
    "triggerDetail": "manual",
    "reason": "User requested analysis",
    "taskKey": "data-analysis",
    "payload": { "dataset": "sales-q1" }
  }'
```

---

## Activity

Base path: `/api/activity`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Yes | Activity feed |
| GET | `/:id` | Yes | Get single activity |
| GET | `/dashboard` | Yes | Dashboard aggregations |
| GET | `/entity/:type/:id` | Yes | Entity activity |
| GET | `/security` | Yes | Security events |
| GET | `/alerts` | Yes | Anomaly alerts |
| POST | `/alerts/:id/acknowledge` | Yes | Acknowledge alert |
| GET | `/export` | Yes | Export activity |
| POST | `/subscribe` | Yes | WebSocket subscription |

### Get Activity Feed

```bash
curl "/api/activity?companyId=comp-uuid&category=task&severity=info&limit=50&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

**Query Parameters:**
- `companyId` - Filter by company
- `projectId` - Filter by project
- `category` - Filter by category
- `actorId` - Filter by actor
- `actorType` - Filter by actor type (user, agent, system, api_key)
- `entityType` - Filter by entity type
- `entityId` - Filter by entity ID
- `severity` - Filter by severity (debug, info, notice, warning, error, critical, emergency)
- `startDate` - Filter from date
- `endDate` - Filter to date
- `cursor` - Pagination cursor

### Get Dashboard

```bash
curl "/api/activity/dashboard?companyId=comp-uuid&days=7" \
  -H "Authorization: Bearer $TOKEN"
```

### Export Activity

```bash
curl "/api/activity/export?format=csv&startDate=2026-03-01&endDate=2026-03-31&category=security" \
  -H "Authorization: Bearer $TOKEN" \
  --output activity-export.csv
```

**Formats:** `csv`, `json`

---

## Plugins

Base path: `/api/plugins`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Yes | List plugins |
| POST | `/` | Yes | Install plugin |
| GET | `/:id` | Yes | Get plugin details |
| PUT | `/:id` | Yes | Update plugin config |
| DELETE | `/:id` | Yes | Uninstall plugin |
| POST | `/:id/enable` | Yes | Enable plugin |
| POST | `/:id/disable` | Yes | Disable plugin |
| GET | `/:id/logs` | Yes | Get plugin logs |
| POST | `/:id/tools/:toolId` | Yes | Execute tool |

### List Plugins

```bash
curl "/api/plugins?status=active&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

**Query Parameters:**
- `status` - Filter by status (active, inactive, error)

### Install Plugin

```bash
curl -X POST /api/plugins \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "manifestPath": "./plugins/my-plugin/ckamal-plugin.json",
    "autoStart": true,
    "config": {
      "apiEndpoint": "https://api.example.com",
      "timeout": 30000
    }
  }'
```

**Or with inline manifest:**
```json
{
  "manifest": {
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "main": "index.js",
    "capabilities": ["tools"]
  },
  "autoStart": true
}
```

### Execute Tool

```bash
curl -X POST /api/plugins/:id/tools/:toolId \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "query": "search term"
    },
    "agentId": "agent-uuid",
    "runId": "run-uuid",
    "projectId": "project-uuid",
    "userId": "user-uuid"
  }'
```

---

## Common Patterns

### Pagination

Most list endpoints support pagination:

```bash
curl "/api/issues?limit=20&offset=40"  # Page 3 with 20 items per page
```

**Response includes:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 40,
    "hasMore": true
  }
}
```

### Sorting

Many endpoints support sorting:

```bash
curl "/api/issues?orderBy=createdAt&orderDirection=DESC"
```

### Filtering

Use query parameters for filtering:

```bash
curl "/api/billing/costs?provider=anthropic&model=claude-3-opus&start_date=2026-03-01"
```

### Company Scoping

Most endpoints require company context via header or query param:

```bash
# Via header
curl /api/issues -H "X-Company-Id: comp-uuid"

# Via query param
curl "/api/issues?companyId=comp-uuid"
```

---

## Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 10 | 1 minute |
| General API | 1000 | 1 minute |
| WebSocket | 100 | 1 second |

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1711651200
```

---

## Related Documentation

- [AUTHENTICATION.md](./AUTHENTICATION.md) - Authentication flows
- [ERRORS.md](./ERRORS.md) - Error codes and troubleshooting
- [WEBSOCKET.md](./WEBSOCKET.md) - WebSocket real-time API
