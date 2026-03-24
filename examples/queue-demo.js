#!/usr/bin/env node
/**
 * @fileoverview Queue System Demo
 * Demonstrates usage of Task Queue, Scheduler, Executor, Dead Letter Queue, and Monitor.
 * @example node examples/queue-demo.js
 */

import {
  TaskQueue,
  Priority,
  TaskStatus,
  Scheduler,
  ScheduleStatus,
  Executor,
  ExecutionMode,
  DeadLetterQueue,
  FailedTaskStatus,
  QueueMonitor,
  AlertSeverity,
  MetricType
} from '../src/queue/index.js';

const logger = console;

// ============================================
// Demo 1: Priority Task Queue
// ============================================
async function demoTaskQueue() {
  logger.log('\n========================================');
  logger.log('DEMO 1: Priority Task Queue');
  logger.log('========================================\n');

  const queue = new TaskQueue({ emitEvents: true });

  // Listen to events
  queue.on('task:enqueued', (task) => {
    logger.log(`📥 Task enqueued: ${task.id} (priority: ${task.priority})`);
  });

  queue.on('task:started', (task) => {
    logger.log(`▶️  Task started: ${task.id}`);
  });

  // Enqueue tasks with different priorities
  queue.enqueue(
    { 
      id: 'task-bg', 
      execute: async () => { 
        logger.log('   Processing background task...'); 
        return 'bg-done'; 
      } 
    },
    Priority.BACKGROUND,
    { type: 'cleanup' },
    { description: 'Background cleanup' },
    'maintenance'
  );

  queue.enqueue(
    { 
      id: 'task-normal', 
      execute: async () => { 
        logger.log('   Processing normal task...'); 
        return 'normal-done'; 
      } 
    },
    Priority.NORMAL,
    { type: 'process' },
    { description: 'Normal processing' },
    'processing'
  );

  queue.enqueue(
    { 
      id: 'task-high', 
      execute: async () => { 
        logger.log('   Processing high priority task...'); 
        return 'high-done'; 
      } 
    },
    Priority.HIGH,
    { type: 'urgent' },
    { description: 'High priority' },
    'urgent'
  );

  queue.enqueue(
    { 
      id: 'task-critical', 
      execute: async () => { 
        logger.log('   Processing CRITICAL task...'); 
        return 'critical-done'; 
      } 
    },
    Priority.CRITICAL,
    { type: 'alert' },
    { description: 'Critical alert' },
    'alerts'
  );

  logger.log(`\nQueue size: ${queue.size()}`);
  logger.log(`Tasks by tag 'urgent': ${queue.getByTag('urgent').length}`);

  // Dequeue and execute tasks (should come out in priority order)
  logger.log('\n--- Dequeueing tasks (priority order) ---');
  while (!queue.isEmpty()) {
    const task = queue.dequeue();
    if (task) {
      await task.execute();
      queue.updateStatus(task.id, TaskStatus.COMPLETED);
    }
  }

  logger.log(`\nQueue stats: ${JSON.stringify(queue.getStats(), null, 2)}`);
}

