import math
import pickle
from pathlib import Path

import geopandas as gpd
import networkx as nx
import numpy as np
import osmnx as ox
import urllib3

from common import (
    DATA_DIR,
    PROCESSED_DIR,
    build_base_grid,
    current_timestamp,
    describe_grid_resolution,
    ensure_directories,
    haversine_km,
    load_config,
    read_json,
    write_json,
)


GRAPH_PATH = DATA_DIR / "raw" / "walk_network.pkl"
GRAPH_STATUS_PATH = DATA_DIR / "raw" / "walk_network_status.json"
GEOFABRIK_ROADS_PATH = DATA_DIR / "external" / "geofabrik" / "hubei" / "gis_osm_roads_free_1.shp"
ALL_SUPPORT_CATEGORIES = {"community_centre", "library", "hospital", "pharmacy", "social_facility", "park"}
ACTIVE_COOLING_CATEGORIES = {"community_centre", "social_facility"}
OFFICIAL_COOLING_CATEGORY = "official_cooling_site"
SERVICE_CATEGORIES = ALL_SUPPORT_CATEGORIES
BASELINE_SUPPORT_SCOPE_LABEL = "既有社区避暑支撑资源"
BASELINE_SUPPORT_SCOPE_STATEMENT = (
    "该口径用于选址优化基线，包含官方在运纳凉点，以及社区中心、养老服务设施等当前已存在的社区避暑支撑资源。"
    "它反映的是基层现有支撑网络与可快速转化底座，不等同于全部官方已开放纳凉点。"
)
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api",
    "https://lz4.overpass-api.de/api",
    "https://overpass.kumi.systems/api",
]
WALK_CLASSES = {
    "footway",
    "pedestrian",
    "path",
    "steps",
    "living_street",
    "residential",
    "service",
    "unclassified",
    "tertiary",
    "tertiary_link",
    "secondary",
    "secondary_link",
    "primary",
    "primary_link",
    "trunk",
    "trunk_link",
    "cycleway",
}


def save_graph(graph: nx.Graph) -> None:
    with GRAPH_PATH.open("wb") as handle:
        pickle.dump(graph, handle)


def load_graph() -> nx.Graph | None:
    if not GRAPH_PATH.exists():
        return None
    with GRAPH_PATH.open("rb") as handle:
        return pickle.load(handle)


def build_graph_from_geofabrik(config: dict) -> nx.Graph | None:
    if not GEOFABRIK_ROADS_PATH.exists():
        return None

    bbox = config["study_area"]["bbox"]
    gdf = gpd.read_file(
        GEOFABRIK_ROADS_PATH,
        bbox=(bbox["west"], bbox["south"], bbox["east"], bbox["north"]),
    )
    if gdf.empty:
        return None

    gdf = gdf[gdf["fclass"].isin(WALK_CLASSES)].copy()
    if gdf.empty:
        return None

    gdf = gdf.to_crs(epsg=3857)
    graph = nx.Graph()
    node_index: dict[tuple[float, float], int] = {}
    next_id = 0

    for geometry in gdf.geometry:
        if geometry is None or geometry.is_empty:
            continue
        lines = [geometry] if geometry.geom_type == "LineString" else list(getattr(geometry, "geoms", []))
        for line in lines:
            coords = list(line.coords)
            for start, end in zip(coords, coords[1:]):
                if start == end:
                    continue
                start_key = (round(start[0], 3), round(start[1], 3))
                end_key = (round(end[0], 3), round(end[1], 3))
                if start_key not in node_index:
                    node_index[start_key] = next_id
                    graph.add_node(next_id, x=start_key[0], y=start_key[1])
                    next_id += 1
                if end_key not in node_index:
                    node_index[end_key] = next_id
                    graph.add_node(next_id, x=end_key[0], y=end_key[1])
                    next_id += 1
                distance = math.dist(start_key, end_key)
                graph.add_edge(node_index[start_key], node_index[end_key], length=distance)

    if graph.number_of_nodes() == 0:
        return None

    largest_component = max(nx.connected_components(graph), key=len)
    subgraph = graph.subgraph(largest_component).copy()
    save_graph(subgraph)
    write_json(
        GRAPH_STATUS_PATH,
        {
            "status": "ready",
            "source": "geofabrik_roads_shp",
            "graph_nodes": subgraph.number_of_nodes(),
            "graph_edges": subgraph.number_of_edges(),
        },
    )
    return subgraph


