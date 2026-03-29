/**
 * @fileoverview Org Chart Controller - Hierarchical agent visualization API
 * @module controllers/orgchart-controller
 * @version 5.0.0
 */

import { z } from 'zod';

/**
 * Validation schemas
 */
const orgChartQuerySchema = z.object({
  rootId: z.string().optional(),
  depth: z.number().min(1).max(10).default(5),
  includeInactive: z.boolean().default(false),
});

const updateReportingSchema = z.object({
  agentId: z.string().min(1),
  reportsTo: z.string().nullable(),
});

/**
 * OrgChartController - API endpoints for organizational chart visualization
 * 
 * Provides hierarchical tree structure of agents with reporting lines,
 * status indicators, and real-time updates.
 */
export class OrgChartController {
  /**
   * Create an OrgChartController
   * @param {Object} options - Configuration options
   * @param {Object} options.cvSystem - CV system for agent profiles
   * @param {Object} options.spawnManager - Spawn manager for agent status
   * @param {Object} options.wsServer - WebSocket server for real-time updates
   * @param {Object} options.db - Database connection
   */
  constructor(options = {}) {
    this.cvSystem = options.cvSystem;
    this.spawnManager = options.spawnManager;
    this.wsServer = options.wsServer;
    this.db = options.db;
    this.prefix = '/api/orgchart';
    
    // In-memory cache for org structure
    this.orgCache = new Map();
    this.cacheExpiry = 30000; // 30 seconds
  }

  /**
   * Initialize the controller
   * @returns {Promise<OrgChartController>}
   */
  async initialize() {
    return this;
  }

  /**
   * Handle HTTP requests
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @returns {Promise<boolean>} True if request was handled
   */
  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Skip if not our prefix
    if (!pathname.startsWith(this.prefix)) {
      return false;
    }

    // GET /api/orgchart/tree - Get org tree structure
    if (pathname === `${this.prefix}/tree` && req.method === 'GET') {
      return this._getOrgTree(req, res, url);
    }

    // GET /api/orgchart/agents/:id/children - Get agent's direct reports
    const childrenMatch = pathname.match(new RegExp(`^${this.prefix}/agents/([^/]+)/children$`));
    if (childrenMatch && req.method === 'GET') {
      return this._getChildren(req, res, childrenMatch[1]);
    }

    // GET /api/orgchart/agents/:id/managers - Get agent's management chain
    const managersMatch = pathname.match(new RegExp(`^${this.prefix}/agents/([^/]+)/managers$`));
    if (managersMatch && req.method === 'GET') {
      return this._getManagementChain(req, res, managersMatch[1]);
    }

    // GET /api/orgchart/agents/:id/stats - Get agent org stats
    const statsMatch = pathname.match(new RegExp(`^${this.prefix}/agents/([^/]+)/stats$`));
    if (statsMatch && req.method === 'GET') {
      return this._getAgentStats(req, res, statsMatch[1]);
    }

    // PUT /api/orgchart/reporting - Update reporting structure
    if (pathname === `${this.prefix}/reporting` && req.method === 'PUT') {
      return this._updateReporting(req, res);
    }

    // GET /api/orgchart/search - Search org chart
    if (pathname === `${this.prefix}/search` && req.method === 'GET') {
      return this._searchOrgChart(req, res, url);
    }

    // Health check
    if (pathname === `${this.prefix}/health` && req.method === 'GET') {
      return this._healthCheck(req, res);
    }

