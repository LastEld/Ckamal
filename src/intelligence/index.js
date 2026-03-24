/**
 * Intelligence Module - AI-powered components for CogniMesh v5.0
 * @module intelligence
 * 
 * @description
 * This module provides intelligent AI components for optimization,
 * classification, prediction, caching, query optimization, task
 * scheduling, and pattern recognition.
 * 
 * @example
 * ```javascript
 * import { AIOptimizer, IntentClassifier, Predictor } from './intelligence/index.js';
 * 
 * // AI Optimizer for model selection
 * const optimizer = new AIOptimizer();
 * const result = optimizer.optimizeRequest({
 *   task: 'analysis',
 *   content: 'Analyze this data...',
 *   constraints: { maxLatencyMs: 2000 }
 * });
 * 
 * // Intent Classifier
 * const classifier = new IntentClassifier({
 *   labels: ['search', 'create', 'update', 'delete']
 * });
 * classifier.train([
 *   { input: 'find all users', labels: ['search'] },
 *   { input: 'add new item', labels: ['create'] }
 * ]);
 * const intent = classifier.classify('search for products');
 * 
 * // Usage Predictor
 * const predictor = new Predictor();
 * const forecast = predictor.forecast(data, 7); // 7-day forecast
 * ```
 */

// AI Optimizer
export { AIOptimizer } from './optimizer.js';
export { default as AIOptimizerDefault } from './optimizer.js';

// Intent Classifier
export { IntentClassifier } from './classifier.js';
export { default as IntentClassifierDefault } from './classifier.js';

// Usage Predictor
export { Predictor } from './predictor.js';
export { default as PredictorDefault } from './predictor.js';

// Intelligent Cache
export { IntelligentCache } from './cache.js';
export { default as IntelligentCacheDefault } from './cache.js';

// Query Optimizer
export { QueryOptimizer } from './query.js';
export { default as QueryOptimizerDefault } from './query.js';

// Task Scheduler
export { Scheduler } from './scheduler.js';
export { default as SchedulerDefault } from './scheduler.js';

// Pattern Recognizer
export { PatternRecognizer } from './patterns.js';
export { default as PatternRecognizerDefault } from './patterns.js';

import { AIOptimizer } from './optimizer.js';
import { IntentClassifier } from './classifier.js';
import { Predictor } from './predictor.js';
import { IntelligentCache } from './cache.js';
import { QueryOptimizer } from './query.js';
import { Scheduler } from './scheduler.js';
import { PatternRecognizer } from './patterns.js';

// Version
export const VERSION = '5.0.0';

// Module metadata
export const metadata = {
  name: '@cognimesh/intelligence',
  version: VERSION,
  description: 'AI-powered intelligence components for CogniMesh',
  components: [
    'AIOptimizer',
    'IntentClassifier', 
    'Predictor',
    'IntelligentCache',
    'QueryOptimizer',
    'Scheduler',
    'PatternRecognizer'
  ]
};

/**
 * Create all intelligence components with default configuration
 * @param {Object} config - Configuration for components
 * @returns {Object} Instantiated components
 */
export function createIntelligenceSuite(config = {}) {
  const {
    optimizer: optimizerConfig,
    classifier: classifierConfig,
    predictor: predictorConfig,
    cache: cacheConfig,
    query: queryConfig,
    scheduler: schedulerConfig,
    patterns: patternsConfig
  } = config;

  return {
    optimizer: new AIOptimizer(optimizerConfig),
    classifier: new IntentClassifier(classifierConfig),
    predictor: new Predictor(predictorConfig),
    cache: new IntelligentCache(cacheConfig),
    queryOptimizer: new QueryOptimizer(queryConfig),
    scheduler: new Scheduler(schedulerConfig),
    patternRecognizer: new PatternRecognizer(patternsConfig)
  };
}

// Re-export all types (for TypeScript/JSDoc)
/**
 * @typedef {import('./optimizer.js').ModelCapabilities} ModelCapabilities
 * @typedef {import('./optimizer.js').TaskConstraints} TaskConstraints
 * @typedef {import('./optimizer.js').OptimizedRequest} OptimizedRequest
 * @typedef {import('./classifier.js').TrainingExample} TrainingExample
 * @typedef {import('./classifier.js').ClassificationResult} ClassificationResult
 * @typedef {import('./predictor.js').DataPoint} DataPoint
 * @typedef {import('./predictor.js').ForecastResult} ForecastResult
 * @typedef {import('./predictor.js').AnomalyResult} AnomalyResult
 * @typedef {import('./predictor.js').TrendResult} TrendResult
 * @typedef {import('./cache.js').CacheMetadata} CacheMetadata
 * @typedef {import('./cache.js').CacheEntry} CacheEntry
 * @typedef {import('./cache.js').SearchResult} SearchResult
 * @typedef {import('./query.js').Query} Query
 * @typedef {import('./query.js').OptimizedQuery} OptimizedQuery
 * @typedef {import('./query.js').IndexSuggestion} IndexSuggestion
 * @typedef {import('./query.js').ComplexityEstimate} ComplexityEstimate
 * @typedef {import('./scheduler.js').Task} Task
 * @typedef {import('./scheduler.js').ScheduleOptions} ScheduleOptions
 * @typedef {import('./scheduler.js').ScheduledTask} ScheduledTask
 * @typedef {import('./scheduler.js').ScheduleResult} ScheduleResult
 * @typedef {import('./patterns.js').SequenceItem} SequenceItem
 * @typedef {import('./patterns.js').Pattern} Pattern
 * @typedef {import('./patterns.js').RecognitionResult} RecognitionResult
 * @typedef {import('./patterns.js').PredictionResult} PredictionResult
 */
