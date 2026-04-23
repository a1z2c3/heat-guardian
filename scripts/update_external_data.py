from datetime import datetime
from pathlib import Path
import shutil
import zipfile
from concurrent.futures import ThreadPoolExecutor

import requests
import urllib3

from common import DATA_DIR, current_timestamp, read_json, write_json


USER_AGENT = "reling-guard/0.2"
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


def request_with_retry(
    method: str,
    url: str,
    *,
    stream: bool = False,
    allow_not_found: bool = False,
) -> requests.Response | None:
    last_error: Exception | None = None
    for attempt in range(3):
        verify = attempt < 2
        try:
            if not verify:
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            response = requests.request(
                method,
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=(15, 60),
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


def stream_download(url: str, destination: Path) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = destination.with_suffix(destination.suffix + ".part")
    response = request_with_retry("GET", url, stream=True)
    try:
        with tmp_path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
        tmp_path.replace(destination)
        return {
            "url": response.url,
            "etag": response.headers.get("ETag"),
            "last_modified": response.headers.get("Last-Modified"),
            "content_length": response.headers.get("Content-Length"),
            "downloaded_at": current_timestamp(),
        }
    finally:
        response.close()
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


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

    if zip_changed:
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
    for candidate in iterate_worldpop_candidates(manifest):
        age65_info, age80_info = probe_worldpop_pair(candidate)
        if age65_info is None:
            continue
        if age80_info is None:
            continue
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


def update_worldpop(manifest: dict) -> None:
    worldpop_manifest = manifest.get("worldpop", {})
    latest_bundle = detect_latest_worldpop_bundle(worldpop_manifest)

    for key, age_code in (("age65", "65"), ("age80", "80")):
        canonical_path = WORLDPOP_CANONICAL_FILES[key]
        remote_info = latest_bundle[key]
        local_info = (worldpop_manifest.get("files") or {}).get(key, {})
        if remote_changed(remote_info, local_info.get("remote"), canonical_path):
            download_info = stream_download(latest_bundle[f"{key}_url"], canonical_path)
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


def main() -> None:
    ensure_external_dirs()
    manifest = read_json(MANIFEST_PATH, {})

    update_geofabrik(manifest)
    update_worldpop(manifest)

    manifest["updated_at"] = current_timestamp()
    write_json(MANIFEST_PATH, manifest)
    print("外部真实数据源已完成自动更新。")


if __name__ == "__main__":
    main()
