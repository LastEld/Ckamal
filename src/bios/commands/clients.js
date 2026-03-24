/**
 * Clients Commands
 * List, test, and manage client connections
 */

import * as f from './utils/formatters.js';

// Available clients
const CLIENTS = {
  kimi: {
    name: 'Kimi AI',
    type: 'AI Assistant',
    modes: ['cli', 'ide', 'swarm'],
    capabilities: ['code', 'analysis', 'reasoning', 'multimodal'],
    description: 'Moonshot AI assistant'
  },
  claude: {
    name: 'Claude',
    type: 'AI Assistant',
    modes: ['cli', 'desktop', 'ide', 'mcp'],
    capabilities: ['code', 'writing', 'analysis', 'vision', 'extended-thinking'],
    description: 'Anthropic AI assistant'
  },
  codex: {
    name: 'GPT Codex',
    type: 'Code Generator',
    modes: ['cli', 'copilot', 'cursor', 'vscode'],
    capabilities: ['code-generation', 'refactoring', 'architecture', 'batch-processing'],
    description: 'OpenAI code generation'
  }
};

/**
 * List all clients
 */
export async function listClients(options = {}) {
  const spinner = f.createSpinner('Fetching client list');
  spinner.start();

  await delay(200);
  spinner.succeed('Clients retrieved');

  let output = '';
  output += f.header('AVAILABLE CLIENTS', 'line');
  output += '\n\n';

  const clientData = Object.entries(CLIENTS).map(([id, client]) => ({
    ID: id,
    Name: client.name,
    Type: client.type,
    Modes: client.modes.join(', '),
    Status: f.colorize('● available', 'green')
  }));

  output += f.table(clientData, {
    columns: ['ID', 'Name', 'Type', 'Modes', 'Status']
  });

  output += '\n\n';
  output += f.colorize('Capabilities by Client:', 'bright') + '\n\n';

  Object.entries(CLIENTS).forEach(([id, client]) => {
    output += `  ${f.colorize(id, 'cyan')} - ${client.description}\n`;
    output += f.list(client.capabilities.map(c => c.replace(/-/g, ' ')), { indent: 4 }) + '\n';
  });

  return { success: true, output, data: CLIENTS };
}

/**
 * Test all client connections
 */
export async function testClients(options = {}) {
  const results = [];
  
  console.log(f.header('CLIENT CONNECTION TESTS', 'line'));
  console.log();

  for (const [id, client] of Object.entries(CLIENTS)) {
    const spinner = f.createSpinner(`Testing ${client.name}`);
    spinner.start();
    
    const startTime = Date.now();
    const result = await testClientConnection(id);
    const latency = Date.now() - startTime;
    
    results.push({ id, ...result, latency });
    
    if (result.success) {
      spinner.succeed(`${client.name} - ${latency}ms`);
    } else {
      spinner.fail(`${client.name} - ${result.error}`);
    }
  }

  console.log();
  console.log(f.divider());
  console.log();

  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  if (passed === total) {
    console.log(f.success(`All ${total} clients connected successfully`));
  } else {
    console.log(f.warning(`${passed}/${total} clients connected`));
  }

  return { 
    success: passed === total, 
    output: '',
    data: { results, passed, total }
  };
}

/**
 * Test specific client connection
 */
async function testClientConnection(clientId) {
  // Simulate connection test
  await delay(300 + Math.random() * 400);
  
  // Simulate occasional failures for demo
  if (Math.random() > 0.9) {
    return { success: false, error: 'Connection timeout' };
  }
  
  return { success: true, clientId };
}

/**
 * Get client details
 */
export async function getClientDetails(clientId, options = {}) {
  const client = CLIENTS[clientId.toLowerCase()];
  
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
    'ID': clientId,
    'Name': client.name,
    'Type': client.type,
    'Description': client.description
  }, { indent: 2 });
  
  output += '\n\n';
  output += f.colorize('Available Modes:', 'bright') + '\n';
  output += f.list(client.modes, { indent: 2 }) + '\n\n';
  
  output += f.colorize('Capabilities:', 'bright') + '\n';
  output += f.list(client.capabilities.map(c => c.replace(/-/g, ' ')), { indent: 2 }) + '\n\n';

  // Show usage examples
  output += f.colorize('Usage Examples:', 'bright') + '\n\n';
  output += `  cognimesh ${clientId} --help\n`;
  output += `  cognimesh ${clientId} status\n`;
  
  return { success: true, output, data: client };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { list: listClients, test: testClients, details: getClientDetails };
