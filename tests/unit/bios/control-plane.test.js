/**
 * @fileoverview Unit tests for BIOS operator control-plane commands
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CogniMeshCLI } from '../../../src/bios/cli.js';
import statusCommand from '../../../src/bios/commands/status.js';
import agentsCommands from '../../../src/bios/commands/agents.js';
import providersCommands from '../../../src/bios/commands/providers.js';

describe('BIOS Operator Control Plane', () => {
  it('should expose provider runtime visibility in system status', async () => {
    const result = await statusCommand();

    assert.equal(result.success, true);
    assert.match(result.output, /Provider Runtime Inventory/);
    assert.match(result.output, /Control Plane/);
    assert.ok(Array.isArray(result.data.runtimes));
    assert.ok(result.data.runtimes.length > 0);
  });

  it('should list provider runtimes and inspect a runtime', async () => {
    const list = await providersCommands.status();
    const inspect = await providersCommands.inspect('gpt-5.4-codex');

    assert.equal(list.success, true);
    assert.match(list.output, /PROVIDER RUNTIME STATUS/);
    assert.match(list.output, /gpt-5.4-codex/);

    assert.equal(inspect.success, true);
    assert.match(inspect.output, /GPT-5\.4 CODEX/);
    assert.equal(inspect.data.runtime.id, 'gpt-5.4-codex');
  });

  it('should list control-plane agents and inspect one agent', async () => {
    const list = await agentsCommands.list();
    const inspect = await agentsCommands.inspect('sa-00');

    assert.equal(list.success, true);
    assert.match(list.output, /AGENT CONTROL PLANE/);
    assert.match(list.output, /Coordinator/);

    assert.equal(inspect.success, true);
    assert.match(inspect.output, /COORDINATOR/);
    assert.match(inspect.output, /claude-sonnet-4-6/);
    assert.equal(inspect.data.id, 'sa-00');
  });

  it('should register the operator commands on the CLI', () => {
    const cli = new CogniMeshCLI();
    const commandNames = cli.program.commands.map((command) => command.name());

    assert.ok(commandNames.includes('providers'));
    assert.ok(commandNames.includes('agents'));

    const providers = cli.program.commands.find((command) => command.name() === 'providers');
    const agents = cli.program.commands.find((command) => command.name() === 'agents');

    assert.ok(providers.commands.some((command) => command.name() === 'status'));
    assert.ok(providers.commands.some((command) => command.name() === 'inspect'));
    assert.ok(agents.commands.some((command) => command.name() === 'inspect'));
  });
});
