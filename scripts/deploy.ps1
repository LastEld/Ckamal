# =============================================================================
# CogniMesh v5.0 - Deploy Script (PowerShell)
# =============================================================================
# Description: Production deployment with database migration, health checks,
#              and rollback capability.
# Usage: .\deploy.ps1 [options]
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$Verbose,
    [switch]$Quiet,
    [string]$Environment = "production",
    [switch]$SkipBuild,
    [switch]$SkipMigrations,
    [switch]$SkipHealthCheck,
    [switch]$NoBackup,
    [switch]$Rollback,
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
$EXIT_DEPLOY_FAILURE = 9

# Colors
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"

# Deployment tracking
$Global:DeploymentId = ""
$Global:DeployStartTime = Get-Date
$Global:PreviousVersion = ""

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
CogniMesh v5.0 - Deploy Script v${Version}

Usage: ${ScriptName} [OPTIONS]

Options:
    -Help               Show this help message and exit
    -Verbose            Enable verbose output
    -Quiet              Suppress non-error output
    -Environment ENV    Deployment environment (default: production)
    -SkipBuild          Skip build step (use existing dist\)
    -SkipMigrations     Skip database migrations
    -SkipHealthCheck    Skip post-deploy health check
    -NoBackup           Don't create backup before deploy
    -Rollback           Rollback to previous version
    -Force              Force deployment (skip confirmations)

Description:
    Deploys CogniMesh to production environment including:
    - Pre-deployment backup
    - Build verification
    - Database migrations
    - Health checks
    - Rollback capability

Examples:
    .\${ScriptName}                    # Standard production deploy
    .\${ScriptName} -Environment staging   # Deploy to staging
    .\${ScriptName} -SkipBuild         # Deploy without rebuilding
    .\${ScriptName} -Rollback          # Rollback to previous version
    .\${ScriptName} -Force             # Deploy without confirmation

Exit Codes:
    0 - Deployment successful
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    9 - Deployment failure

"@
}

function New-DeploymentId {
    $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Commit = "unknown"
    try { $Commit = (git rev-parse --short HEAD 2>$null) ?? "unknown" } catch {}
    $Global:DeploymentId = "deploy-$Timestamp-$Commit"
    Write-Log "Deployment ID: $Global:DeploymentId" "Verbose"
}

function Save-DeploymentState {
    param([string]$Status)
    
    $StateFile = Join-Path $ProjectRoot ".deployment\state.json"
    New-Item -ItemType Directory -Path (Split-Path $StateFile) -Force | Out-Null
    
    $State = @{
        deploymentId = $Global:DeploymentId
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        environment = $Environment
        version = (git rev-parse --short HEAD 2>$null) ?? "unknown"
        previousVersion = $Global:PreviousVersion
        status = $Status
    }
    
    $State | ConvertTo-Json | Set-Content $StateFile
}

# =============================================================================
# Deployment Functions
# =============================================================================

function Test-Dependencies {
    Write-Log "Checking dependencies..." "Verbose"
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Log "Node.js not found" "Error"
        return $false
    }
    
    $PackageJson = Join-Path $ProjectRoot "package.json"
    if (-not (Test-Path $PackageJson)) {
        Write-Log "package.json not found" "Error"
        return $false
    }
    
    return $true
}

function Confirm-Deployment {
    if ($Force) { return }
    if ($Quiet) { return }
    
    Write-Host ""
    $CurrentCommit = (git rev-parse --short HEAD 2>$null) ?? "unknown"
    $CurrentBranch = (git branch --show-current 2>$null) ?? "unknown"
    
    Write-Log "About to deploy to: $Environment" "Warning"
    Write-Log "Current version: $CurrentCommit" "Warning"
    Write-Log "Branch: $CurrentBranch" "Warning"
    Write-Host ""
    
    $Response = Read-Host "Continue with deployment? (yes/N)"
    if ($Response -notmatch '^[Yy][Ee][Ss]$') {
        Write-Log "Deployment cancelled" "Info"
        exit $EXIT_SUCCESS
    }
}

