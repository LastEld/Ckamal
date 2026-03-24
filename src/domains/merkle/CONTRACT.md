# Merkle Domain Contract

## Overview
The Merkle Domain provides cryptographic tree structures for efficient data verification using SHA-256 hashing.

## Classes

### MerkleTree

Implements a Merkle tree for cryptographic verification of data integrity.

#### Methods

##### `build(leaves)`
Builds the Merkle tree from leaf data.

**Parameters:**
- `leaves` (string[]): Array of leaf data strings

**Returns:** (MerkleTree) This instance for method chaining

**Throws:**
- Error if leaves is not an array

---

##### `getRoot()`
Gets the Merkle root hash.

**Returns:** (string|null) Hex-encoded root hash or null if tree is empty

---

##### `generateProof(leaf)`
Generates a Merkle proof for a leaf.

**Parameters:**
- `leaf` (string): Original leaf data

**Returns:** (MerkleProof|null) Proof object or null if leaf not found

**MerkleProof Object:**
- `leaf` (string): Hash of the leaf
- `root` (string): Expected root hash
- `siblings` (string[]): Sibling hashes along the path
- `indices` (number[]): Path indices (0=left, 1=right)

---

##### `verifyProof(proof)`
Verifies a proof against the current tree root.

**Parameters:**
- `proof` (MerkleProof): Proof to verify

**Returns:** (boolean) True if proof is valid

---

##### `verifyProofStatic(proof, root, leaf)`
Static method to verify a proof against any root.

**Parameters:**
- `proof` (MerkleProof): Proof object
- `root` (string): Expected root hash
- `leaf` (string): Original leaf data

**Returns:** (boolean) True if proof is valid

---

##### `getLeafCount()`
Gets the number of leaves.

**Returns:** (number) Leaf count

---

##### `getHeight()`
Gets the tree height.

**Returns:** (number) Tree height

## Usage Example

```javascript
import { MerkleTree } from './index.js';

const tree = new MerkleTree();
const leaves = ['a', 'b', 'c', 'd'];

tree.build(leaves);
const root = tree.getRoot();

const proof = tree.generateProof('a');
const isValid = MerkleTree.verifyProofStatic(proof, root, 'a');
```
