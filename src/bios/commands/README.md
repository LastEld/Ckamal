# CogniMesh CLI Commands

Enhanced CLI for CogniMesh Multi-Agent Orchestration System.

## Installation

```bash
# Global installation
npm install -g cognimesh-bios

# Local usage
npm link
```

## Usage

```bash
cognimesh [command] [options]
# or
cm [command] [options]
```

## Global Options

| Option | Description |
|--------|-------------|
| `-v, --version` | Display version |
| `-i, --interactive` | Start interactive REPL mode |
| `--no-color` | Disable colored output |
| `--verbose` | Enable verbose output |

## Commands

### Status

```bash
cognimesh status
cognimesh s
```

Shows system status including:
- Version information
- Memory usage
- Component health status
- Uptime

### Clients

```bash
# List all clients
cognimesh clients list
cognimesh clients ls

# Test all connections
cognimesh clients test
cognimesh clients t

# Get specific client details
cognimesh clients kimi
cognimesh clients claude
cognimesh clients codex
```

### Tasks

```bash
# Create task
cognimesh tasks create "<description>" [options]
cognimesh tasks c "<description>"

Options:
  -p, --priority <level>   Task priority (low|normal|high|urgent)
  -a, --assign <client>    Assign to client (kimi|claude|codex)
  --tags <tags>            Comma-separated tags
  --due <date>             Due date

# List tasks
cognimesh tasks list
cognimesh tasks ls
  -f, --filter <status>    Filter by status
  -s, --status <status>    Alias for filter

# Get task details
cognimesh tasks get <id>

# Update task status
cognimesh tasks update <id> <status>
  status: pending|in-progress|completed|cancelled

# Delete task
cognimesh tasks delete <id>
```

### Roadmaps

```bash
# Create roadmap
cognimesh roadmaps create "<name>" [options]
cognimesh roadmaps c "<name>"

Options:
  -d, --description <text>  Description
  --phases <json>           JSON array of phases
  --target <date>           Target completion date
  -o, --output <file>       Save to file

# List roadmaps
cognimesh roadmaps list
cognimesh roadmaps ls

# Get roadmap details
cognimesh roadmaps get <id>

# Update roadmap
cognimesh roadmaps update <id> [options]

# Delete roadmap
cognimesh roadmaps delete <id>
```

### Backup

```bash
# Create backup
cognimesh backup create
cognimesh backup c
  -n, --name <name>         Backup name

# List backups
cognimesh backup list
cognimesh backup ls

# Restore from backup
cognimesh backup restore <id>
cognimesh backup r <id>
  --skip-restart            Skip service restart

# Delete backup
cognimesh backup delete <id>
```

### Vault

```bash
# Migrate secrets from .env
cognimesh vault migrate
cognimesh vault m
  --force                   Force re-migration
  --verbose                 Show verbose output

# List secrets
cognimesh vault list
cognimesh vault ls

# Add secret
cognimesh vault add <key> <value>
cognimesh vault a <key> <value>

# Remove secret
cognimesh vault remove <key>
cognimesh vault rm <key>

# Vault status
cognimesh vault status
cognimesh vault s
```

### Update

```bash
# Check for updates
cognimesh update check
cognimesh update c

# Apply updates
cognimesh update apply
cognimesh update a
  --force                   Skip confirmation

# Rollback
cognimesh update rollback <version>
cognimesh update r <version>

# Update history
cognimesh update history
cognimesh update h
```

## Interactive Mode

Start interactive REPL:

```bash
cognimesh interactive
cognimesh i
cognimesh -i
```

Interactive commands:
- `status` - Show system status
- `clients` - List clients
- `tasks` - List tasks
- `roadmaps` - List roadmaps
- `backups` - List backups
- `vault` - Vault status
- `help` - Show help
- `clear` - Clear screen
- `exit` or `quit` - Exit

## Shell Completion

### Bash

```bash
source src/bios/completions/cognimesh.bash
```

Add to `.bashrc`:
```bash
echo 'source /path/to/cognimesh.bash' >> ~/.bashrc
```

### Zsh

```bash
source src/bios/completions/cognimesh.zsh
```

Add to `.zshrc`:
```bash
echo 'source /path/to/cognimesh.zsh' >> ~/.zshrc
```

## Features

- ✅ Colored output with ANSI codes
- ✅ Tables for structured data
- ✅ Progress bars
- ✅ Spinners for async operations
- ✅ Status indicators
- ✅ Interactive REPL mode
- ✅ Tab completion
- ✅ Bash/Zsh autocompletion scripts
- ✅ Box formatting for details
- ✅ Tree views
- ✅ JSON pretty-printing
