from collections import defaultdict
import math
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import rasterio
from pyproj import Transformer
from rasterio.windows import from_bounds

from common import (
    DATA_DIR,
    build_base_grid,
    current_timestamp,
    describe_grid_resolution,
    ensure_directories,
    haversine_km,
    load_config,
    locate_grid_cell,
    read_json,
    write_json,
)


WORLDPOP_DIR = DATA_DIR / "external" / "worldpop"
EXTERNAL_MANIFEST_PATH = DATA_DIR / "external" / "source_refresh_manifest.json"
WORLDPOP_CANONICAL_65 = WORLDPOP_DIR / "worldpop_age65_plus_latest.tif"
WORLDPOP_CANONICAL_80 = WORLDPOP_DIR / "worldpop_age80_plus_latest.tif"


def gaussian(distance_km: float, sigma: float) -> float:
    return pow(2.718281828, -((distance_km**2) / (2 * sigma**2)))


def compute_hotspot_score(lat: float, lon: float, hotspots: list[dict]) -> float:
    score = 0.0
    for index, hotspot in enumerate(hotspots):
        distance = haversine_km(lat, lon, hotspot["lat"], hotspot["lon"])
        score += (1.0 + index * 0.05) * gaussian(distance, sigma=3.8)
    return score


def detect_population_columns(columns: list[str]) -> tuple[str | None, str | None]:
    normalized = {column.lower(): column for column in columns}
    age65_candidates = [
        "age_65_plus",
        "age65_plus",
        "pop_65",
        "pop65",
        "elderly_65",
        "elderly65",
        "population_65_plus",
        "value_65",
        "value",
    ]
    age80_candidates = [
        "age_80_plus",
        "age80_plus",
        "pop_80",
        "pop80",
        "elderly_80",
        "elderly80",
        "population_80_plus",
        "value_80",
    ]

    age65 = next((normalized[key] for key in age65_candidates if key in normalized), None)
    age80 = next((normalized[key] for key in age80_candidates if key in normalized), None)
    return age65, age80


def build_fallback_population(config: dict[str, Any]) -> dict[str, Any]:
    hotspots = config["study_area"]["district_hotspots"]
    cells = build_base_grid(config)
    grid_resolution = describe_grid_resolution(config)
    scores = [compute_hotspot_score(cell["center_lat"], cell["center_lon"], hotspots) for cell in cells]
    minimum = min(scores) if scores else 0.0
    maximum = max(scores) if scores else 1.0

    features = []
    for cell, score in zip(cells, scores):
        ratio = 0.0 if maximum <= minimum else (score - minimum) / (maximum - minimum)
        age65 = int(220 + ratio * 1200)
        age80 = int(age65 * (0.18 + ratio * 0.12))
        features.append(
            {
                "id": cell["id"],
                "row": cell["row"],
                "col": cell["col"],
                "center_lat": round(cell["center_lat"], 6),
                "center_lon": round(cell["center_lon"], 6),
                "age65_plus": age65,
                "age80_plus": age80,
                "total_elderly_population": age65,
                "data_level": "demo_estimate",
            }
        )

    return {
        "generated_at": current_timestamp(),
        "source": "hotspot_fallback",
        "data_level": "demo_estimate",
        "grid_resolution": grid_resolution,
        "features": features,
    }


def aggregate_points(records: list[dict[str, Any]], config: dict[str, Any], source: str, level: str) -> dict[str, Any]:
    cells = build_base_grid(config)
    grid_resolution = describe_grid_resolution(config)
    aggregates: dict[str, dict[str, Any]] = {
        cell["id"]: {
            "id": cell["id"],
            "row": cell["row"],
            "col": cell["col"],
            "center_lat": round(cell["center_lat"], 6),
            "center_lon": round(cell["center_lon"], 6),
            "age65_plus": 0.0,
            "age80_plus": 0.0,
        }
        for cell in cells
    }

    for record in records:
        point = locate_grid_cell(record["lat"], record["lon"], config)
        if point is None:
            continue
        row, col = point
        cell_id = f"cell-{row}-{col}"
        aggregates[cell_id]["age65_plus"] += float(record.get("age65_plus", 0.0) or 0.0)
        aggregates[cell_id]["age80_plus"] += float(record.get("age80_plus", 0.0) or 0.0)

    features = []
    for cell in cells:
        item = aggregates[cell["id"]]
        age65 = int(round(item["age65_plus"]))
        age80 = int(round(item["age80_plus"]))
        features.append(
            {
                **item,
                "age65_plus": age65,
                "age80_plus": age80,
                "total_elderly_population": max(age65, age80),
                "data_level": level,
            }
        )

    return {
        "generated_at": current_timestamp(),
        "source": source,
        "data_level": level,
        "grid_resolution": grid_resolution,
        "features": features,
    }


def load_population_from_csv(path: Path, config: dict[str, Any]) -> dict[str, Any]:
    frame = pd.read_csv(path)
    lower_map = {column.lower(): column for column in frame.columns}
    lat_column = next((lower_map[key] for key in ("lat", "latitude", "y") if key in lower_map), None)
    lon_column = next((lower_map[key] for key in ("lon", "lng", "longitude", "x") if key in lower_map), None)
    age65_column, age80_column = detect_population_columns(list(frame.columns))

    if lat_column is None or lon_column is None or age65_column is None:
        raise ValueError(f"{path.name} 缺少必要字段，至少需要 lat/lon 与 age65 列。")

    records = []
    for _, row in frame.iterrows():
        records.append(
            {
                "lat": float(row[lat_column]),
                "lon": float(row[lon_column]),
                "age65_plus": float(row[age65_column]),
                "age80_plus": float(row[age80_column]) if age80_column else 0.0,
            }
        )
    return aggregate_points(records, config, source=path.name, level="worldpop_like")


