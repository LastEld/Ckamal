/**
 * @fileoverview Thought Domain Integration Tests (TEST-004)
 * @module tests/domains/thought.integration
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ThoughtAudit } from '../../src/domains/thought/index.js';
import { MerkleTree } from '../../src/domains/merkle/index.js';

describe('Thought Domain Integration', () => {
  let audit;

  beforeEach(() => {
    audit = new ThoughtAudit();
  });

  describe('Thought Recording', () => {
    it('should record thought', async () => {
      const thought = 'Test thought content';
      const context = { agent: 'test-agent' };
      
      const record = audit.recordThought(thought, context);
      
      assert.ok(record, 'Record should be returned');
      assert.ok(record.id, 'Record should have an ID');
      assert.strictEqual(record.thought, thought, 'Thought content should match');
      assert.strictEqual(record.context.agent, 'test-agent', 'Agent should match');
      assert.ok(record.timestamp, 'Record should have timestamp');
      assert.ok(record.hash, 'Record should have hash');
      assert.strictEqual(record.index, 0, 'First record should have index 0');
      assert.strictEqual(record.previousHash, '0'.repeat(64), 'First record should have zero previous hash');
    });

    it('should record multiple thoughts', async () => {
      const records = [];
      
      for (let i = 0; i < 5; i++) {
        const record = audit.recordThought(`Thought ${i}`, { agent: 'test-agent' });
        records.push(record);
      }
      
      assert.strictEqual(records.length, 5, 'Should have 5 records');
      
      // Verify chain linkage
      for (let i = 1; i < records.length; i++) {
        assert.strictEqual(records[i].previousHash, records[i - 1].hash, `Record ${i} should link to previous`);
        assert.strictEqual(records[i].index, i, `Record ${i} should have correct index`);
      }
    });

    it('should reject thought without content', async () => {
      assert.throws(() => audit.recordThought('', { agent: 'test' }), /Thought content is required/);
      assert.throws(() => audit.recordThought(null, { agent: 'test' }), /Thought content is required/);
      assert.throws(() => audit.recordThought(undefined, { agent: 'test' }), /Thought content is required/);
    });

    it('should reject thought without agent', async () => {
      assert.throws(() => audit.recordThought('thought', {}), /Context with agent identifier is required/);
      assert.throws(() => audit.recordThought('thought', null), /Context with agent identifier is required/);
      assert.throws(() => audit.recordThought('thought', { agent: '' }), /Context with agent identifier is required/);
    });

    it('should include optional context fields', async () => {
      const context = {
        agent: 'test-agent',
        session: 'session-123',
        tags: ['tag1', 'tag2'],
        metadata: { key: 'value' }
      };
      
      const record = audit.recordThought('Test', context);
      
      assert.strictEqual(record.context.session, 'session-123');
      assert.deepStrictEqual(record.context.tags, ['tag1', 'tag2']);
      assert.deepStrictEqual(record.context.metadata, { key: 'value' });
    });

    it('should update merkle root after each record', async () => {
      const root1 = audit.getMerkleRoot();
      
      audit.recordThought('First', { agent: 'test' });
      const root2 = audit.getMerkleRoot();
      
      audit.recordThought('Second', { agent: 'test' });
      const root3 = audit.getMerkleRoot();
      
      assert.notStrictEqual(root1, root2, 'Root should change after first record');
      assert.notStrictEqual(root2, root3, 'Root should change after second record');
    });
  });

  describe('Chain Retrieval', () => {
    it('should get chain', async () => {
      audit.recordThought('Thought 1', { agent: 'agent-a' });
      audit.recordThought('Thought 2', { agent: 'agent-b' });
      audit.recordThought('Thought 3', { agent: 'agent-a' });
      
      const chain = audit.getChain();
      
      assert.strictEqual(chain.length, 3, 'Chain should have 3 records');
      assert.strictEqual(chain[0].thought, 'Thought 1');
      assert.strictEqual(chain[1].thought, 'Thought 2');
      assert.strictEqual(chain[2].thought, 'Thought 3');
    });

    it('should get empty chain when no records', async () => {
      const chain = audit.getChain();
      
      assert.deepStrictEqual(chain, [], 'Chain should be empty');
    });

    it('should filter chain by agent', async () => {
      audit.recordThought('A1', { agent: 'agent-a' });
      audit.recordThought('B1', { agent: 'agent-b' });
      audit.recordThought('A2', { agent: 'agent-a' });
      audit.recordThought('C1', { agent: 'agent-c' });
      
      const filtered = audit.getChain({ agent: 'agent-a' });
      
      assert.strictEqual(filtered.length, 2, 'Should have 2 records for agent-a');
      assert.ok(filtered.every(r => r.context.agent === 'agent-a'));
    });

    it('should filter chain by session', async () => {
      audit.recordThought('S1', { agent: 'test', session: 'session-1' });
      audit.recordThought('S2', { agent: 'test', session: 'session-2' });
      audit.recordThought('S1-2', { agent: 'test', session: 'session-1' });
      
      const filtered = audit.getChain({ session: 'session-1' });
      
      assert.strictEqual(filtered.length, 2, 'Should have 2 records for session-1');
    });

    it('should filter chain by tags', async () => {
      audit.recordThought('T1', { agent: 'test', tags: ['important'] });
      audit.recordThought('T2', { agent: 'test', tags: ['normal'] });
      audit.recordThought('T3', { agent: 'test', tags: ['important', 'urgent'] });
      
      const filtered = audit.getChain({ tags: ['important'] });
      
      assert.strictEqual(filtered.length, 2, 'Should have 2 records with important tag');
    });

    it('should filter chain by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      const tomorrow = new Date(now.getTime() + 86400000);
      
      audit.recordThought('Past', { agent: 'test' });
      audit.recordThought('Future', { agent: 'test' });
      
      const afterFilter = audit.getChain({ after: yesterday.toISOString() });
      const beforeFilter = audit.getChain({ before: tomorrow.toISOString() });
      
      assert.ok(afterFilter.length > 0, 'Should have records after yesterday');
      assert.ok(beforeFilter.length > 0, 'Should have records before tomorrow');
    });

    it('should get specific thought by ID', async () => {
      const record = audit.recordThought('Target', { agent: 'test' });
      audit.recordThought('Other', { agent: 'test' });
      
      const found = audit.getThought(record.id);
      
      assert.ok(found, 'Should find thought by ID');
      assert.strictEqual(found.thought, 'Target');
    });

    it('should return undefined for unknown ID', async () => {
      const found = audit.getThought('nonexistent-id');
      
      assert.strictEqual(found, undefined);
    });
  });

  describe('Chain Verification', () => {
    it('should verify chain', async () => {
      audit.recordThought('Thought 1', { agent: 'test' });
      audit.recordThought('Thought 2', { agent: 'test' });
      audit.recordThought('Thought 3', { agent: 'test' });
      
      const result = audit.verifyChain();
      
      assert.strictEqual(result.valid, true, 'Chain should be valid');
      assert.strictEqual(result.recordCount, 3, 'Should verify 3 records');
      assert.deepStrictEqual(result.errors, [], 'Should have no errors');
      assert.ok(result.rootHash, 'Should have root hash');
    });

    it('should verify empty chain', async () => {
      const result = audit.verifyChain();
      
      assert.strictEqual(result.valid, true, 'Empty chain should be valid');
      assert.strictEqual(result.recordCount, 0);
      assert.deepStrictEqual(result.errors, []);
    });

    it('should detect tampered record', async () => {
      audit.recordThought('Original', { agent: 'test' });
      audit.recordThought('Second', { agent: 'test' });
      
      // Tamper with the chain (this requires accessing private field, which we can't do directly)
      // Instead, we'll test by importing corrupted JSON
      const json = audit.exportToJSON();
      const corrupted = JSON.parse(json);
      corrupted.records[0].thought = 'Tampered';
      
      audit.clear();
      audit.importFromJSON(JSON.stringify(corrupted), false);
      
      const result = audit.verifyChain();
      
      assert.strictEqual(result.valid, false, 'Should detect tampering');
      assert.ok(result.errors.length > 0, 'Should have errors');
    });

    it('should detect broken chain link', async () => {
      const json = audit.exportToJSON();
      audit.recordThought('First', { agent: 'test' });
      audit.recordThought('Second', { agent: 'test' });
      
      const exported = JSON.parse(audit.exportToJSON());
      exported.records[1].previousHash = '0'.repeat(64); // Break the link
      
      audit.clear();
      audit.importFromJSON(JSON.stringify(exported), false);
      
      const result = audit.verifyChain();
      
      assert.strictEqual(result.valid, false, 'Should detect broken chain');
      assert.ok(result.errors.some(e => e.includes('broken chain')), 'Should report broken chain');
    });

    it('should verify merkle root integrity', async () => {
      audit.recordThought('Data', { agent: 'test' });
      audit.recordThought('More data', { agent: 'test' });
      
      const result = audit.verifyChain();
      
      assert.ok(result.rootHash, 'Should have merkle root');
      assert.strictEqual(result.rootHash, audit.getMerkleRoot(), 'Root hash should match');
    });
  });

  describe('Merkle Proof', () => {
    it('should get merkle proof', async () => {
      audit.recordThought('Thought 1', { agent: 'test' });
      audit.recordThought('Thought 2', { agent: 'test' });
      const record = audit.recordThought('Thought 3', { agent: 'test' });
      
      const proof = audit.getMerkleProof(record.id);
      
      assert.ok(proof, 'Should return proof');
      assert.ok(Array.isArray(proof), 'Proof should be an array');
    });

    it('should return null for unknown record ID', async () => {
      const proof = audit.getMerkleProof('nonexistent');
      
      assert.strictEqual(proof, null);
    });

    it('should verify merkle proof', async () => {
      audit.recordThought('A', { agent: 'test' });
      audit.recordThought('B', { agent: 'test' });
      const record = audit.recordThought('C', { agent: 'test' });
      
      const proof = audit.getMerkleProof(record.id);
      const root = audit.getMerkleRoot();
      
      const isValid = audit.verifyMerkleProof(record.hash, proof, root);
      
      assert.strictEqual(isValid, true, 'Proof should be valid');
    });

    it('should verify proof for all records', async () => {
      const records = [];
      for (let i = 0; i < 5; i++) {
        const record = audit.recordThought(`Record ${i}`, { agent: 'test' });
        records.push(record);
      }
      
      const root = audit.getMerkleRoot();
      
      for (const record of records) {
        const proof = audit.getMerkleProof(record.id);
        const isValid = audit.verifyMerkleProof(record.hash, proof, root);
        assert.strictEqual(isValid, true, `Proof for ${record.id} should be valid`);
      }
    });

    it('should reject invalid proof', async () => {
      audit.recordThought('A', { agent: 'test' });
      const record = audit.recordThought('B', { agent: 'test' });
      
      const proof = ['invalid_hash'];
      const root = audit.getMerkleRoot();
      
      const isValid = audit.verifyMerkleProof(record.hash, proof, root);
      
      assert.strictEqual(isValid, false, 'Invalid proof should be rejected');
    });
  });

  describe('Export/Import JSON', () => {
    it('should export to JSON', async () => {
      audit.recordThought('Thought 1', { agent: 'test', tags: ['tag1'] });
      audit.recordThought('Thought 2', { agent: 'test' });
      
      const json = audit.exportToJSON();
      
      assert.ok(json, 'Should export to JSON');
      const parsed = JSON.parse(json);
      assert.strictEqual(parsed.version, '1.0');
      assert.ok(parsed.exportedAt);
      assert.strictEqual(parsed.recordCount, 2);
      assert.ok(parsed.merkleRoot);
      assert.strictEqual(parsed.records.length, 2);
    });

    it('should export filtered chain', async () => {
      audit.recordThought('A1', { agent: 'agent-a' });
      audit.recordThought('B1', { agent: 'agent-b' });
      audit.recordThought('A2', { agent: 'agent-a' });
      
      const json = audit.exportToJSON({ agent: 'agent-a' });
      const parsed = JSON.parse(json);
      
      assert.strictEqual(parsed.recordCount, 2);
      assert.ok(parsed.records.every(r => r.context.agent === 'agent-a'));
    });

    it('should import from JSON', async () => {
      audit.recordThought('Original', { agent: 'test' });
      const json = audit.exportToJSON();
      
      audit.clear();
      const result = audit.importFromJSON(json);
      
      assert.strictEqual(result.valid, true, 'Import should be valid');
      assert.strictEqual(result.recordCount, 1, 'Should have 1 record');
      assert.strictEqual(audit.getChain().length, 1, 'Chain should have 1 record');
    });

    it('should import without verification', async () => {
      audit.recordThought('Test', { agent: 'test' });
      const json = audit.exportToJSON();
      
      audit.clear();
      const result = audit.importFromJSON(json, false);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(audit.getChain().length, 1);
    });

    it('should reject invalid JSON', async () => {
      assert.throws(() => audit.importFromJSON('not json'), SyntaxError);
    });

    it('should reject invalid chain data', async () => {
      assert.throws(() => audit.importFromJSON('{}'), /Invalid chain data/);
      assert.throws(() => audit.importFromJSON('{"records": "not array"}'), /Invalid chain data/);
    });

    it('should preserve data through export/import cycle', async () => {
      const original = audit.recordThought('Content', { 
        agent: 'my-agent', 
        session: 'session-1',
        tags: ['important'],
        metadata: { key: 'value' }
      });
      
      const json = audit.exportToJSON();
      audit.clear();
      audit.importFromJSON(json);
      
      const imported = audit.getThought(original.id);
      
      assert.ok(imported, 'Should find imported record');
      assert.strictEqual(imported.thought, 'Content');
      assert.strictEqual(imported.context.agent, 'my-agent');
      assert.strictEqual(imported.context.session, 'session-1');
      assert.deepStrictEqual(imported.context.tags, ['important']);
      assert.deepStrictEqual(imported.context.metadata, { key: 'value' });
      assert.strictEqual(imported.hash, original.hash, 'Hash should be preserved');
    });
  });

  describe('Statistics', () => {
    it('should get chain statistics', async () => {
      audit.recordThought('T1', { agent: 'agent-a', tags: ['tag1', 'tag2'] });
      audit.recordThought('T2', { agent: 'agent-b', tags: ['tag1'] });
      audit.recordThought('T3', { agent: 'agent-a', tags: ['tag2'] });
      
      const stats = audit.getStats();
      
      assert.strictEqual(stats.totalRecords, 3);
      assert.ok(stats.firstTimestamp);
      assert.ok(stats.lastTimestamp);
      assert.deepStrictEqual(stats.agents, { 'agent-a': 2, 'agent-b': 1 });
      assert.strictEqual(stats.tags['tag1'], 2);
      assert.strictEqual(stats.tags['tag2'], 2);
      assert.ok(stats.merkleRoot);
    });

    it('should return empty stats for empty chain', async () => {
      const stats = audit.getStats();
      
      assert.strictEqual(stats.totalRecords, 0);
      assert.strictEqual(stats.firstTimestamp, null);
      assert.strictEqual(stats.lastTimestamp, null);
      assert.deepStrictEqual(stats.agents, {});
      assert.deepStrictEqual(stats.tags, {});
    });
  });

  describe('Thought ↔ Merkle Integration', () => {
    it('should integrate thought chain with merkle tree', async () => {
      // Record multiple thoughts
      const records = [];
      for (let i = 0; i < 4; i++) {
        const record = audit.recordThought(`Thought ${i}`, { agent: 'test' });
        records.push(record);
      }
      
      // Create merkle tree from thought hashes
      const merkleTree = new MerkleTree();
      const hashes = records.map(r => r.hash);
      merkleTree.build(hashes);
      
      // Verify merkle root matches
      assert.strictEqual(audit.getMerkleRoot(), merkleTree.getRoot(), 
        'Thought audit merkle root should match standalone tree');
      
      // Verify each thought hash using merkle proofs
      for (const record of records) {
        const proof = audit.getMerkleProof(record.id);
        const isValid = audit.verifyMerkleProof(record.hash, proof, audit.getMerkleRoot());
        assert.strictEqual(isValid, true, `Thought ${record.id} should have valid merkle proof`);
      }
    });

    it('should detect tampering through merkle verification', async () => {
      audit.recordThought('Original', { agent: 'test' });
      audit.recordThought('Second', { agent: 'test' });
      
      const originalRoot = audit.getMerkleRoot();
      
      // Export, tamper, and re-import
      const exported = audit.exportToJSON();
      const data = JSON.parse(exported);
      data.records[0].thought = 'Tampered';
      
      audit.clear();
      audit.importFromJSON(JSON.stringify(data), false);
      
      // Verify chain should fail
      const verifyResult = audit.verifyChain();
      assert.strictEqual(verifyResult.valid, false, 'Tampered chain should be invalid');
      
      // Merkle root should differ
      assert.notStrictEqual(audit.getMerkleRoot(), originalRoot, 
        'Merkle root should change after tampering');
    });

    it('should maintain chain integrity across export/import', async () => {
      // Create a chain of thoughts
      const record1 = audit.recordThought('First', { agent: 'agent-1', tags: ['init'] });
      const record2 = audit.recordThought('Second', { agent: 'agent-2', tags: ['response'] });
      const record3 = audit.recordThought('Third', { agent: 'agent-1', tags: ['followup'] });
      
      const originalRoot = audit.getMerkleRoot();
      const originalVerify = audit.verifyChain();
      
      // Export and clear
      const json = audit.exportToJSON();
      audit.clear();
      
      // Re-import
      const importResult = audit.importFromJSON(json);
      
      // Verify integrity maintained
      assert.strictEqual(importResult.valid, true, 'Imported chain should be valid');
      assert.strictEqual(audit.getMerkleRoot(), originalRoot, 'Merkle root should be preserved');
      assert.strictEqual(audit.getChain().length, 3, 'Should have 3 records');
      
      // Verify chain linkage
      const chain = audit.getChain();
      assert.strictEqual(chain[1].previousHash, chain[0].hash, 'Chain link 1→2 preserved');
      assert.strictEqual(chain[2].previousHash, chain[1].hash, 'Chain link 2→3 preserved');
      
      // Verify merkle proofs still work
      for (const record of chain) {
        const proof = audit.getMerkleProof(record.id);
        const isValid = audit.verifyMerkleProof(record.hash, proof, audit.getMerkleRoot());
        assert.strictEqual(isValid, true, `Merkle proof for ${record.id} should be valid after import`);
      }
    });

    it('should support cross-verification with external merkle tree', async () => {
      // Record thoughts
      const records = [];
      for (let i = 0; i < 8; i++) {
        records.push(audit.recordThought(`Message ${i}`, { agent: `agent-${i % 2}` }));
      }
      
      // Get thought audit root
      const thoughtRoot = audit.getMerkleRoot();
      
      // Build independent merkle tree from thought hashes
      const externalTree = new MerkleTree();
      externalTree.build(records.map(r => r.hash));
      
      // Roots should match
      assert.strictEqual(thoughtRoot, externalTree.getRoot(), 
        'Thought audit root should match externally built tree');
      
      // Generate proof from external tree, verify with thought audit
      const testRecord = records[3];
      const externalProof = externalTree.generateProof(testRecord.hash);
      const isValid = await MerkleTree.verifyProofStatic(
        externalProof, 
        thoughtRoot, 
        testRecord.hash
      );
      
      assert.strictEqual(isValid, true, 'Cross-verification should succeed');
    });
  });

  describe('Clear and Reset', () => {
    it('should clear the audit chain', async () => {
      audit.recordThought('Test', { agent: 'test' });
      
      audit.clear();
      
      assert.strictEqual(audit.getChain().length, 0, 'Chain should be empty');
      assert.strictEqual(audit.getMerkleRoot(), null, 'Root should be null');
    });

    it('should allow recording after clear', async () => {
      audit.recordThought('Old', { agent: 'test' });
      audit.clear();
      
      const record = audit.recordThought('New', { agent: 'test' });
      
      assert.strictEqual(record.index, 0, 'New record should have index 0');
      assert.strictEqual(audit.getChain().length, 1);
    });
  });
});
