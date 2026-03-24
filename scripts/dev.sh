#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Development Script
# =============================================================================
# Description: Start development environment with watch mode, dashboard,
#              and log tailing.
# Usage: ./dev.sh [options]
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

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
NO_DASHBOARD=false
NO_WATCH=false
LOG_MODE="tail"
DASHBOARD_PORT=3000
API_PORT=3001

# Process IDs for cleanup
PIDS=()

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
log_dashboard() { log "${PURPLE}[DASHBOARD]${NC} $1"; }
log_server() { log "${GREEN}[SERVER]${NC} $1"; }

show_help() {
    cat << EOF
CogniMesh v5.0 - Development Script v${VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    -h, --help          Show this help message and exit
    -v, --verbose       Enable verbose output
    -q, --quiet         Suppress non-error output
    --no-dashboard      Start without dashboard
    --no-watch          Disable file watching
    --port PORT         Dashboard port (default: 3000)
    --api-port PORT     API server port (default: 3001)
    --logs              Show all logs (default: tail)
    --no-logs           Don't show logs

Description:
    Starts the CogniMesh development environment including:
    - Development server with file watching
    - Dashboard web interface
    - Log tailing/display

Examples:
    ${SCRIPT_NAME}                    # Start full dev environment
    ${SCRIPT_NAME} --no-dashboard     # Server only
    ${SCRIPT_NAME} --port 8080        # Custom dashboard port
    ${SCRIPT_NAME} --no-watch         # No file watching

Exit Codes:
    0 - Success (clean shutdown)
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    4 - Configuration error

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
            --no-dashboard)
                NO_DASHBOARD=true
                shift
                ;;
            --no-watch)
                NO_WATCH=true
                shift
                ;;
            --port)
                DASHBOARD_PORT="${2:-3000}"
                shift 2
                ;;
            --api-port)
                API_PORT="${2:-3001}"
                shift 2
                ;;
            --logs)
                LOG_MODE="all"
                shift
                ;;
            --no-logs)
                LOG_MODE="none"
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

cleanup() {
    log_info "Shutting down development environment..."
    
    # Kill all background processes
    for pid in "${PIDS[@]:-}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    
    # Kill any remaining node processes started by this script
    pkill -f "node.*bios.*--mode=operational" 2>/dev/null || true
    pkill -f "node.*dashboard/server" 2>/dev/null || true
    
    log_success "Development environment stopped"
    exit $EXIT_SUCCESS
}

check_dependencies() {
    log_verbose "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        return 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/src/server.js" ]] && [[ ! -f "$PROJECT_ROOT/src/bios/index.js" ]]; then
        log_error "Server entry point not found"
        return 1
    fi
    
    return 0
}

# =============================================================================
# Service Functions
# =============================================================================

start_bios_server() {
    log_server "Starting BIOS server..."
    
    cd "$PROJECT_ROOT"
    
    local watch_flag=""
    [[ "$NO_WATCH" == false ]] && watch_flag="--watch"
    
    # Start BIOS in operational mode
    if [[ "$VERBOSE" == true ]]; then
        node src/bios/index.js --mode=operational $watch_flag &
    else
        node src/bios/index.js --mode=operational $watch_flag > /dev/null 2>&1 &
    fi
    
    local pid=$!
    PIDS+=($pid)
    
    # Wait a moment for server to start
    sleep 2
    
    if kill -0 $pid 2>/dev/null; then
        log_success "BIOS server started (PID: $pid)"
        return 0
    else
        log_error "Failed to start BIOS server"
        return 1
    fi
}

start_dashboard() {
    [[ "$NO_DASHBOARD" == true ]] && return 0
    
    log_dashboard "Starting dashboard on port $DASHBOARD_PORT..."
    
    cd "$PROJECT_ROOT"
    
    if [[ ! -f "src/dashboard/server.js" ]]; then
        log_warning "Dashboard server not found, skipping"
        return 0
    fi
    
    export DASHBOARD_PORT
    
    if [[ "$VERBOSE" == true ]]; then
        node src/dashboard/server.js &
    else
        node src/dashboard/server.js > /dev/null 2>&1 &
    fi
    
    local pid=$!
    PIDS+=($pid)
    
    sleep 2
    
    if kill -0 $pid 2>/dev/null; then
        log_success "Dashboard started at http://localhost:$DASHBOARD_PORT (PID: $pid)"
        return 0
    else
        log_warning "Failed to start dashboard"
        return 0  # Non-fatal
    fi
}

show_logs() {
    [[ "$LOG_MODE" == "none" ]] && return 0
    
    log_info "Starting log display..."
    
    local log_dir="$PROJECT_ROOT/logs"
    
    if [[ ! -d "$log_dir" ]]; then
        log_warning "Log directory not found"
        return 0
    fi
    
    # Find the most recent log file
    local latest_log
    latest_log=$(find "$log_dir" -name "*.log" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    
    if [[ -z "$latest_log" ]]; then
        log_warning "No log files found"
        return 0
    fi
    
    log_info "Tailing log: $(basename "$latest_log")"
    
    if [[ "$LOG_MODE" == "tail" ]]; then
        tail -f "$latest_log" &
        PIDS+=($!)
    else
        cat "$latest_log"
    fi
}

print_status() {
    echo
    log_success "Development environment running!"
    echo
    log_info "Services:"
    [[ "$NO_DASHBOARD" == false ]] && log "  Dashboard: http://localhost:$DASHBOARD_PORT"
    log "  Logs:      $PROJECT_ROOT/logs/"
    echo
    log_info "Press Ctrl+C to stop"
    echo
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    log_info "CogniMesh v5.0 Development Environment v${VERSION}"
    
    # Setup cleanup trap
    trap cleanup SIGINT SIGTERM EXIT
    
    # Parse arguments
    parse_arguments "$@"
    
    # Check dependencies
    if ! check_dependencies; then
        exit $EXIT_DEPENDENCY_MISSING
    fi
    
    # Check for .env file
    if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        log_warning ".env file not found. Run setup.sh first."
    fi
    
    # Start services
    start_bios_server || exit $EXIT_GENERAL_ERROR
    start_dashboard
    
    # Show status
    print_status
    
    # Show logs if requested
    if [[ "$LOG_MODE" == "tail" ]]; then
        show_logs
    fi
    
    # Wait for interrupt
    wait
}

main "$@"
