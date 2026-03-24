# Merkle Domain Architecture

## Overview

The Merkle Domain implements a binary hash tree structure for efficient and secure verification of data integrity.

## Architecture Diagram

```
                    Root (Hash)
                        │
           ┌────────────┴────────────┐
           │                         │
    Node 0-1 (Hash)           Node 2-3 (Hash)
           │                         │
     ┌─────┴─────┐             ┌─────┴─────┐
     │           │             │           │
 Leaf[0]    Leaf[1]       Leaf[2]    Leaf[3]
  "a"         "b"          "c"         "d"
```

## Components

### MerkleTree Class

```
┌─────────────────────────────────────┐
│          MerkleTree                 │
├─────────────────────────────────────┤
│ - leaves: string[]                  │
│ - layers: string[][]                │
│ - root: string|null                 │
├─────────────────────────────────────┤
│ + build(leaves): MerkleTree         │
│ + getRoot(): string|null            │
│ + generateProof(leaf): MerkleProof  │
│ + verifyProof(proof): boolean       │
│ + verifyProofStatic(p,r,l): boolean │
│ + getLeafCount(): number            │
│ + getHeight(): number               │
├─────────────────────────────────────┤
│ - _hash(data): string               │
│ - _combineHashes(l,r): string       │
│ - _findLeafIndex(h): number         │
└─────────────────────────────────────┘
```

## Data Flow

### Building the Tree

```
Input: ["a", "b", "c", "d"]
       │
       ▼
Hash Leaves: [H("a"), H("b"), H("c"), H("d")]
       │
       ▼
Build Layer 1: [H(Ha+Hb), H(Hc+Hd)]
       │
       ▼
Build Layer 2 (Root): [H(Hab+Hcd)]
       │
       ▼
Output: Root Hash
```

### Generating a Proof

```
Input: Leaf "a"
       │
       ▼
Find Index: leaves.indexOf(H("a")) = 0
       │
       ▼
Traverse Up:
  Level 0: sibling = leaves[1] = H("b"), index = 0 (left)
  Level 1: sibling = nodes[1] = H(Hc+Hd), index = 0 (left)
       │
       ▼
Output: { leaf: Ha, siblings: [Hb, Hcd], indices: [0, 0], root: Root }
```

### Verifying a Proof

```
Input: Proof + Root + Leaf
       │
       ▼
hash = H(leaf)
       │
       ▼
For each sibling:
  if index == 0: hash = H(hash + sibling)
  if index == 1: hash = H(sibling + hash)
       │
       ▼
Compare: hash == root ?
       │
       ▼
Output: boolean
```

## Algorithm Details

### Hashing Strategy

- **Algorithm**: SHA-256 (via Node.js crypto)
- **Encoding**: Hexadecimal string output
- **Combination**: Parent = Hash(Left + Right)

### Handling Odd Leaves

When the number of nodes in a layer is odd:
```
Before: [A, B, C]
After:  [A, B, C, C]  // Duplicate last element
Pairs:  [(A,B), (C,C)]
```

### Proof Path Encoding

- `indices[i] = 0`: Current hash is left sibling
- `indices[i] = 1`: Current hash is right sibling

## Security Considerations

1. **Collision Resistance**: SHA-256 provides strong collision resistance
2. **Second Preimage Resistance**: Hard to find different leaf with same root
3. **Proof Binding**: Proof commits to both leaf value and tree structure

## Performance Characteristics

| Operation | Time Complexity | Space Complexity |
|-----------|-----------------|------------------|
| Build     | O(n)           | O(n)            |
| getRoot   | O(1)           | O(1)            |
| generateProof | O(log n)   | O(log n)        |
| verifyProof | O(log n)     | O(1)            |

## Dependencies

- Node.js `crypto` module for SHA-256
- ES Modules for module system