// ============================================
// Demo 2: Scheduler
// ============================================
async function demoScheduler() {
  logger.log('\n========================================');
  logger.log('DEMO 2: Scheduler');
  logger.log('========================================\n');

  const scheduler = new Scheduler({ emitEvents: true });

  scheduler.on('task:scheduled', (task) => {
    logger.log(`📅 Task scheduled: ${task.id} (type: ${task.type})`);
  });

  scheduler.on('task:executing', (task) => {
    logger.log(`🔄 Task executing: ${task.id}`);
  });

  scheduler.on('task:completed', (task) => {
    logger.log(`✅ Task completed: ${task.id}`);
  });

  // Schedule a delayed task
  const delayedTask = scheduler.scheduleAfter(
    {
      id: 'delayed-1',
      execute: async (data) => {
        logger.log(`   Delayed task executed with data: ${JSON.stringify(data)}`);
        return 'delayed-result';
      }
    },
    500, // 500ms delay
    {
      data: { message: 'Hello from delayed task' },
      maxRetries: 2
    }
  );

  // Schedule a one-time task for the future
  const futureTime = new Date(Date.now() + 1000);
  const scheduledTask = scheduler.schedule(
    {
      id: 'scheduled-1',
      execute: async (data) => {
        logger.log(`   Scheduled task executed`);
        return 'scheduled-result';
      }
    },
    futureTime,
    { data: { future: true } }
  );

  // Schedule with dependencies
  const depTask1 = scheduler.scheduleAfter(
    { id: 'dep-1', execute: async () => { logger.log('   Dep 1 done'); return 'dep1'; } },
    100
  );

  const depTask2 = scheduler.scheduleAfter(
    { id: 'dep-2', execute: async () => { logger.log('   Dep 2 done'); return 'dep2'; } },
    100
  );

  const depTask3 = scheduler.scheduleWithDeps(
    {
      id: 'dep-3',
      execute: async (data) => {
        logger.log(`   Dependency task executed after deps satisfied`);
        return 'dep3';
      }
    },
    ['dep-1', 'dep-2'],
    { data: { dependent: true } }
  );

  logger.log(`\nScheduled tasks: ${scheduler.list().length}`);
  logger.log(`Stats: ${JSON.stringify(scheduler.getStats(), null, 2)}`);

  // Wait for tasks to complete
  await new Promise(resolve => setTimeout(resolve, 1500));

  logger.log(`\nFinal stats: ${JSON.stringify(scheduler.getStats(), null, 2)}`);

  scheduler.cancelAll();
}

// ============================================
// Demo 3: Executor
// ============================================
async function demoExecutor() {
  logger.log('\n========================================');
  logger.log('DEMO 3: Executor');
  logger.log('========================================\n');

  const executor = new Executor({ emitEvents: true });

  executor.on('execution:start', (data) => {
    logger.log(`🚀 Execution started: ${data.mode} (${data.taskCount} tasks)`);
  });

  executor.on('execution:complete', (result) => {
    logger.log(`✅ Execution complete: ${result.stats.completed}/${result.stats.total} (${result.stats.successRate})`);
  });

  // Parallel execution
  const parallelTasks = [
    { id: 'p1', execute: async () => { await sleep(100); return 'p1-done'; } },
    { id: 'p2', execute: async () => { await sleep(50); return 'p2-done'; } },
    { id: 'p3', execute: async () => { await sleep(150); return 'p3-done'; } }
  ];

  logger.log('--- Parallel Execution ---');
  const parallelResult = await executor.parallel(parallelTasks, {
    concurrency: 2,
    onProgress: (completed, total) => {
      logger.log(`   Progress: ${completed}/${total}`);
    }
  });
  logger.log(`Result: ${JSON.stringify(parallelResult.stats, null, 2)}`);

  // Sequential execution
  const sequentialTasks = [
    { id: 's1', execute: async () => { logger.log('   Step 1'); return 's1'; } },
    { id: 's2', execute: async () => { logger.log('   Step 2'); return 's2'; } },
    { id: 's3', execute: async () => { logger.log('   Step 3'); return 's3'; } }
  ];

  logger.log('\n--- Sequential Execution ---');
  const sequentialResult = await executor.sequential(sequentialTasks);
  logger.log(`Result: ${JSON.stringify(sequentialResult.stats, null, 2)}`);

  // Batched execution
  const batchTasks = Array.from({ length: 10 }, (_, i) => ({
    id: `b${i}`,
    execute: async () => { return `batch-${i}`; }
  }));

  logger.log('\n--- Batched Execution (batch size: 3) ---');
  const batchResult = await executor.batched(batchTasks, {
    batchSize: 3,
    onProgress: (completed, total) => {
      if (completed % 3 === 0 || completed === total) {
        logger.log(`   Progress: ${completed}/${total}`);
      }
    }
  });
  logger.log(`Result: ${JSON.stringify(batchResult.stats, null, 2)}`);

  // Execution with retry
  let attempts = 0;
  const retryTask = {
    id: 'retry-task',
    execute: async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error(`Attempt ${attempts} failed`);
      }
      return 'success after retries';
    }
  };

  logger.log('\n--- Retry Logic (max 3 retries) ---');
  const retryResult = await executor.run(retryTask, { maxRetries: 3, retryDelay: 100 });
  logger.log(`Result: ${JSON.stringify({ 
    success: retryResult.success, 
    attempts: retryResult.attempts,
    data: retryResult.data 
  }, null, 2)}`);
}

