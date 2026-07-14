$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$exePath = Join-Path $root "src-tauri\target\release\simplefile.exe"
$expectedTitle = "SimpleFile - File Explorer"
$timeoutSeconds = 20

if (-not (Test-Path -LiteralPath $exePath)) {
    throw "Release executable not found at $exePath. Run 'npm run build:tauri:local' first."
}

$process = Start-Process -FilePath $exePath -PassThru
$windowProcess = $null

try {
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
        throw "Release executable did not expose '$expectedTitle' within $timeoutSeconds seconds. Last title: '$lastTitle'."
    }

    Write-Host "Release startup smoke passed: PID $($windowProcess.Id), title '$($windowProcess.MainWindowTitle)'."
}
finally {
    $startedProcess = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
    if ($startedProcess) {
        $closed = $startedProcess.CloseMainWindow()
        Start-Sleep -Seconds 2
        $startedProcess = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if ($startedProcess) {
            Stop-Process -Id $startedProcess.Id -Force
        }
        Write-Host "Closed smoke-test process $($process.Id). CloseMainWindow sent: $closed."
    }
}
