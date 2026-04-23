import build_accessibility
import build_data_authenticity_audit
import build_risk_model
import export_report_assets
import fetch_poi
import fetch_official_cooling_sites
import fetch_weather
import prepare_population
import recommend_sites
import run_competition_experiments
import update_external_data


def main() -> None:
    print("开始执行项目数据流水线...")
    update_external_data.main()
    fetch_weather.main()
    fetch_official_cooling_sites.main()
    fetch_poi.main()
    prepare_population.main()
    build_accessibility.main()
    build_risk_model.main()
    recommend_sites.main()
    run_competition_experiments.main()
    build_data_authenticity_audit.main()
    export_report_assets.main()
    print("项目数据流水线执行完成。")


if __name__ == "__main__":
    main()
