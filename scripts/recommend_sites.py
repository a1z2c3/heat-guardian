import pickle

import networkx as nx
import pulp

from common import DATA_DIR, PROCESSED_DIR, current_timestamp, ensure_directories, haversine_km, load_config, read_json, write_json


EXISTING_ACTIVE_CATEGORIES = {"community_centre", "social_facility", "official_cooling_site"}
CANDIDATE_CATEGORIES = {"library", "park"}
GRAPH_PATH = DATA_DIR / "raw" / "walk_network.pkl"
SCENARIOS = [3, 5, 8]
DEFAULT_TRAVEL_PENALTY_MIN = 50.0
ALL_SUPPORT_SCOPE_KEY = "all_support_resources"
BASELINE_SCOPE_KEY = "existing_active_cooling_resources"
CANDIDATE_CATEGORY_LABELS = {"library": "图书馆", "park": "公园"}
OFFICIAL_SITE_EXCLUSION_RADIUS_KM = 0.25


def load_graph() -> nx.Graph | None:
    if not GRAPH_PATH.exists():
        return None
    with GRAPH_PATH.open("rb") as handle:
        return pickle.load(handle)


def build_time_lookup(
    high_risk_cells: list[dict],
    facilities: list[dict],
    accessibility_grid: dict,
    service_points: dict,
    config: dict,
) -> tuple[dict[tuple[str, int], float], bool]:
    walk_config = config["walk_analysis"]
    walking_speed = walk_config["walking_speed_m_per_min"]
    graph = load_graph()
    service_point_records = (
        service_points.get("points", [])
        + service_points.get("active_cooling_points", [])
        + service_points.get("official_active_points", [])
    )
    poi_node_map = {point["poi_id"]: point["node_id"] for point in service_point_records}
    use_network = graph is not None and bool(poi_node_map)

    time_lookup: dict[tuple[str, int], float] = {}
    if use_network:
        cell_node_map = {cell["id"]: cell.get("node_id") for cell in accessibility_grid.get("features", [])}
        max_search_m = walk_config["recommendation_cutoff_min"] * walking_speed * 3

        for cell in high_risk_cells:
            source_node = cell_node_map.get(cell["id"])
            if source_node is None:
                continue
            distances = nx.single_source_dijkstra_path_length(graph, source_node, cutoff=max_search_m, weight="length")
            for facility in facilities:
                node_id = poi_node_map.get(facility["id"])
                if node_id is None or node_id not in distances:
                    continue
                time_lookup[(cell["id"], facility["id"])] = round(distances[node_id] / walking_speed, 2)
        return time_lookup, True

    for cell in high_risk_cells:
        for facility in facilities:
            distance_km = haversine_km(cell["center_lat"], cell["center_lon"], facility["lat"], facility["lon"])
            time_lookup[(cell["id"], facility["id"])] = round(distance_km * 1000 / walking_speed, 2)
    return time_lookup, False


def compute_baseline_times(
    high_risk_cells: list[dict],
    existing_facilities: list[dict],
    time_lookup: dict[tuple[str, int], float],
) -> dict[str, float | None]:
    baseline = {}
    for cell in high_risk_cells:
        times = [time_lookup[(cell["id"], facility["id"])] for facility in existing_facilities if (cell["id"], facility["id"]) in time_lookup]
        baseline[cell["id"]] = min(times) if times else None
    return baseline


def compute_current_best_times(
    high_risk_cells: list[dict],
    active_ids: set[int],
    time_lookup: dict[tuple[str, int], float],
) -> dict[str, float | None]:
    best_times: dict[str, float | None] = {}
    for cell in high_risk_cells:
        cell_id = cell["id"]
        times = [time_lookup[(cell_id, facility_id)] for facility_id in active_ids if (cell_id, facility_id) in time_lookup]
        best_times[cell_id] = min(times) if times else None
    return best_times


def derive_travel_penalty_minutes(
    cutoff_min: int,
    baseline_times: dict[str, float | None],
    time_lookup: dict[tuple[str, int], float],
) -> float:
    observed = [value for value in baseline_times.values() if value is not None]
    observed.extend(time_lookup.values())
    if not observed:
        return float(cutoff_min * 3)
    return round(max(max(observed) + 5, DEFAULT_TRAVEL_PENALTY_MIN, float(cutoff_min * 3)), 2)


