#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Update Check Script
# =============================================================================
# Description: Check for GitHub updates and show changelog.
# Usage: ./update-check.sh [options]
# =============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly VERSION="5.0.0"

# Exit codes
readonly EXIT_SUCCESS=0

# Colors
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
CHECK_NPM=false
FETCH_TAGS=false

log() { [[ "$QUIET" == false ]] && echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { log "${YELLOW}[WARNING]${NC} $1"; }
log_verbose() { [[ "$VERBOSE" == true ]] && log_info "$1"; }

show_help() {
    cat << EOF
CogniMesh v5.0 - Update Check v${VERSION}

Usage: $(basename "$0") [OPTIONS]

Options:
    -h, --help          Show this help message and exit
    -v, --verbose       Enable verbose output
    -q, --quiet         Suppress non-error output
    --npm               Also check for npm package updates
    --fetch             Fetch latest tags from remote

Description:
    Checks for available updates from GitHub and shows changelog.

Examples:
    $(basename "$0")                    # Check for updates
    $(basename "$0") --npm              # Include npm packages
    $(basename "$0") --fetch            # Fetch latest tags

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
            --npm)
                CHECK_NPM=true
                shift
                ;;
            --fetch)
                FETCH_TAGS=true
                shift
                ;;
            *)
                echo "Unknown option: $1" >&2
                exit 1
                ;;
        esac
    done
}

check_git_updates() {
    log_info "Checking for GitHub updates..."
    
    if ! command -v git &> /dev/null; then
        log_warning "Git not found"
        return 0
    fi
    
    cd "$PROJECT_ROOT"
    
    # Get current version info
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    local current_commit
    current_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local current_tag
    current_tag=$(git describe --tags --exact-match 2>/dev/null || echo "none")
    
    log "${CYAN}Current Status:${NC}"
    log "  Branch: $current_branch"
    log "  Commit: $current_commit"
    log "  Tag: $current_tag"
    echo
    
    # Fetch updates if requested
    if [[ "$FETCH_TAGS" == true ]]; then
        log_info "Fetching updates from remote..."
        git fetch --tags origin 2>/dev/null || log_warning "Failed to fetch from remote"
    fi
    
    # Check for new commits
    local behind_count
    behind_count=$(git rev-list HEAD..origin/$current_branch --count 2>/dev/null || echo "0")
    
    if [[ "$behind_count" -gt 0 ]]; then
        log_warning "$behind_count new commit(s) available on origin/$current_branch"
        
        # Show recent commits
        log_info "Recent changes:"
        git log HEAD..origin/$current_branch --oneline 2>/dev/null | head -10 | while read -r line; do
            log "  $line"
        done
    else
        log_success "Up to date with origin/$current_branch"
    fi
    
    # Check for newer tags
    local latest_tag
    latest_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    
    if [[ -n "$latest_tag" ]] && [[ "$latest_tag" != "$current_tag" ]]; then
        echo
        log_warning "Newer version available: $latest_tag"
        log_info "Changelog:"
        git log "$current_tag..$latest_tag" --oneline 2>/dev/null | head -10 | while read -r line; do
            log "  $line"
        done
    fi
    
    echo
}

check_npm_updates() {
    [[ "$CHECK_NPM" == false ]] && return 0
    
    log_info "Checking for npm package updates..."
    
    if ! command -v npm &> /dev/null; then
        log_warning "npm not found"
        return 0
    fi
    
    local outdated
    outdated=$(npm outdated --json 2>/dev/null || echo "{}")
    
    if [[ "$outdated" == "{}" ]] || [[ -z "$outdated" ]]; then
        log_success "All npm packages are up to date"
        return 0
    fi
    
    log_warning "Outdated packages:"
    
    # Parse and display outdated packages
    echo "$outdated" | node -e '
        const data = JSON.parse(require("fs").readFileSync(0, "utf-8"));
        const colors = {
            major: "\x1b[31m",
            minor: "\x1b[33m",
            patch: "\x1b[32m",
            reset: "\x1b[0m"
        };
        
        for (const [pkg, info] of Object.entries(data)) {
            const current = info.current || "?";
            const latest = info.latest || "?";
            const wanted = info.wanted || latest;
            const type = info.type || "dependencies";
            
            const currentParts = current.split(".").map(Number);
            const latestParts = latest.split(".").map(Number);
            
            let color = colors.patch;
            if (currentParts[0] !== latestParts[0]) color = colors.major;
            else if (currentParts[1] !== latestParts[1]) color = colors.minor;
            
            console.log(`  ${color}${pkg}${colors.reset}: ${current} → ${latest} (${type})`);
        }
    ' 2>/dev/null || echo "$outdated"
    
    echo
    log_info "Run 'npm update' to update packages"
}

show_changelog() {
    log_info "Recent changes in this repository:"
    
    cd "$PROJECT_ROOT"
    
    if [[ -f "CHANGELOG.md" ]]; then
        log_info "CHANGELOG.md found - showing first 50 lines:"
        head -50 CHANGELOG.md
    else
        log_info "Recent commits:"
        git log --oneline -20 2>/dev/null || log_warning "No git history available"
    fi
}

main() {
    log_info "CogniMesh v5.0 Update Check v${VERSION}"
    echo
    
    parse_arguments "$@"
    
    check_git_updates
    check_npm_updates
    
    if [[ "$FETCH_TAGS" == false ]] && [[ "$CHECK_NPM" == false ]]; then
        show_changelog
    fi
    
    exit $EXIT_SUCCESS
}

main "$@"
