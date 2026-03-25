/**
 * Subscription-backed provider catalog for operator-managed runtimes.
 *
 * The router still uses `costPer1kTokens` for heuristic scoring. For
 * subscription-backed surfaces these values are virtual routing weights, not
 * direct API billing rates.
 */

export const PROVIDER_SURFACES = Object.freeze({
  claude: Object.freeze({
    id: 'claude',
    name: 'Claude',
    subscriptionBacked: true,
    preferredModes: Object.freeze(['cli', 'desktop', 'vscode']),
    supportedModes: Object.freeze(['cli', 'desktop', 'vscode'])
  }),
  codex: Object.freeze({
    id: 'codex',
    name: 'Codex',
    subscriptionBacked: true,
    preferredModes: Object.freeze(['vscode', 'app', 'cli']),
    supportedModes: Object.freeze(['app', 'cli', 'vscode'])
  }),
  kimi: Object.freeze({
    id: 'kimi',
    name: 'Kimi',
    subscriptionBacked: true,
    preferredModes: Object.freeze(['vscode', 'cli']),
    supportedModes: Object.freeze(['cli', 'vscode'])
  })
});

export const MODEL_ALIASES = Object.freeze({
  'claude-opus-4': 'claude-opus-4-6',
  'claude-opus-4-5-latest': 'claude-opus-4-5',
  'kimi-k2': 'kimi-k2-5'
});

