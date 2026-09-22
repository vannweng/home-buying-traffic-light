#!/usr/bin/env python3
"""Build a compact Zhonghe presale snapshot from New Taipei City's CSV export."""

import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

SOURCE = "https://data.ntpc.gov.tw/datasets/9238ccc2-9701-4ca7-a0a0-ebe4a0669685"
DEST = Path(__file__).resolve().parent.parent / "data" / "zhonghe-presale.json"
PING_PER_SQM_TO_WAN_PER_PING = 3.305785 / 10000


def roc_date(raw):
    raw = str(raw or "").strip()
    if not raw.isdigit() or len(raw) < 7:
        return None
    try:
        year, month, day = int(raw[:-4]) + 1911, int(raw[-4:-2]), int(raw[-2:])
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def street_of(address):
    text = address.replace("臺", "台").replace("新北市中和區", "")
    match = re.search(r"[^\d\s,，號巷弄之]+?(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?", text)
    return match.group(0) if match else ""


def make_snapshot(csv_path):
    transactions = []
    seen = set()
    with open(csv_path, newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            if row.get("district") != "中和區":
                continue
            name = (row.get("rps28") or "").strip()
            address = (row.get("rps02") or "").strip()
            when = roc_date(row.get("rps07_yyymmddroc") or row.get("rps07"))
            try:
                area = float(row.get("rps15_area") or 0) / 3.305785
                parking_area = float(row.get("rps24_area") or 0) / 3.305785
                unit_price = float(row.get("rps22_amountsunitdollars") or 0) * PING_PER_SQM_TO_WAN_PER_PING
                total_price = float(row.get("rps21_amountsunitdollars") or 0) / 10000
                parking_price = float(row.get("rps25_amountsunitdollars") or 0) / 10000
            except ValueError:
                continue
            property_type = row.get("rps11") or ""
            if not (name and address and when and 8 <= area <= 150 and 10 <= unit_price <= 300):
                continue
            if "住宅大樓" not in property_type and "華廈" not in property_type:
                continue
            if "住家" not in (row.get("rps12") or ""):
                continue
            if "解約" in (row.get("rps30") or ""):
                continue
            if (row.get("rps26") or "").strip():
                continue
            record_id = (row.get("rps27") or "").strip()
            if record_id in seen:
                continue
            seen.add(record_id)
            transactions.append({
                "id": record_id,
                "name": name,
                "address": address,
                "street": street_of(address),
                "date": when,
                "area": round(area, 2),
                "homeArea": round(area - parking_area, 2),
                "unitPrice": round(unit_price, 2),
                "totalPrice": round(total_price, 1),
                "parkingPrice": round(parking_price, 1),
                "type": "住宅大樓" if "住宅大樓" in property_type else "華廈",
                "floor": (row.get("rps09") or "").strip(),
            })
    transactions.sort(key=lambda item: (item["date"], item["id"]), reverse=True)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "source": SOURCE,
        "generatedAt": date.today().isoformat(),
        "latestTransaction": max((item["date"] for item in transactions), default=None),
        "area": "新北市中和區",
        "transactions": transactions,
    }
    DEST.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(transactions)} Zhonghe residential presale transactions to {DEST}")
    print(f"Latest transaction: {snapshot['latestTransaction']}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/update-data.py <official-presale.csv>")
    make_snapshot(sys.argv[1])
