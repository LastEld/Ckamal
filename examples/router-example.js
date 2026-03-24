/**
 * @fileoverview Example usage of the Multi-Model Router and Orchestrator
 * @description Demonstrates routing, orchestration, context sharing, fallback, and caching
 */

import {
  RouterSystem,
  ModelRouter,
  Orchestrator,
  ContextManager,
  FallbackSystem,
  SemanticCache,
  ORCHESTRATION_MODES,
  RouterConfig
} from '../src/router/index.js';

/**
 * Example 1: Basic Router Usage
 */
async function basicRoutingExample() {
  console.log('=== Basic Routing Example ===\n');
  
  const router = new ModelRouter();
  await router.initialize();
  
  // Simple task
  const simpleTask = {
    id: 'task-1',
    type: 'code',
    content: 'Write a function to calculate fibonacci numbers'
  };
  
  const route = await router.routeTask(simpleTask);
  console.log('Task routed to:', route.modelId);
  console.log('Quality Score:', route.scores.quality.toFixed(2));
  console.log('Cost Score:', route.scores.cost.toFixed(2));
  console.log('Latency Score:', route.scores.latency.toFixed(2));
  console.log('Load Score:', route.scores.load.toFixed(2));
  console.log('Estimated Cost: $', route.estimatedCost.toFixed(4));
  console.log('Estimated Latency:', route.estimatedLatency.toFixed(0), 'ms');
  console.log('Complexity:', route.complexity);
  console.log('Confidence:', (route.confidence * 100).toFixed(0), '%\n');
  
  await router.shutdown();
}

/**
 * Example 2: Complexity Analysis
 */
async function complexityAnalysisExample() {
  console.log('=== Complexity Analysis Example ===\n');
  
  const router = new ModelRouter();
  await router.initialize();
  
  const tasks = [
    {
      id: 'simple',
      type: 'simple',
      content: 'Say hello'
    },
    {
      id: 'moderate',
      type: 'code',
      content: 'Create a function to filter an array based on a predicate'
    },
    {
      id: 'complex',
      type: 'architecture',
      content: 'Design a distributed system with microservices, event-driven architecture, and CQRS pattern for an e-commerce platform'
    }
  ];
  
  for (const task of tasks) {
    const complexity = router.analyzeTaskComplexity(task);
    console.log(`Task: ${task.type}`);
    console.log(`  Complexity Score: ${complexity.score}/10`);
    console.log(`  Level: ${complexity.level}`);
    console.log(`  Factors: ${complexity.factors.join(', ')}\n`);
  }
  
  await router.shutdown();
}

/**
 * Example 3: Orchestration Modes
 */
async function orchestrationExample() {
  console.log('=== Orchestration Example ===\n');
  
  const orchestrator = new Orchestrator();
  await orchestrator.initialize();
  
  // Mock execution for demo
  orchestrator.router.executeOnModel = async (task, route) => ({
    success: true,
    result: `Executed on ${route.modelId}`,
    modelId: route.modelId
  });
  
  // Single execution
  console.log('SINGLE Mode:');
  const singleResult = await orchestrator.executeSingle({
    id: 'single-task',
    payload: { type: 'code', content: 'Hello' }
  });
  console.log(`  Status: ${singleResult.status}`);
  console.log(`  Duration: ${singleResult.duration}ms\n`);
  
  // Parallel execution
  console.log('PARALLEL Mode:');
  const parallelResult = await orchestrator.executeParallel([
    { id: 'p1', payload: { type: 'code', content: 'Task 1' } },
    { id: 'p2', payload: { type: 'code', content: 'Task 2' } },
    { id: 'p3', payload: { type: 'code', content: 'Task 3' } }
  ], { concurrency: 2 });
  console.log(`  Status: ${parallelResult.status}`);
  console.log(`  Results: ${parallelResult.results.length}\n`);
  
  // Chain execution
  console.log('CHAINED Mode:');
  const chainResult = await orchestrator.executeChain([
    { id: 'c1', payload: { type: 'code', content: 'Step 1' } },
    { id: 'c2', payload: { type: 'code', content: 'Step 2' } },
    { id: 'c3', payload: { type: 'code', content: 'Step 3' } }
  ]);
  console.log(`  Status: ${chainResult.status}`);
  console.log(`  Completed: ${chainResult.completedSteps}/${chainResult.totalSteps}\n`);
  
  // Swarm execution
  console.log('SWARM Mode:');
  const swarmResult = await orchestrator.executeSwarm(
    { id: 'swarm-task', payload: { type: 'analysis', content: 'Analyze code' } },
    { count: 3, strategy: 'majority' }
  );
  console.log(`  Status: ${swarmResult.status}`);
  console.log(`  Total Agents: ${swarmResult.swarmStats.totalAgents}`);
  console.log(`  Successful: ${swarmResult.swarmStats.successfulAgents}\n`);
  
  await orchestrator.shutdown();
}

