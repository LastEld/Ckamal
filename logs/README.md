# CogniMesh Logs Directory

## Overview

This directory contains runtime log files for the CogniMesh BIOS system.

## Structure

```
logs/
├── .gitkeep          # Keeps directory in git
├── .gitignore        # Log exclusion rules
├── README.md         # This file
├── error.log         # Error level logs
├── warn.log          # Warning level logs
├── info.log          # Info level logs
├── debug.log         # Debug level logs
└── combined.log      # All logs combined
```

## Log Levels

| Level   | Priority | Description                              |
|---------|----------|------------------------------------------|
| error   | 0        | System errors requiring immediate attention |
| warn    | 1        | Warnings about potential issues          |
| info    | 2        | General operational information          |
| debug   | 3        | Detailed debugging information           |

## Rotation Policy

- **Rotation trigger**: Daily at midnight
- **Retention period**: 14 days
- **Max file size**: 20MB per file
- **Archive format**: `logs/[level].log.YYYY-MM-DD`

## Log Format

```
[YYYY-MM-DD HH:mm:ss] [LEVEL] [context]: message
```

Example:
```
[2026-01-15 09:30:45] [INFO] [bios]: System initialized successfully
```

## Usage

```javascript
const logger = require('../src/utils/logger');

logger.error('Critical error occurred', { error });
logger.warn('Deprecation warning');
logger.info('Operation completed');
logger.debug('Debug details', { data });
```

## Security

- Log files may contain sensitive data
- Access restricted to service account
- Regular audit recommended
