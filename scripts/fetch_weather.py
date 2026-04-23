from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo

from common import PROCESSED_DIR, RAW_DIR, current_timestamp, ensure_directories, fetch_json, load_config, read_json, write_json


OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_HEATWAVE_APPARENT_THRESHOLD = 33.0
FORECAST_HEATWAVE_TEMPERATURE_THRESHOLD = 35.0
HEATWAVE_WINDOW_HOURS = 72


def build_warning_signal(max_temperature: float | None, max_apparent_temperature: float | None, label: str) -> dict:
    temperature = float(max_temperature) if max_temperature is not None else float("-inf")
    apparent = float(max_apparent_temperature) if max_apparent_temperature is not None else float("-inf")

    if apparent >= 40 or temperature >= 37:
        return {
            "level": 4,
            "key": "emergency",
            "label": f"{label} IV级热浪应急",
            "tone": "danger",
            "summary": "需启动高温健康应急响应、巡访和纳凉点强化值守。",
        }
    if apparent >= 37 or temperature >= 35:
        return {
            "level": 3,
            "key": "warning",
            "label": f"{label} III级高温响应",
            "tone": "warm",
            "summary": "需转入高温防护状态，优先保障高龄与慢病人群可达服务。",
        }
    if apparent >= 33 or temperature >= 32:
        return {
            "level": 2,
            "key": "watch",
            "label": f"{label} II级关注",
            "tone": "teal",
            "summary": "需提前发布提示并核对纳凉点开放、物资与巡访安排。",
        }
    return {
        "level": 1,
        "key": "routine",
        "label": f"{label} I级常态监测",
        "tone": "cool",
        "summary": "当前预报未达到热浪阈值，保持常态巡查和数据更新即可。",
    }


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def average(values: list[float]) -> float | None:
    valid = [value for value in values if value is not None]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 2)


def build_trend(payload: dict, limit: int | None = None) -> list[dict]:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    temperatures = hourly.get("temperature_2m", [])
    apparent_temperatures = hourly.get("apparent_temperature", [])

    size = min(len(times), len(temperatures), len(apparent_temperatures))
    if limit is not None:
        size = min(size, limit)

    trend = []
    for index in range(size):
        trend.append(
            {
                "time": times[index],
                "temperature": temperatures[index],
                "apparent_temperature": apparent_temperatures[index],
            }
        )
    return trend


def build_forecast_summary(payload: dict) -> dict:
    hourly = payload.get("hourly", {})
    temperatures = hourly.get("temperature_2m", [])
    humidity = hourly.get("relative_humidity_2m", [])
    apparent_temperatures = hourly.get("apparent_temperature", [])
    precipitation = hourly.get("precipitation", [])
    wind_speed = hourly.get("wind_speed_10m", [])

    next_24_temperatures = temperatures[:24]
    next_72_temperatures = temperatures[:72]
    next_24_apparent = apparent_temperatures[:24]
    next_72_apparent = apparent_temperatures[:72]
    next_24_humidity = humidity[:24]
    next_72_precipitation = precipitation[:72]
    next_72_wind = wind_speed[:72]
    trend = build_trend(payload, limit=72)

    return {
        "source": "Open-Meteo Forecast API",
        "generated_at": current_timestamp(),
        "timezone": payload.get("timezone"),
        "current_temperature": temperatures[0] if temperatures else None,
        "current_humidity": humidity[0] if humidity else None,
        "next_24h_max_temperature": max(next_24_temperatures) if next_24_temperatures else None,
        "next_72h_max_temperature": max(next_72_temperatures) if next_72_temperatures else None,
        "next_24h_max_apparent_temperature": max(next_24_apparent) if next_24_apparent else None,
        "next_72h_max_apparent_temperature": max(next_72_apparent) if next_72_apparent else None,
        "next_24h_mean_humidity": average(next_24_humidity),
        "mean_temperature_72h": average(next_72_temperatures),
        "mean_apparent_temperature_72h": average(next_72_apparent),
        "total_precipitation_72h": round(sum(next_72_precipitation), 2) if next_72_precipitation else None,
        "mean_wind_speed_72h": average(next_72_wind),
        "trend": trend,
    }


def latest_completed_warm_season_year(now: datetime) -> int:
    return now.year if now.month >= 10 else now.year - 1


def load_cached_archive(season_year: int) -> dict | None:
    path = RAW_DIR / f"weather_archive_{season_year}_warm_season.json"
    payload = read_json(path, None)
    hourly = payload.get("hourly", {}) if isinstance(payload, dict) else {}
    if hourly.get("time") and hourly.get("apparent_temperature"):
        return payload
    return None


def fetch_or_load_archive(config: dict, season_year: int) -> tuple[dict, bool]:
    cached = load_cached_archive(season_year)
    if cached is not None:
        return cached, False
    payload = fetch_json(
        OPEN_METEO_ARCHIVE_URL,
        params=build_archive_params(config, season_year),
    )
    return payload, True


