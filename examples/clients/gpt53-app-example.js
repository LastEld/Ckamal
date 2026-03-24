/**
 * GPT 5.3 Codex Application Client Example
 * 
 * This example demonstrates how to use the GPT 5.3 Codex App Client
 * for cost-effective, fast coding tasks.
 */

import { GPT53CodexAppClient } from '../../src/clients/codex/app.js';

async function main() {
  // Initialize the client
  const client = new GPT53CodexAppClient({
    apiKey: process.env.OPENAI_API_KEY,
    costEffective: true,  // Enable cost optimizations
    fallbackTo54: true,   // Enable fallback to GPT 5.4 for complex tasks
    timeout: 30000
  });

  console.log('Initializing GPT 5.3 Codex App Client...');
  
  try {
    await client.initialize();
    console.log('✓ Client initialized successfully\n');

    // Display capabilities
    const caps = client.getCapabilities();
    console.log('Client Capabilities:');
    console.log(`  Model: ${caps.model}`);
    console.log(`  Features: ${caps.features.join(', ')}`);
    console.log(`  Cost Optimized: ${caps.costOptimized}`);
    console.log(`  Response Time: ${caps.responseTime}\n`);

    // Example 1: Quick Completion
    console.log('--- Example 1: Quick Completion ---');
    const quickPrompt = 'Write a function to reverse a string in JavaScript';
    
    try {
      const quickResult = await client.quickCompletion(quickPrompt);
      console.log('Quick completion result:');
      console.log(quickResult.content);
      console.log(`Duration: ${quickResult.duration}ms`);
      console.log(`Fast: ${quickResult.fast ? '✓' : '✗'}\n`);
    } catch (error) {
      console.error('Quick completion failed:', error.message);
    }

    // Example 2: Standard Refactoring
    console.log('--- Example 2: Standard Refactoring ---');
    const messyCode = `
function calc(a,b){
var x=a+b;
if(x>10){
return x*2;
}else{
return x;
}
}
    `.trim();

    try {
      const refactorResult = await client.standardRefactoring(messyCode, {
        language: 'javascript'
      });
      console.log('Original code:');
      console.log(refactorResult.original);
      console.log('\nRefactored code:');
      console.log(refactorResult.refactored);
      console.log(`\nChanges: ${refactorResult.changes.summary} (${refactorResult.changes.lineCountChange} lines)\n`);
    } catch (error) {
      console.error('Refactoring failed:', error.message);
    }

    // Example 3: Code Generation
    console.log('--- Example 3: Code Generation ---');
    const spec = `
Create a utility function that:
1. Takes an array of numbers
2. Returns an object with sum, average, min, and max
3. Handles empty arrays gracefully
    `.trim();

    try {
      const genResult = await client.codeGeneration(spec, {
        language: 'javascript'
      });
      console.log('Generated code:');
      console.log(genResult.code);
      console.log(`Language: ${genResult.language}\n`);
    } catch (error) {
      console.error('Code generation failed:', error.message);
    }

    // Example 4: Unit Test Generation
    console.log('--- Example 4: Unit Test Generation ---');
    const functionToTest = `
function add(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Arguments must be numbers');
  }
  return a + b;
}
    `.trim();

    try {
      const testResult = await client.unitTestGeneration(functionToTest, {
        language: 'javascript',
        framework: 'Jest'
      });
      console.log(`Generated tests for ${testResult.functionName}:`);
      console.log(testResult.tests);
      console.log(`Framework: ${testResult.framework}\n`);
    } catch (error) {
      console.error('Test generation failed:', error.message);
    }

    // Example 5: Execute Generic Task
    console.log('--- Example 5: Execute Generic Task ---');
    const task = {
      description: 'Explain this code',
      code: 'const doubled = numbers.map(n => n * 2);',
      language: 'javascript',
      type: 'explain'
    };

    try {
      const executeResult = await client.execute(task);
      console.log('Task result:');
      console.log(executeResult.content);
      if (executeResult.usage) {
        console.log(`\nTokens used: ${executeResult.usage.total_tokens}`);
      }
    } catch (error) {
      console.error('Task execution failed:', error.message);
    }

    // Display usage statistics
    console.log('\n--- Usage Statistics ---');
    const stats = client.getStats();
    console.log(`Total requests: ${stats.requests}`);
    console.log(`Total tokens: ${stats.totalTokens}`);
    console.log(`Estimated cost: $${stats.estimatedCost}`);
    console.log(`Cache size: ${stats.cacheSize}`);
    console.log(`Avg cost/request: $${stats.averageCostPerRequest}`);

    // Cleanup
    await client.disconnect();
    console.log('\n✓ Client disconnected');

  } catch (error) {
    console.error('Initialization failed:', error.message);
    process.exit(1);
  }
}

// Run example if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
