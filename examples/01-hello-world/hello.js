#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Hello World Example
 * 
 * This is the simplest possible CogniMesh program.
 * It demonstrates the basic BIOS lifecycle:
 * 1. Create BIOS instance
 * 2. Boot the system
 * 3. Check status
 * 4. Shutdown gracefully
 * 
 * @example
 *   node hello.js
 * 
 * @module examples/01-hello-world/hello
 */

import { CogniMeshBIOS, SystemState } from '../../src/bios/index.js';

// ============================================================
// Hello World Example
// ============================================================

console.log('[CogniMesh v5.0] Hello World Example');
console.log('=====================================\n');

// Create a new BIOS instance
// This initializes the firmware but doesn't start any subsystems yet
const bios = new CogniMeshBIOS();

// Listen for BIOS events to understand what's happening
bios.on('bios:boot:start', (data) => {
  console.log(`[BIOS] Boot started (v${data.version})`);
});

bios.on('bios:boot:complete', (data) => {
  console.log(`[BIOS] Boot completed in ${data.duration}ms`);
});

bios.on('bios:boot:error', (error) => {
  console.error('[BIOS] Boot error:', error.message);
});

bios.on('bios:shutdown:complete', () => {
  console.log('\n✅ Goodbye!');
});

// ============================================================
// Main execution
// ============================================================

async function main() {
  try {
    // Execute the boot sequence
    // This will:
    // 1. Load configuration from environment and optional config file
    // 2. Initialize core subsystems (system monitor, etc.)
    // 3. Run diagnostics (unless skipDiagnostics: true)
    // 4. Enter operational mode
    const bootSuccess = await bios.boot({
      // Optional: skip diagnostic checks for faster boot
      // skipDiagnostics: true,
    });

    if (!bootSuccess) {
      console.error('❌ BIOS boot failed!');
      process.exit(1);
    }

    console.log('\n✅ BIOS Boot Successful!\n');

    // Check system status
    const status = bios.getStatus();
    console.log('System Status:');
    console.log(JSON.stringify(status, null, 2));

    // Demonstrate state checking
    console.log('\n--- State Information ---');
    console.log(`Current State: ${bios.state}`);
    console.log(`Is Operational: ${bios.state === SystemState.OPERATIONAL}`);
    console.log(`Registered Components: ${bios.components.size}`);

    // List all registered components
    if (bios.components.size > 0) {
      console.log('\n--- Registered Components ---');
      for (const [id, component] of bios.components) {
        console.log(`  - ${id} (${component.type || 'unknown'})`);
      }
    }

    // Graceful shutdown
    console.log('\n[BIOS] Shutting down...');
    await bios.shutdown();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the example
main();

// ============================================================
// Key Concepts Demonstrated:
// ============================================================
// 
// 1. BIOS Instantiation:
//    - const bios = new CogniMeshBIOS()
//    - Creates the firmware layer but doesn't start anything
//
// 2. Boot Sequence:
//    - await bios.boot(options)
//    - Executes the full initialization sequence
//    - Returns boolean indicating success/failure
//
// 3. Event Handling:
//    - bios.on('event', handler)
//    - Listen for lifecycle events
//
// 4. Status Checking:
//    - bios.getStatus() - Full status object
//    - bios.state - Current system state
//    - bios.components - Registered components
//
// 5. Graceful Shutdown:
//    - await bios.shutdown()
//    - Cleans up all resources
//
// ============================================================
