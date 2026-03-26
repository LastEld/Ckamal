#!/usr/bin/env node
/**
 * CogniMesh MCP Server
 * Exposes provider discovery, model routing, and health status via MCP protocol.
 * Connects Claude Code / Claude Desktop to all CogniMesh surfaces.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'cognimesh', version: '5.0.0' },
  { capabilities: { tools: {} } }
);

// Tool definitions
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
    }
  ]
}));

// Tool implementations
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
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
      return {
        content: [{
          type: 'text',
          text: `CogniMesh v5.0 — ${ready}/${surfaces.length} surfaces ready\n\n` +
            results.map(r => `${r.status === 'ready' ? '✓' : '○'} ${r.surface}${r.endpoint ? ` → ${r.endpoint}` : ''}`).join('\n')
        }]
      };
    }

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

      return {
        content: [{
          type: 'text',
          text: discovered.length > 0
            ? `Discovered ${discovered.length} surfaces:\n${discovered.join('\n')}`
            : 'No surfaces discovered. Ensure Claude CLI, Codex CLI, or Kimi CLI are installed.'
        }]
      };
    }

    case 'cognimesh_models': {
      const { getCanonicalSubscriptionSurfaceMatrix, getSubscriptionModelProfiles } = await import('../clients/catalog.js');
      const matrix = getCanonicalSubscriptionSurfaceMatrix();
      const profiles = getSubscriptionModelProfiles();

      const lines = Object.entries(matrix).map(([model, surfaces]) => {
        const profile = profiles[model];
        const provider = profile?.provider || 'unknown';
        return `${model} (${provider}) → ${surfaces.join(', ')}`;
      });

      return {
        content: [{
          type: 'text',
          text: `CogniMesh Subscription Model Matrix (7 models, 3 providers):\n\n${lines.join('\n')}\n\nAll models route through local subscriptions. No API billing.`
        }]
      };
    }

    case 'cognimesh_route': {
      const { ClientFactory } = await import('../clients/index.js');
      const prompt = args?.prompt;
      if (!prompt) {
        return { content: [{ type: 'text', text: 'Error: prompt is required' }] };
      }

      const provider = args?.provider || 'claude';
      const mode = provider === 'codex' ? 'cli' : 'cli';

      try {
        const client = await ClientFactory.create(provider, mode);
        await client.initialize();
        const response = await client.send({ content: prompt }, { timeout: 60000 });
        const text = typeof response === 'string' ? response : response?.content || JSON.stringify(response);
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Route error (${provider}/${mode}): ${e.message}` }] };
      }
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
});

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
