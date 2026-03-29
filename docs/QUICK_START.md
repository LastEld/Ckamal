# CogniMesh Quick Start Guide

**Get up and running with CogniMesh in 5 minutes.**

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [First Company Setup](#first-company-setup)
4. [First Agent Deployment](#first-agent-deployment)
5. [Dashboard Overview](#dashboard-overview)
6. [Next Steps](#next-steps)

---

## Prerequisites

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Node.js | 18.x | 20.x LTS |
| RAM | 4 GB | 8 GB |
| Disk | 1 GB free | 5 GB free |
| OS | Linux/macOS/Windows | Linux/macOS |

### Required Accounts

CogniMesh routes through your existing subscription clients - **no API keys needed!**

| Provider | Subscription | Cost |
|----------|--------------|------|
| Anthropic Claude | Claude Pro or Max | ~$20/month |
| OpenAI | ChatGPT Pro or Plus | ~$20/month |
| Moonshot Kimi | Kimi Subscription | ~$18/month |

---

## Installation

### Option 1: Interactive Setup (Recommended)

The interactive wizard configures everything automatically:

```bash
# Clone the repository
git clone https://github.com/LastEld/Ckamal.git
cd Ckamal

# Install dependencies
npm install

# Run the interactive setup wizard
npm run setup

# Start the system
npm start
```

The setup wizard will guide you through:
1. ✓ Environment configuration
2. ✓ Database initialization
3. ✓ AI client detection
4. ✓ Admin user creation
5. ✓ Service startup

### Option 2: Manual Setup

For advanced users who prefer manual configuration:

```bash
# Clone and install
git clone https://github.com/LastEld/Ckamal.git
cd Ckamal
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env  # or your preferred editor

# Initialize database
npm run db:migrate

# Verify installation
npm run verify:release

# Start the system
npm start
```

### Environment Configuration

Edit `.env` with your paths (only if using non-default locations):

```bash
# Optional: AI Client Paths (auto-detected if not set)
CLAUDE_CLI_PATH=/usr/local/bin/claude
CODEX_CLI_PATH=/usr/local/bin/codex
KIMI_CLI_PATH=/usr/local/bin/kimi

# Optional: VS Code Extension Sockets
CLAUDE_VSCODE_SOCKET_PATH=/tmp/claude-vscode.sock
CODEX_VSCODE_PORT=8080
KIMI_VSCODE_SOCKET_PATH=/tmp/kimi-vscode.sock

# Infrastructure (defaults usually work)
DATABASE_PATH=./data/cognimesh.db
COGNIMESH_PORT=3000
DASHBOARD_PORT=3001

# Required for GitHub integration
GITHUB_TOKEN=ghp_your_token_here
```

### Verify Installation

Run the comprehensive verification suite:

```bash
# Full verification (lint + unit + integration + e2e + provider-matrix)
npm run verify:release

# Quick health check
npm run bios:diagnose

# Test all AI clients
npm run verify:provider-matrix
```

Expected output:
```
✓ Lint passed
✓ Unit tests passed (50+)
✓ Integration tests passed (25+)
✓ E2E tests passed
✓ Provider matrix verified (7 models)
✓ All systems operational
```

---

## First Company Setup

### Step 1: Access the Dashboard

Open your browser to: http://localhost:3001

You'll see the CogniMesh login screen. Use the admin credentials created during setup.

### Step 2: Create Your Company

1. Navigate to **Settings** → **Company**
2. Click **Create Company**
3. Fill in the details:
   - **Name**: Your organization name
   - **Slug**: URL-friendly identifier (auto-generated)
   - **Plan**: Select your subscription tier
4. Click **Save**

### Step 3: Configure AI Providers

1. Go to **Providers** in the sidebar
2. Enable the providers you have subscriptions for:
   - ☑️ Anthropic Claude
   - ☑️ OpenAI Codex
   - ☑️ Moonshot Kimi
3. Verify each provider shows **Connected** status

### Step 4: Set Up Your Team

1. Navigate to **Team** → **Members**
2. Click **Invite Member**
3. Enter email addresses and select roles:
   - **Admin**: Full system access
   - **Operator**: Can manage agents and tasks
   - **Viewer**: Read-only access
4. Send invitations

### Step 5: Configure Default Settings

1. Go to **Settings** → **Defaults**
2. Set your preferences:
   - Default AI model for new tasks
   - Maximum agents per workflow
   - Notification preferences
   - Retention policies

---

## First Agent Deployment

### Step 1: Create an Agent CV

A CV (Curriculum Vitae) defines what an agent can do.

1. Navigate to **CVs** in the sidebar
2. Click **Create CV**
3. Choose a template:
   - **Analyst**: Data analysis and reporting
   - **Developer**: Code generation and review
   - **Reviewer**: Code review and quality assurance
   - **Custom**: Build your own

4. Fill in the CV details:
```yaml
Name: Code Reviewer Alpha
Template: Reviewer
Capabilities:
  - code_review
  - security_audit
  - performance_analysis
Model Preference: claude-sonnet-4-6
Max Concurrent Tasks: 5
```

5. Click **Create** and then **Activate**

### Step 2: Create a Workflow

Workflows orchestrate multiple agents.

1. Go to **Workflows** in the sidebar
2. Click **Create Workflow**
3. Enter workflow details:
```yaml
Name: PR Review Pipeline
Description: Automated pull request review
Type: CHAINED
```

4. Add steps to your workflow:
```yaml
Step 1:
  Name: Security Scan
  Agent: Code Reviewer Alpha
  Tool: security_scan
  
Step 2:
  Name: Code Review
  Agent: Code Reviewer Alpha
  Tool: code_review
  Depends On: Step 1
```

5. Click **Save Workflow**

### Step 3: Execute the Workflow

1. Find your workflow in the list
2. Click the **Execute** button (▶️)
3. Provide input parameters:
```json
{
  "repository": "my-org/my-repo",
  "pr_number": 42,
  "branch": "feature/new-feature"
}
```

4. Click **Start Execution**
5. Watch real-time progress in the execution panel

### Step 4: Monitor Results

1. View live execution logs
2. Check agent status indicators
3. Review completed tasks
4. Download execution reports

---

## Dashboard Overview

### Main Navigation

```
┌─────────────────────────────────────────────────────────┐
│  🧠 CogniMesh                               [User] ▼   │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Dashboard│  Welcome to CogniMesh                        │
│ Agents   │                                              │
│ Tasks    │  ┌─────────────┐ ┌─────────────┐            │
│ Workflows│  │ Active      │ │ Completed   │            │
│ CVs      │  │ Agents: 3   │ │ Tasks: 152  │            │
│ Context  │  └─────────────┘ └─────────────┘            │
│ Roadmaps │                                              │
│ Analytics│  Recent Activity                             │
│ Providers│  ─────────────────────                      │
│ Team     │  ✓ Workflow completed: PR Review #42        │
│ Settings │  ✓ Agent activated: Code Reviewer Alpha     │
│          │  ⏳ Task running: Security Scan             │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

### Key Dashboard Sections

| Section | Purpose | URL |
|---------|---------|-----|
| **Dashboard** | Overview and quick stats | `/` |
| **Agents** | Active agent monitoring | `/agents` |
| **Tasks** | Task management (Eisenhower Matrix) | `/tasks` |
| **Workflows** | GSD workflow management | `/workflows` |
| **CVs** | Agent CV management | `/cvs` |
| **Context** | Snapshot save/restore | `/context` |
| **Roadmaps** | Educational paths | `/roadmaps` |
| **Analytics** | Performance dashboards | `/analytics` |
| **Providers** | AI client status | `/providers` |

### Command Palette

Access quick commands with `Ctrl+K` (or `Cmd+K` on Mac):

```
┌─────────────────────────────────────┐
│  🔍 Search commands...              │
├─────────────────────────────────────┤
│  Create Task          ⌘ T           │
│  Create Workflow      ⌘ W           │
│  Create CV            ⌘ C           │
│  View Agents          ⌘ A           │
│  System Status        ⌘ S           │
│  Settings             ⌘ ,           │
└─────────────────────────────────────┘
```

---

## Next Steps

### Explore MCP Tools

CogniMesh exposes 58 MCP tools across 5 categories:

```bash
# List all available tools
curl http://localhost:3000/api/tools

# Execute a tool
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "task_create",
    "params": {
      "title": "Learn CogniMesh",
      "priority": "high"
    }
  }'
```

### Try the BIOS Console

Access the interactive CLI:

```bash
# Start the BIOS console
npm run bios:boot

# Or use the CLI directly
cognimesh status
cognimesh agents list
cognimesh tasks create --title "My Task"
```

### Read the Documentation

| Document | Description |
|----------|-------------|
| [Architecture Guide](../ARCHITECTURE.md) | System design and components |
| [API Reference](../API_REFERENCE.md) | Complete API documentation |
| [Deployment Guide](../DEPLOYMENT.md) | Production deployment |

### Join the Community

- **GitHub Discussions**: Share ideas and get help
- **Issue Tracker**: Report bugs and request features
- **Documentation**: https://lasteld.github.io/Ckamal/

---

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Change ports in .env
COGNIMESH_PORT=3002
DASHBOARD_PORT=3003
```

**Database locked:**
```bash
# Reset database (warning: data loss)
rm ./data/cognimesh.db
npm run db:migrate
```

**AI client not detected:**
```bash
# Verify client installation
which claude
which codex
which kimi

# Or set paths manually in .env
```

### Getting Help

Run the diagnostic tool:
```bash
npm run doctor
```

Check system status:
```bash
npm run bios:diagnose
```

View logs:
```bash
# Server logs
tail -f logs/server.log

# BIOS logs
tail -f logs/bios.log
```

---

## Success! 🎉

You now have:
- ✅ CogniMesh v5.0 installed and running
- ✅ Company configured with team members
- ✅ First agent CV created and activated
- ✅ Workflow executed successfully

**What's next?**
- Create more specialized agent CVs
- Build complex multi-step workflows
- Explore the 58 built-in MCP tools
- Set up automated roadmaps
- Configure alerts and monitoring

---

*Quick Start Guide v1.0*  
*CogniMesh v5.0*
