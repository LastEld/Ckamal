# =============================================================================
# CogniMesh v5.0 - Backup Script (PowerShell)
# =============================================================================
# Description: Database and configuration backup with rotation.
# Usage: .\backup.ps1 [options]
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$Verbose,
    [switch]$Quiet,
    [ValidateSet("full", "db", "config")]
    [string]$Type = "full",
    [string]$Tag = "",
    [int]$RetentionDays = 30,
    [switch]$NoCompress,
    [switch]$Encrypt,
    [switch]$Upload,
    [switch]$List,
    [string]$Restore = ""
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
$EXIT_BACKUP_FAILURE = 1

# Colors
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"

# Backup tracking
$Global:BackupTimestamp = ""
$Global:BackupDir = ""
$Global:BackupArchive = ""

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
CogniMesh v5.0 - Backup Script v${Version}

Usage: ${ScriptName} [OPTIONS]

Options:
    -Help               Show this help message and exit
    -Verbose            Enable verbose output
    -Quiet              Suppress non-error output
    -Type TYPE          Backup type: full|db|config (default: full)
    -Tag TAG            Add tag to backup name
    -RetentionDays DAYS Retention period in days (default: 30)
    -NoCompress         Don't compress backup
    -Encrypt            Encrypt backup (requires GPG)
    -Upload             Upload to remote storage
    -List               List existing backups
    -Restore BACKUP     Restore from backup

Description:
    Creates backups of CogniMesh data including:
    - SQLite databases
    - Configuration files (.env)
    - Application state
    - Logs (optional)

Examples:
    .\${ScriptName}                    # Create full backup
    .\${ScriptName} -Type db           # Database only
    .\${ScriptName} -Tag pre-migration # Tagged backup
    .\${ScriptName} -RetentionDays 7   # 7-day retention
    .\${ScriptName} -List              # List backups
    .\${ScriptName} -Restore latest    # Restore latest backup

Exit Codes:
    0 - Backup successful
    1 - Backup failed
    2 - Invalid arguments

"@
}

function Format-Size {
    param([long]$Size)
    
    if ($Size -gt 1GB) { return "{0:N2} GB" -f ($Size / 1GB) }
    elseif ($Size -gt 1MB) { return "{0:N2} MB" -f ($Size / 1MB) }
    elseif ($Size -gt 1KB) { return "{0:N2} KB" -f ($Size / 1KB) }
    else { return "$Size B" }
}

# =============================================================================
# Backup Functions
# =============================================================================

function Initialize-Backup {
    $Global:BackupTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    
    $BackupName = "backup-$Global:BackupTimestamp"
    if ($Tag) { $BackupName = "$BackupName-$Tag" }
    if ($Type -ne "full") { $BackupName = "$BackupName-$Type" }
    
    $Global:BackupDir = Join-Path $ProjectRoot "data\backups\$BackupName"
    $Global:BackupArchive = "$($Global:BackupDir).tar.gz"
    
    New-Item -ItemType Directory -Path $Global:BackupDir -Force | Out-Null
    
    Write-Log "Backup directory: $Global:BackupDir" "Verbose"
}

