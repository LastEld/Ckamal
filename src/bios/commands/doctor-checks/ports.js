/**
 * Port Availability Check
 * Validates required ports are available
 */

import * as f from '../utils/formatters.js';  // eslint-disable-line no-unused-vars
import { createServer } from 'net';

const REQUIRED_PORTS = [
  { port: 3000, name: 'CogniMesh Server', required: false, env: 'COGNIMESH_PORT' },
  { port: 8080, name: 'WebSocket Server', required: false, env: 'WS_PORT' },
  { port: 3001, name: 'Dashboard', required: false, env: 'DASHBOARD_PORT' },
  { port: 8200, name: 'Vault (optional)', required: false, env: 'VAULT_PORT' }
];

/**
 * Check port availability
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check result
 */
export async function checkPorts(_options = {}) {
  const results = [];
  let unavailableCount = 0;
  let unavailableRequired = 0;

  for (const config of REQUIRED_PORTS) {
    // Check if custom port is configured
    const customPort = process.env[config.env];
    const portToCheck = customPort ? parseInt(customPort, 10) : config.port;

    const isAvailable = await checkPortAvailable(portToCheck);
    const result = {
      port: portToCheck,
      name: config.name,
      required: config.required,
      available: isAvailable
    };

    results.push(result);

    if (!isAvailable) {
      unavailableCount++;
      if (config.required) unavailableRequired++;
    }
  }

  if (unavailableRequired > 0) {
    const unavailable = results.filter(r => !r.available && r.required);
    return {
      name: 'Port Availability',
      status: 'fail',
      message: `${unavailableRequired} required port(s) in use`,
      canRepair: false,
      repairHint: `Free up ports: ${unavailable.map(r => r.port).join(', ')} or configure alternatives`,
      details: { ports: results }
    };
  }

  if (unavailableCount > 0) {
    const unavailable = results.filter(r => !r.available);
    return {
      name: 'Port Availability',
      status: 'warn',
      message: `${unavailableCount} port(s) in use (${unavailable.map(r => r.port).join(', ')})`,
      canRepair: false,
      repairHint: 'Some optional ports are in use. CogniMesh may use alternative ports.',
      details: { ports: results }
    };
  }

  return {
    name: 'Port Availability',
    status: 'pass',
    message: `${results.length} ports available`,
    details: { ports: results }
  };
}

/**
 * Check if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} True if available
 */
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, '0.0.0.0');
  });
}

export default checkPorts;
