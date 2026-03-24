#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Task Delegation Example
 * 
 * This example demonstrates task delegation patterns:
 * 1. Simple task delegation to a client
 * 2. Priority-based delegation
 * 3. Multiple task delegation
 * 4. Task result handling
 * 
 * @example
 *   node delegate-task.js
 * 
 * @module examples/03-agent-orchestration/delegate-task
 */

import { CogniMeshBIOS } from '../../src/bios/index.js';
import { OperatorConsole } from '../../src/bios/console.js';

// ============================================================
// Task Delegation Example
// ============================================================

console.log('[CogniMesh v5.0] Task Delegation Example');
console.log('=========================================\n');

async function main() {
  // Initialize BIOS and console
  const bios = new CogniMeshBIOS();
  await bios.boot();
  
  const console_ = new OperatorConsole(bios);
  
  // Track delegated tasks
  const delegatedTasks = [];
  
  // Listen for delegation events
  console_.on('task:delegated', (delegation) => {
    console.log(`\n📢 Task Delegated: ${delegation.id}`);
    console.log(`   Target: ${delegation.target}`);
    console.log(`   Priority: ${delegation.priority}`);
    delegatedTasks.push(delegation);
  });

  console.log('✅ Console ready\n');

  try {
    // Step 1: Simple task delegation
    console.log('--- Delegating Tasks ---\n');
    
    console.log('Task 1: Simple delegation to Claude');
    const result1 = await console_.execute([
      'delegate',
      '--to=claude',
      '--task=Refactor authentication module'
    ]);
    
    if (result1.success) {
      console.log(`✅ ${result1.message}`);
      console.log(`   Task ID: ${result1.data.id}`);
      console.log(`   Status: ${result1.data.status}\n`);
    }

    // Step 2: Priority-based delegation
    console.log('Task 2: High-priority delegation to Kimi');
    const result2 = await console_.execute([
      'delegate',
      '--to=kimi',
      '--task=Critical security patch for login endpoint',
      '--priority=high'
    ]);
    
    if (result2.success) {
      console.log(`✅ ${result2.message}`);
      console.log(`   Task ID: ${result2.data.id}`);
      console.log(`   Priority: ${result2.data.priority}\n`);
    }

    // Step 3: Alternative command format
    console.log('Task 3: Using alternative command format');
    const result3 = await console_.execute([
      'delegate',
      'codex',
      'Implement',
      'user',
      'profile',
      'API',
      'endpoint'
    ]);
    
    if (result3.success) {
      console.log(`✅ ${result3.message}`);
      console.log(`   Task ID: ${result3.data.id}\n`);
    }

    // Step 4: Show client status
    console.log('--- Client Status ---\n');
    const clientsResult = await console_.execute('clients');
    console.log(clientsResult.formatted || JSON.stringify(clientsResult.data, null, 2));

    // Step 5: Show task statistics
    console.log('\n--- Task Statistics ---\n');
    const metricsResult = await console_.execute('metrics');
    if (metricsResult.data) {
      console.log(`Tasks Completed: ${metricsResult.data.tasksCompleted}`);
      console.log(`Tasks Failed: ${metricsResult.data.tasksFailed}`);
      console.log(`Success Rate: ${metricsResult.data.taskSuccessRate}%`);
    }

    // Step 6: Show all delegated tasks
    console.log('\n--- All Delegated Tasks ---\n');
    if (delegatedTasks.length > 0) {
      delegatedTasks.forEach((task, index) => {
        console.log(`${index + 1}. Task ${task.id}`);
        console.log(`   Target: ${task.target}`);
        console.log(`   Priority: ${task.priority}`);
        console.log(`   Task: ${task.task.substring(0, 50)}...`);
        console.log(`   Timestamp: ${task.timestamp}\n`);
      });
    }

    // Step 7: Demonstrate programmatic delegation
    console.log('--- Programmatic Delegation ---\n');
    
    const programmaticTasks = [
      { target: 'claude', task: 'Write unit tests for auth module', priority: 'normal' },
      { target: 'kimi', task: 'Optimize database queries', priority: 'high' },
      { target: 'codex', task: 'Generate API documentation', priority: 'low' }
    ];
    
    for (const task of programmaticTasks) {
      console.log(`Delegating to ${task.target} (${task.priority})...`);
      
      // Can also call the command handler directly
      const result = await console_.cmdDelegate({
        to: task.target,
        task: task.task,
        priority: task.priority
      });
      
      if (result.success) {
        console.log(`✅ ${result.message}\n`);
      }
    }

    console.log('\n✅ Task delegation example complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await bios.shutdown();
    console.log('\n✅ BIOS shutdown complete');
  }
}

// Run the example
main();

// ============================================================
// Key Concepts Demonstrated:
// ============================================================
//
// 1. Task Delegation Patterns:
//    - Simple: delegate <target> <task>
//    - Named args: delegate --to=<target> --task="..."
//    - With priority: --priority=high|normal|low
//
// 2. Target Clients:
//    - claude: Anthropic Claude AI
//    - kimi: Moonshot Kimi AI
//    - codex: OpenAI Codex
//    - Can also target specific agent IDs
//
// 3. Priority Levels:
//    - high: Urgent tasks, process first
//    - normal: Standard priority (default)
//    - low: Background tasks
//
// 4. Delegation Results:
//    - Task ID for tracking
//    - Status (delegated, in_progress, completed)
//    - Timestamp for auditing
//
// 5. Event Tracking:
//    - task:delegated event emitted
//    - Can track all delegations centrally
//    - Useful for metrics and monitoring
//
// ============================================================
