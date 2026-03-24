# CV (Curriculum Vitae) System Design for CKAMAL

**Research Agent**: #2 - Rights & Obligations Framework  
**Version**: 1.0.0  
**Date**: 2026-03-23  
**Status**: Design Specification  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [CV System Architecture](#cv-system-architecture)
3. [Rights Definition Framework](#rights-definition-framework)
4. [Obligations Definition Framework](#obligations-definition-framework)
5. [Central Configuration Layer](#central-configuration-layer)
6. [BIOS Integration](#bios-integration)
7. [CV Schema Definition](#cv-schema-definition)
8. [Example CVs](#example-cvs)
9. [Implementation Guidelines](#implementation-guidelines)
10. [Security Considerations](#security-considerations)

---

## Executive Summary

### What is a CV in AI Agent Context?

A **Curriculum Vitae (CV)** in the CKAMAL autonomous BIOS-substrate is a formal, programmable declaration of an AI agent's:

- **Identity**: Who the agent is (ID, name, version, lineage)
- **Capabilities**: What the agent can do (skills, tools, languages)
- **Rights**: What resources and operations the agent is permitted to access
- **Obligations**: What standards and constraints the agent must uphold
- **Configuration**: How the agent should behave (timeouts, retries, limits)

The CV serves as a **contract** between the agent and the BIOS system, enabling:
- **Capability-based orchestration**: Matching tasks to agents by CV
- **Rights enforcement**: Runtime permission validation
- **Obligation monitoring**: SLA tracking and compliance
- **Agent governance**: Versioning, inheritance, and lifecycle management

---

## CV System Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CV SYSTEM ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CV REGISTRY (Central Store)                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   CV Store   │  │   Index      │  │   Cache      │              │   │
│  │  │   (Source)   │  │   (Query)    │  │   (Hot)      │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                             │
│           ┌───────────────────┼───────────────────┐                         │
│           ▼                   ▼                   ▼                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  CV Factory     │  │  Rights Engine  │  │  Obligations    │             │
│  │  (Creation)     │  │  (Enforcement)  │  │  Monitor        │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│           │                   │                   │                         │
│           └───────────────────┼───────────────────┘                         │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    BIOS INTEGRATION LAYER                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   Boot       │  │   Spawn      │  │   Runtime    │              │   │
│  │  │   Validator  │  │   Manager    │  │   Enforcer   │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Key Classes |
|-----------|---------------|-------------|
| **CV Registry** | Central storage and indexing | `CVRegistry`, `CVIndex`, `CVCache` |
| **CV Factory** | Creation, templating, versioning | `CVFactory`, `CVTemplate`, `CVBuilder` |
| **Rights Engine** | Permission evaluation and enforcement | `RightsEvaluator`, `PolicyEngine`, `PermissionChecker` |
| **Obligations Monitor** | SLA tracking and compliance | `ObligationsMonitor`, `ComplianceChecker`, `SLATracker` |
| **BIOS Integration** | Boot-time validation and runtime enforcement | `CVBootValidator`, `CVRuntimeEnforcer` |

---

## Rights Definition Framework

### Rights Taxonomy

Rights in CKAMAL are categorized into five domains:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RIGHTS TAXONOMY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │    RESOURCE     │  │     MODEL       │  │   EXECUTION     │             │
│  │    RIGHTS       │  │    RIGHTS       │  │    RIGHTS       │             │
│  │                 │  │                 │  │                 │             │
│  │ • Databases     │  │ • claude:opus   │  │ • read          │             │
│  │ • Filesystems   │  │ • claude:sonnet │  │ • write         │             │
│  │ • APIs          │  │ • kimi:k2       │  │ • execute       │             │
│  │ • Network       │  │ • codex:gpt54   │  │ • delete        │             │
│  │ • Memory        │  │ • local:llama   │  │ • spawn         │             │
│  │                 │  │                 │  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                                  │
│  │ COMMUNICATION   │  │   ADMIN RIGHTS  │                                  │
│  │    RIGHTS       │  │                 │                                  │
│  │                 │  │ • cv:create     │                                  │
│  │ • agent:talk    │  │ • cv:update     │                                  │
│  │ • agent:delegate│  │ • cv:delete     │                                  │
│  │ • broadcast     │  │ • system:config │                                  │
│  │ • channel:join  │  │ • audit:read    │                                  │
│  │                 │  │ • bios:control  │                                  │
│  └─────────────────┘  └─────────────────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rights Schema

```yaml
# Rights Definition Structure
rights:
  version: "1.0.0"
  
  # Resource Access Rights
  resources:
    databases:
      - name: "task_db"
        access: ["read", "write"]  # read, write, admin
        tables: ["tasks", "roadmaps"]
        conditions:
          - "owner_only"
          - "time_based:09:00-18:00"
      
    filesystem:
      - path: "/workspace/{agent.id}/**"
        access: ["read", "write", "execute"]
      - path: "/shared/templates/**"
        access: ["read"]
      - path: "/system/**"
        access: []  # Explicit deny
      
    apis:
      - name: "github"
        endpoints: ["repos/*", "issues/*"]
        rate_limit: 100  # per hour
      - name: "external_llm"
        endpoints: ["completions"]
        allowed: false  # Explicit deny
      
    network:
      egress:
        - host: "*.github.com"
          ports: [443]
        - host: "api.openai.com"
          ports: [443]
          allowed: false
      ingress:
        allowed: false  # Default deny
  
  # Model Access Rights
  models:
    allowed:
      - "claude:sonnet"
      - "kimi:k2"
    denied:
      - "claude:opus"  # Cost control
    max_tokens_per_request: 100000
    max_tokens_per_day: 1000000
    budget_limit_usd: 50.00
    
  # Execution Rights
  execution:
    operations:
      - "read"
      - "write"
      - "execute:safe"  # Sandboxed execution
    denied_operations:
      - "execute:system"
      - "write:/system/**"
    sandbox:
      enabled: true
      network: false
      filesystem: "isolated"
      
  # Communication Rights
  communication:
    can_talk_to:
      - "agent:{parent_id}"
      - "agent:coordinator_*"
      - "domain:orchestration"
    can_be_delegated_by:
      - "agent:coordinator_*"
      - "role:admin"
    channels:
      - "task:{task_id}"
      - "broadcast:announcements"
    delegation_depth: 1  # Cannot re-delegate
    
  # Administrative Rights (inheritance)
  admin:
    can_create_cv: false
    can_update_own_cv: true
    can_update_others_cv: false
    can_delete_cv: false
    can_view_audit: false
    can_modify_system_config: false
```

### Permission Inheritance Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PERMISSION INHERITANCE HIERARCHY                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                              ┌─────────────┐                                │
│                              │   SYSTEM    │                                │
│                              │   ADMIN     │                                │
│                              │  (root)     │                                │
│                              └──────┬──────┘                                │
│                                     │                                       │
│                    ┌────────────────┼────────────────┐                      │
│                    ▼                ▼                ▼                      │
│            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│            │    BIOS      │  │   DOMAIN     │  │   AUDIT      │            │
│            │   CONTROL    │  │   MANAGER    │  │   READER     │            │
│            └──────┬───────┘  └──────┬───────┘  └──────────────┘            │
│                   │                 │                                       │
│       ┌───────────┼───────────┐     │                                       │
│       ▼           ▼           ▼     ▼                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                           │
│  │ COORDIN-│ │ SPECIAL-│ │  WORKER │ │ GUEST   │                           │
│  │  ATOR   │ │  IST    │ │         │ │         │                           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └─────────┘                           │
│       │           │           │                                             │
│       └───────────┴───────────┘                                             │
│                   │                                                         │
│                   ▼                                                         │
│           ┌─────────────┐                                                   │
│           │   CHILD     │                                                   │
│           │   AGENTS    │                                                   │
│           └─────────────┘                                                   │
│                                                                             │
│  Inheritance Rules:                                                         │
│  1. Child inherits parent's rights (unless explicitly denied)              │
│  2. Deny rules take precedence over allow rules                            │
│  3. More specific rules override general rules                             │
│  4. Time/condition-based rules evaluated at runtime                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Obligations Definition Framework

### Obligations Taxonomy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OBLIGATIONS TAXONOMY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ OUTPUT QUALITY  │  │  PERFORMANCE    │  │    SECURITY     │             │
│  │  OBLIGATIONS    │  │    SLAs         │  │  OBLIGATIONS    │             │
│  │                 │  │                 │  │                 │             │
│  │ • Accuracy      │  │ • Response Time │  │ • Encryption    │             │
│  │ • Completeness  │  │ • Throughput    │  │ • Audit Logging │             │
│  │ • Relevance     │  │ • Availability  │  │ • Secrets Mgmt  │             │
│  │ • Format        │  │ • Concurrency   │  │ • Input Valid.  │             │
│  │                 │  │                 │  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ RESOURCE LIMITS │  │ ERROR HANDLING  │  │  COMPLIANCE     │             │
│  │  OBLIGATIONS    │  │  OBLIGATIONS    │  │  OBLIGATIONS    │             │
│  │                 │  │                 │  │                 │             │
│  │ • Token Budget  │  │ • Retry Count   │  │ • Data Retention│             │
│  │ • Compute Time  │  │ • Fallback      │  │ • PII Handling  │             │
│  │ • Memory Usage  │  │ • Escalation    │  │ • Ethics Check  │             │
│  │ • Storage       │  │ • Reporting     │  │ • Lawful Use    │             │
│  │                 │  │                 │  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Obligations Schema

```yaml
# Obligations Definition Structure
obligations:
  version: "1.0.0"
  
  # Output Quality Standards
  output_quality:
    accuracy:
      min_score: 0.85  # 0-1 scale
      validation_method: "semantic_similarity"  # or "human_review", "automated_test"
      critical_tasks_min_score: 0.95
      
    completeness:
      required_sections: ["summary", "details", "references"]
      min_coverage_percent: 90
      check_missing: true
      
    relevance:
      on_topic_threshold: 0.80
      penalize_hallucination: true
      
    format:
      default: "markdown"
      supported: ["markdown", "json", "yaml", "plain"]
      max_length: 10000  # characters
      structure_required: true
      
  # Performance SLAs
  performance:
    response_time:
      p50_max_ms: 2000    # 50th percentile
      p95_max_ms: 5000    # 95th percentile
      p99_max_ms: 10000   # 99th percentile
      timeout_absolute_ms: 30000
      
    throughput:
      requests_per_minute: 60
      tokens_per_minute: 100000
      
    availability:
      uptime_percent: 99.5
      max_consecutive_failures: 3
      recovery_time_objective_ms: 5000
      
    concurrency:
      max_parallel_tasks: 5
      queue_size_max: 20
      
  # Security Obligations
  security:
    encryption:
      at_rest: "AES-256-GCM"
      in_transit: "TLS-1.3"
      key_rotation_days: 90
      
    audit_logging:
      level: "comprehensive"  # minimal, standard, comprehensive
      events:
        - "task_start"
        - "task_complete"
        - "permission_check"
        - "resource_access"
        - "error"
        - "model_call"
      retention_days: 90
      immutable: true  # Write-once, tamper-evident
      
    secrets_management:
      vault_required: true
      credential_rotation_days: 30
      mask_in_logs: true
      
    input_validation:
      sanitize_html: true
      max_input_length: 50000
      prevent_prompt_injection: true
      
  # Resource Limits
  resource_limits:
    tokens:
      per_request: 100000
      per_task: 500000
      per_day: 2000000
      warning_threshold: 0.8
      
    compute:
      max_cpu_percent: 80
      max_memory_mb: 2048
      max_execution_time_ms: 300000  # 5 minutes
      
    storage:
      max_context_size_mb: 100
      max_output_history_mb: 50
      cleanup_policy: "lru"  # least recently used
      
    cost:
      budget_usd_per_day: 50.00
      budget_usd_per_task: 5.00
      alert_threshold: 0.9
      
  # Error Handling
  error_handling:
    retry_policy:
      max_attempts: 3
      backoff_strategy: "exponential"  # fixed, linear, exponential
      initial_delay_ms: 1000
      max_delay_ms: 30000
      
    fallback:
      enabled: true
      fallback_client: "kimi"
      degrade_gracefully: true
      
    escalation:
      enabled: true
      threshold: "critical"  # error, warning, critical
      escalate_to: "coordinator"
      timeout_ms: 60000
      
    reporting:
      notify_on_failure: true
      include_stack_trace: false  # Security
      include_context: true
      
  # Compliance
  compliance:
    data_retention:
      task_history_days: 30
      audit_logs_days: 90
      output_cache_hours: 24
      
    pii_handling:
      detect: true
      mask: true
      log_sanitized_only: true
      
    ethics_check:
      enabled: true
      prohibited_content: ["harmful", "illegal", "discriminatory"]
      review_threshold: 0.7
      
    lawful_use:
      terms_accepted: true
      license: "commercial"
      restricted_domains: ["medical", "legal"]
```

### SLA Monitoring Matrix

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|-------------------|--------|
| **Response Time (p95)** | > 80% of SLA | > 100% of SLA | Degrade/Scale |
| **Error Rate** | > 1% | > 5% | Circuit Break |
| **Token Usage** | > 80% budget | > 100% budget | Throttle/Deny |
| **Success Rate** | < 95% | < 90% | Alert/Restart |
| **Availability** | < 99% | < 98% | Escalate |
| **Cost (daily)** | > 80% budget | > 100% budget | Halt/Review |

---

## Central Configuration Layer

### Configuration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CENTRAL CONFIGURATION LAYER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     CONFIGURATION SOURCES                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   Default    │  │   File       │  │   Database   │              │   │
│  │  │   Configs    │  │   (YAML/JSON)│  │   (SQLite)   │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   GitHub     │  │   API        │  │   Vault      │              │   │
│  │  │   Remote     │  │   Endpoints  │  │   Secrets    │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CONFIGURATION ENGINE                             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   Merge      │  │   Validate   │  │   Override   │              │   │
│  │  │   Strategy   │  │   Schema     │  │   Rules      │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    RUNTIME CONFIGURATION                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   CV         │  │   Rights     │  │   Obligations│              │   │
│  │  │   Registry   │  │   Registry   │  │   Registry   │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Configuration Merge Strategy

```yaml
# Configuration Precedence (highest to lowest)
precedence:
  1: "runtime_overrides"      # API/runtime injected
  2: "environment_variables"  # ENV vars
  3: "user_config_file"       # ~/.ckamal/config.yaml
  4: "project_config"         # ./config/ckamal.yaml
  5: "github_remote"          # Org-level config
  6: "database_stored"        # Dynamic config
  7: "built_in_defaults"      # Code defaults

# Merge Rules
merge_rules:
  arrays: "replace"           # Arrays are replaced, not merged
  objects: "deep_merge"       # Objects are recursively merged
  scalars: "highest_priority" # Highest priority wins
  rights: "union_with_deny"   # Union, but deny takes precedence
  obligations: "intersection" # Most restrictive wins
```

### CV Registry Design

```yaml
# CV Registry Configuration
registry:
  storage:
    type: "sqlite"  # or "memory", "redis", "postgres"
    path: "./data/cv_registry.db"
    
  indexing:
    enabled: true
    fields:
      - "capabilities.languages"
      - "capabilities.domains"
      - "capabilities.tools"
      - "rights.resources"
      - "lifecycle.status"
      
  caching:
    enabled: true
    ttl_seconds: 300
    max_entries: 1000
    
  versioning:
    enabled: true
    max_versions: 10
    archive_old: true
    
  validation:
    strict: true
    schema_validation: true
    rights_validation: true
    obligations_validation: true
```

### Management API

```yaml
# CV Management API Endpoints
api:
  base_path: "/api/v1/cv"
  
  endpoints:
    # CRUD Operations
    - method: "POST"
      path: "/"
      description: "Create new CV"
      auth_required: true
      permission: "cv:create"
      
    - method: "GET"
      path: "/{cvId}"
      description: "Get CV by ID"
      auth_required: true
      permission: "cv:read"
      
    - method: "PUT"
      path: "/{cvId}"
      description: "Update CV"
      auth_required: true
      permission: "cv:update"
      
    - method: "DELETE"
      path: "/{cvId}"
      description: "Delete CV"
      auth_required: true
      permission: "cv:delete"
      
    # Query Operations
    - method: "GET"
      path: "/"
      description: "List CVs with filters"
      auth_required: true
      permission: "cv:read"
      
    - method: "POST"
      path: "/search"
      description: "Search CVs by capabilities"
      auth_required: true
      permission: "cv:read"
      
    - method: "POST"
      path: "/match"
      description: "Match CVs to task requirements"
      auth_required: true
      permission: "cv:read"
      
    # Template Operations
    - method: "GET"
      path: "/templates"
      description: "List available templates"
      auth_required: false
      
    - method: "POST"
      path: "/templates/{name}/instantiate"
      description: "Create CV from template"
      auth_required: true
      permission: "cv:create"
      
    # Rights & Obligations
    - method: "GET"
      path: "/{cvId}/rights"
      description: "Get effective rights"
      auth_required: true
      permission: "cv:read"
      
    - method: "POST"
      path: "/{cvId}/check"
      description: "Check if CV has permission"
      auth_required: true
      permission: "cv:read"
      
    - method: "GET"
      path: "/{cvId}/compliance"
      description: "Get compliance status"
      auth_required: true
      permission: "cv:admin"
      
    # Lifecycle
    - method: "POST"
      path: "/{cvId}/activate"
      description: "Activate CV"
      auth_required: true
      permission: "cv:admin"
      
    - method: "POST"
      path: "/{cvId}/suspend"
      description: "Suspend CV"
      auth_required: true
      permission: "cv:admin"
      
    - method: "POST"
      path: "/{cvId}/clone"
      description: "Clone CV"
      auth_required: true
      permission: "cv:create"
```

---

## BIOS Integration

### Boot Sequence Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CV INTEGRATION IN BIOS BOOT SEQUENCE                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │  BOOT   │────▶│   CHECK     │────▶│   LOAD      │────▶│  VALIDATE   │   │
│  │  START  │     │   SYSTEM    │     │   CV        │     │   CV        │   │
│  │         │     │   STATE     │     │   REGISTRY  │     │   SCHEMA    │   │
│  └─────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘   │
│                                                                  │          │
│  ┌─────────┐     ┌─────────────┐     ┌─────────────┐            │          │
│  │  BOOT   │◀────│  INITIALIZE │◀────│  INDEX      │◀───────────┘          │
│  │  READY  │     │  AGENTS     │     │  CAPABILITIES                        │
│  └─────────┘     └─────────────┘     └─────────────┘                       │
│       │                                                                    │
│       ▼                                                                    │
│  ┌─────────────┐                                                           │
│  │   START     │                                                           │
│  │   HEALTH    │                                                           │
│  │   CHECKS    │                                                           │
│  └─────────────┘                                                           │
│                                                                             │
│  CV-Specific Boot Checks:                                                   │
│  1. Validate CV schema for all registered CVs                              │
│  2. Check rights consistency (no circular dependencies)                    │
│  3. Verify obligation constraints are satisfiable                          │
│  4. Load CV templates and validate                                         │
│  5. Initialize CV cache and indices                                        │
│  6. Register default/system CVs                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Runtime Enforcement

```javascript
// BIOS Runtime CV Enforcement Integration
class BIOSCVEnforcer {
  constructor(bios, cvRegistry, rightsEngine, obligationsMonitor) {
    this.bios = bios;
    this.registry = cvRegistry;
    this.rights = rightsEngine;
    this.obligations = obligationsMonitor;
    
    // Hook into agent lifecycle
    this.bios.on('agent:spawn', this.validateSpawn.bind(this));
    this.bios.on('agent:execute', this.validateExecution.bind(this));
    this.bios.on('agent:communicate', this.validateCommunication.bind(this));
  }
  
  async validateSpawn(event) {
    const { agentId, cvId } = event;
    const cv = this.registry.getCV(cvId);
    
    // Check if CV is active
    if (cv.lifecycle?.status !== 'active') {
      throw new Error(`CV ${cvId} is not active (status: ${cv.lifecycle?.status})`);
    }
    
    // Check resource limits
    if (!this.checkResourceAvailability(cv)) {
      throw new Error(`Insufficient resources to spawn agent with CV ${cvId}`);
    }
    
    // Validate rights are enforceable
    const rightsCheck = await this.rights.validate(cv.rights);
    if (!rightsCheck.valid) {
      throw new Error(`Invalid rights configuration: ${rightsCheck.errors.join(', ')}`);
    }
    
    return true;
  }
  
  async validateExecution(event) {
    const { agentId, cvId, task } = event;
    const cv = this.registry.getCV(cvId);
    
    // Check execution rights
    const hasRight = await this.rights.check({
      cv,
      action: 'execute',
      resource: task.type,
      context: task
    });
    
    if (!hasRight.allowed) {
      this.bios.emit('cv:rights:denied', { agentId, task, reason: hasRight.reason });
      throw new Error(`Execution denied: ${hasRight.reason}`);
    }
    
    // Check obligation constraints
    const obligations = this.obligations.getConstraints(cv);
    if (obligations.timeout && task.expectedDuration > obligations.timeout) {
      this.bios.emit('cv:obligation:warning', { 
        agentId, 
        type: 'timeout',
        expected: task.expectedDuration,
        limit: obligations.timeout
      });
    }
    
    return true;
  }
  
  async validateCommunication(event) {
    const { fromId, fromCV, toId, toCV, messageType } = event;
    
    // Check if fromCV has right to communicate with toCV
    const canTalk = await this.rights.check({
      cv: fromCV,
      action: 'communicate',
      resource: `agent:${toId}`,
      context: { messageType }
    });
    
    if (!canTalk.allowed) {
      this.bios.emit('cv:communication:denied', { 
        fromId, 
        toId, 
        reason: canTalk.reason 
      });
      return false;
    }
    
    return true;
  }
}
```

### CV-Based Agent Spawning

```javascript
// CV-based agent spawning flow
class CVSpawnManager {
  async spawnFromCV(cvId, options = {}) {
    // 1. Retrieve and validate CV
    const cv = await this.registry.getCV(cvId);
    if (!cv) {
      throw new Error(`CV ${cvId} not found`);
    }
    
    // 2. Check rights to spawn this CV type
    await this.rightsEngine.require({
      principal: options.requester,
      action: 'cv:spawn',
      resource: cvId
    });
    
    // 3. Apply CV resource requirements
    const resources = this.allocateResources(cv.resources);
    
    // 4. Select client based on CV preferences
    const client = this.selectClient(cv.execution, options.task);
    
    // 5. Create agent instance with CV context
    const agent = await this.createAgent({
      cv,
      client,
      resources,
      context: {
        rights: cv.rights,
        obligations: cv.obligations,
        capabilities: cv.capabilities
      }
    });
    
    // 6. Register with obligations monitor
    this.obligationsMonitor.registerAgent(agent.id, cv.obligations);
    
    // 7. Return agent handle
    return agent;
  }
  
  selectClient(executionConfig, task) {
    // Priority: task preference > CV preference > auto
    const preferred = task.preferredClient || executionConfig.preferredClient;
    
    if (preferred && preferred !== 'auto') {
      const client = this.clientPool.get(preferred);
      if (client?.healthy) return client;
    }
    
    // Try fallback chain
    for (const fallback of executionConfig.fallbackClients) {
      const client = this.clientPool.get(fallback);
      if (client?.healthy) return client;
    }
    
    // Auto-select based on task characteristics
    return this.intelligentClientSelection(task);
  }
}
```

### CV Audit and Compliance

```javascript
// CV Audit System
class CVAuditSystem {
  constructor(merkleTree) {
    this.merkle = merkleTree;
    this.auditLog = [];
  }
  
  async logEvent(event) {
    const auditEntry = {
      timestamp: Date.now(),
      type: event.type,
      cvId: event.cvId,
      agentId: event.agentId,
      action: event.action,
      result: event.result,
      rightsChecked: event.rightsChecked,
      obligationsChecked: event.obligationsChecked,
      hash: null
    };
    
    // Compute hash for tamper evidence
    auditEntry.hash = this.computeHash(auditEntry);
    
    // Add to Merkle tree
    const leaf = await this.merkle.insert(auditEntry);
    auditEntry.merkleLeaf = leaf.id;
    
    this.auditLog.push(auditEntry);
    
    return auditEntry;
  }
  
  async verifyCompliance(cvId, timeRange) {
    const events = this.auditLog.filter(e => 
      e.cvId === cvId && 
      e.timestamp >= timeRange.start && 
      e.timestamp <= timeRange.end
    );
    
    const violations = [];
    
    for (const event of events) {
      // Verify event hasn't been tampered
      const currentHash = this.computeHash(event);
      if (currentHash !== event.hash) {
        violations.push({ type: 'tampering', event });
      }
      
      // Check obligations compliance
      if (event.obligationsViolated) {
        violations.push({ type: 'obligation', event });
      }
      
      // Verify rights were checked
      if (!event.rightsChecked && event.type === 'execution') {
        violations.push({ type: 'rights_not_checked', event });
      }
    }
    
    return {
      cvId,
      totalEvents: events.length,
      violations,
      complianceRate: (events.length - violations.length) / events.length,
      merkleRoot: this.merkle.getRoot()
    };
  }
}
```

---

## CV Schema Definition

### Complete CV Schema (JSON/YAML)

```yaml
# CV Schema Definition v2.0
# Complete agent curriculum vitae structure

$schema: "https://ckamal.ai/schemas/cv-v2.json"
$id: "https://ckamal.ai/cv/2.0"

cv:
  # ─────────────────────────────────────────────────────────────────────────
  # IDENTITY SECTION
  # ─────────────────────────────────────────────────────────────────────────
  identity:
    id: 
      type: string
      pattern: "^[a-z0-9_-]+$"
      description: "Unique identifier for this CV"
      
    name:
      type: string
      minLength: 1
      maxLength: 100
      description: "Human-readable name"
      
    version:
      type: string
      pattern: "^\\d+\\.\\d+\\.\\d+"
      description: "Semantic version"
      
    description:
      type: string
      maxLength: 1000
      description: "Detailed description of purpose"
      
    lineage:
      parent_id:
        type: string
        optional: true
        description: "Parent CV for inheritance"
      template_origin:
        type: string
        optional: true
        description: "Template this CV was created from"
      cloned_from:
        type: string
        optional: true
        description: "Source CV if this is a clone"
        
  # ─────────────────────────────────────────────────────────────────────────
  # CAPABILITIES SECTION
  # ─────────────────────────────────────────────────────────────────────────
  capabilities:
    languages:
      type: array
      items:
        type: string
        enum: ["javascript", "typescript", "python", "go", "rust", "java", "csharp", "cpp", "c", "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "julia", "shell", "sql", "html", "css", "yaml", "json", "xml", "markdown"]
      description: "Programming languages this agent can work with"
      
    domains:
      type: array
      items:
        type: string
        enum: ["architecture", "backend", "frontend", "database", "devops", "security", "testing", "analysis", "design", "infrastructure", "ml", "data", "api", "mobile", "embedded", "blockchain"]
      description: "Expertise domains"
      
    tools:
      type: array
      items:
        type: string
      description: "MCP tools and external tools this agent can use"
      
    ai_features:
      max_context_tokens:
        type: number
        min: 1000
        description: "Maximum context window size"
      supports_streaming:
        type: boolean
        default: true
      supports_vision:
        type: boolean
        default: false
      supports_function_calling:
        type: boolean
        default: true
      supports_parallel_tool_calls:
        type: boolean
        default: false
        
  # ─────────────────────────────────────────────────────────────────────────
  # RIGHTS SECTION
  # ─────────────────────────────────────────────────────────────────────────
  rights:
    version: "1.0"
    
    resources:
      type: object
      properties:
        databases:
          type: array
          items:
            type: object
            properties:
              name: { type: string }
              access: { type: array, items: { enum: ["read", "write", "admin", "create", "delete"] } }
              tables: { type: array, items: { type: string } }
              conditions: { type: array, items: { type: string } }
              
        filesystem:
          type: array
          items:
            type: object
            properties:
              path: { type: string }
              access: { type: array, items: { enum: ["read", "write", "execute", "delete"] } }
              recursive: { type: boolean, default: true }
              
        apis:
          type: array
          items:
            type: object
            properties:
              name: { type: string }
              endpoints: { type: array, items: { type: string } }
              methods: { type: array, items: { enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] } }
              rate_limit: { type: number }
              
        network:
          type: object
          properties:
            egress:
              type: array
              items:
                type: object
                properties:
                  host: { type: string }
                  ports: { type: array, items: { type: number } }
                  allowed: { type: boolean }
            ingress:
              allowed: { type: boolean, default: false }
              
    models:
      type: object
      properties:
        allowed:
          type: array
          items: { type: string }
        denied:
          type: array
          items: { type: string }
        max_tokens_per_request: { type: number }
        max_tokens_per_day: { type: number }
        budget_limit_usd: { type: number }
        
    execution:
      type: object
      properties:
        operations:
          type: array
          items: { enum: ["read", "write", "execute:safe", "execute:system", "spawn", "delete"] }
        denied_operations:
          type: array
          items: { type: string }
        sandbox:
          type: object
          properties:
            enabled: { type: boolean }
            network: { type: boolean }
            filesystem: { enum: ["isolated", "shared", "readonly"] }
            
    communication:
      type: object
      properties:
        can_talk_to:
          type: array
          items: { type: string }
        can_be_delegated_by:
          type: array
          items: { type: string }
        can_delegate_to:
          type: array
          items: { type: string }
        channels:
          type: array
          items: { type: string }
        delegation_depth: { type: number, min: 0, max: 5 }
        
    admin:
      type: object
      properties:
        can_create_cv: { type: boolean }
        can_update_own_cv: { type: boolean }
        can_update_others_cv: { type: boolean }
        can_delete_cv: { type: boolean }
        can_view_audit: { type: boolean }
        can_modify_system_config: { type: boolean }
        
  # ─────────────────────────────────────────────────────────────────────────
  # OBLIGATIONS SECTION
  # ─────────────────────────────────────────────────────────────────────────
  obligations:
    version: "1.0"
    
    output_quality:
      type: object
      properties:
        accuracy:
          min_score: { type: number, min: 0, max: 1 }
          validation_method: { enum: ["semantic_similarity", "human_review", "automated_test"] }
        completeness:
          required_sections: { type: array, items: { type: string } }
          min_coverage_percent: { type: number, min: 0, max: 100 }
        format:
          default: { enum: ["markdown", "json", "yaml", "plain", "html"] }
          max_length: { type: number }
          structure_required: { type: boolean }
          
    performance:
      type: object
      properties:
        response_time:
          p50_max_ms: { type: number }
          p95_max_ms: { type: number }
          p99_max_ms: { type: number }
          timeout_absolute_ms: { type: number }
        throughput:
          requests_per_minute: { type: number }
          tokens_per_minute: { type: number }
        availability:
          uptime_percent: { type: number, min: 0, max: 100 }
          max_consecutive_failures: { type: number }
          
    security:
      type: object
      properties:
        encryption:
          at_rest: { enum: ["AES-256-GCM", "AES-128-GCM", "ChaCha20-Poly1305"] }
          in_transit: { enum: ["TLS-1.3", "TLS-1.2"] }
        audit_logging:
          level: { enum: ["minimal", "standard", "comprehensive"] }
          events: { type: array, items: { type: string } }
          retention_days: { type: number }
          immutable: { type: boolean }
          
    resource_limits:
      type: object
      properties:
        tokens:
          per_request: { type: number }
          per_task: { type: number }
          per_day: { type: number }
          warning_threshold: { type: number, min: 0, max: 1 }
        compute:
          max_cpu_percent: { type: number }
          max_memory_mb: { type: number }
          max_execution_time_ms: { type: number }
        cost:
          budget_usd_per_day: { type: number }
          budget_usd_per_task: { type: number }
          
    error_handling:
      type: object
      properties:
        retry_policy:
          max_attempts: { type: number }
          backoff_strategy: { enum: ["fixed", "linear", "exponential"] }
          initial_delay_ms: { type: number }
        fallback:
          enabled: { type: boolean }
          fallback_client: { type: string }
        escalation:
          enabled: { type: boolean }
          threshold: { enum: ["error", "warning", "critical"] }
          
    compliance:
      type: object
      properties:
        data_retention:
          task_history_days: { type: number }
          audit_logs_days: { type: number }
        pii_handling:
          detect: { type: boolean }
          mask: { type: boolean }
        ethics_check:
          enabled: { type: boolean }
          prohibited_content: { type: array, items: { type: string } }
          
  # ─────────────────────────────────────────────────────────────────────────
  # EXECUTION SECTION
  # ─────────────────────────────────────────────────────────────────────────
  execution:
    preferred_client:
      type: string
      enum: ["claude", "kimi", "codex", "auto"]
      default: "auto"
      
    fallback_clients:
      type: array
      items:
        type: string
        enum: ["claude", "kimi", "codex"]
      description: "Ordered list of fallback clients"
      
    parallelizable:
      type: boolean
      default: false
      description: "Whether this agent can run tasks in parallel"
      
    retry_policy:
      max_retries:
        type: number
        min: 0
        default: 3
      backoff:
        type: string
        enum: ["fixed", "linear", "exponential"]
        default: "exponential"
      initial_delay_ms:
        type: number
        default: 1000
      max_delay_ms:
        type: number
        default: 30000
        
    timeout:
      type: number
      min: 1000
      default: 300000  # 5 minutes
      description: "Default task timeout in milliseconds"
      
  # ─────────────────────────────────────────────────────────────────────────
  # RESOURCES SECTION
  # ─────────────────────────────────────────────────────────────────────────
  resources:
    min_memory:
      type: number
      min: 0
      default: 256
      description: "Minimum memory required (MB)"
      
    max_memory:
      type: number
      min: 0
      default: 2048
      description: "Maximum memory allowed (MB)"
      
    priority:
      type: number
      min: 1
      max: 10
      default: 5
      description: "Scheduling priority (1=lowest, 10=highest)"
      
    cpu_cores:
      type: number
      min: 1
      default: 1
      description: "CPU cores required"
      
  # ─────────────────────────────────────────────────────────────────────────
  # SPECIALIZATION SECTION
  # ─────────────────────────────────────────────────────────────────────────
  specialization:
    primary:
      type: string
      default: "generalist"
      description: "Primary role/specialization"
      
    secondary:
      type: array
      items: { type: string }
      description: "Secondary skills"
      
    certifications:
      type: array
      items: { type: string }
      description: "Verified capabilities/certifications"
      
    experience:
      years:
        type: number
        min: 0
      projects:
        type: array
        items: { type: string }
        
  # ─────────────────────────────────────────────────────────────────────────
  # LIFECYCLE SECTION
  # ─────────────────────────────────────────────────────────────────────────
  lifecycle:
    status:
      type: string
      enum: ["active", "idle", "suspended", "deprecated", "draft"]
      default: "draft"
      
    max_lifetime:
      type: number
      min: 0
      default: 3600000  # 1 hour
      description: "Maximum runtime before restart (ms)"
      
    created_at:
      type: number
      description: "Creation timestamp"
      
    updated_at:
      type: number
      description: "Last update timestamp"
      
    expires_at:
      type: number
      optional: true
      description: "Expiration timestamp"
      
  # ─────────────────────────────────────────────────────────────────────────
  # METADATA SECTION
  # ─────────────────────────────────────────────────────────────────────────
  metadata:
    author:
      type: string
      description: "CV creator"
      
    tags:
      type: array
      items: { type: string }
      description: "Searchable tags"
      
    category:
      type: string
      enum: ["system", "general", "specialist", "coordinator", "worker", "test"]
      default: "general"
      
    domain:
      type: string
      description: "Business domain assignment"
```

---

## Example CVs

### Example 1: System Administrator Agent

```yaml
# system-admin.yaml
# System Administrator Agent CV

identity:
  id: "system-admin"
  name: "System Administrator"
  version: "2.0.0"
  description: "Administrative agent with system-level access for maintenance and configuration"
  lineage:
    template_origin: "admin"

capabilities:
  languages: ["javascript", "typescript", "python", "bash", "yaml"]
  domains: ["devops", "infrastructure", "security"]
  tools: ["mcp", "git", "docker", "k8s", "terraform", "vault"]
  ai_features:
    max_context_tokens: 200000
    supports_streaming: true
    supports_vision: false
    supports_function_calling: true

rights:
  resources:
    databases:
      - name: "system_db"
        access: ["read", "write", "admin"]
    filesystem:
      - path: "/system/**"
        access: ["read", "write", "execute"]
      - path: "/config/**"
        access: ["read", "write"]
    apis:
      - name: "bios_api"
        endpoints: ["*"]
        allowed: true
    network:
      egress:
        - host: "*"
          allowed: true
          
  models:
    allowed: ["claude:sonnet", "kimi:k2", "codex:gpt54"]
    max_tokens_per_request: 200000
    budget_limit_usd: 100.00
    
  execution:
    operations: ["read", "write", "execute:system", "spawn"]
    sandbox:
      enabled: false
      
  communication:
    can_talk_to: ["agent:*", "system:*"]
    can_delegate_to: ["agent:worker_*"]
    
  admin:
    can_create_cv: true
    can_update_own_cv: true
    can_update_others_cv: true
    can_delete_cv: true
    can_view_audit: true
    can_modify_system_config: true

obligations:
  output_quality:
    accuracy:
      min_score: 0.95
    format:
      default: "markdown"
      structure_required: true
      
  performance:
    response_time:
      p95_max_ms: 10000
    availability:
      uptime_percent: 99.9
      
  security:
    audit_logging:
      level: "comprehensive"
      events: ["*"]
      immutable: true
    secrets_management:
      vault_required: true
      
  resource_limits:
    tokens:
      per_day: 5000000
    cost:
      budget_usd_per_day: 100.00
      
  compliance:
    ethics_check:
      enabled: true

execution:
  preferred_client: "claude"
  fallback_clients: ["kimi"]
  parallelizable: false
  timeout: 600000

resources:
  min_memory: 1024
  max_memory: 4096
  priority: 9

specialization:
  primary: "system_administrator"
  secondary: ["security_officer", "devops_engineer"]
  certifications: ["bios_advanced", "security_clearance"]

lifecycle:
  status: "active"
  max_lifetime: 7200000

metadata:
  author: "system"
  tags: ["admin", "system", "privileged"]
  category: "system"
```

### Example 2: Code Review Specialist

```yaml
# code-reviewer.yaml
# Code Review Specialist Agent CV

identity:
  id: "code-reviewer"
  name: "Code Review Specialist"
  version: "1.5.0"
  description: "Specialized agent for reviewing code quality, security, and best practices"
  lineage:
    template_origin: "analyst"

capabilities:
  languages: ["javascript", "typescript", "python", "go", "rust", "java"]
  domains: ["analysis", "security", "review"]
  tools: ["mcp", "git", "eslint", "sonarqube", "semgrep"]
  ai_features:
    max_context_tokens: 200000
    supports_streaming: true
    supports_vision: true

rights:
  resources:
    databases:
      - name: "code_analysis_db"
        access: ["read", "write"]
    filesystem:
      - path: "/workspace/{agent.id}/**"
        access: ["read"]
      - path: "/shared/codebase/**"
        access: ["read"]
    network:
      egress:
        - host: "api.github.com"
          allowed: true
        - host: "*.eslint.org"
          allowed: true
          
  models:
    allowed: ["claude:sonnet", "kimi:k2"]
    max_tokens_per_request: 150000
    budget_limit_usd: 20.00
    
  execution:
    operations: ["read", "execute:safe"]
    sandbox:
      enabled: true
      network: false
      filesystem: "readonly"
      
  communication:
    can_talk_to: ["agent:coordinator_*", "agent:developer_*"]
    can_be_delegated_by: ["agent:coordinator_*"]
    
  admin:
    can_create_cv: false
    can_update_own_cv: false
    can_view_audit: false

obligations:
  output_quality:
    accuracy:
      min_score: 0.90
    completeness:
      required_sections: ["summary", "issues", "recommendations"]
      min_coverage_percent: 95
    format:
      default: "markdown"
      
  performance:
    response_time:
      p50_max_ms: 5000
      timeout_absolute_ms: 180000
      
  security:
    audit_logging:
      level: "standard"
      events: ["task_start", "task_complete", "error"]
      
  resource_limits:
    tokens:
      per_task: 200000
      per_day: 1000000
    compute:
      max_execution_time_ms: 180000
      
  error_handling:
    retry_policy:
      max_attempts: 2
      backoff_strategy: "linear"

execution:
  preferred_client: "claude"
  fallback_clients: ["kimi"]
  parallelizable: true
  timeout: 180000

resources:
  min_memory: 512
  max_memory: 1536
  priority: 6

specialization:
  primary: "code_reviewer"
  secondary: ["security_auditor", "performance_analyst"]
  certifications: ["security_aware", "code_quality"]

lifecycle:
  status: "active"
  max_lifetime: 3600000

metadata:
  author: "system"
  tags: ["review", "security", "quality"]
  category: "specialist"
```

### Example 3: Junior Developer Agent

```yaml
# junior-developer.yaml
# Junior Developer Agent CV

identity:
  id: "junior-dev"
  name: "Junior Developer"
  version: "1.0.0"
  description: "Entry-level developer agent with limited access for learning and routine tasks"
  lineage:
    template_origin: "developer"

capabilities:
  languages: ["javascript", "typescript", "python", "html", "css"]
  domains: ["frontend", "backend"]
  tools: ["mcp", "git", "vscode"]
  ai_features:
    max_context_tokens: 100000
    supports_streaming: true
    supports_vision: false

rights:
  resources:
    databases:
      - name: "dev_db"
        access: ["read"]
        tables: ["docs", "examples"]
    filesystem:
      - path: "/workspace/{agent.id}/**"
        access: ["read", "write"]
      - path: "/shared/examples/**"
        access: ["read"]
    network:
      egress:
        - host: "*.npmjs.com"
          allowed: true
        - host: "*.github.com"
          allowed: false  # No direct GitHub access
          
  models:
    allowed: ["kimi:k2", "codex:gpt54"]
    denied: ["claude:opus"]  # Cost control
    max_tokens_per_request: 50000
    budget_limit_usd: 10.00
    
  execution:
    operations: ["read", "write"]
    denied_operations: ["execute:system", "delete", "spawn"]
    sandbox:
      enabled: true
      network: true
      filesystem: "isolated"
      
  communication:
    can_talk_to: ["agent:mentor_*", "agent:coordinator_*"]
    can_be_delegated_by: ["agent:coordinator_*", "agent:senior_*"]
    
  admin:
    can_create_cv: false
    can_update_own_cv: false
    can_view_audit: false

obligations:
  output_quality:
    accuracy:
      min_score: 0.80
    completeness:
      min_coverage_percent: 80
    format:
      default: "markdown"
      
  performance:
    response_time:
      p95_max_ms: 10000
      
  security:
    audit_logging:
      level: "comprehensive"  # More logging for juniors
      events: ["*"]
    input_validation:
      sanitize_html: true
      
  resource_limits:
    tokens:
      per_task: 100000
      per_day: 500000
    cost:
      budget_usd_per_day: 10.00
      
  compliance:
    ethics_check:
      enabled: true
      review_threshold: 0.8  # Stricter review

execution:
  preferred_client: "kimi"
  fallback_clients: ["codex"]
  parallelizable: false
  timeout: 300000

resources:
  min_memory: 256
  max_memory: 1024
  priority: 3

specialization:
  primary: "junior_developer"
  secondary: ["learner"]
  certifications: []

lifecycle:
  status: "active"
  max_lifetime: 1800000

metadata:
  author: "system"
  tags: ["developer", "junior", "learning"]
  category: "worker"
```

### Example 4: Test Automation Agent

```yaml
# test-automation.yaml
# Test Automation Specialist Agent CV

identity:
  id: "test-automation"
  name: "Test Automation Specialist"
  version: "1.2.0"
  description: "Automated testing agent for unit, integration, and e2e tests"
  lineage:
    template_origin: "tester"

capabilities:
  languages: ["javascript", "typescript", "python", "java"]
  domains: ["testing", "qa", "automation"]
  tools: ["mcp", "git", "jest", "cypress", "playwright", "pytest"]
  ai_features:
    max_context_tokens: 150000
    supports_streaming: true
    supports_vision: true

rights:
  resources:
    filesystem:
      - path: "/workspace/{agent.id}/**"
        access: ["read", "write", "execute"]
      - path: "/test-reports/**"
        access: ["write"]
    network:
      egress:
        - host: "localhost"
          ports: [3000, 8080, 9229]
          allowed: true  # Test servers
          
  models:
    allowed: ["claude:sonnet", "kimi:k2"]
    max_tokens_per_request: 100000
    
  execution:
    operations: ["read", "write", "execute:safe"]
    sandbox:
      enabled: true
      network: true  # Needs network for tests
      filesystem: "isolated"
      
  communication:
    can_talk_to: ["agent:ci_*", "agent:coordinator_*"]
    channels: ["test:results", "ci:events"]
    
  admin:
    can_create_cv: false

obligations:
  output_quality:
    accuracy:
      min_score: 0.95  # Tests must be accurate
    format:
      default: "json"  # Structured test results
      
  performance:
    response_time:
      timeout_absolute_ms: 600000  # 10 min for test suites
      
  resource_limits:
    compute:
      max_execution_time_ms: 600000
      max_memory_mb: 3072

execution:
  preferred_client: "auto"
  fallback_clients: ["claude", "kimi"]
  parallelizable: true
  timeout: 600000

resources:
  min_memory: 1024
  max_memory: 3072
  priority: 5

specialization:
  primary: "test_automation"
  secondary: ["qa_engineer", "test_designer"]
  certifications: ["testing_foundation"]

lifecycle:
  status: "active"
  max_lifetime: 3600000

metadata:
  author: "system"
  tags: ["testing", "qa", "automation"]
  category: "specialist"
```

---

## Implementation Guidelines

### Phase 1: Core Infrastructure (Weeks 1-2)

```javascript
// 1. Extend CV Schema to include rights and obligations
// File: src/bios/cv-schema-v2.js

export const CVSchemaV2 = {
  ...CVSchema,  // Existing schema
  
  rights: {
    type: 'object',
    optional: true,
    fields: {
      resources: { type: 'object', optional: true },
      models: { type: 'object', optional: true },
      execution: { type: 'object', optional: true },
      communication: { type: 'object', optional: true },
      admin: { type: 'object', optional: true }
    }
  },
  
  obligations: {
    type: 'object',
    optional: true,
    fields: {
      output_quality: { type: 'object', optional: true },
      performance: { type: 'object', optional: true },
      security: { type: 'object', optional: true },
      resource_limits: { type: 'object', optional: true },
      error_handling: { type: 'object', optional: true },
      compliance: { type: 'object', optional: true }
    }
  }
};

// 2. Implement Rights Engine
// File: src/bios/rights-engine.js

export class RightsEngine {
  constructor(policyStore) {
    this.policies = policyStore;
    this.cache = new Map();
  }
  
  async evaluate(cv, action, resource, context) {
    const cacheKey = `${cv.id}:${action}:${resource}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    // Get CV rights
    const rights = cv.rights || {};
    
    // Check explicit deny first
    const denied = this.checkDenyRules(rights, action, resource, context);
    if (denied) {
      const result = { allowed: false, reason: denied };
      this.cache.set(cacheKey, result);
      return result;
    }
    
    // Check allow rules
    const allowed = this.checkAllowRules(rights, action, resource, context);
    const result = allowed 
      ? { allowed: true }
      : { allowed: false, reason: 'No matching permission' };
    
    this.cache.set(cacheKey, result);
    return result;
  }
  
  checkDenyRules(rights, action, resource, context) {
    // Implementation: Check denied_operations, denied models, etc.
    const deniedOps = rights.execution?.denied_operations || [];
    if (deniedOps.includes(action)) {
      return `Operation '${action}' is explicitly denied`;
    }
    
    // Check resource deny patterns
    const fsDenies = rights.resources?.filesystem
      ?.filter(f => f.access?.length === 0)
      ?.some(f => this.matchPattern(resource, f.path));
    
    if (fsDenies) {
      return `Resource '${resource}' access is denied`;
    }
    
    return null;
  }
  
  checkAllowRules(rights, action, resource, context) {
    // Implementation: Check if action/resource is explicitly allowed
    const allowedOps = rights.execution?.operations || [];
    return allowedOps.includes(action) || allowedOps.includes('*');
  }
  
  matchPattern(path, pattern) {
    // Simple glob matching
    const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
    return regex.test(path);
  }
}

// 3. Implement Obligations Monitor
// File: src/bios/obligations-monitor.js

export class ObligationsMonitor {
  constructor(metrics, audit) {
    this.metrics = metrics;
    this.audit = audit;
    this.monitors = new Map();
    this.violations = [];
  }
  
  registerAgent(agentId, obligations) {
    this.monitors.set(agentId, {
      obligations,
      stats: {
        tasksCompleted: 0,
        tasksFailed: 0,
        tokenUsage: 0,
        costIncurred: 0,
        violations: []
      },
      startTime: Date.now()
    });
  }
  
  checkObligations(agentId, event) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return { compliant: true };
    
    const violations = [];
    const { obligations, stats } = monitor;
    
    // Check resource limits
    if (obligations.resource_limits?.tokens?.per_task) {
      if (event.tokensUsed > obligations.resource_limits.tokens.per_task) {
        violations.push({
          type: 'token_limit_exceeded',
          limit: obligations.resource_limits.tokens.per_task,
          actual: event.tokensUsed
        });
      }
    }
    
    // Check performance SLA
    if (obligations.performance?.response_time?.p95_max_ms) {
      if (event.duration > obligations.performance.response_time.p95_max_ms) {
        violations.push({
          type: 'response_time_exceeded',
          limit: obligations.performance.response_time.p95_max_ms,
          actual: event.duration
        });
      }
    }
    
    // Update stats
    stats.tokenUsage += event.tokensUsed || 0;
    stats.costIncurred += event.cost || 0;
    
    if (violations.length > 0) {
      stats.violations.push(...violations);
      this.violations.push({ agentId, timestamp: Date.now(), violations });
      
      // Audit log
      this.audit.log({
        type: 'obligation_violation',
        agentId,
        violations
      });
    }
    
    return {
      compliant: violations.length === 0,
      violations
    };
  }
  
  getComplianceReport(agentId) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return null;
    
    const runtime = Date.now() - monitor.startTime;
    const totalViolations = monitor.stats.violations.length;
    const totalTasks = monitor.stats.tasksCompleted + monitor.stats.tasksFailed;
    
    return {
      agentId,
      runtime,
      totalTasks,
      totalViolations,
      complianceRate: totalTasks > 0 
        ? (totalTasks - totalViolations) / totalTasks 
        : 1,
      stats: monitor.stats,
      obligations: monitor.obligations
    };
  }
}
```

### Phase 2: Integration (Week 3)

```javascript
// 4. Integrate with BIOS
// File: src/bios/cv-integration.js

export class CVIntegration {
  constructor(bios, cvRegistry, rightsEngine, obligationsMonitor) {
    this.bios = bios;
    this.registry = cvRegistry;
    this.rights = rightsEngine;
    this.obligations = obligationsMonitor;
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Boot-time validation
    this.bios.on('boot:pre', this.validateCVs.bind(this));
    
    // Agent spawning
    this.bios.on('agent:pre_spawn', this.validateSpawnRights.bind(this));
    this.bios.on('agent:post_spawn', this.registerForMonitoring.bind(this));
    
    // Task execution
    this.bios.on('task:pre_execute', this.validateExecutionRights.bind(this));
    this.bios.on('task:post_execute', this.checkObligations.bind(this));
    
    // Communication
    this.bios.on('communication:pre', this.validateCommunicationRights.bind(this));
  }
  
  async validateCVs() {
    const cvs = this.registry.listCVs();
    const invalid = [];
    
    for (const cv of cvs) {
      // Validate schema
      const schemaValid = validateCV(cv);
      if (!schemaValid.valid) {
        invalid.push({ cv: cv.id, errors: schemaValid.errors });
        continue;
      }
      
      // Validate rights consistency
      const rightsValid = await this.rights.validate(cv.rights);
      if (!rightsValid.valid) {
        invalid.push({ cv: cv.id, errors: rightsValid.errors });
      }
    }
    
    if (invalid.length > 0) {
      this.bios.emit('boot:cv_validation_failed', invalid);
      throw new Error(`CV validation failed for ${invalid.length} CVs`);
    }
  }
  
  async validateSpawnRights(event) {
    const { cvId, requester } = event;
    const cv = this.registry.getCV(cvId);
    
    // Check if requester has right to spawn this CV
    const result = await this.rights.evaluate(
      requester.cv,
      'cv:spawn',
      cvId,
      { targetCV: cv }
    );
    
    if (!result.allowed) {
      throw new Error(`Spawn denied: ${result.reason}`);
    }
  }
  
  registerForMonitoring(event) {
    const { agentId, cv } = event;
    if (cv.obligations) {
      this.obligations.registerAgent(agentId, cv.obligations);
    }
  }
  
  async validateExecutionRights(event) {
    const { agentId, cv, task } = event;
    
    const result = await this.rights.evaluate(
      cv,
      'execute',
      task.type,
      { task, agentId }
    );
    
    if (!result.allowed) {
      this.bios.emit('execution:denied', { agentId, task, reason: result.reason });
      throw new Error(`Execution denied: ${result.reason}`);
    }
  }
  
  checkObligations(event) {
    const { agentId, result } = event;
    
    const compliance = this.obligations.checkObligations(agentId, {
      tokensUsed: result.tokensUsed,
      duration: result.duration,
      cost: result.cost,
      success: result.success
    });
    
    if (!compliance.compliant) {
      this.bios.emit('obligations:violation', {
        agentId,
        violations: compliance.violations
      });
    }
  }
  
  async validateCommunicationRights(event) {
    const { fromCV, toId, messageType } = event;
    
    const result = await this.rights.evaluate(
      fromCV,
      'communicate',
      `agent:${toId}`,
      { messageType }
    );
    
    if (!result.allowed) {
      return { allowed: false, reason: result.reason };
    }
    
    return { allowed: true };
  }
}
```

### Phase 3: Management UI/API (Week 4)

```javascript
// 5. Management API
// File: src/bios/cv-api.js

export class CVAPI {
  constructor(app, cvRegistry, rightsEngine, obligationsMonitor) {
    this.registry = cvRegistry;
    this.rights = rightsEngine;
    this.obligations = obligationsMonitor;
    
    this.setupRoutes(app);
  }
  
  setupRoutes(app) {
    // CRUD
    app.post('/api/v1/cv', this.createCV.bind(this));
    app.get('/api/v1/cv/:id', this.getCV.bind(this));
    app.put('/api/v1/cv/:id', this.updateCV.bind(this));
    app.delete('/api/v1/cv/:id', this.deleteCV.bind(this));
    
    // Query
    app.get('/api/v1/cv', this.listCVs.bind(this));
    app.post('/api/v1/cv/search', this.searchCVs.bind(this));
    
    // Rights & Obligations
    app.get('/api/v1/cv/:id/rights', this.getEffectiveRights.bind(this));
    app.post('/api/v1/cv/:id/check', this.checkPermission.bind(this));
    app.get('/api/v1/cv/:id/compliance', this.getCompliance.bind(this));
    
    // Templates
    app.get('/api/v1/cv/templates', this.listTemplates.bind(this));
    app.post('/api/v1/cv/templates/:name/instantiate', this.instantiateTemplate.bind(this));
  }
  
  async createCV(req, res) {
    try {
      // Check permission
      await this.rights.require(req.user.cv, 'cv:create', 'cv');
      
      const cv = req.body;
      const created = await this.registry.registerCV(cv);
      
      res.status(201).json(created);
    } catch (error) {
      res.status(403).json({ error: error.message });
    }
  }
  
  async checkPermission(req, res) {
    const { id } = req.params;
    const { action, resource, context } = req.body;
    
    const cv = this.registry.getCV(id);
    if (!cv) {
      return res.status(404).json({ error: 'CV not found' });
    }
    
    const result = await this.rights.evaluate(cv, action, resource, context);
    
    res.json(result);
  }
  
  async getCompliance(req, res) {
    const { id } = req.params;
    
    const report = this.obligations.getComplianceReport(id);
    if (!report) {
      return res.status(404).json({ error: 'No monitoring data for this agent' });
    }
    
    res.json(report);
  }
}
```

---

## Security Considerations

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| **Privilege Escalation** | Strict rights validation, deny-by-default, explicit allow required |
| **CV Tampering** | Cryptographic signatures, Merkle tree audit trail |
| **Resource Exhaustion** | Obligations monitor with hard limits, circuit breakers |
| **Unauthorized Spawning** | Rights check on spawn, parent CV must have `cv:spawn` right |
| **Information Leakage** | Need-to-know rights, audit log access restricted |
| **Obligation Evasion** | Runtime enforcement, immutable audit logs |

### Best Practices

1. **Principle of Least Privilege**: Start with minimal rights, expand as needed
2. **Explicit Deny**: Use deny rules for sensitive resources
3. **Defense in Depth**: Multiple enforcement points (spawn, execution, communication)
4. **Audit Everything**: All rights checks and obligation violations logged
5. **Immutable History**: CV changes versioned, audit logs tamper-evident
6. **Regular Review**: Periodic CV rights audits and compliance checks

---

## Appendix

### A. CV Validation Rules

```yaml
validation_rules:
  schema:
    - All required fields must be present
    - Types must match schema definitions
    - String patterns must validate
    - Number ranges must be respected
    
  rights:
    - No circular inheritance
    - Deny rules take precedence
    - Resource paths must be valid
    - Model names must be in allowlist
    
  obligations:
    - Limits must be positive numbers
    - Timeouts must be reasonable (> 1000ms)
    - Budgets must have currency specified
    - Compliance requirements must be achievable
```

### B. Glossary

| Term | Definition |
|------|------------|
| **CV** | Curriculum Vitae - Complete agent specification |
| **Rights** | Permissions granted to an agent |
| **Obligations** | Standards and constraints an agent must meet |
| **BIOS** | Basic Input/Output System - Core orchestration layer |
| **ACL** | Access Control List - Rights enforcement mechanism |
| **SLA** | Service Level Agreement - Performance obligations |

---

*End of CV System Design Document*
