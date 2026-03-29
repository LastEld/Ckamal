# CogniMesh API Examples

Complete code examples for the CogniMesh REST API.

---

## Table of Contents

1. [Authentication Examples](#authentication-examples)
2. [Company Management](#company-management)
3. [Task Management](#task-management)
4. [Roadmap Management](#roadmap-management)
5. [Issue Tracking](#issue-tracking)
6. [Document Management](#document-management)
7. [Billing & Costs](#billing--costs)
8. [GitHub Integration](#github-integration)
9. [Webhooks](#webhooks)
10. [Routines](#routines)
11. [Approvals](#approvals)
12. [Plugins](#plugins)
13. [Common Use Cases](#common-use-cases)

---

## Authentication Examples

### Register a New User

**cURL:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "John Doe"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securepassword123',
    name: 'John Doe'
  })
});

const { data } = await response.json();
const { accessToken, refreshToken } = data.tokens;
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
```

### Login

**cURL:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securepassword123'
  })
});

const { data } = await response.json();
// Store tokens
```

### Refresh Token

**cURL:**
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }'
```

**JavaScript:**
```javascript
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  const response = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  const { data } = await response.json();
  localStorage.setItem('accessToken', data.tokens.accessToken);
  return data.tokens.accessToken;
}
```

### Get Current User

**cURL:**
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  }
});

const { data } = await response.json();
console.log('Current user:', data.user);
```

### Create API Key

**cURL:**
```bash
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key",
    "permissions": ["read", "write"],
    "expiresIn": 2592000
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/api/auth/api-keys', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Production API Key',
    permissions: ['read', 'write'],
    expiresIn: 30 * 24 * 60 * 60 // 30 days
  })
});

const { data } = await response.json();
console.log('API Key (save this!):', data.key);
```

---

## Company Management

### Create Company

**cURL:**
```bash
curl -X POST http://localhost:3000/api/companies \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "description": "A sample company",
    "brandColor": "#FF5733",
    "settings": {}
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/api/companies', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Acme Corp',
    description: 'A sample company',
    brandColor: '#FF5733'
  })
});

const { data } = await response.json();
const companyId = data.id;
```

### List Companies

**cURL:**
```bash
curl "http://localhost:3000/api/companies?limit=20&offset=0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/api/companies?limit=20', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data } = await response.json();
console.log('Companies:', data);
```

### Add Team Member

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/companies/${COMPANY_ID}/members" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid",
    "role": "admin",
    "permissions": ["read", "write", "delete"]
  }'
```

---

## Task Management

### Create Task

**cURL:**
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement authentication",
    "description": "Add JWT-based auth to API endpoints",
    "status": "todo",
    "priority": "urgent_important",
    "tags": ["backend", "security"],
    "dueDate": "2026-04-01T00:00:00Z"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/tasks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Implement authentication',
    description: 'Add JWT-based auth to API endpoints',
    status: 'todo',
    priority: 'urgent_important',
    tags: ['backend', 'security'],
    dueDate: '2026-04-01T00:00:00Z'
  })
});

const { data } = await response.json();
const taskId = data.id;
```

### List Tasks with Filtering

**cURL:**
```bash
# List in-progress tasks
curl "http://localhost:3000/tasks?status=in_progress&priority=urgent_important&page=1&pageSize=20" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# Search tasks
curl "http://localhost:3000/tasks?search=authentication&status=todo" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**JavaScript:**
```javascript
// Get tasks with filters
async function getTasks(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.status) params.append('status', filters.status);
  if (filters.priority) params.append('priority', filters.priority);
  if (filters.search) params.append('search', filters.search);
  params.append('page', filters.page || '1');
  params.append('pageSize', filters.pageSize || '20');
  
  const response = await fetch(`http://localhost:3000/tasks?${params}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { data, pagination } = await response.json();
  return { tasks: data, pagination };
}

// Usage
const { tasks } = await getTasks({
  status: 'in_progress',
  priority: 'urgent_important'
});
```

### Get Eisenhower Matrix

**cURL:**
```bash
curl http://localhost:3000/tasks/matrix \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/tasks/matrix', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data } = await response.json();
console.log('Q1 (Do First):', data.Q1);
console.log('Q2 (Schedule):', data.Q2);
console.log('Q3 (Delegate):', data.Q3);
console.log('Q4 (Eliminate):', data.Q4);
```

### Update Task

**cURL:**
```bash
curl -X PATCH "http://localhost:3000/tasks/${TASK_ID}" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed",
    "progress": 100
  }'
```

**JavaScript:**
```javascript
async function updateTask(taskId, updates) {
  const response = await fetch(`http://localhost:3000/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  return response.json();
}

// Mark as completed
await updateTask(taskId, {
  status: 'completed',
  progress: 100
});
```

### Get Next Actions

**cURL:**
```bash
curl "http://localhost:3000/tasks/next-actions?limit=5" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

## Roadmap Management

### Create Roadmap

**cURL:**
```bash
curl -X POST http://localhost:3000/roadmaps \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Q1 2024 Product Roadmap",
    "description": "First quarter development goals",
    "owner": "user_id",
    "startDate": "2026-01-01T00:00:00Z",
    "endDate": "2026-03-31T23:59:59Z",
    "initialNodes": [
      {
        "type": "milestone",
        "title": "MVP Launch",
        "description": "Launch minimum viable product"
      },
      {
        "type": "feature",
        "title": "User Authentication",
        "description": "Implement login and signup"
      }
    ]
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/roadmaps', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Q1 2024 Product Roadmap',
    description: 'First quarter development goals',
    owner: userId,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-03-31T23:59:59Z',
    initialNodes: [
      { type: 'milestone', title: 'MVP Launch' },
      { type: 'feature', title: 'User Authentication' }
    ]
  })
});
```

### Track Progress

**cURL:**
```bash
curl -X POST "http://localhost:3000/roadmaps/${ROADMAP_ID}/progress" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "nodeProgress": [
      { "nodeId": "node_1", "progress": 100, "status": "completed" },
      { "nodeId": "node_2", "progress": 50, "status": "in_progress" }
    ]
  }'
```

---

## Issue Tracking

### Create Issue

**cURL:**
```bash
curl -X POST http://localhost:3000/api/issues \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Bug in authentication",
    "description": "Users cannot login with correct credentials",
    "status": "open",
    "priority": "high",
    "labels": ["bug", "auth"],
    "companyId": "company_id"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/api/issues', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Bug in authentication',
    description: 'Users cannot login with correct credentials',
    status: 'open',
    priority: 'high',
    labels: ['bug', 'auth'],
    companyId
  })
});
```

### List Issues with Filters

**cURL:**
```bash
curl "http://localhost:3000/api/issues?status=open&priority=high&limit=50" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Add Comment

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/issues/${ISSUE_ID}/comments" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "content": "I can reproduce this. Looking into it.",
    "authorType": "user"
  }'
```

### Assign Issue

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/issues/${ISSUE_ID}/assign" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "assigneeType": "user",
    "assigneeId": "user_id",
    "reason": "Assigned based on expertise"
  }'
```

**Unassign:**
```bash
curl -X POST "http://localhost:3000/api/issues/${ISSUE_ID}/assign" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "assigneeType": null,
    "assigneeId": null
  }'
```

---

## Document Management

### Create Document

**cURL:**
```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API Documentation",
    "content": "# API Docs\n\nThis is the documentation...",
    "format": "markdown",
    "status": "draft",
    "visibility": "private",
    "tags": ["api", "docs"]
  }'
```

### Search Documents

**cURL:**
```bash
curl "http://localhost:3000/api/documents/search?q=authentication&limit=20" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**JavaScript:**
```javascript
async function searchDocuments(query) {
  const response = await fetch(
    `http://localhost:3000/api/documents/search?q=${encodeURIComponent(query)}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  const { data } = await response.json();
  return data;
}
```

### Share Document

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/documents/${DOC_ID}/share" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "targetCompanyId": "other_company_id",
    "permission": "read",
    "expiresAt": "2026-12-31T23:59:59Z"
  }'
```

### Restore Previous Version

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/documents/${DOC_ID}/restore/3" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

## Billing & Costs

### Get Dashboard Summary

**cURL:**
```bash
curl "http://localhost:3000/api/billing/summary?company_id=1&days=30" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**JavaScript:**
```javascript
const response = await fetch(
  'http://localhost:3000/api/billing/summary?company_id=1&days=30',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

const { data } = await response.json();
console.log('Total Cost:', data.totalCost);
console.log('By Model:', data.byModel);
console.log('By Provider:', data.byProvider);
```

### Get Costs by Model

**cURL:**
```bash
curl "http://localhost:3000/api/billing/costs/by-model?start_date=2026-03-01&end_date=2026-03-31" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Create Budget

**cURL:**
```bash
curl -X POST http://localhost:3000/api/billing/budgets \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monthly API Budget",
    "scope_type": "company",
    "period": "monthly",
    "amount": 1000.00,
    "created_by": 1
  }'
```

### Get Spending Forecast

**cURL:**
```bash
curl "http://localhost:3000/api/billing/forecast?days=30&company_id=1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

## GitHub Integration

### List Repositories

**cURL:**
```bash
curl "http://localhost:3000/api/github/repos?type=all&sort=updated&limit=30" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Create Issue

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/github/repos/${OWNER}/${REPO}/issues" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Bug: Authentication fails",
    "body": "## Description\n\nUsers cannot login...",
    "labels": ["bug", "high-priority"],
    "assignees": ["username"]
  }'
```

### Sync Issues

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/github/repos/${OWNER}/${REPO}/issues/sync" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "direction": "bidirectional",
    "syncComments": true,
    "companyId": "company_id"
  }'
```

### Create Pull Request

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/github/repos/${OWNER}/${REPO}/pulls" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix authentication bug",
    "body": "This PR fixes the login issue...",
    "head": "feature-branch",
    "base": "main",
    "draft": false
  }'
```

### Merge Pull Request

**cURL:**
```bash
curl -X PUT "http://localhost:3000/api/github/repos/${OWNER}/${REPO}/pulls/42/merge" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "commitTitle": "Merge pull request #42",
    "commitMessage": "Fix authentication bug",
    "mergeMethod": "squash"
  }'
