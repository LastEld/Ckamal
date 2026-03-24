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
 * Create test application (mock implementation)
 * @param {Object} config - Server configuration
 * @returns {Function} Express/Fastify style request handler
 */
async function createTestApp(config) {
  // This is a mock implementation
  // In real tests, this would import the actual app
  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Request logging
    if (config.logRequests) {
      console.log(`${req.method} ${url.pathname}`);
    }
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // Route handling
    try {
      // Health endpoints
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
      
      // Test control endpoints
      if (url.pathname === '/test/reset' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'reset', timestamp: Date.now() }));
        return;
      }
      
      if (url.pathname === '/test/seed' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'seeded', timestamp: Date.now() }));
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
