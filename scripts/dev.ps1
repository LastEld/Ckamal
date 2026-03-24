# =============================================================================
# CogniMesh v5.0 - Development Script (PowerShell)
# =============================================================================
# Description: Start development environment with watch mode, dashboard,
#              and log tailing.
# Usage: .\dev.ps1 [options]
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$Verbose,
    [switch]$Quiet,
    [switch]$NoDashboard,
    [switch]$NoWatch,
    [int]$Port = 3000,
    [int]$ApiPort = 3001,
    [switch]$Logs,
    [switch]$NoLogs
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

# Colors
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"
$ColorDashboard = "Magenta"
$ColorServer = "Green"

# Process tracking
$Global:Processes = @()
$Global:ShouldRun = $true

# =============================================================================
# Helper Functions
# =============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "Info", [string]$Color = $ColorInfo)
    
    if ($Quiet -and $Level -ne "Error") { return }
    
    switch ($Level) {
        "Info" { Write-Host "[INFO] $Message" -ForegroundColor $Color }
        "Success" { Write-Host "[SUCCESS] $Message" -ForegroundColor $ColorSuccess }
        "Warning" { Write-Host "[WARNING] $Message" -ForegroundColor $ColorWarning }
        "Error" { Write-Host "[ERROR] $Message" -ForegroundColor $ColorError }
        "Verbose" { if ($Verbose) { Write-Host "[INFO] $Message" -ForegroundColor $ColorInfo } }
        "Dashboard" { Write-Host "[DASHBOARD] $Message" -ForegroundColor $ColorDashboard }
        "Server" { Write-Host "[SERVER] $Message" -ForegroundColor $ColorServer }
    }
}

function Show-Help {
    @"
CogniMesh v5.0 - Development Script v${Version}

Usage: ${ScriptName} [OPTIONS]

Options:
    -Help               Show this help message and exit
    -Verbose            Enable verbose output
    -Quiet              Suppress non-error output
    -NoDashboard        Start without dashboard
    -NoWatch            Disable file watching
    -Port PORT          Dashboard port (default: 3000)
    -ApiPort PORT       API server port (default: 3001)
    -Logs               Show all logs (default: tail)
    -NoLogs             Don't show logs

Description:
    Starts the CogniMesh development environment including:
    - Development server with file watching
    - Dashboard web interface
    - Log tailing/display

Examples:
    .\${ScriptName}                    # Start full dev environment
    .\${ScriptName} -NoDashboard       # Server only
    .\${ScriptName} -Port 8080         # Custom dashboard port
    .\${ScriptName} -NoWatch           # No file watching

Exit Codes:
    0 - Success (clean shutdown)
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    4 - Configuration error

"@
}

function Stop-DevEnvironment {
    Write-Log "Shutting down development environment..." "Info"
    
    $Global:ShouldRun = $false
    
    foreach ($Proc in $Global:Processes) {
        if ($Proc -and -not $Proc.HasExited) {
            try {
                Stop-Process -Id $Proc.Id -Force -ErrorAction SilentlyContinue
            }
            catch {
                # Process may already be stopped
            }
        }
    }
    
    # Clean up any remaining node processes
    Get-Process -Name "node" -ErrorAction SilentlyContinue | 
        Where-Object { $_.CommandLine -match "bios.*--mode=operational|dashboard/server" } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    
    Write-Log "Development environment stopped" "Success"
}

function Test-Dependencies {
    Write-Log "Checking dependencies..." "Verbose"
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Log "Node.js not found" "Error"
        return $false
    }
    
    $ServerPath = Join-Path $ProjectRoot "src\server.js"
    $BiosPath = Join-Path $ProjectRoot "src\bios\index.js"
    
    if (-not (Test-Path $ServerPath) -and -not (Test-Path $BiosPath)) {
        Write-Log "Server entry point not found" "Error"
        return $false
    }
    
    return $true
}

# =============================================================================
# Service Functions
# =============================================================================

function Start-BiosServer {
    Write-Log "Starting BIOS server..." "Server"
    
    Set-Location $ProjectRoot
    
    $Arguments = @("src\bios\index.js", "--mode=operational")
    if (-not $NoWatch) {
        $Arguments += "--watch"
    }
    
    try {
        if ($Verbose) {
            $Proc = Start-Process -FilePath "node" -ArgumentList $Arguments -PassThru -NoNewWindow
        }
        else {
            $Proc = Start-Process -FilePath "node" -ArgumentList $Arguments -PassThru -WindowStyle Hidden
        }
        
        $Global:Processes += $Proc
        
        Start-Sleep -Seconds 2
        
        if (-not $Proc.HasExited) {
            Write-Log "BIOS server started (PID: $($Proc.Id))" "Success"
            return $true
        }
        else {
            Write-Log "Failed to start BIOS server (exited with code $($Proc.ExitCode))" "Error"
            return $false
        }
    }
    catch {
        Write-Log "Failed to start BIOS server: $_" "Error"
        return $false
    }
}

