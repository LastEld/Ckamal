/**
 * @fileoverview CogniMesh HashiCorp Vault Integration
 * @module @cognimesh/security/vault
 * @description Secure secrets management with HashiCorp Vault
 * @version 5.0.0
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vault connection error class
 * @class VaultError
 * @extends Error
 */
export class VaultError extends Error {
  constructor(message, code = 'VAULT_ERROR', details = {}) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Secret metadata class
 * @class SecretMetadata
 */
export class SecretMetadata {
  constructor(data = {}) {
    this.version = data.version || 1;
    this.createdAt = data.created_time || new Date().toISOString();
    this.updatedAt = data.updated_time || new Date().toISOString();
    this.deletionTime = data.deletion_time || null;
    this.destroyed = data.destroyed || false;
    this.customMetadata = data.custom_metadata || {};
  }
}

/**
 * HashiCorp Vault Manager for secure secrets management
 * @class VaultManager
 */
export class VaultManager {
  constructor() {
    this.client = null;
    this.config = null;
    this.connected = false;
    this.localCache = new Map();
    this.cacheEnabled = true;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.fallbackEnabled = true;
    this.vaultModule = null;
    this.logger = console;
    
    // Secret path mappings
    this.pathMappings = {
      'api/anthropic': 'ANTHROPIC_API_KEY',
      'api/kimi': 'KIMI_API_KEY',
      'api/openai': 'OPENAI_API_KEY',
      'auth/github': 'GITHUB_TOKEN',
      'database/url': 'DATABASE_URL'
    };
    
    // Reverse mapping
    this.envToPath = Object.fromEntries(
      Object.entries(this.pathMappings).map(([k, v]) => [v, k])
    );
  }

  /**
   * Initialize Vault client module (lazy loading)
   * @private
   * @returns {Promise<boolean>} Whether vault module is available
   */
  async _initVaultModule() {
    if (this.vaultModule) return true;
    
    try {
      const require = createRequire(import.meta.url);
      this.vaultModule = require('node-vault');
      return true;
    } catch {
      this.logger.warn('[Vault] node-vault module not found, using fallback mode');
      return false;
    }
  }

  /**
   * Connect to HashiCorp Vault
   * @param {Object} config - Vault connection configuration
   * @param {string} config.endpoint - Vault server endpoint (e.g., 'http://localhost:8200')
   * @param {string} config.token - Vault authentication token
   * @param {string} [config.apiVersion='v1'] - Vault API version
   * @param {string} [config.namespace] - Vault namespace (for Vault Enterprise)
   * @param {boolean} [config.cacheEnabled=true] - Enable local caching
   * @param {number} [config.cacheTTL=300000] - Cache TTL in milliseconds
   * @param {boolean} [config.fallbackEnabled=true] - Enable fallback to env vars
   * @param {string} [config.mountPoint='secret'] - Default secrets engine mount point
   * @returns {Promise<boolean>} Connection success status
   */
  async connect(config = {}) {
    // Merge with environment defaults
    this.config = {
      endpoint: config.endpoint || process.env.VAULT_ADDR || 'http://localhost:8200',
      token: config.token || process.env.VAULT_TOKEN || process.env.VAULT_DEV_ROOT_TOKEN_ID,
      apiVersion: config.apiVersion || 'v1',
      namespace: config.namespace || process.env.VAULT_NAMESPACE,
      cacheEnabled: config.cacheEnabled !== false,
      cacheTTL: config.cacheTTL || 5 * 60 * 1000,
      fallbackEnabled: config.fallbackEnabled !== false,
      mountPoint: config.mountPoint || 'secret',
      ...config
    };

    this.cacheEnabled = this.config.cacheEnabled;
    this.cacheTTL = this.config.cacheTTL;
    this.fallbackEnabled = this.config.fallbackEnabled;

    // Check if vault module is available
    const hasVaultModule = await this._initVaultModule();
    
    if (!hasVaultModule) {
      this.connected = false;
      this.logger.warn('[Vault] Operating in fallback mode (env vars only)');
      return false;
    }

    // Validate required config
    if (!this.config.token) {
      this.logger.warn('[Vault] No token provided, operating in fallback mode');
      this.connected = false;
      return false;
    }

    try {
      // Create Vault client
      const clientOptions = {
        apiVersion: this.config.apiVersion,
        endpoint: this.config.endpoint,
        token: this.config.token
      };

      if (this.config.namespace) {
        clientOptions.namespace = this.config.namespace;
      }

      this.client = this.vaultModule(clientOptions);

      // Test connection by checking token status
      await this.client.tokenLookupSelf();
      
      this.connected = true;
      this.logger.info(`[Vault] Connected to ${this.config.endpoint}`);
      
      return true;
    } catch (error) {
      this.connected = false;
      this.logger.warn(`[Vault] Connection failed: ${error.message}. Fallback mode enabled.`);
      
      if (!this.fallbackEnabled) {
        throw new VaultError(
          'Failed to connect to Vault and fallback is disabled',
          'VAULT_CONNECTION_FAILED',
          { originalError: error.message }
        );
      }
      
      return false;
    }
  }

