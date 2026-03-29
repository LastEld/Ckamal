# Approval Workflows

CogniMesh v5.0 provides a comprehensive approval workflow system for governing agent actions, with support for delegation, auto-approval policies, and risk-based assessment.

## Overview

The approval system enables:
- **Action approval**: Human oversight for agent operations
- **Risk assessment**: Automatic risk level calculation
- **Delegation**: Temporary authority transfer
- **Auto-approval policies**: Rules-based automatic approvals
- **Escalation**: Automatic escalation on timeout
- **Audit trail**: Complete history of decisions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   APPROVAL DOMAIN                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               ApprovalService                       │   │
│  │                                                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐          │   │
│  │  │  Create  │ │ Decisions│ │ Delegate │          │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘          │   │
│  │       │            │            │                 │   │
│  │       └────────────┴────────────┘                 │   │
│  │                    │                              │   │
│  │         ┌──────────┴──────────┐                  │   │
│  │         │   Policy Engine     │                  │   │
│  │         │  (Auto-approval)    │                  │   │
│  │         └─────────────────────┘                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌────────────────────────┴────────────────────────┐       │
│  │              Data Layer                         │       │
│  │  approvals │ policies │ delegations │ audit_log │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Approval Types

| Type | Description | Default Risk |
|------|-------------|--------------|
| `agent_action` | Generic agent operation | Medium |
| `code_change` | Code modification | Medium |
| `file_delete` | File deletion | High |
| `file_modify` | File modification | Medium |
| `system_command` | Shell command execution | Critical |
| `api_call` | External API call | Medium |
| `deployment` | Production deployment | Critical |
| `config_change` | Configuration change | High |
| `access_grant` | Permission grant | Critical |
| `cost_threshold` | High-cost operation | Medium |

## Approval Status

```
PENDING ─────► APPROVED
   │                │
   ├───────────────► REJECTED
   │
   ├───────────────► CHANGES_REQUESTED
   │
   ├───────────────► ESCALATED (on timeout)
   │
   ├───────────────► CANCELLED
   │
   └───────────────► EXPIRED (timeout)
```

| Status | Description |
|--------|-------------|
| `pending` | Awaiting decision |
| `approved` | Approved and can proceed |
| `rejected` | Denied, action blocked |
| `changes_requested` | Modifications needed |
| `escalated` | Escalated to higher authority |
| `cancelled` | Cancelled by requester |
| `expired` | Timed out |

## Risk Levels

| Level | Score | Description |
|-------|-------|-------------|
| `low` | 0-1 | Safe operations |
| `medium` | 2-3 | Standard risk |
| `high` | 4-5 | Elevated risk |
| `critical` | 6+ | High impact |

### Risk Factors

Risk is calculated from:
- **Base risk by type**: Each approval type has base score
- **Estimated impact**: `low` (+0), `high` (+2), `critical` (+3)
- **Affected systems**: +1 per system (max +2)
- **Target environment**: Production (+1)
- **Estimated cost**: >$100 (+1)
- **Elevated privileges**: sudo/admin (+1)

```javascript
// Risk assessment example
const riskFactors = [
  'file_deletion',
  'production_target',
  'elevated_privileges'
];
// Score: 3 (file_delete base) + 1 (production) + 1 (elevated) = 5 (HIGH)
```

## Creating Approvals

```javascript
import { ApprovalService, ApprovalType } from './src/domains/approvals/approval-service.js';

const approvalService = new ApprovalService({ db });

// Create approval for agent action
const approval = await approvalService.createApproval({
  companyId: 'comp-123',
  type: ApprovalType.CODE_CHANGE,
  payload: {
    files: ['src/auth.js', 'src/routes.js'],
    description: 'Refactor authentication middleware',
    estimatedImpact: 'medium',
    affectedSystems: ['api'],
    target: 'staging'
  },
  requestedByAgentId: 'agent-456',
  priority: 'normal',
  timeout: 86400,  // 24 hours
  stakeholders: ['user-789', 'user-abc']  // Additional watchers
});

// Create approval for system command
const approval = await approvalService.createApproval({
  companyId: 'comp-123',
  type: ApprovalType.SYSTEM_COMMAND,
  payload: {
    command: 'docker-compose restart',
    description: 'Restart services after config change',
    requiresSudo: true,
    target: 'production'
  },
  requestedByUserId: 'user-456',
  priority: 'high',
  timeout: 3600  // 1 hour
});
```

### Approval Structure

```javascript
{
  id: 'app_uuid',
  companyId: 'comp-123',
  type: 'code_change',
  status: 'pending',
  priority: 'normal',
  requestedByAgentId: 'agent-456',
  requestedByUserId: null,
  requestedByType: 'agent',
  payload: {
    files: ['src/auth.js'],
    description: 'Refactor authentication'
  },
  riskLevel: 'medium',
  riskFactors: ['code_modification'],
  decidedByUserId: null,
  decidedAt: null,
  decisionNote: null,
  timeoutAt: '2024-01-16T10:00:00Z',
  escalationLevel: 0,
  stakeholders: [
    { id: 'stake_uuid', userId: 'user-789', role: 'approver', notifiedAt: '...' }
  ],
  comments: [],
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z'
}
```

