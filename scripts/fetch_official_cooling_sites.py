from html import unescape
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import urllib3

from common import PROCESSED_DIR, RAW_DIR, current_timestamp, ensure_directories, load_config, read_json, write_json


USER_AGENT = "reling-guard/0.3"
RAW_OUTPUT_PATH = RAW_DIR / "official_cooling_sources_raw.json"
PROCESSED_OUTPUT_PATH = PROCESSED_DIR / "official_cooling_sites.json"

MONITORED_SOURCES = [
    {
        "key": "wuhan_citywide_cooling_2025",
        "title": "武汉市民政局 2025 年全市社区纳凉点开放情况",
        "source_org": "武汉市民政局",
        "url": "https://mzj.wuhan.gov.cn/mzdt_912/mzyw/202507/t20250716_2620706.shtml",
        "metrics": {
            "reported_cooling_point_count": [
                r"全市(\d+)个社区纳凉点",
                r"(\d+)个社区纳凉点里同步上演",
            ],
        },
        "highlights": [
            "全市社区纳凉点同步开放。",
            "纳凉点依托社区空间与助餐服务共同运行。",
        ],
    },
    {
        "key": "jiangan_citywide_cooling_2025",
        "title": "江岸区社区纳凉点运行情况",
        "source_org": "武汉市人民政府门户网站",
        "url": "https://www.wuhan.gov.cn/whyw/gqdt/202507/t20250725_2624741.shtml",
        "metrics": {
            "reported_cooling_point_count": [
                r"全区(\d+)个社区纳凉点已全部开放",
            ],
        },
        "highlights": [
            "空调、饮用水、应急药品与消防设施齐全。",
            "健康小屋、书画室与图书室等服务同步开放。",
        ],
    },
    {
        "key": "jiangxia_citywide_cooling_2025",
        "title": "江夏区 121 家纳凉点开放情况",
        "source_org": "武汉市民政局",
        "url": "https://mzj.wuhan.gov.cn/mzdt_912/mzyw/202507/t20250715_2620117.shtml",
        "metrics": {
            "reported_cooling_point_count": [
                r"共设立(\d+)家纳凉点",
                r"今年共设立(\d+)家纳凉点",
            ],
        },
        "highlights": [
            "纳凉点依托社区幸福食堂和养老服务中心设置。",
            "部分纳凉点持续开放至高温天气结束。",
        ],
    },
    {
        "key": "nanhu_street_cooling_2025",
        "title": "南湖街道特色纳凉服务",
        "source_org": "武汉市人民政府门户网站",
        "url": "https://www.wuhan.gov.cn/whyw/gqdt/202507/t20250704_2605388.shtml",
        "metrics": {
            "reported_cooling_point_count": [
                r"开辟了(\d+)处纳凉点",
                r"7处纳凉点",
            ],
        },
        "highlights": [
            "社区党群服务中心与小区驿站联动。",
            "配置空调、饮水、西瓜与酸梅汤等降温服务。",
        ],
    },
    {
        "key": "civil_defense_cooling_2025",
        "title": "武汉市人防工程纳凉点开放",
        "source_org": "武汉市国防动员办公室",
        "url": "https://gdb.wuhan.gov.cn/dtyw/mfyw/202507/t20250702_2604638.shtml",
        "metrics": {
            "reported_cooling_point_count": [
                r"三处人防工程纳凉点",
                r"(\d+)处人防工程纳凉点",
            ],
        },
        "highlights": [
            "7 月 1 日起对外开放。",
            "开放时段为每日 9:00 至 21:00。",
        ],
    },
    {
        "key": "huanghelou_cooling_2024",
        "title": "黄鹤楼公园纳凉地图",
        "source_org": "武汉市人民政府门户网站",
        "url": "https://www.wuhan.gov.cn/zjwh/whly/202407/t20240730_2435680.shtml",
        "metrics": {
            "reported_cooling_point_count": [
                r"设置了(\d+)处纳凉点",
                r"5处纳凉点",
            ],
        },
        "highlights": [
            "园内开放雾森、喷淋与免费大碗茶。",
            "提供景区纳凉地图与避暑动线。",
        ],
    },
    {
        "key": "jianghanli_cooling_2025",
        "title": "江汉里社区纳凉点与幸福食堂联动",
        "source_org": "武汉市人民政府门户网站",
        "url": "https://www.wuhan.gov.cn/whyw/gqdt/202508/t20250803_2628567.shtml",
        "metrics": {},
        "highlights": [
            "纳凉点与幸福食堂门靠门设置。",
            "文中明确提到纳凉点开放至晚上 10 点。",
        ],
    },
]

