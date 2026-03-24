# Thought Domain Acceptance Criteria

## Functional Requirements

- FR1: System shall record thoughts with content hash for integrity
- FR2: System shall link thoughts in a chain with previous hash references
- FR3: System shall build and maintain a Merkle tree for verification
- FR4: System shall verify chain integrity using hashes and Merkle root
- FR5: System shall generate Merkle proofs for individual records
- FR6: System shall filter thought chains by agent, session, tags, and date
- FR7: System shall export and import chain data in JSON format
- FR8: System shall provide chain statistics and metadata

## Test Scenarios

### Scenario 1: Thought Recording
- Given: Thought content and context with agent identifier
- When: recordThought() is called
- Then: Thought is stored with unique ID
- And: Timestamp is set to current time
- And: SHA-256 hash is calculated for thought content
- And: Previous hash references the last record (or zeros for first)
- And: Index is set to position in chain
- And: Merkle root is recalculated

### Scenario 2: Thought Recording Validation
- Given: Invalid thought recording data
- When: Thought content is missing or not a string
- Then: Error is thrown: "Thought content is required"
- When: Context is missing or agent is not a string
- Then: Error is thrown: "Context with agent identifier is required"

### Scenario 3: Chain Linking
- Given: An existing chain with records
- When: New thought is recorded
- Then: New record's previousHash matches previous record's hash
- And: New record's index equals previous index + 1
- And: Breaking the chain (modifying record) invalidates verification

### Scenario 4: Chain Retrieval
- Given: Multiple thought records from different agents
- When: getChain() is called without filters
- Then: All records are returned in order
- When: Filtered by agent='Agent-A'
- Then: Only records from Agent-A are returned
- When: Filtered by session='session-123'
- Then: Only records from that session are returned
- When: Filtered by tags=['decision']
- Then: Only records with matching tags are returned

### Scenario 5: Date Range Filtering
- Given: Records across multiple days
- When: getChain() is called with after='2024-03-01'
- Then: Only records after March 1st are returned
- When: Filtered with before='2024-03-15'
- Then: Only records before March 15th are returned
- When: Both after and before are specified
- Then: Only records in date range are returned

### Scenario 6: Single Thought Retrieval
- Given: A recorded thought with known ID
- When: getThought() is called with the ID
- Then: Matching thought record is returned
- When: Unknown ID is provided
- Then: undefined is returned

### Scenario 7: Chain Verification
- Given: A valid chain of thought records
- When: verifyChain() is called
- Then: Result valid=true is returned
- And: recordCount matches chain length
- And: errors array is empty
- And: rootHash matches current Merkle root

### Scenario 8: Tamper Detection
- Given: A valid chain
- When: A record's content is modified (simulating tampering)
- And: verifyChain() is called
- Then: Result valid=false is returned
- And: errors include hash mismatch message
- And: Merkle root mismatch is detected

### Scenario 9: Chain Link Verification
- Given: A valid chain
- When: A record's previousHash is modified
- And: verifyChain() is called
- Then: Result valid=false is returned
- And: errors include "broken chain link" message

### Scenario 10: Index Verification
- Given: A valid chain
- When: A record's index is modified to wrong value
- And: verifyChain() is called
- Then: Result valid=false is returned
- And: errors include "incorrect index" message

### Scenario 11: First Record Validation
- Given: A valid chain
- When: First record's previousHash is modified from zeros
- And: verifyChain() is called
- Then: Result valid=false is returned
- And: errors include "First record has incorrect previous hash"

### Scenario 12: Empty Chain Verification
- Given: An empty thought chain
- When: verifyChain() is called
- Then: Result valid=true is returned
- And: recordCount is 0
- And: errors array is empty

### Scenario 13: Merkle Proof Generation
- Given: A chain with multiple records
- When: getMerkleProof() is called with valid record ID
- Then: Array of sibling hashes is returned
- And: Proof can be used to verify record inclusion
- When: Invalid record ID is provided
- Then: null is returned

### Scenario 14: Merkle Proof Verification
- Given: A valid Merkle proof for a record
- When: verifyMerkleProof() is called with recordHash, proof, and root
- Then: Result is true for valid proof
- When: Proof is modified (tampered)
- And: verifyMerkleProof() is called
- Then: Result is false

### Scenario 15: Chain Statistics
- Given: A chain with records from multiple agents and tags
- When: getStats() is called
- Then: totalRecords count is accurate
- And: firstTimestamp is earliest record
- And: lastTimestamp is latest record
- And: agents object counts records per agent
- And: tags object counts occurrences per tag
- And: merkleRoot is current root hash

### Scenario 16: JSON Export
- Given: A chain with records
- When: exportToJSON() is called
- Then: Valid JSON string is returned
- And: Includes version, exportedAt, recordCount, merkleRoot
- And: Includes full records array
- When: Filters are provided
- Then: Only filtered records are exported

### Scenario 17: JSON Import
- Given: A valid JSON export string
- When: importFromJSON() is called with verify=true
- Then: Chain is populated with records
- And: Merkle root is restored
- And: Verification result is returned
- When: verify=false is passed
- Then: Records are imported without verification

### Scenario 18: Invalid JSON Import
- Given: An invalid JSON string or missing records array
- When: importFromJSON() is called
- Then: Error is thrown: "Invalid chain data: records array required"

### Scenario 19: Chain Clearing
- Given: A chain with records
- When: clear() is called
- Then: All records are removed
- And: merkleRoot is set to null
- And: getChain() returns empty array

### Scenario 20: Context Preservation
- Given: Thought recorded with context metadata
- When: Record is retrieved
- Then: Context.agent is preserved
- And: Context.session is preserved
- And: Context.tags array is preserved
- And: Context.metadata object is preserved

## Performance Requirements

- PR1: Thought recording completes in < 10ms for typical content
- PR2: Hash calculation uses SHA-256 for cryptographic security
- PR3: Merkle tree building is O(n log n) where n is chain length
- PR4: Chain verification is O(n) where n is chain length
- PR5: Merkle proof generation is O(log n)
- PR6: Filtering is O(n) with early termination optimizations
- PR7: Memory usage scales linearly with chain length

## Security Requirements

- SR1: All hashes use SHA-256 for collision resistance
- SR2: Chain immutability is enforced through hash linking
- SR3: Tampering is detectable through verification
- SR4: Merkle proofs provide inclusion verification without full chain
- SR5: JSON export preserves all cryptographic evidence
- SR6: Thought content is hashed, not encrypted (integrity not confidentiality)