/**
 * Example 4: Context Sharing
 */
async function contextSharingExample() {
  console.log('=== Context Sharing Example ===\n');
  
  const contextManager = new ContextManager();
  await contextManager.initialize();
  
  // Create initial context from Claude
  const claudeContext = contextManager.createContext(
    'session-123',
    {
      conversation: [
        { role: 'user', content: 'How do I implement authentication?' },
        { role: 'assistant', content: 'Here are the best practices for authentication...' }
      ],
      requirements: ['JWT', 'OAuth2', 'Session management']
    },
    { sourceModel: 'claude-sonnet-4-6' }
  );
  
  console.log('Original Context:');
  console.log(`  ID: ${claudeContext.id}`);
  console.log(`  Source: ${claudeContext.sourceModel}`);
  console.log(`  Messages: ${claudeContext.data.conversation.length}\n`);
  
  // Share context with GPT-4o
  const gptContext = contextManager.shareContext(
    claudeContext.id,
    'gpt-4o',
    { translationOptions: { format: 'openai' } }
  );
  
  console.log('Shared Context:');
  console.log(`  ID: ${gptContext.id}`);
  console.log(`  Translated from: ${gptContext.sourceModel}`);
  console.log(`  Target: ${gptContext.targetModel}`);
  console.log(`  Format: ${gptContext.data._format || 'original'}\n`);
  
  // Demonstrate context compaction
  const largeContext = contextManager.createContext(
    'session-large',
    {
      messages: Array.from({ length: 50 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`
      })),
      history: Array.from({ length: 100 }, (_, i) => ({ event: i }))
    }
  );
  
  console.log('Large Context:');
  console.log(`  Original Size: ${largeContext.size} bytes`);
  
  const compacted = contextManager.compactContext(largeContext.id, 'summary');
  console.log(`  Compacted Size: ${compacted.size} bytes`);
  console.log(`  Strategy: ${compacted.metadata.compactionStrategy}\n`);
  
  await contextManager.shutdown();
}

/**
 * Example 5: Fallback System
 */
async function fallbackExample() {
  console.log('=== Fallback System Example ===\n');
  
  const router = new ModelRouter();
  await router.initialize();
  
  const fallbackSystem = new FallbackSystem({ router });
  await fallbackSystem.initialize();
  
  // Show available fallback chains
  console.log('Available Fallback Chains:');
  const chains = fallbackSystem.listFallbackChains();
  for (const [name, models] of Object.entries(chains)) {
    console.log(`  ${name}: ${models.join(' -> ')}`);
  }
  console.log();
  
  // Mock execution to demonstrate fallback
  let attemptCount = 0;
  fallbackSystem.executeOnModel = async (task, modelId) => {
    attemptCount++;
    if (attemptCount === 1) {
      throw new Error('Primary model failed');
    }
    return { success: true, result: 'Success after fallback' };
  };
  
  console.log('Executing with fallback...');
  const task = { id: 'fallback-test', content: 'Important task' };
  
  try {
    const result = await fallbackSystem.executeWithFallback(task, {
      fallbackChain: 'standard'
    });
    
    console.log(`  Success: ${result.success}`);
    console.log(`  Final Model: ${result.finalModel || 'N/A'}`);
    console.log(`  Attempts: ${result.attempts}`);
    console.log(`  Attempt History:`);
    for (const attempt of result.attemptHistory) {
      console.log(`    - Level ${attempt.level}: ${attempt.modelId} (${attempt.success ? 'success' : 'failed'})`);
    }
  } catch (error) {
    console.log(`  All fallbacks exhausted: ${error.message}`);
  }
  console.log();
  
  await fallbackSystem.shutdown();
  await router.shutdown();
}

/**
 * Example 6: Semantic Caching
 */
async function cacheExample() {
  console.log('=== Semantic Caching Example ===\n');
  
  const cache = new SemanticCache();
  await cache.initialize();
  
  // Store a response
  const request1 = {
    content: 'Write a function to reverse a string in JavaScript'
  };
  const response1 = {
    code: 'function reverseString(str) { return str.split("").reverse().join(""); }',
    explanation: 'This splits the string into characters, reverses the array, and joins back.'
  };
  
  cache.set(request1, response1, { tags: ['javascript', 'string-manipulation'] });
  console.log('Cached response for: "Write a function to reverse a string in JavaScript"');
  
  // Retrieve exact match
  const cached1 = cache.get(request1);
  console.log(`  Exact match: ${cached1 ? 'Found' : 'Not found'}`);
  if (cached1) {
    console.log(`  Match type: ${cached1.matchType}\n`);
  }
  
  // Try semantic match
  const request2 = {
    content: 'How do I reverse a string using JavaScript?'
  };
  const cached2 = cache.get(request2);
  console.log('Similar request: "How do I reverse a string using JavaScript?"');
  console.log(`  Match: ${cached2 ? 'Found (semantic)' : 'Not found'}`);
  if (cached2) {
    console.log(`  Match type: ${cached2.matchType}\n`);
  }
  
  // Cache statistics
  const stats = cache.getStats();
  console.log('Cache Statistics:');
  console.log(`  Size: ${stats.size}/${stats.maxSize}`);
  console.log(`  Hits: ${stats.hits}`);
  console.log(`  Misses: ${stats.misses}`);
  console.log(`  Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`  Semantic Hits: ${stats.semanticHits}\n`);
  
  await cache.shutdown();
}

/**
 * Example 7: Complete Router System
 */
async function completeSystemExample() {
  console.log('=== Complete Router System Example ===\n');
  
  const system = new RouterSystem();
  await system.initialize();
  
  // Show registered models
  console.log('Registered Models:');
  const models = system.getModels();
  for (const model of models) {
    console.log(`  - ${model.name} (${model.provider})`);
    console.log(`    Quality: ${model.qualityScore}, Cost: $${model.costPer1kTokens}/1k tokens`);
  }
  console.log();
  
  // Route a task
  const task = {
    id: 'complex-task',
    type: 'architecture',
    content: 'Design a microservices architecture for a high-traffic e-commerce platform',
    priority: 9
  };
  
  const route = await system.route(task);
  console.log('Task Routed:');
  console.log(`  Model: ${route.modelId}`);
  console.log(`  Score: ${route.score.toFixed(3)}`);
  console.log(`  Confidence: ${(route.confidence * 100).toFixed(0)}%`);
  console.log(`  Complexity: ${route.complexity}\n`);
  
  // Create context for the session
  const context = system.createContext(
    'ecommerce-project',
    { project: 'E-Commerce Platform', requirements: ['scalability', 'high-availability'] },
    { sourceModel: route.modelId }
  );
  console.log(`Created context: ${context.id}\n`);
  
  // Show system statistics
  const stats = system.getStats();
  console.log('System Statistics:');
  console.log(`  Router - Total Routes: ${stats.router.totalRoutes}`);
  console.log(`  Cache - Hit Rate: ${(stats.cache.hitRate * 100).toFixed(1)}%`);
  console.log(`  Contexts - Active: ${stats.contextManager.contextsCount}\n`);
  
  await system.shutdown();
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     Multi-Model Router and Orchestrator Examples          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  try {
    await basicRoutingExample();
    await complexityAnalysisExample();
    await orchestrationExample();
    await contextSharingExample();
    await fallbackExample();
    await cacheExample();
    await completeSystemExample();
    
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              All examples completed successfully!          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  basicRoutingExample,
  complexityAnalysisExample,
  orchestrationExample,
  contextSharingExample,
  fallbackExample,
  cacheExample,
  completeSystemExample,
  runAllExamples
};
