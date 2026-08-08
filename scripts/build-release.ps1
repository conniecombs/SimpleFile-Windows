#requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$SkipChecks,
    [switch]$SkipSmoke,
    [switch]$SkipInstallerSmoke,
    [switch]$KeepInstalled,
    [switch]$SignedUpdaterArtifacts,
    [switch]$InstallMissingTools,
    [switch]$AllowDirty,
    [switch]$Clean
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tauriDir = Join-Path $root "src-tauri"

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host ""
    Write-Host "==> $Message"
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory = $root
    )

    Write-Step ("{0} {1}" -f $FilePath, ($ArgumentList -join " "))

    Push-Location -LiteralPath $WorkingDirectory
    try {
        & $FilePath @ArgumentList
        $exitCode = $LASTEXITCODE
        if ($null -ne $exitCode -and $exitCode -ne 0) {
            throw "Command failed with exit code ${exitCode}: $FilePath $($ArgumentList -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-CargoManifestVersion {
    $cargoToml = Get-Content -LiteralPath (Join-Path $tauriDir "Cargo.toml") -Raw
    if ($cargoToml -notmatch '(?m)^version\s*=\s*"([^"]+)"') {
        throw "Could not read package version from src-tauri\Cargo.toml."
    }

    return $Matches[1]
}

function Test-VersionConsistency {
    $tauriConfig = Read-JsonFile (Join-Path $tauriDir "tauri.conf.json")
    $tauriVersion = [string]$tauriConfig.version
    $cargoVersion = Get-CargoManifestVersion

    if (-not $tauriVersion) {
        throw "src-tauri\tauri.conf.json is missing a version."
    }

    if ($cargoVersion -ne $tauriVersion) {
        throw "Version mismatch: tauri.conf.json=$tauriVersion Cargo.toml=$cargoVersion"
    }

    foreach ($relativePath in @("package.json", "frontend\package.json")) {
        $packagePath = Join-Path $root $relativePath
        $package = Read-JsonFile $packagePath
        $versionProperty = $package.PSObject.Properties["version"]
        if ($versionProperty -and $versionProperty.Value -and $versionProperty.Value -ne $tauriVersion) {
            throw "Version mismatch: $relativePath=$($versionProperty.Value) tauri.conf.json=$tauriVersion"
        }
    }

    Write-Host "Release version: $tauriVersion"
}

function Assert-CleanWorktree {
    if ($AllowDirty) {
        Write-Host "Skipping git worktree cleanliness check because -AllowDirty was supplied."
        return
    }

    Push-Location -LiteralPath $root
    try {
        $status = & git status --porcelain
        if ($LASTEXITCODE -ne 0) {
            throw "git status failed with exit code $LASTEXITCODE."
        }

        if ($status) {
            throw "Working tree has uncommitted changes. Commit or stash them, or rerun with -AllowDirty for a local-only build."
        }
    }
    finally {
        Pop-Location
    }
}

function Resolve-WixBin {
    $command = Get-Command candle.exe -ErrorAction SilentlyContinue
    if ($command) {
        return Split-Path -Parent $command.Source
    }

    $candidates = @(
        "C:\Program Files (x86)\WiX Toolset v3.14\bin",
        "C:\Program Files (x86)\WiX Toolset v3.11\bin",
        "C:\Program Files\WiX Toolset v3.14\bin"
    )

    $candidate = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($candidate) {
        return $candidate
    }

    $found = Get-ChildItem -Path "C:\Program Files (x86)", "C:\Program Files" -Filter "candle.exe" -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($found) {
        return $found.DirectoryName
    }

    return $null
}

function Test-Prerequisites {
    Require-Command git
    Require-Command node
    Require-Command npm
    Require-Command cargo

    $nodeVersion = (& node -p "process.versions.node").Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read Node.js version."
    }

    $nodeMajor = [int]($nodeVersion.Split(".")[0])
    if ($nodeMajor -lt 24) {
        throw "Node.js 24 or newer is required. Current version: $nodeVersion"
    }

    Push-Location -LiteralPath $tauriDir
    try {
        $tauriVersion = & cargo tauri --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            if (-not $InstallMissingTools) {
                throw "Tauri CLI is required. Install it with 'cargo install tauri-cli --locked' or rerun with -InstallMissingTools."
            }

            Invoke-Native cargo @("install", "tauri-cli", "--locked") $root
            $tauriVersion = & cargo tauri --version 2>$null
            if ($LASTEXITCODE -ne 0) {
                throw "Tauri CLI was still unavailable after cargo install tauri-cli --locked."
            }
        }
        Write-Host ($tauriVersion | Select-Object -First 1)
    }
    finally {
        Pop-Location
    }

    $wixBin = Resolve-WixBin
    if (-not $wixBin) {
        if (-not $InstallMissingTools) {
            throw "WiX Toolset v3 was not found. Install it with 'choco install wixtoolset -y' or rerun with -InstallMissingTools before building MSI bundles."
        }

        Require-Command choco
        Invoke-Native choco @("install", "wixtoolset", "-y", "--no-progress")
        $wixBin = Resolve-WixBin
        if (-not $wixBin) {
            throw "WiX Toolset v3 was still unavailable after choco install wixtoolset."
        }
    }
    Write-Host "WiX Toolset: $wixBin"

    if ($SignedUpdaterArtifacts -and -not $env:TAURI_SIGNING_PRIVATE_KEY) {
        throw "-SignedUpdaterArtifacts requires TAURI_SIGNING_PRIVATE_KEY to be set."
    }
}

