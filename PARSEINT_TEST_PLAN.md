# Test Plan: parseInt Fixes Validation

## Overview

This test plan validates the fix for ensuring all `parseInt()` calls use explicit radix parameter (base 10) to prevent unintended octal/hexadecimal parsing and ensure consistent behavior across the CogniMesh platform.

**Test Date:** 2026-03-28  
**Scope:** All JavaScript files using parseInt()  
**Priority:** High - Core configuration and data parsing functionality

---

## Test Categories

### 1. Syntax Checks

#### 1.1 Node.js Syntax Validation
**Objective:** Ensure all modified files have valid JavaScript syntax

| Test ID | Command | Expected Result | Verification |
|---------|---------|-----------------|--------------|
| SYNTAX-001 | `node --check src/config.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-002 | `node --check src/controllers/helpers.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-003 | `node --check src/dashboard/server.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-004 | `node --check src/middleware/auth.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-005 | `node --check src/middleware/auth-permissions.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-006 | `node --check src/bios/update-manager.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-007 | `node --check src/bios/boot-sequence.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-008 | `node --check src/bios/index.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-009 | `node --check src/bios/console.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-010 | `node --check src/controllers/autonomous/intents.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-011 | `node --check src/security/index.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-012 | `node --check src/security/audit-comprehensive.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-013 | `node --check src/cv/factory.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-014 | `node --check src/models/codex/gpt54-client.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-015 | `node --check src/composition/git-checkpoint-gateway.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-016 | `node --check src/tools/definitions/system-tools.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-017 | `node --check src/clients/claude/vscode.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-018 | `node --check scripts/migrate.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-019 | `node --check scripts/backup-verify.js` | No output, exit code 0 | `echo $?` returns 0 |
| SYNTAX-020 | `node --check scripts/backup-restore.js` | No output, exit code 0 | `echo $?` returns 0 |

**Batch Syntax Check:**
```bash
# Check all modified files at once
for file in src/config.js src/controllers/helpers.js src/dashboard/server.js src/middleware/auth.js src/middleware/auth-permissions.js src/bios/update-manager.js src/bios/boot-sequence.js src/bios/index.js src/bios/console.js src/controllers/autonomous/intents.js src/security/index.js src/security/audit-comprehensive.js src/cv/factory.js src/models/codex/gpt54-client.js src/composition/git-checkpoint-gateway.js src/tools/definitions/system-tools.js src/clients/claude/vscode.js scripts/migrate.js scripts/backup-verify.js scripts/backup-restore.js; do
  echo "Checking $file..."
  node --check "$file" || exit 1
done
echo "All syntax checks passed!"
```

---

### 2. Unit Tests

#### 2.1 Execute Unit Test Suite
**Objective:** Verify core functionality with parseInt fixes

| Test ID | Command | Expected Result | Verification |
|---------|---------|-----------------|--------------|
| UNIT-001 | `npm run test:unit` | All tests pass | Exit code 0, no failures |

**Specific Unit Tests to Run:**

| Test ID | Command | Focus Area | Verification |
|---------|---------|------------|--------------|
| UNIT-002 | `node --test tests/unit/utils/validators.test.js` | Validation utilities | Pass with no errors |
| UNIT-003 | `node --test tests/unit/bios/*.test.js` | BIOS core functionality | All bios tests pass |
| UNIT-004 | `node --test tests/unit/middleware/auth.test.js` | Auth middleware | Auth tests pass |
| UNIT-005 | `node --test tests/unit/cv/cv-system.test.js` | CV factory | CV parsing tests pass |
| UNIT-006 | `node --test tests/unit/claude/client.test.js` | Claude client | Client parsing tests pass |
| UNIT-007 | `node --test tests/unit/codex/vscode.test.js` | Codex client | Token/limit parsing |
| UNIT-008 | `node --test tests/unit/gsd/task-manager.test.js` | Task manager | Limit/offset parsing |

**Manual Unit Test for parseInt Behavior:**
```javascript
// Create temporary test file: /tmp/parseInt-test.js
import assert from 'node:assert/strict';

// Test 1: Basic decimal parsing
assert.strictEqual(parseInt('42', 10), 42, 'Basic decimal');
assert.strictEqual(parseInt('007', 10), 7, 'Leading zeros (decimal)');
assert.strictEqual(parseInt('0', 10), 0, 'Zero value');

// Test 2: Fallback behavior
const envValue = undefined;
assert.strictEqual(parseInt(envValue, 10) || 3000, 3000, 'Undefined fallback');

// Test 3: String with whitespace
assert.strictEqual(parseInt('  123  ', 10), 123, 'Whitespace trimming');

// Test 4: Empty/invalid input
assert.ok(Number.isNaN(parseInt('', 10)), 'Empty string is NaN');
assert.ok(Number.isNaN(parseInt('abc', 10)), 'Non-numeric is NaN');

// Test 5: Version parsing (like update-manager)
const version = '5.2.1';
const major = parseInt(version.split('.')[0], 10);
const minor = parseInt(version.split('.')[1] || 0, 10);
assert.strictEqual(major, 5, 'Major version parsing');
assert.strictEqual(minor, 2, 'Minor version parsing');

console.log('✓ All parseInt unit tests passed');
```

