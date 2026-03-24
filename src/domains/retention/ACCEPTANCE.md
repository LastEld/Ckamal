# Retention Domain Acceptance Criteria

## Functional Requirements

- FR1: System shall configure retention policies per data type
- FR2: System shall enforce archive age thresholds
- FR3: System shall enforce purge age thresholds (must be > archive age)
- FR4: System shall apply all configured policies on demand
- FR5: System shall track archive history per data type
- FR6: System shall maintain purge logs with timestamps
- FR7: System shall support configurable storage tiers
- FR8: System shall support compression options for archives

## Test Scenarios

### Scenario 1: Policy Configuration
- Given: A data type 'logs' and configuration object
- When: setPolicy() is called with archiveAge=90, purgeAge=365
- Then: Policy is stored for data type 'logs'
- And: Default values are applied for unspecified options
- And: Policy includes storageTier and compress settings

### Scenario 2: Default Policy Values
- Given: Minimal policy configuration (only dataType provided)
- When: setPolicy() is called with empty config
- Then: archiveAge defaults to 90 days
- And: purgeAge defaults to 365 days
- And: storageTier defaults to 'warm'
- And: compress defaults to true

### Scenario 3: Invalid Policy Configuration
- Given: Invalid policy parameters
- When: dataType is empty, null, or not a string
- Then: Error is thrown: "dataType must be a non-empty string"
- When: config is null or not an object
- Then: Error is thrown: "config must be a valid object"
- When: purgeAge <= archiveAge
- Then: Error is thrown: "purgeAge must be greater than archiveAge"

### Scenario 4: Policy Retrieval
- Given: Multiple configured policies
- When: listPolicies() is called
- Then: Object with all policies is returned
- And: Each policy includes archiveAge, purgeAge, storageTier, compress
- And: Return value is a plain object (not Map)

### Scenario 5: Data Archiving
- Given: A data type with configured policy
- When: archive() is called with dataType and age threshold
- Then: Archive operation is performed for data older than age days
- And: Archive record includes dataType, archivedAt, recordCount, location
- And: Location includes storageTier and date-based path
- And: Compressed flag is set from policy
- And: Archive record is stored in history

### Scenario 6: Archive Age Validation
- Given: Invalid archive parameters
- When: dataType is empty, null, or not a string
- Then: Error is thrown: "dataType must be a non-empty string"
- When: age is negative or not a number
- Then: Error is thrown: "age must be a non-negative number"

### Scenario 7: Data Purging
- Given: A data type with configured policy
- When: purge() is called with dataType and age threshold
- Then: Purge operation is performed for data older than age days
- And: Purge record includes dataType, purgedAt, deletedCount, cutoffDate
- And: Record is added to purge log

### Scenario 8: Purge Age Validation
- Given: Invalid purge parameters
- When: dataType is empty, null, or not a string
- Then: Error is thrown: "dataType must be a non-empty string"
- When: age is negative or not a number
- Then: Error is thrown: "age must be a non-negative number"

### Scenario 9: Apply All Policies
- Given: Policies configured for 'logs', 'metrics', and 'events'
- When: applyPolicies() is called
- Then: Archive is attempted for each data type using archiveAge
- And: Purge is attempted for each data type using purgeAge
- And: Results include arrays for archived, purged, and errors
- And: Each result entry includes dataType and operation details
- And: Errors in one data type don't stop processing others

### Scenario 10: Archive History Retrieval
- Given: Multiple archive operations for data type 'logs'
- When: getArchiveHistory('logs') is called
- Then: Array of all archive records for 'logs' is returned
- And: Records include timestamps and metadata
- When: getArchiveHistory() is called for unknown data type
- Then: Empty array is returned

### Scenario 11: Purge Log Retrieval
- Given: Multiple purge operations have been performed
- When: getPurgeLog() is called
- Then: Array of all purge records is returned
- And: Records are in chronological order
- And: Each record includes dataType, purgedAt, deletedCount
- And: Returned array is a copy (modifications don't affect internal log)

### Scenario 12: Cutoff Date Calculation
- Given: Current date is 2024-03-15
- When: Archive is called with age=30
- Then: Cutoff date is calculated as 2024-02-14
- And: Cutoff date is stored in ISO format in records
- And: Only data older than cutoff is affected

### Scenario 13: Storage Tier Configuration
- Given: Policy with storageTier='cold' for data type 'backups'
- When: Archive is performed
- Then: Archive location includes 'cold' tier indicator
- And: Storage tier affects archival path structure

### Scenario 14: Compression Configuration
- Given: Policy with compress=false for data type 'images'
- When: Archive is performed
- Then: Archive record indicates compressed=false
- And: Archive process skips compression step

### Scenario 15: Empty Data Type Handling
- Given: No data to archive/purge for a data type
- When: Archive or purge operation completes
- Then: recordCount or deletedCount is 0
- And: Operation completes without errors
- And: Record is still added to history/log

## Performance Requirements

- PR1: Policy retrieval (listPolicies) is O(n) where n is number of policies
- PR2: Archive operation scales with amount of data to archive
- PR3: Purge operation scales with amount of data to delete
- PR4: applyPolicies processes data types sequentially to prevent resource exhaustion
- PR5: Archive history retrieval is O(1) via Map lookup
- PR6: Memory usage for logs is bounded (consider retention for logs themselves)

## Security Requirements

- SR1: Data type names are validated to prevent injection
- SR2: Archive locations are scoped to data type
- SR3: Purge operations are logged for audit purposes
- SR4: Policy modifications don't affect in-progress operations
- SR5: Archive records don't contain actual data content (metadata only)
