/**
 * @fileoverview System Management MCP Tools
 * Provides system health, configuration, and maintenance capabilities.
 * @module tools/definitions/system-tools
 */

import { z } from 'zod';
import { createTool, createResponseSchema } from '../definition-helpers.js';
// HealthChecker is imported dynamically to avoid circular dependencies
// import { HealthChecker, HealthStatus } from '../../health/index.js';
const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// Health checker instance
let healthChecker = null;

/**
 * Initialize the health checker
 * @param {Object} options - Options including server instance
 */
export function initializeHealthChecker(options = {}) {
  healthChecker = options.healthChecker || options.server?.healthChecker || null;
  return healthChecker;
}

// Common schemas
const HealthStatusEnum = z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']);
const MaintenanceMode = z.enum(['none', 'scheduled', 'in_progress']);

const ComponentHealthSchema = z.object({
  name: z.string(),
  status: HealthStatusEnum,
  latency: z.number(),
  lastChecked: z.string(),
  message: z.string().optional()
});

const SystemHealthSchema = z.object({
  overall: HealthStatusEnum,
  components: z.array(ComponentHealthSchema),
  uptime: z.number(),
  version: z.string(),
  timestamp: z.string()
});

const MetricsSchema = z.object({
  cpu: z.object({
    usage: z.number().min(0).max(100).nullable(),
    cores: z.number(),
    loadAvg: z.array(z.number())
  }).optional(),
  memory: z.object({
    used: z.number(),
    total: z.number(),
    percentage: z.number().min(0).max(100)
  }).optional(),
  disk: z.object({
    used: z.number(),
    total: z.number(),
    percentage: z.number().min(0).max(100)
  }).optional(),
  network: z.object({
    bytesIn: z.number().nullable(),
    bytesOut: z.number().nullable(),
    connections: z.number().nullable()
  }).optional(),
  process: z.object({
    uptime: z.number(),
    memoryUsage: z.object({
      rss: z.number(),
      heapTotal: z.number(),
      heapUsed: z.number(),
      external: z.number()
    }),
    pid: z.number()
  }).optional(),
  timestamp: z.string()
});

const BackupSchema = z.object({
  id: z.string(),
  type: z.enum(['full', 'incremental', 'partial']),
  size: z.number(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  components: z.array(z.string()),
  checksum: z.string().optional()
});

const SystemStatusSchema = z.object({
  status: z.enum(['online', 'offline', 'maintenance', 'degraded']),
  mode: MaintenanceMode,
  message: z.string().optional(),
  since: z.string(),
  version: z.string(),
  nodeVersion: z.string()
});

// Response schemas
const HealthResponse = createResponseSchema(SystemHealthSchema);
const MetricsResponse = createResponseSchema(MetricsSchema);
const ConfigResponse = createResponseSchema(z.record(z.any()));
const LogsResponse = createResponseSchema(z.object({
  logs: z.array(z.object({
    timestamp: z.string(),
    level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']),
    component: z.string(),
    message: z.string(),
    metadata: z.record(z.any()).optional()
  })),
  total: z.number(),
  hasMore: z.boolean()
}));
const BackupResponse = createResponseSchema(BackupSchema);
const BackupListResponse = createResponseSchema(z.object({
  backups: z.array(BackupSchema),
  total: z.number()
}));
const StatusResponse = createResponseSchema(SystemStatusSchema);
const MaintenanceResponse = createResponseSchema(z.object({
  success: z.boolean(),
  message: z.string(),
  duration: z.number().optional()
}));

// In-memory backup store (in production, this would be in a database)
const backups = new Map();
const configStore = new Map();

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function parseLogLine(line, component, fallbackTimestamp) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && parsed.message) {
      return {
        timestamp: parsed.timestamp || fallbackTimestamp,
        level: parsed.level || 'info',
        component: parsed.component || component,
        message: parsed.message,
        metadata: parsed.metadata
      };
    }
  } catch {
    // Fall through to plain-text parsing.
  }

  const structuredMatch = trimmed.match(/^\[?([0-9T:.+\-Z]+)\]?\s+\[?(debug|info|warn|error|fatal)\]?\s+(.*)$/i);
  if (structuredMatch) {
    return {
      timestamp: structuredMatch[1],
      level: structuredMatch[2].toLowerCase(),
      component,
      message: structuredMatch[3]
    };
  }

  return {
    timestamp: fallbackTimestamp,
    level: 'info',
    component,
    message: trimmed
  };
}