def try_build_overpass_graph(config: dict) -> nx.Graph | None:
    bbox = config["study_area"]["bbox"]
    ox.settings.use_cache = True
    ox.settings.requests_kwargs = {"verify": False}
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            ox.settings.overpass_url = endpoint
            graph = ox.graph_from_bbox(
                (bbox["north"], bbox["south"], bbox["east"], bbox["west"]),
                network_type="walk",
                simplify=True,
                retain_all=False,
                truncate_by_edge=True,
            )
            simple_graph = nx.Graph()
            for node_id, attrs in graph.nodes(data=True):
                simple_graph.add_node(int(node_id), x=float(attrs["x"]), y=float(attrs["y"]))
            for u, v, attrs in graph.edges(data=True):
                if u not in simple_graph.nodes or v not in simple_graph.nodes:
                    continue
                simple_graph.add_edge(int(u), int(v), length=float(attrs.get("length", 0.0)))
            save_graph(simple_graph)
            write_json(
                GRAPH_STATUS_PATH,
                {
                    "status": "ready",
                    "source": endpoint,
                    "graph_nodes": simple_graph.number_of_nodes(),
                    "graph_edges": simple_graph.number_of_edges(),
                },
            )
            return simple_graph
        except Exception:
            continue
    return None


def load_or_build_graph(config: dict) -> nx.Graph | None:
    cached = load_graph()
    if cached is not None:
        return cached

    geofabrik_graph = build_graph_from_geofabrik(config)
    if geofabrik_graph is not None:
        return geofabrik_graph

    overpass_graph = try_build_overpass_graph(config)
    if overpass_graph is not None:
        return overpass_graph

    write_json(
        GRAPH_STATUS_PATH,
        {
            "status": "failed",
            "reason": "all_sources_unavailable",
            "fallback": "distance_proxy",
        },
    )
    return None


def snap_points_to_graph(graph: nx.Graph, points_xy: list[tuple[float, float]]) -> list[int | None]:
    node_items = list(graph.nodes(data=True))
    if not node_items:
        return [None for _ in points_xy]
    node_ids = np.array([node_id for node_id, _ in node_items], dtype=np.int64)
    xs = np.array([attrs["x"] for _, attrs in node_items], dtype=float)
    ys = np.array([attrs["y"] for _, attrs in node_items], dtype=float)

    results: list[int | None] = []
    for x, y in points_xy:
        distances = (xs - x) ** 2 + (ys - y) ** 2
        nearest_index = int(np.argmin(distances))
        results.append(int(node_ids[nearest_index]))
    return results


def build_distance_proxy_features(grid_cells: list[dict], service_pois: list[dict], walking_speed: int) -> tuple[list[dict], dict, list[dict]]:
    features = []
    for cell in grid_cells:
        nearest_distance_km = None
        for poi in service_pois:
            distance = haversine_km(cell["center_lat"], cell["center_lon"], poi["lat"], poi["lon"])
            if nearest_distance_km is None or distance < nearest_distance_km:
                nearest_distance_km = distance
        nearest_walk_minutes = round((nearest_distance_km or 99.0) * 1000 / walking_speed, 2) if nearest_distance_km is not None else None
        features.append(
            {
                "id": cell["id"],
                "row": cell["row"],
                "col": cell["col"],
                "center_lat": round(cell["center_lat"], 6),
                "center_lon": round(cell["center_lon"], 6),
                "node_id": None,
                "nearest_walk_distance_m": round((nearest_distance_km or 0.0) * 1000, 2) if nearest_distance_km is not None else None,
                "nearest_walk_minutes": nearest_walk_minutes,
                "covered_5min": nearest_walk_minutes is not None and nearest_walk_minutes <= 5,
                "covered_10min": nearest_walk_minutes is not None and nearest_walk_minutes <= 10,
                "covered_15min": nearest_walk_minutes is not None and nearest_walk_minutes <= 15,
                "data_level": "distance_proxy",
            }
        )

    accessible_features = [item for item in features if item["nearest_walk_minutes"] is not None]
    summary = {
        "generated_at": current_timestamp(),
        "resource_count": len(service_pois),
        "graph_nodes": 0,
        "graph_edges": 0,
        "coverage_5min_rate": round(sum(1 for item in features if item["covered_5min"]) / max(len(features), 1), 4),
        "coverage_10min_rate": round(sum(1 for item in features if item["covered_10min"]) / max(len(features), 1), 4),
        "coverage_15min_rate": round(sum(1 for item in features if item["covered_15min"]) / max(len(features), 1), 4),
        "average_nearest_walk_minutes": round(
            sum(item["nearest_walk_minutes"] for item in accessible_features) / max(len(accessible_features), 1),
            2,
        ),
        "data_level": "distance_proxy",
    }
    return features, summary, []


