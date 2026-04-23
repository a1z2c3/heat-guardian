import argparse
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable

import build_accessibility
import build_data_authenticity_audit
import build_risk_model
import export_report_assets
import fetch_official_cooling_sites
import fetch_poi
import fetch_weather
import prepare_population
import recommend_sites
import run_competition_experiments
import update_external_data
from common import (
    CONFIG_DIR,
    DATA_DIR,
    PROCESSED_DIR,
    current_timestamp,
    file_stat_signature,
    read_json,
    semantic_hash,
    semantic_hash_file,
    write_json,
)


PIPELINE_STATE_PATH = PROCESSED_DIR / "pipeline_state.json"
EXTERNAL_DIR = DATA_DIR / "external"
RAW_DIR = DATA_DIR / "raw"
OUTPUTS_DIR = Path(__file__).resolve().parents[1] / "outputs"
DOCS_DIR = Path(__file__).resolve().parents[1] / "docs"
WORLDPOP_DIR = EXTERNAL_DIR / "worldpop"
WORLDPOP_CANONICAL_65 = WORLDPOP_DIR / "worldpop_age65_plus_latest.tif"
WORLDPOP_CANONICAL_80 = WORLDPOP_DIR / "worldpop_age80_plus_latest.tif"
EXTERNAL_MANIFEST_PATH = EXTERNAL_DIR / "source_refresh_manifest.json"
GRAPH_PATH = RAW_DIR / "walk_network.pkl"
GRAPH_STATUS_PATH = RAW_DIR / "walk_network_status.json"
WEATHER_SUMMARY_PATH = PROCESSED_DIR / "weather_summary.json"
POPULATION_GRID_PATH = PROCESSED_DIR / "population_grid.json"
POI_POINTS_PATH = PROCESSED_DIR / "poi_points.json"
OFFICIAL_COOLING_PATH = PROCESSED_DIR / "official_cooling_sites.json"
ACCESSIBILITY_GRID_PATH = PROCESSED_DIR / "accessibility_grid.json"
ACCESSIBILITY_SUMMARY_PATH = PROCESSED_DIR / "accessibility_summary.json"
POI_SERVICE_POINTS_PATH = PROCESSED_DIR / "poi_service_points.json"
RISK_GRID_PATH = PROCESSED_DIR / "risk_grid.json"
RISK_SUMMARY_PATH = PROCESSED_DIR / "risk_summary.json"
SITE_RECOMMENDATIONS_PATH = PROCESSED_DIR / "site_recommendations.json"
OPTIMIZATION_EXPERIMENTS_PATH = PROCESSED_DIR / "optimization_experiments.json"
COMPETITION_EXPERIMENTS_PATH = PROCESSED_DIR / "competition_experiments.json"
DATA_AUTHENTICITY_PATH = PROCESSED_DIR / "data_authenticity_audit.json"
REPORT_TABLES_DIR = OUTPUTS_DIR / "report_tables"
REPORT_CHARTS_DIR = OUTPUTS_DIR / "report_charts"


StepFunction = Callable[[], None]
SignatureFunction = Callable[[], str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="热龄卫士数据流水线")
    parser.add_argument(
        "--include-report-assets",
        action="store_true",
        help="额外导出报告图表与比赛材料表格",
    )
    parser.add_argument(
        "--force-rebuild",
        action="store_true",
        help="忽略增量缓存，强制重建所有下游结果",
    )
    return parser.parse_args()


def build_worldpop_input_signature() -> str:
    worldpop_manifest = (read_json(EXTERNAL_MANIFEST_PATH, {}) or {}).get("worldpop", {})
    extra_files = sorted(
        [
            path
            for path in WORLDPOP_DIR.glob("*")
            if path.is_file() and path.suffix.lower() in {".tif", ".csv", ".geojson", ".json"}
        ],
        key=lambda item: item.name,
    )
    return semantic_hash(
        {
            "config": semantic_hash_file(CONFIG_DIR / "study_area.json", ignored_keys=set()),
            "manifest_worldpop": semantic_hash(worldpop_manifest),
            "worldpop_files": {
                path.name: file_stat_signature(path)
                for path in extra_files
            },
            "canonical_age65": file_stat_signature(WORLDPOP_CANONICAL_65),
            "canonical_age80": file_stat_signature(WORLDPOP_CANONICAL_80),
        },
        ignored_keys=set(),
    )


