from collections import defaultdict
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Polygon

from common import (
    DATA_DIR,
    PROCESSED_DIR,
    RAW_DIR,
    build_base_grid,
    current_timestamp,
    ensure_directories,
    file_stat_signature,
    haversine_km,
    load_config,
    normalize,
    read_json,
    semantic_hash,
    write_json,
)


HIGH_RISK_THRESHOLD = 60
VERY_HIGH_RISK_THRESHOLD = 75
MEDIUM_RISK_THRESHOLD = 40
BUILDINGS_PATH = DATA_DIR / "external" / "geofabrik" / "hubei" / "gis_osm_buildings_a_free_1.shp"
ROADS_PATH = DATA_DIR / "external" / "geofabrik" / "hubei" / "gis_osm_roads_free_1.shp"
LANDUSE_PATH = DATA_DIR / "external" / "geofabrik" / "hubei" / "gis_osm_landuse_a_free_1.shp"
COOLING_LANDUSE_CLASSES = {"park", "forest", "grass", "meadow", "recreation_ground", "scrub"}
ENVIRONMENTAL_METRICS_CACHE_PATH = RAW_DIR / "environmental_metrics_cache.json"


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def gaussian(distance_km: float, sigma: float) -> float:
    return pow(2.718281828, -((distance_km**2) / (2 * sigma**2)))


def nearest_district(lat: float, lon: float, hotspots: list[dict]) -> str:
    best_name = hotspots[0]["name"]
    best_distance = float("inf")
    for hotspot in hotspots:
        distance = haversine_km(lat, lon, hotspot["lat"], hotspot["lon"])
        if distance < best_distance:
            best_distance = distance
            best_name = hotspot["name"]
    return best_name


def compute_elderly_score(lat: float, lon: float, hotspots: list[dict]) -> float:
    score = 0.0
    for index, hotspot in enumerate(hotspots):
        distance = haversine_km(lat, lon, hotspot["lat"], hotspot["lon"])
        score += (1.0 + index * 0.05) * gaussian(distance, sigma=3.8)
    return score


def risk_level(score: float) -> str:
    if score >= VERY_HIGH_RISK_THRESHOLD:
        return "高"
    if score >= HIGH_RISK_THRESHOLD:
        return "较高"
    if score >= MEDIUM_RISK_THRESHOLD:
        return "中"
    return "低"


def score_access(nearest_walk_minutes: float | None, nearby_count: int) -> float:
    if nearest_walk_minutes is None:
        return min(0.25, nearby_count / 10)
    if nearest_walk_minutes <= 5:
        return 1.0
    if nearest_walk_minutes <= 10:
        return 0.8
    if nearest_walk_minutes <= 15:
        return 0.6
    if nearest_walk_minutes <= 20:
        return 0.4
    return 0.2


def park_access_score(distance_km: float | None) -> float:
    if distance_km is None:
        return 0.0
    if distance_km <= 0.4:
        return 1.0
    if distance_km <= 0.8:
        return 0.85
    if distance_km <= 1.2:
        return 0.7
    if distance_km <= 1.8:
        return 0.45
    return 0.2


def build_cell_geodataframe(base_grid: list[dict]) -> gpd.GeoDataFrame:
    records = []
    for cell in base_grid:
        records.append(
            {
                "id": cell["id"],
                "geometry": Polygon(cell["polygon"]),
            }
        )
    gdf = gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326").to_crs(epsg=3857)
    gdf["cell_area_m2"] = gdf.geometry.area
    return gdf


def safe_read_geodata(path: Path, bbox: tuple[float, float, float, float]) -> gpd.GeoDataFrame | None:
    if not path.exists():
        return None
    gdf = gpd.read_file(path, bbox=bbox)
    if gdf.empty:
        return None
    return gdf.to_crs(epsg=3857)


def aggregate_polygon_ratio(
    cells_gdf: gpd.GeoDataFrame,
    source_gdf: gpd.GeoDataFrame | None,
) -> dict[str, float]:
    if source_gdf is None or source_gdf.empty:
        return {}
    clipped = gpd.overlay(
        cells_gdf[["id", "geometry"]].copy(),
        source_gdf[["geometry"]].copy(),
        how="intersection",
    )
    if clipped.empty:
        return {}
    clipped = clipped[clipped.geometry.notna() & ~clipped.geometry.is_empty].copy()
    clipped["value"] = clipped.geometry.area
    value_map = clipped.groupby("id")["value"].sum().to_dict()
    area_map = cells_gdf.set_index("id")["cell_area_m2"].to_dict()
    return {
        cell_id: round(value / max(area_map.get(cell_id, 1.0), 1.0), 4)
        for cell_id, value in value_map.items()
    }