def build_network_features(
    graph: nx.Graph,
    grid_cells: list[dict],
    service_pois: list[dict],
    walking_speed: int,
    cutoff_min: int,
) -> tuple[list[dict], dict, list[dict]]:
    point_projection = gpd.GeoSeries.from_xy(
        [cell["center_lon"] for cell in grid_cells] + [poi["lon"] for poi in service_pois],
        [cell["center_lat"] for cell in grid_cells] + [poi["lat"] for poi in service_pois],
        crs="EPSG:4326",
    ).to_crs(epsg=3857)
    point_xy = [(geom.x, geom.y) for geom in point_projection]
    cell_points = point_xy[: len(grid_cells)]
    poi_points = point_xy[len(grid_cells) :]

    cell_nodes = snap_points_to_graph(graph, cell_points)
    poi_nodes = snap_points_to_graph(graph, poi_points) if service_pois else []

    poi_records = []
    for poi, node_id in zip(service_pois, poi_nodes):
        if node_id is None:
            continue
        poi_records.append(
            {
                "poi_id": poi["id"],
                "name": poi["name"],
                "category": poi["category"],
                "category_label": poi["category_label"],
                "lat": poi["lat"],
                "lon": poi["lon"],
                "node_id": int(node_id),
            }
        )

    distances = (
        nx.multi_source_dijkstra_path_length(
            graph,
            [record["node_id"] for record in poi_records],
            cutoff=cutoff_min * walking_speed * 2,
            weight="length",
        )
        if poi_records
        else {}
    )

    features = []
    for cell, node_id in zip(grid_cells, cell_nodes):
        distance_m = distances.get(int(node_id)) if node_id is not None else None
        nearest_walk_minutes = round(distance_m / walking_speed, 2) if distance_m is not None else None
        features.append(
            {
                "id": cell["id"],
                "row": cell["row"],
                "col": cell["col"],
                "center_lat": round(cell["center_lat"], 6),
                "center_lon": round(cell["center_lon"], 6),
                "node_id": int(node_id) if node_id is not None else None,
                "nearest_walk_distance_m": round(distance_m, 2) if distance_m is not None else None,
                "nearest_walk_minutes": nearest_walk_minutes,
                "covered_5min": nearest_walk_minutes is not None and nearest_walk_minutes <= 5,
                "covered_10min": nearest_walk_minutes is not None and nearest_walk_minutes <= 10,
                "covered_15min": nearest_walk_minutes is not None and nearest_walk_minutes <= 15,
                "data_level": "walk_network",
            }
        )

    accessible_features = [item for item in features if item["nearest_walk_minutes"] is not None]
    summary = {
        "generated_at": current_timestamp(),
        "resource_count": len(service_pois),
        "graph_nodes": len(graph.nodes),
        "graph_edges": len(graph.edges),
        "coverage_5min_rate": round(sum(1 for item in features if item["covered_5min"]) / max(len(features), 1), 4),
        "coverage_10min_rate": round(sum(1 for item in features if item["covered_10min"]) / max(len(features), 1), 4),
        "coverage_15min_rate": round(sum(1 for item in features if item["covered_15min"]) / max(len(features), 1), 4),
        "average_nearest_walk_minutes": round(
            sum(item["nearest_walk_minutes"] for item in accessible_features) / max(len(accessible_features), 1),
            2,
        ),
        "data_level": "walk_network",
    }
    return features, summary, poi_records


