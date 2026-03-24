# 02 - Basic Usage

> **Difficulty:** ⭐ Beginner  
> **Time:** 10 minutes

## Overview

This example demonstrates server setup, tool registration, and tool execution - the core operations of a CogniMesh system.

## Concepts Covered

- Creating and configuring a `CogniMeshServer`
- Server initialization lifecycle
- Tool registry operations
- Executing system tools
- Health checking

## Files

### server-setup.js
Demonstrates the full server initialization sequence:
1. Configuration loading
2. BIOS initialization
3. Database setup
4. Tool registry initialization
5. HTTP server startup
6. Graceful shutdown

### tool-execution.js
Shows how to execute tools and handle results:
1. System health checks
2. Metrics retrieval
3. Configuration management
4. Error handling

## Key APIs

### `CogniMeshServer.constructor(options)`
Creates a new server instance with optional configuration.

Options:
- `config` - Direct configuration object
- `skipDiagnostics` - Skip BIOS diagnostics

### `CogniMeshServer.initialize()`
Initializes all server components in sequence:
1. Configuration loading
2. BIOS initialization
3. Database connection pool
4. Migrations
5. Repositories
6. Tool registry
7. Controller
8. HTTP server
9. WebSocket server

### `CogniMeshServer.start()`
Starts the HTTP server and begins accepting connections.

### `CogniMeshServer.tools`
Access to the tool registry:
- `tools.list()` - List all registered tools
- `tools.execute(name, params, context)` - Execute a tool
- `tools.count` - Number of registered tools

### `CogniMeshServer.getHealth()`
Returns comprehensive health status of all components.

## Expected Output (server-setup.js)

```
[CogniMesh v5.0] Server Setup Example
======================================

[Server] Initializing CogniMesh Server...
[Config] Loading configuration...
[Config] Configuration loaded successfully
[Config] Environment: development
[BIOS] Initializing...
[BIOS] Boot started (v5.0.0)
[BIOS] Boot completed in 15ms
[Database] Initializing connection pool...
[Database] Pool initialized with 5 connections
[Migrations] Running pending migrations...
[Tools] Initializing registry...
[Tools] Registered 25 tools
[HTTP] Server initialized on localhost:3000
[Server] HTTP server listening on http://localhost:3000

✅ Server is running!

Health Status: ✅ HEALTHY

Server Info:
- Status: running
- Version: 5.0.0
- Uptime: 1s
- Tools: 25

[WebSocket] Stopping server...
[HTTP] Closing server...
[BIOS] Shutting down...
✅ Server stopped gracefully
```

## Expected Output (tool-execution.js)

```
[CogniMesh v5.0] Tool Execution Example
========================================

[Server] Initializing...
...
✅ Server initialized

--- Available Tools ---
Found 25 registered tools:
  1. system_health - Get comprehensive system health status
  2. system_metrics - Get real-time system metrics
  3. system_config_get - Retrieve system configuration values
  ...

--- Executing Tools ---

Tool: system_health
Result: {
  "overall": "healthy",
  "components": [],
  "uptime": 86400,
  "version": "5.0.0"
}

Tool: system_metrics
Result: {
  "cpu": { "usage": 0, "cores": 4 },
  "memory": { "used": 0, "total": 0, "percentage": 0 },
  ...
}

✅ All tools executed successfully
```

## Next Steps

Now that you understand server setup and tool execution:

- [03-agent-orchestration](../03-agent-orchestration/) - Learn agent spawning and task delegation
