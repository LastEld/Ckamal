#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Test Script
# =============================================================================
# Description: Run tests with support for unit, integration, coverage,
#              and various output formats.
# Usage: ./test.sh [options] [test-files...]
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
readonly EXIT_TEST_FAILURE=8

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
COVERAGE=false
WATCH=false
TEST_TYPE="all"
TEST_PATTERN=""
REPORTER="spec"
TIMEOUT=30000
BAIL=false
MAX_WORKERS=""
UPDATE_SNAPSHOTS=false

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

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

show_help() {
    cat << EOF
CogniMesh v5.0 - Test Script v${VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS] [TEST-PATTERNS...]

Options:
    -h, --help              Show this help message and exit
    -v, --verbose           Enable verbose output
    -q, --quiet             Suppress non-error output
    -u, --unit              Run unit tests only
    -i, --integration       Run integration tests only
    -c, --coverage          Generate coverage report
    -w, --watch             Watch mode (re-run on file changes)
    -b, --bail              Stop on first failure
    -t, --timeout MS        Test timeout in milliseconds (default: 30000)
    -r, --reporter TYPE     Test reporter (spec, dot, json, junit)
    -j, --workers N         Maximum number of workers
    -u, --update            Update snapshots

Test Patterns:
    Specify test file patterns to run specific tests.
    Examples: "auth.test.js", "unit/", "*.spec.js"

Examples:
    ${SCRIPT_NAME}                    # Run all tests
    ${SCRIPT_NAME} -u                 # Run unit tests only
    ${SCRIPT_NAME} -i                 # Run integration tests only
    ${SCRIPT_NAME} -c                 # Run with coverage
    ${SCRIPT_NAME} -w                 # Watch mode
    ${SCRIPT_NAME} auth.test.js       # Run specific test file
    ${SCRIPT_NAME} -u -c              # Unit tests with coverage
    ${SCRIPT_NAME} --bail             # Stop on first failure

Exit Codes:
    0 - All tests passed
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    8 - Test failure(s)

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
            -u|--unit)
                TEST_TYPE="unit"
                shift
                ;;
            -i|--integration)
                TEST_TYPE="integration"
                shift
                ;;
            -c|--coverage)
                COVERAGE=true
                shift
                ;;
            -w|--watch)
                WATCH=true
                shift
                ;;
            -b|--bail)
                BAIL=true
                shift
                ;;
            -t|--timeout)
                TIMEOUT="${2:-30000}"
                shift 2
                ;;
            -r|--reporter)
                REPORTER="${2:-spec}"
                shift 2
                ;;
            -j|--workers)
                MAX_WORKERS="${2:-}"
                shift 2
                ;;
            --update)
                UPDATE_SNAPSHOTS=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                show_help
                exit $EXIT_INVALID_ARGS
                ;;
            *)
                TEST_PATTERN="$1"
                shift
                ;;
        esac
    done
}

check_dependencies() {
    log_verbose "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        return 1
    fi
    
    if [[ ! -d "$PROJECT_ROOT/tests" ]] && [[ ! -d "$PROJECT_ROOT/test" ]]; then
        log_warning "Tests directory not found"
    fi
    
    return 0
}

find_test_framework() {
    # Check for various test frameworks
    if [[ -f "$PROJECT_ROOT/package.json" ]]; then
        if grep -q "jest" "$PROJECT_ROOT/package.json" 2>/dev/null; then
            echo "jest"
            return 0
        elif grep -q "mocha" "$PROJECT_ROOT/package.json" 2>/dev/null; then
            echo "mocha"
            return 0
        elif grep -q "vitest" "$PROJECT_ROOT/package.json" 2>/dev/null; then
            echo "vitest"
            return 0
        elif grep -q "ava" "$PROJECT_ROOT/package.json" 2>/dev/null; then
            echo "ava"
            return 0
        fi
    fi
    
    # Default to node --test if available (Node 18+)
    if node --test --help &> /dev/null; then
        echo "node"
        return 0
    fi
    
    echo ""
    return 0
}

# =============================================================================
# Test Functions
# =============================================================================

run_node_tests() {
    log_info "Running tests with Node.js built-in test runner..."
    
    cd "$PROJECT_ROOT"
    
    local test_dir="tests"
    [[ ! -d "$test_dir" ]] && test_dir="test"
    [[ ! -d "$test_dir" ]] && test_dir="src"
    
    local test_files=()
    
    case $TEST_TYPE in
        unit)
            test_files+=("$test_dir/unit"/*.js "$test_dir/**/*.unit.js" 2>/dev/null)
            ;;
        integration)
            test_files+=("$test_dir/integration"/*.js "$test_dir/**/*.integration.js" 2>/dev/null)
            ;;
        *)
            test_files+=("$test_dir"/*.js "$test_dir/**/*.test.js" "$test_dir/**/*.spec.js" 2>/dev/null)
            ;;
    esac
    
    # Filter by pattern if specified
    if [[ -n "$TEST_PATTERN" ]]; then
        test_files=("$TEST_PATTERN")
    fi
    
    local cmd=(node --test)
    [[ "$TEST_TYPE" == "unit" ]] && cmd+=(--test-name-pattern="Unit")
    [[ "$TEST_TYPE" == "integration" ]] && cmd+=(--test-name-pattern="Integration")
    
    if [[ "$WATCH" == true ]]; then
        log_warning "Watch mode not supported with Node.js built-in runner"
        log_info "Use 'npm install --save-dev jest' for watch mode"
    fi
    
    log_verbose "Running: ${cmd[*]} ${test_files[*]}"
    
    if "${cmd[@]}" "${test_files[@]}" 2>&1; then
        TESTS_PASSED=1
        return 0
    else
        TESTS_FAILED=1
        return 1
    fi
}