function Start-Dashboard {
    if ($NoDashboard) { return $true }
    
    Write-Log "Starting dashboard on port $Port..." "Dashboard"
    
    Set-Location $ProjectRoot
    
    $DashboardPath = Join-Path $ProjectRoot "src\dashboard\server.js"
    if (-not (Test-Path $DashboardPath)) {
        Write-Log "Dashboard server not found, skipping" "Warning"
        return $true
    }
    
    $env:DASHBOARD_PORT = $Port
    
    try {
        if ($Verbose) {
            $Proc = Start-Process -FilePath "node" -ArgumentList $DashboardPath -PassThru -NoNewWindow
        }
        else {
            $Proc = Start-Process -FilePath "node" -ArgumentList $DashboardPath -PassThru -WindowStyle Hidden
        }
        
        $Global:Processes += $Proc
        
        Start-Sleep -Seconds 2
        
        if (-not $Proc.HasExited) {
            Write-Log "Dashboard started at http://localhost:$Port (PID: $($Proc.Id))" "Success"
            return $true
        }
        else {
            Write-Log "Failed to start dashboard" "Warning"
            return $true  # Non-fatal
        }
    }
    catch {
        Write-Log "Failed to start dashboard: $_" "Warning"
        return $true  # Non-fatal
    }
}

function Show-Logs {
    if ($NoLogs) { return }
    
    Write-Log "Starting log display..." "Info"
    
    $LogDir = Join-Path $ProjectRoot "logs"
    
    if (-not (Test-Path $LogDir)) {
        Write-Log "Log directory not found" "Warning"
        return
    }
    
    $LatestLog = Get-ChildItem -Path $LogDir -Filter "*.log" -File -Recurse | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -First 1
    
    if (-not $LatestLog) {
        Write-Log "No log files found" "Warning"
        return
    }
    
    Write-Log "Monitoring log: $($LatestLog.Name)" "Info"
    
    # Start a job to tail the log
    $Job = Start-Job {
        param($LogPath)
        Get-Content $LogPath -Wait -Tail 10
    } -ArgumentList $LatestLog.FullName
    
    $Global:LogJob = $Job
}

function Print-Status {
    Write-Host ""
    Write-Log "Development environment running!" "Success"
    Write-Host ""
    Write-Log "Services:" "Info"
    if (-not $NoDashboard) { Write-Host "  Dashboard: http://localhost:$Port" }
    Write-Host "  Logs:      $ProjectRoot\logs\"
    Write-Host ""
    Write-Log "Press Ctrl+C to stop" "Info"
    Write-Host ""
}

# =============================================================================
# Main Function
# =============================================================================

function Main {
    Write-Log "CogniMesh v5.0 Development Environment v${Version}" "Info"
    
    # Show help
    if ($Help) {
        Show-Help
        exit $EXIT_SUCCESS
    }
    
    # Setup cleanup
    $null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
        Stop-DevEnvironment
    }
    
    # Handle Ctrl+C
    [Console]::TreatControlCAsInput = $true
    
    # Check dependencies
    if (-not (Test-Dependencies)) {
        exit $EXIT_DEPENDENCY_MISSING
    }
    
    # Check for .env file
    $EnvFile = Join-Path $ProjectRoot ".env"
    if (-not (Test-Path $EnvFile)) {
        Write-Log ".env file not found. Run setup.ps1 first." "Warning"
    }
    
    # Start services
    if (-not (Start-BiosServer)) {
        Stop-DevEnvironment
        exit $EXIT_GENERAL_ERROR
    }
    
    Start-Dashboard | Out-Null
    
    # Show status
    Print-Status
    
    # Show logs
    if (-not $Logs -and -not $NoLogs) {
        Show-Logs
    }
    
    # Main loop - wait for Ctrl+C
    while ($Global:ShouldRun) {
        if ([Console]::KeyAvailable) {
            $Key = [Console]::ReadKey($true)
            if ($Key.Key -eq "C" -and $Key.Modifiers -eq "Control") {
                break
            }
        }
        
        # Check if processes are still running
        $Running = $false
        foreach ($Proc in $Global:Processes) {
            if ($Proc -and -not $Proc.HasExited) {
                $Running = $true
                break
            }
        }
        
        if (-not $Running -and $Global:Processes.Count -gt 0) {
            Write-Log "All processes have exited" "Warning"
            break
        }
        
        Start-Sleep -Milliseconds 100
    }
    
    Stop-DevEnvironment
    exit $EXIT_SUCCESS
}

# Run main
Main
