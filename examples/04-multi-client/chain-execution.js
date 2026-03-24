/**
 * Chain Execution Example
 * Demonstrates chaining multiple AI clients together
 */

import {
  ClaudeMcpClient,
  KimiSwarmClient,
  CodexCliClient
} from '../../src/clients/index.js';

/**
 * Chain multiple clients for complex workflows
 */
export class ClientChain {
  constructor() {
    this.steps = [];
    this.results = [];
  }

  /**
   * Add a step to the chain
   */
  add(client, task, options = {}) {
    this.steps.push({ client, task, options });
    return this;
  }

  /**
   * Execute the chain
   */
  async execute(initialInput) {
    let input = initialInput;
    this.results = [];

    for (let i = 0; i < this.steps.length; i++) {
      const { client, task, options } = this.steps[i];
      
      console.log(`\n🔗 Chain Step ${i + 1}/${this.steps.length}`);
      
      const result = await this.executeStep(client, task, input, options);
      this.results.push(result);
      
      // Pass output as input to next step
      input = result.content || result;
    }

    return this.results;
  }

  async executeStep(client, task, input, options) {
    const taskDefinition = typeof task === 'function' 
      ? task(input) 
      : { ...task, description: `${task.description}\n\nInput: ${input}` };

    return client.execute(taskDefinition, options);
  }
}

/**
 * Example: Research -> Write -> Review workflow
 */