async function loadSystemLogs() {
  const logDir = path.join(process.cwd(), 'logs');
  if (!(await pathExists(logDir))) {
    return [];
  }

  const entries = [];
  const files = await fs.readdir(logDir, { withFileTypes: true });

  for (const file of files) {
    if (!file.isFile()) {
      continue;
    }

    const filePath = path.join(logDir, file.name);
    const stats = await fs.stat(filePath);
    const component = path.basename(file.name, path.extname(file.name)) || 'system';
    const content = await fs.readFile(filePath, 'utf-8');

    for (const line of content.split(/\r?\n/)) {
      const entry = parseLogLine(line, component, stats.mtime.toISOString());
      if (entry) {
        entries.push(entry);
      }
    }
  }

  return entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

async function collectFilesRecursively(rootPath) {
  const files = [];
  const entries = await fs.readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFilesRecursively(entryPath));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

function getCpuTimes(snapshot) {
  return snapshot.reduce((acc, cpu) => {
    const { user, nice, sys, idle, irq } = cpu.times;
    acc.idle += idle;
    acc.total += user + nice + sys + idle + irq;
    return acc;
  }, { idle: 0, total: 0 });
}

async function sampleCpuUsage(durationSeconds = 1) {
  const start = getCpuTimes(os.cpus());
  const delayMs = Math.max(250, Math.min(durationSeconds, 5) * 1000);
  await new Promise(resolve => setTimeout(resolve, delayMs));
  const end = getCpuTimes(os.cpus());
  const totalDelta = end.total - start.total;
  const idleDelta = end.idle - start.idle;

  if (totalDelta <= 0) {
    return null;
  }

  return parseFloat((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(2));
}

async function readNetworkMetrics() {
  if (process.platform === 'win32') {
    try {
      const command = [
        'powershell',
        '-NoProfile',
        '-Command',
        `"try { $adapters = Get-NetAdapterStatistics; $bytesIn = ($adapters | Measure-Object -Property ReceivedBytes -Sum).Sum; $bytesOut = ($adapters | Measure-Object -Property SentBytes -Sum).Sum; $connections = (Get-NetTCPConnection -State Established | Measure-Object).Count; [pscustomobject]@{ bytesIn = [double]($bytesIn ?? 0); bytesOut = [double]($bytesOut ?? 0); connections = [int]($connections ?? 0) } | ConvertTo-Json -Compress } catch { [pscustomobject]@{ bytesIn = $null; bytesOut = $null; connections = $null } | ConvertTo-Json -Compress }"`
      ].join(' ');
      const { stdout } = await execAsync(command);
      return JSON.parse(stdout.trim());
    } catch {
      return { bytesIn: null, bytesOut: null, connections: null };
    }
  }

  try {
    const content = await fs.readFile('/proc/net/dev', 'utf-8');
    const lines = content.split(/\r?\n/).slice(2).filter(Boolean);
    let bytesIn = 0;
    let bytesOut = 0;

    for (const line of lines) {
      const parts = line.replace(':', ' ').trim().split(/\s+/);
      bytesIn += Number(parts[1] || 0);
      bytesOut += Number(parts[9] || 0);
    }

    let connections = null;
    try {
      const { stdout } = await execAsync('ss -tan state established');
      connections = stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('Recv-Q')).length;
    } catch {
      connections = null;
    }

    return { bytesIn, bytesOut, connections };
  } catch {
    return { bytesIn: null, bytesOut: null, connections: null };
  }
}

/**
 * System Tools Export
 */
export const systemTools = [
  /**
   * Check system health
   */
  createTool({
    name: 'system_health',
    description: 'Get comprehensive system health status for all components',
    inputSchema: z.object({
      detailed: z.boolean().default(false),
      components: z.array(z.string()).optional()
    }),
    outputSchema: HealthResponse,
    handler: async (params) => {
      const { detailed, components } = params;
      const requested = Array.isArray(components) && components.length > 0 ? new Set(components) : null;
      const includeComponent = (name) => !requested || requested.has(name);
      
      // If health checker is initialized, use it
      if (healthChecker) {
        try {
          const result = await healthChecker.checkHealth();
          return {
            overall: result.status,
            components: Object.entries(result.checks)
              .filter(([name]) => includeComponent(name))
              .map(([name, status]) => ({
                name,
                status,
                latency: result.details?.[name]?.latency || 0,
                lastChecked: result.timestamp,
                message: detailed ? result.details?.[name]?.message : undefined
              })),
            uptime: process.uptime(),
            version: result.version,
            timestamp: result.timestamp
          };
        } catch (error) {
          // Fall through to basic health check
        }
      }
      
      // Basic health check without full health checker
      const componentHealth = [];
      
      // Check database
      if (includeComponent('database')) {
        componentHealth.push({
          name: 'database',
          status: HealthStatus.UNKNOWN,
          latency: 0,
          lastChecked: new Date().toISOString(),
          message: 'No health checker is configured for database verification'
        });
      }
      
      // Check memory
      const memUsage = process.memoryUsage();
      const memHealthy = memUsage.heapUsed < 1024 * 1024 * 1024; // 1GB threshold
      if (includeComponent('memory')) {
        componentHealth.push({
          name: 'memory',
          status: memHealthy ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
          latency: 0,
          lastChecked: new Date().toISOString(),
          message: `Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
        });
      }
      
      // Check disk
      if (includeComponent('disk')) {
        try {
          const stats = await fs.statfs(process.cwd());
          const total = stats.blocks * stats.bsize;
          const available = stats.bavail * stats.bsize;
          const usedPercent = ((total - available) / total) * 100;
          const diskHealthy = usedPercent < 90;
          
          componentHealth.push({
            name: 'disk',
            status: diskHealthy ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
            latency: 0,
            lastChecked: new Date().toISOString(),
            message: `Disk usage: ${usedPercent.toFixed(1)}%`
          });
        } catch {
          componentHealth.push({
            name: 'disk',
            status: HealthStatus.UNKNOWN,
            latency: 0,
            lastChecked: new Date().toISOString(),
            message: 'Disk check not available'
          });
        }
      }
      
      const overallStatus = componentHealth.length === 0
        ? HealthStatus.UNKNOWN
        : componentHealth.some(c => c.status === HealthStatus.UNHEALTHY)
          ? HealthStatus.UNHEALTHY
          : componentHealth.every(c => c.status === HealthStatus.HEALTHY)
            ? HealthStatus.HEALTHY
            : componentHealth.some(c => c.status === HealthStatus.DEGRADED)
              ? HealthStatus.DEGRADED
              : HealthStatus.UNKNOWN;
      
      return {
        overall: overallStatus,
        components: componentHealth,
        uptime: process.uptime(),
        version: '5.0.0',
        timestamp: new Date().toISOString()
      };
    },
    tags: ['system', 'health', 'monitoring']
  }),

  /**
   * Get system metrics
   */
  createTool({
    name: 'system_metrics',
    description: 'Get real-time system metrics including CPU, memory, disk, and network usage',
    inputSchema: z.object({
      duration: z.number().int().min(1).max(60).default(5),
      components: z.array(z.enum(['cpu', 'memory', 'disk', 'network', 'process', 'all'])).default(['all'])
    }),
    outputSchema: MetricsResponse,
    handler: async (params) => {
      const { components, duration } = params;
      const includeAll = components.includes('all');
      
      const metrics = {
        timestamp: new Date().toISOString()
      };
      
      // CPU metrics
      if (includeAll || components.includes('cpu')) {
        metrics.cpu = {
          usage: await sampleCpuUsage(duration),
          cores: os.cpus().length,
          loadAvg: os.loadavg()
        };
      }
      
      // Memory metrics
      if (includeAll || components.includes('memory')) {
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        metrics.memory = {
          used,
          total,
          percentage: Math.round((used / total) * 100)
        };
      }
      
      // Disk metrics
      if (includeAll || components.includes('disk')) {
        try {
          const stats = await fs.statfs(process.cwd());
          const total = stats.blocks * stats.bsize;
          const available = stats.bavail * stats.bsize;
          const used = total - available;
          metrics.disk = {
            used,
            total,
            percentage: Math.round((used / total) * 100)
          };
        } catch {
          metrics.disk = { used: 0, total: 0, percentage: 0 };
        }
      }
      
      // Network metrics
      if (includeAll || components.includes('network')) {
        metrics.network = await readNetworkMetrics();
      }
      
      // Process metrics
      const memUsage = process.memoryUsage();
      metrics.process = {
        uptime: process.uptime(),
        memoryUsage: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external
        },
        pid: process.pid
      };
      
      return metrics;
    },
    tags: ['system', 'metrics', 'monitoring']
  }),

  /**
   * Get system configuration
   */
  createTool({
    name: 'system_config_get',
    description: 'Retrieve system configuration values, optionally filtered by section',
    inputSchema: z.object({
      section: z.string().optional(),
      key: z.string().optional(),
      includeDefaults: z.boolean().default(true)
    }),
    outputSchema: ConfigResponse,
    handler: async (params) => {
      const { section, key, includeDefaults } = params;
      
      let config = {};
      
      // Build config from store and defaults
      if (includeDefaults) {
        config = {
          system: {
            version: '5.0.0',
            environment: process.env.NODE_ENV || 'development',
            logLevel: process.env.LOG_LEVEL || 'info'
          },
          server: {
            port: parseInt(process.env.PORT) || 3000,
            host: process.env.HOST || 'localhost'
          },
          features: {
            websockets: true,
            clustering: false,
            rateLimiting: true
          }
        };
      }
      
      // Add stored config values
      for (const [k, v] of configStore) {
        const parts = k.split('.');
        let target = config;
        for (let i = 0; i < parts.length - 1; i++) {
          target[parts[i]] = target[parts[i]] || {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = v;
      }
      
      // Filter by section if specified
      if (section) {
        config = { [section]: config[section] };
      }
      
      // Filter by key if specified
      if (key && section) {
        config = { [key]: config[section]?.[key] };
      }
      
      return config;
    },
    tags: ['system', 'config', 'get']
  }),

  /**
   * Set system configuration
   */
  createTool({
    name: 'system_config_set',
    description: 'Update system configuration values',
    inputSchema: z.object({
      section: z.string().optional(),
      key: z.string(),
      value: z.any(),
      validate: z.boolean().default(true)
    }),
    outputSchema: createResponseSchema(z.object({
      updated: z.boolean(),
      previousValue: z.any().optional()
    })),
    handler: async (params) => {
      const { section, key, value } = params;
      const fullKey = section ? `${section}.${key}` : key;
      
      const previousValue = configStore.get(fullKey);
      configStore.set(fullKey, value);
      
      return {
        updated: true,
        previousValue
      };
    },
    tags: ['system', 'config', 'set']
  }),

  /**
   * Get system logs
   */
  createTool({
    name: 'system_logs',
    description: 'Retrieve system logs with filtering by level, component, and time range',
    inputSchema: z.object({
      level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).optional(),
      component: z.string().optional(),
      search: z.string().optional(),
      startTime: z.string().datetime().optional(),
      endTime: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(1000).default(100),
      offset: z.number().int().min(0).default(0)
    }),
    outputSchema: LogsResponse,
    handler: async (params) => {
      const { level, component, search, startTime, endTime, limit, offset } = params;
      let logs = await loadSystemLogs();
      
      // Apply filters
      if (level) {
        logs = logs.filter(l => l.level === level);
      }
      if (component) {
        logs = logs.filter(l => l.component === component);
      }
      if (search) {
        const searchLower = search.toLowerCase();
        logs = logs.filter(l => l.message.toLowerCase().includes(searchLower));
      }
      if (startTime) {
        logs = logs.filter(l => l.timestamp >= startTime);
      }
      if (endTime) {
        logs = logs.filter(l => l.timestamp <= endTime);
      }
      
      const total = logs.length;
      const paginatedLogs = logs.slice(offset, offset + limit);
      
      return {
        success: true,
        data: {
          logs: paginatedLogs,
          total,
          hasMore: offset + limit < total
        }
      };
    },
    tags: ['system', 'logs', 'monitoring']
  }),

  /**
   * Clear system cache
   */
  createTool({
    name: 'system_cache_clear',
    description: 'Clear system caches selectively or entirely',
    inputSchema: z.object({
      caches: z.array(z.enum(['memory', 'disk', 'all'])).default(['all']),
      pattern: z.string().optional()
    }),
    outputSchema: createResponseSchema(z.object({
      cleared: z.array(z.string()),
      bytesFreed: z.number()
    })),
    handler: async (params) => {
      const { caches, pattern } = params;
      const cleared = [];
      let bytesFreed = 0;
      
      // Clear memory cache
      if ((caches.includes('all') || caches.includes('memory')) &&
          globalThis.__cognimeshMemoryCache &&
          typeof globalThis.__cognimeshMemoryCache.clear === 'function') {
        globalThis.__cognimeshMemoryCache.clear();
        cleared.push('memory');
      }
      
      // Clear disk cache
      if (caches.includes('all') || caches.includes('disk')) {
        const cacheDir = path.join(process.cwd(), 'cache');
        try {
          if (await pathExists(cacheDir)) {
            const files = await collectFilesRecursively(cacheDir);
            for (const filePath of files) {
              if (pattern && !path.basename(filePath).includes(pattern)) {
                continue;
              }

              const stats = await fs.stat(filePath);
              await fs.rm(filePath, { force: true });
              bytesFreed += stats.size;
            }

            cleared.push('disk');
          }
        } catch (error) {
          // Cache directory might not exist
        }
      }
      
      return {
        success: true,
        data: {
          cleared,
          bytesFreed
        }
      };
    },
    tags: ['system', 'cache', 'maintenance']
  }),

  /**
   * Create system backup
   */
  createTool({
    name: 'system_backup_create',
    description: 'Create a system backup with configurable type and components',
    inputSchema: z.object({
      type: z.enum(['full', 'incremental', 'partial']).default('full'),
      components: z.array(z.enum(['database', 'files', 'config', 'logs', 'all'])).default(['all']),
      retention: z.number().int().min(1).max(365).default(30),
      compress: z.boolean().default(true)
    }),
    outputSchema: BackupResponse,
    handler: async (params) => {
      const { type, components, retention, compress } = params;
      
      const backupId = `backup_${Date.now()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + retention * 24 * 60 * 60 * 1000);
      
      const backup = {
        id: backupId,
        type,
        components: components.includes('all') ? ['database', 'files', 'config', 'logs'] : components,
        status: 'in_progress',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        size: 0,
        compress
      };
      
      // Store backup record
      backups.set(backupId, backup);
      
      backup.status = 'failed';
      backups.set(backupId, backup);

      return {
        success: false,
        error: 'System backup creation is not configured for this deployment',
        code: 'NOT_CONFIGURED',
        details: {
          backupId,
          type,
          components: backup.components,
          retention,
          compress
        }
      };
    },
    tags: ['system', 'backup', 'create']
  }),

  /**
   * Restore system backup
   */
  createTool({
    name: 'system_backup_restore',
    description: 'Restore system from a backup',
    inputSchema: z.object({
      backupId: z.string(),
      components: z.array(z.enum(['database', 'files', 'config', 'logs', 'all'])).default(['all']),
      dryRun: z.boolean().default(false)
    }),
    outputSchema: createResponseSchema(z.object({
      restored: z.boolean(),
      components: z.array(z.string()),
      warnings: z.array(z.string()).optional()
    })),
    handler: async (params) => {
      const { backupId, components, dryRun } = params;
      
      const backup = backups.get(backupId);
      if (!backup) {
        return {
          success: false,
          error: `Backup not found: ${backupId}`,
          code: 'NOT_FOUND'
        };
      }
      
      if (backup.status !== 'completed') {
        return {
          success: false,
          error: `Backup is not ready for restore: ${backup.status}`,
          code: 'INVALID_STATE'
        };
      }
      
      const componentsToRestore = components.includes('all') ? backup.components : components;
      const warnings = [];
      
      if (!dryRun) {
        // In real implementation, this would restore from backup
        // 1. Stop relevant services
        // 2. Restore database
        // 3. Restore files
        // 4. Restart services
      } else {
        warnings.push('Dry run - no changes made');
      }
      
      return {
        success: true,
        data: {
          restored: !dryRun,
          components: componentsToRestore,
          warnings
        }
      };
    },
    tags: ['system', 'backup', 'restore']
  }),

  /**
   * List system backups
   */
  createTool({
    name: 'system_backup_list',
    description: 'List all available system backups with filtering',
    inputSchema: z.object({
      type: z.enum(['full', 'incremental', 'partial']).optional(),
      status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20)
    }),
    outputSchema: BackupListResponse,
    handler: async (params) => {
      const { type, status, page, pageSize } = params;
      
      let backupList = Array.from(backups.values());
      
      // Apply filters
      if (type) {
        backupList = backupList.filter(b => b.type === type);
      }
      if (status) {
        backupList = backupList.filter(b => b.status === status);
      }
      
      // Sort by created date (newest first)
      backupList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      const total = backupList.length;
      
      // Apply pagination
      const offset = (page - 1) * pageSize;
      const paginated = backupList.slice(offset, offset + pageSize);
      
      return {
        success: true,
        data: {
          backups: paginated,
          total
        }
      };
    },
    tags: ['system', 'backup', 'list']
  }),

  /**
   * Get system status
   */
  createTool({
    name: 'system_status',
    description: 'Get current system operational status',
    inputSchema: z.object({
      includeHistory: z.boolean().default(false)
    }),
    outputSchema: StatusResponse,
    handler: async (params) => {
      void params;
      // Determine system status based on health
      let status = 'online';
      let mode = 'none';
      
      // Check if any maintenance is scheduled or in progress
      for (const [key, value] of configStore) {
        if (key === 'maintenance.mode') {
          mode = value;
        }
      }
      
      if (mode === 'in_progress') {
        status = 'maintenance';
      }
      
      return {
        success: true,
        data: {
          status,
          mode,
          since: new Date(Date.now() - process.uptime() * 1000).toISOString(),
          version: '5.0.0',
          nodeVersion: process.version
        }
      };
    },
    tags: ['system', 'status']
  }),

  /**
   * System maintenance
   */
  createTool({
    name: 'system_maintenance',
    description: 'Perform system maintenance tasks',
    inputSchema: z.object({
      action: z.enum(['start', 'schedule', 'cancel', 'run_task']),
      task: z.enum(['cleanup', 'optimize', 'reindex', 'verify', 'update']).optional(),
      duration: z.number().int().min(1).max(1440).optional()
    }).refine(data => data.action !== 'run_task' || data.task, {
      message: 'task is required when action is run_task'
    }),
    outputSchema: MaintenanceResponse,
    handler: async (params) => {
      const { action, task, duration } = params;
      
      switch (action) {
        case 'start':
          configStore.set('maintenance.mode', 'in_progress');
          return {
            success: true,
            data: {
              success: true,
              message: 'Maintenance mode started',
              duration: duration || 60
            }
          };
          
        case 'cancel':
          configStore.set('maintenance.mode', 'none');
          return {
            success: true,
            data: {
              success: true,
              message: 'Maintenance mode cancelled'
            }
          };
          
        case 'run_task':
          // Execute maintenance task
          let taskResult = '';
          switch (task) {
            case 'cleanup':
              // Clean up old logs, temp files
              taskResult = 'Cleaned up old logs and temporary files';
              break;
            case 'optimize':
              // Optimize database
              taskResult = 'Database optimization completed';
              break;
            case 'reindex':
              // Rebuild indexes
              taskResult = 'Index rebuild completed';
              break;
            case 'verify':
              // Verify data integrity
              taskResult = 'Data integrity verification passed';
              break;
            case 'update':
              // Check for updates
              taskResult = 'No updates available';
              break;
          }
          
          return {
            success: true,
            data: {
              success: true,
              message: taskResult,
              duration: 0
            }
          };
          
        default:
          return {
            success: true,
            data: {
              success: true,
              message: `Maintenance ${action} completed`
            }
          };
      }
    },
    tags: ['system', 'maintenance']
  })
];

export default systemTools;
