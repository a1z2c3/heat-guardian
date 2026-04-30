param(
  [switch]$IncludeReportAssets
)

$ErrorActionPreference = "Stop"

$pythonExe = ".\.venv\Scripts\python.exe"
$uvicornExe = ".\.venv\Scripts\uvicorn.exe"
$requirementsStamp = ".\.venv\.requirements.sha256"
$projectRoot = (Resolve-Path ".").Path

function Test-ContainsPath {
  param(
    [string]$Value,
    [string]$Path
  )

  if ([string]::IsNullOrWhiteSpace($Value) -or [string]::IsNullOrWhiteSpace($Path)) {
    return $false
  }

  return $Value.IndexOf($Path, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Get-RequirementsHash {
  return (Get-FileHash -Path ".\requirements.txt" -Algorithm SHA256).Hash
}

function Stop-ExistingAppServer {
  $matchedProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @("python.exe", "uvicorn.exe") -and
    $_.CommandLine -and
    $_.CommandLine -like "*backend.app.main:app*" -and
    (Test-ContainsPath $_.CommandLine $projectRoot)
  }

  $matchedProcessIds = @($matchedProcesses | Select-Object -ExpandProperty ProcessId -Unique)
  if ($matchedProcessIds.Count -eq 0) {
    return
  }

  Write-Host ("Stopping existing app server process(es): " + ($matchedProcessIds -join ", "))
  foreach ($processId in $matchedProcessIds) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    }
    catch {
      Write-Host "Failed to stop process $processId, continuing..."
    }
  }

  Start-Sleep -Seconds 2
}

function Stop-ProjectPortListeners {
  $listeners = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $processId = $listener.OwningProcess
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (
      $processInfo -and (
        (Test-ContainsPath $processInfo.CommandLine $projectRoot) -or
        (Test-ContainsPath $processInfo.ExecutablePath $projectRoot)
      )
    ) {
      Write-Host "Stopping stale port 8000 listener: PID $processId ($($processInfo.Name))"
      try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
      }
      catch {
        Write-Host "Failed to stop listener process $processId, continuing..."
      }
    }
  }

  Start-Sleep -Seconds 1
}

if (!(Test-Path ".venv")) {
  Write-Host "Creating Python virtual environment..."
  python -m venv .venv
}

if (!(Test-Path $pythonExe)) {
  throw "Virtual environment is incomplete: missing .\.venv\Scripts\python.exe. Delete .venv and run the startup script again."
}

$requirementsHash = Get-RequirementsHash
$savedRequirementsHash = if (Test-Path $requirementsStamp) {
  (Get-Content -Path $requirementsStamp -Raw -Encoding UTF8).Trim()
}
else {
  ""
}

$needsDependencyInstall = ($savedRequirementsHash -ne $requirementsHash) -or !(Test-Path $uvicornExe)

if ($needsDependencyInstall) {
  Write-Host "Installing Python dependencies..."
  & $pythonExe -m pip install --disable-pip-version-check -r requirements.txt
  Set-Content -Path $requirementsStamp -Value $requirementsHash -Encoding ASCII
}
else {
  Write-Host "Python dependencies unchanged. Skipping pip install."
}

if (!(Test-Path $uvicornExe)) {
  throw "Python dependencies were not installed correctly: missing .\.venv\Scripts\uvicorn.exe."
}

Stop-ExistingAppServer
Stop-ProjectPortListeners

Write-Host "Refreshing real upstream data before app startup..."
if ($IncludeReportAssets) {
  & $pythonExe -u scripts\run_pipeline.py --include-report-assets
}
else {
  & $pythonExe -u scripts\run_pipeline.py
}

Stop-ProjectPortListeners
Write-Host "Starting app on http://127.0.0.1:8000/"
& $uvicornExe backend.app.main:app --reload
