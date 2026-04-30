from datetime import datetime, timedelta
from pathlib import Path
import shutil
import zipfile
from concurrent.futures import ThreadPoolExecutor

import requests
import urllib3

from common import DATA_DIR, current_timestamp, read_json, write_json


USER_AGENT = "reling-guard/0.2"
REMOTE_REFRESH_TTL_HOURS = 24
REQUEST_ATTEMPTS = 2
REQUEST_CONNECT_TIMEOUT_SECONDS = 8
REQUEST_READ_TIMEOUT_SECONDS = 15
EXTERNAL_DIR = DATA_DIR / "external"
WORLDPOP_DIR = EXTERNAL_DIR / "worldpop"
GEOFABRIK_DIR = EXTERNAL_DIR / "geofabrik"
GEOFABRIK_HUBEI_DIR = GEOFABRIK_DIR / "hubei"
MANIFEST_PATH = EXTERNAL_DIR / "source_refresh_manifest.json"
GEOFABRIK_URL = "https://download.geofabrik.de/asia/china/hubei-latest-free.shp.zip"
GEOFABRIK_ZIP_PATH = GEOFABRIK_DIR / "hubei-latest-free.shp.zip"
WORLDPOP_BASE_URL = "https://data.worldpop.org/GIS/AgeSex_structures/Global_2015_2030"
WORLDPOP_CANONICAL_FILES = {
    "age65": WORLDPOP_DIR / "worldpop_age65_plus_latest.tif",
    "age80": WORLDPOP_DIR / "worldpop_age80_plus_latest.tif",
}


def ensure_external_dirs() -> None:
    for path in (EXTERNAL_DIR, WORLDPOP_DIR, GEOFABRIK_DIR, GEOFABRIK_HUBEI_DIR):
        path.mkdir(parents=True, exist_ok=True)


def checked_recently(checked_at: str | None, *, hours: int = REMOTE_REFRESH_TTL_HOURS) -> bool:
    if not checked_at:
        return False
    try:
        checked_time = datetime.fromisoformat(checked_at)
        now = datetime.fromisoformat(current_timestamp())
    except ValueError:
        return False
    return (now - checked_time) <= timedelta(hours=hours)


def geofabrik_assets_ready() -> bool:
    return GEOFABRIK_ZIP_PATH.exists() and (GEOFABRIK_HUBEI_DIR / "gis_osm_roads_free_1.shp").exists()


def worldpop_assets_ready() -> bool:
    return all(path.exists() for path in WORLDPOP_CANONICAL_FILES.values())


def request_with_retry(
    method: str,
    url: str,
    *,
    stream: bool = False,
    allow_not_found: bool = False,
) -> requests.Response | None:
    last_error: Exception | None = None
    for attempt in range(REQUEST_ATTEMPTS):
        verify = attempt == 0
        try:
            if not verify:
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            response = requests.request(
                method,
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=(REQUEST_CONNECT_TIMEOUT_SECONDS, REQUEST_READ_TIMEOUT_SECONDS),
                allow_redirects=True,
                stream=stream,
                verify=verify,
            )
            if response.status_code == 404 and allow_not_found:
                response.close()
                return None
            response.raise_for_status()
            return response
        except Exception as error:
            last_error = error
    raise last_error if last_error is not None else RuntimeError(f"请求失败: {url}")


def probe_remote_file(url: str) -> dict | None:
    response = request_with_retry("HEAD", url, allow_not_found=True)
    if response is not None:
        headers = {
            "url": response.url,
            "etag": response.headers.get("ETag"),
            "last_modified": response.headers.get("Last-Modified"),
            "content_length": response.headers.get("Content-Length"),
        }
        response.close()
        return headers

    response = request_with_retry("GET", url, stream=True, allow_not_found=True)
    if response is None:
        return None
    headers = {
        "url": response.url,
        "etag": response.headers.get("ETag"),
        "last_modified": response.headers.get("Last-Modified"),
        "content_length": response.headers.get("Content-Length"),
    }
    response.close()
    return headers


