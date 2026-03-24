#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Lint Script
# =============================================================================
# Description: Run ESLint with various options and fix capabilities.
# Usage: ./lint.sh [options] [files...]
# =============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly VERSION="5.0.0"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_LINT_ERROR=1
readonly EXIT_INVALID_ARGS=2

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
CACHE=true
EXT=".js,.jsx,.ts,.tsx,.mjs"
MAX_WARNINGS=-1
FORMAT="stylish"
OUTPUT_FILE=""

log() { [[ "$QUIET" == false ]] && echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { log "${YELLOW}[WARNING]${NC} $1"; }
log_error() { log "${RED}[ERROR]${NC} $1" >&2; }
log_verbose() { [[ "$VERBOSE" == true ]] && log_info "$1"; }

show_help() {
    cat << EOF
CogniMesh v5.0 - Lint Script v${VERSION}

Usage: $(basename "$0") [OPTIONS] [FILES...]

Options:
    -h, --help          Show this help message and exit
    -v, --verbose       Enable verbose output
    -q, --quiet         Suppress non-error output
    -f, --fix           Automatically fix problems
    --no-cache          Disable caching
    --ext EXT           File extensions (default: .js,.jsx,.ts,.tsx)
    --max-warnings N    Number of warnings to trigger nonzero exit
    --format FMT        Output format (stylish, compact, json, junit)
    -o, --output FILE   Write output to file

Description:
    Runs ESLint on the codebase to check for code quality issues.

Examples:
    $(basename "$0")                    # Lint all files
    $(basename "$0") --fix              # Lint and fix issues
    $(basename "$0") src/               # Lint specific directory
    $(basename "$0") --format json      # JSON output

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
            --no-cache)
                CACHE=false
                shift
                ;;
            --ext)
                EXT="${2:-.js}"
                shift 2
                ;;
            --max-warnings)
                MAX_WARNINGS="${2:--1}"
                shift 2
                ;;
            --format)
                FORMAT="${2:-stylish}"
                shift 2
                ;;
            -o|--output)
                OUTPUT_FILE="${2:-}"
                shift 2
                ;;
            *)
                FILES+=("$1")
                shift
                ;;
        esac
    done
}

check_eslint() {
    if ! npx eslint --version &> /dev/null; then
        log_error "ESLint not found. Install with: npm install --save-dev eslint"
        exit 1
    fi
    
    log_verbose "ESLint version: $(npx eslint --version)"
}

run_eslint() {
    local eslint_args=("--ext" "$EXT")
    
    [[ "$FIX" == true ]] && eslint_args+=("--fix")
    [[ "$CACHE" == false ]] && eslint_args+=("--no-cache")
    [[ "$MAX_WARNINGS" -ge 0 ]] && eslint_args+=("--max-warnings" "$MAX_WARNINGS")
    [[ -n "$FORMAT" ]] && eslint_args+=("--format" "$FORMAT")
    
    if [[ -n "$OUTPUT_FILE" ]]; then
        eslint_args+=("--output-file" "$OUTPUT_FILE")
    fi
    
    # Files to lint
    if [[ ${#FILES[@]} -eq 0 ]]; then
        eslint_args+=("src/")
    else
        eslint_args+=("${FILES[@]}")
    fi
    
    log_verbose "Running: npx eslint ${eslint_args[*]}"
    
    if npx eslint "${eslint_args[@]}"; then
        log_success "Linting passed"
        return $EXIT_SUCCESS
    else
        log_error "Linting failed"
        return $EXIT_LINT_ERROR
    fi
}

main() {
    log_info "CogniMesh v5.0 Lint v${VERSION}"
    
    parse_arguments "$@"
    check_eslint
    run_eslint
    exit $?
}

main "$@"
