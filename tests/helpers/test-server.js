/**
 * @fileoverview Test server setup and utilities
 * Provides functions to start, configure, and stop test servers
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Server registry to track active servers
const activeServers = new Set();

/**
 * Default test server configuration
 */
const defaultConfig = {
  port: 0, // Random available port
  host: '127.0.0.1',
  environment: 'test',
  enableWebSocket: false,
  enableMCP: true,
  enableConsole: false,
  seedData: false,
  maxConnections: 100,
  requestTimeout: 5000,
  logRequests: false
};

/**
 * Start a test server with specified configuration
 * @param {Object} config - Server configuration
 * @returns {Promise<Object>} Server instance with port and control methods
 */
export async function startTestServer(config = {}) {
  const finalConfig = { ...defaultConfig, ...config };
  
  // Import the main application (mock implementation for tests)
  const app = await createTestApp(finalConfig);
  
  const server = createServer(app);
  
  // Enable WebSocket if requested
  if (finalConfig.enableWebSocket) {
    await setupWebSocket(server, finalConfig);
  }
  
  // Start listening
  await new Promise((resolve, reject) => {
    server.listen(finalConfig.port, finalConfig.host, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  const port = server.address().port;
  
  // Create server control object
  const serverControl = {
    server,
    port,
    config: finalConfig,
    baseUrl: `http://${finalConfig.host}:${port}`,
    wsUrl: `ws://${finalConfig.host}:${port}`,
    
    /**
     * Get server health status
     */
    async health() {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.json();
    },
    
    /**
     * Reset server state (clear data, etc.)
     */
    async reset() {
      const response = await fetch(`${this.baseUrl}/test/reset`, {
        method: 'POST'
      });
      return response.json();
    },
    
    /**
     * Seed database with test data
     */
    async seed(data) {
      const response = await fetch(`${this.baseUrl}/test/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    
    /**
     * Get server metrics
     */
    async metrics() {
      const response = await fetch(`${this.baseUrl}/metrics`);
      return response.json();
    },
    
    /**
     * Close server connection
     */
    async close() {
      return new Promise((resolve) => {
        server.close(() => {
          activeServers.delete(serverControl);
          resolve();
        });
      });
    }
  };
  
  activeServers.add(serverControl);
  
  // Seed data if requested
  if (finalConfig.seedData) {
    await serverControl.seed({
      cvs: true,
      users: true,
      tasks: true
    });
  }
  
  return serverControl;
}

/**
 * Stop a test server
 * @param {Object} serverControl - Server control object from startTestServer
 */
export async function stopTestServer(serverControl) {
  if (serverControl && typeof serverControl.close === 'function') {
    await serverControl.close();
  }
}

/**
 * Stop all active test servers
 */
export async function stopAllTestServers() {
  const closePromises = Array.from(activeServers).map(server => 
    server.close().catch(err => console.error('Error closing server:', err))
  );
  await Promise.all(closePromises);
  activeServers.clear();
}

/**
 * In-memory data stores for mock endpoints
 */
const mockData = {
  cvs: new Map(),
  users: new Map(),
  companies: new Map(),
  tasks: new Map(),
  workflows: new Map(),
  approvals: new Map(),
  webhooks: new Map(),
  plugins: new Map(),
  sessions: new Map(),
  apiKeys: new Map(),
  members: new Map(),
  runs: new Map()
};

/**
 * Helper to parse request body
 */
async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      req._rawBody = body;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        req._jsonParseError = true;
        resolve({});
      }
    });
  });
}

/**
 * Generate unique ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create test application (mock implementation)
 * @param {Object} config - Server configuration
 * @returns {Function} Express/Fastify style request handler
 */
async function createTestApp(config) {
  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Request logging
    if (config.logRequests) {
      console.log(`${req.method} ${url.pathname}`);
    }
    
    // Security headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // Route handling
    try {
      const body = await parseBody(req);
      
      // Check for JSON parse errors
      if (req._jsonParseError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Invalid JSON' }));
        return;
      }
      
      // Simple rate limiting per request (100 requests per minute for most tests)
      // Rate limit only applies to /health endpoint for the specific rate limit test
      if (config.enableRateLimit !== false && url.pathname === '/health') {
        const clientId = req.headers['x-forwarded-for'] || '127.0.0.1';
        const now = Date.now();
        const windowStart = now - 60000; // 1 minute window
        if (!global.requestCounts) global.requestCounts = new Map();
        const clientRequests = global.requestCounts.get(clientId) || [];
        const recentRequests = clientRequests.filter(t => t > windowStart);
        
        // Use lower limit (10) for health endpoint to trigger rate limiting in tests
        if (recentRequests.length >= 10) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
          return;
        }
        
        recentRequests.push(now);
        global.requestCounts.set(clientId, recentRequests);
      }
      
      // === HEALTH ENDPOINTS ===
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          version: '5.0.0-test',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        }));
        return;
      }
      
      if (url.pathname === '/health/ready') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ready: true,
          checks: [
            { name: 'database', status: 'pass' },
            { name: 'cache', status: 'pass' }
          ]
        }));
        return;
      }
      
      if (url.pathname === '/health/live') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ alive: true }));
        return;
      }
      
      // === CV REGISTRY ENDPOINTS ===
      const cvMatch = url.pathname.match(/^\/api\/v1\/cvs(?:\/(.*))?$/);
      if (cvMatch) {
        const cvId = cvMatch[1];
        
        // POST /api/v1/cvs - Create CV
        if (req.method === 'POST' && !cvId) {
          if (!body.name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ errors: ['name is required'] }));
            return;
          }
          const id = body.id || generateId();
          if (mockData.cvs.has(id)) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'CV already exists' }));
            return;
          }
          const cv = { ...body, id, status: 'created', createdAt: new Date().toISOString() };
          mockData.cvs.set(id, cv);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(cv));
          return;
        }
        
        // GET /api/v1/cvs - List CVs
        if (req.method === 'GET' && !cvId) {
          const skillFilter = url.searchParams.get('skill');
          const queryFilter = url.searchParams.get('query');
          let items = Array.from(mockData.cvs.values());
          
          if (skillFilter) {
            items = items.filter(cv => cv.skills?.includes(skillFilter));
          }
          if (queryFilter) {
            items = items.filter(cv => cv.name?.toLowerCase().includes(queryFilter.toLowerCase()));
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            items,
            total: items.length,
            pagination: { page: 1, limit: 10, total: items.length }
          }));
          return;
        }
        
        // GET /api/v1/cvs/:id - Get CV
        if (req.method === 'GET' && cvId) {
          const cv = mockData.cvs.get(cvId);
          if (!cv || cv.status === 'deleted') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'CV not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(cv));
          return;
        }
        
        // PUT /api/v1/cvs/:id - Update CV
        if (req.method === 'PUT' && cvId) {
          const cv = mockData.cvs.get(cvId);
          if (!cv) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'CV not found' }));
            return;
          }
          if (body.id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Cannot update immutable field: id' }));
            return;
          }
          const updated = { ...cv, ...body, updatedAt: new Date().toISOString() };
          mockData.cvs.set(cvId, updated);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(updated));
          return;
        }
        
        // DELETE /api/v1/cvs/:id - Delete CV
        if (req.method === 'DELETE' && cvId) {
          const force = url.searchParams.get('force') === 'true';
          const cv = mockData.cvs.get(cvId);
          if (!cv) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'CV not found' }));
            return;
          }
          if (force) {
            mockData.cvs.delete(cvId);
            res.writeHead(204);
            res.end();
          } else {
            cv.status = 'deleted';
            mockData.cvs.set(cvId, cv);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'deleted' }));
          }
          return;
        }
      }
      
      // === AUTH ENDPOINTS ===
      if (url.pathname === '/api/auth/register') {
        if (req.method === 'POST') {
          if (!body.email || !body.password || body.password.length < 6) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid input' }));
            return;
          }
          const userId = generateId();
          const user = {
            id: userId,
            email: body.email,
            name: body.name || 'Test User',
            createdAt: new Date().toISOString()
          };
          mockData.users.set(userId, user);
          
          const tokens = {
            accessToken: `token-${generateId()}`,
            refreshToken: `refresh-${generateId()}`
          };
          
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: { user, tokens }
          }));
          return;
        }
      }
      
      if (url.pathname === '/api/auth/login') {
        if (req.method === 'POST') {
          // Find user by email (mock logic)
          const user = Array.from(mockData.users.values()).find(u => u.email === body.email);
          if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid credentials' }));
            return;
          }
          
          const tokens = {
            accessToken: `token-${generateId()}`,
            refreshToken: `refresh-${generateId()}`
          };
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: { user, tokens }
          }));
          return;
        }
      }
      
      if (url.pathname === '/api/auth/me') {
        if (req.method === 'GET') {
          const authHeader = req.headers.authorization;
          const apiKey = req.headers['x-api-key'];
          
          // Check API key
          if (apiKey) {
            const user = Array.from(mockData.users.values())[0];
            if (user) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { user } }));
              return;
            }
          }
          
          // Check Bearer token
          if (!authHeader || authHeader === 'Bearer invalid-token') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
            return;
          }
          
          // Return first user for testing
          const user = Array.from(mockData.users.values())[0];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { user } }));
          return;
        }
      }
      
      if (url.pathname === '/api/auth/refresh') {
        if (req.method === 'POST') {
          const tokens = {
            accessToken: `token-${generateId()}`,
            refreshToken: `refresh-${generateId()}`
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { tokens } }));
          return;
        }
      }
      
      if (url.pathname === '/api/auth/logout') {
        if (req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }
      }
      
      if (url.pathname === '/api/auth/api-keys') {
        if (req.method === 'POST') {
          const keyId = generateId();
          const apiKey = {
            id: keyId,
            name: body.name,
            permissions: body.permissions || [],
            createdAt: new Date().toISOString()
          };
          mockData.apiKeys.set(keyId, apiKey);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: {
              key: `ak-${generateId()}`,
              apiKey
            }
          }));
          return;
        }
        if (req.method === 'GET') {
          const items = Array.from(mockData.apiKeys.values());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { items } }));
          return;
        }
      }
      
      // === COMPANY ENDPOINTS ===
      const companyMatch = url.pathname.match(/^\/api\/companies(?:\/(.*))?$/);
      if (companyMatch) {
        const companyPath = companyMatch[1];
        
        if (req.method === 'POST' && !companyPath) {
          const companyId = generateId();
          const company = {
            id: companyId,
            name: body.name,
            description: body.description,
            brandColor: body.brandColor,
            settings: body.settings || {},
            slug: body.name.toLowerCase().replace(/\s+/g, '-'),
            createdAt: new Date().toISOString()
          };
          mockData.companies.set(companyId, company);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: {
              ...company,
              membership: { role: 'owner' }
            }
          }));
          return;
        }
        
        if (req.method === 'GET' && !companyPath) {
          const items = Array.from(mockData.companies.values());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { items } }));
          return;
        }
        
        if (companyPath) {
          const [companyId, subResource, subId] = companyPath.split('/');
          const company = mockData.companies.get(companyId);
          
          if (!company) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Company not found' }));
            return;
          }
          
          // GET /api/companies/:id
          if (req.method === 'GET' && !subResource) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              data: {
                ...company,
                membership: { role: 'owner' }
              }
            }));
            return;
          }
          
          // PUT /api/companies/:id
          if (req.method === 'PUT' && !subResource) {
            Object.assign(company, body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: company }));
            return;
          }
          
          // Members endpoints
          if (subResource === 'members') {
            if (req.method === 'GET') {
              const items = Array.from(mockData.members.values()).filter(m => m.companyId === companyId);
              items.unshift({ userId: 'owner', role: 'owner', companyId }); // Add owner
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { items } }));
              return;
            }
            
            if (req.method === 'POST') {
              const membership = {
                companyId,
                userId: body.userId,
                role: body.role || 'member',
                createdAt: new Date().toISOString()
              };
              mockData.members.set(`${companyId}-${body.userId}`, membership);
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { membership } }));
              return;
            }
            
            if (req.method === 'PUT' && subId) {
              const key = `${companyId}-${subId}`;
              const membership = mockData.members.get(key);
              if (membership) {
                membership.role = body.role;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, data: { membership } }));
                return;
              }
            }
            
            if (req.method === 'DELETE' && subId) {
              mockData.members.delete(`${companyId}-${subId}`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
              return;
            }
          }
        }
      }
      
      // === TASK ENDPOINTS ===
      const taskMatch = url.pathname.match(/^\/api\/v1\/tasks(?:\/(.*))?$/);
      if (taskMatch) {
        const taskId = taskMatch[1];
        
        if (req.method === 'POST' && !taskId) {
          if (body.priority && (body.priority < 1 || body.priority > 10)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ errors: ['priority'] }));
            return;
          }
          const id = generateId();
          const task = {
            id,
            taskId: id,
            type: body.type,
            priority: body.priority || 5,
            payload: body.payload,
            status: 'scheduled',
            createdAt: new Date().toISOString()
          };
          mockData.tasks.set(id, task);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ taskId: id, status: 'scheduled' }));
          return;
        }
        
        if (req.method === 'GET' && taskId) {
          const task = mockData.tasks.get(taskId);
          if (!task) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Task not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(task));
          return;
        }
      }
      
      // === WORKFLOW ENDPOINTS ===
      const workflowMatch = url.pathname.match(/^\/api\/v1\/workflows(?:\/(.*))?$/);
      if (workflowMatch) {
        const workflowId = workflowMatch[1];
        
        if (req.method === 'POST' && !workflowId) {
          const id = generateId();
          const workflow = {
            workflowId: id,
            id,
            name: body.name,
            stages: body.stages || [],
            status: 'started',
            createdAt: new Date().toISOString()
          };
          mockData.workflows.set(id, workflow);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ workflowId: id, status: 'started' }));
          return;
        }
        
        if (req.method === 'GET' && workflowId) {
          const workflow = mockData.workflows.get(workflowId);
          if (!workflow) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Workflow not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(workflow));
          return;
        }
      }
      
      // === APPROVAL ENDPOINTS ===
      const approvalMatch = url.pathname.match(/^\/api\/approvals(?:\/(.*))?$/);
      if (approvalMatch) {
        const approvalPath = approvalMatch[1];
        
        if (req.method === 'GET' && !approvalPath) {
          const companyId = url.searchParams.get('companyId');
          let items = Array.from(mockData.approvals.values());
          if (companyId) {
            items = items.filter(a => a.companyId === companyId);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { items, pagination: { total: items.length } } }));
          return;
        }
        
        if (req.method === 'POST' && !approvalPath) {
          const id = generateId();
          const approval = {
            id,
            companyId: body.companyId,
            type: body.type,
            payload: body.payload,
            requestedBy: body.requestedByUserId || body.requestedByAgentId,
            requesterType: body.requestedByAgentId ? 'agent' : 'user',
            status: 'pending',
            priority: body.priority || 'medium',
            stakeholders: body.stakeholders || [],
            createdAt: new Date().toISOString()
          };
          mockData.approvals.set(id, approval);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: approval }));
          return;
        }
        
        if (approvalPath) {
          const [approvalId, action] = approvalPath.split('/');
          const approval = mockData.approvals.get(approvalId);
          
          if (!approval && approvalId !== 'pending' && approvalId !== 'delegations') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Approval not found' }));
            return;
          }
          
          if (req.method === 'GET') {
            if (approvalId === 'pending') {
              const companyId = url.searchParams.get('companyId');
              const userId = url.searchParams.get('userId');
              let items = Array.from(mockData.approvals.values()).filter(a => a.status === 'pending');
              if (companyId) items = items.filter(a => a.companyId === companyId);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { items } }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: approval }));
            return;
          }
          
          if (req.method === 'POST' && action === 'approve') {
            approval.status = 'approved';
            approval.decidedBy = body.decidedByUserId;
            approval.decidedAt = new Date().toISOString();
            approval.note = body.note;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: approval }));
            return;
          }
          
          if (req.method === 'POST' && action === 'reject') {
            approval.status = 'rejected';
            approval.decidedBy = body.decidedByUserId;
            approval.decidedAt = new Date().toISOString();
            approval.rejectionReason = body.reason;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: approval }));
            return;
          }
          
          if (req.method === 'POST' && action === 'request-changes') {
            approval.status = 'changes_requested';
            approval.feedback = body.feedback;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: approval }));
            return;
          }
          
          if (req.method === 'POST' && action === 'comments') {
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: { id: generateId() } }));
            return;
          }
        }
      }
      
      // === WEBHOOK ENDPOINTS ===
      const webhookMatch = url.pathname.match(/^\/api\/webhooks(?:\/(.*))?$/);
      if (webhookMatch) {
        const webhookPath = webhookMatch[1];
        
        if (req.method === 'GET' && !webhookPath) {
          const companyId = url.searchParams.get('companyId');
          let items = Array.from(mockData.webhooks.values());
          if (companyId) items = items.filter(w => w.companyId === companyId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { items } }));
          return;
        }
        
        if (req.method === 'POST' && !webhookPath) {
          // Validate URL
          try {
            new URL(body.url);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid URL' }));
            return;
          }
          
          if (!body.eventTypes || !Array.isArray(body.eventTypes) || body.eventTypes.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'eventTypes required' }));
            return;
          }
          
          const id = generateId();
          const webhook = {
            id,
            url: body.url,
            name: body.name || 'Webhook',
            eventTypes: body.eventTypes,
            companyId: body.companyId,
            active: body.active !== false,
            retryCount: body.retryCount || 3,
            secret: body.secret,
            signingAlgorithm: body.signingAlgorithm,
            createdAt: new Date().toISOString()
          };
          mockData.webhooks.set(id, webhook);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: webhook }));
          return;
        }
        
        if (webhookPath) {
          const parts = webhookPath.split('/');
          const webhookId = parts[0];
          const action = parts[1];
          const subId = parts[2];
          const action2 = parts[3];
          
          if (req.method === 'GET') {
            const webhook = mockData.webhooks.get(webhookId);
            if (!webhook) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'Webhook not found' }));
              return;
            }
            if (action === 'deliveries') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { items: [] } }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: webhook }));
            return;
          }
          
          if (req.method === 'PUT') {
            const webhook = mockData.webhooks.get(webhookId);
            if (!webhook) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'Webhook not found' }));
              return;
            }
            Object.assign(webhook, body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: webhook }));
            return;
          }
          
          if (req.method === 'DELETE') {
            mockData.webhooks.delete(webhookId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: { deleted: true } }));
            return;
          }
          
          if (req.method === 'POST') {
            if (action === 'rotate') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { rotated: true, newSecret: `secret-${generateId()}` } }));
              return;
            }
            if (action === 'test') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
              return;
            }
            if (action === 'deliveries' && subId && action2 === 'retry') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
              return;
            }
          }
        }
      }
      
      if (url.pathname === '/api/webhooks/event-types') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            items: [
              { name: 'task.created', category: 'task' },
              { name: 'task.updated', category: 'task' },
              { name: 'task.completed', category: 'task' },
              { name: 'issue.created', category: 'issue' },
              { name: 'system.startup', category: 'system' }
            ]
          }
        }));
        return;
      }
      
      // === PLUGIN ENDPOINTS ===
      const pluginMatch = url.pathname.match(/^\/api\/plugins(?:\/(.*))?$/);
      if (pluginMatch) {
        const pluginPath = pluginMatch[1];
        
        if (req.method === 'GET' && !pluginPath) {
          const status = url.searchParams.get('status');
          let items = Array.from(mockData.plugins.values());
          if (status) items = items.filter(p => p.status === status);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { items } }));
          return;
        }
        
        if (req.method === 'POST' && !pluginPath) {
          const manifest = body.manifest;
          if (!manifest || !manifest.id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid manifest' }));
            return;
          }
          
          if (mockData.plugins.has(manifest.id)) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Plugin already exists' }));
            return;
          }
          
          const plugin = {
            id: manifest.id,
            ...manifest,
            status: body.autoStart ? 'active' : 'installed',
            installedAt: new Date().toISOString()
          };
          mockData.plugins.set(manifest.id, plugin);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: plugin }));
          return;
        }
        
        if (pluginPath) {
          const parts = pluginPath.split('/');
          const pluginId = parts[0];
          const action = parts[1];
          const toolId = parts[2];
          
          if (req.method === 'GET') {
            if (action === 'logs') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { items: [] } }));
              return;
            }
            const plugin = mockData.plugins.get(pluginId);
            if (!plugin) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'Plugin not found' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: plugin }));
            return;
          }
          
          if (req.method === 'PUT') {
            const plugin = mockData.plugins.get(pluginId);
            if (!plugin) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'Plugin not found' }));
              return;
            }
            if (body.config) {
              plugin.config = { ...plugin.config, ...body.config };
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: plugin }));
            return;
          }
          
          if (req.method === 'DELETE') {
            mockData.plugins.delete(pluginId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: { uninstalled: true, purgeData: url.searchParams.get('purgeData') === 'true' } }));
            return;
          }
          
          if (req.method === 'POST') {
            if (action === 'enable') {
              const plugin = mockData.plugins.get(pluginId);
              if (!plugin) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Plugin not found' }));
                return;
              }
              plugin.status = 'active';
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: plugin }));
              return;
            }
            
            if (action === 'disable') {
              const plugin = mockData.plugins.get(pluginId);
              if (!plugin) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Plugin not found' }));
                return;
              }
              plugin.status = 'terminated';
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: plugin }));
              return;
            }
            
            if (action === 'tools' && toolId) {
              const plugin = mockData.plugins.get(pluginId);
              if (!plugin || plugin.status !== 'active') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Plugin not active', code: 'PLUGIN_NOT_ACTIVE' }));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, result: {} }));
              return;
            }
          }
        }
      }
      
      // === HEARTBEAT ENDPOINTS ===
      const heartbeatMatch = url.pathname.match(/^\/api\/heartbeat(?:\/(.*))?$/);
      if (heartbeatMatch) {
        const hbPath = heartbeatMatch[1];
        
        if (url.pathname === '/api/heartbeat/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            services: { heartbeat: 'ok', sessions: 'ok' }
          }));
          return;
        }
        
        if (url.pathname === '/api/heartbeat/costs') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            totalCostCents: 1234,
            runCount: 5,
            dailyBreakdown: [],
            filters: { since: url.searchParams.get('since'), until: url.searchParams.get('until') }
          }));
          return;
        }
        
        if (hbPath) {
          const parts = hbPath.split('/');
          const resource = parts[0];
          const resourceId = parts[1];
          const subResource = parts[2];
          const subAction = parts[3];
          
          // Agents endpoints
          if (resource === 'agents' && resourceId) {
            if (req.method === 'POST' && parts[2] === 'wakeup') {
              const runId = generateId();
              const run = {
                id: runId,
                agentId: resourceId,
                status: 'queued',
                source: body.source,
                triggerDetail: body.triggerDetail,
                createdAt: new Date().toISOString()
              };
              mockData.runs.set(runId, run);
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ run }));
              return;
            }
            
            if (subResource === 'sessions') {
              if (req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ sessions: [] }));
                return;
              }
              if (req.method === 'DELETE' && subAction) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ deleted: true }));
                return;
              }
            }
          }
          
          // Runs endpoints
          if (resource === 'runs') {
            if (req.method === 'POST' && !resourceId) {
              const runId = generateId();
              const run = {
                id: runId,
                agentId: body.agentId,
                status: 'queued',
                invocationSource: body.invocationSource,
                triggerDetail: body.triggerDetail,
                contextSnapshot: body.contextSnapshot,
                createdAt: new Date().toISOString()
              };
              mockData.runs.set(runId, run);
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ run }));
              return;
            }
            
            if (req.method === 'GET' && !resourceId) {
              const agentId = url.searchParams.get('agentId');
              const status = url.searchParams.get('status');
              let runs = Array.from(mockData.runs.values());
              if (agentId) runs = runs.filter(r => r.agentId === agentId);
              if (status) runs = runs.filter(r => r.status === status);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ runs }));
              return;
            }
            
            if (resourceId) {
              if (req.method === 'GET') {
                const run = mockData.runs.get(resourceId);
                if (!run) {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ message: 'Run not found' }));
                  return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ run }));
                return;
              }
              
              if (req.method === 'POST') {
                if (subResource === 'cancel') {
                  const run = mockData.runs.get(resourceId);
                  if (run) run.status = 'cancelled';
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ status: 'cancelled' }));
                  return;
                }
                if (subResource === 'retry') {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ status: 'retrying' }));
                  return;
                }
              }
              
              if (subResource === 'events') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ events: [] }));
                return;
              }
              
              if (subResource === 'log') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Run log content');
                return;
              }
              
              if (subResource === 'cost') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ cost: { total: 100, currency: 'USD' } }));
                return;
              }
            }
          }
        }
      }
      
      // === MCP ENDPOINTS ===
      if (url.pathname.startsWith('/mcp/')) {
        if (url.pathname === '/mcp/v1/tools') {
          if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              tools: [
                { name: 'file-read', description: 'Read a file', inputSchema: { type: 'object' } },
                { name: 'file-write', description: 'Write a file', inputSchema: { type: 'object' } },
                { name: 'command-exec', description: 'Execute command', inputSchema: { type: 'object' } }
              ]
            }));
            return;
          }
        }
        
        if (url.pathname === '/mcp/v1/execute') {
          if (req.method === 'POST') {
            if (body.tool === 'file-read' && !body.params?.path) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ errors: ['path is required'] }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              content: 'File content',
              metadata: { size: 100 },
              isError: false
            }));
            return;
          }
        }
        
        if (url.pathname === '/mcp/v1/resources') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ resources: [] }));
          return;
        }
        
        if (url.pathname === '/mcp/v1/prompts') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ prompts: [] }));
          return;
        }
      }
      
      // === ADMIN/USER ENDPOINTS ===
      if (url.pathname === '/api/v1/admin/config') {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader === 'Bearer invalid-token') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ config: {} }));
        return;
      }
      
      if (url.pathname === '/api/v1/user/profile') {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ username: 'testuser' }));
        return;
      }
      
      // === TEST CONTROL ENDPOINTS ===
      if (url.pathname === '/test/reset' && req.method === 'POST') {
        // Reset rate limit counters
        if (global.requestCounts) global.requestCounts.clear();
        
        mockData.cvs.clear();
        mockData.users.clear();
        mockData.companies.clear();
        mockData.tasks.clear();
        mockData.workflows.clear();
        mockData.approvals.clear();
        mockData.webhooks.clear();
        mockData.plugins.clear();
        mockData.sessions.clear();
        mockData.apiKeys.clear();
        mockData.members.clear();
        mockData.runs.clear();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'reset', timestamp: Date.now() }));
        return;
      }
      
      if (url.pathname === '/test/seed' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'seeded', timestamp: Date.now() }));
        return;
      }
      
      // Method not allowed for known patterns
      if (url.pathname === '/api/v1/cvs' && req.method === 'PATCH') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Method not allowed' }));
        return;
      }
      
      // Error test endpoint
      if (url.pathname === '/api/v1/error-test') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Internal server error' }));
        return;
      }
      
      // Default 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        message: 'Not found',
        path: url.pathname 
      }));
      
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: error.message,
        code: 'INTERNAL_ERROR'
      }));
    }
  };
}

/**
 * Setup WebSocket server
 * @param {Object} server - HTTP server instance
 * @param {Object} config - Server configuration
 */
async function setupWebSocket(server, config) {
  // Mock WebSocket setup
  // In real implementation, this would use the 'ws' library
  server.webSocketEnabled = true;
}

/**
 * Load fixture data from file
 * @param {string} filename - Fixture filename
 * @param {string} key - Optional key to extract from fixture
 * @returns {any} Fixture data
 */
export function loadFixture(filename, key = null) {
  const fixturePath = join(__dirname, '..', 'fixtures', filename);
  const content = readFileSync(fixturePath, 'utf-8');
  const data = JSON.parse(content);
  
  if (key) {
    return data[key];
  }
  return data;
}

/**
 * Load SQL fixture and return as string
 * @param {string} filename - SQL fixture filename
 * @returns {string} SQL content
 */
export function loadSQLFixture(filename) {
  const fixturePath = join(__dirname, '..', 'fixtures', filename);
  return readFileSync(fixturePath, 'utf-8');
}

/**
 * Create a test database connection pool
 * @param {Object} config - Database configuration
 * @returns {Object} Database pool
 */
export async function createTestDatabase(config = {}) {
  const defaultDbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'cognimesh_test',
    user: 'test',
    password: 'test',
    max: 10,
    ...config
  };
  
  // Mock implementation - in real tests, use actual pg Pool
  return {
    query: async (sql, params) => ({ rows: [], rowCount: 0 }),
    connect: async () => ({ 
      query: async (sql, params) => ({ rows: [], rowCount: 0 }),
      release: () => {}
    }),
    end: async () => {},
    on: () => {}
  };
}

/**
 * Setup test database with migrations
 * @param {Object} pool - Database pool
 */
export async function setupTestDatabase(pool) {
  // Run migrations
  // This is a mock implementation
  await pool.query('BEGIN');
  // Run migration scripts...
  await pool.query('COMMIT');
}

/**
 * Teardown test database
 * @param {Object} pool - Database pool
 */
export async function teardownTestDatabase(pool) {
  // Clean up test data
  await pool.query('DROP TABLE IF EXISTS test_data CASCADE');
  await pool.end();
}

/**
 * Wait for server to be ready
 * @param {string} url - Health check URL
 * @param {Object} options - Wait options
 */
export async function waitForServer(url, options = {}) {
  const { timeout = 30000, interval = 500 } = options;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, interval));
  }
  
  throw new Error(`Server not ready after ${timeout}ms`);
}

/**
 * Create isolated test context
 * Provides fresh server and database for each test
 */
export async function createTestContext() {
  const server = await startTestServer();
  const db = await createTestDatabase();
  
  return {
    server,
    db,
    baseUrl: server.baseUrl,
    
    async cleanup() {
      await server.close();
      await db.end();
    }
  };
}

// Cleanup on process exit
process.on('exit', () => {
  if (activeServers.size > 0) {
    console.warn(`Warning: ${activeServers.size} test servers still running`);
  }
});

process.on('SIGINT', async () => {
  await stopAllTestServers();
  process.exit(0);
});

export default {
  startTestServer,
  stopTestServer,
  stopAllTestServers,
  loadFixture,
  loadSQLFixture,
  createTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
  waitForServer,
  createTestContext
};