  /**
   * Normalize secret path to Vault format
   * @private
   * @param {string} path - Secret path
   * @returns {string} Normalized path
   */
  _normalizePath(path) {
    // Remove leading/trailing slashes
    path = path.replace(/^\/+|\/+$/g, '');
    
    // Handle KV v2 paths
    if (this.config?.apiVersion === 'v2' || !this.config?.apiVersion) {
      // For KV v2, data path is: {mount}/data/{path}
      if (!path.includes('/data/') && !path.startsWith('data/')) {
        const mount = this.config?.mountPoint || 'secret';
        return `${mount}/data/${path}`;
      }
    }
    
    return path;
  }

  /**
   * Get secret from environment variable fallback
   * @private
   * @param {string} path - Secret path
   * @returns {string|null} Secret value or null
   */
  _getFromEnv(path) {
    const envVar = this.pathMappings[path];
    if (envVar && process.env[envVar]) {
      this.logger.debug(`[Vault] Fallback: Retrieved ${path} from env var ${envVar}`);
      return process.env[envVar];
    }
    
    // Try direct env var lookup for custom paths
    const directEnv = path.toUpperCase().replace(/\//g, '_');
    if (process.env[directEnv]) {
      return process.env[directEnv];
    }
    
    return null;
  }

  /**
   * Get cache key for path
   * @private
   * @param {string} path - Secret path
   * @returns {string} Cache key
   */
  _getCacheKey(path) {
    return `vault:${path}`;
  }

  /**
   * Get cached value
   * @private
   * @param {string} path - Secret path
   * @returns {Object|null} Cached entry or null
   */
  _getCached(path) {
    if (!this.cacheEnabled) return null;
    
    const key = this._getCacheKey(path);
    const cached = this.localCache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() > cached.expiresAt) {
      this.localCache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  /**
   * Set cached value
   * @private
   * @param {string} path - Secret path
   * @param {*} value - Value to cache
   */
  _setCached(path, value) {
    if (!this.cacheEnabled) return;
    
    const key = this._getCacheKey(path);
    this.localCache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTTL
    });
  }

  /**
   * Clear cache for specific path or all paths
   * @param {string} [path] - Specific path to clear, or omit to clear all
   */
  clearCache(path) {
    if (path) {
      this.localCache.delete(this._getCacheKey(path));
    } else {
      this.localCache.clear();
    }
  }

  /**
   * Get a secret from Vault
   * @param {string} path - Secret path (e.g., 'api/anthropic')
   * @param {Object} [options] - Options
   * @param {boolean} [options.useCache=true] - Use cached value if available
   * @param {boolean} [options.allowFallback=true] - Allow fallback to env vars
   * @returns {Promise<string>} Secret value
   * @throws {VaultError} If secret not found and no fallback available
   */
  async getSecret(path, options = {}) {
    const { useCache = true, allowFallback = true } = options;
    
    // Check cache first
    if (useCache) {
      const cached = this._getCached(path);
      if (cached !== null) {
        return cached;
      }
    }
    
    // Try Vault if connected
    if (this.connected && this.client) {
      try {
        const normalizedPath = this._normalizePath(path);
        const response = await this.client.read(normalizedPath);
        
        // Extract secret value from KV v2 response
        let value;
        if (response.data?.data) {
          // KV v2 format
          value = response.data.data.value || response.data.data;
          if (typeof value === 'object') {
            value = JSON.stringify(value);
          }
        } else if (response.data) {
          value = response.data.value || response.data;
        }
        
        if (value !== undefined) {
          this._setCached(path, value);
          return value;
        }
      } catch (error) {
        this.logger.debug(`[Vault] Failed to read ${path}: ${error.message}`);
      }
    }
    
    // Fallback to environment variables
    if (allowFallback && this.fallbackEnabled) {
      const envValue = this._getFromEnv(path);
      if (envValue !== null) {
        this._setCached(path, envValue);
        return envValue;
      }
    }
    
    throw new VaultError(
      `Secret not found: ${path}`,
      'SECRET_NOT_FOUND',
      { path, vaultConnected: this.connected }
    );
  }

