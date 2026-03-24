# =============================================================================
# CogniMesh v5.0 - Build Script (PowerShell)
# =============================================================================
# Description: Production build with linting, type checking, and bundling.
# Usage: .\build.ps1 [options]
# =============================================================================

param(
    [switch]$Help,
    [switch]$Verbose,
    [switch]$Quiet,
    [switch]$Clean,
    [switch]$SkipLint,
    [switch]$SkipTypeCheck,
    [switch]$SkipBundle,
    [switch]$Analyze,
    [string]$Target = "production",
    [string]$OutputDir = "dist"
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
$EXIT_BUILD_FAILURE = 7

# Colors
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"

# Build stats
$BuildStartTime = Get-Date

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
CogniMesh v5.0 - Build Script v${Version}

Usage: ${ScriptName} [OPTIONS]

Options:
    -Help               Show this help message and exit
    -Verbose            Enable verbose output
    -Quiet              Suppress non-error output
    -Clean              Clean build directory before building
    -SkipLint           Skip linting
    -SkipTypeCheck      Skip type checking
    -SkipBundle         Skip bundling step
    -Analyze            Analyze bundle size
    -Target TARGET      Build target (production|development, default: production)
    -OutputDir DIR      Output directory (default: dist)

Description:
    Performs a production build including:
    - Linting with ESLint
    - Type checking (if TypeScript configured)
    - Bundling with webpack/esbuild/rollup
    - Asset optimization

Examples:
    .\${ScriptName}                    # Standard production build
    .\${ScriptName} -Clean             # Clean build
    .\${ScriptName} -Target dev        # Development build
    .\${ScriptName} -Analyze           # Build with bundle analysis
    .\${ScriptName} -SkipLint          # Build without linting

Exit Codes:
    0 - Build successful
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    7 - Build failure

"@
}

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

function Format-Duration {
    param([TimeSpan]$Duration)
    return "{0:D2}:{1:D2}" -f $Duration.Minutes, $Duration.Seconds
}

# =============================================================================
# Build Functions
# =============================================================================

function Clear-BuildDir {
    if (-not $Clean) { return }
    
    Write-Log "Cleaning build directory..." "Info"
    
    $OutputPath = Join-Path $ProjectRoot $OutputDir
    
    if (Test-Path $OutputPath) {
        Remove-Item -Path "$OutputPath\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "Cleaned $OutputDir\" "Verbose"
    }
    
    # Also clean common temp directories
    $CacheDir = Join-Path $ProjectRoot ".cache"
    $TmpDir = Join-Path $ProjectRoot "tmp\build"
    if (Test-Path $CacheDir) { Remove-Item $CacheDir -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path $TmpDir) { Remove-Item $TmpDir -Recurse -Force -ErrorAction SilentlyContinue }
    
    Write-Log "Build directory cleaned" "Success"
}

function Invoke-Linting {
    if ($SkipLint) { return $true }
    
    Write-Log "Running linter..." "Info"
    
    Set-Location $ProjectRoot
    
    # Check for ESLint config
    $EslintConfigs = @(".eslintrc.cjs", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", ".eslintrc")
    $HasConfig = $EslintConfigs | Where-Object { Test-Path (Join-Path $ProjectRoot $_) }
    
    if ($HasConfig) {
        try {
            $null = npx eslint --version 2>$null
            if ($LASTEXITCODE -eq 0) {
                $Args = @("src\")
                if (-not $Verbose) { $Args += "--quiet" }
                
                Write-Log "Running ESLint..." "Verbose"
                & npx eslint @Args
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "Linting passed" "Success"
                    return $true
                }
                else {
                    Write-Log "Linting failed" "Error"
                    return $false
                }
            }
            else {
                Write-Log "ESLint config found but eslint not installed" "Warning"
                return $true
            }
        }
        catch {
            Write-Log "ESLint config found but eslint not installed" "Warning"
            return $true
        }
    }
    else {
        Write-Log "No ESLint configuration found, skipping linting" "Verbose"
        return $true
    }
}

function Invoke-TypeCheck {
    if ($SkipTypeCheck) { return $true }
    
    Write-Log "Running type check..." "Info"
    
    Set-Location $ProjectRoot
    
    $TsConfig = Join-Path $ProjectRoot "tsconfig.json"
    if (Test-Path $TsConfig) {
        try {
            $null = npx tsc --version 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Log "Running TypeScript compiler..." "Verbose"
                & npx tsc --noEmit
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "Type check passed" "Success"
                    return $true
                }
                else {
                    Write-Log "Type check failed" "Error"
                    return $false
                }
            }
            else {
                Write-Log "tsconfig.json found but TypeScript not installed" "Warning"
                return $true
            }
        }
        catch {
            Write-Log "tsconfig.json found but TypeScript not installed" "Warning"
            return $true
        }
    }
    else {
        Write-Log "No TypeScript configuration found, skipping type check" "Verbose"
        return $true
    }
}

