$ErrorActionPreference = "Stop"

if (!(Test-Path ".venv")) {
  throw "Missing .venv. Please run .\\启动项目.ps1 first."
}

.\.venv\Scripts\python -u scripts\run_pipeline.py
