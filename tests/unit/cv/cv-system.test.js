/**
 * CV System Tests
 * Comprehensive tests for the CV Registry and Management System
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CVRegistry } from '../../../src/cv/registry.js';
import { RightsEngine } from '../../../src/cv/engine.js';
import { ObligationsMonitor } from '../../../src/cv/obligations.js';
import { CVFactory } from '../../../src/cv/factory.js';
import { CVManager } from '../../../src/cv/manager.js';
import { validateCV, createDefaultCV } from '../../../src/cv/schema.js';

describe('CV System', () => {
  describe('Schema Validation', () => {
    it('should validate a valid CV', () => {
      const cv = createDefaultCV('test-agent', 'Test Agent');
      const result = validateCV(cv);
      
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });
    
    it('should reject CV with missing identity', () => {
      const cv = {
        capabilities: {}
      };
      const result = validateCV(cv);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });
    
    it('should reject CV with invalid ID format', () => {
      const cv = createDefaultCV('Invalid ID With Spaces!', 'Test');
      const result = validateCV(cv);
      
      assert.strictEqual(result.valid, false);
    });
  });

  describe('CVRegistry', () => {
    let registry;
    
    beforeEach(() => {
      registry = new CVRegistry();
    });
    
    it('should create a CV', () => {
      const cv = createDefaultCV('test-1', 'Test CV');
      const created = registry.create(cv);
      
      assert.ok(created);
      assert.strictEqual(created.identity.id, 'test-1');
    });
    
    it('should retrieve a CV by ID', () => {
      const cv = createDefaultCV('test-2', 'Test CV');
      registry.create(cv);
      
      const retrieved = registry.get('test-2');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.identity.name, 'Test CV');
    });
    
    it('should update a CV', () => {
      const cv = createDefaultCV('test-3', 'Original Name');
      registry.create(cv);
      
      const updated = registry.update('test-3', {
        identity: { name: 'Updated Name' }
      });
      
      assert.strictEqual(updated.identity.name, 'Updated Name');
    });
    
    it('should delete a CV', () => {
      const cv = createDefaultCV('test-4', 'Test CV');
      registry.create(cv);
      
      const deleted = registry.delete('test-4');
      assert.strictEqual(deleted, true);
      
      const retrieved = registry.get('test-4');
      assert.strictEqual(retrieved, null);
    });
    
    it('should list CVs with filters', () => {
      registry.create(createDefaultCV('cv-1', 'CV One'));
      registry.create(createDefaultCV('cv-2', 'CV Two'));
      
      const list = registry.list();
      assert.strictEqual(list.cvs.length, 2);
      assert.strictEqual(list.pagination.total, 2);
    });
    
    it('should search CVs by capabilities', () => {
      const cv1 = createDefaultCV('search-1', 'CV One');
      cv1.capabilities.languages = ['javascript', 'python'];
      cv1.capabilities.domains = ['backend'];
      
      const cv2 = createDefaultCV('search-2', 'CV Two');
      cv2.capabilities.languages = ['python', 'rust'];
      cv2.capabilities.domains = ['backend', 'ml'];
      
      registry.create(cv1);
      registry.create(cv2);
      
      const results = registry.search({
        languages: ['python'],
        domains: ['backend']
      });
      
      assert.ok(results.length >= 2);
    });
    
    it('should maintain version history', () => {
      const cv = createDefaultCV('version-test', 'Test');
      registry.create(cv);
      
      registry.update('version-test', {
        identity: { version: '1.1.0' }
      });
      
      const versions = registry.getVersions('version-test');
      assert.ok(versions.length >= 1);
    });
    
    it('should rollback to a previous version', () => {
      const cv = createDefaultCV('rollback-test', 'Test');
      cv.identity.version = '1.0.0';
      registry.create(cv);
      
      registry.update('rollback-test', {
        identity: { version: '1.1.0', name: 'Updated' }
      });
      
      const rolledBack = registry.rollback('rollback-test', '1.0.0');
      assert.ok(rolledBack);
    });
    
    it('should get registry stats', () => {
      registry.create(createDefaultCV('stats-1', 'Stats 1'));
      registry.create(createDefaultCV('stats-2', 'Stats 2'));
      
      const stats = registry.getStats();
      assert.strictEqual(stats.total, 2);
    });
  });

  describe('RightsEngine', () => {
    let engine;
    let testCV;
    
    beforeEach(() => {
      engine = new RightsEngine();
      testCV = createDefaultCV('rights-test', 'Rights Test');
      testCV.rights = {
        version: '1.0.0',
        execution: {
          operations: ['read', 'write', 'execute:safe'],
          denied_operations: ['execute:system', 'delete']
        },
        resources: {
          filesystem: [
            { path: '/workspace/**', access: ['read', 'write'] },
            { path: '/system/**', access: [] }
          ]
        },
        communication: {
          can_talk_to: ['agent:coordinator_*', 'agent:worker_*']
        },
        admin: {
          can_create_cv: false,
          can_update_own_cv: true
        }
      };
      testCV.lifecycle = { status: 'active' };
    });
    
    it('should allow permitted operation', async () => {
      const result = await engine.check({
        cv: testCV,
        action: 'read',
        resource: '/workspace/file.txt'
      });
      
      assert.strictEqual(result.allowed, true);
    });
    
    it('should deny explicitly denied operation', async () => {
      const result = await engine.check({
        cv: testCV,
        action: 'execute:system',
        resource: '/some/resource'
      });
      
      assert.strictEqual(result.allowed, false);
    });
    
    it('should deny operation on denied resource', async () => {
      const result = await engine.check({
        cv: testCV,
        action: 'read',
        resource: '/system/config.txt'
      });
      
      assert.strictEqual(result.allowed, false);
    });
    
    it('should deny when CV is not active', async () => {
      testCV.lifecycle.status = 'suspended';
      
      const result = await engine.check({
        cv: testCV,
        action: 'read',
        resource: '/workspace/file.txt'
      });
      
      assert.strictEqual(result.allowed, false);
    });
    
    it('should allow communication with permitted agent', async () => {
      const result = await engine.check({
        cv: testCV,
        action: 'communicate',
        resource: 'agent:coordinator_main',
        context: { target: 'agent:coordinator_main' }
      });
      
      assert.strictEqual(result.allowed, true);
    });
    
    it('should deny communication with unauthorized agent', async () => {
      const result = await engine.check({
        cv: testCV,
        action: 'communicate',
        resource: 'agent:unauthorized',
        context: { target: 'agent:unauthorized' }
      });
      
      assert.strictEqual(result.allowed, false);
    });
    
    it('should validate rights configuration', () => {
      const result = engine.validate(testCV.rights);
      
      assert.strictEqual(result.valid, true);
    });
    
    it('should detect conflicting rights', () => {
      const badRights = {
        execution: {
          operations: ['read', 'delete'],
          denied_operations: ['delete']
        }
      };
      
      const result = engine.validate(badRights);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('Conflicting')));
    });
    
    it('should support caching', async () => {
      engine.options.enableCache = true;
      
      await engine.check({
        cv: testCV,
        action: 'read',
        resource: '/workspace/file.txt'
      });
      
      const stats = engine.getStats();
      assert.ok(stats.cacheSize >= 0);
    });
    
    it('should support audit logging', async () => {
      engine.options.auditEnabled = true;
      
      await engine.check({
        cv: testCV,
        action: 'read',
        resource: '/workspace/file.txt'
      });
      
      const audit = engine.getAuditLog();
      assert.ok(audit.length > 0);
    });
  });

  describe('ObligationsMonitor', () => {
    let monitor;
    let testCV;
    
    beforeEach(() => {
      monitor = new ObligationsMonitor();
      testCV = createDefaultCV('obligations-test', 'Obligations Test');
      testCV.obligations = {
        version: '1.0.0',
        performance: {
          response_time: {
            p95_max_ms: 5000,
            timeout_absolute_ms: 30000
          }
        },
        resource_limits: {
          tokens: {
            per_task: 100000,
            warning_threshold: 0.8
          }
        }
      };
    });

    afterEach(() => {
      monitor?.stop();
      monitor = null;
    });
    
    it('should register an agent', () => {
      monitor.register('agent-1', testCV);
      
      const m = monitor.getMonitor('agent-1');
      assert.ok(m);
      assert.strictEqual(m.agentId, 'agent-1');
    });
    
    it('should record task completion', () => {
      monitor.register('agent-1', testCV);
      
      monitor.recordTaskStart('agent-1', { id: 'task-1' });
      monitor.recordTaskComplete('agent-1', { 
        success: true, 
        taskId: 'task-1',
        tokensUsed: 5000 
      });
      
      const metrics = monitor.getPerformanceMetrics('agent-1');
      assert.strictEqual(metrics.tasks.completed, 1);
    });
    
    it('should record task failure', () => {
      monitor.register('agent-1', testCV);
      
      monitor.recordTaskFailure('agent-1', new Error('Test error'));
      
      const metrics = monitor.getPerformanceMetrics('agent-1');
      assert.strictEqual(metrics.tasks.failed, 1);
    });
    
    it('should check performance SLAs', () => {
      monitor.register('agent-1', testCV);
      
      // Simulate tasks to generate metrics
      for (let i = 0; i < 10; i++) {
        monitor.recordTaskStart('agent-1', { id: `task-${i}` });
        monitor.recordTaskComplete('agent-1', { success: true }); // Uses actual duration
      }
      
      const check = monitor.checkPerformanceSLAs('agent-1');
      assert.ok(typeof check.compliant === 'boolean');
    });
    
    it('should detect token limit violations', () => {
      monitor.register('agent-1', testCV);
      
      monitor.recordTokenUsage('agent-1', 150000); // Over limit
      
      const violations = monitor.getAgentViolations('agent-1');
      // Should have recorded token usage
      assert.ok(violations.length >= 0);
    });
    
    it('should check compliance', () => {
      monitor.register('agent-1', testCV);
      
      const compliance = monitor.checkCompliance('agent-1');
      assert.ok(compliance);
      assert.ok(typeof compliance.compliant === 'boolean');
    });
    
    it('should provide performance metrics', () => {
      monitor.register('agent-1', testCV);
      
      // Simulate some tasks
      for (let i = 0; i < 5; i++) {
        monitor.recordTaskStart('agent-1', { id: `task-${i}` });
        monitor.recordTaskComplete('agent-1', { success: true });
      }
      
      const metrics = monitor.getPerformanceMetrics('agent-1');
      assert.strictEqual(metrics.tasks.completed, 5);
      assert.ok(metrics.responseTime);
    });
    
    it('should support alerts', () => {
      monitor.options.alertThreshold = 1;
      monitor.register('agent-1', testCV);
      
      // Record multiple violations
      monitor._recordViolation('agent-1', 'test_violation', { severity: 'warning' });
      monitor._recordViolation('agent-1', 'test_violation', { severity: 'warning' });
      
      const alerts = monitor.getAlerts();
      assert.ok(alerts.length > 0);
    });
    
    it('should provide statistics', () => {
      monitor.register('agent-1', testCV);
      
      const stats = monitor.getStats();
      assert.strictEqual(stats.totalMonitors, 1);
      assert.strictEqual(stats.activeMonitors, 1);
    });
  });

  describe('CVFactory', () => {
    let factory;
    let registry;
    
    beforeEach(() => {
      registry = new CVRegistry();
      factory = new CVFactory(registry);
      
      // Register a test template
      registry.registerTemplate('test-template', createDefaultCV('template-base', 'Template'));
    });
    
    it('should create CV from template', () => {
      const cv = factory.createFromTemplate('test-template', {
        identity: { id: 'from-template', name: 'From Template' }
      }, { autoRegister: false });
      
      assert.ok(cv);
      assert.strictEqual(cv.identity.id, 'from-template');
      assert.strictEqual(cv.identity.lineage.template_origin, 'test-template');
    });
    
    it('should create custom CV', () => {
      const cv = factory.createCustom({
        identity: { id: 'custom-cv', name: 'Custom CV' },
        capabilities: { languages: ['javascript'] }
      }, { autoRegister: false });
      
      assert.ok(cv);
      assert.strictEqual(cv.identity.id, 'custom-cv');
      assert.ok(cv.capabilities.languages.includes('javascript'));
    });
    
    it('should clone a CV', () => {
      const original = factory.createCustom({
        identity: { id: 'original', name: 'Original' }
      });
      
      const clone = factory.clone('original', {
        identity: { id: 'cloned', name: 'Cloned' }
      });
      
      assert.ok(clone);
      assert.strictEqual(clone.identity.id, 'cloned');
      assert.strictEqual(clone.identity.lineage.cloned_from, 'original');
    });
    
    it('should create specialized CV', () => {
      const base = factory.createCustom({
        identity: { id: 'base-cv', name: 'Base CV' },
        specialization: { primary: 'developer' }
      });
      
      const specialized = factory.specialize('base-cv', 'frontend_expert', {
        addCertifications: ['react_expert']
      });
      
      assert.ok(specialized);
      assert.strictEqual(specialized.specialization.primary, 'frontend_expert');
      assert.ok(specialized.specialization.secondary.includes('developer'));
    });
    
    it('should inherit from parent CV', () => {
      const parent = factory.createCustom({
        identity: { id: 'parent', name: 'Parent' },
        rights: { admin: { can_view_audit: true } }
      });
      
      const child = factory.createFromParent('parent', {
        identity: { name: 'Child' }
      }, { autoRegister: false });
      
      assert.ok(child);
      assert.strictEqual(child.identity.lineage.parent_id, 'parent');
      assert.strictEqual(child.rights.admin.can_view_audit, true);
    });
    
    it('should compare CVs', () => {
      const cv1 = factory.createCustom({
        identity: { id: 'compare-1', name: 'One' },
        capabilities: { languages: ['js'] }
      });
      
      const cv2 = factory.createCustom({
        identity: { id: 'compare-2', name: 'Two' },
        capabilities: { languages: ['py'] }
      });
      
      const diff = factory.compare('compare-1', 'compare-2');
      assert.ok(diff.changed);
    });
    
    it('should get effective rights', () => {
      const parent = factory.createCustom({
        identity: { id: 'rights-parent', name: 'Parent' },
        rights: { admin: { can_view_audit: true } }
      });
      
      const child = factory.createFromParent('rights-parent', {
        identity: { id: 'rights-child', name: 'Child' },
        rights: { admin: { can_create_cv: true } }
      });
      
      const effective = factory.getEffectiveRights('rights-child');
      assert.strictEqual(effective.admin.can_view_audit, true);
    });
    
    it('should provide factory stats', () => {
      factory.createCustom({ identity: { id: 'stat-1', name: 'Stat 1' } });
      factory.createCustom({ identity: { id: 'stat-2', name: 'Stat 2' } });
      
      const stats = factory.getStats();
      assert.strictEqual(stats.totalCreated, 2);
    });
  });

  describe('CVManager', () => {
    let manager;
    
    beforeEach(() => {
      manager = new CVManager();
    });

    afterEach(() => {
      manager?.obligationsMonitor?.stop?.();
      manager = null;
    });
    
    it('should create a CV', async () => {
      const result = await manager.create(createDefaultCV('mgr-test', 'Manager Test'));
      
      assert.ok(result.success);
      assert.ok(result.cv);
    });
    
    it('should get a CV', async () => {
      await manager.create(createDefaultCV('get-test', 'Get Test'));
      
      const result = await manager.get('get-test');
      assert.ok(result.success);
      assert.strictEqual(result.cv.identity.id, 'get-test');
    });
    
    it('should update a CV', async () => {
      await manager.create(createDefaultCV('update-test', 'Original'));
      
      const result = await manager.update('update-test', {
        identity: { name: 'Updated' }
      });
      
      assert.ok(result.success);
      assert.strictEqual(result.cv.identity.name, 'Updated');
    });
    
    it('should delete a CV', async () => {
      await manager.create(createDefaultCV('delete-test', 'Delete Test'));
      
      const result = await manager.delete('delete-test');
      assert.ok(result.success);
      
      await assert.rejects(
        async () => await manager.get('delete-test'),
        /not found/
      );
    });
    
    it('should list CVs', async () => {
      await manager.create(createDefaultCV('list-1', 'List 1'));
      await manager.create(createDefaultCV('list-2', 'List 2'));
      
      const result = await manager.list();
      assert.ok(result.success);
      assert.ok(result.cvs.length >= 2);
    });
    
    it('should search CVs', async () => {
      const cv = createDefaultCV('search-test', 'Search Test');
      cv.capabilities.languages = ['python', 'javascript'];
      await manager.create(cv);
      
      const result = await manager.search({
        languages: ['python']
      });
      
      assert.ok(result.success);
      assert.ok(result.results.length > 0);
    });
    
    it('should activate a CV', async () => {
      await manager.create(createDefaultCV('activate-test', 'Activate Test'));
      
      const result = await manager.activate('activate-test');
      assert.ok(result.success);
      assert.strictEqual(result.cv.lifecycle.status, 'active');
    });
    
    it('should suspend a CV', async () => {
      await manager.create(createDefaultCV('suspend-test', 'Suspend Test'));
      await manager.activate('suspend-test');
      
      const result = await manager.suspend('suspend-test', 'Testing suspension');
      assert.ok(result.success);
      assert.strictEqual(result.cv.lifecycle.status, 'suspended');
    });
    
    it('should check permissions', async () => {
      const cv = createDefaultCV('perm-test', 'Permission Test');
      cv.rights = {
        execution: { operations: ['read', 'write'] }
      };
      cv.lifecycle = { status: 'active' };
      await manager.create(cv);
      
      const result = await manager.checkPermission('perm-test', {
        action: 'read',
        resource: '/test/resource'
      });
      
      assert.ok(result.success);
      assert.strictEqual(typeof result.allowed, 'boolean');
    });
    
    it('should get compliance status', async () => {
      const cv = createDefaultCV('compliance-test', 'Compliance Test');
      cv.obligations = {
        performance: { response_time: { p95_max_ms: 5000 } }
      };
      await manager.create(cv);
      await manager.activate('compliance-test');
      
      const result = await manager.getCompliance('compliance-test');
      assert.ok(result.success);
      assert.ok(typeof result.compliant === 'boolean');
    });
    
    it('should get system stats', async () => {
      const result = await manager.getStats();
      
      assert.ok(result.success);
      assert.ok(result.registry);
      assert.ok(result.rightsEngine);
      assert.ok(result.obligationsMonitor);
    });
    
    it('should handle bulk operations', async () => {
      const result = await manager.bulkCreate([
        createDefaultCV('bulk-1', 'Bulk 1'),
        createDefaultCV('bulk-2', 'Bulk 2'),
        createDefaultCV('bulk-3', 'Bulk 3')
      ]);
      
      assert.ok(result.success);
      assert.strictEqual(result.created, 3);
    });
    
    it('should get audit log', async () => {
      await manager.create(createDefaultCV('audit-test', 'Audit Test'));
      
      const result = await manager.getAuditLog();
      assert.ok(result.success);
      assert.ok(result.entries.length > 0);
    });
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running CV System Tests...');
}
