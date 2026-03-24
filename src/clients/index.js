/**
 * CogniMesh Clients Module
 * Unified exports and factory helpers for operator-managed provider clients.
 */

import { BaseClient } from './base-client.js';
import { ClaudeCliClient } from './claude/cli.js';
import { ClaudeDesktopClient } from './claude/desktop.js';
import { ClaudeVSCodeClient, ClaudeIdeClient } from './claude/ide.js';
import { CodexCliClient } from './codex/cli.js';
import { CodexCopilotClient } from './codex/copilot.js';
import { CodexCursorClient } from './codex/cursor.js';
import { GPT54CodexAppClient } from './codex/app.js';
import { GPT54CodexVSCodeClient } from './codex/vscode.js';
import { KimiCliClient } from './kimi/cli.js';
import { KimiVSCodeClient, KimiIdeClient } from './kimi/ide.js';
import { KimiSwarmClient } from './kimi/swarm.js';
import {
  PROVIDER_SURFACES,
  getOperatorProviderCatalog,
  getModelRuntimeCandidates,
  getCanonicalSubscriptionSurfaceMatrix,
  verifyCanonicalSubscriptionSurfaceMatrix,
  getSubscriptionModelProfiles,
  normalizeModelId,
  resolveModelRuntime,
  getDefaultFallbackChains
} from './catalog.js';

export { BaseClient } from './base-client.js';
export { ClaudeCliClient } from './claude/cli.js';
export { ClaudeDesktopClient } from './claude/desktop.js';
export { ClaudeVSCodeClient, ClaudeIdeClient } from './claude/ide.js';
export { KimiCliClient } from './kimi/cli.js';
export { KimiVSCodeClient, KimiIdeClient } from './kimi/ide.js';
export { KimiSwarmClient } from './kimi/swarm.js';
export { CodexCliClient } from './codex/cli.js';
export { CodexCopilotClient } from './codex/copilot.js';
export { CodexCursorClient } from './codex/cursor.js';
export { GPT54CodexAppClient } from './codex/app.js';
export { GPT54CodexVSCodeClient } from './codex/vscode.js';
export {
  PROVIDER_SURFACES,
  getOperatorProviderCatalog,
  getModelRuntimeCandidates,
  getCanonicalSubscriptionSurfaceMatrix,
  verifyCanonicalSubscriptionSurfaceMatrix,
  getSubscriptionModelProfiles,
  normalizeModelId,
  resolveModelRuntime,
  getDefaultFallbackChains
} from './catalog.js';

const CLIENT_CLASS_MAP = Object.freeze({
  claude: Object.freeze({
    cli: ClaudeCliClient,
    desktop: ClaudeDesktopClient,
    ide: ClaudeVSCodeClient,
    vscode: ClaudeVSCodeClient
  }),
  kimi: Object.freeze({
    cli: KimiCliClient,
    ide: KimiVSCodeClient,
    swarm: KimiSwarmClient,
    vscode: KimiVSCodeClient
  }),
  codex: Object.freeze({
    app: GPT54CodexAppClient,
    cli: CodexCliClient,
    copilot: CodexCopilotClient,
    cursor: CodexCursorClient,
    vscode: GPT54CodexVSCodeClient
  })
});

/**
 * Client factory for provider- and model-aware instantiation.
 */
export class ClientFactory {
  static async create(provider, mode, config = {}) {
    const providerClasses = CLIENT_CLASS_MAP[provider];
    if (!providerClasses) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const ClientClass = providerClasses[mode];
    if (!ClientClass && !(provider === 'claude' && mode === 'mcp')) {
      throw new Error(`Unknown ${provider} mode: ${mode}`);
    }

    if (provider === 'claude' && mode === 'mcp') {
      const { ClaudeMcpClient } = await import('./claude/mcp.js');
      return new ClaudeMcpClient(config);
    }

    return new ClientClass(config);
  }

  static async createAsync(provider, mode, config = {}) {
    return this.create(provider, mode, config);
  }

  static async createFromModel(modelId, config = {}) {
    const binding = resolveModelRuntime(modelId);
    if (!binding) {
      throw new Error(`Unsupported subscription-backed model: ${modelId}`);
    }

    return this.create(binding.provider, binding.mode, {
      ...binding.defaultConfig,
      ...config,
      model: config.model || binding.clientModel
    });
  }

  static getSupportedProviders() {
    return Object.keys(CLIENT_CLASS_MAP);
  }

  static getSupportedModes(provider) {
    return provider && CLIENT_CLASS_MAP[provider]
      ? Object.keys(CLIENT_CLASS_MAP[provider])
      : [];
  }

  static getProviderCatalog() {
    return getOperatorProviderCatalog();
  }

  static getRuntimeForModel(modelId) {
    return resolveModelRuntime(modelId);
  }

  static getRuntimeCandidates(modelId, options = {}) {
    return getModelRuntimeCandidates(modelId, options);
  }

  static getCanonicalSubscriptionSurfaceMatrix() {
    return getCanonicalSubscriptionSurfaceMatrix();
  }

  static verifyCanonicalSubscriptionSurfaceMatrix() {
    return verifyCanonicalSubscriptionSurfaceMatrix();
  }
}

export default {
  BaseClient,
  ClaudeCliClient,
  ClaudeDesktopClient,
  ClaudeVSCodeClient,
  ClaudeIdeClient,
  KimiCliClient,
  KimiVSCodeClient,
  KimiIdeClient,
  KimiSwarmClient,
  CodexCliClient,
  CodexCopilotClient,
  CodexCursorClient,
  GPT54CodexAppClient,
  GPT54CodexVSCodeClient,
  ClientFactory,
  PROVIDER_SURFACES,
  getOperatorProviderCatalog,
  getModelRuntimeCandidates,
  getCanonicalSubscriptionSurfaceMatrix,
  verifyCanonicalSubscriptionSurfaceMatrix,
  getSubscriptionModelProfiles,
  normalizeModelId,
  resolveModelRuntime,
  getDefaultFallbackChains
};
