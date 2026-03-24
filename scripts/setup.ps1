# =============================================================================
# CogniMesh v5.0 - Setup Script (PowerShell)
# =============================================================================
# Description: Initial project setup - installs dependencies, creates 
#              directories, sets up database, and copies environment config.
# Usage: .\setup.ps1 [options]
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$Verbose,
    [switch]$Quiet,
    [switch]$SkipDeps,
    [switch]$SkipDb,
    [switch]$SkipEnv
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
$EXIT_CONFIG_ERROR = 4
$EXIT_DATABASE_ERROR = 5

# Colors for output
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"

# =============================================================================
# Helper Functions
# =============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "Info")
    
    if ($Quiet -and $Level -ne "Error") { return }
    
    switch ($Level) {
        "Info" { 
            if ($Verbose -or $Level -eq "Info") {
                Write-Host "[INFO] $Message" -ForegroundColor $ColorInfo 
            }
        }
        "Success" { Write-Host "[SUCCESS] $Message" -ForegroundColor $ColorSuccess }
        "Warning" { Write-Host "[WARNING] $Message" -ForegroundColor $ColorWarning }
        "Error" { Write-Host "[ERROR] $Message" -ForegroundColor $ColorError }
        "Verbose" { 
            if ($Verbose) { Write-Host "[INFO] $Message" -ForegroundColor $ColorInfo }
        }
    }
}

function Show-Help {
    @"
CogniMesh v5.0 - Setup Script v${Version}

Usage: ${ScriptName} [OPTIONS]

Options:
    -Help               Show this help message and exit
    -Verbose            Enable verbose output
    -Quiet              Suppress non-error output
    -SkipDeps           Skip dependency installation
    -SkipDb             Skip database setup
    -SkipEnv            Skip environment file creation

Description:
    This script performs initial project setup including:
    - Installing Node.js dependencies
    - Creating required directories
    - Setting up the SQLite database
    - Copying .env.example to .env

Examples:
    .\${ScriptName}                    # Full setup
    .\${ScriptName} -SkipDeps          # Skip npm install
    .\${ScriptName} -Verbose           # Verbose output
    .\${ScriptName} -SkipDb -Quiet     # Quiet, no database setup

Exit Codes:
    0 - Success
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    4 - Configuration error
    5 - Database error

"@
}

function Test-Command {
    param([string]$Command, [string]$Name = $Command)
    
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $?) {
        Write-Log "Required dependency not found: $Name" "Error"
        return $false
    }
    
    Write-Log "Found dependency: $Name" "Verbose"
    return $true
}

function Test-NodeVersion {
    $RequiredVersion = [Version]"18.0.0"
    
    try {
        $VersionString = (node --version) -replace '^v', ''
        $CurrentVersion = [Version]$VersionString
    }
    catch {
        Write-Log "Failed to get Node.js version" "Error"
        return $false
    }
    
    Write-Log "Node.js version: $CurrentVersion (required: >=$RequiredVersion)" "Verbose"
    
    if ($CurrentVersion -lt $RequiredVersion) {
        Write-Log "Node.js version $CurrentVersion is too old. Required: >= $RequiredVersion" "Error"
        return $false
    }
    
    Write-Log "Node.js version check passed ($CurrentVersion)" "Success"
    return $true
}

# =============================================================================
# Setup Functions
# =============================================================================

function Install-Dependencies {
    Write-Log "Installing dependencies..." "Info"
    
    Set-Location $ProjectRoot
    
    if (-not (Test-Path "package.json")) {
        Write-Log "package.json not found in project root" "Error"
        return $EXIT_CONFIG_ERROR
    }
    
    Write-Log "Running npm install..." "Verbose"
    
    try {
        if ($Verbose) {
            npm install
        }
        else {
            npm install --silent 2>&1 | Out-Null
        }
        
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
        
        Write-Log "Dependencies installed successfully" "Success"
        return $EXIT_SUCCESS
    }
    catch {
        Write-Log "Failed to install dependencies: $_" "Error"
        return $EXIT_GENERAL_ERROR
    }
}

function New-Directories {
    Write-Log "Creating required directories..." "Info"
    
    $Directories = @(
        "logs\scripts"
        "logs\setup"
        "logs\deploy"
        "logs\backup"
        "data\db"
        "data\backups"
        "data\uploads"
        "state"
        "tmp"
        "cache"
    )
    
    foreach ($Dir in $Directories) {
        $FullPath = Join-Path $ProjectRoot $Dir
        if (-not (Test-Path $FullPath)) {
            New-Item -ItemType Directory -Path $FullPath -Force | Out-Null
            Write-Log "Created directory: $Dir" "Verbose"
        }
        else {
            Write-Log "Directory already exists: $Dir" "Verbose"
        }
    }
    
    Write-Log "Directories created" "Success"
    return $EXIT_SUCCESS
}

