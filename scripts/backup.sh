#!/bin/bash
# =============================================================================
# CogniMesh v5.0 - Backup Script
# =============================================================================
# Description: Database and configuration backup with rotation.
# Usage: ./backup.sh [options]
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
readonly EXIT_BACKUP_FAILURE=1

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Options
VERBOSE=false
QUIET=false
BACKUP_TYPE="full"
TAG=""
RETENTION_DAYS=30
COMPRESS=true
ENCRYPT=false
REMOTE_UPLOAD=false

# Backup tracking
BACKUP_TIMESTAMP=""
BACKUP_DIR=""
BACKUP_ARCHIVE=""

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
CogniMesh v5.0 - Backup Script v${VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    -h, --help              Show this help message and exit
    -v, --verbose           Enable verbose output
    -q, --quiet             Suppress non-error output
    -t, --type TYPE         Backup type: full|db|config (default: full)
    --tag TAG               Add tag to backup name
    --retention DAYS        Retention period in days (default: 30)
    --no-compress           Don't compress backup
    --encrypt               Encrypt backup (requires GPG)
    --upload                Upload to remote storage
    --list                  List existing backups
    --restore BACKUP        Restore from backup

Description:
    Creates backups of CogniMesh data including:
    - SQLite databases
    - Configuration files (.env)
    - Application state
    - Logs (optional)

Examples:
    ${SCRIPT_NAME}                    # Create full backup
    ${SCRIPT_NAME} --type db          # Database only
    ${SCRIPT_NAME} --tag pre-migration  # Tagged backup
    ${SCRIPT_NAME} --retention 7      # 7-day retention
    ${SCRIPT_NAME} --list             # List backups
    ${SCRIPT_NAME} --restore latest   # Restore latest backup

Exit Codes:
    0 - Backup successful
    1 - Backup failed
    2 - Invalid arguments

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
            -t|--type)
                BACKUP_TYPE="${2:-full}"
                shift 2
                ;;
            --tag)
                TAG="${2:-}"
                shift 2
                ;;
            --retention)
                RETENTION_DAYS="${2:-30}"
                shift 2
                ;;
            --no-compress)
                COMPRESS=false
                shift
                ;;
            --encrypt)
                ENCRYPT=true
                shift
                ;;
            --upload)
                REMOTE_UPLOAD=true
                shift
                ;;
            --list)
                list_backups
                exit $EXIT_SUCCESS
                ;;
            --restore)
                restore_backup "${2:-latest}"
                exit $?
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit $EXIT_INVALID_ARGS
                ;;
        esac
    done
}

format_size() {
    local size=$1
    if [[ $size -gt 1073741824 ]]; then
        echo "$(echo "scale=2; $size/1073741824" | bc) GB"
    elif [[ $size -gt 1048576 ]]; then
        echo "$(echo "scale=2; $size/1048576" | bc) MB"
    elif [[ $size -gt 1024 ]]; then
        echo "$(echo "scale=2; $size/1024" | bc) KB"
    else
        echo "${size} B"
    fi
}

# =============================================================================
# Backup Functions
# =============================================================================

initialize_backup() {
    BACKUP_TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    
    local backup_name="backup-${BACKUP_TIMESTAMP}"
    [[ -n "$TAG" ]] && backup_name="${backup_name}-${TAG}"
    [[ "$BACKUP_TYPE" != "full" ]] && backup_name="${backup_name}-${BACKUP_TYPE}"
    
    BACKUP_DIR="$PROJECT_ROOT/data/backups/${backup_name}"
    BACKUP_ARCHIVE="${BACKUP_DIR}.tar.gz"
    
    mkdir -p "$BACKUP_DIR"
    
    log_verbose "Backup directory: $BACKUP_DIR"
}

