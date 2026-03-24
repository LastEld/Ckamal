# Analytics Module

## Overview

The Analytics Module provides comprehensive cost tracking, budget management, and reporting capabilities for CogniMesh v5.0. It enables organizations to monitor API usage costs, enforce budget constraints, and generate detailed analytics reports for informed decision-making.

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Analytics Module                             │
├──────────────┬──────────────────────┬───────────────────────────┤
│ CostTracker  │   BudgetManager      │    ReportGenerator        │
├──────────────┤  ┌────────────────┐  │  ┌─────────────────────┐  │
│ Request      │  │ Budget CRUD    │  │  │ Usage Reports       │  │
│ Tracking     │  │ Threshold      │  │  │ Cost Reports        │  │
│ Aggregation  │  │ Alerts         │  │  │ Budget Reports      │  │
│ Storage      │  │ Enforcement    │  │  │ Export (JSON/CSV)   │  │
└──────────────┘  └────────────────┘  │  └─────────────────────┘  │
         ↓                   ↓        │            ↓              │
    ┌─────────────────────────────────┴─────────────────────────┐ │
    │                    SQLite Database                        │ │
    └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
API Request → CostTracker → Database
                                ↓
                    ┌───────────┴───────────┐
                    ↓                       ↓
            BudgetManager          ReportGenerator
            (Threshold Check)        (Aggregations)
                    ↓                       ↓
              Alert Emitted           Report Generated
```

## Components

### CostTracker

Core component for recording and tracking API usage costs:

- **Request Tracking**: Records every API request with cost details
- **Token Counting**: Tracks input/output token usage
- **Provider Aggregation**: Groups costs by AI provider
- **Model Breakdown**: Detailed usage by model
- **Time-series Storage**: Historical cost data

### BudgetManager

Manages budget constraints and alerts:

- **Budget Creation**: Define budgets with limits and periods
- **Threshold Monitoring**: Multi-level alert thresholds
- **Spend Tracking**: Real-time budget consumption
- **Enforcement**: Block operations that would exceed budget
- **Alert Notifications**: Notify on threshold breaches

### ReportGenerator

Generates comprehensive analytics reports:

- **Usage Reports**: Request volume and patterns
- **Cost Reports**: Spending analysis and trends
- **Budget Reports**: Budget utilization and projections
- **Export Formats**: JSON, CSV, PDF support
- **Date Range Filtering**: Flexible reporting periods

## Usage

### Basic Setup

```javascript
import { Analytics } from './analytics/index.js';

const analytics = new Analytics({
  dataDir: './data',
  reportsDir: './reports',
  autoCheckBudgets: true,
  checkInterval: 60000  // Check budgets every minute
});

await analytics.init();
```

### Tracking API Costs

```javascript
// Track a Claude API request
await analytics.trackRequest(
  'anthropic',                          // Provider
  'claude-3-sonnet-20240229',          // Model
  { input: 1500, output: 800 },        // Token counts
  0.024,                               // Cost in USD
  { 
    requestId: 'req-uuid',
    feature: 'chat-completion',
    userId: 'user-123'
  }
);

// Track batch request
for (const request of batchRequests) {
  await analytics.trackRequest(
    request.provider,
    request.model,
    request.tokens,
    request.cost,
    { batchId: 'batch-001' }
  );
}
```

### Budget Management

```javascript
// Create a monthly budget
const monthlyBudget = await analytics.budgetManager.createBudget({
  name: 'Production API Budget',
  limit: 5000.00,
  period: 'monthly',
  alertThresholds: [0.5, 0.75, 0.9, 1.0]
});

// Create a daily budget
const dailyBudget = await analytics.budgetManager.createBudget({
  name: 'Daily Limit',
  limit: 200.00,
  period: 'daily',
  alertThresholds: [0.8, 1.0]
});

// Check current spend
const budget = await analytics.budgetManager.getBudget(monthlyBudget.id);
console.log(`Spent: $${budget.currentSpend} / $${budget.limit}`);
```

### Pre-operation Budget Check

```javascript
// Check before expensive operation
const check = await analytics.checkBudget({
  estimatedCost: 100.00,
  budgetId: monthlyBudget.id
});

