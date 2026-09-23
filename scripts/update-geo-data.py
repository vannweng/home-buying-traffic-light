#!/usr/bin/env python3
"""Create a cached 300 m location/POI snapshot from OpenStreetMap public APIs.

Addresses are sent only when this script is deliberately run. The browser reads
the resulting local JSON file and never contacts these services itself.
"""

import json
import math
import re
import subprocess
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRANSACTIONS = ROOT / "data/zhonghe-presale.json"
DEST = ROOT / "data/zhonghe-geo.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS = "https://overpass-api.de/api/interpreter"
RADIUS_M = 300
USER_AGENT = "HomeBuyingTrafficLight/1.0"


def request_json(url, data=None):
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=90) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}: {url}")
        return json.load(response)


def queries(address):
    clean = address.replace("旁", "").replace("對面", "").replace("交叉路口", "").replace("新北市中和區新北市中和區", "新北市中和區")
    clean = re.sub(r"與(.+?)路$", "", clean)
    return [clean, re.sub(r"\d+號.*$", "", clean), "新北市中和區" + re.sub(r"^新北市中和區", "", clean)]


def geocode(address):
    for query in dict.fromkeys(queries(address)):
        params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "tw"})
        results = request_json(f"{NOMINATIM}?{params}")
        if results:
            result = results[0]
            return {"lat": round(float(result["lat"]), 7), "lon": round(float(result["lon"]), 7), "query": query, "label": result.get("display_name", "")}
        time.sleep(1.1)
    return None


def distance(a_lat, a_lon, b_lat, b_lon):
    radius = 6371000
    lat1, lat2 = math.radians(a_lat), math.radians(b_lat)
    delta_lat, delta_lon = lat2 - lat1, math.radians(b_lon - a_lon)
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def category(tags):
    if tags.get("railway") in {"station", "halt"} or tags.get("station") in {"subway", "light_rail"} or tags.get("public_transport") == "station": return "transit"
    if tags.get("shop") in {"supermarket", "convenience", "grocery"}: return "grocery"
    if tags.get("amenity") == "school": return "school"
    if tags.get("leisure") == "park": return "park"
    if tags.get("amenity") == "hospital" or tags.get("healthcare") == "hospital": return "hospital"
    if tags.get("shop") in {"mall", "department_store"}: return "mall"
    if tags.get("amenity") == "place_of_worship" or tags.get("religion") in {"buddhist", "taoist"}: return "temple"
    return None


def fetch_pois(locations):
    min_lat = min(item["lat"] for item in locations) - 0.006
    max_lat = max(item["lat"] for item in locations) + 0.006
    min_lon = min(item["lon"] for item in locations) - 0.007
    max_lon = max(item["lon"] for item in locations) + 0.007
    bbox = f'({min_lat},{min_lon},{max_lat},{max_lon})'
    query = f'''[out:json][timeout:90];(
      nwr[railway~"station|halt"]{bbox}; nwr[station~"subway|light_rail"]{bbox}; nwr[public_transport="station"]{bbox};
      nwr[shop~"supermarket|convenience|grocery|mall|department_store"]{bbox}; nwr[amenity~"school|hospital|place_of_worship"]{bbox};
      nwr[healthcare="hospital"]{bbox}; nwr[leisure="park"]{bbox};
    );out center tags;'''
    try:
        return request_json(f"{OVERPASS}?{urllib.parse.urlencode({'data': query})}").get("elements", [])
    except Exception:
        # Some public Overpass frontends intermittently reject Python's client
        # headers. curl sends the identical public bounding-box query as a
        # fallback; no property address is included here.
        result = subprocess.run(["curl", "--fail", "--silent", "--show-error", "--get", OVERPASS,
                                 "--data-urlencode", f"data={query}", "-A", USER_AGENT], capture_output=True, check=True, text=True)
        return json.loads(result.stdout).get("elements", [])


def main():
    snapshot = json.loads(TRANSACTIONS.read_text(encoding="utf-8"))
    addresses = {}
    for row in snapshot["transactions"]:
        addresses.setdefault(row["name"], row["address"])
    old = json.loads(DEST.read_text(encoding="utf-8")) if DEST.exists() else {"projects": {}}
    projects = old.get("projects", {})
    for name, address in addresses.items():
        cached = projects.get(name, {})
        if cached.get("address") == address and (isinstance(cached.get("lat"), (int, float)) or cached.get("unmatched")):
            continue
        result = geocode(address)
        if result:
            projects[name] = {"address": address, **result}
            print(f"定位：{name}")
        else:
            projects[name] = {"address": address, "unmatched": True}
            print(f"未定位：{name}")
        time.sleep(1.1)
    located = [{"name": name, **item} for name, item in projects.items() if isinstance(item.get("lat"), (int, float))]
    # Persist successful geocoding before asking the separate POI endpoint, so a
    # transient POI error never triggers another batch of address lookups.
    DEST.write_text(json.dumps({"generatedAt": date.today().isoformat(), "radiusMeters": RADIUS_M,
                                "geocoder": "OpenStreetMap Nominatim", "poiSource": "OpenStreetMap Overpass API", "projects": projects}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pois = fetch_pois(located)
    for project in located:
        nearby = {key: [] for key in ("transit", "grocery", "school", "park", "hospital", "mall", "temple")}
        for poi in pois:
            tags = poi.get("tags", {})
            kind = category(tags)
            point = poi.get("center", poi)
            if not kind or "lat" not in point or "lon" not in point:
                continue
            meters = distance(project["lat"], project["lon"], point["lat"], point["lon"])
            if meters <= RADIUS_M:
                nearby[kind].append({"name": tags.get("name:zh") or tags.get("name") or "未命名設施", "distanceMeters": round(meters), "osmType": poi.get("type"), "osmId": poi.get("id")})
        for items in nearby.values(): items.sort(key=lambda item: item["distanceMeters"])
        projects[project["name"]]["nearby"] = nearby
    output = {"generatedAt": date.today().isoformat(), "radiusMeters": RADIUS_M,
              "geocoder": "OpenStreetMap Nominatim", "poiSource": "OpenStreetMap Overpass API", "projects": projects}
    DEST.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已寫入 {len(located)} 個建案的定位與 {RADIUS_M} 公尺 POI 快照。")


if __name__ == "__main__":
    main()