## Making Decisions

### Approve

```javascript
await approvalService.approve('approval-uuid', {
  decidedByUserId: 'user-789',
  note: 'Changes look good. Approved for staging deployment.'
});
```

### Reject

```javascript
await approvalService.reject('approval-uuid', {
  decidedByUserId: 'user-789',
  reason: 'Missing test coverage for edge cases'
});
```

### Request Changes

```javascript
await approvalService.requestChanges('approval-uuid', {
  decidedByUserId: 'user-789',
  feedback: 'Please add unit tests for the new auth middleware and update documentation'
});
```

## Delegation

### Creating Delegations

Temporarily transfer approval authority:

```javascript
// Delegate approval authority
const delegation = await approvalService.delegateApproval({
  companyId: 'comp-123',
  delegatorUserId: 'user-manager',    // Original approver
  delegateUserId: 'user-delegate',    // Temporary approver
  approvalTypes: ['code_change', 'file_modify'],  // Limit types
  riskLevels: ['low', 'medium'],      // Limit risk levels
  startsAt: new Date(),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),  // 7 days
  createdBy: 'user-manager'
});
```

### Delegation Structure

```javascript
{
  id: 'dlg_uuid',
  companyId: 'comp-123',
  delegatorUserId: 'user-manager',
  delegateUserId: 'user-delegate',
  approvalTypes: ['code_change', 'file_modify'],
  riskLevels: ['low', 'medium'],
  startsAt: '2024-01-15T00:00:00Z',
  expiresAt: '2024-01-22T00:00:00Z',
  status: 'active',
  createdAt: '2024-01-15T10:00:00Z'
}
```

### Managing Delegations

```javascript
// Get active delegations for a user
const delegations = approvalService.getActiveDelegations('comp-123', 'user-delegate');

// Revoke delegation
await approvalService.revokeDelegation('dlg-uuid', 'user-manager');
```

### Delegation Rules

- Circular delegations are prevented
- Delegations are time-bound
- Can be limited by approval type and risk level
- Expired delegations are automatically invalid
- Original approver can still approve

## Auto-Approval Policies

### Creating Policies

```javascript
// Create auto-approval policy
const policy = await approvalService.createPolicy({
  companyId: 'comp-123',
  name: 'Low Risk Auto-Approve',
  description: 'Auto-approve low risk code changes in dev',
  approvalType: 'code_change',  // null = all types
  riskLevels: ['low'],
  minApprovers: 1,
  autoApprove: true,
  autoApproveConditions: {
    maxEstimatedCost: 10,
    allowedTargets: ['development', 'staging'],
    blockedTargets: ['production']
  },
  escalationTimeout: 3600,
  escalationTargets: ['user-manager-1', 'user-manager-2'],
  maxEscalationLevel: 2,
  priority: 100
});
```

### Policy Conditions

| Condition | Description |
|-----------|-------------|
| `maxEstimatedCost` | Maximum allowed cost |
| `allowedTargets` | Allowed target environments |
| `blockedTargets` | Blocked target environments |
| `allowedFilePatterns` | Allowed file patterns |
| `blockedFilePatterns` | Blocked file patterns |
| `maxFilesChanged` | Maximum files in change |
| `requireTests` | Tests must be included |

### Policy Evaluation

Policies are evaluated in priority order:

```javascript
// Check policy for a request
const result = await approvalService.checkApprovalPolicy({
  companyId: 'comp-123',
  type: 'code_change',
  riskLevel: 'low',
  payload: {
    target: 'staging',
    estimatedCost: 5,
    files: ['src/utils.js']
  },
  actorId: 'agent-456',
  actorType: 'agent'
});

// Returns:
{
  requiresApproval: false,
  autoApprove: true,
  matchingPolicy: { /* policy */ },
  approvers: [],
  minApprovers: 0,
  reason: 'Auto-approve conditions met'
}
```

### Policy Priority

Higher priority policies are checked first:

```javascript
// Critical production policy - highest priority
await approvalService.createPolicy({
  companyId: 'comp-123',
  name: 'Production Protection',
  approvalType: 'deployment',
  riskLevels: ['high', 'critical'],
  autoApprove: false,
  minApprovers: 2,
  priority: 1000
});

// Standard policy - lower priority
await approvalService.createPolicy({
  companyId: 'comp-123',
  name: 'Standard Approval',
  autoApprove: false,
  minApprovers: 1,
  priority: 100
});
```

## Escalation

### Escalation Flow

```
Pending ──► 1h timeout ──► Level 1 ──► 2h timeout ──► Level 2 ──► 4h timeout ──► Expired
                │                              │
                ▼                              ▼
          Notify manager                   Notify director
```

### Escalation Configuration

```javascript
const approvalService = new ApprovalService({
  db,
  defaultTimeout: 86400,  // 24 hours
  maxEscalationLevel: 3,
  escalationTimeouts: [3600, 7200, 14400],  // 1h, 2h, 4h
  autoApproveEnabled: false  // Disable auto-approval globally
});
```

