#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Configuration Management
 * @module config
 * @description Centralized configuration with environment loading and validation
 * @version 5.0.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import Vault manager for secure secrets (SEC-001)
import { vaultManager } from './security/vault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration error class
 * @class ConfigError
 * @extends Error
 */
export class ConfigError extends Error {
  constructor(message, code = 'CONFIG_ERROR') {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
  }
}

/**
 * Configuration class with environment-based defaults
 * @class Config
 */
export class Config {
  /**
   * Creates a new Config instance
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    const kimiApiKey = options.kimiApiKey ||
      process.env.KIMI_API_KEY ||
      process.env.MOONSHOT_API_KEY ||
      '';
    const runtimePolicy = {
      subscriptionOnly: options.subscriptionOnly !== undefined
        ? options.subscriptionOnly
        : process.env.SUBSCRIPTION_ONLY !== 'false',
      preferLocalClients: options.preferLocalClients !== undefined
        ? options.preferLocalClients
        : process.env.PREFER_LOCAL_CLIENTS !== 'false',
      // Metered API fallback is permanently disabled - subscription mode only
      allowMeteredApiFallback: false
    };
    const hasClaudeLocalSurface = Boolean(
      options.claudeSessionToken ||
      process.env.CLAUDE_SESSION_TOKEN ||
      options.claudeCliPath ||
      process.env.CLAUDE_CLI_PATH ||
      options.claudeSocketPath ||
      process.env.CLAUDE_VSCODE_SOCKET_PATH ||
      options.claudeDesktopUrl ||
      process.env.CLAUDE_DESKTOP_URL
    );
    const hasKimiLocalSurface = Boolean(
      options.kimiCliPath ||
      process.env.KIMI_CLI_PATH ||
      options.kimiSocketPath ||
      process.env.KIMI_VSCODE_SOCKET_PATH
    );
    const hasCodexLocalSurface = Boolean(
      options.codexCliPath ||
      process.env.CODEX_CLI_PATH ||
      options.codexAppUrl ||
      process.env.CODEX_APP_URL ||
      options.codexPort ||
      process.env.CODEX_VSCODE_PORT
    );

    // Server settings
    this.server = {
      port: options.port || parseInt(process.env.COGNIMESH_PORT, 10) || 3000,
      host: options.host || process.env.COGNIMESH_HOST || 'localhost',
      env: options.env || process.env.NODE_ENV || 'development',
      name: options.name || process.env.COGNIMESH_NAME || 'cognimesh-server',
      version: '5.0.0'
    };

    // Paths
    this.paths = {
      root: options.root || process.env.COGNIMESH_ROOT || path.resolve(__dirname, '..'),
      data: options.dataPath || process.env.COGNIMESH_DATA_DIR || path.join(process.env.COGNIMESH_ROOT || path.resolve(__dirname, '..'), 'data'),
      cache: options.cachePath || process.env.COGNIMESH_CACHE_DIR || path.join(process.env.COGNIMESH_ROOT || path.resolve(__dirname, '..'), 'cache'),
      logs: options.logsPath || process.env.COGNIMESH_LOGS_DIR || path.join(process.env.COGNIMESH_ROOT || path.resolve(__dirname, '..'), 'logs')
    };

    // Database
    this.database = {
      path: options.dbPath || process.env.DATABASE_PATH || path.join(this.paths.data, 'cognimesh.db'),
      maxConnections: options.dbMaxConnections || parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 10,
      busyTimeout: options.dbBusyTimeout || parseInt(process.env.DB_BUSY_TIMEOUT_MS, 10) || 5000,
      maxRetries: parseInt(process.env.DB_MAX_RETRIES, 10) || 5,
      retryDelay: parseInt(process.env.DB_RETRY_DELAY_MS, 10) || 200
    };

    // GitHub (for auto-updates)
    this.github = {
      token: options.githubToken || process.env.GITHUB_TOKEN || '',
      repo: options.githubRepo || process.env.GITHUB_REPO || 'cognimesh/cognimesh',
      autoUpdate: options.autoUpdate !== undefined ? options.autoUpdate : process.env.AUTO_UPDATE !== 'false',
      checkInterval: options.checkInterval || process.env.CHECK_INTERVAL || '1h'
    };

    // Clients (Claude, Kimi, Codex)
    // NOTE: API keys are optional - only used for test mode or direct-API fallback.
    // In subscription mode (the default), CogniMesh routes through local client
    // surfaces (Claude Code, Kimi CLI, Codex CLI) which use existing subscriptions.
    this.clients = {
      claude: {
        enabled: hasClaudeLocalSurface,
        sessionToken: options.claudeSessionToken || process.env.CLAUDE_SESSION_TOKEN || '',
        apiKey: process.env.ANTHROPIC_API_KEY || '',        // Optional: test mode only
        apiUrl: process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1',
        defaultModel: process.env.CLAUDE_DEFAULT_MODEL || 'claude-3-5-sonnet',
        maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS, 10) || 4096,
        temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.7,
        streamingEnabled: process.env.CLAUDE_STREAMING_ENABLED !== 'false',
        extendedThinkingEnabled: process.env.CLAUDE_EXTENDED_THINKING_ENABLED === 'true'
      },
      kimi: {
        enabled: hasKimiLocalSurface,
        apiKey: kimiApiKey,                                 // Optional: test mode only
        apiUrl: process.env.KIMI_API_URL || 'https://api.moonshot.cn/v1'
      },
      codex: {
        enabled: hasCodexLocalSurface,
        apiKey: process.env.OPENAI_API_KEY || '',            // Optional: test mode only
        apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1'
      }
    };

    this.runtime = runtimePolicy;

    // Direct API preference is permanently disabled - subscription mode only
    this.clients.claude.preferApi = false;
    this.clients.kimi.preferApi = false;
    this.clients.codex.preferApi = false;

    // BIOS settings
    this.bios = {
      mode: options.biosMode || process.env.BIOS_MODE || 'operational',
      logLevel: options.logLevel || process.env.LOG_LEVEL || 'info',
      maxAgents: options.maxAgents || parseInt(process.env.MAX_AGENTS, 10) || 50,
      autoUpdate: process.env.AUTO_UPDATE === 'true',
      regressionThreshold: parseFloat(process.env.REGRESSION_THRESHOLD) || 5.0
    };

    // WebSocket settings
    this.websocket = {
      enabled: options.wsEnabled !== undefined ? options.wsEnabled : process.env.WS_ENABLED !== 'false',
      port: options.wsPort || parseInt(process.env.WS_PORT, 10) || 8080,
      host: options.wsHost || process.env.WS_HOST || 'localhost',
      path: options.wsPath || process.env.WS_PATH || '/ws',
      heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS, 10) || 30000,
      maxPayload: parseInt(process.env.WS_MAX_PAYLOAD_MB, 10) || 50,
      requireAuth: process.env.WS_REQUIRE_AUTH === 'true',
      corsOrigin: process.env.WS_CORS_ORIGIN || '*',
      maxStreams: parseInt(process.env.WS_MAX_STREAMS, 10) || 100
    };

    // Dashboard settings
    this.dashboard = {
      enabled: options.dashboardEnabled !== undefined ? options.dashboardEnabled : process.env.DASHBOARD_ENABLED !== 'false',
      port: options.dashboardPort || parseInt(process.env.DASHBOARD_PORT, 10) || 3001,
      host: options.dashboardHost || process.env.DASHBOARD_HOST || '0.0.0.0',
      authEnabled: process.env.DASHBOARD_AUTH_ENABLED === 'true' || (process.env.NODE_ENV === 'production' && process.env.DASHBOARD_AUTH_ENABLED !== 'false'),
      jwtSecret: process.env.JWT_SECRET || 'cognimesh-secret-change-in-production'
    };

    // MCP settings
    this.mcp = {
      idleTimeout: parseInt(process.env.MCP_IDLE_TIMEOUT_MS, 10) || 0,
      parentWatchInterval: parseInt(process.env.MCP_PARENT_WATCH_INTERVAL_MS, 10) || 10000,
      serializeToolCalls: process.env.MCP_SERIALIZE_TOOL_CALLS !== 'false'
    };

    // Cache settings
    this.cache = {
      enabled: process.env.CACHE_ENABLED !== 'false',
      maxSize: parseInt(process.env.CACHE_MAX_SIZE, 10) || 1000,
      ttl: parseInt(process.env.CACHE_TTL_MS, 10) || 60000,
      checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD_MS, 10) || 120
    };

    // Security settings
    this.security = {
      mode: process.env.SECURITY_MODE || (this.isProduction ? 'enforced' : 'permissive'),
      requireAuth: process.env.REQUIRE_AUTH === 'true',
      jwtSecret: process.env.JWT_SECRET || '',
      apiKeyHeader: process.env.API_KEY_HEADER || 'X-API-Key',
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 min
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100
    };

    // Feature flags
    this.features = {
      taskManagement: process.env.FEATURE_TASKS !== 'false',
      roadmapManagement: process.env.FEATURE_ROADMAPS !== 'false',
      claudeIntegration: process.env.FEATURE_CLAUDE !== 'false',
      websocketServer: process.env.FEATURE_WEBSOCKET !== 'false',
      batchProcessing: process.env.FEATURE_BATCH !== 'false',
      streaming: process.env.FEATURE_STREAMING !== 'false',
      dashboard: process.env.FEATURE_DASHBOARD !== 'false'
    };
  }

  /**
   * Check if running in production mode
   * @returns {boolean}
   */
  get isProduction() {
    return this.server.env === 'production';
  }

