/**
 * @fileoverview Auto-Scaler Module for GSD Infrastructure
 * @module gsd/auto-scaler
 */

/**
 * Auto-scaling strategies enum
 * @readonly
 * @enum {string}
 */
export const ScalingStrategies = {
  /** Scale based on threshold crossing */
  THRESHOLD: 'THRESHOLD',
  /** Predictive scaling based on trends */
  PREDICTIVE: 'PREDICTIVE',
  /** Time-scheduled scaling */
  SCHEDULED: 'SCHEDULED'
};

/**
 * Scaling action enum
 * @readonly
 * @enum {string}
 */
export const ScalingAction = {
  SCALE_UP: 'SCALE_UP',
  SCALE_DOWN: 'SCALE_DOWN',
  NO_ACTION: 'NO_ACTION'
};

/**
 * Pool metrics
 * @typedef {Object} PoolMetrics
 * @property {number} currentSize - Current pool size
 * @property {number} [cpu] - Average CPU usage (0-100)
 * @property {number} [memory] - Average memory usage (0-100)
 * @property {number} [load] - System load average
 * @property {number} [requestsPerSecond] - Current request rate
 * @property {number} [queueDepth] - Pending request queue depth
 * @property {number} [responseTime] - Average response time in ms
 * @property {number} [timestamp=Date.now()] - Metrics timestamp
 */

/**
 * Pool configuration
 * @typedef {Object} PoolConfig
 * @property {string} id - Pool identifier
 * @property {number} minSize - Minimum pool size
 * @property {number} maxSize - Maximum pool size
 * @property {number} [currentSize=0] - Current pool size
 * @property {number} [scaleUpStep=1] - Instances to add when scaling up
 * @property {number} [scaleDownStep=1] - Instances to remove when scaling down
 * @property {number} [cooldownUp=60000] - Cooldown after scale up (ms)
 * @property {number} [cooldownDown=300000] - Cooldown after scale down (ms)
 * @property {number} [lastScaleTime=0] - Last scaling timestamp
 * @property {Object} [thresholds] - Threshold configuration
 * @property {Object} [predictive] - Predictive scaling configuration
 * @property {Array<Object>} [schedule] - Scheduled scaling rules
 */

/**
 * Scaling decision
 * @typedef {Object} ScalingDecision
 * @property {string} action - Scaling action
 * @property {number} targetSize - Target pool size
 * @property {string} reason - Decision reason
 * @property {Object} [details] - Additional details
 */

/**
 * Auto-Scaler with threshold, predictive, and scheduled strategies
 */
export class AutoScaler {
  /**
   * Create an AutoScaler instance
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.strategy=ScalingStrategies.THRESHOLD] - Default strategy
   * @param {Function} [options.onScale] - Callback when scaling is triggered
   * @param {Function} [options.predictor] - Custom prediction function
   */
  constructor(options = {}) {
    this.strategy = options.strategy || ScalingStrategies.THRESHOLD;
    this.pools = new Map();
    this.metrics = new Map();
    this.history = new Map(); // Metrics history for prediction
    this.onScale = options.onScale || (() => {});
    this.predictor = options.predictor || this._defaultPredictor.bind(this);
    
    // Strategy handlers
    this.strategies = new Map([
      [ScalingStrategies.THRESHOLD, this._thresholdScaling.bind(this)],
      [ScalingStrategies.PREDICTIVE, this._predictiveScaling.bind(this)],
      [ScalingStrategies.SCHEDULED, this._scheduledScaling.bind(this)]
    ]);
  }

  /**
   * Register a pool for auto-scaling
   * @param {PoolConfig} config - Pool configuration
   * @returns {PoolConfig} Registered pool config
   */
  registerPool(config) {
    const pool = {
      id: config.id,
      minSize: config.minSize,
      maxSize: config.maxSize,
      currentSize: config.currentSize ?? config.minSize,
      scaleUpStep: config.scaleUpStep ?? 1,
      scaleDownStep: config.scaleDownStep ?? 1,
      cooldownUp: config.cooldownUp ?? 60000,
      cooldownDown: config.cooldownDown ?? 300000,
      lastScaleTime: config.lastScaleTime ?? 0,
      thresholds: {
        cpuHigh: 70,
        cpuLow: 30,
        memoryHigh: 80,
        memoryLow: 40,
        loadHigh: 0.8,
        loadLow: 0.3,
        queueHigh: 100,
        queueLow: 10,
        ...config.thresholds
      },
      predictive: {
        windowSize: 10,
        forecastHorizon: 5,
        confidenceThreshold: 0.7,
        ...config.predictive
      },
      schedule: config.schedule || []
    };
    
    this.pools.set(config.id, pool);
    this.metrics.set(config.id, []);
    this.history.set(config.id, []);
    
    return pool;
  }