def aggregate_line_density(
    cells_gdf: gpd.GeoDataFrame,
    source_gdf: gpd.GeoDataFrame | None,
) -> dict[str, float]:
    if source_gdf is None or source_gdf.empty:
        return {}
    clipped = gpd.overlay(
        cells_gdf[["id", "geometry"]].copy(),
        source_gdf[["geometry"]].copy(),
        how="intersection",
        keep_geom_type=False,
    )
    if clipped.empty:
        return {}
    clipped = clipped[clipped.geometry.notna() & ~clipped.geometry.is_empty].copy()
    clipped["value_m"] = clipped.geometry.length
    value_map = clipped.groupby("id")["value_m"].sum().to_dict()
    area_map = cells_gdf.set_index("id")["cell_area_m2"].to_dict()
    return {
        cell_id: round((length_m * 1000) / max(area_map.get(cell_id, 1.0), 1.0), 2)
        for cell_id, length_m in value_map.items()
    }


def build_environmental_metrics(config: dict, base_grid: list[dict], park_pois: list[dict]) -> dict[str, dict]:
    bbox = config["study_area"]["bbox"]
    bbox_tuple = (bbox["west"], bbox["south"], bbox["east"], bbox["north"])
    cells_gdf = build_cell_geodataframe(base_grid)

    building_ratio_map: dict[str, float] = {}
    road_density_map: dict[str, float] = {}
    green_ratio_map: dict[str, float] = {}

    try:
        buildings = safe_read_geodata(BUILDINGS_PATH, bbox_tuple)
        building_ratio_map = aggregate_polygon_ratio(cells_gdf, buildings)
    except Exception:
        building_ratio_map = {}

    try:
        roads = safe_read_geodata(ROADS_PATH, bbox_tuple)
        road_density_map = aggregate_line_density(cells_gdf, roads)
    except Exception:
        road_density_map = {}

    try:
        landuse = safe_read_geodata(LANDUSE_PATH, bbox_tuple)
        if landuse is not None and "fclass" in landuse.columns:
            landuse = landuse[landuse["fclass"].isin(COOLING_LANDUSE_CLASSES)].copy()
        green_ratio_map = aggregate_polygon_ratio(cells_gdf, landuse)
    except Exception:
        green_ratio_map = {}

    metrics: dict[str, dict] = {}
    for cell in base_grid:
        nearest_park_distance = None
        for park in park_pois:
            distance = haversine_km(cell["center_lat"], cell["center_lon"], park["lat"], park["lon"])
            if nearest_park_distance is None or distance < nearest_park_distance:
                nearest_park_distance = distance

        metrics[cell["id"]] = {
            "building_coverage_ratio": building_ratio_map.get(cell["id"], 0.0),
            "road_density_km_per_sqkm": road_density_map.get(cell["id"], 0.0),
            "green_coverage_ratio": green_ratio_map.get(cell["id"], 0.0),
            "nearest_park_distance_km": round(nearest_park_distance, 3) if nearest_park_distance is not None else None,
        }
    return metrics


def build_environmental_metrics_signature(config: dict, base_grid: list[dict], park_pois: list[dict]) -> str:
    park_records = sorted(
        [
            {
                "id": poi.get("id"),
                "lat": round(float(poi["lat"]), 6),
                "lon": round(float(poi["lon"]), 6),
                "name": poi.get("name"),
            }
            for poi in park_pois
            if poi.get("lat") is not None and poi.get("lon") is not None
        ],
        key=lambda item: (
            str(item.get("id") or ""),
            float(item["lat"]),
            float(item["lon"]),
            str(item.get("name") or ""),
        ),
    )
    payload = {
        "study_area": config.get("study_area", {}),
        "grid_cell_count": len(base_grid),
        "park_records": park_records,
        "source_files": {
            "buildings": file_stat_signature(BUILDINGS_PATH),
            "roads": file_stat_signature(ROADS_PATH),
            "landuse": file_stat_signature(LANDUSE_PATH),
        },
    }
    return semantic_hash(payload, ignored_keys=set())


