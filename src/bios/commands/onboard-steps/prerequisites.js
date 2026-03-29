/**
 * Prerequisites Step - Check Node.js, Git, and other requirements
 */

import { execSync } from 'child_process';
import * as f from '../utils/formatters.js';

const MIN_NODE_VERSION = 18;
const MIN_NPM_VERSION = 8;

function parseVersion(versionString) {
  const match = versionString.match(/v?(\d+)\.\d+\.\d+/);
  return match ? parseInt(match[1]) : 0;
}

export async function checkPrerequisites(options = {}) {
  const { skipOnFailure = false } = options;
  const results = {
    node: { ok: false, version: null, required: `>=${MIN_NODE_VERSION}` },
    npm: { ok: false, version: null, required: `>=${MIN_NPM_VERSION}` },
    git: { ok: false, version: null, required: 'any' }
  };
  
  console.log(f.colorize('Checking prerequisites...', 'cyan'));
  console.log();

  // Check Node.js
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    const majorVersion = parseVersion(nodeVersion);
    results.node.version = nodeVersion;
    results.node.ok = majorVersion >= MIN_NODE_VERSION;
    
    if (results.node.ok) {
      console.log(f.success(`Node.js ${nodeVersion} (v${MIN_NODE_VERSION}+ required)`));
    } else {
      console.log(f.error(`Node.js ${nodeVersion} (v${MIN_NODE_VERSION}+ required)`));
    }
  } catch {
    console.log(f.error('Node.js not found. Please install Node.js v18+'));
    results.node.ok = false;
  }

  // Check npm
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    const majorVersion = parseInt(npmVersion.split('.')[0]);
    results.npm.version = npmVersion;
    results.npm.ok = majorVersion >= MIN_NPM_VERSION;
    
    if (results.npm.ok) {
      console.log(f.success(`npm v${npmVersion} (v${MIN_NPM_VERSION}+ required)`));
    } else {
      console.log(f.error(`npm v${npmVersion} (v${MIN_NPM_VERSION}+ required)`));
    }
  } catch {
    console.log(f.error('npm not found. Please install npm'));
    results.npm.ok = false;
  }

  // Check Git
  try {
    const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
    results.git.version = gitVersion.replace('git version ', '');
    results.git.ok = true;
    console.log(f.success(`Git ${results.git.version}`));
  } catch {
    console.log(f.error('Git not found. Please install Git'));
    results.git.ok = false;
  }

  console.log();

  // Determine overall status
  const allOk = results.node.ok && results.npm.ok && results.git.ok;
  
  if (allOk) {
    return { 
      success: true, 
      data: { step: 'prerequisites', results },
      message: 'All prerequisites met'
    };
  }

  if (skipOnFailure) {
    console.log(f.warning('Some prerequisites missing, continuing anyway (--yes mode)'));
    return { 
      success: true, 
      data: { step: 'prerequisites', results, skipped: true },
      message: 'Prerequisites check skipped'
    };
  }

  return { 
    success: false, 
    data: { step: 'prerequisites', results },
    message: 'Prerequisites not met. Please install missing dependencies.'
  };
}

export default checkPrerequisites;
