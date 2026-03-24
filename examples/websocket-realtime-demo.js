#!/usr/bin/env node
/**
 * @fileoverview WebSocket Real-Time Features Demo
 * 
 * This demo showcases all the real-time collaboration features:
 * - Room subscriptions
 * - Presence tracking
 * - Typing indicators
 * - Live cursor tracking
 * - Message history
 * - Activity feed
 * - Notifications
 * - Real-time annotations
 * - Task collaboration
 * - Reconnection with session recovery
 */

import { createServer } from 'http';
import { 
  createWebSocketServer, 
  createWebSocketClient,
  MockRedisAdapter 
} from '../src/websocket/index.js';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, label, message) {
  console.log(`${color}[${label}]${colors.reset} ${message}`);
}

async function runDemo() {
  console.log('\n' + colors.bright + '='.repeat(60));
  console.log('  WebSocket Real-Time Features Demo');
  console.log('='.repeat(60) + colors.reset + '\n');

  // ==========================================
  // Setup Server
  // ==========================================
  log(colors.cyan, 'SERVER', 'Creating HTTP server...');
  const httpServer = createServer();
  
  // Create Redis adapter (using mock for demo)
  log(colors.cyan, 'SERVER', 'Setting up Redis adapter...');
  const redisAdapter = new MockRedisAdapter();
  await redisAdapter.connect();

  // Create WebSocket server
  log(colors.cyan, 'SERVER', 'Creating WebSocket server with features...');
  const wss = createWebSocketServer(httpServer, {
    authenticate: false, // Disable auth for demo
    enablePresence: true,
    enableHistory: true,
    enableTyping: true,
    enableCursors: true,
    enableActivityFeed: true,
    enableNotifications: true,
    messageHistoryLimit: 100,
    messagePersistenceAdapter: redisAdapter,
    presenceAdapter: redisAdapter,
  });

  // Server event handlers
  wss.on('connection', (socket) => {
    log(colors.green, 'EVENT', `Client connected: ${socket.id.slice(0, 8)}...`);
  });

  wss.on('disconnect', (socket, code) => {
    log(colors.yellow, 'EVENT', `Client disconnected: ${socket.id.slice(0, 8)}... (code: ${code})`);
  });

  wss.on('subscribe', (socket, room) => {
    log(colors.blue, 'ROOM', `User subscribed to "${room}"`);
  });

  wss.on('activity', (activity) => {
    log(colors.dim, 'ACTIVITY', `${activity.type} by ${activity.userId}`);
  });

  // Start server
  await wss.start();
  await new Promise((resolve) => {
    httpServer.listen(3456, resolve);
  });
  
  log(colors.green, 'SERVER', 'Running on ws://localhost:3456\n');

  // ==========================================
  // Demo: Client 1 - Alice
  // ==========================================
  log(colors.magenta, 'CLIENT', 'Creating Alice...');
  const alice = createWebSocketClient({
    url: 'ws://localhost:3456',
    autoConnect: true,
    auth: {
      userId: 'user-alice',
      userName: 'Alice',
    },
    debug: false,
  });

  // ==========================================
  // Demo: Client 2 - Bob
  // ==========================================
  log(colors.magenta, 'CLIENT', 'Creating Bob...');
  const bob = createWebSocketClient({
    url: 'ws://localhost:3456',
    autoConnect: true,
    auth: {
      userId: 'user-bob',
      userName: 'Bob',
    },
    debug: false,
  });

  // Wait for connections
  await Promise.all([
    new Promise((resolve) => alice.on('connect', resolve)),
    new Promise((resolve) => bob.on('connect', resolve)),
  ]);
  log(colors.green, 'DEMO', 'Both clients connected!\n');

  // ==========================================
  // Feature 1: Room Subscription
  // ==========================================
  console.log(colors.bright + '--- Feature 1: Room Subscription ---' + colors.reset);
  
  await new Promise((resolve) => {
    let subscribed = 0;
    const checkDone = () => {
      subscribed++;
      if (subscribed === 2) resolve();
    };

    alice.on('subscribed', (room, data) => {
      log(colors.blue, 'ALICE', `Joined "${room}" with ${data.members.length} members`);
      checkDone();
    });

    bob.on('subscribed', (room, data) => {
      log(colors.blue, 'BOB', `Joined "${room}" with ${data.members.length} members`);
      checkDone();
    });

    alice.subscribe('project-alpha', { status: 'online', role: 'developer' });
    bob.subscribe('project-alpha', { status: 'online', role: 'designer' });
  });

  // Bob sees Alice join
  await new Promise((resolve) => {
    bob.on('user', (message) => {
      if (message.type === 'user:joined') {
        log(colors.blue, 'BOB', `Sees ${message.user.name} joined the room`);
        resolve();
      }
    });
  });

  // ==========================================
  // Feature 2: Presence Tracking
  // ==========================================
  console.log('\n' + colors.bright + '--- Feature 2: Presence Tracking ---' + colors.reset);
  
  await new Promise((resolve) => {
    bob.on('presence', (message) => {
      if (message.type === 'presence:updated') {
        log(colors.cyan, 'BOB', `Sees Alice is now ${message.user.status}`);
        resolve();
      }
    });

    alice.updatePresence('project-alpha', 'busy', { currentTask: 'coding' });
  });

  // ==========================================
  // Feature 3: Typing Indicators
  // ==========================================
  console.log('\n' + colors.bright + '--- Feature 3: Typing Indicators ---' + colors.reset);
  
  await new Promise((resolve) => {
    bob.on('typing', (message) => {
      if (message.type === 'typing:started') {
        log(colors.yellow, 'BOB', `Sees ${message.userName} is typing...`);
        resolve();
      }
    });

    alice.startTyping('project-alpha', { field: 'comment-box' });
  });

  // ==========================================
  // Feature 4: Message Broadcasting
  // ==========================================
  console.log('\n' + colors.bright + '--- Feature 4: Message Broadcasting ---' + colors.reset);
  
  await new Promise((resolve) => {
    bob.on('message', (message) => {
      if (message.text) {
        log(colors.green, 'BOB', `Received: "${message.text}" from ${message.senderName}`);
        resolve();
      }
    });

    alice.broadcastToRoom('project-alpha', { 
      type: 'chat:message',
      text: 'Hey Bob, how is the design coming along?' 
    });
  });

  // ==========================================
  // Feature 5: Message History
  // ==========================================
  console.log('\n' + colors.bright + '--- Feature 5: Message History ---' + colors.reset);
  
  await new Promise((resolve) => {
    bob.on('history', (room, messages) => {
      log(colors.dim, 'BOB', `Retrieved ${messages.length} messages from history`);
      messages.slice(-2).forEach((msg) => {
        if (msg.text) {
          log(colors.dim, 'HISTORY', `${msg.senderName}: ${msg.text}`);
        }
      });
      resolve();
    });

    bob.getHistory('project-alpha', { limit: 10 });
  });

  // ==========================================
  // Feature 6: Activity Feed
  // ==========================================
  console.log('\n' + colors.bright + '--- Feature 6: Activity Feed ---' + colors.reset);
  
  await new Promise((resolve) => {
    alice.on('activity', (activities) => {
      log(colors.dim, 'ALICE', `Activity feed has ${activities.length} events`);
      activities.slice(-3).forEach((activity) => {
        log(colors.dim, 'ACTIVITY', `${activity.type} - ${activity.userId}`);
      });
      resolve();
    });

    alice.getActivityFeed({ limit: 10 });
  });

  // ==========================================
  // Feature 7: Notifications
  // ==========================================
  console.log('\n' + colors.bright + '--- Feature 7: Notifications ---' + colors.reset);
  
  await new Promise((resolve) => {
    alice.on('notification', (message) => {
      if (message.type === 'notification:new') {
        log(colors.magenta, 'ALICE', `Notification: ${message.notification.title}`);
        log(colors.magenta, 'ALICE', `  ${message.notification.message}`);
        resolve();
      }
    });

    // Server sends notification to Alice
    wss.sendNotification('user-alice', {
      type: 'system:alert',
      title: 'Welcome!',
      message: 'Thanks for joining the demo',
    });
  });

  // ==========================================
  // Feature 8: Real-time Annotations
  // ==========================================
  console.log('\n' + colors.bright + '--- Feature 8: Real-time Annotations ---' + colors.reset);
  
  await new Promise((resolve) => {
    let created = false;
    bob.on('annotation', (message) => {
      if (message.type === 'annotation:created' && !created) {
        created = true;
        log(colors.cyan, 'BOB', `Sees annotation: "${message.annotation.content}"`);
        resolve();
      }
    });

    alice.createAnnotation('project-alpha', {
      document: 'design-specs',
      x: 150,
      y: 200,
      content: 'This section needs more detail',
      type: 'comment',
    });
  });

  // ==========================================
  // Feature 9: Task Collaboration
  // ==========================================
  console.log('\n' + colors.bright + '--- Feature 9: Task Collaboration ---' + colors.reset);
  
  await new Promise((resolve) => {
    let subscribed = false;
    
    bob.on('task', (message) => {
      if (message.type === 'task:subscribed') {
        subscribed = true;
        log(colors.blue, 'BOB', `Subscribed to task ${message.taskId}`);
        
        // Alice updates the task
        alice.updateTask('task-123', { status: 'in_progress', progress: 50 });
      }
      
      if (message.type === 'task:updated' && subscribed) {
        log(colors.green, 'BOB', `Task updated: ${JSON.stringify(message.changes)}`);
        
        // Alice adds a comment
        alice.commentOnTask('task-123', 'Working on the implementation');
      }
      
      if (message.type === 'task:comment' && subscribed) {
        log(colors.yellow, 'BOB', `New comment: "${message.comment.text}"`);
        resolve();
      }
    });

    alice.subscribeToTask('task-123');
    bob.subscribeToTask('task-123');
  });

  // ==========================================
  // Feature 10: Reconnection with Session Recovery
  // ==========================================
  console.log('\n' + colors.bright + '--- Feature 10: Reconnection with Recovery ---' + colors.reset);
  
  // Track last event ID
  let lastEventId = null;
  alice.on('message', (message) => {
    if (message.eventId) {
      lastEventId = message.eventId;
    }
  });

  // Send a message to have something in history
  alice.broadcastToRoom('project-alpha', { 
    type: 'chat:message',
    text: 'Before disconnect' 
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Simulate disconnect
  log(colors.yellow, 'DEMO', 'Simulating Alice disconnect...');
  alice.disconnect();

  await new Promise((resolve) => setTimeout(resolve, 500));

  // Reconnect with recovery
  log(colors.yellow, 'DEMO', 'Alice reconnecting with session recovery...');
  
  await new Promise((resolve) => {
    alice.on('reconnected', (data) => {
      log(colors.green, 'ALICE', `Reconnected! Recovered ${data.missedMessages?.length || 0} missed messages`);
      log(colors.green, 'ALICE', `Re-joined rooms: ${data.reconnectedRooms.join(', ')}`);
      resolve();
    });

    alice.connect();
    alice.on('connect', () => {
      alice.reconnect({ lastEventId });
    });
  });

  // ==========================================
  // Cleanup
  // ==========================================
  console.log('\n' + colors.bright + '--- Cleanup ---' + colors.reset);
  
  log(colors.dim, 'SERVER', 'Getting final stats...');
  const stats = wss.getStats();
  console.log(colors.dim + 'Stats:' + colors.reset, JSON.stringify(stats, null, 2));

  log(colors.dim, 'DEMO', 'Cleaning up...');
  alice.destroy();
  bob.destroy();
  
  await wss.stop();
  await redisAdapter.disconnect();
  httpServer.close();

  console.log('\n' + colors.bright + colors.green + 'Demo completed successfully!' + colors.reset + '\n');
}

// Run demo
runDemo().catch((error) => {
  console.error(colors.red + 'Demo failed:' + colors.reset, error);
  process.exit(1);
});