def load_population_from_vector(path: Path, config: dict[str, Any]) -> dict[str, Any]:
    frame = gpd.read_file(path)
    if frame.empty:
        raise ValueError(f"{path.name} 没有可用记录。")
    if frame.crs is None:
        frame = frame.set_crs(epsg=4326)
    frame = frame.to_crs(epsg=4326)
    age65_column, age80_column = detect_population_columns(list(frame.columns))
    if age65_column is None:
        raise ValueError(f"{path.name} 缺少 age65 列。")

    records = []
    for _, row in frame.iterrows():
        geometry = row.geometry
        if geometry is None or geometry.is_empty:
            continue
        point = geometry.centroid
        records.append(
            {
                "lat": float(point.y),
                "lon": float(point.x),
                "age65_plus": float(row[age65_column]),
                "age80_plus": float(row[age80_column]) if age80_column else 0.0,
            }
        )
    return aggregate_points(records, config, source=path.name, level="worldpop_like")


def aggregate_raster(path: Path, config: dict[str, Any]) -> dict[str, float]:
    bbox = config["study_area"]["bbox"]
    totals = defaultdict(float)

    with rasterio.open(path) as src:
        if src.crs is None:
            raise ValueError(f"{path.name} 缺少 CRS。")

        to_raster = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
        from_raster = Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True)
        west, south = to_raster.transform(bbox["west"], bbox["south"])
        east, north = to_raster.transform(bbox["east"], bbox["north"])
        window = from_bounds(min(west, east), min(south, north), max(west, east), max(south, north), src.transform)
        data = src.read(1, window=window, masked=True)
        window_transform = src.window_transform(window)

        for row in range(data.shape[0]):
            for col in range(data.shape[1]):
                raw_value = data[row, col]
                if getattr(raw_value, "mask", False):
                    continue
                value = float(raw_value)
                if math.isnan(value) or value <= 0:
                    continue
                x, y = rasterio.transform.xy(window_transform, row, col, offset="center")
                lon, lat = from_raster.transform(x, y)
                cell = locate_grid_cell(lat, lon, config)
                if cell is None:
                    continue
                grid_row, grid_col = cell
                totals[f"cell-{grid_row}-{grid_col}"] += value

    return totals


def load_population_from_rasters(
    path65: Path,
    path80: Path | None,
    config: dict[str, Any],
    source_label: str | None = None,
) -> dict[str, Any]:
    cells = build_base_grid(config)
    grid_resolution = describe_grid_resolution(config)
    age65_totals = aggregate_raster(path65, config)
    age80_totals = aggregate_raster(path80, config) if path80 else {}

    features = []
    for cell in cells:
        age65 = int(round(age65_totals.get(cell["id"], 0.0)))
        age80 = int(round(age80_totals.get(cell["id"], 0.0)))
        features.append(
            {
                "id": cell["id"],
                "row": cell["row"],
                "col": cell["col"],
                "center_lat": round(cell["center_lat"], 6),
                "center_lon": round(cell["center_lon"], 6),
                "age65_plus": age65,
                "age80_plus": age80,
                "total_elderly_population": max(age65, age80),
                "data_level": "worldpop_raster",
            }
        )

    source = source_label or (path65.name if path80 is None else f"{path65.name} + {path80.name}")
    return {
        "generated_at": current_timestamp(),
        "source": source,
        "data_level": "worldpop_raster",
        "grid_resolution": grid_resolution,
        "features": features,
    }


def main() -> None:
    ensure_directories()
    config = load_config()
    WORLDPOP_DIR.mkdir(parents=True, exist_ok=True)
    external_manifest = read_json(EXTERNAL_MANIFEST_PATH, {})
    worldpop_manifest = external_manifest.get("worldpop", {})

    csv_file = next(iter(sorted(WORLDPOP_DIR.glob("*.csv"))), None)
    vector_file = next(iter(sorted(WORLDPOP_DIR.glob("*.geojson"))), None)
    tif65 = WORLDPOP_CANONICAL_65 if WORLDPOP_CANONICAL_65.exists() else next(
        (path for path in sorted(WORLDPOP_DIR.glob("*.tif")) if "65" in path.stem),
        None,
    )
    tif80 = WORLDPOP_CANONICAL_80 if WORLDPOP_CANONICAL_80.exists() else next(
        (path for path in sorted(WORLDPOP_DIR.glob("*.tif")) if "80" in path.stem),
        None,
    )

    if csv_file is not None:
        payload = load_population_from_csv(csv_file, config)
    elif vector_file is not None:
        payload = load_population_from_vector(vector_file, config)
    elif tif65 is not None:
        if worldpop_manifest:
            source_label = (
                f"WorldPop CHN 1km constrained age structures {worldpop_manifest.get('data_year', '')} "
                f"({worldpop_manifest.get('release', '')})"
            ).strip()
        else:
            source_label = None
        payload = load_population_from_rasters(tif65, tif80, config, source_label=source_label)
    else:
        payload = build_fallback_population(config)

    write_json(DATA_DIR / "processed" / "population_grid.json", payload)
    print("人口网格数据生成完成。")


if __name__ == "__main__":
    main()
