/**
 * @fileoverview Memory QR (Query-Response) layer with graph-based memory traversal
 * @module analysis/memory-qr
 */

import { LRUCache } from './lru-cache.js';

/**
 * @typedef {Object} MemoryNode
 * @property {string} id - Node identifier
 * @property {string} type - Node type ('query', 'response', 'concept', 'document')
 * @property {string} content - Node content
 * @property {Object} metadata - Additional metadata
 * @property {number} timestamp - Creation timestamp
 * @property {number} accessCount - Access frequency
 * @property {number} lastAccessed - Last access timestamp
 */

/**
 * @typedef {Object} MemoryEdge
 * @property {string} from - Source node ID
 * @property {string} to - Target node ID
 * @property {string} type - Relationship type
 * @property {number} weight - Edge weight (0-1)
 * @property {Object} metadata - Additional metadata
 * @property {number} timestamp - Creation timestamp
 */

/**
 * @typedef {Object} PathResult
 * @property {string[]} nodes - Node IDs in path
 * @property {string[]} edges - Edge types traversed
 * @property {number} totalWeight - Sum of edge weights
 * @property {number} length - Path length
 */

/**
 * @typedef {Object} SearchResult
 * @property {MemoryNode} node - Found node
 * @property {number} score - Relevance score
 * @property {number} depth - Depth from starting node
 * @property {string[]} path - Path taken to reach node
 */

/**
 * Memory QR (Query-Response) layer with graph-based traversal
 */
export class MemoryQR {
  /**
   * Relationship types
   * @type {Object<string, string>}
   */
  static RELATIONSHIPS = {
    RESPONSE_TO: 'responds_to',
    RELATED_TO: 'related_to',
    SIMILAR_TO: 'similar_to',
    CONTAINS: 'contains',
    DERIVED_FROM: 'derived_from',
    CONTEXT_FOR: 'context_for',
    EXPANDS_ON: 'expands_on',
    CONTRADICTS: 'contradicts',
    SUPPORTS: 'supports'
  };

