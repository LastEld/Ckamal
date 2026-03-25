/**
 * GPT 5.3 Codex CLI
 * Command-line interface for GPT 5.3 with cost tracking
 */

'use strict';

const readline = require('readline');
const path = require('path');
const fs = require('fs').promises;
const { GPT53App } = require('./gpt53-app');
const { estimateUsage } = require('./gpt53-config');

/**
 * Cost Tracker
 * Tracks API costs and usage
 */
class CostTracker {
  constructor() {
    this.sessions = [];
    this.currentSession = {
      startTime: Date.now(),
      requests: [],
      totalCost: 0,
      totalTokens: 0,
    };
  }

  logRequest(model, usage, cost) {
    const entry = {
      timestamp: Date.now(),
      model,
      inputTokens: usage?.promptTokens || 0,
      outputTokens: usage?.completionTokens || 0,
      totalTokens: usage?.totalTokens || 0,
      cost: cost?.totalCost || 0,
    };

    this.currentSession.requests.push(entry);
    this.currentSession.totalCost += entry.cost;
    this.currentSession.totalTokens += entry.totalTokens;
  }

  getSessionSummary() {
    const duration = Date.now() - this.currentSession.startTime;
    const gpt53Requests = this.currentSession.requests.filter(r => r.model === 'gpt-5.3');
    const gpt54Requests = this.currentSession.requests.filter(r => r.model === 'gpt-5.4');

    return {
      duration: Math.round(duration / 1000),
      totalRequests: this.currentSession.requests.length,
      totalCost: Math.round(this.currentSession.totalCost * 10000) / 10000,
      totalTokens: this.currentSession.totalTokens,
      gpt53: {
        requests: gpt53Requests.length,
        cost: Math.round(gpt53Requests.reduce((sum, r) => sum + r.cost, 0) * 10000) / 10000,
      },
      gpt54: {
        requests: gpt54Requests.length,
        cost: Math.round(gpt54Requests.reduce((sum, r) => sum + r.cost, 0) * 10000) / 10000,
      },
    };
  }

  saveSession() {
    this.sessions.push({ ...this.currentSession });
    this.currentSession = {
      startTime: Date.now(),
      requests: [],
      totalCost: 0,
      totalTokens: 0,
    };
  }
}

/**
 * GPT 5.3 CLI
 */
class GPT53CLI {
  constructor() {
    this.app = null;
    this.rl = null;
    this.costTracker = new CostTracker();
    this.currentModel = 'auto';
    this.running = false;
  }

  /**
   * Initialize CLI
   */
  async initialize() {
    this.app = new GPT53App({
      useDualMode: true,
      selectionMode: this.currentModel,
    });
    await this.app.initialize();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('🚀 GPT 5.3 Codex CLI initialized');
    console.log('Type "help" for available commands\n');
  }

  /**
   * Start interactive CLI
   */
  async start() {
    this.running = true;
    await this.showPrompt();
  }

  /**
   * Show command prompt
   */
  async showPrompt() {
    if (!this.running) return;

    this.rl.question(`[${this.currentModel}] > `, async (input) => {
      await this.handleCommand(input.trim());
      await this.showPrompt();
    });
  }

