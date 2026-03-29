# Issue Tracking System

CogniMesh v5.0 includes a comprehensive issue/ticket management system separate from tasks, designed for full project management workflows with comments, labels, and assignment tracking.

## Overview

The issue system provides:
- **Full ticket management**: Issue lifecycle from backlog to completion
- **Threaded comments**: Support for discussions and replies
- **Label system**: Categorization and filtering
- **Assignment workflow**: User/agent assignment with history
- **Read state tracking**: Unread indicators for collaboration
- **Search and filtering**: Powerful query capabilities

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ISSUE DOMAIN                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                IssueService                         │   │
│  │                                                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐          │   │
│  │  │  Issues  │ │ Comments │ │  Labels  │          │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘          │   │
│  │       │            │            │                 │   │
│  │       └────────────┴────────────┘                 │   │
│  │                    │                              │   │
│  │         ┌──────────┴──────────┐                  │   │
│  │         │  Assignment Engine  │                  │   │
│  │         └─────────────────────┘                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌────────────────────────┴────────────────────────┐       │
│  │              Repository Layer                   │       │
│  │  issues │ comments │ labels │ read_states │ ... │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Issues vs Tasks

| Feature | Tasks (GSD Domain) | Issues (Issue Domain) |
|---------|-------------------|----------------------|
| **Purpose** | Simple todo items | Full ticket management |
| **Structure** | Flat list | Hierarchical (sub-issues) |
| **Comments** | Basic notes | Threaded discussions |
| **Labels** | Simple tags | Color-coded with descriptions |
| **Assignment** | Single assignee | Full workflow with history |
| **Read tracking** | No | Yes |
| **Search** | Basic | Advanced |

## Issue Lifecycle

### Status Workflow

```
backlog ─────► todo ─────► in_progress ─────► in_review ─────► completed
   │              │              │               │
   │              │              │               └────► blocked
   │              │              │
   └──────────────┴──────────────┴────────────────────► cancelled
```

| Status | Description |
|--------|-------------|
| `backlog` | Not yet prioritized |
| `todo` | Ready to work |
| `in_progress` | Currently being worked on |
| `in_review` | Under review/QA |
| `blocked` | Blocked by dependency |
| `completed` | Done |
| `cancelled` | Won't fix/duplicate |

### Priority Levels

| Priority | Description |
|----------|-------------|
| `critical` | Blocker, immediate attention |
| `high` | Important, soon |
| `medium` | Normal priority |
| `low` | Nice to have |

## Creating Issues

```javascript
import { IssueService } from './src/domains/issues/issue-service.js';

const issueService = new IssueService({
  repositories,
  companyId: 'comp-123',
  userId: 'user-456'
});

// Create a basic issue
const issue = await issueService.createIssue({
  title: 'Fix authentication bug in login flow',
  description: 'Users are experiencing intermittent login failures...',
  priority: 'high',
  status: 'todo',
  companyId: 'comp-123'
});

// Create with assignment
const issue = await issueService.createIssue({
  title: 'Implement OAuth integration',
  description: 'Add support for Google and GitHub OAuth...',
  priority: 'medium',
  assigneeType: 'user',  // or 'agent'
  assigneeId: 'user-789',
  dueDate: '2024-02-15',
  projectId: 'proj-abc',
  originKind: 'manual'  // manual, automation, integration, alert, routine_execution
});

// Create sub-issue
const subIssue = await issueService.createIssue({
  title: 'Write OAuth tests',
  description: 'Unit and integration tests for OAuth flow',
  parentId: 'parent-issue-uuid',
  priority: 'medium'
});
```

### Issue Structure

```javascript
{
  id: 'iss_uuid',
  issueNumber: 42,
  title: 'Fix authentication bug',
  description: 'Full description...',
  status: 'in_progress',
  priority: 'high',
  assigneeType: 'user',
  assigneeId: 'user-789',
  createdByType: 'user',
  createdById: 'user-456',
  companyId: 'comp-123',
  parentId: null,
  projectId: 'proj-abc',
  taskId: null,
  originKind: 'manual',
  originId: null,
  dueDate: '2024-02-15',
  labels: ['bug', 'auth', 'urgent'],
  isRead: true,
  commentCount: 5,
  attachmentCount: 2,
  startedAt: '2024-01-15T10:00:00Z',
  completedAt: null,
  createdAt: '2024-01-10T09:00:00Z',
  updatedAt: '2024-01-15T14:30:00Z'
}
```

## Comments System

### Adding Comments