// ============================================
// Demo 4: Dead Letter Queue
// ============================================
async function demoDeadLetterQueue() {
  logger.log('\n========================================');
  logger.log('DEMO 4: Dead Letter Queue');
  logger.log('========================================\n');

  const dlq = new DeadLetterQueue({ emitEvents: true, autoArchive: false });

  dlq.on('task:failed', (task) => {
    logger.log(`📥 Failed task added to DLQ: ${task.id}`);
  });

  dlq.on('task:recovered', ({ task, result }) => {
    logger.log(`✅ Task recovered: ${task.id}, result: ${result}`);
  });

  // Add some failed tasks
  const failedTasks = [
    {
      id: 'task-1',
      execute: async () => 'recovered-1',
      data: { type: 'test' },
      metadata: { priority: 1 }
    },
    {
      id: 'task-2',
      execute: async () => { throw new Error('Still failing'); },
      data: { type: 'test' },
      metadata: { priority: 2 }
    },
    {
      id: 'task-3',
      execute: async () => 'recovered-3',
      data: { type: 'test' },
      metadata: { priority: 3 }
    }
  ];

  failedTasks.forEach((task, i) => {
    dlq.add(task, new Error(`Error ${i + 1}`), {
      attempts: 3,
      queue: 'main-queue',
      worker: 'worker-1'
    });
  });

  logger.log(`\nDLQ size: ${dlq.count()}`);
  logger.log(`Stats: ${JSON.stringify(dlq.getStats(), null, 2)}`);

  // List failed tasks
  logger.log('\n--- Failed Tasks ---');
  const failed = dlq.list();
  failed.forEach(task => {
    logger.log(`  - ${task.id} (original: ${task.originalId}): ${task.error}`);
  });

  // Retry a task
  logger.log('\n--- Retry First Task ---');
  const retryResult = await dlq.retry(failed[0].id);
  logger.log(`Retry result: ${JSON.stringify({ 
    success: retryResult.success, 
    result: retryResult.result 
  }, null, 2)}`);

  // Retry all remaining
  logger.log('\n--- Retry All Remaining ---');
  const retryAllResult = await dlq.retryAll();
  logger.log(`Retry all result: ${JSON.stringify(retryAllResult, null, 2)}`);

  logger.log(`\nFinal DLQ stats: ${JSON.stringify(dlq.getStats(), null, 2)}`);

  dlq.stop();
}

// ============================================
// Demo 5: Monitor
// ============================================
async function demoMonitor() {
  logger.log('\n========================================');
  logger.log('DEMO 5: Queue Monitor');
  logger.log('========================================\n');

  const monitor = new QueueMonitor({ 
    emitEvents: true, 
    autoSnapshot: false 
  });

  monitor.on('alert', (alert) => {
    logger.log(`🚨 ALERT: ${alert.name} (${alert.severity}): ${alert.message}`);
  });

  // Add alert rules
  monitor.addAlertRule({
    id: 'high-error-rate',
    name: 'High Error Rate',
    metric: 'queue.main.failed',
    operator: 'gt',
    threshold: 5,
    severity: AlertSeverity.ERROR,
    message: 'Error rate is high: {{value}} errors (threshold: {{threshold}})'
  });

  monitor.addAlertRule({
    id: 'queue-full',
    name: 'Queue Size Critical',
    metric: 'queue.main.size',
    operator: 'gt',
    threshold: 100,
    severity: AlertSeverity.CRITICAL,
    message: 'Queue is nearly full: {{value}} items'
  });

  // Record some metrics
  logger.log('--- Recording Metrics ---');
  monitor.increment('queue.main.enqueued', 50);
  monitor.increment('queue.main.completed', 45);
  monitor.increment('queue.main.failed', 8); // Should trigger alert
  monitor.gauge('queue.main.size', 45);
  monitor.recordDuration('queue.main.duration', 150);

  logger.log(`Counter 'queue.main.failed': ${monitor.getMetric('queue.main.failed')}`);

  // Evaluate rules
  logger.log('\n--- Evaluating Alert Rules ---');
  const alerts = monitor.evaluateRules();
  logger.log(`Triggered ${alerts.length} alert(s)`);

  // Show active alerts
  const activeAlerts = monitor.getActiveAlerts();
  logger.log(`Active alerts: ${activeAlerts.length}`);
  activeAlerts.forEach(alert => {
    logger.log(`  - [${alert.severity.toUpperCase()}] ${alert.message}`);
  });

  // Take snapshot
  logger.log('\n--- Health Status ---');
  const health = monitor.getHealth();
  logger.log(`Health: ${JSON.stringify(health, null, 2)}`);

  // Dashboard data
  logger.log('\n--- Dashboard Data ---');
  const dashboard = monitor.getDashboardData();
  logger.log(`Health: ${dashboard.health.status}`);
  logger.log(`Top metrics: ${JSON.stringify(dashboard.topMetrics, null, 2)}`);

  logger.log(`\nMonitor stats: ${JSON.stringify(monitor.getStats(), null, 2)}`);

  monitor.stop();
}

