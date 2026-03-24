/**
 * Simple test for MCP tools
 */

import { registry, initializeRegistry } from '../src/tools/index.js';

console.log('=== MCP Tools Simple Test ===\n');

// Initialize registry
registry.initialize();
console.log('Registry initialized:', registry.isInitialized);
console.log('Total tools:', registry.count);

// Test system_health
console.log('\n--- Testing system_health ---');
const healthResult = await registry.execute('system_health', { detailed: false });
console.log('Success:', healthResult.success);
console.log('Data:', JSON.stringify(healthResult.data, null, 2)?.slice(0, 500));

// Test task_create
console.log('\n--- Testing task_create ---');
const createResult = await registry.execute('task_create', {
  title: 'Test Task',
  description: 'Test Description'
});
console.log('Success:', createResult.success);
console.log('Errors:', createResult.errors);
console.log('Data:', JSON.stringify(createResult.data, null, 2)?.slice(0, 500));

// Test task_list
console.log('\n--- Testing task_list ---');
const listResult = await registry.execute('task_list', { page: 1, pageSize: 10 });
console.log('Success:', listResult.success);
console.log('Errors:', listResult.errors);
console.log('Data keys:', Object.keys(listResult.data || {}));

// Test roadmap_create
console.log('\n--- Testing roadmap_create ---');
const roadmapResult = await registry.execute('roadmap_create', {
  title: 'Test Roadmap',
  description: 'Test Description'
});
console.log('Success:', roadmapResult.success);
console.log('Errors:', roadmapResult.errors);
console.log('Data:', JSON.stringify(roadmapResult.data, null, 2)?.slice(0, 500));

console.log('\n=== Test Complete ===');