function New-PreDeploymentBackup {
    if ($NoBackup) { return }
    if ($Rollback) { return }
    
    Write-Log "Creating pre-deployment backup..." "Info"
    
    $BackupScript = Join-Path $ScriptDir "backup.ps1"
    if (Test-Path $BackupScript) {
        & $BackupScript -Quiet -Tag "pre-deploy-$Global:DeploymentId"
    }
    else {
        Write-Log "Backup script not found, creating simple backup..." "Verbose"
        
        $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $BackupDir = Join-Path $ProjectRoot "data\backups\pre-deploy-$Timestamp"
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        
        # Backup database
        $DbDir = Join-Path $ProjectRoot "data\db"
        if (Test-Path $DbDir) {
            Copy-Item -Path $DbDir -Destination $BackupDir -Recurse
        }
        
        # Backup config
        $EnvFile = Join-Path $ProjectRoot ".env"
        if (Test-Path $EnvFile) {
            Copy-Item $EnvFile $BackupDir
        }
        
        Write-Log "Backup saved to: $BackupDir" "Verbose"
    }
    
    $Global:PreviousVersion = (git rev-parse --short HEAD 2>$null) ?? "unknown"
    
    Write-Log "Backup created" "Success"
}

function Invoke-Build {
    if ($SkipBuild) { return $true }
    
    Write-Log "Running production build..." "Info"
    
    $BuildScript = Join-Path $ScriptDir "build.ps1"
    if (Test-Path $BuildScript) {
        $Args = @{ Target = $Environment }
        if ($Verbose) { $Args['Verbose'] = $true } else { $Args['Quiet'] = $true }
        
        & $BuildScript @Args
        
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Build failed" "Error"
            return $false
        }
    }
    else {
        Write-Log "Build script not found, running npm build..." "Warning"
        npm run build
        if ($LASTEXITCODE -ne 0) { return $false }
    }
    
    Write-Log "Build completed" "Success"
    return $true
}

function Invoke-Migrations {
    if ($SkipMigrations) { return $true }
    
    Write-Log "Running database migrations..." "Info"
    
    $MigrateScript = Join-Path $ScriptDir "migrate.ps1"
    if (Test-Path $MigrateScript) {
        $Args = @{ Action = "up"; Environment = $Environment }
        if (-not $Verbose) { $Args['Quiet'] = $true }
        
        & $MigrateScript @Args
        
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Migrations failed" "Error"
            return $false
        }
    }
    else {
        Write-Log "Migration script not found, skipping migrations" "Verbose"
    }
    
    Write-Log "Migrations completed" "Success"
    return $true
}

function Publish-Application {
    Write-Log "Deploying application..." "Info"
    
    Save-DeploymentState "deploying"
    
    # Check for deployment configuration
    $DeployDir = $null
    $EnvFile = Join-Path $ProjectRoot ".env"
    if (Test-Path $EnvFile) {
        $Content = Get-Content $EnvFile -Raw
        if ($Content -match 'DEPLOY_DIR=(.+)') {
            $DeployDir = $Matches[1].Trim().Trim('"', "'")
        }
    }
    
    if ($DeployDir) {
        Write-Log "Deploying to: $DeployDir" "Verbose"
        
        # Create backup of current deployment
        if ((Test-Path $DeployDir) -and (-not $Rollback)) {
            $BackupName = "$DeployDir.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Move-Item $DeployDir $BackupName
        }
        
        # Copy new build
        $DistDir = Join-Path $ProjectRoot "dist"
        Copy-Item -Path $DistDir -Destination $DeployDir -Recurse
        
        Write-Log "Application deployed to $DeployDir" "Success"
    }
    else {
        Write-Log "No DEPLOY_DIR configured, deployment is in-place" "Verbose"
    }
    
    return $true
}

function Test-Health {
    if ($SkipHealthCheck) { return $true }
    
    Write-Log "Running health checks..." "Info"
    
    $HealthScript = Join-Path $ScriptDir "health-check.ps1"
    if (Test-Path $HealthScript) {
        $MaxRetries = 3
        $Delay = 5
        
        for ($i = 1; $i -le $MaxRetries; $i++) {
            Write-Log "Health check attempt $i/$MaxRetries..." "Verbose"
            
            & $HealthScript -Quiet
            if ($LASTEXITCODE -eq 0) {
                Write-Log "Health checks passed" "Success"
                return $true
            }
            
            if ($i -lt $MaxRetries) {
                Write-Log "Retrying in ${Delay}s..." "Verbose"
                Start-Sleep -Seconds $Delay
            }
        }
        
        Write-Log "Health checks failed after $MaxRetries attempts" "Error"
        return $false
    }
    else {
        # Simple health check - verify node can start
        Write-Log "Running basic health check..." "Verbose"
        
        try {
            $Result = node -e "console.log('OK')" 2>$null
            if ($Result -eq "OK") {
                Write-Log "Basic health check passed" "Success"
                return $true
            }
        }
        catch {
            Write-Log "Basic health check failed" "Error"
            return $false
        }
    }
    
    return $false
}

