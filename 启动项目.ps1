param(
  [switch]$RefreshData
)

$ErrorActionPreference = "Stop"

$pythonExe = ".\.venv\Scripts\python"
$uvicornExe = ".\.venv\Scripts\uvicorn"
$requiredOutputs = @(
  "data\processed\weather_summary.json",
  "data\processed\poi_points.json",
  "data\processed\population_grid.json",
  "data\processed\accessibility_summary.json",
  "data\processed\risk_summary.json",
  "data\processed\site_recommendations.json",
  "data\processed\data_authenticity_audit.json"
)

function Test-PipelineOutputsReady {
  foreach ($path in $requiredOutputs) {
    if (!(Test-Path $path)) {
      return $false
    }
  }
  return $true
}

if (!(Test-Path ".venv")) {
  python -m venv .venv
}

& $pythonExe -m pip install -r requirements.txt

$outputsReady = Test-PipelineOutputsReady
if ($RefreshData -or -not $outputsReady) {
  if ($RefreshData) {
    Write-Host "RefreshData enabled. Running full data pipeline..."
  }
  else {
    Write-Host "Processed outputs missing. Running full data pipeline..."
  }
  & $pythonExe -u scripts\run_pipeline.py
}
else {
  Write-Host "Processed outputs found. Skipping pipeline and starting the app directly."
  Write-Host "To refresh data, run .\\更新数据.ps1 or .\\启动项目.ps1 -RefreshData"
}

& $uvicornExe backend.app.main:app --reload
