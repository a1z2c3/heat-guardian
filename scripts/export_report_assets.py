from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from common import ROOT_DIR, PROCESSED_DIR, current_timestamp, read_json


OUTPUTS_DIR = ROOT_DIR / "outputs"
TABLE_DIR = OUTPUTS_DIR / "report_tables"
CHART_DIR = OUTPUTS_DIR / "report_charts"
DOCS_DIR = ROOT_DIR / "docs"
EXTERNAL_DIR = ROOT_DIR / "data" / "external"
COMPETITION_DOC_DIR = DOCS_DIR / "参赛文档"
SUBMISSION_META_PATH = ROOT_DIR / "config" / "submission_metadata.json"
DEFAULT_WORK_ID = "待填作品编号"
DEFAULT_WORK_NAME = "热龄卫士：基于多源时空数据的城市适老化热健康风险预警与避险服务调度平台"


def setup_matplotlib() -> None:
    plt.rcParams["font.sans-serif"] = [
        "Microsoft YaHei",
        "SimHei",
        "Noto Sans CJK SC",
        "Arial Unicode MS",
    ]
    plt.rcParams["axes.unicode_minus"] = False


def ensure_dirs() -> None:
    for path in (OUTPUTS_DIR, TABLE_DIR, CHART_DIR, DOCS_DIR, COMPETITION_DOC_DIR):
        path.mkdir(parents=True, exist_ok=True)


def load_submission_metadata() -> dict:
    metadata = read_json(SUBMISSION_META_PATH, {}) or {}
    return metadata if isinstance(metadata, dict) else {}


def resolve_work_id(metadata: dict) -> str:
    work_id = str(metadata.get("work_id", "")).strip()
    return work_id or DEFAULT_WORK_ID


def resolve_work_name(metadata: dict) -> str:
    work_name = str(metadata.get("work_name", "")).strip()
    return work_name or DEFAULT_WORK_NAME


def resolve_people(items: list | None) -> str:
    names = [str(item).strip() for item in (items or []) if str(item).strip()]
    return "、".join(names) if names else "待填"


def normalize_ai_records(metadata: dict) -> list[dict]:
    records = metadata.get("ai_tool_records", [])
    if not isinstance(records, list):
        return []
    return [item for item in records if isinstance(item, dict)]


def get_accessibility_scope(accessibility: dict, key: str) -> dict:
    scopes = accessibility.get("resource_scopes", {})
    if key in scopes:
        return scopes[key]
    return accessibility if key == "all_support_resources" else {}


def weather_profile_label(weather: dict) -> str:
    profile = weather.get("analysis_profile", {})
    profile_type = profile.get("profile_type") or weather.get("default_risk_profile")
    if profile_type == "historical_heatwave_case":
        return "真实历史热浪案例"
    if profile_type == "forecast":
        return "未来72小时实时预报"
    return profile_type or "未标注"


def strategy_label(strategy: str | None) -> str:
    mapping = {
        "mclp_capacity_readiness_fairness_hybrid": "覆盖优先 + 容量/开放时段/适配度/公平性增强",
        "mclp_coverage_time_hybrid": "覆盖优先 + 时间优化补位",
        "mclp_distance_proxy": "距离代理下的混合选址",
    }
    return mapping.get(strategy or "", strategy or "未标注")


def format_window(start_time: str | None, end_time: str | None) -> str:
    if not start_time or not end_time:
        return "未提供"
    return f"{start_time} 至 {end_time}"


def export_authenticity_table(authenticity_audit: dict) -> None:
    rows = []
    for item in authenticity_audit.get("modules", []):
        rows.append(
            {
                "label": item.get("label"),
                "stage": item.get("stage"),
                "authenticity_label": item.get("authenticity_label"),
                "status": item.get("status"),
                "current_data_level": item.get("current_data_level"),
                "upstream_is_real": item.get("upstream_is_real"),
                "output_is_modeled": item.get("output_is_modeled"),
                "uses_proxy": item.get("uses_proxy"),
                "fallback_detected": item.get("fallback_detected"),
                "safe_claim": item.get("safe_claim"),
                "avoid_claim": item.get("avoid_claim"),
            }
        )

    table = pd.DataFrame(rows)
    if not table.empty:
        table.to_csv(TABLE_DIR / "数据真实性审计表.csv", index=False, encoding="utf-8-sig")


