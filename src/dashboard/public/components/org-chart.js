/**
 * CogniMesh v5.0 - Org Chart Component
 * SVG-based hierarchical tree visualization with pan, zoom, and agent details
 */

/* global Toast */

const orgChartWindow = typeof window !== 'undefined' ? window : globalThis;

/**
 * OrgChartComponent - Interactive organizational chart for agent hierarchy
 * 
 * Features:
 * - SVG-based tree visualization
 * - Drag to pan, scroll to zoom
 * - Click for agent details
 * - Real-time status updates via WebSocket
 * - Search and filtering
 * - Collapsible nodes
 */
class OrgChartComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    
    // State
    this.treeData = null;
    this.loading = false;
    this.selectedNode = null;
    this.expandedNodes = new Set(['root']);
    
    // Viewport state for pan/zoom
    this.viewport = {
      x: 0,
      y: 0,
      scale: 1,
      minScale: 0.2,
      maxScale: 3,
    };
    
    // Pan state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.lastPan = { x: 0, y: 0 };
    
    // Node dimensions
    this.nodeWidth = 220;
    this.nodeHeight = 100;
    this.levelHeight = 160;
    this.siblingGap = 40;
    
    // Provider colors
    this.providerColors = {
      claude: '#d97706',
      codex: '#10b981',
      kimi: '#8b5cf6',
      unknown: '#6b7280',
    };
    
    // Status colors
    this.statusColors = {
      online: '#22c55e',
      busy: '#3b82f6',
      offline: '#6b7280',
      error: '#ef4444',
      unknown: '#9ca3af',
    };
    
    // DOM elements (cached)
    this.elements = {};
    
    // Bind methods
    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleNodeClick = this.handleNodeClick.bind(this);
    this.handleWsMessage = this.handleWsMessage.bind(this);
    
    // Initialize WebSocket listeners
    this.setupWebSocketListeners();
  }
  
  // ============================================
  // Initialization
  // ============================================
  
  /**
   * Initialize the component
   */
  async initialize() {
    this.cacheElements();
    this.setupEventListeners();
    this.setupSVG();
    await this.loadOrgChart();
  }
  
  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      container: document.getElementById('orgChartContainer'),
      svg: document.getElementById('orgChartSvg'),
      treeGroup: document.getElementById('orgChartTree'),
      linksGroup: document.getElementById('orgChartLinks'),
      nodesGroup: document.getElementById('orgChartNodes'),
      minimap: document.getElementById('orgChartMinimap'),
      searchInput: document.getElementById('orgChartSearch'),
      zoomInBtn: document.getElementById('orgChartZoomIn'),
      zoomOutBtn: document.getElementById('orgChartZoomOut'),
      zoomResetBtn: document.getElementById('orgChartZoomReset'),
      expandAllBtn: document.getElementById('orgChartExpandAll'),
      collapseAllBtn: document.getElementById('orgChartCollapseAll'),
      refreshBtn: document.getElementById('orgChartRefresh'),
      detailPanel: document.getElementById('orgChartDetail'),
      detailContent: document.getElementById('orgChartDetailContent'),
      closeDetailBtn: document.getElementById('orgChartCloseDetail'),
    };
  }
  
  /**
   * Setup SVG structure
   */
  setupSVG() {
    if (!this.elements.svg) return;
    
    // Clear existing content
    this.elements.svg.innerHTML = '';
    
    // Create defs for markers and patterns
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <!-- Arrow marker for links -->
      <marker id="arrowhead" markerWidth="10" markerHeight="7" 
              refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="var(--border-color, #374151)" />
      </marker>
      
      <!-- Glow filter for selected nodes -->
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      
      <!-- Drop shadow -->
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
      </filter>
      
      <!-- Pattern for grid background -->
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border-color, #374151)" stroke-width="0.5" opacity="0.3"/>
      </pattern>
    `;
    this.elements.svg.appendChild(defs);
    
    // Background rect for pan events
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('id', 'orgChartBg');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', 'transparent');
    this.elements.svg.appendChild(bg);
    
    // Grid background (optional, shown at lower opacity)
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    grid.setAttribute('id', 'orgChartGrid');
    grid.setAttribute('width', '10000');
    grid.setAttribute('height', '10000');
    grid.setAttribute('x', '-5000');
    grid.setAttribute('y', '-5000');
    grid.setAttribute('fill', 'url(#grid)');
    grid.style.pointerEvents = 'none';
    
    // Main transform group
    this.elements.treeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.elements.treeGroup.setAttribute('id', 'orgChartTree');
    
    // Links layer (behind nodes)
    this.elements.linksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.elements.linksGroup.setAttribute('id', 'orgChartLinks');
    
    // Nodes layer
    this.elements.nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.elements.nodesGroup.setAttribute('id', 'orgChartNodes');
    
    this.elements.treeGroup.appendChild(grid);
    this.elements.treeGroup.appendChild(this.elements.linksGroup);
    this.elements.treeGroup.appendChild(this.elements.nodesGroup);
    this.elements.svg.appendChild(this.elements.treeGroup);
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    const { svg, searchInput, zoomInBtn, zoomOutBtn, zoomResetBtn,
            expandAllBtn, collapseAllBtn, refreshBtn, closeDetailBtn } = this.elements;
    
    // SVG interactions
    if (svg) {
      svg.addEventListener('wheel', this.handleWheel, { passive: false });
      svg.addEventListener('mousedown', this.handleMouseDown);
      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('mouseup', this.handleMouseUp);
    }
    
    // Search
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    }
    
    // Zoom controls
    zoomInBtn?.addEventListener('click', () => this.zoom(1.2));
    zoomOutBtn?.addEventListener('click', () => this.zoom(0.8));
    zoomResetBtn?.addEventListener('click', () => this.resetView());
    
    // Expand/Collapse
    expandAllBtn?.addEventListener('click', () => this.expandAll());
    collapseAllBtn?.addEventListener('click', () => this.collapseAll());
    
    // Refresh
    refreshBtn?.addEventListener('click', () => this.loadOrgChart());
    
    // Detail panel
    closeDetailBtn?.addEventListener('click', () => this.closeDetailPanel());
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeDetailPanel();
      }
    });
  }
  
  /**
   * Setup WebSocket listeners for real-time updates
   */
  setupWebSocketListeners() {
    if (!this.ws) return;
    
    this.ws.addEventListener('message', this.handleWsMessage);
  }
  
  /**
   * Handle WebSocket messages
   */
  handleWsMessage(event) {
    const message = event.detail || event.data;
    if (!message) return;
    
    // Handle org chart specific updates
    if (message.type?.startsWith('orgchart:') || message.type?.startsWith('agent:')) {
      this.handleOrgUpdate(message);
    }
  }
  
  /**
   * Handle org chart updates
   */
  handleOrgUpdate(message) {
    switch (message.type) {
      case 'orgchart:agent:status':
        this.updateNodeStatus(message.data.id, message.data.status);
        break;
      case 'orgchart:reporting:changed':
        // Reload the tree when structure changes
        this.loadOrgChart();
        break;
      case 'agent:status':
      case 'agent:updated':
        if (message.data?.id) {
          this.updateNodeStatus(message.data.id, message.data.status);
        }
        break;
    }
  }
  
  // ============================================
  // Data Loading
  // ============================================
  
  /**
   * Load org chart data from API
   */
  async loadOrgChart() {
    if (this.loading) return;
    this.loading = true;
    
    this.showLoading();
    
    try {
      if (!this.api?.getOrgChartTree && !this.api?.get) {
        console.warn('OrgChart API unavailable');
        this.treeData = null;
      } else {
        const response = this.api?.getOrgChartTree
          ? await this.api.getOrgChartTree({ depth: 5 })
          : await this.api.get('/orgchart/tree', { depth: 5 });
        this.treeData = response?.tree || null;
      }
      
      this.render();
    } catch (error) {
      console.error('Failed to load org chart:', error);
      Toast.error?.('Failed to load org chart');
      this.treeData = null;
      this.render();
    } finally {
      this.loading = false;
      this.hideLoading();
    }
  }
  
  // ============================================
  // Rendering
  // ============================================
  
  /**
   * Render the org chart
   */
  render() {
    if (!this.elements.linksGroup || !this.elements.nodesGroup) return;

    if (!this.treeData) {
      this.renderEmptyState();
      return;
    }
    
    // Clear existing
    this.elements.linksGroup.innerHTML = '';
    this.elements.nodesGroup.innerHTML = '';
    
    // Calculate layout
    const layout = this.calculateLayout(this.treeData);
    
    // Center the tree initially
    if (this.viewport.x === 0 && this.viewport.y === 0) {
      const containerRect = this.elements.container?.getBoundingClientRect();
      if (containerRect) {
        this.viewport.x = containerRect.width / 2;
        this.viewport.y = 100;
      }
    }
    
    // Apply transform
    this.updateTransform();
    
    // Render links first (behind nodes)
    this.renderLinks(layout);
    
    // Render nodes
    this.renderNodes(layout);
    
    // Update minimap
    this.updateMinimap(layout);
  }

  renderEmptyState() {
    this.elements.linksGroup.innerHTML = '';
    this.elements.nodesGroup.innerHTML = `
      <g transform="translate(120, 120)">
        <rect x="0" y="0" width="360" height="140" rx="16" ry="16" fill="var(--card-bg, #1f2937)" stroke="var(--border-color, #374151)" />
        <text x="180" y="62" text-anchor="middle" fill="var(--text-primary, #e5e7eb)" font-size="20" font-weight="600">
          No Agents In Org Chart
        </text>
        <text x="180" y="94" text-anchor="middle" fill="var(--text-secondary, #9ca3af)" font-size="14">
          Create and activate agent CVs to build the hierarchy.
        </text>
      </g>
    `;
    this.updateTransform();
  }
  
  /**
   * Calculate tree layout positions
   */
  calculateLayout(root) {
    const nodes = [];
    const links = [];
    
    const traverse = (node, depth, parentX = null) => {
      const layoutNode = {
        ...node,
        depth,
        x: 0,
        y: depth * this.levelHeight,
        width: this.nodeWidth,
        height: this.nodeHeight,
        children: [],
      };
      
      // Process children if expanded
      if (node.children && node.children.length > 0 && this.expandedNodes.has(node.id)) {
        const childLayouts = node.children.map(child => traverse(child, depth + 1));
        layoutNode.children = childLayouts;
        
        // Calculate this node's x based on children
        if (childLayouts.length === 1) {
          layoutNode.x = childLayouts[0].x;
        } else if (childLayouts.length > 1) {
          const firstChild = childLayouts[0];
          const lastChild = childLayouts[childLayouts.length - 1];
          layoutNode.x = (firstChild.x + lastChild.x) / 2;
        } else {
          layoutNode.x = parentX !== null ? parentX : 0;
        }
        
        // Add links
        for (const child of childLayouts) {
          links.push({
            from: layoutNode,
            to: child,
          });
        }
        
        nodes.push(...childLayouts);
      } else {
        // Leaf node or collapsed
        layoutNode.x = parentX !== null ? parentX : nodes.length * (this.nodeWidth + this.siblingGap);
        layoutNode.hasChildren = node.children && node.children.length > 0;
      }
      
      return layoutNode;
    };
    
    const rootLayout = traverse(root, 0);
    nodes.push(rootLayout);
    
    // Center the tree around x=0
    const allX = nodes.map(n => n.x);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const centerOffset = (minX + maxX) / 2;
    
    for (const node of nodes) {
      node.x -= centerOffset;
    }
    
    return { nodes, links, bounds: { minX: minX - centerOffset, maxX: maxX - centerOffset } };
  }
  
  /**
   * Render connection links
   */
  renderLinks(layout) {
    for (const link of layout.links) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      
      const startX = link.from.x;
      const startY = link.from.y + this.nodeHeight;
      const endX = link.to.x;
      const endY = link.to.y;
      
      // Bezier curve for smooth connection
      const midY = (startY + endY) / 2;
      const d = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
      
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--border-color, #374151)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      
      this.elements.linksGroup.appendChild(path);
    }
  }
  
  /**
   * Render agent nodes
   */
  renderNodes(layout) {
    for (const node of layout.nodes) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${node.x - this.nodeWidth / 2}, ${node.y})`);
      g.setAttribute('class', 'org-node');
      g.setAttribute('data-id', node.id);
      g.style.cursor = 'pointer';
      g.addEventListener('click', (e) => this.handleNodeClick(e, node));
      
      // Node shadow/background
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', this.nodeWidth);
      bg.setAttribute('height', this.nodeHeight);
      bg.setAttribute('rx', 12);
      bg.setAttribute('fill', 'var(--card-bg, #1f2937)');
      bg.setAttribute('stroke', this.selectedNode?.id === node.id ? 'var(--primary, #3b82f6)' : 'var(--border-color, #374151)');
      bg.setAttribute('stroke-width', this.selectedNode?.id === node.id ? '3' : '1');
      bg.setAttribute('filter', this.selectedNode?.id === node.id ? 'url(#glow)' : 'url(#shadow)');
      g.appendChild(bg);
      
      // Provider color indicator (left strip)
      const providerColor = this.providerColors[node.provider] || this.providerColors.unknown;
      const strip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      strip.setAttribute('width', 6);
      strip.setAttribute('height', this.nodeHeight - 16);
      strip.setAttribute('x', 8);
      strip.setAttribute('y', 8);
      strip.setAttribute('rx', 3);
      strip.setAttribute('fill', providerColor);
      g.appendChild(strip);
      
      // Status indicator (top right)
      const statusColor = this.statusColors[node.status] || this.statusColors.unknown;
      const statusDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      statusDot.setAttribute('cx', this.nodeWidth - 16);
      statusDot.setAttribute('cy', 16);
      statusDot.setAttribute('r', 6);
      statusDot.setAttribute('fill', statusColor);
      // Pulse animation for online agents
      if (node.status === 'online' || node.status === 'busy') {
        const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pulse.setAttribute('cx', this.nodeWidth - 16);
        pulse.setAttribute('cy', 16);
        pulse.setAttribute('r', 10);
        pulse.setAttribute('fill', 'none');
        pulse.setAttribute('stroke', statusColor);
        pulse.setAttribute('stroke-width', '2');
        pulse.setAttribute('opacity', '0.5');
        
        const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        animate.setAttribute('attributeName', 'r');
        animate.setAttribute('values', '8;14;8');
        animate.setAttribute('dur', '2s');
        animate.setAttribute('repeatCount', 'indefinite');
        pulse.appendChild(animate);
        
        const animateOp = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        animateOp.setAttribute('attributeName', 'opacity');
        animateOp.setAttribute('values', '0.8;0;0.8');
        animateOp.setAttribute('dur', '2s');
        animateOp.setAttribute('repeatCount', 'indefinite');
        pulse.appendChild(animateOp);
        
        g.appendChild(pulse);
      }
      g.appendChild(statusDot);
      
      // Avatar circle
      const avatar = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      avatar.setAttribute('cx', 40);
      avatar.setAttribute('cy', 35);
      avatar.setAttribute('r', 18);
      avatar.setAttribute('fill', this.getAvatarColor(node.name));
      g.appendChild(avatar);
      
      // Avatar initials
      const initials = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      initials.setAttribute('x', 40);
      initials.setAttribute('y', 40);
      initials.setAttribute('text-anchor', 'middle');
      initials.setAttribute('fill', '#fff');
      initials.setAttribute('font-size', '12');
      initials.setAttribute('font-weight', 'bold');
      initials.textContent = this.getInitials(node.name);
      g.appendChild(initials);
      
      // Name
      const name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      name.setAttribute('x', 68);
      name.setAttribute('y', 28);
      name.setAttribute('fill', 'var(--text-primary, #f9fafb)');
      name.setAttribute('font-size', '14');
      name.setAttribute('font-weight', '600');
      name.textContent = this.truncateText(node.name, 16);
      g.appendChild(name);
      
      // Role
      const role = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      role.setAttribute('x', 68);
      role.setAttribute('y', 46);
      role.setAttribute('fill', 'var(--text-secondary, #9ca3af)');
      role.setAttribute('font-size', '11');
      role.textContent = this.truncateText(node.role, 20);
      g.appendChild(role);
      
      // Department badge
      if (node.department) {
        const deptBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        deptBg.setAttribute('x', 68);
        deptBg.setAttribute('y', 54);
        deptBg.setAttribute('width', node.department.length * 6 + 8);
        deptBg.setAttribute('height', 16);
        deptBg.setAttribute('rx', 4);
        deptBg.setAttribute('fill', 'var(--bg-tertiary, #374151)');
        g.appendChild(deptBg);
        
        const dept = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        dept.setAttribute('x', 72);
        dept.setAttribute('y', 66);
        dept.setAttribute('fill', 'var(--text-tertiary, #6b7280)');
        dept.setAttribute('font-size', '9');
        dept.textContent = node.department;
        g.appendChild(dept);
      }
      
      // Metrics (bottom)
      const metrics = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      metrics.setAttribute('x', this.nodeWidth / 2);
      metrics.setAttribute('y', this.nodeHeight - 12);
      metrics.setAttribute('text-anchor', 'middle');
      metrics.setAttribute('fill', 'var(--text-tertiary, #6b7280)');
      metrics.setAttribute('font-size', '10');
      const tasks = node.metrics?.tasksCompleted || 0;
      const rate = node.metrics?.successRate || 0;
      metrics.textContent = `${tasks} tasks · ${rate}% success`;
      g.appendChild(metrics);
      
      // Expand/collapse button for nodes with children
      if (node.hasChildren || (node.children && node.children.length > 0)) {
        const btnG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        btnG.setAttribute('transform', `translate(${this.nodeWidth / 2 - 12}, ${this.nodeHeight - 8})`);
        btnG.style.cursor = 'pointer';
        btnG.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleNode(node.id);
        });
        
        const btnBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        btnBg.setAttribute('cx', 12);
        btnBg.setAttribute('cy', 0);
        btnBg.setAttribute('r', 10);
        btnBg.setAttribute('fill', 'var(--primary, #3b82f6)');
        btnBg.setAttribute('stroke', 'var(--card-bg, #1f2937)');
        btnBg.setAttribute('stroke-width', '2');
        btnG.appendChild(btnBg);
        
        const btnIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        btnIcon.setAttribute('x', 12);
        btnIcon.setAttribute('y', 4);
        btnIcon.setAttribute('text-anchor', 'middle');
        btnIcon.setAttribute('fill', '#fff');
        btnIcon.setAttribute('font-size', '14');
        btnIcon.setAttribute('font-weight', 'bold');
        btnIcon.textContent = this.expandedNodes.has(node.id) ? '−' : '+';
        btnG.appendChild(btnIcon);
        
        g.appendChild(btnG);
      }
      
      this.elements.nodesGroup.appendChild(g);
    }
  }
  
  /**
   * Update minimap view
   */
  updateMinimap(layout) {
    if (!this.elements.minimap) return;
    
    // Simplified minimap representation
    const svg = this.elements.minimap;
    svg.innerHTML = '';
    
    const scale = 0.05;
    const padding = 10;
    
    for (const node of layout.nodes) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', padding + (node.x - this.nodeWidth / 2) * scale + 100);
      rect.setAttribute('y', padding + node.y * scale + 20);
      rect.setAttribute('width', this.nodeWidth * scale);
      rect.setAttribute('height', this.nodeHeight * scale);
      rect.setAttribute('fill', this.statusColors[node.status] || this.statusColors.unknown);
      rect.setAttribute('rx', 2);
      svg.appendChild(rect);
    }
  }
  
  // ============================================
  // Interactions
  // ============================================
  
  /**
   * Handle mouse wheel for zooming
   */
  handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom(delta, e.offsetX, e.offsetY);
  }
  
  /**
   * Handle mouse down for panning
   */
  handleMouseDown(e) {
    if (e.target.closest('.org-node')) return;
    
    this.isDragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.lastPan = { x: this.viewport.x, y: this.viewport.y };
    
    this.elements.svg.style.cursor = 'grabbing';
  }
  
  /**
   * Handle mouse move for panning
   */
  handleMouseMove(e) {
    if (!this.isDragging) return;
    
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;
    
    this.viewport.x = this.lastPan.x + dx;
    this.viewport.y = this.lastPan.y + dy;
    
    this.updateTransform();
  }
  
  /**
   * Handle mouse up
   */
  handleMouseUp() {
    this.isDragging = false;
    if (this.elements.svg) {
      this.elements.svg.style.cursor = 'grab';
    }
  }
  
  /**
   * Handle node click
   */
  handleNodeClick(e, node) {
    e.stopPropagation();
    this.selectedNode = node;
    this.showDetailPanel(node);
    this.render(); // Re-render to show selection
  }
  
  /**
   * Toggle node expand/collapse
   */
  toggleNode(nodeId) {
    if (this.expandedNodes.has(nodeId)) {
      this.expandedNodes.delete(nodeId);
    } else {
      this.expandedNodes.add(nodeId);
    }
    this.render();
  }
  
  /**
   * Zoom in/out
   */
  zoom(factor, centerX, centerY) {
    const newScale = Math.max(this.viewport.minScale, 
      Math.min(this.viewport.maxScale, this.viewport.scale * factor));
    
    if (centerX !== undefined && centerY !== undefined) {
      // Zoom towards mouse position
      const rect = this.elements.svg.getBoundingClientRect();
      const mouseX = centerX - rect.left - this.viewport.x;
      const mouseY = centerY - rect.top - this.viewport.y;
      
      this.viewport.x -= mouseX * (newScale / this.viewport.scale - 1);
      this.viewport.y -= mouseY * (newScale / this.viewport.scale - 1);
    }
    
    this.viewport.scale = newScale;
    this.updateTransform();
  }
  
  /**
   * Reset view to default
   */
  resetView() {
    this.viewport = {
      x: this.elements.container?.clientWidth / 2 || 400,
      y: 100,
      scale: 1,
      minScale: 0.2,
      maxScale: 3,
    };
    this.updateTransform();
  }
  
  /**
   * Update SVG transform
   */
  updateTransform() {
    if (this.elements.treeGroup) {
      this.elements.treeGroup.setAttribute('transform', 
        `translate(${this.viewport.x}, ${this.viewport.y}) scale(${this.viewport.scale})`);
    }
  }
  
  /**
   * Expand all nodes
   */
  expandAll() {
    const addIds = (node) => {
      this.expandedNodes.add(node.id);
      if (node.children) {
        for (const child of node.children) {
          addIds(child);
        }
      }
    };
    addIds(this.treeData);
    this.render();
  }
  
  /**
   * Collapse all nodes except root
   */
  collapseAll() {
    this.expandedNodes.clear();
    this.expandedNodes.add('root');
    if (this.treeData?.id) {
      this.expandedNodes.add(this.treeData.id);
    }
    this.render();
  }
  
  /**
   * Handle search
   */
  handleSearch(query) {
    if (!query) {
      // Reset highlighting
      this.render();
      return;
    }
    
    const lowerQuery = query.toLowerCase();
    
    // Find matching nodes and expand path to them
    const findAndExpand = (node, path = []) => {
      const newPath = [...path, node.id];
      const matches = (node.name?.toLowerCase().includes(lowerQuery)) ||
                      (node.role?.toLowerCase().includes(lowerQuery));
      
      if (matches) {
        // Expand all nodes in path
        for (const id of newPath) {
          this.expandedNodes.add(id);
        }
      }
      
      if (node.children) {
        for (const child of node.children) {
          findAndExpand(child, newPath);
        }
      }
    };
    
    if (this.treeData) {
      findAndExpand(this.treeData);
      this.render();
    }
  }
  
  // ============================================
  // Detail Panel
  // ============================================
  
  /**
   * Show agent detail panel
   */
  showDetailPanel(node) {
    if (!this.elements.detailPanel || !this.elements.detailContent) return;
    
    const providerColor = this.providerColors[node.provider] || this.providerColors.unknown;
    const statusColor = this.statusColors[node.status] || this.statusColors.unknown;
    
    this.elements.detailContent.innerHTML = `
      <div class="org-detail-header">
        <div class="org-detail-avatar" style="background: ${this.getAvatarColor(node.name)}">
          ${this.getInitials(node.name)}
        </div>
        <div class="org-detail-title">
          <h4>${this.escapeHtml(node.name)}</h4>
          <span class="org-detail-role">${this.escapeHtml(node.role)}</span>
        </div>
      </div>
      
      <div class="org-detail-section">
        <h5>Status</h5>
        <div class="org-detail-status">
          <span class="status-dot" style="background: ${statusColor}"></span>
          <span>${node.status || 'Unknown'}</span>
        </div>
      </div>
      
      <div class="org-detail-section">
        <h5>Provider</h5>
        <div class="org-detail-provider">
          <span class="provider-badge" style="background: ${providerColor}">
            ${node.provider || 'Unknown'}
          </span>
          ${node.model ? `<span class="model-text">${this.escapeHtml(node.model)}</span>` : ''}
        </div>
      </div>
      
      ${node.department ? `
        <div class="org-detail-section">
          <h5>Department</h5>
          <p>${this.escapeHtml(node.department)}</p>
        </div>
      ` : ''}
      
      ${node.capabilities?.length ? `
        <div class="org-detail-section">
          <h5>Capabilities</h5>
          <div class="org-detail-tags">
            ${node.capabilities.map(c => `<span class="tag">${this.escapeHtml(c)}</span>`).join('')}
          </div>
        </div>
      ` : ''}
      
      <div class="org-detail-section">
        <h5>Metrics</h5>
        <div class="org-detail-metrics">
          <div class="metric">
            <span class="metric-value">${node.metrics?.tasksCompleted || 0}</span>
            <span class="metric-label">Tasks</span>
          </div>
          <div class="metric">
            <span class="metric-value">${node.metrics?.successRate || 0}%</span>
            <span class="metric-label">Success</span>
          </div>
        </div>
        ${node.metrics?.lastActive ? `
          <p class="last-active">Last active: ${this.formatTimeAgo(node.metrics.lastActive)}</p>
        ` : ''}
      </div>
      
      <div class="org-detail-actions">
        <button class="btn btn-primary" onclick="orgChartComponent.viewAgentDetails('${node.id}')">
          <i data-lucide="external-link"></i>
          View Full Profile
        </button>
      </div>
    `;
    
    this.elements.detailPanel.classList.add('active');
    
    // Re-initialize icons
    if (typeof orgChartWindow.lucide?.createIcons === 'function') {
      orgChartWindow.lucide.createIcons();
    }
  }
  
  /**
   * Close detail panel
   */
  closeDetailPanel() {
    this.selectedNode = null;
    this.elements.detailPanel?.classList.remove('active');
    this.render();
  }
  
  /**
   * View agent details (navigate to agents page)
   */
  viewAgentDetails(agentId) {
    // Trigger navigation to agents view with this agent selected
    window.location.hash = `agents?agent=${agentId}`;
  }
  
  // ============================================
  // Real-time Updates
  // ============================================
  
  /**
   * Update node status (real-time)
   */
  updateNodeStatus(agentId, status) {
    // Update in tree data
    const updateInTree = (node) => {
      if (node.id === agentId) {
        node.status = status;
        node.metrics = node.metrics || {};
        node.metrics.lastActive = new Date().toISOString();
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (updateInTree(child)) return true;
        }
      }
      return false;
    };
    
    if (this.treeData && updateInTree(this.treeData)) {
      // Re-render only if node is visible
      this.render();
    }
  }
  
  // ============================================
  // Utilities
  // ============================================
  
  getAvatarColor(name) {
    const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }
  
  getInitials(name) {
    return name
      .split(/[\s_-]+/)
      .map(p => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  
  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }
  
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  formatTimeAgo(timestamp) {
    const date = new Date(this.parseTimestamp(timestamp));
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    
    return date.toLocaleDateString();
  }

  parseTimestamp(value) {
    if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
    if (typeof value === 'string') {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && String(value).trim() !== '') {
        return numeric > 1e12 ? numeric : numeric * 1000;
      }
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return Date.now();
  }
  
  showLoading() {
    if (this.elements.container) {
      this.elements.container.classList.add('loading');
    }
  }
  
  hideLoading() {
    if (this.elements.container) {
      this.elements.container.classList.remove('loading');
    }
  }
}

// Make globally available
if (typeof window !== 'undefined') {
  window.OrgChartComponent = OrgChartComponent;
  window.orgChartComponent = null; // Will be initialized by DashboardApp
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OrgChartComponent };
}
