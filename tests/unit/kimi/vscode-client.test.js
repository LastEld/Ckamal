/**
 * @fileoverview Unit tests for Kimi VSCode Client
 * Tests for Kimi 2.5 VSCode Extension integration
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { KimiVSCodeClient, KimiIdeClient } from '../../../src/clients/kimi/ide.js';

describe('KimiVSCodeClient', () => {
  let client;

  beforeEach(() => {
    client = new KimiVSCodeClient({
      port: 18123,
      host: 'localhost',
      language: 'auto',
      cogniMeshEnabled: true
    });
  });

  afterEach(async () => {
    if (client && client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('Initialization', () => {
    it('should create client with correct configuration', () => {
      assert.equal(client.provider, 'kimi');
      assert.equal(client.config.mode, 'vscode');
      assert.equal(client.port, 18123);
      assert.equal(client.host, 'localhost');
      assert.equal(client.contextWindow, 256000);
      assert.equal(client.cogniMeshEnabled, true);
    });

    it('should create KimiVSCodeClient directly with vscode mode', () => {
      const vscodeClient = new KimiVSCodeClient({});
      assert.equal(vscodeClient.config.mode, 'vscode');
    });

    it('should have correct default values', () => {
      const defaultClient = new KimiVSCodeClient({});
      assert.equal(defaultClient.port, 18123);
      assert.equal(defaultClient.host, 'localhost');
      assert.equal(defaultClient.languagePreference, 'auto');
    });

    it('should return correct capabilities', () => {
      const caps = client.getCapabilities();
      assert.equal(caps.provider, 'kimi');
      assert.equal(caps.mode, 'vscode');
      assert.equal(caps.contextWindow, 256000);
      assert.ok(caps.features.includes('inline_completion'));
      assert.ok(caps.features.includes('generate_tests'));
      assert.ok(caps.features.includes('optimize_performance'));
      assert.ok(caps.features.includes('security_audit'));
      assert.ok(caps.features.includes('cogni_mesh_integration'));
      assert.ok(caps.supportsGSD);
      assert.ok(caps.supportsRoadmap);
    });
  });

  describe('IDE Features', () => {
    it('should define inlineCompletion method', () => {
      assert.equal(typeof client.inlineCompletion, 'function');
    });

    it('should define explainSelection method', () => {
      assert.equal(typeof client.explainSelection, 'function');
    });

    it('should define generateTests method', () => {
      assert.equal(typeof client.generateTests, 'function');
    });

    it('should define optimizePerformance method', () => {
      assert.equal(typeof client.optimizePerformance, 'function');
    });

    it('should define securityAudit method', () => {
      assert.equal(typeof client.securityAudit, 'function');
    });
  });

  describe('Kimi-Specific Features', () => {
    it('should define analyzeFileTree method', () => {
      assert.equal(typeof client.analyzeFileTree, 'function');
    });

    it('should define getCrossFileReferences method', () => {
      assert.equal(typeof client.getCrossFileReferences, 'function');
    });

    it('should support bilingual language options', () => {
      const zhClient = new KimiVSCodeClient({ language: 'zh' });
      const enClient = new KimiVSCodeClient({ language: 'en' });
      assert.equal(zhClient.languagePreference, 'zh');
      assert.equal(enClient.languagePreference, 'en');
    });
  });

  describe('CogniMesh Integration', () => {
    it('should define createCogniMeshTask method', () => {
      assert.equal(typeof client.createCogniMeshTask, 'function');
    });

    it('should define integrateRoadmap method', () => {
      assert.equal(typeof client.integrateRoadmap, 'function');
    });

    it('should define supportGSDWorkflow method', () => {
      assert.equal(typeof client.supportGSDWorkflow, 'function');
    });

    it('should throw error if CogniMesh disabled', async () => {
      const disabledClient = new KimiVSCodeClient({ cogniMeshEnabled: false });
      await assert.rejects(
        async () => disabledClient.createCogniMeshTask({}),
        /CogniMesh integration is disabled/
      );
    });
  });

  describe('Context Management', () => {
    it('should extract context window correctly', () => {
      const content = 'line1\nline2\nline3\nline4\nline5';
      const position = { line: 2, character: 0 };
      const window = client._extractContextWindow(content, position);
      
      assert.ok(window.prefix.includes('line1') || window.prefix.includes('line2'));
      assert.ok(window.suffix.includes('line4') || window.suffix.includes('line5'));
      assert.equal(window.cursorLine, 2);
    });

    it('should detect test frameworks correctly', () => {
      assert.equal(client._detectTestFramework('javascript'), 'jest');
      assert.equal(client._detectTestFramework('typescript'), 'jest');
      assert.equal(client._detectTestFramework('python'), 'pytest');
      assert.equal(client._detectTestFramework('java'), 'junit');
      assert.equal(client._detectTestFramework('unknown'), 'generic');
    });
  });

  describe('Legacy Compatibility', () => {
    it('should support KimiIdeClient as alias', () => {
      const legacyClient = new KimiIdeClient({});
      assert.equal(legacyClient.provider, 'kimi');
      assert.equal(typeof legacyClient.inlineCompletion, 'function');
    });
  });

  describe('Connection State', () => {
    it('should start disconnected', () => {
      assert.equal(client.isConnected(), false);
      assert.equal(client.status, 'disconnected');
    });

    it('should track health status', () => {
      client.updateHealth({ connected: true, lastError: null });
      assert.equal(client.health.connected, true);
      assert.equal(client.health.lastError, null);
    });
  });
});
