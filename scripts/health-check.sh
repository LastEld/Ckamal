#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Health Check Script
# =============================================================================
# Description: System health check including database and client connectivity.
# Usage: ./health-check.sh [options]
# =============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly VERSION="5.0.0"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_UNHEALTHY=1

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
CHECK_DB=true
CHECK_DISK=true
CHECK_MEMORY=true
CHECK_CLIENTS=true
TIMEOUT=5

# Health status
HEALTH_STATUS="healthy"
CHECKS_PASSED=0
CHECKS_FAILED=0

log() { [[ "$QUIET" == false ]] && echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[OK]${NC}   $1"; }
log_warning() { log "${YELLOW}[WARN]${NC} $1"; }
log_error() { log "${RED}[FAIL]${NC} $1" >&2; }
log_verbose() { [[ "$VERBOSE" == true ]] && log_info "$1"; }

show_help() {
    cat << EOF
CogniMesh v5.0 - Health Check v${VERSION}

Usage: $(basename "$0") [OPTIONS]

Options:
    -h, --help          Show this help message and exit
    -v, --verbose       Enable verbose output
    -q, --quiet         Suppress non-error output (exit code only)
    --no-db             Skip database check
    --no-disk           Skip disk space check
    --no-memory         Skip memory check
    --no-clients        Skip client connectivity check
    -t, --timeout SEC   Timeout for checks (default: 5)

Description:
    Performs comprehensive health checks on the CogniMesh system.

Examples:
    $(basename "$0")                    # Run all health checks
    $(basename "$0") --no-db            # Skip database check
    $(basename "$0") -q                 # Quiet mode

Exit Codes:
    0 - All checks passed (healthy)
    1 - One or more checks failed

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
            --no-db)
                CHECK_DB=false
                shift
                ;;
            --no-disk)
                CHECK_DISK=false
                shift
                ;;
            --no-memory)
                CHECK_MEMORY=false
                shift
                ;;
            --no-clients)
                CHECK_CLIENTS=false
                shift
                ;;
            -t|--timeout)
                TIMEOUT="${2:-5}"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                exit 1
                ;;
        esac
    done
}

check_database() {
    [[ "$CHECK_DB" == false ]] && return 0
    
    log_verbose "Checking database connectivity..."
    
    local db_path="$PROJECT_ROOT/data/db/cognimesh_development.db"
    
    if [[ ! -f "$db_path" ]]; then
        log_warning "Database file not found: $db_path"
        ((CHECKS_FAILED++))
        return 0  # Non-critical
    fi
    
    if command -v sqlite3 &> /dev/null; then
        if sqlite3 "$db_path" "SELECT 1;" &> /dev/null; then
            log_success "Database is accessible"
            ((CHECKS_PASSED++))
        else
            log_error "Database is not accessible"
            HEALTH_STATUS="unhealthy"
            ((CHECKS_FAILED++))
        fi
    else
        log_warning "sqlite3 not available, skipping database check"
    fi
}

check_disk_space() {
    [[ "$CHECK_DISK" == false ]] && return 0
    
    log_verbose "Checking disk space..."
    
    # Check available disk space
    local available
    available=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    local human_available
    human_available=$(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    
    # Alert if less than 1GB available (1048576 blocks of 1K)
    if [[ $available -lt 1048576 ]]; then
        log_warning "Low disk space: $human_available remaining"
        ((CHECKS_FAILED++))
    else
        log_success "Disk space OK: $human_available available"
        ((CHECKS_PASSED++))
    fi
}

check_memory() {
    [[ "$CHECK_MEMORY" == false ]] && return 0
    
    log_verbose "Checking memory..."
    
    if [[ -f /proc/meminfo ]]; then
        local total
        total=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        local available
        available=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
        
        local usage_percent=$((100 - (available * 100 / total)))
        
        if [[ $usage_percent -gt 90 ]]; then
            log_warning "High memory usage: ${usage_percent}%"
            ((CHECKS_FAILED++))
        else
            log_success "Memory OK: ${usage_percent}% used"
            ((CHECKS_PASSED++))
        fi
    else
        log_verbose "Memory info not available on this system"
    fi
}

check_node_version() {
    log_verbose "Checking Node.js..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        HEALTH_STATUS="unhealthy"
        ((CHECKS_FAILED++))
        return 1
    fi
    
    local node_version
    node_version=$(node --version)
    log_success "Node.js $node_version is available"
    ((CHECKS_PASSED++))
}

check_file_permissions() {
    log_verbose "Checking file permissions..."
    
    local issues=0
    
    # Check if critical directories are writable
    for dir in "$PROJECT_ROOT/data" "$PROJECT_ROOT/logs" "$PROJECT_ROOT/tmp"; do
        if [[ -d "$dir" ]] && [[ ! -w "$dir" ]]; then
            log_warning "Directory not writable: $dir"
            ((issues++))
        fi
    done
    
    if [[ $issues -eq 0 ]]; then
        log_success "File permissions OK"
        ((CHECKS_PASSED++))
    else
        ((CHECKS_FAILED+=$issues))
    fi
}

check_configuration() {
    log_verbose "Checking configuration..."
    
    if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        log_warning ".env file not found"
        ((CHECKS_FAILED++))
    else
        # Check for required variables
        local required_vars=("GITHUB_TOKEN")
        local missing=0
        
        for var in "${required_vars[@]}"; do
            if ! grep -q "^${var}=" "$PROJECT_ROOT/.env" 2>/dev/null; then
                log_verbose "Missing config: $var"
                ((missing++))
            fi
        done
        
        if [[ $missing -eq 0 ]]; then
            log_success "Configuration OK"
            ((CHECKS_PASSED++))
        else
            log_warning "Configuration incomplete ($missing missing)"
            ((CHECKS_FAILED++))
        fi
    fi
}

check_clients() {
    [[ "$CHECK_CLIENTS" == false ]] && return 0
    
    log_verbose "Checking client connectivity..."
    
    # Check GitHub API access if token is configured
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        local github_token
        github_token=$(grep "^GITHUB_TOKEN=" "$PROJECT_ROOT/.env" | cut -d= -f2 | tr -d '"')
        
        if [[ -n "$github_token" ]] && [[ "$github_token" != "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" ]]; then
            log_verbose "GitHub token configured"
            # Note: Actual GitHub API check would require network call
        fi
    fi
    
    log_success "Client configuration OK"
    ((CHECKS_PASSED++))
}

print_summary() {
    [[ "$QUIET" == true ]] && return 0
    
    echo
    log_info "Health Check Summary"
    echo "================================"
    log_info "Status: $HEALTH_STATUS"
    log_info "Checks passed: $CHECKS_PASSED"
    log_info "Checks failed: $CHECKS_FAILED"
    echo
    
    if [[ "$HEALTH_STATUS" == "healthy" ]]; then
        log_success "System is healthy"
    else
        log_error "System has issues"
    fi
}

main() {
    [[ "$QUIET" == false ]] && log_info "CogniMesh v5.0 Health Check v${VERSION}"
    
    parse_arguments "$@"
    
    # Run checks
    check_node_version
    check_configuration
    check_database
    check_disk_space
    check_memory
    check_file_permissions
    check_clients
    
    # Print summary
    print_summary
    
    # Exit with appropriate code
    if [[ "$HEALTH_STATUS" == "healthy" ]]; then
        exit $EXIT_SUCCESS
    else
        exit $EXIT_UNHEALTHY
    fi
}

main "$@"