def build_accessibility_input_signature() -> str:
    return semantic_hash(
        {
            "config": semantic_hash_file(CONFIG_DIR / "study_area.json", ignored_keys=set()),
            "poi_points": semantic_hash_file(POI_POINTS_PATH),
            "official_cooling": semantic_hash_file(OFFICIAL_COOLING_PATH),
            "graph_status": semantic_hash_file(GRAPH_STATUS_PATH),
            "graph_pickle": file_stat_signature(GRAPH_PATH),
        },
        ignored_keys=set(),
    )


def build_risk_input_signature() -> str:
    return semantic_hash(
        {
            "config": semantic_hash_file(CONFIG_DIR / "study_area.json", ignored_keys=set()),
            "weather": semantic_hash_file(WEATHER_SUMMARY_PATH),
            "population": semantic_hash_file(POPULATION_GRID_PATH),
            "poi_points": semantic_hash_file(POI_POINTS_PATH),
            "official_cooling": semantic_hash_file(OFFICIAL_COOLING_PATH),
            "accessibility_grid": semantic_hash_file(ACCESSIBILITY_GRID_PATH),
            "accessibility_summary": semantic_hash_file(ACCESSIBILITY_SUMMARY_PATH),
            "buildings_shp": file_stat_signature(EXTERNAL_DIR / "geofabrik" / "hubei" / "gis_osm_buildings_a_free_1.shp"),
            "roads_shp": file_stat_signature(EXTERNAL_DIR / "geofabrik" / "hubei" / "gis_osm_roads_free_1.shp"),
            "landuse_shp": file_stat_signature(EXTERNAL_DIR / "geofabrik" / "hubei" / "gis_osm_landuse_a_free_1.shp"),
        },
        ignored_keys=set(),
    )


def build_recommendation_input_signature() -> str:
    return semantic_hash(
        {
            "config": semantic_hash_file(CONFIG_DIR / "study_area.json", ignored_keys=set()),
            "risk_grid": semantic_hash_file(RISK_GRID_PATH),
            "poi_points": semantic_hash_file(POI_POINTS_PATH),
            "official_cooling": semantic_hash_file(OFFICIAL_COOLING_PATH),
            "accessibility_grid": semantic_hash_file(ACCESSIBILITY_GRID_PATH),
            "accessibility_summary": semantic_hash_file(ACCESSIBILITY_SUMMARY_PATH),
            "poi_service_points": semantic_hash_file(POI_SERVICE_POINTS_PATH),
        },
        ignored_keys=set(),
    )


def build_experiment_input_signature() -> str:
    return semantic_hash(
        {
            "config": semantic_hash_file(CONFIG_DIR / "study_area.json", ignored_keys=set()),
            "risk_grid": semantic_hash_file(RISK_GRID_PATH),
            "poi_points": semantic_hash_file(POI_POINTS_PATH),
            "accessibility_grid": semantic_hash_file(ACCESSIBILITY_GRID_PATH),
            "accessibility_summary": semantic_hash_file(ACCESSIBILITY_SUMMARY_PATH),
            "optimization": semantic_hash_file(OPTIMIZATION_EXPERIMENTS_PATH),
        },
        ignored_keys=set(),
    )


def build_authenticity_input_signature() -> str:
    return semantic_hash(
        {
            "weather": semantic_hash_file(WEATHER_SUMMARY_PATH),
            "population": semantic_hash_file(POPULATION_GRID_PATH),
            "accessibility": semantic_hash_file(ACCESSIBILITY_SUMMARY_PATH),
            "official_cooling": semantic_hash_file(OFFICIAL_COOLING_PATH),
            "risk_summary": semantic_hash_file(RISK_SUMMARY_PATH),
            "recommendations": semantic_hash_file(SITE_RECOMMENDATIONS_PATH),
            "source_manifest": semantic_hash_file(EXTERNAL_MANIFEST_PATH),
            "graph_status": semantic_hash_file(GRAPH_STATUS_PATH),
        },
        ignored_keys=set(),
    )


def build_report_assets_input_signature() -> str:
    return semantic_hash(
        {
            "weather": semantic_hash_file(WEATHER_SUMMARY_PATH),
            "official_cooling": semantic_hash_file(OFFICIAL_COOLING_PATH),
            "accessibility": semantic_hash_file(ACCESSIBILITY_SUMMARY_PATH),
            "risk_summary": semantic_hash_file(RISK_SUMMARY_PATH),
            "recommendations": semantic_hash_file(SITE_RECOMMENDATIONS_PATH),
            "optimization": semantic_hash_file(OPTIMIZATION_EXPERIMENTS_PATH),
            "experiments": semantic_hash_file(COMPETITION_EXPERIMENTS_PATH),
            "authenticity": semantic_hash_file(DATA_AUTHENTICITY_PATH),
        },
        ignored_keys=set(),
    )


