# 05 - BIOS Console

> **Difficulty:** ⭐⭐ Intermediate  
> **Time:** 10 minutes

## Overview

This example demonstrates the interactive OperatorConsole for managing the CogniMesh BIOS system through command-line operations.

## Concepts Covered

- Console initialization
- Built-in commands
- Custom command registration
- Command history and completion
- System monitoring via console
- Event handling

## Files

### console-commands.sh
Shell script demonstrating common console commands and their usage.

## Key APIs

### OperatorConsole

#### `OperatorConsole.constructor(bios)`
Creates a new console instance attached to a BIOS.

#### `OperatorConsole.registerCommand(name, handler, description)`
Registers a custom command.

Parameters:
- `name` - Command name
- `handler` - Async function(args) to handle command
- `description` - Help text description

#### `OperatorConsole.execute(input)`
Executes a command string.

Returns: Command result object with `success`, `message`, `data` properties.

### Built-in Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `status` | Show system status | `status` |
| `agents list` | List all agents | `agents list` |
| `agents spawn` | Spawn new agent | `agents spawn <cv-id>` |
| `agents kill` | Kill an agent | `agents kill <agent-id>` |
| `clients` | Show client status | `clients` |
| `delegate` | Delegate task | `delegate --to=<client> --task="..."` |
| `parallel` | Parallel execution | `parallel --clients=a,b --task="..."` |
| `chain` | Chain tasks | `chain --steps='[...]'` |
| `update check` | Check for updates | `update check` |
| `update apply` | Apply updates | `update apply` |
| `patch create` | Create patch | `patch create <description>` |
| `patch verify` | Verify patch | `patch verify <id>` |
| `rollback` | Rollback version | `rollback <version>` |
| `logs` | Show system logs | `logs [--lines=N] [--level=info]` |
| `metrics` | Show metrics | `metrics` |
| `test` | Run tests | `test` |
| `help` | Show help | `help` |
| `exit` | Exit console | `exit` |

## Expected Output (console-commands.sh)

```bash
$ bash console-commands.sh

CogniMesh BIOS Console Commands Demo
=====================================

Starting BIOS and initializing console...
✅ BIOS booted
✅ Console initialized

=== System Status ===

┌─────────────────────────────────────────┐
│           SYSTEM STATUS                 │
├─────────────────────────────────────────┤
│  Version:    5.0.0                       │
│  Uptime:     5s                          │
│  Memory:     45.2 MB                     │
├─────────────────────────────────────────┤
│  Agents:     3/3                         │
│  Clients:    2/3                         │
└─────────────────────────────────────────┘

=== Agent Management ===

Spawning new agent: web-developer
✅ Agent sa-03 spawned with CV: web-developer

=== Task Delegation ===

✅ Task delegated to claude
   Task ID: task-1234567890

=== Update Check ===

Current Version: v5.0.0

Available Updates:
┌──────────┬─────────┬────────────────────────┬─────────────────────────┐
│ Version  │ Type    │ Description            │ Date                    │
├──────────┼─────────┼────────────────────────┼─────────────────────────┤
│ 5.1.0    │ minor   │ Performance improve... │ 2026-03-20              │
└──────────┴─────────┴────────────────────────┴─────────────────────────┘

=== Regression Tests ===

┌─────────────────────────────────┬──────────┬──────────┐
│ Test                            │ Status   │ Duration │
├─────────────────────────────────┼──────────┼──────────┤
│ Agent Spawning                  │ ✓ PASS   │ 12ms     │
│ Task Delegation                 │ ✓ PASS   │ 8ms      │
│ Client Communication            │ ✓ PASS   │ 15ms     │
└─────────────────────────────────┴──────────┴──────────┘

=== Help ===

  status            Show system status
  agents            Agent management
  clients           Show client connections
  delegate          Delegate task to client
  ...

✅ Demo complete
```

## Custom Commands

Example of registering a custom command:

```javascript
console.registerCommand('deploy', async (args) => {
  const environment = args[0] || 'staging';
  
  // Deployment logic here
  await deployTo(environment);
  
  return {
    success: true,
    message: `Deployed to ${environment}`,
    data: { environment, timestamp: Date.now() }
  };
}, 'Deploy to environment');
```

## Next Steps

Now that you understand the BIOS console:

- [06-auto-updates](../06-auto-updates/) - Learn update management
