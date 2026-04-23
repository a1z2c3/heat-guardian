from common import DATA_DIR, PROCESSED_DIR, current_timestamp, ensure_directories, read_json, write_json


OUTPUT_PATH = PROCESSED_DIR / "data_authenticity_audit.json"
GRAPH_STATUS_PATH = DATA_DIR / "raw" / "walk_network_status.json"


def build_module(
    *,
    key: str,
    label: str,
    stage: str,
    authenticity_key: str,
    authenticity_label: str,
    status: str,
    upstream_is_real: bool,
    output_is_modeled: bool,
    uses_proxy: bool,
    fallback_detected: bool,
    current_data_level: str | None,
    checked_at: str | None,
    safe_claim: str,
    avoid_claim: str,
    evidence: list[str],
    warnings: list[str],
    source_urls: list[str] | None = None,
) -> dict:
    return {
        "key": key,
        "label": label,
        "stage": stage,
        "authenticity_key": authenticity_key,
        "authenticity_label": authenticity_label,
        "status": status,
        "upstream_is_real": upstream_is_real,
        "output_is_modeled": output_is_modeled,
        "uses_proxy": uses_proxy,
        "fallback_detected": fallback_detected,
        "current_data_level": current_data_level,
        "checked_at": checked_at,
        "safe_claim": safe_claim,
        "avoid_claim": avoid_claim,
        "evidence": evidence,
        "warnings": warnings,
        "source_urls": source_urls or [],
    }


def build_weather_module(weather: dict) -> dict:
    analysis_profile = weather.get("analysis_profile", {})
    historical_case = weather.get("historical_heatwave_case", {})
    profile_type = analysis_profile.get("profile_type") or weather.get("default_risk_profile") or "forecast"
    warnings: list[str] = []

    if profile_type == "historical_heatwave_case":
        warnings.append(
            "当前风险推演窗口不是当天实况高温，而是切换到真实历史热浪案例做情景推演。"
        )

    return build_module(
        key="weather",
        label="天气场景",
        stage="upstream_input",
        authenticity_key="real_weather_with_scenario_switch",
        authenticity_label="真实气象数据输入",
        status="warning" if warnings else "ok",
        upstream_is_real=True,
        output_is_modeled=(profile_type == "historical_heatwave_case"),
        uses_proxy=False,
        fallback_detected=False,
        current_data_level=profile_type,
        checked_at=weather.get("generated_at"),
        safe_claim=(
            "天气输入来自 Open-Meteo 真实预报与历史档案；当前版本会在非高温日切换到真实历史热浪窗口做推演。"
        ),
        avoid_claim="当前风险图就是今天实测热浪的空间分布。",
        evidence=[
            f"数据源：{weather.get('source', 'Open-Meteo')}",
            f"默认风险场景：{profile_type}",
            (
                f"历史热浪窗口：{historical_case.get('start_time')} 至 {historical_case.get('end_time')}"
                if profile_type == "historical_heatwave_case"
                else "当前默认风险场景直接使用未来 72 小时预报窗口。"
            ),
        ],
        warnings=warnings,
        source_urls=[
            "https://open-meteo.com/en/docs",
        ],
    )


