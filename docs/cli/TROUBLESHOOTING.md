# CLI Troubleshooting Guide

Common issues and solutions for the CogniMesh CLI.

## Table of Contents

- [Doctor Command](#doctor-command)
- [Common Issues](#common-issues)
- [Debug Mode](#debug-mode)
- [Error Messages](#error-messages)
- [Getting Help](#getting-help)

---

## Doctor Command

The `doctor` command is your first stop for diagnosing system issues.

### Basic Diagnostics

```bash
# Run all checks
cognimesh doctor

# Output: System health check with pass/warn/fail status for each component
```

### Auto-Repair Mode

```bash
# Attempt to fix issues automatically
cognimesh doctor --repair

# Skip confirmation prompts
cognimesh doctor --repair --yes
```

### What Doctor Checks

| Check | Description | Can Repair |
|-------|-------------|------------|
| **Node.js Version** | Verifies Node.js 18+ | No |
| **Config Files** | Checks for valid `.env` | No |
| **Environment Variables** | Validates required vars | No |
| **Directory Permissions** | Checks read/write access | Yes |
| **Database Connection** | Tests DB connectivity | Yes |
| **Database Migrations** | Verifies migration status | Yes |
| **GitHub API** | Tests GitHub token | No |
| **AI Clients** | Checks client availability | No |
| **Port Availability** | Checks required ports | No |
| **Disk Space** | Verifies sufficient space | No |
| **Memory** | Checks available memory | No |

### Interpreting Results

```
✓ Node.js Version: v20.11.0 (supported)
✓ Config Files: .env found and valid
! Environment Variables: GITHUB_TOKEN not set (optional)
✓ Directory Permissions: All accessible
✓ Database Connection: Connected successfully
✓ Database Migrations: All up to date
✓ GitHub API: Token valid
! AI Clients: Claude not installed (optional)
✓ Port Availability: All required ports free
✓ Disk Space: 45.2 GB available
✓ Memory: 8.2 GB available
```

**Legend:**
- `✓` - Check passed
- `!` - Warning (non-critical)
- `✗` - Check failed (may be critical)

---

## Common Issues

### Installation Problems

#### "command not found: cognimesh"

**Cause:** CLI not installed globally or not in PATH.

**Solutions:**

```bash
# Verify global installation
npm list -g cognimesh

# Reinstall globally
npm install -g cognimesh

# Or use npx
npx cognimesh --version

# Check npm global bin is in PATH
npm bin -g
```

#### "EACCES: permission denied"

**Cause:** Insufficient permissions for global installation.

**Solutions:**

```bash
# Use npx instead (recommended)
npx cognimesh

# Or fix npm permissions
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc

# Then reinstall
npm install -g cognimesh
```

### Connection Issues

#### "Cannot connect to API"

**Cause:** Server not running or incorrect API URL.

**Solutions:**

```bash
# Check if server is running
curl http://localhost:3000/health

# Verify API URL in profile
cognimesh context show --resolved

# Test with explicit URL
COGNIMESH_API_URL=http://localhost:3000 cognimesh status

# Start services
cognimesh onboard --run
# or
npm start
```

#### "Authentication failed"

**Cause:** Invalid or missing auth token.

**Solutions:**

```bash
# Check current auth status
cognimesh context show

# Verify token is set
echo $COGNIMESH_AUTH_TOKEN

# Set token via environment
export COGNIMESH_AUTH_TOKEN="your-token-here"

# Or update profile
cognimesh context switch your-profile
# Edit profile to add token
```

### Command Failures

#### "Profile not found"

**Cause:** Referenced profile doesn't exist.

**Solutions:**

```bash
# List available profiles
cognimesh context list

# Create the profile
cognimesh context create missing-profile

# Or use correct name
cognimesh context switch correct-name
```

#### "Agent not found"

**Cause:** Invalid agent ID.

**Solutions:**

```bash
# List available agents
cognimesh agents list

# Check correct ID format
cognimesh agents inspect sa-00  # Use exact ID from list
```

#### "Task/Roadmap/Issue not found"

**Cause:** Invalid ID or item was deleted.

**Solutions:**

```bash
# List items to find correct ID
cognimesh tasks list
cognimesh roadmaps list
cognimesh issues list

# Check for similar IDs
cognimesh tasks list --filter pending
```

### Output Issues

#### "Output is garbled"

**Cause:** Terminal doesn't support Unicode or colors.

**Solutions:**

```bash
# Disable colors
cognimesh status --no-color

# Use plain format
cognimesh status --format plain

# Check terminal capabilities
cognimesh output:info
```

#### "Tables don't align"

**Cause:** Terminal width too narrow or font issues.

**Solutions:**

```bash
# Widen terminal window

# Use JSON format for scripts
cognimesh agents list --json

# Or CSV for spreadsheets
cognimesh tasks list --csv
```

### Performance Issues

#### "Commands are slow"

**Cause:** Network latency, slow database, or resource constraints.

**Solutions:**

```bash
# Check system resources
cognimesh doctor

# Use verbose to see timing
cognimesh status --verbose

# Check network
curl -w "@curl-format.txt" http://api.cognimesh.io/health

# Local vs remote API
# Local is faster for development
```

#### "Out of memory"

**Cause:** Large operations consuming too much memory.

**Solutions:**

```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 $(which cognimesh) status

# Process in batches
cognimesh tasks list --filter pending  # Smaller subset

# Restart CLI to free memory
```

---

## Debug Mode

Enable verbose output for troubleshooting.

### Verbose Flag

```bash
# Add --verbose to any command
cognimesh status --verbose
cognimesh tasks create "Test" --verbose
cognimesh doctor --verbose
```

**Verbose output includes:**
- API request/response details
- Timing information
- Internal state dumps
- Error stack traces

### Environment Variables

```bash
# Enable debug logging
export DEBUG=cognimesh:*
cognimesh status

# Debug specific modules
export DEBUG=cognimesh:api
cognimesh status

# Debug CLI commands
export DEBUG=cognimesh:cli
cognimesh tasks list
```

### Log Files

CLI logs are stored in:

```bash
# View recent logs
tail -f ~/.config/cognimesh/logs/cli.log

# View error logs
cat ~/.config/cognimesh/logs/error.log

# Check log directory
ls -la ~/.config/cognimesh/logs/
```

---

## Error Messages

### "Error: Runtime not found"

**Meaning:** The specified provider runtime doesn't exist.

**Fix:**
```bash
# List available runtimes
cognimesh providers list

# Use correct model ID
cognimesh providers inspect claude-sonnet-4-6
```

### "Error: Task description is required"

**Meaning:** Missing required argument.

**Fix:**
```bash
# Provide description in quotes
cognimesh tasks create "Your task description here"
```

### "Error: Invalid status"

**Meaning:** Status value not in allowed list.

**Fix:**
```bash
# Use valid status values
cognimesh tasks update TASK-001 pending
cognimesh tasks update TASK-001 in-progress
cognimesh tasks update TASK-001 completed
cognimesh tasks update TASK-001 cancelled
```

### "Error: Profile already exists"

**Meaning:** Cannot create duplicate profile name.

**Fix:**
```bash
# Use different name
cognimesh context create my-profile-v2

# Or delete old one first
cognimesh context delete my-profile --force
cognimesh context create my-profile
```

### "Error: Cannot delete the default profile"

**Meaning:** Default profile is protected.

**Fix:**
```bash
# Use --force to override
cognimesh context delete default --force

# Or keep default and create new profiles
cognimesh context create custom-profile
```

### "Error: Secrets already migrated"

**Meaning:** Vault migration already completed.

**Fix:**
```bash
# Force re-migration if needed
cognimesh vault migrate --force

# Or check vault status
cognimesh vault status
```

---

## Getting Help

### Built-in Help

```bash
# General help
cognimesh --help
cognimesh help

# Command help
cognimesh help tasks
cognimesh tasks --help

# Subcommand help
cognimesh help context create
```

### Diagnostic Information

When reporting issues, include:

```bash
# CLI version
cognimesh --version

# System info
cognimesh status --json

# Doctor output
cognimesh doctor

# Output capabilities
cognimesh output:info

# Node version
node --version

# NPM version
npm --version
```

### Debug Report

Generate a comprehensive debug report:

```bash
# Save all diagnostic info
cognimesh --version > debug.txt
cognimesh doctor >> debug.txt 2>&1
cognimesh status --json >> debug.txt 2>&1
cognimesh output:info >> debug.txt 2>&1

# Include in issue report
cat debug.txt
```

### Support Channels

- **Documentation**: Check this guide and [Commands Reference](./COMMANDS.md)
- **GitHub Issues**: Report bugs at https://github.com/your-org/cognimesh/issues
- **Community**: Join our Discord/Slack for community support

---

## Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| CLI won't start | `npx cognimesh` or reinstall |
| Connection refused | Check server is running on correct port |
| Auth errors | Verify `COGNIMESH_AUTH_TOKEN` |
| Wrong environment | `cognimesh context switch <profile>` |
| Slow commands | Use `--format json` for scripts |
| Garbled output | Use `--no-color` or `--format plain` |
| Permission denied | Check file permissions or use `--force` |