```javascript
// Add a comment
const comment = await issueService.addComment('issue-uuid', {
  content: 'I found the root cause. The token validation is failing...',
  authorType: 'user',
  authorId: 'user-789'
});

// Add threaded reply
const reply = await issueService.addComment('issue-uuid', {
  content: 'Great catch! Let me review the fix.',
  parentId: comment.id,  // Reply to specific comment
  threadRootId: comment.id,
  authorType: 'user',
  authorId: 'user-456'
});

// System comment (auto-generated)
await issueService.addComment('issue-uuid', {
  content: 'Issue moved to in_progress',
  commentType: 'status_change',
  authorType: 'system'
});
```

### Comment Types

| Type | Description |
|------|-------------|
| `comment` | Regular user comment |
| `status_change` | Status transition |
| `assignment_change` | Assignment changed |
| `label_change` | Labels added/removed |
| `attachment` | File attachment |

### Comment Structure

```javascript
{
  id: 'cmnt_uuid',
  issueId: 'iss_uuid',
  parentId: null,  // null for top-level
  threadRootId: null,
  content: 'Comment text...',
  contentPlain: 'Comment text...',
  authorType: 'user',
  authorId: 'user-789',
  commentType: 'comment',
  metadata: {},
  isEdited: false,
  editedAt: null,
  editedBy: null,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  createdAt: '2024-01-15T10:30:00Z'
}
```

### Getting Comments

```javascript
// Get all comments (flat)
const comments = await issueService.getComments('issue-uuid', {
  limit: 100,
  offset: 0
});

// Get threaded comments (nested)
const threads = await issueService.getThreadedComments('issue-uuid');

// Returns:
[
  {
    id: 'cmnt_1',
    content: 'Original comment',
    replies: [
      { id: 'cmnt_2', content: 'Reply 1' },
      { id: 'cmnt_3', content: 'Reply 2' }
    ]
  }
]
```

### Editing and Deleting

```javascript
// Edit comment
await issueService.updateComment('cmnt-uuid', 'Updated content', 'editor-id');

// Soft delete
await issueService.deleteComment('cmnt-uuid', 'deleter-id', 'Off-topic');
```

## Label Management

### Creating Labels

```javascript
// Create a label
const label = await issueService.createLabel({
  name: 'bug',
  description: 'Something is broken',
  color: '#DC2626',  // Red
  companyId: 'comp-123'
});

// Create priority labels
await issueService.createLabel({
  name: 'priority-high',
  description: 'High priority issue',
  color: '#F59E0B'  // Orange
});

await issueService.createLabel({
  name: 'enhancement',
  description: 'New feature request',
  color: '#10B981'  // Green
});
```

### Managing Issue Labels

```javascript
// Add label to issue
await issueService.addLabelToIssue('issue-uuid', 'label-uuid');

// Remove label from issue
await issueService.removeLabelFromIssue('issue-uuid', 'label-uuid');

// Get issue labels
const labels = await issueService.getIssueLabels('issue-uuid');
```

### System Labels

System labels are automatically created and managed:

| Label | Description |
|-------|-------------|
| `bug` | Defect or error |
| `enhancement` | Feature request |
| `documentation` | Documentation improvement |
| `duplicate` | Duplicate of another issue |
| `wontfix` | Won't be fixed |
| `help wanted` | Community help needed |
| `good first issue` | Good for newcomers |

## Assignment Workflow

### Assigning Issues

```javascript
// Assign to user
await issueService.assignIssue('issue-uuid', 'user', 'user-789', {
  changedByType: 'user',
  changedById: 'user-456',
  reason: 'Best suited for this task'
});

// Assign to agent
await issueService.assignIssue('issue-uuid', 'agent', 'agent-123', {
  changedByType: 'system',
  reason: 'Auto-assigned by load balancer'
});

// Unassign
await issueService.unassignIssue('issue-uuid', {
  changedByType: 'user',
  changedById: 'user-789',
  reason: 'Reassigning to different team'
});
```

### Assignment History

```javascript
// Get assignment history
const history = await issueService.getAssignmentHistory('issue-uuid');

// Returns:
[
  {
    issueId: 'iss_uuid',
    companyId: 'comp-123',
    previousAssigneeType: null,
    previousAssigneeId: null,
    newAssigneeType: 'user',
    newAssigneeId: 'user-789',
    changedByType: 'user',
    changedById: 'user-456',
    changeReason: 'Initial assignment',
    createdAt: '2024-01-10T09:00:00Z'
  },
  {
    previousAssigneeType: 'user',
    previousAssigneeId: 'user-789',
    newAssigneeType: 'agent',
    newAssigneeId: 'agent-123',
    changedByType: 'system',
    changeReason: 'Auto-assigned',
    createdAt: '2024-01-11T10:00:00Z'
  }
]
```

