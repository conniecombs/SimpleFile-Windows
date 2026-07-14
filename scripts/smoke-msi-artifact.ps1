$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$bundleDir = Join-Path $root "src-tauri\target\release\bundle\msi"
$msi = Get-ChildItem -Path $bundleDir -Filter "SimpleFile_*_x64_en-US.msi" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

$expectedTitle = "SimpleFile - File Explorer"
$timeoutSeconds = 20

if (-not $msi) {
    throw "No SimpleFile MSI found in $bundleDir. Run 'npm run build:tauri:local' first."
}

$smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("simplefile-msi-smoke-" + [System.Guid]::NewGuid().ToString("N"))
$extractDir = Join-Path $smokeRoot "extract"
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

$process = $null

try {
    $msiArgs = @("/a", $msi.FullName, "/qn", "TARGETDIR=$extractDir")
    $msiexec = Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -PassThru
    if ($msiexec.ExitCode -ne 0) {
        throw "MSI administrative extraction failed with exit code $($msiexec.ExitCode)."
    }

    $exe = Get-ChildItem -Path $extractDir -Filter "simplefile.exe" -Recurse -File |
        Select-Object -First 1
    if (-not $exe) {
        throw "MSI extraction did not contain simplefile.exe under $extractDir."
    }

    $version = $exe.VersionInfo.ProductVersion
    Write-Host "Extracted $($msi.Name) to $extractDir."
    Write-Host "Extracted executable version: $version."

    $process = Start-Process -FilePath $exe.FullName -PassThru
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
        throw "Extracted executable did not expose '$expectedTitle' within $timeoutSeconds seconds. Last title: '$lastTitle'."
    }

    Write-Host "MSI artifact smoke passed: PID $($windowProcess.Id), title '$($windowProcess.MainWindowTitle)'."
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
            Write-Host "Closed MSI smoke-test process $($process.Id). CloseMainWindow sent: $closed."
        }
    }

    Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
}
