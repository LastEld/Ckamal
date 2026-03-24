/**
 * Provider runtime commands
 * Shows subscription-backed runtime status and inspection.
 */

import * as f from './utils/formatters.js';
import {
  getDefaultFallbackChains,
  getModelRuntimeCandidates,
  getOperatorProviderCatalog,
  getSubscriptionModelProfiles,
  resolveModelRuntime
} from '../../clients/catalog.js';

export async function listProviders() {
  const providers = getOperatorProviderCatalog();
  const runtimes = getSubscriptionModelProfiles();

  let output = '';
  output += f.header('PROVIDER SURFACES', 'line');
  output += '\n\n';
  output += f.keyValue({
    Providers: String(providers.length),
    Runtimes: String(runtimes.length),
    Billing: 'subscription-backed'
  }, { indent: 2 });
  output += '\n\n';

  const rows = providers.map((provider) => ({
    ID: provider.id,
    Name: provider.name,
    'Preferred Modes': provider.preferredModes.join(', '),
    'Supported Modes': provider.supportedModes.join(', '),
    Subscription: String(provider.subscriptionBacked)
  }));

  output += f.table(rows, {
    columns: ['ID', 'Name', 'Preferred Modes', 'Supported Modes', 'Subscription']
  });

  return {
    success: true,
    output,
    data: { providers, runtimes }
  };
}

export async function statusProviders() {
  const runtimes = getSubscriptionModelProfiles();
  const fallbackChains = getDefaultFallbackChains();
  const providerRows = runtimes.map((runtime) => ({
    Model: runtime.id,
    Runtime: runtime.runtimeProvider,
    Billing: runtime.billingModel,
    Load: `${runtime.currentLoad}/${runtime.maxConcurrency}`,
    Latency: `${runtime.avgLatencyMs}ms`,
    Quality: `${Math.round(runtime.qualityScore * 100)}%`,
    Success: `${Math.round(runtime.successRate * 100)}%`
  }));

  const providerCount = Array.from(new Set(runtimes.map((runtime) => runtime.runtimeProvider))).length;

  let output = '';
  output += f.header('PROVIDER RUNTIME STATUS', 'line');
  output += '\n\n';
  output += f.keyValue({
    Providers: String(providerCount),
    Runtimes: String(runtimes.length),
    FallbackChains: String(Object.keys(fallbackChains).length)
  }, { indent: 2 });
  output += '\n\n';

  output += f.table(providerRows, {
    columns: ['Model', 'Runtime', 'Billing', 'Load', 'Latency', 'Quality', 'Success']
  });

  output += '\n\n';
  output += f.colorize('Fallback Chains', 'bright') + '\n';
  for (const [name, chain] of Object.entries(fallbackChains)) {
    output += `  ${name}: ${chain.join(' -> ')}\n`;
  }

  return {
    success: true,
    output,
    data: {
      runtimes,
      fallbackChains
    }
  };
}

export async function inspectProviderRuntime(modelId) {
  if (!modelId) {
    return {
      success: false,
      error: 'Runtime model ID is required',
      output: f.error('Runtime model ID is required. Usage: cognimesh providers inspect <model-id>')
    };
  }

  const runtime = resolveModelRuntime(modelId);
  const candidates = getModelRuntimeCandidates(modelId);
  const profiles = getSubscriptionModelProfiles();
  const profile = profiles.find((entry) => entry.id === runtime?.canonicalModelId || entry.id === modelId);

  if (!runtime || !profile) {
    return {
      success: false,
      error: `Runtime not found: ${modelId}`,
      output: f.error(`Runtime not found: ${modelId}`)
    };
  }

  const fallbackChains = getDefaultFallbackChains();
  const chainNames = Object.entries(fallbackChains)
    .filter(([, chain]) => chain.includes(profile.id))
    .map(([name]) => name);

  let output = '';
  output += f.header(profile.name.toUpperCase(), 'box');
  output += '\n\n';
    output += f.keyValue({
      Model: profile.id,
      Name: profile.name,
      Provider: profile.provider,
      RuntimeProvider: profile.runtimeProvider,
      Billing: profile.billingModel,
      ClientModel: runtime.clientModel,
      Mode: runtime.mode,
      Candidates: candidates.map((candidate) => candidate.mode).join(', '),
      Quality: profile.qualityScore,
      Latency: `${profile.avgLatencyMs}ms`,
      Concurrency: String(profile.maxConcurrency),
      CurrentLoad: String(profile.currentLoad),
    SuccessRate: `${Math.round(profile.successRate * 100)}%`
  }, { indent: 2 });

  output += '\n\n';
  output += f.colorize('Capabilities', 'bright') + '\n';
  output += f.keyValue({
    Features: profile.capabilities.features.join(', '),
    Languages: profile.capabilities.languages.join(', '),
    Domains: profile.capabilities.domains.join(', '),
    MaxTokens: String(profile.capabilities.maxTokens)
  }, { indent: 2 });

  if (chainNames.length > 0) {
    output += '\n\n';
    output += f.colorize('Fallback Chains', 'bright') + '\n';
    output += f.list(chainNames, { indent: 2 }) + '\n';
  }

  return {
    success: true,
    output,
    data: {
      runtime: profile,
      binding: runtime,
      candidates,
      fallbackChains: chainNames
    }
  };
}

export default {
  list: listProviders,
  status: statusProviders,
  inspect: inspectProviderRuntime,
  runtime: inspectProviderRuntime
};
