#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Event Handling Example
 * 
 * This example demonstrates advanced event handling patterns:
 * 1. EventEmitter patterns
 * 2. Event propagation
 * 3. Event filtering
 * 4. Async event handlers
 * 5. Event bus architecture
 * 
 * @example
 *   node event-handling.js
 * 
 * @module examples/08-advanced/event-handling
 */

import { CogniMeshBIOS } from '../../src/bios/index.js';
import { EventEmitter } from 'events';

// ============================================================
// Event Handling Example
// ============================================================

console.log('[CogniMesh v5.0] Event Handling Example');
console.log('========================================\n');

// Custom EventBus implementation
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.channels = new Map();
    this.history = [];
    this.maxHistory = 100;
  }

  // Subscribe to a channel
  subscribe(channel, handler) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel).add(handler);
    
    return () => {
      this.channels.get(channel).delete(handler);
    };
  }

  // Publish to a channel
  publish(channel, data) {
    const subscribers = this.channels.get(channel);
    if (subscribers) {
      subscribers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in channel ${channel} handler:`, error);
        }
      });
    }
    
    this._addToHistory(channel, data);
  }

  // Get channel statistics
  getChannelStats(channel) {
    const subscribers = this.channels.get(channel);
    return {
      channel,
      subscribers: subscribers ? subscribers.size : 0,
      messages: this.history.filter(h => h.channel === channel).length
    };
  }

  // List all channels
  listChannels() {
    const stats = [];
    for (const [channel] of this.channels) {
      stats.push(this.getChannelStats(channel));
    }
    return stats;
  }

  _addToHistory(channel, data) {
    this.history.push({
      channel,
      data,
      timestamp: Date.now()
    });
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
}

// ============================================================
// Main execution
// ============================================================

async function main() {
  const bios = new CogniMeshBIOS();
  
  // Set up event tracking
  const eventHistory = [];
  
  // Track all BIOS events
  bios.on('bios:boot:start', (data) => {
    eventHistory.push({ event: 'bios:boot:start', data, time: Date.now() });
  });
  
  bios.on('bios:config:loaded', (data) => {
    eventHistory.push({ event: 'bios:config:loaded', data, time: Date.now() });
  });
  
  bios.on('bios:boot:complete', (data) => {
    eventHistory.push({ event: 'bios:boot:complete', data, time: Date.now() });
  });
  
  bios.on('bios:component:registered', (data) => {
    eventHistory.push({ event: 'bios:component:registered', data, time: Date.now() });
  });

  await bios.boot();
  console.log('✅ BIOS booted\n');

  try {
    // ============================================================
    // Part 1: Basic Event Handling
    // ============================================================
    
    console.log('--- Basic Event Handling ---\n');
    
    // Review BIOS events
    console.log('BIOS events emitted during boot:');
    eventHistory.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.event}`);
      console.log(`     Time: ${new Date(entry.time).toISOString()}`);
    });
    
    // Create custom event emitter
    const emitter = new EventEmitter();
    
    // Subscribe to events
    emitter.on('task:created', (task) => {
      console.log(`\n📢 Task created: ${task.id}`);
      console.log(`   Title: ${task.title}`);
      console.log(`   Priority: ${task.priority}`);
    });
    
    emitter.on('task:completed', (task) => {
      console.log(`\n📢 Task completed: ${task.id}`);
      console.log(`   Duration: ${task.duration}ms`);
    });
    
    // Emit events
    console.log('\nEmitting events...');
    
    emitter.emit('task:created', {
      id: 'task-1',
      title: 'Implement auth',
      priority: 'high'
    });
    
    emitter.emit('task:completed', {
      id: 'task-1',
      duration: 2500
    });
    
    // One-time listener
    emitter.once('system:shutdown', () => {
      console.log('\n📢 System shutdown (one-time listener)');
    });
    
    emitter.emit('system:shutdown');
    emitter.emit('system:shutdown'); // Won't trigger again

    // ============================================================
    // Part 2: Event Filtering
    // ============================================================
    
    console.log('\n--- Event Filtering ---\n');
    
    const allEvents = [
      { type: 'task:created', data: { id: 1 } },
      { type: 'task:updated', data: { id: 1 } },
      { type: 'system:alert', data: { severity: 'high' } },
      { type: 'task:completed', data: { id: 1 } },
      { type: 'system:critical', data: { error: 'Out of memory' } }
    ];
    
    // Filter by type prefix
    const systemEvents = allEvents.filter(e => e.type.startsWith('system:'));
    const taskEvents = allEvents.filter(e => e.type.startsWith('task:'));
    
    console.log('All events:', allEvents.length);
    console.log('System events:', systemEvents.length);
    systemEvents.forEach(e => console.log(`  - ${e.type}`));
    console.log('Task events:', taskEvents.length);
    taskEvents.forEach(e => console.log(`  - ${e.type}`));

    // ============================================================
    // Part 3: Async Event Handlers
    // ============================================================
    
    console.log('\n--- Async Event Handlers ---\n');
    
    const asyncEmitter = new EventEmitter();
    const asyncResults = [];
    
    // Async handler
    asyncEmitter.on('async:task', async (task) => {
      console.log(`  Starting async task: ${task.name}`);
      await sleep(task.duration);
      const result = { task: task.name, completed: true };
      asyncResults.push(result);
      console.log(`  Completed: ${task.name}`);
      return result;
    });
    
    // Emit multiple async tasks
    const asyncTasks = [
      { name: 'task-A', duration: 150 },
      { name: 'task-B', duration: 230 },
      { name: 'task-C', duration: 80 }
    ];
    
    console.log('Starting async tasks...');
    const startTime = Date.now();
    
    // Execute all tasks concurrently
    const promises = asyncTasks.map(task => {
      return new Promise((resolve) => {
        asyncEmitter.emit('async:task', task);
        // Give handlers time to complete
        setTimeout(resolve, task.duration + 50);
      });
    });
    
    await Promise.all(promises);
    
    const totalTime = Date.now() - startTime;
    console.log(`\nAll async handlers completed in ${totalTime}ms`);
    console.log(`Results: ${asyncResults.length}`);

    // ============================================================
    // Part 4: Event Bus Architecture
    // ============================================================
    
    console.log('\n--- Event Bus Architecture ---\n');
    
    const eventBus = new EventBus();
    
    // Subscribe to channels
    const unsubscribe1 = eventBus.subscribe('tasks', (data) => {
      console.log(`  [tasks] Received: ${data.action} ${data.taskId}`);
    });
    
    const unsubscribe2 = eventBus.subscribe('tasks', (data) => {
      console.log(`  [tasks] Logger: ${data.action} logged`);
    });
    
    eventBus.subscribe('notifications', (data) => {
      console.log(`  [notifications] ${data.message}`);
    });
    
    // Publish to channels
    console.log('Publishing to channels:');
    
    eventBus.publish('tasks', { action: 'create', taskId: 'task-1' });
    eventBus.publish('notifications', { message: 'New task assigned' });
    eventBus.publish('tasks', { action: 'complete', taskId: 'task-1' });
    
    // Channel statistics
    console.log('\nChannel statistics:');
    const channels = eventBus.listChannels();
    channels.forEach(channel => {
      console.log(`  ${channel.channel}:`);
      console.log(`    Subscribers: ${channel.subscribers}`);
      console.log(`    Messages: ${channel.messages}`);
    });
    
    // Unsubscribe
    console.log('\nUnsubscribing first handler from tasks...');
    unsubscribe1();
    
    console.log('Publishing after unsubscribe:');
    eventBus.publish('tasks', { action: 'update', taskId: 'task-2' });

    // ============================================================
    // Part 5: Event Propagation
    // ============================================================
    
    console.log('\n--- Event Propagation ---\n');
    
    // Parent-child relationship
    class Component extends EventEmitter {
      constructor(name) {
        super();
        this.name = name;
        this.children = [];
      }
      
      addChild(child) {
        this.children.push(child);
        
        // Bubble events from child to parent
        child.on('event', (data) => {
          console.log(`  [Bubble] ${child.name} → ${this.name}: ${data.type}`);
          this.emit('child:event', { source: child.name, ...data });
        });
      }
      
      emitEvent(type, data) {
        this.emit('event', { type, ...data });
      }
    }
    
    const parent = new Component('Parent');
    const child1 = new Component('Child1');
    const child2 = new Component('Child2');
    
    parent.addChild(child1);
    parent.addChild(child2);
    
    parent.on('child:event', (data) => {
      console.log(`  [Parent] Received from ${data.source}: ${data.type}`);
    });
    
    console.log('Emitting events from children:');
    child1.emitEvent('click', { x: 100, y: 200 });
    child2.emitEvent('scroll', { delta: 50 });

    // ============================================================
    // Part 6: Error Handling
    // ============================================================
    
    console.log('\n--- Error Handling ---\n');
    
    const errorEmitter = new EventEmitter();
    
    // Handler that throws
    errorEmitter.on('risky-operation', () => {
      throw new Error('Simulated failure');
    });
    
    // Error handler
    errorEmitter.on('error', (error) => {
      console.log(`  Error caught: ${error.message}`);
    });
    
    // Wrap in try-catch for sync emit
    try {
      errorEmitter.emit('risky-operation');
    } catch (error) {
      console.log(`  Caught sync error: ${error.message}`);
    }
    
    // Better pattern: error event
    const safeEmitter = new EventEmitter();
    
    safeEmitter.on('operation', (data) => {
      try {
        if (data.shouldFail) {
          throw new Error('Operation failed');
        }
        safeEmitter.emit('operation:success', data);
      } catch (error) {
        safeEmitter.emit('operation:error', { error, data });
      }
    });
    
    safeEmitter.on('operation:success', (data) => {
      console.log(`  Operation succeeded: ${data.id}`);
    });
    
    safeEmitter.on('operation:error', ({ error, data }) => {
      console.log(`  Operation failed: ${data.id} - ${error.message}`);
    });
    
    console.log('\nSafe event handling:');
    safeEmitter.emit('operation', { id: 'op-1', shouldFail: false });
    safeEmitter.emit('operation', { id: 'op-2', shouldFail: true });

    // ============================================================
    // Part 7: Event Namespacing
    // ============================================================
    
    console.log('\n--- Event Namespacing ---\n');
    
    const namespacedEmitter = new EventEmitter();
    
    // Namespace pattern: domain:action:entity
    const events = {
      TASKS: {
        CREATE: 'tasks:create',
        UPDATE: 'tasks:update',
        DELETE: 'tasks:delete',
        COMPLETE: 'tasks:complete'
      },
      USERS: {
        CREATE: 'users:create',
        UPDATE: 'users:update',
        LOGIN: 'users:login',
        LOGOUT: 'users:logout'
      },
      SYSTEM: {
        STARTUP: 'system:startup',
        SHUTDOWN: 'system:shutdown',
        ERROR: 'system:error'
      }
    };
    
    // Subscribe to all task events
    Object.values(events.TASKS).forEach(event => {
      namespacedEmitter.on(event, (data) => {
        console.log(`  [Tasks] ${event}: ${JSON.stringify(data)}`);
      });
    });
    
    console.log('Emitting namespaced events:');
    namespacedEmitter.emit(events.TASKS.CREATE, { id: 'task-1', title: 'New Task' });
    namespacedEmitter.emit(events.TASKS.COMPLETE, { id: 'task-1' });
    namespacedEmitter.emit(events.USERS.LOGIN, { id: 'user-1' }); // No handler

    // ============================================================
    // Part 8: BIOS Event Integration
    // ============================================================
    
    console.log('\n--- BIOS Event Integration ---\n');
    
    // Subscribe to BIOS system events
    bios.on('system:alert', (alert) => {
      console.log(`  [System Alert] ${alert.level}: ${alert.message}`);
    });
    
    bios.on('system:critical', (error) => {
      console.log(`  [System Critical] ${error.message}`);
    });
    
    // Simulate triggering system events
    console.log('Simulating system events:');
    bios.emit('system:alert', { 
      level: 'warning', 
      message: 'High memory usage',
      component: 'memory-monitor'
    });

    console.log('\n✅ Event handling example complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await bios.shutdown();
    console.log('\n✅ BIOS shutdown complete');
  }
}

// Helper function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();

// ============================================================
// Key Concepts Demonstrated:
// ============================================================
//
// 1. EventEmitter Patterns:
//    - on() for persistent listeners
//    - once() for one-time listeners
//    - emit() to trigger events
//    - off() to remove listeners
//
// 2. Event Bus:
//    - Channel-based messaging
//    - Subscribe/publish pattern
//    - Channel statistics
//
// 3. Event Filtering:
//    - Filter by type/prefix
//    - Pattern matching
//
// 4. Async Handlers:
//    - Concurrent execution
//    - Promise-based handling
//    - Error propagation
//
// 5. Event Propagation:
//    - Parent-child bubbling
//    - Event delegation
//
// 6. Error Handling:
//    - Try-catch for sync errors
//    - Error events for async
//    - Safe event patterns
//
// 7. Namespacing:
//    - Domain:action:entity pattern
//    - Grouped event constants
//    - Hierarchical organization
//
// ============================================================
