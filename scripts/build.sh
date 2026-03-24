#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Build Script
# =============================================================================
# Description: Production build with linting, type checking, and bundling.
# Usage: ./build.sh [options]
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
readonly EXIT_BUILD_FAILURE=7

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
CLEAN=false
SKIP_LINT=false
SKIP_TYPECHECK=false
SKIP_BUNDLE=false
ANALYZE=false
TARGET="production"
OUTPUT_DIR="dist"

# Build stats
BUILD_START_TIME=0
BUILD_END_TIME=0

# =============================================================================
# Helper Functions
# =============================================================================

log() {
    if [[ "$QUIET" == false ]]; then
        echo -e "$1"
    fi

    return 0
}

log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { log "${YELLOW}[WARNING]${NC} $1"; }
log_error() { log "${RED}[ERROR]${NC} $1" >&2; }
log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        log_info "$1"
    fi

    return 0
}

show_help() {
    cat << EOF
CogniMesh v5.0 - Build Script v${VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    -h, --help              Show this help message and exit
    -v, --verbose           Enable verbose output
    -q, --quiet             Suppress non-error output
    -c, --clean             Clean build directory before building
    --skip-lint             Skip linting
    --skip-typecheck        Skip type checking
    --skip-bundle           Skip bundling step
    --analyze               Analyze bundle size
    --target TARGET         Build target (production|development, default: production)
    -o, --output DIR        Output directory (default: dist)

Description:
    Performs a production build including:
    - Linting with ESLint
    - Type checking (if TypeScript configured)
    - Bundling with webpack/esbuild/rollup
    - Asset optimization

Examples:
    ${SCRIPT_NAME}                    # Standard production build
    ${SCRIPT_NAME} --clean            # Clean build
    ${SCRIPT_NAME} --target dev       # Development build
    ${SCRIPT_NAME} --analyze          # Build with bundle analysis
    ${SCRIPT_NAME} --skip-lint        # Build without linting

Exit Codes:
    0 - Build successful
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    7 - Build failure

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
            -c|--clean)
                CLEAN=true
                shift
                ;;
            --skip-lint)
                SKIP_LINT=true
                shift
                ;;
            --skip-typecheck)
                SKIP_TYPECHECK=true
                shift
                ;;
            --skip-bundle)
                SKIP_BUNDLE=true
                shift
                ;;
            --analyze)
                ANALYZE=true
                shift
                ;;
            --target)
                TARGET="${2:-production}"
                shift 2
                ;;
            -o|--output)
                OUTPUT_DIR="${2:-dist}"
                shift 2
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit $EXIT_INVALID_ARGS
                ;;
        esac
    done
}

format_duration() {
    local seconds=$1
    local mins=$((seconds / 60))
    local secs=$((seconds % 60))
    printf "%02d:%02d" $mins $secs
}

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

# =============================================================================
# Build Functions
# =============================================================================