  /**
   * Check if running in development mode
   * @returns {boolean}
   */
  get isDevelopment() {
    return this.server.env === 'development';
  }

  /**
   * Validate all required configuration settings
   * @returns {string[]} Array of validation errors (empty if valid)
   */
  validate() {
    const errors = [];

    // Validate server port
    if (this.server.port < 1 || this.server.port > 65535) {
      errors.push('server.port must be between 1 and 65535');
    }

    // Validate database path
    if (!this.database.path) {
      errors.push('database.path is required');
    }

    // Validate GitHub token in production
    if (this.isProduction && !this.github.token) {
      errors.push('github.token is required in production mode');
    }

    // Validate JWT secret in production
    if (this.isProduction && !this.security.jwtSecret) {
      errors.push('security.jwtSecret is required in production mode');
    }

    // Safety guards: these are hardcoded to false but validated as a safeguard
    // against programmatic override via merge() or set()
    if (this.runtime.allowMeteredApiFallback) {
      errors.push('runtime.allowMeteredApiFallback is disabled in subscription-only mode');
    }

    if (this.clients.claude.preferApi || this.clients.kimi.preferApi || this.clients.codex.preferApi) {
      errors.push('Direct API preference is disabled in subscription-only mode');
    }

    // Validate WebSocket settings
    if (this.websocket.enabled) {
      if (this.websocket.port < 1 || this.websocket.port > 65535) {
        errors.push('websocket.port must be between 1 and 65535');
      }
    }

    return errors;
  }