def export_tables(
    weather: dict,
    optimization: dict,
    risk_summary: dict,
    recommendations: dict,
    accessibility: dict,
    competition_experiments: dict,
    official_cooling: dict,
    source_refresh_manifest: dict,
    authenticity_audit: dict,
) -> dict:
    baseline = optimization.get("baseline_metrics", {})
    scenarios = optimization.get("scenarios", [])
    all_access = get_accessibility_scope(accessibility, "all_support_resources")
    active_access = get_accessibility_scope(accessibility, "existing_active_cooling_resources")
    analysis_profile = weather.get("analysis_profile", {})

    scenario_rows = [
        {
            "方案": "基线",
            "新增点位数": 0,
            "覆盖老年人口": baseline.get("covered_population", 0),
            "人口覆盖率": baseline.get("coverage_rate_population", 0),
            "加权覆盖率": baseline.get("coverage_rate_weight", 0),
            "未覆盖老年人口": baseline.get("uncovered_population", 0),
            "平均到达时间_分钟": baseline.get("average_travel_minutes", 0),
            "新增覆盖人口": baseline.get("coverage_improvement_population", 0),
        }
    ]

    for scenario in scenarios:
        metrics = scenario["metrics"]
        scenario_rows.append(
            {
                "方案": f"新增{scenario['new_site_count']}点",
                "新增点位数": scenario["new_site_count"],
                "覆盖老年人口": metrics["covered_population"],
                "人口覆盖率": metrics["coverage_rate_population"],
                "加权覆盖率": metrics["coverage_rate_weight"],
                "未覆盖老年人口": metrics["uncovered_population"],
                "平均到达时间_分钟": metrics["average_travel_minutes"],
                "新增覆盖人口": metrics["coverage_improvement_population"],
            }
        )

    scenario_df = pd.DataFrame(scenario_rows)
    scenario_df.to_csv(TABLE_DIR / "选址优化情景对比.csv", index=False, encoding="utf-8-sig")

    district_df = pd.DataFrame(risk_summary.get("districts", []))
    district_df.to_csv(TABLE_DIR / "街区风险排行.csv", index=False, encoding="utf-8-sig")

    recommendation_df = pd.DataFrame(recommendations.get("recommendations", []))
    if not recommendation_df.empty and "display_name" in recommendation_df.columns:
        if "name" in recommendation_df.columns:
            recommendation_df["name"] = recommendation_df["display_name"].fillna(recommendation_df["name"])
        else:
            recommendation_df["name"] = recommendation_df["display_name"]
    recommendation_df.to_csv(TABLE_DIR / "默认推荐点位.csv", index=False, encoding="utf-8-sig")
    recommendation_ops_df = pd.DataFrame(
        [
            {
                "名称": item.get("name"),
                "城区": item.get("district"),
                "类型": item.get("category_label"),
                "避暑模式": item.get("refuge_mode_label"),
                "容量代理_单位": item.get("capacity_units"),
                "开放时段代理": item.get("service_window_score"),
                "开放性代理": item.get("access_openness_score"),
                "片区优先度": item.get("district_priority_score"),
                "运行适配度": item.get("operational_suitability"),
                "选择理由": item.get("selection_reason"),
            }
            for item in recommendations.get("recommendations", [])
        ]
    )
    if not recommendation_ops_df.empty:
        recommendation_ops_df.iloc[:, 0] = [
            item.get("display_name", item.get("name")) for item in recommendations.get("recommendations", [])
        ]
        recommendation_ops_df.to_csv(TABLE_DIR / "推荐点位运行代理指标.csv", index=False, encoding="utf-8-sig")

    accessibility_df = pd.DataFrame(
        [
            {
                "资源口径": all_access.get("scope_label", "全部支撑资源"),
                "指标": "5分钟覆盖率",
                "数值": all_access.get("coverage_5min_rate", 0),
            },
            {
                "资源口径": all_access.get("scope_label", "全部支撑资源"),
                "指标": "10分钟覆盖率",
                "数值": all_access.get("coverage_10min_rate", 0),
            },
            {
                "资源口径": all_access.get("scope_label", "全部支撑资源"),
                "指标": "15分钟覆盖率",
                "数值": all_access.get("coverage_15min_rate", 0),
            },
            {
                "资源口径": all_access.get("scope_label", "全部支撑资源"),
                "指标": "平均到达时间_分钟",
                "数值": all_access.get("average_nearest_walk_minutes", 0),
            },
            {
                "资源口径": active_access.get("scope_label", "既有主动避暑资源"),
                "指标": "5分钟覆盖率",
                "数值": active_access.get("coverage_5min_rate", 0),
            },
            {
                "资源口径": active_access.get("scope_label", "既有主动避暑资源"),
                "指标": "10分钟覆盖率",
                "数值": active_access.get("coverage_10min_rate", 0),
            },
            {
                "资源口径": active_access.get("scope_label", "既有主动避暑资源"),
                "指标": "15分钟覆盖率",
                "数值": active_access.get("coverage_15min_rate", 0),
            },
            {
                "资源口径": active_access.get("scope_label", "既有主动避暑资源"),
                "指标": "平均到达时间_分钟",
                "数值": active_access.get("average_nearest_walk_minutes", 0),
            },
        ]
    )
    accessibility_df.to_csv(TABLE_DIR / "可达性摘要.csv", index=False, encoding="utf-8-sig")

    weather_context_df = pd.DataFrame(
        [
            {
                "维度": "当前24小时最高温",
                "数值": weather.get("forecast", {}).get("next_24h_max_temperature", weather.get("next_24h_max_temperature")),
            },
            {
                "维度": "当前72小时最高体感温度",
                "数值": weather.get("forecast", {}).get(
                    "next_72h_max_apparent_temperature",
                    weather.get("next_72h_max_apparent_temperature"),
                ),
            },
            {
                "维度": "默认风险分析场景",
                "数值": weather_profile_label(weather),
            },
            {
                "维度": "风险分析窗口",
                "数值": format_window(analysis_profile.get("start_time"), analysis_profile.get("end_time")),
            },
            {
                "维度": "历史热浪案例峰值体感温度",
                "数值": weather.get("historical_heatwave_case", {}).get("max_apparent_temperature"),
            },
        ]
    )
    weather_context_df.to_csv(TABLE_DIR / "天气分析场景摘要.csv", index=False, encoding="utf-8-sig")

    scope_df = pd.DataFrame(
        [
            {
                "资源口径": all_access.get("scope_label", "全部支撑资源"),
                "资源数量": all_access.get("resource_count", 0),
                "15分钟覆盖率": all_access.get("coverage_15min_rate", 0),
                "平均到达时间_分钟": all_access.get("average_nearest_walk_minutes", 0),
                "类别": " / ".join(all_access.get("category_labels", [])),
            },
            {
                "资源口径": active_access.get("scope_label", "既有主动避暑资源"),
                "资源数量": active_access.get("resource_count", 0),
                "15分钟覆盖率": active_access.get("coverage_15min_rate", 0),
                "平均到达时间_分钟": active_access.get("average_nearest_walk_minutes", 0),
                "类别": " / ".join(active_access.get("category_labels", [])),
            },
        ]
    )
    scope_df.to_csv(TABLE_DIR / "资源口径说明.csv", index=False, encoding="utf-8-sig")

    risk_validation_df = pd.DataFrame(
        competition_experiments.get("risk_model_validation", {}).get("variants", [])
    )
    if not risk_validation_df.empty:
        risk_validation_df.to_csv(TABLE_DIR / "风险模型验证.csv", index=False, encoding="utf-8-sig")

    accessibility_comparison = competition_experiments.get("accessibility_algorithm_comparison", {})
    accessibility_compare_df = pd.DataFrame(
        [
            {
                "方法": "真实步行路网",
                "平均到达时间_分钟": accessibility_comparison.get("network", {}).get("average_nearest_walk_minutes", 0),
                "5分钟覆盖率": accessibility_comparison.get("network", {}).get("coverage_5min_rate", 0),
                "10分钟覆盖率": accessibility_comparison.get("network", {}).get("coverage_10min_rate", 0),
                "15分钟覆盖率": accessibility_comparison.get("network", {}).get("coverage_15min_rate", 0),
                "高风险网格15分钟覆盖数": accessibility_comparison.get("network", {}).get("high_risk_covered_cells", 0),
            },
            {
                "方法": "距离代理法",
                "平均到达时间_分钟": accessibility_comparison.get("distance_proxy", {}).get("average_nearest_walk_minutes", 0),
                "5分钟覆盖率": accessibility_comparison.get("distance_proxy", {}).get("coverage_5min_rate", 0),
                "10分钟覆盖率": accessibility_comparison.get("distance_proxy", {}).get("coverage_10min_rate", 0),
                "15分钟覆盖率": accessibility_comparison.get("distance_proxy", {}).get("coverage_15min_rate", 0),
                "高风险网格15分钟覆盖数": accessibility_comparison.get("distance_proxy", {}).get("high_risk_covered_cells", 0),
            },
        ]
    )
    accessibility_compare_df.to_csv(TABLE_DIR / "可达性算法对比.csv", index=False, encoding="utf-8-sig")

    accessibility_error_df = pd.DataFrame(
        [
            {
                "指标": "平均绝对误差_分钟",
                "数值": accessibility_comparison.get("mean_abs_error_minutes", 0),
            },
            {
                "指标": "RMSE_分钟",
                "数值": accessibility_comparison.get("rmse_minutes", 0),
            },
            {
                "指标": "距离代理高估网格数",
                "数值": accessibility_comparison.get("optimistic_misclassified_cells", 0),
            },
            {
                "指标": "距离代理低估网格数",
                "数值": accessibility_comparison.get("conservative_misclassified_cells", 0),
            },
        ]
    )
    accessibility_error_df.to_csv(TABLE_DIR / "可达性误差摘要.csv", index=False, encoding="utf-8-sig")

    ablation_df = pd.DataFrame(
        competition_experiments.get("ablation_validation", {}).get("modules", [])
    )
    if not ablation_df.empty:
        ablation_df.to_csv(TABLE_DIR / "模块消融实验.csv", index=False, encoding="utf-8-sig")

    official_site_df = pd.DataFrame(
        [
            {
                "名称": item.get("name"),
                "城区": item.get("district"),
                "类型": item.get("site_type_label"),
                "地址": item.get("official_address"),
                "开放说明": item.get("opening_hours"),
                "定位精度": item.get("location_accuracy"),
                "原文核验状态": item.get("verification_status_label"),
                "原文摘录": item.get("source_excerpt_preview"),
                "来源": item.get("source_org"),
                "来源日期": item.get("source_published_at"),
                "官方原文链接": item.get("operational_source_url"),
                "定位来源链接": item.get("location_source_url"),
            }
            for item in official_cooling.get("sites", [])
        ]
    )
    if not official_site_df.empty:
        official_site_df.to_csv(TABLE_DIR / "官方纳凉点位.csv", index=False, encoding="utf-8-sig")

    official_bulletin_df = pd.DataFrame(
        [
            {
                "标题": item.get("title"),
                "来源单位": item.get("source_org"),
                "发布日期": item.get("published_at"),
                "通报点位数": item.get("metrics", {}).get("reported_cooling_point_count"),
                "链接": item.get("url"),
            }
            for item in official_cooling.get("bulletins", [])
        ]
    )
    if not official_bulletin_df.empty:
        official_bulletin_df.to_csv(TABLE_DIR / "官方纳凉通报摘要.csv", index=False, encoding="utf-8-sig")

    worldpop_manifest = source_refresh_manifest.get("worldpop", {})
    geofabrik_manifest = source_refresh_manifest.get("geofabrik", {})
    source_refresh_rows = [
        {
            "数据源": "Open-Meteo 风险分析摘要",
            "状态": "generated",
            "最近检查/生成时间": weather.get("generated_at"),
            "远端更新时间": None,
            "说明": weather_profile_label(weather),
            "链接": "https://open-meteo.com/",
        },
        {
            "数据源": "武汉官方纳凉通报",
            "状态": f"监测 {official_cooling.get('monitored_source_count', 0)} 个页面",
            "最近检查/生成时间": official_cooling.get("generated_at"),
            "远端更新时间": None,
            "说明": f"研究区可定位点位 {len(official_cooling.get('sites', []))} 个",
            "链接": "https://www.wuhan.gov.cn/",
        },
        {
            "数据源": "WorldPop 老年人口栅格",
            "状态": worldpop_manifest.get("status"),
            "最近检查/生成时间": worldpop_manifest.get("checked_at"),
            "远端更新时间": (worldpop_manifest.get("files", {}).get("age65", {}).get("remote") or {}).get("last_modified"),
            "说明": f"{worldpop_manifest.get('data_year', '未知')} / {worldpop_manifest.get('release', '未知')}",
            "链接": ((worldpop_manifest.get("files", {}).get("age65", {}).get("download") or {}).get("url")),
        },
        {
            "数据源": "Geofabrik 湖北路网",
            "状态": geofabrik_manifest.get("status"),
            "最近检查/生成时间": geofabrik_manifest.get("checked_at"),
            "远端更新时间": (geofabrik_manifest.get("remote") or {}).get("last_modified"),
            "说明": "hubei-latest-free.shp.zip",
            "链接": geofabrik_manifest.get("source_url"),
        },
    ]
    source_refresh_df = pd.DataFrame(source_refresh_rows)
    source_refresh_df.to_csv(TABLE_DIR / "数据源刷新状态.csv", index=False, encoding="utf-8-sig")

    return {
        "scenario_df": scenario_df,
        "district_df": district_df,
        "recommendation_df": recommendation_df,
        "recommendation_ops_df": recommendation_ops_df,
        "accessibility_df": accessibility_df,
        "weather_context_df": weather_context_df,
        "scope_df": scope_df,
        "risk_validation_df": risk_validation_df,
        "accessibility_compare_df": accessibility_compare_df,
        "accessibility_error_df": accessibility_error_df,
        "ablation_df": ablation_df,
        "official_site_df": official_site_df,
        "official_bulletin_df": official_bulletin_df,
        "source_refresh_df": source_refresh_df,
    }


