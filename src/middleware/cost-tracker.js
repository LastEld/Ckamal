/**
 * @fileoverview Cost Tracking Middleware for CogniMesh v5.0
 * Intercepts requests to track costs, enforce budgets, and add cost headers to responses.
 * @module middleware/cost-tracker
 */

import { CostService } from '../domains/billing/cost-service.js';
import { BudgetService } from '../domains/billing/budget-service.js';

/**
 * Cost tracker middleware configuration
 * @typedef {Object} CostTrackerConfig
 * @property {Object} db - Database connection
 * @property {Object} [repositories] - Repository factory
 * @property {boolean} [enforceBudgets=true] - Whether to enforce budgets
 * @property {boolean} [trackCosts=true] - Whether to track costs
 * @property {boolean} [addHeaders=true] - Whether to add cost headers to responses
 * @property {Function} [getAttribution] - Function to extract attribution from request
 * @property {Function} [onBudgetExceeded] - Callback when budget exceeded
 * @property {Function} [onCostRecorded] - Callback when cost is recorded
 */

/**
 * Default attribution extractor
 * @param {Object} req - Request object
 * @returns {Object} Attribution data
 */
function defaultGetAttribution(req) {
  return {
    company_id: req.user?.company_id || req.headers?.['x-company-id'] || null,
    user_id: req.user?.id || req.headers?.['x-user-id'] || null,
    agent_id: req.headers?.['x-agent-id'] || null,
    session_id: req.headers?.['x-session-id'] || null
  };
}

/**
 * Cost tracker middleware factory
 * @param {CostTrackerConfig} config - Middleware configuration
 * @returns {Function} Express middleware
 */
export function createCostTracker(config) {
  const {
    db,
    repositories,
    enforceBudgets = true,
    trackCosts = true,
    addHeaders = true,
    getAttribution = defaultGetAttribution,
    onBudgetExceeded,
    onCostRecorded
  } = config;

  // Initialize services
  const costService = new CostService({ repositories, db });
  const budgetService = new BudgetService({ repositories, db, costService });

  return async function costTrackerMiddleware(req, res, next) {
    // Store start time for latency tracking
    req.startTime = Date.now();
    
    // Skip if cost tracking is disabled
    if (!trackCosts) {
      return next();
    }

    // Extract attribution
    const attribution = getAttribution(req);
    
    // Store in request for later use
    req.costAttribution = attribution;
    req.costService = costService;
    req.budgetService = budgetService;

    // Generate request ID for cost tracking
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    req.costRequestId = requestId;

    // Add cost info to request for access by controllers
    req.costInfo = {
      requestId,
      attribution,
      startTime: req.startTime
    };

    // Check budget before proceeding (if enforcement enabled)
    if (enforceBudgets && db) {
      try {
        const operation = {
          estimatedCost: req.body?.estimatedCost || 0,
          provider: req.body?.provider || req.body?.model?.split('-')[0],
          model: req.body?.model,
          scope_type: attribution.company_id ? 'company' : 'global',
          scope_id: attribution.company_id
        };

        const budgetCheck = await budgetService.checkBudget(operation);

        if (!budgetCheck.allowed) {
          // Budget exceeded - block request
          if (addHeaders) {
            res.setHeader('X-Budget-Exceeded', 'true');
            res.setHeader('X-Budget-Reason', budgetCheck.reason);
            res.setHeader('X-Budget-Remaining', budgetCheck.estimatedRemaining || 0);
          }
          
          if (onBudgetExceeded) {
            await onBudgetExceeded(budgetCheck, req);
          }

          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'BudgetExceeded',
            message: budgetCheck.reason,
            budget_uuid: budgetCheck.budgetUuid,
            estimated_remaining: budgetCheck.estimatedRemaining,
            status: budgetCheck.status
          }, null, 2));
          return;
        }

        // Add warning headers for soft budget limits
        if (addHeaders && budgetCheck.warnings?.length > 0) {
          res.setHeader('X-Budget-Warning', budgetCheck.warnings.map(w => w.message).join('; '));
        }

        // Store remaining budget info
        req.budgetInfo = {
          estimatedRemaining: budgetCheck.estimatedRemaining,
          warnings: budgetCheck.warnings
        };
      } catch (err) {
        // Log error but don't block request on budget check failure
        console.error('[CostTracker] Budget check error:', err);
      }
    }

    // Store original end function
    const originalEnd = res.end.bind(res);
    const originalWriteHead = res.writeHead.bind(res);
    let headersSet = false;
    let statusCode = 200;

    // Intercept writeHead to capture status code
    res.writeHead = function(code, headers) {
      statusCode = code;
      headersSet = true;
      return originalWriteHead(code, headers);
    };

    // Override res.end to capture response and track cost
    res.end = function(data, encoding) {
      // Restore original end to prevent recursion
      res.end = originalEnd;
      res.writeHead = originalWriteHead;

      // Track cost asynchronously (don't block response)
      if (trackCosts && db) {
        trackRequestCost(req, res, data, costService, attribution, requestId, onCostRecorded, addHeaders, statusCode);
      }

      return originalEnd(data, encoding);
    };

    next();
  };
}