def build_scope_result(
    scope_key: str,
    scope_label: str,
    categories: set[str],
    category_label_lookup: dict[str, str],
    graph: nx.Graph | None,
    grid_cells: list[dict],
    pois: list[dict],
    walking_speed: int,
    cutoff_min: int,
) -> dict:
    scope_pois = [poi for poi in pois if poi["category"] in categories]
    if graph is None:
        features, summary, poi_records = build_distance_proxy_features(grid_cells, scope_pois, walking_speed)
    else:
        features, summary, poi_records = build_network_features(
            graph,
            grid_cells,
            scope_pois,
            walking_speed,
            cutoff_min,
        )

    summary.update(
        {
            "scope_key": scope_key,
            "scope_label": scope_label,
            "categories": sorted(categories),
            "category_labels": [category_label_lookup.get(category, category) for category in sorted(categories)],
        }
    )
    return {
        "features": features,
        "summary": summary,
        "poi_records": poi_records,
    }


def main() -> None:
    ensure_directories()
    config = load_config()
    walk_config = config["walk_analysis"]
    walking_speed = walk_config["walking_speed_m_per_min"]
    grid_cells = build_base_grid(config)
    grid_resolution = describe_grid_resolution(config)
    pois = read_json(PROCESSED_DIR / "poi_points.json", [])
    official_payload = read_json(PROCESSED_DIR / "official_cooling_sites.json", {"sites": []})
    official_sites = [
        item
        for item in official_payload.get("sites", [])
        if item.get("within_study_area") and item.get("lat") is not None and item.get("lon") is not None
    ]
    category_label_lookup = {item["name"]: item["label"] for item in config["poi_categories"]}
    category_label_lookup[OFFICIAL_COOLING_CATEGORY] = "官方纳凉点"

    graph = load_or_build_graph(config)
    all_scope = build_scope_result(
        "all_support_resources",
        "全部支撑资源",
        ALL_SUPPORT_CATEGORIES,
        category_label_lookup,
        graph,
        grid_cells,
        pois,
        walking_speed,
        walk_config["recommendation_cutoff_min"],
    )
    active_scope = build_scope_result(
        "existing_active_cooling_resources",
        BASELINE_SUPPORT_SCOPE_LABEL,
        ACTIVE_COOLING_CATEGORIES | {OFFICIAL_COOLING_CATEGORY},
        category_label_lookup,
        graph,
        grid_cells,
        pois + official_sites,
        walking_speed,
        walk_config["recommendation_cutoff_min"],
    )
    official_scope = build_scope_result(
        "official_operational_cooling_sites",
        "官方公开在运纳凉点",
        {OFFICIAL_COOLING_CATEGORY},
        category_label_lookup,
        graph,
        grid_cells,
        official_sites,
        walking_speed,
        walk_config["recommendation_cutoff_min"],
    )

    for scope in (all_scope, active_scope, official_scope):
        scope["summary"]["grid_resolution"] = grid_resolution
    active_scope["summary"]["scope_statement"] = BASELINE_SUPPORT_SCOPE_STATEMENT
    official_scope["summary"]["scope_statement"] = (
        "该口径仅纳入已完成官方原文与位置核验、且位于研究区内的官方在运纳凉点。"
    )

    summary = {
        **all_scope["summary"],
        "grid_resolution": grid_resolution,
        "default_scope": "all_support_resources",
        "optimization_baseline_scope": "existing_active_cooling_resources",
        "optimization_baseline_scope_label": BASELINE_SUPPORT_SCOPE_LABEL,
        "optimization_baseline_scope_statement": BASELINE_SUPPORT_SCOPE_STATEMENT,
        "official_cooling_scope": "official_operational_cooling_sites",
        "resource_scopes": {
            "all_support_resources": all_scope["summary"],
            "existing_active_cooling_resources": active_scope["summary"],
            "official_operational_cooling_sites": official_scope["summary"],
        },
    }
    grid_payload = {
        "features": all_scope["features"],
        "all_support_features": all_scope["features"],
        "active_cooling_features": active_scope["features"],
        "official_active_features": official_scope["features"],
    }
    poi_service_payload = {
        "points": all_scope["poi_records"],
        "all_support_points": all_scope["poi_records"],
        "active_cooling_points": active_scope["poi_records"],
        "official_active_points": official_scope["poi_records"],
    }

    write_json(PROCESSED_DIR / "accessibility_grid.json", grid_payload)
    write_json(PROCESSED_DIR / "accessibility_summary.json", summary)
    write_json(PROCESSED_DIR / "poi_service_points.json", poi_service_payload)
    print("步行路网可达性分析完成。")


if __name__ == "__main__":
    main()