function Initialize-Database {
    Write-Log "Setting up database..." "Info"
    
    $DbDir = Join-Path $ProjectRoot "data\db"
    $SchemaFile = Join-Path $ProjectRoot "src\db\schema.sql"
    
    if (-not (Test-Path $SchemaFile)) {
        Write-Log "Database schema not found: $SchemaFile" "Error"
        return $EXIT_DATABASE_ERROR
    }
    
    # Check for sqlite3
    if (-not (Test-Command "sqlite3")) {
        Write-Log "sqlite3 not found. Database setup will be skipped." "Warning"
        Write-Log "Please install SQLite3 and run this script again." "Warning"
        return $EXIT_SUCCESS
    }
    
    Write-Log "Initializing database from schema..." "Verbose"
    
    # Create databases for different environments
    $Environments = @("development", "production", "test")
    foreach ($Env in $Environments) {
        $DbFile = Join-Path $DbDir "cognimesh_${Env}.db"
        
        if (Test-Path $DbFile) {
            Write-Log "Database already exists: cognimesh_${Env}.db" "Verbose"
        }
        else {
            $SchemaContent = Get-Content $SchemaFile -Raw
            $SchemaContent | sqlite3 $DbFile 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Log "Created database: cognimesh_${Env}.db" "Verbose"
            }
            else {
                Write-Log "Failed to create database: cognimesh_${Env}.db" "Error"
                return $EXIT_DATABASE_ERROR
            }
        }
    }
    
    Write-Log "Database setup complete" "Success"
    return $EXIT_SUCCESS
}

function Initialize-Environment {
    Write-Log "Setting up environment configuration..." "Info"
    
    $EnvExample = Join-Path $ProjectRoot ".env.example"
    $EnvFile = Join-Path $ProjectRoot ".env"
    
    if (-not (Test-Path $EnvExample)) {
        Write-Log ".env.example not found" "Error"
        return $EXIT_CONFIG_ERROR
    }
    
    if (Test-Path $EnvFile) {
        Write-Log ".env file already exists" "Warning"
        $Response = Read-Host "Overwrite? (y/N)"
        if ($Response -notmatch '^[Yy]$') {
            Write-Log "Skipping .env creation" "Info"
            return $EXIT_SUCCESS
        }
    }
    
    Copy-Item $EnvExample $EnvFile -Force
    
    if ($?) {
        Write-Log "Created .env file from .env.example" "Success"
        Write-Log "Please edit .env file with your configuration" "Info"
    }
    else {
        Write-Log "Failed to create .env file" "Error"
        return $EXIT_CONFIG_ERROR
    }
    
    return $EXIT_SUCCESS
}

# =============================================================================
# Main Function
# =============================================================================

function Main {
    Write-Log "CogniMesh v5.0 Setup v${Version}" "Info"
    Write-Log "Project root: $ProjectRoot" "Info"
    
    # Show help
    if ($Help) {
        Show-Help
        exit $EXIT_SUCCESS
    }
    
    # Check dependencies
    Write-Log "Checking dependencies..." "Info"
    
    if (-not (Test-Command "node" "Node.js")) {
        exit $EXIT_DEPENDENCY_MISSING
    }
    
    if (-not (Test-NodeVersion)) {
        exit $EXIT_DEPENDENCY_MISSING
    }
    
    if (-not (Test-Command "npm" "npm")) {
        exit $EXIT_DEPENDENCY_MISSING
    }
    
    if (-not (Test-Command "git" "Git")) {
        Write-Log "Git not found. Some features may not work." "Warning"
    }
    
    Write-Log "Dependencies check passed" "Success"
    
    # Run setup steps
    $ExitCode = $EXIT_SUCCESS
    
    # Create directories
    New-Directories | Out-Null
    
    # Install dependencies
    if (-not $SkipDeps) {
        $ExitCode = Install-Dependencies
    }
    else {
        Write-Log "Skipping dependency installation (-SkipDeps)" "Info"
    }
    
    # Setup database
    if ((-not $SkipDb) -and ($ExitCode -eq $EXIT_SUCCESS)) {
        $ExitCode = Initialize-Database
    }
    else {
        Write-Log "Skipping database setup" "Info"
    }
    
    # Setup environment
    if ((-not $SkipEnv) -and ($ExitCode -eq $EXIT_SUCCESS)) {
        $ExitCode = Initialize-Environment
    }
    else {
        Write-Log "Skipping environment setup" "Info"
    }
    
    # Final status
    Write-Host ""
    if ($ExitCode -eq $EXIT_SUCCESS) {
        Write-Log "Setup completed successfully!" "Success"
        Write-Log "Next steps:" "Info"
        Write-Host "  1. Edit .env file with your configuration"
        Write-Host "  2. Run '.\scripts\dev.ps1' to start development server"
        Write-Host "  3. Visit http://localhost:3000 for the dashboard"
    }
    else {
        Write-Log "Setup failed with exit code $ExitCode" "Error"
    }
    
    exit $ExitCode
}

# Run main function
Main
