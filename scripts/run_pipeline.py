import time

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


PIPELINE_STEPS = [
    ("更新外部数据源", update_external_data.main),
    ("刷新天气与热浪场景", fetch_weather.main),
    ("刷新官方纳凉点", fetch_official_cooling_sites.main),
    ("抓取 POI 数据", fetch_poi.main),
    ("生成人口网格", prepare_population.main),
    ("构建可达性分析", build_accessibility.main),
    ("生成风险模型", build_risk_model.main),
    ("生成推荐点位", recommend_sites.main),
    ("运行比赛实验", run_competition_experiments.main),
    ("生成真实性审计", build_data_authenticity_audit.main),
    ("导出报告图表", export_report_assets.main),
]


def main() -> None:
    total_steps = len(PIPELINE_STEPS)
    total_start = time.perf_counter()
    print("开始执行项目数据流水线...", flush=True)

    for index, (label, func) in enumerate(PIPELINE_STEPS, start=1):
        step_start = time.perf_counter()
        print(f"[{index}/{total_steps}] {label}...", flush=True)
        try:
            func()
        except Exception:
            elapsed = time.perf_counter() - step_start
            print(f"[{index}/{total_steps}] {label}失败，耗时 {elapsed:.1f}s", flush=True)
            raise
        elapsed = time.perf_counter() - step_start
        print(f"[{index}/{total_steps}] {label}完成，耗时 {elapsed:.1f}s", flush=True)

    total_elapsed = time.perf_counter() - total_start
    print(f"项目数据流水线执行完成，总耗时 {total_elapsed:.1f}s。", flush=True)


if __name__ == "__main__":
    main()
