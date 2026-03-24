# Analytics Module Contract

## Overview

The Analytics Module provides comprehensive cost tracking, budget management, and reporting capabilities for CogniMesh v5.0. It enables real-time monitoring of API usage, budget enforcement, and detailed analytics reporting.

## Public Interfaces

### Analytics

Main class that coordinates all analytics components.

```javascript
import { Analytics } from './analytics/index.js';

const analytics = new Analytics({
  dataDir: './data',
  reportsDir: './reports',
  autoCheckBudgets: true,
  checkInterval: 60000
});
```

**Methods:**

- `constructor(config)` - Creates Analytics instance
  - `config.dataDir` - Directory for databases
  - `config.reportsDir` - Directory for reports
  - `config.autoCheckBudgets` - Enable automatic budget checking
  - `config.checkInterval` - Budget check interval in ms

- `init()` - Initializes all analytics components
  - Returns: Promise<void>

- `trackRequest(provider, model, tokens, cost, options)` - Tracks API request cost
  - `provider` (string) - AI provider name
  - `model` (string) - Model identifier
  - `tokens` (Object) - `{ input, output }` token counts
  - `cost` (number) - Calculated cost
  - `options` (Object) - Additional metadata
  - Returns: Promise<CostRecord>

- `getCostStats(filters)` - Gets cost statistics
  - `filters` (Object) - Filter options
  - `filters.provider` - Filter by provider
  - `filters.model` - Filter by model
  - `filters.startDate` - Start date
  - `filters.endDate` - End date
  - Returns: Promise<CostStats>

- `checkBudget(operation)` - Checks if operation is within budget
  - `operation` (Object) - Operation details
  - `operation.estimatedCost` - Estimated cost
  - `operation.budgetId` - Budget to check against
  - Returns: Promise<BudgetCheckResult>

- `generateReport(type, format, dateRange, options)` - Generates report
  - `type` (string) - Report type ('usage', 'cost', 'budget')
  - `format` (string) - Output format ('json', 'csv', 'pdf')
  - `dateRange` (Object) - `{ start, end }`
  - `options` (Object) - Additional options
  - Returns: Promise<Report>

- `onAlert(handler)` - Sets up alert handler callback
  - `handler` (Function) - Callback for budget alerts

- `close()` - Closes all analytics components
  - Returns: Promise<void>

### CostTracker

Tracks and stores API usage costs.

- `constructor(options)` - Creates cost tracker
  - `options.dataDir` - Database directory
  - `options.dbName` - Database file name

- `init()` - Initializes database
  - Returns: Promise<void>

- `trackRequest(provider, model, tokens, cost, options)` - Records request cost
  - Returns: Promise<CostRecord>

- `getStats(filters)` - Gets aggregated statistics
  - Returns: Promise<CostStats>

- `getDailyBreakdown(filters)` - Gets daily cost breakdown
  - Returns: Promise<DailyCost[]>

- `getProviderStats()` - Gets statistics by provider
  - Returns: Promise<ProviderStats[]>

- `close()` - Closes database connection
  - Returns: Promise<void>

### BudgetManager

Manages budgets and alerts.

- `constructor(options)` - Creates budget manager
  - `options.costTracker` - CostTracker instance
  - `options.dataDir` - Database directory

- `init()` - Initializes database
  - Returns: Promise<void>

- `createBudget(config)` - Creates a new budget
  - `config.name` - Budget name
  - `config.limit` - Budget limit
  - `config.period` - Period type ('daily', 'weekly', 'monthly')
  - `config.alertThresholds` - Alert percentages [0.5, 0.8, 1.0]
  - Returns: Promise<Budget>

- `updateBudget(id, updates)` - Updates existing budget
  - Returns: Promise<Budget>

- `deleteBudget(id)` - Deletes a budget
  - Returns: Promise<boolean>

- `getBudget(id)` - Gets budget by ID
  - Returns: Promise<Budget>

- `listBudgets()` - Lists all budgets
  - Returns: Promise<Budget[]>

- `checkBudget(operation)` - Checks operation against budget
  - Returns: Promise<BudgetCheckResult>

- `checkAlerts()` - Checks all budgets for threshold breaches
  - Returns: Promise<BudgetAlert[]>