def load_pipeline_state() -> dict:
    return read_json(PIPELINE_STATE_PATH, {"steps": {}}) or {"steps": {}}


def output_ready(path: Path) -> bool:
    if path.is_dir():
        return path.exists() and any(path.iterdir())
    return path.exists()


def outputs_ready(outputs: list[Path]) -> bool:
    return all(output_ready(path) for path in outputs)


def should_run_step(
    *,
    step_key: str,
    outputs: list[Path],
    signature_builder: SignatureFunction | None,
    state: dict,
    force_rebuild: bool,
) -> tuple[bool, str | None]:
    if signature_builder is None:
        return True, None
    current_signature = signature_builder()
    if force_rebuild:
        return True, current_signature
    step_state = (state.get("steps") or {}).get(step_key, {})
    if outputs_ready(outputs) and step_state.get("input_signature") == current_signature:
        return False, current_signature
    return True, current_signature


def persist_step_state(state: dict, step_key: str, input_signature: str | None, outputs: list[Path], elapsed: float | None) -> None:
    state.setdefault("steps", {})[step_key] = {
        "input_signature": input_signature,
        "outputs": [str(path) for path in outputs],
        "last_built_at": current_timestamp(),
        "last_elapsed_seconds": round(elapsed, 2) if elapsed is not None else None,
    }
    write_json(PIPELINE_STATE_PATH, state)


def execute_step(label: str, func: StepFunction) -> float:
    step_start = time.perf_counter()
    print(f"  - {label}...", flush=True)
    try:
        func()
    except Exception:
        elapsed = time.perf_counter() - step_start
        print(f"  - {label}失败，耗时 {elapsed:.1f}s", flush=True)
        raise
    elapsed = time.perf_counter() - step_start
    print(f"  - {label}完成，耗时 {elapsed:.1f}s", flush=True)
    return elapsed


def run_parallel_phase(
    phase_index: int,
    total_phases: int,
    phase_label: str,
    steps: list[dict],
    state: dict,
    force_rebuild: bool,
) -> None:
    phase_start = time.perf_counter()
    print(f"[阶段 {phase_index}/{total_phases}] {phase_label}", flush=True)
    runnable_steps: list[tuple[dict, str | None]] = []

    for step in steps:
        should_run, input_signature = should_run_step(
            step_key=step["key"],
            outputs=step.get("outputs", []),
            signature_builder=step.get("signature_builder"),
            state=state,
            force_rebuild=force_rebuild,
        )
        if should_run:
            runnable_steps.append((step, input_signature))
        else:
            print(f"  - {step['label']}跳过，输入未变化。", flush=True)

    if runnable_steps:
        with ThreadPoolExecutor(max_workers=len(runnable_steps)) as executor:
            future_map = {
                executor.submit(execute_step, step["label"], step["func"]): (step, input_signature)
                for step, input_signature in runnable_steps
            }
            for future in as_completed(future_map):
                step, input_signature = future_map[future]
                elapsed = future.result()
                persist_step_state(state, step["key"], input_signature, step.get("outputs", []), elapsed)

    phase_elapsed = time.perf_counter() - phase_start
    print(f"[阶段 {phase_index}/{total_phases}] {phase_label}完成，耗时 {phase_elapsed:.1f}s", flush=True)


def run_serial_phase(
    phase_index: int,
    total_phases: int,
    phase_label: str,
    steps: list[dict],
    state: dict,
    force_rebuild: bool,
) -> None:
    phase_start = time.perf_counter()
    print(f"[阶段 {phase_index}/{total_phases}] {phase_label}", flush=True)
    for step in steps:
        should_run, input_signature = should_run_step(
            step_key=step["key"],
            outputs=step.get("outputs", []),
            signature_builder=step.get("signature_builder"),
            state=state,
            force_rebuild=force_rebuild,
        )
        if not should_run:
            print(f"  - {step['label']}跳过，输入未变化。", flush=True)
            continue
        elapsed = execute_step(step["label"], step["func"])
        persist_step_state(state, step["key"], input_signature, step.get("outputs", []), elapsed)
    phase_elapsed = time.perf_counter() - phase_start
    print(f"[阶段 {phase_index}/{total_phases}] {phase_label}完成，耗时 {phase_elapsed:.1f}s", flush=True)


