/**
 * @fileoverview Merkle Tree Repository with proofs for CogniMesh v5.0
 * @module db/repositories/merkle
 */

import { createHash } from 'crypto';
import { BaseRepository } from './base-repository.js';

/**
 * @typedef {Object} MerkleNode
 * @property {number} id - Node ID
 * @property {string} hash - Node hash (hex)
 * @property {number} [left_child_id] - Left child node ID
 * @property {number} [right_child_id] - Right child node ID
 * @property {number} [parent_id] - Parent node ID
 * @property {number} [leaf_index] - Index if leaf node
 * @property {string} [data_hash] - Hash of leaf data
 * @property {number} [tree_id] - Associated tree ID
 * @property {('leaf'|'internal'|'root')} node_type - Node type
 * @property {number} level - Tree level
 * @property {string} created_at - Creation timestamp
 */

/**
 * @typedef {Object} MerkleTree
 * @property {number} id - Tree ID
 * @property {string} name - Tree name
 * @property {string} root_hash - Root hash (hex)
 * @property {number} leaf_count - Number of leaves
 * @property {number} [context_id] - Associated context
 * @property {string} [description] - Tree description
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 */

/**
 * @typedef {Object} MerkleProof
 * @property {string} leafHash - Hash of the leaf
 * @property {number} leafIndex - Index of the leaf
 * @property {string} rootHash - Root hash
 * @property {ProofStep[]} path - Proof path
 * @property {boolean} verified - Verification status
 */

/**
 * @typedef {Object} ProofStep
 * @property {string} hash - Sibling hash
 * @property {('left'|'right')} position - Position relative to current
 */

/**
 * Merkle tree repository with proof generation
 * @extends BaseRepository
 */
