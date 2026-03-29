# CogniMesh CLI

The CogniMesh Command Line Interface (CLI) provides comprehensive management capabilities for the multi-agent orchestration platform.

## Installation

### Prerequisites

- Node.js 18+ (recommended: Node.js 20 LTS)
- npm 9+ or pnpm 8+

### Global Installation

```bash
# Install globally from npm
npm install -g cognimesh

# Or use npx (no installation required)
npx cognimesh --version
```

### Local Installation

```bash
# Clone the repository
git clone https://github.com/your-org/cognimesh.git
cd cognimesh

# Install dependencies
npm install

# Link for local development
npm link
```

### Verify Installation

```bash
# Check CLI version
cognimesh --version

# Display help
cognimesh --help
```

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```bash
# Essential Configuration
NODE_ENV=development
COGNIMESH_PORT=3000
DASHBOARD_PORT=3001
WS_PORT=8080

# AI Client Feature Flags
FEATURE_CLAUDE=true
FEATURE_CODEX=true
FEATURE_KIMI=true

# Client CLI Paths (auto-detected if not specified)
CLAUDE_CLI_PATH=/path/to/claude
CODEX_CLI_PATH=/path/to/codex
KIMI_CLI_PATH=/path/to/kimi

# GitHub Integration
GITHUB_TOKEN=ghp_your_token_here
GITHUB_REPO=owner/repo

# Security (auto-generated during onboarding)
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
```

### Profile Configuration

The CLI supports multiple configuration profiles:

```bash
# Create a new profile
cognimesh context create production \
  --api-url https://api.cognimesh.io \
  --company-id COMP-001

# Switch between profiles
cognimesh context switch production

# List all profiles
cognimesh context list
```

## Quick Start

### 1. Run Onboarding Wizard

```bash
# Interactive setup
cognimesh onboard

# Quick setup with defaults
cognimesh onboard --yes

# Setup and start services
cognimesh onboard --run
```

### 2. Check System Status

```bash
# View overall system status
cognimesh status

# Check provider runtimes
cognimesh providers status

# List control-plane agents
cognimesh agents list
```

### 3. Manage Tasks

```bash
# Create a task
cognimesh tasks create "Review pull request #42" --priority high

# List all tasks
cognimesh tasks list

# Update task status
cognimesh tasks update TASK-0001 completed
```

### 4. Interactive Mode

```bash
# Start interactive REPL
cognimesh --interactive

# Or use the shorthand
cognimesh -i
```

## Output Formats

The CLI supports multiple output formats:

```bash
# JSON output
cognimesh status --json
cognimesh agents list --format json

# YAML output
cognimesh providers status --yaml

# CSV output (useful for spreadsheets)
cognimesh tasks list --csv

# Disable colors
cognimesh status --no-color

# Plain text (no tables)
cognimesh status --format plain
```

## Getting Help

```bash
# General help
cognimesh --help
cognimesh help

# Command-specific help
cognimesh help tasks
cognimesh tasks --help

# Show output capabilities
cognimesh output:info
```

## Next Steps

- [Commands Reference](./COMMANDS.md) - Complete command documentation
- [Context Profiles](./CONTEXT_PROFILES.md) - Managing multiple environments
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
- [CLI Examples](../examples/cli-examples.sh) - Bash script with common workflows
