"""对各数据模块执行真实性审计，输出 data_authenticity_audit.json。

每个模块判定维度:
  - upstream_is_real: 上游数据源是否来自真实实测/官方公开
  - output_is_modeled: 输出是否经过建模/聚合处理
  - uses_proxy: 是否使用了代理变量
  - fallback_detected: 是否触发了回退逻辑
"""

from pathlib import Path

from common import (
    DATA_DIR,
    PROCESSED_DIR,
    RAW_DIR,
    current_timestamp,
    ensure_directories,
    read_json,
    write_json,
)


EXTERNAL_DIR = DATA_DIR / "external"
OUTPUT_PATH = PROCESSED_DIR / "data_authenticity_audit.json"

MODULE_DEFINITIONS: list[dict] = [
    {
        "key": "weather",
        "label": "气象数据",
        "stage": "上游采集",
        "processed_path": PROCESSED_DIR / "weather_summary.json",
        "raw_paths": [
            RAW_DIR / "weather_forecast.json",
            RAW_DIR / "weather_archive_2025_warm_season.json",
        ],
        "upstream_source": "Open-Meteo 公开气象 API（ERA5 再分析 + GFS 预报）",
        "real_criteria": "raw_exists",
        "proxy_flag": False,
        "safe_claim": "气象数据来自 Open-Meteo 公开 API，底层为 ERA5 再分析与 GFS 预报实测数据。",
        "avoid_claim": "自建气象站实测数据",
    },
    {
        "key": "official_cooling",
        "label": "官方纳凉点",
        "stage": "上游采集",
        "processed_path": PROCESSED_DIR / "official_cooling_sites.json",
        "raw_paths": [RAW_DIR / "official_cooling_sources_raw.json"],
        "upstream_source": "武汉市民政局等政府网站公开信息",
        "real_criteria": "raw_exists",
        "proxy_flag": False,
        "safe_claim": "纳凉点数据来自政府部门官方公开页面，经结构化提取与校验。",
        "avoid_claim": "线下实地踏勘全量采集",
    },
    {
        "key": "poi",
        "label": "POI 兴趣点",
        "stage": "上游采集",
        "processed_path": PROCESSED_DIR / "poi_points.json",
        "raw_paths": [RAW_DIR / "osm_poi_raw.json"],
        "upstream_source": "OpenStreetMap Overpass API",
        "real_criteria": "raw_exists",
        "proxy_flag": False,
        "safe_claim": "POI 数据来自 OpenStreetMap 公开众包地理数据库，经 Overpass API 实时查询。",
        "avoid_claim": "自有商业 POI 数据库",
    },
    {
        "key": "worldpop",
        "label": "人口栅格（WorldPop）",
        "stage": "外部数据",
        "processed_path": PROCESSED_DIR / "population_grid.json",
        "external_paths": [
            EXTERNAL_DIR / "worldpop" / "worldpop_age65_plus_latest.tif",
            EXTERNAL_DIR / "worldpop" / "worldpop_age80_plus_latest.tif",
        ],
        "upstream_source": "WorldPop 全球人口栅格（联合国人口基金支持）",
        "real_criteria": "external_exists",
        "proxy_flag": True,
        "proxy_note": "使用 WorldPop 模型估算人口作为实际人口的代理变量",
        "safe_claim": "人口空间分布来自 WorldPop 公开栅格数据，属于基于遥感与统计模型的估算产品。",
        "avoid_claim": "人口普查精确到社区的实测数据",
    },
    {
        "key": "geofabrik",
        "label": "OSM 路网与建筑（Geofabrik）",
        "stage": "外部数据",
        "processed_path": None,
        "external_paths": [
            EXTERNAL_DIR / "geofabrik" / "hubei-latest-free.shp.zip",
        ],
        "upstream_source": "Geofabrik OpenStreetMap 导出",
        "real_criteria": "external_exists",
        "proxy_flag": False,
        "safe_claim": "路网与建筑数据来自 OpenStreetMap Geofabrik 镜像导出，属于公开众包地理数据。",
        "avoid_claim": "高精度商业测绘数据",
    },
    {
        "key": "walk_network",
        "label": "步行路网图",
        "stage": "上游采集",
        "processed_path": None,
        "raw_paths": [RAW_DIR / "walk_network.pkl"],
        "status_path": RAW_DIR / "walk_network_status.json",
        "upstream_source": "OSMnx 基于 OpenStreetMap 构建",
        "real_criteria": "raw_exists",
        "proxy_flag": False,
        "safe_claim": "步行路网由 OSMnx 从 OpenStreetMap 实时提取并构建图结构。",
        "avoid_claim": "实地步行实测路网",
    },
    {
        "key": "accessibility",
        "label": "可达性分析",
        "stage": "模型计算",
        "processed_path": PROCESSED_DIR / "accessibility_summary.json",
        "upstream_source": "基于步行路网图的最短路径算法计算",
        "real_criteria": "processed_exists",
        "proxy_flag": False,
        "safe_claim": "可达性指标基于 OSM 真实路网的 Dijkstra 最短路径算法计算，非直线距离估算。",
        "avoid_claim": "实地步行实测到达时间",
    },
    {
        "key": "risk_model",
        "label": "热健康风险模型",
        "stage": "模型计算",
        "processed_path": PROCESSED_DIR / "risk_summary.json",
        "upstream_source": "多源数据融合的空间风险评估模型",
        "real_criteria": "processed_exists",
        "proxy_flag": False,
        "safe_claim": "风险模型基于真实气象、人口、可达性等多源数据的加权融合计算。",
        "avoid_claim": "流行病学实测发病率数据",
    },
    {
        "key": "recommendations",
        "label": "纳凉点推荐",
        "stage": "决策输出",
        "processed_path": PROCESSED_DIR / "site_recommendations.json",
        "upstream_source": "基于风险模型与可达性的优化选址算法",
        "real_criteria": "processed_exists",
        "proxy_flag": False,
        "safe_claim": "推荐点位由算法基于风险评估与可达性缺口自动生成，非人工指定。",
        "avoid_claim": "经政府审批的正式选址方案",
    },
]


