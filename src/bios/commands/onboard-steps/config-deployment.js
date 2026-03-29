/**
 * Deployment Mode Configuration Step
 */

import { createInterface } from 'readline';
import * as f from '../utils/formatters.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

const DEPLOYMENT_MODES = {
  local: {
    name: 'Local Development',
    description: 'Run locally with minimal setup',
    ports: { main: 3000, dashboard: 3001, ws: 8080 },
    features: ['File-based database', 'In-memory cache', 'Local file storage']
  },
  systemd: {
    name: 'System Service',
    description: 'Run as a systemd service (Linux)',
    ports: { main: 3000, dashboard: 3001, ws: 8080 },
    features: ['Auto-start on boot', 'System logging', 'Service management']
  },
  docker: {
    name: 'Docker Container',
    description: 'Run in Docker container',
    ports: { main: 3000, dashboard: 3001, ws: 8080 },
    features: ['Containerized deployment', 'Easy scaling', 'Isolated environment']
  }
};

export async function configureDeployment(options = {}) {
  const { yes = false, mode: providedMode, ports: providedPorts } = options;
  
  console.log(f.colorize('Configuring deployment mode...', 'cyan'));
  console.log();

  let selectedMode = providedMode;

  if (!yes && !providedMode) {
    console.log(f.colorize('Select deployment mode:', 'bright'));
    console.log();

    const modes = Object.entries(DEPLOYMENT_MODES);
    modes.forEach(([, config], idx) => {
      console.log(f.colorize(`  ${idx + 1}. ${config.name}`, 'cyan'));
      console.log(f.colorize(`     ${config.description}`, 'dim'));
      console.log(f.colorize(`     Features: ${config.features.join(', ')}`, 'dim'));
      console.log();
    });

    const choice = await question(f.colorize('  Select mode (1-3, default: 1): ', 'dim'));
    const choiceNum = parseInt(choice) || 1;
    selectedMode = modes[choiceNum - 1]?.[0] || 'local';
  } else {
    selectedMode = selectedMode || 'local';
  }

  const modeConfig = DEPLOYMENT_MODES[selectedMode];
  console.log(f.success(`Selected: ${modeConfig.name}`));
  console.log();

  // Configure ports
  console.log(f.colorize('Port configuration:', 'bright'));
  const ports = { ...modeConfig.ports };

  if (!yes) {
    for (const [service, defaultPort] of Object.entries(ports)) {
      const portInput = await question(f.colorize(`  ${service} port (default: ${defaultPort}): `, 'dim'));
      const portNum = parseInt(portInput);
      if (!isNaN(portNum) && portNum > 0 && portNum < 65536) {
        ports[service] = portNum;
      }
    }
  } else if (providedPorts) {
    Object.assign(ports, providedPorts);
  }

  console.log();
  console.log(f.colorize('Configured ports:', 'cyan'));
  Object.entries(ports).forEach(([service, port]) => {
    console.log(f.colorize(`  ${service}:`, 'cyan'), port);
  });

  console.log();

  return {
    success: true,
    data: { 
      step: 'config-deployment', 
      mode: selectedMode,
      modeName: modeConfig.name,
      ports
    },
    message: `Deployment mode: ${modeConfig.name}`
  };
}

export default configureDeployment;
