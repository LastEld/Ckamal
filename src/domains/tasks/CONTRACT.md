# Tasks Domain Contract

## Overview

The Tasks Domain provides task management capabilities with Eisenhower Matrix classification for prioritization. It supports subtasks, time tracking, and integration with roadmaps.

## Classes

### TaskManager

Implements task lifecycle management with Eisenhower Matrix organization.

#### Methods

##### `createTask(data)`

Creates a new task with Eisenhower matrix classification.

**Parameters:**
- `data` (CreateTaskData): Task creation data
  - `title` (string): **Required.** Task title
  - `description` (string): Optional task description
  - `urgent` (boolean): Urgent flag (default: false)
  - `important` (boolean): Important flag (default: false)
  - `priority` (TaskPriority): Priority level (default: 'medium')
  - `dueDate` (string): ISO date string for deadline
  - `estimatedMinutes` (number): Time estimate
  - `tags` (string[]): Array of tag strings
  - `assignees` (string[]): Array of user IDs

**Returns:** (Task) Created task object with generated ID and calculated quadrant

**Throws:**
- Error: "Task title is required" if title is missing, empty, or not a string

---

##### `updateTask(id, updates)`

Updates an existing task with allowed fields.

**Parameters:**
- `id` (string): Task ID
- `updates` (UpdateTaskData): Fields to update
  - Allowed: title, description, status, priority, urgent, important, dueDate, estimatedMinutes, actualMinutes, tags, assignees
  - Ignored: id, createdAt, createdBy, quadrant (auto-recalculated)

**Returns:** (Task|null) Updated task or null if not found

---

##### `deleteTask(id)`

Deletes a task and all its subtasks (cascade deletion).

**Parameters:**
- `id` (string): Task ID

**Returns:** (boolean) True if task existed and was deleted

---

##### `getTask(id)`

Retrieves a task by ID.

**Parameters:**
- `id` (string): Task ID

**Returns:** (Task|undefined) Task object or undefined if not found

---

##### `listTasks(filters)`

Lists tasks with optional filtering.

**Parameters:**
- `filters` (TaskFilters): Optional filter criteria
  - `status` (TaskStatus): Filter by status
  - `priority` (TaskPriority): Filter by priority
  - `quadrant` (EisenhowerQuadrant): Filter by Eisenhower quadrant
  - `assignee` (string): Filter by assignee user ID
  - `tags` (string[]): Filter by tags (all must match)

**Returns:** (Task[]) Array of matching tasks

---

##### `organizeByMatrix(filters)`

Organizes tasks into Eisenhower Matrix quadrants.

**Parameters:**
- `filters` (TaskFilters): Optional filters applied before organization

**Returns:** (MatrixOrganization) Tasks grouped by quadrant

**MatrixOrganization Object:**
- `urgentImportant` (Task[]): Do First quadrant
- `notUrgentImportant` (Task[]): Schedule quadrant
- `urgentNotImportant` (Task[]): Delegate quadrant
- `notUrgentNotImportant` (Task[]): Eliminate quadrant

---

##### `linkToRoadmap(taskId, roadmapNodeId)`

Links a task to a roadmap node.

**Parameters:**
- `taskId` (string): Task ID
- `roadmapNodeId` (string): Roadmap node ID

**Returns:** (Task|null) Updated task or null if not found

---

##### `unlinkFromRoadmap(taskId)`

Removes roadmap node link from a task.

**Parameters:**
- `taskId` (string): Task ID

**Returns:** (Task|null) Updated task or null if not found

---

##### `getDueToday(assignee?)`

Gets tasks due today.

**Parameters:**
- `assignee` (string): Optional assignee filter

**Returns:** (Task[]) Tasks with dueDate matching current date

---

##### `getOverdue(assignee?)`

Gets overdue tasks (excludes completed/archived).

**Parameters:**
- `assignee` (string): Optional assignee filter

**Returns:** (Task[]) Tasks with past dueDate and non-final status

---

##### `logTime(taskId, minutes)`

Logs time spent on a task (accumulates).

**Parameters:**
- `taskId` (string): Task ID
- `minutes` (number): Minutes to add

**Returns:** (Task|null) Updated task or null if not found

---

