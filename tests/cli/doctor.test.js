/**
 * @fileoverview Tests for CLI Doctor command and diagnostic checks
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { doctorCommand, quickCheck, CHECKS } from '../../src/bios/commands/doctor.js';
import * as doctorChecks from '../../src/bios/commands/doctor-checks/index.js';

describe('CLI Doctor Command', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('doctorCommand', () => {
    it('should run all diagnostic checks', async () => {
      const result = await doctorCommand({});
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('check(s)'));
    });

    it('should run checks with repair option', async () => {
      const result = await doctorCommand({ repair: true });
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
    });

    it('should skip confirmation prompts with --yes flag', async () => {
      const result = await doctorCommand({ repair: true, yes: true });
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
    });

    it('should handle critical failures', async () => {
      const result = await doctorCommand({});
      
      assert.ok(result);
      assert.strictEqual(typeof result.success, 'boolean');
    });
  });

  describe('quickCheck', () => {
    it('should run critical checks only', async () => {
      const result = await quickCheck();
      
      assert.ok(result);
      assert.strictEqual(typeof result.healthy, 'boolean');
      assert.strictEqual(Array.isArray(result.results), true);
      assert.strictEqual(Array.isArray(result.failed), true);
    });

    it('should report unhealthy when critical checks fail', async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.JWT_SECRET;
      
      const result = await quickCheck();
      
      assert.strictEqual(result.healthy, false);
      assert.ok(result.failed.length > 0);
    });
  });

  describe('CHECKS array', () => {
    it('should have all required checks defined', () => {
      const expectedChecks = [
        'node', 'config', 'env', 'permissions', 'database', 
        'migrations', 'github', 'ai', 'ports', 'disk', 'memory'
      ];
      
      assert.strictEqual(CHECKS.length, expectedChecks.length);
      expectedChecks.forEach(id => {
        const check = CHECKS.find(c => c.id === id);
        assert.ok(check, `Check ${id} should be defined`);
        assert.ok(check.name);
        assert.strictEqual(typeof check.run, 'function');
      });
    });

    it('should mark critical checks correctly', () => {
      const criticalChecks = CHECKS.filter(c => c.critical);
      assert.ok(criticalChecks.length > 0);
      
      assert.ok(criticalChecks.some(c => c.id === 'node'));
      assert.ok(criticalChecks.some(c => c.id === 'config'));
      assert.ok(criticalChecks.some(c => c.id === 'env'));
    });

    it('should have repair functions for fixable checks', () => {
      const fixableChecks = CHECKS.filter(c => c.repair);
      assert.ok(fixableChecks.length > 0);
      
      assert.ok(fixableChecks.some(c => c.id === 'permissions'));
      assert.ok(fixableChecks.some(c => c.id === 'database'));
      assert.ok(fixableChecks.some(c => c.id === 'migrations'));
    });
  });
});

describe('Doctor Diagnostic Checks', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Node Version Check', () => {
    it('should pass with current Node version', async () => {
      const result = await doctorChecks.checkNodeVersion();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'Node.js Version');
      assert.strictEqual(result.status, 'pass');
      assert.ok(result.message.includes('Node.js'));
      assert.ok(result.details.version);
    });

    it('should include version details', async () => {
      const result = await doctorChecks.checkNodeVersion();
      
      assert.ok(result.details.major >= 18);
      assert.ok(/^v\d+\.\d+\.\d+/.test(result.details.version));
    });
  });

  describe('Environment Variables Check', () => {
    it('should check required environment variables', async () => {
      process.env.GITHUB_TOKEN = 'valid_github_token';
      process.env.JWT_SECRET = 'valid_jwt_secret_with_min_32_chars';
      
      const result = await doctorChecks.checkEnvironment();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'Environment Variables');
    });

    it('should fail when required env vars are missing', async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.JWT_SECRET;
      
      const result = await doctorChecks.checkEnvironment();
      
      assert.strictEqual(result.status, 'fail');
      assert.ok(result.message.includes('Missing'));
      assert.ok(result.details.missing.includes('GITHUB_TOKEN'));
      assert.ok(result.details.missing.includes('JWT_SECRET'));
    });

    it('should warn for default secrets in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'your_jwt_secret_here_change_in_production_minimum_32_chars';
      process.env.GITHUB_TOKEN = 'valid_token';
      
      const result = await doctorChecks.checkEnvironment();
      
      assert.strictEqual(result.status, 'warn');
      assert.ok(result.repairHint.includes('Default JWT_SECRET'));
    });

    it('should export repair function', async () => {
      assert.strictEqual(typeof doctorChecks.repairEnvironment, 'function');
    });
  });

  describe('Database Check', () => {
    it('should check database connection', async () => {
      const result = await doctorChecks.checkDatabase();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'Database Connection');
      assert.ok(['pass', 'warn', 'fail'].includes(result.status));
    });

    it('should include database path in details', async () => {
      const result = await doctorChecks.checkDatabase();
      
      assert.ok(result.details);
      assert.ok(result.details.path);
    });

    it('should have repair function', async () => {
      assert.strictEqual(typeof doctorChecks.repairDatabase, 'function');
    });
  });

  describe('Permissions Check', () => {
    it('should check directory permissions', async () => {
      const result = await doctorChecks.checkPermissions();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'Directory Permissions');
      assert.ok(['pass', 'warn', 'fail'].includes(result.status));
    });

    it('should check required directories', async () => {
      const result = await doctorChecks.checkPermissions();
      
      assert.ok(result.details);
      assert.ok(result.details.directories);
      assert.strictEqual(Array.isArray(result.details.directories), true);
    });

    it('should have repair function', async () => {
      assert.strictEqual(typeof doctorChecks.repairPermissions, 'function');
    });
  });

  describe('Memory Check', () => {
    it('should check memory availability', async () => {
      const result = await doctorChecks.checkMemory();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'Memory Availability');
      assert.ok(['pass', 'warn', 'fail'].includes(result.status));
    });

    it('should include memory details', async () => {
      const result = await doctorChecks.checkMemory();
      
      assert.ok(result.details);
    });
  });

  describe('Disk Space Check', () => {
    it('should check disk space', async () => {
      const result = await doctorChecks.checkDiskSpace();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'Disk Space');
      assert.ok(['pass', 'warn', 'fail'].includes(result.status));
    });
  });

  describe('Port Check', () => {
    it('should check port availability', async () => {
      const result = await doctorChecks.checkPorts();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'Port Availability');
      assert.ok(['pass', 'warn', 'fail'].includes(result.status));
    });
  });

  describe('AI Clients Check', () => {
    it('should check AI client configuration', async () => {
      const result = await doctorChecks.checkAIClients();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'AI Clients');
    });
  });

  describe('GitHub Check', () => {
    it('should check GitHub configuration', async () => {
      process.env.GITHUB_TOKEN = 'test_token';
      const result = await doctorChecks.checkGitHub();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'GitHub API');
    });
  });

  describe('Migrations Check', () => {
    it('should check migration status', async () => {
      const result = await doctorChecks.checkMigrations();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'Database Migrations');
    });

    it('should have repair function', async () => {
      assert.strictEqual(typeof doctorChecks.repairMigrations, 'function');
    });
  });

  describe('Config Check', () => {
    it('should check configuration files', async () => {
      const result = await doctorChecks.checkConfig();
      
      assert.ok(result);
      assert.strictEqual(result.name, 'Config Files');
    });
  });
});

describe('Doctor Repair Functionality', () => {
  it('should export repairEnvironment function', () => {
    assert.strictEqual(typeof doctorChecks.repairEnvironment, 'function');
  });

  it('should export repairDatabase function', () => {
    assert.strictEqual(typeof doctorChecks.repairDatabase, 'function');
  });

  it('should export repairPermissions function', () => {
    assert.strictEqual(typeof doctorChecks.repairPermissions, 'function');
  });

  it('should export repairMigrations function', () => {
    assert.strictEqual(typeof doctorChecks.repairMigrations, 'function');
  });
});