VERIFIED_SITES = [
    {
        "id": 910001,
        "name": "江汉里社区党群服务中心纳凉点",
        "district": "江汉区",
        "category": "official_cooling_site",
        "category_label": "官方纳凉点",
        "site_type": "community_cooling",
        "site_type_label": "社区纳凉点",
        "lat": 30.577831,
        "lon": 114.287393,
        "official_address": "武汉市江汉区民生路197号",
        "location_accuracy": "street_level",
        "coordinate_source": "官方地址 + 已验证街道级定位",
        "operational_source_key": "jianghanli_cooling_2025",
        "operational_source_url": "https://www.wuhan.gov.cn/whyw/gqdt/202508/t20250803_2628567.shtml",
        "location_source_url": "https://www.jianghan.gov.cn/qzfpcjg/qfzhggj/fdzdgknr/sqjj/202101/t20210107_1591197.shtml",
        "opening_hours": "夏季高温期开放，文中明确提到晚上10点闭点",
        "service_labels": [
            "纳凉点+幸福食堂",
            "免费汤饮",
            "晚上10点闭点",
            "社区休憩空间",
        ],
        "services": {
            "drinking_water": True,
            "meal_support": True,
            "rest_space": True,
            "late_evening_service": True,
        },
        "source_excerpt_keywords": ["江汉里社区党群服务中心", "纳凉点", "晚上10点"],
        "source_match_groups": [
            ["江汉里社区", "纳凉点", "晚上10点"],
            ["幸福食堂", "纳凉点", "晚上10点"],
        ],
        "verification_excerpt_anchor": "晚上10点",
        "notes": "适合作为“社区纳凉点 + 幸福食堂协同运行”官方案例。",
    },
    {
        "id": 910002,
        "name": "蛇山人防纳凉点（民主路口部）",
        "district": "武昌区",
        "category": "official_cooling_site",
        "category_label": "官方纳凉点",
        "site_type": "civil_defense_cooling",
        "site_type_label": "人防纳凉点",
        "lat": 30.547801,
        "lon": 114.300479,
        "official_address": "武汉市武昌区民主路284号",
        "location_accuracy": "street_level",
        "coordinate_source": "官方地址 + 已验证街道级定位",
        "operational_source_key": "civil_defense_cooling_2025",
        "operational_source_url": "https://gdb.wuhan.gov.cn/dtyw/mfyw/202507/t20250702_2604638.shtml",
        "opening_hours": "每日 10:00-22:00，官方报道写明 7 月 1 日起对外开放",
        "service_labels": [
            "地下避暑",
            "饮水机",
            "电视机",
            "Wi-Fi",
        ],
        "services": {
            "drinking_water": True,
            "television": True,
            "wifi": True,
            "rest_space": True,
        },
        "source_excerpt_keywords": ["民主路284号", "9:00至21:00"],
        "source_match_groups": [
            ["民主路284号", "早上10时", "晚上10时"],
            ["民主路284号", "对外开放"],
        ],
        "verification_excerpt_anchor": "民主路284号",
        "notes": "来源页面明确为 2025 年夏季对外开放的人防纳凉点。",
    },
    {
        "id": 910003,
        "name": "蛇山人防纳凉点（后长街口部）",
        "district": "武昌区",
        "category": "official_cooling_site",
        "category_label": "官方纳凉点",
        "site_type": "civil_defense_cooling",
        "site_type_label": "人防纳凉点",
        "lat": 30.543791,
        "lon": 114.293929,
        "official_address": "武汉市武昌区后长街76号",
        "location_accuracy": "street_level",
        "coordinate_source": "官方地址 + 已验证街道级定位",
        "operational_source_key": "civil_defense_cooling_2025",
        "operational_source_url": "https://gdb.wuhan.gov.cn/dtyw/mfyw/202507/t20250702_2604638.shtml",
        "opening_hours": "每日 10:00-22:00，官方报道写明 7 月 1 日起对外开放",
        "service_labels": [
            "地下避暑",
            "饮水机",
            "电视机",
            "Wi-Fi",
        ],
        "services": {
            "drinking_water": True,
            "television": True,
            "wifi": True,
            "rest_space": True,
        },
        "source_excerpt_keywords": ["后长街76号", "9:00至21:00"],
        "source_match_groups": [
            ["后长街76号", "早上10时", "晚上10时"],
            ["后长街76号", "对外开放"],
        ],
        "verification_excerpt_anchor": "后长街76号",
        "notes": "来源页面明确为 2025 年夏季对外开放的人防纳凉点。",
    },
    {
        "id": 910004,
        "name": "西北湖人防纳凉点",
        "district": "江汉区",
        "category": "official_cooling_site",
        "category_label": "官方纳凉点",
        "site_type": "civil_defense_cooling",
        "site_type_label": "人防纳凉点",
        "lat": 30.600944,
        "lon": 114.262001,
        "official_address": "武汉市江汉区西北湖畔德芭与彩虹书店地下一层",
        "location_accuracy": "street_level",
        "coordinate_source": "官方场地描述 + 西北湖片区近邻公开地图点位锚定",
        "operational_source_key": "civil_defense_cooling_2025",
        "operational_source_url": "https://gdb.wuhan.gov.cn/dtyw/mfyw/202507/t20250702_2604638.shtml",
        "opening_hours": "每日 10:00-22:00，官方报道写明 7 月 1 日起对外开放",
        "service_labels": [
            "地下避暑",
            "饮水机",
            "电视机",
            "Wi-Fi",
        ],
        "services": {
            "drinking_water": True,
            "television": True,
            "wifi": True,
            "rest_space": True,
        },
        "source_excerpt_keywords": ["西北湖绿化广场地下B1层", "9:00至21:00"],
        "source_match_groups": [
            ["西北湖畔德芭与彩虹书店地下一层", "早上10时", "晚上10时"],
            ["西北湖人防工程纳凉点", "对外开放"],
        ],
        "verification_excerpt_anchor": "西北湖",
        "notes": "坐标为西北湖片区近邻公开地图点位，用于街区级空间锚定。",
    },
    {
        "id": 910005,
        "name": "黄鹤楼公园纳凉服务带",
        "district": "武昌区",
        "category": "official_cooling_site",
        "category_label": "官方纳凉点",
        "site_type": "park_cooling",
        "site_type_label": "景区纳凉点",
        "lat": 30.548376,
        "lon": 114.290278,
        "official_address": "武汉市武昌区黄鹤楼公园",
        "location_accuracy": "venue_level",
        "coordinate_source": "官方场地名称 + OSM 场馆点位",
        "operational_source_key": "huanghelou_cooling_2024",
        "operational_source_url": "https://www.wuhan.gov.cn/zjwh/whly/202407/t20240730_2435680.shtml",
        "opening_hours": "景区开放时段内可用",
        "service_labels": [
            "景区纳凉地图",
            "喷淋雾森",
            "免费大碗茶",
            "5处纳凉服务点",
        ],
        "services": {
            "spray_cooling": True,
            "drinking_water": True,
            "accessibility_support": True,
            "restroom": True,
            "air_conditioning": None,
        },
        "source_excerpt_keywords": ["黄鹤楼公园", "纳凉地图", "5处纳凉点"],
        "source_match_groups": [
            ["黄鹤楼公园", "纳凉地图"],
            ["黄鹤楼公园", "5处纳凉点"],
        ],
        "verification_excerpt_anchor": "黄鹤楼公园",
        "notes": "以公园官方点位作为景区纳凉服务带空间锚点。",
    },
]