  /**
   * Load configuration from environment variables
   * @returns {Config} This config instance for chaining
   */
  loadFromEnv() {
    // Already loaded in constructor via process.env references
    return this;
  }

  /**
   * Load configuration from JSON file
   * @param {string} configPath - Path to config file
   * @returns {Config} This config instance for chaining
   */
  loadFromFile(configPath) {
    if (!fs.existsSync(configPath)) {
      throw new ConfigError(`Config file not found: ${configPath}`, 'CONFIG_FILE_NOT_FOUND');
    }

    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      this.merge(fileConfig);
    } catch (error) {
      throw new ConfigError(`Failed to parse config file: ${error.message}`, 'CONFIG_PARSE_ERROR');
    }

    return this;
  }

  /**
   * Merge configuration object into current config
   * @param {Object} config - Configuration to merge
   * @returns {Config} This config instance for chaining
   */
  merge(config) {
    const mergeDeep = (target, source) => {
      for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          target[key] = target[key] || {};
          mergeDeep(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
      return target;
    };

    mergeDeep(this, config);
    return this;
  }

  /**
   * Get a configuration value by path
   * @param {string} path - Dot-notation path (e.g., 'server.port')
   * @param {*} defaultValue - Default value if path not found
   * @returns {*} Configuration value
   */
  get(path, defaultValue = undefined) {
    const parts = path.split('.');
    let current = this;

    for (const part of parts) {
      if (current === null || current === undefined || !(part in current)) {
        return defaultValue;
      }
      current = current[part];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Set a configuration value by path
   * @param {string} path - Dot-notation path
   * @param {*} value - Value to set
   * @returns {Config} This config instance for chaining
   */
  set(path, value) {
    const parts = path.split('.');
    let current = this;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = value;
    return this;
  }

  /**
   * Check if a feature is enabled
   * @param {string} featureName - Feature name
   * @returns {boolean}
   */
  isFeatureEnabled(featureName) {
    return this.features[featureName] === true;
  }

  /**
   * Ensure required directories exist
   * @returns {Config} This config instance for chaining
   */
  ensureDirectories() {
    const dirs = [this.paths.data, this.paths.cache, this.paths.logs];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          console.error(`[Config] Created directory: ${dir}`);
        } catch (error) {
          console.error(`[Config] Failed to create directory ${dir}:`, error.message);
        }
      }
    }

    return this;
  }

  /**
   * Get sanitized config for logging (excludes secrets)
   * @returns {Object} Sanitized configuration
   */
  toSafeObject() {
    const clone = JSON.parse(JSON.stringify(this));

    // Redact sensitive fields
    if (clone.github?.token) clone.github.token = '[REDACTED]';
    if (clone.clients?.claude?.apiKey) clone.clients.claude.apiKey = '[REDACTED]';
    if (clone.clients?.claude?.sessionToken) clone.clients.claude.sessionToken = '[REDACTED]';
    if (clone.clients?.kimi?.apiKey) clone.clients.kimi.apiKey = '[REDACTED]';
    if (clone.clients?.codex?.apiKey) clone.clients.codex.apiKey = '[REDACTED]';
    if (clone.security?.jwtSecret) clone.security.jwtSecret = '[REDACTED]';
    if (clone.dashboard?.jwtSecret) clone.dashboard.jwtSecret = '[REDACTED]';

    return clone;
  }

  /**
   * Convert config to JSON string (sanitized)
   * @returns {string} JSON string
   */
  toJSON() {
    return JSON.stringify(this.toSafeObject(), null, 2);
  }
}

