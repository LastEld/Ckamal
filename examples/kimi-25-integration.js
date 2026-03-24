/**
 * Kimi 2.5 Integration Examples
 * Demonstrates all features of the enhanced Kimi CLI client
 */

import { KimiCliClient } from '../src/clients/kimi/cli.js';
import { ClientGateway } from '../src/bios/client-gateway.js';
import { ANALYSIS_TYPES, CHINESE_OPT_TYPES, createKimiClient } from '../src/clients/kimi/index.js';

// ============================================================================
// Example 1: Basic Initialization
// ============================================================================

async function basicExample() {
  console.log('=== Basic Kimi 2.5 Client Example ===\n');

  const client = new KimiCliClient({
    apiKey: process.env.MOONSHOT_API_KEY,
    model: 'moonshot-v1-128k',
    features: {
      thinkingMode: true,
      multimodal: true,
      longContext: true,
      chineseOptimization: true
    }
  });

  await client.initialize();
  console.log('✓ Client initialized');
  console.log('Capabilities:', client.getCapabilities());

  // Simple chat
  const response = await client.send('Hello! What can you help me with?', {
    temperature: 0.7
  });
  
  console.log('\nResponse:', response.content);
  await client.disconnect();
}

// ============================================================================
// Example 2: Long Context Analysis
// ============================================================================

async function longContextExample() {
  console.log('\n=== Long Context Analysis Example ===\n');

  const client = createKimiClient({}, 'long_context');
  await client.initialize();

  // Analyze multiple files
  const files = [
    { path: './src/app.js' },
    { path: './src/utils.js' },
    { path: './src/config.js' },
    // Can handle up to 256K tokens worth of files
  ];

  try {
    const result = await client.longContextAnalyze(files, {
      analysisType: ANALYSIS_TYPES.COMPREHENSIVE,
      question: 'What is the overall architecture of this codebase?',
      instructions: 'Focus on design patterns and potential improvements'
    });

    console.log('Analysis Result:', result.content);
  } catch (error) {
    console.error('Analysis failed:', error.message);
  }

  await client.disconnect();
}

// ============================================================================
// Example 3: Thinking Mode
// ============================================================================

async function thinkingModeExample() {
  console.log('\n=== Thinking Mode Example ===\n');

  const client = createKimiClient({}, 'default');
  await client.initialize();

  const problem = `
    I need to design a caching system for a high-traffic web application.
    Requirements:
    - Support 100K+ concurrent users
    - Sub-10ms response time
    - Data consistency across multiple regions
    - Automatic failover
    
    What architecture would you recommend?
  `;

  const result = await client.thinkingMode(problem, {
    context: 'The application is an e-commerce platform with real-time inventory.',
    constraints: 'Budget is limited to $5000/month for infrastructure.',
    examples: 'Redis Cluster with Sentinel has been considered but needs evaluation.'
  });

  console.log('Thinking Result:', result.content);
  
  // If reasoning is available
  if (result.reasoning) {
    console.log('\nReasoning Process:', result.reasoning);
  }

  await client.disconnect();
}

// ============================================================================
// Example 4: Multimodal Analysis
// ============================================================================

