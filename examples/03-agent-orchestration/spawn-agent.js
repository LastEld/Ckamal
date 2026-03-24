#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Agent Spawning Example
 * 
 * This example demonstrates agent spawning using the OperatorConsole:
 * 1. Initialize the console
 * 2. List existing agents
 * 3. Spawn new agents with different CVs
 * 4. Monitor agent status
 * 5. Kill agents
 * 
 * @example
 *   node spawn-agent.js
 * 
 * @module examples/03-agent-orchestration/spawn-agent
 */

import { CogniMeshBIOS } from '../../src/bios/index.js';
import { OperatorConsole } from '../../src/bios/console.js';

// ============================================================
// Agent Spawning Example
// ============================================================

console.log('[CogniMesh v5.0] Agent Spawning Example');
console.log('========================================\n');

async function main() {
  // Step 1: Initialize BIOS
  const bios = new CogniMeshBIOS();
  await bios.boot();
  
  // Step 2: Create operator console
  // The console provides high-level commands for agent management
  const console_ = new OperatorConsole(bios);
  
  // Listen for agent events
  console_.on('agent:spawned', ({ agentId, cvId }) => {
    console.log(`\n📢 Event: Agent ${agentId} spawned with CV ${cvId}`);
  });
  
  console_.on('agent:killed', ({ agentId }) => {
    console.log(`\n📢 Event: Agent ${agentId} terminated`);
  });

  console.log('✅ Console initialized\n');

  try {
    // Step 3: List initial agents
    console.log('--- Initial Agent List ---\n');
    const initialList = await console_.execute('agents list');
    console.log(initialList.formatted || JSON.stringify(initialList.data, null, 2));

    // Step 4: Spawn new agents with different CVs
    console.log('\n--- Spawning New Agents ---\n');
    
    const cvTypes = [
      'web-developer',
      'data-analyst',
      'security-auditor'
    ];
    
    for (const cvId of cvTypes) {
      console.log(`Spawning agent with CV: ${cvId}...`);
      const result = await console_.execute(`agents spawn ${cvId}`);
      
      if (result.success) {
        console.log(`✅ ${result.message}`);
        console.log(`   Agent ID: ${result.data.agentId}`);
        console.log(`   Status: ${result.data.status}\n`);
      } else {
        console.error(`❌ Failed: ${result.message}\n`);
      }
      
      // Small delay to simulate real-world timing
      await sleep(100);
    }

    // Step 5: List all agents after spawning
    console.log('\n--- Updated Agent List ---\n');
    const updatedList = await console_.execute('agents list');
    console.log(updatedList.formatted || JSON.stringify(updatedList.data, null, 2));

    // Step 6: Show agent statistics
    console.log('\n--- Agent Statistics ---\n');
    const metrics = await console_.execute('metrics');
    if (metrics.data && metrics.data.agents) {
      console.log(`Total Agents: ${metrics.data.agents.total}`);
      console.log(`Active Agents: ${metrics.data.agents.active}`);
      console.log(`Agents Spawned (session): ${metrics.data.agentsSpawned}`);
    }

    // Step 7: Demonstrate killing an agent
    console.log('\n--- Killing an Agent ---\n');
    const agentsToKill = updatedList.data.filter(a => a.cv === 'web-developer');
    if (agentsToKill.length > 0) {
      const targetAgent = agentsToKill[0];
      console.log(`Killing agent: ${targetAgent.id}...`);
      
      const killResult = await console_.execute(`agents kill ${targetAgent.id}`);
      if (killResult.success) {
        console.log(`✅ ${killResult.message}`);
      } else {
        console.error(`❌ ${killResult.message}`);
      }
    }

    // Step 8: Final agent list
    console.log('\n--- Final Agent List ---\n');
    const finalList = await console_.execute('agents list');
    console.log(finalList.formatted || JSON.stringify(finalList.data, null, 2));

    console.log('\n✅ Agent spawning example complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    await bios.shutdown();
    console.log('\n✅ BIOS shutdown complete');
  }
}

// Helper function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the example
main();

// ============================================================
// Key Concepts Demonstrated:
// ============================================================
//
// 1. Operator Console:
//    - High-level interface for agent management
//    - Provides commands: agents list, agents spawn, agents kill
//
// 2. CV-Based Spawning:
//    - Each agent is spawned with a Curriculum Vitae (CV)
//    - CV defines agent capabilities and specialization
//    - Examples: web-developer, data-analyst, security-auditor
//
// 3. Agent Lifecycle:
//    - Initializing -> Active -> Terminated
//    - Events emitted at each stage
//    - Can monitor via console events
//
// 4. Agent Types:
//    - WORKER: General purpose task executors
//    - COORDINATOR: Manages other agents
//    - SPECIALIST: Domain-specific experts
//
// 5. Agent Pool:
//    - Agents are managed in a pool
//    - Auto-scaling based on workload
//    - Health monitoring
//
// ============================================================