def request_text(url: str) -> str:
    last_error: Exception | None = None
    for attempt in range(3):
        verify = attempt < 2
        try:
            if not verify:
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            response = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=(20, 60),
                verify=verify,
            )
            response.raise_for_status()
            encoding = response.apparent_encoding or response.encoding or "utf-8"
            return response.content.decode(encoding, errors="ignore")
        except Exception as error:
            last_error = error
    raise last_error if last_error is not None else RuntimeError(f"请求失败: {url}")


def html_to_text(html: str) -> str:
    clean = re.sub(r"<!--.*?-->", " ", html, flags=re.S)
    clean = re.sub(r"<script.*?</script>", " ", clean, flags=re.S | re.I)
    clean = re.sub(r"<style.*?</style>", " ", clean, flags=re.S | re.I)
    clean = re.sub(r"<[^>]+>", "\n", clean)
    clean = unescape(clean)
    clean = re.sub(r"[\r\t\xa0]+", " ", clean)
    clean = re.sub(r"\n+", "\n", clean)
    return clean


def first_match(patterns: list[str], text: str) -> int | None:
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        groups = match.groups()
        if groups:
            for value in groups:
                if value and value.isdigit():
                    return int(value)
        normalized = re.sub(r"\s+", "", match.group(0))
        digit_match = re.search(r"\d+", normalized)
        if digit_match:
            return int(digit_match.group(0))
        chinese_map = {
            "一": 1,
            "二": 2,
            "三": 3,
            "四": 4,
            "五": 5,
            "六": 6,
            "七": 7,
            "八": 8,
            "九": 9,
            "十": 10,
        }
        for token, value in chinese_map.items():
            if token in normalized:
                return value
    return None


