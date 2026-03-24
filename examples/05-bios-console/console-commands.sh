#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - BIOS Console Commands Demo
# =============================================================================
#
# This script demonstrates common BIOS console commands.
# Each section shows command usage and expected output.
#
# Usage:
#   bash console-commands.sh
#
# Note: This is a demonstration script showing the console interface.
# For interactive use, run the console via Node.js.
# =============================================================================

echo ""
echo "CogniMesh BIOS Console Commands Demo"
echo "====================================="
echo ""

# ---------------------------------------------------------------------------
# Section 1: Basic System Commands
# ---------------------------------------------------------------------------

echo "=== 1. Basic System Commands ==="
echo ""

cat << 'EOF'
# Show system status
$ status

Output:
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

# Show system metrics
$ metrics

Output:
┌─────────────────────────────────────────┐
│           SYSTEM METRICS                │
├─────────────────────────────────────────┤
│  Uptime:           5m 23s               │
│  Task Success Rate: 100%                │
│  Tasks Completed:  15                   │
│  Tasks Failed:     0                    │
│  Agents Spawned:   3                    │
└─────────────────────────────────────────┘

EOF

# ---------------------------------------------------------------------------
# Section 2: Agent Management Commands
# ---------------------------------------------------------------------------

echo "=== 2. Agent Management Commands ==="
echo ""

cat << 'EOF'
# List all agents
$ agents list

Output:
┌──────────┬──────────────────────┬────────────────────┬──────────┬───────┐
│ ID       │ Name                 │ CV                 │ Status   │ Tasks │
├──────────┼──────────────────────┼────────────────────┼──────────┼───────┤
│ sa-00    │ Coordinator          │ core/coordinator   │ active   │ 0     │
│ sa-01    │ Context Analyzer     │ core/context       │ active   │ 0     │
│ sa-02    │ Quality Validator    │ core/quality       │ standby  │ 0     │
└──────────┴──────────────────────┴────────────────────┴──────────┴───────┘

# Spawn a new agent
$ agents spawn web-developer

Output:
✅ Agent sa-03 spawned with CV: web-developer

# Kill/stop an agent
$ agents kill sa-03

Output:
✅ Agent sa-03 terminated

EOF

# ---------------------------------------------------------------------------
# Section 3: Client Management Commands
# ---------------------------------------------------------------------------

echo "=== 3. Client Management Commands ==="
echo ""

cat << 'EOF'
# Show connected clients
$ clients

Output:
┌──────────┬──────────────────┬──────────┬──────────────┬────────────────────────┐
│ ID       │ Name             │ Status   │ Type         │ Capabilities           │
├──────────┼──────────────────┼──────────┼──────────────┼────────────────────────┤
│ kimi     │ Kimi AI          │ ● Online │ AI Assistant │ code,analysis          │
│ claude   │ Claude           │ ● Online │ AI Assistant │ code,writing           │
│ codex    │ Codex            │ ○ Offline│ Code Generator│ code                  │
└──────────┴──────────────────┴──────────┴──────────────┴────────────────────────┘

EOF

# ---------------------------------------------------------------------------
# Section 4: Task Delegation Commands
# ---------------------------------------------------------------------------

echo "=== 4. Task Delegation Commands ==="
echo ""

cat << 'EOF'
# Delegate a task to a specific client
$ delegate --to=claude --task="Refactor authentication module"

Output:
✅ Task delegated to claude
   Task ID: task-1711212345678
   Status: delegated

# Delegate with priority
$ delegate --to=kimi --task="Critical security patch" --priority=high

Output:
✅ Task delegated to kimi (priority: high)
   Task ID: task-1711212348901

# Execute task in parallel across multiple clients
$ parallel --clients=claude,kimi,codex --task="Optimize database queries"

Output:
✅ Parallel execution completed across 3 clients
   Results:
     • claude: Completed (245ms)
     • kimi: Completed (189ms)
     • codex: Completed (312ms)

# Chain tasks across clients
$ chain --steps='[{"client":"claude","task":"Analyze"},{"client":"kimi","task":"Refactor"},{"client":"codex","task":"Test"}]'

Output:
✅ Chain execution completed with 3 steps
   Step 1: claude → kimi (Analysis passed)
   Step 2: kimi → codex (Refactoring complete)
   Step 3: codex (Tests passed)

EOF

# ---------------------------------------------------------------------------
# Section 5: Update and Patch Commands
# ---------------------------------------------------------------------------

echo "=== 5. Update and Patch Commands ==="
echo ""

cat << 'EOF'
# Check for available updates
$ update check

Output:
Current Version: v5.0.0

