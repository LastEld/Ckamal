#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Documentation Generation Script
# =============================================================================
# Description: Generate JSDoc documentation and API reference.
# Usage: ./generate-docs.sh [options]
# =============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly VERSION="5.0.0"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_INVALID_ARGS=2

# Colors
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
OUTPUT_DIR="docs"
WATCH=false
SERVE=false
OPEN_BROWSER=false

log() { [[ "$QUIET" == false ]] && echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { log "${YELLOW}[WARNING]${NC} $1"; }
log_verbose() { [[ "$VERBOSE" == true ]] && log_info "$1"; }

show_help() {
    cat << EOF
CogniMesh v5.0 - Documentation Generator v${VERSION}

Usage: $(basename "$0") [OPTIONS]

Options:
    -h, --help          Show this help message and exit
    -v, --verbose       Enable verbose output
    -q, --quiet         Suppress non-error output
    -o, --output DIR    Output directory (default: docs)
    --watch             Watch mode - regenerate on changes
    --serve             Start documentation server
    --open              Open documentation in browser

Description:
    Generates documentation from JSDoc comments and API specs.

Examples:
    $(basename "$0")                    # Generate documentation
    $(basename "$0") --watch            # Watch mode
    $(basename "$0") --serve            # Generate and serve

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
            -o|--output)
                OUTPUT_DIR="${2:-docs}"
                shift 2
                ;;
            --watch)
                WATCH=true
                shift
                ;;
            --serve)
                SERVE=true
                shift
                ;;
            --open)
                OPEN_BROWSER=true
                shift
                ;;
            *)
                echo "Unknown option: $1" >&2
                exit $EXIT_INVALID_ARGS
                ;;
        esac
    done
}

generate_jsdoc() {
    log_info "Generating JSDoc documentation..."
    
    local output_path="$PROJECT_ROOT/$OUTPUT_DIR"
    mkdir -p "$output_path"
    
    # Check if JSDoc is available
    if npx jsdoc --version &> /dev/null; then
        log_verbose "Using JSDoc..."
        
        local jsdoc_config="$PROJECT_ROOT/jsdoc.json"
        
        if [[ -f "$jsdoc_config" ]]; then
            npx jsdoc -c "$jsdoc_config" -d "$output_path"
        else
            # Default JSDoc configuration
            npx jsdoc \
                -r "$PROJECT_ROOT/src" \
                -d "$output_path" \
                -c /dev/null \
                --readme "$PROJECT_ROOT/README.md" \
                --package "$PROJECT_ROOT/package.json" 2>/dev/null || {
                log_warning "JSDoc generation failed, using fallback"
                generate_fallback_docs
            }
        fi
    else
        log_warning "JSDoc not installed, using fallback documentation"
        generate_fallback_docs
    fi
    
    log_success "Documentation generated in $OUTPUT_DIR/"
}

generate_fallback_docs() {
    local output_path="$PROJECT_ROOT/$OUTPUT_DIR"
    mkdir -p "$output_path"
    
    # Create a basic HTML documentation
    cat > "$output_path/index.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>CogniMesh v${VERSION} Documentation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
        .module { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .module h3 { margin-top: 0; color: #007acc; }
        .file-list { columns: 2; }
        .file-list li { margin: 5px 0; }
    </style>
</head>
<body>
    <h1>CogniMesh v${VERSION} Documentation</h1>
    <p>Generated: $(date)</p>
    
    <h2>Modules</h2>
    <div id="modules"></div>
    
    <h2>Source Files</h2>
    <ul class="file-list">
        $(find "$PROJECT_ROOT/src" -name "*.js" -type f | sed 's|.*src/||' | awk '{print "<li>" $0 "</li>"}')
    </ul>
</body>
</html>
EOF
}

generate_api_reference() {
    log_info "Generating API reference..."
    
    local api_docs="$PROJECT_ROOT/$OUTPUT_DIR/api"
    mkdir -p "$api_docs"
    
    # Check for OpenAPI/Swagger spec
    if [[ -f "$PROJECT_ROOT/openapi.yaml" ]] || [[ -f "$PROJECT_ROOT/openapi.json" ]]; then
        log_verbose "Found OpenAPI specification"
        
        # Copy OpenAPI spec
        if [[ -f "$PROJECT_ROOT/openapi.yaml" ]]; then
            cp "$PROJECT_ROOT/openapi.yaml" "$api_docs/"
        else
            cp "$PROJECT_ROOT/openapi.json" "$api_docs/"
        fi
    fi
    
    # Extract API endpoints from source
    local api_md="$api_docs/endpoints.md"
    
    cat > "$api_md" << EOF
# API Reference

## Endpoints

This document provides an overview of the CogniMesh API endpoints.

### Generated from source code:

EOF
    
    # Extract route definitions from source
    grep -r "app\.[get|post|put|delete|patch]" "$PROJECT_ROOT/src" --include="*.js" 2>/dev/null | \
        head -50 | \
        sed 's/.*src\//- /' >> "$api_md" || true
    
    log_verbose "API reference generated"
}

serve_docs() {
    log_info "Starting documentation server..."
    
    local docs_path="$PROJECT_ROOT/$OUTPUT_DIR"
    local port=8080
    
    if command -v python3 &> /dev/null; then
        log_info "Serving on http://localhost:$port"
        
        if [[ "$OPEN_BROWSER" == true ]]; then
            (sleep 2 && open "http://localhost:$port" || xdg-open "http://localhost:$port") &
        fi
        
        cd "$docs_path" && python3 -m http.server $port
    elif command -v npx &> /dev/null; then
        npx serve "$docs_path" -l $port
    else
        log_warning "Cannot start server - python3 or npx required"
    fi
}

main() {
    log_info "CogniMesh v5.0 Documentation Generator v${VERSION}"
    
    parse_arguments "$@"
    
    # Generate documentation
    generate_jsdoc
    generate_api_reference
    
    # Serve if requested
    if [[ "$SERVE" == true ]]; then
        serve_docs
    elif [[ "$WATCH" == true ]]; then
        log_info "Watch mode - press Ctrl+C to stop"
        while true; do
            sleep 5
            generate_jsdoc
        done
    fi
    
    log_success "Documentation generation complete"
    exit $EXIT_SUCCESS
}

main "$@"
