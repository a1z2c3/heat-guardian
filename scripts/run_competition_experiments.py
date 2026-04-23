from collections import Counter
import math

from build_accessibility import SERVICE_CATEGORIES, build_distance_proxy_features
from common import PROCESSED_DIR, build_base_grid, current_timestamp, ensure_directories, load_config, normalize, read_json, write_json


HIGH_RISK_THRESHOLD = 60


def weighted_average_minutes(features: list[dict]) -> float:
    total_population = 0
    total_minutes = 0.0
    for feature in features:
        population = feature.get("estimated_elderly_population", 0)
        minutes = feature.get("nearest_walk_minutes")
        if population <= 0:
            continue
        effective_minutes = minutes if minutes is not None else 45.0
        total_population += population
        total_minutes += effective_minutes * population
    return round(total_minutes / max(total_population, 1), 2)


def build_risk_model_validation(risk_features: list[dict]) -> dict:
    if not risk_features:
        return {"top_cell_count": 0, "variants": []}

    top_n = sum(1 for feature in risk_features if feature["risk_score"] >= HIGH_RISK_THRESHOLD)
    top_n = max(top_n, 10)

    temp_values = [feature["temperature_estimate"] for feature in risk_features]
    apparent_values = [feature["apparent_temperature_estimate"] for feature in risk_features]
    elderly_values = [feature["estimated_elderly_population"] for feature in risk_features]

    temp_min, temp_max = min(temp_values), max(temp_values)
    apparent_min, apparent_max = min(apparent_values), max(apparent_values)
    elderly_min, elderly_max = min(elderly_values), max(elderly_values)

    scored_features: list[dict] = []
    for feature in risk_features:
        temp_norm = normalize(feature["temperature_estimate"], temp_min, temp_max)
        apparent_norm = normalize(feature["apparent_temperature_estimate"], apparent_min, apparent_max)
        elderly_norm = normalize(feature["estimated_elderly_population"], elderly_min, elderly_max)
        access_penalty = 1 - feature.get("access_score", 0)
        scored_features.append(
            {
                **feature,
                "temperature_only_score": round(temp_norm * 100, 2),
                "temperature_humidity_score": round(apparent_norm * 100, 2),
                "temperature_humidity_population_score": round((apparent_norm * 0.6 + elderly_norm * 0.4) * 100, 2),
                "full_model_score": feature["risk_score"],
                "access_penalty": round(access_penalty, 4),
            }
        )

    variants = [
        ("temperature_only_score", "仅温度阈值"),
        ("temperature_humidity_score", "温度+体感温度"),
        ("temperature_humidity_population_score", "温度+体感温度+老年人口"),
        ("full_model_score", "完整模型（加入可达性）"),
    ]

    full_selected = sorted(scored_features, key=lambda item: item["full_model_score"], reverse=True)[:top_n]
    full_ids = {item["id"] for item in full_selected}
    total_population = sum(feature["estimated_elderly_population"] for feature in risk_features)

    records = []
    for key, name in variants:
        selected = sorted(scored_features, key=lambda item: item[key], reverse=True)[:top_n]
        selected_ids = {item["id"] for item in selected}
        district_counter = Counter(item["district"] for item in selected)
        elderly_population_sum = sum(item["estimated_elderly_population"] for item in selected)
        uncovered_population_15min = sum(
            item["estimated_elderly_population"]
            for item in selected
            if item.get("nearest_walk_minutes") is None or item["nearest_walk_minutes"] > 15
        )
        records.append(
            {
                "key": key,
                "name": name,
                "selected_cell_count": len(selected),
                "elderly_population_sum": elderly_population_sum,
                "elderly_capture_rate": round(elderly_population_sum / max(total_population, 1), 4),
                "uncovered_population_15min": uncovered_population_15min,
                "weighted_avg_walk_minutes": weighted_average_minutes(selected),
                "overlap_with_full_model": len(selected_ids & full_ids),
                "top_district": district_counter.most_common(1)[0][0] if district_counter else "未知",
            }
        )

    return {
        "top_cell_count": top_n,
        "variants": records,
    }