  /**
   * Handle CLI command
   * @param {string} input - User input
   */
  async handleCommand(input) {
    const parts = input.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'help':
      case '?':
        this.showHelp();
        break;

      case 'exit':
      case 'quit':
      case 'q':
        await this.shutdown();
        break;

      case 'model':
        await this.handleModelCommand(args);
        break;

      case 'complete':
      case 'c':
        await this.handleComplete(args);
        break;

      case 'refactor':
      case 'r':
        await this.handleRefactor(args);
        break;

      case 'generate':
      case 'g':
        await this.handleGenerate(args);
        break;

      case 'test':
      case 't':
        await this.handleTest(args);
        break;

      case 'analyze':
      case 'a':
        await this.handleAnalyze(args);
        break;

      case 'batch':
      case 'b':
        await this.handleBatch(args);
        break;

      case 'cost':
        this.showCostSummary();
        break;

      case 'status':
        this.showStatus();
        break;

      case 'compare':
        await this.handleCompare(args);
        break;

      case 'clear':
        console.clear();
        break;

      case 'cache':
        this.app.clearCache();
        console.log('✓ Cache cleared');
        break;

      default:
        if (input) {
          console.log(`Unknown command: ${command}. Type "help" for available commands.`);
        }
    }
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(`
Available Commands:
  help, ?              Show this help message
  
  Model Control:
    model [mode]         Switch model (auto, 53, 54, cost, speed)
    status               Show current status and metrics
    cost                 Show cost summary
    compare <prompt>     Compare costs between models
  
  Code Operations:
    complete, c <text>   Quick code completion
    refactor, r <file>   Refactor code file
    generate, g <desc>   Generate code from description
    test, t <file>       Generate unit tests
    analyze, a <file>    Analyze code
  
  Batch Operations:
    batch, b <files...>  Process multiple files
  
  Utilities:
    cache                Clear response cache
    clear                Clear screen
    exit, quit, q        Exit CLI

Examples:
  model 53                    # Force GPT 5.3
  model auto                  # Auto-select model
  complete "function to"      # Get completion
  refactor src/utils.js       # Refactor file
  generate "sort function"    # Generate code
  test src/calc.js            # Generate tests
  batch file1.js file2.js     # Batch process
`);
  }

  /**
   * Handle model switching
   */
  async handleModelCommand(args) {
    if (args.length === 0) {
      console.log(`Current model: ${this.currentModel}`);
      console.log('Available modes: auto, 53, 54, cost, speed');
      return;
    }

    const mode = args[0];
    const validModes = ['auto', '53', '54', 'cost', 'speed'];

    if (!validModes.includes(mode)) {
      console.log(`Invalid mode: ${mode}`);
      console.log(`Valid modes: ${validModes.join(', ')}`);
      return;
    }

    this.currentModel = mode;
    this.app.client.setSelectionMode(mode);
    console.log(`✓ Model switched to: ${mode}`);
  }

  /**
   * Handle quick completion
   */
  async handleComplete(args) {
    const prompt = args.join(' ');
    if (!prompt) {
      console.log('Usage: complete <prompt>');
      return;
    }

    try {
      console.log('Thinking...');
      const result = await this.app.complete(prompt, { model: this.currentModel });
      
      this.costTracker.logRequest(result.modelUsed || 'gpt-5.3', result.usage, result.cost);
      
      console.log('\n--- Completion ---');
      console.log(result.content);
      console.log('------------------');
      console.log(`Model: ${result.modelUsed || 'unknown'} | Cost: $${(result.cost?.totalCost || 0).toFixed(4)} | Cached: ${result.cached ? 'yes' : 'no'}`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Handle refactoring
   */
  async handleRefactor(args) {
    if (args.length === 0) {
      console.log('Usage: refactor <file> [instructions]');
      return;
    }

    const filePath = args[0];
    const instructions = args.slice(1).join(' ') || 'Improve code quality and readability';

    try {
      const code = await fs.readFile(filePath, 'utf-8');
      console.log('Refactoring...');
      
      const result = await this.app.refactor(code, instructions, { model: this.currentModel });
      this.costTracker.logRequest(result.modelUsed || 'gpt-5.3', result.usage, result.cost);
      
      console.log('\n--- Refactored Code ---');
      console.log(result.content);
      console.log('-----------------------');
      console.log(`Model: ${result.modelUsed || 'unknown'} | Cost: $${(result.cost?.totalCost || 0).toFixed(4)}`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Handle code generation
   */
  async handleGenerate(args) {
    const requirements = args.join(' ');
    if (!requirements) {
      console.log('Usage: generate <description>');
      return;
    }

    try {
      console.log('Generating...');
      const result = await this.app.generate(requirements, {}, { model: this.currentModel });
      
      this.costTracker.logRequest(result.modelUsed || 'gpt-5.3', result.usage, result.cost);
      
      console.log('\n--- Generated Code ---');
      console.log(result.content);
      console.log('----------------------');
      console.log(`Model: ${result.modelUsed || 'unknown'} | Cost: $${(result.cost?.totalCost || 0).toFixed(4)}`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Handle test generation
   */
  async handleTest(args) {
    if (args.length === 0) {
      console.log('Usage: test <file>');
      return;
    }

    const filePath = args[0];

    try {
      const code = await fs.readFile(filePath, 'utf-8');
      console.log('Generating tests...');
      
      const result = await this.app.generateTests(code, { model: this.currentModel });
      this.costTracker.logRequest(result.modelUsed || 'gpt-5.3', result.usage, result.cost);
      
      console.log('\n--- Generated Tests ---');
      console.log(result.content);
      console.log('-----------------------');
      console.log(`Model: ${result.modelUsed || 'unknown'} | Cost: $${(result.cost?.totalCost || 0).toFixed(4)}`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Handle code analysis
   */
  async handleAnalyze(args) {
    if (args.length === 0) {
      console.log('Usage: analyze <file> [type]');
      return;
    }

    const filePath = args[0];
    const analysisType = args[1] || 'general';

    try {
      const code = await fs.readFile(filePath, 'utf-8');
      console.log('Analyzing...');
      
      const result = await this.app.analyze(code, analysisType, { model: this.currentModel });
      this.costTracker.logRequest(result.modelUsed || 'gpt-5.3', result.usage, result.cost);
      
      console.log('\n--- Analysis ---');
      console.log(result.content);
      console.log('----------------');
      console.log(`Model: ${result.modelUsed || 'unknown'} | Cost: $${(result.cost?.totalCost || 0).toFixed(4)}`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Handle batch processing
   */
  async handleBatch(args) {
    if (args.length === 0) {
      console.log('Usage: batch <files...>');
      return;
    }

    const files = args;
    console.log(`Processing ${files.length} files...`);

    try {
      const tasks = await Promise.all(
        files.map(async (file) => {
          const code = await fs.readFile(file, 'utf-8');
          return {
            type: 'simple_analysis',
            code,
            options: { model: this.currentModel },
          };
        })
      );

      const results = await this.app.batch(tasks);
      
      results.forEach((result, index) => {
        this.costTracker.logRequest(result.modelUsed || 'gpt-5.3', result.usage, result.cost);
        console.log(`\n--- ${files[index]} ---`);
        console.log(result.content.substring(0, 500) + '...');
      });

      console.log(`\n✓ Batch complete. Processed ${files.length} files.`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Handle cost comparison
   */
  async handleCompare(args) {
    const prompt = args.join(' ');
    if (!prompt) {
      console.log('Usage: compare <prompt>');
      return;
    }

    try {
      const comparison = await this.app.client.compareCosts({ prompt, type: 'quick_completion' });
      
      console.log('\n--- Cost Comparison ---');
      console.log(`Input tokens: ${comparison.estimatedInputTokens}`);
      console.log(`Output tokens: ${comparison.estimatedOutputTokens}`);
      console.log('');
      console.log(`GPT 5.3: $${comparison.gpt53.totalCost.toFixed(6)} (${comparison.gpt53.estimatedLatency}ms est.)`);
      console.log(`GPT 5.4: $${comparison.gpt54.totalCost.toFixed(6)} (${comparison.gpt54.estimatedLatency}ms est.)`);
      console.log('');
      console.log(`Savings: $${comparison.savings.amount.toFixed(6)} (${comparison.savings.percent}%)`);
      console.log(`Recommendation: ${comparison.recommendation}`);
      console.log('----------------------');
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Show cost summary
   */
  showCostSummary() {
    const summary = this.costTracker.getSessionSummary();
    
    console.log('\n--- Cost Summary ---');
    console.log(`Session duration: ${summary.duration}s`);
    console.log(`Total requests: ${summary.totalRequests}`);
    console.log(`Total cost: $${summary.totalCost.toFixed(4)}`);
    console.log(`Total tokens: ${summary.totalTokens.toLocaleString()}`);
    console.log('');
    console.log(`GPT 5.3: ${summary.gpt53.requests} requests, $${summary.gpt53.cost.toFixed(4)}`);
    console.log(`GPT 5.4: ${summary.gpt54.requests} requests, $${summary.gpt54.cost.toFixed(4)}`);
    console.log('--------------------');
  }

  /**
   * Show system status
   */
  showStatus() {
    const status = this.app.getStatus();
    
    console.log('\n--- System Status ---');
    console.log(`Initialized: ${status.initialized}`);
    console.log(`Dual mode: ${status.dualMode}`);
    console.log(`Current model: ${this.currentModel}`);
    
    if (status.cache) {
      console.log(`\nCache: ${status.cache.size}/${status.cache.maxSize} entries`);
      console.log(`Hit rate: ${(status.cache.hitRate * 100).toFixed(1)}%`);
    }
    
    if (status.metrics) {
      console.log(`\nTotal requests: ${status.metrics.totalRequests || 0}`);
      console.log(`GPT 5.3 usage: ${status.metrics.gpt53Percentage || 0}%`);
      console.log(`Total savings: $${(status.metrics.savingsVsGPT54 || 0).toFixed(4)}`);
    }
    
    console.log('---------------------');
  }

  /**
   * Shutdown CLI
   */
  async shutdown() {
    this.running = false;
    this.costTracker.saveSession();
    
    console.log('\n--- Final Session Summary ---');
    this.showCostSummary();
    
    await this.app.shutdown();
    this.rl.close();
    process.exit(0);
  }
}

// CLI entry point
async function main() {
  const cli = new GPT53CLI();
  await cli.initialize();
  await cli.start();
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  GPT53CLI,
  CostTracker,
  main,
};
