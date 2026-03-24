# =============================================================================
# CogniMesh v5.0 - Migration Script (PowerShell)
# =============================================================================
# Description: Database migration management - run, rollback, check status.
# Usage: .\migrate.ps1 [command] [options]
# =============================================================================

[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [ValidateSet("up", "down", "rollback", "reset", "status", "create", "pending", "verify")]
    [string]$Action = "up",
    
    [Parameter(Position=1)]
    [string]$Name = "",
    
    [switch]$Help,
    [switch]$Verbose,
    [switch]$Quiet,
    [string]$Environment = "development",
    [switch]$DryRun,
    [switch]$Force
)

# Script metadata
$ScriptName = $MyInvocation.MyCommand.Name
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$Version = "5.0.0"

# Exit codes
$EXIT_SUCCESS = 0
$EXIT_GENERAL_ERROR = 1
$EXIT_INVALID_ARGS = 2
$EXIT_DEPENDENCY_MISSING = 3
$EXIT_MIGRATION_ERROR = 5

# Colors
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"

# Migration tracking
$MigrationsDir = Join-Path $ProjectRoot "src\db\migrations"

# =============================================================================
# Helper Functions
# =============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "Info")
    
    if ($Quiet -and $Level -ne "Error") { return }
    
    switch ($Level) {
        "Info" { Write-Host "[INFO] $Message" -ForegroundColor $ColorInfo }
        "Success" { Write-Host "[SUCCESS] $Message" -ForegroundColor $ColorSuccess }
        "Warning" { Write-Host "[WARNING] $Message" -ForegroundColor $ColorWarning }
        "Error" { Write-Host "[ERROR] $Message" -ForegroundColor $ColorError }
        "Verbose" { if ($Verbose) { Write-Host "[INFO] $Message" -ForegroundColor $ColorInfo } }
    }
}

function Show-Help {
    @"
CogniMesh v5.0 - Migration Script v${Version}

Usage: ${ScriptName} [COMMAND] [OPTIONS]

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
    -Help               Show this help message and exit
    -Verbose            Enable verbose output
    -Quiet              Suppress non-error output
    -Environment ENV    Environment (default: development)
    -DryRun             Show what would be executed
    -Force              Force operation without confirmation

Description:
    Manages database migrations for CogniMesh.

Examples:
    .\${ScriptName}                    # Run pending migrations
    .\${ScriptName} up                 # Same as above
    .\${ScriptName} down               # Rollback last migration
    .\${ScriptName} rollback 3         # Rollback 3 migrations
    .\${ScriptName} status             # Show migration status
    .\${ScriptName} create add_users   # Create new migration
    .\${ScriptName} pending            # List pending migrations

Exit Codes:
    0 - Success
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    5 - Migration error

"@
}

function Get-DatabasePath {
    return Join-Path $ProjectRoot "data\db\cognimesh_${Environment}.db"
}

function Get-AppliedMigrations {
    $DbPath = Get-DatabasePath
    
    if (-not (Test-Path $DbPath)) { return @() }
    
    try {
        $Result = sqlite3 $DbPath "SELECT name FROM migrations ORDER BY applied_at;" 2>$null
        return $Result -split "`n" | Where-Object { $_ }
    }
    catch {
        return @()
    }
}

function Get-PendingMigrations {
    $Applied = Get-AppliedMigrations
    $Pending = @()
    
    if (-not (Test-Path $MigrationsDir)) { return $Pending }
    
    Get-ChildItem -Path $MigrationsDir -Filter "*.js" | ForEach-Object {
        $Name = $_.BaseName
        if ($Applied -notcontains $Name) {
            $Pending += $Name
        }
    }
    
    return $Pending
}

# =============================================================================
# Migration Commands
# =============================================================================

function Invoke-MigrateUp {
    Write-Log "Running pending migrations..." "Info"
    
    $Pending = Get-PendingMigrations
    
    if ($Pending.Count -eq 0) {
        Write-Log "No pending migrations" "Success"
        return 0
    }
    
    Write-Log "Pending migrations:" "Verbose"
    $Pending | ForEach-Object { Write-Log "  - $_" "Verbose" }
    
    if ($DryRun) {
        Write-Log "Dry run - would execute:" "Info"
        $Pending | ForEach-Object { Write-Host "  node $MigrationsDir\$_.js" }
        return 0
    }
    
    $DbPath = Get-DatabasePath
    
    foreach ($Migration in $Pending) {
        Write-Log "Running migration: $Migration" "Info"
        
        $MigrationFile = Join-Path $MigrationsDir "$Migration.js"
        
        if (-not (Test-Path $MigrationFile)) {
            Write-Log "Migration file not found: $MigrationFile" "Error"
            return $EXIT_MIGRATION_ERROR
        }
        
        # Run the migration
        & node $MigrationFile up
        
        if ($LASTEXITCODE -eq 0) {
            # Record migration
            $Batch = 1
            try {
                $BatchResult = sqlite3 $DbPath "SELECT COALESCE(MAX(batch), 0) + 1 FROM migrations;" 2>$null
                if ($BatchResult) { $Batch = [int]$BatchResult }
            }
            catch {}
            
            sqlite3 $DbPath "INSERT INTO migrations (name, batch, checksum) VALUES ('$Migration', $Batch, '');" 2>$null | Out-Null
            Write-Log "Migrated: $Migration" "Success"
        }
        else {
            Write-Log "Failed: $Migration" "Error"
            return $EXIT_MIGRATION_ERROR
        }
    }
    
    Write-Log "All migrations completed" "Success"
    return 0
}