- `close()` - Closes database connection
  - Returns: Promise<void>

### ReportGenerator

Generates analytics reports.

- `constructor(options)` - Creates report generator
  - `options.reportsDir` - Reports output directory
  - `options.costTracker` - CostTracker instance
  - `options.budgetManager` - BudgetManager instance

- `init()` - Initializes generator
  - Returns: Promise<void>

- `generate(type, format, dateRange, options)` - Generates report
  - Returns: Promise<Report>

- `generateUsageReport(dateRange, format)` - Generates usage report
  - Returns: Promise<Report>

- `generateCostReport(dateRange, format)` - Generates cost report
  - Returns: Promise<Report>

- `generateBudgetReport(dateRange, format)` - Generates budget report
  - Returns: Promise<Report>

- `close()` - Closes generator
  - Returns: Promise<void>

## Data Structures

### CostRecord

```typescript
interface CostRecord {
  id: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: string;
  metadata?: Record<string, any>;
}
```

### CostStats

```typescript
interface CostStats {
  totalCost: number;
  totalRequests: number;
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };
  averageCostPerRequest: number;
  byProvider: Record<string, ProviderStats>;
  byModel: Record<string, ModelStats>;
  dailyBreakdown: DailyCost[];
}
```

### Budget

```typescript
interface Budget {
  id: string;
  name: string;
  limit: number;
  period: 'daily' | 'weekly' | 'monthly';
  currentSpend: number;
  alertThresholds: number[];  // [0.5, 0.8, 1.0]
  alertsSent: number[];
  startDate: string;
  endDate?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### BudgetCheckResult

```typescript
interface BudgetCheckResult {
  allowed: boolean;
  budgetId: string;
  currentSpend: number;
  estimatedTotal: number;
  remaining: number;
  reason?: string;
}
```

### BudgetAlert

```typescript
interface BudgetAlert {
  budgetId: string;
  budgetName: string;
  threshold: number;
  currentSpend: number;
  limit: number;
  percentage: number;
  message: string;
}
```

### Report

```typescript
interface Report {
  id: string;
  type: 'usage' | 'cost' | 'budget';
  format: 'json' | 'csv' | 'pdf';
  dateRange: { start: string; end: string };
  generatedAt: string;
  data: any;
  filePath?: string;
}
```

## Events

The Analytics module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `cost:recorded` | `{ record }` | New cost record created |
| `budget:created` | `{ budget }` | New budget created |
| `budget:updated` | `{ budget, changes }` | Budget modified |
| `budget:deleted` | `{ budgetId }` | Budget deleted |
| `budget:alert` | `{ alert, status }` | Budget threshold crossed |
| `budget:exceeded` | `{ budgetId, spend, limit }` | Budget limit exceeded |
| `report:generated` | `{ report }` | Report generation complete |
| `error` | `{ error, context }` | Error occurred |

## Error Handling

### AnalyticsError

Base error for analytics operations.

### CostTrackingError

Thrown when cost tracking fails.

### BudgetError

Thrown when budget operations fail.

- `code`: 'BUDGET_NOT_FOUND', 'BUDGET_EXCEEDED', 'INVALID_LIMIT'

### ReportError

Thrown when report generation fails.

### DatabaseError

Thrown when database operations fail.

## Usage Example

```javascript
import { Analytics } from './analytics/index.js';

const analytics = new Analytics({
  dataDir: './data/analytics',
  autoCheckBudgets: true
});

await analytics.init();

// Track API usage
await analytics.trackRequest(
  'anthropic',
  'claude-3-sonnet',
  { input: 1000, output: 500 },
  0.015,
  { requestId: 'req-123' }
);

// Create budget
const budget = await analytics.budgetManager.createBudget({
  name: 'Monthly API Budget',
  limit: 1000.00,
  period: 'monthly',
  alertThresholds: [0.5, 0.8, 0.95]
});

// Check before expensive operation
const check = await analytics.checkBudget({
  estimatedCost: 50.00,
  budgetId: budget.id
});

if (!check.allowed) {
  console.warn('Operation would exceed budget');
}

// Generate monthly report
const report = await analytics.generateReport(
  'cost',
  'json',
  { start: '2024-01-01', end: '2024-01-31' }
);

// Cleanup
await analytics.close();
```