def save_bar_chart(categories, values, title: str, ylabel: str, filename: str, color: str = "#4ea1ff") -> None:
    plt.figure(figsize=(10, 6))
    bars = plt.bar(categories, values, color=color, edgecolor="#244a7c")
    plt.title(title)
    plt.ylabel(ylabel)
    plt.grid(axis="y", linestyle="--", alpha=0.25)
    for bar, value in zip(bars, values):
        plt.text(bar.get_x() + bar.get_width() / 2, bar.get_height(), f"{value:.2f}" if isinstance(value, float) else f"{value}",
                 ha="center", va="bottom", fontsize=10)
    plt.tight_layout()
    plt.savefig(CHART_DIR / filename, dpi=200)
    plt.close()


def save_horizontal_bar(labels, values, title: str, xlabel: str, filename: str, color: str = "#6dd5a3") -> None:
    plt.figure(figsize=(10, 6))
    plt.barh(labels, values, color=color, edgecolor="#2f7a5e")
    plt.title(title)
    plt.xlabel(xlabel)
    plt.grid(axis="x", linestyle="--", alpha=0.25)
    plt.tight_layout()
    plt.savefig(CHART_DIR / filename, dpi=200)
    plt.close()


def export_charts(tables: dict, optimization: dict, accessibility: dict, competition_experiments: dict) -> None:
    scenario_df = tables["scenario_df"]
    district_df = tables["district_df"]
    all_access = get_accessibility_scope(accessibility, "all_support_resources")
    active_access = get_accessibility_scope(accessibility, "existing_active_cooling_resources")

    save_bar_chart(
        scenario_df["方案"].tolist(),
        (scenario_df["人口覆盖率"] * 100).tolist(),
        "新增点位情景下的高风险老年人口覆盖率",
        "覆盖率 (%)",
        "01_人口覆盖率对比.png",
        color="#4ea1ff",
    )
    save_bar_chart(
        scenario_df["方案"].tolist(),
        scenario_df["平均到达时间_分钟"].tolist(),
        "新增点位情景下的平均到达时间对比",
        "分钟",
        "02_平均到达时间对比.png",
        color="#ff9e57",
    )
    save_bar_chart(
        scenario_df["方案"].tolist(),
        scenario_df["新增覆盖人口"].tolist(),
        "新增点位情景下的新增覆盖人口对比",
        "人数",
        "03_新增覆盖人口对比.png",
        color="#8e7dff",
    )
    save_horizontal_bar(
        district_df["district"].tolist(),
        district_df["average_risk"].tolist(),
        "街区平均风险排行",
        "平均风险分数",
        "04_街区平均风险排行.png",
        color="#6dd5a3",
    )
    save_bar_chart(
        ["5分钟", "10分钟", "15分钟"],
        [
            all_access.get("coverage_5min_rate", 0) * 100,
            all_access.get("coverage_10min_rate", 0) * 100,
            all_access.get("coverage_15min_rate", 0) * 100,
        ],
        "全部支撑资源可达性覆盖率",
        "覆盖率 (%)",
        "05_可达性覆盖率.png",
        color="#e56b6f",
    )

    risk_validation_df = tables.get("risk_validation_df")
    if risk_validation_df is not None and not risk_validation_df.empty:
        save_bar_chart(
            risk_validation_df["name"].tolist(),
            risk_validation_df["elderly_population_sum"].tolist(),
            "不同风险模型对高龄暴露人口的捕获能力",
            "老年人口数量",
            "06_风险模型验证.png",
            color="#4ecdc4",
        )

    accessibility_compare_df = tables.get("accessibility_compare_df")
    if accessibility_compare_df is not None and not accessibility_compare_df.empty:
        save_bar_chart(
            accessibility_compare_df["方法"].tolist(),
            accessibility_compare_df["平均到达时间_分钟"].tolist(),
            "真实路网与距离代理的平均到达时间对比",
            "分钟",
            "07_可达性算法对比.png",
            color="#f6bd60",
        )

    ablation_df = tables.get("ablation_df")
    if ablation_df is not None and not ablation_df.empty:
        labels = [f"{row['module']} / {row['metric']}" for _, row in ablation_df.iterrows()]
        values = ablation_df["delta"].tolist()
        save_horizontal_bar(
            labels,
            values,
            "关键模块消融效应",
            "Full - Ablation",
            "08_模块消融实验.png",
            color="#84a59d",
        )

    save_bar_chart(
        [
            all_access.get("scope_label", "全部支撑资源"),
            active_access.get("scope_label", "既有主动避暑资源"),
        ],
        [
            all_access.get("coverage_15min_rate", 0) * 100,
            active_access.get("coverage_15min_rate", 0) * 100,
        ],
        "不同资源口径下的15分钟覆盖率对比",
        "覆盖率 (%)",
        "09_资源口径对比.png",
        color="#39d0ba",
    )