def load_or_build_environmental_metrics(config: dict, base_grid: list[dict], park_pois: list[dict]) -> dict[str, dict]:
    signature = build_environmental_metrics_signature(config, base_grid, park_pois)
    cached_payload = read_json(ENVIRONMENTAL_METRICS_CACHE_PATH, {})
    cached_metrics = cached_payload.get("metrics", {})
    if cached_payload.get("signature") == signature and cached_metrics:
        print("复用静态环境代理缓存。")
        return cached_metrics

    metrics = build_environmental_metrics(config, base_grid, park_pois)
    write_json(
        ENVIRONMENTAL_METRICS_CACHE_PATH,
        {
            "generated_at": current_timestamp(),
            "signature": signature,
            "metrics": metrics,
        },
    )
    print("静态环境代理缓存已重建。")
    return metrics


def get_scope_summary(accessibility_summary: dict, key: str) -> dict:
    scopes = accessibility_summary.get("resource_scopes", {})
    if key in scopes:
        return scopes[key]
    return accessibility_summary if key == "all_support_resources" else {}


def get_scope_features(accessibility_payload: dict, key: str) -> list[dict]:
    if key == "all_support_resources":
        return accessibility_payload.get("all_support_features") or accessibility_payload.get("features", [])
    if key == "existing_active_cooling_resources":
        return accessibility_payload.get("active_cooling_features") or accessibility_payload.get("features", [])
    return accessibility_payload.get("features", [])


def build_weather_profile(weather: dict) -> dict:
    forecast = weather.get("forecast", {})
    profile = weather.get("analysis_profile", {}) or {}

    mean_temperature = profile.get("mean_temperature")
    if mean_temperature is None:
        mean_temperature = forecast.get("mean_temperature_72h")
    max_temperature = profile.get("max_temperature")
    if max_temperature is None:
        max_temperature = forecast.get("next_72h_max_temperature")
    mean_apparent = profile.get("mean_apparent_temperature")
    if mean_apparent is None:
        mean_apparent = forecast.get("mean_apparent_temperature_72h")
    max_apparent = profile.get("max_apparent_temperature")
    if max_apparent is None:
        max_apparent = forecast.get("next_72h_max_apparent_temperature")
    night_min_apparent = profile.get("night_min_apparent_temperature")
    if night_min_apparent is None:
        night_min_apparent = mean_apparent

    mean_temperature = mean_temperature or 0.0
    max_temperature = max_temperature or mean_temperature
    mean_apparent = mean_apparent or 0.0
    max_apparent = max_apparent or mean_apparent
    night_min_apparent = night_min_apparent or mean_apparent

    severity_index = clamp(
        0.55 * clamp((mean_apparent - 30) / 12)
        + 0.30 * clamp((max_apparent - 35) / 12)
        + 0.15 * clamp((night_min_apparent - 28) / 10)
    )

    return {
        "profile_type": profile.get("profile_type") or weather.get("default_risk_profile") or "forecast",
        "case_label": profile.get("case_label") or "未来72小时监测窗口",
        "context_label": weather.get("risk_context_label", ""),
        "start_time": profile.get("start_time"),
        "end_time": profile.get("end_time"),
        "mean_temperature": round(mean_temperature, 2),
        "max_temperature": round(max_temperature, 2),
        "mean_apparent_temperature": round(mean_apparent, 2),
        "max_apparent_temperature": round(max_apparent, 2),
        "night_min_apparent_temperature": round(night_min_apparent, 2),
        "reference_temperature": round(mean_temperature * 0.65 + max_temperature * 0.35, 2),
        "reference_apparent_temperature": round(mean_apparent * 0.60 + max_apparent * 0.40, 2),
        "severity_index": round(severity_index, 4),
    }