function Invoke-MigrateDown {
    Write-Log "Rolling back last migration..." "Warning"
    
    $DbPath = Get-DatabasePath
    
    if (-not (Test-Path $DbPath)) {
        Write-Log "Database not found" "Error"
        return $EXIT_MIGRATION_ERROR
    }
    
    $LastMigration = sqlite3 $DbPath "SELECT name FROM migrations ORDER BY applied_at DESC LIMIT 1;" 2>$null
    
    if (-not $LastMigration) {
        Write-Log "No migrations to rollback" "Warning"
        return 0
    }
    
    Write-Log "Rolling back: $LastMigration" "Info"
    
    if (-not $DryRun) {
        $MigrationFile = Join-Path $MigrationsDir "$LastMigration.js"
        
        if (Test-Path $MigrationFile) {
            & node $MigrationFile down
        }
        
        sqlite3 $DbPath "DELETE FROM migrations WHERE name = '$LastMigration';" 2>$null | Out-Null
        Write-Log "Rolled back: $LastMigration" "Success"
    }
    else {
        Write-Log "Dry run - would rollback: $LastMigration" "Info"
    }
    
    return 0
}

function Invoke-MigrateRollback {
    param([int]$Count = 1)
    
    Write-Log "Rolling back $Count migration(s)..." "Warning"
    
    if ((-not $Force) -and (-not $DryRun)) {
        $Response = Read-Host "Are you sure? (yes/N)"
        if ($Response -notmatch '^[Yy][Ee][Ss]$') {
            Write-Log "Rollback cancelled" "Info"
            return 0
        }
    }
    
    for ($i = 1; $i -le $Count; $i++) {
        $Result = Invoke-MigrateDown
        if ($Result -ne 0) { return $Result }
    }
    
    return 0
}

function Invoke-MigrateReset {
    Write-Log "Rolling back ALL migrations..." "Warning"
    
    if ((-not $Force) -and (-not $DryRun)) {
        $Response = Read-Host "This will delete all data! Are you sure? (yes/N)"
        if ($Response -notmatch '^[Yy][Ee][Ss]$') {
            Write-Log "Reset cancelled" "Info"
            return 0
        }
    }
    
    $Count = 0
    try {
        $CountResult = sqlite3 (Get-DatabasePath) "SELECT COUNT(*) FROM migrations;" 2>$null
        if ($CountResult) { $Count = [int]$CountResult }
    }
    catch {}
    
    return Invoke-MigrateRollback $Count
}

function Get-MigrationStatus {
    Write-Log "Migration Status" "Info"
    Write-Host ""
    
    $DbPath = Get-DatabasePath
    
    "{0,-30} {1,-20} {2}" -f "MIGRATION", "APPLIED AT", "BATCH"
    "─" * 70
    
    if (Test-Path $DbPath) {
        $Applied = sqlite3 $DbPath "SELECT name, applied_at, batch FROM migrations ORDER BY applied_at;" 2>$null
        if ($Applied) {
            $Applied -split "`n" | ForEach-Object {
                $Parts = $_ -split "\|"
                if ($Parts.Count -ge 3) {
                    "{0} {1,-28} {2,-20} {3}" -f ([char]0x2713), $Parts[0], $Parts[1], $Parts[2]
                }
            }
        }
    }
    
    $Pending = Get-PendingMigrations
    $Pending | ForEach-Object {
        "{0} {1,-28} {2,-20} {3}" -f ([char]0x25CB), $_, "pending", "-"
    }
    
    Write-Host ""
    
    $AppliedCount = 0
    try {
        $Result = sqlite3 $DbPath "SELECT COUNT(*) FROM migrations;" 2>$null
        if ($Result) { $AppliedCount = [int]$Result }
    }
    catch {}
    
    $PendingCount = $Pending.Count
    Write-Log "Total: $AppliedCount applied, $PendingCount pending" "Info"
}

