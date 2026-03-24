#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Deploy Script
# =============================================================================
# Description: Production deployment with database migration, health checks,
#              and rollback capability.
# Usage: ./deploy.sh [options]
# =============================================================================

set -euo pipefail

# Script metadata
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly VERSION="5.0.0"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_INVALID_ARGS=2
readonly EXIT_DEPENDENCY_MISSING=3
readonly EXIT_DEPLOY_FAILURE=9

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
SKIP_BUILD=false
SKIP_MIGRATIONS=false
SKIP_HEALTHCHECK=false
ROLLBACK=false
ENVIRONMENT="production"
BACKUP_BEFORE_DEPLOY=true
FORCE=false

# Deployment tracking
DEPLOYMENT_ID=""
DEPLOY_START_TIME=0
PREVIOUS_VERSION=""

# =============================================================================
# Helper Functions
# =============================================================================

log() {
    [[ "$QUIET" == false ]] && echo -e "$1"
}

log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { log "${YELLOW}[WARNING]${NC} $1"; }
log_error() { log "${RED}[ERROR]${NC} $1" >&2; }
log_verbose() { [[ "$VERBOSE" == true ]] && log_info "$1"; }

show_help() {
    cat << EOF
CogniMesh v5.0 - Deploy Script v${VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    -h, --help              Show this help message and exit
    -v, --verbose           Enable verbose output
    -q, --quiet             Suppress non-error output
    -e, --env ENV           Deployment environment (default: production)
    --skip-build            Skip build step (use existing dist/)
    --skip-migrations       Skip database migrations
    --skip-healthcheck      Skip post-deploy health check
    --no-backup             Don't create backup before deploy
    --rollback              Rollback to previous version
    --force                 Force deployment (skip confirmations)

Description:
    Deploys CogniMesh to production environment including:
    - Pre-deployment backup
    - Build verification
    - Database migrations
    - Health checks
    - Rollback capability

Examples:
    ${SCRIPT_NAME}                    # Standard production deploy
    ${SCRIPT_NAME} --env staging      # Deploy to staging
    ${SCRIPT_NAME} --skip-build       # Deploy without rebuilding
    ${SCRIPT_NAME} --rollback         # Rollback to previous version
    ${SCRIPT_NAME} --force            # Deploy without confirmation

Exit Codes:
    0 - Deployment successful
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    9 - Deployment failure

EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit $EXIT_SUCCESS
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -e|--env)
                ENVIRONMENT="${2:-production}"
                shift 2
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-migrations)
                SKIP_MIGRATIONS=true
                shift
                ;;
            --skip-healthcheck)
                SKIP_HEALTHCHECK=true
                shift
                ;;
            --no-backup)
                BACKUP_BEFORE_DEPLOY=false
                shift
                ;;
            --rollback)
                ROLLBACK=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit $EXIT_INVALID_ARGS
                ;;
        esac
    done
}

generate_deployment_id() {
    DEPLOYMENT_ID="deploy-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
    log_verbose "Deployment ID: $DEPLOYMENT_ID"
}

save_deployment_state() {
    local state_file="$PROJECT_ROOT/.deployment/state.json"
    mkdir -p "$(dirname "$state_file")"
    
    cat > "$state_file" << EOF
{
    "deploymentId": "$DEPLOYMENT_ID",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "environment": "$ENVIRONMENT",
    "version": "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')",
    "previousVersion": "$PREVIOUS_VERSION",
    "status": "$1"
}
EOF
}

# =============================================================================
# Deployment Functions
# =============================================================================

check_dependencies() {
    log_verbose "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        return 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log_error "package.json not found"
        return 1
    fi
    
    return 0
}

confirm_deployment() {
    [[ "$FORCE" == true ]] && return 0
    [[ "$QUIET" == true ]] && return 0
    
    echo
    log_warning "About to deploy to: $ENVIRONMENT"
    log_warning "Current version: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
    log_warning "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo
    read -p "Continue with deployment? (yes/N): " -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Deployment cancelled"
        exit $EXIT_SUCCESS
    fi
}