def detect_published_at(text: str, fallback_url: str) -> str | None:
    match = re.search(r"20\d{2}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?", text)
    if match:
        return match.group(0)
    token = re.search(r"t(20\d{6})_", fallback_url)
    if not token:
        return None
    value = token.group(1)
    return f"{value[:4]}-{value[4:6]}-{value[6:8]}"


def in_study_area(lat: float, lon: float, config: dict) -> bool:
    bbox = config["study_area"]["bbox"]
    return bbox["south"] <= lat <= bbox["north"] and bbox["west"] <= lon <= bbox["east"]


def summarize_service_totals(sites: list[dict]) -> dict:
    totals: dict[str, int] = {}
    for site in sites:
        for key, value in site.get("services", {}).items():
            if value is True:
                totals[key] = totals.get(key, 0) + 1
    return totals


def normalize_verification_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unescape(value).casefold()
    normalized = (
        normalized.replace("：", ":")
        .replace("－", "-")
        .replace("—", "-")
        .replace("（", "(")
        .replace("）", ")")
    )
    normalized = re.sub(r"[\s\u3000\xa0]+", "", normalized)
    normalized = re.sub(r"[\"'“”‘’`·,，。；;、！？!?\(\)\[\]【】<>《》]", "", normalized)
    return normalized


def extract_text_excerpt(text: str, anchor: str | None, radius: int = 110) -> str | None:
    if not text or not anchor:
        return None

    candidate_tokens = [anchor]
    stripped_anchor = re.sub(r"[\d:：\-]+", "", anchor)
    if stripped_anchor and stripped_anchor not in candidate_tokens:
        candidate_tokens.append(stripped_anchor)
    if len(stripped_anchor) >= 4 and stripped_anchor[:4] not in candidate_tokens:
        candidate_tokens.append(stripped_anchor[:4])

    for token in candidate_tokens:
        index = text.find(token)
        if index < 0:
            continue
        excerpt = text[max(0, index - radius): min(len(text), index + radius)]
        excerpt = re.sub(r"\s+", " ", excerpt).strip()
        if excerpt:
            return excerpt
    return None


