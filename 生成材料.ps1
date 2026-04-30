$ErrorActionPreference = "Stop"

if (!(Test-Path ".venv")) {
  throw "未找到 .venv，请先运行 启动项目.ps1"
}

.\.venv\Scripts\python scripts\export_report_assets.py

