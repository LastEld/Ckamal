#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Migration Script
# =============================================================================
# Description: Database migration management - run, rollback, check status.
# Usage: ./migrate.sh [command] [options]
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
readonly EXIT_MIGRATION_ERROR=5

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
ENVIRONMENT="development"
DRY_RUN=false
FORCE=false

# Migration tracking
MIGRATIONS_DIR="$PROJECT_ROOT/src/db/migrations"

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
CogniMesh v5.0 - Migration Script v${VERSION}

Usage: ${SCRIPT_NAME} [COMMAND] [OPTIONS]

Commands:
    up                      Run pending migrations (default)
    down                    Rollback last migration
    rollback [N]            Rollback N migrations (default: 1)
    reset                   Rollback all migrations
    status                  Show migration status
    create NAME             Create new migration file
    pending                 List pending migrations
    verify                  Verify migration integrity

Options:
    -h, --help              Show this help message and exit
    -v, --verbose           Enable verbose output
    -q, --quiet             Suppress non-error output
    -e, --env ENV           Environment (default: development)
    --dry-run               Show what would be executed
    --force                 Force operation without confirmation

Description:
    Manages database migrations for CogniMesh.

Examples:
    ${SCRIPT_NAME}                    # Run pending migrations
    ${SCRIPT_NAME} up                 # Same as above
    ${SCRIPT_NAME} down               # Rollback last migration
    ${SCRIPT_NAME} rollback 3         # Rollback 3 migrations
    ${SCRIPT_NAME} status             # Show migration status
    ${SCRIPT_NAME} create add_users   # Create new migration
    ${SCRIPT_NAME} pending            # List pending migrations

Exit Codes:
    0 - Success
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    5 - Migration error

EOF
}

