# CogniMesh Migration Guide

**Complete guide for migrating from single-tenant to multi-tenant architecture.**

*Version: 5.0.0*  
*Last Updated: March 28, 2026*

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [Database Migration](#database-migration)
4. [Configuration Migration](#configuration-migration)
5. [Code Migration](#code-migration)
6. [Testing Migration](#testing-migration)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### What Changed

CogniMesh v5.0 introduces **multi-tenant architecture** with company-based data isolation. This enables:

- Multiple organizations on single instance
- Data isolation between companies
- Company-specific configuration
- Role-based access per company

### Migration Scope

| Component | Change Type | Complexity |
|-----------|-------------|------------|
| Database Schema | Major | High |
| Configuration | Moderate | Medium |
| API Authentication | Major | High |
| Authorization | Major | High |
| Controllers | Minor | Low |
| Frontend | Minor | Low |

### Timeline Estimate

| Environment | Estimated Time |
|-------------|----------------|
| Development | 2-4 hours |
| Staging | 4-8 hours |
| Production | 8-16 hours |

---

## Pre-Migration Checklist

### Before You Begin

- [ ] Backup existing database
- [ ] Backup existing configuration
- [ ] Document current customizations
- [ ] Notify users of maintenance window
- [ ] Prepare rollback plan
- [ ] Test migration in staging environment

### Required Tools

```bash
# Verify installed tools
node --version    # >= 18.0.0
npm --version     # >= 9.0.0
sqlite3 --version # Any recent version
```

### Access Requirements

- Database write access
- File system write access
- Administrative access to CogniMesh
- Git repository access (for rollback)

---

## Database Migration

### Step 1: Create Full Backup

```bash
# Stop the application
npm run stop

# Create database backup
cp ./data/cognimesh.db ./data/cognimesh.db.pre-migration-$(date +%Y%m%d-%H%M%S)

# Export data for verification
sqlite3 ./data/cognimesh.db .dump > ./backups/pre-migration-dump.sql
```

### Step 2: Run Migration Scripts

```bash
# Run all pending migrations
npm run db:migrate

# Verify migration status
npm run db:status
```

### Step 3: Create Default Company

```bash
# Start BIOS console
npm run bios:boot

# Create default company
bios> company:create --name "Default Company" --slug default

# Verify company creation
bios> company:list
```

Or via SQL:

```sql
-- Create default company
INSERT INTO companies (name, slug, plan, status, created_at, updated_at)
VALUES ('Default Company', 'default', 'enterprise', 'active', datetime('now'), datetime('now'));

-- Get company ID
SELECT id FROM companies WHERE slug = 'default';
```

### Step 4: Migrate Existing Data

```sql
-- Assign all existing users to default company
UPDATE users SET company_id = (SELECT id FROM companies WHERE slug = 'default');

-- Assign all existing tasks to default company
UPDATE tasks SET company_id = (SELECT id FROM companies WHERE slug = 'default');

-- Assign all existing roadmaps to default company
UPDATE roadmaps SET company_id = (SELECT id FROM companies WHERE slug = 'default');

-- Continue for other tables...
```

### Step 5: Create Company-Specific Records

```sql
-- Create default company settings
INSERT INTO company_settings (company_id, key, value, created_at, updated_at)
VALUES 
  ((SELECT id FROM companies WHERE slug = 'default'), 'max_agents', '50', datetime('now'), datetime('now')),
  ((SELECT id FROM companies WHERE slug = 'default'), 'default_model', 'claude-sonnet-4-6', datetime('now'), datetime('now'));

-- Create default billing settings
INSERT INTO billing_settings (company_id, billing_model, currency, created_at, updated_at)
VALUES ((SELECT id FROM companies WHERE slug = 'default'), 'subscription', 'USD', datetime('now'), datetime('now'));
```

### Step 6: Verify Data Migration

```bash
# Run BIOS diagnostics
npm run bios:diagnose

# Check company data integrity
bios> company:verify --company-id <default-company-id>

# Verify record counts match pre-migration
bios> db:stats
```

---

## Configuration Migration

### Environment Variables

**Old .env (v4.x):**
```bash
# Server
PORT=3000
HOST=localhost
NODE_ENV=development

# Database
DATABASE_PATH=./data/cognimesh.db

# Authentication
JWT_SECRET=your-secret-key
SESSION_SECRET=your-session-secret

# GitHub
GITHUB_TOKEN=ghp_xxx

# AI Clients
ANTHROPIC_API_KEY=sk-ant-xxx
CLAUDE_CLI_PATH=/usr/local/bin/claude
```

**New .env (v5.0):**
```bash
# Server (prefix with COGNIMESH_)
COGNIMESH_PORT=3000
COGNIMESH_HOST=localhost
NODE_ENV=development

# Database
DATABASE_PATH=./data/cognimesh.db
COGNIMESH_DB_POOL_SIZE=10

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRY=1h
REFRESH_TOKEN_EXPIRY=7d
SESSION_SECRET=your-session-secret

# Multi-tenant
DEFAULT_COMPANY_SLUG=default
REQUIRE_COMPANY=true

# GitHub
GITHUB_TOKEN=ghp_xxx

# AI Clients
ANTHROPIC_API_KEY=sk-ant-xxx
CLAUDE_CLI_PATH=/usr/local/bin/claude
KIMI_CLI_PATH=/usr/local/bin/kimi
CODEX_CLI_PATH=/usr/local/bin/codex

# BIOS
BIOS_MODE=OPERATIONAL
MAX_AGENTS=50
```

### Migration Script

```bash
#!/bin/bash
# migrate-env.sh

echo "Migrating environment configuration..."

# Backup old .env
cp .env .env.backup.$(date +%Y%m%d)

# Update variable names
sed -i 's/^PORT=/COGNIMESH_PORT=/' .env
sed -i 's/^HOST=/COGNIMESH_HOST=/' .env

# Add new variables if not present
grep -q "DEFAULT_COMPANY_SLUG" .env || echo "DEFAULT_COMPANY_SLUG=default" >> .env
grep -q "REQUIRE_COMPANY" .env || echo "REQUIRE_COMPANY=true" >> .env
grep -q "BIOS_MODE" .env || echo "BIOS_MODE=OPERATIONAL" >> .env

echo "Environment migration complete!"
echo "Review .env and update any values as needed."
```

---

## Code Migration

### Authentication Middleware

**Old (v4.x):**
```javascript
// middleware/auth.js
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Verify token...
  req.user = decoded;
  next();
}
```

**New (v5.0):**
```javascript
// middleware/auth.js
export function requireAuth(options = {}) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Verify token and load company context
    const authContext = await authService.verifyAccessToken(token);
    req.auth = authContext;
    req.company = await companyService.getCompany(authContext.companyId);
    
    next();
  };
}
```

### Controller Updates

**Old (v4.x):**
```javascript
// controllers/tasks.js
export async function createTask(req, res) {
  const { title, description } = req.body;
  const task = await taskService.create({ title, description });
  res.json(task);
}
```

**New (v5.0):**
```javascript
// controllers/tasks.js
export async function createTask(req, res) {
  const { title, description } = req.body;
  const task = await taskService.create({
    title,
    description,
    companyId: req.auth.companyId,  // Required
    createdBy: req.auth.userId
  });
  res.json(task);
}
```

### Repository Pattern Updates

**Old (v4.x):**
```javascript
// repositories/tasks.js
async create(data) {
  const result = await this.db.run(
    'INSERT INTO tasks (title, description) VALUES (?, ?)',
    [data.title, data.description]
  );
  return this.findById(result.lastID);
}
```

**New (v5.0):**
```javascript
// repositories/tasks.js
async create(data) {
  const result = await this.db.run(
    `INSERT INTO tasks (title, description, company_id, created_by, created_at) 
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [data.title, data.description, data.companyId, data.createdBy]
  );
  return this.findById(result.lastID);
}

async findByCompany(companyId, options = {}) {
  return this.db.all(
    'SELECT * FROM tasks WHERE company_id = ? ORDER BY created_at DESC',
    [companyId]
  );
}
```

### API Client Updates

**Old (v4.x):**
```javascript
// api-client.js
const response = await fetch('/api/tasks', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**New (v5.0):**
```javascript
// api-client.js
const response = await fetch('/api/tasks', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Company-ID': companyId  // Required for multi-tenant
  }
});
```

---

## Testing Migration

### Update Test Fixtures

```javascript
// tests/fixtures/companies.js
export const defaultCompany = {
  id: 1,
  name: 'Test Company',
  slug: 'test-company',
  plan: 'enterprise',
  status: 'active'
};

// tests/fixtures/users.js
export const testUser = {
  id: 1,
  email: 'test@example.com',
  companyId: 1,  // Added
  role: 'admin'
};
```

### Update Test Setup

```javascript
// tests/setup.js
beforeAll(async () => {
  // Create test company
  const company = await companyService.create({
    name: 'Test Company',
    slug: 'test-company'
  });
  
  // Create test user with company
  const user = await authService.register({
    email: 'test@example.com',
    password: 'password123',
    companyId: company.id
  });
  
  // Set up test context
  global.testContext = { company, user };
});
```

### Update API Tests

```javascript
// tests/api/tasks.test.js
describe('Tasks API', () => {
  it('should create task with company context', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Company-ID', testContext.company.id)
      .send({ title: 'Test Task' });
    
    expect(response.status).toBe(201);
    expect(response.body.companyId).toBe(testContext.company.id);
  });
});
```

---

## Rollback Procedures

### Database Rollback

```bash
# Stop application
npm run stop

# Restore database from backup
cp ./data/cognimesh.db.pre-migration-xxx ./data/cognimesh.db

# Rollback migrations (if needed)
npm run db:rollback -- --to 0

# Restart application
npm start
```

### Configuration Rollback

```bash
# Restore .env from backup
cp .env.backup.xxx .env

# Restart application
npm run stop
npm start
```

### Complete Rollback Checklist

- [ ] Stop application
- [ ] Restore database backup
- [ ] Restore configuration files
- [ ] Revert code changes (git)
- [ ] Clear caches and temporary files
- [ ] Restart application
- [ ] Verify rollback success
- [ ] Notify users

---

## Troubleshooting

### Common Issues

#### Issue: "Company not found" error

**Cause:** Company context not set in request

**Solution:**
```javascript
// Ensure company ID is set
req.auth.companyId = decoded.companyId || defaultCompanyId;
```

#### Issue: "Permission denied" for existing users

**Cause:** Users not assigned to company

**Solution:**
```sql
-- Assign users to default company
UPDATE users SET company_id = 1 WHERE company_id IS NULL;
```

#### Issue: "Foreign key constraint failed"

**Cause:** Missing company_id in inserts

**Solution:**
```javascript
// Always include company_id
await db.run(
  'INSERT INTO table (..., company_id) VALUES (?, ?)',
  [..., req.auth.companyId]
);
```

#### Issue: Tests failing after migration

**Cause:** Test fixtures not updated

**Solution:**
1. Update test fixtures with company data
2. Update test setup to create company context
3. Update API calls to include company headers

### Debug Commands

```bash
# Check database schema
sqlite3 ./data/cognimesh.db ".schema"

# Verify company records
sqlite3 ./data/cognimesh.db "SELECT * FROM companies"

# Check user company assignments
sqlite3 ./data/cognimesh.db "SELECT id, email, company_id FROM users"

# Run BIOS diagnostics
npm run bios:diagnose

# Check logs
tail -f logs/error.log
```

---

## Post-Migration Verification

### Checklist

- [ ] Application starts without errors
- [ ] Users can log in
- [ ] Users see only their company's data
- [ ] CRUD operations work for all entities
- [ ] API tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Performance is acceptable
- [ ] Monitoring shows healthy status

### Verification Script

```bash
#!/bin/bash
# verify-migration.sh

echo "Running post-migration verification..."

# Health check
curl -f http://localhost:3000/health || exit 1

# Database check
sqlite3 ./data/cognimesh.db "SELECT COUNT(*) FROM companies" || exit 1

# Run tests
npm run test:unit || exit 1
npm run test:integration || exit 1

echo "✓ Migration verification complete!"
```

---

## Support

### Resources

| Resource | Link |
|----------|------|
| Documentation | [docs/INDEX.md](INDEX.md) |
| API Reference | [API_REFERENCE.md](../API_REFERENCE.md) |
| Troubleshooting | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| GitHub Issues | https://github.com/LastEld/Ckamal/issues |

### Migration Support

For enterprise migration support, contact:
- Email: support@cognimesh.io
- GitHub Discussions: https://github.com/LastEld/Ckamal/discussions

---

<div align="center">

**[Back to Docs](INDEX.md)** · **[Changelog](CHANGELOG_NEW.md)** · **[Quick Start](QUICK_START.md)**

*CogniMesh v5.0 - Multi-tenant AI orchestration platform*

</div>