def remote_changed(remote_info: dict | None, local_info: dict | None, target_path: Path) -> bool:
    if remote_info is None:
        return False
    if not target_path.exists() or not local_info:
        return True

    remote_signature = (
        remote_info.get("etag"),
        remote_info.get("last_modified"),
        remote_info.get("content_length"),
    )
    local_signature = (
        local_info.get("etag"),
        local_info.get("last_modified"),
        local_info.get("content_length"),
    )
    if remote_signature != local_signature:
        return True

    return False


def content_length_matches(remote_info: dict | None, target_path: Path) -> bool:
    if remote_info is None or not target_path.exists():
        return False
    content_length = remote_info.get("content_length")
    if not content_length:
        return False
    try:
        return target_path.stat().st_size == int(content_length)
    except (TypeError, ValueError):
        return False


def local_download_info(path: Path, remote_info: dict | None) -> dict:
    stat = path.stat()
    return {
        "url": (remote_info or {}).get("url"),
        "etag": (remote_info or {}).get("etag"),
        "last_modified": (remote_info or {}).get("last_modified"),
        "content_length": (remote_info or {}).get("content_length") or str(stat.st_size),
        "downloaded_at": current_timestamp(),
        "recovered_from_local_cache": True,
    }


def remove_partial_download(path: Path) -> None:
    path.with_suffix(path.suffix + ".part").unlink(missing_ok=True)


def stream_download(url: str, destination: Path) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = destination.with_suffix(destination.suffix + ".part")
    last_error: Exception | None = None

    for attempt in range(1, 4):
        response = None
        downloaded = 0
        last_reported_mb = -1
        try:
            response = request_with_retry("GET", url, stream=True)
            total_header = response.headers.get("Content-Length")
            total_bytes = int(total_header) if total_header and total_header.isdigit() else None
            total_label = f"{total_bytes / 1024 / 1024:.1f} MB" if total_bytes else "unknown size"
            print(f"Downloading {destination.name} (attempt {attempt}/3, {total_label})", flush=True)

            with tmp_path.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    handle.write(chunk)
                    downloaded += len(chunk)
                    downloaded_mb = int(downloaded / 1024 / 1024)
                    if downloaded_mb == last_reported_mb or downloaded_mb % 10 != 0:
                        continue
                    last_reported_mb = downloaded_mb
                    if total_bytes:
                        percent = downloaded / total_bytes * 100
                        print(
                            f"  {destination.name}: {downloaded_mb} MB / "
                            f"{total_bytes / 1024 / 1024:.1f} MB ({percent:.1f}%)",
                            flush=True,
                        )
                    else:
                        print(f"  {destination.name}: {downloaded_mb} MB", flush=True)

            tmp_path.replace(destination)
            return {
                "url": response.url,
                "etag": response.headers.get("ETag"),
                "last_modified": response.headers.get("Last-Modified"),
                "content_length": response.headers.get("Content-Length"),
                "downloaded_at": current_timestamp(),
            }
        except Exception as error:
            last_error = error
            print(f"Download failed for {destination.name} on attempt {attempt}/3: {error}", flush=True)
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
        finally:
            if response is not None:
                response.close()

    raise last_error if last_error is not None else RuntimeError(f"download failed: {url}")


def clear_directory_contents(directory: Path) -> None:
    if not directory.exists():
        return
    for child in directory.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink(missing_ok=True)


