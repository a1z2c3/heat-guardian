import hashlib
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests
import urllib3


ROOT_DIR = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT_DIR / "config"
DATA_DIR = ROOT_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
VOLATILE_JSON_KEYS = {
    "generated_at",
    "checked_at",
    "updated_at",
    "downloaded_at",
    "fetched_at",
    "refreshed_at",
}


def ensure_directories() -> None:
    for path in (RAW_DIR, PROCESSED_DIR):
        path.mkdir(parents=True, exist_ok=True)


def load_config() -> dict[str, Any]:
    return json.loads((CONFIG_DIR / "study_area.json").read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def canonicalize_for_hash(payload: Any, ignored_keys: set[str] | None = None) -> Any:
    ignored = VOLATILE_JSON_KEYS if ignored_keys is None else ignored_keys
    if isinstance(payload, dict):
        return {
            key: canonicalize_for_hash(value, ignored)
            for key, value in sorted(payload.items())
            if key not in ignored
        }
    if isinstance(payload, list):
        return [canonicalize_for_hash(item, ignored) for item in payload]
    return payload


def semantic_hash(payload: Any, ignored_keys: set[str] | None = None) -> str:
    normalized = canonicalize_for_hash(payload, ignored_keys)
    serialized = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def semantic_hash_file(path: Path, ignored_keys: set[str] | None = None, default: str = "missing") -> str:
    if not path.exists():
        return default
    return semantic_hash(read_json(path, None), ignored_keys)


def file_stat_signature(path: Path) -> str:
    if not path.exists():
        return "missing"
    stat = path.stat()
    signature = f"{path.name}|{stat.st_size}|{stat.st_mtime_ns}"
    return hashlib.sha256(signature.encode("utf-8")).hexdigest()


def current_timestamp() -> str:
    return datetime.now(SHANGHAI_TZ).isoformat(timespec="seconds")


def fetch_json(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    data: Any = None,
    headers: dict[str, Any] | None = None,
    method: str = "GET",
) -> Any:
    last_error: Exception | None = None

    for attempt in range(3):
        verify = attempt < 2
        try:
            if not verify:
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            response = requests.request(
                method,
                url,
                params=params,
                data=data,
                headers=headers,
                timeout=60,
                verify=verify,
            )
            response.raise_for_status()
            return response.json()
        except Exception as error:
            last_error = error

    raise last_error if last_error is not None else RuntimeError("请求失败")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c


def normalize(value: float, minimum: float, maximum: float) -> float:
    if maximum <= minimum:
        return 0.0
    return (value - minimum) / (maximum - minimum)


def build_polygon(cell_west: float, cell_south: float, cell_east: float, cell_north: float) -> list[list[float]]:
    return [
        [cell_west, cell_south],
        [cell_east, cell_south],
        [cell_east, cell_north],
        [cell_west, cell_north],
        [cell_west, cell_south],
    ]


def build_base_grid(config: dict[str, Any]) -> list[dict[str, Any]]:
    bbox = config["study_area"]["bbox"]
    grid = config["study_area"]["grid"]
    rows = grid["rows"]
    cols = grid["cols"]
    lat_step = (bbox["north"] - bbox["south"]) / rows
    lon_step = (bbox["east"] - bbox["west"]) / cols

    cells = []
    for row in range(rows):
        for col in range(cols):
            south = bbox["south"] + row * lat_step
            north = south + lat_step
            west = bbox["west"] + col * lon_step
            east = west + lon_step
            center_lat = (south + north) / 2
            center_lon = (west + east) / 2
            cells.append(
                {
                    "id": f"cell-{row}-{col}",
                    "row": row,
                    "col": col,
                    "south": south,
                    "north": north,
                    "west": west,
                    "east": east,
                    "center_lat": center_lat,
                    "center_lon": center_lon,
                    "polygon": build_polygon(west, south, east, north),
                }
            )
    return cells


def locate_grid_cell(lat: float, lon: float, config: dict[str, Any]) -> tuple[int, int] | None:
    bbox = config["study_area"]["bbox"]
    grid = config["study_area"]["grid"]

    if not (bbox["south"] <= lat <= bbox["north"] and bbox["west"] <= lon <= bbox["east"]):
        return None

    rows = grid["rows"]
    cols = grid["cols"]
    lat_step = (bbox["north"] - bbox["south"]) / rows
    lon_step = (bbox["east"] - bbox["west"]) / cols

    row = min(rows - 1, max(0, int((lat - bbox["south"]) / lat_step)))
    col = min(cols - 1, max(0, int((lon - bbox["west"]) / lon_step)))
    return row, col
