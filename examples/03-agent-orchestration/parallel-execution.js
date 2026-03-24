#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Parallel Execution Example
 * 
 * This example demonstrates parallel task execution:
 * 1. Parallel execution across multiple clients
 * 2. GSD Engine workflow with dependencies
 * 3. Workflow lifecycle management
 * 4. Progress tracking
 * 
 * @example
 *   node parallel-execution.js
 * 
 * @module examples/03-agent-orchestration/parallel-execution
 */

import { CogniMeshBIOS } from '../../src/bios/index.js';
import { OperatorConsole } from '../../src/bios/console.js';
import { GSDEngine } from '../../src/gsd/index.js';

// ============================================================
// Parallel Execution Example
// ============================================================

console.log('[CogniMesh v5.0] Parallel Execution Example');
console.log('============================================\n');

async function main() {
  // Initialize BIOS
  const bios = new CogniMeshBIOS();
  await bios.boot();
  
  // Initialize GSD Engine for workflow management
  const engine = new GSDEngine({
    minAgents: 2,
    maxAgents: 5,
    autoScale: true
  });
  
  // Initialize console for parallel commands
  const console_ = new OperatorConsole(bios);

  console.log('✅ Engine and console initialized\n');

  try {
    // ============================================================
    // Part 1: Parallel Execution via Console
    // ============================================================
    
    console.log('--- Parallel Task Execution (Console) ---\n');
    
    // Execute the same task across multiple clients
    const parallelResult = await console_.execute([
      'parallel',
      '--clients=claude,kimi,codex',
      '--task=Optimize database queries for user table'
    ]);
    
    if (parallelResult.success) {
      console.log(`✅ ${parallelResult.message}\n`);
      
      // Display individual results
      if (parallelResult.data.results) {
        console.log('Individual Results:');
        parallelResult.data.results.forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.client}: ${result.status}`);
          console.log(`     Result: ${result.result}`);
        });
      }
    }

    // ============================================================
    // Part 2: Workflow with GSD Engine
    // ============================================================
    
    console.log('\n--- GSD Engine Workflow ---\n');
    
    // Define a workflow with parallel and dependent tasks
    const workflowDefinition = {
      id: 'analyze-and-fix',
      name: 'Code Analysis and Fix Workflow',
      tasks: [
        // Stage 1: Parallel analysis tasks
        {
          id: 'analyze-security',
          type: 'analysis',
          data: { focus: 'security' },
          handler: async (input, agent) => {
            console.log(`  [${agent.id}] Running security analysis...`);
            await sleep(200);
            return { 
              findings: ['SQL injection risk', 'Missing auth check'],
              severity: 'high'
            };
          }
        },
        {
          id: 'analyze-performance',
          type: 'analysis',
          data: { focus: 'performance' },
          handler: async (input, agent) => {
            console.log(`  [${agent.id}] Running performance analysis...`);
            await sleep(150);
            return { 
              findings: ['N+1 query', 'Missing cache'],
              severity: 'medium'
            };
          }
        },
        {
          id: 'analyze-style',
          type: 'analysis',
          data: { focus: 'style' },
          handler: async (input, agent) => {
            console.log(`  [${agent.id}] Running style analysis...`);
            await sleep(100);
            return { 
              findings: ['Inconsistent naming', 'Long functions'],
              severity: 'low'
            };
          }
        },
        
        // Stage 2: Dependent fix tasks (wait for analyses)
        {
          id: 'fix-security',
          type: 'fix',
          dependencies: ['analyze-security'],
          handler: async (input, agent) => {
            console.log(`  [${agent.id}] Applying security fixes...`);
            console.log(`    Input from analyze-security:`, input['analyze-security']);
            await sleep(300);
            return { fixed: 2, remaining: 0 };
          }
        },
        {
          id: 'fix-performance',
          type: 'fix',
          dependencies: ['analyze-performance'],
          handler: async (input, agent) => {
            console.log(`  [${agent.id}] Applying performance fixes...`);
            console.log(`    Input from analyze-performance:`, input['analyze-performance']);
            await sleep(250);
            return { fixed: 2, remaining: 0 };
          }
        },
        
        // Stage 3: Final verification (depends on all fixes)
        {
          id: 'verify-fixes',
          type: 'verification',
          dependencies: ['fix-security', 'fix-performance'],
          handler: async (input, agent) => {
            console.log(`  [${agent.id}] Verifying all fixes...`);
            const securityResult = input['fix-security'];
            const perfResult = input['fix-performance'];
            console.log(`    Security fixes: ${securityResult.fixed}`);
            console.log(`    Performance fixes: ${perfResult.fixed}`);
            await sleep(100);
            return { verified: true, totalFixed: securityResult.fixed + perfResult.fixed };
          }
        }
      ]
    };

    // Register the workflow
    engine.registerWorkflow(workflowDefinition);
    console.log(`✅ Workflow "${workflowDefinition.name}" registered`);
    console.log(`   Tasks: ${workflowDefinition.tasks.length}`);
    
    // Listen for workflow events
    engine.on('workflowStarted', ({ instanceId, workflowId }) => {
      console.log(`\n📢 Workflow started: ${instanceId}`);
    });
    
    engine.on('taskCompleted', ({ instanceId, taskId, result }) => {
      console.log(`✅ Task completed: ${taskId}`);
    });
    
    engine.on('workflowCompleted', ({ instanceId, output, duration }) => {
      console.log(`\n✅ Workflow completed in ${duration}ms`);
      console.log('   Final output:', JSON.stringify(output, null, 2));
    });

    // Start the workflow
    console.log('\n--- Starting Workflow Execution ---\n');
    const instanceId = await engine.startWorkflow('analyze-and-fix', {
      project: 'my-app',
      branch: 'main'
    });
    
    console.log(`Instance ID: ${instanceId}\n`);
    
    // Wait for completion (in real usage, you'd use events)
    await sleep(2000);
    
    // Get final status
    const status = engine.getStatus(instanceId);
    console.log('\n--- Workflow Status ---\n');
    console.log(`Status: ${status.status}`);
    console.log(`Progress: ${status.progress}%`);
    console.log(`Completed: ${status.completedTasks}/${status.totalTasks} tasks`);
    console.log(`Duration: ${status.duration}ms`);

    // ============================================================
    // Part 3: Chain Execution
    // ============================================================
    
    console.log('\n--- Chain Execution ---\n');
    
    const chainResult = await console_.execute([
      'chain',
      '--steps=[{"client":"claude","task":"Analyze code"},{"client":"kimi","task":"Refactor based on analysis"},{"client":"codex","task":"Generate tests"}]'
    ]);
    
    if (chainResult.success) {
      console.log(`✅ ${chainResult.message}\n`);
      
      if (chainResult.data.steps) {
        console.log('Chain Steps:');
        chainResult.data.steps.forEach((step) => {
          console.log(`  ${step.step}. ${step.client}: ${step.task}`);
          console.log(`     Input: ${step.input || 'none'}`);
          console.log(`     Output: ${step.output}`);
          console.log(`     Status: ${step.status}\n`);
        });
      }
    }

    // ============================================================
    // Part 4: Engine Statistics
    // ============================================================
    
    console.log('--- Engine Statistics ---\n');
    const stats = engine.getStats();
    console.log('Registered Workflows:', stats.registeredWorkflows);
    console.log('Total Instances:', stats.totalInstances);
    console.log('Running:', stats.runningInstances);
    console.log('Completed:', stats.completedInstances);
    console.log('Failed:', stats.failedInstances);
    console.log('Pool Size:', `${stats.poolStats.total}/${stats.poolStats.maxSize}`);

    console.log('\n✅ Parallel execution example complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    await engine.shutdown();
    await bios.shutdown();
    console.log('\n✅ Cleanup complete');
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
// 1. Parallel Execution:
//    - parallel --clients=a,b,c --task="..."
//    - Same task executed across multiple clients
//    - Results aggregated
//
// 2. GSD Engine Workflows:
//    - Define workflows with tasks and dependencies
//    - Tasks execute in parallel when possible
//    - Dependencies ensure correct order
//
// 3. Task Dependencies:
//    - tasks[].dependencies = ['task-id']
//    - Task waits for dependencies to complete
//    - Dependency results available as input
//
// 4. Workflow Lifecycle:
//    - registerWorkflow() - Define workflow
//    - startWorkflow() - Create instance
//    - Events: started, taskCompleted, completed
//    - getStatus() - Check progress
//
// 5. Agent Pool:
//    - GSDEngine manages agent pool
//    - Auto-scaling based on workload
//    - Configurable min/max agents
//
// 6. Chain Execution:
//    - Sequential execution across clients
//    - Output from one step feeds into next
//    - Useful for multi-stage processing
//
// ============================================================
