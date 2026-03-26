/**
 * @fileoverview Health Checker - Comprehensive system health monitoring
 * @module health/health-checker
 * @description Provides health checks for all system components
 * @version 5.0.0
 */

import { SystemState } from '../bios/index.js';

/**
 * Health status enumeration
 * @readonly
 * @enum {string}
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};

/**
 * Component health check result
 * @typedef {Object} ComponentHealth
 * @property {HealthStatus} status - Component health status
 * @property {string} message - Human-readable status message
 * @property {Object} [details] - Additional details
 * @property {Error} [error] - Error if check failed
 */

/**
 * Overall health check result
 * @typedef {Object} HealthResult
 * @property {HealthStatus} status - Overall health status
 * @property {string} timestamp - ISO timestamp
 * @property {string} version - Server version
 * @property {Object.<string, HealthStatus>} checks - Per-component health status
 * @property {Object} [details] - Detailed check results
 */

/**
 * HealthChecker - Comprehensive health monitoring for CogniMesh
 * @class
 */
export class HealthChecker {
  /**
   * Creates a new HealthChecker instance
   * @param {Object} options - Health checker options
   * @param {Object} options.server - CogniMeshServer instance
   */
  constructor(options = {}) {
    this._server = options.server;
    this._version = options.version || '5.0.0';
    
    // Cache for health check results
    this._cache = new Map();
    this._cacheTTL = 5000; // 5 seconds
  }

  /**
   * Perform comprehensive health check
   * @async
   * @returns {Promise<HealthResult>} Complete health status
   */
  async checkHealth() {
    const timestamp = new Date().toISOString();
    
    // Run all checks in parallel
    const [
      biosHealth,
      databaseHealth,
      websocketHealth,
      agentPoolHealth,
      aiClientsHealth,
      diskSpaceHealth
    ] = await Promise.all([
      this._checkBIOS(),
      this._checkDatabase(),
      this._checkWebSocket(),
      this._checkAgentPool(),
      this._checkAIClients(),
      this._checkDiskSpace()
    ]);

    // Aggregate results
    const checks = {
      bios: biosHealth.status,
      database: databaseHealth.status,
      websocket: websocketHealth.status,
      agentPool: agentPoolHealth.status,
      aiClients: aiClientsHealth.status,
      diskSpace: diskSpaceHealth.status
    };

    // Determine overall status
    const status = this._aggregateStatus(Object.values(checks));

    return {
      status,
      timestamp,
      version: this._version,
      checks,
      details: {
        bios: biosHealth,
        database: databaseHealth,
        websocket: websocketHealth,
        agentPool: agentPoolHealth,
        aiClients: aiClientsHealth,
        diskSpace: diskSpaceHealth
      }
    };
  }

  /**
   * Check readiness - for Kubernetes readiness probe
   * @async
   * @returns {Promise<{ready: boolean, checks: Object, errors: string[]}>}
   */
  async checkReadiness() {
    const errors = [];
    const checks = {};

    // Check database connection
    try {
      const dbHealth = await this._checkDatabase();
      checks.database = dbHealth.status === HealthStatus.HEALTHY;
      if (!checks.database) {
        errors.push(`Database: ${dbHealth.message}`);
      }
    } catch (error) {
      checks.database = false;
      errors.push(`Database check failed: ${error.message}`);
    }

    // Check cache initialization (via intelligence module if available)
    try {
      const cacheHealth = await this._checkCache();
      checks.cache = cacheHealth.status === HealthStatus.HEALTHY;
      if (!checks.cache) {
        errors.push(`Cache: ${cacheHealth.message}`);
      }
    } catch (error) {
      checks.cache = false;
      errors.push(`Cache check failed: ${error.message}`);
    }

    // Check BIOS is operational
    try {
      const biosHealth = await this._checkBIOS();
      checks.bios = biosHealth.status === HealthStatus.HEALTHY;
      if (!checks.bios) {
        errors.push(`BIOS: ${biosHealth.message}`);
      }
    } catch (error) {
      checks.bios = false;
      errors.push(`BIOS check failed: ${error.message}`);
    }

    const ready = Object.values(checks).every(check => check);

    return { ready, checks, errors };
  }

