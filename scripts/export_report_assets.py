from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from common import ROOT_DIR, PROCESSED_DIR, read_json


OUTPUTS_DIR = ROOT_DIR / "outputs"
TABLE_DIR = OUTPUTS_DIR / "report_tables"
CHART_DIR = OUTPUTS_DIR / "report_charts"
DOCS_DIR = ROOT_DIR / "docs"
EXTERNAL_DIR = ROOT_DIR / "data" / "external"


def setup_matplotlib() -> None:
    plt.rcParams["font.sans-serif"] = [
        "Microsoft YaHei",
        "SimHei",
        "Noto Sans CJK SC",
        "Arial Unicode MS",
    ]
    plt.rcParams["axes.unicode_minus"] = False


def ensure_dirs() -> None:
    for path in (OUTPUTS_DIR, TABLE_DIR, CHART_DIR, DOCS_DIR):
        path.mkdir(parents=True, exist_ok=True)


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


def export_tables(
    weather: dict,
    optimization: dict,
    risk_summary: dict,
    recommendations: dict,
    accessibility: dict,
    competition_experiments: dict,
    official_cooling: dict,
    source_refresh_manifest: dict,
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

    recommendation_lines = []
    for index, site in enumerate(recommendations.get("recommendations", []), start=1):
        recommendation_lines.append(
            f"{index}. `{site.get('name', site.get('poi_id'))}`：新增覆盖高风险老年人口 `{site.get('covered_elderly_population', 0)}` 人，"
            f"直接补盲 `{site.get('covered_cells', 0)}` 个网格，并改善 `{site.get('improved_cells', 0)}` 个网格的到达时间；"
            f"运行适配度 `{site.get('operational_suitability', '--')}`，选择理由：{site.get('selection_reason', '综合补位')}。"
        )
    recommendation_text = "\n".join(recommendation_lines) if recommendation_lines else "待补充推荐点位。"

    ablation_lines = "\n".join(
        f"- `{item['module']}` 的 `{item['metric']}` 从 `{item['ablated_value']}` 变化到 `{item['full_value']}`，差值 `{item['delta']}`。{item['interpretation']}"
        for item in ablation_modules
    ) or "- 待补充消融实验结果。"

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

    (DOCS_DIR / "研究报告-热龄卫士.md").write_text(report, encoding="utf-8")
    (DOCS_DIR / "研究报告初稿-热龄卫士.md").write_text(report, encoding="utf-8")


def main() -> None:
    ensure_dirs()
    setup_matplotlib()

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

    tables = export_tables(
        weather,
        optimization,
        risk_summary,
        recommendations,
        accessibility,
        competition_experiments,
        official_cooling,
        source_refresh_manifest,
    )
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
    )

    print("实验图表、摘要表和报告初稿已生成。")


if __name__ == "__main__":
    main()