Available Updates:
┌──────────┬─────────┬────────────────────────┬─────────────────────────┐
│ Version  │ Type    │ Description            │ Date                    │
├──────────┼─────────┼────────────────────────┼─────────────────────────┤
│ 5.1.0    │ minor   │ Performance improve... │ 2026-03-20              │
│ 5.0.5    │ patch   │ Bug fixes              │ 2026-03-18              │
└──────────┴─────────┴────────────────────────┴─────────────────────────┘

Run "update apply" to install the latest update.

# Apply available updates
$ update apply

Output:
✅ Update to v5.1.0 applied successfully
   Previous: 5.0.0
   Current: 5.1.0
   Applied at: 2026-03-23T15:30:00.000Z

# Create a patch
$ patch create "Fix login redirect issue"

Output:
✅ Patch patch-abc123def created
   Status: pending
   Description: Fix login redirect issue

# Verify a patch
$ patch verify patch-abc123def

Output:
✅ Patch patch-abc123def verified successfully
   Verified at: 2026-03-23T15:31:00.000Z

# List all patches
$ patch list

Output:
┌──────────────────────┬──────────────────────────────┬──────────┬───────────┐
│ ID                   │ Description                  │ Status   │ Verified  │
├──────────────────────┼──────────────────────────────┼──────────┼───────────┤
│ patch-abc123def      │ Fix login redirect issue     │ verified │ ✓ Yes     │
└──────────────────────┴──────────────────────────────┴──────────┴───────────┘

# Rollback to previous version
$ rollback 5.0.0

Output:
✅ System rolled back to version 5.0.0
   Rolled back at: 2026-03-23T15:32:00.000Z

EOF

# ---------------------------------------------------------------------------
# Section 6: System Logs and Diagnostics
# ---------------------------------------------------------------------------

echo "=== 6. System Logs and Diagnostics ==="
echo ""

cat << 'EOF'
# View system logs
$ logs

Output:
[2026-03-23T15:27:31.456Z] [INFO ] [BIOS] System initialized
[2026-03-23T15:27:31.467Z] [INFO ] [AGENTS] Coordinator agent active
[2026-03-23T15:27:31.478Z] [DEBUG] [CLIENTS] Client connections updated

# View last 100 lines
$ logs --lines=100

# View error logs only
$ logs --level=error

# View logs for specific component
$ logs --component=AGENTS

# Run regression tests
$ test

Output:
┌─────────────────────────────────┬──────────┬──────────┐
│ Test                            │ Status   │ Duration │
├─────────────────────────────────┼──────────┼──────────┤
│ Agent Spawning                  │ ✓ PASS   │ 12ms     │
│ Task Delegation                 │ ✓ PASS   │ 8ms      │
│ Client Communication            │ ✓ PASS   │ 15ms     │
│ Patch Creation                  │ ✓ PASS   │ 5ms      │
│ Update Check                    │ ✓ PASS   │ 23ms     │
└─────────────────────────────────┴──────────┴──────────┘

EOF

# ---------------------------------------------------------------------------
# Section 7: Help and Exit
# ---------------------------------------------------------------------------

echo "=== 7. Help and Exit ==="
echo ""

cat << 'EOF'
# Show available commands
$ help

Output:
┌──────────────────────────────────────────────────────────────────────────┐
│                         AVAILABLE COMMANDS                               │
├──────────────────────────────────────────────────────────────────────────┤
│  status              Show system status                                  │
│  agents              Agent management (list, spawn)                      │
│  clients             Show client connections                             │
│  delegate            Delegate task to client                             │
│  parallel            Run parallel tasks across clients                   │
│  chain               Chain tasks across clients                          │
│  update              Check or apply updates                              │
│  patch               Patch management (create, verify)                   │
│  rollback            Rollback system to version                          │
│  logs                Show system logs                                    │
│  metrics             Show system metrics                                 │
│  test                Run regression tests                                │
│  help                Show available commands                             │
│  exit                Exit console                                        │
└──────────────────────────────────────────────────────────────────────────┘

# Exit the console
$ exit

Output:
✅ Goodbye!

EOF

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo "=== Summary ==="
echo ""
echo "This script demonstrated the following BIOS console commands:"
echo ""
echo "  System:        status, metrics, logs, test"
echo "  Agents:        agents list, agents spawn, agents kill"
echo "  Clients:       clients"
echo "  Tasks:         delegate, parallel, chain"
echo "  Updates:       update check, update apply, rollback"
echo "  Patches:       patch create, patch verify, patch list"
echo "  Utilities:     help, exit"
echo ""
echo "For programmatic use, see the JavaScript examples:"
echo "  - 03-agent-orchestration/"
echo "  - 04-multi-client/"
echo ""