def check_paths_exist(paths: list[Path] | None) -> bool:
    if not paths:
        return False
    return all(p.exists() for p in paths)


def audit_module(module_def: dict) -> dict:
    criteria = module_def.get("real_criteria", "processed_exists")
    upstream_is_real = False
    fallback_detected = False
    status = "unknown"
    current_data_level = "unavailable"

    if criteria == "raw_exists":
        raw_paths = module_def.get("raw_paths", [])
        if check_paths_exist(raw_paths):
            upstream_is_real = True
            status = "ok"
            current_data_level = "raw_upstream"
        else:
            fallback_detected = True
            status = "fallback"
            current_data_level = "missing_raw"
    elif criteria == "external_exists":
        external_paths = module_def.get("external_paths", [])
        if check_paths_exist(external_paths):
            upstream_is_real = True
            status = "ok"
            current_data_level = "external_dataset"
        else:
            fallback_detected = True
            status = "fallback"
            current_data_level = "missing_external"
    elif criteria == "processed_exists":
        processed_path = module_def.get("processed_path")
        if processed_path and processed_path.exists():
            upstream_is_real = True
            status = "ok"
            current_data_level = "processed_output"
        else:
            fallback_detected = True
            status = "fallback"
            current_data_level = "missing_processed"

    uses_proxy = module_def.get("proxy_flag", False)
    output_is_modeled = module_def.get("stage") in ("模型计算", "决策输出")

    if upstream_is_real:
        authenticity_label = "proxy_real" if uses_proxy else "real"
    else:
        authenticity_label = "fallback"

    return {
        "key": module_def["key"],
        "label": module_def["label"],
        "stage": module_def.get("stage", ""),
        "upstream_source": module_def.get("upstream_source", ""),
        "authenticity_label": authenticity_label,
        "status": status,
        "current_data_level": current_data_level,
        "upstream_is_real": upstream_is_real,
        "output_is_modeled": output_is_modeled,
        "uses_proxy": uses_proxy,
        "fallback_detected": fallback_detected,
        "safe_claim": module_def.get("safe_claim", ""),
        "avoid_claim": module_def.get("avoid_claim", ""),
        "proxy_note": module_def.get("proxy_note", ""),
    }


def build_summary(modules: list[dict]) -> dict:
    module_count = len(modules)
    upstream_real_count = sum(1 for m in modules if m["upstream_is_real"])
    proxy_count = sum(1 for m in modules if m["uses_proxy"])
    fallback_count = sum(1 for m in modules if m["fallback_detected"])

    return {
        "module_count": module_count,
        "upstream_real_count": upstream_real_count,
        "proxy_count": proxy_count,
        "fallback_count": fallback_count,
    }


def build_overall(modules: list[dict]) -> dict:
    all_real = all(m["upstream_is_real"] for m in modules)
    any_proxy = any(m["uses_proxy"] for m in modules)
    any_fallback = any(m["fallback_detected"] for m in modules)

    if all_real and not any_proxy:
        verdict_label = "全部真实上游数据"
        can_claim_all_data_real = True
        competition_safe_statement = (
            "本项目全部数据均来自公开真实数据源（政府公开信息、国际公开数据集、公开API），"
            "不包含人工编造或模拟数据。"
        )
    elif all_real and any_proxy:
        verdict_label = "真实上游数据（含代理变量）"
        can_claim_all_data_real = False
        competition_safe_statement = (
            "本项目全部数据均来自公开真实数据源，其中人口空间分布使用 WorldPop 模型估算产品"
            "作为代理变量，非人口普查精确数据。其余数据均为真实采集。"
        )
    elif any_fallback:
        verdict_label = "部分数据缺失或回退"
        can_claim_all_data_real = False
        competition_safe_statement = (
            "本项目多数数据来自公开真实数据源，但部分模块数据缺失或触发回退，"
            "详见真实性审计表。"
        )
    else:
        verdict_label = "待审计"
        can_claim_all_data_real = False
        competition_safe_statement = "数据真实性审计尚未完成，请运行完整数据管线后重新审计。"

    return {
        "verdict_label": verdict_label,
        "can_claim_all_data_real": can_claim_all_data_real,
        "competition_safe_statement": competition_safe_statement,
    }


def main() -> None:
    ensure_directories()

    modules = [audit_module(module_def) for module_def in MODULE_DEFINITIONS]
    summary = build_summary(modules)
    overall = build_overall(modules)

    payload = {
        "generated_at": current_timestamp(),
        "overall": overall,
        "summary": summary,
        "modules": modules,
    }

    write_json(OUTPUT_PATH, payload)
    print(f"数据真实性审计完成: {len(modules)} 个模块已检查。")


if __name__ == "__main__":
    main()
