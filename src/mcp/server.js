#!/usr/bin/env node
/**
 * CogniMesh MCP Server v5.0
 * Full operator control plane — provider discovery, model routing, BIOS,
 * health monitoring, server lifecycle, and system diagnostics.
 * Connects Claude Code / Claude Desktop to all CogniMesh surfaces.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const PROJECT_ROOT = resolve(__dirname, '../..');

const server = new Server(
  { name: 'cognimesh', version: '5.0.0' },
  { capabilities: { tools: {} } }
);

// ==================== Tool Definitions ====================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'cognimesh_status',
      description: 'Get CogniMesh platform status: discovered providers, model matrix, and surface health',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'cognimesh_discover',
      description: 'Discover and initialize all available AI provider surfaces (Claude CLI/Desktop, Codex CLI/App, Kimi CLI)',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'cognimesh_route',
      description: 'Route a prompt to the best available model based on task complexity',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt to route' },
          provider: { type: 'string', description: 'Preferred provider: claude, codex, kimi (optional)' },
          model: { type: 'string', description: 'Specific model ID (optional)' }
        },
        required: ['prompt']
      }
    },
    {
      name: 'cognimesh_models',
      description: 'List all subscription-backed models with their surfaces and capabilities',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'cognimesh_health',
      description: 'Run comprehensive system health diagnostics: memory, disk, providers, database, uptime',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'cognimesh_bios',
      description: 'Execute BIOS operations: boot, diagnose, maintenance, status',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['boot', 'diagnose', 'maintenance', 'status'],
            description: 'BIOS action to execute'
          }
        },
        required: ['action']
      }
    },
    {
      name: 'cognimesh_server',
      description: 'Control the CogniMesh HTTP/WebSocket server: start, stop, or get runtime info',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'stop', 'info'],
            description: 'Server action'
          }
        },
        required: ['action']
      }
    },
    {
      name: 'cognimesh_agents',
      description: 'List and inspect BIOS agent profiles (CVs), capabilities, and availability',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'inspect'],
            description: 'Agent action'
          },
          agentId: { type: 'string', description: 'Agent ID for inspect (optional)' }
        },
        required: ['action']
      }
    },
    {
      name: 'cognimesh_catalog',
      description: 'Show the full provider catalog: surfaces, fallback chains, runtime candidates, and routing weights',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'cognimesh_exec',
      description: 'Execute a CogniMesh CLI command (status, providers, clients, agents, tasks, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'CLI command and arguments (e.g. "providers list", "clients test", "status")' }
        },
        required: ['command']
      }
    }
  ]
}));

// ==================== Helpers ====================

/** Run a command and capture stdout/stderr */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: needsShell,
      cwd: options.cwd || PROJECT_ROOT,
      timeout: options.timeout || 30000,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('close', code => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function text(t) {
  return { content: [{ type: 'text', text: t }] };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

// Track server process
let serverProcess = null;

// ==================== Tool Implementations ====================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {

    // ==================== STATUS ====================
    case 'cognimesh_status': {
      const { ClientFactory } = await import('../clients/index.js');
      const surfaces = [
        { provider: 'claude', mode: 'cli', label: 'Claude CLI (Sonnet 4.6)' },
        { provider: 'claude', mode: 'desktop', label: 'Claude Desktop (Opus 4.6)' },
        { provider: 'claude', mode: 'vscode', label: 'Claude VS Code' },
        { provider: 'codex', mode: 'cli', label: 'Codex CLI (GPT 5.4)' },
        { provider: 'codex', mode: 'app', label: 'Codex App (GPT 5.4)' },
        { provider: 'codex', mode: 'vscode', label: 'Codex VS Code' },
        { provider: 'kimi', mode: 'cli', label: 'Kimi CLI (K2.5)' },
        { provider: 'kimi', mode: 'vscode', label: 'Kimi VS Code' },
      ];

      const results = [];
      for (const { provider, mode, label } of surfaces) {
        try {
          const client = await ClientFactory.create(provider, mode);
          await client.initialize();
          results.push({ surface: label, status: 'ready', endpoint: client.cliPath || client.port || 'connected' });
        } catch {
          results.push({ surface: label, status: 'unavailable' });
        }
      }

      const ready = results.filter(r => r.status === 'ready').length;
      const serverUp = serverProcess !== null && !serverProcess.killed;

      return text(
        `CogniMesh v5.0 — ${ready}/${surfaces.length} surfaces ready\n` +
        `Server: ${serverUp ? 'RUNNING (PID ' + serverProcess.pid + ')' : 'STOPPED'}\n\n` +
        results.map(r => `${r.status === 'ready' ? '✓' : '○'} ${r.surface}${r.endpoint ? ` → ${r.endpoint}` : ''}`).join('\n')
      );
    }

    // ==================== DISCOVER ====================
    case 'cognimesh_discover': {
      const { ClientFactory } = await import('../clients/index.js');
      const discovered = [];

      for (const [provider, modes] of [['claude', ['cli', 'desktop']], ['codex', ['cli', 'app']], ['kimi', ['cli']]]) {
        for (const mode of modes) {
          try {
            const client = await ClientFactory.create(provider, mode);
            await client.initialize();
            if (client.status === 'ready') {
              discovered.push(`${provider}/${mode}: ready (${client.cliPath || client.port || 'ok'})`);
            }
          } catch {
            // not available
          }
        }
      }

      return text(
        discovered.length > 0
          ? `Discovered ${discovered.length} surfaces:\n${discovered.join('\n')}`
          : 'No surfaces discovered. Ensure Claude CLI, Codex CLI, or Kimi CLI are installed.'
      );
    }

    // ==================== MODELS (FIXED) ====================
    case 'cognimesh_models': {
      const { getCanonicalSubscriptionSurfaceMatrix, getSubscriptionModelProfiles } = await import('../clients/catalog.js');
      const matrix = getCanonicalSubscriptionSurfaceMatrix();
      const profiles = getSubscriptionModelProfiles();

      const lines = matrix.map(entry => {
        const profile = profiles.find(p => p.id === entry.modelId);
        const provider = profile?.provider || entry.runtimeProvider || 'unknown';
        const quality = profile ? `Q:${profile.qualityScore}` : '';
        const latency = profile ? `${profile.avgLatencyMs}ms` : '';
        const features = profile?.capabilities?.features?.join(', ') || '';
        return `${entry.name} [${entry.modelId}]\n  Provider: ${provider} | Surfaces: ${entry.surfaces.join(', ')} | ${quality} | ${latency}\n  Features: ${features}`;
      });

      return text(
        `CogniMesh Subscription Model Matrix (${matrix.length} models, 3 providers):\n\n` +
        lines.join('\n\n') +
        '\n\nAll models route through local subscriptions. No API billing.'
      );
    }

    // ==================== HEALTH ====================
    case 'cognimesh_health': {
      const mem = process.memoryUsage();
      const uptime = process.uptime();
      const cpus = (await import('os')).cpus();

      // Check database
      let dbStatus = 'unavailable';
      const dbPath = join(PROJECT_ROOT, 'data', 'cognimesh.db');
      if (existsSync(dbPath)) {
        const stats = statSync(dbPath);
        dbStatus = `ok (${formatBytes(stats.size)})`;
      }

      // Check log directory
      let logStatus = 'unavailable';
      const logDir = join(PROJECT_ROOT, 'logs');
      if (existsSync(logDir)) {
        const logFiles = readdirSync(logDir).filter(f => f.endsWith('.log'));
        logStatus = `${logFiles.length} log files`;
      }

      // Check providers
      const { ClientFactory } = await import('../clients/index.js');
      const providerChecks = [];
      for (const [prov, mode] of [['claude', 'cli'], ['codex', 'cli'], ['kimi', 'cli']]) {
        try {
          const client = await ClientFactory.create(prov, mode);
          await client.initialize();
          providerChecks.push(`✓ ${prov}/${mode}`);
        } catch {
          providerChecks.push(`○ ${prov}/${mode}`);
        }
      }

      const serverUp = serverProcess !== null && !serverProcess.killed;

      return text(
        `CogniMesh Health Report\n` +
        `${'─'.repeat(40)}\n` +
        `MCP Server Uptime: ${Math.floor(uptime)}s\n` +
        `HTTP Server: ${serverUp ? 'RUNNING' : 'STOPPED'}\n` +
        `Node.js: ${process.version}\n` +
        `Platform: ${process.platform} (${process.arch})\n` +
        `CPUs: ${cpus.length} cores\n` +
        `Memory: RSS ${formatBytes(mem.rss)} | Heap ${formatBytes(mem.heapUsed)}/${formatBytes(mem.heapTotal)}\n` +
        `Database: ${dbStatus}\n` +
        `Logs: ${logStatus}\n` +
        `${'─'.repeat(40)}\n` +
        `Providers:\n${providerChecks.join('\n')}`
      );
    }

    // ==================== BIOS ====================
    case 'cognimesh_bios': {
      const action = args?.action;
      if (!action) {
        return text('Error: action is required (boot, diagnose, maintenance, status)');
      }

      try {
        const result = await runCommand('node', [join(PROJECT_ROOT, 'src/bios/cli.js'), action], {
          timeout: 60000
        });
        const output = result.stdout || result.stderr || `BIOS ${action} completed (exit code: ${result.code})`;
        return text(`BIOS ${action.toUpperCase()}\n${'─'.repeat(40)}\n${output}`);
      } catch (e) {
        return text(`BIOS ${action} error: ${e.message}`);
      }
    }

    // ==================== SERVER LIFECYCLE ====================
    case 'cognimesh_server': {
      const action = args?.action;

      if (action === 'start') {
        if (serverProcess && !serverProcess.killed) {
          return text(`Server already running (PID: ${serverProcess.pid})`);
        }

        try {
          serverProcess = spawn('node', [join(PROJECT_ROOT, 'src/index.js')], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: PROJECT_ROOT,
            detached: false,
            env: { ...process.env, NODE_ENV: 'development' }
          });

          let startOutput = '';
          serverProcess.stdout.on('data', d => { startOutput += d; });
          serverProcess.stderr.on('data', d => { startOutput += d; });

          // Wait briefly for startup
          await new Promise(r => setTimeout(r, 3000));

          if (serverProcess.killed || serverProcess.exitCode !== null) {
            return text(`Server failed to start:\n${startOutput}`);
          }

          return text(`Server started (PID: ${serverProcess.pid})\nListening on http://localhost:${process.env.COGNIMESH_PORT || 3000}`);
        } catch (e) {
          return text(`Server start error: ${e.message}`);
        }
      }

      if (action === 'stop') {
        if (!serverProcess || serverProcess.killed) {
          return text('Server is not running');
        }
        const pid = serverProcess.pid;
        serverProcess.kill('SIGTERM');
        serverProcess = null;
        return text(`Server stopped (PID: ${pid})`);
      }

      if (action === 'info') {
        const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
        const serverUp = serverProcess !== null && !serverProcess.killed;

        // Read config
        let configInfo = 'default';
        const envFile = join(PROJECT_ROOT, '.env');
        if (existsSync(envFile)) {
          const envContent = readFileSync(envFile, 'utf-8');
          const port = envContent.match(/COGNIMESH_PORT=(\d+)/)?.[1] || '3000';
          const host = envContent.match(/COGNIMESH_HOST=(\S+)/)?.[1] || 'localhost';
          configInfo = `${host}:${port}`;
        }

        return text(
          `CogniMesh Server Info\n` +
          `${'─'.repeat(40)}\n` +
          `Version: ${pkg.version}\n` +
          `Name: ${pkg.name}\n` +
          `Status: ${serverUp ? 'RUNNING (PID ' + serverProcess.pid + ')' : 'STOPPED'}\n` +
          `Endpoint: http://${configInfo}\n` +
          `Entry: ${pkg.main}\n` +
          `Scripts: ${Object.keys(pkg.scripts).join(', ')}\n` +
          `Dependencies: ${Object.keys(pkg.dependencies).length} runtime, ${Object.keys(pkg.devDependencies || {}).length} dev`
        );
      }

      return text(`Unknown server action: ${action}`);
    }

    // ==================== AGENTS ====================
    case 'cognimesh_agents': {
      const action = args?.action || 'list';

      // Load CV templates
      // Check both CV template locations
      let cvDir = join(PROJECT_ROOT, 'src/cv/templates');
      if (!existsSync(cvDir)) {
        cvDir = join(PROJECT_ROOT, 'src/bios/cv-templates');
      }
      if (!existsSync(cvDir)) {
        return text('No agent CV templates found');
      }

      const files = readdirSync(cvDir).filter(f => f.endsWith('.json'));

      if (action === 'list') {
        const agents = files.map(f => {
          try {
            const cv = JSON.parse(readFileSync(join(cvDir, f), 'utf-8'));
            return `${cv.id || f.replace('.json', '')} — ${cv.name || cv.role || 'Agent'}\n  Skills: ${(cv.skills || cv.capabilities || []).slice(0, 5).join(', ')}`;
          } catch {
            return `${f.replace('.json', '')} — (parse error)`;
          }
        });

        return text(
          `CogniMesh Agent Registry (${files.length} profiles)\n` +
          `${'─'.repeat(40)}\n` +
          agents.join('\n\n')
        );
      }

      if (action === 'inspect') {
        const agentId = args?.agentId;
        if (!agentId) {
          return text('Error: agentId is required for inspect');
        }

        const file = files.find(f => f.replace('.json', '') === agentId);
        if (!file) {
          return text(`Agent not found: ${agentId}. Available: ${files.map(f => f.replace('.json', '')).join(', ')}`);
        }

        const cv = JSON.parse(readFileSync(join(cvDir, file), 'utf-8'));
        return text(JSON.stringify(cv, null, 2));
      }

      return text(`Unknown agents action: ${action}`);
    }

    // ==================== CATALOG ====================
    case 'cognimesh_catalog': {
      const {
        getOperatorProviderCatalog,
        getCanonicalSubscriptionSurfaceMatrix,
        getDefaultFallbackChains,
        SUBSCRIPTION_FALLBACK_CHAINS
      } = await import('../clients/catalog.js');

      const providers = getOperatorProviderCatalog();
      const matrix = getCanonicalSubscriptionSurfaceMatrix();
      const chains = getDefaultFallbackChains();

      const providerLines = providers.map(p =>
        `${p.name} (${p.id}) — subscription-backed\n  Modes: ${p.supportedModes.join(', ')} | Preferred: ${p.preferredModes.join(', ')}`
      );

      const matrixLines = matrix.map(e =>
        `${e.name} → ${e.surfaces.join(', ')}`
      );

      const chainLines = Object.entries(chains).map(([name, models]) =>
        `${name}: ${models.join(' → ')}`
      );

      return text(
        `CogniMesh Provider Catalog\n` +
        `${'═'.repeat(50)}\n\n` +
        `PROVIDERS:\n${providerLines.join('\n')}\n\n` +
        `MODEL → SURFACE MATRIX:\n${matrixLines.join('\n')}\n\n` +
        `FALLBACK CHAINS:\n${chainLines.join('\n')}\n\n` +
        `Billing: subscription-only ($18-20/mo per provider)\n` +
        `costPer1kTokens = routing weights, NOT billing`
      );
    }

    // ==================== EXEC CLI ====================
    case 'cognimesh_exec': {
      const command = args?.command;
      if (!command) {
        return text('Error: command is required');
      }

      const parts = command.split(/\s+/);
      try {
        const result = await runCommand('node', [join(PROJECT_ROOT, 'src/bios/cli.js'), ...parts], {
          timeout: 30000
        });
        const output = result.stdout || result.stderr || `Command completed (exit code: ${result.code})`;
        return text(output);
      } catch (e) {
        return text(`Exec error: ${e.message}`);
      }
    }

    // ==================== ROUTE ====================
    case 'cognimesh_route': {
      const { ClientFactory } = await import('../clients/index.js');
      const prompt = args?.prompt;
      if (!prompt) {
        return text('Error: prompt is required');
      }

      const provider = args?.provider || 'claude';
      const mode = 'cli';

      try {
        const client = await ClientFactory.create(provider, mode);
        await client.initialize();
        const response = await client.send({ content: prompt }, { timeout: 60000 });
        const responseText = typeof response === 'string' ? response : response?.content || JSON.stringify(response);
        return text(responseText);
      } catch (e) {
        return text(`Route error (${provider}/${mode}): ${e.message}`);
      }
    }

    default:
      return text(`Unknown tool: ${name}`);
  }
});

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