def update_geofabrik(manifest: dict) -> None:
    geofabrik_manifest = manifest.get("geofabrik", {})
    if geofabrik_assets_ready() and not geofabrik_manifest.get("remote"):
        print("Geofabrik local cache is complete; recovering manifest without remote probe.", flush=True)
        remove_partial_download(GEOFABRIK_ZIP_PATH)
        manifest["geofabrik"] = {
            **geofabrik_manifest,
            "status": "recovered_local_cache",
            "source_url": GEOFABRIK_URL,
            "zip_path": str(GEOFABRIK_ZIP_PATH),
            "extract_dir": str(GEOFABRIK_HUBEI_DIR),
            "download": local_download_info(GEOFABRIK_ZIP_PATH, None),
            "checked_at": current_timestamp(),
            "skip_reason": "complete_local_cache_without_manifest",
        }
        return

    if checked_recently(geofabrik_manifest.get("checked_at")) and geofabrik_assets_ready():
        manifest.setdefault("geofabrik", {}).update(
            {
                "status": "recent_cache_skip",
                "source_url": GEOFABRIK_URL,
                "zip_path": str(GEOFABRIK_ZIP_PATH),
                "extract_dir": str(GEOFABRIK_HUBEI_DIR),
                "checked_at": geofabrik_manifest.get("checked_at"),
                "skip_reason": f"recently_checked_within_{REMOTE_REFRESH_TTL_HOURS}h",
            }
        )
        print(f"Geofabrik 最近 {REMOTE_REFRESH_TTL_HOURS} 小时内已检查，复用本地缓存。")
        return

    print("检查 Geofabrik 湖北路网数据...")
    remote_info = probe_remote_file(GEOFABRIK_URL)

    if remote_info is None:
        if GEOFABRIK_ZIP_PATH.exists() and (GEOFABRIK_HUBEI_DIR / "gis_osm_roads_free_1.shp").exists():
            manifest.setdefault("geofabrik", {}).update(
                {
                    "status": "using_cached_snapshot",
                    "source_url": GEOFABRIK_URL,
                    "checked_at": current_timestamp(),
                }
            )
            return
        raise RuntimeError("Geofabrik 最新湖北数据不可用，且本地不存在可用缓存。")

    zip_changed = remote_changed(remote_info, geofabrik_manifest.get("remote"), GEOFABRIK_ZIP_PATH)
    extracted_missing = not (GEOFABRIK_HUBEI_DIR / "gis_osm_roads_free_1.shp").exists()

    if zip_changed and not extracted_missing and content_length_matches(remote_info, GEOFABRIK_ZIP_PATH):
        print("Geofabrik local cache matches the remote size; recovering manifest and skipping download.")
        remove_partial_download(GEOFABRIK_ZIP_PATH)
        manifest["geofabrik"] = {
            **geofabrik_manifest,
            "status": "recovered_local_cache",
            "source_url": GEOFABRIK_URL,
            "zip_path": str(GEOFABRIK_ZIP_PATH),
            "extract_dir": str(GEOFABRIK_HUBEI_DIR),
            "remote": remote_info,
            "download": local_download_info(GEOFABRIK_ZIP_PATH, remote_info),
            "checked_at": current_timestamp(),
        }
        return

    if zip_changed:
        print("检测到 Geofabrik 远端快照变化，开始下载并解压...")
        download_info = stream_download(GEOFABRIK_URL, GEOFABRIK_ZIP_PATH)
        clear_directory_contents(GEOFABRIK_HUBEI_DIR)
        with zipfile.ZipFile(GEOFABRIK_ZIP_PATH, "r") as archive:
            archive.extractall(GEOFABRIK_HUBEI_DIR)
        manifest["geofabrik"] = {
            "status": "downloaded",
            "source_url": GEOFABRIK_URL,
            "zip_path": str(GEOFABRIK_ZIP_PATH),
            "extract_dir": str(GEOFABRIK_HUBEI_DIR),
            "remote": remote_info,
            "download": download_info,
            "checked_at": current_timestamp(),
        }
        return

    if extracted_missing:
        print("Geofabrik 压缩包存在但解压目录缺失，重新解压本地缓存...")
        clear_directory_contents(GEOFABRIK_HUBEI_DIR)
        with zipfile.ZipFile(GEOFABRIK_ZIP_PATH, "r") as archive:
            archive.extractall(GEOFABRIK_HUBEI_DIR)
        manifest["geofabrik"] = {
            **geofabrik_manifest,
            "status": "re_extracted",
            "source_url": GEOFABRIK_URL,
            "zip_path": str(GEOFABRIK_ZIP_PATH),
            "extract_dir": str(GEOFABRIK_HUBEI_DIR),
            "remote": remote_info,
            "checked_at": current_timestamp(),
        }
        return

    manifest["geofabrik"] = {
        **geofabrik_manifest,
        "status": "up_to_date",
        "source_url": GEOFABRIK_URL,
        "zip_path": str(GEOFABRIK_ZIP_PATH),
        "extract_dir": str(GEOFABRIK_HUBEI_DIR),
        "remote": remote_info,
        "checked_at": current_timestamp(),
    }
    print("Geofabrik 已是最新，无需重新下载。")


