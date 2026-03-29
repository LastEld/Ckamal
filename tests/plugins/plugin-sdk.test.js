/**
 * @fileoverview Plugin SDK Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  definePlugin,
  validateManifest,
  hashManifest,
  createPluginContext,
  PLUGIN_API_VERSION,
  PLUGIN_CAPABILITIES,
  PLUGIN_STATUSES
} from '../../src/plugins/plugin-sdk.js';

describe('Plugin SDK', () => {
  describe('definePlugin', () => {
    it('should create a valid plugin definition', () => {
      const plugin = definePlugin({
        async setup(ctx) {
          ctx.logger.info('test');
        }
      });
      
      expect(plugin).toBeDefined();
      expect(plugin.definition).toBeDefined();
      expect(typeof plugin.definition.setup).toBe('function');
    });
    
    it('should throw for missing setup function', () => {
      expect(() => definePlugin({})).toThrow('setup function');
    });
    
    it('should throw for non-object definition', () => {
      expect(() => definePlugin(null)).toThrow('object');
      expect(() => definePlugin('string')).toThrow('object');
    });
    
    it('should freeze the plugin object', () => {
      const plugin = definePlugin({
        async setup() {}
      });
      
      expect(Object.isFrozen(plugin)).toBe(true);
      expect(Object.isFrozen(plugin.definition)).toBe(true);
    });
  });
  
  describe('validateManifest', () => {
    it('should validate a correct manifest', () => {
      const manifest = {
        apiVersion: PLUGIN_API_VERSION,
        id: '@test/my-plugin',
        version: '1.0.0',
        name: 'My Plugin',
        description: 'A test plugin',
        entrypoints: { worker: './worker.js' },
        capabilities: ['tools.register']
      };
      
      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should reject missing required fields', () => {
      const result = validateManifest({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('apiVersion'))).toBe(true);
      expect(result.errors.some(e => e.includes('id'))).toBe(true);
    });
    
    it('should reject invalid apiVersion', () => {
      const result = validateManifest({
        apiVersion: 999,
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        entrypoints: { worker: './worker.js' },
        capabilities: []
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('apiVersion'))).toBe(true);
    });
    
    it('should reject invalid plugin ID format', () => {
      const result = validateManifest({
        apiVersion: PLUGIN_API_VERSION,
        id: 'Invalid ID!',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        entrypoints: { worker: './worker.js' },
        capabilities: []
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('ID'))).toBe(true);
    });
    
    it('should reject invalid semver version', () => {
      const result = validateManifest({
        apiVersion: PLUGIN_API_VERSION,
        id: 'test',
        version: 'not-a-version',
        name: 'Test',
        description: 'Test',
        entrypoints: { worker: './worker.js' },
        capabilities: []
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('semver'))).toBe(true);
    });
    
    it('should reject invalid capabilities', () => {
      const result = validateManifest({
        apiVersion: PLUGIN_API_VERSION,
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        entrypoints: { worker: './worker.js' },
        capabilities: ['invalid.capability']
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('capabilities'))).toBe(true);
    });
    
    it('should accept scoped plugin IDs', () => {
      const result = validateManifest({
        apiVersion: PLUGIN_API_VERSION,
        id: '@org/my-plugin',
        version: '1.0.0',
        name: 'My Plugin',
        description: 'A test plugin',
        entrypoints: { worker: './worker.js' },
        capabilities: []
      });
      
      expect(result.valid).toBe(true);
    });
  });
  
  describe('hashManifest', () => {
    it('should generate consistent hashes', () => {
      const manifest = {
        id: 'test',
        version: '1.0.0'
      };
      
      const hash1 = hashManifest(manifest);
      const hash2 = hashManifest(manifest);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });
    
    it('should generate different hashes for different manifests', () => {
      const manifest1 = { id: 'test1', version: '1.0.0' };
      const manifest2 = { id: 'test2', version: '1.0.0' };
      
      const hash1 = hashManifest(manifest1);
      const hash2 = hashManifest(manifest2);
      
      expect(hash1).not.toBe(hash2);
    });
  });
  
  describe('createPluginContext', () => {
    let mockHostRpc;
    let context;
    
    beforeEach(() => {
      mockHostRpc = {
        calls: [],
        async call(method, params) {
          this.calls.push({ method, params });
          return {};
        },
        notifications: [],
        notify(method, params) {
          this.notifications.push({ method, params });
        }
      };
      
      context = createPluginContext({
        manifest: { id: '@test/plugin', name: 'Test' },
        config: {},
        hostRpc: mockHostRpc,
        instanceId: 'test-instance'
      });
    });
    
    it('should create context with required properties', () => {
      expect(context.manifest).toBeDefined();
      expect(context.instanceId).toBe('test-instance');
      expect(context.config).toBeDefined();
      expect(context.state).toBeDefined();
      expect(context.events).toBeDefined();
      expect(context.tools).toBeDefined();
      expect(context.logger).toBeDefined();
    });
    
    it('should call host RPC for config.get', async () => {
      await context.config.get();
      expect(mockHostRpc.calls).toContainEqual(
        expect.objectContaining({ method: 'config.get' })
      );
    });
    
    it('should call host RPC for state operations', async () => {
      const key = { scopeKind: 'instance', stateKey: 'test' };
      
      await context.state.get(key);
      expect(mockHostRpc.calls).toContainEqual(
        expect.objectContaining({ method: 'state.get' })
      );
      
      await context.state.set(key, 'value');
      expect(mockHostRpc.calls).toContainEqual(
        expect.objectContaining({ method: 'state.set' })
      );
      
      await context.state.delete(key);
      expect(mockHostRpc.calls).toContainEqual(
        expect.objectContaining({ method: 'state.delete' })
      );
    });
    
    it('should register event handlers', () => {
      const handler = jest.fn();
      const unsubscribe = context.events.on('test.event', handler);
      
      expect(typeof unsubscribe).toBe('function');
      expect(mockHostRpc.calls).toContainEqual(
        expect.objectContaining({ method: 'events.subscribe' })
      );
    });
    
    it('should emit events through host', async () => {
      await context.events.emit('custom', { data: 123 });
      expect(mockHostRpc.calls).toContainEqual(
        expect.objectContaining({ 
          method: 'events.emit',
          params: { name: 'custom', payload: { data: 123 } }
        })
      );
    });
    
    it('should register tools', () => {
      const handler = jest.fn();
      context.tools.register('myTool', {
        displayName: 'My Tool',
        description: 'Does something',
        parametersSchema: {}
      }, handler);
      
      const registered = context.tools._getHandler('myTool');
      expect(registered).toBeDefined();
      expect(registered.handler).toBe(handler);
    });
    
    it('should throw for invalid tool handler', () => {
      expect(() => {
        context.tools.register('bad', {}, 'not-a-function');
      }).toThrow('function');
    });
    
    it('should log through host', () => {
      context.logger.info('test message', { meta: true });
      expect(mockHostRpc.notifications).toContainEqual(
        expect.objectContaining({
          method: 'log',
          params: expect.objectContaining({
            level: 'info',
            message: 'test message'
          })
        })
      );
    });
  });
  
  describe('Constants', () => {
    it('should export PLUGIN_API_VERSION', () => {
      expect(typeof PLUGIN_API_VERSION).toBe('number');
      expect(PLUGIN_API_VERSION).toBe(1);
    });
    
    it('should export PLUGIN_CAPABILITIES', () => {
      expect(Array.isArray(PLUGIN_CAPABILITIES)).toBe(true);
      expect(PLUGIN_CAPABILITIES).toContain('tools.register');
      expect(PLUGIN_CAPABILITIES).toContain('state.read');
      expect(PLUGIN_CAPABILITIES).toContain('events.subscribe');
    });
    
    it('should export PLUGIN_STATUSES', () => {
      expect(typeof PLUGIN_STATUSES).toBe('object');
      expect(PLUGIN_STATUSES.ACTIVE).toBe('active');
      expect(PLUGIN_STATUSES.FAILED).toBe('failed');
    });
  });
});
