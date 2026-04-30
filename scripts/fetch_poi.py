from collections import Counter

from common import PROCESSED_DIR, RAW_DIR, current_timestamp, ensure_directories, fetch_json, load_config, write_json


OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_FALLBACKS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def build_query(config: dict) -> str:
    bbox = config["study_area"]["bbox"]
    blocks: list[str] = []
    for category in config["poi_categories"]:
        key = category["tag_key"]
        value = category["tag_value"]
        qualifiers = category.get("match_any") or [None]
        for qualifier in qualifiers:
            qualifier_text = ""
            if isinstance(qualifier, dict):
                qualifier_text = "".join(
                    f'["{extra_key}"="{extra_value}"]'
                    for extra_key, extra_value in qualifier.items()
                )
            for element_type in ("node", "way", "relation"):
                blocks.append(
                    f'{element_type}["{key}"="{value}"]{qualifier_text}({bbox["south"]},{bbox["west"]},{bbox["north"]},{bbox["east"]});'
                )
    block_text = "\n".join(blocks)
    return f"""
[out:json][timeout:90];
(
{block_text}
);
out center tags;
"""


def category_matches(tags: dict, category: dict) -> bool:
    if tags.get(category["tag_key"]) != category["tag_value"]:
        return False
    qualifiers = category.get("match_any")
    if not qualifiers:
        return True
    return any(
        all(tags.get(extra_key) == extra_value for extra_key, extra_value in qualifier.items())
        for qualifier in qualifiers
        if isinstance(qualifier, dict)
    )


def classify(tags: dict, config: dict) -> tuple[str, str]:
    for category in config["poi_categories"]:
        if category_matches(tags, category):
            return category["name"], category["label"]
    return "other", "其他"


def extract_point(element: dict) -> tuple[float | None, float | None]:
    if "lat" in element and "lon" in element:
        return element["lat"], element["lon"]
    center = element.get("center", {})
    if "lat" in center and "lon" in center:
        return center["lat"], center["lon"]
    return None, None


def build_poi_name(
    tags: dict,
    category_label: str,
    lat: float,
    lon: float,
    category_index: int,
    osm_id: int | str | None = None,
) -> str:
    for key in ("name", "official_name", "short_name"):
        value = tags.get(key)
        if value:
            return value

    district = tags.get("addr:district") or tags.get("addr:suburb") or tags.get("addr:city_district")
    street = tags.get("addr:street")
    if district and street:
        return f"OSM未命名{category_label}（{district}{street}片区）"
    if district:
        suffix = f"#{osm_id}" if osm_id else f"{category_index:02d}"
        return f"OSM未命名{category_label}（{district}·{suffix}）"
    suffix = f" #{osm_id}" if osm_id else ""
    return f"OSM未命名{category_label}{suffix}（{lat:.4f}, {lon:.4f}）"


def main() -> None:
    ensure_directories()
    config = load_config()
    query = build_query(config)
    payload = None

    for endpoint in OVERPASS_FALLBACKS:
        try:
            payload = fetch_json(
                endpoint,
                method="POST",
                data=query,
                headers={
                    "Content-Type": "text/plain; charset=utf-8",
                    "User-Agent": "reling-guard/0.1",
                },
            )
            break
        except Exception:
            continue

    if payload is None:
        raise RuntimeError("所有 Overpass 接口均请求失败。")

    poi_points = []
    counter = Counter()

    for element in payload.get("elements", []):
        tags = element.get("tags", {})
        category_name, category_label = classify(tags, config)
        lat, lon = extract_point(element)
        if lat is None or lon is None:
            continue

        counter[category_label] += 1
        poi = {
            "id": element.get("id"),
            "osm_type": element.get("type"),
            "name": build_poi_name(tags, category_label, lat, lon, counter[category_label], element.get("id")),
            "category": category_name,
            "category_label": category_label,
            "lat": lat,
            "lon": lon,
            "tags": tags,
        }
        poi_points.append(poi)

    summary = {
        "source": "OpenStreetMap / Overpass API",
        "generated_at": current_timestamp(),
        "total": len(poi_points),
        "categories": [{"name": key, "count": value} for key, value in counter.most_common()],
    }

    write_json(RAW_DIR / "osm_poi_raw.json", payload)
    write_json(PROCESSED_DIR / "poi_points.json", poi_points)
    write_json(PROCESSED_DIR / "poi_summary.json", summary)

    print("POI 数据抓取完成。")


if __name__ == "__main__":
    main()