async function researchWriteReviewExample() {
  console.log('\n📝 Research -> Write -> Review Chain\n');

  // Initialize clients
  const kimi = new KimiSwarmClient({
    apiKey: process.env.MOONSHOT_API_KEY,
    maxAgents: 2
  });

  const claude = new ClaudeMcpClient({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const codex = new CodexCliClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  try {
    await kimi.initialize();
    await claude.initialize();
    await codex.initialize();

    const topic = 'The Future of AI in Software Development';

    // Create chain: Research (Kimi) -> Write (Claude) -> Code Examples (Codex)
    const chain = new ClientChain()
      .add(kimi, {
        type: 'swarm',
        subtasks: [
          { description: `Research key points about ${topic}` },
          { description: `Find current trends in ${topic}` },
          { description: `List challenges in ${topic}` }
        ],
        aggregateMode: 'merge'
      })
      .add(claude, (input) => ({
        description: 'Write a comprehensive article based on the research',
        instructions: `Use this research to write an article:\n${input}`,
        systemPrompt: 'You are a technical writer. Write clear, engaging content.'
      }))
      .add(codex, (input) => ({
        description: 'Generate code examples to support the article',
        instructions: `Based on this article, create 3 practical code examples:\n${input}`,
        language: 'javascript'
      }));

    const results = await chain.execute(topic);

    console.log('\n✅ Chain completed!');
    console.log('\n--- Research Output ---');
    console.log(results[0].content?.substring(0, 500) + '...');
    console.log('\n--- Article Output ---');
    console.log(results[1].content?.substring(0, 500) + '...');
    console.log('\n--- Code Examples ---');
    console.log(results[2].content?.substring(0, 500) + '...');

    await kimi.disconnect();
    await claude.disconnect();
    await codex.disconnect();

  } catch (error) {
    console.error('Chain error:', error);
  }
}

/**
 * Example: Code Generation -> Review -> Optimize
 */
async function codeReviewOptimizeExample() {
  console.log('\n💻 Generate -> Review -> Optimize Chain\n');

  const codex = new CodexCliClient({ apiKey: process.env.OPENAI_API_KEY });
  const claude = new ClaudeMcpClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  const kimi = new KimiSwarmClient({ apiKey: process.env.MOONSHOT_API_KEY, maxAgents: 2 });

  try {
    await codex.initialize();
    await claude.initialize();
    await kimi.initialize();

    const requirement = 'Create a function to validate email addresses with regex';

    // Step 1: Generate code with Codex
    console.log('Step 1: Generating code...');
    const generated = await codex.execute({
      description: requirement,
      language: 'javascript'
    });
    console.log('Generated:', generated.content.substring(0, 200));

    // Step 2: Review with Claude
    console.log('\nStep 2: Reviewing code...');
    const review = await claude.execute({
      description: 'Review this code for bugs, security issues, and best practices',
      code: generated.content,
      instructions: 'Provide detailed review with specific improvements.',
      systemPrompt: 'You are a senior code reviewer. Be thorough and constructive.'
    });
    console.log('Review:', review.content.substring(0, 200));

    // Step 3: Optimize with Kimi Swarm
    console.log('\nStep 3: Optimizing...');
    const optimized = await kimi.execute({
      type: 'swarm',
      subtasks: [
        { description: `Optimize this code for performance:\n${generated.content}` },
        { description: `Add error handling to this code:\n${generated.content}` }
      ],
      aggregateMode: 'merge'
    });
    console.log('Optimized:', optimized.content.substring(0, 200));

    await codex.disconnect();
    await claude.disconnect();
    await kimi.disconnect();

  } catch (error) {
    console.error('Code chain error:', error);
  }
}

/**
 * Example: Parallel Execution with Result Aggregation
 */
async function parallelExecutionExample() {
  console.log('\n⚡ Parallel Execution Example\n');

  const claude = new ClaudeMcpClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  const kimi = new KimiSwarmClient({ apiKey: process.env.MOONSHOT_API_KEY });
  const codex = new CodexCliClient({ apiKey: process.env.OPENAI_API_KEY });

  try {
    await Promise.all([claude.initialize(), kimi.initialize(), codex.initialize()]);

    const prompt = 'Explain the benefits of TypeScript';

    // Execute all clients in parallel
    console.log('Executing all clients in parallel...');
    
    const [claudeResult, kimiResult, codexResult] = await Promise.allSettled([
      claude.send({ content: prompt }),
      kimi.send({ content: prompt }),
      codex.send({ content: prompt })
    ]);

    // Aggregate results
    const results = {
      claude: claudeResult.status === 'fulfilled' ? claudeResult.value.content : claudeResult.reason,
      kimi: kimiResult.status === 'fulfilled' ? kimiResult.value.content : kimiResult.reason,
      codex: codexResult.status === 'fulfilled' ? codexResult.value.content : codexResult.reason
    };

    console.log('\n--- Claude Response ---');
    console.log(results.claude?.substring(0, 300) || 'Failed');
    
    console.log('\n--- Kimi Response ---');
    console.log(results.kimi?.substring(0, 300) || 'Failed');
    
    console.log('\n--- Codex Response ---');
    console.log(results.codex?.substring(0, 300) || 'Failed');

    await Promise.all([claude.disconnect(), kimi.disconnect(), codex.disconnect()]);

  } catch (error) {
    console.error('Parallel execution error:', error);
  }
}

/**
 * Example: Fallback Chain
 */
async function fallbackChainExample() {
  console.log('\n🔄 Fallback Chain Example\n');

  const clients = [
    new ClaudeMcpClient({ apiKey: process.env.ANTHROPIC_API_KEY }),
    new KimiSwarmClient({ apiKey: process.env.MOONSHOT_API_KEY }),
    new CodexCliClient({ apiKey: process.env.OPENAI_API_KEY })
  ];

  const prompt = 'Generate a React component for a todo list';
  let result = null;
  let lastError = null;

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const clientName = client.constructor.name;

    try {
      console.log(`Trying ${clientName}...`);
      await client.initialize();
      
      result = await client.execute({
        description: prompt,
        language: 'jsx'
      });

      console.log(`✅ Success with ${clientName}`);
      await client.disconnect();
      break;

    } catch (error) {
      console.log(`❌ Failed with ${clientName}: ${error.message}`);
      lastError = error;
      await client.disconnect();
    }
  }

  if (result) {
    console.log('\nResult preview:');
    console.log(result.content?.substring(0, 500) || result);
  } else {
    console.log('\nAll clients failed. Last error:', lastError.message);
  }
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          CogniMesh Client Chain Examples                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Check for required API keys
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasMoonshot = !!process.env.MOONSHOT_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  if (hasMoonshot && hasAnthropic) {
    await researchWriteReviewExample();
  }

  if (hasOpenAI && hasAnthropic && hasMoonshot) {
    await codeReviewOptimizeExample();
  }

  if (hasAnthropic && hasMoonshot && hasOpenAI) {
    await parallelExecutionExample();
  }

  if (hasAnthropic || hasMoonshot || hasOpenAI) {
    await fallbackChainExample();
  }

  console.log('\n✨ Chain examples completed!\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ClientChain };