def build_population_module(population: dict, source_manifest: dict) -> dict:
    data_level = population.get("data_level", "unknown")
    worldpop = source_manifest.get("worldpop", {})
    warnings: list[str] = []
    fallback_detected = data_level == "demo_estimate"

    if fallback_detected:
        warnings.append("当前人口网格已退回热点估计版，不应表述为真实人口栅格。")

    return build_module(
        key="population",
        label="老年人口",
        stage="upstream_input",
        authenticity_key="worldpop_raster" if not fallback_detected else "fallback_estimate",
        authenticity_label="真实公开人口栅格" if not fallback_detected else "回退估计人口",
        status="fallback" if fallback_detected else "ok",
        upstream_is_real=not fallback_detected,
        output_is_modeled=False,
        uses_proxy=False,
        fallback_detected=fallback_detected,
        current_data_level=data_level,
        checked_at=population.get("generated_at") or worldpop.get("checked_at"),
        safe_claim=(
            "老年人口输入使用 WorldPop 中国年龄结构栅格。"
            if not fallback_detected
            else "当前人口层为系统回退估计，只能用于演示，不应作为真实人口口径。"
        ),
        avoid_claim="所有人口数据都是街道实测或入户统计原始值。",
        evidence=[
            f"数据级别：{data_level}",
            f"来源：{population.get('source', worldpop.get('source', 'unknown'))}",
            f"WorldPop 版本：{worldpop.get('data_year', '--')} / {worldpop.get('release', '--')}",
        ],
        warnings=warnings,
        source_urls=[
            ((worldpop.get("files") or {}).get("age65") or {}).get("download", {}).get("url", ""),
        ],
    )


def build_accessibility_module(accessibility: dict, graph_status: dict) -> dict:
    scopes = accessibility.get("resource_scopes", {})
    all_scope = scopes.get("all_support_resources", accessibility)
    data_level = all_scope.get("data_level") or accessibility.get("data_level") or "unknown"
    graph_source = graph_status.get("source")
    fallback_detected = data_level == "distance_proxy" or graph_status.get("fallback") == "distance_proxy"
    warnings: list[str] = []

    if fallback_detected:
        warnings.append("当前可达性未使用真实步行路网，而是退回到距离代理法。")

    return build_module(
        key="accessibility",
        label="步行可达性",
        stage="upstream_processing",
        authenticity_key="walk_network" if not fallback_detected else "distance_proxy",
        authenticity_label="真实步行路网分析" if not fallback_detected else "距离代理回退",
        status="fallback" if fallback_detected else "ok",
        upstream_is_real=not fallback_detected,
        output_is_modeled=False,
        uses_proxy=fallback_detected,
        fallback_detected=fallback_detected,
        current_data_level=data_level,
        checked_at=all_scope.get("generated_at"),
        safe_claim=(
            "可达性优先基于 Geofabrik/OSM 真实步行路网计算。"
            if not fallback_detected
            else "当前可达性只能表述为距离代理结果。"
        ),
        avoid_claim="当前可达性一定是基于真实步行路网精确求得。",
        evidence=[
            f"数据级别：{data_level}",
            f"图节点/边：{all_scope.get('graph_nodes', 0)} / {all_scope.get('graph_edges', 0)}",
            f"路网来源：{graph_source or 'unknown'}",
        ],
        warnings=warnings,
        source_urls=[
            "https://download.geofabrik.de/asia/china.html",
            "https://wiki.openstreetmap.org/wiki/Overpass_API",
        ],
    )


def build_official_cooling_module(official_cooling: dict) -> dict:
    summary = official_cooling.get("summary", {})
    status_breakdown = official_cooling.get("source_status_breakdown", {})
    live_count = int(status_breakdown.get("live", 0) or 0)
    cached_count = int(status_breakdown.get("cached_snapshot", 0) or 0)
    verified_count = int(summary.get("verified_site_count", 0) or 0)
    locatable_count = int(summary.get("locatable_site_count", 0) or 0)
    warnings: list[str] = []

    if cached_count > 0:
        warnings.append("部分官方通报本轮使用缓存快照，不是刚刚在线拉取。")
    if verified_count < locatable_count:
        warnings.append("部分纳凉点尚未完成原文核验或定位核验。")

    return build_module(
        key="official_cooling",
        label="官方纳凉点",
        stage="upstream_input",
        authenticity_key="official_public_pages_with_spatial_anchor",
        authenticity_label="官方公开通报 + 空间锚定核验",
        status="warning" if warnings else "ok",
        upstream_is_real=True,
        output_is_modeled=False,
        uses_proxy=False,
        fallback_detected=False,
        current_data_level="official_bulletins_plus_verified_sites",
        checked_at=official_cooling.get("generated_at"),
        safe_claim=(
            "官方纳凉点来源于武汉政府公开页面；可进入空间分析的点位仅纳入完成原文与位置核验的站点。"
        ),
        avoid_claim="所有纳凉点坐标都来自政府页面直接发布的原始经纬度。",
        evidence=[
            f"监测页面：{official_cooling.get('monitored_source_count', 0)} 个",
            f"全市官方通报口径：{official_cooling.get('reported_citywide_cooling_point_count', '未提取')} 个",
            f"研究区已核验可定位点位：{verified_count} / {locatable_count}",
            "当前坐标来自官方地址、官方场馆名称与 OSM 点位的空间锚定，不是政府页面直接附带经纬度。",
        ],
        warnings=warnings,
        source_urls=[item.get("url", "") for item in official_cooling.get("bulletins", [])[:3]],
    )