function Remove-ReleaseOutput {
    $targetRoot = Join-Path $tauriDir "target"
    $releaseDir = Join-Path $targetRoot "release"
    if (-not (Test-Path -LiteralPath $releaseDir)) {
        return
    }

    $resolvedTargetRoot = (Resolve-Path -LiteralPath $targetRoot).Path
    $resolvedReleaseDir = (Resolve-Path -LiteralPath $releaseDir).Path
    if (-not $resolvedReleaseDir.StartsWith($resolvedTargetRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean unexpected release directory: $resolvedReleaseDir"
    }

    Write-Step "Cleaning previous release output"
    Remove-Item -LiteralPath $resolvedReleaseDir -Recurse -Force
}

function Get-ReleaseArtifacts {
    $artifactPatterns = @(
        "src-tauri\target\release\simplefile.exe",
        "src-tauri\target\release\bundle\nsis\SimpleFile_*_x64-setup.exe",
        "src-tauri\target\release\bundle\msi\SimpleFile_*_x64_en-US.msi",
        "src-tauri\target\release\bundle\nsis\latest.json",
        "src-tauri\target\release\bundle\nsis\*.sig"
    )

    $artifacts = foreach ($pattern in $artifactPatterns) {
        Get-ChildItem -Path (Join-Path $root $pattern) -File -ErrorAction SilentlyContinue
    }

    return $artifacts | Sort-Object FullName -Unique
}

Write-Step "Preparing SimpleFile release build"
Set-Location -LiteralPath $root
Test-Prerequisites
Test-VersionConsistency
Assert-CleanWorktree

if ($Clean) {
    Remove-ReleaseOutput
}

if (-not $SkipInstall) {
    Invoke-Native npm @("ci", "--prefix", "frontend")
}

if (-not $SkipChecks) {
    Invoke-Native npm @("run", "check:release")
}

if ($SignedUpdaterArtifacts) {
    Invoke-Native cargo @("tauri", "build", "--ci") $tauriDir
}
else {
    Invoke-Native cargo @("tauri", "build", "--ci", "--config", "tauri.local.conf.json") $tauriDir
}

if (-not $SkipSmoke) {
    Invoke-Native npm @("run", "smoke:settings")
    Invoke-Native powershell @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts\smoke-release-startup.ps1")
    Invoke-Native powershell @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts\smoke-msi-artifact.ps1")

    if (-not $SkipInstallerSmoke) {
        $installerSmokeArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts\smoke-nsis-install.ps1")
        if ($KeepInstalled) {
            $installerSmokeArgs += "-KeepInstalled"
        }
        Invoke-Native powershell $installerSmokeArgs
    }
}

$artifacts = Get-ReleaseArtifacts
if (-not $artifacts) {
    throw "Release build completed, but no release artifacts were found."
}

Write-Step "Release artifacts"
$rootPrefix = $root.TrimEnd("\") + "\"
foreach ($artifact in $artifacts) {
    $relativePath = $artifact.FullName
    if ($relativePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relativePath = $relativePath.Substring($rootPrefix.Length)
    }
    $sizeMb = [Math]::Round($artifact.Length / 1MB, 2)
    Write-Host ("{0} ({1} MB)" -f $relativePath, $sizeMb)
}

Write-Step "Release build complete"