function Backup-Database {
    Write-Log "Backing up database..." "Info"
    
    $DbDir = Join-Path $ProjectRoot "data\db"
    $BackupDbDir = Join-Path $Global:BackupDir "db"
    
    if (-not (Test-Path $DbDir)) {
        Write-Log "Database directory not found: $DbDir" "Warning"
        return
    }
    
    New-Item -ItemType Directory -Path $BackupDbDir -Force | Out-Null
    
    # Copy database files
    Copy-Item -Path "$DbDir\*" -Destination $BackupDbDir -Recurse -Force
    
    # Also create SQL dumps if sqlite3 is available
    if (Get-Command sqlite3 -ErrorAction SilentlyContinue) {
        $SqlDir = Join-Path $BackupDbDir "sql"
        New-Item -ItemType Directory -Path $SqlDir -Force | Out-Null
        
        Get-ChildItem -Path $DbDir -Filter "*.db" | ForEach-Object {
            $DbName = $_.BaseName
            $SqlFile = Join-Path $SqlDir "$DbName.sql"
            sqlite3 $_.FullName ".dump" > $SqlFile
            Write-Log "Created SQL dump: ${DbName}.sql" "Verbose"
        }
    }
    
    $Size = (Get-ChildItem $BackupDbDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    Write-Log "Database backed up ($(Format-Size $Size))" "Success"
}

function Backup-Config {
    Write-Log "Backing up configuration..." "Info"
    
    $BackupConfigDir = Join-Path $Global:BackupDir "config"
    New-Item -ItemType Directory -Path $BackupConfigDir -Force | Out-Null
    
    # Backup .env file
    $EnvFile = Join-Path $ProjectRoot ".env"
    if (Test-Path $EnvFile) {
        Copy-Item $EnvFile $BackupConfigDir
        Write-Log "Backed up: .env" "Verbose"
    }
    
    # Backup .env.example as reference
    $EnvExample = Join-Path $ProjectRoot ".env.example"
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $BackupConfigDir
        Write-Log "Backed up: .env.example" "Verbose"
    }
    
    # Backup config directory
    $ConfigDir = Join-Path $ProjectRoot "config"
    if (Test-Path $ConfigDir) {
        Copy-Item -Path $ConfigDir -Destination $BackupConfigDir -Recurse
        Write-Log "Backed up: config\" "Verbose"
    }
    
    # Backup package.json for version reference
    $PkgFile = Join-Path $ProjectRoot "package.json"
    if (Test-Path $PkgFile) {
        Copy-Item $PkgFile $BackupConfigDir
        Write-Log "Backed up: package.json" "Verbose"
    }
    
    Write-Log "Configuration backed up" "Success"
}

function Backup-State {
    Write-Log "Backing up application state..." "Info"
    
    $BackupStateDir = Join-Path $Global:BackupDir "state"
    New-Item -ItemType Directory -Path $BackupStateDir -Force | Out-Null
    
    # Backup state directory
    $StateDir = Join-Path $ProjectRoot "state"
    if (Test-Path $StateDir) {
        Copy-Item -Path "$StateDir\*" -Destination $BackupStateDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "Backed up: state\" "Verbose"
    }
    
    # Backup cache if needed
    $CacheDir = Join-Path $ProjectRoot "cache"
    if (Test-Path $CacheDir) {
        Copy-Item -Path $CacheDir -Destination $BackupStateDir -Recurse
        Write-Log "Backed up: cache\" "Verbose"
    }
    
    Write-Log "Application state backed up" "Success"
}

function Backup-Logs {
    Write-Log "Backing up logs..." "Info"
    
    $BackupLogsDir = Join-Path $Global:BackupDir "logs"
    New-Item -ItemType Directory -Path $BackupLogsDir -Force | Out-Null
    
    $LogsDir = Join-Path $ProjectRoot "logs"
    if (Test-Path $LogsDir) {
        # Only backup recent logs (last 7 days)
        Get-ChildItem -Path $LogsDir -Filter "*.log" -Recurse | 
            Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-7) } | 
            ForEach-Object { Copy-Item $_.FullName $BackupLogsDir }
        Write-Log "Backed up recent logs" "Verbose"
    }
    
    Write-Log "Logs backed up" "Success"
}