```

---

## Webhooks

### Create Webhook

**cURL:**
```bash
curl -X POST http://localhost:3000/api/webhooks \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "company_id",
    "url": "https://example.com/webhook",
    "eventTypes": ["task.completed", "issue.created", "approval.requested"],
    "name": "Production Webhook",
    "description": "Webhook for production events",
    "signingAlgorithm": "hmac-sha256",
    "active": true,
    "retryCount": 3
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/api/webhooks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    companyId,
    url: 'https://example.com/webhook',
    eventTypes: ['task.completed', 'issue.created'],
    name: 'Production Webhook',
    active: true,
    retryCount: 3
  })
});

const { data } = await response.json();
console.log('Webhook secret (save this!):', data.secret);
```

### Test Webhook

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/webhooks/${WEBHOOK_ID}/test" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "company_id",
    "eventType": "task.completed"
  }'
```

---

## Routines

### Create Routine

**cURL:**
```bash
curl -X POST http://localhost:3000/api/routines \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "company_id",
    "name": "Daily Report Generation",
    "description": "Generate daily analytics report",
    "priority": "medium",
    "concurrencyPolicy": "coalesce_if_active",
    "maxRetries": 3
  }'
```

### Add Cron Trigger

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/routines/${ROUTINE_ID}/triggers" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "company_id",
    "kind": "cron",
    "cronExpression": "0 9 * * MON",
    "timezone": "America/New_York",
    "label": "Monday morning"
  }'
