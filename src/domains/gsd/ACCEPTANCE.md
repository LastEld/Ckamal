# GSD (Get Sh*t Done) Domain Acceptance Criteria

## Functional Requirements

- FR1: System shall create workflows with validation
- FR2: System shall execute workflows with dependency resolution
- FR3: System shall support task retry with exponential backoff
- FR4: System shall allow workflow cancellation with cleanup
- FR5: System shall enforce concurrent workflow limits
- FR6: System shall provide progress tracking and status updates
- FR7: System shall support workflow timeouts
- FR8: System shall emit events for all workflow state changes

## Test Scenarios

### Scenario 1: Workflow Creation
- Given: Valid workflow type and task definitions
- When: createWorkflow() is called
- Then: Workflow is validated using WorkflowValidator
- And: Validation errors throw with descriptive messages
- And: Tasks get default status 'pending' and retry count 0
- And: Task IDs are auto-generated if not provided
- And: Dependencies are preserved from task definitions
- And: Event 'workflowCreated' is emitted with workflow details

### Scenario 2: Sequential Workflow Execution
- Given: A workflow with 3 sequential tasks
- When: executeWorkflow() is called
- Then: Tasks execute in order (task-0, task-1, task-2)
- And: Each task receives context from previous task results
- And: Workflow state tracks current step and results
- And: Progress events are emitted for each task completion

### Scenario 3: Dependency Resolution
- Given: A workflow where task B depends on task A
- When: Workflow execution reaches task B
- Then: Execution waits for task A to complete
- And: Task B only starts after task A status is 'completed'
- And: Task B receives task A's result in context

### Scenario 4: Task Retry with Exponential Backoff
- Given: A task configured with maxRetries=3
- When: Task execution fails
- Then: Retry is attempted after 1 second delay
- And: Second retry waits 2 seconds
- And: Third retry waits 4 seconds (capped at 10s)
- And: Retry count is tracked on task object
- And: Final failure returns error after all retries exhausted

### Scenario 5: Workflow Timeout
- Given: A workflow with long-running tasks
- When: executeWorkflow() is called with timeout=5000ms
- Then: Workflow aborts if not completed within 5 seconds
- And: AbortError is thrown with timeout message
- And: Currently running task is cancelled
- And: Workflow status is set to 'failed'

### Scenario 6: Workflow Cancellation
- Given: A running workflow
- When: cancelWorkflow() is called with reason
- Then: AbortController triggers cancellation
- And: Running tasks are marked 'cancelled'
- And: Workflow status changes to 'cancelled'
- And: Event 'workflowCancelled' is emitted with reason
- And: Workflow is removed from runningWorkflows set

### Scenario 7: Concurrent Workflow Limit
- Given: maxConcurrent is set to 2
- And: Two workflows are already running
- When: Third workflow execution is attempted
- Then: Error is thrown: "Max concurrent workflows (2) reached"
- And: Third workflow remains in 'created' status
- And: Execution can be retried after a workflow completes

### Scenario 8: Continue on Error
- Given: A workflow with continueOnError=true
- And: Task 2 of 3 will fail
- When: Workflow is executed
- Then: Task 1 completes successfully
- And: Task 2 fails but execution continues
- And: Task 3 executes normally
- And: Workflow completes with 'completed' status
- And: Failed task error is stored in task object

### Scenario 9: Stop on Error (Default)
- Given: A workflow with continueOnError=false (default)
- And: Task 2 of 3 will fail
- When: Workflow is executed
- Then: Task 1 completes successfully
- And: Task 2 fails and throws error
- And: Task 3 never executes
- And: Workflow status is 'failed' with error details

### Scenario 10: Workflow Status Tracking
- Given: A workflow with multiple tasks
- When: getStatus() is called at various points
- Then: Status includes progress percentage (0-100)
- And: Status includes completedTasks and totalTasks counts
- And: Status includes currentTask ID when running
- And: Duration is calculated from startedAt timestamp

### Scenario 11: Workflow Listing and Filtering
- Given: Multiple workflows with different statuses and types
- When: listWorkflows() is called with filters
- Then: Status filter returns only matching workflows
- And: Type filter returns only matching workflow types
- And: Combined filters work correctly
- And: Results include status summary for each workflow

### Scenario 12: Completed Workflow Cleanup
- Given: Workflows in various statuses (completed, failed, running)
- When: clearCompleted() is called
- Then: Completed workflows are deleted
- And: Failed workflows are deleted
- And: Running workflows are preserved
- And: Method returns count of cleared workflows

### Scenario 13: Workflow Deletion
- Given: An existing workflow
- When: deleteWorkflow() is called
- Then: If workflow is running, it is cancelled first
- Then: Workflow is removed from storage
- And: Associated abort controller is cleaned up
- And: Method returns true if workflow existed

## Performance Requirements

- PR1: Workflow creation completes in < 10ms
- PR2: Task execution overhead is < 50ms per task
- PR3: Dependency wait polling interval is 100ms (configurable)
- PR4: Concurrent workflow limit prevents resource exhaustion
- PR5: Memory cleanup occurs when workflows are deleted/cleared
- PR6: Progress events are debounced to prevent UI flooding

## Security Requirements

- SR1: Task parameters are validated before execution
- SR2: Workflow types are restricted to allowed values
- SR3: Task results are isolated between workflows
- SR4: Cancellation cannot be triggered by unauthorized callers
- SR5: Workflow state mutations are internal only