// ============================================
// Demo 6: Integration
// ============================================
async function demoIntegration() {
  logger.log('\n========================================');
  logger.log('DEMO 6: Full Integration');
  logger.log('========================================\n');

  // Create all components
  const queue = new TaskQueue();
  const scheduler = new Scheduler();
  const executor = new Executor();
  const dlq = new DeadLetterQueue();
  const monitor = new QueueMonitor({ autoSnapshot: true, snapshotInterval: 5000 });

  // Register components with monitor
  monitor.registerComponent('queue', queue);
  monitor.registerComponent('scheduler', scheduler);
  monitor.registerComponent('executor', executor);
  monitor.registerComponent('dlq', dlq);

  // Add alert rule
  monitor.addAlertRule({
    name: 'High Failure Rate',
    metric: 'queue.queue.failed',
    operator: 'gt',
    threshold: 2,
    severity: AlertSeverity.WARNING
  });

  // Simulate workflow
  logger.log('--- Simulating Workflow ---');

  // 1. Enqueue some tasks
  for (let i = 0; i < 5; i++) {
    queue.enqueue(
      {
        id: `workflow-task-${i}`,
        execute: async () => {
          if (i === 2) throw new Error('Simulated failure');
          return `result-${i}`;
        }
      },
      i === 0 ? Priority.CRITICAL : Priority.NORMAL
    );
  }

  // 2. Execute tasks
  const tasksToExecute = [];
  while (!queue.isEmpty()) {
    const task = queue.dequeue();
    if (task) tasksToExecute.push(task);
  }

  const results = await executor.allSettled(tasksToExecute, {
    maxRetries: 1,
    onTaskError: (result) => {
      // 3. Add to DLQ on failure
      const failedTask = tasksToExecute.find(t => t.id === result.taskId);
      if (failedTask) {
        dlq.add(failedTask, result.error, { 
          attempts: result.attempts,
          queue: 'main'
        });
      }
    }
  });

  logger.log(`Execution results: ${results.stats.completed} completed, ${results.stats.failed} failed`);
  logger.log(`DLQ size: ${dlq.count()}`);

  // 4. Show monitor snapshot
  await new Promise(resolve => setTimeout(resolve, 100));
  const snapshot = monitor.takeSnapshot();
  logger.log(`\nSnapshot components: ${Object.keys(snapshot.components).join(', ')}`);

  // 5. Check for alerts
  const alerts = monitor.evaluateRules();
  if (alerts.length > 0) {
    logger.log(`\nAlerts triggered: ${alerts.length}`);
  }

  // Cleanup
  monitor.stop();
  dlq.stop();

  logger.log('\n✅ Integration demo complete!');
}

// Utility function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run all demos
async function main() {
  logger.log('\n');
  logger.log('╔══════════════════════════════════════════════════════════╗');
  logger.log('║       COGNIMESH TASK QUEUE SYSTEM DEMO                   ║');
  logger.log('╚══════════════════════════════════════════════════════════╝');

  try {
    await demoTaskQueue();
    await demoScheduler();
    await demoExecutor();
    await demoDeadLetterQueue();
    await demoMonitor();
    await demoIntegration();

    logger.log('\n========================================');
    logger.log('ALL DEMOS COMPLETED SUCCESSFULLY!');
    logger.log('========================================\n');
  } catch (error) {
    logger.error('Demo failed:', error);
    process.exit(1);
  }
}

main();
