/**
 * Usage Predictor - Time series forecasting and anomaly detection
 * @module intelligence/predictor
 */

/**
 * Data point in a time series
 * @typedef {Object} DataPoint
 * @property {number} timestamp - Unix timestamp
 * @property {number} value - Data value
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Forecast result
 * @typedef {Object} ForecastResult
 * @property {DataPoint[]} predictions - Predicted values
 * @property {number[]} confidenceIntervals.lower - Lower bound (95%)
 * @property {number[]} confidenceIntervals.upper - Upper bound (95%)
 * @property {number} trend - Trend coefficient
 * @property {number} seasonality - Seasonality strength
 * @property {number} confidence - Overall confidence score
 */

/**
 * Anomaly detection result
 * @typedef {Object} AnomalyResult
 * @property {boolean} isAnomaly - Whether data point is anomalous
 * @property {number} score - Anomaly score (0-1)
 * @property {string} [type] - Anomaly type ('spike', 'drop', 'trend_change')
 * @property {number} expectedValue - Expected normal value
 * @property {number} deviation - Deviation from expected
 */

/**
 * Trend analysis result
 * @typedef {Object} TrendResult
 * @property {string} direction - Trend direction ('up', 'down', 'stable')
 * @property {number} slope - Trend slope coefficient
 * @property {number} strength - Trend strength (0-1)
 * @property {number} r2 - R-squared value
 */

/**
 * Predictor for time series forecasting, anomaly detection and trend analysis
 */
export class Predictor {
  /**
   * Create a Predictor
   * @param {Object} options - Configuration options
   * @param {number} options.historyWindow - History window size
   * @param {number} options.anomalyThreshold - Anomaly detection threshold
   * @param {number} options.confidenceLevel - Confidence level (default: 0.95)
   */
  constructor(options = {}) {
    this.historyWindow = options.historyWindow || 30;
    this.anomalyThreshold = options.anomalyThreshold || 2.5;
    this.confidenceLevel = options.confidenceLevel || 0.95;
    
    this.history = [];
    this.seasonalityPeriod = null;
    this.trendModel = null;
  }

  /**
   * Forecast future values
   * @param {DataPoint[]} data - Historical time series data
   * @param {number} horizon - Number of periods to forecast
   * @returns {ForecastResult} Forecast results with confidence intervals
   */
  forecast(data, horizon) {
    if (data.length < 3) {
      throw new Error('At least 3 data points required for forecasting');
    }

    const values = data.map(d => d.value);
    const timestamps = data.map(d => d.timestamp);
    
    // Calculate intervals between data points
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    // Decompose time series
    const trend = this.extractTrend(values);
    const seasonality = this.extractSeasonality(values);
    const residuals = this.calculateResiduals(values, trend, seasonality);
    
    // Calculate confidence interval multiplier
    const zScore = this.getZScore(this.confidenceLevel);
    const residualStd = this.standardDeviation(residuals);
    
    const predictions = [];
    const lowerBounds = [];
    const upperBounds = [];
    
    const lastTimestamp = timestamps[timestamps.length - 1];
    
    for (let i = 1; i <= horizon; i++) {
      const futureTimestamp = lastTimestamp + i * avgInterval;
      
      // Project trend
      const trendValue = trend.slope * (values.length + i - 1) + trend.intercept;
      
      // Add seasonality if detected
      let seasonalValue = 0;
      if (seasonality.period > 0) {
        const seasonalIndex = (values.length + i - 1) % seasonality.period;
        seasonalValue = seasonality.pattern[seasonalIndex] || 0;
      }
      
      const predictedValue = trendValue + seasonalValue;
      const uncertainty = zScore * residualStd * Math.sqrt(1 + i * 0.1); // Increasing uncertainty
      
      predictions.push({
        timestamp: futureTimestamp,
        value: predictedValue
      });
      
      lowerBounds.push(predictedValue - uncertainty);
      upperBounds.push(predictedValue + uncertainty);
    }
    
    // Calculate overall confidence
    const trendStrength = Math.min(1, Math.abs(trend.r2));
    const confidence = trendStrength * (1 - residualStd / this.mean(values));
    
    return {
      predictions,
      confidenceIntervals: {
        lower: lowerBounds,
        upper: upperBounds
      },
      trend: trend.slope,
      seasonality: seasonality.strength,
      confidence: Math.max(0, Math.min(1, confidence))
    };
  }

