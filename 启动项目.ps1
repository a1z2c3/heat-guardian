$ErrorActionPreference = "Stop"

if (!(Test-Path ".venv")) {
  python -m venv .venv
}

.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python scripts\run_pipeline.py
.\.venv\Scripts\uvicorn backend.app.main:app --reload

