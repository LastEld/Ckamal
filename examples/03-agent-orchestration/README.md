# 03 - Agent Orchestration

> **Difficulty:** ⭐⭐ Intermediate  
> **Time:** 15 minutes

## Overview

This example demonstrates the GSD (Get Stuff Done) Engine for agent orchestration, including agent spawning, task delegation, and parallel execution.

## Concepts Covered

- GSD Engine initialization
- Workflow definition and registration
- Agent spawning with CVs (Curriculum Vitae)
- Task delegation patterns
- Parallel task execution
- Workflow lifecycle management

## Files

### spawn-agent.js
Shows how to spawn agents using CVs and the OperatorConsole.

### delegate-task.js
Demonstrates task delegation to specific agents with different strategies.

### parallel-execution.js
Shows parallel execution across multiple agents with dependency management.

## Key APIs

### GSD Engine

#### `GSDEngine.constructor(options)`
Creates a new workflow engine.

Options:
- `minAgents` - Minimum agents in pool (default: 2)
- `maxAgents` - Maximum agents in pool (default: 10)
- `autoScale` - Enable auto-scaling (default: true)
- `defaultTimeout` - Default task timeout in ms (default: 30000)

#### `GSDEngine.registerWorkflow(definition)`
Registers a workflow definition.

Definition structure:
```javascript
{
  id: 'workflow-id',
  name: 'Workflow Name',
  tasks: [
    { id: 'task1', type: 'type1', handler: fn },
    { id: 'task2', type: 'type2', dependencies: ['task1'] }
  ]
}
```

#### `GSDEngine.startWorkflow(id, input)`
Starts a workflow instance.

#### `GSDEngine.getStatus(instanceId)`
Gets workflow instance status.

### OperatorConsole

#### `OperatorConsole.constructor(bios)`
Creates an interactive console.

#### `OperatorConsole.execute(command)`
Executes a console command.

Commands:
- `agents list` - List all agents
- `agents spawn <cv-id>` - Spawn a new agent
- `delegate --to=<client> --task="..."` - Delegate task
- `parallel --clients=a,b --task="..."` - Parallel execution

## Expected Output (spawn-agent.js)

```
[CogniMesh v5.0] Agent Spawning Example
========================================

✅ Console initialized

--- Agent Commands ---

Executing: agents list

┌──────────┬──────────────────────┬────────────────────┬──────────┬───────┬──────────┐
│ ID       │ Name                 │ CV                 │ Status   │ Tasks │ Uptime   │
├──────────┼──────────────────────┼────────────────────┼──────────┼───────┼──────────┤
│ sa-00    │ Coordinator          │ core/coordinator   │ active   │ 0     │ 5s       │
│ sa-01    │ Context Analyzer     │ core/context       │ active   │ 0     │ 5s       │
│ sa-02    │ Quality Validator    │ core/quality       │ standby  │ 0     │ N/A      │
└──────────┴──────────────────────┴────────────────────┴──────────┴───────┴──────────┘

Executing: agents spawn web-developer
✅ Agent sa-03 spawned with CV: web-developer

✅ Agent spawned successfully!

--- New Agent List ---
...
```

## Expected Output (delegate-task.js)

```
[CogniMesh v5.0] Task Delegation Example
=========================================

--- Delegating Tasks ---

Delegation 1: Simple Task
Target: claude
Task: Refactor authentication module
Result: ✅ Task delegated to claude

Delegation 2: Priority Task
Target: kimi
Task: Critical security patch
Priority: high
Result: ✅ Task delegated to kimi

--- All Tasks Delegated ---
Total tasks: 3
Completed: 3
```

## Expected Output (parallel-execution.js)

```
[CogniMesh v5.0] Parallel Execution Example
============================================

--- Parallel Task Execution ---

Task: Optimize database queries
Clients: claude, kimi, codex

Results:
  ✅ claude: Completed in 245ms
  ✅ kimi: Completed in 189ms
  ✅ codex: Completed in 312ms

--- Parallel Execution Complete ---
Total clients: 3
Average time: 248ms

--- Parallel with Dependencies ---

Workflow: analyze-and-fix
Stage 1 (Parallel): analyze-code
  ✅ analyzer-1: Analysis complete
  ✅ analyzer-2: Analysis complete

Stage 2 (Dependent): apply-fixes
  ✅ fixer-1: Fixes applied

✅ Workflow completed successfully!
```

## Next Steps

Now that you understand agent orchestration:

- [04-multi-client](../04-multi-client/) - Learn multi-client coordination