def build_report_draft(
    weather: dict,
    risk_summary: dict,
    accessibility: dict,
    optimization: dict,
    recommendations: dict,
    population: dict,
    graph_status: dict,
    competition_experiments: dict,
    official_cooling: dict,
    source_refresh_manifest: dict,
    authenticity_audit: dict,
) -> None:
    districts = risk_summary.get("districts", [])
    top_district = districts[0]["district"] if districts else "待补充"
    top_district_risk = districts[0]["average_risk"] if districts else 0
    baseline = optimization.get("baseline_metrics", {})
    scenarios = optimization.get("scenarios", [])
    scenario5 = next((item for item in scenarios if item["new_site_count"] == 5), None)
    scenario8 = next((item for item in scenarios if item["new_site_count"] == 8), None)
    population_level = population.get("data_level", "unknown")
    population_source = population.get("source", "unknown")
    network_source = graph_status.get("source", accessibility.get("data_level", "unknown"))
    strategy = optimization.get("strategy", "unknown")
    reachable_cells = optimization.get("coverage_reachable_high_risk_cell_count", 0)
    total_high_risk_cells = optimization.get("high_risk_cell_count", risk_summary.get("high_risk_cells", 0))
    risk_validation = competition_experiments.get("risk_model_validation", {})
    accessibility_comparison = competition_experiments.get("accessibility_algorithm_comparison", {})
    ablation_validation = competition_experiments.get("ablation_validation", {})
    risk_variants = {item["key"]: item for item in risk_validation.get("variants", [])}
    full_variant = risk_variants.get("full_model_score", {})
    temp_variant = risk_variants.get("temperature_humidity_score", {})
    ablation_modules = ablation_validation.get("modules", [])

    forecast = weather.get("forecast", {})
    analysis_profile = weather.get("analysis_profile", {})
    historical_case = weather.get("historical_heatwave_case", {})
    all_access = get_accessibility_scope(accessibility, "all_support_resources")
    active_access = get_accessibility_scope(accessibility, "existing_active_cooling_resources")
    baseline_scope = optimization.get("baseline_scope", active_access)
    official_scope = get_accessibility_scope(accessibility, "official_operational_cooling_sites")
    worldpop_manifest = source_refresh_manifest.get("worldpop", {})
    geofabrik_manifest = source_refresh_manifest.get("geofabrik", {})
    authenticity_overall = authenticity_audit.get("overall", {})
    authenticity_summary = authenticity_audit.get("summary", {})
    authenticity_modules = authenticity_audit.get("modules", [])

    recommendation_lines = []
    for index, site in enumerate(recommendations.get("recommendations", []), start=1):
        recommendation_lines.append(
            f"{index}. `{site.get('name', site.get('poi_id'))}`：新增覆盖高风险老年人口 `{site.get('covered_elderly_population', 0)}` 人，"
            f"直接补盲 `{site.get('covered_cells', 0)}` 个网格，并改善 `{site.get('improved_cells', 0)}` 个网格的到达时间；"
            f"运行适配度 `{site.get('operational_suitability', '--')}`，选择理由：{site.get('selection_reason', '综合补位')}。"
        )
    recommendation_text = "\n".join(recommendation_lines) if recommendation_lines else "待补充推荐点位。"

    display_recommendation_lines = []
    for index, site in enumerate(recommendations.get("recommendations", []), start=1):
        site_name = site.get("display_name", site.get("name", site.get("poi_id")))
        display_recommendation_lines.append(
            f"{index}. `{site_name}`：新增覆盖高风险老年人口 `{site.get('covered_elderly_population', 0)}` 人，"
            f"直接补盲 `{site.get('covered_cells', 0)}` 个网格，并改善 `{site.get('improved_cells', 0)}` 个网格的到达时间；"
            f"运行适配度 `{site.get('operational_suitability', '--')}`，选择理由：{site.get('selection_reason', '综合补位')}。"
        )
    if display_recommendation_lines:
        recommendation_text = "\n".join(display_recommendation_lines)

    ablation_lines = "\n".join(
        f"- `{item['module']}` 的 `{item['metric']}` 从 `{item['ablated_value']}` 变化到 `{item['full_value']}`，差值 `{item['delta']}`。{item['interpretation']}"
        for item in ablation_modules
    ) or "- 待补充消融实验结果。"

    authenticity_lines = "\n".join(
        f"- `{item.get('label', '--')}`：{item.get('safe_claim', '--')}"
        for item in authenticity_modules
    ) or "- 暂无真实性审计模块输出。"

    authenticity_section = f"""
### 2.5 数据真实性审计

- 总体结论：`{authenticity_overall.get('verdict_label', '--')}`
- 是否可以宣称“全部数据都是真实原始实测”：`{authenticity_overall.get('can_claim_all_data_real', False)}`
- 安全表述：{authenticity_overall.get('competition_safe_statement', '--')}
- 模块统计：上游真实 `{authenticity_summary.get('upstream_real_count', 0)}` / `{authenticity_summary.get('module_count', 0)}`，代理变量 `{authenticity_summary.get('proxy_count', 0)}`，回退模块 `{authenticity_summary.get('fallback_count', 0)}`

{authenticity_lines}
"""

    report = f"""# 《热龄卫士》研究报告

## 1. 项目目标

《热龄卫士》面向武汉主城区的街道、社区与卫健部门，解决三个连续问题：哪里存在高温下的老年脆弱区、现有资源能否在步行阈值内提供支撑、有限新增临时纳凉点应该优先落在哪些位置。

## 2. 数据来源与真实性说明

### 2.1 多源数据来源

- 天气监测：`Open-Meteo Forecast API`
- 历史热浪案例：`Open-Meteo Archive API`
- 老年人口：`WorldPop` 老年人口栅格最新可用版本，数据级别 `{population_level}`，来源 `{population_source}`
- POI 资源：`OpenStreetMap / Overpass API`
- 官方纳凉点与运行通报：`武汉市政府 / 武汉市民政局 / 武汉市国防动员办公室` 公开页面
- 步行路网与空间代理：`Geofabrik` 湖北省 OSM 路网与建筑/土地利用图层，路网来源 `{network_source}`

### 2.2 风险分析场景口径

- 当前监测窗口：未来 72 小时预报，24 小时最高温 `{forecast.get('next_24h_max_temperature', weather.get('next_24h_max_temperature', 0))}`℃，72 小时最高体感温度 `{forecast.get('next_72h_max_apparent_temperature', weather.get('next_72h_max_apparent_temperature', 0))}`℃
- 默认风险分析场景：`{weather_profile_label(weather)}`
- 风险分析说明：{weather.get('risk_context_label', '未提供')}
- 当前默认分析窗口：`{format_window(analysis_profile.get('start_time'), analysis_profile.get('end_time'))}`
- 历史热浪案例窗口：`{format_window(historical_case.get('start_time'), historical_case.get('end_time'))}`
- 历史热浪案例峰值体感温度：`{historical_case.get('max_apparent_temperature', 0)}`℃
- 历史热浪案例平均体感温度：`{historical_case.get('mean_apparent_temperature', 0)}`℃
- 历史热浪案例夜间最低体感温度：`{historical_case.get('night_min_apparent_temperature', 0)}`℃

这意味着：如果当前预报并未形成热浪，本项目不会人为抬高实时温度，而是显式切换到武汉最近完成夏季中识别出的真实 72 小时热浪窗口，用于风险推演与选址仿真。

### 2.3 资源口径拆分

- `{all_access.get('scope_label', '全部支撑资源')}`：用于展示城市整体支撑能力，包含 `{", ".join(all_access.get('category_labels', []))}`，当前共 `{all_access.get('resource_count', 0)}` 个点位，15 分钟覆盖率 `{round(all_access.get('coverage_15min_rate', 0) * 100, 2)}%`
- `{active_access.get('scope_label', '既有主动避暑资源')}`：用于作为优化基线，包含 `{", ".join(active_access.get('category_labels', []))}`，当前共 `{active_access.get('resource_count', 0)}` 个点位，15 分钟覆盖率 `{round(active_access.get('coverage_15min_rate', 0) * 100, 2)}%`
- `{official_scope.get('scope_label', '官方公开在运纳凉点')}`：当前研究区内已校准点位 `{official_scope.get('resource_count', 0)}` 个；全市官方通报口径为 `{official_cooling.get('reported_citywide_cooling_point_count', '未提取')}` 个

因此，项目首页展示的是“全部支撑资源”的城市资源盘点，而优化基线严格采用“既有主动避暑资源”，两者口径已显式区分。

### 2.4 自动刷新与来源追踪

- `WorldPop`：当前检测到 `{worldpop_manifest.get('data_year', '未知')}` 年版本，发布批次 `{worldpop_manifest.get('release', '未知')}`，最近检查时间 `{worldpop_manifest.get('checked_at', '未记录')}`
- `Geofabrik`：最近检查时间 `{geofabrik_manifest.get('checked_at', '未记录')}`，远端文件时间 `{(geofabrik_manifest.get('remote') or {}).get('last_modified', '未记录')}`
- 官方纳凉点通报：最近刷新时间 `{official_cooling.get('generated_at', '未记录')}`，已监测页面 `{official_cooling.get('monitored_source_count', 0)}` 个，原文核验通过 `{official_cooling.get('summary', {}).get('verified_site_count', 0)}` 个
- 网站前端“证据链”面板与 `GET /api/data-sources` 接口同步展示上述刷新状态，用于答辩时直接说明数据并非静态演示页。

## 3. 方法设计

### 3.1 风险识别模型

项目不再使用人为抬温的 demo 逻辑，而是基于真实天气场景与本地空间代理建模：

1. 以实时预报或真实历史热浪案例作为区域热负荷基准；
2. 以 `WorldPop` 老年人口栅格刻画暴露群体；
3. 以 `Geofabrik` 建筑面、道路与土地利用生成局地热岛/降温代理；
4. 将 `{all_access.get('scope_label', '全部支撑资源')}` 与 `{active_access.get('scope_label', '既有主动避暑资源')}` 的步行可达性组合进风险分数。

### 3.2 可达性与选址模型

- 可达性模型：优先采用真实步行路网，若路网不可得才退化到距离代理
- 选址策略：`{strategy_label(strategy)}`
- 优化基线口径：`{baseline_scope.get('scope_label', '既有主动避暑资源')}`
- 候选点来源：公园与图书馆等可转化公共资源
- 运行约束增强：在覆盖收益之外，引入 `容量代理`、`开放时段代理`、`室内/绿地避暑适配度` 与 `高风险片区优先度`
- 解释口径：上述容量与开放时段均为基于设施类型、名称与公开字段构建的相对代理，用于提升方案现实性，而非替代后续实地核验

## 4. 核心结果

### 4.1 风险识别结果

- 总网格数：`{risk_summary.get('total_cells', 0)}`
- 高风险网格数：`{risk_summary.get('high_risk_cells', 0)}`
- 平均风险分数：`{risk_summary.get('average_risk', 0)}`
- 当前最高风险城区：`{top_district}`，平均风险分数 `{top_district_risk}`

### 4.2 可达性诊断结果

- `{all_access.get('scope_label', '全部支撑资源')}` 15 分钟覆盖率：`{round(all_access.get('coverage_15min_rate', 0) * 100, 2)}%`，平均到达时间 `{all_access.get('average_nearest_walk_minutes', 0)}` 分钟
- `{active_access.get('scope_label', '既有主动避暑资源')}` 15 分钟覆盖率：`{round(active_access.get('coverage_15min_rate', 0) * 100, 2)}%`，平均到达时间 `{active_access.get('average_nearest_walk_minutes', 0)}` 分钟

### 4.3 选址优化结果

基线状态下，仅考虑 `{baseline_scope.get('scope_label', '既有主动避暑资源')}`：

- 覆盖高风险老年人口：`{baseline.get('covered_population', 0)}` 人
- 人口覆盖率：`{round(baseline.get('coverage_rate_population', 0) * 100, 2)}%`
- 平均到达时间：`{baseline.get('average_travel_minutes', 0)}` 分钟

当前共有 `{total_high_risk_cells}` 个高风险网格，其中 `{reachable_cells}` 个可在 15 分钟阈值内通过候选点实现新增覆盖。

#### 新增 5 个点位方案

{f"- 覆盖率提升至 `{round(scenario5['metrics']['coverage_rate_population'] * 100, 2)}%`\n- 新增覆盖高风险老年人口 `{scenario5['metrics']['coverage_improvement_population']}` 人\n- 平均到达时间下降到 `{scenario5['metrics']['average_travel_minutes']}` 分钟" if scenario5 else "- 待补充 5 点方案结果"}

#### 新增 8 个点位方案

{f"- 覆盖率提升至 `{round(scenario8['metrics']['coverage_rate_population'] * 100, 2)}%`\n- 新增覆盖高风险老年人口 `{scenario8['metrics']['coverage_improvement_population']}` 人\n- 平均到达时间下降到 `{scenario8['metrics']['average_travel_minutes']}` 分钟" if scenario8 else "- 待补充 8 点方案结果"}

## 5. 实验验证

### 5.1 风险模型验证

- 在相同 Top`{risk_validation.get('top_cell_count', 0)}` 网格规模下，完整模型捕获老年人口 `{full_variant.get('elderly_population_sum', 0)}` 人
- 若仅采用“温度+体感温度”，捕获老年人口 `{temp_variant.get('elderly_population_sum', 0)}` 人
- 完整模型额外识别高龄暴露人口 `{full_variant.get('elderly_population_sum', 0) - temp_variant.get('elderly_population_sum', 0)}` 人

### 5.2 可达性算法验证

- 真实步行路网平均到达时间：`{accessibility_comparison.get('network', {}).get('average_nearest_walk_minutes', 0)}` 分钟
- 距离代理平均到达时间：`{accessibility_comparison.get('distance_proxy', {}).get('average_nearest_walk_minutes', 0)}` 分钟
- 平均绝对误差：`{accessibility_comparison.get('mean_abs_error_minutes', 0)}` 分钟
- RMSE：`{accessibility_comparison.get('rmse_minutes', 0)}` 分钟
- 过度乐观误判网格：`{accessibility_comparison.get('optimistic_misclassified_cells', 0)}` 个

### 5.3 消融实验

{ablation_lines}

## 6. 推荐点位

默认展示方案的推荐结果如下：

{recommendation_text}

## 7. 结论与局限

### 7.1 主要结论

1. 武汉主城区高温脆弱性具有明显空间分异，`{top_district}` 是当前最需优先关注的城区。
2. 将老年人口暴露、真实步行路网与局地空间代理纳入后，模型比单纯看热暴露更能识别“热 + 老 + 难到达”的复合脆弱区。
3. 全部支撑资源与既有主动避暑资源之间存在明显覆盖差距，这一差距正是新增临时纳凉点的决策切入点。
4. 少量新增候选点即可显著提升高风险老年人口覆盖率，并压缩平均到达时间。

### 7.2 局限性

1. 当前候选点仍主要来自公园与图书馆，后续可继续补充文化站、社区驿站等可转化场所。
2. 选址模型已纳入容量、开放时段与避暑适配度的相对代理，但仍不是实测容量、实测开放时长和空调负荷数据，正式落地前仍需街道与场馆逐点核验。
3. 风险模型虽已移除人为抬温，但仍可继续叠加更细粒度的建筑材料、树荫与独居老人数据。
"""

    report = report.replace("## 3. ", f"{authenticity_section}\n## 3. ", 1)

    (DOCS_DIR / "研究报告-热龄卫士.md").write_text(report, encoding="utf-8")