clean_build_dir() {
    [[ "$CLEAN" == false ]] && return 0
    
    log_info "Cleaning build directory..."
    
    local full_output_path="$PROJECT_ROOT/$OUTPUT_DIR"
    
    if [[ -d "$full_output_path" ]]; then
        rm -rf "$full_output_path"/*
        log_verbose "Cleaned $OUTPUT_DIR/"
    fi
    
    # Also clean common temp directories
    rm -rf "$PROJECT_ROOT/.cache" 2>/dev/null || true
    rm -rf "$PROJECT_ROOT/tmp/build" 2>/dev/null || true
    
    log_success "Build directory cleaned"
}

run_linting() {
    [[ "$SKIP_LINT" == true ]] && return 0
    
    log_info "Running linter..."
    
    cd "$PROJECT_ROOT"
    
    # Check for ESLint
    if [[ -f ".eslintrc.cjs" ]] || [[ -f ".eslintrc.js" ]] || [[ -f ".eslintrc.json" ]] || [[ -f ".eslintrc.yml" ]] || [[ -f ".eslintrc" ]]; then
        if npx eslint --version &> /dev/null; then
            local eslint_args=("src/")
            [[ "$VERBOSE" == false ]] && eslint_args+=(--quiet)
            
            log_verbose "Running ESLint..."
            if npx eslint "${eslint_args[@]}"; then
                log_success "Linting passed"
                return 0
            else
                log_error "Linting failed"
                return 1
            fi
        else
            log_warning "ESLint config found but eslint not installed"
            return 0
        fi
    else
        log_verbose "No ESLint configuration found, skipping linting"
        return 0
    fi
}

run_typecheck() {
    [[ "$SKIP_TYPECHECK" == true ]] && return 0
    
    log_info "Running type check..."
    
    cd "$PROJECT_ROOT"
    
    # Check for TypeScript
    if [[ -f "tsconfig.json" ]]; then
        if npx tsc --version &> /dev/null; then
            log_verbose "Running TypeScript compiler..."
            if npx tsc --noEmit; then
                log_success "Type check passed"
                return 0
            else
                log_error "Type check failed"
                return 1
            fi
        else
            log_warning "tsconfig.json found but TypeScript not installed"
            return 0
        fi
    else
        log_verbose "No TypeScript configuration found, skipping type check"
        return 0
    fi
}

run_bundle() {
    [[ "$SKIP_BUNDLE" == true ]] && return 0
    
    log_info "Running bundler..."
    
    cd "$PROJECT_ROOT"
    
    local bundle_tool=""
    
    # Detect bundler from package.json
    if [[ -f "package.json" ]]; then
        if grep -q "webpack" package.json 2>/dev/null; then
            bundle_tool="webpack"
        elif grep -q "esbuild" package.json 2>/dev/null; then
            bundle_tool="esbuild"
        elif grep -q "rollup" package.json 2>/dev/null; then
            bundle_tool="rollup"
        elif grep -q "vite" package.json 2>/dev/null; then
            bundle_tool="vite"
        elif grep -q "parcel" package.json 2>/dev/null; then
            bundle_tool="parcel"
        fi
    fi
    
    # Also check for config files
    [[ -f "webpack.config.js" ]] && bundle_tool="webpack"
    [[ -f "esbuild.config.js" ]] && bundle_tool="esbuild"
    [[ -f "rollup.config.js" ]] && bundle_tool="rollup"
    [[ -f "vite.config.js" ]] && bundle_tool="vite"
    
    case $bundle_tool in
        webpack)
            log_verbose "Using webpack..."
            local wp_args=(--mode="$TARGET")
            [[ "$ANALYZE" == true ]] && wp_args+=(--analyze)
            npx webpack "${wp_args[@]}" || return 1
            ;;
        esbuild)
            log_verbose "Using esbuild..."
            if [[ -f "esbuild.config.js" ]]; then
                node esbuild.config.js || return 1
            else
                log_error "esbuild.config.js not found"
                return 1
            fi
            ;;
        rollup)
            log_verbose "Using rollup..."
            npx rollup -c || return 1
            ;;
        vite)
            log_verbose "Using Vite..."
            npx vite build || return 1
            ;;
        parcel)
            log_verbose "Using Parcel..."
            npx parcel build src/index.js --dist-dir "$OUTPUT_DIR" || return 1
            ;;
        *)
            # No bundler configured - copy files
            log_verbose "No bundler configured, copying source files..."
            mkdir -p "$OUTPUT_DIR"
            cp -r src "$OUTPUT_DIR/"
            [[ -d "config" ]] && cp -r config "$OUTPUT_DIR/"
            [[ -f "package.json" ]] && cp package.json "$OUTPUT_DIR/"
            [[ -f "README.md" ]] && cp README.md "$OUTPUT_DIR/"
            [[ -f "LICENSE" ]] && cp LICENSE "$OUTPUT_DIR/"
            [[ -f ".env.example" ]] && cp .env.example "$OUTPUT_DIR/"
            ;;
    esac
    
    log_success "Bundle created"
    return 0
}

optimize_assets() {
    log_info "Optimizing assets..."
    
    cd "$PROJECT_ROOT"
    
    # Optimize images if imagemin is available
    if command -v npx &> /dev/null && npx imagemin --version &> /dev/null; then
        if [[ -d "src/assets" ]] || [[ -d "assets" ]]; then
            log_verbose "Optimizing images..."
            # Add image optimization commands here
        fi
    fi
    
    # Minify JSON files
    if [[ -d "$OUTPUT_DIR" ]]; then
        find "$OUTPUT_DIR" -name "*.json" -type f -exec sh -c '
            for file; do
                python3 -m json.tool "$file" > "$file.tmp" 2>/dev/null && mv "$file.tmp" "$file" || rm -f "$file.tmp"
            done
        ' sh {} + 2>/dev/null || true
    fi
    
    log_success "Assets optimized"
}

analyze_bundle() {
    [[ "$ANALYZE" == false ]] && return 0
    
    log_info "Analyzing bundle..."
    
    # Check for bundle analyzer
    if npx webpack-bundle-analyzer --version &> /dev/null; then
        if [[ -f "$OUTPUT_DIR/stats.json" ]]; then
            npx webpack-bundle-analyzer "$OUTPUT_DIR/stats.json" &
            log_success "Bundle analyzer opened"
        fi
    fi
    
    # Show bundle size
    if [[ -d "$OUTPUT_DIR" ]]; then
        local size
        size=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1)
        log_info "Bundle size: $size"
    fi
}

generate_build_info() {
    log_verbose "Generating build info..."
    
    local build_info="$OUTPUT_DIR/build-info.json"
    
    cat > "$build_info" << EOF
{
    "version": "$VERSION",
    "target": "$TARGET",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "nodeVersion": "$(node --version)",
    "gitCommit": "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')",
    "gitBranch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF
    
    log_verbose "Build info saved to $build_info"
}

show_build_summary() {
    BUILD_END_TIME=$(date +%s)
    local duration=$((BUILD_END_TIME - BUILD_START_TIME))
    
    echo
    log_info "Build Summary"
    echo "================================"
    log "Target:    $TARGET"
    log "Output:    $OUTPUT_DIR/"
    log "Duration:  $(format_duration $duration)"
    
    if [[ -d "$OUTPUT_DIR" ]]; then
        local size
        size=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1)
        log "Size:      $size"
        
        local file_count
        file_count=$(find "$OUTPUT_DIR" -type f | wc -l)
        log "Files:     $file_count"
    fi
    
    echo
    log_success "Build completed successfully!"
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    BUILD_START_TIME=$(date +%s)
    
    log_info "CogniMesh v5.0 Build v${VERSION}"
    
    # Parse arguments
    parse_arguments "$@"
    
    log_verbose "Target: $TARGET, Output: $OUTPUT_DIR"
    
    # Check dependencies
    if ! check_dependencies; then
        exit $EXIT_DEPENDENCY_MISSING
    fi
    
    # Check for .env file
    if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        log_warning ".env file not found"
    fi
    
    local exit_code=$EXIT_SUCCESS
    
    # Clean
    clean_build_dir
    
    # Lint
    if [[ "$SKIP_LINT" == false ]]; then
        run_linting || exit_code=$EXIT_BUILD_FAILURE
    fi
    
    # Type check
    if [[ $exit_code -eq $EXIT_SUCCESS ]] && [[ "$SKIP_TYPECHECK" == false ]]; then
        run_typecheck || exit_code=$EXIT_BUILD_FAILURE
    fi
    
    # Bundle
    if [[ $exit_code -eq $EXIT_SUCCESS ]] && [[ "$SKIP_BUNDLE" == false ]]; then
        run_bundle || exit_code=$EXIT_BUILD_FAILURE
    fi
    
    # Optimize assets
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        optimize_assets
    fi
    
    # Generate build info
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        generate_build_info
    fi
    
    # Analyze
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        analyze_bundle
    fi
    
    # Show summary
    if [[ $exit_code -eq $EXIT_SUCCESS ]]; then
        show_build_summary
    else
        log_error "Build failed!"
    fi
    
    exit $exit_code
}

main "$@"