/**
 * Create and validate configuration
 * @param {Object} options - Configuration options
 * @returns {Config} Validated configuration instance
 * @throws {ConfigError} If validation fails
 */
export function createConfig(options = {}) {
  const config = new Config(options);
  config.ensureDirectories();

  const errors = config.validate();
  if (errors.length > 0) {
    throw new ConfigError(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`, 'CONFIG_VALIDATION_FAILED');
  }

  return config;
}

/**
 * Load configuration asynchronously
 * @param {Object} options - Configuration options
 * @returns {Promise<Config>} Validated configuration instance
 */
export async function loadConfig(options = {}) {
  const config = new Config(options);

  // Try to load from config files
  const configFiles = [
    path.join(config.paths.root, 'config', 'cognimesh.json'),
    path.join(config.paths.root, 'config', `cognimesh.${config.server.env}.json`)
  ];

  for (const configPath of configFiles) {
    if (fs.existsSync(configPath)) {
      try {
        config.loadFromFile(configPath);
        console.error(`[Config] Loaded from ${configPath}`);
      } catch (error) {
        console.error(`[Config] Error loading ${configPath}:`, error.message);
      }
    }
  }

  config.ensureDirectories();

  const errors = config.validate();
  if (errors.length > 0) {
    throw new ConfigError(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`, 'CONFIG_VALIDATION_FAILED');
  }

  return config;
}

/**
 * Get environment information
 * @returns {Object} Environment details
 */
export function getEnvironment() {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    pid: process.pid,
    cwd: process.cwd(),
    execPath: process.execPath
  };
}

/**
 * Load configuration with Vault secrets integration (SEC-001)
 * Replaces direct env var access with secure Vault retrieval
 * @param {Object} options - Configuration options
 * @returns {Promise<Config>} Config with secrets from Vault
 * @example
 * // Before: process.env.ANTHROPIC_API_KEY
 * // After: await loadConfigWithVault()
 */
export async function loadConfigWithVault(options = {}) {
  // Connect to Vault with fallback to env vars
  await vaultManager.connect({
    endpoint: options.vaultEndpoint || process.env.VAULT_ADDR,
    token: options.vaultToken || process.env.VAULT_TOKEN,
    fallbackEnabled: options.vaultFallback !== false,
    cacheEnabled: options.vaultCache !== false
  });

  const config = new Config(options);

  // Override secrets with Vault values
  try {
  // Non-billing secrets from Vault (with env var fallback)
  // Mapping: Vault path -> Config location
    const secretMappings = [
      { path: 'auth/github', target: 'github.token', env: 'GITHUB_TOKEN' },
      { path: 'security/jwt', target: 'security.jwtSecret', env: 'JWT_SECRET' },
      { path: 'security/jwt-dashboard', target: 'dashboard.jwtSecret', env: 'JWT_SECRET' }
    ];

    for (const mapping of secretMappings) {
      try {
        const value = await vaultManager.getSecret(mapping.path);
        if (value) {
          config.set(mapping.target, value);
        }
      } catch (error) {
        // Fallback to env var already set in constructor
        console.error(`[Config] Vault secret ${mapping.path} not available, using env var ${mapping.env}`);
      }
    }

    console.error('[Config] Loaded with Vault integration');
  } catch (error) {
    console.error('[Config] Vault integration failed, using env vars:', error.message);
  }

  config.ensureDirectories();

  const errors = config.validate();
  if (errors.length > 0) {
    throw new ConfigError(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`, 'CONFIG_VALIDATION_FAILED');
  }

  return config;
}

/**
 * Quick helper to get API keys from Vault or env
 * @param {string} provider - Provider name (anthropic, kimi, openai, github)
 * @returns {Promise<string>} API key
 */
export async function getApiKey(provider) {
  if (process.env.NODE_ENV !== 'test') {
    throw new ConfigError('API key helper is disabled in subscription-only runtime', 'NOT_CONFIGURED');
  }

  const pathMap = {
    anthropic: 'api/anthropic',
    claude: 'api/anthropic',
    kimi: 'api/kimi',
    openai: 'api/openai',
    codex: 'api/openai',
    github: 'auth/github'
  };

  const path = pathMap[provider.toLowerCase()];
  if (!path) {
    throw new ConfigError(`Unknown provider: ${provider}`);
  }

  // Ensure vault is connected
  if (!vaultManager.connected) {
    await vaultManager.connect({ fallbackEnabled: true });
  }

  return vaultManager.getSecret(path);
}

export default Config;
