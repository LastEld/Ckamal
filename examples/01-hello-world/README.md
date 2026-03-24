# 01 - Hello World

> **Difficulty:** ⭐ Beginner  
> **Time:** 5 minutes

## Overview

This example demonstrates the simplest possible CogniMesh program - initializing and booting the BIOS.

## Concepts Covered

- Creating a `CogniMeshBIOS` instance
- Boot sequence execution
- System state checking
- Graceful shutdown

## The Code

### hello.js

The hello world example shows the fundamental BIOS lifecycle:

1. **Import** the BIOS class from the core module
2. **Instantiate** a new BIOS object
3. **Boot** the system with optional configuration
4. **Check** system status
5. **Shutdown** gracefully

## Key APIs

### `CogniMeshBIOS.constructor()`
Creates a new BIOS instance. No arguments required.

### `CogniMeshBIOS.boot(options)`
Executes the boot sequence:
- Phase 1: Load configuration
- Phase 2: Initialize core subsystems
- Phase 3: Run diagnostics (optional)
- Phase 4: Enter operational mode

Options:
- `configPath` - Path to configuration file
- `skipDiagnostics` - Skip diagnostic checks (default: false)

### `CogniMeshBIOS.getStatus()`
Returns comprehensive system status including:
- BIOS version
- Current state
- Uptime
- Registered components
- Health status

### `CogniMeshBIOS.shutdown(options)`
Gracefully shuts down the system:
- Shuts down all registered components
- Cleans up resources
- Emits shutdown events

Options:
- `force` - Force immediate shutdown (default: false)

## Expected Output

```
[CogniMesh v5.0] Hello World Example
=====================================

[BIOS] Boot started (v5.0.0)
[BIOS] Boot completed in 12ms

✅ BIOS Boot Successful!

System Status:
{
  "version": "5.0.0",
  "state": "OPERATIONAL",
  "uptime": 15,
  "bootTime": "2026-03-23T15:27:31.456Z",
  "components": ["monitor"],
  "health": { ... },
  "config": { ... }
}

[BIOS] Shutting down...

✅ Goodbye!
```

## Next Steps

Now that you understand the basic BIOS lifecycle, move on to:

- [02-basic-usage](../02-basic-usage/) - Learn server setup and tool execution