##### `addAttachment(taskId, fileId)`

Adds a file attachment to a task.

**Parameters:**
- `taskId` (string): Task ID
- `fileId` (string): File ID to attach

**Returns:** (Task|null) Updated task or null if not found

---

##### `removeAttachment(taskId, fileId)`

Removes a file attachment from a task.

**Parameters:**
- `taskId` (string): Task ID
- `fileId` (string): File ID to remove

**Returns:** (Task|null) Updated task or null if not found

## Types

### Task

```typescript
interface Task {
  id: string;                    // Unique task ID
  title: string;                 // Task title
  description: string;           // Task description
  status: TaskStatus;            // Current status
  priority: TaskPriority;        // Priority level
  urgent: boolean;               // Urgent flag
  important: boolean;            // Important flag
  quadrant: EisenhowerQuadrant;  // Calculated quadrant
  dueDate: string | null;        // ISO date string
  estimatedMinutes: number;      // Time estimate
  actualMinutes: number;         // Logged time
  tags: string[];                // Tag array
  assignees: string[];           // User ID array
  parentTaskId: string | null;   // Parent task for subtasks
  subtasks: string[];            // Subtask IDs
  roadmapNodeId: string | null;  // Linked roadmap node
  attachments: string[];         // File ID array
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  createdBy: string;             // Creator user ID
}
```

### TaskStatus

```typescript
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'archived';
```

### TaskPriority

```typescript
type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
```

### EisenhowerQuadrant

```typescript
type EisenhowerQuadrant = 
  | 'urgent-important'           // Do First
  | 'not-urgent-important'       // Schedule
  | 'urgent-not-important'       // Delegate
  | 'not-urgent-not-important';  // Eliminate
```

## Integration

### Roadmaps Domain

Tasks can be linked to roadmap nodes via `linkToRoadmap()` and `unlinkFromRoadmap()` methods.

### Matrix Calculation

Quadrant is automatically calculated from `urgent` and `important` flags:
- `urgent=true, important=true` → `urgent-important`
- `urgent=false, important=true` → `not-urgent-important`
- `urgent=true, important=false` → `urgent-not-important`
- `urgent=false, important=false` → `not-urgent-not-important`

## Usage Example

```javascript
import { TaskManager } from './index.js';

const manager = new TaskManager();

// Create a task
const task = manager.createTask({
  title: 'Implement authentication',
  description: 'Add JWT-based auth',
  urgent: true,
  important: true,
  priority: 'high',
  estimatedMinutes: 240,
  tags: ['backend', 'security'],
  assignees: ['user123']
});

// Quadrant is automatically calculated: 'urgent-important'
console.log(task.quadrant); // 'urgent-important'

// Organize by matrix
const matrix = manager.organizeByMatrix();
console.log(matrix.urgentImportant); // [task, ...]

// Link to roadmap
manager.linkToRoadmap(task.id, 'node-abc123');

// Log time
manager.logTime(task.id, 60);

// Get overdue tasks
const overdue = manager.getOverdue('user123');
```

## Acceptance Criteria

### Functional Requirements

- FR1: System shall create tasks with Eisenhower matrix classification
- FR2: System shall automatically calculate quadrant from urgent/important flags
- FR3: System shall support subtasks with parent-child relationships
- FR4: System shall organize tasks by Eisenhower quadrants
- FR5: System shall link tasks to roadmap nodes
- FR6: System shall track time estimates and actual time spent
- FR7: System shall filter tasks by status, priority, quadrant, assignee, and tags
- FR8: System shall identify overdue and due-today tasks

### Performance Requirements

- PR1: Task creation completes in < 5ms
- PR2: Matrix organization is O(n) where n is total tasks
- PR3: Filtering by tags uses efficient set intersection
- PR4: Due/overdue queries filter before date comparison
- PR5: Subtask cascade deletion is O(m) where m is subtask count
- PR6: List operations with multiple filters apply most restrictive first

### Security Requirements

- SR1: Task IDs are generated internally with timestamp and random component
- SR2: Update operations respect field allowlists
- SR3: Subtask deletion requires parent task access
- SR4: Assignee arrays can only contain valid user ID strings
- SR5: Attachment operations validate task existence
