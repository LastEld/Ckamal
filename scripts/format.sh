#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Format Script
# =============================================================================
# Description: Code formatting with Prettier.
# Usage: ./format.sh [options] [files...]
# =============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly VERSION="5.0.0"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_FORMAT_ERROR=1

# Colors
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
CHECK=false
WRITE=true
IGNORE_PATH=""

log() { [[ "$QUIET" == false ]] && echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { log "${YELLOW}[WARNING]${NC} $1"; }
log_verbose() { [[ "$VERBOSE" == true ]] && log_info "$1"; }

show_help() {
    cat << EOF
CogniMesh v5.0 - Format Script v${VERSION}

Usage: $(basename "$0") [OPTIONS] [FILES...]

Options:
    -h, --help          Show this help message and exit
    -v, --verbose       Enable verbose output
    -q, --quiet         Suppress non-error output
    --check             Check formatting without changing files
    --no-write          Don't write changes (deprecated, use --check)

Description:
    Formats code using Prettier.

Examples:
    $(basename "$0")                    # Format all files
    $(basename "$0") --check            # Check formatting
    $(basename "$0") src/*.js           # Format specific files

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
            --check)
                CHECK=true
                WRITE=false
                shift
                ;;
            --no-write)
                WRITE=false
                shift
                ;;
            *)
                FILES+=("$1")
                shift
                ;;
        esac
    done
}

check_prettier() {
    if ! npx prettier --version &> /dev/null; then
        log_warning "Prettier not found. Install with: npm install --save-dev prettier"
        exit 0
    fi
    
    log_verbose "Prettier version: $(npx prettier --version)"
}

run_prettier() {
    local prettier_args=()
    
    [[ "$CHECK" == true ]] && prettier_args+=("--check")
    [[ "$WRITE" == true ]] && prettier_args+=("--write")
    
    # Files to format
    if [[ ${#FILES[@]} -eq 0 ]]; then
        prettier_args+=("src/" "*.js" "*.json" "*.md")
    else
        prettier_args+=("${FILES[@]}")
    fi
    
    log_verbose "Running: npx prettier ${prettier_args[*]}"
    
    if npx prettier "${prettier_args[@]}"; then
        if [[ "$CHECK" == true ]]; then
            log_success "All files are formatted"
        else
            log_success "Formatting complete"
        fi
        return $EXIT_SUCCESS
    else
        if [[ "$CHECK" == true ]]; then
            log_warning "Some files need formatting"
        else
            log_warning "Formatting failed"
        fi
        return $EXIT_FORMAT_ERROR
    fi
}

main() {
    log_info "CogniMesh v5.0 Format v${VERSION}"
    
    parse_arguments "$@"
    check_prettier
    run_prettier
    exit $?
}

main "$@"
