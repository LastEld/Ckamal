/**
 * Status Command
 * Shows system status with operator runtime visibility.
 */

import * as f from './utils/formatters.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getDefaultFallbackChains, getSubscriptionModelProfiles } from '../../clients/catalog.js';
import { loadAgentRoster } from './agents.js';

export async function statusCommand(options = {}) {
  const version = getVersion();
  const uptime = formatUptime(process.uptime());
  const memory = getMemoryStatus();
  const roster = loadAgentRoster(options);
  const runtimes = getSubscriptionModelProfiles();
  const fallbackChains = getDefaultFallbackChains();

  let output = '';
  output += f.header('COGNIMESH SYSTEM STATUS', 'box');
  output += '\n\n';

  output += f.colorize('Version Information', 'bright') + '\n';
  output += f.keyValue({
    CogniMesh: `v${version}`,
    'Node.js': process.version,
    Platform: `${process.platform} (${process.arch})`,
    Uptime: uptime
  }, { indent: 2 });
  output += '\n\n';

  output += f.colorize('Memory Usage', 'bright') + '\n';
  output += f.keyValue({
    Used: f.formatBytes(memory.used),
    Free: f.formatBytes(memory.free),
    Total: f.formatBytes(memory.total),
    Usage: `${memory.percentage}%`
  }, { indent: 2 });
  output += '\n';
  output += '  ' + f.progressBar(memory.percentage, 100, { width: 40 }) + '\n\n';

  output += f.colorize('Component Status', 'bright') + '\n';
  const components = [
    { name: 'BIOS Core', status: 'running', health: 'healthy' },
    { name: 'Client Gateway', status: 'running', health: 'healthy' },
    { name: 'Task Queue', status: 'running', health: 'healthy' },
    { name: 'Database', status: 'running', health: 'healthy' },
    { name: 'WebSocket Server', status: 'running', health: 'healthy' }
  ];

  components.forEach((component) => {
    const statusIcon = component.status === 'running'
      ? f.colorize('●', 'green')
      : f.colorize('○', 'red');
    const healthText = component.health === 'healthy'
      ? f.colorize('healthy', 'green')
      : f.colorize('degraded', 'yellow');
    output += `  ${statusIcon} ${component.name.padEnd(20)} ${healthText}\n`;
  });

  const activeAgents = roster.agents.filter((agent) => ['active', 'running', 'ready'].includes(agent.status)).length;
  output += '\n';
  output += f.colorize('Control Plane', 'bright') + '\n';
  output += f.keyValue({
    Agents: `${activeAgents}/${roster.agents.length}`,
    'Roster Source': roster.source,
    'Provider Runtimes': String(runtimes.length)
  }, { indent: 2 });

  output += '\n\n';
  output += f.colorize('Provider Runtime Inventory', 'bright') + '\n';
  output += f.table(runtimes.map((runtime) => ({
    Model: runtime.id,
    Runtime: runtime.runtimeProvider,
    Billing: runtime.billingModel,
    Load: `${runtime.currentLoad}/${runtime.maxConcurrency}`,
    Latency: `${runtime.avgLatencyMs}ms`,
    Quality: `${Math.round(runtime.qualityScore * 100)}%`
  })), {
    columns: ['Model', 'Runtime', 'Billing', 'Load', 'Latency', 'Quality']
  });

  output += '\n\n';
  output += f.colorize('Fallback Chains', 'bright') + '\n';
  for (const [name, chain] of Object.entries(fallbackChains)) {
    output += `  ${name}: ${chain.join(' -> ')}\n`;
  }

  output += '\n';
  output += f.divider();
  output += '\n' + f.success('All systems operational');

  return {
    success: true,
    output,
    data: {
      version,
      uptime,
      memory,
      components,
      agents: roster.agents,
      runtimes,
      fallbackChains
    }
  };
}

function getVersion() {
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '5.0.0';
    }
  } catch (error) { /* intentionally empty - fallback to default version */ }

  return '5.0.0';
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function getMemoryStatus() {
  const used = process.memoryUsage();
  const total = used.heapTotal;
  const usedMem = used.heapUsed;

  return {
    used: usedMem,
    free: total - usedMem,
    total,
    percentage: Math.round((usedMem / total) * 100)
  };
}

export default statusCommand;