def build_demo_script(
    weather: dict,
    risk_summary: dict,
    accessibility: dict,
    optimization: dict,
    recommendations: dict,
) -> None:
    forecast = weather.get("forecast", {})
    analysis_profile = weather.get("analysis_profile", {})
    all_access = get_accessibility_scope(accessibility, "all_support_resources")
    active_access = get_accessibility_scope(accessibility, "existing_active_cooling_resources")
    scenario3 = next((item for item in optimization.get("scenarios", []) if item.get("new_site_count") == 3), None)
    scenario5 = next((item for item in optimization.get("scenarios", []) if item.get("new_site_count") == 5), None)
    scenario8 = next((item for item in optimization.get("scenarios", []) if item.get("new_site_count") == 8), None)
    top_sites = recommendations.get("recommendations", [])[:3]
    top_site_names = "、".join(
        site.get("display_name", site.get("name", "--"))
        for site in top_sites
        if site.get("display_name") or site.get("name")
    ) or "待补充重点候选点"
    total_high_risk_cells = optimization.get("high_risk_cell_count", risk_summary.get("high_risk_cells", 0))
    reachable_cells = optimization.get("coverage_reachable_high_risk_cell_count", 0)

    script = f"""# 演示脚本

## 1. 开场

“本项目叫热龄卫士，面向武汉主城区高温风险治理场景，解决三个连续问题：哪些老年人最危险、现有避险资源够不够、有限新增点位应该放在哪里最有效。当前系统默认以`{weather_profile_label(weather)}`作为风险推演场景，避免在非高温日靠人为抬温凑演示效果。”

## 2. 展示风险识别

1. 打开首页。
2. 说明当前实时温度 `{forecast.get('current_temperature', weather.get('current_temperature', 0))}`℃、未来 24 小时最高温 `{forecast.get('next_24h_max_temperature', weather.get('next_24h_max_temperature', 0))}`℃、当前高风险网格 `{risk_summary.get('high_risk_cells', 0)}` 个。
3. 说明默认风险推演窗口为 `{format_window(analysis_profile.get('start_time'), analysis_profile.get('end_time'))}`。
4. 展示风险热力矩阵与街区风险排行。
5. 强调高风险并不是只看气温，而是综合了老年人口暴露、局地空间代理与资源可达性。

## 3. 展示可达性诊断

1. 展示 `{all_access.get('scope_label', '全部支撑资源')}` 与 `{active_access.get('scope_label', '既有主动避暑资源')}` 的口径差异。
2. 说明 `{all_access.get('scope_label', '全部支撑资源')}` 15 分钟覆盖率为 `{round(all_access.get('coverage_15min_rate', 0) * 100, 2)}%`，而优化基线 `{active_access.get('scope_label', '既有主动避暑资源')}` 仅为 `{round(active_access.get('coverage_15min_rate', 0) * 100, 2)}%`。
3. 强调当前使用真实步行网络，而不是简单直线距离。

## 4. 展示选址优化

1. 切到“新增点位情景对比”。
2. 说明系统先最大化 15 分钟新增覆盖，再用剩余点位继续缩短平均到达时间。
3. 对比基线、3 点、5 点、8 点方案。
4. 说明当前共有 `{total_high_risk_cells}` 个高风险网格，其中 `{reachable_cells}` 个能在 15 分钟阈值内通过候选点实现新增覆盖。
5. 点出结果：`3` 点方案覆盖率提升到 `{round((scenario3 or {}).get('metrics', {}).get('coverage_rate_population', 0) * 100, 2)}%`，`5` 点方案提升到 `{round((scenario5 or {}).get('metrics', {}).get('coverage_rate_population', 0) * 100, 2)}%`，`8` 点方案进一步提升到 `{round((scenario8 or {}).get('metrics', {}).get('coverage_rate_population', 0) * 100, 2)}%`。

## 5. 展示推荐点位

1. 展示默认 5 点方案推荐表。
2. 说明每个推荐点位包含新增覆盖人口、新增覆盖网格、改善网格、加权时间改善。
3. 点出重点推荐点位，如 `{top_site_names}`。

## 6. 展示导出材料

1. 打开 `outputs/report_tables/选址优化情景对比.csv`。
2. 打开 `outputs/report_charts/02_平均到达时间对比.png`。
3. 打开 `docs/研究报告-热龄卫士.md`。
4. 打开 `docs/参赛文档/04-1-作品提交要求响应清单-热龄卫士.md`，强调材料不是临时拼的。

## 7. 结束语

“热龄卫士不是一个普通的大屏，而是把热风险识别、步行可达性评估、设施选址优化和决策展示打通，直接服务街道与社区在高温来临时的资源调度。”
"""

    (DOCS_DIR / "演示脚本.md").write_text(script, encoding="utf-8")


