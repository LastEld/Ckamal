#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Server Setup Example
 * 
 * This example demonstrates the full server initialization sequence:
 * 1. Creating a server instance
 * 2. Initializing all components
 * 3. Starting the HTTP server
 * 4. Health checking
 * 5. Graceful shutdown
 * 
 * @example
 *   node server-setup.js
 * 
 * @module examples/02-basic-usage/server-setup
 */

import { CogniMeshServer } from '../../src/server.js';

// ============================================================
// Server Setup Example
// ============================================================

console.log('[CogniMesh v5.0] Server Setup Example');
console.log('======================================\n');

// Create a server instance
// The constructor accepts optional configuration
const server = new CogniMeshServer({
  // Optional: skip BIOS diagnostics for faster startup
  // skipDiagnostics: true,
  
  // Optional: provide configuration directly
  // config: { ... }
});

// Listen for server events
server.on('initializing', () => {
  console.log('[Server] Initializing CogniMesh Server...');
});

server.on('initialized', () => {
  console.log('[Server] Initialization complete');
});

server.on('started', () => {
  console.log('[Server] Server is now operational\n');
});

server.on('stopping', () => {
  console.log('[Server] Shutting down gracefully...');
});

server.on('stopped', () => {
  console.log('✅ Server stopped gracefully');
});

// Listen for BIOS events through the server
server.on('bios:boot:start', (data) => {
  console.log(`[BIOS] Boot started (v${data.version})`);
});

server.on('bios:boot:complete', (data) => {
  console.log(`[BIOS] Boot completed in ${data.duration}ms`);
});

// ============================================================
// Main execution
// ============================================================

async function main() {
  try {
    // Step 1: Initialize the server
    // This performs all setup steps in sequence:
    // - Load configuration
    // - Initialize BIOS
    // - Setup database
    // - Run migrations
    // - Initialize repositories
    // - Register tools
    // - Setup controller
    // - Initialize HTTP server
    // - Start WebSocket server
    console.log('[Server] Initializing...\n');
    await server.initialize();

    // Step 2: Start the server
    // This starts listening for HTTP connections
    console.log('[Server] Starting...\n');
    await server.start();

    console.log('✅ Server is running!\n');

    // Step 3: Check health status
    const health = server.getHealth();
    console.log('Health Status:', health.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY');
    console.log('\nServer Info:');
    console.log(`- Status: ${health.status}`);
    console.log(`- Version: ${health.version}`);
    console.log(`- Uptime: ${formatUptime(health.uptime)}`);
    console.log(`- Tools: ${health.components.tools.registered}`);

    // Step 4: Demonstrate accessing server components
    console.log('\n--- Server Components ---');
    console.log(`- BIOS State: ${server.bios?.state || 'N/A'}`);
    console.log(`- Database Connections: ${health.components.database.total}`);
    console.log(`- WebSocket Clients: ${health.components.websocket.clients || 0}`);

    // Step 5: Show tool registry info
    if (server.tools) {
      console.log('\n--- Tool Registry ---');
      console.log(`- Total Tools: ${server.tools.count}`);
      
      // List first 5 tools as example
      const tools = server.tools.list().slice(0, 5);
      console.log('- Sample Tools:');
      tools.forEach(tool => {
        console.log(`  • ${tool.name}: ${tool.description.substring(0, 50)}...`);
      });
    }

    // Step 6: Graceful shutdown
    console.log('\n[Server] Initiating graceful shutdown...\n');
    await server.stop();

  } catch (error) {
    console.error('\n❌ Server Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Helper function to format uptime
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// Run the example
main();

// ============================================================
// Key Concepts Demonstrated:
// ============================================================
//
// 1. Server Creation:
//    - const server = new CogniMeshServer(options)
//    - Creates server instance with optional configuration
//
// 2. Initialization:
//    - await server.initialize()
//    - Performs all setup steps in sequence
//    - Returns the server instance for chaining
//
// 3. Starting:
//    - await server.start()
//    - Begins accepting HTTP connections
//
// 4. Health Checking:
//    - server.getHealth() - Comprehensive health status
//    - Checks all components: BIOS, DB, tools, WebSocket
//
// 5. Component Access:
//    - server.bios - BIOS instance
//    - server.tools - Tool registry
//    - server.repositories - Repository factory
//    - server.wsServer - WebSocket server
//
// 6. Event Handling:
//    - server.on('event', handler)
//    - Listen to lifecycle events
//
// 7. Graceful Shutdown:
//    - await server.stop()
//    - Closes all connections and resources
//
// ============================================================
