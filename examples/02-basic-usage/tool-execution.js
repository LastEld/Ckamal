#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Tool Execution Example
 * 
 * This example demonstrates how to execute tools and handle results:
 * 1. List available tools
 * 2. Execute system tools
 * 3. Handle tool responses
 * 4. Error handling for tool execution
 * 
 * @example
 *   node tool-execution.js
 * 
 * @module examples/02-basic-usage/tool-execution
 */

import { CogniMeshServer } from '../../src/server.js';

// ============================================================
// Tool Execution Example
// ============================================================

console.log('[CogniMesh v5.0] Tool Execution Example');
console.log('========================================\n');

async function main() {
  let server;

  try {
    // Step 1: Initialize and start server
    console.log('[Server] Initializing...\n');
    server = new CogniMeshServer();
    await server.initialize();
    await server.start();
    
    console.log('✅ Server initialized\n');

    // Step 2: Explore available tools
    console.log('--- Available Tools ---');
    const tools = server.tools.list();
    console.log(`Found ${tools.length} registered tools:\n`);
    
    // Display tools with descriptions
    tools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name}`);
      console.log(`     ${tool.description}`);
      console.log(`     Tags: ${tool.tags?.join(', ') || 'none'}\n`);
    });

    // Step 3: Execute system health tool
    console.log('\n--- Executing Tools ---\n');
    
    // Example 1: System Health Check
    console.log('Tool: system_health');
    console.log('Parameters: { detailed: true }');
    try {
      const healthResult = await server.tools.execute('system_health', {
        detailed: true
      });
      
      console.log('Result:');
      console.log(JSON.stringify(healthResult, null, 2));
      
      if (healthResult.success) {
        console.log(`\n✅ System is ${healthResult.data.overall}`);
      }
    } catch (error) {
      console.error('❌ Tool execution failed:', error.message);
    }

    // Example 2: System Metrics
    console.log('\n---\n');
    console.log('Tool: system_metrics');
    console.log('Parameters: { duration: 1, components: ["cpu", "memory"] }');
    try {
      const metricsResult = await server.tools.execute('system_metrics', {
        duration: 1,
        components: ['cpu', 'memory']
      });
      
      console.log('Result:');
      console.log(JSON.stringify(metricsResult, null, 2));
      
      if (metricsResult.success) {
        console.log(`\n✅ CPU: ${metricsResult.data.cpu.usage}% (${metricsResult.data.cpu.cores} cores)`);
        console.log(`✅ Memory: ${metricsResult.data.memory.percentage}% used`);
      }
    } catch (error) {
      console.error('❌ Tool execution failed:', error.message);
    }

    // Example 3: Get Configuration
    console.log('\n---\n');
    console.log('Tool: system_config_get');
    console.log('Parameters: { includeDefaults: true }');
    try {
      const configResult = await server.tools.execute('system_config_get', {
        includeDefaults: true
      });
      
      console.log('Result:');
      console.log(JSON.stringify(configResult, null, 2));
      
      if (configResult.success) {
        console.log('\n✅ Configuration retrieved');
      }
    } catch (error) {
      console.error('❌ Tool execution failed:', error.message);
    }

    // Example 4: System Status
    console.log('\n---\n');
    console.log('Tool: system_status');
    console.log('Parameters: { includeHistory: false }');
    try {
      const statusResult = await server.tools.execute('system_status', {
        includeHistory: false
      });
      
      console.log('Result:');
      console.log(JSON.stringify(statusResult, null, 2));
      
      if (statusResult.success) {
        console.log(`\n✅ System status: ${statusResult.data.status}`);
        console.log(`✅ Mode: ${statusResult.data.mode}`);
      }
    } catch (error) {
      console.error('❌ Tool execution failed:', error.message);
    }

    // Example 5: Create Backup (demonstrates async operation)
    console.log('\n---\n');
    console.log('Tool: system_backup_create');
    console.log('Parameters: { type: "full", components: ["config"] }');
    try {
      const backupResult = await server.tools.execute('system_backup_create', {
        type: 'full',
        components: ['config'],
        compress: true,
        encrypt: false
      });
      
      console.log('Result:');
      console.log(JSON.stringify(backupResult, null, 2));
      
      if (backupResult.success) {
        console.log(`\n✅ Backup created: ${backupResult.data.id}`);
        console.log(`✅ Status: ${backupResult.data.status}`);
      }
    } catch (error) {
      console.error('❌ Tool execution failed:', error.message);
    }

    console.log('\n✅ All tools executed successfully');

    // Step 4: Show tool statistics
    console.log('\n--- Tool Statistics ---');
    const stats = server.tools.getStats();
    console.log(JSON.stringify(stats, null, 2));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    // Always ensure server is stopped
    if (server) {
      console.log('\n[Server] Shutting down...\n');
      await server.stop();
      console.log('✅ Server stopped');
    }
  }
}

// Run the example
main();

// ============================================================
// Key Concepts Demonstrated:
// ============================================================
//
// 1. Tool Discovery:
//    - server.tools.list() - Get all registered tools
//    - Each tool has: name, description, inputSchema, outputSchema, tags
//
// 2. Tool Execution:
//    - await server.tools.execute(name, params, context)
//    - name: Tool name (string)
//    - params: Input parameters (object)
//    - context: Execution context (optional, includes userId, socketId)
//
// 3. Response Handling:
//    - All tools return: { success: boolean, data: any }
//    - Check success before accessing data
//
// 4. Error Handling:
//    - Wrap tool execution in try/catch
//    - Handle both tool errors and system errors
//
// 5. Common System Tools:
//    - system_health: Check system health status
//    - system_metrics: Get CPU, memory, disk metrics
//    - system_config_get: Retrieve configuration
//    - system_config_set: Update configuration
//    - system_status: Get operational status
//    - system_logs: Retrieve system logs
//    - system_backup_create: Create backups
//    - system_backup_restore: Restore from backup
//
// ============================================================