def build_ai_usage_draft(metadata: dict) -> None:
    work_id = resolve_work_id(metadata)
    work_name = resolve_work_name(metadata)
    authors = resolve_people(metadata.get("authors"))
    advisors = resolve_people(metadata.get("advisors"))
    records = normalize_ai_records(metadata)
    confirmed = metadata.get("ai_usage_confirmed")
    if confirmed is True:
        status_label = "已确认存在 AI 辅助内容，请继续补齐明细与佐证。"
    elif confirmed is False:
        status_label = "当前标记为“待核对/未确认”，赛前必须与实际使用情况核实。"
    else:
        status_label = "尚未确认，请在最终提交前核对是否存在 AI 辅助内容。"

    if records:
        rows = []
        for index, record in enumerate(records, start=1):
            rows.append(
                "| "
                + " | ".join(
                    [
                        str(index),
                        str(record.get("tool_name") or "待补充"),
                        str(record.get("stage_purpose") or "待补充"),
                        str(record.get("prompt_summary") or "待补充"),
                        str(record.get("response_summary") or "待补充"),
                        str(record.get("manual_revision") or "待补充"),
                        str(record.get("adoption_note") or "待补充"),
                    ]
                )
                + " |"
            )
        record_rows = "\n".join(rows)
    else:
        record_rows = "\n".join(
            [
                "| 1 | 待按实际填写 | 待按实际填写 | 待按实际填写 | 待按实际填写 | 待按实际填写 | 待按实际填写 |",
                "| 2 | 待按实际填写 | 待按实际填写 | 待按实际填写 | 待按实际填写 | 待按实际填写 | 待按实际填写 |",
                "| 3 | 待按实际填写 | 待按实际填写 | 待按实际填写 | 待按实际填写 | 待按实际填写 | 待按实际填写 |",
            ]
        )

    note = str(metadata.get("ai_usage_note") or "").strip()
    if not note:
        note = "如作品存在任何 AI 辅助内容，请按实际情况补齐工具名称、访问方式、使用时间、关键提示词、人工修改说明和佐证材料。"

    draft = f"""# 04-3 AI工具使用说明

## 一、基础信息

- 作品编号：`{work_id if work_id != DEFAULT_WORK_ID else '[待填]'}` 
- 作品名称：{work_name}
- 作者：{authors}
- 指导教师：{advisors}
- 当前状态：{status_label}

## 二、重要合规提醒

1. 若作品存在任何 AI 生成或 AI 辅助内容，这份说明不建议省略。
2. 正式提交时，AI 工具名称、版本、访问方式、使用时间和报名表中的填写口径必须一致。
3. 赛前请再次核对：实际使用的 AI 工具是否属于赛规允许名单，或能否明确归类为自研工具。
4. 关键提示词、回复摘要、人工修改说明和采纳比例必须能被截图、录屏、对话日志或代码标注支撑。

## 三、当前仓库建议说明

{note}

## 四、使用记录草稿

| 序号 | AI工具名称、版本、访问方式、使用时间 | 使用环节与目的 | 关键提示词 | AI回复关键内容 | 人工修改说明 | 采纳比例与说明 |
| --- | --- | --- | --- | --- | --- | --- |
{record_rows}

## 五、佐证材料建议

- 附录1：关键截图（需保留时间戳和工具界面）。
- 附录2：关键交互录屏或对话日志（如 JSON / TXT / Markdown / MP4）。
- 附录3：代码、文稿或图表中标注 AI 辅助部分的说明。

## 六、赛前必须补齐的内容

- 在 `config/submission_metadata.json` 中补齐作品编号、作者、指导教师和 AI 使用记录。
- 将最终 PDF 与佐证材料一起放入 `03设计与开发文档` 目录。
- 若实际未使用 AI 工具，请在报名表与本说明中保持同一口径，不要一边写“未使用”，一边仓库里全是 AI 痕迹。
"""

    (COMPETITION_DOC_DIR / "04-3-AI工具使用说明-热龄卫士.md").write_text(draft, encoding="utf-8")