  /**
   * Unregister a pool
   * @param {string} id - Pool identifier
   * @returns {boolean} Whether pool was removed
   */
  unregisterPool(id) {
    this.metrics.delete(id);
    this.history.delete(id);
    return this.pools.delete(id);
  }

  /**
   * Check if pool is in cooldown period
   * @param {PoolConfig} pool - Pool configuration
   * @param {string} action - Proposed action
   * @returns {boolean} Whether in cooldown
   * @private
   */
  _inCooldown(pool, action) {
    const now = Date.now();
    const cooldown = action === ScalingAction.SCALE_UP 
      ? pool.cooldownUp 
      : pool.cooldownDown;
    
    return (now - pool.lastScaleTime) < cooldown;
  }

  /**
   * Execute scaling decision
   * @param {PoolConfig} pool - Pool configuration
   * @param {ScalingDecision} decision - Scaling decision
   * @returns {ScalingDecision} Final decision (may be modified)
   * @private
   */
  _executeScale(pool, decision) {
    // Check cooldown
    if (decision.action !== ScalingAction.NO_ACTION && this._inCooldown(pool, decision.action)) {
      return {
        action: ScalingAction.NO_ACTION,
        targetSize: pool.currentSize,
        reason: 'In cooldown period'
      };
    }
    
    // Enforce min/max limits
    let targetSize = Math.max(pool.minSize, Math.min(pool.maxSize, decision.targetSize));
    
    // No change needed
    if (targetSize === pool.currentSize) {
      return {
        action: ScalingAction.NO_ACTION,
        targetSize,
        reason: 'Already at target size'
      };
    }
    
    const action = targetSize > pool.currentSize 
      ? ScalingAction.SCALE_UP 
      : ScalingAction.SCALE_DOWN;
    
    // Update pool state
    pool.currentSize = targetSize;
    pool.lastScaleTime = Date.now();
    
    // Trigger callback
    this.onScale(pool.id, action, targetSize, decision.reason);
    
    return {
      action,
      targetSize,
      reason: decision.reason
    };
  }

  /**
   * THRESHOLD scaling strategy
   * @param {PoolConfig} pool - Pool configuration
   * @param {PoolMetrics} metrics - Current metrics
   * @returns {ScalingDecision} Scaling decision
   * @private
   */
  _thresholdScaling(pool, metrics) {
    const { thresholds } = pool;
    let action = ScalingAction.NO_ACTION;
    let targetSize = pool.currentSize;
    const reasons = [];
    
    // Calculate average metrics if array provided
    const avg = Array.isArray(metrics) ? this._averageMetrics(metrics) : metrics;
    
    // Check high thresholds (scale up)
    if (avg.cpu > thresholds.cpuHigh || 
        avg.memory > thresholds.memoryHigh ||
        avg.load > thresholds.loadHigh ||
        avg.queueDepth > thresholds.queueHigh) {
      action = ScalingAction.SCALE_UP;
      targetSize = Math.min(pool.maxSize, pool.currentSize + pool.scaleUpStep);
      
      if (avg.cpu > thresholds.cpuHigh) reasons.push(`CPU ${avg.cpu.toFixed(1)}% > ${thresholds.cpuHigh}%`);
      if (avg.memory > thresholds.memoryHigh) reasons.push(`Memory ${avg.memory.toFixed(1)}% > ${thresholds.memoryHigh}%`);
      if (avg.load > thresholds.loadHigh) reasons.push(`Load ${avg.load.toFixed(2)} > ${thresholds.loadHigh}`);
      if (avg.queueDepth > thresholds.queueHigh) reasons.push(`Queue ${avg.queueDepth} > ${thresholds.queueHigh}`);
    }
    
    // Check low thresholds (scale down)
    else if (pool.currentSize > pool.minSize &&
             avg.cpu < thresholds.cpuLow &&
             avg.memory < thresholds.memoryLow &&
             avg.load < thresholds.loadLow &&
             avg.queueDepth < thresholds.queueLow) {
      action = ScalingAction.SCALE_DOWN;
      targetSize = Math.max(pool.minSize, pool.currentSize - pool.scaleDownStep);
      reasons.push('Low utilization across metrics');
    }
    
    return {
      action,
      targetSize,
      reason: reasons.join(', ') || 'Within thresholds'
    };
  }

