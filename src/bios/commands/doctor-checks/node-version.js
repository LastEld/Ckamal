/**
 * Node.js Version Check
 * Validates Node.js version meets minimum requirements
 */

import * as f from '../utils/formatters.js';  // eslint-disable-line no-unused-vars

const MIN_NODE_VERSION = 18;

/**
 * Check Node.js version
 * @returns {Promise<Object>} Check result
 */
export async function checkNodeVersion() {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

  if (majorVersion < MIN_NODE_VERSION) {
    return {
      name: 'Node.js Version',
      status: 'fail',
      message: `Node.js ${MIN_NODE_VERSION}+ required, found ${nodeVersion}`,
      canRepair: false,
      repairHint: `Upgrade Node.js to version ${MIN_NODE_VERSION} or higher (https://nodejs.org)`,
      details: { current: nodeVersion, required: `>=${MIN_NODE_VERSION}.0.0` }
    };
  }

  return {
    name: 'Node.js Version',
    status: 'pass',
    message: `Node.js ${nodeVersion} (>=${MIN_NODE_VERSION})`,
    details: { version: nodeVersion, major: majorVersion }
  };
}

export default checkNodeVersion;