def build_submission_checklist(metadata: dict) -> None:
    work_id = resolve_work_id(metadata)
    work_id_label = work_id if work_id != DEFAULT_WORK_ID else "待填作品编号"
    current_date = current_timestamp().split("T")[0]
    ai_records = normalize_ai_records(metadata)
    ai_status = "已形成草稿，待导出 PDF 与补齐佐证" if ai_records else "待按实际填写并补齐佐证"

    checklist = f"""# 04-1 作品提交要求响应清单

## 一、作品基本信息

- 作品名称：{resolve_work_name(metadata)}
- 参赛大类：大数据应用
- 参赛小类：实践赛
- 当前版本日期：{current_date}
- 当前工程目录：`{ROOT_DIR}`
- 说明：本清单按 `04-1作品提交要求（必填模板）（大数据应用，2026版）V2` 的栏目逐项响应，用于赛前核查材料是否齐全、口径是否一致、目录是否可直接提交。

## 二、按 04-1 官方要求逐项响应

| 类别 | 官方要求摘要 | 本项目对应材料 | 当前状态 | 说明 |
| --- | --- | --- | --- | --- |
| 说明文档 | 提交《作品信息概要表》的 PDF 版本 | `04-2-作品信息概要表-热龄卫士.md` | 内容已完成，待导出 PDF | 作品编号、作者姓名、指导教师、签名日期需按最终报名信息补填后导出。 |
| 设计文档 | 提交《作品报告》PDF 版本 | `04-4-作品报告-热龄卫士.md` | 内容已完成，待导出 PDF | 已按 `04-4` 模板章节结构重写，建议转入 Word 模板后补图号、表号、目录和页眉页脚。 |
| AI 工具说明 | 若作品涉及 AI 内容，需补充 04-3 PDF 与佐证材料 | `04-3-AI工具使用说明-热龄卫士.md`、截图/录屏/对话日志 | {ai_status} | 这不是装饰材料，而是合规材料；工具名称必须与允许名单或自研工具口径一致。 |
| 演示文档 | 提交现场演示 PPT | `演示脚本.md` | 待补最终 PPT | 当前脚本已根据最新结果刷新，可直接据此制作 10-15 页答辩 PPT。 |
| 演示视频 | 5 分钟左右 MP4，建议 1080P，≤500MB | `{work_id_label}-04作品演示视频/待放置-演示视频.txt` | 待录制 | 建议录制“问题背景-系统流程-地图演示-实验结果-落地意义”五段式视频。 |
| 源代码 | 提交全部自研源码、工程文件、必要模型与样例数据 | `{work_id_label}-02素材与源码/热龄卫士-源码与样例.zip` | 已完成 | 压缩包已生成；开源依赖通过 `requirements.txt` 说明，不重复打包第三方源码。 |
| 数据集 | 可只上传典型样本，并在信息表中说明完整版获取方式 | `data/processed/`、`outputs/report_tables/`、`outputs/report_charts/` | 已完成核心样例 | 推荐提交处理后样例、图表和说明，不必打包全部原始大文件。 |
| 模型/算法材料 | 需提交模型、实验结果和必要说明 | `04-4-作品报告-热龄卫士.md`、`数据真实性审计表.csv`、`风险模型验证.csv`、`模块消融实验.csv` | 已完成 | 当前项目不是训练型深度模型，而是“真实数据输入 + 风险/可达性/选址模型计算”体系，实验材料已齐。 |
| 作品系统 | 参赛作品应有完整软件或软硬件实物系统 | 本地 Web 系统：`http://127.0.0.1:8000/` | 已完成 | 可本地一键启动，具备前后端、数据更新、实验结果和交互展示。 |
| readme.txt | 每个提交文件夹需包含 `readme.txt` | 已在 01/02/03/04 四个目录生成 | 已完成 | 当前提交包骨架已满足目录说明要求。 |

## 三、当前提交包目录映射

### 1. `{work_id_label}-01作品与答辩材料`

- `网站进入与使用说明.md`
- `部署说明.md`
- `项目说明书.md`
- `运行入口与部署说明.txt`
- `readme.txt`

建议补充：

- `答辩PPT.pdf`
- `答辩演示版.mp4` 或嵌入 PPT 的演示视频
- 若采用公网展示，可附运行网址和二维码

### 2. `{work_id_label}-02素材与源码`

- `热龄卫士-源码与样例.zip`
- `源码压缩包说明.txt`
- `readme.txt`

建议补充：

- 典型样例数据说明
- 若需要，可附 `data/processed/` 的精选样例文件

### 3. `{work_id_label}-03设计与开发文档`

已具备：

- 官方模板目录
- 图表与表格目录
- 报告与说明目录

建议本次正式放入：

- `04-1-作品提交要求响应清单-热龄卫士.pdf`
- `04-2-作品信息概要表-热龄卫士.pdf`
- `04-3-AI工具使用说明-热龄卫士.pdf`（如作品涉及 AI 辅助）
- `04-4-作品报告-热龄卫士.pdf`
- `项目实际价值与应用场景总结-热龄卫士.pdf`
- AI 工具佐证材料（截图、录屏、日志、代码标注）

### 4. `{work_id_label}-04作品演示视频`

当前仅有占位说明文件，需补齐：

- 最终演示视频 MP4
- 若另有“答辩专用视频”，建议单独命名

## 四、本项目相对 04-1 的优势材料

### 1. 文档完整度较高

- 已有研究报告、项目说明书、部署说明、网站使用说明、演示脚本、图表与表格导出物。
- 本轮补齐了 `04-3` 草稿和 AI 合规提醒，避免后期临时补材料时口径失控。

### 2. 实物系统可运行

- 项目不是静态 PPT 或单次分析脚本，而是可启动、可浏览、可切换方案、可查看证据链的完整 Web 系统。
- 后端接口、数据文件、图表导出和提交包骨架已打通。

### 3. 数据与实验材料真实且可追溯

- 上游数据来自 Open-Meteo、WorldPop、OpenStreetMap/Overpass、Geofabrik、武汉官方公开页面。
- 项目新增“数据真实性审计”，明确哪些是上游真实数据、哪些是模型推导输出、哪些包含代理变量。
- 可直接支撑评审最关心的“真实性”和“有效性”问题。

## 五、赛前必须补齐的最后事项

- 补填作品编号、作者姓名、指导教师姓名、签字日期。
- 将 `04-2`、`04-3`（如涉及 AI）和 `04-4` 转入官方 Word 模板，导出最终 PDF。
- 基于 `演示脚本.md` 制作答辩 PPT。
- 录制 5 分钟左右 MP4 演示视频。
- 核对实际使用的 AI 工具是否只涉及赛规允许工具或自研工具，并准备对应佐证材料。

## 六、建议提交前最后核查

- 文档中的“真实数据”表述是否全部改为“真实公开数据输入 + 模型推导输出”。
- 所有图表、表格、截图中的数字是否与当前 `data/processed/` 一致。
- 作品报告、概要表、PPT、视频中的项目名称、研究区域、实验指标是否完全一致。
- 是否保留了“当前默认风险场景为 2025-08-03 至 2025-08-06 真实历史热浪窗口”这一关键说明。
- 是否明确写出官方纳凉点坐标来自“官方地址/场馆名 + OSM 空间锚定”，而非政府直接发布经纬度。
- 是否补齐 AI 工具使用说明及其佐证材料，并与报名表口径保持一致。

## 七、结论

从 `04-1` 的要求看，本项目已经具备较完整的参赛基础：

- 系统可运行
- 核心文档已成型
- 源码包已生成
- 图表表格已导出
- 提交包目录骨架已建立

当前真正缺的不是技术主体，而是最后一层提交包装：

- 最终 PDF 化
- PPT 与视频制作
- 报名信息和签名补齐
- AI 合规说明与佐证同步

只要完成上述事项，本项目即可按较高完成度进入正式提交阶段。
"""

    (COMPETITION_DOC_DIR / "04-1-作品提交要求响应清单-热龄卫士.md").write_text(checklist, encoding="utf-8")