run_jest_tests() {
    log_info "Running tests with Jest..."
    
    cd "$PROJECT_ROOT"
    
    local cmd=(npx jest)
    
    # Add options
    [[ "$VERBOSE" == true ]] && cmd+=(--verbose)
    [[ "$COVERAGE" == true ]] && cmd+=(--coverage)
    [[ "$WATCH" == true ]] && cmd+=(--watch)
    [[ "$BAIL" == true ]] && cmd+=(--bail)
    [[ "$UPDATE_SNAPSHOTS" == true ]] && cmd+=(--updateSnapshot)
    
    # Test type selection
    case $TEST_TYPE in
        unit)
            cmd+=(--testPathPattern="unit|\.unit\.|\.spec\.")
            ;;
        integration)
            cmd+=(--testPathPattern="integration|\.integration\.")
            ;;
    esac
    
    # Add test pattern if specified
    [[ -n "$TEST_PATTERN" ]] && cmd+=(--testPathPattern="$TEST_PATTERN")
    
    # Reporter
    cmd+=(--reporter="$REPORTER")
    
    # Workers
    [[ -n "$MAX_WORKERS" ]] && cmd+=(--maxWorkers="$MAX_WORKERS")
    
    log_verbose "Running: ${cmd[*]}"
    
    if "${cmd[@]}" 2>&1; then
        TESTS_PASSED=1
        return 0
    else
        TESTS_FAILED=1
        return 1
    fi
}

run_mocha_tests() {
    log_info "Running tests with Mocha..."
    
    cd "$PROJECT_ROOT"
    
    local cmd=(npx mocha)
    
    # Add options
    [[ "$VERBOSE" == true ]] && cmd+=(--reporter spec)
    [[ "$BAIL" == true ]] && cmd+=(--bail)
    [[ "$WATCH" == true ]] && cmd+=(--watch)
    
    # Test type selection
    local test_files=()
    case $TEST_TYPE in
        unit)
            test_files+=("tests/unit/**/*.js" "test/unit/**/*.js" 2>/dev/null)
            ;;
        integration)
            test_files+=("tests/integration/**/*.js" "test/integration/**/*.js" 2>/dev/null)
            ;;
        *)
            test_files+=("tests/**/*.js" "test/**/*.js" 2>/dev/null)
            ;;
    esac
    
    # Filter by pattern if specified
    if [[ -n "$TEST_PATTERN" ]]; then
        test_files=("$TEST_PATTERN")
    fi
    
    # Coverage with nyc
    if [[ "$COVERAGE" == true ]]; then
        cmd=(npx nyc "${cmd[@]}")
    fi
    
    log_verbose "Running: ${cmd[*]} ${test_files[*]}"
    
    if "${cmd[@]}" "${test_files[@]}" 2>&1; then
        TESTS_PASSED=1
        return 0
    else
        TESTS_FAILED=1
        return 1
    fi
}

run_vitest_tests() {
    log_info "Running tests with Vitest..."
    
    cd "$PROJECT_ROOT"
    
    local cmd=(npx vitest run)
    
    # Add options
    [[ "$VERBOSE" == true ]] && cmd+=(--reporter=verbose)
    [[ "$COVERAGE" == true ]] && cmd+=(--coverage)
    [[ "$BAIL" == true ]] && cmd+=(--bail)
    [[ "$UPDATE_SNAPSHOTS" == true ]] && cmd+=(--update)
    
    # Test type selection
    case $TEST_TYPE in
        unit)
            cmd+=(--testNamePattern="Unit")
            ;;
        integration)
            cmd+=(--testNamePattern="Integration")
            ;;
    esac
    
    # Watch mode uses different command
    if [[ "$WATCH" == true ]]; then
        cmd=(npx vitest)
    fi
    
    # Add test pattern if specified
    [[ -n "$TEST_PATTERN" ]] && cmd+=("$TEST_PATTERN")
    
    log_verbose "Running: ${cmd[*]}"
    
    if "${cmd[@]}" 2>&1; then
        TESTS_PASSED=1
        return 0
    else
        TESTS_FAILED=1
        return 1
    fi
}

show_test_summary() {
    echo
    log_info "Test Summary"
    echo "================================"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All tests passed!"
        return 0
    else
        log_error "Some tests failed!"
        return 1
    fi
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    log_info "CogniMesh v5.0 Test Runner v${VERSION}"
    
    # Parse arguments
    parse_arguments "$@"
    
    # Check dependencies
    if ! check_dependencies; then
        exit $EXIT_DEPENDENCY_MISSING
    fi
    
    # Find test framework
    local framework
    framework=$(find_test_framework)
    
    if [[ -z "$framework" ]]; then
        log_error "No test framework detected"
        log_info "Install Jest, Mocha, Vitest, or use Node.js 18+ built-in test runner"
        exit $EXIT_DEPENDENCY_MISSING
    fi
    
    log_verbose "Detected test framework: $framework"
    
    # Run tests based on framework
    local test_result=0
    case $framework in
        jest)
            run_jest_tests || test_result=$?
            ;;
        mocha)
            run_mocha_tests || test_result=$?
            ;;
        vitest)
            run_vitest_tests || test_result=$?
            ;;
        node)
            run_node_tests || test_result=$?
            ;;
    esac
    
    # Show summary
    if [[ "$WATCH" == false ]]; then
        show_test_summary
    fi
    
    # Exit with appropriate code
    if [[ $test_result -eq 0 ]]; then
        exit $EXIT_SUCCESS
    else
        exit $EXIT_TEST_FAILURE
    fi
}

main "$@"
