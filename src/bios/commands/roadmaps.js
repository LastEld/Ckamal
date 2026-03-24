/**
 * Roadmaps Commands
 * Create and manage project roadmaps
 */

import * as f from './utils/formatters.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Roadmap storage
const roadmapsStore = new Map();
let roadmapIdCounter = 1;

/**
 * Create a new roadmap
 */
export async function createRoadmap(name, options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Roadmap name is required',
      output: f.error('Roadmap name is required. Usage: cognimesh roadmaps create "<name>"')
    };
  }

  const spinner = f.createSpinner('Creating roadmap');
  spinner.start();

  await delay(400);

  const roadmap = {
    id: `RM-${String(roadmapIdCounter++).padStart(3, '0')}`,
    name,
    description: options.description || '',
    status: 'draft',
    phases: options.phases ? JSON.parse(options.phases) : [
      { name: 'Phase 1: Planning', status: 'pending', tasks: [] },
      { name: 'Phase 2: Development', status: 'pending', tasks: [] },
      { name: 'Phase 3: Testing', status: 'pending', tasks: [] },
      { name: 'Phase 4: Deployment', status: 'pending', tasks: [] }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetDate: options.target || null
  };

  roadmapsStore.set(roadmap.id, roadmap);

  // Save to file if specified
  if (options.output) {
    writeFileSync(options.output, JSON.stringify(roadmap, null, 2));
  }

  spinner.succeed(`Roadmap created: ${roadmap.id}`);

  let output = '\n';
  output += f.success(`Roadmap created successfully`) + '\n\n';
  
  output += f.box(
    f.keyValue({
      'ID': roadmap.id,
      'Name': roadmap.name,
      'Description': roadmap.description || 'None',
      'Status': f.colorize(roadmap.status, 'cyan'),
      'Phases': roadmap.phases.length,
      'Created': new Date(roadmap.createdAt).toLocaleString()
    }), { title: 'Roadmap Details', width: 60 }
  );

  output += '\n\n';
  output += f.colorize('Phases:', 'bright') + '\n';
  
  roadmap.phases.forEach((phase, idx) => {
    const statusIcon = phase.status === 'completed' ? f.colorize('✓', 'green') : 
                       phase.status === 'in-progress' ? f.colorize('▶', 'blue') : 
                       f.colorize('○', 'dim');
    output += `  ${statusIcon} ${phase.name}\n`;
  });

  if (options.output) {
    output += '\n' + f.info(`Saved to: ${options.output}`);
  }

  return { success: true, output, data: roadmap };
}

/**
 * List all roadmaps
 */
export async function listRoadmaps(options = {}) {
  const spinner = f.createSpinner('Fetching roadmaps');
  spinner.start();

  await delay(200);

  const roadmaps = Array.from(roadmapsStore.values());
  
  // Add sample roadmaps if empty
  if (roadmaps.length === 0) {
    roadmaps.push(
      { 
        id: 'RM-001', 
        name: 'CogniMesh v6.0', 
        status: 'active',
        phases: [
          { name: 'Planning', status: 'completed' },
          { name: 'Development', status: 'in-progress' },
          { name: 'Testing', status: 'pending' }
        ],
        createdAt: new Date().toISOString()
      },
      { 
        id: 'RM-002', 
        name: 'Security Hardening', 
        status: 'draft',
        phases: [
          { name: 'Audit', status: 'pending' },
          { name: 'Implementation', status: 'pending' }
        ],
        createdAt: new Date().toISOString()
      }
    );
  }

  spinner.succeed(`Found ${roadmaps.length} roadmaps`);

  let output = '\n';
  output += f.header('ROADMAPS', 'line');
  output += '\n\n';

  if (roadmaps.length === 0) {
    output += f.info('No roadmaps found');
    return { success: true, output, data: [] };
  }

  const roadmapData = roadmaps.map(rm => {
    const completed = rm.phases.filter(p => p.status === 'completed').length;
    const progress = Math.round((completed / rm.phases.length) * 100);
    
    return {
      ID: rm.id,
      Name: rm.name.length > 25 ? rm.name.substring(0, 22) + '...' : rm.name,
      Status: formatRoadmapStatus(rm.status),
      Progress: f.progressBar(progress, 100, { width: 15, showPercent: true }),
      Created: new Date(rm.createdAt).toLocaleDateString()
    };
  });

  output += f.table(roadmapData, {
    columns: ['ID', 'Name', 'Status', 'Progress', 'Created']
  });

  return { success: true, output, data: roadmaps };
}

/**
 * Get roadmap details
 */
