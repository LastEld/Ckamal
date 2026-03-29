/**
 * @fileoverview Integrations Domain - Webhook and notification management
 * @module domains/integrations
 */

/**
 * Represents a registered webhook
 * @typedef {Object} Webhook
 * @property {string} id - Unique identifier
 * @property {string} url - Target URL
 * @property {string[]} events - Subscribed events
 * @property {Date} createdAt - Registration timestamp
 */

/**
 * Payload for event triggering
 * @typedef {Object} EventPayload
 * @property {string} [any] - Dynamic payload properties
 */

/**
 * IntegrationsDomain manages webhooks and notifications
 * @class
 */
class IntegrationsDomain {
  constructor() {
    /** @type {Map<string, Webhook>} */
    this.webhooks = new Map();
    /** @type {number} */
    this.idCounter = 0;
  }

  /**
   * Generates a unique webhook ID
   * @returns {string} Unique identifier
   * @private
   */
  _generateId() {
    return `webhook_${++this.idCounter}_${Date.now()}`;
  }

  /**
   * Registers a new webhook for specified events
   * @param {string} url - The webhook URL to register
   * @param {string[]} events - Array of event names to subscribe to
   * @returns {string} The registered webhook ID
   * @throws {Error} If URL is invalid or events is not an array
   */
  registerWebhook(url, events) {
    if (!url || typeof url !== 'string') {
      throw new Error('URL must be a non-empty string');
    }
    if (!Array.isArray(events)) {
      throw new Error('Events must be an array');
    }

    const id = this._generateId();
    /** @type {Webhook} */
    const webhook = {
      id,
      url,
      events: [...events],
      createdAt: new Date()
    };

    this.webhooks.set(id, webhook);
    return id;
  }

  /**
   * Unregisters a webhook by ID
   * @param {string} id - The webhook ID to unregister
   * @returns {boolean} True if removed, false if not found
   */
  unregisterWebhook(id) {
    return this.webhooks.delete(id);
  }

  /**
   * Sends a notification through specified channel
   * @param {string} channel - The channel name
   * @param {string} message - The message to send
   * @returns {Promise<{success: boolean, channel: string, timestamp: Date}>}
   * @throws {Error} If channel or message is invalid
   */
  async sendNotification(channel, message) {
    if (!channel || typeof channel !== 'string') {
      throw new Error('Channel must be a non-empty string');
    }
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }

    // Simulate async notification delivery
    await Promise.resolve();

    return {
      success: true,
      channel,
      timestamp: new Date()
    };
  }

  /**
   * Lists all registered webhooks
   * @returns {Webhook[]} Array of registered webhooks
   */
  listWebhooks() {
    return Array.from(this.webhooks.values());
  }

  /**
   * Triggers an event and notifies relevant webhooks
   * @param {string} event - The event name to trigger
   * @param {EventPayload} payload - Event data to send
   * @returns {Promise<{event: string, triggered: number, results: Array}>}
   * @throws {Error} If event name is invalid
   */
  async triggerEvent(event, payload) {
    if (!event || typeof event !== 'string') {
      throw new Error('Event must be a non-empty string');
    }

    const results = [];
    let triggered = 0;

    for (const webhook of this.webhooks.values()) {
      if (webhook.events.includes(event) || webhook.events.includes('*')) {
        triggered++;
        results.push({
          webhookId: webhook.id,
          url: webhook.url,
          status: 'triggered',
          payload
        });
      }
    }

    return {
      event,
      triggered,
      results
    };
  }
}

export { IntegrationsDomain } from './integrations-domain.js';
export {
  GitHubService,
  GitHubSyncRepository,
  createGitHubService,
  createGitHubSyncRepository,
  DEFAULT_LABEL_MAPPINGS,
  VALID_WEBHOOK_EVENTS
} from './github-service.js';

export { IntegrationsDomain as default };

