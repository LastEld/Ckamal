# Tasks Domain Acceptance Criteria

## Functional Requirements

- FR1: System shall create tasks with Eisenhower matrix classification
- FR2: System shall automatically calculate quadrant from urgent/important flags
- FR3: System shall support subtasks with parent-child relationships
- FR4: System shall organize tasks by Eisenhower quadrants
- FR5: System shall link tasks to roadmap nodes
- FR6: System shall track time estimates and actual time spent
- FR7: System shall filter tasks by status, priority, quadrant, assignee, and tags
- FR8: System shall identify overdue and due-today tasks

## Test Scenarios

### Scenario 1: Task Creation
- Given: Valid task creation data with title
- When: createTask() is called
- Then: Task is created with unique ID
- And: Status defaults to 'backlog'
- And: Priority defaults to 'medium'
- And: Urgent and important default to false
- And: Quadrant is calculated based on urgent/important
- And: Timestamps are set to current time

### Scenario 2: Task Creation Validation
- Given: Invalid task creation data
- When: Title is missing, empty, or not a string
- Then: Error is thrown: "Task title is required"

### Scenario 3: Eisenhower Quadrant Calculation
- Given: Various combinations of urgent and important flags
- When: Task is created with urgent=true, important=true
- Then: Quadrant is 'urgent-important' (Do First)
- When: Task is created with urgent=false, important=true
- Then: Quadrant is 'not-urgent-important' (Schedule)
- When: Task is created with urgent=true, important=false
- Then: Quadrant is 'urgent-not-important' (Delegate)
- When: Task is created with urgent=false, important=false
- Then: Quadrant is 'not-urgent-not-important' (Eliminate)

### Scenario 4: Quadrant Recalculation on Update
- Given: An existing task with quadrant calculated
- When: updateTask() changes urgent or important flag
- Then: Quadrant is automatically recalculated
- And: Other fields are updated as specified

### Scenario 5: Subtask Creation
- Given: A parent task and subtask data with parentTaskId
- When: Subtask is created
- Then: Subtask is stored with parent reference
- And: Parent task's subtasks array includes new subtask ID
- And: Subtask inherits some properties from parent (optional)

### Scenario 6: Task Deletion with Subtasks
- Given: A task with multiple subtasks
- When: deleteTask() is called
- Then: Parent task is deleted
- And: All subtasks are cascade deleted
- And: If task was a subtask, it's removed from parent's subtasks list

### Scenario 7: Eisenhower Matrix Organization
- Given: Multiple tasks with different quadrants
- When: organizeByMatrix() is called
- Then: Tasks are grouped into four arrays by quadrant
- And: Result includes urgentImportant, notUrgentImportant
- And: Result includes urgentNotImportant, notUrgentNotImportant

### Scenario 8: Matrix Organization with Filters
- Given: Tasks with different assignees and statuses
- When: organizeByMatrix() is called with assignee filter
- Then: Only tasks for that assignee are organized
- When: Status filter is applied
- Then: Only tasks with matching status are included

### Scenario 9: Roadmap Node Linking
- Given: An existing task and roadmap node ID
- When: linkToRoadmap() is called
- Then: Task's roadmapNodeId is updated
- And: updatedAt timestamp is refreshed
- And: Updated task is returned

### Scenario 10: Roadmap Node Unlinking
- Given: A task linked to a roadmap node
- When: unlinkFromRoadmap() is called
- Then: Task's roadmapNodeId is set to null
- And: Other task properties are preserved

### Scenario 11: Task Update
- Given: An existing task and update data
- When: updateTask() is called with allowed fields
- Then: Specified fields are updated
- And: updatedAt timestamp is refreshed
- And: Disallowed fields are ignored
- And: Updated task is returned

### Scenario 12: Task Retrieval
- Given: An existing task ID
- When: getTask() is called
- Then: Task object is returned
- When: Invalid ID is provided
- Then: undefined is returned

### Scenario 13: Task Listing with Filters
- Given: Multiple tasks with various properties
- When: listTasks() is called with status='in_progress'
- Then: Only in-progress tasks are returned
- When: Filtered by priority='high'
- Then: Only high priority tasks are returned
- When: Filtered by quadrant='urgent-important'
- Then: Only Do First tasks are returned
- When: Filtered by assignee='user123'
- Then: Only tasks assigned to user123 are returned
- When: Filtered by tags=['frontend', 'bug']
- Then: Only tasks with ALL specified tags are returned

### Scenario 14: Tasks Due Today
- Given: Tasks with various due dates
- And: Current date is 2024-03-15
- When: getDueToday() is called
- Then: Only tasks with dueDate of 2024-03-15 are returned
- When: Assignee filter is provided
- Then: Only matching assignee's due tasks are returned

### Scenario 15: Overdue Tasks
- Given: Tasks with past due dates and various statuses
- When: getOverdue() is called
- Then: Only tasks with dueDate < now are returned
- And: Tasks with status 'done' or 'archived' are excluded
- When: Assignee filter is provided
- Then: Only that assignee's overdue tasks are returned

### Scenario 16: Time Logging
- Given: An existing task with actualMinutes=0
- When: logTime() is called with 30 minutes
- Then: Task's actualMinutes becomes 30
- And: updatedAt timestamp is refreshed
- When: logTime() is called again with 15 minutes
- Then: Task's actualMinutes becomes 45 (accumulated)

### Scenario 17: Attachment Management
- Given: An existing task
- When: addAttachment() is called with fileId
- Then: File ID is added to attachments array
- And: Duplicate attachments are prevented
- When: removeAttachment() is called
- Then: File ID is removed from attachments
- And: Other attachments are preserved

### Scenario 18: Allowed Update Fields
- Given: An existing task
- When: updateTask() is called with various fields
- Then: Allowed fields are updated: title, description, status, priority
- And: Allowed fields include: urgent, important, dueDate, estimatedMinutes
- And: Allowed fields include: actualMinutes, tags, assignees
- And: Disallowed fields (id, createdAt, createdBy, quadrant) are ignored

## Performance Requirements

- PR1: Task creation completes in < 5ms
- PR2: Matrix organization is O(n) where n is total tasks
- PR3: Filtering by tags uses efficient set intersection
- PR4: Due/overdue queries filter before date comparison
- PR5: Subtask cascade deletion is O(m) where m is subtask count
- PR6: List operations with multiple filters apply most restrictive first

## Security Requirements

- SR1: Task IDs are generated internally with timestamp and random component
- SR2: Update operations respect field allowlists
- SR3: Subtask deletion requires parent task access
- SR4: Assignee arrays can only contain valid user ID strings
- SR5: Attachment operations validate task existence
