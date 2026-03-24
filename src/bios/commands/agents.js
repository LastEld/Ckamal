/**
 * Agent control-plane commands
 * Lists and inspects BIOS bootstrap agents.
 */

import * as f from './utils/formatters.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveModelRuntime } from '../../clients/catalog.js';

export const DEFAULT_AGENT_ROSTER = Object.freeze([
  Object.freeze({
    id: 'sa-00',
    name: 'Coordinator',
    role: 'control-plane',
    client: 'claude',
    runtime: 'claude-sonnet-4-6',
    status: 'active',
    purpose: 'Routes operator requests and coordinates work across the system.',
    responsibilities: Object.freeze([
      'policy enforcement',
      'task routing',
      'operator handoff'
    ]),
    capabilities: Object.freeze([
      'delegation',
      'planning',
      'coordination'
    ]),
    metrics: Object.freeze({
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksInFlight: 0
    })
  }),
  Object.freeze({
    id: 'sa-01',
    name: 'Context Steward',
    role: 'context-management',
    client: 'kimi',
    runtime: 'kimi-k2-5',
    status: 'standby',
    purpose: 'Maintains long-context state, notes, and cross-task continuity.',
    responsibilities: Object.freeze([
      'context tracking',
      'state capture',
      'source bundling'
    ]),
    capabilities: Object.freeze([
      'long-context',
      'summarization',
      'multimodal review'
    ]),
    metrics: Object.freeze({
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksInFlight: 0
    })
  }),
  Object.freeze({
    id: 'sa-02',
    name: 'Execution Lead',
    role: 'implementation',
    client: 'codex',
    runtime: 'gpt-5.4-codex',
    status: 'active',
    purpose: 'Handles implementation, batch edits, and code-level changes.',
    responsibilities: Object.freeze([
      'implementation',
      'refactoring',
      'code inspection'
    ]),
    capabilities: Object.freeze([
      'code generation',
      'refactoring',
      'batch editing'
    ]),
    metrics: Object.freeze({
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksInFlight: 0
    })
  })
]);

const DEFAULT_STATE_PATH = join(process.cwd(), 'state', 'agents.json');

export function loadAgentRoster(options = {}) {
  const statePath = options.statePath || process.env.BIOS_AGENT_STATE_PATH || DEFAULT_STATE_PATH;

  if (existsSync(statePath)) {
    try {
      const raw = JSON.parse(readFileSync(statePath, 'utf-8'));
      const sourceAgents = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.agents)
          ? raw.agents
          : [];

      return {
        source: 'state',
        statePath,
        agents: sourceAgents.map((agent, index) => normalizeAgent(agent, index))
      };
    } catch (error) {
      return {
        source: 'bootstrap',
        statePath,
        warning: error.message,
        agents: DEFAULT_AGENT_ROSTER.map((agent, index) => normalizeAgent(agent, index))
      };
    }
  }

  return {
    source: 'bootstrap',
    statePath,
    agents: DEFAULT_AGENT_ROSTER.map((agent, index) => normalizeAgent(agent, index))
  };
}

export async function listAgents(options = {}) {
  const roster = loadAgentRoster(options);
  const agents = applyFilters(roster.agents, options);
  const active = agents.filter((agent) => ['active', 'running', 'ready'].includes(agent.status)).length;

  let output = '';
  output += f.header('AGENT CONTROL PLANE', 'line');
  output += '\n\n';
  output += f.keyValue({
    Source: roster.source,
    Total: agents.length,
    Active: active,
    StatePath: roster.statePath
  }, { indent: 2 });
  output += '\n\n';

  const rows = agents.map((agent) => ({
    ID: agent.id,
    Name: agent.name,
    Role: agent.role,
    Client: agent.client,
    Runtime: agent.runtime,
    Status: agent.status,
    'Task Load': String(agent.metrics?.tasksInFlight ?? 0)
  }));

  output += f.table(rows, {
    columns: ['ID', 'Name', 'Role', 'Client', 'Runtime', 'Status', 'Task Load']
  });

  return {
    success: true,
    output,
    data: {
      source: roster.source,
      statePath: roster.statePath,
      agents
    }
  };
}

