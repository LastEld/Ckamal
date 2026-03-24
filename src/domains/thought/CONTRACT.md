# Thought Domain Contract

## Overview

The Thought Domain provides thought audit capabilities with cryptographic chain verification using Merkle trees. It ensures integrity of thought records through hash linking and supports Merkle proof generation.

## Classes

### ThoughtChain

Implements an immutable chain of thought records with cryptographic verification.

#### Constructor

##### `constructor(merkleTree?)`

Creates a new ThoughtChain instance.

**Parameters:**
- `merkleTree` (MerkleTree): Optional MerkleTree instance for verification

---

#### Methods

##### `recordThought(content, context)`

Records a new thought in the chain.

**Parameters:**
- `content` (string): **Required.** Thought content
- `context` (ThoughtContext): **Required.** Context metadata
  - `agent` (string): **Required.** Agent identifier
  - `session` (string): Optional session ID
  - `tags` (string[]): Optional tag array
  - `metadata` (Record<string, any>): Optional additional metadata

**Returns:** (ThoughtRecord) Created record with hash and index

**Throws:**
- Error: "Thought content is required" if content is missing or not a string
- Error: "Context with agent identifier is required" if context or agent is invalid

---

##### `getChain(filters?)`

Retrieves thought records with optional filtering.

**Parameters:**
- `filters` (ChainFilters): Optional filter criteria
  - `agent` (string): Filter by agent
  - `session` (string): Filter by session
  - `tags` (string[]): Filter by tags (any match)
  - `after` (string): ISO date - records after this time
  - `before` (string): ISO date - records before this time

**Returns:** (ThoughtRecord[]) Array of matching records in chronological order

---

##### `getThought(id)`

Retrieves a single thought by ID.

**Parameters:**
- `id` (string): Thought record ID

**Returns:** (ThoughtRecord|undefined) Record or undefined if not found

---

##### `verifyChain()`

Verifies the integrity of the entire chain.

**Returns:** (VerificationResult) Verification outcome

**VerificationResult Object:**
- `valid` (boolean): True if chain is valid
- `recordCount` (number): Number of records checked
- `rootHash` (string|null): Current Merkle root hash
- `errors` (string[]): Array of error messages if invalid

**Validation Checks:**
- Hash integrity: Each record's hash matches content
- Chain linking: Each record's previousHash matches previous record
- Index continuity: Indices are sequential starting from 0
- First record: Has previousHash of zeros
- Merkle root: Matches recomputed root

---

##### `getMerkleProof(recordId)`

Generates a Merkle proof for a specific record.

**Parameters:**
- `recordId` (string): Record ID to generate proof for

**Returns:** (MerkleProof|null) Proof object or null if record not found

**MerkleProof Object:**
- `leaf` (string): Hash of the record
- `root` (string): Expected Merkle root
- `siblings` (string[]): Sibling hashes along the path
- `indices` (number[]): Path indices (0=left, 1=right)

---

##### `verifyMerkleProof(recordHash, proof, root)`

Static method to verify a Merkle proof.

**Parameters:**
- `recordHash` (string): Hash of the record
- `proof` (MerkleProof): Proof object
- `root` (string): Expected Merkle root

**Returns:** (boolean) True if proof is valid

---

##### `getStats()`

Gets statistics about the chain.

**Returns:** (ChainStats) Statistics object

**ChainStats Object:**
- `totalRecords` (number): Total record count
- `firstTimestamp` (string|null): Earliest record timestamp
- `lastTimestamp` (string|null): Latest record timestamp
- `agents` (Record<string, number>): Count per agent
- `tags` (Record<string, number>): Tag occurrence counts
- `merkleRoot` (string|null): Current root hash

---

##### `exportToJSON(filters?)`

Exports chain data to JSON format.

**Parameters:**
- `filters` (ChainFilters): Optional filters for selective export

**Returns:** (string) JSON string with export data

**Export Format:**
```json
{
  "version": "1.0",
  "exportedAt": "2024-03-15T10:30:00Z",
  "recordCount": 100,
  "merkleRoot": "abc123...",
  "records": [...]
}
```

---

##### `importFromJSON(json, verify?)`

Imports chain data from JSON.

