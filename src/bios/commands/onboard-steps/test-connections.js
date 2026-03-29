/**
 * Test Connections Step
 * Verify AI clients and services are accessible
 */

import { spawn } from 'child_process';
import * as f from '../utils/formatters.js';

async function testClientConnection(clientName, clientPath, timeout = 10000) {
  return new Promise((resolve) => {
    if (!clientPath) {
      resolve({ success: false, error: 'No path configured' });
      return;
    }

    const testProcess = spawn(clientPath, ['--version'], {
      timeout,
      shell: true
    });

    let stdout = '';
    let stderr = '';

    testProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    testProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ 
          success: true, 
          version: stdout.trim() || stderr.trim(),
          client: clientName 
        });
      } else {
        resolve({ 
          success: false, 
          error: `Exit code ${code}`,
          client: clientName 
        });
      }
    });

    testProcess.on('error', (err) => {
      resolve({ 
        success: false, 
        error: err.message,
        client: clientName 
      });
    });

    // Timeout handler
    setTimeout(() => {
      testProcess.kill();
      resolve({ 
        success: false, 
        error: 'Connection timeout',
        client: clientName 
      });
    }, timeout);
  });
}

async function testGitHubConnection(token) {
  if (!token) {
    return { success: false, skipped: true, error: 'No token configured' };
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (response.status === 200) {
      const user = await response.json();
      return { 
        success: true, 
        user: user.login,
        rateLimit: response.headers.get('x-ratelimit-remaining')
      };
    } else {
      return { 
        success: false, 
        error: `HTTP ${response.status}` 
      };
    }
  } catch (err) {
    return { 
      success: false, 
      error: err.message 
    };
  }
}

export async function testConnections(options = {}) {
  const { clients = {}, githubToken, skipOnFailure = false } = options;
  
  console.log(f.colorize('Testing connections...', 'cyan'));
  console.log();

  const results = {
    clients: {},
    github: null,
    timestamp: new Date().toISOString()
  };

  // Test AI clients
  console.log(f.colorize('AI Clients:', 'bright'));
  
  for (const [clientId, config] of Object.entries(clients)) {
    if (!config.enabled) {
      console.log(f.warning(`  ${clientId}: Skipped (not configured)`));
      results.clients[clientId] = { success: false, skipped: true };
      continue;
    }

    const spinner = f.createSpinner(`  Testing ${clientId}...`);
    spinner.start();

    const result = await testClientConnection(clientId, config.path);
    results.clients[clientId] = result;

    if (result.success) {
      spinner.succeed(`${clientId}: Connected (${result.version.slice(0, 30)}...)`);
    } else {
      spinner.fail(`${clientId}: ${result.error}`);
    }
  }

  console.log();

  // Test GitHub
  console.log(f.colorize('GitHub API:', 'bright'));
  const ghSpinner = f.createSpinner('  Testing GitHub connection...');
  ghSpinner.start();

  const ghResult = await testGitHubConnection(githubToken);
  results.github = ghResult;

  if (ghResult.success) {
    ghSpinner.succeed(`GitHub: Connected (${ghResult.user})`);
  } else if (ghResult.skipped) {
    ghSpinner.stop('GitHub: Skipped (no token)', 'warning');
  } else {
    ghSpinner.fail(`GitHub: ${ghResult.error}`);
  }

  console.log();

  // Summary
  const clientSuccess = Object.values(results.clients).some(r => r.success);
  const allPassed = clientSuccess || ghResult.success;

  if (allPassed) {
    console.log(f.success('Connection tests completed'));
  } else {
    console.log(f.warning('Some connections failed'));
    if (!skipOnFailure) {
      return {
        success: false,
        data: { step: 'test-connections', results },
        message: 'Connection tests failed'
      };
    }
  }

  return {
    success: true,
    data: { 
      step: 'test-connections', 
      results 
    },
    message: 'Connection tests completed'
  };
}

export default testConnections;
