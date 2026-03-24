/**
 * Example: GPT 5.4 Codex VSCode Client Usage
 * 
 * This example demonstrates how to use the GPT54CodexVSCodeClient
 * for advanced IDE features in CogniMesh.
 */

import { GPT54CodexVSCodeClient } from '../src/clients/codex/vscode.js';

async function main() {
  // Create client instance
  const client = new GPT54CodexVSCodeClient({
    port: 8443,
    host: 'localhost',
    contextWindow: 256000,
    enableAdvancedIntelliSense: true,
    enableSmartRefactoring: true,
    enableArchitectureSuggestions: true,
    enablePerformanceOptimization: true,
    enableSecurityAnalysis: true,
    enableMultiFileContext: true
  });

  try {
    // Initialize connection to VSCode extension
    console.log('Initializing GPT 5.4 Codex VSCode client...');
    const initResult = await client.initialize();
    console.log('Initialized:', initResult);

    // Get capabilities
    console.log('\nClient capabilities:', client.getCapabilities());

    // Example: Advanced IntelliSense
    console.log('\n--- Advanced IntelliSense ---');
    const intelliSenseResult = await client.advancedIntelliSense(
      {
        uri: 'file:///project/src/app.js',
        languageId: 'javascript',
        version: 1,
        content: 'function calculateSum(a, b) {\n  return a + b;\n}\n\n// Use calculate',
        imports: [],
        symbols: ['calculateSum']
      },
      { line: 4, character: 15 }
    );
    console.log('IntelliSense result:', intelliSenseResult);

    // Example: Smart Refactoring
    console.log('\n--- Smart Refactoring ---');
    const refactorResult = await client.smartRefactoring(
      {
        uri: 'file:///project/src/app.js',
        content: 'function calculateSum(a, b) { return a + b; }',
        languageId: 'javascript'
      },
      {
        type: 'extract',
        target: 'calculateSum',
        options: { extractTo: 'utils/math.js' }
      }
    );
    console.log('Refactoring result:', refactorResult);

    // Example: Architecture Suggestions
    console.log('\n--- Architecture Suggestions ---');
    const archResult = await client.architectureSuggestions({
      name: 'MyProject',
      rootPath: '/project',
      structure: {
        src: ['components', 'utils', 'services'],
        tests: ['unit', 'integration']
      },
      dependencies: ['express', 'react', 'typescript'],
      focus: 'scalability'
    });
    console.log('Architecture suggestions:', archResult);

    // Example: Performance Optimization
    console.log('\n--- Performance Optimization ---');
    const perfResult = await client.performanceOptimization({
      uri: 'file:///project/src/heavy.js',
      content: '// Some performance-critical code',
      languageId: 'javascript',
      analysisType: 'full'
    });
    console.log('Performance optimization:', perfResult);

    // Example: Security Analysis
    console.log('\n--- Security Analysis ---');
    const securityResult = await client.securityAnalysis({
      uri: 'file:///project/src/auth.js',
      content: '// Authentication code',
      languageId: 'javascript',
      analysisLevel: 'deep',
      focusAreas: ['vulnerabilities', 'secrets', 'dependencies']
    });
    console.log('Security analysis:', securityResult);

    // Example: Multi-file Refactoring
    console.log('\n--- Multi-file Refactoring ---');
    const multiFileResult = await client.multiFileRefactoring(
      'Migrate all var declarations to const/let',
      [
        { path: 'src/file1.js', languageId: 'javascript' },
        { path: 'src/file2.js', languageId: 'javascript' }
      ],
      { autoApply: false, reviewChanges: true }
    );
    console.log('Multi-file refactoring:', multiFileResult);

    // Example: Architecture View
    console.log('\n--- Architecture View ---');
    const archView = await client.getArchitectureView('/project', {
      includeDependencies: true,
      includeMetrics: true,
      detailLevel: 'high',
      format: 'graph'
    });
    console.log('Architecture view:', archView);

    // Example: Sync with Dashboard
    console.log('\n--- Sync with Dashboard ---');
    const syncResult = await client.syncWithDashboard({
      metrics: { codeQuality: 95, coverage: 87 },
      tasks: [{ id: 1, title: 'Refactor auth module' }],
      insights: { suggestions: ['Use TypeScript', 'Add tests'] }
    }, {
      syncType: 'incremental',
      targetEndpoint: 'http://localhost:3000/api/dashboard'
    });
    console.log('Dashboard sync:', syncResult);

    // Example: Agent Pool Management
    console.log('\n--- Agent Pool Management ---');
    const agentResult = await client.manageAgentPool('spawn', [
      { type: 'analyzer', config: { priority: 'high' } },
      { type: 'refactorer', config: { targetFiles: ['*.js'] } }
    ], { priority: 'high', timeout: 120000 });
    console.log('Agent pool management:', agentResult);

    // Example: Send message
    console.log('\n--- Send Message ---');
    const messageResult = await client.send(
      { content: 'Explain this code structure' },
      { model: 'gpt-5.4-codex', temperature: 0.1 }
    );
    console.log('Message result:', messageResult);

    // Example: Execute task
    console.log('\n--- Execute Task ---');
    const taskResult = await client.execute({
      description: 'Generate unit tests for calculateSum',
      code: 'function calculateSum(a, b) { return a + b; }',
      filePath: 'src/math.js',
      language: 'javascript',
      mode: 'generate'
    }, { autoApply: false });
    console.log('Task result:', taskResult);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Disconnect
    console.log('\nDisconnecting...');
    await client.disconnect();
    console.log('Disconnected');
  }
}

// Run example if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