def build_worldpop_url(age_code: str, data_year: int, release: str) -> str:
    return (
        f"{WORLDPOP_BASE_URL}/{release}/{data_year}/CHN/v1/1km_ua/constrained/"
        f"chn_t_{age_code}_{data_year}_CN_1km_{release}_UA_v1.tif"
    )


def worldpop_candidates() -> list[dict]:
    current_year = datetime.now().year
    candidates: list[dict] = []
    for data_year in range(current_year - 1, current_year - 6, -1):
        release_tokens: list[str] = []
        for release_year in (current_year, current_year - 1, data_year, data_year - 1):
            for suffix in ("B", "A"):
                token = f"R{release_year}{suffix}"
                if token not in release_tokens:
                    release_tokens.append(token)
        for release in release_tokens:
            candidates.append(
                {
                    "data_year": data_year,
                    "release": release,
                    "age65_url": build_worldpop_url("65", data_year, release),
                    "age80_url": build_worldpop_url("80", data_year, release),
                }
            )
    return candidates


def manifest_worldpop_candidate(manifest: dict | None) -> dict | None:
    if not manifest:
        return None
    data_year = manifest.get("data_year")
    release = manifest.get("release")
    if not data_year or not release:
        return None
    return {
        "data_year": data_year,
        "release": release,
        "age65_url": build_worldpop_url("65", int(data_year), str(release)),
        "age80_url": build_worldpop_url("80", int(data_year), str(release)),
    }


def iterate_worldpop_candidates(manifest: dict | None) -> list[dict]:
    candidates = []
    preferred = manifest_worldpop_candidate(manifest)
    if preferred is not None:
        candidates.append(preferred)
    seen = {(item["data_year"], item["release"]) for item in candidates}
    for candidate in worldpop_candidates():
        key = (candidate["data_year"], candidate["release"])
        if key in seen:
            continue
        seen.add(key)
        candidates.append(candidate)
    return candidates


def probe_worldpop_pair(candidate: dict) -> tuple[dict | None, dict | None]:
    with ThreadPoolExecutor(max_workers=2) as executor:
        age65_future = executor.submit(probe_remote_file, candidate["age65_url"])
        age80_future = executor.submit(probe_remote_file, candidate["age80_url"])
        return age65_future.result(), age80_future.result()


def detect_latest_worldpop_bundle(manifest: dict | None = None) -> dict:
    print("探测 WorldPop 中国年龄结构栅格最新可用版本...")
    for candidate in iterate_worldpop_candidates(manifest):
        print(f"  probing WorldPop {candidate['release']} / {candidate['data_year']}", flush=True)
        age65_info, age80_info = probe_worldpop_pair(candidate)
        if age65_info is None:
            continue
        if age80_info is None:
            continue
        print(f"已定位 WorldPop 可用版本：{candidate['release']} / {candidate['data_year']}")
        return {
            "data_year": candidate["data_year"],
            "release": candidate["release"],
            "age65": age65_info,
            "age80": age80_info,
            "age65_url": candidate["age65_url"],
            "age80_url": candidate["age80_url"],
        }
    raise RuntimeError("未能自动探测到可用的 WorldPop 中国年龄结构栅格。")


def cleanup_worldpop_dir() -> None:
    for path in WORLDPOP_DIR.glob("*.tif"):
        if path not in WORLDPOP_CANONICAL_FILES.values():
            path.unlink(missing_ok=True)


def mark_worldpop_refresh_failed(manifest: dict, worldpop_manifest: dict, error: Exception) -> None:
    status = "remote_refresh_failed_using_cache" if worldpop_assets_ready() else "remote_refresh_failed_no_cache"
    manifest["worldpop"] = {
        **worldpop_manifest,
        "status": status,
        "source": worldpop_manifest.get("source", "WorldPop official age-sex structures"),
        "country": worldpop_manifest.get("country", "CHN"),
        "resolution": worldpop_manifest.get("resolution", "1km_ua_constrained"),
        "checked_at": current_timestamp(),
        "error": str(error),
    }
    print(f"WorldPop refresh failed ({status}); continuing with available cache or fallback: {error}", flush=True)