const SUBSCRIPTION_MODEL_PROFILES = Object.freeze([
  Object.freeze({
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    runtimeProvider: 'claude',
    billingModel: 'subscription',
    costPer1kTokens: 0.005,
    marginalCostPer1kTokens: 0,
    qualityScore: 0.99,
    avgLatencyMs: 1500,
    currentLoad: 0,
    maxConcurrency: 4,
    successRate: 0.97,
    capabilities: Object.freeze({
      features: Object.freeze(['analysis', 'code', 'extended_thinking', 'reasoning', 'vision']),
      maxTokens: 200000,
      languages: Object.freeze(['cpp', 'go', 'java', 'javascript', 'python', 'rust', 'typescript']),
      domains: Object.freeze(['analysis', 'coding', 'math', 'science', 'writing'])
    })
  }),
  Object.freeze({
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    runtimeProvider: 'claude',
    billingModel: 'subscription',
    costPer1kTokens: 0.004,
    marginalCostPer1kTokens: 0,
    qualityScore: 0.97,
    avgLatencyMs: 1800,
    currentLoad: 0,
    maxConcurrency: 4,
    successRate: 0.96,
    capabilities: Object.freeze({
      features: Object.freeze(['analysis', 'code', 'extended_thinking', 'reasoning', 'vision']),
      maxTokens: 200000,
      languages: Object.freeze(['cpp', 'go', 'java', 'javascript', 'python', 'rust', 'typescript']),
      domains: Object.freeze(['analysis', 'coding', 'math', 'science', 'writing'])
    })
  }),
  Object.freeze({
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    runtimeProvider: 'claude',
    billingModel: 'subscription',
    costPer1kTokens: 0.0022,
    marginalCostPer1kTokens: 0,
    qualityScore: 0.96,
    avgLatencyMs: 850,
    currentLoad: 0,
    maxConcurrency: 10,
    successRate: 0.98,
    capabilities: Object.freeze({
      features: Object.freeze(['code', 'computer_use', 'extended_thinking', 'reasoning', 'vision']),
      maxTokens: 200000,
      languages: Object.freeze(['cpp', 'go', 'java', 'javascript', 'python', 'rust', 'typescript']),
      domains: Object.freeze(['analysis', 'coding', 'math', 'writing'])
    })
  }),
  Object.freeze({
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    runtimeProvider: 'claude',
    billingModel: 'subscription',
    costPer1kTokens: 0.0019,
    marginalCostPer1kTokens: 0,
    qualityScore: 0.93,
    avgLatencyMs: 800,
    currentLoad: 0,
    maxConcurrency: 10,
    successRate: 0.97,
    capabilities: Object.freeze({
      features: Object.freeze(['code', 'extended_thinking', 'reasoning', 'vision']),
      maxTokens: 200000,
      languages: Object.freeze(['cpp', 'go', 'java', 'javascript', 'python', 'rust', 'typescript']),
      domains: Object.freeze(['analysis', 'coding', 'writing'])
    })
  }),
  Object.freeze({
    id: 'gpt-5.4-codex',
    name: 'GPT-5.4 Codex',
    provider: 'openai',
    runtimeProvider: 'codex',
    billingModel: 'subscription',
    costPer1kTokens: 0.0024,
    marginalCostPer1kTokens: 0,
    qualityScore: 0.97,
    avgLatencyMs: 700,
    currentLoad: 0,
    maxConcurrency: 12,
    successRate: 0.97,
    capabilities: Object.freeze({
      features: Object.freeze(['architecture', 'code', 'multifile', 'reasoning', 'vision']),
      maxTokens: 200000,
      languages: Object.freeze(['cpp', 'go', 'java', 'javascript', 'python', 'rust', 'typescript']),
      domains: Object.freeze(['analysis', 'architecture', 'coding'])
    })
  }),
  Object.freeze({
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    provider: 'openai',
    runtimeProvider: 'codex',
    billingModel: 'subscription',
    costPer1kTokens: 0.0008,
    marginalCostPer1kTokens: 0,
    qualityScore: 0.9,
    avgLatencyMs: 450,
    currentLoad: 0,
    maxConcurrency: 18,
    successRate: 0.96,
    capabilities: Object.freeze({
      features: Object.freeze(['code', 'edit', 'quick_tasks', 'reasoning']),
      maxTokens: 128000,
      languages: Object.freeze(['cpp', 'go', 'java', 'javascript', 'python', 'rust', 'typescript']),
      domains: Object.freeze(['analysis', 'coding'])
    })
  }),
  Object.freeze({
    id: 'kimi-k2-5',
    name: 'Kimi K2.5',
    provider: 'moonshot',
    runtimeProvider: 'kimi',
    billingModel: 'subscription',
    costPer1kTokens: 0.0009,
    marginalCostPer1kTokens: 0,
    qualityScore: 0.91,
    avgLatencyMs: 600,
    currentLoad: 0,
    maxConcurrency: 15,
    successRate: 0.96,
    capabilities: Object.freeze({
      features: Object.freeze(['code', 'long_context', 'multimodal', 'reasoning', 'thinking_mode']),
      maxTokens: 256000,
      languages: Object.freeze(['cpp', 'go', 'java', 'javascript', 'python', 'typescript']),
      domains: Object.freeze(['analysis', 'coding', 'writing'])
    })
  })
]);

