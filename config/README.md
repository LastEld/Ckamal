# CogniMesh Configuration

## Overview

This directory contains configuration files for the CogniMesh system.

## Files

### `default.json`
Default configuration used in development environment.
- **server.port**: HTTP server port (default: 3000)
- **database.path**: SQLite database file path
- **bios.mode**: BIOS operation mode
- **logging.level**: Log level (debug, info, warn, error)

### `production.json.example`
Example production configuration. Copy to `production.json` and customize:
```bash
cp production.json.example production.json
```

**WARNING**: `production.json` is git-ignored. Never commit sensitive values.

## Environment Loading Order

1. `default.json` - base configuration
2. `production.json` or `{NODE_ENV}.json` - environment-specific overrides
3. Environment variables - final overrides
4. `config/*.local.*` - local overrides (git-ignored)

## Environment Variables

Any config value can be overridden via environment variables using `COGNIMESH_` prefix:

```bash
COGNIMESH_SERVER_PORT=8080
COGNIMESH_DATABASE_PATH=/custom/path/db.sqlite
```
