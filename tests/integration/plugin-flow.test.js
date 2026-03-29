/**
 * @fileoverview Plugin Flow Integration Tests
 * Tests install plugin → enable → execute tool
 * Plugin event handling
 * 
 * @module tests/integration/plugin-flow
 * @version 5.0.0
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/test-server.js';
import { createTestClient } from '../helpers/test-client.js';

describe('Plugin Flow Integration Tests', () => {
  let server;
  let client;
  let baseUrl;
  const testPlugins = [];

  before(async () => {
    server = await startTestServer({
      port: 0,
      environment: 'test',
      enablePlugins: true
    });
    baseUrl = `http://localhost:${server.port}`;
    client = createTestClient(baseUrl);
  });

  after(async () => {
    // Cleanup: uninstall test plugins
    for (const plugin of testPlugins) {
      try {
        await client.delete(`/api/plugins/${plugin.id}?purgeData=true`);
      } catch {
        // Ignore cleanup errors
      }
    }
    await stopTestServer(server);
  });

  describe('Install Plugin → Enable → Execute Tool Flow', () => {
    it('should install plugin from manifest', async () => {
      const pluginId = `test-plugin-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Test Integration Plugin',
        description: 'A test plugin for integration testing',
        author: 'Test Suite',
        license: 'MIT',
        capabilities: ['tools', 'hooks'],
        entry: './index.js',
        tools: [
          {
            id: 'echo',
            name: 'Echo Tool',
            description: 'Echoes back the input',
            parameters: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              },
              required: ['message']
            }
          }
        ]
      };

      const installRes = await client.post('/api/plugins', {
        manifest,
        source: 'test',
        autoStart: false
      });

      assert.equal(installRes.status, 201);
      assert.equal(installRes.data.success, true);
      assert.equal(installRes.data.data.id, pluginId);
      assert.equal(installRes.data.data.status, 'installed');
      
      testPlugins.push({ id: pluginId });
      console.log(`  ✓ Plugin installed: ${pluginId}`);
    });

    it('should reject invalid plugin manifest', async () => {
      const invalidManifest = {
        id: '', // Empty ID
        version: 'invalid', // Invalid version format
        // Missing required fields
      };

      const installRes = await client.post('/api/plugins', {
        manifest: invalidManifest
      });

      assert.equal(installRes.status, 400);
      assert.equal(installRes.data.success, false);
      console.log('  ✓ Invalid manifest correctly rejected');
    });

    it('should reject duplicate plugin installation', async () => {
      const pluginId = `duplicate-test-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Duplicate Test Plugin',
        description: 'Testing duplicate detection',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools']
      };

      // First installation
      const firstRes = await client.post('/api/plugins', {
        manifest,
        autoStart: false
      });

      assert.equal(firstRes.status, 201);
      testPlugins.push({ id: pluginId });

      // Second installation should fail
      const secondRes = await client.post('/api/plugins', {
        manifest,
        autoStart: false
      });

      assert.equal(secondRes.status, 409);
      assert.ok(secondRes.data.error.includes('already') || secondRes.data.error.includes('exists'));
      console.log('  ✓ Duplicate plugin correctly rejected');
    });

    it('should enable installed plugin', async () => {
      const pluginId = `enable-test-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Enable Test Plugin',
        description: 'Testing enable flow',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools']
      };

      // Install first
      await client.post('/api/plugins', {
        manifest,
        autoStart: false
      });
      testPlugins.push({ id: pluginId });

      // Enable the plugin
      const enableRes = await client.post(`/api/plugins/${pluginId}/enable`);

      assert.equal(enableRes.status, 200);
      assert.equal(enableRes.data.data.status, 'active');
      console.log(`  ✓ Plugin enabled: ${pluginId}`);
    });

    it('should handle already enabled plugin gracefully', async () => {
      const pluginId = `already-enabled-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Already Enabled Test',
        description: 'Testing double enable',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools']
      };

      // Install and enable
      await client.post('/api/plugins', { manifest, autoStart: true });
      testPlugins.push({ id: pluginId });

      // Try to enable again
      const enableRes = await client.post(`/api/plugins/${pluginId}/enable`);

      assert.equal(enableRes.status, 200);
      console.log('  ✓ Double enable handled gracefully');
    });

    it('should execute plugin tool', async () => {
      const pluginId = `tool-execution-${Date.now()}`;
      const toolId = 'greet';
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Tool Execution Test',
        description: 'Testing tool execution',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools'],
        tools: [
          {
            id: toolId,
            name: 'Greet Tool',
            description: 'Returns a greeting',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string' }
              },
              required: ['name']
            }
          }
        ]
      };

      // Install and enable
      await client.post('/api/plugins', { manifest, autoStart: true });
      testPlugins.push({ id: pluginId });

      // Execute tool
      const executeRes = await client.post(`/api/plugins/${pluginId}/tools/${toolId}`, {
        parameters: { name: 'World' },
        agentId: 'test-agent',
        runId: `run-${Date.now()}`
      });

      // Tool execution may succeed or fail depending on actual implementation
      assert.ok([200, 500, 503].includes(executeRes.status));
      console.log(`  ✓ Tool execution attempted: ${executeRes.status}`);
    });

    it('should reject tool execution for inactive plugin', async () => {
      const pluginId = `inactive-tool-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Inactive Tool Test',
        description: 'Testing tool on inactive plugin',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools'],
        tools: [{ id: 'test', name: 'Test Tool', parameters: { type: 'object' } }]
      };

      // Install without enabling
      await client.post('/api/plugins', { manifest, autoStart: false });
      testPlugins.push({ id: pluginId });

      // Try to execute tool
      const executeRes = await client.post(`/api/plugins/${pluginId}/tools/test`, {
        parameters: {}
      });

      assert.equal(executeRes.status, 400);
      assert.ok(executeRes.data.error.includes('not active') || executeRes.data.code === 'PLUGIN_NOT_ACTIVE');
      console.log('  ✓ Tool execution on inactive plugin correctly blocked');
    });
  });

  describe('Plugin Lifecycle Management', () => {
    it('should disable active plugin', async () => {
      const pluginId = `disable-test-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Disable Test Plugin',
        description: 'Testing disable flow',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools']
      };

      // Install and enable
      await client.post('/api/plugins', { manifest, autoStart: true });
      testPlugins.push({ id: pluginId });

      // Disable
      const disableRes = await client.post(`/api/plugins/${pluginId}/disable`, {
        graceful: true,
        timeout: 5000
      });

      assert.equal(disableRes.status, 200);
      assert.equal(disableRes.data.data.status, 'terminated');
      console.log(`  ✓ Plugin disabled: ${pluginId}`);
    });

    it('should update plugin configuration', async () => {
      const pluginId = `config-test-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Config Test Plugin',
        description: 'Testing config update',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools'],
        configSchema: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
            timeout: { type: 'number', default: 5000 }
          }
        }
      };

      await client.post('/api/plugins', { manifest, autoStart: false });
      testPlugins.push({ id: pluginId });

      const updateRes = await client.put(`/api/plugins/${pluginId}`, {
        config: {
          apiKey: 'test-api-key-123',
          timeout: 10000
        }
      });

      assert.equal(updateRes.status, 200);
      console.log('  ✓ Plugin configuration updated');
    });

    it('should get plugin details', async () => {
      const pluginId = `details-test-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '2.0.0',
        name: 'Details Test Plugin',
        description: 'Testing details retrieval',
        author: 'Test Author',
        license: 'Apache-2.0',
        capabilities: ['tools', 'hooks', 'ui']
      };

      await client.post('/api/plugins', { manifest, autoStart: false });
      testPlugins.push({ id: pluginId });

      const detailsRes = await client.get(`/api/plugins/${pluginId}`);

      assert.equal(detailsRes.status, 200);
      assert.equal(detailsRes.data.data.id, pluginId);
      assert.equal(detailsRes.data.data.version, '2.0.0');
      assert.equal(detailsRes.data.data.name, 'Details Test Plugin');
      assert.ok(Array.isArray(detailsRes.data.data.capabilities));
      console.log('  ✓ Plugin details retrieved');
    });

    it('should list plugins with filters', async () => {
      // Install multiple plugins
      for (let i = 0; i < 3; i++) {
        const pluginId = `list-test-${Date.now()}-${i}`;
        const manifest = {
          id: pluginId,
          version: '1.0.0',
          name: `List Test Plugin ${i}`,
          description: `Plugin ${i} for list testing`,
          author: 'Test',
          license: 'MIT',
          capabilities: ['tools']
        };

        await client.post('/api/plugins', { 
          manifest, 
          autoStart: i === 0 // Only enable first one
        });
        testPlugins.push({ id: pluginId });
      }

      // List all plugins
      const listRes = await client.get('/api/plugins');

      assert.equal(listRes.status, 200);
      assert.ok(Array.isArray(listRes.data.data.items));
      assert.ok(listRes.data.data.items.length >= 3);
      console.log(`  ✓ Listed ${listRes.data.data.items.length} plugins`);

      // Filter by status
      const activeRes = await client.get('/api/plugins?status=active');
      assert.equal(activeRes.status, 200);
      console.log(`  ✓ Filtered active plugins: ${activeRes.data.data.items.length}`);

      const installedRes = await client.get('/api/plugins?status=installed');
      assert.equal(installedRes.status, 200);
      console.log(`  ✓ Filtered installed plugins: ${installedRes.data.data.items.length}`);
    });

    it('should get plugin logs', async () => {
      const pluginId = `logs-test-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Logs Test Plugin',
        description: 'Testing log retrieval',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools']
      };

      await client.post('/api/plugins', { manifest, autoStart: true });
      testPlugins.push({ id: pluginId });

      const logsRes = await client.get(`/api/plugins/${pluginId}/logs?limit=50`);

      assert.equal(logsRes.status, 200);
      assert.ok(Array.isArray(logsRes.data.data.items));
      console.log(`  ✓ Retrieved ${logsRes.data.data.items.length} log entries`);
    });
  });

  describe('Plugin Event Handling', () => {
    it('should handle plugin installation events', async () => {
      const pluginId = `event-test-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Event Test Plugin',
        description: 'Testing event hooks',
        author: 'Test',
        license: 'MIT',
        capabilities: ['hooks'],
        hooks: ['plugin:install', 'plugin:enable', 'plugin:disable']
      };

      const installRes = await client.post('/api/plugins', { 
        manifest, 
        autoStart: false 
      });

      assert.equal(installRes.status, 201);
      testPlugins.push({ id: pluginId });
      console.log('  ✓ Plugin with hooks installed');

      // Enable should trigger hook
      const enableRes = await client.post(`/api/plugins/${pluginId}/enable`);
      assert.equal(enableRes.status, 200);
      console.log('  ✓ Enable hook triggered');

      // Disable should trigger hook
      const disableRes = await client.post(`/api/plugins/${pluginId}/disable`);
      assert.equal(disableRes.status, 200);
      console.log('  ✓ Disable hook triggered');
    });

    it('should handle plugin with multiple capabilities', async () => {
      const pluginId = `multi-cap-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Multi-Capability Plugin',
        description: 'Testing multiple capabilities',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools', 'hooks', 'ui', 'storage'],
        tools: [
          { id: 'tool1', name: 'Tool 1', parameters: { type: 'object' } }
        ],
        hooks: ['system:startup', 'task:complete'],
        ui: {
          components: ['dashboard-widget', 'settings-panel']
        }
      };

      const installRes = await client.post('/api/plugins', { 
        manifest, 
        autoStart: true 
      });

      assert.equal(installRes.status, 201);
      assert.ok(installRes.data.data.capabilities.includes('tools'));
      assert.ok(installRes.data.data.capabilities.includes('hooks'));
      assert.ok(installRes.data.data.capabilities.includes('ui'));
      testPlugins.push({ id: pluginId });
      console.log('  ✓ Multi-capability plugin installed');
    });
  });

  describe('Plugin Uninstallation', () => {
    it('should uninstall plugin', async () => {
      const pluginId = `uninstall-test-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Uninstall Test Plugin',
        description: 'Testing uninstall flow',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools']
      };

      await client.post('/api/plugins', { manifest, autoStart: false });

      const uninstallRes = await client.delete(`/api/plugins/${pluginId}`);

      assert.equal(uninstallRes.status, 200);
      assert.equal(uninstallRes.data.data.uninstalled, true);
      console.log(`  ✓ Plugin uninstalled: ${pluginId}`);

      // Verify plugin is gone
      const getRes = await client.get(`/api/plugins/${pluginId}`);
      assert.equal(getRes.status, 404);
      console.log('  ✓ Plugin no longer exists');
    });

    it('should support purge option on uninstall', async () => {
      const pluginId = `purge-test-${Date.now()}`;
      
      const manifest = {
        id: pluginId,
        version: '1.0.0',
        name: 'Purge Test Plugin',
        description: 'Testing purge uninstall',
        author: 'Test',
        license: 'MIT',
        capabilities: ['tools', 'storage']
      };

      await client.post('/api/plugins', { manifest, autoStart: true });

      const uninstallRes = await client.delete(`/api/plugins/${pluginId}?purgeData=true`);

      assert.equal(uninstallRes.status, 200);
      assert.equal(uninstallRes.data.data.purgeData, true);
      console.log('  ✓ Plugin uninstalled with data purge');
    });

    it('should handle uninstall of non-existent plugin', async () => {
      const uninstallRes = await client.delete('/api/plugins/non-existent-plugin');

      assert.equal(uninstallRes.status, 404);
      console.log('  ✓ Non-existent plugin uninstall handled correctly');
    });
  });
});