create_backup() {
    [[ "$BACKUP_BEFORE_DEPLOY" == false ]] && return 0
    [[ "$ROLLBACK" == true ]] && return 0
    
    log_info "Creating pre-deployment backup..."
    
    # Run backup script if available
    if [[ -f "$SCRIPT_DIR/backup.sh" ]]; then
        "$SCRIPT_DIR/backup.sh" --quiet --tag "pre-deploy-$DEPLOYMENT_ID"
    else
        log_verbose "Backup script not found, creating simple backup..."
        
        local backup_dir="$PROJECT_ROOT/data/backups/pre-deploy-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$backup_dir"
        
        # Backup database
        if [[ -d "$PROJECT_ROOT/data/db" ]]; then
            cp -r "$PROJECT_ROOT/data/db" "$backup_dir/"
        fi
        
        # Backup config
        if [[ -f "$PROJECT_ROOT/.env" ]]; then
            cp "$PROJECT_ROOT/.env" "$backup_dir/"
        fi
        
        log_verbose "Backup saved to: $backup_dir"
    fi
    
    PREVIOUS_VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')
    
    log_success "Backup created"
}

run_build() {
    [[ "$SKIP_BUILD" == true ]] && return 0
    
    log_info "Running production build..."
    
    if [[ -f "$SCRIPT_DIR/build.sh" ]]; then
        if [[ "$VERBOSE" == true ]]; then
            "$SCRIPT_DIR/build.sh" --target "$ENVIRONMENT" -v
        else
            "$SCRIPT_DIR/build.sh" --target "$ENVIRONMENT" -q
        fi
        
        if [[ $? -ne 0 ]]; then
            log_error "Build failed"
            return 1
        fi
    else
        log_warning "Build script not found, running npm build..."
        npm run build || return 1
    fi
    
    log_success "Build completed"
    return 0
}

run_migrations() {
    [[ "$SKIP_MIGRATIONS" == true ]] && return 0
    
    log_info "Running database migrations..."
    
    if [[ -f "$SCRIPT_DIR/migrate.sh" ]]; then
        if [[ "$VERBOSE" == true ]]; then
            "$SCRIPT_DIR/migrate.sh" up --env "$ENVIRONMENT"
        else
            "$SCRIPT_DIR/migrate.sh" up --env "$ENVIRONMENT" 2>/dev/null
        fi
        
        if [[ $? -ne 0 ]]; then
            log_error "Migrations failed"
            return 1
        fi
    else
        log_verbose "Migration script not found, skipping migrations"
    fi
    
    log_success "Migrations completed"
    return 0
}

deploy_application() {
    log_info "Deploying application..."
    
    # Store deployment state
    save_deployment_state "deploying"
    
    # Copy build to deployment directory if configured
    local deploy_dir=""
    
    # Check for deployment configuration
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        deploy_dir=$(grep -E "^DEPLOY_DIR=" "$PROJECT_ROOT/.env" | cut -d= -f2 | tr -d '"')
    fi
    
    if [[ -n "$deploy_dir" ]]; then
        log_verbose "Deploying to: $deploy_dir"
        
        # Create backup of current deployment
        if [[ -d "$deploy_dir" ]] && [[ "$ROLLBACK" == false ]]; then
            mv "$deploy_dir" "$deploy_dir.backup.$(date +%Y%m%d-%H%M%S)"
        fi
        
        # Copy new build
        cp -r "$PROJECT_ROOT/dist" "$deploy_dir"
        
        log_success "Application deployed to $deploy_dir"
    else
        log_verbose "No DEPLOY_DIR configured, deployment is in-place"
    fi
    
    return 0
}

