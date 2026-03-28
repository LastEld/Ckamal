# Windows Setup Guide for CogniMesh

Complete setup instructions for running CogniMesh on Windows 10/11.

## Prerequisites

- Windows 10 (version 1903+) or Windows 11
- PowerShell 5.1 or PowerShell 7+
- Git for Windows
- Node.js 18+ and npm

## Step 1: Install Prerequisites

### Install Git for Windows

1. Download from [git-scm.com](https://git-scm.com/download/win)
2. Run the installer with default settings
3. Verify installation:
   ```powershell
   git --version
   ```

### Install Node.js

1. Download LTS version from [nodejs.org](https://nodejs.org/)
2. Run the installer
3. Verify installation:
   ```powershell
   node --version  # Should show v18.x.x or higher
   npm --version   # Should show 9.x.x or higher
   ```

Or use Windows Package Manager (winget):
```powershell
winget install OpenJS.NodeJS.LTS
```

## Step 2: Clone and Setup

### Open PowerShell

Open PowerShell as Administrator (recommended) or regular user.

### Clone the Repository

```powershell
git clone https://github.com/LastEld/Ckamal.git
cd Ckamal
```

### Run Setup Wizard

Use the interactive setup (recommended for first-time setup):

```powershell
npm run setup
```

Or manual setup:

```powershell
npm install
copy .env.example .env
npm run doctor
```

## Step 3: Configure Environment

### Edit .env File

Open `.env` in your preferred editor:

```powershell
notepad .env
# or
code .env  # If using VS Code
```

### Required Windows-Specific Settings

```env
# Windows paths use forward slashes or escaped backslashes
DATABASE_PATH=.\data\cognimesh.db
STATE_PATH=.\data\state
COGNIMESH_DATA_DIR=.\data
COGNIMESH_CACHE_DIR=.\cache
COGNIMESH_LOGS_DIR=.\logs
```

### Client Paths (if installed)

```env
# Example paths for Windows
CLAUDE_CLI_PATH=C:\Users\%USERNAME%\AppData\Local\Anthropic\claude.exe
CODEX_CLI_PATH=C:\Users\%USERNAME%\AppData\Roaming\npm\codex.cmd
KIMI_CLI_PATH=C:\Users\%USERNAME%\AppData\Roaming\npm\kimi.cmd
```

## Step 4: Create Required Directories

```powershell
New-Item -ItemType Directory -Force -Path data, cache, logs, .vault
```

## Step 5: Verify Installation

Run the doctor to check everything:

```powershell
npm run doctor
```

Expected output should show all checks passing.

## Step 6: Start CogniMesh

### Development Mode

```powershell
npm run dev
```

### Production Mode

```powershell
npm start
```

## Windows-Specific Issues and Solutions

### Issue: PowerShell Execution Policy

**Error:** `cannot be loaded because running scripts is disabled`

**Solution:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue: Long Path Names

**Error:** `Path too long`

**Solution:** Enable long path support:
```powershell
# Run as Administrator
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

### Issue: Node Modules Path Too Long

**Solution:** Use npm's legacy peer deps:
```powershell
npm install --legacy-peer-deps
```

Or set environment variable:
```powershell
$env:npm_config_legacy_peer_deps="true"
npm install
```

### Issue: SQLite Build Failures

**Error:** `better-sqlite3` build errors

**Solution:** Install Windows build tools:
```powershell
npm install --global windows-build-tools
# or
npm config set msvs_version 2022
```

### Issue: EACCES Permission Errors

**Solution:** Run PowerShell as Administrator or fix npm permissions:
```powershell
# Check npm prefix
npm config get prefix

# If not in user directory, change it:
npm config set prefix "$env:APPDATA\npm"
```

### Issue: Port Already in Use

**Error:** `EADDRINUSE`

**Solution:** Find and kill process using the port:
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F
```

## Windows Services (Optional)

To run CogniMesh as a Windows service, use `nssm` or `pm2`:

### Using PM2

```powershell
npm install -g pm2
pm2 start src/index.js --name cognimesh
pm2 startup windows
pm2 save
```

### Using NSSM

1. Download NSSM from [nssm.cc](https://nssm.cc/download)
2. Create service:
   ```powershell
   nssm install CogniMesh
   ```
3. Set path to `node.exe` and arguments to `src/index.js`

## File Paths Reference

| Location | Path |
|----------|------|
| Node.js | `C:\Program Files\nodejs\` |
| npm global | `%APPDATA%\npm\` |
| npm cache | `%LOCALAPPDATA%\npm-cache\` |
| Project data | `.\data\` |
| Logs | `.\logs\` |

## PowerShell Tips

### Useful Aliases

Add to your PowerShell profile (`$PROFILE`):

```powershell
# CogniMesh shortcuts
function cm { Set-Location C:\path\to\Ckamal }
function cm-start { cm; npm start }
function cm-dev { cm; npm run dev }
function cm-doctor { cm; npm run doctor }
function cm-logs { cm; Get-Content .\logs\app.log -Tail 50 -Wait }
```

### Environment Variables

Set persistent environment variables:

```powershell
[Environment]::SetEnvironmentVariable("COGNIMESH_PORT", "3000", "User")
```

## Firewall Configuration

If accessing from other devices, allow ports through Windows Firewall:

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "CogniMesh Main" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
New-NetFirewallRule -DisplayName "CogniMesh Dashboard" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
New-NetFirewallRule -DisplayName "CogniMesh WebSocket" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

## Verification Checklist

- [ ] Node.js v18+ installed
- [ ] Git for Windows installed
- [ ] Repository cloned
- [ ] `npm install` completed without errors
- [ ] `.env` file created and configured
- [ ] `data/`, `cache/`, `logs/` directories created
- [ ] `npm run doctor` shows all checks passing
- [ ] `npm start` starts the server successfully
- [ ] Dashboard accessible at http://localhost:3001

## Getting Help

If you encounter issues:

1. Run `npm run doctor` for diagnostics
2. Check logs in `logs/` directory
3. Review [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
4. Open an issue on GitHub with Windows version and error details

## See Also

- [Main README](../README.md)
- [Deployment Guide](../DEPLOYMENT.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
