# Billing System

CogniMesh v5.0 provides comprehensive cost tracking and budget management for AI API usage across all supported providers (Claude, Kimi, Codex).

## Overview

The billing system enables:
- **Real-time cost tracking**: Per-request cost attribution with full context
- **Budget management**: Spending limits at multiple scope levels
- **Alert configuration**: Multi-threshold alerting system
- **Usage analytics**: Detailed breakdowns by provider, model, agent
- **Budget enforcement**: Soft, hard, and notify-only enforcement modes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BILLING DOMAIN                         │
│                                                             │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │   CostService    │◄────►│  BudgetService   │            │
│  │                  │      │                  │            │
│  │ - Record costs   │      │ - Create budgets │            │
│  │ - Calculate      │      │ - Check limits   │            │
│  │ - Aggregate      │      │ - Send alerts    │            │
│  │ - Analytics      │      │ - Enforce policy │            │
│  └────────┬─────────┘      └────────┬─────────┘            │
│           │                         │                       │
│           └───────────┬─────────────┘                       │
│                       │                                     │
│              ┌────────▼────────┐                           │
│              │   Cost Ledger   │                           │
│              │   Budgets       │                           │
│              │   Alerts        │                           │
│              └─────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

## Cost Tracking

### Cost Event Structure

Every AI API request generates a cost event:

```javascript
{
  uuid: 'evt_1234567890_abc123',
  company_id: 1,
  user_id: 42,
  agent_id: 'agent-uuid',
  session_id: 'session-uuid',
  request_id: 'req_1234567890_xyz789',
  conversation_id: 101,
  task_id: 55,
  provider: 'claude',
  model: 'claude-3-opus-20240229',
  billing_model: 'subscription',
  input_tokens: 1500,
  output_tokens: 500,
  input_cost: 0.015,
  output_cost: 0.0075,
  base_cost: 0,
  total_cost: 0.0225,
  routing_strategy: 'capability',
  operation_type: 'completion',
  metadata: { /* additional context */ },
  created_at: '2024-01-15T10:30:00Z'
}
```

### Recording Costs

```javascript
import { CostService } from './src/domains/billing/cost-service.js';

const costService = new CostService({ repositories, db });

// Record a cost event
await costService.recordCost({
  tokens: { input: 1500, output: 500 },
  provider: 'claude',
  model: 'claude-3-opus-20240229',
  attribution: {
    company_id: 1,
    user_id: 42,
    agent_id: 'agent-123',
    session_id: 'session-456'
  },
  context: {
    request_id: 'req_abc',
    conversation_id: 101,
    task_id: 55
  },
  routing: {
    strategy: 'capability',
    estimated_cost: 0.025
  },
  operation_type: 'completion',
  billing_model: 'subscription'
});
```

### Automatic Cost Calculation

Costs are calculated based on provider rate cards:

```javascript
// Get rates for a provider/model
const rates = await costService.getRates('claude', 'claude-3-opus-20240229');

// Returns:
{
  input_rate: 15.00,    // $ per 1M input tokens
  output_rate: 75.00,   // $ per 1M output tokens
  base_cost: 0,         // Fixed cost per request
  currency: 'USD'
}

// Calculate cost
const cost = await costService.calculateCost('claude', 'claude-3-opus', {
  input: 1500,
  output: 500
});

// Result:
{
  input_cost: 0.0225,
  output_cost: 0.0375,
  base_cost: 0,
  total_cost: 0.06,
  rates: { /* rate info */ }
}
```

### Cost Attribution

Costs can be attributed at multiple levels:

| Scope | Description |
|-------|-------------|
| `company_id` | Organization level |
| `user_id` | Individual user |
| `agent_id` | Specific agent/CV |
| `session_id` | Runtime session |
| `conversation_id` | Chat conversation |
| `task_id` | Linked task |

## Budget Management

### Budget Scopes

Budgets can be set at different levels:

| Scope Type | Description | Example |
|------------|-------------|---------|
| `global` | Platform-wide | $10,000/month |
| `company` | Organization | $5,000/month |
| `user` | Individual user | $500/month |
| `agent` | Specific agent | $100/month |

### Creating Budgets

```javascript
import { BudgetService } from './src/domains/billing/budget-service.js';

const budgetService = new BudgetService({ 
  repositories, 
  db,
  costService 
});

// Create company budget
const budget = await budgetService.createBudget({
  name: 'Acme Corp Monthly Budget',
  scope_type: 'company',
  scope_id: 'comp-123',
  period: 'monthly',
  amount: 5000,
  currency: 'USD',
  alert_threshold_1: 0.5,   // 50%
  alert_threshold_2: 0.75,  // 75%
  alert_threshold_3: 0.9,   // 90%
  enforcement_mode: 'hard'  // Block when exceeded
});

// Create agent-specific budget
const agentBudget = await budgetService.createBudget({
  name: 'Support Agent Budget',
  scope_type: 'agent',
  scope_id: 'agent-456',
  period: 'daily',
  amount: 50,
  enforcement_mode: 'soft'  // Warn but allow
});
```

### Budget Periods

| Period | Description |
|--------|-------------|
| `daily` | Resets every day |
| `weekly` | Resets every week (Sunday) |
| `monthly` | Resets every month (1st) |
| `yearly` | Resets every year (Jan 1) |
| `custom` | Specific date range |

### Budget Status

```javascript
// Check budget status
const status = await budgetService.getBudgetStatus('bud_xxx');

// Returns:
{
  uuid: 'bud_xxx',
  name: 'Acme Corp Monthly Budget',
  limit: 5000,
  spent: 3750,
  remaining: 1250,
  percentage: 0.75,
  status: 'warning',  // ok, info, warning, critical, exceeded
  periodStart: '2024-01-01T00:00:00Z',
  periodEnd: '2024-01-31T23:59:59Z',
  isBlocking: false
}
```