def main() -> None:
    ensure_dirs()
    setup_matplotlib()
    submission_metadata = load_submission_metadata()

    weather = read_json(PROCESSED_DIR / "weather_summary.json", {})
    risk_summary = read_json(PROCESSED_DIR / "risk_summary.json", {})
    accessibility = read_json(PROCESSED_DIR / "accessibility_summary.json", {})
    optimization = read_json(PROCESSED_DIR / "optimization_experiments.json", {})
    recommendations = read_json(PROCESSED_DIR / "site_recommendations.json", {})
    population = read_json(PROCESSED_DIR / "population_grid.json", {})
    official_cooling = read_json(PROCESSED_DIR / "official_cooling_sites.json", {"bulletins": [], "sites": []})
    graph_status = read_json(ROOT_DIR / "data" / "raw" / "walk_network_status.json", {})
    competition_experiments = read_json(PROCESSED_DIR / "competition_experiments.json", {})
    source_refresh_manifest = read_json(EXTERNAL_DIR / "source_refresh_manifest.json", {})
    authenticity_audit = read_json(PROCESSED_DIR / "data_authenticity_audit.json", {})

    tables = export_tables(
        weather,
        optimization,
        risk_summary,
        recommendations,
        accessibility,
        competition_experiments,
        official_cooling,
        source_refresh_manifest,
        authenticity_audit,
    )
    export_authenticity_table(authenticity_audit)
    export_charts(tables, optimization, accessibility, competition_experiments)
    build_report_draft(
        weather,
        risk_summary,
        accessibility,
        optimization,
        recommendations,
        population,
        graph_status,
        competition_experiments,
        official_cooling,
        source_refresh_manifest,
        authenticity_audit,
    )
    build_demo_script(weather, risk_summary, accessibility, optimization, recommendations)
    build_ai_usage_draft(submission_metadata)
    build_submission_checklist(submission_metadata)

    print("实验图表、摘要表和研究报告已生成。")


if __name__ == "__main__":
    main()
