/**
 * @fileoverview Claude Core Module - Exports all Claude client implementations
 * @module claude/core
 */

export { ClaudeClient, ClaudeError, AuthenticationError, RateLimitError, ConversationError } from './client.js';
export { OptimizedClaudeClient, createOptimizedClient } from './optimized-client.js';
export { RetryPolicy } from './resilience.js';

// Default export is the optimized client for new code
export { OptimizedClaudeClient as default } from './optimized-client.js';