export async function inspectAgent(agentId, options = {}) {
  if (!agentId) {
    return {
      success: false,
      error: 'Agent ID is required',
      output: f.error('Agent ID is required. Usage: cognimesh agents inspect <agent-id>')
    };
  }

  const roster = loadAgentRoster(options);
  const agent = roster.agents.find((entry) => {
    const needle = agentId.toLowerCase();
    return entry.id.toLowerCase() === needle || entry.name.toLowerCase() === needle;
  });

  if (!agent) {
    return {
      success: false,
      error: `Agent not found: ${agentId}`,
      output: f.error(`Agent not found: ${agentId}`)
    };
  }

  const runtime = agent.runtime ? resolveModelRuntime(agent.runtime) : null;

  let output = '';
  output += f.header(agent.name.toUpperCase(), 'box');
  output += '\n\n';
  output += f.keyValue({
    ID: agent.id,
    Name: agent.name,
    Role: agent.role,
    Status: agent.status,
    Client: agent.client,
    Runtime: agent.runtime,
    Purpose: agent.purpose,
    Source: roster.source,
    'Tasks Completed': String(agent.metrics?.tasksCompleted ?? 0),
    'Tasks Failed': String(agent.metrics?.tasksFailed ?? 0),
    'Tasks In Flight': String(agent.metrics?.tasksInFlight ?? 0)
  }, { indent: 2 });

  if (runtime) {
    output += '\n\n';
    output += f.colorize('Runtime Binding', 'bright') + '\n';
    output += f.keyValue({
      Provider: runtime.provider,
      Mode: runtime.mode,
      ClientModel: runtime.clientModel,
      Billing: 'subscription'
    }, { indent: 2 });
  }

  if (agent.responsibilities?.length) {
    output += '\n\n';
    output += f.colorize('Responsibilities', 'bright') + '\n';
    output += f.list(agent.responsibilities, { indent: 2 }) + '\n';
  }

  if (agent.capabilities?.length) {
    output += '\n';
    output += f.colorize('Capabilities', 'bright') + '\n';
    output += f.list(agent.capabilities, { indent: 2 }) + '\n';
  }

  return {
    success: true,
    output,
    data: {
      ...agent,
      runtimeBinding: runtime,
      source: roster.source,
      statePath: roster.statePath
    }
  };
}

function normalizeAgent(agent, index) {
  const runtime = agent.runtime || agent.model || null;
  const binding = runtime ? resolveModelRuntime(runtime) : null;

  return {
    id: agent.id || `sa-${String(index).padStart(2, '0')}`,
    name: agent.name || agent.id || `Agent ${index + 1}`,
    role: agent.role || agent.type || 'agent',
    client: agent.client || binding?.provider || 'unknown',
    runtime: runtime || binding?.clientModel || 'unknown',
    status: agent.status || 'unknown',
    purpose: agent.purpose || '',
    responsibilities: Array.isArray(agent.responsibilities) ? agent.responsibilities : [],
    capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
    metrics: {
      tasksCompleted: agent.metrics?.tasksCompleted ?? agent.tasksCompleted ?? 0,
      tasksFailed: agent.metrics?.tasksFailed ?? agent.tasksFailed ?? 0,
      tasksInFlight: agent.metrics?.tasksInFlight ?? agent.tasksInFlight ?? 0
    },
    lastHeartbeat: agent.lastHeartbeat || agent.updatedAt || null
  };
}

function applyFilters(agents, options) {
  const status = options.status?.toLowerCase();
  const client = options.client?.toLowerCase();

  return agents.filter((agent) => {
    if (status && agent.status.toLowerCase() !== status) {
      return false;
    }

    if (client && agent.client.toLowerCase() !== client) {
      return false;
    }

    return true;
  });
}

export default {
  list: listAgents,
  inspect: inspectAgent,
  load: loadAgentRoster,
  roster: loadAgentRoster
};