def solve_mclp(
    high_risk_cells: list[dict],
    candidate_facilities: list[dict],
    baseline_covered: dict[str, bool],
    coverage_map: dict[str, list[int]],
    demand_weight: dict[str, float],
    site_count: int,
) -> list[int]:
    if not candidate_facilities:
        return []

    model = pulp.LpProblem(f"heat_guard_mclp_{site_count}", pulp.LpMaximize)
    x = {facility["id"]: pulp.LpVariable(f"x_{facility['id']}", cat="Binary") for facility in candidate_facilities}
    y = {cell["id"]: pulp.LpVariable(f"y_{cell['id']}", cat="Binary") for cell in high_risk_cells}

    model += pulp.lpSum(demand_weight[cell["id"]] * y[cell["id"]] for cell in high_risk_cells)
    model += pulp.lpSum(x[facility["id"]] for facility in candidate_facilities) <= site_count

    for cell in high_risk_cells:
        cell_id = cell["id"]
        if baseline_covered[cell_id]:
            model += y[cell_id] == 1
            continue
        covered_by = coverage_map.get(cell_id, [])
        if covered_by:
            model += y[cell_id] <= pulp.lpSum(x[facility_id] for facility_id in covered_by)
        else:
            model += y[cell_id] == 0

    solver = pulp.PULP_CBC_CMD(msg=False)
    status = model.solve(solver)
    if pulp.LpStatus[status] not in {"Optimal", "Integer Feasible", "Not Solved"}:
        return []

    return [facility["id"] for facility in candidate_facilities if pulp.value(x[facility["id"]]) and pulp.value(x[facility["id"]]) > 0.5]


def fill_with_time_improvement(
    high_risk_cells: list[dict],
    candidate_facilities: list[dict],
    selected_ids: list[int],
    site_count: int,
    existing_ids: set[int],
    time_lookup: dict[tuple[str, int], float],
    demand_weight: dict[str, float],
    travel_penalty_minutes: float,
) -> list[int]:
    if len(selected_ids) >= site_count:
        return selected_ids

    selected = list(selected_ids)
    remaining = {facility["id"] for facility in candidate_facilities if facility["id"] not in selected}
    current_best_times = compute_current_best_times(high_risk_cells, existing_ids | set(selected), time_lookup)

    for _ in range(site_count - len(selected)):
        best_facility = None
        best_gain = 0.0

        for facility in candidate_facilities:
            facility_id = facility["id"]
            if facility_id not in remaining:
                continue

            gain = 0.0
            for cell in high_risk_cells:
                cell_id = cell["id"]
                new_time = time_lookup.get((cell_id, facility_id))
                if new_time is None:
                    continue

                current_time = current_best_times[cell_id]
                reference_time = current_time if current_time is not None else travel_penalty_minutes
                if new_time >= reference_time:
                    continue

                gain += demand_weight[cell_id] * (reference_time - new_time)

            if gain > best_gain:
                best_gain = gain
                best_facility = facility_id

        if best_facility is None or best_gain <= 0:
            break

        selected.append(best_facility)
        remaining.remove(best_facility)

        for cell in high_risk_cells:
            cell_id = cell["id"]
            new_time = time_lookup.get((cell_id, best_facility))
            current_time = current_best_times[cell_id]
            if new_time is None:
                continue
            if current_time is None or new_time < current_time:
                current_best_times[cell_id] = new_time

    return selected


def greedy_fallback(
    high_risk_cells: list[dict],
    candidate_facilities: list[dict],
    baseline_covered: dict[str, bool],
    coverage_map: dict[str, list[int]],
    demand_weight: dict[str, float],
    site_count: int,
) -> list[int]:
    selected: list[int] = []
    covered = {cell["id"] for cell in high_risk_cells if baseline_covered[cell["id"]]}
    remaining = {facility["id"] for facility in candidate_facilities}

    for _ in range(site_count):
        best_facility = None
        best_gain = 0.0
        for facility in candidate_facilities:
            facility_id = facility["id"]
            if facility_id not in remaining:
                continue
            gain = 0.0
            for cell in high_risk_cells:
                cell_id = cell["id"]
                if cell_id in covered:
                    continue
                if facility_id in coverage_map.get(cell_id, []):
                    gain += demand_weight[cell_id]
            if gain > best_gain:
                best_gain = gain
                best_facility = facility_id
        if best_facility is None:
            break
        selected.append(best_facility)
        remaining.remove(best_facility)
        for cell in high_risk_cells:
            if best_facility in coverage_map.get(cell["id"], []):
                covered.add(cell["id"])
    return selected