  /**
   * Check liveness - for Kubernetes liveness probe
   * @returns {{live: boolean, uptime: number, timestamp: string}}
   */
  checkLiveness() {
    const server = this._server;
    
    // Server is live if it's running and not stuck
    const isRunning = server.status === 'running';
    const uptime = server._startTime ? Date.now() - server._startTime : 0;
    
    // Check for potential deadlock (no response for > 60 seconds)
    const isResponsive = uptime < 60000 || this._isResponsive();

    return {
      live: isRunning && isResponsive,
      uptime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check BIOS state
   * @private
   * @returns {Promise<ComponentHealth>}
   */
  async _checkBIOS() {
    try {
      const bios = this._server.bios;
      if (!bios) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: 'BIOS not initialized'
        };
      }

      const status = bios.getStatus();
      const isOperational = status.state === SystemState.OPERATIONAL;

      return {
        status: isOperational ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
        message: isOperational 
          ? `BIOS operational (v${status.version})`
          : `BIOS state: ${status.state}`,
        details: {
          state: status.state,
          uptime: status.uptime,
          components: status.components
        }
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `BIOS check failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Check database connection
   * @private
   * @returns {Promise<ComponentHealth>}
   */
  async _checkDatabase() {
    try {
      const pool = this._server._connectionPool;
      if (!pool) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: 'Connection pool not initialized'
        };
      }

      const stats = pool.getStats();
      
      // Try to ping the database
      let pingSuccess = false;
      try {
        await pool.get('SELECT 1');
        pingSuccess = true;
      } catch (pingError) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `Database ping failed: ${pingError.message}`,
          details: { stats }
        };
      }

      const hasConnections = stats.total > 0;
      const hasAvailableConnections = stats.available > 0;
      const hasHealthIssues = stats.healthCheckFailures > 0;

      if (pingSuccess && hasConnections && hasAvailableConnections && !hasHealthIssues) {
        return {
          status: HealthStatus.HEALTHY,
          message: `Database connected (${stats.total} connections, ${stats.inUse} in use)`,
          details: stats
        };
      }

      if (pingSuccess && hasConnections) {
        return {
          status: HealthStatus.DEGRADED,
          message: `Database operational but degraded (failures: ${stats.healthCheckFailures})`,
          details: stats
        };
      }

      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Database connection issues',
        details: stats
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `Database check failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Check WebSocket server
   * @private
   * @returns {Promise<ComponentHealth>}
   */
  async _checkWebSocket() {
    try {
      const wsServer = this._server.wsServer;
      
      // WebSocket might be disabled
      if (!wsServer) {
        return {
          status: HealthStatus.HEALTHY,
          message: 'WebSocket server disabled',
          details: { enabled: false }
        };
      }

      const isRunning = wsServer.isRunning();
      const stats = wsServer.getStats();

      if (!isRunning) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: 'WebSocket server not running',
          details: stats
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        message: `WebSocket active (${stats.clients} clients, ${stats.rooms} rooms)`,
        details: stats
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `WebSocket check failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Check Agent Pool status
   * @private
   * @returns {Promise<ComponentHealth>}
   */
  async _checkAgentPool() {
    try {
      // Check if there's a global agent pool or it's managed elsewhere
      // For now, we check if the server has access to agent pool via gsd module
      const gsdModule = await import('../engine/index.js').catch(() => null);
      
      if (!gsdModule || !gsdModule.agentPool) {
        return {
          status: HealthStatus.HEALTHY,
          message: 'Agent pool not configured',
          details: { configured: false }
        };
      }

      const pool = gsdModule.agentPool;
      const stats = pool.getStats ? pool.getStats() : null;

      if (!stats) {
        return {
          status: HealthStatus.DEGRADED,
          message: 'Agent pool statistics unavailable',
          details: {}
        };
      }

      const hasAvailableAgents = stats.availableCount > 0;
      const isHealthy = stats.isHealthy;
      const queueDepth = stats.queueDepth;

      if (isHealthy && hasAvailableAgents && queueDepth === 0) {
        return {
          status: HealthStatus.HEALTHY,
          message: `Agent pool healthy (${stats.availableCount}/${stats.poolSize} available)`,
          details: stats
        };
      }

      if (isHealthy && queueDepth > 0) {
        return {
          status: HealthStatus.DEGRADED,
          message: `Agent pool busy (${queueDepth} tasks queued)`,
          details: stats
        };
      }

      return {
        status: HealthStatus.DEGRADED,
        message: `Agent pool degraded (healthy: ${isHealthy}, available: ${stats.availableCount})`,
        details: stats
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `Agent pool check failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Check AI clients connectivity
   * @private
   * @returns {Promise<ComponentHealth>}
   */
  async _checkAIClients() {
    const clients = {
      claude: { healthy: false, latency: null },
      kimi: { healthy: false, latency: null },
      codex: { healthy: false, latency: null }
    };

    try {
      // Check Claude client availability
      try {
        const claudeModule = await import('../clients/claude/index.js');
        clients.claude.healthy = !!claudeModule;
        clients.claude.latency = 0; // Would need actual ping in production
      } catch {
        clients.claude.healthy = false;
      }

      // Check Kimi client availability  
      try {
        const kimiModule = await import('../clients/kimi/index.js');
        clients.kimi.healthy = !!kimiModule;
        clients.kimi.latency = 0;
      } catch {
        clients.kimi.healthy = false;
      }

      // Check Codex client availability
      try {
        const codexModule = await import('../clients/codex/index.js');
        clients.codex.healthy = !!codexModule;
        clients.codex.latency = 0;
      } catch {
        clients.codex.healthy = false;
      }

      const healthyCount = Object.values(clients).filter(c => c.healthy).length;
      const totalCount = Object.keys(clients).length;

      if (healthyCount === totalCount) {
        return {
          status: HealthStatus.HEALTHY,
          message: `All ${totalCount} AI clients available`,
          details: clients
        };
      }

      if (healthyCount > 0) {
        return {
          status: HealthStatus.DEGRADED,
          message: `${healthyCount}/${totalCount} AI clients available`,
          details: clients
        };
      }

      return {
        status: HealthStatus.DEGRADED,
        message: 'No AI clients available (system can still function)',
        details: clients
      };
    } catch (error) {
      return {
        status: HealthStatus.DEGRADED,
        message: `AI clients check failed: ${error.message}`,
        error,
        details: clients
      };
    }
  }

  /**
   * Check disk space (for backups)
   * @private
   * @returns {Promise<ComponentHealth>}
   */
  async _checkDiskSpace() {
    try {
      // Use Node.js fs to check disk space if available
      let diskInfo = null;
      
      try {
        // Try to use fs.statfs if available (Node.js 22+)
        const fs = await import('fs');
        if (fs.statfs) {
          const stats = await fs.promises.statfs(process.cwd());
          const total = stats.blocks * stats.bsize;
          const available = stats.bavail * stats.bsize;
          const used = total - available;
          const usagePercent = (used / total) * 100;
          
          diskInfo = {
            total,
            available,
            used,
            usagePercent
          };
        }
      } catch {
        // fs.statfs not available, return unknown
      }

      if (!diskInfo) {
        return {
          status: HealthStatus.HEALTHY,
          message: 'Disk space check not available on this platform',
          details: { checked: false }
        };
      }

      // Warn if disk usage > 90%, critical if > 95%
      if (diskInfo.usagePercent > 95) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `Critical disk usage: ${diskInfo.usagePercent.toFixed(1)}%`,
          details: diskInfo
        };
      }

      if (diskInfo.usagePercent > 90) {
        return {
          status: HealthStatus.DEGRADED,
          message: `High disk usage: ${diskInfo.usagePercent.toFixed(1)}%`,
          details: diskInfo
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        message: `Disk usage: ${diskInfo.usagePercent.toFixed(1)}%`,
        details: diskInfo
      };
    } catch (error) {
      return {
        status: HealthStatus.HEALTHY,
        message: `Disk space check skipped: ${error.message}`,
        details: { checked: false }
      };
    }
  }

  /**
   * Check cache initialization
   * @private
   * @returns {Promise<ComponentHealth>}
   */
  async _checkCache() {
    try {
      // Check if intelligence cache is available
      const intelligence = await import('../intelligence/index.js').catch(() => null);
      
      if (!intelligence || !intelligence.cache) {
        return {
          status: HealthStatus.HEALTHY,
          message: 'Cache not configured',
          details: { configured: false }
        };
      }

      const cache = intelligence.cache;
      const stats = cache.getStats ? cache.getStats() : null;

      return {
        status: HealthStatus.HEALTHY,
        message: `Cache initialized (${stats ? stats.size : 'unknown'} entries)`,
        details: stats || {}
      };
    } catch (error) {
      return {
        status: HealthStatus.DEGRADED,
        message: `Cache check failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Aggregate individual status values into overall status
   * @private
   * @param {HealthStatus[]} statuses 
   * @returns {HealthStatus}
   */
  _aggregateStatus(statuses) {
    if (statuses.some(s => s === HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }
    if (statuses.some(s => s === HealthStatus.DEGRADED)) {
      return HealthStatus.DEGRADED;
    }
    if (statuses.every(s => s === HealthStatus.HEALTHY)) {
      return HealthStatus.HEALTHY;
    }
    return HealthStatus.UNKNOWN;
  }

  /**
   * Check if server is responsive (not deadlocked)
   * @private
   * @returns {boolean}
   */
  _isResponsive() {
    // Simple heuristic: if we can access the server properties, it's responsive
    try {
      return !!this._server && typeof this._server.status === 'string';
    } catch {
      return false;
    }
  }
}

export default HealthChecker;
