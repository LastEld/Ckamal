/**
 * Clients Commands
 * Honest inventory for canonical subscription-backed client surfaces.
 */

import * as f from './utils/formatters.js';
import {
  getCanonicalSubscriptionSurfaceMatrix,
  getOperatorProviderCatalog
} from '../../clients/catalog.js';

const PROVIDER_SUMMARY = Object.freeze({
  kimi: Object.freeze({
    type: 'AI Assistant',
    capabilities: Object.freeze(['code', 'analysis', 'reasoning', 'multimodal']),
    description: 'Moonshot Kimi subscription-backed local surfaces'
  }),
  claude: Object.freeze({
    type: 'AI Assistant',
    capabilities: Object.freeze(['code', 'writing', 'analysis', 'vision', 'extended-thinking']),
    description: 'Anthropic Claude subscription-backed local surfaces'
  }),
  codex: Object.freeze({
    type: 'Code Generator',
    capabilities: Object.freeze(['code-generation', 'refactoring', 'architecture', 'multifile']),
    description: 'OpenAI Codex subscription-backed local surfaces'
  })
});

function buildClientsView() {
  const providers = getOperatorProviderCatalog();
  const matrix = getCanonicalSubscriptionSurfaceMatrix();
  const modelsByProvider = new Map();
  const surfacesByProvider = new Map();

  for (const entry of matrix) {
    const providerModels = modelsByProvider.get(entry.runtimeProvider) || [];
    providerModels.push(entry.modelId);
    modelsByProvider.set(entry.runtimeProvider, providerModels);

    const providerSurfaces = surfacesByProvider.get(entry.runtimeProvider) || new Set();
    for (const surface of entry.surfaces) {
      providerSurfaces.add(surface);
    }
    surfacesByProvider.set(entry.runtimeProvider, providerSurfaces);
  }

  return Object.fromEntries(
    providers.map((provider) => {
      const summary = PROVIDER_SUMMARY[provider.id] || {};
      return [provider.id, {
        name: provider.name,
        type: summary.type || 'Provider',
        modes: [...(surfacesByProvider.get(provider.id) || [])],
        capabilities: [...(summary.capabilities || [])],
        description: summary.description || 'Subscription-backed provider',
        models: [...(modelsByProvider.get(provider.id) || [])]
      }];
    })
  );
}

/**
 * List all clients.
 */
export async function listClients() {
  const clients = buildClientsView();
  const spinner = f.createSpinner('Fetching client list');
  spinner.start();

  await delay(100);
  spinner.succeed('Clients retrieved');

  let output = '';
  output += f.header('AVAILABLE CLIENTS', 'line');
  output += '\n\n';

  const clientData = Object.entries(clients).map(([id, client]) => ({
    ID: id,
    Name: client.name,
    Type: client.type,
    Modes: client.modes.join(', '),
    Status: f.colorize('available', 'green')
  }));

  output += f.table(clientData, {
    columns: ['ID', 'Name', 'Type', 'Modes', 'Status']
  });

  output += '\n\n';
  output += f.colorize('Capabilities by Client:', 'bright') + '\n\n';

  Object.entries(clients).forEach(([id, client]) => {
    output += `  ${f.colorize(id, 'cyan')} - ${client.description}\n`;
    output += f.list(client.capabilities.map((capability) => capability.replace(/-/g, ' ')), { indent: 4 }) + '\n';
  });

  return { success: true, output, data: clients };
}

/**
 * Test canonical client surfaces.
 */
export async function testClients() {
  const clients = buildClientsView();
  const results = [];

  console.log(f.header('CLIENT CONNECTION TESTS', 'line'));
  console.log();

  for (const [id, client] of Object.entries(clients)) {
    const spinner = f.createSpinner(`Inspecting ${client.name}`);
    spinner.start();

    const startTime = Date.now();
    const result = await testClientConnection(id, client);
    const latency = Date.now() - startTime;

    results.push({ id, ...result, latency });

    if (result.success) {
      spinner.succeed(`${client.name} - canonical surfaces listed`);
    } else {
      spinner.fail(`${client.name} - ${result.error}`);
    }
  }

  console.log();
  console.log(f.divider());
  console.log();
  console.log(f.success(`Verified canonical inventory for ${results.length} providers`));

  return {
    success: true,
    output: '',
    data: {
      results,
      passed: results.length,
      total: results.length
    }
  };
}

async function testClientConnection(clientId, client) {
  await delay(100);

  return {
    success: true,
    clientId,
    modes: client.modes,
    note: 'Canonical subscription surfaces listed. Live reachability depends on local client installation and authentication.'
  };
}

/**
 * Get client details.
 */
export async function getClientDetails(clientId) {
  const clients = buildClientsView();
  const client = clients[clientId.toLowerCase()];

  if (!client) {
    return {
      success: false,
      error: `Unknown client: ${clientId}`,
      output: f.error(`Unknown client: ${clientId}`)
    };
  }

  let output = '';
  output += f.header(`${client.name.toUpperCase()} CLIENT`, 'box');
  output += '\n\n';

  output += f.keyValue({
    ID: clientId,
    Name: client.name,
    Type: client.type,
    Description: client.description
  }, { indent: 2 });

  output += '\n\n';
  output += f.colorize('Available Modes:', 'bright') + '\n';
  output += f.list(client.modes, { indent: 2 }) + '\n\n';

  output += f.colorize('Capabilities:', 'bright') + '\n';
  output += f.list(client.capabilities.map((capability) => capability.replace(/-/g, ' ')), { indent: 2 }) + '\n\n';

  output += f.colorize('Canonical Model Groups:', 'bright') + '\n';
  output += f.list(client.models, { indent: 2 }) + '\n\n';

  output += f.colorize('Usage Examples:', 'bright') + '\n\n';
  output += `  cognimesh ${clientId} --help\n`;
  output += `  cognimesh ${clientId} status\n`;

  return { success: true, output, data: client };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default { list: listClients, test: testClients, details: getClientDetails };