  /**
   * Store a secret in Vault
   * @param {string} path - Secret path
   * @param {string|Object} value - Secret value to store
   * @param {Object} [options] - Options
   * @param {Object} [options.metadata] - Custom metadata for the secret
   * @returns {Promise<SecretMetadata>} Stored secret metadata
   * @throws {VaultError} If store operation fails
   */
  async setSecret(path, value, options = {}) {
    if (!this.connected || !this.client) {
      throw new VaultError(
        'Cannot store secret: Vault not connected',
        'VAULT_NOT_CONNECTED',
        { path }
      );
    }
    
    try {
      const normalizedPath = this._normalizePath(path);
      const data = { value };
      
      // Add custom metadata if provided
      if (options.metadata) {
        data.custom_metadata = options.metadata;
      }
      
      const response = await this.client.write(normalizedPath, data);
      
      // Clear cache for this path
      this.clearCache(path);
      
      this.logger.info(`[Vault] Stored secret at ${path}`);
      
      return new SecretMetadata(response.data || response);
    } catch (error) {
      throw new VaultError(
        `Failed to store secret: ${error.message}`,
        'SECRET_STORE_FAILED',
        { path, originalError: error.message }
      );
    }
  }

  /**
   * Rotate a secret (generate new random value)
   * @param {string} path - Secret path to rotate
   * @param {Object} [options] - Rotation options
   * @param {number} [options.length=32] - Length of generated secret
   * @param {string} [options.prefix] - Prefix for generated secret
   * @returns {Promise<Object>} Rotation result with new value and metadata
   * @throws {VaultError} If rotation fails
   */
  async rotateSecret(path, options = {}) {
    const { length = 32, prefix = '' } = options;
    
    // Generate new random secret
    const newValue = prefix + crypto.randomBytes(length).toString('base64url');
    
    // Store the new secret
    const metadata = await this.setSecret(path, newValue, {
      metadata: {
        rotatedAt: new Date().toISOString(),
        rotationType: 'automatic'
      }
    });
    
    this.logger.info(`[Vault] Rotated secret at ${path}`);
    
    return {
      path,
      metadata,
      rotatedAt: metadata.updatedAt
    };
  }

  /**
   * Get multiple secrets from Vault in parallel
   * @param {string[]} paths - Array of secret paths
   * @param {Object} [options] - Options
   * @param {boolean} [options.useCache=true] - Use cached values if available
   * @param {boolean} [options.allowFallback=true] - Allow fallback to env vars
   * @returns {Promise<Record<string, string>>} Object mapping paths to values
   */
  async getSecrets(paths, options = {}) {
    const results = {};
    const errors = [];
    
    await Promise.all(
      paths.map(async (path) => {
        try {
          const value = await this.getSecret(path, options);
          results[path] = value;
        } catch (error) {
          errors.push({ path, error: error.message });
          results[path] = null;
        }
      })
    );
    
    if (errors.length > 0 && this.logger.warn) {
      this.logger.warn(`[Vault] Failed to retrieve ${errors.length} secrets`);
    }
    
    return results;
  }