backup_database() {
    log_info "Backing up database..."
    
    local db_dir="$PROJECT_ROOT/data/db"
    local backup_db_dir="$BACKUP_DIR/db"
    
    if [[ ! -d "$db_dir" ]]; then
        log_warning "Database directory not found: $db_dir"
        return 0
    fi
    
    mkdir -p "$backup_db_dir"
    
    # Copy database files
    cp -r "$db_dir"/* "$backup_db_dir/" 2>/dev/null || true
    
    # Also create SQL dumps if sqlite3 is available
    if command -v sqlite3 &> /dev/null; then
        local sql_dir="$backup_db_dir/sql"
        mkdir -p "$sql_dir"
        
        for db_file in "$db_dir"/*.db; do
            if [[ -f "$db_file" ]]; then
                local db_name=$(basename "$db_file" .db)
                sqlite3 "$db_file" ".dump" > "$sql_dir/${db_name}.sql"
                log_verbose "Created SQL dump: ${db_name}.sql"
            fi
        done
    fi
    
    local db_size=$(du -sb "$backup_db_dir" 2>/dev/null | cut -f1)
    log_success "Database backed up ($(format_size $db_size))"
}

backup_config() {
    log_info "Backing up configuration..."
    
    local backup_config_dir="$BACKUP_DIR/config"
    mkdir -p "$backup_config_dir"
    
    # Backup .env file
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        cp "$PROJECT_ROOT/.env" "$backup_config_dir/"
        log_verbose "Backed up: .env"
    fi
    
    # Backup .env.example as reference
    if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
        cp "$PROJECT_ROOT/.env.example" "$backup_config_dir/"
        log_verbose "Backed up: .env.example"
    fi
    
    # Backup config directory
    if [[ -d "$PROJECT_ROOT/config" ]]; then
        cp -r "$PROJECT_ROOT/config" "$backup_config_dir/"
        log_verbose "Backed up: config/"
    fi
    
    # Backup package.json for version reference
    if [[ -f "$PROJECT_ROOT/package.json" ]]; then
        cp "$PROJECT_ROOT/package.json" "$backup_config_dir/"
        log_verbose "Backed up: package.json"
    fi
    
    log_success "Configuration backed up"
}

backup_state() {
    log_info "Backing up application state..."
    
    local backup_state_dir="$BACKUP_DIR/state"
    mkdir -p "$backup_state_dir"
    
    # Backup state directory
    if [[ -d "$PROJECT_ROOT/state" ]]; then
        cp -r "$PROJECT_ROOT/state"/* "$backup_state_dir/" 2>/dev/null || true
        log_verbose "Backed up: state/"
    fi
    
    # Backup cache if needed
    if [[ -d "$PROJECT_ROOT/cache" ]]; then
        cp -r "$PROJECT_ROOT/cache" "$backup_state_dir/" 2>/dev/null || true
        log_verbose "Backed up: cache/"
    fi
    
    log_success "Application state backed up"
}

backup_logs() {
    log_info "Backing up logs..."
    
    local backup_logs_dir="$BACKUP_DIR/logs"
    mkdir -p "$backup_logs_dir"
    
    if [[ -d "$PROJECT_ROOT/logs" ]]; then
        # Only backup recent logs (last 7 days)
        find "$PROJECT_ROOT/logs" -type f -name "*.log" -mtime -7 -exec cp {} "$backup_logs_dir/" \; 2>/dev/null || true
        log_verbose "Backed up recent logs"
    fi
    
    log_success "Logs backed up"
}

create_manifest() {
    local manifest="$BACKUP_DIR/backup-manifest.json"
    
    local git_commit="unknown"
    local git_branch="unknown"
    
    if command -v git &> /dev/null; then
        git_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        git_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    fi
    
    cat > "$manifest" << EOF
{
    "version": "$VERSION",
    "type": "$BACKUP_TYPE",
    "tag": "$TAG",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "hostname": "$(hostname)",
    "user": "$(whoami)",
    "git": {
        "commit": "$git_commit",
        "branch": "$git_branch"
    },
    "files": $(find "$BACKUP_DIR" -type f | wc -l),
    "size": $(du -sb "$BACKUP_DIR" 2>/dev/null | cut -f1)
}
EOF
    
    log_verbose "Manifest created"
}

compress_backup() {
    [[ "$COMPRESS" == false ]] && return 0
    
    log_info "Compressing backup..."
    
    if tar -czf "$BACKUP_ARCHIVE" -C "$(dirname "$BACKUP_DIR")" "$(basename "$BACKUP_DIR")"; then
        rm -rf "$BACKUP_DIR"
        BACKUP_DIR="$BACKUP_ARCHIVE"
        
        local archive_size=$(stat -f%z "$BACKUP_ARCHIVE" 2>/dev/null || stat -c%s "$BACKUP_ARCHIVE" 2>/dev/null || echo "0")
        log_success "Backup compressed ($(format_size $archive_size))"
    else
        log_warning "Compression failed, keeping uncompressed backup"
    fi
}

encrypt_backup() {
    [[ "$ENCRYPT" == false ]] && return 0
    
    log_info "Encrypting backup..."
    
    if ! command -v gpg &> /dev/null; then
        log_warning "GPG not found, skipping encryption"
        return 0
    fi
    
    local encrypted="${BACKUP_DIR}.gpg"
    
    if gpg --symmetric --cipher-algo AES256 --output "$encrypted" "$BACKUP_DIR"; then
        rm -f "$BACKUP_DIR"
        BACKUP_DIR="$encrypted"
        log_success "Backup encrypted"
    else
        log_warning "Encryption failed"
    fi
}

upload_backup() {
    [[ "$REMOTE_UPLOAD" == false ]] && return 0
    
    log_info "Uploading backup to remote storage..."
    
    # This is a placeholder - implement based on your storage provider
    # Examples: AWS S3, Azure Blob, Google Cloud Storage, SFTP, etc.
    
    local remote_url=""
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        remote_url=$(grep -E "^BACKUP_REMOTE_URL=" "$PROJECT_ROOT/.env" | cut -d= -f2 | tr -d '"')
    fi
    
    if [[ -z "$remote_url" ]]; then
        log_warning "BACKUP_REMOTE_URL not configured, skipping upload"
        return 0
    fi
    
    log_verbose "Would upload to: $remote_url"
    log_warning "Remote upload not implemented - configure your storage provider"
    
    # Example for AWS S3:
    # aws s3 cp "$BACKUP_DIR" "$remote_url/"
    
    # Example for SCP:
    # scp "$BACKUP_DIR" "$remote_url"
}

rotate_backups() {
    log_info "Rotating old backups..."
    
    local backup_root="$PROJECT_ROOT/data/backups"
    local deleted=0
    
    if [[ -d "$backup_root" ]]; then
        while IFS= read -r old_backup; do
            rm -rf "$old_backup"
            ((deleted++))
            log_verbose "Deleted: $(basename "$old_backup")"
        done < <(find "$backup_root" -maxdepth 1 -type f -mtime +$RETENTION_DAYS 2>/dev/null)
        
        while IFS= read -r old_backup; do
            rm -rf "$old_backup"
            ((deleted++))
            log_verbose "Deleted: $(basename "$old_backup")"
        done < <(find "$backup_root" -maxdepth 1 -type d -mtime +$RETENTION_DAYS 2>/dev/null)
    fi
    
    if [[ $deleted -gt 0 ]]; then
        log_success "Rotated $deleted old backup(s)"
    else
        log_verbose "No backups to rotate"
    fi
}

list_backups() {
    log_info "Existing backups:"
    
    local backup_root="$PROJECT_ROOT/data/backups"
    
    if [[ ! -d "$backup_root" ]]; then
        log_info "No backups found"
        return
    fi
    
    printf "%-30s %-12s %-10s %s\n" "NAME" "TYPE" "SIZE" "DATE"
    echo "────────────────────────────────────────────────────────────────"
    
    for backup in "$backup_root"/backup-*; do
        if [[ -e "$backup" ]]; then
            local name=$(basename "$backup")
            local type="full"
            [[ "$name" == *-db-* ]] && type="db"
            [[ "$name" == *-config-* ]] && type="config"
            
            local size=$(du -sh "$backup" 2>/dev/null | cut -f1)
            local date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$backup" 2>/dev/null || stat -c "%y" "$backup" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1)
            
            printf "%-30s %-12s %-10s %s\n" "$name" "$type" "$size" "$date"
        fi
    done
}

restore_backup() {
    local target="${1:-latest}"
    
    log_info "Restoring from backup: $target"
    
    local backup_root="$PROJECT_ROOT/data/backups"
    local restore_source=""
    
    if [[ "$target" == "latest" ]]; then
        restore_source=$(find "$backup_root" -maxdepth 1 -type f -name "backup-*.tar.gz" -o -type d -name "backup-*" | sort -r | head -1)
    else
        restore_source="$backup_root/$target"
    fi
    
    if [[ -z "$restore_source" ]] || [[ ! -e "$restore_source" ]]; then
        log_error "Backup not found: $target"
        return $EXIT_BACKUP_FAILURE
    fi
    
    log_warning "This will overwrite existing data!"
    read -p "Continue with restore? (yes/N): " -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Restore cancelled"
        return $EXIT_SUCCESS
    fi
    
    # Extract if compressed
    local restore_dir="$restore_source"
    if [[ "$restore_source" == *.tar.gz ]]; then
        restore_dir="$PROJECT_ROOT/tmp/restore-$(date +%s)"
        mkdir -p "$restore_dir"
        tar -xzf "$restore_source" -C "$restore_dir"
        restore_dir="$restore_dir/$(ls "$restore_dir")"
    fi
    
    # Restore database
    if [[ -d "$restore_dir/db" ]]; then
        log_info "Restoring database..."
        rm -rf "$PROJECT_ROOT/data/db"
        cp -r "$restore_dir/db" "$PROJECT_ROOT/data/"
    fi
    
    # Restore config
    if [[ -d "$restore_dir/config" ]]; then
        log_info "Restoring configuration..."
        if [[ -f "$restore_dir/config/.env" ]]; then
            cp "$restore_dir/config/.env" "$PROJECT_ROOT/"
        fi
    fi
    
    # Restore state
    if [[ -d "$restore_dir/state" ]]; then
        log_info "Restoring application state..."
        rm -rf "$PROJECT_ROOT/state"
        cp -r "$restore_dir/state" "$PROJECT_ROOT/"
    fi
    
    # Cleanup temp directory
    if [[ "$restore_source" == *.tar.gz ]]; then
        rm -rf "$(dirname "$restore_dir")"
    fi
    
    log_success "Restore completed"
    return $EXIT_SUCCESS
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    log_info "CogniMesh v5.0 Backup v${VERSION}"
    
    # Parse arguments
    parse_arguments "$@"
    
    log_verbose "Backup type: $BACKUP_TYPE"
    log_verbose "Retention: $RETENTION_DAYS days"
    
    # Initialize
    initialize_backup
    
    # Perform backup based on type
    case $BACKUP_TYPE in
        full)
            backup_database
            backup_config
            backup_state
            backup_logs
            ;;
        db)
            backup_database
            ;;
        config)
            backup_config
            ;;
        *)
            log_error "Unknown backup type: $BACKUP_TYPE"
            exit $EXIT_INVALID_ARGS
            ;;
    esac
    
    # Create manifest
    create_manifest
    
    # Compress
    compress_backup
    
    # Encrypt
    encrypt_backup
    
    # Upload
    upload_backup
    
    # Rotate old backups
    rotate_backups
    
    # Summary
    log_success "Backup completed: $(basename "$BACKUP_DIR")"
    
    exit $EXIT_SUCCESS
}

main "$@"