def count_placeholder_recommendations(recommendations: list[dict]) -> int:
    count = 0
    for item in recommendations:
        name = str(item.get("display_name") or item.get("name") or "")
        if not name or name.startswith("未命名"):
            count += 1
    return count


def build_risk_module(risk_summary: dict) -> dict:
    data_level = risk_summary.get("data_level", "unknown")
    warnings = [
        "风险网格属于基于真实输入计算的模型结果，不是逐网格实测温度或实测病例。",
        "局地热环境由建筑覆盖、道路密度、绿地覆盖和近公园距离等空间代理构建。",
    ]

    return build_module(
        key="risk_model",
        label="风险网格",
        stage="derived_output",
        authenticity_key="derived_spatial_proxy_model",
        authenticity_label="真实输入驱动的模型推导结果",
        status="warning",
        upstream_is_real=True,
        output_is_modeled=True,
        uses_proxy=True,
        fallback_detected=False,
        current_data_level=data_level,
        checked_at=risk_summary.get("generated_at"),
        safe_claim="风险网格是基于真实气象、真实人口、真实路网与空间代理计算得到的模型输出。",
        avoid_claim="风险分数就是逐网格原始实测值。",
        evidence=[
            f"数据级别：{data_level}",
            f"环境代理来源：{risk_summary.get('environmental_proxy_source', 'unknown')}",
            f"当前高风险网格：{risk_summary.get('high_risk_cells', 0)} / {risk_summary.get('total_cells', 0)}",
        ],
        warnings=warnings,
    )


def build_optimization_module(optimization: dict, recommendations_payload: dict) -> dict:
    recommendations = recommendations_payload.get("recommendations", [])
    placeholder_count = count_placeholder_recommendations(recommendations)
    warnings = [
        "选址结果属于优化模型输出，不是已有官方落地点名单。",
        "容量、开放时段、开放性与避暑适配度当前仍为代理变量，不是逐点实测运营数据。",
    ]
    if placeholder_count > 0:
        warnings.append("当前推荐列表仍存在未命名候选点，需要进一步处理展示名称。")

    return build_module(
        key="optimization",
        label="选址优化",
        stage="derived_output",
        authenticity_key="derived_optimization_with_operational_proxies",
        authenticity_label="真实输入驱动的优化建议",
        status="warning",
        upstream_is_real=True,
        output_is_modeled=True,
        uses_proxy=True,
        fallback_detected=False,
        current_data_level=optimization.get("strategy"),
        checked_at=optimization.get("generated_at"),
        safe_claim="推荐点位是基于真实数据和约束条件计算得到的优化建议，不是凭空造点。",
        avoid_claim="推荐点位容量、开放时长和运营适配度都已经完成实测核验。",
        evidence=[
            f"策略：{optimization.get('strategy', 'unknown')}",
            f"默认推荐点数：{recommendations_payload.get('default_scenario', 5)}",
            f"当前推荐点位：{len(recommendations)} 个",
            f"展示占位名点位：{placeholder_count} 个",
        ],
        warnings=warnings,
        source_urls=[
            "https://pysal.org/spopt/notebooks/p-median.html",
            "https://github.com/pysal/spopt",
        ],
    )


