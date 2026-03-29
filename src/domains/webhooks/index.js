/**
 * @fileoverview Webhooks Domain - Index
 * @module domains/webhooks
 * @description Webhook system for Ckamal - event subscriptions, delivery, and management
 * @version 5.0.0
 */

// Event types and schemas
export {
  WebhookEventType,
  EventCategory,
  EventTypeToCategory,
  EventPayloadSchemas,
  getAllEventTypes,
  getEventTypesByCategory,
  getCategoryForEventType,
  validateEventPayload,
  isValidEventType,
  getEventTypeDescription
} from './webhook-events.js';

// Service and enums
export {
  WebhookService,
  WebhookStatus,
  DeliveryStatus,
  SigningAlgorithm
} from './webhook-service.js';

// Default exports
export { default as webhookEvents } from './webhook-events.js';
export { default as WebhookServiceDefault } from './webhook-service.js';
