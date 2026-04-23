import json
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]
PROCESSED_DIR = BASE_DIR / "data" / "processed"
CONFIG_DIR = BASE_DIR / "config"
EXTERNAL_DIR = BASE_DIR / "data" / "external"


def load_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def load_config() -> dict[str, Any]:
    return load_json_file(CONFIG_DIR / "study_area.json", {})


def load_weather() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "weather_summary.json", {})


def load_poi_summary() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "poi_summary.json", {"categories": []})


def load_official_cooling() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "official_cooling_sites.json", {"bulletins": [], "sites": []})


def load_source_refresh_manifest() -> dict[str, Any]:
    return load_json_file(EXTERNAL_DIR / "source_refresh_manifest.json", {})


def load_data_authenticity() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "data_authenticity_audit.json", {})


def load_risk_summary() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "risk_summary.json", {"districts": []})


def load_risk_grid() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "risk_grid.json", {"features": []})


def load_recommendations() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "site_recommendations.json", {"recommendations": []})


def load_accessibility_summary() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "accessibility_summary.json", {})


def load_optimization_experiments() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "optimization_experiments.json", {"scenarios": []})


def load_competition_experiments() -> dict[str, Any]:
    return load_json_file(PROCESSED_DIR / "competition_experiments.json", {})
