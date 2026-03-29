/**
 * CogniMesh v5.0 - Dashboard Server
 * HTTP server with Express, API endpoints, auth middleware, CORS, Helmet, rate limiting
 * @module dashboard/server
 */

import express from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import net from 'net';
import { spawn, spawnSync } from 'child_process';
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
import { ChatController } from '../controllers/chat-controller.js';
import {
  getModelRuntimeCandidates,
  getOperatorProviderCatalog,
  getSubscriptionModelProfiles,
  normalizeModelId
} from '../clients/index.js';

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
    this.envFilePath = options.envFilePath || process.env.ENV_FILE_PATH || path.resolve(process.cwd(), '.env');
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
    this.chatController = options.chatController || new ChatController({ db: options.db });
    
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
    this.setupBillingRoutes();
    this.setupActivityRoutes();
    this.setupPhase2Routes();
    this.setupSystemRoutes();
    this.setupSettingsRoutes();
    this.setupContextRoutes();
    this.setupOrgChartRoutes();
    this.setupOrchestrationRoutes();
    this.setupAgentPoolRoutes();
    this.setupQueueRoutes();
    this.setupHealthRoutes();
    this.setupChatRoutes();

    // Static file serving
    this.app.use(express.static(path.join(__dirname, 'public')));

    // SPA fallback - serve index.html for all non-API routes
    this.app.get('*', (req, res, next) => {
      if (!req.path.startsWith('/api')) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
      }
      return next();
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

    // Get aggregated agent activity from core + CV registry
    this.app.get('/api/analytics/agents', auth, async (req, res) => {
      try {
        const agents = await this.getAggregatedAgents(req);
        const activeAgents = agents.filter((agent) => ['online', 'busy', 'active', 'running'].includes(
          String(agent.status || agent.state || '').toLowerCase()
        )).length;

        const tasksExecuted = agents.reduce((sum, agent) => (
          sum + (Number(agent.tasksCompleted) || Number(agent.tasks_executed) || 0)
        ), 0);

        const successRates = agents
          .map((agent) => Number(agent.successRate ?? agent.success_rate))
          .filter((value) => Number.isFinite(value));
        const avgResponseTimes = agents
          .map((agent) => Number(agent.avgResponseTime ?? agent.avg_response_time ?? agent.latency))
          .filter((value) => Number.isFinite(value) && value >= 0);

        const successRate = successRates.length > 0
          ? Number((successRates.reduce((a, b) => a + b, 0) / successRates.length).toFixed(2))
          : 0;
        const avgResponseTime = avgResponseTimes.length > 0
          ? Number((avgResponseTimes.reduce((a, b) => a + b, 0) / avgResponseTimes.length).toFixed(2))
          : 0;

        res.json({
          activeAgents,
          tasksExecuted,
          successRate,
          avgResponseTime,
          totalAgents: agents.length
        });
      } catch (err) {
        console.error('Error fetching agent analytics:', err);
        res.status(500).json({ error: 'Failed to fetch agent analytics', message: err.message });
      }
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
   * Sets up billing routes (core API proxy)
   */
  setupBillingRoutes() {
    const auth = this.authMiddleware.bind(this);

    const proxy = (method, path, backendPath, withBody = false) => {
      this.app[method](path, auth, async (req, res) => {
        const resolvedPath = backendPath.replace(/:([A-Za-z0-9_]+)/g, (_match, key) =>
          encodeURIComponent(req.params?.[key] ?? '')
        );
        const query = this._toQueryString(req.query);
        const targetPath = `${resolvedPath}${query}`;
        if (withBody) {
          await this.forwardCoreApiWithBody(req, res, targetPath);
        } else {
          await this.forwardCoreApi(req, res, targetPath);
        }
      });
    };

    proxy('get', '/api/billing/summary', '/api/billing/summary');
    proxy('get', '/api/billing/costs', '/api/billing/costs');
    proxy('get', '/api/billing/costs/by-model', '/api/billing/costs/by-model');
    proxy('get', '/api/billing/costs/by-provider', '/api/billing/costs/by-provider');
    proxy('get', '/api/billing/costs/by-agent', '/api/billing/costs/by-agent');
    proxy('get', '/api/billing/alerts', '/api/billing/alerts');
    proxy('put', '/api/billing/alerts/:id/acknowledge', '/api/billing/alerts/:id/acknowledge', true);
    proxy('get', '/api/billing/forecast', '/api/billing/forecast');

    // Budget policy and incidents routes
    proxy('get', '/api/billing/policies', '/api/billing/policies');
    proxy('post', '/api/billing/policies', '/api/billing/policies', true);
    proxy('get', '/api/billing/policies/:id', '/api/billing/policies/:id');
    proxy('put', '/api/billing/policies/:id', '/api/billing/policies/:id', true);
    proxy('delete', '/api/billing/policies/:id', '/api/billing/policies/:id');
    proxy('post', '/api/billing/policies/:id/evaluate', '/api/billing/policies/:id/evaluate', true);
    proxy('get', '/api/billing/incidents', '/api/billing/incidents');
    proxy('post', '/api/billing/incidents/:id/acknowledge', '/api/billing/incidents/:id/acknowledge', true);
  }

  /**
   * Sets up activity routes
   */
  setupActivityRoutes() {
    const auth = this.authMiddleware.bind(this);

    this.app.get('/api/activity/recent', auth, async (req, res) => {
      try {
        const query = this._toQueryString(req.query);
        const target = `/api/activity${query}`;
        const payload = await this.fetchCoreApi(req, target);

        const rawItems = payload?.items || payload?.data || payload?.activities || [];
        const activities = rawItems.map((item) => this.normalizeActivity(item));
        res.json({
          activities,
          total: payload?.total ?? activities.length
        });
      } catch (error) {
        res.status(502).json({
          error: 'Failed to fetch activity feed',
          message: error.message
        });
      }
    });

    this.app.get('/api/activity/dashboard', auth, async (req, res) => {
      await this.forwardCoreApi(req, res, `/api/activity/dashboard${this._toQueryString(req.query)}`);
    });
  }

  /**
   * Sets up Phase 2 routes (finance/workspaces/work-products)
   */
  setupPhase2Routes() {
    const auth = this.authMiddleware.bind(this);

    const proxy = (method, path, backendPath, withBody = false) => {
      this.app[method](path, auth, async (req, res) => {
        const resolvedPath = backendPath.replace(/:([A-Za-z0-9_]+)/g, (_match, key) =>
          encodeURIComponent(req.params?.[key] ?? '')
        );
        const targetPath = `${resolvedPath}${this._toQueryString(req.query)}`;
        if (withBody) {
          await this.forwardCoreApiWithBody(req, res, targetPath);
        } else {
          await this.forwardCoreApi(req, res, targetPath);
        }
      });
    };

    // Finance
    proxy('get', '/api/finance/events', '/api/finance/events');
    proxy('post', '/api/finance/events', '/api/finance/events', true);
    proxy('get', '/api/finance/events/:id', '/api/finance/events/:id');
    proxy('get', '/api/finance/summary', '/api/finance/summary');

    // Workspaces
    proxy('get', '/api/workspaces', '/api/workspaces');
    proxy('post', '/api/workspaces', '/api/workspaces', true);
    proxy('get', '/api/workspaces/:id', '/api/workspaces/:id');
    proxy('put', '/api/workspaces/:id', '/api/workspaces/:id', true);
    proxy('delete', '/api/workspaces/:id', '/api/workspaces/:id');
    proxy('get', '/api/workspaces/:id/operations', '/api/workspaces/:id/operations');
    proxy('post', '/api/workspaces/:id/operations', '/api/workspaces/:id/operations', true);
    proxy('patch', '/api/workspaces/operations/:id', '/api/workspaces/operations/:id', true);

    // Work products
    proxy('get', '/api/work-products', '/api/work-products');
    proxy('post', '/api/work-products', '/api/work-products', true);
    proxy('get', '/api/work-products/:id', '/api/work-products/:id');
    proxy('put', '/api/work-products/:id', '/api/work-products/:id', true);
    proxy('delete', '/api/work-products/:id', '/api/work-products/:id');
    proxy('get', '/api/work-products/issue/:id', '/api/work-products/issue/:id');
  }

  /**
   * Sets up system routes
   */
  setupSystemRoutes() {
    const auth = this.authMiddleware.bind(this);
    const adminOnly = this.requireRole('admin');

    this.app.get('/api/system/status', auth, async (req, res) => {
      await this.forwardCoreApi(req, res, '/api/system/status');
    });

    this.app.get('/api/system/metrics', auth, this.requireRole('admin'), async (req, res) => {
      await this.forwardCoreApi(req, res, '/api/system/metrics');
    });

    this.app.get('/api/agents', auth, async (req, res) => {
      try {
        const agents = await this.getAggregatedAgents(req);
        const active = agents.filter((agent) => ['online', 'busy', 'active', 'running'].includes(
          String(agent.status || agent.state || '').toLowerCase()
        )).length;
        res.json({
          agents,
          total: agents.length,
          active,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(502).json({ error: 'Failed to fetch agents', message: error.message });
      }
    });

    this.app.get('/api/agents/:id/status', auth, async (req, res) => {
      try {
        const agents = await this.getAggregatedAgents(req);
        const agent = agents.find((entry) => entry.id === req.params.id);
        if (!agent) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        return res.json(agent);
      } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch agent status', message: error.message });
      }
    });

    this.app.post('/api/agents', auth, adminOnly, async (req, res) => {
      try {
        const payload = req.body || {};
        const name = String(payload.name || '').trim();
        const templateName = String(payload.templateName || 'developer').trim() || 'developer';
        if (!name) {
          return res.status(400).json({ error: 'Agent name is required' });
        }

        const providerCatalog = getOperatorProviderCatalog();
        const providerMap = new Map(providerCatalog.map((provider) => [provider.id, provider]));
        const profileMap = new Map(getSubscriptionModelProfiles().map((profile) => [profile.id, profile]));

        const canonicalModelId = normalizeModelId(String(payload.model || '').trim());
        const profile = profileMap.get(canonicalModelId);
        if (!profile) {
          return res.status(400).json({ error: `Unsupported model '${payload.model || ''}'` });
        }

        const provider = this.normalizeProviderId(payload.provider || profile.runtimeProvider);
        if (!providerMap.has(provider)) {
          return res.status(400).json({ error: `Unsupported provider '${payload.provider || ''}'` });
        }
        if (provider !== profile.runtimeProvider) {
          return res.status(400).json({
            error: `Model '${canonicalModelId}' requires provider '${profile.runtimeProvider}'`
          });
        }

        const providerInfo = providerMap.get(provider);
        const requestedSurface = this.normalizeSurfaceId(payload.surface || '');
        const allCandidates = getModelRuntimeCandidates(canonicalModelId)
          .filter((candidate) => providerInfo.supportedModes.includes(candidate.mode));
        const requestedCandidates = requestedSurface
          ? allCandidates.filter((candidate) => candidate.mode === requestedSurface)
          : allCandidates;
        const modelSurfaces = [...new Set(allCandidates.map((candidate) => candidate.mode))];

        if (requestedSurface && requestedCandidates.length === 0) {
          return res.status(400).json({
            error: `Surface '${requestedSurface}' is not supported for model '${canonicalModelId}'`,
            allowedSurfaces: modelSurfaces
          });
        }

        const providerStatus = await this.detectProviderSurfaceStatus();
        const liveSurfaceStatus = providerStatus[provider] || {};
        const connectedModes = new Set(
          Object.entries(liveSurfaceStatus)
            .filter(([, connected]) => Boolean(connected))
            .map(([mode]) => mode)
        );
        const preferredOrder = [...providerInfo.preferredModes, ...providerInfo.supportedModes];
        const modeRank = (mode) => {
          const idx = preferredOrder.indexOf(mode);
          return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
        };
        const sortByPreference = (left, right) => modeRank(left.mode) - modeRank(right.mode);

        const connectedRequested = requestedCandidates
          .filter((candidate) => connectedModes.has(candidate.mode))
          .sort(sortByPreference);
        const connectedAny = allCandidates
          .filter((candidate) => connectedModes.has(candidate.mode))
          .sort(sortByPreference);
        const preferredRequested = [...requestedCandidates].sort(sortByPreference);
        const preferredAny = [...allCandidates].sort(sortByPreference);

        const selectedBinding = connectedRequested[0]
          || connectedAny[0]
          || preferredRequested[0]
          || preferredAny[0]
          || null;

        if (!selectedBinding) {
          return res.status(400).json({
            error: `No runtime surface available for model '${canonicalModelId}' with provider '${provider}'`
          });
        }

        const surfaceFallbackWarning = requestedSurface && selectedBinding.mode !== requestedSurface
          ? `Requested surface '${requestedSurface}' is offline. Using '${selectedBinding.mode}' instead.`
          : null;

        const surface = selectedBinding.mode;
        const role = String(payload.role || '').trim();
        const id = this.sanitizeAgentId(payload.id || name);

        if (!id) {
          return res.status(400).json({ error: 'Invalid agent id/name' });
        }

        if (this.cvSystem?.registry?.get?.(id)) {
          return res.status(409).json({ error: `Agent '${id}' already exists` });
        }

        const existingTags = Array.isArray(payload.tags)
          ? payload.tags.map((tag) => String(tag).trim()).filter(Boolean)
          : [];

        const runtimeTags = [
          `provider:${provider}`,
          surface ? `surface:${surface}` : null,
          canonicalModelId ? `model:${canonicalModelId}` : null
        ].filter(Boolean);

        const metadataTags = Array.from(new Set([...existingTags, ...runtimeTags]));
        const fallbackClients = ['claude', 'codex', 'kimi'].filter((entry) => entry !== provider);

        const overrides = {
          identity: {
            id,
            name,
            description: role || `Agent ${name}`
          },
          execution: {
            preferred_client: provider,
            fallback_clients: fallbackClients
          },
          lifecycle: { status: 'active' },
          runtime: {
            provider,
            model: canonicalModelId,
            surface,
            mode: surface,
            clientModel: selectedBinding.clientModel
          },
          adapterConfig: {
            provider,
            model: canonicalModelId,
            surface,
            mode: surface,
            command: payload.command || null,
            extraArgs: Array.isArray(payload.extraArgs) ? payload.extraArgs : [],
            env: payload.env && typeof payload.env === 'object' ? payload.env : {}
          },
          metadata: {
            tags: metadataTags,
            category: 'worker',
            domain: 'engineering'
          }
        };

        if (role) {
          overrides.specialization = { primary: this.sanitizeAgentId(role).replace(/_/g, '-') || 'generalist' };
        }

        const created = this.cvSystem.factory.createFromTemplate(templateName, overrides, { autoRegister: true });
        const activated = await this.cvSystem.manager.activate(created.identity.id);
        const cv = activated?.cv || created;
        const agent = this.normalizeCvAgent(cv);

        this.notifyAgentUpdate('agent.created', agent);
        this.notifyAgentUpdate('agent.status', agent);

        return res.status(201).json({
          agent,
          created: true,
          warning: surfaceFallbackWarning,
          binding: {
            provider: selectedBinding.provider,
            mode: selectedBinding.mode,
            clientModel: selectedBinding.clientModel
          }
        });
      } catch (error) {
        return res.status(400).json({ error: 'Failed to create agent', message: error.message });
      }
    });

    this.app.post('/api/agents/:id/wake', auth, adminOnly, async (req, res) => {
      try {
        const result = await this.cvSystem.manager.activate(req.params.id);
        const agent = this.normalizeCvAgent(result?.cv || this.cvSystem.registry.get(req.params.id));

        this.notifyAgentUpdate('agent.updated', agent);
        this.notifyAgentUpdate('agent.status', agent);

        return res.json({ agent, message: `Agent '${req.params.id}' is online` });
      } catch (error) {
        return res.status(404).json({ error: 'Failed to wake agent', message: error.message });
      }
    });

    this.app.post('/api/agents/:id/pause', auth, adminOnly, async (req, res) => {
      try {
        const reason = String(req.body?.reason || 'Paused from dashboard').trim();
        const result = await this.cvSystem.manager.suspend(req.params.id, reason);
        const agent = this.normalizeCvAgent(result?.cv || this.cvSystem.registry.get(req.params.id));

        this.notifyAgentUpdate('agent.updated', agent);
        this.notifyAgentUpdate('agent.status', agent);

        return res.json({ agent, message: `Agent '${req.params.id}' paused` });
      } catch (error) {
        return res.status(404).json({ error: 'Failed to pause agent', message: error.message });
      }
    });

    this.app.post('/api/agents/:id/stop', auth, adminOnly, async (req, res) => {
      try {
        const cv = this.cvSystem.registry.update(req.params.id, {
          lifecycle: { status: 'deprecated', updated_at: Date.now() }
        });
        const agent = this.normalizeCvAgent(cv);

        this.notifyAgentUpdate('agent.updated', agent);
        this.notifyAgentUpdate('agent.status', agent);

        return res.json({ agent, message: `Agent '${req.params.id}' stopped` });
      } catch (error) {
        return res.status(404).json({ error: 'Failed to stop agent', message: error.message });
      }
    });

    this.app.put('/api/agents/:id/config', auth, adminOnly, async (req, res) => {
      try {
        const id = req.params.id;
        const existing = this.cvSystem.registry.get(id);
        if (!existing) {
          return res.status(404).json({ error: 'Agent not found' });
        }

        const payload = req.body || {};
        const updated = this.cvSystem.registry.update(id, {
          runtime: {
            ...existing.runtime,
            model: payload.model || existing.runtime?.model || existing.model || null
          },
          adapterConfig: {
            ...(existing.adapterConfig || {}),
            ...payload
          },
          lifecycle: {
            ...(existing.lifecycle || {}),
            updated_at: Date.now()
          }
        });

        const agent = this.normalizeCvAgent(updated);
        this.notifyAgentUpdate('agent.updated', agent);

        return res.json({ agent, updated: true });
      } catch (error) {
        return res.status(400).json({ error: 'Failed to update agent config', message: error.message });
      }
    });

    // Provider catalog endpoint
    this.app.get('/api/providers', auth, async (req, res) => {
      const providerStatus = await this.detectProviderSurfaceStatus();
      const vendorMap = {
        claude: 'Anthropic',
        codex: 'OpenAI',
        kimi: 'Moonshot'
      };
      const subscriptionMap = {
        claude: '$20/month',
        codex: '$20/month',
        kimi: '$18/month'
      };

      const providers = getOperatorProviderCatalog().map((provider) => {
        const status = providerStatus[provider.id] || {};
        const connectedModes = provider.supportedModes.filter((mode) => Boolean(status[mode]));
        const disconnectedModes = provider.supportedModes.filter((mode) => !Boolean(status[mode]));
        return {
          id: provider.id,
          name: provider.name,
          vendor: vendorMap[provider.id] || provider.id,
          subscription: subscriptionMap[provider.id] || 'Operator-managed',
          modes: provider.supportedModes.map((mode) => this.formatProviderModeLabel(mode)),
          supportedModes: provider.supportedModes,
          preferredModes: provider.preferredModes,
          surfaceStatus: status,
          connectedModes,
          disconnectedModes,
          connected: connectedModes.length > 0,
          fullyConnected: disconnectedModes.length === 0
        };
      });

      const models = getSubscriptionModelProfiles().map((profile) => {
        const bindings = getModelRuntimeCandidates(profile.id);
        return {
          id: profile.id,
          name: profile.name,
          provider: profile.runtimeProvider,
          qualityScore: profile.qualityScore,
          maxTokens: profile.capabilities?.maxTokens ?? null,
          features: profile.capabilities?.features || [],
          surfaces: [...new Set(bindings.map((binding) => binding.mode))],
          bindings: bindings.map((binding) => ({
            provider: binding.provider,
            mode: binding.mode,
            clientModel: binding.clientModel
          }))
        };
      });

      res.json({
        providers,
        models,
        billingModel: 'subscription',
        total: models.length,
        timestamp: new Date().toISOString()
      });
    });

    this.app.post('/api/providers/:provider/surfaces/:surface/open', auth, adminOnly, async (req, res) => {
      try {
        const provider = this.normalizeProviderId(req.params.provider);
        const surface = this.normalizeSurfaceId(req.params.surface);
        const providerCatalog = getOperatorProviderCatalog();
        const providerConfig = providerCatalog.find((entry) => entry.id === provider);

        if (!providerConfig) {
          return res.status(400).json({ error: `Unsupported provider '${req.params.provider}'` });
        }
        if (!providerConfig.supportedModes.includes(surface)) {
          return res.status(400).json({
            error: `Surface '${surface}' is not supported for provider '${provider}'`,
            supportedSurfaces: providerConfig.supportedModes
          });
        }

        const currentStatus = await this.detectProviderSurfaceStatus();
        if (Boolean(currentStatus?.[provider]?.[surface])) {
          return res.json({
            ok: true,
            provider,
            surface,
            connected: true,
            alreadyConnected: true,
            message: `${provider}:${surface} is already connected`
          });
        }

        const launchSpec = this.getProviderSurfaceLaunchSpec(provider, surface, req.body || {});
        if (!launchSpec) {
          return res.status(409).json({
            error: `Surface '${surface}' for provider '${provider}' cannot be launched automatically on this system`,
            manual: true
          });
        }

        const launchResult = this.launchProviderSurface(launchSpec);
        const providerStatus = await this.detectProviderSurfaceStatus();
        const connected = Boolean(providerStatus?.[provider]?.[surface]);

        return res.json({
          ok: true,
          provider,
          surface,
          command: launchSpec.display,
          pid: launchResult?.pid || null,
          connected
        });
      } catch (error) {
        return res.status(500).json({ error: 'Failed to open provider surface', message: error.message });
      }
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
        const listed = this.cvSystem.registry.list(req.query || {});
        const cvs = Array.isArray(listed) ? listed : (listed?.cvs || []);
        const total = listed?.pagination?.total ?? cvs.length;
        res.json({ cvs, total, pagination: listed?.pagination || null });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch CVs', message: err.message });
      }
    });

    this.app.get('/api/cv/templates', auth, async (_req, res) => {
      try {
        const templates = this.cvSystem.registry.listTemplates();
        res.json({ templates, total: templates.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch CV templates', message: err.message });
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
        const { templateName = 'developer', overrides = {}, autoActivate = false } = req.body || {};
        const cv = this.cvSystem.factory.createFromTemplate(templateName, overrides, { autoRegister: true });

        if (autoActivate) {
          const activated = await this.cvSystem.manager.activate(cv?.identity?.id || cv?.id);
          return res.status(201).json(activated?.cv || activated);
        }

        return res.status(201).json(cv);
      } catch (err) {
        return res.status(400).json({ error: 'Failed to create CV', message: err.message });
      }
    });

    this.app.post('/api/cv/:id/activate', auth, async (req, res) => {
      try {
        const result = await this.cvSystem.manager.activate(req.params.id);
        res.json(result?.cv || result);
      } catch (err) {
        res.status(500).json({ error: 'Failed to activate CV', message: err.message });
      }
    });

    this.app.post('/api/cv/:id/suspend', auth, async (req, res) => {
      try {
        const reason = String(req.body?.reason || '').trim();
        const result = await this.cvSystem.manager.suspend(req.params.id, reason);
        res.json(result?.cv || result);
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
   * Sets up dashboard configuration routes
   */
  setupSettingsRoutes() {
    const auth = this.authMiddleware.bind(this);
    const adminOnly = this.requireRole('admin');

    this.app.get('/api/settings/integrations', auth, adminOnly, async (req, res) => {
      try {
        const githubToken = process.env.GITHUB_TOKEN || '';
        const jwtSecret = process.env.JWT_SECRET || this.jwtSecret || '';

        res.json({
          github: {
            configured: Boolean(githubToken),
            masked: this.maskSecret(githubToken)
          },
          jwt: {
            configured: Boolean(jwtSecret),
            masked: this.maskSecret(jwtSecret)
          },
          manager: {
            authEnabled: this.authEnabled,
            githubManagerEnabled: Boolean(
              process.env.GITHUB_TOKEN
              || process.env.GITHUB_APP_ID
              || process.env.GITHUB_APP_PRIVATE_KEY
            )
          },
          envFilePath: this.envFilePath,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: 'Failed to load integration settings', message: err.message });
      }
    });

    this.app.put('/api/settings/integrations', auth, adminOnly, async (req, res) => {
      try {
        const payload = req.body || {};
        const updates = {};

        if (Object.prototype.hasOwnProperty.call(payload, 'githubToken')) {
          if (typeof payload.githubToken !== 'string') {
            return res.status(400).json({ error: 'githubToken must be a string' });
          }
          updates.GITHUB_TOKEN = payload.githubToken.trim();
        }

        if (Object.prototype.hasOwnProperty.call(payload, 'jwtSecret')) {
          if (typeof payload.jwtSecret !== 'string') {
            return res.status(400).json({ error: 'jwtSecret must be a string' });
          }
          const trimmedSecret = payload.jwtSecret.trim();
          if (trimmedSecret.length > 0 && trimmedSecret.length < 16) {
            return res.status(400).json({ error: 'jwtSecret must be at least 16 characters' });
          }
          if (trimmedSecret.length > 0) {
            updates.JWT_SECRET = trimmedSecret;
          }
        }

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: 'No valid settings provided' });
        }

        await this.persistEnvValues(updates);

        if (Object.prototype.hasOwnProperty.call(updates, 'GITHUB_TOKEN')) {
          if (updates.GITHUB_TOKEN) {
            process.env.GITHUB_TOKEN = updates.GITHUB_TOKEN;
          } else {
            delete process.env.GITHUB_TOKEN;
          }
        }

        let jwtSecretRotated = false;
        if (Object.prototype.hasOwnProperty.call(updates, 'JWT_SECRET')) {
          process.env.JWT_SECRET = updates.JWT_SECRET;
          this.jwtSecret = updates.JWT_SECRET;
          jwtSecretRotated = true;
        }

        res.json({
          ok: true,
          updated: Object.keys(updates),
          jwtSecretRotated,
          github: {
            configured: Boolean(process.env.GITHUB_TOKEN),
            masked: this.maskSecret(process.env.GITHUB_TOKEN || '')
          },
          jwt: {
            configured: Boolean(process.env.JWT_SECRET || this.jwtSecret),
            masked: this.maskSecret(process.env.JWT_SECRET || this.jwtSecret || '')
          },
          message: jwtSecretRotated
            ? 'Settings saved. JWT secret was rotated; users may need to sign in again.'
            : 'Settings saved.'
        });
      } catch (err) {
        res.status(500).json({ error: 'Failed to save integration settings', message: err.message });
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
   * Sets up org chart routes
   */
  setupOrgChartRoutes() {
    const auth = this.authMiddleware.bind(this);

    // Get org chart tree
    this.app.get('/api/orgchart/tree', auth, async (req, res) => {
      try {
        const { rootId, depth, includeInactive } = req.query;
        const agents = this._getCvAgents();
        const depthValue = Number.parseInt(depth, 10);
        const maxDepth = Number.isFinite(depthValue) ? depthValue : 5;

        if (agents.length === 0) {
          return res.json({
            tree: null,
            meta: {
              rootId: rootId || null,
              depth: maxDepth,
              totalNodes: 0,
              empty: true
            }
          });
        }

        const tree = this._buildOrgTree(agents, rootId, maxDepth, includeInactive === 'true');
        res.json({ 
          tree, 
          meta: { 
            rootId: rootId || null,
            depth: maxDepth,
            totalNodes: this._countTreeNodes(tree)
          } 
        });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch org chart', message: err.message });
      }
    });

    // Get agent's children
    this.app.get('/api/orgchart/agents/:id/children', auth, async (req, res) => {
      try {
        const agents = this._getCvAgents();
        const children = agents.filter((agent) => agent.reportsTo === req.params.id);
        res.json({ agentId: req.params.id, children, count: children.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch children', message: err.message });
      }
    });

    // Get management chain
    this.app.get('/api/orgchart/agents/:id/managers', auth, async (req, res) => {
      try {
        const agents = this._getCvAgents();
        const byId = new Map(agents.map((agent) => [agent.id, agent]));
        const chain = [];
        const visited = new Set();
        let current = byId.get(req.params.id);

        while (current?.reportsTo && !visited.has(current.reportsTo)) {
          visited.add(current.reportsTo);
          const manager = byId.get(current.reportsTo);
          if (!manager) break;
          chain.push(manager);
          current = manager;
        }

        res.json({ agentId: req.params.id, chain, levels: chain.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch management chain', message: err.message });
      }
    });

    // Get agent org stats
    this.app.get('/api/orgchart/agents/:id/stats', auth, async (req, res) => {
      try {
        const agents = this._getCvAgents();
        const byId = new Map(agents.map((agent) => [agent.id, agent]));
        const root = byId.get(req.params.id);
        if (!root) {
          return res.status(404).json({ error: 'Agent not found' });
        }

        const directReports = agents.filter((agent) => agent.reportsTo === root.id);
        const descendants = [];
        const queue = [...directReports];
        while (queue.length > 0) {
          const current = queue.shift();
          descendants.push(current);
          const next = agents.filter((agent) => agent.reportsTo === current.id);
          queue.push(...next);
        }

        const byStatus = {};
        const byProvider = {};
        descendants.forEach((agent) => {
          const status = String(agent.status || 'unknown').toLowerCase();
          const provider = String(agent.provider || 'unknown').toLowerCase();
          byStatus[status] = (byStatus[status] || 0) + 1;
          byProvider[provider] = (byProvider[provider] || 0) + 1;
        });

        let maxDepth = 0;
        const walkDepth = (id, depth) => {
          maxDepth = Math.max(maxDepth, depth);
          const children = agents.filter((agent) => agent.reportsTo === id);
          children.forEach((child) => walkDepth(child.id, depth + 1));
        };
        walkDepth(root.id, 0);

        res.json({
          agentId: req.params.id,
          stats: {
            totalReports: descendants.length,
            directReports: directReports.length,
            maxDepth,
            byStatus,
            byProvider
          }
        });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats', message: err.message });
      }
    });

    // Update reporting structure
    this.app.put('/api/orgchart/reporting', auth, async (req, res) => {
      try {
        const { agentId, reportsTo } = req.body;

        if (!agentId) {
          return res.status(400).json({ error: 'agentId is required' });
        }

        if (this.cvSystem?.registry) {
          const cv = this.cvSystem.registry.get(agentId);
          if (!cv) {
            return res.status(404).json({ error: 'Agent CV not found' });
          }
          const updated = { ...cv, reportsTo: reportsTo || null };
          this.cvSystem.registry.update(agentId, updated);
        }

        // Broadcast update via WebSocket
        if (this.wsServer) {
          this.wsServer.broadcastToRoom('orgchart', {
            type: 'orgchart:reporting:changed',
            data: { agentId, reportsTo },
            timestamp: new Date().toISOString(),
          });
        }

        res.json({ agentId, reportsTo, updated: true });
      } catch (err) {
        res.status(500).json({ error: 'Failed to update reporting', message: err.message });
      }
    });

    // Search org chart
    this.app.get('/api/orgchart/search', auth, async (req, res) => {
      try {
        const { q } = req.query;
        if (!q || q.length < 2) {
          return res.status(400).json({ error: 'Query must be at least 2 characters' });
        }
        
        // Search in CV system
        const results = [];
        const lowerQ = q.toLowerCase();
        for (const cv of this._getCvAgents()) {
          if ((cv.name && cv.name.toLowerCase().includes(lowerQ)) ||
              (cv.role && cv.role.toLowerCase().includes(lowerQ))) {
            results.push({
              id: cv.id,
              name: cv.name || cv.id,
              role: cv.role,
              status: cv.status,
              reportsTo: cv.reportsTo
            });
          }
        }
        
        res.json({ query: q, results, total: results.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to search org chart', message: err.message });
      }
    });
  }

  /**
   * Build org tree from agents list
   */
  _buildOrgTree(agents, rootId, maxDepth, includeInactive) {
    const agentMap = new Map();
    
    for (const agent of agents) {
      const status = String(agent.status || '').toLowerCase();
      if (!includeInactive && ['inactive', 'suspended', 'retired', 'deleted'].includes(status)) continue;
      agentMap.set(agent.id, { ...agent, children: [] });
    }

    // Build parent-child relationships
    let rootNodes = [];
    for (const [id, agent] of agentMap) {
      if (rootId && id === rootId) {
        rootNodes.push(agent);
      } else if (!agent.reportsTo || !agentMap.has(agent.reportsTo)) {
        rootNodes.push(agent);
      } else {
        const parent = agentMap.get(agent.reportsTo);
        if (parent) parent.children.push(agent);
      }
    }

    // If specific root requested, use it
    if (rootId && agentMap.has(rootId)) {
      rootNodes = [agentMap.get(rootId)];
    }

    // Sort children by name
    const sortChildren = (node, depth) => {
      if (depth >= maxDepth) {
        node.children = [];
        return;
      }
      node.children.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      for (const child of node.children) {
        sortChildren(child, depth + 1);
      }
    };

    for (const root of rootNodes) {
      sortChildren(root, 0);
    }

    // Wrap multiple roots
    if (rootNodes.length > 1) {
      return {
        id: 'root',
        name: 'Organization',
        role: 'Root',
        status: 'online',
        isVirtual: true,
        children: rootNodes,
      };
    }

    return rootNodes[0] || null;
  }

  _countTreeNodes(node) {
    if (!node) return 0;
    let count = 1;
    for (const child of (node.children || [])) {
      count += this._countTreeNodes(child);
    }
    return count;
  }

  sanitizeAgentId(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
      .slice(0, 64);
  }

  normalizeProviderId(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['claude', 'codex', 'kimi', 'auto'].includes(normalized)) {
      return normalized;
    }
    return 'auto';
  }

  normalizeSurfaceId(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['vscode', 'vs code', 'vs-code'].includes(normalized)) return 'vscode';
    if (['cli', 'terminal', 'shell'].includes(normalized)) return 'cli';
    if (['app', 'desktop'].includes(normalized)) return normalized === 'desktop' ? 'desktop' : 'app';
    return '';
  }

  formatProviderModeLabel(mode = '') {
    const normalized = this.normalizeSurfaceId(mode) || String(mode || '').toLowerCase();
    if (normalized === 'vscode') return 'VS Code';
    if (normalized === 'cli') return 'CLI';
    if (normalized === 'app') return 'App';
    if (normalized === 'desktop') return 'Desktop';
    return normalized;
  }

  extractTaggedValue(tags, prefix) {
    const entry = (tags || []).find((tag) => typeof tag === 'string' && tag.startsWith(`${prefix}:`));
    if (!entry) return '';
    return entry.slice(prefix.length + 1).trim();
  }

  mapLifecycleToAgentStatus(lifecycleStatus = '') {
    const status = String(lifecycleStatus || '').toLowerCase();
    if (['active', 'idle', 'running'].includes(status)) return 'online';
    if (['suspended', 'paused'].includes(status)) return 'paused';
    if (['draft', 'deprecated', 'inactive', 'offline', 'stopped'].includes(status)) return 'offline';
    return status || 'offline';
  }

  notifyAgentUpdate(type, data) {
    if (!this.wsServer || !data) return;
    this.wsServer.broadcastToRoom('agents', {
      type,
      data,
      timestamp: new Date().toISOString()
    });
  }

  extractCapabilities(cv) {
    if (Array.isArray(cv?.capabilities)) {
      return cv.capabilities.map((entry) =>
        typeof entry === 'string' ? entry : (entry?.name || 'capability')
      );
    }

    const languages = Array.isArray(cv?.capabilities?.languages) ? cv.capabilities.languages : [];
    const domains = Array.isArray(cv?.capabilities?.domains) ? cv.capabilities.domains : [];
    const tools = Array.isArray(cv?.capabilities?.tools) ? cv.capabilities.tools : [];
    return Array.from(new Set([...languages, ...domains, ...tools])).filter(Boolean);
  }

  normalizeCvAgent(cv) {
    if (!cv) return null;

    const id = cv.id || cv.identity?.id;
    if (!id) return null;

    const tags = Array.isArray(cv.metadata?.tags) ? cv.metadata.tags : [];
    const taggedProvider = this.extractTaggedValue(tags, 'provider');
    const taggedModel = this.extractTaggedValue(tags, 'model');
    const taggedSurface = this.extractTaggedValue(tags, 'surface');

    const provider = this.normalizeProviderId(
      taggedProvider
      || cv.runtime?.provider
      || cv.provider
      || (cv.execution?.preferred_client && cv.execution.preferred_client !== 'auto'
        ? cv.execution.preferred_client
        : 'auto')
    );
    const model = taggedModel || cv.runtime?.model || cv.model || null;
    const surface = this.normalizeSurfaceId(taggedSurface || cv.runtime?.surface || cv.surface || 'cli') || 'cli';
    const lifecycleStatus = String(cv.lifecycle?.status || cv.status || 'draft').toLowerCase();

    return {
      id,
      name: cv.identity?.name || cv.name || id,
      role: cv.identity?.role || cv.role || cv.specialization?.primary || 'Agent',
      department: cv.department || cv.identity?.department || null,
      status: this.mapLifecycleToAgentStatus(lifecycleStatus),
      lifecycleStatus,
      provider: provider === 'auto' ? 'unknown' : provider,
      model,
      surface,
      capabilities: this.extractCapabilities(cv),
      reportsTo: cv.reportsTo || cv.relationships?.reportsTo || null,
      createdAt: cv.lifecycle?.created_at || null,
      updatedAt: cv.lifecycle?.updated_at || null,
      source: 'cv'
    };
  }

  async detectProviderSurfaceStatus() {
    const claudeCliAvailable = this.isCommandAvailable('claude');
    const codexCliAvailable = this.isCommandAvailable('codex');
    const kimiCliAvailable = this.isCommandAvailable('kimi');

    const [
      claudeDesktopAvailable,
      claudeVsCodeAvailable,
      codexAppAvailable,
      codexVsCodeHttpAvailable,
      codexVsCodeSocketAvailable,
      kimiVsCodeAvailable
    ] = await Promise.all([
      this.isTcpEndpointReachable(3456),
      this.isNamedSocketReachable(this.getClaudeVsCodeSocketPath()),
      this.isTcpEndpointReachable(3457),
      this.isTcpEndpointReachable(8443),
      this.isTcpEndpointReachable(8444),
      this.isTcpEndpointReachable(18123)
    ]);

    return {
      claude: {
        cli: claudeCliAvailable,
        vscode: claudeVsCodeAvailable,
        desktop: claudeDesktopAvailable
      },
      codex: {
        cli: codexCliAvailable,
        vscode: codexVsCodeHttpAvailable && codexVsCodeSocketAvailable,
        app: codexAppAvailable
      },
      kimi: {
        cli: kimiCliAvailable,
        vscode: kimiVsCodeAvailable
      }
    };
  }

  isCommandAvailable(command) {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(checker, [command], { stdio: 'ignore' });
    return result.status === 0;
  }

  isTcpEndpointReachable(port, host = '127.0.0.1', timeoutMs = 750) {
    return new Promise((resolve) => {
      let settled = false;
      const socket = net.connect({ host, port });

      const finish = (result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.setTimeout(timeoutMs, () => finish(false));
    });
  }

  isNamedSocketReachable(socketPath, timeoutMs = 750) {
    if (!socketPath) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let settled = false;
      const socket = net.connect(socketPath);

      const finish = (result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.setTimeout(timeoutMs, () => finish(false));
    });
  }

  getClaudeVsCodeSocketPath() {
    if (process.platform === 'win32') {
      return '\\\\.\\pipe\\claude-vscode-sonnet46';
    }

    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (!home) {
      return '';
    }

    if (process.platform === 'darwin') {
      return path.join(home, 'Library', 'Application Support', 'Claude', 'vscode-sonnet46.sock');
    }

    return path.join(home, '.config', 'claude', 'vscode-sonnet46.sock');
  }

  getProviderSurfaceLaunchSpec(provider, surface, options = {}) {
    const workspace = typeof options.workspace === 'string' && options.workspace.trim()
      ? options.workspace.trim()
      : process.cwd();

    if (surface === 'vscode') {
      if (!this.isCommandAvailable('code')) {
        return null;
      }
      return {
        file: 'code',
        args: [workspace],
        cwd: workspace,
        shell: process.platform === 'win32',
        detached: true,
        display: `code \"${workspace}\"`
      };
    }

    if (provider === 'codex' && surface === 'app') {
      if (!this.isCommandAvailable('codex')) {
        return null;
      }
      return {
        file: 'codex',
        args: ['app-server', '--listen', 'ws://127.0.0.1:3457', '--session-source', 'app'],
        cwd: workspace,
        shell: process.platform === 'win32',
        detached: true,
        display: 'codex app-server --listen ws://127.0.0.1:3457 --session-source app'
      };
    }

    return null;
  }

  launchProviderSurface(launchSpec) {
    const child = spawn(launchSpec.file, launchSpec.args || [], {
      cwd: launchSpec.cwd || process.cwd(),
      shell: Boolean(launchSpec.shell),
      detached: launchSpec.detached !== false,
      stdio: 'ignore',
      env: { ...process.env, ...(launchSpec.env || {}) }
    });

    if (launchSpec.detached !== false) {
      child.unref();
    }

    return {
      pid: child.pid || null
    };
  }

  _getCvAgents() {
    if (!this.cvSystem?.registry?.list) {
      return [];
    }

    const listed = this.cvSystem.registry.list();
    let cvs = [];
    if (Array.isArray(listed)) {
      cvs = listed;
    } else if (Array.isArray(listed?.cvs)) {
      cvs = listed.cvs;
    } else if (Array.isArray(listed?.items)) {
      cvs = listed.items;
    } else if (listed && typeof listed.values === 'function') {
      cvs = [...listed.values()];
    }

    return cvs.map((cv) => this.normalizeCvAgent(cv)).filter(Boolean);
  }

  _toQueryString(query = {}) {
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) {
        value.forEach((entry) => params.append(key, String(entry)));
      } else {
        params.set(key, String(value));
      }
    });
    const serialized = params.toString();
    return serialized ? `?${serialized}` : '';
  }

  async fetchCoreApi(req, backendPath, options = {}) {
    const target = new URL(backendPath, this.apiBaseUrl);
    const headers = { ...(options.headers || {}) };

    if (req?.headers?.authorization) {
      headers.authorization = req.headers.authorization;
    }

    const response = await fetch(target, {
      method: options.method || req?.method || 'GET',
      headers,
      body: options.body
    });

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();
    const payload = contentType.includes('application/json')
      ? (bodyText ? JSON.parse(bodyText) : null)
      : bodyText;

    if (!response.ok) {
      const message = payload?.error || payload?.message || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    return payload;
  }

  normalizeActivity(item = {}) {
    const metadata = item.metadata_json || item.metadata || {};
    const title = item.title
      || item.summary
      || item.message
      || item.description
      || `${item.category_name || item.category_id || 'activity'} event`;

    const description = item.description
      || item.detail
      || item.message
      || metadata?.detail
      || '';

    const timestamp = item.occurred_at
      || item.created_at
      || item.timestamp
      || new Date().toISOString();

    return {
      id: item.uuid || item.id || `${item.category_id || 'activity'}-${timestamp}`,
      type: String(item.category_id || item.category_name || item.entity_type || 'system').toLowerCase(),
      action: String(item.action || item.event_type || item.severity || 'updated').toLowerCase(),
      title: String(title),
      description: String(description),
      timestamp,
      actor: item.actor_id || item.actor_name || item.actor_type || 'system',
      metadata
    };
  }

  async getAggregatedAgents(req) {
    let coreAgents = [];
    try {
      const corePayload = await this.fetchCoreApi(req, '/api/agents');
      coreAgents = Array.isArray(corePayload?.agents) ? corePayload.agents : [];
    } catch (error) {
      console.warn('Core agent feed unavailable, serving CV-backed agents only:', error.message);
    }

    const cvAgents = this._getCvAgents();

    const byId = new Map();

    for (const agent of coreAgents) {
      const normalized = {
        id: agent.id,
        name: agent.name || agent.id,
        status: String(agent.status || agent.state || (agent.healthy ? 'online' : 'offline')).toLowerCase(),
        provider: agent.provider || agent.type || 'system',
        model: agent.model || null,
        surface: agent.surface || null,
        capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
        tasksCompleted: Number(agent.tasksCompleted || 0),
        successRate: Number(agent.successRate || 0),
        lastActive: agent.lastActive || agent.timestamp || null,
        source: 'core',
        healthy: Boolean(agent.healthy)
      };
      byId.set(normalized.id, normalized);
    }

    for (const cv of cvAgents) {
      const existing = byId.get(cv.id);
      const normalized = {
        id: cv.id,
        name: cv.name || cv.id,
        status: String(cv.status || 'online').toLowerCase(),
        lifecycleStatus: String(cv.lifecycleStatus || '').toLowerCase(),
        provider: cv.provider || 'unknown',
        model: cv.model || null,
        surface: cv.surface || existing?.surface || 'cli',
        capabilities: Array.isArray(cv.capabilities) ? cv.capabilities : [],
        tasksCompleted: existing?.tasksCompleted ?? 0,
        successRate: existing?.successRate ?? 0,
        lastActive: existing?.lastActive || null,
        reportsTo: cv.reportsTo || null,
        source: existing ? `${existing.source}+cv` : 'cv',
        healthy: existing?.healthy ?? ['active', 'online', 'busy', 'running'].includes(String(cv.status || '').toLowerCase())
      };
      byId.set(cv.id, { ...(existing || {}), ...normalized });
    }

    return [...byId.values()];
  }

  maskSecret(value = '') {
    const text = String(value || '');
    if (!text) return '';
    if (text.length <= 8) return '*'.repeat(text.length);
    return `${text.slice(0, 4)}${'*'.repeat(Math.max(text.length - 8, 6))}${text.slice(-4)}`;
  }

  serializeEnvValue(value) {
    const text = String(value);
    if (/^[A-Za-z0-9_@%+=:,./\-]+$/.test(text)) {
      return text;
    }
    return JSON.stringify(text);
  }

  async persistEnvValues(updates = {}) {
    let current = '';
    try {
      current = await fs.readFile(this.envFilePath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    const lines = current ? current.split(/\r?\n/) : [];
    const touched = new Set();

    const nextLines = lines.map((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (!match) return line;
      const key = match[1];
      if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
      touched.add(key);
      const value = updates[key];
      if (value === '' || value === null || value === undefined) {
        return null;
      }
      return `${key}=${this.serializeEnvValue(value)}`;
    }).filter((line) => line !== null);

    Object.entries(updates).forEach(([key, value]) => {
      if (touched.has(key)) return;
      if (value === '' || value === null || value === undefined) return;
      nextLines.push(`${key}=${this.serializeEnvValue(value)}`);
    });

    const nextContent = nextLines.join('\n').replace(/\n{3,}/g, '\n\n');
    await fs.writeFile(this.envFilePath, nextContent ? `${nextContent}\n` : '', 'utf8');
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
      const body = req.body && Object.keys(req.body).length > 0
        ? JSON.stringify(req.body)
        : undefined;

      const response = await fetch(target, {
        method: req.method,
        headers,
        body,
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
   * Sets up CEO Chat routes
   */
  setupChatRoutes() {
    const auth = this.authMiddleware.bind(this);
    
    // Thread routes
    this.app.get('/api/chat/threads', auth, async (req, res) => {
      try {
        const result = await this.chatController.listThreads(req.query);
        res.status(result.success ? 200 : 500).json(result);
      } catch (err) {
        console.error('Error listing chat threads:', err);
        res.status(500).json({ error: 'Failed to list chat threads', message: err.message });
      }
    });
    
    this.app.post('/api/chat/threads', auth, async (req, res) => {
      try {
        const result = await this.chatController.createThread(req.body);
        res.status(result.success ? 201 : 400).json(result);
      } catch (err) {
        console.error('Error creating chat thread:', err);
        res.status(500).json({ error: 'Failed to create chat thread', message: err.message });
      }
    });
    
    this.app.get('/api/chat/threads/:id', auth, async (req, res) => {
      try {
        const result = await this.chatController.getThread(req.params.id);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error getting chat thread:', err);
        res.status(500).json({ error: 'Failed to get chat thread', message: err.message });
      }
    });
    
    this.app.put('/api/chat/threads/:id', auth, async (req, res) => {
      try {
        const result = await this.chatController.updateThread(req.params.id, req.body);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error updating chat thread:', err);
        res.status(500).json({ error: 'Failed to update chat thread', message: err.message });
      }
    });
    
    this.app.delete('/api/chat/threads/:id', auth, async (req, res) => {
      try {
        const result = await this.chatController.deleteThread(req.params.id);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error deleting chat thread:', err);
        res.status(500).json({ error: 'Failed to delete chat thread', message: err.message });
      }
    });
    
    // Thread actions
    this.app.post('/api/chat/threads/:id/resolve', auth, async (req, res) => {
      try {
        const result = await this.chatController.resolveThread(req.params.id, req.body);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error resolving chat thread:', err);
        res.status(500).json({ error: 'Failed to resolve chat thread', message: err.message });
      }
    });
    
    this.app.post('/api/chat/threads/:id/close', auth, async (req, res) => {
      try {
        const result = await this.chatController.closeThread(req.params.id);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error closing chat thread:', err);
        res.status(500).json({ error: 'Failed to close chat thread', message: err.message });
      }
    });
    
    // Message routes
    this.app.get('/api/chat/threads/:id/messages', auth, async (req, res) => {
      try {
        const result = await this.chatController.getMessages(req.params.id, req.query);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error getting chat messages:', err);
        res.status(500).json({ error: 'Failed to get chat messages', message: err.message });
      }
    });
    
    this.app.post('/api/chat/threads/:id/messages', auth, async (req, res) => {
      try {
        const result = await this.chatController.addMessage(req.params.id, req.body);
        res.status(result.success ? 201 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
        
        // Broadcast via WebSocket if successful
        if (result.success && this.wsServer) {
          this.wsServer.broadcast({
            type: 'chat.messageCreated',
            data: { message: result.data, threadId: req.params.id },
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Error adding chat message:', err);
        res.status(500).json({ error: 'Failed to add chat message', message: err.message });
      }
    });
    
    this.app.get('/api/chat/threads/:id/messages/threaded', auth, async (req, res) => {
      try {
        const result = await this.chatController.getThreadedMessages(req.params.id);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error getting threaded messages:', err);
        res.status(500).json({ error: 'Failed to get threaded messages', message: err.message });
      }
    });
    
    // Message management
    this.app.put('/api/chat/messages/:id', auth, async (req, res) => {
      try {
        const result = await this.chatController.updateMessage(req.body.threadId, req.params.id, req.body);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error updating chat message:', err);
        res.status(500).json({ error: 'Failed to update chat message', message: err.message });
      }
    });
    
    this.app.delete('/api/chat/messages/:id', auth, async (req, res) => {
      try {
        const result = await this.chatController.deleteMessage(req.body.threadId || req.query.threadId, req.params.id, req.body.deletedBy);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error deleting chat message:', err);
        res.status(500).json({ error: 'Failed to delete chat message', message: err.message });
      }
    });
    
    // Read state
    this.app.post('/api/chat/threads/:id/read', auth, async (req, res) => {
      try {
        const result = await this.chatController.markAsRead(req.params.id, req.body);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error marking thread as read:', err);
        res.status(500).json({ error: 'Failed to mark thread as read', message: err.message });
      }
    });
    
    this.app.get('/api/chat/unread', auth, async (req, res) => {
      try {
        const result = await this.chatController.getUnreadCount(req.query.userId, req.query.companyId);
        res.status(result.success ? 200 : 500).json(result);
      } catch (err) {
        console.error('Error getting unread count:', err);
        res.status(500).json({ error: 'Failed to get unread count', message: err.message });
      }
    });
    
    // Reactions
    this.app.post('/api/chat/messages/:id/reactions', auth, async (req, res) => {
      try {
        const result = await this.chatController.addReaction(req.body.threadId, req.params.id, req.body);
        res.status(result.success ? 201 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error adding reaction:', err);
        res.status(500).json({ error: 'Failed to add reaction', message: err.message });
      }
    });
    
    this.app.delete('/api/chat/messages/:id/reactions', auth, async (req, res) => {
      try {
        const result = await this.chatController.removeReaction(req.body.threadId, req.params.id, req.body);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error removing reaction:', err);
        res.status(500).json({ error: 'Failed to remove reaction', message: err.message });
      }
    });
    
    // CEO Agent
    this.app.post('/api/chat/threads/:id/ceo-response', auth, async (req, res) => {
      try {
        const result = await this.chatController.requestCeoResponse(req.params.id);
        res.status(result.success ? 200 : (result.code === 'NOT_FOUND' ? 404 : 500)).json(result);
      } catch (err) {
        console.error('Error requesting CEO response:', err);
        res.status(500).json({ error: 'Failed to request CEO response', message: err.message });
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

    // Stop agent pool to prevent hanging timers
    if (this.agentPool) {
      try {
        await this.agentPool.shutdown();
      } catch (err) {
        console.error('Error shutting down agent pool:', err);
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