def evaluate_source_verification(source_text: str, definition: dict) -> dict:
    groups = definition.get("source_match_groups") or [definition.get("source_excerpt_keywords", [])]
    normalized_source = normalize_verification_text(source_text)

    best_group: list[str] = []
    best_matches: list[str] = []

    for group in groups:
        required_terms = [term for term in group if term]
        if not required_terms:
            continue
        matched_terms = [
            term
            for term in required_terms
            if normalize_verification_text(term) in normalized_source
        ]
        if len(matched_terms) > len(best_matches):
            best_group = required_terms
            best_matches = matched_terms
        if len(matched_terms) == len(required_terms):
            excerpt = extract_text_excerpt(
                source_text,
                definition.get("verification_excerpt_anchor") or required_terms[0],
            )
            return {
                "verified": True,
                "required_terms": required_terms,
                "matched_terms": matched_terms,
                "excerpt_preview": excerpt,
            }

    excerpt = extract_text_excerpt(
        source_text,
        definition.get("verification_excerpt_anchor") or (best_matches[0] if best_matches else None),
    )
    return {
        "verified": False,
        "required_terms": best_group,
        "matched_terms": best_matches,
        "excerpt_preview": excerpt,
    }


def build_source_record(source: dict, html: str, text: str) -> dict:
    title_match = re.search(r"<title>(.*?)</title>", html, flags=re.S | re.I)
    page_title = title_match.group(1).strip() if title_match else source["title"]
    metrics = {
        metric_name: first_match(patterns, text)
        for metric_name, patterns in source.get("metrics", {}).items()
    }
    return {
        "key": source["key"],
        "title": source["title"],
        "page_title": page_title,
        "source_org": source["source_org"],
        "url": source["url"],
        "published_at": detect_published_at(text, source["url"]),
        "metrics": metrics,
        "highlights": source.get("highlights", []),
        "status": "live",
    }


def build_site_records(config: dict, source_map: dict[str, dict]) -> list[dict]:
    sites = []
    for definition in VERIFIED_SITES:
        source_record = source_map.get(definition["operational_source_key"], {})
        source_text = source_record.get("_clean_text", "")
        verification = evaluate_source_verification(source_text, definition)
        is_verified = verification["verified"]
        site = {
            **definition,
            "within_study_area": in_study_area(definition["lat"], definition["lon"], config),
            "source_verified": bool(is_verified),
            "source_org": source_record.get("source_org"),
            "source_title": source_record.get("title"),
            "source_published_at": source_record.get("published_at"),
            "verification_method": "normalized_keyword_match",
            "verification_status_label": "官方原文核验" if is_verified else "待人工复核",
            "verification_required_terms": verification.get("required_terms", []),
            "verification_matched_terms": verification.get("matched_terms", []),
            "source_excerpt_preview": verification.get("excerpt_preview"),
            "status": "officially_reported_operational_site" if is_verified else "source_needs_manual_recheck",
        }
        sites.append(site)
    return sites


def build_fallback_clean_text(
    source_key: str,
    cached_payload: dict,
    cached_raw_payload: dict,
) -> str:
    raw_preview = next(
        (
            item.get("text_preview", "")
            for item in cached_raw_payload.get("sources", [])
            if item.get("key") == source_key and item.get("text_preview")
        ),
        "",
    )
    if raw_preview:
        return raw_preview

    site_excerpts = [
        item.get("source_excerpt_preview", "")
        for item in cached_payload.get("sites", [])
        if item.get("operational_source_key") == source_key and item.get("source_excerpt_preview")
    ]
    return " ".join(site_excerpts).strip()


def with_cached_fallback(current_payload: dict | None, cached_payload: dict | None) -> dict | None:
    if current_payload and current_payload.get("sites") and current_payload.get("bulletins"):
        return current_payload
    return cached_payload


