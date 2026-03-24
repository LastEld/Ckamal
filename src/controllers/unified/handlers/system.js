/**
 * @fileoverview System Handler - Health, stats, and configuration tools
 * @module controllers/unified/handlers/system
 */

import { z } from 'zod';
import { execSync } from 'child_process';
import os from 'os';

/**
 * System information and health check tools
 * @const {Object}
 */
export const systemTools = {
  /**
   * Health check tool
   * @param {Object} params
   * @param {boolean} [params.detailed=false] - Include detailed health info
   * @returns {Promise<Object>} Health status
   */
  'system.health': async (params) => {
    const detailed = params.detailed ?? false;
    const startTime = Date.now();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || 'unknown',
    };

    if (detailed) {
      health.memory = {
        used: process.memoryUsage(),
        total: os.totalmem(),
        free: os.freemem(),
      };
      health.cpu = {
        loadavg: os.loadavg(),
        cpus: os.cpus().length,
      };
      health.platform = {
        os: os.platform(),
        arch: os.arch(),
        node: process.version,
      };
    }

    // Check critical thresholds
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    if (heapUsedPercent > 90) {
      health.status = 'degraded';
      health.warnings = ['High memory usage detected'];
    }

    health.checkDuration = Date.now() - startTime;
    return health;
  },

  /**
   * Get system statistics
   * @param {Object} params
   * @param {string} [params.period='1h'] - Stats period (1h, 24h, 7d)
   * @returns {Promise<Object>} System statistics
   */
  'system.stats': async (params) => {
    const period = params.period || '1h';
    const periodMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    }[period] || 60 * 60 * 1000;

    return {
      period,
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      cpu: {
        usage: process.cpuUsage(),
        loadavg: os.loadavg(),
      },
      resources: {
        uptime: process.uptime(),
        pid: process.pid,
        ppid: process.ppid,
      },
    };
  },

  /**
   * Get or set configuration
   * @param {Object} params
   * @param {string} [params.key] - Config key to get/set
   * @param {any} [params.value] - Value to set
   * @param {Object} [params.values] - Multiple values to set
   * @returns {Promise<Object>} Configuration
   */
  'system.config': async (params) => {
    // In a real implementation, this would interact with a config store
    const configStore = globalThis.__CONFIG_STORE || new Map();
    
    if (params.values && typeof params.values === 'object') {
      // Batch set
      for (const [k, v] of Object.entries(params.values)) {
        configStore.set(k, v);
      }
      return { updated: Object.keys(params.values) };
    }

    if (params.key && params.value !== undefined) {
      // Single set
      configStore.set(params.key, params.value);
      return { [params.key]: params.value };
    }

    if (params.key) {
      // Single get
      return { [params.key]: configStore.get(params.key) };
    }

    // Get all
    return Object.fromEntries(configStore);
  },

  /**
   * Get system info
   * @returns {Promise<Object>} System information
   */
  'system.info': async () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      node: {
        version: process.version,
        env: process.env.NODE_ENV || 'development',
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
      },
      cpus: os.cpus().length,
      network: Object.entries(os.networkInterfaces()).map(([name, interfaces]) => ({
        name,
        addresses: interfaces.map(i => ({ address: i.address, family: i.family })),
      })),
    };
  },

  /**
   * Log a system message
   * @param {Object} params
   * @param {string} params.level - Log level (debug, info, warn, error)
   * @param {string} params.message - Log message
   * @param {Object} [params.metadata] - Additional metadata
   * @returns {Promise<Object>} Log entry
   */
  'system.log': async (params) => {
    const { level = 'info', message, metadata = {} } = params;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      pid: process.pid,
    };

    // In production, this would write to a proper logging system
    const logFn = console[level] || console.log;
    logFn(`[${entry.timestamp}] ${level.toUpperCase()}: ${message}`, metadata);

    return entry;
  },
};

/**
 * Schemas for system tools
 * @const {Object}
 */
export const systemSchemas = {
  'system.health': z.object({
    detailed: z.boolean().optional(),
  }),

  'system.stats': z.object({
    period: z.enum(['1h', '24h', '7d']).optional(),
  }),

  'system.config': z.object({
    key: z.string().optional(),
    value: z.any().optional(),
    values: z.record(z.any()).optional(),
  }),

  'system.info': z.object({}),

  'system.log': z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    message: z.string().min(1).max(10000),
    metadata: z.record(z.any()).optional(),
  }),
};

/**
 * Descriptions for system tools
 * @const {Object}
 */
export const systemDescriptions = {
  'system.health': 'Check system health status',
  'system.stats': 'Get system statistics',
  'system.config': 'Get or set configuration values',
  'system.info': 'Get system information',
  'system.log': 'Log a system message',
};

/**
 * Tags for system tools
 * @const {Object}
 */
export const systemTags = {
  'system.health': ['system', 'health', 'monitoring'],
  'system.stats': ['system', 'stats', 'metrics'],
  'system.config': ['system', 'config'],
  'system.info': ['system', 'info'],
  'system.log': ['system', 'logging'],
};

export default systemTools;