```

### Run Routine Now

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/routines/${ROUTINE_ID}/run" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "company_id",
    "payload": { "reportType": "summary" },
    "triggeredBy": "user_id"
  }'
```

---

## Approvals

### Request Approval

**cURL:**
```bash
curl -X POST http://localhost:3000/api/approvals \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "company_id",
    "type": "code_change",
    "payload": {
      "file": "src/auth.js",
      "changes": "diff content..."
    },
    "requestedByAgentId": "agent_id",
    "priority": "high",
    "timeout": 86400,
    "stakeholders": ["user1", "user2"]
  }'
```

### Approve Request

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/approvals/${APPROVAL_ID}/approve" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "decidedByUserId": "user_id",
    "note": "Approved after review"
  }'
```

### Reject Request

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/approvals/${APPROVAL_ID}/reject" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "decidedByUserId": "user_id",
    "reason": "Needs more testing"
  }'
```

---

## Plugins

### Install Plugin

**cURL:**
```bash
curl -X POST http://localhost:3000/api/plugins \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "manifestPath": "./plugins/my-plugin/ckamal-plugin.json",
    "source": "local",
    "autoStart": true
  }'
```

### Enable/Disable Plugin

**cURL:**
```bash
# Enable
curl -X POST "http://localhost:3000/api/plugins/${PLUGIN_ID}/enable" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# Disable
curl -X POST "http://localhost:3000/api/plugins/${PLUGIN_ID}/disable" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{ "graceful": true }'
```

