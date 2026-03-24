# AMS (Agent Management System) - Required Folders Analysis

> **Generated:** 2026-03-23  
> **Project Root:** `e:\Ckamal`  
> **Source:** `e:\Ckamal\src`

---

## Executive Summary

Based on comprehensive code analysis of the AMS project, the system requires **28+ distinct folder types** organized across multiple categories:
- **Core Data Folders** (created by system)
- **Configuration Folders** (user/CI managed)
- **Runtime State Folders** (created by system)
- **Project Workspace Folders** (mixed)
- **Temporary/Cache Folders** (system managed)

---

## 1. MUST HAVE - Critical System Folders

These folders are **essential** for AMS to function properly. System will create them automatically on first run.

### 1.1 Database & Core Data

| Folder | Purpose | Created By | Configurable |
|--------|---------|------------|--------------|
| `data/` | Main data directory for all persistent storage | System | `AMS_ROOT` |
| `data/locks/` | Runtime lock files (PID locks, startup locks, DB init locks) | System | Fixed |
| `data/state/` | Domain state persistence (integrations, agent pools, workflows, checkpoints) | System | Fixed |
| `data/state/agent-pools/` | Agent pool registry persistence | System | Fixed |
| `data/state/agents/` | Individual agent state storage | System | Fixed |
| `data/state/checkpoints/` | GSD workflow checkpoints | System | Fixed |
| `data/state/workflows/` | Workflow state persistence | System | Fixed |
| `data/state/retention-policies.json` | Retention policy state file | System | `AMS_RETENTION_STATE_FILE` |
| `data/uploads/` | File upload storage for Claude files API | System | `AMS_FILE_UPLOAD_DIR` |

### 1.2 Git Checkpoints (Project Snapshots)

| Folder | Purpose | Created By | Configurable |
|--------|---------|------------|--------------|
| `data/checkpoints/` | Git-based project checkpoints (separate mode) | System | `AMS_CHECKPOINT_DIR` |
| `data/ams-checkpoint-ignore.txt` | Global ignore patterns for checkpoints | System | `AMS_CHECKPOINT_IGNORE` |

### 1.3 Projects & Planning

| Folder | Purpose | Created By | Configurable |
|--------|---------|------------|--------------|
| `data/projects/` | Runtime project storage | System | `AMS_RUNTIME_PROJECTS_DIR` |
| `.planning/` | Generated plans, phase documents | System | `AMS_PLANNING_ROOT` |
| `planning/projects/` | Project artifacts and metadata | System | `AMS_PROJECT_ARTIFACTS_DIR` |

### 1.4 Configuration

| Folder | Purpose | Created By | Configurable |
|--------|---------|------------|--------------|
| `config/` | Configuration files (default.json, schema.json, env configs) | User/CI | Fixed |
| `config/.config-baseline` | Config drift detection baseline | System | Fixed |

---

## 2. SHOULD HAVE - Important Operational Folders

These folders enhance functionality but system can operate with defaults.

### 2.1 GSD (Get Shit Done) System

| Folder | Purpose | Created By | Configurable |
|--------|---------|------------|--------------|
| `data/gsd/` | GSD system root (preferred) | System | `GSD_ROOT` |
| `projects/get-shit-done/` | Fallback GSD location | System | `GSD_ROOT` |

### 2.2 Database Variants

| Folder | Purpose | Created By | Configurable |
|--------|---------|------------|--------------|
| `data/ams.db` | SQLite database file (default) | System | `AMS_DB_PATH` |
| Custom DB path | PostgreSQL or other DB locations | User | `AMS_DATABASE_URL` |

### 2.3 Agent System

| Folder | Purpose | Created By | Notes |
|--------|---------|------------|-------|
| `.agents/` | Agent skills, spawns, handoff documents | User/CI | Already exists |
| `.agents/skills/` | Skill definitions (SKILL.md files) | User/CI | Already exists |
| `.agents/spawns/` | Spawn reports and batch outputs | System | Auto-created |

---

## 3. NICE TO HAVE - Optional/Feature-Specific Folders

### 3.1 Archive & Cleanup

| Folder | Purpose | Created By | Notes |
|--------|---------|------------|-------|
| `archive/` | Archived projects and data | Retention system | Created during cleanup |
| `archive/invalid/` | Invalid roadmap imports | System | Auto-created |
| `archive/duplicate/` | Duplicate roadmap imports | System | Auto-created |
| `archive/unmapped/` | Unmapped roadmap imports | System | Auto-created |

