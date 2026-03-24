# AMS Unused/Legacy Code Analysis

> **Generated:** 2026-03-23  
> **Analysis Scope:** `e:\Ckamal\src`

---

## 1. LEGACY PATHS & CONFIGURATIONS

### 1.1 Deprecated Folder Paths

| Path | Status | Replacement | Location in Code |
|------|--------|-------------|------------------|
| `projects/get-shit-done/` | Legacy | `data/gsd/` | `src/domains/gsd/config.js:11` |
| `planning/projects/` | Secondary | `data/projects/` | `src/config.js:23` |
| `.git/` inside projects (checkpoint) | Legacy | `data/checkpoints/` | `src/utils/git-checkpoint.js:38-44` |

**Recommendation:** The fallback logic in `gsd/config.js` tries `FALLBACK_GSD_ROOT` only if `DEFAULT_GSD_ROOT` doesn't exist. Consider deprecating fallback in future versions.

---

## 2. POTENTIALLY UNUSED FILES

### 2.1 Analysis & Scanner Modules

| File | Exports | Import Count | Status |
|------|---------|--------------|--------|
| `src/analysis/auto-fix.js` | 1 function | 1 | ~~Verify if actively used~~ ✅ **REMOVED** |
| `src/analysis/codebase-scanner.js` | 7 functions | Low | ~~Check integration points~~ ✅ **REMOVED** |
| `src/analysis/rag-metrics.js` | 4 functions | Medium | Monitor usage |
| `src/analysis/rag-quality.js` | 3 functions | Low | Verify usage |

### 2.2 Runtime Modules

| File | Purpose | Status |
|------|---------|--------|
| `src/runtime/daemon.js` | Daemon mode | ~~Check if integrated~~ ✅ **REMOVED** |
| `src/runtime/client-bridge.js` | Client bridge | ~~Verify references~~ ✅ **REMOVED** |
| `src/runtime/coexistence-manager.js` | Multi-instance | ~~Check actual usage~~ ✅ **REMOVED** |
| `src/runtime/conflict-resolver.js` | Conflict resolution | ~~Verify integration~~ ✅ **REMOVED** |

> **Note:** Весь модуль `src/runtime/` удалён как неиспользуемый.

### 2.3 Performance & Optimization

| File | Purpose | Status |
|------|---------|--------|
| `src/performance/warmup.js` | Cache warmup | ~~Check if called~~ ✅ **REMOVED** |
| `src/performance/optimizer.js` | Performance tuning | ~~Verify usage~~ ✅ **REMOVED** |
| `src/performance/pool.js` | Connection pooling | ~~Check references~~ ✅ **REMOVED** |

> **Note:** Весь модуль `src/performance/` удалён как неиспользуемый.

### 2.4 Intelligence Models

| File | Purpose | Status |
|------|---------|--------|
| `src/intelligence/models/routing-model.js` | ML routing | ~~Verify training pipeline~~ ✅ **REMOVED** |
| `src/intelligence/models/usage-model.js` | Usage prediction | ~~Check if trained~~ ✅ **REMOVED** |

> **Note:** Весь модуль `src/intelligence/models/` удалён как неиспользуемый.

---

## 3. COMMENTED/DISABLED CODE

### 3.1 Checkpoint Mode Legacy

```javascript
// src/utils/git-checkpoint.js:38-44
if (mode === 'project') {
  return {
    gitDir: path.join(projectPath, '.git'),
    workTree: projectPath,
    projectKey: path.basename(projectPath),
    mode: 'project'
  };
}
```
**Status:** Legacy mode, `separate` is default. Consider removal in v4.

### 3.2 PostgreSQL Provider

```javascript
// src/db/providers/postgres.js
```
**Status:** ~~File exists but SQLite is primary. Verify if PostgreSQL path is tested.~~ ✅ **REMOVED**

---

## 4. REDUNDANT CODE PATTERNS

### 4.1 Multiple Config Loading

| Location | Pattern | Note |
|----------|---------|------|
| `src/config.js` | Direct env vars | Primary config |
| `src/config/index.js` | JSON-based config | Secondary loader |
| `src/domains/gsd/config.js` | GSD-specific | Domain-specific |

**Issue:** Config spread across multiple files. Consider consolidation.

