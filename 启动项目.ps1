param(
  [switch]$IncludeReportAssets
)

$ErrorActionPreference = "Stop"

$pythonExe = ".\.venv\Scripts\python.exe"
$uvicornExe = ".\.venv\Scripts\uvicorn.exe"
$requirementsStamp = ".\.venv\.requirements.sha256"

function Get-RequirementsHash {
  return (Get-FileHash -Path ".\requirements.txt" -Algorithm SHA256).Hash
}

if (!(Test-Path ".venv")) {
  python -m venv .venv
}

if (!(Test-Path $pythonExe) -or !(Test-Path $uvicornExe)) {
  throw "虚拟环境不完整，请删除 .venv 后重新运行 .\\启动项目.ps1"
}

$requirementsHash = Get-RequirementsHash
$savedRequirementsHash = if (Test-Path $requirementsStamp) {
  (Get-Content -Path $requirementsStamp -Raw -Encoding UTF8).Trim()
}
else {
  ""
}

if ($savedRequirementsHash -ne $requirementsHash) {
  Write-Host "Installing Python dependencies..."
  & $pythonExe -m pip install --disable-pip-version-check -r requirements.txt
  Set-Content -Path $requirementsStamp -Value $requirementsHash -Encoding ASCII
}
else {
  Write-Host "Python dependencies unchanged. Skipping pip install."
}

Write-Host "Refreshing real upstream data before app startup..."
if ($IncludeReportAssets) {
  & $pythonExe -u scripts\run_pipeline.py --include-report-assets
}
else {
  & $pythonExe -u scripts\run_pipeline.py
}

& $uvicornExe backend.app.main:app --reload