if (check.allowed) {
  // Proceed with operation
  const result = await performExpensiveOperation();
  
  // Track actual cost
  await analytics.trackRequest(
    'anthropic',
    'claude-3-opus',
    result.tokens,
    result.cost,
    { operation: 'analysis' }
  );
} else {
  console.warn(`Budget check failed: ${check.reason}`);
  // Handle budget exceeded
}
```

### Budget Alert Handling

```javascript
analytics.onAlert((alert, status) => {
  console.warn(`Budget Alert: ${alert.message}`);
  
  // Send notification
  sendNotification({
    level: alert.percentage >= 1.0 ? 'critical' : 'warning',
    message: `Budget "${status.budgetName}" at ${(alert.percentage * 100).toFixed(1)}%`,
    channels: ['email', 'slack']
  });
});
```

### Generating Reports

```javascript
// Generate monthly cost report
const costReport = await analytics.generateReport(
  'cost',
  'json',
  { 
    start: '2024-01-01T00:00:00Z', 
    end: '2024-01-31T23:59:59Z' 
  },
  { 
    groupBy: ['provider', 'model'],
    includeProjections: true
  }
);

// Generate usage report as CSV
const usageReport = await analytics.generateReport(
  'usage',
  'csv',
  { start: '2024-01-01', end: '2024-01-31' }
);

// Save to file
await fs.writeFile('usage-report.csv', usageReport.data);
```

### Accessing Statistics

```javascript
// Get overall stats
const stats = await analytics.getCostStats();
console.log(`Total spend: $${stats.totalCost}`);
console.log(`Total requests: ${stats.totalRequests}`);

// Filtered stats
const anthropicStats = await analytics.getCostStats({
  provider: 'anthropic',
  startDate: '2024-01-01',
  endDate: '2024-01-31'
});

// Provider breakdown
for (const [provider, data] of Object.entries(stats.byProvider)) {
  console.log(`${provider}: $${data.totalCost} (${data.requestCount} requests)`);
}
```

## Configuration

### Analytics Configuration

```javascript
{
  // Data storage
  dataDir: './data/analytics',
  reportsDir: './reports',
  
  // Budget checking
  autoCheckBudgets: true,
  checkInterval: 60000,  // 1 minute
  
  // Cost tracking
  defaultCurrency: 'USD',
  precision: 4,  // Decimal places for costs
  
  // Retention
  retentionDays: 365,  // Keep data for 1 year
  
  // Reporting
  defaultReportFormat: 'json'
}
```

### Budget Configuration

```javascript
{
  name: 'API Budget',
  limit: 1000.00,
  currency: 'USD',
  period: 'monthly',  // 'daily' | 'weekly' | 'monthly' | 'yearly'
  
  // Alert thresholds (as percentages)
  alertThresholds: [0.5, 0.75, 0.9, 1.0],
  
  // Optional date range
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-12-31T23:59:59Z',
  
  // Action on exceed
  action: 'alert',  // 'alert' | 'block' | 'warn'
  
  // Tags for organization
  tags: ['production', 'api']
}
```

### Report Configuration

```javascript
{
  // Report types
  types: ['usage', 'cost', 'budget', 'forecast'],
  
  // Output formats
  formats: ['json', 'csv', 'pdf', 'html'],
  
  // Default date range
  defaultDays: 30,
  
  // Aggregation
  aggregation: 'daily',  // 'hourly' | 'daily' | 'weekly' | 'monthly'
  
  // Include projections
  projections: true,
  projectionDays: 30
}
```

## Best Practices

1. **Track All Requests**: Ensure every API call is tracked for accurate analytics
2. **Set Appropriate Budgets**: Set realistic limits based on usage patterns
3. **Use Multiple Thresholds**: Configure multiple alert levels for early warning
4. **Regular Reporting**: Generate reports weekly/monthly for trend analysis
5. **Monitor Projections**: Use forecast reports to predict future costs
6. **Tag Requests**: Use metadata to categorize and analyze by feature/user
7. **Handle Alerts**: Always implement alert handlers for budget notifications
8. **Clean Old Data**: Archive or delete old data to manage database size