function Invoke-Bundle {
    if ($SkipBundle) { return $true }
    
    Write-Log "Running bundler..." "Info"
    
    Set-Location $ProjectRoot
    
    $BundleTool = $null
    
    # Detect bundler from package.json
    $PackageJson = Join-Path $ProjectRoot "package.json"
    if (Test-Path $PackageJson) {
        $Content = Get-Content $PackageJson -Raw
        if ($Content -match '"webpack"') { $BundleTool = "webpack" }
        elseif ($Content -match '"esbuild"') { $BundleTool = "esbuild" }
        elseif ($Content -match '"rollup"') { $BundleTool = "rollup" }
        elseif ($Content -match '"vite"') { $BundleTool = "vite" }
        elseif ($Content -match '"parcel"') { $BundleTool = "parcel" }
    }
    
    # Also check for config files
    if (Test-Path (Join-Path $ProjectRoot "webpack.config.js")) { $BundleTool = "webpack" }
    elseif (Test-Path (Join-Path $ProjectRoot "esbuild.config.js")) { $BundleTool = "esbuild" }
    elseif (Test-Path (Join-Path $ProjectRoot "rollup.config.js")) { $BundleTool = "rollup" }
    elseif (Test-Path (Join-Path $ProjectRoot "vite.config.js")) { $BundleTool = "vite" }
    
    switch ($BundleTool) {
        "webpack" {
            Write-Log "Using webpack..." "Verbose"
            $Args = @("--mode=$Target")
            if ($Analyze) { $Args += "--analyze" }
            & npx webpack @Args
            if ($LASTEXITCODE -ne 0) { return $false }
        }
        "esbuild" {
            Write-Log "Using esbuild..." "Verbose"
            $Config = Join-Path $ProjectRoot "esbuild.config.js"
            if (Test-Path $Config) {
                & node $Config
                if ($LASTEXITCODE -ne 0) { return $false }
            }
            else {
                Write-Log "esbuild.config.js not found" "Error"
                return $false
            }
        }
        "rollup" {
            Write-Log "Using rollup..." "Verbose"
            & npx rollup -c
            if ($LASTEXITCODE -ne 0) { return $false }
        }
        "vite" {
            Write-Log "Using Vite..." "Verbose"
            & npx vite build
            if ($LASTEXITCODE -ne 0) { return $false }
        }
        "parcel" {
            Write-Log "Using Parcel..." "Verbose"
            & npx parcel build src/index.js --dist-dir $OutputDir
            if ($LASTEXITCODE -ne 0) { return $false }
        }
        default {
            # No bundler configured - copy files
            Write-Log "No bundler configured, copying source files..." "Verbose"
            $OutputPath = Join-Path $ProjectRoot $OutputDir
            New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
            Copy-Item -Path "$ProjectRoot\src" -Destination $OutputPath -Recurse -Force
            $ConfigDir = Join-Path $ProjectRoot "config"
            if (Test-Path $ConfigDir) { Copy-Item -Path $ConfigDir -Destination $OutputPath -Recurse -Force }
            $Pkg = Join-Path $ProjectRoot "package.json"
            if (Test-Path $Pkg) { Copy-Item $Pkg $OutputPath }
            $Readme = Join-Path $ProjectRoot "README.md"
            if (Test-Path $Readme) { Copy-Item $Readme $OutputPath }
            $License = Join-Path $ProjectRoot "LICENSE"
            if (Test-Path $License) { Copy-Item $License $OutputPath }
            $EnvExample = Join-Path $ProjectRoot ".env.example"
            if (Test-Path $EnvExample) { Copy-Item $EnvExample $OutputPath }
        }
    }
    
    Write-Log "Bundle created" "Success"
    return $true
}

function Optimize-Assets {
    Write-Log "Optimizing assets..." "Info"
    
    Set-Location $ProjectRoot
    
    # Minify JSON files
    $OutputPath = Join-Path $ProjectRoot $OutputDir
    if (Test-Path $OutputPath) {
        Get-ChildItem -Path $OutputPath -Filter "*.json" -Recurse | ForEach-Object {
            try {
                $Content = Get-Content $_.FullName -Raw | ConvertFrom-Json
                $Content | ConvertTo-Json -Depth 100 -Compress | Set-Content $_.FullName
            }
            catch {
                # Skip files that can't be parsed
            }
        }
    }
    
    Write-Log "Assets optimized" "Success"
}