def update_worldpop(manifest: dict) -> None:
    worldpop_manifest = manifest.get("worldpop", {})
    if checked_recently(worldpop_manifest.get("checked_at")) and worldpop_assets_ready():
        manifest.setdefault("worldpop", {}).update(
            {
                "status": "recent_cache_skip",
                "source": worldpop_manifest.get("source", "WorldPop official age-sex structures"),
                "country": worldpop_manifest.get("country", "CHN"),
                "resolution": worldpop_manifest.get("resolution", "1km_ua_constrained"),
                "data_year": worldpop_manifest.get("data_year"),
                "release": worldpop_manifest.get("release"),
                "checked_at": worldpop_manifest.get("checked_at"),
                "skip_reason": f"recently_checked_within_{REMOTE_REFRESH_TTL_HOURS}h",
            }
        )
        print(f"WorldPop 最近 {REMOTE_REFRESH_TTL_HOURS} 小时内已检查，复用本地缓存。")
        return

    if not worldpop_assets_ready() and not (worldpop_manifest.get("files") or {}):
        for path in WORLDPOP_CANONICAL_FILES.values():
            remove_partial_download(path)
        manifest["worldpop"] = {
            **worldpop_manifest,
            "status": "deferred_no_local_cache",
            "source": worldpop_manifest.get("source", "WorldPop official age-sex structures"),
            "country": worldpop_manifest.get("country", "CHN"),
            "resolution": worldpop_manifest.get("resolution", "1km_ua_constrained"),
            "checked_at": current_timestamp(),
            "skip_reason": "missing_worldpop_cache_deferred_to_keep_startup_responsive",
        }
        print("WorldPop local cache is missing; deferring remote download and using population fallback.", flush=True)
        return

    for path in WORLDPOP_CANONICAL_FILES.values():
        remove_partial_download(path)

    try:
        print("Checking WorldPop remote bundle...", flush=True)
        latest_bundle = detect_latest_worldpop_bundle(worldpop_manifest)
    except Exception as error:
        mark_worldpop_refresh_failed(manifest, worldpop_manifest, error)
        return

    for key, age_code in (("age65", "65"), ("age80", "80")):
        canonical_path = WORLDPOP_CANONICAL_FILES[key]
        remote_info = latest_bundle[key]
        local_info = (worldpop_manifest.get("files") or {}).get(key, {})
        if remote_changed(remote_info, local_info.get("remote"), canonical_path):
            print(f"检测到 WorldPop {age_code}+ 栅格更新，开始下载...")
            try:
                download_info = stream_download(latest_bundle[f"{key}_url"], canonical_path)
            except Exception as error:
                mark_worldpop_refresh_failed(manifest, worldpop_manifest, error)
                return
            local_info = {
                "path": str(canonical_path),
                "remote_name": Path(latest_bundle[f"{key}_url"]).name,
                "remote": remote_info,
                "download": download_info,
            }
        else:
            local_info = {
                **local_info,
                "path": str(canonical_path),
                "remote_name": Path(latest_bundle[f"{key}_url"]).name,
                "remote": remote_info,
            }
        manifest.setdefault("worldpop", {}).setdefault("files", {})[key] = local_info

    cleanup_worldpop_dir()
    manifest["worldpop"].update(
        {
            "status": "up_to_date",
            "source": "WorldPop official age-sex structures",
            "country": "CHN",
            "resolution": "1km_ua_constrained",
            "data_year": latest_bundle["data_year"],
            "release": latest_bundle["release"],
            "checked_at": current_timestamp(),
        }
    )
    print("WorldPop 检查完成。")


def main() -> None:
    ensure_external_dirs()
    manifest = read_json(MANIFEST_PATH, {})

    print("开始检查外部数据源缓存状态...")
    update_geofabrik(manifest)
    update_worldpop(manifest)

    manifest["updated_at"] = current_timestamp()
    write_json(MANIFEST_PATH, manifest)
    print("外部真实数据源已完成自动更新。")


if __name__ == "__main__":
    main()
