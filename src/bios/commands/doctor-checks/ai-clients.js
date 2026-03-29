/**
 * AI Clients Availability Check
 * Validates availability of Claude, Codex, and Kimi clients
 */

import * as f from '../utils/formatters.js';  // eslint-disable-line no-unused-vars
import { execSync } from 'child_process';

const CLIENTS = [
  {
    id: 'claude',
    name: 'Claude Code',
    commands: ['claude', 'claude-cli'],
    envVars: ['CLAUDE_SESSION_TOKEN', 'ANTHROPIC_API_KEY'],
    optional: true
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    commands: ['codex', 'codex-cli'],
    envVars: ['OPENAI_API_KEY'],
    optional: true
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    commands: ['kimi', 'kimi-cli', 'kimi-code'],
    envVars: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
    optional: true
  }
];

/**
 * Check AI client availability
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check result
 */
export async function checkAIClients(options = {}) {
  const results = [];
  let availableCount = 0;

  for (const client of CLIENTS) {
    const result = await checkClient(client);
    results.push(result);
    if (result.available) availableCount++;
  }

  // At least one client should be available for full functionality
  if (availableCount === 0) {
    return {
      name: 'AI Clients',
      status: 'warn',
      message: 'No AI clients detected',
      canRepair: false,
      repairHint: 'Install at least one client: Claude Code, Codex CLI, or Kimi CLI',
      details: {
        clients: results,
        note: 'CogniMesh uses subscription-backed clients; API keys are not required'
      }
    };
  }

  if (availableCount < CLIENTS.length) {
    const missing = results.filter(r => !r.available).map(r => r.name);
    return {
      name: 'AI Clients',
      status: 'pass',
      message: `${availableCount}/${CLIENTS.length} clients available (${missing.join(', ')} missing)`,
      details: {
        available: availableCount,
        total: CLIENTS.length,
        clients: results
      }
    };
  }

  return {
    name: 'AI Clients',
    status: 'pass',
    message: `All ${CLIENTS.length} clients available`,
    details: {
      available: availableCount,
      total: CLIENTS.length,
      clients: results
    }
  };
}

/**
 * Check individual client
 * @param {Object} client - Client configuration
 * @returns {Promise<Object>} Client check result
 */
async function checkClient(client) {
  const result = {
    id: client.id,
    name: client.name,
    available: false,
    detectedCommand: null,
    hasEnvVars: false
  };

  // Check for command availability
  for (const cmd of client.commands) {
    try {
      execSync(`${cmd} --version`, { stdio: 'pipe', encoding: 'utf-8' });
      result.available = true;
      result.detectedCommand = cmd;
      break;
    } catch (err) {
      // Command not found
    }
  }

  // Check for environment variables
  result.hasEnvVars = client.envVars.some(envVar => !!process.env[envVar]);
  result.configuredEnvVars = client.envVars.filter(envVar => !!process.env[envVar]);

  // Client is considered available if command exists or env vars are configured
  // (env vars indicate intent to use even if not installed yet)
  if (!result.available && result.hasEnvVars) {
    result.status = 'configured';
  } else if (result.available) {
    result.status = 'available';
  } else {
    result.status = 'missing';
  }

  return result;
}

export default checkAIClients;