Run: `node /tmp/parseInt-test.js`

---

### 3. Integration Tests

#### 3.1 Domain Integration Tests
**Objective:** Verify domain-level functionality with parseInt fixes

| Test ID | Command | Expected Result | Verification |
|---------|---------|-----------------|--------------|
| INT-001 | `npm run test:integration` | All integration tests pass | Exit code 0 |

**Specific Integration Tests:**

| Test ID | Command | Focus Area | Verification |
|---------|---------|------------|--------------|
| INT-002 | `node --test tests/domains/tasks.integration.spec.js` | Task domain | Pagination works |
| INT-003 | `node --test tests/domains/context.integration.spec.js` | Context domain | Context ID parsing |
| INT-004 | `node --test tests/domains/thought.integration.spec.js` | Thought domain | Timestamp parsing |
| INT-005 | `node --test tests/domains/merkle.integration.spec.js` | Merkle tree | Block number parsing |
| INT-006 | `node --test tests/domains/roadmaps.integration.spec.js` | Roadmaps | Priority parsing |

#### 3.2 API Integration Tests
**Objective:** Test API endpoints that use parseInt for pagination/filters

| Test ID | Command | Expected Result | Verification |
|---------|---------|-----------------|--------------|
| INT-007 | `node --test tests/integration/api.test.js` | API endpoints | Pagination params |
| INT-008 | `node --test tests/dashboard-api-integration.test.js` | Dashboard API | Limit parsing |
| INT-009 | `node --test tests/integration/mcp-tools.test.js` | MCP tools | Tool param parsing |

---

### 4. Static Analysis (ESLint)

#### 4.1 ESLint Validation
**Objective:** Ensure code quality and no lint errors

| Test ID | Command | Expected Result | Verification |
|---------|---------|-----------------|--------------|
| LINT-001 | `npm run lint` | No errors, warnings acceptable | Exit code 0 |
| LINT-002 | `npx eslint src/config.js` | No errors | Clean output |
| LINT-003 | `npx eslint src/controllers/helpers.js` | No errors | Clean output |
| LINT-004 | `npx eslint src/dashboard/server.js` | No errors | Clean output |
| LINT-005 | `npx eslint src/bios/` | No errors | All BIOS files clean |
| LINT-006 | `npx eslint src/middleware/` | No errors | Middleware clean |

**Check for parseInt-specific patterns:**
```bash
# Verify NO parseInt without radix (should return empty)
grep -rn "parseInt(" src/ | grep -v "parseInt(.*,.*10)" | grep -v "parseInt(.*,.*)" || echo "✓ All parseInt calls use radix"

# Verify radix 10 is used consistently
grep -rn "parseInt(.*,.*10)" src/ | wc -l
# Expected: Count should match total parseInt occurrences
```

---

### 5. Smoke Tests

#### 5.1 Configuration Loading
**Objective:** Verify config.js loads correctly with parseInt fixes

| Test ID | Command | Expected Result | Verification |
|---------|---------|-----------------|--------------|
| SMOKE-001 | `node -e "import('./src/config.js').then(m => console.log('Config loaded:', m.default?.server?.port || 'OK'))"` | Config loads | No errors, port shown |
| SMOKE-002 | `COGNIMESH_PORT=8080 node -e "import('./src/config.js').then(m => console.log(m.default.server.port))"` | Port: 8080 | Environment var parsed |
| SMOKE-003 | `DB_MAX_CONNECTIONS=20 node -e "import('./src/config.js').then(m => console.log(m.default.database.maxConnections))"` | 20 | DB config parsed |

#### 5.2 BIOS Boot Sequence
**Objective:** Verify BIOS boots correctly

| Test ID | Command | Expected Result | Verification |
|---------|---------|-----------------|--------------|
| SMOKE-004 | `npm run bios:diagnose` | Diagnosis completes | No parseInt errors |
| SMOKE-005 | `timeout 5 npm run bios:boot 2>&1 || true` | Boot starts | No immediate errors |

#### 5.3 Dashboard Server Startup
**Objective:** Verify dashboard server starts

| Test ID | Command | Expected Result | Verification |
|---------|---------|-----------------|--------------|
| SMOKE-006 | `timeout 3 node src/dashboard/server.js 2>&1 || true` | Server starts | Port binding message |

#### 5.4 Helper Functions
**Objective:** Test pagination helpers directly