export class MerkleRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'name',
    'tree_type',
    'root_hash',
    'leaf_count',
    'depth',
    'context_id',
    'description',
    'entity_type',
    'entity_id',
    'metadata'
  ];

  /**
   * Create a merkle repository
   * @param {import('../connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'merkle_trees', 'id', MerkleRepository.COLUMNS);
  }

  /**
   * Create a new Merkle tree with nodes
   * @param {Object} treeData - Tree metadata
   * @param {string[]} leafHashes - Array of leaf hashes
   * @returns {Promise<MerkleTree>} Created tree
   */
  async createTree(treeData, leafHashes) {
    if (!Array.isArray(leafHashes) || leafHashes.length === 0) {
      throw new Error('Cannot build tree with no leaves');
    }

    const tree = await this.create({
      ...treeData,
      tree_type: treeData.tree_type || 'generic',
      leaf_count: leafHashes.length,
      depth: 0,
      root_hash: '',
      metadata: typeof treeData.metadata === 'string'
        ? treeData.metadata
        : JSON.stringify(treeData.metadata || {})
    });

    try {
      const { rootHash, depth } = await this.#buildTree(tree.id, leafHashes);
      await this.update(tree.id, { root_hash: rootHash, depth });
      return this.findById(tree.id);
    } catch (error) {
      await this.deleteTree(tree.id).catch(() => {});
      throw error;
    }
  }

  /**
   * Build Merkle tree nodes
   * @private
   * @param {number} treeId - Tree ID
   * @param {string[]} leafHashes - Leaf hashes
   * @returns {Promise<{rootHash: string, depth: number}>} Root hash and depth
   */
  async #buildTree(treeId, leafHashes) {
    let currentLevel = [];
    
    // Create leaf nodes
    for (let i = 0; i < leafHashes.length; i++) {
      const nodeId = await this.#createNode({
        tree_id: treeId,
        hash: leafHashes[i],
        leaf_index: i,
        data_hash: leafHashes[i],
        node_type: 'leaf',
        level: 0
      });
      currentLevel.push({ id: nodeId, hash: leafHashes[i] });
    }

    // Build up the tree
    let level = 1;
    while (currentLevel.length > 1) {
      const nextLevel = [];
      
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left; // Duplicate last if odd
        
        const combinedHash = this.#hashPairSync(left.hash, right.hash);
        
        const nodeId = await this.#createNode({
          tree_id: treeId,
          hash: combinedHash,
          left_child_id: left.id,
          right_child_id: right.id !== left.id ? right.id : null,
          node_type: currentLevel.length === 2 ? 'root' : 'internal',
          level
        });

        // Update children with parent
        await this.#updateNodeParent(left.id, nodeId);
        if (right.id !== left.id) {
          await this.#updateNodeParent(right.id, nodeId);
        }

        nextLevel.push({ id: nodeId, hash: combinedHash });
      }

      currentLevel = nextLevel;
      level++;
    }

    // Mark the final node as root if not already
    if (currentLevel.length === 1) {
      await this.pool.run(
        'UPDATE merkle_nodes SET node_type = ? WHERE id = ?',
        ['root', currentLevel[0].id]
      );
      return {
        rootHash: currentLevel[0].hash,
        depth: Math.max(level - 1, 0)
      };
    }

    throw new Error('Failed to build tree: unexpected state');
  }

  /**
   * Create a node record
   * @private
   * @param {Object} nodeData - Node data
   * @returns {Promise<number>} Node ID
   */
  async #createNode(nodeData) {
    const columns = Object.keys(nodeData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(nodeData);

    const sql = `
      INSERT INTO merkle_nodes (${columns.join(', ')})
      VALUES (${placeholders})
    `;

    const result = await this.pool.run(sql, values);
    return result.lastID;
  }

  /**
   * Update node's parent
   * @private
   * @param {number} nodeId - Node ID
   * @param {number} parentId - Parent ID
   */
  async #updateNodeParent(nodeId, parentId) {
    await this.pool.run(
      'UPDATE merkle_nodes SET parent_id = ? WHERE id = ?',
      [parentId, nodeId]
    );
  }

  /**
   * Hash two child hashes together
   * @private
   * @param {string} left - Left hash
   * @param {string} right - Right hash
   * @returns {string} Combined hash
   */
  #hashPair(left, right) {
    return this.#hashPairSync(left, right);
  }

  /**
   * Get Merkle proof for a leaf
   * @param {number} treeId - Tree ID
   * @param {number} leafIndex - Leaf index
   * @returns {Promise<MerkleProof|null>}
   */
  async getProof(treeId, leafIndex) {
    // Get the leaf node
    const leaf = await this.pool.get(
      `SELECT * FROM merkle_nodes WHERE tree_id = ? AND leaf_index = ? AND node_type = 'leaf'`,
      [treeId, leafIndex]
    );

    if (!leaf) return null;

    // Get the tree root
    const tree = await this.findById(treeId);
    if (!tree) return null;

    // Build proof path
    const path = await this.#buildProofPath(leaf);

    return {
      leafHash: leaf.hash,
      leafIndex,
      rootHash: tree.root_hash,
      path,
      verified: false
    };
  }

  /**
   * Build proof path from leaf to root
   * @private
   * @param {MerkleNode} leaf - Leaf node
   * @returns {Promise<ProofStep[]>}
   */
  async #buildProofPath(leaf) {
    const path = [];
    let current = leaf;

    while (current.parent_id) {
      const parent = await this.pool.get(
        'SELECT * FROM merkle_nodes WHERE id = ?',
        [current.parent_id]
      );

      if (!parent) break;

      // Determine sibling
      const isLeft = parent.left_child_id === current.id;
      const siblingId = isLeft ? parent.right_child_id : parent.left_child_id;

      if (siblingId) {
        const sibling = await this.pool.get(
          'SELECT hash FROM merkle_nodes WHERE id = ?',
          [siblingId]
        );

        if (sibling) {
          path.push({
            hash: sibling.hash,
            position: isLeft ? 'right' : 'left'
          });
        }
      }

      current = parent;
    }

    return path;
  }

  /**
   * Verify a Merkle proof
   * @param {MerkleProof} proof - Proof to verify
   * @returns {Promise<boolean>}
   */
  async verifyProof(proof) {
    let currentHash = proof.leafHash;

    for (const step of proof.path) {
      if (step.position === 'left') {
        currentHash = await this.#hashPair(step.hash, currentHash);
      } else {
        currentHash = await this.#hashPair(currentHash, step.hash);
      }
    }

    return currentHash === proof.rootHash;
  }

  /**
   * Verify proof synchronously (using sync hash)
   * @param {MerkleProof} proof - Proof to verify
   * @returns {boolean}
   */
  verifyProofSync(proof) {
    let currentHash = proof.leafHash;

    for (const step of proof.path) {
      if (step.position === 'left') {
        currentHash = this.#hashPairSync(step.hash, currentHash);
      } else {
        currentHash = this.#hashPairSync(currentHash, step.hash);
      }
    }

    return currentHash === proof.rootHash;
  }

  /**
   * Synchronous hash pair
   * @private
   * @param {string} left
   * @param {string} right
   * @returns {string}
   */
  #hashPairSync(left, right) {
    const hash = createHash('sha256');
    hash.update(left + right);
    return hash.digest('hex');
  }

  /**
   * Get all nodes in a tree
   * @param {number} treeId - Tree ID
   * @returns {Promise<MerkleNode[]>}
   */
  async getTreeNodes(treeId) {
    return this.pool.all(
      `SELECT * FROM merkle_nodes WHERE tree_id = ? ORDER BY level, id`,
      [treeId]
    );
  }

  /**
   * Get tree structure as nested object
   * @param {number} treeId - Tree ID
   * @returns {Promise<Object|null>}
   */
  async getTreeStructure(treeId) {
    const root = await this.pool.get(
      `SELECT * FROM merkle_nodes WHERE tree_id = ? AND node_type = 'root'`,
      [treeId]
    );

    if (!root) return null;

    return this.#buildNodeStructure(root);
  }

  /**
   * Recursively build node structure
   * @private
   * @param {MerkleNode} node
   * @returns {Promise<Object>}
   */
  async #buildNodeStructure(node) {
    const result = {
      id: node.id,
      hash: node.hash,
      type: node.node_type,
      level: node.level
    };

    if (node.node_type === 'leaf') {
      result.leafIndex = node.leaf_index;
      result.dataHash = node.data_hash;
    } else {
      if (node.left_child_id) {
        const left = await this.pool.get(
          'SELECT * FROM merkle_nodes WHERE id = ?',
          [node.left_child_id]
        );
        if (left) {
          result.left = await this.#buildNodeStructure(left);
        }
      }

      if (node.right_child_id) {
        const right = await this.pool.get(
          'SELECT * FROM merkle_nodes WHERE id = ?',
          [node.right_child_id]
        );
        if (right) {
          result.right = await this.#buildNodeStructure(right);
        }
      }
    }

    return result;
  }

  /**
   * Get root hash for a tree
   * @param {number} treeId - Tree ID
   * @returns {Promise<string|null>}
   */
  async getRootHash(treeId) {
    const tree = await this.findById(treeId);
    return tree?.root_hash || null;
  }

  /**
   * Update tree (only metadata, not structure)
   * @param {number} id - Tree ID
   * @param {Object} data - Update data
   * @returns {Promise<MerkleTree|undefined>}
   */
  async updateMetadata(id, data) {
    // Only allow metadata updates
    const allowedFields = ['name', 'description', 'context_id'];
    const filteredData = {};
    
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        filteredData[key] = data[key];
      }
    }

    return this.update(id, filteredData);
  }

  /**
   * Find trees by context
   * @param {number} contextId - Context ID
   * @returns {Promise<MerkleTree[]>}
   */
  async findByContext(contextId) {
    return this.findAll({
      where: { context_id: contextId },
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
  }

  /**
   * Find tree by root hash
   * @param {string} rootHash - Root hash
   * @returns {Promise<MerkleTree|undefined>}
   */
  async findByRootHash(rootHash) {
    return this.pool.get(
      `SELECT * FROM ${this.tableName} WHERE root_hash = ?`,
      [rootHash]
    );
  }

  /**
   * Get tree statistics
   * @param {number} treeId - Tree ID
   * @returns {Promise<Object>}
   */
  async getStatistics(treeId) {
    const sql = `
      SELECT 
        COUNT(*) as total_nodes,
        COUNT(CASE WHEN node_type = 'leaf' THEN 1 END) as leaf_nodes,
        COUNT(CASE WHEN node_type = 'internal' THEN 1 END) as internal_nodes,
        MAX(level) as tree_depth
      FROM merkle_nodes
      WHERE tree_id = ?
    `;

    return this.pool.get(sql, [treeId]);
  }

  /**
   * Delete tree and all its nodes
   * @param {number} id - Tree ID
   * @returns {Promise<boolean>}
   */
  async deleteTree(id) {
    await this.pool.run(
      'DELETE FROM merkle_nodes WHERE tree_id = ?',
      [id]
    );

    return this.delete(id);
  }

  /**
   * Bulk create proofs for all leaves
   * @param {number} treeId - Tree ID
   * @returns {Promise<MerkleProof[]>}
   */
  async generateAllProofs(treeId) {
    const leaves = await this.pool.all(
      `SELECT leaf_index FROM merkle_nodes 
       WHERE tree_id = ? AND node_type = 'leaf'
       ORDER BY leaf_index`,
      [treeId]
    );

    const proofs = [];
    for (const leaf of leaves) {
      const proof = await this.getProof(treeId, leaf.leaf_index);
      if (proof) proofs.push(proof);
    }

    return proofs;
  }

  /**
   * Compare two trees
   * @param {number} treeId1 - First tree ID
   * @param {number} treeId2 - Second tree ID
   * @returns {Promise<Object>}
   */
  async compareTrees(treeId1, treeId2) {
    const [tree1, tree2] = await Promise.all([
      this.findById(treeId1),
      this.findById(treeId2)
    ]);

    if (!tree1 || !tree2) {
      throw new Error('One or both trees not found');
    }

    // Find different leaf hashes
    const sql = `
      SELECT 
        l1.leaf_index,
        l1.hash as hash1,
        l2.hash as hash2,
        CASE 
          WHEN l1.hash = l2.hash THEN 'same'
          ELSE 'different'
        END as status
      FROM merkle_nodes l1
      LEFT JOIN merkle_nodes l2 
        ON l1.leaf_index = l2.leaf_index AND l2.tree_id = ?
      WHERE l1.tree_id = ? AND l1.node_type = 'leaf'
    `;

    const comparisons = await this.pool.all(sql, [treeId2, treeId1]);

    return {
      tree1: { id: treeId1, rootHash: tree1.root_hash },
      tree2: { id: treeId2, rootHash: tree2.root_hash },
      identical: tree1.root_hash === tree2.root_hash,
      leafComparisons: comparisons
    };
  }
}

export default MerkleRepository;
