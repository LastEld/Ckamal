/**
 * @fileoverview Subscription-only Analytics Stub for CogniMesh v5.0
 *
 * Subscription-only analytics - metered billing archived.
 *
 * The user runs flat-rate subscriptions ($18-20/month) for Claude, GPT,
 * and Kimi.  All metered cost tracking, budget enforcement, invoice
 * generation, and report generation code has been moved to
 * `src/analytics/_archived/` and is no longer active.
 *
 * This stub preserves the `Analytics` class name and the
 * `_initialized` / `init()` / `close()` / `trackRequest()` surface so
 * that `src/server.js` (and any other call-sites) continue to work
 * without modification.
 *
 * @module analytics
 */

/**
 * Lightweight subscription-only Analytics stub.
 *
 * Every public method is a no-op that returns a success shape so
 * callers never need to guard against missing analytics.
 */
export class Analytics {
  /**
   * Creates a new Analytics stub.
   * @param {Object} [config={}] - Accepted for backward compatibility (ignored).
   */
  constructor(config = {}) {
    this.config = config;
    this._initialized = false;
  }

  /**
   * Initializes the analytics stub (no-op).
   * @returns {Promise<void>}
   */
  async init() {
    this._initialized = true;
  }

  /**
   * Closes the analytics stub (no-op).
   * @returns {Promise<void>}
   */
  async close() {
    this._initialized = false;
  }

  /**
   * Records a request event.
   *
   * Under subscriptions there is no metered cost to track, so this
   * method returns immediately with a success note.
   *
   * @param {string} _provider - AI provider (unused).
   * @param {string} _model - Model identifier (unused).
   * @param {Object} _tokens - Token counts (unused).
   * @param {number} _cost - Cost value (unused).
   * @param {Object} [_options] - Additional options (unused).
   * @returns {Promise<Object>} Success acknowledgement.
   */
  async trackRequest(_provider, _model, _tokens, _cost, _options) {
    return {
      success: true,
      note: 'Subscription-only mode - metered billing is not active'
    };
  }
}

// Default export
export default Analytics;
