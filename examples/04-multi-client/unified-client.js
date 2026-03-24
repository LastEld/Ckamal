/**
 * Unified Client Example
 * Demonstrates usage of all client types
 */

import {
  ClaudeMcpClient,
  KimiSwarmClient,
  CodexCliClient
} from '../../src/clients/index.js';

// ============================================
// Example 1: Claude MCP Client
// ============================================
async function claudeMcpExample() {
  console.log('\n🤖 Claude MCP Client Example\n');

  const client = new ClaudeMcpClient({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-opus-20240229'
  });

  // Listen to events
  client.on('ready', () => console.log('✅ Claude MCP ready'));
  client.on('error', (err) => console.error('❌ Error:', err.message));
  client.on('stream', (chunk) => process.stdout.write(chunk.chunk));

  try {
    await client.initialize();
    console.log('Capabilities:', client.getCapabilities());

    // Register tools
    client.registerTools([
      {
        name: 'calculator',
        description: 'Perform mathematical calculations',
        schema: {
          type: 'object',
          properties: {
            expression: { type: 'string' }
          }
        }
      }
    ]);

    // Send message
    const response = await client.send(
      { content: 'What is 2 + 2?' },
      { maxTokens: 100 }
    );

    console.log('\nResponse:', response.content);

    // Execute task
    const taskResult = await client.execute({
      description: 'Analyze this JavaScript code',
      code: 'function sum(a, b) { return a + b; }',
      language: 'javascript'
    });

    console.log('Task result:', taskResult.content);

    await client.disconnect();
  } catch (error) {
    console.error('Claude MCP error:', error.message);
  }
}

// ============================================
// Example 2: Kimi Swarm Client
// ============================================
async function kimiSwarmExample() {
  console.log('\n🐝 Kimi Swarm Client Example\n');

  const swarm = new KimiSwarmClient({
    apiKey: process.env.MOONSHOT_API_KEY,
    maxAgents: 3,
    model: 'moonshot-v1-128k'
  });

  // Listen to swarm events
  swarm.on('ready', () => console.log('✅ Swarm ready'));
  swarm.on('swarmStart', (info) => console.log(`🚀 Swarm started: ${info.taskCount} tasks, ${info.agentCount} agents`));
  swarm.on('swarmComplete', (info) => console.log(`✅ Swarm complete: ${info.successCount}/${info.taskCount} successful`));
  swarm.on('agentResult', ({ agentId, result }) => console.log(`📝 Agent ${agentId} completed`));

  try {
    await swarm.initialize();
    console.log('Capabilities:', swarm.getCapabilities());

    // Execute single task
    const singleResult = await swarm.execute({
      description: 'Write a greeting message'
    });
    console.log('Single task result:', singleResult);

    // Execute swarm task with subtasks
    const swarmResult = await swarm.execute({
      type: 'swarm',
      subtasks: [
        { id: '1', description: 'Write a title for an article about AI' },
        { id: '2', description: 'Write an introduction paragraph' },
        { id: '3', description: 'Write 3 bullet points about AI benefits' }
      ],
      parallelAgents: 3,
      aggregateMode: 'merge'
    });

    console.log('\nSwarm result:');
    console.log('Content:', swarmResult.content);
    console.log('Summary:', swarmResult.summary);

    await swarm.disconnect();
  } catch (error) {
    console.error('Swarm error:', error.message);
  }
}

// ============================================
// Example 3: Codex CLI Client
// ============================================
async function codexCliExample() {
  console.log('\n💻 Codex CLI Client Example\n');

  const client = new CodexCliClient({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
    preferApi: true
  });

  try {
    await client.initialize();
    console.log('✅ Codex CLI ready');
    console.log('Capabilities:', client.getCapabilities());

    // Send message
    const response = await client.send(
      { content: 'Explain the concept of recursion in programming' },
      { maxTokens: 500 }
    );

    console.log('\nResponse:', response.content);

    // Execute code task
    const codeResult = await client.execute({
      description: 'Optimize this function for performance',
      code: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`,
      language: 'javascript'
    });

    console.log('\nCode optimization result:', codeResult.content);

    // Use completion API
    const completion = await client.complete(
      'function quicksort(arr) {',
      { maxTokens: 200 }
    );

    console.log('\nCompletion:', completion.content);

    await client.disconnect();
  } catch (error) {
    console.error('Codex error:', error.message);
  }
}

// ============================================
// Example 4: Client Status & Health Check
// ============================================
async function healthCheckExample() {
  console.log('\n🏥 Health Check Example\n');

  const clients = [
    { name: 'Claude MCP', client: new ClaudeMcpClient({ apiKey: process.env.ANTHROPIC_API_KEY }) },
    { name: 'Kimi Swarm', client: new KimiSwarmClient({ apiKey: process.env.MOONSHOT_API_KEY }) },
    { name: 'Codex CLI', client: new CodexCliClient({ apiKey: process.env.OPENAI_API_KEY }) }
  ];

  for (const { name, client } of clients) {
    try {
      console.log(`\nChecking ${name}...`);
      
      await client.initialize();
      
      const status = client.getStatus();
      console.log(`  Status: ${status.status}`);
      console.log(`  Connected: ${status.health.connected}`);
      console.log(`  Provider: ${status.provider}`);
      console.log(`  Capabilities: ${status.capabilities.features?.join(', ') || 'N/A'}`);

      // Ping test
      const latency = await client.ping();
      console.log(`  Latency: ${latency}ms`);

      await client.disconnect();
      console.log(`  ✅ ${name} healthy`);
    } catch (error) {
      console.log(`  ❌ ${name} error: ${error.message}`);
    }
  }
}

// ============================================
// Main Execution
// ============================================
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          CogniMesh Unified Client Examples                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Run examples based on available API keys
  if (process.env.ANTHROPIC_API_KEY) {
    await claudeMcpExample();
  } else {
    console.log('\n⏭️  Skipping Claude MCP (no ANTHROPIC_API_KEY)');
  }

  if (process.env.MOONSHOT_API_KEY) {
    await kimiSwarmExample();
  } else {
    console.log('\n⏭️  Skipping Kimi Swarm (no MOONSHOT_API_KEY)');
  }

  if (process.env.OPENAI_API_KEY) {
    await codexCliExample();
  } else {
    console.log('\n⏭️  Skipping Codex CLI (no OPENAI_API_KEY)');
  }

  // Health check for all clients
  await healthCheckExample();

  console.log('\n✨ All examples completed!\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { claudeMcpExample, kimiSwarmExample, codexCliExample, healthCheckExample };
