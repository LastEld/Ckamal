#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Setup Script
# =============================================================================
# Description: Initial project setup - installs dependencies, creates 
#              directories, sets up database, and copies environment config.
# Usage: ./setup.sh [options]
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
readonly EXIT_CONFIG_ERROR=4
readonly EXIT_DATABASE_ERROR=5

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Options
VERBOSE=false
QUIET=false
SKIP_DEPS=false
SKIP_DB=false
SKIP_ENV=false

# =============================================================================
# Helper Functions
# =============================================================================

log() {
    if [[ "$QUIET" == false ]]; then
        echo -e "$1"
    fi
}

log_info() {
    log "${BLUE}[INFO]${NC} $1"
}

log_success() {
    log "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    log "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    log "${RED}[ERROR]${NC} $1" >&2
}

log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        log_info "$1"
    fi
}

show_help() {
    cat << EOF
CogniMesh v5.0 - Setup Script v${VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    -h, --help          Show this help message and exit
    -v, --verbose       Enable verbose output
    -q, --quiet         Suppress non-error output
    --skip-deps         Skip dependency installation
    --skip-db           Skip database setup
    --skip-env          Skip environment file creation

Description:
    This script performs initial project setup including:
    - Installing Node.js dependencies
    - Creating required directories
    - Setting up the SQLite database
    - Copying .env.example to .env

Examples:
    ${SCRIPT_NAME}                    # Full setup
    ${SCRIPT_NAME} --skip-deps        # Skip npm install
    ${SCRIPT_NAME} --verbose          # Verbose output
    ${SCRIPT_NAME} --skip-db --quiet  # Quiet, no database setup

Exit Codes:
    0 - Success
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    4 - Configuration error
    5 - Database error

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
            --skip-deps)
                SKIP_DEPS=true
                shift
                ;;
            --skip-db)
                SKIP_DB=true
                shift
                ;;
            --skip-env)
                SKIP_ENV=true
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

check_dependency() {
    local cmd=$1
    local name=${2:-$1}
    
    if ! command -v "$cmd" &> /dev/null; then
        log_error "Required dependency not found: $name"
        return 1
    fi
    
    log_verbose "Found dependency: $name"
    return 0
}

check_node_version() {
    local required_version="18.0.0"
    local current_version
    
    if ! current_version=$(node --version 2>/dev/null | sed 's/v//'); then
        log_error "Failed to get Node.js version"
        return 1
    fi
    
    log_verbose "Node.js version: $current_version (required: >=$required_version)"
    
    # Compare versions
    if [[ "$(printf '%s\n' "$required_version" "$current_version" | sort -V | head -n1)" != "$required_version" ]]; then
        log_error "Node.js version $current_version is too old. Required: >= $required_version"
        return 1
    fi
    
    log_success "Node.js version check passed ($current_version)"
    return 0
}

# =============================================================================
# Setup Functions
# =============================================================================

install_dependencies() {
    log_info "Installing dependencies..."
    
    cd "$PROJECT_ROOT"
    
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found in project root"
        return $EXIT_CONFIG_ERROR
    fi
    
    log_verbose "Running npm install..."
    
    if [[ "$VERBOSE" == true ]]; then
        npm install
    else
        npm install --silent
    fi
    
    if [[ $? -ne 0 ]]; then
        log_error "Failed to install dependencies"
        return $EXIT_GENERAL_ERROR
    fi
    
    log_success "Dependencies installed successfully"
    return $EXIT_SUCCESS
}

create_directories() {
    log_info "Creating required directories..."
    
    local dirs=(
        "logs/scripts"
        "logs/setup"
        "logs/deploy"
        "logs/backup"
        "data/db"
        "data/backups"
        "data/uploads"
        "state"
        "tmp"
        "cache"
    )
    
    for dir in "${dirs[@]}"; do
        local full_path="$PROJECT_ROOT/$dir"
        if [[ ! -d "$full_path" ]]; then
            mkdir -p "$full_path"
            log_verbose "Created directory: $dir"
        else
            log_verbose "Directory already exists: $dir"
        fi
    done
    
    log_success "Directories created"
    return $EXIT_SUCCESS
}

