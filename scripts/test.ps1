# =============================================================================
# CogniMesh v5.0 - Test Script (PowerShell)
# =============================================================================
# Description: Run tests with support for unit, integration, coverage,
#              and various output formats.
# Usage: .\test.ps1 [options] [test-files...]
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$Verbose,
    [switch]$Quiet,
    [switch]$Unit,
    [switch]$Integration,
    [switch]$Coverage,
    [switch]$Watch,
    [switch]$Bail,
    [int]$Timeout = 30000,
    [string]$Reporter = "spec",
    [int]$Workers = 0,
    [switch]$UpdateSnapshots,
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$TestPatterns
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
$EXIT_TEST_FAILURE = 8

# Colors
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"

# Test results
$Script:TestsPassed = 0
$Script:TestsFailed = 0

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
CogniMesh v5.0 - Test Script v${Version}

Usage: ${ScriptName} [OPTIONS] [TEST-PATTERNS...]

Options:
    -Help               Show this help message and exit
    -Verbose            Enable verbose output
    -Quiet              Suppress non-error output
    -Unit               Run unit tests only
    -Integration        Run integration tests only
    -Coverage           Generate coverage report
    -Watch              Watch mode (re-run on file changes)
    -Bail               Stop on first failure
    -Timeout MS         Test timeout in milliseconds (default: 30000)
    -Reporter TYPE      Test reporter (spec, dot, json, junit)
    -Workers N          Maximum number of workers
    -UpdateSnapshots    Update snapshots

Test Patterns:
    Specify test file patterns to run specific tests.
    Examples: "auth.test.js", "unit/", "*.spec.js"

Examples:
    .\${ScriptName}                    # Run all tests
    .\${ScriptName} -Unit              # Run unit tests only
    .\${ScriptName} -Integration       # Run integration tests only
    .\${ScriptName} -Coverage          # Run with coverage
    .\${ScriptName} -Watch             # Watch mode
    .\${ScriptName} auth.test.js       # Run specific test file
    .\${ScriptName} -Unit -Coverage    # Unit tests with coverage
    .\${ScriptName} -Bail              # Stop on first failure

Exit Codes:
    0 - All tests passed
    1 - General error
    2 - Invalid arguments
    3 - Missing dependency
    8 - Test failure(s)

"@
}

function Test-Dependencies {
    Write-Log "Checking dependencies..." "Verbose"
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Log "Node.js not found" "Error"
        return $false
    }
    
    $TestsDir = Join-Path $ProjectRoot "tests"
    $TestDir = Join-Path $ProjectRoot "test"
    
    if (-not (Test-Path $TestsDir) -and -not (Test-Path $TestDir)) {
        Write-Log "Tests directory not found" "Warning"
    }
    
    return $true
}

function Get-TestFramework {
    $PackageJson = Join-Path $ProjectRoot "package.json"
    
    if (Test-Path $PackageJson) {
        $Content = Get-Content $PackageJson -Raw
        
        if ($Content -match '"jest"') { return "jest" }
        if ($Content -match '"mocha"') { return "mocha" }
        if ($Content -match '"vitest"') { return "vitest" }
        if ($Content -match '"ava"') { return "ava" }
    }
    
    # Check for Node.js built-in test runner (Node 18+)
    try {
        $null = node --test --help 2>$null
        if ($LASTEXITCODE -eq 0) { return "node" }
    }
    catch {
        # Not available
    }
    
    return $null
}

# =============================================================================
# Test Functions
# =============================================================================

function Invoke-NodeTests {
    Write-Log "Running tests with Node.js built-in test runner..." "Info"
    
    Set-Location $ProjectRoot
    
    $TestDir = if (Test-Path (Join-Path $ProjectRoot "tests")) { "tests" } 
               elseif (Test-Path (Join-Path $ProjectRoot "test")) { "test" } 
               else { "src" }
    
    $Cmd = @("node", "--test")
    
    if ($Unit) { $Cmd += "--test-name-pattern=Unit" }
    if ($Integration) { $Cmd += "--test-name-pattern=Integration" }
    
    if ($Watch) {
        Write-Log "Watch mode not supported with Node.js built-in runner" "Warning"
        Write-Log "Use 'npm install --save-dev jest' for watch mode" "Info"
    }
    
    # Build test file list
    $TestFiles = @()
    if ($TestPatterns.Count -gt 0) {
        $TestFiles = $TestPatterns
    }
    else {
        switch ($TestType) {
            "unit" { $TestFiles = @(Join-Path $TestDir "unit\*.js") }
            "integration" { $TestFiles = @(Join-Path $TestDir "integration\*.js") }
            default { $TestFiles = @(Join-Path $TestDir "\*.js") }
        }
    }
    
    Write-Log "Running: $($Cmd -join ' ') $($TestFiles -join ' ')" "Verbose"
    
    try {
        & $Cmd[0] $Cmd[1..($Cmd.Length-1)] $TestFiles
        if ($LASTEXITCODE -eq 0) {
            $Script:TestsPassed = 1
            return $true
        }
        else {
            $Script:TestsFailed = 1
            return $false
        }
    }
    catch {
        $Script:TestsFailed = 1
        return $false
    }
}

