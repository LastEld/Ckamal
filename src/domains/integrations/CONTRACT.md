# Integrations Domain Contract

## Overview
The Integrations Domain manages webhooks, event subscriptions, and notifications for external system integration.

## Classes

### IntegrationsDomain

Main class for managing integrations.

#### Methods

##### `registerWebhook(url, events)`
Registers a new webhook for specified events.

**Parameters:**
- `url` (string): Target webhook URL
- `events` (string[]): Array of event names to subscribe to

**Returns:** (string) Webhook ID

**Throws:**
- Error if URL is invalid
- Error if events is not an array

---

##### `unregisterWebhook(id)`
Unregisters a webhook by ID.

**Parameters:**
- `id` (string): Webhook ID to remove

**Returns:** (boolean) True if removed, false if not found

---

##### `sendNotification(channel, message)`
Sends a notification through specified channel.

**Parameters:**
- `channel` (string): Channel name
- `message` (string): Message content

**Returns:** (Promise<Object>)
- `success` (boolean): Delivery status
- `channel` (string): Channel used
- `timestamp` (Date): Delivery timestamp

**Throws:**
- Error if channel is invalid
- Error if message is invalid

---

##### `listWebhooks()`
Lists all registered webhooks.

**Returns:** (Webhook[]) Array of webhook objects

**Webhook Object:**
- `id` (string): Unique identifier
- `url` (string): Target URL
- `events` (string[]): Subscribed events
- `createdAt` (Date): Registration timestamp

---

##### `triggerEvent(event, payload)`
Triggers an event and notifies subscribed webhooks.

**Parameters:**
- `event` (string): Event name
- `payload` (Object): Event data

**Returns:** (Promise<Object>)
- `event` (string): Event name
- `triggered` (number): Count of webhooks triggered
- `results` (Array): Array of trigger results

**Throws:**
- Error if event name is invalid

## Events

Webhooks can subscribe to any event name. Use `*` to subscribe to all events.

## Usage Example

```javascript
import { IntegrationsDomain } from './index.js';

const integrations = new IntegrationsDomain();

// Register webhook
const id = integrations.registerWebhook('https://example.com/webhook', ['user.created', 'user.updated']);

// Trigger event
await integrations.triggerEvent('user.created', { userId: 123 });

// Send notification
await integrations.sendNotification('slack', 'New user registered');

// List webhooks
const webhooks = integrations.listWebhooks();

// Unregister
integrations.unregisterWebhook(id);
```
