# Context Profiles

Context profiles allow you to manage multiple CogniMesh environments (development, staging, production) with different configurations.

## Overview

A context profile stores:
- API endpoint URL
- Company/organization ID
- Authentication token
- Default model preferences
- UI theme settings

## Profile Management

### Listing Profiles

```bash
# List all profiles
cognimesh context list
cognimesh context ls
```

Output shows:
- Profile name (with `*` indicating active profile)
- API URL
- Company ID
- Authentication status
- Last updated date

### Creating a Profile

```bash
# Create a basic profile
cognimesh context create development

# Create with API URL
cognimesh context create staging \
  --api-url https://staging-api.cognimesh.io

# Create with company ID
cognimesh context create production \
  --api-url https://api.cognimesh.io \
  --company-id COMP-PROD-001

# Create with authentication
cognimesh context create team-a \
  --api-url https://api.cognimesh.io \
  --company-id COMP-001 \
  --auth-token "your-api-token"

# Create and immediately switch to it
cognimesh context create testing --switch
```

**Available options:**

| Option | Description |
|--------|-------------|
| `--api-url <url>` | API endpoint URL |
| `--company-id <id>` | Company/organization identifier |
| `--auth-token <token>` | Authentication token |
| `--default-model <model>` | Default AI model preference |
| `--theme <theme>` | UI theme: `light`, `dark`, `system` |
| `--switch` | Activate profile after creation |

### Switching Profiles

```bash
# Switch to a profile
cognimesh context switch production
cognimesh context sw staging

# Switch using partial name (if unique)
cognimesh context sw dev  # matches "development"
```

When you switch profiles, the CLI displays:
- New active profile name
- Previous profile name
- API URL
- Company ID
- Authentication status

### Viewing Profile Details

```bash
# Show current profile
cognimesh context show

# Show specific profile
cognimesh context show production

# Show with environment variable resolution
cognimesh context show --resolved
```

The `--resolved` flag shows values with source indicators:
- `[profile]` - Value from profile configuration
- `[env]` - Value from environment variable override

### Deleting Profiles

```bash
# Delete a profile (requires --force)
cognimesh context delete old-profile --force

# Cannot delete default without --force
cognimesh context delete default --force
```

When deleting the currently active profile, the CLI automatically switches to the `default` profile.

## Import and Export

### Exporting Profiles

```bash
# Export to stdout
cognimesh context export production

# Export to file
cognimesh context export production --file prod-profile.json
```

Exported JSON format:

```json
{
  "name": "production",
  "apiUrl": "https://api.cognimesh.io",
  "companyId": "COMP-PROD-001",
  "authToken": "abc123...",
  "preferences": {
    "defaultModel": "auto",
    "theme": "system"
  },
  "createdAt": "2026-03-01T10:00:00Z",
  "updatedAt": "2026-03-15T14:30:00Z"
}
```

### Importing Profiles

```bash
# Import from file
cognimesh context import ./prod-profile.json

# Import with new name
cognimesh context import ./profile.json --name "imported-prod"

# Import and overwrite existing
cognimesh context import ./profile.json --force

# Import and switch immediately
cognimesh context import ./profile.json --switch
```

## Environment Variable Overrides

Environment variables override profile settings:

| Variable | Overrides |
|----------|-----------|
| `COGNIMESH_API_URL` | Profile's `apiUrl` |
| `COGNIMESH_COMPANY_ID` | Profile's `companyId` |
| `COGNIMESH_AUTH_TOKEN` | Profile's `authToken` |

Example:

```bash
# Override API URL for a single command
COGNIMESH_API_URL=https://alt-api.cognimesh.io cognimesh status

# Set for session
export COGNIMESH_COMPANY_ID=COMP-TEMP-001
cognimesh company list
```

## Common Workflows

### Development Workflow

```bash
# Create development profile
cognimesh context create dev \
  --api-url http://localhost:3000 \
  --company-id COMP-DEV-001

# Switch to development
cognimesh context switch dev

# Work on features...
cognimesh tasks create "Implement feature X"
```

### CI/CD Pipeline

```bash
# In CI/CD, use environment variables
export COGNIMESH_API_URL="$PROD_API_URL"
export COGNIMESH_AUTH_TOKEN="$PROD_TOKEN"

# Run deployment approval
cognimesh approval approve "$APPROVAL_ID" --comment "CI/CD approved"
```

### Team Collaboration

```bash
# Export team profile
cognimesh context export team-shared --file team-profile.json

# Share file securely with team members

# Team members import
cognimesh context import ./team-profile.json --name "team-shared"
```

## Profile Storage

Profiles are stored in:

```
~/.config/cognimesh/profiles/
├── default.json
├── development.json
├── production.json
└── current-profile  (symlink or file with active profile name)
```

## Best Practices

1. **Name profiles clearly**: Use environment names (`dev`, `staging`, `prod`)
2. **Secure tokens**: Never commit profiles with auth tokens to version control
3. **Use environment variables**: For CI/CD and sensitive values
4. **Regular cleanup**: Delete old/unused profiles
5. **Export backups**: Keep exports of important profiles

## Troubleshooting

### Profile Not Found

```bash
# Check available profiles
cognimesh context list

# Verify profile name spelling
cognimesh context show "exact-profile-name"
```

### Authentication Issues

```bash
# Check current profile auth status
cognimesh context show

# Verify token is set
cognimesh context show --resolved

# Update auth token
cognimesh context switch production
# Edit profile or use environment variable
```

### Switch Failed

```bash
# Verify profile exists
cognimesh context list

# Check if profile file is valid JSON
cat ~/.config/cognimesh/profiles/production.json | jq .
```