### 3.2 Temporary & Cache

| Folder | Purpose | Created By | Notes |
|--------|---------|------------|-------|
| `.tmp/` | Temporary files during atomic writes | System | Created on-demand |
| `cache/` | LRU cache persistence (if enabled) | System | Memory-first |
| `logs/` | Application logs (if file logging enabled) | System | Optional |

### 3.3 Dashboard & UI

| Folder | Purpose | Created By | Notes |
|--------|---------|------------|-------|
| `dashboard/` | Web dashboard files | Source | Static files in src/ |
| `dashboard/public/` | Public assets | Source | Already in src/ |

### 3.4 Version Control

| Folder | Purpose | Created By | Notes |
|--------|---------|------------|-------|
| `.git/` | AMS repository itself | User/CI | Already exists |
| `.github/` | GitHub Actions, templates | User/CI | Optional |
| `.spec/` | SPEC driven development structure | User/CI | New - SPEC docs |

---

### 3.5 SPEC Driven Development

| Folder | Purpose | Created By | Notes |
|--------|---------|------------|-------|
| `.spec/` | Root for all specification documents | User/CI | Created 2026-03-23 |
| `.spec/requirements/` | Functional & non-functional requirements | User/CI | Feature requirements |
| `.spec/architecture/` | Architecture Decision Records (ADR) | User/CI | System design |
| `.spec/design/` | Design documents | User/CI | Technical design |
| `.spec/features/` | Feature specifications | User/CI | Feature specs |
| `.spec/api/` | API specifications | User/CI | API contracts |
| `.spec/acceptance/` | Acceptance criteria | User/CI | Test criteria |
| `.spec/domains/` | Domain specifications | User/CI | Domain logic |

---

## 4. PER-PROJECT FOLDERS

When creating a new project via AMS, the following structure is created:

```
{PROJECT_PATH}/
├── TODOS.md              # Task tracking file
├── README.md             # Project documentation
├── .planning/            # Phase plans (symlinked to global .planning)
│   ├── PLAN-phase-0.md
│   ├── PLAN-phase-1.md
│   └── ...
└── .git/                 # Either user's repo OR AMS checkpoint
```

---

## 5. ENVIRONMENT VARIABLES FOR PATHS

Complete list of environment variables affecting folder locations:

| Variable | Default | Description |
|----------|---------|-------------|
| `AMS_ROOT` | `path.resolve(__dirname, "..")` | Root directory of AMS installation |
| `AMS_RUNTIME_PROJECTS_DIR` | `$AMS_ROOT/data/projects` | Runtime project storage |
| `AMS_PROJECT_ARTIFACTS_DIR` | `$AMS_ROOT/planning/projects` | Project artifact directory |
| `AMS_CHECKPOINT_DIR` | `$AMS_ROOT/data/checkpoints` | Git checkpoint storage (separate mode) |
| `AMS_CHECKPOINT_IGNORE` | `$AMS_ROOT/data/ams-checkpoint-ignore.txt` | Checkpoint ignore file |
| `AMS_DB_PATH` | `$AMS_ROOT/data/ams.db` | SQLite database path |
| `AMS_DATABASE_URL` | - | PostgreSQL/other connection string |
| `AMS_PLANNING_ROOT` | `$AMS_ROOT/.planning` | Planning documents root |
| `GSD_ROOT` | `$AMS_ROOT/data/gsd` | GSD system root |
| `AMS_GSD_STATE_FILE` | `$AMS_ROOT/data/state/gsd-state.json` | GSD state file |
| `AMS_FILE_UPLOAD_DIR` | `$AMS_ROOT/data/uploads` | File upload directory |
| `AMS_RETENTION_STATE_FILE` | `$AMS_ROOT/data/state/retention-policies.json` | Retention policies |
| `AMS_WATCH_PROJECTS_FILE` | `$AMS_ROOT/config/watch-projects.json` | Watcher configuration |
| `AMS_CHECKPOINT_MODE` | `separate` | `separate`, `project`, or `off` |

---

## 6. FOLDER CREATION TIMELINE

### During Server Startup
1. `data/locks/` - Created by startup-lock.js and runtime-pid-lock.js
2. `data/state/` - Created by various domain initializers
3. Database initialized - SQLite creates `data/ams.db` (or `:memory:` for tests)

### On First Tool Call
4. `data/projects/` - Created when first project is registered
5. `.planning/` - Created when first plan is generated

### During GSD Workflow
6. `data/state/workflows/` - Created by workflow engine
7. `data/state/checkpoints/` - Created by checkpoint system
8. `data/state/agent-pools/` - Created by agent pool manager