### 4.2 Duplicate Constants

| Constant | Locations |
|----------|-----------|
| `AMS_ROOT` | `config.js`, `domains/gsd/config.js` |
| Agent states | `gsd/agent-pool.js`, `gsd/engine.js` |
| Workflow states | `gsd/engine.js`, `gsd/checkpoint.js` |

---

## 5. EMPTY/STUB IMPLEMENTATIONS

### 5.1 Function Stubs

| File | Function | Status |
|------|----------|--------|
| `src/gsd/engine.js` | Task execution | Contains `Math.random` sleep stubs (lines 5-7) |
| `src/tools/claude-api-core.js` | Core API | Verify if superseded by `claude/core/` |

### 5.2 Placeholder Files

| File | Content | Recommendation |
|------|---------|----------------|
| `src/composition/todos-template.js` | 15 lines | Keep - simple but functional |
| `src/validation/safe-id.js` | Small | Verify usage scope |

---

## 6. IMPORT ANALYSIS

### 6.1 Low-Import Modules

Based on grep analysis, files with ≤1 imports:

```
src/analysis/auto-fix.js: 1 import
src/analysis/rag-metrics.js: 4 imports  
src/analysis/rag-quality.js: 7 imports
src/performance/warmup.js: 2 imports
src/runtime/daemon.js: 4 imports
```

### 6.2 Orphaned Exports

Check if these exported functions are actually called:

| Module | Export | Action Needed |
|--------|--------|---------------|
| `src/analysis/index.js` | `autoFix()` | Verify usage |
| `src/utils/cache.js` | `invalidateCachePattern()` | Check calls |
| `src/intelligence/index.js` | Multiple | Audit usage |

---

## 7. DATABASE SCHEMA OBSERVATIONS

### 7.1 Schema Files

| File | Purpose | Auto-Applied |
|------|---------|--------------|
| `src/db/schema.sql` | Main schema | Yes |
| `src/db/schema-batch.sql` | Batch processing | Yes |
| `src/db/thread-schema.sql` | Thread support | ~~Verify usage~~ ✅ **REMOVED** |
| `src/db/message-index-schema.sql` | Message indexing | Yes |
| `src/db/vector-schema.sql` | Vector embeddings | Check if used |

**Question:** Is `thread-schema.sql` still needed with current Claude API?

---

## 8. RECOMMENDATIONS

### 8.1 Short Term (Cleanup)

1. **Remove `FALLBACK_GSD_ROOT`** - Simplify GSD config
2. **Audit `src/analysis/`** - Determine active usage
3. **Check PostgreSQL provider** - Either complete or remove
4. **Verify runtime modules** - Remove if truly unused

### 8.2 Medium Term (Refactoring)

1. **Consolidate configs** - Single source of truth
2. **Merge duplicate constants** - Centralize state definitions
3. **Complete engine implementation** - Remove sleep stubs
4. **Document actual usage** - Add JSDoc with usage examples

### 8.3 Long Term (Architecture)

1. **Remove legacy checkpoint mode** - Keep only `separate`
2. **Clean up analysis modules** - Integrate or remove
3. **Review intelligence models** - Train or remove stubs
4. **Simplify folder structure** - Reduce redundant paths

---

## 9. VERIFICATION COMMANDS

```bash
# Find files with no imports (potential orphans)
grep -r "import.*from.*FILE" src/ | grep -v node_modules

# Find TODO/FIXME comments
grep -r "TODO\|FIXME\|XXX\|HACK" src/ --include="*.js"

# Check for unused exports (requires tooling)
npx unimported

# Find large files with few exports (potential bloat)
wc -l src/**/*.js | sort -n | tail -20
```

---

## 10. SUMMARY STATISTICS

| Category | Count | Notes |
|----------|-------|-------|
| Total JS files analyzed | ~200 | In src/ |
| Total exports | ~400+ | Functions, classes, constants |
| Total imports | ~600+ | Import statements |
| Legacy paths identified | 3 | Can be deprecated |
| Potentially unused files | ~15 | Need verification |
| Duplicate patterns | ~10 | Can be consolidated |

---

*This analysis is based on static code analysis. Dynamic runtime analysis recommended for confirmation.*