  /**
   * Calculate average metrics from array
   * @param {Array<PoolMetrics>} metrics - Metrics array
   * @returns {PoolMetrics} Averaged metrics
   * @private
   */
  _averageMetrics(metrics) {
    if (metrics.length === 0) {
      return { cpu: 0, memory: 0, load: 0, queueDepth: 0, responseTime: 0 };
    }
    
    const sum = metrics.reduce((acc, m) => ({
      cpu: acc.cpu + (m.cpu || 0),
      memory: acc.memory + (m.memory || 0),
      load: acc.load + (m.load || 0),
      queueDepth: acc.queueDepth + (m.queueDepth || 0),
      responseTime: acc.responseTime + (m.responseTime || 0)
    }), { cpu: 0, memory: 0, load: 0, queueDepth: 0, responseTime: 0 });
    
    const count = metrics.length;
    return {
      cpu: sum.cpu / count,
      memory: sum.memory / count,
      load: sum.load / count,
      queueDepth: sum.queueDepth / count,
      responseTime: sum.responseTime / count
    };
  }

  /**
   * Default linear predictor
   * @param {Array<number>} values - Historical values
   * @param {number} horizon - Prediction horizon
   * @returns {{prediction: number, confidence: number}} Prediction result
   * @private
   */
  _defaultPredictor(values, horizon) {
    if (values.length < 2) {
      return { prediction: values[0] || 0, confidence: 0 };
    }
    
    // Simple linear regression
    const n = values.length;
    const sumX = values.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
    const sumX2 = values.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Predict next value
    const prediction = intercept + slope * (n + horizon);
    
    // Calculate confidence based on variance
    const mean = sumY / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const confidence = Math.max(0, 1 - stdDev / (mean || 1));
    
    return { prediction: Math.max(0, prediction), confidence };
  }

  /**
   * PREDICTIVE scaling strategy
   * @param {PoolConfig} pool - Pool configuration
   * @param {PoolMetrics} metrics - Current metrics
   * @returns {ScalingDecision} Scaling decision
   * @private
   */
  _predictiveScaling(pool, metrics) {
    const history = this.history.get(pool.id) || [];
    const { windowSize, forecastHorizon, confidenceThreshold } = pool.predictive;
    
    // Add current metrics to history
    const current = Array.isArray(metrics) ? this._averageMetrics(metrics) : metrics;
    history.push({ ...current, timestamp: Date.now() });
    
    // Keep only recent history
    while (history.length > windowSize) {
      history.shift();
    }
    this.history.set(pool.id, history);
    
    if (history.length < 3) {
      // Fall back to threshold strategy with limited data
      return this._thresholdScaling(pool, metrics);
    }
    
    // Predict CPU usage
    const cpuValues = history.map(h => h.cpu);
    const cpuForecast = this.predictor(cpuValues, forecastHorizon);
    
    // Predict memory usage
    const memoryValues = history.map(h => h.memory);
    const memoryForecast = this.predictor(memoryValues, forecastHorizon);
    
    const { thresholds } = pool;
    let action = ScalingAction.NO_ACTION;
    let targetSize = pool.currentSize;
    const reasons = [];
    
    // Check if prediction confidence is sufficient
    if (cpuForecast.confidence >= confidenceThreshold) {
      // Predictive scale up
      if (cpuForecast.prediction > thresholds.cpuHigh || 
          memoryForecast.prediction > thresholds.memoryHigh) {
        action = ScalingAction.SCALE_UP;
        targetSize = Math.min(pool.maxSize, pool.currentSize + pool.scaleUpStep);
        
        reasons.push(`Predictive: CPU will reach ${cpuForecast.prediction.toFixed(1)}%`);
      }
      // Predictive scale down
      else if (pool.currentSize > pool.minSize &&
               cpuForecast.prediction < thresholds.cpuLow &&
               memoryForecast.prediction < thresholds.memoryLow) {
        action = ScalingAction.SCALE_DOWN;
        targetSize = Math.max(pool.minSize, pool.currentSize - pool.scaleDownStep);
        reasons.push(`Predictive: resources trending low`);
      }
    }
    
    return {
      action,
      targetSize,
      reason: reasons.join(', ') || 'No predictive action',
      details: {
        cpuForecast,
        memoryForecast
      }
    };
  }