```javascript
// Create: /tmp/pagination-test.js
import { parsePagination } from './src/controllers/helpers.js';
import assert from 'node:assert/strict';

// Test normal values
const r1 = parsePagination({ limit: '50', offset: '10' });
assert.deepStrictEqual(r1, { limit: 50, offset: 10 });

// Test leading zeros (should be decimal)
const r2 = parsePagination({ limit: '010', offset: '007' });
assert.deepStrictEqual(r2, { limit: 10, offset: 7 });

// Test invalid/empty (should use defaults)
const r3 = parsePagination({ limit: 'invalid', offset: '' });
assert.deepStrictEqual(r3, { limit: 50, offset: 0 });

// Test edge cases
const r4 = parsePagination({ limit: '9999' }, { maxLimit: 100 });
assert.strictEqual(r4.limit, 100, 'Max limit enforced');

console.log('✓ Pagination tests passed');
```

Run: `node /tmp/pagination-test.js`

#### 5.5 Intent Parsing
**Objective:** Test autonomous intent parsing

```javascript
// Create: /tmp/intent-test.js
import { IntentParser } from './src/controllers/autonomous/intents.js';

const parser = new IntentParser();
const result = parser.parse('find 42 items starting from page 007');
console.log('Parsed:', result);
// Verify numbers are parsed correctly (42 and 7, not octal)
```

---

## Test Execution Checklist

### Pre-requisites
- [ ] Node.js 18+ installed (`node --version`)
- [ ] Dependencies installed (`npm ci`)
- [ ] Environment file configured (`.env` exists)

### Execution Order
```bash
# Phase 1: Syntax Checks (Fast)
echo "=== Phase 1: Syntax Checks ==="
for file in src/config.js src/controllers/helpers.js src/dashboard/server.js src/middleware/auth.js src/bios/update-manager.js src/bios/boot-sequence.js src/bios/index.js src/security/index.js src/cv/factory.js; do
  node --check "$file" && echo "✓ $file" || echo "✗ $file FAILED"
done

# Phase 2: Static Analysis
echo "=== Phase 2: Static Analysis ==="
npm run lint

# Phase 3: Unit Tests
echo "=== Phase 3: Unit Tests ==="
npm run test:unit

# Phase 4: Integration Tests
echo "=== Phase 4: Integration Tests ==="
npm run test:integration

# Phase 5: Smoke Tests
echo "=== Phase 5: Smoke Tests ==="
npm run bios:diagnose
```

---

## Expected Results Summary

| Category | Tests | Expected Pass Rate | Critical Issues |
|----------|-------|-------------------|-----------------|
| Syntax Checks | 20 | 100% | 0 |
| Unit Tests | 50+ | 100% | 0 |
| Integration Tests | 25+ | 100% | 0 |
| Static Analysis | 6 | 100% | 0 |
| Smoke Tests | 10 | 100% | 0 |
| **Total** | **110+** | **100%** | **0** |

---

## Failure Handling

### If Syntax Check Fails:
1. Check exact line number from error
2. Verify parseInt syntax: `parseInt(value, 10)`
3. Check for missing closing parentheses

### If Unit Test Fails:
1. Identify failing test file
2. Run individual test: `node --test <file>`
3. Check for parseInt-related assertions

### If Integration Test Fails:
1. Check database connection
2. Verify environment variables
3. Run with DEBUG: `DEBUG=* node --test <file>`

### If Smoke Test Fails:
1. Check port availability
2. Verify `.env` configuration
3. Review error stack trace for parseInt locations

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA Engineer | | | |
| Tech Lead | | | |

---

## Appendix: parseInt Fix Reference

**Before (Incorrect):**
```javascript
port: parseInt(process.env.PORT) || 3000
```

**After (Correct):**
```javascript
port: parseInt(process.env.PORT, 10) || 3000
```

**Files Modified:**
1. `src/config.js` - Environment variable parsing
2. `src/controllers/helpers.js` - Pagination params
3. `src/dashboard/server.js` - Query limits
4. `src/middleware/auth.js` - Token parsing
5. `src/middleware/auth-permissions.js` - Permission IDs
6. `src/bios/update-manager.js` - Version parsing
7. `src/bios/boot-sequence.js` - Node version check
8. `src/bios/index.js` - Configuration
9. `src/bios/console.js` - Log line counts
10. `src/controllers/autonomous/intents.js` - Entity extraction
11. `src/security/index.js` - Scrypt parameters
12. `src/security/audit-comprehensive.js` - Password policy
13. `src/cv/factory.js` - CV field parsing
14. `src/models/codex/gpt54-client.js` - Retry headers
15. `src/composition/git-checkpoint-gateway.js` - File stats
16. `src/tools/definitions/system-tools.js` - Tool params
17. `src/clients/claude/vscode.js` - Content length
18. `scripts/migrate.js` - Migration timestamps
19. `scripts/backup-verify.js` - Backup verification
20. `scripts/backup-restore.js` - Restore timestamps
