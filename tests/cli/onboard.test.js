/**
 * @fileoverview Tests for CLI Onboard command and setup wizard
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import onboard from '../../src/bios/commands/onboard.js';
import * as steps from '../../src/bios/commands/onboard-steps/index.js';

describe('CLI Onboard Command', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('onboard function', () => {
    it('should be exported as a function', () => {
      assert.strictEqual(typeof onboard, 'function');
    });

    it('should accept options parameter', async () => {
      const result = await onboard({ yes: true });
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
    });

    it('should run in --yes mode without prompts', async () => {
      const result = await onboard({ yes: true });
      
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
      assert.ok(result.data.config);
    });

    it('should run with --run option to start services', async () => {
      const result = await onboard({ yes: true, run: true });
      
      assert.strictEqual(result.success, true);
      assert.ok(result.data.results);
    });

    it('should include configuration summary', async () => {
      const result = await onboard({ yes: true });
      
      assert.ok(result.data.config.dirs);
      assert.ok(result.data.config.deployment);
      assert.ok(result.data.config.ports);
      assert.ok(result.data.config.clients);
      assert.ok(result.data.config.admin);
    });

    it('should return results for all steps', async () => {
      const result = await onboard({ yes: true });
      
      assert.ok(result.data.results);
      assert.strictEqual(Array.isArray(result.data.results), true);
      assert.strictEqual(result.data.results.length, 10);
    });

    it('should handle verbose mode', async () => {
      const result = await onboard({ yes: true, verbose: true });
      
      assert.strictEqual(result.success, true);
    });
  });

  describe('Configuration Generation', () => {
    it('should generate valid env file content structure', async () => {
      const result = await onboard({ yes: true });
      const config = result.data.config;
      
      assert.strictEqual(typeof config.dirs, 'string');
      assert.strictEqual(typeof config.deployment, 'string');
      assert.ok(config.ports.main);
      assert.ok(config.ports.dashboard);
      assert.strictEqual(Array.isArray(config.clients), true);
      assert.strictEqual(typeof config.admin, 'string');
    });

    it('should configure ports correctly', async () => {
      const result = await onboard({ yes: true });
      const ports = result.data.config.ports;
      
      assert.ok(ports.main > 0);
      assert.ok(ports.dashboard > 0);
      assert.ok(ports.ws > 0);
    });
  });
});

describe('Onboard Steps', () => {
  describe('showWelcome', () => {
    it('should display welcome message', async () => {
      const result = await steps.showWelcome();
      assert.ok(result);
    });
  });

  describe('checkPrerequisites', () => {
    it('should check system prerequisites', async () => {
      const result = await steps.checkPrerequisites({ skipOnFailure: true });
      
      assert.ok(result);
      assert.ok('success' in result);
    });

    it('should skip on failure when flag is set', async () => {
      const result = await steps.checkPrerequisites({ skipOnFailure: true });
      
      assert.ok(result);
    });
  });

  describe('configureDataDir', () => {
    it('should configure data directory', async () => {
      const result = await steps.configureDataDir({ yes: true });
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.data.dirs);
    });
  });

  describe('configureGitHub', () => {
    it('should handle GitHub configuration', async () => {
      process.env.GITHUB_TOKEN = 'test_token';
      const result = await steps.configureGitHub({ yes: true });
      
      assert.ok(result);
    });
  });

  describe('configureAIClients', () => {
    it('should configure AI clients', async () => {
      const result = await steps.configureAIClients({ yes: true });
      
      assert.ok(result);
      assert.ok(result.data.clients);
    });

    it('should detect or configure Claude client', async () => {
      const result = await steps.configureAIClients({ yes: true });
      
      assert.ok(result.data.clients.claude);
    });

    it('should detect or configure Codex client', async () => {
      const result = await steps.configureAIClients({ yes: true });
      
      assert.ok(result.data.clients.codex);
    });

    it('should detect or configure Kimi client', async () => {
      const result = await steps.configureAIClients({ yes: true });
      
      assert.ok(result.data.clients.kimi);
    });
  });

  describe('configureDeployment', () => {
    it('should configure deployment mode', async () => {
      const result = await steps.configureDeployment({ yes: true });
      
      assert.ok(result);
      assert.ok(result.data.mode);
      assert.ok(result.data.ports);
    });

    it('should set valid deployment mode', async () => {
      const result = await steps.configureDeployment({ yes: true });
      
      assert.ok(['local', 'docker', 'production', 'railway'].includes(result.data.mode));
    });
  });

  describe('createAdmin', () => {
    it('should create admin user', async () => {
      const result = await steps.createAdmin({ yes: true });
      
      assert.ok(result);
      assert.ok(result.data.username);
    });

    it('should generate or accept admin credentials', async () => {
      const result = await steps.createAdmin({ yes: true });
      
      assert.ok(result.data.username);
      assert.ok(result.data.password);
    });
  });

  describe('setupDatabase', () => {
    it('should setup database', async () => {
      const result = await steps.setupDatabase({ yes: true, dataDir: './data', migrate: true });
      
      assert.ok(result);
    });
  });

  describe('testConnections', () => {
    it('should test connections', async () => {
      const result = await steps.testConnections({ skipOnFailure: true });
      
      assert.ok(result);
    });

    it('should test client connections when clients are provided', async () => {
      const mockClients = {
        claude: { enabled: true },
        codex: { enabled: false },
        kimi: { enabled: false }
      };
      
      const result = await steps.testConnections({ 
        clients: mockClients, 
        skipOnFailure: true 
      });
      
      assert.ok(result);
    });
  });

  describe('startServices', () => {
    it('should handle start services option', async () => {
      const result = await steps.startServices({ yes: true, run: false });
      
      assert.ok(result);
    });

    it('should attempt to start services with --run flag', async () => {
      const result = await steps.startServices({ yes: true, run: true });
      
      assert.ok(result);
    });
  });
});

describe('Onboard Wizard Flow', () => {
  it('should complete full wizard in --yes mode', async () => {
    const result = await onboard({ yes: true });
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.message, 'Onboarding completed successfully');
  });

  it('should handle all step results', async () => {
    const result = await onboard({ yes: true });
    
    result.data.results.forEach(stepResult => {
      assert.ok('step' in stepResult);
      assert.ok('success' in stepResult);
      assert.ok('message' in stepResult);
    });
  });
});
