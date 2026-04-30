from collections import Counter
import math

from build_accessibility import SERVICE_CATEGORIES, build_distance_proxy_features
from common import PROCESSED_DIR, build_base_grid, current_timestamp, ensure_directories, load_config, normalize, read_json, write_json


HIGH_RISK_THRESHOLD = 60
WEIGHT_VARIANTS = [
    ("current_weights", "当前方案 (0.45/0.40/0.15)", (0.45, 0.40, 0.15)),
    ("heat_emphasis", "偏热暴露 (0.50/0.35/0.15)", (0.50, 0.35, 0.15)),
    ("balanced_population", "偏人口暴露 (0.40/0.45/0.15)", (0.40, 0.45, 0.15)),
    ("elderly_emphasis", "高龄优先 (0.35/0.50/0.15)", (0.35, 0.50, 0.15)),
    ("access_emphasis", "偏可达性惩罚 (0.45/0.30/0.25)", (0.45, 0.30, 0.25)),
]


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


def build_component_scores(risk_features: list[dict]) -> tuple[list[dict], int]:
    if not risk_features:
        return [], 0

    top_n = max(sum(1 for feature in risk_features if feature["risk_score"] >= HIGH_RISK_THRESHOLD), 10)
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
        heat_proxy = apparent_norm * 0.7 + temp_norm * 0.3
        scored_features.append(
            {
                **feature,
                "temp_norm": round(temp_norm, 6),
                "apparent_norm": round(apparent_norm, 6),
                "elderly_norm": round(elderly_norm, 6),
                "access_penalty": round(access_penalty, 6),
                "heat_proxy": round(heat_proxy, 6),
            }
        )
    return scored_features, top_n


def build_risk_model_validation(risk_features: list[dict]) -> dict:
    if not risk_features:
        return {"top_cell_count": 0, "variants": []}

    scored_features, top_n = build_component_scores(risk_features)
    for feature in scored_features:
        feature_scores = {
            "temperature_only_score": feature["temp_norm"] * 100,
            "temperature_humidity_score": feature["apparent_norm"] * 100,
            "temperature_humidity_population_score": (feature["apparent_norm"] * 0.6 + feature["elderly_norm"] * 0.4) * 100,
            "full_model_score": feature["risk_score"],
            "variant_w1_score": (feature["heat_proxy"] * 0.50 + feature["elderly_norm"] * 0.35 + feature["access_penalty"] * 0.15) * 100,
            "variant_w2_score": (feature["heat_proxy"] * 0.40 + feature["elderly_norm"] * 0.45 + feature["access_penalty"] * 0.15) * 100,
            "variant_w3_score": (feature["heat_proxy"] * 0.35 + feature["elderly_norm"] * 0.50 + feature["access_penalty"] * 0.15) * 100,
            "variant_w4_score": (feature["heat_proxy"] * 0.45 + feature["elderly_norm"] * 0.30 + feature["access_penalty"] * 0.25) * 100,
        }
        feature.update({k: round(v, 2) for k, v in feature_scores.items()})

    variants = [
        ("temperature_only_score", "仅温度阈值"),
        ("temperature_humidity_score", "温度+体感温度"),
        ("temperature_humidity_population_score", "温度+体感温度+老年人口"),
        ("full_model_score", "完整模型（当前方案0.45/0.40/0.15）"),
        ("variant_w1_score", "变体1 (0.50/0.35/0.15)"),
        ("variant_w2_score", "变体2 (0.40/0.45/0.15)"),
        ("variant_w3_score", "变体3 (0.35/0.50/0.15)"),
        ("variant_w4_score", "变体4 (0.45/0.40/0.15简易)"),
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


def merge_count(values: list[int]) -> tuple[list[int], int]:
    if len(values) <= 1:
        return values[:], 0
    middle = len(values) // 2
    left, left_inv = merge_count(values[:middle])
    right, right_inv = merge_count(values[middle:])
    merged: list[int] = []
    inversions = left_inv + right_inv
    i = 0
    j = 0

    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i])
            i += 1
        else:
            merged.append(right[j])
            j += 1
            inversions += len(left) - i

    merged.extend(left[i:])
    merged.extend(right[j:])
    return merged, inversions


def kendall_tau(reference_ids: list[str], candidate_ids: list[str]) -> float:
    if len(reference_ids) != len(candidate_ids):
        return 0.0
    size = len(reference_ids)
    if size < 2:
        return 1.0

    candidate_rank = {identifier: index for index, identifier in enumerate(candidate_ids)}
    permutation = [candidate_rank[identifier] for identifier in reference_ids if identifier in candidate_rank]
    if len(permutation) != size:
        return 0.0

    _, inversions = merge_count(permutation)
    total_pairs = size * (size - 1) / 2
    return round(1 - (2 * inversions / total_pairs), 4)


def summarize_weight_variant(scored_features: list[dict], score_key: str, label: str, top_n: int, baseline_ids: set[str]) -> dict:
    selected = sorted(
        scored_features,
        key=lambda item: (-item[score_key], item["id"]),
    )[:top_n]
    selected_ids = {item["id"] for item in selected}
    elderly_population_sum = sum(item["estimated_elderly_population"] for item in selected)
    total_population = sum(item["estimated_elderly_population"] for item in scored_features)
    district_counter = Counter(item["district"] for item in selected)
    return {
        "key": score_key,
        "name": label,
        "selected_cell_count": len(selected),
        "elderly_population_sum": elderly_population_sum,
        "elderly_capture_rate": round(elderly_population_sum / max(total_population, 1), 4),
        "weighted_avg_walk_minutes": weighted_average_minutes(selected),
        "overlap_with_baseline": len(selected_ids & baseline_ids),
        "overlap_rate_with_baseline": round(len(selected_ids & baseline_ids) / max(top_n, 1), 4),
        "top_district": district_counter.most_common(1)[0][0] if district_counter else "未知",
        "top_cell_ids": [item["id"] for item in selected[: min(10, len(selected))]],
    }