def evaluate_solution(
    high_risk_cells: list[dict],
    selected_ids: set[int],
    existing_ids: set[int],
    facility_lookup: dict[int, dict],
    time_lookup: dict[tuple[str, int], float],
    cutoff_min: int,
    demand_weight: dict[str, float],
    baseline_times: dict[str, float | None],
    travel_penalty_minutes: float,
) -> dict:
    total_population = sum(cell["estimated_elderly_population"] for cell in high_risk_cells)
    total_weight = sum(demand_weight.values())
    active_ids = existing_ids | selected_ids

    covered_population = 0
    covered_weight = 0.0
    travel_minutes_weighted = 0.0
    total_weight_for_minutes = 0.0
    uncovered_population = 0

    for cell in high_risk_cells:
        cell_id = cell["id"]
        times = [time_lookup[(cell_id, facility_id)] for facility_id in active_ids if (cell_id, facility_id) in time_lookup]
        scenario_time = min(times) if times else None
        population = cell["estimated_elderly_population"]
        weight = demand_weight[cell_id]

        effective_scenario_time = scenario_time if scenario_time is not None else travel_penalty_minutes
        travel_minutes_weighted += effective_scenario_time * population
        total_weight_for_minutes += population

        if scenario_time is not None and scenario_time <= cutoff_min:
            covered_population += population
            covered_weight += weight
        else:
            uncovered_population += population

    baseline_covered_population = 0
    baseline_travel_minutes = 0.0
    baseline_total_weight_for_minutes = 0.0
    for cell in high_risk_cells:
        baseline_time = baseline_times[cell["id"]]
        if baseline_time is not None and baseline_time <= cutoff_min:
            baseline_covered_population += cell["estimated_elderly_population"]
        effective_baseline_time = baseline_time if baseline_time is not None else travel_penalty_minutes
        baseline_travel_minutes += effective_baseline_time * cell["estimated_elderly_population"]
        baseline_total_weight_for_minutes += cell["estimated_elderly_population"]

    return {
        "covered_population": covered_population,
        "coverage_rate_population": round(covered_population / max(total_population, 1), 4),
        "covered_weight": round(covered_weight, 2),
        "coverage_rate_weight": round(covered_weight / max(total_weight, 1), 4),
        "uncovered_population": uncovered_population,
        "average_travel_minutes": round(travel_minutes_weighted / max(total_weight_for_minutes, 1), 2),
        "baseline_covered_population": baseline_covered_population,
        "coverage_improvement_population": covered_population - baseline_covered_population,
        "baseline_average_travel_minutes": round(
            baseline_travel_minutes / max(baseline_total_weight_for_minutes, 1),
            2,
        ),
    }


def build_selected_site_details(
    selected_ids: list[int],
    high_risk_cells: list[dict],
    existing_ids: set[int],
    demand_weight: dict[str, float],
    time_lookup: dict[tuple[str, int], float],
    facility_lookup: dict[int, dict],
    cutoff_min: int,
    travel_penalty_minutes: float,
) -> list[dict]:
    current_best_times = compute_current_best_times(high_risk_cells, existing_ids, time_lookup)
    details = []
    for facility_id in selected_ids:
        facility = facility_lookup[facility_id]
        covered_cells = 0
        covered_population = 0
        incremental_weight = 0.0
        improved_cells = 0
        weighted_time_saving = 0.0

        for cell in high_risk_cells:
            cell_id = cell["id"]
            time_value = time_lookup.get((cell_id, facility_id))
            if time_value is None:
                continue

            current_time = current_best_times[cell_id]
            reference_time = current_time if current_time is not None else travel_penalty_minutes
            if time_value >= reference_time:
                continue

            improved_cells += 1
            weighted_time_saving += (reference_time - time_value) * demand_weight[cell_id]

            if reference_time > cutoff_min and time_value <= cutoff_min:
                covered_cells += 1
                covered_population += cell["estimated_elderly_population"]
                incremental_weight += demand_weight[cell_id]

        for cell in high_risk_cells:
            cell_id = cell["id"]
            time_value = time_lookup.get((cell_id, facility_id))
            current_time = current_best_times[cell_id]
            if time_value is None:
                continue
            if current_time is None or time_value < current_time:
                current_best_times[cell_id] = time_value

        details.append(
            {
                "poi_id": facility["id"],
                "name": facility["name"],
                "category": facility["category"],
                "category_label": facility["category_label"],
                "lat": facility["lat"],
                "lon": facility["lon"],
                "covered_cells": covered_cells,
                "covered_elderly_population": covered_population,
                "improved_cells": improved_cells,
                "weighted_risk": round(incremental_weight, 2),
                "weighted_time_saving": round(weighted_time_saving, 2),
                "score": round(incremental_weight + weighted_time_saving, 2),
                "strategy": "mclp_coverage_time_hybrid",
            }
        )
    details.sort(key=lambda item: item["score"], reverse=True)
    return details


