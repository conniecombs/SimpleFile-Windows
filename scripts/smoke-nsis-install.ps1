param(
    [switch]$KeepInstalled
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$tauriConfig = Get-Content -Path (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$bundleDir = Join-Path $root "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem -Path $bundleDir -Filter "SimpleFile_*_x64-setup.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

$expectedTitle = "SimpleFile - File Explorer"
$expectedVersion = $tauriConfig.version
$timeoutSeconds = 20
$process = $null

function Get-SimpleFileInstall {
    $keys = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    foreach ($key in $keys) {
        Get-ItemProperty $key -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq "SimpleFile" } |
            Select-Object -First 1
    }
}

function Find-SimpleFileExecutable($installed) {
    $candidates = @()
    if ($installed.InstallLocation) {
        $installLocation = $installed.InstallLocation.Trim().Trim('"')
        $candidates += Join-Path $installLocation "simplefile.exe"
        $candidates += Join-Path $installLocation "SimpleFile.exe"
    }

    $candidates += Join-Path $env:LOCALAPPDATA "Programs\SimpleFile\simplefile.exe"
    $candidates += Join-Path $env:LOCALAPPDATA "Programs\SimpleFile\SimpleFile.exe"
    $candidates += "C:\Program Files\SimpleFile\simplefile.exe"
    $candidates += "C:\Program Files\SimpleFile\SimpleFile.exe"

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Get-Item -LiteralPath $candidate).FullName
        }
    }

    return $null
}

function Invoke-Uninstall($installed) {
    $uninstallCommand = $installed.QuietUninstallString
    if (-not $uninstallCommand) {
        $uninstallCommand = $installed.UninstallString
    }

    $uninstallerPath = $null
    if ($uninstallCommand -match '^\s*"([^"]+)"') {
        $uninstallerPath = $Matches[1]
    } elseif ($uninstallCommand) {
        $uninstallerPath = ($uninstallCommand -split "\s+", 2)[0]
    }

    if (-not $uninstallerPath -and $installed.InstallLocation) {
        $candidate = Join-Path $installed.InstallLocation "uninstall.exe"
        if (Test-Path -LiteralPath $candidate) {
            $uninstallerPath = $candidate
        }
    }

    if (-not $uninstallerPath -or -not (Test-Path -LiteralPath $uninstallerPath)) {
        throw "Could not find SimpleFile uninstaller. UninstallString: '$uninstallCommand'."
    }

    $uninstall = Start-Process -FilePath $uninstallerPath -ArgumentList "/S" -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) {
        throw "NSIS uninstall failed with exit code $($uninstall.ExitCode)."
    }
}

if (-not $installer) {
    throw "No SimpleFile NSIS installer found in $bundleDir. Run 'npm run build:tauri:local' first."
}

$existing = Get-SimpleFileInstall
if ($existing) {
    throw "SimpleFile is already installed at '$($existing.InstallLocation)' with version '$($existing.DisplayVersion)'. Uninstall it before running this smoke test."
}

try {
    Write-Host "Installing $($installer.FullName)."
    $install = Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait -PassThru
    if ($install.ExitCode -ne 0) {
        throw "NSIS install failed with exit code $($install.ExitCode)."
    }

    $installed = $null
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    do {
        Start-Sleep -Milliseconds 500
        $installed = Get-SimpleFileInstall
    } while (-not $installed -and (Get-Date) -lt $deadline)

    if (-not $installed) {
        throw "NSIS install completed, but no SimpleFile uninstall registry entry was found."
    }

    if ($installed.DisplayVersion -ne $expectedVersion) {
        throw "Installed SimpleFile version '$($installed.DisplayVersion)' did not match expected '$expectedVersion'."
    }

    $exePath = Find-SimpleFileExecutable $installed
    if (-not $exePath) {
        throw "Installed SimpleFile executable was not found."
    }

    $fileVersion = (Get-Item -LiteralPath $exePath).VersionInfo.ProductVersion
    if ($fileVersion -ne $expectedVersion) {
        throw "Installed executable version '$fileVersion' did not match expected '$expectedVersion'."
    }

    Write-Host "Installed SimpleFile $($installed.DisplayVersion) at $exePath."

    $process = Start-Process -FilePath $exePath -PassThru
    $windowProcess = $null
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)

    do {
        Start-Sleep -Milliseconds 500
        $candidate = Get-Process -Id $process.Id -ErrorAction SilentlyContinue

        if ($candidate -and $candidate.MainWindowTitle -eq $expectedTitle -and $candidate.Responding) {
            $windowProcess = $candidate
            break
        }
    } while ((Get-Date) -lt $deadline)

    if (-not $windowProcess) {
        $lastProcess = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        $lastTitle = if ($lastProcess) { $lastProcess.MainWindowTitle } else { "<process exited>" }
        throw "Installed executable did not expose '$expectedTitle' within $timeoutSeconds seconds. Last title: '$lastTitle'."
    }

    Write-Host "NSIS install smoke passed: PID $($windowProcess.Id), title '$($windowProcess.MainWindowTitle)'."
}
finally {
    if ($process) {
        $startedProcess = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if ($startedProcess) {
            $closed = $startedProcess.CloseMainWindow()
            Start-Sleep -Seconds 2
            $startedProcess = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
            if ($startedProcess) {
                Stop-Process -Id $startedProcess.Id -Force
            }
            Write-Host "Closed NSIS install smoke-test process $($process.Id). CloseMainWindow sent: $closed."
        }
    }

    if (-not $KeepInstalled) {
        $installed = Get-SimpleFileInstall
        if ($installed) {
            Write-Host "Uninstalling SimpleFile $($installed.DisplayVersion)."
            Invoke-Uninstall $installed
            Write-Host "Uninstalled SimpleFile."
        }
    } else {
        Write-Host "Keeping installed SimpleFile because -KeepInstalled was supplied."
    }
}
