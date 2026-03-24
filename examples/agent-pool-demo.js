/**
 * @fileoverview Agent Pool Demo
 * Demonstrates the agent pool, lifecycle management, supervision, and scheduling
 * 
 * Run with: node examples/agent-pool-demo.js
 */

import { AgentManager, AgentType, TaskPriority } from '../src/agents/index.js';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(60));
  console.log('Agent Pool and Lifecycle Manager Demo');
  console.log('='.repeat(60));
  console.log();

  // Create and initialize the agent manager
  console.log('1. Creating Agent Manager...');
  const manager = new AgentManager({
    agentType: AgentType.CODING,
    minPoolSize: 2,
    maxPoolSize: 5,
    autoScale: true,
    enableSupervision: true,
    enableScheduling: true
  });

  await manager.initialize();
  console.log('   ✓ Agent Manager initialized');
  console.log();

  // Show initial stats
  console.log('2. Initial Pool Statistics:');
  const initialStats = manager.getStats();
  console.log(`   Pool Size: ${initialStats.pool.poolSize}`);
  console.log(`   Available: ${initialStats.pool.availableCount}`);
  console.log(`   Min/Max: ${initialStats.pool.minPoolSize}/${initialStats.pool.maxPoolSize}`);
  console.log();

  // Demonstrate agent acquisition and release
  console.log('3. Acquiring Agents:');
  const agent1 = await manager.acquire();
  console.log(`   ✓ Acquired agent: ${agent1.id}`);
  
  const agent2 = await manager.acquire();
  console.log(`   ✓ Acquired agent: ${agent2.id}`);
  
  let stats = manager.getStats();
  console.log(`   Available after acquisition: ${stats.pool.availableCount}`);
  console.log();

  // Release agents
  console.log('4. Releasing Agents:');
  manager.release(agent1);
  console.log(`   ✓ Released agent: ${agent1.id}`);
  
  manager.release(agent2);
  console.log(`   ✓ Released agent: ${agent2.id}`);
  
  stats = manager.getStats();
  console.log(`   Available after release: ${stats.pool.availableCount}`);
  console.log();

  // Demonstrate task execution
  console.log('5. Executing Task with Agent:');
  const result = await manager.execute(async (agent) => {
    console.log(`   → Executing on agent: ${agent.id}`);
    await sleep(100); // Simulate work
    return { status: 'completed', agentId: agent.id };
  });
  console.log(`   ✓ Task completed: ${JSON.stringify(result)}`);
  console.log();

  // Demonstrate scaling
  console.log('6. Scaling Operations:');
  const added = await manager.scaleUp(2);
  console.log(`   ✓ Scaled up by ${added} agents`);
  
  stats = manager.getStats();
  console.log(`   New pool size: ${stats.pool.poolSize}`);
  
  const removed = await manager.scaleDown(1);
  console.log(`   ✓ Scaled down by ${removed} agents`);
  
  stats = manager.getStats();
  console.log(`   Final pool size: ${stats.pool.poolSize}`);
  console.log();

  // Demonstrate task scheduling
  console.log('7. Task Scheduling:');
  
  const tasks = [
    { id: 'task-1', type: 'analysis', payload: { data: 'sample1' } },
    { id: 'task-2', type: 'coding', payload: { file: 'example.js' } },
    { id: 'task-3', type: 'review', payload: { pr: '#123' } }
  ];

  for (const task of tasks) {
    const scheduled = manager.scheduleTask(task, {
      priority: TaskPriority.NORMAL
    });
    console.log(`   ✓ Scheduled: ${scheduled.id} (priority: ${scheduled.priority})`);
  }
  
  const schedulerStats = manager.getStats().scheduler;
  console.log(`   Total tasks submitted: ${schedulerStats.metrics.tasksSubmitted}`);
  console.log(`   Queue depth: ${schedulerStats.totalQueueDepth}`);
  console.log();

  // Show final statistics
  console.log('8. Final Statistics:');
  const finalStats = manager.getStats();
  console.log(`   Pool:`);
  console.log(`     - Size: ${finalStats.pool.poolSize}`);
  console.log(`     - Available: ${finalStats.pool.availableCount}`);
  console.log(`     - Total Requests: ${finalStats.pool.stats.totalRequests}`);
  console.log(`     - Scale Up Count: ${finalStats.pool.stats.scaleUpCount}`);
  console.log(`     - Scale Down Count: ${finalStats.pool.stats.scaleDownCount}`);
  
  if (finalStats.supervisor) {
    console.log(`   Supervisor:`);
    console.log(`     - Total Agents: ${finalStats.supervisor.totalAgents}`);
    console.log(`     - Healthy: ${finalStats.supervisor.healthyAgents}`);
  }
  
  if (finalStats.scheduler) {
    console.log(`   Scheduler:`);
    console.log(`     - Tasks Submitted: ${finalStats.scheduler.metrics.tasksSubmitted}`);
    console.log(`     - Registered Agents: ${finalStats.scheduler.registeredAgents}`);
  }
  console.log();

  // Shutdown
  console.log('9. Shutting down...');
  await manager.shutdown();
  console.log('   ✓ Agent Manager shut down');
  console.log();

  console.log('='.repeat(60));
  console.log('Demo completed successfully!');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