### Execute Plugin Tool

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/plugins/${PLUGIN_ID}/tools/${TOOL_ID}" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": { "input": "test data" },
    "agentId": "agent_id",
    "projectId": "project_id"
  }'
```

---

## Common Use Cases

### Complete Authentication Flow

```javascript
class CogniMeshClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('accessToken');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    if (response.status === 401) {
      // Token expired, try to refresh
      await this.refreshToken();
      return this.request(endpoint, options);
    }
    
    return response.json();
  }

  async login(email, password) {
    const { data } = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    this.token = data.tokens.accessToken;
    localStorage.setItem('accessToken', this.token);
    localStorage.setItem('refreshToken', data.tokens.refreshToken);
    
    return data;
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    const { data } = await this.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken })
    });
    
    this.token = data.tokens.accessToken;
    localStorage.setItem('accessToken', this.token);
  }
}

// Usage
const client = new CogniMeshClient();
await client.login('user@example.com', 'password');
```

### Task Management Workflow

```javascript
// Create task → Assign → Update progress → Complete
async function taskWorkflow() {
  // 1. Create task
  const { data: task } = await client.request('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Implement feature X',
      description: 'Add new functionality',
      priority: 'urgent_important',
      status: 'todo'
    })
  });
  
  // 2. Update to in progress
  await client.request(`/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'in_progress',
      progress: 25
    })
  });
  
  // 3. Complete task
  await client.request(`/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'completed',
      progress: 100
    })
  });
  
  return task;
}
```

### GitHub Issue Sync

```javascript
async function syncGitHubIssues(owner, repo, companyId) {
  const { data } = await client.request(
    `/api/github/repos/${owner}/${repo}/issues/sync`,
    {
      method: 'POST',
      body: JSON.stringify({
        direction: 'bidirectional',
        syncComments: true,
        companyId
      })
    }
  );
  
  console.log('Synced:', {
    toGitHub: data.toGitHub,
    fromGitHub: data.fromGitHub,
    errors: data.errors
  });
  
  return data;
}
```

### Batch Operations

```javascript
// Create multiple tasks
async function createTasksBatch(tasks) {
  const promises = tasks.map(task => 
    client.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(task)
    })
  );
  
  const results = await Promise.allSettled(promises);
  
  return results.map((result, index) => ({
    task: tasks[index],
    success: result.status === 'fulfilled',
    data: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason : null
  }));
}

// Usage
const tasks = [
  { title: 'Task 1', priority: 'high' },
  { title: 'Task 2', priority: 'medium' },
  { title: 'Task 3', priority: 'low' }
];

const results = await createTasksBatch(tasks);
```

### WebSocket Real-time Updates

```javascript
class CogniMeshWebSocket {
  constructor(url, token) {
    this.ws = new WebSocket(url);
    this.token = token;
    this.subscriptions = new Map();
    
    this.ws.onopen = () => {
      // Authenticate
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: this.token
      }));
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
  }
  
  handleMessage(message) {
    switch (message.type) {
      case 'auth_success':
        console.log('WebSocket authenticated');
        break;
      case 'activity:new':
        console.log('New activity:', message.activity);
        break;
      case 'tool_result':
        const callback = this.subscriptions.get(message.requestId);
        if (callback) callback(message.result);
        break;
    }
  }
  
  subscribe(room) {
    this.ws.send(JSON.stringify({
      type: 'subscribe',
      room
    }));
  }
  
  executeTool(toolName, params, requestId) {
    return new Promise((resolve) => {
      this.subscriptions.set(requestId, resolve);
      
      this.ws.send(JSON.stringify({
        type: 'execute_tool',
        toolName,
        params,
        requestId
      }));
    });
  }
}

// Usage
const ws = new CogniMeshWebSocket('ws://localhost:8080/ws', token);
ws.subscribe('tasks');
ws.subscribe('activity');

const result = await ws.executeTool('task_create', {
  title: 'New Task'
}, 'req_123');
```

### Error Handling Pattern

```javascript
async function apiCallWithRetry(apiCall, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await apiCall();
      
      if (!response.success) {
        throw new Error(response.errors?.[0]?.message || 'API error');
      }
      
      return response.data;
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Usage
const task = await apiCallWithRetry(() => 
  client.request('/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: 'Important Task' })
  })
);
```