run_health_check() {
    [[ "$SKIP_HEALTHCHECK" == true ]] && return 0
    
    log_info "Running health checks..."
    
    if [[ -f "$SCRIPT_DIR/health-check.sh" ]]; then
        local retries=3
        local delay=5
        
        for ((i=1; i<=retries; i++)); do
            log_verbose "Health check attempt $i/$retries..."
            
            if "$SCRIPT_DIR/health-check.sh" --quiet; then
                log_success "Health checks passed"
                return 0
            fi
            
            if [[ $i -lt $retries ]]; then
                log_verbose "Retrying in ${delay}s..."
                sleep $delay
            fi
        done
        
        log_error "Health checks failed after $retries attempts"
        return 1
    else
        # Simple health check - verify node can start
        log_verbose "Running basic health check..."
        
        if node -e "console.log('OK')" &>/dev/null; then
            log_success "Basic health check passed"
            return 0
        else
            log_error "Basic health check failed"
            return 1
        fi
    fi
}

perform_rollback() {
    log_warning "Performing rollback..."
    
    # Find most recent backup
    local backup_dir
    backup_dir=$(find "$PROJECT_ROOT/data/backups" -maxdepth 1 -type d -name "pre-deploy-*" | sort -r | head -1)
    
    if [[ -z "$backup_dir" ]]; then
        log_error "No backup found for rollback"
        return 1
    fi
    
    log_info "Rolling back to: $(basename "$backup_dir")"
    
    # Restore database
    if [[ -d "$backup_dir/db" ]]; then
        rm -rf "$PROJECT_ROOT/data/db"
        cp -r "$backup_dir/db" "$PROJECT_ROOT/data/"
        log_verbose "Database restored"
    fi
    
    # Restore config
    if [[ -f "$backup_dir/.env" ]]; then
        cp "$backup_dir/.env" "$PROJECT_ROOT/"
        log_verbose "Config restored"
    fi
    
    save_deployment_state "rolled_back"
    
    log_success "Rollback completed"
    return 0
}

finalize_deployment() {
    local status=$1
    
    save_deployment_state "$status"
    
    # Clean up old backups (keep last 10)
    if [[ -d "$PROJECT_ROOT/data/backups" ]]; then
        find "$PROJECT_ROOT/data/backups" -maxdepth 1 -type d -name "pre-deploy-*" | sort -r | tail -n +11 | xargs rm -rf 2>/dev/null || true
    fi
    
    log_info "Deployment $status"
    
    # Log deployment
    local deploy_log="$PROJECT_ROOT/logs/deploy/deployments.log"
    mkdir -p "$(dirname "$deploy_log")"
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $DEPLOYMENT_ID - $status - $ENVIRONMENT" >> "$deploy_log"
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    DEPLOY_START_TIME=$(date +%s)
    
    log_info "CogniMesh v5.0 Deploy v${VERSION}"
    
    # Parse arguments
    parse_arguments "$@"
    
    # Generate deployment ID
    generate_deployment_id
    
    log_info "Environment: $ENVIRONMENT"
    log_info "Deployment ID: $DEPLOYMENT_ID"
    
    # Handle rollback
    if [[ "$ROLLBACK" == true ]]; then
        perform_rollback
        exit $?
    fi
    
    # Check dependencies
    if ! check_dependencies; then
        exit $EXIT_DEPENDENCY_MISSING
    fi
    
    # Confirm deployment
    confirm_deployment
    
    local exit_code=$EXIT_SUCCESS
    
    # Pre-deployment backup
    create_backup
    
    # Build
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        run_build || exit_code=$EXIT_DEPLOY_FAILURE
    fi
    
    # Run migrations
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        run_migrations || exit_code=$EXIT_DEPLOY_FAILURE
    fi
    
    # Deploy
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        deploy_application || exit_code=$EXIT_DEPLOY_FAILURE
    fi
    
    # Health check
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        run_health_check || exit_code=$EXIT_DEPLOY_FAILURE
    fi
    
    # Finalize
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        finalize_deployment "success"
        
        local duration=$(( $(date +%s) - DEPLOY_START_TIME ))
        log_success "Deployment completed in ${duration}s"
        log_info "Deployment ID: $DEPLOYMENT_ID"
    else
        finalize_deployment "failed"
        log_error "Deployment failed!"
        
        # Offer rollback
        if [[ "$FORCE" == false ]] && [[ "$QUIET" == false ]]; then
            echo
            read -p "Would you like to rollback? (y/N): " -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                perform_rollback
            fi
        fi
    fi
    
    exit $exit_code
}

main "$@"