/**
 * Track cost for a completed request
 * @private
 */
async function trackRequestCost(req, res, data, costService, attribution, requestId, onCostRecorded, addHeaders, statusCode) {
  try {
    // Extract token usage from response data if available
    let parsedData = null;
    if (data && typeof data === 'string') {
      try {
        parsedData = JSON.parse(data);
      } catch (e) {
        // Not JSON data, ignore
      }
    } else if (data && typeof data === 'object') {
      parsedData = data;
    }

    // Extract token usage
    const tokens = extractTokenUsage(parsedData, req.body);
    
    // Extract model info
    const { provider, model, billing_model } = extractModelInfo(parsedData, req.body);

    if (!provider || !model) {
      // Can't track without model info, but still add headers if enabled
      if (addHeaders) {
        res.setHeader('X-Cost-Tracked', 'false');
        res.setHeader('X-Cost-Reason', 'Missing provider/model info');
      }
      return;
    }

    // Calculate latency
    const latency_ms = Date.now() - (req.startTime || Date.now());

    // Build cost event data
    const costData = {
      tokens,
      provider,
      model,
      billing_model: billing_model || 'subscription',
      attribution,
      context: {
        request_id: requestId,
        conversation_id: req.body?.conversation_id || null,
        task_id: req.body?.task_id || null
      },
      routing: {
        strategy: parsedData?.routing?.strategy || req.body?.routing_strategy || null,
        estimated_cost: req.body?.estimatedCost || null
      },
      operation_type: req.body?.operation_type || inferOperationType(req.url),
      metadata: {
        path: req.url,
        method: req.method,
        status_code: statusCode || res.statusCode,
        latency_ms,
        cached: parsedData?.cached || false,
        source: 'api_request'
      }
    };

    const event = await costService.recordCost(costData);

    // Add cost headers to response
    if (addHeaders) {
      res.setHeader('X-Cost-Total', event.total_cost.toFixed(6));
      res.setHeader('X-Cost-Tokens-Input', event.input_tokens);
      res.setHeader('X-Cost-Tokens-Output', event.output_tokens);
      res.setHeader('X-Cost-Tokens-Total', event.total_tokens);
      res.setHeader('X-Cost-Request-Id', event.request_id);
      res.setHeader('X-Cost-Tracked', 'true');
      res.setHeader('X-Cost-Currency', 'USD');
      
      // Add latency header
      res.setHeader('X-Request-Latency-Ms', latency_ms);
    }

    if (onCostRecorded) {
      await onCostRecorded(event, req);
    }
  } catch (err) {
    console.error('[CostTracker] Cost tracking error:', err);
    if (addHeaders) {
      res.setHeader('X-Cost-Tracked', 'error');
      res.setHeader('X-Cost-Error', err.message);
    }
  }
}

/**
 * Extract token usage from response or request
 * @private
 */
function extractTokenUsage(data, requestBody) {
  // Try to extract from response
  if (data?.usage) {
    return {
      input: data.usage.input_tokens || data.usage.prompt_tokens || 0,
      output: data.usage.output_tokens || data.usage.completion_tokens || 0
    };
  }

  if (data?.tokens) {
    return {
      input: data.tokens.input || 0,
      output: data.tokens.output || 0
    };
  }

  // Try to extract from body string if present
  if (data?.body && typeof data.body === 'string') {
    try {
      const bodyData = JSON.parse(data.body);
      if (bodyData.usage) {
        return {
          input: bodyData.usage.input_tokens || bodyData.usage.prompt_tokens || 0,
          output: bodyData.usage.output_tokens || bodyData.usage.completion_tokens || 0
        };
      }
    } catch (e) {
      // Ignore parse error
    }
  }

  // Fallback to request estimate
  if (requestBody?.estimatedTokens) {
    return {
      input: requestBody.estimatedTokens,
      output: Math.floor(requestBody.estimatedTokens * 0.5) // Rough estimate
    };
  }

  // Default empty
  return { input: 0, output: 0 };
}

/**
 * Extract model info from response or request
 * @private
 */
function extractModelInfo(data, requestBody) {
  // Try response first
  let model = data?.model || data?.model_id;
  let provider = data?.provider;
  let billing_model = data?.billing_model;

  // Fallback to request
  if (!model) {
    model = requestBody?.model || requestBody?.preferredModel;
  }

  if (!provider && model) {
    // Infer provider from model name
    if (model.includes('claude')) {
      provider = 'claude';
    } else if (model.includes('gpt') || model.includes('codex')) {
      provider = 'codex';
    } else if (model.includes('kimi')) {
      provider = 'kimi';
    }
  }

  if (!billing_model) {
    billing_model = requestBody?.billing_model || 'subscription';
  }

  return { provider, model, billing_model };
}

/**
 * Infer operation type from URL path
 * @private
 */
