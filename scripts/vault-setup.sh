#!/bin/bash
# =============================================================================
# HashiCorp Vault Setup Script for CogniMesh
# =============================================================================
# This script initializes Vault and creates the necessary secrets structure
# for CogniMesh integration.
#
# Prerequisites:
#   - Vault CLI installed: https://developer.hashicorp.com/vault/downloads
#   - Vault server running (dev mode or production)
#
# Usage:
#   chmod +x scripts/vault-setup.sh
#   ./scripts/vault-setup.sh
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
MOUNT_POINT="${VAULT_MOUNT_POINT:-secret}"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        CogniMesh Vault Setup & Configuration                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if vault CLI is available
if ! command -v vault &> /dev/null; then
    echo -e "${RED}❌ Vault CLI not found${NC}"
    echo "   Install from: https://developer.hashicorp.com/vault/downloads"
    exit 1
fi

echo -e "${BLUE}📍 Vault Address: ${VAULT_ADDR}${NC}"
echo ""

# Check Vault status
echo -e "${BLUE}🔍 Checking Vault status...${NC}"
if ! vault status &> /dev/null; then
    echo -e "${RED}❌ Vault is not running or not accessible${NC}"
    echo "   Start Vault with: vault server -dev"
    exit 1
fi
echo -e "${GREEN}✓ Vault is running${NC}"
echo ""

# Check authentication
if [ -z "$VAULT_TOKEN" ]; then
    echo -e "${YELLOW}⚠ VAULT_TOKEN not set${NC}"
    echo "   Set it with: export VAULT_TOKEN=your-token"
    echo ""
    echo -e "${BLUE}Attempting to login...${NC}"
    vault login
else
    echo -e "${GREEN}✓ VAULT_TOKEN is set${NC}"
fi

# Verify token works
if ! vault token lookup &> /dev/null; then
    echo -e "${RED}❌ Invalid VAULT_TOKEN${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Token is valid${NC}"
echo ""

# Enable KV secrets engine v2
echo -e "${BLUE}🔧 Setting up KV secrets engine v2...${NC}"
if vault secrets list | grep -q "^${MOUNT_POINT}/"; then
    echo -e "${YELLOW}⚠ KV engine already enabled at ${MOUNT_POINT}/${NC}"
else
    vault secrets enable -path="${MOUNT_POINT}" -version=2 kv
    echo -e "${GREEN}✓ KV v2 enabled at ${MOUNT_POINT}/${NC}"
fi
echo ""

# Create directory structure
echo -e "${BLUE}📁 Creating secret paths...${NC}"

# API keys path
vault kv put "${MOUNT_POINT}/api/anthropic" value="placeholder" description="Anthropic Claude API Key"
vault kv put "${MOUNT_POINT}/api/kimi" value="placeholder" description="Moonshot Kimi API Key"
vault kv put "${MOUNT_POINT}/api/openai" value="placeholder" description="OpenAI API Key"
echo -e "${GREEN}✓ Created /api/* paths${NC}"

# Auth path
vault kv put "${MOUNT_POINT}/auth/github" value="placeholder" description="GitHub Personal Access Token"
echo -e "${GREEN}✓ Created /auth/* paths${NC}"

# Security path
vault kv put "${MOUNT_POINT}/security/jwt" value="placeholder" description="JWT Signing Secret"
vault kv put "${MOUNT_POINT}/security/session" value="placeholder" description="Session Secret"
echo -e "${GREEN}✓ Created /security/* paths${NC}"

# Database path
vault kv put "${MOUNT_POINT}/database/url" value="placeholder" description="Database Connection String"
echo -e "${GREEN}✓ Created /database/* paths${NC}"

echo ""

# Create policy
echo -e "${BLUE}🔐 Creating CogniMesh policy...${NC}"
cat > /tmp/cognimesh-policy.hcl << 'EOF'
# Read API keys
path "secret/data/api/*" {
  capabilities = ["read"]
}

# Read auth tokens
path "secret/data/auth/*" {
  capabilities = ["read"]
}

# Read security secrets
path "secret/data/security/*" {
  capabilities = ["read"]
}

# Read database credentials
path "secret/data/database/*" {
  capabilities = ["read"]
}

# Allow listing
path "secret/metadata/*" {
  capabilities = ["list"]
}
EOF

vault policy write cognimesh /tmp/cognimesh-policy.hcl
rm /tmp/cognimesh-policy.hcl
echo -e "${GREEN}✓ Policy 'cognimesh' created${NC}"
echo ""

# Create token
echo -e "${BLUE}🔑 Creating CogniMesh token...${NC}"
echo -e "${YELLOW}Note: Save this token for your application${NC}"
echo ""

TOKEN_OUTPUT=$(vault token create -policy=cognimesh -display-name="cognimesh-server" -format=json)
TOKEN=$(echo "$TOKEN_OUTPUT" | grep -o '"client_token": "[^"]*"' | cut -d'"' -f4)
TOKEN_ACCESSOR=$(echo "$TOKEN_OUTPUT" | grep -o '"accessor": "[^"]*"' | head -1 | cut -d'"' -f4)

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Token:        ${TOKEN}${NC}"
echo -e "${GREEN}Accessor:     ${TOKEN_ACCESSOR}${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Show current secrets
echo -e "${BLUE}📋 Current secrets structure:${NC}"
vault kv list "${MOUNT_POINT}/" || true
echo ""

# Summary
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Vault setup complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Store your actual secrets:"
echo "     vault kv put ${MOUNT_POINT}/api/anthropic value=sk-ant-xxxxx"
echo "     vault kv put ${MOUNT_POINT}/api/kimi value=sk-xxxxx"
echo "     vault kv put ${MOUNT_POINT}/auth/github value=ghp_xxxxx"
echo ""
echo "  2. Or migrate from .env file:"
echo "     node scripts/vault-migrate.js"
echo ""
echo "  3. Configure CogniMesh:"
echo "     export VAULT_ADDR=${VAULT_ADDR}"
echo "     export VAULT_TOKEN=${TOKEN}"
echo "     export VAULT_ENABLED=true"
echo ""
echo "  4. Test the connection:"
echo "     vault kv get ${MOUNT_POINT}/api/anthropic"
echo ""
