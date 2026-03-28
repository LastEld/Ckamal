/**
 * CogniMesh v5.0 - Dashboard Server
 * HTTP server with Express, API endpoints, auth middleware, CORS, Helmet, rate limiting
 * @module dashboard/server
 */

import express from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { DashboardWebSocket } from './websocket.js';

// Domain imports - Real API integration
import { TaskDomain } from '../domains/tasks/index.js';
import { RoadmapDomain } from '../domains/roadmaps/index.js';
import { AlertManager } from '../alerts/manager.js';
import { ContextSnapshotManager } from '../domains/context/index.js';
import { GSDDomain } from '../domains/gsd/index.js';
import { createCVSystem } from '../cv/index.js';

// New backend integrations for missing API endpoints
import { AgentOrchestrator, ExecutionStrategy, TaskPriority } from '../bios/orchestrator.js';
import { AgentPool } from '../agents/pool.js';
import { TaskQueue, Priority as QueuePriority } from '../queue/task-queue.js';
import { DeadLetterQueue } from '../queue/dead-letter.js';
import { HealthChecker } from '../health/health-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const noopMiddlewareFactory = () => (_req, _res, next) => next();
const cors = (await import('cors').catch(() => ({ default: noopMiddlewareFactory }))).default;
const helmet = (await import('helmet').catch(() => ({ default: noopMiddlewareFactory }))).default;
const rateLimit = (await import('express-rate-limit').catch(() => ({ default: () => noopMiddlewareFactory() }))).default;

/**
 * Dashboard HTTP Server with integrated WebSocket
 */
export class DashboardServer {
  /**
   * Creates a DashboardServer instance
   * @param {Object} [options={}] - Server options
   */
  constructor(options = {}) {
    this.port = options.port || process.env.DASHBOARD_PORT || 3000;
    this.host = options.host || process.env.DASHBOARD_HOST || '0.0.0.0';
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'cognimesh-secret';
    this.authEnabled = options.authEnabled !== false;
    this.apiBaseUrl = options.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:8080';
    
    // Initialize domain instances (real API)
    this.taskDomain = options.taskDomain || new TaskDomain();
    this.roadmapDomain = options.roadmapDomain || new RoadmapDomain();
    this.alertManager = options.alertManager || new AlertManager();
    this.gsdDomain = options.gsdDomain || new GSDDomain();
    this.analytics = options.analytics || null;
    this.contextManager = options.contextManager || new ContextSnapshotManager();
    this.cvSystem = options.cvSystem || createCVSystem();
    
    // Initialize new backend modules for expanded API
    this.orchestrator = options.orchestrator || new AgentOrchestrator({
      defaultTimeout: 60000,
      maxConcurrentTasks: 10,
    });
    this.agentPool = options.agentPool || new AgentPool({
      minPoolSize: 2,
      maxPoolSize: 10,
      autoScale: true,
    });
    this.taskQueue = options.taskQueue || new TaskQueue({ maxSize: 1000 });
    this.deadLetterQueue = options.deadLetterQueue || new DeadLetterQueue({ maxSize: 10000 });
    this.healthChecker = options.healthChecker || new HealthChecker({ server: this });
    
    this.app = express();
    this.server = null;
    this.wsServer = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupWebSocketIntegration();
  }

  /**
   * Sets up WebSocket integration with domain events
   */
  setupWebSocketIntegration() {
    // AlertManager events -> WebSocket notifications
    if (this.alertManager) {
      this.alertManager.on('alertCreated', ({ alert }) => {
        if (this.wsServer) {
          this.wsServer.notifyAlert({
            id: alert.id,
            level: alert.priority?.toLowerCase() || 'info',
            title: alert.type,
            message: alert.message,
            data: alert,
          });
        }
      });

      this.alertManager.on('alertAcknowledged', ({ alert }) => {
        if (this.wsServer) {
          this.wsServer.broadcastToRoom('alerts', {
            type: 'alert.acknowledged',
            data: { id: alert.id, acknowledgedBy: alert.acknowledgedBy },
            timestamp: new Date().toISOString(),
          });
        }
      });

      this.alertManager.on('alertResolved', ({ alert }) => {
        if (this.wsServer) {
          this.wsServer.notifyAlertResolved(alert.id);
        }
      });
    }
  }

