/**
 * CV Schema and Validation (Zod)
 * Defines the structure and validation for Agent CVs using Zod
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// RIGHTS SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

export const DatabaseAccessSchema = z.object({
  name: z.string(),
  access: z.array(z.enum(['read', 'write', 'admin', 'create', 'delete'])),
  tables: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional()
});

export const FilesystemAccessSchema = z.object({
  path: z.string(),
  access: z.array(z.enum(['read', 'write', 'execute', 'delete'])),
  recursive: z.boolean().default(true)
});

export const ApiAccessSchema = z.object({
  name: z.string(),
  endpoints: z.array(z.string()).optional(),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])).optional(),
  rate_limit: z.number().optional(),
  allowed: z.boolean().optional()
});

export const NetworkEgressSchema = z.object({
  host: z.string(),
  ports: z.array(z.number()).optional(),
  allowed: z.boolean()
});

export const NetworkAccessSchema = z.object({
  egress: z.array(NetworkEgressSchema).optional(),
  ingress: z.object({
    allowed: z.boolean().default(false)
  }).optional()
});

export const ResourceRightsSchema = z.object({
  databases: z.array(DatabaseAccessSchema).optional(),
  filesystem: z.array(FilesystemAccessSchema).optional(),
  apis: z.array(ApiAccessSchema).optional(),
  network: NetworkAccessSchema.optional()
});

export const ModelRightsSchema = z.object({
  allowed: z.array(z.string()).optional(),
  denied: z.array(z.string()).optional(),
  max_tokens_per_request: z.number().optional(),
  max_tokens_per_day: z.number().optional(),
  budget_limit_usd: z.number().optional()
});

export const SandboxConfigSchema = z.object({
  enabled: z.boolean(),
  network: z.boolean().optional(),
  filesystem: z.enum(['isolated', 'shared', 'readonly']).optional()
});

export const ExecutionRightsSchema = z.object({
  operations: z.array(z.enum(['read', 'write', 'execute:safe', 'execute:system', 'spawn', 'delete'])).optional(),
  denied_operations: z.array(z.string()).optional(),
  sandbox: SandboxConfigSchema.optional()
});

export const CommunicationRightsSchema = z.object({
  can_talk_to: z.array(z.string()).optional(),
  can_be_delegated_by: z.array(z.string()).optional(),
  can_delegate_to: z.array(z.string()).optional(),
  channels: z.array(z.string()).optional(),
  delegation_depth: z.number().min(0).max(5).optional()
});

export const AdminRightsSchema = z.object({
  can_create_cv: z.boolean().default(false),
  can_update_own_cv: z.boolean().default(true),
  can_update_others_cv: z.boolean().default(false),
  can_delete_cv: z.boolean().default(false),
  can_view_audit: z.boolean().default(false),
  can_modify_system_config: z.boolean().default(false)
});

export const RightsSchema = z.object({
  version: z.string().default('1.0.0'),
  resources: ResourceRightsSchema.optional(),
  models: ModelRightsSchema.optional(),
  execution: ExecutionRightsSchema.optional(),
  communication: CommunicationRightsSchema.optional(),
  admin: AdminRightsSchema.optional()
});

// ─────────────────────────────────────────────────────────────────────────────
// OBLIGATIONS SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

export const AccuracyObligationSchema = z.object({
  min_score: z.number().min(0).max(1).optional(),
  validation_method: z.enum(['semantic_similarity', 'human_review', 'automated_test']).optional(),
  critical_tasks_min_score: z.number().min(0).max(1).optional()
});

export const CompletenessObligationSchema = z.object({
  required_sections: z.array(z.string()).optional(),
  min_coverage_percent: z.number().min(0).max(100).optional(),
  check_missing: z.boolean().optional()
});

export const RelevanceObligationSchema = z.object({
  on_topic_threshold: z.number().min(0).max(1).optional(),
  penalize_hallucination: z.boolean().optional()
});

export const FormatObligationSchema = z.object({
  default: z.enum(['markdown', 'json', 'yaml', 'plain', 'html']).default('markdown'),
  supported: z.array(z.enum(['markdown', 'json', 'yaml', 'plain', 'html'])).optional(),
  max_length: z.number().optional(),
  structure_required: z.boolean().optional()
});

export const OutputQualityObligationsSchema = z.object({
  accuracy: AccuracyObligationSchema.optional(),
  completeness: CompletenessObligationSchema.optional(),
  relevance: RelevanceObligationSchema.optional(),
  format: FormatObligationSchema.optional()
});

export const ResponseTimeObligationSchema = z.object({
  p50_max_ms: z.number().optional(),
  p95_max_ms: z.number().optional(),
  p99_max_ms: z.number().optional(),
  timeout_absolute_ms: z.number().optional()
});

export const ThroughputObligationSchema = z.object({
  requests_per_minute: z.number().optional(),
  tokens_per_minute: z.number().optional()
});

export const AvailabilityObligationSchema = z.object({
  uptime_percent: z.number().min(0).max(100).optional(),
  max_consecutive_failures: z.number().optional(),
  recovery_time_objective_ms: z.number().optional()
});

export const ConcurrencyObligationSchema = z.object({
  max_parallel_tasks: z.number().optional(),
  queue_size_max: z.number().optional()
});

export const PerformanceObligationsSchema = z.object({
  response_time: ResponseTimeObligationSchema.optional(),
  throughput: ThroughputObligationSchema.optional(),
  availability: AvailabilityObligationSchema.optional(),
  concurrency: ConcurrencyObligationSchema.optional()
});

export const EncryptionObligationSchema = z.object({
  at_rest: z.enum(['AES-256-GCM', 'AES-128-GCM', 'ChaCha20-Poly1305']).optional(),
  in_transit: z.enum(['TLS-1.3', 'TLS-1.2']).optional(),
  key_rotation_days: z.number().optional()
});

export const AuditLoggingObligationSchema = z.object({
  level: z.enum(['minimal', 'standard', 'comprehensive']).default('standard'),
  events: z.array(z.string()).optional(),
  retention_days: z.number().optional(),
  immutable: z.boolean().optional()
});

export const SecretsManagementObligationSchema = z.object({
  vault_required: z.boolean().optional(),
  credential_rotation_days: z.number().optional(),
  mask_in_logs: z.boolean().optional()
});

export const InputValidationObligationSchema = z.object({
  sanitize_html: z.boolean().optional(),
  max_input_length: z.number().optional(),
  prevent_prompt_injection: z.boolean().optional()
});

export const SecurityObligationsSchema = z.object({
  encryption: EncryptionObligationSchema.optional(),
  audit_logging: AuditLoggingObligationSchema.optional(),
  secrets_management: SecretsManagementObligationSchema.optional(),
  input_validation: InputValidationObligationSchema.optional()
});

export const TokenLimitsSchema = z.object({
  per_request: z.number().optional(),
  per_task: z.number().optional(),
  per_day: z.number().optional(),
  warning_threshold: z.number().min(0).max(1).optional()
});

export const ComputeLimitsSchema = z.object({
  max_cpu_percent: z.number().optional(),
  max_memory_mb: z.number().optional(),
  max_execution_time_ms: z.number().optional()
});

export const StorageLimitsSchema = z.object({
  max_context_size_mb: z.number().optional(),
  max_output_history_mb: z.number().optional(),
  cleanup_policy: z.enum(['lru', 'fifo', 'ttl']).optional()
});

export const CostLimitsSchema = z.object({
  budget_usd_per_day: z.number().optional(),
  budget_usd_per_task: z.number().optional(),
  alert_threshold: z.number().min(0).max(1).optional()
});

export const ResourceLimitsObligationsSchema = z.object({
  tokens: TokenLimitsSchema.optional(),
  compute: ComputeLimitsSchema.optional(),
  storage: StorageLimitsSchema.optional(),
  cost: CostLimitsSchema.optional()
});

export const RetryPolicyObligationSchema = z.object({
  max_attempts: z.number().optional(),
  backoff_strategy: z.enum(['fixed', 'linear', 'exponential']).optional(),
  initial_delay_ms: z.number().optional(),
  max_delay_ms: z.number().optional()
});

export const FallbackObligationSchema = z.object({
  enabled: z.boolean().optional(),
  fallback_client: z.string().optional(),
  degrade_gracefully: z.boolean().optional()
});

export const EscalationObligationSchema = z.object({
  enabled: z.boolean().optional(),
  threshold: z.enum(['error', 'warning', 'critical']).optional(),
  escalate_to: z.string().optional(),
  timeout_ms: z.number().optional()
});

export const ReportingObligationSchema = z.object({
  notify_on_failure: z.boolean().optional(),
  include_stack_trace: z.boolean().optional(),
  include_context: z.boolean().optional()
});

export const ErrorHandlingObligationsSchema = z.object({
  retry_policy: RetryPolicyObligationSchema.optional(),
  fallback: FallbackObligationSchema.optional(),
  escalation: EscalationObligationSchema.optional(),
  reporting: ReportingObligationSchema.optional()
});

export const DataRetentionObligationSchema = z.object({
  task_history_days: z.number().optional(),
  audit_logs_days: z.number().optional(),
  output_cache_hours: z.number().optional()
});

export const PiiHandlingObligationSchema = z.object({
  detect: z.boolean().optional(),
  mask: z.boolean().optional(),
  log_sanitized_only: z.boolean().optional()
});

export const EthicsCheckObligationSchema = z.object({
  enabled: z.boolean().optional(),
  prohibited_content: z.array(z.string()).optional(),
  review_threshold: z.number().min(0).max(1).optional()
});

export const LawfulUseObligationSchema = z.object({
  terms_accepted: z.boolean().optional(),
  license: z.string().optional(),
  restricted_domains: z.array(z.string()).optional()
});

export const ComplianceObligationsSchema = z.object({
  data_retention: DataRetentionObligationSchema.optional(),
  pii_handling: PiiHandlingObligationSchema.optional(),
  ethics_check: EthicsCheckObligationSchema.optional(),
  lawful_use: LawfulUseObligationSchema.optional()
});

export const ObligationsSchema = z.object({
  version: z.string().default('1.0.0'),
  output_quality: OutputQualityObligationsSchema.optional(),
  performance: PerformanceObligationsSchema.optional(),
  security: SecurityObligationsSchema.optional(),
  resource_limits: ResourceLimitsObligationsSchema.optional(),
  error_handling: ErrorHandlingObligationsSchema.optional(),
  compliance: ComplianceObligationsSchema.optional()
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CV SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

export const LineageSchema = z.object({
  parent_id: z.string().optional(),
  template_origin: z.string().optional(),
  cloned_from: z.string().optional()
});

export const IdentitySchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  description: z.string().max(1000).optional(),
  lineage: LineageSchema.optional()
});

export const CapabilitiesSchema = z.object({
  languages: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  ai_features: z.object({
    max_context_tokens: z.number().min(1000).optional(),
    supports_streaming: z.boolean().default(true),
    supports_vision: z.boolean().default(false),
    supports_function_calling: z.boolean().default(true),
    supports_parallel_tool_calls: z.boolean().default(false)
  }).optional()
});

export const ExecutionConfigSchema = z.object({
  preferred_client: z.enum(['claude', 'kimi', 'codex', 'auto']).default('auto'),
  fallback_clients: z.array(z.enum(['claude', 'kimi', 'codex'])).default([]),
  parallelizable: z.boolean().default(false),
  retry_policy: z.object({
    max_retries: z.number().min(0).default(3),
    backoff: z.enum(['fixed', 'linear', 'exponential']).default('exponential'),
    initial_delay_ms: z.number().default(1000),
    max_delay_ms: z.number().default(30000)
  }).optional(),
  timeout: z.number().min(1000).default(300000)
});

export const ResourcesSchema = z.object({
  min_memory: z.number().min(0).default(256),
  max_memory: z.number().min(0).default(2048),
  priority: z.number().min(1).max(10).default(5),
  cpu_cores: z.number().min(1).default(1)
});

export const SpecializationSchema = z.object({
  primary: z.string().default('generalist'),
  secondary: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  experience: z.object({
    years: z.number().min(0).optional(),
    projects: z.array(z.string()).optional()
  }).optional()
});

export const LifecycleSchema = z.object({
  status: z.enum(['active', 'idle', 'suspended', 'deprecated', 'draft']).default('draft'),
  max_lifetime: z.number().min(0).default(3600000),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
  expires_at: z.number().optional()
});

export const MetadataSchema = z.object({
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  category: z.enum(['system', 'general', 'specialist', 'coordinator', 'worker', 'test']).default('general'),
  domain: z.string().optional()
});

export const PerformanceMetricsSchema = z.object({
  success_rate: z.number().min(0).max(1).optional(),
  avg_latency: z.number().min(0).optional(),
  quality_score: z.number().min(0).max(100).optional(),
  tasks_completed: z.number().min(0).optional(),
  tasks_succeeded: z.number().min(0).optional(),
  tasks_failed: z.number().min(0).optional(),
  last_updated: z.number().optional()
});

export const CVSchema = z.object({
  identity: IdentitySchema,
  capabilities: CapabilitiesSchema,
  rights: RightsSchema.optional(),
  obligations: ObligationsSchema.optional(),
  execution: ExecutionConfigSchema.default({}),
  resources: ResourcesSchema.default({}),
  specialization: SpecializationSchema.default({}),
  lifecycle: LifecycleSchema.default({}),
  metadata: MetadataSchema.default({}),
  performance: PerformanceMetricsSchema.optional()
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

export function validateCV(data) {
  try {
    const validated = CVSchema.parse(data);
    return { valid: true, data: validated, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, data: null, errors };
    }
    return { valid: false, data: null, errors: [error.message] };
  }
}

export function validatePartialCV(data) {
  try {
    const validated = CVSchema.partial().parse(data);
    return { valid: true, data: validated, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, data: null, errors };
    }
    return { valid: false, data: null, errors: [error.message] };
  }
}

export function validateRights(data) {
  try {
    const validated = RightsSchema.parse(data);
    return { valid: true, data: validated, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, data: null, errors };
    }
    return { valid: false, data: null, errors: [error.message] };
  }
}

export function validateObligations(data) {
  try {
    const validated = ObligationsSchema.parse(data);
    return { valid: true, data: validated, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, data: null, errors };
    }
    return { valid: false, data: null, errors: [error.message] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

export function createDefaultCV(id, name) {
  return {
    identity: {
      id,
      name,
      version: '1.0.0',
      description: ''
    },
    capabilities: {
      languages: [],
      domains: [],
      tools: [],
      ai_features: {
        max_context_tokens: 100000,
        supports_streaming: true,
        supports_vision: false,
        supports_function_calling: true,
        supports_parallel_tool_calls: false
      }
    },
    rights: {
      version: '1.0.0',
      execution: {
        operations: ['read', 'write'],
        sandbox: {
          enabled: true,
          network: false,
          filesystem: 'isolated'
        }
      },
      communication: {
        can_talk_to: [],
        delegation_depth: 0
      },
      admin: {
        can_create_cv: false,
        can_update_own_cv: true,
        can_update_others_cv: false,
        can_delete_cv: false,
        can_view_audit: false,
        can_modify_system_config: false
      }
    },
    obligations: {
      version: '1.0.0',
      output_quality: {
        format: {
          default: 'markdown',
          structure_required: false
        }
      },
      performance: {
        response_time: {
          timeout_absolute_ms: 300000
        }
      },
      security: {
        audit_logging: {
          level: 'standard',
          events: ['task_start', 'task_complete', 'error']
        }
      },
      resource_limits: {
        tokens: {
          per_request: 100000,
          warning_threshold: 0.8
        },
        compute: {
          max_execution_time_ms: 300000
        }
      }
    },
    execution: {
      preferred_client: 'auto',
      fallback_clients: [],
      parallelizable: false,
      retry_policy: {
        max_retries: 3,
        backoff: 'exponential',
        initial_delay_ms: 1000,
        max_delay_ms: 30000
      },
      timeout: 300000
    },
    resources: {
      min_memory: 256,
      max_memory: 2048,
      priority: 5,
      cpu_cores: 1
    },
    specialization: {
      primary: 'generalist',
      secondary: [],
      certifications: []
    },
    lifecycle: {
      status: 'draft',
      max_lifetime: 3600000,
      created_at: Date.now()
    },
    metadata: {
      author: 'system',
      tags: [],
      category: 'general'
    }
  };
}

export function sanitizeCV(cv) {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(cv)) {
    if (value === undefined || value === null) continue;
    
    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = sanitizeCV(value);
      if (Object.keys(nested).length > 0) {
        sanitized[key] = nested;
      }
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export function diffCVs(cv1, cv2) {
  const added = {};
  const removed = {};
  const changed = {};
  
  const allKeys = new Set([...Object.keys(cv1), ...Object.keys(cv2)]);
  
  for (const key of allKeys) {
    if (!(key in cv1)) {
      added[key] = cv2[key];
    } else if (!(key in cv2)) {
      removed[key] = cv1[key];
    } else if (JSON.stringify(cv1[key]) !== JSON.stringify(cv2[key])) {
      if (typeof cv1[key] === 'object' && typeof cv2[key] === 'object' &&
          !Array.isArray(cv1[key]) && !Array.isArray(cv2[key])) {
        const nested = diffCVs(cv1[key], cv2[key]);
        if (Object.keys(nested.added).length || 
            Object.keys(nested.removed).length || 
            Object.keys(nested.changed).length) {
          changed[key] = nested;
        }
      } else {
        changed[key] = { from: cv1[key], to: cv2[key] };
      }
    }
  }
  
  return { added, removed, changed };
}

export function mergeCVs(base, override) {
  const result = JSON.parse(JSON.stringify(base));
  
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = mergeCVs(result[key], value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

export default {
  CVSchema,
  RightsSchema,
  ObligationsSchema,
  validateCV,
  validatePartialCV,
  validateRights,
  validateObligations,
  createDefaultCV,
  sanitizeCV,
  diffCVs,
  mergeCVs
};