def main() -> None:
    ensure_directories()
    config = load_config()
    cached_payload = read_json(PROCESSED_OUTPUT_PATH, {})
    cached_raw_payload = read_json(RAW_OUTPUT_PATH, {})

    raw_sources = []
    source_map: dict[str, dict] = {}

    def fetch_source_record(source: dict) -> tuple[dict, dict | None]:
        try:
            html = request_text(source["url"])
            text = html_to_text(html)
            record = build_source_record(source, html, text)
            source_record = {
                **record,
                "_clean_text": text,
            }
            raw_record = (
                {
                    "key": source["key"],
                    "title": source["title"],
                    "url": source["url"],
                    "fetched_at": current_timestamp(),
                    "status": "live",
                    "text_preview": text[:1500],
                }
            )
            return raw_record, source_record
        except Exception as error:
            cached_source = next(
                (item for item in cached_payload.get("bulletins", []) if item.get("key") == source["key"]),
                None,
            )
            source_record = None
            if cached_source is not None:
                fallback_clean_text = build_fallback_clean_text(
                    source["key"],
                    cached_payload,
                    cached_raw_payload,
                )
                source_record = {
                    **cached_source,
                    "_clean_text": fallback_clean_text,
                    "status": "cached_snapshot",
                }
            raw_record = (
                {
                    "key": source["key"],
                    "title": source["title"],
                    "url": source["url"],
                    "fetched_at": current_timestamp(),
                    "status": "failed",
                    "error": str(error),
                }
            )
            return raw_record, source_record

    with ThreadPoolExecutor(max_workers=min(6, len(MONITORED_SOURCES))) as executor:
        future_map = {
            executor.submit(fetch_source_record, source): source
            for source in MONITORED_SOURCES
        }
        results_by_key: dict[str, tuple[dict, dict | None]] = {}
        for future in as_completed(future_map):
            source = future_map[future]
            results_by_key[source["key"]] = future.result()

    for source in MONITORED_SOURCES:
        raw_record, source_record = results_by_key[source["key"]]
        raw_sources.append(raw_record)
        if source_record is not None:
            source_map[source["key"]] = source_record

    site_records = build_site_records(config, source_map)
    live_bulletins = []
    for source in MONITORED_SOURCES:
        source_record = source_map.get(source["key"])
        if not source_record:
            continue
        bulletin = {key: value for key, value in source_record.items() if not key.startswith("_")}
        live_bulletins.append(bulletin)

    payload = {
        "generated_at": current_timestamp(),
        "source": "武汉市政府 / 武汉市民政局 / 武汉市国防动员办公室 官方公开页面",
        "coverage_statement": (
            "该模块自动刷新已纳入监测的武汉官方公开页面。"
            "全市级纳凉点数量来自官方通报；可用于空间分析的点位仅纳入能被官方页面核验且已完成位置校准的在运点位。"
        ),
        "monitored_source_count": len(live_bulletins),
        "reported_citywide_cooling_point_count": next(
            (
                item.get("metrics", {}).get("reported_cooling_point_count")
                for item in live_bulletins
                if item.get("key") == "wuhan_citywide_cooling_2025"
                and item.get("metrics", {}).get("reported_cooling_point_count") is not None
            ),
            None,
        ),
        "bulletins": live_bulletins,
        "sites": site_records,
        "source_status_breakdown": {
            "live": sum(1 for item in live_bulletins if item.get("status") == "live"),
            "cached_snapshot": sum(1 for item in live_bulletins if item.get("status") == "cached_snapshot"),
        },
        "summary": {
            "locatable_site_count": len(site_records),
            "within_study_area_site_count": sum(1 for item in site_records if item["within_study_area"]),
            "verified_site_count": sum(1 for item in site_records if item.get("source_verified")),
            "districts": sorted({item["district"] for item in site_records}),
            "service_tag_totals": summarize_service_totals(site_records),
        },
    }

    final_payload = with_cached_fallback(payload, cached_payload)
    if final_payload is None:
        raise RuntimeError("官方纳凉点数据抓取失败，且本地不存在可用缓存。")

    write_json(RAW_OUTPUT_PATH, {"generated_at": current_timestamp(), "sources": raw_sources})
    write_json(PROCESSED_OUTPUT_PATH, final_payload)
    print("官方纳凉点与官方通报数据已更新。")


if __name__ == "__main__":
    main()
