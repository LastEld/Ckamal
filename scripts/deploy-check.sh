#!/bin/bash
#
# CogniMesh Deployment Check Script
# Validates the deployment environment before deploying
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Track results
ERRORS=0
WARNINGS=0

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((ERRORS++))
}

# Header
echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     CogniMesh v5.0 - Pre-Deployment Checklist            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check Node.js version
echo ""
log_info "Checking Node.js version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
    if [ "$MAJOR" -ge 20 ]; then
        log_success "Node.js version: $NODE_VERSION (>= 20.x)"
    else
        log_error "Node.js version $NODE_VERSION is too old (requires >= 20.x)"
    fi
else
    log_warning "Node.js not found (optional for Docker deployments)"
fi

# Check npm
echo ""
log_info "Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    log_success "npm version: $NPM_VERSION"
else
    log_warning "npm not found (optional for Docker deployments)"
fi

# Check Docker
echo ""
log_info "Checking Docker..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
    log_success "Docker version: $DOCKER_VERSION"
    
    # Check if Docker daemon is running
    if docker info &> /dev/null; then
        log_success "Docker daemon is running"
    else
        log_warning "Docker daemon is not running"
    fi
else
    log_warning "Docker not found"
fi

# Check docker-compose
echo ""
log_info "Checking Docker Compose..."
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    log_success "Docker Compose is available"
else
    log_warning "Docker Compose not found"
fi

# Check kubectl (for K8s deployments)
echo ""
log_info "Checking kubectl..."
if command -v kubectl &> /dev/null; then
    KUBECTL_VERSION=$(kubectl version --client --short 2>/dev/null | cut -d' ' -f3)
    log_success "kubectl version: $KUBECTL_VERSION"
else
    log_warning "kubectl not found (required for Kubernetes deployments)"
fi

# Check environment files
echo ""
log_info "Checking environment files..."

if [ -f "$PROJECT_ROOT/.env" ]; then
    log_success ".env file exists"
    
    # Check if it has required variables
    if grep -q "GITHUB_TOKEN=" "$PROJECT_ROOT/.env"; then
        TOKEN=$(grep "GITHUB_TOKEN=" "$PROJECT_ROOT/.env" | cut -d'=' -f2)
        if [ -n "$TOKEN" ] && [ "$TOKEN" != "ghp_xxxxxxxxxxxxxxxxxxxx" ]; then
            log_success "GITHUB_TOKEN is set"
        else
            log_error "GITHUB_TOKEN is not configured"
        fi
    else
        log_error "GITHUB_TOKEN not found in .env"
    fi
    
    if grep -q "JWT_SECRET=" "$PROJECT_ROOT/.env"; then
        SECRET=$(grep "JWT_SECRET=" "$PROJECT_ROOT/.env" | cut -d'=' -f2)
        if [ -n "$SECRET" ] && [ ${#SECRET} -ge 32 ]; then
            log_success "JWT_SECRET is set and meets minimum length"
        else
            log_error "JWT_SECRET is too short (min 32 chars)"
        fi
    else
        log_error "JWT_SECRET not found in .env"
    fi
else
    log_warning ".env file not found (copy from .env.example)"
fi

# Check required directories
echo ""
log_info "Checking directory structure..."
REQUIRED_DIRS=("data" "cache" "logs" "backups")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$PROJECT_ROOT/$dir" ]; then
        log_success "Directory $dir exists"
    else
        log_warning "Directory $dir does not exist (will be created)"
    fi
done

# Check configuration files
echo ""
log_info "Checking configuration files..."

if [ -f "$PROJECT_ROOT/config/production.json" ]; then
    log_success "Production config exists"
else
    log_warning "Production config not found"
fi

# Check Docker files
echo ""
log_info "Checking Docker configuration..."

if [ -f "$PROJECT_ROOT/Dockerfile" ]; then
    log_success "Dockerfile exists"
else
    log_error "Dockerfile not found"
fi

if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    log_success "docker-compose.yml exists"
else
    log_error "docker-compose.yml not found"
fi

# Check Kubernetes manifests
echo ""
log_info "Checking Kubernetes manifests..."

K8S_FILES=("namespace.yaml" "configmap.yaml" "secret.yaml" "deployment.yaml" "service.yaml")
for file in "${K8S_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/k8s/$file" ]; then
        log_success "K8s manifest: $file"
    else
        log_warning "K8s manifest missing: $file"
    fi
done

# Check GitHub Actions
echo ""
log_info "Checking GitHub Actions workflows..."

WORKFLOW_FILES=("ci.yml" "docker-build.yml" "deploy-staging.yml" "deploy-production.yml" "security-scan.yml")
for file in "${WORKFLOW_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/.github/workflows/$file" ]; then
        log_success "Workflow: $file"
    else
        log_warning "Workflow missing: $file"
    fi
done

# Check package.json scripts
echo ""
log_info "Checking package.json scripts..."

if [ -f "$PROJECT_ROOT/package.json" ]; then
    if grep -q '"start"' "$PROJECT_ROOT/package.json"; then
        log_success "npm start script exists"
    else
        log_warning "npm start script not found"
    fi
    
    if grep -q '"test"' "$PROJECT_ROOT/package.json"; then
        log_success "npm test script exists"
    else
        log_warning "npm test script not found"
    fi
fi

# Validate environment (Node.js script)
echo ""
log_info "Running environment validation..."
if [ -f "$PROJECT_ROOT/scripts/validate-deployment.js" ]; then
    if node "$PROJECT_ROOT/scripts/validate-deployment.js"; then
        log_success "Environment validation passed"
    else
        log_error "Environment validation failed"
    fi
else
    log_warning "Validation script not found"
fi

# Summary
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                        SUMMARY${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready for deployment.${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found. Deployment can proceed with caution.${NC}"
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) and $WARNINGS warning(s) found. Fix errors before deploying.${NC}"
    exit 1
fi