setup_database() {
    log_info "Setting up database..."
    
    local db_dir="$PROJECT_ROOT/data/db"
    local schema_file="$PROJECT_ROOT/src/db/schema.sql"
    
    mkdir -p "$db_dir"
    
    if [[ ! -f "$schema_file" ]]; then
        log_error "Database schema not found: $schema_file"
        return $EXIT_DATABASE_ERROR
    fi
    
    # Check for sqlite3
    if ! check_dependency sqlite3; then
        log_warning "sqlite3 not found. Database setup will be skipped."
        log_warning "Please install SQLite3 and run this script again."
        return $EXIT_SUCCESS
    fi
    
    log_verbose "Initializing database from schema..."
    
    # Create databases for different environments
    for env in development production test; do
        local db_file="$db_dir/cognimesh_${env}.db"
        
        if [[ -f "$db_file" ]]; then
            log_verbose "Database already exists: $db_file"
        else
            if sqlite3 "$db_file" < "$schema_file"; then
                log_verbose "Created database: cognimesh_${env}.db"
            else
                log_error "Failed to create database: cognimesh_${env}.db"
                return $EXIT_DATABASE_ERROR
            fi
        fi
    done
    
    log_success "Database setup complete"
    return $EXIT_SUCCESS
}

setup_environment() {
    log_info "Setting up environment configuration..."
    
    local env_example="$PROJECT_ROOT/.env.example"
    local env_file="$PROJECT_ROOT/.env"
    
    if [[ ! -f "$env_example" ]]; then
        log_error ".env.example not found"
        return $EXIT_CONFIG_ERROR
    fi
    
    if [[ -f "$env_file" ]]; then
        log_warning ".env file already exists"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipping .env creation"
            return $EXIT_SUCCESS
        fi
    fi
    
    cp "$env_example" "$env_file"
    
    if [[ $? -eq 0 ]]; then
        log_success "Created .env file from .env.example"
        log_info "Please edit .env file with your configuration"
    else
        log_error "Failed to create .env file"
        return $EXIT_CONFIG_ERROR
    fi
    
    return $EXIT_SUCCESS
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    log_info "CogniMesh v5.0 Setup v${VERSION}"
    log_info "Project root: $PROJECT_ROOT"
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Check dependencies
    log_info "Checking dependencies..."
    
    if ! check_dependency node "Node.js"; then
        exit $EXIT_DEPENDENCY_MISSING
    fi
    
    if ! check_node_version; then
        exit $EXIT_DEPENDENCY_MISSING
    fi
    
    if ! check_dependency npm "npm"; then
        exit $EXIT_DEPENDENCY_MISSING
    fi
    
    if ! check_dependency git "Git"; then
        log_warning "Git not found. Some features may not work."
    fi
    
    log_success "Dependencies check passed"
    
    # Run setup steps
    local exit_code=$EXIT_SUCCESS
    
    # Create directories
    create_directories
    
    # Install dependencies
    if [[ "$SKIP_DEPS" == false ]]; then
        install_dependencies || exit_code=$?
    else
        log_info "Skipping dependency installation (--skip-deps)"
    fi
    
    # Setup database
    if [[ "$SKIP_DB" == false && $exit_code -eq $EXIT_SUCCESS ]]; then
        setup_database || exit_code=$?
    else
        log_info "Skipping database setup"
    fi
    
    # Setup environment
    if [[ "$SKIP_ENV" == false && $exit_code -eq $EXIT_SUCCESS ]]; then
        setup_environment || exit_code=$?
    else
        log_info "Skipping environment setup"
    fi
    
    # Final status
    echo
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        log_success "Setup completed successfully!"
        log_info "Next steps:"
        log "  1. Edit .env file with your configuration"
        log "  2. Run './scripts/dev.sh' to start development server"
        log "  3. Visit http://localhost:3000 for the dashboard"
    else
        log_error "Setup failed with exit code $exit_code"
    fi
    
    exit $exit_code
}

# Run main function
main "$@"
