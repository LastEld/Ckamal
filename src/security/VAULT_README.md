# HashiCorp Vault Integration (SEC-001)

Secure secrets management for CogniMesh using HashiCorp Vault.

## Overview

The Vault integration provides a secure way to manage API keys, tokens, and other sensitive configuration values. It supports:

- **Secure storage** of secrets in HashiCorp Vault
- **Automatic fallback** to environment variables when Vault is unavailable
- **Local caching** for improved performance
- **Secret rotation** capabilities
- **Batch operations** for efficient secret retrieval

## Quick Start

### 1. Install Dependencies

```bash
npm install node-vault
```

### 2. Configure Environment

Add to your `.env`:

```env
VAULT_ENABLED=true
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=your-vault-token
VAULT_FALLBACK_ENABLED=true
```

### 3. Basic Usage

```javascript
import { vaultManager } from './src/security/vault.js';

// Connect to Vault
await vaultManager.connect();

// Get a secret
const apiKey = await vaultManager.getSecret('api/anthropic');

// Store a secret
await vaultManager.setSecret('api/custom', 'my-secret-value');
```

## Secret Paths

Default path mappings:

| Vault Path | Environment Variable | Purpose |
|------------|---------------------|---------|
| `api/anthropic` | `ANTHROPIC_API_KEY` | Claude API access |
| `api/kimi` | `KIMI_API_KEY` | Moonshot Kimi API |
| `api/openai` | `OPENAI_API_KEY` | OpenAI/Codex API |
| `auth/github` | `GITHUB_TOKEN` | GitHub integration |
| `database/url` | `DATABASE_URL` | Database connection |
| `security/jwt` | `JWT_SECRET` | JWT signing |

## API Reference

### `VaultManager`

#### `connect(config)`

Connect to Vault server.

```javascript
await vaultManager.connect({
  endpoint: 'http://localhost:8200',  // Vault address
  token: 'your-token',                 // Auth token
  namespace: 'admin',                  // Enterprise namespace (optional)
  cacheEnabled: true,                  // Enable local cache
  fallbackEnabled: true                // Allow env var fallback
});
```

#### `getSecret(path, options)`

Retrieve a secret from Vault.

```javascript
const secret = await vaultManager.getSecret('api/anthropic', {
  useCache: true,        // Use cached value if available
  allowFallback: true    // Allow fallback to env vars
});
```

#### `setSecret(path, value, options)`

Store a secret in Vault.

```javascript
await vaultManager.setSecret('api/custom', 'secret-value', {
  metadata: {
    description: 'Custom API key',
    owner: 'team-name'
  }
});
```

#### `rotateSecret(path, options)`

Rotate a secret with auto-generated value.

```javascript
const result = await vaultManager.rotateSecret('api/temp-key', {
  length: 32,
  prefix: 'prod_'
});
console.log(result.metadata.version);  // New version number
```

#### `getSecrets(paths, options)`

Retrieve multiple secrets in parallel.

```javascript
const secrets = await vaultManager.getSecrets([
  'api/anthropic',
  'api/kimi',
  'auth/github'
]);
// Returns: { 'api/anthropic': '...', 'api/kimi': '...', ... }
```

#### `getStatus()`

Get connection status.

```javascript
const status = vaultManager.getStatus();
// {
//   connected: true,
//   endpoint: 'http://localhost:8200',
//   cacheSize: 5,
//   fallbackEnabled: true
// }
```

## Integration with Config

### Before (Direct env vars):

```javascript
const config = {
  clients: {
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY  // ❌ Direct env access
    }
  }
};
```

### After (Vault integration):

```javascript
import { loadConfigWithVault } from './src/config.js';

const config = await loadConfigWithVault();
// Automatically retrieves secrets from Vault with env fallback
```

### Manual Config Integration:

```javascript
import { vaultManager } from './src/security/vault.js';

// Connect first
await vaultManager.connect({ fallbackEnabled: true });

// Then use in config
const config = {
  clients: {
    claude: {
      apiKey: await vaultManager.getSecret('api/anthropic')  // ✅ Vault + fallback
    }
  }
};
```

## Vault Setup

### 1. Start Vault Server

```bash
# Development mode
vault server -dev

# Or with config
vault server -config=vault.hcl
```

### 2. Enable KV Secrets Engine

```bash
# Enable KV v2 at 'secret' path
vault secrets enable -path=secret -version=2 kv
```

### 3. Create Secrets

