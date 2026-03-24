# Roadmaps Domain Contract

## Overview

The Roadmaps Domain provides educational roadmaps with node-based learning paths, user enrollment tracking, and progress calculation.

## Classes

### RoadmapManager

Implements roadmap lifecycle management with user enrollment and progress tracking.

#### Methods

##### `createRoadmap(data)`

Creates a new learning roadmap.

**Parameters:**
- `data` (CreateRoadmapData): Roadmap creation data
  - `title` (string): **Required.** Roadmap title
  - `description` (string): Roadmap description
  - `category` (string): Subject category
  - `difficulty` (RoadmapDifficulty): Difficulty level (default: 'beginner')
  - `nodes` (RoadmapNode[]): Learning nodes array (default: [])
  - `tags` (string[]): Tag array
  - `estimatedHours` (number): Estimated completion time

**Returns:** (Roadmap) Created roadmap object with generated ID

**Throws:**
- Error: "Roadmap title is required" if title is missing, empty, or not a string

---

##### `getRoadmap(id)`

Retrieves a roadmap by ID.

**Parameters:**
- `id` (string): Roadmap ID

**Returns:** (Roadmap|undefined) Roadmap object or undefined if not found

---

##### `updateRoadmap(id, updates)`

Updates an existing roadmap with allowed fields.

**Parameters:**
- `id` (string): Roadmap ID
- `updates` (UpdateRoadmapData): Fields to update
  - Allowed: title, description, category, nodes, difficulty, tags, estimatedHours
  - Ignored: id, createdAt, createdBy

**Returns:** (Roadmap|null) Updated roadmap or null if not found

---

##### `deleteRoadmap(id)`

Deletes a roadmap and all associated enrollments.

**Parameters:**
- `id` (string): Roadmap ID

**Returns:** (boolean) True if roadmap existed and was deleted

---

##### `listRoadmap(filters?)`

Lists roadmaps with optional filtering.

**Parameters:**
- `filters` (RoadmapFilters): Optional filter criteria
  - `category` (string): Filter by category
  - `difficulty` (RoadmapDifficulty): Filter by difficulty
  - `tags` (string[]): Filter by tags

**Returns:** (Roadmap[]) Array of matching roadmaps

---

##### `enrollUser(roadmapId, userId)`

Enrolls a user in a roadmap.

**Parameters:**
- `roadmapId` (string): Roadmap ID
- `userId` (string): User ID

**Returns:** (Enrollment) Created enrollment record

**Throws:**
- Error: "Roadmap not found: {roadmapId}" if roadmap doesn't exist
- Error: "User {userId} is already enrolled in roadmap {roadmapId}" if duplicate

---

##### `getProgress(roadmapId, userId)`

Gets user progress for a roadmap.

**Parameters:**
- `roadmapId` (string): Roadmap ID
- `userId` (string): User ID

**Returns:** (ProgressResult) Progress information

**ProgressResult Object:**
- `percent` (number): Completion percentage (0-100)
- `completed` (number): Number of completed nodes
- `total` (number): Total number of nodes
- `nodeStatuses` (Record<string, NodeStatus>): Status per node ID
- `lastAccessedAt` (string): ISO timestamp

**Throws:**
- Error: "User {userId} is not enrolled in roadmap {roadmapId}" if not enrolled

---

##### `updateNodeStatus(roadmapId, userId, nodeId, status)`

Updates the status of a node for an enrolled user.

**Parameters:**
- `roadmapId` (string): Roadmap ID
- `userId` (string): User ID
- `nodeId` (string): Node ID
- `status` (NodeStatus): New status ('not_started' | 'in_progress' | 'completed')

**Returns:** (Enrollment|null) Updated enrollment or null if not found

**Throws:**
- Error: "Invalid status: {status}" if status is not valid

---

##### `recommendNext(roadmapId?, userId)`

Recommends next nodes for a user to work on.

**Parameters:**
- `roadmapId` (string): Optional roadmap ID filter
- `userId` (string): User ID

**Returns:** (Recommendation[]) Array of recommended nodes sorted by priority

**Recommendation Object:**
- `nodeId` (string): Node ID
- `node` (RoadmapNode): Node details
- `roadmapId` (string): Roadmap ID
- `priority` (number): Priority score (higher = more urgent)

**Priority Rules:**
- In-progress nodes: 80 (highest)
- Foundation nodes (no prerequisites): 70
- Assessment nodes: 60
- Other available nodes: 50

---

##### `getUserEnrollments(userId)`

Gets all enrollments for a user.

**Parameters:**
- `userId` (string): User ID

