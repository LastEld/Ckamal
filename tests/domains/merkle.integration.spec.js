/**
 * @fileoverview Merkle Domain Integration Tests (TEST-003)
 * @module tests/domains/merkle.integration
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MerkleTree } from '../../src/domains/merkle/index.js';

describe('Merkle Domain Integration', () => {
  describe('Tree Creation', () => {
    it('should create tree', async () => {
      const tree = new MerkleTree();
      const leaves = ['data1', 'data2', 'data3', 'data4'];
      
      tree.build(leaves);
      
      assert.ok(tree.getRoot(), 'Tree should have a root hash');
      assert.strictEqual(tree.getLeafCount(), 4, 'Tree should have 4 leaves');
      assert.strictEqual(tree.getHeight(), 3, 'Tree height should be 3 for 4 leaves');
    });

    it('should create tree with odd number of leaves', async () => {
      const tree = new MerkleTree();
      const leaves = ['data1', 'data2', 'data3'];
      
      tree.build(leaves);
      
      assert.ok(tree.getRoot(), 'Tree should have a root hash');
      assert.strictEqual(tree.getLeafCount(), 3, 'Tree should have 3 leaves');
    });

    it('should handle empty leaves array', async () => {
      const tree = new MerkleTree();
      
      tree.build([]);
      
      assert.strictEqual(tree.getRoot(), null, 'Empty tree should have null root');
      assert.strictEqual(tree.getLeafCount(), 0, 'Empty tree should have 0 leaves');
    });

    it('should create deterministic root for same data', async () => {
      const tree1 = new MerkleTree();
      const tree2 = new MerkleTree();
      const leaves = ['a', 'b', 'c', 'd'];
      
      tree1.build(leaves);
      tree2.build(leaves);
      
      assert.strictEqual(tree1.getRoot(), tree2.getRoot(), 'Same data should produce same root');
    });
  });

  describe('Proof Generation', () => {
    it('should generate proof', async () => {
      const tree = new MerkleTree();
      const leaves = ['data1', 'data2', 'data3', 'data4'];
      tree.build(leaves);
      
      const proof = tree.generateProof('data2');
      
      assert.ok(proof, 'Proof should be generated');
      assert.ok(proof.leaf, 'Proof should have leaf hash');
      assert.ok(proof.root, 'Proof should have root hash');
      assert.ok(Array.isArray(proof.siblings), 'Proof should have siblings array');
      assert.ok(Array.isArray(proof.indices), 'Proof should have indices array');
      assert.strictEqual(proof.siblings.length, proof.indices.length, 'Siblings and indices should match');
    });

    it('should generate proof for first leaf', async () => {
      const tree = new MerkleTree();
      const leaves = ['data1', 'data2', 'data3', 'data4'];
      tree.build(leaves);
      
      const proof = tree.generateProof('data1');
      
      assert.ok(proof, 'Proof should be generated for first leaf');
      assert.strictEqual(proof.indices[0], 0, 'First leaf should have index 0 (left)');
    });

    it('should generate proof for last leaf', async () => {
      const tree = new MerkleTree();
      const leaves = ['data1', 'data2', 'data3', 'data4'];
      tree.build(leaves);
      
      const proof = tree.generateProof('data4');
      
      assert.ok(proof, 'Proof should be generated for last leaf');
      assert.strictEqual(proof.indices[0], 1, 'Last leaf should have index 1 (right)');
    });

    it('should return null for non-existent leaf', async () => {
      const tree = new MerkleTree();
      tree.build(['data1', 'data2']);
      
      const proof = tree.generateProof('nonexistent');
      
      assert.strictEqual(proof, null, 'Should return null for non-existent leaf');
    });

    it('should return null for empty tree', async () => {
      const tree = new MerkleTree();
      
      const proof = tree.generateProof('data');
      
      assert.strictEqual(proof, null, 'Should return null for empty tree');
    });
  });

  describe('Proof Verification', () => {
    it('should verify proof', async () => {
      const tree = new MerkleTree();
      const leaves = ['data1', 'data2', 'data3', 'data4'];
      tree.build(leaves);
      
      const proof = tree.generateProof('data2');
      const isValid = tree.verifyProof(proof);
      
      assert.strictEqual(isValid, true, 'Proof should be valid');
    });

    it('should verify proof for all leaves', async () => {
      const tree = new MerkleTree();
      const leaves = ['alpha', 'beta', 'gamma', 'delta'];
      tree.build(leaves);
      
      for (const leaf of leaves) {
        const proof = tree.generateProof(leaf);
        const isValid = tree.verifyProof(proof);
        assert.strictEqual(isValid, true, `Proof for ${leaf} should be valid`);
      }
    });

    it('should verify proof using static method', async () => {
      const tree = new MerkleTree();
      const leaves = ['data1', 'data2', 'data3', 'data4'];
      tree.build(leaves);
      
      const proof = tree.generateProof('data3');
      const isValid = await MerkleTree.verifyProofStatic(proof, tree.getRoot(), 'data3');
      
      assert.strictEqual(isValid, true, 'Static verification should succeed');
    });

    it('should reject tampered proof', async () => {
      const tree = new MerkleTree();
      tree.build(['data1', 'data2', 'data3', 'data4']);
      
      const proof = tree.generateProof('data2');
      proof.siblings[0] = 'tampered_hash';
      
      const isValid = tree.verifyProof(proof);
      
      assert.strictEqual(isValid, false, 'Tampered proof should be invalid');
    });

    it('should reject proof with wrong root', async () => {
      const tree = new MerkleTree();
      tree.build(['data1', 'data2', 'data3', 'data4']);
      
      const proof = tree.generateProof('data2');
      const isValid = await MerkleTree.verifyProofStatic(proof, 'wrong_root', 'data2');
      
      assert.strictEqual(isValid, false, 'Proof with wrong root should be invalid');
    });

    it('should reject proof with wrong leaf', async () => {
      const tree = new MerkleTree();
      tree.build(['data1', 'data2', 'data3', 'data4']);
      
      const proof = tree.generateProof('data2');
      const isValid = await MerkleTree.verifyProofStatic(proof, tree.getRoot(), 'data1');
      
      assert.strictEqual(isValid, false, 'Proof with wrong leaf should be invalid');
    });

    it('should handle null proof', async () => {
      const tree = new MerkleTree();
      tree.build(['data1', 'data2']);
      
      const isValid = tree.verifyProof(null);
      
      assert.strictEqual(isValid, false, 'Null proof should be invalid');
    });
  });

  describe('Tree Comparison', () => {
    it('should compare trees with same data', async () => {
      const tree1 = new MerkleTree();
      const tree2 = new MerkleTree();
      const leaves = ['apple', 'banana', 'cherry'];
      
      tree1.build(leaves);
      tree2.build(leaves);
      
      assert.strictEqual(tree1.getRoot(), tree2.getRoot(), 'Trees with same data should have same root');
    });

    it('should compare trees with different data', async () => {
      const tree1 = new MerkleTree();
      const tree2 = new MerkleTree();
      
      tree1.build(['a', 'b', 'c']);
      tree2.build(['x', 'y', 'z']);
      
      assert.notStrictEqual(tree1.getRoot(), tree2.getRoot(), 'Trees with different data should have different roots');
    });

    it('should detect single leaf change', async () => {
      const tree1 = new MerkleTree();
      const tree2 = new MerkleTree();
      
      tree1.build(['a', 'b', 'c', 'd']);
      tree2.build(['a', 'b', 'changed', 'd']);
      
      assert.notStrictEqual(tree1.getRoot(), tree2.getRoot(), 'Single leaf change should change root');
    });

    it('should detect order sensitivity', async () => {
      const tree1 = new MerkleTree();
      const tree2 = new MerkleTree();
      
      tree1.build(['a', 'b', 'c']);
      tree2.build(['c', 'b', 'a']);
      
      assert.notStrictEqual(tree1.getRoot(), tree2.getRoot(), 'Different order should produce different root');
    });

    it('should compare trees with different sizes', async () => {
      const tree1 = new MerkleTree();
      const tree2 = new MerkleTree();
      
      tree1.build(['a', 'b']);
      tree2.build(['a', 'b', 'c']);
      
      assert.notStrictEqual(tree1.getRoot(), tree2.getRoot(), 'Different sized trees should have different roots');
      assert.strictEqual(tree1.getHeight(), 2, 'Tree1 height should be 2');
      assert.strictEqual(tree2.getHeight(), 3, 'Tree2 height should be 3');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single leaf', async () => {
      const tree = new MerkleTree();
      tree.build(['only_one']);
      
      assert.ok(tree.getRoot(), 'Single leaf tree should have root');
      assert.strictEqual(tree.getLeafCount(), 1, 'Should have 1 leaf');
      assert.strictEqual(tree.getHeight(), 1, 'Height should be 1');
      
      const proof = tree.generateProof('only_one');
      assert.strictEqual(proof.siblings.length, 0, 'Single leaf should have empty proof');
      assert.strictEqual(tree.verifyProof(proof), true, 'Single leaf proof should be valid');
    });

    it('should handle large number of leaves', async () => {
      const tree = new MerkleTree();
      const leaves = Array.from({ length: 1000 }, (_, i) => `data_${i}`);
      
      tree.build(leaves);
      
      assert.ok(tree.getRoot(), 'Large tree should have root');
      assert.strictEqual(tree.getLeafCount(), 1000, 'Should have 1000 leaves');
      
      // Verify a few random leaves
      const randomIndices = [0, 99, 500, 999];
      for (const idx of randomIndices) {
        const proof = tree.generateProof(leaves[idx]);
        assert.ok(tree.verifyProof(proof), `Proof for leaf ${idx} should be valid`);
      }
    });

    it('should handle numeric data', async () => {
      const tree = new MerkleTree();
      tree.build([123, 456, 789]);
      
      assert.ok(tree.getRoot(), 'Tree with numeric data should have root');
      
      const proof = tree.generateProof(456);
      assert.ok(tree.verifyProof(proof), 'Proof for numeric data should be valid');
    });

    it('should handle special characters in data', async () => {
      const tree = new MerkleTree();
      const leaves = ['hello\nworld', 'tab\there', 'unicode: 🎉', 'quotes: "test"'];
      
      tree.build(leaves);
      
      for (const leaf of leaves) {
        const proof = tree.generateProof(leaf);
        assert.ok(tree.verifyProof(proof), `Proof for special char data should be valid`);
      }
    });

    it('should throw error for non-array input', async () => {
      const tree = new MerkleTree();
      
      assert.throws(() => tree.build('not an array'), /Leaves must be an array/);
      assert.throws(() => tree.build(null), /Leaves must be an array/);
      assert.throws(() => tree.build(undefined), /Leaves must be an array/);
    });
  });
});