### Auto-Assignment Rules

Issues can be auto-assigned based on:
- Label patterns (e.g., all `frontend` issues → frontend team)
- Issue type (e.g., bugs → on-call engineer)
- Round-robin within team
- Agent availability and load

## Read State Tracking

### Managing Read State

```javascript
// Mark as read
await issueService.markAsRead('issue-uuid', 'user-456', 'last-comment-id');

// Mark as unread
await issueService.markAsUnread('issue-uuid', 'user-456');

// Get unread count
const count = await issueService.getUnreadCount('user-456', 'comp-123');

// Get unread issue IDs
const unreadIds = await issueService.getUnreadIssues('user-456');
```

### Automatic Read State Updates

- Issues are marked as read for the creator automatically
- Issues are marked as unread for all users when updated
- Issues are marked as unread for new assignee
- Comments mark the issue as unread for others

## Search and Filtering

### Listing Issues

```javascript
// List with filters
const issues = await issueService.listIssues({
  companyId: 'comp-123',
  status: 'in_progress',
  priority: 'high',
  assigneeId: 'user-789',
  assigneeType: 'user',
  labels: ['bug', 'urgent'],
  search: 'authentication',
  orderBy: 'updated_at',
  orderDirection: 'DESC',
  limit: 50,
  offset: 0
});
```

### Search

```javascript
// Search issues
const results = await issueService.searchIssues('authentication bug', {
  companyId: 'comp-123',
  status: 'open',
  limit: 20
});
```

### Statistics

```javascript
// Get issue statistics
const stats = await issueService.getStatistics('comp-123');

// Returns:
{
  total: 150,
  backlog: 30,
  todo: 25,
  in_progress: 40,
  in_review: 20,
  blocked: 10,
  completed: 20,
  cancelled: 5
}

// Get overdue issues
const overdue = await issueService.getOverdueIssues('comp-123');
```

## Updating Issues

```javascript
// Update issue
await issueService.updateIssue('issue-uuid', {
  title: 'Updated title',
  description: 'Updated description',
  status: 'in_progress',
  priority: 'critical',
  dueDate: '2024-02-20'
});

// Status changes automatically set timestamps:
// - in_progress → startedAt
// - completed → completedAt
// - cancelled → cancelledAt
```

## Deleting Issues

```javascript
// Soft delete
await issueService.deleteIssue('issue-uuid', 'user-456');

// Issue is marked as deleted but retained in database
// Use includeDeleted option to see deleted issues
```

## Integration with Heartbeat

Issues can trigger agent runs through the heartbeat system:

```javascript
// When issue is assigned to agent, create a run
if (issue.assigneeType === 'agent') {
  const run = await heartbeatService.createRun({
    agentId: issue.assigneeId,
    invocationSource: InvocationSource.ASSIGNMENT,
    triggerDetail: TriggerDetail.CALLBACK,
    contextSnapshot: {
      issueId: issue.id,
      title: issue.title,
      description: issue.description,
      priority: issue.priority
    }
  });
}
```

## Webhook Events

The issue system emits events:

```javascript
// Issue created
{
  type: 'issue.created',
  issueId: 'iss_uuid',
  companyId: 'comp-123',
  title: 'New issue',
  createdBy: 'user-456'
}

// Issue updated
{
  type: 'issue.updated',
  issueId: 'iss_uuid',
  changes: ['status', 'assignee'],
  updatedBy: 'user-789'
}

// Issue assigned
{
  type: 'issue.assigned',
  issueId: 'iss_uuid',
  assigneeType: 'agent',
  assigneeId: 'agent-123'
}

// Comment added
{
  type: 'issue.comment.added',
  issueId: 'iss_uuid',
  commentId: 'cmnt_uuid',
  authorType: 'user',
  authorId: 'user-456'
}
```

## Best Practices

1. **Use descriptive titles**: Clear, actionable titles
2. **Write detailed descriptions**: Include context, steps to reproduce
3. **Label consistently**: Use standard labels across issues
4. **Keep comments constructive**: Focus on issue resolution
5. **Update status promptly**: Keep status current
6. **Set due dates**: For time-sensitive issues
7. **Use sub-issues**: Break down large work items
8. **Link to tasks**: Connect issues with GSD tasks when relevant
