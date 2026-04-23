from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.data_loader import (
    load_accessibility_summary,
    load_competition_experiments,
    load_config,
    load_official_cooling,
    load_optimization_experiments,
    load_poi_summary,
    load_recommendations,
    load_risk_grid,
    load_risk_summary,
    load_source_refresh_manifest,
    load_weather,
)


BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(title="热龄卫士", version="0.4.0")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "热龄卫士 API"}


@app.get("/api/weather")
def weather() -> dict:
    return load_weather()


@app.get("/api/poi")
def poi() -> dict:
    return load_poi_summary()


@app.get("/api/official-cooling")
def official_cooling() -> dict:
    return load_official_cooling()


@app.get("/api/data-sources")
def data_sources() -> dict:
    return load_source_refresh_manifest()


@app.get("/api/accessibility/summary")
def accessibility_summary() -> dict:
    return load_accessibility_summary()


@app.get("/api/risk/summary")
def risk_summary() -> dict:
    return load_risk_summary()


@app.get("/api/risk/grid")
def risk_grid() -> dict:
    return load_risk_grid()


@app.get("/api/recommendations")
def recommendations() -> dict:
    return load_recommendations()


@app.get("/api/optimization/experiments")
def optimization_experiments() -> dict:
    return load_optimization_experiments()


@app.get("/api/experiments")
def experiments() -> dict:
    return load_competition_experiments()


@app.get("/api/dashboard")
def dashboard() -> dict:
    config = load_config()
    return {
        "project_name": config.get("project_name", "热龄卫士"),
        "study_area": config.get("study_area", {}),
        "data_sources": load_source_refresh_manifest(),
        "weather": load_weather(),
        "poi": load_poi_summary(),
        "official_cooling": load_official_cooling(),
        "accessibility": load_accessibility_summary(),
        "risk_summary": load_risk_summary(),
        "recommendations": load_recommendations(),
        "optimization": load_optimization_experiments(),
        "experiments": load_competition_experiments(),
    }


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/gallery")
def gallery() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "gallery.html")