  /**
   * Detect anomalies in time series data
   * @param {DataPoint[]} data - Time series data
   * @returns {AnomalyResult[]} Anomaly detection results
   */
  detectAnomaly(data) {
    const values = data.map(d => d.value);
    const results = [];
    
    // Use rolling window for detection
    const windowSize = Math.min(this.historyWindow, Math.floor(values.length / 2));
    
    for (let i = 0; i < values.length; i++) {
      const windowStart = Math.max(0, i - windowSize);
      const window = values.slice(windowStart, i);
      
      if (window.length < 3) {
        results.push({
          isAnomaly: false,
          score: 0,
          expectedValue: values[i],
          deviation: 0
        });
        continue;
      }
      
      const mean = this.mean(window);
      const std = this.standardDeviation(window);
      
      const zScore = std > 0 ? Math.abs(values[i] - mean) / std : 0;
      const isAnomaly = zScore > this.anomalyThreshold;
      
      let type = null;
      if (isAnomaly) {
        if (values[i] > mean + std * this.anomalyThreshold) type = 'spike';
        else if (values[i] < mean - std * this.anomalyThreshold) type = 'drop';
        else type = 'trend_change';
      }
      
      results.push({
        isAnomaly,
        score: Math.min(1, zScore / (this.anomalyThreshold * 2)),
        type,
        expectedValue: mean,
        deviation: values[i] - mean
      });
    }
    
    return results;
  }

  /**
   * Analyze trends in time series data
   * @param {DataPoint[]} data - Time series data
   * @returns {TrendResult} Trend analysis result
   */
  trendAnalysis(data) {
    const values = data.map(d => d.value);
    const trend = this.extractTrend(values);
    
    let direction;
    if (Math.abs(trend.slope) < 0.01 * this.mean(values)) {
      direction = 'stable';
    } else if (trend.slope > 0) {
      direction = 'up';
    } else {
      direction = 'down';
    }
    
    // Calculate strength based on R-squared and slope magnitude
    const normalizedSlope = Math.abs(trend.slope) / (this.mean(values) || 1);
    const strength = Math.min(1, (trend.r2 * 0.7 + Math.min(1, normalizedSlope) * 0.3));
    
    return {
      direction,
      slope: trend.slope,
      strength,
      r2: trend.r2
    };
  }

  /**
   * Calculate confidence intervals for predictions
   * @param {number[]} predictions - Predicted values
   * @param {number} stdError - Standard error
   * @param {number} [level] - Confidence level (default: 0.95)
   * @returns {{lower: number[], upper: number[]}} Confidence intervals
   */
  calculateConfidenceIntervals(predictions, stdError, level = this.confidenceLevel) {
    const zScore = this.getZScore(level);
    const margin = zScore * stdError;
    
    return {
      lower: predictions.map(p => p - margin),
      upper: predictions.map(p => p + margin)
    };
  }

