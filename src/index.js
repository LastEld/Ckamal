#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Application Entry Point
 * @module index
 * @description Main entry point for CogniMesh server with graceful shutdown
 * @version 5.0.0
 */

import { CogniMeshServer } from './server.js';
import { logger } from './utils/logger.js';
import { renderWelcome } from './bios/welcome.js';

/**
 * Main application entry point
 * @async
 */
async function main() {
  const startTime = Date.now();
  
  try {
    logger.info('Starting CogniMesh v5.0...', { 
      version: '5.0.0',
      node: process.version,
      platform: process.platform 
    });

    // Create server instance
    const server = new CogniMeshServer();
    
    // Initialize all components
    await server.initialize();
    
    // Start the server
    await server.start();
    
    const initTime = Date.now() - startTime;
    logger.info(`CogniMesh v5.0 started successfully in ${initTime}ms`, {
      initTime,
      status: server.status,
      pid: process.pid
    });

    // Render welcome banner to console
    renderWelcome({
      initTime,
      httpPort: server._config?.server?.port || 3000,
      dashboardPort: server._config?.dashboard?.port || 3001,
      wsPath: '/ws',
      toolCount: server._tools?.getToolCount?.() || server._tools?.size || 0,
      providers: {
        claude: true,
        codex: true,
        kimi: true
      },
      biosState: server._bios?.state || 'OPERATIONAL'
    });

    // Graceful shutdown handlers
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`);
      
      try {
        await server.stop();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Windows specific
    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => shutdown('SIGBREAK'));
    }

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    });

    // Keep process alive
    server.on('stopped', () => {
      logger.info('Server stopped, exiting process');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start CogniMesh:', error);
    process.exit(1);
  }
}

// Run main function
main();
