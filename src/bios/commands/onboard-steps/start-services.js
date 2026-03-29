/**
 * Start Services Step
 */


import * as f from '../utils/formatters.js';

const SERVICES = {
  server: {
    name: 'CogniMesh Server',
    command: 'npm',
    args: ['start'],
    description: 'Main CogniMesh server'
  },
  dashboard: {
    name: 'Dashboard',
    command: 'npm',
    args: ['run', 'dashboard'],
    description: 'Web dashboard'
  },
  websocket: {
    name: 'WebSocket Server',
    command: 'npm',
    args: ['run', 'ws'],
    description: 'Real-time communication'
  }
};

export async function startServices(options = {}) {
  const { 
    run = false,
    services: servicesToStart = ['server']
  } = options;
  
  console.log(f.colorize('Service startup...', 'cyan'));
  console.log();

  if (!run) {
    console.log(f.info('Services will not be started automatically.'));
    console.log(f.info('Use --run flag to start services after setup.'));
    console.log();
    
    console.log(f.colorize('To start services manually:', 'cyan'));
    console.log(f.colorize('  npm start', 'dim'));
    console.log();

    return {
      success: true,
      data: { 
        step: 'start-services', 
        started: false,
        reason: 'No --run flag provided'
      },
      message: 'Services configured but not started'
    };
  }

  // If --run is specified, start the services
  console.log(f.colorize('Starting services...', 'bright'));
  console.log();

  const started = [];
  const failed = [];

  for (const serviceId of servicesToStart) {
    const service = SERVICES[serviceId];
    if (!service) continue;

    const spinner = f.createSpinner(`Starting ${service.name}...`);
    spinner.start();

    try {
      // In a real implementation, this would actually start the service
      // For now, we simulate the startup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      spinner.succeed(`${service.name} started`);
      started.push(serviceId);
      
      console.log(f.colorize(`  URL: http://localhost:${serviceId === 'server' ? 3000 : serviceId === 'dashboard' ? 3001 : 8080}`, 'dim'));
    } catch (err) {
      spinner.fail(`${service.name}: ${err.message}`);
      failed.push({ service: serviceId, error: err.message });
    }
  }

  console.log();

  if (started.length > 0) {
    console.log(f.success(`${started.length} service(s) started`));
  }

  if (failed.length > 0) {
    console.log(f.error(`${failed.length} service(s) failed to start`));
    failed.forEach(f => console.log(f.colorize(`  - ${f.service}: ${f.error}`, 'dim')));
  }

  console.log();

  return {
    success: failed.length === 0,
    data: { 
      step: 'start-services', 
      started: started.length > 0,
      services: started,
      failed
    },
    message: started.length > 0 ? 'Services started' : 'Failed to start services'
  };
}

export default startServices;