**Parameters:**
- `json` (string): JSON string to import
- `verify` (boolean): Whether to verify after import (default: true)

**Returns:** (VerificationResult) Import result with verification status

**Throws:**
- Error: "Invalid chain data: records array required" if JSON is invalid

---

##### `clear()`

Clears all records from the chain.

**Returns:** (void)

## Types

### ThoughtRecord

```typescript
interface ThoughtRecord {
  id: string;                    // Unique record ID
  index: number;                 // Position in chain (0-based)
  content: string;               // Thought content
  contentHash: string;           // SHA-256 hash of content
  previousHash: string;          // Hash of previous record (zeros for first)
  timestamp: string;             // ISO timestamp
  context: ThoughtContext;       // Context metadata
}
```

### ThoughtContext

```typescript
interface ThoughtContext {
  agent: string;                 // Agent identifier
  session?: string;              // Session ID
  tags?: string[];               // Tag array
  metadata?: Record<string, any>; // Additional metadata
}
```

### ThoughtChain

```typescript
interface ThoughtChain {
  records: ThoughtRecord[];      // Array of thought records
  merkleRoot: string | null;     // Current Merkle root hash
}
```

## Integration

### Merkle Domain

The Thought Domain integrates with the Merkle Domain for cryptographic verification:
- Uses `MerkleTree` class for building and maintaining the tree
- Delegates proof generation and verification to Merkle Domain
- Merkle root represents the entire chain's integrity

### Chain Security

- Each record's `contentHash` is SHA-256 of content
- `previousHash` creates cryptographic link to previous record
- Modifying any record invalidates the chain verification
- Merkle proofs allow verification without exposing full chain

## Usage Example

```javascript
import { ThoughtChain } from './index.js';
import { MerkleTree } from '../merkle/index.js';

const merkleTree = new MerkleTree();
const chain = new ThoughtChain(merkleTree);

// Record thoughts
const record1 = chain.recordThought(
  'Analyzing user requirements',
  { agent: 'Agent-A', session: 'session-123', tags: ['analysis'] }
);

const record2 = chain.recordThought(
  'Designing system architecture',
  { agent: 'Agent-A', session: 'session-123', tags: ['design'] }
);

// Chain linking
console.log(record2.previousHash === record1.contentHash); // true
console.log(record2.index === record1.index + 1); // true

// Verify chain integrity
const result = chain.verifyChain();
console.log(result.valid); // true
console.log(result.rootHash); // Merkle root

// Get Merkle proof
const proof = chain.getMerkleProof(record1.id);
const isValid = ThoughtChain.verifyMerkleProof(
  record1.contentHash,
  proof,
  result.rootHash
);

// Filter chain
const agentRecords = chain.getChain({ agent: 'Agent-A' });
const taggedRecords = chain.getChain({ tags: ['design'] });

// Export/Import
const json = chain.exportToJSON();
const newChain = new ThoughtChain();
newChain.importFromJSON(json);
```

## Acceptance Criteria

### Functional Requirements

- FR1: System shall record thoughts with content hash for integrity
- FR2: System shall link thoughts in a chain with previous hash references
- FR3: System shall build and maintain a Merkle tree for verification
- FR4: System shall verify chain integrity using hashes and Merkle root
- FR5: System shall generate Merkle proofs for individual records
- FR6: System shall filter thought chains by agent, session, tags, and date
- FR7: System shall export and import chain data in JSON format
- FR8: System shall provide chain statistics and metadata

### Performance Requirements

- PR1: Thought recording completes in < 10ms for typical content
- PR2: Hash calculation uses SHA-256 for cryptographic security
- PR3: Merkle tree building is O(n log n) where n is chain length
- PR4: Chain verification is O(n) where n is chain length
- PR5: Merkle proof generation is O(log n)
- PR6: Filtering is O(n) with early termination optimizations
- PR7: Memory usage scales linearly with chain length

### Security Requirements

- SR1: All hashes use SHA-256 for collision resistance
- SR2: Chain immutability is enforced through hash linking
- SR3: Tampering is detectable through verification
- SR4: Merkle proofs provide inclusion verification without full chain
- SR5: JSON export preserves all cryptographic evidence
- SR6: Thought content is hashed, not encrypted (integrity not confidentiality)
