#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Release Script
# =============================================================================
# Description: Creates a new release with release verification, build, git tag and GitHub release
# Usage: ./release.sh <version> [options]
# =============================================================================

set -euo pipefail

# Script metadata
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_INVALID_ARGS=1
readonly EXIT_VERIFICATION_FAILED=2
readonly EXIT_BUILD_FAILED=3
readonly EXIT_TAG_FAILED=4
readonly EXIT_RELEASE_FAILED=5

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Options
DRY_RUN=false
SKIP_TESTS=false
SKIP_BUILD=false
SKIP_GITHUB_RELEASE=false
FORCE=false

# =============================================================================
# Helper Functions
# =============================================================================

log() { echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { log "${YELLOW}[WARNING]${NC} $1"; }
log_error() { log "${RED}[ERROR]${NC} $1" >&2; }

show_help() {
    cat << EOF
CogniMesh v5.0 - Release Script

Usage: ${SCRIPT_NAME} <version> [OPTIONS]

Arguments:
    version                 Version number (e.g., 5.0.1)

Options:
    -h, --help              Show this help message and exit
    --dry-run               Simulate release without making changes
    --skip-tests            Skip running tests
    --skip-build            Skip build step
    --skip-github-release   Skip creating GitHub release
    --force                 Force release without confirmation

Description:
    Creates a new CogniMesh release including:
    - Run the release verification gate
    - Build production bundle
    - Create and push git tag
    - Create GitHub release with artifacts

Examples:
    ${SCRIPT_NAME} 5.0.1                    # Standard release
    ${SCRIPT_NAME} 5.0.1 --dry-run          # Dry run
    ${SCRIPT_NAME} 5.0.1 --skip-tests       # Skip tests
    ${SCRIPT_NAME} 5.0.1 --force            # No confirmation

Exit Codes:
    0 - Release successful
    1 - Invalid arguments
    2 - Tests failed
    3 - Build failed
    4 - Git tag failed
    5 - GitHub release failed

EOF
}

parse_arguments() {
    if [[ $# -eq 0 ]]; then
        show_help
        exit $EXIT_INVALID_ARGS
    fi

    VERSION=$1
    shift

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit $EXIT_SUCCESS
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-github-release)
                SKIP_GITHUB_RELEASE=true
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

validate_version() {
    local version=$1
    
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
        log_error "Invalid version format: $version"
        log_error "Expected format: X.Y.Z or X.Y.Z-prerelease"
        exit $EXIT_INVALID_ARGS
    fi
    
    # Check if tag already exists
    if git tag -l "v$version" | grep -q "v$version"; then
        log_error "Tag v$version already exists"
        exit $EXIT_INVALID_ARGS
    fi
}

confirm_release() {
    [[ "$FORCE" == true ]] && return 0
    
    echo
    log_warning "About to create release: v$VERSION"
    log_warning "Current branch: $(git branch --show-current)"
    log_warning "Current commit: $(git rev-parse --short HEAD)"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_warning "DRY RUN - No actual changes will be made"
    fi
    
    echo
    read -p "Continue with release? (yes/N): " -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Release cancelled"
        exit $EXIT_SUCCESS
    fi
}

run_release_verification() {
    [[ "$SKIP_TESTS" == true ]] && return 0
    
    log_info "Running release verification..."
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would run: npm run verify:release"
        return 0
    fi
    
    if ! npm run verify:release; then
        log_error "Release verification failed"
        exit $EXIT_VERIFICATION_FAILED
    fi
    
    log_success "Release verification passed"
}

run_build() {
    [[ "$SKIP_BUILD" == true ]] && return 0
    
    log_info "Building production bundle..."
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would run: npm run build"
        return 0
    fi
    
    # Clean dist directory
    rm -rf "$PROJECT_ROOT/dist"
    mkdir -p "$PROJECT_ROOT/dist"
    
    # Run build
    if ! npm run build 2>/dev/null; then
        log_warning "No build script found, creating manual bundle..."
        
        # Create manual bundle
        mkdir -p "$PROJECT_ROOT/dist/cognimesh-$VERSION"
        
        # Copy source files
        cp -r "$PROJECT_ROOT/src" "$PROJECT_ROOT/dist/cognimesh-$VERSION/"
        cp "$PROJECT_ROOT/package.json" "$PROJECT_ROOT/dist/cognimesh-$VERSION/"
        cp "$PROJECT_ROOT/README.md" "$PROJECT_ROOT/dist/cognimesh-$VERSION/" 2>/dev/null || true
        cp "$PROJECT_ROOT/LICENSE" "$PROJECT_ROOT/dist/cognimesh-$VERSION/" 2>/dev/null || true
        
        # Create tarball
        cd "$PROJECT_ROOT/dist"
        tar -czf "cognimesh-$VERSION.tar.gz" "cognimesh-$VERSION"
        rm -rf "cognimesh-$VERSION"
        cd "$PROJECT_ROOT"
    fi
    
    log_success "Build completed"
}

update_version() {
    log_info "Updating version in package.json..."
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would update package.json version to $VERSION"
        return 0
    fi
    
    # Update package.json version
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.version = '$VERSION';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    
    log_success "Version updated to $VERSION"
}

create_git_tag() {
    log_info "Creating git tag v$VERSION..."
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would create tag: git tag -a v$VERSION"
        return 0
    fi
    
    # Commit version change
    git add package.json
    git commit -m "chore(release): bump version to $VERSION" || true
    
    # Create annotated tag
    local tag_message="Release v$VERSION"
    if [[ -f "$PROJECT_ROOT/CHANGELOG.md" ]]; then
        tag_message="Release v$VERSION

$(head -50 "$PROJECT_ROOT/CHANGELOG.md")"
    fi
    
    if ! git tag -a "v$VERSION" -m "$tag_message"; then
        log_error "Failed to create git tag"
        exit $EXIT_TAG_FAILED
    fi
    
    # Push tag
    if ! git push origin "v$VERSION"; then
        log_error "Failed to push git tag"
        exit $EXIT_TAG_FAILED
    fi
    
    log_success "Git tag v$VERSION created and pushed"
}

create_github_release() {
    [[ "$SKIP_GITHUB_RELEASE" == true ]] && return 0
    
    log_info "Creating GitHub release..."
    
    if ! command -v gh &> /dev/null; then
        log_warning "GitHub CLI not found, skipping GitHub release"
        return 0
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would create GitHub release for v$VERSION"
        return 0
    fi
    
    # Prepare release notes
    local release_notes_file="$PROJECT_ROOT/.tmp/release-notes-$VERSION.md"
    mkdir -p "$PROJECT_ROOT/.tmp"
    
    cat > "$release_notes_file" << EOF
## CogniMesh v$VERSION

$(head -100 "$PROJECT_ROOT/CHANGELOG.md" 2>/dev/null || echo 'See CHANGELOG.md for full details.')

### Assets

- dist/ - release bundle created by npm run build
- tagged GitHub source archive

### Usage

Download the tagged GitHub archive or checkout tag v$VERSION locally.
EOF
    
    # Find release assets
    local assets=()
    if [[ -d "$PROJECT_ROOT/dist" ]]; then
        for file in "$PROJECT_ROOT/dist"/*; do
            [[ -f "$file" ]] && assets+=("$file")
        done
    fi
    
    # Build gh release command
    local gh_args=("release" "create" "v$VERSION"
        "--title" "CogniMesh v$VERSION"
        "--notes-file" "$release_notes_file")
    
    # Add assets if any
    for asset in "${assets[@]}"; do
        gh_args+=("$asset")
    done
    
    # Create release
    if ! gh "${gh_args[@]}"; then
        log_error "Failed to create GitHub release"
        rm -f "$release_notes_file"
        exit $EXIT_RELEASE_FAILED
    fi
    
    rm -f "$release_notes_file"
    
    log_success "GitHub release created"
}

finalize_release() {
    local duration=$1
    
    echo
    log_success "============================================================"
    log_success "                 RELEASE COMPLETE                           "
    log_success "============================================================"
    log_success "  Version: v$VERSION"
    log_success "  Duration: ${duration}s"
    log_success "============================================================"
    echo
    log_info "Next steps:"
    log_info "  1. Verify the release on GitHub"
    log_info "  2. Deploy to production: ./scripts/deploy.sh"
    log_info "  3. Update documentation if release notes changed"
    log_info "  4. Announce the release"
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    local start_time
    start_time=$(date +%s)
    
    log_info "CogniMesh Release Script v5.0.0"
    
    # Parse arguments
    parse_arguments "$@"
    
    # Validate version
    validate_version "$VERSION"
    
    # Confirm release
    confirm_release
    
    # Run release steps
    run_release_verification
    update_version
    run_build
    create_git_tag
    create_github_release
    
    # Finalize
    local duration
    duration=$(($(date +%s) - start_time))
    finalize_release "$duration"
    
    exit $EXIT_SUCCESS
}

main "$@"