function Invoke-Rollback {
    Write-Log "Performing rollback..." "Warning"
    
    # Find most recent backup
    $BackupsDir = Join-Path $ProjectRoot "data\backups"
    $LatestBackup = Get-ChildItem -Path $BackupsDir -Directory -Filter "pre-deploy-*" | 
        Sort-Object CreationTime -Descending | 
        Select-Object -First 1
    
    if (-not $LatestBackup) {
        Write-Log "No backup found for rollback" "Error"
        return $false
    }
    
    Write-Log "Rolling back to: $($LatestBackup.Name)" "Info"
    
    # Restore database
    $DbBackup = Join-Path $LatestBackup.FullName "db"
    if (Test-Path $DbBackup) {
        $DbDir = Join-Path $ProjectRoot "data\db"
        if (Test-Path $DbDir) { Remove-Item $DbDir -Recurse -Force }
        Copy-Item -Path $DbBackup -Destination (Split-Path $DbDir) -Recurse
        Write-Log "Database restored" "Verbose"
    }
    
    # Restore config
    $EnvBackup = Join-Path $LatestBackup.FullName ".env"
    if (Test-Path $EnvBackup) {
        Copy-Item $EnvBackup $ProjectRoot
        Write-Log "Config restored" "Verbose"
    }
    
    Save-DeploymentState "rolled_back"
    
    Write-Log "Rollback completed" "Success"
    return $true
}

function Complete-Deployment {
    param([string]$Status)
    
    Save-DeploymentState $Status
    
    # Clean up old backups (keep last 10)
    $BackupsDir = Join-Path $ProjectRoot "data\backups"
    if (Test-Path $BackupsDir) {
        Get-ChildItem -Path $BackupsDir -Directory -Filter "pre-deploy-*" | 
            Sort-Object CreationTime -Descending | 
            Select-Object -Skip 10 | 
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    Write-Log "Deployment $Status" "Info"
    
    # Log deployment
    $DeployLog = Join-Path $ProjectRoot "logs\deploy\deployments.log"
    New-Item -ItemType Directory -Path (Split-Path $DeployLog) -Force | Out-Null
    $LogEntry = "[$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')] $Global:DeploymentId - $Status - $Environment"
    Add-Content $DeployLog $LogEntry
}

# =============================================================================
# Main Function
# =============================================================================

function Main {
    Write-Log "CogniMesh v5.0 Deploy v${Version}" "Info"
    
    # Show help
    if ($Help) {
        Show-Help
        exit $EXIT_SUCCESS
    }
    
    # Generate deployment ID
    New-DeploymentId
    
    Write-Log "Environment: $Environment" "Info"
    Write-Log "Deployment ID: $Global:DeploymentId" "Info"
    
    # Handle rollback
    if ($Rollback) {
        Invoke-Rollback
        exit $?
    }
    
    # Check dependencies
    if (-not (Test-Dependencies)) {
        exit $EXIT_DEPENDENCY_MISSING
    }
    
    # Confirm deployment
    Confirm-Deployment
    
    $ExitCode = $EXIT_SUCCESS
    
    # Pre-deployment backup
    New-PreDeploymentBackup
    
    # Build
    if ($ExitCode -eq $EXIT_SUCCESS) {
        if (-not (Invoke-Build)) { $ExitCode = $EXIT_DEPLOY_FAILURE }
    }
    
    # Run migrations
    if ($ExitCode -eq $EXIT_SUCCESS) {
        if (-not (Invoke-Migrations)) { $ExitCode = $EXIT_DEPLOY_FAILURE }
    }
    
    # Deploy
    if ($ExitCode -eq $EXIT_SUCCESS) {
        if (-not (Publish-Application)) { $ExitCode = $EXIT_DEPLOY_FAILURE }
    }
    
    # Health check
    if ($ExitCode -eq $EXIT_SUCCESS) {
        if (-not (Test-Health)) { $ExitCode = $EXIT_DEPLOY_FAILURE }
    }
    
    # Finalize
    if ($ExitCode -eq $EXIT_SUCCESS) {
        Complete-Deployment "success"
        
        $Duration = ((Get-Date) - $Global:DeployStartTime).TotalSeconds
        Write-Log "Deployment completed in $([int]$Duration)s" "Success"
        Write-Log "Deployment ID: $Global:DeploymentId" "Info"
    }
    else {
        Complete-Deployment "failed"
        Write-Log "Deployment failed!" "Error"
        
        # Offer rollback
        if ((-not $Force) -and (-not $Quiet)) {
            Write-Host ""
            $Response = Read-Host "Would you like to rollback? (y/N)"
            if ($Response -match '^[Yy]$') {
                Invoke-Rollback
            }
        }
    }
    
    exit $ExitCode
}

# Run main
Main