  /**
   * Delete a secret from Vault
   * @param {string} path - Secret path to delete
   * @param {Object} [options] - Options
   * @param {boolean} [options.softDelete=true] - Soft delete (mark as deleted)
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  async deleteSecret(path, options = {}) {
    const { softDelete = true } = options;
    
    if (!this.connected || !this.client) {
      throw new VaultError(
        'Cannot delete secret: Vault not connected',
        'VAULT_NOT_CONNECTED'
      );
    }
    
    try {
      const normalizedPath = this._normalizePath(path);
      
      if (softDelete) {
        await this.client.delete(normalizedPath);
      } else {
        // For hard delete, use destroy endpoint for KV v2
        const destroyPath = normalizedPath.replace('/data/', '/destroy/');
        await this.client.request({
          path: destroyPath,
          method: 'POST'
        });
      }
      
      this.clearCache(path);
      this.logger.info(`[Vault] Deleted secret at ${path}`);
      
      return true;
    } catch (error) {
      throw new VaultError(
        `Failed to delete secret: ${error.message}`,
        'SECRET_DELETE_FAILED',
        { path, originalError: error.message }
      );
    }
  }

  /**
   * List secrets at a path
   * @param {string} path - Path to list
   * @returns {Promise<string[]>} Array of secret keys
   */
  async listSecrets(path) {
    if (!this.connected || !this.client) {
      throw new VaultError(
        'Cannot list secrets: Vault not connected',
        'VAULT_NOT_CONNECTED'
      );
    }
    
    try {
      const mount = this.config?.mountPoint || 'secret';
      const listPath = `${mount}/metadata/${path}`.replace(/\/+/g, '/');
      const response = await this.client.list(listPath);
      
      return response.data?.keys || [];
    } catch (error) {
      throw new VaultError(
        `Failed to list secrets: ${error.message}`,
        'SECRET_LIST_FAILED',
        { path, originalError: error.message }
      );
    }
  }

  /**
   * Get Vault connection status
   * @returns {Object} Connection status information
   */
  getStatus() {
    return {
      connected: this.connected,
      endpoint: this.config?.endpoint || null,
      cacheEnabled: this.cacheEnabled,
      cacheSize: this.localCache.size,
      fallbackEnabled: this.fallbackEnabled,
      namespace: this.config?.namespace || null,
      apiVersion: this.config?.apiVersion || 'v1'
    };
  }

  /**
   * Register a custom path mapping
   * @param {string} vaultPath - Vault secret path
   * @param {string} envVar - Environment variable name
   */
  registerPathMapping(vaultPath, envVar) {
    this.pathMappings[vaultPath] = envVar;
    this.envToPath[envVar] = vaultPath;
  }

  /**
   * Get all registered path mappings
   * @returns {Record<string, string>} Path to env var mappings
   */
  getPathMappings() {
    return { ...this.pathMappings };
  }

  /**
   * Initialize Vault with required secrets from environment
   * Useful for initial setup: reads from env and stores in Vault
   * @param {string[]} [paths] - Specific paths to initialize, or all known paths
   * @returns {Promise<Object>} Initialization results
   */
  async initializeFromEnv(paths) {
    if (!this.connected) {
      throw new VaultError(
        'Cannot initialize: Vault not connected',
        'VAULT_NOT_CONNECTED'
      );
    }
    
    const targetPaths = paths || Object.keys(this.pathMappings);
    const results = {
      imported: [],
      skipped: [],
      errors: []
    };
    
    for (const path of targetPaths) {
      const envVar = this.pathMappings[path];
      if (!envVar) {
        results.skipped.push({ path, reason: 'No mapping found' });
        continue;
      }
      
      const value = process.env[envVar];
      if (!value) {
        results.skipped.push({ path, reason: `Env var ${envVar} not set` });
        continue;
      }
      
      try {
        await this.setSecret(path, value, {
          metadata: {
            source: 'environment',
            importedAt: new Date().toISOString()
          }
        });
        results.imported.push({ path, envVar });
      } catch (error) {
        results.errors.push({ path, error: error.message });
      }
    }
    
    this.logger.info(`[Vault] Initialized ${results.imported.length} secrets from environment`);
    return results;
  }

  /**
   * Disconnect from Vault
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.connected = false;
    this.client = null;
    this.clearCache();
    this.logger.info('[Vault] Disconnected');
  }
}

// Singleton instance
export const vaultManager = new VaultManager();

// Convenience exports for common operations
export const getSecret = (path, options) => vaultManager.getSecret(path, options);
export const setSecret = (path, value, options) => vaultManager.setSecret(path, value, options);
export const rotateSecret = (path, options) => vaultManager.rotateSecret(path, options);
export const getSecrets = (paths, options) => vaultManager.getSecrets(paths, options);
export const connect = (config) => vaultManager.connect(config);

export default vaultManager;
