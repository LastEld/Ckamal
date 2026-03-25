# Analytics Module Contract (Subscription-Only)

## Overview

The Analytics Module is a lightweight subscription-only stub. Metered billing, budget enforcement, and report generation have been archived to `_archived/`.

## Public Interfaces

### Analytics

Stub class that satisfies the `src/server.js` integration contract.

```javascript
import { Analytics } from './analytics/index.js';

const analytics = new Analytics(config);  // config accepted but ignored
```

**Methods:**

- `constructor(config)` - Creates Analytics stub
  - `config` (Object) - Accepted for backward compatibility (ignored)

- `init()` - Sets `_initialized = true` (no-op)
  - Returns: Promise<void>

- `close()` - Sets `_initialized = false` (no-op)
  - Returns: Promise<void>

- `trackRequest(provider, model, tokens, cost, options)` - No-op stub
  - All parameters accepted but unused
  - Returns: Promise<{ success: true, note: string }>

**Properties:**

- `_initialized` (boolean) - Compatibility flag checked by server.js fallback path

## Removed Interfaces

The following classes and their methods have been archived to `_archived/`:

- **CostTracker** - `init()`, `close()`, `trackRequest()`, `setRates()`, `calculateCost()`, `getCosts()`, `getStats()`, `predictCosts()`, `getProviders()`, `exportData()`
- **BudgetManager** - `init()`, `close()`, `setBudget()`, `getBudget()`, `getAllBudgets()`, `deleteBudget()`, `getBudgetStatus()`, `checkBudget()`, `checkAlerts()`, `getAlerts()`, `acknowledgeAlert()`, `getForecast()`
- **ReportGenerator** - `init()`, `close()`, `generate()`, `listReports()`, `getReport()`, `deleteReport()`

## Events

No events are emitted by the stub.

## Error Handling

The stub does not throw errors. All methods return successfully.
