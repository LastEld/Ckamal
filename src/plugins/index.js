/**
 * @fileoverview Ckamal Plugin System
 * Central module for plugin management, exports the SDK, registry, and loader.
 * 
 * @module plugins/index
 * @version 1.0.0
 */

// SDK exports
export {
  definePlugin,
  createPluginContext,
  validateManifest,
  hashManifest,
  PLUGIN_API_VERSION,
  PLUGIN_CAPABILITIES,
  PLUGIN_STATUSES
} from './plugin-sdk.js';

// Registry exports
export {
  PluginRegistry,
  createPluginRegistry
} from './plugin-registry.js';

// Loader exports
export {
  PluginLoader,
  PluginWorker,
  createPluginLoader,
  JSONRPC_ERROR_CODES
} from './plugin-loader.js';

// Default exports
import { definePlugin, createPluginContext, validateManifest, hashManifest, PLUGIN_API_VERSION, PLUGIN_CAPABILITIES, PLUGIN_STATUSES } from './plugin-sdk.js';
import { PluginRegistry, createPluginRegistry } from './plugin-registry.js';
import { PluginLoader, PluginWorker, createPluginLoader, JSONRPC_ERROR_CODES } from './plugin-loader.js';

export default {
  // SDK
  definePlugin,
  createPluginContext,
  validateManifest,
  hashManifest,
  PLUGIN_API_VERSION,
  PLUGIN_CAPABILITIES,
  PLUGIN_STATUSES,
  // Registry
  PluginRegistry,
  createPluginRegistry,
  // Loader
  PluginLoader,
  PluginWorker,
  createPluginLoader,
  JSONRPC_ERROR_CODES
};