async function multimodalExample() {
  console.log('\n=== Multimodal Analysis Example ===\n');

  const client = createKimiClient({}, 'multimodal');
  await client.initialize();

  try {
    // Analyze a single image
    const result = await client.multimodalAnalyze(
      './diagrams/architecture.png',
      'Please analyze this architecture diagram. What are the potential bottlenecks?',
      { detail: 'high' }
    );

    console.log('Image Analysis:', result.content);

    // Batch analyze multiple images
    const images = [
      { path: './screenshots/error-1.png', prompt: 'What is causing this error?' },
      { path: './screenshots/error-2.png', prompt: 'What is causing this error?' },
      { path: './diagrams/flowchart.png', prompt: 'Explain this workflow.' }
    ];

    const batchResults = await client.batchMultimodalAnalyze(
      images,
      'Analyze these screenshots and diagrams',
      { concurrency: 2, batchDelay: 1000 }
    );

    console.log('\nBatch Results:');
    batchResults.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.path}: ${r.success ? '✓' : '✗'}`);
    });
  } catch (error) {
    console.error('Multimodal analysis failed:', error.message);
  }

  await client.disconnect();
}

// ============================================================================
// Example 5: Chinese Optimization
// ============================================================================

async function chineseOptimizationExample() {
  console.log('\n=== Chinese Optimization Example ===\n');

  const client = createKimiClient({}, 'coding');
  await client.initialize();

  const code = `
    function processUserName(name) {
      return name.length > 10 ? name.substring(0, 10) + '...' : name;
    }
    
    function searchUsers(query, users) {
      return users.filter(u => u.name.includes(query));
    }
  `;

  const result = await client.chineseOptimization(code, {
    type: CHINESE_OPT_TYPES.TEXT_PROCESSING,
    requirements: 'The system will primarily handle Chinese user names and search queries.',
    targetLanguage: 'javascript'
  });

  console.log('Optimization Result:', result.content);

  await client.disconnect();
}

// ============================================================================
// Example 6: Batch Code Review
// ============================================================================

async function batchCodeReviewExample() {
  console.log('\n=== Batch Code Review Example ===\n');

  const client = createKimiClient({}, 'coding');
  await client.initialize();

  const filesToReview = [
    './src/auth.js',
    './src/api.js',
    './src/database.js',
    './src/middleware.js',
    './src/utils.js'
  ];

  const result = await client.batchCodeReview(filesToReview, {
    focus: ['security', 'performance', 'error_handling']
  });

  console.log('Code Review Result:', result.content);

  await client.disconnect();
}

// ============================================================================
// Example 7: Multi-file Refactoring
// ============================================================================

async function multiFileRefactoringExample() {
  console.log('\n=== Multi-file Refactoring Example ===\n');

  const client = createKimiClient({}, 'coding');
  await client.initialize();

  const files = [
    { path: './src/old-module.js' },
    { path: './src/legacy-utils.js' },
    { path: './src/deprecated-api.js' }
  ];

  const result = await client.multiFileRefactoring(
    files,
    'Migrate from callback-based code to async/await throughout the codebase',
    {
      preserveApi: true,
      addTests: true
    }
  );

  console.log('Refactoring Plan:', result.content);

  await client.disconnect();
}

// ============================================================================
// Example 8: Documentation Generation
// ============================================================================

async function documentationExample() {
  console.log('\n=== Documentation Generation Example ===\n');

  const client = createKimiClient({}, 'coding');
  await client.initialize();

  const sourceFiles = [
    { path: './src/index.js' },
    { path: './src/core.js' },
    { path: './src/helpers.js' }
  ];

  // Generate API documentation
  const apiDocs = await client.documentationGeneration(sourceFiles, {
    docType: 'api',
    includeExamples: true
  });

  console.log('API Documentation:', apiDocs.content);

  // Generate README
  const readme = await client.documentationGeneration(sourceFiles, {
    docType: 'readme',
    projectName: 'My Awesome Project',
    includeBadges: true
  });

  console.log('\nREADME Content:', readme.content);

  await client.disconnect();
}

// ============================================================================
// Example 9: Using Client Gateway
// ============================================================================

async function gatewayExample() {
  console.log('\n=== Client Gateway Example ===\n');

  const gateway = new ClientGateway({
    claude: { cli: { apiKey: process.env.ANTHROPIC_API_KEY } },
    kimi: { 
      cli: { 
        apiKey: process.env.MOONSHOT_API_KEY,
        features: {
          thinkingMode: true,
          multimodal: true,
          longContext: true,
          chineseOptimization: true
        }
      } 
    },
    codex: { cli: { apiKey: process.env.OPENAI_API_KEY } },
    fallbackChain: ['kimi', 'claude', 'codex']
  });

  // Event listeners
  gateway.on('initialized', (statuses) => {
    console.log('Gateway initialized with statuses:', statuses);
  });

  gateway.on('fallback', ({ from, to }) => {
    console.log(`Fallback: ${from} → ${to}`);
  });

  await gateway.initialize();

  // Execute with specific provider
  const kimiResult = await gateway.executeWithKimi({
    type: 'thinking_mode',
    prompt: 'How would you design a scalable chat system?'
  });
  console.log('Kimi Result:', kimiResult.content);

  // Auto-select best client
  const task = {
    type: 'multimodal_analyze',
    hasImages: true,
    description: 'Analyze UI mockup and suggest improvements'
  };

  const bestClient = gateway.selectBestClient(task);
  console.log('Best client for multimodal task:', bestClient?.provider, bestClient?.mode);

  // Get stats
  console.log('Gateway Stats:', gateway.getStats());

  await gateway.shutdown();
}

// ============================================================================
// Run Examples
// ============================================================================

async function runExamples() {
  try {
    // Run selected examples (uncomment to run)
    
    // await basicExample();
    // await longContextExample();
    // await thinkingModeExample();
    // await multimodalExample();
    // await chineseOptimizationExample();
    // await batchCodeReviewExample();
    // await multiFileRefactoringExample();
    // await documentationExample();
    // await gatewayExample();

    console.log('\n✓ All examples completed');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}

export {
  basicExample,
  longContextExample,
  thinkingModeExample,
  multimodalExample,
  chineseOptimizationExample,
  batchCodeReviewExample,
  multiFileRefactoringExample,
  documentationExample,
  gatewayExample
};