def build_archive_params(config: dict, season_year: int) -> dict:
    center = config["study_area"]["center"]
    timezone = config["study_area"].get("timezone", "Asia/Shanghai")
    return {
        "latitude": center["lat"],
        "longitude": center["lon"],
        "start_date": f"{season_year}-06-01",
        "end_date": f"{season_year}-09-30",
        "hourly": ",".join(
            [
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "precipitation",
                "wind_speed_10m",
            ]
        ),
        "timezone": timezone,
    }


def window_night_minimum(times: list[str], apparent_temperatures: list[float]) -> float | None:
    nightly_values = []
    for timestamp, value in zip(times, apparent_temperatures):
        if value is None:
            continue
        hour = datetime.fromisoformat(timestamp).hour
        if hour < 7 or hour >= 20:
            nightly_values.append(value)
    if nightly_values:
        return round(min(nightly_values), 2)
    if apparent_temperatures:
        return round(min(apparent_temperatures), 2)
    return None


def find_hottest_window(payload: dict, season_year: int) -> dict:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    temperatures = hourly.get("temperature_2m", [])
    humidity = hourly.get("relative_humidity_2m", [])
    apparent_temperatures = hourly.get("apparent_temperature", [])
    precipitation = hourly.get("precipitation", [])
    wind_speed = hourly.get("wind_speed_10m", [])

    size = min(
        len(times),
        len(temperatures),
        len(humidity),
        len(apparent_temperatures),
        len(precipitation),
        len(wind_speed),
    )
    if size < HEATWAVE_WINDOW_HOURS:
        raise RuntimeError("历史天气序列长度不足，无法识别 72 小时热浪窗口。")

    best_window = None
    best_score = float("-inf")
    for start_index in range(0, size - HEATWAVE_WINDOW_HOURS + 1):
        end_index = start_index + HEATWAVE_WINDOW_HOURS
        window_times = times[start_index:end_index]
        window_temperatures = temperatures[start_index:end_index]
        window_humidity = humidity[start_index:end_index]
        window_apparent = apparent_temperatures[start_index:end_index]
        window_precipitation = precipitation[start_index:end_index]
        window_wind = wind_speed[start_index:end_index]

        if any(value is None for value in window_apparent):
            continue

        mean_apparent = sum(window_apparent) / len(window_apparent)
        max_apparent = max(window_apparent)
        night_min_apparent = window_night_minimum(window_times, window_apparent) or 0.0
        score = mean_apparent * 0.65 + max_apparent * 0.25 + night_min_apparent * 0.10

        if score <= best_score:
            continue

        best_score = score
        best_window = {
            "profile_type": "historical_heatwave_case",
            "source": "Open-Meteo Archive API",
            "season_year": season_year,
            "search_start_date": f"{season_year}-06-01",
            "search_end_date": f"{season_year}-09-30",
            "selection_metric": "72h weighted apparent temperature severity",
            "window_hours": HEATWAVE_WINDOW_HOURS,
            "start_time": window_times[0],
            "end_time": window_times[-1],
            "case_label": f"{season_year}年夏季最强72小时热浪窗口",
            "mean_temperature": round(sum(window_temperatures) / len(window_temperatures), 2),
            "max_temperature": round(max(window_temperatures), 2),
            "mean_apparent_temperature": round(mean_apparent, 2),
            "max_apparent_temperature": round(max_apparent, 2),
            "night_min_apparent_temperature": round(night_min_apparent, 2),
            "mean_humidity": round(sum(window_humidity) / len(window_humidity), 2),
            "total_precipitation": round(sum(window_precipitation), 2),
            "mean_wind_speed": round(sum(window_wind) / len(window_wind), 2),
            "trend": [
                {
                    "time": time_value,
                    "temperature": temperature_value,
                    "apparent_temperature": apparent_value,
                }
                for time_value, temperature_value, apparent_value in zip(
                    window_times,
                    window_temperatures,
                    window_apparent,
                )
            ],
        }

    if best_window is None:
        raise RuntimeError("未能识别有效的历史热浪窗口。")

    return best_window


def build_forecast_analysis_profile(forecast: dict) -> dict:
    trend = forecast.get("trend", [])[:HEATWAVE_WINDOW_HOURS]
    start_time = trend[0]["time"] if trend else None
    end_time = trend[-1]["time"] if trend else None
    night_minimum = window_night_minimum(
        [item["time"] for item in trend],
        [item["apparent_temperature"] for item in trend],
    )
    return {
        "profile_type": "forecast",
        "source": forecast.get("source"),
        "case_label": "未来72小时监测窗口",
        "selection_metric": "forecast heat monitoring",
        "window_hours": HEATWAVE_WINDOW_HOURS,
        "start_time": start_time,
        "end_time": end_time,
        "mean_temperature": forecast.get("mean_temperature_72h"),
        "max_temperature": forecast.get("next_72h_max_temperature"),
        "mean_apparent_temperature": forecast.get("mean_apparent_temperature_72h"),
        "max_apparent_temperature": forecast.get("next_72h_max_apparent_temperature"),
        "night_min_apparent_temperature": night_minimum,
        "mean_humidity": forecast.get("next_24h_mean_humidity"),
        "total_precipitation": forecast.get("total_precipitation_72h"),
        "mean_wind_speed": forecast.get("mean_wind_speed_72h"),
        "trend": trend,
    }