### Escalation Targets

```javascript
// Policy with escalation targets
await approvalService.createPolicy({
  companyId: 'comp-123',
  name: 'Production Deployment',
  approvalType: 'deployment',
  riskLevels: ['critical'],
  minApprovers: 2,
  escalationTimeout: 1800,  // 30 minutes
  escalationTargets: [
    'user-tech-lead',
    'user-engineering-manager',
    'user-cto'
  ],
  maxEscalationLevel: 3
});
```

## Listing and Filtering

```javascript
// List all approvals
const approvals = approvalService.listApprovals({
  companyId: 'comp-123',
  status: 'pending',
  type: 'code_change',
  riskLevel: 'high',
  requestedBy: 'agent-456',
  limit: 50,
  offset: 0
});

// Get single approval
const approval = approvalService.getApproval('approval-uuid');
```

## Comments

```javascript
// Add comment to approval
await approvalService.addComment('approval-uuid', {
  authorType: 'user',
  authorId: 'user-789',
  content: 'Have we considered the performance impact?',
  parentCommentId: null
});

// Decision notes are added automatically
```

## Audit Trail

All actions are logged to `approval_audit_log`:

```javascript
{
  id: 'audit_uuid',
  approvalId: 'app_uuid',
  action: 'approved',  // created, approved, rejected, etc.
  actorType: 'user',
  actorId: 'user-789',
  details: {
    note: 'Changes look good',
    previousStatus: 'pending'
  },
  createdAt: '2024-01-15T11:00:00Z'
}
```

## Integration with Agent Execution

### Pre-Execution Check

```javascript
async function executeAgentAction(agent, action) {
  // Create approval request
  const approval = await approvalService.createApproval({
    companyId: agent.companyId,
    type: action.type,
    payload: action.payload,
    requestedByAgentId: agent.id
  });
  
  // If auto-approved, proceed immediately
  if (approval.status === 'approved') {
    return executeAction(action);
  }
  
  // Otherwise, wait for approval
  await waitForApproval(approval.id);
  
  // Check final status
  const final = approvalService.getApproval(approval.id);
  if (final.status === 'approved') {
    return executeAction(action);
  }
  
  throw new Error(`Action ${final.status}: ${final.decisionNote}`);
}
```

### Approval Middleware

```javascript
// Express middleware for protected operations
const approvalMiddleware = (type) => async (req, res, next) => {
  const approval = await approvalService.createApproval({
    companyId: req.auth.companyId,
    type,
    payload: req.body,
    requestedByUserId: req.auth.actorId
  });
  
  if (approval.status !== 'approved') {
    return res.status(202).json({
      message: 'Approval required',
      approvalId: approval.id,
      status: approval.status
    });
  }
  
  next();
};

// Usage
app.post('/api/deploy',
  approvalMiddleware('deployment'),
  deploymentController.deploy
);
```

## Webhook Events

```javascript
// Approval created
{
  type: 'approval.created',
  approvalId: 'app_uuid',
  companyId: 'comp-123',
  type: 'code_change',
  riskLevel: 'medium',
  autoApproved: false
}

// Approval approved
{
  type: 'approval.approved',
  approvalId: 'app_uuid',
  decidedBy: 'user-789',
  decisionNote: 'Looks good'
}

// Approval rejected
{
  type: 'approval.rejected',
  approvalId: 'app_uuid',
  decidedBy: 'user-789',
  reason: 'Needs more tests'
}

// Approval auto-approved
{
  type: 'approval.auto_approved',
  approvalId: 'app_uuid',
  reason: 'Policy "Low Risk Auto-Approve" matched'
}

// Delegation created
{
  type: 'approval.delegation_created',
  delegationId: 'dlg_uuid',
  delegatorUserId: 'user-manager',
  delegateUserId: 'user-delegate'
}
```

## Error Handling

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `APPROVAL_NOT_FOUND` | 404 | Approval doesn't exist |
| `APPROVAL_ALREADY_DECIDED` | 409 | Already approved/rejected |
| `INSUFFICIENT_PERMISSIONS` | 403 | User cannot approve |
| `INVALID_STATUS` | 400 | Invalid status transition |
| `TIMEOUT_EXPIRED` | 410 | Approval timed out |
| `POLICY_VIOLATION` | 403 | Violates policy |
| `DELEGATION_NOT_FOUND` | 404 | Delegation not found |
| `INVALID_DELEGATION` | 400 | Circular or invalid delegation |

## Best Practices

1. **Set appropriate timeouts**: Match timeout to urgency
2. **Use risk assessment**: Let system calculate risk
3. **Configure auto-approval**: Reduce noise for safe operations
4. **Set up escalation**: Ensure approvals don't stall
5. **Use delegation**: For vacations/handovers
6. **Document policies**: Clear policy descriptions
7. **Monitor audit logs**: Regular review of decisions
8. **Require multiple approvers**: For critical operations
