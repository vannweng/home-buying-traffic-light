#!/usr/bin/env python3
"""Refresh official transit evidence; optionally generate one LLM summary offline."""

import argparse
import html
import json
import os
import re
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "https://www.dorts.ntpc.gov.tw/about/routeInfo/8pRG2lkJmb5z"
PROGRESS = "https://www.dorts.ntpc.gov.tw/about/routeProgress/8pRG2lkJmb5z"
STATIONS = [
    ("連城路", "萬大中和線規劃中的中和、連城錦和及中和高中站", ("LG06", "LG07", "LG08", "連城路")),
    ("莒光路", "萬大中和線規劃中的莒光站", ("LG08A", "莒光路")),
]


def fetch_text(url):
    request = urllib.request.Request(url, headers={"User-Agent": "HomeBuyingTrafficLight/1.0 (public source checker)"})
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}: {url}")
        page = response.read(2_000_000).decode("utf-8", errors="replace")
    page = re.sub(r"<(script|style)\b.*?</\1>", " ", page, flags=re.I | re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", page))


def refresh_evidence():
    text = fetch_text(SOURCE)
    items = []
    for street, title, required in STATIONS:
        if not all(word in text for word in required):
            raise RuntimeError(f"官方頁面未能驗證 {street} 站點；保留既有快照。")
        items.append({"id": f"wanda-{street}", "street": street, "title": title,
                      "status": "官方路線頁列為工程站點；請查核最新進度與通車公告",
                      "source": "新北市政府捷運工程局", "url": SOURCE, "progressUrl": PROGRESS,
                      "note": "僅為同路段線索；無基地座標，不能推算到站步行距離。"})
    path = ROOT / "data/trend-evidence.json"
    path.write_text(json.dumps({"updatedAt": date.today().isoformat(), "items": items}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return items


def generate_summary(project_name, evidence):
    endpoint = os.getenv("LLM_API_URL")
    key = os.getenv("LLM_API_KEY")
    model = os.getenv("LLM_MODEL")
    if not all((endpoint, key, model)):
        raise RuntimeError("產生 AI 摘要需設定 LLM_API_URL、LLM_API_KEY、LLM_MODEL。")
    if not endpoint.startswith("https://"):
        raise RuntimeError("LLM_API_URL 必須使用 HTTPS。")
    snapshot = json.loads((ROOT / "data/zhonghe-presale.json").read_text(encoding="utf-8"))
    rows = [{"date": row["date"], "unitPrice": row["unitPrice"]} for row in snapshot["transactions"] if row["name"] == project_name][:80]
    if not rows:
        raise RuntimeError("找不到指定建案。")
    project = next(row for row in snapshot["transactions"] if row["name"] == project_name)
    leads = [item for item in evidence if item["street"] == project["street"]]
    facts = {"project": project_name, "street": project["street"], "transactions": rows,
             "officialLeads": leads, "transactionSnapshot": snapshot["generatedAt"]}
    payload = {"model": model, "temperature": 0.2, "messages": [
        {"role": "system", "content": "你是台灣房市資料分析助理。只能使用提供的事實，不能預測漲幅、杜撰商圈或宣稱同路段即靠近車站。只回傳 JSON 物件，含 summary 與 caution 兩個繁體中文字串；摘要須包含利多與反面風險。"},
        {"role": "user", "content": json.dumps(facts, ensure_ascii=False)},
    ]}
    request = urllib.request.Request(endpoint, data=json.dumps(payload).encode(),
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        answer = json.load(response)["choices"][0]["message"]["content"].strip()
    answer = re.sub(r"^```(?:json)?\s*|\s*```$", "", answer)
    result = json.loads(answer)
    if not all(isinstance(result.get(field), str) and 20 <= len(result[field]) <= 800 for field in ("summary", "caution")):
        raise RuntimeError("LLM 輸出格式不符，未更新摘要。")
    path = ROOT / "data/trend-ai.json"
    current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"projects": {}}
    current["generatedAt"] = date.today().isoformat()
    current["projects"][project_name] = result
    path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", help="使用已設定的 LLM 生成指定建案摘要")
    args = parser.parse_args()
    evidence = refresh_evidence()
    print(f"已驗證 {len(evidence)} 條官方站點線索。")
    if args.project:
        generate_summary(args.project, evidence)
        print(f"已更新「{args.project}」AI 摘要。")
