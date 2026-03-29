# CogniMesh CLI Commands Reference

Complete reference for all CogniMesh CLI commands.

## Table of Contents

- [Global Flags](#global-flags)
- [System Commands](#system-commands)
- [Provider Commands](#provider-commands)
- [Agent Commands](#agent-commands)
- [Client Commands](#client-commands)
- [Task Commands](#task-commands)
- [Roadmap Commands](#roadmap-commands)
- [Backup Commands](#backup-commands)
- [Vault Commands](#vault-commands)
- [Skill Commands](#skill-commands)
- [Context/Profile Commands](#contextprofile-commands)
- [GitHub Commands](#github-commands)
- [Issue Commands](#issue-commands)
- [Company Commands](#company-commands)
- [Approval Commands](#approval-commands)
- [Billing Commands](#billing-commands)
- [Update Commands](#update-commands)
- [Onboarding Commands](#onboarding-commands)
- [Exit Codes](#exit-codes)

---

## Global Flags

These flags can be used with any command:

| Flag | Short | Description |
|------|-------|-------------|
| `--version` | `-v` | Display version information |
| `--interactive` | `-i` | Start interactive REPL mode |
| `--no-color` | | Disable colored output |
| `--format <type>` | | Output format: `table`, `json`, `yaml`, `csv`, `tree`, `plain` |
| `--json` | | Output as JSON (shortcut for `--format json`) |
| `--yaml` | | Output as YAML (shortcut for `--format yaml`) |
| `--csv` | | Output as CSV (shortcut for `--format csv`) |
| `--no-pager` | | Disable pager for long output |
| `--quiet` | `-q` | Suppress non-error output |
| `--verbose` | | Enable verbose output |
| `--stream` | | Enable streaming output mode |

---

## System Commands

### `status` (alias: `s`)

Show comprehensive system status.

```bash
cognimesh status
cognimesh status --json
cognimesh s
```

**Output includes:**
- Version information
- Memory usage with progress bar
- Component health status
- Control plane agent count
- Provider runtime inventory
- Fallback chains

### `doctor` (aliases: `dr`, `diagnose`)

Run system diagnostics with optional auto-repair.

```bash
# Basic diagnostics
cognimesh doctor

# Auto-repair fixable issues
cognimesh doctor --repair

# Skip confirmation prompts
cognimesh doctor --repair --yes
```

**Checks performed:**
- Node.js version
- Config files
- Environment variables
- Directory permissions
- Database connection
- Database migrations
- GitHub API
- AI clients
- Port availability
- Disk space
- Memory availability

### `output:info`

Show terminal capabilities and output format information.

```bash
cognimesh output:info
```

### `interactive` (aliases: `i`, `repl`)

Start interactive REPL mode.

```bash
cognimesh interactive
cognimesh i
cognimesh --interactive
```

**Interactive commands:**
- `status` - Show system status
- `providers` - Show provider status
- `agents` - List agents
- `clients` - List clients
- `tasks` - List tasks
- `roadmaps` - List roadmaps
- `backups` - List backups
- `vault` - Show vault status
- `help` - Show help
- `clear` - Clear screen
- `exit`, `quit`, `q` - Exit REPL

---

## Provider Commands

### `providers` (alias: `pr`)

Show provider runtime status (default action).

```bash
cognimesh providers
cognimesh pr
```

### `providers list` (alias: `providers ls`)

List all provider surfaces.

```bash
cognimesh providers list
cognimesh providers ls
```

### `providers status` (alias: `providers s`)

Show provider runtime status with load and latency metrics.

```bash
cognimesh providers status
cognimesh providers s
```

### `providers inspect <modelId>` (alias: `providers show`)

Inspect a specific provider runtime.

```bash
cognimesh providers inspect gpt-5.4-codex
cognimesh providers show claude-sonnet-4-6
```

---

## Agent Commands

### `agents` (alias: `ag`)

List control-plane agents (default action).

```bash
cognimesh agents
cognimesh ag
```

### `agents list` (alias: `agents ls`)

List agents with optional filtering.

```bash
# List all agents
cognimesh agents list

# Filter by client
cognimesh agents list --client claude

# Filter by status
cognimesh agents list --status active
```

**Options:**
- `-c, --client <client>` - Filter by client (claude, codex, kimi)
- `-s, --status <status>` - Filter by status

### `agents inspect <agentId>` (alias: `agents show`)

Show detailed information about a specific agent.

```bash
cognimesh agents inspect sa-00
cognimesh agents show sa-01
```

---

## Client Commands

### `clients` (alias: `cl`)

List all available AI clients.

```bash
cognimesh clients
cognimesh clients list
cognimesh cl ls
```

### `clients test` (alias: `clients t`)

Test all client connections.

```bash
cognimesh clients test
cognimesh cl t
```

### Client-specific shortcuts

```bash
# Show Kimi client details
cognimesh clients kimi

# Show Claude client details
cognimesh clients claude

# Show Codex client details
cognimesh clients codex
```

---

## Task Commands

### `tasks` (alias: `t`)

List all tasks (default action).

```bash
cognimesh tasks
cognimesh t
```

### `tasks create <description>` (alias: `tasks c`)

Create a new task.

```bash
# Basic task creation
cognimesh tasks create "Review code changes"

# With priority
cognimesh tasks create "Fix critical bug" --priority urgent

# With assignment
cognimesh tasks create "Update documentation" --assign claude

# With tags
cognimesh tasks create "Deploy to staging" --tags deployment,staging

# With due date
cognimesh tasks create "Quarterly review" --due 2026-04-15
```

**Options:**
- `-p, --priority <level>` - Priority: `low`, `normal`, `high`, `urgent` (default: `normal`)
- `-a, --assign <client>` - Assign to client
- `--tags <tags>` - Comma-separated tags
- `--due <date>` - Due date (ISO format)

### `tasks list` (alias: `tasks ls`)

List tasks with optional filtering.

```bash
# List all tasks
cognimesh tasks list

# Filter by status
cognimesh tasks list --filter pending
cognimesh tasks list --status completed
```

### `tasks get <id>` (alias: `tasks g`)

Get detailed information about a task.

```bash
cognimesh tasks get TASK-0001
cognimesh tasks g TASK-0002
```

### `tasks update <id> <status>` (alias: `tasks u`)

Update task status.

```bash
cognimesh tasks update TASK-0001 in-progress
cognimesh tasks u TASK-0002 completed
```

**Valid statuses:** `pending`, `in-progress`, `completed`, `cancelled`

### `tasks delete <id>` (alias: `tasks d`)

Delete a task.

```bash
cognimesh tasks delete TASK-0001
cognimesh tasks d TASK-0002
```

---

## Roadmap Commands

### `roadmaps` (alias: `rm`)

List all roadmaps (default action).

```bash
cognimesh roadmaps
cognimesh rm
```

### `roadmaps create <name>` (alias: `roadmaps c`)

Create a new roadmap.

```bash
# Basic roadmap
cognimesh roadmaps create "Q2 2026 Goals"

# With description
cognimesh roadmaps create "Security Hardening" --description "Improve security posture"

# With custom phases
cognimesh roadmaps create "API v2" --phases '[{"name":"Design","status":"completed"}]'

# With target date
cognimesh roadmaps create "Migration" --target 2026-06-30

# Save to file
cognimesh roadmaps create "Project X" --output roadmap.json
```

**Options:**
- `-d, --description <text>` - Roadmap description
- `--phases <json>` - JSON array of phases
- `--target <date>` - Target completion date
- `-o, --output <file>` - Save to file

### `roadmaps list` (alias: `roadmaps ls`)

List all roadmaps with progress indicators.

```bash
cognimesh roadmaps list
cognimesh roadmaps ls
```

### `roadmaps get <id>` (alias: `roadmaps g`)

Get roadmap details.

```bash
cognimesh roadmaps get RM-001
cognimesh roadmaps g RM-002
```

### `roadmaps update <id>` (alias: `roadmaps u`)

Update a roadmap.

```bash
cognimesh roadmaps update RM-001 --name "Updated Name"
cognimesh roadmaps update RM-001 --status active
cognimesh roadmaps u RM-002 --description "New description"
```

**Options:**
- `-n, --name <name>` - New name
- `-d, --description <text>` - New description
- `-s, --status <status>` - New status

### `roadmaps delete <id>` (alias: `roadmaps d`)

Delete a roadmap.

```bash
cognimesh roadmaps delete RM-001
cognimesh roadmaps d RM-002
```

---

## Backup Commands

### `backup` (alias: `b`)

Create and restore system backups.

### `backup create` (alias: `backup c`)

Create a new backup.

```bash
# Create backup with auto-generated name
cognimesh backup create

# Create named backup
cognimesh backup create --name "pre-release-backup"
cognimesh backup c --name "before-migration"
```

### `backup list` (alias: `backup ls`)

List all backups.

```bash
cognimesh backup list
cognimesh backup ls
```

### `backup restore <id>` (alias: `backup r`)

Restore from a backup.

```bash
# Restore backup
cognimesh backup restore BK-ABC123

# Restore without restarting services
cognimesh backup restore BK-ABC123 --skip-restart
```

### `backup delete <id>` (alias: `backup d`)

Delete a backup.

```bash
cognimesh backup delete BK-ABC123
cognimesh backup d BK-ABC123
```

---

## Vault Commands

### `vault` (alias: `v`)

Manage secrets and credentials.

### `vault migrate` (alias: `vault m`)

Migrate secrets from `.env` to vault.

```bash
# Migrate secrets
cognimesh vault migrate

# Force re-migration
cognimesh vault migrate --force

# Verbose output
cognimesh vault migrate --verbose
```

### `vault list` (alias: `vault ls`)

List vault secrets.

```bash
cognimesh vault list
cognimesh vault ls
```

### `vault add <key> <value>` (alias: `vault a`)

Add a secret to the vault.

```bash
cognimesh vault add API_KEY "secret123"
cognimesh vault a DATABASE_URL "postgres://..."
```

### `vault remove <key>` (alias: `vault rm`)

Remove a secret from the vault.

```bash
cognimesh vault remove OLD_KEY
cognimesh vault rm DEPRECATED_TOKEN
```

### `vault status` (alias: `vault s`)

Show vault status.

```bash
cognimesh vault status
cognimesh vault s
```

---

## Skill Commands

### `skills` (alias: `sk`)

Manage and sync AI skills.

### `skills list` (alias: `skills ls`)

List all skills with optional filtering.

```bash
# List all skills
cognimesh skills list

# Filter by status
cognimesh skills list --status active

# Filter by category
cognimesh skills list --category devops

# Filter by tag
cognimesh skills list --tag automation
```

### `skills create <name>` (alias: `skills c`)

Create a new skill.

```bash
# Basic skill creation
cognimesh skills create my-skill

# With description
cognimesh skills create deployment-guide --description "Guide for deployments"

# With tags
cognimesh skills create api-testing --tags api,testing,automation

# With categories
cognimesh skills create ci-cd --categories devops,automation

# Save to file
cognimesh skills create best-practices --file ./skills/best-practices.md

# Company-scoped skill
cognimesh skills create internal-guide --company COMP-001
```

### `skills show <name>` (alias: `skills s`)

Show skill details.

```bash
cognimesh skills show my-skill
cognimesh skills show api-testing --company COMP-001
cognimesh skills s best-practices --no-content
```

### `skills update <name>` (alias: `skills u`)

Update a skill.

```bash
# Update from file
cognimesh skills update my-skill --file ./updated.md

# Update content directly
cognimesh skills update my-skill --content "New content"

# Update display name
cognimesh skills update my-skill --display-name "My Improved Skill"

# Update status
cognimesh skills update my-skill --status deprecated

# Update tags
cognimesh skills update my-skill --tags updated,tags

# Update without creating new version
cognimesh skills update my-skill --no-version
```

### `skills delete <name>` (alias: `skills d`)

Delete a skill.

```bash
# Delete skill (requires --force)
cognimesh skills delete my-skill --force

# Delete and remove from client directories
cognimesh skills delete my-skill --force --clean
```

### `skills sync` (alias: `skills sy`)

Sync skills to AI clients.

```bash
# Sync to all clients
cognimesh skills sync

# Sync to specific client
cognimesh skills sync --client claude
cognimesh skills sync --client kimi

# Sync specific skills
cognimesh skills sync --skills "skill1,skill2,skill3"

# Use symlink mode
cognimesh skills sync --mode symlink

# Clean orphaned skills
cognimesh skills sync --clean

# Dry run (preview only)
cognimesh skills sync --dry-run

# Verbose output
cognimesh skills sync --verbose
```

### `skills scan`

Scan project for skills.

```bash
# Scan current directory
cognimesh skills scan

# Scan specific path
cognimesh skills scan --project /path/to/project

# Scan with company scope
cognimesh skills scan --company COMP-001
```

---

## Context/Profile Commands

### `context list` (alias: `ctx ls`)

List all profiles.

```bash
cognimesh context list
cognimesh context ls
```

### `context create <name>` (alias: `ctx c`)

Create a new profile.

```bash
# Create basic profile
cognimesh context create staging

# Create with API URL
cognimesh context create production --api-url https://api.prod.com

# Create with company ID
cognimesh context create team-a --company-id COMP-001

# Create and switch to it
cognimesh context create dev --switch
```

**Options:**
- `--api-url <url>` - API endpoint URL
- `--company-id <id>` - Company identifier
- `--auth-token <token>` - Authentication token
- `--default-model <model>` - Default AI model
- `--theme <theme>` - UI theme preference
- `--switch` - Activate after creation

### `context switch <name>` (alias: `ctx sw`)

Switch to a different profile.

```bash
cognimesh context switch production
cognimesh context sw staging
```

### `context delete <name>` (alias: `ctx d`)

Delete a profile.

```bash
cognimesh context delete old-profile --force
```

### `context show [name]` (alias: `ctx sh`)

Show profile details.

```bash
# Show current profile
cognimesh context show

# Show specific profile
cognimesh context show production

# Show with resolved context
cognimesh context show --resolved
```

### `context export <name>` (alias: `ctx e`)

Export a profile to JSON.

```bash
cognimesh context export production
cognimesh context export staging --file staging-profile.json
```

### `context import <file>` (alias: `ctx i`)

Import a profile from JSON file.

```bash
cognimesh context import ./profile.json
cognimesh context import ./profile.json --name "imported-profile"
cognimesh context import ./profile.json --force --switch
```

---

## GitHub Commands

### `github repos [list]`

List repositories.

```bash
# List all repos
cognimesh github repos

# List only public repos
cognimesh github repos --type public

# List only private repos
cognimesh github repos --type private
```

### `github repos search <query>`

Search repositories on GitHub.

```bash
cognimesh github repos search "react"
cognimesh github repos search "machine learning language:python"
```

### `github repo <owner>/<repo>`

Show repository details.

```bash
cognimesh github repo facebook/react
cognimesh github repo myorg/myproject
```

### `github issues <repo>`

List issues in a repository.

```bash
# List all issues
cognimesh github issues owner/repo

# List open issues only
cognimesh github issues owner/repo --state open

# Filter by label
cognimesh github issues owner/repo --label bug
```

### `github issues sync <repo>`

Sync issues bidirectionally.

```bash
# Bidirectional sync
cognimesh github issues sync owner/repo

# One-way sync directions
cognimesh github issues sync owner/repo --direction to-github
cognimesh github issues sync owner/repo --direction from-github
```

### `github issues show <repo> <number>`

Show issue details.

```bash
cognimesh github issues show owner/repo 42
```

### `github prs <repo>`

List pull requests.

```bash
cognimesh github prs owner/repo
```

### `github pr <repo> <number>`

Show pull request details.

```bash
cognimesh github pr owner/repo 156
```

### `github releases <repo>`

List releases.

```bash
cognimesh github releases owner/repo
```

---

## Issue Commands

### `issues list` (alias: `issue ls`)

List all issues.

```bash
# List all issues
cognimesh issues list

# Filter by status
cognimesh issues list --status open
cognimesh issues list --status in-progress

# Filter by priority
cognimesh issues list --priority high

# Filter by type
cognimesh issues list --type bug

# Filter by assignee
cognimesh issues list --assignee USER-001
```

### `issues create <title>` (alias: `issue c`)

Create a new issue.

```bash
# Basic issue
cognimesh issues create "Bug in login form"

# With description
cognimesh issues create "API timeout" --description "API times out after 30s"

# With priority
cognimesh issues create "Critical security fix" --priority urgent

# With type
cognimesh issues create "Add feature X" --type feature

# With assignee
cognimesh issues create "Review needed" --assignee USER-002
```

### `issues show <id>` (alias: `issue sh`)

Show issue details.

```bash
cognimesh issues show ISS-001
cognimesh issue sh ISS-002
```

### `issues update <id>` (alias: `issue u`)

Update an issue.

```bash
# Update status
cognimesh issues update ISS-001 --status in-progress
cognimesh issues update ISS-001 --status resolved

# Update assignee
cognimesh issues update ISS-001 --assignee USER-003

# Update priority
cognimesh issues update ISS-001 --priority high
```

### `issues comment <id> <message>` (alias: `issue cm`)

Add a comment to an issue.

```bash
cognimesh issues comment ISS-001 "Working on this now"
cognimesh issue cm ISS-002 "Fixed in commit abc123"
```

### `issues close <id>` (alias: `issue cl`)

Close an issue.

```bash
cognimesh issues close ISS-001
cognimesh issues close ISS-001 --resolution "Fixed in v2.1.0"
```

---

## Company Commands

### `company list` (alias: `co ls`)

List all companies.

```bash
cognimesh company list
cognimesh co ls
```

### `company create <name>` (alias: `co c`)

Create a new company.

```bash
cognimesh company create "Acme Corporation"
cognimesh co c "TechStart Inc"
```

### `company switch [id]` (alias: `co sw`)

Switch to a different company.

```bash
# Switch to specific company
cognimesh company switch COMP-001
cognimesh co sw COMP-002

# Show current company
cognimesh company switch
```

### `company members` (alias: `co m`)

List company members.

```bash
cognimesh company members
cognimesh co m
```

### `company invite <email>` (alias: `co i`)

Invite a member to the company.

```bash
# Basic invitation
cognimesh company invite newuser@example.com

# With specific role
cognimesh company invite admin@example.com --role admin
cognimesh co i guest@example.com --role guest
```

---

## Approval Commands

### `approval list` (alias: `apr ls`)

List approval requests.

```bash
# List all approvals
cognimesh approval list

# Show only pending
cognimesh approval list --pending

# Filter by type
cognimesh approval list --type deployment
cognimesh approval list --type billing

# Filter by status
cognimesh approval list --status pending
```

### `approval show <id>` (alias: `apr sh`)

Show approval details.

```bash
cognimesh approval show APR-001
cognimesh apr sh APR-002
```

### `approval approve <id>` (alias: `apr a`)

Approve a request.

```bash
# Simple approval
cognimesh approval approve APR-001

# With comment
cognimesh approval approve APR-001 --comment "Looks good, approved!"
```

### `approval reject <id>` (alias: `apr r`)

Reject a request.

```bash
# Simple rejection
cognimesh approval reject APR-002

# With reason
cognimesh approval reject APR-002 --comment "Need more information"
```

---

## Billing Commands

### `billing summary` (alias: `bill s`)

Get billing summary.

```bash
cognimesh billing summary
cognimesh bill s
```

### `billing costs` (alias: `bill c`)

Get cost breakdown.

```bash
# Default 30 days
cognimesh billing costs

# Specific time range
cognimesh billing costs --days 7
cognimesh billing costs --days 90
```

### `billing budgets` (alias: `bill b`)

Get budgets.

```bash
cognimesh billing budgets
cognimesh bill b
```

### `billing alerts` (alias: `bill a`)

Get billing alerts.

```bash
cognimesh billing alerts
cognimesh bill a
```

---

## Update Commands

### `update check` (alias: `up c`)

Check for available updates.

```bash
cognimesh update check
cognimesh up c
```

### `update apply` (alias: `up a`)

Apply available updates.

```bash
# Apply with confirmation
cognimesh update apply

# Force without confirmation
cognimesh update apply --force
```

### `update rollback <version>` (alias: `up r`)

Rollback to a previous version.

```bash
cognimesh update rollback 5.0.3
cognimesh up r 5.0.2
```

### `update history` (alias: `up h`)

Show update history.

```bash
cognimesh update history
cognimesh up h
```

---

## Onboarding Commands

### `onboard`

Interactive setup wizard.

```bash
# Full interactive setup
cognimesh onboard

# Quick setup with defaults
cognimesh onboard --yes

# Setup and start services
cognimesh onboard --run

# Verbose output
cognimesh onboard --verbose
```

---

## Exit Codes

The CLI uses the following exit codes:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error / Command failed |
| `2` | Misuse of command (bad syntax) |
| `3` | Configuration error |
| `130` | Interrupted (Ctrl+C) |

---

## Examples

See [CLI Examples](../../examples/cli-examples.sh) for a comprehensive bash script with common workflows.