```bash
# Store API keys
vault kv put secret/api/anthropic value=sk-ant-xxxxx
vault kv put secret/api/kimi value=sk-xxxxx
vault kv put secret/api/openai value=sk-xxxxx
vault kv put secret/auth/github value=ghp_xxxxx

# Store with metadata
vault kv put secret/database/url \
  value="postgresql://user:pass@localhost/cognimesh" \
  environment=production
```

### 4. Create Policy

```hcl
# cognimesh-policy.hcl
path "secret/data/api/*" {
  capabilities = ["read", "create", "update"]
}

path "secret/data/auth/*" {
  capabilities = ["read", "create", "update"]
}

path "secret/data/database/*" {
  capabilities = ["read"]
}
```

```bash
vault policy write cognimesh cognimesh-policy.hcl
```

### 5. Create Token

```bash
vault token create -policy=cognimesh -display-name=cognimesh-server
```

## Migration from Environment Variables

Use the built-in migration tool:

```javascript
import { vaultManager } from './src/security/vault.js';

await vaultManager.connect();

// Import all known secrets from env to Vault
const results = await vaultManager.initializeFromEnv();

console.log('Imported:', results.imported.length);
console.log('Skipped:', results.skipped.length);
```

## Fallback Behavior

When Vault is unavailable:

1. **Cache hit**: Returns cached value
2. **Environment variable**: Returns matching env var
3. **Error thrown**: If no fallback available

```javascript
// Priority order:
// 1. Vault (if connected)
// 2. Local cache (if enabled)
// 3. Environment variable (if fallback enabled)
// 4. Throw error
```

## Caching

Local caching improves performance:

```javascript
await vaultManager.connect({
  cacheEnabled: true,
  cacheTTL: 300000  // 5 minutes
});

// First call - from Vault
const secret1 = await vaultManager.getSecret('api/anthropic');

// Second call - from cache (instant)
const secret2 = await vaultManager.getSecret('api/anthropic');

// Clear cache
vaultManager.clearCache('api/anthropic');  // Specific path
vaultManager.clearCache();                  // All paths
```

## Error Handling

```javascript
import { vaultManager, VaultError } from './src/security/vault.js';

try {
  const secret = await vaultManager.getSecret('nonexistent/path');
} catch (error) {
  if (error instanceof VaultError) {
    console.log('Error code:', error.code);
    console.log('Message:', error.message);
    console.log('Details:', error.details);
  }
}
```

Error codes:
- `VAULT_NOT_CONNECTED` - Vault connection required
- `SECRET_NOT_FOUND` - Secret doesn't exist
- `SECRET_STORE_FAILED` - Failed to store secret
- `VAULT_CONNECTION_FAILED` - Initial connection failed

## Production Deployment

### Docker Compose

```yaml
version: '3'
services:
  vault:
    image: hashicorp/vault:latest
    ports:
      - "8200:8200"
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: dev-token
    cap_add:
      - IPC_LOCK
    
  cognimesh:
    build: .
    environment:
      VAULT_ADDR: http://vault:8200
      VAULT_TOKEN: dev-token
      VAULT_ENABLED: "true"
    depends_on:
      - vault
```

### Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: vault-token
type: Opaque
stringData:
  token: your-vault-token
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cognimesh
spec:
  template:
    spec:
      containers:
      - name: cognimesh
        env:
        - name: VAULT_TOKEN
          valueFrom:
            secretKeyRef:
              name: vault-token
              key: token
        - name: VAULT_ADDR
          value: "http://vault:8200"
```

## Security Best Practices

1. **Never commit tokens** - Use environment variables or Kubernetes secrets
2. **Use least privilege** - Create dedicated Vault policies
3. **Enable audit logs** - Track all secret access
4. **Rotate tokens regularly** - Use short-lived tokens where possible
5. **Enable TLS** - Use HTTPS in production (`VAULT_ADDR=https://...`)
6. **Use KV v2** - Enables versioning and soft deletes

## Troubleshooting

### Connection Issues

```bash
# Check Vault status
vault status

# Test with curl
curl -H "X-Vault-Token: $VAULT_TOKEN" \
  $VAULT_ADDR/v1/secret/data/api/anthropic
```

### Enable Debug Logging

```javascript
vaultManager.logger = {
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.log
};
```

### Common Issues

| Issue | Solution |
|-------|----------|
| `Connection refused` | Check VAULT_ADDR and Vault server status |
| `Permission denied` | Verify token has correct policy |
| `Path not found` | Enable KV secrets engine at correct path |
| `Secret not found` | Store secret with `vault kv put` first |

## See Also

- [examples/vault-integration.js](../../examples/vault-integration.js) - Complete examples
- [HashiCorp Vault Docs](https://www.vaultproject.io/docs)
- [node-vault](https://github.com/kr1sp1n/node-vault) - Node.js client