def filter_officially_active_candidates(
    candidate_facilities: list[dict],
    official_sites: list[dict],
    exclusion_radius_km: float = OFFICIAL_SITE_EXCLUSION_RADIUS_KM,
) -> list[dict]:
    if not official_sites:
        return candidate_facilities

    filtered = []
    for candidate in candidate_facilities:
        is_duplicate = False
        for site in official_sites:
            distance = haversine_km(candidate["lat"], candidate["lon"], site["lat"], site["lon"])
            if distance <= exclusion_radius_km:
                is_duplicate = True
                break
        if not is_duplicate:
            filtered.append(candidate)
    return filtered


def main() -> None:
    ensure_directories()
    config = load_config()
    risk_grid = read_json(PROCESSED_DIR / "risk_grid.json", {"features": []})
    pois = read_json(PROCESSED_DIR / "poi_points.json", [])
    official_payload = read_json(PROCESSED_DIR / "official_cooling_sites.json", {"sites": []})
    official_sites = [
        item
        for item in official_payload.get("sites", [])
        if item.get("within_study_area") and item.get("lat") is not None and item.get("lon") is not None
    ]
    accessibility_grid = read_json(PROCESSED_DIR / "accessibility_grid.json", {"features": []})
    accessibility_summary = read_json(PROCESSED_DIR / "accessibility_summary.json", {})
    service_points = read_json(PROCESSED_DIR / "poi_service_points.json", {"points": []})
    cutoff_min = config["walk_analysis"]["recommendation_cutoff_min"]
    accessibility_scopes = accessibility_summary.get("resource_scopes", {})
    all_support_scope = accessibility_scopes.get(ALL_SUPPORT_SCOPE_KEY, accessibility_summary)
    baseline_scope = accessibility_scopes.get(BASELINE_SCOPE_KEY, {})

    high_risk_cells = [cell for cell in risk_grid.get("features", []) if cell["risk_score"] >= 60]
    existing_facilities = [poi for poi in pois if poi["category"] in EXISTING_ACTIVE_CATEGORIES] + official_sites
    candidate_facilities = [poi for poi in pois if poi["category"] in CANDIDATE_CATEGORIES]
    candidate_facilities = filter_officially_active_candidates(candidate_facilities, official_sites)
    facilities = existing_facilities + candidate_facilities
    facility_lookup = {facility["id"]: facility for facility in facilities}

    if not high_risk_cells or not candidate_facilities:
        payload = {
            "generated_at": current_timestamp(),
            "strategy": "mclp",
            "cutoff_min": cutoff_min,
            "baseline_scope": baseline_scope,
            "all_support_scope": all_support_scope,
            "candidate_scope": {
                "scope_label": "可转化临时纳凉候选资源",
                "categories": sorted(CANDIDATE_CATEGORIES),
                "category_labels": [CANDIDATE_CATEGORY_LABELS[key] for key in sorted(CANDIDATE_CATEGORIES)],
                "resource_count": len(candidate_facilities),
                "official_active_site_count": len(official_sites),
                "excluded_existing_official_sites": len([poi for poi in pois if poi["category"] in CANDIDATE_CATEGORIES]) - len(candidate_facilities),
            },
            "recommendations": [],
        }
        write_json(PROCESSED_DIR / "site_recommendations.json", payload)
        write_json(
            PROCESSED_DIR / "optimization_experiments.json",
            {
                "generated_at": current_timestamp(),
                "scenarios": [],
                "baseline_scope": baseline_scope,
                "all_support_scope": all_support_scope,
            },
        )
        print("选址推荐生成完成。")
        return

    time_lookup, used_network = build_time_lookup(high_risk_cells, facilities, accessibility_grid, service_points, config)
    baseline_times = compute_baseline_times(high_risk_cells, existing_facilities, time_lookup)
    baseline_covered = {
        cell["id"]: baseline_times[cell["id"]] is not None and baseline_times[cell["id"]] <= cutoff_min
        for cell in high_risk_cells
    }
    demand_weight = {
        cell["id"]: round(cell["estimated_elderly_population"] * (cell["risk_score"] / 100), 4)
        for cell in high_risk_cells
    }
    coverage_map = {
        cell["id"]: [
            facility["id"]
            for facility in candidate_facilities
            if (cell["id"], facility["id"]) in time_lookup and time_lookup[(cell["id"], facility["id"])] <= cutoff_min
        ]
        for cell in high_risk_cells
    }
    travel_penalty_minutes = derive_travel_penalty_minutes(cutoff_min, baseline_times, time_lookup)
    existing_ids = {facility["id"] for facility in existing_facilities}

    baseline_metrics = evaluate_solution(
        high_risk_cells,
        set(),
        existing_ids,
        facility_lookup,
        time_lookup,
        cutoff_min,
        demand_weight,
        baseline_times,
        travel_penalty_minutes,
    )

    scenarios = []
    for site_count in SCENARIOS:
        try:
            selected_ids = solve_mclp(
                high_risk_cells,
                candidate_facilities,
                baseline_covered,
                coverage_map,
                demand_weight,
                site_count,
            )
        except Exception:
            selected_ids = []

        if not selected_ids:
            selected_ids = greedy_fallback(
                high_risk_cells,
                candidate_facilities,
                baseline_covered,
                coverage_map,
                demand_weight,
                site_count,
            )

        selected_ids = fill_with_time_improvement(
            high_risk_cells,
            candidate_facilities,
            selected_ids,
            site_count,
            existing_ids,
            time_lookup,
            demand_weight,
            travel_penalty_minutes,
        )

        selected_site_details = build_selected_site_details(
            selected_ids,
            high_risk_cells,
            existing_ids,
            demand_weight,
            time_lookup,
            facility_lookup,
            cutoff_min,
            travel_penalty_minutes,
        )
        metrics = evaluate_solution(
            high_risk_cells,
            set(selected_ids),
            existing_ids,
            facility_lookup,
            time_lookup,
            cutoff_min,
            demand_weight,
            baseline_times,
            travel_penalty_minutes,
        )
        scenarios.append(
            {
                "new_site_count": site_count,
                "selected_site_count": len(selected_ids),
                "selected_sites": selected_site_details,
                "metrics": metrics,
            }
        )

    default_scenario = next((item for item in scenarios if item["new_site_count"] == 5), scenarios[0])
    recommendation_payload = {
        "generated_at": current_timestamp(),
        "strategy": "mclp_coverage_time_hybrid" if used_network else "mclp_distance_proxy",
        "cutoff_min": cutoff_min,
        "radius_km": config["service_thresholds_km"]["recommendation_coverage"],
        "baseline_scope": baseline_scope,
        "all_support_scope": all_support_scope,
        "candidate_scope": {
            "scope_label": "可转化临时纳凉候选资源",
            "categories": sorted(CANDIDATE_CATEGORIES),
            "category_labels": [CANDIDATE_CATEGORY_LABELS[key] for key in sorted(CANDIDATE_CATEGORIES)],
            "resource_count": len(candidate_facilities),
            "official_active_site_count": len(official_sites),
            "excluded_existing_official_sites": len([poi for poi in pois if poi["category"] in CANDIDATE_CATEGORIES]) - len(candidate_facilities),
        },
        "baseline_metrics": baseline_metrics,
        "default_scenario": default_scenario["new_site_count"],
        "recommendations": default_scenario["selected_sites"],
    }
    experiment_payload = {
        "generated_at": current_timestamp(),
        "strategy": "mclp_coverage_time_hybrid" if used_network else "mclp_distance_proxy",
        "cutoff_min": cutoff_min,
        "travel_penalty_minutes": travel_penalty_minutes,
        "existing_active_facility_count": len(existing_facilities),
        "candidate_facility_count": len(candidate_facilities),
        "official_active_site_count": len(official_sites),
        "baseline_scope": baseline_scope,
        "all_support_scope": all_support_scope,
        "high_risk_cell_count": len(high_risk_cells),
        "coverage_reachable_high_risk_cell_count": sum(1 for facility_ids in coverage_map.values() if facility_ids),
        "coverage_reachable_population": sum(
            cell["estimated_elderly_population"]
            for cell in high_risk_cells
            if coverage_map.get(cell["id"])
        ),
        "baseline_metrics": baseline_metrics,
        "scenarios": scenarios,
    }

    write_json(PROCESSED_DIR / "site_recommendations.json", recommendation_payload)
    write_json(PROCESSED_DIR / "optimization_experiments.json", experiment_payload)
    print("选址推荐生成完成。")


if __name__ == "__main__":
    main()
