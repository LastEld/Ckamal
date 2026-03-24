/**
 * Subscription-backed runtime attachment for router executors.
 *
 * This keeps the router aligned with local operator-managed surfaces without
 * forcing external binaries or API clients to boot during plain router tests.
 */

import {
  ClientFactory,
  getModelRuntimeCandidates,
  getSubscriptionModelProfiles,
  resolveModelRuntime
} from '../clients/index.js';

const EXECUTOR_MODE_PRIORITY = Object.freeze(['cli', 'app', 'desktop', 'vscode']);

function normalizeFiles(files) {
  if (!Array.isArray(files)) {
    return undefined;
  }

  return files.map((file) => {
    if (typeof file === 'string') {
      return file;
    }

    return file?.path || file?.name || JSON.stringify(file);
  });
}

function buildClientTask(task) {
  return {
    ...task,
    description: task.description ||
      task.content ||
      task.prompt ||
      task.message ||
      `Execute ${task.type || 'task'}`,
    files: normalizeFiles(task.files)
  };
}

function buildExecutionOptions(task, binding) {
  return {
    context: task.context,
    cwd: task.cwd,
    files: normalizeFiles(task.files),
    maxTokens: task.maxTokens,
    model: binding.clientModel,
    temperature: task.temperature,
    timeout: task.timeout
  };
}

/**
 * Manages shared client instances for subscription-backed router executors.
 */
export class SubscriptionRuntimeManager {
  constructor(options = {}) {
    this.factory = options.factory || ClientFactory;
    this.skipUnavailable = options.skipUnavailable ?? true;
    this.clientOptions = options.clientOptions || {};
    this.sharedClients = new Map();
    this.registeredModels = new Set();
    this.runtimeBindings = new Map();
  }

  async registerExecutors(target) {
    const router = target?.router || target;

    if (!router || typeof router.registerExecutor !== 'function') {
      throw new Error('attachSubscriptionRuntime requires a router or RouterSystem target');
    }

    for (const profile of getSubscriptionModelProfiles()) {
      const bindings = this.getRuntimeCandidates(profile.id);
      if (bindings.length === 0) {
        continue;
      }

      let selectedBinding = null;
      let selectedClient = null;
      let lastError = null;

      for (const binding of bindings) {
        try {
          selectedClient = await this.getClient(binding);
          selectedBinding = binding;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (selectedBinding && selectedClient) {
        router.registerExecutor(profile.id, async (task) => {
          return selectedClient.execute(
            buildClientTask(task),
            buildExecutionOptions(task, selectedBinding)
          );
        });

        this.runtimeBindings.set(profile.id, selectedBinding);
        this.registeredModels.add(profile.id);

        if (typeof router.getModel === 'function') {
          const model = router.getModel(profile.id);
          if (model) {
            model.available = true;
          }
        }

        continue;
      }

      if (typeof router.getModel === 'function') {
        const model = router.getModel(profile.id);
        if (model) {
          model.available = false;
        }
      }

      if (!this.skipUnavailable && lastError) {
        throw lastError;
      }
    }

    return this.getRegisteredModels();
  }

  getRuntimeCandidates(modelId) {
    const binding = resolveModelRuntime(modelId);
    if (!binding) {
      return [];
    }

    const providerOptions = this.clientOptions[binding.provider] || {};
    const modeOptions = providerOptions.modes || {};
    const disabledModes = new Set(
      Object.entries(modeOptions)
        .filter(([, config]) => config === false)
        .map(([mode]) => mode === 'ide' ? 'vscode' : mode)
    );

    const candidates = getModelRuntimeCandidates(modelId).filter((candidate) => !disabledModes.has(candidate.mode));

    return candidates.sort((left, right) => {
      const leftPriority = EXECUTOR_MODE_PRIORITY.indexOf(left.mode);
      const rightPriority = EXECUTOR_MODE_PRIORITY.indexOf(right.mode);
      const normalizedLeft = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
      const normalizedRight = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;
      return normalizedLeft - normalizedRight;
    });
  }

  async getClient(binding) {
    const key = `${binding.provider}:${binding.mode}`;
    if (this.sharedClients.has(key)) {
      return this.sharedClients.get(key);
    }

    const providerOptions = this.clientOptions[binding.provider] || {};
    const modeOptions = providerOptions.modes?.[binding.mode] || {};

    const client = await this.factory.create(binding.provider, binding.mode, {
      ...binding.defaultConfig,
      ...providerOptions,
      ...modeOptions,
      model: modeOptions.model || providerOptions.model || binding.clientModel
    });

    if (typeof client.initialize === 'function') {
      await client.initialize();
    }

    this.sharedClients.set(key, client);
    return client;
  }

  getRegisteredModels() {
    return [...this.registeredModels];
  }

  getBinding(modelId) {
    return this.runtimeBindings.get(modelId) || null;
  }

  async shutdown() {
    for (const client of this.sharedClients.values()) {
      if (typeof client.disconnect === 'function') {
        await client.disconnect();
      }
    }

    this.sharedClients.clear();
    this.registeredModels.clear();
    this.runtimeBindings.clear();
  }
}

export async function attachSubscriptionRuntime(target, options = {}) {
  const runtime = options.runtime instanceof SubscriptionRuntimeManager
    ? options.runtime
    : new SubscriptionRuntimeManager(options);

  await runtime.registerExecutors(target);

  if (target && typeof target === 'object' && 'router' in target) {
    target.subscriptionRuntime = runtime;
  }

  return runtime;
}