function New-Migration {
    param([string]$MigrationName = "migration")
    
    # Create migration name with timestamp
    $Timestamp = Get-Date -Format "yyyyMMddHHmmss"
    $FullName = "${Timestamp}_${MigrationName}"
    $MigrationFile = Join-Path $MigrationsDir "$FullName.js"
    
    New-Item -ItemType Directory -Path $MigrationsDir -Force | Out-Null
    
    $Template = @"
/**
 * Migration: $FullName
 * Created: $(Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
 */

export async function up(db) {
    // Migration up logic
    // Example:
    // await db.exec(`CREATE TABLE users (...)`);
    console.log('Running up migration: $FullName');
}

export async function down(db) {
    // Migration down logic (rollback)
    // Example:
    // await db.exec(`DROP TABLE users`);
    console.log('Running down migration: $FullName');
}

// Run if called directly
if (import.meta.url === `file://` + process.argv[1]) {
    const action = process.argv[2] || 'up';
    // db connection setup here
    if (action === 'up') {
        await up();
    } else {
        await down();
    }
}
"@
    
    $Template | Set-Content $MigrationFile
    Write-Log "Created migration: $MigrationFile" "Success"
}

function Get-PendingList {
    Write-Log "Pending Migrations" "Info"
    Write-Host ""
    
    $Pending = Get-PendingMigrations
    
    if ($Pending.Count -eq 0) {
        Write-Log "No pending migrations" "Success"
        return 0
    }
    
    $Pending | ForEach-Object { Write-Host "  $([char]0x25CB) $_" }
    
    Write-Host ""
    Write-Log "$($Pending.Count) pending migration(s)" "Info"
}

function Test-MigrationIntegrity {
    Write-Log "Verifying migration integrity..." "Info"
    
    $DbPath = Get-DatabasePath
    $Errors = 0
    
    if (-not (Test-Path $DbPath)) {
        Write-Log "Database not found" "Error"
        return $EXIT_MIGRATION_ERROR
    }
    
    # Check that all recorded migrations have files
    $Applied = sqlite3 $DbPath "SELECT name FROM migrations;" 2>$null
    if ($Applied) {
        $Applied -split "`n" | ForEach-Object {
            $File = Join-Path $MigrationsDir "$_.js"
            if (-not (Test-Path $File)) {
                Write-Log "Missing migration file: $_.js" "Error"
                $Errors++
            }
        }
    }
    
    # Check that all migration files are recorded
    if (Test-Path $MigrationsDir) {
        Get-ChildItem -Path $MigrationsDir -Filter "*.js" | ForEach-Object {
            $Name = $_.BaseName
            $Recorded = sqlite3 $DbPath "SELECT 1 FROM migrations WHERE name = '$Name';" 2>$null
            if (-not $Recorded) {
                Write-Log "Unapplied migration: $Name" "Warning"
            }
        }
    }
    
    if ($Errors -eq 0) {
        Write-Log "Migration integrity verified" "Success"
        return 0
    }
    else {
        Write-Log "Migration integrity check failed" "Error"
        return $EXIT_MIGRATION_ERROR
    }
}

# =============================================================================
# Main Function
# =============================================================================

function Main {
    Write-Log "CogniMesh v5.0 Migration v${Version}" "Info"
    
    # Show help
    if ($Help) {
        Show-Help
        exit $EXIT_SUCCESS
    }
    
    Write-Log "Command: $Action" "Verbose"
    Write-Log "Environment: $Environment" "Verbose"
    Write-Log "Database: $(Get-DatabasePath)" "Verbose"
    
    # Check for SQLite
    if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) {
        Write-Log "sqlite3 not found, some features may not work" "Warning"
    }
    
    # Execute command
    switch ($Action) {
        "up" { $Result = Invoke-MigrateUp }
        "down" { $Result = Invoke-MigrateDown }
        "rollback" { 
            $Count = if ($Name -match '^\d+$') { [int]$Name } else { 1 }
            $Result = Invoke-MigrateRollback $Count 
        }
        "reset" { $Result = Invoke-MigrateReset }
        "status" { $Result = Get-MigrationStatus }
        "create" { 
            $MigrationName = if ($Name) { $Name } else { "migration" }
            $Result = New-Migration $MigrationName 
        }
        "pending" { $Result = Get-PendingList }
        "verify" { $Result = Test-MigrationIntegrity }
        default {
            Write-Log "Unknown command: $Action" "Error"
            Show-Help
            exit $EXIT_INVALID_ARGS
        }
    }
    
    exit $Result
}

# Run main
Main