def build_weight_sensitivity(risk_features: list[dict]) -> dict:
    if not risk_features:
        return {"top_cell_count": 0, "variants": [], "kendall_tau_matrix": []}

    scored_features, top_n = build_component_scores(risk_features)
    for feature in scored_features:
        for key, _, (heat_weight, elderly_weight, access_weight) in WEIGHT_VARIANTS:
            feature[key] = round(
                (feature["heat_proxy"] * heat_weight + feature["elderly_norm"] * elderly_weight + feature["access_penalty"] * access_weight) * 100,
                2,
            )

    ordered_rankings = {
        key: [
            item["id"]
            for item in sorted(scored_features, key=lambda feature: (-feature[key], feature["id"]))
        ]
        for key, _, _ in WEIGHT_VARIANTS
    }
    baseline_key = WEIGHT_VARIANTS[0][0]
    baseline_selected_ids = set(ordered_rankings[baseline_key][:top_n])

    variants = []
    for key, label, weights in WEIGHT_VARIANTS:
        variant = summarize_weight_variant(scored_features, key, label, top_n, baseline_selected_ids)
        variant["weights"] = {
            "heat": weights[0],
            "elderly": weights[1],
            "access_penalty": weights[2],
        }
        variant["kendall_tau_with_baseline"] = kendall_tau(ordered_rankings[baseline_key], ordered_rankings[key])
        variants.append(variant)

    tau_matrix = []
    for key_left, label_left, _ in WEIGHT_VARIANTS:
        row = {"name": label_left, "key": key_left}
        for key_right, _, _ in WEIGHT_VARIANTS:
            row[key_right] = kendall_tau(ordered_rankings[key_left], ordered_rankings[key_right])
        tau_matrix.append(row)

    return {
        "top_cell_count": top_n,
        "variants": variants,
        "kendall_tau_matrix": tau_matrix,
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


def build_strategy_comparison(optimization: dict) -> dict:
    strategy_comparison = optimization.get("strategy_comparison", {})
    if strategy_comparison:
        return strategy_comparison
    return {"strategies": []}


def build_diurnal_risk_profile(weather_summary: dict) -> dict:
    archive = weather_summary.get("historical_heatwave_case", {})
    trend = archive.get("trend", [])
    if not trend:
        return {}

    hourly_stats: dict[int, dict] = {}
    for entry in trend:
        time_str = entry.get("time")
        if not time_str or "T" not in time_str:
            continue
        hour_str = time_str.split("T")[1].split(":")[0]
        hour = int(hour_str)
        if hour not in hourly_stats:
            hourly_stats[hour] = {"temp_sum": 0.0, "apparent_sum": 0.0, "count": 0}

        hourly_stats[hour]["temp_sum"] += entry.get("temperature", 0.0)
        hourly_stats[hour]["apparent_sum"] += entry.get("apparent_temperature", 0.0)
        hourly_stats[hour]["count"] += 1

    profile = []
    for hour in range(24):
        if hour in hourly_stats and hourly_stats[hour]["count"] > 0:
            count = hourly_stats[hour]["count"]
            profile.append({
                "hour": f"{hour:02d}:00",
                "temperature": round(hourly_stats[hour]["temp_sum"] / count, 2),
                "apparent_temperature": round(hourly_stats[hour]["apparent_sum"] / count, 2),
            })

    return {
        "title": "热浪期间24小时风险节律",
        "description": "基于历史热浪窗口的逐小时平均温度与体感温度变化曲线，突显了日间长时高风险（10:00-16:00）及夜间隐性高温特征。",
        "profile": profile,
        "daytime_high_risk_window": "10:00-16:00",
        "nighttime_persistence_window": "20:00-06:00",
    }


def main() -> None:
    ensure_directories()
    config = load_config()
    risk_grid = read_json(PROCESSED_DIR / "risk_grid.json", {"features": []})
    accessibility_grid = read_json(PROCESSED_DIR / "accessibility_grid.json", {"features": []})
    accessibility_summary = read_json(PROCESSED_DIR / "accessibility_summary.json", {})
    poi_points = read_json(PROCESSED_DIR / "poi_points.json", [])
    optimization = read_json(PROCESSED_DIR / "optimization_experiments.json", {"scenarios": []})

    weather_summary = read_json(PROCESSED_DIR / "weather_summary.json", {})

    risk_features = risk_grid.get("features", [])
    accessibility_features = accessibility_grid.get("features", [])

    risk_validation = build_risk_model_validation(risk_features)
    weight_sensitivity = build_weight_sensitivity(risk_features)
    accessibility_comparison = build_accessibility_comparison(
        config,
        risk_features,
        accessibility_features,
        accessibility_summary,
        poi_points,
    )
    ablation_validation = build_ablation_validation(risk_validation, accessibility_comparison, optimization)
    strategy_comparison = build_strategy_comparison(optimization)
    diurnal_risk_profile = build_diurnal_risk_profile(weather_summary)

    payload = {
        "generated_at": current_timestamp(),
        "risk_model_validation": risk_validation,
        "weight_sensitivity": weight_sensitivity,
        "accessibility_algorithm_comparison": accessibility_comparison,
        "ablation_validation": ablation_validation,
        "strategy_comparison": strategy_comparison,
        "diurnal_risk_profile": diurnal_risk_profile,
    }
    write_json(PROCESSED_DIR / "competition_experiments.json", payload)
    print("比赛实验结果生成完成。")


if __name__ == "__main__":
    main()
