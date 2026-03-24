/**
 * @fileoverview Merkle Tree Domain - Cryptographic tree for data verification
 * @module domains/merkle
 */

import { createHash } from 'crypto';

/**
 * Merkle proof structure
 * @typedef {Object} MerkleProof
 * @property {string} leaf - The leaf node hash
 * @property {string} root - The expected root hash
 * @property {string[]} siblings - Sibling hashes for verification
 * @property {number[]} indices - Path indices (0=left, 1=right)
 */

/**
 * Merkle Tree implementation with SHA-256 hashing
 * @class
 */
class MerkleTree {
  /**
   * Creates a new MerkleTree instance
   */
  constructor() {
    /** @type {string[]} */
    this.leaves = [];
    /** @type {string[]} */
    this.layers = [];
    /** @type {string|null} */
    this.root = null;
  }

  /**
   * Computes SHA-256 hash of data
   * @param {string} data - Data to hash
   * @returns {string} Hex-encoded hash
   * @private
   */
  _hash(data) {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Combines two hashes into a parent hash
   * @param {string} left - Left child hash
   * @param {string} right - Right child hash
   * @returns {string} Parent hash
   * @private
   */
  _combineHashes(left, right) {
    return this._hash(left + right);
  }

  /**
   * Builds the Merkle tree from leaf data
   * @param {string[]} leaves - Array of leaf data strings
   * @returns {MerkleTree} This instance for chaining
   */
  build(leaves) {
    if (!Array.isArray(leaves)) {
      throw new Error('Leaves must be an array');
    }

    if (leaves.length === 0) {
      this.leaves = [];
      this.layers = [];
      this.root = null;
      return this;
    }

    // Hash all leaves
    this.leaves = leaves.map(leaf => this._hash(String(leaf)));

    // Build layers bottom-up
    this.layers = [this.leaves];
    let currentLayer = this.leaves;

    while (currentLayer.length > 1) {
      const nextLayer = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = currentLayer[i + 1] || left; // Duplicate last if odd
        nextLayer.push(this._combineHashes(left, right));
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }

    this.root = currentLayer[0];
    return this;
  }

  /**
   * Gets the Merkle root hash
   * @returns {string|null} Root hash or null if tree is empty
   */
  getRoot() {
    return this.root;
  }

  /**
   * Finds the index of a leaf hash
   * @param {string} leafHash - Hash to find
   * @returns {number} Index or -1 if not found
   * @private
   */
  _findLeafIndex(leafHash) {
    return this.leaves.indexOf(leafHash);
  }

  /**
   * Generates a Merkle proof for a leaf
   * @param {string} leaf - The original leaf data
   * @returns {MerkleProof|null} Proof object or null if leaf not found
   */
  generateProof(leaf) {
    if (!this.root) {
      return null;
    }

    const leafHash = this._hash(String(leaf));
    let index = this._findLeafIndex(leafHash);

    if (index === -1) {
      return null;
    }

    const siblings = [];
    const indices = [];

    // Traverse up the tree
    for (let i = 0; i < this.layers.length - 1; i++) {
      const layer = this.layers[i];
      const isRight = index % 2 === 1;
      const siblingIndex = isRight ? index - 1 : index + 1;

      indices.push(isRight ? 1 : 0);

      if (siblingIndex < layer.length) {
        siblings.push(layer[siblingIndex]);
      } else {
        // Odd node - sibling is itself
        siblings.push(layer[index]);
      }

      index = Math.floor(index / 2);
    }

    return {
      leaf: leafHash,
      root: this.root,
      siblings,
      indices
    };
  }

  /**
   * Verifies a Merkle proof against the current root
   * @param {MerkleProof} proof - Proof to verify
   * @returns {boolean} True if proof is valid
   */
  verifyProof(proof) {
    if (!proof || !this.root) {
      return false;
    }
    return MerkleTree.verifyProofStatic(proof, this.root);
  }

  /**
   * Static method to verify a Merkle proof
   * @param {MerkleProof} proof - Proof object
   * @param {string} root - Expected root hash
   * @param {string} leaf - Original leaf data (not hash)
   * @returns {boolean} True if proof is valid
   */
  static verifyProofStatic(proof, root, leaf) {
    if (!proof || !root) {
      return false;
    }

    if (!Array.isArray(proof.siblings) || !Array.isArray(proof.indices)) {
      return false;
    }

    if (proof.siblings.length !== proof.indices.length) {
      return false;
    }

    const hash = (data) => createHash('sha256').update(data).digest('hex');

    let computedHash;

    if (leaf === undefined || leaf === null) {
      if (!proof.leaf) {
        return false;
      }
      computedHash = proof.leaf;
    } else {
      const providedLeafHash = hash(String(leaf));
      if (proof.leaf && proof.leaf !== providedLeafHash) {
        return false;
      }
      computedHash = providedLeafHash;
    }

    if (proof.root && proof.root !== root) {
      return false;
    }

    for (let i = 0; i < proof.siblings.length; i++) {
      const sibling = proof.siblings[i];
      const isRight = proof.indices[i] === 1;

      if (isRight) {
        computedHash = hash(sibling + computedHash);
      } else {
        computedHash = hash(computedHash + sibling);
      }
    }

    return computedHash === root;
  }

  /**
   * Gets the number of leaves
   * @returns {number} Leaf count
   */
  getLeafCount() {
    return this.leaves.length;
  }

  /**
   * Gets the tree height
   * @returns {number} Tree height (0 for empty, 1 for single leaf, etc.)
   */
  getHeight() {
    return this.layers.length;
  }
}

export { MerkleTree };
export default MerkleTree;