### During File Operations
9. `data/uploads/` - Created when first file is uploaded
10. `data/checkpoints/` - Created for git-based project checkpoints

---

## 7. PERMISSION REQUIREMENTS

| Folder | Minimum Permissions | Notes |
|--------|---------------------|-------|
| `data/` | 755 (rwxr-xr-x) | Must be writable by AMS process |
| `data/locks/` | 755 | Lock files created with 644 |
| `data/state/` | 755 | State files created with 644 |
| `data/checkpoints/` | 755 | Git repos created with standard git permissions |
| `.planning/` | 755 | Plan files created with 644 |
| `config/` | 755 | Configs should be 644, readable by AMS |

---

## 8. STORAGE RECOMMENDATIONS

| Folder Type | Recommended Location | Backup Priority |
|-------------|---------------------|-----------------|
| `data/ams.db` | SSD (fast I/O) | **Critical** |
| `data/checkpoints/` | Same disk as projects | High |
| `.planning/` | SSD | Medium |
| `data/state/` | SSD | Medium |
| `data/uploads/` | Large storage | Low |
| `archive/` | Cold storage (HDD/S3) | Optional |

---

## 9. UNUSUED/DEPRECATED CODE ANALYSIS

### 9.1 Potentially Unused Files

Based on grep analysis, the following files may have limited usage:

| File | Status | Notes |
|------|--------|-------|
| `src/analysis/auto-fix.js` | Check imports | Only 1 import reference |
| `src/analysis/codebase-scanner.js` | Check usage | Legacy analysis tools |
| `src/performance/warmup.js` | Verify calls | Performance optimization |
| `src/runtime/daemon.js` | Verify integration | Daemon mode (may be unused) |
| `src/runtime/client-bridge.js` | Check references | Client bridge pattern |

### 9.2 Legacy Code Patterns

- **FALLBACK_GSD_ROOT**: `projects/get-shit-done/` - Legacy path, superseded by `data/gsd/`
- **Project mode checkpoints**: `AMS_CHECKPOINT_MODE=project` - Legacy mode, `separate` is preferred
- **Postgres provider**: `src/db/providers/postgres.js` - Mostly SQLite is used

### 9.3 Empty/Light Files

| File | Lines | Description |
|------|-------|-------------|
| `src/composition/todos-template.js` | 15 | Simple template function |
| `src/validation/safe-id.js` | Small | ID validation utilities |

---

## 10. QUICK SETUP CHECKLIST

For a new AMS installation, ensure these folders exist:

```bash
# MUST HAVE
mkdir -p data/locks
mkdir -p data/state
mkdir -p data/projects
mkdir -p .planning
mkdir -p config

# SHOULD HAVE
mkdir -p data/gsd
mkdir -p data/uploads
mkdir -p data/checkpoints

# NICE TO HAVE
mkdir -p archive
mkdir -p logs
```

Or run AMS once - it will create all required folders automatically.

---

## 11. DIAGNOSTIC COMMANDS

```bash
# Check folder structure
find $AMS_ROOT -type d -name "data" -o -name ".planning" -o -name "config" | head -20

# Check disk usage
du -sh data/ .planning/ config/ 2>/dev/null

# Verify permissions
ls -la $AMS_ROOT/data/

# Check for missing folders
node -e "const fs=require('fs'); ['data','.planning','config'].forEach(d => console.log(d, fs.existsSync(d)));
```

---

## Appendix: Code References

### Key Files Defining Folder Paths

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/config.js` | 15-28 | Core path definitions |
| `src/domains/gsd/config.js` | 8-22 | GSD-specific paths |
| `src/db/bootstrap.js` | 22-28 | Database path |
| `src/middleware/startup-lock.js` | 10 | Lock file path |
| `src/middleware/runtime-pid-lock.js` | 5 | PID file path |
| `src/utils/git-checkpoint.js` | 17, 52 | Checkpoint paths |
| `src/gsd/checkpoint.js` | 25 | GSD checkpoint dir |
| `src/gsd/agent-pool.js` | 36-37 | Agent storage dirs |
| `src/gsd/engine.js` | 50 | Workflow storage dir |
| `src/claude/files/handler.js` | 79-80 | Upload directory |
| `src/domains/retention/index.js` | 19-21 | Retention state path |
| `src/domains/integrations/index.js` | 101-102 | Integrations state |

---

*This document is auto-generated from source code analysis. Last updated: 2026-03-23*