function Measure-Bundle {
    if (-not $Analyze) { return }
    
    Write-Log "Analyzing bundle..." "Info"
    
    # Show bundle size
    $OutputPath = Join-Path $ProjectRoot $OutputDir
    if (Test-Path $OutputPath) {
        $Size = (Get-ChildItem $OutputPath -Recurse -File | Measure-Object -Property Length -Sum).Sum
        $SizeStr = if ($Size -gt 1MB) { "{0:N2} MB" -f ($Size / 1MB) } else { "{0:N2} KB" -f ($Size / 1KB) }
        Write-Log "Bundle size: $SizeStr" "Info"
    }
}

function New-BuildInfo {
    Write-Log "Generating build info..." "Verbose"
    
    $OutputPath = Join-Path $ProjectRoot $OutputDir
    $BuildInfo = Join-Path $OutputPath "build-info.json"
    
    $GitCommit = "unknown"
    $GitBranch = "unknown"
    
    try {
        $ResolvedCommit = git rev-parse --short HEAD 2>$null
        if ($ResolvedCommit) {
            $GitCommit = $ResolvedCommit
        }

        $ResolvedBranch = git branch --show-current 2>$null
        if ($ResolvedBranch) {
            $GitBranch = $ResolvedBranch
        }
    }
    catch {
        # Git not available
    }
    
    $Info = @{
        version = $Version
        target = $Target
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        nodeVersion = (node --version)
        gitCommit = $GitCommit
        gitBranch = $GitBranch
    }
    
    $Info | ConvertTo-Json | Set-Content $BuildInfo
    Write-Log "Build info saved to $BuildInfo" "Verbose"
}

function Show-BuildSummary {
    $BuildEndTime = Get-Date
    $Duration = $BuildEndTime - $BuildStartTime
    
    Write-Host ""
    Write-Log "Build Summary" "Info"
    Write-Host "================================"
    Write-Host "Target:    $Target"
    Write-Host "Output:    $OutputDir\"
    Write-Host "Duration:  $(Format-Duration $Duration)"
    
    $OutputPath = Join-Path $ProjectRoot $OutputDir
    if (Test-Path $OutputPath) {
        $Size = (Get-ChildItem $OutputPath -Recurse -File | Measure-Object -Property Length -Sum).Sum
        $SizeStr = if ($Size -gt 1MB) { "{0:N2} MB" -f ($Size / 1MB) } else { "{0:N2} KB" -f ($Size / 1KB) }
        Write-Host "Size:      $SizeStr"
        
        $FileCount = (Get-ChildItem $OutputPath -Recurse -File).Count
        Write-Host "Files:     $FileCount"
    }
    
    Write-Host ""
    Write-Log "Build completed successfully!" "Success"
}

# =============================================================================
# Main Function
# =============================================================================

function Main {
    Write-Log "CogniMesh v5.0 Build v${Version}" "Info"
    
    # Show help
    if ($Help) {
        Show-Help
        exit $EXIT_SUCCESS
    }
    
    Write-Log "Target: $Target, Output: $OutputDir" "Verbose"
    
    # Check dependencies
    if (-not (Test-Dependencies)) {
        exit $EXIT_DEPENDENCY_MISSING
    }
    
    # Check for .env file
    $EnvFile = Join-Path $ProjectRoot ".env"
    if (-not (Test-Path $EnvFile)) {
        Write-Log ".env file not found" "Warning"
    }
    
    $ExitCode = $EXIT_SUCCESS
    
    # Clean
    Clear-BuildDir
    
    # Lint
    if (-not $SkipLint) {
        if (-not (Invoke-Linting)) { $ExitCode = $EXIT_BUILD_FAILURE }
    }
    
    # Type check
    if ($ExitCode -eq $EXIT_SUCCESS -and -not $SkipTypeCheck) {
        if (-not (Invoke-TypeCheck)) { $ExitCode = $EXIT_BUILD_FAILURE }
    }
    
    # Bundle
    if ($ExitCode -eq $EXIT_SUCCESS -and -not $SkipBundle) {
        if (-not (Invoke-Bundle)) { $ExitCode = $EXIT_BUILD_FAILURE }
    }
    
    # Optimize assets
    if ($ExitCode -eq $EXIT_SUCCESS) {
        Optimize-Assets
    }
    
    # Generate build info
    if ($ExitCode -eq $EXIT_SUCCESS) {
        New-BuildInfo
    }
    
    # Analyze
    if ($ExitCode -eq $EXIT_SUCCESS) {
        Measure-Bundle
    }
    
    # Show summary
    if ($ExitCode -eq $EXIT_SUCCESS) {
        Show-BuildSummary
    }
    else {
        Write-Log "Build failed!" "Error"
    }
    
    exit $ExitCode
}

# Run main
Main
