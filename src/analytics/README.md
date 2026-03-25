# Analytics Module (Subscription-Only)

## Overview

The Analytics Module has been simplified to a subscription-only stub. CogniMesh users run flat-rate subscriptions ($18-20/month) for Claude, GPT, and Kimi -- there is no metered API billing to track.

All metered cost tracking, budget management, and report generation code has been archived to `src/analytics/_archived/` and is no longer active.

## Architecture

```
src/analytics/
  index.js           <-- Lightweight stub (Analytics class)
  README.md
  CONTRACT.md
  _archived/
    cost-tracker.js   <-- Original CostTracker (archived)
    budget.js         <-- Original BudgetManager (archived)
    reports.js        <-- Original ReportGenerator (archived)
```

## Current Behavior

The `Analytics` class provides three no-op methods for backward compatibility:

- **`init()`** -- Sets `_initialized = true`. No databases, no connections.
- **`close()`** -- Sets `_initialized = false`.
- **`trackRequest()`** -- Returns `{ success: true, note: '...' }` immediately.

This ensures `src/server.js` (which dynamically imports and initializes Analytics) continues to work without modification.

## Usage

```javascript
import { Analytics } from './analytics/index.js';

const analytics = new Analytics();
await analytics.init();          // no-op
await analytics.trackRequest();  // returns success stub
await analytics.close();         // no-op
```

## What Was Removed

The following capabilities were archived (not deleted) and can be restored if the project ever moves to metered API billing:

1. **CostTracker** -- Per-request cost recording, aggregation, time-series storage, cost prediction
2. **BudgetManager** -- Budget creation, threshold monitoring, spend enforcement, alerts
3. **ReportGenerator** -- Usage/cost/performance/audit reports in JSON, CSV, HTML formats

## Why

Subscription-based usage means:
- No per-token costs to track
- No budgets to enforce
- No invoices to generate
- Token counts and usage stats are still tracked via the usage controller (`src/controllers/claude-usage.js`)