export async function getRoadmap(roadmapId, options = {}) {
  const roadmap = roadmapsStore.get(roadmapId);
  
  if (!roadmap) {
    // Check samples
    if (roadmapId === 'RM-001' || roadmapId === 'RM-002') {
      return getSampleRoadmap(roadmapId);
    }
    
    return {
      success: false,
      error: `Roadmap not found: ${roadmapId}`,
      output: f.error(`Roadmap not found: ${roadmapId}`)
    };
  }

  return formatRoadmapDetails(roadmap);
}

/**
 * Update roadmap
 */
export async function updateRoadmap(roadmapId, updates, options = {}) {
  const roadmap = roadmapsStore.get(roadmapId);
  
  if (!roadmap) {
    return {
      success: false,
      error: `Roadmap not found: ${roadmapId}`,
      output: f.error(`Roadmap not found: ${roadmapId}`)
    };
  }

  if (updates.name) roadmap.name = updates.name;
  if (updates.description) roadmap.description = updates.description;
  if (updates.status) roadmap.status = updates.status;
  if (updates.targetDate) roadmap.targetDate = updates.targetDate;
  
  roadmap.updatedAt = new Date().toISOString();

  return {
    success: true,
    output: f.success(`Roadmap ${roadmapId} updated`),
    data: roadmap
  };
}

/**
 * Delete roadmap
 */
export async function deleteRoadmap(roadmapId, options = {}) {
  if (!roadmapsStore.has(roadmapId)) {
    return {
      success: false,
      error: `Roadmap not found: ${roadmapId}`,
      output: f.error(`Roadmap not found: ${roadmapId}`)
    };
  }

  roadmapsStore.delete(roadmapId);

  return {
    success: true,
    output: f.success(`Roadmap ${roadmapId} deleted`),
    data: { id: roadmapId }
  };
}

// Helper functions
function formatRoadmapStatus(status) {
  const colors = {
    draft: f.colorize('draft', 'dim'),
    active: f.colorize('active', 'green'),
    completed: f.colorize('completed', 'cyan'),
    archived: f.colorize('archived', 'yellow')
  };
  return colors[status] || status;
}

function formatRoadmapDetails(roadmap) {
  let output = '\n';
  output += f.header(roadmap.name.toUpperCase(), 'box');
  output += '\n\n';

  output += f.keyValue({
    'ID': roadmap.id,
    'Name': roadmap.name,
    'Description': roadmap.description || 'None',
    'Status': formatRoadmapStatus(roadmap.status),
    'Created': new Date(roadmap.createdAt).toLocaleString()
  }, { indent: 2 });

  output += '\n\n';
  output += f.colorize('Phases:', 'bright') + '\n\n';

  roadmap.phases.forEach((phase, idx) => {
    const statusIcon = phase.status === 'completed' ? f.colorize('✓', 'green') : 
                       phase.status === 'in-progress' ? f.colorize('▶', 'blue') : 
                       f.colorize('○', 'dim');
    
    output += `  ${statusIcon} ${phase.name}\n`;
    
    if (phase.tasks && phase.tasks.length > 0) {
      phase.tasks.forEach(task => {
        output += `      ${f.colorize('•', 'dim')} ${task}\n`;
      });
    }
  });

  const completed = roadmap.phases.filter(p => p.status === 'completed').length;
  const progress = Math.round((completed / roadmap.phases.length) * 100);
  
  output += '\n';
  output += f.colorize('Overall Progress:', 'bright') + '\n';
  output += '  ' + f.progressBar(progress, 100, { width: 40 }) + '\n';

  return { success: true, output, data: roadmap };
}

function getSampleRoadmap(id) {
  const sample = {
    'RM-001': {
      id: 'RM-001',
      name: 'CogniMesh v6.0',
      description: 'Major version upgrade with enhanced CLI',
      status: 'active',
      phases: [
        { name: 'Planning', status: 'completed', tasks: ['Define scope', 'Create architecture'] },
        { name: 'Development', status: 'in-progress', tasks: ['CLI enhancement', 'API updates'] },
        { name: 'Testing', status: 'pending', tasks: ['Unit tests', 'Integration tests'] },
        { name: 'Deployment', status: 'pending', tasks: ['Staging', 'Production'] }
      ],
      createdAt: new Date().toISOString()
    },
    'RM-002': {
      id: 'RM-002',
      name: 'Security Hardening',
      description: 'Security audit and improvements',
      status: 'draft',
      phases: [
        { name: 'Audit', status: 'pending', tasks: ['Code review', 'Penetration testing'] },
        { name: 'Implementation', status: 'pending', tasks: ['Fix vulnerabilities', 'Add monitoring'] }
      ],
      createdAt: new Date().toISOString()
    }
  };
  
  return formatRoadmapDetails(sample[id]);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  create: createRoadmap,
  list: listRoadmaps,
  get: getRoadmap,
  update: updateRoadmap,
  delete: deleteRoadmap
};