parse_arguments() {
    local command=""
    
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
            -e|--env)
                ENVIRONMENT="${2:-development}"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            up|down|rollback|reset|status|create|pending|verify)
                command="$1"
                shift
                ;;
            *)
                if [[ -z "$command" ]]; then
                    command="$1"
                else
                    command_args+=("$1")
                fi
                shift
                ;;
        esac
    done
    
    # Default command
    [[ -z "$command" ]] && command="up"
    
    # Export command
    echo "$command"
    [[ ${#command_args[@]} -gt 0 ]] && echo "${command_args[@]}"
}

get_database_path() {
    echo "$PROJECT_ROOT/data/db/cognimesh_${ENVIRONMENT}.db"
}

get_applied_migrations() {
    local db_path
    db_path=$(get_database_path)
    
    if [[ ! -f "$db_path" ]]; then
        return
    fi
    
    sqlite3 "$db_path" "SELECT name FROM migrations ORDER BY applied_at;" 2>/dev/null || true
}

get_pending_migrations() {
    local applied
    applied=$(get_applied_migrations)
    
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
        return
    fi
    
    for file in "$MIGRATIONS_DIR"/*.js; do
        if [[ -f "$file" ]]; then
            local name
            name=$(basename "$file" .js)
            if ! echo "$applied" | grep -q "^${name}$"; then
                echo "$name"
            fi
        fi
    done
}

# =============================================================================
# Migration Commands
# =============================================================================

cmd_up() {
    log_info "Running pending migrations..."
    
    local pending
    pending=$(get_pending_migrations)
    
    if [[ -z "$pending" ]]; then
        log_success "No pending migrations"
        return 0
    fi
    
    log_verbose "Pending migrations:"
    echo "$pending" | while read -r migration; do
        log_verbose "  - $migration"
    done
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "Dry run - would execute:"
        echo "$pending" | while read -r migration; do
            log "  node $MIGRATIONS_DIR/${migration}.js"
        done
        return 0
    fi
    
    local db_path
    db_path=$(get_database_path)
    
    echo "$pending" | while read -r migration; do
        log_info "Running migration: $migration"
        
        local migration_file="$MIGRATIONS_DIR/${migration}.js"
        
        if [[ ! -f "$migration_file" ]]; then
            log_error "Migration file not found: $migration_file"
            return $EXIT_MIGRATION_ERROR
        fi
        
        # Run the migration
        if node "$migration_file" up; then
            # Record migration
            local batch
            batch=$(sqlite3 "$db_path" "SELECT COALESCE(MAX(batch), 0) + 1 FROM migrations;" 2>/dev/null || echo "1")
            sqlite3 "$db_path" "INSERT INTO migrations (name, batch, checksum) VALUES ('$migration', $batch, '');" 2>/dev/null || true
            
            log_success "Migrated: $migration"
        else
            log_error "Failed: $migration"
            return $EXIT_MIGRATION_ERROR
        fi
    done
    
    log_success "All migrations completed"
    return 0
}

cmd_down() {
    log_warning "Rolling back last migration..."
    
    local db_path
    db_path=$(get_database_path)
    
    if [[ ! -f "$db_path" ]]; then
        log_error "Database not found"
        return $EXIT_MIGRATION_ERROR
    fi
    
    local last_migration
    last_migration=$(sqlite3 "$db_path" "SELECT name FROM migrations ORDER BY applied_at DESC LIMIT 1;" 2>/dev/null)
    
    if [[ -z "$last_migration" ]]; then
        log_warning "No migrations to rollback"
        return 0
    fi
    
    log_info "Rolling back: $last_migration"
    
    if [[ "$DRY_RUN" == false ]]; then
        local migration_file="$MIGRATIONS_DIR/${last_migration}.js"
        
        if [[ -f "$migration_file" ]]; then
            node "$migration_file" down
        fi
        
        sqlite3 "$db_path" "DELETE FROM migrations WHERE name = '$last_migration';" 2>/dev/null || true
        log_success "Rolled back: $last_migration"
    else
        log_info "Dry run - would rollback: $last_migration"
    fi
    
    return 0
}

cmd_rollback() {
    local count="${1:-1}"
    
    log_warning "Rolling back $count migration(s)..."
    
    if [[ "$FORCE" == false ]] && [[ "$DRY_RUN" == false ]]; then
        read -p "Are you sure? (yes/N): " -r
        echo
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Rollback cancelled"
            return 0
        fi
    fi
    
    for ((i=1; i<=count; i++)); do
        cmd_down || return $?
    done
    
    return 0
}

cmd_reset() {
    log_warning "Rolling back ALL migrations..."
    
    if [[ "$FORCE" == false ]] && [[ "$DRY_RUN" == false ]]; then
        read -p "This will delete all data! Are you sure? (yes/N): " -r
        echo
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Reset cancelled"
            return 0
        fi
    fi
    
    local count
    count=$(sqlite3 "$(get_database_path)" "SELECT COUNT(*) FROM migrations;" 2>/dev/null || echo "0")
    
    cmd_rollback "$count"
}

cmd_status() {
    log_info "Migration Status"
    echo
    
    local db_path
    db_path=$(get_database_path)
    
    printf "%-30s %-20s %s\n" "MIGRATION" "APPLIED AT" "BATCH"
    echo "───────────────────────────────────────────────────────────────"
    
    if [[ -f "$db_path" ]]; then
        sqlite3 "$db_path" "SELECT name, applied_at, batch FROM migrations ORDER BY applied_at;" 2>/dev/null | \
        while IFS='|' read -r name applied_at batch; do
            printf "${GREEN}✓${NC} %-28s %-20s %s\n" "$name" "$applied_at" "$batch"
        done
    fi
    
    local pending
    pending=$(get_pending_migrations)
    
    if [[ -n "$pending" ]]; then
        echo "$pending" | while read -r migration; do
            printf "${YELLOW}○${NC} %-28s %-20s %s\n" "$migration" "pending" "-"
        done
    fi
    
    echo
    
    local applied_count
    applied_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM migrations;" 2>/dev/null || echo "0")
    local pending_count
    pending_count=$(echo "$pending" | grep -c "^" || echo "0")
    
    log_info "Total: $applied_count applied, $pending_count pending"
}

cmd_create() {
    local name="${1:-migration}"
    
    # Create migration name with timestamp
    local timestamp
    timestamp=$(date +"%Y%m%d%H%M%S")
    local migration_name="${timestamp}_${name}"
    local migration_file="$MIGRATIONS_DIR/${migration_name}.js"
    
    mkdir -p "$MIGRATIONS_DIR"
    
    cat > "$migration_file" << 'EOF'
/**
 * Migration: ${migration_name}
 * Created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
 */

export async function up(db) {
    // Migration up logic
    // Example:
    // await db.exec(`CREATE TABLE users (...)`);
    console.log('Running up migration: ${migration_name}');
}

export async function down(db) {
    // Migration down logic (rollback)
    // Example:
    // await db.exec(`DROP TABLE users`);
    console.log('Running down migration: ${migration_name}');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const action = process.argv[2] || 'up';
    // db connection setup here
    if (action === 'up') {
        await up();
    } else {
        await down();
    }
}
EOF
    
    log_success "Created migration: $migration_file"
}

cmd_pending() {
    log_info "Pending Migrations"
    echo
    
    local pending
    pending=$(get_pending_migrations)
    
    if [[ -z "$pending" ]]; then
        log_success "No pending migrations"
        return 0
    fi
    
    echo "$pending" | while read -r migration; do
        echo "  ○ $migration"
    done
    
    local count
    count=$(echo "$pending" | grep -c "^" || echo "0")
    echo
    log_info "$count pending migration(s)"
}

cmd_verify() {
    log_info "Verifying migration integrity..."
    
    local db_path
    db_path=$(get_database_path)
    local errors=0
    
    if [[ ! -f "$db_path" ]]; then
        log_error "Database not found"
        return $EXIT_MIGRATION_ERROR
    fi
    
    # Check that all recorded migrations have files
    sqlite3 "$db_path" "SELECT name FROM migrations;" 2>/dev/null | while read -r name; do
        if [[ ! -f "$MIGRATIONS_DIR/${name}.js" ]]; then
            log_error "Missing migration file: ${name}.js"
            ((errors++))
        fi
    done
    
    # Check that all migration files are recorded
    for file in "$MIGRATIONS_DIR"/*.js; do
        if [[ -f "$file" ]]; then
            local name
            name=$(basename "$file" .js)
            if ! sqlite3 "$db_path" "SELECT 1 FROM migrations WHERE name = '$name';" 2>/dev/null | grep -q "1"; then
                log_warning "Unapplied migration: $name"
            fi
        fi
    done
    
    if [[ $errors -eq 0 ]]; then
        log_success "Migration integrity verified"
        return 0
    else
        log_error "Migration integrity check failed"
        return $EXIT_MIGRATION_ERROR
    fi
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    log_info "CogniMesh v5.0 Migration v${VERSION}"
    
    # Parse arguments and get command
    local parsed
    parsed=$(parse_arguments "$@")
    local command="$(echo "$parsed" | head -1)"
    local args_str="$(echo "$parsed" | tail -n +2)"
    local args=($args_str)
    
    log_verbose "Command: $command"
    log_verbose "Environment: $ENVIRONMENT"
    log_verbose "Database: $(get_database_path)"
    
    # Check for SQLite
    if ! command -v sqlite3 &> /dev/null; then
        log_warning "sqlite3 not found, some features may not work"
    fi
    
    # Execute command
    case $command in
        up)
            cmd_up
            ;;
        down)
            cmd_down
            ;;
        rollback)
            cmd_rollback "${args[0]:-1}"
            ;;
        reset)
            cmd_reset
            ;;
        status)
            cmd_status
            ;;
        create)
            cmd_create "${args[0]:-migration}"
            ;;
        pending)
            cmd_pending
            ;;
        verify)
            cmd_verify
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit $EXIT_INVALID_ARGS
            ;;
    esac
    
    exit $?
}

main "$@"
