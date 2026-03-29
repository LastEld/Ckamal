/**
 * @fileoverview Tests for CLI Context management
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as context from '../../src/bios/commands/context.js';
import * as contextManager from '../../src/bios/context-manager.js';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

describe('CLI Context Commands', () => {
  const testProfileName = 'test-profile-' + Date.now();
  const cognimeshDir = join(homedir(), '.cognimesh');
  const profilesDir = join(cognimeshDir, 'profiles');

  beforeEach(() => {
    if (!existsSync(profilesDir)) {
      mkdirSync(profilesDir, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      const testProfilePath = join(profilesDir, `${testProfileName}.json`);
      if (existsSync(testProfilePath)) {
        rmSync(testProfilePath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('listProfiles', () => {
    it('should list all profiles', async () => {
      const result = await context.listProfiles();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(Array.isArray(result.data), true);
    });

    it('should return formatted output', async () => {
      const result = await context.listProfiles();
      
      assert.ok(result.output);
      assert.strictEqual(typeof result.output, 'string');
    });
  });

  describe('createProfile', () => {
    it('should create a new profile', async () => {
      const result = await context.createProfile(testProfileName, {
        apiUrl: 'http://localhost:3000',
        companyId: 'test-company'
      });
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.name, testProfileName);
    });

    it('should accept apiUrl option', async () => {
      const result = await context.createProfile(testProfileName + '-api', {
        apiUrl: 'https://api.example.com'
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.apiUrl, 'https://api.example.com');
    });

    it('should accept companyId option', async () => {
      const result = await context.createProfile(testProfileName + '-company', {
        companyId: 'COMP-123'
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.companyId, 'COMP-123');
    });

    it('should accept preferences', async () => {
      const result = await context.createProfile(testProfileName + '-prefs', {
        defaultModel: 'claude',
        theme: 'dark'
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.preferences.defaultModel, 'claude');
      assert.strictEqual(result.data.preferences.theme, 'dark');
    });

    it('should switch to new profile when --switch flag is set', async () => {
      const result = await context.createProfile(testProfileName + '-switch', {
        switch: true
      });
      
      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('activated'));
    });

    it('should return error when name is missing', async () => {
      const result = await context.createProfile();
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('required'));
    });

    it('should return error when profile already exists', async () => {
      await context.createProfile(testProfileName);
      
      const result = await context.createProfile(testProfileName);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('already exists'));
    });
  });

  describe('switchProfile', () => {
    it('should switch to existing profile', async () => {
      await context.createProfile(testProfileName);
      
      const result = await context.switchProfile(testProfileName);
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
    });

    it('should show current profile when no name provided', async () => {
      const result = await context.switchProfile();
      
      assert.strictEqual(result.success, true);
    });

    it('should return error for non-existent profile', async () => {
      const result = await context.switchProfile('non-existent-profile-12345');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('does not exist'));
    });
  });

  describe('deleteProfile', () => {
    it('should delete profile with --force flag', async () => {
      await context.createProfile(testProfileName);
      
      const result = await context.deleteProfile(testProfileName, { force: true });
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
    });

    it('should require confirmation without --force flag', async () => {
      await context.createProfile(testProfileName);
      
      const result = await context.deleteProfile(testProfileName);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Confirmation required'));
    });

    it('should prevent deleting default profile without --force', async () => {
      const result = await context.deleteProfile('default');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('default'));
    });

    it('should return error for non-existent profile', async () => {
      const result = await context.deleteProfile('non-existent-profile-12345', { force: true });
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('does not exist'));
    });

    it('should return error when profile name is missing', async () => {
      const result = await context.deleteProfile();
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('required'));
    });
  });

  describe('showProfile', () => {
    it('should show current profile when no name provided', async () => {
      const result = await context.showProfile();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
    });

    it('should show specified profile', async () => {
      await context.createProfile(testProfileName);
      
      const result = await context.showProfile(testProfileName);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.name, testProfileName);
    });

    it('should show resolved context with --resolved flag', async () => {
      const result = await context.showProfile(null, { resolved: true });
      
      assert.strictEqual(result.success, true);
    });

    it('should show profile metadata', async () => {
      await context.createProfile(testProfileName);
      
      const result = await context.showProfile(testProfileName);
      
      assert.ok(result.output.includes('Created'));
      assert.ok(result.output.includes('Updated'));
    });

    it('should return error for non-existent profile', async () => {
      const result = await context.showProfile('non-existent-profile-12345');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('does not exist'));
    });
  });

  describe('exportProfileCmd', () => {
    it('should export profile to JSON', async () => {
      await context.createProfile(testProfileName);
      
      const result = await context.exportProfileCmd(testProfileName);
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.data.json);
    });

    it('should include profile data in export', async () => {
      await context.createProfile(testProfileName, { apiUrl: 'http://test.com' });
      
      const result = await context.exportProfileCmd(testProfileName);
      
      assert.ok(result.data.profile);
      assert.strictEqual(result.data.profile.name, testProfileName);
    });

    it('should return error for non-existent profile', async () => {
      const result = await context.exportProfileCmd('non-existent-profile-12345');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('does not exist'));
    });

    it('should return error when profile name is missing', async () => {
      const result = await context.exportProfileCmd();
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('required'));
    });
  });

  describe('importProfileCmd', () => {
    const importFilePath = join(process.cwd(), 'test-import-profile.json');

    beforeEach(() => {
      const testProfile = {
        name: testProfileName + '-import',
        apiUrl: 'http://imported.example.com',
        companyId: 'IMPORT-001',
        preferences: { defaultModel: 'kimi', theme: 'light' }
      };
      writeFileSync(importFilePath, JSON.stringify(testProfile));
    });

    afterEach(() => {
      try {
        if (existsSync(importFilePath)) {
          rmSync(importFilePath);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should import profile from file', async () => {
      const result = await context.importProfileCmd(importFilePath);
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
    });

    it('should use name from import file', async () => {
      const result = await context.importProfileCmd(importFilePath);
      
      assert.strictEqual(result.data.name, testProfileName + '-import');
    });

    it('should allow override name with --name option', async () => {
      const customName = testProfileName + '-custom';
      const result = await context.importProfileCmd(importFilePath, { name: customName });
      
      assert.strictEqual(result.data.name, customName);
    });

    it('should switch to imported profile with --switch flag', async () => {
      const result = await context.importProfileCmd(importFilePath, { 
        name: testProfileName + '-switch-import',
        switch: true 
      });
      
      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('Switched'));
    });

    it('should return error when file not found', async () => {
      const result = await context.importProfileCmd('non-existent-file.json');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'));
    });

    it('should return error when file path is missing', async () => {
      const result = await context.importProfileCmd();
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('required'));
    });
  });
});

describe('Context Manager', () => {
  const testProfileName = 'context-test-' + Date.now();
  
  beforeEach(() => {
    contextManager.initializeContext();
  });

  afterEach(() => {
    try {
      if (contextManager.profileExists(testProfileName)) {
        contextManager.deleteProfile(testProfileName);
      }
    } catch (e) {
      // Ignore
    }
  });

  describe('Profile CRUD', () => {
    it('should create a profile', () => {
      const profile = contextManager.saveProfile(testProfileName, {
        apiUrl: 'http://test.com',
        companyId: 'TEST-001'
      });
      
      assert.ok(profile);
      assert.strictEqual(profile.name, testProfileName);
      assert.strictEqual(profile.apiUrl, 'http://test.com');
    });

    it('should load a profile', () => {
      contextManager.saveProfile(testProfileName, { apiUrl: 'http://test.com' });
      
      const profile = contextManager.loadProfile(testProfileName);
      
      assert.ok(profile);
      assert.strictEqual(profile.name, testProfileName);
    });

    it('should return null for non-existent profile', () => {
      const profile = contextManager.loadProfile('non-existent-12345');
      
      assert.strictEqual(profile, null);
    });

    it('should load all profiles', () => {
      contextManager.saveProfile(testProfileName + '-1', {});
      contextManager.saveProfile(testProfileName + '-2', {});
      
      const profiles = contextManager.loadAllProfiles();
      
      assert.strictEqual(Array.isArray(profiles), true);
      assert.ok(profiles.length >= 2);
    });

    it('should delete a profile', () => {
      contextManager.saveProfile(testProfileName, {});
      
      const deleted = contextManager.deleteProfile(testProfileName);
      
      assert.strictEqual(deleted, true);
      assert.strictEqual(contextManager.loadProfile(testProfileName), null);
    });
  });

  describe('Current Profile', () => {
    it('should get current profile name', () => {
      const name = contextManager.getCurrentProfileName();
      
      assert.strictEqual(typeof name, 'string');
      assert.ok(name.length > 0);
    });

    it('should set current profile', () => {
      contextManager.saveProfile(testProfileName, {});
      
      contextManager.setCurrentProfileName(testProfileName);
      
      assert.strictEqual(contextManager.getCurrentProfileName(), testProfileName);
    });

    it('should get current profile', () => {
      const profile = contextManager.getCurrentProfile();
      
      assert.ok(profile);
      assert.strictEqual(profile.name, contextManager.getCurrentProfileName());
    });

    it('should throw when setting non-existent profile', () => {
      assert.throws(() => {
        contextManager.setCurrentProfileName('non-existent-12345');
      });
    });
  });

  describe('Context Resolution', () => {
    it('should get current context', () => {
      const ctx = contextManager.getCurrentContext();
      
      assert.ok(ctx);
      assert.ok(ctx.profile);
      assert.ok(ctx.apiUrl);
      assert.ok(ctx.preferences);
      assert.ok(ctx.sources);
    });

    it('should prioritize environment variables', () => {
      process.env.COGNIMESH_API_URL = 'http://env-override.com';
      
      const ctx = contextManager.getCurrentContext();
      
      assert.strictEqual(ctx.apiUrl, 'http://env-override.com');
      assert.strictEqual(ctx.sources.apiUrl, 'env');
      
      delete process.env.COGNIMESH_API_URL;
    });

    it('should track source of each value', () => {
      const ctx = contextManager.getCurrentContext();
      
      assert.ok(/env|profile/.test(ctx.sources.apiUrl));
      assert.ok(/env|profile/.test(ctx.sources.companyId));
      assert.ok(/env|profile/.test(ctx.sources.authToken));
    });
  });

  describe('Profile Validation', () => {
    it('should validate valid profile', () => {
      const profile = {
        apiUrl: 'http://localhost:3000',
        companyId: 'TEST-001',
        authToken: 'valid-token-123'
      };
      
      const validation = contextManager.validateProfile(profile);
      
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    it('should reject invalid API URL', () => {
      const profile = { apiUrl: 'not-a-url' };
      
      const validation = contextManager.validateProfile(profile);
      
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.length > 0);
    });

    it('should reject non-http(s) protocol', () => {
      const profile = { apiUrl: 'ftp://example.com' };
      
      const validation = contextManager.validateProfile(profile);
      
      assert.strictEqual(validation.valid, false);
    });

    it('should warn about short auth token', () => {
      const profile = { authToken: 'short' };
      
      const validation = contextManager.validateProfile(profile);
      
      assert.strictEqual(validation.valid, false);
    });
  });

  describe('Profile Import/Export', () => {
    it('should export profile to JSON', () => {
      contextManager.saveProfile(testProfileName, { apiUrl: 'http://test.com' });
      
      const json = contextManager.exportProfile(testProfileName);
      
      assert.ok(json);
      const parsed = JSON.parse(json);
      assert.strictEqual(parsed.name, testProfileName);
    });

    it('should return null for non-existent export', () => {
      const json = contextManager.exportProfile('non-existent-12345');
      
      assert.strictEqual(json, null);
    });

    it('should import profile from data', () => {
      const importData = {
        apiUrl: 'http://imported.com',
        companyId: 'IMPORT-001',
        preferences: { defaultModel: 'kimi' }
      };
      
      const profile = contextManager.importProfile(importData, testProfileName);
      
      assert.ok(profile);
      assert.strictEqual(profile.name, testProfileName);
      assert.strictEqual(profile.apiUrl, 'http://imported.com');
    });

    it('should check if profile exists', () => {
      contextManager.saveProfile(testProfileName, {});
      
      assert.strictEqual(contextManager.profileExists(testProfileName), true);
      assert.strictEqual(contextManager.profileExists('non-existent-12345'), false);
    });
  });

  describe('Default Profile', () => {
    it('should create default profile on init', () => {
      contextManager.initializeContext();
      
      assert.strictEqual(contextManager.profileExists('default'), true);
    });

    it('should prevent deleting default profile', () => {
      assert.throws(() => {
        contextManager.deleteProfile('default');
      });
    });

    it('should set default as current if none set', () => {
      contextManager.initializeContext();
      
      assert.strictEqual(contextManager.getCurrentProfileName(), 'default');
    });
  });
});