def choose_analysis_profile(forecast: dict, historical_case: dict) -> tuple[dict, str]:
    forecast_peak_apparent = forecast.get("next_72h_max_apparent_temperature") or float("-inf")
    forecast_peak_temperature = forecast.get("next_72h_max_temperature") or float("-inf")
    forecast_is_heat_event = (
        forecast_peak_apparent >= FORECAST_HEATWAVE_APPARENT_THRESHOLD
        or forecast_peak_temperature >= FORECAST_HEATWAVE_TEMPERATURE_THRESHOLD
    )

    if forecast_is_heat_event:
        profile = build_forecast_analysis_profile(forecast)
        return (
            profile,
            "未来72小时预报已达到高温风险阈值，风险建模直接采用实时预报窗口。",
        )

    profile = dict(historical_case)
    return (
        profile,
        (
            f"当前未来72小时预报峰值仅 {forecast_peak_temperature:.1f}℃ / "
            f"体感 {forecast_peak_apparent:.1f}℃，未达到热浪阈值；"
            f"风险建模切换为 {historical_case.get('case_label', '真实历史热浪案例')}。"
        ),
    )


def main() -> None:
    ensure_directories()
    config = load_config()
    timezone = ZoneInfo(config["study_area"].get("timezone", "Asia/Shanghai"))
    now = datetime.now(timezone)
    center = config["study_area"]["center"]

    shared_hourly_params = {
        "latitude": center["lat"],
        "longitude": center["lon"],
        "hourly": ",".join(
            [
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "precipitation",
                "wind_speed_10m",
            ]
        ),
        "timezone": config["study_area"].get("timezone", "Asia/Shanghai"),
    }

    season_year = latest_completed_warm_season_year(now)
    with ThreadPoolExecutor(max_workers=2) as executor:
        forecast_future = executor.submit(
            fetch_json,
            OPEN_METEO_FORECAST_URL,
            params={**shared_hourly_params, "forecast_days": 4},
        )
        archive_future = executor.submit(
            fetch_or_load_archive,
            config,
            season_year,
        )
        forecast_payload = forecast_future.result()
        archive_payload, archive_was_fetched = archive_future.result()

    forecast_summary = build_forecast_summary(forecast_payload)
    historical_case = find_hottest_window(archive_payload, season_year)

    analysis_profile, risk_context_label = choose_analysis_profile(forecast_summary, historical_case)
    forecast_warning = build_warning_signal(
        forecast_summary.get("next_72h_max_temperature"),
        forecast_summary.get("next_72h_max_apparent_temperature"),
        "实时预报",
    )
    analysis_warning = build_warning_signal(
        analysis_profile.get("max_temperature"),
        analysis_profile.get("max_apparent_temperature"),
        "默认推演",
    )
    summary = {
        "source": "Open-Meteo Forecast API + Open-Meteo Archive API",
        "generated_at": current_timestamp(),
        "timezone": forecast_payload.get("timezone") or archive_payload.get("timezone"),
        "forecast": forecast_summary,
        "historical_heatwave_case": historical_case,
        "analysis_profile": analysis_profile,
        "default_risk_profile": analysis_profile.get("profile_type"),
        "risk_context_label": risk_context_label,
        "warning_signals": {
            "forecast": forecast_warning,
            "analysis_profile": analysis_warning,
        },
        "current_temperature": forecast_summary.get("current_temperature"),
        "current_humidity": forecast_summary.get("current_humidity"),
        "next_24h_max_temperature": forecast_summary.get("next_24h_max_temperature"),
        "next_72h_max_temperature": forecast_summary.get("next_72h_max_temperature"),
        "next_24h_max_apparent_temperature": forecast_summary.get("next_24h_max_apparent_temperature"),
        "next_72h_max_apparent_temperature": forecast_summary.get("next_72h_max_apparent_temperature"),
        "next_24h_mean_humidity": forecast_summary.get("next_24h_mean_humidity"),
        "trend": forecast_summary.get("trend", []),
    }

    write_json(RAW_DIR / "weather_forecast.json", forecast_payload)
    if archive_was_fetched:
        write_json(RAW_DIR / f"weather_archive_{season_year}_warm_season.json", archive_payload)
    write_json(RAW_DIR / "weather_analysis_profile.json", analysis_profile)
    write_json(PROCESSED_DIR / "weather_summary.json", summary)

    if archive_was_fetched:
        print("天气预报与历史热浪场景已更新。")
    else:
        print("天气预报已实时刷新，历史热浪场景复用最新本地归档。")


if __name__ == "__main__":
    main()
