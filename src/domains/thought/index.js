/**
 * @fileoverview Thought Domain - Audit chain with Merkle verification
 * @module domains/thought
 */

import { createHash } from 'crypto';
import { MerkleTree } from '../merkle/index.js';

/**
 * Thought record
 * @typedef {Object} ThoughtRecord
 * @property {string} id - Unique thought identifier
 * @property {string} thought - The thought content
 * @property {Object} context - Context metadata
 * @property {string} context.agent - Agent/source identifier
 * @property {string} [context.session] - Session ID
 * @property {string[]} [context.tags] - Thought tags
 * @property {Object} [context.metadata] - Additional metadata
 * @property {string} timestamp - ISO timestamp
 * @property {string} hash - Thought content hash
 * @property {string} previousHash - Hash of previous thought (chain link)
 * @property {number} index - Position in chain
 */

/**
 * Chain verification result
 * @typedef {Object} VerificationResult
 * @property {boolean} valid - Whether chain is valid
 * @property {number} recordCount - Number of records checked
 * @property {string[]} errors - List of errors found
 * @property {string} rootHash - Merkle root hash
 */

/**
 * Chain filters
 * @typedef {Object} ChainFilters
 * @property {string} [agent] - Filter by agent
 * @property {string[]} [tags] - Filter by tags
 * @property {string} [after] - Filter after timestamp
 * @property {string} [before] - Filter before timestamp
 * @property {string} [session] - Filter by session
 */

/**
 * Merkle tree node
 * @typedef {Object} MerkleNode
 * @property {string} hash - Node hash
 * @property {MerkleNode} [left] - Left child
 * @property {MerkleNode} [right] - Right child
 * @property {ThoughtRecord} [record] - Leaf record
 */

/**
 * Thought audit chain with Merkle tree verification
 */
export class ThoughtAudit {
  /**
   * @private
   * @type {ThoughtRecord[]}
   */
  #chain = [];

  /**
   * @private
   * @type {string|null}
   */
  #merkleRoot = null;

  /**
   * Creates a new ThoughtAudit instance
   */
  constructor() {
    this.#chain = [];
    this.#merkleRoot = null;
  }

