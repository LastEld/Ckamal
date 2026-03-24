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
    this.analytics = options.analytics || null;
    
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
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
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
      max: 100, // Limit each IP to 100 requests per windowMs
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
        
        // Get analytics from Analytics if available
        let costStats = null;
        if (this.analytics?._initialized) {
          try {
            costStats = await this.analytics.getCostStats();
          } catch (e) {
            // Analytics might not be fully initialized
          }
        }
        
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
          costStats,
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