  /**
   * Extract trend from time series using linear regression
   * @private
   * @param {number[]} values - Time series values
   * @returns {{slope: number, intercept: number, r2: number}} Trend parameters
   */
  extractTrend(values) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = values.reduce((sum, yi) => sum + yi * yi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    const ssTotal = values.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const ssResidual = values.reduce((sum, yi, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const r2 = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
    
    return { slope, intercept, r2 };
  }

  /**
   * Extract seasonality pattern
   * @private
   * @param {number[]} values - Time series values
   * @returns {{period: number, pattern: number[], strength: number}} Seasonality info
   */
  extractSeasonality(values) {
    // Try to detect seasonality period using autocorrelation
    const maxLag = Math.floor(values.length / 2);
    let bestPeriod = 0;
    let bestCorrelation = 0;
    
    for (let lag = 2; lag <= maxLag; lag++) {
      const correlation = this.autocorrelation(values, lag);
      if (correlation > bestCorrelation && correlation > 0.3) {
        bestCorrelation = correlation;
        bestPeriod = lag;
      }
    }
    
    if (bestPeriod === 0) {
      return { period: 0, pattern: [], strength: 0 };
    }
    
    // Extract seasonal pattern
    const pattern = new Array(bestPeriod).fill(0);
    const counts = new Array(bestPeriod).fill(0);
    
    // Remove trend first
    const trend = this.extractTrend(values);
    const detrended = values.map((v, i) => v - (trend.slope * i + trend.intercept));
    
    for (let i = 0; i < detrended.length; i++) {
      const idx = i % bestPeriod;
      pattern[idx] += detrended[i];
      counts[idx]++;
    }
    
    const normalizedPattern = pattern.map((p, i) => counts[i] > 0 ? p / counts[i] : 0);
    
    return {
      period: bestPeriod,
      pattern: normalizedPattern,
      strength: bestCorrelation
    };
  }

  /**
   * Calculate residuals after removing trend and seasonality
   * @private
   * @param {number[]} values - Original values
   * @param {Object} trend - Trend parameters
   * @param {Object} seasonality - Seasonality info
   * @returns {number[]} Residual values
   */
  calculateResiduals(values, trend, seasonality) {
    return values.map((v, i) => {
      let residual = v - (trend.slope * i + trend.intercept);
      if (seasonality.period > 0) {
        residual -= seasonality.pattern[i % seasonality.period] || 0;
      }
      return residual;
    });
  }

  /**
   * Calculate autocorrelation at given lag
   * @private
   * @param {number[]} values - Time series
   * @param {number} lag - Lag value
   * @returns {number} Autocorrelation coefficient
   */
  autocorrelation(values, lag) {
    const n = values.length;
    const mean = this.mean(values);
    const variance = this.variance(values);
    
    if (variance === 0) return 0;
    
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += (values[i] - mean) * (values[i + lag] - mean);
    }
    
    return sum / ((n - lag) * variance);
  }

  /**
   * Calculate mean
   * @private
   * @param {number[]} values - Values
   * @returns {number} Mean
   */
  mean(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate variance
   * @private
   * @param {number[]} values - Values
   * @returns {number} Variance
   */
  variance(values) {
    const mean = this.mean(values);
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  /**
   * Calculate standard deviation
   * @private
   * @param {number[]} values - Values
   * @returns {number} Standard deviation
   */
  standardDeviation(values) {
    return Math.sqrt(this.variance(values));
  }

  /**
   * Get Z-score for confidence level
   * @private
   * @param {number} level - Confidence level
   * @returns {number} Z-score
   */
  getZScore(level) {
    // Approximate Z-scores for common confidence levels
    const zScores = {
      0.80: 1.28,
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576
    };
    return zScores[level] || 1.96;
  }

  /**
   * Add data point to history
   * @param {DataPoint} point - Data point to add
   */
  addDataPoint(point) {
    this.history.push(point);
    if (this.history.length > this.historyWindow * 2) {
      this.history.shift();
    }
  }

  /**
   * Get prediction accuracy metrics
   * @param {DataPoint[]} actual - Actual values
   * @param {DataPoint[]} predicted - Predicted values
   * @returns {Object} Accuracy metrics
   */
  getAccuracyMetrics(actual, predicted) {
    const n = Math.min(actual.length, predicted.length);
    if (n === 0) return { mae: 0, rmse: 0, mape: 0 };
    
    let mae = 0;
    let rmse = 0;
    let mape = 0;
    
    for (let i = 0; i < n; i++) {
      const error = Math.abs(actual[i].value - predicted[i].value);
      mae += error;
      rmse += error * error;
      mape += actual[i].value !== 0 ? error / Math.abs(actual[i].value) : 0;
    }
    
    return {
      mae: mae / n,
      rmse: Math.sqrt(rmse / n),
      mape: (mape / n) * 100
    };
  }
}

export default Predictor;