  /**
   * Sets up Express middleware
   */
  setupMiddleware() {
    // Security headers with Helmet
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com"],
          fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Relaxed in development
      message: {
        error: 'Too many requests, please try again later.',
        retryAfter: 900,
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Stricter rate limiting for auth endpoints
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: 900,
      },
    });
    this.app.use('/api/auth/', authLimiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  /**
   * Authentication middleware
   * @param {import('express').Request} req - Express request
   * @param {import('express').Response} res - Express response
   * @param {import('express').NextFunction} next - Next function
   */
  authMiddleware(req, res, next) {
    if (!this.authEnabled) {
      req.user = { id: 'anonymous', role: 'admin' };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or invalid' });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  /**
   * Role-based access control middleware
   * @param {...string} roles - Allowed roles
   * @returns {Function} Middleware function
   */
  requireRole(...roles) {
    return (req, res, next) => {
      if (!this.authEnabled) return next();
      
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      next();
    };
  }

  /**
   * Sets up API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '5.0.0',
        uptime: process.uptime(),
        websocket: this.wsServer ? {
          running: this.wsServer.isRunning(),
          clients: this.wsServer.getClientCount(),
        } : null,
      });
    });

    // API Routes
    this.setupAuthRoutes();
    this.setupTaskRoutes();
    this.setupRoadmapRoutes();
    this.setupAnalyticsRoutes();
    this.setupAlertRoutes();
    this.setupSystemRoutes();
    this.setupContextRoutes();
    this.setupOrchestrationRoutes();
    this.setupAgentPoolRoutes();
    this.setupQueueRoutes();
    this.setupHealthRoutes();

    // Static file serving
    this.app.use(express.static(path.join(__dirname, 'public')));

    // SPA fallback - serve index.html for all non-API routes
    this.app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
      }
    });
  }

  /**
   * Sets up authentication routes
   */
  setupAuthRoutes() {
    // Login
    this.app.post('/api/auth/login', (req, res) => {
      const { username, password } = req.body;
      
      // Simple auth - in production, use proper user database
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
      if (username === 'admin' && password === adminPassword) {
        const token = jwt.sign(
          { id: 'admin', username, role: 'admin' },
          this.jwtSecret,
          { expiresIn: '24h' }
        );
        res.json({ token, user: { id: 'admin', username, role: 'admin' } });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });

    // Verify token
    this.app.get('/api/auth/verify', this.authMiddleware.bind(this), (req, res) => {
      res.json({ valid: true, user: req.user });
    });

    // Logout (client-side token removal, but we can track invalidated tokens)
    this.app.post('/api/auth/logout', this.authMiddleware.bind(this), (req, res) => {
      res.json({ message: 'Logged out successfully' });
    });
  }

  /**
   * Sets up task routes (REAL API)
   */
  setupTaskRoutes() {
    const auth = this.authMiddleware.bind(this);

    // Get all tasks with Eisenhower quadrant filtering
    this.app.get('/api/tasks', auth, (req, res) => {
      try {
        const { quadrant, status, priority, assignee, search } = req.query;
        
        // Build filters for domain
        const filters = {};
        if (quadrant) filters.quadrant = quadrant;
        if (status) filters.status = status;
        if (priority) filters.priority = priority;
        if (assignee) filters.assignee = assignee;
        
        let tasks = this.taskDomain.listTasks(filters);
        
        // Client-side search filter
        if (search) {
          const searchLower = search.toLowerCase();
          tasks = tasks.filter(t => 
            t.title?.toLowerCase().includes(searchLower) ||
            t.description?.toLowerCase().includes(searchLower) ||
            t.tags?.some(tag => tag.toLowerCase().includes(searchLower))
          );
        }
        
        res.json({
          tasks,
          filters: { quadrant, status, priority, assignee, search },
          total: tasks.length,
        });
      } catch (err) {
        console.error('Error fetching tasks:', err);
        res.status(500).json({ error: 'Failed to fetch tasks', message: err.message });
      }
    });

    // Create task
    this.app.post('/api/tasks', auth, (req, res) => {
      try {
        const task = this.taskDomain.createTask({
          ...req.body,
          createdBy: req.user?.id || 'anonymous',
        });
        
        // Notify WebSocket clients
        if (this.wsServer) {
          this.wsServer.notifyTaskCreated(task);
        }
        
        res.status(201).json(task);
      } catch (err) {
        console.error('Error creating task:', err);
        res.status(400).json({ error: 'Failed to create task', message: err.message });
      }
    });

    // Update task
    this.app.put('/api/tasks/:id', auth, (req, res) => {
      try {
        const task = this.taskDomain.updateTask(req.params.id, req.body);
        
        // Notify WebSocket clients
        if (this.wsServer) {
          this.wsServer.notifyTaskUpdate(task);
        }
        
        res.json(task);
      } catch (err) {
        console.error('Error updating task:', err);
        res.status(err.message?.includes('not found') ? 404 : 400).json({ 
          error: 'Failed to update task', 
          message: err.message 
        });
      }
    });

    // Patch task (partial update - for drag-drop quadrant changes)
    this.app.patch('/api/tasks/:id', auth, (req, res) => {
      try {
        const { fromQuadrant, toQuadrant, ...updates } = req.body;
        const task = this.taskDomain.updateTask(req.params.id, updates);
        
        // Notify WebSocket clients
        if (this.wsServer) {
          if (fromQuadrant && toQuadrant && fromQuadrant !== toQuadrant) {
            this.wsServer.notifyTaskMoved(req.params.id, fromQuadrant, toQuadrant);
          } else {
            this.wsServer.notifyTaskUpdate(task);
          }
        }
        
        res.json(task);
      } catch (err) {
        console.error('Error patching task:', err);
        res.status(err.message?.includes('not found') ? 404 : 400).json({ 
          error: 'Failed to update task', 
          message: err.message 
        });
      }
    });

    // Delete task
    this.app.delete('/api/tasks/:id', auth, (req, res) => {
      try {
        const deleted = this.taskDomain.deleteTask(req.params.id);
        if (!deleted) {
          return res.status(404).json({ error: 'Task not found' });
        }
        
        // Notify WebSocket clients
        if (this.wsServer) {
          this.wsServer.notifyTaskDeleted(req.params.id);
        }
        
        res.json({ id: req.params.id, deleted: true });
      } catch (err) {
        console.error('Error deleting task:', err);
        res.status(500).json({ error: 'Failed to delete task', message: err.message });
      }
    });

    // Batch update tasks (for bulk operations)
    this.app.post('/api/tasks/batch', auth, (req, res) => {
      try {
        const { ids, updates } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ error: 'ids array is required' });
        }
        
        const result = this.taskDomain.batchUpdate(ids, updates);
        
        // Notify WebSocket clients for each updated task
        if (this.wsServer) {
          for (const task of result.updated) {
            this.wsServer.notifyTaskUpdate(task);
          }
        }
        
        res.json({ 
          updated: result.updated.length, 
          failed: result.failed,
          updates 
        });
      } catch (err) {
        console.error('Error batch updating tasks:', err);
        res.status(500).json({ error: 'Failed to batch update tasks', message: err.message });
      }
    });

    // Get Eisenhower matrix data
    this.app.get('/api/tasks/matrix', auth, (req, res) => {
      try {
        const { assignee, status } = req.query;
        const filters = {};
        if (assignee) filters.assignee = assignee;
        if (status) filters.status = status;
        
        const matrix = this.taskDomain.organizeByMatrix(filters);
        
        res.json({
          doFirst: matrix.urgentImportant,      // Urgent & Important
          schedule: matrix.notUrgentImportant,  // Not Urgent & Important
          delegate: matrix.urgentNotImportant,  // Urgent & Not Important
          eliminate: matrix.notUrgentNotImportant, // Not Urgent & Not Important
        });
      } catch (err) {
        console.error('Error fetching matrix:', err);
        res.status(500).json({ error: 'Failed to fetch matrix', message: err.message });
      }
    });

    // Get task by ID
    this.app.get('/api/tasks/:id', auth, (req, res) => {
      try {
        const task = this.taskDomain.getTask(req.params.id);
        if (!task) {
          return res.status(404).json({ error: 'Task not found' });
        }
        res.json(task);
      } catch (err) {
        console.error('Error fetching task:', err);
        res.status(500).json({ error: 'Failed to fetch task', message: err.message });
      }
    });
  }

  /**
   * Sets up roadmap routes (REAL API)
   */
  setupRoadmapRoutes() {
    const auth = this.authMiddleware.bind(this);

    // Get all roadmaps
    this.app.get('/api/roadmaps', auth, (req, res) => {
      try {
        const { category, difficulty } = req.query;
        const filters = {};
        if (category) filters.category = category;
        if (difficulty) filters.difficulty = difficulty;
        
        const roadmaps = this.roadmapDomain.listRoadmaps(filters);
        res.json({ roadmaps, total: roadmaps.length });
      } catch (err) {
        console.error('Error fetching roadmaps:', err);
        res.status(500).json({ error: 'Failed to fetch roadmaps', message: err.message });
      }
    });

    // Get roadmap by ID with progress
    this.app.get('/api/roadmaps/:id', auth, (req, res) => {
      try {
        const roadmap = this.roadmapDomain.getRoadmap(req.params.id);
        if (!roadmap) {
          return res.status(404).json({ error: 'Roadmap not found' });
        }
        
        // Calculate progress
        const userId = req.user?.id || 'anonymous';
        let progress = null;
        try {
          progress = this.roadmapDomain.getProgress(req.params.id, userId);
        } catch {
          // User not enrolled, return null progress
        }
        
        res.json({
          ...roadmap,
          progress,
          milestones: roadmap.nodes?.filter(n => n.type === 'milestone') || [],
        });
      } catch (err) {
        console.error('Error fetching roadmap:', err);
        res.status(500).json({ error: 'Failed to fetch roadmap', message: err.message });
      }
    });

    // Get roadmap progress
    this.app.get('/api/roadmaps/:id/progress', auth, (req, res) => {
      try {
        const userId = req.user?.id || 'anonymous';
        const progress = this.roadmapDomain.getProgress(req.params.id, userId);
        
        // Calculate phase progress
        const roadmap = this.roadmapDomain.getRoadmap(req.params.id);
        const phaseProgress = roadmap?.nodes?.map(node => ({
          nodeId: node.id,
          title: node.title,
          status: progress.nodeStatus[node.id] || 'not_started',
        })) || [];
        
        const completedNodes = Object.values(progress.nodeStatus)
          .filter(status => status === 'completed').length;
        
        res.json({
          roadmapId: req.params.id,
          overallProgress: progress.progressPercent,
          phaseProgress,
          milestonesReached: completedNodes,
          totalMilestones: roadmap?.nodes?.length || 0,
        });
      } catch (err) {
        console.error('Error fetching roadmap progress:', err);
        res.status(err.message?.includes('not enrolled') ? 404 : 500).json({ 
          error: 'Failed to fetch roadmap progress', 
          message: err.message 
        });
      }
    });

    // Update roadmap
    this.app.put('/api/roadmaps/:id', auth, this.requireRole('admin', 'editor'), (req, res) => {
      try {
        const roadmap = this.roadmapDomain.updateRoadmap(req.params.id, req.body);
        
        // Notify WebSocket clients
        if (this.wsServer) {
          this.wsServer.notifyRoadmapUpdated(roadmap);
        }
        
        res.json(roadmap);
      } catch (err) {
        console.error('Error updating roadmap:', err);
        res.status(err.message?.includes('not found') ? 404 : 400).json({ 
          error: 'Failed to update roadmap', 
          message: err.message 
        });
      }
    });

    // Create phase (add node to roadmap)
    this.app.post('/api/roadmaps/:id/phases', auth, this.requireRole('admin', 'editor'), (req, res) => {
      try {
        const roadmap = this.roadmapDomain.getRoadmap(req.params.id);
        if (!roadmap) {
          return res.status(404).json({ error: 'Roadmap not found' });
        }
        
        const newNode = {
          id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ...req.body,
        };
        
        roadmap.nodes.push(newNode);
        const updated = this.roadmapDomain.updateRoadmap(req.params.id, { nodes: roadmap.nodes });
        
        res.status(201).json({ 
          roadmapId: req.params.id, 
          phaseId: newNode.id, 
          node: newNode,
          roadmap: updated,
        });
      } catch (err) {
        console.error('Error creating phase:', err);
        res.status(500).json({ error: 'Failed to create phase', message: err.message });
      }
    });
  }

  /**
   * Sets up analytics routes (REAL API)
   */
  setupAnalyticsRoutes() {
    const auth = this.authMiddleware.bind(this);

    // Get dashboard analytics
    this.app.get('/api/analytics/dashboard', auth, async (req, res) => {
      try {
        // Get task stats from TaskDomain
        const taskStats = this.taskDomain.getStats();
        
        // Get alert stats from AlertManager
        const alertMetrics = this.alertManager?.getMetrics() || {};
        
        res.json({
          taskStats: {
            total: taskStats.total,
            completed: taskStats.completed,
            inProgress: taskStats.inProgress,
            pending: taskStats.pending,
          },
          completionRate: taskStats.completionRate,
          averageCompletionTime: taskStats.averageCompletionTime,
          tasksByPriority: taskStats.byPriority,
          tasksByQuadrant: taskStats.byQuadrant,
          alerts: {
            total: alertMetrics.total || 0,
            byState: alertMetrics.byState || {},
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Error fetching analytics:', err);
        res.status(500).json({ error: 'Failed to fetch analytics', message: err.message });
      }
    });

    // Get task trends over time
    this.app.get('/api/analytics/trends', auth, (req, res) => {
      try {
        const { period = '7d' } = req.query;
        const tasks = this.taskDomain.listTasks();
        
        // Group tasks by creation date
        const tasksByDate = {};
        const now = new Date();
        const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
        
        // Initialize all days with 0
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const key = date.toISOString().split('T')[0];
          tasksByDate[key] = { created: 0, completed: 0 };
        }
        
        // Count tasks
        for (const task of tasks) {
          const createdDate = task.createdAt?.split('T')[0];
          if (createdDate && tasksByDate[createdDate]) {
            tasksByDate[createdDate].created++;
          }
          if (task.status === 'done') {
            const updatedDate = task.updatedAt?.split('T')[0];
            if (updatedDate && tasksByDate[updatedDate]) {
              tasksByDate[updatedDate].completed++;
            }
          }
        }
        
        const labels = Object.keys(tasksByDate);
        const created = labels.map(d => tasksByDate[d].created);
        const completed = labels.map(d => tasksByDate[d].completed);
        
        res.json({
          period,
          labels,
          created,
          completed,
        });
      } catch (err) {
        console.error('Error fetching trends:', err);
        res.status(500).json({ error: 'Failed to fetch trends', message: err.message });
      }
    });

    // Get performance metrics
    this.app.get('/api/analytics/performance', auth, (req, res) => {
      try {
        const stats = this.taskDomain.getStats();
        const tasks = this.taskDomain.listTasks();
        
        // Calculate on-time completion rate
        const completedTasks = tasks.filter(t => t.status === 'done');
        const onTimeTasks = completedTasks.filter(t => {
          if (!t.dueDate || !t.updatedAt) return true;
          return new Date(t.updatedAt) <= new Date(t.dueDate);
        });
        
        const onTimeCompletionRate = completedTasks.length > 0
          ? Math.round((onTimeTasks.length / completedTasks.length) * 100)
          : 100;
        
        // Calculate team velocity (tasks completed per day over last 7 days)
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const recentCompleted = completedTasks.filter(t => {
          const updated = new Date(t.updatedAt);
          return updated >= sevenDaysAgo;
        });
        
        const teamVelocity = Math.round((recentCompleted.length / 7) * 10) / 10;
        
        res.json({
          avgTaskCompletionTime: stats.averageCompletionTime,
          onTimeCompletionRate,
          teamVelocity,
        });
      } catch (err) {
        console.error('Error fetching performance:', err);
        res.status(500).json({ error: 'Failed to fetch performance', message: err.message });
      }
    });

    // Get agent activity (placeholder for future agent integration)
    this.app.get('/api/analytics/agents', auth, (req, res) => {
      // This would integrate with the agent system when available
      res.json({
        activeAgents: 0,
        tasksExecuted: 0,
        successRate: 0,
        avgResponseTime: 0,
      });
    });
  }

  /**
   * Sets up alert routes (REAL API)
   */
  setupAlertRoutes() {
    const auth = this.authMiddleware.bind(this);

    // Get active alerts
    this.app.get('/api/alerts', auth, (req, res) => {
      try {
        const { level, acknowledged } = req.query;
        
        const filters = {};
        if (level) filters.priority = level.toUpperCase();
        
        // acknowledged=true returns acknowledged+resolved, false returns only pending
        if (acknowledged === 'true') {
          // Return non-pending alerts
        } else if (acknowledged === 'false') {
          filters.state = 'PENDING';
        }
        
        const alerts = this.alertManager?.getAlerts(filters) || [];
        const metrics = this.alertManager?.getMetrics() || {};
        
        res.json({
          alerts,
          total: alerts.length,
          byLevel: {
            info: alerts.filter(a => a.priority === 'LOW').length,
            warning: alerts.filter(a => a.priority === 'MEDIUM').length,
            error: alerts.filter(a => a.priority === 'HIGH').length,
            critical: alerts.filter(a => a.priority === 'CRITICAL').length,
          },
        });
      } catch (err) {
        console.error('Error fetching alerts:', err);
        res.status(500).json({ error: 'Failed to fetch alerts', message: err.message });
      }
    });

    // Acknowledge alert
    this.app.post('/api/alerts/:id/acknowledge', auth, (req, res) => {
      try {
        const alert = this.alertManager?.acknowledgeAlert(req.params.id, {
          acknowledgedBy: req.user?.id || 'anonymous',
          notes: req.body.notes,
        });
        
        if (!alert) {
          return res.status(404).json({ error: 'Alert not found' });
        }
        
        res.json({ 
          id: req.params.id, 
          acknowledged: true, 
          acknowledgedBy: req.user?.id || 'anonymous',
          alert,
        });
      } catch (err) {
        console.error('Error acknowledging alert:', err);
        res.status(400).json({ error: 'Failed to acknowledge alert', message: err.message });
      }
    });

    // Create alert (for internal systems)
    this.app.post('/api/alerts', auth, this.requireRole('admin', 'system'), (req, res) => {
      try {
        const alert = this.alertManager?.createAlert(
          req.body.type || 'system',
          req.body.message,
          {
            priority: req.body.priority || 'MEDIUM',
            metadata: {
              source: req.body.source || 'dashboard-api',
              ...req.body.metadata,
            },
          }
        );
        
        if (!alert) {
          return res.status(500).json({ error: 'Alert manager not available' });
        }
        
        // WebSocket notification is handled by the alertCreated event listener
        
        res.status(201).json(alert);
      } catch (err) {
        console.error('Error creating alert:', err);
        res.status(400).json({ error: 'Failed to create alert', message: err.message });
      }
    });

    // Dismiss/resolve alert
    this.app.delete('/api/alerts/:id', auth, (req, res) => {
      try {
        const alert = this.alertManager?.resolveAlert(req.params.id, {
          resolvedBy: req.user?.id || 'anonymous',
          resolution: req.body.reason || 'dismissed',
        });
        
        if (!alert) {
          return res.status(404).json({ error: 'Alert not found' });
        }
        
        // WebSocket notification is handled by the alertResolved event listener
        
        res.json({ id: req.params.id, dismissed: true, alert });
      } catch (err) {
        console.error('Error dismissing alert:', err);
        res.status(400).json({ error: 'Failed to dismiss alert', message: err.message });
      }
    });
  }

  /**
   * Sets up system routes
   */
  setupSystemRoutes() {
    const auth = this.authMiddleware.bind(this);

    this.app.get('/api/system/status', auth, async (req, res) => {
      await this.forwardCoreApi(req, res, '/api/system/status');
    });

    this.app.get('/api/system/metrics', auth, this.requireRole('admin'), async (req, res) => {
      await this.forwardCoreApi(req, res, '/api/system/metrics');
    });

    this.app.get('/api/agents', auth, async (req, res) => {
      await this.forwardCoreApi(req, res, '/api/agents');
    });

    // Provider catalog endpoint
    this.app.get('/api/providers', auth, (req, res) => {
      const providers = [
        { id: 'claude', name: 'Claude', vendor: 'Anthropic', subscription: '$20/month', modes: ['CLI', 'Desktop', 'VS Code'] },
        { id: 'codex', name: 'Codex', vendor: 'OpenAI', subscription: '$20/month', modes: ['VS Code', 'App', 'CLI'] },
        { id: 'kimi', name: 'Kimi', vendor: 'Moonshot', subscription: '$18/month', modes: ['VS Code', 'CLI'] },
      ];

      const models = [
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'claude', qualityScore: 0.99, maxTokens: 200000, features: ['analysis', 'code', 'extended_thinking', 'reasoning', 'vision'] },
        { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'claude', qualityScore: 0.97, maxTokens: 200000, features: ['analysis', 'code', 'extended_thinking', 'reasoning', 'vision'] },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'claude', qualityScore: 0.96, maxTokens: 200000, features: ['code', 'computer_use', 'extended_thinking', 'reasoning', 'vision'] },
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'claude', qualityScore: 0.93, maxTokens: 200000, features: ['code', 'extended_thinking', 'reasoning', 'vision'] },
        { id: 'gpt-5.4-codex', name: 'GPT-5.4 Codex', provider: 'codex', qualityScore: 0.97, maxTokens: 200000, features: ['architecture', 'code', 'multifile', 'reasoning', 'vision'] },
        { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'codex', qualityScore: 0.90, maxTokens: 128000, features: ['code', 'edit', 'quick_tasks', 'reasoning'] },
        { id: 'kimi-k2-5', name: 'Kimi K2.5', provider: 'kimi', qualityScore: 0.91, maxTokens: 256000, features: ['code', 'long_context', 'multimodal', 'reasoning', 'thinking_mode'] },
      ];

      res.json({ providers, models, billingModel: 'subscription', total: models.length });
    });

    // Tools API (proxy to core)
    this.app.get('/api/tools', auth, async (req, res) => {
      await this.forwardCoreApi(req, res, '/api/tools');
    });

    this.app.get('/api/tools/:name', auth, async (req, res) => {
      await this.forwardCoreApi(req, res, `/api/tools/${encodeURIComponent(req.params.name)}`);
    });

    this.app.post('/api/tools/:name/execute', auth, async (req, res) => {
      await this.forwardCoreApiWithBody(req, res, `/api/tools/${encodeURIComponent(req.params.name)}/execute`);
    });

    // Workflows API (GSD Domain)
    this.app.get('/api/workflows', auth, async (req, res) => {
      try {
        const workflows = this.gsdDomain.listWorkflows?.() || [];
        res.json({ workflows, total: workflows.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch workflows', message: err.message });
      }
    });

    this.app.post('/api/workflows', auth, async (req, res) => {
      try {
        const { type, tasks, options, name, description } = req.body;
        const workflow = this.gsdDomain.createWorkflow(type, tasks, { name, description, ...options });
        res.status(201).json(workflow);
      } catch (err) {
        res.status(400).json({ error: 'Failed to create workflow', message: err.message });
      }
    });

    this.app.get('/api/workflows/:id', auth, async (req, res) => {
      try {
        const workflow = this.gsdDomain.getStatus?.(req.params.id);
        if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
        res.json(workflow);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch workflow', message: err.message });
      }
    });

    this.app.post('/api/workflows/:id/execute', auth, async (req, res) => {
      try {
        const result = await this.gsdDomain.executeWorkflow?.(req.params.id, req.body);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: 'Failed to execute workflow', message: err.message });
      }
    });

    this.app.post('/api/workflows/:id/pause', auth, async (req, res) => {
      try {
        const result = await this.gsdDomain.pauseWorkflow?.(req.params.id);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: 'Failed to pause workflow', message: err.message });
      }
    });

    this.app.post('/api/workflows/:id/resume', auth, async (req, res) => {
      try {
        const result = await this.gsdDomain.resumeWorkflow?.(req.params.id);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: 'Failed to resume workflow', message: err.message });
      }
    });

    this.app.post('/api/workflows/:id/cancel', auth, async (req, res) => {
      try {
        const result = await this.gsdDomain.cancelWorkflow(req.params.id, req.body.reason);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: 'Failed to cancel workflow', message: err.message });
      }
    });

    this.app.delete('/api/workflows/:id', auth, async (req, res) => {
      try {
        this.gsdDomain.deleteWorkflow?.(req.params.id);
        res.json({ id: req.params.id, deleted: true });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete workflow', message: err.message });
      }
    });

    // Presence endpoint
    this.app.get('/api/presence', auth, (req, res) => {
      if (!this.wsServer) {
        return res.json({ totalConnections: 0, uniqueUsers: 0 });
      }
      res.json(this.wsServer.getPresence());
    });

    // CV Management API
    this.app.get('/api/cv', auth, async (req, res) => {
      try {
        const cvs = this.cvSystem.registry.list();
        res.json({ cvs, total: cvs.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch CVs', message: err.message });
      }
    });

    this.app.get('/api/cv/:id', auth, async (req, res) => {
      try {
        const cv = this.cvSystem.registry.get(req.params.id);
        if (!cv) return res.status(404).json({ error: 'CV not found' });
        res.json(cv);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch CV', message: err.message });
      }
    });

    this.app.post('/api/cv', auth, async (req, res) => {
      try {
        const { templateName, overrides } = req.body;
        const cv = await this.cvSystem.factory.createFromTemplate(templateName, overrides);
        res.status(201).json(cv);
      } catch (err) {
        res.status(400).json({ error: 'Failed to create CV', message: err.message });
      }
    });

    this.app.post('/api/cv/:id/activate', auth, async (req, res) => {
      try {
        const cv = await this.cvSystem.manager.activate(req.params.id);
        res.json(cv);
      } catch (err) {
        res.status(500).json({ error: 'Failed to activate CV', message: err.message });
      }
    });

    this.app.post('/api/cv/:id/suspend', auth, async (req, res) => {
      try {
        const cv = await this.cvSystem.manager.suspend(req.params.id);
        res.json(cv);
      } catch (err) {
        res.status(500).json({ error: 'Failed to suspend CV', message: err.message });
      }
    });

    this.app.delete('/api/cv/:id', auth, async (req, res) => {
      try {
        this.cvSystem.registry.delete(req.params.id);
        res.json({ id: req.params.id, deleted: true });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete CV', message: err.message });
      }
    });
  }

  /**
   * Sets up context snapshot routes
   */
  setupContextRoutes() {
    const auth = this.authMiddleware.bind(this);

    // List all snapshots
    this.app.get('/api/context/snapshots', auth, async (req, res) => {
      try {
        const snapshots = await this.contextManager.listSnapshots();
        res.json({ snapshots, total: snapshots.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch snapshots', message: err.message });
      }
    });

    // Create new snapshot
    this.app.post('/api/context/snapshots', auth, async (req, res) => {
      try {
        const { projectPath, options } = req.body;
        const snapshot = await this.contextManager.capture(projectPath, options);
        res.status(201).json(snapshot);
      } catch (err) {
        res.status(400).json({ error: 'Failed to create snapshot', message: err.message });
      }
    });

    // Get snapshot by ID
    this.app.get('/api/context/snapshots/:id', auth, async (req, res) => {
      try {
        const snapshot = await this.contextManager.getSnapshot(req.params.id);
        if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
        res.json(snapshot);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch snapshot', message: err.message });
      }
    });

    // Get snapshot files
    this.app.get('/api/context/snapshots/:id/files', auth, async (req, res) => {
      try {
        const snapshot = await this.contextManager.getSnapshot(req.params.id);
        if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
        res.json({ files: snapshot.files || [] });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch snapshot files', message: err.message });
      }
    });

    // Restore snapshot
    this.app.post('/api/context/snapshots/:id/restore', auth, async (req, res) => {
      try {
        const result = await this.contextManager.restore(req.params.id, req.body);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: 'Failed to restore snapshot', message: err.message });
      }
    });

    // Delete snapshot
    this.app.delete('/api/context/snapshots/:id', auth, async (req, res) => {
      try {
        await this.contextManager.deleteSnapshot(req.params.id);
        res.json({ id: req.params.id, deleted: true });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete snapshot', message: err.message });
      }
    });

    // Compare snapshots
    this.app.get('/api/context/compare', auth, async (req, res) => {
      try {
        const { id1, id2 } = req.query;
        if (!id1 || !id2) {
          return res.status(400).json({ error: 'Missing snapshot IDs (id1, id2)' });
        }
        const comparison = await this.contextManager.compare(id1, id2);
        res.json(comparison);
      } catch (err) {
        res.status(500).json({ error: 'Failed to compare snapshots', message: err.message });
      }
    });
  }

  /**
   * Forwards a dashboard request to the core API.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {string} backendPath
   */
  async forwardCoreApi(req, res, backendPath) {
    try {
      const target = new URL(backendPath, this.apiBaseUrl);
      const headers = {};

      if (req.headers.authorization) {
        headers.authorization = req.headers.authorization;
      }

      const response = await fetch(target, {
        method: req.method,
        headers,
      });

      const contentType = response.headers.get('content-type') || '';
      const body = await response.text();

      if (contentType.includes('application/json')) {
        const payload = body ? JSON.parse(body) : null;
        return res.status(response.status).json(payload);
      }

      return res.status(response.status).send(body);
    } catch (error) {
      console.error('Dashboard core API proxy error:', error);
      return res.status(502).json({
        error: 'Failed to reach core API',
        message: error.message,
        backendPath,
      });
    }
  }

  /**
   * Forwards a dashboard request (with body) to the core API.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {string} backendPath
   */
  async forwardCoreApiWithBody(req, res, backendPath) {
    try {
      const target = new URL(backendPath, this.apiBaseUrl);
      const headers = { 'Content-Type': 'application/json' };
      if (req.headers.authorization) {
        headers.authorization = req.headers.authorization;
      }

      // Read request body
      const chunks = [];
      for await (const chunk of req) { chunks.push(chunk); }
      const body = Buffer.concat(chunks).toString();

      const response = await fetch(target, {
        method: req.method,
        headers,
        body: body || undefined,
      });

      const contentType = response.headers.get('content-type') || '';
      const responseBody = await response.text();
      if (contentType.includes('application/json')) {
        return res.status(response.status).json(responseBody ? JSON.parse(responseBody) : null);
      }
      return res.status(response.status).send(responseBody);
    } catch (error) {
      return res.status(502).json({ error: 'Failed to reach core API', message: error.message });
    }
  }

  /**
   * Sets up error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found', path: req.path });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('Dashboard server error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        requestId: req.id,
      });
    });
  }

  /**
   * Starts the HTTP server and WebSocket
   * @returns {Promise<import('http').Server>}
   */
  async start() {
    // Initialize Analytics if provided
    if (this.analytics && !this.analytics._initialized) {
      try {
        await this.analytics.init();
        console.log('Analytics system initialized');
      } catch (err) {
        console.error('Failed to initialize analytics:', err);
      }
    }
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, this.host, (err) => {
        if (err) return reject(err);
        console.log(`Dashboard server running at http://${this.host}:${this.port}`);
        
        // Initialize WebSocket server
        this.wsServer = new DashboardWebSocket(this.server, {
          jwtSecret: this.jwtSecret,
          authEnabled: this.authEnabled,
        });
        
        this.wsServer.start().then(() => {
          console.log('Dashboard WebSocket server started');
          
          // Re-setup WebSocket integration now that wsServer is available
          this.setupWebSocketIntegration();
          
          resolve(this.server);
        }).catch(reject);
      });
    });
  }

  /**
   * Sets up agent orchestration routes
   * BIOS agent spawning and task execution
   */
  setupOrchestrationRoutes() {
    const auth = this.authMiddleware.bind(this);
    
    // Spawn new agent from CV
    this.app.post('/api/bios/agents/spawn', auth, async (req, res) => {
      try {
        const { cv, client, context, options = {} } = req.body;
        
        if (!cv) {
          return res.status(400).json({ error: 'CV configuration is required' });
        }
        
        const agent = await this.orchestrator?.spawnAgent(cv, { 
          client, 
          context,
          ...options 
        });
        
        // WebSocket notification
        if (this.wsServer) {
          this.wsServer.broadcast({
            type: 'orchestrator.agentSpawned',
            data: { agentId: agent.id, type: cv.type || 'unknown' },
            timestamp: new Date().toISOString(),
          });
        }
        
        res.status(201).json(agent);
      } catch (err) {
        console.error('Error spawning agent:', err);
        res.status(500).json({ error: 'Failed to spawn agent', message: err.message });
      }
    });
    
    // Delegate single task to client
    this.app.post('/api/bios/tasks/delegate', auth, async (req, res) => {
      try {
        const { task, client, options = {} } = req.body;
        
        if (!task) {
          return res.status(400).json({ error: 'Task is required' });
        }
        
        if (!client) {
          return res.status(400).json({ error: 'Client is required' });
        }
        
        if (typeof client !== 'string' || client.trim().length === 0) {
          return res.status(400).json({ error: 'Client must be a valid non-empty string' });
        }
        
        const result = await this.orchestrator?.delegate(task, client, options);
        res.json(result);
      } catch (err) {
        console.error('Error delegating task:', err);
        res.status(500).json({ error: 'Failed to delegate task', message: err.message });
      }
    });
    
    // Execute tasks in parallel across multiple clients
    this.app.post('/api/bios/execute/parallel', auth, async (req, res) => {
      try {
        const { tasks, clients, options = {} } = req.body;
        
        if (!Array.isArray(tasks) || tasks.length === 0) {
          return res.status(400).json({ error: 'Tasks array is required' });
        }
        
        if (!Array.isArray(clients) || clients.length === 0) {
          return res.status(400).json({ error: 'Clients array is required' });
        }
        
        if (!clients.every(c => typeof c === 'string' && c.trim().length > 0)) {
          return res.status(400).json({ error: 'All clients must be valid non-empty strings' });
        }
        
        const result = await this.orchestrator?.executeParallel(tasks, clients, options);
        res.json(result);
      } catch (err) {
        console.error('Error executing parallel tasks:', err);
        res.status(500).json({ error: 'Failed to execute parallel tasks', message: err.message });
      }
    });
    
    // Get orchestrator status
    this.app.get('/api/bios/status', auth, (req, res) => {
      try {
        const status = this.orchestrator?.getStatus();
        res.json(status);
      } catch (err) {
        console.error('Error getting orchestrator status:', err);
        res.status(500).json({ error: 'Failed to get status', message: err.message });
      }
    });
  }

  /**
   * Sets up agent pool management routes
   */
  setupAgentPoolRoutes() {
    const auth = this.authMiddleware.bind(this);
    
    // Get pool statistics
    this.app.get('/api/agents/pool/stats', auth, (req, res) => {
      try {
        const stats = this.agentPool.getStats();
        res.json(stats);
      } catch (err) {
        console.error('Error getting pool stats:', err);
        res.status(500).json({ error: 'Failed to get pool stats', message: err.message });
      }
    });
    
    // Scale up pool (add agents)
    this.app.post('/api/agents/pool/scale-up', auth, async (req, res) => {
      try {
        const { count = 1 } = req.body;
        const results = [];
        
        for (let i = 0; i < count; i++) {
          const agent = await this.agentPool.scaleUp();
          results.push(agent);
        }
        
        res.json({ 
          scaled: results.length, 
          agents: results,
          newStats: this.agentPool.getStats()
        });
      } catch (err) {
        console.error('Error scaling up pool:', err);
        res.status(500).json({ error: 'Failed to scale up pool', message: err.message });
      }
    });
    
    // Scale down pool (remove agents)
    this.app.post('/api/agents/pool/scale-down', auth, async (req, res) => {
      try {
        const { count = 1 } = req.body;
        const results = [];
        
        for (let i = 0; i < count; i++) {
          const agent = await this.agentPool.scaleDown();
          if (agent) results.push(agent);
        }
        
        res.json({ 
          scaled: results.length, 
          agents: results,
          newStats: this.agentPool.getStats()
        });
      } catch (err) {
        console.error('Error scaling down pool:', err);
        res.status(500).json({ error: 'Failed to scale down pool', message: err.message });
      }
    });
    
    // List all agents in pool
    this.app.get('/api/agents/pool', auth, (req, res) => {
      try {
        const stats = this.agentPool.getStats();
        res.json({
          agents: stats.agents || [],
          stats: {
            poolSize: stats.poolSize,
            availableCount: stats.availableCount,
            activeCount: stats.activeCount,
            utilization: stats.utilization,
          }
        });
      } catch (err) {
        console.error('Error listing pool agents:', err);
        res.status(500).json({ error: 'Failed to list pool agents', message: err.message });
      }
    });
  }

  /**
   * Sets up task queue and dead letter queue routes
   */
  setupQueueRoutes() {
    const auth = this.authMiddleware.bind(this);
    
    // List all queued tasks
    this.app.get('/api/queue/tasks', auth, (req, res) => {
      try {
        const { status, tag, limit = 50 } = req.query;
        let tasks = this.taskQueue.toArray();
        
        // Apply filters
        if (status) {
          tasks = tasks.filter(t => t.status === status);
        }
        if (tag) {
          tasks = tasks.filter(t => t.tag === tag);
        }
        
        // Apply limit
        tasks = tasks.slice(0, parseInt(limit, 10));
        
        res.json({
          tasks,
          total: this.taskQueue.size(),
          stats: this.taskQueue.getStats(),
          filters: { status, tag, limit: parseInt(limit, 10) }
        });
      } catch (err) {
        console.error('Error listing queue tasks:', err);
        res.status(500).json({ error: 'Failed to list queue tasks', message: err.message });
      }
    });
    
    // Enqueue new task
    this.app.post('/api/queue/tasks', auth, (req, res) => {
      try {
        const { task, priority = 'NORMAL', data, metadata, tag } = req.body;
        
        if (!task) {
          return res.status(400).json({ error: 'Task is required' });
        }
        
        // Map priority string to number
        const priorityMap = {
          'CRITICAL': QueuePriority.CRITICAL,
          'HIGH': QueuePriority.HIGH,
          'NORMAL': QueuePriority.NORMAL,
          'LOW': QueuePriority.LOW,
          'BACKGROUND': QueuePriority.BACKGROUND,
        };
        
        const taskId = this.taskQueue.enqueue(
          task,
          priorityMap[priority] ?? QueuePriority.NORMAL,
          data,
          metadata,
          tag
        );
        
        res.status(201).json({ 
          id: taskId, 
          priority,
          status: 'pending',
          queueStats: this.taskQueue.getStats()
        });
      } catch (err) {
        console.error('Error enqueueing task:', err);
        res.status(500).json({ error: 'Failed to enqueue task', message: err.message });
      }
    });
    
    // Reprioritize task
    this.app.patch('/api/queue/tasks/:id/priority', auth, (req, res) => {
      try {
        const { priority } = req.body;
        
        if (priority === undefined) {
          return res.status(400).json({ error: 'Priority is required' });
        }
        
        if (!Number.isInteger(priority)) {
          return res.status(400).json({ error: 'Priority must be a valid integer' });
        }
        
        const success = this.taskQueue.reprioritize(req.params.id, priority);
        
        if (!success) {
          return res.status(404).json({ error: 'Task not found' });
        }
        
        res.json({ id: req.params.id, priority, reprioritized: true });
      } catch (err) {
        console.error('Error reprioritizing task:', err);
        res.status(500).json({ error: 'Failed to reprioritize task', message: err.message });
      }
    });
    
    // Get dead letter queue tasks
    this.app.get('/api/dlq/tasks', auth, (req, res) => {
      try {
        const { status, limit = 50 } = req.query;
        let tasks = Array.from(this.deadLetterQueue.failedTasks.values());
        
        if (status) {
          tasks = tasks.filter(t => t.status === status);
        }
        
        tasks = tasks.slice(0, parseInt(limit, 10));
        
        res.json({
          tasks,
          total: this.deadLetterQueue.failedTasks.size,
          stats: this.deadLetterQueue.stats,
        });
      } catch (err) {
        console.error('Error listing DLQ tasks:', err);
        res.status(500).json({ error: 'Failed to list DLQ tasks', message: err.message });
      }
    });
    
    // Retry a failed task from DLQ
    this.app.post('/api/dlq/tasks/:id/retry', auth, async (req, res) => {
      try {
        const result = await this.deadLetterQueue.retryTask(req.params.id);
        
        if (!result) {
          return res.status(404).json({ error: 'Task not found in DLQ' });
        }
        
        res.json({ 
          id: req.params.id, 
          retried: true,
          result
        });
      } catch (err) {
        console.error('Error retrying DLQ task:', err);
        res.status(500).json({ error: 'Failed to retry task', message: err.message });
      }
    });
    
    // Get queue statistics
    this.app.get('/api/queue/stats', auth, (req, res) => {
      try {
        res.json({
          taskQueue: this.taskQueue.getStats(),
          deadLetterQueue: this.deadLetterQueue.stats,
        });
      } catch (err) {
        console.error('Error getting queue stats:', err);
        res.status(500).json({ error: 'Failed to get queue stats', message: err.message });
      }
    });
  }

  /**
   * Sets up health monitoring routes
   */
  setupHealthRoutes() {
    const auth = this.authMiddleware.bind(this);
    
    // Get all component health statuses
    this.app.get('/api/health/components', auth, async (req, res) => {
      try {
        const health = await this.healthChecker.checkHealth();
        res.json(health);
      } catch (err) {
        console.error('Error checking health:', err);
        res.status(500).json({ error: 'Failed to check health', message: err.message });
      }
    });
    
    // Get specific component health
    this.app.get('/api/health/components/:id', auth, async (req, res) => {
      try {
        const { id } = req.params;
        const health = await this.healthChecker.checkHealth();
        
        const componentHealth = health.details?.[id];
        if (!componentHealth) {
          return res.status(404).json({ error: 'Component not found' });
        }
        
        res.json({
          component: id,
          ...componentHealth
        });
      } catch (err) {
        console.error('Error checking component health:', err);
        res.status(500).json({ error: 'Failed to check component health', message: err.message });
      }
    });
    
    // Get readiness status (for K8s)
    this.app.get('/api/health/ready', auth, async (req, res) => {
      try {
        const readiness = await this.healthChecker.checkReadiness();
        const statusCode = readiness.ready ? 200 : 503;
        res.status(statusCode).json(readiness);
      } catch (err) {
        res.status(503).json({ ready: false, error: err.message });
      }
    });
    
    // Get liveness status (for K8s)
    this.app.get('/api/health/live', auth, (req, res) => {
      try {
        const liveness = this.healthChecker.checkLiveness();
        const statusCode = liveness.live ? 200 : 503;
        res.status(statusCode).json(liveness);
      } catch (err) {
        res.status(503).json({ live: false, error: err.message });
      }
    });
  }

  /**
   * Stops the HTTP server and WebSocket gracefully
   * @returns {Promise<void>}
   */
  async stop() {
    // Close analytics if initialized
    if (this.analytics?._initialized) {
      try {
        await this.analytics.close();
        console.log('Analytics system closed');
      } catch (err) {
        console.error('Error closing analytics:', err);
      }
    }
    
    return new Promise((resolve) => {
      // Stop WebSocket first
      if (this.wsServer) {
        this.wsServer.stop().then(() => {
          console.log('Dashboard WebSocket server stopped');
        }).catch((err) => {
          console.error('Error stopping WebSocket server:', err);
        }).finally(() => {
          // Stop HTTP server
          if (this.server) {
            this.server.close(resolve);
          } else {
            resolve();
          }
        });
      } else if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * Gets the WebSocket server instance
   * @returns {DashboardWebSocket|null}
   */
  getWebSocketServer() {
    return this.wsServer;
  }
}

export default DashboardServer;