const MODEL_RUNTIME_CANDIDATES = Object.freeze({
  'claude-opus-4-6': Object.freeze([
    Object.freeze({
      provider: 'claude',
      mode: 'desktop',
      clientModel: 'claude-opus-4-6',
      defaultConfig: Object.freeze({ preferApi: false })
    }),
    Object.freeze({
      provider: 'claude',
      mode: 'cli',
      clientModel: 'claude-opus-4-6',
      defaultConfig: Object.freeze({ preferApi: false })
    })
  ]),
  'claude-opus-4-5': Object.freeze([
    Object.freeze({
      provider: 'claude',
      mode: 'desktop',
      clientModel: 'claude-opus-4-5',
      defaultConfig: Object.freeze({ preferApi: false })
    }),
    Object.freeze({
      provider: 'claude',
      mode: 'cli',
      clientModel: 'claude-opus-4-5',
      defaultConfig: Object.freeze({ preferApi: false })
    })
  ]),
  'claude-sonnet-4-6': Object.freeze([
    Object.freeze({
      provider: 'claude',
      mode: 'vscode',
      clientModel: 'claude-sonnet-4-6',
      defaultConfig: Object.freeze({ preferApi: false })
    }),
    Object.freeze({
      provider: 'claude',
      mode: 'cli',
      clientModel: 'claude-sonnet-4-6',
      defaultConfig: Object.freeze({ preferApi: false })
    })
  ]),
  'claude-sonnet-4-5': Object.freeze([
    Object.freeze({
      provider: 'claude',
      mode: 'cli',
      clientModel: 'claude-sonnet-4-5',
      defaultConfig: Object.freeze({ preferApi: false })
    }),
    Object.freeze({
      provider: 'claude',
      mode: 'vscode',
      clientModel: 'claude-sonnet-4-5',
      defaultConfig: Object.freeze({ preferApi: false })
    })
  ]),
  'gpt-5.4-codex': Object.freeze([
    Object.freeze({
      provider: 'codex',
      mode: 'vscode',
      clientModel: 'gpt-5.4-codex',
      defaultConfig: Object.freeze({ preferApi: false })
    }),
    Object.freeze({
      provider: 'codex',
      mode: 'app',
      clientModel: 'gpt-5.4-codex',
      defaultConfig: Object.freeze({ preferApi: false })
    }),
    Object.freeze({
      provider: 'codex',
      mode: 'cli',
      clientModel: 'gpt-5.4-codex',
      defaultConfig: Object.freeze({ preferApi: false })
    })
  ]),
  'gpt-5.3-codex': Object.freeze([
    Object.freeze({
      provider: 'codex',
      mode: 'cli',
      clientModel: 'gpt-5.3-codex',
      defaultConfig: Object.freeze({ preferApi: false })
    })
  ]),
  'kimi-k2-5': Object.freeze([
    Object.freeze({
      provider: 'kimi',
      mode: 'vscode',
      clientModel: 'kimi-k2-5',
      defaultConfig: Object.freeze({ preferApi: false })
    }),
    Object.freeze({
      provider: 'kimi',
      mode: 'cli',
      clientModel: 'kimi-k2-5',
      defaultConfig: Object.freeze({ preferApi: false })
    })
  ])
});

function buildCanonicalSubscriptionSurfaceMatrix() {
  return SUBSCRIPTION_MODEL_PROFILES.map((profile) => {
    const bindings = MODEL_RUNTIME_CANDIDATES[profile.id] || [];
    const surfaces = [...new Set(bindings.map((binding) => normalizeRuntimeMode(binding.mode)))];

    return Object.freeze({
      modelId: profile.id,
      name: profile.name,
      provider: profile.provider,
      runtimeProvider: profile.runtimeProvider,
      surfaces: Object.freeze(surfaces),
      bindings: Object.freeze(
        bindings.map((binding) => Object.freeze({
          provider: binding.provider,
          mode: binding.mode,
          clientModel: binding.clientModel
        }))
      )
    });
  });
}

const CANONICAL_SUBSCRIPTION_SURFACE_MATRIX = Object.freeze(buildCanonicalSubscriptionSurfaceMatrix());
const EXPECTED_CANONICAL_SURFACES = Object.freeze({
  'claude-opus-4-6': Object.freeze(['desktop', 'cli']),
  'claude-opus-4-5': Object.freeze(['desktop', 'cli']),
  'claude-sonnet-4-6': Object.freeze(['vscode', 'cli']),
  'claude-sonnet-4-5': Object.freeze(['cli', 'vscode']),
  'gpt-5.4-codex': Object.freeze(['vscode', 'app', 'cli']),
  'gpt-5.3-codex': Object.freeze(['cli']),
  'kimi-k2-5': Object.freeze(['vscode', 'cli'])
});

function normalizeRuntimeMode(mode) {
  return mode || null;
}

export const SUBSCRIPTION_FALLBACK_CHAINS = Object.freeze({
  standard: Object.freeze([
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'gpt-5.4-codex',
    'gpt-5.3-codex'
  ]),
  premium: Object.freeze([
    'claude-opus-4-6',
    'claude-opus-4-5',
    'claude-sonnet-4-6',
    'gpt-5.4-codex'
  ]),
  economy: Object.freeze([
    'gpt-5.3-codex',
    'kimi-k2-5',
    'claude-sonnet-4-5'
  ]),
  speed: Object.freeze([
    'gpt-5.3-codex',
    'kimi-k2-5',
    'claude-sonnet-4-6'
  ])
});