  /**
   * Generate hash for data
   * @private
   * @param {string} data - Data to hash
   * @returns {string} SHA-256 hash
   */
  #hash(data) {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate thought record hash
   * @private
   * @param {ThoughtRecord} record - Thought record
   * @returns {string} Record hash
   */
  #hashRecord(record) {
    const data = JSON.stringify({
      thought: record.thought,
      context: record.context,
      timestamp: record.timestamp,
      previousHash: record.previousHash,
      index: record.index
    });
    return this.#hash(data);
  }

  /**
   * Generate ID for thought
   * @private
   * @returns {string}
   */
  #generateId() {
    return `thought_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record a new thought in the audit chain
   * @param {string} thought - The thought content
   * @param {Object} context - Context metadata
   * @param {string} context.agent - Agent/source identifier
   * @param {string} [context.session] - Session ID
   * @param {string[]} [context.tags] - Thought tags
   * @param {Object} [context.metadata] - Additional metadata
   * @returns {ThoughtRecord} The recorded thought
   */
  recordThought(thought, context) {
    if (!thought || typeof thought !== 'string') {
      throw new Error('Thought content is required');
    }

    if (!context?.agent || typeof context.agent !== 'string') {
      throw new Error('Context with agent identifier is required');
    }

    const previousRecord = this.#chain[this.#chain.length - 1];
    const previousHash = previousRecord ? previousRecord.hash : '0'.repeat(64);

    const record = {
      id: this.#generateId(),
      thought,
      context: {
        agent: context.agent,
        session: context.session ?? null,
        tags: context.tags ?? [],
        metadata: context.metadata ?? {}
      },
      timestamp: new Date().toISOString(),
      hash: '', // Will be calculated
      previousHash,
      index: this.#chain.length
    };

    record.hash = this.#hashRecord(record);
    this.#chain.push(record);
    this.#merkleRoot = this.#buildMerkleTree();

    return record;
  }

  /**
   * Build Merkle tree and return root hash
   * @private
   * @returns {string} Merkle root hash
   */
  #buildMerkleTree() {
    if (this.#chain.length === 0) {
      return null;
    }

    const merkleTree = new MerkleTree();
    merkleTree.build(this.#chain.map(record => this.#hashRecord(record)));
    return merkleTree.getRoot();
  }

  /**
   * Get the full chain or filtered subset
   * @param {ChainFilters} [filters] - Optional filters
   * @returns {ThoughtRecord[]} Filtered chain records
   */
  getChain(filters = {}) {
    let records = [...this.#chain];

    if (filters.agent) {
      records = records.filter(r => r.context.agent === filters.agent);
    }

    if (filters.session) {
      records = records.filter(r => r.context.session === filters.session);
    }

    if (filters.tags && filters.tags.length > 0) {
      records = records.filter(r => 
        filters.tags.some(tag => r.context.tags.includes(tag))
      );
    }

    if (filters.after) {
      const afterDate = new Date(filters.after);
      if (!Number.isNaN(afterDate.getTime())) {
        records = records.filter(r => new Date(r.timestamp) > afterDate);
      }
    }

    if (filters.before) {
      const beforeDate = new Date(filters.before);
      if (!Number.isNaN(beforeDate.getTime())) {
        records = records.filter(r => new Date(r.timestamp) < beforeDate);
      }
    }

    return records;
  }

  /**
   * Get a specific thought by ID
   * @param {string} id - Thought ID
   * @returns {ThoughtRecord|undefined}
   */
  getThought(id) {
    return this.#chain.find(r => r.id === id);
  }

  /**
   * Verify the integrity of the audit chain
   * @returns {VerificationResult} Verification result
   */
  verifyChain() {
    const result = {
      valid: true,
      recordCount: this.#chain.length,
      errors: [],
      rootHash: this.#merkleRoot
    };

    if (this.#chain.length === 0) {
      return result;
    }

    // Verify chain links
    for (let i = 0; i < this.#chain.length; i++) {
      const record = this.#chain[i];

      // Verify index
      if (record.index !== i) {
        result.valid = false;
        result.errors.push(`Record at position ${i} has incorrect index ${record.index}`);
      }

      // Verify hash
      const expectedHash = this.#hashRecord(record);
      if (record.hash !== expectedHash) {
        result.valid = false;
        result.errors.push(`Record ${i} hash mismatch: expected ${expectedHash}, got ${record.hash}`);
      }

      // Verify previous hash
      if (i === 0) {
        if (record.previousHash !== '0'.repeat(64)) {
          result.valid = false;
          result.errors.push(`First record has incorrect previous hash`);
        }
      } else {
        const previousRecord = this.#chain[i - 1];
        if (record.previousHash !== previousRecord.hash) {
          result.valid = false;
          result.errors.push(`Record ${i} has broken chain link`);
        }
      }
    }

    // Verify Merkle root
    const currentRoot = this.#buildMerkleTree();
    if (currentRoot !== this.#merkleRoot) {
      result.valid = false;
      result.errors.push(`Merkle root mismatch: chain may have been tampered`);
    }

    result.rootHash = currentRoot;
    return result;
  }

  /**
   * Get Merkle proof for a specific record
   * @param {string} recordId - Record ID
   * @returns {string[]|null} Proof path (hashes) or null if not found
   */
  getMerkleProof(recordId) {
    const record = this.getThought(recordId);
    if (!record) {
      return null;
    }

    const merkleTree = new MerkleTree();
    merkleTree.build(this.#chain.map(entry => this.#hashRecord(entry)));

    const proof = merkleTree.generateProof(this.#hashRecord(record));
    if (!proof) {
      return null;
    }

    return proof.siblings.map((hash, index) => ({
      hash,
      isCurrentRight: proof.indices[index] === 1
    }));
  }

  /**
   * Verify a Merkle proof
   * @param {string} recordHash - Record hash to verify
   * @param {string[]} proof - Proof path
   * @param {string} expectedRoot - Expected Merkle root
   * @returns {boolean} True if proof is valid
   */
  verifyMerkleProof(recordHash, proof, expectedRoot) {
    if (!recordHash || !Array.isArray(proof) || !expectedRoot) {
      return false;
    }

    const treeProof = {
      leaf: this.#hash(String(recordHash)),
      root: expectedRoot,
      siblings: [],
      indices: []
    };

    for (const step of proof) {
      if (!step || typeof step.hash !== 'string' || typeof step.isCurrentRight !== 'boolean') {
        return false;
      }

      treeProof.siblings.push(step.hash);
      treeProof.indices.push(step.isCurrentRight ? 1 : 0);
    }

    return MerkleTree.verifyProofStatic(treeProof, expectedRoot, recordHash);
  }

  /**
   * Get chain statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const agents = new Map();
    const tags = new Map();

    for (const record of this.#chain) {
      // Count by agent
      const agentCount = agents.get(record.context.agent) ?? 0;
      agents.set(record.context.agent, agentCount + 1);

      // Count by tag
      for (const tag of record.context.tags) {
        const tagCount = tags.get(tag) ?? 0;
        tags.set(tag, tagCount + 1);
      }
    }

    return {
      totalRecords: this.#chain.length,
      firstTimestamp: this.#chain[0]?.timestamp ?? null,
      lastTimestamp: this.#chain[this.#chain.length - 1]?.timestamp ?? null,
      agents: Object.fromEntries(agents),
      tags: Object.fromEntries(tags),
      merkleRoot: this.#merkleRoot
    };
  }

  /**
   * Export chain to JSON
   * @param {ChainFilters} [filters] - Optional filters
   * @returns {string} JSON string
   */
  exportToJSON(filters = {}) {
    const records = this.getChain(filters);
    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      merkleRoot: this.#merkleRoot,
      records
    }, null, 2);
  }

  /**
   * Import chain from JSON
   * @param {string} json - JSON string
   * @param {boolean} [verify=true] - Verify after import
   * @returns {VerificationResult} Import result
   */
  importFromJSON(json, verify = true) {
    const data = JSON.parse(json);
    
    if (!data.records || !Array.isArray(data.records)) {
      throw new Error('Invalid chain data: records array required');
    }

    this.#chain = data.records;
    this.#merkleRoot = this.#buildMerkleTree();

    return verify ? this.verifyChain() : { valid: true, recordCount: this.#chain.length, errors: [], rootHash: this.#merkleRoot };
  }

  /**
   * Get the Merkle root hash
   * @returns {string|null}
   */
  getMerkleRoot() {
    return this.#merkleRoot;
  }

  /**
   * Clear the audit chain
   * @returns {void}
   */
  clear() {
    this.#chain = [];
    this.#merkleRoot = null;
  }
}

export default ThoughtAudit;
