#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Security Audit Script
# =============================================================================
# Description: Run security audit and check dependencies for vulnerabilities.
# Usage: ./security-audit.sh [options]
# =============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly VERSION="5.0.0"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_VULNERABILITY=10

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
FIX=false
PRODUCTION_ONLY=false
SEVERITY="low"

log() { [[ "$QUIET" == false ]] && echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { log "${YELLOW}[WARNING]${NC} $1"; }
log_error() { log "${RED}[ERROR]${NC} $1" >&2; }
log_verbose() { [[ "$VERBOSE" == true ]] && log_info "$1"; }

show_help() {
    cat << EOF
CogniMesh v5.0 - Security Audit v${VERSION}

Usage: $(basename "$0") [OPTIONS]

Options:
    -h, --help          Show this help message and exit
    -v, --verbose       Enable verbose output
    -q, --quiet         Suppress non-error output
    -f, --fix           Attempt to fix vulnerabilities
    --production        Only check production dependencies
    --severity LEVEL    Minimum severity (info, low, moderate, high, critical)

Description:
    Audits the project for security vulnerabilities in dependencies.

Examples:
    $(basename "$0")                    # Run security audit
    $(basename "$0") --fix              # Fix vulnerabilities
    $(basename "$0") --severity high    # Only high/critical

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
            -f|--fix)
                FIX=true
                shift
                ;;
            --production)
                PRODUCTION_ONLY=true
                shift
                ;;
            --severity)
                SEVERITY="${2:-low}"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                exit 1
                ;;
        esac
    done
}

run_npm_audit() {
    log_info "Running npm audit..."
    
    local audit_args=("audit")
    
    [[ "$PRODUCTION_ONLY" == true ]] && audit_args+=("--production")
    [[ "$FIX" == true ]] && audit_args+=("fix")
    
    audit_args+=("--audit-level=$SEVERITY")
    
    log_verbose "Running: npm ${audit_args[*]}"
    
    if npm "${audit_args[@]}"; then
        log_success "No vulnerabilities found"
        return $EXIT_SUCCESS
    else
        local exit_code=$?
        if [[ $exit_code -eq 1 ]]; then
            log_error "Vulnerabilities found!"
            return $EXIT_VULNERABILITY
        fi
        return $exit_code
    fi
}

check_outdated() {
    log_info "Checking for outdated dependencies..."
    
    local outdated
    outdated=$(npm outdated --json 2>/dev/null || true)
    
    if [[ -z "$outdated" ]] || [[ "$outdated" == "{}" ]]; then
        log_success "All dependencies are up to date"
        return 0
    fi
    
    log_warning "Outdated dependencies found:"
    echo "$outdated" | node -e '
        const data = JSON.parse(require("fs").readFileSync(0, "utf-8"));
        for (const [pkg, info] of Object.entries(data)) {
            console.log(`  ${pkg}: ${info.current} → ${info.latest}`);
        }
    ' 2>/dev/null || echo "$outdated"
    
    return 0
}

check_secrets() {
    log_info "Checking for potential secrets in code..."
    
    local found=0
    
    # Patterns to check
    local patterns=(
        "api[_-]?key.*=.*['\"][a-zA-Z0-9]{20,}['\"]"
        "password.*=.*['\"][^'\"]{8,}['\"]"
        "secret.*=.*['\"][a-zA-Z0-9]{20,}['\"]"
        "token.*=.*['\"][a-zA-Z0-9]{20,}['\"]"
        "ghp_[a-zA-Z0-9]{36}"
        "sk-[a-zA-Z0-9]{48}"
    )
    
    for pattern in "${patterns[@]}"; do
        if grep -riEn "$pattern" "$PROJECT_ROOT/src" --include="*.js" 2>/dev/null | grep -v "//.*$pattern" | head -5; then
            ((found++))
        fi
    done
    
    if [[ $found -gt 0 ]]; then
        log_warning "Potential secrets found in code - review recommended"
    else
        log_verbose "No obvious secrets found"
    fi
    
    return 0
}

main() {
    log_info "CogniMesh v5.0 Security Audit v${VERSION}"
    
    parse_arguments "$@"
    
    local exit_code=$EXIT_SUCCESS
    
    # Run npm audit
    run_npm_audit || exit_code=$?
    
    # Check outdated dependencies
    if [[ "$FIX" == false ]]; then
        check_outdated
    fi
    
    # Check for secrets
    if [[ "$FIX" == false ]]; then
        check_secrets
    fi
    
    exit $exit_code
}

main "$@"