  /**
   * Creates a new MemoryQR instance
   * @param {Object} options - Configuration options
   * @param {number} [options.maxNodes=100000] - Maximum nodes in memory
   * @param {number} [options.maxEdgesPerNode=100] - Maximum edges per node
   * @param {number} [options.cacheSize=10000] - LRU cache size for hot paths
   * @param {number} [options.defaultSearchDepth=3] - Default BFS depth
   * @param {number} [options.decayHalfLifeMs=86400000] - Half-life for edge decay (24h default)
   */
  constructor(options = {}) {
    this.maxNodes = options.maxNodes ?? 100000;
    this.maxEdgesPerNode = options.maxEdgesPerNode ?? 100;
    this.defaultSearchDepth = options.defaultSearchDepth ?? 3;
    this.decayHalfLifeMs = options.decayHalfLifeMs ?? 24 * 60 * 60 * 1000;

    /** @type {Map<string, MemoryNode>} */
    this.nodes = new Map();
    
    /** @type {Map<string, Map<string, MemoryEdge>>} */
    this.adjacencyList = new Map();
    
    /** @type {Map<string, MemoryEdge>} */
    this.edges = new Map();

    // Index for fast lookup
    /** @type {Map<string, Set<string>>} */
    this.typeIndex = new Map();
    
    /** @type {Map<string, Set<string>>} */
    this.contentIndex = new Map();

    // LRU cache for hot paths
    this.pathCache = new LRUCache({
      maxSize: options.cacheSize ?? 10000,
      ttlMs: 60 * 60 * 1000 // 1 hour
    });

    // Statistics
    this.stats = {
      nodeCount: 0,
      edgeCount: 0,
      queryCount: 0,
      traversalCount: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Add a node to the memory graph
   * @param {string} id - Node identifier
   * @param {string} type - Node type
   * @param {string} content - Node content
   * @param {Object} [metadata={}] - Additional metadata
   * @returns {MemoryNode} Created node
   */
  addNode(id, type, content, metadata = {}) {
    // Evict oldest nodes if at capacity
    if (this.nodes.size >= this.maxNodes && !this.nodes.has(id)) {
      this._evictOldestNode();
    }

    const node = {
      id,
      type,
      content,
      metadata,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now()
    };

    this.nodes.set(id, node);
    this.adjacencyList.set(id, new Map());

    // Update indices
    if (!this.typeIndex.has(type)) {
      this.typeIndex.set(type, new Set());
    }
    this.typeIndex.get(type).add(id);

    // Simple content indexing (word-based)
    this._indexContent(id, content);

    this.stats.nodeCount = this.nodes.size;
    return node;
  }

  /**
   * Get a node by ID
   * @param {string} id - Node identifier
   * @returns {MemoryNode|null} Node or null if not found
   */
  getNode(id) {
    const node = this.nodes.get(id);
    if (node) {
      node.accessCount++;
      node.lastAccessed = Date.now();
    }
    return node ?? null;
  }

  /**
   * Remove a node and all its edges
   * @param {string} id - Node identifier
   * @returns {boolean} True if node was removed
   */
  removeNode(id) {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove all edges
    const edges = this.adjacencyList.get(id);
    if (edges) {
      for (const targetId of edges.keys()) {
        this._removeEdgeFromAdjacency(id, targetId);
      }
    }

    // Remove incoming edges
    for (const [, targets] of this.adjacencyList) {
      if (targets.has(id)) {
        targets.delete(id);
        this.stats.edgeCount--;
      }
    }

    // Remove from indices
    this.typeIndex.get(node.type)?.delete(id);
    this._unindexContent(id, node.content);

    // Remove node
    this.nodes.delete(id);
    this.adjacencyList.delete(id);

    this.stats.nodeCount = this.nodes.size;
    return true;
  }

  /**
   * Connect two nodes with a relationship
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} relationship - Relationship type
   * @param {Object} [options={}] - Connection options
   * @param {number} [options.weight=1.0] - Edge weight (0-1)
   * @param {Object} [options.metadata={}] - Additional metadata
   * @returns {MemoryEdge|null} Created edge or null if nodes don't exist
   */
  connect(from, to, relationship, options = {}) {
    const fromNode = this.nodes.get(from);
    const toNode = this.nodes.get(to);

    if (!fromNode || !toNode) {
      return null;
    }

    const weight = Math.max(0, Math.min(1, options.weight ?? 1.0));
    
    const edge = {
      from,
      to,
      type: relationship,
      weight,
      metadata: options.metadata ?? {},
      timestamp: Date.now()
    };

    const edgeKey = this._edgeKey(from, to);
    this.edges.set(edgeKey, edge);

    // Add to adjacency list
    const fromEdges = this.adjacencyList.get(from);
    if (fromEdges.size >= this.maxEdgesPerNode) {
      this._evictWeakestEdge(from);
    }
    fromEdges.set(to, edge);

    this.stats.edgeCount = this.edges.size;
    return edge;
  }

  /**
   * Disconnect two nodes
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @returns {boolean} True if edge was removed
   */
  disconnect(from, to) {
    const edgeKey = this._edgeKey(from, to);
    const existed = this.edges.has(edgeKey);

    if (existed) {
      this.edges.delete(edgeKey);
      this.adjacencyList.get(from)?.delete(to);
      this.stats.edgeCount = this.edges.size;
    }

    return existed;
  }

  /**
   * Find nodes related to a query
   * @param {string} query - Query text or node ID
   * @param {Object} [options={}] - Search options
   * @param {number} [options.depth] - Search depth (default: this.defaultSearchDepth)
   * @param {string[]} [options.types] - Filter by node types
   * @param {string[]} [options.relationships] - Filter by relationship types
   * @param {number} [options.limit=10] - Maximum results
   * @param {number} [options.minWeight=0] - Minimum edge weight
   * @returns {SearchResult[]} Related nodes
   */
  findRelated(query, options = {}) {
    this.stats.queryCount++;

    const depth = options.depth ?? this.defaultSearchDepth;
    const limit = options.limit ?? 10;
    const minWeight = options.minWeight ?? 0;
    const typeFilter = options.types ? new Set(options.types) : null;
    const relFilter = options.relationships ? new Set(options.relationships) : null;

    // Check if query is a node ID
    let startNodes = [];
    const exactNode = this.nodes.get(query);
    
    if (exactNode) {
      startNodes.push(exactNode);
    } else {
      // Search by content
      startNodes = this._findNodesByContent(query);
    }

    if (startNodes.length === 0) {
      return [];
    }

    const results = new Map();
    const visited = new Set();
    const queue = [];

    // Initialize BFS
    for (const node of startNodes) {
      queue.push({ node, depth: 0, path: [node.id] });
      visited.add(node.id);
    }

    // BFS traversal
    while (queue.length > 0) {
      const { node, depth: currentDepth, path } = queue.shift();

      if (currentDepth >= depth) continue;

      const neighbors = this.adjacencyList.get(node.id);
      if (!neighbors) continue;

      for (const [targetId, edge] of neighbors) {
        if (visited.has(targetId)) continue;
        
        // Apply filters
        if (edge.weight < minWeight) continue;
        if (relFilter && !relFilter.has(edge.type)) continue;

        const targetNode = this.nodes.get(targetId);
        if (!targetNode) continue;
        if (typeFilter && !typeFilter.has(targetNode.type)) continue;

        // Calculate score with decay
        const age = Date.now() - edge.timestamp;
        const decayFactor = Math.pow(0.5, age / this.decayHalfLifeMs);
        const score = edge.weight * decayFactor * (1 - currentDepth / depth);

        if (!results.has(targetId) || results.get(targetId).score < score) {
          results.set(targetId, {
            node: targetNode,
            score,
            depth: currentDepth + 1,
            path: [...path, targetId]
          });
        }

        visited.add(targetId);
        queue.push({ node: targetNode, depth: currentDepth + 1, path: [...path, targetId] });
      }
    }

    this.stats.traversalCount++;

    // Sort by score and return top results
    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Find path between two nodes
   * @param {string} start - Start node ID
   * @param {string} end - End node ID
   * @param {Object} [options={}] - Path options
   * @param {number} [options.maxDepth=10] - Maximum search depth
   * @param {string[]} [options.allowedRelationships] - Allowed relationship types
   * @returns {PathResult|null} Path result or null if no path found
   */
  getPath(start, end, options = {}) {
    const maxDepth = options.maxDepth ?? 10;
    const allowedRels = options.allowedRelationships ? 
      new Set(options.allowedRelationships) : null;

    // Check cache first
    const cacheKey = `${start}->${end}`;
    const cached = this.pathCache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }
    this.stats.cacheMisses++;

    if (!this.nodes.has(start) || !this.nodes.has(end)) {
      return null;
    }

    // BFS to find shortest path
    const queue = [[start]];
    const visited = new Set([start]);

    while (queue.length > 0) {
      const path = queue.shift();
      
      if (path.length > maxDepth) continue;

      const current = path[path.length - 1];

      if (current === end) {
        // Reconstruct path with edges
        const result = this._reconstructPath(path);
        this.pathCache.set(cacheKey, result);
        return result;
      }

      const neighbors = this.adjacencyList.get(current);
      if (!neighbors) continue;

      for (const [targetId, edge] of neighbors) {
        if (visited.has(targetId)) continue;
        if (allowedRels && !allowedRels.has(edge.type)) continue;

        visited.add(targetId);
        queue.push([...path, targetId]);
      }
    }

    return null;
  }

  /**
   * Get memory context for a query
   * @param {string} query - Query text
   * @param {Object} [options={}] - Context options
   * @param {number} [options.depth=2] - Context depth
   * @param {number} [options.limit=5] - Maximum context items
   * @returns {Object} Memory context
   */
  getContext(query, options = {}) {
    const depth = options.depth ?? 2;
    const limit = options.limit ?? 5;

    const related = this.findRelated(query, { depth, limit: limit * 2 });
    
    // Group by type
    const byType = {};
    for (const result of related.slice(0, limit)) {
      const type = result.node.type;
      if (!byType[type]) {
        byType[type] = [];
      }
      byType[type].push({
        id: result.node.id,
        content: result.node.content,
        score: result.score,
        metadata: result.node.metadata
      });
    }

    return {
      query,
      totalResults: related.length,
      byType,
      allResults: related.slice(0, limit).map(r => ({
        id: r.node.id,
        type: r.node.type,
        content: r.node.content,
        score: r.score,
        depth: r.depth,
        metadata: r.node.metadata
      }))
    };
  }

  /**
   * Get subgraph around a node
   * @param {string} nodeId - Center node ID
   * @param {number} [depth=2] - Depth of subgraph
   * @returns {Object} Subgraph with nodes and edges
   */
  getSubgraph(nodeId, depth = 2) {
    const centerNode = this.nodes.get(nodeId);
    if (!centerNode) return { nodes: [], edges: [] };

    const subgraphNodes = new Set([nodeId]);
    const subgraphEdges = [];
    const queue = [{ id: nodeId, depth: 0 }];
    const visited = new Set([nodeId]);

    while (queue.length > 0) {
      const { id, depth: currentDepth } = queue.shift();

      if (currentDepth >= depth) continue;

      const neighbors = this.adjacencyList.get(id);
      if (!neighbors) continue;

      for (const [targetId, edge] of neighbors) {
        if (!visited.has(targetId)) {
          visited.add(targetId);
          subgraphNodes.add(targetId);
          queue.push({ id: targetId, depth: currentDepth + 1 });
        }
        subgraphEdges.push(edge);
      }
    }

    return {
      nodes: Array.from(subgraphNodes).map(id => this.nodes.get(id)),
      edges: subgraphEdges
    };
  }

  /**
   * Prune old or weak connections
   * @param {Object} [options={}] - Pruning options
   * @param {number} [options.maxAgeMs] - Remove edges older than this
   * @param {number} [options.minWeight=0.1] - Remove edges below this weight
   * @param {number} [options.minAccessCount=1] - Remove nodes with fewer accesses
   * @returns {Object} Pruning statistics
   */
  prune(options = {}) {
    const maxAgeMs = options.maxAgeMs ?? this.decayHalfLifeMs * 7; // 7 half-lives
    const minWeight = options.minWeight ?? 0.1;
    const minAccessCount = options.minAccessCount ?? 1;
    const now = Date.now();

    let edgesRemoved = 0;
    let nodesRemoved = 0;

    // Remove old/weak edges
    for (const [, edge] of this.edges) {
      const age = now - edge.timestamp;
      if (age > maxAgeMs || edge.weight < minWeight) {
        this.disconnect(edge.from, edge.to);
        edgesRemoved++;
      }
    }

    // Remove rarely accessed nodes
    for (const [id, node] of this.nodes) {
      if (node.accessCount < minAccessCount && 
          (now - node.timestamp) > maxAgeMs) {
        this.removeNode(id);
        nodesRemoved++;
      }
    }

    return { edgesRemoved, nodesRemoved };
  }

  /**
   * Get memory statistics
   * @returns {Object} Memory statistics
   */
  getStats() {
    const typeCounts = {};
    for (const [type, ids] of this.typeIndex) {
      typeCounts[type] = ids.size;
    }

    return {
      ...this.stats,
      nodeTypes: typeCounts,
      cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
        ? this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)
        : 0
    };
  }

  /**
   * Export memory graph to JSON
   * @returns {Object} Serializable graph
   */
  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      stats: this.getStats()
    };
  }

  /**
   * Import memory graph from JSON
   * @param {Object} data - Graph data
   * @param {Array<MemoryNode>} data.nodes - Nodes to import
   * @param {Array<MemoryEdge>} data.edges - Edges to import
   */
  fromJSON(data) {
    this.clear();

    for (const node of data.nodes) {
      this.nodes.set(node.id, { ...node });
      this.adjacencyList.set(node.id, new Map());
      
      if (!this.typeIndex.has(node.type)) {
        this.typeIndex.set(node.type, new Set());
      }
      this.typeIndex.get(node.type).add(node.id);
      
      this._indexContent(node.id, node.content);
    }

    for (const edge of data.edges) {
      this.connect(edge.from, edge.to, edge.type, {
        weight: edge.weight,
        metadata: edge.metadata
      });
    }

    this.stats.nodeCount = this.nodes.size;
    this.stats.edgeCount = this.edges.size;
  }

  /**
   * Clear all memory
   */
  clear() {
    this.nodes.clear();
    this.adjacencyList.clear();
    this.edges.clear();
    this.typeIndex.clear();
    this.contentIndex.clear();
    this.pathCache.clear();

    this.stats = {
      nodeCount: 0,
      edgeCount: 0,
      queryCount: 0,
      traversalCount: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  // Private helper methods

  /**
   * Generate edge key
   * @private
   */
  _edgeKey(from, to) {
    return `${from}->${to}`;
  }

  /**
   * Remove edge from adjacency list
   * @private
   */
  _removeEdgeFromAdjacency(from, to) {
    this.adjacencyList.get(from)?.delete(to);
  }

  /**
   * Evict the oldest node
   * @private
   */
  _evictOldestNode() {
    let oldestId = null;
    let oldestTime = Infinity;

    for (const [id, node] of this.nodes) {
      if (node.lastAccessed < oldestTime) {
        oldestTime = node.lastAccessed;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.removeNode(oldestId);
    }
  }

  /**
   * Evict weakest edge from a node
   * @private
   */
  _evictWeakestEdge(nodeId) {
    const edges = this.adjacencyList.get(nodeId);
    if (!edges || edges.size === 0) return;

    let weakestId = null;
    let weakestWeight = Infinity;

    for (const [targetId, edge] of edges) {
      if (edge.weight < weakestWeight) {
        weakestWeight = edge.weight;
        weakestId = targetId;
      }
    }

    if (weakestId) {
      this.disconnect(nodeId, weakestId);
    }
  }

  /**
   * Index node content
   * @private
   */
  _indexContent(nodeId, content) {
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    for (const word of words) {
      if (word.length < 3) continue;
      
      if (!this.contentIndex.has(word)) {
        this.contentIndex.set(word, new Set());
      }
      this.contentIndex.get(word).add(nodeId);
    }
  }

  /**
   * Unindex node content
   * @private
   */
  _unindexContent(nodeId, content) {
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    for (const word of words) {
      this.contentIndex.get(word)?.delete(nodeId);
    }
  }

  /**
   * Find nodes by content match
   * @private
   */
  _findNodesByContent(query) {
    const words = query.toLowerCase().match(/\b\w+\b/g) || [];
    const matches = new Map();

    for (const word of words) {
      if (word.length < 3) continue;
      
      const nodeIds = this.contentIndex.get(word);
      if (nodeIds) {
        for (const id of nodeIds) {
          matches.set(id, (matches.get(id) ?? 0) + 1);
        }
      }
    }

    // Sort by match count
    return Array.from(matches.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => this.nodes.get(id))
      .filter(Boolean);
  }

  /**
   * Reconstruct path with edges
   * @private
   */
  _reconstructPath(nodeIds) {
    const edges = [];
    let totalWeight = 0;

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const edgeKey = this._edgeKey(nodeIds[i], nodeIds[i + 1]);
      const edge = this.edges.get(edgeKey);
      if (edge) {
        edges.push(edge.type);
        totalWeight += edge.weight;
      }
    }

    return {
      nodes: nodeIds,
      edges,
      totalWeight,
      length: nodeIds.length - 1
    };
  }
}

export default MemoryQR;