function Invoke-JestTests {
    Write-Log "Running tests with Jest..." "Info"
    
    Set-Location $ProjectRoot
    
    $Cmd = @("npx", "jest")
    
    # Add options
    if ($Verbose) { $Cmd += "--verbose" }
    if ($Coverage) { $Cmd += "--coverage" }
    if ($Watch) { $Cmd += "--watch" }
    if ($Bail) { $Cmd += "--bail" }
    if ($UpdateSnapshots) { $Cmd += "--updateSnapshot" }
    
    # Test type selection
    if ($Unit) { $Cmd += "--testPathPattern=unit|\.unit\.|\.spec\." }
    elseif ($Integration) { $Cmd += "--testPathPattern=integration|\.integration\." }
    
    # Add test patterns
    if ($TestPatterns.Count -gt 0) {
        $Cmd += "--testPathPattern=$($TestPatterns -join '|')"
    }
    
    # Reporter
    $Cmd += "--reporter=$Reporter"
    
    # Workers
    if ($Workers -gt 0) { $Cmd += "--maxWorkers=$Workers" }
    
    Write-Log "Running: $($Cmd -join ' ')" "Verbose"
    
    try {
        & $Cmd[0] $Cmd[1..($Cmd.Length-1)]
        if ($LASTEXITCODE -eq 0) {
            $Script:TestsPassed = 1
            return $true
        }
        else {
            $Script:TestsFailed = 1
            return $false
        }
    }
    catch {
        $Script:TestsFailed = 1
        return $false
    }
}

function Invoke-MochaTests {
    Write-Log "Running tests with Mocha..." "Info"
    
    Set-Location $ProjectRoot
    
    $Cmd = @("npx", "mocha")
    
    # Add options
    if ($Verbose) { $Cmd += "--reporter"; $Cmd += "spec" }
    if ($Bail) { $Cmd += "--bail" }
    if ($Watch) { $Cmd += "--watch" }
    
    # Test type selection
    $TestFiles = @()
    if ($Unit) {
        $TestFiles = @("tests\unit\**\*.js", "test\unit\**\*.js")
    }
    elseif ($Integration) {
        $TestFiles = @("tests\integration\**\*.js", "test\integration\**\*.js")
    }
    else {
        $TestFiles = @("tests\**\*.js", "test\**\*.js")
    }
    
    # Filter by pattern if specified
    if ($TestPatterns.Count -gt 0) {
        $TestFiles = $TestPatterns
    }
    
    # Coverage with nyc
    if ($Coverage) {
        $Cmd = @("npx", "nyc") + $Cmd
    }
    
    Write-Log "Running: $($Cmd -join ' ') $($TestFiles -join ' ')" "Verbose"
    
    try {
        & $Cmd[0] $Cmd[1..($Cmd.Length-1)] $TestFiles
        if ($LASTEXITCODE -eq 0) {
            $Script:TestsPassed = 1
            return $true
        }
        else {
            $Script:TestsFailed = 1
            return $false
        }
    }
    catch {
        $Script:TestsFailed = 1
        return $false
    }
}

function Invoke-VitestTests {
    Write-Log "Running tests with Vitest..." "Info"
    
    Set-Location $ProjectRoot
    
    $Cmd = if ($Watch) { @("npx", "vitest") } else { @("npx", "vitest", "run") }
    
    # Add options
    if ($Verbose) { $Cmd += "--reporter=verbose" }
    if ($Coverage) { $Cmd += "--coverage" }
    if ($Bail) { $Cmd += "--bail" }
    if ($UpdateSnapshots) { $Cmd += "--update" }
    
    # Test type selection
    if ($Unit) { $Cmd += "--testNamePattern=Unit" }
    elseif ($Integration) { $Cmd += "--testNamePattern=Integration" }
    
    # Add test patterns
    if ($TestPatterns.Count -gt 0) {
        $Cmd += $TestPatterns
    }
    
    Write-Log "Running: $($Cmd -join ' ')" "Verbose"
    
    try {
        & $Cmd[0] $Cmd[1..($Cmd.Length-1)]
        if ($LASTEXITCODE -eq 0) {
            $Script:TestsPassed = 1
            return $true
        }
        else {
            $Script:TestsFailed = 1
            return $false
        }
    }
    catch {
        $Script:TestsFailed = 1
        return $false
    }
}

function Show-TestSummary {
    Write-Host ""
    Write-Log "Test Summary" "Info"
    Write-Host "================================"
    
    if ($Script:TestsFailed -eq 0) {
        Write-Log "All tests passed!" "Success"
        return $true
    }
    else {
        Write-Log "Some tests failed!" "Error"
        return $false
    }
}

# =============================================================================
# Main Function
# =============================================================================

function Main {
    Write-Log "CogniMesh v5.0 Test Runner v${Version}" "Info"
    
    # Show help
    if ($Help) {
        Show-Help
        exit $EXIT_SUCCESS
    }
    
    # Check dependencies
    if (-not (Test-Dependencies)) {
        exit $EXIT_DEPENDENCY_MISSING
    }
    
    # Determine test type
    $TestType = "all"
    if ($Unit) { $TestType = "unit" }
    elseif ($Integration) { $TestType = "integration" }
    
    # Find test framework
    $Framework = Get-TestFramework
    
    if (-not $Framework) {
        Write-Log "No test framework detected" "Error"
        Write-Log "Install Jest, Mocha, Vitest, or use Node.js 18+ built-in test runner" "Info"
        exit $EXIT_DEPENDENCY_MISSING
    }
    
    Write-Log "Detected test framework: $Framework" "Verbose"
    
    # Run tests based on framework
    $TestResult = $true
    switch ($Framework) {
        "jest" { $TestResult = Invoke-JestTests }
        "mocha" { $TestResult = Invoke-MochaTests }
        "vitest" { $TestResult = Invoke-VitestTests }
        "node" { $TestResult = Invoke-NodeTests }
    }
    
    # Show summary
    if (-not $Watch) {
        Show-TestSummary | Out-Null
    }
    
    # Exit with appropriate code
    if ($TestResult) {
        exit $EXIT_SUCCESS
    }
    else {
        exit $EXIT_TEST_FAILURE
    }
}

# Run main
Main