    return false;
  }

  // ============================================
  // Tree Structure Endpoints
  // ============================================

  async _getOrgTree(req, res, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const params = orgChartQuerySchema.parse({
        rootId: query.rootId,
        depth: query.depth ? parseInt(query.depth, 10) : 5,
        includeInactive: query.includeInactive === 'true',
      });

      const tree = await this._buildOrgTree(params.rootId, params.depth, params.includeInactive);

      this._sendJson(res, 200, {
        tree,
        meta: {
          rootId: params.rootId || 'root',
          depth: params.depth,
          totalNodes: this._countNodes(tree),
          generatedAt: new Date().toISOString(),
        },
      });
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this._sendError(res, 400, 'Validation error', error.errors);
      } else {
        this._sendError(res, 500, error.message);
      }
      return true;
    }
  }

  async _getChildren(req, res, agentId) {
    try {
      const children = await this._getDirectReports(agentId);
      
      this._sendJson(res, 200, {
        agentId,
        children,
        count: children.length,
      });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _getManagementChain(req, res, agentId) {
    try {
      const chain = await this._getManagerChain(agentId);
      
      this._sendJson(res, 200, {
        agentId,
        chain,
        levels: chain.length,
      });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _getAgentStats(req, res, agentId) {
    try {
      const stats = await this._calculateOrgStats(agentId);
      
      this._sendJson(res, 200, {
        agentId,
        stats,
      });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _updateReporting(req, res) {
    try {
      const body = await this._readJsonBody(req);
      const params = updateReportingSchema.parse(body);

      // Update reporting relationship
      await this._setReportsTo(params.agentId, params.reportsTo);

      // Broadcast update via WebSocket
      this._broadcastOrgUpdate('reporting:changed', {
        agentId: params.agentId,
        reportsTo: params.reportsTo,
      });

      this._sendJson(res, 200, {
        agentId: params.agentId,
        reportsTo: params.reportsTo,
        updated: true,
      });
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this._sendError(res, 400, 'Validation error', error.errors);
      } else {
        this._sendError(res, 500, error.message);
      }
      return true;
    }
  }

  async _searchOrgChart(req, res, url) {
    try {
      const query = url.searchParams.get('q');
      if (!query || query.length < 2) {
        this._sendError(res, 400, 'Query must be at least 2 characters');
        return true;
      }

      const results = await this._searchAgents(query);

      this._sendJson(res, 200, {
        query,
        results,
        total: results.length,
      });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  // ============================================
  // Private Helpers - Tree Building
  // ============================================

  async _buildOrgTree(rootId, depth, includeInactive) {
    // Get all agents from CV system and spawn manager
    const agents = await this._getAllAgents();
    
    // Build node map
    const nodeMap = new Map();
    for (const agent of agents) {
      if (!includeInactive && agent.status === 'inactive') continue;
      
      nodeMap.set(agent.id, {
        id: agent.id,
        name: agent.name || agent.id,
        role: agent.role || agent.cv?.role || 'Agent',
        department: agent.department || 'General',
        status: agent.status || 'offline',
        provider: agent.provider || 'unknown',
        model: agent.model || '',
        avatar: agent.avatar || this._generateAvatar(agent.name || agent.id),
        capabilities: agent.capabilities || [],
        reportsTo: agent.reportsTo || null,
        metrics: {
          tasksCompleted: agent.tasksCompleted || 0,
          successRate: agent.successRate || 0,
          lastActive: agent.lastActive || null,
        },
        children: [],
      });
    }

    // Build tree structure
    let rootNodes = [];
    
    if (rootId && nodeMap.has(rootId)) {
      // Start from specific root
      const root = nodeMap.get(rootId);
      this._attachChildren(root, nodeMap, depth, 0);
      rootNodes = [root];
    } else {
      // Find all root nodes (no reportsTo or reports to non-existent agent)
      for (const [, node] of nodeMap) {
        if (!node.reportsTo || !nodeMap.has(node.reportsTo)) {
          this._attachChildren(node, nodeMap, depth, 0);
          rootNodes.push(node);
        }
      }
    }

    // If no roots found, return flat list
    if (rootNodes.length === 0 && nodeMap.size > 0) {
      rootNodes = Array.from(nodeMap.values());
    }

    // Wrap multiple roots under a virtual root
    if (rootNodes.length > 1) {
      return {
        id: 'root',
        name: 'Organization',
        role: 'Root',
        status: 'online',
        isVirtual: true,
        children: rootNodes,
      };
    }

    return rootNodes[0] || null;
  }

  _attachChildren(parent, nodeMap, maxDepth, currentDepth) {
    if (currentDepth >= maxDepth) return;

    for (const [, node] of nodeMap) {
      if (node.reportsTo === parent.id) {
        parent.children.push(node);
        this._attachChildren(node, nodeMap, maxDepth, currentDepth + 1);
      }
    }

    // Sort children by name
    parent.children.sort((a, b) => a.name.localeCompare(b.name));
  }

  _countNodes(node) {
    if (!node) return 0;
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += this._countNodes(child);
      }
    }
    return count;
  }

  async _getDirectReports(agentId) {
    const agents = await this._getAllAgents();
    return agents
      .filter(a => a.reportsTo === agentId)
      .map(a => ({
        id: a.id,
        name: a.name || a.id,
        role: a.role || 'Agent',
        status: a.status || 'offline',
        provider: a.provider || 'unknown',
      }));
  }

  async _getManagerChain(agentId) {
    const agents = await this._getAllAgents();
    const agentMap = new Map(agents.map(a => [a.id, a]));
    
    const chain = [];
    let current = agentMap.get(agentId);
    const visited = new Set();

    while (current && current.reportsTo && !visited.has(current.reportsTo)) {
      const manager = agentMap.get(current.reportsTo);
      if (!manager) break;
      
      chain.push({
        id: manager.id,
        name: manager.name || manager.id,
        role: manager.role || 'Manager',
        department: manager.department || 'General',
        level: chain.length + 1,
      });
      
      visited.add(current.reportsTo);
      current = manager;
    }

    return chain;
  }

  async _calculateOrgStats(agentId) {
    const tree = await this._buildOrgTree(agentId, 10, true);
    const stats = {
      totalReports: 0,
      directReports: 0,
      maxDepth: 0,
      byStatus: {},
      byProvider: {},
    };

    if (tree) {
      this._accumulateStats(tree, stats, 0);
    }

    return stats;
  }

  _accumulateStats(node, stats, depth) {
    stats.totalReports++;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    
    const status = node.status || 'unknown';
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    
    const provider = node.provider || 'unknown';
    stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;

    if (node.children) {
      for (const child of node.children) {
        this._accumulateStats(child, stats, depth + 1);
      }
    }
  }

  async _searchAgents(query) {
    const agents = await this._getAllAgents();
    const lowerQuery = query.toLowerCase();
    
    return agents
      .filter(a => 
        (a.name && a.name.toLowerCase().includes(lowerQuery)) ||
        (a.id && a.id.toLowerCase().includes(lowerQuery)) ||
        (a.role && a.role.toLowerCase().includes(lowerQuery)) ||
        (a.department && a.department.toLowerCase().includes(lowerQuery))
      )
      .map(a => ({
        id: a.id,
        name: a.name || a.id,
        role: a.role || 'Agent',
        department: a.department || 'General',
        status: a.status || 'offline',
        reportsTo: a.reportsTo,
      }));
  }

  // ============================================
  // Data Source Integration
  // ============================================

  async _getAllAgents() {
    const agents = [];
    
    // Get from CV system if available
    if (this.cvSystem?.registry) {
      try {
        const cvs = this.cvSystem.registry.list();
        for (const cv of cvs) {
          agents.push({
            id: cv.id,
            name: cv.name || cv.id,
            role: cv.role,
            department: cv.department,
            status: cv.status || 'active',
            provider: cv.provider,
            model: cv.model,
            capabilities: cv.capabilities,
            reportsTo: cv.reportsTo,
            avatar: cv.avatar,
            cv: cv,
          });
        }
      } catch (err) {
        console.warn('Failed to get agents from CV registry:', err);
      }
    }

    // Get from spawn manager if available
    if (this.spawnManager) {
      try {
        const spawned = this.spawnManager.getActiveAgents?.() || [];
        for (const agent of spawned) {
          const existing = agents.find(a => a.id === agent.id);
          if (existing) {
            existing.status = agent.status || existing.status;
            existing.lastActive = agent.lastActive;
            existing.tasksCompleted = agent.tasksCompleted;
            existing.successRate = agent.successRate;
          } else {
            agents.push({
              id: agent.id,
              name: agent.name || agent.id,
              role: agent.role,
              status: agent.status || 'active',
              provider: agent.provider,
              model: agent.model,
              capabilities: agent.capabilities,
              reportsTo: agent.reportsTo,
              lastActive: agent.lastActive,
              tasksCompleted: agent.tasksCompleted,
              successRate: agent.successRate,
            });
          }
        }
      } catch (err) {
        console.warn('Failed to get agents from spawn manager:', err);
      }
    }

    // Fallback: return mock data for demonstration
    if (agents.length === 0) {
      return this._getMockAgents();
    }

    return agents;
  }

  _getMockAgents() {
    return [
      {
        id: 'agent-1',
        name: 'Claude Commander',
        role: 'Lead Architect',
        department: 'Engineering',
        status: 'online',
        provider: 'claude',
        model: 'Claude Opus 4.6',
        capabilities: ['architecture', 'planning', 'review'],
        reportsTo: null,
        tasksCompleted: 156,
        successRate: 98,
        lastActive: new Date().toISOString(),
      },
      {
        id: 'agent-2',
        name: 'Kimi Koder',
        role: 'Senior Developer',
        department: 'Engineering',
        status: 'online',
        provider: 'kimi',
        model: 'Kimi K2.5',
        capabilities: ['coding', 'debugging', 'testing'],
        reportsTo: 'agent-1',
        tasksCompleted: 89,
        successRate: 95,
        lastActive: new Date().toISOString(),
      },
      {
        id: 'agent-3',
        name: 'Codex Specialist',
        role: 'Senior Developer',
        department: 'Engineering',
        status: 'busy',
        provider: 'codex',
        model: 'GPT-5.4 Codex',
        capabilities: ['coding', 'architecture', 'multifile'],
        reportsTo: 'agent-1',
        tasksCompleted: 124,
        successRate: 96,
        lastActive: new Date().toISOString(),
      },
      {
        id: 'agent-4',
        name: 'Test Runner',
        role: 'QA Engineer',
        department: 'Engineering',
        status: 'online',
        provider: 'claude',
        model: 'Claude Sonnet 4.6',
        capabilities: ['testing', 'qa', 'automation'],
        reportsTo: 'agent-2',
        tasksCompleted: 45,
        successRate: 92,
        lastActive: new Date().toISOString(),
      },
      {
        id: 'agent-5',
        name: 'Doc Writer',
        role: 'Technical Writer',
        department: 'Documentation',
        status: 'offline',
        provider: 'kimi',
        model: 'Kimi K2.5',
        capabilities: ['documentation', 'writing'],
        reportsTo: 'agent-1',
        tasksCompleted: 67,
        successRate: 99,
        lastActive: new Date(Date.now() - 86400000).toISOString(),
      },
    ];
  }

  async _setReportsTo(agentId, reportsTo) {
    // Update in CV system if available
    if (this.cvSystem?.registry) {
      const cv = this.cvSystem.registry.get(agentId);
      if (cv) {
        cv.reportsTo = reportsTo;
        this.cvSystem.registry.update(agentId, cv);
      }
    }

    // Clear cache to force rebuild
    this.orgCache.clear();
  }

  _generateAvatar(name) {
    // Generate initials avatar
    const initials = name
      .split(/[\s_-]+/)
      .map(p => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    
    // Generate consistent color from name
    const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    const color = `hsl(${hue}, 70%, 50%)`;
    
    return { initials, color };
  }

  // ============================================
  // WebSocket Broadcasting
  // ============================================

  _broadcastOrgUpdate(event, data) {
    if (!this.wsServer) return;

    this.wsServer.broadcastToRoom('orgchart', {
      type: event,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast agent status change to org chart subscribers
   * @param {Object} agent - Agent data
   */
  broadcastAgentStatus(agent) {
    this._broadcastOrgUpdate('agent:status', {
      id: agent.id,
      status: agent.status,
      lastActive: agent.lastActive,
    });
  }

  // ============================================
  // Health Check
  // ============================================

  _healthCheck(req, res) {
    this._sendJson(res, 200, {
      status: 'ok',
      services: {
        cvSystem: !!this.cvSystem,
        spawnManager: !!this.spawnManager,
        websocket: !!this.wsServer,
      },
      cache: {
        entries: this.orgCache.size,
        expiryMs: this.cacheExpiry,
      },
    });
    return true;
  }

  // ============================================
  // Helpers
  // ============================================

  async _readJsonBody(req) {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
      return {};
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON body: ${error.message}`);
    }
  }

  _sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  _sendError(res, statusCode, message, details = null) {
    const payload = { error: message };
    if (details) {
      payload.details = details;
    }
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }
}

export default OrgChartController;