function New-Manifest {
    $Manifest = Join-Path $Global:BackupDir "backup-manifest.json"
    
    $GitCommit = "unknown"
    $GitBranch = "unknown"
    
    try {
        $GitCommit = (git rev-parse --short HEAD 2>$null) ?? "unknown"
        $GitBranch = (git branch --show-current 2>$null) ?? "unknown"
    }
    catch {
        # Git not available
    }
    
    $Size = (Get-ChildItem $Global:BackupDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $FileCount = (Get-ChildItem $Global:BackupDir -Recurse -File).Count
    
    $Info = @{
        version = $Version
        type = $Type
        tag = $Tag
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        hostname = $env:COMPUTERNAME
        user = $env:USERNAME
        git = @{
            commit = $GitCommit
            branch = $GitBranch
        }
        files = $FileCount
        size = $Size
    }
    
    $Info | ConvertTo-Json | Set-Content $Manifest
    Write-Log "Manifest created" "Verbose"
}

function Compress-Backup {
    if ($NoCompress) { return }
    
    Write-Log "Compressing backup..." "Info"
    
    try {
        Compress-Archive -Path "$Global:BackupDir\*" -DestinationPath "$Global:BackupDir.zip" -Force
        Remove-Item -Path $Global:BackupDir -Recurse -Force
        $Global:BackupDir = "$Global:BackupDir.zip"
        
        $Size = (Get-Item $Global:BackupArchive.Replace(".tar.gz", ".zip")).Length
        Write-Log "Backup compressed ($(Format-Size $Size))" "Success"
    }
    catch {
        Write-Log "Compression failed, keeping uncompressed backup" "Warning"
    }
}

function Protect-Backup {
    if (-not $Encrypt) { return }
    
    Write-Log "Encrypting backup..." "Info"
    Write-Log "Encryption not implemented on Windows without GPG" "Warning"
}

function Publish-Backup {
    if (-not $Upload) { return }
    
    Write-Log "Uploading backup to remote storage..." "Info"
    
    # This is a placeholder - implement based on your storage provider
    $EnvFile = Join-Path $ProjectRoot ".env"
    $RemoteUrl = $null
    
    if (Test-Path $EnvFile) {
        $Content = Get-Content $EnvFile -Raw
        if ($Content -match 'BACKUP_REMOTE_URL=(.+)') {
            $RemoteUrl = $Matches[1].Trim().Trim('"', "'")
        }
    }
    
    if (-not $RemoteUrl) {
        Write-Log "BACKUP_REMOTE_URL not configured, skipping upload" "Warning"
        return
    }
    
    Write-Log "Would upload to: $RemoteUrl" "Verbose"
    Write-Log "Remote upload not implemented - configure your storage provider" "Warning"
}

function Remove-OldBackups {
    Write-Log "Rotating old backups..." "Info"
    
    $BackupRoot = Join-Path $ProjectRoot "data\backups"
    $Deleted = 0
    
    if (Test-Path $BackupRoot) {
        $Cutoff = (Get-Date).AddDays(-$RetentionDays)
        
        Get-ChildItem -Path $BackupRoot -Filter "backup-*" | 
            Where-Object { $_.CreationTime -lt $Cutoff } | 
            ForEach-Object {
                Remove-Item $_.FullName -Recurse -Force
                $Deleted++
                Write-Log "Deleted: $($_.Name)" "Verbose"
            }
    }
    
    if ($Deleted -gt 0) {
        Write-Log "Rotated $Deleted old backup(s)" "Success"
    }
    else {
        Write-Log "No backups to rotate" "Verbose"
    }
}

function Get-BackupsList {
    Write-Log "Existing backups:" "Info"
    
    $BackupRoot = Join-Path $ProjectRoot "data\backups"
    
    if (-not (Test-Path $BackupRoot)) {
        Write-Log "No backups found" "Info"
        return
    }
    
    "{0,-35} {1,-12} {2,-12} {3}" -f "NAME", "TYPE", "SIZE", "DATE"
    "─" * 80
    
    Get-ChildItem -Path $BackupRoot -Filter "backup-*" | Sort-Object CreationTime -Descending | ForEach-Object {
        $Name = $_.Name
        $Type = if ($Name -like "*db*") { "db" } elseif ($Name -like "*config*") { "config" } else { "full" }
        $Size = Format-Size $_.Length
        $Date = $_.CreationTime.ToString("yyyy-MM-dd HH:mm")
        
        "{0,-35} {1,-12} {2,-12} {3}" -f $Name, $Type, $Size, $Date
    }
}

function Restore-FromBackup {
    param([string]$Target)
    
    if ($Target -eq "latest") { $Target = "" }
    
    Write-Log "Restoring from backup: $Target" "Info"
    
    $BackupRoot = Join-Path $ProjectRoot "data\backups"
    $RestoreSource = $null
    
    if ($Target -eq "" -or $Target -eq "latest") {
        $RestoreSource = Get-ChildItem -Path $BackupRoot -Filter "backup-*" | 
            Sort-Object CreationTime -Descending | 
            Select-Object -First 1
    }
    else {
        $RestoreSource = Get-ChildItem -Path $BackupRoot -Filter $Target | Select-Object -First 1
    }
    
    if (-not $RestoreSource) {
        Write-Log "Backup not found: $Target" "Error"
        return $EXIT_BACKUP_FAILURE
    }
    
    Write-Log "This will overwrite existing data!" "Warning"
    $Response = Read-Host "Continue with restore? (yes/N)"
    
    if ($Response -notmatch '^[Yy][Ee][Ss]$') {
        Write-Log "Restore cancelled" "Info"
        return $EXIT_SUCCESS
    }
    
    # Extract if compressed
    $RestoreDir = $RestoreSource.FullName
    if ($RestoreSource.Extension -eq ".zip") {
        $RestoreDir = Join-Path $ProjectRoot "tmp\restore-$(Get-Random)"
        New-Item -ItemType Directory -Path $RestoreDir -Force | Out-Null
        Expand-Archive -Path $RestoreSource.FullName -DestinationPath $RestoreDir -Force
        $RestoreDir = Join-Path $RestoreDir (Get-ChildItem $RestoreDir | Select-Object -First 1).Name
    }
    
    # Restore database
    $DbBackup = Join-Path $RestoreDir "db"
    if (Test-Path $DbBackup) {
        Write-Log "Restoring database..." "Info"
        $DbDir = Join-Path $ProjectRoot "data\db"
        if (Test-Path $DbDir) { Remove-Item $DbDir -Recurse -Force }
        Copy-Item -Path $DbBackup -Destination (Split-Path $DbDir) -Recurse
    }
    
    # Restore config
    $ConfigBackup = Join-Path $RestoreDir "config"
    if (Test-Path $ConfigBackup) {
        Write-Log "Restoring configuration..." "Info"
        $EnvBackup = Join-Path $ConfigBackup ".env"
        if (Test-Path $EnvBackup) {
            Copy-Item $EnvBackup $ProjectRoot
        }
    }
    
    # Restore state
    $StateBackup = Join-Path $RestoreDir "state"
    if (Test-Path $StateBackup) {
        Write-Log "Restoring application state..." "Info"
        $StateDir = Join-Path $ProjectRoot "state"
        if (Test-Path $StateDir) { Remove-Item $StateDir -Recurse -Force }
        Copy-Item -Path $StateBackup -Destination $ProjectRoot -Recurse
    }
    
    # Cleanup temp directory
    if ($RestoreSource.Extension -eq ".zip") {
        Remove-Item (Split-Path $RestoreDir) -Recurse -Force
    }
    
    Write-Log "Restore completed" "Success"
    return $EXIT_SUCCESS
}

# =============================================================================
# Main Function
# =============================================================================

function Main {
    Write-Log "CogniMesh v5.0 Backup v${Version}" "Info"
    
    # Show help
    if ($Help) {
        Show-Help
        exit $EXIT_SUCCESS
    }
    
    # List backups
    if ($List) {
        Get-BackupsList
        exit $EXIT_SUCCESS
    }
    
    # Restore backup
    if ($Restore) {
        Restore-FromBackup $Restore
        exit $?
    }
    
    Write-Log "Backup type: $Type" "Verbose"
    Write-Log "Retention: $RetentionDays days" "Verbose"
    
    # Initialize
    Initialize-Backup
    
    # Perform backup based on type
    switch ($Type) {
        "full" {
            Backup-Database
            Backup-Config
            Backup-State
            Backup-Logs
        }
        "db" { Backup-Database }
        "config" { Backup-Config }
    }
    
    # Create manifest
    New-Manifest
    
    # Compress
    Compress-Backup
    
    # Encrypt
    Protect-Backup
    
    # Upload
    Publish-Backup
    
    # Rotate old backups
    Remove-OldBackups
    
    # Summary
    Write-Log "Backup completed: $(Split-Path $Global:BackupDir -Leaf)" "Success"
    
    exit $EXIT_SUCCESS
}

# Run main
Main
