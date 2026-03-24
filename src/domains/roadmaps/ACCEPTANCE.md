# Roadmaps Domain Acceptance Criteria

## Functional Requirements

- FR1: System shall create learning roadmaps with nodes and metadata
- FR2: System shall update roadmap properties while preserving creation data
- FR3: System shall delete roadmaps and associated enrollments
- FR4: System shall enroll users in roadmaps with progress tracking
- FR5: System shall calculate user progress based on node completion
- FR6: System shall recommend next nodes based on prerequisites and status
- FR7: System shall filter roadmaps by category and difficulty
- FR8: System shall support hierarchical node dependencies

## Test Scenarios

### Scenario 1: Roadmap Creation
- Given: Valid roadmap data with title
- When: createRoadmap() is called
- Then: Roadmap is created with unique ID
- And: CreatedAt and updatedAt timestamps are set to current time
- And: Default values are applied for optional fields
- And: Nodes array defaults to empty
- And: Difficulty defaults to 'beginner'

### Scenario 2: Roadmap Creation Validation
- Given: Invalid roadmap creation data
- When: Title is missing, empty, or not a string
- Then: Error is thrown: "Roadmap title is required"

### Scenario 3: Roadmap Retrieval
- Given: An existing roadmap ID
- When: getRoadmap() is called with the ID
- Then: Roadmap object is returned with all properties
- When: Invalid ID type is provided
- Then: undefined is returned
- When: Non-existent ID is provided
- Then: undefined is returned

### Scenario 4: Roadmap Update
- Given: An existing roadmap and update data
- When: updateRoadmap() is called with allowed fields
- Then: Specified fields are updated
- And: updatedAt timestamp is refreshed
- And: createdAt, id, and createdBy remain unchanged
- And: Updated roadmap is returned

### Scenario 5: Update Field Restrictions
- Given: An existing roadmap and update data with disallowed fields
- When: updateRoadmap() is called with id, createdAt, or createdBy
- Then: Disallowed fields are ignored
- And: Only allowed fields (title, description, category, nodes, difficulty, tags) are updated

### Scenario 6: Roadmap Deletion
- Given: An existing roadmap with user enrollments
- When: deleteRoadmap() is called
- Then: Roadmap is removed
- And: All enrollments for this roadmap are cleaned up
- And: Method returns true if roadmap existed
- And: Method returns false if roadmap didn't exist

### Scenario 7: User Enrollment
- Given: A valid roadmap ID and user ID
- When: enrollUser() is called
- Then: Enrollment record is created
- And: All nodes are initialized with 'not_started' status
- And: Progress percent starts at 0
- And: enrolledAt and lastAccessedAt timestamps are set

### Scenario 8: Duplicate Enrollment Prevention
- Given: A user already enrolled in a roadmap
- When: enrollUser() is called for same user and roadmap
- Then: Error is thrown: "User {userId} is already enrolled in roadmap {roadmapId}"

### Scenario 9: Enrollment for Non-existent Roadmap
- Given: An invalid roadmap ID
- When: enrollUser() is called
- Then: Error is thrown: "Roadmap not found: {roadmapId}"

### Scenario 10: Progress Calculation
- Given: An enrolled user with some completed nodes
- When: getProgress() is called
- Then: Progress percent is calculated: (completed / total) * 100
- And: Completed and total node counts are returned
- And: lastAccessedAt is updated to current time
- And: All node statuses are included

### Scenario 11: Progress for Non-enrolled User
- Given: A user not enrolled in a roadmap
- When: getProgress() is called
- Then: Error is thrown: "User {userId} is not enrolled in roadmap {roadmapId}"

### Scenario 12: Node Status Update
- Given: An enrolled user and valid node ID
- When: updateNodeStatus() is called with status 'completed'
- Then: Node status is updated in enrollment record
- And: lastAccessedAt is refreshed
- And: Updated enrollment is returned

### Scenario 13: Invalid Node Status
- Given: An enrolled user and node ID
- When: updateNodeStatus() is called with invalid status
- Then: Error is thrown: "Invalid status: {status}"
- And: Valid statuses are: 'not_started', 'in_progress', 'completed'

### Scenario 14: Node Recommendations
- Given: An enrolled user with some completed nodes
- And: Nodes with unmet prerequisites, met prerequisites, and in-progress
- When: recommendNext() is called
- Then: Only nodes with met prerequisites are recommended
- And: In-progress nodes have highest priority (80)
- And: Foundation nodes (no prereqs) have priority 70
- And: Assessment nodes have priority 60
- And: Other available nodes have priority 50

### Scenario 15: Recommendations Without Roadmap Filter
- Given: A user enrolled in multiple roadmaps
- When: recommendNext() is called without roadmapId
- Then: Recommendations from all enrolled roadmaps are returned
- And: Results are sorted by priority descending
- And: Each recommendation includes roadmapId reference

### Scenario 16: Recommendations for Non-enrolled User
- Given: A user not enrolled in specified roadmap
- When: recommendNext() is called with that roadmapId
- Then: Empty array is returned
- And: No error is thrown

### Scenario 17: Roadmap Listing with Filters
- Given: Multiple roadmaps with various categories and difficulties
- When: listRoadmaps() is called with category='programming'
- Then: Only roadmaps with that category are returned
- When: listRoadmaps() is called with difficulty='advanced'
- Then: Only advanced roadmaps are returned
- When: Multiple filters are combined
- Then: Only roadmaps matching all filters are returned

### Scenario 18: User Enrollments Listing
- Given: A user enrolled in multiple roadmaps
- When: getUserEnrollments() is called
- Then: Array of enrollments is returned
- And: Each entry includes roadmap title and category
- And: Progress information is included

### Scenario 19: Prerequisite Validation
- Given: A node B that depends on node A
- And: Node A is not completed
- When: Recommendations are generated
- Then: Node B is not recommended
- When: Node A is marked completed
- And: Recommendations are regenerated
- Then: Node B becomes available for recommendation

## Performance Requirements

- PR1: Roadmap creation completes in < 10ms
- PR2: Progress calculation is O(n) where n is number of nodes
- PR3: Recommendation generation scales with number of available nodes
- PR4: User enrollment lookup uses composite key for O(1) access
- PR5: Roadmap listing with filters is O(n) where n is total roadmaps
- PR6: Node status updates are O(1) via direct key access

## Security Requirements

- SR1: User IDs are validated as strings
- SR2: Roadmap IDs are generated internally, not user-provided
- SR3: Update operations respect field allowlists
- SR4: Enrollment data is isolated between users
- SR5: Deletion cascades to prevent orphaned enrollment records