  /**
   * SCHEDULED scaling strategy
   * @param {PoolConfig} pool - Pool configuration
   * @param {PoolMetrics} [metrics] - Current metrics (not used)
   * @returns {ScalingDecision} Scaling decision
   * @private
   */
  _scheduledScaling(pool, metrics) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday
    
    // Find matching schedule rule
    let matchedRule = null;
    
    for (const rule of pool.schedule) {
      const { days, hours, targetSize } = rule;
      
      // Check day match (if specified)
      if (days && !days.includes(currentDay)) {
        continue;
      }
      
      // Check hour match (if specified)
      if (hours) {
        if (Array.isArray(hours)) {
          if (!hours.includes(currentHour)) continue;
        } else if (typeof hours === 'object') {
          const { start, end } = hours;
          if (currentHour < start || currentHour >= end) continue;
        }
      }
      
      matchedRule = rule;
      break;
    }
    
    if (!matchedRule) {
      // No matching schedule, fall back to threshold
      return this._thresholdScaling(pool, metrics);
    }
    
    const targetSize = Math.max(pool.minSize, Math.min(pool.maxSize, matchedRule.targetSize));
    
    return {
      action: targetSize > pool.currentSize 
        ? ScalingAction.SCALE_UP 
        : targetSize < pool.currentSize 
          ? ScalingAction.SCALE_DOWN 
          : ScalingAction.NO_ACTION,
      targetSize,
      reason: `Scheduled scaling: ${matchedRule.name || 'default'}`
    };
  }

  /**
   * Scale a pool based on metrics
   * @param {string} poolId - Pool identifier
   * @param {PoolMetrics|Array<PoolMetrics>} metrics - Current metrics
   * @param {string} [strategy] - Override strategy
   * @returns {ScalingDecision} Scaling decision
   */
  scale(poolId, metrics, strategy) {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Unknown pool: ${poolId}`);
    }
    
    const useStrategy = strategy || this.strategy;
    const handler = this.strategies.get(useStrategy);
    
    if (!handler) {
      throw new Error(`Unknown scaling strategy: ${useStrategy}`);
    }
    
    // Store metrics
    const poolMetrics = this.metrics.get(poolId);
    poolMetrics.push({ ...metrics, timestamp: Date.now() });
    
    // Keep last 100 metrics
    while (poolMetrics.length > 100) {
      poolMetrics.shift();
    }
    
    // Get scaling decision
    const decision = handler(pool, metrics);
    
    // Execute if action needed
    return this._executeScale(pool, decision);
  }

  /**
   * Get pool statistics
   * @param {string} poolId - Pool identifier
   * @returns {Object} Pool statistics
   */
  getPoolStats(poolId) {
    const pool = this.pools.get(poolId);
    if (!pool) return null;
    
    const metrics = this.metrics.get(poolId) || [];
    const history = this.history.get(poolId) || [];
    
    return {
      id: pool.id,
      currentSize: pool.currentSize,
      minSize: pool.minSize,
      maxSize: pool.maxSize,
      lastScaleTime: pool.lastScaleTime,
      metricsCount: metrics.length,
      historySize: history.length,
      cooldownUp: pool.cooldownUp,
      cooldownDown: pool.cooldownDown
    };
  }

  /**
   * Manually set pool size
   * @param {string} poolId - Pool identifier
   * @param {number} size - New size
   * @returns {boolean} Whether successful
   */
  setPoolSize(poolId, size) {
    const pool = this.pools.get(poolId);
    if (!pool) return false;
    
    pool.currentSize = Math.max(pool.minSize, Math.min(pool.maxSize, size));
    pool.lastScaleTime = Date.now();
    return true;
  }

  /**
   * Get all registered pools
   * @returns {Array<string>} Pool IDs
   */
  getPools() {
    return Array.from(this.pools.keys());
  }
}

export default AutoScaler;