export function normalizeModelId(modelId) {
  if (!modelId) {
    return modelId;
  }

  return MODEL_ALIASES[modelId] || modelId;
}

export function getOperatorProviderCatalog() {
  return Object.values(PROVIDER_SURFACES).map((provider) => ({
    ...provider,
    preferredModes: [...provider.preferredModes],
    supportedModes: [...provider.supportedModes]
  }));
}

export function getSubscriptionModelProfiles() {
  return SUBSCRIPTION_MODEL_PROFILES.map((profile) => ({
    ...profile,
    capabilities: {
      ...profile.capabilities,
      features: [...profile.capabilities.features],
      languages: [...profile.capabilities.languages],
      domains: [...profile.capabilities.domains]
    }
  }));
}

export function getCanonicalSubscriptionSurfaceMatrix() {
  return CANONICAL_SUBSCRIPTION_SURFACE_MATRIX.map((entry) => ({
    ...entry,
    surfaces: [...entry.surfaces],
    bindings: entry.bindings.map((binding) => ({
      ...binding
    }))
  }));
}

export function verifyCanonicalSubscriptionSurfaceMatrix() {
  const matrix = getCanonicalSubscriptionSurfaceMatrix();
  const providerCatalog = new Map(
    getOperatorProviderCatalog().map((provider) => [provider.id, provider])
  );
  const issues = [];

  for (const entry of matrix) {
    const expected = EXPECTED_CANONICAL_SURFACES[entry.modelId];
    if (!expected) {
      issues.push(`Unexpected canonical model entry: ${entry.modelId}`);
      continue;
    }

    if (entry.surfaces.length !== expected.length || entry.surfaces.some((surface, index) => surface !== expected[index])) {
      issues.push(
        `${entry.modelId} surfaces drifted: expected ${expected.join(', ')}, got ${entry.surfaces.join(', ')}`
      );
    }

    const provider = providerCatalog.get(entry.runtimeProvider);
    if (!provider) {
      issues.push(`Missing provider surface for runtimeProvider=${entry.runtimeProvider}`);
      continue;
    }

    const unsupported = entry.surfaces.filter((surface) => !provider.supportedModes.includes(surface));
    if (unsupported.length > 0) {
      issues.push(
        `${entry.modelId} exposes unsupported surfaces: ${unsupported.join(', ')}`
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    matrix
  };
}

export function getModelRuntimeCandidates(modelId, options = {}) {
  const canonicalModelId = normalizeModelId(modelId);
  const bindings = MODEL_RUNTIME_CANDIDATES[canonicalModelId];

  if (!bindings) {
    return [];
  }

  const requestedMode = normalizeRuntimeMode(options.mode || options.preferredMode);
  const allowedModes = Array.isArray(options.availableModes)
    ? new Set(options.availableModes.map((mode) => normalizeRuntimeMode(mode)))
    : null;

  const candidates = bindings
    .filter((binding) => {
      if (requestedMode && binding.mode !== requestedMode) {
        return false;
      }

      if (allowedModes && allowedModes.size > 0 && !allowedModes.has(binding.mode)) {
        return false;
      }

      return true;
    })
    .map((binding) => ({
      canonicalModelId,
      provider: binding.provider,
      mode: binding.mode,
      clientModel: binding.clientModel,
      defaultConfig: { ...binding.defaultConfig }
    }));

  return candidates;
}

export function resolveModelRuntime(modelId, options = {}) {
  const [binding] = getModelRuntimeCandidates(modelId, options);
  return binding || null;
}

export function getDefaultFallbackChains() {
  return Object.fromEntries(
    Object.entries(SUBSCRIPTION_FALLBACK_CHAINS).map(([name, models]) => [name, [...models]])
  );
}