def main() -> None:
    ensure_directories()
    config = load_config()
    hotspots = config["study_area"]["district_hotspots"]
    thresholds = config["service_thresholds_km"]
    base_grid = build_base_grid(config)

    weather = read_json(PROCESSED_DIR / "weather_summary.json", {})
    pois = read_json(PROCESSED_DIR / "poi_points.json", [])
    official_payload = read_json(PROCESSED_DIR / "official_cooling_sites.json", {"sites": []})
    official_sites = [
        item
        for item in official_payload.get("sites", [])
        if item.get("within_study_area") and item.get("lat") is not None and item.get("lon") is not None
    ]
    population = read_json(PROCESSED_DIR / "population_grid.json", {"features": []})
    accessibility_payload = read_json(PROCESSED_DIR / "accessibility_grid.json", {"features": []})
    accessibility_summary = read_json(PROCESSED_DIR / "accessibility_summary.json", {})

    weather_profile = build_weather_profile(weather)
    all_scope_summary = get_scope_summary(accessibility_summary, "all_support_resources")
    active_scope_summary = get_scope_summary(accessibility_summary, "existing_active_cooling_resources")
    all_scope_features = get_scope_features(accessibility_payload, "all_support_resources")
    active_scope_features = get_scope_features(accessibility_payload, "existing_active_cooling_resources")

    all_categories = set(all_scope_summary.get("categories") or [])
    if not all_categories:
        all_categories = {"community_centre", "library", "hospital", "pharmacy", "social_facility", "park"}
    active_categories = set(active_scope_summary.get("categories") or [])
    if not active_categories:
        active_categories = {"community_centre", "social_facility", "official_cooling_site"}

    support_pois = [poi for poi in pois if poi.get("category") in all_categories]
    active_pois = [poi for poi in (pois + official_sites) if poi.get("category") in active_categories]
    park_pois = [poi for poi in pois if poi.get("category") == "park"]

    environmental_metrics = load_or_build_environmental_metrics(config, base_grid, park_pois)
    population_map = {item["id"]: item for item in population.get("features", [])}
    support_access_map = {item["id"]: item for item in all_scope_features}
    active_access_map = {item["id"]: item for item in active_scope_features}

    raw_cells = []
    elderly_scores = []
    building_values = []
    road_values = []
    green_values = []
    park_distances = []

    for cell in base_grid:
        center_lat = cell["center_lat"]
        center_lon = cell["center_lon"]
        district_name = nearest_district(center_lat, center_lon, hotspots)

        population_cell = population_map.get(cell["id"], {})
        elderly_population = int(
            population_cell.get("total_elderly_population")
            or population_cell.get("age65_plus")
            or 0
        )
        fallback_score = compute_elderly_score(center_lat, center_lon, hotspots)
        elderly_score = elderly_population if elderly_population > 0 else fallback_score

        env = environmental_metrics.get(cell["id"], {})
        building_coverage_ratio = float(env.get("building_coverage_ratio", 0.0))
        road_density = float(env.get("road_density_km_per_sqkm", 0.0))
        green_coverage_ratio = float(env.get("green_coverage_ratio", 0.0))
        nearest_park_distance = env.get("nearest_park_distance_km")

        building_values.append(building_coverage_ratio)
        road_values.append(road_density)
        green_values.append(green_coverage_ratio)
        if nearest_park_distance is not None:
            park_distances.append(float(nearest_park_distance))

        support_feature = support_access_map.get(cell["id"], {})
        active_feature = active_access_map.get(cell["id"], {})
        support_nearest_minutes = support_feature.get("nearest_walk_minutes")
        active_nearest_minutes = active_feature.get("nearest_walk_minutes")

        nearby_support_count = 0
        nearest_support_distance_km = None
        for poi in support_pois:
            distance = haversine_km(center_lat, center_lon, poi["lat"], poi["lon"])
            if nearest_support_distance_km is None or distance < nearest_support_distance_km:
                nearest_support_distance_km = distance
            if distance <= thresholds["nearby_resource"]:
                nearby_support_count += 1

        nearby_active_count = 0
        for poi in active_pois:
            if haversine_km(center_lat, center_lon, poi["lat"], poi["lon"]) <= thresholds["nearby_resource"]:
                nearby_active_count += 1

        raw_cells.append(
            {
                "id": cell["id"],
                "row": cell["row"],
                "col": cell["col"],
                "center_lat": center_lat,
                "center_lon": center_lon,
                "district": district_name,
                "polygon": cell["polygon"],
                "elderly_score_raw": elderly_score,
                "estimated_elderly_population": elderly_population,
                "age80_plus": int(population_cell.get("age80_plus", 0)),
                "population_data_level": population_cell.get("data_level", "worldpop_raster"),
                "support_nearest_walk_minutes": support_nearest_minutes,
                "support_accessibility_data_level": support_feature.get("data_level", all_scope_summary.get("data_level")),
                "active_cooling_nearest_walk_minutes": active_nearest_minutes,
                "active_cooling_accessibility_data_level": active_feature.get("data_level", active_scope_summary.get("data_level")),
                "nearby_support_resource_count": nearby_support_count,
                "nearest_support_poi_distance_km": round(nearest_support_distance_km, 3)
                if nearest_support_distance_km is not None
                else None,
                "nearby_active_cooling_count": nearby_active_count,
                "building_coverage_ratio": building_coverage_ratio,
                "road_density_km_per_sqkm": road_density,
                "green_coverage_ratio": green_coverage_ratio,
                "nearest_park_distance_km": nearest_park_distance,
            }
        )
        elderly_scores.append(elderly_score)

    elderly_min = min(elderly_scores) if elderly_scores else 0.0
    elderly_max = max(elderly_scores) if elderly_scores else 1.0
    building_min = min(building_values) if building_values else 0.0
    building_max = max(building_values) if building_values else 1.0
    road_min = min(road_values) if road_values else 0.0
    road_max = max(road_values) if road_values else 1.0
    green_min = min(green_values) if green_values else 0.0
    green_max = max(green_values) if green_values else 1.0
    park_min = min(park_distances) if park_distances else 0.0
    park_max = max(park_distances) if park_distances else 1.0

    grid_features = []
    district_stats: dict[str, dict] = defaultdict(
        lambda: {
            "cell_count": 0,
            "high_risk_cells": 0,
            "risk_sum": 0.0,
            "estimated_elderly_population": 0,
        }
    )

    for cell in raw_cells:
        elderly_norm = normalize(cell["elderly_score_raw"], elderly_min, elderly_max)
        building_norm = normalize(cell["building_coverage_ratio"], building_min, building_max)
        road_norm = normalize(cell["road_density_km_per_sqkm"], road_min, road_max)
        green_norm = normalize(cell["green_coverage_ratio"], green_min, green_max)
        park_distance = cell["nearest_park_distance_km"]
        park_norm = normalize(park_distance if park_distance is not None else park_max, park_min, park_max)
        park_cooling = clamp(1 - park_norm) if park_distances else park_access_score(park_distance)

        cooling_relief = clamp(green_norm * 0.65 + park_cooling * 0.35)
        local_heat_island = clamp(building_norm * 0.55 + road_norm * 0.30 + (1 - green_norm) * 0.15)
        local_heat_modifier = round((local_heat_island - cooling_relief) * 4.2, 2)

        support_access_score = score_access(
            cell["support_nearest_walk_minutes"],
            cell["nearby_support_resource_count"],
        )
        active_access_score = score_access(
            cell["active_cooling_nearest_walk_minutes"],
            cell["nearby_active_cooling_count"],
        )
        combined_access_score = round(clamp(support_access_score * 0.25 + active_access_score * 0.75), 3)

        heat_component = clamp(
            weather_profile["severity_index"] * (0.65 + local_heat_island * 0.55) - cooling_relief * 0.12
        )
        risk_score = round(
            (heat_component * 0.45 + elderly_norm * 0.40 + (1 - combined_access_score) * 0.15) * 100,
            2,
        )
        estimated_elderly_population = cell["estimated_elderly_population"] or int(180 + elderly_norm * 1200)

        feature = {
            "id": cell["id"],
            "row": cell["row"],
            "col": cell["col"],
            "district": cell["district"],
            "center_lat": round(cell["center_lat"], 6),
            "center_lon": round(cell["center_lon"], 6),
            "temperature_estimate": round(weather_profile["reference_temperature"] + local_heat_modifier, 2),
            "apparent_temperature_estimate": round(
                weather_profile["reference_apparent_temperature"] + local_heat_modifier * 1.15,
                2,
            ),
            "heat_stress_index": round(heat_component, 4),
            "heat_island_proxy": round(local_heat_island, 4),
            "cooling_relief_proxy": round(cooling_relief, 4),
            "building_coverage_ratio": round(cell["building_coverage_ratio"], 4),
            "road_density_km_per_sqkm": round(cell["road_density_km_per_sqkm"], 2),
            "green_coverage_ratio": round(cell["green_coverage_ratio"], 4),
            "nearest_park_distance_km": cell["nearest_park_distance_km"],
            "estimated_elderly_population": estimated_elderly_population,
            "age80_plus": cell["age80_plus"],
            "support_access_score": round(support_access_score, 3),
            "active_cooling_access_score": round(active_access_score, 3),
            "access_score": combined_access_score,
            "support_nearest_walk_minutes": cell["support_nearest_walk_minutes"],
            "active_cooling_nearest_walk_minutes": cell["active_cooling_nearest_walk_minutes"],
            "nearest_walk_minutes": cell["active_cooling_nearest_walk_minutes"]
            if cell["active_cooling_nearest_walk_minutes"] is not None
            else cell["support_nearest_walk_minutes"],
            "nearby_support_resource_count": cell["nearby_support_resource_count"],
            "nearby_resource_count": cell["nearby_support_resource_count"],
            "nearby_active_cooling_count": cell["nearby_active_cooling_count"],
            "nearest_poi_distance_km": cell["nearest_support_poi_distance_km"],
            "risk_score": risk_score,
            "risk_level": risk_level(risk_score),
            "polygon": cell["polygon"],
            "population_data_level": cell["population_data_level"],
            "support_accessibility_data_level": cell["support_accessibility_data_level"],
            "active_cooling_accessibility_data_level": cell["active_cooling_accessibility_data_level"],
            "accessibility_data_level": cell["active_cooling_accessibility_data_level"]
            or cell["support_accessibility_data_level"],
            "analysis_profile_type": weather_profile["profile_type"],
            "weather_case_label": weather_profile["case_label"],
            "weather_context": weather_profile["context_label"],
            "data_level": "real_weather_spatial_proxy_model",
        }
        grid_features.append(feature)

        stats = district_stats[cell["district"]]
        stats["cell_count"] += 1
        stats["risk_sum"] += risk_score
        stats["estimated_elderly_population"] += estimated_elderly_population
        if risk_score >= HIGH_RISK_THRESHOLD:
            stats["high_risk_cells"] += 1

    districts = []
    for district_name, stats in district_stats.items():
        avg_risk = round(stats["risk_sum"] / stats["cell_count"], 2) if stats["cell_count"] else 0.0
        districts.append(
            {
                "district": district_name,
                "average_risk": avg_risk,
                "high_risk_cells": stats["high_risk_cells"],
                "estimated_elderly_population": stats["estimated_elderly_population"],
            }
        )
    districts.sort(key=lambda item: item["average_risk"], reverse=True)

    summary = {
        "generated_at": current_timestamp(),
        "data_level": "real_weather_spatial_proxy_model",
        "risk_context_label": weather_profile["context_label"],
        "analysis_profile_type": weather_profile["profile_type"],
        "analysis_case_label": weather_profile["case_label"],
        "analysis_window_start": weather_profile["start_time"],
        "analysis_window_end": weather_profile["end_time"],
        "reference_temperature": weather_profile["reference_temperature"],
        "reference_apparent_temperature": weather_profile["reference_apparent_temperature"],
        "regional_heat_severity_index": weather_profile["severity_index"],
        "environmental_proxy_source": "Geofabrik 建筑面/道路/土地利用 + OSM 公园",
        "accessibility_scope_in_risk_model": {
            "support_resource_weight": 0.25,
            "active_cooling_weight": 0.75,
        },
        "total_cells": len(grid_features),
        "high_risk_cells": sum(1 for item in grid_features if item["risk_score"] >= HIGH_RISK_THRESHOLD),
        "very_high_risk_cells": sum(1 for item in grid_features if item["risk_score"] >= VERY_HIGH_RISK_THRESHOLD),
        "medium_or_above_cells": sum(1 for item in grid_features if item["risk_score"] >= MEDIUM_RISK_THRESHOLD),
        "average_risk": round(sum(item["risk_score"] for item in grid_features) / max(len(grid_features), 1), 2),
        "districts": districts[:7],
    }

    write_json(
        PROCESSED_DIR / "risk_grid.json",
        {
            "metadata": {
                "generated_at": summary["generated_at"],
                "risk_context_label": summary["risk_context_label"],
                "analysis_profile_type": summary["analysis_profile_type"],
                "analysis_case_label": summary["analysis_case_label"],
            },
            "features": grid_features,
        },
    )
    write_json(PROCESSED_DIR / "risk_summary.json", summary)

    print("真实天气驱动的风险网格已生成。")


if __name__ == "__main__":
    main()
