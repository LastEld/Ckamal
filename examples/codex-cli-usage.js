/**
 * GPT 5.4 Codex CLI Usage Examples
 * CogniMesh Phase 4
 */

import { GPT54CodexCLIClient } from '../src/clients/codex/cli.js';
import { glob } from 'glob';

// Example 1: Project Analysis
async function exampleProjectAnalysis() {
  console.log('=== Example 1: Project Analysis ===\n');
  
  const client = new GPT54CodexCLIClient({
    apiKey: process.env.OPENAI_API_KEY,
    enableReasoning: true
  });
  
  try {
    await client.initialize();
    
    // Listen for events
    client.on('project:analyze:start', ({ path }) => {
      console.log(`🔍 Starting analysis of: ${path}`);
    });
    
    client.on('project:analyze:complete', ({ files }) => {
      console.log(`✅ Analysis complete. Analyzed ${files} files.\n`);
    });
    
    const result = await client.projectAnalyze('./src', {
      quick: false,
      deep: true
    });
    
    console.log('Project Structure:');
    console.log(`  Total files: ${result.structure.stats.totalFiles}`);
    console.log(`  Languages: ${JSON.stringify(result.structure.stats.languages)}`);
    
    console.log('\nRecommendations:');
    result.recommendations?.forEach((rec, i) => {
      const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`  ${icon} ${rec.description}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.disconnect();
  }
}

// Example 2: Batch Refactoring
async function exampleBatchRefactor() {
  console.log('\n=== Example 2: Batch Refactoring ===\n');
  
  const client = new GPT54CodexCLIClient({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  try {
    await client.initialize();
    
    // Find all JavaScript files
    const files = await glob('src/**/*.js', { absolute: true });
    console.log(`Found ${files.length} files to process\n`);
    
    // Progress tracking
    client.on('batch:progress', ({ percentage, processed, total }) => {
      process.stdout.write(`\r⏳ Progress: ${percentage}% (${processed}/${total})`);
    });
    
    client.on('batch:complete', ({ processed, errors }) => {
      console.log(`\n✅ Complete: ${processed} processed, ${errors} errors`);
    });
    
    const result = await client.batchRefactor(
      files.slice(0, 5), // Limit for demo
      {
        description: "Add comprehensive JSDoc comments",
        type: 'documentation',
        instructions: "Add JSDoc comments to all functions and classes"
      },
      {
        batchSize: 2,
        delay: 1000,
        dryRun: true // Preview only
      }
    );
    
    console.log('\nResults:');
    result.results.forEach(r => {
      console.log(`  ${r.status === 'modified' ? '✏️' : '✓'} ${r.filePath}: ${r.status}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.disconnect();
  }
}

// Example 3: Architecture Generation
async function exampleGenerateArchitecture() {
  console.log('\n=== Example 3: Architecture Generation ===\n');
  
  const client = new GPT54CodexCLIClient({
    apiKey: process.env.OPENAI_API_KEY,
    projectLanguage: 'typescript'
  });
  
  try {
    await client.initialize();
    
    const spec = `
      E-commerce platform with the following features:
      - User authentication and authorization (JWT)
      - Product catalog with search and filters
      - Shopping cart and checkout process
      - Payment integration (Stripe)
      - Order management system
      - Admin dashboard
      - Real-time notifications (WebSocket)
      
      Technical requirements:
      - Microservices architecture
      - Node.js with TypeScript
      - PostgreSQL for primary database
      - Redis for caching
      - RabbitMQ for message queue
      - Docker containerization
      - Kubernetes deployment
    `;
    
    console.log('🏗️ Generating architecture...\n');
    
    const result = await client.generateArchitecture({
      description: spec,
      constraints: "TypeScript, Node.js, PostgreSQL, Redis, Docker",
      preferences: "Clean architecture, SOLID principles"
    }, {
      outputPath: './generated-architecture'
    });
    
    console.log(`✅ Generated ${result.components.length} components`);
    console.log(`📁 Output files: ${result.files.join(', ')}`);
    console.log('\nComponents:');
    result.components.forEach((comp, i) => {
      console.log(`  ${i + 1}. ${comp.name} - ${comp.description}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.disconnect();
  }
}

// Example 4: Codebase Optimization
async function exampleOptimizeCodebase() {
  console.log('\n=== Example 4: Codebase Optimization ===\n');
  
  const client = new GPT54CodexCLIClient({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  try {
    await client.initialize();
    
    console.log('⚡ Analyzing codebase for optimization...\n');
    
    const result = await client.optimizeCodebase('./src', {
      targets: ['performance', 'security'],
      autoApply: false // Analysis only
    });
    
    console.log(`📊 Analysis Results:`);
    console.log(`  Files analyzed: ${result.metrics.filesAnalyzed}`);
    console.log(`  Optimizations identified: ${result.metrics.optimizationsIdentified}`);
    
    console.log('\n🎯 Optimization Targets:');
    result.targets.forEach(t => {
      console.log(`  • ${t.category} (${t.priority})`);
    });
    
    console.log('\n💡 Recommendations:');
    console.log(result.plan.plan);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.disconnect();
  }
}

// Example 5: Test Generation
async function exampleGenerateTests() {
  console.log('\n=== Example 5: Test Generation ===\n');
  
  const client = new GPT54CodexCLIClient({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  try {
    await client.initialize();
    
    console.log('🧪 Generating tests...\n');
    
    const result = await client.runTests({
      testType: 'unit',
      coverage: true,
      path: './src/services'
    });
    
    console.log('Generated Tests:');
    console.log(result.results.raw || JSON.stringify(result.results, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.disconnect();
  }
}

// Example 6: Documentation Generation
async function exampleGenerateDocs() {
  console.log('\n=== Example 6: Documentation Generation ===\n');
  
  const client = new GPT54CodexCLIClient({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  try {
    await client.initialize();
    
    console.log('📝 Generating documentation...\n');
    
    const result = await client.generateDocumentation({
      format: 'markdown',
      sections: ['api', 'examples', 'configuration'],
      audience: 'developers',
      path: './src'
    });
    
    console.log('Documentation generated!');
    console.log(`Format: ${result.format}`);
    console.log('\nPreview (first 500 chars):');
    console.log(result.documentation.slice(0, 500) + '...');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.disconnect();
  }
}

// Main runner
async function main() {
  const examples = [
    exampleProjectAnalysis,
    exampleBatchRefactor,
    exampleGenerateArchitecture,
    exampleOptimizeCodebase,
    exampleGenerateTests,
    exampleGenerateDocs
  ];
  
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         GPT 5.4 Codex CLI Usage Examples                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  for (const example of examples) {
    try {
      await example();
    } catch (error) {
      console.error(`Failed: ${error.message}`);
    }
    console.log('\n' + '─'.repeat(60) + '\n');
  }
  
  console.log('✨ All examples completed!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  exampleProjectAnalysis,
  exampleBatchRefactor,
  exampleGenerateArchitecture,
  exampleOptimizeCodebase,
  exampleGenerateTests,
  exampleGenerateDocs
};
