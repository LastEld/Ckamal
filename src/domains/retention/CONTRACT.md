# Retention Domain Contract

## Overview

The Retention Domain manages data lifecycle policies including archiving and purging based on configurable age thresholds.

## Responsibilities

1. **Policy Management**: Define retention policies per data type
2. **Data Archival**: Move aged data to appropriate storage tiers
3. **Data Purging**: Permanently delete data beyond retention limits
4. **Audit Trail**: Track all archive and purge operations

## Policy Configuration

```javascript
{
  archiveAge: number,    // Days before archiving (default: 90)
  purgeAge: number,      // Days before purging (default: 365)
  storageTier: string,   // hot | warm | cold (default: warm)
  compress: boolean      // Compress archives (default: true)
}
```

## Constraints

- `purgeAge` must be greater than `archiveAge`
- All operations are logged for compliance
- Archives are stored with tier-specific paths
- Compressed archives use standard compression

## Events

- `retention:archived` - Emitted when data is archived
- `retention:purged` - Emitted when data is purged
- `retention:policy-set` - Emitted when policy is configured

## Error Handling

| Error Code | Description |
|------------|-------------|
| INVALID_DATATYPE | dataType must be non-empty string |
| INVALID_CONFIG | config must be valid object |
| INVALID_AGE | age must be non-negative number |
| INVALID_POLICY | purgeAge must exceed archiveAge |

## Integration Points

- Storage Layer: Archive destinations
- Audit Domain: Operation logging
- Scheduler: Policy application triggers