function inferOperationType(url) {
  if (!url) return 'api_request';
  
  const path = url.toLowerCase();
  
  if (path.includes('completion') || path.includes('chat')) {
    return 'completion';
  }
  if (path.includes('embedding')) {
    return 'embedding';
  }
  if (path.includes('image') || path.includes('vision')) {
    return 'image_generation';
  }
  if (path.includes('stream')) {
    return 'streaming';
  }
  if (path.includes('tool')) {
    return 'tool_execution';
  }
  if (path.includes('batch')) {
    return 'batch';
  }
  
  return 'api_request';
}

/**
 * Budget enforcement middleware (standalone)
 * Use this when you only need budget enforcement without full cost tracking
 * @param {Object} config - Configuration
 * @param {Object} config.db - Database connection
 * @param {Object} [config.repositories] - Repository factory
 * @param {Function} [config.getAttribution] - Attribution extractor
 * @returns {Function} Express middleware
 */
export function createBudgetEnforcer(config) {
  const { db, repositories, getAttribution = defaultGetAttribution } = config;
  const budgetService = new BudgetService({ repositories, db });

  return async function budgetEnforcerMiddleware(req, res, next) {
    if (!db) {
      return next();
    }

    try {
      const attribution = getAttribution(req);
      const operation = {
        estimatedCost: req.body?.estimatedCost || 0,
        provider: req.body?.provider,
        model: req.body?.model,
        scope_type: attribution.company_id ? 'company' : 'global',
        scope_id: attribution.company_id
      };

      const check = await budgetService.checkBudget(operation);

      if (!check.allowed) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'BudgetExceeded',
          message: check.reason,
          budget_uuid: check.budgetUuid,
          estimated_remaining: check.estimatedRemaining
        }, null, 2));
        return;
      }

      req.budgetInfo = check;
      next();
    } catch (err) {
      console.error('[CostTracker] Budget enforcement error:', err);
      next();
    }
  };
}

/**
 * Post-execution cost recording middleware
 * Use this when cost tracking is done separately from request handling
 * @param {Object} config - Configuration
 * @param {Object} config.db - Database connection
 * @param {Object} [config.repositories] - Repository factory
 * @returns {Function} Express middleware
 */
export function createCostRecorder(config) {
  const { db, repositories } = config;
  const costService = new CostService({ repositories, db });

  return async function costRecorderMiddleware(req, res, next) {
    if (!db) {
      return next();
    }

    // Attach cost recording method to request
    req.recordCost = async (costData) => {
      try {
        const event = await costService.recordCost({
          ...costData,
          attribution: costData.attribution || req.costAttribution,
          context: {
            request_id: req.costRequestId,
            ...costData.context
          }
        });
        return event;
      } catch (err) {
        console.error('[CostTracker] Cost recording error:', err);
        throw err;
      }
    };

    // Attach cost header method to response
    res.addCostHeaders = (costEvent) => {
      if (costEvent) {
        res.setHeader('X-Cost-Total', costEvent.total_cost.toFixed(6));
        res.setHeader('X-Cost-Tokens-Input', costEvent.input_tokens);
        res.setHeader('X-Cost-Tokens-Output', costEvent.output_tokens);
        res.setHeader('X-Cost-Tokens-Total', costEvent.total_tokens);
        res.setHeader('X-Cost-Request-Id', costEvent.request_id);
        res.setHeader('X-Cost-Tracked', 'true');
        res.setHeader('X-Cost-Currency', 'USD');
      }
    };

    next();
  };
}

/**
 * Simple cost header middleware
 * Adds cost tracking headers to responses without full cost tracking
 * @param {Object} config - Configuration
 * @param {boolean} [config.enabled=true] - Whether to add headers
 * @returns {Function} Express middleware
 */
export function createCostHeaders(config = {}) {
  const { enabled = true } = config;

  return function costHeadersMiddleware(req, res, next) {
    if (!enabled) {
      return next();
    }

    // Mark request for cost tracking
    req.costTrackingEnabled = true;
    req.startTime = Date.now();

    // Store original end
    const originalEnd = res.end.bind(res);

    res.end = function(data, encoding) {
      res.end = originalEnd;
      
      // Add cost tracking headers
      const latency = Date.now() - (req.startTime || Date.now());
      res.setHeader('X-Cost-Tracking', 'enabled');
      res.setHeader('X-Request-Latency-Ms', latency);
      
      if (req.costEvent) {
        res.setHeader('X-Cost-Total', req.costEvent.total_cost?.toFixed(6) || '0');
        res.setHeader('X-Cost-Tokens', req.costEvent.total_tokens || '0');
        res.setHeader('X-Cost-Request-Id', req.costEvent.request_id || 'unknown');
      }

      return originalEnd(data, encoding);
    };

    next();
  };
}

/**
 * Create a complete cost tracking middleware stack
 * Combines all cost tracking features
 * @param {CostTrackerConfig} config - Configuration
 * @returns {Function[]} Array of middleware functions
 */
export function createCostTrackingStack(config) {
  return [
    createCostHeaders(config),
    createCostRecorder(config),
    createCostTracker(config)
  ];
}

export default {
  createCostTracker,
  createBudgetEnforcer,
  createCostRecorder,
  createCostHeaders,
  createCostTrackingStack
};