def build_pipeline_phases(include_report_assets: bool) -> list[tuple[str, str, list[dict]]]:
    phases: list[tuple[str, str, list[dict]]] = [
        (
            "parallel",
            "并发刷新上游真实数据",
            [
                {
                    "key": "external_refresh",
                    "label": "更新外部数据源",
                    "func": update_external_data.main,
                    "outputs": [EXTERNAL_MANIFEST_PATH],
                },
                {
                    "key": "weather_refresh",
                    "label": "刷新天气与热浪场景",
                    "func": fetch_weather.main,
                    "outputs": [WEATHER_SUMMARY_PATH],
                },
                {
                    "key": "official_cooling_refresh",
                    "label": "刷新官方纳凉点",
                    "func": fetch_official_cooling_sites.main,
                    "outputs": [OFFICIAL_COOLING_PATH],
                },
                {
                    "key": "poi_refresh",
                    "label": "抓取 POI 数据",
                    "func": fetch_poi.main,
                    "outputs": [POI_POINTS_PATH],
                },
            ],
        ),
        (
            "parallel",
            "按需重建基础空间数据",
            [
                {
                    "key": "population_grid",
                    "label": "生成人口网格",
                    "func": prepare_population.main,
                    "outputs": [POPULATION_GRID_PATH],
                    "signature_builder": build_worldpop_input_signature,
                },
                {
                    "key": "accessibility",
                    "label": "构建可达性分析",
                    "func": build_accessibility.main,
                    "outputs": [ACCESSIBILITY_GRID_PATH, ACCESSIBILITY_SUMMARY_PATH, POI_SERVICE_POINTS_PATH],
                    "signature_builder": build_accessibility_input_signature,
                },
            ],
        ),
        (
            "serial",
            "按需生成风险与推荐结果",
            [
                {
                    "key": "risk_model",
                    "label": "生成风险模型",
                    "func": build_risk_model.main,
                    "outputs": [RISK_GRID_PATH, RISK_SUMMARY_PATH],
                    "signature_builder": build_risk_input_signature,
                },
                {
                    "key": "recommendations",
                    "label": "生成推荐点位",
                    "func": recommend_sites.main,
                    "outputs": [SITE_RECOMMENDATIONS_PATH, OPTIMIZATION_EXPERIMENTS_PATH],
                    "signature_builder": build_recommendation_input_signature,
                },
            ],
        ),
        (
            "parallel",
            "按需生成实验与审计结果",
            [
                {
                    "key": "competition_experiments",
                    "label": "运行比赛实验",
                    "func": run_competition_experiments.main,
                    "outputs": [COMPETITION_EXPERIMENTS_PATH],
                    "signature_builder": build_experiment_input_signature,
                },
                {
                    "key": "data_authenticity",
                    "label": "生成真实性审计",
                    "func": build_data_authenticity_audit.main,
                    "outputs": [DATA_AUTHENTICITY_PATH],
                    "signature_builder": build_authenticity_input_signature,
                },
            ],
        ),
    ]
    if include_report_assets:
        phases.append(
            (
                "serial",
                "导出答辩与报告图表",
                [
                    {
                        "key": "report_assets",
                        "label": "导出报告图表",
                        "func": export_report_assets.main,
                        "outputs": [REPORT_TABLES_DIR, REPORT_CHARTS_DIR, DOCS_DIR / "研究报告-热龄卫士.md"],
                        "signature_builder": build_report_assets_input_signature,
                    }
                ],
            )
        )
    return phases


def main() -> None:
    args = parse_args()
    phases = build_pipeline_phases(include_report_assets=args.include_report_assets)
    state = load_pipeline_state()
    total_start = time.perf_counter()
    print("开始执行项目数据流水线...", flush=True)

    total_phases = len(phases)
    for phase_index, (phase_type, phase_label, steps) in enumerate(phases, start=1):
        if phase_type == "parallel":
            run_parallel_phase(phase_index, total_phases, phase_label, steps, state, args.force_rebuild)
        else:
            run_serial_phase(phase_index, total_phases, phase_label, steps, state, args.force_rebuild)

    total_elapsed = time.perf_counter() - total_start
    print(f"项目数据流水线执行完成，总耗时 {total_elapsed:.1f}s。", flush=True)


if __name__ == "__main__":
    main()