## Alert Configuration

### Alert Levels

| Level | Threshold | Action |
|-------|-----------|--------|
| `info` | 50% | Informational notification |
| `warning` | 75% | Warning notification |
| `critical` | 90% | Urgent notification |
| `exceeded` | 100% | Budget exceeded notification |

### Alert Structure

```javascript
{
  uuid: 'alr_1234567890_abc',
  budget_id: 'bud_xxx',
  level: 'warning',
  threshold_triggered: 0.75,
  current_spend: 3750,
  budget_limit: 5000,
  title: 'Budget Alert: 75% Threshold Reached',
  message: 'You have spent 75% of your monthly budget ($3,750 of $5,000)',
  acknowledged: false,
  created_at: '2024-01-15T10:30:00Z'
}
```

### Managing Alerts

```javascript
// Get unacknowledged alerts
const alerts = await budgetService.getAlerts({
  acknowledged: false,
  companyId: 'comp-123'
});

// Acknowledge alert
await budgetService.acknowledgeAlert('alr_xxx', 'user-123');
```

## Enforcement Modes

### Mode Comparison

| Mode | Behavior | Use Case |
|------|----------|----------|
| `notify_only` | Track and alert only | Cost visibility |
| `soft` | Warn but allow | Development |
| `hard` | Block when exceeded | Production control |

### Pre-Execution Checks

```javascript
// Check if operation is allowed
const check = await budgetService.checkOperation({
  company_id: 1,
  agent_id: 'agent-123',
  estimated_cost: 0.50,
  provider: 'claude',
  model: 'claude-3-opus'
});

// Returns:
{
  allowed: true,        // or false if blocked
  reason: null,         // reason if blocked
  estimatedRemaining: 1249.50,
  budgetUuid: 'bud_xxx',
  status: 'ok'
}
```

### Enforcement in Heartbeat

The heartbeat service automatically checks budgets before starting runs:

```javascript
// In heartbeat-service.js
async startRun(runId) {
  // Check budget before starting
  if (this.budgetService) {
    const budgetCheck = await this.budgetService.checkBudget(run.agent_id, {
      context: run.context_snapshot
    });
    if (budgetCheck.blocked) {
      await this._failRun(runId, budgetCheck.reason, ErrorCode.BUDGET_EXCEEDED);
      return null;
    }
  }
  // ... continue starting run
}
```

## Analytics and Reporting

### Dashboard Summary

```javascript
const summary = await costService.getDashboardSummary({
  companyId: 'comp-123',
  period: '30d'
});

// Returns:
{
  totalCost: 12345.67,
  totalTokens: 45678900,
  requestCount: 1234,
  costByProvider: {
    claude: 8000.00,
    kimi: 3000.00,
    codex: 1345.67
  },
  costByModel: {
    'claude-3-opus': 5000.00,
    'claude-3-sonnet': 3000.00,
    // ...
  },
  costByAgent: {
    'agent-1': 5000.00,
    'agent-2': 7345.67
  },
  trend: [
    { date: '2024-01-01', cost: 400 },
    { date: '2024-01-02', cost: 350 },
    // ...
  ]
}
```

### Aggregated Statistics

```javascript
// Get cost statistics
const stats = await costService.getCostStats({
  company_id: 1,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});

// Returns:
{
  totalCost: 5000.00,
  totalTokens: 25000000,
  inputTokens: 15000000,
  outputTokens: 10000000,
  requestCount: 1000,
  costByProvider: { /* breakdown */ },
  costByModel: { /* breakdown */ },
  costByOperation: { /* breakdown */ },
  costByAgent: { /* breakdown */ }
}
```

## Provider Rate Management

### Rate Cards

```javascript
// Add/update rate card
await costService.setRate({
  provider: 'claude',
  model: 'claude-3-opus-20240229',
  billing_model: 'subscription',
  input_rate: 15.00,    // $ per 1M tokens
  output_rate: 75.00,
  base_cost: 0,
  effective_from: new Date('2024-01-01'),
  currency: 'USD'
});
```

### Supported Billing Models

| Model | Description |
|-------|-------------|
| `subscription` | Flat-rate subscription |
| `pay_per_use` | Per-token billing |
| `hybrid` | Base + usage |

## Integration Examples

### With Router Engine

```javascript
// Router estimates cost before execution
const routing = await routerEngine.route({
  content: prompt,
  preferred: ['claude', 'kimi'],
  budgetContext: {
    company_id: auth.companyId,
    max_cost: 0.10
  }
});

// Check against budget
if (routing.estimatedCost > budgetLimit) {
  // Route to cheaper alternative
}
```

### With Agent Pool

```javascript
// Agent pool checks budget before spawning
async spawnAgent(task) {
  const budgetCheck = await budgetService.checkOperation({
    agent_id: task.agentId,
    estimated_cost: task.estimatedCost
  });
  
  if (!budgetCheck.allowed) {
    throw new BudgetExceededError(budgetCheck.reason);
  }
  
  // ... spawn agent
}
```

## Best Practices

1. **Set multiple budgets**: Company, team, and agent-level budgets
2. **Use hard enforcement for production**: Prevent runaway costs
3. **Configure alert thresholds**: 50%, 75%, 90% provides good visibility
4. **Review analytics regularly**: Identify cost drivers
5. **Set up notification channels**: Email, Slack, webhooks for alerts
6. **Use agent-specific budgets**: Isolate costs by function