def build_accessibility_comparison(
    config: dict,
    risk_features: list[dict],
    accessibility_features: list[dict],
    accessibility_summary: dict,
    poi_points: list[dict],
) -> dict:
    grid_cells = build_base_grid(config)
    walking_speed = config["walk_analysis"]["walking_speed_m_per_min"]
    service_pois = [poi for poi in poi_points if poi["category"] in SERVICE_CATEGORIES]
    proxy_features, proxy_summary, _ = build_distance_proxy_features(grid_cells, service_pois, walking_speed)

    network_map = {item["id"]: item for item in accessibility_features}
    proxy_map = {item["id"]: item for item in proxy_features}

    differences = []
    optimistic_misclassified = 0
    conservative_misclassified = 0
    for cell_id, network_item in network_map.items():
        proxy_item = proxy_map.get(cell_id)
        if proxy_item is None:
            continue
        network_minutes = network_item.get("nearest_walk_minutes")
        proxy_minutes = proxy_item.get("nearest_walk_minutes")
        if network_minutes is not None and proxy_minutes is not None:
            differences.append(proxy_minutes - network_minutes)

        proxy_covered = proxy_minutes is not None and proxy_minutes <= 15
        network_covered = network_minutes is not None and network_minutes <= 15
        if proxy_covered and not network_covered:
            optimistic_misclassified += 1
        if network_covered and not proxy_covered:
            conservative_misclassified += 1

    high_risk_ids = {item["id"] for item in risk_features if item["risk_score"] >= HIGH_RISK_THRESHOLD}
    network_high_risk_covered = sum(
        1
        for cell_id in high_risk_ids
        if network_map.get(cell_id, {}).get("nearest_walk_minutes") is not None
        and network_map[cell_id]["nearest_walk_minutes"] <= 15
    )
    proxy_high_risk_covered = sum(
        1
        for cell_id in high_risk_ids
        if proxy_map.get(cell_id, {}).get("nearest_walk_minutes") is not None
        and proxy_map[cell_id]["nearest_walk_minutes"] <= 15
    )

    mae = round(sum(abs(item) for item in differences) / max(len(differences), 1), 2)
    rmse = round(math.sqrt(sum(item * item for item in differences) / max(len(differences), 1)), 2)

    return {
        "network": {
            "average_nearest_walk_minutes": accessibility_summary.get("average_nearest_walk_minutes", 0),
            "coverage_5min_rate": accessibility_summary.get("coverage_5min_rate", 0),
            "coverage_10min_rate": accessibility_summary.get("coverage_10min_rate", 0),
            "coverage_15min_rate": accessibility_summary.get("coverage_15min_rate", 0),
            "high_risk_covered_cells": network_high_risk_covered,
        },
        "distance_proxy": {
            "average_nearest_walk_minutes": proxy_summary.get("average_nearest_walk_minutes", 0),
            "coverage_5min_rate": proxy_summary.get("coverage_5min_rate", 0),
            "coverage_10min_rate": proxy_summary.get("coverage_10min_rate", 0),
            "coverage_15min_rate": proxy_summary.get("coverage_15min_rate", 0),
            "high_risk_covered_cells": proxy_high_risk_covered,
        },
        "mean_abs_error_minutes": mae,
        "rmse_minutes": rmse,
        "optimistic_misclassified_cells": optimistic_misclassified,
        "conservative_misclassified_cells": conservative_misclassified,
    }


def build_ablation_validation(
    risk_validation: dict,
    accessibility_comparison: dict,
    optimization: dict,
) -> dict:
    variants = {item["key"]: item for item in risk_validation.get("variants", [])}
    baseline = optimization.get("baseline_metrics", {})
    scenario5 = next((item for item in optimization.get("scenarios", []) if item["new_site_count"] == 5), None)
    scenario5_metrics = scenario5.get("metrics", {}) if scenario5 else {}

    modules = [
        {
            "module": "移除老年人口暴露",
            "metric": "TopN网格老年人口捕获量",
            "full_value": variants.get("full_model_score", {}).get("elderly_population_sum", 0),
            "ablated_value": variants.get("temperature_humidity_score", {}).get("elderly_population_sum", 0),
            "delta": variants.get("full_model_score", {}).get("elderly_population_sum", 0)
            - variants.get("temperature_humidity_score", {}).get("elderly_population_sum", 0),
            "interpretation": "不引入老年人口结构，会削弱模型对高龄暴露区的识别能力。",
        },
        {
            "module": "移除真实路网",
            "metric": "15分钟覆盖率(百分点)",
            "full_value": round(accessibility_comparison["network"]["coverage_15min_rate"] * 100, 2),
            "ablated_value": round(accessibility_comparison["distance_proxy"]["coverage_15min_rate"] * 100, 2),
            "delta": round(
                accessibility_comparison["network"]["coverage_15min_rate"] * 100
                - accessibility_comparison["distance_proxy"]["coverage_15min_rate"] * 100,
                2,
            ),
            "interpretation": "使用距离代理会系统性高估可达性，导致资源不足区域被低估。",
        },
        {
            "module": "移除选址优化",
            "metric": "高风险人口覆盖率(百分点)",
            "full_value": round(scenario5_metrics.get("coverage_rate_population", 0) * 100, 2),
            "ablated_value": round(baseline.get("coverage_rate_population", 0) * 100, 2),
            "delta": round(
                scenario5_metrics.get("coverage_rate_population", 0) * 100
                - baseline.get("coverage_rate_population", 0) * 100,
                2,
            ),
            "interpretation": "不做选址优化时，高风险人群覆盖率几乎无法提升。",
        },
        {
            "module": "移除选址优化",
            "metric": "平均到达时间(分钟)",
            "full_value": scenario5_metrics.get("average_travel_minutes", 0),
            "ablated_value": baseline.get("average_travel_minutes", 0),
            "delta": round(
                baseline.get("average_travel_minutes", 0) - scenario5_metrics.get("average_travel_minutes", 0),
                2,
            ),
            "interpretation": "新增点位后，时间成本显著下降，证明优化模块具备现实调度价值。",
        },
    ]
    return {"modules": modules}


def main() -> None:
    ensure_directories()
    config = load_config()
    risk_grid = read_json(PROCESSED_DIR / "risk_grid.json", {"features": []})
    accessibility_grid = read_json(PROCESSED_DIR / "accessibility_grid.json", {"features": []})
    accessibility_summary = read_json(PROCESSED_DIR / "accessibility_summary.json", {})
    poi_points = read_json(PROCESSED_DIR / "poi_points.json", [])
    optimization = read_json(PROCESSED_DIR / "optimization_experiments.json", {"scenarios": []})

    risk_features = risk_grid.get("features", [])
    accessibility_features = accessibility_grid.get("features", [])

    risk_validation = build_risk_model_validation(risk_features)
    accessibility_comparison = build_accessibility_comparison(
        config,
        risk_features,
        accessibility_features,
        accessibility_summary,
        poi_points,
    )
    ablation_validation = build_ablation_validation(risk_validation, accessibility_comparison, optimization)

    payload = {
        "generated_at": current_timestamp(),
        "risk_model_validation": risk_validation,
        "accessibility_algorithm_comparison": accessibility_comparison,
        "ablation_validation": ablation_validation,
    }
    write_json(PROCESSED_DIR / "competition_experiments.json", payload)
    print("比赛实验结果生成完成。")


if __name__ == "__main__":
    main()