def summarize_modules(modules: list[dict], official_cooling: dict) -> dict:
    return {
        "module_count": len(modules),
        "upstream_real_count": sum(1 for item in modules if item.get("upstream_is_real")),
        "derived_count": sum(1 for item in modules if item.get("output_is_modeled")),
        "fallback_count": sum(1 for item in modules if item.get("fallback_detected")),
        "proxy_count": sum(1 for item in modules if item.get("uses_proxy")),
        "warning_count": sum(1 for item in modules if item.get("status") == "warning"),
        "official_live_source_count": int((official_cooling.get("source_status_breakdown") or {}).get("live", 0) or 0),
        "official_cached_source_count": int((official_cooling.get("source_status_breakdown") or {}).get("cached_snapshot", 0) or 0),
        "official_verified_site_count": int((official_cooling.get("summary") or {}).get("verified_site_count", 0) or 0),
    }


def build_overall(summary: dict) -> dict:
    can_claim_all_upstream_sources_real = summary["fallback_count"] == 0
    return {
        "verdict_key": "real_inputs_plus_model_derivations",
        "verdict_label": "真实公开数据输入 + 模型推导输出",
        "can_claim_all_data_real": False,
        "can_claim_all_upstream_sources_real": can_claim_all_upstream_sources_real,
        "competition_safe_statement": (
            "本项目当前版本使用真实公开数据作为上游输入，风险网格和选址结果为基于真实数据计算的模型输出；"
            "其中局地热环境、容量、开放时段和运营适配度含有可解释代理变量。"
        ),
        "recommended_short_answer": (
            "不是“全部原始实测数据”，而是“真实公开数据 + 明确标注的模型推导”。"
        ),
        "avoid_overclaim": "不要说“我们所有数据都是原始真实值”或“推荐点位参数都已实测核验”。",
    }


def build_claim_guidance() -> dict:
    return {
        "safe_claims": [
            "上游输入来自真实公开数据源。",
            "风险网格和选址方案是基于真实数据计算得到的模型结果。",
            "容量、开放时段、局地热环境和运营适配度中含有代理变量。",
            "若官方通报无法定位，则不会直接混入路网测算。",
        ],
        "avoid_claims": [
            "全部数据都是原始实测值。",
            "当前风险图完全等同于当天实测高温暴露。",
            "推荐点位容量、开放时段和运营状态都已逐点实测核验。",
        ],
    }


def main() -> None:
    ensure_directories()

    weather = read_json(PROCESSED_DIR / "weather_summary.json", {})
    population = read_json(PROCESSED_DIR / "population_grid.json", {})
    accessibility = read_json(PROCESSED_DIR / "accessibility_summary.json", {})
    official_cooling = read_json(PROCESSED_DIR / "official_cooling_sites.json", {})
    risk_summary = read_json(PROCESSED_DIR / "risk_summary.json", {})
    optimization = read_json(PROCESSED_DIR / "optimization_experiments.json", {})
    recommendations_payload = read_json(PROCESSED_DIR / "site_recommendations.json", {})
    source_manifest = read_json(DATA_DIR / "external" / "source_refresh_manifest.json", {})
    graph_status = read_json(GRAPH_STATUS_PATH, {})

    modules = [
        build_weather_module(weather),
        build_population_module(population, source_manifest),
        build_accessibility_module(accessibility, graph_status),
        build_official_cooling_module(official_cooling),
        build_risk_module(risk_summary),
        build_optimization_module(optimization, recommendations_payload),
    ]
    summary = summarize_modules(modules, official_cooling)
    overall = build_overall(summary)

    payload = {
        "generated_at": current_timestamp(),
        "overall": overall,
        "summary": summary,
        "modules": modules,
        "claim_guidance": build_claim_guidance(),
    }
    write_json(OUTPUT_PATH, payload)
    print("数据真实性审计已生成。")


if __name__ == "__main__":
    main()