**Returns:** (EnrollmentSummary[]) Array of enrollment summaries

**EnrollmentSummary Object:**
- `roadmapId` (string): Roadmap ID
- `title` (string): Roadmap title
- `category` (string): Roadmap category
- `progress` (ProgressResult): Progress information
- `enrolledAt` (string): ISO timestamp
- `lastAccessedAt` (string): ISO timestamp

## Types

### Roadmap

```typescript
interface Roadmap {
  id: string;                    // Unique roadmap ID
  title: string;                 // Roadmap title
  description: string;           // Roadmap description
  category: string;              // Subject category
  difficulty: RoadmapDifficulty; // Difficulty level
  nodes: RoadmapNode[];          // Learning nodes
  tags: string[];                // Tag array
  estimatedHours: number;        // Estimated completion time
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  createdBy: string;             // Creator user ID
}
```

### RoadmapNode

```typescript
interface RoadmapNode {
  id: string;                    // Unique node ID (within roadmap)
  title: string;                 // Node title
  description: string;           // Node description
  type: NodeType;                // Node type
  content: NodeContent;          // Content based on type
  prerequisites: string[];       // Prerequisite node IDs
  estimatedMinutes: number;      // Time estimate
  tags: string[];                // Tag array
}
```

### NodeType

```typescript
type NodeType = 'lesson' | 'exercise' | 'assessment' | 'project' | 'milestone';
```

### RoadmapDifficulty

```typescript
type RoadmapDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
```

### Enrollment

```typescript
interface Enrollment {
  userId: string;                // User ID
  roadmapId: string;             // Roadmap ID
  nodeStatuses: Record<string, NodeStatus>; // Status per node
  progressPercent: number;       // Completion percentage
  enrolledAt: string;            // ISO timestamp
  lastAccessedAt: string;        // ISO timestamp
}
```

### NodeStatus

```typescript
type NodeStatus = 'not_started' | 'in_progress' | 'completed';
```

## Integration

### Tasks Domain

Tasks can be linked to roadmap nodes. When a node has linked tasks, task completion may affect node status.

### Prerequisite System

Nodes define prerequisites via `prerequisites` array containing node IDs. Recommendations only include nodes with all prerequisites completed.

## Usage Example

```javascript
import { RoadmapManager } from './index.js';

const manager = new RoadmapManager();

// Create a roadmap
const roadmap = manager.createRoadmap({
  title: 'JavaScript Fundamentals',
  description: 'Learn JS from scratch',
  category: 'programming',
  difficulty: 'beginner',
  nodes: [
    {
      id: 'variables',
      title: 'Variables and Types',
      type: 'lesson',
      prerequisites: []
    },
    {
      id: 'functions',
      title: 'Functions',
      type: 'lesson',
      prerequisites: ['variables']
    },
    {
      id: 'quiz-1',
      title: 'Mid-course Quiz',
      type: 'assessment',
      prerequisites: ['functions']
    }
  ]
});

// Enroll a user
const enrollment = manager.enrollUser(roadmap.id, 'user123');

// Update node status
manager.updateNodeStatus(roadmap.id, 'user123', 'variables', 'completed');

// Get progress
const progress = manager.getProgress(roadmap.id, 'user123');
console.log(`${progress.percent}% complete`);

// Get recommendations
const recommendations = manager.recommendNext(roadmap.id, 'user123');
console.log(recommendations[0].node.title); // 'Functions'
```

## Acceptance Criteria

### Functional Requirements

- FR1: System shall create learning roadmaps with nodes and metadata
- FR2: System shall update roadmap properties while preserving creation data
- FR3: System shall delete roadmaps and associated enrollments
- FR4: System shall enroll users in roadmaps with progress tracking
- FR5: System shall calculate user progress based on node completion
- FR6: System shall recommend next nodes based on prerequisites and status
- FR7: System shall filter roadmaps by category and difficulty
- FR8: System shall support hierarchical node dependencies

### Performance Requirements

- PR1: Roadmap creation completes in < 10ms
- PR2: Progress calculation is O(n) where n is number of nodes
- PR3: Recommendation generation scales with number of available nodes
- PR4: User enrollment lookup uses composite key for O(1) access
- PR5: Roadmap listing with filters is O(n) where n is total roadmaps
- PR6: Node status updates are O(1) via direct key access

### Security Requirements

- SR1: User IDs are validated as strings
- SR2: Roadmap IDs are generated internally, not user-provided
- SR3: Update operations respect field allowlists
- SR4: Enrollment data is isolated between users
- SR5: Deletion cascades to prevent orphaned enrollment records
